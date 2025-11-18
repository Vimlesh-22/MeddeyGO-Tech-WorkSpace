const mongoose = require('mongoose');

const emailRecipientSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  lastSentAt: { type: Date },
  timesSent: { type: Number, default: 0 },
  sources: [{ type: String }],
}, {
  timestamps: true,
  collection: 'email_recipients'
});

module.exports = mongoose.model('EmailRecipient', emailRecipientSchema);