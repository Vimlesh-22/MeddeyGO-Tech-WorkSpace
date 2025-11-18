import { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Stack,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  IconButton,
  CircularProgress,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '../utils/notify';
import axios from 'axios';

import OrderDetail from '../components/OrderDetail';
import VendorMapping from '../components/VendorMapping';
import StageBoard from '../components/StageBoard';
import ProductImport from '../components/ProductImport';
import ManualOrderForm from '../components/ManualOrderForm';
import { API_BASE_URL } from '../config';

function Orders() {
  const [filters, setFilters] = useState({
    search: '',
  });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [mappingOrder, setMappingOrder] = useState(null);
  const [showProductImport, setShowProductImport] = useState(false);
  const [showManualOrder, setShowManualOrder] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');  // 'success' or 'error'
  const [notificationDialog, setNotificationDialog] = useState({ open: false, title: '', message: '', isLoading: false });
  
  const queryClient = useQueryClient();

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders', filters],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE_URL}/orders`, {
        params: filters,
      });
      return response.data;
    }
  });

  const fetchShopifyOrdersMutation = useMutation({
    mutationFn: async () => {
      const response = await axios.post(`${API_BASE_URL}/orders/fetch-shopify`);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      // Show success notification with count of imported orders
      const importedCount = data.orders.length;
      const failedCount = data.failedOrders?.count || 0;
      let messageText = `Successfully imported ${importedCount} orders from Shopify.`;
      if (failedCount > 0) {
        messageText += ` (${failedCount} orders had validation issues but were skipped)`;
      }
      setNotificationDialog({ open: true, title: 'Success', message: messageText, isLoading: false });
    },
    onError: (error) => {
      console.error('Error fetching Shopify orders:', error);
      // Show a more user-friendly error message
      setNotificationDialog({ open: true, title: 'Error', message: `Error fetching orders from Shopify: ${error.response?.data?.message || error.message}`, isLoading: false });
    }
  });

  const generatePdfMutation = useMutation({
    mutationFn: async ({ vendorId, orderIds }) => {
      const response = await axios.post(
        `${API_BASE_URL}/orders/generate-pdf`,
        { vendorId, orderIds },
        { responseType: 'blob' }
      );
      return response.data;
    }
  });

  const handleFilterChange = (event) => {
    setFilters({
      ...filters,
      [event.target.name]: event.target.value,
    });
  };

  // Mutation for fetching orders from all Shopify stores
  const fetchAllShopifyOrdersMutation = useMutation({
    mutationFn: async () => {
      const response = await axios.post(`${API_BASE_URL}/orders/fetch-all-shopify`);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      // Calculate total orders processed
      const totalProcessed = data.results.reduce((sum, store) => sum + store.processed, 0);
      const totalFailed = data.results.reduce((sum, store) => sum + store.failed, 0);
      
      let messageText = `Successfully imported ${totalProcessed} orders from ${data.results.length} Shopify stores.`;
      if (totalFailed > 0) {
        messageText += ` (${totalFailed} orders had validation issues but were skipped)`;
      }
      setNotificationDialog({ open: true, title: 'Success', message: messageText, isLoading: false });
    },
    onError: (error) => {
      console.error('Error fetching all Shopify orders:', error);
      setNotificationDialog({ open: true, title: 'Error', message: `Error fetching orders from all Shopify stores: ${error.response?.data?.message || error.message}`, isLoading: false });
    }
  });

  const handleFetchOrders = () => {
    setNotificationDialog({ open: true, title: 'Fetching Orders', message: 'Fetching orders from Shopify...', isLoading: true });
    fetchShopifyOrdersMutation.mutate();
  };

  const handleFetchAllOrders = () => {
    setNotificationDialog({ open: true, title: 'Fetching Orders', message: 'Fetching orders from all Shopify stores...', isLoading: true });
    fetchAllShopifyOrdersMutation.mutate();
  };

  const handleGeneratePdf = async (vendorId, orderIds) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/orders/generate-pdf`,
        { vendorId, orderIds },
        { responseType: 'blob' }
      );
      
      // Validate response
      if (!response.data || response.data.size < 100) {
        // Check if it's an error response (JSON)
        const checkError = () => {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const text = reader.result;
                const json = JSON.parse(text);
                notify(json.error || 'PDF generation failed', 'error');
              } catch {
                notify('Generated PDF is too small or invalid', 'warning');
              }
              resolve();
            };
            reader.onerror = () => {
              notify('Error reading response', 'error');
              resolve();
            };
            reader.readAsText(response.data);
          });
        };
        await checkError();
        return;
      }
      
      // Check Content-Type
      const contentType = response.headers['content-type'] || '';
      if (!contentType.includes('application/pdf') && !contentType.includes('pdf')) {
        // Might be an error response
        const checkError = () => {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const text = reader.result;
                const json = JSON.parse(text);
                notify(json.error || 'Unknown response type', 'error');
              } catch {
              notify('Invalid response from server', 'error');
              }
              resolve();
            };
            reader.onerror = () => {
              notify('Error reading response', 'error');
              resolve();
            };
            reader.readAsText(response.data);
          });
        };
        await checkError();
        return;
      }
      
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `vendor-orders-${vendorId}.pdf`);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        link.remove();
      }, 100);
    } catch (error) {
      console.error('PDF generation error:', error);
      notify('Failed to generate PDF: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField
          label="Search"
          name="search"
          value={filters.search}
          onChange={handleFilterChange}
          sx={{ minWidth: 200 }}
        />
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleFetchOrders}
            disabled={fetchShopifyOrdersMutation.isLoading || fetchAllShopifyOrdersMutation.isLoading}
          >
            {fetchShopifyOrdersMutation.isLoading ? 'Fetching...' : 'Fetch Shopify Orders'}
          </Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleFetchAllOrders}
            disabled={fetchShopifyOrdersMutation.isLoading || fetchAllShopifyOrdersMutation.isLoading}
          >
            {fetchAllShopifyOrdersMutation.isLoading ? 'Fetching...' : 'Fetch All Stores'}
          </Button>
        </Stack>
        <Button
          variant="outlined"
          color="primary"
          onClick={() => setShowProductImport(true)}
        >
          Import Products
        </Button>
        <Button
          variant="outlined"
          color="primary"
          onClick={() => setShowManualOrder(true)}
        >
          Create Manual Order
        </Button>
        <Button
          variant="outlined"
          color="primary"
          onClick={async () => {
            const response = await axios.get(`${API_BASE_URL}/orders/export`, {
              params: filters,
              responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `orders-${new Date().toISOString().split('T')[0]}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
          }}
        >
          Export Orders
        </Button>
      </Stack>

      <StageBoard
        orders={orders || []}
        onViewOrder={setSelectedOrder}
        onMapVendors={setMappingOrder}
        onGeneratePdf={handleGeneratePdf}
      />

      {selectedOrder && (
        <OrderDetail
          open={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          order={selectedOrder}
        />
      )}

      {mappingOrder && (
        <VendorMapping
          open={!!mappingOrder}
          onClose={() => setMappingOrder(null)}
          orderId={mappingOrder._id}
          items={mappingOrder.items}
        />
      )}

      {showProductImport && (
        <ProductImport
          open={showProductImport}
          onClose={() => setShowProductImport(false)}
        />
      )}

      {showManualOrder && (
        <ManualOrderForm
          open={showManualOrder}
          onClose={() => setShowManualOrder(false)}
        />
      )}
    </Box>
  );
}

export default Orders;
