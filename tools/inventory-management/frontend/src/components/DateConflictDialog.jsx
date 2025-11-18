import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Radio,
  RadioGroup,
  FormControl,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  Chip,
  Grid
} from '@mui/material';
import FormControlLabel from '@mui/material/FormControlLabel';
import {
  Check as CheckIcon,
  Close as CloseIcon,
  Warning as WarningIcon
} from '@mui/icons-material';

const CONFLICT_RESOLUTION_OPTIONS = {
  REPLACE: 'replace',
  SUM: 'sum',
  MANUAL: 'manual',
  SKIP: 'skip'
};

export default function DateConflictDialog({
  open,
  onClose,
  date,
  location,
  existingValues = {},
  onConfirm
}) {
  const [resolution, setResolution] = useState(CONFLICT_RESOLUTION_OPTIONS.SUM);
  const [selectedSkus, setSelectedSkus] = useState(new Set());

  React.useEffect(() => {
    if (open) {
      // Initialize with all SKUs selected for manual mode
      const allSkus = new Set(Object.keys(existingValues));
      setSelectedSkus(allSkus);
      setResolution(CONFLICT_RESOLUTION_OPTIONS.SUM); // Default to SUM
    }
  }, [open, existingValues]);

  const handleResolutionChange = (event) => {
    setResolution(event.target.value);
  };

  const handleToggleSku = (sku) => {
    const newSelected = new Set(selectedSkus);
    if (newSelected.has(sku)) {
      newSelected.delete(sku);
    } else {
      newSelected.add(sku);
    }
    setSelectedSkus(newSelected);
  };

  const handleSelectAll = () => {
    const allSkus = new Set(Object.keys(existingValues));
    setSelectedSkus(allSelectedSkus());
  };

  const allSelectedSkus = () => {
    return new Set(Object.keys(existingValues));
  };

  const handleConfirm = () => {
    onConfirm(resolution, resolution === CONFLICT_RESOLUTION_OPTIONS.MANUAL ? selectedSkus : null);
  };

  if (!open || !existingValues || Object.keys(existingValues).length === 0) {
    return null;
  }

  const skuCount = Object.keys(existingValues).length;
  const affectedCount = resolution === CONFLICT_RESOLUTION_OPTIONS.MANUAL ? selectedSkus.size : skuCount;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon color="warning" />
          <Typography variant="h6" component="span">
            Date Conflict: {date}
          </Typography>
          <Chip label={`${affectedCount} SKUs affected`} color="warning" size="small" />
        </Box>
      </DialogTitle>

      <DialogContent>
        <Alert severity="warning" sx={{ mb: 3 }}>
          The date "{date}" already exists in the {location} inventory sheet with data for {skuCount} SKU(s).
          Choose how to resolve this conflict:
        </Alert>

        <FormControl component="fieldset" sx={{ mb: 3 }}>
          <RadioGroup
            value={resolution}
            onChange={handleResolutionChange}
          >
            <FormControlLabel
              value={CONFLICT_RESOLUTION_OPTIONS.REPLACE}
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1" fontWeight="bold">
                    Replace existing values
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Overwrite all existing data for this date with new values
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value={CONFLICT_RESOLUTION_OPTIONS.SUM}
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1" fontWeight="bold">
                    Add to existing values (Sum)
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Add new quantities to existing quantities automatically
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value={CONFLICT_RESOLUTION_OPTIONS.MANUAL}
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1" fontWeight="bold">
                    Manually select what to update
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Select specific SKUs and choose action for each
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value={CONFLICT_RESOLUTION_OPTIONS.SKIP}
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1" fontWeight="bold">
                    Skip this date
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Don't update this date, keep existing values
                  </Typography>
                </Box>
              }
            />
          </RadioGroup>
        </FormControl>

        {/* Show existing values */}
        {resolution !== CONFLICT_RESOLUTION_OPTIONS.SKIP && (
          <Box>
            <Typography variant="subtitle2" gutterBottom sx={{ mb: 1 }}>
              Existing Values ({skuCount} items):
            </Typography>
            <TableContainer component={Paper} sx={{ maxHeight: 300 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    {resolution === CONFLICT_RESOLUTION_OPTIONS.MANUAL && (
                      <TableCell padding="checkbox">
                        <Button size="small" onClick={handleSelectAll}>
                          Select All
                        </Button>
                      </TableCell>
                    )}
                    <TableCell><strong>SKU</strong></TableCell>
                    <TableCell align="center"><strong>Sales</strong></TableCell>
                    <TableCell align="center"><strong>Purchase</strong></TableCell>
                    <TableCell align="center"><strong>Return</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(existingValues).map(([sku, values]) => {
                    const selected = selectedSkus.has(sku);
                    
                    return (
                      <TableRow 
                        key={sku}
                        sx={selected ? { bgcolor: 'action.selected' } : {}}
                      >
                        {resolution === CONFLICT_RESOLUTION_OPTIONS.MANUAL && (
                          <TableCell padding="checkbox">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => handleToggleSku(sku)}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <Typography variant="body2" fontWeight="bold">
                            {sku}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          {values.sales || 0}
                        </TableCell>
                        <TableCell align="center">
                          {values.purchase || 0}
                        </TableCell>
                        <TableCell align="center">
                          {values.return || 0}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} startIcon={<CloseIcon />}>
          Cancel
        </Button>
        <Button 
          onClick={handleConfirm} 
          variant="contained" 
          startIcon={<CheckIcon />}
          color={resolution === CONFLICT_RESOLUTION_OPTIONS.SKIP ? 'warning' : 'primary'}
        >
          {resolution === CONFLICT_RESOLUTION_OPTIONS.REPLACE && 'Replace All'}
          {resolution === CONFLICT_RESOLUTION_OPTIONS.SUM && 'Add to Existing'}
          {resolution === CONFLICT_RESOLUTION_OPTIONS.MANUAL && `Update ${selectedSkus.size} Selected`}
          {resolution === CONFLICT_RESOLUTION_OPTIONS.SKIP && 'Skip This Date'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

