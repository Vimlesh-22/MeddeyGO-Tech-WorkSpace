import React, { useState, useEffect } from 'react';
import { Container, Grid, Paper, Typography, Box } from '@mui/material';
import axios from 'axios';
import { getApiBaseUrlDynamic } from '../config';
import PendingOrderItems from '../components/PendingOrderItems';

const PendingOrdersPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const apiBaseUrl = getApiBaseUrlDynamic();
      const response = await axios.get(`${apiBaseUrl}/orders`, {
        params: {
          stage: 'Pending',
          limit: 100
        }
      });
      setOrders(response.data.orders || []);
    } catch (error) {
      console.error('Error fetching pending orders:', error);
      alert('Error fetching orders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Handler for when an item is updated
  const handleItemUpdated = () => {
    fetchOrders(); // Refresh orders when an item is updated
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" component="h1">
          Pending Orders
        </Typography>
      </Box>

      {loading ? (
        <Typography>Loading orders...</Typography>
      ) : orders.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography>No pending orders found</Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {orders.map((order) => (
            <Grid item xs={12} key={order._id}>
              <Paper sx={{ p: 2 }}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="h6">
                    Order: {order.orderName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Customer: {order.customerName || 'N/A'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Date: {new Date(order.createdAt).toLocaleDateString()}
                  </Typography>
                </Box>
                <PendingOrderItems 
                  order={order} 
                  onItemUpdated={handleItemUpdated}
                />
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}
    </Container>
  );
};

export default PendingOrdersPage;
