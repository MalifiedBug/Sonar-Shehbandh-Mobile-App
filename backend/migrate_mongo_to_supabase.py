"""One-off copy of the existing MongoDB data + Emergent-stored photos into Supabase.

Safe to re-run: rows use ON CONFLICT DO NOTHING and photos already in the bucket are skipped.
Usage: cd /app/backend && python migrate_mongo_to_supabase.py
"""
import asyncio
import os
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / ".env")
import database as pg  # noqa: E402
import storage  # noqa: E402

OLD_STORAGE = ((os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com").rstrip("/") + "/objstore/api/v1/storage"


def ts(v):
    if v is None or isinstance(v, datetime):
        return v
    return datetime.fromisoformat(str(v))


def old_storage_key():
    r = requests.post(f"{OLD_STORAGE}/init", json={"emergent_key": os.environ["EMERGENT_LLM_KEY"]}, timeout=30)
    r.raise_for_status()
    return r.json()["storage_key"]


async def main():
    mongo = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    await pg.connect()
    await pg.migrate()
    await asyncio.to_thread(storage.ensure_bucket)
    counts = {}

    async def copy(name, coll, sql, mapper):
        n = 0
        async for d in mongo[coll].find({}):
            try:
                n += await pg.execute(sql, *mapper(d))
            except Exception as e:
                print(f"  skip {coll} {d.get('_id')}: {type(e).__name__}: {str(e)[:120]}")
        counts[name] = n

    # Users first: the admin row seeded on startup may already exist under a new id, so re-point it by username.
    async for u in mongo.users.find({}):
        await pg.execute("delete from sonar.users where username = $1 and id <> $2 and not exists "
                         "(select 1 from sonar.registrations r where r.owner_id = sonar.users.id)", u["username"], str(u["_id"]))
    await copy("users", "users",
               "insert into sonar.users (id, username, name, password_hash, role, created_at) values ($1,$2,$3,$4,$5,$6) on conflict do nothing",
               lambda d: (str(d["_id"]), d["username"], d["name"], d["password_hash"], d.get("role", "user"), ts(d["created_at"])))
    await copy("files", "files",
               "insert into sonar.files (id, storage_path, owner_id, content_type, original_filename, size, created_at) values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing",
               lambda d: (str(d["_id"]), d["storage_path"], str(d["owner_id"]), d.get("content_type", "image/jpeg"), d.get("original_filename"), d.get("size", 0), ts(d["created_at"])))
    await copy("registrations", "registrations",
               "insert into sonar.registrations (id, type, title, sub_caste, data, photos, photo_paths, status, owner_id, owner_name, created_at, approved_at, expires_at, reject_reason) "
               "values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict do nothing",
               lambda d: (str(d["_id"]), d["type"], d["title"], d.get("sub_caste", ""), d.get("data", {}), d.get("photos", {}),
                          d.get("photo_paths") or [p["path"] for p in (d.get("photos") or {}).values() if isinstance(p, dict) and p.get("path")],
                          d.get("status", "pending"), str(d["owner_id"]), d.get("owner_name", ""), ts(d["created_at"]),
                          ts(d.get("approved_at")), ts(d.get("expires_at")), d.get("reject_reason")))
    await copy("posts", "posts",
               "insert into sonar.posts (id, kind, title, body, level, location, event_date, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing",
               lambda d: (str(d["_id"]), d["kind"], d["title"], d["body"], d.get("level"), d.get("location"), d.get("event_date"), ts(d["created_at"])))
    await copy("settings", "settings",
               "insert into sonar.settings (key, value) values ($1,$2) on conflict (key) do update set value = excluded.value",
               lambda d: (d["key"], d["value"]))
    await copy("complaints", "complaints",
               "insert into sonar.complaints (id, kind, subject, message, owner_id, owner_name, status, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing",
               lambda d: (str(d["_id"]), d["kind"], d["subject"], d["message"], str(d["owner_id"]), d.get("owner_name", ""), d.get("status", "open"), ts(d["created_at"])))
    await copy("notifications", "notifications",
               "insert into sonar.notifications (id, user_id, title, message, action_url, read, created_at) values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing",
               lambda d: (str(d["_id"]), str(d["user_id"]), d["title"], d["message"], d.get("action_url"), bool(d.get("read")), ts(d["created_at"])))
    await copy("pincodes", "pincodes",
               "insert into sonar.pincodes (pin, taluka, district, state, areas) values ($1,$2,$3,$4,$5) on conflict do nothing",
               lambda d: (d["pin"], d.get("taluka", ""), d.get("district", ""), d.get("state", ""), d.get("areas", [])))

    # Photos: copy each file from the old store into the private Supabase bucket under the same path.
    key = await asyncio.to_thread(old_storage_key)
    moved = skipped = failed = 0
    async for f in mongo.files.find({}):
        path = f["storage_path"]
        try:
            if await asyncio.to_thread(storage.exists, path):
                skipped += 1
                continue
            r = await asyncio.to_thread(lambda: requests.get(f"{OLD_STORAGE}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60))
            r.raise_for_status()
            await asyncio.to_thread(storage.put_object, path, r.content, f.get("content_type", "image/jpeg"))
            moved += 1
        except Exception as e:
            failed += 1
            print(f"  photo failed {path}: {type(e).__name__}: {str(e)[:120]}")
    counts["photos_copied"], counts["photos_already_there"], counts["photos_failed"] = moved, skipped, failed
    print("Copied:", counts)
    await pg.close()


if __name__ == "__main__":
    asyncio.run(main())
