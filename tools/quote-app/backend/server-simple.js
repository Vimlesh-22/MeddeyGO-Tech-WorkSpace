const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Load environment variables from project-hub root
const envPath = path.join(__dirname, '..', '..', '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const app = express();
const PORT = process.env.QUOTE_PORT || 4094;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'quote-generator',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Simple quote endpoints (in-memory storage)
let quotes = [];

app.get('/api/quotes', (req, res) => {
  res.json(quotes);
});

app.post('/api/quotes', (req, res) => {
  const quote = {
    id: Date.now(),
    ...req.body,
    createdAt: new Date().toISOString()
  };
  quotes.push(quote);
  res.json(quote);
});

app.get('/api/quotes/:id', (req, res) => {
  const quote = quotes.find(q => q.id === parseInt(req.params.id));
  if (!quote) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  res.json(quote);
});

// Serve static files
const frontendDistPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Quote Generator backend running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
});