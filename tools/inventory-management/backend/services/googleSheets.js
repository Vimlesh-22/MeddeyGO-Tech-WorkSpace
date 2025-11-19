const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { getGoogleCredentials } = require('../../../_shared/utils/googleCredentials');

// Ensure env is loaded even if this module is required before server.js
try {
  const dotenv = require('dotenv');
  const envPath = path.join(process.cwd(), '.env');
  dotenv.config({ path: envPath });
} catch {}

// Try to load credentials using shared utility
let GOOGLE_CREDENTIALS_OBJECT = null;
try {
  // Check for fallback credentials.json files
  const rootCredPath = path.join(process.cwd(), 'credentials.json');
  const backendCredPath = path.join(__dirname, '..', 'credentials.json');
  const fallbackPath = fs.existsSync(rootCredPath) ? rootCredPath : 
                       (fs.existsSync(backendCredPath) ? backendCredPath : null);
  
  GOOGLE_CREDENTIALS_OBJECT = getGoogleCredentials(fallbackPath);
  console.log('[Inventory Google Sheets] Successfully loaded credentials from environment or file');
} catch (error) {
  console.warn('[Inventory Google Sheets] Credentials not configured:', error.message);
}

// Simple in-memory caches to avoid hitting quota aggressively
let _packSkuCache = { data: null, ts: 0 };
const PACK_CACHE_TTL_MS = 60 * 1000; // 1 minute
const _packQtyCache = new Map(); // key: SKU -> { qty, ts }
const PACK_QTY_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Pack Products sheet cache - cache entire sheet to avoid repeated API calls
let _packProductsCache = { data: null, ts: 0 };
const PACK_PRODUCTS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Combo Products sheet cache
let _comboProductsCache = { data: null, ts: 0 };
const COMBO_PRODUCTS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Inventory data cache - cache entire sheet data to avoid repeated reads
const _inventoryDataCache = new Map(); // key: spreadsheetId -> { data: {...}, ts: timestamp }
const INVENTORY_CACHE_TTL_MS = 5 * 1000; // 5 seconds (reduced for fresh data)

// SKU row lookup cache - cache SKU to row mappings
const _skuRowCache = new Map(); // key: `${spreadsheetId}_${sheetName}_${sku}` -> { row: number, ts: timestamp }
const SKU_ROW_CACHE_TTL_MS = 1 * 60 * 1000; // 1 minute

// Sheet metadata cache - cache spreadsheet metadata to avoid  repeated API calls
const _metadataCache = new Map(); // key: spreadsheetId -> { data: {...}, ts: timestamp }
const METADATA_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Date columns cache - cache date column mappings to avoid repeated reads
const _dateColumnsCache = new Map(); // key: `${spreadsheetId}_${sheetName}` -> { data: {...}, ts: timestamp }
const DATE_COLUMNS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Batch update queue - collect updates and send in batches
const _batchUpdateQueue = [];
let _batchUpdateTimer = null;
const BATCH_UPDATE_DELAY_MS = 500; // 500ms delay to collect multiple updates

// Google Sheets configuration - SECURITY: Require from environment, with hardcoded fallbacks for compatibility
const PACK_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_PACK_SHEET_ID || '1mdfGZC6CCgUIGaeDTUJDZeI1_WpU3iO3AOT9TUlNmZU';
const OKHLA_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_OKHLA_SHEET_ID || '18TylF6elXNk5iPOjhw8axcIqNaIOZ0LwT06D7GGedXw';
const BAHADURGARH_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_BAHADURGARH_SHEET_ID || '1BPtvN0VEPuQqfB3X1Pn0MKKS6ZFE8CP-j5sYqST-OUU';

const PACK_SHEET_NAME = process.env.GOOGLE_SHEETS_PACK_SHEET_NAME || 'Master Needs';
const PACK_PRODUCTS_SHEET_NAME = process.env.GOOGLE_SHEETS_PACK_PRODUCTS_SHEET_NAME || 'Pack Products';
const COMBO_PRODUCTS_SHEET_NAME = process.env.GOOGLE_SHEETS_COMBO_PRODUCTS_SHEET_NAME || 'Combo products';

// Inventory sheet names
const OKHLA_INVENTORY_SHEET_NAME = process.env.GOOGLE_SHEETS_OKHLA_INVENTORY_NAME || 'Okhla Inventory';
const BAHADURGARH_INVENTORY_SHEET_NAME = process.env.GOOGLE_SHEETS_BAHADURGARH_INVENTORY_NAME || 'Bahadurgarh Inventory';

// Inventory tab names (within the sheets)
const INVENTORY_TAB_NAME = process.env.GOOGLE_SHEETS_INVENTORY_TAB_NAME || 'Inventory';

// Validate required Google Sheets configuration
const requiredGoogleSheetsVars = {
  PACK_SPREADSHEET_ID: 'GOOGLE_SHEETS_PACK_SHEET_ID',
  OKHLA_SPREADSHEET_ID: 'GOOGLE_SHEETS_OKHLA_SHEET_ID',
  BAHADURGARH_SPREADSHEET_ID: 'GOOGLE_SHEETS_BAHADURGARH_SHEET_ID',
  PACK_SHEET_NAME: 'GOOGLE_SHEETS_PACK_SHEET_NAME',
  PACK_PRODUCTS_SHEET_NAME: 'GOOGLE_SHEETS_PACK_PRODUCTS_SHEET_NAME',
  COMBO_PRODUCTS_SHEET_NAME: 'GOOGLE_SHEETS_COMBO_PRODUCTS_SHEET_NAME',
  OKHLA_INVENTORY_SHEET_NAME: 'GOOGLE_SHEETS_OKHLA_INVENTORY_NAME',
  BAHADURGARH_INVENTORY_SHEET_NAME: 'GOOGLE_SHEETS_BAHADURGARH_INVENTORY_NAME',
  INVENTORY_TAB_NAME: 'GOOGLE_SHEETS_INVENTORY_TAB_NAME',
};

const missingGoogleSheetsVars = Object.entries(requiredGoogleSheetsVars)
  .filter(([key, envVar]) => !process.env[envVar])
  .map(([key, envVar]) => envVar);

if (missingGoogleSheetsVars.length > 0) {
  console.warn('[Google Sheets] Missing environment variables:');
  missingGoogleSheetsVars.forEach(varName => {
    console.warn(`[Google Sheets]   - ${varName}`);
  });
  console.warn('[Google Sheets] Features relying on Sheets will be disabled until configured.');
}

// Check if Google Sheets authentication is configured
const HAS_GOOGLE_SHEETS_AUTH = !!(process.env.GOOGLE_SHEETS_API_KEY || GOOGLE_CREDENTIALS_OBJECT);

// Cache for authentication warning (only log once per process)
let _authWarningLogged = false;

// Log warning only once at startup if authentication is not configured
if (!HAS_GOOGLE_SHEETS_AUTH && !_authWarningLogged) {
  console.warn('[Inventory Google Sheets] Authentication not configured. Set GOOGLE_SERVICE_ACCOUNT_* env vars in project-hub/.env to enable Google Sheets integration.');
  _authWarningLogged = true;
}

// Columns for Pack SKU sheet: SKU(A), Quantity(B), Title(C), Size(D), Vendor(E), GST(F), Price Before GST(G), Total Price(H)
const PACK_COLUMN_RANGE = 'A:H';

// Columns for Inventory sheets: Available(I), Safety Stock(A) - we need SKU column too
const INVENTORY_COLUMN_RANGE = 'A:I';

/**
 * Initialize Google Sheets API client with API key or OAuth
 * Uses credentials from environment variables (loaded via shared utility)
 */
async function getGoogleSheetsClient() {
  try {
    // Using API key for public access (if sheet is public)
    if (process.env.GOOGLE_SHEETS_API_KEY) {
      const auth = process.env.GOOGLE_SHEETS_API_KEY;
      return google.sheets({ version: 'v4', auth });
    }
    
    // Use credentials object loaded from env vars or file
    if (GOOGLE_CREDENTIALS_OBJECT) {
      if (!GOOGLE_CREDENTIALS_OBJECT.client_email || !GOOGLE_CREDENTIALS_OBJECT.private_key) {
        throw new Error('Google Sheets credentials must contain client_email and private_key');
      }
      
      const auth = new google.auth.GoogleAuth({
        credentials: GOOGLE_CREDENTIALS_OBJECT,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      const authClient = await auth.getClient();
      return google.sheets({ version: 'v4', auth: authClient });
    }
    
    throw new Error('Missing Google Sheets authentication. Configure GOOGLE_SERVICE_ACCOUNT_* env vars in project-hub/.env');
  } catch (error) {
    console.error('[Inventory Google Sheets] Error initializing client:', error.message);
    throw error;
  }
}

/**
 * Fetch pack SKU data from Google Sheets with pricing info and vendor
 * Returns a map of pack SKU to quantity, pricing, and vendor info
 * Also returns data for Pack and Combo products
 */
async function getPackSkuData() {
  // serve from cache if fresh
  const now = Date.now();
  if (_packSkuCache.data && (now - _packSkuCache.ts) < PACK_CACHE_TTL_MS) {
    return _packSkuCache.data;
  }

  try {
    // Check if Google Sheets authentication is available
    if (!HAS_GOOGLE_SHEETS_AUTH) {
      // Return empty data silently (warning already logged at startup)
      return { packSkuMap: {}, packProducts: [], comboProducts: [] };
    }
    
    const sheets = await getGoogleSheetsClient();

    // Fetch Master Needs data (single request)
    const range = `${PACK_SHEET_NAME}!${PACK_COLUMN_RANGE}`;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: PACK_SPREADSHEET_ID,
      range: range,
    });

    const rows = response.data.values;
    
    if (!rows || rows.length === 0) {
      console.log('No data found in Google Sheet');
      return { packSkuMap: {}, packProducts: [], comboProducts: [] };
    }
    
    // Create a map: SKU -> { quantity, title, size, vendor, gst, priceBeforeGst, totalPrice }
    const packSkuMap = {};

    // Load dynamic mapping from settings if available
    let fieldToHeader = null;
    try {
      const Settings = require('../models/Settings');
      const settings = await Settings.findOne().lean();
      const dynamic = settings?.sheetsMappingCurrent?.requiredFields?.pack;
      if (dynamic && typeof dynamic === 'object') {
        fieldToHeader = dynamic;
      }
    } catch (e) {
      console.warn('Settings unavailable for sheet mapping, using defaults');
    }
    
    // Build vendor suggestions from the A:H fetch to reduce calls
    const vendorSuggestions = {};
    
    // Determine dynamic mappings for Pack Products and Combo Products
    let packProductsFields = null;
    let comboFields = null;
    try {
      const Settings = require('../models/Settings');
      const settings = await Settings.findOne().lean();
      packProductsFields = settings?.sheetsMappingCurrent?.requiredFields?.packProducts || null;
      comboFields = settings?.sheetsMappingCurrent?.requiredFields?.comboProducts || null;
    } catch {}

    // Fetch Pack Products data with dynamic headers
    const packProductsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: PACK_SPREADSHEET_ID,
      range: `${PACK_PRODUCTS_SHEET_NAME}!A:Z`,
    });
    const packProductsRows = packProductsResponse.data.values || [];
    const packProducts = [];
    const pHeader = packProductsRows[0] || [];
    const pHeaderNorm = pHeader.map(h => (h || '').toString().trim().toLowerCase());
    const pIndex = (name) => {
      const s = String(name || '').trim();
      if (!s) return -1;
      if (/^[A-Za-z]+$/.test(s)) {
        let n = 0; for (let i = 0; i < s.length; i++) { n = n * 26 + (s.charCodeAt(i) - 64); } return n - 1;
      }
      if (/^\d+$/.test(s)) { const n = parseInt(s, 10); return Math.max(0, n - 1); }
      return pHeaderNorm.findIndex(h => h === s.toLowerCase());
    };
    const findSyn = (syns, fallback) => {
      const idx = pHeaderNorm.findIndex(h => syns.some(s => h.includes(s)));
      return idx >= 0 ? idx : fallback;
    };
    const pCols = {
      packSku: packProductsFields ? pIndex(packProductsFields.packSku) : findSyn(['pack sku','sku','bundle'], 0),
      packQuantity: packProductsFields ? pIndex(packProductsFields.packQuantity) : findSyn(['pack quantity','pack qty','pack size','qty in pack','quantity per pack','quantity','qty'], 2),
      correctPurchaseSku: packProductsFields ? pIndex(packProductsFields.correctPurchaseSku) : findSyn(['correct puchase sku','correct purchase sku','current purchase sku','purchase sku','single sku','component'], 1)
    };
    for (let i = 1; i < packProductsRows.length; i++) {
      const row = packProductsRows[i] || [];
      const packSku = row[pCols.packSku] ? String(row[pCols.packSku]).trim() : '';
      const packQtyStr = row[pCols.packQuantity] ? String(row[pCols.packQuantity]).trim() : '';
      const singleSku = row[pCols.correctPurchaseSku] ? String(row[pCols.correctPurchaseSku]).trim() : '';
      if (packSku) {
        packProducts.push({
          'Pack sku': packSku,
          'Pack Quantity': parseInt(packQtyStr) || 0,
          'Correct Puchase SKU': singleSku
        });
      }
    }

    // Fetch Combo Products data with dynamic headers
    // Read A:C - A=New SKU, B=(unused), C=Current Purchase SKU
    const comboProductsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: PACK_SPREADSHEET_ID,
      range: `${COMBO_PRODUCTS_SHEET_NAME}!A:C`,
    });
    const comboProductsRows = comboProductsResponse.data.values || [];
    const comboProducts = [];
    const cHeader = comboProductsRows[0] || [];
    const cIndex = (name) => {
      const s = String(name || '').trim();
      if (!s) return -1;
      if (/^[A-Za-z]+$/.test(s)) { let n = 0; for (let i = 0; i < s.length; i++) { n = n * 26 + (s.charCodeAt(i) - 64); } return n - 1; }
      if (/^\d+$/.test(s)) { const n = parseInt(s, 10); return Math.max(0, n - 1); }
      return cHeader.findIndex(h => (h || '').trim().toLowerCase() === s.toLowerCase());
    };
    const cCols = {
      newSku: comboFields ? cIndex(comboFields.newSku) : 0, // Column A
      correctPurchaseSku: comboFields ? cIndex(comboFields.correctPurchaseSku) : 2 // Column C (changed from F)
    };
    for (let i = 1; i < comboProductsRows.length; i++) {
      const row = comboProductsRows[i] || [];
      const newSku = row[cCols.newSku] ? String(row[cCols.newSku]).trim() : '';
      const singleSku = row[cCols.correctPurchaseSku] ? String(row[cCols.correctPurchaseSku]).trim() : '';
      if (newSku) {
        comboProducts.push({
          'New sku': newSku,
          'Correct Puchase SKU': singleSku
        });
      }
    }
    
    // Determine column indices via header row if available
    const headerRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : [];
    const headerRowNorm = headerRow.map(h => (h || '').toString().trim().toLowerCase());
    const headerIndex = (name) => {
      if (name === undefined || name === null) return -1;
      const s = String(name).trim();
      if (!s) return -1;
      if (/^[A-Za-z]+$/.test(s)) { let n = 0; for (let i=0; i<s.length; i++){ n = n*26 + (s.charCodeAt(i)-64);} return n-1; }
      if (/^\d+$/.test(s)) { const n = parseInt(s,10); return Math.max(0, n-1); }
      return headerRowNorm.findIndex(h => h === s.toLowerCase());
    };
    const findHeaderSyn = (syns, fallback) => {
      const idx = headerRowNorm.findIndex(h => syns.some(s => h.includes(s)));
      return idx >= 0 ? idx : fallback;
    };
    const defaultHeaders = {
      sku: 'SKU',
      quantity: 'Quantity',
      title: 'Title',
      size: 'Size',
      vendor: 'Vendor',
      gst: 'GST',
      priceBeforeGst: 'Price Before GST',
      totalPrice: 'Total Price'
    };
    const headersToUse = fieldToHeader || defaultHeaders;

    const col = {
      sku: (() => { const idx = headerIndex(headersToUse.sku); return idx >= 0 ? idx : findHeaderSyn(['sku','item sku','product sku','item code','code','pack sku','new sku'], 0); })(),
      quantity: (() => { const idx = headerIndex(headersToUse.quantity); return idx >= 0 ? idx : findHeaderSyn(['quantity','qty','pack qty','pack quantity','qty per pack'], 1); })(),
      title: (() => { const idx = headerIndex(headersToUse.title); return idx >= 0 ? idx : findHeaderSyn(['title','product name','name','item name'], 2); })(),
      size: (() => { const idx = headerIndex(headersToUse.size); return idx >= 0 ? idx : findHeaderSyn(['size','dimension','variant'], 3); })(),
      vendor: (() => { const idx = headerIndex(headersToUse.vendor); return idx >= 0 ? idx : findHeaderSyn(['vendor','vendor name','supplier','manufacturer','seller'], 4); })(),
      gst: (() => { const idx = headerIndex(headersToUse.gst); return idx >= 0 ? idx : findHeaderSyn(['gst','gst%','tax'], 5); })(),
      priceBeforeGst: (() => { const idx = headerIndex(headersToUse.priceBeforeGst); return idx >= 0 ? idx : findHeaderSyn(['price before gst','base price','cost','price','rate','unit price'], 6); })(),
      totalPrice: (() => { const idx = headerIndex(headersToUse.totalPrice); return idx >= 0 ? idx : findHeaderSyn(['total price','price after gst','price with gst','final price','total'], 7); })(),
    };

    // Skip header row (index 0)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];

      // Resolve by column index safely
      const sku = row[col.sku] ? String(row[col.sku]).trim() : '';
      const quantityStr = row[col.quantity] ? String(row[col.quantity]).trim() : '';
      const title = row[col.title] ? String(row[col.title]).trim() : '';
      const size = row[col.size] ? String(row[col.size]).trim() : '';
      const vendorName = row[col.vendor] ? String(row[col.vendor]).trim() : '';
      const gstStr = row[col.gst] ? String(row[col.gst]).trim() : '';
      const priceBeforeGstStr = row[col.priceBeforeGst] ? String(row[col.priceBeforeGst]).trim() : '';
      const totalPriceStr = row[col.totalPrice] ? String(row[col.totalPrice]).trim() : '';

      // vendor suggestions map from the same data
      if (sku && vendorName) {
        vendorSuggestions[sku.toUpperCase()] = vendorName;
      }
      // Process the data and return the complete object at the end of the function
      if (sku) {
        // Parse numeric values
        const quantity = parseInt(quantityStr) || 1; // Default to 1 if quantity is not specified
        const gst = parseFloat(gstStr) || 0;
        const priceBeforeGst = parseFloat(priceBeforeGstStr) || 0;
        const totalPrice = parseFloat(totalPriceStr) || 0;
        
        packSkuMap[sku.toUpperCase()] = {
          quantity,
          title,
          size,
          vendorName, // Store vendor name for auto-detection
          gst,
          priceBeforeGst,
          totalPrice,
          rowIndex: i + 1 // Store row index for updates (1-based)
        };
      }
    }
    
    console.log(`Loaded ${Object.keys(packSkuMap).length} SKU entries from Google Sheets`);
    console.log(`Loaded ${Object.keys(vendorSuggestions).length} vendor suggestions from Master Needs sheet`);
    const result = { packSkuMap, packProducts, comboProducts, vendorSuggestions };
    _packSkuCache = { data: result, ts: Date.now() };
    return result;
  } catch (error) {
    // Gracefully degrade without loud repeated logs
    const isQuota = error?.code === 429 || error?.status === 429 || error?.message?.includes('Quota exceeded');
    if (!isQuota) {
      console.error('Error fetching pack SKU data from Google Sheets:', error);
    }
    // Use cached data if available
    if (_packSkuCache.data) {
      return _packSkuCache.data;
    }
    const fallback = { packSkuMap: {}, packProducts: [], comboProducts: [], vendorSuggestions: {} };
    _packSkuCache = { data: fallback, ts: Date.now() };
    return fallback;
  }
}

/**
 * Get individual SKUs from Master Needs sheet column B for pack/combo SKUs
 * For SKUs starting with "P" or "C", fetch corresponding single SKU from column B
 * Returns map of packSku -> [singleSkus]
 */
async function getIndividualSkusForPackCombo(packSku) {
  try {
    // Check if Google Sheets authentication is available
    if (!HAS_GOOGLE_SHEETS_AUTH) {
      // Return empty array silently (warning already logged at startup)
      return [];
    }
    
    const sheets = await getGoogleSheetsClient();
    const normalizedSku = String(packSku || '').trim().toUpperCase();
    
    if (!normalizedSku || (!normalizedSku.startsWith('P') && !normalizedSku.startsWith('C'))) {
      return []; // Not a pack or combo SKU
    }
    
    const individualSkus = [];
    
    // For Pack Products (P starting SKUs)
    if (normalizedSku.startsWith('P')) {
      // Check Pack Products sheet - column A: Pack SKU, column B: Correct Purchase SKU (single product SKUs)
      try {
        let packRows = [];
        const now = Date.now();
        
        // Check cache first
        if (_packProductsCache.data && (now - _packProductsCache.ts) < PACK_PRODUCTS_CACHE_TTL_MS) {
          console.log('[getIndividualSkusForPackCombo] Using cached Pack Products data');
          packRows = _packProductsCache.data;
        } else {
          // Fetch from API with retry logic for quota errors
          let retries = 3;
          let delay = 1000;
          while (retries > 0) {
            try {
              const packProductsResponse = await sheets.spreadsheets.values.get({
                spreadsheetId: PACK_SPREADSHEET_ID,
                range: `${PACK_PRODUCTS_SHEET_NAME}!A:B`,
              });
              packRows = packProductsResponse.data.values || [];
              // Update cache
              _packProductsCache = { data: packRows, ts: now };
              console.log('[getIndividualSkusForPackCombo] Fetched and cached Pack Products data');
              break;
            } catch (e) {
              const isQuota = e?.code === 429 || e?.status === 429 || e?.message?.includes('Quota exceeded');
              if (isQuota && retries > 1) {
                console.warn(`[getIndividualSkusForPackCombo] Quota exceeded, retrying in ${delay/1000}s... (${retries-1} retries left)`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
                retries--;
                continue;
              } else if (isQuota && _packProductsCache.data) {
                // Use stale cache if available
                console.warn('[getIndividualSkusForPackCombo] Quota exceeded, using stale cached Pack Products data');
                packRows = _packProductsCache.data;
                break;
              } else {
                throw e;
              }
            }
          }
        }
        
        for (let i = 1; i < packRows.length; i++) {
          const row = packRows[i] || [];
          const packSkuCol = row[0] ? String(row[0]).trim().toUpperCase() : '';
          const singleSku = row[1] ? String(row[1]).trim() : '';
          if (packSkuCol === normalizedSku && singleSku) {
            if (!individualSkus.includes(singleSku)) {
              individualSkus.push(singleSku);
            }
          }
        }
      } catch (e) {
        console.error('Error reading Pack Products sheet:', e);
        // If we have cached data, try to use it even if expired
        if (_packProductsCache.data) {
          console.warn('[getIndividualSkusForPackCombo] Using expired cached Pack Products data due to error');
          const packRows = _packProductsCache.data;
          for (let i = 1; i < packRows.length; i++) {
            const row = packRows[i] || [];
            const packSkuCol = row[0] ? String(row[0]).trim().toUpperCase() : '';
            const singleSku = row[1] ? String(row[1]).trim() : '';
            if (packSkuCol === normalizedSku && singleSku) {
              if (!individualSkus.includes(singleSku)) {
                individualSkus.push(singleSku);
              }
            }
          }
        }
      }
    }
    
    // For Combo Products (C starting SKUs)
    if (normalizedSku.startsWith('C')) {
      // Check Combo Products sheet - column A: New SKU (combo SKU, merged cells), column C: Single Product Sku (one per row)
      // Multiple rows can have the same combo SKU in column A (merged), each with different single SKU in column C
      try {
        let comboRows = [];
        const now = Date.now();
        
        // Check cache first
        if (_comboProductsCache.data && (now - _comboProductsCache.ts) < COMBO_PRODUCTS_CACHE_TTL_MS) {
          console.log('[getIndividualSkusForPackCombo] Using cached Combo Products data');
          comboRows = _comboProductsCache.data;
        } else {
          // Fetch from API with retry logic for quota errors
          let retries = 3;
          let delay = 1000;
          while (retries > 0) {
            try {
              const comboResponse = await sheets.spreadsheets.values.get({
                spreadsheetId: PACK_SPREADSHEET_ID,
                range: `${COMBO_PRODUCTS_SHEET_NAME}!A:C`,
              });
              comboRows = comboResponse.data.values || [];
              // Update cache
              _comboProductsCache = { data: comboRows, ts: now };
              console.log('[getIndividualSkusForPackCombo] Fetched and cached Combo Products data');
              break;
            } catch (e) {
              const isQuota = e?.code === 429 || e?.status === 429 || e?.message?.includes('Quota exceeded');
              if (isQuota && retries > 1) {
                console.warn(`[getIndividualSkusForPackCombo] Quota exceeded, retrying in ${delay/1000}s... (${retries-1} retries left)`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
                retries--;
                continue;
              } else if (isQuota && _comboProductsCache.data) {
                // Use stale cache if available
                console.warn('[getIndividualSkusForPackCombo] Quota exceeded, using stale cached Combo Products data');
                comboRows = _comboProductsCache.data;
                break;
              } else {
                throw e;
              }
            }
          }
        }
        
        // Track the last seen combo SKU (for merged cells)
        let lastComboSku = '';
        
        for (let i = 1; i < comboRows.length; i++) {
          const row = comboRows[i] || [];
          // Column A: Combo SKU (may be empty due to merged cells)
          const comboSkuCol = row[0] ? String(row[0]).trim().toUpperCase() : '';
          // Column C: Single Product SKU
          const singleSku = row[2] ? String(row[2]).trim() : '';
          
          // If column A has a value, update lastComboSku
          if (comboSkuCol) {
            lastComboSku = comboSkuCol;
          }
          
          // If this row matches our combo SKU (either from column A or from lastComboSku due to merged cells)
          if ((comboSkuCol === normalizedSku || lastComboSku === normalizedSku) && singleSku) {
            if (!individualSkus.includes(singleSku)) {
              individualSkus.push(singleSku);
            }
          }
        }
      } catch (e) {
        console.error('Error reading Combo Products sheet:', e);
        // If we have cached data, try to use it even if expired
        if (_comboProductsCache.data) {
          console.warn('[getIndividualSkusForPackCombo] Using expired cached Combo Products data due to error');
          const comboRows = _comboProductsCache.data;
          let lastComboSku = '';
          for (let i = 1; i < comboRows.length; i++) {
            const row = comboRows[i] || [];
            const comboSkuCol = row[0] ? String(row[0]).trim().toUpperCase() : '';
            const singleSku = row[2] ? String(row[2]).trim() : '';
            if (comboSkuCol) {
              lastComboSku = comboSkuCol;
            }
            if ((comboSkuCol === normalizedSku || lastComboSku === normalizedSku) && singleSku) {
              if (!individualSkus.includes(singleSku)) {
                individualSkus.push(singleSku);
              }
            }
          }
        }
      }
    }
    
    return individualSkus.filter(Boolean); // Remove empty values
  } catch (error) {
    console.error(`Error getting individual SKUs for ${packSku}:`, error.message);
    return [];
  }
}

/**
 * Get quantity for a specific pack SKU
 */
async function getPackSkuQuantity(packSku) {
  try {
    // Check if Google Sheets authentication is available
    if (!HAS_GOOGLE_SHEETS_AUTH) {
      // Try to get from cached pack data if available
      const { packSkuMap, packProducts } = await getPackSkuData();
      const skuNorm = String(packSku || '').trim().toUpperCase();
      const mapEntry = packSkuMap ? packSkuMap[skuNorm] : null;
      if (mapEntry && mapEntry.quantity) {
        return mapEntry.quantity;
      }
      return null;
    }
    
    const sheets = await getGoogleSheetsClient();
    const skuNorm = String(packSku || '').trim().toUpperCase();
    if (!skuNorm) return null;

    // Authoritative source per request: Pack Products tab, A = Pack sku, C = Quantity
    try {
      // Resolve Pack Products sheet title robustly in case of case/spacing differences
      let packProductsTitle = PACK_PRODUCTS_SHEET_NAME;
      try {
        const meta = await sheets.spreadsheets.get({ spreadsheetId: PACK_SPREADSHEET_ID });
        const list = meta?.data?.sheets || [];
        const wanted = ['pack products', 'pack product'];
        const found = list.find(s => wanted.includes((s?.properties?.title || '').trim().toLowerCase()))
          || list.find(s => {
            const t = (s?.properties?.title || '').toLowerCase();
            return t.includes('pack') && t.includes('product');
          });
        if (found?.properties?.title) packProductsTitle = found.properties.title;
      } catch {}

      // Read A:C - A=Pack SKU, B=Current Purchase SKU, C=Pack Quantity
      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId: PACK_SPREADSHEET_ID,
        range: `${packProductsTitle}!A:C`,
        valueRenderOption: 'UNFORMATTED_VALUE',
        majorDimension: 'ROWS',
      });
      const rows = resp?.data?.values || [];
      // Try skipping header first (row 1)
      const scan = (start) => {
        for (let i = start; i < rows.length; i++) {
          const row = rows[i] || [];
          const sku = (row[0] || '').toString().trim().toUpperCase();
          if (sku === skuNorm) {
            const qty = parseInt((row[2] || '').toString().trim(), 10);
            if (!isNaN(qty) && qty > 0) return qty;
            return 0;
          }
        }
        return null;
      };
      let found = scan(1);
      if (found === null) found = scan(0); // in case there is no header row
      if (found !== null) {
        _packQtyCache.set(skuNorm, { qty: found, ts: Date.now() });
        return found;
      }
    } catch (inner) {
      // fall through to cached pack data
    }

    // Fallback to cached data
    const { packSkuMap, packProducts } = await getPackSkuData();
    const pp = Array.isArray(packProducts)
      ? packProducts.find(p => (p['Pack sku'] || '').toUpperCase() === skuNorm)
      : null;
    if (pp && pp['Pack Quantity']) {
      const qty = parseInt(pp['Pack Quantity'], 10) || 0;
      _packQtyCache.set(skuNorm, { qty, ts: Date.now() });
      return qty;
    }
    const mapEntry = packSkuMap ? packSkuMap[skuNorm] : null;
    if (mapEntry && mapEntry.quantity) {
      _packQtyCache.set(skuNorm, { qty: mapEntry.quantity, ts: Date.now() });
      return mapEntry.quantity;
    }
    return null;
  } catch (error) {
    console.error(`Error getting quantity for pack SKU ${packSku}:`, error.message || error);
    return null;
  }
}

/**
 * Fetch inventory data from a specific location sheet (Okhla or Bahadurgarh)
 * Returns a map of SKU to { available, safetyStock }
 * Sheet structure: Column A = Safety Stock, Column I = Available
 */
async function getInventoryData(spreadsheetId, locationName, forceRefresh = false) {
  try {
    const cacheKey = spreadsheetId;
    const now = Date.now();
    
    // If forceRefresh is true, skip cache and fetch fresh data
    if (!forceRefresh) {
      const cached = _inventoryDataCache.get(cacheKey);
      
      if (cached && (now - cached.ts) < INVENTORY_CACHE_TTL_MS) {
        console.log(`getInventoryData: Using cached data for ${locationName} (age: ${Math.round((now - cached.ts) / 1000)}s)`);
        return cached.data;
      } else if (cached) {
        console.log(`getInventoryData: Cache expired for ${locationName} (age: ${Math.round((now - cached.ts) / 1000)}s), fetching fresh data`);
      }
    } else {
      console.log(`getInventoryData: Force refresh requested for ${locationName}, fetching fresh data from Google Sheets`);
      // Clear cache for this spreadsheet
      _inventoryDataCache.delete(cacheKey);
    }
    
    // Check if Google Sheets authentication is available
    if (!HAS_GOOGLE_SHEETS_AUTH) {
      // Return empty data silently (warning already logged at startup)
      return {};
    }
    
    const sheets = await getGoogleSheetsClient();
    
    // Use INVENTORY_TAB_NAME (which is "Inventory") - this is the actual sheet name
    // Different locations use different spreadsheet IDs, but same sheet name "Inventory"
    const sheetName = INVENTORY_TAB_NAME;
    
    // Fetch columns A through I from the correct sheet
    const range = `${sheetName}!${INVENTORY_COLUMN_RANGE}`;
    
    console.log(`getInventoryData: Reading from spreadsheet ${spreadsheetId}, sheet "${sheetName}", range "${range}" for location ${locationName}`);
    
    // For large sheets, use batch read (if sheet has > 1000 rows)
    let rows;
    try {
      // First, try to get sheet dimensions to determine if we should use batch read
      const metadata = await getSheetMetadata(spreadsheetId);
      const sheet = metadata.sheets?.find(s => s.title === sheetName);
      const rowCount = sheet?.properties?.gridProperties?.rowCount || 0;
      
      if (rowCount > 1000) {
        // Use batch read for large sheets
        console.log(`getInventoryData: Using batch read for large sheet (${rowCount} rows)`);
        rows = await batchReadSheetData(spreadsheetId, sheetName, range, 1000);
      } else {
        // Use regular read for small sheets
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: spreadsheetId,
          range: range,
        });
        rows = response.data.values;
      }
    } catch (error) {
      // Fallback to regular read if batch read fails
      console.warn(`getInventoryData: Batch read failed, using regular read:`, error.message);
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: range,
      });
      rows = response.data.values;
    }
    
    if (!rows || rows.length === 0) {
      console.log(`No data found in ${locationName} inventory sheet`);
      return {};
    }
    
    const header = rows[0] || [];
    const headerIndex = (name) => header.findIndex(h => (h || '').trim().toLowerCase() === String(name || '').trim().toLowerCase());
    let mSku = -1, mAvail = -1, mSafety = -1, mProductName = -1;

    // Try dynamic mapping from settings
    try {
      const Settings = require('../models/Settings');
      const settings = await Settings.findOne().lean();
      const rf = settings?.sheetsMappingCurrent?.requiredFields || {};
      const tab = locationName === 'Okhla' ? rf.okhlaInventory : rf.bahadurgarhInventory;
      if (tab) {
        mSku = headerIndex(tab.sku);
        mAvail = headerIndex(tab.available);
        mSafety = headerIndex(tab.safetyStock);
        mProductName = headerIndex(tab.productName);
      }
    } catch {}
    
    const inventoryMap = {};
    
    // Skip header row (index 0)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      // Use mapped columns if available; fall back to heuristics
      let sku = '';
      if (mSku >= 0 && row[mSku] && String(row[mSku]).trim()) {
        sku = String(row[mSku]).trim();
      } else if (row[1] && row[1].trim()) {
        sku = row[1].trim();
      } else if (row[2] && row[2].trim()) {
        sku = row[2].trim();
      } else if (row[3] && row[3].trim()) {
        sku = row[3].trim();
      }

      const safetyStockStr = (mSafety >= 0 && row[mSafety] !== undefined && row[mSafety] !== null) 
        ? String(row[mSafety]).trim() 
        : (row[0] !== undefined && row[0] !== null ? String(row[0]).trim() : '');
      const availableStr = (mAvail >= 0 && row[mAvail] !== undefined && row[mAvail] !== null) 
        ? String(row[mAvail]).trim() 
        : (row[8] !== undefined && row[8] !== null ? String(row[8]).trim() : '');
      // Column D (index 3) contains product name - Map based on header: Safety Stock (A), SKU (B), Initial (C), Product Name (D)
      let productNameStr = '';
      if (mProductName >= 0 && row[mProductName]) {
        productNameStr = String(row[mProductName]).trim();
      } else {
        // Try to detect by header position: Safety Stock (A/0), SKU (B/1), Initial (C/2), Product Name (D/3)
        // Based on user mapping: Safety Stock, Sku, Initial, Product Name
        if (header.length > 3 && header[0] && header[0].toString().toLowerCase().includes('safety') && 
            header[1] && header[1].toString().toLowerCase().includes('sku') &&
            header[3] && header[3].toString().toLowerCase().includes('product')) {
          productNameStr = row[3] ? String(row[3]).trim() : '';
        } else {
          // Fallback to column D (index 3)
          productNameStr = row[3] ? String(row[3]).trim() : '';
        }
      }
      
      if (sku) {
        // Normalize SKU: trim, uppercase, remove extra spaces
        const normalizedSku = String(sku).trim().toUpperCase().replace(/\s+/g, ' ');
        const available = parseInt(availableStr) || 0;
        const safetyStock = parseInt(safetyStockStr) || 0;
        const productName = productNameStr || '';
        
        // Store with normalized SKU as key
        inventoryMap[normalizedSku] = {
          available,
          safetyStock,
          productName,
          location: locationName,
          rowIndex: i + 1,
          originalSku: sku // Keep original for debugging
        };
        
        // Also store with original SKU (uppercase) for backward compatibility
        if (normalizedSku !== sku.toUpperCase()) {
          inventoryMap[sku.toUpperCase()] = inventoryMap[normalizedSku];
        }
      }
    }
    
    console.log(`getInventoryData: Loaded ${Object.keys(inventoryMap).length} inventory entries from ${locationName} (fresh fetch at ${new Date().toISOString()})`);
    
    // Cache the result with current timestamp
    const cacheTimestamp = Date.now();
    _inventoryDataCache.set(cacheKey, { data: inventoryMap, ts: cacheTimestamp });
    console.log(`getInventoryData: Cached ${Object.keys(inventoryMap).length} entries for ${locationName} (will expire in ${INVENTORY_CACHE_TTL_MS / 1000}s)`);
    
    return inventoryMap;
  } catch (error) {
    console.error(`Error fetching inventory data from ${locationName}:`, error.message);
    return {};
  }
}

/**
 * Get combined inventory data from both locations
 */
async function getAllInventoryData(forceRefresh = false) {
  try {
    console.log(`getAllInventoryData: Fetching inventory data${forceRefresh ? ' (FORCE REFRESH - bypassing cache)' : ''}`);
    const [okhlaData, bahadurgarhData] = await Promise.all([
      getInventoryData(OKHLA_SPREADSHEET_ID, 'Okhla', forceRefresh),
      getInventoryData(BAHADURGARH_SPREADSHEET_ID, 'Bahadurgarh', forceRefresh)
    ]);
    
    console.log(`getAllInventoryData: Fetched ${Object.keys(okhlaData).length} Okhla entries and ${Object.keys(bahadurgarhData).length} Bahadurgarh entries`);
    
    return {
      okhla: okhlaData,
      bahadurgarh: bahadurgarhData
    };
  } catch (error) {
    console.error('Error fetching all inventory data:', error.message);
    return { okhla: {}, bahadurgarh: {} };
  }
}

/**
 * Batch read data from Google Sheets in chunks of 500-1000 rows
 * @param {String} spreadsheetId - Google Sheets ID
 * @param {String} sheetName - Name of the sheet
 * @param {String} range - Range to read (e.g., "A1:I1000")
 * @param {Number} chunkSize - Number of rows per chunk (default 1000)
 * @returns {Array} Array of all rows
 */
async function batchReadSheetData(spreadsheetId, sheetName, range, chunkSize = 1000) {
  try {
    const sheets = await getGoogleSheetsClient();
    
    // Parse range to get start and end
    // Format: "A1:I1000" or "SheetName!A1:I1000"
    let startRow = 1;
    let endRow = null;
    let startCol = 'A';
    let endCol = 'I';
    
    if (range.includes('!')) {
      const parts = range.split('!');
      const rangePart = parts[1];
      const match = rangePart.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
      if (match) {
        startCol = match[1];
        startRow = parseInt(match[2]);
        endCol = match[3];
        endRow = parseInt(match[4]);
      }
    } else {
      const match = range.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
      if (match) {
        startCol = match[1];
        startRow = parseInt(match[2]);
        endCol = match[3];
        endRow = parseInt(match[4]);
      }
    }
    
    // If no end row specified, read in chunks
    if (!endRow) {
      // First, get total rows
      try {
        const metadata = await getSheetMetadata(spreadsheetId);
        const sheet = metadata.sheets?.find(s => s.title === sheetName);
        endRow = sheet?.properties?.gridProperties?.rowCount || 1000;
      } catch (e) {
        endRow = 10000; // Default to 10k rows
      }
    }
    
    const allRows = [];
    let currentRow = startRow;
    
    // Read in chunks
    while (currentRow <= endRow) {
      const chunkEndRow = Math.min(currentRow + chunkSize - 1, endRow);
      const chunkRange = `${sheetName}!${startCol}${currentRow}:${endCol}${chunkEndRow}`;
      
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: chunkRange
        });
        
        const rows = response.data.values || [];
        if (rows.length > 0) {
          allRows.push(...rows);
        }
        
        // If we got fewer rows than requested, we've reached the end
        if (rows.length < chunkSize) {
          break;
        }
        
        currentRow += chunkSize;
      } catch (error) {
        console.error(`Error reading chunk ${currentRow}-${chunkEndRow}:`, error.message);
        // Continue with next chunk
        currentRow += chunkSize;
      }
    }
    
    console.log(`[batchReadSheetData] Read ${allRows.length} rows from ${sheetName} in chunks`);
    return allRows;
  } catch (error) {
    console.error('[batchReadSheetData] Error:', error.message);
    throw error;
  }
}

/**
 * Batch write data to Google Sheets in chunks of 500-1000 rows
 * @param {String} spreadsheetId - Google Sheets ID
 * @param {String} sheetName - Name of the sheet
 * @param {Array} values - Array of row arrays
 * @param {String} startCell - Starting cell (e.g., "A1")
 * @param {Number} chunkSize - Number of rows per chunk (default 1000)
 * @returns {Object} Results of the write operation
 */
async function batchWriteSheetData(spreadsheetId, sheetName, values, startCell = 'A1', chunkSize = 1000) {
  try {
    const sheets = await getGoogleSheetsClient();
    
    // Parse start cell
    const match = startCell.match(/([A-Z]+)(\d+)/);
    if (!match) {
      throw new Error(`Invalid start cell format: ${startCell}`);
    }
    
    const startCol = match[1];
    let startRow = parseInt(match[2]);
    
    // Determine end column from first row
    const endCol = columnToLetter((values[0]?.length || 9) - 1);
    
    let written = 0;
    
    // Write in chunks
    for (let i = 0; i < values.length; i += chunkSize) {
      const chunk = values.slice(i, i + chunkSize);
      const chunkStartRow = startRow + i;
      const chunkEndRow = chunkStartRow + chunk.length - 1;
      const range = `${sheetName}!${startCol}${chunkStartRow}:${endCol}${chunkEndRow}`;
      
      try {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: range,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: chunk
          }
        });
        
        written += chunk.length;
        console.log(`[batchWriteSheetData] Wrote ${chunk.length} rows to ${range}`);
      } catch (error) {
        console.error(`[batchWriteSheetData] Error writing chunk ${i}-${i + chunk.length}:`, error.message);
        throw error;
      }
    }
    
    console.log(`[batchWriteSheetData] Successfully wrote ${written} rows to ${sheetName}`);
    return { success: true, written, total: values.length };
  } catch (error) {
    console.error('[batchWriteSheetData] Error:', error.message);
    throw error;
  }
}

/**
 * Batch add comments to cells in Google Sheets (optimized - gets metadata once per spreadsheet)
 */
async function batchAddCellComments(comments) {
  try {
    if (!Array.isArray(comments) || comments.length === 0) {
      return;
    }
    
    const sheets = await getGoogleSheetsClient();
    
    // Group comments by spreadsheet and sheet, cache metadata
    const groupedComments = {};
    const metadataCache = {}; // Cache metadata per spreadsheet
    
    for (const comment of comments) {
      const { spreadsheetId, sheetName, cell, commentText } = comment;
      const key = `${spreadsheetId}_${sheetName}`;
      
      if (!groupedComments[key]) {
        groupedComments[key] = {
          spreadsheetId,
          sheetName,
          requests: []
        };
      }
      
      // Parse sheet reference
      const parts = sheetName && sheetName.includes('!') ? sheetName.split('!') : [sheetName];
      const actualSheetName = parts[0];
      
      // Get sheet ID (cache metadata per spreadsheet)
      if (!metadataCache[spreadsheetId]) {
        metadataCache[spreadsheetId] = await getSheetMetadata(spreadsheetId);
      }
      
      const metadata = metadataCache[spreadsheetId];
      const sheet = metadata.sheets.find(s => s.properties.title === actualSheetName);
      if (!sheet) {
        console.warn(`[batchAddCellComments] Sheet "${actualSheetName}" not found, skipping comment`);
        continue;
      }
      
      const sheetId = sheet.properties.sheetId;
      
      // Parse cell reference (e.g., "A1" -> {row: 1, column: 0})
      const cellMatch = cell.match(/([A-Z]+)(\d+)/);
      if (!cellMatch) continue;
      
      const columnLetter = cellMatch[1];
      const rowNumber = parseInt(cellMatch[2]);
      
      // Convert column letter to index
      let columnIndex = 0;
      for (let i = 0; i < columnLetter.length; i++) {
        columnIndex = columnIndex * 26 + (columnLetter.charCodeAt(i) - 64);
      }
      columnIndex -= 1; // Convert to 0-based
      const rowIndex = rowNumber - 1; // Convert to 0-based
      
      groupedComments[key].requests.push({
        createComment: {
          range: {
            sheetId: sheetId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1
          },
          content: commentText
        }
      });
    }
    
    // Process each spreadsheet/sheet group
    for (const group of Object.values(groupedComments)) {
      if (group.requests.length > 0) {
        try {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: group.spreadsheetId,
            requestBody: {
              requests: group.requests
            }
          });
          console.log(`[batchAddCellComments] Added ${group.requests.length} comments to ${group.sheetName}`);
        } catch (error) {
          console.error(`[batchAddCellComments] Error adding comments:`, error.message);
          // Don't throw - comments are optional
        }
      }
    }
  } catch (error) {
    console.error('[batchAddCellComments] Error batch adding comments:', error.message);
    // Don't throw - comments are optional
  }
}

/**
 * Batch update multiple cells in Google Sheets (reduces API calls)
 * Optionally adds comments to cells
 */
async function batchUpdateSheetCells(updates, comments = [], options = {}) {
  try {
    if (!Array.isArray(updates) || updates.length === 0) {
      return [];
    }
    
    const { retryOnRateLimit = true, batchSize = 1000 } = options;
    const { retryWithBackoff, isRateLimitError } = require('../utils/retryWithBackoff');
    
    const sheets = await getGoogleSheetsClient();
    
    // Group updates by spreadsheet and sheet
    const groupedUpdates = {};
    
    for (const update of updates) {
      const { spreadsheetId, sheetName, cell, value } = update;
      const key = `${spreadsheetId}_${sheetName}`;
      
      if (!groupedUpdates[key]) {
        groupedUpdates[key] = {
          spreadsheetId,
          sheetName,
          data: []
        };
      }
      
      // Parse sheet reference
      const parts = sheetName && sheetName.includes('!') ? sheetName.split('!') : [sheetName];
      const actualSheetName = parts[0];
      const range = actualSheetName ? `${actualSheetName}!${cell}` : cell;
      
      groupedUpdates[key].data.push({ range, values: [[value]] });
    }
    
    // Process each spreadsheet/sheet group with retry logic and batching
    const results = [];
    for (const group of Object.values(groupedUpdates)) {
      // Process in chunks of batchSize (default 1000)
      for (let i = 0; i < group.data.length; i += batchSize) {
        const chunk = group.data.slice(i, i + batchSize);
        
        const updateFunction = async () => {
          const data = chunk.map(({ range, values }) => ({
            range,
            values
          }));
          
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: group.spreadsheetId,
            requestBody: {
              valueInputOption: 'USER_ENTERED',
              data: data
            }
          });
          
          return chunk.map(d => ({ range: d.range, success: true }));
        };
        
        if (retryOnRateLimit) {
          try {
            const batchResults = await retryWithBackoff(updateFunction, {
              maxRetries: 5,
              initialDelayMs: 2000,
              maxDelayMs: 60000,
              onRetry: (attempt, maxRetries, delay) => {
                console.log(`[batchUpdateSheetCells] Rate limit hit, retrying batch chunk ${i}-${i + chunk.length} (attempt ${attempt}/${maxRetries}) after ${delay}ms`);
              }
            });
            results.push(...batchResults);
          } catch (error) {
            // If retry failed, mark all as failed
            console.error(`[batchUpdateSheetCells] Batch chunk ${i}-${i + chunk.length} failed after retries:`, error.message);
            results.push(...chunk.map(d => ({ range: d.range, success: false, error: error.message })));
          }
        } else {
          // No retry, just try once
          try {
            const batchResults = await updateFunction();
            results.push(...batchResults);
          } catch (error) {
            console.error(`[batchUpdateSheetCells] Batch chunk ${i}-${i + chunk.length} failed:`, error.message);
            results.push(...chunk.map(d => ({ range: d.range, success: false, error: error.message })));
          }
        }
      }
    }
    
    console.log(`[batchUpdateSheetCells] Batch updated ${results.length} cells across ${Object.keys(groupedUpdates).length} sheet(s)`);
    
    // Add comments if provided (in parallel, don't wait)
    if (comments.length > 0) {
      batchAddCellComments(comments).catch(err => {
        console.error('[batchUpdateSheetCells] Error adding comments (non-critical):', err.message);
      });
    }
    
    // Clear relevant caches after updates to force refresh
    for (const update of updates) {
      const cacheKey = update.spreadsheetId;
      _inventoryDataCache.delete(cacheKey);
      // Also clear SKU row cache for this spreadsheet
      const skuCacheKeysToDelete = [];
      for (const key of _skuRowCache.keys()) {
        if (key.startsWith(`${update.spreadsheetId}_`)) {
          skuCacheKeysToDelete.push(key);
        }
      }
      skuCacheKeysToDelete.forEach(key => _skuRowCache.delete(key));
    }
    
    return results;
  } catch (error) {
    console.error('[batchUpdateSheetCells] Error batch updating cells:', error.message);
    throw error;
  }
}

/**
 * Update a cell value in Google Sheets (now uses batch for efficiency)
 */
async function updateSheetCell(spreadsheetId, sheetName, cell, value) {
  try {
    // Use batch update even for single cell (allows batching if called multiple times)
    await batchUpdateSheetCells([{ spreadsheetId, sheetName, cell, value }], [], { retryOnRateLimit: true });
    
    // Parse sheet reference
    const parts = sheetName && sheetName.includes('!') ? sheetName.split('!') : [sheetName];
    const actualSheetName = parts[0];
    const range = actualSheetName ? `${actualSheetName}!${cell}` : cell;
    
    console.log(`Updated ${range} to ${value}`);
    return true;
  } catch (error) {
    console.error('Error updating sheet cell:', error.message);
    throw error;
  }
}

/**
 * Update pack SKU data in Google Sheets
 */
async function updatePackSkuData(sku, field, value) {
  try {
    const { packSkuMap = {} } = await getPackSkuData();
    const normalizedSku = sku.toUpperCase();
    
    if (!packSkuMap[normalizedSku]) {
      throw new Error(`SKU ${sku} not found in sheet`);
    }
    
    const rowIndex = packSkuMap[normalizedSku].rowIndex;
    
    // Map field to column
    const fieldToColumn = {
      quantity: 'B',
      title: 'C',
      size: 'D',
      vendor: 'E',
      gst: 'F',
      priceBeforeGst: 'G',
      totalPrice: 'H'
    };
    
    const column = fieldToColumn[field];
    if (!column) {
      throw new Error(`Invalid field: ${field}`);
    }
    
    const cell = `${column}${rowIndex}`;
    await updateSheetCell(PACK_SPREADSHEET_ID, PACK_SHEET_NAME, cell, value);
    
    return true;
  } catch (error) {
    console.error('Error updating pack SKU data:', error.message);
    throw error;
  }
}

/**
 * Update inventory data in Google Sheets
 */
async function updateInventoryData(sku, location, field, value) {
  try {
    const spreadsheetId = location === 'Okhla' ? OKHLA_SPREADSHEET_ID : BAHADURGARH_SPREADSHEET_ID;
    const inventoryData = await getInventoryData(spreadsheetId, location, true); // Force refresh for updates
    const normalizedSku = sku.toUpperCase();
    
    if (!inventoryData[normalizedSku]) {
      throw new Error(`SKU ${sku} not found in ${location} sheet`);
    }
    
    const rowIndex = inventoryData[normalizedSku].rowIndex;
    
    // Map field to column
    const fieldToColumn = {
      available: 'I',
      safetyStock: 'A' // Adjust based on actual structure
    };
    
    const column = fieldToColumn[field];
    if (!column) {
      throw new Error(`Invalid field: ${field}`);
    }
    
    const cell = `${column}${rowIndex}`;
    await updateSheetCell(spreadsheetId, null, cell, value);
    
    return true;
  } catch (error) {
    console.error('Error updating inventory data:', error.message);
    throw error;
  }
}

/**
 * Check if a date column exists in the sheet
 * @param {String} spreadsheetId - Google Sheets ID
 * @param {String} sheetName - Sheet name
 * @param {Date|String} date - Date to check
 * @returns {Boolean} True if date exists
 */
async function checkDateExists(spreadsheetId, sheetName, date) {
  try {
    const dateColumns = await getSheetDateColumns(spreadsheetId, sheetName);
    const formattedDate = formatDateForSheet(date);
    return !!dateColumns[formattedDate];
  } catch (error) {
    console.error('Error checking date existence:', error);
    return false;
  }
}

/**
 * Get existing values for a specific date and SKUs
 * @param {String} spreadsheetId - Google Sheets ID
 * @param {String} sheetName - Sheet name
 * @param {Date|String} date - Date to check
 * @param {Array} skus - Array of SKUs to get values for
 * @returns {Object} Map of SKU -> { Sales, Purchase, Return }
 */
async function getExistingValuesForDate(spreadsheetId, sheetName, date, skus) {
  try {
    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return {};
    }
    
    const dateColumns = await getSheetDateColumns(spreadsheetId, sheetName);
    const formattedDate = formatDateForSheet(date);
    const dateColumn = dateColumns[formattedDate];
    
    if (!dateColumn) {
      return {};
    }
    
    // Parse sheet reference
    const parts = sheetName.includes('!') ? sheetName.split('!') : [sheetName];
    const actualSheetName = parts[0];
    
    // Load SKU rows in batch (cached)
    const skuMap = await loadSkuRowCache(spreadsheetId, actualSheetName);
    
    // Collect all cells to read in one batch
    const cellsToRead = [];
    const skuCellInfo = {}; // Map to track which SKU each cell belongs to
    
    for (const sku of skus) {
      const normalizedSku = String(sku).toUpperCase().trim();
      const rowIndex = skuMap[normalizedSku];
      if (!rowIndex) continue;
      
      // Add cells for this SKU
      if (dateColumn.transactionRows['Sales']) {
        const colLetter = dateColumn.transactionRows['Sales'].columnLetter;
        const cell = `${colLetter}${rowIndex}`;
        cellsToRead.push(cell);
        skuCellInfo[cell] = { sku: normalizedSku, type: 'sales' };
      }
      
      if (dateColumn.transactionRows['Purchase']) {
        const colLetter = dateColumn.transactionRows['Purchase'].columnLetter;
        const cell = `${colLetter}${rowIndex}`;
        cellsToRead.push(cell);
        skuCellInfo[cell] = { sku: normalizedSku, type: 'purchase' };
      }
      
      if (dateColumn.transactionRows['Return']) {
        const colLetter = dateColumn.transactionRows['Return'].columnLetter;
        const cell = `${colLetter}${rowIndex}`;
        cellsToRead.push(cell);
        skuCellInfo[cell] = { sku: normalizedSku, type: 'return' };
      }
    }
    
    if (cellsToRead.length === 0) {
      return {};
    }
    
    // Batch read all cells at once
    const cellValues = await batchGetCellValues(spreadsheetId, actualSheetName, cellsToRead);
    
    // Build result map
    const values = {};
    
    for (const sku of skus) {
      const normalizedSku = String(sku).toUpperCase().trim();
      const rowIndex = skuMap[normalizedSku];
      if (!rowIndex) continue;
      
      values[normalizedSku] = {
        sales: 0,
        purchase: 0,
        return: 0
      };
      
      // Get values from batch read results
      if (dateColumn.transactionRows['Sales']) {
        const colLetter = dateColumn.transactionRows['Sales'].columnLetter;
        const cell = `${colLetter}${rowIndex}`;
        values[normalizedSku].sales = parseInt(cellValues[cell] || 0);
      }
      
      if (dateColumn.transactionRows['Purchase']) {
        const colLetter = dateColumn.transactionRows['Purchase'].columnLetter;
        const cell = `${colLetter}${rowIndex}`;
        values[normalizedSku].purchase = parseInt(cellValues[cell] || 0);
      }
      
      if (dateColumn.transactionRows['Return']) {
        const colLetter = dateColumn.transactionRows['Return'].columnLetter;
        const cell = `${colLetter}${rowIndex}`;
        values[normalizedSku].return = parseInt(cellValues[cell] || 0);
      }
    }
    
    console.log(`[getExistingValuesForDate] Batch read ${cellsToRead.length} cells for ${skus.length} SKUs`);
    
    return values;
  } catch (error) {
    console.error('Error getting existing values for date:', error);
    return {};
  }
}

/**
 * Insert a new SKU row into the inventory sheet
 * @param {String} spreadsheetId - Google Sheets ID
 * @param {String} sheetName - Sheet name
 * @param {Object} skuData - SKU data: { sku, productName, safetyStock, available }
 * @returns {Number} Row index of inserted SKU
 */
async function insertSkuRow(spreadsheetId, sheetName, skuData) {
  try {
    const sheets = await getGoogleSheetsClient();
    const metadata = await getSheetMetadata(spreadsheetId);
    const sheet = metadata.sheets.find(s => s.properties.title === sheetName);
    
    if (!sheet) {
      throw new Error(`Sheet ${sheetName} not found`);
    }
    
    const sheetId = sheet.properties.sheetId;
    
    // Get current row count
    const inventoryData = await getInventoryData(spreadsheetId, sheetName, true); // Force refresh for accurate row count
    const nextRow = Object.keys(inventoryData).length + 2; // +2 because row 1 is header
    
    // Insert a row
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          insertDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: nextRow - 1,
              endIndex: nextRow
            }
          }
        }]
      }
    });
    
    // Insert SKU data: A=Safety Stock, B=SKU, C=Product Name, I=Available
    const values = [[
      skuData.safetyStock || 0,    // Column A
      skuData.sku,                  // Column B
      skuData.productName || '',    // Column C
      '', '', '', '', '',           // Columns D-H
      skuData.available || 0        // Column I
    ]];
    
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A${nextRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    });
    
    console.log(`Inserted SKU ${skuData.sku} at row ${nextRow}`);
    return nextRow;
  } catch (error) {
    console.error('Error inserting SKU row:', error);
    throw error;
  }
}

/**
 * Get sheet dimensions (rows and columns)
 * @param {String} spreadsheetId - Google Sheets ID
 * @param {String} sheetName - Sheet name
 * @returns {Object} { rows, columns }
 */
async function getSheetDimensions(spreadsheetId, sheetName) {
  try {
    const metadata = await getSheetMetadata(spreadsheetId);
    const sheet = metadata.sheets.find(s => s.properties.title === sheetName);
    
    if (!sheet) {
      throw new Error(`Sheet ${sheetName} not found`);
    }
    
    const props = sheet.properties.gridProperties;
    return {
      rows: props.rowCount || 0,
      columns: props.columnCount || 0
    };
  } catch (error) {
    console.error('Error getting sheet dimensions:', error);
    throw error;
  }
}

/**
 * Create a new inventory sheet by duplicating an existing one
 * @param {String} spreadsheetId - Google Sheets ID
 * @param {String} templateSheetName - Name of template sheet to duplicate
 * @param {String} newSheetName - Name for new sheet
 * @returns {String} New sheet name
 */
async function createNewInventorySheet(spreadsheetId, templateSheetName, newSheetName) {
  try {
    const sheets = await getGoogleSheetsClient();
    const metadata = await getSheetMetadata(spreadsheetId);
    
    const templateSheet = metadata.sheets.find(s => s.properties.title === templateSheetName);
    if (!templateSheet) {
      throw new Error(`Template sheet ${templateSheetName} not found`);
    }
    
    // Duplicate the sheet
    const response = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          duplicateSheet: {
            sourceSheetId: templateSheet.properties.sheetId,
            newSheetName
          }
        }]
      }
    });
    
    const newSheetId = response.data.replies[0].duplicateSheet.properties.sheetId;
    
    console.log(`Created new inventory sheet: ${newSheetName} (ID: ${newSheetId})`);
    return newSheetName;
  } catch (error) {
    console.error('Error creating new inventory sheet:', error);
    throw error;
  }
}

// Helper function to get inventory sheet name based on location
// NOTE: Based on actual spreadsheet structure, the sheet name is "Inventory" for both locations
// The location-specific naming (Okhla Inventory, Bahadurgarh Inventory) refers to different tabs/sections
// but the actual Google Sheet tab name is just "Inventory"
function getInventorySheetName(location) {
  // Use INVENTORY_TAB_NAME (which is "Inventory") for both locations
  // The location is determined by the spreadsheet ID, not the sheet name
  return INVENTORY_TAB_NAME;
}

/**
 * Get service account email from credentials file
 * @returns {String|null} Service account email or null if not available
 */
function getServiceAccountEmail() {
  try {
    // If using API key instead of service account, return null
    if (process.env.GOOGLE_SHEETS_API_KEY) {
      return null;
    }
    
    // If using service account credentials from environment variable (JSON string)
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      let credentials;
      try {
        // Parse JSON string from environment variable
        credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      } catch (parseError) {
        console.error('Error parsing GOOGLE_APPLICATION_CREDENTIALS:', parseError);
        return null;
      }
      
      const email = credentials.client_email || credentials.project_id || null;
      
      if (email) {
        console.log('Service account email:', email);
        return email;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error getting service account email:', error);
    return null;
  }
}

/**
 * Clear all caches (useful for testing or when data is updated externally)
 * Clears: inventory data cache, SKU row cache, metadata cache, date columns cache, pack SKU cache, pack quantity cache
 */
function clearCaches() {
  _packSkuCache = { data: null, ts: 0 };
  _packQtyCache.clear();
  _inventoryDataCache.clear();
  _skuRowCache.clear();
  _metadataCache.clear();
  _dateColumnsCache.clear();
  console.log('[clearCaches] All Google Sheets caches cleared (pack SKU, pack quantity, inventory data, SKU rows, metadata, date columns)');
}

module.exports = {
  getGoogleSheetsClient,
  getPackSkuData,
  getPackSkuQuantity,
  getAllInventoryData,
  clearCaches,
  getInventoryData,
  updatePackSkuData,
  updateInventoryData,
  getSheetDateColumns,
  findOrCreateDateColumn,
  updateInventoryTransaction,
  batchUpdateInventoryTransactions,
  getSheetMetadata,
  mergeCells,
  insertColumns,
  checkDateExists,
  getExistingValuesForDate,
  insertSkuRow,
  getSheetDimensions,
  createNewInventorySheet,
  updateSheetCell,
  batchUpdateSheetCells,
  batchAddCellComments,
  batchGetCellValues,
  getCellValue,
  findSkuRow,
  loadSkuRowCache,
  columnToLetter,
  formatDateForSheet,
  getInventorySheetName,
  getServiceAccountEmail,
  getIndividualSkusForPackCombo,
  batchReadSheetData,
  batchWriteSheetData,
  INVENTORY_TAB_NAME
};

/**
 * Get all existing dates from a sheet
 * Returns array of formatted date strings
 */
async function getAllExistingDates(spreadsheetId, sheetName) {
  try {
    const dateColumns = await getSheetDateColumns(spreadsheetId, sheetName);
    return Object.keys(dateColumns);
  } catch (error) {
    console.error('Error getting all existing dates:', error.message);
    return [];
  }
}

module.exports.getAllExistingDates = getAllExistingDates;

async function resolveSkuComponents(sku) {
  const normalized = String(sku || '').trim().toUpperCase();
  if (!normalized) return { type: 'single', components: [] };
  if (normalized.startsWith('P')) {
    const singles = await getIndividualSkusForPackCombo(normalized);
    const qty = await getPackSkuQuantity(normalized);
    const components = (singles || []).map(s => ({ sku: String(s).trim().toUpperCase(), qty: qty || 1 }));
    return { type: 'pack', components };
  }
  if (normalized.startsWith('C')) {
    const singles = await getIndividualSkusForPackCombo(normalized);
    const components = (singles || []).map(s => ({ sku: String(s).trim().toUpperCase(), qty: 1 }));
    return { type: 'combo', components };
  }
  return { type: 'single', components: [{ sku: normalized, qty: 1 }] };
}

module.exports.resolveSkuComponents = resolveSkuComponents;

/**
 * Get sheet metadata including all sheets and their properties
 * Uses caching to avoid quota exceeded errors
 */
async function getSheetMetadata(spreadsheetId, forceRefresh = false) {
  try {
    // Check cache first
    if (!forceRefresh) {
      const cached = _metadataCache.get(spreadsheetId);
      if (cached) {
        const now = Date.now();
        const age = now - cached.ts;
        if (age < METADATA_CACHE_TTL_MS) {
          console.log(`[getSheetMetadata] Using cached metadata for ${spreadsheetId} (age: ${Math.round(age / 1000)}s)`);
          return cached.data;
        }
      }
    }
    
    const sheets = await getGoogleSheetsClient();
    const response = await sheets.spreadsheets.get({
      spreadsheetId
    });
    
    // Cache the result
    _metadataCache.set(spreadsheetId, {
      data: response.data,
      ts: Date.now()
    });
    
    console.log(`[getSheetMetadata] Fetched and cached metadata for ${spreadsheetId}`);
    return response.data;
  } catch (error) {
    // If quota error, try to return cached data if available
    const isQuota = error?.code === 429 || error?.status === 429 || error?.message?.includes('Quota exceeded');
    if (isQuota) {
      const cached = _metadataCache.get(spreadsheetId);
      if (cached) {
        console.warn(`[getSheetMetadata] Quota exceeded, using stale cached metadata for ${spreadsheetId}`);
        return cached.data;
      }
    }
    console.error('Error fetching sheet metadata:', error.message);
    throw error;
  }
}

/**
 * Get all date columns from inventory sheet
 * Returns map of date -> { columnLetter, transactionRows: { Sales, Purchase, Return } }
 */
async function getSheetDateColumns(spreadsheetId, sheetName = 'Sheet1', forceRefresh = false) {
  // Define actualSheetName in outer scope to ensure it's available in catch block
  let actualSheetName;
  
  try {
    // Parse sheet reference if it contains "!" (e.g., "Inventory!Inventory" -> "Inventory")
    // The actual sheet name is "Inventory", not "Okhla Inventory"
    const parts = sheetName.includes('!') ? sheetName.split('!') : [sheetName];
    actualSheetName = parts[0];
    
    // If we got something like "Okhla Inventory" or "Bahadurgarh Inventory", use "Inventory" instead
    if (actualSheetName.includes('Okhla') || actualSheetName.includes('Bahadurgarh')) {
      actualSheetName = INVENTORY_TAB_NAME;
    }
    
    // Check cache first
    let cacheKey = `${spreadsheetId}_${actualSheetName}`;
    if (!forceRefresh) {
      const cached = _dateColumnsCache.get(cacheKey);
      if (cached) {
        const now = Date.now();
        const age = now - cached.ts;
        if (age < DATE_COLUMNS_CACHE_TTL_MS) {
          console.log(`[getSheetDateColumns] Using cached date columns for ${actualSheetName} (age: ${Math.round(age / 1000)}s)`);
          return cached.data;
        }
      }
    }
    
    console.log(`[getSheetDateColumns] Input sheetName: "${sheetName}", parsed actualSheetName: "${actualSheetName}"`);
    
    const sheets = await getGoogleSheetsClient();
    
    // Get sheet metadata to check for merged cells (uses cached metadata)
    const metadata = await getSheetMetadata(spreadsheetId);
    
    // Try to find the sheet with the parsed name
    let sheet = metadata.sheets.find(s => s.properties.title === actualSheetName);
    
    // If not found, try "Inventory" (the actual sheet name)
    if (!sheet) {
      console.log(`[getSheetDateColumns] Sheet "${actualSheetName}" not found, trying "Inventory"`);
      actualSheetName = INVENTORY_TAB_NAME;
      sheet = metadata.sheets.find(s => s.properties.title === actualSheetName);
    }
    
    console.log(`[getSheetDateColumns] Using sheet: "${actualSheetName}"`);
    
    if (!sheet) {
      const availableSheets = metadata.sheets.map(s => s.properties.title);
      console.log(`[getSheetDateColumns] Sheet "${actualSheetName}" not found in spreadsheet`);
      console.log(`[getSheetDateColumns] Available sheets:`, availableSheets);
      // Return empty object but ensure actualSheetName is defined for error handlers
      return { actualSheetName };
    }
    
    const rangeReference = actualSheetName; // Use actual sheet name for range queries
    
    const sheetId = sheet.properties.sheetId;
    
    // Get first two rows (headers)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${rangeReference}!1:2`
    });
    
    const rows = response.data.values || [];
    if (rows.length < 2) {
      console.log('Not enough rows in sheet');
      return {};
    }
    
    const dateRow = rows[0] || []; // Row 1: Dates (may have merged cells)
    const transactionRow = rows[1] || []; // Row 2: Transaction types
    
    // Check for merged ranges in row 1 (for date headers)
    const mergedRanges = [];
    if (sheet.merges) {
      for (const merge of sheet.merges) {
        if (merge.startRowIndex === 0 && merge.endRowIndex === 1) {
          // This is a merged cell in row 1 (our date headers)
          mergedRanges.push({
            startCol: merge.startColumnIndex,
            endCol: merge.endColumnIndex,
            columnLetter: columnToLetter(merge.startColumnIndex)
          });
        }
      }
    }
    
    const dateColumns = {};
    let currentDate = null;
    let currentColumnStart = null;
    
    console.log(`Found ${mergedRanges.length} merged ranges in row 1`);
    console.log('Date row cells:', dateRow.slice(0, 20)); // Log first 20 columns
    
    // Scan through columns to find date headers
    for (let i = 0; i < Math.max(dateRow.length, transactionRow.length); i++) {
      const cellValue = dateRow[i];
      
      // Check if this column is part of a merged range (date header)
      const isInMergedRange = mergedRanges.some(range => i >= range.startCol && i < range.endCol);
      const isFirstColOfMerge = mergedRanges.some(range => i === range.startCol);
      
      if ((cellValue && cellValue.trim()) || isFirstColOfMerge) {
        // Found a date header (or first column of a merged range)
        if (currentDate && currentColumnStart !== null) {
          // Save previous date group
          const columnLetter = columnToLetter(currentColumnStart);
          if (!dateColumns[currentDate]) {
            dateColumns[currentDate] = {
              columnLetter,
              columnIndex: currentColumnStart,
              transactionRows: {}
            };
          }
        }
        
        // Get date from first cell of merged range or current cell
        if (isFirstColOfMerge) {
          const mergeRange = mergedRanges.find(range => i === range.startCol);
          const dateValue = dateRow[mergeRange.startCol] || '';
          currentDate = dateValue.trim() || `Date-${i}`;
        } else {
          currentDate = cellValue.trim();
        }
        currentColumnStart = i;
        
        console.log(`Found date header: "${currentDate}" at column ${i}`);
      }
      
      // Check transaction type for current date (every 3 columns)
      if (currentDate !== null && currentColumnStart !== null && i >= currentColumnStart) {
        const relativeCol = i - currentColumnStart;
        if (relativeCol < 3) {
          const transactionType = transactionRow[i];
          if (transactionType) {
            const columnLetter = columnToLetter(i);
            if (!dateColumns[currentDate]) {
              dateColumns[currentDate] = {
                columnLetter: columnToLetter(currentColumnStart),
                columnIndex: currentColumnStart,
                transactionRows: {}
              };
            }
            dateColumns[currentDate].transactionRows[transactionType.trim()] = {
              columnLetter,
              columnIndex: i
            };
            
            console.log(`  Transaction type "${transactionType}" at column ${i}`);
          }
        }
      }
    }
    
    // Save last date group
    if (currentDate && currentColumnStart !== null) {
      const columnLetter = columnToLetter(currentColumnStart);
      if (!dateColumns[currentDate]) {
        dateColumns[currentDate] = {
          columnLetter,
          columnIndex: currentColumnStart,
          transactionRows: {}
        };
      }
    }
    
    console.log(`Parsed ${Object.keys(dateColumns).length} date columns`);
    
    // Cache the result
    const dateColumnsCacheKeyFinal = `${spreadsheetId}_${actualSheetName}`;
    _dateColumnsCache.set(dateColumnsCacheKeyFinal, {
      data: dateColumns,
      ts: Date.now()
    });
    
    return dateColumns;
  } catch (error) {
    // If quota error, try to return cached data if available
    const isQuota = error?.code === 429 || error?.status === 429 || error?.message?.includes('Quota exceeded');
    if (isQuota) {
      const dateColumnsCacheKeyError = `${spreadsheetId}_${actualSheetName}`;
      const cached = _dateColumnsCache.get(dateColumnsCacheKeyError);
      if (cached) {
        console.warn(`[getSheetDateColumns] Quota exceeded, using stale cached date columns for ${actualSheetName}`);
        return cached.data;
      }
    }
    console.error('Error getting date columns:', error.message);
    // Return object with actualSheetName to prevent undefined errors
    return { actualSheetName };
  }
}

/**
 * Find existing date column or create new one
 * Returns { columnLetter, transactionRows: { Sales, Purchase, Return } }
 */
async function findOrCreateDateColumn(spreadsheetId, sheetName, targetDate) {
  try {
    const dateColumns = await getSheetDateColumns(spreadsheetId, sheetName, true); // Force refresh to get latest columns
    
    // Format date to match sheet format (e.g., "21 Oct")
    const formattedDate = formatDateForSheet(targetDate);
    
    // Check if date already exists - do a more thorough check for duplicates
    // Look for exact matches and also check for similar dates that might be duplicates
    const existingDateEntries = Object.entries(dateColumns);
    const exactMatch = existingDateEntries.find(([date]) => date === formattedDate);
    
    if (exactMatch) {
      console.log(`Date column "${formattedDate}" already exists`);
      return exactMatch[1];
    }
    
    // Need to create new date column
    // Find correct insertion position (dates should be sequential)
    const existingDates = Object.keys(dateColumns);
    console.log(`Existing dates: ${existingDates.join(', ') || 'none'}`);
    console.log(`Creating new date: "${formattedDate}"`);
    
    // Check for potential duplicates before creating a new column
    // This helps prevent multiple "31 Oct" columns
    const potentialDuplicates = existingDates.filter(date => {
      // Simple string comparison might not be enough, so we parse and compare
      const [day1, month1] = formattedDate.split(' ');
      const [day2, month2] = date.split(' ');
      return day1 === day2 && month1 === month2;
    });
    
    if (potentialDuplicates.length > 0) {
      console.log(`Found potential duplicate dates: ${potentialDuplicates.join(', ')}`);
      // Use the first duplicate found
      return dateColumns[potentialDuplicates[0]];
    }
    
    const insertPosition = findInsertPosition(existingDates, formattedDate, dateColumns);
    console.log(`Insert position calculated: ${insertPosition} (column ${columnToLetter(insertPosition)})`);
    
    // Parse sheet reference to ensure actualSheetName is defined
    const parts = sheetName.includes('!') ? sheetName.split('!') : [sheetName];
    let actualSheetName = parts[0];
    
    // If we got something like "Okhla Inventory" or "Bahadurgarh Inventory", use "Inventory" instead
    if (actualSheetName.includes('Okhla') || actualSheetName.includes('Bahadurgarh')) {
      actualSheetName = INVENTORY_TAB_NAME;
    }
    
    // CRITICAL: Double-check before inserting to prevent race conditions
    // Another concurrent call might have just created this column
    const refreshedDateColumns = await getSheetDateColumns(spreadsheetId, sheetName, true);
    const doubleCheckMatch = Object.entries(refreshedDateColumns).find(([date]) => date === formattedDate);
    
    if (doubleCheckMatch) {
      console.log(`[RACE CONDITION PREVENTION] Date column "${formattedDate}" was created by another call, using existing column`);
      return doubleCheckMatch[1];
    }
    
    // Clear cache before insertion to ensure fresh data after
    const cacheKey = `${spreadsheetId}_${actualSheetName}`;
    _dateColumnsCache.delete(cacheKey);
    
    // Insert columns and create headers
    const columnIndex = await insertDateColumns(
      spreadsheetId,
      sheetName,
      insertPosition,
      formattedDate
    );
    
    // Verify column was created and refresh cache
    _dateColumnsCache.delete(cacheKey);
    const verifyDateColumns = await getSheetDateColumns(spreadsheetId, sheetName, true);
    const verifyMatch = Object.entries(verifyDateColumns).find(([date]) => date === formattedDate);
    
    if (verifyMatch) {
      console.log(`Successfully created and verified date column "${formattedDate}" at position ${insertPosition}`);
      return verifyMatch[1];
    } else {
      // Column might have been created at a different position by another call
      console.warn(`[RACE CONDITION] Column "${formattedDate}" not found after insertion, checking all columns...`);
      // Re-fetch to get the actual column position
      const finalDateColumns = await getSheetDateColumns(spreadsheetId, sheetName, true);
      const finalMatch = Object.entries(finalDateColumns).find(([date]) => date === formattedDate);
      if (finalMatch) {
        console.log(`Found date column "${formattedDate}" at different position, using it`);
        return finalMatch[1];
      }
      throw new Error(`Failed to verify date column "${formattedDate}" after creation`);
    }
  } catch (error) {
    console.error('Error finding/creating date column:', error.message);
    // Parse sheet reference to ensure actualSheetName is defined in error case
    const parts = sheetName.includes('!') ? sheetName.split('!') : [sheetName];
    const actualSheetName = parts[0];
    error.actualSheetName = actualSheetName;
    throw error;
  }
}

/**
 * Insert new date columns with proper formatting
 */
async function insertDateColumns(spreadsheetId, sheetName, insertAfterColumn, dateText) {
  try {
    const sheets = await getGoogleSheetsClient();
    const metadata = await getSheetMetadata(spreadsheetId);
    
    // Parse sheet reference if it contains "!" (e.g., "Inventory!Inventory" -> "Inventory")
    // The actual sheet name is "Inventory", not "Okhla Inventory"
    const parts = sheetName.includes('!') ? sheetName.split('!') : [sheetName];
    let actualSheetName = parts[0];
    
    console.log(`[insertDateColumns] Input sheetName: "${sheetName}", parsed actualSheetName: "${actualSheetName}"`);
    
    // If we got something like "Okhla Inventory" or "Bahadurgarh Inventory", use "Inventory" instead
    if (actualSheetName.includes('Okhla') || actualSheetName.includes('Bahadurgarh')) {
      console.log(`[insertDateColumns] Normalizing sheet name from "${actualSheetName}" to "Inventory"`);
      actualSheetName = INVENTORY_TAB_NAME;
    }
    
    // Try to find the sheet
    let sheet = metadata.sheets.find(s => s.properties.title === actualSheetName);
    
    if (!sheet) {
      // Try "Inventory" as fallback (the actual sheet name)
      console.log(`[insertDateColumns] Sheet "${actualSheetName}" not found, trying "Inventory"`);
      actualSheetName = INVENTORY_TAB_NAME;
      sheet = metadata.sheets.find(s => s.properties.title === actualSheetName);
    }
    
    if (!sheet) {
      const availableSheets = metadata.sheets.map(s => s.properties.title);
      console.error(`[insertDateColumns] Sheet "${actualSheetName}" not found. Available sheets:`, availableSheets);
      throw new Error(`Sheet ${actualSheetName} not found in spreadsheet. Available sheets: ${availableSheets.join(', ')}`);
    }
    
    console.log(`[insertDateColumns] Found sheet: "${actualSheetName}"`);
    
    const rangeReference = actualSheetName; // Use actual sheet name for range queries
    
    const sheetId = sheet.properties.sheetId;
    
    // Get grid size to ensure we're inserting within bounds
    const gridProperties = sheet.properties.gridProperties || {};
    const gridColumnCount = gridProperties.columnCount || 26; // Default to 26 if not specified
    console.log(`[insertDateColumns] Grid column count: ${gridColumnCount}, Insert position: ${insertAfterColumn}`);
    
    // If insert position is at or beyond grid size, adjust it
    let adjustedInsertPosition = insertAfterColumn;
    if (insertAfterColumn >= gridColumnCount) {
      // Insert at the end of the grid using inheritFromBefore
      adjustedInsertPosition = gridColumnCount;
      console.log(`[insertDateColumns] Adjusting insert position from ${insertAfterColumn} to ${adjustedInsertPosition} (at end of grid)`);
    }
    
    console.log(`Inserting 3 columns for date "${dateText}" at index ${adjustedInsertPosition}`);
    
    // Insert 3 columns (for Sales, Purchase, Return)
    const insertRequest = {
      insertDimension: {
        range: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: adjustedInsertPosition,
          endIndex: adjustedInsertPosition + 3
        },
        // If inserting at the end of the grid, inherit formatting from previous column
        inheritFromBefore: adjustedInsertPosition >= gridColumnCount
      }
    };
    
    const requests = [
      insertRequest,
      // Merge cells for date header (row 1, span 3 columns)
      {
        mergeCells: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: adjustedInsertPosition,
            endColumnIndex: adjustedInsertPosition + 3
          },
          mergeType: 'MERGE_ALL'
        }
      }
    ];
    
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests }
    });
    
    // Update cell values - use actual sheet name (not full reference)
    const columnLetter = columnToLetter(adjustedInsertPosition);
    const updates = [
      {
        range: `${rangeReference}!${columnLetter}1`,
        values: [[dateText]]
      },
      {
        range: `${rangeReference}!${columnLetter}2:${columnToLetter(adjustedInsertPosition + 2)}2`,
        values: [['Sales', 'Purchase', 'Return']]
      }
    ];
    
    console.log(`Writing date header "${dateText}" and transaction types to columns ${columnLetter}-${columnToLetter(adjustedInsertPosition + 2)}`);
    
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updates
      }
    });
    
    console.log(`Successfully inserted date columns for "${dateText}" at position ${adjustedInsertPosition}`);
    
    return adjustedInsertPosition;
  } catch (error) {
    console.error('Error inserting date columns:', error.message);
    throw error;
  }
}

/**
 * Insert columns at specified position
 */
async function insertColumns(spreadsheetId, sheetName, startIndex, count = 3) {
  try {
    const sheets = await getGoogleSheetsClient();
    const metadata = await getSheetMetadata(spreadsheetId);
    const sheet = metadata.sheets.find(s => s.properties.title === sheetName);
    
    if (!sheet) {
      throw new Error(`Sheet ${sheetName} not found`);
    }
    
    const sheetId = sheet.properties.sheetId;
    
    const requests = [{
      insertDimension: {
        range: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex,
          endIndex: startIndex + count
        }
      }
    }];
    
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests }
    });
    
    return true;
  } catch (error) {
    console.error('Error inserting columns:', error.message);
    throw error;
  }
}

/**
 * Merge cells in a range
 */
async function mergeCells(spreadsheetId, sheetName, startRow, endRow, startCol, endCol) {
  try {
    const sheets = await getGoogleSheetsClient();
    const metadata = await getSheetMetadata(spreadsheetId);
    const sheet = metadata.sheets.find(s => s.properties.title === sheetName);
    
    if (!sheet) {
      throw new Error(`Sheet ${sheetName} not found`);
    }
    
    const sheetId = sheet.properties.sheetId;
    
    const requests = [{
      mergeCells: {
        range: {
          sheetId,
          startRowIndex: startRow,
          endRowIndex: endRow,
          startColumnIndex: startCol,
          endColumnIndex: endCol
        },
        mergeType: 'MERGE_ALL'
      }
    }];
    
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests }
    });
    
    return true;
  } catch (error) {
    console.error('Error merging cells:', error.message);
    throw error;
  }
}

/**
 * Update inventory transaction in Google Sheets
 * Finds/creates date column and updates SKU row with quantity
 */
async function updateInventoryTransaction(spreadsheetId, sheetName, sku, transactionType, date, quantity, mode = 'sum') {
  try {
    // Validate inputs
    if (!sku || typeof sku !== 'string') {
      throw new Error(`Invalid SKU: ${sku}`);
    }
    
    if (!transactionType) {
      throw new Error(`Invalid transaction type: ${transactionType}`);
    }
    
    if (!date) {
      throw new Error(`Invalid date: ${date}`);
    }
    
    console.log(`[updateInventoryTransaction] Starting update for SKU=${sku}, Type=${transactionType}, Date=${date}, Qty=${quantity}, Mode=${mode}`);
    console.log(`[updateInventoryTransaction] Spreadsheet ID: ${spreadsheetId}, Sheet Reference: ${sheetName}`);
    
    // Parse sheet reference to extract actual sheet name for findSkuRow
    const parts = sheetName.includes('!') ? sheetName.split('!') : [sheetName];
    let actualSheetName = parts[0]; // e.g., "Okhla Inventory" from "Okhla Inventory!Inventory"
    
    // Find or create date column
    console.log(`[updateInventoryTransaction] Finding/creating date column for ${date} in ${sheetName}`);
    const dateColumn = await findOrCreateDateColumn(spreadsheetId, sheetName, date);
    console.log(`[updateInventoryTransaction] Date column info:`, JSON.stringify(dateColumn, null, 2));
    
    if (!dateColumn.transactionRows[transactionType]) {
      console.error(`[updateInventoryTransaction] Transaction type ${transactionType} not found. Available:`, Object.keys(dateColumn.transactionRows));
      throw new Error(`Transaction type ${transactionType} not found in date column`);
    }
    
    const columnInfo = dateColumn.transactionRows[transactionType];
    console.log(`[updateInventoryTransaction] Column info for ${transactionType}:`, columnInfo);
    
    // Normalize SKU (trim and uppercase for consistent matching)
    const normalizedSku = String(sku).trim().toUpperCase();
    console.log(`[updateInventoryTransaction] Finding SKU row for "${normalizedSku}" (original: "${sku}") in sheet "${actualSheetName}"`);
    
    // Find SKU row - try multiple sheet names for better accuracy
    let skuRow = null;
    const inventoryTabName = INVENTORY_TAB_NAME;
    
    // First try with the parsed actual sheet name
    skuRow = await findSkuRow(spreadsheetId, actualSheetName, normalizedSku);
    
    // If not found, try with the full sheet reference
    if (!skuRow && sheetName !== actualSheetName) {
      console.log(`[updateInventoryTransaction] Retrying with full sheet reference: "${sheetName}"`);
      skuRow = await findSkuRow(spreadsheetId, sheetName, normalizedSku);
    }
    
    // If still not found, try the Inventory tab directly
    if (!skuRow && actualSheetName !== inventoryTabName) {
      console.log(`[updateInventoryTransaction] Retrying with Inventory tab: "${inventoryTabName}"`);
      skuRow = await findSkuRow(spreadsheetId, inventoryTabName, normalizedSku);
      if (skuRow) {
        actualSheetName = inventoryTabName;
        console.log(`[updateInventoryTransaction] ✅ Found SKU in "${inventoryTabName}" tab`);
      }
    }
    
    if (!skuRow) {
      console.error(`[updateInventoryTransaction] ❌ SKU ${normalizedSku} not found in any sheet`);
      console.error(`[updateInventoryTransaction] Tried sheets: ${actualSheetName}, ${sheetName}, ${inventoryTabName}`);
      console.error(`[updateInventoryTransaction] Please ensure SKU exists in column B of the inventory sheet`);
      throw new Error(`SKU ${normalizedSku} not found in any sheet. Please add this SKU to the inventory sheet first.`);
    }
    
    console.log(`[updateInventoryTransaction] ✅ Found SKU ${normalizedSku} at row ${skuRow} in sheet "${actualSheetName}"`);
    
    // Get existing value if mode is 'sum'
    let finalQuantity = quantity;
    if (mode === 'sum') {
      // Use actualSheetName for cell operations
      const cellRange = `${actualSheetName}!${columnInfo.columnLetter}${skuRow}`;
      const existingValue = await getCellValue(spreadsheetId, actualSheetName, `${columnInfo.columnLetter}${skuRow}`);
      console.log(`Existing value at ${cellRange}:`, existingValue);
      finalQuantity = (parseInt(existingValue) || 0) + quantity;
      console.log(`Final quantity (sum mode): ${finalQuantity}`);
    }
    
    // Update cell - use actualSheetName where SKU was found
    const cellRange = `${actualSheetName}!${columnInfo.columnLetter}${skuRow}`;
    const cellRef = `${columnInfo.columnLetter}${skuRow}`;
    console.log(`Updating cell ${cellRange} with value ${finalQuantity}`);
    await updateSheetCell(spreadsheetId, actualSheetName, cellRef, finalQuantity);
    
    console.log(`Successfully updated cell ${cellRange} with value ${finalQuantity}`);
    
    return { cell: cellRange, row: skuRow, column: columnInfo.columnLetter, quantity: finalQuantity, sheetName: actualSheetName };
  } catch (error) {
    console.error('Error updating inventory transaction:', error.message);
    console.error('Full error:', error);
    throw error;
  }
}

/**
 * Batch update multiple inventory transactions (ULTRA OPTIMIZED - sums same SKUs, batches everything)
 * Now includes order info in comments and sums same SKU quantities before updating
 */
async function batchUpdateInventoryTransactions(transactions) {
  try {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return [];
    }
    
    console.log(`[batchUpdateInventoryTransactions] Processing ${transactions.length} transactions in batch`);
    
    // STEP 1: Group by spreadsheet/sheet/date/transactionType first
    const groupedByDate = {};
    
    for (const transaction of transactions) {
      const { spreadsheetId, sheetName, sku, transactionType, date, quantity, mode = 'sum', orderId, orderName } = transaction;
      
      // Parse sheet name
      const parts = sheetName.includes('!') ? sheetName.split('!') : [sheetName];
      const actualSheetName = parts[0];
      
      const key = `${spreadsheetId}_${actualSheetName}_${date}_${transactionType}`;
      
      if (!groupedByDate[key]) {
        groupedByDate[key] = {
          spreadsheetId,
          sheetName: actualSheetName,
          date,
          transactionType,
          skuUpdates: {} // Group by SKU to sum quantities
        };
      }
      
      // Sum quantities for same SKU
      const normalizedSku = String(sku).trim().toUpperCase();
      if (!groupedByDate[key].skuUpdates[normalizedSku]) {
        groupedByDate[key].skuUpdates[normalizedSku] = {
          sku: normalizedSku,
          totalQuantity: 0,
          mode,
          orders: [] // Track order info for comments (with quantities)
        };
      }
      
      groupedByDate[key].skuUpdates[normalizedSku].totalQuantity += quantity || 0;
      if (orderId || orderName) {
        groupedByDate[key].skuUpdates[normalizedSku].orders.push({
          orderId: orderId || 'N/A',
          orderName: orderName || 'N/A',
          quantity: quantity || 0  // Track quantity per order for comment
        });
      }
    }
    
    console.log(`[batchUpdateInventoryTransactions] Grouped into ${Object.keys(groupedByDate).length} date groups`);
    console.log(`[batchUpdateInventoryTransactions] Summed quantities for same SKUs (reduced ${transactions.length} to ${Object.values(groupedByDate).reduce((sum, g) => sum + Object.keys(g.skuUpdates).length, 0)} unique SKU updates)`);
    
    const results = [];
    
    // STEP 2: First, create all date columns needed (batch prepare dates)
    const dateColumnsNeeded = new Map(); // Use Map to preserve Date objects
    for (const group of Object.values(groupedByDate)) {
      const key = `${group.spreadsheetId}_${group.sheetName}`;
      if (!dateColumnsNeeded.has(key)) {
        dateColumnsNeeded.set(key, new Set());
      }
      // Store the actual Date object, not stringified
      dateColumnsNeeded.get(key).add(group.date);
    }
    
    console.log(`[batchUpdateInventoryTransactions] Creating ${Array.from(dateColumnsNeeded.values()).reduce((sum, dates) => sum + dates.size, 0)} date columns...`);
    for (const [key, dates] of dateColumnsNeeded.entries()) {
      const [spreadsheetId, sheetName] = key.split('_', 2);
      for (const date of dates) {
        try {
          // date is already a Date object
          await findOrCreateDateColumn(spreadsheetId, sheetName, date instanceof Date ? date : new Date(date));
        } catch (error) {
          console.error(`[batchUpdateInventoryTransactions] Error creating date column for ${key} on ${date}:`, error.message);
        }
      }
    }
    
    // STEP 3: Process each date group
    for (const group of Object.values(groupedByDate)) {
      try {
        // Get date column info (uses cached data, already created above)
        let dateColumn;
        try {
          dateColumn = await findOrCreateDateColumn(
            group.spreadsheetId,
            group.sheetName,
            group.date
          );
        } catch (error) {
          // If quota error, try to use cached date columns
          const isQuota = error?.code === 429 || error?.status === 429 || error?.message?.includes('Quota exceeded');
          if (isQuota) {
            console.warn(`[batchUpdateInventoryTransactions] Quota error getting date column, trying cached date columns...`);
            const dateColumns = await getSheetDateColumns(group.spreadsheetId, group.sheetName);
            const formattedDate = formatDateForSheet(group.date);
            dateColumn = dateColumns[formattedDate];
            
            if (!dateColumn) {
              console.error(`[batchUpdateInventoryTransactions] Date column "${formattedDate}" not found in cache, skipping group`);
              for (const update of Object.values(group.skuUpdates)) {
                results.push({
                  sku: update.sku,
                  transactionType: group.transactionType,
                  date: group.date,
                  error: `Date column not found (quota exceeded)`
                });
              }
              continue;
            }
            console.log(`[batchUpdateInventoryTransactions] Using cached date column "${formattedDate}"`);
          } else {
            throw error; // Re-throw if not a quota error
          }
        }
        
        if (!dateColumn || !dateColumn.transactionRows || !dateColumn.transactionRows[group.transactionType]) {
          console.error(`[batchUpdateInventoryTransactions] Transaction type ${group.transactionType} not found in date column`);
          for (const update of Object.values(group.skuUpdates)) {
            results.push({
              sku: update.sku,
              transactionType: group.transactionType,
              date: group.date,
              error: `Transaction type ${group.transactionType} not found`
            });
          }
          continue;
        }
        
        const columnInfo = dateColumn.transactionRows[group.transactionType];
        
        // Load SKU rows for this sheet (batch read, cached)
        const skuMap = await loadSkuRowCache(group.spreadsheetId, group.sheetName);
        
        // Collect all cell updates, cells to read, and comments
        const cellUpdates = [];
        const cellsToRead = [];
        const comments = [];
        
        for (const update of Object.values(group.skuUpdates)) {
          const normalizedSku = update.sku;
          let skuRow = skuMap[normalizedSku];
          let actualSku = normalizedSku;
          
          // If SKU not found and starts with P or C, try to find individual SKU from pack/combo
          if (!skuRow && (normalizedSku.startsWith('P') || normalizedSku.startsWith('C'))) {
            console.log(`[batchUpdateInventoryTransactions] SKU ${normalizedSku} not found, checking for pack/combo individual SKUs...`);
            try {
              const individualSkus = await getIndividualSkusForPackCombo(normalizedSku);
              if (individualSkus.length > 0) {
                // Try first individual SKU
                for (const individualSku of individualSkus) {
                  const normalizedIndividualSku = String(individualSku).trim().toUpperCase();
                  skuRow = skuMap[normalizedIndividualSku];
                  if (skuRow) {
                    actualSku = normalizedIndividualSku;
                    console.log(`[batchUpdateInventoryTransactions] ✅ Found pack/combo SKU ${normalizedSku} mapped to individual SKU ${actualSku}`);
                    break;
                  }
                }
              }
            } catch (error) {
              console.warn(`[batchUpdateInventoryTransactions] Error checking pack/combo SKUs for ${normalizedSku}:`, error.message);
            }
          }
          
          if (!skuRow) {
            console.warn(`[batchUpdateInventoryTransactions] SKU ${normalizedSku} not found, skipping`);
            results.push({
              sku: update.sku,
              transactionType: group.transactionType,
              date: group.date,
              error: `SKU ${normalizedSku} not found`
            });
            continue;
          }
          
          const cellRef = `${columnInfo.columnLetter}${skuRow}`;
          
          // If mode is 'sum', collect cell for batch read
          if (update.mode === 'sum') {
            cellsToRead.push(cellRef);
          }
          
          cellUpdates.push({
            spreadsheetId: group.spreadsheetId,
            sheetName: group.sheetName,
            cell: cellRef,
            value: update.totalQuantity, // Already summed!
            mode: update.mode,
            sku: actualSku, // Use actual SKU found (may be individual SKU for pack/combo)
            originalSku: normalizedSku, // Keep original for reference
            originalQuantity: update.totalQuantity,
            skuRow: skuRow
          });
          
          // Prepare comment with order info (merged for same SKU)
          if (update.orders.length > 0) {
            // Aggregate quantities per unique order name
            const orderCounts = new Map();
            for (const order of update.orders) {
              const orderName = order.orderName || 'N/A';
              const qty = order.quantity || 0;
              orderCounts.set(orderName, (orderCounts.get(orderName) || 0) + qty);
            }
            
            // Format as: "med-54647 '1', msh-38238 '4'"
            const orderInfo = Array.from(orderCounts.entries())
              .map(([orderName, qty]) => `${orderName} '${qty}'`)
              .join(', ');
            
            const commentText = `Updated ${update.totalQuantity} items\nOrders: ${orderInfo}`;
            comments.push({
              spreadsheetId: group.spreadsheetId,
              sheetName: group.sheetName,
              cell: cellRef,
              commentText
            });
          }
        }
        
        // STEP 4: Batch read existing values if needed (ONE API CALL for all cells)
        if (cellsToRead.length > 0 && cellUpdates.some(u => u.mode === 'sum')) {
          const existingValues = await batchGetCellValues(group.spreadsheetId, group.sheetName, cellsToRead);
          
          // Update cell values with sum mode
          for (const update of cellUpdates) {
            if (update.mode === 'sum') {
              const existingValue = parseInt(existingValues[update.cell] || 0);
              update.value = existingValue + update.originalQuantity;
            }
            
            // Add to results
            results.push({
              sku: update.sku,
              transactionType: group.transactionType,
              date: group.date,
              cell: `${group.sheetName}!${update.cell}`,
              row: update.skuRow,
              column: columnInfo.columnLetter,
              quantity: update.value
            });
          }
        } else {
          // No sum mode, just add to results
          for (const update of cellUpdates) {
            results.push({
              sku: update.sku,
              transactionType: group.transactionType,
              date: group.date,
              cell: `${group.sheetName}!${update.cell}`,
              row: update.skuRow,
              column: columnInfo.columnLetter,
              quantity: update.value
            });
          }
        }
        
        // STEP 5: Batch update all cells (ONE API CALL) and add comments
        if (cellUpdates.length > 0) {
          const batchUpdateData = cellUpdates.map(u => ({
            spreadsheetId: u.spreadsheetId,
            sheetName: u.sheetName,
            cell: u.cell,
            value: u.value
          }));
          
          try {
            // Update cells AND add comments in one go (with retry logic)
            const updateResults = await batchUpdateSheetCells(batchUpdateData, comments, { retryOnRateLimit: true });
            if (Array.isArray(updateResults)) {
              const successful = updateResults.filter(r => r && r.success).length;
              const failed = updateResults.filter(r => r && !r.success).length;
              console.log(`[batchUpdateInventoryTransactions] ✅ Successfully updated ${successful}/${cellUpdates.length} cells for ${group.transactionType} on ${group.date} (${comments.length} comments added)`);
              if (failed > 0) {
                console.log(`[batchUpdateInventoryTransactions] ⚠️ ${failed} cells failed to update`);
              }
            } else {
              console.log(`[batchUpdateInventoryTransactions] ✅ Updated ${cellUpdates.length} cells for ${group.transactionType} on ${group.date}`);
            }
          } catch (updateError) {
            console.error(`[batchUpdateInventoryTransactions] Error batch updating cells:`, updateError.message);
            // Add errors to results for all updates
            for (const update of cellUpdates) {
              const existingResult = results.find(r => r.sku === update.sku && r.transactionType === group.transactionType && r.date === group.date);
              if (existingResult) {
                existingResult.error = `Batch update failed: ${updateError.message}`;
              } else {
                results.push({
                  sku: update.sku,
                  transactionType: group.transactionType,
                  date: group.date,
                  error: `Batch update failed: ${updateError.message}`
                });
              }
            }
            throw updateError; // Re-throw to be caught by outer catch
          }
        } else {
          console.warn(`[batchUpdateInventoryTransactions] No cell updates to process for ${group.transactionType} on ${group.date}`);
        }
      } catch (error) {
        console.error(`[batchUpdateInventoryTransactions] Error processing group:`, error.message);
        // Add errors to results
        for (const update of Object.values(group.skuUpdates)) {
          results.push({
            sku: update.sku,
            transactionType: group.transactionType,
            date: group.date,
            error: error.message
          });
        }
      }
    }
    
    console.log(`[batchUpdateInventoryTransactions] ✅ Completed ${results.length} updates (optimized from ${transactions.length} transactions)`);
    return results;
  } catch (error) {
    console.error('Error batch updating transactions:', error.message);
    throw error;
  }
}

/**
 * Load all SKU rows from a sheet into cache (batch read)
 * This reads the entire sheet once and caches all SKU->row mappings
 * Uses same logic as getInventoryData to detect SKU column dynamically
 */
async function loadSkuRowCache(spreadsheetId, sheetName) {
  try {
    const cacheKey = `${spreadsheetId}_${sheetName}`;
    const now = Date.now();
    const cached = _skuRowCache.get(cacheKey);
    
    // If we have cached data and it's a map of SKU->row, check if it's fresh
    if (cached && cached.skuMap && (now - cached.ts) < SKU_ROW_CACHE_TTL_MS) {
      console.log(`[loadSkuRowCache] Using cached SKU rows for ${sheetName} (age: ${Math.round((now - cached.ts) / 1000)}s)`);
      return cached.skuMap;
    }
    
    const sheets = await getGoogleSheetsClient();
    
    // Parse sheet reference
    const parts = sheetName.includes('!') ? sheetName.split('!') : [sheetName];
    const actualSheetName = parts[0];
    
    // Read entire sheet (A:I) to detect SKU column dynamically, same as getInventoryData
    const range = `${actualSheetName}!A:I`;
    console.log(`[loadSkuRowCache] Batch reading sheet "${range}" to detect SKU column`);
    
    let response;
    try {
      response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: range
      });
    } catch (rangeError) {
      if (rangeError.message && (
        rangeError.message.includes('Unable to parse range') ||
        rangeError.message.includes('Unable to parse') ||
        rangeError.message.includes('Unable to read range')
      )) {
        console.log(`[loadSkuRowCache] Sheet "${actualSheetName}" doesn't appear to have SKU data`);
        return {};
      }
      throw rangeError;
    }
    
    const rows = response.data.values || [];
    
    if (rows.length === 0) {
      console.log(`[loadSkuRowCache] Sheet "${actualSheetName}" has no data`);
      return {};
    }
    
    // Detect SKU column using same logic as getInventoryData
    const header = rows[0] || [];
    const headerIndex = (name) => header.findIndex(h => (h || '').trim().toLowerCase() === String(name || '').trim().toLowerCase());
    let mSku = -1;
    
    // Try dynamic mapping from settings (same as getInventoryData)
    try {
      const Settings = require('../models/Settings');
      const settings = await Settings.findOne().lean();
      const rf = settings?.sheetsMappingCurrent?.requiredFields || {};
      
      // Determine location from spreadsheet ID
      const locationName = spreadsheetId === OKHLA_SPREADSHEET_ID ? 'Okhla' : 'Bahadurgarh';
      const tab = locationName === 'Okhla' ? rf.okhlaInventory : rf.bahadurgarhInventory;
      
      if (tab && tab.sku) {
        mSku = headerIndex(tab.sku);
      }
    } catch (e) {
      console.log(`[loadSkuRowCache] Could not load settings for column mapping: ${e.message}`);
    }
    
    // Build SKU->row map (skip header row)
    const skuMap = {};
    let skuColumnFound = false;
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      
      // Use same SKU detection logic as getInventoryData
      let sku = '';
      if (mSku >= 0 && row[mSku] && String(row[mSku]).trim()) {
        sku = String(row[mSku]).trim();
        if (!skuColumnFound) {
          console.log(`[loadSkuRowCache] Using mapped SKU column index ${mSku} (from settings)`);
          skuColumnFound = true;
        }
      } else if (row[1] && String(row[1]).trim()) {
        // Column B (index 1)
        sku = String(row[1]).trim();
        if (!skuColumnFound && i === 1) {
          console.log(`[loadSkuRowCache] Using column B (index 1) for SKU`);
          skuColumnFound = true;
        }
      } else if (row[2] && String(row[2]).trim()) {
        // Column C (index 2)
        sku = String(row[2]).trim();
        if (!skuColumnFound && i === 1) {
          console.log(`[loadSkuRowCache] Using column C (index 2) for SKU`);
          skuColumnFound = true;
        }
      } else if (row[3] && String(row[3]).trim()) {
        // Column D (index 3)
        sku = String(row[3]).trim();
        if (!skuColumnFound && i === 1) {
          console.log(`[loadSkuRowCache] Using column D (index 3) for SKU`);
          skuColumnFound = true;
        }
      }
      
      if (sku) {
        const normalizedSku = String(sku).toUpperCase().trim();
        if (normalizedSku && normalizedSku !== 'SKU' && normalizedSku !== 'COLUMN 2') {
          // Avoid header row values
          skuMap[normalizedSku] = i + 1; // 1-based row index
        }
      }
    }
    
    // Log sample SKUs for debugging
    const sampleSkus = Object.keys(skuMap).slice(0, 5);
    console.log(`[loadSkuRowCache] Loaded ${Object.keys(skuMap).length} SKUs from "${actualSheetName}"`);
    if (sampleSkus.length > 0) {
      console.log(`[loadSkuRowCache] Sample SKUs: ${sampleSkus.join(', ')}`);
    }
    
    // Check if test SKU exists
    const testSku = 'MSH1005717';
    if (skuMap[testSku]) {
      console.log(`[loadSkuRowCache] ✅ Test SKU "${testSku}" found at row ${skuMap[testSku]}`);
    } else {
      console.log(`[loadSkuRowCache] ❌ Test SKU "${testSku}" NOT found in cache`);
    }
    
    // Cache the entire SKU map
    _skuRowCache.set(cacheKey, { skuMap, ts: Date.now() });
    
    return skuMap;
  } catch (error) {
    console.error('[loadSkuRowCache] Error loading SKU rows:', error.message);
    console.error('[loadSkuRowCache] Full error:', error);
    return {};
  }
}

/**
 * Find row index for a SKU in the sheet (uses cache to avoid repeated reads)
 */
async function findSkuRow(spreadsheetId, sheetName, sku, forceRefresh = false) {
  try {
    if (!sku) {
      console.error('[findSkuRow] SKU is undefined or null');
      throw new Error('SKU is required');
    }
    
    const normalizedSku = String(sku).toUpperCase().trim();
    
    // Parse sheet reference
    const parts = sheetName.includes('!') ? sheetName.split('!') : [sheetName];
    const actualSheetName = parts[0];
    
    console.log(`[findSkuRow] Looking for SKU "${normalizedSku}" in "${actualSheetName}" (forceRefresh: ${forceRefresh})`);
    
    // Force cache refresh if needed
    if (forceRefresh) {
      const cacheKey = `${spreadsheetId}_${actualSheetName}`;
      _skuRowCache.delete(cacheKey);
      console.log(`[findSkuRow] Cleared cache for ${actualSheetName} to force refresh`);
    }
    
    // Load SKU map from cache (or read once and cache)
    const skuMap = await loadSkuRowCache(spreadsheetId, actualSheetName);
    
    // Check cache for individual SKU lookup
    const individualCacheKey = `${spreadsheetId}_${actualSheetName}_${normalizedSku}`;
    const now = Date.now();
    const cached = _skuRowCache.get(individualCacheKey);
    
    if (!forceRefresh && cached && (now - cached.ts) < SKU_ROW_CACHE_TTL_MS) {
      console.log(`[findSkuRow] Using cached individual lookup for "${normalizedSku}": row ${cached.row || 'null'}`);
      return cached.row || null;
    }
    
    // Look up in the batch-loaded map
    const rowNumber = skuMap[normalizedSku];
    
    if (rowNumber) {
      console.log(`[findSkuRow] ✅ Found SKU "${normalizedSku}" at row ${rowNumber} (from cache)`);
      // Cache individual lookup
      _skuRowCache.set(individualCacheKey, { row: rowNumber, ts: Date.now() });
      return rowNumber;
    }
    
    // Log nearby SKUs for debugging
    const allSkus = Object.keys(skuMap);
    const similarSkus = allSkus.filter(s => s.includes(normalizedSku.slice(0, 5)) || normalizedSku.includes(s.slice(0, 5)));
    if (similarSkus.length > 0) {
      console.log(`[findSkuRow] Similar SKUs found: ${similarSkus.slice(0, 5).join(', ')}`);
    }
    
    console.log(`[findSkuRow] ❌ SKU "${normalizedSku}" not found in sheet "${actualSheetName}"`);
    console.log(`[findSkuRow] Total SKUs in cache: ${allSkus.length}`);
    
    // Cache negative result too (but with shorter TTL to allow retry)
    _skuRowCache.set(individualCacheKey, { row: null, ts: Date.now() });
    
    return null;
  } catch (error) {
    if (error.message && (
      error.message.includes('Unable to parse range') ||
      error.message.includes('Unable to parse') ||
      error.message.includes('Unable to read range') ||
      error.message.includes('Unable to read')
    )) {
      console.log(`[findSkuRow] Sheet doesn't appear to have SKU data: ${error.message}`);
      return null;
    }
    console.error('[findSkuRow] Error finding SKU row:', error.message);
    console.error('[findSkuRow] Full error:', error);
    throw error;
  }
}

/**
 * Helper: Convert column index to letter (0 -> A, 25 -> Z, 26 -> AA)
 */
function columnToLetter(columnIndex) {
  let temp;
  let letter = '';
  while (columnIndex >= 0) {
    temp = columnIndex % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    columnIndex = Math.floor(columnIndex / 26) - 1;
  }
  return letter;
}

/**
 * Helper: Format date for sheet (e.g., "21 Oct")
 */
function formatDateForSheet(date) {
  const d = new Date(date);
  const day = d.getDate();
  const month = d.toLocaleString('en-US', { month: 'short' });
  return `${day} ${month}`;
}

/**
 * Get cell value from sheet
 */
/**
 * Batch read multiple cell values (reduces API calls)
 */
async function batchGetCellValues(spreadsheetId, sheetName, cells) {
  try {
    if (!Array.isArray(cells) || cells.length === 0) {
      return {};
    }
    
    const sheets = await getGoogleSheetsClient();
    
    // Parse sheet reference
    const parts = sheetName.includes('!') ? sheetName.split('!') : [sheetName];
    const actualSheetName = parts[0];
    
    // Build ranges for batch read
    const ranges = cells.map(cell => `${actualSheetName}!${cell}`);
    
    // Use batchGet to read all cells at once
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: ranges
    });
    
    const results = {};
    const valueRanges = response.data.valueRanges || [];
    
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const valueRange = valueRanges[i];
      const value = valueRange?.values?.[0]?.[0] || 0;
      results[cell] = value;
    }
    
    return results;
  } catch (error) {
    console.error('[batchGetCellValues] Error batch reading cells:', error.message);
    // Fallback to individual reads if batch fails
    const results = {};
    for (const cell of cells) {
      try {
        results[cell] = await getCellValue(spreadsheetId, sheetName, cell);
      } catch (e) {
        results[cell] = 0;
      }
    }
    return results;
  }
}

/**
 * Get a single cell value (now optimized, can be batched externally)
 */
async function getCellValue(spreadsheetId, sheetName, cell) {
  try {
    const sheets = await getGoogleSheetsClient();
    
    // Parse sheet reference if it contains "!" (e.g., "Okhla Inventory!Inventory")
    const parts = sheetName.includes('!') ? sheetName.split('!') : [sheetName];
    const actualSheetName = parts[0];
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${actualSheetName}!${cell}`
    });
    return response.data.values?.[0]?.[0] || 0;
  } catch (error) {
    console.error('Error getting cell value:', error.message);
    return 0;
  }
}

/**
 * Helper: Find correct position to insert new date
 * Returns column index where new date should be inserted
 */
function findInsertPosition(existingDates, newDate, dateColumns = {}) {
  // Parse dates and sort
  const parseSheetDate = (dateStr) => {
    const [day, month] = dateStr.split(' ');
    const monthMap = {
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
      'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };
    return new Date(new Date().getFullYear(), monthMap[month], parseInt(day));
  };
  
  const newDateTime = parseSheetDate(newDate);
  
  // If we have dateColumns with actual column indices, use them
  if (Object.keys(dateColumns).length > 0) {
    // Sort dates by their actual column index
    const sortedDates = Object.entries(dateColumns).sort((a, b) => a[1].columnIndex - b[1].columnIndex);
    
    for (const [dateStr, dateInfo] of sortedDates) {
      const existingDateTime = parseSheetDate(dateStr);
      if (newDateTime < existingDateTime) {
        // Insert before this date's column
        console.log(`Inserting ${newDate} before ${dateStr} at column ${dateInfo.columnIndex}`);
        return dateInfo.columnIndex;
      }
    }
    
    // Insert at end - after the last date column
    const lastDate = sortedDates[sortedDates.length - 1];
    const lastColumnIndex = lastDate[1].columnIndex;
    return lastColumnIndex + 3; // Each date takes 3 columns
  }
  
  // Fallback: Calculate based on position in existing dates array
  for (let i = 0; i < existingDates.length; i++) {
    const existingDateTime = parseSheetDate(existingDates[i]);
    if (newDateTime < existingDateTime) {
      // Insert before this date - need to get actual column index
      console.log(`Fallback: Inserting ${newDate} at position ${i} (need actual column index)`);
      return i * 3; // Each date takes 3 columns
    }
  }
  
  // Insert at end
  console.log(`Inserting ${newDate} at end`);
  return existingDates.length * 3;
}
