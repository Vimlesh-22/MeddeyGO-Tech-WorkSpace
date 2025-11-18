import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  FormControl,
  FormLabel,
  RadioGroup,
  Radio,
  Checkbox,
  FormGroup,
  Alert,
  IconButton,
} from '@mui/material';
import FormControlLabel from '@mui/material/FormControlLabel';
import { Close as CloseIcon, Download as DownloadIcon } from '@mui/icons-material';
import * as XLSX from 'xlsx';

const BulkOrderExport = ({ open, onClose, orders, selectedItems }) => {
  const [exportFormat, setExportFormat] = useState('xlsx');
  const [exportScope, setExportScope] = useState('selected'); // 'selected' or 'all'
  const [includeFields, setIncludeFields] = useState({
    orderId: true,
    sku: true,
    productName: true,
    size: true,
    quantity: true,
    date: true,
    vendor: true,
    customerName: true,
    customerPhone: true,
    shippingAddress: true,
    notes: true,
    stage: true,
    okhlaAvailable: false,
    okhlaSafetyStock: false,
    bahadurgarhAvailable: false,
    bahadurgarhSafetyStock: false,
  });

  // Get orders to export based on scope
  const getOrdersToExport = () => {
    if (exportScope === 'selected' && selectedItems.length > 0) {
      // Filter groups and their orders based on selected items
      const selectedGroups = [];
      orders.forEach(group => {
        if (!group.orders || !Array.isArray(group.orders)) return;
        
        const selectedOrdersInGroup = group.orders.filter(order => 
          selectedItems.some(item => 
            item.orderId === order.orderId && item.itemId === order.itemId
          )
        );
        
        if (selectedOrdersInGroup.length > 0) {
          // Include group data with filtered orders
          selectedOrdersInGroup.forEach(order => {
            selectedGroups.push({
              ...order,
              sku: group.sku,
              productName: group.productName || order.productName,
              size: group.size,
              sizeFromShopify: group.sizeFromShopify,
              sizeFromSheet: group.sizeFromSheet,
              // Extract vendor name properly - handle both object and string
              vendor: (group.vendor && typeof group.vendor === 'object' ? group.vendor.name : group.vendor) || group.autoDetectedVendor || null,
              autoDetectedVendor: group.autoDetectedVendor,
              okhlaAvailable: group.okhlaAvailable,
              okhlaSafetyStock: group.okhlaSafetyStock,
              bahadurgarhAvailable: group.bahadurgarhAvailable,
              bahadurgarhSafetyStock: group.bahadurgarhSafetyStock,
              isPack: group.isPack,
              packQuantity: group.packQuantity,
            });
          });
        }
      });
      return selectedGroups;
    }
    
    // Export all orders with group data
    return orders.flatMap(group => {
      if (!group.orders || !Array.isArray(group.orders)) return [];
      
      return group.orders.map(order => ({
        ...order,
        sku: group.sku,
        productName: group.productName || order.productName,
        size: group.size,
        sizeFromShopify: group.sizeFromShopify,
        sizeFromSheet: group.sizeFromSheet,
        // Extract vendor name properly - handle both object and string
        vendor: (group.vendor && typeof group.vendor === 'object' ? group.vendor.name : group.vendor) || group.autoDetectedVendor || null,
        autoDetectedVendor: group.autoDetectedVendor,
        okhlaAvailable: group.okhlaAvailable,
        okhlaSafetyStock: group.okhlaSafetyStock,
        bahadurgarhAvailable: group.bahadurgarhAvailable,
        bahadurgarhSafetyStock: group.bahadurgarhSafetyStock,
        isPack: group.isPack,
        packQuantity: group.packQuantity,
      }));
    });
  };

  // Handle field toggle
  const handleFieldToggle = (field) => {
    setIncludeFields(prev => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  // Export to Excel
  const exportToExcel = () => {
    const ordersToExport = getOrdersToExport();

    if (ordersToExport.length === 0) {
      alert('No orders to export');
      return;
    }

    // Prepare data based on selected fields
    const exportData = ordersToExport.map(order => {
      const row = {};

      if (includeFields.orderId) row['Order ID'] = order.orderName || order.orderId || '';
      if (includeFields.sku) row['SKU'] = order.sku || '';
      if (includeFields.productName) row['Product Name'] = order.productName || '';
      if (includeFields.size) row['Size'] = order.size || '';
      if (includeFields.quantity) row['Quantity'] = order.quantity || 0;
      if (includeFields.date) row['Date'] = order.receivedDate ? new Date(order.receivedDate).toLocaleDateString() : '';
      // Extract vendor name - handle both object (vendor.name) and string cases
      let vendorName = '';
      if (order.vendor) {
        vendorName = typeof order.vendor === 'string' 
          ? order.vendor 
          : (order.vendor.name || order.vendor || '');
      } else if (order.autoDetectedVendor) {
        vendorName = order.autoDetectedVendor;
      }
      if (includeFields.vendor) row['Vendor'] = vendorName;
      if (includeFields.customerName) row['Customer Name'] = order.customerName || '';
      if (includeFields.customerPhone) row['Customer Phone'] = order.customerPhone || '';
      if (includeFields.shippingAddress) row['Shipping Address'] = order.shippingAddress || '';
      if (includeFields.notes) row['Notes'] = order.notes || '';
      if (includeFields.stage) row['Stage'] = order.stage || 'Initial';
      if (includeFields.okhlaAvailable) row['Okhla Available'] = order.okhlaAvailable || 0;
      if (includeFields.okhlaSafetyStock) row['Okhla Safety Stock'] = order.okhlaSafetyStock || 0;
      if (includeFields.bahadurgarhAvailable) row['Bahadurgarh Available'] = order.bahadurgarhAvailable || 0;
      if (includeFields.bahadurgarhSafetyStock) row['Bahadurgarh Safety Stock'] = order.bahadurgarhSafetyStock || 0;

      return row;
    });

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');

    // Auto-size columns
    const maxWidth = 50;
    const colWidths = {};
    
    exportData.forEach(row => {
      Object.keys(row).forEach(key => {
        const value = String(row[key] || '');
        const width = Math.min(Math.max(key.length, value.length) + 2, maxWidth);
        colWidths[key] = Math.max(colWidths[key] || 0, width);
      });
    });

    ws['!cols'] = Object.values(colWidths).map(w => ({ wch: w }));

    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `orders_export_${timestamp}.${exportFormat}`;

    // Write file
    XLSX.writeFile(wb, filename);

    onClose();
  };

  // Export to CSV
  const exportToCSV = () => {
    const ordersToExport = getOrdersToExport();

    if (ordersToExport.length === 0) {
      alert('No orders to export');
      return;
    }

    // Prepare data based on selected fields
    const headers = [];
    if (includeFields.orderId) headers.push('Order ID');
    if (includeFields.sku) headers.push('SKU');
    if (includeFields.productName) headers.push('Product Name');
    if (includeFields.size) headers.push('Size');
    if (includeFields.quantity) headers.push('Quantity');
    if (includeFields.date) headers.push('Date');
    if (includeFields.vendor) headers.push('Vendor');
    if (includeFields.customerName) headers.push('Customer Name');
    if (includeFields.customerPhone) headers.push('Customer Phone');
    if (includeFields.shippingAddress) headers.push('Shipping Address');
    if (includeFields.notes) headers.push('Notes');
    if (includeFields.stage) headers.push('Stage');
    if (includeFields.okhlaAvailable) headers.push('Okhla Available');
    if (includeFields.okhlaSafetyStock) headers.push('Okhla Safety Stock');
    if (includeFields.bahadurgarhAvailable) headers.push('Bahadurgarh Available');
    if (includeFields.bahadurgarhSafetyStock) headers.push('Bahadurgarh Safety Stock');

    const rows = ordersToExport.map(order => {
      const row = [];
      if (includeFields.orderId) row.push(order.orderName || order.orderId || '');
      if (includeFields.sku) row.push(order.sku || '');
      if (includeFields.productName) row.push(order.productName || '');
      if (includeFields.size) row.push(order.size || '');
      if (includeFields.quantity) row.push(order.quantity || 0);
      if (includeFields.date) row.push(order.receivedDate ? new Date(order.receivedDate).toLocaleDateString() : '');
      // Extract vendor name - handle both object (vendor.name) and string cases
      let vendorName = '';
      if (order.vendor) {
        vendorName = typeof order.vendor === 'string' 
          ? order.vendor 
          : (order.vendor.name || order.vendor || '');
      } else if (order.autoDetectedVendor) {
        vendorName = order.autoDetectedVendor;
      }
      if (includeFields.vendor) row.push(vendorName);
      if (includeFields.customerName) row.push(order.customerName || '');
      if (includeFields.customerPhone) row.push(order.customerPhone || '');
      if (includeFields.shippingAddress) row.push(order.shippingAddress || '');
      if (includeFields.notes) row.push(order.notes || '');
      if (includeFields.stage) row.push(order.stage || 'Initial');
      if (includeFields.okhlaAvailable) row.push(order.okhlaAvailable || 0);
      if (includeFields.okhlaSafetyStock) row.push(order.okhlaSafetyStock || 0);
      if (includeFields.bahadurgarhAvailable) row.push(order.bahadurgarhAvailable || 0);
      if (includeFields.bahadurgarhSafetyStock) row.push(order.bahadurgarhSafetyStock || 0);
      return row;
    });

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().split('T')[0];
    
    link.setAttribute('href', url);
    link.setAttribute('download', `orders_export_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onClose();
  };

  const handleExport = () => {
    if (exportFormat === 'xlsx' || exportFormat === 'xls') {
      exportToExcel();
    } else {
      exportToCSV();
    }
  };

  const ordersToExportCount = getOrdersToExport().length;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" component="span">Export Orders</Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* Export Scope */}
        <FormControl component="fieldset" sx={{ mb: 3 }}>
          <FormLabel component="legend">Export Scope</FormLabel>
          <RadioGroup value={exportScope} onChange={(e) => setExportScope(e.target.value)}>
            <FormControlLabel
              value="selected"
              control={<Radio />}
              label={`Selected Orders (${selectedItems.length} items)`}
              disabled={selectedItems.length === 0}
            />
            <FormControlLabel
              value="all"
              control={<Radio />}
              label={`All Orders (${orders.flatMap(g => g.orders || []).length} items)`}
            />
          </RadioGroup>
        </FormControl>

        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2">
            {ordersToExportCount} order(s) will be exported
          </Typography>
        </Alert>

        {/* Export Format */}
        <FormControl component="fieldset" sx={{ mb: 3 }}>
          <FormLabel component="legend">Export Format</FormLabel>
          <RadioGroup value={exportFormat} onChange={(e) => setExportFormat(e.target.value)} row>
            <FormControlLabel value="xlsx" control={<Radio />} label="Excel (.xlsx)" />
            <FormControlLabel value="csv" control={<Radio />} label="CSV (.csv)" />
          </RadioGroup>
        </FormControl>

        {/* Fields to Include */}
        <FormControl component="fieldset">
          <FormLabel component="legend">Fields to Include</FormLabel>
          <FormGroup>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <FormControlLabel
                control={<Checkbox checked={includeFields.orderId} onChange={() => handleFieldToggle('orderId')} />}
                label="Order ID"
              />
              <FormControlLabel
                control={<Checkbox checked={includeFields.sku} onChange={() => handleFieldToggle('sku')} />}
                label="SKU"
              />
              <FormControlLabel
                control={<Checkbox checked={includeFields.productName} onChange={() => handleFieldToggle('productName')} />}
                label="Product Name"
              />
              <FormControlLabel
                control={<Checkbox checked={includeFields.size} onChange={() => handleFieldToggle('size')} />}
                label="Size"
              />
              <FormControlLabel
                control={<Checkbox checked={includeFields.quantity} onChange={() => handleFieldToggle('quantity')} />}
                label="Quantity"
              />
              <FormControlLabel
                control={<Checkbox checked={includeFields.date} onChange={() => handleFieldToggle('date')} />}
                label="Date"
              />
              <FormControlLabel
                control={<Checkbox checked={includeFields.vendor} onChange={() => handleFieldToggle('vendor')} />}
                label="Vendor"
              />
              <FormControlLabel
                control={<Checkbox checked={includeFields.customerName} onChange={() => handleFieldToggle('customerName')} />}
                label="Customer Name"
              />
              <FormControlLabel
                control={<Checkbox checked={includeFields.customerPhone} onChange={() => handleFieldToggle('customerPhone')} />}
                label="Customer Phone"
              />
              <FormControlLabel
                control={<Checkbox checked={includeFields.shippingAddress} onChange={() => handleFieldToggle('shippingAddress')} />}
                label="Shipping Address"
              />
              <FormControlLabel
                control={<Checkbox checked={includeFields.notes} onChange={() => handleFieldToggle('notes')} />}
                label="Notes"
              />
              <FormControlLabel
                control={<Checkbox checked={includeFields.stage} onChange={() => handleFieldToggle('stage')} />}
                label="Stage"
              />
              <FormControlLabel
                control={<Checkbox checked={includeFields.okhlaAvailable} onChange={() => handleFieldToggle('okhlaAvailable')} />}
                label="Okhla Available"
              />
              <FormControlLabel
                control={<Checkbox checked={includeFields.okhlaSafetyStock} onChange={() => handleFieldToggle('okhlaSafetyStock')} />}
                label="Okhla Safety Stock"
              />
              <FormControlLabel
                control={<Checkbox checked={includeFields.bahadurgarhAvailable} onChange={() => handleFieldToggle('bahadurgarhAvailable')} />}
                label="Bahadurgarh Available"
              />
              <FormControlLabel
                control={<Checkbox checked={includeFields.bahadurgarhSafetyStock} onChange={() => handleFieldToggle('bahadurgarhSafetyStock')} />}
                label="Bahadurgarh Safety Stock"
              />
            </Box>
          </FormGroup>
        </FormControl>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={<DownloadIcon />}
          onClick={handleExport}
          disabled={ordersToExportCount === 0}
        >
          Export
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BulkOrderExport;
