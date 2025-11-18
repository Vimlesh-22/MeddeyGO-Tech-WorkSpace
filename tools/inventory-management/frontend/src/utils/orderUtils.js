import axios from 'axios';
import { getApiBaseUrlDynamic } from '../config';

// Update order stage
export const updateOrderStage = async (orderId, newStage, comment = '') => {
  try {
    const apiBaseUrl = getApiBaseUrlDynamic();
    const url = `${apiBaseUrl}/orders/${orderId}/stage`;
    console.log(`[updateOrderStage] PUT ${url}`, { orderId, newStage, comment });
    
    const response = await axios.put(url, {
      stage: newStage,
      comment
    });
    
    console.log(`[updateOrderStage] Success for order ${orderId}:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`[updateOrderStage] ERROR for order ${orderId}:`, error);
    console.error(`[updateOrderStage] URL was: ${getApiBaseUrlDynamic()}/orders/${orderId}/stage`);
    console.error(`[updateOrderStage] Status:`, error.response?.status);
    console.error(`[updateOrderStage] Response:`, error.response?.data);
    throw error;
  }
};

// Mark item as completed
export const markItemAsCompleted = async (orderId, itemId) => {
  try {
    const apiBaseUrl = getApiBaseUrlDynamic();
    const response = await axios.put(`${apiBaseUrl}/orders/${orderId}/items/${itemId}/complete`);
    return response.data;
  } catch (error) {
    console.error('Error marking item as completed:', error);
    throw error;
  }
};

// Move all orders from one stage to another (V2 working implementation)
export const moveAllOrdersToStage = async (fromStage, toStage, comment = '') => {
  try {
    const apiBaseUrl = getApiBaseUrlDynamic();
    
    // First, get all orders with the 'fromStage' status
    console.log(`[moveAllOrdersToStage] Fetching orders with stage: ${fromStage}`);
    const response = await axios.get(`${apiBaseUrl}/orders`, {
      params: {
        stage: fromStage,
        limit: 10000, // Get all orders
        page: 1
      }
    });
    
    // Extract orders from response (handle different response formats)
    let orders = [];
    if (Array.isArray(response.data?.orders)) {
      orders = response.data.orders;
    } else if (Array.isArray(response.data)) {
      orders = response.data;
    } else if (response.data?.data && Array.isArray(response.data.data)) {
      orders = response.data.data;
    }
    
    console.log(`[moveAllOrdersToStage] Found ${orders.length} orders to move from ${fromStage} to ${toStage}`);
    
    if (orders.length === 0) {
      console.log(`[moveAllOrdersToStage] No orders found with stage ${fromStage}`);
      return [];
    }
    
    // Update each order to the new stage
    const updatePromises = orders.map(order => {
      const orderId = order._id || order.id;
      if (!orderId) {
        console.warn(`[moveAllOrdersToStage] Order missing ID:`, order);
        return Promise.resolve(null);
      }
      return updateOrderStage(orderId, toStage, comment).catch(error => {
        console.error(`[moveAllOrdersToStage] Failed to update order ${orderId}:`, error);
        throw error;
      });
    });
    
    const results = await Promise.allSettled(updatePromises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`[moveAllOrdersToStage] Completed: ${successful} succeeded, ${failed} failed`);
    
    if (failed > 0) {
      const errors = results.filter(r => r.status === 'rejected').map(r => r.reason);
      throw new Error(`Failed to move ${failed} orders. First error: ${errors[0]?.message || 'Unknown error'}`);
    }
    
    return results.filter(r => r.status === 'fulfilled').map(r => r.value);
  } catch (error) {
    console.error(`[moveAllOrdersToStage] Error moving orders from ${fromStage} to ${toStage}:`, error);
    throw error;
  }
};

