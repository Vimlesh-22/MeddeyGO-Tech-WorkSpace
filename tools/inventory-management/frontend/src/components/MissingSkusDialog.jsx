import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Box,
  Typography,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  Paper,
  Alert
} from '@mui/material';
import {
  Add as AddIcon,
  Close as CloseIcon,
  Download as DownloadIcon,
  Sync as SyncIcon
} from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../config';

export default function MissingSkusDialog({
  open,
  onClose,
  missingSkus = [],
  location,
  transactionType,
  onConfirm,
  onExport,
  onSkip
}) {
  const [selectedSkus, setSelectedSkus] = useState(new Set());
  const [skuDetails, setSkuDetails] = useState({});
  const [selectAll, setSelectAll] = useState(true);

  React.useEffect(() => {
    if (open && missingSkus.length > 0) {
      // Initialize all as selected
      const allSkus = new Set(missingSkus.map(sku => sku.sku));
      setSelectedSkus(allSkus);
      setSelectAll(true);
      
      // Initialize SKU details with defaults
      const details = {};
      missingSkus.forEach(sku => {
        details[sku.sku] = {
          safetyStock: 0,
          initialQuantity: 0
        };
      });
      setSkuDetails(details);
    }
  }, [open, missingSkus]);

  const handleToggleSelect = (sku) => {
    const newSelected = new Set(selectedSkus);
    if (newSelected.has(sku)) {
      newSelected.delete(sku);
    } else {
      newSelected.add(sku);
    }
    setSelectedSkus(newSelected);
    setSelectAll(newSelected.size === missingSkus.length);
  };

  const handleToggleSelectAll = () => {
    if (selectAll) {
      setSelectedSkus(new Set());
    } else {
      const allSkus = new Set(missingSkus.map(sku => sku.sku));
      setSelectedSkus(allSkus);
    }
    setSelectAll(!selectAll);
  };

  const handleUpdateDetail = (sku, field, value) => {
    setSkuDetails(prev => ({
      ...prev,
      [sku]: {
        ...prev[sku],
        [field]: parseInt(value) || 0
      }
    }));
  };

  const handleConfirm = () => {
    const skusToAdd = missingSkus
      .filter(sku => selectedSkus.has(sku.sku))
      .map(sku => ({
        sku: sku.sku,
        productName: sku.productName,
        safetyStock: skuDetails[sku.sku]?.safetyStock || 0,
        initialQuantity: skuDetails[sku.sku]?.initialQuantity || 0
      }));
    
    if (onConfirm) {
      onConfirm(skusToAdd);
    }
  };

  const handleAddToSheet = () => {
    handleConfirm();
  };

  const handleExportCSV = async () => {
    try {
      const response = await axios.post(`${API_BASE_URL}/inventory/export-missing-skus`, {
        missingSkus: missingSkus.map(s => s.sku || s),
        location,
        transactionType
      }, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `missing-skus-${location}-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);
      }, 100);
      
      if (onExport) {
        onExport();
      }
    } catch (error) {
      console.error('Error exporting missing SKUs:', error);
    }
  };

  const handleSkipMissing = () => {
    if (onSkip) {
      onSkip();
    }
  };

  if (!open || missingSkus.length === 0) {
    return null;
  }

  const totalSkus = missingSkus.length;
  const selectedCount = selectedSkus.size;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" component="span">
            Missing SKUs in {location} Inventory Sheet
          </Typography>
          <Chip 
            label={`${selectedCount} of ${totalSkus} selected`} 
            color="primary" 
            size="small" 
          />
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          These SKUs are not found in the {location} inventory sheet. 
          You can add them with custom safety stock and initial quantities.
        </Alert>

        <Box sx={{ mb: 2, display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            onClick={handleToggleSelectAll}
          >
            {selectAll ? 'Deselect All' : 'Select All'}
          </Button>
          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
            Configure safety stock and initial quantity for each SKU below
          </Typography>
        </Box>

        <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectAll}
                    onChange={handleToggleSelectAll}
                  />
                </TableCell>
                <TableCell><strong>SKU</strong></TableCell>
                <TableCell><strong>Product Name</strong></TableCell>
                <TableCell align="center"><strong>Transaction Type</strong></TableCell>
                <TableCell align="center"><strong>Total Quantity</strong></TableCell>
                <TableCell><strong>Safety Stock</strong></TableCell>
                <TableCell><strong>Initial Qty</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {missingSkus.map((sku) => (
                <TableRow 
                  key={sku.sku}
                  sx={selectedSkus.has(sku.sku) ? { bgcolor: 'action.selected' } : {}}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedSkus.has(sku.sku)}
                      onChange={() => handleToggleSelect(sku.sku)}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      {sku.sku}
                    </Typography>
                  </TableCell>
                  <TableCell>{sku.productName}</TableCell>
                  <TableCell align="center">
                    <Chip label={sku.transactionType} size="small" color="primary" />
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2" color="primary">
                      {sku.totalQuantity}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <TextField
                      type="number"
                      size="small"
                      value={skuDetails[sku.sku]?.safetyStock || 0}
                      onChange={(e) => handleUpdateDetail(sku.sku, 'safetyStock', e.target.value)}
                      disabled={!selectedSkus.has(sku.sku)}
                      sx={{ width: 100 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      type="number"
                      size="small"
                      value={skuDetails[sku.sku]?.initialQuantity || 0}
                      onChange={(e) => handleUpdateDetail(sku.sku, 'initialQuantity', e.target.value)}
                      disabled={!selectedSkus.has(sku.sku)}
                      sx={{ width: 100 }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary">
            * Safety Stock: Minimum quantity to keep in inventory<br/>
            * Initial Quantity: Starting quantity when adding SKU to sheet
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} startIcon={<CloseIcon />}>
          Cancel
        </Button>
        <Button onClick={handleAddToSheet} color="primary" startIcon={<AddIcon />} disabled={selectedCount === 0}>
          Add to Sheet
        </Button>
        <Button onClick={handleExportCSV} color="secondary" startIcon={<DownloadIcon />}>
          Export to CSV
        </Button>
        <Button onClick={handleSkipMissing} color="warning" startIcon={<SyncIcon />}>
          Skip & Sync Others
        </Button>
      </DialogActions>
    </Dialog>
  );
}

