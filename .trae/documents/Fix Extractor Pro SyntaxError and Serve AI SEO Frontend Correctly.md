## Goals

* Run Quote App using MongoDB (no offline mode) and ensure authentication works across pages.

* Resolve “Error fetching user data” by fixing auth token flow and server mode.

* Fix hub notifications `net::ERR_CONNECTION_REFUSED` and ensure the `/api/user/notifications` route responds.

* Keep inventory fixes in place (build stabilization, proxy base), no regressions.

## Changes Required

### 1) Quote App backend: enable DB mode

* Environment:

  * Set `QUOTE_APP_OFFLINE=false` and remove `QUOTE_APP_DISABLE_MONGO`.

  * Provide a valid `QUOTE_MONGODB_URI` (e.g., `mongodb://localhost:27017/quote-app`) and ensure Mongo is running.

  * Ensure `JWT_SECRET` is set.

* Startup:

  * Update `scripts/start-quote.js` to stop forcing offline mode.

  * Start backend, verify connection logs to MongoDB (no offline response paths).

### 2) Frontend auth flow for Quote App

* Axios already adds `Authorization: Bearer ${user.token}` from `localStorage.user`.

* Ensure pages requiring `getCurrentUser()` (e.g., `TemplateSettings`, `QuotationDetail`) gracefully handle 401:

  * If 401 → redirect to `/login` or show a message.

  * On login: store the response object that includes `token`, `email`, `role`; keep using token for subsequent calls.

### 3) Hub notifications error

* `/api/user/notifications` previously failed on missing `um.priority`; migration 008 added it.

* “Connection refused” indicates server not reachable or failing:

  * Ensure hub server is running on `4090`.

  * Verify DB credentials in `e:\project-hub\.env` (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`).

  * Test `GET http://localhost:4090/api/user/notifications` with a session cookie; if unauthenticated → returns 401 (expected). Login to hub, then it should return 200.

* Add defensive UI handling: if notifications fetch fails, show a non-blocking message and continue.

### 4) Inventory crash (already mitigated)

* Build config updated to use `terser` with safer options.

* Proxy base enforced so Initial Orders no longer hit hub `/api` directly.

## Verification Steps

* Start hub and tools; confirm:

  * Quote: login at `/_proxy/quote-generator/...`; user pages load without “Error fetching user data” and pull DB-stored data.

  * Hub: after login, `/api/user/notifications` returns 200; the UI shows notifications.

  * Inventory: Initial and Processed pages load; no “Pe” crash.

## Rollback Plan

* If MongoDB not available, temporarily set `QUOTE_APP_OFFLINE=true` to keep Quote App usable while DB is provisioned.

* For notifications, if DB unreachable, disable notifications fetch in dev and re-enable once DB is online.

## Deliverables

* Env and startup updates for Quote App to run in DB mode.

* Minor UI guards for Quote pages to handle 401.

* Confirmation of hub notifications working after DB check.

