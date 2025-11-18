## Diagnosis
- Edit error originates in `InitialOrders.jsx` at e:\project-hub\tools\inventory-management\frontend\src\pages\stages\InitialOrders.jsx:1060 where the dialog shows “Failed to load order details for editing”. The fetch happens in `handleOpenOrderEditor` (e:\project-hub\tools\inventory-management\frontend\src\pages\stages\InitialOrders.jsx:1052–1061).
- Settings page crash is due to an undefined identifier `settings` used in a sync effect instead of `settingsData` in `Settings.jsx` (e:\project-hub\tools\inventory-management\frontend\src\pages\Settings.jsx:165). The same undefined `settings` is referenced in a dependency for `persistRecipients` (e:\project-hub\tools\inventory-management\frontend\src\pages\Settings.jsx:234).
- Backend API for orders by id is `GET /api/orders/:id` and returns the order object directly (e:\project-hub\tools\inventory-management\backend\controllers\orderController.js:1357–1384). The PUT save endpoint is `PUT /api/orders/:id` (e:\project-hub\tools\inventory-management\backend\controllers\orderController.js:5302–5405).

## Changes
- Settings page: replace all accidental `settings` references with `settingsData` and keep the effect’s dependency list consistent; fix invalidation to use the same query key shape.
- Edit order fetch: harden `handleOpenOrderEditor` to ensure a valid id and encode it before request; improve error handling to surface backend messages.

## Implementation Steps
- Update `Settings.jsx`:
  - In the sync `useEffect`, change `if (settings && settingsLoaded)` to `if (settingsData && settingsLoaded)` and replace all inner `settings.*` accesses with `settingsData.*` (e:\project-hub\tools\inventory-management\frontend\src\pages\Settings.jsx:165–194).
  - Update the `persistRecipients` hook dependency from `[saveMutation, settings?.email]` to `[saveMutation, settingsData?.email]` and ensure it reads from `settingsData` (e:\project-hub\tools\inventory-management\frontend\src\pages\Settings.jsx:222–235).
  - Use `queryClient.invalidateQueries({ queryKey: ['settings'] })` instead of a string to match the defined query key (e:\project-hub\tools\inventory-management\frontend\src\pages\Settings.jsx:207).
- Update `InitialOrders.jsx`:
  - In `handleOpenOrderEditor`, guard for missing ids and use `const oid = order?._id || order?.orderId; if (!oid) { /* show message */ return; }` followed by `const response = await axios.get(`${API_BASE_URL}/orders/${encodeURIComponent(oid)}`);` (e:\project-hub\tools\inventory-management\frontend\src\pages\stages\InitialOrders.jsx:1052–1061).
  - In the `catch`, surface `error.response?.data?.message` if present to aid diagnosis; keep the user-facing message concise.

## Verification
- Settings page: navigate to Settings; confirm it renders without “ReferenceError: settings is not defined”, toggles persist correctly, and email recipients/schedule changes save and invalidate `['settings']`.
- Edit order: on Initial Orders, click the edit icon for any SKU group; confirm the order editor opens populated with order fields and items; save changes and verify success, with the orders list refreshed via `invalidateQueries(['orders'])`.
- Smoke test vendor interactions in `OrderEditor.jsx` against `PUT /api/orders/:orderId/items/:itemId/vendor` and verify no regressions (e:\project-hub\tools\inventory-management\frontend\src\components\OrderEditor.jsx:465–486).

## Notes
- The preload warning is likely benign from the bundler’s chunk preloading. If needed, we can audit `index.html` and adjust the `as` attribute or remove unused preloads, but it’s not blocking functionality.
- No backend changes are required; endpoints already align with frontend expectations.