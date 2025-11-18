const Settings = require('../models/Settings');
const { sendDBTemplate, getTemplateVars } = require('./emailService');
const Activity = require('../models/Activity');
const Order = require('../models/Order');

const reminderQueue = [];

// Utility: check settings for eligibility, timeline/override/exception logic
async function getReminderConfig(order, vendor) {
  const settings = await Settings.findOne();
  if (!settings?.email?.enabled) return { eligible: false };
  if (!settings.email.vendorEnabled) return { eligible: false };
  // Exception vendors (skip if in here)
  if (settings.email.exceptionVendors && settings.email.exceptionVendors.some(id => id.toString() === vendor._id.toString())) {
    return { eligible: false };
  }
  const override = settings.email.vendorOverrides?.get?.(vendor._id.toString()) || {};
  const enabled = override.enabled !== undefined ? override.enabled : true;
  if (!enabled) return { eligible: false };
  const timeline = override.timeline || settings.email.globalTimeline || 2;
  const template = override.template || 'vendorReminder';
  const vendorEmails = override.emails?.length ? override.emails : (vendor.contactInfo?.email ? [vendor.contactInfo.email] : []);
  return {
    eligible: true,
    timeline,
    template,
    vendorEmails,
  };
}
async function scheduleReminder(orderId, template, when, to, meta = {}) {
  reminderQueue.push({ orderId, template, when, to, status: 'scheduled', meta });
}
async function sendReminder(orderId, template, toEmails, meta = {}) {
  const order = await Order.findById(orderId).lean();
  if (!order) throw new Error('Order not found');
  const vendor = meta.vendor;
  const config = await getReminderConfig(order, vendor);
  if (!config.eligible) throw new Error('Vendor not eligible');
  const products = order.items.map(i => ({ productName: i.productName, sku: i.sku, quantity: i.quantity }));
  const vars = getTemplateVars(order, vendor, config.timeline, products, meta);
  // Multi-email
  for (const to of toEmails) {
    await sendDBTemplate(to, config.template, vars);
  }
  await logReminder(orderId, toEmails, config.template, meta);
}
async function processPendingReminders() {
  const now = Date.now();
  for (const rem of reminderQueue.filter(r => !r.sent && r.when <= now)) {
    try {
      await sendReminder(rem.orderId, rem.template, [rem.to], rem.meta);
      rem.sent = true;
      rem.status = 'sent';
    } catch (e) {
      rem.status = 'error';
      rem.error = e.message;
    }
  }
}
async function logReminder(orderId, to, template, meta) {
  await Activity.create({
    type: 'reminder_sent',
    orderId,
    title: 'Order Reminder',
    description: `Sent reminder to ${Array.isArray(to) ? to.join(',') : to} for order ${orderId}`,
    metadata: { ...meta, template },
    isSystemGenerated: true,
    timestamp: new Date(),
  });
}
// Mark-as-sent: disables further reminders, logs, triggers salesNotification
async function markOrderAsSent(orderId, vendorId) {
  const order = await Order.findById(orderId).lean();
  const settings = await Settings.findOne();
  if (!order) throw new Error('Order not found');
  // Disable vendor override for this vendor/order
  if (settings.email.vendorOverrides.has(vendorId.toString())) {
    const override = settings.email.vendorOverrides.get(vendorId.toString());
    override.enabled = false;
    settings.email.vendorOverrides.set(vendorId.toString(), override);
    await settings.save();
  } else {
    settings.email.vendorOverrides.set(vendorId.toString(), { enabled: false });
    await settings.save();
  }
  // Log this action
  await Activity.create({
    type: 'reminder_marked_sent',
    orderId,
    title: 'Marked as Sent',
    description: `Order marked as sent for vendor ${vendorId}`,
    metadata: {},
    isSystemGenerated: true,
    timestamp: new Date(),
  });
  // Notify sales team if enabled
  if (settings.email.salesTeamEnabled && Array.isArray(settings.email.salesTeamEmails) && settings.email.salesTeamEmails.length) {
    const vendorName = (order.items.find(i => i.vendor && (i.vendor.toString() === vendorId.toString()))?.vendorName) || vendorId;
    const vars = {logo: 'https://meddey.com/cdn/shop/files/Meddey_1_a9e7c93d-6b1b-4d73-b4cb-bb110a73204f.png', marked:[{vendorName,orderName:order.orderName,orderDate:order.createdAt?new Date(order.createdAt).toLocaleDateString():''}]};
    for (const to of settings.email.salesTeamEmails) {
      await sendDBTemplate(to, 'salesNotification', vars);
    }
  }
}
module.exports = {
  getReminderConfig,
  scheduleReminder,
  sendReminder,
  processPendingReminders,
  logReminder,
  markOrderAsSent,
  reminderQueue
};
