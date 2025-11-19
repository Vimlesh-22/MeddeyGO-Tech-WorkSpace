const asyncHandler = require('express-async-handler');
const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');
const archiver = require('archiver');
const puppeteer = require('puppeteer-core');
const { Parser } = require('json2csv');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const Settings = require('../models/Settings');
const ProcessedOrderHistory = require('../models/ProcessedOrderHistory');
const ExportRecord = require('../models/ExportRecord');
const Activity = require('../models/Activity');
const { enqueuePdfJob, getJob } = require('../jobs/pdfJobManager');
const { getPackSkuData, getPackSkuQuantity, getAllInventoryData, updatePackSkuData, updateInventoryData } = require('../services/googleSheets');
const { executeGraphQL } = require('../services/ShopifyGraphql');
const { exportProcessedOrdersToExcel } = require('../services/excelExportService');
const { sendProcessedOrdersEmail } = require('../services/emailService');
const ejs = require('ejs');

const createZipFromResults = async (results) => {
  return await new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = new PassThrough();
    const chunks = [];

    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    archive.on('error', reject);

    archive.pipe(stream);

    results.forEach((item, index) => {
      if (!item || !item.pdfBase64) return;
      const buffer = Buffer.from(item.pdfBase64, 'base64');
      const safeName = item.fileName || `PO_${item.vendorName || 'Vendor'}_${index + 1}.pdf`;
      archive.append(buffer, { name: safeName });
    });

    archive.finalize().catch(reject);
  });
};

// Helper function to fetch product price by SKU
const fetchProductPriceBySku = async (sku) => {
  try {
    // First check local product database
    const localProduct = await Product.findOne({ sku: { $regex: new RegExp(`^${sku}$`, 'i') } });
    if (localProduct && localProduct.costPrice) {
      return localProduct.costPrice;
    }
    
    // Try to fetch from Shopify GraphQL
    const storeId = process.env.SHOPIFY_DEFAULT_STORE || 'store1';
    const query = `
      query GetProductBySku($query: String!) {
        products(first: 1, query: $query) {
          edges {
            node {
              id
              title
              variants(first: 1) {
                edges {
                  node {
                    price
                    sku
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const variables = { query: `sku:${sku}` };
    const result = await executeGraphQL(storeId, query, variables);
    
    if (result && result.products && result.products.edges.length > 0) {
      const product = result.products.edges[0].node;
      const variant = product.variants.edges[0]?.node;
      
      if (variant && variant.price) {
        return parseFloat(variant.price);
      }
    }
    
    return null; // Price not found
  } catch (error) {
    console.error(`Error fetching price for SKU ${sku}:`, error.message || error);
    return null; // Return null on error, will be handled gracefully
  }
};

let cachedChromePath = null;
let chromePathLogged = false;

const normalizeVendorName = (name = '') => name.trim().replace(/\s+/g, ' ');
const normalizeSku = (sku = '') => sku.trim().toUpperCase();
const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const STAGES_REQUIRING_VENDOR_HINTS = new Set(['Processed', 'Pending', 'Completed']);

const extractSkuTokens = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap(extractSkuTokens);
  }
  return String(value)
    .split(/[,;+/&|\n\r\t]+/)
    .map((token) => normalizeSku(token))
    .filter(Boolean);
};

const buildPackComboSinglesMap = (packProducts = [], comboProducts = []) => {
  const map = new Map();
  const addSingles = (rawSku, rawValue) => {
    const normalizedSku = normalizeSku(rawSku);
    if (!normalizedSku || !rawValue) return;
    const tokens = extractSkuTokens(rawValue);
    if (!tokens.length) return;
    if (!map.has(normalizedSku)) {
      map.set(normalizedSku, new Set());
    }
    const bucket = map.get(normalizedSku);
    tokens.forEach((token) => bucket.add(token));
  };

  (packProducts || []).forEach((entry) => {
    if (!entry) return;
    addSingles(
      entry['Pack sku'] || entry.packSku,
      entry['Correct Puchase SKU'] || entry['Correct Purchase SKU'] || entry.correctPurchaseSku || entry.singleSku
    );
  });

  (comboProducts || []).forEach((entry) => {
    if (!entry) return;
    addSingles(
      entry['New sku'] || entry.newSku,
      entry['Correct Puchase SKU'] || entry['Correct Purchase SKU'] || entry.correctPurchaseSku || entry.singleSku
    );
  });

  return map;
};

const attachPackMetadataToOrders = async (orders) => {
  if (!Array.isArray(orders) || orders.length === 0) return;
  let packSkuResponse;
  try {
    packSkuResponse = await getPackSkuData();
  } catch (error) {
    console.warn('[attachPackMetadataToOrders] Failed to load pack SKU data:', error?.message || error);
    return;
  }

  const packProductsList = Array.isArray(packSkuResponse.packProducts) ? packSkuResponse.packProducts : [];
  const comboProductsList = Array.isArray(packSkuResponse.comboProducts) ? packSkuResponse.comboProducts : [];
  const packSinglesMap = buildPackComboSinglesMap(packProductsList, comboProductsList);

  for (const order of orders) {
    if (!order || !Array.isArray(order.items)) continue;
    for (const item of order.items) {
      if (!item || !item.sku) continue;
      const normalizedSku = normalizeSku(item.sku);
      const singles = packSinglesMap.get(normalizedSku);
      if (singles && singles.size > 0) {
        item.individualSkus = Array.from(singles);
      }

      const needsVendorHints =
        !item.vendor ||
        !item.vendor.name ||
        !Array.isArray(item.vendorSuggestions) ||
        item.vendorSuggestions.length === 0 ||
        !item.autoDetectedVendor;

      if (!needsVendorHints) continue;

      try {
        const candidatePayload = {
          primarySku: item.sku,
          singleProductSku: item.singleProductSku,
          itemType: item.itemType,
          individualSkus: item.individualSkus,
        };
        const candidateSkus = await buildSkuCandidateList(candidatePayload, packSkuResponse);
        const { suggestions } = getVendorSuggestionsFromSheets(candidateSkus, packSkuResponse);

        if (suggestions && suggestions.length > 0) {
          const merged = new Map();
          const existingSuggestions = Array.isArray(item.vendorSuggestions) ? item.vendorSuggestions : [];
          existingSuggestions.forEach((name) => {
            const normalized = normalizeVendorName(name);
            if (normalized) merged.set(normalized.toLowerCase(), name);
          });
          suggestions.forEach((name) => {
            const normalized = normalizeVendorName(name);
            if (normalized) merged.set(normalized.toLowerCase(), normalized);
          });

          item.vendorSuggestions = Array.from(merged.values());
          if (!item.autoDetectedVendor) {
            item.autoDetectedVendor = item.vendorSuggestions[0];
          }
        }
      } catch (error) {
        console.warn(`[attachPackMetadataToOrders] Failed to build suggestions for ${item.sku}:`, error?.message || error);
      }
    }
  }
};

const getVendorSettingsSnapshot = async () => {
  const defaults = { autoCreateVendors: true, autoMapSkus: true };
  try {
    const settings = await Settings.findOne().lean();
    if (!settings || !settings.vendor) return defaults;
    return {
      autoCreateVendors: settings.vendor.autoCreateVendors !== undefined ? settings.vendor.autoCreateVendors : defaults.autoCreateVendors,
      autoMapSkus: settings.vendor.autoMapSkus !== undefined ? settings.vendor.autoMapSkus : defaults.autoMapSkus
    };
  } catch (error) {
    console.warn('Failed to load vendor settings, falling back to defaults:', error?.message || error);
    return defaults;
  }
};

const ensureSkuMapping = async (vendorDoc, sku, autoMap = true) => {
  if (!vendorDoc || !autoMap) return vendorDoc;
  const normalizedSku = normalizeSku(sku);
  if (!normalizedSku) return vendorDoc;

  if (!Array.isArray(vendorDoc.skuMappings)) {
    vendorDoc.skuMappings = [];
  }

  const exists = vendorDoc.skuMappings.some((mapping) => normalizeSku(mapping.sku) === normalizedSku);
  if (!exists) {
    vendorDoc.skuMappings.push({ sku: normalizedSku });
    await vendorDoc.save();
  }
  return vendorDoc;
};

const findOrCreateVendorByName = async ({
  rawName,
  sku,
  createdFrom,
  forceCreate = false,
  respectSettings = true
}) => {
  const normalizedName = normalizeVendorName(rawName);
  if (!normalizedName) return null;

  const settings = respectSettings ? await getVendorSettingsSnapshot() : { autoCreateVendors: true, autoMapSkus: true };
  const regex = new RegExp(`^${escapeRegExp(normalizedName)}$`, 'i');

  let vendor = await Vendor.findOne({ name: regex });

  if (!vendor && (forceCreate || settings.autoCreateVendors)) {
    vendor = await Vendor.create({
      name: normalizedName,
      skuMappings: sku && (forceCreate || settings.autoMapSkus) ? [{ sku: normalizeSku(sku) }] : [],
      createdFrom: createdFrom || 'system'
    });
    vendor.__wasCreated = true;
    return vendor;
  }

  if (vendor && sku) {
    await ensureSkuMapping(vendor, sku, forceCreate || settings.autoMapSkus);
  }

  if (vendor) {
    vendor.__wasCreated = false;
  }

  return vendor;
};

const buildSkuCandidateList = async ({ primarySku, singleProductSku, itemType, individualSkus = [] }, packSkuData) => {
  const candidates = new Set();
  const normalizedPrimary = normalizeSku(primarySku);
  if (normalizedPrimary) {
    candidates.add(normalizedPrimary);
  }

  extractSkuTokens(singleProductSku).forEach((token) => candidates.add(token));

  // Add individual SKUs if provided (for pack/combo SKUs)
  if (Array.isArray(individualSkus) && individualSkus.length > 0) {
    individualSkus.forEach(sku => {
      const normalized = normalizeSku(sku);
      if (normalized) {
        candidates.add(normalized);
      }
    });
  }

  const shouldInspectPackData = normalizedPrimary && (normalizedPrimary.startsWith('P') || normalizedPrimary.startsWith('C') || itemType === 'Pack' || itemType === 'Combo');
  if (shouldInspectPackData && packSkuData) {
    const { packProducts = [], comboProducts = [] } = packSkuData;
    if (Array.isArray(packProducts)) {
      const packEntry = packProducts.find((entry) => normalizeSku(entry['Pack sku'] || entry.packSku) === normalizedPrimary);
      if (packEntry) {
        extractSkuTokens(packEntry['Correct Puchase SKU'] || packEntry.correctPurchaseSku).forEach((token) => candidates.add(token));
      }
    }
    if (Array.isArray(comboProducts)) {
      const comboEntry = comboProducts.find((entry) => normalizeSku(entry['New sku'] || entry.newSku) === normalizedPrimary);
      if (comboEntry) {
        extractSkuTokens(comboEntry['Correct Puchase SKU'] || comboEntry.correctPurchaseSku).forEach((token) => candidates.add(token));
      }
    }
    
    // If individual SKUs not provided, try to fetch them
    if ((!Array.isArray(individualSkus) || individualSkus.length === 0) && normalizedPrimary) {
      try {
        const { getIndividualSkusForPackCombo } = require('../services/googleSheets');
        const fetchedIndividualSkus = await getIndividualSkusForPackCombo(normalizedPrimary);
        if (Array.isArray(fetchedIndividualSkus) && fetchedIndividualSkus.length > 0) {
          fetchedIndividualSkus.forEach(sku => {
            const normalized = normalizeSku(sku);
            if (normalized) {
              candidates.add(normalized);
            }
          });
        }
      } catch (error) {
        console.warn(`[buildSkuCandidateList] Error fetching individual SKUs for ${normalizedPrimary}:`, error.message);
      }
    }
  }

  return Array.from(candidates);
};

const getVendorSuggestionsFromSheets = (skuCandidates, packSkuData) => {
  const suggestions = [];
  const vendorMap = new Map();
  if (!packSkuData) return { suggestions, vendorMap };

  const { vendorSuggestions = {}, packSkuMap = {} } = packSkuData;

  // Process all SKU candidates (including individual SKUs for pack/combo)
  skuCandidates.forEach((sku) => {
    const normalizedSku = normalizeSku(sku);
    if (!normalizedSku) return;
    
    // Try to get vendor from vendorSuggestions first, then packSkuMap
    const rawName = vendorSuggestions?.[normalizedSku] || packSkuMap?.[normalizedSku]?.vendorName;
    const normalizedName = normalizeVendorName(rawName || '');
    if (!normalizedName) return;
    
    // Use lowercase key to avoid duplicates
    const key = normalizedName.toLowerCase();
    if (!vendorMap.has(key)) {
      vendorMap.set(key, { vendorName: normalizedName, sourceSku: normalizedSku });
      suggestions.push(normalizedName);
    } else {
      // If vendor already exists, add this SKU to the source list
      const existing = vendorMap.get(key);
      if (existing && !existing.sourceSkus) {
        existing.sourceSkus = [existing.sourceSku];
      }
      if (existing && existing.sourceSkus && !existing.sourceSkus.includes(normalizedSku)) {
        existing.sourceSkus.push(normalizedSku);
      }
    }
  });

  return { suggestions, vendorMap };
};

const getChromeExecutableCandidates = () => {
  const candidates = [];
  if (process.env.CHROME_EXECUTABLE_PATH) candidates.push(process.env.CHROME_EXECUTABLE_PATH);
  if (process.env.EDGE_EXECUTABLE_PATH) candidates.push(process.env.EDGE_EXECUTABLE_PATH);
  if (process.env.CHROMIUM_EXECUTABLE_PATH) candidates.push(process.env.CHROMIUM_EXECUTABLE_PATH);
  if (process.env.BRAVE_EXECUTABLE_PATH) candidates.push(process.env.BRAVE_EXECUTABLE_PATH);

  if (process.platform === 'win32') {
    candidates.push(
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
      'C:/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe',
      'C:/Program Files/Chromium/Application/chrome.exe',
      'C:/Program Files (x86)/Chromium/Application/chrome.exe'
    );
  } else if (process.platform === 'linux') {
    candidates.push(
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge',
      '/usr/bin/brave-browser',
      '/snap/bin/chromium'
    );
  } else {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    );
  }

  return candidates;
};

// Helper function to get Chrome executable path
const getChromeExecutablePath = () => {
  if (cachedChromePath) return cachedChromePath;
  const candidates = getChromeExecutableCandidates();
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate)) {
        cachedChromePath = candidate;
        if (!chromePathLogged) {
          console.log(`[Puppeteer] Using browser executable: ${candidate}`);
          chromePathLogged = true;
        }
        return cachedChromePath;
      }
    } catch (error) {
      if (!chromePathLogged) {
        console.warn(`[Puppeteer] Error while checking path ${candidate}: ${error.message}`);
      }
    }
  }
  return null;
};

// Helper function to launch Puppeteer with optimized settings for fast PDF generation
const launchPuppeteerBrowser = async () => {
  const primary = getChromeExecutablePath();
  const tried = new Set();
  const list = getChromeExecutableCandidates();
  const order = [primary, ...list].filter(Boolean).filter((p, i, a) => a.indexOf(p) === i);
  for (const executablePath of order) {
    if (tried.has(executablePath)) continue;
    tried.add(executablePath);
    try {
      const browser = await puppeteer.launch({
        headless: 'new',
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-breakpad',
          '--disable-client-side-phishing-detection',
          '--disable-component-update',
          '--disable-default-apps',
          '--disable-features=TranslateUI',
          '--disable-hang-monitor',
          '--disable-ipc-flooding-protection',
          '--disable-popup-blocking',
          '--disable-prompt-on-repost',
          '--disable-renderer-backgrounding',
          '--disable-sync',
          '--metrics-recording-only',
          '--no-first-run',
          '--safebrowsing-disable-auto-update',
          '--enable-automation',
          '--password-store=basic',
          '--use-mock-keychain'
        ]
      });
      cachedChromePath = executablePath;
      return browser;
    } catch (error) {
      console.error('[Puppeteer] Failed to launch browser', { executablePath, message: error?.message });
      continue;
    }
  }
  throw new Error('No suitable browser executable found. Set CHROME_EXECUTABLE_PATH or EDGE_EXECUTABLE_PATH.');
};



// Initialize Shopify clients for multiple stores
const shopifyStores = {};
const Shopify = require('shopify-api-node');

// Setup for Store 1
if (process.env.SHOPIFY_SHOP_NAME_1 && process.env.SHOPIFY_ACCESS_TOKEN_1) {
  shopifyStores.store1 = new Shopify({
    shopName: process.env.SHOPIFY_SHOP_NAME_1,
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN_1,
  });
}

// Setup for Store 2
if (process.env.SHOPIFY_SHOP_NAME_2 && process.env.SHOPIFY_ACCESS_TOKEN_2) {
  shopifyStores.store2 = new Shopify({
    shopName: process.env.SHOPIFY_SHOP_NAME_2,
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN_2,
  });
}

// Setup for Store 3
if (process.env.SHOPIFY_SHOP_NAME_3 && process.env.SHOPIFY_ACCESS_TOKEN_3) {
  shopifyStores.store3 = new Shopify({
    shopName: process.env.SHOPIFY_SHOP_NAME_3,
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN_3,
  });
}

// Helper function to get store display name
const getStoreDisplayName = (storeId) => {
  const storeNames = {
    store1: process.env.SHOPIFY_SHOP_NAME_1 || 'Store 1',
    store2: process.env.SHOPIFY_SHOP_NAME_2 || 'Store 2',
    store3: process.env.SHOPIFY_SHOP_NAME_3 || 'Store 3'
  };
  return storeNames[storeId] || storeId || 'Unknown Store';
};

// @desc    Get all orders with filters and sorting
// @route   GET /api/orders
// @access  Public
const getOrders = asyncHandler(async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.json({
      orders: [],
      pagination: { total: 0, page: 1, pages: 0 }
    });
  }
  const { 
    stage, 
    search, 
    sortBy, 
    sortOrder,
    paymentStatus,
    fulfillmentStatus,
    vendor,
    vendorFilter,
    startDate,
    endDate,
    hideProcessed,
    recentlyMoved,
    page = 1,
    limit = 50
  } = req.query;

  // For Initial, Processed, and Pending stages, remove pagination to show all orders
  const isInitialStage = stage === 'Initial';
  const isProcessedStage = stage === 'Processed';
  const isPendingStage = stage === 'Pending';
  const shouldShowAll = isInitialStage || isProcessedStage || isPendingStage;
  // Increased limit to 50000 to show all orders (was 10000)
  const safeLimit = shouldShowAll ? 50000 : Math.min(parseInt(limit), 100);
  
  // Set a default stage if none is provided to limit data fetched
  let query = {};
  
  // Stage filter
  if (stage) {
    query.stage = stage;
  }
  
  // Enhanced filtering for Initial stage: ensure orders that have been processed or moved never appear again
  if (isInitialStage) {
    // 1. CRITICAL: Force stage to 'Initial' - this must be enforced regardless of date filters
    //    This ensures orders that have been moved to other stages NEVER appear in Initial
    //    Even if date filters are applied, we ONLY show orders with stage='Initial'
    query.stage = 'Initial';
    
    // 2. Exclude orders where items are marked processed
    query['items.processed'] = { $ne: true };
    
    // 3. Exclude orders with no items (safety check - empty orders should be deleted, but just in case)
    //    Using $expr to check array size, combining with existing query safely
    if (query.$expr) {
      // If $expr already exists, combine with $and
      const existingExpr = query.$expr;
      delete query.$expr;
      query.$and = [
        { $expr: existingExpr },
        { $expr: { $gt: [{ $size: { $ifNull: ['$items', []] } }, 0] } }
      ];
    } else {
      query.$expr = { $gt: [{ $size: { $ifNull: ['$items', []] } }, 0] };
    }

    try {
      const processedIds = await ProcessedOrderHistory.distinct('orderId');
      if (Array.isArray(processedIds) && processedIds.length > 0) {
        query._id = { $nin: processedIds };
      }
    } catch (e) {
      console.error('[getOrders] Failed to load processed order ids for exclusion:', e.message);
    }
  }
  
  // Search by order name, customer name, email, or item details
  if (search) {
    const searchRegex = { $regex: search, $options: 'i' };
    query.$or = [
      { orderName: searchRegex },
      { customerName: searchRegex },
      { customerEmail: searchRegex },
      { 'items.productName': searchRegex },
      { 'items.sku': searchRegex }
    ];
  }

  // Payment status filter
  if (paymentStatus) {
    query.paymentStatus = paymentStatus;
  }

  // Fulfillment status filter
  if (fulfillmentStatus) {
    query.fulfillmentStatus = fulfillmentStatus;
  }

  // Vendor filter
  if (vendor || vendorFilter) {
    const mongoose = require('mongoose');
    const raw = vendor || vendorFilter;
    const vendorId = mongoose.Types.ObjectId.isValid(raw) ? new mongoose.Types.ObjectId(raw) : null;
    if (vendorId) {
      query['items.vendor'] = vendorId;
    }
  }

  // Recently moved filter - show only orders that have items moved to Processed stage recently
  // Build items filter conditions for Processed stage
  let itemsDateConditions = [];
  let recentCutoffTime = null;
  
  if (recentlyMoved && isProcessedStage) {
    const hours = parseInt(recentlyMoved) || 24;
    recentCutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    itemsDateConditions.push({ processed: true, processedAt: { $gte: recentCutoffTime } });
    console.log("Recently moved filter applied:", { hours, cutoffTime: recentCutoffTime });
  }

  // Date and time range filter - Enhanced with time support
  const { startTime, endTime } = req.query;
  
  if (startDate || endDate) {
    console.log("Date/time filter applied:", { startDate, endDate, startTime, endTime, stage });
    
    // For Processed stage, filter by items.processedAt (item-level timestamps)
    // For Initial stage, filter by shopifyCreatedAt (Shopify order date)
    // For other stages, filter by createdAt (import/creation date)
    const dateField = isInitialStage ? 'shopifyCreatedAt' : (isProcessedStage ? 'items.processedAt' : 'createdAt');
    const useItemsDateFilter = isProcessedStage; // Flag to use $elemMatch for items
    
    // Initialize date query if not already set
    if (!useItemsDateFilter && !query[dateField]) {
      query[dateField] = {};
    }
    
    // STRICT DATE FILTERING for all stages when startDate and endDate are the same
    // If startDate and endDate are the same, filter for exact date only (with optional time range)
    const isStrictDateFilter = startDate && endDate && startDate === endDate;
    
    if (startDate) {
      try {
        // Convert to date object
        const startDateTime = new Date(startDate);
        
        // If startTime is provided, parse and apply it; otherwise use start of day
        if (startTime) {
          const [hours, minutes, seconds = 0] = startTime.split(':').map(Number);
          startDateTime.setUTCHours(hours || 0, minutes || 0, seconds || 0, 0);
        } else {
          startDateTime.setUTCHours(0, 0, 0, 0);
        }
        
        console.log(`Start date/time parsed (${dateField}):`, startDateTime, startDateTime.toISOString());
        
        if (useItemsDateFilter) {
          // For Processed stage, add date condition to items filter
          const itemsDateQuery = { processedAt: { $gte: startDateTime } };
          
          // For strict date filter, also set upper bound
          if (isStrictDateFilter) {
            const endDateTime = new Date(startDate);
            if (endTime) {
              const [hours, minutes, seconds = 0] = endTime.split(':').map(Number);
              endDateTime.setUTCHours(hours || 23, minutes || 59, seconds || 59, 999);
            } else {
              endDateTime.setUTCHours(23, 59, 59, 999);
            }
            itemsDateQuery.processedAt.$lte = endDateTime;
            console.log(`[StrictDateFilter] ${stage} stage - filtering items by processedAt: ${startDate} ${startTime || '00:00:00'} to ${endTime || '23:59:59'} (${startDateTime.toISOString()} to ${endDateTime.toISOString()})`);
          }
          
          itemsDateConditions.push(itemsDateQuery);
        } else {
          // For other stages, use regular field filter
          query[dateField].$gte = startDateTime;
          
          // For strict date filter (same start and end date), also set upper bound
          if (isStrictDateFilter) {
            const endDateTime = new Date(startDate);
            // If endTime is provided, use it; otherwise use end of day
            if (endTime) {
              const [hours, minutes, seconds = 0] = endTime.split(':').map(Number);
              endDateTime.setUTCHours(hours || 23, minutes || 59, seconds || 59, 999);
            } else {
              endDateTime.setUTCHours(23, 59, 59, 999);
            }
            query[dateField].$lte = endDateTime;
            console.log(`[StrictDateFilter] ${stage} stage - filtering for exact date/time: ${startDate} ${startTime || '00:00:00'} to ${endTime || '23:59:59'} (${startDateTime.toISOString()} to ${endDateTime.toISOString()})`);
          }
        }
      } catch (err) {
        console.error("Error parsing start date/time:", err);
      }
    }
    
    if (endDate && !isStrictDateFilter) {
      try {
        // Convert to date object
        const endDateTime = new Date(endDate);
        
        // If endTime is provided, parse and apply it; otherwise use end of day
        if (endTime) {
          const [hours, minutes, seconds = 0] = endTime.split(':').map(Number);
          endDateTime.setUTCHours(hours || 23, minutes || 59, seconds || 59, 999);
        } else {
          endDateTime.setUTCHours(23, 59, 59, 999);
        }
        
        console.log(`End date/time parsed (${dateField}):`, endDateTime, endDateTime.toISOString());
        
        if (useItemsDateFilter) {
          // For Processed stage, add to items conditions
          itemsDateConditions.push({ processedAt: { $lte: endDateTime } });
        } else {
          // For other stages, use regular field filter
          query[dateField].$lte = endDateTime;
        }
      } catch (err) {
        console.error("Error parsing end date/time:", err);
      }
    }
    
    // For Initial stage, also handle manual orders that might not have shopifyCreatedAt
    // Use $or to match either shopifyCreatedAt OR createdAt (for manual orders)
    if (isInitialStage && (query.shopifyCreatedAt?.$gte || query.shopifyCreatedAt?.$lte)) {
      // Create an $or condition to match either shopifyCreatedAt or createdAt
      const dateConditions = [];
      
      // Condition 1: Orders with shopifyCreatedAt matching the date range
      const shopifyDateCondition = { shopifyCreatedAt: query.shopifyCreatedAt };
      dateConditions.push(shopifyDateCondition);
      
      // Condition 2: Manual orders (no shopifyCreatedAt) with createdAt matching the date range
      const manualDateCondition = {
        isManual: true,
        createdAt: query.shopifyCreatedAt
      };
      dateConditions.push(manualDateCondition);
      
      // Remove the direct shopifyCreatedAt condition and use $or instead
      delete query.shopifyCreatedAt;
      
      // Combine with existing $or if it exists
      if (query.$or) {
        query.$and = [
          { $or: query.$or },
          { $or: dateConditions }
        ];
        delete query.$or;
      } else {
        query.$or = dateConditions;
      }
      
      console.log(`[InitialStage] Using $or for date filter to include manual orders`);
    }
    
    // Log the final date query
    console.log(`Date query (${dateField}):`, JSON.stringify(query[dateField] || query.$or));
  }
  
  if (isProcessedStage && itemsDateConditions.length > 0) {
    const recentItemsFilter = itemsDateConditions.length === 1 ? itemsDateConditions[0] : { $and: itemsDateConditions };
    const recentOrderFilter = recentCutoffTime ? { processedAt: { $gte: recentCutoffTime } } : null;
    const recentItemsMatch = { items: { $elemMatch: recentItemsFilter } };
    const orConditions = recentOrderFilter ? [recentOrderFilter, recentItemsMatch] : [recentItemsMatch];
    if (query.$or) {
      const existingOr = query.$or;
      delete query.$or;
      query.$and = [ { $or: existingOr }, { $or: orConditions } ];
    } else {
      query.$or = orConditions;
    }
    console.log("Combined recent filter:", JSON.stringify(query.$or || query.$and));
  }

  // Sorting
  let sortOptions = {};
  
  // Handle special case for item name sorting
  if (sortBy === 'items.productName') {
    // Use createdAt as fallback for performance
    sortOptions = { createdAt: sortOrder === 'desc' ? -1 : 1 };
  } 
  else if (sortBy) {
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
  } 
  else {
    // Default sorting
    // For Processed stage, prioritize most recently processed
    sortOptions = isProcessedStage
      ? { processedAt: -1, createdAt: -1 }
      : { isManual: -1, createdAt: -1 };
  }

  // Calculate skip value for pagination (skip for Initial stage)
  const skip = isInitialStage ? 0 : (parseInt(page) - 1) * safeLimit;

  try {
    console.log("Final query:", JSON.stringify(query));
    
    // Use countDocuments for accurate count (no need for lean on count)
    const countPromise = Order.countDocuments(query).exec();

    // Select only necessary fields to reduce payload size
  const selectFields = 'orderName shopifyOrderName shopifyOrderId customerName customerEmail stage paymentStatus fulfillmentStatus orderStatus isManual createdAt processedAt items';

    // Use lean() to get plain JavaScript objects instead of Mongoose documents for faster response
    const ordersPromise = Order.find(query)
      .select(selectFields)
      .sort(sortOptions)
      .skip(skip)
      .limit(safeLimit)
      .populate('items.vendor', 'name') // Only populate vendor name for performance
      .lean()
      .exec();
      
    console.log("Query executed with sort:", sortOptions, "skip:", skip, "limit:", safeLimit);

    // Execute both promises concurrently
    const [totalOrders, orders] = await Promise.all([countPromise, ordersPromise]);

    if (!isInitialStage && stage && STAGES_REQUIRING_VENDOR_HINTS.has(stage)) {
      await attachPackMetadataToOrders(orders);
    }

    // If Initial stage, group items by SKU and fetch pack SKU data
    if (isInitialStage) {
      console.log('Processing Initial stage orders with SKU grouping...');
      
      // Fetch pack SKU data and inventory data from Google Sheets
      // Force refresh inventory data to always get latest from sheets (not from cache)
      const [packSkuResponse, inventoryDataRaw] = await Promise.all([
        getPackSkuData(),
        getAllInventoryData(true) // Force refresh to get fresh data from Google Sheets
      ]);
      
      // Validate and normalize inventoryData structure
      let inventoryData = { okhla: {}, bahadurgarh: {} };
      if (inventoryDataRaw && typeof inventoryDataRaw === 'object') {
        inventoryData.okhla = inventoryDataRaw.okhla && typeof inventoryDataRaw.okhla === 'object' ? inventoryDataRaw.okhla : {};
        inventoryData.bahadurgarh = inventoryDataRaw.bahadurgarh && typeof inventoryDataRaw.bahadurgarh === 'object' ? inventoryDataRaw.bahadurgarh : {};
      } else {
        console.error('[Inventory] getAllInventoryData returned invalid data:', typeof inventoryDataRaw, inventoryDataRaw);
      }
      
      const packSkuMap = packSkuResponse.packSkuMap || packSkuResponse || {};
      const vendorSuggestions = packSkuResponse.vendorSuggestions || {};
      const packProductsList = Array.isArray(packSkuResponse.packProducts) ? packSkuResponse.packProducts : [];
      const comboProductsList = Array.isArray(packSkuResponse.comboProducts) ? packSkuResponse.comboProducts : [];
      const packSinglesMap = buildPackComboSinglesMap(packProductsList, comboProductsList);
      
      console.log(`Loaded ${Object.keys(packSkuMap).length} SKU entries`);
      console.log(`Loaded ${Object.keys(inventoryData.okhla).length} Okhla inventory entries`);
      console.log(`Loaded ${Object.keys(inventoryData.bahadurgarh).length} Bahadurgarh inventory entries`);
      
      // Log sample SKUs from inventory for debugging
      if (Object.keys(inventoryData.okhla).length > 0) {
        const sampleOkhlaSkus = Object.keys(inventoryData.okhla).slice(0, 3);
        console.log(`[Inventory] Sample Okhla SKUs: ${sampleOkhlaSkus.join(', ')}`);
      }
      if (Object.keys(inventoryData.bahadurgarh).length > 0) {
        const sampleBahadurgarhSkus = Object.keys(inventoryData.bahadurgarh).slice(0, 3);
        console.log(`[Inventory] Sample Bahadurgarh SKUs: ${sampleBahadurgarhSkus.join(', ')}`);
      }
      
      // Group all items by SKU across all orders
      const skuGroups = {};
      
      orders.forEach(order => {
        order.items.forEach(item => {
          const sku = item.sku || 'NO_SKU';
          const normalizedSku = sku.toUpperCase();
          
          if (!skuGroups[normalizedSku]) {
            skuGroups[normalizedSku] = {
              sku: sku,
              productName: item.productName,
              variantName: item.variantName,
              orders: [],
              totalQuantity: 0,
              vendor: item.vendor,
              isPack: normalizedSku.startsWith('PACK'),
              packQuantity: 0,
              finalQuantity: 0,
              packSkuInfo: null,
              // Pricing data
              gst: 0,
              priceBeforeGst: 0,
              totalPrice: 0,
              // Inventory data
              okhlaAvailable: 0,
              okhlaSafetyStock: 0,
              bahadurgarhAvailable: 0,
              bahadurgarhSafetyStock: 0,
              // Auto-detected vendor from sheet
              autoDetectedVendor: null,
              vendorSuggestions: [],
              // Can satisfy order
              canSatisfy: false,
              totalAvailable: 0
            };
          }
          
          const itemPrice = typeof item.price === 'number' ? item.price : (item.costPrice || 0);
          const itemQuantity = item.quantity || 1;
          const extendedPrice = itemPrice * itemQuantity;
          
          // Add order info with received date and status context
          skuGroups[normalizedSku].orders.push({
            orderId: order._id,
            orderName: order.orderName || order.shopifyOrderName,
            customerName: order.customerName,
            quantity: itemQuantity,
            itemId: item._id,
            receivedDate: order.createdAt || new Date(),
            variantName: item.variantName || '',
            vendor: item.vendor,
            price: itemPrice,
            linePrice: extendedPrice,
            paymentStatus: order.paymentStatus || 'Pending',
            fulfillmentStatus: order.fulfillmentStatus || 'Unfulfilled',
            orderStatus: order.orderStatus || order.fulfillmentStatus || 'Unfulfilled',
            isManual: !!order.isManual,
            autoDetectedVendor: null,
            vendorSuggestions: [],
            singleProductSku: item.singleProductSku || '',
            itemType: item.itemType || null
          });
          
          // Sum quantities
          skuGroups[normalizedSku].totalQuantity += itemQuantity;
        });
      });
      
      // Process SKUs and add pricing/inventory/vendor data
      for (const skuKey of Object.keys(skuGroups)) {
        const group = skuGroups[skuKey];
        const normalizedGroupSku = normalizeSku(group?.sku || skuKey);
        
        // Add SKU data and pricing from Google Sheets
        if (packSkuMap[normalizedGroupSku]) {
          const packInfo = packSkuMap[normalizedGroupSku];
          
          if (group.isPack) {
            // For pack SKUs, prioritize Pack Products sheet quantity (Column C), fallback to Master Needs quantity
            let packQty = packInfo.quantity; // Default from Master Needs
            const packProductsData = packProductsList;
            const packProduct = Array.isArray(packProductsData)
              ? packProductsData.find(p => (p['Pack sku'] || '').toUpperCase() === skuKey)
              : null;
            if (packProduct && packProduct['Pack Quantity']) {
              packQty = parseInt(packProduct['Pack Quantity'], 10) || packQty;
            }
            group.packQuantity = packQty;
            group.finalQuantity = group.totalQuantity * packQty;
          } else {
            group.finalQuantity = group.totalQuantity;
          }
          
          group.gst = packInfo.gst || 0;
          group.priceBeforeGst = packInfo.priceBeforeGst || 0;
          group.totalPrice = packInfo.totalPrice || 0;
          group.packSkuInfo = packInfo;
          
          // Size from Google Sheets (Column D)
          if (packInfo.size) {
            group.sizeFromSheet = packInfo.size;
          }
          
          // Auto-detect vendor from Google Sheets (Column E) or vendorSuggestions fallback
          if (packInfo.vendorName) {
            group.autoDetectedVendor = packInfo.vendorName;
            group.orders.forEach(orderEntry => {
              if (!orderEntry.autoDetectedVendor) {
                orderEntry.autoDetectedVendor = packInfo.vendorName;
              }
            });
          } else if (vendorSuggestions && vendorSuggestions[normalizedGroupSku]) {
            group.autoDetectedVendor = vendorSuggestions[normalizedGroupSku];
            group.orders.forEach(orderEntry => {
              if (!orderEntry.autoDetectedVendor) {
                orderEntry.autoDetectedVendor = vendorSuggestions[normalizedGroupSku];
              }
            });
          }
        } else {
          if (group.isPack) {
            // Even if not in packSkuMap, check packProducts array for quantity
            const packProductsData = packProductsList;
            const packProduct = Array.isArray(packProductsData)
              ? packProductsData.find(p => (p['Pack sku'] || '').toUpperCase() === skuKey)
              : null;
            if (packProduct && packProduct['Pack Quantity']) {
              const packQty = parseInt(packProduct['Pack Quantity'], 10) || 0;
              group.packQuantity = packQty;
              group.finalQuantity = group.totalQuantity * packQty;
            } else {
              console.log(`Pack SKU ${skuKey} not found in Google Sheets`);
              group.packQuantity = 0;
              group.finalQuantity = group.totalQuantity;
            }
          } else {
            group.finalQuantity = group.totalQuantity;
          }
          // Attempt vendor suggestion even if pack map missing
          if (vendorSuggestions && vendorSuggestions[normalizedGroupSku]) {
            group.autoDetectedVendor = vendorSuggestions[normalizedGroupSku];
            group.orders.forEach(orderEntry => {
              if (!orderEntry.autoDetectedVendor) {
                orderEntry.autoDetectedVendor = vendorSuggestions[normalizedGroupSku];
              }
            });
          }
        }

        const candidatePayload = {
          primarySku: group.sku,
          singleProductSku: group.orders.map((entry) => entry.singleProductSku).filter(Boolean),
          itemType: group.isPack ? 'Pack' : (group.orders.find((entry) => entry.itemType)?.itemType || null),
          individualSkus: Array.isArray(group.individualSkus) ? group.individualSkus : []
        };
        const candidateSkus = await buildSkuCandidateList(candidatePayload, packSkuResponse);
        const { suggestions: vendorSuggestionList } = getVendorSuggestionsFromSheets(candidateSkus, packSkuResponse);
        let mergedVendorSuggestions = Array.isArray(vendorSuggestionList) ? [...vendorSuggestionList] : [];
        const normalizedAutoVendor = normalizeVendorName(group.autoDetectedVendor || '');
        if (normalizedAutoVendor) {
          const hasAutoVendor = mergedVendorSuggestions.some(
            (name) => normalizeVendorName(name) === normalizedAutoVendor
          );
          if (!hasAutoVendor) {
            mergedVendorSuggestions.unshift(group.autoDetectedVendor);
          }
        }

        if (mergedVendorSuggestions.length > 0 && !group.autoDetectedVendor) {
          group.autoDetectedVendor = mergedVendorSuggestions[0];
        }

        group.vendorSuggestions = mergedVendorSuggestions;
        group.orders.forEach((orderEntry) => {
          if (mergedVendorSuggestions.length > 0 && !orderEntry.autoDetectedVendor) {
            orderEntry.autoDetectedVendor = mergedVendorSuggestions[0];
          }

          const orderVendorList = [...mergedVendorSuggestions];
          const normalizedOrderAuto = normalizeVendorName(orderEntry.autoDetectedVendor || '');
          if (
            normalizedOrderAuto &&
            orderVendorList.every((name) => normalizeVendorName(name) !== normalizedOrderAuto)
          ) {
            orderVendorList.unshift(orderEntry.autoDetectedVendor);
          }
          orderEntry.vendorSuggestions = orderVendorList;
        });

        // Get size from Shopify variant_title (default source)
        // Extract size from first order's variantName
        if (group.orders && group.orders.length > 0 && group.orders[0].variantName) {
          const variantName = group.orders[0].variantName;
          // Try to extract size patterns like "Small", "Medium", "Large", "XL", "XXL", "S", "M", "L", numbers like "40", "42"
          const sizeMatch = variantName.match(/\b(XXS|XS|S|M|L|XL|XXL|XXXL|Small|Medium|Large|X-Large|XX-Large|\d+)\b/i);
          if (sizeMatch) {
            group.sizeFromShopify = sizeMatch[0];
          }
        }
        
        // Set default size (prioritize Shopify, fallback to Sheet)
        group.size = group.sizeFromShopify || group.sizeFromSheet || null;
        
        // Initialize inventory values to 0 by default
        group.okhlaAvailable = 0;
        group.okhlaSafetyStock = 0;
        group.bahadurgarhAvailable = 0;
        group.bahadurgarhSafetyStock = 0;
        
        // Normalize SKU for lookup (trim, uppercase, remove extra spaces)
        const normalizedSkuForLookup = String(skuKey).trim().toUpperCase().replace(/\s+/g, ' ');
        
        // Check if this is a pack/combo SKU - if so, expand to individual SKUs first
        const isPackCombo = normalizedSkuForLookup.startsWith('P') || normalizedSkuForLookup.startsWith('C');
        let skusToCheck = [normalizedSkuForLookup]; // Default: check the SKU itself
        let individualSkusArray = []; // Store individual SKUs for frontend display
        
        if (isPackCombo) {
          // Get individual SKUs for pack/combo
          const { getIndividualSkusForPackCombo } = require('../services/googleSheets');
          try {
            const individualSkus = await getIndividualSkusForPackCombo(normalizedSkuForLookup);
            if (individualSkus && individualSkus.length > 0) {
              // Normalize individual SKUs
              skusToCheck = individualSkus.map(sku => String(sku).trim().toUpperCase().replace(/\s+/g, ' '));
              // Store original individual SKUs (not normalized) for frontend display
              individualSkusArray = individualSkus.filter(Boolean);
              console.log(`[Inventory] Pack/Combo SKU ${skuKey} expands to ${skusToCheck.length} individual SKUs: ${skusToCheck.join(', ')}`);
            } else {
              console.warn(`[Inventory] Pack/Combo SKU ${skuKey} could not be expanded, checking SKU directly`);
            }
          } catch (error) {
            console.error(`[Inventory] Error expanding pack/combo SKU ${skuKey}:`, error.message);
            // Fallback to checking the SKU directly
            skusToCheck = [normalizedSkuForLookup];
          }
        }
        
        // Store individual SKUs in group object for frontend display (for both single and grouped orders)
        group.individualSkus = individualSkusArray;
        
        // Aggregate inventory from all SKUs (for pack/combo, sum all individual SKUs)
        let totalOkhlaAvailable = 0;
        let totalOkhlaSafety = 0;
        let totalBahadurgarhAvailable = 0;
        let totalBahadurgarhSafety = 0;
        let foundAny = false;
        
        // Ensure inventoryData has the expected structure
        if (!inventoryData || typeof inventoryData !== 'object') {
          console.error(`[Inventory] Invalid inventoryData structure for SKU ${skuKey}:`, typeof inventoryData);
          inventoryData = { okhla: {}, bahadurgarh: {} };
        }
        if (!inventoryData.okhla || typeof inventoryData.okhla !== 'object') {
          console.error(`[Inventory] Invalid inventoryData.okhla for SKU ${skuKey}`);
          inventoryData.okhla = {};
        }
        if (!inventoryData.bahadurgarh || typeof inventoryData.bahadurgarh !== 'object') {
          console.error(`[Inventory] Invalid inventoryData.bahadurgarh for SKU ${skuKey}`);
          inventoryData.bahadurgarh = {};
        }
        
        for (const checkSku of skusToCheck) {
          // Normalize SKU for lookup (ensure consistent format)
          const normalizedCheckSku = String(checkSku).trim().toUpperCase().replace(/\s+/g, ' ');
          
          // Add inventory data from Okhla - try multiple lookup methods
          let okhlaInventory = inventoryData.okhla[normalizedCheckSku] || 
                              inventoryData.okhla[checkSku] ||
                              inventoryData.okhla[checkSku.toUpperCase()] ||
                              inventoryData.okhla[checkSku.toLowerCase()];
          
          // If still not found, try case-insensitive search
          if (!okhlaInventory && inventoryData.okhla) {
            const okhlaKeys = Object.keys(inventoryData.okhla);
            const matchingKey = okhlaKeys.find(key => 
              key.toUpperCase().trim() === normalizedCheckSku ||
              key.toUpperCase().trim().replace(/\s+/g, ' ') === normalizedCheckSku
            );
            if (matchingKey) {
              okhlaInventory = inventoryData.okhla[matchingKey];
            }
          }
          
          if (okhlaInventory) {
            totalOkhlaAvailable += parseInt(okhlaInventory.available) || 0;
            totalOkhlaSafety += parseInt(okhlaInventory.safetyStock) || 0;
            foundAny = true;
            console.log(`[Inventory] Found Okhla data for ${checkSku}: Available=${okhlaInventory.available}, Safety=${okhlaInventory.safetyStock}`);
          }
          
          // Add inventory data from Bahadurgarh - try multiple lookup methods
          let bahadurgarhInventory = inventoryData.bahadurgarh[normalizedCheckSku] || 
                                    inventoryData.bahadurgarh[checkSku] ||
                                    inventoryData.bahadurgarh[checkSku.toUpperCase()] ||
                                    inventoryData.bahadurgarh[checkSku.toLowerCase()];
          
          // If still not found, try case-insensitive search
          if (!bahadurgarhInventory && inventoryData.bahadurgarh) {
            const bahadurgarhKeys = Object.keys(inventoryData.bahadurgarh);
            const matchingKey = bahadurgarhKeys.find(key => 
              key.toUpperCase().trim() === normalizedCheckSku ||
              key.toUpperCase().trim().replace(/\s+/g, ' ') === normalizedCheckSku
            );
            if (matchingKey) {
              bahadurgarhInventory = inventoryData.bahadurgarh[matchingKey];
            }
          }
          
          if (bahadurgarhInventory) {
            totalBahadurgarhAvailable += parseInt(bahadurgarhInventory.available) || 0;
            totalBahadurgarhSafety += parseInt(bahadurgarhInventory.safetyStock) || 0;
            foundAny = true;
            console.log(`[Inventory] Found Bahadurgarh data for ${checkSku}: Available=${bahadurgarhInventory.available}, Safety=${bahadurgarhInventory.safetyStock}`);
          }
        }
        
        // Set aggregated values
        group.okhlaAvailable = totalOkhlaAvailable;
        group.okhlaSafetyStock = totalOkhlaSafety;
        group.bahadurgarhAvailable = totalBahadurgarhAvailable;
        group.bahadurgarhSafetyStock = totalBahadurgarhSafety;
        
        if (foundAny) {
          if (isPackCombo) {
            console.log(`[Inventory] Pack/Combo SKU ${skuKey} aggregated: Okhla Available=${totalOkhlaAvailable}, Safety=${totalOkhlaSafety}, Bahadurgarh Available=${totalBahadurgarhAvailable}, Safety=${totalBahadurgarhSafety}`);
          } else {
            console.log(`[Inventory] Found data for ${skuKey}: Okhla Available=${totalOkhlaAvailable}, Safety=${totalOkhlaSafety}, Bahadurgarh Available=${totalBahadurgarhAvailable}, Safety=${totalBahadurgarhSafety}`);
          }
        } else {
          // Try to find similar SKU (for debugging)
          const okhlaKeys = Object.keys(inventoryData.okhla);
          const bahadurgarhKeys = Object.keys(inventoryData.bahadurgarh);
          const similarSku = [...okhlaKeys, ...bahadurgarhKeys].find(k => k.includes(skuKey) || skuKey.includes(k));
          if (similarSku) {
            console.warn(`[Inventory] SKU ${skuKey} not found in inventory, but found similar: ${similarSku}`);
          } else {
            console.warn(`[Inventory] SKU ${skuKey} not found in inventory (Okhla: ${okhlaKeys.length} SKUs, Bahadurgarh: ${bahadurgarhKeys.length} SKUs)`);
          }
        }
        
        // Calculate total available inventory
        group.totalAvailable = (group.okhlaAvailable || 0) + (group.bahadurgarhAvailable || 0);
        
        // Check if inventory can satisfy the order
        // Use finalQuantity for PACK items (which accounts for pack qty)
        const requiredQty = group.isPack ? group.finalQuantity : group.totalQuantity;
        group.canSatisfy = group.totalAvailable >= requiredQty;
        
        // Determine which location(s) can satisfy the order
        const okhlaCanSatisfy = (group.okhlaAvailable || 0) >= requiredQty;
        const bahadurgarhCanSatisfy = (group.bahadurgarhAvailable || 0) >= requiredQty;
        
        if (okhlaCanSatisfy && bahadurgarhCanSatisfy) {
          group.satisfyLocation = 'Both';
        } else if (okhlaCanSatisfy) {
          group.satisfyLocation = 'Okhla';
        } else if (bahadurgarhCanSatisfy) {
          group.satisfyLocation = 'Bahadurgarh';
        } else if (group.canSatisfy) {
          group.satisfyLocation = 'Combined';
        } else {
          group.satisfyLocation = null;
        }

        // Final fallback for PACK quantity: hit focused endpoint if still missing
        if (group.isPack && (!group.packQuantity || group.packQuantity <= 0)) {
          try {
            const qty = await getPackSkuQuantity(skuKey);
            if (typeof qty === 'number' && qty > 0) {
              group.packQuantity = qty;
              group.finalQuantity = group.totalQuantity * qty;
            }
          } catch (e) {
            // ignore and keep previous values
          }
        }
      }
      
      // Separate single-order and multi-order SKUs
      const singleOrderSkus = [];
      const multiOrderSkus = [];
      
      Object.values(skuGroups).forEach(group => {
        if (group.orders.length === 1) {
          // Single order - keep ungrouped
          singleOrderSkus.push({
            ...group,
            isGrouped: false
          });
        } else {
          // Multiple orders - keep grouped
          multiOrderSkus.push({
            ...group,
            isGrouped: true
          });
        }
      });
      
      // Sort both arrays by SKU
      singleOrderSkus.sort((a, b) => a.sku.localeCompare(b.sku));
      multiOrderSkus.sort((a, b) => a.sku.localeCompare(b.sku));
      
      // Combine: multi-order groups first, then single orders
      const groupedOrders = [...multiOrderSkus, ...singleOrderSkus];
      
      console.log(`Grouped ${orders.length} orders into ${groupedOrders.length} SKU groups`);
      
      res.json({
        orders: groupedOrders,
        isGrouped: true,
        pagination: {
          page: 1,
          limit: groupedOrders.length,
          total: groupedOrders.length,
          pages: 1
        }
      });
    } else {
      // Add storeName to each order if it has shopifyStoreId
      orders.forEach(order => {
        if (order.shopifyStoreId) {
          order.storeName = getStoreDisplayName(order.shopifyStoreId);
        }
      });
      
      // For other stages, return normal orders
      res.json({
        orders,
        pagination: {
          page: parseInt(page),
          limit: safeLimit,
          total: totalOrders,
          pages: Math.ceil(totalOrders / safeLimit)
        }
      });
    }
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: 'Error fetching orders', error: error.message });
  }
});

// Delete a processed order and cascade cleanup of history and transactions
const deleteProcessedOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const order = await Order.findById(id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  if (order.stage !== 'Processed') {
    res.status(400);
    throw new Error('Only processed orders can be deleted via this endpoint');
  }

  const ProcessedOrderHistory = require('../models/ProcessedOrderHistory');
  const InventoryTransaction = require('../models/InventoryTransaction');

  const historyResult = await ProcessedOrderHistory.deleteMany({ orderId: order._id });
  const txResult = await InventoryTransaction.deleteMany({ sourceOrder: order._id });

  await Order.findByIdAndDelete(order._id);

  res.json({
    ok: true,
    deletedOrderId: order._id,
    historyDeletedCount: historyResult.deletedCount || 0,
    transactionsDeletedCount: txResult.deletedCount || 0
  });
});

// Delete items for a vendor from a processed order and cleanup matching history
const deleteProcessedOrderVendor = asyncHandler(async (req, res) => {
  const { id, vendorId } = req.params;
  const order = await Order.findById(id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  if (order.stage !== 'Processed') {
    res.status(400);
    throw new Error('Only processed orders can be modified via this endpoint');
  }

  const beforeCount = order.items.length;
  order.items = order.items.filter(it => {
    const v = it.vendor?._id?.toString() || it.vendor?.toString() || it.vendor;
    return v !== vendorId;
  });

  let deletedOrder = false;
  if (order.items.length === 0) {
    await Order.findByIdAndDelete(order._id);
    deletedOrder = true;
  } else {
    await order.save();
  }

  const ProcessedOrderHistory = require('../models/ProcessedOrderHistory');
  const InventoryTransaction = require('../models/InventoryTransaction');
  const historyResult = await ProcessedOrderHistory.deleteMany({ orderId: order._id, vendorId });
  const txResult = await InventoryTransaction.deleteMany({ sourceOrder: order._id });

  res.json({
    ok: true,
    modifiedOrderId: order._id,
    itemsBefore: beforeCount,
    itemsAfter: deletedOrder ? 0 : order.items.length,
    orderDeleted: deletedOrder,
    historyDeletedCount: historyResult.deletedCount || 0,
    transactionsDeletedCount: txResult.deletedCount || 0
  });
});

// @desc    Get order by ID with full details
// @route   GET /api/orders/:id
// @access  Public
const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('items.vendor', 'name contactInfo');
  
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  
  // Get history of stage changes for this order
  const stageHistory = await Order.find(
    { 'history.comment': { $regex: req.params.id, $options: 'i' } },
    { 'history': 1, 'stage': 1, 'orderName': 1 }
  );
  
  // Add stage history to the response
  const orderWithHistory = order.toObject();
  orderWithHistory.stageHistory = stageHistory;
  
  // Add storeName to response if order has shopifyStoreId
  if (orderWithHistory.shopifyStoreId) {
    orderWithHistory.storeName = getStoreDisplayName(orderWithHistory.shopifyStoreId);
  }
  
  res.json(orderWithHistory);
});

// @desc    Export orders to CSV
// @route   GET /api/orders/export
// @access  Public
const exportOrders = asyncHandler(async (req, res) => {
  const { 
    stage, 
    search, 
    sortBy, 
    sortOrder,
    paymentStatus,
    fulfillmentStatus,
    vendor,
    vendorFilter,
    startDate,
    endDate
  } = req.query;

  // SPECIAL CASE: For Processed stage, export from ProcessedOrderHistory
  // This ensures we can export processed orders even after they're moved to Pending
  if (stage === 'Processed') {
    console.log('[exportOrders] Exporting from ProcessedOrderHistory for Processed stage');
    
    let historyQuery = {};
    
    // Date range filter - use processedAt for ProcessedOrderHistory
    if (startDate || endDate) {
      historyQuery.processedAt = {};
      
      if (startDate) {
        try {
          const startDateTime = new Date(startDate);
          startDateTime.setUTCHours(0, 0, 0, 0);
          historyQuery.processedAt.$gte = startDateTime;
        } catch (err) {
          console.error("Error parsing start date for export:", err);
        }
      }
      
      if (endDate) {
        try {
          const endDateTime = new Date(endDate);
          endDateTime.setUTCHours(23, 59, 59, 999);
          historyQuery.processedAt.$lte = endDateTime;
        } catch (err) {
          console.error("Error parsing end date for export:", err);
        }
      }
    } else {
      // If no date range specified, limit to last 150 days (retention period)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 150);
      cutoffDate.setUTCHours(0, 0, 0, 0);
      historyQuery.processedAt = { $gte: cutoffDate };
    }
    
    // Vendor filter
    if (vendor || vendorFilter) {
      const mongoose = require('mongoose');
      const vendorId = mongoose.Types.ObjectId.isValid(vendor || vendorFilter) ? new mongoose.Types.ObjectId(vendor || vendorFilter) : null;
      if (vendorId) {
        historyQuery.vendorId = vendorId;
      }
    }
    
    // Search filter
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      historyQuery.$or = [
        { orderName: searchRegex },
        { productName: searchRegex },
        { itemSku: searchRegex }
      ];
    }
    
    // Sorting
    let sortOptions = {};
    if (sortBy === 'processedAt' || sortBy === 'createdAt') {
      sortOptions.processedAt = sortOrder === 'desc' ? -1 : 1;
    } else {
      sortOptions.processedAt = -1; // Default sort by processedAt descending
    }
    
    // Fetch from ProcessedOrderHistory
    const historyRecords = await ProcessedOrderHistory.find(historyQuery)
      .sort(sortOptions)
      .populate('vendorId', 'name contactInfo')
      .lean();
    
    console.log(`[exportOrders] Found ${historyRecords.length} ProcessedOrderHistory records`);
    
    // Flatten the history data for CSV export
    const flattenedOrders = historyRecords.map(record => ({
      orderId: record.orderId,
      orderName: record.orderName,
      shopifyOrderId: record.shopifyOrderId,
      customerName: '', // Not stored in history
      customerEmail: '', // Not stored in history
      stage: 'Processed',
      paymentStatus: '', // Not stored in history
      fulfillmentStatus: '', // Not stored in history
      createdAt: record.processedAt, // Use processedAt as createdAt
      processedAt: record.processedAt,
      itemName: record.productName,
      sku: record.itemSku,
      quantity: record.quantity,
      price: record.price || '',
      vendor: record.vendorName || (record.vendorId?.name || 'Vendor Name Missing'),
      warehouse: record.warehouse || 'Okhla',
      variantName: record.variantName || ''
    }));
    
    // Convert to CSV
    const fields = [
      'orderId',
      'orderName',
      'shopifyOrderId',
      'customerName', 
      'customerEmail',
      'stage',
      'paymentStatus',
      'fulfillmentStatus',
      'createdAt',
      'processedAt',
      'itemName',
      'sku',
      'quantity',
      'price',
      'vendor',
      'warehouse',
      'variantName'
    ];
    
    const parser = new Parser({ fields });
    const csv = parser.parse(flattenedOrders);
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    const dateSuffix = startDate && endDate ? `-${startDate}_to_${endDate}` : '';
    res.setHeader('Content-Disposition', `attachment; filename=processed-orders-export${dateSuffix}-${new Date().toISOString().split('T')[0]}.csv`);
    
    res.send(csv);
    return;
  }

  // For other stages, use the original Order collection query
  let query = {};
  
  // Apply the same filters as getOrders
  if (stage) {
    query.stage = stage;
  }
  
  if (search) {
    const searchRegex = { $regex: search, $options: 'i' };
    query.$or = [
      { orderName: searchRegex },
      { customerName: searchRegex },
      { customerEmail: searchRegex },
      { 'items.productName': searchRegex },
      { 'items.sku': searchRegex }
    ];
  }

  if (paymentStatus) {
    query.paymentStatus = paymentStatus;
  }

  if (fulfillmentStatus) {
    query.fulfillmentStatus = fulfillmentStatus;
  }

  if (vendor || vendorFilter) {
    const mongoose = require('mongoose');
    const raw = vendor || vendorFilter;
    const vendorId = mongoose.Types.ObjectId.isValid(raw) ? new mongoose.Types.ObjectId(raw) : null;
    if (vendorId) {
      query['items.vendor'] = vendorId;
    }
  }

  if (startDate || endDate) {
    // Initialize createdAt query if not already set
    if (!query.createdAt) {
      query.createdAt = {};
    }
    
    if (startDate) {
      try {
        // Convert to date object with time set to start of day (midnight)
        const startDateTime = new Date(startDate);
        startDateTime.setUTCHours(0, 0, 0, 0);
        query.createdAt.$gte = startDateTime;
      } catch (err) {
        console.error("Error parsing start date for export:", err);
      }
    }
    
    if (endDate) {
      try {
        // Convert to date object with time set to end of day
        const endDateTime = new Date(endDate);
        endDateTime.setUTCHours(23, 59, 59, 999);
        query.createdAt.$lte = endDateTime;
      } catch (err) {
        console.error("Error parsing end date for export:", err);
      }
    }
  }

  // Sorting
  let sortOptions = {};
  if (sortBy) {
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
  } else {
    sortOptions = { createdAt: -1 };
  }

  // Fetch orders with vendor population
  const orders = await Order.find(query)
    .sort(sortOptions)
    .populate('items.vendor', 'name contactInfo');

  // Flatten the orders data for CSV export
  const flattenedOrders = [];
  orders.forEach(order => {
    order.items.forEach(item => {
      flattenedOrders.push({
        orderId: order._id,
        orderName: order.orderName,
        shopifyOrderName: order.shopifyOrderName,
        shopifyOrderId: order.shopifyOrderId,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        stage: order.stage,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        createdAt: order.createdAt,
        itemName: item.productName,
        sku: item.sku,
        quantity: item.quantity,
        vendor: (item.vendorName && String(item.vendorName).trim()) || (item.vendor ? (item.vendor.name || 'Vendor Name Missing') : 'No Vendor Assigned')
      });
    });
  });

  // Convert to CSV
  const fields = [
    'orderId',
    'orderName',
    'shopifyOrderName',
    'shopifyOrderId',
    'customerName', 
    'customerEmail',
    'stage',
    'paymentStatus',
    'fulfillmentStatus',
    'createdAt',
    'itemName',
    'sku',
    'quantity',
    'vendor'
  ];
  
  const parser = new Parser({ fields });
  const csv = parser.parse(flattenedOrders);

  // Set headers for CSV download
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=orders-export-${new Date().toISOString().split('T')[0]}.csv`);
  
  res.send(csv);
});

// @desc    Export consolidated PO data for a date range and persist record
// @route   POST /api/orders/export-consolidated
// @access  Public
const exportConsolidatedPO = asyncHandler(async (req, res) => {
  const { startDate, endDate, stage = 'Processed' } = req.body || {};

  if (!startDate || !endDate) {
    res.status(400);
    throw new Error('startDate and endDate are required (YYYY-MM-DD)');
  }

  const start = new Date(startDate);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setUTCHours(23, 59, 59, 999);

  // SPECIAL CASE: For Processed stage, export from ProcessedOrderHistory
  // This ensures we can export processed orders even after they're moved to Pending
  if (stage === 'Processed') {
    console.log('[exportConsolidatedPO] Exporting from ProcessedOrderHistory for Processed stage');
    
    const historyQuery = {
      processedAt: { $gte: start, $lte: end }
    };
    
    const historyRecords = await ProcessedOrderHistory.find(historyQuery)
      .sort({ processedAt: -1 })
      .populate('vendorId', 'name')
      .lean();
    
    console.log(`[exportConsolidatedPO] Found ${historyRecords.length} ProcessedOrderHistory records`);
    
    // Group by vendor and SKU for consolidated view
    const vendorSkuMap = {};
    historyRecords.forEach(record => {
      const vendorName = record.vendorName || (record.vendorId?.name || 'Unknown Vendor');
      const sku = record.itemSku;
      const key = `${vendorName}|${sku}`;
      
      if (!vendorSkuMap[key]) {
        vendorSkuMap[key] = {
          vendorName,
          sku,
          productName: record.productName,
          totalQuantity: 0,
          orders: []
        };
      }
      
      vendorSkuMap[key].totalQuantity += record.quantity || 0;
      vendorSkuMap[key].orders.push({
        orderName: record.orderName,
        quantity: record.quantity,
        processedAt: record.processedAt,
        warehouse: record.warehouse || 'Okhla'
      });
    });
    
    // Flatten rows with PO-like details
    const rows = Object.values(vendorSkuMap).map(item => ({
      vendorName: item.vendorName,
      sku: item.sku,
      productName: item.productName,
      totalQuantity: item.totalQuantity,
      orderCount: item.orders.length,
      orders: item.orders.map(o => o.orderName).join(', '),
      warehouses: [...new Set(item.orders.map(o => o.warehouse))].join(', ')
    }));
    
    // Convert to Excel using XLSX
    const XLSX = require('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Processed Orders');
    
    // Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Save export record
    const exportRecord = await ExportRecord.create({
      type: 'consolidated-po',
      stage: 'Processed',
      startDate: start,
      endDate: end,
      recordCount: rows.length,
      filename: `processed-orders-consolidated-${startDate}_to_${endDate}.xlsx`
    });
    
    // Set headers for Excel download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=processed-orders-consolidated-${startDate}_to_${endDate}.xlsx`);
    res.setHeader('X-Export-Id', exportRecord._id.toString());
    
    res.send(excelBuffer);
    return;
  }

  // For other stages, use the original Order collection query
  const query = {
    stage,
    createdAt: { $gte: start, $lte: end }
  };

  const orders = await Order.find(query).populate('items.vendor', 'name');

  // Flatten rows with PO-like details
  const rows = [];
  for (const order of orders) {
    for (const item of order.items) {
      rows.push({
        Vendor: item.vendor ? item.vendor.name : '',
        OrderName: order.orderName || order.shopifyOrderName,
        ShopifyOrderId: order.shopifyOrderId || '',
        Customer: order.customerName || '',
        Item: item.productName || '',
        Variant: item.variantName || '',
        SKU: item.sku || '',
        Quantity: item.quantity || 1,
        Price: typeof item.price === 'number' ? item.price : (item.costPrice || ''),
        GST: item.gst || '',
        Warehouse: item.warehouse || '',
        CreatedAt: order.createdAt ? new Date(order.createdAt).toISOString() : ''
      });
    }
  }

  const fields = Object.keys(rows[0] || {
    Vendor: '', OrderName: '', ShopifyOrderId: '', Customer: '', Item: '', Variant: '', SKU: '', Quantity: '', Price: '', GST: '', Warehouse: '', CreatedAt: ''
  });
  const parser = new Parser({ fields });
  const csv = parser.parse(rows);

  const filename = `po-consolidated-${startDate}_to_${endDate}.xlsx`; // Excel-friendly CSV

  // Persist record (content as CSV string)
  const record = await ExportRecord.create({
    type: 'PO-Consolidated',
    format: 'csv',
    stage,
    filters: { startDate, endDate },
    filename,
    content: csv
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.send(csv);
});

// @desc    List export records
// @route   GET /api/orders/exports
// @access  Public
const listExports = asyncHandler(async (req, res) => {
  const records = await ExportRecord.find({}).sort({ createdAt: -1 }).select('type format filename createdAt filters stage');
  res.json({ success: true, records });
});

// @desc    Download an export by id
// @route   GET /api/orders/exports/:id/download
// @access  Public
const downloadExport = asyncHandler(async (req, res) => {
  const rec = await ExportRecord.findById(req.params.id);
  if (!rec) {
    res.status(404);
    throw new Error('Export not found');
  }
  res.setHeader('Content-Type', rec.format === 'csv' ? 'text/csv' : 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename=${rec.filename || 'export.csv'}`);
  res.send(rec.content || '');
});

// @desc    Update order stage
// @route   PUT /api/orders/:id/stage
// @access  Public
const updateOrderStage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { stage, comment } = req.body;

  console.log(`[updateOrderStage] Updating order ${id} to stage ${stage}`);

  const order = await Order.findById(id).populate('items.vendor');

  if (!order) {
    console.error(`[updateOrderStage] Order ${id} not found`);
    res.status(404);
    throw new Error('Order not found');
  }
  
  console.log(`[updateOrderStage] Found order ${order.orderName}, current stage: ${order.stage}`);


  const oldStage = order.stage;
  order.stage = stage;

  if (stage === 'Processed' && oldStage !== 'Processed') {
    order.processedAt = new Date();
  }

  // Add stage change to history
  if (!order.history) {
    order.history = [];
  }
  
  order.history.push({
    stage: stage,
    timestamp: new Date(),
    comment: comment || `Changed from ${oldStage} to ${stage}`
  });

  await order.save();

  // Auto-create inventory transactions based on stage change
  try {
    const InventoryTransaction = require('../models/InventoryTransaction');
    
    // When order moves to In-Stock, create Sales transaction
    if (stage === 'In-Stock' && oldStage !== 'In-Stock') {
      console.log(`Creating Sales transaction for order ${order.orderName}. Items count: ${order.items.length}`);
      
      // Group items by warehouse/location
      const itemsByLocation = {};
      order.items.forEach(item => {
        const loc = item.warehouse || 'Okhla';
        if (loc === 'Direct') {
          console.log(`Skipping item ${item.sku} - Direct warehouse`);
          return;
        }
        if (!itemsByLocation[loc]) itemsByLocation[loc] = [];
        itemsByLocation[loc].push(item);
      });
      
      console.log(`Items grouped by location:`, Object.keys(itemsByLocation));
      
      // Create separate Sales transaction per location
      for (const [location, locationItems] of Object.entries(itemsByLocation)) {
        console.log(`Creating Sales transaction for ${location} with ${locationItems.length} items`);
        
        const orderId = order._id.toString();
        const skus = locationItems.map(li => li.sku);
        const quantities = locationItems.map(li => li.quantity);
        
        // Check if Sales transaction already exists for this order to prevent duplicates
        // Use stronger check: must match orderId + SKU combination within same transaction
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const existingTransactions = await InventoryTransaction.find({
          transactionType: 'Sales',
          location,
          transactionDate: { $gte: today, $lt: tomorrow },
          'items.orderId': orderId
        });
        
        // Check if any existing transaction has the exact same items (orderId + SKU combo)
        let isDuplicate = false;
        for (const existingTrans of existingTransactions) {
          const existingItems = existingTrans.items.filter(item => 
            item.orderId && item.orderId.toString() === orderId
          );
          
          const existingSkusSet = new Set(existingItems.map(item => `${item.sku}`));
          const newSkusSet = new Set(skus);
          
          // If all SKUs from this order already exist in an existing transaction, it's a duplicate
          const hasAllSkus = skus.every(sku => existingSkusSet.has(sku));
          if (hasAllSkus && existingSkusSet.size === newSkusSet.size) {
            isDuplicate = true;
          console.log(`⚠️ Sales transaction already exists for order ${order.orderName} (orderId: ${orderId}, SKUs: ${skus.join(', ')}), skipping duplicate creation`);
            break;
          }
        }
        
        if (isDuplicate) {
          continue;
        }
        
        const items = locationItems.map(item => ({
          sku: item.sku,
          productName: item.productName,
          quantity: item.quantity,
          orderId: order._id,
          orderName: order.orderName,
          shopifyOrderId: order.shopifyOrderId,
          vendor: item.vendor?._id,
          vendorName: item.vendor?.name
        }));

        const salesTransaction = new InventoryTransaction({
          transactionType: 'Sales',
          transactionDate: new Date(),
          location,
          items,
          createdBy: 'auto-stage-tracker',
          autoCreated: true,
          sourceOrder: order._id,
          notes: `Auto-created from order ${order.orderName} moving to In-Stock (${location})`
        });

        await salesTransaction.save();
        console.log(`✅ Created Sales transaction ${salesTransaction._id} for order ${order.orderName} at ${location}`);
      }
    }

    // When order moves to Processed, create Purchase transaction
    if (stage === 'Processed' && oldStage !== 'Processed') {
      console.log(`Creating Purchase transaction for order ${order.orderName}. Items count: ${order.items.length}`);
      
      // Group items by warehouse/location (only items with vendors)
      const itemsByLocation = {};
      const itemsWithVendors = order.items.filter(item => item.vendor);
      console.log(`Items with vendors: ${itemsWithVendors.length}`);
      
      itemsWithVendors.forEach(item => {
        const loc = item.warehouse || 'Okhla';
        if (loc === 'Direct') {
          console.log(`Skipping item ${item.sku} - Direct warehouse`);
          return;
        }
        if (!itemsByLocation[loc]) itemsByLocation[loc] = [];
        itemsByLocation[loc].push(item);
      });

      console.log(`Items grouped by location:`, Object.keys(itemsByLocation));

      // Create separate Purchase transaction per location
      for (const [location, locationItems] of Object.entries(itemsByLocation)) {
        console.log(`Creating Purchase transaction for ${location} with ${locationItems.length} items`);
        
        const items = locationItems.map(item => ({
          sku: item.sku,
          productName: item.productName,
          quantity: item.quantity,
          orderId: order._id,
          orderName: order.orderName,
          shopifyOrderId: order.shopifyOrderId,
          vendor: item.vendor._id,
          vendorName: item.vendor.name
        }));

        const purchaseTransaction = new InventoryTransaction({
          transactionType: 'Purchase',
          transactionDate: new Date(),
          location,
          items,
          createdBy: 'auto-stage-tracker',
          autoCreated: true,
          sourceOrder: order._id,
          notes: `Auto-created from order ${order.orderName} moving to Processed (${location})`
        });

        await purchaseTransaction.save();
        console.log(`✅ Created Purchase transaction ${purchaseTransaction._id} for order ${order.orderName} at ${location}`);
      }
    }
  } catch (error) {
    console.error('❌ Error creating inventory transaction:', error);
    console.error('Error stack:', error.stack);
    // Don't fail the stage update if inventory tracking fails
  }

  res.json(order);
});

// @desc    Update item warehouse
// @route   PUT /api/orders/:orderId/items/:itemId/warehouse
// @access  Public
const updateItemWarehouse = asyncHandler(async (req, res) => {
  const { orderId, itemId } = req.params;
  const { warehouse } = req.body;

  const allowed = ['Okhla', 'Bahadurgarh', 'Direct'];
  if (!allowed.includes(warehouse)) {
    res.status(400);
    throw new Error('Invalid warehouse');
  }

  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  const item = order.items.id(itemId);
  if (!item) {
    res.status(404);
    throw new Error('Item not found');
  }

  item.warehouse = warehouse;
  await order.save();
  
  // If this is a Processed stage order, update ProcessedOrderHistory as well
  if (order.stage === 'Processed' && item.processedAt) {
    try {
      const ProcessedOrderHistory = require('../models/ProcessedOrderHistory');
      
      // Find matching history record
      const historyQuery = {
        orderId: order._id,
        itemSku: item.sku,
        processedAt: item.processedAt
      };
      
      // Update the history record
      const historyResult = await ProcessedOrderHistory.updateOne(historyQuery, {
        $set: {
          warehouse: warehouse,
          updatedAt: new Date()
        }
      });
      
      console.log(`[updateItemWarehouse] Updated ProcessedOrderHistory: matched ${historyResult.matchedCount}, modified ${historyResult.modifiedCount}`);
    } catch (err) {
      console.error('[updateItemWarehouse] Failed to update ProcessedOrderHistory:', err.message);
      // Don't fail the request if history update fails
    }
  }
  
  res.json(order);
});

// @desc    Bulk update warehouse for items by vendor within a stage view
// @route   PUT /api/orders/warehouse-bulk
// @access  Public
const bulkUpdateWarehouse = asyncHandler(async (req, res) => {
  const { items, warehouse } = req.body; // items: [{ orderId, itemId }]
  const allowed = ['Okhla', 'Bahadurgarh', 'Direct'];
  if (!allowed.includes(warehouse)) {
    res.status(400);
    throw new Error('Invalid warehouse');
  }
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400);
    throw new Error('No items provided');
  }

  const orderIds = [...new Set(items.map(i => i.orderId))];
  const orders = await Order.find({ _id: { $in: orderIds } });
  const updated = [];
  for (const order of orders) {
    let changed = false;
    for (const ref of items.filter(i => i.orderId === order._id.toString())) {
      const itemDoc = order.items.id(ref.itemId);
      if (itemDoc) {
        itemDoc.warehouse = warehouse;
        changed = true;
        updated.push({ orderId: order._id, itemId: itemDoc._id });
      }
    }
    if (changed) await order.save();
  }
  res.json({ updatedCount: updated.length, updated });
});

// @desc    Process selected items: move assigned vendor items to Processed stage per vendor
//          Unassigned vendor items are not processed and remain in Initial
// @route   POST /api/orders/process-items
// @access  Public
const processOrderItems = asyncHandler(async (req, res) => {
  const { items } = req.body; // [{ orderId, itemId }]

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400);
    throw new Error('No items provided');
  }

  // Fetch all relevant orders
  const orderIds = [...new Set(items.map(i => i.orderId))];
  // No populate here for speed; we only need raw item fields
  const orders = await Order.find({ _id: { $in: orderIds } });

  // Index orders by id for quick access
  const orderIdToOrder = new Map(orders.map(o => [o._id.toString(), o]));

  const vendorToItems = new Map();
  const skippedItems = [];
  const errors = [];

  // Fix: Process ALL orders with vendors, regardless of stage or edit status
  // Do not skip edited orders or in-stock orders - they should all be processed
  for (const ref of items) {
    const order = orderIdToOrder.get(ref.orderId);
    if (!order) {
      errors.push({ ...ref, reason: 'Order not found' });
      continue;
    }
    const itemDoc = order.items.id(ref.itemId);
    if (!itemDoc) {
      errors.push({ ...ref, reason: 'Item not found' });
      continue;
    }
    
    // If vendor is not assigned, attach to Unassigned vendor to avoid skipping
    if (!itemDoc.vendor) {
      const unassigned = await getOrCreateUnassignedVendor();
      itemDoc.vendor = unassigned._id;
    }
    
    // Log order details for debugging (including stage to verify no stage-based skipping)
    console.log(`[processOrderItems] Processing item from order ${order.orderName || order._id} (stage: ${order.stage}), item SKU: ${itemDoc.sku}, quantity: ${itemDoc.quantity}`);
    
    const vendorId = itemDoc.vendor._id ? itemDoc.vendor._id.toString() : itemDoc.vendor.toString();
    if (!vendorToItems.has(vendorId)) vendorToItems.set(vendorId, []);
    vendorToItems.get(vendorId).push({ order, itemDoc });
  }

  const vendorResults = [];

  // Process each vendor group: either append to existing Processed order containing this vendor
  // or create a new Processed order for this vendor
  for (const [vendorId, entries] of vendorToItems.entries()) {
    // Try to find an existing processed order that already has this vendor in items
    let targetProcessedOrder = await Order.findOne({ stage: 'Processed', 'items.vendor': vendorId })
      .populate('items.vendor')
      .sort({ createdAt: -1 });

    // If not found, create a new processed order scoped to this vendor
    if (!targetProcessedOrder) {
      // Fetch vendor to get its name for labeling
      const vendorDoc = await Vendor.findById(vendorId);
      const processedOrderName = `Processed - ${vendorDoc ? vendorDoc.name : vendorId} - ${new Date().toISOString().split('T')[0]}`;
      targetProcessedOrder = new Order({
        orderName: processedOrderName,
        stage: 'Processed',
        paymentStatus: 'Pending',
        fulfillmentStatus: 'Unfulfilled',
        items: []
      });
    }

    // Get vendor document for name
    const vendorDoc = await Vendor.findById(vendorId);
    const vendorName = vendorDoc ? vendorDoc.name : 'Unknown Vendor';
    
    // Move items: push into processed order and remove from original orders
    let addedCount = 0;
    const historyRecords = [];
    
    for (const { order, itemDoc } of entries) {
      // Fetch product price from Shopify
      let productPrice = null;
      try {
        productPrice = await fetchProductPriceBySku(itemDoc.sku);
      } catch (error) {
        console.error(`Error fetching price for ${itemDoc.sku}:`, error);
        // Continue without price if fetch fails
      }
      
      // Fix: Use the saved quantity from database (which includes any edits)
      // This ensures edited quantities (e.g., 3 -> 200) are preserved correctly
      let finalQuantity = itemDoc.quantity || 1;
      let packQuantity = 1;
      const sku = (itemDoc.sku || '').toUpperCase().trim();
      
      console.log(`[processOrderItems] Processing item ${itemDoc.sku}: using saved quantity from DB = ${finalQuantity}`);
      
      // If SKU starts with P (Pack), get pack quantity
      if (sku.startsWith('P')) {
        try {
          packQuantity = await getPackSkuQuantity(sku);
          if (packQuantity && packQuantity > 1) {
            finalQuantity = (itemDoc.quantity || 1) * packQuantity;
            console.log(`[processOrderItems] Pack SKU ${sku}: ${itemDoc.quantity} packs × ${packQuantity} units = ${finalQuantity} total units`);
          }
        } catch (error) {
          console.error(`[processOrderItems] Error fetching pack quantity for ${sku}:`, error);
          // Continue with original quantity if pack fetch fails
        }
      }
      
      // Clone plain item object to avoid mongoose subdoc reference issues
      const newItem = {
        sku: itemDoc.sku,
        productName: itemDoc.productName,
        variantName: itemDoc.variantName,
        quantity: finalQuantity, // Use calculated final quantity
        warehouse: itemDoc.warehouse,
        vendor: itemDoc.vendor?._id || itemDoc.vendor,
        costPrice: itemDoc.costPrice,
        gst: itemDoc.gst,
        expectedDate: itemDoc.expectedDate || null,
        comments: Array.isArray(itemDoc.comments) ? itemDoc.comments.map(c => ({ text: c.text, createdAt: c.createdAt })) : []
      };

      // Capture timestamp for synchronization
      const processedTimestamp = new Date();
      
      // Set processed metadata on the new item
      newItem.processed = true;
      newItem.processedAt = processedTimestamp;

      targetProcessedOrder.items.push(newItem);
      // Remove from original order
      order.items.pull(itemDoc._id);
      // Add history to original order
      if (!order.history) order.history = [];
      order.history.push({
        stage: order.stage,
        timestamp: new Date(),
        comment: `Item ${itemDoc.sku || itemDoc.productName} moved to Processed for vendor ${vendorName} (${finalQuantity} units)`
      });
      
      // Create history record for processed order history
      historyRecords.push({
        orderId: targetProcessedOrder._id,
        orderName: targetProcessedOrder.orderName || targetProcessedOrder.shopifyOrderName || 'Unknown Order',
        shopifyOrderId: targetProcessedOrder.shopifyOrderId,
        itemSku: itemDoc.sku,
        productName: itemDoc.productName,
        variantName: itemDoc.variantName || '',
        quantity: finalQuantity, // Use calculated final quantity in history
        price: productPrice, // Price from Shopify
        vendorId: vendorId,
        vendorName: vendorName,
        warehouse: itemDoc.warehouse || 'Okhla',
        processedAt: processedTimestamp,
        processedBy: 'system'
      });
      
      addedCount++;
    }
    
    // Save all history records
    if (historyRecords.length > 0) {
      try {
        await ProcessedOrderHistory.insertMany(historyRecords);
        console.log(`Saved ${historyRecords.length} history records for processed items`);
      } catch (error) {
        console.error('Error saving processed order history:', error);
        // Don't fail the processing if history save fails
      }
    }

    // Save/Update processed order and mark processedAt
    targetProcessedOrder.processedAt = new Date();
    await targetProcessedOrder.save();

    // Auto-create Purchase transaction when items are moved to Processed
    try {
      const InventoryTransaction = require('../models/InventoryTransaction');
      
      console.log(`Auto-creating Purchase transaction for processed order ${targetProcessedOrder.orderName}`);
      
      // Group items by warehouse/location
      const itemsByLocation = {};
      targetProcessedOrder.items.forEach(item => {
        const loc = item.warehouse || 'Okhla';
        if (loc === 'Direct') return;
        if (!itemsByLocation[loc]) itemsByLocation[loc] = [];
        itemsByLocation[loc].push(item);
      });
      
      // Create separate Purchase transaction per location
      for (const [location, locationItems] of Object.entries(itemsByLocation)) {
        const items = locationItems.map(item => ({
          sku: item.sku,
          productName: item.productName,
          quantity: item.quantity,
          orderId: targetProcessedOrder._id,
          orderName: targetProcessedOrder.orderName,
          vendor: item.vendor?._id,
          vendorName: vendorName
        }));

        const purchaseTransaction = new InventoryTransaction({
          transactionType: 'Purchase',
          transactionDate: new Date(),
          location,
          items,
          createdBy: 'auto-process-items',
          autoCreated: true,
          sourceOrder: targetProcessedOrder._id,
          notes: `Auto-created from processing items for vendor ${vendorName} (${location})`
        });

        await purchaseTransaction.save();
        console.log(`✅ Created Purchase transaction ${purchaseTransaction._id} for order ${targetProcessedOrder.orderName} at ${location}`);
      }
    } catch (error) {
      console.error('❌ Error creating auto Purchase transaction:', error);
      // Don't fail the processing if inventory tracking fails
    }

    vendorResults.push({ vendorId, processedOrderId: targetProcessedOrder._id, added: addedCount });
  }

  // Save updated source orders and remove empty ones
  const savePromises = [];
  const removedOrders = [];
  for (const order of orders) {
    if (order.isModified && order.isModified()) {
      // In some Mongoose versions, isModified is a function
    }
    if (order.items.length === 0) {
      await Order.findByIdAndDelete(order._id);
      removedOrders.push(order._id);
    } else {
      savePromises.push(order.save());
    }
  }
  if (savePromises.length > 0) await Promise.all(savePromises);

  res.json({
    processedVendors: vendorResults,
    processedCount: vendorResults.reduce((a, v) => a + v.added, 0),
    skippedCount: skippedItems.length,
    skippedItems,
    errors,
    removedOrders
  });
});

// @desc    Move selected items to a specific stage
// @route   POST /api/orders/move-items-to-stage
// @access  Public
const moveItemsToStage = asyncHandler(async (req, res) => {
  const { items, targetStage } = req.body; // items: [{ orderId, itemId }], targetStage: 'In-Stock' or 'Hold'

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400);
    throw new Error('No items provided');
  }

  if (!targetStage) {
    res.status(400);
    throw new Error('Target stage not specified');
  }

  // Fetch all relevant orders
  const orderIds = [...new Set(items.map(i => i.orderId))];
  const orders = await Order.find({ _id: { $in: orderIds } });

  // Index orders by id for quick access
  const orderIdToOrder = new Map(orders.map(o => [o._id.toString(), o]));

  let targetOrder = null;
  const movedItems = [];
  const errors = [];

  // Find or create target stage order
  targetOrder = await Order.findOne({ stage: targetStage }).sort({ createdAt: -1 });
  
  if (!targetOrder) {
    // Create new order for this stage
    targetOrder = new Order({
      orderName: `${targetStage} - ${new Date().toISOString().split('T')[0]}`,
      stage: targetStage,
      paymentStatus: 'Pending',
      fulfillmentStatus: targetStage === 'Fulfilled' ? 'Fulfilled' : 'Unfulfilled',
      items: []
    });
  }

  // Collect item details BEFORE moving them (needed for duplicate transaction check)
  const itemsToMove = [];
  for (const ref of items) {
    const order = orderIdToOrder.get(ref.orderId);
    if (!order) {
      errors.push({ ...ref, reason: 'Order not found' });
      continue;
    }
    
    const itemDoc = order.items.id(ref.itemId);
    if (!itemDoc) {
      errors.push({ ...ref, reason: 'Item not found' });
      continue;
    }
    
    itemsToMove.push({
      ref,
      order,
      itemDoc,
      sku: itemDoc.sku,
      quantity: itemDoc.quantity,
      warehouse: itemDoc.warehouse || 'Okhla',
      orderId: order._id,
      orderName: order.orderName || order.shopifyOrderName
    });
  }
  
  // Move items
  const historyRecords = [];
  for (const { ref, order, itemDoc } of itemsToMove) {
    // Check if SKU is a pack SKU and get pack quantity (only when moving TO Processed)
    let finalQuantity = itemDoc.quantity || 1;
    const sku = (itemDoc.sku || '').toUpperCase().trim();
    
    if (targetStage === 'Processed' && sku.startsWith('P')) {
      try {
        const packQuantity = await getPackSkuQuantity(sku);
        if (packQuantity && packQuantity > 1) {
          finalQuantity = (itemDoc.quantity || 1) * packQuantity;
          console.log(`[moveItemsToStage] Pack SKU ${sku}: ${itemDoc.quantity} packs × ${packQuantity} units = ${finalQuantity} total units`);
        }
      } catch (error) {
        console.error(`[moveItemsToStage] Error fetching pack quantity for ${sku}:`, error);
        // Continue with original quantity if pack fetch fails
      }
    }
    
    // Clone item to target order
    const newItem = {
      sku: itemDoc.sku,
      productName: itemDoc.productName,
      variantName: itemDoc.variantName,
      quantity: finalQuantity, // Use calculated final quantity
      warehouse: itemDoc.warehouse,
      vendor: (() => {
        const v = itemDoc.vendor?._id || itemDoc.vendor;
        if (targetStage === 'Processed' && !v) return null; // placeholder
        return v;
      })(),
      costPrice: itemDoc.costPrice,
      gst: itemDoc.gst,
      expectedDate: itemDoc.expectedDate || null,
      comments: Array.isArray(itemDoc.comments) ? itemDoc.comments.map(c => ({ text: c.text, createdAt: c.createdAt })) : [],
      singleProductSku: itemDoc.singleProductSku,
      itemType: itemDoc.itemType,
      price: itemDoc.price
    };

    // Ensure vendor set for Processed stage
    if (targetStage === 'Processed' && !newItem.vendor) {
      const unassigned = await getOrCreateUnassignedVendor();
      newItem.vendor = unassigned._id;
    }

    // Capture timestamp for synchronization
    const processedTimestamp = new Date();

    // Set processedAt timestamp when moving to Processed stage
    if (targetStage === 'Processed') {
      newItem.processed = true;
      newItem.processedAt = processedTimestamp;
    }

    targetOrder.items.push(newItem);
    
    // Remove from original order
    order.items.pull(itemDoc._id);
    
    // Add history
    if (!order.history) order.history = [];
    order.history.push({
      stage: order.stage,
      timestamp: new Date(),
      comment: `Item ${itemDoc.sku || itemDoc.productName} moved to ${targetStage}${targetStage === 'Processed' && finalQuantity !== itemDoc.quantity ? ` (${finalQuantity} units)` : ''}`
    });
    
    movedItems.push(ref);
    if (targetStage === 'Processed') {
      const vId = newItem.vendor?._id ? newItem.vendor._id.toString() : (newItem.vendor ? newItem.vendor.toString() : undefined);
      let vName = 'Unknown Vendor';
      try {
        if (vId) {
          const vDoc = await Vendor.findById(vId);
          if (vDoc && vDoc.name) vName = vDoc.name;
        }
      } catch {}
      historyRecords.push({
        orderId: targetOrder._id,
        orderName: targetOrder.orderName || targetOrder.shopifyOrderName || 'Unknown Order',
        shopifyOrderId: targetOrder.shopifyOrderId,
        itemSku: itemDoc.sku,
        productName: itemDoc.productName,
        variantName: itemDoc.variantName || '',
        quantity: finalQuantity,
        price: undefined,
        vendorId: vId,
        vendorName: vName,
        warehouse: itemDoc.warehouse || 'Okhla',
        processedAt: processedTimestamp,
        processedBy: 'system'
      });
    }
  }

  // Save target order; set processedAt when moving to Processed
  if (targetStage === 'Processed') {
    targetOrder.processedAt = new Date();
    
    // Add history entry to target order showing items were moved into it
    if (!targetOrder.history) targetOrder.history = [];
    targetOrder.history.push({
      stage: targetStage,
      timestamp: new Date(),
      comment: `${movedItems.length} item(s) moved to ${targetStage}`
    });
  }
  
  await targetOrder.save();

  // Persist processed history records
  if (targetStage === 'Processed' && historyRecords.length > 0) {
    try {
      await ProcessedOrderHistory.insertMany(historyRecords);
    } catch (err) {
      console.error('[moveItemsToStage] Failed to insert processed history:', err.message);
    }
  }

  // Auto-create inventory transactions when items are moved to specific stages
  if (targetStage === 'In-Stock') {
    try {
      const InventoryTransaction = require('../models/InventoryTransaction');
      
      console.log(`Auto-creating Sales transaction for In-Stock order ${targetOrder.orderName}`);
      
      // Use itemsToMove data collected before moving items
      if (itemsToMove.length === 0) {
        console.log(`No items to create transactions for`);
        // Skip transaction creation if no items to move
      } else {
        // Group items by warehouse/location (using pre-move data)
        const itemsByLocation = {};
        itemsToMove.forEach(({ sku, quantity, warehouse, orderId, orderName }) => {
          const loc = warehouse === 'Direct' ? null : (warehouse || 'Okhla');
          if (!loc) return;
          if (!itemsByLocation[loc]) itemsByLocation[loc] = [];
          itemsByLocation[loc].push({ sku, quantity, orderId, orderName });
        });
        
        // Create separate Sales transaction per location for newly moved items only
        for (const [location, locationItems] of Object.entries(itemsByLocation)) {
          // Get order IDs from the source orders for these items
          const sourceOrderIds = [...new Set(locationItems.map(li => li.orderId.toString()))];
          const skus = locationItems.map(li => li.sku);
          
          // Check if Sales transaction already exists for these items to prevent duplicates
          // Use stronger check: must match orderId + SKU combination within same transaction
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          
          const existingTransactions = await InventoryTransaction.find({
            transactionType: 'Sales',
            location,
            transactionDate: { $gte: today, $lt: tomorrow },
            'items.orderId': { $in: sourceOrderIds.map(id => require('mongoose').Types.ObjectId(id)) }
          });
          
          // Check if any existing transaction has the exact same items (orderId + SKU combo)
          let isDuplicate = false;
          for (const existingTrans of existingTransactions) {
            // Build a set of orderId+SKU combinations from existing transaction
            const existingCombos = new Set();
            existingTrans.items.forEach(item => {
              if (item.orderId) {
                existingCombos.add(`${item.orderId}_${item.sku}`);
              }
            });
            
            // Build a set of orderId+SKU combinations from new items
            const newCombos = new Set();
            locationItems.forEach(item => {
              newCombos.add(`${item.orderId}_${item.sku}`);
            });
            
            // If all new combos already exist, it's a duplicate
            const allExist = Array.from(newCombos).every(combo => existingCombos.has(combo));
            if (allExist) {
              isDuplicate = true;
              console.log(`⚠️ Sales transaction already exists for these items (orders: ${sourceOrderIds.join(', ')}, SKUs: ${skus.join(', ')}), skipping duplicate creation`);
              break;
            }
          }
          
          if (isDuplicate) {
            continue;
          }
          
          // Build transaction items from itemsToMove data
          const transactionItems = locationItems.map(({ sku, quantity, orderId, orderName }) => {
            // Find the full item details from itemsToMove
            const itemToMove = itemsToMove.find(itm => 
              itm.sku === sku && 
              itm.quantity === quantity && 
              itm.orderId.toString() === orderId.toString()
            );
            
            const sourceOrder = itemToMove ? itemToMove.order : null;
            const itemDoc = itemToMove ? itemToMove.itemDoc : null;
            
            return {
              sku,
              productName: itemDoc?.productName || 'N/A',
              quantity,
              orderId: orderId,
              orderName: orderName || 'N/A',
              shopifyOrderId: sourceOrder?.shopifyOrderId || null,
              vendor: itemDoc?.vendor?._id || itemDoc?.vendor || null,
              vendorName: itemDoc?.vendor?.name || null
            };
          });

          const salesTransaction = new InventoryTransaction({
            transactionType: 'Sales',
            transactionDate: new Date(),
            location,
            items: transactionItems,
            createdBy: 'auto-move-to-stage',
            autoCreated: true,
            sourceOrder: sourceOrderIds[0] || targetOrder._id,
            notes: `Auto-created from moving items to In-Stock (${location})`
          });

          await salesTransaction.save();
          console.log(`✅ Created Sales transaction ${salesTransaction._id} for order ${targetOrder.orderName} at ${location}`);
        }
      }
    } catch (error) {
      console.error('❌ Error creating auto Sales transaction:', error);
      // Don't fail the move operation if inventory tracking fails
    }
  }

  // Save updated source orders and remove empty ones (concurrently)
  // IMPORTANT: If all items are removed from an Initial stage order, delete it
  // to prevent it from appearing in Initial stage queries again
  const removedOrders = [];
  const ops = [];
  for (const order of orders) {
    if (order.items.length === 0) {
      // If order has no items left and was in Initial stage, delete it
      // This ensures it never appears in Initial stage queries again
      ops.push((async () => {
        await Order.findByIdAndDelete(order._id);
        removedOrders.push(order._id.toString());
      })());
    } else {
      // Order still has items, save it
      // The stage filter in getOrders will ensure only orders with stage='Initial' show up
      ops.push(order.save());
    }
  }
  if (ops.length) await Promise.all(ops);

  res.json({
    movedCount: movedItems.length,
    targetOrderId: targetOrder._id,
    targetStage,
    errors,
    removedOrders
  });
});

// @desc    Update item vendor
// @route   PUT /api/orders/:orderId/items/:itemId/vendor
// @access  Public
const updateItemVendor = asyncHandler(async (req, res) => {
  const { orderId, itemId } = req.params;
  const { vendorId, vendorSearch, vendorName } = req.body;

  console.log(`Updating vendor for order ${orderId}, item ${itemId}`);

  // Find order with lean for better performance
  const order = await Order.findById(orderId).populate('items.vendor');
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Find the specific item
  const item = order.items.id(itemId);
  if (!item) {
    res.status(404);
    throw new Error('Item not found');
  }

  // Log the current state
  console.log(`Current vendor: ${item.vendor ? item.vendor._id : 'none'}`);
  
  // If vendorId is empty or null, remove vendor assignment
  if (!vendorId && !vendorSearch && !vendorName) {
    console.log('Removing vendor assignment');
    item.vendor = null;
  } else {
    let vendor;
    if (vendorName) {
      vendor = await findOrCreateVendorByName({
        rawName: vendorName,
        sku: item.sku,
        createdFrom: 'manual-update',
        forceCreate: true,
        respectSettings: false
      });
    } else if (vendorSearch) {
      vendor = await findOrCreateVendorByName({
        rawName: vendorSearch,
        sku: item.sku,
        createdFrom: 'search',
        forceCreate: false,
        respectSettings: true
      });
    } else if (vendorId) {
      vendor = await Vendor.findById(vendorId);
      if (vendor) {
        await ensureSkuMapping(vendor, item.sku, true);
      }
    }

    if (!vendor) {
      res.status(404);
      throw new Error('Vendor could not be resolved');
    }

    console.log(`Found/Created vendor: ${vendor.name}`);
    item.vendor = vendor._id;
  }

  // Save the order with the updated vendor
  await order.save();
  
  // If this is a Processed stage order, update ProcessedOrderHistory as well
  if (order.stage === 'Processed' && item.processedAt) {
    try {
      const ProcessedOrderHistory = require('../models/ProcessedOrderHistory');
      
      // Find matching history record
      const historyQuery = {
        orderId: order._id,
        itemSku: item.sku,
        processedAt: item.processedAt
      };
      
      // Get vendor name
      let vendorName = 'Unknown Vendor';
      let vendorIdToSave = null;
      if (item.vendor) {
        const vendorDoc = await Vendor.findById(item.vendor);
        if (vendorDoc) {
          vendorName = vendorDoc.name;
          vendorIdToSave = vendorDoc._id;
        }
      }
      
      // Update the history record
      const historyResult = await ProcessedOrderHistory.updateOne(historyQuery, {
        $set: {
          vendorId: vendorIdToSave,
          vendorName: vendorName,
          updatedAt: new Date()
        }
      });
      
      console.log(`[updateItemVendor] Updated ProcessedOrderHistory: matched ${historyResult.matchedCount}, modified ${historyResult.modifiedCount}`);
    } catch (err) {
      console.error('[updateItemVendor] Failed to update ProcessedOrderHistory:', err.message);
      // Don't fail the request if history update fails
    }
  }
  
  // Return a populated response with vendor details
  const updatedOrder = await Order.findById(orderId).populate('items.vendor');
  res.json(updatedOrder);
});

// @desc    Add comment to order item
// @route   POST /api/orders/:orderId/items/:itemId/comment
// @access  Public
const addItemComment = asyncHandler(async (req, res) => {
  const { orderId, itemId } = req.params;
  const { text } = req.body;

  console.log('Adding comment:', { orderId, itemId, text });

  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  const item = order.items.id(itemId);
  if (!item) {
    res.status(404);
    throw new Error('Item not found');
  }

  if (!item.comments) {
    item.comments = [];
  }

  console.log('Current comments:', item.comments);

  item.comments.push({
    text,
    createdAt: new Date()
  });

  console.log('Updated comments:', item.comments);

  await order.save();
  console.log('Comment saved successfully');
  res.json(order);
});

// @desc    Update expected date for order item
// @route   PUT /api/orders/:orderId/items/:itemId/expected-date
// @access  Public
const updateItemExpectedDate = asyncHandler(async (req, res) => {
  const { orderId, itemId } = req.params;
  const { expectedDate } = req.body;

  console.log('Updating expected date:', { orderId, itemId, expectedDate });

  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  const item = order.items.id(itemId);
  if (!item) {
    res.status(404);
    throw new Error('Item not found');
  }

  // Convert string date to Date object if provided
  if (expectedDate) {
    item.expectedDate = new Date(expectedDate);
  } else {
    item.expectedDate = null;
  }

  console.log('Updated expected date:', item.expectedDate);

  await order.save();
  console.log('Expected date saved successfully');
  res.json(order);
});

// @desc    Generate vendor PDF
// @route   GET /api/orders/:id/vendor-pdf/:vendorId
// @access  Public
const generateVendorPDF = asyncHandler(async (req, res) => {
  let browser = null;
  try {
    const { id, vendorId } = req.params;
    // Optional: warehouse override from query
    const { warehouse: warehouseQuery } = req.query;
    console.log(`Generating PDF for order: ${id}, vendor: ${vendorId}`);

    // Use lean() for better performance - returns plain JS objects
    const order = await Order.findById(id).populate('items.vendor').lean();
    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    const vendor = await Vendor.findById(vendorId).lean();
    if (!vendor) {
      res.status(404);
      throw new Error('Vendor not found');
    }

    console.log(`Found order and vendor: ${order._id}, ${vendor.name}`);

    // Filter items for this vendor
    let vendorItems = order.items.filter(
      item => item.vendor && item.vendor._id && item.vendor._id.toString() === vendorId
    );

    if (vendorItems.length === 0) {
      res.status(400);
      throw new Error('No items found for this vendor in the order');
    }

    console.log(`Found ${vendorItems.length} items for vendor ${vendor.name}`);

    // Create unique PO number
    const poNumber = `PO-${order._id.toString().slice(-6)}-${Date.now().toString().slice(-6)}`;

    // Clean data to prevent template rendering errors
    const safeVendor = {
      ...vendor,
      name: vendor.name || 'Unknown Vendor',
      paymentTerms: vendor.paymentTerms || ''
    };
    
    const safeOrder = {
      ...order,
      orderName: order.orderName || order.shopifyOrderName || `Order-${order._id.toString().slice(-6)}`
    };
    
    // Helper function to extract size from variantName
    const extractSize = (variantName) => {
      if (!variantName || typeof variantName !== 'string') return null;
      // Try to extract size patterns like "Small", "Medium", "Large", "XL", "XXL", "S", "M", "L", numbers like "40", "42"
      const sizeMatch = variantName.match(/\b(XXS|XS|S|M|L|XL|XXL|XXXL|Small|Medium|Large|X-Large|XX-Large|\d+)\b/i);
      return sizeMatch ? sizeMatch[0] : null;
    };

    // Aggregate items with same product name and SKU
    const aggregatedItems = vendorItems.reduce((acc, item) => {
      const key = `${item.productName || ''}-${item.sku || ''}`;
      
      // Extract size from variantName if available
      const itemSize = extractSize(item.variantName);
      
      if (!acc[key]) {
        acc[key] = {
          ...item,
          productName: item.productName || 'Unknown Product',
          sku: item.sku || 'No SKU',
          quantity: item.quantity || 1,
          size: itemSize,
          orderNames: [item.orderName || (item._id ? `Order-${item._id.toString().slice(-6)}` : 'Unknown Order')]
        };
      } else {
        acc[key].quantity += (item.quantity || 1);
        // If size is not set yet, try to get it from this item
        if (!acc[key].size && itemSize) {
          acc[key].size = itemSize;
        }
        const orderName = item.orderName || (item._id ? `Order-${item._id.toString().slice(-6)}` : 'Unknown Order');
        if (!acc[key].orderNames.includes(orderName)) {
          acc[key].orderNames.push(orderName);
        }
      }
      return acc;
    }, {});

    // Convert aggregated items to array
    const safeVendorItems = Object.values(aggregatedItems);
    
    // Build client details based on warehouse
    const selectedWarehouse = warehouseQuery || (vendorItems[0].warehouse || 'Okhla');
    const clientDetails = (() => {
      if (selectedWarehouse === 'Bahadurgarh') {
        return {
          company: 'Meddey Technologies Pvt Ltd',
          address: 'Plot No - 2194 MIE Part B, Bahadurgarh,\nJhajjar, Haryana 124507 India,\nJhajjar - 124507\nHaryana (06) ,India',
          gstin: 'GSTIN: 06AAKCM6565B1ZG',
          md: 'MD42:RMD/DCD/HO-1788/3315',
          contact: '',
          email: '',
          phone: ''
        };
      }
      if (selectedWarehouse === 'Direct') {
        // Direct: vendor details and client details should be same
        return {
          company: safeVendor.name,
          address: (safeVendor.contactInfo && safeVendor.contactInfo.address) || '',
          gstin: safeVendor.gstin || '',
          md: '',
          contact: (safeVendor.contactInfo && safeVendor.contactInfo.contact) || '',
          email: (safeVendor.contactInfo && safeVendor.contactInfo.email) || '',
          phone: (safeVendor.contactInfo && safeVendor.contactInfo.phone) || ''
        };
      }
      // Default Okhla
      return {
        company: 'Meddey Technologies Pvt Ltd',
        address: 'C-75, First Floor, DDA Sheds, Pocket A,\nOkhla Phase I, Okhla Industrial Estate,\nNew Delhi, Delhi 110020',
        gstin: '',
        md: '',
        contact: 'Arun (Procurement Manager)',
        email: 'cs@meddey.com',
        phone: '7827637562'
      };
    })();

    // Launch puppeteer with optimized settings
    browser = await launchPuppeteerBrowser();
    
    const page = await browser.newPage();
    
    // Optimize page performance
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      const url = req.url() || '';
      // Allow the Meddey logo image and inline styles; block fonts for speed
      if (resourceType === 'font') {
        req.abort();
        return;
      }
      if (resourceType === 'image') {
        if (url.includes('meddey.com')) {
          req.continue();
          return;
        }
        // Allow other images referenced by template if any
        req.continue();
        return;
      }
      // Stylesheets are not used externally in template (inline CSS), but allow just in case
      req.continue();
    });

    let html;
    try {
      const templatePath = path.join(__dirname, '../templates/purchaseOrder.html');
      
      // Check if template file exists
      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template file not found at: ${templatePath}. Please ensure purchaseOrder.html exists in the templates directory.`);
      }
      
      const template = fs.readFileSync(templatePath, 'utf-8');  
      
      if (!template || template.trim().length === 0) {
        throw new Error('Template file is empty');
      }
      
      html = ejs.render(template, {
        poNumber,
        date: new Date().toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        }),
        vendor: safeVendor,
        vendorItems: safeVendorItems,
        clientDetails,
        selectedWarehouse
      });
    } catch (templateError) {
      console.error('Template generation failed:', templateError);
      const errorMessage = templateError.message || 'Unknown template error';
      throw new Error(`Template error: ${errorMessage}`);
    }

    // Use 'networkidle0' for reliable rendering (waits for network to be idle)
    // Fallback to 'domcontentloaded' if timeout occurs
    try {
      await page.setContent(html, {
        waitUntil: 'networkidle0',
        timeout: 20000
      });
    } catch (timeoutError) {
      console.warn(`Page load timeout for order ${id}, using domcontentloaded fallback`);
      await page.setContent(html, {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });
    }
    
    // Generate PDF with optimized settings
    let pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      },
      timeout: 20000,
      preferCSSPageSize: false
    });

    await browser.close();
    browser = null;

    // Validate PDF buffer before sending
    if (!pdf) {
      console.error('PDF generation failed: PDF is null or undefined');
      if (!res.headersSent) {
        res.status(500).json({ error: 'PDF generation failed: Invalid PDF buffer' });
      }
      return;
    }

    // Convert to Buffer if needed (Puppeteer may return Uint8Array/ArrayBuffer in newer versions)
    if (!Buffer.isBuffer(pdf)) {
      try {
        if (pdf instanceof Uint8Array || Array.isArray(pdf) || ArrayBuffer.isView(pdf)) {
          pdf = Buffer.from(pdf);
        } else if (pdf instanceof ArrayBuffer) {
          pdf = Buffer.from(pdf);
        } else if (pdf && typeof pdf === 'object' && (pdf.data || pdf.buffer)) {
          // Handle objects like { data: Uint8Array | ArrayBuffer | number[] }
          const source = pdf.data || pdf.buffer;
          if (Buffer.isBuffer(source)) {
            pdf = source;
          } else if (source instanceof Uint8Array || Array.isArray(source) || ArrayBuffer.isView(source)) {
            pdf = Buffer.from(source);
          } else if (source instanceof ArrayBuffer) {
            pdf = Buffer.from(source);
          } else {
            throw new Error(`Unsupported inner source type: ${typeof source}`);
          }
        } else {
          throw new Error(`Unsupported pdf type: ${typeof pdf}`);
        }
      } catch (convErr) {
        console.error(`PDF generation failed: Invalid PDF buffer type (${typeof pdf})`, convErr?.message || convErr);
        if (!res.headersSent) {
          res.status(500).json({ error: 'PDF generation failed: Invalid PDF buffer type' });
        }
        return;
      }
    }

    // Check minimum size
    if (pdf.length < 100) {
      console.error(`PDF generation failed: PDF too small (${pdf.length} bytes)`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'PDF generation failed: Generated PDF is too small' });
      }
      return;
    }

    // Check PDF magic bytes (%PDF)
    const pdfHeader = pdf.slice(0, 4).toString('ascii');
    if (pdfHeader !== '%PDF') {
      console.error(`PDF generation failed: Invalid PDF header (got: ${pdfHeader})`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'PDF generation failed: Invalid PDF format' });
      }
      return;
    }

    // Only set headers and send if response hasn't been sent
    if (!res.headersSent) {
      // Sanitize filename to prevent issues with special characters
      const sanitizedFileName = `PO_${safeOrder.orderName.replace(/[^a-zA-Z0-9-_]/g, '_')}_${safeVendor.name.replace(/[^a-zA-Z0-9-_]/g, '_')}_${poNumber}.pdf`;
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', pdf.length);
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}"`);
      
      // Send PDF as binary
      res.end(pdf);
      console.log(`PDF sent successfully (${pdf.length} bytes)`);
    }
  } catch (error) {
    console.error('PDF Generation Error:', error);
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }
    // Only send error if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).json({ error: `PDF generation failed: ${error.message}` });
    }
  }
});

const buildVendorPdfPayload = async ({ items, warehouse: warehouseBody, asZip = false }) => {
  console.log(`Generating vendor PDFs for ${items?.length || 0} item references. asZip=${asZip}`);

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('No items provided');
  }

  const vendorItemsMap = {};
  const orderIds = [...new Set(items.map(item => item.orderId))];

  const orders = await Order.find({ _id: { $in: orderIds } })
    .select('_id orderName shopifyOrderName items')
    .populate('items.vendor', 'name paymentTerms contactInfo gstin')
    .lean();

  orders.forEach(order => {
    order.items.forEach(item => {
      if (item.vendor && item.vendor._id) {
        const vendorId = item.vendor._id.toString();
        if (!vendorItemsMap[vendorId]) {
          vendorItemsMap[vendorId] = {
            vendor: item.vendor,
            items: []
          };
        }
        vendorItemsMap[vendorId].items.push({
          ...item,
          orderName: order.orderName || order.shopifyOrderName || `Order #${order._id.toString().slice(-6)}`,
          orderId: order._id
        });
      }
    });
  });

  if (Object.keys(vendorItemsMap).length === 0) {
    throw new Error('No valid items with vendors found');
  }

  let browser = null;
  const results = [];

  try {
    browser = await launchPuppeteerBrowser();
    const templatePath = path.join(__dirname, '../templates/purchaseOrder.html');
    
    // Check if template file exists
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template file not found at: ${templatePath}. Please ensure purchaseOrder.html exists in the templates directory.`);
    }
    
    const template = fs.readFileSync(templatePath, 'utf-8');
    
    if (!template || template.trim().length === 0) {
      throw new Error('Template file is empty');
    }

    // Process all vendors in parallel for fastest generation
    const pdfPromises = Object.entries(vendorItemsMap).map(async ([vendorId, vendorData]) => {
      let page = null;
      try {
        page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          const resourceType = req.resourceType();
          const url = req.url() || '';
          // Block fonts; allow images (logo) and stylesheets
          if (resourceType === 'font') {
            req.abort();
            return;
          }
          if (resourceType === 'image') {
            if (url.includes('meddey.com')) {
              req.continue();
              return;
            }
            req.continue();
            return;
          }
          req.continue();
        });

        const safeVendor = {
          ...vendorData.vendor,
          name: vendorData.vendor.name || 'Unknown Vendor',
          paymentTerms: vendorData.vendor.paymentTerms || ''
        };

        // Helper function to extract size from variantName
        const extractSize = (variantName) => {
          if (!variantName || typeof variantName !== 'string') return null;
          // Try to extract size patterns like "Small", "Medium", "Large", "XL", "XXL", "S", "M", "L", numbers like "40", "42"
          const sizeMatch = variantName.match(/\b(XXS|XS|S|M|L|XL|XXL|XXXL|Small|Medium|Large|X-Large|XX-Large|\d+)\b/i);
          return sizeMatch ? sizeMatch[0] : null;
        };

        const aggregatedItems = {};
        vendorData.items.forEach(item => {
          const key = `${item.productName || 'Unknown Product'}-${item.sku || 'No SKU'}`;
          
          // Extract size from variantName if available
          const itemSize = extractSize(item.variantName);
          
          if (!aggregatedItems[key]) {
            aggregatedItems[key] = {
              ...item,
              productName: item.productName || 'Unknown Product',
              sku: item.sku || 'No SKU',
              quantity: parseInt(item.quantity, 10) || 1,
              size: itemSize,
              orderNames: item.orderName ? [item.orderName] : []
            };
          } else {
            aggregatedItems[key].quantity += parseInt(item.quantity, 10) || 1;
            // If size is not set yet, try to get it from this item
            if (!aggregatedItems[key].size && itemSize) {
              aggregatedItems[key].size = itemSize;
            }
            if (item.orderName && !aggregatedItems[key].orderNames.includes(item.orderName)) {
              aggregatedItems[key].orderNames.push(item.orderName);
            }
          }
        });

        const safeVendorItems = Object.values(aggregatedItems);
        const poNumber = `PO-BULK-${vendorId.slice(-4)}-${Date.now().toString().slice(-6)}`;

        const selectedWarehouse = warehouseBody || (vendorData.items[0] && vendorData.items[0].warehouse) || 'Okhla';
        const clientDetails = (() => {
          if (selectedWarehouse === 'Bahadurgarh') {
            return {
              company: 'Meddey Technologies Pvt Ltd',
              address: 'Plot No - 2194 MIE Part B, Bahadurgarh,\nJhajjar, Haryana 124507 India,\nJhajjar - 124507\nHaryana (06) ,India',
              gstin: 'GSTIN: 06AAKCM6565B1ZG',
              md: 'MD42:RMD/DCD/HO-1788/3315',
              contact: '',
              email: '',
              phone: ''
            };
          }
          if (selectedWarehouse === 'Direct') {
            return {
              company: safeVendor.name,
              address: (safeVendor.contactInfo && safeVendor.contactInfo.address) || '',
              gstin: safeVendor.gstin || '',
              md: '',
              contact: (safeVendor.contactInfo && safeVendor.contactInfo.contact) || '',
              email: (safeVendor.contactInfo && safeVendor.contactInfo.email) || '',
              phone: (safeVendor.contactInfo && safeVendor.contactInfo.phone) || ''
            };
          }
          return {
            company: 'Meddey Technologies Pvt Ltd',
            address: 'C-75, First Floor, DDA Sheds, Pocket A,\nOkhla Phase I, Okhla Industrial Estate,\nNew Delhi, Delhi 110020',
            gstin: '',
            md: '',
            contact: 'Arun (Procurement Manager)',
            email: 'cs@meddey.com',
            phone: '7827637562'
          };
        })();

        const html = ejs.render(template, {
          poNumber,
          date: new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          vendor: safeVendor,
          vendorItems: safeVendorItems,
          clientDetails,
          selectedWarehouse
        });

        // Use 'networkidle0' for reliable rendering (waits for network to be idle)
        // Fallback to 'domcontentloaded' if timeout occurs
        try {
          await page.setContent(html, {
            waitUntil: 'networkidle0',
            timeout: 20000
          });
        } catch (timeoutError) {
          console.warn(`Page load timeout for vendor ${safeVendor.name}, using domcontentloaded fallback`);
          await page.setContent(html, {
            waitUntil: 'domcontentloaded',
            timeout: 10000
          });
        }

        // Generate PDF with optimized settings
        let pdf = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: {
            top: '20px',
            right: '20px',
            bottom: '20px',
            left: '20px'
          },
          timeout: 20000,
          preferCSSPageSize: false
        });

        if (!pdf) {
          console.error(`PDF generation failed for vendor ${safeVendor.name}: empty buffer`);
          return null;
        }

        if (!Buffer.isBuffer(pdf)) {
          if (pdf instanceof Uint8Array || Array.isArray(pdf) || ArrayBuffer.isView(pdf)) {
            pdf = Buffer.from(pdf);
          } else if (pdf instanceof ArrayBuffer) {
            pdf = Buffer.from(pdf);
          } else if (pdf && typeof pdf === 'object' && (pdf.data || pdf.buffer)) {
            const source = pdf.data || pdf.buffer;
            if (Buffer.isBuffer(source)) {
              pdf = source;
            } else if (source instanceof Uint8Array || Array.isArray(source) || ArrayBuffer.isView(source)) {
              pdf = Buffer.from(source);
            } else if (source instanceof ArrayBuffer) {
              pdf = Buffer.from(source);
            } else {
              console.error(`Unsupported PDF buffer type for vendor ${safeVendor.name}`);
              return null;
            }
          } else {
            console.error(`Unsupported PDF type for vendor ${safeVendor.name}: ${typeof pdf}`);
            return null;
          }
        }

        if (pdf.length < 100) {
          console.error(`PDF generation failed for vendor ${safeVendor.name}: buffer too small (${pdf.length} bytes)`);
          return null;
        }

        const pdfHeader = pdf.slice(0, 4).toString('ascii');
        if (pdfHeader !== '%PDF') {
          console.error(`PDF generation failed for vendor ${safeVendor.name}: invalid header ${pdfHeader}`);
          return null;
        }

        const fileName = `PO_${safeVendor.name.replace(/[^a-zA-Z0-9]/g, '_')}_${poNumber}_${Date.now()}.pdf`;
        const base64 = pdf.toString('base64');
        return {
          vendorId,
          vendorName: safeVendor.name,
          poNumber,
          fileName,
          size: pdf.length,
          pdfBase64: base64
        };
      } catch (error) {
        console.error(`Error generating PDF for vendor ${vendorId}:`, error?.message || error);
        return null; // Return null on error, will be filtered out
      } finally {
        if (page) {
          try {
            await page.close();
          } catch (closeError) {
            console.error(`Error closing page for vendor ${vendorId}:`, closeError?.message || closeError);
          }
        }
      }
    });

    // Wait for all PDFs to be generated in parallel, then filter out null results
    const pdfResults = await Promise.all(pdfPromises);
    results.push(...pdfResults.filter(result => result !== null));
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing Puppeteer browser:', closeError?.message || closeError);
      }
    }
  }

  if (results.length === 0) {
    throw new Error('No PDFs were generated. This may be due to: 1) No valid items with vendors found, 2) PDF generation failed for all vendors, 3) Browser launch issues. Check server logs for details.');
  }

  if (asZip) {
    const zipBuffer = await createZipFromResults(results);
    const fileName = `vendor-po-${new Date().toISOString().split('T')[0]}-${Date.now()}.zip`;
    return {
      type: 'zip',
      total: results.length,
      fileName,
      zipBase64: zipBuffer.toString('base64'),
      results
    };
  }

  return {
    type: 'list',
    results
  };
};

// @desc    Generate vendor PDF for multiple orders (synchronous)
// @route   POST /api/orders/vendor-pdf-bulk
// @access  Public
const generateVendorPDFBulk = asyncHandler(async (req, res) => {
  try {
    // Validate request body
    if (!req.body || !req.body.items) {
      return res.status(400).json({ 
        error: 'Invalid request: items array is required',
        details: 'Request body must contain an items array with orderId and item references'
      });
    }

    if (!Array.isArray(req.body.items) || req.body.items.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid request: items must be a non-empty array',
        details: 'At least one item is required to generate PDFs'
      });
    }

    const payload = await buildVendorPdfPayload({
      items: req.body.items,
      warehouse: req.body?.warehouse,
      asZip: req.body?.asZip === true
    });

    if (payload.type === 'zip') {
      res.json({
        fileName: payload.fileName,
        zipBase64: payload.zipBase64,
        total: payload.total
      });
    } else {
      res.json({
        count: payload.results.length,
        results: payload.results
      });
    }
  } catch (error) {
    console.error('Bulk PDF Generation Error:', error);
    console.error('Error stack:', error.stack);
    
    // Provide detailed error information
    const errorMessage = error.message || 'Unknown error occurred';
    const errorDetails = {
      error: `Bulk PDF generation failed: ${errorMessage}`,
      details: error.stack || 'No additional details available',
      timestamp: new Date().toISOString()
    };
    
    // Check for specific error types
    if (errorMessage.includes('Template file not found')) {
      errorDetails.suggestion = 'Please ensure purchaseOrder.html exists in backend/templates/ directory';
    } else if (errorMessage.includes('No suitable browser executable')) {
      errorDetails.suggestion = 'Please set CHROME_EXECUTABLE_PATH or EDGE_EXECUTABLE_PATH environment variable';
    } else if (errorMessage.includes('No PDFs were generated')) {
      errorDetails.suggestion = 'Check that all items have valid vendors and orders exist';
    }
    
    res.status(500).json(errorDetails);
  }
});

// @desc    Create asynchronous vendor PDF job
// @route   POST /api/orders/vendor-pdf-job
// @access  Public
const createVendorPdfJob = asyncHandler(async (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400);
    throw new Error('No items provided');
  }

  const payload = {
    items,
    warehouse: req.body?.warehouse,
    asZip: req.body?.asZip === true
  };

  const jobId = enqueuePdfJob(payload, async () => buildVendorPdfPayload(payload));
  res.status(202).json({ jobId });
});

// @desc    Get vendor PDF job status
// @route   GET /api/orders/vendor-pdf-job/:jobId
// @access  Public
const getVendorPdfJobStatus = asyncHandler(async (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404);
    throw new Error('Job not found');
  }
  res.json(job);
});

// @desc    Fetch orders from Shopify
// @route   POST /api/orders/fetch-shopify
// @access  Public
const fetchShopifyOrders = asyncHandler(async (req, res) => {
  // Get store ID from request
  const { storeId = 'store1' } = req.body;
  
  // Check if requested store is configured
  if (!shopifyStores[storeId]) {
    console.error(`Shopify store ${storeId} not configured. Available stores:`, Object.keys(shopifyStores));
    res.status(400);
    throw new Error(`Shopify store ${storeId} not configured. Please check your environment variables. Available stores: ${Object.keys(shopifyStores).join(', ')}`);
  }

  try {
    // Get orders from selected Shopify store
    const shopify = shopifyStores[storeId];
    
    // Implement retry mechanism with exponential backoff
    const fetchWithRetry = async (options, retries = 3, delay = 1000) => {
      try {
        return await shopify.order.list(options);
      } catch (error) {
        if (retries <= 0) throw error;
        
        console.log(`Shopify API error, retrying in ${delay/1000} seconds...`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(options, retries - 1, delay * 2);
      }
    };

    // Fetch orders with pagination (Shopify supports up to 100 per request)
    let params = { 
      limit: 100,
      status: 'open',
      fields: 'id,name,email,customer,line_items,financial_status,fulfillment_status,created_at,variant_title,tags'
    };
    
    // First page of orders
    console.log(`Fetching first page of orders from ${storeId}...`);
    let shopifyOrders = await fetchWithRetry(params);
    
    // Keep track of all orders
    let allOrders = [...shopifyOrders];
    
    // If there are more orders, fetch them using pagination
    let hasNextPage = shopifyOrders.length === 100;
    let pageCount = 1;
    
    while (hasNextPage) {
      pageCount++;
      console.log(`Fetching page ${pageCount} of orders from ${storeId}...`);
      
      // Get the ID of the last order in the current page
      const lastOrder = shopifyOrders[shopifyOrders.length - 1];
      
      // Fetch the next page using the 'since_id' parameter
      params.since_id = lastOrder.id;
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Fetch the next page
      shopifyOrders = await fetchWithRetry(params);
      
      // Add to our collection
      allOrders = [...allOrders, ...shopifyOrders];
      
      // Check if there are more pages
      hasNextPage = shopifyOrders.length === 100;
      
      // Continue fetching until all orders are retrieved
      // No artificial limit - fetch all available orders
    }
    
    console.log(`Fetched a total of ${allOrders.length} orders from ${storeId} across ${pageCount} pages.`);
    
    // Use all orders for processing
    
    // Process each order
    const processedOrders = [];
    const failedOrders = [];

    let packSkuDataSnapshot = { packSkuMap: {}, packProducts: [], comboProducts: [], vendorSuggestions: {} };
    try {
      packSkuDataSnapshot = await getPackSkuData();
    } catch (error) {
      console.warn('[fetchShopifyOrders] Failed to load Google Sheets pack data:', error.message);
    }
    const packSkuMap = packSkuDataSnapshot.packSkuMap || {};
    const packProductsList = Array.isArray(packSkuDataSnapshot.packProducts) ? packSkuDataSnapshot.packProducts : [];
    const comboProductsList = Array.isArray(packSkuDataSnapshot.comboProducts) ? packSkuDataSnapshot.comboProducts : [];
    const vendorSuggestionMap = packSkuDataSnapshot.vendorSuggestions || {};

    const vendorResolutionCache = new Map();
    const resolveVendorFromSheets = async (vendorName, sku) => {
      const normalizedName = normalizeVendorName(vendorName || '');
      if (!normalizedName) return null;
      const cacheKey = normalizedName.toLowerCase();
      if (vendorResolutionCache.has(cacheKey)) {
        return vendorResolutionCache.get(cacheKey);
      }
      try {
        const vendorDoc = await findOrCreateVendorByName({
          rawName: normalizedName,
          sku,
          createdFrom: 'shopify-import',
          forceCreate: true,
          respectSettings: false
        });
        const vendorId = vendorDoc ? vendorDoc._id : null;
        vendorResolutionCache.set(cacheKey, vendorId);
        return vendorId;
      } catch (error) {
        console.error(`[fetchShopifyOrders] Failed to resolve vendor "${vendorName}" for SKU ${sku}:`, error.message);
        vendorResolutionCache.set(cacheKey, null);
        return null;
      }
    };

    const appendSuggestion = (list, name) => {
      const normalized = normalizeVendorName(name || '');
      if (!normalized) return;
      if (!list.some(entry => normalizeVendorName(entry) === normalized)) {
        list.push(normalized);
      }
    };

    const deriveVendorData = async ({ sku, singleProductSku, itemType }) => {
      const normalizedSku = normalizeSku(sku || '');
      if (!normalizedSku) {
        return { vendorId: null, vendorName: null, suggestions: [] };
      }

      const suggestions = [];
      appendSuggestion(suggestions, vendorSuggestionMap[normalizedSku]);
      appendSuggestion(suggestions, packSkuMap[normalizedSku]?.vendorName);

      if (suggestions.length === 0) {
        try {
          const candidateSkus = await buildSkuCandidateList(
            { primarySku: sku, singleProductSku, itemType, individualSkus: [] },
            packSkuDataSnapshot
          );
          const { suggestions: sheetSuggestions } = getVendorSuggestionsFromSheets(candidateSkus, packSkuDataSnapshot);
          (sheetSuggestions || []).forEach(name => appendSuggestion(suggestions, name));
        } catch (error) {
          console.warn(`[fetchShopifyOrders] Vendor lookup failed for SKU ${sku}:`, error.message);
        }
      }

      const vendorName = suggestions.length > 0 ? suggestions[0] : null;
      const vendorId = vendorName ? await resolveVendorFromSheets(vendorName, sku) : null;

      return { vendorId, vendorName, suggestions };
    };

    for (const shopifyOrder of allOrders) {
      try {
        // Check if order already exists
        const existingOrder = await Order.findOne({ 
          shopifyOrderId: shopifyOrder.id.toString(),
          shopifyStoreId: storeId
        });
        
        if (!existingOrder) {
          // Standardize payment status to match our enum values
          let paymentStatus = shopifyOrder.financial_status || 'Unknown';
          
          // Handle various payment status formats from Shopify
          if (paymentStatus === 'partially_paid') {
            paymentStatus = 'Partially_paid';
          } else {
            paymentStatus = capitalizeFirst(paymentStatus);
          }
          
          const newOrder = {
            shopifyOrderId: shopifyOrder.id.toString(),
            shopifyStoreId: storeId,
            shopifyOrderName: shopifyOrder.name,
            orderName: shopifyOrder.name,
            shopifyCreatedAt: new Date(shopifyOrder.created_at), // Store Shopify creation time
            customerName: shopifyOrder.customer ? `${shopifyOrder.customer.first_name} ${shopifyOrder.customer.last_name}` : 'Guest',
            customerEmail: shopifyOrder.email || 'No email',
            paymentStatus: paymentStatus,
            fulfillmentStatus: capitalizeFirst(shopifyOrder.fulfillment_status || 'Unfulfilled'),
            stage: 'Initial',
            createdAt: new Date(shopifyOrder.created_at), // Use Shopify's order creation date
            items: await Promise.all(shopifyOrder.line_items.map(async item => {
              let singleProductSku = '';
              let itemType = '';
              const normalizedItemSku = normalizeSku(item.sku || '');
              
              if (item.sku && (item.sku.startsWith('P') || item.sku.startsWith('C'))) {
                try {
                  let matchingData;
                  if (item.sku.startsWith('P')) {
                    matchingData = packProductsList.find(p => normalizeSku(p['Pack sku'] || p.packSku) === normalizedItemSku);
                    if (matchingData) {
                      singleProductSku = matchingData['Correct Puchase SKU'] || matchingData.correctPurchaseSku || '';
                      itemType = 'Pack';
                    }
                  } else if (item.sku.startsWith('C')) {
                    matchingData = comboProductsList.find(c => normalizeSku(c['New sku'] || c.newSku) === normalizedItemSku);
                    if (matchingData) {
                      singleProductSku = matchingData['Correct Puchase SKU'] || matchingData.correctPurchaseSku || '';
                      itemType = 'Combo';
                    }
                  }
                } catch (error) {
                  console.error(`Error mapping Pack/Combo data for SKU ${item.sku}:`, error);
                }
              }

              const vendorData = await deriveVendorData({
                sku: item.sku,
                singleProductSku,
                itemType
              });
              
              const processedItem = {
                productName: item.title,
                variantName: item.variant_title || '',
                sku: item.sku || 'No SKU',
                quantity: item.quantity,
                price: item.price,
                singleProductSku,
                itemType
              };

              if (vendorData.vendorId) {
                processedItem.vendor = vendorData.vendorId;
              }
              
              // Save vendor suggestions for later acceptance
              if (vendorData.suggestions && vendorData.suggestions.length > 0) {
                processedItem.suggestedVendors = vendorData.suggestions;
              }
              
              return processedItem;
            }))
          };
          
          // Create new order in our database
          const createdOrder = await Order.create(newOrder);
          processedOrders.push(createdOrder);
        }
      } catch (itemError) {
        console.error(`Error processing order ${shopifyOrder.id}:`, itemError);
        // Track failed orders
        failedOrders.push({
          id: shopifyOrder.id,
          name: shopifyOrder.name,
          error: itemError.message
        });
        // Continue processing other orders even if one fails
        continue;
      }
    }
    
    // Log summary of failed orders if any
    if (failedOrders.length > 0) {
      console.log(`Failed to process ${failedOrders.length} orders from ${storeId}. See logs for details.`);
    }

    res.status(201).json({
      message: `Successfully imported ${processedOrders.length} new orders from Shopify store ${storeId}`,
      orders: processedOrders,
      failedOrders: failedOrders.length > 0 ? { count: failedOrders.length } : undefined
    });
  } catch (error) {
    console.error('Shopify API Error:', error);
    res.status(500);
    throw new Error(`Failed to fetch orders from Shopify: ${error.message}`);
  }
});

// @desc    Create a manual order
// @route   POST /api/orders/manual
// @access  Public
const createManualOrder = asyncHandler(async (req, res) => {
  const {
    customerName,
    customerEmail,
    items,
    paymentStatus = 'Paid',
    fulfillmentStatus = 'Unfulfilled',
    orderName,
  } = req.body;

  if (!items || items.length === 0) {
    res.status(400);
    throw new Error('Order must have at least one item');
  }

  const timestamp = Date.now();
  const productIds = items
    .map((item) => item.productId)
    .filter(Boolean);
  const needsPackData = items.some((item) => item.sku);

  const [packData, products] = await Promise.all([
    needsPackData ? getPackSkuData() : { packSkuMap: {} },
    productIds.length
      ? Product.find({ _id: { $in: productIds } })
          .populate('vendor')
          .lean()
      : [],
  ]);

  const manualOrderPackMap = packData.packSkuMap || {};
  const productMap = new Map(
    products.map((product) => [product._id.toString(), product])
  );

  const vendorCache = new Map();
  const resolveVendor = async (vendorInput) => {
    if (!vendorInput) {
      return null;
    }

    if (typeof vendorInput !== 'string') {
      return vendorInput;
    }

    if (mongoose.Types.ObjectId.isValid(vendorInput)) {
      return vendorInput;
    }

    const normalized = vendorInput.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    if (!vendorCache.has(normalized)) {
      vendorCache.set(
        normalized,
        (async () => {
          const existing = await Vendor.findOne({
            name: { $regex: new RegExp(`^${vendorInput}$`, 'i') },
          }).lean();

          if (existing) {
            return existing._id;
          }

          console.log(`Creating new vendor from manual order: ${vendorInput}`);
          const created = await Vendor.create({
            name: vendorInput,
            email: '',
            phone: '',
            createdFrom: 'manual-order',
          });
          return created._id;
        })()
      );
    }

    return vendorCache.get(normalized);
  };

  const processedItems = await Promise.all(
    items.map(async (item, index) => {
      const processedItem = {
        quantity: item.quantity || 1,
        price: item.price || 0,
      };

      if (item.productId) {
        const product = productMap.get(item.productId.toString());
        if (product) {
          processedItem.productName = product.name;
          processedItem.sku = product.sku;
          processedItem.price = product.costPrice;
          if (product.vendor) {
            processedItem.vendor = product.vendor._id || product.vendor;
          }
        }
      } else if (item.productName) {
        processedItem.productName = item.productName;
        const generatedSku = `MANUAL-${(timestamp + index)
          .toString()
          .slice(-6)}`;
        processedItem.sku = item.sku || generatedSku;

        if (item.sku) {
          const normalizedSku = item.sku.toUpperCase();
          const packInfo = manualOrderPackMap[normalizedSku];
          if (packInfo) {
            processedItem.price = item.price || packInfo.priceBeforeGst || 0;
            processedItem.variantName = packInfo.size || '';

            if (!item.vendor && packInfo.vendorName) {
              const vendorId = await resolveVendor(packInfo.vendorName);
              if (vendorId) {
                processedItem.vendor = vendorId;
              }
            }
          }
        }

        if (!processedItem.vendor && item.vendor) {
          const vendorId = await resolveVendor(item.vendor);
          if (vendorId) {
            processedItem.vendor = vendorId;
          }
        }
      } else {
        const fallbackSku = item.sku || `MANUAL-${(timestamp + index)
          .toString()
          .slice(-6)}`;
        processedItem.productName = item.productName || fallbackSku || 'Unknown Product';
        processedItem.sku = fallbackSku;
        if (item.vendor) {
          const vendorId = await resolveVendor(item.vendor);
          if (vendorId) {
            processedItem.vendor = vendorId;
          }
        }
      }

      return processedItem;
    })
  );

  const generatedOrderName = orderName?.toString().trim() || `MO-${timestamp
    .toString()
    .slice(-6)}`;

  const order = await Order.create({
    orderName: generatedOrderName,
    customerName,
    customerEmail,
    paymentStatus,
    fulfillmentStatus,
    stage: 'Initial',
    items: processedItems,
    isManual: true,
  });

  await order.populate('items.vendor');

  // Add storeName to response if order has shopifyStoreId
  const orderObj = order.toObject();
  if (orderObj.shopifyStoreId) {
    orderObj.storeName = getStoreDisplayName(orderObj.shopifyStoreId);
  }

  res.status(201).json(orderObj);
});

// @desc    Bulk create manual orders
// @route   POST /api/orders/bulk-create
// @access  Public
const bulkCreateOrders = asyncHandler(async (req, res) => {
  const { orders } = req.body;

  if (!orders || !Array.isArray(orders) || orders.length === 0) {
    res.status(400);
    throw new Error('Orders array is required');
  }

  // Fetch pack SKU data and inventory data for enrichment
  const [packSkuResponse, inventoryData] = await Promise.all([
    getPackSkuData(),
    getAllInventoryData(true) // Force refresh for fresh data
  ]);
  const packSkuMap = packSkuResponse.packSkuMap || packSkuResponse || {};

  const createdOrders = [];
  const failedOrders = [];

  for (let i = 0; i < orders.length; i++) {
    const orderData = orders[i];
    try {
      // Enhanced validation for required fields
      const validationErrors = [];
      if (!orderData.sku || orderData.sku.trim() === '') {
        validationErrors.push('SKU is required');
      }
      if (!orderData.productName || orderData.productName.trim() === '') {
        validationErrors.push('Product Name is required');
      }
      if (!orderData.quantity) {
        validationErrors.push('Quantity is required');
      } else if (isNaN(parseInt(orderData.quantity)) || parseInt(orderData.quantity) <= 0) {
        validationErrors.push('Quantity must be a positive number');
      }
      
      if (validationErrors.length > 0) {
        failedOrders.push({
          index: i,
          data: orderData,
          error: `Validation failed: ${validationErrors.join(', ')}`
        });
        continue;
      }

      // Validate and sanitize string inputs
      const sanitizedSku = orderData.sku.trim();
      const sanitizedProductName = orderData.productName.trim();
      const sanitizedQuantity = parseInt(orderData.quantity);
      
      if (sanitizedQuantity <= 0) {
        failedOrders.push({
          index: i,
          data: orderData,
          error: 'Quantity must be greater than zero'
        });
        continue;
      }

      // Try to find existing vendor by name if provided
      let vendorId = null;
      let vendorName = null;
      
      if (orderData.vendor && orderData.vendor.trim()) {
        vendorName = orderData.vendor.trim();
        
        try {
          // Try to find existing vendor
          const vendor = await Vendor.findOne({ 
            name: { $regex: new RegExp(`^${vendorName}$`, 'i') } 
          });
          
          if (vendor) {
            vendorId = vendor._id;
          } else {
            // Create new vendor if not found
            console.log(`Creating new vendor: ${vendorName}`);
            const newVendor = await Vendor.create({
              name: vendorName,
              email: orderData.vendorEmail || '',
              phone: orderData.vendorPhone || '',
              createdFrom: 'bulk-import'
            });
            vendorId = newVendor._id;
          }
        } catch (vendorError) {
          console.error(`Error handling vendor for order ${i}:`, vendorError);
          failedOrders.push({
            index: i,
            data: orderData,
            error: `Vendor error: ${vendorError.message}`
          });
          continue;
        }
      }

      // Enrich with Google Sheets data
      const normalizedSku = sanitizedSku.toUpperCase();
      let enrichedData = {};
      
      if (packSkuMap[normalizedSku]) {
        const packInfo = packSkuMap[normalizedSku];
        enrichedData = {
          size: packInfo.size,
          gst: packInfo.gst || 0,
          priceBeforeGst: packInfo.priceBeforeGst || 0,
          totalPrice: packInfo.totalPrice || 0,
        };
        
        // If no vendor provided, use auto-detected vendor from sheet
        if (!vendorId && packInfo.vendorName) {
          try {
            const autoVendor = await Vendor.findOne({ 
              name: { $regex: new RegExp(`^${packInfo.vendorName}$`, 'i') } 
            });
            if (autoVendor) {
              vendorId = autoVendor._id;
            }
          } catch (autoVendorError) {
            // Continue without auto-vendor assignment
            console.warn(`Could not auto-assign vendor: ${autoVendorError.message}`);
          }
        }
      }

      // Create order item with enriched data
      const item = {
        productName: sanitizedProductName,
        sku: sanitizedSku,
        quantity: sanitizedQuantity,
        price: parseFloat(orderData.price) || enrichedData.priceBeforeGst || 0,
        vendor: vendorId,
        variantName: enrichedData.size || '',
      };

      // Validate date if provided
      let createdAt = new Date();
      if (orderData.date) {
        const parsedDate = new Date(orderData.date);
        if (isNaN(parsedDate.getTime())) {
          failedOrders.push({
            index: i,
            data: orderData,
            error: 'Invalid date format'
          });
          continue;
        }
        createdAt = parsedDate;
      }

      // Create the order
      const order = await Order.create({
        orderName: orderData.orderId || `MANUAL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        customerName: orderData.customerName || 'Bulk Import Customer',
        customerEmail: orderData.customerEmail || '',
        customerPhone: orderData.customerPhone || '',
        shippingAddress: orderData.shippingAddress || '',
        paymentStatus: 'Paid',
        fulfillmentStatus: 'Unfulfilled',
        stage: orderData.stage || 'Initial',
        items: [item],
        isManual: true,
        notes: orderData.notes || '',
        createdAt,
      });

      createdOrders.push(order);
    } catch (error) {
      console.error(`Error creating order ${i}:`, error);
      failedOrders.push({
        index: i,
        data: orderData,
        error: error.message || 'Unknown error occurred'
      });
    }
  }

  res.status(201).json({
    created: createdOrders.length,
    failed: failedOrders.length,
    orders: createdOrders,
    failures: failedOrders
  });
});

// @desc    Generate product import template
// @route   GET /api/orders/product-template
// @access  Public
const generateProductTemplate = asyncHandler(async (req, res) => {
  const fields = ['SKU', 'Product Name', 'Vendor', 'Price', 'Notes'];
  const parser = new Parser({ fields });
  const csv = parser.parse([]);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=product_import_template.csv');
  res.send(csv);
});

// @desc    Import products from CSV file
// @route   POST /api/orders/import-products
// @access  Public
const importProducts = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('No file uploaded');
  }

  // Parse CSV
  const csv = require('csv-parser');
  const fs = require('fs');
  const results = [];
  const errors = [];
  const success = [];

  // Stream the file from memory
  const fileBuffer = req.file.buffer;
  const fileStream = require('stream').Readable.from(fileBuffer.toString());

  fileStream
    .pipe(csv())
    .on('data', (data) => {
      results.push(data);
    })
    .on('end', async () => {
      try {
        // Process each row
        for (const row of results) {
          try {
            // Validate required fields
            if (!row.SKU || !row['Product Name']) {
              errors.push({ sku: row.SKU || 'Unknown', error: 'Missing required fields' });
              continue;
            }

            // Check if product already exists
            const existingProduct = await Product.findOne({ sku: row.SKU });
            
            if (existingProduct) {
              // Update existing product
              existingProduct.name = row['Product Name'];
              existingProduct.costPrice = parseFloat(row.Price) || 0;
              existingProduct.notes = row.Notes || '';
              
              // If vendor name is provided, try to link it to the existing product
              if (row.Vendor) {
                const vendor = await Vendor.findOne({ name: { $regex: new RegExp(row.Vendor, 'i') } });
                if (vendor) {
                  existingProduct.vendor = vendor._id;
                }
              }
              
              await existingProduct.save();
              success.push({ sku: row.SKU, action: 'updated' });
            } else {
              // Create new product
                              let vendorId = null;
                
                // If vendor name is provided, try to find the vendor
                if (row.Vendor) {
                  const vendor = await Vendor.findOne({ name: { $regex: new RegExp(row.Vendor, 'i') } });
                  if (vendor) {
                    vendorId = vendor._id;
                  }
                }
                
                const newProduct = await Product.create({
                  sku: row.SKU,
                  name: row['Product Name'],
                  costPrice: parseFloat(row.Price) || 0,
                  gst: 0, // Default value, can be updated if needed
                  vendor: vendorId,
                  notes: row.Notes || ''
                });
              
              success.push({ sku: row.SKU, action: 'created' });
            }
            
            // Always try to map vendor, even if it was handled earlier
            if (row.Vendor && row.Vendor.trim() !== '') {
              // Search for vendor case insensitive
              const vendor = await Vendor.findOne({ name: { $regex: new RegExp('^' + row.Vendor.trim() + '$', 'i') } });
              
              if (vendor) {
                // Update product with vendor ID
                await Product.findOneAndUpdate(
                  { sku: row.SKU },
                  { vendor: vendor._id }
                );
                
                // Add SKU mapping to vendor
                if (!vendor.skuMappings.find(mapping => mapping.sku === row.SKU)) {
                  vendor.skuMappings.push({ sku: row.SKU });
                  await vendor.save();
                }
                
                console.log(`Mapped product ${row.SKU} to existing vendor ${vendor.name}`);
              } else {
                // Create new vendor
                const newVendor = await Vendor.create({
                  name: row.Vendor.trim(),
                  skuMappings: [{ sku: row.SKU }]
                });
                
                // Update product with the new vendor
                await Product.findOneAndUpdate(
                  { sku: row.SKU },
                  { vendor: newVendor._id }
                );
                
                console.log(`Created new vendor ${newVendor.name} for product ${row.SKU}`);
              }
            }
          } catch (error) {
            errors.push({ sku: row.SKU || 'Unknown', error: error.message });
          }
        }

        res.json({ success, errors });
      } catch (error) {
        console.error('Error processing CSV:', error);
        res.status(500);
        throw new Error(`Failed to process CSV: ${error.message}`);
      }
    });
});

// @desc    Bulk map vendors based on SKUs
// @route   POST /api/orders/bulk-map-vendors
// @access  Public
const bulkMapVendors = asyncHandler(async (req, res) => {
  const { skus } = req.body; // Optional: array of specific SKUs to process
  const { getIndividualSkusForPackCombo, getPackSkuData, clearCaches } = require('../services/googleSheets');
  
  // Clear cache to fetch fresh data from Google Sheets
  console.log('[bulkMapVendors] Clearing cache and fetching fresh vendor data from Google Sheets...');
  clearCaches();
  
  // Fetch fresh vendor data from Google Sheets
  const packSkuData = await getPackSkuData();
  const { vendorSuggestions = {}, packSkuMap = {} } = packSkuData;
  
  console.log(`[bulkMapVendors] Fetched ${Object.keys(vendorSuggestions).length} vendor suggestions from Google Sheets`);
  
  // Get all vendors from database (for matching by name)
  const allVendors = await Vendor.find({});
  
  // Helper function to find vendor by exact normalized name
  const findVendorByName = (vendorName) => {
    if (!vendorName) return null;
    const normalizedName = normalizeVendorName(vendorName);
    if (!normalizedName) return null;
    
    // Try exact match first (case-insensitive)
    const regex = new RegExp(`^${escapeRegExp(normalizedName)}$`, 'i');
    return allVendors.find(v => regex.test(v.name));
  };
  
  // Helper function to get vendor name from Google Sheets for a SKU
  const getVendorNameFromSheets = (sku) => {
    const normalizedSku = normalizeSku(sku);
    if (!normalizedSku) return null;
    
    // Try vendorSuggestions first, then packSkuMap
    const vendorName = vendorSuggestions?.[normalizedSku] || packSkuMap?.[normalizedSku]?.vendorName;
    return vendorName ? String(vendorName).trim() : null;
  };
  
  // Get orders to process - either specific SKUs or all Initial stage orders
  let orders;
  if (skus && Array.isArray(skus) && skus.length > 0) {
    console.log(`[bulkMapVendors] Processing only ${skus.length} specific SKUs:`, skus);
    orders = await Order.find({ 
      stage: 'Initial',
      'items.sku': { $in: skus.map(sku => new RegExp(`^${escapeRegExp(sku)}$`, 'i')) }
    });
  } else {
    console.log('[bulkMapVendors] Processing all Initial stage orders');
    orders = await Order.find({ stage: 'Initial' });
  }
  
  let updateCount = 0;
  let skippedCount = 0;
  let createdVendors = [];
  let notFoundSkus = [];
  
  // For each order
  for (const order of orders) {
    let orderUpdated = false;
    
    // For each item in the order
    for (const item of order.items) {
      // Skip if already mapped
      if (item.vendor) continue;
      
      const itemSku = String(item.sku || '').trim().toUpperCase();
      if (!itemSku) continue;
      
      // If specific SKUs are provided, only process matching items
      if (skus && Array.isArray(skus) && skus.length > 0) {
        const isMatchingSku = skus.some(sku => 
          String(sku || '').trim().toUpperCase() === itemSku
        );
        if (!isMatchingSku) continue;
      }
      
      let matchingVendor = null;
      let vendorNameFromSheet = null;
      
      // First, try to get vendor name from Google Sheets for the SKU
      vendorNameFromSheet = getVendorNameFromSheets(itemSku);
      
      // If not found and SKU is pack/combo, try individual SKUs
      if (!vendorNameFromSheet && (itemSku.startsWith('P') || itemSku.startsWith('C'))) {
        try {
          const individualSkus = await getIndividualSkusForPackCombo(itemSku);
          if (Array.isArray(individualSkus) && individualSkus.length > 0) {
            // Try to get vendor name for any of the individual SKUs
            for (const individualSku of individualSkus) {
              const normalizedIndividualSku = String(individualSku || '').trim().toUpperCase();
              if (!normalizedIndividualSku) continue;
              
              vendorNameFromSheet = getVendorNameFromSheets(normalizedIndividualSku);
              if (vendorNameFromSheet) {
                console.log(`[bulkMapVendors] Found vendor "${vendorNameFromSheet}" for pack/combo SKU ${itemSku} via individual SKU ${normalizedIndividualSku}`);
                break;
              }
            }
          }
        } catch (error) {
          console.warn(`[bulkMapVendors] Error fetching individual SKUs for ${itemSku}:`, error.message);
        }
      }
      
      // If we have a vendor name from sheets, find or create the vendor
      if (vendorNameFromSheet) {
        matchingVendor = findVendorByName(vendorNameFromSheet);
        
        // If vendor not found, create it
        if (!matchingVendor) {
          const normalizedVendorName = normalizeVendorName(vendorNameFromSheet);
          if (normalizedVendorName) {
            try {
              matchingVendor = await Vendor.create({
                name: normalizedVendorName,
                skuMappings: [{ sku: normalizeSku(itemSku) }],
                createdFrom: 'bulk-map-vendors'
              });
              createdVendors.push(normalizedVendorName);
              allVendors.push(matchingVendor); // Add to cache for subsequent lookups
              console.log(`[bulkMapVendors] Created new vendor: ${normalizedVendorName} for SKU ${itemSku}`);
            } catch (error) {
              console.error(`[bulkMapVendors] Error creating vendor ${normalizedVendorName}:`, error.message);
            }
          }
        } else {
          // Vendor exists, ensure SKU mapping
          await ensureSkuMapping(matchingVendor, itemSku, true);
        }
      }
      
      if (matchingVendor) {
        item.vendor = matchingVendor._id;
        orderUpdated = true;
        updateCount++;
        console.log(`[bulkMapVendors] Mapped SKU ${itemSku} to vendor "${matchingVendor.name}"`);
      } else {
        skippedCount++;
        if (!notFoundSkus.includes(itemSku)) {
          notFoundSkus.push(itemSku);
        }
        console.warn(`[bulkMapVendors] No vendor found in Google Sheets for SKU ${itemSku}`);
      }
    }
    
    if (orderUpdated) {
      await order.save();
    }
  }
  
  // Recheck for unfilled vendors (items that still don't have vendors)
  let recheckCount = 0;
  if (notFoundSkus.length > 0) {
    console.log(`[bulkMapVendors] Rechecking ${notFoundSkus.length} SKUs that were not found initially...`);
    
    // Fetch fresh data again for recheck
    clearCaches();
    const freshPackSkuData = await getPackSkuData();
    const freshVendorSuggestions = freshPackSkuData.vendorSuggestions || {};
    const freshPackSkuMap = freshPackSkuData.packSkuMap || {};
    
    // Get fresh vendor list
    const freshAllVendors = await Vendor.find({});
    
    // Recheck orders for items without vendors
    for (const order of orders) {
      let orderUpdated = false;
      
      for (const item of order.items) {
        if (item.vendor) continue; // Skip if already has vendor
        
        const itemSku = String(item.sku || '').trim().toUpperCase();
        if (!itemSku) continue;
        
        let matchingVendor = null;
        let vendorNameFromSheet = null;
        
        // Try to get vendor name from fresh Google Sheets data
        const normalizedSku = normalizeSku(itemSku);
        vendorNameFromSheet = freshVendorSuggestions?.[normalizedSku] || freshPackSkuMap?.[normalizedSku]?.vendorName;
        vendorNameFromSheet = vendorNameFromSheet ? String(vendorNameFromSheet).trim() : null;
        
        // Try individual SKUs for pack/combo
        if (!vendorNameFromSheet && (itemSku.startsWith('P') || itemSku.startsWith('C'))) {
          try {
            const individualSkus = await getIndividualSkusForPackCombo(itemSku);
            if (Array.isArray(individualSkus) && individualSkus.length > 0) {
              for (const individualSku of individualSkus) {
                const normalizedIndividualSku = normalizeSku(individualSku);
                vendorNameFromSheet = freshVendorSuggestions?.[normalizedIndividualSku] || freshPackSkuMap?.[normalizedIndividualSku]?.vendorName;
                vendorNameFromSheet = vendorNameFromSheet ? String(vendorNameFromSheet).trim() : null;
                if (vendorNameFromSheet) break;
              }
            }
          } catch (error) {
            // Ignore errors in recheck
          }
        }
        
        if (vendorNameFromSheet) {
          const normalizedName = normalizeVendorName(vendorNameFromSheet);
          if (normalizedName) {
            const regex = new RegExp(`^${escapeRegExp(normalizedName)}$`, 'i');
            matchingVendor = freshAllVendors.find(v => regex.test(v.name));
            
            if (!matchingVendor) {
              try {
                matchingVendor = await Vendor.create({
                  name: normalizedName,
                  skuMappings: [{ sku: normalizeSku(itemSku) }],
                  createdFrom: 'bulk-map-vendors-recheck'
                });
                createdVendors.push(normalizedName);
                freshAllVendors.push(matchingVendor);
                console.log(`[bulkMapVendors] Created vendor on recheck: ${normalizedName} for SKU ${itemSku}`);
              } catch (error) {
                console.error(`[bulkMapVendors] Error creating vendor on recheck:`, error.message);
              }
            } else {
              await ensureSkuMapping(matchingVendor, itemSku, true);
            }
          }
        }
        
        if (matchingVendor) {
          item.vendor = matchingVendor._id;
          orderUpdated = true;
          updateCount++;
          recheckCount++;
        }
      }
      
      if (orderUpdated) {
        await order.save();
      }
    }
  }
  
  const createdMsg = createdVendors.length > 0 ? ` Created ${createdVendors.length} new vendor(s): ${createdVendors.join(', ')}` : '';
  
  res.json({ 
    message: `Successfully mapped ${updateCount} items to vendors${recheckCount > 0 ? ` (${recheckCount} found on recheck)` : ''}.${createdMsg}`,
    mapped: updateCount,
    skipped: skippedCount - recheckCount,
    recheckFound: recheckCount,
    createdVendors: createdVendors
  });
});

// Helper function
function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// @desc    Update order item
// @route   PUT /api/orders/:orderId/items/:itemId
// @access  Public
const updateOrderItem = asyncHandler(async (req, res) => {
  const { orderId, itemId } = req.params;
  const { productName, quantity, costPrice } = req.body;

  // Find order
  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Find item
  const item = order.items.id(itemId);
  if (!item) {
    res.status(404);
    throw new Error('Item not found');
  }

  // Store original quantity for logging
  const originalQuantity = item.quantity;

  // Update item fields
  if (productName !== undefined) item.productName = productName;
  
  // Fix: Ensure quantity is always treated as absolute value, not relative
  if (quantity !== undefined && quantity !== null) {
    const parsedQuantity = parseInt(quantity, 10);
    if (isNaN(parsedQuantity) || parsedQuantity < 0) {
      res.status(400);
      throw new Error('Quantity must be a positive number');
    }
    item.quantity = parsedQuantity; // Store absolute quantity value
    console.log(`[updateOrderItem] Updated quantity for item ${itemId}: ${originalQuantity} -> ${parsedQuantity} (absolute value)`);
  }
  
  if (costPrice !== undefined) {
    // Ensure costPrice is a valid number
    const parsedPrice = parseFloat(costPrice);
    if (!isNaN(parsedPrice)) {
      item.costPrice = parsedPrice;
    }
  }

  await order.save();
  
  // If this is a Processed stage order, update ProcessedOrderHistory as well
  if (order.stage === 'Processed' && item.processedAt) {
    try {
      const ProcessedOrderHistory = require('../models/ProcessedOrderHistory');
      const Vendor = require('../models/Vendor');
      
      // Find matching history record
      const historyQuery = {
        orderId: order._id,
        itemSku: item.sku,
        processedAt: item.processedAt
      };
      
      // Get vendor name if available
      let vendorName = 'Unknown Vendor';
      if (item.vendor) {
        try {
          const vendorDoc = await Vendor.findById(item.vendor);
          if (vendorDoc) vendorName = vendorDoc.name;
        } catch (err) {
          console.error('[updateOrderItem] Error fetching vendor:', err);
        }
      }
      
      // Update the history record
      const updateData = {};
      if (productName !== undefined) updateData.productName = productName;
      if (quantity !== undefined) updateData.quantity = item.quantity;
      if (costPrice !== undefined) updateData.price = costPrice;
      
      const historyResult = await ProcessedOrderHistory.updateOne(historyQuery, {
        $set: {
          ...updateData,
          vendorName: vendorName,
          variantName: item.variantName || '',
          warehouse: item.warehouse || 'Okhla',
          updatedAt: new Date()
        }
      });
      
      console.log(`[updateOrderItem] Updated ProcessedOrderHistory: matched ${historyResult.matchedCount}, modified ${historyResult.modifiedCount}`);
    } catch (err) {
      console.error('[updateOrderItem] Failed to update ProcessedOrderHistory:', err.message);
      // Don't fail the request if history update fails
    }
  }
  
  res.json(order);
});

// @desc    Complete order item (mark item as received)
// @route   PUT /api/orders/:orderId/items/:itemId/complete
// @access  Public
const completeOrderItem = asyncHandler(async (req, res) => {
  const { orderId, itemId } = req.params;
  const { receivedQty } = req.body;

  // Validate receivedQty
  if (receivedQty === undefined || receivedQty <= 0) {
    res.status(400);
    throw new Error('Received quantity must be greater than zero');
  }

  // Find order
  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Find item
  const item = order.items.id(itemId);
  if (!item) {
    res.status(404);
    throw new Error('Item not found');
  }

  // Get current item quantity
  const currentQty = item.quantity || 1;

  // If received quantity equals expected quantity, complete the item
  if (parseInt(receivedQty) === parseInt(currentQty)) {
    // Create a new order for the completed item only
    const completedOrder = new Order({
      orderName: `${order.orderName}-${item.sku}-completed`,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      stage: 'Completed',
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: 'Fulfilled',
      items: [{
        sku: item.sku,
        productName: item.productName,
        variantName: item.variantName,
        quantity: receivedQty,
        warehouse: item.warehouse,
        vendor: item.vendor,
        costPrice: item.costPrice,
        gst: item.gst
      }],
      history: [
        ...order.history || [],
        {
          stage: 'Completed',
          timestamp: new Date(),
          comment: `Item ${item.sku} completed with quantity ${receivedQty}`
        }
      ]
    });

    // Save the new completed order
    await completedOrder.save();

    // Remove the item from the original order
    order.items.pull(itemId);

    // If no items left in the order, delete it
    if (order.items.length === 0) {
      await Order.findByIdAndDelete(orderId);
      res.json({ message: 'Item completed and order removed as all items are completed', completedOrder });
    } else {
      // Otherwise save the original order with the item removed
      await order.save();
      res.json({ 
        message: 'Item completed and moved to Completed stage', 
        originalOrder: order,
        completedOrder
      });
    }
  } else {
    // For partial completion, just update the history
    // In a real application, you might want to handle partial fulfillment
    order.history.push({
      stage: order.stage,
      timestamp: new Date(),
      comment: `Partially received item ${item.sku}: ${receivedQty} of ${currentQty}`
    });

    await order.save();
    res.json({ 
      message: 'Item partially received', 
      order
    });
  }
});

// @desc    Fetch orders from all configured Shopify stores
// @route   POST /api/orders/fetch-all-shopify
// @access  Public
const fetchAllShopifyOrders = asyncHandler(async (req, res) => {
  const storeIds = Object.keys(shopifyStores);
  
  if (storeIds.length === 0) {
    res.status(400);
    throw new Error('No Shopify stores configured. Please check your environment variables.');
  }

  const results = [];
  const errors = [];

  // Process each configured store
  for (const storeId of storeIds) {
    try {
      console.log(`Processing Shopify store: ${storeId}`);
      const shopify = shopifyStores[storeId];
      
      // Reusing the retry logic
      const fetchWithRetry = async (options, retries = 3, delay = 1000) => {
        try {
          return await shopify.order.list(options);
        } catch (error) {
          if (retries <= 0) throw error;
          
          console.log(`Shopify API error for ${storeId}, retrying in ${delay/1000} seconds...`, error.message);
          await new Promise(resolve => setTimeout(resolve, delay));
          return fetchWithRetry(options, retries - 1, delay * 2);
        }
      };

      // Fetch orders with pagination
      let params = { 
        limit: 100,
        status: 'open',
        fields: 'id,name,email,customer,line_items,financial_status,fulfillment_status,created_at,variant_title'
      };
      
      // First page of orders
      console.log(`Fetching first page of orders from ${storeId}...`);
      let shopifyOrders = await fetchWithRetry(params);
      
      // Keep track of all orders
      let allOrders = [...shopifyOrders];
      
      // If there are more orders, fetch them using pagination
      let hasNextPage = shopifyOrders.length === 100;
      let pageCount = 1;
      
      while (hasNextPage) {
        pageCount++;
        console.log(`Fetching page ${pageCount} of orders from ${storeId}...`);
        
        // Get the ID of the last order in the current page
        const lastOrder = shopifyOrders[shopifyOrders.length - 1];
        
        // Fetch the next page using the 'since_id' parameter
        params.since_id = lastOrder.id;
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Fetch the next page
        shopifyOrders = await fetchWithRetry(params);
        
        // Add to our collection
        allOrders = [...allOrders, ...shopifyOrders];
        
        // Check if there are more pages
        hasNextPage = shopifyOrders.length === 100;
        
        // Continue fetching until all orders are retrieved
        // No artificial limit - fetch all available orders
      }
      
      console.log(`Fetched a total of ${allOrders.length} orders from ${storeId} across ${pageCount} pages.`);
      
      // Process each order
      const processedOrders = [];
      const failedOrders = [];
      
      for (const shopifyOrder of allOrders) {
        try {
          // Check if order already exists
          const existingOrder = await Order.findOne({ 
            shopifyOrderId: shopifyOrder.id.toString(),
            shopifyStoreId: storeId
          });
          
          if (!existingOrder) {
            // Standardize payment status to match our enum values
            let paymentStatus = shopifyOrder.financial_status || 'Unknown';
            
            // Handle various payment status formats from Shopify
            if (paymentStatus === 'partially_paid') {
              paymentStatus = 'Partially_paid';
            } else {
              paymentStatus = capitalizeFirst(paymentStatus);
            }
            
            const newOrder = {
              shopifyOrderId: shopifyOrder.id.toString(),
              shopifyStoreId: storeId,
              shopifyOrderName: shopifyOrder.name,
              orderName: shopifyOrder.name,
              customerName: shopifyOrder.customer ? `${shopifyOrder.customer.first_name} ${shopifyOrder.customer.last_name}` : 'Guest',
              customerEmail: shopifyOrder.email || 'No email',
              paymentStatus: paymentStatus,
              fulfillmentStatus: capitalizeFirst(shopifyOrder.fulfillment_status || 'Unfulfilled'),
              stage: 'Initial',
              shopifyCreatedAt: new Date(shopifyOrder.created_at),
              createdAt: new Date(shopifyOrder.created_at), // Use Shopify's order creation date
              items: shopifyOrder.line_items.map(item => {
                return {
                  productName: item.title,
                  variantName: item.variant_title || '',
                  sku: item.sku || 'No SKU',
                  quantity: item.quantity,
                  price: item.price
                };
              })
            };
            
            // Create new order in our database
            const createdOrder = await Order.create(newOrder);
            processedOrders.push(createdOrder);
          }
        } catch (itemError) {
          console.error(`Error processing order ${shopifyOrder.id} from store ${storeId}:`, itemError);
          // Track failed orders
          failedOrders.push({
            id: shopifyOrder.id,
            name: shopifyOrder.name,
            error: itemError.message
          });
          // Continue processing other orders
          continue;
        }
      }
      
      // Log summary of failed orders if any
      if (failedOrders.length > 0) {
        console.log(`Failed to process ${failedOrders.length} orders from store ${storeId}. See logs for details.`);
      }
      
      // Add results for this store
      results.push({
        storeId,
        processed: processedOrders.length,
        total: allOrders.length,
        failed: failedOrders.length
      });
      
    } catch (storeError) {
      console.error(`Error processing store ${storeId}:`, storeError);
      errors.push({
        storeId,
        error: storeError.message
      });
      // Continue with the next store
    }
  }

  res.status(200).json({
    message: `Processed orders from ${results.length} Shopify stores`,
    results,
    errors: errors.length > 0 ? errors : undefined
  });
});

// @desc    Get pack SKU data from Google Sheets
// @route   GET /api/orders/pack-sku-data
// @access  Public
const getPackSkuDataEndpoint = asyncHandler(async (req, res) => {
  try {
    const packSkuData = await getPackSkuData();
    const packSkuMap = packSkuData.packSkuMap || packSkuData || {};
    res.json({
      success: true,
      count: Object.keys(packSkuMap).length,
      data: packSkuData
    });
  } catch (error) {
    console.error('Error fetching pack SKU data:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching pack SKU data from Google Sheets', 
      error: error.message 
    });
  }
});

// @desc    Refresh fulfillment/payment status for specific orders from Shopify
// @route   POST /api/orders/refresh-fulfillment
// @access  Public
const refreshFulfillmentStatus = asyncHandler(async (req, res) => {
  const { orderIds } = req.body || {};

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    res.status(400);
    throw new Error('orderIds array is required');
  }

  const uniqueOrderIds = Array.from(
    new Set(
      orderIds
        .map((id) => (typeof id === 'string' || typeof id === 'number') ? id.toString() : null)
        .filter(Boolean)
    )
  );

  const results = [];
  
  // Rate limiting: Process orders in batches with delays to avoid 429 errors
  const BATCH_SIZE = 5; // Process 5 orders at a time
  const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds between batches
  const DELAY_BETWEEN_REQUESTS = 500; // 500ms between individual requests

  for (let i = 0; i < uniqueOrderIds.length; i++) {
    const orderId = uniqueOrderIds[i];
    const result = { orderId };
    
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        result.status = 'not_found';
        result.message = 'Order not found';
        results.push(result);
        continue;
      }

      if (!order.shopifyOrderId) {
        result.status = 'skipped';
        result.message = 'Order not linked to Shopify';
        results.push(result);
        continue;
      }

      const storeId = order.shopifyStoreId || process.env.SHOPIFY_DEFAULT_STORE || 'store1';
      const shopify = shopifyStores[storeId];

      if (!shopify) {
        result.status = 'skipped';
        result.message = `Shopify store ${storeId} not configured`;
        results.push(result);
        continue;
      }

      const shopifyOrderId = Number(order.shopifyOrderId);
      if (Number.isNaN(shopifyOrderId)) {
        result.status = 'skipped';
        result.message = 'Invalid Shopify order ID';
        results.push(result);
        continue;
      }

      // Add delay between requests to avoid rate limiting
      if (i > 0 && i % BATCH_SIZE !== 0) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
      } else if (i > 0 && i % BATCH_SIZE === 0) {
        // Longer delay between batches
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }

      const remoteOrder = await shopify.order.get(shopifyOrderId);
      const fulfillmentStatus = capitalizeFirst(remoteOrder.fulfillment_status || 'Unfulfilled');
      let paymentStatus = remoteOrder.financial_status || order.paymentStatus || 'Pending';
      if (paymentStatus === 'partially_paid') {
        paymentStatus = 'Partially_paid';
      } else {
        paymentStatus = capitalizeFirst(paymentStatus);
      }

      order.fulfillmentStatus = fulfillmentStatus;
      order.paymentStatus = paymentStatus;
      await order.save();

      result.status = 'updated';
      result.fulfillmentStatus = fulfillmentStatus;
      result.paymentStatus = paymentStatus;
      result.orderName = order.orderName || order.shopifyOrderName;
    } catch (error) {
      // Handle rate limiting errors gracefully
      if (error.message && error.message.includes('429')) {
        console.error(`[Rate Limited] Failed to refresh fulfillment for order ${orderId} (${order?.orderName || orderId}): Rate limit exceeded. Will retry later.`);
        result.status = 'rate_limited';
        result.message = 'Rate limit exceeded - will retry later';
      } else {
        console.error(`Failed to refresh fulfillment for order ${orderId} (${order?.orderName || orderId}):`, error.message || error);
        result.status = 'failed';
        result.message = error.message || 'Unknown Shopify error';
      }
    }

    results.push(result);
  }

  const updatedCount = results.filter((r) => r.status === 'updated').length;

  res.json({
    success: true,
    updated: updatedCount,
    total: results.length,
    results
  });
});

// @desc    Get pack quantity for a specific SKU
// @route   GET /api/orders/pack-qty/:sku
// @access  Public
const getPackSkuQuantityEndpoint = asyncHandler(async (req, res) => {
  const { sku } = req.params;
  console.log(`[pack-qty] Request for SKU: ${sku}, URL: ${req.url}, Path: ${req.path}`);
  
  if (!sku) {
    console.log('[pack-qty] Missing SKU parameter');
    return res.status(400).json({ success: false, message: 'SKU is required' });
  }
  
  // Decode URL-encoded SKU
  let decodedSku;
  try {
    decodedSku = decodeURIComponent(sku);
  } catch (decodeError) {
    decodedSku = sku; // Use original if decode fails
  }
  console.log(`[pack-qty] Decoded SKU: ${decodedSku}`);
  
  try {
    const qty = await getPackSkuQuantity(decodedSku);
    console.log(`[pack-qty] Found quantity ${qty} for SKU ${decodedSku}`);
    return res.json({ success: true, sku: decodedSku, qty: qty || 0 });
  } catch (error) {
    console.error(`[pack-qty] Error fetching pack qty for SKU ${decodedSku}:`, error);
    // Return 0 instead of error to prevent frontend issues
    return res.json({ success: true, sku: decodedSku, qty: 0 });
  }
});

// @desc    Clear Google Sheets cache
// @route   POST /api/orders/clear-cache
// @access  Public
const clearCacheEndpoint = asyncHandler(async (req, res) => {
  try {
    const { clearCaches } = require('../services/googleSheets');
    clearCaches();
    res.json({ success: true, message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ success: false, message: 'Failed to clear cache', error: error.message });
  }
});

// @desc    Update pack SKU data in Google Sheets
// @route   PUT /api/orders/pack-sku-data
// @access  Public
const updatePackSkuDataEndpoint = asyncHandler(async (req, res) => {
  try {
    const { sku, field, value } = req.body;
    
    if (!sku || !field || value === undefined) {
      return res.status(400).json({
        success: false,
        message: 'SKU, field, and value are required'
      });
    }
    
    await updatePackSkuData(sku, field, value);
    
    res.json({
      success: true,
      message: `Updated ${field} for SKU ${sku}`
    });
  } catch (error) {
    console.error('Error updating pack SKU data:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating pack SKU data',
      error: error.message
    });
  }
});

// @desc    Update inventory data in Google Sheets
// @route   PUT /api/orders/inventory-data
// @access  Public
const updateInventoryDataEndpoint = asyncHandler(async (req, res) => {
  try {
    const { sku, location, field, value } = req.body;
    
    if (!sku || !location || !field || value === undefined) {
      return res.status(400).json({
        success: false,
        message: 'SKU, location, field, and value are required'
      });
    }
    
    await updateInventoryData(sku, location, field, value);
    
    res.json({
      success: true,
      message: `Updated ${field} for SKU ${sku} in ${location}`
    });
  } catch (error) {
    console.error('Error updating inventory data:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating inventory data',
      error: error.message
    });
  }
});

// @desc    Auto assign vendors to all unassigned items by SKU
// @route   POST /api/orders/auto-assign-vendors
// @access  Public
const autoAssignVendors = asyncHandler(async (req, res) => {
  try {
    const packSkuData = await getPackSkuData();
    
    // Find all orders in Initial stage
    const orders = await Order.find({ stage: 'Initial' });
    
    let assignedCount = 0;
    let skippedCount = 0;
    
    for (const order of orders) {
      let orderModified = false;
      
      for (const item of order.items) {
        // Skip if already has vendor
        if (item.vendor) {
          skippedCount++;
          continue;
        }
        
        if (!item.sku) {
          skippedCount++;
          continue;
        }
        
        const normalizedSku = normalizeSku(item.sku);
        const candidateSkus = await buildSkuCandidateList({
          primarySku: item.sku,
          singleProductSku: item.singleProductSku,
          itemType: item.itemType,
          individualSkus: [] // Will be fetched automatically if pack/combo
        }, packSkuData);

        const { suggestions } = getVendorSuggestionsFromSheets(candidateSkus, packSkuData);

        let vendor = null;
        if (suggestions.length > 0) {
          const vendorName = suggestions[0];
          vendor = await findOrCreateVendorByName({
            rawName: vendorName,
            sku: item.sku,
            createdFrom: 'auto-assign',
            forceCreate: true,
            respectSettings: false
          });
        }

        // Fallback: look at product's linked vendor if sheet suggestion failed
        if (!vendor) {
          const product = await Product.findOne({ sku: item.sku }).populate('vendor');
          if (product && product.vendor) {
            vendor = await findOrCreateVendorByName({
              rawName: product.vendor.name,
              sku: item.sku,
              createdFrom: 'product-auto-assign',
              forceCreate: false,
              respectSettings: true
            }) || product.vendor;
          }
        }

        if (vendor) {
          item.vendor = vendor._id;
          item.autoDetectedVendor = vendor.name;
          if (suggestions.length > 0) {
            item.vendorSuggestions = suggestions;
            item.suggestedVendors = suggestions;
          }
          orderModified = true;
          assignedCount++;
        } else {
          if (suggestions.length > 0) {
            item.vendorSuggestions = suggestions;
            item.suggestedVendors = suggestions;
            item.autoDetectedVendor = suggestions[0];
            orderModified = true;
          }
          skippedCount++;
        }
      }
      
      if (orderModified) {
        await order.save();
      }
    }
    
    res.json({
      success: true,
      message: `Auto-assigned vendors to ${assignedCount} items`,
      assigned: assignedCount,
      skipped: skippedCount
    });
  } catch (error) {
    console.error('Error auto-assigning vendors:', error);
    res.status(500).json({
      success: false,
      message: 'Error auto-assigning vendors',
      error: error.message
    });
  }
});

// @desc    Accept suggested vendor for an order item
// @route   POST /api/orders/:orderId/items/:itemId/accept-vendor
// @access  Public
const acceptSuggestedVendor = asyncHandler(async (req, res) => {
  const { orderId, itemId } = req.params;
  const { vendorName } = req.body;

  if (!vendorName) {
    res.status(400);
    throw new Error('Vendor name is required');
  }

  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  const item = order.items.id(itemId);
  if (!item) {
    res.status(404);
    throw new Error('Item not found');
  }

  const vendor = await findOrCreateVendorByName({
    rawName: vendorName,
    sku: item.sku,
    createdFrom: 'manual-accept',
    forceCreate: true,
    respectSettings: false
  });

  if (vendor) {
    item.vendor = vendor._id;
    await order.save();
    
    const updatedOrder = await Order.findById(orderId).populate('items.vendor');
    res.json(updatedOrder);
  } else {
    // If we couldn't create a vendor due to settings
    res.status(400).json({
      success: false,
      message: 'Cannot create vendor: Auto-create vendors is disabled in settings'
    });
  }
});

// @desc    Accept all suggested vendors for Initial stage orders
// @route   POST /api/orders/accept-all-suggestions
// @access  Public
const acceptAllSuggestions = asyncHandler(async (req, res) => {
  try {
    const settings = await Settings.findOne() || { vendor: { requireApproval: false } };
    if (settings.vendor.requireApproval) {
      return res.status(400).json({
        success: false,
        message: 'Cannot accept all suggestions: Vendor approval is required in settings'
      });
    }

    const packSkuData = await getPackSkuData();
    
    // Find all orders in Initial stage with autoDetectedVendor
    const orders = await Order.find({ stage: 'Initial' });
    
    let acceptedCount = 0;
    let skippedCount = 0;
    let createdVendors = [];
    
    for (const order of orders) {
      let orderModified = false;
      
      for (const item of order.items) {
        // Skip if already has vendor
        if (item.vendor) {
          skippedCount++;
          continue;
        }
        
        // Skip if no auto-detected vendor
        if (!item.autoDetectedVendor) {
          const candidateSkus = await buildSkuCandidateList({
            primarySku: item.sku,
            singleProductSku: item.singleProductSku,
            itemType: item.itemType,
            individualSkus: [] // Will be fetched automatically if pack/combo
          }, packSkuData);
          const { suggestions } = getVendorSuggestionsFromSheets(candidateSkus, packSkuData);
          if (suggestions.length > 0) {
            item.autoDetectedVendor = suggestions[0];
            item.vendorSuggestions = suggestions;
            orderModified = true;
          } else {
            skippedCount++;
            continue;
          }
        }
        
        const vendorName = item.autoDetectedVendor;
        const vendor = await findOrCreateVendorByName({
          rawName: vendorName,
          sku: item.sku,
          createdFrom: 'bulk-suggestion',
          forceCreate: true,
          respectSettings: false
        });
        if (!vendor) {
          skippedCount++;
          continue;
        }

        item.vendor = vendor._id;
        orderModified = true;
        acceptedCount++;
        if (vendor.__wasCreated && !createdVendors.includes(vendor.name)) {
          createdVendors.push(vendor.name);
        }
      }
      
      if (orderModified) {
        await order.save();
      }
    }
    
    res.json({
      success: true,
      message: `Accepted ${acceptedCount} vendor suggestions`,
      accepted: acceptedCount,
      skipped: skippedCount,
      createdVendors: createdVendors.length > 0 ? createdVendors : undefined
    });
  } catch (error) {
    console.error('Error accepting all suggestions:', error);
    res.status(500).json({
      success: false,
      message: 'Error accepting all suggestions',
      error: error.message
    });
  }
});

// @desc    Update order
// @route   PUT /api/orders/:id
// @access  Public
const updateOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  const order = await Order.findById(id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Update order fields
  const allowedFields = [
    'orderName', 'customerName', 'customerEmail', 'customerPhone',
    'orderStatus', 'paymentStatus', 'fulfillmentStatus',
    'shippingAddress', 'billingAddress', 'items'
  ];

  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      // For items array, allow editing in certain stages
      if (field === 'items') {
    // Allow editing items in Processed, In-Stock, or Hold stages
    if (['Processed', 'In-Stock', 'Hold'].includes(order.stage)) {
          // Update specific fields for each item
          for (let index = 0; index < order.items.length; index++) {
            const item = order.items[index];
            if (updateData.items[index]) {
              // Allow updating productName and quantity for these stages
              if (updateData.items[index].productName) {
                item.productName = updateData.items[index].productName;
              }
              if (updateData.items[index].quantity) {
                item.quantity = updateData.items[index].quantity;
              }
              // Allow updating price only for Processed stage (before fulfillment)
              if (updateData.items[index].price && order.stage === 'Processed') {
                item.price = updateData.items[index].price;
              }
              // Sync quantity changes to ProcessedOrderHistory when in Processed stage
              if (order.stage === 'Processed' && typeof updateData.items[index].quantity === 'number') {
                try {
                  const ProcessedOrderHistory = require('../models/ProcessedOrderHistory');
                  const v = item.vendor?._id?.toString() || item.vendor?.toString() || item.vendor;
                  await ProcessedOrderHistory.updateMany(
                    { orderId: order._id, itemSku: item.sku, vendorId: v },
                    { $set: { quantity: updateData.items[index].quantity } }
                  );
                } catch {}
              }
            }
          }
        } else if (order.stage === 'Initial') {
          // For Initial stage, allow updating vendor as well
          order.items.forEach((item, index) => {
            if (updateData.items[index]) {
              if (updateData.items[index].productName) {
                item.productName = updateData.items[index].productName;
              }
              if (updateData.items[index].quantity) {
                item.quantity = updateData.items[index].quantity;
              }
              if (updateData.items[index].vendor) {
                item.vendor = updateData.items[index].vendor;
              }
              if (updateData.items[index].price) {
                item.price = updateData.items[index].price;
              }
            }
          });
        } else {
          // For other stages (Completed, etc.), treat items as read-only or log a warning
          console.warn(`Attempted to update items for order in ${order.stage} stage - update skipped`);
        }
      } else {
        order[field] = updateData[field];
      }
    }
  }

  // Auto-move to Fulfilled stage if fulfillmentStatus is set to "Fulfilled"
  if (updateData.fulfillmentStatus === 'Fulfilled' && order.fulfillmentStatus !== 'Fulfilled') {
    const oldStage = order.stage;
    order.stage = 'Fulfilled';
    if (!order.history) order.history = [];
    order.history.push({
      stage: 'Fulfilled',
      timestamp: new Date(),
      comment: `Order marked as Fulfilled and moved from ${oldStage} to Fulfilled stage`
    });
  }

  // Add history entry for the edit
  if (!order.history) order.history = [];
  order.history.push({
    stage: order.stage,
    timestamp: new Date(),
    comment: `Order edited: ${Object.keys(updateData).join(', ')}`
  });

  await order.save();
  res.json(order);
});

// @desc    Get SKU transaction history for past 5 transactions
// @route   GET /api/orders/sku-history/:sku
// @access  Public
const getSkuTransactionHistory = asyncHandler(async (req, res) => {
  const { sku } = req.params;
  
  try {
    const InventoryTransaction = require('../models/InventoryTransaction');
    
    // Get past 5 transactions for this SKU
    const transactions = await InventoryTransaction.find({
      'items.sku': new RegExp(`^${sku}$`, 'i')
    })
      .populate('items.orderId', 'orderName shopifyOrderId stage')
      .populate('items.vendor', 'name')
      .sort({ transactionDate: -1 })
      .limit(5);

    // Extract relevant data
    const history = [];
    transactions.forEach(trans => {
      const item = trans.items.find(i => i.sku.toUpperCase() === sku.toUpperCase());
      if (item) {
        history.push({
          transactionDate: trans.transactionDate,
          transactionType: trans.transactionType,
          location: trans.location,
          quantity: item.quantity,
          vendorName: item.vendorName || (item.vendor ? item.vendor.name : 'No Vendor'),
          orderName: item.orderName,
          shopifyOrderId: item.shopifyOrderId,
          syncedToSheets: trans.syncedToSheets
        });
      }
    });

    res.json({
      success: true,
      sku,
      history
    });
  } catch (error) {
    console.error('Error fetching SKU transaction history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SKU transaction history',
      error: error.message
    });
  }
});

// @desc    Get processing history for a specific order (or vendors associated with order)
// @route   GET /api/orders/:orderId/processing-history
// @access  Public
const getOrderProcessingHistory = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const limit = parseInt(req.query.limit) || 10;
  const includeVendors = req.query.includeVendors === 'true'; // If true, show history for all vendors in order
  
  try {
    let history;
    
    if (includeVendors) {
      // Get order to find associated vendors
      const order = await Order.findById(orderId).populate('items.vendor');
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }
      
      // Get all vendor IDs from order items
      const vendorIds = order.items
        .filter(item => item.vendor)
        .map(item => item.vendor._id || item.vendor);
      
      if (vendorIds.length === 0) {
        return res.json({
          success: true,
          count: 0,
          history: []
        });
      }
      
      // Fetch history for all vendors in this order
      history = await ProcessedOrderHistory.find({
        vendorId: { $in: vendorIds }
      })
        .sort({ processedAt: -1 })
        .limit(limit)
        .populate('vendorId', 'name')
        .populate('orderId', 'orderName shopifyOrderId')
        .lean();
    } else {
      // Fetch history for this specific order only
      history = await ProcessedOrderHistory.find({ orderId })
        .sort({ processedAt: -1 })
        .limit(limit)
        .populate('vendorId', 'name')
        .populate('orderId', 'orderName shopifyOrderId')
        .lean();
    }
    
    res.json({
      success: true,
      count: history.length,
      history: history
    });
  } catch (error) {
    console.error('Error fetching order processing history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch processing history',
      error: error.message
    });
  }
});

// @desc    Get processing history for a specific SKU
// @route   GET /api/orders/sku-processing-history/:sku
// @access  Public
const getSkuProcessingHistory = asyncHandler(async (req, res) => {
  const { sku } = req.params;
  const limit = parseInt(req.query.limit) || 10;
  
  try {
    // Decode SKU in case it's URL encoded
    const decodedSku = decodeURIComponent(sku);
    
    const history = await ProcessedOrderHistory.find({ itemSku: decodedSku })
      .sort({ processedAt: -1 })
      .limit(limit)
      .populate('vendorId', 'name')
      .populate('orderId', 'orderName shopifyOrderId')
      .lean();
    
    // If price is missing for any record, try to fetch it from Shopify
    const historyWithPrices = await Promise.all(history.map(async (record) => {
      if (!record.price || record.price === null) {
        try {
          const price = await fetchProductPriceBySku(record.itemSku);
          if (price !== null) {
            // Update the record in database for future use
            await ProcessedOrderHistory.findByIdAndUpdate(record._id, { price });
            record.price = price;
          }
        } catch (error) {
          console.error(`Error fetching price for SKU ${record.itemSku}:`, error);
        }
      }
      return record;
    }));
    
    res.json({
      success: true,
      count: historyWithPrices.length,
      history: historyWithPrices
    });
  } catch (error) {
    console.error('Error fetching SKU processing history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SKU processing history',
      error: error.message
    });
  }
});

// @desc    Get processing history for a specific vendor
// @route   GET /api/orders/vendor-processing-history/:vendorId
// @access  Public
const getVendorProcessingHistory = asyncHandler(async (req, res) => {
  const { vendorId } = req.params;
  const limit = parseInt(req.query.limit) || 10;
  
  try {
    const history = await ProcessedOrderHistory.find({ vendorId })
      .sort({ processedAt: -1 })
      .limit(limit)
      .populate('vendorId', 'name')
      .populate('orderId', 'orderName shopifyOrderId')
      .lean();
    
    res.json({
      success: true,
      count: history.length,
      history: history
    });
  } catch (error) {
    console.error('Error fetching vendor processing history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor processing history',
      error: error.message
    });
  }
});

// @desc    Cleanup old processing history records (older than 150 days)
// @route   POST /api/orders/cleanup-old-history
// @access  Public
// SAFETY: This endpoint ONLY deletes ProcessedOrderHistory records
// It does NOT touch Orders, Vendors, Products, or any other collection
const cleanupOldHistory = asyncHandler(async (req, res) => {
  try {
    // Use the cleanup service which ensures only ProcessedOrderHistory is affected
    const { cleanupOldHistory: cleanupService } = require('../services/historyCleanupService');
    const result = await cleanupService();
    
    if (result.success) {
      res.json({
        success: true,
        message: `Successfully deleted ${result.deletedCount} ProcessedOrderHistory records (only processing history, no other data affected)`,
        deletedCount: result.deletedCount,
        cutoffDate: result.cutoffDate,
        collection: 'ProcessedOrderHistory' // Explicit confirmation
      });
    } else {
      throw new Error(result.error || 'Cleanup failed');
    }
  } catch (error) {
    console.error('Error cleaning up ProcessedOrderHistory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup ProcessedOrderHistory (no other data affected)',
      error: error.message
    });
  }
});

// @desc    Delete an order
// @route   DELETE /api/orders/:id
// @access  Public
const deleteOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  console.log(`[deleteOrder] Attempting to delete order ${id}`);
  
  const order = await Order.findById(id);
  
  if (!order) {
    console.error(`[deleteOrder] Order ${id} not found`);
    res.status(404);
    throw new Error('Order not found');
  }
  
  console.log(`[deleteOrder] Deleting order ${order.orderName} (stage: ${order.stage})`);
  
  await Order.findByIdAndDelete(id);
  
  console.log(`[deleteOrder] Successfully deleted order ${id}`);
  
  res.json({ 
    success: true,
    message: `Order ${order.orderName} deleted successfully` 
  });
});

// @desc    Clear all Processed orders - Export to Excel, email, then move to Pending
// @route   POST /api/orders/processed/clear-all
// @access  Public
const clearAllProcessedOrders = asyncHandler(async (req, res) => {
  console.log('[clearAllProcessedOrders] Starting process to clear all processed orders');
  
  // Step 1: Build query with date filters if provided
  const { startDate, endDate, startTime, endTime } = req.body || {};
  
  let query = { stage: 'Processed' };
  
  // Apply date filters if provided
  if (startDate || endDate) {
    const start = new Date(startDate || endDate);
    const end = new Date(endDate || startDate);
    
    // Set time if provided
    if (startTime) {
      const [hours, minutes] = startTime.split(':');
      start.setHours(parseInt(hours) || 0, parseInt(minutes) || 0, 0, 0);
    } else {
      start.setHours(0, 0, 0, 0);
    }
    
    if (endTime) {
      const [hours, minutes] = endTime.split(':');
      end.setHours(parseInt(hours) || 23, parseInt(minutes) || 59, 59, 999);
    } else {
      end.setHours(23, 59, 59, 999);
    }
    
    query.createdAt = {
      $gte: start,
      $lte: end
    };
    
    console.log(`[clearAllProcessedOrders] Applying date filter: ${start.toISOString()} to ${end.toISOString()}`);
  }
  
  // Step 1: Fetch processed orders (with date filter if applied)
  const processedOrders = await Order.find(query)
    .populate('items.vendor', 'name')
    .lean();
  
  console.log(`[clearAllProcessedOrders] Found ${processedOrders.length} processed orders${startDate || endDate ? ` (filtered by date)` : ''}`);
  
  if (processedOrders.length === 0) {
    return res.json({
      success: true,
      message: 'No processed orders to clear',
      ordersMoved: 0,
      emailSent: false
    });
  }
  
  // Step 2: Generate Excel export
  let excelBuffer = null;
  let emailSent = false;
  let emailError = null;
  
  try {
    excelBuffer = await exportProcessedOrdersToExcel(processedOrders, {
      startDate,
      endDate,
      startTime,
      endTime
    });
    console.log('[clearAllProcessedOrders] Excel export generated successfully');
  } catch (error) {
    console.error('[clearAllProcessedOrders] Error generating Excel export:', error);
    // Continue even if Excel generation fails
  }
  
  // Step 3: Send email with Excel attachment (if enabled and recipients configured)
  if (excelBuffer) {
    try {
      const settings = await Settings.findOne().lean();
      const emailConfig = settings?.email?.processedOrdersExport || {};
      
      if (emailConfig.enabled !== false && emailConfig.recipients && emailConfig.recipients.length > 0) {
        await sendProcessedOrdersEmail(excelBuffer, emailConfig.recipients, processedOrders.length);
        emailSent = true;
        console.log(`[clearAllProcessedOrders] Email sent successfully to ${emailConfig.recipients.length} recipient(s)`);
        
        // Log email activity to database
        try {
          await Activity.create({
            type: 'email_sent',
            title: 'Processed Orders Export Email Sent',
            description: `Automated email sent to ${emailConfig.recipients.join(', ')} with ${processedOrders.length} processed orders export`,
            metadata: {
              recipients: emailConfig.recipients,
              orderCount: processedOrders.length,
              startDate: startDate || null,
              endDate: endDate || null,
              startTime: startTime || null,
              endTime: endTime || null
            },
            isSystemGenerated: true,
            timestamp: new Date()
          });
          console.log('[clearAllProcessedOrders] Email activity logged to database');
        } catch (activityError) {
          console.error('[clearAllProcessedOrders] Error logging email activity:', activityError);
          // Don't fail the operation if activity logging fails
        }
        
        // Log processed orders export activity
        try {
          await Activity.create({
            type: 'processed_orders_exported',
            title: 'Processed Orders Exported and Moved',
            description: `Exported ${processedOrders.length} processed orders and moved them to Pending stage`,
            metadata: {
              orderCount: processedOrders.length,
              ordersMoved: processedOrders.length,
              startDate: startDate || null,
              endDate: endDate || null,
              startTime: startTime || null,
              endTime: endTime || null,
              emailSent: true,
              recipients: emailConfig.recipients
            },
            isSystemGenerated: true,
            timestamp: new Date()
          });
          console.log('[clearAllProcessedOrders] Export activity logged to database');
        } catch (activityError) {
          console.error('[clearAllProcessedOrders] Error logging export activity:', activityError);
          // Don't fail the operation if activity logging fails
        }
      } else {
        console.log('[clearAllProcessedOrders] Email not sent - disabled or no recipients configured');
        
        // Still log the export activity even if email wasn't sent
        try {
          await Activity.create({
            type: 'processed_orders_exported',
            title: 'Processed Orders Exported and Moved',
            description: `Exported ${processedOrders.length} processed orders and moved them to Pending stage (email not sent)`,
            metadata: {
              orderCount: processedOrders.length,
              ordersMoved: processedOrders.length,
              startDate: startDate || null,
              endDate: endDate || null,
              startTime: startTime || null,
              endTime: endTime || null,
              emailSent: false,
              emailReason: emailConfig.enabled === false ? 'Email disabled in settings' : 'No recipients configured'
            },
            isSystemGenerated: true,
            timestamp: new Date()
          });
          console.log('[clearAllProcessedOrders] Export activity logged to database (without email)');
        } catch (activityError) {
          console.error('[clearAllProcessedOrders] Error logging export activity:', activityError);
        }
      }
    } catch (error) {
      console.error('[clearAllProcessedOrders] Error sending email:', error);
      emailError = error.message;
      
      // Log failed email attempt
      try {
        await Activity.create({
          type: 'email_sent',
          title: 'Processed Orders Export Email Failed',
          description: `Failed to send automated email: ${error.message}`,
          metadata: {
            orderCount: processedOrders.length,
            error: error.message,
            startDate: startDate || null,
            endDate: endDate || null
          },
          isSystemGenerated: true,
          severity: 'high',
          timestamp: new Date()
        });
      } catch (activityError) {
        console.error('[clearAllProcessedOrders] Error logging failed email activity:', activityError);
      }
      
      // Continue even if email fails
    }
  }
  
  // Step 4: Generate consolidated export before moving (for download after move)
  let consolidatedExportBuffer = null;
  try {
    // Generate consolidated Excel export
    const XLSX = require('xlsx');
    const vendorSkuMap = {};
    
    processedOrders.forEach(order => {
      order.items.forEach(item => {
        if (item.vendor) {
          const vendorName = item.vendor.name || 'Unknown Vendor';
          const sku = item.sku;
          const key = `${vendorName}|${sku}`;
          
          if (!vendorSkuMap[key]) {
            vendorSkuMap[key] = {
              vendorName,
              sku,
              productName: item.productName || '',
              totalQuantity: 0,
              orders: []
            };
          }
          
          vendorSkuMap[key].totalQuantity += item.quantity || 0;
          vendorSkuMap[key].orders.push({
            orderName: order.orderName || order.shopifyOrderName,
            quantity: item.quantity,
            warehouse: item.warehouse || 'Okhla'
          });
        }
      });
    });
    
    const rows = Object.values(vendorSkuMap).map(item => ({
      vendorName: item.vendorName,
      sku: item.sku,
      productName: item.productName,
      totalQuantity: item.totalQuantity,
      orderCount: item.orders.length,
      orders: item.orders.map(o => o.orderName).join(', '),
      warehouses: [...new Set(item.orders.map(o => o.warehouse))].join(', ')
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Processed Orders');
    consolidatedExportBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    console.log('[clearAllProcessedOrders] Consolidated export generated successfully');
  } catch (error) {
    console.error('[clearAllProcessedOrders] Error generating consolidated export:', error);
    // Continue even if consolidated export fails
  }
  
  // Step 5: Move all processed orders to Pending stage
  const orderIds = processedOrders.map(o => o._id);
  const updateResult = await Order.updateMany(
    { _id: { $in: orderIds } },
    { 
      $set: { 
        stage: 'Pending',
        updatedAt: new Date()
      },
      $push: {
        history: {
          stage: 'Processed',
          timestamp: new Date(),
          comment: 'Moved to Pending - All processed orders cleared'
        }
      }
    }
  );
  
  console.log(`[clearAllProcessedOrders] Moved ${updateResult.modifiedCount} orders to Pending stage`);
  
  // Return consolidated export buffer as base64 for frontend download
  let consolidatedExportBase64 = null;
  if (consolidatedExportBuffer) {
    consolidatedExportBase64 = consolidatedExportBuffer.toString('base64');
  }
  
  res.json({
    success: true,
    message: `Successfully moved ${updateResult.modifiedCount} processed orders to Pending`,
    ordersMoved: updateResult.modifiedCount,
    emailSent: emailSent,
    emailError: emailError || undefined,
    excelGenerated: excelBuffer !== null,
    consolidatedExport: consolidatedExportBase64,
    consolidatedExportFilename: `processed-orders-consolidated-${new Date().toISOString().split('T')[0]}.xlsx`
  });
});

// @desc    Send processed orders Excel export via email (manual send, does not move orders)
// @route   POST /api/orders/processed/send-excel
// @access  Public
const sendProcessedOrdersExcel = asyncHandler(async (req, res) => {
  const { email, startDate, endDate, startTime, endTime, message } = req.body || {}; // Optional: specific email and date filters
  
  console.log('[sendProcessedOrdersExcel] Manual send request received');
  
  // Step 1: Build query with date filters if provided
  let query = { stage: 'Processed' };
  
  // Apply date filters if provided
  if (startDate || endDate) {
    const start = new Date(startDate || endDate);
    const end = new Date(endDate || startDate);
    
    // Set time if provided
    if (startTime) {
      const [hours, minutes] = startTime.split(':');
      start.setHours(parseInt(hours) || 0, parseInt(minutes) || 0, 0, 0);
    } else {
      start.setHours(0, 0, 0, 0);
    }
    
    if (endTime) {
      const [hours, minutes] = endTime.split(':');
      end.setHours(parseInt(hours) || 23, parseInt(minutes) || 59, 59, 999);
    } else {
      end.setHours(23, 59, 59, 999);
    }
    
    query.createdAt = {
      $gte: start,
      $lte: end
    };
    
    console.log(`[sendProcessedOrdersExcel] Applying date filter: ${start.toISOString()} to ${end.toISOString()}`);
  }
  
  // Step 1: Fetch processed orders (with date filter if applied)
  const processedOrders = await Order.find(query)
    .populate('items.vendor', 'name')
    .lean();
  
  console.log(`[sendProcessedOrdersExcel] Found ${processedOrders.length} processed orders${startDate || endDate ? ` (filtered by date)` : ''}`);
  
  if (processedOrders.length === 0) {
    return res.json({
      success: false,
      message: 'No processed orders to export',
      emailSent: false
    });
  }
  
  // Step 2: Generate Excel export
  let excelBuffer = null;
  try {
    excelBuffer = await exportProcessedOrdersToExcel(processedOrders, {
      startDate,
      endDate,
      startTime,
      endTime
    });
    console.log('[sendProcessedOrdersExcel] Excel export generated successfully');
  } catch (error) {
    console.error('[sendProcessedOrdersExcel] Error generating Excel export:', error);
    res.status(500);
    throw new Error(`Failed to generate Excel export: ${error.message}`);
  }
  
  // Step 3: Determine recipients
  let recipients = [];
  
  if (email) {
    // Use provided email
    recipients = [email];
    console.log(`[sendProcessedOrdersExcel] Using provided email: ${email}`);
  } else {
    // Use configured recipients from Settings
    const settings = await Settings.findOne().lean();
    const emailConfig = settings?.email?.processedOrdersExport || {};
    
    if (emailConfig.recipients && emailConfig.recipients.length > 0) {
      recipients = emailConfig.recipients;
      console.log(`[sendProcessedOrdersExcel] Using configured recipients: ${recipients.join(', ')}`);
    } else {
      res.status(400);
      throw new Error('No email recipients configured. Please provide an email address or configure recipients in Settings.');
    }
  }
  
  // Step 4: Send email with Excel attachment
  try {
    await sendProcessedOrdersEmail(excelBuffer, recipients, processedOrders.length, message);
    console.log(`[sendProcessedOrdersExcel] Email sent successfully to ${recipients.length} recipient(s)`);
    
    res.json({
      success: true,
      message: `Excel export sent successfully to ${recipients.join(', ')}`,
      emailSent: true,
      recipients: recipients,
      orderCount: processedOrders.length
    });
  } catch (error) {
    console.error('[sendProcessedOrdersExcel] Error sending email:', error);
    res.status(500);
    throw new Error(`Failed to send email: ${error.message}`);
  }
});

// @desc    Send selected processed orders via email (manual export)
// @route   POST /api/orders/export-email
// @access  Public
const exportSelectedOrdersEmail = asyncHandler(async (req, res) => {
  const { orderIds, recipients, message } = req.body;
  
  if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
    res.status(400);
    throw new Error('Order IDs are required');
  }
  
  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    res.status(400);
    throw new Error('Email recipients are required');
  }
  
  console.log(`[exportSelectedOrdersEmail] Manual export request for ${orderIds.length} orders to ${recipients.length} recipients`);
  
  // Validate order IDs
  const validOrderIds = orderIds.filter(id => mongoose.Types.ObjectId.isValid(id));
  if (validOrderIds.length === 0) {
    res.status(400);
    throw new Error('No valid order IDs provided');
  }
  
  // Fetch selected processed orders
  const processedOrders = await Order.find({ 
    _id: { $in: validOrderIds }, 
    stage: 'Processed' 
  })
    .populate('items.vendor', 'name')
    .lean();
  
  console.log(`[exportSelectedOrdersEmail] Found ${processedOrders.length} processed orders from ${validOrderIds.length} requested IDs`);
  
  if (processedOrders.length === 0) {
    return res.json({
      success: false,
      message: 'No processed orders found for the provided IDs',
      emailSent: false
    });
  }
  
  // Generate Excel export
  let excelBuffer = null;
  try {
    // Calculate date range from orders
    let startDate = null;
    let endDate = null;
    if (processedOrders.length > 0) {
      const dates = processedOrders
        .map(o => o.createdAt ? new Date(o.createdAt) : null)
        .filter(d => d !== null)
        .sort((a, b) => a - b);
      if (dates.length > 0) {
        startDate = dates[0].toISOString().split('T')[0];
        endDate = dates[dates.length - 1].toISOString().split('T')[0];
      }
    }
    
    excelBuffer = await exportProcessedOrdersToExcel(processedOrders, {
      startDate,
      endDate
    });
    console.log('[exportSelectedOrdersEmail] Excel export generated successfully');
  } catch (error) {
    console.error('[exportSelectedOrdersEmail] Error generating Excel export:', error);
    res.status(500);
    throw new Error(`Failed to generate Excel export: ${error.message}`);
  }
  
  // Send email with Excel attachment
  try {
    await sendProcessedOrdersEmail(excelBuffer, recipients, processedOrders.length, message);
    console.log(`[exportSelectedOrdersEmail] Email sent successfully to ${recipients.length} recipient(s)`);
    
    // Log activity
    try {
      const Activity = require('../models/Activity');
      await Activity.create({
        type: 'email_sent',
        title: 'Manual Processed Orders Export Email Sent',
        description: `Exported ${processedOrders.length} processed order(s) manually`,
        metadata: { 
          recipients: recipients, 
          orderCount: processedOrders.length, 
          orderIds: validOrderIds,
          isManual: true 
        },
        isSystemGenerated: true,
      });
      await Activity.create({
        type: 'processed_orders_exported',
        title: 'Manual Processed Orders Export Generated',
        description: `Excel export generated for ${processedOrders.length} processed order(s) manually`,
        metadata: { 
          orderCount: processedOrders.length, 
          orderIds: validOrderIds,
          isManual: true 
        },
        isSystemGenerated: true,
      });
    } catch (logErr) {
      console.warn('[exportSelectedOrdersEmail] Failed to log activity:', logErr?.message || logErr);
    }
    
    res.json({
      success: true,
      message: `Excel export sent successfully to ${recipients.join(', ')}`,
      emailSent: true,
      recipients: recipients,
      orderCount: processedOrders.length
    });
  } catch (error) {
    console.error('[exportSelectedOrdersEmail] Error sending email:', error);
    res.status(500);
    throw new Error(`Failed to send email: ${error.message}`);
  }
});

module.exports = {
  fetchShopifyOrders,
  fetchAllShopifyOrders,
  refreshFulfillmentStatus,
  getOrders,
  getOrderById,
  updateOrderStage,
  addItemComment,
  generateVendorPDF,
  generateVendorPDFBulk,
  createVendorPdfJob,
  getVendorPdfJobStatus,
  exportConsolidatedPO,
  listExports,
  downloadExport,
  createManualOrder,
  bulkCreateOrders,
  generateProductTemplate,
  importProducts,
  updateItemVendor,
  bulkMapVendors,
  exportOrders,
  updateOrderItem,
  completeOrderItem,
  updateItemExpectedDate,
  updateItemWarehouse,
  bulkUpdateWarehouse,
  processOrderItems,
  moveItemsToStage,
  getPackSkuDataEndpoint,
  getPackSkuQuantityEndpoint,
  clearCacheEndpoint,
  updatePackSkuDataEndpoint,
  updateInventoryDataEndpoint,
  autoAssignVendors,
  acceptSuggestedVendor,
  acceptAllSuggestions,
  getSkuTransactionHistory,
  updateOrder,
  getOrderProcessingHistory,
  getSkuProcessingHistory,
  getVendorProcessingHistory,
  cleanupOldHistory,
  deleteOrder,
  clearAllProcessedOrders,
  sendProcessedOrdersExcel,
  exportSelectedOrdersEmail,
  deleteProcessedOrder,
  deleteProcessedOrderVendor
};
async function getOrCreateUnassignedVendor() {
  const name = 'Unassigned';
  let vendor = await Vendor.findOne({ name });
  if (!vendor) vendor = await Vendor.create({ name });
  return vendor;
}
