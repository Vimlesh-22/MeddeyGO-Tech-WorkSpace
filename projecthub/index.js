const mongoose = require('mongoose');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Environment configuration loader
const loadEnv = () => {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  }
};

// MongoDB connection manager
class MongoManager {
  constructor() {
    this.connections = new Map();
  }

  async connect(uri, name = 'default') {
    if (this.connections.has(name)) {
      return this.connections.get(name);
    }

    try {
      const conn = await mongoose.createConnection(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      
      this.connections.set(name, conn);
      console.log(`✅ MongoDB connected: ${name}`);
      return conn;
    } catch (error) {
      console.warn(`⚠️  MongoDB connection failed for ${name}: ${error.message}`);
      console.warn('💡 Falling back to file-based storage');
      
      // Return a mock connection that uses file-based storage
      return this.createFileBasedConnection(name);
    }
  }

  getConnection(name = 'default') {
    return this.connections.get(name);
  }

  async disconnect(name) {
    if (this.connections.has(name)) {
      await this.connections.get(name).close();
      this.connections.delete(name);
      console.log(`🔌 MongoDB disconnected: ${name}`);
    }
  }

  async disconnectAll() {
    for (const [name, conn] of this.connections) {
      await conn.close();
      console.log(`🔌 MongoDB disconnected: ${name}`);
    }
    this.connections.clear();
  }

  createFileBasedConnection(name) {
    const dataDir = path.join(__dirname, '..', 'data', name);
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const mockConnection = {
      db: {
        collection: (collectionName) => ({
          find: async (query = {}) => {
            const filePath = path.join(dataDir, `${collectionName}.json`);
            if (!fs.existsSync(filePath)) {
              return { toArray: async () => [] };
            }
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return { toArray: async () => data.filter(item => this.matchesQuery(item, query)) };
          },
          findOne: async (query = {}) => {
            const filePath = path.join(dataDir, `${collectionName}.json`);
            if (!fs.existsSync(filePath)) {
              return null;
            }
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return data.find(item => this.matchesQuery(item, query)) || null;
          },
          insertOne: async (document) => {
            const filePath = path.join(dataDir, `${collectionName}.json`);
            let data = [];
            if (fs.existsSync(filePath)) {
              data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            }
            const newDoc = { ...document, _id: document._id || this.generateId() };
            data.push(newDoc);
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            return { insertedId: newDoc._id };
          },
          updateOne: async (filter, update) => {
            const filePath = path.join(dataDir, `${collectionName}.json`);
            if (!fs.existsSync(filePath)) {
              return { modifiedCount: 0 };
            }
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const index = data.findIndex(item => this.matchesQuery(item, filter));
            if (index === -1) {
              return { modifiedCount: 0 };
            }
            const updatedDoc = { ...data[index], ...update.$set };
            data[index] = updatedDoc;
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            return { modifiedCount: 1 };
          },
          deleteOne: async (filter) => {
            const filePath = path.join(dataDir, `${collectionName}.json`);
            if (!fs.existsSync(filePath)) {
              return { deletedCount: 0 };
            }
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const newData = data.filter(item => !this.matchesQuery(item, filter));
            if (newData.length === data.length) {
              return { deletedCount: 0 };
            }
            fs.writeFileSync(filePath, JSON.stringify(newData, null, 2));
            return { deletedCount: 1 };
          }
        })
      },
      readyState: 1,
      close: async () => {
        console.log(`File-based connection ${name} closed`);
      }
    };
    
    this.connections.set(name, mockConnection);
    console.log(`✅ File-based storage initialized for ${name}`);
    return mockConnection;
  }
  
  matchesQuery(item, query) {
    if (!query || Object.keys(query).length === 0) return true;
    
    return Object.entries(query).every(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        if (value.$gt !== undefined) return item[key] > value.$gt;
        if (value.$lt !== undefined) return item[key] < value.$lt;
        if (value.$gte !== undefined) return item[key] >= value.$gte;
        if (value.$lte !== undefined) return item[key] <= value.$lte;
        if (value.$ne !== undefined) return item[key] !== value.$ne;
      }
      return item[key] === value;
    });
  }
  
  generateId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }
}

// File upload manager with MongoDB storage
class UploadManager {
  constructor(mongoConn) {
    this.mongoConn = mongoConn;
    this.uploadSchema = new mongoose.Schema({
      id: { type: String, default: uuidv4 },
      filename: { type: String, required: true },
      originalName: { type: String, required: true },
      mimetype: { type: String, required: true },
      size: { type: Number, required: true },
      path: { type: String, required: true },
      tool: { type: String, required: true },
      userId: { type: String, default: 'system' },
      metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
      expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, // 7 days
      createdAt: { type: Date, default: Date.now },
      downloadedAt: { type: Date },
      downloadCount: { type: Number, default: 0 }
    });

    this.uploadSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    this.Upload = this.mongoConn.model('Upload', this.uploadSchema);
  }

  // Multer storage configuration
  getStorageConfig(tool, uploadPath = './uploads') {
    return multer.diskStorage({
      destination: (req, file, cb) => {
        const dest = path.join(uploadPath, tool);
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
        }
        cb(null, dest);
      },
      filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
      }
    });
  }

  // Create multer upload middleware
  createUploadMiddleware(tool, options = {}) {
    const {
      uploadPath = './uploads',
      maxSize = 10 * 1024 * 1024, // 10MB
      allowedTypes = ['.csv', '.xlsx', '.xls', '.pdf', '.txt', '.png', '.jpg', '.jpeg', '.mp4', '.avi', '.mov', '.wmv', '.mkv', '.webm']
    } = options;

    return multer({
      storage: this.getStorageConfig(tool, uploadPath),
      limits: { fileSize: maxSize },
      fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
          cb(null, true);
        } else {
          cb(new Error(`File type ${ext} not allowed. Allowed: ${allowedTypes.join(', ')}`));
        }
      }
    });
  }

  // Save upload metadata to MongoDB
  async saveUpload(file, tool, userId = 'system', metadata = {}) {
    const upload = new this.Upload({
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
      tool,
      userId,
      metadata
    });

    return await upload.save();
  }

  // Get upload by ID
  async getUpload(id) {
    return await this.Upload.findOne({ id });
  }

  // Mark upload as downloaded
  async markDownloaded(id) {
    return await this.Upload.findOneAndUpdate(
      { id },
      { 
        downloadedAt: new Date(),
        $inc: { downloadCount: 1 }
      },
      { new: true }
    );
  }

  // Get uploads for a tool
  async getUploads(tool, options = {}) {
    const { limit = 50, offset = 0, userId } = options;
    const query = { tool };
    if (userId) query.userId = userId;

    return await this.Upload.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset);
  }

  // Clean up expired uploads
  async cleanupExpired() {
    const expired = await this.Upload.find({
      expiresAt: { $lt: new Date() }
    });

    for (const upload of expired) {
      try {
        if (fs.existsSync(upload.path)) {
          fs.unlinkSync(upload.path);
        }
        await this.Upload.deleteOne({ _id: upload._id });
      } catch (error) {
        console.error(`Failed to cleanup upload ${upload.id}:`, error.message);
      }
    }

    return expired.length;
  }
}

// System logs manager
class LogManager {
  constructor(mongoConn) {
    this.mongoConn = mongoConn;
    this.logSchema = new mongoose.Schema({
      level: { type: String, enum: ['error', 'warn', 'info', 'debug'], default: 'info' },
      message: { type: String, required: true },
      tool: { type: String, required: true },
      userId: { type: String, default: 'system' },
      metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
      expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, // 7 days
      createdAt: { type: Date, default: Date.now }
    });

    this.logSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    this.logSchema.index({ tool: 1, createdAt: -1 });
    this.logSchema.index({ level: 1, createdAt: -1 });
    
    this.Log = this.mongoConn.model('Log', this.logSchema);
  }

  // Log methods
  async log(level, message, tool, userId = 'system', metadata = {}) {
    const log = new this.Log({
      level,
      message,
      tool,
      userId,
      metadata
    });

    return await log.save();
  }

  async error(message, tool, userId = 'system', metadata = {}) {
    return await this.log('error', message, tool, userId, metadata);
  }

  async warn(message, tool, userId = 'system', metadata = {}) {
    return await this.log('warn', message, tool, userId, metadata);
  }

  async info(message, tool, userId = 'system', metadata = {}) {
    return await this.log('info', message, tool, userId, metadata);
  }

  async debug(message, tool, userId = 'system', metadata = {}) {
    return await this.log('debug', message, tool, userId, metadata);
  }

  // Get logs with filtering
  async getLogs(options = {}) {
    const {
      tool,
      level,
      userId,
      limit = 100,
      offset = 0,
      startDate,
      endDate
    } = options;

    const query = {};
    if (tool) query.tool = tool;
    if (level) query.level = level;
    if (userId) query.userId = userId;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    return await this.Log.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset);
  }

  // Clean up old logs
  async cleanupOld() {
    const old = await this.Log.find({
      expiresAt: { $lt: new Date() }
    });

    return old.length;
  }
}

// Utility functions
const utils = {
  // Generate unique ID
  generateId: () => uuidv4(),

  // Format file size
  formatFileSize: (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  // Sanitize filename
  sanitizeFilename: (filename) => {
    return filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  },

  // Ensure directory exists
  ensureDir: (dirPath) => {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  },

  // Parse CSV buffer
  parseCSV: (buffer) => {
    const csv = require('csv-parser');
    const { Readable } = require('stream');
    return new Promise((resolve, reject) => {
      const results = [];
      const stream = Readable.from(buffer);
      stream
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  }
};

// Export everything
module.exports = {
  loadEnv,
  MongoManager,
  UploadManager,
  LogManager,
  utils
};