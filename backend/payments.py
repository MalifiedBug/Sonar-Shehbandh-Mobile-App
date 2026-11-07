"""Yearly plans paid through Razorpay (backend-hosted Checkout page + signature-verified callback + webhook + order check)."""
import hashlib
import hmac
import html
import json
import logging
import os
from datetime import timedelta
from typing import Dict, List

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

import database as pg

logger = logging.getLogger("payments")

RZP_API = "https://api.razorpay.com/v1"
PUBLIC_API = os.environ["PUBLIC_API_URL"].rstrip("/")


def _auth() -> tuple:
    return (os.environ["RAZORPAY_KEY_ID"], os.environ["RAZORPAY_KEY_SECRET"])


def _hmac(secret: str, msg: bytes) -> str:
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


# Prices live only on the server; the app sends just the plan id.
PLANS: Dict[str, dict] = {
    "silver": {
        "id": "silver", "rank": 1, "name": "Matrimony Plus / वधू-वर प्लस", "price": 299,
        "features": [
            "Full biodata and all photos of every matrimony profile (family, relatives, partner expectations)",
            "Phone, WhatsApp and email of every business in the directory",
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


async def fetch_rzp_order(order_id: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{RZP_API}/orders/{order_id}", auth=_auth())
    if r.status_code >= 400:
        raise HTTPException(502, "Could not check payment status")
    return r.json()


async def activate(row) -> None:
    """Grant / extend the plan by 1 year. Only called right after the payment row was claimed (-> PAID), so it runs once."""
    cur = await pg.fetchrow("select plan, expires_at from sonar.subscriptions where user_id = $1 and expires_at > now()", row["user_id"])
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
        row["user_id"], plan, start + timedelta(days=365), row["order_id"])


async def capture_authorized(order_id: str, amount_paise: int) -> str:
    """Fallback: capture an authorized payment of the right amount. Returns its payment id ('' if none)."""
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{RZP_API}/orders/{order_id}/payments", auth=_auth())
        if r.status_code >= 400:
            return ""
        items = r.json().get("items", [])
        for p in items:
            if p.get("status") == "captured" and int(p.get("amount", 0)) == amount_paise:
                return p["id"]
        for p in items:
            if p.get("status") == "authorized" and int(p.get("amount", 0)) == amount_paise:
                cr = await c.post(f"{RZP_API}/payments/{p['id']}/capture", auth=_auth(), json={"amount": amount_paise, "currency": "INR"})
                if cr.status_code < 400 or "already been captured" in cr.text:
                    return p["id"]
                logger.error(f"Capture failed for {p['id']}: {cr.status_code} {cr.text[:200]}")
    return ""


async def sync_order(order_id: str, payment_id: str = "") -> str:
    """Asks Razorpay for the real order status and activates the plan exactly once when fully paid."""
    row = await pg.fetchrow("select * from sonar.payments where order_id = $1", order_id)
    if not row:
        return "UNKNOWN"
    if row["status"] in ("PAID", "AMOUNT_MISMATCH", "EXPIRED"):
        return row["status"]
    if row["provider"] != "razorpay":  # old Cashfree orders can no longer be paid
        await pg.execute("update sonar.payments set status = 'EXPIRED' where order_id = $1 and status <> 'PAID'", order_id)
        return "EXPIRED"
    amount_paise = int(round(float(row["amount"]) * 100))
    rz = await fetch_rzp_order(order_id)
    if rz.get("status") != "paid":
        captured = await capture_authorized(order_id, amount_paise)
        if not captured:
            return row["status"]
        payment_id = payment_id or captured
        rz = await fetch_rzp_order(order_id)
    if rz.get("status") == "paid":
        if int(rz.get("amount_paid", 0)) != amount_paise:
            logger.error(f"Amount mismatch on {order_id}")
            await pg.execute("update sonar.payments set status = 'AMOUNT_MISMATCH' where order_id = $1 and status <> 'PAID'", order_id)
            return "AMOUNT_MISMATCH"
        if not payment_id:
            payment_id = await capture_authorized(order_id, amount_paise)
        claimed = await pg.fetchrow("update sonar.payments set status = 'PAID', paid_at = now(), "
                                    "razorpay_payment_id = coalesce(nullif($2, ''), razorpay_payment_id) "
                                    "where order_id = $1 and status <> 'PAID' returning *", order_id, payment_id)
        if claimed:
            await activate(claimed)
        return "PAID"
    return row["status"]


def _result_page(ok: bool, order_id: str) -> HTMLResponse:
    msg = "Payment successful! Your plan is active." if ok else "Payment not completed. If money was deducted, it will be refunded automatically."
    return HTMLResponse(f"""<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;text-align:center;padding:48px;background:#FBF7EE">
<h2 style="color:{'#2E7D32' if ok else '#B26A00'}">{html.escape(msg)}</h2>
<p>You can close this window and return to the app.</p><p style="color:#7A6E66;font-size:12px">Order: {html.escape(order_id)}</p>
</body></html>""")


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
        payload = {
            "amount": plan["price"] * 100,  # paise, from the server-side catalogue only
            "currency": "INR",
            "receipt": f"{plan['id']}_{user.id}"[:40],
            "notes": {"plan": plan["id"], "user_id": user.id},
            # Capture automatically so an authorized payment becomes "paid" (otherwise Razorpay refunds it after ~3 days).
            "payment": {"capture": "automatic",
                        "capture_options": {"automatic_expiry_period": 12, "manual_expiry_period": 7200, "refund_speed": "optimum"}},
        }
        async with httpx.AsyncClient(timeout=20) as c:
            resp = await c.post(f"{RZP_API}/orders", auth=_auth(), json=payload)
        if resp.status_code >= 400:
            logger.error(f"Razorpay create order failed {resp.status_code}: {resp.text[:300]}")
            raise HTTPException(502, "Could not start payment, please try again")
        order_id = resp.json()["id"]
        await pg.execute("insert into sonar.payments (order_id, user_id, plan, amount, status, provider, created_at) "
                         "values ($1, $2, $3, $4, 'ACTIVE', 'razorpay', now())",
                         order_id, user.id, plan["id"], plan["price"])
        return {"order_id": order_id, "amount": plan["price"], "checkout_url": f"{PUBLIC_API}/api/payments/checkout/{order_id}"}

    @r.get("/payments/checkout/{order_id}", response_class=HTMLResponse)
    async def checkout(order_id: str):
        row = await pg.fetchrow("select p.*, u.name from sonar.payments p join sonar.users u on u.id = p.user_id "
                                "where p.order_id = $1", order_id)
        if not row or row["status"] != "ACTIVE" or row["provider"] != "razorpay":
            return HTMLResponse("<h3>This payment link is no longer valid.</h3>", status_code=404)
        # json.dumps output is safe inside <script> except "</" sequences; escape them.
        opts = json.dumps({
            "key": os.environ["RAZORPAY_KEY_ID"],
            "amount": int(round(float(row["amount"]) * 100)),
            "currency": "INR",
            "name": "Sonar Shehbandh Community",
            "description": f"{PLANS[row['plan']]['name']} - 1 year",
            "order_id": order_id,
            "prefill": {"name": row["name"]},
            "theme": {"color": "#8B1818"},
            "callback_url": f"{PUBLIC_API}/api/payments/razorpay-callback",
            "redirect": True,
        }).replace("</", "<\\/")
        return HTMLResponse(f"""<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Secure payment</title><script src="https://checkout.razorpay.com/v1/checkout.js"></script></head>
<body style="font-family:sans-serif;text-align:center;padding:48px;color:#8B1818;background:#FBF7EE">
<h3>॥ जय श्री संत नरहरी महाराज ॥</h3><p id="m">Opening secure Razorpay checkout…</p>
<button id="b" style="display:none;padding:14px 22px;border:0;border-radius:10px;background:#008080;color:#fff;font-weight:700;font-size:16px">Pay now</button>
<script>
const o = {opts};
o.modal = {{ ondismiss: () => {{
  document.getElementById("m").textContent = "Payment cancelled. Tap Pay now to try again, or close this window.";
  document.getElementById("b").style.display = "inline-block";
}} }};
try {{ const rz = new Razorpay(o); document.getElementById("b").onclick = () => rz.open(); rz.open(); }}
catch (e) {{ document.getElementById("m").textContent = "Checkout could not be opened. Please go back and try again."; }}
</script></body></html>""")

    @r.post("/payments/razorpay-callback", response_class=HTMLResponse)
    async def razorpay_callback(request: Request):
        form = await request.form()
        order_id = str(form.get("razorpay_order_id", ""))
        payment_id = str(form.get("razorpay_payment_id", ""))
        signature = str(form.get("razorpay_signature", ""))
        if not order_id:
            # Failed attempt: Razorpay posts error[metadata] containing the order id.
            try:
                order_id = str(json.loads(str(form.get("error[metadata]", "{}"))).get("order_id", ""))
            except ValueError:
                order_id = ""
            return _result_page(False, order_id)
        expected = _hmac(os.environ["RAZORPAY_KEY_SECRET"], f"{order_id}|{payment_id}".encode())
        if not payment_id or not hmac.compare_digest(expected, signature):
            return _result_page(False, order_id)
        try:
            ok = await sync_order(order_id, payment_id) == "PAID"
        except HTTPException:
            ok = False
        return _result_page(ok, order_id)

    @r.get("/payments/{order_id}")
    async def payment_status(order_id: str, user=Depends(current_user)):
        row = await pg.fetchrow("select * from sonar.payments where order_id = $1 and user_id = $2", order_id, user.id)
        if not row:
            raise HTTPException(404, "Unknown order")
        status = row["status"] if row["status"] in ("PAID", "AMOUNT_MISMATCH", "EXPIRED") else await sync_order(order_id)
        sub = await pg.fetchrow("select plan, expires_at from sonar.subscriptions where user_id = $1 and expires_at > now()", user.id)
        return {"order_id": order_id, "status": status, "subscription": sub}

    @r.post("/payments/webhook")
    async def webhook(request: Request):
        secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
        if not secret:
            raise HTTPException(503, "Webhook not configured")
        raw = await request.body()  # verify the exact raw bytes before parsing
        if not hmac.compare_digest(_hmac(secret, raw), request.headers.get("x-razorpay-signature", "")):
            raise HTTPException(400, "Invalid webhook signature")
        try:
            body = json.loads(raw)
            payload = body.get("payload") or {}
            entity = (payload.get("payment") or {}).get("entity") or {}
            order_id = entity.get("order_id") or ((payload.get("order") or {}).get("entity") or {}).get("id")
        except (ValueError, AttributeError):
            raise HTTPException(400, "Invalid payload")
        event = body.get("event", "")
        if order_id and event in ("order.paid", "payment.captured"):
            try:
                await sync_order(str(order_id), entity.get("id", ""))  # idempotent: re-checks with Razorpay
            except HTTPException:
                raise HTTPException(502, "Could not verify order")  # Razorpay retries
        # payment.failed is ignored on purpose: the member can retry on the same order.
        return {"ok": True}

    return r
