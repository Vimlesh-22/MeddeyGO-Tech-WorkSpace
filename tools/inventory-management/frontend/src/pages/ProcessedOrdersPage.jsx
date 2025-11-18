import React, { useState, useEffect } from 'react';
import { Container, Grid, Paper, Typography, Box, Checkbox, Button, ToggleButton, ToggleButtonGroup, IconButton, Tooltip } from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import axios from 'axios';
import ProcessedOrdersToolbar from '../components/ProcessedOrdersToolbar';
import { getApiBaseUrlDynamic } from '../config';

const ProcessedOrdersPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [viewMode, setViewMode] = useState('recent'); // 'recent' or 'all'

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const apiBaseUrl = getApiBaseUrlDynamic();
      const response = await axios.get(`${apiBaseUrl}/orders`, {
        params: {
          stage: 'Processed',
          recentlyMoved: viewMode === 'recent' ? 24 : undefined, // Show only orders moved to Processed in last 24 hours if in recent mode
          limit: 100
        }
      });
      setOrders(response.data.orders || []);
    } catch (error) {
      console.error('Error fetching processed orders:', error);
      alert('Error fetching orders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [viewMode]);

  const handleOrderSelection = (orderId) => {
    setSelectedOrderIds(prev => {
      if (prev.includes(orderId)) {
        return prev.filter(id => id !== orderId);
      } else {
        return [...prev, orderId];
      }
    });
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allIds = orders.map(order => order._id);
      setSelectedOrderIds(allIds);
    } else {
      setSelectedOrderIds([]);
    }
  };

  const handleViewModeChange = (event, newMode) => {
    if (newMode !== null) {
      setViewMode(newMode);
    }
  };

  const handleRefresh = () => {
    fetchOrders();
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <ProcessedOrdersToolbar 
        selectedOrderIds={selectedOrderIds}
        onOrdersUpdated={fetchOrders}
      />

      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5" component="h1">
          Processed Orders ({viewMode === 'recent' ? 'Recently Moved' : 'All'})
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={handleViewModeChange}
            aria-label="view mode"
          >
            <ToggleButton value="recent" aria-label="recently moved">
              Recent (24h)
            </ToggleButton>
            <ToggleButton value="all" aria-label="all processed">
              All
            </ToggleButton>
          </ToggleButtonGroup>
          <Tooltip title="Refresh orders">
            <IconButton onClick={handleRefresh} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {loading ? (
        <Typography>Loading orders...</Typography>
      ) : orders.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography>No processed orders found</Typography>
        </Paper>
      ) : (
        <>
          <Box sx={{ mb: 2 }}>
            <Checkbox 
              checked={selectedOrderIds.length === orders.length && orders.length > 0}
              indeterminate={selectedOrderIds.length > 0 && selectedOrderIds.length < orders.length}
              onChange={handleSelectAll}
            />
            <Typography component="span">
              Select All ({selectedOrderIds.length}/{orders.length})
            </Typography>
          </Box>
          
          <Grid container spacing={3}>
            {orders.map((order) => (
              <Grid item xs={12} key={order._id}>
                <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Checkbox
                      checked={selectedOrderIds.includes(order._id)}
                      onChange={() => handleOrderSelection(order._id)}
                    />
                    <Typography variant="h6" component="div">
                      Order: {order.shopifyOrderName || order.orderName || `#${String(order._id).slice(-6)}`}
                    </Typography>
                  </Box>
                  
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body1">
                      <strong>Customer:</strong> {order.customerName || 'N/A'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Items:</strong> {order.items.length}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Date:</strong> {new Date(order.processedAt || order.createdAt).toLocaleDateString()}
                    </Typography>
                    {/* Inline item quantity editor */}
                    {order.items?.length > 0 && (
                      <Box sx={{ mt: 1 }}>
                        {order.items.map((it, idx) => (
                          <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                            <Typography variant="body2" sx={{ minWidth: 160 }}>{it.sku} — {it.productName}</Typography>
                            <Typography variant="body2">Qty: {it.quantity}</Typography>
                            <Button size="small" variant="outlined" onClick={async () => {
                              const updated = { ...order, items: order.items.map((x, i) => i === idx ? { ...x, quantity: (x.quantity || 0) + 1 } : x) };
                              try {
                                await axios.put(`${getApiBaseUrlDynamic()}/orders/${order._id}`, updated);
                                fetchOrders();
                              } catch (e) {
                                alert(e.response?.data?.message || e.message);
                              }
                            }}>+1</Button>
                            <Button size="small" variant="outlined" onClick={async () => {
                              const nextQty = Math.max(0, (it.quantity || 0) - 1);
                              const updated = { ...order, items: order.items.map((x, i) => i === idx ? { ...x, quantity: nextQty } : x) };
                              try {
                                await axios.put(`${getApiBaseUrlDynamic()}/orders/${order._id}`, updated);
                                fetchOrders();
                              } catch (e) {
                                alert(e.response?.data?.message || e.message);
                              }
                            }}>-1</Button>
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Box>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </>
      )}
    </Container>
  );
};

export default ProcessedOrdersPage;
