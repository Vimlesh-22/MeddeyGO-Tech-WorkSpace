# Backend Test Suite

Comprehensive test suite for all backend services and functionality.

## Test Files

1. **`test-all-backends.js`** - Connectivity tests
   - Tests if all backend services are running and accessible
   - Checks port availability
   - Tests health endpoints
   - Tests database and MongoDB connections

2. **`test-backend-functions.js`** - Functionality tests
   - Tests all API endpoints (upload, verify, CRUD operations)
   - Tests authentication endpoints
   - Tests database operations
   - Tests error handling and rate limiting

3. **`run-all-tests.js`** - Master test runner
   - Runs both connectivity and functionality tests
   - Provides comprehensive summary

## Running Tests

### Run All Tests
```bash
node test/run-all-tests.js
```

### Run Connectivity Tests Only
```bash
node test/test-all-backends.js
```

### Run Functionality Tests Only
```bash
node test/test-backend-functions.js
```

## What Gets Tested

### Project Hub (Port 4090)
- Health check
- Authentication (Request OTP, Verify OTP)
- File upload
- User management
- Activity logs

### Quote Generator (Port 4094)
- Health check
- Users API
- Quotations API
- Products API

### Inventory Management (Port 4096)
- Health check
- Orders API
- Products API
- Vendors API
- Inventory data API

### Order Extractor (Port 4097)
- Health check
- Orders upload API
- AWB API

### Data Extractor Pro (Port 4092)
- Root endpoint
- Upload endpoint

### File Merger (Port 4093)
- Root endpoint

### GSHEET Integration (Port 4095)
- Health check
- Upload API
- Extract products API

### Database
- Basic queries
- Table existence checks
- Transaction handling
- Lock timeout handling

## Test Results

Tests will show:
- ✅ Passed tests (green)
- ❌ Failed tests (red)
- ⚠️ Warnings (yellow)
- 📊 Summary statistics

## Notes

- Some tests may show 401/403 errors if authentication is required (this is expected and indicates the endpoint is working)
- Tests are designed to verify endpoint availability, not full functionality
- Database tests require a valid database connection
- All tests use timeouts to prevent hanging

## Troubleshooting

If tests fail:
1. Ensure all services are running: `npm run dev`
2. Check `.env` file for correct port configurations
3. Verify database connection settings
4. Check that required environment variables are set

