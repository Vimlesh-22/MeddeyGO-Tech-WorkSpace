const asyncHandler = require('express-async-handler');
const Settings = require('../models/Settings');
const Vendor = require('../models/Vendor');
const Order = require('../models/Order');
const mysql = require('mysql2/promise');
const { getPackSkuData } = require('../services/googleSheets');
const { google } = require('googleapis');
const { rescheduleProcessedOrdersScheduler } = require('../jobs/processedOrdersScheduler');
const path = require('path');

async function getSheetsClient() {
  // Reuse the same logic as services, but minimal here to avoid circular imports
  if (process.env.GOOGLE_SHEETS_API_KEY) {
    return google.sheets({ version: 'v4', auth: process.env.GOOGLE_SHEETS_API_KEY });
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    let credentials;
    try {
      // Parse JSON string from environment variable
      credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    } catch (parseError) {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS must be a valid JSON string. Parse error: ' + parseError.message);
    }
    
    if (!credentials.client_email || !credentials.private_key) {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS JSON must contain client_email and private_key');
    }
    
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const authClient = await auth.getClient();
    return google.sheets({ version: 'v4', auth: authClient });
  }
  throw new Error('Missing Google Sheets authentication. Set either GOOGLE_SHEETS_API_KEY or GOOGLE_APPLICATION_CREDENTIALS environment variable.');
}

let mariaPool = null;
async function getMariaPool() {
  if (mariaPool) return mariaPool;
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) return null;
  mariaPool = await mysql.createPool({
    host: DB_HOST,
    port: Number(DB_PORT || 3306),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
  return mariaPool;
}

async function ensureSettingsTable() {
  const pool = await getMariaPool();
  if (!pool) return null;
  await pool.query(
    `CREATE TABLE IF NOT EXISTS inventory_settings (
      id INT PRIMARY KEY,
      data JSON,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  );
  const [rows] = await pool.query('SELECT id FROM inventory_settings WHERE id=1');
  if (!Array.isArray(rows) || rows.length === 0) {
    await pool.query('INSERT INTO inventory_settings (id, data) VALUES (1, JSON_OBJECT())');
  }
  return pool;
}

async function getSettingsDoc() {
  const pool = await ensureSettingsTable();
  if (!pool) {
    const existing = await Settings.findOne();
    if (existing) {
      return existing.toObject();
    }
    const created = await Settings.create({
      vendor: { autoCreateVendors: true, autoMapSkus: true, requireApproval: false }
    });
    return created.toObject();
  }
  const [rows] = await pool.query('SELECT data FROM inventory_settings WHERE id=1');
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  try {
    const doc = row && row.data ? (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) : {};
    return doc || {};
  } catch {
    return {};
  }
}

async function saveSettingsDoc(doc) {
  const pool = await ensureSettingsTable();
  if (!pool) {
    let existing = await Settings.findOne();
    if (!existing) existing = new Settings({});
    if (doc && typeof doc === 'object') {
      if (doc.vendor !== undefined) existing.vendor = doc.vendor;
      if (doc.email !== undefined) existing.email = doc.email;
      if (doc.inventoryCount !== undefined) existing.inventoryCount = doc.inventoryCount;
      if (doc.sheetsMappingCurrent !== undefined) existing.sheetsMappingCurrent = doc.sheetsMappingCurrent;
      if (doc.sheetsMappingHistory !== undefined) existing.sheetsMappingHistory = doc.sheetsMappingHistory;
    }
    await existing.save();
    return true;
  }
  const payload = JSON.stringify(doc || {});
  await pool.query('UPDATE inventory_settings SET data=? WHERE id=1', [payload]);
  try {
    let existing = await Settings.findOne();
    if (!existing) existing = new Settings({});
    if (doc && typeof doc === 'object') {
      if (doc.vendor !== undefined) existing.vendor = doc.vendor;
      if (doc.email !== undefined) existing.email = doc.email;
    }
    await existing.save();
  } catch {}
  return true;
}

async function getSpreadsheetFirstSheetTitle(spreadsheetId) {
  try {
    const sheets = await getSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const first = meta?.data?.sheets?.[0]?.properties?.title;
    return first || 'Sheet1';
  } catch (e) {
    console.warn('Failed to fetch spreadsheet metadata:', e.message);
    return 'Sheet1';
  }
}

function letterFromIndex(i) {
  let n = i;
  let s = '';
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

async function getHeaderRow(spreadsheetId, sheetName) {
  try {
    const sheets = await getSheetsClient();
    const title = sheetName || await getSpreadsheetFirstSheetTitle(spreadsheetId);
    // Use A1 notation explicitly to avoid parse errors
    const range = `${title}!A1:ZZZ1`;
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const values = resp?.data?.values || [];
    const headers = values[0] || [];
    // Return both plain and detailed headers
    const detailed = headers.map((name, idx) => ({ index: idx, letter: letterFromIndex(idx), name }));
    return { title, headers, headersDetailed: detailed };
  } catch (e) {
    console.error('Failed to fetch headers for', sheetName || 'first sheet', e.message);
    return { title: sheetName || 'Sheet1', headers: [], headersDetailed: [] };
  }
}

// @desc    Get all settings
// @route   GET /api/settings
// @access  Public
const getSettings = asyncHandler(async (req, res) => {
  const doc = await getSettingsDoc();
  if (doc && Object.keys(doc).length > 0) return res.json(doc);
  return res.json({
    vendor: {
      autoCreateVendors: true,
      autoMapSkus: true,
      requireApproval: false
    }
  });
});

// @desc    Update settings
// @route   POST /api/settings
// @access  Public
const updateSettings = asyncHandler(async (req, res) => {
  const { vendor, email, inventoryCount } = req.body;
  const doc = (await getSettingsDoc()) || {};
  
  if (vendor) {
    doc.vendor = {
      autoCreateVendors: vendor.autoCreateVendors ?? doc.vendor?.autoCreateVendors ?? true,
      autoMapSkus: vendor.autoMapSkus ?? doc.vendor?.autoMapSkus ?? true,
      requireApproval: vendor.requireApproval ?? doc.vendor?.requireApproval ?? false
    };
  }
  if (email) {
    doc.email = doc.email || {};
    if (email.enabled !== undefined) doc.email.enabled = email.enabled;
    if (email.vendorEnabled !== undefined) doc.email.vendorEnabled = email.vendorEnabled;
    if (email.salesTeamEnabled !== undefined) doc.email.salesTeamEnabled = email.salesTeamEnabled;
    if (Array.isArray(email.salesTeamEmails)) doc.email.salesTeamEmails = email.salesTeamEmails;
    if (email.globalTimeline !== undefined) doc.email.globalTimeline = email.globalTimeline;
    if (email.processedOrdersExport) {
      doc.email.processedOrdersExport = doc.email.processedOrdersExport || { enabled: true, recipients: [], scheduleTime: '04:00' };
      if (email.processedOrdersExport.enabled !== undefined) doc.email.processedOrdersExport.enabled = email.processedOrdersExport.enabled;
      if (Array.isArray(email.processedOrdersExport.recipients)) doc.email.processedOrdersExport.recipients = email.processedOrdersExport.recipients;
      if (email.processedOrdersExport.scheduleTime) doc.email.processedOrdersExport.scheduleTime = email.processedOrdersExport.scheduleTime;
    }
  }
  if (inventoryCount) {
    doc.inventoryCount = doc.inventoryCount || {};
    if (inventoryCount.defaultLocation !== undefined) doc.inventoryCount.defaultLocation = inventoryCount.defaultLocation;
    if (inventoryCount.defaultView !== undefined) doc.inventoryCount.defaultView = inventoryCount.defaultView;
    if (inventoryCount.autoSync !== undefined) doc.inventoryCount.autoSync = inventoryCount.autoSync;
    if (inventoryCount.removeAfterSync !== undefined) doc.inventoryCount.removeAfterSync = inventoryCount.removeAfterSync;
    if (inventoryCount.syncMode !== undefined) doc.inventoryCount.syncMode = inventoryCount.syncMode;
    if (inventoryCount.showAnalytics !== undefined) doc.inventoryCount.showAnalytics = inventoryCount.showAnalytics;
  }
  await saveSettingsDoc(doc);
  try {
    const newTime = email?.processedOrdersExport?.scheduleTime;
    if (newTime) rescheduleProcessedOrdersScheduler(newTime);
  } catch {}
  res.json(doc);
});

const normalizeContactInfo = (incoming = {}) => {
  const info = {};
  ['email', 'phone', 'address'].forEach(field => {
    if (incoming[field] !== undefined && incoming[field] !== null && incoming[field] !== '') {
      info[field] = incoming[field];
    } else if (incoming.contactInfo && incoming.contactInfo[field]) {
      info[field] = incoming.contactInfo[field];
    }
  });
  return info;
};

const mergeContactInfo = (target, source = {}) => {
  if (!target.contactInfo) target.contactInfo = {};
  ['email', 'phone', 'address'].forEach(field => {
    if ((!target.contactInfo[field] || target.contactInfo[field].trim() === '') && source[field]) {
      target.contactInfo[field] = source[field];
    }
  });
};

const collectSheetVendorNames = async () => {
  try {
  const data = await getPackSkuData();
  // Support both shapes: { packSkuMap, vendorSuggestions } OR a plain map
  const packSkuMap = data?.packSkuMap && typeof data.packSkuMap === 'object' ? data.packSkuMap : (
    (data && typeof data === 'object' && !Array.isArray(data)) ? data : {}
  );
  const vendorSuggestions = data?.vendorSuggestions && typeof data.vendorSuggestions === 'object' ? data.vendorSuggestions : {};

  const names = new Set();

  const addName = (name) => {
    if (name && typeof name === 'string') {
      const trimmed = name.trim();
      if (trimmed) names.add(trimmed);
    }
  };

  // Suggestions map (SKU -> vendor name)
  Object.values(vendorSuggestions).forEach(addName);
  // From packSkuMap entries' vendorName
  Object.values(packSkuMap).forEach(info => addName(info?.vendorName));

  return Array.from(names);
  } catch (error) {
    console.error('Error collecting sheet vendor names:', error.message);
    // Return empty array on error instead of crashing
    return [];
  }
};

const deduplicateVendors = async () => {
  const vendors = await Vendor.find({});
  const seen = new Map();
  let duplicatesRemoved = 0;

  for (const vendor of vendors) {
    const normalized = (vendor.name || '').trim().toLowerCase();
    if (!normalized) {
      continue;
    }

    if (!seen.has(normalized)) {
      seen.set(normalized, vendor);
      continue;
    }

    const keepVendor = seen.get(normalized);
    const existingSkus = new Set(
      (keepVendor.skuMappings || []).map(mapping => mapping.sku)
    );
    (vendor.skuMappings || []).forEach(mapping => {
      if (mapping?.sku && !existingSkus.has(mapping.sku)) {
        keepVendor.skuMappings.push({ sku: mapping.sku });
      }
    });
    mergeContactInfo(keepVendor, vendor.contactInfo);
    await keepVendor.save();

    await Order.updateMany(
      { 'items.vendor': vendor._id },
      { $set: { 'items.$[elem].vendor': keepVendor._id } },
      { arrayFilters: [{ 'elem.vendor': vendor._id }] }
    );

    await Vendor.deleteOne({ _id: vendor._id });
    duplicatesRemoved += 1;
  }

  return duplicatesRemoved;
};

// @desc    Sync vendor directory with Google Sheets suggestions and manual updates
// @route   POST /api/settings/vendor-directory/sync
// @access  Public
const syncVendorDirectory = asyncHandler(async (req, res) => {
  const {
    vendorUpdates = [],
    syncSheets = true,
    removeDuplicates = true
  } = req.body || {};

  let sheetVendorNames = [];
  if (syncSheets) {
    try {
    sheetVendorNames = await collectSheetVendorNames();
    } catch (error) {
      console.error('Error syncing vendor names from sheets:', error.message);
      // Continue with empty array if sheet sync fails
      sheetVendorNames = [];
    }
  }

  let created = 0;
  let updated = 0;

  for (const name of sheetVendorNames) {
    const existing = await Vendor.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (!existing) {
      await Vendor.create({ name });
      created += 1;
    } else if (existing.name !== name) {
      existing.name = name;
      await existing.save();
      updated += 1;
    }
  }

  for (const update of Array.isArray(vendorUpdates) ? vendorUpdates : []) {
    const normalizedName = update.name ? update.name.trim() : '';
    const contactInfo = normalizeContactInfo(update);
    let vendor = null;

    if (update.id) {
      vendor = await Vendor.findById(update.id);
    }
    if (!vendor && normalizedName) {
      vendor = await Vendor.findOne({ name: { $regex: new RegExp(`^${normalizedName}$`, 'i') } });
    }

    if (!vendor && normalizedName) {
      vendor = await Vendor.create({
        name: normalizedName,
        contactInfo
      });
      created += 1;
    } else if (vendor) {
      if (normalizedName) {
        vendor.name = normalizedName;
      }
      if (Object.keys(contactInfo).length > 0) {
        vendor.contactInfo = {
          ...vendor.contactInfo,
          ...contactInfo
        };
      }
      await vendor.save();
      updated += 1;
    }
  }

  let duplicatesRemoved = 0;
  if (removeDuplicates) {
    duplicatesRemoved = await deduplicateVendors();
  }

  const finalVendors = await Vendor.find({})
    .sort('name')
    .select('name contactInfo')
    .lean();

  res.json({
    success: true,
    summary: {
      created,
      updated,
      duplicatesRemoved,
      sheetVendors: sheetVendorNames.length
    },
    vendors: finalVendors
  });
});

// @desc    Get vendor suggestions sourced from Google Sheets
// @route   GET /api/settings/vendor-suggestions
// @access  Public
const getVendorSuggestions = asyncHandler(async (req, res) => {
  const names = await collectSheetVendorNames();
  res.json({
    success: true,
    vendors: names.sort((a, b) => a.localeCompare(b))
  });
});

// --- Sheets headers & mapping APIs ---

// @desc    Fetch first-row headers for configured Google Sheets tabs
// @route   GET /api/settings/sheets/headers
// @access  Public
const getSheetsHeaders = asyncHandler(async (req, res) => {
  const packId = process.env.GOOGLE_SHEETS_PACK_SHEET_ID;
  const okhlaId = process.env.GOOGLE_SHEETS_OKHLA_SHEET_ID;
  const bahadurgarhId = process.env.GOOGLE_SHEETS_BAHADURGARH_SHEET_ID;

  const packSheet = process.env.GOOGLE_SHEETS_PACK_SHEET_NAME;
  const packProducts = process.env.GOOGLE_SHEETS_PACK_PRODUCTS_SHEET_NAME;
  const comboProducts = process.env.GOOGLE_SHEETS_COMBO_PRODUCTS_SHEET_NAME;

  if (!packId || !okhlaId || !bahadurgarhId || !packSheet || !packProducts || !comboProducts) {
    return res.status(500).json({
      success: false,
      message: 'Missing required Google Sheets environment variables'
    });
  }

  const okhlaSheet = 'Okhla'; // logical label
  const bahadurgarhSheet = 'Bahadurgarh'; // logical label

  const result = {
    pack: { sheetId: packId, ...(await getHeaderRow(packId, packSheet)) },
    packProducts: { sheetId: packId, ...(await getHeaderRow(packId, packProducts)) },
    comboProducts: { sheetId: packId, ...(await getHeaderRow(packId, comboProducts)) },
    okhlaInventory: { sheetId: okhlaId, ...(await getHeaderRow(okhlaId, null)) },
    bahadurgarhInventory: { sheetId: bahadurgarhId, ...(await getHeaderRow(bahadurgarhId, null)) },
  };

  res.json({ success: true, sheets: result });
});

// A reasonable default mapping based on current implementation
function getDefaultSheetsMapping() {
  return {
    selectedTabs: {
      pack: process.env.GOOGLE_SHEETS_PACK_SHEET_NAME,
      packProducts: process.env.GOOGLE_SHEETS_PACK_PRODUCTS_SHEET_NAME,
      comboProducts: process.env.GOOGLE_SHEETS_COMBO_PRODUCTS_SHEET_NAME,
      okhlaInventory: 'Sheet1',
      bahadurgarhInventory: 'Sheet1'
    },
    requiredFields: {
      pack: {
        sku: 'SKU',
        quantity: 'Quantity',
        title: 'Title',
        size: 'Size',
        vendor: 'Vendor',
        gst: 'GST',
        priceBeforeGst: 'Price Before GST',
        totalPrice: 'Total Price'
      },
      packProducts: {
        packSku: 'Pack sku', // Column A
        packQuantity: 'Pack Quantity', // Column C (changed from B)
        correctPurchaseSku: 'Correct Puchase SKU' // Column B (changed from F)
      },
      comboProducts: {
        newSku: 'New sku', // Column A
        correctPurchaseSku: 'Correct Puchase SKU' // Column C (changed from F)
      },
      okhlaInventory: {
        sku: 'SKU',
        available: 'Available',
        safetyStock: 'Safety Stock'
      },
      bahadurgarhInventory: {
        sku: 'SKU',
        available: 'Available',
        safetyStock: 'Safety Stock'
      }
    }
  };
}

// @desc    Get current sheets mapping (with default fallback)
// @route   GET /api/settings/sheets/mapping
// @access  Public
const getSheetsMapping = asyncHandler(async (req, res) => {
  const doc = await getSettingsDoc();
  const mapping = doc?.sheetsMappingCurrent || getDefaultSheetsMapping();
  res.json({ success: true, mapping, history: doc?.sheetsMappingHistory || [] });
});

// @desc    Save new sheets mapping and version previous one
// @route   POST /api/settings/sheets/mapping
// @access  Public
const saveSheetsMapping = asyncHandler(async (req, res) => {
  const { mapping, label } = req.body || {};
  if (!mapping || typeof mapping !== 'object') {
    res.status(400);
    throw new Error('mapping object is required');
  }
  const doc = (await getSettingsDoc()) || {};
  if (doc.sheetsMappingCurrent) {
    doc.sheetsMappingHistory = doc.sheetsMappingHistory || [];
    doc.sheetsMappingHistory.push({ mapping: doc.sheetsMappingCurrent, label: label || 'auto-saved' });
  }
  doc.sheetsMappingCurrent = mapping;
  await saveSettingsDoc(doc);
  res.json({ success: true, mapping: doc.sheetsMappingCurrent, history: doc.sheetsMappingHistory || [] });
});

// @desc    Restore sheets mapping by history index or default
// @route   POST /api/settings/sheets/mapping/restore
// @access  Public
const restoreSheetsMapping = asyncHandler(async (req, res) => {
  const { defaultMapping = false, historyIndex } = req.body || {};
  const doc = (await getSettingsDoc()) || {};
  if (defaultMapping) {
    doc.sheetsMappingCurrent = getDefaultSheetsMapping();
  } else if (typeof historyIndex === 'number' && doc.sheetsMappingHistory && doc.sheetsMappingHistory[historyIndex]) {
    doc.sheetsMappingCurrent = doc.sheetsMappingHistory[historyIndex].mapping;
  } else {
    res.status(400);
    throw new Error('Provide defaultMapping=true or a valid historyIndex');
  }
  await saveSettingsDoc(doc);
  res.json({ success: true, mapping: doc.sheetsMappingCurrent });
});

// ===== EMAIL/REMINDERS & TEMPLATES ENDPOINTS =====

// @desc    Get email settings
// @route   GET /api/settings/email
// @access  Public
const getEmailSettings = asyncHandler(async (req, res) => {
  const doc = await getSettingsDoc();
  const email = doc?.email || {
    enabled: false,
    vendorEnabled: true,
    salesTeamEnabled: true,
    salesTeamEmails: [],
    globalTimeline: 2,
    exceptionVendors: [],
    vendorOverrides: {},
    templates: {}
  };
  
  // Convert maps to objects for JSON serialization
  const emailData = {
    ...email,
    vendorOverrides: email.vendorOverrides instanceof Map ? Object.fromEntries(email.vendorOverrides) : email.vendorOverrides,
    templates: email.templates instanceof Map ? Object.fromEntries(email.templates) : email.templates
  };
  
  res.json(emailData);
});

// @desc    Update email settings
// @route   POST /api/settings/email
// @access  Public
const updateEmailSettings = asyncHandler(async (req, res) => {
  const doc = (await getSettingsDoc()) || {};
  doc.email = doc.email || {};
  if (req.body.enabled !== undefined) doc.email.enabled = req.body.enabled;
  if (req.body.vendorEnabled !== undefined) doc.email.vendorEnabled = req.body.vendorEnabled;
  if (req.body.salesTeamEnabled !== undefined) doc.email.salesTeamEnabled = req.body.salesTeamEnabled;
  if (req.body.globalTimeline !== undefined) doc.email.globalTimeline = req.body.globalTimeline;
  if (req.body.salesTeamEmails) {
    if (!Array.isArray(req.body.salesTeamEmails)) {
      return res.status(400).json({ error: 'salesTeamEmails must be an array' });
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validatedEmails = [];
    
    for (const email of req.body.salesTeamEmails) {
      if (typeof email !== 'string') {
        return res.status(400).json({ error: 'All email addresses must be strings' });
      }
      const normalized = email.toLowerCase().trim();
      if (!emailRegex.test(normalized)) {
        return res.status(400).json({ error: `Invalid email format: ${email}` });
      }
      validatedEmails.push(normalized);
    }
    
    doc.email.salesTeamEmails = validatedEmails;
  }
  if (req.body.exceptionVendors) doc.email.exceptionVendors = req.body.exceptionVendors;
  if (req.body.vendorOverrides) {
    doc.email.vendorOverrides = Object.assign({}, doc.email.vendorOverrides || {}, req.body.vendorOverrides);
  }
  if (req.body.processedOrdersExport) {
    doc.email.processedOrdersExport = doc.email.processedOrdersExport || { enabled: true, recipients: [], scheduleTime: '04:00' };
    const pe = req.body.processedOrdersExport;
    if (pe.enabled !== undefined) doc.email.processedOrdersExport.enabled = pe.enabled;
    if (Array.isArray(pe.recipients)) doc.email.processedOrdersExport.recipients = pe.recipients;
    if (typeof pe.scheduleTime === 'string' && pe.scheduleTime.match(/^\d{2}:\d{2}$/)) {
      doc.email.processedOrdersExport.scheduleTime = pe.scheduleTime;
      try { rescheduleProcessedOrdersScheduler(pe.scheduleTime); } catch {}
    }
  }
  await saveSettingsDoc(doc);
  res.json({ ok: true, email: doc.email });
});

// @desc    Get templates
// @route   GET /api/settings/templates
// @access  Public
const listTemplates = asyncHandler(async (req, res) => {
  const settings = await Settings.findOne();
  const templates = settings?.email?.templates || new Map();
  
  // Convert Map to object for JSON
  const templatesObj = templates instanceof Map ? Object.fromEntries(templates) : templates;
  
  res.json({ templates: templatesObj });
});

// @desc    Get single template
// @route   GET /api/settings/templates/:name
// @access  Public
const getTemplate = asyncHandler(async (req, res) => {
  const settings = await Settings.findOne();
  const templates = settings?.email?.templates || new Map();
  const template = templates.get(req.params.name);
  
  if (!template) {
    res.status(404);
    throw new Error('Template not found');
  }
  
  res.json(template);
});

// @desc    Create template
// @route   POST /api/settings/templates
// @access  Public
const createTemplate = asyncHandler(async (req, res) => {
  const { name, subject, html } = req.body;
  
  if (!name) {
    res.status(400);
    throw new Error('Template name is required');
  }
  
  let settings = await Settings.findOne();
  if (!settings) settings = new Settings({});
  if (!settings.email) settings.email = {};
  if (!(settings.email.templates instanceof Map)) {
    settings.email.templates = new Map(Object.entries(settings.email.templates || {}));
  }
  
  if (settings.email.templates.has(name)) {
    res.status(400);
    throw new Error('Template with this name already exists');
  }
  
  settings.email.templates.set(name, { name, subject: subject || '', html: html || '' });
  await settings.save();
  
  res.json({ ok: true, template: settings.email.templates.get(name) });
});

// @desc    Update template
// @route   PUT /api/settings/templates/:name
// @access  Public
const updateTemplate = asyncHandler(async (req, res) => {
  const { subject, html } = req.body;
  
  let settings = await Settings.findOne();
  if (!settings) {
    res.status(404);
    throw new Error('Settings not found');
  }
  
  if (!settings.email) settings.email = {};
  if (!(settings.email.templates instanceof Map)) {
    settings.email.templates = new Map(Object.entries(settings.email.templates || {}));
  }
  
  if (!settings.email.templates.has(req.params.name)) {
    res.status(404);
    throw new Error('Template not found');
  }
  
  const existing = settings.email.templates.get(req.params.name);
  settings.email.templates.set(req.params.name, {
    ...existing,
    subject: subject !== undefined ? subject : existing.subject,
    html: html !== undefined ? html : existing.html
  });
  
  await settings.save();
  res.json({ ok: true, template: settings.email.templates.get(req.params.name) });
});

// @desc    Delete template
// @route   DELETE /api/settings/templates/:name
// @access  Public
const deleteTemplate = asyncHandler(async (req, res) => {
  const settings = await Settings.findOne();
  if (!settings || !settings.email || !(settings.email.templates instanceof Map)) {
    res.status(404);
    throw new Error('Template not found');
  }
  
  if (!settings.email.templates.has(req.params.name)) {
    res.status(404);
    throw new Error('Template not found');
  }
  
  settings.email.templates.delete(req.params.name);
  await settings.save();
  
  res.json({ ok: true });
});

// @desc    Restore template to default
// @route   POST /api/settings/templates/:name/restore
// @access  Public
const restoreTemplate = asyncHandler(async (req, res) => {
  // TODO: Implement restore to default logic
  res.json({ ok: true, message: 'Restore functionality to be implemented' });
});

// @desc    Restore all templates to defaults
// @route   POST /api/settings/templates/restore/defaults
// @access  Public
const restoreAllTemplates = asyncHandler(async (req, res) => {
  // TODO: Implement restore all to defaults logic
  res.json({ ok: true, message: 'Restore all functionality to be implemented' });
});

// @desc    Set vendor override
// @route   POST /api/settings/email/vendor-override
// @access  Public
const setVendorOverride = asyncHandler(async (req, res) => {
  const { vendorId, override } = req.body;
  
  if (!vendorId || !override) {
    res.status(400);
    throw new Error('vendorId and override are required');
  }
  
  let settings = await Settings.findOne();
  if (!settings) settings = new Settings({});
  if (!settings.email) settings.email = {};
  if (!(settings.email.vendorOverrides instanceof Map)) {
    settings.email.vendorOverrides = new Map(Object.entries(settings.email.vendorOverrides || {}));
  }
  
  settings.email.vendorOverrides.set(vendorId, override);
  await settings.save();
  
  res.json({ ok: true });
});

// @desc    Delete vendor override
// @route   DELETE /api/settings/email/vendor-override
// @access  Public
const deleteVendorOverride = asyncHandler(async (req, res) => {
  const { vendorId } = req.body;
  
  if (!vendorId) {
    res.status(400);
    throw new Error('vendorId is required');
  }
  
  const settings = await Settings.findOne();
  if (!settings || !settings.email || !(settings.email.vendorOverrides instanceof Map)) {
    res.status(404);
    throw new Error('Vendor override not found');
  }
  
  settings.email.vendorOverrides.delete(vendorId);
  await settings.save();
  
  res.json({ ok: true });
});

// @desc    Add email recipient to processed orders export
// @route   POST /api/settings/email/recipients
// @access  Public
const addEmailRecipient = asyncHandler(async (req, res) => {
  const { email } = req.body;
  
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    res.status(400);
    throw new Error('Valid email address is required');
  }
  
  let settings = await Settings.findOne();
  if (!settings) {
    // Create settings if they don't exist
    settings = await Settings.create({
      email: {
        processedOrdersExport: {
          enabled: true,
          recipients: [email.trim()],
          scheduleTime: '04:00'
        }
      }
    });
  } else {
    // Initialize email object if it doesn't exist
    if (!settings.email) {
      settings.email = {
        enabled: false,
        vendorEnabled: true,
        salesTeamEnabled: true,
        salesTeamEmails: [],
        globalTimeline: 2,
        processedOrdersExport: {
          enabled: true,
          recipients: [],
          scheduleTime: '04:00'
        }
      };
    }
    
    // Initialize processedOrdersExport if it doesn't exist
    if (!settings.email.processedOrdersExport) {
      settings.email.processedOrdersExport = {
        enabled: true,
        recipients: [],
        scheduleTime: '04:00'
      };
    }
    
    // Ensure recipients is an array
    if (!Array.isArray(settings.email.processedOrdersExport.recipients)) {
      settings.email.processedOrdersExport.recipients = [];
    }
    
    const trimmedEmail = email.trim().toLowerCase();
    
    // Check if email already exists
    if (settings.email.processedOrdersExport.recipients.includes(trimmedEmail)) {
      res.status(400);
      throw new Error('Email already exists in recipients list');
    }
    
    // Add email
    settings.email.processedOrdersExport.recipients.push(trimmedEmail);
    settings.markModified('email');
    settings.markModified('email.processedOrdersExport');
    await settings.save();
  }
  
  res.json({ 
    ok: true, 
    recipients: settings.email.processedOrdersExport.recipients 
  });
});

// @desc    Remove email recipient from processed orders export
// @route   DELETE /api/settings/email/recipients
// @access  Public
const removeEmailRecipient = asyncHandler(async (req, res) => {
  const { email } = req.body;
  
  if (!email || typeof email !== 'string') {
    res.status(400);
    throw new Error('Email address is required');
  }
  
  const settings = await Settings.findOne();
  if (!settings || !settings.email || !settings.email.processedOrdersExport) {
    res.status(404);
    throw new Error('Email settings not found');
  }
  
  if (!Array.isArray(settings.email.processedOrdersExport.recipients)) {
    settings.email.processedOrdersExport.recipients = [];
  }
  
  const trimmedEmail = email.trim().toLowerCase();
  
  // Remove email
  const initialLength = settings.email.processedOrdersExport.recipients.length;
  settings.email.processedOrdersExport.recipients = settings.email.processedOrdersExport.recipients.filter(
    e => e.toLowerCase() !== trimmedEmail
  );
  
  if (settings.email.processedOrdersExport.recipients.length === initialLength) {
    res.status(404);
    throw new Error('Email not found in recipients list');
  }
  
  settings.markModified('email');
  settings.markModified('email.processedOrdersExport');
  await settings.save();
  
  res.json({ 
    ok: true, 
    recipients: settings.email.processedOrdersExport.recipients 
  });
});

// @desc    Get email history (all sent emails)
// @route   GET /api/settings/email/history
// @access  Public
const getEmailHistory = asyncHandler(async (req, res) => {
  const Activity = require('../models/Activity');
  
  // Query Activity collection for email_sent events
  const emailHistory = await Activity.find({ type: 'email_sent' })
    .sort({ timestamp: -1 })
    .limit(100) // Limit to last 100 emails
    .lean();
  
  // Format the history for frontend
  const formattedHistory = emailHistory.map(activity => ({
    id: activity._id,
    timestamp: activity.timestamp,
    title: activity.title || 'Processed Orders Export Email',
    description: activity.description || '',
    recipients: activity.metadata?.recipients || [],
    orderCount: activity.metadata?.orderCount || 0,
    startDate: activity.metadata?.startDate || null,
    endDate: activity.metadata?.endDate || null,
    startTime: activity.metadata?.startTime || null,
    endTime: activity.metadata?.endTime || null,
    isSystemGenerated: activity.isSystemGenerated || false
  }));
  
  res.json({ 
    ok: true, 
    history: formattedHistory,
    total: formattedHistory.length
  });
});

// @desc    Get recipient email suggestions (settings + history + recipients collection)
// @route   GET /api/settings/email/suggestions
// @access  Public
const getEmailRecipientSuggestions = asyncHandler(async (req, res) => {
  const Activity = require('../models/Activity');
  const EmailRecipient = require('../models/EmailRecipient');
  const doc = await getSettingsDoc();
  const fromSettings = Array.isArray(doc?.email?.processedOrdersExport?.recipients) ? doc.email.processedOrdersExport.recipients : [];
  const fromRecipients = await EmailRecipient.find({}, 'email').lean();
  const fromRecipientsList = Array.isArray(fromRecipients) ? fromRecipients.map(r => r.email).filter(Boolean) : [];
  const history = await Activity.find({ type: 'email_sent' }).sort({ timestamp: -1 }).limit(200).lean();
  const fromHistory = history.flatMap(a => Array.isArray(a?.metadata?.recipients) ? a.metadata.recipients : []).filter(Boolean);
  const set = new Set([ ...fromSettings, ...fromRecipientsList, ...fromHistory ].map(e => String(e).toLowerCase().trim()).filter(Boolean));
  const suggestions = Array.from(set).sort((a, b) => a.localeCompare(b));
  res.json({ ok: true, suggestions });
});

module.exports = {
  getSettings,
  updateSettings,
  syncVendorDirectory,
  getVendorSuggestions,
  getSheetsHeaders,
  getSheetsMapping,
  saveSheetsMapping,
  restoreSheetsMapping,
  getEmailSettings,
  updateEmailSettings,
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  restoreTemplate,
  restoreAllTemplates,
  setVendorOverride,
  deleteVendorOverride,
  addEmailRecipient,
  removeEmailRecipient,
  getEmailHistory,
  getEmailRecipientSuggestions
};
