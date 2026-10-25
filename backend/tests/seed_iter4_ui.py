# Seed (or clean) UI test data for iteration 4: approved matrimony groom + long news post. Usage: python seed_iter4_ui.py [clean ids...]
import os, io, sys, json, uuid
from datetime import date
import requests

API = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")
admin = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@123"}).json()["token"]
A = {"Authorization": f"Bearer {admin}"}

if len(sys.argv) > 1 and sys.argv[1] == "clean":
    rid, pid = sys.argv[2], sys.argv[3]
    print(requests.delete(f"{API}/admin/registrations/{rid}", headers=A).status_code, requests.delete(f"{API}/admin/posts/{pid}", headers=A).status_code)
    sys.exit()

u = requests.post(f"{API}/auth/login", json={"username": "inbox_user", "password": "test123"}).json()["token"]
U = {"Authorization": f"Bearer {u}"}
photos = {k: {"path": requests.post(f"{API}/upload", headers=U, files={"file": ("p.png", io.BytesIO(PNG), "image/png")}).json()["path"], "zoom": 1} for k in ["portrait", "full", "half"]}
dob = date(date.today().year - 26, 3, 3).strftime("%d/%m/%Y")
r = requests.post(f"{API}/registrations", headers=U, json={"type": "matrimony", "title": "TEST_UI Groom", "sub_caste": "Ahir",
                  "data": {"category": "groom", "dob": dob, "district": "Pune", "height": "5'8\" (173 cm)", "qualification": "B.E.", "work_location": "Pune"}, "photos": photos}).json()
requests.post(f"{API}/admin/registrations/{r['id']}/approve", headers=A)
p = requests.post(f"{API}/admin/posts", headers=A, json={"kind": "news", "title": "TEST_UI Long News", "body": "Paragraph start. " + "Lorem ipsum community text. " * 40 + "THE_END_MARKER"}).json()
print(json.dumps({"rid": r["id"], "pid": p["id"]}))
