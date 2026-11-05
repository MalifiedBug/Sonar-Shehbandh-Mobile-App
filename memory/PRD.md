# Sonar Shehbandh Community App — PRD

## Original problem
Bilingual (English / मराठी) Sonar Samaj community portal under the header "॥ जय श्री संत नरहरी महाराज ॥". Dashboard 3×3 grid + More sheet, terms dialogs before every registration, 4 registration forms (Member, Matrimony, Business, Social Worker), canonical dropdowns (19 sub-castes, rashis, nakshatras, gotras…), photo zoom 1.0–3.0×, PIN auto-fill, Devanagari→English transliteration, Decline/Save actions.

## Architecture
- Expo Router (SDK 58) frontend; FastAPI + MongoDB backend; Emergent Object Storage for photos.
- Auth: username + password (bcrypt + JWT). Admin is seeded from backend/.env (admin / Admin@123).
- Form system is driven by a schema (src/forms.ts). One generic form screen (app/register/[type].tsx), one directory screen, one detail screen.
- PIN lookup goes through a backend proxy to api.postalpincode.in, with results cached in MongoDB.

## Implemented (2026-06)
- Login/Signup; dashboard grid; More sheet (Complaints works, the other 6 show "Coming soon")
- 5 terms dialogs; 4 forms with photos, zoom, PIN fill, Convert to English, validation and consent gating
- Server-side validation (phones, pincode, email, matrimony age, 3 matrimony photos, photo ownership)
- Admin panel: pending/approved/rejected review, approve/reject/remove, posting news/events/notices, complaints, rules & emergency editor
- Directories (approved only) with search and sub-caste chips; matrimony biodata view with 365-day validity
- My Submissions with status; News with level filter; Events & Notice Board tabs; Rules; Emergency tap-to-call
- Photo privacy: only the owner, the admin, or anyone viewing an approved listing can see a photo

## Push notifications (2026-06)
- Emergent managed push relay: POST /api/register-push (binds the device to the logged-in user), send_push helper, fire-and-forget notify()
- Triggers: entry approved/rejected → owner; news/event/notice posted → all members; new submission or complaint → admins
- Frontend: handler + Android channel at module scope, warm/cold tap routing, weekly settings nudge, registration on every app open
- PENDING: frontend/google-services.json. The file the user supplied was for package com.aistudio.societymanager.smgr; the app's package is com.emergent.sonarshehbandh.hxexh3. Once the correct file arrives, set expo.android.googleServicesFile in app.json. FIREBASE_ANDROID_API_KEY is saved in the backend secrets.

## Notification Inbox (2026-06)
- Every alert is stored per user in `notifications`, written before the push is sent, so nothing is lost if a push fails
- Dashboard bell with unread badge; /notifications screen with tap-to-open, unread dots, Read all
- Complaint alerts open Admin → Complaints tab

## Supabase migration (2026-06)
- Database moved from MongoDB to Supabase Postgres, in its own schema `sonar` so the user's existing public tables are never touched
- Schema: backend/migrations/001_init.sql (runs on every start, safe to repeat). RLS is on and phone/browser keys get no access; the FastAPI server connects directly with asyncpg
- Photos moved to a private Supabase Storage bucket `sonar-photos`, still served only through /api/files with the same privacy checks
- Secrets: SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_DB_URL (session pooler; password replaced from SUPABASE_DB_PASSWORD)
- One-off copy script: backend/migrate_mongo_to_supabase.py (safe to re-run) copied users, entries, posts, settings, complaints, alerts and photos
- App API unchanged, so no frontend changes; existing logins keep working because user ids were preserved

## Iteration 4 (2026-06)
- Social Workers & Business cards open their directories; full-width "Add Yourself as Social Worker" / "Register Business" buttons → terms → form
- Social worker form pre-filled from the user's own family registration (or account name); business photo pickers stacked
- News: level chips removed; every news/event/notice opens its own page /post/[id] (GET /api/posts/{id})
- Matrimony: browse screen /matrimony with profile grid, filters, search, shortlist (sonar.shortlists, /api/shortlist), and an Add Profile button
- omkarlolge made admin through EXTRA_ADMIN_USERNAMES (applied on startup)

## Payments — Cashfree (2026-06)
- 3 yearly plans, priced on the server only (backend/payments.py PLANS): Matrimony Plus ₹299 (full biodata + unlimited shortlist), Business Pro ₹999 (+ featured business), Samaj Patron ₹2499 (+ featured matrimony profile, patron badge)
- Flow: POST /api/payments/order → backend-hosted checkout page (Cashfree JS v3) opened with expo-web-browser → return page + webhook POST /api/payments/webhook (signature checked) → plan granted only after a server-side Get Order says PAID, exactly once
- Tables sonar.payments and sonar.subscriptions (migration 003). Free members can shortlist up to 5 profiles; without a plan, matrimony detail shows only basic fields (locked)
- Sandbox mode (CASHFREE_BASE_URL, CASHFREE_MODE). Go-live: production keys + api.cashfree.com + domain whitelisting + webhook URL in the Cashfree dashboard

## Backlog
- P1: Remaining More modules (Flat Allocation, Maintenance, Minutes, Audits, Vendors, Assets), Wings & Vehicles
- P1: Biodata PDF share, matrimony renewal reminder, edit after submit
- P2: AI news digests, multi-admin roles, advanced matrimony filters, password reset
- 2026-06: Fixed AndroidImportance lint error in app/_layout.tsx (named import).
- Backlog (user ask): Plan upgrade/downgrade with prorated difference charge or refund.
- 2026-06: Expo Go crash fixed (expo-notifications lazily loaded via src/notifications.ts, skipped in Expo Go/web). Fixed lint/TS errors, useLoad stale-response race, login-screen flash, offline logout. Tested iterations 6-7 pass.
- Open: deploy health check flags Supabase/Postgres as unsupported stack for Emergent deploy; no in-app account deletion (Apple review); test data (TEST_*) to clean before launch; google-services.json pending.
- 2026-06 Security hardening: business contacts (phone1/phone2/whatsapp/email) + matrimony full/half photos gated behind any paid plan; login lockout (5 wrong -> 15 min, migration 004_security.sql); token_version revocation via POST /api/auth/logout; web photos use 60-min scope=files token from GET /api/auth/file-token; bcrypt 72-byte check; CORS limited to CORS_ORIGINS env + emergent domains; backend/.env gitignored. Tested iteration 8 + test_iter8_security.py (22 pass).
- 2026-06: "Remember me" checkbox on login/signup (default on = 30-day token, off = 24h; server decides via `remember` bool). Custom flute notification sound: assets/sounds/flute_chime.wav, Android channel "alerts-flute", send_push data channel_id+sound. Weekly nudge when notifications denied: re-asks in-app if allowed, else opens Settings.
- 2026-06: Replaced Emergent splash/icon/favicon with Sonar Shehbandh gold-diamond branding (cream splash, maroon icon); app version 1.0.3.
- 2026-06 UX redesign phase 1 (no colour/info change): Plus Jakarta Sans (auto-mapped by fontWeight in makeStyles), bottom tab shell app/(tabs) [Home, Directory(/community), Matrimony, Alerts, Profile] with pill indicator + unread dot, new Home (top bar, pinned next event hero, quick access grid, metrics, latest updates feed, businesses carousel, register CTA), Directory hub, Profile tab, directory cards with badges + Quick Call/WhatsApp/locked unlock. Shared kit in src/components/kit.tsx. Tested iteration 9.
- Next UX phases: matrimony, event/post detail, registration forms, emergency, admin.
- 2026-06 Play compliance: DELETE /api/users/me (purges storage objects, files, user -> cascades registrations/shortlists/notifications/complaints/payments/subscriptions; admins blocked). Public pages /api/legal/privacy, /api/legal/terms, /api/legal/account-deletion (backend/legal.py; optional env PRIVACY_CONTACT_EMAIL). Signup requires accepted_terms=true + consent checkbox. gst/udyam_no/shop_act_no and emergency_name/relation/phone hidden except owner/admin (hide_private). Push disclosure sheet before OS prompt (push.ts never prompts). Photo picker without permission; READ_MEDIA_IMAGES/VIDEO blocked in app.json.
- Web deletion form on /api/legal/account-deletion -> POST /api/legal/delete-account (username+password+DELETE, lockout rules apply); consent time stored in users.accepted_terms_at (migration 005).
