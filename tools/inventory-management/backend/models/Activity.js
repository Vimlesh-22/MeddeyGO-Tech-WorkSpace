const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: [
      'order_created',
      'order_updated', 
      'stage_changed',
      'vendor_assigned',
      'vendor_updated',
      'item_processed',
      'pack_calculation_updated',
      'export_generated',
      'shopify_sync',
      'inventory_updated',
      'user_login',
      'system_action',
      'email_sent',
      'processed_orders_exported'
    ]
  },
  
  // Reference to related entities
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    sparse: true
  },
  
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor', 
    sparse: true
  },
  
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    sparse: true
  },
  
  // Activity details
  title: {
    type: String,
    required: true
  },
  
  description: {
    type: String,
    required: true
  },
  
  // Store before/after values for comparisons
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed
  },
  
  // Additional metadata
  metadata: {
    userAgent: String,
    ipAddress: String,
    sessionId: String,
    sku: String,
    stage: String,
    quantity: Number,
    price: Number
  },
  
  // Timestamp and user info
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  userId: {
    type: String, // For future user management
    default: 'system'
  },
  
  // Status and flags
  isSystemGenerated: {
    type: Boolean,
    default: false
  },
  
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  
  // For grouping related activities
  batchId: {
    type: String,
    sparse: true
  }
}, {
  timestamps: true,
  collection: 'activities'
});

// Indexes for performance
activitySchema.index({ timestamp: -1 });
activitySchema.index({ type: 1, timestamp: -1 });
activitySchema.index({ orderId: 1, timestamp: -1 });
activitySchema.index({ vendorId: 1, timestamp: -1 });
activitySchema.index({ userId: 1, timestamp: -1 });
activitySchema.index({ 'metadata.sku': 1, timestamp: -1 });

// Static methods for common queries
activitySchema.statics.getRecentActivity = function(limit = 50) {
  return this.find({})
    .sort({ timestamp: -1 })
    .limit(limit)
    .populate('orderId', 'orderName shopifyOrderName customerName')
    .populate('vendorId', 'name')
    .populate('productId', 'name sku');
};

activitySchema.statics.getOrderHistory = function(orderId, limit = 20) {
  return this.find({ orderId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .populate('vendorId', 'name');
};

activitySchema.statics.getVendorActivity = function(vendorId, limit = 20) {
  return this.find({ vendorId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .populate('orderId', 'orderName shopifyOrderName customerName');
};

activitySchema.statics.getSkuActivity = function(sku, limit = 20) {
  return this.find({ 'metadata.sku': sku })
    .sort({ timestamp: -1 })
    .limit(limit)
    .populate('orderId', 'orderName shopifyOrderName customerName')
    .populate('vendorId', 'name');
};

// Instance methods
activitySchema.methods.toSummary = function() {
  return {
    id: this._id,
    type: this.type,
    title: this.title,
    description: this.description,
    timestamp: this.timestamp,
    severity: this.severity,
    metadata: this.metadata
  };
};

module.exports = mongoose.model('Activity', activitySchema);