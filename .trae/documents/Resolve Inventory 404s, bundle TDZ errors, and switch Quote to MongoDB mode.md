## Objectives
- Fix Inventory API 404s for `/api/orders` and `/api/orders/fetch-all-shopify` through the hub proxy.
- Eliminate minified bundle TDZ errors (“Cannot access 've' before initialization”).
- Move Quote App to MongoDB mode with proper auth and stop offline mode.
- Resolve hub notifications fetch errors or make them non-blocking.

## Inventory: API 404s via Proxy
- Confirm backend mounts: server uses `app.use('/api/orders', orderRoutes)` and `router.get('/')` + `router.post('/fetch-all-shopify')` are present (verified).
- Likely causes:
  - Backend not started or listening on expected port (`INVENTORY_PORT=4096`).
  - Proxy slug mismatch or base URL mis-detection on the frontend.
  - Method mismatch (should be POST for `fetch-all-shopify`).
- Actions:
  1) Ensure backend is up on `4096` with logs confirming “Orders routes loaded”.
  2) Strictly enforce `API_BASE_URL='/_proxy/inventory-management/api'` in frontend (`src/config.js`) — already aligned; re-check usage in `Orders.jsx` and `Layout.jsx` (they use POST to `/orders/fetch-all-shopify`).
  3) Add lightweight server-side request log around `/api/orders` to confirm receipt and respond 405 when method is wrong, not 404.
  4) If the proxy is the issue, add a direct test endpoint `/api/health` that returns 200, and validate `/_proxy/inventory-management/api/health` from the hub.

## Inventory: Bundle TDZ error (“ve”)
- Root cause is aggressive minification in Vite/Rollup causing temporal dead zone or circular init.
- Actions:
  1) Temporarily set `build.minify=false` to confirm the minifier is the cause.
  2) If confirmed, enable `minify:'terser'` with safer options:
     - `target:'es2019'`, `compress:{passes:2, pure_getters:true}`, `mangle:true`, `keep_fnames:true`, `keep_classnames:true`.
     - Consider `treeshake:false` only if error persists.
  3) Rebuild and validate UI served via proxy stops throwing TDZ.

## Quote App: MongoDB Mode
- Environment:
  - Set `QUOTE_APP_OFFLINE=false`.
  - Provide `QUOTE_MONGODB_URI` and ensure MongoDB is running.
  - Set `JWT_SECRET`.
- Startup:
  - Remove offline forcing from `scripts/start-quote.js`.
  - Restart Quote backend; verify DB connect logs.
- Frontend:
  - On 401 from `GET /users/me`, redirect to `/login` and require login.
  - Ensure token is persisted and attached in subsequent calls.

## Hub Notifications Errors
- `/api/user/notifications` previously fixed by adding missing columns; “connection refused” indicates the hub wasn’t running or a transient devtools request.
- Actions:
  1) Verify hub serving `/api/user/notifications` after login; should return 200.
  2) Add a retry with backoff in the UI and display a non-blocking message if fetch fails.

## Validation Plan
- Inventory:
  - Call `/_proxy/inventory-management/api/orders` (GET) → 200 list.
  - Call `/_proxy/inventory-management/api/orders/fetch-all-shopify` (POST) → 200 trigger.
  - Navigate settings and transactions pages; ensure no TDZ error.
- Quote:
  - Login → DB-backed users and quotations load.
  - `/_proxy/quote-generator/api/users/me` works with token.
- Hub:
  - Notifications render after login; on failure show info only, no hard error.

## Rollback
- If MongoDB unavailable, set `QUOTE_APP_OFFLINE=true` temporarily to keep the app usable.
- For inventory TDZ, run with `minify:false` until a safer minify config is in place.