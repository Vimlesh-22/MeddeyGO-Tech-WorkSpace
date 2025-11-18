const mongoose = require('mongoose');

const exportRecordSchema = new mongoose.Schema({
  type: { type: String, required: true }, // e.g., 'PO-Consolidated'
  format: { type: String, default: 'csv' },
  stage: { type: String },
  filters: { type: Object }, // { startDate, endDate, vendorId, ... }
  filename: { type: String },
  content: { type: String }, // CSV content (UTF-8)
  createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('ExportRecord', exportRecordSchema);

