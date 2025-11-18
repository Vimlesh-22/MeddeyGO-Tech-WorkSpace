const Product = require('../models/Product');
const fs = require('fs');
const csv = require('csv-parser');
const multer = require('multer');
const path = require('path');

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

// Configure file filter
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'text/csv') {
    cb(null, true);
  } else {
    cb(new Error('Only CSV files are allowed'), false);
  }
};

// Initialize upload
exports.upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 1024 * 1024 * 5 }, // 5MB max
});

// @desc    Import products from CSV
// @route   POST /api/products/import
// @access  Private
exports.importProductsFromCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a CSV file',
      });
    }
    
    const products = [];
    const skippedProducts = [];
    const importedProducts = [];
    let totalCount = 0;
    
    // Parse CSV file
    const parseCSV = () => {
      return new Promise((resolve, reject) => {
        fs.createReadStream(req.file.path)
          .pipe(csv())
          .on('data', (data) => {
            totalCount++;
            // Transform the CSV data into product objects
            const product = {
              sku: data.SKU,
              name: data.ProductName || data['Product Name'],
              imageUrl: data.ImageURL || data['Image URL'],
              costPrice: parseFloat(data.CostPrice || data['Cost Price']),
              sellingPrice: parseFloat(data.SellingPrice || data['Selling Price']),
              gstPercentage: parseFloat(data.GST || data['GST%']),
              productUrl: data.ProductURL || data['Product URL'],
            };
            
            products.push(product);
          })
          .on('end', resolve)
          .on('error', reject);
      });
    };
    
    await parseCSV();
    
    // Import products to DB, handling duplicates
    for (const product of products) {
      try {
        // Check if product with this SKU already exists
        const existingProduct = await Product.findOne({ sku: product.sku });
        
        if (existingProduct) {
          // Update existing product
          existingProduct.name = product.name;
          existingProduct.imageUrl = product.imageUrl;
          existingProduct.costPrice = product.costPrice;
          existingProduct.sellingPrice = product.sellingPrice;
          existingProduct.gstPercentage = product.gstPercentage;
          existingProduct.productUrl = product.productUrl;
          existingProduct.updatedAt = Date.now();
          
          await existingProduct.save();
          skippedProducts.push({
            sku: product.sku,
            reason: 'Updated existing product',
          });
        } else {
          // Create new product
          const newProduct = await Product.create(product);
          importedProducts.push(newProduct);
        }
      } catch (error) {
        skippedProducts.push({
          sku: product.sku,
          reason: error.message,
        });
      }
    }
    
    // Delete the file after processing
    fs.unlinkSync(req.file.path);
    
    res.status(200).json({
      success: true,
      message: `Processed ${totalCount} products. Imported ${importedProducts.length} new products, updated ${skippedProducts.length} existing products.`,
      data: {
        importedCount: importedProducts.length,
        updatedCount: skippedProducts.length,
        totalCount
      },
    });
  } catch (error) {
    // Delete the file if there was an error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all products
// @route   GET /api/products
// @access  Private
exports.getProducts = async (req, res) => {
  try {
    let query = {};
    
    // Search functionality
    if (req.query.search) {
      query = {
        $or: [
          { sku: { $regex: req.query.search, $options: 'i' } },
          { name: { $regex: req.query.search, $options: 'i' } },
        ],
      };
    }
    
    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    
    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip(startIndex)
      .limit(limit);
    
    res.status(200).json({
      success: true,
      count: products.length,
      total,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
      },
      data: products,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Private
exports.getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }
    
    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Create a product
// @route   POST /api/products
// @access  Private
exports.createProduct = async (req, res) => {
  try {
    const product = await Product.create(req.body);
    
    res.status(201).json({
      success: true,
      data: product,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private
exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, 
      {
        ...req.body,
        updatedAt: Date.now()
      }, 
      { 
        new: true,
        runValidators: true,
      }
    );
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }
    
    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }
    
    await product.deleteOne();
    
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