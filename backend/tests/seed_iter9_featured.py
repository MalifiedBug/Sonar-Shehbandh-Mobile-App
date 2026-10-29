# Iter9: give the iter8 TEST biz owner a gold plan so the business is 'featured' (for Featured badge UI check).
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import test_iter8_security as t  # noqa: E402

st = json.load(open("/tmp/iter8_ui.json"))
owner_id = st["users"][0]
t.db("insert into sonar.subscriptions (user_id, plan, expires_at) values ($1, 'gold', now() + interval '30 days') "
     "on conflict (user_id) do update set plan='gold', expires_at = now() + interval '30 days'", owner_id)
print("owner gold", owner_id)
