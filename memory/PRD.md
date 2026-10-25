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

## Backlog
- P1: Remaining More modules (Flat Allocation, Maintenance, Minutes, Audits, Vendors, Assets), Wings & Vehicles
- P1: Biodata PDF share, matrimony renewal reminder, edit after submit
- P2: AI news digests, multi-admin roles, advanced matrimony filters, password reset
