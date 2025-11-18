const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  skuMappings: [{
    sku: {
      type: String,
      required: true
      // Removed unique constraint as it caused issues with multiple products assigned to same vendor
    }
  }],
  contactInfo: {
    email: String,
    phone: String,
    address: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

vendorSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Enforce unique vendor names (case-insensitive)
vendorSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.model('Vendor', vendorSchema);
