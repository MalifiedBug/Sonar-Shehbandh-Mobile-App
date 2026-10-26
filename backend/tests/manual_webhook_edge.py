# Edge: signed webhook whose JSON body is not an object (array / data null)
import os, time, base64, hmac, hashlib
import requests
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
API = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
for body in ["[]", '{"data": null}', '{"data": {"order": null}}']:
    ts = str(int(time.time() * 1000))
    sig = base64.b64encode(hmac.new(os.environ["CASHFREE_SECRET_KEY"].encode(), (ts + body).encode(), hashlib.sha256).digest()).decode()
    r = requests.post(f"{API}/payments/webhook", data=body, headers={"x-webhook-timestamp": ts, "x-webhook-signature": sig}, timeout=60)
    print(body, "->", r.status_code)
