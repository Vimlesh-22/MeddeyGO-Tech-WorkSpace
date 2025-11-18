import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  CircularProgress,
  Stepper,
  Step,
  StepLabel,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Download as DownloadIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { API_BASE_URL } from '../config';

const BulkOrderImport = ({ open, onClose, onImportComplete }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState([]);
  const [validationResults, setValidationResults] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [error, setError] = useState('');

  const steps = ['Upload File', 'Validate Data', 'Import Orders'];

  // Required headers for import
  const REQUIRED_HEADERS = {
    sku: 'SKU',
    productName: 'Product Name',
    quantity: 'Quantity',
    orderId: 'Order ID',
    date: 'Date',
    vendor: 'Vendor',
    customerName: 'Customer Name',
    customerPhone: 'Customer Phone',
    shippingAddress: 'Shipping Address',
    notes: 'Notes',
  };

  // Download template
  const downloadTemplate = () => {
    const templateData = [
      {
        'SKU': 'ABC123',
        'Product Name': 'Sample Product',
        'Quantity': '10',
        'Order ID': '',
        'Date': new Date().toISOString().split('T')[0],
        'Vendor': 'Sample Vendor',
        'Customer Name': 'John Doe',
        'Customer Phone': '+1234567890',
        'Shipping Address': '123 Main St, City, Country',
        'Notes': 'Sample notes',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Order Template');

    // Set column widths
    ws['!cols'] = [
      { wch: 20 }, // SKU
      { wch: 30 }, // Product Name
      { wch: 15 }, // Quantity
      { wch: 40 }, // Order ID
      { wch: 20 }, // Date
      { wch: 25 }, // Vendor
      { wch: 25 }, // Customer Name
      { wch: 20 }, // Customer Phone
      { wch: 40 }, // Shipping Address
      { wch: 30 }, // Notes
    ];

    XLSX.writeFile(wb, 'bulk_order_import_template.xlsx');
  };

  // Handle file upload
  const handleFileUpload = (event) => {
    const uploadedFile = event.target.files[0];
    if (!uploadedFile) return;

    setError('');
    setFile(uploadedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);

        if (jsonData.length === 0) {
          setError('The uploaded file is empty');
          return;
        }

        // Normalize column names by trimming spaces
        const normalizedData = jsonData.map(row => {
          const cleanRow = {};
          Object.keys(row).forEach(key => {
            const cleanKey = key.trim();
            cleanRow[cleanKey] = row[key];
          });
          return cleanRow;
        });

        // Parse and normalize data
        const normalized = normalizedData.map((row, index) => ({
          rowNumber: index + 2, // Excel row number (1-indexed + header)
          sku: String(row['SKU (Required)'] || row.SKU || row.sku || '').trim(),
          productName: String(
            row['Product Name (Required)'] || 
            row['Product Name'] || 
            row.productName || 
            row['product name'] || 
            row.ProductName || 
            ''
          ).trim(),
          quantity: parseInt(
            row['Quantity (Required)'] || 
            row.Quantity || 
            row.quantity || 
            row.qty || 
            0
          ),
          orderId: String(
            row['Order ID (Optional - auto-generated if empty)'] || 
            row['Order ID'] || 
            row.orderId || 
            row.OrderID || 
            ''
          ).trim(),
          date: row['Date (Optional - defaults to today)'] || row.Date || row.date || new Date().toISOString().split('T')[0],
          vendor: String(row['Vendor (Optional)'] || row.Vendor || row.vendor || '').trim(),
          customerName: String(
            row['Customer Name (Optional)'] || 
            row['Customer Name'] || 
            row.customerName || 
            row.customer_name || 
            ''
          ).trim(),
          customerPhone: String(
            row['Customer Phone (Optional)'] || 
            row['Customer Phone'] || 
            row.customerPhone || 
            row.customer_phone || 
            ''
          ).trim(),
          shippingAddress: String(
            row['Shipping Address (Optional)'] || 
            row['Shipping Address'] || 
            row.shippingAddress || 
            row.shipping_address || 
            ''
          ).trim(),
          notes: String(row['Notes (Optional)'] || row.Notes || row.notes || '').trim(),
        }));

        setParsedData(normalized);
        validateData(normalized);
        setActiveStep(1);
      } catch (err) {
        setError('Error reading file: ' + err.message);
      }
    };

    reader.readAsArrayBuffer(uploadedFile);
  };

  // Validate parsed data
  const validateData = (data) => {
    const results = data.map((row) => {
      const errors = [];
      const warnings = [];

      // Required field validation
      if (!row.sku) errors.push('SKU is required');
      if (!row.productName) errors.push('Product Name is required');
      if (!row.quantity || row.quantity <= 0) errors.push('Valid Quantity is required');

      // Warnings for optional but recommended fields
      if (!row.orderId) warnings.push('Order ID will be auto-generated');
      if (!row.vendor) warnings.push('No vendor specified');

      return {
        ...row,
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    });

    setValidationResults(results);
  };

  // Generate manual order ID
  const generateOrderId = () => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `MANUAL-${timestamp}-${random}`;
  };

  // Import orders
  const handleImport = async () => {
    const validOrders = validationResults.filter((r) => r.isValid);

    if (validOrders.length === 0) {
      setError('No valid orders to import');
      return;
    }

    setImporting(true);
    setActiveStep(2);
    setError('');

    try {
      const ordersToCreate = validOrders.map((order) => ({
        orderId: order.orderId || generateOrderId(),
        sku: order.sku,
        productName: order.productName,
        quantity: order.quantity,
        date: order.date,
        vendor: order.vendor,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerEmail: '',
        shippingAddress: order.shippingAddress,
        notes: order.notes,
        stage: 'Initial',
        price: 0,
      }));

      console.log('Sending orders to API:', ordersToCreate);

      // Call API to create orders in bulk
      const response = await fetch(`${API_BASE_URL}/orders/bulk-create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orders: ordersToCreate }),
      });

      const result = await response.json();
      
      console.log('API Response:', result);

      if (!response.ok) {
        throw new Error(result.message || `Server error: ${response.status}`);
      }

      setImportResults({
        success: result.created || 0,
        failed: result.failed || 0,
        total: validOrders.length,
      });

      // Notify parent component
      if (onImportComplete) {
        onImportComplete(result);
      }
    } catch (err) {
      console.error('Import error:', err);
      setError('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  // Reset dialog
  const handleClose = () => {
    setActiveStep(0);
    setFile(null);
    setParsedData([]);
    setValidationResults([]);
    setImporting(false);
    setImportResults(null);
    setError('');
    onClose();
  };

  // Render step content
  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                <strong>Required Fields:</strong>
              </Typography>
              <Typography variant="body2">
                • SKU<br />
                • Product Name<br />
                • Quantity
              </Typography>
              <Typography variant="subtitle2" sx={{ mt: 1 }} gutterBottom>
                <strong>Optional Fields:</strong>
              </Typography>
              <Typography variant="body2">
                • Order ID (auto-generated if not provided)<br />
                • Date (defaults to today)<br />
                • Vendor<br />
                • Customer Name, Phone, Shipping Address<br />
                • Notes
              </Typography>
            </Alert>

            <Box sx={{ textAlign: 'center', my: 3 }}>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={downloadTemplate}
                sx={{ mb: 3 }}
              >
                Download Template (Excel)
              </Button>

              <Box sx={{ border: '2px dashed #ccc', borderRadius: 2, p: 4, cursor: 'pointer' }}>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                  id="file-upload"
                />
                <label htmlFor="file-upload" style={{ cursor: 'pointer', display: 'block' }}>
                  <UploadIcon sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
                  <Typography variant="h6">
                    {file ? file.name : 'Click to upload or drag and drop'}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Supports: Excel (.xlsx, .xls) or CSV files
                  </Typography>
                </label>
              </Box>
            </Box>
          </Box>
        );

      case 1:
        const validCount = validationResults.filter((r) => r.isValid).length;
        const invalidCount = validationResults.length - validCount;

        return (
          <Box>
            <Alert severity={invalidCount > 0 ? 'warning' : 'success'} sx={{ mb: 2 }}>
              <Typography variant="body1">
                <strong>{validCount}</strong> valid orders, <strong>{invalidCount}</strong> invalid orders
              </Typography>
            </Alert>

            <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Row</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>SKU</TableCell>
                    <TableCell>Product Name</TableCell>
                    <TableCell>Qty</TableCell>
                    <TableCell>Order ID</TableCell>
                    <TableCell>Vendor</TableCell>
                    <TableCell>Issues</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {validationResults.map((row, index) => (
                    <TableRow key={index} sx={{ bgcolor: row.isValid ? 'inherit' : 'error.lighter' }}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell>
                        {row.isValid ? (
                          <CheckIcon color="success" />
                        ) : (
                          <ErrorIcon color="error" />
                        )}
                      </TableCell>
                      <TableCell>{row.sku || '-'}</TableCell>
                      <TableCell>{row.productName || '-'}</TableCell>
                      <TableCell>{row.quantity || '-'}</TableCell>
                      <TableCell>{row.orderId || <Chip label="Auto" size="small" />}</TableCell>
                      <TableCell>{row.vendor || '-'}</TableCell>
                      <TableCell>
                        {row.errors.length > 0 && (
                          <Alert severity="error" sx={{ py: 0, px: 1 }}>
                            {row.errors.join(', ')}
                          </Alert>
                        )}
                        {row.warnings.length > 0 && (
                          <Alert severity="warning" sx={{ py: 0, px: 1, mt: row.errors.length > 0 ? 0.5 : 0 }}>
                            {row.warnings.join(', ')}
                          </Alert>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        );

      case 2:
        if (importing) {
          return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CircularProgress size={60} />
              <Typography variant="h6" sx={{ mt: 2 }}>
                Importing orders...
              </Typography>
            </Box>
          );
        }

        if (importResults) {
          return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CheckIcon sx={{ fontSize: 80, color: 'success.main', mb: 2 }} />
              <Typography variant="h5" gutterBottom>
                Import Completed!
              </Typography>
              <Box sx={{ mt: 3 }}>
                <Chip
                  label={`${importResults.success} orders created`}
                  color="success"
                  sx={{ mr: 1, fontSize: '1.1rem', py: 2.5 }}
                />
                {importResults.failed > 0 && (
                  <Chip
                    label={`${importResults.failed} failed`}
                    color="error"
                    sx={{ fontSize: '1.1rem', py: 2.5 }}
                  />
                )}
              </Box>
            </Box>
          );
        }

        return null;

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">Bulk Order Import</Typography>
          <IconButton onClick={handleClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {renderStepContent()}
      </DialogContent>

      <DialogActions>
        {activeStep === 1 && (
          <>
            <Button onClick={() => setActiveStep(0)}>Back</Button>
            <Button
              variant="contained"
              onClick={handleImport}
              disabled={validationResults.filter((r) => r.isValid).length === 0}
            >
              Import {validationResults.filter((r) => r.isValid).length} Valid Orders
            </Button>
          </>
        )}
        {activeStep === 2 && importResults && (
          <Button variant="contained" onClick={handleClose}>
            Done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default BulkOrderImport;
