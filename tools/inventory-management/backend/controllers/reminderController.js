const asyncHandler = require('express-async-handler');
const reminderService = require('../services/reminderService');

exports.sendReminderNow = asyncHandler(async (req, res) => {
  const { orderId, template, to, meta } = req.body;
  await reminderService.sendReminder(orderId, template, to, meta);
  res.json({ success: true });
});

exports.scheduleReminder = asyncHandler(async (req, res) => {
  const { orderId, template, when, to, meta } = req.body;
  await reminderService.scheduleReminder(orderId, template, when, to, meta);
  res.json({ success: true });
});

exports.listPendingReminders = asyncHandler(async (req, res) => {
  res.json({ reminders: reminderService.reminderQueue });
});

exports.listHistory = asyncHandler(async (req, res) => {
  // Could filter by order, meta, etc in real usage
  res.json({ history: reminderService.reminderQueue.filter(r => r.sent) });
});

exports.retryReminder = asyncHandler(async (req, res) => {
  const { orderId } = req.body;
  // Find and retry (simple logic for demo)
  const reminder = reminderService.reminderQueue.find(r => r.orderId === orderId && r.status === 'error');
  if (!reminder) return res.status(404).json({ message: 'Not found or not failed' });
  await reminderService.sendReminder(reminder.orderId, reminder.template, reminder.to, reminder.meta);
  reminder.sent = true;
  reminder.status = 'resent';
  res.json({ success: true });
});

exports.markAsSent = asyncHandler(async (req, res) => {
  const { orderId, vendorId } = req.body;
  if (!orderId || !vendorId) return res.status(400).json({message:'orderId and vendorId required'});
  await reminderService.markOrderAsSent(orderId, vendorId);
  res.json({ ok: true });
});
