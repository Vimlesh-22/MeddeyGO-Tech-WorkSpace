import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  MenuItem,
  Stack,
  InputAdornment,
  Typography,
  Autocomplete,
  CircularProgress,
  Tabs,
  Tab,
  Chip,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Search as SearchIcon, Store as StoreIcon } from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE_URL } from '../config';

function ManualOrderForm({ open, onClose }) {
  const [orderData, setOrderData] = useState({
    orderName: `MO-${Date.now().toString().slice(-6)}`,
    items: [{ sku: '', productName: '', quantity: 1, productId: null }],
    paymentStatus: 'Pending',
    fulfillmentStatus: 'Unfulfilled',
  });
  const [productSearch, setProductSearch] = useState('');
  const [submitError, setSubmitError] = useState(null);
  const [shopifySearch, setShopifySearch] = useState('');
  const [shopifyResults, setShopifyResults] = useState([]);
  const [shopifyLoading, setShopifyLoading] = useState(false);
  const [searchMode, setSearchMode] = useState('local');
  const [combinedSearch, setCombinedSearch] = useState('');

  const queryClient = useQueryClient();

  // Get all products with optional search - fetch up to 1000 products
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['products', productSearch],
    queryFn: async () => {
      console.log('[ManualOrderForm] Fetching products with search:', productSearch);
      const response = await axios.get(`${API_BASE_URL}/products`, {
        params: { 
          search: productSearch || undefined,
          limit: 1000
        }
      });
      console.log('[ManualOrderForm] Fetched products:', response.data?.length || 0);
      return response.data;
    },
    placeholderData: (previousData) => previousData,
    enabled: open,
    staleTime: 30000,
  });

  const createOrderMutation = useMutation({
    mutationFn: async (data) => {
      const response = await axios.post(`${API_BASE_URL}/orders/manual`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.refetchQueries({ queryKey: ['orders'] });
      setSubmitError(null);
      onClose();
    },
    onError: (error) => {
      const message = error?.response?.data?.message || error.message || 'Failed to create manual order';
      setSubmitError(message);
    },
  });

  const isSubmitting = createOrderMutation.isLoading;

  const handleClose = () => {
      setSubmitError(null);
      setProductSearch(''); // Clear search on close
      setShopifySearch('');
      setShopifyResults([]);
      setSearchMode('local');
      onClose();
  };

  // Reset order data when dialog opens
  useEffect(() => {
    if (open) {
      setOrderData({
        orderName: `MO-${Date.now().toString().slice(-6)}`,
        items: [{ sku: '', productName: '', quantity: 1, productId: null }],
        paymentStatus: 'Pending',
        fulfillmentStatus: 'Unfulfilled',
      });
      setSubmitError(null);
      setProductSearch('');
      setShopifySearch('');
      setShopifyResults([]);
      setSearchMode('local');
    }
  }, [open]);

  const handleAddItem = () => {
    setOrderData({
      ...orderData,
      items: [...orderData.items, { sku: '', productName: '', quantity: 1 }],
    });
  };

  const handleRemoveItem = (index) => {
    const items = orderData.items.filter((_, i) => i !== index);
    setOrderData({ ...orderData, items });
  };

  const handleItemChange = (index, field, value) => {
  const items = [...orderData.items];
    items[index] = { ...items[index], [field]: value };

    // If SKU is changed, try to find product details
    if (field === 'sku') {
      const product = products?.find(p => p.sku === value);
      if (product) {
        items[index].productName = product.name;
        items[index].productId = product._id;
      }
    }

    // If productId is selected, populate other fields
    if (field === 'productId') {
      const product = products?.find(p => p._id === value);
      if (product) {
        items[index].productName = product.name;
        items[index].sku = product.sku;
      }
    }

    setOrderData({ ...orderData, items });
  };

  // Shopify all stores search handler
  const handleShopifySearch = async (searchTerm) => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      setShopifyResults([]);
      return;
    }

    setShopifyLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/products/shopify-search-all`, {
        params: { search: searchTerm.trim() }
      });
      setShopifyResults(response.data?.results || []);
    } catch (error) {
      console.error('Error searching Shopify stores:', error);
      setShopifyResults([]);
    } finally {
      setShopifyLoading(false);
    }
  };

  useEffect(() => {
    if ((searchMode === 'shopify' || searchMode === 'combined') && (shopifySearch || combinedSearch)) {
      const timeoutId = setTimeout(() => {
        handleShopifySearch(searchMode === 'combined' ? combinedSearch : shopifySearch);
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setShopifyResults([]);
    }
  }, [shopifySearch, combinedSearch, searchMode]);

  const dedupeSku = (list) => {
    const seen = new Set();
    const out = [];
    for (const it of list) {
      const key = (it.sku || '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(it);
    }
    return out;
  };

  const addSkuIfNotExists = (sku, name) => {
    const exists = orderData.items.some(i => String(i.sku).trim().toLowerCase() === String(sku || '').trim().toLowerCase());
    if (exists) return;
    setOrderData({
      ...orderData,
      items: [...orderData.items, { sku: sku || '', productName: name || '', quantity: 1, productId: null }]
    });
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    try {
      await createOrderMutation.mutateAsync({
        ...orderData,
        isManual: true,
      });
    } catch (error) {
      // Error handled via onError callback
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Create Manual Order</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          <TextField
            label="Order Name"
            value={orderData.orderName}
            onChange={(e) => setOrderData({ ...orderData, orderName: e.target.value })}
            fullWidth
            required
            sx={{ mb: 2 }}
          />

          {submitError && (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              {submitError}
            </Typography>
          )}

          <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
            <TextField
              select
              label="Payment Status"
              value={orderData.paymentStatus}
              onChange={(e) => setOrderData({ ...orderData, paymentStatus: e.target.value })}
              fullWidth
            >
              {['Pending', 'Paid', 'Failed', 'Refunded'].map((status) => (
                <MenuItem key={status} value={status}>
                  {status}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Fulfillment Status"
              value={orderData.fulfillmentStatus}
              onChange={(e) => setOrderData({ ...orderData, fulfillmentStatus: e.target.value })}
              fullWidth
            >
              {['Unfulfilled', 'Partially Fulfilled', 'Fulfilled', 'Cancelled'].map((status) => (
                <MenuItem key={status} value={status}>
                  {status}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          {/* Search Mode Tabs */}
          <Box sx={{ mb: 2 }}>
              <Tabs 
                value={searchMode} 
                onChange={(e, newValue) => {
                  setSearchMode(newValue);
                  if (newValue === 'local') {
                    setShopifySearch('');
                    setShopifyResults([]);
                  } else {
                    setProductSearch('');
                  }
                }}
                sx={{ mb: 2 }}
              >
                <Tab label="Local Products" value="local" icon={<SearchIcon />} iconPosition="start" />
                <Tab label="Shopify All Stores" value="shopify" icon={<StoreIcon />} iconPosition="start" />
                <Tab label="Combined" value="combined" icon={<StoreIcon />} iconPosition="start" />
              </Tabs>

            {searchMode === 'local' ? (
              <TextField
                label="Search Products (Filter List)"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                fullWidth
                size="small"
                placeholder="Search by name or SKU to filter the list below"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                  endAdornment: productsLoading && (
                    <InputAdornment position="end">
                      <CircularProgress size={20} />
                    </InputAdornment>
                  ),
                }}
                helperText={`${products?.length || 0} products loaded. Type to filter.`}
              />
            ) : searchMode === 'shopify' ? (
              <Box>
                <TextField
                  label="Search All Shopify Stores"
                  value={shopifySearch}
                  onChange={(e) => setShopifySearch(e.target.value)}
                  fullWidth
                  size="small"
                  placeholder="Enter SKU or product name to search across all stores"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <StoreIcon />
                      </InputAdornment>
                    ),
                    endAdornment: shopifyLoading && (
                      <InputAdornment position="end">
                        <CircularProgress size={20} />
                      </InputAdornment>
                    ),
                  }}
                  helperText={shopifyResults.length > 0 ? `${shopifyResults.length} products found across all stores` : 'Type to search (min 2 characters)'}
                />
                
                {/* Shopify Search Results */}
                {shopifyResults.length > 0 && (
                  <Paper sx={{ mt: 2, maxHeight: 300, overflow: 'auto' }}>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Store</TableCell>
                            <TableCell>SKU</TableCell>
                            <TableCell>Product Name</TableCell>
                            <TableCell>Price</TableCell>
                            <TableCell>Action</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {shopifyResults.map((result, idx) => (
                            <TableRow key={`${result.storeId}-${result.productId}-${result.sku}-${idx}`}>
                              <TableCell>
                                <Chip label={result.storeName} size="small" color="primary" />
                              </TableCell>
                              <TableCell>{result.sku || 'N/A'}</TableCell>
                              <TableCell>{result.productTitle}</TableCell>
                              <TableCell>{result.price ? `₹${result.price}` : 'N/A'}</TableCell>
                              <TableCell>
                                <Button size="small" onClick={() => addSkuIfNotExists(result.sku, result.productTitle)}>
                                  Add
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                )}
              </Box>
            ) : (
              <Box>
                <TextField
                  label="Search Combined"
                  value={combinedSearch}
                  onChange={(e) => setCombinedSearch(e.target.value)}
                  fullWidth
                  size="small"
                  placeholder="Search across local and all Shopify stores"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    ),
                    endAdornment: shopifyLoading && (
                      <InputAdornment position="end">
                        <CircularProgress size={20} />
                      </InputAdornment>
                    ),
                  }}
                  helperText={`${(products || []).length} local loaded • ${shopifyResults.length} Shopify results`}
                />
                {(() => {
                  const localMatches = (products || []).filter(p => {
                    const q = combinedSearch.trim().toLowerCase();
                    if (!q) return false;
                    return (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q);
                  }).map(p => ({ source: 'local', sku: p.sku, productTitle: p.name }));
                  const shopifyMatches = shopifyResults.map(r => ({ source: 'shopify', sku: r.sku, productTitle: r.productTitle }));
                  const combined = dedupeSku([...localMatches, ...shopifyMatches]);
                  return combined.length > 0 ? (
                    <Paper sx={{ mt: 2, maxHeight: 300, overflow: 'auto' }}>
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Source</TableCell>
                              <TableCell>SKU</TableCell>
                              <TableCell>Product Name</TableCell>
                              <TableCell>Action</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {combined.map((result, idx) => (
                              <TableRow key={`${result.source}-${result.sku}-${idx}`}>
                                <TableCell><Chip label={result.source} size="small" /></TableCell>
                                <TableCell>{result.sku || 'N/A'}</TableCell>
                                <TableCell>{result.productTitle}</TableCell>
                                <TableCell>
                                  <Button size="small" onClick={() => addSkuIfNotExists(result.sku, result.productTitle)}>Add</Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Paper>
                  ) : null;
                })()}
              </Box>
            )}
          </Box>

          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell width="20%">Product</TableCell>
                  <TableCell width="10%">SKU</TableCell>
                  <TableCell width="50%">Product Name</TableCell>
                  <TableCell width="10%">Quantity</TableCell>
                  <TableCell width="10%">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orderData.items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      {/* Product Autocomplete - Better UX for large product lists */}
                      <Autocomplete
                        value={products?.find(p => p._id === item.productId) || null}
                        onChange={(event, newValue) => {
                          if (newValue) {
                            handleItemChange(index, 'productId', newValue._id);
                          }
                        }}
                        options={products || []}
                        getOptionLabel={(option) => `${option.name} (${option.sku})`}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Select Product"
                            size="small"
                            placeholder="Choose from list"
                            InputProps={{
                              ...params.InputProps,
                              endAdornment: (
                                <>
                                  {productsLoading ? <CircularProgress color="inherit" size={20} /> : null}
                                  {params.InputProps.endAdornment}
                                </>
                              ),
                            }}
                          />
                        )}
                        renderOption={(props, option) => (
                          <li {...props} key={option._id}>
                            <Box>
                              <Typography variant="body2">{option.name}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                SKU: {option.sku} {option.vendor?.name ? `• ${option.vendor.name}` : ''}
                              </Typography>
                            </Box>
                          </li>
                        )}
                        isOptionEqualToValue={(option, value) => option._id === value._id}
                        size="small"
                        fullWidth
                        loading={productsLoading}
                        noOptionsText={productsLoading ? "Loading products..." : "No products found"}
                      />
                    </TableCell>
                    <TableCell>
                      {/* Original SKU dropdown for backward compatibility */}
                      <TextField
                        value={item.sku}
                        onChange={(e) => handleItemChange(index, 'sku', e.target.value)}
                        fullWidth
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        value={item.productName}
                        onChange={(e) => handleItemChange(index, 'productName', e.target.value)}
                        fullWidth
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 1)}
                        size="small"
                        inputProps={{ min: 1 }}
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveItem(index)}
                        disabled={orderData.items.length === 1}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Button
            startIcon={<AddIcon />}
            onClick={handleAddItem}
            sx={{ mt: 2, height: 40, minWidth: 120 }}
          >
            Add Item
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button 
          onClick={handleClose}
          sx={{ height: 40, minWidth: 80 }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="primary"
          disabled={
            isSubmitting ||
            !orderData.orderName ||
            orderData.items.some(item => !item.sku)
          }
          sx={{ height: 40, minWidth: 120 }}
        >
          {isSubmitting ? 'Creating...' : 'Create Order'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ManualOrderForm;
