# Iteration 10: Play Store compliance - account deletion, legal pages, signup consent, owner-only field masking
import os, io, uuid, asyncio, sys
from datetime import date
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")
T = 60
BIZ_PRIV = {"gst", "udyam_no", "shop_act_no"}
MEM_PRIV = {"emergency_name", "emergency_relation", "emergency_phone"}

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
    r = requests.post(f"{API}/auth/signup", json={"accepted_terms": True, "username": uname, "name": name, "password": password}, timeout=T)
    assert r.status_code == 200, r.text
    j = r.json()
    CREATED_USERS.append(j["user"]["id"])
    return j["token"], j["user"]["id"], uname


def upload(tok):
    r = requests.post(f"{API}/upload", headers=H(tok), files={"file": ("p.png", io.BytesIO(PNG), "image/png")}, timeout=T)
    assert r.status_code == 200, r.text
    return r.json()["path"]


def biz_payload(title):
    return {"type": "business", "title": title, "sub_caste": "Ahir",
            "data": {"phone1": "9876543210", "pincode": "411001", "district": "Pune", "gst": "27ABCDE1234F1Z5",
                     "udyam_no": "UDYAM-MH-01-0000001", "shop_act_no": "SA-12345", "category_business": "Jeweller"}, "photos": {}}


def member_payload(title, photos=None):
    return {"type": "member", "title": title, "sub_caste": "Ahir",
            "data": {"full_name": title, "primary_mobile": "9876543210", "pincode": "411001", "district": "Pune",
                     "emergency_name": "TEST Kin", "emergency_relation": "Brother", "emergency_phone": "9876543211"},
            "photos": photos or {}}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    if CREATED_REGS:
        admin = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@123"}, timeout=T).json()["token"]
        for rid in CREATED_REGS:
            requests.delete(f"{API}/admin/registrations/{rid}", headers=H(admin), timeout=T)
    for uid in CREATED_USERS:
        try:
            db("delete from sonar.files where owner_id = $1", uid)
            db("delete from sonar.users where id = $1", uid)
        except Exception as e:
            print("cleanup", e)


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@123"}, timeout=T)
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ---- legal pages (public)
class TestLegal:
    @pytest.mark.parametrize("page", ["privacy", "terms", "account-deletion"])
    def test_public_html(self, page):
        r = requests.get(f"{API}/legal/{page}", timeout=T)
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")
        assert "<html" in r.text.lower() and len(r.text) > 500


# ---- signup consent
class TestSignupConsent:
    def test_missing_consent_422(self):
        r = requests.post(f"{API}/auth/signup", json={"username": f"test_{uuid.uuid4().hex[:8]}", "name": "X", "password": "secret123"}, timeout=T)
        assert r.status_code == 422, r.text

    def test_false_consent_422(self):
        r = requests.post(f"{API}/auth/signup", json={"username": f"test_{uuid.uuid4().hex[:8]}", "name": "X", "password": "secret123", "accepted_terms": False}, timeout=T)
        assert r.status_code == 422, r.text

    def test_true_consent_200(self):
        tok, uid, uname = signup("TEST Consent")
        me = requests.get(f"{API}/auth/me", headers=H(tok), timeout=T).json()
        assert me["username"] == uname and me["role"] == "user"


# ---- owner-only masking
class TestPrivacyMasking:
    @pytest.fixture(scope="class")
    def setup(self, admin_token):
        owner = signup("TEST Mask Owner")
        free = signup("TEST Mask Free")
        plan = signup("TEST Mask Plan")
        db("insert into sonar.subscriptions (user_id, plan, expires_at) values ($1, 'platinum', now() + interval '365 days') "
           "on conflict (user_id) do update set plan = excluded.plan, expires_at = excluded.expires_at", plan[1])
        regs = {}
        for kind, payload in (("business", biz_payload(f"TEST_MaskBiz_{uuid.uuid4().hex[:5]}")),
                              ("member", member_payload(f"TEST_MaskMem_{uuid.uuid4().hex[:5]}"))):
            r = requests.post(f"{API}/registrations", json=payload, headers=H(owner[0]), timeout=T)
            assert r.status_code == 200, r.text
            rid = r.json()["id"]
            CREATED_REGS.append(rid)
            assert requests.post(f"{API}/admin/registrations/{rid}/approve", headers=H(admin_token), timeout=T).status_code == 200
            regs[kind] = (rid, payload["title"])
        return {"owner": owner, "free": free, "plan": plan, "regs": regs}

    @pytest.mark.parametrize("kind,keys", [("business", BIZ_PRIV), ("member", MEM_PRIV)])
    def test_others_masked(self, setup, kind, keys):
        rid, title = setup["regs"][kind]
        for who in ("free", "plan"):
            tok = setup[who][0]
            d = requests.get(f"{API}/registrations/{rid}", headers=H(tok), timeout=T).json()
            assert not (keys & set(d["data"])), f"{who} sees {keys & set(d['data'])} in detail"
            lst = requests.get(f"{API}/registrations", params={"type": kind, "q": title}, headers=H(tok), timeout=T).json()
            item = next(x for x in lst if x["id"] == rid)
            assert not (keys & set(item["data"])), f"{who} sees private keys in list"

    @pytest.mark.parametrize("kind,keys", [("business", BIZ_PRIV), ("member", MEM_PRIV)])
    def test_owner_and_admin_see(self, setup, admin_token, kind, keys):
        rid, title = setup["regs"][kind]
        for tok in (setup["owner"][0], admin_token):
            d = requests.get(f"{API}/registrations/{rid}", headers=H(tok), timeout=T).json()
            assert keys <= set(d["data"])
            lst = requests.get(f"{API}/registrations", params={"type": kind, "q": title}, headers=H(tok), timeout=T).json()
            assert keys <= set(next(x for x in lst if x["id"] == rid)["data"])

    def test_plan_user_still_sees_business_phone(self, setup):
        rid, _ = setup["regs"]["business"]
        d = requests.get(f"{API}/registrations/{rid}", headers=H(setup["plan"][0]), timeout=T).json()
        assert d["data"].get("phone1") == "9876543210"


# ---- account deletion
class TestAccountDeletion:
    def test_admin_cannot_delete(self, admin_token):
        r = requests.delete(f"{API}/users/me", headers=H(admin_token), timeout=T)
        assert r.status_code == 400
        assert requests.get(f"{API}/auth/me", headers=H(admin_token), timeout=T).status_code == 200

    def test_unauthenticated_401(self):
        assert requests.delete(f"{API}/users/me", timeout=T).status_code == 401

    def test_full_cascade(self, admin_token):
        victim_tok, victim_id, victim_uname = signup("TEST Delete Me")
        other_tok, other_id, _ = signup("TEST Shortlister")
        path = upload(victim_tok)
        # registration w/ photo
        r = requests.post(f"{API}/registrations", json=member_payload(f"TEST_DelMem_{uuid.uuid4().hex[:5]}", {"photo": {"path": path}}),
                          headers=H(victim_tok), timeout=T)
        assert r.status_code == 200, r.text
        mem_id = r.json()["id"]
        # matrimony profile (approved) to be shortlisted by other user
        ph = {k: {"path": upload(victim_tok)} for k in ("portrait", "full", "half")}
        mat = {"type": "matrimony", "title": f"TEST_DelMat_{uuid.uuid4().hex[:5]}", "sub_caste": "Ahir",
               "data": {"category": "bride", "full_name": "TEST Bride", "dob": "01/01/1995"}, "photos": ph}
        r = requests.post(f"{API}/registrations", json=mat, headers=H(victim_tok), timeout=T)
        assert r.status_code == 200, r.text
        mat_id = r.json()["id"]
        assert requests.post(f"{API}/admin/registrations/{mat_id}/approve", headers=H(admin_token), timeout=T).status_code == 200
        assert requests.post(f"{API}/shortlist/{mat_id}", headers=H(other_tok), timeout=T).json()["shortlisted"] is True
        assert requests.post(f"{API}/shortlist/{mat_id}", headers=H(victim_tok), timeout=T).json()["shortlisted"] is True
        r = requests.post(f"{API}/complaints", json={"kind": "complaint", "subject": "TEST_del", "message": "TEST msg"}, headers=H(victim_tok), timeout=T)
        assert r.status_code == 200, r.text
        db("insert into sonar.payments (order_id, user_id, plan, amount) values ($1, $2, 'silver', 1)", f"TEST_ord_{uuid.uuid4().hex[:8]}", victim_id)
        db("insert into sonar.subscriptions (user_id, plan, expires_at) values ($1, 'silver', now() + interval '30 days')", victim_id)
        db("insert into sonar.notifications (id, user_id, title, message) values ($1, $2, 'TEST', 'TEST')", uuid.uuid4().hex, victim_id)
        all_paths = [path] + [v["path"] for v in ph.values()]
        assert requests.get(f"{API}/files/{path}", headers=H(admin_token), timeout=T).status_code == 200

        r = requests.delete(f"{API}/users/me", headers=H(victim_tok), timeout=T)
        assert r.status_code == 200 and r.json().get("ok") is True

        assert requests.get(f"{API}/auth/me", headers=H(victim_tok), timeout=T).status_code == 401
        assert requests.post(f"{API}/auth/login", json={"username": victim_uname, "password": "secret123"}, timeout=T).status_code == 401
        for p in all_paths:
            assert requests.get(f"{API}/files/{p}", headers=H(admin_token), timeout=T).status_code == 404
        for rid in (mem_id, mat_id):
            assert requests.get(f"{API}/registrations/{rid}", headers=H(admin_token), timeout=T).status_code == 404
        assert mat_id not in requests.get(f"{API}/shortlist", headers=H(other_tok), timeout=T).json()["ids"]
        for tbl, col in (("registrations", "owner_id"), ("shortlists", "user_id"), ("notifications", "user_id"), ("complaints", "owner_id"),
                         ("payments", "user_id"), ("subscriptions", "user_id"), ("files", "owner_id")):
            n = db(f"select count(*) from sonar.{tbl} where {col} = $1", victim_id, kind="fetchval")
            assert n == 0, f"{tbl} has {n} rows left"
        assert db("select count(*) from sonar.shortlists where registration_id = $1", mat_id, kind="fetchval") == 0
        # Supabase storage objects actually removed
        import storage
        for p in all_paths:
            with pytest.raises(Exception):
                storage.get_object(p)
