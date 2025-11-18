import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormControl,
  FormLabel,
  Alert
} from '@mui/material';

export default function TransactionSplitDialog({
  open,
  onClose,
  transaction,
  onConfirm,
  transactionType = 'Sales'
}) {
  const [newQuantity, setNewQuantity] = useState('');
  const [action, setAction] = useState('pending'); // 'pending' or 'remove'
  const [remark, setRemark] = useState('');
  const [error, setError] = useState('');

  // Initialize with transaction quantity
  React.useEffect(() => {
    if (transaction && transaction.items && transaction.items.length > 0) {
      const totalQty = transaction.items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
      setNewQuantity(totalQty.toString());
      setAction('pending');
      setRemark('');
      setError('');
    }
  }, [transaction]);

  const handleConfirm = () => {
    if (!transaction || !transaction.items || transaction.items.length === 0) {
      setError('Invalid transaction');
      return;
    }

    const totalQty = transaction.items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
    const newQty = parseFloat(newQuantity);

    if (isNaN(newQty) || newQty <= 0) {
      setError('Please enter a valid quantity greater than 0');
      return;
    }

    if (newQty >= totalQty) {
      setError('New quantity must be less than original quantity');
      return;
    }

    const remainingQty = totalQty - newQty;

    onConfirm({
      transactionId: transaction._id,
      newQuantity: newQty,
      remainingQuantity: remainingQty,
      action: action, // 'pending' or 'remove'
      remark: remark.trim()
    });

    // Reset form
    setNewQuantity('');
    setAction('pending');
    setRemark('');
    setError('');
    onClose();
  };

  const handleCancel = () => {
    setNewQuantity('');
    setAction('pending');
    setRemark('');
    setError('');
    onClose();
  };

  if (!transaction || !transaction.items || transaction.items.length === 0) {
    return null;
  }

  const totalQty = transaction.items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
  const newQty = parseFloat(newQuantity) || 0;
  const remainingQty = totalQty - newQty;

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Split Transaction</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Alert severity="info">
            Original quantity: <strong>{totalQty}</strong>
          </Alert>

          <TextField
            label="New Quantity (to sync)"
            type="number"
            value={newQuantity}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '' || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0)) {
                setNewQuantity(val);
                setError('');
              }
            }}
            helperText={`Remaining: ${remainingQty >= 0 ? remainingQty : 0}`}
            fullWidth
            required
          />

          {remainingQty > 0 && (
            <>
              <FormControl component="fieldset">
                <FormLabel component="legend">What to do with remaining {remainingQty}?</FormLabel>
                <RadioGroup
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                >
                  <FormControlLabel
                    value="pending"
                    control={<Radio />}
                    label={`Keep as pending transaction (${remainingQty} units)`}
                  />
                  <FormControlLabel
                    value="remove"
                    control={<Radio />}
                    label="Remove remaining quantity"
                  />
                </RadioGroup>
              </FormControl>

              {action === 'pending' && (
                <TextField
                  label="Remark (optional)"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="e.g., Partial sync - remaining pending"
                  fullWidth
                  multiline
                  rows={2}
                />
              )}
            </>
          )}

          {error && (
            <Alert severity="error">{error}</Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={!newQuantity || parseFloat(newQuantity) <= 0 || parseFloat(newQuantity) >= totalQty}
        >
          Confirm Split
        </Button>
      </DialogActions>
    </Dialog>
  );
}

