const nodemailer = require('nodemailer');

/**
 * Initialize email transporter from environment variables
 */
const getEmailTransporter = () => {
  // Get SMTP config from environment variables
  const smtpConfig = {
    host: process.env.EMAIL_SMTP_HOST || process.env.SMTP_HOST || '',
    port: parseInt(process.env.EMAIL_SMTP_PORT || process.env.SMTP_PORT) || 587,
    secure: (process.env.EMAIL_SMTP_SECURE || process.env.SMTP_SECURE) === 'true',
    auth: {
      user: process.env.EMAIL_SMTP_USER || process.env.SMTP_USER || '',
      pass: process.env.EMAIL_SMTP_PASS || process.env.SMTP_PASSWORD || ''
    }
  };

  if (!smtpConfig.host || !smtpConfig.auth.user || !smtpConfig.auth.pass) {
    console.warn('Email service not configured. Please set SMTP_* or EMAIL_SMTP_* environment variables.');
    return null;
  }

  return nodemailer.createTransport(smtpConfig);
};

/**
 * Send email
 * @param {Object} options - Email options
 * @param {String|Array} options.to - Recipient email(s)
 * @param {String} options.subject - Email subject
 * @param {String} options.html - Email HTML content
 * @param {String} options.text - Email plain text content
 */
const sendEmail = async (options) => {
  try {
    const transporter = getEmailTransporter();
    
    if (!transporter) {
      throw new Error('Email transporter not configured');
    }

    // SECURITY: Require email from address, no hardcoded fallback
    const from = process.env.EMAIL_FROM || process.env.EMAIL_SMTP_USER || process.env.SMTP_FROM || process.env.SMTP_USER;
    
    if (!from) {
      throw new Error('Email FROM address not configured. Please set EMAIL_FROM, EMAIL_SMTP_USER, SMTP_FROM, or SMTP_USER in project-hub/.env');
    }
    
    const displayName =
      process.env.SMTP_FROM_NAME ||
      process.env.EMAIL_FROM_NAME ||
      process.env.EMAIL_SENDER_NAME ||
      process.env.APP_NAME;
    const formattedFrom = displayName ? `${displayName} <${from}>` : from;

    const mailOptions = {
      from: formattedFrom,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    console.error('Error sending email:', error.message);
    throw error;
  }
};

/**
 * Send vendor reminder email
 * @param {Object} vendor - Vendor object
 * @param {Array} items - Items that need reminder
 * @param {String} template - HTML template content
 */
const sendVendorReminderEmail = async (vendor, items, template) => {
  try {
    if (!vendor.email) {
      throw new Error('Vendor email not configured');
    }

    // Replace template variables
    const html = template
      .replace(/{{vendorName}}/g, vendor.name || 'Vendor')
      .replace(/{{orderDetails}}/g, generateOrderDetailsTable(items))
      .replace(/{{message}}/g, getEmailMessage());

    await sendEmail({
      to: vendor.email,
      subject: 'Order Reminder - Items Pending',
      html: html,
      text: `Dear ${vendor.name},\n\nYou have ${items.length} pending items that need attention.`
    });

    return true;
  } catch (error) {
    console.error('Error sending vendor reminder:', error.message);
    throw error;
  }
};

/**
 * Send sales team reminder email
 * @param {Array} salesTeamEmails - Sales team email addresses
 * @param {Array} orders - Orders needing attention
 * @param {String} template - HTML template content
 */
// SECURITY: Validate email array server-side
function validateEmailArray(emails) {
  if (!Array.isArray(emails)) {
    throw new Error('Emails must be an array');
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validated = [];
  
  for (const email of emails) {
    if (typeof email !== 'string') {
      throw new Error('All email addresses must be strings');
    }
    const normalized = email.toLowerCase().trim();
    if (!emailRegex.test(normalized)) {
      throw new Error(`Invalid email format: ${email}`);
    }
    validated.push(normalized);
  }
  
  return validated;
}

const sendSalesTeamReminderEmail = async (salesTeamEmails, orders, template) => {
  try {
    if (!salesTeamEmails || salesTeamEmails.length === 0) {
      throw new Error('Sales team emails not configured');
    }

    // SECURITY: Validate email array server-side before using
    const validatedEmails = validateEmailArray(salesTeamEmails);

    const html = template
      .replace(/{{orderCount}}/g, orders.length)
      .replace(/{{ordersList}}/g, generateOrdersList(orders))
      .replace(/{{message}}/g, getEmailMessage());

    // SECURITY: Send to each email individually to prevent array manipulation
    // Note: This sends separate emails, but ensures security
    // For bulk sending, use BCC or a proper email service
    for (const email of validatedEmails) {
      await sendEmail({
        to: email, // Single email, validated
        subject: `Inventory Reminder - ${orders.length} Orders Need Attention`,
        html: html,
        text: `You have ${orders.length} orders that need attention.`
      });
    }

    return true;
  } catch (error) {
    console.error('Error sending sales team reminder:', error.message);
    throw error;
  }
};

/**
 * Generate order details table HTML
 */
const generateOrderDetailsTable = (items) => {
  const rows = items.map(item => `
    <tr>
      <td>${item.productName || 'N/A'}</td>
      <td>${item.sku || 'N/A'}</td>
      <td>${item.quantity || 0}</td>
      <td>${item.expectedDate ? new Date(item.expectedDate).toLocaleDateString() : 'N/A'}</td>
    </tr>
  `).join('');

  return `
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">
      <thead>
        <tr>
          <th>Product</th>
          <th>SKU</th>
          <th>Quantity</th>
          <th>Expected Date</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
};

/**
 * Generate orders list HTML
 */
const generateOrdersList = (orders) => {
  const list = orders.map(order => `
    <li>
      <strong>${order.orderName}</strong> - ${order.items?.length || 0} items
      <br>
      <small>Date: ${order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}</small>
    </li>
  `).join('');

  return `<ul>${list}</ul>`;
};

/**
 * Get email message from settings
 */
const getEmailMessage = () => {
  // Could fetch from settings if needed
  return 'This is an automated reminder. Please review the details below and take necessary action.';
};

/**
 * Send email with Excel attachment
 * @param {Object} options - Email options
 * @param {String|Array} options.to - Recipient email(s)
 * @param {String} options.subject - Email subject
 * @param {String} options.html - Email HTML content
 * @param {String} options.text - Email plain text content
 * @param {Buffer} options.attachment - Excel file buffer
 * @param {String} options.filename - Attachment filename
 */
const sendEmailWithAttachment = async (options) => {
  try {
    const transporter = getEmailTransporter();
    
    if (!transporter) {
      throw new Error('Email transporter not configured');
    }

    // SECURITY: Require email from address, no hardcoded fallback
    const from = process.env.EMAIL_FROM || process.env.EMAIL_SMTP_USER || process.env.SMTP_FROM || process.env.SMTP_USER;
    
    if (!from) {
      throw new Error('Email FROM address not configured. Please set EMAIL_FROM, EMAIL_SMTP_USER, SMTP_FROM, or SMTP_USER in project-hub/.env');
    }
    
    const displayName =
      process.env.SMTP_FROM_NAME ||
      process.env.EMAIL_FROM_NAME ||
      process.env.EMAIL_SENDER_NAME ||
      process.env.APP_NAME;
    const formattedFrom = displayName ? `${displayName} <${from}>` : from;

    const mailOptions = {
      from: formattedFrom,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachment ? [{
        filename: options.filename || 'attachment.xlsx',
        content: options.attachment
      }] : []
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email with attachment sent successfully:', result.messageId);
    return result;
  } catch (error) {
    console.error('Error sending email with attachment:', error.message);
    throw error;
  }
};

/**
 * Send processed orders Excel export via email
 * @param {Buffer} excelBuffer - Excel file buffer
 * @param {Array} recipients - Array of recipient email addresses
 * @param {Number} orderCount - Number of orders in export
 */
const sendProcessedOrdersEmail = async (excelBuffer, recipients, orderCount, message) => {
  try {
    if (!recipients || recipients.length === 0) {
      throw new Error('No recipient emails configured');
    }

    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `processed-orders-${dateStr}.xlsx`;
    
    const html = `
      <html>
        <body>
          <h2>Processed Orders Export</h2>
          <p>This email contains an Excel export of all processed orders.</p>
          <p><strong>Total Orders:</strong> ${orderCount}</p>
          <p><strong>Export Date:</strong> ${new Date().toLocaleString()}</p>
          ${message ? `<p><strong>Message:</strong> ${String(message).trim()}</p>` : ''}
          <p>Please find the attached Excel file with all processed order details.</p>
          <br>
          <p>This is an automated email from the Inventory Management System.</p>
        </body>
      </html>
    `;

    const text = `Processed Orders Export\n\nTotal Orders: ${orderCount}\nExport Date: ${new Date().toLocaleString()}${message ? `\nMessage: ${String(message).trim()}` : ''}\n\nPlease find the attached Excel file.`;

    const result = await sendEmailWithAttachment({
      to: Array.isArray(recipients) ? recipients.join(',') : recipients,
      subject: `Processed Orders Export - ${dateStr}`,
      html: html,
      text: text,
      attachment: excelBuffer,
      filename: filename
    });
    try {
      // Upsert recipients for suggestions/history
      const EmailRecipient = require('../models/EmailRecipient');
      const normalized = Array.isArray(recipients) ? recipients : String(recipients).split(',');
      const clean = normalized.map(e => String(e).toLowerCase().trim()).filter(Boolean);
      if (clean.length > 0) {
        await Promise.all(clean.map(async (email) => {
          await EmailRecipient.updateOne(
            { email },
            { $set: { email, lastSentAt: new Date() }, $inc: { timesSent: 1 }, $addToSet: { sources: 'processed_orders_export' } },
            { upsert: true }
          );
        }));
      }
    } catch (e) {
      console.warn('[EmailService] Failed to upsert EmailRecipient records:', e?.message || e);
    }
    
    return true;
  } catch (error) {
    console.error('Error sending processed orders email:', error.message);
    throw error;
  }
};

module.exports = {
  sendEmail,
  sendVendorReminderEmail,
  sendSalesTeamReminderEmail,
  getEmailTransporter,
  sendEmailWithAttachment,
  sendProcessedOrdersEmail
};

