## Problem
The terminal shows requests being sent to `/_proxy/inventory-management/api/_proxy/inventory-management/api/...`, which the proxy forwards verbatim to the backend and results in 404. This duplication happens because `axios.defaults.baseURL` is set to `API_BASE_URL` (which already includes `/_proxy/.../api`) while requests also use full URLs starting with `API_BASE_URL`.

## Fix
- Update `StageOrdersView.jsx` to avoid setting `axios.defaults.baseURL` when the resolved API base starts with `/_proxy/`, so absolute paths continue to work without duplication.
- In the axios request interceptor, add a guard to unset `config.baseURL` when `config.url` already starts with `/_proxy/`, ensuring we never build `baseURL + url` that duplicates the prefix.

## Files to change
- `tools/inventory-management/frontend/src/components/StageOrdersView.jsx`
  - In the `useEffect` where `axios.defaults.baseURL` is set, conditionally set it only for non-proxy bases.
  - In the request interceptor, if `config.url` starts with `/_proxy/`, set `config.baseURL = undefined` and leave the URL as-is.

## Verification
- After changes, calling `axios.post(`${API_BASE_URL}/orders/refresh-fulfillment`...)` will resolve to a single path `/_proxy/inventory-management/api/orders/refresh-fulfillment`.
- Terminal should show proxying to `http://127.0.0.1:4096/api/orders/refresh-fulfillment` with 200/2xx.

## Safety
- No backend changes; only client-side axios configuration is adjusted.
- Other components using relative paths continue to work because the interceptor still applies `baseURL` for non-absolute URLs.
