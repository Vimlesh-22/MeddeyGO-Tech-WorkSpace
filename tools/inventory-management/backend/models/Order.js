const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  shopifyOrderId: {
    type: String,
    sparse: true,
    index: true
  },
  shopifyStoreId: {
    type: String,
    required: false,
    index: true
  },
  orderName: {
    type: String,
    required: true,
    index: true
  },
  shopifyOrderName: {
    type: String,
    index: true
  },
  shopifyCreatedAt: {
    type: Date,
    index: true
  },
  items: [{
    sku: {
      type: String,
      required: true
    },
    productName: String,
    variantName: String,
    quantity: Number,
    price: Number,
    singleProductSku: String,
    itemType: {
      type: String,
      enum: ['Pack', 'Combo', 'Single', ''],
      default: ''
    },
    warehouse: {
      type: String,
      enum: ['Okhla', 'Bahadurgarh', 'Direct'],
      default: 'Okhla'
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor'
    },
    suggestedVendors: [{
      type: String
    }],
    autoDetectedVendor: String,
    vendorSuggestions: [{
      type: String
    }],
    costPrice: Number,
    gst: Number,
    expectedDate: {
      type: Date,
      default: null
    },
    comments: [{
      text: String,
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    processed: {
      type: Boolean,
      default: false,
      index: true
    },
    processedAt: {
      type: Date,
      default: null
    }
  }],
  stage: {
    type: String,
    enum: ['Initial', 'Hold', 'Processed', 'Pending', 'Completed', 'In-Stock', 'Fulfilled'],
    default: 'Initial',
    index: true
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Paid', 'Failed', 'Refunded', 'Partially_paid', 'Partially paid'],
    default: 'Pending'
  },
  fulfillmentStatus: {
    type: String,
    enum: ['Unfulfilled', 'Partially Fulfilled', 'Fulfilled', 'Cancelled'],
    default: 'Unfulfilled'
  },
  orderStatus: {
    type: String,
    enum: ['Fulfilled', 'Unfulfilled', 'Canceled'],
    default: 'Unfulfilled'
  },
  customerName: String,
  customerEmail: String,
  customerPhone: String,
  shippingAddress: {
    address1: String,
    address2: String,
    city: String,
    province: String,
    country: String,
    zip: String
  },
  billingAddress: {
    address1: String,
    address2: String,
    city: String,
    province: String,
    country: String,
    zip: String
  },
  history: [{
    stage: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    comment: String
  }],
  vendorTransactions: [{
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor'
    },
    vendorName: String,
    itemSku: String,
    itemName: String,
    quantity: Number,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  lastVendorTransactionDate: {
    type: Date,
    default: null,
    index: true
  },  
  productUrls: [{
    sku: String,
    productName: String,
    url: String,
    handle: String,
    productTitle: String
  }],
  isManual: {
    type: Boolean,
    default: false
  },
  poNumber: {
    type: String,
    sparse: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  processedAt: {
    type: Date,
    default: null,
    index: true
  }
});

orderSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Ensure uniqueness per store + order id, not globally
orderSchema.index({ shopifyStoreId: 1, shopifyOrderId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Order', orderSchema);
