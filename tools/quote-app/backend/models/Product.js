const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  sku: {
    type: String,
    required: [true, 'Please add a SKU'],
    trim: true,
    unique: true
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
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model('Product', ProductSchema, 'products'); 