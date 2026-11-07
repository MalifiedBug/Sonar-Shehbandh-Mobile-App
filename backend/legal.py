"""Public legal pages (no login): Privacy Policy, Terms of Service and Account Deletion.
URLs to enter in Google Play Console: <backend>/api/legal/privacy and <backend>/api/legal/account-deletion."""
import os
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(prefix="/legal")

APP = "Sonar Shehbandh Community"
UPDATED = "June 2026"


def _contact() -> str:
    email = os.environ.get("PRIVACY_CONTACT_EMAIL", "").strip()
    inapp = "the <b>Complaints &amp; Suggestions</b> screen inside the app (Profile → Services → Complaints)"
    return f'email <a href="mailto:{email}">{email}</a> or use {inapp}' if email else f"use {inapp}"


def _page(title: str, body: str) -> HTMLResponse:
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>{title} – {APP}</title>
<style>
body{{margin:0;background:#FBF7EE;color:#1F1F1F;font:16px/1.65 -apple-system,Segoe UI,Roboto,sans-serif}}
main{{max-width:760px;margin:0 auto;padding:32px 20px 64px}}
h1{{color:#8B1818;font-size:28px;margin:0 0 4px}} h2{{color:#0A2540;font-size:19px;margin:28px 0 8px}}
.meta{{color:#6B6B6B;font-size:14px;margin-bottom:24px}} a{{color:#008080}}
.card{{background:#FFFDF7;border:1px solid #E0E0E0;border-radius:16px;padding:16px 20px;margin:16px 0}}
li{{margin:4px 0}} table{{border-collapse:collapse;width:100%}} td,th{{border:1px solid #E0E0E0;padding:8px;text-align:left;font-size:14px}}
</style></head><body><main><h1>{title}</h1><div class="meta">{APP} · Last updated {UPDATED}</div>{body}</main></body></html>"""
    return HTMLResponse(html)


@router.get("/privacy", response_class=HTMLResponse)
async def privacy():
    return _page("Privacy Policy", f"""
<p>This policy explains what information the {APP} app ("the app") collects, why, who can see it, and the choices you have.
The app is run by the Sonar Shehbandh community committee ("we") as a private community portal.</p>

<h2>1. Information we collect</h2>
<table><tr><th>Data</th><th>Examples</th><th>Why</th></tr>
<tr><td>Account</td><td>Name, username, password (stored only as a secure hash)</td><td>Sign in and identify your submissions</td></tr>
<tr><td>Family member registration</td><td>Names, date of birth, blood group, education, occupation, address, PIN code, mobile numbers, emergency contact, photos</td><td>Community family registry</td></tr>
<tr><td>Matrimony biodata</td><td>Personal details, height, birth time and place, rashi/nakshatra and other horoscope details, education, income, family details, partner expectations, photos</td><td>Matrimony matching within the community</td></tr>
<tr><td>Business listing</td><td>Business name, category, address, phone, WhatsApp, email, Udyam / Shop Act / GST numbers, photos</td><td>Business directory and verification</td></tr>
<tr><td>Social worker listing</td><td>Name, area of work, phone, WhatsApp, photo</td><td>Social workers directory</td></tr>
<tr><td>Payments</td><td>Plan bought, amount, order status (card/UPI details are handled by Razorpay, never by us)</td><td>Membership plans</td></tr>
<tr><td>Device</td><td>Push notification token</td><td>Send alerts you asked for (approvals, news, events)</td></tr>
<tr><td>Complaints</td><td>Text you submit</td><td>Respond to your complaint or suggestion</td></tr></table>
<p>We do not collect your location, contacts, call logs or advertising ID, and we do not show ads.</p>

<h2>2. Who can see your information</h2>
<ul>
<li>Every submission is reviewed by the committee (admins) before it becomes visible.</li>
<li>Approved listings are visible only to signed-in community members, never to the public internet.</li>
<li>Full matrimony biodata, extra matrimony photos and business phone/WhatsApp/email are visible only to members with an active plan.</li>
<li>Government IDs (GST, Udyam, Shop Act numbers) and family emergency contacts are visible only to you and the committee.</li>
<li>You can always see everything you submitted under <b>Profile → My Submissions</b>.</li></ul>

<h2>3. Service providers</h2>
<ul><li><b>Supabase</b> – secure database and photo storage.</li>
<li><b>Razorpay</b> – processes plan payments.</li>
<li><b>Emergent</b> – app hosting and push notification delivery.</li></ul>
<p>They process data only to provide these services. We never sell your personal data.</p>

<h2>4. Security</h2>
<p>Data is encrypted in transit (HTTPS). Passwords are hashed, photos are stored in a private bucket and served only to signed-in users,
and repeated wrong passwords lock the account temporarily.</p>

<h2>5. Retention and deletion</h2>
<p>We keep your data while your account exists. Matrimony profiles expire automatically. You can delete your account and all its data
at any time — see <a href="account-deletion">Account Deletion</a>.</p>

<h2>6. Your choices</h2>
<ul><li>Edit or withdraw a submission by contacting the committee.</li>
<li>Turn notifications off at any time in your phone settings.</li>
<li>Delete your account from inside the app.</li></ul>

<h2>7. Children</h2>
<p>The app is meant for adults (18+). Details of minors are added only by a parent or guardian as part of a family registration.</p>

<h2>8. Contact</h2>
<p>For any privacy question, {_contact()}.</p>
<p>We may update this policy; the date at the top shows the latest version. See also our <a href="terms">Terms of Service</a>.</p>
""")


@router.get("/terms", response_class=HTMLResponse)
async def terms():
    return _page("Terms of Service", f"""
<p>By creating an account in {APP} you agree to these terms.</p>
<h2>1. Eligibility</h2><p>You must be 18 or older and provide true information about yourself and your family.</p>
<h2>2. Your content</h2><p>You are responsible for what you submit. Submissions are reviewed by the committee, who may approve, reject or remove any listing that is false, offensive or against community rules. Each module also has its own terms that you accept before submitting.</p>
<h2>3. Respectful use</h2><p>Do not misuse contact details of other members, send spam, harass anyone, or copy directory data outside the app.</p>
<h2>4. Plans and payments</h2><p>Paid plans unlock extra features for the period shown at purchase. Payments are processed by Razorpay.</p>
<h2>5. Matrimony</h2><p>The committee does not guarantee any match. Families must verify all details themselves before proceeding.</p>
<h2>6. Account</h2><p>Keep your password private. You can delete your account at any time from Profile → Delete Account.</p>
<h2>7. Changes</h2><p>We may update these terms; continued use means you accept the updated terms.</p>
<h2>8. Contact</h2><p>Questions? {_contact()}.</p>
<p>See also our <a href="privacy">Privacy Policy</a>.</p>
""")


@router.get("/account-deletion", response_class=HTMLResponse)
async def account_deletion():
    return _page("Delete Your Account", f"""
<p>You can permanently delete your {APP} account and all data linked to it at any time.</p>
<div class="card"><h2 style="margin-top:0">Delete from the app (instant)</h2><ol>
<li>Open the app and sign in.</li><li>Tap the <b>Profile</b> tab.</li>
<li>Scroll down and tap <b>Delete Account</b>.</li><li>Type <b>DELETE</b> to confirm and tap <b>Delete permanently</b>.</li></ol></div>
<div class="card"><h2 style="margin-top:0">Can't open the app? Delete here</h2>
<form method="post" action="delete-account" style="display:grid;gap:10px">
<input name="username" placeholder="Username" required autocomplete="username" style="padding:12px;border:1px solid #ccc;border-radius:10px;font-size:16px">
<input name="password" type="password" placeholder="Password" required autocomplete="current-password" style="padding:12px;border:1px solid #ccc;border-radius:10px;font-size:16px">
<input name="confirm" placeholder="Type DELETE to confirm" required style="padding:12px;border:1px solid #ccc;border-radius:10px;font-size:16px">
<button type="submit" style="padding:14px;border:0;border-radius:10px;background:#D32F2F;color:#fff;font-weight:700;font-size:16px">Delete my account permanently</button>
</form>
<p>Forgot your password? {_contact()}, giving your username, and the committee will delete the account within 7 days.</p></div>
<h2>What is deleted</h2><ul>
<li>Your account (name, username, password)</li><li>All your registrations: family members, matrimony biodata, business and social worker listings</li>
<li>All photos you uploaded</li><li>Shortlists, notifications, complaints, plan and payment records</li>
<li>Your device's link to push notifications (you will stop receiving alerts)</li></ul>
<h2>What is kept</h2><p>Nothing is kept in the app. Razorpay may keep its own payment transaction records as required by Indian law.</p>
<p>Deletion cannot be undone. See our <a href="privacy">Privacy Policy</a>.</p>
""")
