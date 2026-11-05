# Supabase migration regression: storage access control, upload limits, search escaping, matrimony expiry, migrated data
import io
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
PNG = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
       b"\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82")
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 200 + b"\xff\xd9"


def H(t):
    return {"Authorization": f"Bearer {t}"}


def signup(prefix="test_sb"):
    u = f"{prefix}_{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/auth/signup", json={"accepted_terms": True, "username": u, "password": "test123", "name": "TEST " + u})
    assert r.status_code == 200, r.text
    return r.json()["token"], r.json()["user"]


def upload(tok, data=PNG, ctype="image/png", name="a.png"):
    return requests.post(f"{API}/upload", headers=H(tok), files={"file": (name, io.BytesIO(data), ctype)}, timeout=60)


@pytest.fixture(scope="module")
def admin():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@123"})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def owner():
    return signup()


@pytest.fixture(scope="module")
def other():
    return signup()


def member_payload(title, photos=None, sub_caste="Ahir", district="Pune"):
    return {"type": "member", "title": title, "sub_caste": sub_caste, "photos": photos or {},
            "data": {"primary_mobile": "9876543210", "emergency_phone": "9876543211", "pincode": "411001",
                     "district": district}}


# Auth
class TestAuth:
    def test_admin_login_and_me(self, admin):
        assert admin["user"]["role"] == "admin"
        me = requests.get(f"{API}/auth/me", headers=H(admin["token"])).json()
        assert me["id"] == admin["user"]["id"] and me["username"] == "admin"
        print("admin id:", me["id"])

    def test_signup_duplicate_409(self, owner):
        r = requests.post(f"{API}/auth/signup", json={"accepted_terms": True, "username": owner[1]["username"], "password": "test123", "name": "x"})
        assert r.status_code == 409

    def test_duplicate_case_insensitive(self, owner):
        r = requests.post(f"{API}/auth/signup", json={"accepted_terms": True, "username": owner[1]["username"].upper(), "password": "test123", "name": "x"})
        print("uppercase dup status:", r.status_code)
        assert r.status_code in (409, 400)

    def test_migrated_inbox_user(self):
        r = requests.post(f"{API}/auth/login", json={"username": "inbox_user", "password": "test123"})
        assert r.status_code == 200, r.text
        tok = r.json()["token"]
        n = requests.get(f"{API}/notifications", headers=H(tok)).json()
        assert isinstance(n, list) and len(n) > 0
        c = requests.get(f"{API}/notifications/unread-count", headers=H(tok)).json()
        print("inbox_user notifications:", len(n), "unread:", c)


# Storage
class TestStorage:
    def test_upload_jpeg_and_fetch(self, owner):
        r = upload(owner[0], JPG, "image/jpeg", "a.jpg")
        assert r.status_code == 200, r.text
        p = r.json()["path"]
        assert p.endswith(".jpg")
        g = requests.get(f"{API}/files/{p}", headers={"Authorization": f"Bearer {owner[0]}"})
        assert g.status_code == 200 and g.content == JPG
        assert g.headers["content-type"].startswith("image/jpeg")

    def test_fetch_with_bearer_header(self, owner):
        p = upload(owner[0]).json()["path"]
        g = requests.get(f"{API}/files/{p}", headers=H(owner[0]))
        assert g.status_code == 200 and g.content == PNG

    def test_fetch_no_token_401(self, owner):
        p = upload(owner[0]).json()["path"]
        assert requests.get(f"{API}/files/{p}").status_code == 401

    def test_nonexistent_404(self, owner):
        assert requests.get(f"{API}/files/sonar-shehbandh/uploads/x/nope.png", headers={"Authorization": f"Bearer {owner[0]}"}).status_code == 404

    def test_non_image_rejected(self, owner):
        r = upload(owner[0], b"hello", "text/plain", "a.txt")
        assert r.status_code == 400

    def test_too_large_413(self, owner):
        r = upload(owner[0], b"\x00" * (8 * 1024 * 1024 + 10), "image/png", "big.png")
        assert r.status_code == 413, r.status_code

    def test_pending_photo_hidden_then_visible(self, owner, other, admin):
        p = upload(owner[0]).json()["path"]
        assert requests.get(f"{API}/files/{p}", headers={"Authorization": f"Bearer {other[0]}"}).status_code == 404
        reg = requests.post(f"{API}/registrations", headers=H(owner[0]),
                            json=member_payload("TEST_SB Photo Member", {"photo": {"path": p}})).json()
        assert requests.get(f"{API}/files/{p}", headers={"Authorization": f"Bearer {other[0]}"}).status_code == 404
        assert requests.get(f"{API}/files/{p}", headers={"Authorization": "Bearer " + admin["token"]}).status_code == 200
        a = requests.post(f"{API}/admin/registrations/{reg['id']}/approve", headers=H(admin["token"]))
        assert a.status_code == 200
        g = requests.get(f"{API}/files/{p}", headers={"Authorization": f"Bearer {other[0]}"})
        assert g.status_code == 200 and g.content == PNG
        requests.delete(f"{API}/admin/registrations/{reg['id']}", headers=H(admin["token"]))

    def test_cannot_use_others_photo(self, owner, other):
        p = upload(owner[0]).json()["path"]
        r = requests.post(f"{API}/registrations", headers=H(other[0]),
                          json=member_payload("TEST_SB steal", {"photo": {"path": p}}))
        assert r.status_code == 400


# Registrations search/filter
class TestRegistrations:
    def test_search_and_filters(self, owner, admin):
        tag = uuid.uuid4().hex[:6]
        r1 = requests.post(f"{API}/registrations", headers=H(owner[0]),
                           json=member_payload(f"TEST_SB 100%_{tag}", sub_caste="Ahir", district=f"Dist{tag}")).json()
        r2 = requests.post(f"{API}/registrations", headers=H(owner[0]),
                           json=member_payload(f"TEST_SB plain {tag}", sub_caste="Lad")).json()
        for r in (r1, r2):
            assert requests.post(f"{API}/admin/registrations/{r['id']}/approve", headers=H(admin["token"])).status_code == 200
        t = H(owner[0])
        ids = lambda q, **kw: [x["id"] for x in requests.get(f"{API}/registrations", headers=t, params={"type": "member", "q": q, **kw}).json()]
        assert r1["id"] in ids(tag) and r2["id"] in ids(tag)
        assert ids(f"100%_{tag}") == [r1["id"]]
        assert ids(f"Dist{tag}") == [r1["id"]]  # data field search
        assert r2["id"] not in ids("%")  # literal % must not match everything
        assert ids("_" + tag) == [r1["id"]]  # literal underscore
        assert requests.get(f"{API}/registrations", headers=t, params={"type": "member", "q": "a'b\\c"}).status_code == 200
        assert ids(tag, sub_caste="Lad") == [r2["id"]]
        for r in (r1, r2):
            requests.delete(f"{API}/admin/registrations/{r['id']}", headers=H(admin["token"]))
        assert requests.get(f"{API}/registrations/{r1['id']}", headers=t).status_code == 404

    def test_matrimony_expiry_and_category(self, owner, admin):
        photos = {k: {"path": upload(owner[0]).json()["path"]} for k in ("portrait", "full", "half")}
        dob = (datetime.now(timezone.utc) - timedelta(days=365 * 25)).strftime("%d/%m/%Y")
        tag = uuid.uuid4().hex[:6]
        body = {"type": "matrimony", "title": f"TEST_SB Bride {tag}", "sub_caste": "Ahir", "photos": photos,
                "data": {"dob": dob, "category": "bride"}}
        bad = dict(body, photos={"portrait": photos["portrait"]})
        assert requests.post(f"{API}/registrations", headers=H(owner[0]), json=bad).status_code == 400
        r = requests.post(f"{API}/registrations", headers=H(owner[0]), json=body)
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        a = requests.post(f"{API}/admin/registrations/{rid}/approve", headers=H(admin["token"])).json()
        exp = datetime.fromisoformat(a["expires_at"].replace("Z", "+00:00"))
        days = (exp - datetime.now(timezone.utc)).days
        assert 363 <= days <= 365, days
        t = H(owner[0])
        got = lambda cat: [x["id"] for x in requests.get(f"{API}/registrations", headers=t, params={"type": "matrimony", "q": tag, "category": cat}).json()]
        assert got("bride") == [rid] and got("groom") == []
        requests.delete(f"{API}/admin/registrations/{rid}", headers=H(admin["token"]))

    def test_reject_with_reason(self, owner, admin):
        rid = requests.post(f"{API}/registrations", headers=H(owner[0]), json=member_payload("TEST_SB rej")).json()["id"]
        r = requests.post(f"{API}/admin/registrations/{rid}/reject", headers=H(admin["token"]), json={"reason": "Bad photo"})
        assert r.status_code == 200 and r.json()["status"] == "rejected"
        mine = [x for x in requests.get(f"{API}/registrations/mine", headers=H(owner[0])).json() if x["id"] == rid][0]
        assert mine["reject_reason"] == "Bad photo"
        assert requests.delete(f"{API}/admin/registrations/{rid}", headers=H(admin["token"])).status_code == 200
        assert requests.delete(f"{API}/admin/registrations/{rid}", headers=H(admin["token"])).status_code == 404

    def test_migrated_members_visible(self, owner):
        r = requests.get(f"{API}/registrations", headers=H(owner[0]), params={"type": "member"})
        assert r.status_code == 200 and len(r.json()) > 0
        x = r.json()[0]
        assert x["status"] == "approved" and "_id" not in x
        print("approved members:", len(r.json()), "first:", x["title"])
