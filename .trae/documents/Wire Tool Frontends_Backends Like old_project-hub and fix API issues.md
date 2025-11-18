## Goal
- Make tools run the same way as `e:\project-hub\old\project-hub`: Next.js hub on a single port (`4090`), all tool backends on fixed ports, and traffic proxied via `/_proxy/:tool` so frontends load inside the hub.
- Fix current API errors shown in Terminal, and ensure tutorial/schedule endpoints work.

## What’s already in place
- Unified dev orchestration scripts and ports are present (`start-all-tools.js`, `start-python-apps.js`) and match the old mapping.
- Proxy rewrites exist and point hub routes to API (`next.config.ts`), and the proxy handler is robust (`src/app/api/proxy/[...path]/route.ts`).
- Tool pages use `ToolFrame` to embed the proxied backends.

## Changes to implement
### 1) Fix Next.js dynamic route handlers
- Update `params` handling to Next.js 15 async `params` in tutorials route:
  - `src/app/api/tools/[id]/tutorials/route.ts:16–23` currently destructures sync. Change the signatures to accept `params: Promise<{ id: string }>` and use `const { id: toolId } = await params` in both `GET` and `POST`.
  - Keep `DELETE` consistent (it already types `params` as `Promise<{ id: string }>`).
- Rationale: Matches how `proxy` and `schedule` routes already use `await params` and eliminates the runtime error logged at `src/app/api/tools/[id]/tutorials/route.ts:21`.

### 2) Fix upload URL in tutorials POST
- `src/app/api/tools/[id]/tutorials/route.ts:130–141` uses `process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"` which conflicts with the hub port (`4090`).
- Change to build a relative URL from the request: `new URL('/api/upload', request.url)` or just call `fetch('/api/upload', ...)` so it always targets the hub.

### 3) Restore notifications query by adding missing columns
- The 500 error comes from selecting `um.priority` which doesn’t exist in the initial `user_messages` schema.
- Apply migration `008_enhanced_messaging_system.sql` that adds the required `priority`, `type`, media fields, dismissal and expiry (file: `database/migrations/008_enhanced_messaging_system.sql`).
- If needed, add a small runner script (mirroring `run-007-dev-settings-tables.js`) to execute 008 safely statement-by-statement.
- After migration, the query in `src/app/api/user/notifications/route.ts:40–61` will work and `ORDER BY um.priority DESC, um.created_at DESC` is valid.

### 4) Verify and wire dev orchestration
- Ensure the environment file has the port variables used by the hub scripts:
  - `PORT=4090`, `EXTRACTOR_PORT=4092`, `FILE_MERGER_PORT=4093`, `QUOTE_PORT=4094`, `GSHEET_PORT=4095`, `INVENTORY_PORT=4096`, `ORDER_EXTRACTOR_PORT=4097`.
- Use the existing scripts (same pattern as old):
  - Run `npm run dev` to start hub plus all tool backends together.
  - Alternatively run `node start-all-tools.js` to launch with staged delays and logging.
- Confirm the proxy health and ports:
  - Hub at `http://localhost:4090`
  - Tools via hub at `http://localhost:4090/_proxy/<tool>/`

### 5) Admin bootstrap and DB readiness
- Terminal indicates: "Default admin credentials not configured in .env". Add admin bootstrap creds in `.env` used by the auth bootstrap code:
  - e.g., `DEFAULT_ADMIN_EMAIL=admin@example.com`, `DEFAULT_ADMIN_PASSWORD=<strong password>`.
- Ensure DB `.env` is set (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`).
- Run the available migration runners (001..007) and then the new 008 to guarantee all tables exist (tutorials, schedules, messaging, dismissals, etc.).

## Validation plan
- Start dev: `npm run dev`.
- Open each tool page under the hub and confirm it loads through the proxy:
  - `Tools → Google Sheets`, `Order Extractor`, `Inventory Management`, `Quote Generator`, `Data Extractor Pro`, `File Merger`.
- API checks:
  - Tutorials: `GET /api/tools/<id>/tutorials` returns fallback or DB rows without the "await params" error.
  - Schedules: `GET /api/tools/<id>/schedule` continues to work.
  - Notifications: `GET /api/user/notifications` returns `200` with prioritized results.
- Quick proxy test: `GET /api/proxy/health` (if present) or load `/_proxy/<tool>/api/health` for the Node tools.

## Notes on architecture
- All frontends are served by their respective backends and embedded via `ToolFrame` using proxied routes; we don’t run separate Vite dev servers in the hub.
- The proxy route already rewrites HTML and handles WebSocket cases for Streamlit; no changes needed there.

## Deliverables
- Edits to `src/app/api/tools/[id]/tutorials/route.ts` for async params and upload URL.
- A runner for migration 008 if not present, then apply migration 008.
- `.env` updates for admin creds and port map.
- Verification pass with the above API and UI checks.