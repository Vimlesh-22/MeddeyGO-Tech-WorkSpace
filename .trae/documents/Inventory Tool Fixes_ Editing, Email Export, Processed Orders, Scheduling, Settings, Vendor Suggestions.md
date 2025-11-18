## Objectives
- Fix order editing error and ensure Order Editor loads full details.
- Resolve email export failure by configuring SMTP and not blocking automation.
- Make today’s processed orders visible; correct stage/history updates.
- Ensure scheduled automation triggers at configured times; add HH:MM AM/PM UI and DB storage.
- Fix Settings page crash and stabilize settings save/load.
- Load vendors from Google Sheets in vendor fields across views.

## Backend Changes
### Email Transport & Export
- Update `services/emailService.js` to use SMTP_* env vars as fallback to EMAIL_SMTP_* (host, port, secure, user, pass); keep strong validation and use `SMTP_FROM` if `EMAIL_FROM` missing.
- Improve errors: include which env var is missing and guide fix.

### Processed Orders Scheduler
- In `jobs/processedOrdersScheduler.js`:
  - When moving Pending → Processed, also set `order.processedAt = new Date()`.
  - Push history with `{ stage: 'Processed', timestamp: new Date(), comment: ... }` (currently pushes 'Pending').
  - Add a flag `continueOnEmailFailure` (default true) so orders still move even if email sending fails; log errors instead of aborting.

### Orders API
- Confirm `GET /api/orders/:id` returns populated order; extend if needed to include vendor suggestions in response (optional, frontend will fetch separately).
- Ensure `GET /api/orders` processed filters use `processedAt` and history stage 'Processed'; with above changes, “Recent (24h)” works.

### Settings API & Model
- In `models/Settings.js`, add optional structured time fields:
  - `email.processedOrdersExport.schedule: { hour: Number, minute: Number, meridiem: 'AM'|'PM' }`
  - Maintain `scheduleTime` string for backward compatibility; server writes both.
- In `routes/settingsRoutes.js`:
  - Accept either structured time or string; normalize to 24-hour `scheduleTime` for scheduler.
  - Expose `GET /settings/email` with current processedOrdersExport fields.

### Vendor Suggestions Endpoint
- Confirm `GET /settings/vendor-suggestions` returns vendor names from Google Sheets (`services/googleSheets.js` vendorSuggestions).
- If not present, add a route that builds a merged list of unique vendor names from DB Vendors and `vendorSuggestions`.

## Frontend Changes
### Order Editing
- In `InitialOrders.jsx`:
  - Implement `handleOpenOrderEditor(order)` to fetch `${API_BASE_URL}/orders/${order._id}` and pass the populated order to `<OrderEditor>`.
  - Replace any hardcoded `/api/orders` calls with `API_BASE_URL` usage (e.g., inline quantity update in ProcessedOrdersPage uses `/api/orders/:id` → prefix with API base).

### Processed Orders Page
- In `ProcessedOrdersPage.jsx`, ensure all API calls use `getApiBaseUrlDynamic()`; verify “Recent (24h)” mode is driven by `recentlyMoved=24`.

### Settings Page (Crash Fix)
- Rename local variable `settings` to `settingsData` to avoid TDZ/minifier collisions.
- Ensure no references to `settings` before initialization; guard all reads with optional chaining.
- Stabilize tabs: load state after data resolves; avoid deriving defaults from `settingsData` until set.

### Time Selection UI & Persistence
- Add HH (1–12), MM (00–59), AM/PM selectors in Settings:
  - On save, convert to 24-hour string `scheduleTime` (e.g., 04:00) and also store structured `schedule` in DB.
  - Reflect values back into inputs on load.
- Reuse the same time selection wherever schedule appears (email export dialog, etc.).

### Vendor Loading (Google Sheets + DB)
- In `OrderEditor.jsx`, merge vendor options from:
  - `GET ${API_BASE_URL}/vendors` and
  - `GET ${API_BASE_URL}/settings/vendor-suggestions`
- Deduplicate and sort; allow free text to create temporary vendor name.

## Verification
- Configure `.env` SMTP (already present: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`);
  - Verify `GET /api/settings/email` returns recipients and schedule; change schedule and confirm cron conversion.
- Trigger scheduler manually (temporarily set time few minutes ahead) or call move function; confirm:
  - Orders moved to Processed
  - `processedAt` set
  - History entry has stage 'Processed'
  - Processed Orders page shows >0 today in Recent mode.
- Test email export:
  - If SMTP works, attachment sent; otherwise, orders still move (with error logged).
- Open Settings page:
  - No crash; time pickers present; changes persist; reload reflects values.
- Open Order Editor:
  - Full order details loaded; vendor field includes Google Sheets suggestions.

## Rollback/Safety
- Keep existing `scheduleTime` field; new structured schedule is additive.
- Feature flags: `continueOnEmailFailure` default true; can be set false to revert blocking behavior.
- All changes backward compatible with current API; low risk to other tools.

## Deliverables
- Code updates to backend (emailService, scheduler, settings model/routes) and frontend (InitialOrders, ProcessedOrdersPage, Settings, OrderEditor).
- Smoke tests demonstrating fixed behaviors and logs of scheduler and email export outcomes.