import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { 
  Container,
  Typography,
  Paper,
  Grid,
  Box,
  Button,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  Chip,
  TextField,
  MenuItem,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle
} from '@mui/material';
import { getQuotationById, updateQuotation, downloadQuotationPDF, getAllUsers, getCurrentUser } from '../services/api';

function QuotationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quotation, setQuotation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [userDefaultTemplate, setUserDefaultTemplate] = useState('template1');
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [editData, setEditData] = useState({
    stage: '',
    notes: '',
    assignedUser: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch quotation details
        const quotationResponse = await getQuotationById(id);
        const quotationData = quotationResponse.data.data;
        setQuotation(quotationData);
        
        // Fetch all users for assignment
        const usersResponse = await getAllUsers();
        setUsers(usersResponse.data.data);
        
        // Fetch current user's default template
        const userResponse = await getCurrentUser();
        setUserDefaultTemplate(userResponse.data.data.defaultTemplate || 'template1');
        
        // Set edit data
        setEditData({
          stage: quotationData.stage,
          notes: quotationData.notes || '',
          assignedUser: quotationData.assignedUser?._id || ''
        });
      } catch (error) {
        toast.error('Failed to fetch quotation details');
        console.error('Error fetching data:', error);
        navigate('/quotations');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, navigate]);

  const handleOpenEditDialog = () => {
    setOpenEditDialog(true);
  };

  const handleCloseEditDialog = () => {
    setOpenEditDialog(false);
  };

  const handleEditChange = (e) => {
    setEditData({
      ...editData,
      [e.target.name]: e.target.value
    });
  };

  const handleSaveChanges = async () => {
    try {
      const updatedData = {
        stage: editData.stage,
        notes: editData.notes,
        assignedUser: editData.assignedUser || undefined
      };
      
      const response = await updateQuotation(id, updatedData);
      setQuotation(response.data.data);
      toast.success('Quotation updated successfully');
      handleCloseEditDialog();
    } catch (error) {
      toast.error('Failed to update quotation');
      console.error('Error updating quotation:', error);
    }
  };

  const handleDownloadPDF = () => {
    const toastId = toast.info('Preparing your PDF for download...', {
      autoClose: false
    });
    
    try {
      // Call the API to download PDF with user's default template
      downloadQuotationPDF(id, userDefaultTemplate);
      
      // Update the toast after a short delay (we can't know exactly when download starts)
      setTimeout(() => {
        toast.update(toastId, {
          render: 'PDF download initiated',
          type: toast.TYPE.SUCCESS,
          autoClose: 5000
        });
      }, 1500);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.update(toastId, {
        render: `Failed to download PDF: ${error.message || 'Please check your connection and try again'}`,
        type: toast.TYPE.ERROR,
        autoClose: 5000
      });
    }
  };

  const getStageChipColor = (stage) => {
    switch (stage) {
      case 'Initial':
        return 'info';
      case 'Negotiation':
        return 'warning';
      case 'On Hold':
        return 'secondary';
      case 'Win':
        return 'success';
      case 'Lost':
        return 'error';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!quotation) {
    return (
      <Container>
        <Typography variant="h5" color="error">
          Quotation not found
        </Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">
          Quotation: {quotation.quotationNumber}
        </Typography>
        <Box>
          <Button 
            variant="outlined" 
            onClick={handleOpenEditDialog}
            sx={{ mr: 2 }}
          >
            Edit Status
          </Button>
          <Button 
            variant="contained" 
            color="primary"
            onClick={handleDownloadPDF}
            title={`Using ${userDefaultTemplate === 'template1' ? 'Classic' : 'Modern'} template`}
          >
            Download PDF
          </Button>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Quotation Information */}
        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Quotation Information
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Status
                </Typography>
                <Chip 
                  label={quotation.stage} 
                  color={getStageChipColor(quotation.stage)}
                  sx={{ mt: 1 }}
                />
              </Grid>
              <Grid item xs={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Date Created
                </Typography>
                <Typography variant="body1">
                  {new Date(quotation.createdAt).toLocaleDateString()}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Valid Until
                </Typography>
                <Typography variant="body1">
                  {new Date(quotation.validUntil).toLocaleDateString()}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Created By
                </Typography>
                <Typography variant="body1">
                  {quotation.createdBy?.name || 'N/A'}
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary">
                  Relationship Manager
                </Typography>
                <Typography variant="body1">
                  {quotation.relationshipManager?.name || 'N/A'}
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary">
                  Assigned User
                </Typography>
                <Typography variant="body1">
                  {quotation.assignedUser?.name ? `${quotation.assignedUser.name} (${quotation.assignedUser.email})` : 'Not assigned'}
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary">
                  Notes
                </Typography>
                <Typography variant="body1">
                  {quotation.notes || 'No notes'}
                </Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Client Information */}
        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Client Information
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary">
                  Name
                </Typography>
                <Typography variant="body1">
                  {quotation.clientName}
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary">
                  Email
                </Typography>
                <Typography variant="body1">
                  {quotation.clientEmail}
                </Typography>
              </Grid>
              {quotation.clientPhone && (
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Phone
                  </Typography>
                  <Typography variant="body1">
                    {quotation.clientPhone}
                  </Typography>
                </Grid>
              )}
              {quotation.clientAddress && (
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Address
                  </Typography>
                  <Typography variant="body1">
                    {quotation.clientAddress}
                  </Typography>
                </Grid>
              )}
            </Grid>
          </Paper>
        </Grid>

        {/* Products */}
        <Grid item xs={12}>
          <Paper elevation={3} sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Products
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>SKU</TableCell>
                    <TableCell>Product</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Price (₹)</TableCell>
                    <TableCell align="right">GST %</TableCell>
                    <TableCell align="right">Discount (₹)</TableCell>
                    <TableCell align="right">Total (₹)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {quotation.products.map((product, index) => (
                    <TableRow key={index}>
                      <TableCell>{product.sku}</TableCell>
                      <TableCell>{product.name}</TableCell>
                      <TableCell align="right">{product.quantity}</TableCell>
                      <TableCell align="right">{product.sellingPrice.toFixed(2)}</TableCell>
                      <TableCell align="right">{product.gstPercentage}%</TableCell>
                      <TableCell align="right">{product.discount.toFixed(2)}</TableCell>
                      <TableCell align="right">{product.finalPrice.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            
            {/* Totals */}
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
              <Grid container spacing={1} sx={{ maxWidth: 300 }}>
                <Grid item xs={6}>
                  <Typography variant="body1" align="right">
                    Sub Total:
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body1" align="right">
                    ₹{quotation.subTotal.toFixed(2)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body1" align="right">
                    GST Total:
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body1" align="right">
                    ₹{quotation.gstTotal.toFixed(2)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body1" align="right">
                    Discount Total:
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body1" align="right">
                    ₹{quotation.discountTotal.toFixed(2)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle1" align="right" fontWeight="bold">
                    Grand Total:
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle1" align="right" fontWeight="bold">
                    ₹{quotation.grandTotal.toFixed(2)}
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Edit Dialog */}
      <Dialog open={openEditDialog} onClose={handleCloseEditDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Quotation</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <TextField
              select
              fullWidth
              label="Stage"
              name="stage"
              value={editData.stage}
              onChange={handleEditChange}
              margin="normal"
            >
              <MenuItem value="Initial">Initial</MenuItem>
              <MenuItem value="Negotiation">Negotiation</MenuItem>
              <MenuItem value="On Hold">On Hold</MenuItem>
              <MenuItem value="Win">Win</MenuItem>
              <MenuItem value="Lost">Lost</MenuItem>
            </TextField>
            
            <TextField
              select
              fullWidth
              label="Assigned User"
              name="assignedUser"
              value={editData.assignedUser}
              onChange={handleEditChange}
              margin="normal"
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {users.map((user) => (
                <MenuItem key={user._id} value={user._id}>
                  {user.name} ({user.role})
                </MenuItem>
              ))}
            </TextField>
            
            <TextField
              fullWidth
              label="Notes"
              name="notes"
              value={editData.notes}
              onChange={handleEditChange}
              margin="normal"
              multiline
              rows={4}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEditDialog}>Cancel</Button>
          <Button onClick={handleSaveChanges} variant="contained">Save Changes</Button>
        </DialogActions>
      </Dialog>

    </Container>
  );
}

export default QuotationDetail;