import React, { useState, useEffect, useRef, useCallback } from 'react';
import { notify } from '../utils/notify';
import {
  Box,
  Container,
  Paper,
  Tabs,
  Tab,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Checkbox,
  Alert,
  LinearProgress,
  Grid,
  Card,
  CardContent,
  Tooltip,
  Divider,
  Menu,
  Autocomplete
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Sync as SyncIcon,
  Upload as UploadIcon,
  Download as DownloadIcon,
  History as HistoryIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  MoreVert as MoreVertIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
  CheckCircle as CheckCircleIcon,
  Pending as PendingIcon,
  PlayArrow as PlayArrowIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import axios from 'axios';
import * as XLSX from 'xlsx';
import SKULink from '../components/SKULink';
import MissingSkusDialog from '../components/MissingSkusDialog';
import DateConflictDialog from '../components/DateConflictDialog';
import DateMappingDialog from '../components/DateMappingDialog';
import InventoryAnalytics from '../components/InventoryAnalytics';
import TransactionSplitDialog from '../components/TransactionSplitDialog';

import { API_BASE_URL } from '../config';
import FormControlLabel from '@mui/material/FormControlLabel';

// Helper functions for color validation (defined at module level for accessibility)
const getStatusColor = (status) => {
  if (!status || typeof status !== 'string') {
    return 'default';
  }
  const normalizedStatus = String(status).toLowerCase().trim();
  switch (normalizedStatus) {
    case 'received': return 'success';
    case 'partial': return 'warning';
    case 'pending': return 'default';
    default: return 'default';
  }
};

const safeColor = (color, fallback = 'default') => {
  const validColors = ['default', 'primary', 'secondary', 'success', 'error', 'warning', 'info'];
  if (!color || typeof color !== 'string') return fallback;
  return validColors.includes(color) ? color : fallback;
};

function TabPanel({ children, value, index }) {
  return (
    <div hidden={value !== index} style={{ paddingTop: '20px' }}>
      {value === index && children}
    </div>
  );
}

// Component to show individual SKUs for pack/combo SKUs
function PackComboSkuExpansion({ sku }) {
  const [individualSkus, setIndividualSkus] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (sku && (sku.startsWith('P') || sku.startsWith('C'))) {
      setLoading(true);
      axios.get(`${API_BASE_URL}/inventory/individual-skus`, {
        params: { sku }
      })
      .then(response => {
        if (response.data.success && response.data.individualSkus) {
          setIndividualSkus(response.data.individualSkus);
        }
      })
      .catch(error => {
        console.error('Error fetching individual SKUs:', error);
      })
      .finally(() => {
        setLoading(false);
      });
    }
  }, [sku]);

  if (!sku || (!sku.startsWith('P') && !sku.startsWith('C'))) {
    return null;
  }

  if (loading) {
    return (
      <Chip 
        label="Loading..."
        size="small"
        variant="outlined"
        sx={{ height: '20px', fontSize: '0.7rem' }}
      />
    );
  }

  if (individualSkus.length === 0) {
    return null;
  }

  return (
    <Tooltip
      title={
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', mb: 0.5 }}>
            Will sync as individual SKUs:
          </Typography>
          {individualSkus.map((individualSku, idx) => (
            <Typography key={idx} variant="caption" display="block">
              • {individualSku}
            </Typography>
          ))}
        </Box>
      }
      arrow
      placement="top"
    >
      <Chip 
        label={`Expands to ${individualSkus.length} SKU${individualSkus.length > 1 ? 's' : ''}`}
        size="small"
        variant="outlined"
        color="info"
        sx={{ height: '20px', fontSize: '0.7rem', cursor: 'help' }}
      />
    </Tooltip>
  );
}


// Grouped Transactions View Component
function GroupedTransactionsView({
  groupedData,
  onEdit,
  onDelete,
  onShowHistory,
  onSync,
  onSelectAll,
  onToggleSelection, // Add toggleSelection prop for individual checkbox toggling
  selectedTransactions,
  syncing,
  isSkuAvailable,
  onAddSkuClick,
  transactionType,
  onUpdateTransaction, // New prop to update transaction without reload
  showAlert, // New prop to show built-in popup
  onSplit // New prop for splitting transactions
}) {
  const [anchorElMap, setAnchorElMap] = useState({});
  const [selectedGroupSku, setSelectedGroupSku] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});

  const handleMenuOpen = (event, sku) => {
    event.stopPropagation();
    setAnchorElMap({ [sku]: event.currentTarget });
    setSelectedGroupSku(sku);
  };

  const handleMenuClose = () => {
    setAnchorElMap({});
    setSelectedGroupSku(null);
  };

  const handleAction = (action, group) => {
    handleMenuClose();
    
    if (action === 'edit') {
      // Edit all transactions for this SKU - open edit dialog for each
      if (group.transactions.length === 1) {
        onEdit(group.transactions[0].transaction);
      } else {
        // If multiple transactions, let user choose or edit the first one
        onEdit(group.transactions[0].transaction);
      }
    } else if (action === 'delete') {
      // Delete all transactions for this SKU
      const transactionIds = [...new Set(group.transactions.map(t => t.transactionId).filter(Boolean))];
      if (transactionIds.length === 0) return;
      
      // Delete all transactions without individual confirmations (already handled by parent)
      transactionIds.forEach(id => {
        onDelete(id);
      });
    } else if (action === 'sync') {
      // Sync all transactions for this SKU
      const transactionIds = [...new Set(group.transactions.map(t => t.transactionId))];
      onSync(transactionIds);
    } else if (action === 'processAll') {
      // Process all transactions in group (for Purchase - mark all as received)
      const purchaseTransactions = group.transactions.filter(t => t && t.transactionId);
      if (purchaseTransactions.length === 0) return;
      
      const updates = purchaseTransactions.map(t => ({
        transactionId: t.transactionId,
        itemIndex: t.itemIndex,
        receivedStatus: 'received',
        receivedQuantity: parseFloat(t.quantity) || 0
      }));
      
      // Call bulk update API
      const handleBulkUpdate = async () => {
        try {
          const response = await axios.post(`${API_BASE_URL}/inventory/bulk-received-status`, { updates });
          const data = response.data;
          if (data.success) {
            if (showAlert) {
              showAlert(`Successfully updated ${data.updated} transaction(s)`, 'success');
            } else {
              notify(`Successfully updated ${data.updated} transaction(s)`, 'success');
            }
            // Update transactions without page reload
            if (onUpdateTransaction) {
              onUpdateTransaction();
            }
          } else {
            const errorMsg = 'Failed to update: ' + (data.message || 'Unknown error');
            if (showAlert) {
              showAlert(errorMsg, 'error');
            } else {
              notify(errorMsg, 'error');
            }
          }
        } catch (error) {
          console.error('Error processing all:', error);
          const errorMsg = 'Failed to update: ' + (error.response?.data?.message || error.message);
          if (showAlert) {
            showAlert(errorMsg, 'error');
          } else {
            notify(errorMsg, 'error');
          }
        }
      };
      
      if (confirm(`Mark all ${purchaseTransactions.length} transaction(s) as received?`)) {
        handleBulkUpdate();
      }
    } else if (action === 'history') {
      // Show history for this SKU
      const sku = group.sku;
      if (onShowHistory) {
        onShowHistory(sku);
      }
    }
  };

  // Validate groupedData (getStatusColor and safeColor are now defined at module level above)
  if (!Array.isArray(groupedData) || groupedData.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body1" color="text.secondary">
          No transactions found
        </Typography>
      </Box>
    );
  }

  // Calculate unsynced transaction IDs for select all
  const allUnsyncedTransactionIds = groupedData.flatMap(group => 
    group.transactions
      .filter(t => t && !t.synced && t.transactionId)
      .map(t => t.transactionId)
  );
  const uniqueUnsyncedIds = [...new Set(allUnsyncedTransactionIds)];
  const unsyncedCount = uniqueUnsyncedIds.length;
  const allSelected = uniqueUnsyncedIds.length > 0 && 
    uniqueUnsyncedIds.every(id => selectedTransactions.includes(id));

  const handleSelectAll = () => {
    if (allSelected) {
      onSelectAll([]);
    } else {
      onSelectAll(uniqueUnsyncedIds);
    }
  };

  const toggleGroupSelection = (group) => {
    const groupTransactionIds = [...new Set(
      group.transactions
        .filter(t => t && t.transactionId)
        .map(t => t.transactionId)
    )];
    
    const allSelectedInGroup = groupTransactionIds.every(id => selectedTransactions.includes(id));
    
    if (allSelectedInGroup) {
      // Deselect all in this group
      onSelectAll(selectedTransactions.filter(id => !groupTransactionIds.includes(id)));
    } else {
      // Select all in this group
      onSelectAll([...new Set([...selectedTransactions, ...groupTransactionIds])]);
    }
  };

  const toggleGroupExpand = (sku) => {
    setExpandedGroups(prev => ({
      ...prev,
      [sku]: !prev[sku]
    }));
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          📦 Grouped by SKU - {transactionType} ({groupedData.length} SKUs)
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Button
            variant="outlined"
            size="small"
            onClick={handleSelectAll}
          >
            {allSelected ? 'Deselect All' : `Select All Unsynced (${unsyncedCount})`}
          </Button>
          <Button
            variant="contained"
            startIcon={<SyncIcon />}
            onClick={() => onSync(selectedTransactions)}
            disabled={selectedTransactions.length === 0 || syncing}
            size="small"
          >
            Sync Selected ({selectedTransactions.length})
          </Button>
        </Box>
      </Box>

      <Grid container spacing={2}>
        {groupedData.map((group) => {
          // Validate group data
          if (!group || !group.sku || !Array.isArray(group.transactions)) {
            return null; // Skip invalid groups
          }
          
          const unsyncedCount = group.transactions.filter(t => t && !t.synced).length;
          const firstTransaction = group.transactions[0];
          const location = firstTransaction?.location || 'Okhla';
          const isSkuMissing = isSkuAvailable && !isSkuAvailable(group.sku, location);
          
          // Get transaction IDs for this group
          const groupTransactionIds = [...new Set(
            group.transactions
              .filter(t => t && t.transactionId)
              .map(t => t.transactionId)
          )];
          const allSelectedInGroup = groupTransactionIds.length > 0 && 
            groupTransactionIds.every(id => selectedTransactions.includes(id));
          const someSelectedInGroup = groupTransactionIds.some(id => selectedTransactions.includes(id));
          const isExpanded = expandedGroups[group.sku] || false;
          
          // Create unique key using SKU + Date
          const groupKey = group.date ? `${group.sku}_${group.date}` : group.sku;
          
          return (
            <Grid item xs={12} sm={6} md={4} lg={3} key={groupKey}>
              <Card variant="outlined" sx={{ 
                height: '100%', 
                minHeight: '420px',
                display: 'flex', 
                flexDirection: 'column', 
                fontSize: '0.875rem', 
                maxHeight: '500px', 
                overflow: 'hidden' 
              }}>
                <CardContent sx={{ flexGrow: 1, p: 1.5, '&:last-child': { pb: 1.5 }, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Checkbox
                      checked={allSelectedInGroup}
                      indeterminate={someSelectedInGroup && !allSelectedInGroup}
                      onChange={() => toggleGroupSelection(group)}
                      disabled={groupTransactionIds.length === 0}
                      sx={{ mr: 1 }}
                    />
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <SKULink sku={group.sku} />
                        {isSkuMissing && (
                          <Chip 
                            label="SKU Not Found" 
                            size="small" 
                            color="error" 
                            sx={{ height: 20 }}
                          />
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        {group.productName || 'N/A'}
                      </Typography>
                      {group.date && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          📅 Date: {new Date(group.date).toLocaleDateString()}
                        </Typography>
                      )}
                      {/* Order Dropdown - Show if multiple orders */}
                      {group.orders && group.orders.length > 1 && (
                        <FormControl size="small" fullWidth sx={{ mt: 1 }}>
                          <InputLabel>Orders ({group.orders.length})</InputLabel>
                          <Select
                            value=""
                            displayEmpty
                            label={`Orders (${group.orders.length})`}
                          >
                            {group.orders.map((orderName, idx) => (
                              <MenuItem key={idx} value={orderName}>
                                {orderName}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}
                      {group.orders && group.orders.length === 1 && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                          Order: {group.orders[0]}
                        </Typography>
                      )}
                    </Box>
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, group.sku)}
                      sx={{ ml: 1 }}
                    >
                      <MoreVertIcon />
                    </IconButton>
                    <Menu
                      anchorEl={anchorElMap[group.sku]}
                      open={Boolean(anchorElMap[group.sku])}
                      onClose={handleMenuClose}
                    >
                      <MenuItem onClick={() => handleAction('edit', group)}>
                        <EditIcon sx={{ mr: 1, fontSize: 18 }} /> Edit
                      </MenuItem>
                      {onSplit && group.transactions.length > 0 && (
                        <MenuItem onClick={() => {
                          handleMenuClose();
                          if (group.transactions[0]?.transaction) {
                            onSplit(group.transactions[0].transaction);
                          }
                        }}>
                          <PlayArrowIcon sx={{ mr: 1, fontSize: 18 }} /> Split Transaction
                        </MenuItem>
                      )}
                      <MenuItem onClick={() => handleAction('sync', group)} disabled={unsyncedCount === 0 || syncing}>
                        <SyncIcon sx={{ mr: 1, fontSize: 18 }} /> Sync to Sheets ({unsyncedCount})
                      </MenuItem>
                      {transactionType === 'Purchase' && group.transactions.length > 0 && (
                        <MenuItem onClick={() => handleAction('processAll', group)}>
                          <PlayArrowIcon sx={{ mr: 1, fontSize: 18 }} /> Process All
                        </MenuItem>
                      )}
                      <MenuItem onClick={() => handleAction('history', group)}>
                        <HistoryIcon sx={{ mr: 1, fontSize: 18 }} /> View History
                      </MenuItem>
                      <Divider />
                      <MenuItem onClick={() => handleAction('delete', group)} sx={{ color: 'error.main' }}>
                        <DeleteIcon sx={{ mr: 1, fontSize: 18 }} /> Delete
                      </MenuItem>
                    </Menu>
                  </Box>

                  <Box sx={{ mt: 1 }}>
                    <Chip 
                      label={`Total Qty: ${group.totalQuantity}`} 
                      color="primary" 
                      size="small"
                      sx={{ mr: 1, mb: 1 }}
                    />
                    <Chip 
                      label={`${group.transactions.length} transaction${group.transactions.length > 1 ? 's' : ''}`} 
                      size="small"
                      variant="outlined"
                    />
                  </Box>

                  {/* Purchase-specific fields */}
                  {transactionType === 'Purchase' && (
                    <Box sx={{ mt: 1 }}>
                      {/* Aggregate stats for group */}
                      {(() => {
                        const purchaseTransactions = group.transactions.filter(t => t && t.transactionId);
                        const totalReceived = purchaseTransactions.reduce((sum, t) => sum + (parseFloat(t.receivedQuantity) || 0), 0);
                        const totalQty = group.totalQuantity || 0;
                        const totalRemainder = totalQty - totalReceived;
                        const allReceived = purchaseTransactions.length > 0 && purchaseTransactions.every(t => 
                          (parseFloat(t.receivedQuantity) || 0) >= (parseFloat(t.quantity) || 0)
                        );
                        const allPending = purchaseTransactions.every(t => 
                          (parseFloat(t.receivedQuantity) || 0) === 0
                        );
                        
                        return (
                          <>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                              <Chip 
                                label={`Total Received: ${totalReceived}/${totalQty}`}
                                size="small"
                                color={safeColor(getStatusColor(allReceived ? 'received' : (totalReceived > 0 ? 'partial' : 'pending')))}
                              />
                              {totalRemainder > 0 && (
                                <Chip 
                                  label={`Pending: ${totalRemainder}`}
                                  size="small"
                                  variant="outlined"
                                  color="warning"
                                />
                              )}
                            </Box>
                            
                            {/* Bulk actions for Purchase transactions */}
                            {purchaseTransactions.length > 0 && (
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="success"
                                  startIcon={<CheckCircleIcon />}
                                  onClick={() => {
                                    // Open popup to enter quantity received
                                    const totalQty = purchaseTransactions.reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0);
                                    const receivedQty = purchaseTransactions.reduce((sum, t) => sum + (parseFloat(t.receivedQuantity) || 0), 0);
                                    const maxQty = totalQty;
                                    
                                    const qtyStr = prompt(`Enter quantity received (Max: ${maxQty}, Current: ${receivedQty}):`, maxQty.toString());
                                    if (qtyStr === null) return; // User cancelled
                                    
                                    const qty = parseFloat(qtyStr);
                                    if (isNaN(qty) || qty < 0 || qty > maxQty) {
                                      const errorMsg = `Invalid quantity. Must be between 0 and ${maxQty}`;
                                      if (showAlert) {
                                        showAlert(errorMsg, 'error');
                                      } else {
                                        notify(errorMsg, 'error');
                                      }
                                      return;
                                    }
                                    
                                    // Distribute quantity across transactions proportionally or mark all as received
                                    const updates = purchaseTransactions.map(t => {
                                      const tranQty = parseFloat(t.quantity) || 0;
                                      const proportion = tranQty / totalQty;
                                      const distributedQty = Math.round(qty * proportion);
                                      return {
                                        transactionId: t.transactionId,
                                        itemIndex: t.itemIndex,
                                        receivedStatus: distributedQty >= tranQty ? 'received' : (distributedQty > 0 ? 'partial' : 'pending'),
                                        receivedQuantity: distributedQty
                                      };
                                    });
                                    
                                    // Execute bulk update
                                    axios.post(`${API_BASE_URL}/inventory/bulk-received-status`, { updates })
                                      .then(response => {
                                        if (response.data.success) {
                                          if (showAlert) {
                                            showAlert(`Successfully updated ${response.data.updated} transaction(s)`, 'success');
                                          } else {
                                            notify(`Successfully updated ${response.data.updated} transaction(s)`, 'success');
                                          }
                                          // Update transactions without page reload
                                          if (onUpdateTransaction) {
                                            onUpdateTransaction();
                                          }
                                        } else {
                                          const errorMsg = 'Failed to update: ' + (response.data.message || 'Unknown error');
                                          if (showAlert) {
                                            showAlert(errorMsg, 'error');
                                          } else {
                                            notify(errorMsg, 'error');
                                          }
                                        }
                                      })
                                      .catch(error => {
                                        console.error('Error marking as received:', error);
                                        const errorMsg = 'Failed to update: ' + (error.response?.data?.message || error.message);
                                        if (showAlert) {
                                          showAlert(errorMsg, 'error');
                                        } else {
                                          notify(errorMsg, 'error');
                                        }
                                      });
                                  }}
                                  sx={{ fontSize: '0.7rem', py: 0.3 }}
                                >
                                  Mark Received
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="warning"
                                  startIcon={<PendingIcon />}
                                  onClick={async () => {
                                    // Mark all as pending
                                    const updates = purchaseTransactions.map(t => ({
                                      transactionId: t.transactionId,
                                      itemIndex: t.itemIndex,
                                      receivedStatus: 'pending',
                                      receivedQuantity: 0
                                    }));
                                    
                                    try {
                                      const response = await axios.post(`${API_BASE_URL}/inventory/bulk-received-status`, { updates });
                                      if (response.data.success) {
                                        if (showAlert) {
                                          showAlert(`Successfully updated ${response.data.updated || updates.length} transaction(s)`, 'success');
                                        } else {
                                          notify(`Successfully updated ${response.data.updated || updates.length} transaction(s)`, 'success');
                                        }
                                        // Update transactions without page reload
                                        if (onUpdateTransaction) {
                                          onUpdateTransaction();
                                        }
                                      } else {
                                        const errorMsg = 'Failed to update: ' + (response.data.message || 'Unknown error');
                                        if (showAlert) {
                                          showAlert(errorMsg, 'error');
                                        } else {
                                          notify(errorMsg, 'error');
                                        }
                                      }
                                    } catch (error) {
                                      console.error('Error marking all as pending:', error);
                                      const errorMsg = 'Failed to update: ' + (error.response?.data?.message || error.message);
                                      if (showAlert) {
                                        showAlert(errorMsg, 'error');
                                      } else {
                                        notify(errorMsg, 'error');
                                      }
                                    }
                                  }}
                                  sx={{ fontSize: '0.7rem', py: 0.3 }}
                                >
                                  Mark All Pending
                                </Button>
                              </Box>
                            )}
                            
                          </>
                        );
                      })()}
                    </Box>
                  )}

                  {/* Transactions Details Dropdown */}
                  <Box sx={{ mt: 2 }}>
                    <details>
                      <summary style={{ cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>
                        📋 View Transactions ({group.transactions.length})
                      </summary>
                      <Box sx={{ mt: 1, pl: 2, borderLeft: (theme) => `2px solid ${theme.palette.divider}`, maxHeight: '200px', overflowY: 'auto' }}>
                        {group.transactions.map((tran, idx) => {
                          // Validate transaction data
                          if (!tran) return null;
                          
                          // Safe date parsing
                          let dateStr = 'N/A';
                          try {
                            if (tran.date) {
                              const date = new Date(tran.date);
                              if (!isNaN(date.getTime())) {
                                dateStr = date.toLocaleDateString();
                              }
                            }
                          } catch (e) {
                            console.warn('Error parsing date:', e);
                          }
                          
                          const isTranSelected = tran.transactionId && selectedTransactions.includes(tran.transactionId);
                          const canSelect = tran.transactionId && !tran.synced;
                          
                          return (
                            <Box key={`${tran.transactionId || idx}-${idx}`} sx={{ py: 0.5, borderBottom: (theme) => idx < group.transactions.length - 1 ? `1px solid ${theme.palette.divider}` : 'none' }}>
                              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                                {canSelect && (
                                  <Checkbox
                                    checked={isTranSelected}
                                    onChange={(e) => {
                                      e.stopPropagation(); // Prevent event bubbling to parent handlers
                                      // CRITICAL FIX: Only toggle THIS specific transaction
                                      if (onToggleSelection) {
                                        onToggleSelection(tran.transactionId);
                                      } else {
                                        // Fallback: toggle using selectAll with proper array handling
                                        const newSelected = isTranSelected
                                          ? selectedTransactions.filter(id => id !== tran.transactionId)
                                          : [...selectedTransactions, tran.transactionId];
                                        onSelectAll(newSelected);
                                      }
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation(); // Also stop click propagation
                                      e.preventDefault(); // Prevent default checkbox behavior
                                    }}
                                    size="small"
                                    sx={{ mt: -0.5, ml: -1 }}
                                  />
                                )}
                                <Box sx={{ flex: 1 }}>
                                  <Typography variant="caption" display="block" sx={{ fontWeight: 500 }}>
                                    {tran.orderName || 'N/A'}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary" display="block">
                                    📅 {dateStr} | 
                                    Qty: {tran.quantity || 0} | 
                                    {tran.location || 'N/A'}
                                  </Typography>
                                  {tran.vendor && tran.vendor !== 'N/A' && (
                                    <Typography variant="caption" color="text.secondary" display="block">
                                      Vendor: {tran.vendor}
                                    </Typography>
                                  )}
                                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                                    <Chip 
                                      label={tran.synced ? 'Synced' : 'Unsynced'} 
                                      size="small" 
                                      color={safeColor(tran.synced ? 'success' : 'default')}
                                      sx={{ height: 16, fontSize: '0.65rem' }}
                                    />
                                    {tran.transaction && (
                                      <IconButton
                                        size="small"
                                        onClick={() => onEdit(tran.transaction)}
                                        sx={{ height: 20, width: 20 }}
                                      >
                                        <EditIcon sx={{ fontSize: 14 }} />
                                      </IconButton>
                                    )}
                                  </Box>
                                </Box>
                              </Box>
                            </Box>
                          );
                        })}
                      </Box>
                    </details>
                  </Box>

                  {/* Add SKU button if missing */}
                  {isSkuMissing && (
                    <Box sx={{ mt: 2 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<AddIcon />}
                        onClick={() => onAddSkuClick(group.sku, group.transactions[0]?.location || 'Okhla', group.productName)}
                        fullWidth
                      >
                        Add SKU to Sheet
                      </Button>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}


// Transaction Table Component
// Transaction Table Component
function TransactionTable({
  transactions,
  selectedTransactions,
  onToggleSelection,
  onSelectAll,
  onEdit,
  onDelete,
  onShowHistory,
  onSync,
  syncing,
  isSkuAvailable,
  onAddSkuClick,
  groupedData = null // Optional grouped data for grouped table view
}) {
  const [expandedSkus, setExpandedSkus] = useState({});
  const [groupedView, setGroupedView] = useState(false);
  
  const unsyncedCount = transactions.filter(t => !t.syncedToSheets).length;
  
  // Toggle expand for grouped rows
  const toggleExpand = (sku) => {
    setExpandedSkus(prev => ({
      ...prev,
      [sku]: !prev[sku]
    }));
  };
  
  // Select all transactions in a group
  const toggleGroupSelection = (groupTransactionIds) => {
    const allSelected = groupTransactionIds.every(id => selectedTransactions.includes(id));
    if (allSelected) {
      // Deselect all
      onToggleSelection(groupTransactionIds[0]); // Use toggleSelection for each
      groupTransactionIds.slice(1).forEach(id => {
        if (selectedTransactions.includes(id)) {
          onToggleSelection(id);
        }
      });
    } else {
      // Select all unsynced in group
      groupTransactionIds.forEach(id => {
        if (!selectedTransactions.includes(id)) {
          const transaction = transactions.find(t => t._id === id);
          if (transaction && !transaction.syncedToSheets) {
            onToggleSelection(id);
          }
        }
      });
    }
  };

  // Use grouped data if available and toggle is on
  const displayGrouped = groupedData && groupedData.length > 0 && groupedView;

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {groupedData && groupedData.length > 0 && (
            <Button
              variant={groupedView ? "contained" : "outlined"}
              size="small"
              onClick={() => setGroupedView(!groupedView)}
            >
              {groupedView ? '📋 Flat View' : '📦 Grouped View'}
            </Button>
          )}
          <Button
            variant="outlined"
            size="small"
            onClick={onSelectAll}
          >
            Select All Unsynced ({unsyncedCount})
          </Button>
          <Button
            variant="outlined"
            color="error"
            size="small"
            onClick={() => {
              if (selectedTransactions.length === 0) return;
              // Call onDelete with all selected IDs - parent will handle confirmation
              selectedTransactions.forEach(id => onDelete(id));
            }}
            disabled={selectedTransactions.length === 0}
          >
            Delete Selected ({selectedTransactions.length})
          </Button>
        </Box>
        <Button
          variant="contained"
          startIcon={<SyncIcon />}
          onClick={onSync}
          disabled={selectedTransactions.length === 0 || syncing}
        >
          Sync Selected to Sheets
        </Button>
      </Box>

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow sx={{
              backgroundColor: (theme) => theme.palette.mode === 'dark' ? theme.palette.action.hover : theme.palette.grey[100],
              '& .MuiTableCell-root': {
                color: (theme) => theme.palette.text.primary,
                fontWeight: 600
              }
            }}>
              <TableCell padding="checkbox">Select</TableCell>
              {displayGrouped && <TableCell width={50}></TableCell>}
              <TableCell>Date</TableCell>
              <TableCell>Location</TableCell>
              <TableCell>SKU</TableCell>
              <TableCell>Product</TableCell>
              <TableCell align="right">Quantity</TableCell>
              {transactions.length > 0 && transactions[0].transactionType === 'Purchase' && (
                <>
                  <TableCell align="right">Received</TableCell>
                  <TableCell align="right">Remainder</TableCell>
                  <TableCell>Receipt Status</TableCell>
                </>
              )}
              <TableCell>Order</TableCell>
              <TableCell>Vendor</TableCell>
              <TableCell>Source</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {displayGrouped ? (
              // Grouped view
              groupedData.map((group) => {
                if (!group || !group.sku || !Array.isArray(group.transactions)) return null;
                
                const isExpanded = expandedSkus[group.sku];
                const groupTransactionIds = [...new Set(group.transactions.map(t => t.transactionId).filter(Boolean))];
                const allSelectedInGroup = groupTransactionIds.length > 0 && 
                  groupTransactionIds.every(id => selectedTransactions.includes(id));
                const someSelectedInGroup = groupTransactionIds.some(id => selectedTransactions.includes(id));
                const firstTransaction = group.transactions[0];
                const location = firstTransaction?.location || 'Okhla';
                const isSkuMissing = isSkuAvailable && !isSkuAvailable(group.sku, location);
                
                return (
                  <React.Fragment key={group.sku}>
                    {/* Group header row */}
                    <TableRow sx={{ 
                      backgroundColor: (theme) => theme.palette.mode === 'dark' ? theme.palette.action.hover : theme.palette.grey[100],
                      '& .MuiTableCell-root': {
                        color: (theme) => theme.palette.text.primary
                      }
                    }}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={allSelectedInGroup}
                          indeterminate={someSelectedInGroup && !allSelectedInGroup}
                          onChange={() => toggleGroupSelection(groupTransactionIds)}
                          disabled={groupTransactionIds.length === 0}
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() => toggleExpand(group.sku)}
                        >
                          {isExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                        </IconButton>
                      </TableCell>
                      <TableCell colSpan={3}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <SKULink sku={group.sku} />
                          {isSkuMissing && (
                            <Chip label="SKU Not Found" color="error" size="small" variant="outlined" />
                          )}
                          {/* Show original pack/combo SKU if this was expanded */}
                          {group.transactions[0]?.originalSku && group.transactions[0].originalSku !== group.sku && (
                            <Chip 
                              label={`From Pack/Combo: ${group.transactions[0].originalSku}`}
                              size="small"
                              variant="outlined"
                              color="primary"
                              sx={{ height: '20px', fontSize: '0.7rem' }}
                            />
                          )}
                          {/* Show individual SKUs for pack/combo SKUs that haven't been expanded yet */}
                          {!group.transactions[0]?.originalSku && (group.sku?.startsWith('P') || group.sku?.startsWith('C')) && (
                            <PackComboSkuExpansion sku={group.sku} />
                          )}
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            {group.productName || 'N/A'}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                        Total: {group.totalQuantity}
                      </TableCell>
                      {transactions.length > 0 && transactions[0].transactionType === 'Purchase' ? (
                        <>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                            Received: {group.transactions.reduce((sum, t) => sum + (t.receivedQuantity || 0), 0)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                            Remainder: {group.transactions.reduce((sum, t) => sum + (t.remainder || 0), 0)}
                          </TableCell>
                          <TableCell align="center">
                            <Chip 
                              label={`${group.transactions.length} transaction${group.transactions.length > 1 ? 's' : ''}`}
                              size="small"
                            />
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell colSpan={3} align="center">
                            <Chip 
                              label={`${group.transactions.length} transaction${group.transactions.length > 1 ? 's' : ''}`}
                              size="small"
                            />
                          </TableCell>
                        </>
                      )}
                      <TableCell>
                        <div>
                          <div>{group.transactions[0]?.orderName || 'N/A'}</div>
                          {group.transactions[0]?.orderId && (
                            <Typography variant="caption" color="textSecondary">
                              ID: {group.transactions[0].shopifyOrderId || group.transactions[0].orderId}
                            </Typography>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{group.transactions[0]?.vendor || 'N/A'}</TableCell>
                      <TableCell>{group.transactions[0]?.transaction?.source || 'N/A'}</TableCell>
                      <TableCell>
                        <Chip 
                          label={group.transactions.every(t => t && t.synced) ? 'Synced' : 'Unsynced'}
                          color={safeColor(group.transactions.every(t => t && t.synced) ? 'success' : 'default')}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                    
                    {/* Expanded transaction rows */}
                    {isExpanded && group.transactions.map((tran, idx) => {
                      if (!tran || !tran.transaction) return null;
                      const trans = tran.transaction;
                      const item = tran.item || {};
                      const isPurchase = trans.transactionType === 'Purchase';
                      
                      return (
                        <TableRow key={`${trans._id}-${idx}`} sx={{ 
                          backgroundColor: (theme) => theme.palette.mode === 'dark' ? theme.palette.action.selected : theme.palette.grey[50],
                          '& .MuiTableCell-root': {
                            color: (theme) => theme.palette.text.primary
                          }
                        }}>
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={selectedTransactions.includes(trans._id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                onToggleSelection(trans._id);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              disabled={trans.syncedToSheets}
                            />
                          </TableCell>
                          <TableCell></TableCell>
                          <TableCell>{new Date(tran.date || trans.transactionDate).toLocaleDateString()}</TableCell>
                          <TableCell><Chip label={tran.location || trans.location} size="small" /></TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                              <SKULink sku={item.sku || group.sku} />
                              {/* Show original pack/combo SKU if this was expanded */}
                              {(item.originalSku || group.transactions[0]?.originalSku) && 
                               (item.originalSku || group.transactions[0]?.originalSku) !== (item.sku || group.sku) && (
                                <Chip 
                                  label={`From: ${item.originalSku || group.transactions[0]?.originalSku}`}
                                  size="small"
                                  variant="outlined"
                                  color="primary"
                                  sx={{ height: '20px', fontSize: '0.7rem' }}
                                />
                              )}
                              {/* Show individual SKUs for pack/combo SKUs that haven't been expanded yet */}
                              {!(item.originalSku || group.transactions[0]?.originalSku) && 
                               (item.sku || group.sku) && 
                               ((item.sku || group.sku).startsWith('P') || (item.sku || group.sku).startsWith('C')) && (
                                <PackComboSkuExpansion sku={item.sku || group.sku} />
                              )}
                            </Box>
                          </TableCell>
                          <TableCell>{item.productName || group.productName}</TableCell>
                          <TableCell align="right">{tran.quantity || item.quantity}</TableCell>
                          {isPurchase && (
                            <>
                              <TableCell align="right">
                                <Chip label={tran.receivedQuantity || 0} color="primary" size="small" />
                              </TableCell>
                              <TableCell align="right">
                                <Chip 
                                  label={tran.remainder || 0} 
                                  color={safeColor((tran.remainder || 0) > 0 ? 'warning' : 'success')}
                                  size="small" 
                                />
                              </TableCell>
                              <TableCell>
                                <Chip 
                                  label={(tran.receivedStatus || 'pending').charAt(0).toUpperCase() + (tran.receivedStatus || 'pending').slice(1)}
                                  color={safeColor(getStatusColor(tran.receivedStatus || 'pending'))}
                                  size="small"
                                />
                              </TableCell>
                            </>
                          )}
                          <TableCell>
                            <div>
                              <div>{tran.orderName || item.orderName || 'N/A'}</div>
                              {(tran.orderId || item.orderId) && (
                                <Typography variant="caption" color="textSecondary">
                                  ID: {tran.shopifyOrderId || item.shopifyOrderId || tran.orderId || item.orderId}
                                </Typography>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{tran.vendor || item.vendorName || 'N/A'}</TableCell>
                          <TableCell>{trans.source || 'N/A'}</TableCell>
                          <TableCell>
                            <Chip 
                              label={(tran && tran.synced) || (trans && trans.syncedToSheets) ? 'Synced' : 'Unsynced'}
                              color={safeColor((tran && tran.synced) || (trans && trans.syncedToSheets) ? 'success' : 'default')}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                              <Tooltip title="Edit">
                                <IconButton size="small" onClick={() => onEdit(trans)}>
                                  <EditIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete">
                                <IconButton size="small" onClick={() => onDelete(trans._id)} color="error">
                                  <DeleteIcon />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </React.Fragment>
                );
              })
            ) : (
              // Flat view (existing code)
              transactions.map((trans) =>
              trans.items.map((item, idx) => {
                const isPurchase = trans.transactionType === 'Purchase';
                const remainder = item.quantity - (item.receivedQuantity || 0);
                const receivedStatus = item.receivedStatus || 'pending';
                
                return (
                  <TableRow key={`${trans._id}-${idx}`}>
                    {idx === 0 && (
                      <TableCell padding="checkbox" rowSpan={trans.items.length}>
                        <Checkbox
                          checked={selectedTransactions.includes(trans._id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            onToggleSelection(trans._id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          disabled={trans.syncedToSheets}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      {new Date(trans.transactionDate).toLocaleDateString()}
                    </TableCell>
                    {idx === 0 && (
                      <TableCell rowSpan={trans.items.length}>
                        <Chip label={trans.location} size="small" />
                      </TableCell>
                    )}
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <SKULink sku={item.sku} />
                        {/* Show original pack/combo SKU if this was expanded */}
                        {item.originalSku && item.originalSku !== item.sku && (
                          <Chip 
                            label={`From: ${item.originalSku}`}
                            size="small"
                            variant="outlined"
                            color="primary"
                            sx={{ height: '20px', fontSize: '0.7rem' }}
                          />
                        )}
                        {/* Show individual SKUs for pack/combo SKUs that haven't been expanded yet */}
                        {!item.originalSku && (item.sku?.startsWith('P') || item.sku?.startsWith('C')) && (
                          <PackComboSkuExpansion sku={item.sku} />
                        )}
                        {isSkuAvailable && !isSkuAvailable(item.sku, trans.location) && (
                          <>
                            <Chip 
                              label="SKU Not Found" 
                              color="error" 
                              size="small" 
                              variant="outlined"
                            />
                            <Button
                              variant="contained"
                              color="primary"
                              size="small"
                              onClick={() => onAddSkuClick && onAddSkuClick(item.sku, trans.location, item.productName)}
                              sx={{ minWidth: 'auto', px: 1 }}
                            >
                              Add
                            </Button>
                          </>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>{item.productName}</TableCell>
                    <TableCell align="right">{item.quantity}</TableCell>
                    
                    {/* Purchase-specific columns */}
                    {isPurchase && (
                      <>
                        <TableCell align="right">
                          <Chip 
                            label={item.receivedQuantity || 0} 
                            color="primary" 
                            size="small" 
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Chip 
                            label={remainder || 0} 
                            color={safeColor((remainder || 0) > 0 ? 'warning' : 'success')}
                            size="small" 
                          />
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={((receivedStatus || 'pending').charAt(0).toUpperCase() + (receivedStatus || 'pending').slice(1))} 
                            color={safeColor(getStatusColor(receivedStatus || 'pending'))}
                            size="small" 
                          />
                        </TableCell>
                      </>
                    )}
                    
                    <TableCell>{item.orderName}</TableCell>
                    <TableCell>{item.vendorName}</TableCell>
                    {idx === 0 && (
                      <TableCell rowSpan={trans.items.length}>
                        {trans.autoCreated && trans.sourceOrder ? (
                          <Chip label={trans.sourceOrder.orderName || 'Order'} size="small" variant="outlined" />
                        ) : (
                          'Manual'
                        )}
                      </TableCell>
                    )}
                    {idx === 0 && (
                      <TableCell rowSpan={trans.items.length}>
                        {trans.syncedToSheets ? (
                          <Chip label="Synced" color="success" size="small" />
                        ) : (
                          <Chip label="Pending" color="default" size="small" />
                        )}
                      </TableCell>
                    )}
                  {idx === 0 && (
                    <TableCell rowSpan={trans.items.length}>
                      <Tooltip title="View History">
                        <IconButton size="small" onClick={() => onShowHistory(item.sku)}>
                          <HistoryIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => onEdit(trans)}>
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" onClick={() => onDelete(trans._id)} color="error">
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
                  </TableRow>
                );
              })
            )
          )}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}


// Main Inventory Count Component
export default function InventoryCount() {
  const [activeTab, setActiveTab] = useState(0);
  const [salesTransactions, setSalesTransactions] = useState([]);
  const [purchaseTransactions, setPurchaseTransactions] = useState([]);
  const [returnTransactions, setReturnTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedTransactions, setSelectedTransactions] = useState([]);
  
  // Dialog states
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [openImportDialog, setOpenImportDialog] = useState(false);
  const [openLocationDialog, setOpenLocationDialog] = useState(false);
  const [openHistoryDialog, setOpenHistoryDialog] = useState(false);
  
  // Form states
  const [formData, setFormData] = useState({
    location: 'Okhla',
    transactionDate: new Date().toISOString().split('T')[0],
    items: []
  });
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState('Okhla');
  const [skuHistory, setSkuHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  // Alert state
  const [alert, setAlert] = useState({ show: false, message: '', severity: 'success' });
  
  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState({ 
    open: false, 
    title: '', 
    message: '', 
    onConfirm: null,
    onCancel: null 
  });

  // Enhanced states for new features
  const [groupedData, setGroupedData] = useState([]);
  const [missingSkus, setMissingSkus] = useState([]);
  const [showMissingSkusDialog, setShowMissingSkusDialog] = useState(false);
  const [showDateConflictDialog, setShowDateConflictDialog] = useState(false);
  const [conflictingDates, setConflictingDates] = useState([]);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [removeAfterSync, setRemoveAfterSync] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [selectedLocationForSync, setSelectedLocationForSync] = useState('Okhla');
  const [syncMode, setSyncMode] = useState('sum');
  const [showDateMappingDialog, setShowDateMappingDialog] = useState(false);
  const [dateMappingData, setDateMappingData] = useState(null);
  const [pendingImportData, setPendingImportData] = useState(null);
  const [syncDate, setSyncDate] = useState(new Date().toISOString().split('T')[0]);
  
  // SKU availability states
  const [skuAvailabilityMap, setSkuAvailabilityMap] = useState({});
  const [checkingSku, setCheckingSku] = useState(false);
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  
  // Transaction split dialog state
  const [openSplitDialog, setOpenSplitDialog] = useState(false);
  const [transactionToSplit, setTransactionToSplit] = useState(null);
  
  const [openAddSkuDialog, setOpenAddSkuDialog] = useState(false);
  const [currentSkuToAdd, setCurrentSkuToAdd] = useState(null);
  const [addSkuFormData, setAddSkuFormData] = useState({
    location: 'Okhla',
    sku: '',
    productName: '',
    safetyStock: 0,
    initial: 0,
    createTransaction: false,
    transactionType: 'Purchase'
  });

  // Vendor suggestions state
  const [vendors, setVendors] = useState([]);
  const [sheetVendors, setSheetVendors] = useState([]);
  const [vendorSuggestions, setVendorSuggestions] = useState({}); // Map of SKU to suggested vendor

  // View mode state (table or grouped)
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'grouped'

  // Stock levels state for live inventory counts
  const [stockOkhla, setStockOkhla] = useState(null);
  const [stockBahadurgarh, setStockBahadurgarh] = useState(null);
  const [stockLoading, setStockLoading] = useState(false);
  
  // Background sync job tracking
  const [activeSyncJob, setActiveSyncJob] = useState(null);
  const [syncProgressData, setSyncProgressData] = useState(null);
  // Use ref for interval to avoid re-render issues
  const progressPollIntervalRef = useRef(null);
  // Use ref for SKU availability map to avoid dependency loops
  const skuAvailabilityMapRef = useRef({});

  // Define helper function - MUST be before any useEffects
  const getCurrentTransactions = useCallback(() => {
    const transactions = [salesTransactions, purchaseTransactions, returnTransactions][activeTab];
    return Array.isArray(transactions) ? transactions : [];
  }, [salesTransactions, purchaseTransactions, returnTransactions, activeTab]);

  // Filter transactions based on search term (fuzzy/approximate search)
  const filterTransactions = useCallback((transactions) => {
    if (!searchTerm || searchTerm.trim() === '') {
      return transactions;
    }
    
    const searchLower = searchTerm.toLowerCase().trim();
    
    return transactions.filter(trans => {
      // Search in transaction items (SKU, productName)
      const itemMatch = trans.items?.some(item => {
        const skuMatch = item.sku?.toLowerCase().includes(searchLower);
        const productMatch = item.productName?.toLowerCase().includes(searchLower);
        return skuMatch || productMatch;
      });
      
      // Search in order name
      const orderMatch = trans.orderName?.toLowerCase().includes(searchLower);
      
      // Search in source order name if available
      const sourceOrderMatch = trans.sourceOrder?.orderName?.toLowerCase().includes(searchLower);
      
      return itemMatch || orderMatch || sourceOrderMatch;
    });
  }, [searchTerm]);

  // Check SKU availability function - MUST be before useEffects, no circular dependencies
  const checkSkuAvailabilityForTransactions = useCallback(async () => {
    const transactions = getCurrentTransactions();
    if (transactions.length === 0) return;

    setCheckingSku(true);
    // Use ref to access current map without creating dependency loop
    const availabilityMap = { ...skuAvailabilityMapRef.current };
    
    try {
      // Get all unique SKUs from transactions grouped by location
      const skusByLocation = {};
      transactions.forEach(trans => {
        trans.items.forEach(item => {
          if (item.sku) {
            const location = trans.location || 'Okhla';
            if (!skusByLocation[location]) {
              skusByLocation[location] = [];
            }
            const key = `${item.sku}_${location}`;
            // Only add if not already checked and not already in the list
            if (availabilityMap[key] === undefined && !skusByLocation[location].some(s => s.sku === item.sku)) {
              skusByLocation[location].push({ sku: item.sku, location });
            }
          }
        });
      });

      // Batch check SKUs for each location
      for (const [location, skus] of Object.entries(skusByLocation)) {
        if (skus.length === 0) continue;

        try {
          // Use batch endpoint to check multiple SKUs at once
          const response = await axios.post(`${API_BASE_URL}/inventory/batch-check-sku-availability`, {
            skus,
            location
          });
          
          if (response.data.success && Array.isArray(response.data.results)) {
            response.data.results.forEach(result => {
              const key = `${result.sku}_${result.location}`;
              availabilityMap[key] = {
                found: result.found,
                foundSheet: result.foundSheet
              };
            });
          }
        } catch (error) {
          console.error(`Error batch checking SKUs for ${location}:`, error);
          // Fallback: mark all as not found on error
          skus.forEach(({ sku }) => {
            const key = `${sku}_${location}`;
            availabilityMap[key] = { found: false };
          });
        }
      }

      setSkuAvailabilityMap(availabilityMap);
      // Update ref immediately to keep in sync
      skuAvailabilityMapRef.current = availabilityMap;
    } catch (error) {
      console.error('Error checking SKU availability:', error);
    } finally {
      setCheckingSku(false);
    }
  }, [getCurrentTransactions]);

  // ALL useEffects MUST come after all useState and useCallback/useRef
  // Sync ref with state - must be stable, no conditional rendering
  useEffect(() => {
    skuAvailabilityMapRef.current = skuAvailabilityMap;
  }, [skuAvailabilityMap]);

  useEffect(() => {
    loadTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Load stock levels on mount
  useEffect(() => {
    const fetchStockLevels = async () => {
      try {
        setStockLoading(true);
        const [okhlaRes, bahRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/inventory/analytics/stock-levels/Okhla`),
          axios.get(`${API_BASE_URL}/inventory/analytics/stock-levels/Bahadurgarh`)
        ]);
        setStockOkhla(okhlaRes.data?.success ? okhlaRes.data : null);
        setStockBahadurgarh(bahRes.data?.success ? bahRes.data : null);
      } catch (error) {
        console.error('Error fetching stock levels:', error);
      } finally {
        setStockLoading(false);
      }
    };
    fetchStockLevels();
  }, []);

  // Check SKU availability when transactions change
  useEffect(() => {
    const transactions = getCurrentTransactions();
    if (transactions.length > 0) {
      checkSkuAvailabilityForTransactions();
    }
  }, [getCurrentTransactions, checkSkuAvailabilityForTransactions]);

  // Fetch vendor suggestions when edit dialog opens
  useEffect(() => {
    const fetchVendorSuggestions = async () => {
      if (openEditDialog && editingTransaction?.items) {
        const newItems = [...editingTransaction.items];
        let hasUpdates = false;
        
        for (let i = 0; i < newItems.length; i++) {
          const item = newItems[i];
          // Fetch suggestion if SKU exists and no vendor is set
          if (item.sku && !item.vendorName) {
            // Only fetch if we don't already have a suggestion
            if (!item.autoDetectedVendor) {
              const suggestion = await getVendorSuggestionForSku(item.sku);
              if (suggestion) {
                newItems[i].autoDetectedVendor = suggestion;
                hasUpdates = true;
              }
            }
          }
        }
        
        if (hasUpdates) {
          setEditingTransaction({ ...editingTransaction, items: newItems });
        }
      }
    };

    if (openEditDialog) {
      fetchVendorSuggestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openEditDialog, editingTransaction?._id]);

  // Fetch vendor suggestions when add dialog opens
  useEffect(() => {
    const fetchVendorSuggestions = async () => {
      if (openAddDialog && formData?.items) {
        const newItems = [...formData.items];
        let hasUpdates = false;
        
        for (let i = 0; i < newItems.length; i++) {
          const item = newItems[i];
          // Fetch suggestion if SKU exists and no vendor is set
          if (item.sku && !item.vendorName) {
            // Only fetch if we don't already have a suggestion
            if (!item.autoDetectedVendor) {
              const suggestion = await getVendorSuggestionForSku(item.sku);
              if (suggestion) {
                newItems[i].autoDetectedVendor = suggestion;
                hasUpdates = true;
              }
            }
          }
        }
        
        if (hasUpdates) {
          setFormData({ ...formData, items: newItems });
        }
      }
    };

    if (openAddDialog) {
      fetchVendorSuggestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAddDialog, formData?.items?.length]);

  // Cleanup progress polling on unmount
  useEffect(() => {
    return () => {
      if (progressPollIntervalRef.current) {
        clearInterval(progressPollIntervalRef.current);
        progressPollIntervalRef.current = null;
      }
    };
  }, []);

  // Load vendors and vendor suggestions
  useEffect(() => {
    const loadVendors = async () => {
      try {
        // Load DB vendors
        const vendorsResponse = await axios.get(`${API_BASE_URL}/vendors`);
        if (vendorsResponse.data) {
          setVendors(Array.isArray(vendorsResponse.data) ? vendorsResponse.data : []);
        }

        // Load sheet vendor suggestions (returns list of vendor names)
        const suggestionsResponse = await axios.get(`${API_BASE_URL}/settings/vendor-suggestions`);
        if (suggestionsResponse.data?.vendors) {
          setSheetVendors(Array.isArray(suggestionsResponse.data.vendors) ? suggestionsResponse.data.vendors : []);
        }
      } catch (error) {
        console.error('Error loading vendors:', error);
      }
    };

    loadVendors();
  }, []);

  // Merge DB vendors and sheet suggestions
  const getVendorOptions = useCallback(() => {
    const dbVendors = Array.isArray(vendors) ? vendors.map(v => ({ _id: v._id, name: v.name })) : [];
    const sheetVendorList = Array.isArray(sheetVendors) ? sheetVendors.map(n => ({ name: n })) : [];
    const map = new Map();
    dbVendors.forEach(v => map.set((v.name || '').toLowerCase(), v));
    sheetVendorList.forEach(s => {
      const key = (s.name || '').toLowerCase();
      if (!map.has(key)) map.set(key, s);
    });
    return Array.from(map.values());
  }, [vendors, sheetVendors]);

  // Get vendor suggestion for a SKU from pack SKU data (same logic as V2 InitialOrders)
  const getVendorSuggestionForSku = useCallback(async (sku) => {
    if (!sku) return null;
    
    try {
      const normalizedSku = sku.toUpperCase().trim();
      
      // Check if we already have a suggestion for this SKU (check both normalized and original)
      if (vendorSuggestions[normalizedSku]) {
        return vendorSuggestions[normalizedSku];
      }
      if (vendorSuggestions[sku]) {
        return vendorSuggestions[sku];
      }

      // Fetch pack SKU data which includes vendor suggestions (same as V2)
      const response = await axios.get(`${API_BASE_URL}/orders/pack-sku-data`);
      const packSkuData = response.data?.data || response.data;
      
      if (packSkuData) {
        // V2 style: packSkuData is a flat object where keys are normalized SKUs
        // Check if packSkuData[normalizedSku] exists and has vendorName
        if (packSkuData[normalizedSku] && packSkuData[normalizedSku].vendorName) {
          const suggestion = packSkuData[normalizedSku].vendorName;
          if (suggestion && typeof suggestion === 'string' && suggestion.trim()) {
            const trimmedSuggestion = suggestion.trim();
            // Cache the suggestion (use normalized SKU as key)
            setVendorSuggestions(prev => ({ ...prev, [normalizedSku]: trimmedSuggestion }));
            return trimmedSuggestion;
          }
        }
        
        // Fallback: Check vendorSuggestions map (from Master Needs sheet)
        const vendorSuggestionsMap = packSkuData.vendorSuggestions || {};
        let suggestion = vendorSuggestionsMap[normalizedSku];
        
        // If not found, check packSkuMap for vendorName
        if (!suggestion) {
          const packSkuMap = packSkuData.packSkuMap || {};
          const packInfo = packSkuMap[normalizedSku];
          if (packInfo?.vendorName) {
            suggestion = packInfo.vendorName;
          }
        }
        
        if (suggestion && typeof suggestion === 'string' && suggestion.trim()) {
          const trimmedSuggestion = suggestion.trim();
          setVendorSuggestions(prev => ({ ...prev, [normalizedSku]: trimmedSuggestion }));
          return trimmedSuggestion;
        }

        // Final fallback: dedicated suggest endpoint
        try {
          const sRes = await axios.get(`${API_BASE_URL}/vendors/suggest/${normalizedSku}`);
          const s = sRes.data?.vendor;
          if (s && typeof s === 'string' && s.trim()) {
            const trimmed = s.trim();
            setVendorSuggestions(prev => ({ ...prev, [normalizedSku]: trimmed }));
            return trimmed;
          }
        } catch (e) {
          // ignore
        }
      }
    } catch (error) {
      console.error('Error fetching vendor suggestion:', error);
    }

    return null;
  }, [vendorSuggestions]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const transactionType = ['Sales', 'Purchase', 'Return'][activeTab];
      
      // Fetch all transactions for this type
      // Add cache-busting to ensure fresh data after deletions
      const response = await axios.get(`${API_BASE_URL}/inventory`, {
        params: { 
          transactionType,
          _t: Date.now() // Cache busting parameter
        },
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (response.data.success) {
        let transactions = response.data.transactions || [];
        
        // Fetch vendor suggestions for all SKUs that don't have suggestions (same as V2)
        try {
          const packSkuResponse = await axios.get(`${API_BASE_URL}/orders/pack-sku-data`);
          const packSkuData = packSkuResponse.data?.data || packSkuResponse.data;
          
          if (packSkuData) {
            // Process all transactions and add vendor suggestions
            transactions = transactions.map(transaction => {
              if (!transaction.items || !Array.isArray(transaction.items)) {
                return transaction;
              }
              
              const updatedItems = transaction.items.map(item => {
                // Skip if already has vendor or suggestion
                if (item.vendorName || item.autoDetectedVendor) {
                  return item;
                }
                
                if (!item.sku) {
                  return item;
                }
                
                const normalizedSku = item.sku.toUpperCase().trim();
                let suggestion = null;
                
                // V2 style: Check if packSkuData[normalizedSku] exists and has vendorName
                if (packSkuData[normalizedSku] && packSkuData[normalizedSku].vendorName) {
                  suggestion = packSkuData[normalizedSku].vendorName;
                }
                // Fallback: Check vendorSuggestions map
                else if (packSkuData.vendorSuggestions && packSkuData.vendorSuggestions[normalizedSku]) {
                  suggestion = packSkuData.vendorSuggestions[normalizedSku];
                }
                // Fallback: Check packSkuMap
                else if (packSkuData.packSkuMap && packSkuData.packSkuMap[normalizedSku]?.vendorName) {
                  suggestion = packSkuData.packSkuMap[normalizedSku].vendorName;
                }
                
                if (suggestion && typeof suggestion === 'string' && suggestion.trim()) {
                  // Cache the suggestion
                  setVendorSuggestions(prev => ({ ...prev, [normalizedSku]: suggestion.trim() }));
                  return { ...item, autoDetectedVendor: suggestion.trim() };
                }
                
                return item;
              });
              
              return { ...transaction, items: updatedItems };
            });
          }
        } catch (error) {
          console.error('Error fetching vendor suggestions for transactions:', error);
          // Continue even if vendor suggestions fail
        }
        
        if (activeTab === 0) setSalesTransactions(transactions);
        else if (activeTab === 1) setPurchaseTransactions(transactions);
        else setReturnTransactions(transactions);
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
      showAlert('Failed to load transactions', 'error');
    } finally {
      setLoading(false);
    }
  };

  const isSkuAvailable = (sku, location) => {
    const key = `${sku}_${location}`;
    return skuAvailabilityMap[key]?.found === true;
  };

  const handleAddSkuClick = (sku, location, productName) => {
    setCurrentSkuToAdd({ sku, location, productName });
    setAddSkuFormData({
      location,
      sku,
      productName: productName || '',
      safetyStock: 0,
      initial: 0,
      createTransaction: false,
      transactionType: 'Purchase'
    });
    setOpenAddSkuDialog(true);
  };

  const handleAddSku = async () => {
    try {
      // Validate required fields
      if (!addSkuFormData.sku || addSkuFormData.initial === undefined || !addSkuFormData.productName) {
        showAlert('Please fill all required fields: SKU, Initial, and Product Name', 'error');
        return;
      }

      // Add SKU to sheet
      const response = await axios.post(`${API_BASE_URL}/inventory/add-missing-skus`, {
        sku: addSkuFormData.sku,
        location: addSkuFormData.location,
        safetyStock: addSkuFormData.safetyStock || 0,
        initial: addSkuFormData.initial || 0,
        productName: addSkuFormData.productName
      });

      if (response.data.success) {
        // Update availability map
        const key = `${addSkuFormData.sku}_${addSkuFormData.location}`;
        setSkuAvailabilityMap(prev => ({
          ...prev,
          [key]: { found: true, foundSheet: 'Inventory' }
        }));

        showAlert('SKU added to sheet successfully', 'success');

        // Create transaction if requested
        if (addSkuFormData.createTransaction) {
          const transactionData = {
            transactionType: addSkuFormData.transactionType,
            location: addSkuFormData.location,
            transactionDate: new Date().toISOString().split('T')[0],
            items: [{
              sku: addSkuFormData.sku,
              productName: addSkuFormData.productName,
              quantity: addSkuFormData.initial
            }]
          };

          const transactionType = addSkuFormData.transactionType.toLowerCase();
          await axios.post(`${API_BASE_URL}/inventory/${transactionType}`, transactionData);
          showAlert('Transaction created successfully', 'success');
          loadTransactions();
        }

        setOpenAddSkuDialog(false);
        setCurrentSkuToAdd(null);
        setAddSkuFormData({
          location: 'Okhla',
          sku: '',
          productName: '',
          safetyStock: 0,
          initial: 0,
          createTransaction: false,
          transactionType: 'Purchase'
        });
      }
    } catch (error) {
      console.error('Error adding SKU:', error);
      showAlert(error.response?.data?.message || 'Failed to add SKU', 'error');
    }
  };

  const showAlert = (message, severity = 'success') => {
    setAlert({ show: true, message, severity });
    setTimeout(() => setAlert({ show: false, message: '', severity: 'success' }), 5000);
  };

  const handleAddTransaction = async () => {
    try {
      const transactionType = ['Sales', 'Purchase', 'Return'][activeTab];
      const endpoint = `/api/inventory/${transactionType.toLowerCase()}`;
      
      const response = await axios.post(`${API_BASE_URL}${endpoint}`, formData);
      
      if (response.data.success) {
        showAlert('Transaction added successfully');
        setOpenAddDialog(false);
        loadTransactions();
        resetForm();
      }
    } catch (error) {
      console.error('Error adding transaction:', error);
      showAlert(error.response?.data?.message || 'Failed to add transaction', 'error');
    }
  };

  const handleUpdateTransaction = async () => {
    try {
      const response = await axios.put(
        `${API_BASE_URL}/inventory/${editingTransaction._id}`,
        editingTransaction
      );
      
      if (response.data.success) {
        showAlert('Transaction updated successfully');
        setOpenEditDialog(false);
        loadTransactions();
        setEditingTransaction(null);
      }
    } catch (error) {
      console.error('Error updating transaction:', error);
      showAlert('Failed to update transaction', 'error');
    }
  };

  const handleDeleteTransaction = async (idOrTransaction) => {
    // Handle both ID (string) and transaction object
    const transactionId = typeof idOrTransaction === 'string' 
      ? idOrTransaction 
      : idOrTransaction?._id || idOrTransaction?.id || idOrTransaction?.transactionId;
    
    if (!transactionId) {
      console.error('Invalid transaction ID or object:', idOrTransaction);
      showAlert('Invalid transaction to delete', 'error');
      return;
    }
    
    // Use custom confirmation dialog instead of native confirm
    setConfirmDialog({
      open: true,
      title: 'Delete Transaction',
      message: 'Are you sure you want to delete this transaction? This action cannot be undone.',
      onConfirm: async () => {
        // Close dialog immediately
        setConfirmDialog({ open: false, title: '', message: '', onConfirm: null, onCancel: null });
        
        try {
          const response = await axios.delete(`${API_BASE_URL}/inventory/${transactionId}`, {
            headers: {
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            }
          });
          
          if (response.data.success) {
            showAlert('Transaction deleted successfully');
            // Remove from selected transactions if it was selected
            setSelectedTransactions(prev => prev.filter(id => id !== transactionId && id !== idOrTransaction?._id));
            // Reload transactions to ensure UI is updated
            setTimeout(() => {
              loadTransactions();
            }, 100);
          } else {
            showAlert(response.data.message || 'Failed to delete transaction', 'error');
          }
        } catch (error) {
          console.error('Error deleting transaction:', error);
          const errorMessage = error.response?.data?.message || error.message || 'Failed to delete transaction';
          showAlert(errorMessage, 'error');
          // Still reload to ensure UI is in sync even if deletion failed
          loadTransactions();
        }
      },
      onCancel: () => {
        setConfirmDialog({ open: false, title: '', message: '', onConfirm: null, onCancel: null });
      }
    });
  };

  // Bulk delete selected transactions
  const handleDeleteSelected = () => {
    if (selectedTransactions.length === 0) {
      showAlert('Please select transactions to delete', 'warning');
      return;
    }

    setConfirmDialog({
      open: true,
      title: 'Delete Selected Transactions',
      message: `Are you sure you want to delete ${selectedTransactions.length} selected transaction(s)? This action cannot be undone.`,
      onConfirm: async () => {
        // Close dialog immediately
        setConfirmDialog({ open: false, title: '', message: '', onConfirm: null, onCancel: null });
        
        showAlert(`Deleting ${selectedTransactions.length} transaction(s)...`, 'info');
        
        let successCount = 0;
        let failCount = 0;
        
        // Delete transactions one by one
        for (const transactionId of selectedTransactions) {
          try {
            const response = await axios.delete(`${API_BASE_URL}/inventory/${transactionId}`, {
              headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
              }
            });
            
            if (response.data.success) {
              successCount++;
            } else {
              failCount++;
              console.error(`Failed to delete transaction ${transactionId}:`, response.data.message);
            }
          } catch (error) {
            failCount++;
            console.error(`Error deleting transaction ${transactionId}:`, error);
          }
        }
        
        // Clear selection
        setSelectedTransactions([]);
        
        // Show result
        if (failCount === 0) {
          showAlert(`Successfully deleted ${successCount} transaction(s)`, 'success');
        } else if (successCount === 0) {
          showAlert(`Failed to delete all ${failCount} transaction(s)`, 'error');
        } else {
          showAlert(`Deleted ${successCount} transaction(s), ${failCount} failed`, 'warning');
        }
        
        // Reload transactions
        setTimeout(() => {
          loadTransactions();
        }, 100);
      },
      onCancel: () => {
        setConfirmDialog({ open: false, title: '', message: '', onConfirm: null, onCancel: null });
      }
    });
  };

  // Delete all transactions on current page
  const handleDeleteAll = () => {
    const transactions = getCurrentTransactions();
    const filteredTransactions = filterTransactions(transactions);
    
    if (filteredTransactions.length === 0) {
      showAlert('No transactions to delete', 'warning');
      return;
    }

    setConfirmDialog({
      open: true,
      title: 'Delete All Transactions',
      message: `Are you sure you want to delete ALL ${filteredTransactions.length} transaction(s) in this tab? This action cannot be undone.`,
      onConfirm: async () => {
        // Close dialog immediately
        setConfirmDialog({ open: false, title: '', message: '', onConfirm: null, onCancel: null });
        
        showAlert(`Deleting ${filteredTransactions.length} transaction(s)...`, 'info');
        
        let successCount = 0;
        let failCount = 0;
        
        // Delete all transactions
        for (const transaction of filteredTransactions) {
          const transactionId = transaction._id || transaction.id;
          if (!transactionId) continue;
          
          try {
            const response = await axios.delete(`${API_BASE_URL}/inventory/${transactionId}`, {
              headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
              }
            });
            
            if (response.data.success) {
              successCount++;
            } else {
              failCount++;
              console.error(`Failed to delete transaction ${transactionId}:`, response.data.message);
            }
          } catch (error) {
            failCount++;
            console.error(`Error deleting transaction ${transactionId}:`, error);
          }
        }
        
        // Clear selection
        setSelectedTransactions([]);
        
        // Show result
        if (failCount === 0) {
          showAlert(`Successfully deleted ${successCount} transaction(s)`, 'success');
        } else if (successCount === 0) {
          showAlert(`Failed to delete all ${failCount} transaction(s)`, 'error');
        } else {
          showAlert(`Deleted ${successCount} transaction(s), ${failCount} failed`, 'warning');
        }
        
        // Reload transactions
        setTimeout(() => {
          loadTransactions();
        }, 100);
      },
      onCancel: () => {
        setConfirmDialog({ open: false, title: '', message: '', onConfirm: null, onCancel: null });
      }
    });
  };

  const handleSyncToSheets = async () => {
    if (selectedTransactions.length === 0) {
      showAlert('Please select transactions to sync', 'warning');
      return;
    }

    // Open location selector dialog
    setSyncDialogOpen(true);
  };

  const handleSyncConfirm = async () => {
    setSyncDialogOpen(false);
    setSyncing(true);
    
    try {
      console.log('[InventoryCount] Starting sync...', {
        selectedTransactions: selectedTransactions.length,
        location: selectedLocationForSync,
        syncMode,
        syncDate
      });
      
      // Skip the missing SKUs pre-check - let the backend handle it
      // The backend will now sync all transactions and report any issues
      
      // Proceed with sync directly
      const response = await axios.post(`${API_BASE_URL}/inventory/sync`, {
        transactionIds: selectedTransactions,
        location: selectedLocationForSync,
        handleMissingSkus: 'skip',
        syncMode: syncMode,
        syncDate: syncDate
      });
      
      console.log('[InventoryCount] Sync response:', response.data);
      
      if (response.data.success) {
        const syncedCount = response.data.synced || 0;
        const resultsWithErrors = response.data.results?.filter(r => r.error) || [];
        
        console.log('[InventoryCount] Sync completed:', {
          synced: syncedCount,
          errors: resultsWithErrors.length,
          totalResults: response.data.results?.length
        });
        
        if (syncedCount > 0) {
          let message = `Successfully synced ${syncedCount} transaction${syncedCount > 1 ? 's' : ''}`;
          if (resultsWithErrors.length > 0) {
            message += ` (${resultsWithErrors.length} SKU(s) had errors)`;
          }
          showAlert(message, resultsWithErrors.length > 0 ? 'warning' : 'success');
        } else {
          showAlert('No transactions were synced. Check console for details.', 'warning');
          console.warn('[InventoryCount] Sync returned 0 transactions:', response.data);
        }
        
        if (removeAfterSync && syncedCount > 0) {
          // Remove synced transactions from list (delete from DB)
          await Promise.all(
            selectedTransactions.map(id => 
              axios.delete(`${API_BASE_URL}/inventory/${id}`).catch(err => console.error(`Error deleting transaction ${id}:`, err))
            )
          );
        }
        
        setSelectedTransactions([]);
        loadTransactions();
        
        // Update the grouped data to reflect sync status
        if (viewMode === 'grouped') {
          const updatedGroupedData = getGroupedData().map(group => {
            // Update sync status for transactions that were just synced
            const updatedTransactions = group.transactions.map(tran => {
              if (tran.transactionId && selectedTransactions.includes(tran.transactionId)) {
                return { ...tran, synced: true };
              }
              return tran;
            });
            return { ...group, transactions: updatedTransactions };
          });
          setGroupedData(updatedGroupedData);
        }
      } else {
        console.error('[InventoryCount] Sync failed:', response.data);
        showAlert(response.data.message || 'Sync failed', 'error');
      }
    } catch (error) {
      console.error('[InventoryCount] Error syncing to Google Sheets:', error);
      console.error('[InventoryCount] Error details:', error.response?.data);
      showAlert(error.response?.data?.message || 'Failed to sync to Google Sheets', 'error');
    } finally {
      setSyncing(false);
    }
  };

  // Enhanced sync with missing SKU detection and grouping
  const handleProcessGrouped = async () => {
    if (selectedTransactions.length === 0) {
      showAlert('Please select transactions to sync', 'warning');
      return;
    }

    setLoading(true);
    try {
      const transactionType = ['Sales', 'Purchase', 'Return'][activeTab];
      const transactions = getCurrentTransactions().filter(t => selectedTransactions.includes(t._id));
      
      // Group transactions by SKU
      const response = await axios.post(`${API_BASE_URL}/inventory/group`, {
        location: selectedLocation,
        transactions: transactions.map(t => ({
          sku: t.items.map(i => i.sku).join(','),
          quantity: t.items.reduce((sum, i) => sum + i.quantity, 0),
          date: t.transactionDate,
          transactionType: t.transactionType
        }))
      });
      
      if (response.data.success) {
        const grouped = response.data.grouped;
        setGroupedData(grouped);
        
        // Check for missing SKUs
        const missingSkusResponse = await axios.post(`${API_BASE_URL}/inventory/check-missing-skus`, {
          transactions: transactions,
          location: selectedLocation
        });
        
        if (missingSkusResponse.data.success && missingSkusResponse.data.missingSkus.length > 0) {
          setMissingSkus(missingSkusResponse.data.missingSkus);
          setShowMissingSkusDialog(true);
        } else {
          // No missing SKUs, proceed with sync
          await performSync(grouped, selectedLocation);
        }
      }
    } catch (error) {
      console.error('Error processing grouped transactions:', error);
      showAlert('Failed to process transactions', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMissingSkus = async (skusToAdd) => {
    if (skusToAdd.length === 0) {
      setShowMissingSkusDialog(false);
      await performSync(groupedData, selectedLocation);
      return;
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/inventory/add-missing-skus-batch`, {
        missingSkus: skusToAdd,
        location: selectedLocation
      });
      
      if (response.data.success) {
        showAlert(`Added ${response.data.result.added} missing SKUs to ${selectedLocation} sheet`);
        setShowMissingSkusDialog(false);
        await performSync(groupedData, selectedLocation);
      }
    } catch (error) {
      console.error('Error adding missing SKUs:', error);
      showAlert('Failed to add missing SKUs', 'error');
    }
  };

  const performSync = async (grouped, location) => {
    setSyncing(true);
    setSyncProgress({ current: 0, total: grouped.length });
    
    try {
      // Use background processing for better retry handling
      const response = await axios.post(`${API_BASE_URL}/inventory/sync`, {
        transactionIds: selectedTransactions,
        location: selectedLocationForSync || location,
        handleMissingSkus: 'skip',
        syncMode,
        syncDate,
        background: true // Enable background processing with retry
      });
      const data = response.data || {};

      if (data.success) {
        // If jobId is returned, it means background processing started
        if (data.jobId) {
          setActiveSyncJob(data.jobId);
          showAlert(`Sync started in background. Tracking progress...`, 'info');
          
          // Start polling for progress
          const interval = setInterval(async () => {
            try {
              const progressResponse = await axios.get(`${API_BASE_URL}/inventory/sync-progress/${data.jobId}`);
              if (progressResponse.data.success) {
                const job = progressResponse.data.job;
                setSyncProgressData(job);
                setSyncProgress({
                  current: job.progress.processed,
                  total: job.progress.total,
                  successful: job.progress.successful,
                  failed: job.progress.failed
                });
                
                // If job is completed or failed, stop polling
                if (job.status === 'completed' || job.status === 'failed') {
                  clearInterval(interval);
                  progressPollIntervalRef.current = null;
                  
                  if (job.status === 'completed') {
                    showAlert(`Sync completed: ${job.progress.successful} successful, ${job.progress.failed} failed`, 
                      job.progress.failed > 0 ? 'warning' : 'success');
                    loadTransactions();
                    setSelectedTransactions([]);
                  } else {
                    showAlert(`Sync failed: ${job.errors.length} errors`, 'error');
                  }
                  
                  // Clear job after 5 seconds
                  setTimeout(() => {
                    setActiveSyncJob(null);
                    setSyncProgressData(null);
                  }, 5000);
                }
              }
            } catch (error) {
              console.error('Error polling sync progress:', error);
            }
          }, 2000); // Poll every 2 seconds
          
          progressPollIntervalRef.current = interval;
        } else {
          // Immediate sync (non-background)
          showAlert(`Successfully synced ${data.synced || 0} transactions`);
          setSelectedTransactions([]);
          loadTransactions();
        }
      } else {
        const msg = data.message || 'Sync failed';
        // If backend returned missing SKUs, surface them
        if (Array.isArray(data.missingSkus) && data.missingSkus.length) {
          setMissingSkus(data.missingSkus);
          setShowMissingSkusDialog(true);
        }
        showAlert(msg, 'error');
      }
    } catch (error) {
      console.error('Error syncing to sheets:', error);
      const serverMsg = error?.response?.data?.message || error?.response?.data?.error;
      showAlert(serverMsg || 'Failed to sync to Google Sheets', 'error');
    } finally {
      if (!activeSyncJob) {
        setSyncing(false);
        setSyncProgress({ current: 0, total: 0 });
      }
    }
  };

  const handleShowAnalytics = () => {
    setShowAnalytics(true);
  };

  const handleImportCSV = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);
        
        processImportedData(jsonData);
      } catch (error) {
        console.error('Error parsing file:', error);
        showAlert('Failed to parse file', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const processImportedData = async (data) => {
    try {
      const transactionType = ['Sales', 'Purchase', 'Return'][activeTab];
      
      // Check if data contains Order IDs only (for Returns)
      const hasOnlyOrderIds = data.every(row => row['Order ID'] && !row['SKU']);
      
      if (hasOnlyOrderIds && activeTab === 2) {
        // Fetch from Shopify
        const orderIds = data.map(row => row['Order ID']).filter(Boolean);
        const response = await axios.post(`${API_BASE_URL}/inventory/return`, {
          shopifyOrderIds: orderIds,
          location: formData.location,
          transactionDate: formData.transactionDate
        });
        
        if (response.data.success) {
          showAlert('Return transactions created from Shopify orders');
          loadTransactions();
        }
      } else {
        // Validate required fields: SKU and Quantity (or Date)
        const isValid = data.every(row => row.SKU && (row.Quantity || row.Date));
        if (!isValid) {
          showAlert('Import failed: SKU and Quantity are required fields', 'error');
          return;
        }
        
        // Process regular import
        const transactions = data.map(row => ({
          date: row['Date'] ? new Date(row['Date']) : new Date(),
          items: [{
            sku: row['SKU'],
            productName: row['Product Name'],
            quantity: parseInt(row['Quantity']) || 0,
            orderName: row['Order Name'],
            vendorName: row['Vendor']
          }]
        }));

        // Check for missing dates in the sheet
        const dates = [...new Set(transactions.map(t => t.date))];
        
        try {
          const checkResponse = await axios.post(`${API_BASE_URL}/inventory/check-import-dates`, {
            location: formData.location,
            dates
          });
          
          if (checkResponse.data.success && checkResponse.data.missingDates.length > 0) {
            // Missing dates found - show mapping dialog
            setDateMappingData({
              existingDates: checkResponse.data.existingDates,
              missingDates: checkResponse.data.missingDates
            });
            setPendingImportData({ transactionType, transactions });
            setShowDateMappingDialog(true);
            return;
          }
        } catch (error) {
          console.error('Error checking dates:', error);
          // Continue with import even if date check fails
        }
        
        // All dates exist, proceed with import
        const response = await axios.post(`${API_BASE_URL}/inventory/import`, {
          transactionType,
          location: formData.location,
          transactions
        });
        
        if (response.data.success) {
          showAlert(`Imported ${response.data.count} transactions`);
          loadTransactions();
        }
      }
      
      setOpenImportDialog(false);
    } catch (error) {
      console.error('Error processing import:', error);
      showAlert('Failed to import transactions', 'error');
    }
  };

  const handleDateMappingConfirm = async (mappings) => {
    try {
      const { transactionType, transactions } = pendingImportData;
      
      // Apply date mappings to transactions
      const mappedTransactions = transactions.map(t => ({
        ...t,
        date: mappings[t.date.toISOString().split('T')[0]] || t.date
      }));
      
      const response = await axios.post(`${API_BASE_URL}/inventory/import`, {
        transactionType,
        location: formData.location,
        transactions: mappedTransactions
      });
      
      if (response.data.success) {
        showAlert(`Imported ${response.data.count} transactions with date mappings`);
        loadTransactions();
      }
      
      setShowDateMappingDialog(false);
      setOpenImportDialog(false);
    } catch (error) {
      console.error('Error importing with date mappings:', error);
      showAlert('Failed to import transactions', 'error');
    }
  };

  const handleDateMappingCancel = () => {
    setShowDateMappingDialog(false);
    setDateMappingData(null);
    setPendingImportData(null);
  };

  const downloadImportTemplate = () => {
    const template = [
      {
        'SKU': 'EXAMPLE-SKU',
        'Product Name': 'Example Product',
        'Quantity': 10,
        'Date': '2024-01-30',
        'Order Name': '#1001',
        'Vendor': 'Example Vendor'
      }
    ];
    
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, `inventory-import-template.xlsx`);
  };

  const handleExportCSV = () => {
    const transactions = getCurrentTransactions();
    const exportData = [];
    
    transactions.forEach(trans => {
      trans.items.forEach(item => {
        exportData.push({
          'Transaction Type': trans.transactionType,
          'Date': new Date(trans.transactionDate).toLocaleDateString(),
          'Location': trans.location,
          'SKU': item.sku,
          'Product Name': item.productName,
          'Quantity': item.quantity,
          'Order Name': item.orderName,
          'Vendor': item.vendorName,
          'Synced': trans.syncedToSheets ? 'Yes' : 'No'
        });
      });
    });
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    
    const transactionType = ['Sales', 'Purchase', 'Return'][activeTab];
    XLSX.writeFile(wb, `${transactionType}_Transactions_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleShowHistory = async (sku) => {
    setHistoryLoading(true);
    setOpenHistoryDialog(true);
    
    try {
      const response = await axios.get(`${API_BASE_URL}/inventory/history/${sku}`);
      
      if (response.data.success) {
        setSkuHistory(response.data.history);
      }
    } catch (error) {
      console.error('Error loading history:', error);
      showAlert('Failed to load SKU history', 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleTransactionSelection = (id) => {
    setSelectedTransactions(prev =>
      prev.includes(id)
        ? prev.filter(tid => tid !== id)
        : [...prev, id]
    );
  };

  const selectAllTransactions = () => {
    const unsyncedIds = getCurrentTransactions()
      .filter(t => !t.syncedToSheets)
      .map(t => t._id);
    setSelectedTransactions(unsyncedIds);
  };

  const handleSplitTransaction = (transaction) => {
    setTransactionToSplit(transaction);
    setOpenSplitDialog(true);
  };

  const handleSplitConfirm = async (splitData) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/inventory/split-transaction`, splitData);
      
      if (response.data.success) {
        showAlert(`Transaction split successfully. ${splitData.newQuantity} units ready to sync.`, 'success');
        // Reload transactions
        loadTransactions();
      } else {
        showAlert(response.data.message || 'Failed to split transaction', 'error');
      }
    } catch (error) {
      console.error('Error splitting transaction:', error);
      showAlert('Failed to split transaction: ' + (error.response?.data?.message || error.message), 'error');
    }
  };

  const resetForm = () => {
    setFormData({
      location: 'Okhla',
      transactionDate: new Date().toISOString().split('T')[0],
      items: []
    });
  };

  const getGroupedData = () => {
    const transactions = filterTransactions(getCurrentTransactions());
    
    // Validate transactions array
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return [];
    }
    
    const grouped = {};
    const seenKeysByGroup = {};
    
    transactions.forEach(trans => {
      // Validate transaction and items
      if (!trans || !Array.isArray(trans.items) || trans.items.length === 0) {
        return; // Skip invalid transactions
      }
      
      trans.items.forEach((item, itemIndex) => {
        // Skip items without valid SKU
        if (!item || !item.sku || typeof item.sku !== 'string' || item.sku.trim() === '') {
          return;
        }
        
        // Group by SKU + Date (same SKU on same date = one group, different dates = separate groups)
        const skuKey = item.sku.trim().toUpperCase();
        const transactionDate = trans.transactionDate ? new Date(trans.transactionDate).toISOString().split('T')[0] : null;
        
        // Create unique key: SKU + Date (same date = grouped together, different dates = separate)
        const key = transactionDate ? `${skuKey}_${transactionDate}` : `${skuKey}_NO_DATE`;
        
        if (!grouped[key]) {
          grouped[key] = {
            sku: item.sku.trim(),
            productName: item.productName || 'N/A',
            date: transactionDate,
            totalQuantity: 0,
            transactions: [],
            orders: new Set() // Track unique orders
          };
          seenKeysByGroup[key] = new Set();
        }
        
        const quantity = parseFloat(item.quantity) || 0;
        grouped[key].totalQuantity += quantity;
        
        const orderName = item.orderName || 'N/A';
        if (orderName !== 'N/A') {
          grouped[key].orders.add(orderName);
        }
        
        const compositeKey = `${String(trans._id)}_${itemIndex}`;
        if (!seenKeysByGroup[key].has(compositeKey)) {
          seenKeysByGroup[key].add(compositeKey);
          grouped[key].transactions.push({
            transactionId: trans._id,
            transaction: trans,
            itemIndex: itemIndex,
            item: item,
            date: trans.transactionDate,
            quantity: quantity,
            location: trans.location || 'Okhla',
            orderName: orderName,
            orderId: item.orderId,
            vendor: item.vendorName || 'N/A',
            synced: trans.syncedToSheets || false,
            receivedQuantity: parseFloat(item.receivedQuantity) || 0,
            receivedStatus: item.receivedStatus || 'pending',
            remainder: quantity - (parseFloat(item.receivedQuantity) || 0)
          });
        }
      });
    });
    
    // Convert Set to Array for orders
    Object.values(grouped).forEach(group => {
      group.orders = Array.from(group.orders);
    });
    
    // Return sorted grouped data (by date first, then by quantity)
    const groupedArray = Object.values(grouped).sort((a, b) => {
      // Sort by date (newest first)
      if (a.date && b.date) {
        const dateCompare = new Date(b.date) - new Date(a.date);
        if (dateCompare !== 0) return dateCompare;
      }
      // Then by quantity (largest first)
      return b.totalQuantity - a.totalQuantity;
    });
    
    return groupedArray;
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Alert */}
      {alert.show && (
        <Alert severity={alert.severity} sx={{ mb: 2 }} onClose={() => setAlert({ ...alert, show: false })}>
          {alert.message}
        </Alert>
      )}

      {/* Background Sync Progress */}
      {activeSyncJob && syncProgressData && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Box sx={{ width: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="body2">
                <strong>Background Sync in Progress</strong> - {syncProgressData.status === 'processing' ? 'Processing...' : 
                  syncProgressData.status === 'completed' ? 'Completed' : 'Failed'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {syncProgressData.progress.processed}/{syncProgressData.progress.total} transactions
              </Typography>
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={syncProgressData.progress.percent || 0} 
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: 'flex', gap: 2, fontSize: '0.875rem' }}>
              <Chip label={`✅ ${syncProgressData.progress.successful} successful`} size="small" color="success" />
              <Chip label={`❌ ${syncProgressData.progress.failed} failed`} size="small" color="error" />
              {syncProgressData.progress.retrying > 0 && (
                <Chip label={`🔄 ${syncProgressData.progress.retrying} retrying`} size="small" color="warning" />
              )}
            </Box>
          </Box>
        </Alert>
      )}

      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4">Inventory Count Management</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {/* Live Inventory Summary */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mr: 2 }}>
              <Chip
                label={`Okhla: ${stockOkhla?.summary?.normal || 0} normal`}
                size="small"
                color="primary"
              />
              <Chip
                label={`Low: ${stockOkhla?.summary?.lowStock || 0}`}
                size="small"
                color="warning"
              />
              <Chip
                label={`Out: ${stockOkhla?.summary?.outOfStock || 0}`}
                size="small"
                color="error"
              />
              <Divider flexItem orientation="vertical" />
              <Chip
                label={`Bahadurgarh: ${stockBahadurgarh?.summary?.normal || 0} normal`}
                size="small"
                color="primary"
              />
              <Chip
                label={`Low: ${stockBahadurgarh?.summary?.lowStock || 0}`}
                size="small"
                color="warning"
              />
              <Chip
                label={`Out: ${stockBahadurgarh?.summary?.outOfStock || 0}`}
                size="small"
                color="error"
              />
              {stockLoading && <LinearProgress sx={{ width: 120 }} />}
              <Tooltip title="Refresh inventory counts from Google Sheets">
                <IconButton
                  size="small"
                  onClick={async () => {
                    try {
                      await axios.post(`${API_BASE_URL}/orders/clear-cache`);
                    } catch (e) {
                      console.warn('Cache clear failed (continuing):', e?.message || e);
                    }
                    try {
                      const [okhlaRes, bahRes] = await Promise.all([
                        axios.get(`${API_BASE_URL}/inventory/analytics/stock-levels/Okhla`),
                        axios.get(`${API_BASE_URL}/inventory/analytics/stock-levels/Bahadurgarh`)
                      ]);
                      setStockOkhla(okhlaRes.data?.success ? okhlaRes.data : null);
                      setStockBahadurgarh(bahRes.data?.success ? bahRes.data : null);
                      showAlert('Inventory counts refreshed', 'success');
                    } catch (error) {
                      console.error('Error refreshing stock levels:', error);
                      showAlert('Failed to refresh inventory counts', 'error');
                    }
                  }}
                  sx={{ ml: 0.5 }}
                >
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            </Box>
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={() => setOpenImportDialog(true)}
              sx={{ mr: 1 }}
            >
              Import
            </Button>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleExportCSV}
              sx={{ mr: 1 }}
            >
              Export
            </Button>
            <Button
              variant="outlined"
              startIcon={<HistoryIcon />}
              onClick={handleShowAnalytics}
              sx={{ mr: 1 }}
            >
              Analytics
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setOpenAddDialog(true)}
            >
              Add Transaction
            </Button>
          </Box>
        </Box>

        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
          <Tab label="Sales" />
          <Tab label="Purchase" />
          <Tab label="Returns" />
        </Tabs>

        {/* Bulk Actions Bar */}
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          gap: 2, 
          mt: 2, 
          mb: 1,
          p: 1.5,
          backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
          borderRadius: 1
        }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button
              variant="outlined"
              size="small"
              onClick={selectAllTransactions}
              startIcon={<CheckCircleIcon />}
            >
              Select All ({getCurrentTransactions().length})
            </Button>
            <Button
              variant="outlined"
              color="error"
              size="small"
              onClick={handleDeleteSelected}
              startIcon={<DeleteIcon />}
              disabled={selectedTransactions.length === 0}
            >
              Delete Selected ({selectedTransactions.length})
            </Button>
            <Button
              variant="outlined"
              color="error"
              size="small"
              onClick={handleDeleteAll}
              startIcon={<DeleteIcon />}
              disabled={getCurrentTransactions().length === 0}
            >
              Delete All
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary">
            {selectedTransactions.length} of {getCurrentTransactions().length} selected
          </Typography>
        </Box>

        {/* Search and View Mode Toggle */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 2 }}>
          <TextField
            placeholder="Search by SKU, Order Name, or Product Name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            size="small"
            sx={{ flexGrow: 1, maxWidth: 400 }}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
            }}
          />
          <Chip
            label={viewMode === 'table' ? '📋 Table View' : '📦 Grouped View'}
            color={safeColor(viewMode === 'table' ? 'primary' : 'secondary')}
            onClick={() => setViewMode(viewMode === 'table' ? 'grouped' : 'table')}
            sx={{ cursor: 'pointer' }}
          />
        </Box>

        {loading && <LinearProgress sx={{ mt: 2 }} />}

        {/* Sales Tab */}
        <TabPanel value={activeTab} index={0}>
          {viewMode === 'table' ? (
            <TransactionTable
              key={`sales-table-${viewMode}`}
              transactions={filterTransactions(salesTransactions)}
              selectedTransactions={selectedTransactions}
              onToggleSelection={toggleTransactionSelection}
              onSelectAll={selectAllTransactions}
              onEdit={(trans) => { setEditingTransaction(trans); setOpenEditDialog(true); }}
              onDelete={handleDeleteTransaction}
              onShowHistory={handleShowHistory}
              onSync={handleSyncToSheets}
              syncing={syncing}
              isSkuAvailable={isSkuAvailable}
              onAddSkuClick={handleAddSkuClick}
              groupedData={getGroupedData()}
            />
          ) : (
            <GroupedTransactionsView
              key={`sales-grouped-${viewMode}`}
              groupedData={getGroupedData()}
              onEdit={(trans) => { setEditingTransaction(trans); setOpenEditDialog(true); }}
              onDelete={handleDeleteTransaction}
              onShowHistory={handleShowHistory}
              onSync={(transactionIds) => {
                setSelectedTransactions(transactionIds);
                handleSyncToSheets();
              }}
              onSelectAll={(transactionIds) => {
                setSelectedTransactions(transactionIds);
              }}
              onToggleSelection={toggleTransactionSelection}
              selectedTransactions={selectedTransactions}
              syncing={syncing}
              isSkuAvailable={isSkuAvailable}
              onAddSkuClick={handleAddSkuClick}
              transactionType={['Sales', 'Purchase', 'Return'][activeTab]}
              onUpdateTransaction={loadTransactions}
              showAlert={showAlert}
              onSplit={handleSplitTransaction}
            />
          )}
        </TabPanel>

        {/* Purchase Tab */}
        <TabPanel value={activeTab} index={1}>
          {viewMode === 'table' ? (
            <TransactionTable
              key={`purchase-table-${viewMode}`}
              transactions={filterTransactions(purchaseTransactions)}
              selectedTransactions={selectedTransactions}
              onToggleSelection={toggleTransactionSelection}
              onSelectAll={selectAllTransactions}
              onEdit={(trans) => { setEditingTransaction(trans); setOpenEditDialog(true); }}
              onDelete={handleDeleteTransaction}
              onShowHistory={handleShowHistory}
              onSync={handleSyncToSheets}
              syncing={syncing}
              isSkuAvailable={isSkuAvailable}
              onAddSkuClick={handleAddSkuClick}
              groupedData={getGroupedData()}
            />
          ) : (
            <GroupedTransactionsView
              key={`purchase-grouped-${viewMode}`}
              groupedData={getGroupedData()}
              onEdit={(trans) => { setEditingTransaction(trans); setOpenEditDialog(true); }}
              onDelete={handleDeleteTransaction}
              onShowHistory={handleShowHistory}
              onSync={(transactionIds) => {
                setSelectedTransactions(transactionIds);
                handleSyncToSheets();
              }}
              onSelectAll={(transactionIds) => {
                setSelectedTransactions(transactionIds);
              }}
              onToggleSelection={toggleTransactionSelection}
              selectedTransactions={selectedTransactions}
              syncing={syncing}
              isSkuAvailable={isSkuAvailable}
              onAddSkuClick={handleAddSkuClick}
              transactionType="Purchase"
              onSplit={handleSplitTransaction}
            />
          )}
        </TabPanel>

        {/* Returns Tab */}
        <TabPanel value={activeTab} index={2}>
          {viewMode === 'table' ? (
            <TransactionTable
              key={`return-table-${viewMode}`}
              transactions={filterTransactions(returnTransactions)}
              selectedTransactions={selectedTransactions}
              onToggleSelection={toggleTransactionSelection}
              onSelectAll={selectAllTransactions}
              onEdit={(trans) => { setEditingTransaction(trans); setOpenEditDialog(true); }}
              onDelete={handleDeleteTransaction}
              onShowHistory={handleShowHistory}
              onSync={handleSyncToSheets}
              syncing={syncing}
              isSkuAvailable={isSkuAvailable}
              onAddSkuClick={handleAddSkuClick}
              groupedData={getGroupedData()}
            />
          ) : (
            <GroupedTransactionsView
              key={`return-grouped-${viewMode}`}
              groupedData={getGroupedData()}
              onEdit={(trans) => { setEditingTransaction(trans); setOpenEditDialog(true); }}
              onDelete={handleDeleteTransaction}
              onShowHistory={handleShowHistory}
              onSync={(transactionIds) => {
                setSelectedTransactions(transactionIds);
                handleSyncToSheets();
              }}
              onSelectAll={(transactionIds) => {
                setSelectedTransactions(transactionIds);
              }}
              onToggleSelection={toggleTransactionSelection}
              selectedTransactions={selectedTransactions}
              syncing={syncing}
              isSkuAvailable={isSkuAvailable}
              onAddSkuClick={handleAddSkuClick}
              transactionType="Return"
              onSplit={handleSplitTransaction}
            />
          )}
        </TabPanel>

      </Paper>

      {/* Add Transaction Dialog */}
      <Dialog open={openAddDialog} onClose={() => setOpenAddDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Add {['Sales', 'Purchase', 'Return'][activeTab]} Transaction</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Location</InputLabel>
              <Select
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                label="Location"
              >
                <MenuItem value="Okhla">Okhla</MenuItem>
                <MenuItem value="Bahadurgarh">Bahadurgarh</MenuItem>
                <MenuItem value="Direct">Direct</MenuItem>
              </Select>
            </FormControl>
            
            <TextField
              label="Transaction Date"
              type="date"
              value={formData.transactionDate}
              onChange={(e) => setFormData({ ...formData, transactionDate: e.target.value })}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setFormData({ ...formData, items: [...formData.items, { sku: '', productName: '', quantity: 0, orderName: '', vendorName: '' }] })}
            >
              Add Item
            </Button>
            
            {formData.items.map((item, index) => (
              <Box key={index} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  label="SKU"
                  value={item.sku}
                  onChange={async (e) => {
                    const newItems = [...formData.items];
                    newItems[index].sku = e.target.value;
                    
                    // Fetch vendor suggestion for new SKU
                    if (e.target.value) {
                      const suggestion = await getVendorSuggestionForSku(e.target.value);
                      if (suggestion) {
                        newItems[index].autoDetectedVendor = suggestion;
                      } else {
                        newItems[index].autoDetectedVendor = '';
                      }
                    } else {
                      newItems[index].autoDetectedVendor = '';
                    }
                    setFormData({ ...formData, items: newItems });
                  }}
                  size="small"
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Product Name"
                  value={item.productName}
                  onChange={(e) => {
                    const newItems = [...formData.items];
                    newItems[index].productName = e.target.value;
                    setFormData({ ...formData, items: newItems });
                  }}
                  size="small"
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Quantity"
                  type="number"
                  value={item.quantity}
                  onChange={(e) => {
                    const newItems = [...formData.items];
                    newItems[index].quantity = parseInt(e.target.value) || 0;
                    setFormData({ ...formData, items: newItems });
                  }}
                  size="small"
                  sx={{ width: 100 }}
                />
                <TextField
                  label="Order Name"
                  value={item.orderName}
                  onChange={(e) => {
                    const newItems = [...formData.items];
                    newItems[index].orderName = e.target.value;
                    setFormData({ ...formData, items: newItems });
                  }}
                  size="small"
                  sx={{ flex: 1 }}
                />
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, flex: 1, minWidth: 200 }}>
                  <Autocomplete
                    freeSolo
                    size="small"
                    options={getVendorOptions()}
                    getOptionLabel={(option) => option?.name || ''}
                    value={(() => {
                      try {
                        const vendorName = item.vendorName || '';
                        if (!vendorName) return null;
                        const vendorOptions = getVendorOptions();
                        const byName = vendorOptions.find(o => o.name && (o.name || '').toLowerCase() === vendorName.toLowerCase());
                        if (byName) return byName;
                        return { name: vendorName };
                      } catch (e) { /* ignore */ }
                      return null;
                    })()}
                    onChange={(e, newValue) => {
                      const newItems = [...formData.items];
                      if (typeof newValue === 'string') {
                        newItems[index].vendorName = newValue.trim();
                      } else if (newValue?.name) {
                        newItems[index].vendorName = newValue.name;
                      } else {
                        newItems[index].vendorName = '';
                      }
                      setFormData({ ...formData, items: newItems });
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Vendor"
                        placeholder={item.autoDetectedVendor || "Assign or Type"}
                        helperText={item.autoDetectedVendor && !item.vendorName ? `Suggested: ${item.autoDetectedVendor}` : ''}
                        size="small"
                      />
                    )}
                    sx={{ flex: 1 }}
                  />
                  {/* Accept Suggested Vendor Button */}
                  {item.autoDetectedVendor && !item.vendorName && (
                    <Tooltip title={`Accept "${item.autoDetectedVendor}"`}>
                      <IconButton
                        size="small"
                        color="success"
                        onClick={() => {
                          const newItems = [...formData.items];
                          newItems[index].vendorName = item.autoDetectedVendor;
                          setFormData({ ...formData, items: newItems });
                        }}
                        sx={{
                          mt: 0.5,
                          animation: 'pulse 2s infinite',
                          '@keyframes pulse': {
                            '0%, 100%': { opacity: 1 },
                            '50%': { opacity: 0.6 },
                          },
                        }}
                      >
                        <CheckCircleIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
                <IconButton
                  onClick={() => {
                    const newItems = formData.items.filter((_, i) => i !== index);
                    setFormData({ ...formData, items: newItems });
                  }}
                  color="error"
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAddDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddTransaction}>
            Add Transaction
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Transaction Dialog */}
      <Dialog open={openEditDialog} onClose={() => setOpenEditDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Edit Transaction</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Location</InputLabel>
              <Select
                value={editingTransaction?.location || 'Okhla'}
                onChange={(e) => setEditingTransaction({ ...editingTransaction, location: e.target.value })}
                label="Location"
              >
                <MenuItem value="Okhla">Okhla</MenuItem>
                <MenuItem value="Bahadurgarh">Bahadurgarh</MenuItem>
              </Select>
            </FormControl>
            
            <TextField
              label="Transaction Date *"
              type="date"
              value={editingTransaction?.transactionDate ? new Date(editingTransaction.transactionDate).toISOString().split('T')[0] : ''}
              onChange={(e) => setEditingTransaction({ ...editingTransaction, transactionDate: e.target.value })}
              InputLabelProps={{ shrink: true }}
              fullWidth
              required
            />

            {/* Sheet Selection */}
            <FormControl fullWidth>
              <InputLabel>Sheet Name</InputLabel>
              <Select
                value={editingTransaction?.sheetLocation?.sheetName || 'Inventory'}
                onChange={(e) => setEditingTransaction({ 
                  ...editingTransaction, 
                  sheetLocation: {
                    ...editingTransaction?.sheetLocation,
                    sheetName: e.target.value
                  }
                })}
                label="Sheet Name"
              >
                <MenuItem value="Inventory">Inventory</MenuItem>
                <MenuItem value="Sheet1">Sheet1</MenuItem>
                <MenuItem value="Sheet3">Sheet3</MenuItem>
                <MenuItem value="RK">RK</MenuItem>
                <MenuItem value="HME">HME</MenuItem>
                <MenuItem value="Photoshoot">Photoshoot</MenuItem>
              </Select>
            </FormControl>
            
            <Divider sx={{ my: 2 }} />
            
            <Typography variant="h6">Items</Typography>
            
            {editingTransaction?.items?.map((item, index) => {
              const remainder = item.quantity - (item.receivedQuantity || 0);
              const isPurchase = editingTransaction?.transactionType === 'Purchase';
              
              return (
                <Card key={index} variant="outlined" sx={{ p: 2, mb: 2 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      <TextField
                        label="SKU"
                        value={item.sku}
                        onChange={async (e) => {
                          const newItems = [...editingTransaction.items];
                          newItems[index].sku = e.target.value;
                          setEditingTransaction({ ...editingTransaction, items: newItems });
                          
                          // Fetch vendor suggestion for new SKU
                          if (e.target.value) {
                            const suggestion = await getVendorSuggestionForSku(e.target.value);
                            if (suggestion) {
                              newItems[index].autoDetectedVendor = suggestion;
                            } else {
                              newItems[index].autoDetectedVendor = '';
                            }
                          } else {
                            newItems[index].autoDetectedVendor = '';
                          }
                          setEditingTransaction({ ...editingTransaction, items: newItems });
                        }}
                        size="small"
                        sx={{ flex: 1, minWidth: 120 }}
                      />
                      <TextField
                        label="Product Name"
                        value={item.productName}
                        onChange={(e) => {
                          const newItems = [...editingTransaction.items];
                          newItems[index].productName = e.target.value;
                          setEditingTransaction({ ...editingTransaction, items: newItems });
                        }}
                        size="small"
                        sx={{ flex: 1, minWidth: 150 }}
                      />
                      <TextField
                        label="Total Quantity"
                        type="number"
                        value={item.quantity}
                        onChange={(e) => {
                          const newItems = [...editingTransaction.items];
                          newItems[index].quantity = parseInt(e.target.value) || 0;
                          setEditingTransaction({ ...editingTransaction, items: newItems });
                        }}
                        size="small"
                        sx={{ width: 120 }}
                      />
                      <TextField
                        label="Order Name"
                        value={item.orderName || ''}
                        onChange={(e) => {
                          const newItems = [...editingTransaction.items];
                          newItems[index].orderName = e.target.value;
                          setEditingTransaction({ ...editingTransaction, items: newItems });
                        }}
                        size="small"
                        sx={{ flex: 1, minWidth: 120 }}
                      />
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, flex: 1, minWidth: 200 }}>
                        <Autocomplete
                          freeSolo
                          size="small"
                          options={getVendorOptions()}
                          getOptionLabel={(option) => option?.name || ''}
                          value={(() => {
                            try {
                              const vendorName = item.vendorName || '';
                              if (!vendorName) return null;
                              const vendorOptions = getVendorOptions();
                              const byName = vendorOptions.find(o => o.name && (o.name || '').toLowerCase() === vendorName.toLowerCase());
                              if (byName) return byName;
                              return { name: vendorName };
                            } catch (e) { /* ignore */ }
                            return null;
                          })()}
                          onChange={(e, newValue) => {
                            const newItems = [...editingTransaction.items];
                            if (typeof newValue === 'string') {
                              newItems[index].vendorName = newValue.trim();
                            } else if (newValue?.name) {
                              newItems[index].vendorName = newValue.name;
                            } else {
                              newItems[index].vendorName = '';
                            }
                            setEditingTransaction({ ...editingTransaction, items: newItems });
                          }}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              label="Vendor"
                              placeholder={item.autoDetectedVendor || "Assign or Type"}
                              helperText={item.autoDetectedVendor && !item.vendorName ? `Suggested: ${item.autoDetectedVendor}` : ''}
                              size="small"
                            />
                          )}
                          sx={{ flex: 1 }}
                        />
                        {/* Accept Suggested Vendor Button */}
                        {item.autoDetectedVendor && !item.vendorName && (
                          <Tooltip title={`Accept "${item.autoDetectedVendor}"`}>
                            <IconButton
                              size="small"
                              color="success"
                              onClick={async () => {
                                const newItems = [...editingTransaction.items];
                                newItems[index].vendorName = item.autoDetectedVendor;
                                setEditingTransaction({ ...editingTransaction, items: newItems });
                              }}
                              sx={{
                                mt: 0.5,
                                animation: 'pulse 2s infinite',
                                '@keyframes pulse': {
                                  '0%, 100%': { opacity: 1 },
                                  '50%': { opacity: 0.6 },
                                },
                              }}
                            >
                              <CheckCircleIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </Box>

                    {/* Purchase Transaction - Received/Pending Status */}
                    {isPurchase && (
                      <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1, p: 2, backgroundColor: '#f5f5f5' }}>
                        <Typography variant="subtitle2" gutterBottom>
                          📦 Receipt Status
                        </Typography>
                        
                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
                          <Chip 
                            label={`Status: ${item.receivedStatus || 'pending'}`}
                            color={safeColor(getStatusColor(item.receivedStatus || 'pending'))}
                            size="small"
                          />
                          <Chip 
                            label={`Received: ${item.receivedQuantity || 0}`}
                            color="primary"
                            size="small"
                          />
                          <Chip 
                            label={`Remainder: ${remainder}`}
                            color={safeColor((remainder || 0) > 0 ? 'warning' : 'success')}
                            size="small"
                          />
                        </Box>

                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                          <TextField
                            label="Received Quantity"
                            type="number"
                            value={item.receivedQuantity || 0}
                            onChange={(e) => {
                              const newItems = [...editingTransaction.items];
                              newItems[index].receivedQuantity = parseInt(e.target.value) || 0;
                              setEditingTransaction({ ...editingTransaction, items: newItems });
                            }}
                            size="small"
                            sx={{ width: 150 }}
                            inputProps={{ min: 0, max: item.quantity }}
                          />
                          <Button
                            variant="contained"
                            color="success"
                            size="small"
                            onClick={async () => {
                              try {
                                const response = await axios.put(
                                  `${API_BASE_URL}/inventory/${editingTransaction._id}/received-status`,
                                  {
                                    itemIndex: index,
                                    receivedQuantity: item.quantity,
                                    receivedStatus: 'received'
                                  }
                                );
                                if (response.data.success) {
                                  showAlert('Item marked as received', 'success');
                                  setEditingTransaction(response.data.transaction);
                                  // Update the transaction in state without reloading page
                                  loadTransactions();
                                }
                              } catch (error) {
                                console.error('Error updating received status:', error);
                                showAlert('Failed to mark as received', 'error');
                              }
                            }}
                          >
                            Mark Received
                          </Button>
                          <Button
                            variant="outlined"
                            color="warning"
                            size="small"
                            onClick={async () => {
                              try {
                                const response = await axios.put(
                                  `${API_BASE_URL}/inventory/${editingTransaction._id}/received-status`,
                                  {
                                    itemIndex: index,
                                    receivedQuantity: 0,
                                    receivedStatus: 'pending'
                                  }
                                );
                                if (response.data.success) {
                                  showAlert('Item marked as pending', 'success');
                                  setEditingTransaction(response.data.transaction);
                                  // Update the transaction in state without reloading page
                                  loadTransactions();
                                }
                              } catch (error) {
                                console.error('Error updating received status:', error);
                                showAlert('Failed to mark as pending', 'error');
                              }
                            }}
                          >
                            Mark Pending
                          </Button>
                          <Button
                            variant="contained"
                            size="small"
                            onClick={async () => {
                              try {
                                const newReceivedQty = item.receivedQuantity || 0;
                                const response = await axios.put(
                                  `${API_BASE_URL}/inventory/${editingTransaction._id}/received-status`,
                                  {
                                    itemIndex: index,
                                    receivedQuantity: newReceivedQty
                                  }
                                );
                                if (response.data.success) {
                                  showAlert('Received quantity updated', 'success');
                                  setEditingTransaction(response.data.transaction);
                                  // Update the transaction in state without reloading page
                                  loadTransactions();
                                }
                              } catch (error) {
                                console.error('Error updating received quantity:', error);
                                showAlert('Failed to update received quantity', 'error');
                              }
                            }}
                          >
                            Update Quantity
                          </Button>
                        </Box>
                      </Box>
                    )}
                  </Box>
                </Card>
              );
            })}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenEditDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdateTransaction}>
            Update Transaction
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add SKU Dialog */}
      <Dialog open={openAddSkuDialog} onClose={() => setOpenAddSkuDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Add Missing SKU to Sheet</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Location *</InputLabel>
              <Select
                value={addSkuFormData.location}
                onChange={(e) => setAddSkuFormData({ ...addSkuFormData, location: e.target.value })}
                label="Location *"
              >
                <MenuItem value="Okhla">Okhla</MenuItem>
                <MenuItem value="Bahadurgarh">Bahadurgarh</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="SKU *"
              value={addSkuFormData.sku}
              onChange={(e) => setAddSkuFormData({ ...addSkuFormData, sku: e.target.value })}
              fullWidth
              required
              disabled={!!currentSkuToAdd?.sku}
              helperText={currentSkuToAdd?.sku ? 'SKU is pre-filled from transaction' : 'SKU is required'}
            />

            <TextField
              label="Product Name *"
              value={addSkuFormData.productName}
              onChange={(e) => setAddSkuFormData({ ...addSkuFormData, productName: e.target.value })}
              fullWidth
              required
            />

            <TextField
              label="Safety Stock"
              type="number"
              value={addSkuFormData.safetyStock}
              onChange={(e) => setAddSkuFormData({ ...addSkuFormData, safetyStock: parseInt(e.target.value) || 0 })}
              fullWidth
              inputProps={{ min: 0 }}
            />

            <TextField
              label="Initial Quantity *"
              type="number"
              value={addSkuFormData.initial}
              onChange={(e) => setAddSkuFormData({ ...addSkuFormData, initial: parseInt(e.target.value) || 0 })}
              fullWidth
              required
              inputProps={{ min: 0 }}
              helperText="Initial quantity for the SKU"
            />

            <Divider sx={{ my: 2 }} />

            <FormControlLabel
              control={
                <Checkbox
                  checked={addSkuFormData.createTransaction}
                  onChange={(e) => setAddSkuFormData({ ...addSkuFormData, createTransaction: e.target.checked })}
                />
              }
              label="Also create a transaction for this SKU"
            />

            {addSkuFormData.createTransaction && (
              <FormControl fullWidth>
                <InputLabel>Transaction Type</InputLabel>
                <Select
                  value={addSkuFormData.transactionType}
                  onChange={(e) => setAddSkuFormData({ ...addSkuFormData, transactionType: e.target.value })}
                  label="Transaction Type"
                >
                  <MenuItem value="Purchase">Purchase</MenuItem>
                  <MenuItem value="Sales">Sales</MenuItem>
                  <MenuItem value="Return">Return</MenuItem>
                </Select>
              </FormControl>
            )}

            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Required fields:</strong> SKU, Initial Quantity, Product Name<br />
                The SKU will be added to the inventory sheet with the specified details.
                {addSkuFormData.createTransaction && (
                  <>
                    <br />
                    <strong>Note:</strong> A {addSkuFormData.transactionType} transaction will also be created with quantity {addSkuFormData.initial}.
                  </>
                )}
              </Typography>
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAddSkuDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddSku}>
            Add SKU
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={openImportDialog} onClose={() => setOpenImportDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Import Transactions</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Upload a CSV or Excel file with transaction data. For Returns, you can upload a file with just Order IDs to fetch from Shopify.
            </Typography>
            <Button 
              startIcon={<DownloadIcon />} 
              onClick={downloadImportTemplate}
              variant="outlined"
              fullWidth
              sx={{ mt: 2, mb: 2 }}
            >
              Download Template
            </Button>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleImportCSV}
              style={{ marginTop: 16 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenImportDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={openHistoryDialog} onClose={() => setOpenHistoryDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>SKU Transaction History</DialogTitle>
        <DialogContent>
          {historyLoading ? (
            <LinearProgress />
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Quantity</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell>Order</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {skuHistory.map((history, index) => (
                    <TableRow key={index}>
                      <TableCell>{new Date(history.transactionDate).toLocaleDateString()}</TableCell>
                      <TableCell>{history.transactionType}</TableCell>
                      <TableCell>{history.quantity}</TableCell>
                      <TableCell>{history.location}</TableCell>
                      <TableCell>{history.orderName}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenHistoryDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Missing SKUs Dialog */}
      <MissingSkusDialog
        open={showMissingSkusDialog}
        onClose={() => setShowMissingSkusDialog(false)}
        missingSkus={missingSkus}
        location={selectedLocationForSync || selectedLocation}
        transactionType={['Sales', 'Purchase', 'Return'][activeTab]}
        onConfirm={handleAddMissingSkus}
        onExport={() => {
          setShowMissingSkusDialog(false);
          showAlert('Missing SKUs exported to CSV');
        }}
        onSkip={async () => {
          setShowMissingSkusDialog(false);
          // Continue with sync using 'skip' option
          try {
            const response = await axios.post(`${API_BASE_URL}/inventory/sync`, {
              transactionIds: selectedTransactions,
              location: selectedLocationForSync || selectedLocation,
              handleMissingSkus: 'skip',
              syncDate,
            });
            
            if (response.data.success) {
              showAlert(`Successfully synced ${response.data.synced} transactions (skipped ${response.data.skipped || 0} with missing SKUs)`);
              
              if (removeAfterSync) {
                await Promise.all(
                  selectedTransactions.map(id => 
                    axios.delete(`${API_BASE_URL}/inventory/${id}`).catch(err => console.error(`Error deleting transaction ${id}:`, err))
                  )
                );
              }
              
              setSelectedTransactions([]);
              loadTransactions();
            }
          } catch (error) {
            console.error('Error syncing with skipped SKUs:', error);
            showAlert('Failed to sync', 'error');
          }
        }}
      />

      {/* Date Conflict Dialog */}
      {conflictingDates.length > 0 && (
        <DateConflictDialog
          open={showDateConflictDialog}
          onClose={() => setShowDateConflictDialog(false)}
          date={conflictingDates[0]?.date}
          location={selectedLocation}
          existingValues={conflictingDates[0]?.existingValues}
          onConfirm={(resolution, selectedSkus) => {
            console.log('Date conflict resolved:', resolution, selectedSkus);
            setShowDateConflictDialog(false);
          }}
        />
      )}

      {/* Date Mapping Dialog */}
      {dateMappingData && (
        <DateMappingDialog
          open={showDateMappingDialog}
          missingDates={dateMappingData.missingDates}
          existingDates={dateMappingData.existingDates}
          onConfirm={handleDateMappingConfirm}
          onCancel={handleDateMappingCancel}
        />
      )}

      {/* Transaction Split Dialog */}
      <TransactionSplitDialog
        open={openSplitDialog}
        onClose={() => {
          setOpenSplitDialog(false);
          setTransactionToSplit(null);
        }}
        transaction={transactionToSplit}
        onConfirm={handleSplitConfirm}
        transactionType={['Sales', 'Purchase', 'Return'][activeTab]}
      />

      {/* Sync Location Dialog */}
      <Dialog open={syncDialogOpen} onClose={() => setSyncDialogOpen(false)}>
        <DialogTitle>Sync to Google Sheets</DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="dense" sx={{ mt: 1 }}>
            <InputLabel>Location</InputLabel>
            <Select
              value={selectedLocationForSync}
              onChange={(e) => setSelectedLocationForSync(e.target.value)}
            >
              <MenuItem value="Okhla">Okhla</MenuItem>
              <MenuItem value="Bahadurgarh">Bahadurgarh</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth margin="dense" sx={{ mt: 1 }}>
            <InputLabel>Sync Mode</InputLabel>
            <Select
              value={syncMode}
              onChange={(e) => setSyncMode(e.target.value)}
            >
              <MenuItem value="sum">Sum (Add to existing)</MenuItem>
              <MenuItem value="replace">Replace (Overwrite existing)</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Sync Date"
            type="date"
            value={syncDate}
            onChange={(e) => setSyncDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
            margin="dense"
            sx={{ mt: 2 }}
          />
          <Typography variant="body2" sx={{ mt: 2 }}>
            {selectedTransactions.length} transaction(s) will be synced to {selectedLocationForSync} sheet
          </Typography>
          <FormControlLabel
            control={
              <Checkbox 
                checked={removeAfterSync} 
                onChange={(e) => setRemoveAfterSync(e.target.checked)} 
              />
            }
            label="Remove transactions from list after successful sync"
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSyncDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSyncConfirm} variant="contained" color="primary" disabled={syncing}>
            {syncing ? 'Syncing...' : 'Sync'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Analytics Dialog */}
      <Dialog 
        open={showAnalytics} 
        onClose={() => setShowAnalytics(false)} 
        maxWidth="xl" 
        fullWidth
      >
        <DialogTitle>Inventory Analytics</DialogTitle>
        <DialogContent>
          <InventoryAnalytics />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAnalytics(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmDialog.open}
        onClose={confirmDialog.onCancel || (() => setConfirmDialog({ open: false, title: '', message: '', onConfirm: null, onCancel: null }))}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ 
          backgroundColor: (theme) => theme.palette.error.main,
          color: (theme) => theme.palette.error.contrastText 
        }}>
          {confirmDialog.title || 'Confirm Action'}
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Typography>
            {confirmDialog.message || 'Are you sure you want to proceed?'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={confirmDialog.onCancel || (() => setConfirmDialog({ open: false, title: '', message: '', onConfirm: null, onCancel: null }))}
            color="inherit"
          >
            Cancel
          </Button>
          <Button 
            onClick={confirmDialog.onConfirm || (() => setConfirmDialog({ open: false, title: '', message: '', onConfirm: null, onCancel: null }))}
            color="error"
            variant="contained"
            autoFocus
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
      
    </Container>
  );
}

