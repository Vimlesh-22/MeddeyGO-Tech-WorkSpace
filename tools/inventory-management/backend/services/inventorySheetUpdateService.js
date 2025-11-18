const InventoryTransaction = require('../models/InventoryTransaction');
const {
  getGoogleSheetsClient,
  updateInventoryTransaction,
  batchUpdateInventoryTransactions,
  getInventoryData,
  getSheetMetadata,
  findSkuRow,
  getInventorySheetName,
  INVENTORY_TAB_NAME,
  findOrCreateDateColumn
} = require('./googleSheets');

// Use environment variables for spreadsheet IDs (required, no fallbacks)
const OKHLA_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_OKHLA_SHEET_ID;
const BAHADURGARH_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_BAHADURGARH_SHEET_ID;

if (!OKHLA_SPREADSHEET_ID || !BAHADURGARH_SPREADSHEET_ID) {
  throw new Error('Missing required environment variables: GOOGLE_SHEETS_OKHLA_SHEET_ID, GOOGLE_SHEETS_BAHADURGARH_SHEET_ID');
}

// Google Sheets limits
const MAX_ROWS = 1000000;
const MAX_COLUMNS = 18278;

/**
 * Update grouped transactions to Google Sheets
 * @param {Array} groupedTransactions - Grouped transaction data
 * @param {String} location - 'Okhla' or 'Bahadurgarh'
 * @returns {Object} Results of the update operation
 */
const updateGroupedTransactionsToSheet = async (groupedTransactions, location) => {
  try {
    const spreadsheetId = location === 'Okhla' ? OKHLA_SPREADSHEET_ID : BAHADURGARH_SPREADSHEET_ID;
    const sheetName = INVENTORY_TAB_NAME || 'Inventory'; // Use "Inventory" directly (actual sheet name)
    const fullSheetRef = sheetName; // Use just "Inventory", not "Inventory!Inventory"
    
    const results = {
      updated: [],
      failed: [],
      skipped: []
    };
    
    for (const group of groupedTransactions) {
      try {
        // Process each date in the group
        for (const dateStr of group.dates) {
          const date = new Date(dateStr);
          
          // Ensure date column exists before updating
          await findOrCreateDateColumn(spreadsheetId, fullSheetRef, date);
          
          const result = await updateInventoryTransaction(
            spreadsheetId,
            fullSheetRef,
            group.sku,
            group.transactionType,
            date,
            group.totalQuantity
          );
          
          results.updated.push({
            sku: group.sku,
            transactionType: group.transactionType,
            date: dateStr,
            quantity: group.totalQuantity,
            cell: result.cell,
            success: true
          });
        }
        
        // Mark transactions as synced
        await markTransactionsAsSynced(group.transactionIds);
        
      } catch (error) {
        console.error(`Error updating SKU ${group.sku}:`, error);
        results.failed.push({
          sku: group.sku,
          transactionType: group.transactionType,
          error: error.message,
          success: false
        });
      }
    }
    
    console.log(`Sheet update complete: ${results.updated.length} updated, ${results.failed.length} failed`);
    return results;
  } catch (error) {
    console.error('Error in updateGroupedTransactionsToSheet:', error);
    throw error;
  }
};

/**
 * Add missing SKUs to inventory sheet
 * @param {Array} missingSkus - Array of SKU objects to add
 * @param {String} location - 'Okhla' or 'Bahadurgarh'
 * @returns {Object} Results of the add operation
 */
const addMissingSkusToSheet = async (missingSkus, location) => {
  try {
    const spreadsheetId = location === 'Okhla' ? OKHLA_SPREADSHEET_ID : BAHADURGARH_SPREADSHEET_ID;
    const sheets = await getGoogleSheetsClient();
    
    // Get the actual sheet name - try to find it from metadata
    let sheetName = INVENTORY_TAB_NAME || 'Inventory';
    try {
      const metadata = await getSheetMetadata(spreadsheetId);
      const inventorySheet = metadata.sheets?.find(s => 
        s.title && (s.title.toLowerCase().includes('inventory') || s.title === 'Inventory')
      );
      if (inventorySheet) {
        sheetName = inventorySheet.title;
      }
    } catch (e) {
      console.warn('Could not fetch sheet metadata, using default sheet name:', e.message);
    }
    
    // Get current inventory data to find next available row
    const inventoryData = await getInventoryData(spreadsheetId, location, true); // Force refresh for accurate row count
    const currentRowCount = Object.keys(inventoryData).length;
    const nextRow = currentRowCount + 2; // +2 because row 1 is header
    
    // Check capacity before adding
    if (nextRow + missingSkus.length > MAX_ROWS) {
      throw new Error(`Sheet capacity exceeded. Cannot add ${missingSkus.length} SKUs. Current rows: ${currentRowCount}`);
    }
    
    // Prepare batch insert data
    // Column structure: A=Safety Stock, B=SKU, C=Product Name, D-H=blank, I=Available
    const values = missingSkus.map(sku => [
      sku.safetyStock || 0,           // Column A: Safety Stock
      sku.sku || '',                   // Column B: SKU
      sku.productName || '',          // Column C: Product Name
      '', '', '', '', '',              // Columns D-H: Placeholders
      sku.initialQuantity || 0        // Column I: Available
    ]);
    
    // Use append in batches of 500-1000 to avoid quota limits
    const BATCH_SIZE = 1000;
    let added = 0;
    let currentRow = nextRow;
    
    for (let i = 0; i < values.length; i += BATCH_SIZE) {
      const chunk = values.slice(i, i + BATCH_SIZE);
      
      try {
        // Use append which automatically adds rows at the end
        // Range should be just the sheet name or starting cell for append
        const response = await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${sheetName}!A:I`, // Append to end of sheet
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: chunk }
        });
        
        added += chunk.length;
        console.log(`Added ${chunk.length} SKUs to ${location} sheet (batch ${Math.floor(i/BATCH_SIZE) + 1})`);
      } catch (error) {
        console.error(`Error adding SKU chunk ${i}-${i + chunk.length}:`, error);
        // If append fails, try individual inserts as last resort
        if (chunk.length <= 10) {
          // For small chunks, try one by one
          for (const row of chunk) {
            try {
              await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `${sheetName}!A${currentRow}`,
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                requestBody: { values: [row] }
              });
              added++;
              currentRow++;
            } catch (singleError) {
              console.error(`Failed to add single SKU row:`, singleError.message);
            }
          }
        } else {
          throw new Error(`Failed to add SKU batch: ${error.message}`);
        }
      }
    }
    
    console.log(`Successfully added ${added} missing SKUs to ${location} sheet starting at row ${nextRow}`);
    
    // Clear cache to force refresh
    const { clearCaches } = require('./googleSheets');
    clearCaches();
    
    return {
      success: true,
      added: added,
      startRow: nextRow,
      endRow: nextRow + added - 1,
      location
    };
  } catch (error) {
    console.error('Error adding missing SKUs to sheet:', error);
    throw new Error(`Failed to add missing SKUs: ${error.message}`);
  }
};

/**
 * Check sheet capacity (rows and columns)
 * @param {String} spreadsheetId - Google Sheets ID
 * @param {String} sheetName - Name of the sheet
 * @returns {Object} Capacity information
 */
const checkSheetCapacity = async (spreadsheetId, sheetName) => {
  try {
    const sheets = await getGoogleSheetsClient();
    const metadata = await getSheetMetadata(spreadsheetId);
    const sheet = metadata.sheets.find(s => s.properties.title === sheetName);
    
    if (!sheet) {
      throw new Error(`Sheet ${sheetName} not found`);
    }
    
    const props = sheet.properties.gridProperties;
    const rowCount = props.rowCount || 0;
    const columnCount = props.columnCount || 0;
    
    const capacity = {
      rows: {
        current: rowCount,
        max: MAX_ROWS,
        available: MAX_ROWS - rowCount,
        percentUsed: (rowCount / MAX_ROWS * 100).toFixed(2)
      },
      columns: {
        current: columnCount,
        max: MAX_COLUMNS,
        available: MAX_COLUMNS - columnCount,
        percentUsed: (columnCount / MAX_COLUMNS * 100).toFixed(2)
      },
      isNearCapacity: {
        rows: rowCount > MAX_ROWS * 0.9,
        columns: columnCount > MAX_COLUMNS * 0.9
      }
    };
    
    return capacity;
  } catch (error) {
    console.error('Error checking sheet capacity:', error);
    throw error;
  }
};

/**
 * Handle sheet overflow by creating a new sheet or archiving old data
 * @param {String} spreadsheetId - Google Sheets ID
 * @param {String} sheetName - Name of the sheet
 * @param {String} overflowType - 'rows' or 'columns'
 * @returns {Object} Action taken
 */
const handleSheetOverflow = async (spreadsheetId, sheetName, overflowType) => {
  try {
    const sheets = await getGoogleSheetsClient();
    const timestamp = new Date().toISOString().split('T')[0];
    
    if (overflowType === 'rows') {
      // Create a new sheet for continuation
      const newSheetName = `${sheetName}_Continuation_${timestamp}`;
      
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            duplicateSheet: {
              sourceSheetId: (await getSheetMetadata(spreadsheetId))
                .sheets.find(s => s.properties.title === sheetName).properties.sheetId,
              newSheetName,
              insertSheetIndex: 0
            }
          }]
        }
      });
      
      // Clear data rows from new sheet (keep headers)
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${newSheetName}!A2:ZZ`
      });
      
      return {
        action: 'created_continuation_sheet',
        newSheetName,
        message: `Created new sheet ${newSheetName} for continued entries`
      };
      
    } else if (overflowType === 'columns') {
      // Archive old date columns by moving them to an archive sheet
      const archiveSheetName = `${sheetName}_Archive_${timestamp}`;
      
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            duplicateSheet: {
              sourceSheetId: (await getSheetMetadata(spreadsheetId))
                .sheets.find(s => s.properties.title === sheetName).properties.sheetId,
              newSheetName: archiveSheetName,
              insertSheetIndex: 999
            }
          }]
        }
      });
      
      return {
        action: 'created_archive_sheet',
        archiveSheetName,
        message: `Created archive sheet ${archiveSheetName}. Please manually move old date columns.`
      };
    }
    
    throw new Error(`Unknown overflow type: ${overflowType}`);
  } catch (error) {
    console.error('Error handling sheet overflow:', error);
    throw error;
  }
};

/**
 * Mark transactions as synced in database
 * @param {Array} transactionIds - Array of transaction IDs
 * @returns {Object} Update result
 */
const markTransactionsAsSynced = async (transactionIds) => {
  try {
    const result = await InventoryTransaction.updateMany(
      { _id: { $in: transactionIds } },
      {
        $set: {
          syncedToSheets: true,
          sheetsSyncDate: new Date()
        }
      }
    );
    
    console.log(`Marked ${result.modifiedCount} transactions as synced`);
    return result;
  } catch (error) {
    console.error('Error marking transactions as synced:', error);
    throw error;
  }
};

/**
 * Batch process sync with capacity checking
 * @param {Array} groupedTransactions - Grouped transactions to sync
 * @param {String} location - 'Okhla' or 'Bahadurgarh'
 * @param {Object} options - Options for sync (checkCapacity, handleOverflow, etc.)
 * @returns {Object} Sync results
 */
const batchSyncWithCapacityCheck = async (groupedTransactions, location, options = {}) => {
  try {
    const spreadsheetId = location === 'Okhla' ? OKHLA_SPREADSHEET_ID : BAHADURGARH_SPREADSHEET_ID;
    const sheetName = INVENTORY_TAB_NAME || 'Inventory'; // Use "Inventory" directly (actual sheet name)
    
    const results = {
      synced: 0,
      failed: 0,
      warnings: [],
      overflowActions: []
    };
    
    // Check capacity if requested
    if (options.checkCapacity !== false) {
      const capacity = await checkSheetCapacity(spreadsheetId, sheetName);
      
      if (capacity.isNearCapacity.rows || capacity.isNearCapacity.columns) {
        results.warnings.push({
          type: capacity.isNearCapacity.rows ? 'rows' : 'columns',
          message: `Sheet capacity warning: ${capacity.isNearCapacity.rows ? 'Rows' : 'Columns'} at ${capacity.isNearCapacity.rows ? capacity.rows.percentUsed : capacity.columns.percentUsed}% capacity`,
          capacity
        });
        
        // Handle overflow if requested
        if (options.handleOverflow && (capacity.rows.available < 100 || capacity.columns.available < 10)) {
          const overflowType = capacity.rows.available < 100 ? 'rows' : 'columns';
          const overflowAction = await handleSheetOverflow(spreadsheetId, sheetName, overflowType);
          results.overflowActions.push(overflowAction);
        }
      }
    }
    
    // Perform the sync
    const syncResults = await updateGroupedTransactionsToSheet(groupedTransactions, location);
    results.synced = syncResults.updated.length;
    results.failed = syncResults.failed.length;
    results.details = syncResults;
    
    return results;
  } catch (error) {
    console.error('Error in batch sync with capacity check:', error);
    throw error;
  }
};

module.exports = {
  updateGroupedTransactionsToSheet,
  addMissingSkusToSheet,
  checkSheetCapacity,
  handleSheetOverflow,
  markTransactionsAsSynced,
  batchSyncWithCapacityCheck
};
