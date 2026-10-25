from fastapi import FastAPI, APIRouter, Depends, HTTPException, UploadFile, File, Query, Header
from fastapi.responses import Response
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, BeforeValidator, ConfigDict
from typing import Annotated, Any, Dict, List, Optional
from datetime import datetime, timezone, timedelta
from pathlib import Path
from bson import ObjectId
import os
import re
import uuid
import logging
import bcrypt
import jwt
import requests
import asyncio
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = "HS256"
TOKEN_DAYS = 30
APP_NAME = os.environ['APP_NAME']
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
storage_key: Optional[str] = None

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api = APIRouter(prefix="/api")

# ---------------------------------------------------------------- models
PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) else v)]


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[PyObjectId] = Field(default=None, alias="_id")

    @classmethod
    def from_mongo(cls, doc: dict):
        return cls.model_validate(doc)

    def to_mongo(self) -> dict:
        d = self.model_dump(by_alias=True, exclude={"id"})
        if self.id:
            d["_id"] = ObjectId(self.id)
        return d

    def out(self) -> dict:
        return self.model_dump(mode="json")


class User(BaseDocument):
    username: str
    name: str
    password_hash: str
    role: str = "user"
    created_at: str

    def out(self) -> dict:
        return {"id": self.id, "username": self.username, "name": self.name, "role": self.role}


class Registration(BaseDocument):
    type: str
    title: str
    sub_caste: str = ""
    data: Dict[str, Any] = {}
    photos: Dict[str, Any] = {}
    photo_paths: List[str] = []
    status: str = "pending"
    owner_id: PyObjectId
    owner_name: str = ""
    created_at: str
    approved_at: Optional[str] = None
    expires_at: Optional[str] = None
    reject_reason: Optional[str] = None


class Post(BaseDocument):
    kind: str  # news | event | notice
    title: str
    body: str
    level: Optional[str] = None
    location: Optional[str] = None
    event_date: Optional[str] = None
    created_at: str


class Complaint(BaseDocument):
    kind: str
    subject: str
    message: str
    owner_id: PyObjectId
    owner_name: str = ""
    status: str = "open"
    created_at: str


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def oid(v: str) -> ObjectId:
    try:
        return ObjectId(v)
    except Exception:
        raise HTTPException(404, "Not found")


# ---------------------------------------------------------------- push (Emergent managed relay)
PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")
push_client = httpx.AsyncClient(base_url=PUSH_BASE_URL, headers={"X-Push-Key": PUSH_KEY}, timeout=10.0)
_bg_tasks: set = set()  # keep references so background notification tasks aren't garbage-collected


async def send_push(recipients: List[str], data: dict, idempotency_key: Optional[str] = None, _attempt: int = 0) -> None:
    if not recipients:
        return
    if len(recipients) > 100:
        raise ValueError("max 100 recipients per /trigger call; chunk before sending")
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")
    payload: dict = {"recipients": recipients, "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    resp = await push_client.post("/api/v1/push/trigger", json=payload)
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    code = resp.json().get("code", "") if resp.headers.get("content-type", "").startswith("application/json") else ""
    if code == "idempotency_key_in_progress" and idempotency_key and _attempt < 3:
        await asyncio.sleep(3)
        return await send_push(recipients, data, idempotency_key=idempotency_key, _attempt=_attempt + 1)
    if code in ("insufficient_credits", "integration_disabled", "daily_limit_reached"):
        logger.warning(f"Push paused: {code} ({resp.status_code}): {resp.json().get('message', '')}")
        return
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()


async def _notify(recipients: List[str], data: dict, key: Optional[str]):
    # Inbox copy first, so alerts are never missed even if the push is not delivered.
    try:
        now = now_iso()
        await db.notifications.insert_many([
            {"user_id": r, "title": data["title"], "message": data["message"], "action_url": data.get("action_url"),
             "read": False, "created_at": now} for r in recipients
        ])
    except Exception as e:
        logger.warning(f"Inbox write failed: {e}")
    for i in range(0, len(recipients), 100):
        try:
            await send_push(recipients[i:i + 100], data, idempotency_key=f"{key}-{i}" if key else None)
        except Exception as e:
            logger.warning(f"Push failed (non-blocking): {e}")


def notify(recipients: List[str], title: str, message: str, action_url: Optional[str] = None, key: Optional[str] = None):
    """Fire-and-forget push; never blocks or fails the main request."""
    recipients = [r for r in dict.fromkeys(recipients) if r]
    if not recipients:
        return
    data = {"title": title, "message": message}
    if action_url:
        data["action_url"] = action_url
    task = asyncio.create_task(_notify(recipients, data, key))
    _bg_tasks.add(task)
    task.add_done_callback(_bg_tasks.discard)


async def admin_ids() -> List[str]:
    return [str(d["_id"]) for d in await db.users.find({"role": "admin"}, {"_id": 1}).to_list(50)]


async def all_user_ids() -> List[str]:
    return [str(d["_id"]) for d in await db.users.find({}, {"_id": 1}).to_list(100000)]


# ---------------------------------------------------------------- auth
class SignupIn(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=6, max_length=100)


class LoginIn(BaseModel):
    username: str
    password: str


def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def make_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": user_id, "iat": now, "exp": now + timedelta(days=TOKEN_DAYS)}, JWT_SECRET, algorithm=JWT_ALG)


async def user_from_token(token: Optional[str]) -> User:
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    doc = await db.users.find_one({"_id": oid(payload.get("sub", ""))})
    if not doc:
        raise HTTPException(401, "User not found")
    return User.from_mongo(doc)


async def current_user(authorization: Optional[str] = Header(default=None)) -> User:
    token = authorization.split(" ", 1)[1] if authorization and authorization.lower().startswith("bearer ") else None
    return await user_from_token(token)


async def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Admin only")
    return user


@api.post("/auth/signup")
async def signup(body: SignupIn):
    uname = body.username.strip().lower()
    if not re.fullmatch(r"[a-z0-9_.]+", uname):
        raise HTTPException(400, "Username may contain only letters, numbers, _ and .")
    if await db.users.find_one({"username": uname}):
        raise HTTPException(409, "Username already taken")
    user = User(username=uname, name=body.name.strip(), password_hash=hash_pw(body.password), created_at=now_iso())
    res = await db.users.insert_one(user.to_mongo())
    user.id = str(res.inserted_id)
    return {"token": make_token(user.id), "user": user.out()}


@api.post("/auth/login")
async def login(body: LoginIn):
    doc = await db.users.find_one({"username": body.username.strip().lower()})
    if not doc or not bcrypt.checkpw(body.password.encode(), doc["password_hash"].encode()):
        raise HTTPException(401, "Invalid username or password")
    user = User.from_mongo(doc)
    return {"token": make_token(user.id), "user": user.out()}


@api.get("/auth/me")
async def me(user: User = Depends(current_user)):
    return user.out()


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str
    device_token: str = Field(min_length=10)


@api.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody, user: User = Depends(current_user)):
    if body.platform not in ("android", "ios"):
        raise HTTPException(400, "platform must be android or ios")
    # Always bind the device to the authenticated user, never to a client-supplied id.
    payload = {"user_id": user.id, "platform": body.platform, "device_token": body.device_token}
    resp = await push_client.post("/api/v1/push/users/register", json=payload)
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()
    return {"status": "registered"}


# ---------------------------------------------------------------- storage
def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    global storage_key
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    if resp.status_code == 503:
        storage_key = None
        key = init_storage()
        resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    if resp.status_code == 402:
        raise HTTPException(402, "Storage credits exhausted")
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


MAX_UPLOAD = 8 * 1024 * 1024


@api.post("/upload")
async def upload(file: UploadFile = File(...), user: User = Depends(current_user)):
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "File too large (max 8 MB)")
    ctype = file.content_type or "image/jpeg"
    if not ctype.startswith("image/"):
        raise HTTPException(400, "Only images are allowed")
    ext = (file.filename or "photo.jpg").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    path = f"{APP_NAME}/uploads/{user.id}/{uuid.uuid4()}.{ext}"
    result = await run_in_threadpool(put_object, path, data, ctype)
    await db.files.insert_one({"storage_path": result["path"], "owner_id": user.id, "content_type": ctype,
                               "original_filename": file.filename, "size": len(data), "created_at": now_iso()})
    return {"path": result["path"]}


@api.get("/files/{path:path}")
async def download(path: str, token: Optional[str] = Query(default=None), authorization: Optional[str] = Header(default=None)):
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]
    user = await user_from_token(token)
    rec = await db.files.find_one({"storage_path": path})
    if not rec:
        raise HTTPException(404, "File not found")
    if rec.get("owner_id") != user.id and user.role != "admin":
        if not await db.registrations.find_one({"photo_paths": path, "status": "approved"}):
            raise HTTPException(404, "File not found")
    data, ctype = await run_in_threadpool(get_object, path)
    return Response(content=data, media_type=rec.get("content_type", ctype), headers={"Cache-Control": "private, max-age=86400"})


# ---------------------------------------------------------------- pincode
@api.get("/pincode/{pin}")
async def pincode(pin: str, user: User = Depends(current_user)):
    if not re.fullmatch(r"\d{6}", pin):
        raise HTTPException(400, "Pincode must be 6 digits")
    cached = await db.pincodes.find_one({"pin": pin}, {"_id": 0})
    if cached:
        return cached
    try:
        r = await run_in_threadpool(lambda: requests.get(f"https://api.postalpincode.in/pincode/{pin}", timeout=10,
                                                                headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"}))
        js = r.json()
    except Exception:
        raise HTTPException(503, "Pincode service unavailable")
    if not js or js[0].get("Status") != "Success" or not js[0].get("PostOffice"):
        raise HTTPException(404, "Pincode not found")
    po = js[0]["PostOffice"][0]
    taluka = po.get("Block") or po.get("Division") or ""
    if taluka in ("NA", ""):
        taluka = po.get("Division") or po.get("District") or ""
    out = {"pin": pin, "taluka": taluka, "district": po.get("District", ""), "state": po.get("State", ""),
           "areas": [p.get("Name") for p in js[0]["PostOffice"]][:20]}
    await db.pincodes.insert_one(dict(out))
    return out


# ---------------------------------------------------------------- registrations
REG_TYPES = {"member", "matrimony", "business", "social_worker"}
TYPE_LABEL = {"member": "Member", "matrimony": "Matrimony", "business": "Business", "social_worker": "Social Worker"}


class RegistrationIn(BaseModel):
    type: str
    title: str = Field(min_length=1, max_length=150)
    sub_caste: str = ""
    data: Dict[str, Any]
    photos: Dict[str, Any] = {}


def reg_out(r: Registration) -> dict:
    return r.out()


PHONE_KEYS = {
    "member": ["primary_mobile", "alternate_mobile", "whatsapp", "emergency_phone"],
    "business": ["phone1", "phone2", "whatsapp"],
    "social_worker": ["phone", "whatsapp"],
    "matrimony": [],
}
REQUIRED_PHONES = {"member": ["primary_mobile", "emergency_phone"], "business": ["phone1"], "social_worker": ["phone", "whatsapp"], "matrimony": []}


def validate_registration(body: "RegistrationIn"):
    d = body.data
    for k in PHONE_KEYS[body.type]:
        v = str(d.get(k) or "").strip()
        if not v and k in REQUIRED_PHONES[body.type]:
            raise HTTPException(400, f"{k} is required")
        if v and not re.fullmatch(r"[6-9]\d{9}", v):
            raise HTTPException(400, f"{k} must be 10 digits starting 6-9")
    pin = str(d.get("pincode") or "").strip()
    if body.type != "matrimony" and not re.fullmatch(r"\d{6}", pin):
        raise HTTPException(400, "pincode must be 6 digits")
    email = str(d.get("email") or "").strip()
    if email and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]{2,}", email):
        raise HTTPException(400, "Invalid email")
    if not body.sub_caste:
        raise HTTPException(400, "sub_caste is required")
    if body.type == "matrimony":
        try:
            dob = datetime.strptime(str(d.get("dob", "")), "%d/%m/%Y").date()
        except ValueError:
            raise HTTPException(400, "dob must be DD/MM/YYYY")
        today = datetime.now(timezone.utc).date()
        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        groom = d.get("category") == "groom" or (d.get("category") == "remarriage" and str(d.get("remarriage_gender", "")).startswith("Groom"))
        if age < (21 if groom else 18):
            raise HTTPException(400, f"{'Groom' if groom else 'Bride'} must be at least {21 if groom else 18} years old")
        for k in ("portrait", "full", "half"):
            if not (body.photos.get(k) or {}).get("path"):
                raise HTTPException(400, "3 photos are mandatory")


@api.post("/registrations")
async def create_registration(body: RegistrationIn, user: User = Depends(current_user)):
    if body.type not in REG_TYPES:
        raise HTTPException(400, "Invalid registration type")
    validate_registration(body)
    paths = [p.get("path") for p in body.photos.values() if isinstance(p, dict) and p.get("path")]
    owned = await db.files.count_documents({"storage_path": {"$in": paths}, "owner_id": user.id})
    if owned != len(paths):
        raise HTTPException(400, "Invalid photo reference")
    reg = Registration(type=body.type, title=body.title.strip(), sub_caste=body.sub_caste, data=body.data,
                       photos=body.photos, photo_paths=paths, owner_id=user.id, owner_name=user.name, created_at=now_iso())
    res = await db.registrations.insert_one(reg.to_mongo())
    reg.id = str(res.inserted_id)
    notify([a for a in await admin_ids() if a != user.id], "New submission / नवीन अर्ज",
           f"{reg.title} ({TYPE_LABEL[reg.type]}) is waiting for approval", f"/detail/{reg.id}", f"sub-{reg.id}")
    return reg_out(reg)


@api.get("/registrations")
async def list_registrations(type: str, q: str = "", sub_caste: str = "", category: str = "", user: User = Depends(current_user)):
    query: Dict[str, Any] = {"type": type, "status": "approved"}
    if type == "matrimony":
        query["expires_at"] = {"$gt": now_iso()}
        if category:
            query["data.category"] = category
    if sub_caste:
        query["sub_caste"] = sub_caste
    if q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"title": rx}, {"data.district": rx}, {"data.city_district": rx}, {"data.taluka": rx},
                        {"data.operating_area": rx}, {"data.work_location": rx}, {"data.category_business": rx},
                        {"data.specialization": rx}]
    docs = await db.registrations.find(query).sort("approved_at", -1).to_list(500)
    return [reg_out(Registration.from_mongo(d)) for d in docs]


@api.get("/registrations/mine")
async def my_registrations(user: User = Depends(current_user)):
    docs = await db.registrations.find({"owner_id": user.id}).sort("created_at", -1).to_list(500)
    return [reg_out(Registration.from_mongo(d)) for d in docs]


@api.get("/registrations/{rid}")
async def get_registration(rid: str, user: User = Depends(current_user)):
    doc = await db.registrations.find_one({"_id": oid(rid)})
    if not doc:
        raise HTTPException(404, "Not found")
    reg = Registration.from_mongo(doc)
    if reg.status != "approved" and reg.owner_id != user.id and user.role != "admin":
        raise HTTPException(404, "Not found")
    return reg_out(reg)


class RejectIn(BaseModel):
    reason: str = ""


@api.get("/admin/registrations")
async def admin_list(status: str = "pending", type: str = "", admin: User = Depends(require_admin)):
    query: Dict[str, Any] = {"status": status}
    if type:
        query["type"] = type
    docs = await db.registrations.find(query).sort("created_at", -1).to_list(500)
    return [reg_out(Registration.from_mongo(d)) for d in docs]


@api.get("/admin/stats")
async def admin_stats(admin: User = Depends(require_admin)):
    out = {}
    for t in REG_TYPES:
        out[t] = await db.registrations.count_documents({"type": t, "status": "pending"})
    out["complaints"] = await db.complaints.count_documents({"status": "open"})
    return out


@api.post("/admin/registrations/{rid}/approve")
async def approve(rid: str, admin: User = Depends(require_admin)):
    doc = await db.registrations.find_one({"_id": oid(rid)})
    if not doc:
        raise HTTPException(404, "Not found")
    now = datetime.now(timezone.utc)
    upd = {"status": "approved", "approved_at": now.isoformat(), "reject_reason": None}
    if doc["type"] == "matrimony":
        upd["expires_at"] = (now + timedelta(days=365)).isoformat()
    await db.registrations.update_one({"_id": doc["_id"]}, {"$set": upd})
    notify([str(doc["owner_id"])], "Approved / मंजूर ✅",
           f"Your {TYPE_LABEL[doc['type']]} entry \"{doc['title']}\" is now live", f"/detail/{rid}", f"appr-{rid}-{upd['approved_at']}")
    return reg_out(Registration.from_mongo({**doc, **upd}))


@api.post("/admin/registrations/{rid}/reject")
async def reject(rid: str, body: RejectIn, admin: User = Depends(require_admin)):
    doc = await db.registrations.find_one({"_id": oid(rid)})
    if not doc:
        raise HTTPException(404, "Not found")
    upd = {"status": "rejected", "reject_reason": body.reason}
    await db.registrations.update_one({"_id": doc["_id"]}, {"$set": upd})
    msg = f"Your {TYPE_LABEL[doc['type']]} entry \"{doc['title']}\" was not approved"
    notify([str(doc["owner_id"])], "Not approved / नामंजूर", msg + (f": {body.reason}" if body.reason else ""), f"/detail/{rid}")
    return reg_out(Registration.from_mongo({**doc, **upd}))


@api.delete("/admin/registrations/{rid}")
async def remove_registration(rid: str, admin: User = Depends(require_admin)):
    res = await db.registrations.delete_one({"_id": oid(rid)})
    if not res.deleted_count:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ---------------------------------------------------------------- posts (news / events / notices)
class PostIn(BaseModel):
    kind: str
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=5000)
    level: Optional[str] = None
    location: Optional[str] = None
    event_date: Optional[str] = None


@api.get("/posts")
async def list_posts(kind: str, level: str = "", user: User = Depends(current_user)):
    query: Dict[str, Any] = {"kind": kind}
    if level:
        query["level"] = level
    docs = await db.posts.find(query).sort("created_at", -1).to_list(300)
    return [Post.from_mongo(d).out() for d in docs]


@api.post("/admin/posts")
async def create_post(body: PostIn, admin: User = Depends(require_admin)):
    if body.kind not in {"news", "event", "notice"}:
        raise HTTPException(400, "Invalid kind")
    if body.kind == "news" and body.level not in {"village", "taluka", "district", "state"}:
        raise HTTPException(400, "News needs a level")
    post = Post(**body.model_dump(), created_at=now_iso())
    res = await db.posts.insert_one(post.to_mongo())
    post.id = str(res.inserted_id)
    heading = {"news": "News / बातमी", "event": "Event / कार्यक्रम", "notice": "Notice / सूचना"}[post.kind]
    route = {"news": "/news", "event": "/events", "notice": "/events?tab=1"}[post.kind]
    notify([u for u in await all_user_ids() if u != admin.id], f"{heading}: {post.title}"[:120], post.body[:180], route, f"post-{post.id}")
    return post.out()


@api.delete("/admin/posts/{pid}")
async def delete_post(pid: str, admin: User = Depends(require_admin)):
    res = await db.posts.delete_one({"_id": oid(pid)})
    if not res.deleted_count:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ---------------------------------------------------------------- rules / emergency (settings)
DEFAULT_RULES = """१. संस्थेचे नाव / Name of the Sanstha
सोनार शेहबंध समाज संस्था / Sonar Shehbandh Samaj Sanstha.

२. उद्दिष्टे / Objectives
समाजाचे शैक्षणिक, सामाजिक व आर्थिक उन्नयन करणे. To promote the educational, social and economic upliftment of the Sonar community.

३. सभासदत्व / Membership
सोनार समाजातील १८ वर्षांवरील कोणतीही व्यक्ती सभासद होऊ शकते. Any person of Sonar Samaj above 18 years may become a member.

४. सर्वसाधारण सभा / General Body Meeting
वर्षातून किमान एकदा सर्वसाधारण सभा घेतली जाईल. A general body meeting shall be held at least once a year.

५. कार्यकारी मंडळ / Executive Committee
कार्यकारी मंडळाची निवड दर ३ वर्षांनी होईल. The executive committee shall be elected every 3 years.

६. आर्थिक व्यवहार / Finance
सर्व आर्थिक व्यवहार संस्थेच्या बँक खात्यातून होतील व वार्षिक लेखापरीक्षण केले जाईल. All transactions go through the Sanstha bank account and are audited annually.

७. शिस्त / Discipline
समाजाच्या हिताविरुद्ध वर्तन केल्यास सभासदत्व रद्द केले जाऊ शकते. Membership may be cancelled for conduct against community interest."""

DEFAULT_EMERGENCY = [
    {"name": "Police / पोलीस", "number": "100", "group": "Government"},
    {"name": "Ambulance / रुग्णवाहिका", "number": "108", "group": "Government"},
    {"name": "Fire Brigade / अग्निशमन", "number": "101", "group": "Government"},
    {"name": "National Emergency / राष्ट्रीय आपत्कालीन", "number": "112", "group": "Government"},
    {"name": "Women Helpline / महिला हेल्पलाईन", "number": "1091", "group": "Government"},
    {"name": "Blood Bank Helpline / रक्तपेढी", "number": "1910", "group": "Medical"},
    {"name": "Disaster Management / आपत्ती व्यवस्थापन", "number": "1077", "group": "Government"},
    {"name": "Samaj Helpline (Sample) / समाज हेल्पलाईन", "number": "9800000000", "group": "Community"},
]


async def get_setting(key: str, default):
    doc = await db.settings.find_one({"key": key})
    return doc["value"] if doc else default


@api.get("/rules")
async def rules(user: User = Depends(current_user)):
    return {"text": await get_setting("rules", DEFAULT_RULES)}


class RulesIn(BaseModel):
    text: str = Field(min_length=1, max_length=30000)


@api.put("/admin/rules")
async def update_rules(body: RulesIn, admin: User = Depends(require_admin)):
    await db.settings.update_one({"key": "rules"}, {"$set": {"value": body.text}}, upsert=True)
    return {"text": body.text}


class EmergencyItem(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    number: str = Field(min_length=2, max_length=20)
    group: str = "Community"


class EmergencyIn(BaseModel):
    items: List[EmergencyItem]


@api.get("/emergency")
async def emergency(user: User = Depends(current_user)):
    return {"items": await get_setting("emergency", DEFAULT_EMERGENCY)}


@api.put("/admin/emergency")
async def update_emergency(body: EmergencyIn, admin: User = Depends(require_admin)):
    items = [i.model_dump() for i in body.items]
    await db.settings.update_one({"key": "emergency"}, {"$set": {"value": items}}, upsert=True)
    return {"items": items}


# ---------------------------------------------------------------- complaints
class ComplaintIn(BaseModel):
    kind: str = Field(pattern="^(complaint|suggestion)$")
    subject: str = Field(min_length=1, max_length=150)
    message: str = Field(min_length=1, max_length=2000)


@api.post("/complaints")
async def create_complaint(body: ComplaintIn, user: User = Depends(current_user)):
    c = Complaint(**body.model_dump(), owner_id=user.id, owner_name=user.name, created_at=now_iso())
    res = await db.complaints.insert_one(c.to_mongo())
    c.id = str(res.inserted_id)
    notify([a for a in await admin_ids() if a != user.id], f"New {c.kind} / नवीन {'तक्रार' if c.kind == 'complaint' else 'सूचना'}",
           f"{c.subject} — from {user.name}"[:180], "/admin?tab=complaints", f"cmp-{c.id}")
    return c.out()


@api.get("/complaints/mine")
async def my_complaints(user: User = Depends(current_user)):
    docs = await db.complaints.find({"owner_id": user.id}).sort("created_at", -1).to_list(200)
    return [Complaint.from_mongo(d).out() for d in docs]


@api.get("/admin/complaints")
async def admin_complaints(admin: User = Depends(require_admin)):
    docs = await db.complaints.find({}).sort("created_at", -1).to_list(500)
    return [Complaint.from_mongo(d).out() for d in docs]


@api.post("/admin/complaints/{cid}/resolve")
async def resolve_complaint(cid: str, admin: User = Depends(require_admin)):
    res = await db.complaints.update_one({"_id": oid(cid)}, {"$set": {"status": "resolved"}})
    if not res.matched_count:
        raise HTTPException(404, "Not found")
    return {"ok": True}


class Notification(BaseDocument):
    user_id: str
    title: str
    message: str
    action_url: Optional[str] = None
    read: bool = False
    created_at: str


@api.get("/notifications")
async def my_notifications(user: User = Depends(current_user)):
    docs = await db.notifications.find({"user_id": user.id}).sort("created_at", -1).to_list(200)
    return [Notification.from_mongo(d).out() for d in docs]


@api.get("/notifications/unread-count")
async def unread_count(user: User = Depends(current_user)):
    return {"count": await db.notifications.count_documents({"user_id": user.id, "read": False})}


@api.post("/notifications/read-all")
async def read_all(user: User = Depends(current_user)):
    await db.notifications.update_many({"user_id": user.id, "read": False}, {"$set": {"read": True}})
    return {"ok": True}


@api.post("/notifications/{nid}/read")
async def read_one(nid: str, user: User = Depends(current_user)):
    res = await db.notifications.update_one({"_id": oid(nid), "user_id": user.id}, {"$set": {"read": True}})
    if not res.matched_count:
        raise HTTPException(404, "Not found")
    return {"ok": True}


app.include_router(api)

app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    await db.users.create_index("username", unique=True)
    await db.registrations.create_index([("type", 1), ("status", 1)])
    await db.files.create_index("storage_path")
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    uname = os.environ["ADMIN_USERNAME"].lower()
    existing = await db.users.find_one({"username": uname})
    if not existing:
        admin = User(username=uname, name="Committee Admin", password_hash=hash_pw(os.environ["ADMIN_PASSWORD"]),
                     role="admin", created_at=now_iso())
        await db.users.insert_one(admin.to_mongo())
    elif not bcrypt.checkpw(os.environ["ADMIN_PASSWORD"].encode(), existing["password_hash"].encode()) or existing.get("role") != "admin":
        await db.users.update_one({"_id": existing["_id"]}, {"$set": {"password_hash": hash_pw(os.environ["ADMIN_PASSWORD"]), "role": "admin"}})
    try:
        await run_in_threadpool(init_storage)
        logger.info("Storage initialised")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
