import { useState } from 'react';
import { API_BASE_URL } from '../config';
import SKULink from './SKULink';
import SKUPrice from './SKUPrice';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Box,
  Typography,
  IconButton,
  MenuItem,
  Stack,
} from '@mui/material';
import {
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Comment as CommentIcon,
} from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

// ExpectedDateField component for editing expected dates
const ExpectedDateField = ({ item, orderId, onDateChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [dateValue, setDateValue] = useState(
    item.expectedDate ? new Date(item.expectedDate).toISOString().split('T')[0] : ''
  );
  const queryClient = useQueryClient();

  const updateExpectedDateMutation = useMutation({
    mutationFn: async ({ orderId, itemId, expectedDate }) => {
      const response = await axios.put(
        `${API_BASE_URL}/orders/${orderId}/items/${itemId}/expected-date`,
        { expectedDate }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setIsEditing(false);
    },
    onError: (error) => {
      console.error('Failed to update expected date:', error);
      alert('Failed to update expected date: ' + error.message);
    }
  });

  const handleSave = async () => {
    if (dateValue.trim()) {
      try {
        await updateExpectedDateMutation.mutateAsync({
          orderId,
          itemId: item._id,
          expectedDate: dateValue
        });
        onDateChange(new Date(dateValue));
      } catch (error) {
        console.error('Failed to save expected date:', error);
      }
    } else {
      // Clear the date
      try {
        await updateExpectedDateMutation.mutateAsync({
          orderId,
          itemId: item._id,
          expectedDate: null
        });
        onDateChange(null);
      } catch (error) {
        console.error('Failed to clear expected date:', error);
      }
    }
  };

  const handleCancel = () => {
    setDateValue(item.expectedDate ? new Date(item.expectedDate).toISOString().split('T')[0] : '');
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <TextField
          type="date"
          size="small"
          value={dateValue}
          onChange={(e) => setDateValue(e.target.value)}
          sx={{ minWidth: 140 }}
        />
        <IconButton size="small" onClick={handleSave}>
          <SaveIcon />
        </IconButton>
        <IconButton size="small" onClick={handleCancel}>
          <CancelIcon />
        </IconButton>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      <Typography variant="body2">
        {item.expectedDate 
          ? new Date(item.expectedDate).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            })
          : 'Not set'
        }
      </Typography>
      <IconButton size="small" onClick={() => setIsEditing(true)}>
        <EditIcon />
      </IconButton>
    </Box>
  );
};

const stages = ['Initial', 'Hold', 'Processed', 'Pending', 'Completed', 'In-Stock'];

function OrderDetail({ open, onClose, order }) {
  const [editingItem, setEditingItem] = useState(null);
  const [commentTexts, setCommentTexts] = useState({});
  const [selectedStage, setSelectedStage] = useState(order?.stage || 'Initial');
  const queryClient = useQueryClient();
  const [messageDialog, setMessageDialog] = useState({ open: false, title: 'Message', message: '' });

  // Fetch last 10 processed purchases for this order
  const { data: processingHistory } = useQuery(
    ['order-processing-history', order?._id],
    async () => {
      if (!order?._id) return [];
      const resp = await axios.get(`${API_BASE_URL}/orders/${order._id}/processing-history`);
      return Array.isArray(resp.data?.history) ? resp.data.history.slice(0, 10) : [];
    },
    { enabled: !!order?._id }
  );

  const updateItemMutation = useMutation({
    mutationFn: async (updatedItem) => {
      const response = await axios.put(
        `${API_BASE_URL}/orders/${order._id}/items/${updatedItem._id}`,
        updatedItem
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setEditingItem(null);
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async ({ itemId, text }) => {
      const response = await axios.post(
        `${API_BASE_URL}/orders/${order._id}/items/${itemId}/comment`,
        { text }
      );
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setCommentTexts(prev => {
        const newTexts = { ...prev };
        delete newTexts[variables.itemId];
        return newTexts;
      });
    },
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ orderId, stage, comment }) => {
      // Check if order has unmapped items
      const hasUnmappedItems = order?.items.some(item => !item.vendor);
      
      // Restrict order movement if no vendor is assigned
      // ALLOW Pending stage regardless of vendor assignment (fixed bug)
      if (hasUnmappedItems) {
        // Allow move to "Hold", "In-Stock", or "Pending" stage even without vendor
        if (stage !== 'Hold' && stage !== 'In-Stock' && stage !== 'Pending') {
          throw new Error('Orders without assigned vendors can only be moved to "Hold", "In-Stock", or "Pending" stages');
        }
      }
      
      const response = await axios.put(
        `${API_BASE_URL}/orders/${orderId}/stage`,
        { stage, comment }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const handleEditItem = (item) => {
    setEditingItem({ ...item });
  };

  const handleSaveItem = async () => {
    try {
      await updateItemMutation.mutateAsync(editingItem);
    } catch (error) {
      console.error('Failed to update item:', error);
      setMessageDialog({ open: true, title: 'Error', message: 'Failed to update item: ' + error.message });
    }
  };

  const handleAddComment = async (itemId) => {
    const text = commentTexts[itemId] || '';
    console.log('Attempting to add comment:', { itemId, text, orderId: order._id });
    if (text.trim()) {
      try {
        await addCommentMutation.mutateAsync({ itemId, text });
        // Clear the comment text for this specific item
        setCommentTexts(prev => {
          const newTexts = { ...prev };
          delete newTexts[itemId];
          return newTexts;
        });
      } catch (error) {
        console.error('Failed to add comment:', error);
        setMessageDialog({ open: true, title: 'Error', message: 'Failed to add comment: ' + error.message });
      }
    }
  };

  const handleStageChange = async () => {
    try {
      await updateStageMutation.mutateAsync({
        orderId: order._id,
        stage: selectedStage,
        comment: `Order moved to ${selectedStage} stage`
      });
    } catch (error) {
      console.error('Failed to update stage:', error);
      setMessageDialog({ open: true, title: 'Error', message: 'Failed to update stage: ' + error.message });
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        Order Details - {order.shopifyOrderName || order.orderName || `#${order.shopifyOrderId || order._id.slice(-6)}`}
      </DialogTitle>
      <DialogContent>
        {/* Message Dialog */}
        <Dialog open={messageDialog.open} onClose={() => setMessageDialog({ ...messageDialog, open: false })} maxWidth="sm" fullWidth>
          <DialogTitle>{messageDialog.title}</DialogTitle>
          <DialogContent>
            <Typography>{messageDialog.message}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setMessageDialog({ ...messageDialog, open: false })} variant="contained">OK</Button>
          </DialogActions>
        </Dialog>
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            Stage Management
          </Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField
              select
              label="Stage"
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              sx={{ minWidth: 200 }}
            >
              {stages.map((stage) => (
                <MenuItem key={stage} value={stage}>
                  {stage}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained"
              onClick={handleStageChange}
              disabled={selectedStage === order.stage}
            >
              Update Stage
            </Button>
          </Stack>
        </Box>

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Product Name</TableCell>
                <TableCell>SKU</TableCell>
                <TableCell>Price</TableCell>
                <TableCell>Quantity</TableCell>
                <TableCell>Vendor</TableCell>
                {order.stage === 'Pending' && <TableCell>Expected Date</TableCell>}
                <TableCell>Comments</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {order.items.map((item) => (
                <TableRow key={item._id}>
                  <TableCell>
                    {editingItem?._id === item._id ? (
                      <TextField
                        value={editingItem.productName}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            productName: e.target.value,
                          })
                        }
                        size="small"
                        fullWidth
                      />
                    ) : (
                      item.productName
                    )}
                  </TableCell>
                  <TableCell>
                    <Box>
                      <SKULink sku={item.sku} />
                      <Box sx={{ mt: 0.5 }}>
                        <SKUPrice 
                          sku={item.sku} 
                          fallbackPrice={typeof item.price === 'number' ? item.price : (item.costPrice || null)}
                          page="orders"
                          location={item.warehouse || 'Okhla'}
                        />
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <SKUPrice 
                      sku={item.sku} 
                      fallbackPrice={typeof item.price === 'number' ? item.price : (item.costPrice || null)}
                      page="orders"
                      location={item.warehouse || 'Okhla'}
                    />
                  </TableCell>
                  <TableCell>
                    {editingItem?._id === item._id ? (
                      <TextField
                        type="number"
                        value={editingItem.quantity}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            quantity: parseInt(e.target.value),
                          })
                        }
                        size="small"
                      />
                    ) : (
                      item.quantity
                    )}
                  </TableCell>
                  <TableCell>{item.vendor?.name || 'Not Mapped'}</TableCell>
                  {order.stage === 'Pending' && (
                    <TableCell>
                      <ExpectedDateField 
                        item={item} 
                        orderId={order._id}
                        onDateChange={(newDate) => {
                          // Update the item in the local state
                          const updatedItems = order.items.map(orderItem => {
                            if (orderItem._id === item._id) {
                              return { ...orderItem, expectedDate: newDate };
                            }
                            return orderItem;
                          });
                          // Update the order object
                          order.items = updatedItems;
                        }}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <Box>
                      {item.comments?.map((comment, index) => (
                        <Typography key={index} variant="caption" display="block">
                          {comment.text}
                        </Typography>
                      ))}
                      <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                        <TextField
                          size="small"
                          placeholder="Add comment"
                          value={commentTexts[item._id] || ''}
                          onChange={(e) => setCommentTexts(prev => ({
                            ...prev,
                            [item._id]: e.target.value
                          }))}
                        />
                        <IconButton
                          size="small"
                          onClick={() => handleAddComment(item._id)}
                        >
                          <CommentIcon />
                        </IconButton>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    {editingItem?._id === item._id ? (
                      <>
                        <IconButton onClick={handleSaveItem} size="small">
                          <SaveIcon />
                        </IconButton>
                        <IconButton
                          onClick={() => setEditingItem(null)}
                          size="small"
                        >
                          <CancelIcon />
                        </IconButton>
                      </>
                    ) : (
                      <IconButton
                        onClick={() => handleEditItem(item)}
                        size="small"
                      >
                        <EditIcon />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Purchase History (Processed orders) */}
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            Recent Purchases (Processed Orders)
          </Typography>
          {processingHistory && processingHistory.length > 0 ? (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>SKU</TableCell>
                    <TableCell>Product</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Price</TableCell>
                    <TableCell>Vendor</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {processingHistory.map((h, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{new Date(h.timestamp || h.processedAt).toLocaleString()}</TableCell>
                      <TableCell><SKULink sku={h.itemSku} /></TableCell>
                      <TableCell>{h.itemName || h.productName}</TableCell>
                      <TableCell align="right">{h.quantity || '-'}</TableCell>
                      <TableCell align="right">{typeof h.price === 'number' ? `₹${h.price.toFixed(2)}` : '-'}</TableCell>
                      <TableCell>{h.vendorName || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography variant="body2" color="text.secondary">No recent purchases recorded.</Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default OrderDetail;
