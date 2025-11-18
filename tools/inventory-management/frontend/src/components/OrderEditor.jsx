import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Typography,
  Box,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Autocomplete,
  Divider,
  Alert
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Add as AddIcon,
  Save as SaveIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../config';

export default function OrderEditor({ open, onClose, order, onSave }) {
  const [formData, setFormData] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (order) {
      setFormData({
        orderName: order.orderName || '',
        customerName: order.customerName || '',
        customerEmail: order.customerEmail || '',
        customerPhone: order.customerPhone || '',
        orderStatus: order.orderStatus || 'Unfulfilled',
        paymentStatus: order.paymentStatus || 'Pending',
        fulfillmentStatus: order.fulfillmentStatus || 'Unfulfilled',
        shippingAddress: order.shippingAddress || {
          address1: '',
          address2: '',
          city: '',
          province: '',
          country: '',
          zip: ''
        },
        billingAddress: order.billingAddress || {
          address1: '',
          address2: '',
          city: '',
          province: '',
          country: '',
          zip: ''
        },
        items: order.items || []
      });
    }
  }, [order]);

  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/vendors`);
      setVendors(response.data || []);
    } catch (error) {
      console.error('Error loading vendors:', error);
    }
  };

  const { data: sheetVendors = [] } = useQuery({
    queryKey: ['sheet-vendor-suggestions'],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE_URL}/settings/vendor-suggestions`);
      return Array.isArray(response.data?.vendors) ? response.data.vendors : [];
    }
  });

  const vendorOptions = (() => {
    const db = Array.isArray(vendors) ? vendors.map(v => ({ _id: v._id, name: v.name })) : [];
    const sheets = Array.isArray(sheetVendors) ? sheetVendors.map(n => ({ name: n })) : [];
    const map = new Map();
    db.forEach(v => {
      const n = typeof v.name === 'string' ? v.name : '';
      if (!n) return;
      map.set(n.toLowerCase(), v);
    });
    sheets.forEach(s => {
      const n = typeof s.name === 'string' ? s.name : '';
      if (!n) return;
      const key = n.toLowerCase();
      if (!map.has(key)) map.set(key, s);
    });
    const arr = Array.from(map.values());
    return arr.sort((a,b)=>{
      const an = (a?.name || a?.label || '').toString();
      const bn = (b?.name || b?.label || '').toString();
      return an.localeCompare(bn);
    });
  })();

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleAddressChange = (addressType, field, value) => {
    setFormData(prev => ({
      ...prev,
      [addressType]: {
        ...prev[addressType],
        [field]: value
      }
    }));
  };

  const handleItemChange = (index, field, value) => {
    setFormData(prev => {
      const newItems = [...prev.items];
      newItems[index] = {
        ...newItems[index],
        [field]: value
      };
      return {
        ...prev,
        items: newItems
      };
    });
  };

  const [suggestionMap, setSuggestionMap] = useState({});
  useEffect(() => {
    (async () => {
      try {
        const set = new Set((formData?.items || []).map(i => i.sku).filter(Boolean));
        const entries = {};
        for (const sku of set) {
          try {
            const resp = await axios.get(`${API_BASE_URL}/vendors/suggest/${encodeURIComponent(sku)}`);
            const v = resp.data?.vendor;
            entries[sku] = v ? [{ name: v }] : [];
          } catch {}
        }
        setSuggestionMap(entries);
      } catch {}
    })();
  }, [formData?.items]);

  const buildVendorOptions = (item) => {
    const suggs = suggestionMap[item?.sku] || [];
    const db = Array.isArray(vendors) ? vendors.map(v => ({ _id: v._id, name: v.name })) : [];
    const map = new Map();
    // Prioritize suggestions
    suggs.forEach(s => { const key = (s.name || '').toLowerCase(); if (key) map.set(key, s); });
    db.forEach(v => { const key = (v.name || '').toLowerCase(); if (key && !map.has(key)) map.set(key, v); });
    return Array.from(map.values());
  };

  const handleAddItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          sku: '',
          productName: '',
          variantName: '',
          quantity: 1,
          warehouse: 'Okhla',
          vendor: null
        }
      ]
    }));
  };

  const handleRemoveItem = (index) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleSave = async () => {
    if (!formData) return;
    
    setLoading(true);
    setError('');
    
    try {
      // Allow editing processed orders
      const response = await axios.put(`${API_BASE_URL}/orders/${order._id}`, formData);
      
      if (response.data) {
        onSave(response.data);
        onClose();
      }
    } catch (error) {
      console.error('Error saving order:', error);
      setError(error.response?.data?.message || 'Failed to save order');
    } finally {
      setLoading(false);
    }
  };

  if (!formData) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" component="span">Edit Order: {order?.orderName}</Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Grid container spacing={3}>
          {/* Order Information */}
          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom>Order Information</Typography>
            <Divider sx={{ mb: 2 }} />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Order Name"
              value={formData.orderName}
              onChange={(e) => handleChange('orderName', e.target.value)}
            />
          </Grid>


          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Order Status</InputLabel>
              <Select
                value={formData.orderStatus}
                label="Order Status"
                onChange={(e) => handleChange('orderStatus', e.target.value)}
              >
                <MenuItem value="Fulfilled">Fulfilled</MenuItem>
                <MenuItem value="Unfulfilled">Unfulfilled</MenuItem>
                <MenuItem value="Canceled">Canceled</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Payment Status</InputLabel>
              <Select
                value={formData.paymentStatus}
                label="Payment Status"
                onChange={(e) => handleChange('paymentStatus', e.target.value)}
              >
                <MenuItem value="Pending">Pending</MenuItem>
                <MenuItem value="Paid">Paid</MenuItem>
                <MenuItem value="Partially_paid">Partially Paid</MenuItem>
                <MenuItem value="Failed">Failed</MenuItem>
                <MenuItem value="Refunded">Refunded</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Customer Information */}
          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Customer Information</Typography>
            <Divider sx={{ mb: 2 }} />
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="Customer Name"
              value={formData.customerName}
              onChange={(e) => handleChange('customerName', e.target.value)}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="Customer Email"
              type="email"
              value={formData.customerEmail}
              onChange={(e) => handleChange('customerEmail', e.target.value)}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="Customer Phone"
              value={formData.customerPhone}
              onChange={(e) => handleChange('customerPhone', e.target.value)}
            />
          </Grid>

          {/* Shipping Address */}
          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Shipping Address</Typography>
            <Divider sx={{ mb: 2 }} />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Address Line 1"
              value={formData.shippingAddress.address1}
              onChange={(e) => handleAddressChange('shippingAddress', 'address1', e.target.value)}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Address Line 2"
              value={formData.shippingAddress.address2}
              onChange={(e) => handleAddressChange('shippingAddress', 'address2', e.target.value)}
            />
          </Grid>

          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              label="City"
              value={formData.shippingAddress.city}
              onChange={(e) => handleAddressChange('shippingAddress', 'city', e.target.value)}
            />
          </Grid>

          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              label="Province/State"
              value={formData.shippingAddress.province}
              onChange={(e) => handleAddressChange('shippingAddress', 'province', e.target.value)}
            />
          </Grid>

          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              label="Country"
              value={formData.shippingAddress.country}
              onChange={(e) => handleAddressChange('shippingAddress', 'country', e.target.value)}
            />
          </Grid>

          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              label="ZIP Code"
              value={formData.shippingAddress.zip}
              onChange={(e) => handleAddressChange('shippingAddress', 'zip', e.target.value)}
            />
          </Grid>

          {/* Order Items */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, mb: 2 }}>
              <Typography variant="h6">Order Items</Typography>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={handleAddItem}
                size="small"
              >
                Add Item
              </Button>
            </Box>
            <Divider sx={{ mb: 2 }} />

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>SKU</TableCell>
                    <TableCell>Product Name</TableCell>
                    <TableCell>Variant</TableCell>
                    <TableCell width={100}>Quantity</TableCell>
                    <TableCell width={150}>Warehouse</TableCell>
                    <TableCell width={200}>Vendor</TableCell>
                    <TableCell width={50}>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {formData.items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <TextField
                          size="small"
                          value={item.sku}
                          onChange={(e) => handleItemChange(index, 'sku', e.target.value)}
                          fullWidth
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          value={item.productName}
                          onChange={(e) => handleItemChange(index, 'productName', e.target.value)}
                          fullWidth
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          value={item.variantName || ''}
                          onChange={(e) => handleItemChange(index, 'variantName', e.target.value)}
                          fullWidth
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 1)}
                          fullWidth
                          inputProps={{ min: 1 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          size="small"
                          value={item.warehouse}
                          onChange={(e) => handleItemChange(index, 'warehouse', e.target.value)}
                          fullWidth
                        >
                          <MenuItem value="Okhla">Okhla</MenuItem>
                          <MenuItem value="Bahadurgarh">Bahadurgarh</MenuItem>
                          <MenuItem value="Direct">Direct</MenuItem>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Autocomplete
                          size="small"
                          options={buildVendorOptions(item)}
                          getOptionLabel={(option) => option.name || ''}
                          value={(Array.isArray(vendors) ? vendors.find(v => v._id === item.vendor) : null) || null}
                          onChange={async (e, newValue) => {
                            try {
                              if (newValue?._id) {
                                await axios.put(`${API_BASE_URL}/orders/${order._id}/items/${item._id}/vendor`, { vendorId: newValue._id });
                                handleItemChange(index, 'vendor', newValue._id);
                              } else if (newValue?.name) {
                                await axios.put(`${API_BASE_URL}/orders/${order._id}/items/${item._id}/vendor`, { vendorName: newValue.name });
                                // After server maps/creates, refetch vendors list
                                await loadVendors();
                              } else {
                                await axios.put(`${API_BASE_URL}/orders/${order._id}/items/${item._id}/vendor`, { vendorId: null });
                                handleItemChange(index, 'vendor', null);
                              }
                            } catch (err) {
                              console.error('Failed to update vendor:', err);
                              setError(err.response?.data?.message || 'Failed to update vendor');
                            }
                          }}
                          renderInput={(params) => <TextField {...params} placeholder="Select vendor" />}
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleRemoveItem(index)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={loading}
          startIcon={<SaveIcon />}
        >
          {loading ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
