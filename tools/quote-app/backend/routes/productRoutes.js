const express = require('express');
const {
  createProduct,
  getProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  importProductsFromCSV,
  upload
} = require('../controllers/productController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/', protect, createProduct);
router.get('/', protect, getProducts);
router.get('/:id', protect, getProduct);
router.put('/:id', protect, updateProduct);
router.delete('/:id', protect, deleteProduct);
router.post('/import', protect, upload.single('csv'), importProductsFromCSV);

module.exports = router; 