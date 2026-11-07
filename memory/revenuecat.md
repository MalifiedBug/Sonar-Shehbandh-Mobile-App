# RevenueCat — integrated (tested iterations 13-14) (2026-06)
## Identifiers
- rc_project_id: proj11931e7c
- apple_app_id: app157d3d7f50
- play_app_id: app641dd56adc
- entitlement_lookup_key: pro
- offering_lookup_key: default
- Packages: $rc_annual -> prod398a4529c1 (₹299 INR + $3.99 USD / P1Y, no trial). $rc_monthly deleted.
- Dashboard: https://app.revenuecat.com/projects/proj11931e7c
## Status check
curl -sS -H "$AUTH" "$INTEGRATION_PROXY_URL/internal/revenuecat/projects/f1ea4efb-f6cd-4ab3-8004-fb439a1a9820/status"
## Updates: POST .../projects/f1ea4efb-f6cd-4ab3-8004-fb439a1a9820/products (upsert), DELETE .../products/%24rc_monthly ; never call RevenueCat REST directly.
## Live: user uploads store credentials + creates matching store products (see payments panel FAQ).
## App design (owner's choice)
- One "Sonar Pro" yearly auto-renew sub on phones (Play/App Store); web keeps Razorpay 3 tiers. Pro = Matrimony Plus perks.
- Owner chose "unlocked on the phone": app sends X-Store-Pro: 1 when entitlement active; backend paid_rank() treats it as rank 1 (trusted header, no server verification per playbook).
- Code: frontend/src/revenuecat.tsx, src/components/StorePro.tsx, app/plans.tsx, app/_layout.tsx (module-scope init).
