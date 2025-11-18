const express = require('express');
const router = express.Router();
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const {
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
  createManualOrder,
  bulkCreateOrders,
  generateProductTemplate,
  importProducts,
  updateItemVendor,
  bulkMapVendors,
  exportOrders,
  exportConsolidatedPO,
  listExports,
  downloadExport,
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
  exportSelectedOrdersEmail
} = require('../controllers/orderController');

// Shopify integration
router.post('/fetch-shopify', fetchShopifyOrders);
router.post('/fetch-all-shopify', fetchAllShopifyOrders);
router.post('/refresh-fulfillment', refreshFulfillmentStatus);

// Google Sheets integration - MUST be before parameterized routes
// IMPORTANT: These routes must come before any routes with :id or :orderId parameters
router.get('/pack-sku-data', getPackSkuDataEndpoint);
router.get('/pack-qty/:sku', (req, res, next) => {
  // Add logging to debug route matching
  console.log(`[pack-qty-route] Matched route for SKU: ${req.params.sku}, URL: ${req.url}`);
  next();
}, getPackSkuQuantityEndpoint);
router.post('/clear-cache', clearCacheEndpoint);
router.put('/pack-sku-data', updatePackSkuDataEndpoint);
router.put('/inventory-data', updateInventoryDataEndpoint);

// Vendor auto-assignment - specific routes first
router.post('/auto-assign-vendors', autoAssignVendors);
router.post('/accept-all-suggestions', acceptAllSuggestions);

// Order management - specific routes before parameterized routes
router.get('/', getOrders);
router.post('/manual', createManualOrder);
router.post('/bulk-create', bulkCreateOrders);
router.post('/process-items', processOrderItems);
router.post('/move-items-to-stage', moveItemsToStage);
router.put('/warehouse-bulk', bulkUpdateWarehouse);
router.post('/vendor-pdf-bulk', generateVendorPDFBulk);
router.post('/vendor-pdf-job', createVendorPdfJob);
router.get('/vendor-pdf-job/:jobId', getVendorPdfJobStatus);
router.post('/bulk-map-vendors', bulkMapVendors);

// Product import/export
router.get('/product-template', generateProductTemplate);
router.post('/import-products', upload.single('file'), importProducts);

// Orders export
router.get('/export', exportOrders);
router.post('/export-consolidated', exportConsolidatedPO);
router.get('/exports', listExports);
router.get('/exports/:id/download', downloadExport);

// SKU transaction history
router.get('/sku-history/:sku', getSkuTransactionHistory);

// Processing history (place specific routes before parameterized routes)
router.get('/sku-processing-history/:sku', getSkuProcessingHistory);
router.get('/vendor-processing-history/:vendorId', getVendorProcessingHistory);
router.post('/cleanup-old-history', cleanupOldHistory);

// Processed orders management
router.post('/processed/clear-all', clearAllProcessedOrders);
router.post('/processed/send-excel', sendProcessedOrdersExcel);
router.post('/export-email', exportSelectedOrdersEmail);

// Processed order deletion and vendor cleanup
router.delete('/processed/:id', require('../controllers/orderController').deleteProcessedOrder);
router.delete('/processed/:id/vendor/:vendorId', require('../controllers/orderController').deleteProcessedOrderVendor);

// Parameterized routes - MUST be last to avoid matching specific routes
// Place more specific parameterized routes BEFORE generic ones

// CRITICAL: :id/stage must come BEFORE :id to avoid 404
router.put('/:id/stage', (req, res, next) => {
  console.log(`[ROUTE] Matched PUT /:id/stage - orderId: ${req.params.id}, stage: ${req.body.stage}`);
  next();
}, updateOrderStage);

router.get('/:id/vendor-pdf/:vendorId', generateVendorPDF);
router.get('/:orderId/processing-history', getOrderProcessingHistory);
router.post('/:orderId/items/:itemId/accept-vendor', acceptSuggestedVendor);
router.put('/:orderId/items/:itemId/vendor', updateItemVendor);
router.put('/:orderId/items/:itemId/complete', completeOrderItem);
router.put('/:orderId/items/:itemId/expected-date', updateItemExpectedDate);
router.put('/:orderId/items/:itemId/warehouse', updateItemWarehouse);
router.put('/:orderId/items/:itemId', updateOrderItem);
router.post('/:orderId/items/:itemId/comment', addItemComment);

// Generic parameterized routes - MUST BE LAST
router.get('/:id', (req, res, next) => {
  console.log(`[ROUTE] Matched GET /:id - orderId: ${req.params.id}`);
  next();
}, getOrderById);

router.put('/:id', (req, res, next) => {
  console.log(`[ROUTE] Matched PUT /:id - orderId: ${req.params.id}`);
  next();
}, updateOrder);

router.delete('/:id', (req, res, next) => {
  console.log(`[ROUTE] Matched DELETE /:id - orderId: ${req.params.id}`);
  next();
}, deleteOrder);

module.exports = router;
