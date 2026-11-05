# Iteration 5: Cashfree payments, plans, matrimony gating, shortlist limit, featured listings
import os, io, uuid, asyncio, sys
from datetime import date, datetime, timedelta, timezone
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")
T = 60
PUBLIC_KEYS = {"category", "remarriage_gender", "full_name", "sub_caste", "dob", "height", "complexion",
               "rashi", "qualification", "occupation_type", "work_location"}

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from dotenv import load_dotenv  # noqa: E402
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))


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


def signup(name):
    r = requests.post(f"{API}/auth/signup", json={"accepted_terms": True, "username": f"test_{uuid.uuid4().hex[:8]}", "name": name, "password": "secret123"}, timeout=T)
    assert r.status_code == 200, r.text
    j = r.json()
    return j["token"], j["user"]["id"]


def make_matrimony(token, admin_token, title):
    photos = {}
    for k in ["portrait", "full", "half"]:
        r = requests.post(f"{API}/upload", headers=H(token), files={"file": (f"{k}.png", io.BytesIO(PNG), "image/png")}, timeout=T)
        assert r.status_code == 200, r.text
        photos[k] = {"path": r.json()["path"], "zoom": 1}
    dob = date(date.today().year - 25, 1, 1).strftime("%d/%m/%Y")
    r = requests.post(f"{API}/registrations", headers=H(token), timeout=T, json={
        "type": "matrimony", "title": title, "sub_caste": "Ahir",
        "data": {"category": "groom", "full_name": title, "dob": dob, "father_name": "TEST Father", "expectations": "secret-ish",
                 "relatives": "Uncle X"}, "photos": photos})
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    assert requests.post(f"{API}/admin/registrations/{rid}/approve", headers=H(admin_token), timeout=T).status_code == 200
    return rid


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@123"}, timeout=T)
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="module")
def owner():
    tok, uid = signup("TEST Owner")
    yield tok, uid
    db("delete from sonar.subscriptions where user_id = $1", uid)


@pytest.fixture(scope="module")
def viewer():
    tok, uid = signup("TEST Viewer")
    yield tok, uid
    db("delete from sonar.subscriptions where user_id = $1", uid)


@pytest.fixture(scope="module")
def profile(owner, admin_token):
    rid = make_matrimony(owner[0], admin_token, f"TEST_PayGroom_{uuid.uuid4().hex[:4]}")
    yield rid
    requests.delete(f"{API}/admin/registrations/{rid}", headers=H(admin_token), timeout=T)


# --- plans
class TestPlans:
    def test_requires_auth(self):
        assert requests.get(f"{API}/plans", timeout=T).status_code == 401

    def test_three_plans_fresh_user(self, viewer):
        r = requests.get(f"{API}/plans", headers=H(viewer[0]), timeout=T)
        assert r.status_code == 200
        j = r.json()
        assert {p["id"]: p["price"] for p in j["plans"]} == {"silver": 299, "gold": 999, "platinum": 2499}
        assert j["current"] is None


# --- order creation / checkout / status / webhook
class TestOrders:
    def test_unknown_plan_400(self, viewer):
        assert requests.post(f"{API}/payments/order", headers=H(viewer[0]), json={"plan": "diamond"}, timeout=T).status_code == 400

    def test_order_requires_auth(self):
        assert requests.post(f"{API}/payments/order", json={"plan": "silver"}, timeout=T).status_code == 401

    def test_create_order_server_price(self, viewer, owner):
        r = requests.post(f"{API}/payments/order", headers=H(viewer[0]),
                          json={"plan": "silver", "amount": 1, "price": 1, "order_amount": 1}, timeout=T)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["amount"] == 299 and j["order_id"].startswith("sonar_silver_")
        assert j["checkout_url"].endswith(f"/api/payments/checkout/{j['order_id']}")
        row = db("select * from sonar.payments where order_id = $1", j["order_id"], kind="fetchrow")
        assert float(row["amount"]) == 299.0 and row["status"] == "ACTIVE" and row["user_id"] == viewer[1]
        # checkout page
        c = requests.get(j["checkout_url"], timeout=T)
        assert c.status_code == 200 and "sdk.cashfree.com/js/v3/cashfree.js" in c.text and row["payment_session_id"] in c.text
        # status for owner -> ACTIVE (unpaid)
        s = requests.get(f"{API}/payments/{j['order_id']}", headers=H(viewer[0]), timeout=T)
        assert s.status_code == 200 and s.json()["status"] == "ACTIVE" and s.json()["subscription"] is None
        # other user -> 404
        assert requests.get(f"{API}/payments/{j['order_id']}", headers=H(owner[0]), timeout=T).status_code == 404
        # return page renders
        rp = requests.get(f"{API}/payments/return", params={"order_id": j["order_id"]}, timeout=T)
        assert rp.status_code == 200 and "not completed" in rp.text

    def test_checkout_unknown_404(self):
        assert requests.get(f"{API}/payments/checkout/sonar_nope_123", timeout=T).status_code == 404

    def test_status_unknown_404(self, viewer):
        assert requests.get(f"{API}/payments/sonar_nope_123", headers=H(viewer[0]), timeout=T).status_code == 404

    def test_webhook_bad_signature(self):
        body = '{"data":{"order":{"order_id":"x"}}}'
        assert requests.post(f"{API}/payments/webhook", data=body, timeout=T).status_code == 400
        assert requests.post(f"{API}/payments/webhook", data=body, timeout=T,
                             headers={"x-webhook-timestamp": "123", "x-webhook-signature": "bad"}).status_code == 400


# --- matrimony gating + shortlist limit
class TestGating:
    def test_locked_for_free_viewer(self, viewer, profile):
        r = requests.get(f"{API}/registrations/{profile}", headers=H(viewer[0]), timeout=T)
        assert r.status_code == 200
        j = r.json()
        assert j["locked"] is True
        assert set(j["data"].keys()) <= PUBLIC_KEYS and "father_name" not in j["data"]

    def test_owner_and_admin_full(self, owner, admin_token, profile):
        for t in (owner[0], admin_token):
            j = requests.get(f"{API}/registrations/{profile}", headers=H(t), timeout=T).json()
            assert j["locked"] is False and j["data"]["father_name"] == "TEST Father"

    def test_list_endpoint_does_not_leak_full_biodata(self, viewer, profile):
        r = requests.get(f"{API}/registrations", params={"type": "matrimony"}, headers=H(viewer[0]), timeout=T)
        mine = [x for x in r.json() if x["id"] == profile]
        assert mine, "profile not in list"
        assert "father_name" not in mine[0]["data"], f"list leaks locked biodata keys: {sorted(mine[0]['data'].keys())}"

    def test_shortlist_limit_402(self, viewer, admin_token, owner):
        lst = requests.get(f"{API}/registrations", params={"type": "matrimony"}, headers=H(viewer[0]), timeout=T).json()
        ids = [x["id"] for x in lst]
        created = []
        while len(ids) < 6:
            rid = make_matrimony(owner[0], admin_token, f"TEST_SL_{uuid.uuid4().hex[:4]}")
            created.append(rid)
            ids.append(rid)
        try:
            for rid in ids[:5]:
                r = requests.post(f"{API}/shortlist/{rid}", headers=H(viewer[0]), timeout=T)
                assert r.status_code == 200 and r.json()["shortlisted"] is True
            r6 = requests.post(f"{API}/shortlist/{ids[5]}", headers=H(viewer[0]), timeout=T)
            assert r6.status_code == 402, r6.text
            # with silver plan -> unlimited
            db("insert into sonar.subscriptions (user_id, plan, expires_at) values ($1, 'silver', now() + interval '365 days') "
               "on conflict (user_id) do update set plan='silver', expires_at = excluded.expires_at", viewer[1])
            r6 = requests.post(f"{API}/shortlist/{ids[5]}", headers=H(viewer[0]), timeout=T)
            assert r6.status_code == 200
        finally:
            db("delete from sonar.shortlists where user_id = $1", viewer[1])
            db("delete from sonar.subscriptions where user_id = $1", viewer[1])
            for rid in created:
                requests.delete(f"{API}/admin/registrations/{rid}", headers=H(admin_token), timeout=T)

    def test_unlocked_with_plan(self, viewer, profile):
        db("insert into sonar.subscriptions (user_id, plan, expires_at) values ($1, 'silver', now() + interval '365 days') "
           "on conflict (user_id) do update set plan='silver', expires_at = excluded.expires_at", viewer[1])
        try:
            j = requests.get(f"{API}/registrations/{profile}", headers=H(viewer[0]), timeout=T).json()
            assert j["locked"] is False and j["data"]["father_name"] == "TEST Father"
            p = requests.get(f"{API}/plans", headers=H(viewer[0]), timeout=T).json()
            assert p["current"]["plan"] == "silver"
        finally:
            db("delete from sonar.subscriptions where user_id = $1", viewer[1])

    def test_expired_plan_locks_again(self, viewer, profile):
        db("insert into sonar.subscriptions (user_id, plan, expires_at) values ($1, 'silver', now() - interval '1 day') "
           "on conflict (user_id) do update set plan='silver', expires_at = excluded.expires_at", viewer[1])
        try:
            j = requests.get(f"{API}/registrations/{profile}", headers=H(viewer[0]), timeout=T).json()
            assert j["locked"] is True
        finally:
            db("delete from sonar.subscriptions where user_id = $1", viewer[1])


# --- featured listings
class TestFeatured:
    def test_business_featured_first(self, owner, viewer, admin_token):
        r = requests.post(f"{API}/registrations", headers=H(owner[0]), timeout=T, json={
            "type": "business", "title": f"TEST_FeatBiz_{uuid.uuid4().hex[:4]}", "sub_caste": "Ahir",
            "data": {"phone1": "9876543210", "pincode": "411001", "district": "Pune"}, "photos": {}})
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        try:
            assert requests.post(f"{API}/admin/registrations/{rid}/approve", headers=H(admin_token), timeout=T).status_code == 200
            lst = requests.get(f"{API}/registrations", params={"type": "business"}, headers=H(viewer[0]), timeout=T).json()
            assert [x for x in lst if x["id"] == rid][0]["featured"] is False
            db("insert into sonar.subscriptions (user_id, plan, expires_at) values ($1, 'gold', now() + interval '365 days') "
               "on conflict (user_id) do update set plan='gold', expires_at = excluded.expires_at", owner[1])
            lst = requests.get(f"{API}/registrations", params={"type": "business"}, headers=H(viewer[0]), timeout=T).json()
            assert lst[0]["featured"] is True
            mine = [x for x in lst if x["id"] == rid][0]
            assert mine["featured"] is True
            assert all(x["featured"] for x in lst[: lst.index(mine) + 1])
        finally:
            db("delete from sonar.subscriptions where user_id = $1", owner[1])
            requests.delete(f"{API}/admin/registrations/{rid}", headers=H(admin_token), timeout=T)

    def test_matrimony_featured_only_platinum(self, owner, viewer, profile):
        try:
            db("insert into sonar.subscriptions (user_id, plan, expires_at) values ($1, 'gold', now() + interval '365 days') "
               "on conflict (user_id) do update set plan='gold', expires_at = excluded.expires_at", owner[1])
            lst = requests.get(f"{API}/registrations", params={"type": "matrimony"}, headers=H(viewer[0]), timeout=T).json()
            assert [x for x in lst if x["id"] == profile][0]["featured"] is False
            db("update sonar.subscriptions set plan='platinum' where user_id = $1", owner[1])
            lst = requests.get(f"{API}/registrations", params={"type": "matrimony"}, headers=H(viewer[0]), timeout=T).json()
            assert lst[0]["featured"] is True and [x for x in lst if x["id"] == profile][0]["featured"] is True
        finally:
            db("delete from sonar.subscriptions where user_id = $1", owner[1])


# --- idempotent activation (sync_order called twice after PAID must not extend)
class TestIdempotency:
    def test_paid_status_twice_no_extend(self, viewer):
        """Uses a real paid order id if PAID_ORDER_ID/PAID_TOKEN env given; otherwise skip."""
        oid, tok = os.environ.get("PAID_ORDER_ID"), os.environ.get("PAID_TOKEN")
        if not oid:
            pytest.skip("no sandbox-paid order available")
        a = requests.get(f"{API}/payments/{oid}", headers=H(tok), timeout=T).json()
        b = requests.get(f"{API}/payments/{oid}", headers=H(tok), timeout=T).json()
        assert a["status"] == "PAID" and a["subscription"]["expires_at"] == b["subscription"]["expires_at"]
