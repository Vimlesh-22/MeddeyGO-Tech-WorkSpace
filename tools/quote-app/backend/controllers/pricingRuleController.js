const PricingRule = require('../models/PricingRule');

// @desc    Create a pricing rule
// @route   POST /api/rules
// @access  Private
exports.createPricingRule = async (req, res) => {
  try {
    req.body.createdBy = req.user.id;
    
    const pricingRule = await PricingRule.create(req.body);
    
    res.status(201).json({
      success: true,
      data: pricingRule,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all pricing rules
// @route   GET /api/rules
// @access  Private
exports.getPricingRules = async (req, res) => {
  try {
    const pricingRules = await PricingRule.find().populate({
      path: 'createdBy',
      select: 'name email',
    });
    
    res.status(200).json({
      success: true,
      count: pricingRules.length,
      data: pricingRules,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single pricing rule
// @route   GET /api/rules/:id
// @access  Private
exports.getPricingRule = async (req, res) => {
  try {
    const pricingRule = await PricingRule.findById(req.params.id).populate({
      path: 'createdBy',
      select: 'name email',
    });
    
    if (!pricingRule) {
      return res.status(404).json({
        success: false,
        message: 'Pricing rule not found',
      });
    }
    
    res.status(200).json({
      success: true,
      data: pricingRule,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update pricing rule
// @route   PUT /api/rules/:id
// @access  Private
exports.updatePricingRule = async (req, res) => {
  try {
    let pricingRule = await PricingRule.findById(req.params.id);
    
    if (!pricingRule) {
      return res.status(404).json({
        success: false,
        message: 'Pricing rule not found',
      });
    }
    
    // Check if user is rule owner or admin
    if (
      pricingRule.createdBy.toString() !== req.user.id &&
      req.user.role !== 'admin'
    ) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to update this rule',
      });
    }
    
    pricingRule = await PricingRule.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate({
      path: 'createdBy',
      select: 'name email',
    });
    
    res.status(200).json({
      success: true,
      data: pricingRule,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete pricing rule
// @route   DELETE /api/rules/:id
// @access  Private
exports.deletePricingRule = async (req, res) => {
  try {
    const pricingRule = await PricingRule.findById(req.params.id);
    
    if (!pricingRule) {
      return res.status(404).json({
        success: false,
        message: 'Pricing rule not found',
      });
    }
    
    // Check if user is rule owner or admin
    if (
      pricingRule.createdBy.toString() !== req.user.id &&
      req.user.role !== 'admin'
    ) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to delete this rule',
      });
    }
    
    await pricingRule.deleteOne();
    
    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Apply pricing rules to a product
// @route   POST /api/rules/apply
// @access  Private
exports.applyPricingRules = async (req, res) => {
  try {
    const { products } = req.body;
    
    if (!products || !Array.isArray(products)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of products',
      });
    }
    
    // Get all active pricing rules
    const pricingRules = await PricingRule.find({ active: true });
    
    // Apply rules to each product
    const processedProducts = products.map(product => {
      const quantity = product.quantity || 1;
      const sellingPrice = product.sellingPrice || 0;
      
      // Find applicable rules based on quantity
      const applicableRules = pricingRules.filter(
        rule => quantity >= rule.minQuantity
      );
      
      // Apply the rules to calculate discount
      let finalPrice = sellingPrice;
      let discount = 0;
      const appliedRuleIds = [];
      
      applicableRules.forEach(rule => {
        if (rule.discountType === 'percentage') {
          const discountAmount = (finalPrice * rule.discountValue) / 100;
          finalPrice -= discountAmount;
          discount += discountAmount;
        } else {
          // Fixed discount
          finalPrice -= rule.discountValue;
          discount += rule.discountValue;
        }
        
        // Track the applied rule
        appliedRuleIds.push(rule._id);
      });
      
      return {
        ...product,
        discount,
        finalPrice: finalPrice > 0 ? finalPrice : 0,
        appliedRules: appliedRuleIds,
      };
    });
    
    res.status(200).json({
      success: true,
      data: processedProducts,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}; 