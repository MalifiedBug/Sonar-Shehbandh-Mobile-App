# Iteration 13 UI seed: two throwaway users + owner with business & matrimony. Usage: python seed_iter13_ui.py [new|delete]
import json, sys, uuid
import requests
from test_payments import API, H, T, signup, make_matrimony

ST = "/tmp/iter13_ui.json"


def mk_user(name):
    u = f"test_{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/auth/signup", json={"accepted_terms": True, "username": u, "name": name, "password": "secret123"}, timeout=T)
    assert r.status_code == 200, r.text
    return {"username": u, "token": r.json()["token"], "id": r.json()["user"]["id"]}


if sys.argv[1] == "new":
    adm = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@123"}, timeout=T).json()["token"]
    otok, oid = signup("TEST UI Owner13")
    rid_m = make_matrimony(otok, adm, f"TEST_UIGroom13_{uuid.uuid4().hex[:4]}")
    r = requests.post(f"{API}/registrations", headers=H(otok), timeout=T, json={
        "type": "business", "title": f"TEST_UIBiz13_{uuid.uuid4().hex[:4]}", "sub_caste": "Ahir",
        "data": {"phone1": "9876543210", "whatsapp": "9876543212", "email": "ui13@test.com", "pincode": "411001", "address": "TEST"}, "photos": {}})
    rid_b = r.json()["id"]
    requests.post(f"{API}/admin/registrations/{rid_b}/approve", headers=H(adm), timeout=T)
    st = {"owner": {"token": otok, "id": oid}, "rid_m": rid_m, "rid_b": rid_b, "u1": mk_user("TEST UI Pro13"), "u2": mk_user("TEST UI Other13")}
    json.dump(st, open(ST, "w"))
    print(json.dumps({k: (v if not isinstance(v, dict) else v.get("username", v.get("id"))) for k, v in st.items()}))
else:
    st = json.load(open(ST))
    adm = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@123"}, timeout=T).json()["token"]
    for rid in (st["rid_m"], st["rid_b"]):
        print(rid, requests.delete(f"{API}/admin/registrations/{rid}", headers=H(adm), timeout=T).status_code)
    for k in [x for x in ("owner", "u1", "u2", "u3") if x in st]:
        tok = st[k]["token"]
        if k != "owner":
            tok = requests.post(f"{API}/auth/login", json={"username": st[k]["username"], "password": "secret123"}, timeout=T).json().get("token", tok)
        print(k, requests.delete(f"{API}/users/me", headers=H(tok), timeout=T).status_code)
