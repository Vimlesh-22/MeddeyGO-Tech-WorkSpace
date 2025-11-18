import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Chip,
  Alert,
  Tabs,
  Tab,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Checkbox,
  Tooltip
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Search as SearchIcon,
  Merge as MergeIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '../utils/notify';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import Layout from '../components/Layout';

export default function VendorManagement() {
  const [searchQuery, setSearchQuery] = useState('');
  const [tabValue, setTabValue] = useState(0);
  const [openDialog, setOpenDialog] = useState(false);
  const [openMergeDialog, setOpenMergeDialog] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [selectedDuplicates, setSelectedDuplicates] = useState([]);
  const [keepVendor, setKeepVendor] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: ''
  });

  const queryClient = useQueryClient();

  // Fetch all vendors
  const { data: vendors = [], isLoading } = useQuery(
    ['vendors', searchQuery],
    async () => {
      const response = await axios.get(`${API_BASE_URL}/vendors`, {
        params: { search: searchQuery }
      });
      return response.data;
    }
  );

  // Fetch duplicates
  const { data: duplicates = [] } = useQuery(
    'vendor-duplicates',
    async () => {
      const response = await axios.get(`${API_BASE_URL}/vendors/duplicates`);
      return response.data;
    }
  );

  // Create vendor mutation
  const createMutation = useMutation({
    mutationFn: async (data) => {
      const response = await axios.post(`${API_BASE_URL}/vendors`, {
        name: data.name,
        contactInfo: {
          email: data.email,
          phone: data.phone,
          address: data.address
        }
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['vendors']);
      setOpenDialog(false);
      resetForm();
      notify('Vendor created successfully!', 'success');
    },
    onError: (error) => {
      notify(`Error: ${error.response?.data?.message || error.message}`, 'error');
    }
  });

  // Update vendor mutation
  const updateMutation = useMutation({
    mutationFn: async (data) => {
      const response = await axios.put(`${API_BASE_URL}/vendors/${data.id}`, {
        name: data.name,
        contactInfo: {
          email: data.email,
          phone: data.phone,
          address: data.address
        }
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['vendors']);
      setOpenDialog(false);
      setEditingVendor(null);
      resetForm();
      notify('Vendor updated successfully!', 'success');
    }
  });

  // Delete vendor mutation
  const deleteMutation = useMutation({
    mutationFn: async (vendorId) => {
      await axios.delete(`${API_BASE_URL}/vendors/${vendorId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['vendors']);
      notify('Vendor deleted successfully!', 'success');
    }
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (vendorIds) => {
      await axios.post(`${API_BASE_URL}/vendors/bulk-delete`, { vendorIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['vendors']);
      queryClient.invalidateQueries(['vendor-duplicates']);
      notify('Vendors deleted successfully!', 'success');
    }
  });

  // Merge vendors mutation
  const mergeMutation = useMutation({
    mutationFn: async ({ keepId, mergeIds }) => {
      await axios.post(`${API_BASE_URL}/vendors/merge`, { keepId, mergeIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['vendors']);
      queryClient.invalidateQueries(['vendor-duplicates']);
      setOpenMergeDialog(false);
      setSelectedDuplicates([]);
      setKeepVendor(null);
      notify('Vendors merged successfully!', 'success');
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: ''
    });
  };

  const handleOpenCreate = () => {
    resetForm();
    setEditingVendor(null);
    setOpenDialog(true);
  };

  const handleOpenEdit = (vendor) => {
    setEditingVendor(vendor);
    setFormData({
      name: vendor.name,
      email: vendor.contactInfo?.email || '',
      phone: vendor.contactInfo?.phone || '',
      address: vendor.contactInfo?.address || ''
    });
    setOpenDialog(true);
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      notify('Vendor name is required', 'warning');
      return;
    }

    if (editingVendor) {
      updateMutation.mutate({ ...formData, id: editingVendor._id });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (vendorId, vendorName) => {
    if (window.confirm(`Are you sure you want to delete vendor "${vendorName}"? This will remove vendor assignments from all orders.`)) {
      deleteMutation.mutate(vendorId);
    }
  };

  const handleOpenMerge = (duplicateGroup) => {
    setSelectedDuplicates(duplicateGroup);
    setKeepVendor(duplicateGroup[0]._id); // Default to first vendor
    setOpenMergeDialog(true);
  };

  const handleMerge = () => {
    if (!keepVendor) {
      notify('Please select a vendor to keep', 'warning');
      return;
    }

    const mergeIds = selectedDuplicates
      .filter(v => v._id !== keepVendor)
      .map(v => v._id);

    if (mergeIds.length === 0) {
      notify('No vendors selected to merge', 'warning');
      return;
    }

    if (window.confirm(`This will merge ${mergeIds.length} duplicate vendor(s) into the selected vendor. Continue?`)) {
      mergeMutation.mutate({ keepId: keepVendor, mergeIds });
    }
  };

  const handleBulkDeleteDuplicates = (duplicateGroup) => {
    // Keep the first one, delete the rest
    const toDelete = duplicateGroup.slice(1).map(v => v._id);
    
    if (window.confirm(`This will delete ${toDelete.length} duplicate vendor(s) and keep the first one. Continue?`)) {
      bulkDeleteMutation.mutate(toDelete);
    }
  };

  return (
    <Layout>
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4">Vendor Management</Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenCreate}
          >
            Add Vendor
          </Button>
        </Box>

        {/* Tabs */}
        <Paper sx={{ mb: 3 }}>
          <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
            <Tab label={`All Vendors (${vendors.length})`} />
            <Tab 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  Duplicates ({duplicates.length})
                  {duplicates.length > 0 && <WarningIcon color="warning" fontSize="small" />}
                </Box>
              } 
            />
          </Tabs>
        </Paper>

        {/* All Vendors Tab */}
        {tabValue === 0 && (
          <>
            {/* Search Bar */}
            <Paper sx={{ p: 2, mb: 2 }}>
              <TextField
                fullWidth
                placeholder="Search vendors by name, email, phone, address, or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
                }}
              />
            </Paper>

            {/* Vendors Table */}
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Name</strong></TableCell>
                    <TableCell><strong>Email</strong></TableCell>
                    <TableCell><strong>Phone</strong></TableCell>
                    <TableCell><strong>Address</strong></TableCell>
                    <TableCell><strong>SKU Mappings</strong></TableCell>
                    <TableCell><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center">Loading...</TableCell>
                    </TableRow>
                  ) : vendors.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        No vendors found
                      </TableCell>
                    </TableRow>
                  ) : (
                    vendors.map((vendor) => (
                      <TableRow key={vendor._id}>
                        <TableCell>{vendor.name}</TableCell>
                        <TableCell>{vendor.contactInfo?.email || '-'}</TableCell>
                        <TableCell>{vendor.contactInfo?.phone || '-'}</TableCell>
                        <TableCell>{vendor.contactInfo?.address || '-'}</TableCell>
                        <TableCell>
                          {vendor.skuMappings?.length > 0 ? (
                            <Chip label={`${vendor.skuMappings.length} SKUs`} size="small" />
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <Tooltip title="Edit">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => handleOpenEdit(vendor)}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDelete(vendor._id, vendor.name)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}

        {/* Duplicates Tab */}
        {tabValue === 1 && (
          <Box>
            {duplicates.length === 0 ? (
              <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="h6" color="success.main">
                  ✓ No duplicate vendors found
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  All vendor names are unique
                </Typography>
              </Paper>
            ) : (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Found {duplicates.length} group(s) of duplicate vendors. You can merge or delete them below.
              </Alert>
            )}

            <Grid container spacing={2}>
              {duplicates.map((duplicateGroup, index) => (
                <Grid item xs={12} key={index}>
                  <Card>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">
                          "{duplicateGroup[0].name}" ({duplicateGroup.length} duplicates)
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<MergeIcon />}
                            onClick={() => handleOpenMerge(duplicateGroup)}
                          >
                            Merge
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            startIcon={<DeleteIcon />}
                            onClick={() => handleBulkDeleteDuplicates(duplicateGroup)}
                          >
                            Delete Duplicates
                          </Button>
                        </Box>
                      </Box>

                      <List dense>
                        {duplicateGroup.map((vendor) => (
                          <ListItem key={vendor._id}>
                            <ListItemText
                              primary={vendor.name}
                              secondary={
                                <>
                                  ID: {vendor._id} | 
                                  Email: {vendor.contactInfo?.email || 'N/A'} | 
                                  Phone: {vendor.contactInfo?.phone || 'N/A'} |
                                  SKUs: {vendor.skuMappings?.length || 0}
                                </>
                              }
                            />
                          </ListItem>
                        ))}
                      </List>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>
            {editingVendor ? 'Edit Vendor' : 'Create New Vendor'}
          </DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  required
                  label="Vendor Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Address"
                  multiline
                  rows={3}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={createMutation.isLoading || updateMutation.isLoading}
            >
              {editingVendor ? 'Update' : 'Create'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Merge Dialog */}
        <Dialog open={openMergeDialog} onClose={() => setOpenMergeDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Merge Duplicate Vendors</DialogTitle>
          <DialogContent>
            <Alert severity="info" sx={{ mb: 2 }}>
              Select which vendor to keep. All orders will be updated to use this vendor, and the other duplicates will be deleted.
            </Alert>
            
            <List>
              {selectedDuplicates.map((vendor) => (
                <ListItem key={vendor._id}>
                  <Checkbox
                    checked={keepVendor === vendor._id}
                    onChange={() => setKeepVendor(vendor._id)}
                  />
                  <ListItemText
                    primary={<strong>{vendor.name}</strong>}
                    secondary={
                      <>
                        ID: {vendor._id}<br />
                        Email: {vendor.contactInfo?.email || 'N/A'}<br />
                        Phone: {vendor.contactInfo?.phone || 'N/A'}<br />
                        SKU Mappings: {vendor.skuMappings?.length || 0}
                      </>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenMergeDialog(false)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleMerge}
              disabled={mergeMutation.isLoading || !keepVendor}
            >
              Merge Vendors
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Layout>
  );
}
