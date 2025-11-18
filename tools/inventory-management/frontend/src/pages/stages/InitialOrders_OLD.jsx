import { useState } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Button,
  Stack,
  Chip,
  Typography,
  IconButton,
  MenuItem,
  Checkbox,
  FormControl,
  InputLabel,
  Select,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Autocomplete,
  InputAdornment,
  Collapse,
  Alert,
} from '@mui/material';
import {
  Send as SendIcon,
  SwapVert as SwapVertIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE_URL, STATUS_COLORS } from '../../config';
import ManualOrderForm from '../../components/ManualOrderForm';

function InitialOrders() {
  // Calculate default date (2 days ago)
  const getDefaultStartDate = () => {
    const date = new Date();
    date.setDate(date.getDate() - 2);
    return date.toISOString().split('T')[0];
  };

  const [filters, setFilters] = useState({
    search: '',
    vendorId: '',
    vendorFilter: '',
    sortBy: 'createdAt',
    sortOrder: 'desc',
    startDate: getDefaultStartDate(),
    endDate: '',
    hideProcessed: true, // Hide processed orders by default
  });
  const [selectedItems, setSelectedItems] = useState([]);
  const [changeStageDialogOpen, setChangeStageDialogOpen] = useState(false);
  const [targetStage, setTargetStage] = useState('Hold');
  const [expandedRows, setExpandedRows] = useState({});
  const [vendorSearch, setVendorSearch] = useState('');
  const [showManualOrder, setShowManualOrder] = useState(false);

  const queryClient = useQueryClient();

  // Fetch orders
  const { data, isLoading, error } = useQuery(['orders', 'Initial', filters], async () => {
    const response = await axios.get(`${API_BASE_URL}/orders`, {
      params: {
        stage: 'Initial',
        ...filters
      }
    });
    return response.data;
  }, {
    keepPreviousData: true,
    staleTime: 10000
  });

  // Fetch vendors
  const { data: vendors } = useQuery(['vendors', vendorSearch], async () => {
    const response = await axios.get(`${API_BASE_URL}/vendors`, {
      params: { search: vendorSearch }
    });
    return response.data;
  });

  const bulkMapMutation = useMutation({
    mutationFn: async () => {
      const response = await axios.post(`${API_BASE_URL}/orders/bulk-map-vendors`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['orders']);
    },
  });

  const updateVendorMutation = useMutation({
    mutationFn: async ({ orderId, itemId, vendorId, vendorSearch }) => {
      const response = await axios.put(
        `${API_BASE_URL}/orders/${orderId}/items/${itemId}/vendor`,
        { vendorId, vendorSearch },
        { timeout: 10000 }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['orders']);
    },
    onError: (error) => {
      console.error('Error in vendor update mutation:', error);
      alert('Failed to update vendor: ' + error.message);
    },
    retry: 1,
    retryDelay: 1000
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ orderId, newStage }) => {
      const response = await axios.put(`${API_BASE_URL}/orders/${orderId}/stage`, {
        stage: newStage
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['orders']);
    },
    onError: (error) => {
      alert(error.message);
    }
  });

  const handleBulkMapVendors = async () => {
    if (window.confirm('Are you sure you want to bulk map vendors based on SKUs?')) {
      await bulkMapMutation.mutateAsync();
    }
  };

  const handleItemSelect = (orderId, itemId, isChecked) => {
    setSelectedItems(prev => {
      if (isChecked) {
        return [...prev, { orderId, itemId }];
      } else {
        return prev.filter(item => !(item.orderId === orderId && item.itemId === itemId));
      }
    });
  };

  const handleProcessSelected = async () => {
    if (selectedItems.length === 0) {
      alert('No items selected. Please select at least one item.');
      return;
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/orders/process-items`, {
        items: selectedItems
      });
      const result = response.data;
      alert(`Processed ${result.processedCount} item(s). Skipped ${result.skippedCount} item(s).`);
      setSelectedItems([]);
      queryClient.invalidateQueries(['orders']);
    } catch (error) {
      alert(`Error processing items: ${error.message}`);
    }
  };

  const toggleRowExpansion = (sku) => {
    setExpandedRows(prev => ({
      ...prev,
      [sku]: !prev[sku]
    }));
  };

  if (isLoading) {
    return <Box sx={{ p: 3 }}><Typography>Loading orders...</Typography></Box>;
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Error loading orders: {error.message}
        </Alert>
      </Box>
    );
  }

  const groupedOrders = data?.orders || [];
  const isGrouped = data?.isGrouped || false;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Initial Orders
        <Chip
          label={groupedOrders.length}
          color="primary"
          size="small"
          sx={{ ml: 2 }}
        />
      </Typography>

      {/* Info Alert */}
      {isGrouped && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Orders are grouped by SKU. Click the expand icon to see individual orders.
        </Alert>
      )}

      {/* First Row - Search and Actions */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }} alignItems="flex-start">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <TextField
            label="Search"
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            size="small"
            sx={{ minWidth: 200 }}
          />
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 250 }}>
          <TextField
            label="Search Vendors"
            value={vendorSearch}
            onChange={(e) => setVendorSearch(e.target.value)}
            size="small"
            fullWidth
          />
          <FormControl size="small" fullWidth>
            <InputLabel>Filter by Vendor</InputLabel>
            <Select
              value={filters.vendorFilter}
              onChange={(e) => setFilters(prev => ({ ...prev, vendorFilter: e.target.value }))}
              label="Filter by Vendor"
            >
              <MenuItem value="">All Vendors</MenuItem>
              {vendors?.map((vendor) => (
                <MenuItem key={vendor._id} value={vendor._id}>
                  {vendor.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Stack direction="row" spacing={2}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleBulkMapVendors}
          >
            BULK MAP VENDORS
          </Button>

          <Button
            variant="contained"
            color="secondary"
            onClick={() => setShowManualOrder(true)}
          >
            CREATE MANUAL ORDER
          </Button>

          <Button
            variant="outlined"
            color="primary"
            onClick={async () => {
              try {
                const response = await axios.get(`${API_BASE_URL}/orders/export`, {
                  params: { stage: 'Initial', ...filters },
                  responseType: 'blob'
                });
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `orders-initial-${new Date().toISOString().split('T')[0]}.csv`);
                document.body.appendChild(link);
                link.click();
                link.remove();
              } catch (error) {
                alert('Failed to export orders: ' + error.message);
              }
            }}
          >
            EXPORT ORDERS
          </Button>

          <Button
            variant="contained"
            color="success"
            startIcon={<SendIcon />}
            onClick={handleProcessSelected}
            disabled={selectedItems.length === 0}
          >
            PROCESS SELECTED ITEMS ({selectedItems.length})
          </Button>

          <Button
            variant="contained"
            color="warning"
            startIcon={<SwapVertIcon />}
            onClick={() => setChangeStageDialogOpen(true)}
            disabled={selectedItems.length === 0}
          >
            CHANGE STAGE ({selectedItems.length})
          </Button>
        </Stack>
      </Stack>

      {/* Second Row - Filters */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }} alignItems="center" flexWrap="wrap">
        <Box>
          <Typography variant="caption" display="block" sx={{ mb: 0.5 }}>
            Filter by Shopify Order Date
          </Typography>
          <TextField
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 150 }}
          />
        </Box>

        <Button
          variant="outlined"
          onClick={() => setFilters(prev => ({ ...prev, startDate: '', endDate: '' }))}
          size="small"
        >
          CLEAR DATE
        </Button>

        <Button
          variant="outlined"
          onClick={() => setFilters(prev => ({ 
            ...prev, 
            sortBy: 'productName',
            sortOrder: 'asc'
          }))}
          size="small"
        >
          SORT BY NAME A-Z
        </Button>

        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Filter by Vendor</InputLabel>
          <Select
            value={filters.vendorId}
            onChange={(e) => setFilters(prev => ({ ...prev, vendorId: e.target.value }))}
            label="Filter by Vendor"
          >
            <MenuItem value="">All Vendors</MenuItem>
            {vendors?.map((vendor) => (
              <MenuItem key={vendor._id} value={vendor._id}>
                {vendor.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button
          variant="outlined"
          color="error"
          onClick={() => setFilters({
            search: '',
            vendorId: '',
            vendorFilter: '',
            sortBy: 'createdAt',
            sortOrder: 'desc',
            startDate: getDefaultStartDate(),
            endDate: '',
            hideProcessed: true,
          })}
          size="small"
        >
          CLEAR ALL FILTERS
        </Button>
      </Stack>

      {/* Grouped orders table */}
      {isGrouped && groupedOrders.length > 0 ? (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell width={50}></TableCell>
                <TableCell><strong>SKU</strong></TableCell>
                <TableCell><strong>Product Name</strong></TableCell>
                <TableCell><strong>Received Qty</strong></TableCell>
                <TableCell><strong>Pack Qty</strong></TableCell>
                <TableCell><strong>Final Qty</strong></TableCell>
                <TableCell><strong>Vendor</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {groupedOrders.map((group) => (
                <>
                  <TableRow key={group.sku} hover>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() => toggleRowExpansion(group.sku)}
                      >
                        {expandedRows[group.sku] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {group.sku}
                      </Typography>
                      {group.isPack && (
                        <Chip label="PACK" size="small" color="warning" sx={{ mt: 0.5 }} />
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {group.productName}
                      </Typography>
                      {group.variantName && (
                        <Typography variant="caption" color="textSecondary">
                          {group.variantName}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={group.totalQuantity} 
                        color="info" 
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {group.isPack ? (
                        <Chip 
                          label={group.packQuantity > 0 ? group.packQuantity : 'Not Found'} 
                          color={group.packQuantity > 0 ? 'success' : 'error'}
                          size="small"
                        />
                      ) : (
                        <Typography variant="body2" color="textSecondary">-</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={group.finalQuantity} 
                        color="primary" 
                        size="small"
                      />
                      {group.isPack && group.packQuantity > 0 && (
                        <Typography variant="caption" display="block" color="textSecondary">
                          ({group.totalQuantity} × {group.packQuantity})
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {group.vendor ? (
                        <Chip label={group.vendor.name} size="small" />
                      ) : (
                        <Typography variant="body2" color="textSecondary">Not Assigned</Typography>
                      )}
                    </TableCell>
                  </TableRow>

                  {/* Expanded row showing individual orders */}
                  <TableRow>
                    <TableCell colSpan={7} style={{ paddingBottom: 0, paddingTop: 0 }}>
                      <Collapse in={expandedRows[group.sku]} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 2 }}>
                          <Typography variant="h6" gutterBottom component="div">
                            Order Details ({group.orders.length} orders)
                          </Typography>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell padding="checkbox">
                                  <Checkbox
                                    onChange={(e) => {
                                      const allOrderItems = group.orders.map(order => ({
                                        orderId: order.orderId,
                                        itemId: order.itemId
                                      }));
                                      if (e.target.checked) {
                                        setSelectedItems(prev => [...prev, ...allOrderItems]);
                                      } else {
                                        setSelectedItems(prev => 
                                          prev.filter(item => 
                                            !allOrderItems.some(oi => 
                                              oi.orderId === item.orderId && oi.itemId === item.itemId
                                            )
                                          )
                                        );
                                      }
                                    }}
                                  />
                                </TableCell>
                                <TableCell>Order Name</TableCell>
                                <TableCell>Customer</TableCell>
                                <TableCell>Quantity</TableCell>
                                <TableCell>Assign Vendor</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {group.orders.map((order) => (
                                <TableRow key={`${order.orderId}-${order.itemId}`}>
                                  <TableCell padding="checkbox">
                                    <Checkbox
                                      checked={selectedItems.some(
                                        item => item.orderId === order.orderId && item.itemId === order.itemId
                                      )}
                                      onChange={(e) => handleItemSelect(order.orderId, order.itemId, e.target.checked)}
                                    />
                                  </TableCell>
                                  <TableCell>{order.orderName}</TableCell>
                                  <TableCell>{order.customerName}</TableCell>
                                  <TableCell>{order.quantity}</TableCell>
                                  <TableCell>
                                    <Autocomplete
                                      size="small"
                                      options={vendors || []}
                                      getOptionLabel={(option) => option.name || ''}
                                      value={vendors?.find(v => v._id === group.vendor?._id) || null}
                                      onChange={(e, newValue) => {
                                        if (newValue) {
                                          updateVendorMutation.mutate({
                                            orderId: order.orderId,
                                            itemId: order.itemId,
                                            vendorId: newValue._id
                                          });
                                        }
                                      }}
                                      freeSolo
                                      renderInput={(params) => (
                                        <TextField
                                          {...params}
                                          label="Vendor"
                                          variant="outlined"
                                          InputProps={{
                                            ...params.InputProps,
                                            endAdornment: (
                                              <>
                                                {params.InputProps.endAdornment}
                                                <InputAdornment position="end">
                                                  <Button
                                                    variant="contained"
                                                    size="small"
                                                    color="secondary"
                                                    onClick={() => {
                                                      const input = document.querySelector(
                                                        `#vendor-search-${order.orderId}-${order.itemId}`
                                                      );
                                                      if (input && input.value) {
                                                        updateVendorMutation.mutate({
                                                          orderId: order.orderId,
                                                          itemId: order.itemId,
                                                          vendorSearch: input.value
                                                        });
                                                      }
                                                    }}
                                                    sx={{ height: 30, ml: 1 }}
                                                  >
                                                    Assign
                                                  </Button>
                                                </InputAdornment>
                                              </>
                                            )
                                          }}
                                          id={`vendor-search-${order.orderId}-${order.itemId}`}
                                        />
                                      )}
                                      sx={{ minWidth: 300 }}
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h6" color="textSecondary">
            No orders found in Initial stage
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
            Orders will appear here once they are fetched from Shopify
          </Typography>
        </Box>
      )}

      {/* Change Stage Dialog */}
      <Dialog open={changeStageDialogOpen} onClose={() => setChangeStageDialogOpen(false)}>
        <DialogTitle>Change Stage for Selected Items</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2, minWidth: 200 }}>
            <InputLabel>Target Stage</InputLabel>
            <Select
              value={targetStage}
              onChange={(e) => setTargetStage(e.target.value)}
              label="Target Stage"
            >
              <MenuItem value="Hold">Hold</MenuItem>
              <MenuItem value="In-Stock">In-Stock</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChangeStageDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={async () => {
              try {
                if (selectedItems.length === 0) {
                  alert('No items selected.');
                  return;
                }

                const orderIds = [...new Set(selectedItems.map(item => item.orderId))];
                const errors = [];

                for (const orderId of orderIds) {
                  try {
                    await updateStageMutation.mutateAsync({ orderId, newStage: targetStage });
                  } catch (err) {
                    console.error(`Error moving order ${orderId}:`, err);
                    errors.push(`Order ${orderId}: ${err.message}`);
                  }
                }

                if (errors.length > 0) {
                  alert(`Moved some items but encountered ${errors.length} errors.`);
                } else {
                  alert(`Successfully moved ${selectedItems.length} items to ${targetStage} stage`);
                }

                setSelectedItems([]);
                setChangeStageDialogOpen(false);
              } catch (error) {
                alert(`Error changing stage: ${error.message}`);
              }
            }}
          >
            Move to {targetStage}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Manual Order Form */}
      {showManualOrder && (
        <ManualOrderForm
          open={showManualOrder}
          onClose={() => setShowManualOrder(false)}
        />
      )}
    </Box>
  );
}

export default InitialOrders;
