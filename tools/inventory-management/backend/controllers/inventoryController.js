const InventoryTransaction = require('../models/InventoryTransaction');
const Order = require('../models/Order');
const {
  updateInventoryTransaction,
  batchUpdateInventoryTransactions,
  findOrCreateDateColumn,
  getInventoryData,
  getAllExistingDates,
  getInventorySheetName,
  INVENTORY_TAB_NAME
} = require('../services/googleSheets');
const { formatDateForSheet } = require('../services/googleSheets');

// Use environment variables for spreadsheet IDs, fallback to defaults if not set
const OKHLA_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_OKHLA_SHEET_ID;
const BAHADURGARH_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_BAHADURGARH_SHEET_ID;
if (!OKHLA_SPREADSHEET_ID || !BAHADURGARH_SPREADSHEET_ID) {
  console.warn('[InventoryController] Missing Google Sheets env vars: GOOGLE_SHEETS_OKHLA_SHEET_ID and/or GOOGLE_SHEETS_BAHADURGARH_SHEET_ID. Inventory Sheets features will be disabled.');
}

/**
 * Get all inventory transactions with filtering
 */
exports.getInventoryTransactions = async (req, res) => {
  try {
    const {
      transactionType,
      location,
      startDate,
      endDate,
      syncedToSheets,
      sku
    } = req.query;

    const filter = {};

    if (transactionType) filter.transactionType = transactionType;
    if (location) filter.location = location;
    if (syncedToSheets !== undefined) filter.syncedToSheets = syncedToSheets === 'true';
    if (sku) filter['items.sku'] = new RegExp(sku, 'i');

    if (startDate || endDate) {
      filter.transactionDate = {};
      if (startDate) filter.transactionDate.$gte = new Date(startDate);
      if (endDate) filter.transactionDate.$lte = new Date(endDate);
    }

    const transactions = await InventoryTransaction.find(filter)
      .populate('items.orderId', 'orderName shopifyOrderId')
      .populate('items.vendor', 'name')
      .sort({ transactionDate: -1 });

    res.json({
      success: true,
      transactions
    });
  } catch (error) {
    console.error('Error fetching inventory transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory transactions',
      error: error.message
    });
  }
};

/**
 * Get transactions grouped by SKU
 */
exports.getGroupedTransactions = async (req, res) => {
  try {
    const { transactionType, location, startDate, endDate } = req.query;

    const match = {};
    if (transactionType) match.transactionType = transactionType;
    if (location) match.location = location;
    if (startDate || endDate) {
      match.transactionDate = {};
      if (startDate) match.transactionDate.$gte = new Date(startDate);
      if (endDate) match.transactionDate.$lte = new Date(endDate);
    }

    const grouped = await InventoryTransaction.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $group: {
          _id: {
            sku: '$items.sku',
            transactionType: '$transactionType',
            location: '$location'
          },
          totalQuantity: { $sum: '$items.quantity' },
          transactions: {
            $push: {
              transactionDate: '$transactionDate',
              quantity: '$items.quantity',
              orderName: '$items.orderName',
              vendorName: '$items.vendorName'
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.sku': 1 }
      }
    ]);

    res.json({
      success: true,
      grouped
    });
  } catch (error) {
    console.error('Error grouping transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to group transactions',
      error: error.message
    });
  }
};

/**
 * Create inventory transaction (Sales)
 * Auto-triggered when order moves from Initial -> In-Stock
 */
exports.createSalesTransaction = async (req, res) => {
  try {
    const { orderId, location, transactionDate } = req.body;

    const order = await Order.findById(orderId).populate('items.vendor');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const items = order.items.map(item => ({
      sku: item.sku,
      productName: item.productName,
      quantity: item.quantity,
      orderId: order._id,
      orderName: order.orderName,
      shopifyOrderId: order.shopifyOrderId,
      vendor: item.vendor?._id,
      vendorName: item.vendor?.name
    }));

    const transaction = new InventoryTransaction({
      transactionType: 'Sales',
      transactionDate: transactionDate || new Date(),
      location,
      items,
      createdBy: req.user?.email || 'system'
    });

    await transaction.save();

    res.json({
      success: true,
      transaction
    });
  } catch (error) {
    console.error('Error creating sales transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create sales transaction',
      error: error.message
    });
  }
};

/**
 * Create inventory transaction (Purchase)
 * Auto-triggered when order moves to Processed stage
 */
exports.createPurchaseTransaction = async (req, res) => {
  try {
    const { orderId, location, transactionDate } = req.body;

    const order = await Order.findById(orderId).populate('items.vendor');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const items = order.items
      .filter(item => item.vendor) // Only items with assigned vendors
      .map(item => ({
        sku: item.sku,
        productName: item.productName,
        quantity: item.quantity,
        orderId: order._id,
        orderName: order.orderName,
        shopifyOrderId: order.shopifyOrderId,
        vendor: item.vendor._id,
        vendorName: item.vendor.name
      }));

    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No items with assigned vendors found'
      });
    }

    const transaction = new InventoryTransaction({
      transactionType: 'Purchase',
      transactionDate: transactionDate || new Date(),
      location,
      items,
      createdBy: req.user?.email || 'system'
    });

    await transaction.save();

    res.json({
      success: true,
      transaction
    });
  } catch (error) {
    console.error('Error creating purchase transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create purchase transaction',
      error: error.message
    });
  }
};

/**
 * Create return transaction
 * Can be from import (CSV/Excel) or manual entry
 */
exports.createReturnTransaction = async (req, res) => {
  try {
    const { location, transactionDate, items, shopifyOrderIds } = req.body;

    let processedItems = items || [];

    // If Shopify Order IDs provided, fetch from Shopify
    if (shopifyOrderIds && shopifyOrderIds.length > 0) {
      // Fetch orders from database
      const orders = await Order.find({
        shopifyOrderId: { $in: shopifyOrderIds }
      }).populate('items.vendor');

      // Extract items
      orders.forEach(order => {
        order.items.forEach(item => {
          processedItems.push({
            sku: item.sku,
            productName: item.productName,
            quantity: item.quantity,
            orderId: order._id,
            orderName: order.orderName,
            shopifyOrderId: order.shopifyOrderId,
            vendor: item.vendor?._id,
            vendorName: item.vendor?.name
          });
        });
      });
    }

  if (processedItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No items provided for return transaction'
      });
  }

    // Auto-suggest vendor for items missing vendor/vendorName
    try {
      const { getPackSkuData, resolveSkuComponents } = require('../services/googleSheets');
      const Vendor = require('../models/Vendor');
      const data = await getPackSkuData();
      const vmap = data.vendorSuggestions || {};
      const pmap = data.packSkuMap || {};
      for (const it of processedItems) {
        if (!it.vendor && !it.vendorName && it.sku) {
          const norm = String(it.sku).toUpperCase().trim();
          let name = vmap[norm] || pmap[norm]?.vendorName || null;
          if (!name) {
            const vd = await Vendor.findOne({ 'skuMappings.sku': norm }).lean();
            if (vd?.name) name = vd.name;
          }
          if (!name && (norm.startsWith('P') || norm.startsWith('C'))) {
            const resolved = await resolveSkuComponents(norm);
            for (const c of resolved.components) {
              const n2 = vmap[c.sku] || pmap[c.sku]?.vendorName || null;
              if (n2) { name = n2; break; }
            }
          }
          if (name) {
            it.vendorName = name;
          }
        }
      }
    } catch {}

    // Group quantities by SKU
    const groupedItems = processedItems.reduce((acc, item) => {
      const existing = acc.find(i => i.sku === item.sku);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        acc.push({ ...item });
      }
      return acc;
    }, []);

    const transaction = new InventoryTransaction({
      transactionType: 'Return',
      transactionDate: transactionDate || new Date(),
      location,
      items: groupedItems,
      createdBy: req.user?.email || 'system'
    });

    await transaction.save();

    res.json({
      success: true,
      transaction
    });
  } catch (error) {
    console.error('Error creating return transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create return transaction',
      error: error.message
    });
  }
};

/**
 * Import transactions from CSV/Excel
 */
exports.importTransactions = async (req, res) => {
  try {
    const { transactionType, location, transactions } = req.body;

    if (!transactions || transactions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No transactions provided'
      });
    }

    const created = [];

    for (const trans of transactions) {
      const transaction = new InventoryTransaction({
        transactionType,
        transactionDate: trans.date || new Date(),
        location,
        items: trans.items,
        notes: trans.notes,
        createdBy: req.user?.email || 'system'
      });

      await transaction.save();
      created.push(transaction);
    }

    res.json({
      success: true,
      count: created.length,
      transactions: created
    });
  } catch (error) {
    console.error('Error importing transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to import transactions',
      error: error.message
    });
  }
};

/**
 * Bulk create date columns in Google Sheets (without updating values)
 */
exports.bulkCreateDates = async (req, res) => {
  try {
    const { location, dates } = req.body;

    if (!location || !dates || !Array.isArray(dates)) {
      return res.status(400).json({
        success: false,
        message: 'location and dates array are required'
      });
    }

    // Get spreadsheet ID based on location
    const spreadsheetId = location === 'Okhla' ? OKHLA_SPREADSHEET_ID : BAHADURGARH_SPREADSHEET_ID;
    const sheetName = INVENTORY_TAB_NAME || 'Inventory'; // Use "Inventory" directly (actual sheet name)

    const results = [];
    const errors = [];

    console.log(`Bulk creating ${dates.length} date columns for ${location} in sheet "${sheetName}"`);

    for (const date of dates) {
      try {
        const result = await findOrCreateDateColumn(spreadsheetId, sheetName, date);
        results.push({
          date,
          columnIndex: result.columnIndex,
          columnLetter: result.columnLetter
        });
      } catch (error) {
        console.error(`Error creating date column for ${date}:`, error.message);
        errors.push({
          date,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      created: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error in bulk create dates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk create dates',
      error: error.message
    });
  }
};

/**
 * Check which dates from imported data are missing from the sheet
 */
exports.checkImportDates = async (req, res) => {
  try {
    const { location, dates } = req.body;

    if (!location || !dates || !Array.isArray(dates)) {
      return res.status(400).json({
        success: false,
        message: 'location and dates array are required'
      });
    }

    // Get spreadsheet ID based on location
    const spreadsheetId = location === 'Okhla' ? OKHLA_SPREADSHEET_ID : BAHADURGARH_SPREADSHEET_ID;
    const sheetName = INVENTORY_TAB_NAME || 'Inventory'; // Use "Inventory" directly (actual sheet name)

    // Get all existing dates from the sheet
    const existingDates = await getAllExistingDates(spreadsheetId, sheetName);
    
    // Format the imported dates to match sheet format
    const formattedDates = dates.map(date => formatDateForSheet(date));
    
    // Find missing dates
    const missingDates = formattedDates.filter(date => !existingDates.includes(date));
    
    res.json({
      success: true,
      existingDates,
      missingDates,
      allExist: missingDates.length === 0
    });
  } catch (error) {
    console.error('Error checking import dates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check import dates',
      error: error.message
    });
  }
};

/**
 * Group ad-hoc transactions by SKU and detect missing SKUs in the target sheet
 */
exports.groupTransactions = async (req, res) => {
  try {
    const { location, transactions = [] } = req.body || {};
    if (!location || !Array.isArray(transactions)) {
      return res.status(400).json({ success: false, message: 'location and transactions[] are required' });
    }

    const spreadsheetId = location === 'Okhla' ? OKHLA_SPREADSHEET_ID : BAHADURGARH_SPREADSHEET_ID;
    const inventoryMap = await getInventoryData(spreadsheetId, location, true); // Force refresh for fresh data

    const grouped = new Map();
    for (const t of transactions) {
      const key = (t.sku || '').toUpperCase();
      if (!key) continue;
      if (!grouped.has(key)) grouped.set(key, { sku: key, totalQuantity: 0, transactions: [] });
      const entry = grouped.get(key);
      entry.totalQuantity += parseInt(t.quantity || 0, 10) || 0;
      entry.transactions.push({ date: t.date || new Date(), quantity: parseInt(t.quantity || 0, 10) || 0, transactionType: t.transactionType || 'Sales' });
    }

    const result = Array.from(grouped.values()).sort((a, b) => a.sku.localeCompare(b.sku));
    const missingSkus = result.filter(r => !inventoryMap[r.sku]);

    res.json({ success: true, location, grouped: result, missingSkus: missingSkus.map(m => m.sku) });
  } catch (error) {
    console.error('Error grouping transactions:', error);
    res.status(500).json({ success: false, message: 'Failed to group transactions', error: error.message });
  }
};

/**
 * Preview which SKUs are missing from the sheet
 */
exports.previewMissingSkus = async (req, res) => {
  try {
    const { location, skus = [] } = req.body || {};
    if (!location || !Array.isArray(skus)) {
      return res.status(400).json({ success: false, message: 'location and skus[] are required' });
    }
    const spreadsheetId = location === 'Okhla' ? OKHLA_SPREADSHEET_ID : BAHADURGARH_SPREADSHEET_ID;
    const inventoryMap = await getInventoryData(spreadsheetId, location, true); // Force refresh for fresh data
    const missing = skus.map(s => String(s || '').toUpperCase()).filter(s => s && !inventoryMap[s]);
    res.json({ success: true, location, missing });
  } catch (error) {
    console.error('Error previewing missing skus:', error);
    res.status(500).json({ success: false, message: 'Failed to preview missing skus', error: error.message });
  }
};

/**
 * Process grouped transactions and push updates to Sheets
 */
exports.processGroupedTransactions = async (req, res) => {
  try {
    const { location, grouped = [] } = req.body || {};
    if (!location || !Array.isArray(grouped)) {
      return res.status(400).json({ success: false, message: 'location and grouped[] are required' });
    }
    const spreadsheetId = location === 'Okhla' ? OKHLA_SPREADSHEET_ID : BAHADURGARH_SPREADSHEET_ID;
    const sheetName = INVENTORY_TAB_NAME || 'Inventory'; // Use "Inventory" directly (actual sheet name)

    // Flatten to individual updates per transaction entry to preserve dates/types
    // OPTIMIZED: Collect all dates first, then create date columns in batch
    const dateSet = new Set();
    const updates = [];
    
    for (const g of grouped) {
      for (const t of (g.transactions || [])) {
        const date = t.date ? new Date(t.date) : new Date();
        dateSet.add(date.toISOString());
        
        updates.push({
          spreadsheetId,
          sheetName: sheetName,
          sku: g.sku,
          transactionType: t.transactionType || 'Sales',
          date: date,
          quantity: parseInt(t.quantity || 0, 10) || 0,
          orderId: t.orderId || null,
          orderName: t.orderName || 'N/A'
        });
      }
    }
    
    // Create all date columns first (batch prepare)
    console.log(`[processGroupedTransactions] Creating ${dateSet.size} date columns...`);
    for (const dateStr of dateSet) {
      try {
        await findOrCreateDateColumn(spreadsheetId, sheetName, new Date(dateStr));
      } catch (error) {
        console.error(`[processGroupedTransactions] Error creating date column for ${dateStr}:`, error.message);
      }
    }
    
    // Now batch update all transactions (sums same SKUs, batches reads/writes)
    const results = await batchUpdateInventoryTransactions(updates);
    res.json({ success: true, updated: results.length, results });
  } catch (error) {
    console.error('Error processing grouped transactions:', error);
    res.status(500).json({ success: false, message: 'Failed to process grouped transactions', error: error.message });
  }
};

/**
 * Get individual SKUs for pack/combo SKU
 */
exports.getIndividualSkus = async (req, res) => {
  try {
    const { sku } = req.query;
    
    if (!sku) {
      return res.status(400).json({
        success: false,
        message: 'sku is required'
      });
    }

    const { getIndividualSkusForPackCombo } = require('../services/googleSheets');
    const individualSkus = await getIndividualSkusForPackCombo(sku);
    
    res.json({
      success: true,
      sku,
      individualSkus,
      count: individualSkus.length
    });
  } catch (error) {
    console.error('Error getting individual SKUs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get individual SKUs',
      error: error.message
    });
  }
};

/**
 * Check if SKU exists in any sheet for a location
 * Uses cached metadata to avoid quota exceeded errors
 */
exports.checkSkuAvailability = async (req, res) => {
  try {
    const { sku, location, forceRefresh } = req.query;
    
    if (!sku || !location) {
      return res.status(400).json({
        success: false,
        message: 'sku and location are required'
      });
    }

    const { findSkuRow, getSheetMetadata, INVENTORY_TAB_NAME, clearCaches, loadSkuRowCache } = require('../services/googleSheets');
    const spreadsheetId = location === 'Okhla' ? OKHLA_SPREADSHEET_ID : BAHADURGARH_SPREADSHEET_ID;
    
    // Force cache refresh if requested
    if (forceRefresh === 'true') {
      console.log(`[checkSkuAvailability] Force refreshing cache for ${location}`);
      clearCaches();
    }
    
    // Get all sheets in the spreadsheet (uses cached metadata)
    const metadata = await getSheetMetadata(spreadsheetId, forceRefresh === 'true');
    const availableSheets = metadata.sheets.map(s => s.properties.title);
    
    console.log(`[checkSkuAvailability] Checking SKU "${sku}" in location "${location}"`);
    console.log(`[checkSkuAvailability] Available sheets:`, availableSheets);
    
    // Primary check: Look in the "Inventory" tab first (most likely location for SKUs)
    const inventoryTabName = INVENTORY_TAB_NAME || 'Inventory';
    let foundInAnySheet = false;
    let foundSheet = null;
    const sheetResults = [];
    
    // First, check the Inventory tab (primary location)
    if (availableSheets.includes(inventoryTabName)) {
      try {
        console.log(`[checkSkuAvailability] Checking primary inventory tab: "${inventoryTabName}"`);
        
        // Force refresh cache if requested
        const doForceRefresh = forceRefresh === 'true';
        let rowIndex = await findSkuRow(spreadsheetId, inventoryTabName, sku, doForceRefresh);
        let foundIndividualSku = null;
        
        // If not found and SKU starts with P or C, check for individual SKUs
        if (!rowIndex && (sku.startsWith('P') || sku.startsWith('C'))) {
          console.log(`[checkSkuAvailability] SKU "${sku}" not found, checking for pack/combo individual SKUs...`);
          const { getIndividualSkusForPackCombo } = require('../services/googleSheets');
          const individualSkus = await getIndividualSkusForPackCombo(sku);
          
          if (individualSkus.length > 0) {
            // Try to find individual SKUs
            for (const individualSku of individualSkus) {
              rowIndex = await findSkuRow(spreadsheetId, inventoryTabName, individualSku, doForceRefresh);
              if (rowIndex) {
                foundIndividualSku = individualSku;
                console.log(`[checkSkuAvailability] ✅ Found pack/combo SKU "${sku}" mapped to individual SKU "${foundIndividualSku}" at row ${rowIndex}`);
                break;
              }
            }
          }
        }
        
        if (rowIndex) {
          foundInAnySheet = true;
          foundSheet = inventoryTabName;
          sheetResults.push({
            sheetName: inventoryTabName,
            found: true,
            rowIndex,
            ...(foundIndividualSku && { individualSku: foundIndividualSku, originalSku: sku })
          });
          console.log(`[checkSkuAvailability] ✅ Found SKU "${sku}"${foundIndividualSku ? ` (via individual SKU ${foundIndividualSku})` : ''} in "${inventoryTabName}" at row ${rowIndex}`);
        } else {
          // Load full cache to see what SKUs are available
          const skuMap = await loadSkuRowCache(spreadsheetId, inventoryTabName);
          const normalizedSku = String(sku).toUpperCase().trim();
          const sampleSkus = Object.keys(skuMap).slice(0, 10);
          
          sheetResults.push({
            sheetName: inventoryTabName,
            found: false,
            debug: {
              totalSkusInCache: Object.keys(skuMap).length,
              sampleSkus: sampleSkus,
              searchedFor: normalizedSku
            }
          });
          console.log(`[checkSkuAvailability] ❌ SKU "${sku}" not found in "${inventoryTabName}"`);
          console.log(`[checkSkuAvailability] Total SKUs in cache: ${Object.keys(skuMap).length}`);
          if (sampleSkus.length > 0) {
            console.log(`[checkSkuAvailability] Sample SKUs: ${sampleSkus.join(', ')}`);
          }
        }
      } catch (error) {
        console.error(`[checkSkuAvailability] Error checking "${inventoryTabName}":`, error.message);
        console.error(`[checkSkuAvailability] Full error:`, error);
        sheetResults.push({
          sheetName: inventoryTabName,
          found: false,
          error: error.message
        });
      }
    } else {
      console.warn(`[checkSkuAvailability] Inventory tab "${inventoryTabName}" not found in available sheets`);
    }
    
    // If not found in Inventory tab, check other sheets (but only ones that might have SKU data)
    // Skip system sheets and sheets that are unlikely to contain SKUs
    const skipSheets = ['Sheet1', 'Sheet2', 'Sheet3']; // Common default sheet names to skip
    const otherSheets = availableSheets.filter(s => 
      s !== inventoryTabName && 
      !skipSheets.includes(s) &&
      !s.toLowerCase().includes('temp') &&
      !s.toLowerCase().includes('backup')
    );
    
    // Only check other sheets if SKU wasn't found in Inventory tab
    if (!foundInAnySheet && otherSheets.length > 0) {
      console.log(`[checkSkuAvailability] Checking ${otherSheets.length} other sheets...`);
      for (const sheetName of otherSheets) {
        try {
          const rowIndex = await findSkuRow(spreadsheetId, sheetName, sku);
          if (rowIndex) {
            foundInAnySheet = true;
            foundSheet = sheetName;
            sheetResults.push({
              sheetName,
              found: true,
              rowIndex
            });
            console.log(`[checkSkuAvailability] ✅ Found SKU "${sku}" in "${sheetName}" at row ${rowIndex}`);
            break; // Found it, no need to check more sheets
          } else {
            sheetResults.push({
              sheetName,
              found: false
            });
          }
        } catch (error) {
          // If error is about missing column or invalid range, skip this sheet (it doesn't have SKU data)
          if (error.message && (
            error.message.includes('Unable to parse range') ||
            error.message.includes('Unable to parse') ||
            error.message.includes('No data found')
          )) {
            console.log(`[checkSkuAvailability] Skipping sheet "${sheetName}" - doesn't appear to have SKU data`);
            continue; // Skip sheets that don't have SKU column structure
          }
          console.error(`[checkSkuAvailability] Error checking "${sheetName}":`, error.message);
          sheetResults.push({
            sheetName,
            found: false,
            error: error.message
          });
        }
      }
    }
    
    res.json({
      success: true,
      sku,
      location,
      found: foundInAnySheet,
      foundSheet,
      sheetResults
    });
  } catch (error) {
    console.error('Error checking SKU availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check SKU availability',
      error: error.message
    });
  }
};

/**
 * Batch check SKU availability for multiple SKUs
 * This reduces API calls by checking all SKUs at once
 */
exports.batchCheckSkuAvailability = async (req, res) => {
  try {
    const { skus, location } = req.body; // skus: [{ sku, location }, ...]
    
    if (!Array.isArray(skus) || skus.length === 0 || !location) {
      return res.status(400).json({
        success: false,
        message: 'skus array and location are required'
      });
    }

    const { findSkuRow, getSheetMetadata, INVENTORY_TAB_NAME, loadSkuRowCache, getIndividualSkusForPackCombo } = require('../services/googleSheets');
    const spreadsheetId = location === 'Okhla' ? OKHLA_SPREADSHEET_ID : BAHADURGARH_SPREADSHEET_ID;
    
    // Get all sheets in the spreadsheet once (cached)
    const metadata = await getSheetMetadata(spreadsheetId);
    const availableSheets = metadata.sheets.map(s => s.properties.title);
    const inventoryTabName = INVENTORY_TAB_NAME || 'Inventory';
    
    // Load SKU cache once for the inventory sheet
    let skuMap = null;
    if (availableSheets.includes(inventoryTabName)) {
      try {
        skuMap = await loadSkuRowCache(spreadsheetId, inventoryTabName);
        console.log(`[batchCheckSkuAvailability] Loaded ${Object.keys(skuMap).length} SKUs from cache for ${inventoryTabName}`);
      } catch (error) {
        console.error(`[batchCheckSkuAvailability] Error loading SKU cache:`, error.message);
      }
    }
    
    const results = [];
    
    // Check each SKU
    for (const item of skus) {
      const sku = item.sku || item;
      const skuLocation = item.location || location;
      
      // Only process if location matches
      if (skuLocation !== location) continue;
      
      let found = false;
      let foundSheet = null;
      let rowIndex = null;
      
      // First check in inventory tab using cached SKU map
      if (skuMap) {
        const normalizedSku = String(sku).toUpperCase().trim();
        const cachedRow = skuMap[normalizedSku];
        
        if (cachedRow) {
          found = true;
          foundSheet = inventoryTabName;
          rowIndex = cachedRow.row;
        } else {
          // Check for pack/combo SKUs
          if ((sku.startsWith('P') || sku.startsWith('C'))) {
            try {
              const individualSkus = await getIndividualSkusForPackCombo(sku);
              for (const individualSku of individualSkus) {
                const normalizedIndividual = String(individualSku).toUpperCase().trim();
                const cachedRow = skuMap[normalizedIndividual];
                if (cachedRow) {
                  found = true;
                  foundSheet = inventoryTabName;
                  rowIndex = cachedRow.row;
                  break;
                }
              }
            } catch (error) {
              // Ignore pack/combo lookup errors
            }
          }
        }
      } else {
        // Fallback: use findSkuRow if cache not available
        try {
          rowIndex = await findSkuRow(spreadsheetId, inventoryTabName, sku);
          if (rowIndex) {
            found = true;
            foundSheet = inventoryTabName;
          }
        } catch (error) {
          // Ignore errors
        }
      }
      
      results.push({
        sku,
        location: skuLocation,
        found,
        foundSheet,
        rowIndex
      });
    }
    
    res.json({
      success: true,
      results,
      location
    });
  } catch (error) {
    console.error('Error batch checking SKU availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to batch check SKU availability',
      error: error.message
    });
  }
};

/**
 * Add a single SKU to the sheet with required fields
 */
exports.addMissingSkus = async (req, res) => {
  try {
    const { sku, location, safetyStock, initial, productName, sheetName } = req.body;
    
    if (!sku || !location || initial === undefined || !productName) {
      return res.status(400).json({
        success: false,
        message: 'sku, location, initial, and productName are required'
      });
    }

    const { addMissingSkusToSheet } = require('../services/inventorySheetUpdateService');
    
    const skuData = {
      sku,
      productName,
      safetyStock: safetyStock || 0,
      initialQuantity: initial || 0
    };
    
    const result = await addMissingSkusToSheet([skuData], location);
    
    res.json({
      success: true,
      result,
      message: `Successfully added SKU ${sku} to ${location} inventory sheet`
    });
  } catch (error) {
    console.error('Error adding missing SKU:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add missing SKU',
      error: error.message
    });
  }
};

/**
 * Get processing summary (unsynced counts by type)
 */
exports.getProcessingSummary = async (req, res) => {
  try {
    const unsynced = await InventoryTransaction.aggregate([
      { $match: { syncedToSheets: { $ne: true } } },
      { $group: { _id: '$transactionType', count: { $sum: 1 } } }
    ]);
    const summary = unsynced.reduce((acc, r) => { acc[r._id] = r.count; return acc; }, {});
    res.json({ success: true, summary });
  } catch (error) {
    console.error('Error fetching processing summary:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch processing summary', error: error.message });
  }
};
/**
 * Update transaction
 */
exports.updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Don't allow updating sourceOrder reference or autoCreated flag
    delete updates.sourceOrder;
    delete updates.autoCreated;

    // Validate sheetLocation if provided
    if (updates.sheetLocation) {
      if (updates.sheetLocation.sheetName && !updates.sheetLocation.spreadsheetId) {
        // If sheetName is provided, set spreadsheetId based on location
        const transaction = await InventoryTransaction.findById(id);
        if (transaction) {
          const spreadsheetId = transaction.location === 'Okhla' 
            ? OKHLA_SPREADSHEET_ID 
            : BAHADURGARH_SPREADSHEET_ID;
          updates.sheetLocation.spreadsheetId = spreadsheetId;
        }
      }
    }

    const transaction = await InventoryTransaction.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Note: Original order remains unchanged
    
    res.json({
      success: true,
      transaction
    });
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update transaction',
      error: error.message
    });
  }
};

/**
 * Update received status and quantity for an item
 */
exports.updateReceivedStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { itemIndex, receivedStatus, receivedQuantity } = req.body;
    
    if (itemIndex === undefined) {
      return res.status(400).json({
        success: false,
        message: 'itemIndex is required'
      });
    }

    const transaction = await InventoryTransaction.findById(id);
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Only allow received status updates for Purchase transactions
    if (transaction.transactionType !== 'Purchase') {
      return res.status(400).json({
        success: false,
        message: 'Received status can only be updated for Purchase transactions'
      });
    }

    if (!transaction.items[itemIndex]) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in transaction'
      });
    }

    const item = transaction.items[itemIndex];
    const totalQuantity = item.quantity;
    const newReceivedQuantity = receivedQuantity !== undefined ? receivedQuantity : item.receivedQuantity || 0;

    // Auto-calculate status based on received quantity
    let calculatedStatus = receivedStatus;
    if (calculatedStatus === undefined || calculatedStatus === null) {
      if (newReceivedQuantity === 0) {
        calculatedStatus = 'pending';
      } else if (newReceivedQuantity >= totalQuantity) {
        calculatedStatus = 'received';
      } else {
        calculatedStatus = 'partial';
      }
    }

    // Validate received quantity doesn't exceed total quantity
    if (newReceivedQuantity > totalQuantity) {
      return res.status(400).json({
        success: false,
        message: `Received quantity (${newReceivedQuantity}) cannot exceed total quantity (${totalQuantity})`
      });
    }

    // Update received status and quantity
    item.receivedStatus = calculatedStatus;
    item.receivedQuantity = newReceivedQuantity;
    
    // Only update receivedAt if quantity increased or status changed to received
    if (newReceivedQuantity > (item.receivedQuantity || 0) || calculatedStatus === 'received') {
      item.receivedAt = new Date();
    }

    // Calculate remainder (pending quantity)
    const remainder = totalQuantity - newReceivedQuantity;

    // Save the transaction
    await transaction.save();

    res.json({
      success: true,
      transaction,
      item: {
        ...item.toObject(),
        remainder
      }
    });
  } catch (error) {
    console.error('Error updating received status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update received status',
      error: error.message
    });
  }
};

/**
 * Bulk update received status for multiple transactions/items (Purchase only)
 */
exports.bulkUpdateReceivedStatus = async (req, res) => {
  try {
    const { updates } = req.body; // Array of { transactionId, itemIndex, receivedStatus, receivedQuantity }
    
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'updates array is required'
      });
    }

    const results = [];
    const transactionCache = new Map(); // Cache transactions to avoid repeated DB queries
    
    for (const update of updates) {
      try {
        const { transactionId, itemIndex, receivedStatus, receivedQuantity } = update;
        
        if (itemIndex === undefined || !transactionId) {
          results.push({
            transactionId,
            itemIndex,
            success: false,
            error: 'transactionId and itemIndex are required'
          });
          continue;
        }

        // Get transaction (use cache if already loaded)
        let transaction = transactionCache.get(transactionId);
        if (!transaction) {
          transaction = await InventoryTransaction.findById(transactionId);
          if (transaction) {
            transactionCache.set(transactionId, transaction);
          }
        }
        
        if (!transaction) {
          results.push({
            transactionId,
            itemIndex,
            success: false,
            error: 'Transaction not found'
          });
          continue;
        }

        // Only allow received status updates for Purchase transactions
        if (transaction.transactionType !== 'Purchase') {
          results.push({
            transactionId,
            itemIndex,
            success: false,
            error: 'Received status can only be updated for Purchase transactions'
          });
          continue;
        }

        if (!transaction.items[itemIndex]) {
          results.push({
            transactionId,
            itemIndex,
            success: false,
            error: 'Item not found in transaction'
          });
          continue;
        }

        const item = transaction.items[itemIndex];
        const totalQuantity = item.quantity;
        const newReceivedQuantity = receivedQuantity !== undefined ? receivedQuantity : item.receivedQuantity || 0;

        // Auto-calculate status based on received quantity
        let calculatedStatus = receivedStatus;
        if (calculatedStatus === undefined || calculatedStatus === null) {
          if (newReceivedQuantity === 0) {
            calculatedStatus = 'pending';
          } else if (newReceivedQuantity >= totalQuantity) {
            calculatedStatus = 'received';
          } else {
            calculatedStatus = 'partial';
          }
        }

        // Validate received quantity doesn't exceed total quantity
        if (newReceivedQuantity > totalQuantity) {
          results.push({
            transactionId,
            itemIndex,
            success: false,
            error: `Received quantity (${newReceivedQuantity}) cannot exceed total quantity (${totalQuantity})`
          });
          continue;
        }

        // Update received status and quantity
        item.receivedStatus = calculatedStatus;
        item.receivedQuantity = newReceivedQuantity;
        
        // Only update receivedAt if quantity increased or status changed to received
        if (newReceivedQuantity > (item.receivedQuantity || 0) || calculatedStatus === 'received') {
          item.receivedAt = new Date();
        }

        // Calculate remainder (pending quantity)
        const remainder = totalQuantity - newReceivedQuantity;

        results.push({
          transactionId,
          itemIndex,
          success: true,
          receivedStatus: calculatedStatus,
          receivedQuantity: newReceivedQuantity,
          remainder
        });
      } catch (error) {
        results.push({
          transactionId: update?.transactionId,
          itemIndex: update?.itemIndex,
          success: false,
          error: error.message
        });
      }
    }
    
    // Save all modified transactions (batch save)
    const transactionsToSave = Array.from(transactionCache.values());
    await Promise.all(transactionsToSave.map(t => t.save()));
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    console.log(`[bulkUpdateReceivedStatus] Updated ${successCount}/${updates.length} items (${failCount} failed)`);
    
    res.json({
      success: true,
      updated: successCount,
      failed: failCount,
      results
    });
  } catch (error) {
    console.error('Error bulk updating received status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk update received status',
      error: error.message
    });
  }
};

/**
 * Delete transaction
 */
exports.deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    const transaction = await InventoryTransaction.findByIdAndDelete(id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    res.json({
      success: true,
      message: 'Transaction deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete transaction',
      error: error.message
    });
  }
};

/**
 * Expand C/P SKUs to individual SKUs for a transaction
 * Returns expanded items array with individual SKUs
 */
async function expandComboPackSkus(transaction, location) {
  const { getIndividualSkusForPackCombo, getPackSkuQuantity } = require('../services/googleSheets');
  const expandedItems = [];
  const missingSkus = [];
  
  console.log(`[expandComboPackSkus] 📦 Transaction ${transaction._id} has ${transaction.items.length} items`);
  
  for (const item of transaction.items) {
    const sku = (item.sku || '').trim().toUpperCase();
    const originalQuantity = item.quantity || 0;
    
    console.log(`[expandComboPackSkus] Processing: ${sku} x ${originalQuantity} (receivedQty: ${item.receivedQuantity || 0}, status: ${item.receivedStatus || 'N/A'})`);
    
    if (!sku) {
      console.warn(`[expandComboPackSkus] ⚠️ Skipping item without SKU in transaction ${transaction._id}`);
      continue;
    }
    
    if (originalQuantity === 0) {
      console.warn(`[expandComboPackSkus] ⚠️ WARNING: Item ${sku} has ZERO quantity!`);
    }
    
    // Check if SKU starts with C or P
    if (sku.startsWith('P')) {
      // PACK SKU - multiply order quantity by pack size
      try {
        const individualSkus = await getIndividualSkusForPackCombo(sku);
        
        if (individualSkus.length > 0) {
          // Get pack size from Google Sheets
          const packSize = await getPackSkuQuantity(sku);
          let finalQuantity = originalQuantity; // Default to original quantity if pack size not found
          
          if (packSize && packSize > 0) {
            // PACK LOGIC: Multiply order quantity by pack size
            // Example: 5 orders × 10 units/pack = 50 units per individual SKU
            finalQuantity = originalQuantity * packSize;
            console.log(`[expandComboPackSkus] 📦 PACK SKU ${sku}: ${originalQuantity} orders × ${packSize} pack size = ${finalQuantity} units per individual SKU`);
          } else {
            console.warn(`[expandComboPackSkus] ⚠️ Pack size not found for ${sku}, using original quantity ${originalQuantity}`);
          }
          
          console.log(`[expandComboPackSkus] 🔄 Expanding PACK ${sku} (${originalQuantity} orders) → ${individualSkus.length} SKUs (each gets ${finalQuantity} units)`);
          
          for (let i = 0; i < individualSkus.length; i++) {
            const individualSku = individualSkus[i].trim().toUpperCase();
            
            console.log(`[expandComboPackSkus]    ➜ ${individualSku} x ${finalQuantity}`);
            
            expandedItems.push({
              ...item,
              sku: individualSku,
              quantity: finalQuantity, // For PACK: order qty × pack size
              originalSku: sku, // Keep track of original Pack SKU
              isExpanded: true, // Mark as expanded item
              originalQuantity: originalQuantity, // Keep original order quantity for reference
              packSize: packSize // Store pack size for reference
            });
          }
        } else {
          // Could not expand, keep original P SKU
          console.log(`[expandComboPackSkus] Could not expand PACK ${sku}, keeping original with quantity ${originalQuantity}`);
          expandedItems.push({
            ...item,
            sku: sku,
            quantity: originalQuantity // Explicitly preserve quantity
          });
        }
      } catch (error) {
        console.error(`[expandComboPackSkus] Error expanding PACK ${sku}:`, error.message);
        // On error, keep original
        expandedItems.push({
          ...item,
          sku: sku,
          quantity: originalQuantity // Explicitly preserve quantity
        });
      }
    } else if (sku.startsWith('C')) {
      // COMBO SKU - each individual SKU gets the same quantity
      try {
        const individualSkus = await getIndividualSkusForPackCombo(sku);
        
        if (individualSkus.length > 0) {
          // COMBO LOGIC: Each individual SKU gets the SAME quantity as the combo order
          // Example: 2 combo orders → Each individual SKU (SKU1, SKU2) gets 2 units
          const finalQuantity = originalQuantity;
          console.log(`[expandComboPackSkus] 🔄 COMBO SKU ${sku}: ${originalQuantity} units → ${individualSkus.length} SKUs (each gets ${finalQuantity} units)`);
          
          for (let i = 0; i < individualSkus.length; i++) {
            const individualSku = individualSkus[i].trim().toUpperCase();
            
            console.log(`[expandComboPackSkus]    ➜ ${individualSku} x ${finalQuantity}`);
            
            expandedItems.push({
              ...item,
              sku: individualSku,
              quantity: finalQuantity, // For COMBO: same qty for all
              originalSku: sku, // Keep track of original Combo SKU
              isExpanded: true, // Mark as expanded item
              originalQuantity: originalQuantity // Keep original quantity for reference
            });
          }
        } else {
          // Could not expand, keep original C SKU
          console.log(`[expandComboPackSkus] Could not expand COMBO ${sku}, keeping original with quantity ${originalQuantity}`);
          expandedItems.push({
            ...item,
            sku: sku,
            quantity: originalQuantity // Explicitly preserve quantity
          });
        }
      } catch (error) {
        console.error(`[expandComboPackSkus] Error expanding COMBO ${sku}:`, error.message);
        // On error, keep original
        expandedItems.push({
          ...item,
          sku: sku,
          quantity: originalQuantity // Explicitly preserve quantity
        });
      }
    } else {
      // Regular SKU, pass through as-is
      console.log(`[expandComboPackSkus] ✓ Regular SKU ${sku} x ${originalQuantity}`);
      expandedItems.push({
        ...item,
        sku: sku,
        quantity: originalQuantity // Explicitly preserve quantity
      });
    }
  }
  
  console.log(`[expandComboPackSkus] ✅ Transaction ${transaction._id}: ${transaction.items.length} items → ${expandedItems.length} expanded items`);
  
  // Verify all expanded items have quantities
  const zeroQtyItems = expandedItems.filter(item => !item.quantity || item.quantity === 0);
  if (zeroQtyItems.length > 0) {
    console.error(`[expandComboPackSkus] ❌ ERROR: ${zeroQtyItems.length} items have zero quantity:`, zeroQtyItems.map(i => i.sku));
  }
  
  return { expandedItems, missingSkus };
}

/**
 * Sync transactions to Google Sheets
 */
exports.syncToSheets = async (req, res) => {
  try {
    console.log('='.repeat(80));
    console.log('[syncToSheets] 🚀 SYNC REQUEST RECEIVED');
    console.log('[syncToSheets] Request body:', JSON.stringify(req.body, null, 2));
    
    const { transactionIds, selectAll, filters, location, handleMissingSkus = 'skip', syncMode = 'sum', syncDate, background = false } = req.body;
    // handleMissingSkus: 'skip', 'add', or 'export'
    // syncMode: 'sum' or 'replace'
    // background: if true, process in background with retry logic

    let transactions;

    if (selectAll) {
      // Apply filters
      const filter = filters || {};
      filter.syncedToSheets = false; // Only sync unsynced
      transactions = await InventoryTransaction.find(filter);
      console.log(`[syncToSheets] Found ${transactions.length} transactions with selectAll and filters`);
    } else {
      // When syncing by IDs, do NOT filter by location - the location parameter is the TARGET sync location
      const query = {
        _id: { $in: transactionIds }
      };
      console.log(`[syncToSheets] Query:`, query);
      console.log(`[syncToSheets] Target sync location: ${location || 'will use transaction\'s original location'}`);
      transactions = await InventoryTransaction.find(query);
      console.log(`[syncToSheets] Found ${transactions.length} transactions by IDs`);
    }
    
    // Log transaction details
    transactions.forEach(t => {
      console.log(`[syncToSheets] Transaction ${t._id}: ${t.items.length} items, location=${t.location}, type=${t.transactionType}, date=${t.transactionDate}`);
      t.items.forEach(item => {
        console.log(`[syncToSheets]   - ${item.sku} x ${item.quantity}`);
      });
    });

    if (transactions.length === 0) {
      console.log('[syncToSheets] ⚠️ No transactions found to sync');
      return res.json({
        success: true,
        message: 'No transactions to sync',
        synced: 0
      });
    }

    // Note: We no longer pre-check for missing SKUs here
    // expandComboPackSkus will handle expansion, and batchUpdateInventoryTransactions
    // will report any SKUs that fail to update in the sheet
    
    // If location is provided in request, use it as TARGET location for all transactions
    // Otherwise, use each transaction's original location
    const targetLocation = location; // This is the TARGET sync location from the request
    console.log(`[syncToSheets] Target location for sync: ${targetLocation || 'using each transaction\'s original location'}`);
    
    const locations = [...new Set(transactions.map(t => t.location))];
    const allMissingSkus = []; // Keep for response compatibility

    // Collect all unique dates and bulk create date columns before syncing
    // If syncDate is provided, use it for all transactions, otherwise use transaction dates
    const uniqueDates = syncDate 
      ? [new Date(syncDate)]
      : [...new Set(transactions.map(t => t.transactionDate))];
    console.log(`Bulk creating ${uniqueDates.length} date columns before sync${syncDate ? ' (using syncDate)' : ''}`);
    
    // If targetLocation is provided, create date columns ONLY for that location
    // Otherwise, create columns for each transaction's original location
    const locationsForDateColumns = targetLocation ? [targetLocation] : locations;
    console.log(`[syncToSheets] Creating date columns for locations: ${locationsForDateColumns.join(', ')}`);
    
    for (const loc of locationsForDateColumns) {
      const locationDates = syncDate 
        ? [new Date(syncDate)]
        : uniqueDates; // Use all unique dates for the target location
      if (locationDates.length > 0) {
        // Get spreadsheet ID based on location
        const spreadsheetId = loc === 'Okhla' ? OKHLA_SPREADSHEET_ID : BAHADURGARH_SPREADSHEET_ID;
        const sheetName = INVENTORY_TAB_NAME || 'Inventory'; // Use "Inventory" directly (actual sheet name)

        console.log(`Creating ${locationDates.length} date columns for ${loc} in sheet "${sheetName}"${syncDate ? ' (using syncDate)' : ''}`);
        
        // Bulk create date columns - pass just the sheet name "Inventory"
        for (const date of locationDates) {
          try {
            await findOrCreateDateColumn(spreadsheetId, sheetName, date);
          } catch (error) {
            console.error(`Error creating date column for ${date}:`, error.message);
          }
        }
        
        console.log(`Created date columns for ${loc}`);
      }
    }

    // OPTIMIZED: Batch all updates together (sum same SKUs, batch read/write)
    const batchUpdates = [];
    const transactionItemMap = new Map(); // Track which items belong to which transactions
    
    for (const transaction of transactions) {
      try {
        // Use targetLocation if provided, otherwise use transaction's original location
        const locationToSync = targetLocation || transaction.location;
        console.log(`[syncToSheets] Transaction ${transaction._id} from ${transaction.location} → syncing to ${locationToSync}`);
        
        const spreadsheetId = locationToSync === 'Okhla'
          ? OKHLA_SPREADSHEET_ID
          : BAHADURGARH_SPREADSHEET_ID;

        const sheetName = INVENTORY_TAB_NAME || 'Inventory';
        
        // Use syncDate if provided, otherwise use transaction date
        const dateToUse = syncDate ? new Date(syncDate) : transaction.transactionDate;
        
        // Expand C/P SKUs to individual SKUs (using TARGET location for checking)
        const { expandedItems, missingSkus: expandedMissingSkus } = await expandComboPackSkus(transaction, locationToSync);
        
        console.log(`[syncToSheets] Transaction ${transaction._id}: ${transaction.items.length} original items → ${expandedItems.length} expanded items`);
        
        // Check if expandedItems is empty
        if (expandedItems.length === 0) {
          console.warn(`[syncToSheets] Transaction ${transaction._id} has no items to sync after expansion`);
          continue;
        }
        
        // Add all expanded items to batch update queue
        for (const item of expandedItems) {
          // Skip items without valid SKU
          if (!item.sku || typeof item.sku !== 'string') {
            console.warn(`Skipping item without valid SKU in transaction ${transaction._id}`);
            continue;
          }
          
          // IMPORTANT: Use item.quantity (the transaction quantity), NOT receivedQuantity
          const quantityToSync = item.quantity || 0;
          
          console.log(`[syncToSheets] Preparing batch update for ${item.sku}: quantity=${quantityToSync}, receivedQuantity=${item.receivedQuantity}, receivedStatus=${item.receivedStatus}`);
          
          if (quantityToSync === 0) {
            console.warn(`[syncToSheets] ⚠️ WARNING: Zero quantity for ${item.sku} in transaction ${transaction._id}`);
          }
          
          const updateKey = `${transaction._id}_${item.sku}`;
          
          batchUpdates.push({
            spreadsheetId,
            sheetName,
            sku: item.sku,
            transactionType: transaction.transactionType,
            date: dateToUse,
            quantity: quantityToSync,
            mode: syncMode,
            orderId: item.orderId?._id || item.orderId || null,
            orderName: item.orderName || (item.orderId?.orderName) || 'N/A',
            transactionId: transaction._id.toString() // Store transaction ID for tracking
          });
          
          // Track for later marking as synced
          if (!transactionItemMap.has(transaction._id)) {
            transactionItemMap.set(transaction._id, []);
          }
          transactionItemMap.get(transaction._id).push({ sku: item.sku, updateKey });
        }
      } catch (error) {
        console.error(`Error preparing transaction ${transaction._id} for batch:`, error);
      }
    }
    
    // Execute batch update (sums same SKUs, batches all reads/writes)
    console.log(`[syncToSheets] Executing batch update for ${batchUpdates.length} items from ${transactionItemMap.size} transactions`);
    
    if (batchUpdates.length === 0) {
      console.warn(`[syncToSheets] No batch updates to process. This might mean all transactions were skipped due to missing SKUs or empty expanded items.`);
      return res.json({
        success: true,
        synced: 0,
        skipped: allMissingSkus.length,
        message: 'No items to sync. All transactions may have been skipped due to missing SKUs or empty items.',
        missingSkus: handleMissingSkus === 'export' ? allMissingSkus : [],
        results: []
      });
    }
    
    let batchResults = [];
    try {
      batchResults = await batchUpdateInventoryTransactions(batchUpdates);
      console.log(`[syncToSheets] Batch update completed: ${batchResults.length} results`);
      const successfulResults = batchResults.filter(r => !r.error);
      const failedResults = batchResults.filter(r => r.error);
      console.log(`[syncToSheets] Successful: ${successfulResults.length}, Failed: ${failedResults.length}`);
    } catch (batchError) {
      console.error(`[syncToSheets] Batch update failed:`, batchError);
      // Return partial results if available, or error
      return res.status(500).json({
        success: false,
        message: 'Failed to sync transactions to Google Sheets',
        error: batchError.message,
        synced: 0,
        results: []
      });
    }
    
    // Mark transactions as synced based on batch results
    const syncResults = [];
    let syncedCount = 0;
    const successMap = new Map(); // Track successful SKUs per transaction
    
    // Build a reverse map: SKU -> transaction IDs (for quick lookup)
    // Use string IDs for consistent comparison
    const skuToTransactionMap = new Map();
    for (const [transactionId, items] of transactionItemMap.entries()) {
      const transactionIdStr = transactionId.toString();
      for (const item of items) {
        const normalizedSku = item.sku.toUpperCase();
        if (!skuToTransactionMap.has(normalizedSku)) {
          skuToTransactionMap.set(normalizedSku, []);
        }
        if (!skuToTransactionMap.get(normalizedSku).includes(transactionIdStr)) {
          skuToTransactionMap.get(normalizedSku).push(transactionIdStr);
        }
      }
    }
    
    console.log(`[syncToSheets] Built SKU to transaction map with ${skuToTransactionMap.size} unique SKUs`);
    
    // Process batch results - match SKUs to transactions
    for (const result of batchResults) {
      if (!result.error && result.sku) {
        const normalizedSku = result.sku.toUpperCase();
        const transactionIds = skuToTransactionMap.get(normalizedSku) || [];
        
        if (transactionIds.length === 0) {
          console.warn(`[syncToSheets] No transaction found for successful SKU: ${normalizedSku}`);
        }
        
        // Mark all transactions containing this SKU as having at least one success
        for (const transactionIdStr of transactionIds) {
          if (!successMap.has(transactionIdStr)) {
            successMap.set(transactionIdStr, []);
          }
          if (!successMap.get(transactionIdStr).includes(result.sku)) {
            successMap.get(transactionIdStr).push(result.sku);
          }
        }
        
        syncResults.push(result);
      } else {
        if (result.error) {
          console.warn(`[syncToSheets] Batch result error for SKU ${result.sku}: ${result.error}`);
        }
        syncResults.push(result);
      }
    }
    
    console.log(`[syncToSheets] Success map contains ${successMap.size} transactions with successful SKUs`);
    
    // Mark transactions as synced if at least one item succeeded
    for (const [transactionIdStr, successSkus] of successMap.entries()) {
      const transaction = transactions.find(t => t._id.toString() === transactionIdStr);
      if (transaction && successSkus.length > 0) {
        transaction.syncedToSheets = true;
        transaction.sheetsSyncDate = new Date();
        await transaction.save();
        syncedCount++;
        console.log(`[syncToSheets] ✅ Transaction ${transactionIdStr} synced: ${successSkus.length} item(s) succeeded`);
      } else if (!transaction) {
        console.warn(`[syncToSheets] ⚠️ Transaction ${transactionIdStr} not found in transactions array`);
      }
    }
    
    console.log(`[syncToSheets] Final synced count: ${syncedCount} out of ${transactions.length} transactions`);
    console.log('[syncToSheets] ✅ SYNC COMPLETE');
    console.log('='.repeat(80));

    const response = {
      success: true,
      synced: syncedCount,
      skipped: allMissingSkus.length,
      missingSkus: handleMissingSkus === 'export' ? allMissingSkus : [],
      results: syncResults
    };
    
    console.log('[syncToSheets] Response:', JSON.stringify(response, null, 2));
    
    res.json(response);
  } catch (error) {
    console.error('Error syncing to sheets:', error);
    // Detect permission denied and return actionable message
    const code = error?.code || error?.status || error?.response?.status;
    const status = error?.cause?.status || error?.response?.data?.error?.status;
    if (code === 403 || status === 'PERMISSION_DENIED' || /permission/i.test(error?.message || '')) {
      try {
        const { getServiceAccountEmail } = require('../services/googleSheets');
        const email = getServiceAccountEmail();
        return res.status(500).json({
          success: false,
          message: `Google Sheets permission denied.${email ? ' Share the sheet with ' + email : ''}`,
          error: error.message
        });
      } catch {
        return res.status(500).json({ success: false, message: 'Google Sheets permission denied', error: error.message });
      }
    }
    res.status(500).json({ success: false, message: 'Failed to sync to sheets', error: error.message });
  }
};

/**
 * Get SKU history (past 10 processed orders)
 */
exports.getSkuHistory = async (req, res) => {
  try {
    const { sku } = req.params;

    const transactions = await InventoryTransaction.find({
      'items.sku': new RegExp(`^${sku}$`, 'i')
    })
      .populate('items.orderId', 'orderName shopifyOrderId stage')
      .populate('items.vendor', 'name')
      .sort({ transactionDate: -1 })
      .limit(10);

    // Extract relevant item data
    const history = transactions.map(trans => ({
      transactionType: trans.transactionType,
      transactionDate: trans.transactionDate,
      location: trans.location,
      item: trans.items.find(i => i.sku.toUpperCase() === sku.toUpperCase()),
      syncedToSheets: trans.syncedToSheets
    }));

    res.json({
      success: true,
      sku,
      history
    });
  } catch (error) {
    console.error('Error fetching SKU history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SKU history',
      error: error.message
    });
  }
};

/**
 * Check for missing SKUs in inventory sheets
 */
exports.checkMissingSkus = async (req, res) => {
  try {
    const { transactions, location } = req.body;
    
    if (!transactions || !Array.isArray(transactions) || !location) {
      return res.status(400).json({
        success: false,
        message: 'transactions array and location are required'
      });
    }
    
    const { detectMissingSkus } = require('../services/inventoryGroupingService');
    const missingSkus = await detectMissingSkus(transactions, location);
    
    res.json({
      success: true,
      missingSkus,
      count: missingSkus.length,
      location
    });
  } catch (error) {
    console.error('Error checking missing SKUs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check missing SKUs',
      error: error.message
    });
  }
};

/**
 * Add multiple missing SKUs to inventory sheet
 */
exports.addMissingSkusBatch = async (req, res) => {
  try {
    const { missingSkus, location } = req.body;
    
    if (!missingSkus || !Array.isArray(missingSkus) || !location) {
      return res.status(400).json({
        success: false,
        message: 'missingSkus array and location are required'
      });
    }
    
    const { addMissingSkusToSheet } = require('../services/inventorySheetUpdateService');
    const result = await addMissingSkusToSheet(missingSkus, location);
    
    res.json({
      success: true,
      result,
      message: `Successfully added ${result.added} SKUs to ${location} inventory sheet`
    });
  } catch (error) {
    console.error('Error adding missing SKUs batch:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add missing SKUs',
      error: error.message
    });
  }
};

/**
 * Get SKU suggestions from inventory sheet
 */
exports.getSkuSuggestions = async (req, res) => {
  try {
    const { location } = req.params;
    
    if (!location || !['Okhla', 'Bahadurgarh'].includes(location)) {
      return res.status(400).json({
        success: false,
        message: 'Valid location (Okhla or Bahadurgarh) is required'
      });
    }
    
    const { getInventoryData } = require('../services/googleSheets');
    const spreadsheetId = location === 'Okhla' ? OKHLA_SPREADSHEET_ID : BAHADURGARH_SPREADSHEET_ID;
    const inventoryData = await getInventoryData(spreadsheetId, location, true); // Force refresh for fresh data
    
    const suggestions = Object.keys(inventoryData).map(sku => ({
      sku,
      productName: inventoryData[sku].productName || '',
      available: inventoryData[sku].available,
      safetyStock: inventoryData[sku].safetyStock,
      location
    }));
    
    res.json({
      success: true,
      suggestions,
      count: suggestions.length,
      location
    });
  } catch (error) {
    console.error('Error getting SKU suggestions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get SKU suggestions',
      error: error.message
    });
  }
};

/**
 * Get transactions by source order
 */
exports.getTransactionsByOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const transactions = await InventoryTransaction.find({ sourceOrder: orderId })
      .populate('items.orderId', 'orderName shopifyOrderId')
      .populate('items.vendor', 'name')
      .sort({ transactionDate: -1 });
    
    res.json({ success: true, transactions });
  } catch (error) {
    console.error('Error fetching transactions by order:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch transactions', 
      error: error.message 
    });
  }
};

/**
 * Get all auto-created transactions
 */
exports.getAutoCreatedTransactions = async (req, res) => {
  try {
    const { transactionType, location, syncedToSheets } = req.query;
    const filter = { autoCreated: true };
    if (transactionType) filter.transactionType = transactionType;
    if (location) filter.location = location;
    if (syncedToSheets !== undefined) filter.syncedToSheets = syncedToSheets === 'true';
    
    const transactions = await InventoryTransaction.find(filter)
      .populate('sourceOrder', 'orderName shopifyOrderId stage')
      .populate('items.vendor', 'name')
      .sort({ transactionDate: -1 });
    
    res.json({ success: true, transactions, count: transactions.length });
  } catch (error) {
    console.error('Error fetching auto-created transactions:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch auto-created transactions', 
      error: error.message 
    });
  }
};

/**
 * Export missing SKUs to CSV
 */
exports.exportMissingSkus = async (req, res) => {
  try {
    const { missingSkus, location, transactionType } = req.body;
    
    const { Parser } = require('json2csv');
    const data = missingSkus.map(sku => ({
      SKU: sku,
      Location: location,
      TransactionType: transactionType,
      Status: 'Not Found in Sheet',
      Action: 'Please add to inventory sheet'
    }));
    
    const parser = new Parser();
    const csv = parser.parse(data);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=missing-skus-${location}-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting missing SKUs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to export', 
      error: error.message 
    });
  }
};

/**
 * Get top items by quantity
 */
exports.getTopItems = async (req, res) => {
  try {
    const { transactionType, location, limit = 50, startDate, endDate } = req.query;
    
    const match = {
      transactionType,
      location,
      syncedToSheets: true
    };
    
    if (startDate || endDate) {
      match.transactionDate = {};
      if (startDate) match.transactionDate.$gte = new Date(startDate);
      if (endDate) match.transactionDate.$lte = new Date(endDate);
    }
    
    const topItems = await InventoryTransaction.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.sku',
          productName: { $first: '$items.productName' },
          totalQuantity: { $sum: '$items.quantity' },
          transactionCount: { $sum: 1 },
          locations: { $addToSet: '$location' },
          dates: { $addToSet: '$transactionDate' }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: parseInt(limit) }
    ]);
    
    res.json({
      success: true,
      items: topItems.map(item => ({
        sku: item._id,
        productName: item.productName,
        totalQuantity: item.totalQuantity,
        transactionCount: item.transactionCount,
        locations: item.locations,
        dates: item.dates
      }))
    });
  } catch (error) {
    console.error('Error getting top items:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get top items',
      error: error.message
    });
  }
};

/**
 * Get sales trend for a specific SKU
 */
exports.getSalesTrend = async (req, res) => {
  try {
    const { sku, location, days = 30 } = req.query;
    
    if (!sku || !location) {
      return res.status(400).json({
        success: false,
        message: 'sku and location are required'
      });
    }
    
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const transactions = await InventoryTransaction.find({
      'items.sku': new RegExp(`^${sku}$`, 'i'),
      location,
      transactionType: 'Sales',
      syncedToSheets: true,
      transactionDate: { $gte: startDate, $lte: endDate }
    }).sort({ transactionDate: 1 });
    
    const trendData = transactions.map(trans => ({
      date: trans.transactionDate,
      quantity: trans.items.find(item => item.sku.toUpperCase() === sku.toUpperCase())?.quantity || 0,
      location: trans.location,
      orderName: trans.items[0]?.orderName
    }));
    
    res.json({
      success: true,
      sku,
      location,
      trendData,
      period: {
        start: startDate,
        end: endDate,
        days: parseInt(days)
      }
    });
  } catch (error) {
    console.error('Error getting sales trend:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sales trend',
      error: error.message
    });
  }
};

/**
 * Get data quality report for inventory sheets
 */
/**
 * Check for date conflicts before syncing
 */
exports.checkDateConflicts = async (req, res) => {
  try {
    const { transactions, location } = req.body;
    
    if (!transactions || !Array.isArray(transactions) || !location) {
      return res.status(400).json({
        success: false,
        message: 'transactions array and location are required'
      });
    }
    
    const { checkDateExists, getExistingValuesForDate } = require('../services/googleSheets');
    const spreadsheetId = location === 'Okhla' ? OKHLA_SPREADSHEET_ID : BAHADURGARH_SPREADSHEET_ID;
    const sheetName = INVENTORY_TAB_NAME || 'Inventory'; // Use "Inventory" directly
    
    const conflictingDates = [];
    
    // Collect unique dates and their SKUs
    const dateSkusMap = {};
    transactions.forEach(trans => {
      const dateStr = trans.transactionDate ? new Date(trans.transactionDate).toISOString().split('T')[0] : null;
      if (!dateStr) return;
      
      if (!dateSkusMap[dateStr]) {
        dateSkusMap[dateStr] = { skus: new Set(), transactionType: trans.transactionType };
      }
      
      trans.items?.forEach(item => {
        dateSkusMap[dateStr].skus.add(item.sku);
      });
    });
    
    // Check each date for conflicts
    for (const [dateStr, info] of Object.entries(dateSkusMap)) {
      const dateExists = await checkDateExists(spreadsheetId, sheetName, dateStr);
      
      if (dateExists) {
        const skus = Array.from(info.skus);
        const existingValues = await getExistingValuesForDate(spreadsheetId, sheetName, dateStr, skus);
        
        conflictingDates.push({
          date: dateStr,
          transactionType: info.transactionType,
          skus,
          existingValues,
          hasData: Object.keys(existingValues).length > 0
        });
      }
    }
    
    res.json({
      success: true,
      location,
      conflictingDates,
      count: conflictingDates.length,
      hasConflicts: conflictingDates.length > 0
    });
  } catch (error) {
    console.error('Error checking date conflicts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check date conflicts',
      error: error.message
    });
  }
};

/**
 * Resolve date conflict based on user's choice
 */
exports.resolveDateConflict = async (req, res) => {
  try {
    const { 
      transactions, 
      location, 
      date, 
      resolution, 
      selectedSkus = null 
    } = req.body;
    
    if (!transactions || !location || !date || !resolution) {
      return res.status(400).json({
        success: false,
        message: 'transactions, location, date, and resolution are required'
      });
    }
    
    const { updateInventoryTransaction } = require('../services/googleSheets');
    const spreadsheetId = location === 'Okhla' ? OKHLA_SPREADSHEET_ID : BAHADURGARH_SPREADSHEET_ID;
    const sheetName = INVENTORY_TAB_NAME || 'Inventory'; // Use "Inventory" directly
    
    const results = [];
    
    // Process each transaction
    for (const trans of transactions) {
      if (trans.transactionDate !== date) continue;
      
      for (const item of trans.items || []) {
        // Skip if manual mode and SKU not selected
        if (resolution === 'manual' && selectedSkus && !selectedSkus.includes(item.sku)) {
          continue;
        }
        
        let finalQuantity = item.quantity;
        
        // If SUM mode, add to existing
        if (resolution === 'sum') {
          const { getExistingValuesForDate } = require('../services/googleSheets');
          const existingValues = await getExistingValuesForDate(spreadsheetId, sheetName, date, [item.sku]);
          const existing = existingValues[item.sku.toUpperCase()];
          
          if (existing) {
            finalQuantity = (existing.sales || 0) + (existing.purchase || 0) + (existing.return || 0) + item.quantity;
          }
        }
        
        // Update the transaction
        try {
          const result = await updateInventoryTransaction(
            spreadsheetId,
            sheetName,
            item.sku,
            trans.transactionType,
            date,
            finalQuantity
          );
          
          results.push({
            sku: item.sku,
            transactionType: trans.transactionType,
            success: true,
            cell: result.cell
          });
        } catch (error) {
          results.push({
            sku: item.sku,
            transactionType: trans.transactionType,
            success: false,
            error: error.message
          });
        }
      }
    }
    
    res.json({
      success: true,
      resolution,
      results,
      updated: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });
  } catch (error) {
    console.error('Error resolving date conflict:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resolve date conflict',
      error: error.message
    });
  }
};

exports.getDataQualityReport = async (req, res) => {
  try {
    const { location } = req.query;
    
    if (!location || !['Okhla', 'Bahadurgarh'].includes(location)) {
      return res.status(400).json({
        success: false,
        message: 'Valid location is required'
      });
    }
    
    const { getInventoryData } = require('../services/googleSheets');
    const spreadsheetId = location === 'Okhla' ? OKHLA_SPREADSHEET_ID : BAHADURGARH_SPREADSHEET_ID;
    const inventoryData = await getInventoryData(spreadsheetId, location, true); // Force refresh for fresh data
    
    const issues = {
      missingProductName: [],
      missingSafetyStock: [],
      missingAvailable: [],
      zeroQuantity: []
    };
    
    for (const [sku, data] of Object.entries(inventoryData)) {
      if (!data.productName || data.productName.trim() === '') {
        issues.missingProductName.push({ sku, rowIndex: data.rowIndex });
      }
      
      if (data.safetyStock === 0 || data.safetyStock === null || data.safetyStock === undefined) {
        issues.missingSafetyStock.push({ sku, productName: data.productName, rowIndex: data.rowIndex });
      }
      
      if (data.available === null || data.available === undefined) {
        issues.missingAvailable.push({ sku, productName: data.productName, rowIndex: data.rowIndex });
      }
      
      if (data.available === 0 && data.safetyStock === 0) {
        issues.zeroQuantity.push({ sku, productName: data.productName, rowIndex: data.rowIndex });
      }
    }
    
    res.json({
      success: true,
      location,
      totalSkus: Object.keys(inventoryData).length,
      issues,
      summary: {
        missingProductName: issues.missingProductName.length,
        missingSafetyStock: issues.missingSafetyStock.length,
        missingAvailable: issues.missingAvailable.length,
        zeroQuantity: issues.zeroQuantity.length
      }
    });
  } catch (error) {
    console.error('Error getting data quality report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get data quality report',
      error: error.message
    });
  }
};

/**
 * Get forecast for a specific SKU using all 4 methods
 */
exports.getForecast = async (req, res) => {
  try {
    const { sku } = req.params;
    const { location, days = 30 } = req.query;
    
    if (!sku || !location) {
      return res.status(400).json({
        success: false,
        message: 'sku and location are required'
      });
    }
    
    // Get historical transactions for this SKU
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const transactions = await InventoryTransaction.find({
      'items.sku': new RegExp(`^${sku}$`, 'i'),
      location,
      syncedToSheets: true,
      transactionDate: { $gte: startDate, $lte: endDate }
    }).sort({ transactionDate: 1 });
    
    // Prepare historical data
    const historicalData = transactions.map(trans => ({
      date: trans.transactionDate,
      quantity: trans.items.find(item => item.sku.toUpperCase() === sku.toUpperCase())?.quantity || 0
    }));
    
    if (historicalData.length < 2) {
      return res.json({
        success: true,
        sku,
        location,
        message: 'Insufficient historical data for forecasting',
        forecasts: null
      });
    }
    
    const { getAllForecasts } = require('../services/forecastingService');
    const forecasts = getAllForecasts(historicalData);
    
    res.json({
      success: true,
      sku,
      location,
      historicalDataPoints: historicalData.length,
      forecasts
    });
  } catch (error) {
    console.error('Error getting forecast:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get forecast',
      error: error.message
    });
  }
};

/**
 * Get inventory turnover rate
 */
exports.getTurnoverRate = async (req, res) => {
  try {
    const { location, days = 30 } = req.query;
    
    if (!location) {
      return res.status(400).json({
        success: false,
        message: 'location is required'
      });
    }
    
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    // Get sales transactions
    const sales = await InventoryTransaction.aggregate([
      {
        $match: {
          location,
          transactionType: 'Sales',
          syncedToSheets: true,
          transactionDate: { $gte: startDate, $lte: endDate }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.sku',
          totalSales: { $sum: '$items.quantity' },
          transactionCount: { $sum: 1 }
        }
      }
    ]);
    
    // Get inventory data for current stock levels
    const { getInventoryData } = require('../services/googleSheets');
    // Use environment variables for spreadsheet IDs
    const okhlaId = process.env.GOOGLE_SHEETS_OKHLA_SHEET_ID;
    const bahadurgarhId = process.env.GOOGLE_SHEETS_BAHADURGARH_SHEET_ID;
    
    if (!okhlaId || !bahadurgarhId) {
      return res.status(500).json({
        success: false,
        message: 'Missing required environment variables: GOOGLE_SHEETS_OKHLA_SHEET_ID, GOOGLE_SHEETS_BAHADURGARH_SHEET_ID'
      });
    }
    const spreadsheetId = location === 'Okhla' ? okhlaId : bahadurgarhId;
    const inventoryData = await getInventoryData(spreadsheetId, location);
    
    const turnover = sales.map(sale => {
      const sku = sale._id;
      const avgInventory = (inventoryData[sku]?.available || 0) / 2;
      const turnoverRate = avgInventory > 0 ? (sale.totalSales / avgInventory) : 0;
      
      return {
        sku,
        totalSales: sale.totalSales,
        averageInventory: Math.round(avgInventory * 100) / 100,
        turnoverRate: turnoverRate.toFixed(2),
        transactionCount: sale.transactionCount
      };
    }).filter(item => item.turnoverRate > 0).sort((a, b) => b.turnoverRate - a.turnoverRate);
    
    res.json({
      success: true,
      location,
      period: { start: startDate, end: endDate, days: parseInt(days) },
      turnover
    });
  } catch (error) {
    console.error('Error getting turnover rate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get turnover rate',
      error: error.message
    });
  }
};

/**
 * Get stock levels vs safety stock
 */
exports.getStockLevels = async (req, res) => {
  try {
    const { location } = req.params;
    
    if (!location || !['Okhla', 'Bahadurgarh'].includes(location)) {
      return res.status(400).json({
        success: false,
        message: 'Valid location is required'
      });
    }
    
    const { getInventoryData } = require('../services/googleSheets');
    // Use environment variables for spreadsheet IDs
    const okhlaId = process.env.GOOGLE_SHEETS_OKHLA_SHEET_ID;
    const bahadurgarhId = process.env.GOOGLE_SHEETS_BAHADURGARH_SHEET_ID;
    
    if (!okhlaId || !bahadurgarhId) {
      return res.status(500).json({
        success: false,
        message: 'Missing required environment variables: GOOGLE_SHEETS_OKHLA_SHEET_ID, GOOGLE_SHEETS_BAHADURGARH_SHEET_ID'
      });
    }
    const spreadsheetId = location === 'Okhla' ? okhlaId : bahadurgarhId;
    
    const inventoryData = await getInventoryData(spreadsheetId, location);
    
    const analysis = [];
    const alerts = {
      lowStock: [],
      outOfStock: [],
      overstocked: []
    };
    
    for (const [sku, data] of Object.entries(inventoryData)) {
      const available = data.available || 0;
      const safetyStock = data.safetyStock || 0;
      
      const status = available <= 0 ? 'Out of Stock' 
        : available < safetyStock ? 'Low Stock'
        : available > safetyStock * 2 ? 'Overstocked'
        : 'Normal';
      
      analysis.push({
        sku,
        productName: data.productName,
        available,
        safetyStock,
        status,
        difference: available - safetyStock,
        percentage: safetyStock > 0 ? ((available / safetyStock) * 100).toFixed(1) : 0
      });
      
      if (available < safetyStock) {
        alerts.lowStock.push({ sku, productName: data.productName, available, safetyStock });
      }
      if (available <= 0) {
        alerts.outOfStock.push({ sku, productName: data.productName });
      }
      if (available > safetyStock * 2) {
        alerts.overstocked.push({ sku, productName: data.productName, available, safetyStock });
      }
    }
    
    res.json({
      success: true,
      location,
      totalSkus: analysis.length,
      analysis: analysis.sort((a, b) => b.difference - a.difference),
      alerts,
      summary: {
        lowStock: alerts.lowStock.length,
        outOfStock: alerts.outOfStock.length,
        overstocked: alerts.overstocked.length,
        normal: analysis.filter(a => a.status === 'Normal').length
      }
    });
  } catch (error) {
    console.error('Error getting stock levels:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get stock levels',
      error: error.message
    });
  }
};

exports.getStockForSku = async (req, res) => {
  try {
    const { sku } = req.params;
    if (!sku) {
      return res.status(400).json({ success: false, message: 'sku is required' });
    }
    const { resolveSkuComponents, getInventoryData } = require('../services/googleSheets');
    const okhlaId = process.env.GOOGLE_SHEETS_OKHLA_SHEET_ID;
    const bahId = process.env.GOOGLE_SHEETS_BAHADURGARH_SHEET_ID;
    if (!okhlaId || !bahId) {
      return res.status(500).json({ success: false, message: 'Missing sheet IDs' });
    }
    const components = await resolveSkuComponents(sku);
    const okhlaData = await getInventoryData(okhlaId, 'Okhla');
    const bahData = await getInventoryData(bahId, 'Bahadurgarh');
    const detail = components.components.map(c => {
      const o = okhlaData[c.sku] || {};
      const b = bahData[c.sku] || {};
      return {
        sku: c.sku,
        qtyPerUnit: c.qty,
        okhla: { available: o.available || 0, safetyStock: o.safetyStock || 0 },
        bahadurgarh: { available: b.available || 0, safetyStock: b.safetyStock || 0 }
      };
    });
    const summary = detail.reduce((acc, d) => {
      acc.okhla.available += d.okhla.available;
      acc.okhla.safetyStock += d.okhla.safetyStock;
      acc.bahadurgarh.available += d.bahadurgarh.available;
      acc.bahadurgarh.safetyStock += d.bahadurgarh.safetyStock;
      return acc;
    }, { okhla: { available: 0, safetyStock: 0 }, bahadurgarh: { available: 0, safetyStock: 0 } });
    return res.json({ success: true, sku, type: components.type, components: detail, summary });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to get stock', error: error.message });
  }
};

/**
 * Export enhanced Excel file
 */
exports.exportEnhanced = async (req, res) => {
  try {
    const { location, transactionType, limit = 50 } = req.query;
    
    // Get transactions
    const filter = {};
    if (location) filter.location = location;
    if (transactionType) filter.transactionType = transactionType;
    
    const transactions = await InventoryTransaction.find(filter)
      .populate('items.vendor')
      .sort({ transactionDate: -1 })
      .limit(parseInt(limit));
    
    // Get analytics
    const analytics = await inventoryController.getTopItems(req, res);
    
    // Generate Excel
    const { exportToExcel } = require('../services/excelExportService');
    const buffer = await exportToExcel(transactions, analytics.data, null);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=inventory_export_${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting Excel:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export Excel',
      error: error.message
    });
  }
};

/**
 * Export forecast data for SKU
 */
exports.exportForecast = async (req, res) => {
  try {
    const { sku } = req.params;
    const { location } = req.query;
    
    const forecastResult = await inventoryController.getForecast(req, res);
    if (!forecastResult.data?.forecasts) {
      return res.status(404).json({ success: false, message: 'No forecast data available' });
    }
    
    const { exportForecastData } = require('../services/excelExportService');
    const buffer = await exportForecastData(forecastResult.data.forecasts);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=forecast_${sku}_${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting forecast:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export forecast',
      error: error.message
    });
  }
};

/**
 * Export analytics data
 */
exports.exportAnalytics = async (req, res) => {
  try {
    const { location } = req.query;
    
    const topItemsResult = await inventoryController.getTopItems(req, res);
    const qualityResult = await inventoryController.getDataQualityReport(req, res);
    
    const analytics = {
      topItems: topItemsResult.data?.items || [],
      dataQuality: qualityResult.data || null
    };
    
    const { exportAnalyticsData } = require('../services/excelExportService');
    const buffer = await exportAnalyticsData(analytics);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=analytics_${location || 'all'}_${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export analytics',
      error: error.message
    });
  }
};

/**
 * Get sync job progress
 */
exports.getSyncProgress = async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const { getJobStatus } = require('../services/backgroundSyncService');
    const job = getJobStatus(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    const progressPercent = job.progress.total > 0
      ? Math.round((job.progress.processed / job.progress.total) * 100)
      : 0;
    
    res.json({
      success: true,
      job: {
        jobId: job.jobId,
        status: job.status,
        progress: {
          ...job.progress,
          percent: progressPercent
        },
        results: job.results.slice(0, 100), // Limit results for response size
        errors: job.errors.slice(0, 100), // Limit errors for response size
        startTime: job.startTime,
        endTime: job.endTime,
        duration: job.endTime ? job.endTime - job.startTime : Date.now() - job.startTime,
        createdAt: job.createdAt
      }
    });
  } catch (error) {
    console.error('Error getting sync progress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sync progress',
      error: error.message
    });
  }
};

/**
 * Get all sync jobs
 */
exports.getAllSyncJobs = async (req, res) => {
  try {
    const { getAllJobs } = require('../services/backgroundSyncService');
    const jobs = getAllJobs();
    
    const jobsWithProgress = jobs.map(job => ({
      jobId: job.jobId,
      status: job.status,
      progress: {
        ...job.progress,
        percent: job.progress.total > 0
          ? Math.round((job.progress.processed / job.progress.total) * 100)
          : 0
      },
      location: job.location,
      totalTransactions: job.transactionIds.length,
      startTime: job.startTime,
      endTime: job.endTime,
      duration: job.endTime ? job.endTime - job.startTime : Date.now() - job.startTime,
      createdAt: job.createdAt
    }));
    
    res.json({
      success: true,
      jobs: jobsWithProgress
    });
  } catch (error) {
    console.error('Error getting all sync jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sync jobs',
      error: error.message
    });
  }
};

/**
 * Split a transaction into two parts
 * Updates the original transaction with new quantity and optionally creates a pending transaction
 */
exports.splitTransaction = async (req, res) => {
  try {
    const { transactionId, newQuantity, remainingQuantity, action, remark } = req.body;

    if (!transactionId || !newQuantity || remainingQuantity === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: transactionId, newQuantity, remainingQuantity'
      });
    }

    const transaction = await InventoryTransaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Calculate total quantity
    const totalQty = transaction.items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
    
    if (parseFloat(newQuantity) >= totalQty) {
      return res.status(400).json({
        success: false,
        message: 'New quantity must be less than original quantity'
      });
    }

    // Update original transaction with new quantity
    // Distribute the new quantity proportionally across items
    const ratio = parseFloat(newQuantity) / totalQty;
    
    transaction.items = transaction.items.map(item => {
      const originalQty = parseFloat(item.quantity) || 0;
      const newQty = Math.round(originalQty * ratio);
      return {
        ...item,
        quantity: newQty
      };
    });

    // Add remark to transaction notes
    if (remark) {
      transaction.notes = transaction.notes 
        ? `${transaction.notes}\n[Split] ${remark}` 
        : `[Split] ${remark}`;
    }

    await transaction.save();

    // If action is 'pending', create a new transaction with remaining quantity
    if (action === 'pending' && remainingQuantity > 0) {
      const remainingRatio = parseFloat(remainingQuantity) / totalQty;
      
      const pendingItems = transaction.items.map(item => {
        const originalQty = parseFloat(item.quantity) || 0;
        const remainingQty = Math.round(originalQty * remainingRatio);
        return {
          sku: item.sku,
          productName: item.productName,
          quantity: remainingQty,
          orderName: item.orderName,
          orderId: item.orderId,
          vendor: item.vendor,
          vendorName: item.vendorName,
          receivedStatus: 'pending',
          receivedQuantity: 0
        };
      }).filter(item => item.quantity > 0); // Only include items with quantity > 0

      if (pendingItems.length > 0) {
        const pendingTransaction = new InventoryTransaction({
          transactionType: transaction.transactionType,
          transactionDate: transaction.transactionDate,
          location: transaction.location,
          items: pendingItems,
          notes: `[Split from ${transaction._id}] ${remark || 'Remaining quantity from split transaction'}`,
          syncedToSheets: false,
          autoCreated: false,
          sourceOrder: transaction.sourceOrder,
          createdBy: req.user?.email || 'system'
        });

        await pendingTransaction.save();

        return res.json({
          success: true,
          message: 'Transaction split successfully',
          originalTransaction: transaction,
          pendingTransaction: pendingTransaction
        });
      }
    }

    res.json({
      success: true,
      message: 'Transaction split successfully',
      originalTransaction: transaction
    });
  } catch (error) {
    console.error('Error splitting transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to split transaction',
      error: error.message
    });
  }
};

module.exports = exports;
