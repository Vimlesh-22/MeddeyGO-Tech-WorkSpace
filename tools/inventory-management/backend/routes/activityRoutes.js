const express = require('express');
const router = express.Router();
const ActivityService = require('../services/activityService');

// @route   GET /api/activities/recent
// @desc    Get recent activities for sidebar/dashboard
// @access  Public
router.get('/recent', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const activities = await ActivityService.getRecentActivities(parseInt(limit));
    
    res.json({
      success: true,
      count: activities.length,
      activities
    });
  } catch (error) {
    console.error('Error fetching recent activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent activities',
      error: error.message
    });
  }
});

// @route   GET /api/activities/order/:orderId
// @desc    Get activity history for a specific order
// @access  Public
router.get('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { limit = 20 } = req.query;
    
    const activities = await ActivityService.getOrderHistory(orderId, parseInt(limit));
    
    res.json({
      success: true,
      orderId,
      count: activities.length,
      activities
    });
  } catch (error) {
    console.error('Error fetching order history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order history',
      error: error.message
    });
  }
});

// @route   GET /api/activities/vendor/:vendorId
// @desc    Get activity history for a specific vendor
// @access  Public
router.get('/vendor/:vendorId', async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { limit = 20 } = req.query;
    
    const activities = await ActivityService.getVendorHistory(vendorId, parseInt(limit));
    
    res.json({
      success: true,
      vendorId,
      count: activities.length,
      activities
    });
  } catch (error) {
    console.error('Error fetching vendor history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor history',
      error: error.message
    });
  }
});

// @route   GET /api/activities/sku/:sku
// @desc    Get activity history for a specific SKU
// @access  Public
router.get('/sku/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const { limit = 20 } = req.query;
    
    const activities = await ActivityService.getSkuHistory(sku, parseInt(limit));
    
    res.json({
      success: true,
      sku,
      count: activities.length,
      activities
    });
  } catch (error) {
    console.error('Error fetching SKU history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SKU history',
      error: error.message
    });
  }
});

// @route   GET /api/activities/summary
// @desc    Get activity summary for dashboard
// @access  Public
router.get('/summary', async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const summary = await ActivityService.getActivitySummary(parseInt(hours));
    
    res.json({
      success: true,
      summary
    });
  } catch (error) {
    console.error('Error generating activity summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate activity summary',
      error: error.message
    });
  }
});

// @route   POST /api/activities/cleanup
// @desc    Clean up old activities (admin function)
// @access  Public
router.post('/cleanup', async (req, res) => {
  try {
    const { daysToKeep = 90 } = req.body;
    const deletedCount = await ActivityService.cleanupOldActivities(parseInt(daysToKeep));
    
    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} old activities`,
      deletedCount
    });
  } catch (error) {
    console.error('Error cleaning up activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clean up old activities',
      error: error.message
    });
  }
});

module.exports = router;