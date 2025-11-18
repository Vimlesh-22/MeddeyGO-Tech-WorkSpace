const cron = require('node-cron');
const Order = require('../models/Order');
const Settings = require('../models/Settings');
const { exportProcessedOrdersToExcel } = require('../services/excelExportService');
const { sendProcessedOrdersEmail } = require('../services/emailService');

/**
 * Processed Orders Scheduler
 * Automatically moves Pending orders to Processed stage at configured time (default: 4 AM IST)
 */

/**
 * Convert IST time to UTC for cron scheduling
 * IST is UTC+5:30
 * @param {String} istTime - Time in HH:MM format (24-hour)
 * @returns {String} Cron expression in UTC
 */
function convertISTToCron(istTime) {
  if (!istTime || !istTime.match(/^\d{2}:\d{2}$/)) {
    // Default to 4 AM IST = 22:30 UTC (previous day)
    return '30 22 * * *';
  }

  const [hours, minutes] = istTime.split(':').map(Number);
  
  // IST is UTC+5:30, so subtract 5 hours and 30 minutes
  let utcHours = hours - 5;
  let utcMinutes = minutes - 30;
  
  // Handle day rollover
  if (utcMinutes < 0) {
    utcMinutes += 60;
    utcHours -= 1;
  }
  if (utcHours < 0) {
    utcHours += 24;
  }
  
  // Cron format: minute hour day month dayOfWeek
  return `${utcMinutes} ${utcHours} * * *`;
}

/**
 * Move all Pending orders to Processed stage
 */
async function movePendingToProcessed() {
  try {
    console.log('[ProcessedOrdersScheduler] Checking for Pending orders to move to Processed...');
    
    // Find all Pending orders
    const pendingOrders = await Order.find({ stage: 'Pending' });
    
    if (pendingOrders.length === 0) {
      console.log('[ProcessedOrdersScheduler] No pending orders to move (this is OK, email was already sent)');
      return { success: true, moved: 0 };
    }
    
    console.log(`[ProcessedOrdersScheduler] Found ${pendingOrders.length} pending orders to move`);
    
    // Move each order to Processed stage
    const orderIds = pendingOrders.map(o => o._id);
    const updateResult = await Order.updateMany(
      { _id: { $in: orderIds } },
      {
        $set: {
          stage: 'Processed',
          updatedAt: new Date(),
          processedAt: new Date()
        },
        $push: {
          history: {
            stage: 'Processed',
            timestamp: new Date(),
            comment: 'Automatically moved to Processed by scheduled job'
          }
        }
      }
    );
    
    console.log(`[ProcessedOrdersScheduler] Successfully moved ${updateResult.modifiedCount} orders to Processed stage`);
    
    return {
      success: true,
      moved: updateResult.modifiedCount,
      total: pendingOrders.length
    };
  } catch (error) {
    console.error('[ProcessedOrdersScheduler] Error moving pending orders:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

let currentCronJob = null;
let lastCronExpression = null;

/**
 * Reload schedule time from Settings and restart scheduler if needed
 */
async function reloadScheduleTime() {
  try {
    const settings = await Settings.findOne().lean();
    const scheduledTime = settings?.email?.processedOrdersExport?.scheduleTime || '04:00';
    return scheduledTime;
  } catch (error) {
    console.error('[ProcessedOrdersScheduler] Error reloading schedule time:', error);
    return '04:00'; // Default fallback
  }
}

/**
 * Start the scheduler
 * @param {Object} app - Express app instance (optional, for logging)
 */
function startProcessedOrdersScheduler(app) {
  console.log('[ProcessedOrdersScheduler] Initializing scheduler...');
  
  // Get scheduled time from Settings (default: 4 AM IST)
  let scheduledTime = '04:00'; // Default 4 AM IST
  
  // Try to get from Settings
  Settings.findOne().lean().then(async settings => {
    if (settings?.email?.processedOrdersExport?.scheduleTime) {
      scheduledTime = settings.email.processedOrdersExport.scheduleTime;
      console.log(`[ProcessedOrdersScheduler] Using configured time: ${scheduledTime} IST`);
    } else {
      console.log(`[ProcessedOrdersScheduler] Using default time: ${scheduledTime} IST`);
    }
    
    // Convert IST time to UTC cron expression
    const cronExpression = convertISTToCron(scheduledTime);
    console.log(`[ProcessedOrdersScheduler] Cron expression (UTC): ${cronExpression}`);
    
    // Schedule the job
    if (currentCronJob) {
      try { currentCronJob.stop(); } catch {}
      currentCronJob = null;
    }
    lastCronExpression = cronExpression;
    currentCronJob = cron.schedule(cronExpression, async () => {
      // Reload schedule time and trigger method on each run to pick up changes
      const currentSettings = await Settings.findOne().lean();
      const currentScheduleTime = currentSettings?.email?.processedOrdersExport?.scheduleTime || '04:00';
      const triggerMethod = currentSettings?.email?.processedOrdersExport?.triggerMethod || 'automatic';
      
      console.log(`[ProcessedOrdersScheduler] Running scheduled job at ${new Date().toISOString()} (Schedule: ${currentScheduleTime} IST, Trigger: ${triggerMethod})`);
      
      // Skip if trigger method is manual
      if (triggerMethod === 'manual') {
        console.log('[ProcessedOrdersScheduler] Trigger method is manual, skipping automatic execution');
        return;
      }
      
      // Step 1: Try to get today's processed orders first
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      
      let processedOrders = await Order.find({ 
        stage: 'Processed',
        processedAt: { $gte: today, $lte: todayEnd }
      }).populate('items.vendor', 'name').lean();
      
      console.log(`[ProcessedOrdersScheduler] Found ${processedOrders.length} processed order(s) from today`);
      
      // If no orders today, try yesterday's
      if (processedOrders.length === 0) {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayEnd = new Date(today);
        yesterdayEnd.setMilliseconds(-1);
        
        processedOrders = await Order.find({ 
          stage: 'Processed',
          processedAt: { $gte: yesterday, $lte: yesterdayEnd }
        }).populate('items.vendor', 'name').lean();
        
        console.log(`[ProcessedOrdersScheduler] Found ${processedOrders.length} processed order(s) from yesterday`);
      }
      
      // Step 2: Reload settings to get latest email config
      const emailSettings = await Settings.findOne().lean();
      const emailConfig = emailSettings?.email?.processedOrdersExport || {};
      
      // Step 3: Send email export FIRST if enabled and there are processed orders
      // Only move Pending to Processed AFTER email is successfully sent
      let emailSentSuccessfully = false;
      
      if (processedOrders.length > 0) {
        try {
          if (emailConfig.enabled !== false && emailConfig.recipients && Array.isArray(emailConfig.recipients) && emailConfig.recipients.length > 0) {
            console.log(`[ProcessedOrdersScheduler] Generating Excel export for ${processedOrders.length} processed orders...`);
            
            // Calculate date range from orders
            let startDate = null;
            let endDate = null;
            if (processedOrders.length > 0) {
              const dates = processedOrders
                .map(o => o.createdAt ? new Date(o.createdAt) : null)
                .filter(d => d !== null)
                .sort((a, b) => a - b);
              if (dates.length > 0) {
                startDate = dates[0].toISOString().split('T')[0];
                endDate = dates[dates.length - 1].toISOString().split('T')[0];
              }
            }
            
            const excelBuffer = await exportProcessedOrdersToExcel(processedOrders, {
              startDate,
              endDate
            });
            
            // Verify Excel buffer was generated
            if (!excelBuffer || !Buffer.isBuffer(excelBuffer)) {
              throw new Error('Excel buffer was not generated correctly');
            }
            
            console.log(`[ProcessedOrdersScheduler] Excel buffer generated: ${excelBuffer.length} bytes`);
            console.log(`[ProcessedOrdersScheduler] Sending email to ${emailConfig.recipients.length} recipient(s)...`);
            
            // Send email and wait for success
            await sendProcessedOrdersEmail(excelBuffer, emailConfig.recipients, processedOrders.length);
            try {
              // Log Activity entry for sent email
              const Activity = require('../models/Activity');
              await Activity.create({
                type: 'email_sent',
                title: 'Processed Orders Export Email Sent',
                description: `Exported ${processedOrders.length} processed order(s)`,
                metadata: { recipients: emailConfig.recipients, orderCount: processedOrders.length, startDate, endDate },
                isSystemGenerated: true,
              });
              await Activity.create({
                type: 'processed_orders_exported',
                title: 'Processed Orders Export Generated',
                description: `Excel export generated for ${processedOrders.length} processed order(s)`,
                metadata: { orderCount: processedOrders.length, startDate, endDate },
                isSystemGenerated: true,
              });
            } catch (logErr) {
              console.warn('[ProcessedOrdersScheduler] Failed to log email/export activity:', logErr?.message || logErr);
            }
            emailSentSuccessfully = true;
            console.log(`[ProcessedOrdersScheduler] Email sent successfully to all recipients with Excel attachment`);
          } else {
            console.log('[ProcessedOrdersScheduler] Email not sent - disabled or no recipients configured');
            // If email is disabled, allow moving orders
            emailSentSuccessfully = true;
          }
        } catch (error) {
          console.error('[ProcessedOrdersScheduler] Error sending email export:', error);
          // Email failed - DO NOT move orders
          emailSentSuccessfully = false;
          console.error('[ProcessedOrdersScheduler] ABORTING: Orders will NOT be moved from Pending to Processed due to email failure');
          return; // Exit early, don't move orders
        }
      } else {
        console.log('[ProcessedOrdersScheduler] No processed orders found from today or yesterday');
        // If email is disabled or no orders, allow moving pending orders
        emailSentSuccessfully = true;
      }
      
      // Step 3: Move Processed orders to Pending (cleanup) after email is sent
      if (emailSentSuccessfully && processedOrders.length > 0) {
        try {
          const processedOrderIds = processedOrders.map(o => o._id);
          const cleanupResult = await Order.updateMany(
            { _id: { $in: processedOrderIds } },
            {
              $set: {
                stage: 'Pending',
                updatedAt: new Date()
              },
              $push: {
                history: {
                  stage: 'Pending',
                  timestamp: new Date(),
                  comment: 'Automatically moved to Pending by cleanup job after export'
                }
              }
            }
          );
          console.log(`[ProcessedOrdersScheduler] Moved ${cleanupResult.modifiedCount} processed orders back to Pending`);
        } catch (cleanupError) {
          console.error('[ProcessedOrdersScheduler] Error moving processed orders to Pending:', cleanupError);
        }
      }
      
      // Step 4: Move Pending orders to Processed (if any)
      const result = await movePendingToProcessed();
      console.log(`[ProcessedOrdersScheduler] Job completed:`, result);
    }, {
      timezone: 'UTC' // Cron runs in UTC, we convert IST to UTC
    });
    
    console.log('[ProcessedOrdersScheduler] Scheduler started successfully');
  }).catch(error => {
    console.error('[ProcessedOrdersScheduler] Error initializing scheduler:', error);
    // Fall back to default time
    const cronExpression = convertISTToCron('04:00');
    console.log(`[ProcessedOrdersScheduler] Using fallback cron expression (UTC): ${cronExpression}`);
    cron.schedule(cronExpression, async () => {
      console.log(`[ProcessedOrdersScheduler] Running scheduled job (fallback) at ${new Date().toISOString()}`);
      await movePendingToProcessed();
    }, {
      timezone: 'UTC'
    });
    console.log('[ProcessedOrdersScheduler] Fallback scheduler started successfully');
  });
}

function rescheduleProcessedOrdersScheduler(istTime) {
  try {
    const cronExpression = convertISTToCron(istTime || '04:00');
    if (lastCronExpression === cronExpression && currentCronJob) return;
    if (currentCronJob) {
      try { currentCronJob.stop(); } catch {}
      currentCronJob = null;
    }
    lastCronExpression = cronExpression;
    currentCronJob = cron.schedule(cronExpression, async () => {
      console.log(`[ProcessedOrdersScheduler] Running scheduled job at ${new Date().toISOString()}`);
      
      // Reload settings each time to get latest configuration
      const currentSettings = await Settings.findOne().lean();
      const currentEmailConfig = currentSettings?.email?.processedOrdersExport || { enabled: true, recipients: [], scheduleTime: '04:00', triggerMethod: 'automatic' };
      
      // Skip if trigger method is manual
      if (currentEmailConfig.triggerMethod === 'manual') {
        console.log('[ProcessedOrdersScheduler] Trigger method is manual, skipping automatic execution');
        return;
      }
      
      // Step 1: Try to get today's processed orders first
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      
      let processedOrdersForEmail = await Order.find({ 
        stage: 'Processed',
        processedAt: { $gte: today, $lte: todayEnd }
      }).populate('items.vendor', 'name').lean();
      
      console.log(`[ProcessedOrdersScheduler] Found ${processedOrdersForEmail.length} processed order(s) from today`);
      
      // If no orders today, try yesterday's
      if (processedOrdersForEmail.length === 0) {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayEnd = new Date(today);
        yesterdayEnd.setMilliseconds(-1);
        
        processedOrdersForEmail = await Order.find({ 
          stage: 'Processed',
          processedAt: { $gte: yesterday, $lte: yesterdayEnd }
        }).populate('items.vendor', 'name').lean();
        
        console.log(`[ProcessedOrdersScheduler] Found ${processedOrdersForEmail.length} processed order(s) from yesterday`);
      }
      
      // Step 2: Send email export if we have orders and email is enabled
      let emailSentSuccessfully = false;
      
      if (processedOrdersForEmail.length > 0) {
        try {
          if (currentEmailConfig.enabled !== false && currentEmailConfig.recipients && Array.isArray(currentEmailConfig.recipients) && currentEmailConfig.recipients.length > 0) {
            console.log(`[ProcessedOrdersScheduler] Generating Excel export for ${processedOrdersForEmail.length} processed orders...`);
            
            // Calculate date range from orders
            let startDate = null;
            let endDate = null;
            if (processedOrdersForEmail.length > 0) {
              const dates = processedOrdersForEmail
                .map(o => o.createdAt ? new Date(o.createdAt) : null)
                .filter(d => d !== null)
                .sort((a, b) => a - b);
              if (dates.length > 0) {
                startDate = dates[0].toISOString().split('T')[0];
                endDate = dates[dates.length - 1].toISOString().split('T')[0];
              }
            }
            
            const excelBuffer = await exportProcessedOrdersToExcel(processedOrdersForEmail, {
              startDate,
              endDate
            });
            
            // Verify Excel buffer was generated
            if (!excelBuffer || !Buffer.isBuffer(excelBuffer)) {
              throw new Error('Excel buffer was not generated correctly');
            }
            
            await sendProcessedOrdersEmail(excelBuffer, currentEmailConfig.recipients, processedOrdersForEmail.length);
            
            try {
              const Activity = require('../models/Activity');
              await Activity.create({
                type: 'email_sent',
                title: 'Processed Orders Export Email Sent',
                description: `Exported ${processedOrdersForEmail.length} processed order(s)`,
                metadata: { recipients: currentEmailConfig.recipients, orderCount: processedOrdersForEmail.length, startDate, endDate },
                isSystemGenerated: true,
              });
              await Activity.create({
                type: 'processed_orders_exported',
                title: 'Processed Orders Export Generated',
                description: `Excel export generated for ${processedOrdersForEmail.length} processed order(s)`,
                metadata: { orderCount: processedOrdersForEmail.length, startDate, endDate },
                isSystemGenerated: true,
              });
            } catch (logErr) {
              console.warn('[ProcessedOrdersScheduler] Failed to log email/export activity:', logErr?.message || logErr);
            }
            emailSentSuccessfully = true;
            console.log(`[ProcessedOrdersScheduler] Email sent successfully to all recipients with Excel attachment`);
          } else {
            console.log('[ProcessedOrdersScheduler] Email not sent - disabled or no recipients configured');
            // If email is disabled, allow moving orders
            emailSentSuccessfully = true;
          }
        } catch (error) {
          console.error('[ProcessedOrdersScheduler] Error sending email export:', error);
          // Email failed - DO NOT move orders
          emailSentSuccessfully = false;
          console.error('[ProcessedOrdersScheduler] ABORTING: Orders will NOT be moved from Pending to Processed due to email failure');
          return; // Exit early, don't move orders
        }
      } else {
        console.log('[ProcessedOrdersScheduler] No processed orders found from today or yesterday');
        // If email is disabled or no orders, allow moving pending orders
        emailSentSuccessfully = true;
      }
      
      // Step 3: Move Processed orders to Pending (cleanup) after email is sent
      if (emailSentSuccessfully && processedOrdersForEmail.length > 0) {
        try {
          const processedOrderIds = processedOrdersForEmail.map(o => o._id);
          const cleanupResult = await Order.updateMany(
            { _id: { $in: processedOrderIds } },
            {
              $set: {
                stage: 'Pending',
                updatedAt: new Date()
              },
              $push: {
                history: {
                  stage: 'Pending',
                  timestamp: new Date(),
                  comment: 'Automatically moved to Pending by cleanup job after export'
                }
              }
            }
          );
          console.log(`[ProcessedOrdersScheduler] Moved ${cleanupResult.modifiedCount} processed orders back to Pending`);
        } catch (cleanupError) {
          console.error('[ProcessedOrdersScheduler] Error moving processed orders to Pending:', cleanupError);
        }
      }
      
      // Step 4: Move Pending orders to Processed (if any)
      const result = await movePendingToProcessed();
      console.log(`[ProcessedOrdersScheduler] Job completed:`, result);
    }, {
      timezone: 'UTC' // Cron runs in UTC, we convert IST to UTC
    });
    console.log('[ProcessedOrdersScheduler] Scheduler rescheduled');
  } catch (e) {}
}

module.exports = {
  startProcessedOrdersScheduler,
  movePendingToProcessed,
  convertISTToCron,
  rescheduleProcessedOrdersScheduler
};

