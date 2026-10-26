# Cleanup for iteration 5: test subscriptions + UI seed registrations
import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
from test_payments import API, H, db  # noqa: E402
import requests

admin = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@123"}, timeout=60).json()["token"]
seed = json.load(open("/tmp/seed5.json")) if os.path.exists("/tmp/seed5.json") else {}
for rid in [seed.get("matrimony_id"), seed.get("business_id")]:
    if rid:
        print("delete reg", rid, requests.delete(f"{API}/admin/registrations/{rid}", headers=H(admin), timeout=60).status_code)
print("subs removed:", db("delete from sonar.subscriptions s using sonar.users u where u.id = s.user_id and u.username like 'test_%'"))
print("leftover TEST regs:", db("select id, title, type from sonar.registrations where title like 'TEST\\_Pay%' or title like 'TEST\\_UI%' "
                                "or title like 'TEST\\_SL%' or title like 'TEST\\_Feat%'", kind="fetch"))
print("subs left:", db("select user_id, plan from sonar.subscriptions", kind="fetch"))
