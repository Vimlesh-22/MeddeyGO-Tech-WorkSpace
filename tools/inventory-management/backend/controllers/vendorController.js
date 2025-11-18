const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const Order = require('../models/Order');

// @desc    Create a vendor
// @route   POST /api/vendors
// @access  Public
const createVendor = asyncHandler(async (req, res) => {
  const { name, skuMappings, contactInfo } = req.body;

  if (!name || !name.trim()) {
    res.status(400);
    throw new Error('Vendor name is required');
  }

  // Prevent duplicates (case-insensitive)
  const existing = await Vendor.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } });
  if (existing) {
    res.status(409);
    throw new Error('Vendor with same name already exists');
  }

  const vendor = await Vendor.create({
    name: name.trim(),
    skuMappings,
    contactInfo
  });

  res.status(201).json(vendor);
});

// @desc    Get all vendors with search functionality
// @route   GET /api/vendors
// @access  Public
const getVendors = asyncHandler(async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.json([]);
  }
  const { search } = req.query;
  let query = {};
  
  // Add search functionality
  if (search) {
    query = {
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { 'contactInfo.email': { $regex: search, $options: 'i' } },
        { 'contactInfo.phone': { $regex: search, $options: 'i' } },
        { 'contactInfo.address': { $regex: search, $options: 'i' } },
        { 'skuMappings.sku': { $regex: search, $options: 'i' } }
      ]
    };
  }
  
  const vendors = await Vendor.find(query).sort('name');
  res.json(vendors);
});

// @desc    Map SKU to vendor
// @route   POST /api/vendors/:id/map-sku
// @access  Public
const mapSkuToVendor = asyncHandler(async (req, res) => {
  const { sku } = req.body;
  const vendor = await Vendor.findById(req.params.id);
  
  if (!vendor) {
    res.status(404);
    throw new Error('Vendor not found');
  }
  
  // Check if SKU is already mapped to another vendor
  const existingMapping = await Vendor.findOne({
    'skuMappings.sku': sku
  });
  
  if (existingMapping && existingMapping._id.toString() !== req.params.id) {
    res.status(400);
    throw new Error('SKU is already mapped to another vendor');
  }
  
  // Add SKU mapping if it doesn't exist
  if (!vendor.skuMappings.find(mapping => mapping.sku === sku)) {
    vendor.skuMappings.push({ sku });
    await vendor.save();
  }
  
  // Update all orders with this SKU to map to this vendor
  // Only set vendor for items where vendor is not yet assigned to avoid overwriting manual changes
  await Order.updateMany(
    { 'items.sku': sku, 'items.vendor': null },
    { $set: { 'items.$.vendor': vendor._id } }
  );
  
  res.json(vendor);
});

// @desc    Get vendor by ID
// @route   GET /api/vendors/:id
// @access  Public
const getVendorById = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  
  if (!vendor) {
    res.status(404);
    throw new Error('Vendor not found');
  }
  
  res.json(vendor);
});

// @desc    Update vendor
// @route   PUT /api/vendors/:id
// @access  Public
const updateVendor = asyncHandler(async (req, res) => {
  const { name, contactInfo } = req.body;
  const vendor = await Vendor.findById(req.params.id);
  
  if (!vendor) {
    res.status(404);
    throw new Error('Vendor not found');
  }
  
  vendor.name = name || vendor.name;
  vendor.contactInfo = contactInfo || vendor.contactInfo;
  
  const updatedVendor = await vendor.save();
  res.json(updatedVendor);
});

// @desc    Delete vendor
// @route   DELETE /api/vendors/:id
// @access  Public
const deleteVendor = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  
  if (!vendor) {
    res.status(404);
    throw new Error('Vendor not found');
  }
  
  // Remove vendor references from orders
  await Order.updateMany(
    { 'items.vendor': vendor._id },
    { $set: { 'items.$[elem].vendor': null } },
    { arrayFilters: [{ 'elem.vendor': vendor._id }] }
  );
  
  const vendorId = vendor._id.toString();
  await vendor.deleteOne();
  
  // Return vendor ID for frontend cache removal
  res.json({ 
    message: 'Vendor deleted successfully',
    vendorId: vendorId
  });
});

// @desc    Find duplicate vendors
// @route   GET /api/vendors/duplicates
// @access  Public
const findDuplicates = asyncHandler(async (req, res) => {
  const vendors = await Vendor.find({});
  const duplicates = [];
  const seen = new Map();
  
  for (const vendor of vendors) {
    const normalizedName = vendor.name.toLowerCase().trim();
    
    if (seen.has(normalizedName)) {
      const existing = seen.get(normalizedName);
      let duplicateGroup = duplicates.find(d => d.some(v => v._id.toString() === existing._id.toString()));
      
      if (!duplicateGroup) {
        duplicateGroup = [existing];
        duplicates.push(duplicateGroup);
      }
      
      duplicateGroup.push(vendor);
    } else {
      seen.set(normalizedName, vendor);
    }
  }
  
  res.json(duplicates);
});

// @desc    Merge duplicate vendors
// @route   POST /api/vendors/merge
// @access  Public
const mergeDuplicates = asyncHandler(async (req, res) => {
  const { keepId, mergeIds } = req.body;
  
  if (!keepId || !mergeIds || mergeIds.length === 0) {
    res.status(400);
    throw new Error('keepId and mergeIds are required');
  }
  
  const keepVendor = await Vendor.findById(keepId);
  if (!keepVendor) {
    res.status(404);
    throw new Error('Keep vendor not found');
  }
  
  // Update all orders to use the keep vendor
  for (const mergeId of mergeIds) {
    await Order.updateMany(
      { 'items.vendor': mergeId },
      { $set: { 'items.$[elem].vendor': keepId } },
      { arrayFilters: [{ 'elem.vendor': mergeId }] }
    );
    
    // Delete the merged vendor
    await Vendor.findByIdAndDelete(mergeId);
  }
  
  res.json({ message: 'Vendors merged successfully', keepVendor });
});

// @desc    Bulk delete vendors
// @route   POST /api/vendors/bulk-delete
// @access  Public
const bulkDeleteVendors = asyncHandler(async (req, res) => {
  const { vendorIds } = req.body;
  
  if (!vendorIds || vendorIds.length === 0) {
    res.status(400);
    throw new Error('vendorIds array is required');
  }
  
  // Remove vendor references from orders
  await Order.updateMany(
    { 'items.vendor': { $in: vendorIds } },
    { $set: { 'items.$[elem].vendor': null } },
    { arrayFilters: [{ 'elem.vendor': { $in: vendorIds } }] }
  );
  
  // Delete the vendors
  const result = await Vendor.deleteMany({ _id: { $in: vendorIds } });
  
  res.json({ 
    message: 'Vendors deleted successfully', 
    deletedCount: result.deletedCount 
  });
});

const suggestVendor = asyncHandler(async (req, res) => {
  const skuParam = req.params.sku;
  if (!skuParam) {
    return res.status(400).json({ success: false, message: 'sku is required' });
  }
  const normalizedSku = String(skuParam).trim().toUpperCase();
  let suggestion = null;
  try {
    const { getPackSkuData, resolveSkuComponents } = require('../services/googleSheets');
    const Settings = require('../models/Settings');
    const settings = await Settings.findOne().lean();
    const override = settings?.email?.vendorOverrides && settings.email.vendorOverrides.get(normalizedSku);
    if (override && typeof override.name === 'string' && override.name.trim()) {
      suggestion = override.name.trim();
    }
    const data = await getPackSkuData();
    const map = data.vendorSuggestions || {};
    suggestion = map[normalizedSku] || (data.packSkuMap && data.packSkuMap[normalizedSku]?.vendorName) || null;
    if (!suggestion) {
      const mapping = await Vendor.findOne({ 'skuMappings.sku': normalizedSku }).lean();
      if (mapping?.name) suggestion = mapping.name;
    }
    if (!suggestion && (normalizedSku.startsWith('P') || normalizedSku.startsWith('C'))) {
      const resolved = await resolveSkuComponents(normalizedSku);
      for (const c of resolved.components) {
        const s = map[c.sku] || (data.packSkuMap && data.packSkuMap[c.sku]?.vendorName) || null;
        if (s) { suggestion = s; break; }
      }
    }
  } catch {}
  if (suggestion) {
    return res.json({ success: true, sku: normalizedSku, vendor: suggestion });
  }
  return res.json({ success: false, sku: normalizedSku });
});

module.exports = {
  createVendor,
  getVendors,
  mapSkuToVendor,
  getVendorById,
  updateVendor,
  deleteVendor,
  findDuplicates,
  mergeDuplicates,
  bulkDeleteVendors,
  suggestVendor
};
