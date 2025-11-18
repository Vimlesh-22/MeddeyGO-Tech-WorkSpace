import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import {
  Container,
  Typography,
  Paper,
  Button,
  Box,
  TextField,
  Grid,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Switch,
  FormControlLabel
} from '@mui/material';
import { getAllPricingRules, createPricingRule, deletePricingRule, updatePricingRule } from '../services/api';

function PricingRules() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editRule, setEditRule] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    minQuantity: 1,
    discountType: 'percentage',
    discountValue: 0,
    active: true
  });

  const fetchRules = async () => {
    try {
      setLoading(true);
      const response = await getAllPricingRules();
      setRules(response.data.data);
    } catch (error) {
      console.error('Error fetching pricing rules:', error);
      toast.error('Failed to fetch pricing rules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleOpenAddDialog = () => {
    setEditRule(null);
    setFormData({
      name: '',
      description: '',
      minQuantity: 1,
      discountType: 'percentage',
      discountValue: 0,
      active: true
    });
    setOpenAddDialog(true);
  };

  const handleOpenEditDialog = (rule) => {
    setEditRule(rule);
    setFormData({
      name: rule.name,
      description: rule.description,
      minQuantity: rule.minQuantity,
      discountType: rule.discountType,
      discountValue: rule.discountValue,
      active: rule.active
    });
    setOpenAddDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenAddDialog(false);
    setEditRule(null);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);

      if (editRule) {
        // Update existing rule
        await updatePricingRule(editRule._id, formData);
        toast.success('Pricing rule updated successfully');
      } else {
        // Create new rule
        await createPricingRule(formData);
        toast.success('Pricing rule created successfully');
      }

      handleCloseDialog();
      fetchRules();
    } catch (error) {
      console.error('Error saving pricing rule:', error);
      toast.error('Failed to save pricing rule');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this pricing rule?')) {
      try {
        await deletePricingRule(id);
        toast.success('Pricing rule deleted successfully');
        fetchRules();
      } catch (error) {
        console.error('Error deleting pricing rule:', error);
        toast.error('Failed to delete pricing rule');
      }
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1" gutterBottom>
          Pricing Rules
        </Typography>
        <Button
          variant="contained"
          onClick={handleOpenAddDialog}
        >
          Add New Rule
        </Button>
      </Box>

      <Paper elevation={3} sx={{ p: 3 }}>
        {loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Min Quantity</TableCell>
                  <TableCell align="right">Discount</TableCell>
                  <TableCell align="center">Status</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rules.length > 0 ? (
                  rules.map((rule) => (
                    <TableRow key={rule._id}>
                      <TableCell>{rule.name}</TableCell>
                      <TableCell>{rule.description}</TableCell>
                      <TableCell align="right">{rule.minQuantity}</TableCell>
                      <TableCell align="right">
                        {rule.discountValue}
                        {rule.discountType === 'percentage' ? '%' : ' ₹'}
                      </TableCell>
                      <TableCell align="center">
                        {rule.active ? 'Active' : 'Inactive'}
                      </TableCell>
                      <TableCell align="center">
                        <Button
                          size="small"
                          sx={{ mr: 1 }}
                          onClick={() => handleOpenEditDialog(rule)}
                        >
                          Edit
                        </Button>
                        <Button
                          color="error"
                          size="small"
                          onClick={() => handleDelete(rule._id)}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      No pricing rules found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Add/Edit Dialog */}
      <Dialog open={openAddDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editRule ? 'Edit Pricing Rule' : 'Add New Pricing Rule'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  required
                  fullWidth
                  label="Rule Name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  margin="normal"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  required
                  fullWidth
                  label="Description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  margin="normal"
                  multiline
                  rows={2}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  required
                  fullWidth
                  label="Minimum Quantity"
                  name="minQuantity"
                  type="number"
                  value={formData.minQuantity}
                  onChange={handleChange}
                  margin="normal"
                  inputProps={{ min: 1 }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  select
                  required
                  fullWidth
                  label="Discount Type"
                  name="discountType"
                  value={formData.discountType}
                  onChange={handleChange}
                  margin="normal"
                >
                  <MenuItem value="percentage">Percentage (%)</MenuItem>
                  <MenuItem value="fixed">Fixed Amount (₹)</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  required
                  fullWidth
                  label={`Discount Value ${formData.discountType === 'percentage' ? '(%)' : '(₹)'}`}
                  name="discountValue"
                  type="number"
                  value={formData.discountValue}
                  onChange={handleChange}
                  margin="normal"
                  inputProps={{ min: 0 }}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.active}
                      onChange={handleChange}
                      name="active"
                    />
                  }
                  label="Active"
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={submitting}
          >
            {submitting ? <CircularProgress size={24} /> : (editRule ? 'Update' : 'Add')}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default PricingRules; 