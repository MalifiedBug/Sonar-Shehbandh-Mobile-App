# Iteration 6 regression: auth, admin filters used by useLoad screens, registration create->approve->delete
import os
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
MEMBER_DATA = {
    "sub_caste": "Panchal Sonar", "gender": "Male", "dob": "01/01/1990", "marital_status": "Unmarried",
    "primary_mobile": "9876543210", "house": "12 Shanti", "street": "MG Road", "pincode": "411001",
    "taluka": "Pune City", "district": "Pune", "state": "Maharashtra", "native_village": "Satara",
    "native_taluka": "Satara", "native_district": "Satara", "emergency_name": "Ram Test",
    "emergency_relation": "Brother", "emergency_phone": "9876500000", "family": [],
}


def _login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    return d.get("token") or d.get("access_token")


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {_login('admin', 'Admin@123')}"
    return s


@pytest.fixture(scope="module")
def user():
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {_login('inbox_user', 'test123')}"
    return s


# Auth
def test_login_wrong_password():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "nope"}, timeout=20)
    assert r.status_code == 401


def test_me_admin(admin):
    r = admin.get(f"{API}/auth/me", timeout=20)
    assert r.status_code == 200 and r.json()["role"] == "admin"


def test_unread_count_requires_auth():
    assert requests.get(f"{API}/notifications/unread-count", timeout=20).status_code == 401


# Screens backed by useLoad
@pytest.mark.parametrize("path", ["/rules", "/emergency", "/plans", "/notifications", "/notifications/unread-count", "/registrations/mine", "/shortlist", "/posts?kind=news&level=", "/posts?kind=event&level=", "/posts?kind=notice&level="])
def test_user_screens_load(user, path):
    r = user.get(f"{API}{path}", timeout=20)
    assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"


@pytest.mark.parametrize("status", ["pending", "approved", "rejected"])
def test_admin_status_filter(admin, status):
    r = admin.get(f"{API}/admin/registrations?status={status}&type=", timeout=20)
    assert r.status_code == 200
    assert all(x["status"] == status for x in r.json())


def test_non_admin_blocked_from_admin(user):
    assert user.get(f"{API}/admin/stats", timeout=20).status_code in (401, 403)


# Registration lifecycle: create (user) -> approve (admin) -> visible in directory -> delete
def test_registration_lifecycle(admin, user):
    title = f"TEST_iter6_{uuid.uuid4().hex[:5]}"
    r = user.post(f"{API}/registrations", json={"type": "member", "title": title, "sub_caste": "Panchal Sonar", "data": MEMBER_DATA | {"full_name": title}, "photos": {}}, timeout=20)
    assert r.status_code in (200, 201), r.text
    rid = r.json()["id"]
    try:
        mine = user.get(f"{API}/registrations/mine", timeout=20).json()
        assert any(x["id"] == rid and x["status"] == "pending" for x in mine)
        a = admin.post(f"{API}/admin/registrations/{rid}/approve", timeout=20)
        if a.status_code == 404 or a.status_code == 405:
            a = admin.post(f"{API}/admin/registrations/{rid}/status", json={"status": "approved"}, timeout=20)
        assert a.status_code == 200, a.text
        d = admin.get(f"{API}/registrations?type=member&q={title}&sub_caste=&category=", timeout=20).json()
        assert any(x["id"] == rid for x in d)
    finally:
        assert admin.delete(f"{API}/admin/registrations/{rid}", timeout=20).status_code in (200, 204)
    assert admin.get(f"{API}/registrations/{rid}", timeout=20).status_code == 404
