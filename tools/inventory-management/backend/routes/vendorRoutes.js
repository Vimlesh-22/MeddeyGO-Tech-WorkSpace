const express = require('express');
const router = express.Router();
const {
  createVendor,
  getVendors,
  mapSkuToVendor,
  getVendorById,
  updateVendor,
  deleteVendor,
  findDuplicates,
  mergeDuplicates,
  bulkDeleteVendors,
  suggestVendor
} = require('../controllers/vendorController');

// Get duplicates before other GET routes to avoid ID conflict
router.get('/duplicates', findDuplicates);

router.post('/', createVendor);
router.get('/', getVendors);
router.post('/merge', mergeDuplicates);
router.post('/bulk-delete', bulkDeleteVendors);
router.get('/suggest/:sku', suggestVendor);
router.post('/:id/map-sku', mapSkuToVendor);
router.get('/:id', getVendorById);
router.put('/:id', updateVendor);
router.delete('/:id', deleteVendor);

module.exports = router;
