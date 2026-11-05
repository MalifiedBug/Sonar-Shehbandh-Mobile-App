# Iteration 4: post detail, optional news level, matrimony shortlist, extra admin (omkarlolge)
import os, io, uuid, asyncio, sys
from datetime import date
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")
T = 60


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@123"}, timeout=T)
    assert r.status_code == 200 and r.json()["user"]["role"] == "admin"
    return r.json()["token"]


@pytest.fixture(scope="module")
def user_token():
    r = requests.post(f"{API}/auth/signup", json={"accepted_terms": True, "username": f"test_{uuid.uuid4().hex[:8]}", "name": "TEST Shortlister", "password": "secret123"}, timeout=T)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def matrimony_profile(admin_token, user_token):
    photos = {}
    for k in ["portrait", "full", "half"]:
        r = requests.post(f"{API}/upload", headers=H(user_token), files={"file": (f"{k}.png", io.BytesIO(PNG), "image/png")}, timeout=T)
        assert r.status_code == 200, r.text
        photos[k] = {"path": r.json()["path"], "zoom": 1}
    dob = date(date.today().year - 25, 1, 1).strftime("%d/%m/%Y")
    r = requests.post(f"{API}/registrations", headers=H(user_token), timeout=T, json={
        "type": "matrimony", "title": f"TEST_Groom_{uuid.uuid4().hex[:4]}", "sub_caste": "Ahir",
        "data": {"category": "groom", "dob": dob, "district": "Pune"}, "photos": photos})
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    # pending profile cannot be shortlisted
    assert requests.post(f"{API}/shortlist/{rid}", headers=H(user_token), timeout=T).status_code == 404
    a = requests.post(f"{API}/admin/registrations/{rid}/approve", headers=H(admin_token), timeout=T)
    assert a.status_code == 200, a.text
    yield rid
    requests.delete(f"{API}/admin/registrations/{rid}", headers=H(admin_token), timeout=T)


# --- posts detail + optional level
class TestPosts:
    def test_news_without_level_and_detail(self, admin_token, user_token):
        r = requests.post(f"{API}/admin/posts", headers=H(admin_token), timeout=T,
                          json={"kind": "news", "title": "TEST detail news", "body": "Full body text " * 20, "level": None})
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["level"] is None
        g = requests.get(f"{API}/posts/{p['id']}", headers=H(user_token), timeout=T)
        assert g.status_code == 200
        assert g.json()["title"] == "TEST detail news" and g.json()["body"] == "Full body text " * 20
        assert "_id" not in g.json()
        lst = requests.get(f"{API}/posts", params={"kind": "news"}, headers=H(user_token), timeout=T).json()
        assert p["id"] in {x["id"] for x in lst}
        assert requests.delete(f"{API}/admin/posts/{p['id']}", headers=H(admin_token), timeout=T).status_code == 200
        assert requests.get(f"{API}/posts/{p['id']}", headers=H(user_token), timeout=T).status_code == 404

    def test_post_unknown_404(self, user_token):
        assert requests.get(f"{API}/posts/nonexistent-{uuid.uuid4().hex}", headers=H(user_token), timeout=T).status_code == 404

    def test_post_requires_auth(self):
        assert requests.get(f"{API}/posts/anything", timeout=T).status_code == 401


# --- matrimony shortlist
class TestShortlist:
    def test_requires_auth(self):
        assert requests.get(f"{API}/shortlist", timeout=T).status_code == 401

    def test_toggle_and_persist(self, user_token, matrimony_profile):
        rid = matrimony_profile
        assert requests.get(f"{API}/shortlist", headers=H(user_token), timeout=T).json()["ids"] == []
        r = requests.post(f"{API}/shortlist/{rid}", headers=H(user_token), timeout=T)
        assert r.status_code == 200 and r.json() == {"shortlisted": True}
        assert rid in requests.get(f"{API}/shortlist", headers=H(user_token), timeout=T).json()["ids"]
        lst = requests.get(f"{API}/registrations", params={"type": "matrimony"}, headers=H(user_token), timeout=T).json()
        assert rid in {x["id"] for x in lst}
        r = requests.post(f"{API}/shortlist/{rid}", headers=H(user_token), timeout=T)
        assert r.status_code == 200 and r.json() == {"shortlisted": False}
        assert rid not in requests.get(f"{API}/shortlist", headers=H(user_token), timeout=T).json()["ids"]

    def test_shortlist_is_per_user(self, admin_token, user_token, matrimony_profile):
        requests.post(f"{API}/shortlist/{matrimony_profile}", headers=H(user_token), timeout=T)
        assert matrimony_profile not in requests.get(f"{API}/shortlist", headers=H(admin_token), timeout=T).json()["ids"]

    def test_unknown_and_non_matrimony_404(self, user_token, admin_token):
        assert requests.post(f"{API}/shortlist/nope-{uuid.uuid4().hex}", headers=H(user_token), timeout=T).status_code == 404
        biz = requests.get(f"{API}/registrations", params={"type": "business"}, headers=H(user_token), timeout=T).json()
        if biz:
            assert requests.post(f"{API}/shortlist/{biz[0]['id']}", headers=H(user_token), timeout=T).status_code == 404


# --- extra admin via EXTRA_ADMIN_USERNAMES
class TestExtraAdmin:
    def test_omkarlolge_is_admin_in_db(self):
        sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
        from dotenv import load_dotenv
        load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
        import database as pg

        async def q():
            await pg.connect()
            try:
                return await pg.fetchrow("select username, role from sonar.users where username = 'omkarlolge'")
            finally:
                await pg.close()
        row = asyncio.run(q())
        assert row is not None, "omkarlolge user not found"
        assert row["role"] == "admin"

    def test_admin_still_works(self, admin_token):
        r = requests.get(f"{API}/admin/stats", headers=H(admin_token), timeout=T)
        assert r.status_code == 200
