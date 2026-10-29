# Iter9 UI seed/cleanup: creates a TEST_ future event + checks data state for Home/Directory redesign tests.
import os, sys, json, datetime, requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"


def login(u, p):
    r = requests.post(f"{BASE}/auth/login", json={"username": u, "password": p}, timeout=20)
    r.raise_for_status()
    return r.json()["token"]


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "state"
    t = login("admin", "Admin@123")
    h = {"Authorization": f"Bearer {t}"}
    if mode == "seed":
        d = (datetime.date.today() + datetime.timedelta(days=5)).isoformat()
        r = requests.post(f"{BASE}/admin/posts", headers=h, json={"kind": "event", "title": "TEST_Iter9 Sammelan", "body": "TEST event body", "location": "TEST Hall Pune", "event_date": d}, timeout=20)
        print(r.status_code, r.text[:300])
    elif mode == "notice":
        r = requests.post(f"{BASE}/admin/posts", headers=h, json={"kind": "notice", "title": "TEST_Iter9 Notice", "body": "TEST notice body", "level": "taluka"}, timeout=20)
        print(r.status_code, r.text[:200])
    elif mode == "cleanup":
        for k in ("event", "notice", "news"):
            for p in requests.get(f"{BASE}/posts?kind={k}", headers=h, timeout=20).json():
                if p["title"].startswith("TEST_Iter9"):
                    print("delete", p["id"], requests.delete(f"{BASE}/admin/posts/{p['id']}", headers=h, timeout=20).status_code)
    for k in ("event", "notice", "news"):
        ps = requests.get(f"{BASE}/posts?kind={k}", headers=h, timeout=20).json()
        print(k, len(ps), [(p["id"], p["title"], p.get("event_date")) for p in ps][:5])
    for ty in ("member", "business", "social_worker", "matrimony"):
        rs = requests.get(f"{BASE}/registrations?type={ty}", headers=h, timeout=20).json()
        print(ty, len(rs), [(r["id"], r["title"], r.get("featured"), r.get("locked")) for r in rs][:4])
    ti = login("inbox_user", "test123")
    hi = {"Authorization": f"Bearer {ti}"}
    print("inbox unread", requests.get(f"{BASE}/notifications/unread-count", headers=hi, timeout=20).json())
    rs = requests.get(f"{BASE}/registrations?type=business", headers=hi, timeout=20).json()
    print("inbox business", [(r["id"], r.get("locked")) for r in rs][:4])
    print("inbox plans", requests.get(f"{BASE}/plans", headers=hi, timeout=20).json().get("current"))


main()
