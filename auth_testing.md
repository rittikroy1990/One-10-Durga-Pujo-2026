# Auth-Gated App Testing Playbook (Emergent Google Auth)

App uses Emergent Google OAuth. No app-managed passwords. To test protected routes,
create a user + session in Mongo, then use the session token.

## DB
- Database: `one10_events` (or the value of `DB_NAME`)
- Users: `users` (custom `user_id`; MongoDB `_id` is separate/internal)
- Sessions: `user_sessions` (`user_id`, `session_token`, `expires_at`)

## Step 1 — Create/lookup a user & session
```
mongosh one10_durgotsav_2026 --quiet --eval '
var u = db.users.findOne({email:"superadmin@one10.test"});   // or any demo user
var token = "test_session_" + Date.now();
db.user_sessions.insertOne({user_id:u.user_id, session_token:token, expires_at:new Date(Date.now()+7*24*60*60*1000), created_at:new Date()});
print("TOKEN "+token+"  USER "+u.user_id);'
```

## Step 2 — Backend API
```
curl -s https://<host>/api/auth/me -H "Authorization: Bearer <TOKEN>"
curl -s https://<host>/api/dashboards/collection -H "Authorization: Bearer <TOKEN>"
```

## Step 3 — Browser
```
await page.context.add_cookies([{ "name":"session_token","value":"<TOKEN>",
  "domain":"<host-without-scheme>","path":"/","httpOnly":True,"secure":True,"sameSite":"None"}])
await page.goto("https://<host>/admin")
```

## Notes
- All user queries use `{"_id":0}` projection.
- Callback detection uses `useLocation().hash`.
- Success: `/api/auth/me` returns user with `permissions[]`; `/admin` renders (no redirect to login).
