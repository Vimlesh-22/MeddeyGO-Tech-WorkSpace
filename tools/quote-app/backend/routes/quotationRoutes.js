const express = require('express');
const {
  createQuotation,
  getQuotations,
  getQuotation,
  updateQuotation,
  deleteQuotation,
  importProductsFromCSV,
  generatePDF,
  exportQuotations,
  upload,
} = require('../controllers/quotationController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/', protect, createQuotation);
router.get('/', protect, getQuotations);
router.post('/import', protect, upload.single('csv'), importProductsFromCSV);
router.get('/export', protect, exportQuotations);
router.get('/:id', protect, getQuotation);
router.put('/:id', protect, updateQuotation);
router.delete('/:id', protect, deleteQuotation);
router.get('/:id/pdf', protect, generatePDF);

module.exports = router;