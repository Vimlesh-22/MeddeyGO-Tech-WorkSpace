## Goals
- Show all orders moved to Processed, including last 24h, reliably.
- Eliminate unintended skips when moving items from Initial → Processed.
- Add removal of processed orders/vendors that also cleans ProcessedOrderHistory and vendor transactions.
- Enable direct quantity edit on Processed page; fix inability to edit processed orders.

## Backend Changes
### getOrders visibility and date filtering
- File: `tools/inventory-management/backend/controllers/orderController.js`
- In `getOrders`:
  - For `stage === 'Processed'`, switch date filter field from `createdAt` to `processedAt` so recent moves appear even if original import date is old.
  - Keep `recentlyMoved` filter (history `timestamp` for stage 'Processed') intact.
  - Sorting for Processed defaults to `{ processedAt: -1 }` with fallback to `{ createdAt: -1 }` to surface most recent processed.

### Prevent unintended skipping during move
- File: `orderController.js`
- In `processOrderItems` and `moveItemsToStage`:
  - Current skip only when vendor not assigned; add fallback vendor handling:
    - If vendor missing, assign to a special "Unassigned" vendor record (create or fetch by name) so items still move and appear.
  - Ensure quantity calculation for pack SKUs doesn’t discard items without `P` prefix and that finalQuantity defaults to `itemDoc.quantity`.

### Removal endpoints (order/vendor) with cascade cleanup
- File: `tools/inventory-management/backend/routes/orderRoutes.js`
- Add endpoints:
  - `DELETE /api/orders/processed/:id` → delete processed order; remove related `ProcessedOrderHistory` records and `vendorTransactions` linked to that order.
  - `DELETE /api/orders/processed/:id/vendor/:vendorId` → remove a vendor’s items from a processed order and delete matching history records.
- File: `orderController.js`
  - Implement handlers that:
    - Validate stage is 'Processed'.
    - Remove `items` (whole order or by vendor), update or delete the `Order` if empty.
    - `ProcessedOrderHistory.deleteMany({ orderId })` or `{ orderId, vendorId }` accordingly.

### Quantity edit support and history sync
- File: `orderController.js`
- In `updateOrder`:
  - Ensure updates to `items[].quantity` in 'Processed' stage are allowed and persisted.
  - After item quantity change, update matching `ProcessedOrderHistory` records (`orderId`, `itemSku`, `vendorId`) to keep quantities in sync.
  - Preserve existing price-update rules and stage restrictions.

## Frontend Changes
### ProcessedOrdersPage (visibility and actions)
- File: `tools/inventory-management/frontend/src/pages/ProcessedOrdersPage.jsx`
- Fetch:
  - Keep `recentlyMoved=24` for Recent view; add All view that sets `recentlyMoved` undefined.
- Display:
  - Show `processedAt` date if present, fallback to `createdAt`.
- Actions:
  - Add controls to:
    - Remove selected processed orders (calls `DELETE /api/orders/processed/:id`).
    - Remove a vendor from a processed order (calls vendor removal endpoint).

### Inline quantity edit on processed page
- Component(s): create a small inline editor (e.g., per item row) to update quantity:
  - Calls `PUT /api/orders/:id` with updated `items` payload.
  - On success, refresh list; show toast.

## Data Consistency and Safety
- Always filter Initial stage strictly on `stage: 'Initial'` (already enforced) and exclude empty orders.
- When deleting processed order/vendor items, ensure no orphan vendorTransactions remain; remove those tied via `orderId`.
- Add safeguards to only operate on 'Processed' orders in new delete endpoints.

## Testing & Verification
- Unit-level checks:
  - Move 70 items with mixed vendor assignment → expect all moved (assigned to proper vendor or Unassigned), none silently skipped except explicit invalid inputs.
  - Recent view: ensure last 24h processed items appear.
  - All view: ensure all processed orders load; sort by `processedAt` desc.
  - Delete processed order/vendor → corresponding `ProcessedOrderHistory` and vendorTransactions removed; order deleted if empty.
  - Update quantity inline → persisted in order items and mirrored in history.
- API smoke tests:
  - `GET /api/orders?stage=Processed&recentlyMoved=24` returns expected counts.
  - `PUT /api/orders/:id` updates quantities in Processed.
  - `DELETE /api/orders/processed/:id` cascades removals.

## Rollout
- Implement backend changes first, then frontend UI actions.
- Deploy, then validate in the hub under `Tools → Inventory Management` (Recent and All views).

## Notes
- No changes to Initial stage pagination (already shows all); we only adjust Processed filtering and sorting.
- The fallback Unassigned vendor ensures visibility while still encouraging proper vendor mapping.