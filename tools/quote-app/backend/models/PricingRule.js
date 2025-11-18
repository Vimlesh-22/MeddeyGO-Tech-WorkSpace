const mongoose = require('mongoose');

const PricingRuleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a rule name'],
    trim: true,
  },
  description: {
    type: String,
    required: [true, 'Please add a description'],
  },
  minQuantity: {
    type: Number,
    required: [true, 'Please add a minimum quantity'],
  },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    default: 'percentage',
  },
  discountValue: {
    type: Number,
    required: [true, 'Please add a discount value'],
  },
  active: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('PricingRule', PricingRuleSchema, 'pricingrules'); 