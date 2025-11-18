const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const { executeGraphQL, shopifyStores } = require('../services/ShopifyGraphql');
const { getPackSkuData } = require('../services/googleSheets');
const { getStoreDisplayName } = require('../utils/storeNames');

// @desc    Get product price by SKU from multiple sources with page context prioritization
// @route   GET /api/products/price/:sku
// @access  Public
// @query   ?page=inventory|orders|initial - Page context for prioritization
// @query   ?location=Okhla|Bahadurgarh - Location for sheet-based fetching
const getProductPriceBySku = asyncHandler(async (req, res) => {
  const { sku } = req.params;
  const { page, location } = req.query; // Page context: 'inventory', 'orders', 'initial', etc.
  
  console.log(`[getProductPriceBySku] Request received for SKU: ${sku}, page: ${page}, location: ${location}`);
  
  if (!sku) {
    res.status(400);
    throw new Error('SKU is required');
  }

  const storeId = process.env.SHOPIFY_DEFAULT_STORE || 'store1';
  const normalizedSku = (sku || '').trim().toUpperCase();

  try {
    // PRIORITY 1: Google Sheets (if on inventory/orders pages)
    // Sheets have the most up-to-date pricing for inventory management
    if (page === 'inventory' || page === 'orders' || page === 'initial' || page === 'processed') {
      try {
        const packSkuData = await getPackSkuData();
        const packSkuMap = packSkuData.packSkuMap || {};
        const packEntry = packSkuMap[normalizedSku];
        
        if (packEntry && packEntry.totalPrice) {
          console.log(`[getProductPriceBySku] Found price in Google Sheets for ${sku}: ${packEntry.totalPrice} (source: sheets)`);
          return res.json({
            success: true,
            price: packEntry.totalPrice,
            source: 'sheets',
            priceBeforeGst: packEntry.priceBeforeGst,
            gst: packEntry.gst
          });
        }
      } catch (sheetError) {
        console.error(`[getProductPriceBySku] Error fetching from sheets for ${sku}:`, sheetError.message);
        // Continue to other sources
      }
    }

    // PRIORITY 2: Local database
    const localProduct = await Product.findOne({ sku: { $regex: new RegExp(`^${sku}$`, 'i') } });
    
    if (localProduct && localProduct.costPrice) {
      console.log(`[getProductPriceBySku] Found price in local DB for ${sku}: ${localProduct.costPrice} (source: local)`);
      return res.json({
        success: true,
        price: localProduct.costPrice,
        source: 'local'
      });
    }
    
    // PRIORITY 3: Shopify (if not on inventory/orders pages, or as fallback)
    // If not found locally or no price, try to fetch from Shopify
    const query = `
      query GetProductBySku($query: String!) {
        products(first: 1, query: $query) {
          edges {
            node {
              id
              title
              variants(first: 1) {
                edges {
                  node {
                    price
                    sku
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    // Use configured default store (falls back to store1)
    const variables = { query: `sku:${sku}` };
    const result = await executeGraphQL(storeId, query, variables);
    
    if (result && result.products && result.products.edges.length > 0) {
      const product = result.products.edges[0].node;
      const variant = product.variants.edges[0]?.node;
      
      if (variant && variant.price) {
        console.log(`[getProductPriceBySku] Found price in Shopify for ${sku}: ${variant.price} (source: shopify)`);
        return res.json({
          success: true,
          price: parseFloat(variant.price),
          source: 'shopify',
          productTitle: product.title
        });
      }
    }
    
    // If we couldn't find the price, return 200 with null price (not 404)
    // This prevents frontend from treating it as an error
    res.status(200).json({
      success: true,
      price: null,
      message: 'Price not found for this SKU',
      source: 'none'
    });
  } catch (error) {
    console.error('Error fetching product price:', error.message || error);
    // Gracefully handle Shopify config errors
    // Return 200 with null price instead of 404 to prevent frontend errors
    if (error.message && error.message.includes(`Shopify store ${storeId} not configured`)) {
      return res.status(200).json({
        success: true,
        price: null,
        message: 'Price not available (Shopify not configured)',
        source: 'none'
      });
    }
    // Return 200 with null price for any error to prevent order skipping
    res.status(200).json({
      success: true,
      price: null,
      message: 'Failed to fetch product price',
      error: error.message,
      source: 'none'
    });
  }
});

// @desc    Get product by ID
// @route   GET /api/products/:id
// @access  Public
const getProductById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const product = await Product.findById(id).populate('vendor');
  
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  
  res.json(product);
});

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Public
const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  
  const product = await Product.findById(id);
  
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  
  // Allowed fields for update
  const allowedFields = ['name', 'sku', 'vendor', 'costPrice', 'gst'];
  
  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      product[field] = updateData[field];
    }
  }
  
  product.updatedAt = new Date();
  
  await product.save();
  
  // Return populated product with vendor details
  const updatedProduct = await Product.findById(id).populate('vendor');
  res.json(updatedProduct);
});

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Public
const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const product = await Product.findById(id);
  
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  
  await Product.deleteOne({ _id: id });
  
  res.json({ 
    message: 'Product deleted successfully',
    id: id
  });
});

// @desc    Search products across all configured Shopify stores
// @route   GET /api/products/shopify-search-all
// @access  Public
// @query   ?search=sku_or_name - Search term (SKU or product name)
const searchAllShopifyStores = asyncHandler(async (req, res) => {
  const { search } = req.query;
  
  if (!search || search.trim().length === 0) {
    res.status(400);
    throw new Error('Search query is required');
  }

  const searchTerm = search.trim();
  const results = [];
  const errors = [];

  // Get all configured store IDs
  const storeIds = Object.keys(shopifyStores || {});
  
  if (storeIds.length === 0) {
    return res.json({
      success: true,
      results: [],
      message: 'No Shopify stores configured'
    });
  }

  // Search query for Shopify GraphQL
  // Search by SKU or product title
  const query = `
    query SearchProducts($query: String!) {
      products(first: 50, query: $query) {
        edges {
          node {
            id
            title
            handle
            variants(first: 10) {
              edges {
                node {
                  id
                  sku
                  title
                  price
                  availableForSale
                }
              }
            }
          }
        }
      }
    }
  `;

  // Search across all stores
  for (const storeId of storeIds) {
    try {
      // Try SKU search first
      let variables = { query: `sku:${searchTerm}` };
      let result = await executeGraphQL(storeId, query, variables);
      
      // If no results, try product title search
      if (!result?.products?.edges || result.products.edges.length === 0) {
        variables = { query: `title:*${searchTerm}*` };
        result = await executeGraphQL(storeId, query, variables);
      }

      if (result?.products?.edges && result.products.edges.length > 0) {
        // Process each product
        for (const edge of result.products.edges) {
          const product = edge.node;
          
          // Get all variants with their SKUs
          for (const variantEdge of product.variants.edges) {
            const variant = variantEdge.node;
            
            // Only include if SKU matches or product title matches
            const skuMatch = variant.sku && variant.sku.toUpperCase().includes(searchTerm.toUpperCase());
            const titleMatch = product.title && product.title.toUpperCase().includes(searchTerm.toUpperCase());
            
            if (skuMatch || titleMatch) {
              results.push({
                storeId: storeId,
                storeName: getStoreDisplayName(storeId),
                productId: product.id,
                productTitle: product.title,
                productHandle: product.handle,
                sku: variant.sku || '',
                variantTitle: variant.title,
                price: variant.price ? parseFloat(variant.price) : null,
                availableForSale: variant.availableForSale,
                searchMatch: skuMatch ? 'sku' : 'title'
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error searching store ${storeId}:`, error.message);
      errors.push({
        storeId: storeId,
        error: error.message
      });
    }
  }

  // Remove duplicates based on storeId + productId + sku combination
  const uniqueResults = [];
  const seen = new Set();
  
  for (const result of results) {
    const key = `${result.storeId}-${result.productId}-${result.sku}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueResults.push(result);
    }
  }

  res.json({
    success: true,
    results: uniqueResults,
    totalResults: uniqueResults.length,
    errors: errors.length > 0 ? errors : undefined,
    searchTerm: searchTerm
  });
});

module.exports = {
  getProductPriceBySku,
  getProductById,
  updateProduct,
  deleteProduct,
  searchAllShopifyStores
};
