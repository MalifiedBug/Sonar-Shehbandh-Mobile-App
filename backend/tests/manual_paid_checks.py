# Manual post-sandbox-payment checks: gating for a really-paid user + valid-signature webhook idempotency
import os, sys, json, time, base64, hmac, hashlib
import requests
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
API = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
tok, oid = sys.argv[1], sys.argv[2]
H = {"Authorization": f"Bearer {tok}"}
lst = requests.get(f"{API}/registrations", params={"type": "matrimony"}, headers=H, timeout=60).json()
me = requests.get(f"{API}/auth/me", headers=H, timeout=60).json()
other = [x for x in lst if x["owner_id"] != (me.get("id") or me.get("user", {}).get("id"))]
if other:
    d = requests.get(f"{API}/registrations/{other[0]['id']}", headers=H, timeout=60).json()
    print("paid viewer detail locked:", d["locked"], "keys:", len(d["data"]))
before = requests.get(f"{API}/payments/{oid}", headers=H, timeout=60).json()["subscription"]["expires_at"]
body = json.dumps({"type": "PAYMENT_SUCCESS_WEBHOOK", "data": {"order": {"order_id": oid}}})
ts = str(int(time.time() * 1000))
sig = base64.b64encode(hmac.new(os.environ["CASHFREE_SECRET_KEY"].encode(), (ts + body).encode(), hashlib.sha256).digest()).decode()
r = requests.post(f"{API}/payments/webhook", data=body, headers={"x-webhook-timestamp": ts, "x-webhook-signature": sig,
                                                                "content-type": "application/json"}, timeout=60)
print("valid webhook:", r.status_code, r.text)
r2 = requests.post(f"{API}/payments/webhook", data=body, headers={"x-webhook-timestamp": ts, "x-webhook-signature": sig + "x"}, timeout=60)
print("tampered webhook:", r2.status_code)
r3 = requests.post(f"{API}/payments/webhook", data="not json", headers={"x-webhook-timestamp": ts, "x-webhook-signature":
                   base64.b64encode(hmac.new(os.environ["CASHFREE_SECRET_KEY"].encode(), (ts + "not json").encode(), hashlib.sha256).digest()).decode()}, timeout=60)
print("signed non-json webhook:", r3.status_code)
after = requests.get(f"{API}/payments/{oid}", headers=H, timeout=60).json()["subscription"]["expires_at"]
print("expires unchanged after webhook:", before == after, after)
