import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Button,
  Stack,
  IconButton,
  Typography,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  Divider,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  History as HistoryIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import ProductImport from '../components/ProductImport';
import SKULink from '../components/SKULink';

function Products() {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [sortDirection, setSortDirection] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedSku, setSelectedSku] = useState(null);
  const queryClient = useQueryClient();

  const { data: products, isLoading, refetch, error } = useQuery({
    queryKey: ['products', search],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE_URL}/products`, {
        params: { search },
      });
      return response.data;
    },
    placeholderData: (previousData) => previousData, // React Query v5 compatibility
    staleTime: 10000
  });

  const { data: skuHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['skuHistory', selectedSku],
    queryFn: async () => {
      if (!selectedSku) return [];
      const response = await axios.get(`${API_BASE_URL}/activity/sku/${selectedSku}`);
      return response.data;
    },
    enabled: !!selectedSku && historyDialogOpen,
    refetchOnWindowFocus: false,
  });

  // Apply client-side filtering and sorting
  const filteredProducts = React.useMemo(() => {
    if (!products || !Array.isArray(products)) return [];
    
    let filtered = products.filter(product => {
      // Apply date filter if set
      if (dateFilter) {
        const productDate = new Date(product.createdAt).toLocaleDateString();
        const filterDate = new Date(dateFilter).toLocaleDateString();
        return productDate === filterDate;
      }
      return true;
    });
    
    // Sort products if sort direction is set
    if (sortDirection) {
      filtered = [...filtered].sort((a, b) => {
        if (sortDirection === 'asc') {
          return a.name.localeCompare(b.name);
        } else {
          return b.name.localeCompare(a.name);
        }
      });
    }
    
    return filtered;
  }, [products, dateFilter, sortDirection]);

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await axios.delete(`${API_BASE_URL}/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSearch = (event) => {
    setSearch(event.target.value);
    setPage(0);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      await deleteMutation.mutateAsync(id);
    }
  };
  
  // Function to open product history dialog
  const handleOpenHistory = (sku) => {
    setSelectedSku(sku);
    setHistoryDialogOpen(true);
  };
  
  // Function to close product history dialog
  const handleCloseHistory = () => {
    setHistoryDialogOpen(false);
    setSelectedSku(null);
  };

  if (isLoading) {
    return (
      <Box sx={{ width: '100%', p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ width: '100%', p: 3 }}>
        <Alert severity="error">Error loading products: {error.message}</Alert>
      </Box>
    );
  }

  // Function to handle export products
  const handleExportProducts = async () => {
    const response = await axios.get(`${API_BASE_URL}/products/export`, {
      params: { search },
      responseType: 'blob'
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `products-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <Box sx={{ width: '100%', p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5">Products</Typography>
        <Stack direction="row" spacing={2}>
          <Button variant="contained" onClick={() => setShowImport(true)}>Import Products</Button>
          <Button variant="contained" onClick={handleExportProducts}>Export Products</Button>
        </Stack>
      </Stack>
      
      {/* Product History Dialog */}
      <Dialog open={historyDialogOpen} onClose={handleCloseHistory} maxWidth="md" fullWidth>
        <DialogTitle>
          Product History: {selectedSku}
        </DialogTitle>
        <DialogContent>
          {historyLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : skuHistory && skuHistory.length > 0 ? (
            <List>
              {skuHistory.map((activity, index) => (
                <React.Fragment key={activity._id || index}>
                  <ListItem alignItems="flex-start">
                    <ListItemText
                      primary={
                        <Typography variant="subtitle1">
                          {activity.type.replace(/_/g, ' ')}
                          <Chip 
                            size="small" 
                            label={new Date(activity.timestamp).toLocaleString()} 
                            sx={{ ml: 1 }} 
                            variant="outlined"
                          />
                        </Typography>
                      }
                      secondary={
                        <Box sx={{ mt: 1 }}>
                          {activity.metadata && (
                            <Box sx={{ bgcolor: 'background.paper', p: 1, borderRadius: 1 }}>
                              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                                {JSON.stringify(activity.metadata, null, 2)}
                              </pre>
                            </Box>
                          )}
                          {activity.message && (
                            <Typography variant="body2" sx={{ mt: 1 }}>
                              {activity.message}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                  {index < skuHistory.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          ) : (
            <Alert severity="info">No history found for this product</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseHistory}>Close</Button>
        </DialogActions>
      </Dialog>
      
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        {/* Date filter */}
        <TextField
          label="Filter by Date"
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          InputLabelProps={{
            shrink: true,
          }}
          sx={{ minWidth: 200 }}
        />
        <Button
          variant="outlined"
          onClick={() => setDateFilter('')}
          sx={{ ml: 1 }}
        >
          Clear Date
        </Button>
        
        {/* Sort by name */}
        <Button
          variant="outlined"
          color={sortDirection === 'asc' ? 'primary' : 'inherit'}
          onClick={() => setSortDirection(sortDirection === 'asc' ? '' : 'asc')}
          sx={{ ml: 1 }}
        >
          Sort by Name A-Z {sortDirection === 'asc' ? '✓' : ''}
        </Button>
      </Stack>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>SKU</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Cost Price</TableCell>
              <TableCell>GST</TableCell>
              <TableCell>Vendor</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredProducts && filteredProducts.length > 0 ? (
              filteredProducts
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((product) => (
                <TableRow key={product._id}>
                  <TableCell><SKULink sku={product.sku} /></TableCell>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>₹{product.costPrice}</TableCell>
                  <TableCell>{product.gst}%</TableCell>
                  <TableCell>
                    {product.vendor ? (
                      <Chip label={product.vendor.name} color="primary" size="small" />
                    ) : (
                      <Chip label="No Vendor" variant="outlined" size="small" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      <IconButton size="small" color="primary">
                        <EditIcon />
                      </IconButton>
                      <IconButton 
                        size="small" 
                        color="primary"
                        onClick={() => handleOpenHistory(product.sku)}
                      >
                        <HistoryIcon />
                      </IconButton>
                      <IconButton 
                        size="small" 
                        color="error"
                        onClick={() => handleDelete(product._id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                    No products found
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={filteredProducts?.length || 0}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </TableContainer>

      {showImport && (
        <ProductImport
          open={showImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </Box>
  );
}

export default Products;
