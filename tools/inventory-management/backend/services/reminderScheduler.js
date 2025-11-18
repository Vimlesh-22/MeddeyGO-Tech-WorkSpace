const Settings = require('../models/Settings');
const { sendReminders } = require('../controllers/reminderController');

function getNextRunDelay(sendTime = '09:00') {
  const [hh, mm] = String(sendTime).split(':').map(n => parseInt(n, 10) || 0);
  const now = new Date();
  const next = new Date();
  next.setHours(hh, mm, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

async function runOnce(app) {
  try {
    // Reuse controller to keep logic in one place
    // Construct minimal req/res with only what's needed
    await sendReminders({ body: {} }, {
      json: (_) => _,
      status: () => ({ json: (_) => _ }),
      headersSent: false,
      setHeader: () => {},
    });
  } catch (e) {
    console.error('[ReminderScheduler] sendReminders failed:', e.message);
  }
}

async function scheduleDailyReminders(app) {
  try {
    const settings = await Settings.findOne().lean();
    const emailCfg = settings?.email || {};
    if (!emailCfg?.reminder?.enabled) {
      console.log('[ReminderScheduler] Reminder disabled in settings; scheduler not started');
      return;
    }
    const sendTime = emailCfg.reminder.sendTime || '09:00';
    const delay = getNextRunDelay(sendTime);
    console.log(`[ReminderScheduler] Next run scheduled in ${Math.round(delay/1000)}s at ${sendTime}`);

    setTimeout(async () => {
      await runOnce(app);
      // After first run, run every 24h roughly at the same clock time
      setInterval(async () => {
        await runOnce(app);
      }, 24 * 60 * 60 * 1000);
    }, delay);
  } catch (e) {
    console.error('[ReminderScheduler] Failed to initialize:', e.message);
  }
}

module.exports = { scheduleDailyReminders };


