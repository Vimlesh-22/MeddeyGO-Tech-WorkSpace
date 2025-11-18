const express = require('express');
const {
  createPricingRule,
  getPricingRules,
  getPricingRule,
  updatePricingRule,
  deletePricingRule,
  applyPricingRules,
} = require('../controllers/pricingRuleController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/', protect, createPricingRule);
router.get('/', protect, getPricingRules);
router.get('/:id', protect, getPricingRule);
router.put('/:id', protect, updatePricingRule);
router.delete('/:id', protect, deletePricingRule);
router.post('/apply', protect, applyPricingRules);

module.exports = router; 