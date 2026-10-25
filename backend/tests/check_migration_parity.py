# One-off parity check: Mongo (old) vs Supabase (new) row counts + admin id + migrated photo fetch
import asyncio
import os
import sys

import requests
from dotenv import load_dotenv

sys.path.insert(0, "/app/backend")
load_dotenv("/app/backend/.env")
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
import database as pg  # noqa: E402

BASE = None
for line in open("/app/frontend/.env"):
    if line.startswith("EXPO_PUBLIC_BACKEND_URL"):
        BASE = line.split("=", 1)[1].strip().strip('"').rstrip("/")


async def main():
    mongo = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    await pg.connect()
    for t in ["users", "registrations", "files", "pincodes", "posts", "settings", "complaints", "notifications"]:
        try:
            m = await mongo[t].count_documents({})
        except Exception as e:
            m = f"err {e}"
        s = await pg.fetchval(f"select count(*) from sonar.{t}")
        print(f"{t:15s} mongo={m} supabase={s}")
    ma = await mongo.users.find_one({"username": "admin"})
    sa = await pg.fetchrow("select id from sonar.users where username='admin'")
    print("admin id mongo:", ma and str(ma["_id"]), "supabase:", sa["id"])
    # orphans: registrations photo paths without a files row
    orph = await pg.fetchval("select count(*) from sonar.registrations r, unnest(r.photo_paths) p "
                             "where not exists (select 1 from sonar.files f where f.storage_path = p)")
    print("photo_paths without files row:", orph)
    rows = await pg.fetch("select photo_paths from sonar.registrations where status='approved' and cardinality(photo_paths) > 0 "
                          "and created_at < now() - interval '1 hour' limit 3")
    await pg.close()
    tok = requests.post(f"{BASE}/api/auth/login", json={"username": "admin", "password": "Admin@123"}).json()["token"]
    for r in rows:
        p = r["photo_paths"][0]
        g = requests.get(f"{BASE}/api/files/{p}", params={"token": tok}, timeout=30)
        print("old photo", p[-40:], g.status_code, len(g.content), g.headers.get("content-type"))


asyncio.run(main())
