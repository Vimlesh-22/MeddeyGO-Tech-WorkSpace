const InventoryTransaction = require('../models/InventoryTransaction');
const { getInventoryData } = require('./googleSheets');

// Use environment variables for spreadsheet IDs (required, no fallbacks)
const OKHLA_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_OKHLA_SHEET_ID;
const BAHADURGARH_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_BAHADURGARH_SHEET_ID;

if (!OKHLA_SPREADSHEET_ID || !BAHADURGARH_SPREADSHEET_ID) {
  throw new Error('Missing required environment variables: GOOGLE_SHEETS_OKHLA_SHEET_ID, GOOGLE_SHEETS_BAHADURGARH_SHEET_ID');
}

/**
 * Group transactions by SKU and sum quantities
 * @param {Array} transactions - Array of InventoryTransaction documents or plain objects
 * @returns {Array} Grouped transactions with total quantities
 */
const groupTransactionsBySku = (transactions) => {
  const grouped = {};
  
  transactions.forEach(trans => {
    const items = trans.items || [];
    items.forEach(item => {
      // Skip items without SKU
      if (!item.sku || typeof item.sku !== 'string') {
        console.warn('Skipping item without valid SKU:', item);
        return;
      }
      
      const key = `${item.sku.toUpperCase()}-${trans.transactionType}-${trans.location}`;
      
      if (!grouped[key]) {
        grouped[key] = {
          sku: item.sku.toUpperCase(),
          productName: item.productName,
          transactionType: trans.transactionType,
          location: trans.location,
          totalQuantity: 0,
          dates: new Set(),
          transactionIds: [],
          itemDetails: []
        };
      }
      
      grouped[key].totalQuantity += item.quantity || 0;
      grouped[key].dates.add(new Date(trans.transactionDate).toISOString().split('T')[0]);
      grouped[key].transactionIds.push(trans._id || trans.id);
      grouped[key].itemDetails.push({
        transactionId: trans._id || trans.id,
        quantity: item.quantity,
        date: trans.transactionDate,
        orderName: item.orderName,
        vendorName: item.vendorName,
        shopifyOrderId: item.shopifyOrderId
      });
    });
  });
  
  // Convert Set to Array and return values
  return Object.values(grouped).map(group => ({
    ...group,
    dates: Array.from(group.dates).sort()
  }));
};

/**
 * Detect SKUs that are missing from the inventory sheet
 * Accepts either grouped transactions or raw transactions (will auto-group if needed)
 * @param {Array} transactions - Grouped transaction data or raw transaction data
 * @param {String} location - 'Okhla' or 'Bahadurgarh'
 * @returns {Array} Array of missing SKU objects with details
 */
const detectMissingSkus = async (transactions, location) => {
  try {
    // Check if transactions are already grouped (have sku property directly)
    // or if they are raw transactions (have items array)
    let groupedTransactions;
    if (transactions && transactions.length > 0) {
      // Check if first item looks like a grouped transaction (has sku, transactionType, location)
      const firstItem = transactions[0];
      if (firstItem.sku && firstItem.transactionType && firstItem.location && !firstItem.items) {
        // Already grouped
        groupedTransactions = transactions;
      } else {
        // Raw transactions - need to group them first
        groupedTransactions = groupTransactionsBySku(transactions);
      }
    } else {
      groupedTransactions = [];
    }
    
    const spreadsheetId = location === 'Okhla' ? OKHLA_SPREADSHEET_ID : BAHADURGARH_SPREADSHEET_ID;
    const inventoryData = await getInventoryData(spreadsheetId, location, true); // Force refresh for fresh data
    
    const missing = [];
    
    for (const group of groupedTransactions) {
      // Skip if group.sku is undefined or null
      if (!group.sku || typeof group.sku !== 'string') {
        console.warn('Skipping group without valid SKU:', group);
        continue;
      }
      
      const normalizedSku = group.sku.toUpperCase();
      
      if (!inventoryData[normalizedSku]) {
        missing.push({
          sku: normalizedSku,
          productName: group.productName || 'Unknown',
          transactionType: group.transactionType,
          totalQuantity: group.totalQuantity,
          suggestedInitialQty: 0, // Default suggestion
          suggestedSafetyStock: 0, // Default suggestion
          location: location,
          dates: group.dates || [],
          affectedTransactions: group.transactionIds ? group.transactionIds.length : 1
        });
      }
    }
    
    console.log(`Detected ${missing.length} missing SKUs in ${location} inventory sheet`);
    return missing;
  } catch (error) {
    console.error('Error detecting missing SKUs:', error);
    throw error;
  }
};

/**
 * Validate if a single SKU exists in the inventory sheet
 * @param {String} sku - SKU to validate
 * @param {String} location - 'Okhla' or 'Bahadurgarh'
 * @returns {Boolean} True if SKU exists, false otherwise
 */
const validateSkuInSheet = async (sku, location) => {
  try {
    if (!sku || typeof sku !== 'string') {
      return false;
    }
    
    const spreadsheetId = location === 'Okhla' ? OKHLA_SPREADSHEET_ID : BAHADURGARH_SPREADSHEET_ID;
    const inventoryData = await getInventoryData(spreadsheetId, location, true); // Force refresh for fresh data
    
    const normalizedSku = sku.toUpperCase();
    return !!inventoryData[normalizedSku];
  } catch (error) {
    console.error('Error validating SKU in sheet:', error);
    return false;
  }
};

/**
 * Group transactions from database by filters
 * @param {Object} filters - Filter criteria (transactionType, location, dateRange, etc.)
 * @returns {Array} Grouped transactions
 */
const groupTransactionsFromDb = async (filters = {}) => {
  try {
    const query = {};
    
    if (filters.transactionType) query.transactionType = filters.transactionType;
    if (filters.location) query.location = filters.location;
    if (filters.syncedToSheets !== undefined) query.syncedToSheets = filters.syncedToSheets;
    
    if (filters.startDate || filters.endDate) {
      query.transactionDate = {};
      if (filters.startDate) query.transactionDate.$gte = new Date(filters.startDate);
      if (filters.endDate) query.transactionDate.$lte = new Date(filters.endDate);
    }
    
    const transactions = await InventoryTransaction.find(query)
      .populate('items.orderId', 'orderName shopifyOrderId')
      .populate('items.vendor', 'name')
      .lean();
    
    return groupTransactionsBySku(transactions);
  } catch (error) {
    console.error('Error grouping transactions from DB:', error);
    throw error;
  }
};

/**
 * Get summary statistics for grouped data
 * @param {Array} groupedTransactions - Grouped transaction data
 * @returns {Object} Summary statistics
 */
const getGroupingSummary = (groupedTransactions) => {
  const summary = {
    totalSkus: groupedTransactions.length,
    totalQuantity: 0,
    byTransactionType: {},
    byLocation: {},
    dateRange: {
      earliest: null,
      latest: null
    }
  };
  
  groupedTransactions.forEach(group => {
    summary.totalQuantity += group.totalQuantity;
    
    // By transaction type
    if (!summary.byTransactionType[group.transactionType]) {
      summary.byTransactionType[group.transactionType] = { count: 0, quantity: 0 };
    }
    summary.byTransactionType[group.transactionType].count += 1;
    summary.byTransactionType[group.transactionType].quantity += group.totalQuantity;
    
    // By location
    if (!summary.byLocation[group.location]) {
      summary.byLocation[group.location] = { count: 0, quantity: 0 };
    }
    summary.byLocation[group.location].count += 1;
    summary.byLocation[group.location].quantity += group.totalQuantity;
    
    // Date range
    if (group.dates && group.dates.length > 0) {
      const earliest = group.dates[0];
      const latest = group.dates[group.dates.length - 1];
      
      if (!summary.dateRange.earliest || earliest < summary.dateRange.earliest) {
        summary.dateRange.earliest = earliest;
      }
      if (!summary.dateRange.latest || latest > summary.dateRange.latest) {
        summary.dateRange.latest = latest;
      }
    }
  });
  
  return summary;
};

module.exports = {
  groupTransactionsBySku,
  detectMissingSkus,
  validateSkuInSheet,
  groupTransactionsFromDb,
  getGroupingSummary
};
