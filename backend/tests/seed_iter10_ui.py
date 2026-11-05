# Iteration 10 UI seed: owner + plan viewer, approved business & member with owner-only fields. Usage: seed | cleanup
import json, sys, requests
import test_iter10_compliance as t

F = "/tmp/iter10_ui.json"
if sys.argv[1] == "seed":
    admin = requests.post(f"{t.API}/auth/login", json={"username": "admin", "password": "Admin@123"}, timeout=60).json()["token"]
    owner, viewer = t.signup("TEST UI Owner10"), t.signup("TEST UI Viewer10")
    t.db("insert into sonar.subscriptions (user_id, plan, expires_at) values ($1, 'platinum', now() + interval '365 days')", viewer[1])
    out = {"owner": owner[2], "viewer": viewer[2], "uids": [owner[1], viewer[1]], "regs": {}}
    for kind, p in (("business", t.biz_payload("TEST_UIBiz10")), ("member", t.member_payload("TEST_UIMem10"))):
        rid = requests.post(f"{t.API}/registrations", json=p, headers=t.H(owner[0]), timeout=60).json()["id"]
        requests.post(f"{t.API}/admin/registrations/{rid}/approve", headers=t.H(admin), timeout=60)
        out["regs"][kind] = rid
    json.dump(out, open(F, "w"))
    print(out)
else:
    d = json.load(open(F))
    admin = requests.post(f"{t.API}/auth/login", json={"username": "admin", "password": "Admin@123"}, timeout=60).json()["token"]
    for rid in d["regs"].values():
        requests.delete(f"{t.API}/admin/registrations/{rid}", headers=t.H(admin), timeout=60)
    for uid in d["uids"]:
        t.db("delete from sonar.users where id = $1", uid)
    print("cleaned")
