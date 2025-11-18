const mongoose = require('mongoose');

const HISTORY_RETENTION_DAYS = 150;
const HISTORY_TTL_SECONDS = HISTORY_RETENTION_DAYS * 24 * 60 * 60;
const HISTORY_TTL_INDEX_NAME = 'processed_history_createdAt_ttl';

const processedOrderHistorySchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  orderName: {
    type: String,
    required: true
  },
  shopifyOrderId: {
    type: String,
    index: true
  },
  itemSku: {
    type: String,
    required: true,
    index: true
  },
  productName: {
    type: String,
    required: true
  },
  variantName: {
    type: String
  },
  quantity: {
    type: Number,
    required: true
  },
  price: {
    type: Number,
    default: null // Price from Shopify
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true
  },
  vendorName: {
    type: String,
    required: true
  },
  warehouse: {
    type: String,
    enum: ['Okhla', 'Bahadurgarh', 'Direct'],
    default: 'Okhla'
  },
  processedAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
    // TTL index will be created manually or via expires option
    // MongoDB will automatically delete documents older than HISTORY_RETENTION_DAYS
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  processedBy: {
    type: String,
    default: 'system'
  }
});

// Indexes for efficient querying
processedOrderHistorySchema.index({ vendorId: 1, processedAt: -1 });
processedOrderHistorySchema.index({ orderId: 1, processedAt: -1 });
processedOrderHistorySchema.index({ itemSku: 1, processedAt: -1 });
// TTL index: automatically delete documents older than HISTORY_RETENTION_DAYS
processedOrderHistorySchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: HISTORY_TTL_SECONDS, name: HISTORY_TTL_INDEX_NAME }
);

module.exports = mongoose.model('ProcessedOrderHistory', processedOrderHistorySchema);
