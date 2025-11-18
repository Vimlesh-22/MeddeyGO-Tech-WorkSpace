const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  vendor: {
    autoCreateVendors: {
      type: Boolean,
      default: true
    },
    autoMapSkus: {
      type: Boolean,
      default: true
    },
    requireApproval: {
      type: Boolean,
      default: false
    }
  },
  email: {
    enabled: {
      type: Boolean,
      default: false
    },
    vendorEnabled: {
      type: Boolean,
      default: true
    },
    salesTeamEnabled: {
      type: Boolean,
      default: true
    },
    salesTeamEmails: [{
      type: String
    }],
    globalTimeline: {
      type: Number,
      default: 2
    },
    exceptionVendors: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor'
    }],
    vendorOverrides: {
      type: Map,
      of: Object,
      default: new Map()
    },
    templates: {
      type: Map,
      of: Object,
      default: new Map()
    },
    processedOrdersExport: {
      enabled: {
        type: Boolean,
        default: true
      },
      recipients: [{
        type: String
      }],
      scheduleTime: {
        type: String,
        default: '04:00' // 4 AM IST
      },
      triggerMethod: {
        type: String,
        enum: ['automatic', 'manual'],
        default: 'automatic'
      }
    }
  },
  // Dynamic Google Sheets header mapping and history
  sheetsMappingCurrent: {
    type: Object,
    default: null
  },
  sheetsMappingHistory: [
    {
      mapping: { type: Object },
      label: { type: String, default: '' },
      createdAt: { type: Date, default: Date.now }
    }
  ],
  // Inventory Count settings
  inventoryCount: {
    defaultLocation: {
      type: String,
      enum: ['Okhla', 'Bahadurgarh', 'Direct'],
      default: 'Okhla'
    },
    defaultView: {
      type: String,
      enum: ['table', 'grouped'],
      default: 'table'
    },
    autoSync: {
      type: Boolean,
      default: false
    },
    removeAfterSync: {
      type: Boolean,
      default: false
    },
    syncMode: {
      type: String,
      enum: ['sum', 'replace'],
      default: 'sum'
    },
    showAnalytics: {
      type: Boolean,
      default: false
    }
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

settingsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Settings', settingsSchema);
