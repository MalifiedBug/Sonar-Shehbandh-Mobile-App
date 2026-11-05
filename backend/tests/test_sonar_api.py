# Sonar Shehbandh Community App - backend API regression tests
import os, uuid, io
from datetime import datetime
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

# 1x1 PNG
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@123"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["role"] == "admin"
    return r.json()["token"]


@pytest.fixture(scope="session")
def user():
    uname = f"test_{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/auth/signup", json={"accepted_terms": True, "username": uname, "name": "TEST User", "password": "secret123"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["user"]["username"] == uname and d["user"]["role"] == "user"
    return {"token": d["token"], "username": uname}


def H(t):
    return {"Authorization": f"Bearer {t}"}


# --- auth
class TestAuth:
    def test_me_no_token(self):
        assert requests.get(f"{API}/auth/me").status_code == 401

    def test_me_ok(self, user):
        r = requests.get(f"{API}/auth/me", headers=H(user["token"]))
        assert r.status_code == 200 and r.json()["username"] == user["username"]

    def test_login_bad(self):
        r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "wrong"})
        assert r.status_code == 401

    def test_signup_duplicate(self, user):
        r = requests.post(f"{API}/auth/signup", json={"accepted_terms": True, "username": user["username"], "name": "x", "password": "secret123"})
        assert r.status_code == 409

    def test_signup_short_pw(self):
        r = requests.post(f"{API}/auth/signup", json={"accepted_terms": True, "username": "test_short", "name": "x", "password": "123"})
        assert r.status_code == 422

    def test_login_user(self, user):
        r = requests.post(f"{API}/auth/login", json={"username": user["username"].upper(), "password": "secret123"})
        assert r.status_code == 200


# --- pincode
class TestPincode:
    def test_pin_411001(self, user):
        r = requests.get(f"{API}/pincode/411001", headers=H(user["token"]), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["district"].lower() == "pune" and d["state"].lower() == "maharashtra" and d["taluka"]
        assert "_id" not in d

    def test_pin_invalid(self, user):
        assert requests.get(f"{API}/pincode/12ab", headers=H(user["token"])).status_code == 400


# --- upload / download
class TestFiles:
    def test_upload_download(self, user):
        r = requests.post(f"{API}/upload", headers=H(user["token"]), files={"file": ("p.png", io.BytesIO(PNG), "image/png")}, timeout=60)
        assert r.status_code == 200, r.text
        path = r.json()["path"]
        # Web uses a short-lived files-scope token in ?token=; login token only via Authorization header.
        ft = requests.get(f"{API}/auth/file-token", headers=H(user["token"]), timeout=60).json()["token"]
        d = requests.get(f"{API}/files/{path}", params={"token": ft}, timeout=60)
        assert d.status_code == 200 and d.content == PNG
        assert requests.get(f"{API}/files/{path}", headers=H(user["token"]), timeout=60).content == PNG
        assert requests.get(f"{API}/files/{path}", params={"token": user["token"]}, timeout=60).status_code == 401
        assert requests.get(f"{API}/files/{path}").status_code == 401

    def test_upload_non_image(self, user):
        r = requests.post(f"{API}/upload", headers=H(user["token"]), files={"file": ("a.txt", io.BytesIO(b"hi"), "text/plain")})
        assert r.status_code == 400


# --- registrations + admin
class TestRegistrations:
    ids = {}

    def test_create_each_type(self, user):
        for t in ["member", "business", "social_worker"]:  # matrimony needs 3 photos (covered via UI)
            r = requests.post(f"{API}/registrations", headers=H(user["token"]),
                              json={"type": t, "title": f"TEST_{t}_{uuid.uuid4().hex[:4]}", "sub_caste": "Ahir",
                                    "data": {"district": "Pune", "category": "bride", "pincode": "411001", "dob": "01/01/1995",
                                             "primary_mobile": "9876543210", "emergency_phone": "9876543211", "phone1": "9876543210",
                                             "phone": "9876543210", "whatsapp": "9876543210"}, "photos": {}})
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["status"] == "pending" and d["type"] == t and "_id" not in d
            TestRegistrations.ids[t] = d["id"]

    def test_invalid_type(self, user):
        r = requests.post(f"{API}/registrations", headers=H(user["token"]), json={"type": "bad", "title": "x", "data": {}})
        assert r.status_code == 400

    def test_mine(self, user):
        r = requests.get(f"{API}/registrations/mine", headers=H(user["token"]))
        assert r.status_code == 200
        got = {x["id"] for x in r.json()}
        assert set(TestRegistrations.ids.values()) <= got, f"mine missing: {got}"

    def test_pending_not_in_directory(self, user):
        r = requests.get(f"{API}/registrations", params={"type": "member"}, headers=H(user["token"]))
        assert r.status_code == 200
        assert TestRegistrations.ids["member"] not in {x["id"] for x in r.json()}

    def test_non_admin_403(self, user):
        t = H(user["token"])
        assert requests.get(f"{API}/admin/registrations", headers=t).status_code == 403
        assert requests.get(f"{API}/admin/stats", headers=t).status_code == 403
        assert requests.post(f"{API}/admin/registrations/{TestRegistrations.ids['member']}/approve", headers=t).status_code == 403
        assert requests.post(f"{API}/admin/posts", headers=t, json={"kind": "notice", "title": "x", "body": "y"}).status_code == 403

    def test_admin_list_stats(self, admin_token):
        r = requests.get(f"{API}/admin/registrations", params={"status": "pending"}, headers=H(admin_token))
        assert r.status_code == 200
        assert TestRegistrations.ids["member"] in {x["id"] for x in r.json()}
        s = requests.get(f"{API}/admin/stats", headers=H(admin_token)).json()
        assert s["member"] >= 1 and "complaints" in s

    def test_approve_and_directory(self, admin_token, user):
        for t in ["member"]:
            r = requests.post(f"{API}/admin/registrations/{TestRegistrations.ids[t]}/approve", headers=H(admin_token))
            assert r.status_code == 200 and r.json()["status"] == "approved"
            if t == "matrimony":
                d = r.json()
                exp = datetime.fromisoformat(d["expires_at"]); ap = datetime.fromisoformat(d["approved_at"])
                assert (exp - ap).days == 365
        r = requests.get(f"{API}/registrations", params={"type": "member", "sub_caste": "Ahir", "q": "pune"}, headers=H(user["token"]))
        assert TestRegistrations.ids["member"] in {x["id"] for x in r.json()}
        r = requests.get(f"{API}/registrations", params={"type": "member", "sub_caste": "Nonexistent"}, headers=H(user["token"]))
        assert TestRegistrations.ids["member"] not in {x["id"] for x in r.json()}

    def test_reject_and_delete(self, admin_token, user):
        rid = TestRegistrations.ids["business"]
        r = requests.post(f"{API}/admin/registrations/{rid}/reject", headers=H(admin_token), json={"reason": "TEST bad"})
        assert r.status_code == 200 and r.json()["status"] == "rejected"
        mine = requests.get(f"{API}/registrations/mine", headers=H(user["token"])).json()
        assert any(x["id"] == rid and x["status"] == "rejected" and x["reject_reason"] == "TEST bad" for x in mine)
        for rid in TestRegistrations.ids.values():
            assert requests.delete(f"{API}/admin/registrations/{rid}", headers=H(admin_token)).status_code == 200
        assert requests.get(f"{API}/registrations/{rid}", headers=H(admin_token)).status_code == 404


# --- posts / rules / emergency / complaints
class TestContent:
    def test_posts(self, admin_token, user):
        # level is now optional for news (level chips removed); invalid level still rejected
        r = requests.post(f"{API}/admin/posts", headers=H(admin_token), json={"kind": "news", "title": "TEST no level", "body": "b"})
        assert r.status_code == 200 and r.json().get("level") is None
        requests.delete(f"{API}/admin/posts/{r.json()['id']}", headers=H(admin_token))
        r = requests.post(f"{API}/admin/posts", headers=H(admin_token), json={"kind": "news", "title": "TEST", "body": "b", "level": "planet"})
        assert r.status_code == 400
        r = requests.post(f"{API}/admin/posts", headers=H(admin_token), json={"kind": "news", "title": "TEST news", "body": "b", "level": "district"})
        assert r.status_code == 200
        pid = r.json()["id"]
        lst = requests.get(f"{API}/posts", params={"kind": "news", "level": "district"}, headers=H(user["token"])).json()
        assert pid in {x["id"] for x in lst}
        lst = requests.get(f"{API}/posts", params={"kind": "news", "level": "state"}, headers=H(user["token"])).json()
        assert pid not in {x["id"] for x in lst}
        assert requests.delete(f"{API}/admin/posts/{pid}", headers=H(admin_token)).status_code == 200
        r = requests.post(f"{API}/admin/posts", headers=H(admin_token), json={"kind": "event", "title": "TEST ev", "body": "b", "event_date": "01/02/2026", "location": "Pune"})
        assert r.status_code == 200
        requests.delete(f"{API}/admin/posts/{r.json()['id']}", headers=H(admin_token))

    def test_rules(self, admin_token, user):
        orig = requests.get(f"{API}/rules", headers=H(user["token"])).json()["text"]
        assert orig
        r = requests.put(f"{API}/admin/rules", headers=H(admin_token), json={"text": orig + " "})
        assert r.status_code == 200
        assert requests.get(f"{API}/rules", headers=H(user["token"])).json()["text"] == orig + " "
        requests.put(f"{API}/admin/rules", headers=H(admin_token), json={"text": orig})
        assert requests.put(f"{API}/admin/rules", headers=H(user["token"]), json={"text": "x"}).status_code == 403

    def test_emergency(self, admin_token, user):
        items = requests.get(f"{API}/emergency", headers=H(user["token"])).json()["items"]
        assert len(items) >= 1
        r = requests.put(f"{API}/admin/emergency", headers=H(admin_token), json={"items": items})
        assert r.status_code == 200 and r.json()["items"] == items

    def test_complaints(self, admin_token, user):
        r = requests.post(f"{API}/complaints", headers=H(user["token"]), json={"kind": "complaint", "subject": "TEST s", "message": "m"})
        assert r.status_code == 200
        cid = r.json()["id"]
        assert cid in {x["id"] for x in requests.get(f"{API}/complaints/mine", headers=H(user["token"])).json()}
        assert cid in {x["id"] for x in requests.get(f"{API}/admin/complaints", headers=H(admin_token)).json()}
        assert requests.post(f"{API}/admin/complaints/{cid}/resolve", headers=H(admin_token)).status_code == 200
        mine = requests.get(f"{API}/complaints/mine", headers=H(user["token"])).json()
        assert any(x["id"] == cid and x["status"] == "resolved" for x in mine)
        bad = requests.post(f"{API}/complaints", headers=H(user["token"]), json={"kind": "other", "subject": "s", "message": "m"})
        assert bad.status_code == 422
