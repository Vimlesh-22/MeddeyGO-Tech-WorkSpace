const { processPendingReminders, getReminderConfig, sendReminder } = require('../services/reminderService');
const Order = require('../models/Order');
const Vendor = require('../models/Vendor');
const mongoose = require('mongoose');

async function scanAndSendReminders() {
  // Get orders in stage Processed, createdAt older than 2 days (configurable)
  // Only for those not marked as sent/disabled
  const now = new Date();
  const orders = await Order.find({
    stage: 'Processed',
    createdAt: { $lte: new Date(Date.now() - 2*24*60*60*1000) }, // fallback 2 days, but will check override
    'items.vendor': { $exists: true, $ne: null }
  }).lean();

  for (const order of orders) {
    for (const item of order.items || []) {
      if (!item.vendor) continue;
      const vendor = await Vendor.findById(item.vendor).lean();
      if (!vendor) continue;
      const config = await getReminderConfig(order, vendor);
      if (!config.eligible) continue;
      // Timeline judgment (either vendor override or global)
      const timelineDays = config.timeline || 2;
      const dueDate = new Date(order.createdAt);
      dueDate.setDate(dueDate.getDate() + Number(timelineDays));
      if (now >= dueDate) {
        // Check: don't double-send or re-send after mark-as-sent
        // TODO: Advanced - track sent reminders by order/vendor, for now relies on toggle
        try {
          await sendReminder(order._id, config.template, config.vendorEmails, {vendor});
        } catch (e) {
          console.error('Reminder send error:', e);
        }
      }
    }
  }
}

function startReminderScheduler() {
  setInterval(() => {
    processPendingReminders();
    scanAndSendReminders();
  }, 3 * 60 * 1000); // every 3 min
}

module.exports = { startReminderScheduler };
