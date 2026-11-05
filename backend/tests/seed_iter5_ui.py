# Iteration 5 UI seed: owner with platinum (featured business + matrimony) and a fresh free viewer. Prints JSON ids.
import os, sys, json, uuid
sys.path.insert(0, os.path.dirname(__file__))
from test_payments import API, H, db, signup, make_matrimony  # noqa: E402
import requests

admin = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@123"}, timeout=60).json()["token"]
otok, oid = signup("TEST UI Owner")
mid = make_matrimony(otok, admin, f"TEST_UIGroom_{uuid.uuid4().hex[:4]}")
b = requests.post(f"{API}/registrations", headers=H(otok), timeout=60, json={
    "type": "business", "title": f"TEST_UIFeatBiz_{uuid.uuid4().hex[:4]}", "sub_caste": "Ahir",
    "data": {"phone1": "9876543210", "pincode": "411001", "district": "Pune"}, "photos": {}}).json()["id"]
requests.post(f"{API}/admin/registrations/{b}/approve", headers=H(admin), timeout=60)
db("insert into sonar.subscriptions (user_id, plan, expires_at) values ($1, 'platinum', now() + interval '365 days') "
   "on conflict (user_id) do update set plan='platinum', expires_at = excluded.expires_at", oid)
vu = f"test_uiv{uuid.uuid4().hex[:6]}"
requests.post(f"{API}/auth/signup", json={"accepted_terms": True, "username": vu, "name": "TEST UI Viewer", "password": "secret123"}, timeout=60)
print(json.dumps({"owner_id": oid, "matrimony_id": mid, "business_id": b, "viewer": vu}))
