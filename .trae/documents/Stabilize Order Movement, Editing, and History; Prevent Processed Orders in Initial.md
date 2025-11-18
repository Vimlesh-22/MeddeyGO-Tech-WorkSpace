## Diagnosis
- Movement issues originate from two flows on the Initial page:
  - “Process Selected” uses POST ` /api/orders/process-items` to move items into vendor-scoped Processed orders. Backend already removes items and deletes empty source orders; however, items without vendors previously skipped, and UI feedback is limited.
  - “Change Stage” dialog currently only offers Hold and In-Stock; direct move to Processed via this dialog is not present. There is a separate backend `POST /api/orders/move-items-to-stage` which supports Processed and handles pack quantities, but the Initial page doesn’t expose Processed.
- Processed orders not appearing on the Processed page can be caused by strict date filtering in `StageOrdersView` which applies a single-day filter when a legacy `dateFilter` is set. If the processed timestamp (`processedAt`) falls outside the selected date(s), orders won’t be listed.
- “Edit order” intermittent failure comes from fetching `GET /api/orders/:id` with ambiguous id. We already hardened the fetch to validate/encode the id and surface backend message.
- “History function” uses `GET /api/orders/:orderId/processing-history` and `GET /api/orders/sku-processing-history/:sku`; these rely on `ProcessedOrderHistory` entries written by movement. The multi-path move (`move-items-to-stage`) doesn’t add history entries, so history can look incomplete when using that path.
- Preventing processed orders from appearing in Initial: current Initial-stage query filters by `stage==='Initial'` and empty-item exclusion, but it does not explicitly exclude orders that have any processed history. User asks to check via DB by order id and persist a reference to avoid re-showing.

## Fixes
- Movement robustness:
  - Ensure all selected items get a vendor; auto-create/use a special “Unassigned” vendor when missing to avoid skips.
  - Write `ProcessedOrderHistory` entries for `move-items-to-stage` when `targetStage==='Processed'` to keep history consistent.
  - After moving items via `move-items-to-stage`, delete empty source orders (parity with `process-items`).
- Processed page visibility:
  - Adjust frontend default date range to last 7 days for Processed stage and remove legacy single-day “strict” filter unless user explicitly sets it; always pass `startDate/endDate` (and optional times) to backend.
  - Keep `processedAt` as the filter field (backend already uses it).
- Editing and history reliability:
  - Keep `handleOpenOrderEditor` using a validated/encoded id and display server error text when present.
  - Ensure OrderEditor save uses `PUT /api/orders/:id` and that backend allows edits across relevant stages (already supported for Initial, Processed, In-Stock, Hold).
- Prevent Initial leakage:
  - In backend `getOrders` for Initial stage, exclude any orders whose `_id` appears in `ProcessedOrderHistory.orderId` (order-level exclusion by DB check). This matches the “save order id in DB to re-check” requirement using the existing history collection.
  - Optionally, mark items as `processed:true` before removal to future-proof filters, though the deletion of items already suffices; we’ll rely on the DB exclusion.

## Implementation Steps
- Backend `controllers/orderController.js`:
  1) Update `moveItemsToStage` (e:\project-hub\tools\inventory-management\backend\controllers\orderController.js:2334–2464):
     - When `targetStage==='Processed'`, build and insert `ProcessedOrderHistory` records mirroring those in `processOrderItems` (fields: `orderId`, `orderName`, `itemSku`, `quantity`, `vendorId`, `processedAt`, etc.).
     - After moving items, delete source orders whose `items.length===0`, akin to `processOrderItems` (e:\project-hub\tools\inventory-management\backend\controllers\orderController.js:2315–2331 logic).
  2) Strengthen vendor assignment in `moveItemsToStage`: if `newItem.vendor` is falsy and `targetStage==='Processed'`, resolve/create the “Unassigned” vendor and set it.
  3) In `getOrders` Initial-stage branch (e:\project-hub\tools\inventory-management\backend\controllers\orderController.js:553–591 and date filters below):
     - Add an exclusion filter: `_id: { $nin: await ProcessedOrderHistory.distinct('orderId') }` to remove any order that has been processed historically.
     - Keep existing `$expr` size>0 safeguard to exclude empty orders.
- Frontend `InitialOrders.jsx`:
  4) Expose “Processed” option in the “Change Stage” dialog and call `POST /orders/move-items-to-stage` with `targetStage:'Processed'` for selected items to support non-vendor grouped moves.
  5) Improve feedback dialog to show `movedCount`, `errors.length`, and list a few error reasons.
- Frontend `StageOrdersView.jsx`:
  6) Default Processed stage date range to last 7 days via `getInitialDateRange`; remove the legacy single-day strict filter for Processed unless the user sets the legacy `dateFilter` explicitly. Always pass `startDate/endDate` and optional times.
- Consistency:
  7) Ensure queries invalidate `['orders']` after moves and edits; keep vendor grouping rendering relying on populated `items.vendor`.

## Verification
- Move 10+ mixed items (with/without vendors) from Initial using “Process Selected” and via “Change Stage → Processed”. Confirm:
  - All items move; moved counts match; no silent skips; errors report clearly.
  - Empty source orders are deleted; remaining orders retain non-moved items.
  - Processed orders appear under Processed stage within the default date range; export and email flows show the same set.
  - History views show entries for both movement paths.
- Editing and history:
  - Open OrderEditor from Initial; load, edit quantity/vendor, save; verify backend updates and list refresh.
  - Open OrderDetail history; confirm latest move and edit entries exist.
- Initial exclusion:
  - After processing, the same order id never shows in Initial; verify by checking `ProcessedOrderHistory` contains the order id and that `GET /api/orders` (Initial) does not return it.

## Notes
- Using `ProcessedOrderHistory` provides a durable DB-backed exclusion without adding a new table. The exclusion is broad (any history for an order id hides it from Initial); if you prefer “only when fully processed”, we can switch to counting remaining items and exclude only when zero remain.
- All changes maintain existing API shapes and frontend patterns; no secrets are logged or introduced.