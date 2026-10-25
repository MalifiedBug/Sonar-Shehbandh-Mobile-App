# Create+approve (or delete) a TEST business and social worker so directory lists can be checked in UI. Usage: seed_dir_items.py [clean id1 id2]
import os, sys, json, requests
API = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
A = {"Authorization": "Bearer " + requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@123"}).json()["token"]}
if len(sys.argv) > 1 and sys.argv[1] == "clean":
    print([requests.delete(f"{API}/admin/registrations/{i}", headers=A).status_code for i in sys.argv[2:]])
    sys.exit()
U = {"Authorization": "Bearer " + requests.post(f"{API}/auth/login", json={"username": "inbox_user", "password": "test123"}).json()["token"]}
ids = []
for t, title in [("business", "TEST_UI Jewellers"), ("social_worker", "TEST_UI Seva")]:
    r = requests.post(f"{API}/registrations", headers=U, json={"type": t, "title": title, "sub_caste": "Ahir", "photos": {},
        "data": {"pincode": "411001", "phone1": "9876543210", "phone": "9876543210", "whatsapp": "9876543210", "city_district": "Pune", "operating_area": "Pune", "category_business": "Jewellery"}})
    assert r.status_code == 200, r.text
    ids.append(r.json()["id"])
    requests.post(f"{API}/admin/registrations/{ids[-1]}/approve", headers=A)
print(json.dumps(ids))
