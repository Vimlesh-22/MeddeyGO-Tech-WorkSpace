const express = require('express');
const router = express.Router();
const {
  getSettings, 
  updateSettings,
  syncVendorDirectory,
  getVendorSuggestions,
  getSheetsHeaders,
  getSheetsMapping,
  saveSheetsMapping,
  restoreSheetsMapping,
  getEmailSettings,
  updateEmailSettings,
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  restoreTemplate,
  restoreAllTemplates,
  setVendorOverride,
  deleteVendorOverride,
  addEmailRecipient,
  removeEmailRecipient,
  getEmailHistory,
  getEmailRecipientSuggestions
} = require('../controllers/settingsController');

// Get all settings
router.get('/', getSettings);

// Update settings
router.post('/', updateSettings);

// Sync vendor directory with Google Sheets + manual updates
router.post('/vendor-directory/sync', syncVendorDirectory);

// Get vendor suggestions sourced from Google Sheets
router.get('/vendor-suggestions', getVendorSuggestions);

// Sheets headers & mapping
router.get('/sheets/headers', getSheetsHeaders);
router.get('/sheets/mapping', getSheetsMapping);
router.post('/sheets/mapping', saveSheetsMapping);
router.post('/sheets/mapping/restore', restoreSheetsMapping);

// Email/Reminder settings
router.get('/email', getEmailSettings);
router.post('/email', updateEmailSettings);

// Template CRUD
router.get('/templates', listTemplates);
router.get('/templates/:name', getTemplate);
router.post('/templates', createTemplate);
router.put('/templates/:name', updateTemplate);
router.delete('/templates/:name', deleteTemplate);
router.post('/templates/:name/restore', restoreTemplate);
router.post('/templates/restore/defaults', restoreAllTemplates);

// Vendor override CRUD
router.post('/email/vendor-override', setVendorOverride);
router.delete('/email/vendor-override', deleteVendorOverride);

// Email recipient management
router.post('/email/recipients', addEmailRecipient);
router.delete('/email/recipients', removeEmailRecipient);

// Email history
router.get('/email/history', getEmailHistory);

// Email recipient suggestions
router.get('/email/suggestions', getEmailRecipientSuggestions);

module.exports = router;
