# Sonar Shehbandh Community App — Plan

A bilingual (English / मराठी) community mobile app for Sonar Samaj under the banner "॥ जय श्री संत नरहरी महाराज ॥".
Members register families, businesses, social workers and matrimony biodata; a committee admin approves every entry before the whole community can see it.

## Who it's for
- **Community members** — register their family, list a business, apply as a social worker, submit matrimony biodata, and browse the approved directories, news, events, rules and emergency numbers.
- **Committee admin** — reviews every registration and news/event post, approves or rejects listings, and removes listings when needed.

## Core features and experience
- **Sign in with username and password.** New users create an account; one admin account manages approvals. Browsing and registering need a signed-in account.
- **Dashboard** — the header title, a 3×3 card grid (Add New Members, Social Workers, Business Directory, News, Matrimony, Events, Notice Board with a "New" badge, Rules, Emergency numbers) and a full-width "More" pill button.
- **Terms before every form** — each card opens its own scrollable terms dialog (Membership, Matrimony, Business, Social Worker, News & AI) with the exact clauses and accept/decline buttons from the spec. Accepting opens the form; declining returns to the dashboard.
- **Four registration forms, field-for-field as specified:**
  - New Member Registration — 7 sections including the repeatable family-member list, native place with "same as current address", and emergency contact.
  - Matrimony Biodata — Groom / Bride / Divorced-Remarriage tabs, 3 mandatory photos, astrological details, education, family, repeatable relatives list, partner expectations.
  - Business Registration — logo, 1 shop-front photo, 3 interior photos, owner details, address and licence numbers (Udyam, Shop Act, GST, BIS hallmark).
  - Social Worker Registration — photo, contact, area of operation, experience, 1000-character contribution note, references.
- **Shared behaviours on every form:**
  - Labels always shown as "English / मराठी", required fields marked with *.
  - Every dropdown uses the exact lists from the spec (19 sub-castes, 12 rashis, 27 nakshatras, 10 gotras, blood groups, etc.), unchanged.
  - Circular photo picker with a 1.0×–3.0× zoom slider. The zoom/crop saves with the photo.
  - Entering a 6-digit PIN code fills Taluka, District and State automatically. All three stay editable.
  - A light-blue "CONVERT TO ENGLISH / कन्व्हर्ट टू इंग्लिश" button turns Marathi text in name and address fields into English letters using the spec's letter-mapping table. The user can check and edit the result before saving.
  - Checks for mobile numbers (10 digits, starting 6–9), email, PIN code, GST format, and the minimum age for matrimony (bride 18+, groom 21+).
  - Red outlined "Decline / नकार" and a filled "Save / सेव्ह करा" button. Save stays disabled until required fields are filled and the declaration box is ticked.
- **Directories (approved entries only):** Members, Business Directory, Social Workers and Matrimony profiles, each with search and a sub-caste filter. Each has a detail view. Matrimony profiles show a formatted biodata page and display "valid until" (1 year from approval).
- **My Submissions** — each user sees their own entries with status: Pending / Approved / Rejected.
- **Admin panel** — lists pending registrations by type, opens the full details and photos, and approves, rejects or removes entries. The admin also posts News (tagged Village / Taluka / District / State), Events, and Notice Board circulars.
- **News** — admin-posted news only (no AI in this version), filterable by Village → Taluka → District → State.
- **Events & Notice Board** — one screen with two tabs. The Notice Board card opens the Notice Board tab directly.
- **Rules** — Sanstha bylaws and constitution text, editable by admin.
- **Emergency numbers** — Police, Ambulance, Fire, Blood bank and community helplines. Tap a number to call.
- **More sheet** — lists the 7 items (Flat Allocation, Maintenance Records, Meeting Minutes, Expense Audits, Vendor Contracts, Asset Register, Complaints & Suggestions). Complaints & Suggestions works in this version; the other six show "Coming soon".

## User flow
1. Open app → sign in or create an account.
2. Dashboard → tap a card → read and accept the terms → fill in the form (photos, PIN auto-fill, Convert to English) → tick the declaration → Save.
3. The entry shows as "Pending" in My Submissions.
4. The admin signs in → Admin panel → reviews and approves it.
5. The entry appears in its directory for all signed-in members.

## UI/UX feel
Traditional and devotional but clean. The deep maroon (#8B1818 / #B71C1C) title and accents, warm off-white cards (#FFFDF7) with thin grey borders, navy/teal (#0A2540 / #008080) action buttons, the light-blue transliteration box (#E0F2FE / #0288D1) and red decline buttons (#D32F2F) follow the spec. Fonts support Devanagari so Marathi text displays cleanly. Long forms are split into clear section headings, with large tap targets and sticky Decline/Save buttons.

## Implementation phases
**Phase 1 — MVP (built now)**
Sign-in, dashboard, all five terms dialogs, all four registration forms with photos, zoom, PIN auto-fill, Convert to English and validation. Also: admin approval panel, the four directories, My Submissions, admin-posted News, Events & Notice Board, Rules, Emergency numbers, the More sheet, and Complaints & Suggestions.

**Phase 2**
The remaining More sheet modules (Flat Allocation, Maintenance, Meeting Minutes, Expense Audits, Vendor Contracts, Asset Register), the Wings & Housing and Vehicle Registry screens, and a downloadable/shareable biodata PDF. Matrimony renewal reminders before the 1-year expiry. Editing an entry after it is submitted.

**Phase 3**
AI-written news digests with cited sources. Multiple admins / committee roles per district. Extra matrimony search filters (rashi, height, income). Password reset.

## Assumptions
- The build is an Expo mobile app (Android + iOS), not native Jetpack Compose. The spec's screens, labels and flow are kept.
- Accounts use a username + password chosen by the user. One admin account is created up front; its login details are shared at handover.
- Only signed-in users can see directories and matrimony profiles. Matrimony contact details are visible only to signed-in members.
- Photos are stored online in managed cloud storage, not on the phone.
- PIN code lookup uses the free public India Post service. If it doesn't respond, the user types Taluka/District/State manually.
- Convert to English uses only the spec's letter-mapping table. It is not a dictionary, so some spellings may need manual correction.
- One user can submit several entries (e.g. a family registration plus a business).
- Rules text and emergency numbers start as editable sample content until the committee replaces them.
- Matrimony validity counts 365 days from admin approval; expired profiles are hidden from the directory.
- The app interface always shows both languages; there is no separate language switch.
