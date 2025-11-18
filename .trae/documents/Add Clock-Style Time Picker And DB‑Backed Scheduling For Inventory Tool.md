## Goals
- Provide a clock-style time selector (12-hour with AM/PM) everywhere users set timelines.
- Persist schedule times and email recipients in the database (no browser storage), and drive automation purely from DB values.
- Keep automation flexible: users control hours/minutes/AM-PM; no hardcoded times/dates.

## Frontend (Clock UI)
- Use MUI’s clock-style `TimePicker` (from `@mui/x-date-pickers`) configured in 12-hour mode with AM/PM.
- Files:
  - Settings page: `tools/inventory-management/frontend/src/pages/Settings.jsx`
    - Replace HH/MM/AM-PM selects with `TimePicker` bound to a `Date` state.
    - On save, serialize to both structured `{hour, minute, meridiem}` and `scheduleTime` (24h string) and POST to backend.
  - Initial orders email dialog: `tools/inventory-management/frontend/src/pages/stages/InitialOrders.jsx` (see current time parsing at 248–266)
    - Replace manual parsing with `TimePicker` for consistent UI; persist via backend POST.
- Dependencies:
  - Add `@mui/x-date-pickers` and `dayjs` adapter.
  - Initialize `LocalizationProvider` once at app root if not already.

## Backend (DB‑Backed Scheduling)
- Model: `tools/inventory-management/backend/models/Settings.js`
  - Extend `email.processedOrdersExport` with `schedule: { hour: Number, minute: Number, meridiem: 'AM'|'PM' }`.
  - Keep `scheduleTime` (string, 24h) for backward compatibility while writing both on save.
- Routes: `tools/inventory-management/backend/routes/settingsRoutes.js`
  - `GET /settings/email`: returns recipients array, `scheduleTime` and structured `schedule`.
  - `POST /settings/email`: accepts either structured schedule or string; validates recipients server-side and writes both fields.
- Scheduler: `tools/inventory-management/backend/jobs/processedOrdersScheduler.js`
  - Read schedule from DB each run; convert AM/PM to UTC cron using the existing converter.
  - No hardcoded fallback beyond first install; default used only if DB empty.
  - When moving Pending → Processed, set `processedAt = new Date()` and push history `{ stage: 'Processed', timestamp: new Date(), comment }`.
  - Add `continueOnEmailFailure` default true so movement isn’t blocked by email errors (logged instead).

## Email Transport & Recipients
- Transport: `tools/inventory-management/backend/services/emailService.js`
  - Use `SMTP_*` as fallback to `EMAIL_SMTP_*` (host, port, secure, user, pass).
  - `FROM` resolution: prefer `EMAIL_FROM`, else `SMTP_FROM`.
  - On misconfiguration: return precise errors naming missing env vars.
- Recipients: store only in DB via Settings; no localStorage usage (frontend removes any browser persistence and reads/writes via API).

## Vendor Suggestions Everywhere
- Ensure `GET /settings/vendor-suggestions` returns a deduplicated list merging DB Vendors with Google Sheets vendorSuggestions (see `services/googleSheets.js`).
- Frontend merges DB vendors + suggestions in `OrderEditor.jsx` and stages views;
  - Files: `tools/inventory-management/frontend/src/components/OrderEditor.jsx`, `InitialOrders.jsx`
  - Deduplicate and sort for clean Autocomplete options.

## Order Editing Fix
- `InitialOrders.jsx`: implement `handleOpenOrderEditor(order)` to GET `${API_BASE_URL}/orders/${order._id}` (populated) and pass to `<OrderEditor>`.
- Backend already provides `GET /api/orders/:id` populated (see `orderController.js:1359`); confirm vendor suggestions fetched separately.

## Processed Orders Visibility
- Frontend: `ProcessedOrdersPage.jsx` uses `getApiBaseUrlDynamic()` for all requests.
- Backend: with `processedAt` set and history recorded as `Processed`, the page’s “Recent (24h)” (`recentlyMoved=24`) will display today’s processed orders.

## Settings Page Crash Fix
- In `Settings.jsx`, rename local `settings` variable to `settingsData` and guard with optional chaining to avoid "Cannot access 'settings' before initialization".
- Load state after data resolves; no use of browser storage for recipients or schedule.

## Verification
- Configure SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`) in `.env`.
- Settings: pick a time using the clock UI, save, reload → values persist from DB and drive cron.
- Scheduler: set near-future time and observe run; orders move, `processedAt` and history updated; email sends if SMTP valid, else logs but continues.
- Order editor: opens with full details; vendor options include Google Sheets suggestions.
- Processed orders: “Recent (24h)” shows non-zero today.

## Safety/Compatibility
- Keep `scheduleTime` alongside structured `schedule` for backward compatibility.
- Feature flag for email blocking (`continueOnEmailFailure`) default true.
- No hardcoded times; all automation reads DB values.

## Deliverables
- Frontend clock TimePicker integrations + DB persistence.
- Backend settings endpoints & scheduler reading structured AM/PM times.
- SMTP transport resilience and recipient storage solely in DB.
- Vendor suggestion merge across views.
