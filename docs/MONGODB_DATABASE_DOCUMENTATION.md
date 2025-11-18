# MongoDB Database Documentation

This document provides a comprehensive overview of all MongoDB databases, collections, and their structures used in the Meddey Tech Workspace project.

## Database Overview

The project uses multiple MongoDB databases for different purposes:

1. **shopify-orders** - Main database for Shopify order management
2. **quoteapp** - Database for quotation management system
3. **meddeygo-workspace** - General workspace data and uploads

---

## Database: shopify-orders

**Connection URI**: `mongodb://localhost:27017/shopify-orders`
**Purpose**: Main database for managing Shopify orders and related data

### Collections

#### 1. orders
**Purpose**: Stores Shopify order data from multiple stores
**Document Count**: Variable (grows with new orders)
**Indexes**: 
- `_id` (default)
- `order_id` (unique)
- `shopify_shop_name`
- `created_at`
- `customer.phone`
- `line_items.sku`

**Sample Document Structure**:
```json
{
  "_id": ObjectId("..."),
  "order_id": "1234567890",
  "shopify_shop_name": "medanshv2.myshopify.com",
  "email": "customer@example.com",
  "created_at": "2025-01-15T10:30:00Z",
  "updated_at": "2025-01-15T10:35:00Z",
  "customer": {
    "id": "customer_123",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+919999999999",
    "email": "customer@example.com"
  },
  "line_items": [
    {
      "product_id": "product_123",
      "variant_id": "variant_456",
      "sku": "SKU-12345",
      "name": "Product Name",
      "quantity": 2,
      "price": "29.99",
      "total": "59.98"
    }
  ],
  "total_price": "59.98",
  "currency": "INR",
  "financial_status": "paid",
  "fulfillment_status": "fulfilled"
}
```

#### 2. extracted_data
**Purpose**: Stores processed order data extracted from various sources
**Document Count**: Variable
**Indexes**:
- `_id` (default)
- `order_id`
- `phone_number`
- `company_name`
- `extracted_date`

**Sample Document Structure**:
```json
{
  "_id": ObjectId("..."),
  "order_id": "ORD-12345",
  "phone_number": "9999999999",
  "customer_name": "John Doe",
  "product_name": "Product Name",
  "company_name": "Meddeygo",
  "extracted_date": "2025-01-15T10:30:00Z",
  "source_file": "orders_2025-01-15.csv",
  "status": "processed"
}
```

#### 3. inventory_items
**Purpose**: Stores inventory tracking data
**Document Count**: Variable
**Indexes**:
- `_id` (default)
- `sku` (unique)
- `company_name`
- `location`

**Sample Document Structure**:
```json
{
  "_id": ObjectId("..."),
  "sku": "SKU-12345",
  "product_name": "Product Name",
  "company_name": "Meddeygo",
  "location": "Okhla",
  "current_stock": 150,
  "reorder_level": 50,
  "last_updated": "2025-01-15T10:30:00Z",
  "supplier_info": {
    "name": "Supplier Name",
    "contact": "supplier@example.com"
  }
}
```

---

## Database: quoteapp

**Connection URI**: `mongodb://localhost:27017/quoteapp`
**Purpose**: Database for the quotation management system

### Collections

#### 1. quotes
**Purpose**: Stores quotation data and documents
**Document Count**: Variable (grows with new quotations)
**Indexes**:
- `_id` (default)
- `quote_number` (unique)
- `customer_email`
- `created_date`
- `status`

**Sample Document Structure**:
```json
{
  "_id": ObjectId("..."),
  "quote_number": "QT-2025-001",
  "customer_name": "ABC Corporation",
  "customer_email": "contact@abccorp.com",
  "customer_phone": "+911234567890",
  "created_date": "2025-01-15T10:30:00Z",
  "valid_until": "2025-02-15T10:30:00Z",
  "status": "pending",
  "products": [
    {
      "product_name": "Medical Device A",
      "quantity": 5,
      "unit_price": 2999.99,
      "total_price": 14999.95,
      "sku": "MD-A001"
    }
  ],
  "subtotal": 14999.95,
  "tax_amount": 2699.99,
  "total_amount": 17699.94,
  "notes": "Special pricing for bulk order"
}
```

#### 2. users
**Purpose**: Stores user accounts for the quotation system
**Document Count**: Small (admin users)
**Indexes**:
- `_id` (default)
- `email` (unique)
- `username` (unique)

**Sample Document Structure**:
```json
{
  "_id": ObjectId("..."),
  "username": "admin",
  "email": "admin@meddey.com",
  "password": "hashed_password",
  "role": "admin",
  "created_at": "2025-01-01T00:00:00Z",
  "last_login": "2025-01-15T10:30:00Z",
  "is_active": true
}
```

#### 3. products
**Purpose**: Stores product catalog for quotations
**Document Count**: Variable (based on product catalog)
**Indexes**:
- `_id` (default)
- `sku` (unique)
- `category`
- `active`

**Sample Document Structure**:
```json
{
  "_id": ObjectId("..."),
  "sku": "MD-A001",
  "name": "Medical Device A",
  "description": "Advanced medical diagnostic device",
  "category": "Diagnostic Equipment",
  "unit_price": 2999.99,
  "cost_price": 2000.00,
  "stock_quantity": 25,
  "active": true,
  "created_date": "2025-01-01T00:00:00Z",
  "specifications": {
    "weight": "2.5kg",
    "dimensions": "30x20x15cm",
    "warranty": "2 years"
  }
}
```

#### 4. pricing_rules
**Purpose**: Stores pricing rules and discounts
**Document Count**: Small (pricing configurations)
**Indexes**:
- `_id` (default)
- `rule_name`
- `active`

**Sample Document Structure**:
```json
{
  "_id": ObjectId("..."),
  "rule_name": "Bulk Discount 10+",
  "description": "10% discount for orders of 10+ units",
  "discount_type": "percentage",
  "discount_value": 10,
  "minimum_quantity": 10,
  "active": true,
  "applicable_products": ["MD-A001", "MD-B002"],
  "valid_from": "2025-01-01T00:00:00Z",
  "valid_until": "2025-12-31T23:59:59Z"
}
```

---

## Database: meddeygo-workspace

**Connection URI**: `mongodb://localhost:27017/meddeygo-workspace`
**Purpose**: General workspace data, uploads, and logs

### Collections

#### 1. uploads
**Purpose**: Stores file upload metadata and references
**Document Count**: Variable (grows with uploads)
**Indexes**:
- `_id` (default)
- `filename`
- `uploaded_by`
- `upload_date`
- `tool_name`

**Sample Document Structure**:
```json
{
  "_id": ObjectId("..."),
  "filename": "orders_2025-01-15.csv",
  "original_name": "orders_2025-01-15.csv",
  "file_path": "./uploads/orders_2025-01-15.csv",
  "file_size": 1048576,
  "mime_type": "text/csv",
  "uploaded_by": "admin@meddey.com",
  "upload_date": "2025-01-15T10:30:00Z",
  "tool_name": "gsheet-integration",
  "processed": true,
  "processing_date": "2025-01-15T10:35:00Z"
}
```

#### 2. logs
**Purpose**: Stores application logs and audit trails
**Document Count**: Large (continuous logging)
**Indexes**:
- `_id` (default)
- `level`
- `timestamp`
- `tool_name`
- `user_id`

**Sample Document Structure**:
```json
{
  "_id": ObjectId("..."),
  "timestamp": "2025-01-15T10:30:00Z",
  "level": "info",
  "message": "Order processed successfully",
  "tool_name": "inventory-management",
  "user_id": "admin@meddey.com",
  "details": {
    "order_id": "12345",
    "action": "process_order",
    "result": "success"
  },
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0..."
}
```

#### 3. email_recipients
**Purpose**: Stores email notification recipients
**Document Count**: Small (configured recipients)
**Indexes**:
- `_id` (default)
- `email` (unique)
- `active`

**Sample Document Structure**:
```json
{
  "_id": ObjectId("..."),
  "email": "admin@meddey.com",
  "name": "Admin User",
  "notification_types": ["order_updates", "inventory_alerts", "system_errors"],
  "active": true,
  "created_date": "2025-01-01T00:00:00Z"
}
```

#### 4. settings
**Purpose**: Stores application settings and configurations
**Document Count**: Small (configuration data)
**Indexes**:
- `_id` (default)
- `key` (unique)

**Sample Document Structure**:
```json
{
  "_id": ObjectId("..."),
  "key": "inventory_alert_threshold",
  "value": "50",
  "description": "Alert when inventory falls below this threshold",
  "category": "inventory",
  "updated_by": "admin@meddey.com",
  "updated_date": "2025-01-15T10:30:00Z"
}
```

---

## Database Connection Information

### Local Development
- **Host**: localhost
- **Port**: 27017
- **Authentication**: None (development only)

### Production Environment
- **Host**: Configured via environment variables
- **Port**: Configured via environment variables
- **Authentication**: Username/password authentication
- **SSL/TLS**: Enabled for secure connections

---

## Migration Notes

When migrating between MongoDB instances:

1. **Collections are migrated with all data and indexes**
2. **Document relationships are preserved**
3. **Indexes are recreated on the target database**
4. **Migration reports are generated for verification**
5. **Dry-run mode available for testing**

Use the provided migration script (`scripts/mongodb-migration.js`) for safe and complete data transfer between MongoDB instances.

---

## Backup and Recovery

### Regular Backups
- Automated daily backups are recommended
- Use `mongodump` for full database backups
- Store backups in secure, off-site location

### Point-in-Time Recovery
- Enable MongoDB oplog for point-in-time recovery
- Maintain replica sets for high availability
- Test recovery procedures regularly

---

*This documentation is automatically updated when database schemas change. Last updated: November 16, 2025*