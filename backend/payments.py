"""Yearly plans paid through Cashfree (backend-hosted checkout page + webhook + server-side order check)."""
import base64
import hashlib
import hmac
import html
import json
import logging
import os
import uuid
from datetime import timedelta
from typing import Dict, List

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

import database as pg

logger = logging.getLogger("payments")

CF_VERSION = "2025-01-01"
CF_BASE = os.environ["CASHFREE_BASE_URL"].rstrip("/")
CF_MODE = os.environ.get("CASHFREE_MODE", "sandbox")
PUBLIC_API = os.environ["PUBLIC_API_URL"].rstrip("/")


def _cf_headers() -> dict:
    return {
        "x-client-id": os.environ["CASHFREE_APP_ID"],
        "x-client-secret": os.environ["CASHFREE_SECRET_KEY"],
        "x-api-version": CF_VERSION,
        "accept": "application/json",
        "content-type": "application/json",
    }


# Prices live only on the server; the app sends just the plan id.
PLANS: Dict[str, dict] = {
    "silver": {
        "id": "silver", "rank": 1, "name": "Matrimony Plus / वधू-वर प्लस", "price": 299,
        "features": [
            "Full biodata of every matrimony profile (family, relatives, partner expectations)",
            "Unlimited shortlisting of profiles",
            "Valid for 1 year",
        ],
    },
    "gold": {
        "id": "gold", "rank": 2, "name": "Business Pro / व्यवसाय प्रो", "price": 999,
        "features": [
            "Everything in Matrimony Plus",
            "Your business shown at the top of the Business Directory with a Featured badge",
            "Valid for 1 year",
        ],
    },
    "platinum": {
        "id": "platinum", "rank": 3, "name": "Samaj Patron / समाज आश्रयदाता", "price": 2499,
        "features": [
            "Everything in Business Pro",
            "Your matrimony profile featured at the top of Matrimony",
            "Patron badge — supports the Sanstha's community work",
            "Valid for 1 year",
        ],
    },
}


async def active_rank(user_id: str) -> int:
    plan = await pg.fetchval("select plan from sonar.subscriptions where user_id = $1 and expires_at > now()", user_id)
    return PLANS[plan]["rank"] if plan in PLANS else 0


async def ranks_for(user_ids: List[str]) -> Dict[str, int]:
    if not user_ids:
        return {}
    rows = await pg.fetch("select user_id, plan from sonar.subscriptions where user_id = any($1::text[]) and expires_at > now()",
                          list(set(user_ids)))
    return {r["user_id"]: PLANS.get(r["plan"], {}).get("rank", 0) for r in rows}


async def fetch_cf_order(order_id: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{CF_BASE}/orders/{order_id}", headers=_cf_headers())
    if r.status_code >= 400:
        raise HTTPException(502, "Could not check payment status")
    return r.json()


async def sync_order(order_id: str) -> str:
    """Asks Cashfree for the real order status and activates the plan exactly once when PAID."""
    cf = await fetch_cf_order(order_id)
    status = cf.get("order_status", "ACTIVE")
    row = await pg.fetchrow("select * from sonar.payments where order_id = $1", order_id)
    if not row:
        return status
    if status == "PAID":
        if abs(float(cf.get("order_amount", 0)) - float(row["amount"])) > 0.001:
            logger.error(f"Amount mismatch on {order_id}")
            return "AMOUNT_MISMATCH"
        claimed = await pg.fetchrow("update sonar.payments set status = 'PAID', paid_at = now() "
                                    "where order_id = $1 and status <> 'PAID' returning *", order_id)
        if claimed:  # first time we see it paid -> grant / extend 1 year
            cur = await pg.fetchrow("select plan, expires_at from sonar.subscriptions where user_id = $1 and expires_at > now()",
                                    row["user_id"])
            start = pg.now()
            plan = row["plan"]
            if cur:
                from datetime import datetime
                start = datetime.fromisoformat(cur["expires_at"])
                if PLANS.get(cur["plan"], {}).get("rank", 0) > PLANS[plan]["rank"]:
                    plan = cur["plan"]
            await pg.execute(
                "insert into sonar.subscriptions (user_id, plan, expires_at, last_order_id, updated_at) values ($1, $2, $3, $4, now()) "
                "on conflict (user_id) do update set plan = excluded.plan, expires_at = excluded.expires_at, "
                "last_order_id = excluded.last_order_id, updated_at = now()",
                row["user_id"], plan, start + timedelta(days=365), order_id)
    elif status in ("EXPIRED", "TERMINATED") and row["status"] != "PAID":
        await pg.execute("update sonar.payments set status = $2 where order_id = $1", order_id, status)
    return status


class OrderIn(BaseModel):
    plan: str


def make_router(current_user) -> APIRouter:
    r = APIRouter(prefix="/api")

    @r.get("/plans")
    async def plans(user=Depends(current_user)):
        sub = await pg.fetchrow("select plan, expires_at from sonar.subscriptions where user_id = $1 and expires_at > now()", user.id)
        return {"plans": list(PLANS.values()), "current": sub}

    @r.post("/payments/order")
    async def create_order(body: OrderIn, user=Depends(current_user)):
        plan = PLANS.get(body.plan)
        if not plan:
            raise HTTPException(400, "Unknown plan")
        if await active_rank(user.id) > plan["rank"]:
            raise HTTPException(409, "Your current plan already includes this one")
        member = await pg.fetchrow("select data from sonar.registrations where owner_id = $1 and type = 'member' "
                                   "order by created_at desc limit 1", user.id)
        phone = ((member or {}).get("data") or {}).get("primary_mobile") or "9999999999"
        order_id = f"sonar_{plan['id']}_{uuid.uuid4().hex[:16]}"
        payload = {
            "order_id": order_id,
            "order_amount": float(plan["price"]),
            "order_currency": "INR",
            "customer_details": {"customer_id": user.id, "customer_name": user.name[:100], "customer_phone": phone},
            "order_meta": {"return_url": f"{PUBLIC_API}/api/payments/return?order_id={order_id}"},
            "order_note": f"{plan['name']} - 1 year",
            "order_tags": {"plan": plan["id"]},
        }
        async with httpx.AsyncClient(timeout=20) as c:
            resp = await c.post(f"{CF_BASE}/orders", headers=_cf_headers(), json=payload)
        if resp.status_code >= 400:
            logger.error(f"Cashfree create order failed {resp.status_code}: {resp.text[:300]}")
            raise HTTPException(502, "Could not start payment, please try again")
        cf = resp.json()
        await pg.execute("insert into sonar.payments (order_id, user_id, plan, amount, status, payment_session_id, created_at) "
                         "values ($1, $2, $3, $4, 'ACTIVE', $5, now())",
                         order_id, user.id, plan["id"], plan["price"], cf["payment_session_id"])
        return {"order_id": order_id, "amount": plan["price"], "checkout_url": f"{PUBLIC_API}/api/payments/checkout/{order_id}"}

    @r.get("/payments/checkout/{order_id}", response_class=HTMLResponse)
    async def checkout(order_id: str):
        row = await pg.fetchrow("select payment_session_id, status from sonar.payments where order_id = $1", order_id)
        if not row or row["status"] != "ACTIVE":
            return HTMLResponse("<h3>This payment link is no longer valid.</h3>", status_code=404)
        sid = json.dumps(row["payment_session_id"])
        mode = json.dumps(CF_MODE)
        return HTMLResponse(f"""<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Secure payment</title><script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script></head>
<body style="font-family:sans-serif;text-align:center;padding:48px;color:#8B1818">
<h3>॥ जय श्री संत नरहरी महाराज ॥</h3><p>Opening secure Cashfree checkout…</p>
<script>
(async () => {{
  const cashfree = Cashfree({{ mode: {mode} }});
  await cashfree.checkout({{ paymentSessionId: {sid}, redirectTarget: "_self" }});
}})().catch(() => {{ document.body.innerHTML = "<h3>Checkout could not be opened. Please go back and try again.</h3>"; }});
</script></body></html>""")

    @r.get("/payments/return", response_class=HTMLResponse)
    async def payment_return(order_id: str):
        try:
            status = await sync_order(order_id)
        except HTTPException:
            status = "PENDING"
        ok = status == "PAID"
        msg = "Payment successful! Your plan is active." if ok else "Payment not completed yet."
        return HTMLResponse(f"""<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;text-align:center;padding:48px">
<h2 style="color:{'#2E7D32' if ok else '#B26A00'}">{html.escape(msg)}</h2>
<p>You can close this window and return to the app.</p><p style="color:#7A6E66;font-size:12px">Order: {html.escape(order_id)}</p>
</body></html>""")

    @r.get("/payments/{order_id}")
    async def payment_status(order_id: str, user=Depends(current_user)):
        row = await pg.fetchrow("select * from sonar.payments where order_id = $1 and user_id = $2", order_id, user.id)
        if not row:
            raise HTTPException(404, "Unknown order")
        status = row["status"] if row["status"] == "PAID" else await sync_order(order_id)
        sub = await pg.fetchrow("select plan, expires_at from sonar.subscriptions where user_id = $1 and expires_at > now()", user.id)
        return {"order_id": order_id, "status": status, "subscription": sub}

    @r.post("/payments/webhook")
    async def webhook(request: Request):
        raw = await request.body()
        ts = request.headers.get("x-webhook-timestamp", "")
        supplied = request.headers.get("x-webhook-signature", "")
        expected = base64.b64encode(hmac.new(os.environ["CASHFREE_SECRET_KEY"].encode(), ts.encode() + raw, hashlib.sha256).digest()).decode()
        if not ts or not hmac.compare_digest(expected, supplied):
            raise HTTPException(400, "Invalid webhook signature")
        try:
            body = json.loads(raw)
            order_id = (((body.get("data") or {}).get("order") or {}).get("order_id")) if isinstance(body, dict) else None
        except (ValueError, AttributeError):
            raise HTTPException(400, "Invalid payload")
        if order_id:
            try:
                await sync_order(str(order_id))
            except HTTPException:
                raise HTTPException(502, "Could not verify order")  # Cashfree will retry
        return {"ok": True}

    return r
