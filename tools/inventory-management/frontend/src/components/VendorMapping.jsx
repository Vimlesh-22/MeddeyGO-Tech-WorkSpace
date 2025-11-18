import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Box,
  Typography,
  Snackbar,
  Alert,
  InputAdornment,
} from '@mui/material';
import { Delete as DeleteIcon, Search as SearchIcon } from '@mui/icons-material';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE_URL } from '../config';

function VendorMapping({ open, onClose, orderId, items }) {
  const [itemVendors, setItemVendors] = useState({});
  const [newVendorName, setNewVendorName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const queryClient = useQueryClient();

  const { data: vendors } = useQuery({
    queryKey: ['vendors', searchQuery],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE_URL}/vendors`, {
        params: { search: searchQuery }
      });
      return response.data;
    }
  });

  const createVendorMutation = useMutation({
    mutationFn: async (vendorData) => {
      const response = await axios.post(`${API_BASE_URL}/vendors`, vendorData);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setNewVendorName('');
      setSnackbar({ open: true, message: 'Vendor created successfully', severity: 'success' });
    },
    onError: (error) => {
      setSnackbar({ open: true, message: `Error creating vendor: ${error.message}`, severity: 'error' });
    }
  });

  const mapSkuMutation = useMutation({
    mutationFn: async ({ vendorId, sku }) => {
      const response = await axios.post(
        `${API_BASE_URL}/vendors/${vendorId}/map-sku`,
        { sku }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setSnackbar({ open: true, message: 'SKU mapped to vendor successfully', severity: 'success' });
    },
    onError: (error) => {
      setSnackbar({ open: true, message: `Error mapping SKU: ${error.message}`, severity: 'error' });
    }
  });

  const handleCreateVendor = async () => {
    if (newVendorName.trim()) {
      await createVendorMutation.mutateAsync({
        name: newVendorName,
        skuMappings: []
      });
    }
  };

  const handleMapSku = async (sku, itemId) => {
    if (itemVendors[itemId]) {
      await mapSkuMutation.mutateAsync({
        vendorId: itemVendors[itemId],
        sku
      });
    }
  };

  // New function to handle searching and selecting vendors
  const updateItemVendorMutation = useMutation({
    mutationFn: async ({ orderId, itemId, vendorId, vendorSearch }) => {
      const response = await axios.put(
        `${API_BASE_URL}/orders/${orderId}/items/${itemId}/vendor`,
        { vendorId, vendorSearch }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setSnackbar({ open: true, message: 'Vendor assigned successfully', severity: 'success' });
    },
    onError: (error) => {
      setSnackbar({ open: true, message: `Error assigning vendor: ${error.message}`, severity: 'error' });
    }
  });
  
  const handleVendorChange = (itemId, vendorId) => {
    setItemVendors(prev => ({
      ...prev,
      [itemId]: vendorId
    }));
  };

  // Filter vendors based on search query
  const filteredVendors = vendors?.filter(vendor => {
    const n = typeof vendor?.name === 'string' ? vendor.name : '';
    return n.toLowerCase().includes(searchQuery.toLowerCase());
  }) || [];
  const sortedFilteredVendors = filteredVendors.slice().sort((a,b)=>{
    const an = (a?.name||'').toString();
    const bn = (b?.name||'').toString();
    return an.localeCompare(bn);
  });

  const handleCloseSnackbar = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Map Items to Vendors</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            Add New Vendor
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              value={newVendorName}
              onChange={(e) => setNewVendorName(e.target.value)}
              label="Vendor Name"
              size="small"
              fullWidth
            />
            <Button
              variant="contained"
              onClick={handleCreateVendor}
              disabled={!newVendorName.trim()}
              sx={{ height: 40, minWidth: 80 }}
            >
              Add
            </Button>
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <TextField
            fullWidth
            label="Search Vendors"
            variant="outlined"
            size="small"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        <List>
          {items?.map((item) => (
            <ListItem
              key={item._id}
              secondaryAction={
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexDirection: 'column' }}>
                  <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
                    <TextField
                      select
                      size="small"
                      label="Select Vendor"
                      value={itemVendors[item._id] || ''}
                      onChange={(e) => handleVendorChange(item._id, e.target.value)}
                      SelectProps={{
                        native: true,
                      }}
                      sx={{ minWidth: 200 }}
                    >
                      <option value="">Select Vendor</option>
                      {sortedFilteredVendors.map((vendor) => (
                        <option key={vendor._id} value={vendor._id}>
                          {vendor.name}
                        </option>
                      ))}
                    </TextField>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => handleMapSku(item.sku, item._id)}
                      disabled={!itemVendors[item._id]}
                      sx={{ height: 40, minWidth: 60 }}
                    >
                      Map
                    </Button>
                  </Box>
                  
                  {/* New vendor search feature */}
                  <Box sx={{ display: 'flex', gap: 1, width: '100%', mt: 1 }}>
                    <TextField
                      size="small"
                      label="Search Vendor by Name"
                      placeholder="Type vendor name"
                      sx={{ minWidth: 200 }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon fontSize="small" />
                          </InputAdornment>
                        ),
                      }}
                      id={`vendor-search-${item._id}`}
                    />
                    <Button
                      variant="contained"
                      size="small"
                      color="secondary"
                      onClick={() => {
                        const searchValue = document.getElementById(`vendor-search-${item._id}`).value;
                        if (searchValue) {
                          updateItemVendorMutation.mutate({
                            orderId,
                            itemId: item._id,
                            vendorSearch: searchValue
                          });
                        }
                      }}
                      sx={{ height: 40, minWidth: 60 }}
                    >
                      Assign
                    </Button>
                  </Box>
                </Box>
              }
            >
              <ListItemText
                primary={item.productName}
                secondary={`SKU: ${item.sku} ${item.vendor ? `(Current: ${item.vendor.name})` : '(No vendor assigned)'}`}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button 
          onClick={onClose}
          sx={{ height: 40, minWidth: 80 }}
        >
          Close
        </Button>
      </DialogActions>
      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Dialog>
  );
}

export default VendorMapping;
