"""Supabase Storage (private bucket) used only by the app server."""
import os

from supabase import Client, create_client

BUCKET = "sonar-photos"
ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]
MAX_BYTES = 8 * 1024 * 1024

_client: Client | None = None


def client() -> Client:
    global _client
    if _client is None:
        _client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])
    return _client


def ensure_bucket():
    names = [b.name for b in client().storage.list_buckets()]
    if BUCKET not in names:
        client().storage.create_bucket(BUCKET, options={
            "public": False, "file_size_limit": MAX_BYTES, "allowed_mime_types": ALLOWED_TYPES,
        })


def put_object(path: str, data: bytes, content_type: str) -> dict:
    client().storage.from_(BUCKET).upload(path=path, file=data, file_options={
        "content-type": content_type, "cache-control": "86400", "upsert": "false",
    })
    return {"path": path}


def get_object(path: str) -> bytes:
    return client().storage.from_(BUCKET).download(path)


def exists(path: str) -> bool:
    folder, _, name = path.rpartition("/")
    return any(o.get("name") == name for o in client().storage.from_(BUCKET).list(folder, {"search": name}))
