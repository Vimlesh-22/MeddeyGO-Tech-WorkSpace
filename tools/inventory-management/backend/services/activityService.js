const Activity = require('../models/Activity');

class ActivityService {
  /**
   * Get recent activities for dashboard/sidebar
   * @param {number} limit - Maximum number of activities to return
   * @returns {Promise<Array>} - List of activities
   */
  static async getRecentActivities(limit = 50) {
    return Activity.getRecentActivity(parseInt(limit));
  }

  /**
   * Get activity history for a specific order
   * @param {string} orderId - Order ID
   * @param {number} limit - Maximum number of activities to return
   * @returns {Promise<Array>} - List of order activities
   */
  static async getOrderHistory(orderId, limit = 20) {
    return Activity.getOrderHistory(orderId, parseInt(limit));
  }

  /**
   * Get activity history for a specific vendor
   * @param {string} vendorId - Vendor ID
   * @param {number} limit - Maximum number of activities to return
   * @returns {Promise<Array>} - List of vendor activities
   */
  static async getVendorHistory(vendorId, limit = 20) {
    return Activity.getVendorActivity(vendorId, parseInt(limit));
  }

  /**
   * Get activity history for a specific SKU
   * @param {string} sku - Product SKU
   * @param {number} limit - Maximum number of activities to return
   * @returns {Promise<Array>} - List of SKU activities
   */
  static async getSkuHistory(sku, limit = 20) {
    return Activity.find({ 'metadata.sku': sku })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .populate('orderId', 'orderName shopifyOrderName customerName')
      .populate('vendorId', 'name')
      .populate('productId', 'name sku');
  }

  /**
   * Get activity summary for dashboard
   * @returns {Promise<Object>} - Activity summary statistics
   */
  static async getActivitySummary() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const [
      todayCount,
      yesterdayCount,
      weekCount,
      totalCount,
      typeBreakdown,
      recentActivities
    ] = await Promise.all([
      Activity.countDocuments({ timestamp: { $gte: today } }),
      Activity.countDocuments({ 
        timestamp: { $gte: yesterday, $lt: today } 
      }),
      Activity.countDocuments({ timestamp: { $gte: lastWeek } }),
      Activity.estimatedDocumentCount(),
      Activity.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Activity.getRecentActivity(5)
    ]);

    return {
      counts: {
        today: todayCount,
        yesterday: yesterdayCount,
        week: weekCount,
        total: totalCount
      },
      typeBreakdown: typeBreakdown.map(item => ({
        type: item._id,
        count: item.count
      })),
      recentActivities
    };
  }

  /**
   * Log an activity to the database
   */
  static async logActivity(activityData) {
    try {
      const activity = new Activity(activityData);
      await activity.save();
      return activity;
    } catch (error) {
      console.error('Error logging activity:', error);
      // Don't throw error to prevent disrupting main operations
      return null;
    }
  }

  /**
   * Log order stage change
   */
  static async logStageChange(orderId, fromStage, toStage, userId = 'system') {
    return await this.logActivity({
      type: 'stage_changed',
      orderId,
      title: `Order stage changed from ${fromStage} to ${toStage}`,
      description: `Order moved from ${fromStage} stage to ${toStage} stage`,
      changes: {
        before: { stage: fromStage },
        after: { stage: toStage }
      },
      metadata: {
        stage: toStage
      },
      userId,
      severity: toStage === 'Completed' ? 'high' : 'medium'
    });
  }

  /**
   * Log vendor assignment
   */
  static async logVendorAssignment(orderId, itemId, vendorId, vendorName, sku, userId = 'system') {
    return await this.logActivity({
      type: 'vendor_assigned',
      orderId,
      vendorId,
      title: `Vendor "${vendorName}" assigned to SKU ${sku}`,
      description: `Vendor ${vendorName} has been assigned to item ${sku} in this order`,
      metadata: {
        sku,
        itemId: itemId.toString()
      },
      userId,
      severity: 'medium'
    });
  }

  /**
   * Log pack calculation update
   */
  static async logPackCalculation(orderId, sku, packQuantity, finalQuantity, userId = 'system') {
    return await this.logActivity({
      type: 'pack_calculation_updated',
      orderId,
      title: `Pack calculation updated for ${sku}`,
      description: `Pack quantity: ${packQuantity}, Final calculated quantity: ${finalQuantity}`,
      metadata: {
        sku,
        packQuantity,
        finalQuantity
      },
      userId,
      severity: 'low'
    });
  }

  /**
   * Log export generation
   */
  static async logExport(exportType, recordCount, filters, userId = 'system') {
    return await this.logActivity({
      type: 'export_generated',
      title: `${exportType} export generated`,
      description: `Generated ${exportType} export with ${recordCount} records`,
      metadata: {
        exportType,
        recordCount,
        filters: JSON.stringify(filters)
      },
      userId,
      severity: 'low'
    });
  }

  /**
   * Log Shopify sync
   */
  static async logShopifySync(storeId, orderCount, userId = 'system') {
    return await this.logActivity({
      type: 'shopify_sync',
      title: `Shopify orders synchronized from ${storeId}`,
      description: `Fetched and synchronized ${orderCount} orders from Shopify store ${storeId}`,
      metadata: {
        storeId,
        orderCount
      },
      userId,
      severity: 'medium',
      isSystemGenerated: true
    });
  }

  /**
   * Log inventory update
   */
  static async logInventoryUpdate(sku, location, field, oldValue, newValue, userId = 'system') {
    return await this.logActivity({
      type: 'inventory_updated',
      title: `Inventory updated for ${sku} at ${location}`,
      description: `${field} changed from ${oldValue} to ${newValue}`,
      changes: {
        before: { [field]: oldValue },
        after: { [field]: newValue }
      },
      metadata: {
        sku,
        location,
        field
      },
      userId,
      severity: 'medium'
    });
  }

  /**
   * Get recent activities for dashboard/sidebar
   */
  static async getRecentActivities(limit = 50) {
    try {
      return await Activity.getRecentActivity(limit);
    } catch (error) {
      console.error('Error fetching recent activities:', error);
      return [];
    }
  }

  /**
   * Get order activity history
   */
  static async getOrderHistory(orderId, limit = 20) {
    try {
      return await Activity.getOrderHistory(orderId, limit);
    } catch (error) {
      console.error('Error fetching order history:', error);
      return [];
    }
  }

  /**
   * Get vendor activity history
   */
  static async getVendorHistory(vendorId, limit = 20) {
    try {
      return await Activity.getVendorActivity(vendorId, limit);
    } catch (error) {
      console.error('Error fetching vendor history:', error);
      return [];
    }
  }

  /**
   * Get SKU activity history
   */
  static async getSkuHistory(sku, limit = 20) {
    try {
      return await Activity.getSkuActivity(sku, limit);
    } catch (error) {
      console.error('Error fetching SKU history:', error);
      return [];
    }
  }

  /**
   * Get activity summary for dashboard
   */
  static async getActivitySummary(hours = 24) {
    try {
      const since = new Date(Date.now() - (hours * 60 * 60 * 1000));
      
      const activities = await Activity.find({ 
        timestamp: { $gte: since } 
      });

      // Group by type
      const summary = {};
      activities.forEach(activity => {
        if (!summary[activity.type]) {
          summary[activity.type] = 0;
        }
        summary[activity.type]++;
      });

      return {
        total: activities.length,
        byType: summary,
        timeRange: `${hours} hours`
      };
    } catch (error) {
      console.error('Error generating activity summary:', error);
      return { total: 0, byType: {}, timeRange: `${hours} hours` };
    }
  }

  /**
   * Clean up old activities (for maintenance)
   */
  static async cleanupOldActivities(daysToKeep = 90) {
    try {
      const cutoffDate = new Date(Date.now() - (daysToKeep * 24 * 60 * 60 * 1000));
      
      const result = await Activity.deleteMany({
        timestamp: { $lt: cutoffDate }
      });

      console.log(`Cleaned up ${result.deletedCount} old activities`);
      return result.deletedCount;
    } catch (error) {
      console.error('Error cleaning up old activities:', error);
      return 0;
    }
  }
}

module.exports = ActivityService;