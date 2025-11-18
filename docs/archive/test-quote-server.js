const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB
const connectDB = async () => {
  try {
    console.log('Connecting to MongoDB...');
    if (!process.env.QUOTE_MONGODB_URI) {
      throw new Error('QUOTE_MONGODB_URI must be set in .env file');
    }
    await mongoose.connect(process.env.QUOTE_MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ MongoDB Connected!');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    process.exit(1);
  }
};

// Simple Quote Schema
const quoteSchema = new mongoose.Schema({
  customerName: String,
  email: String,
  phone: String,
  items: [{
    productName: String,
    quantity: Number,
    price: Number,
    total: Number
  }],
  subtotal: Number,
  tax: Number,
  total: Number,
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'quotes' });

const Quote = mongoose.model('Quote', quoteSchema);

// Test routes
app.get('/test-db', async (req, res) => {
  try {
    const connectionState = mongoose.connection.readyState;
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    res.json({
      success: true,
      connectionState,
      host: mongoose.connection.host,
      database: mongoose.connection.name,
      collections: collections.map(c => c.name)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/test-quotes', async (req, res) => {
  try {
    const quotes = await Quote.find({}).limit(5);
    res.json({
      success: true,
      quotes,
      count: quotes.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/test-seed', async (req, res) => {
  try {
    const testQuote = new Quote({
      customerName: 'Test Customer',
      email: 'test@example.com',
      phone: '1234567890',
      items: [{
        productName: 'Test Product',
        quantity: 1,
        price: 100,
        total: 100
      }],
      subtotal: 100,
      tax: 18,
      total: 118,
      status: 'pending'
    });
    
    await testQuote.save();
    res.json({
      success: true,
      message: 'Test quote created',
      quote: testQuote
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
const PORT = 4099;

connectDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Test server running on http://localhost:${PORT}`);
    console.log('Available endpoints:');
    console.log(`  GET  http://localhost:${PORT}/test-db     - Test database connection`);
    console.log(`  GET  http://localhost:${PORT}/test-quotes - Get quotes`);
    console.log(`  POST http://localhost:${PORT}/test-seed  - Create test quote`);
  });
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});