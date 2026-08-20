# Test Credentials — One10 Durgotsav 2026 Portal

Authentication: **Emergent-managed Google OAuth** (no app-managed passwords).
Sessions are stored in Mongo. To test auth-gated endpoints, inject a session directly.

- **DB name:** `one10_durgotsav_2026`
- **Users collection:** `users` (custom `user_id`, unique `email`)
- **Sessions collection:** `user_sessions` (`session_token`, `user_id`, `expires_at`)
- Backend reads token from `session_token` cookie OR `Authorization: Bearer <token>`.
- First real Google login (or emails in `BOOTSTRAP_ADMIN_EMAILS`) becomes `system_admin` + `convenor`.

## Demo committee users (preview-only, seeded at startup)
| email | role(s) |
|---|---|
| superadmin@one10.test | system_admin |
| convenor@one10.test | convenor |
| treasurer@one10.test | treasurer |
| collector@one10.test | collector |
| recon@one10.test | reconciliation_officer |
| auditor@one10.test | auditor |
| budget@one10.test | budget_owner |
| procure.maker@one10.test | procurement_maker |
| procure.approver@one10.test | procurement_approver |
| pay.maker@one10.test | payment_maker |
| pay.approver@one10.test | payment_approver |
| coordinator@one10.test | coordinator |
| custodian@one10.test | inventory_custodian |

## Create a session for a demo user (mongosh)
```
mongosh one10_durgotsav_2026 --quiet --eval '
var u = db.users.findOne({email:"treasurer@one10.test"});
var token = "test_session_" + Date.now();
db.user_sessions.insertOne({user_id:u.user_id, session_token:token, expires_at:new Date(Date.now()+7*24*3600*1000), created_at:new Date()});
print(token);'
```
Then call APIs with header `Authorization: Bearer <token>`.

## Razorpay (test mode)
- `RAZORPAY_MODE=test`, placeholder keys in `backend/.env`.
- Webhook secret: value of `RAZORPAY_WEBHOOK_SECRET` (compute `HMAC_SHA256(rawBody, secret)` for `X-Razorpay-Signature`).
- Checkout signature: `HMAC_SHA256("{order_id}|{payment_id}", RAZORPAY_KEY_SECRET)`.
- Preview-only `POST /api/payments/simulate` runs the real verified path (disabled when mode=live).
