const mongoose = require('mongoose');
const Quotation = require('../models/Quotation');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const multer = require('multer');
const puppeteer = require('puppeteer');
const generateHTML = require('../templates/quotationTemplate');
const generateHTML2 = require('../templates/quotationTemplate2');

const isOfflineMode = () =>
  process.env.QUOTE_APP_OFFLINE === 'true' ||
  process.env.QUOTE_APP_DISABLE_MONGO === 'true';

const offlineQuotation = (overrides = {}) => ({
  _id: overrides._id || 'offline-quotation',
  quotationNumber: overrides.quotationNumber || 'OFFLINE-001',
  clientName: overrides.clientName || 'Offline Client',
  clientEmail: overrides.clientEmail || 'client@example.com',
  stage: overrides.stage || 'draft',
  relationshipManager: overrides.relationshipManager || { _id: 'offline-user', name: 'Offline User', email: 'offline@quote-app.local' },
  createdBy: overrides.createdBy || { _id: 'offline-user', name: 'Offline User', email: 'offline@quote-app.local' },
  assignedUser: overrides.assignedUser || null,
  products: overrides.products || [],
  grandTotal: overrides.grandTotal || 0,
  createdAt: overrides.createdAt || new Date().toISOString(),
});

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

// @desc    Create a quotation
// @route   POST /api/quotations
// @access  Private
exports.createQuotation = async (req, res) => {
  try {
    if (isOfflineMode()) {
      const mock = offlineQuotation({
        _id: `offline-${Date.now()}`,
        ...req.body,
        createdBy: { _id: req.user?.id || 'offline-user', name: 'Offline User', email: 'offline@quote-app.local' },
      });
      return res.status(201).json({ success: true, data: mock });
    }

    req.body.createdBy = req.user.id;
    const quotation = await Quotation.create(req.body);
    res.status(201).json({ success: true, data: quotation });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all quotations
// @route   GET /api/quotations
// @access  Private
exports.getQuotations = async (req, res) => {
  try {
    if (isOfflineMode()) {
      const mock = [offlineQuotation()];
      return res.status(200).json({ success: true, count: mock.length, data: mock });
    }

    const { search } = req.query;
    console.log('=== GET QUOTATIONS ===');
    console.log('User:', req.user.name, 'Role:', req.user.role, 'ID:', req.user._id || req.user.id);
    
    const filter = {};
    if (req.user.role !== 'admin') {
      console.log('Non-admin user - filtering by relationshipManager:', req.user.id);
      filter.relationshipManager = req.user.id;
    } else {
      console.log('Admin user - fetching ALL quotations (no filter)');
    }
    
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { quotationNumber: searchRegex },
        { clientName: searchRegex }
      ];
    }

    console.log('Filter:', JSON.stringify(filter));
    const quotations = await Quotation.find(filter)
      .populate('relationshipManager', 'name email')
      .populate('createdBy', 'name email')
      .populate('assignedUser', 'name email')
      .sort({ createdAt: -1 });
    
    console.log('Found quotations:', quotations.length);
    res.status(200).json({ success: true, count: quotations.length, data: quotations });
  } catch (error) {
    console.error('Error in getQuotations:', error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single quotation
// @route   GET /api/quotations/:id
// @access  Private
exports.getQuotation = async (req, res) => {
  try {
    if (isOfflineMode()) {
      return res.status(200).json({ success: true, data: offlineQuotation({ _id: req.params.id }) });
    }

    const quotation = await Quotation.findById(req.params.id)
      .populate('relationshipManager', 'name email')
      .populate('createdBy', 'name email')
      .populate('assignedUser', 'name email');
    
    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found',
      });
    }
    
    if (
      req.user.role !== 'admin' &&
      quotation.relationshipManager._id.toString() !== req.user.id &&
      quotation.createdBy._id.toString() !== req.user.id
    ) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this quotation',
      });
    }
    
    res.status(200).json({
      success: true,
      data: quotation,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update quotation
// @route   PUT /api/quotations/:id
// @access  Private
exports.updateQuotation = async (req, res) => {
  try {
    if (isOfflineMode()) {
      return res.status(200).json({ success: true, data: offlineQuotation({ ...req.body, _id: req.params.id }) });
    }

    let quotation = await Quotation.findById(req.params.id);
    
    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found',
      });
    }
    
    // Check if user is authorized
    if (
      req.user.role !== 'admin' &&
      quotation.relationshipManager.toString() !== req.user.id &&
      quotation.createdBy.toString() !== req.user.id
    ) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to update this quotation',
      });
    }
    
    // Update the updatedAt field
    req.body.updatedAt = Date.now();
    
    quotation = await Quotation.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate('relationshipManager', 'name email')
      .populate('createdBy', 'name email');
    
    res.status(200).json({
      success: true,
      data: quotation,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete quotation
// @route   DELETE /api/quotations/:id
// @access  Private
exports.deleteQuotation = async (req, res) => {
  try {
    if (isOfflineMode()) {
      return res.status(200).json({
        success: true,
        data: {},
      });
    }

    const quotation = await Quotation.findById(req.params.id);
    
    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found',
      });
    }
    
    // Check if user is authorized
    if (
      req.user.role !== 'admin' &&
      quotation.relationshipManager.toString() !== req.user.id &&
      quotation.createdBy.toString() !== req.user.id
    ) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to delete this quotation',
      });
    }
    
    await quotation.deleteOne();
    
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

// @desc    Upload CSV and import products
// @route   POST /api/quotations/import
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
    
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (data) => {
        // Transform the CSV data into product objects
        const product = {
          sku: data.SKU,
          name: data.ProductName || data['Product Name'],
          imageUrl: data.ImageURL || data['Image URL'],
          costPrice: parseFloat(data.CostPrice || data['Cost Price']),
          sellingPrice: parseFloat(data.SellingPrice || data['Selling Price']),
          gstPercentage: parseFloat(data.GST || data['GST%']),
          productUrl: data.ProductURL || data['Product URL'],
          quantity: 1,
          finalPrice: parseFloat(data.SellingPrice || data['Selling Price']),
        };
        
        products.push(product);
      })
      .on('end', () => {
        // Delete the file after processing
        fs.unlinkSync(req.file.path);
        
        res.status(200).json({
          success: true,
          count: products.length,
          data: products,
        });
      })
      .on('error', (error) => {
        res.status(400).json({
          success: false,
          message: error.message,
        });
      });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Generate PDF from quotation
// @route   GET /api/quotations/:id/pdf
// @access  Private
exports.generatePDF = async (req, res) => {
  let browser = null;
  let page = null;
  
  try {
    const quotation = await Quotation.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('assignedUser', 'name email');
    
    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found',
      });
    }
    
    // Check if user is authorized
    if (
      req.user.role !== 'admin' &&
      quotation.createdBy._id.toString() !== req.user.id
    ) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this quotation',
      });
    }

    // Read and convert logo to base64
    let logoBase64 = null;
    let footerABase64 = null;
    let footerBBase64 = null;
    
    try {
      const logoPath = path.join(__dirname, '../uploads/company_logo.png');
      const footerAPath = path.join(__dirname, '../uploads/footer_a.png');
      const footerBPath = path.join(__dirname, '../uploads/footer_b.png');
      
      if (fs.existsSync(logoPath)) {
        logoBase64 = fs.readFileSync(logoPath).toString('base64');
      }
      if (fs.existsSync(footerAPath)) {
        footerABase64 = fs.readFileSync(footerAPath).toString('base64');
      }
      if (fs.existsSync(footerBPath)) {
        footerBBase64 = fs.readFileSync(footerBPath).toString('base64');
      }
    } catch (err) {
      console.warn('Error reading images:', err.message);
    }

    // Get user's default template preference
    const User = require('../models/User');
    const user = await User.findById(req.user.id);
    const templateType = req.query.template || user?.defaultTemplate || 'template1';
    
    // Generate HTML content based on template selection
    let html;
    if (templateType === 'template2') {
      html = generateHTML2(quotation, logoBase64, footerABase64, footerBBase64);
    } else {
      html = generateHTML(quotation, logoBase64, footerABase64, footerBBase64);
    }

    // Launch puppeteer with specific configuration
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-zygote',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({
      width: 1200,
      height: 800
    });
    
    // Add error handling for page crashes
    page.on('error', (err) => {
      console.error('Page error:', err);
    });
    
    page.on('pageerror', (err) => {
      console.error('Page error:', err);
    });
    

    
    // Set content with longer timeout
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });
    
    // Wait for the page to be fully loaded
    try {
      await page.waitForFunction(() => {
        return document.readyState === 'complete';
      }, { timeout: 30000 });
    } catch (error) {
      console.warn('Page load wait failed, continuing:', error.message);
    }
    
    // Simple wait to ensure content is rendered
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Simple wait for images to load with fallback
    try {
      await page.evaluate(() => {
        return new Promise((resolve) => {
          const images = document.querySelectorAll('img');
          if (images.length === 0) {
            resolve();
            return;
          }
          
          let completed = 0;
          const total = images.length;
          
          const checkComplete = () => {
            completed++;
            if (completed >= total) {
              resolve();
            }
          };
          
          images.forEach((img) => {
            if (img.complete && img.naturalHeight !== 0) {
              checkComplete();
            } else {
              img.addEventListener('load', checkComplete);
              img.addEventListener('error', checkComplete);
            }
          });
          
          // Fallback timeout
          setTimeout(resolve, 8000);
        });
      });
    } catch (error) {
      console.warn('Image loading check failed, continuing:', error.message);
    }

    // Additional wait to ensure all content is rendered
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Double-check that all images are loaded
    let imageLoadStatus = { total: 0, loaded: 0, failed: 0, pending: 0 };
    try {
      imageLoadStatus = await page.evaluate(() => {
        const images = document.querySelectorAll('img');
        const status = {
          total: images.length,
          loaded: 0,
          failed: 0,
          pending: 0
        };
        
        images.forEach(img => {
          if (img.complete && img.naturalHeight !== 0) {
            status.loaded++;
          } else if (img.src && img.src !== 'undefined' && img.src !== 'null' && img.src !== '') {
            status.pending++;
          } else {
            status.failed++;
          }
        });
        
        return status;
      });
    } catch (error) {
      console.warn('Image load status check failed:', error.message);
    }
    
    console.log('Image load status:', imageLoadStatus);
    console.log('Total products in quotation:', quotation.products.length);
    console.log('Products with images:', quotation.products.filter(p => p.imageUrl).length);
    
    // If there are pending images, wait a bit more
    if (imageLoadStatus.pending > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Check if page is still valid
    try {
      if (page.isClosed()) {
        throw new Error('Page was closed before PDF generation');
      }
    } catch (checkError) {
      console.warn('Page status check failed:', checkError.message);
      // Continue anyway as the check might fail even if page is valid
    }

    // Generate PDF with specific settings
    let pdf;
    try {
      // Add a timeout wrapper to prevent hanging
      const pdfPromise = page.pdf({
        format: 'A4',
        margin: {
          top: '0',
          right: '0',
          bottom: '0',
          left: '0'
        },
        printBackground: true,
        preferCSSPageSize: true,
        timeout: 60000 // 60 second timeout for PDF generation
      });
      
      // Add an additional timeout wrapper
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('PDF generation timeout')), 70000);
      });
      
      pdf = await Promise.race([pdfPromise, timeoutPromise]);
    } catch (pdfError) {
      console.error('PDF generation error:', pdfError);
      throw new Error(`PDF generation failed: ${pdfError.message}`);
    }

    // Close browser
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.warn('Browser close error:', closeError);
      }
      browser = null;
    }

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=quotation-${quotation.quotationNumber}.pdf`);
    
    // Send buffer directly
    res.end(pdf);

  } catch (error) {
    console.error('Error generating PDF:', error);
    
    // Make sure browser is closed in case of error
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.warn('Browser close error during cleanup:', closeError);
      }
      browser = null;
    }
    
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Export quotations to CSV
// @route   GET /api/quotations/export
// @access  Private
exports.exportQuotations = async (req, res) => {
  try {
    // Filter by relationship manager if not admin
    const filter = {};
    if (req.user.role !== 'admin') {
      filter.relationshipManager = req.user.id;
    }
    
    const quotations = await Quotation.find(filter)
      .populate('relationshipManager', 'name email')
      .populate('createdBy', 'name email');
    
    // Create CSV header
    let csv = 'Quotation Number,Client Name,Client Email,Stage,Relationship Manager,Created Date,Grand Total\n';
    
    // Add rows to CSV
    quotations.forEach(quotation => {
      csv += `${quotation.quotationNumber},${quotation.clientName},${quotation.clientEmail},${quotation.stage},${quotation.relationshipManager.name},${quotation.createdAt.toLocaleDateString()},${quotation.grandTotal}\n`;
    });
    
    // Set response headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=quotations.csv');
    
    // Send the CSV
    res.status(200).send(csv);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
