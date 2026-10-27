# Iteration 8: security audit fixes - business/matrimony gating, lockout, logout revocation,
# file-scoped tokens, bcrypt 72-byte limit, CORS allow-list
import os, io, uuid, asyncio, sys
from datetime import date
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")
T = 60
PRIVATE_BIZ = {"phone1", "phone2", "whatsapp", "email"}

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from dotenv import load_dotenv  # noqa: E402
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

CREATED_USERS, CREATED_REGS = [], []


def H(t):
    return {"Authorization": f"Bearer {t}"}


def db(sql, *args, kind="execute"):
    import database as pg

    async def q():
        await pg.connect()
        try:
            return await getattr(pg, kind)(sql, *args)
        finally:
            await pg.close()
    return asyncio.run(q())


def signup(name, password="secret123"):
    uname = f"test_{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/auth/signup", json={"username": uname, "name": name, "password": password}, timeout=T)
    assert r.status_code == 200, r.text
    j = r.json()
    CREATED_USERS.append(j["user"]["id"])
    return j["token"], j["user"]["id"], uname


def upload(tok):
    r = requests.post(f"{API}/upload", headers=H(tok), files={"file": ("p.png", io.BytesIO(PNG), "image/png")}, timeout=T)
    assert r.status_code == 200, r.text
    return r.json()["path"]


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    if CREATED_REGS:
        admin = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@123"}, timeout=T).json()["token"]
        for rid in CREATED_REGS:
            requests.delete(f"{API}/admin/registrations/{rid}", headers=H(admin), timeout=T)
    for uid in CREATED_USERS:
        for sql in ["delete from sonar.subscriptions where user_id = $1", "delete from sonar.shortlists where user_id = $1",
                    "delete from sonar.notifications where user_id = $1", "delete from sonar.files where owner_id = $1",
                    "delete from sonar.users where id = $1"]:
            try:
                db(sql, uid)
            except Exception as e:
                print("cleanup", sql, e)


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@123"}, timeout=T)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def owner():
    return signup("TEST Owner8")


@pytest.fixture(scope="module")
def free_user():
    return signup("TEST Free8")


@pytest.fixture(scope="module")
def plan_user():
    tok, uid, u = signup("TEST Plan8")
    db("insert into sonar.subscriptions (user_id, plan, expires_at) values ($1, 'silver', now() + interval '365 days') "
       "on conflict (user_id) do update set plan='silver', expires_at = now() + interval '365 days'", uid)
    return tok, uid, u


@pytest.fixture(scope="module")
def business(owner, admin_token):
    r = requests.post(f"{API}/registrations", headers=H(owner[0]), timeout=T, json={
        "type": "business", "title": "TEST_Biz8 Jewellers", "sub_caste": "Ahir",
        "data": {"phone1": "9876543210", "phone2": "9876543211", "whatsapp": "9876543212", "email": "biz8@test.com",
                 "pincode": "411001", "address": "TEST address"}, "photos": {}})
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    CREATED_REGS.append(rid)
    assert requests.post(f"{API}/admin/registrations/{rid}/approve", headers=H(admin_token), timeout=T).status_code == 200
    return rid


@pytest.fixture(scope="module")
def matrimony(owner, admin_token):
    photos = {k: {"path": upload(owner[0]), "zoom": 1} for k in ["portrait", "full", "half"]}
    dob = date(date.today().year - 25, 1, 1).strftime("%d/%m/%Y")
    r = requests.post(f"{API}/registrations", headers=H(owner[0]), timeout=T, json={
        "type": "matrimony", "title": "TEST_Mat8", "sub_caste": "Ahir",
        "data": {"category": "groom", "full_name": "TEST_Mat8", "dob": dob, "father_name": "TEST F"}, "photos": photos})
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    CREATED_REGS.append(rid)
    assert requests.post(f"{API}/admin/registrations/{rid}/approve", headers=H(admin_token), timeout=T).status_code == 200
    return rid, photos


def file_token(tok):
    r = requests.get(f"{API}/auth/file-token", headers=H(tok), timeout=T)
    assert r.status_code == 200, r.text
    return r.json()


# --- business contact gating
class TestBusinessGating:
    def _find(self, tok, rid):
        r = requests.get(f"{API}/registrations", params={"type": "business"}, headers=H(tok), timeout=T)
        assert r.status_code == 200, r.text
        m = [x for x in r.json() if x["id"] == rid]
        assert m, "business not in list"
        return m[0]

    def test_free_list_and_detail_locked(self, free_user, business):
        item = self._find(free_user[0], business)
        assert item["locked"] is True and not (PRIVATE_BIZ & set(item["data"])), item["data"]
        assert item["data"].get("pincode") == "411001"
        d = requests.get(f"{API}/registrations/{business}", headers=H(free_user[0]), timeout=T).json()
        assert d["locked"] is True and not (PRIVATE_BIZ & set(d["data"]))

    @pytest.mark.parametrize("who", ["owner", "admin", "plan"])
    def test_privileged_see_contacts(self, who, owner, admin_token, plan_user, business):
        tok = {"owner": owner[0], "admin": admin_token, "plan": plan_user[0]}[who]
        item = self._find(tok, business)
        assert item["locked"] is False and item["data"]["phone1"] == "9876543210" and item["data"]["email"] == "biz8@test.com"
        d = requests.get(f"{API}/registrations/{business}", headers=H(tok), timeout=T).json()
        assert d["locked"] is False and d["data"]["whatsapp"] == "9876543212"


# --- matrimony photo gating
class TestMatrimonyGating:
    def test_free_sees_only_portrait(self, free_user, matrimony):
        rid, photos = matrimony
        d = requests.get(f"{API}/registrations/{rid}", headers=H(free_user[0]), timeout=T).json()
        assert d["locked"] is True and set(d["photos"]) == {"portrait"} and d["photo_paths"] == [photos["portrait"]["path"]]
        lst = requests.get(f"{API}/registrations", params={"type": "matrimony"}, headers=H(free_user[0]), timeout=T).json()
        m = [x for x in lst if x["id"] == rid][0]
        assert set(m["photos"]) == {"portrait"} and len(m["photo_paths"]) == 1

    def test_free_file_access(self, free_user, matrimony):
        _, photos = matrimony
        assert requests.get(f"{API}/files/{photos['portrait']['path']}", headers=H(free_user[0]), timeout=T).status_code == 200
        for k in ("full", "half"):
            r = requests.get(f"{API}/files/{photos[k]['path']}", headers=H(free_user[0]), timeout=T)
            assert r.status_code == 403, (k, r.status_code)
        ft = file_token(free_user[0])["token"]
        assert requests.get(f"{API}/files/{photos['full']['path']}", params={"token": ft}, timeout=T).status_code == 403
        assert requests.get(f"{API}/files/{photos['portrait']['path']}", params={"token": ft}, timeout=T).status_code == 200

    @pytest.mark.parametrize("who", ["owner", "admin", "plan"])
    def test_privileged_file_access(self, who, owner, admin_token, plan_user, matrimony):
        _, photos = matrimony
        tok = {"owner": owner[0], "admin": admin_token, "plan": plan_user[0]}[who]
        for k in ("portrait", "full", "half"):
            assert requests.get(f"{API}/files/{photos[k]['path']}", headers=H(tok), timeout=T).status_code == 200, k
        d = requests.get(f"{API}/registrations/{matrimony[0]}", headers=H(tok), timeout=T).json()
        assert d["locked"] is False and set(d["photos"]) == {"portrait", "full", "half"}


# --- file-scoped token
class TestFileToken:
    def test_file_token_scope(self, plan_user, matrimony):
        import jwt
        j = file_token(plan_user[0])
        assert j["expires_in"] == 3600
        p = jwt.decode(j["token"], options={"verify_signature": False})
        assert p["scope"] == "files" and 3500 <= p["exp"] - p["iat"] <= 3700
        path = matrimony[1]["full"]["path"]
        assert requests.get(f"{API}/files/{path}", params={"token": j["token"]}, timeout=T).status_code == 200
        # rejected on other APIs
        assert requests.get(f"{API}/auth/me", headers=H(j["token"]), timeout=T).status_code == 401
        assert requests.get(f"{API}/registrations", params={"type": "business"}, headers=H(j["token"]), timeout=T).status_code == 401
        # file token in header on /files also rejected
        assert requests.get(f"{API}/files/{path}", headers=H(j["token"]), timeout=T).status_code == 401

    def test_login_token_in_query_rejected(self, plan_user, matrimony):
        path = matrimony[1]["portrait"]["path"]
        assert requests.get(f"{API}/files/{path}", params={"token": plan_user[0]}, timeout=T).status_code == 401
        assert requests.get(f"{API}/files/{path}", timeout=T).status_code == 401


# --- logout revocation
class TestLogout:
    def test_logout_revokes(self):
        tok, uid, uname = signup("TEST Logout8")
        ft = file_token(tok)["token"]
        assert requests.get(f"{API}/auth/me", headers=H(tok), timeout=T).status_code == 200
        r = requests.post(f"{API}/auth/logout", headers=H(tok), timeout=T)
        assert r.status_code == 200 and r.json() == {"ok": True}
        assert requests.get(f"{API}/auth/me", headers=H(tok), timeout=T).status_code == 401
        # file token also revoked (shares token_version)
        path = upload_path_dummy = None
        r = requests.post(f"{API}/auth/login", json={"username": uname, "password": "secret123"}, timeout=T)
        assert r.status_code == 200
        new = r.json()["token"]
        assert requests.get(f"{API}/auth/me", headers=H(new), timeout=T).status_code == 200
        p = upload(new)
        assert requests.get(f"{API}/files/{p}", params={"token": ft}, timeout=T).status_code == 401
        assert requests.get(f"{API}/files/{p}", params={"token": file_token(new)["token"]}, timeout=T).status_code == 200

    def test_logout_without_token(self):
        assert requests.post(f"{API}/auth/logout", timeout=T).status_code == 401


# --- login lockout
class TestLockout:
    def test_lockout_after_5(self):
        tok, uid, uname = signup("TEST Lock8")
        for i in range(5):
            r = requests.post(f"{API}/auth/login", json={"username": uname, "password": "wrongpw"}, timeout=T)
            assert r.status_code == 401, (i, r.status_code)
        r = requests.post(f"{API}/auth/login", json={"username": uname, "password": "secret123"}, timeout=T)
        assert r.status_code == 429, r.text
        row = db("select failed_login_attempts, locked_until from sonar.users where id = $1", uid, kind="fetchrow")
        assert row["failed_login_attempts"] == 5 and row["locked_until"]

    def test_success_resets_counter(self):
        tok, uid, uname = signup("TEST Reset8")
        for _ in range(4):
            assert requests.post(f"{API}/auth/login", json={"username": uname, "password": "bad"}, timeout=T).status_code == 401
        assert requests.post(f"{API}/auth/login", json={"username": uname, "password": "secret123"}, timeout=T).status_code == 200
        row = db("select failed_login_attempts, locked_until from sonar.users where id = $1", uid, kind="fetchrow")
        assert row["failed_login_attempts"] == 0 and row["locked_until"] is None
        for _ in range(4):
            assert requests.post(f"{API}/auth/login", json={"username": uname, "password": "bad"}, timeout=T).status_code == 401
        assert requests.post(f"{API}/auth/login", json={"username": uname, "password": "secret123"}, timeout=T).status_code == 200

    def test_relock_after_expiry_single_wrong(self):
        """After lock expires, counter stays at 5 -> one wrong attempt re-locks immediately (observation)."""
        tok, uid, uname = signup("TEST Relock8")
        db("update sonar.users set failed_login_attempts = 5, locked_until = now() - interval '1 minute' where id = $1", uid)
        assert requests.post(f"{API}/auth/login", json={"username": uname, "password": "bad"}, timeout=T).status_code == 401
        r = requests.post(f"{API}/auth/login", json={"username": uname, "password": "secret123"}, timeout=T)
        print("after expiry + 1 wrong -> correct login status:", r.status_code)
        assert r.status_code == 200, "single wrong attempt after lock expiry re-locked the account for another 15 min"


# --- bcrypt 72 byte limit
class TestPasswordLength:
    def test_signup_long_password_422(self):
        r = requests.post(f"{API}/auth/signup", json={"username": f"test_{uuid.uuid4().hex[:8]}", "name": "X", "password": "a" * 73}, timeout=T)
        assert r.status_code == 422

    def test_signup_multibyte_over_72_bytes_422(self):
        r = requests.post(f"{API}/auth/signup", json={"username": f"test_{uuid.uuid4().hex[:8]}", "name": "X", "password": "अ" * 30}, timeout=T)
        assert r.status_code == 422, r.text

    def test_signup_72_ok(self):
        tok, uid, uname = signup("TEST 72", password="b" * 72)
        assert requests.post(f"{API}/auth/login", json={"username": uname, "password": "b" * 72}, timeout=T).status_code == 200
        assert requests.post(f"{API}/auth/login", json={"username": uname, "password": "b" * 73}, timeout=T).status_code == 401


# --- CORS allow-list
class TestCORS:
    def test_evil_origin(self):
        r = requests.options(f"{API}/auth/login", headers={"Origin": "https://evil.com", "Access-Control-Request-Method": "POST"}, timeout=T)
        # Note: the preview ingress itself adds 'Access-Control-Allow-Origin: *' to NON-preflight responses;
        # the backend preflight (which gates Authorization-header requests) is what we verify here.
        assert "access-control-allow-origin" not in {k.lower() for k in r.headers}
        assert r.status_code == 400

    def test_lookalike_origin(self):
        for o in ["https://evilemergentagent.com", "https://emergentagent.com.evil.com", "http://sonar-shehbandh.preview.emergentagent.com"]:
            r = requests.options(f"{API}/auth/login", headers={"Origin": o, "Access-Control-Request-Method": "POST"}, timeout=T)
            assert r.headers.get("access-control-allow-origin") in (None, ""), o

    def test_app_origin(self):
        o = BASE_URL
        r = requests.options(f"{API}/auth/login", headers={"Origin": o, "Access-Control-Request-Method": "POST",
                                                           "Access-Control-Request-Headers": "content-type,authorization"}, timeout=T)
        assert r.status_code == 200 and r.headers.get("access-control-allow-origin") == o
