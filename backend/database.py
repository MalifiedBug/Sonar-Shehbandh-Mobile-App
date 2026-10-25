"""Supabase Postgres access (server-side only) via a direct database connection."""
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, List, Optional
from urllib.parse import unquote

import asyncpg

_pool: Optional[asyncpg.Pool] = None
MIGRATIONS = Path(__file__).parent / "migrations"


def _conn_params() -> dict:
    # SUPABASE_DB_URL gives host/port/user; the password comes from its own secret.
    url = os.environ["SUPABASE_DB_URL"].strip()
    rest = url.split("://", 1)[1]
    cred, hostpart = rest.rsplit("@", 1)
    hp, _, dbq = hostpart.partition("/")
    host, port = hp.rsplit(":", 1)
    return {
        "user": unquote(cred.split(":", 1)[0]),
        "password": os.environ["SUPABASE_DB_PASSWORD"],
        "host": host,
        "port": int(port),
        "database": dbq.split("?")[0] or "postgres",
    }


async def _init_conn(conn):
    for t in ("json", "jsonb"):
        await conn.set_type_codec(t, encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


async def _noop_reset(conn):
    # Skip asyncpg's per-release RESET ALL round trip; we don't change session state.
    return None


async def connect():
    global _pool
    # Session pooler keeps one server connection per client, so prepared statements (the cache) are safe.
    _pool = await asyncpg.create_pool(**_conn_params(), min_size=2, max_size=12, init=_init_conn,
                                      reset=_noop_reset, command_timeout=30)


async def close():
    if _pool:
        await _pool.close()


async def migrate():
    async with _pool.acquire() as c:
        for f in sorted(MIGRATIONS.glob("*.sql")):
            await c.execute(f.read_text())


def now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex[:24]


def _row(r) -> Optional[dict]:
    if r is None:
        return None
    d = dict(r)
    for k, v in d.items():
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


async def fetch(sql: str, *args) -> List[dict]:
    async with _pool.acquire() as c:
        return [_row(r) for r in await c.fetch(sql, *args)]


async def fetchrow(sql: str, *args) -> Optional[dict]:
    async with _pool.acquire() as c:
        return _row(await c.fetchrow(sql, *args))


async def fetchval(sql: str, *args) -> Any:
    async with _pool.acquire() as c:
        return await c.fetchval(sql, *args)


async def execute(sql: str, *args) -> int:
    """Runs a statement and returns the number of affected rows."""
    async with _pool.acquire() as c:
        status = await c.execute(sql, *args)
    try:
        return int(status.split()[-1])
    except (ValueError, IndexError):
        return 0


async def executemany(sql: str, rows: List[tuple]):
    async with _pool.acquire() as c:
        await c.executemany(sql, rows)


def like(q: str) -> str:
    return "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
