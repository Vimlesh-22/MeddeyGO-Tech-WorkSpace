## Summary
Resolve two issues in Inventory Management:
1) Frontend crash with “Cannot access 'Pe' before initialization” in the compiled bundle
2) 404 when loading Initial Orders page due to API base URL misrouting

## Diagnosis
- 404 is caused by requests going to the hub’s `/api/orders` instead of the inventory backend via proxy. The frontend must consistently use `/_proxy/inventory-management/api` under the hub.
- The “Pe before initialization” error is a minified bundle TDZ/circular import issue seen with aggressive minification and React/MUI + Vite. It frequently resolves by switching to `terser` minification or adjusting build targets to preserve evaluation order.

## Backend-safe adjustments
- No backend route change required for `GET /api/orders` (exists). Ensure server remains serving `frontend/dist`.

## Frontend fixes
1) API base URL enforcement
- Update `frontend/src/config.js` to force proxy base when running under hub (`port 4090`) or any `/tools/` or `/_proxy/` path, removing ambiguous standalone fallbacks that return plain `/api` in hub.
- Add a hard fallback to `/_proxy/inventory-management/api` if detection variables are missing.

2) Build stabilization to fix “Pe” crash
- Update `tools/inventory-management/frontend/vite.config.js`:
  - Set `build.minify: 'terser'`
  - Set `build.target: 'es2019'`
  - Configure `terserOptions` to avoid TDZ/circular minify pitfalls: `compress: { passes: 2 }`, `mangle: true`, `keep_fnames: true`
  - Disable problematic transforms: `esbuild` minification off
- Rebuild frontend and verify proxy-served assets load without runtime ReferenceError.

3) Defensive error handling
- Wrap Initial Orders page data loader to surface API base in dev logs when 404 occurs and retry once using the hard proxy base.

## Verification
- Open Initial Orders: confirm no 404; requests are to `/_proxy/inventory-management/api/orders`.
- Rebuild loads inventory UI via proxy without “Pe” crash; navigation and actions work.
- Processed Orders and quantity edit remain functional.

## Rollback
- If `terser` minify doesn’t resolve the crash, temporarily set `build.minify: false` to validate that minification is the cause, then iteratively re-enable with safer options.

## Deliverables
- Updated `config.js` base URL logic
- Updated `vite.config.js` build settings
- Rebuilt frontend, validation in hub