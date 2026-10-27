from fastapi import FastAPI, APIRouter, Depends, HTTPException, UploadFile, File, Query, Header
from fastapi.responses import Response
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone, timedelta
from pathlib import Path
import os
import re
import uuid
import logging
import bcrypt
import jwt
import requests
import asyncio
import httpx
import asyncpg

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import database as pg  # noqa: E402
import storage  # noqa: E402
import payments  # noqa: E402

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = "HS256"
TOKEN_DAYS = 30
APP_NAME = os.environ['APP_NAME']

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api = APIRouter(prefix="/api")

# ---------------------------------------------------------------- models
class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[str] = None

    @classmethod
    def from_row(cls, row: dict):
        return cls.model_validate(row)

    def out(self) -> dict:
        return self.model_dump(mode="json")


class User(BaseDocument):
    username: str
    name: str
    password_hash: str
    role: str = "user"
    created_at: str
    token_version: int = 0

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
    owner_id: str
    owner_name: str = ""
    created_at: str
    approved_at: Optional[str] = None
    expires_at: Optional[str] = None
    reject_reason: Optional[str] = None
    featured: bool = False
    locked: bool = False


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
    owner_id: str
    owner_name: str = ""
    status: str = "open"
    created_at: str


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
        ts = pg.now()
        await pg.executemany(
            "insert into sonar.notifications (id, user_id, title, message, action_url, read, created_at) "
            "values ($1, $2, $3, $4, $5, false, $6)",
            [(pg.new_id(), r, data["title"], data["message"], data.get("action_url"), ts) for r in recipients],
        )
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
    return [r["id"] for r in await pg.fetch("select id from sonar.users where role = 'admin'")]


async def all_user_ids() -> List[str]:
    return [r["id"] for r in await pg.fetch("select id from sonar.users")]


# ---------------------------------------------------------------- auth
MAX_PW_BYTES = 72  # bcrypt only uses the first 72 bytes; reject longer instead of silently truncating
MAX_FAILED_LOGINS = 5
LOCK_MINUTES = 15
FILE_TOKEN_MINUTES = 60
DUMMY_HASH = bcrypt.hashpw(b"dummy-password", bcrypt.gensalt()).decode()


def check_pw_len(p: str) -> str:
    if len(p.encode("utf-8")) > MAX_PW_BYTES:
        raise ValueError("Password is too long (max 72 English letters, fewer for Marathi) / पासवर्ड खूप लांब आहे")
    return p


class SignupIn(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=6, max_length=200)

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return check_pw_len(v)


class LoginIn(BaseModel):
    username: str = Field(max_length=60)
    password: str = Field(max_length=200)


def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def make_token(user_id: str, token_version: int = 0, scope: str = "api", minutes: Optional[int] = None) -> str:
    now = datetime.now(timezone.utc)
    exp = now + (timedelta(minutes=minutes) if minutes else timedelta(days=TOKEN_DAYS))
    return jwt.encode({"sub": user_id, "tv": token_version, "scope": scope, "iat": now, "exp": exp}, JWT_SECRET, algorithm=JWT_ALG)


async def user_from_token(token: Optional[str], scope: str = "api") -> User:
    """Validates signature, expiry, scope and token_version (bumped on logout to revoke old tokens)."""
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG], options={"require": ["sub", "exp", "tv"]})
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    if payload.get("scope", "api") != scope:
        raise HTTPException(401, "Invalid token for this request")
    row = await pg.fetchrow("select * from sonar.users where id = $1", str(payload.get("sub", "")))
    if not row or row.get("token_version", 0) != payload.get("tv"):
        raise HTTPException(401, "Session expired, please log in again")
    return User.from_row(row)


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
    try:
        row = await pg.fetchrow(
            "insert into sonar.users (id, username, name, password_hash, role, created_at) "
            "values ($1, $2, $3, $4, 'user', $5) returning *",
            pg.new_id(), uname, body.name.strip(), hash_pw(body.password), pg.now())
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, "Username already taken")
    user = User.from_row(row)
    return {"token": make_token(user.id, row["token_version"]), "user": user.out()}


@api.post("/auth/login")
async def login(body: LoginIn):
    pw = body.password.encode()
    row = await pg.fetchrow("select * from sonar.users where username = $1", body.username.strip().lower())
    if not row:
        await run_in_threadpool(bcrypt.checkpw, pw[:MAX_PW_BYTES], DUMMY_HASH.encode())  # same timing as a real check
        raise HTTPException(401, "Invalid username or password")
    if row["locked_until"] and datetime.fromisoformat(row["locked_until"]) > datetime.now(timezone.utc):
        left = max(1, int((datetime.fromisoformat(row["locked_until"]) - datetime.now(timezone.utc)).total_seconds() // 60) + 1)
        raise HTTPException(429, f"Too many wrong attempts. Try again in {left} minute{'s' if left > 1 else ''}. / खूप चुकीचे प्रयत्न, थोड्या वेळाने प्रयत्न करा.")
    ok = len(pw) <= MAX_PW_BYTES and await run_in_threadpool(bcrypt.checkpw, pw, row["password_hash"].encode())
    if not ok:
        # Atomic counter; locks the account for LOCK_MINUTES after MAX_FAILED_LOGINS wrong passwords.
        # An expired lock starts a fresh count, so one more mistake doesn't re-lock immediately.
        await pg.execute(
            "update sonar.users set "
            "failed_login_attempts = case when locked_until is not null and locked_until <= now() then 1 else failed_login_attempts + 1 end, "
            "locked_until = case when (case when locked_until is not null and locked_until <= now() then 1 else failed_login_attempts + 1 end) >= $2 "
            "then now() + make_interval(mins => $3) else null end "
            "where id = $1", row["id"], MAX_FAILED_LOGINS, LOCK_MINUTES)
        raise HTTPException(401, "Invalid username or password")
    if row["failed_login_attempts"] or row["locked_until"]:
        await pg.execute("update sonar.users set failed_login_attempts = 0, locked_until = null where id = $1", row["id"])
    user = User.from_row(row)
    return {"token": make_token(user.id, row["token_version"]), "user": user.out()}


@api.post("/auth/logout")
async def logout(user: User = Depends(current_user)):
    # Revokes every token issued to this user (all devices).
    await pg.execute("update sonar.users set token_version = token_version + 1 where id = $1", user.id)
    return {"ok": True}


@api.get("/auth/me")
async def me(user: User = Depends(current_user)):
    return user.out()


@api.get("/auth/file-token")
async def file_token(user: User = Depends(current_user)):
    """Short-lived token that can only download photos (used in web image URLs instead of the login token)."""
    return {"token": make_token(user.id, user.token_version, scope="files", minutes=FILE_TOKEN_MINUTES),
            "expires_in": FILE_TOKEN_MINUTES * 60}


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


# ---------------------------------------------------------------- storage (Supabase, private bucket)
MAX_UPLOAD = storage.MAX_BYTES


@api.post("/upload")
async def upload(file: UploadFile = File(...), user: User = Depends(current_user)):
    data = await file.read(MAX_UPLOAD + 1)
    if not data:
        raise HTTPException(400, "Empty file")
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "File too large (max 8 MB)")
    ctype = file.content_type or "image/jpeg"
    if ctype not in storage.ALLOWED_TYPES:
        raise HTTPException(400, "Only JPEG, PNG, WebP or HEIC images are allowed")
    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif"}[ctype]
    path = f"{APP_NAME}/uploads/{user.id}/{uuid.uuid4()}.{ext}"
    try:
        await run_in_threadpool(storage.put_object, path, data, ctype)
    except Exception as e:
        logger.error(f"Supabase upload failed: {e}")
        raise HTTPException(502, "Photo storage failed, please try again")
    try:
        await pg.execute(
            "insert into sonar.files (id, storage_path, owner_id, content_type, original_filename, size, created_at) "
            "values ($1, $2, $3, $4, $5, $6, $7)",
            pg.new_id(), path, user.id, ctype, file.filename, len(data), pg.now())
    except Exception:
        await run_in_threadpool(lambda: storage.client().storage.from_(storage.BUCKET).remove([path]))
        raise HTTPException(502, "Photo storage failed, please try again")
    return {"path": path}


@api.get("/files/{path:path}")
async def download(path: str, token: Optional[str] = Query(default=None), authorization: Optional[str] = Header(default=None)):
    # Header = normal login token (native). Query = short-lived photo-only token from /auth/file-token (web).
    if authorization and authorization.lower().startswith("bearer "):
        user = await user_from_token(authorization.split(" ", 1)[1])
    else:
        user = await user_from_token(token, scope="files")
    rec = await pg.fetchrow("select * from sonar.files where storage_path = $1", path)
    if not rec:
        raise HTTPException(404, "File not found")
    if rec["owner_id"] != user.id and user.role != "admin":
        regs = await pg.fetch("select type, photos from sonar.registrations where photo_paths @> array[$1]::text[] and status = 'approved'", path)
        if not regs:
            raise HTTPException(404, "File not found")
        # Free users only see the matrimony portrait; full/half photos need a plan.
        public = any(r["type"] != "matrimony" or ((r["photos"] or {}).get("portrait") or {}).get("path") == path for r in regs)
        if not public and await payments.active_rank(user.id) < 1:
            raise HTTPException(403, "A plan is needed to view this photo")
    try:
        data = await run_in_threadpool(storage.get_object, path)
    except Exception:
        raise HTTPException(404, "File not found")
    return Response(content=data, media_type=rec["content_type"], headers={"Cache-Control": "private, max-age=86400"})


# ---------------------------------------------------------------- pincode
@api.get("/pincode/{pin}")
async def pincode(pin: str, user: User = Depends(current_user)):
    if not re.fullmatch(r"\d{6}", pin):
        raise HTTPException(400, "Pincode must be 6 digits")
    cached = await pg.fetchrow("select pin, taluka, district, state, areas from sonar.pincodes where pin = $1", pin)
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
    await pg.execute("insert into sonar.pincodes (pin, taluka, district, state, areas) values ($1, $2, $3, $4, $5) "
                     "on conflict (pin) do nothing", pin, out["taluka"], out["district"], out["state"], out["areas"])
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
    owned = await pg.fetchval("select count(*) from sonar.files where storage_path = any($1::text[]) and owner_id = $2", paths, user.id)
    if owned != len(set(paths)):
        raise HTTPException(400, "Invalid photo reference")
    row = await pg.fetchrow(
        "insert into sonar.registrations (id, type, title, sub_caste, data, photos, photo_paths, status, owner_id, owner_name, created_at) "
        "values ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10) returning *",
        pg.new_id(), body.type, body.title.strip(), body.sub_caste, body.data, body.photos, paths, user.id, user.name, pg.now())
    reg = Registration.from_row(row)
    notify([a for a in await admin_ids() if a != user.id], "New submission / नवीन अर्ज",
           f"{reg.title} ({TYPE_LABEL[reg.type]}) is waiting for approval", f"/detail/{reg.id}", f"sub-{reg.id}")
    return reg_out(reg)


SEARCH_KEYS = ["district", "city_district", "taluka", "operating_area", "work_location", "category_business", "specialization"]


@api.get("/registrations")
async def list_registrations(type: str, q: str = "", sub_caste: str = "", category: str = "", user: User = Depends(current_user)):
    conds, args = ["type = $1", "status = 'approved'"], [type]
    if type == "matrimony":
        conds.append("expires_at > now()")
        if category:
            args.append(category)
            conds.append(f"data->>'category' = ${len(args)}")
    if sub_caste:
        args.append(sub_caste)
        conds.append(f"sub_caste = ${len(args)}")
    if q.strip():
        args.append(pg.like(q.strip()))
        n = len(args)
        fields = ["title"] + [f"data->>'{k}'" for k in SEARCH_KEYS]
        conds.append("(" + " or ".join(f"{f} ilike ${n}" for f in fields) + ")")
    rows = await pg.fetch(f"select * from sonar.registrations where {' and '.join(conds)} "
                          "order by approved_at desc nulls last limit 500", *args)
    regs = [Registration.from_row(r) for r in rows]
    # Paid plans: Business Pro+ features businesses, Samaj Patron features matrimony profiles.
    need = {"business": 2, "matrimony": 3}.get(type)
    if need:
        ranks = await payments.ranks_for([r.owner_id for r in regs])
        for r in regs:
            r.featured = ranks.get(r.owner_id, 0) >= need
        regs.sort(key=lambda r: not r.featured)
    if type in ("matrimony", "business") and user.role != "admin" and await payments.active_rank(user.id) < 1:
        for r in regs:
            if r.owner_id != user.id:
                lock_reg(r)
    return [reg_out(r) for r in regs]


@api.get("/registrations/mine")
async def my_registrations(user: User = Depends(current_user)):
    rows = await pg.fetch("select * from sonar.registrations where owner_id = $1 order by created_at desc limit 500", user.id)
    return [reg_out(Registration.from_row(r)) for r in rows]


@api.get("/registrations/{rid}")
async def get_registration(rid: str, user: User = Depends(current_user)):
    row = await pg.fetchrow("select * from sonar.registrations where id = $1", rid)
    if not row:
        raise HTTPException(404, "Not found")
    reg = Registration.from_row(row)
    if reg.status != "approved" and reg.owner_id != user.id and user.role != "admin":
        raise HTTPException(404, "Not found")
    # Full matrimony biodata and business contacts need any paid plan (owner and admins always see everything).
    if reg.type in ("matrimony", "business") and reg.owner_id != user.id and user.role != "admin" and await payments.active_rank(user.id) < 1:
        lock_reg(reg)
    return reg_out(reg)


MATRIMONY_PUBLIC_KEYS = {"category", "remarriage_gender", "full_name", "sub_caste", "dob", "height", "complexion",
                         "rashi", "qualification", "occupation_type", "work_location"}
BUSINESS_PRIVATE_KEYS = {"phone1", "phone2", "whatsapp", "email"}


def lock_reg(r: Registration) -> None:
    """Strips paid-only fields for users without an active plan."""
    if r.type == "matrimony":
        r.data = {k: v for k, v in r.data.items() if k in MATRIMONY_PUBLIC_KEYS}
        r.photos = {k: v for k, v in r.photos.items() if k == "portrait"}
        r.photo_paths = [p.get("path") for p in r.photos.values() if isinstance(p, dict) and p.get("path")]
    else:
        r.data = {k: v for k, v in r.data.items() if k not in BUSINESS_PRIVATE_KEYS}
    r.locked = True


class RejectIn(BaseModel):
    reason: str = ""


@api.get("/admin/registrations")
async def admin_list(status: str = "pending", type: str = "", admin: User = Depends(require_admin)):
    if type:
        rows = await pg.fetch("select * from sonar.registrations where status = $1 and type = $2 order by created_at desc limit 500", status, type)
    else:
        rows = await pg.fetch("select * from sonar.registrations where status = $1 order by created_at desc limit 500", status)
    return [reg_out(Registration.from_row(r)) for r in rows]


@api.get("/admin/stats")
async def admin_stats(admin: User = Depends(require_admin)):
    out = {t: 0 for t in REG_TYPES}
    for r in await pg.fetch("select type, count(*) as n from sonar.registrations where status = 'pending' group by type"):
        out[r["type"]] = r["n"]
    out["complaints"] = await pg.fetchval("select count(*) from sonar.complaints where status = 'open'")
    return out


@api.post("/admin/registrations/{rid}/approve")
async def approve(rid: str, admin: User = Depends(require_admin)):
    ts = pg.now()
    row = await pg.fetchrow(
        "update sonar.registrations set status = 'approved', approved_at = $2, reject_reason = null, "
        "expires_at = case when type = 'matrimony' then $3 else expires_at end where id = $1 returning *",
        rid, ts, ts + timedelta(days=365))
    if not row:
        raise HTTPException(404, "Not found")
    reg = Registration.from_row(row)
    notify([reg.owner_id], "Approved / मंजूर ✅",
           f"Your {TYPE_LABEL[reg.type]} entry \"{reg.title}\" is now live", f"/detail/{rid}", f"appr-{rid}-{reg.approved_at}")
    return reg_out(reg)


@api.post("/admin/registrations/{rid}/reject")
async def reject(rid: str, body: RejectIn, admin: User = Depends(require_admin)):
    row = await pg.fetchrow("update sonar.registrations set status = 'rejected', reject_reason = $2 where id = $1 returning *",
                            rid, body.reason)
    if not row:
        raise HTTPException(404, "Not found")
    reg = Registration.from_row(row)
    msg = f"Your {TYPE_LABEL[reg.type]} entry \"{reg.title}\" was not approved"
    notify([reg.owner_id], "Not approved / नामंजूर", msg + (f": {body.reason}" if body.reason else ""), f"/detail/{rid}")
    return reg_out(reg)


@api.delete("/admin/registrations/{rid}")
async def remove_registration(rid: str, admin: User = Depends(require_admin)):
    row = await pg.fetchrow("delete from sonar.registrations where id = $1 returning photo_paths", rid)
    if not row:
        raise HTTPException(404, "Not found")
    paths = row["photo_paths"] or []
    if paths:
        try:
            await run_in_threadpool(lambda: storage.client().storage.from_(storage.BUCKET).remove(paths))
            await pg.execute("delete from sonar.files where storage_path = any($1::text[])", paths)
        except Exception as e:
            logger.warning(f"Photo cleanup failed (non-blocking): {e}")
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
    if level:
        rows = await pg.fetch("select * from sonar.posts where kind = $1 and level = $2 order by created_at desc limit 300", kind, level)
    else:
        rows = await pg.fetch("select * from sonar.posts where kind = $1 order by created_at desc limit 300", kind)
    return [Post.from_row(r).out() for r in rows]


@api.post("/admin/posts")
async def create_post(body: PostIn, admin: User = Depends(require_admin)):
    if body.kind not in {"news", "event", "notice"}:
        raise HTTPException(400, "Invalid kind")
    if body.level is not None and body.level not in {"village", "taluka", "district", "state"}:
        raise HTTPException(400, "Invalid level")
    row = await pg.fetchrow(
        "insert into sonar.posts (id, kind, title, body, level, location, event_date, created_at) "
        "values ($1, $2, $3, $4, $5, $6, $7, $8) returning *",
        pg.new_id(), body.kind, body.title, body.body, body.level, body.location, body.event_date, pg.now())
    post = Post.from_row(row)
    heading = {"news": "News / बातमी", "event": "Event / कार्यक्रम", "notice": "Notice / सूचना"}[post.kind]
    route = {"news": "/news", "event": "/events", "notice": "/events?tab=1"}[post.kind]
    notify([u for u in await all_user_ids() if u != admin.id], f"{heading}: {post.title}"[:120], post.body[:180], route, f"post-{post.id}")
    return post.out()


@api.get("/posts/{pid}")
async def get_post(pid: str, user: User = Depends(current_user)):
    row = await pg.fetchrow("select * from sonar.posts where id = $1", pid)
    if not row:
        raise HTTPException(404, "Not found")
    return Post.from_row(row).out()


# ---------------------------------------------------------------- matrimony shortlist
FREE_SHORTLIST_LIMIT = 5
@api.get("/shortlist")
async def my_shortlist(user: User = Depends(current_user)):
    rows = await pg.fetch("select registration_id from sonar.shortlists where user_id = $1 order by created_at desc", user.id)
    return {"ids": [r["registration_id"] for r in rows]}


@api.post("/shortlist/{rid}")
async def toggle_shortlist(rid: str, user: User = Depends(current_user)):
    if await pg.execute("delete from sonar.shortlists where user_id = $1 and registration_id = $2", user.id, rid):
        return {"shortlisted": False}
    ok = await pg.fetchval("select 1 from sonar.registrations where id = $1 and type = 'matrimony' and status = 'approved'", rid)
    if not ok:
        raise HTTPException(404, "Profile not found")
    if await payments.active_rank(user.id) < 1 and user.role != "admin":
        if await pg.fetchval("select count(*) from sonar.shortlists where user_id = $1", user.id) >= FREE_SHORTLIST_LIMIT:
            raise HTTPException(402, f"Free members can shortlist up to {FREE_SHORTLIST_LIMIT} profiles. Get Matrimony Plus for unlimited.")
    await pg.execute("insert into sonar.shortlists (user_id, registration_id, created_at) values ($1, $2, $3) on conflict do nothing",
                     user.id, rid, pg.now())
    return {"shortlisted": True}


@api.delete("/admin/posts/{pid}")
async def delete_post(pid: str, admin: User = Depends(require_admin)):
    if not await pg.execute("delete from sonar.posts where id = $1", pid):
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
    val = await pg.fetchval("select value from sonar.settings where key = $1", key)
    return default if val is None else val


async def put_setting(key: str, value):
    await pg.execute("insert into sonar.settings (key, value) values ($1, $2) "
                     "on conflict (key) do update set value = excluded.value", key, value)


@api.get("/rules")
async def rules(user: User = Depends(current_user)):
    return {"text": await get_setting("rules", DEFAULT_RULES)}


class RulesIn(BaseModel):
    text: str = Field(min_length=1, max_length=30000)


@api.put("/admin/rules")
async def update_rules(body: RulesIn, admin: User = Depends(require_admin)):
    await put_setting("rules", body.text)
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
    await put_setting("emergency", items)
    return {"items": items}


# ---------------------------------------------------------------- complaints
class ComplaintIn(BaseModel):
    kind: str = Field(pattern="^(complaint|suggestion)$")
    subject: str = Field(min_length=1, max_length=150)
    message: str = Field(min_length=1, max_length=2000)


@api.post("/complaints")
async def create_complaint(body: ComplaintIn, user: User = Depends(current_user)):
    row = await pg.fetchrow(
        "insert into sonar.complaints (id, kind, subject, message, owner_id, owner_name, status, created_at) "
        "values ($1, $2, $3, $4, $5, $6, 'open', $7) returning *",
        pg.new_id(), body.kind, body.subject, body.message, user.id, user.name, pg.now())
    c = Complaint.from_row(row)
    notify([a for a in await admin_ids() if a != user.id], f"New {c.kind} / नवीन {'तक्रार' if c.kind == 'complaint' else 'सूचना'}",
           f"{c.subject} — from {user.name}"[:180], "/admin?tab=complaints", f"cmp-{c.id}")
    return c.out()


@api.get("/complaints/mine")
async def my_complaints(user: User = Depends(current_user)):
    rows = await pg.fetch("select * from sonar.complaints where owner_id = $1 order by created_at desc limit 200", user.id)
    return [Complaint.from_row(r).out() for r in rows]


@api.get("/admin/complaints")
async def admin_complaints(admin: User = Depends(require_admin)):
    rows = await pg.fetch("select * from sonar.complaints order by created_at desc limit 500")
    return [Complaint.from_row(r).out() for r in rows]


@api.post("/admin/complaints/{cid}/resolve")
async def resolve_complaint(cid: str, admin: User = Depends(require_admin)):
    if not await pg.execute("update sonar.complaints set status = 'resolved' where id = $1", cid):
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
    rows = await pg.fetch("select * from sonar.notifications where user_id = $1 order by created_at desc limit 200", user.id)
    return [Notification.from_row(r).out() for r in rows]


@api.get("/notifications/unread-count")
async def unread_count(user: User = Depends(current_user)):
    return {"count": await pg.fetchval("select count(*) from sonar.notifications where user_id = $1 and not read", user.id)}


@api.post("/notifications/read-all")
async def read_all(user: User = Depends(current_user)):
    await pg.execute("update sonar.notifications set read = true where user_id = $1 and not read", user.id)
    return {"ok": True}


@api.post("/notifications/{nid}/read")
async def read_one(nid: str, user: User = Depends(current_user)):
    if not await pg.execute("update sonar.notifications set read = true where id = $1 and user_id = $2", nid, user.id):
        raise HTTPException(404, "Not found")
    return {"ok": True}


app.include_router(api)
app.include_router(payments.make_router(current_user))

# Native apps send no Origin header, so CORS only affects the web version: allow our own domains only.
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()],
    allow_origin_regex=r"https://([a-z0-9-]+\.)*(emergentagent\.com|emergent\.host)",
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.on_event("startup")
async def startup():
    await pg.connect()
    await pg.migrate()
    uname = os.environ["ADMIN_USERNAME"].lower()
    existing = await pg.fetchrow("select * from sonar.users where username = $1", uname)
    if not existing:
        await pg.execute("insert into sonar.users (id, username, name, password_hash, role, created_at) "
                         "values ($1, $2, 'Committee Admin', $3, 'admin', $4)",
                         pg.new_id(), uname, hash_pw(os.environ["ADMIN_PASSWORD"]), pg.now())
    elif not bcrypt.checkpw(os.environ["ADMIN_PASSWORD"].encode(), existing["password_hash"].encode()) or existing["role"] != "admin":
        await pg.execute("update sonar.users set password_hash = $2, role = 'admin' where id = $1",
                         existing["id"], hash_pw(os.environ["ADMIN_PASSWORD"]))
    extra_admins = [u.strip().lower() for u in os.environ.get("EXTRA_ADMIN_USERNAMES", "").split(",") if u.strip()]
    if extra_admins:
        await pg.execute("update sonar.users set role = 'admin' where username = any($1::text[]) and role <> 'admin'", extra_admins)
    try:
        await run_in_threadpool(storage.ensure_bucket)
        logger.info("Supabase storage ready")
    except Exception as e:
        logger.error(f"Supabase storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    await pg.close()
