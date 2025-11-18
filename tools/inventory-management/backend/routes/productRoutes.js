const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const { Parser } = require('json2csv');
const { getProductPriceBySku, getProductById, updateProduct, deleteProduct, searchAllShopifyStores } = require('../controllers/productController');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// @desc    Get product price by SKU
// @route   GET /api/products/price/:sku
// IMPORTANT: This must come BEFORE the generic /:id route
router.get('/price/:sku', getProductPriceBySku);

// @desc    Search products across all Shopify stores
// @route   GET /api/products/shopify-search-all
// IMPORTANT: This must come BEFORE the generic /:id route
router.get('/shopify-search-all', searchAllShopifyStores);

// @desc    Get all products with search functionality
// @route   GET /api/products
router.get('/', asyncHandler(async (req, res) => {
  const { search, limit = 1000 } = req.query; // Increased default limit to 1000
  
  console.log(`[GET /products] Fetching products - search: "${search || 'none'}", limit: ${limit}`);
  
  let query = {};
  
  // Add search functionality
  if (search && search.trim()) {
    query = {
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } }
      ]
    };
  }
  
  // Limit to max 2000 to prevent performance issues
  const safeLimit = Math.min(Number(limit), 2000);
  
  const products = await Product.find(query)
    .populate('vendor')
    .sort({ name: 1 }) // Sort alphabetically by name
    .limit(safeLimit);
  
  console.log(`[GET /products] Returning ${products.length} products`);
  
  res.json(products);
}));

// @desc    Create a product
// @route   POST /api/products
router.post('/', asyncHandler(async (req, res) => {
  const product = await Product.create(req.body);
  res.status(201).json(product);
}));

// @desc    Import products from CSV
// @route   POST /api/products/import
router.post('/import', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('No file uploaded');
  }
  
  const results = [];
  const errors = [];
  const success = [];
  
  // Stream the file from memory
  const fileBuffer = req.file.buffer;
  const fileStream = require('stream').Readable.from(fileBuffer.toString());
  
  // Process CSV
  fileStream
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      try {
        // Process each row
        for (const row of results) {
          try {
            // Validate required fields
            if (!row.SKU || !row['Product Name']) {
              errors.push({ sku: row.SKU || 'Unknown', error: 'Missing required fields' });
              continue;
            }
            
            // Parse price safely
            const costPrice = row.Price ? parseFloat(row.Price) : 0;
            if (isNaN(costPrice)) {
              errors.push({ sku: row.SKU, error: 'Invalid price format' });
              continue;
            }
            
            // Set GST to 0 if not provided
            const gst = 0;
            
            // Check if product already exists
            const existingProduct = await Product.findOne({ sku: row.SKU });
            
            if (existingProduct) {
              // Update existing product
              existingProduct.name = row['Product Name'];
              existingProduct.costPrice = costPrice;
              existingProduct.gst = gst;
              existingProduct.notes = row.Notes || '';
              
              await existingProduct.save();
              success.push({ sku: row.SKU, action: 'updated' });
            } else {
              // Create new product
              const newProduct = await Product.create({
                sku: row.SKU,
                name: row['Product Name'],
                costPrice: costPrice,
                gst: gst,
                notes: row.Notes || ''
              });
              
              success.push({ sku: row.SKU, action: 'created' });
            }
            
            // If vendor name is provided, try to map it
            if (row.Vendor && row.Vendor.trim() !== '') {
              try {
                // Clean vendor name from any quotes or extra spaces
                const vendorName = row.Vendor.trim().replace(/^"(.*)"$/, '$1');
                
                // Search for vendor case insensitive
                let vendor = await Vendor.findOne({ 
                  name: { $regex: new RegExp('^' + vendorName + '$', 'i') } 
                });
                
                if (vendor) {
                  // Update product with vendor ID
                  await Product.findOneAndUpdate(
                    { sku: row.SKU },
                    { vendor: vendor._id }
                  );
                  
                  // Add SKU mapping to vendor if it doesn't exist
                  const skuExists = vendor.skuMappings.some(mapping => mapping.sku === row.SKU);
                  if (!skuExists) {
                    vendor.skuMappings.push({ sku: row.SKU });
                    await vendor.save();
                  }
                  
                  console.log(`Mapped product ${row.SKU} to existing vendor ${vendor.name}`);
                } else {
                  // Create new vendor
                  const newVendor = await Vendor.create({
                    name: vendorName,
                    skuMappings: [{ sku: row.SKU }]
                  });
                  
                  // Update product with the new vendor
                  await Product.findOneAndUpdate(
                    { sku: row.SKU },
                    { vendor: newVendor._id }
                  );
                  
                  console.log(`Created new vendor ${newVendor.name} for product ${row.SKU}`);
                }
              } catch (vendorError) {
                console.error(`Error handling vendor for product ${row.SKU}:`, vendorError);
                errors.push({ sku: row.SKU, error: `Vendor mapping error: ${vendorError.message}` });
              }
            }
          } catch (error) {
            errors.push({ sku: row.SKU || 'Unknown', error: error.message });
          }
        }
        
        res.json({ success, errors });
      } catch (error) {
        console.error('Error processing CSV:', error);
        res.status(500);
        throw new Error(`Failed to process CSV: ${error.message}`);
      }
    });
}));

// @desc    Generate product template CSV
// @route   GET /api/products/template
router.get('/template', asyncHandler(async (req, res) => {
  const fields = ['SKU', 'Product Name', 'Vendor', 'Price', 'Notes'];
  const parser = new Parser({ fields });
  const csv = parser.parse([]);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=product_import_template.csv');
  res.send(csv);
}));

// @desc    Bulk map products to vendor
// @route   POST /api/products/bulk-map
router.post('/bulk-map', asyncHandler(async (req, res) => {
  const { vendorId, skus } = req.body;

  // Verify vendor exists
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) {
    res.status(404);
    throw new Error('Vendor not found');
  }

  // Update all products with the specified SKUs
  await Product.updateMany(
    { sku: { $in: skus } },
    { vendor: vendorId }
  );

  // Add SKU mappings to vendor
  for (const sku of skus) {
    if (!vendor.skuMappings.find(mapping => mapping.sku === sku)) {
      vendor.skuMappings.push({ sku });
    }
  }
  await vendor.save();

  res.json({ message: `Successfully mapped ${skus.length} products to vendor` });
}));

// REMOVED: Duplicate route definition - already defined above at line 19

// @desc    Search for products on multiple sites
// @route   GET /api/products/multi-site-search/:query
router.get('/multi-site-search/:query', asyncHandler(async (req, res) => {
  const { query } = req.params;
  
  if (!query || query.trim().length === 0) {
    res.status(400);
    throw new Error('Search query is required');
  }

  const sites = [
    { name: 'meddeygo.com', url: 'https://meddeygo.com/search/' },
    { name: 'meddey.com', url: 'https://meddey.com/search/' },
    { name: 'medansh.in', url: 'https://medansh.in/search/' }
  ];

  const results = sites.map(site => ({
    site: site.name,
    url: `${site.url}${encodeURIComponent(query)}`,
    searchTerm: query
  }));

  res.json({ 
    query,
    results,
    message: 'Product search URLs generated for all sites'
  });
}));

// Generic CRUD routes - must be last to avoid conflicts with specific routes above
// @desc    Get product by ID
// @route   GET /api/products/:id
router.get('/:id', getProductById);

// @desc    Update product
// @route   PUT /api/products/:id
router.put('/:id', updateProduct);

// @desc    Delete product
// @route   DELETE /api/products/:id
router.delete('/:id', deleteProduct);

module.exports = router;
