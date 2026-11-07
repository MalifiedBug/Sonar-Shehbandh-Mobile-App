# Razorpay payments (iter11), plans, matrimony gating, shortlist limit, featured listings
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
    requests.delete(f"{API}/users/me", headers=H(tok), timeout=T)


@pytest.fixture(scope="module")
def viewer():
    tok, uid = signup("TEST Viewer")
    yield tok, uid
    db("delete from sonar.subscriptions where user_id = $1", uid)
    requests.delete(f"{API}/users/me", headers=H(tok), timeout=T)


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


# --- Razorpay order creation / checkout / callback / status / webhook
RZP_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")
RZP_KEY = os.environ.get("RAZORPAY_KEY_ID", "")


def rzp_sig(order_id, payment_id):
    import hmac, hashlib
    return hmac.new(RZP_SECRET.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()


def new_order(tok, plan="silver"):
    r = requests.post(f"{API}/payments/order", headers=H(tok), json={"plan": plan}, timeout=T)
    assert r.status_code == 200, r.text
    return r.json()


class TestOrders:
    def test_unknown_plan_400(self, viewer):
        assert requests.post(f"{API}/payments/order", headers=H(viewer[0]), json={"plan": "diamond"}, timeout=T).status_code == 400

    def test_order_requires_auth(self):
        assert requests.post(f"{API}/payments/order", json={"plan": "silver"}, timeout=T).status_code == 401

    @pytest.mark.parametrize("plan,price", [("silver", 299), ("gold", 999), ("platinum", 2499)])
    def test_create_order_server_price(self, viewer, plan, price):
        r = requests.post(f"{API}/payments/order", headers=H(viewer[0]),
                          json={"plan": plan, "amount": 1, "price": 1, "order_amount": 1}, timeout=T)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["amount"] == price and j["order_id"].startswith("order_")
        assert j["checkout_url"].endswith(f"/api/payments/checkout/{j['order_id']}")
        row = db("select * from sonar.payments where order_id = $1", j["order_id"], kind="fetchrow")
        assert float(row["amount"]) == float(price) and row["status"] == "ACTIVE" and row["user_id"] == viewer[1]
        assert row["provider"] == "razorpay"
        # Razorpay itself holds the order at the server price
        if RZP_SECRET:
            rz = requests.get(f"https://api.razorpay.com/v1/orders/{j['order_id']}", auth=(RZP_KEY, RZP_SECRET), timeout=T).json()
            assert rz["amount"] == price * 100 and rz["status"] == "created" and rz["notes"]["user_id"] == viewer[1]

    def test_checkout_page(self, viewer):
        j = new_order(viewer[0], "gold")
        c = requests.get(j["checkout_url"], timeout=T)
        assert c.status_code == 200
        t = c.text
        assert "checkout.razorpay.com/v1/checkout.js" in t
        assert f'"order_id": "{j["order_id"]}"' in t and '"amount": 99900' in t
        assert '"key": "rzp_' in t and "/api/payments/razorpay-callback" in t
        assert RZP_SECRET == "" or RZP_SECRET not in t

    def test_status_owner_only(self, viewer, owner):
        j = new_order(viewer[0])
        s = requests.get(f"{API}/payments/{j['order_id']}", headers=H(viewer[0]), timeout=T)
        assert s.status_code == 200 and s.json()["status"] == "ACTIVE" and s.json()["subscription"] is None
        assert requests.get(f"{API}/payments/{j['order_id']}", headers=H(owner[0]), timeout=T).status_code == 404
        assert requests.get(f"{API}/payments/{j['order_id']}", timeout=T).status_code == 401

    def test_checkout_unknown_404(self):
        assert requests.get(f"{API}/payments/checkout/order_nope123", timeout=T).status_code == 404

    def test_status_unknown_404(self, viewer):
        assert requests.get(f"{API}/payments/order_nope123", headers=H(viewer[0]), timeout=T).status_code == 404

    def test_callback_bad_signature(self, viewer):
        j = new_order(viewer[0])
        r = requests.post(f"{API}/payments/razorpay-callback", timeout=T, data={
            "razorpay_order_id": j["order_id"], "razorpay_payment_id": "pay_fake123", "razorpay_signature": "bad"})
        assert r.status_code == 200 and "Payment not completed" in r.text
        assert db("select status from sonar.payments where order_id = $1", j["order_id"], kind="fetchval") == "ACTIVE"
        assert requests.get(f"{API}/plans", headers=H(viewer[0]), timeout=T).json()["current"] is None

    def test_callback_valid_signature_unpaid_order(self, viewer):
        if not RZP_SECRET:
            pytest.skip("RAZORPAY_KEY_SECRET not in env")
        j = new_order(viewer[0])
        r = requests.post(f"{API}/payments/razorpay-callback", timeout=T, data={
            "razorpay_order_id": j["order_id"], "razorpay_payment_id": "pay_fake123",
            "razorpay_signature": rzp_sig(j["order_id"], "pay_fake123")})
        assert r.status_code == 200 and "Payment not completed" in r.text
        assert db("select status from sonar.payments where order_id = $1", j["order_id"], kind="fetchval") == "ACTIVE"
        assert requests.get(f"{API}/plans", headers=H(viewer[0]), timeout=T).json()["current"] is None

    def test_callback_error_metadata(self, viewer):
        j = new_order(viewer[0])
        r = requests.post(f"{API}/payments/razorpay-callback", timeout=T, data={
            "error[code]": "BAD_REQUEST_ERROR", "error[description]": "Payment failed",
            "error[metadata]": '{"payment_id":"pay_x","order_id":"%s"}' % j["order_id"]})
        assert r.status_code == 200 and "Payment not completed" in r.text and j["order_id"] in r.text
        bad = requests.post(f"{API}/payments/razorpay-callback", timeout=T, data={"error[metadata]": "not-json<script>"})
        assert bad.status_code == 200 and "Payment not completed" in bad.text and "Order: </p>" in bad.text
        empty = requests.post(f"{API}/payments/razorpay-callback", timeout=T)
        assert empty.status_code in (200, 400, 422)

    def test_webhook_503_without_secret(self):
        body = '{"event":"order.paid","payload":{}}'
        r = requests.post(f"{API}/payments/webhook", data=body, timeout=T, headers={"x-razorpay-signature": "bad"})
        assert r.status_code == 503, r.text


class TestUpgradeRules:
    def test_lower_plan_409_same_plan_ok(self):
        tok, uid = signup("TEST Upg")
        try:
            db("insert into sonar.subscriptions (user_id, plan, expires_at) values ($1, 'gold', now() + interval '365 days')", uid)
            assert requests.post(f"{API}/payments/order", headers=H(tok), json={"plan": "silver"}, timeout=T).status_code == 409
            assert requests.post(f"{API}/payments/order", headers=H(tok), json={"plan": "gold"}, timeout=T).status_code == 200
            assert requests.post(f"{API}/payments/order", headers=H(tok), json={"plan": "platinum"}, timeout=T).status_code == 200
        finally:
            requests.delete(f"{API}/users/me", headers=H(tok), timeout=T)


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
