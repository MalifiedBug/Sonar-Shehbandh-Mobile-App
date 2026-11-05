# Seed a fresh user with a pending member registration to check social-worker prefill. Prints username.
import os, io, uuid, json, requests
API = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")
uname = f"test_pf_{uuid.uuid4().hex[:6]}"
t = requests.post(f"{API}/auth/signup", json={"accepted_terms": True, "username": uname, "name": "TEST Account Name", "password": "secret123"}).json()["token"]
H = {"Authorization": f"Bearer {t}"}
av = requests.post(f"{API}/upload", headers=H, files={"file": ("a.png", io.BytesIO(PNG), "image/png")}).json()["path"]
r = requests.post(f"{API}/registrations", headers=H, json={"type": "member", "title": "TEST Member Prefill", "sub_caste": "Ahir", "photos": {"avatar": {"path": av, "zoom": 1}},
    "data": {"full_name": "TEST Member Prefill", "sub_caste": "Ahir", "dob": "05/06/1990", "blood_group": "B+", "primary_mobile": "9876500001",
             "email": "pf@example.com", "house": "12", "street": "MG Road", "taluka": "Haveli", "district": "Pune", "pincode": "411001", "emergency_phone": "9876500002"}})
print(r.status_code, json.dumps({"user": uname, "rid": r.json().get("id")}))
biz = requests.get(f"{API}/registrations", params={"type": "business"}, headers=H).json()
sw = requests.get(f"{API}/registrations", params={"type": "social_worker"}, headers=H).json()
print("approved business:", len(biz), "approved social workers:", len(sw))
