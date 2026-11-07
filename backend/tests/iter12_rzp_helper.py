# Iter12 helper: create throwaway user + Razorpay order, inspect order/payments, check status, delete user
import json
import os
import sys
import uuid

import requests

API = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
AUTH = (os.environ["RAZORPAY_KEY_ID"], os.environ["RAZORPAY_KEY_SECRET"])
STATE = "/tmp/iter12_state.json"


def H(t):
    return {"Authorization": f"Bearer {t}"}


cmd = sys.argv[1]
if cmd == "new":
    plan = sys.argv[2] if len(sys.argv) > 2 else "silver"
    u = f"test_rzp12_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{API}/auth/signup", json={"accepted_terms": True, "username": u, "name": "TEST Rzp12", "password": "secret123"}, timeout=30)
    j = r.json()
    o = requests.post(f"{API}/payments/order", headers=H(j["token"]), json={"plan": plan}, timeout=30).json()
    st = {"username": u, "token": j["token"], "uid": j["user"]["id"], **o}
    json.dump(st, open(STATE, "w"))
    rz = requests.get(f"https://api.razorpay.com/v1/orders/{o['order_id']}", auth=AUTH).json()
    print(json.dumps({"order": o, "username": u, "rzp_order": rz}, indent=1))
elif cmd == "inspect":
    st = json.load(open(STATE))
    oid = sys.argv[2] if len(sys.argv) > 2 else st["order_id"]
    rz = requests.get(f"https://api.razorpay.com/v1/orders/{oid}", auth=AUTH).json()
    ps = requests.get(f"https://api.razorpay.com/v1/orders/{oid}/payments", auth=AUTH).json()
    print("ORDER", rz.get("status"), rz.get("amount"), rz.get("amount_paid"))
    for p in ps.get("items", []):
        print("PAY", p["id"], p["status"], p.get("captured"), p.get("amount"), p.get("method"))
elif cmd == "status":
    st = json.load(open(STATE))
    for _ in range(int(sys.argv[2]) if len(sys.argv) > 2 else 1):
        print(requests.get(f"{API}/payments/{st['order_id']}", headers=H(st["token"]), timeout=30).json())
    print("PLANS current:", requests.get(f"{API}/plans", headers=H(st["token"]), timeout=30).json()["current"])
elif cmd == "dbcheck":
    # Verifies razorpay_payment_id stored + repeat valid callback doesn't extend expiry
    import asyncio, hmac, hashlib
    sys.path.insert(0, "/app/backend")
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    import database as pg
    st = json.load(open(STATE))

    async def q(sql, *a, kind="fetchrow"):
        await pg.connect()
        try:
            return await getattr(pg, kind)(sql, *a)
        finally:
            await pg.close()
    row = asyncio.run(q("select order_id, status, provider, razorpay_payment_id, paid_at from sonar.payments where order_id=$1", st["order_id"]))
    print("DB ROW", dict(row) if row else None)
    sub1 = asyncio.run(q("select plan, expires_at, last_order_id from sonar.subscriptions where user_id=$1", st["uid"]))
    print("SUB before", dict(sub1))
    pid = row["razorpay_payment_id"] or "pay_x"
    sig = hmac.new(AUTH[1].encode(), f"{st['order_id']}|{pid}".encode(), hashlib.sha256).hexdigest()
    r = requests.post(f"{API}/payments/razorpay-callback", data={"razorpay_order_id": st["order_id"], "razorpay_payment_id": pid, "razorpay_signature": sig}, timeout=30)
    print("REPEAT CALLBACK", r.status_code, "successful" in r.text)
    requests.get(f"{API}/payments/{st['order_id']}", headers=H(st["token"]), timeout=30)
    sub2 = asyncio.run(q("select plan, expires_at, last_order_id from sonar.subscriptions where user_id=$1", st["uid"]))
    print("SUB after", dict(sub2), "UNCHANGED" if sub1["expires_at"] == sub2["expires_at"] else "EXTENDED!!")
    # Old cashfree orders
    cf = asyncio.run(q("select order_id, status, user_id from sonar.payments where provider='cashfree' order by created_at desc limit 50", kind="fetch"))
    from collections import Counter
    print("CASHFREE rows:", len(cf), Counter(c["status"] for c in cf))
    for c in cf[:3]:
        r = requests.get(f"{API}/payments/checkout/{c['order_id']}", timeout=30)
        print("CF checkout", c["order_id"], r.status_code, r.text[:60])
elif cmd in ("fallback_order", "cf_expired", "mismatch"):
    import asyncio
    sys.path.insert(0, "/app/backend")
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    import database as pg
    st = json.load(open(STATE))

    async def run():
        await pg.connect()
        try:
            if cmd == "fallback_order":
                # Order WITHOUT auto-capture (account default) -> payment stays 'authorized' -> sync_order fallback must capture
                o = requests.post("https://api.razorpay.com/v1/orders", auth=AUTH, json={"amount": 99900, "currency": "INR", "receipt": "TEST_fallback", "notes": {"plan": "gold", "user_id": st["uid"]}}).json()
                await pg.execute("insert into sonar.payments (order_id, user_id, plan, amount, status, provider, created_at) values ($1,$2,'gold',999,'ACTIVE','razorpay',now())", o["id"], st["uid"])
                st["order_id"] = o["id"]
                json.dump(st, open(STATE, "w"))
                print("FALLBACK ORDER", o["id"], o["status"])
            elif cmd == "cf_expired":
                oid = f"TEST_cf_{uuid.uuid4().hex[:8]}"
                await pg.execute("insert into sonar.payments (order_id, user_id, plan, amount, status, provider, created_at) values ($1,$2,'silver',299,'ACTIVE','cashfree',now())", oid, st["uid"])
                r = requests.get(f"{API}/payments/{oid}", headers=H(st["token"]), timeout=30)
                print("CF status", r.status_code, r.text[:150])
                r2 = requests.get(f"{API}/payments/checkout/{oid}", timeout=30)
                print("CF checkout", r2.status_code, r2.text[:60])
                print("CF DB", await pg.fetchval("select status from sonar.payments where order_id=$1", oid))
            elif cmd == "mismatch":
                import payments
                oid = f"TEST_mm_{uuid.uuid4().hex[:8]}"
                await pg.execute("insert into sonar.payments (order_id, user_id, plan, amount, status, provider, created_at) values ($1,$2,'silver',299,'ACTIVE','razorpay',now())", oid, st["uid"])
                calls = []

                async def fake(order_id):
                    calls.append(order_id)
                    return {"status": "paid", "amount_paid": 100}
                payments.fetch_rzp_order = fake
                print("sync1", await payments.sync_order(oid, "pay_fake"), "calls", len(calls))
                print("DB status", await pg.fetchval("select status from sonar.payments where order_id=$1", oid))
                print("sync2", await payments.sync_order(oid), "calls", len(calls), "(should stay 1)")
                sub = await pg.fetchrow("select last_order_id from sonar.subscriptions where user_id=$1", st["uid"])
                print("sub last_order_id", sub and sub["last_order_id"], "(must not be mismatch order)")
        finally:
            await pg.close()
    asyncio.run(run())
elif cmd == "delete":
    st = json.load(open(STATE))
    print(requests.delete(f"{API}/users/me", headers=H(st["token"]), timeout=30).status_code)
