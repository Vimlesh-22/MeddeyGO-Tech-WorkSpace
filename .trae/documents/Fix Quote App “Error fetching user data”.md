## Root Cause
- GET `/_proxy/quote-generator/api/users/me` requires Authorization. The quote backend runs in fallback (no MongoDB), but its auth middleware only treats requests as offline when `QUOTE_APP_OFFLINE` or `QUOTE_APP_DISABLE_MONGO` is set. Our server startup did not set those, so requests without a token return 401 and the frontend logs “Error fetching user data”.

## Fix Plan
1) Server-side: enable offline mode
- Update `tools/quote-app/scripts/start-quote.js` to set `process.env.QUOTE_APP_OFFLINE = 'true'` before requiring the backend, so `protect` middleware allows requests without a token and `getMe` returns the offline user.
- Restart the quote backend so the env applies.

2) Frontend fallback (optional but helpful)
- In places calling `getCurrentUser()` (e.g., `TemplateSettings`, `QuotationDetail`), catch 401 and set sensible defaults (e.g., `defaultTemplate: 'template1'`) instead of surfacing an error toast.
- This makes the UI resilient even if the server runs with MongoDB later and a user isn’t logged in.

3) Validation
- Navigate to Template Settings and Quotation Detail; ensure the user fetch succeeds (offline user) and defaults load without errors.
- Confirm API base is `/_proxy/quote-generator/api` (already enforced earlier) and login still works, storing `user.token` in localStorage.

## Notes
- When MongoDB is available and you want strict auth, remove `QUOTE_APP_OFFLINE` and rely on bearer token via localStorage.
- No schema or route changes are required; we only align environment to existing offline behavior.