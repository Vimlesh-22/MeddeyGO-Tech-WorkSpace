## Root Cause

* The frontend issues requests like `/api/_proxy/inventory-management/api/inventory?...`, which don’t match Next.js rewrites (only `/ _proxy/...` → `/api/proxy/...` are supported). Requests hitting `/api/_proxy/...` bypass the intended proxy handler and reach the inventory backend with an extra `_proxy/...` segment, resulting in `404 Not Found`.

* Inventory backend does expose `GET /api/inventory` and supports `transactionType` filter, so a correctly proxied call would succeed (`tools/inventory-management/backend/routes/inventoryRoutes.js:6`, `tools/inventory-management/backend/controllers/inventoryController.js:24`).

## Changes

1. Add a fallback rewrite to support the mistaken path prefix:

   * Update `next.config.ts` to include: `source: '/api/_proxy/:slug/:path*'` → `destination: '/api/proxy/:slug/:path*'` (`next.config.ts:13-30`).

   * This makes both `/ _proxy/...` and `/api/_proxy/...` resolve to the proxy route implemented in `src/app/api/proxy/[...path]/route.ts`.
2. Optional hardening (low risk, improves resilience):

   * Keep current proxy-variable injection intact (`src/app/api/proxy/[...path]/route.ts:654-676` sets `window.__PROXY_BASE__ = '/_proxy/<slug>'`). No change required.

   * If we still observe `/api/_proxy/...` being generated, adjust the inventory frontend base detection to always use the injected proxy base on the client:

     * Confirm `API_BASE_URL` resolves to `/_proxy/<slug>/api` at runtime (`tools/inventory-management/frontend/src/config.js:39-59, 60-79`). If not, switch usages to call `getApiBaseUrlDynamic()` where needed.

## Validation

* Start the Hub and Inventory tools.

* Navigate to `/tools/inventory-management` and trigger a Returns tab load.

* **Confirm** requests appear as `/api/proxy/inventory-management/api/inventory?transactionType=Return&_t=...` in Hub logs, and the backend logs `GET /api/inventory?... 200`.

* Verify the Hub shows `[Proxy] inventory-management: Response status: 200 OK` (proxy handler: `src/app/api/proxy/[...path]/route.ts`).

## Deliverables

* Add the new rewrite in `next.config.ts`.

* Run and validate UI interactions for Returns to ensure no 404s occur.

## Notes

* Backward-compatible: does not affect existing `/ _proxy/...` paths.

* Minimal blast radius: single file change

