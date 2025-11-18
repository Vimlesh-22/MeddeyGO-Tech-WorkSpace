const express = require('express');
const router = express.Router();
const reminderController = require('../controllers/reminderController');

router.post('/send', reminderController.sendReminderNow);
router.post('/schedule', reminderController.scheduleReminder);
router.get('/pending', reminderController.listPendingReminders);
router.get('/history', reminderController.listHistory);
router.post('/retry', reminderController.retryReminder);
router.post('/mark-sent', reminderController.markAsSent);

module.exports = router;
