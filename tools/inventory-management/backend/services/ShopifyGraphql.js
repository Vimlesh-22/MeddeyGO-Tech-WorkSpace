const Shopify = require('shopify-api-node');

/**
 * Shopify GraphQL Service
 * Provides helper functions for Shopify GraphQL API operations
 */

// Initialize Shopify clients for multiple stores
const shopifyStores = {};

// Setup for Store 1
if (process.env.SHOPIFY_SHOP_NAME_1 && process.env.SHOPIFY_ACCESS_TOKEN_1) {
  shopifyStores.store1 = new Shopify({
    shopName: process.env.SHOPIFY_SHOP_NAME_1,
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN_1,
  });
}

// Setup for Store 2
if (process.env.SHOPIFY_SHOP_NAME_2 && process.env.SHOPIFY_ACCESS_TOKEN_2) {
  shopifyStores.store2 = new Shopify({
    shopName: process.env.SHOPIFY_SHOP_NAME_2,
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN_2,
  });
}

// Setup for Store 3
if (process.env.SHOPIFY_SHOP_NAME_3 && process.env.SHOPIFY_ACCESS_TOKEN_3) {
  shopifyStores.store3 = new Shopify({
    shopName: process.env.SHOPIFY_SHOP_NAME_3,
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN_3,
  });
}

/**
 * Execute a GraphQL query on a specific Shopify store
 * @param {string} storeId - Store identifier (store1, store2, store3)
 * @param {string} query - GraphQL query string
 * @param {Object} variables - GraphQL variables payload
 * @returns {Promise<Object>} Query result
 */
const executeGraphQL = async (storeId, query, variables = {}) => {
  if (!shopifyStores[storeId]) {
    throw new Error(`Shopify store ${storeId} not configured`);
  }

  try {
    const result = await shopifyStores[storeId].graphql(query, variables);
    return result;
  } catch (error) {
    console.error(`GraphQL query error for ${storeId}:`, error);
    throw error;
  }
};

/**
 * Get order payment status using GraphQL
 * @param {string} storeId - Store identifier
 * @param {string} shopifyOrderId - Shopify order ID (numeric or GID format)
 * @returns {Promise<Object>} Payment status details
 */
const getOrderPaymentStatus = async (storeId, shopifyOrderId) => {
  // Convert to GID format if needed
  const orderId = shopifyOrderId.startsWith('gid://') 
    ? shopifyOrderId 
    : `gid://shopify/Order/${shopifyOrderId}`;

  const query = `
    query GetOrderPaymentStatus {
      order(id: "${orderId}") {
        id
        name
        fullyPaid
        displayFinancialStatus
        displayFulfillmentStatus
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalReceivedSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        paymentCollectionDetails {
          paymentStatus
          outstandingAmount {
            amount
            currencyCode
          }
        }
      }
    }
  `;

  try {
    const result = await executeGraphQL(storeId, query);
    return result.order;
  } catch (error) {
    console.error('Error fetching payment status:', error);
    throw error;
  }
};

/**
 * Get order fulfillment status using GraphQL
 * @param {string} storeId - Store identifier
 * @param {string} shopifyOrderId - Shopify order ID (numeric or GID format)
 * @returns {Promise<Object>} Fulfillment status details
 */
const getOrderFulfillmentStatus = async (storeId, shopifyOrderId) => {
  // Convert to GID format if needed
  const orderId = shopifyOrderId.startsWith('gid://') 
    ? shopifyOrderId 
    : `gid://shopify/Order/${shopifyOrderId}`;

  const query = `
    query GetOrderFulfillmentStatus {
      order(id: "${orderId}") {
        id
        name
        displayFulfillmentStatus
        fulfillmentOrders(first: 10) {
          nodes {
            id
            status
            requestStatus
            assignedLocation {
              name
            }
            lineItems(first: 10) {
              nodes {
                id
                remainingQuantity
                totalQuantity
              }
            }
          }
        }
      }
    }
  `;

  try {
    const result = await executeGraphQL(storeId, query);
    return result.order;
  } catch (error) {
    console.error('Error fetching fulfillment status:', error);
    throw error;
  }
};

/**
 * Get shop domain URL
 * @param {string} storeId - Store identifier
 * @returns {Promise<string>} Shop URL
 */
const getShopDomain = async (storeId) => {
  const query = `
    query GetShopDomain {
      shop {
        primaryDomain {
          url
        }
        name
      }
    }
  `;

  try {
    const result = await executeGraphQL(storeId, query);
    return result.shop.primaryDomain.url;
  } catch (error) {
    console.error('Error fetching shop domain:', error);
    throw error;
  }
};

/**
 * Get product handle from order line item
 * @param {string} storeId - Store identifier
 * @param {string} shopifyOrderId - Shopify order ID (numeric or GID format)
 * @param {number} lineItemIndex - Index of line item (default 0)
 * @returns {Promise<string>} Product handle
 */
const getProductHandle = async (storeId, shopifyOrderId, lineItemIndex = 0) => {
  // Convert to GID format if needed
  const orderId = shopifyOrderId.startsWith('gid://') 
    ? shopifyOrderId 
    : `gid://shopify/Order/${shopifyOrderId}`;

  const query = `
    query GetProductHandle {
      order(id: "${orderId}") {
        lineItems(first: 10) {
          edges {
            node {
              variant {
                product {
                  handle
                  id
                  title
                }
              }
              title
              sku
            }
          }
        }
      }
    }
  `;

  try {
    const result = await executeGraphQL(storeId, query);
    const lineItems = result.order.lineItems.edges;
    
    if (lineItems && lineItems.length > lineItemIndex) {
      const item = lineItems[lineItemIndex].node;
      return {
        handle: item.variant?.product?.handle,
        productId: item.variant?.product?.id,
        productTitle: item.variant?.product?.title,
        itemTitle: item.title,
        sku: item.sku
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching product handle:', error);
    throw error;
  }
};

/**
 * Generate product URL for an order
 * @param {string} storeId - Store identifier
 * @param {string} shopifyOrderId - Shopify order ID
 * @param {number} lineItemIndex - Index of line item (default 0)
 * @returns {Promise<Object>} Product URL and details
 */
const generateProductUrl = async (storeId, shopifyOrderId, lineItemIndex = 0) => {
  try {
    // Get shop domain
    const shopUrl = await getShopDomain(storeId);
    
    // Get product handle
    const productInfo = await getProductHandle(storeId, shopifyOrderId, lineItemIndex);
    
    if (!productInfo || !productInfo.handle) {
      throw new Error('Product handle not found');
    }
    
    // Build the product URL
    const productUrl = `${shopUrl}/products/${productInfo.handle}`;
    
    return {
      productUrl,
      handle: productInfo.handle,
      productId: productInfo.productId,
      productTitle: productInfo.productTitle,
      itemTitle: productInfo.itemTitle,
      sku: productInfo.sku,
      shopUrl
    };
  } catch (error) {
    console.error('Error generating product URL:', error);
    throw error;
  }
};

/**
 * Get all product URLs for an order (all line items)
 * @param {string} storeId - Store identifier
 * @param {string} shopifyOrderId - Shopify order ID
 * @returns {Promise<Array>} Array of product URLs and details
 */
const getAllProductUrls = async (storeId, shopifyOrderId) => {
  try {
    const shopUrl = await getShopDomain(storeId);
    
    // Convert to GID format if needed
    const orderId = shopifyOrderId.startsWith('gid://') 
      ? shopifyOrderId 
      : `gid://shopify/Order/${shopifyOrderId}`;

    const query = `
      query GetAllProductHandles {
        order(id: "${orderId}") {
          lineItems(first: 50) {
            edges {
              node {
                variant {
                  product {
                    handle
                    id
                    title
                  }
                }
                title
                sku
                quantity
              }
            }
          }
        }
      }
    `;

    const result = await executeGraphQL(storeId, query);
    const lineItems = result.order.lineItems.edges;
    
    return lineItems.map(edge => {
      const item = edge.node;
      const handle = item.variant?.product?.handle;
      
      return {
        productUrl: handle ? `${shopUrl}/products/${handle}` : null,
        handle: handle,
        productId: item.variant?.product?.id,
        productTitle: item.variant?.product?.title,
        itemTitle: item.title,
        sku: item.sku,
        quantity: item.quantity
      };
    });
  } catch (error) {
    console.error('Error generating all product URLs:', error);
    throw error;
  }
};

/**
 * Get comprehensive order details including payment, fulfillment, and product info
 * @param {string} storeId - Store identifier
 * @param {string} shopifyOrderId - Shopify order ID
 * @returns {Promise<Object>} Complete order details
 */
const getComprehensiveOrderDetails = async (storeId, shopifyOrderId) => {
  try {
    const [paymentStatus, fulfillmentStatus, productUrls] = await Promise.all([
      getOrderPaymentStatus(storeId, shopifyOrderId),
      getOrderFulfillmentStatus(storeId, shopifyOrderId),
      getAllProductUrls(storeId, shopifyOrderId)
    ]);

    return {
      payment: paymentStatus,
      fulfillment: fulfillmentStatus,
      products: productUrls
    };
  } catch (error) {
    console.error('Error fetching comprehensive order details:', error);
    throw error;
  }
};

module.exports = {
  executeGraphQL,
  getOrderPaymentStatus,
  getOrderFulfillmentStatus,
  getShopDomain,
  getProductHandle,
  generateProductUrl,
  getAllProductUrls,
  getComprehensiveOrderDetails,
  shopifyStores
};
