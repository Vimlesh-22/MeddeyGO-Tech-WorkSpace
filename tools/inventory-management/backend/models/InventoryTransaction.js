const mongoose = require('mongoose');

const inventoryTransactionSchema = new mongoose.Schema({
  transactionType: {
    type: String,
    enum: ['Sales', 'Purchase', 'Return'],
    required: true,
    index: true
  },
  transactionDate: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  location: {
    type: String,
    enum: ['Okhla', 'Bahadurgarh'],
    required: true,
    index: true
  },
  items: [{
    sku: {
      type: String,
      required: true,
      index: true
    },
    productName: String,
    quantity: {
      type: Number,
      required: true
    },
    receivedStatus: {
      type: String,
      enum: ['pending', 'received', 'partial', 'not_received'],
      default: 'pending'
    },
    receivedQuantity: {
      type: Number,
      default: 0
    },
    receivedAt: Date,
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    orderName: String,
    shopifyOrderId: String,
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor'
    },
    vendorName: String
  }],
  syncedToSheets: {
    type: Boolean,
    default: false,
    index: true
  },
  sheetsSyncDate: Date,
  syncMode: {
    type: String,
    enum: ['replace', 'sum'],
    default: 'sum'
  },
  sheetLocation: {
    spreadsheetId: String,
    sheetName: String,
    dateColumn: String,
    rowIndex: Number
  },
  notes: String,
  createdBy: String,
  autoCreated: {
    type: Boolean,
    default: false,
    index: true
  },
  sourceOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

inventoryTransactionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient querying
inventoryTransactionSchema.index({ transactionType: 1, transactionDate: -1 });
inventoryTransactionSchema.index({ location: 1, syncedToSheets: 1 });
inventoryTransactionSchema.index({ 'items.sku': 1, transactionDate: -1 });

module.exports = mongoose.model('InventoryTransaction', inventoryTransactionSchema);
