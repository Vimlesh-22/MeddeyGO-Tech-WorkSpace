const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  sku: {
    type: String,
    required: [true, 'Please add a SKU'],
    trim: true,
  },
  name: {
    type: String,
    required: [true, 'Please add a product name'],
    trim: true,
  },
  imageUrl: {
    type: String,
  },
  costPrice: {
    type: Number,
    required: [true, 'Please add a cost price'],
  },
  sellingPrice: {
    type: Number,
    required: [true, 'Please add a selling price'],
  },
  gstPercentage: {
    type: Number,
    required: [true, 'Please add a GST percentage'],
    default: 18,
  },
  productUrl: {
    type: String,
  },
  quantity: {
    type: Number,
    required: [true, 'Please add a quantity'],
    default: 1,
  },
  discount: {
    type: Number,
    default: 0,
  },
  finalPrice: {
    type: Number,
    required: [true, 'Please add a final price'],
  },
  appliedRules: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PricingRule',
  }],
});

const QuotationSchema = new mongoose.Schema({
  quotationNumber: {
    type: String,
    required: true,
    unique: true,
  },
  clientName: {
    type: String,
    required: [true, 'Please add a client name'],
  },
  clientEmail: {
    type: String,
  },
  clientPhone: {
    type: String,
  },
  clientAddress: {
    type: String,
  },
  products: [ProductSchema],
  subTotal: {
    type: Number,
    required: true,
  },
  gstTotal: {
    type: Number,
    required: true,
  },
  discountTotal: {
    type: Number,
    default: 0,
  },
  grandTotal: {
    type: Number,
    required: true,
  },
  stage: {
    type: String,
    enum: ['Initial', 'Negotiation', 'On Hold', 'Win', 'Lost'],
    default: 'Initial',
  },
  relationshipManager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  assignedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  notes: {
    type: String,
  },
  validUntil: {
    type: Date,
    default: function() {
      const today = new Date();
      return new Date(today.setDate(today.getDate() + 30));
    },
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
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  excludeTransport: {
    type: Boolean,
    default: false
  }
}, { collection: 'quotations' });

// Generate a unique quotation number before saving
QuotationSchema.pre('save', async function (next) {
  if (!this.isNew) {
    return next();
  }
  
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  
  // Get the count of existing quotations
  const count = await this.constructor.countDocuments();
  const sequence = (count + 1).toString().padStart(4, '0');
  
  this.quotationNumber = `QT-${year}${month}-${sequence}`;
  
  next();
});

module.exports = mongoose.model('Quotation', QuotationSchema);