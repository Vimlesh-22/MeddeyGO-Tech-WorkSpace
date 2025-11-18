## What I will start
- Hub (Next.js) on `4090`: `npm run dev`
- Quote App backend on `4094` with MongoDB mode: set `QUOTE_APP_OFFLINE=false`, `QUOTE_MONGODB_URI=mongodb://127.0.0.1:27017/quote-app`, `JWT_SECRET=dev-secret`, then `node scripts/start-quote.js`
- Inventory Management backend on `4096`: `node scripts/start-inventory.js`
- Order ID Extractor backend on `4097`: `node scripts/start-order.js`
- GSHEET Integration server on `4095`: `node tools/GSHEET/server/index.js` (with `PORT=4095`)
- Python/Streamlit tools (Extractor Pro, Merger): `node start-python-apps.js`

## Assumptions
- MongoDB is reachable at `mongodb://127.0.0.1:27017/quote-app`. If it isn’t running, Quote will log a connection error; we can switch URI or start MongoDB locally.
- `.env` already has DB creds for the hub (MySQL), as we used for notifications.

## After starting
- Validate hub: `http://localhost:4090`
- Tools via hub:
  - Quote: `http://localhost:4090/tools/quote-generator`
  - Inventory: `http://localhost:4090/tools/inventory-management`
  - Order Extractor: `http://localhost:4090/tools/order-extractor`
  - GSHEET: `http://localhost:4090/tools/gsheet-integration`
- Verify APIs respond via hub proxy and UI pages load without previous errors.

## Proceeding
I will launch all of the above concurrently and report status.