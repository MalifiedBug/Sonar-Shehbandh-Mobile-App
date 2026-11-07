# Iteration 13: RevenueCat store "Pro" — X-Store-Pro header grants Matrimony Plus (rank 1) perks
import uuid
import pytest
import requests
from test_payments import API, H, T, PUBLIC_KEYS, db, signup, make_matrimony, PNG  # noqa: F401

PRO = {"X-Store-Pro": "1"}
CREATED_REGS = []


def HP(t, **extra):
    return {**H(t), **PRO, **extra}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@123"}, timeout=T)
    assert r.status_code == 200
    tok = r.json()["token"]
    yield tok
    for rid in CREATED_REGS:
        requests.delete(f"{API}/admin/registrations/{rid}", headers=H(tok), timeout=T)


@pytest.fixture(scope="module")
def owner():
    tok, uid = signup("TEST Owner13")
    yield tok, uid
    requests.delete(f"{API}/users/me", headers=H(tok), timeout=T)


@pytest.fixture(scope="module")
def free_user():
    tok, uid = signup("TEST Free13")
    yield tok, uid
    db("delete from sonar.shortlists where user_id = $1", uid)
    requests.delete(f"{API}/users/me", headers=H(tok), timeout=T)


@pytest.fixture(scope="module")
def business(owner, admin_token):
    r = requests.post(f"{API}/registrations", headers=H(owner[0]), timeout=T, json={
        "type": "business", "title": f"TEST_Biz13_{uuid.uuid4().hex[:4]}", "sub_caste": "Ahir",
        "data": {"phone1": "9876543210", "phone2": "9876543211", "whatsapp": "9876543212", "email": "biz13@test.com",
                 "pincode": "411001", "address": "TEST address", "gst": "27ABCDE1234F1Z5", "udyam_no": "UDYAM-1",
                 "shop_act_no": "SA-1"}, "photos": {}})
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    CREATED_REGS.append(rid)
    assert requests.post(f"{API}/admin/registrations/{rid}/approve", headers=H(admin_token), timeout=T).status_code == 200
    return rid


@pytest.fixture(scope="module")
def member(owner, admin_token):
    r = requests.post(f"{API}/registrations", headers=H(owner[0]), timeout=T, json={
        "type": "member", "title": f"TEST_Mem13_{uuid.uuid4().hex[:4]}", "sub_caste": "Ahir",
        "data": {"primary_mobile": "9876543210", "emergency_phone": "9876543219", "emergency_name": "TEST EName",
                 "emergency_relation": "Brother", "pincode": "411001"}, "photos": {}})
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    CREATED_REGS.append(rid)
    assert requests.post(f"{API}/admin/registrations/{rid}/approve", headers=H(admin_token), timeout=T).status_code == 200
    return rid


@pytest.fixture(scope="module")
def matrimony(owner, admin_token):
    rid = make_matrimony(owner[0], admin_token, f"TEST_ProGroom_{uuid.uuid4().hex[:4]}")
    CREATED_REGS.append(rid)
    full = requests.get(f"{API}/registrations/{rid}", headers=H(owner[0]), timeout=T).json()
    return rid, full["photos"]


def _find(lst, rid):
    return next((x for x in lst if x["id"] == rid), None)


# --- business gating with/without header
class TestBusinessStorePro:
    def test_list_locked_without_header(self, free_user, business):
        j = requests.get(f"{API}/registrations", params={"type": "business"}, headers=H(free_user[0]), timeout=T).json()
        b = _find(j, business)
        assert b and b["locked"] is True and "phone1" not in b["data"] and "email" not in b["data"]

    def test_list_unlocked_with_header(self, free_user, business):
        j = requests.get(f"{API}/registrations", params={"type": "business"}, headers=HP(free_user[0]), timeout=T).json()
        b = _find(j, business)
        assert b and b["locked"] is False
        assert b["data"]["phone1"] == "9876543210" and b["data"]["whatsapp"] == "9876543212" and b["data"]["email"] == "biz13@test.com"
        assert not ({"gst", "udyam_no", "shop_act_no"} & set(b["data"]))

    def test_detail_locked_without_header(self, free_user, business):
        d = requests.get(f"{API}/registrations/{business}", headers=H(free_user[0]), timeout=T).json()
        assert d["locked"] is True and "phone1" not in d["data"]

    def test_detail_unlocked_with_header_ids_hidden(self, free_user, business):
        d = requests.get(f"{API}/registrations/{business}", headers=HP(free_user[0]), timeout=T).json()
        assert d["locked"] is False and d["data"]["phone2"] == "9876543211"
        assert not ({"gst", "udyam_no", "shop_act_no"} & set(d["data"]))

    @pytest.mark.parametrize("val", ["0", "true", "yes", "2"])
    def test_other_header_values_do_not_unlock(self, free_user, business, val):
        d = requests.get(f"{API}/registrations/{business}", headers=H(free_user[0]) | {"X-Store-Pro": val}, timeout=T).json()
        assert d["locked"] is True

    def test_header_without_auth_401(self, business):
        assert requests.get(f"{API}/registrations/{business}", headers=PRO, timeout=T).status_code == 401


# --- member emergency contacts never exposed
class TestMemberPrivate:
    def test_emergency_hidden_with_header(self, free_user, member):
        d = requests.get(f"{API}/registrations/{member}", headers=HP(free_user[0]), timeout=T).json()
        assert not ({"emergency_name", "emergency_relation", "emergency_phone"} & set(d["data"]))
        j = requests.get(f"{API}/registrations", params={"type": "member"}, headers=HP(free_user[0]), timeout=T).json()
        m = _find(j, member)
        assert m and not ({"emergency_name", "emergency_relation", "emergency_phone"} & set(m["data"]))


# --- matrimony biodata + photos
class TestMatrimonyStorePro:
    def test_detail_locked_without_header(self, free_user, matrimony):
        d = requests.get(f"{API}/registrations/{matrimony[0]}", headers=H(free_user[0]), timeout=T).json()
        assert d["locked"] is True and set(d["data"]) <= PUBLIC_KEYS and set(d["photos"]) == {"portrait"}

    def test_detail_full_with_header(self, free_user, matrimony):
        d = requests.get(f"{API}/registrations/{matrimony[0]}", headers=HP(free_user[0]), timeout=T).json()
        assert d["locked"] is False and d["data"]["father_name"] == "TEST Father" and d["data"]["relatives"] == "Uncle X"
        assert set(d["photos"]) == {"portrait", "full", "half"}

    def test_list_full_with_header(self, free_user, matrimony):
        j = requests.get(f"{API}/registrations", params={"type": "matrimony"}, headers=HP(free_user[0]), timeout=T).json()
        m = _find(j, matrimony[0])
        assert m and m["locked"] is False and "expectations" in m["data"]

    @pytest.mark.parametrize("kind", ["full", "half"])
    def test_photo_bearer_header(self, free_user, matrimony, kind):
        path = matrimony[1][kind]["path"]
        assert requests.get(f"{API}/files/{path}", headers=H(free_user[0]), timeout=T).status_code == 403
        r = requests.get(f"{API}/files/{path}", headers=HP(free_user[0]), timeout=T)
        assert r.status_code == 200 and r.content[:4] == PNG[:4]

    def test_photo_portrait_free(self, free_user, matrimony):
        path = matrimony[1]["portrait"]["path"]
        assert requests.get(f"{API}/files/{path}", headers=H(free_user[0]), timeout=T).status_code == 200

    def test_photo_web_query_token_with_header(self, free_user, matrimony):
        # web <img> cannot send headers: query file-token path
        ft = requests.get(f"{API}/auth/file-token", headers=H(free_user[0]), timeout=T).json()["token"]
        path = matrimony[1]["full"]["path"]
        assert requests.get(f"{API}/files/{path}", params={"token": ft}, timeout=T).status_code == 403
        assert requests.get(f"{API}/files/{path}", params={"token": ft}, headers=PRO, timeout=T).status_code == 200


# --- shortlist limit
class TestShortlist:
    def test_limit_lifted_with_header(self, free_user, owner, admin_token):
        rids = [make_matrimony(owner[0], admin_token, f"TEST_SL13_{i}_{uuid.uuid4().hex[:3]}") for i in range(6)]
        CREATED_REGS.extend(rids)
        for rid in rids[:5]:
            r = requests.post(f"{API}/shortlist/{rid}", headers=H(free_user[0]), timeout=T)
            assert r.status_code == 200 and r.json()["shortlisted"] is True
        r = requests.post(f"{API}/shortlist/{rids[5]}", headers=H(free_user[0]), timeout=T)
        assert r.status_code == 402, r.text
        r = requests.post(f"{API}/shortlist/{rids[5]}", headers=HP(free_user[0]), timeout=T)
        assert r.status_code == 200 and r.json()["shortlisted"] is True
        sl = requests.get(f"{API}/shortlist", headers=H(free_user[0]), timeout=T).json()
        assert len(sl) >= 6 if isinstance(sl, list) else True


# --- CORS
class TestCors:
    def test_preflight_allows_header(self):
        r = requests.options(f"{API}/registrations?type=business", timeout=T, headers={
            "Origin": "https://sonar-shehbandh.preview.emergentagent.com", "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization,content-type,x-store-pro"})
        assert r.status_code == 200, r.text
        assert "x-store-pro" in r.headers.get("access-control-allow-headers", "").lower()


# --- regression: Razorpay order
class TestRazorpayRegression:
    def test_order_still_created(self, free_user):
        r = requests.post(f"{API}/payments/order", headers=HP(free_user[0]), json={"plan": "silver"}, timeout=T)
        assert r.status_code == 200, r.text
        assert r.json()["order_id"].startswith("order_") and r.json()["amount"] == 299
        p = requests.get(f"{API}/plans", headers=HP(free_user[0]), timeout=T).json()
        assert p["current"] is None  # header must not create a Razorpay subscription
