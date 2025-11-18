## Problem
Axios currently has a default `baseURL` (often `/api`), while components also call with absolute URLs starting with `/api/...`. Axios concatenates `baseURL + url`, producing `/api/api/...` and 404s.

## Fix
- Do not set a default `axios.defaults.baseURL` for proxied or local `/api` bases.
- In the axios request interceptor, if `config.url` starts with `/_proxy/` or `/api/`, clear `config.baseURL` so the absolute path is used as-is.
- Keep the fallback: for relative URLs (no `http`, no `/_proxy/`, no `/api/`), set `config.baseURL = getApiBaseUrlDynamic()`.

## File to change
- `tools/inventory-management/frontend/src/components/StageOrdersView.jsx`
  - Update the `useEffect` that sets `axios.defaults.baseURL` to avoid setting it when base is `/_proxy/...` or `/api`.
  - In the request interceptor, add guard for `/api/` the same way we already guard `/_proxy/`.

## Verification
- Calls like `GET /api/vendors` and `GET /api/orders` should no longer become `/api/api/...`.
- Terminal will show single-prefixed paths and successful responses.

## Safety
- No backend changes; only client-side axios configuration.
- Relative requests still work due to interceptor applying the base when needed.