# Iteration 8 UI seed/cleanup: `python seed_iter8_ui.py seed` | `python seed_iter8_ui.py cleanup`
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import test_iter8_security as t  # noqa: E402
import requests  # noqa: E402

STATE = "/tmp/iter8_ui.json"


def seed():
    admin = requests.post(f"{t.API}/auth/login", json={"username": "admin", "password": "Admin@123"}, timeout=60).json()["token"]
    owner = t.signup("TEST UI Owner8")
    free = t.signup("TEST UI Free8")
    plan = t.signup("TEST UI Plan8")
    t.db("insert into sonar.subscriptions (user_id, plan, expires_at) values ($1, 'silver', now() + interval '365 days') "
         "on conflict (user_id) do update set plan='silver', expires_at = now() + interval '365 days'", plan[1])
    st = {"users": t.CREATED_USERS, "free": free[2], "plan": plan[2], "owner": owner[2]}
    # business
    r = requests.post(f"{t.API}/registrations", headers=t.H(owner[0]), timeout=60, json={
        "type": "business", "title": "TEST_UI Biz8 Jewellers", "sub_caste": "Ahir",
        "data": {"phone1": "9876543210", "phone2": "9876543211", "whatsapp": "9876543212", "email": "biz8@test.com",
                 "pincode": "411001", "address": "TEST address"}, "photos": {}})
    st["biz"] = r.json()["id"]
    photos = {k: {"path": t.upload(owner[0]), "zoom": 1} for k in ["portrait", "full", "half"]}
    from datetime import date
    r = requests.post(f"{t.API}/registrations", headers=t.H(owner[0]), timeout=60, json={
        "type": "matrimony", "title": "TEST_UI Mat8", "sub_caste": "Ahir",
        "data": {"category": "groom", "full_name": "TEST_UI Mat8", "dob": date(date.today().year - 25, 1, 1).strftime("%d/%m/%Y"),
                 "father_name": "TEST F"}, "photos": photos})
    st["mat"] = r.json()["id"]
    for rid in (st["biz"], st["mat"]):
        requests.post(f"{t.API}/admin/registrations/{rid}/approve", headers=t.H(admin), timeout=60)
    json.dump(st, open(STATE, "w"))
    print(json.dumps(st))


def cleanup():
    st = json.load(open(STATE))
    t.CREATED_REGS[:] = [st["biz"], st["mat"]]
    t.CREATED_USERS[:] = st["users"]
    gen = t.cleanup.__wrapped__()
    next(gen)
    try:
        next(gen)
    except StopIteration:
        pass
    print("cleaned")


if __name__ == "__main__":
    seed() if sys.argv[1] == "seed" else cleanup()
