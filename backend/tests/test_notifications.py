# Notification Inbox API tests (iteration 2)
import os, time, uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def H(t):
    return {"Authorization": f"Bearer {t}"}


def signup(prefix="test_nt"):
    uname = f"{prefix}_{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/auth/signup", json={"accepted_terms": True, "username": uname, "name": "TEST Notif", "password": "secret123"})
    assert r.status_code == 200, r.text
    return {"token": r.json()["token"], "id": r.json()["user"]["id"], "username": uname}


@pytest.fixture(scope="module")
def admin():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@123"})
    assert r.status_code == 200, r.text
    return {"token": r.json()["token"], "id": r.json()["user"]["id"]}


@pytest.fixture(scope="module")
def u1():
    return signup()


@pytest.fixture(scope="module")
def u2():
    return signup()


@pytest.fixture(scope="module")
def posts(admin):
    created = []
    yield created
    for pid in created:
        requests.delete(f"{API}/admin/posts/{pid}", headers=H(admin["token"]))


def notifs(tok):
    r = requests.get(f"{API}/notifications", headers=H(tok))
    assert r.status_code == 200, r.text
    return r.json()


def unread(tok):
    r = requests.get(f"{API}/notifications/unread-count", headers=H(tok))
    assert r.status_code == 200
    return r.json()["count"]


# --- auth required
class TestAuthRequired:
    @pytest.mark.parametrize("method,path", [("get", "/notifications"), ("get", "/notifications/unread-count"),
                                             ("post", "/notifications/read-all"), ("post", "/notifications/abc/read")])
    def test_401(self, method, path):
        assert getattr(requests, method)(f"{API}{path}").status_code == 401


# --- inbox basics
class TestInbox:
    def test_fresh_user_empty(self):
        u = signup()
        assert notifs(u["token"]) == []
        assert unread(u["token"]) == 0

    def test_inbox_user_login(self):
        r = requests.post(f"{API}/auth/login", json={"username": "inbox_user", "password": "test123"})
        assert r.status_code == 200
        tok = r.json()["token"]
        print("inbox_user unread:", unread(tok), "total:", len(notifs(tok)))

    def test_post_fanout_and_order(self, admin, u1, posts):
        titles = []
        for kind, extra in [("news", {"level": "village"}), ("notice", {})]:
            title = f"TEST_{kind}_{uuid.uuid4().hex[:4]}"
            titles.append(title)
            r = requests.post(f"{API}/admin/posts", headers=H(admin["token"]),
                              json={"kind": kind, "title": title, "body": "TEST body", **extra})
            assert r.status_code == 200, r.text
            posts.append(r.json()["id"])
            time.sleep(1.1)
        time.sleep(2.5)
        all_items = notifs(u1["token"])
        # Other tests broadcast to every user concurrently, so only look at this test's own alerts
        items = [i for i in all_items if any(t in i["title"] for t in titles)]
        assert len(items) == 2
        assert items[0]["title"].startswith("Notice") and items[0]["action_url"] == "/events?tab=1"
        assert items[1]["title"].startswith("News") and items[1]["action_url"] == "/news"
        assert all(i["read"] is False and "_id" not in i and i["user_id"] == u1["id"] for i in items)
        assert items[0]["created_at"] >= items[1]["created_at"]
        assert unread(u1["token"]) == sum(1 for i in all_items if not i["read"])

    def test_event_action_url(self, admin, u1, posts):
        r = requests.post(f"{API}/admin/posts", headers=H(admin["token"]),
                          json={"kind": "event", "title": "TEST_event", "body": "TEST body", "date": "2026-02-01"})
        assert r.status_code == 200, r.text
        posts.append(r.json()["id"])
        time.sleep(2.5)
        assert notifs(u1["token"])[0]["action_url"] == "/events"

    def test_admin_not_notified_of_own_post(self, admin, posts):
        titles = [n["title"] for n in notifs(admin["token"])]
        assert not any("TEST_notice" in t or "TEST_news" in t or "TEST_event" in t for t in titles)

    def test_read_one_and_isolation(self, u1, u2):
        items = notifs(u1["token"])
        nid = items[0]["id"]
        # other user cannot mark u1's notification
        assert requests.post(f"{API}/notifications/{nid}/read", headers=H(u2["token"])).status_code == 404
        assert notifs(u1["token"])[0]["read"] is False
        # other user's list doesn't contain u1's ids
        assert nid not in [n["id"] for n in notifs(u2["token"])]
        before = unread(u1["token"])
        r = requests.post(f"{API}/notifications/{nid}/read", headers=H(u1["token"]))
        assert r.status_code == 200 and r.json()["ok"] is True
        assert unread(u1["token"]) == before - 1
        assert [n for n in notifs(u1["token"]) if n["id"] == nid][0]["read"] is True

    def test_read_invalid_id(self, u1):
        assert requests.post(f"{API}/notifications/notanid/read", headers=H(u1["token"])).status_code == 404
        assert requests.post(f"{API}/notifications/{'0'*24}/read", headers=H(u1["token"])).status_code == 404

    def test_read_all(self, u1, u2):
        u2_before = unread(u2["token"])
        r = requests.post(f"{API}/notifications/read-all", headers=H(u1["token"]))
        assert r.status_code == 200
        assert unread(u1["token"]) == 0
        assert all(n["read"] for n in notifs(u1["token"]))
        assert unread(u2["token"]) == u2_before  # isolation


# --- registration + complaint + approval triggers
class TestTriggers:
    def test_complaint_notifies_admin(self, admin, u1):
        subj = f"TEST_cmp_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/complaints", headers=H(u1["token"]), json={"kind": "complaint", "subject": subj, "message": "TEST msg"})
        assert r.status_code == 200, r.text
        time.sleep(2.5)
        hit = [n for n in notifs(admin["token"]) if subj in n["message"]]
        assert hit and hit[0]["action_url"] == "/admin?tab=complaints" and hit[0]["title"].startswith("New complaint")

    def test_registration_approve_reject_flow(self, admin, u1):
        reg_ids = []
        for i in range(2):
            r = requests.post(f"{API}/registrations", headers=H(u1["token"]),
                              json={"type": "member", "title": f"TEST_reg_{uuid.uuid4().hex[:5]}", "sub_caste": "Ahir",
                                    "data": {"district": "Pune", "primary_mobile": "9876543210", "emergency_phone": "9876543211", "pincode": "411001"}, "photos": {}})
            assert r.status_code == 200, r.text
            reg_ids.append(r.json()["id"])
        time.sleep(2.5)
        adm = notifs(admin["token"])
        assert any(n["action_url"] == f"/detail/{reg_ids[0]}" and n["title"].startswith("New submission") for n in adm)
        assert requests.post(f"{API}/admin/registrations/{reg_ids[0]}/approve", headers=H(admin["token"])).status_code == 200
        assert requests.post(f"{API}/admin/registrations/{reg_ids[1]}/reject", headers=H(admin["token"]), json={"reason": "TEST reason"}).status_code == 200
        time.sleep(2.5)
        mine = notifs(u1["token"])
        ap = [n for n in mine if n["action_url"] == f"/detail/{reg_ids[0]}"]
        rj = [n for n in mine if n["action_url"] == f"/detail/{reg_ids[1]}"]
        assert ap and ap[0]["title"].startswith("Approved") and ap[0]["read"] is False
        assert rj and rj[0]["title"].startswith("Not approved") and "TEST reason" in rj[0]["message"]
