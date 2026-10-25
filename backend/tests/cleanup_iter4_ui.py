# Cleanup TEST_ data created by iteration-4 UI testing (stray TEST posts, TEST_UI registrations)
import os, requests
API = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
A = {"Authorization": "Bearer " + requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@123"}).json()["token"]}
for kind in ["news", "event", "notice"]:
    for p in requests.get(f"{API}/posts", params={"kind": kind}, headers=A).json():
        if p["title"].startswith("TEST_UI") or (p["title"] == "TEST" and p["body"] == "b"):
            print("del post", p["title"], requests.delete(f"{API}/admin/posts/{p['id']}", headers=A).status_code)
for r in [x for s in ["pending", "approved", "rejected"] for x in requests.get(f"{API}/admin/registrations", params={"status": s}, headers=A).json()]:
    if str(r.get("title", "")).startswith(("TEST_UI", "TEST Member Prefill")):
        print("del reg", r["title"], requests.delete(f"{API}/admin/registrations/{r['id']}", headers=A).status_code)
