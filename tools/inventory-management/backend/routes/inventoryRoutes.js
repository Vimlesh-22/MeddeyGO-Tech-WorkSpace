const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');

// Get all inventory transactions
router.get('/', inventoryController.getInventoryTransactions);

// Get grouped transactions by SKU
router.get('/grouped', inventoryController.getGroupedTransactions);

// Get SKU history
router.get('/history/:sku', inventoryController.getSkuHistory);

// Get transactions by source order
router.get('/by-order/:orderId', inventoryController.getTransactionsByOrder);

// Get all auto-created transactions
router.get('/auto-created', inventoryController.getAutoCreatedTransactions);

// Create sales transaction
router.post('/sales', inventoryController.createSalesTransaction);

// Create purchase transaction
router.post('/purchase', inventoryController.createPurchaseTransaction);

// Create return transaction
router.post('/return', inventoryController.createReturnTransaction);

// Import transactions from CSV/Excel
router.post('/import', inventoryController.importTransactions);

// Bulk create date columns in Google Sheets
router.post('/bulk-create-dates', inventoryController.bulkCreateDates);

// Check which dates are missing from sheet
router.post('/check-import-dates', inventoryController.checkImportDates);

// Update transaction
router.put('/:id', inventoryController.updateTransaction);

// Update received status
router.put('/:id/received-status', inventoryController.updateReceivedStatus);

// Bulk update received status for multiple transactions
router.post('/bulk-received-status', inventoryController.bulkUpdateReceivedStatus);

// Split transaction
router.post('/split-transaction', inventoryController.splitTransaction);

// Delete transaction
router.delete('/:id', inventoryController.deleteTransaction);

// Sync transactions to Google Sheets (with background processing option)
router.post('/sync', inventoryController.syncToSheets);

// Background sync job progress tracking
router.get('/sync-progress/:jobId', inventoryController.getSyncProgress);
router.get('/sync-jobs', inventoryController.getAllSyncJobs);

// ===== NEW GROUPING AND SHEET UPDATE ROUTES =====

// Group transactions by SKU and detect missing SKUs
router.post('/group', inventoryController.groupTransactions);

// Preview missing SKUs before processing
router.post('/preview-missing', inventoryController.previewMissingSkus);

// Process grouped transactions with or without adding missing SKUs
router.post('/process-grouped', inventoryController.processGroupedTransactions);

// Check SKU availability in sheets
router.get('/check-sku-availability', inventoryController.checkSkuAvailability);

// Batch check SKU availability for multiple SKUs (reduces API calls)
router.post('/batch-check-sku-availability', inventoryController.batchCheckSkuAvailability);

// Get individual SKUs for pack/combo SKU
router.get('/individual-skus', inventoryController.getIndividualSkus);

// Add missing SKUs to inventory sheet
router.post('/add-missing-skus', inventoryController.addMissingSkus);

// Get processing summary
router.get('/processing-summary', inventoryController.getProcessingSummary);

// Check for missing SKUs before sync
router.post('/check-missing-skus', inventoryController.checkMissingSkus);

// Add multiple missing SKUs with user confirmation
router.post('/add-missing-skus-batch', inventoryController.addMissingSkusBatch);

// Get SKU suggestions for autocomplete
router.get('/sku-suggestions/:location', inventoryController.getSkuSuggestions);

// ===== ANALYTICS ROUTES =====

// Get top items by quantity
router.get('/analytics/top-items', inventoryController.getTopItems);

// Get sales trend for a specific SKU
router.get('/analytics/sales-trend', inventoryController.getSalesTrend);

// Get data quality report for inventory sheets
router.get('/analytics/data-quality', inventoryController.getDataQualityReport);

// ===== DATE CONFLICT ROUTES =====

// Check for date conflicts before sync
router.post('/check-date-conflicts', inventoryController.checkDateConflicts);

// Resolve date conflict with user's choice
router.post('/resolve-date-conflict', inventoryController.resolveDateConflict);

// ===== NEW FORECASTING & ADVANCED ANALYTICS ROUTES =====

// Get forecast for specific SKU
router.get('/analytics/forecast/:sku', inventoryController.getForecast);

// Get inventory turnover rate
router.get('/analytics/turnover-rate', inventoryController.getTurnoverRate);

// Get stock levels vs safety stock
router.get('/analytics/stock-levels/:location', inventoryController.getStockLevels);
router.get('/stock/:sku', inventoryController.getStockForSku);

// ===== EXCEL EXPORT ROUTES =====

// Export enhanced Excel
router.get('/export/enhanced', inventoryController.exportEnhanced);

// Export forecast for SKU
router.get('/export/forecast/:sku', inventoryController.exportForecast);

// Export analytics data
router.get('/export/analytics', inventoryController.exportAnalytics);

// Export missing SKUs to CSV
router.post('/export-missing-skus', inventoryController.exportMissingSkus);

module.exports = router;
