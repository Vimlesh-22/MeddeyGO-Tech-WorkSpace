# MongoDB Configuration Documentation

## Overview
All applications in the project-hub workspace now use a centralized remote MongoDB server for data storage. This document provides comprehensive information about the MongoDB configuration, security, and best practices.

## Remote Server Details

| Parameter | Value |
|-----------|-------|
| **Host** | `129.154.246.226` |
| **Port** | `27017` |
| **Username** | `admin` |
| **Password** | `StrongPassword123!` |
| **Auth Source** | `admin` |

## Connection String Format

### Standard Format
```
mongodb://<username>:<password>@<host>:<port>/<database>?authSource=admin
```

### Example Connection Strings
```bash
# Shopify Orders Database
mongodb://admin:StrongPassword123!@129.154.246.226:27017/shopify-orders?authSource=admin

# Quote App Database
mongodb://admin:StrongPassword123!@129.154.246.226:27017/quoteapp?authSource=admin

# Purchase App Database
mongodb://admin:StrongPassword123!@129.154.246.226:27017/purchase_app?authSource=admin
```

⚠️ **Important:** The `?authSource=admin` parameter is required for authentication to work properly.

## Environment Variables

All MongoDB connections are configured through environment variables in the main `.env` file. **No hardcoded fallbacks are used** - all applications require proper environment configuration.

### Required Environment Variables

```env
# Main MongoDB connection
MONGODB_URI=mongodb://admin:StrongPassword123!@129.154.246.226:27017/shopify-orders?authSource=admin

# Quote application
QUOTE_MONGODB_URI=mongodb://admin:StrongPassword123!@129.154.246.226:27017/quoteapp?authSource=admin

# Inventory management
INVENTORY_MONGODB_URI=mongodb://admin:StrongPassword123!@129.154.246.226:27017/shopify-orders?authSource=admin

# Order extractor
ORDER_EXTRACTOR_MONGODB_URI=mongodb://admin:StrongPassword123!@129.154.246.226:27017/shopify-orders?authSource=admin

# Workspace uploads database
MONGODB_UPLOADS_DB=meddeygo-workspace
```

### Connection Parameters
```env
MONGODB_USE_NEW_URL_PARSER=true
MONGODB_USE_UNIFIED_TOPOLOGY=true
MONGODB_SERVER_SELECTION_TIMEOUT=5000
MONGODB_SOCKET_TIMEOUT=45000
```

## Databases on Remote Server

| Database Name | Size | Collections | Documents | Purpose |
|---------------|------|-------------|-----------|---------|
| `shopify-orders` | 3.18 MB | 15 | 3,488 | Main inventory and order management |
| `quoteapp` | 1.05 MB | 5 | 5,647 | Quotation system |
| `purchase_app` | 1.45 MB | 3 | 9,579 | Purchase orders and vendor data |
| `oplex-operations` | 0.50 MB | 6 | 332 | Operations and invoicing |
| `ai-seo-strategist` | 0.03 MB | 2 | 0 | AI content management |
| `inventory-management` | 0.02 MB | 1 | 0 | Inventory tracking |
| `meddeygo-workspace` | 0.02 MB | 2 | 0 | File upload tracking |

**Total:** 7 databases, 49 collections, 19,609 documents

## Applications Using MongoDB

### 1. Inventory Management System
- **Path:** `tools/inventory-management`
- **Database:** `shopify-orders`
- **Env Variable:** `INVENTORY_MONGODB_URI`
- **Collections:** orders, products, vendors, customers, activities, transactions, etc.

### 2. Quote Generator
- **Path:** `tools/quote-app`
- **Database:** `quoteapp`
- **Env Variable:** `QUOTE_MONGODB_URI`
- **Collections:** users, quotations, products, pricing rules

### 3. Purchase App
- **Database:** `purchase_app`
- **Env Variable:** `MONGODB_URI`
- **Collections:** orders, logs, vendors

### 4. Order ID Extractor
- **Path:** `tools/order-id-extractor`
- **Database:** `shopify-orders`
- **Env Variable:** `ORDER_EXTRACTOR_MONGODB_URI`

### 5. Upload Tracker
- **Path:** `src/lib/upload-tracker.mjs`
- **Database:** `meddeygo-workspace`
- **Env Variable:** `MONGODB_URI`
- **Collections:** temporary_uploads, upload_cleanup_log

### 6. AI SEO Strategist
- **Path:** `tools/ai-seo-strategist`
- **Database:** `ai-seo-strategist`
- **Env Variable:** `MONGODB_URI`
- **Collections:** contents, projects

## Configuration Files Updated

All hardcoded MongoDB fallback URIs have been removed. Applications now strictly require environment variables:

### Main Configuration
- ✅ `.env` - Main environment configuration
- ✅ `Inventory Management/backend/.env` - Inventory-specific config

### Application Code
- ✅ `tools/quote-app/backend/server.js` - Quote app server
- ✅ `tools/inventory-management/backend/server.js` - Inventory server
- ✅ `Inventory Management/backend/server.js` - Standalone inventory
- ✅ `tools/ai-seo-strategist/backend/config/db.js` - AI SEO config
- ✅ `src/lib/upload-tracker.mjs` - Upload tracker

### Scripts
- ✅ `scripts/start-quote.js` - Quote app launcher
- ✅ `test-mongo.js` - MongoDB connection test
- ✅ `test-quote-server.js` - Quote server test

## Verification & Testing

### Verify All Connections
```bash
node verify-mongodb-remote.js
```

This script tests:
- ✅ Direct connection to remote server
- ✅ Environment variables configuration
- ✅ Mongoose connections to all databases
- ✅ Document counts and collections

### Test Specific Components
```bash
# Test MongoDB connection
node test-mongo.js

# Test quote server
node test-quote-server.js

# Test quote app
node scripts/start-quote.js

# Test inventory management
node scripts/start-inventory.js
```

### Migration Script
If you need to re-run migration or migrate new data:
```bash
node migrate-mongodb.js
```

## Security Considerations

### ⚠️ Critical Security Notes

1. **Credentials in Plain Text**
   - Connection strings contain credentials
   - Ensure `.env` is in `.gitignore`
   - Never commit credentials to version control

2. **Environment-Specific Configs**
   - Use different credentials for dev/staging/production
   - Store production credentials in secure vault
   - Rotate credentials regularly

3. **Network Security**
   - Implement IP whitelisting on MongoDB server
   - Use VPN or private network when possible
   - Enable firewall rules to restrict access

4. **SSL/TLS**
   - Production should use SSL/TLS encryption
   - Add `ssl=true` to connection string
   - Validate SSL certificates

5. **Authentication**
   - Use `authSource=admin` for admin authentication
   - Create database-specific users with limited permissions
   - Follow principle of least privilege

### Recommended Production Configuration

```env
# Production MongoDB with SSL
MONGODB_URI=mongodb://prod_user:SecurePassword123!@prod-server:27017/database?authSource=admin&ssl=true&sslValidate=true

# Additional security parameters
MONGODB_MAX_POOL_SIZE=10
MONGODB_MIN_POOL_SIZE=2
MONGODB_AUTH_MECHANISM=SCRAM-SHA-256
```

## Backup & Recovery

### Backup Strategy
- **Daily:** Incremental backups of all databases
- **Weekly:** Full database backups
- **Monthly:** Archival backups (long-term storage)
- **Quarterly:** Test restore procedures

### Backup Commands
```bash
# Backup specific database
mongodump --uri="mongodb://admin:StrongPassword123!@129.154.246.226:27017/shopify-orders?authSource=admin" --out=/backup/path

# Backup all databases
mongodump --uri="mongodb://admin:StrongPassword123!@129.154.246.226:27017?authSource=admin" --out=/backup/path

# Restore database
mongorestore --uri="mongodb://admin:StrongPassword123!@129.154.246.226:27017?authSource=admin" /backup/path
```

## Monitoring

### Key Metrics to Monitor
- Connection pool usage
- Query response times
- Database size and growth rate
- Index usage and efficiency
- CPU, Memory, and Disk usage
- Replication lag (if using replica sets)
- Failed connection attempts

### Monitoring Tools
- MongoDB Atlas (for cloud deployments)
- MongoDB Ops Manager
- Prometheus + Grafana
- Custom application logging

## Troubleshooting

### Connection Issues

#### Error: "Authentication failed"
**Solution:** Ensure `?authSource=admin` is in the connection string

#### Error: "Connection timeout"
**Causes:**
- Network connectivity issue
- MongoDB server not running
- Firewall blocking port 27017
- IP not whitelisted

**Debug Steps:**
```bash
# Test network connectivity
ping 129.154.246.226

# Test port connectivity
telnet 129.154.246.226 27017

# Check MongoDB service
# (run on server)
systemctl status mongod
```

#### Error: "MongoServerError: bad auth"
**Solution:** Verify username and password are correct in `.env` file

### Application Errors

#### Error: "MONGODB_URI must be set in .env file"
**Solution:** Ensure `.env` file exists and contains the required MongoDB URI

#### Error: "MongooseError: Operation buffering timed out"
**Solution:** Check MongoDB connection and increase timeout values

### Performance Issues

#### Slow Queries
- Check and optimize indexes
- Analyze query patterns
- Use MongoDB explain() to diagnose
- Consider query result caching

#### Connection Pool Exhausted
- Increase `maxPoolSize` setting
- Check for connection leaks in code
- Implement connection retry logic

## Migration History

**Date:** November 18, 2025  
**From:** `mongodb://localhost:27017`  
**To:** `mongodb://129.154.246.226:27017`  
**Total Data:** 19,609 documents across 7 databases

### Migration Details
- All data successfully migrated
- All indexes recreated on remote server
- Applications updated to use remote server
- All hardcoded fallbacks removed
- Verification tests passed

### Post-Migration Checklist
- ✅ All environment variables updated
- ✅ All applications tested and working
- ✅ Hardcoded fallbacks removed
- ✅ Documentation updated
- ✅ Backup procedures established
- ✅ Monitoring configured

## Best Practices

### Development
1. Load environment variables early in application startup
2. Validate required environment variables before connecting
3. Implement graceful connection failure handling
4. Use connection pooling appropriately
5. Log connection events for debugging

### Code Examples

#### Proper Connection Handling
```javascript
// Load environment variables
require('dotenv').config();

// Validate required variables
if (!process.env.MONGODB_URI) {
  console.error('ERROR: MONGODB_URI must be set in .env file');
  process.exit(1);
}

// Connect with error handling
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
})
.then(() => console.log('MongoDB connected'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});
```

#### Connection String Validation
```javascript
function validateMongoURI(uri) {
  if (!uri) return false;
  if (!uri.includes('mongodb://')) return false;
  if (!uri.includes('authSource=admin')) {
    console.warn('Warning: authSource=admin not found in URI');
  }
  return true;
}
```

## Support & Contacts

### Technical Support
- **Database Issues:** Check MongoDB logs and application logs
- **Connection Issues:** Run `verify-mongodb-remote.js`
- **Data Issues:** Contact database administrator

### Documentation References
- Main migration doc: `MONGODB_MIGRATION_COMPLETE.md`
- Config reference: `docs/mongodb-remote-config.env`
- This document: `docs/MONGODB_CONFIGURATION.md`

---

**Last Updated:** November 18, 2025  
**Version:** 1.0  
**Status:** Production Ready ✅
