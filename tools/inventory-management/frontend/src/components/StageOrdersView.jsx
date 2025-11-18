import { useState, useEffect, useMemo } from 'react';
import {
  useTheme,
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
  Chip,
  Typography,
  IconButton,
  MenuItem,
  Checkbox,
  FormControl,
  InputLabel,
  Select,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Autocomplete,
  InputAdornment,
  Tooltip,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  GetApp as GetAppIcon,
  Send as SendIcon,
  SwapVert as SwapVertIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  CheckCircle as CheckCircleIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { ToggleOn as ToggleOnIcon, ToggleOff as ToggleOffIcon } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { getApiBaseUrlDynamic, normalizeApiPath, STATUS_COLORS } from '../config';
import OrderDetail from './OrderDetail';
import VendorMapping from './VendorMapping';
import ManualOrderForm from './ManualOrderForm';
import SKUPriceLink from './SKUPriceLink';
import SKUPrice from './SKUPrice';
import { moveAllOrdersToStage } from '../utils/orderUtils';

// ExpectedDateField component for editing expected dates
const ExpectedDateField = ({ item, orderId, onDateChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [dateValue, setDateValue] = useState(
    item.expectedDate ? new Date(item.expectedDate).toISOString().split('T')[0] : ''
  );
  const queryClient = useQueryClient();

  const updateExpectedDateMutation = useMutation({
    mutationFn: async ({ orderId, itemId, expectedDate }) => {
      const apiBaseUrl = normalizeApiPath(getApiBaseUrlDynamic() || '/api');
      const response = await axios.put(
        `${apiBaseUrl}/orders/${orderId}/items/${itemId}/expected-date`,
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
      setMessageDialog({ open: true, message: 'Failed to update expected date: ' + error.message, title: 'Error' });
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

const sortOptions = [
  { value: 'createdAt', label: 'Created Date' },
  { value: 'orderName', label: 'Order Name' },
  { value: 'paymentStatus', label: 'Payment Status' },
  { value: 'fulfillmentStatus', label: 'Fulfillment Status' },
  { value: 'items.productName', label: 'Item Name (A-Z)' },
];

function StageOrdersView({ stage, title }) {
  const theme = useTheme();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  // Helper function to get API base URL with fallback
  // Always use getApiBaseUrlDynamic() to ensure it's evaluated at runtime
  const getApiUrl = () => {
    try {
      const url = normalizeApiPath(getApiBaseUrlDynamic());
      return url || '/api';
    } catch (error) {
      console.error('[StageOrdersView] Error getting API URL:', error);
      return '/api';
    }
  };
  
  // Ensure axios uses the proxied base URL by default
  useEffect(() => {
    const base = normalizeApiPath(getApiUrl());
    // Don't set baseURL for proxy paths - let the interceptor handle it
    if (typeof base === 'string' && base.startsWith('/_proxy/')) {
      axios.defaults.baseURL = '';
    } else if (base !== '/api') {
      axios.defaults.baseURL = base;
    }
  }, []);
  
  // Setup axios interceptors for debugging (only once per component mount)
  useEffect(() => {
    // Request interceptor to log what we're sending and prevent URL duplication
    const requestInterceptor = axios.interceptors.request.use(
      (config) => {
        const apiBaseUrl = normalizeApiPath(getApiUrl());
        
        // Normalize the URL first
        if (typeof config.url === 'string') {
          config.url = normalizeApiPath(config.url);
        }
        
        // Check if URL is absolute or already contains full path
        const isAbsoluteUrl = typeof config.url === 'string' && (
          config.url.startsWith('http') ||
          config.url.startsWith('/_proxy/') ||
          config.url.startsWith('/api/')
        );
        
        // CRITICAL: If URL already starts with /_proxy/ or /api/, it's a complete path
        // Clear baseURL to prevent duplication like /_proxy/.../_proxy/...
        if (isAbsoluteUrl) {
          config.baseURL = undefined;
        }
        // Otherwise, set baseURL if not already set
        else if (!config.baseURL) {
          config.baseURL = apiBaseUrl;
        }
        
        // Final safety check: never allow baseURL to be a proxy path
        if (typeof config.baseURL === 'string' && (config.baseURL.startsWith('/_proxy/') || config.baseURL.startsWith('/api/'))) {
          config.baseURL = undefined;
        }
        
        console.log('[AXIOS REQUEST]', {
          method: config.method?.toUpperCase(),
          url: config.url,
          baseURL: config.baseURL,
          fullURL: config.baseURL ? `${config.baseURL}${config.url}` : config.url,
          data: config.data,
          params: config.params
        });
        return config;
      },
      (error) => {
        console.error('[AXIOS REQUEST ERROR]', error);
        return Promise.reject(error);
      }
    );
    
    // Response interceptor to log what we receive
    const responseInterceptor = axios.interceptors.response.use(
      (response) => {
        console.log('[AXIOS RESPONSE]', {
          status: response.status,
          url: response.config.url,
          data: response.data
        });
        return response;
      },
      (error) => {
        console.error('[AXIOS RESPONSE ERROR]', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          url: error.config?.url,
          fullURL: error.config?.baseURL ? `${error.config.baseURL}${error.config.url}` : error.config?.url,
          data: error.response?.data,
          message: error.message
        });
        return Promise.reject(error);
      }
    );
    
    // Cleanup interceptors on unmount
    return () => {
      axios.interceptors.request.eject(requestInterceptor);
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, []);
  const [selectedVendorGroups, setSelectedVendorGroups] = useState(new Set());
  const shouldShowAll = stage === 'Processed' || stage === 'Pending' || stage === 'Initial';
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [mappingOrder, setMappingOrder] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [showManualOrder, setShowManualOrder] = useState(false);
  const [changeStageDialogOpen, setChangeStageDialogOpen] = useState(false);
  const [targetStage, setTargetStage] = useState('Hold');
  const [selectAll, setSelectAll] = useState(false);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [receivedQty, setReceivedQty] = useState(0);
  const [currentItem, setCurrentItem] = useState(null);
  const [exportsDialogOpen, setExportsDialogOpen] = useState(false);
  const [exportsList, setExportsList] = useState([]);
  const [isProcessingSelection, setIsProcessingSelection] = useState(false);
  const [isStageChangeInProgress, setIsStageChangeInProgress] = useState(false);
  // Dialog states for replacing browser alerts and confirms
  const [messageDialog, setMessageDialog] = useState({ open: false, message: '', title: 'Message' });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, message: '', title: 'Confirm', onConfirm: null });
  const [downloadChoiceDialog, setDownloadChoiceDialog] = useState({ open: false, onZip: null, onSeparate: null, count: 0 });
  // State for recently moved toggle (only for Processed stage)
  const [showRecentlyMoved, setShowRecentlyMoved] = useState(true);
  // Removed vendor state variables

  // Load filters from localStorage or use defaults
  const getInitialFilters = () => {
    const savedFilters = localStorage.getItem(`${stage}OrdersFilters`);
    if (savedFilters) {
      try {
        const parsed = JSON.parse(savedFilters);
        return {
          search: parsed.search || '',
          vendorId: parsed.vendorId || '',
          sortBy: parsed.sortBy || 'createdAt',
          sortOrder: parsed.sortOrder || 'desc',
        };
      } catch (error) {
        console.error('Error parsing saved filters:', error);
      }
    }
    return {
      search: '',
      vendorId: '',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    };
  };

  const [filters, setFilters] = useState(getInitialFilters);
  const [fulfillmentFilter, setFulfillmentFilter] = useState('');
  
  // Add client-side filtering states with localStorage persistence
  const getInitialDateFilter = () => {
    const savedDateFilter = localStorage.getItem(`${stage}OrdersDateFilter`);
    return savedDateFilter || '';
  };

  const getInitialDateRange = () => {
    const saved = localStorage.getItem(`${stage}OrdersDateRange`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return { startDate: '', endDate: '', startTime: '', endTime: '' };
      }
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const y = new Date(today);
    const daysBack = stage === 'Processed' ? 7 : 1;
    y.setDate(y.getDate() - daysBack);
    const toStr = (d) => d.toISOString().split('T')[0];
    return { startDate: toStr(y), endDate: toStr(today), startTime: '', endTime: '' };
  };

  const getInitialSortDirection = () => {
    const savedSortDirection = localStorage.getItem(`${stage}OrdersSortDirection`);
    return savedSortDirection || '';
  };

  const [dateFilter, setDateFilter] = useState(getInitialDateFilter);
  const [dateRange, setDateRange] = useState(getInitialDateRange);
  const [sortDirection, setSortDirection] = useState(getInitialSortDirection);
  const [exportStart, setExportStart] = useState('');
  const [exportEnd, setExportEnd] = useState('');
  const PROCESSED_RETENTION_DAYS = 150;
  const [processedExportDialogOpen, setProcessedExportDialogOpen] = useState(false);
  const [processedExportError, setProcessedExportError] = useState('');
  const [processedExportLoading, setProcessedExportLoading] = useState(null);
  const [sendExcelDialogOpen, setSendExcelDialogOpen] = useState(false);
  const [sendExcelEmail, setSendExcelEmail] = useState('');
  const [sendExcelLoading, setSendExcelLoading] = useState(false);
  const [sendExcelStartDate, setSendExcelStartDate] = useState('');
  const [sendExcelEndDate, setSendExcelEndDate] = useState('');
  const [sendExcelStartTime, setSendExcelStartTime] = useState('');
  const [sendExcelEndTime, setSendExcelEndTime] = useState('');

  const queryClient = useQueryClient();

  const getDateString = (date) => date.toISOString().split('T')[0];

  const [vendorInputValues, setVendorInputValues] = useState({});
  const [suggestionCache, setSuggestionCache] = useState({});
  const [emailSettingsDialogOpen, setEmailSettingsDialogOpen] = useState(false);
  const [emailSettingsLoading, setEmailSettingsLoading] = useState(false);
  const [processedEmailEnabled, setProcessedEmailEnabled] = useState(true);
  const [processedEmailRecipients, setProcessedEmailRecipients] = useState([]);
  const [processedEmailSchedule, setProcessedEmailSchedule] = useState('04:00');
  const [processedEmailTriggerMethod, setProcessedEmailTriggerMethod] = useState('automatic');

  

  const ensureProcessedExportDefaults = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let end = exportEnd;
    if (!end) {
      end = getDateString(today);
      setExportEnd(end);
    }

    let start = exportStart;
    if (!start) {
      const defaultStart = new Date(end);
      defaultStart.setDate(defaultStart.getDate() - 7);
      start = getDateString(defaultStart);
      setExportStart(start);
    }

    return { start, end };
  };

  const getProcessedRetentionCutoff = () => {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - PROCESSED_RETENTION_DAYS);
    return cutoff;
  };

  const IndividualSkusBadge = ({ skus }) => {
    if (!Array.isArray(skus) || skus.length === 0) {
      return null;
    }
    return (
      <Tooltip
        arrow
        placement="top"
        title={
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', mb: 0.5 }}>
              Single SKUs:
            </Typography>
            {skus.map((sku, idx) => (
              <Typography key={`${sku}-${idx}`} variant="caption" display="block">
                • {sku}
              </Typography>
            ))}
          </Box>
        }
      >
        <Chip
          label={`Expands to ${skus.length} SKU${skus.length > 1 ? 's' : ''}`}
          size="small"
          variant="outlined"
          color="info"
          sx={{ height: 22, fontSize: '0.7rem' }}
        />
      </Tooltip>
    );
  };

  const handleProcessedExport = async (format) => {
    setProcessedExportError('');
    const { start, end } = ensureProcessedExportDefaults();

    if (!start || !end) {
      setProcessedExportError('Please select both start and end dates.');
      return;
    }

    if (new Date(start) > new Date(end)) {
      setProcessedExportError('Start date cannot be after end date.');
      return;
    }

    const cutoff = getProcessedRetentionCutoff();
    if (new Date(start) < cutoff) {
      setProcessedExportError(`Only the last ${PROCESSED_RETENTION_DAYS} days are retained. Choose a start date on or after ${getDateString(cutoff)}.`);
      return;
    }

    setProcessedExportLoading(format);
    try {
      const apiBaseUrl = getApiUrl();
      let response;

      if (format === 'excel') {
        response = await axios.post(
          `${apiBaseUrl}/orders/export-consolidated`,
          { startDate: start, endDate: end, stage: 'Processed' },
          { responseType: 'blob' }
        );
      } else {
        response = await axios.get(`${apiBaseUrl}/orders/export`, {
          params: { stage: 'Processed', startDate: start, endDate: end },
          responseType: 'blob'
        });
      }

      const blobType = format === 'excel'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv;charset=utf-8;';
      const blob = new Blob([response.data], { type: blobType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const extension = format === 'excel' ? 'xlsx' : 'csv';
      link.href = url;
      link.setAttribute('download', `processed-orders-${start}_to_${end}.${extension}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setProcessedExportDialogOpen(false);
    } catch (error) {
      console.error('Processed export error:', error);
      setProcessedExportError(`Failed to export processed orders: ${error.response?.data?.message || error.message}`);
    } finally {
      setProcessedExportLoading(null);
    }
  };

  // Save filters to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(`${stage}OrdersFilters`, JSON.stringify(filters));
  }, [filters, stage]);

  useEffect(() => {
    localStorage.setItem(`${stage}OrdersDateFilter`, dateFilter);
  }, [dateFilter, stage]);

  useEffect(() => {
    localStorage.setItem(`${stage}OrdersDateRange`, JSON.stringify(dateRange));
  }, [dateRange, stage]);

  useEffect(() => {
    localStorage.setItem(`${stage}OrdersSortDirection`, sortDirection);
  }, [sortDirection, stage]);

  const updateStageMutation = useMutation({
    mutationFn: async ({ orderId, newStage }) => {
      // Check if order has unmapped items
      const order = data?.orders.find(o => o._id === orderId);
      
      // If we're in Initial stage and trying to move to another stage
      if (stage === 'Initial') {
        // Allow navigation in Initial stage regardless of vendor assignment
        // This fixes the navigation issue for the initial stage
      } else {
        // For other stages, check vendor assignment
        const hasUnmappedItems = order?.items.some(item => !item.vendor);
        
        // Restrict order movement if no vendor is assigned
        // ALLOW Pending stage regardless of vendor assignment (fixed bug)
        if (hasUnmappedItems) {
          // Allow move to "Hold", "In-Stock", or "Pending" stage even without vendor
          if (newStage !== 'Hold' && newStage !== 'In-Stock' && newStage !== 'Pending') {
            throw new Error('Orders without assigned vendors can only be moved to "Hold", "In-Stock", or "Pending" stages');
          }
        }
      }
      
      const apiBaseUrl = getApiUrl();
      const response = await axios.put(`${apiBaseUrl}/orders/${orderId}/stage`, {
        stage: newStage
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error) => {
      setMessageDialog({ open: true, message: error.message, title: 'Error' });
    }
  });

  // Combine client-side filters with server query params
  const queryParams = {
    stage: stage,
    ...filters,
    ...(shouldShowAll ? {} : { page: page + 1, limit: rowsPerPage })
  };
  
  // Add recently moved filter for Processed stage based on toggle state
  if (stage === 'Processed') {
    if (showRecentlyMoved) {
      queryParams.recentlyMoved = 24; // Show orders moved in last 24 hours
    }
    // If toggle is off, don't add recentlyMoved parameter to show all orders
  }
  // Backend expects `vendor` query param, map from local `vendorId`
  queryParams.vendor = filters.vendorId;
  if (fulfillmentFilter) {
    queryParams.fulfillmentStatus = fulfillmentFilter;
  }
  
  // Add date/time range filter to server query if set
  if (dateRange.startDate || dateRange.endDate || dateFilter) {
    // Use dateRange if available, otherwise fall back to dateFilter for backward compatibility
    if (dateRange.startDate || dateRange.endDate) {
      queryParams.startDate = dateRange.startDate;
      queryParams.endDate = dateRange.endDate || dateRange.startDate;
      if (dateRange.startTime) {
        queryParams.startTime = dateRange.startTime;
      }
      if (dateRange.endTime) {
        queryParams.endTime = dateRange.endTime;
      }
      console.log("Date/time range filter applied:", { 
        dateRange,
        queryParams: { 
          startDate: queryParams.startDate, 
          endDate: queryParams.endDate,
          startTime: queryParams.startTime,
          endTime: queryParams.endTime
        }
      });
    } else if (dateFilter) {
      // Legacy single date filter support
      const filterDateObj = new Date(dateFilter);
      const formattedStartDate = filterDateObj.toISOString().split('T')[0];
      
      if (stage === 'Pending' || stage === 'Processed') {
        queryParams.startDate = formattedStartDate;
        queryParams.endDate = formattedStartDate;
        console.log(`[StrictDateFilter] ${stage} stage - filtering for exact date: ${formattedStartDate}`);
      } else {
        queryParams.startDate = formattedStartDate;
        queryParams.endDate = formattedStartDate;
      }
      
      console.log("Date filter applied in frontend:", { 
        dateFilter, 
        formattedStartDate,
        stage,
        queryParams: { startDate: queryParams.startDate, endDate: queryParams.endDate }
      });
    }
  }
  
  // Handle sorting on the server side when possible
  if (sortDirection === 'asc') {
    queryParams.sortBy = 'items.productName';
    queryParams.sortOrder = 'asc';
  }
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['orders', stage, filters, shouldShowAll ? null : page, shouldShowAll ? null : rowsPerPage, dateFilter, dateRange, sortDirection, showRecentlyMoved],
    queryFn: async () => {
      console.log("Fetching orders for stage:", stage, shouldShowAll ? "(all orders)" : `(page: ${page + 1}, limit: ${rowsPerPage})`);
      const apiBaseUrl = getApiUrl();
      const response = await axios.get(`${apiBaseUrl}/orders`, {
        params: queryParams
      });
      return response.data;
    },
    placeholderData: (previousData) => previousData,
    staleTime: 10000
  });
  
  // Use the server data directly
  const sortedOrders = data?.orders || [];

  useEffect(() => {
    const fetchMissingSuggestions = async () => {
      try {
        const apiBaseUrl = getApiUrl();
        const tasks = [];
        sortedOrders.forEach(order => {
          (order.items || []).forEach(item => {
            const sku = item?.sku;
            if (!sku) return;
            const norm = String(sku).toUpperCase().trim();
            const has = item?.autoDetectedVendor || item?.vendor?.name || suggestionCache[norm];
            if (!has) {
              tasks.push({ norm, id: item._id });
            }
          });
        });
        for (const t of tasks) {
          try {
            const res = await axios.get(`${apiBaseUrl}/vendors/suggest/${t.norm}`);
            const v = res.data?.vendor;
            if (v && v.trim()) {
              setSuggestionCache(prev => ({ ...prev, [t.norm]: v.trim() }));
            }
          } catch {}
        }
      } catch (e) {
        console.error('Suggestion prefetch error:', e);
      }
    };
    if (sortedOrders.length > 0) {
      fetchMissingSuggestions();
    }
  }, [sortedOrders]);
  
  // Group items by vendor for Processed and Pending stages
  const vendorGroups = {};
  if (stage === 'Processed' || stage === 'Pending' || stage === 'Completed') {
    sortedOrders.forEach(order => {
      order.items.forEach(item => {
        if (item.vendor) {
          const vendorId = item.vendor._id;
          const vendorName = item.vendor.name;
          
          if (!vendorGroups[vendorId]) {
            vendorGroups[vendorId] = {
              id: vendorId,
              name: vendorName,
              items: []
            };
          }
          
          vendorGroups[vendorId].items.push({
            ...item,
            orderId: order._id,
            orderName: order.orderName || order.shopifyOrderName || `#${String(order._id).slice(-6)}`,
            orderIsManual: !!order.isManual,
            customerName: order.customerName,
            paymentStatus: order.paymentStatus,
            fulfillmentStatus: order.fulfillmentStatus,
            createdAt: order.createdAt
          });
        }
      });
    });
  }

  // Add vendor search state
  const [vendorSearch, setVendorSearch] = useState('');

  // Update vendors query to include search
  const { data: vendors } = useQuery({
    queryKey: ['vendors', vendorSearch],
    queryFn: async () => {
      const apiBaseUrl = getApiUrl();
      const response = await axios.get(`${apiBaseUrl}/vendors`, {
        params: { search: vendorSearch }
      });
      return response.data;
    }
  });

  const { data: sheetVendorSuggestions = [] } = useQuery({
    queryKey: ['sheet-vendor-suggestions', stage],
    queryFn: async () => {
      const apiBaseUrl = getApiUrl();
      const response = await axios.get(`${apiBaseUrl}/settings/vendor-suggestions`);
      return Array.isArray(response.data?.vendors) ? response.data.vendors : [];
    }
  });

  const vendorOptions = useMemo(() => {
    const merged = new Map();
    if (Array.isArray(vendors)) {
      vendors.forEach((vendor) => {
        if (!vendor) return;
        const n = typeof vendor.name === 'string' ? vendor.name : (typeof vendor.label === 'string' ? vendor.label : '');
        if (!n) return;
        merged.set(n.toLowerCase(), vendor);
      });
    }
    if (Array.isArray(sheetVendorSuggestions)) {
      sheetVendorSuggestions.forEach((name) => {
        if (!name) return;
        const key = name.toLowerCase();
        if (!merged.has(key)) {
          merged.set(key, { name });
        }
      });
    }
    const arr = Array.from(merged.values());
    return arr.sort((a,b)=>{
      const an = (a?.name || a?.label || '').toString();
      const bn = (b?.name || b?.label || '').toString();
      return an.localeCompare(bn);
    });
  }, [vendors, sheetVendorSuggestions]);

  const bulkMapMutation = useMutation({
    mutationFn: async () => {
      const apiBaseUrl = getApiUrl();
      
      // Extract SKUs from currently visible orders
      const visibleSkus = [];
      if (ordersData && ordersData.orders && Array.isArray(ordersData.orders)) {
        ordersData.orders.forEach(group => {
          if (group.orders && Array.isArray(group.orders)) {
            group.orders.forEach(order => {
              if (order.sku && !order.vendor) {
                visibleSkus.push(order.sku);
              }
            });
          }
        });
      }
      
      console.log('Bulk mapping vendors for visible SKUs:', visibleSkus);
      const response = await axios.post(`${apiBaseUrl}/orders/bulk-map-vendors`, {
        skus: visibleSkus
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const bulkWarehouseMutation = useMutation({
    mutationFn: async ({ items, warehouse }) => {
      const apiBaseUrl = getApiUrl();
      const response = await axios.put(`${apiBaseUrl}/orders/warehouse-bulk`, {
        items,
        warehouse
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error) => {
      setMessageDialog({ open: true, message: 'Failed to update warehouse: ' + error.message, title: 'Error' });
    }
  });

  const updateVendorMutation = useMutation({
    mutationFn: async ({ orderId, itemId, vendorId, vendorSearch, vendorName }) => {
      // Add timeout to ensure request completes
      const apiBaseUrl = getApiUrl();
      const response = await axios.put(
        `${apiBaseUrl}/orders/${orderId}/items/${itemId}/vendor`,
        { vendorId, vendorSearch, vendorName },
        { timeout: 10000 } // 10 second timeout
      );
      return response.data;
    },
    onSuccess: (data) => {
      console.log('Vendor update successful:', data);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error) => {
      console.error('Error in vendor update mutation:', error);
      throw error;
    },
    retry: 1,
    retryDelay: 1000
  });

  // Accept suggested vendor mutation
  const acceptVendorMutation = useMutation({
    mutationFn: async ({ orderId, itemId, vendorName }) => {
      const apiBaseUrl = getApiUrl();
      const response = await axios.post(
        `${apiBaseUrl}/orders/${orderId}/items/${itemId}/accept-vendor`,
        { vendorName }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setMessageDialog({ open: true, message: 'Vendor accepted successfully!', title: 'Success' });
    },
    onError: (error) => {
      const errorMessage = error.response?.data?.message || error.message;
      setMessageDialog({ open: true, message: 'Failed to accept vendor: ' + errorMessage, title: 'Error' });
    }
  });

  const handleAcceptVendor = async (orderId, itemId, vendorName) => {
    setConfirmDialog({
      open: true,
      title: 'Accept Vendor',
      message: `Accept "${vendorName}" as vendor for this item?`,
      onConfirm: () => acceptVendorMutation.mutateAsync({ orderId, itemId, vendorName })
    });
  };

  const acceptAllSuggestions = async () => {
    try {
      const apiBaseUrl = getApiUrl();
      const res = await axios.post(`${apiBaseUrl}/orders/accept-all-suggestions`);
      const msg = res.data?.message || `Accepted ${res.data?.accepted || 0} suggestions`;
      setMessageDialog({ open: true, message: msg, title: 'Success' });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (error) {
      const msg = error.response?.data?.message || error.message;
      setMessageDialog({ open: true, message: 'Failed to accept suggestions: ' + msg, title: 'Error' });
    }
  };

  const openEmailSettings = async () => {
    try {
      setEmailSettingsDialogOpen(true);
      setEmailSettingsLoading(true);
      const apiBaseUrl = getApiUrl();
      const res = await axios.get(`${apiBaseUrl}/settings/email`);
      const pe = res.data?.processedOrdersExport || {};
      setProcessedEmailEnabled(pe.enabled !== false);
      setProcessedEmailRecipients(Array.isArray(pe.recipients) ? pe.recipients : []);
      setProcessedEmailSchedule(pe.scheduleTime || '04:00');
    } catch (error) {
      setMessageDialog({ open: true, message: 'Failed to load email settings: ' + (error.response?.data?.message || error.message), title: 'Error' });
      setEmailSettingsDialogOpen(true);
    } finally {
      setEmailSettingsLoading(false);
    }
  };

  const saveEmailSettings = async () => {
    try {
      setEmailSettingsLoading(true);
      const apiBaseUrl = getApiUrl();
      await axios.post(`${apiBaseUrl}/settings`, {
        email: {
          processedOrdersExport: {
            enabled: processedEmailEnabled,
            recipients: processedEmailRecipients,
            scheduleTime: processedEmailSchedule,
            triggerMethod: processedEmailTriggerMethod
          }
        }
      });
      setMessageDialog({ open: true, message: 'Email settings saved', title: 'Success' });
      setEmailSettingsDialogOpen(false);
    } catch (error) {
      setMessageDialog({ open: true, message: 'Failed to save email settings: ' + (error.response?.data?.message || error.message), title: 'Error' });
    } finally {
      setEmailSettingsLoading(false);
    }
  };
  
  const completeItemMutation = useMutation({
    mutationFn: async ({ orderId, itemId, receivedQty }) => {
      const apiBaseUrl = getApiUrl();
      const response = await axios.put(
        `${apiBaseUrl}/orders/${orderId}/items/${itemId}/complete`,
        { receivedQty }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setReceiveDialogOpen(false);
      setCurrentItem(null);
      setReceivedQty(0);
    },
    onError: (error) => {
      setMessageDialog({ open: true, message: `Error completing item: ${error.message}`, title: 'Error' });
    }
  });

  const handleChangePage = (event, newPage) => {
    console.log("Changing to page:", newPage);
    setPage(newPage);
    // Scroll to top for better UX
    window.scrollTo(0, 0);
  };

  const handleChangeRowsPerPage = (event) => {
    const newRowsPerPage = parseInt(event.target.value, 10);
    console.log("Changing rows per page to:", newRowsPerPage);
    setRowsPerPage(newRowsPerPage);
    setPage(0); // Reset to first page when changing rows per page
  };



  const handleBulkMapVendors = async () => {
    setConfirmDialog({
      open: true,
      title: 'Bulk Map Vendors',
      message: 'Are you sure you want to bulk map vendors based on SKUs?',
      onConfirm: () => bulkMapMutation.mutateAsync()
    });
  };

  // Removed complex vendor save handler

  const handleItemSelect = (orderId, itemId, isChecked) => {
    setSelectedItems(prev => {
      if (isChecked) {
        return [...prev, { orderId, itemId }];
      } else {
        return prev.filter(item => !(item.orderId === orderId && item.itemId === itemId));
      }
    });
  };
  
  const handleSelectAll = (isChecked) => {
    setSelectAll(isChecked);
    if (isChecked) {
      // Get all items from current page
      const allItems = [];
      sortedOrders.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).forEach(order => {
        order.items.forEach(item => {
          allItems.push({ orderId: order._id, itemId: item._id });
        });
      });
      setSelectedItems(allItems);
    } else {
      // Clear selection
      setSelectedItems([]);
    }
  };
  
  const handleReceiveClick = (item) => {
    setCurrentItem(item);
    setReceivedQty(item.quantity || 1);
    setReceiveDialogOpen(true);
  };
  
  const handleCompleteItem = async () => {
    if (!currentItem) return;
    
    try {
      await completeItemMutation.mutateAsync({
        orderId: currentItem.orderId,
        itemId: currentItem._id,
        receivedQty: receivedQty
      });
    } catch (error) {
      console.error('Error completing item:', error);
    }
  };

  const getVendorGroupWarehouse = (vendorGroup) => {
    const values = Array.from(new Set((vendorGroup.items || []).map(i => i.warehouse || 'Okhla')));
    return values.length === 1 ? values[0] : 'Okhla';
  };

  const handleProcessSelected = async () => {
    if (isProcessingSelection) {
      return;
    }
    if (selectedItems.length === 0) {
      setMessageDialog({ open: true, message: 'No items selected. Please select at least one item.', title: 'Warning' });
      return;
    }

    // Split into assigned and unassigned items
    const assigned = [];
    const unassigned = [];
    for (const { orderId, itemId } of selectedItems) {
      const order = data.orders.find(o => o._id === orderId);
      const item = order?.items.find(i => i._id === itemId);
      if (!order || !item) continue;
      if (item.vendor) assigned.push({ orderId, itemId });
      else unassigned.push({ orderId, itemId });
    }

    if (assigned.length === 0) {
      setMessageDialog({ open: true, message: 'No items with assigned vendors selected. Assign vendors first.', title: 'Warning' });
      return;
    }

    if (unassigned.length > 0) {
      // Warn but proceed with assigned ones; unassigned will be skipped server-side as well
      setMessageDialog({ open: true, message: `${unassigned.length} item(s) skipped because vendor is not assigned. Proceeding with ${assigned.length} item(s).`, title: 'Notice' });
    }

    setIsProcessingSelection(true);
    try {
      const apiBaseUrl = getApiUrl();
      const response = await axios.post(`${apiBaseUrl}/orders/process-items`, {
        items: assigned
      });
      const result = response.data;
      setMessageDialog({ open: true, message: `Processed ${result.processedCount} item(s). Skipped ${result.skippedCount} item(s).`, title: 'Success' });
      setSelectedItems([]);
      queryClient.invalidateQueries(['orders']);
    } catch (error) {
      setMessageDialog({ open: true, message: `Error processing items: ${error.message}`, title: 'Error' });
    } finally {
      setIsProcessingSelection(false);
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    // Check if API_BASE_URL is defined
    const apiBaseUrl = getApiUrl();
    const errorMessage = error.message || error.toString() || 'An unexpected error occurred';
    
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" color="error" gutterBottom>
          Error loading orders
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {errorMessage}
        </Typography>
        {errorMessage.includes('API_BASE_URL') && (
          <Typography variant="body2" color="warning.main" sx={{ mb: 2 }}>
            API_BASE_URL issue detected. Current API URL: {apiBaseUrl || 'undefined'}
            <br />
            Please check proxy configuration or refresh the page.
          </Typography>
        )}
        <Button 
          variant="contained" 
          onClick={() => window.location.reload()} 
          sx={{ mt: 2 }}
        >
          Retry
        </Button>
      </Box>
    );
  }

  return (  
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" gutterBottom sx={{ mb: 0 }}>
          {title}
          <Chip
            label={data?.pagination?.total || 0}
            color="primary"
            size="small"
            sx={{ ml: 2 }}
          />
        </Typography>
        {stage === 'Processed' && (
          <Tooltip title={showRecentlyMoved ? "Showing orders moved in last 24 hours" : "Showing all processed orders"}>
            <Button
              variant="outlined"
              size="small"
              startIcon={showRecentlyMoved ? <ToggleOnIcon /> : <ToggleOffIcon />}
              onClick={() => setShowRecentlyMoved(!showRecentlyMoved)}
              sx={{ minWidth: 180 }}
            >
              {showRecentlyMoved ? 'Recent (24h)' : 'All Orders'}
            </Button>
          </Tooltip>
        )}
      </Box>

      {/* First row of controls */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }} alignItems="center">
        <TextField
          label="Search"
          value={filters.search}
          onChange={(e) => {
            const newValue = e.target.value;
            setFilters(prev => ({ ...prev, search: newValue }));
          }}
          sx={{ minWidth: 200 }}
        />
        
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 200 }}>
          <TextField
            label="Search Vendors"
            size="small"
            value={vendorSearch}
            onChange={(e) => setVendorSearch(e.target.value)}
            sx={{ mb: 1 }}
          />
          <FormControl>
            <InputLabel id="vendor-filter-label">Filter by Vendor</InputLabel>
            <Select
              labelId="vendor-filter-label"
              id="vendor-filter"
              value={filters.vendorId}
              label="Filter by Vendor"
              onChange={(e) => {
                setFilters(prev => ({ ...prev, vendorId: e.target.value }));
              }}
            >
              <MenuItem value="">All Vendors</MenuItem>
              {vendors?.map((vendor) => (
                <MenuItem key={vendor._id} value={vendor._id}>
                  {vendor.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Stack direction="row" spacing={2} sx={{ ml: 'auto' }}>
          {stage === 'Initial' && (
            <>
              <Button
                variant="contained"
                color="primary"
                onClick={handleBulkMapVendors}
                sx={{ height: 40, minWidth: 140 }}
              >
                Bulk Map Vendors
              </Button>
              <Button
                variant="contained"
                color="success"
                onClick={acceptAllSuggestions}
                sx={{ height: 40, minWidth: 180 }}
              >
                Accept All Suggestions
              </Button>
              <Button
                variant="contained"
                color="secondary"
                onClick={() => setShowManualOrder(true)}
                sx={{ height: 40, minWidth: 140 }}
              >
                Create Manual Order
              </Button>
            </>
          )}
          
          {stage === 'Processed' && (
            <>
              <Button
                variant="contained"
                color="warning"
                disabled={isLoading}
                onClick={async () => {
                  setConfirmDialog({
                    open: true,
                    title: 'Move All Processed Orders to Pending',
                    message: 'This will move ALL processed orders to the Pending stage. This action cannot be undone. Continue?',
                    onConfirm: async () => {
                      // Close dialog immediately
                      setConfirmDialog({ open: false, message: '', title: '', onConfirm: null });
                      
                      // Show loading message
                      setMessageDialog({ 
                        open: true, 
                        message: 'Testing backend connectivity...', 
                        title: 'Processing' 
                      });
                      
                      try {
                        let apiBaseUrl = getApiUrl();
                        
                        // Ensure apiBaseUrl doesn't have trailing slash
                        if (apiBaseUrl && apiBaseUrl.endsWith('/')) {
                          apiBaseUrl = apiBaseUrl.slice(0, -1);
                        }
                        
                        // Validate API URL
                        if (!apiBaseUrl || apiBaseUrl === '') {
                          throw new Error('API URL is not configured. Please check your configuration.');
                        }
                        
                        console.log('[MoveAllToPending] ============ DIAGNOSTIC START ============');
                        console.log('[MoveAllToPending] Current URL:', window.location.href);
                        console.log('[MoveAllToPending] API Base URL:', apiBaseUrl);
                        console.log('[MoveAllToPending] Full fetch URL:', `${apiBaseUrl}/orders`);
                        
                        // Test 1: Check backend connectivity
                        console.log('[MoveAllToPending] Test 1: Testing backend connectivity...');
                        try {
                          const healthCheck = await axios.get(`${apiBaseUrl}/health`, { timeout: 5000 });
                          console.log('[MoveAllToPending] ✓ Backend is reachable:', healthCheck.data);
                        } catch (healthError) {
                          console.error('[MoveAllToPending] ✗ Backend connectivity test failed!');
                          console.error('[MoveAllToPending] This usually means:');
                          console.error('[MoveAllToPending] 1. Backend server is not running');
                          console.error('[MoveAllToPending] 2. Backend is running on wrong port');
                          console.error('[MoveAllToPending] 3. Vite proxy is misconfigured');
                          console.error('[MoveAllToPending] Health check error:', healthError.message);
                          console.error('[MoveAllToPending] Health check URL:', `${apiBaseUrl}/health`);
                          
                          setMessageDialog({
                            open: true,
                            title: 'Backend Connection Error',
                            message: `Cannot connect to backend server. Please check:\n\n1. Is the backend server running?\n2. Is it running on port 4096?\n3. Check console for details.\n\nError: ${healthError.message}`
                          });
                          return;
                        }
                        
                        setMessageDialog({ 
                          open: true, 
                          message: 'Fetching all processed orders...', 
                          title: 'Processing' 
                        });
                        
                        // Step 1: Fetch ALL processed orders
                        console.log('[MoveAllToPending] Step 1: Fetching all processed orders...');
                        const fetchResponse = await axios.get(`${apiBaseUrl}/orders`, {
                          params: {
                            stage: 'Processed',
                            limit: 10000, // Get all orders
                            page: 1
                          }
                        });
                        
                        console.log('[MoveAllToPending] Response received:', fetchResponse);
                        console.log('[MoveAllToPending] Response data structure:', {
                          hasOrders: !!fetchResponse.data?.orders,
                          isArray: Array.isArray(fetchResponse.data),
                          hasDataProperty: !!fetchResponse.data?.data,
                          dataKeys: Object.keys(fetchResponse.data || {})
                        });
                        
                        // Extract orders from response
                        let allOrders = [];
                        if (Array.isArray(fetchResponse.data?.orders)) {
                          allOrders = fetchResponse.data.orders;
                          console.log('[MoveAllToPending] Extracted from data.orders');
                        } else if (Array.isArray(fetchResponse.data)) {
                          allOrders = fetchResponse.data;
                          console.log('[MoveAllToPending] Extracted from data directly');
                        } else if (fetchResponse.data?.data && Array.isArray(fetchResponse.data.data)) {
                          allOrders = fetchResponse.data.data;
                          console.log('[MoveAllToPending] Extracted from data.data');
                        } else {
                          console.error('[MoveAllToPending] Could not extract orders array from response:', fetchResponse.data);
                        }
                        
                        console.log(`[MoveAllToPending] Found ${allOrders.length} processed orders`);
                        if (allOrders.length > 0) {
                          console.log('[MoveAllToPending] First order sample:', allOrders[0]);
                          console.log('[MoveAllToPending] All order IDs:', allOrders.map(o => o._id || o.id));
                        }
                        
                        if (allOrders.length === 0) {
                          setMessageDialog({ 
                            open: true, 
                            message: 'No processed orders found to move. Please check the console logs for details.', 
                            title: 'Info' 
                          });
                          return;
                        }
                        
                        // Step 2: Move each order to Pending
                        console.log('[MoveAllToPending] Step 2: Moving orders to Pending...');
                        setMessageDialog({ 
                          open: true, 
                          message: `Moving ${allOrders.length} orders to Pending...`, 
                          title: 'Processing' 
                        });
                        
                        const results = {
                          success: [],
                          failed: []
                        };
                        
                        // Process orders in batches to avoid overwhelming the server
                        const batchSize = 10;
                        for (let i = 0; i < allOrders.length; i += batchSize) {
                          const batch = allOrders.slice(i, i + batchSize);
                          console.log(`[MoveAllToPending] Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} orders)`);
                          
                          const batchPromises = batch.map(async (order) => {
                            const orderId = order._id || order.id;
                            if (!orderId) {
                              console.warn(`[MoveAllToPending] Order missing ID:`, order);
                              results.failed.push({
                                orderId: null,
                                orderName: order.orderName || order.shopifyOrderName || 'Unknown',
                                reason: 'Order missing ID'
                              });
                              return;
                            }
                            
                            // Validate orderId format
                            if (typeof orderId !== 'string' || orderId.trim() === '') {
                              console.error(`[MoveAllToPending] Invalid orderId format:`, orderId, typeof orderId);
                              results.failed.push({
                                orderId: String(orderId),
                                orderName: order.orderName || order.shopifyOrderName || 'Unknown',
                                reason: 'Invalid order ID format'
                              });
                              return;
                            }
                            
                            try {
                              // Construct update URL carefully - ensure no double slashes
                              const cleanOrderId = String(orderId).trim();
                              const updateUrl = `${apiBaseUrl}/orders/${cleanOrderId}/stage`;
                              console.log(`[MoveAllToPending] Attempting to move order ${cleanOrderId} (${order.orderName || order.shopifyOrderName})`);
                              console.log(`[MoveAllToPending] Full Update URL: ${updateUrl}`);
                              console.log(`[MoveAllToPending] Payload:`, { stage: 'Pending', comment: 'Moved from Processed to Pending (Bulk Move)' });
                              
                              const updateResponse = await axios.put(
                                updateUrl,
                                {
                                  stage: 'Pending',
                                  comment: 'Moved from Processed to Pending (Bulk Move)'
                                }
                              );
                              
                              console.log(`[MoveAllToPending] Update response:`, updateResponse.data);
                              
                              results.success.push({
                                orderId: orderId,
                                orderName: order.orderName || order.shopifyOrderName || 'Unknown'
                              });
                              
                              console.log(`[MoveAllToPending] ✓ Moved order ${orderId}: ${order.orderName || order.shopifyOrderName}`);
                            } catch (error) {
                              const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
                              console.error(`[MoveAllToPending] ✗ Failed to move order ${orderId}:`, errorMessage);
                              console.error(`[MoveAllToPending] Error details:`, {
                                status: error.response?.status,
                                statusText: error.response?.statusText,
                                data: error.response?.data,
                                fullError: error
                              });
                              results.failed.push({
                                orderId: orderId,
                                orderName: order.orderName || order.shopifyOrderName || 'Unknown',
                                reason: errorMessage
                              });
                            }
                          });
                          
                          // Wait for batch to complete before moving to next batch
                          await Promise.allSettled(batchPromises);
                        }
                        
                        // Step 3: Refresh data and show results
                        console.log(`[MoveAllToPending] Complete: ${results.success.length} succeeded, ${results.failed.length} failed`);
                        queryClient.invalidateQueries(['orders']);
                        
                        // Show results
                        if (results.failed.length === 0) {
                          setMessageDialog({ 
                            open: true, 
                            message: `Successfully moved all ${results.success.length} orders to Pending stage.`, 
                            title: 'Success' 
                          });
                        } else {
                          const successMsg = results.success.length > 0 
                            ? `Successfully moved ${results.success.length} orders.\n\n` 
                            : '';
                          const failedMsg = `Failed to move ${results.failed.length} orders:\n${results.failed.slice(0, 10).map(f => `• ${f.orderName}: ${f.reason}`).join('\n')}${results.failed.length > 10 ? `\n... and ${results.failed.length - 10} more` : ''}`;
                          
                          setMessageDialog({ 
                            open: true, 
                            message: successMsg + failedMsg, 
                            title: results.success.length > 0 ? 'Partial Success' : 'Error' 
                          });
                        }
                      } catch (error) {
                        console.error('[MoveAllToPending] Error:', error);
                        const errorMessage = error.response?.data?.message || error.message || 'Unknown error occurred';
                        setMessageDialog({ 
                          open: true, 
                          message: `Error moving orders: ${errorMessage}`, 
                          title: 'Error' 
                        });
                      }
                    }
                  });
                }}
                sx={{ height: 40, minWidth: 140 }}
              >
                Move All to Pending
              </Button>
              <Button
                variant="contained"
                color="error"
                onClick={async () => {
                  setConfirmDialog({
                    open: true,
                    title: 'Delete All Processed Orders',
                    message: 'Are you sure you want to DELETE all processed orders? This action cannot be undone!',
                    onConfirm: async () => {
                      try {
                        const ordersToDelete = data?.orders || sortedOrders || [];
                        console.log(`[DeleteAll] Deleting ${ordersToDelete.length} orders`);
                        
                        // Delete each order - use Promise.allSettled to delete all even if some fail
                        const deletePromises = ordersToDelete.map(async (order) => {
                          try {
                            const apiBaseUrl = getApiUrl();
                            await axios.delete(`${apiBaseUrl}/orders/${order._id}`);
                            return { status: 'fulfilled', orderName: order.orderName || order._id };
                          } catch (error) {
                            return { 
                              status: 'rejected', 
                              orderName: order.orderName || order._id,
                              reason: error.response?.data?.message || error.message 
                            };
                          }
                        });
                        
                        const results = await Promise.allSettled(deletePromises);
                        
                        // Count successes and failures
                        const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 'fulfilled').length;
                        const failed = results.length - successful;
                        
                        queryClient.invalidateQueries(['orders']);
                        
                        if (failed === 0) {
                          setMessageDialog({ 
                            open: true, 
                            message: `Successfully deleted all ${successful} processed orders`, 
                            title: 'Success' 
                          });
                        } else {
                          setMessageDialog({ 
                            open: true, 
                            message: `Deleted ${successful} orders. ${failed} failed to delete.`, 
                            title: successful > 0 ? 'Partial Success' : 'Error'
                          });
                        }
                      } catch (error) {
                        console.error('[DeleteAll] Error:', error);
                        setMessageDialog({ 
                          open: true, 
                          message: `Error deleting orders: ${error.message}`, 
                          title: 'Error' 
                        });
                      }
                    }
                  });
                }}
                sx={{ height: 40, minWidth: 140 }}
              >
                Delete All
              </Button>
              <Button
                variant="contained"
                color="primary"
                onClick={async () => {
                  // Build message based on date filter
                  let message = 'This will export all processed orders to Excel, email them, and move all orders to Pending.';
                  if (dateRange.startDate || dateRange.endDate || dateFilter) {
                    const dateRangeText = dateRange.startDate && dateRange.endDate
                      ? `${dateRange.startDate} to ${dateRange.endDate}`
                      : dateFilter
                      ? dateFilter
                      : 'selected date range';
                    message = `This will export processed orders for ${dateRangeText} to Excel, email them, and move those orders to Pending.`;
                  }
                  
                  setConfirmDialog({
                    open: true,
                    title: 'Clear All Processed Orders',
                    message: message + ' Continue?',
                    onConfirm: async () => {
                      try {
                        const apiBaseUrl = getApiUrl();
                        
                        // Build request body with date filters if set
                        const requestBody = {};
                        if (dateRange.startDate && dateRange.endDate) {
                          requestBody.startDate = dateRange.startDate;
                          requestBody.endDate = dateRange.endDate;
                          if (dateRange.startTime) requestBody.startTime = dateRange.startTime;
                          if (dateRange.endTime) requestBody.endTime = dateRange.endTime;
                        } else if (dateFilter) {
                          const filterDateObj = new Date(dateFilter);
                          const formattedDate = filterDateObj.toISOString().split('T')[0];
                          requestBody.startDate = formattedDate;
                          requestBody.endDate = formattedDate;
                        }
                        
                        const response = await axios.post(`${apiBaseUrl}/orders/processed/clear-all`, requestBody);
                        
                        queryClient.invalidateQueries(['orders']);
                        
                        if (response.data.success) {
                          let message = `Successfully moved ${response.data.ordersMoved} orders to Pending. ${response.data.emailSent ? 'Email sent.' : 'Email not sent.'}`;
                          
                          // Offer consolidated download if available
                          if (response.data.consolidatedExport) {
                            const downloadConsolidated = window.confirm(
                              `${message}\n\nWould you like to download the consolidated export now?`
                            );
                            
                            if (downloadConsolidated) {
                              // Download consolidated export
                              const base64Data = response.data.consolidatedExport;
                              const binaryString = atob(base64Data);
                              const bytes = new Uint8Array(binaryString.length);
                              for (let i = 0; i < binaryString.length; i++) {
                                bytes[i] = binaryString.charCodeAt(i);
                              }
                              const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                              const url = window.URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.setAttribute('download', response.data.consolidatedExportFilename || 'processed-orders-consolidated.xlsx');
                              document.body.appendChild(link);
                              link.click();
                              link.remove();
                              window.URL.revokeObjectURL(url);
                              message += ' Consolidated export downloaded.';
                            }
                          }
                          
                          setMessageDialog({
                            open: true,
                            message: message,
                            title: 'Success'
                          });
                        } else {
                          setMessageDialog({
                            open: true,
                            message: response.data.message || 'Failed to clear processed orders',
                            title: 'Error'
                          });
                        }
                      } catch (error) {
                        console.error('[ClearAllProcessed] Error:', error);
                        setMessageDialog({
                          open: true,
                          message: `Error clearing processed orders: ${error.response?.data?.message || error.message}`,
                          title: 'Error'
                        });
                      }
                    }
                  });
                }}
                sx={{ height: 40, minWidth: 180, ml: 1 }}
              >
                Clear All to Pending
              </Button>
              <Button
                variant="outlined"
                color="info"
                startIcon={<RefreshIcon />}
                onClick={async () => {
                  try {
                    setMessageDialog({ open: true, message: 'Refreshing fulfillment status for all processed orders...', title: 'Refreshing' });
                    
                    // Get all processed orders with date filter if applied
                    const apiBaseUrl = getApiUrl();
                    const params = { stage: 'Processed', limit: 5000 };
                    
                    // Apply date filter if set
                    if (dateRange.startDate && dateRange.endDate) {
                      params.startDate = dateRange.startDate;
                      params.endDate = dateRange.endDate;
                      if (dateRange.startTime) params.startTime = dateRange.startTime;
                      if (dateRange.endTime) params.endTime = dateRange.endTime;
                    } else if (dateFilter) {
                      const filterDateObj = new Date(dateFilter);
                      const formattedDate = filterDateObj.toISOString().split('T')[0];
                      params.startDate = formattedDate;
                      params.endDate = formattedDate;
                    }
                    
                    const resp = await axios.get(`${apiBaseUrl}/orders`, { params });
                    const ordersList = Array.isArray(resp.data?.orders) ? resp.data.orders : (Array.isArray(resp.data) ? resp.data : []);
                    
                    if (ordersList.length === 0) {
                      setMessageDialog({ open: true, message: 'No processed orders found to refresh.', title: 'Info' });
                      return;
                    }
                    
                    // Extract order IDs
                    const orderIds = ordersList.map(order => order._id || order.orderId).filter(Boolean);
                    
                    // Refresh fulfillment status
                    await axios.post(`${apiBaseUrl}/orders/refresh-fulfillment`, { orderIds });
                    
                    // Invalidate queries to refresh the UI
                    queryClient.invalidateQueries(['orders']);
                    
                    setMessageDialog({ 
                      open: true, 
                      message: `Successfully refreshed fulfillment status for ${orderIds.length} order(s).`, 
                      title: 'Success' 
                    });
                  } catch (error) {
                    console.error('[RefreshFulfillment] Error:', error);
                    setMessageDialog({ 
                      open: true, 
                      message: `Error refreshing fulfillment status: ${error.response?.data?.message || error.message}`, 
                      title: 'Error' 
                    });
                  }
                }}
                sx={{ height: 40, minWidth: 200, ml: 1 }}
              >
                Refresh Fulfillment
              </Button>
              <Button
                variant="outlined"
                color="success"
                startIcon={<SendIcon />}
                onClick={() => {
                  setSendExcelEmail('');
                  setSendExcelDialogOpen(true);
                }}
                sx={{ height: 40, minWidth: 150, ml: 1 }}
              >
                Send Excel
              </Button>
              <Button
                variant="outlined"
                color="primary"
                startIcon={<GetAppIcon />}
                onClick={() => {
                  ensureProcessedExportDefaults();
                  setProcessedExportError('');
                  setProcessedExportDialogOpen(true);
                }}
                sx={{ height: 40, minWidth: 180, ml: 1 }}
              >
                Download Consolidated
              </Button>
              <Button
                variant="outlined"
                startIcon={<SendIcon />}
                onClick={openEmailSettings}
                sx={{ height: 40, minWidth: 180 }}
              >
                Processed Email Settings
              </Button>
            </>
          )}
          
          {stage === 'Pending' && (
            <Button
              variant="contained"
              color="warning"
              onClick={async () => {
                setConfirmDialog({
                  open: true,
                  title: 'Move Orders',
                  message: 'Are you sure you want to move all pending orders to processed?',
                  onConfirm: async () => {
                  try {
                    // Call the moveAllOrdersToStage function from orderUtils
                    const result = await moveAllOrdersToStage('Pending', 'Processed', 'Moved from Pending to Processed', { orders: sortedOrders });
                    queryClient.invalidateQueries(['orders']);
                    
                    // Show detailed results
                    if (result.failed.length === 0) {
                      setMessageDialog({ 
                        open: true, 
                        message: `Successfully moved all ${result.success.length} orders to Processed stage`, 
                        title: 'Success' 
                      });
                    } else {
                      const message = `Moved ${result.success.length} orders successfully.\n${result.failed.length} failed:\n${result.failed.map(f => `- ${f.orderName}: ${f.reason}`).join('\n')}`;
                      setMessageDialog({ 
                        open: true, 
                        message, 
                        title: result.success.length > 0 ? 'Partial Success' : 'Error' 
                      });
                    }
                  } catch (error) {
                    setMessageDialog({ open: true, message: `Error moving orders: ${error.message}`, title: 'Error' });
                  }
                  }
                });
              }}
              sx={{ height: 40, minWidth: 140 }}
            >
              Move All to Processed
            </Button>
          )}
          
          <Button
            variant="outlined"
            color="primary"
            onClick={async () => {
              try {
                if (stage === 'Processed') {
                  ensureProcessedExportDefaults();
                  setProcessedExportError('');
                  setProcessedExportDialogOpen(true);
                  return;
                }

                const apiBaseUrl = getApiUrl();
                
                // Build export params with filters
                const exportParams = {
                  stage: stage
                };
                
                if (filters?.search) {
                  exportParams.search = filters.search;
                }
                if (filters?.sortBy) {
                  exportParams.sortBy = filters.sortBy;
                }
                if (filters?.sortOrder) {
                  exportParams.sortOrder = filters.sortOrder;
                }
                if (filters?.vendorId) {
                  exportParams.vendor = filters.vendorId;
                }
                if (fulfillmentFilter) {
                  exportParams.fulfillmentStatus = fulfillmentFilter;
                }
                
                // Add date filter if set
                if (dateFilter) {
                  const filterDateObj = new Date(dateFilter);
                  const formattedDate = filterDateObj.toISOString().split('T')[0];
                  exportParams.startDate = formattedDate;
                  exportParams.endDate = formattedDate;
                }
                
                // For Pending/Completed pages, export all matching orders (not just current page)
                if (stage === 'Pending' || stage === 'Completed') {
                  // Use backend export endpoint with filters
                  const response = await axios.get(`${apiBaseUrl}/orders/export`, {
                    params: exportParams,
                    responseType: 'blob'
                  });
                  
                  const url = window.URL.createObjectURL(new Blob([response.data]));
                  const link = document.createElement('a');
                  link.href = url;
                  const dateSuffix = dateFilter ? `-${dateFilter}` : '';
                  link.setAttribute('download', `orders-${stage.toLowerCase()}${dateSuffix}-${new Date().toISOString().split('T')[0]}.csv`);
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                  window.URL.revokeObjectURL(url);
                  
                  setMessageDialog({ 
                    open: true, 
                    message: `Exported all ${stage} orders${dateFilter ? ` for ${dateFilter}` : ''}`, 
                    title: 'Export Success' 
                  });
                } else {
                  // For other stages, export current page data
                  let ordersToExport = [];
                  const startIndex = page * rowsPerPage;
                  const endIndex = startIndex + rowsPerPage;
                  const paginatedOrders = sortedOrders.slice(startIndex, endIndex);
                  
                  paginatedOrders.forEach(order => {
                    order.items.forEach(item => {
                      const vendorName = item.vendor 
                        ? (typeof item.vendor === 'object' ? item.vendor.name : item.vendor)
                        : 'No Vendor Assigned';
                      
                      ordersToExport.push({
                        'Order ID': order._id || '',
                        'Order Name': order.orderName || order.shopifyOrderName || '',
                        'Shopify Order ID': order.shopifyOrderId || '',
                        'Customer Name': order.customerName || '',
                        'Vendor': vendorName,
                        'Product Name': item.productName || '',
                        'Variant': item.variantName || '',
                        'SKU': item.sku || '',
                        'Quantity': item.quantity || 0,
                        'Price': typeof item.price === 'number' ? item.price : (item.costPrice || ''),
                        'Warehouse': item.warehouse || '',
                        'Stage': order.stage || stage,
                        'Payment Status': order.paymentStatus || '',
                        'Fulfillment Status': order.fulfillmentStatus || '',
                        'Created At': order.createdAt ? new Date(order.createdAt).toISOString() : ''
                      });
                    });
                  });
                  
                  if (ordersToExport.length === 0) {
                    setMessageDialog({ open: true, message: 'No orders to export on this page', title: 'Warning' });
                    return;
                  }
                  
                  // Convert to CSV
                  const headers = Object.keys(ordersToExport[0]);
                  const csvRows = [
                    headers.join(','),
                    ...ordersToExport.map(row => 
                      headers.map(header => {
                        const value = row[header] || '';
                        const stringValue = String(value).replace(/"/g, '""');
                        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                          return `"${stringValue}"`;
                        }
                        return stringValue;
                      }).join(',')
                    )
                  ].join('\n');
                  
                  // Create blob and download
                  const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
                  const url = window.URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.setAttribute('download', `orders-${stage.toLowerCase()}-page-${page + 1}-${new Date().toISOString().split('T')[0]}.csv`);
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                  window.URL.revokeObjectURL(url);
                  
                  setMessageDialog({ 
                    open: true, 
                    message: `Exported ${ordersToExport.length} order items from page ${page + 1}`, 
                    title: 'Export Success' 
                  });
                }
              } catch (error) {
                console.error('Export error:', error);
                setMessageDialog({ open: true, message: 'Failed to export orders: ' + (error.response?.data?.message || error.message), title: 'Error' });
              }
            }}
            sx={{ height: 40, minWidth: 120 }}
          >
            {stage === 'Processed' || stage === 'Pending' || stage === 'Completed' ? 'Export All' : 'Export Current Page'}
          </Button>
          
          {stage === 'Initial' && (
            <>
              <Button
                variant="contained"
                color="success"
                startIcon={<SendIcon />}
                onClick={handleProcessSelected}
                disabled={selectedItems.length === 0 || isProcessingSelection}
                sx={{ height: 40, minWidth: 180 }}
              >
                Process Selected Items ({selectedItems.length})
              </Button>
              <Button
                variant="contained"
                color="warning"
                startIcon={<SwapVertIcon />}
                onClick={() => setChangeStageDialogOpen(true)}
                disabled={selectedItems.length === 0 || isStageChangeInProgress}
                sx={{ height: 40, minWidth: 140 }}
              >
                Change Stage ({selectedItems.length})
              </Button>
            </>
          )}
        </Stack>
      </Stack>
      
      {/* Second row with filters */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }} alignItems="center">
        {/* Date and Time Range Filters */}
        <TextField
          label="Start Date"
          type="date"
          value={dateRange.startDate}
          onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
          InputLabelProps={{
            shrink: true,
          }}
          sx={{ minWidth: 180 }}
        />
        <TextField
          label="Start Time"
          type="time"
          value={dateRange.startTime}
          onChange={(e) => setDateRange({ ...dateRange, startTime: e.target.value })}
          InputLabelProps={{
            shrink: true,
          }}
          sx={{ minWidth: 150 }}
        />
        <TextField
          label="End Date"
          type="date"
          value={dateRange.endDate}
          onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
          InputLabelProps={{
            shrink: true,
          }}
          sx={{ minWidth: 180 }}
        />
        <TextField
          label="End Time"
          type="time"
          value={dateRange.endTime}
          onChange={(e) => setDateRange({ ...dateRange, endTime: e.target.value })}
          InputLabelProps={{
            shrink: true,
          }}
          sx={{ minWidth: 150 }}
        />
        <Button
          variant="outlined"
          onClick={() => {
            setDateRange({ startDate: '', endDate: '', startTime: '', endTime: '' });
            setDateFilter('');
          }}
          sx={{ height: 40, minWidth: 100 }}
        >
          Clear Filters
        </Button>
        
        {/* Legacy single date filter (keep for backward compatibility) */}
        {!dateRange.startDate && !dateRange.endDate && (
          <>
            <TextField
              label="Filter by Date (Legacy)"
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
              sx={{ height: 40, minWidth: 100 }}
            >
              Clear Date
            </Button>
          </>
        )}

        {stage === 'Processed' && (
          <Button
            variant="outlined"
            onClick={async () => {
              try {
                const apiBaseUrl = getApiUrl();
                const resp = await axios.get(`${apiBaseUrl}/orders/exports`);
                setExportsList(resp.data?.records || []);
                setExportsDialogOpen(true);
              } catch (e) {
                setMessageDialog({ open: true, message: 'Failed to load exports history', title: 'Error' });
              }
            }}
            sx={{ height: 40 }}
          >
            Exports History
          </Button>
        )}

        {/* Select All button for Processed stage */}
        {stage === 'Processed' && vendorGroups && Object.keys(vendorGroups).length > 0 && (
          <Button
            variant="outlined"
            onClick={() => {
              if (selectedVendorGroups.size === Object.keys(vendorGroups).length) {
                // Deselect all
                setSelectedVendorGroups(new Set());
              } else {
                // Select all
                setSelectedVendorGroups(new Set(Object.keys(vendorGroups)));
              }
            }}
            sx={{ height: 40, minWidth: 120 }}
          >
            {selectedVendorGroups.size === Object.keys(vendorGroups).length ? 'Deselect All' : 'Select All'}
          </Button>
        )}

        {/* Consolidated PDF Download - Processed and Pending */}
        {(stage === 'Processed' || stage === 'Pending') && (
          <>
          <Button
            variant="contained"
            color="primary"
            startIcon={<GetAppIcon />}
            disabled={selectedVendorGroups.size === 0}
            onClick={async () => {
              if (selectedVendorGroups.size === 0) {
                setMessageDialog({ open: true, message: 'Please select at least one vendor group', title: 'Warning' });
                return;
              }
              
              const selectedGroups = Object.values(vendorGroups).filter(vg => selectedVendorGroups.has(vg.id));
              
              // Show download choice dialog
              setDownloadChoiceDialog({
                open: true,
                count: selectedVendorGroups.size,
                onZip: async () => {
                  // Generate and download separate PDFs from JSON (no ZIP)
                  try {
                    const allItems = [];
                    for (const vg of selectedGroups) {
                      const vendorItems = vg.items.map(item => ({ orderId: item.orderId, itemId: item._id }));
                      allItems.push(...vendorItems);
                    }
                    const selectedWarehouse = getVendorGroupWarehouse(selectedGroups[0]);
                    const loadingMsg = `Generating PDFs for ${selectedGroups.length} vendors...`;
                    const rand = Math.random().toString(36).substring(7);
                    const loadingElId = `loading-${rand}`;
                    document.body.insertAdjacentHTML('beforeend',
                      `<div id="${loadingElId}" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;justify-content:center;align-items:center;">
                        <div style="background:white;padding:20px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.2);">
                          <p style="margin:0;">${loadingMsg}</p>
                        </div>
                      </div>`
                    );
                    const apiBaseUrl = getApiUrl();
                    const response = await axios.post(
                      `${apiBaseUrl}/orders/vendor-pdf-bulk`,
                      { items: allItems, warehouse: selectedWarehouse },
                      { timeout: 120000 }
                    );
                    document.getElementById(loadingElId)?.remove();
                    const data = response.data;
                    if (!data || !Array.isArray(data.results) || data.results.length === 0) {
                      setMessageDialog({ open: true, message: data?.error || 'No PDFs were generated', title: 'Error' });
                      return;
                    }
                    const base64ToBlob = (base64, type) => {
                      const binary = atob(base64);
                      const len = binary.length;
                      const bytes = new Uint8Array(len);
                      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
                      return new Blob([bytes], { type });
                    };
                    const timestamp = new Date().toISOString().split('T')[0];
                    for (const item of data.results) {
                      if (!item || !item.pdfBase64) continue;
                      const blob = base64ToBlob(item.pdfBase64, 'application/pdf');
                      const url = window.URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.setAttribute('download', item.fileName || `PO_${item.vendorName || 'Vendor'}_${timestamp}.pdf`);
                      document.body.appendChild(link);
                      link.click();
                      setTimeout(() => {
                        window.URL.revokeObjectURL(url);
                        if (document.body.contains(link)) document.body.removeChild(link);
                      }, 150);
                      await new Promise(r => setTimeout(r, 200));
                    }
                    } catch (error) {
                    console.error('Bulk PDF download error:', error);
                    // Attempt to remove the loading indicator safely
                    try {
                      const el = document.querySelector('[id^="loading-"]');
                      if (el) el.remove();
                    } catch (e) {
                      // ignore
                    }
                    setMessageDialog({ open: true, message: 'Failed to download PDFs: ' + (error.response?.data?.error || error.message), title: 'Error' });
                  }
                },
                onSeparate: async () => {
                  // Same as onZip now: generate and download separate PDFs from JSON
                  try {
                    const allItems = [];
                    for (const vg of selectedGroups) {
                      const vendorItems = vg.items.map(item => ({ orderId: item.orderId, itemId: item._id }));
                      allItems.push(...vendorItems);
                    }
                    const selectedWarehouse = getVendorGroupWarehouse(selectedGroups[0]);
                    const loadingMsg = `Generating PDFs for ${selectedGroups.length} vendors...`;
                    const rand2 = Math.random().toString(36).substring(7);
                    const loadingElId2 = `loading-${rand2}`;
                    document.body.insertAdjacentHTML('beforeend',
                      `<div id="${loadingElId2}" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;justify-content:center;align-items:center;">
                        <div style="background:white;padding:20px;border-radius:8px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.2);">
                          <p style="margin:0;">${loadingMsg}</p>
                        </div>
                      </div>`
                    );
                    const apiBaseUrl = getApiUrl();
                    const response = await axios.post(
                      `${apiBaseUrl}/orders/vendor-pdf-bulk`,
                      { items: allItems, warehouse: selectedWarehouse },
                      { timeout: 120000 }
                    );
                    document.getElementById(loadingElId2)?.remove();
                    const data = response.data;
                    if (!data || !Array.isArray(data.results) || data.results.length === 0) {
                      setMessageDialog({ open: true, message: data?.error || 'No PDFs were generated', title: 'Error' });
                      return;
                    }
                    const base64ToBlob = (base64, type) => {
                      const binary = atob(base64);
                      const len = binary.length;
                      const bytes = new Uint8Array(len);
                      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
                      return new Blob([bytes], { type });
                    };
                    for (const item of data.results) {
                      if (!item || !item.pdfBase64) continue;
                      const blob = base64ToBlob(item.pdfBase64, 'application/pdf');
                      const url = window.URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.setAttribute('download', item.fileName || `PO_${item.vendorName || 'Vendor'}.pdf`);
                      document.body.appendChild(link);
                      link.click();
                      setTimeout(() => {
                        window.URL.revokeObjectURL(url);
                        if (document.body.contains(link)) document.body.removeChild(link);
                      }, 150);
                      await new Promise(r => setTimeout(r, 200));
                    }
                    setMessageDialog({ open: true, message: `Downloaded ${data.results.length} PDF file(s)`, title: 'Success' });
                    } catch (error) {
                    console.error('Separate PDF download error:', error);
                    try {
                      const el = document.querySelector('[id^="loading-"]');
                      if (el) el.remove();
                    } catch (e) {}
                    setMessageDialog({ open: true, message: 'Failed to download PDFs: ' + (error.response?.data?.error || error.message), title: 'Error' });
                  }
                }
              });
            }}
            sx={{ height: 40, minWidth: 180 }}
          >
            Download Selected ({selectedVendorGroups.size})
          </Button>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<GetAppIcon />}
            disabled={selectedVendorGroups.size === 0}
            onClick={async () => {
              if (selectedVendorGroups.size === 0) {
                setMessageDialog({ open: true, message: 'Please select at least one vendor group', title: 'Warning' });
                return;
              }
              try {
                const selectedGroups = Object.values(vendorGroups).filter(vg => selectedVendorGroups.has(vg.id));
                const allItems = [];
                for (const vg of selectedGroups) {
                  const vendorItems = vg.items.map(item => ({ orderId: item.orderId, itemId: item._id }));
                  allItems.push(...vendorItems);
                }
                const selectedWarehouse = getVendorGroupWarehouse(selectedGroups[0]);
                const loadingMsg = `Generating ZIP for ${selectedGroups.length} vendors...`;
                const rand = Math.random().toString(36).substring(7);
                const loadingElId = `loading-${rand}`;
                document.body.insertAdjacentHTML('beforeend',
                  `<div id="${loadingElId}" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;justify-content:center;align-items:center;">
                    <div style="background:white;padding:20px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.2);">
                      <p style="margin:0;">${loadingMsg}</p>
                    </div>
                  </div>`
                );
                const apiBaseUrl = getApiUrl();
                const response = await axios.post(
                  `${apiBaseUrl}/orders/vendor-pdf-bulk`,
                  { items: allItems, warehouse: selectedWarehouse, asZip: true },
                  { timeout: 120000 }
                );
                document.getElementById(loadingElId)?.remove();
                const data = response.data;
                if (!data || !data.zipBase64) {
                  setMessageDialog({ open: true, message: data?.error || 'No ZIP was generated', title: 'Error' });
                  return;
                }
                const binary = atob(data.zipBase64);
                const len = binary.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
                const blob = new Blob([bytes], { type: 'application/zip' });
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', data.fileName || `vendor-po-${new Date().toISOString().split('T')[0]}.zip`);
                document.body.appendChild(link);
                link.click();
                setTimeout(() => {
                  window.URL.revokeObjectURL(url);
                  if (document.body.contains(link)) document.body.removeChild(link);
                }, 200);
              } catch (error) {
                console.error('ZIP download error:', error);
                try {
                  const el = document.querySelector('[id^="loading-"]');
                  if (el) el.remove();
                } catch (e) {}
                setMessageDialog({ open: true, message: 'Failed to download ZIP: ' + (error.response?.data?.error || error.message), title: 'Error' });
              }
            }}
            sx={{ height: 40, minWidth: 180 }}
          >
            Download ZIP
          </Button>
          </>
        )}

        {/* Sort by name */}
        <Button
          variant="outlined"
          color={sortDirection === 'asc' ? 'primary' : 'inherit'}
          onClick={() => setSortDirection(sortDirection === 'asc' ? '' : 'asc')}
          sx={{ height: 40, minWidth: 140 }}
        >
          Sort by Name A-Z {sortDirection === 'asc' ? '✓' : ''}
        </Button>

        {/* Fulfillment quick filter */}
        <FormControl sx={{ minWidth: 180 }}>
          <InputLabel id="ff-label">Fulfillment</InputLabel>
          <Select
            labelId="ff-label"
            value={fulfillmentFilter}
            label="Fulfillment"
            onChange={(e) => setFulfillmentFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="Fulfilled">Fulfilled</MenuItem>
            <MenuItem value="Unfulfilled">Unfulfilled</MenuItem>
            <MenuItem value="Partially Fulfilled">Partially Fulfilled</MenuItem>
            <MenuItem value="Cancelled">Cancelled</MenuItem>
          </Select>
        </FormControl>
        
        {/* Vendor filter - only shown on Initial stage */}
        {stage === 'Initial' && (
          <Autocomplete
            options={vendorOptions}
            getOptionLabel={(option) => option.name || ''}
            value={vendors?.find(v => v._id === filters.vendorId) || null}
            onChange={(e, newValue) => setFilters(prev => ({ ...prev, vendorId: newValue?._id || '' }))}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Filter by Vendor"
                placeholder="Search vendors..."
                variant="outlined"
                size="small"
              />
            )}
            sx={{ minWidth: 250 }}
            filterOptions={(options, state) => {
              const inputValue = state.inputValue.toLowerCase();
              return options.filter(option => {
                const n = typeof option.name === 'string' ? option.name : '';
                return n.toLowerCase().includes(inputValue);
              });
            }}
            noOptionsText="No vendors found"
          />
        )}
        
        <Button
          variant="outlined"
          onClick={() => {
            setDateFilter('');
            setSortDirection('');
            setFilters(prev => ({
              ...prev,
              vendorId: '',
              sortBy: 'createdAt',
              sortOrder: 'desc'
            }));
            // Clear localStorage
            localStorage.removeItem(`${stage}OrdersFilters`);
            localStorage.removeItem(`${stage}OrdersDateFilter`);
            localStorage.removeItem(`${stage}OrdersSortDirection`);
          }}
          sx={{ height: 40, minWidth: 120 }}
        >
          Clear All Filters
        </Button>
      </Stack>

      <TableContainer sx={{
        backgroundColor: theme.palette.mode === 'dark' ? theme.palette.background.paper : theme.palette.background.paper
      }}>

        {stage === 'Processed' || stage === 'Pending' || stage === 'Completed' ? (
          // Processed Orders - Group by vendor
          <div>
            {Object.values(vendorGroups).map((vendorGroup) => (
              <Box key={vendorGroup.id} sx={{ mb: 4 }}>
                {/* Vendor Header with Download Button */}
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  bgcolor: theme.palette.mode === 'dark' ? theme.palette.action.hover : theme.palette.grey[100], 
                  color: theme.palette.text.primary,
                  p: 2, 
                  borderRadius: '4px 4px 0 0' 
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {(stage === 'Processed' || stage === 'Pending') && (
                      <Checkbox
                        checked={selectedVendorGroups.has(vendorGroup.id)}
                        onChange={(e) => {
                          const newSet = new Set(selectedVendorGroups);
                          if (e.target.checked) {
                            newSet.add(vendorGroup.id);
                          } else {
                            newSet.delete(vendorGroup.id);
                          }
                          setSelectedVendorGroups(newSet);
                        }}
                      />
                    )}
                    <Typography variant="h6">
                      {vendorGroup.name}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                      <InputLabel id={`warehouse-label-${vendorGroup.id}`}>Warehouse</InputLabel>
                      <Select
                        labelId={`warehouse-label-${vendorGroup.id}`}
                        label="Warehouse"
                        value={getVendorGroupWarehouse(vendorGroup)}
                        onChange={async (e) => {
                          const newWarehouse = e.target.value;
                          const vendorItems = vendorGroup.items.map(item => ({ orderId: item.orderId, itemId: item._id }));
                          try {
                            await bulkWarehouseMutation.mutateAsync({ items: vendorItems, warehouse: newWarehouse });
                          } catch (err) {
                            // handled in mutation onError
                          }
                        }}
                      >
                        <MenuItem value="Okhla">Okhla</MenuItem>
                        <MenuItem value="Bahadurgarh">Bahadurgarh</MenuItem>
                        <MenuItem value="Direct">Direct</MenuItem>
                      </Select>
                    </FormControl>
                    <Button
                      variant="contained"
                      color="primary"
                      data-vendor-id={vendorGroup.id}
                      startIcon={<GetAppIcon />}
                      sx={{ height: 40, minWidth: 120 }}
                      onClick={async () => {
                        const selectedWarehouse = getVendorGroupWarehouse(vendorGroup);
                        let loadingId = null;
                        try {
                          if (vendorGroup.items.length === 0) {
                            setMessageDialog({ open: true, message: 'No items found for this vendor', title: 'Warning' });
                            return;
                          }
                          const vendorItems = vendorGroup.items.map(item => ({ orderId: item.orderId, itemId: item._id }));
                          const loadingMsg = `Generating PDF for ${vendorGroup.name}...`;
                          loadingId = Math.random().toString(36).substring(7);
                          document.body.insertAdjacentHTML('beforeend', 
                            `<div id="${loadingId}" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;justify-content:center;align-items:center;">
                              <div style="background:white;padding:20px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.2);">
                                <p style="margin:0;">${loadingMsg}</p>
                              </div>
                            </div>`
                          );
                          const apiBaseUrl = getApiUrl();
                          const response = await axios.post(
                            `${apiBaseUrl}/orders/vendor-pdf-bulk`,
                            { items: vendorItems, warehouse: selectedWarehouse },
                            { timeout: 60000 }
                          );
                          document.getElementById(loadingId)?.remove();
                          const data = response.data;
                          if (!data || !Array.isArray(data.results) || data.results.length === 0) {
                            setMessageDialog({ open: true, message: data?.error || 'No PDFs were generated', title: 'Error' });
                            return;
                          }
                          const base64ToBlob = (base64, type) => {
                            const binary = atob(base64);
                            const len = binary.length;
                            const bytes = new Uint8Array(len);
                            for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
                            return new Blob([bytes], { type });
                          };
                          const item = data.results[0];
                          const blob = base64ToBlob(item.pdfBase64, 'application/pdf');
                          const url = window.URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          const timestamp = new Date().toISOString().split('T')[0];
                          const safeVendorName = (item.vendorName || vendorGroup.name || 'Vendor').replace(/[^a-zA-Z0-9-_]/g, '_');
                          link.setAttribute('download', item.fileName || `PO_${safeVendorName}_${selectedWarehouse}_${timestamp}.pdf`);
                          document.body.appendChild(link);
                          link.click();
                          setTimeout(() => {
                            window.URL.revokeObjectURL(url);
                            if (document.body.contains(link)) {
                              document.body.removeChild(link);
                            }
                          }, 200);
                        } catch (error) {
                          console.error('PDF download error:', error);
                          // Remove loading indicator safely
                          try {
                            if (typeof loadingId !== 'undefined') {
                              document.getElementById(loadingId)?.remove();
                            } else {
                              // Fallback: try to find and remove any loading indicator
                              const loadingElement = document.querySelector('[style*="z-index:9999"]');
                              if (loadingElement) loadingElement.remove();
                            }
                          } catch (removeError) {
                            console.error('Error removing loading indicator:', removeError);
                          }
                          
                          let errorMsg = 'Unknown error';
                          if (error.response) {
                            const status = error.response.status;
                            if (error.response.data && typeof error.response.data === 'string' && error.response.data.length < 200) {
                              errorMsg = `Server error (${status}): ${error.response.data}`;
                            } else {
                              errorMsg = `Server error: ${status}`;
                            }
                          } else if (error.request) {
                            errorMsg = 'Network error - server not responding';
                          } else if (error.message) {
                            errorMsg = error.message;
                          }
                          setMessageDialog({ open: true, message: `Failed to download PDF: ${errorMsg}`, title: 'Error' });
                        }
                      }}
                    >
                      Download PDF
                    </Button>
                  </Stack>
                </Box>
                
                {/* Items Table */}
                <Table>
                  <TableHead>
                      <TableRow sx={{
                        backgroundColor: (theme) => theme.palette.mode === 'dark' ? theme.palette.action.hover : theme.palette.grey[100],
                        '& .MuiTableCell-root': {
                          color: (theme) => theme.palette.text.primary,
                          fontWeight: 600
                        }
                      }}>
                        <TableCell>Order</TableCell>
                        <TableCell>Item Description</TableCell>
                        <TableCell>Quantity</TableCell>
                        <TableCell>ORDER PRICE</TableCell>
                        <TableCell>Vendor</TableCell>
                        <TableCell>Payment Status</TableCell>
                        <TableCell>Shopify Order Date</TableCell>
                        {stage === 'Pending' && <TableCell>Expected Date</TableCell>}
                        <TableCell>Actions</TableCell>
                      </TableRow>
                  </TableHead>
                  <TableBody>
                    {vendorGroup.items.map((item, index) => (
                      <TableRow key={`${item.orderId}-${item._id}`}>
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {item.orderName}
                            {item.orderIsManual && (
                              <Chip label="M" size="small" color="primary" variant="outlined" />
                            )}
                          </Typography>
                          {item.customerName && (
                            <Typography variant="body2" color="textSecondary">
                              {item.customerName}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            {stage === 'In-Stock' ? (
                              <>
                                <strong>
                                  <SKUPrice 
                                    sku={item.sku} 
                                    fallbackPrice={typeof item.price === 'number' ? item.price : (item.costPrice || null)}
                                    page={stage.toLowerCase()}
                                    location={item.warehouse || 'Okhla'}
                                  />
                                </strong>
                                {' '}- {item.productName} {item.variantName ? `- ${item.variantName}` : ''}
                                {item.vendor?.name && (
                                  <Chip label={item.vendor.name} size="small" color="primary" variant="outlined" />
                                )}
                                <Chip label={`Qty: ${item.quantity || 1}`} size="small" variant="outlined" />
                              </>
                            ) : (
                              <>
                                {item.productName} {item.variantName ? `- ${item.variantName}` : ''}
                              </>
                            )}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            SKU: <SKUPriceLink sku={item.sku} page={stage.toLowerCase()} location={item.warehouse || 'Okhla'} />
                          </Typography>
                          {Array.isArray(item.individualSkus) && item.individualSkus.length > 0 && (
                            <Box sx={{ mt: 0.5 }}>
                              <IndividualSkusBadge skus={item.individualSkus} />
                            </Box>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.quantity || 1}
                        </TableCell>
                        <TableCell>
                          <SKUPrice 
                            sku={item.sku} 
                            fallbackPrice={typeof item.price === 'number' ? item.price : (item.costPrice || null)}
                            page={stage.toLowerCase()}
                            location={item.warehouse || 'Okhla'}
                          />
                        </TableCell>
                        <TableCell>
                          <Autocomplete
                            size="small"
                            options={vendorOptions}
                            getOptionLabel={(option) => typeof option === 'string' ? option : (option?.name || '')}
                            value={vendors?.find(v => v._id === (item.vendor?._id)) || null}
                            onChange={(e, newValue) => {
                              if (typeof newValue === 'string') {
                                const val = newValue.trim();
                                if (val) {
                                  updateVendorMutation.mutate({ orderId: item.orderId, itemId: item._id, vendorName: val });
                                }
                              } else if (newValue && newValue._id) {
                                updateVendorMutation.mutate({ orderId: item.orderId, itemId: item._id, vendorId: newValue._id });
                              } else if (newValue && newValue.name) {
                                const val = String(newValue.name).trim();
                                if (val) {
                                  updateVendorMutation.mutate({ orderId: item.orderId, itemId: item._id, vendorName: val });
                                }
                              }
                            }}
                            freeSolo
                            clearOnBlur={false}
                            selectOnFocus
                            inputValue={vendorInputValues[item._id] || ''}
                            onInputChange={(e, newInput) => {
                              setVendorInputValues(prev => ({ ...prev, [item._id]: newInput || '' }));
                            }}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                label="Vendor"
                                variant="outlined"
                                placeholder={item.vendor?.name || 'Type or select'}
                                size="small"
                              />
                            )}
                            sx={{ minWidth: 200 }}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={item.paymentStatus}
                            color={STATUS_COLORS[item.paymentStatus]}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          {new Date(item.createdAt).toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </TableCell>
                        {stage === 'Pending' && (
                          <TableCell>
                            <ExpectedDateField 
                              item={item} 
                              orderId={item.orderId}
                              onDateChange={(newDate) => {
                                // Update the item in the local state
                                const updatedOrders = sortedOrders.map(order => {
                                  if (order._id === item.orderId) {
                                    return {
                                      ...order,
                                      items: order.items.map(orderItem => {
                                        if (orderItem._id === item._id) {
                                          return { ...orderItem, expectedDate: newDate };
                                        }
                                        return orderItem;
                                      })
                                    };
                                  }
                                  return order;
                                });
                                // This will trigger a re-render with the updated data
                                queryClient.setQueryData(['orders', stage, filters, page, rowsPerPage, dateFilter, sortDirection], {
                                  ...data,
                                  orders: updatedOrders
                                });
                              }}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                        <Stack direction="row" spacing={1}>
                          <IconButton
                            size="small"
                            onClick={() => {
                              // Find the original order
                              const order = sortedOrders.find(o => o._id === item.orderId);
                              if (order) {
                                setSelectedOrder(order);
                              }
                            }}
                          >
                            <VisibilityIcon />
                          </IconButton>
                          
                          {stage === 'Pending' && (
                            <Button
                              size="small"
                              variant="outlined"
                              color="success"
                              sx={{ height: 32, minWidth: 80 }}
                              onClick={() => handleReceiveClick(item)}
                            >
                              Receive
                            </Button>
                          )}
                        </Stack>
                      </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            ))}
          </div>
        ) : (
          // Standard view for other stages
          <>
            <Table>
              <TableHead>
                <TableRow sx={{
                  backgroundColor: (theme) => theme.palette.mode === 'dark' ? theme.palette.action.hover : theme.palette.grey[100],
                  '& .MuiTableCell-root': {
                    color: (theme) => theme.palette.text.primary,
                    fontWeight: 600
                  }
                }}>
                  {stage === 'Initial' && (
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectAll}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                      />
                    </TableCell>
                  )}
                  <TableCell>Order Name</TableCell>
                  <TableCell>Items</TableCell>
                  <TableCell>Quantity</TableCell>
                  <TableCell>ORDER PRICE</TableCell>
                      <TableCell>Payment Status</TableCell>
                      <TableCell>Fulfillment Status</TableCell>
                      <TableCell>Shopify Order Date</TableCell>
                      <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedOrders.map((order) => (
                    <TableRow key={order._id}>
                      {stage === 'Initial' && <TableCell padding="checkbox"></TableCell>}
                      <TableCell>
                        <Typography variant="body1" fontWeight="medium" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {order.shopifyOrderName || order.orderName || `#${String(order._id).slice(-6)}`}
                          {order.isManual && (
                            <Chip label="M" size="small" color="primary" variant="outlined" />
                          )}
                        </Typography>
                        {order.customerName && (
                          <Typography variant="body2" color="textSecondary">
                            {order.customerName}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Stack spacing={1}>
                          {order.items.map((item, index) => (
                            <Box key={index}>
                              <Stack direction="row" spacing={1} alignItems="center">
                                {stage === 'Initial' && (
                                  <Checkbox
                                    onChange={(e) => handleItemSelect(order._id, item._id, e.target.checked)}
                                    checked={selectedItems.some(selected => selected.orderId === order._id && selected.itemId === item._id)}
                                  />
                                )}
                                <Box>
                                  <Typography variant="body2">
                                    {item.productName} {item.variantName ? `- ${item.variantName}` : ''} (SKU: {item.sku})
                                  </Typography>
                                  {Array.isArray(item.individualSkus) && item.individualSkus.length > 0 && (
                                    <Box mt={0.5}>
                                      <IndividualSkusBadge skus={item.individualSkus} />
                                    </Box>
                                  )}
                                <Box mt={1}>
                                  {/* Combined vendor search and selection */}
                                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                                      <Autocomplete
                                        size="small"
                                        options={vendorOptions}
                                        getOptionLabel={(option) => typeof option === 'string' ? option : (option?.name || '')}
                                        value={vendors?.find(v => v._id === (item.vendor?._id)) || null}
                                        onChange={(e, newValue) => {
                                          if (typeof newValue === 'string') {
                                            const val = newValue.trim();
                                            if (val) {
                                              updateVendorMutation.mutate({ orderId: order._id, itemId: item._id, vendorName: val });
                                            }
                                          } else if (newValue && newValue._id) {
                                            updateVendorMutation.mutate({ orderId: order._id, itemId: item._id, vendorId: newValue._id });
                                          } else if (newValue && newValue.name) {
                                            const val = String(newValue.name).trim();
                                            if (val) {
                                              updateVendorMutation.mutate({ orderId: order._id, itemId: item._id, vendorName: val });
                                            }
                                          }
                                        }}
                                        freeSolo
                                        clearOnBlur={false}
                                        selectOnFocus
                                        inputValue={vendorInputValues[item._id] || ''}
                                        onInputChange={(e, newInput) => {
                                          setVendorInputValues(prev => ({ ...prev, [item._id]: newInput || '' }));
                                        }}
                                        renderInput={(params) => (
                                          <TextField
                                            {...params}
                                            label="Search or select vendor"
                                            variant="outlined"
                                            placeholder={(item.autoDetectedVendor || suggestionCache[(item.sku||'').toUpperCase().trim()]) || "Assign or Type"}
                                            helperText={(item.autoDetectedVendor || suggestionCache[(item.sku||'').toUpperCase().trim()]) ? `Suggested: ${item.autoDetectedVendor || suggestionCache[(item.sku||'').toUpperCase().trim()]}` : ''}
                                            InputProps={{
                                              ...params.InputProps,
                                              endAdornment: (
                                                <>
                                                  {params.InputProps.endAdornment}
                                                  <InputAdornment position="end">
                                                    <Button 
                                                      variant="contained"
                                                      size="small"
                                                      color="secondary"
                                                      onClick={() => {
                                                        const val = vendorInputValues[item._id];
                                                        if (val && val.trim()) {
                                                          updateVendorMutation.mutate({ orderId: order._id, itemId: item._id, vendorSearch: val.trim() });
                                                        }
                                                      }}
                                                      sx={{ height: 30, ml: 1 }}
                                                    >
                                                      Assign
                                                    </Button>
                                                  </InputAdornment>
                                                </>
                                              )
                                            }}
                                          />
                                        )}
                                        sx={{ flex: 1 }}
                                      />
                                      {/* Accept Suggested Vendor Button */}
                                      {item.autoDetectedVendor && !item.vendor && (
                                        <Tooltip title={`Accept "${item.autoDetectedVendor}"`}>
                                          <IconButton
                                            size="small"
                                            color="success"
                                            onClick={() => handleAcceptVendor(
                                              order._id,
                                              item._id,
                                              item.autoDetectedVendor
                                            )}
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

                                </Box>
                              </Stack>
                            </Box>
                          ))}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Stack spacing={1}>
                          {order.items.map((item, index) => (
                            <Box key={index} sx={{ py: 1 }}>
                              <Typography variant="body2">
                                {item.quantity || 1}
                              </Typography>
                            </Box>
                          ))}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Stack spacing={1}>
                          {order.items.map((item, index) => (
                            <Box key={index} sx={{ py: 1 }}>
                              <SKUPrice 
                                sku={item.sku} 
                                fallbackPrice={typeof item.price === 'number' ? item.price : (item.costPrice || null)}
                              />
                            </Box>
                          ))}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={order.paymentStatus}
                          color={STATUS_COLORS[order.paymentStatus]}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={order.fulfillmentStatus}
                          color={STATUS_COLORS[order.fulfillmentStatus]}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {new Date(order.createdAt).toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1}>
                          <IconButton
                            size="small"
                            onClick={() => setSelectedOrder(order)}
                          >
                            <VisibilityIcon />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                ))}
              </TableBody>
            </Table>
            {!shouldShowAll && (
              <TablePagination
                rowsPerPageOptions={[5, 10, 25, 50]}
                component="div"
                count={data?.pagination?.total || 0}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                labelDisplayedRows={({from, to, count}) => `${from}-${to} of ${count !== -1 ? count : `more than ${to}`}`}
              />
            )}
          </>
        )}
      </TableContainer>

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

      <Dialog
        open={processedExportDialogOpen}
        onClose={() => {
          if (!processedExportLoading) {
            setProcessedExportDialogOpen(false);
          }
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" component="span">Export Processed Orders</Typography>
            <IconButton
              size="small"
              onClick={() => {
                if (!processedExportLoading) {
                  setProcessedExportDialogOpen(false);
                }
              }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 2 }}>
          <Alert severity="info" sx={{ mb: 1 }}>
            Processed orders older than {PROCESSED_RETENTION_DAYS} days are automatically removed. Select a date range within that window.
          </Alert>
          
          {/* Quick Date Selection Buttons */}
          <Box>
            <Typography variant="subtitle2" gutterBottom sx={{ mb: 1 }}>
              Quick Select:
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  const today = new Date();
                  const start = new Date(today);
                  start.setDate(start.getDate() - 7);
                  setExportStart(getDateString(start));
                  setExportEnd(getDateString(today));
                }}
              >
                Last 7 Days
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  const today = new Date();
                  const start = new Date(today);
                  start.setDate(start.getDate() - 30);
                  setExportStart(getDateString(start));
                  setExportEnd(getDateString(today));
                }}
              >
                Last 30 Days
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  const today = new Date();
                  const start = new Date(today);
                  start.setDate(start.getDate() - 90);
                  setExportStart(getDateString(start));
                  setExportEnd(getDateString(today));
                }}
              >
                Last 90 Days
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  const today = new Date();
                  setExportStart(getDateString(today));
                  setExportEnd(getDateString(today));
                }}
              >
                Today
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  const yesterday = new Date();
                  yesterday.setDate(yesterday.getDate() - 1);
                  setExportStart(getDateString(yesterday));
                  setExportEnd(getDateString(yesterday));
                }}
              >
                Yesterday
              </Button>
            </Stack>
          </Box>

          {/* Date Range Selection */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              fullWidth
              label="From Date"
              type="date"
              value={exportStart}
              onChange={(e) => setExportStart(e.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{
                max: getDateString(new Date()), // Can't select future dates
                min: getDateString(getProcessedRetentionCutoff()) // Can't select dates older than retention period
              }}
              helperText="Start date of the export range"
            />
            <TextField
              fullWidth
              label="To Date"
              type="date"
              value={exportEnd}
              onChange={(e) => setExportEnd(e.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{
                max: getDateString(new Date()), // Can't select future dates
                min: exportStart || getDateString(getProcessedRetentionCutoff()) // Can't select dates before start date
              }}
              helperText="End date of the export range"
            />
          </Stack>

          {/* Date Range Summary */}
          {exportStart && exportEnd && (
            <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">
                <strong>Export Range:</strong> {new Date(exportStart).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })} to {new Date(exportEnd).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </Typography>
            </Box>
          )}

          {processedExportError && (
            <Alert severity="error">{processedExportError}</Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 1 }}>
          <Button 
            onClick={() => {
              setProcessedExportDialogOpen(false);
              setProcessedExportError('');
            }} 
            disabled={!!processedExportLoading}
          >
            Cancel
          </Button>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<GetAppIcon />}
            onClick={() => handleProcessedExport('csv')}
            disabled={processedExportLoading && processedExportLoading !== 'csv' || !exportStart || !exportEnd}
          >
            {processedExportLoading === 'csv' ? 'Downloading…' : 'Download CSV'}
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<GetAppIcon />}
            onClick={() => handleProcessedExport('excel')}
            disabled={processedExportLoading && processedExportLoading !== 'excel' || !exportStart || !exportEnd}
          >
            {processedExportLoading === 'excel' ? 'Downloading…' : 'Download Excel'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Message Dialog - replaces alert() */}
      <Dialog open={messageDialog.open} onClose={() => setMessageDialog({ ...messageDialog, open: false })} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">{messageDialog.title}</Typography>
          <IconButton size="small" onClick={() => setMessageDialog({ ...messageDialog, open: false })}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography>{messageDialog.message}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMessageDialog({ ...messageDialog, open: false })} variant="contained">OK</Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation Dialog - replaces confirm() */}
      <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog({ ...confirmDialog, open: false })} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">{confirmDialog.title}</Typography>
          <IconButton size="small" onClick={() => setConfirmDialog({ ...confirmDialog, open: false })}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography>{confirmDialog.message}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog({ ...confirmDialog, open: false })}>Cancel</Button>
          <Button 
            onClick={async () => {
              if (confirmDialog.onConfirm) {
                await confirmDialog.onConfirm();
              }
              setConfirmDialog({ ...confirmDialog, open: false });
            }} 
            variant="contained"
            color="primary"
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Download Choice Dialog - for ZIP vs Separate files */}
      <Dialog open={downloadChoiceDialog.open} onClose={() => setDownloadChoiceDialog({ ...downloadChoiceDialog, open: false })} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Download Options</Typography>
          <IconButton size="small" onClick={() => setDownloadChoiceDialog({ ...downloadChoiceDialog, open: false })}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Download {downloadChoiceDialog.count} vendor PDF(s)?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Choose how you want to download the files:
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={async () => {
              if (downloadChoiceDialog.onSeparate) {
                await downloadChoiceDialog.onSeparate();
              }
              setDownloadChoiceDialog({ ...downloadChoiceDialog, open: false });
            }}
            variant="outlined"
          >
            Separate Files
          </Button>
          <Button 
            onClick={async () => {
              if (downloadChoiceDialog.onZip) {
                await downloadChoiceDialog.onZip();
              }
              setDownloadChoiceDialog({ ...downloadChoiceDialog, open: false });
            }}
            variant="contained"
            color="primary"
          >
            ZIP File
          </Button>
        </DialogActions>
      </Dialog>

      {/* Processed Email Settings Dialog */}
      <Dialog open={emailSettingsDialogOpen} onClose={() => setEmailSettingsDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Processed Email Settings</Typography>
          <IconButton size="small" onClick={() => setEmailSettingsDialogOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {emailSettingsLoading ? (
            <CircularProgress size={24} />
          ) : (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <FormControl fullWidth>
                <InputLabel id="pe-enabled-label">Enabled</InputLabel>
                <Select
                  labelId="pe-enabled-label"
                  value={processedEmailEnabled ? 'true' : 'false'}
                  label="Enabled"
                  onChange={(e) => setProcessedEmailEnabled(e.target.value === 'true')}
                >
                  <MenuItem value="true">True</MenuItem>
                  <MenuItem value="false">False</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="pe-trigger-label">Trigger Method</InputLabel>
                <Select
                  labelId="pe-trigger-label"
                  value={processedEmailTriggerMethod}
                  label="Trigger Method"
                  onChange={(e) => setProcessedEmailTriggerMethod(e.target.value)}
                >
                  <MenuItem value="automatic">Automatic</MenuItem>
                  <MenuItem value="manual">Manual</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Schedule Time (IST)"
                type="time"
                value={processedEmailSchedule}
                onChange={(e) => setProcessedEmailSchedule(e.target.value)}
                InputLabelProps={{ shrink: true }}
                helperText={processedEmailTriggerMethod === 'automatic' ? 'Auto-send email at this time daily' : 'Email will only be sent manually'}
                disabled={processedEmailTriggerMethod === 'manual'}
              />
              <TextField
                label="Recipients (comma separated)"
                placeholder="user1@example.com, user2@example.com"
                value={processedEmailRecipients.join(', ')}
                onChange={(e) => setProcessedEmailRecipients(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                multiline
                rows={2}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailSettingsDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveEmailSettings} disabled={emailSettingsLoading}>Save</Button>
        </DialogActions>
      </Dialog>

      {showManualOrder && (
        <ManualOrderForm
          open={showManualOrder}
          onClose={() => setShowManualOrder(false)}
        />
      )}
      
      <Dialog open={changeStageDialogOpen} onClose={() => setChangeStageDialogOpen(false)}>
        <DialogTitle>Change Stage for Selected Items</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2, minWidth: 200 }}>
            <InputLabel>Target Stage</InputLabel>
            <Select
              value={targetStage}
              onChange={(e) => setTargetStage(e.target.value)}
              label="Target Stage"
            >
              <MenuItem value="Hold">Hold</MenuItem>
              <MenuItem value="In-Stock">In-Stock</MenuItem>
              <MenuItem value="Fulfilled">Fulfilled</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setChangeStageDialogOpen(false)}
            sx={{ height: 40, minWidth: 80 }}
          >
            Cancel
          </Button>
          <Button 
            variant="contained" 
            color="primary" 
            sx={{ height: 40, minWidth: 120 }}
            onClick={async () => {
              if (isStageChangeInProgress) {
                return;
              }
              setIsStageChangeInProgress(true);
              try {
                if (selectedItems.length === 0) {
                  setMessageDialog({ open: true, message: 'No items selected. Please select at least one item.', title: 'Warning' });
                  setIsStageChangeInProgress(false);
                  return;
                }
                
                // Use the moveItemsToStage API for moving individual items
                const apiBaseUrl = getApiUrl();
                const response = await axios.post(`${apiBaseUrl}/orders/move-items-to-stage`, {
                  items: selectedItems,
                  targetStage: targetStage
                });

                const result = response.data;
                
                if (result.errors && result.errors.length > 0) {
                  setMessageDialog({ open: true, message: `Moved ${result.movedCount} items to ${targetStage}. Errors: ${result.errors.length}`, title: 'Partial Success' });
                } else {
                  setMessageDialog({ open: true, message: `Successfully moved ${result.movedCount} items to ${targetStage}`, title: 'Success' });
                }

                setSelectedItems([]);
                setChangeStageDialogOpen(false);
                queryClient.invalidateQueries(['orders']);
              } catch (error) {
                console.error('Error moving items:', error);
                setMessageDialog({ open: true, message: 'Error moving items: ' + error.message, title: 'Error' });
              } finally {
                setIsStageChangeInProgress(false);
              }
            }}
            disabled={isStageChangeInProgress}
          >
            Move to {targetStage}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Receive Dialog */}
      <Dialog open={receiveDialogOpen} onClose={() => setReceiveDialogOpen(false)}>
        <DialogTitle>Receive Item</DialogTitle>
        <DialogContent>
          {currentItem && (
            <Box sx={{ pt: 2, minWidth: 300 }}>
              <Typography variant="body1" sx={{ mb: 2 }}>
                <strong>{currentItem.productName}</strong> (SKU: {currentItem.sku})
              </Typography>
              
              <Typography variant="body2" sx={{ mb: 2 }}>
                Order: {currentItem.orderName}
              </Typography>
              
              <Typography variant="body2" sx={{ mb: 2 }}>
                Expected Quantity: {currentItem.quantity || 1}
              </Typography>
              
              <TextField
                fullWidth
                label="Received Quantity"
                type="number"
                value={receivedQty}
                onChange={(e) => setReceivedQty(parseInt(e.target.value) || 0)}
                InputProps={{
                  inputProps: { min: 0, max: currentItem.quantity || 1 }
                }}
                sx={{ mt: 2 }}
              />
              
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                {receivedQty === (currentItem.quantity || 1) ? 
                  "This item will be moved to Completed stage." :
                  receivedQty === 0 ?
                  "No items will be received." :
                  "This will partially fulfill the item."}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setReceiveDialogOpen(false)}
            sx={{ height: 40, minWidth: 80 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            sx={{ height: 40, minWidth: 100 }}
            onClick={handleCompleteItem}
            disabled={!currentItem || receivedQty <= 0}
          >
            {receivedQty === (currentItem?.quantity || 1) ? "Complete" : "Receive"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Exports History Dialog */}
      <Dialog open={exportsDialogOpen} onClose={() => setExportsDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Consolidated Exports History</DialogTitle>
        <DialogContent>
          {exportsList.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No exports found</Typography>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Created</TableCell>
                  <TableCell>Filename</TableCell>
                  <TableCell>Stage</TableCell>
                  <TableCell>Filters</TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {exportsList.map((rec) => (
                  <TableRow key={rec._id}>
                    <TableCell>{new Date(rec.createdAt).toLocaleString()}</TableCell>
                    <TableCell>{rec.filename}</TableCell>
                    <TableCell>{rec.stage}</TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {rec.filters?.startDate} → {rec.filters?.endDate}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Button size="small" variant="contained" onClick={async () => {
                        try {
                          const apiBaseUrl = getApiUrl();
                          const response = await axios.get(`${apiBaseUrl}/orders/exports/${rec._id}/download`, { responseType: 'blob' });
                          const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = rec.filename || 'export.csv';
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                          window.URL.revokeObjectURL(url);
                        } catch (err) {
                          setMessageDialog({ open: true, message: 'Failed to download export', title: 'Error' });
                        }
                      }}>Download</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Send Excel Dialog */}
      <Dialog open={sendExcelDialogOpen} onClose={() => setSendExcelDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Send Processed Orders Excel via Email</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Send Excel export of processed orders via email. Leave email empty to use configured recipients from Settings.
            </Typography>
            
            {/* Date Selection */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Select Date Range for Report
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  fullWidth
                  label="Start Date"
                  type="date"
                  value={sendExcelStartDate || dateRange.startDate || ''}
                  onChange={(e) => setSendExcelStartDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  fullWidth
                  label="Start Time"
                  type="time"
                  value={sendExcelStartTime || dateRange.startTime || ''}
                  onChange={(e) => setSendExcelStartTime(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  fullWidth
                  label="End Date"
                  type="date"
                  value={sendExcelEndDate || dateRange.endDate || ''}
                  onChange={(e) => setSendExcelEndDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  fullWidth
                  label="End Time"
                  type="time"
                  value={sendExcelEndTime || dateRange.endTime || ''}
                  onChange={(e) => setSendExcelEndTime(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Stack>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setSendExcelStartDate('');
                  setSendExcelEndDate('');
                  setSendExcelStartTime('');
                  setSendExcelEndTime('');
                }}
                sx={{ mt: 1 }}
              >
                Clear Date Selection
              </Button>
            </Box>
            
            <TextField
              fullWidth
              label="Email Address (Optional)"
              type="email"
              value={sendExcelEmail}
              onChange={(e) => setSendExcelEmail(e.target.value)}
              placeholder="Leave empty to use configured recipients"
              helperText="If empty, will use recipients configured in Settings"
            />
            {sendExcelLoading && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={20} />
                <Typography variant="body2">Sending email...</Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              setSendExcelDialogOpen(false);
              setSendExcelEmail('');
              setSendExcelStartDate('');
              setSendExcelEndDate('');
              setSendExcelStartTime('');
              setSendExcelEndTime('');
            }}
            disabled={sendExcelLoading}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<SendIcon />}
            onClick={async () => {
              setSendExcelLoading(true);
              try {
                const apiBaseUrl = getApiUrl();
                
                // Build request body with date filters - use dialog dates if set, otherwise use page filters
                const requestBody = {
                  email: sendExcelEmail.trim() || undefined
                };
                
                // Use dialog date selection if set, otherwise fall back to page filters
                const startDate = sendExcelStartDate || dateRange.startDate;
                const endDate = sendExcelEndDate || dateRange.endDate;
                const startTime = sendExcelStartTime || dateRange.startTime;
                const endTime = sendExcelEndTime || dateRange.endTime;
                
                if (startDate || endDate) {
                  requestBody.startDate = startDate || endDate;
                  requestBody.endDate = endDate || startDate;
                  if (startTime) requestBody.startTime = startTime;
                  if (endTime) requestBody.endTime = endTime;
                } else if (dateFilter) {
                  const filterDateObj = new Date(dateFilter);
                  const formattedDate = filterDateObj.toISOString().split('T')[0];
                  requestBody.startDate = formattedDate;
                  requestBody.endDate = formattedDate;
                }
                
                const response = await axios.post(`${apiBaseUrl}/orders/processed/send-excel`, requestBody);
                
                if (response.data.success) {
                  setMessageDialog({
                    open: true,
                    message: `Excel export sent successfully to ${response.data.recipients?.join(', ') || 'configured recipients'}. Total orders: ${response.data.orderCount}`,
                    title: 'Success'
                  });
                  setSendExcelDialogOpen(false);
                  setSendExcelEmail('');
                  setSendExcelStartDate('');
                  setSendExcelEndDate('');
                  setSendExcelStartTime('');
                  setSendExcelEndTime('');
                } else {
                  setMessageDialog({
                    open: true,
                    message: response.data.message || 'Failed to send Excel export',
                    title: 'Error'
                  });
                }
              } catch (error) {
                console.error('[SendExcel] Error:', error);
                setMessageDialog({
                  open: true,
                  message: `Error sending Excel export: ${error.response?.data?.message || error.message}`,
                  title: 'Error'
                });
              } finally {
                setSendExcelLoading(false);
              }
            }}
            disabled={sendExcelLoading}
          >
            {sendExcelLoading ? 'Sending...' : 'Send Email'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default StageOrdersView;
