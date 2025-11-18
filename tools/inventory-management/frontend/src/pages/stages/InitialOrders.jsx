import { useState, Fragment, useEffect } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
  Collapse,
  Alert,
  Tooltip,
  CircularProgress,
  Snackbar,
} from '@mui/material';
import {
  Send as SendIcon,
  SwapVert as SwapVertIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Close as CloseIcon,
  AutoFixHigh as AutoFixHighIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Upload as UploadIcon,
  Download as DownloadIcon,
  CheckCircle as CheckCircleIcon,
  History as HistoryIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { API_BASE_URL, STATUS_COLORS } from '../../config';
import ManualOrderForm from '../../components/ManualOrderForm';
import BulkOrderImport from '../../components/BulkOrderImport';
import BulkOrderExport from '../../components/BulkOrderExport';
import OrderEditor from '../../components/OrderEditor';
import SKULink from '../../components/SKULink';
import SKUPriceLink from '../../components/SKUPriceLink';
import SKUPrice from '../../components/SKUPrice';

// Pack/Combo SKU Expansion Component
function PackComboSkuExpansion({ sku, prefetchedSkus = [] }) {
  const [individualSkus, setIndividualSkus] = useState(Array.isArray(prefetchedSkus) ? prefetchedSkus : []);
  const [loading, setLoading] = useState(false);
  const prefetchedSignature = Array.isArray(prefetchedSkus) ? prefetchedSkus.join('|') : '';

  useEffect(() => {
    if (!sku || (!sku.startsWith('P') && !sku.startsWith('C'))) {
      setIndividualSkus([]);
      return;
    }

    if (Array.isArray(prefetchedSkus) && prefetchedSkus.length > 0) {
      setIndividualSkus(prefetchedSkus);
      setLoading(false);
      return;
    }

    setLoading(true);
    axios.get(`${API_BASE_URL}/inventory/individual-skus`, { params: { sku } })
      .then(response => {
        if (response.data.success && response.data.individualSkus) {
          setIndividualSkus(response.data.individualSkus);
        } else {
          setIndividualSkus([]);
        }
      })
      .catch(error => {
        console.error('Error fetching individual SKUs:', error);
        setIndividualSkus([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [sku, prefetchedSignature]);

  if (!sku || (!sku.startsWith('P') && !sku.startsWith('C'))) {
    return null;
  }

  if (loading) {
    return (
      <Chip 
        label="Loading..."
        size="small"
        variant="outlined"
        sx={{ height: '20px', fontSize: '0.7rem', mt: 0.5 }}
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
        sx={{ height: '20px', fontSize: '0.7rem', cursor: 'help', mt: 0.5 }}
      />
    </Tooltip>
  );
}

function InitialOrders() {
  const getDefaultStartDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };
  const getTodayDate = () => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  };

  // Load filters from localStorage or use defaults
  const getInitialFilters = () => {
    const savedFilters = localStorage.getItem('initialOrdersFilters');
    if (savedFilters) {
      try {
        const parsed = JSON.parse(savedFilters);
        return {
          search: parsed.search || '',
          vendorId: parsed.vendorId || '',
          vendorFilter: parsed.vendorFilter || '',
          sortBy: parsed.sortBy || 'createdAt',
          sortOrder: parsed.sortOrder || 'desc',
          startDate: parsed.startDate || getDefaultStartDate(),
          endDate: (parsed.endDate || parsed.startDate || getDefaultStartDate()),
          startTime: parsed.startTime || '',
          endTime: parsed.endTime || '',
          hideProcessed: parsed.hideProcessed !== undefined ? parsed.hideProcessed : true,
          showOnlyUnsatisfiable: parsed.showOnlyUnsatisfiable || false,
          locationFilter: parsed.locationFilter || 'all',
          orderSourceFilter: parsed.orderSourceFilter || 'all',
          stageFilter: parsed.stageFilter || 'all',
        };
      } catch (error) {
        console.error('Error parsing saved filters:', error);
      }
    }
    return {
      search: '',
      vendorId: '',
      vendorFilter: '',
      sortBy: 'createdAt',
      sortOrder: 'desc',
      startDate: getDefaultStartDate(),
      endDate: getTodayDate(),
      startTime: '',
      endTime: '',
      hideProcessed: true,
      showOnlyUnsatisfiable: false,
      locationFilter: 'all',
      orderSourceFilter: 'all',
      stageFilter: 'all',
    };
  };

  const [filters, setFilters] = useState(getInitialFilters);
  const [selectedItems, setSelectedItems] = useState([]);
  const [changeStageDialogOpen, setChangeStageDialogOpen] = useState(false);
  const [targetStage, setTargetStage] = useState('Hold');
  const [expandedRows, setExpandedRows] = useState({});
  const [vendorSearch, setVendorSearch] = useState('');
  const [showManualOrder, setShowManualOrder] = useState(false);
  const [editingCell, setEditingCell] = useState(null); // { sku, field, location }
  const [editValue, setEditValue] = useState('');
  const [createVendorDialogOpen, setCreateVendorDialogOpen] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorEmail, setNewVendorEmail] = useState('');
  const [newVendorPhone, setNewVendorPhone] = useState('');
  const [showPricing, setShowPricing] = useState(false); // Toggle for pricing columns
  const [showInventory, setShowInventory] = useState(true); // Toggle for inventory columns
  const [hideSafetyStock, setHideSafetyStock] = useState(false); // Toggle to hide safety stock columns
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [emailScheduleDialogOpen, setEmailScheduleDialogOpen] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailHour, setEmailHour] = useState('04');
  const [emailMinute, setEmailMinute] = useState('00');
  const [emailAmPm, setEmailAmPm] = useState('AM');
  const [sizeSource, setSizeSource] = useState(localStorage.getItem('sizeSource') || 'shopify'); // 'shopify' or 'sheet'
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedOrderHistory, setSelectedOrderHistory] = useState(null);
  const [processedHistory, setProcessedHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [orderEditorOpen, setOrderEditorOpen] = useState(false);
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState(null);
  const [suggestionCache, setSuggestionCache] = useState({});
  
  // State for individual SKUs for pack/combo SKUs - MUST be with all other useState hooks
  const [groupedOrders, setGroupedOrders] = useState([]);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' });
  const [messageDialog, setMessageDialog] = useState({ open: false, title: 'Message', message: '' });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: 'Confirm', message: '', onConfirm: null });
  const [refreshingFulfillment, setRefreshingFulfillment] = useState(false);
  const [lastFulfillmentSignature, setLastFulfillmentSignature] = useState('');

  const queryClient = useQueryClient();

  // Fix axios baseURL duplication issue - prevent /_proxy/ prefix from being duplicated
  useEffect(() => {
    // Clear baseURL if it starts with /_proxy/ to prevent path duplication
    const base = axios.defaults.baseURL;
    if (base && base.startsWith('/_proxy/')) {
      axios.defaults.baseURL = '';
    }

    // Axios request interceptor to prevent baseURL duplication
    const requestInterceptor = axios.interceptors.request.use(
      (config) => {
        // If the URL already contains the full path (starts with /_proxy/ or /api/), 
        // clear the baseURL to prevent concatenation
        if (config.url && (config.url.startsWith('/_proxy/') || config.url.startsWith('/api/'))) {
          config.baseURL = undefined;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    return () => {
      axios.interceptors.request.eject(requestInterceptor);
    };
  }, []);

  // Save filters to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('initialOrdersFilters', JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/settings/email`);
        const cfg = res.data?.processedOrdersExport || {};
        if (typeof cfg.enabled === 'boolean') setEmailEnabled(cfg.enabled);
        const time = cfg.scheduleTime || '04:00';
        const [h, m] = String(time).split(':');
        let hh = h;
        let ampm = 'AM';
        const hi = parseInt(hh, 10);
        if (hi === 0) { hh = '12'; ampm = 'AM'; }
        else if (hi === 12) { hh = '12'; ampm = 'PM'; }
        else if (hi > 12) { hh = String(hi - 12).padStart(2, '0'); ampm = 'PM'; }
        else { hh = String(hi).padStart(2, '0'); ampm = 'AM'; }
        setEmailHour(hh.padStart(2, '0'));
        setEmailMinute(String(m || '00').padStart(2, '0'));
        setEmailAmPm(ampm);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['sheet-vendor-suggestions'] });
  }, [queryClient, filters.startDate, filters.endDate]);

  // Fetch orders with all new data
  const { data, isLoading, error } = useQuery({
    queryKey: ['orders', 'Initial', filters],
    queryFn: async () => {
      const params = {
        // Apply stage filter: if 'all', still default to 'Initial' for this page, otherwise use the selected stage
        stage: filters.stageFilter && filters.stageFilter !== 'all' ? filters.stageFilter : 'Initial',
        ...filters
      };
      
      // Remove stageFilter from params as it's not a backend filter
      delete params.stageFilter;
      const response = await axios.get(`${API_BASE_URL}/orders`, { params });
      return response.data;
    },
    placeholderData: (previousData) => previousData,
    staleTime: 10000
  });

  // Fetch vendors (DB) for filters and legacy flows
  const { data: vendors } = useQuery({
    queryKey: ['vendors', vendorSearch],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE_URL}/vendors`, {
        params: { search: vendorSearch }
      });
      return response.data;
    }
  });

  // Fetch vendor suggestions from Google Sheets
  const { data: sheetVendors = [] } = useQuery({
    queryKey: ['sheet-vendor-suggestions'],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE_URL}/settings/vendor-suggestions`);
      return Array.isArray(response.data?.vendors) ? response.data.vendors : [];
    }
  });

  // Merge DB vendors and sheet suggestions into a single options list for Autocomplete
  const vendorOptions = (function mergeVendors(dbVendors = [], sheetList = []) {
    const db = Array.isArray(dbVendors) ? dbVendors.map(v => ({ _id: v._id, name: v.name })) : [];
    const sheets = Array.isArray(sheetList) ? sheetList.map(n => ({ name: n })) : [];
    const map = new Map();
    db.forEach(v => {
      const n = typeof v.name === 'string' ? v.name : '';
      if (!n) return;
      map.set(n.toLowerCase(), v);
    });
    sheets.forEach(s => {
      const n = typeof s.name === 'string' ? s.name : '';
      if (!n) return;
      const key = n.toLowerCase();
      if (!map.has(key)) map.set(key, s);
    });
    const arr = Array.from(map.values());
    return arr.sort((a,b)=>{
      const an = (a?.name || a?.label || '').toString();
      const bn = (b?.name || b?.label || '').toString();
      return an.localeCompare(bn);
    });
  })(vendors, sheetVendors);

  const isGrouped = data?.isGrouped || false;
  const allOrders = Array.isArray(data?.orders) ? data.orders : [];
  const safeGroupedOrders = Array.isArray(groupedOrders) && groupedOrders.length > 0
    ? groupedOrders
    : (Array.isArray(allOrders) ? allOrders : []);
  const unsatisfiableCount = safeGroupedOrders.filter(group => !group?.canSatisfy).length;
  const satisfiableCount = safeGroupedOrders.filter(group => group?.canSatisfy).length;
  const okhlaOnlyCount = safeGroupedOrders.filter(group => group?.satisfyLocation === 'Okhla').length;
  const bahadurgarhOnlyCount = safeGroupedOrders.filter(group => group?.satisfyLocation === 'Bahadurgarh').length;
  const bothCount = safeGroupedOrders.filter(group => group?.satisfyLocation === 'Both').length;
  const manualCount = safeGroupedOrders.filter(group => 
    group?.orders && Array.isArray(group.orders) && group.orders.some(o => o.isManual === true)
  ).length;
  const shopifyCount = safeGroupedOrders.filter(group => 
    group?.orders && Array.isArray(group.orders) && group.orders.some(o => !o.isManual)
  ).length;

  useEffect(() => {
    const fetchMissingSuggestions = async () => {
      try {
        const tasks = [];
        (safeGroupedOrders || []).forEach(group => {
          (group.orders || []).forEach(order => {
            const sku = order?.sku || group?.sku;
            if (!sku) return;
            const norm = String(sku).toUpperCase().trim();
            const hasSuggestion = order?.autoDetectedVendor || (Array.isArray(order?.vendorSuggestions) && order.vendorSuggestions.length > 0) || suggestionCache[norm];
            if (!order?.vendor && !hasSuggestion) {
              tasks.push(norm);
            }
          });
        });
        const unique = Array.from(new Set(tasks));
        for (const norm of unique) {
          try {
            const res = await axios.get(`${API_BASE_URL}/vendors/suggest/${norm}`);
            const v = res.data?.vendor;
            if (v && v.trim()) {
              setSuggestionCache(prev => ({ ...prev, [norm]: v.trim() }));
            }
          } catch {}
        }
      } catch (e) {
        console.error('Suggestion prefetch error:', e);
      }
    };
    if (Array.isArray(safeGroupedOrders) && safeGroupedOrders.length > 0) {
      fetchMissingSuggestions();
    }
  }, [safeGroupedOrders]);

  const buildVendorOptionList = (suggestions = []) => {
    // Start with all available vendors from DB and sheets
    const arr = Array.isArray(vendorOptions) ? [...vendorOptions] : [];
    
    // Add suggestions that aren't already in the list
    if (Array.isArray(suggestions)) {
      for (const name of suggestions) {
        const n = typeof name === 'string' ? name.trim() : '';
        if (!n) continue;
        
        // Check if this vendor name is already in the list
        const exists = arr.some(v => {
          const vName = v?.name || '';
          return vName.toLowerCase() === n.toLowerCase();
        });
        
        if (!exists) {
          arr.push({ name: n });
        }
      }
    }
    
    return arr;
  };

  const showNotification = (message, severity = 'info') => {
    if (!message) return;
    setNotification({ open: true, message, severity });
  };

  const handleNotificationClose = (_, reason) => {
    if (reason === 'clickaway') return;
    setNotification(prev => ({ ...prev, open: false }));
  };

  const getCurrentOrderIds = () => {
    const ids = new Set();
    safeGroupedOrders.forEach((group) => {
      (group?.orders || []).forEach((order) => {
        if (order?.orderId) {
          ids.add(order.orderId);
        }
      });
    });
    return Array.from(ids);
  };

  const refreshFulfillmentStatuses = async ({ silent = false, orderIdsOverride } = {}) => {
    const orderIds = Array.isArray(orderIdsOverride) ? orderIdsOverride : getCurrentOrderIds();
    if (!orderIds.length) {
      if (!silent) {
        showNotification('No Shopify-linked orders to refresh', 'info');
      }
      return;
    }

    setRefreshingFulfillment(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/orders/refresh-fulfillment`, { orderIds });
      const updatedCount = response.data?.updated ?? 0;
      if (!silent) {
        showNotification(
          `Refreshed ${updatedCount} of ${orderIds.length} orders`,
          updatedCount > 0 ? 'success' : 'info'
        );
      }
      setLastFulfillmentSignature(orderIds.slice().sort().join('|'));
      queryClient.invalidateQueries(['orders']);
      queryClient.invalidateQueries(['orders', 'Initial']);
    } catch (error) {
      const message = error.response?.data?.message || error.message;
      if (!silent) {
        setMessageDialog({
          open: true,
          title: 'Error',
          message: `Failed to refresh fulfillment status: ${message}`
        });
      }
    } finally {
      setRefreshingFulfillment(false);
    }
  };

  const syncVendorCaches = (vendor) => {
    if (!vendor) return;
    const nameSource = typeof vendor.name === 'string' ? vendor.name : (typeof vendor.label === 'string' ? vendor.label : '');
    if (!nameSource) return;
    const normalizedName = nameSource.toLowerCase();
    const queryCache = queryClient.getQueryCache();
    if (!queryCache) return;
    const vendorQueries = queryCache.findAll(['vendors'], { exact: false });
    vendorQueries.forEach((query) => {
      const data = query?.state?.data;
      if (!Array.isArray(data)) return;
      const exists = data.some((entry) => {
        if (!entry) return false;
        if (entry._id && vendor._id) {
          return String(entry._id) === String(vendor._id);
        }
        const entryName = typeof entry.name === 'string' ? entry.name : (typeof entry.label === 'string' ? entry.label : '');
        return entryName.toLowerCase() === normalizedName;
      });
      if (exists) {
        const updated = data.map((entry) => {
          if (!entry) return entry;
          const entryName = typeof entry.name === 'string' ? entry.name : (typeof entry.label === 'string' ? entry.label : '');
          const matches = (entry._id && vendor._id && String(entry._id) === String(vendor._id)) || (entryName.toLowerCase() === normalizedName);
          return matches ? { ...entry, ...vendor } : entry;
        });
        queryClient.setQueryData(query.queryKey, updated);
      } else {
        queryClient.setQueryData(query.queryKey, [...data, vendor]);
      }
    });
  };

  const cloneDeep = (value) => {
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(value);
      } catch (err) {
        // fallback below
      }
    }
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
  };

  const normalizeVendorObject = (vendor) => {
    if (!vendor) return null;
    const name = vendor.name || vendor.label || '';
    const id = vendor._id || vendor.id || vendor.tempId || null;
    return name ? { _id: id, name } : null;
  };

  const applyVendorToOrdersData = (data, variables, vendor) => {
    if (!data) return data;
    const cloned = cloneDeep(data);
    const vendorPayload = normalizeVendorObject(vendor);

    const matchesTarget = (item) => {
      if (!item) return false;
      const orderMatch = String(item.orderId || item.order?.orderId || item.order) === String(variables.orderId);
      const itemKey = item.itemId || item._id || item.id;
      const itemMatch = itemKey !== undefined && String(itemKey) === String(variables.itemId);
      return orderMatch && itemMatch;
    };

    const patchItem = (item) => {
      if (!item) return item;
      if (matchesTarget(item)) {
        return {
          ...item,
          vendor: vendorPayload,
          vendorName: vendorPayload?.name || item.vendorName,
          vendorId: vendorPayload?._id || item.vendorId
        };
      }
      return item;
    };

    const patchCollection = (collection) => {
      if (!Array.isArray(collection)) return collection;
      return collection.map(patchItem);
    };

    if (Array.isArray(cloned.orders)) {
      cloned.orders = cloned.orders.map((group) => {
        if (!group) return group;
        const patched = { ...group };
        if (Array.isArray(group.orders)) {
          patched.orders = patchCollection(group.orders);
          if (vendorPayload && patched.orders.some(matchesTarget)) {
            patched.vendor = vendorPayload;
          }
        }
        if (Array.isArray(group.items)) {
          patched.items = patchCollection(group.items);
          if (vendorPayload && patched.items.some(matchesTarget)) {
            patched.vendor = vendorPayload;
          }
        }
        return patched;
      });
    }

    if (Array.isArray(cloned.items)) {
      cloned.items = patchCollection(cloned.items);
    }

    if (Array.isArray(cloned.vendorGroups)) {
      cloned.vendorGroups = cloned.vendorGroups.map((group) => {
        if (!group) return group;
        const patched = { ...group };
        if (Array.isArray(group.items)) {
          patched.items = patchCollection(group.items);
        }
        if (Array.isArray(group.orders)) {
          patched.orders = patchCollection(group.orders);
        }
        if (vendorPayload && ((patched.items && patched.items.some(matchesTarget)) || (patched.orders && patched.orders.some(matchesTarget)))) {
          patched.vendor = vendorPayload;
        }
        return patched;
      });
    }

    return cloned;
  };
  
  // Auto assign vendors mutation
  const autoAssignMutation = useMutation({
    mutationFn: async () => {
      const response = await axios.post(`${API_BASE_URL}/orders/auto-assign-vendors`);
      return response.data;
    },
    onSuccess: (data) => {
      setMessageDialog({ open: true, title: 'Vendors Auto-Assigned', message: `Auto-assigned vendors to ${data.assigned} items. Skipped ${data.skipped} items.` });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error) => {
      setMessageDialog({ open: true, title: 'Error', message: 'Failed to auto-assign vendors: ' + error.message });
    }
  });

  // Accept all suggestions mutation
  const acceptAllSuggestionsMutation = useMutation({
    mutationFn: async () => {
      const response = await axios.post(`${API_BASE_URL}/orders/accept-all-suggestions`);
      return response.data;
    },
    onSuccess: (data) => {
      const message = `Accepted ${data.accepted} vendor suggestions. Skipped ${data.skipped} items.`;
      const created = data.createdVendors ? `\nCreated new vendors: ${data.createdVendors.join(', ')}` : '';
      setMessageDialog({ open: true, title: 'Suggestions Accepted', message: message + created });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
    },
    onError: (error) => {
      const errorMessage = error.response?.data?.message || error.message;
      setMessageDialog({ open: true, title: 'Error', message: 'Failed to accept suggestions: ' + errorMessage });
    }
  });

  const bulkMapMutation = useMutation({
    mutationFn: async () => {
      // Extract SKUs from currently visible orders
      const visibleSkus = [];
      if (data && data.orders && Array.isArray(data.orders)) {
        data.orders.forEach(group => {
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
      const response = await axios.post(`${API_BASE_URL}/orders/bulk-map-vendors`, {
        skus: visibleSkus
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const updateVendorMutation = useMutation({
    mutationFn: async ({ orderId, itemId, vendorId, vendorName }) => {
      const response = await axios.put(
        `${API_BASE_URL}/orders/${orderId}/items/${itemId}/vendor`,
        { vendorId, vendorName },
        { timeout: 10000 }
      );
      return response.data;
    },
    onMutate: async (variables) => {
        await queryClient.cancelQueries({ queryKey: ['orders'] });

        const optimisticVendor = (() => {
          if (variables.vendorId) {
            const match = vendorOptions.find(v => v._id && String(v._id) === String(variables.vendorId));
            if (match) return match;
            return { _id: variables.vendorId, name: variables.vendorName || '' };
          }
          if (variables.vendorName) {
            return { _id: `temp-${Date.now()}`, name: variables.vendorName };
          }
          return null;
        })();

        const ordersSnapshots = queryClient.getQueriesData({ queryKey: ['orders'] }).map(([key, data]) => ({ key, data }));
        ordersSnapshots.forEach(({ key, data }) => {
          if (!data) return;
          const updated = applyVendorToOrdersData(data, variables, optimisticVendor);
          queryClient.setQueryData(key, updated);
        });

        const vendorsKey = ['vendors', vendorSearch];
        const previousVendors = queryClient.getQueryData(vendorsKey);
        if (optimisticVendor?.name) {
          queryClient.setQueryData(vendorsKey, (old) => {
            if (!Array.isArray(old)) return old;
            const exists = old.some(v => (v.name || '').toLowerCase() === (typeof optimisticVendor.name === 'string' ? optimisticVendor.name.toLowerCase() : ''));
            if (exists) return old;
            return [...old, optimisticVendor];
          });
        }

        return { ordersSnapshots, vendorsKey, previousVendors, optimisticVendor };
      },
      onError: (error, variables, context) => {
        console.error('Error in vendor update mutation:', error);
        if (context?.ordersSnapshots) {
          context.ordersSnapshots.forEach(({ key, data }) => {
            queryClient.setQueryData(key, data);
          });
        }
        if (context?.vendorsKey) {
          queryClient.setQueryData(context.vendorsKey, context.previousVendors);
        }
        showNotification('Failed to update vendor: ' + (error?.message || 'Unknown error'), 'error');
      },
      onSuccess: (data, variables, context) => {
        const ordersSnapshots = queryClient.getQueriesData({ queryKey: ['orders'] });
        const updatedItem = data?.items?.find((item) => String(item._id) === String(variables.itemId));
        const actualVendor = updatedItem?.vendor ? { _id: updatedItem.vendor._id, name: updatedItem.vendor.name } : null;

        ordersSnapshots.forEach(([key, snapshot]) => {
          if (!snapshot) return;
          const updated = applyVendorToOrdersData(snapshot, variables, actualVendor);
          queryClient.setQueryData(key, updated);
        });

        if (actualVendor) {
          syncVendorCaches(actualVendor);
        }

        if (actualVendor?.name && context?.vendorsKey) {
          queryClient.setQueryData(context.vendorsKey, (old) => {
            if (!Array.isArray(old)) return old;
            const lower = (typeof actualVendor.name === 'string' ? actualVendor.name : '').toLowerCase();
            const exists = old.some(v => (v.name || '').toLowerCase() === lower);
            if (exists) {
              return old.map(v => ((v.name || '').toLowerCase() === lower ? actualVendor : v));
            }
            return [...old, actualVendor];
          });
        }

        queryClient.invalidateQueries({ queryKey: ['sheet-vendor-suggestions'] });
        queryClient.invalidateQueries({ queryKey: ['vendors'] });
      },
      retry: 1,
      retryDelay: 1000
  });

  // Create vendor mutation
  const createVendorMutation = useMutation({
    mutationFn: async (vendorData) => {
      const response = await axios.post(`${API_BASE_URL}/vendors`, vendorData);
      return response.data;
    },
    onSuccess: (createdVendor) => {
      syncVendorCaches(createdVendor);
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setCreateVendorDialogOpen(false);
      setNewVendorName('');
      setNewVendorEmail('');
      setNewVendorPhone('');
      showNotification(`Vendor "${createdVendor.name}" created successfully!`, 'success');
    },
    onError: (error) => {
      const message = error?.response?.data?.message || error?.message || 'Failed to create vendor';
      showNotification(message, 'error');
    }
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ orderId, newStage }) => {
      const response = await axios.put(`${API_BASE_URL}/orders/${orderId}/stage`, {
        stage: newStage
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error) => {
      setMessageDialog({ open: true, title: 'Error', message: error.message });
    }
  });

  // Update sheet data mutation
  const updateSheetDataMutation = useMutation({
    mutationFn: async ({ sku, field, value, location }) => {
      if (location) {
        await axios.put(`${API_BASE_URL}/orders/inventory-data`, {
          sku, location, field, value
        });
      } else {
        await axios.put(`${API_BASE_URL}/orders/pack-sku-data`, {
          sku, field, value
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setEditingCell(null);
      setMessageDialog({ open: true, title: 'Success', message: 'Sheet updated successfully!' });
    },
    onError: (error) => {
      setMessageDialog({ open: true, title: 'Error', message: 'Failed to update sheet: ' + error.message });
    }
  });

  const handleBulkMapVendors = async () => {
    setConfirmDialog({
      open: true,
      title: 'Bulk Map Vendors',
      message: 'Are you sure you want to bulk map vendors based on SKUs?',
      onConfirm: async () => {
        await bulkMapMutation.mutateAsync();
      }
    });
  };

  const handleAutoAssignVendors = async () => {
    setConfirmDialog({
      open: true,
      title: 'Auto Assign Vendors',
      message: 'This will auto-assign vendors to all unassigned items. Continue?',
      onConfirm: async () => {
        await autoAssignMutation.mutateAsync();
      }
    });
  };

  const handleAcceptAllSuggestions = async () => {
    setConfirmDialog({
      open: true,
      title: 'Accept All Suggestions',
      message: 'Accept ALL vendor suggestions from Google Sheets for items without a vendor. Manually-entered vendors will not be changed. Continue?',
      onConfirm: async () => {
        await acceptAllSuggestionsMutation.mutateAsync();
      }
    });
  };

  // Accept suggested vendor
  const acceptVendorMutation = useMutation({
    mutationFn: async ({ orderId, itemId, vendorName }) => {
      const response = await axios.post(
        `${API_BASE_URL}/orders/${orderId}/items/${itemId}/accept-vendor`,
        { vendorName }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setMessageDialog({ open: true, title: 'Success', message: 'Vendor accepted successfully!' });
    },
    onError: (error) => {
      const errorMessage = error.response?.data?.message || error.message;
      setMessageDialog({ open: true, title: 'Error', message: 'Failed to accept vendor: ' + errorMessage });
    }
  });

  const handleAcceptVendor = async (orderId, itemId, vendorName) => {
    setConfirmDialog({
      open: true,
      title: 'Accept Vendor',
      message: `Accept "${vendorName}" as vendor for this item?`,
      onConfirm: async () => {
        await acceptVendorMutation.mutateAsync({ orderId, itemId, vendorName });
      }
    });
  };

  const handleVendorSelection = (orderId, itemId, selection) => {
    if (!orderId || !itemId) return;

    if (!selection) {
      updateVendorMutation.mutate({ orderId, itemId });
      return;
    }

    if (typeof selection === 'string') {
      const trimmed = selection.trim();
      if (trimmed) {
        updateVendorMutation.mutate({ orderId, itemId, vendorName: trimmed });
      }
      return;
    }

    if (selection?._id) {
      updateVendorMutation.mutate({ orderId, itemId, vendorId: selection._id });
      return;
    }

    const inferredName = selection?.name || selection?.label;
    if (inferredName) {
      updateVendorMutation.mutate({ orderId, itemId, vendorName: inferredName.trim() });
    }
  };

  // Dialogs replacing browser notifications
  // Render at end of component's return (similar to StageOrdersView pattern)

  // Toggle size source
  const handleToggleSizeSource = (newSource) => {
    setSizeSource(newSource);
    localStorage.setItem('sizeSource', newSource);
    queryClient.invalidateQueries(['orders']); // Refresh to apply new size source
  };

  const handleItemSelect = (orderId, itemId, isChecked) => {
    setSelectedItems(prev => {
      if (isChecked) {
        return [...prev, { orderId, itemId }];
      } else {
        return prev.filter(item => !(item.orderId === orderId && item.itemId === itemId));
      }
    });
  };

  const handleGroupSelect = (group, isChecked) => {
    const groupItems = group.orders.map(order => ({
      orderId: order.orderId,
      itemId: order.itemId
    }));
    
    if (isChecked) {
      setSelectedItems(prev => [...prev, ...groupItems]);
    } else {
      setSelectedItems(prev =>
        prev.filter(item =>
          !groupItems.some(gi => gi.orderId === item.orderId && gi.itemId === item.itemId)
        )
      );
    }
  };

  const handleProcessSelected = async () => {
    if (selectedItems.length === 0) {
      setMessageDialog({ open: true, title: 'Warning', message: 'No items selected. Please select at least one item.' });
      return;
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/orders/process-items`, {
        items: selectedItems
      });
      const result = response.data;
      setMessageDialog({ open: true, title: 'Success', message: `Processed ${result.processedCount} item(s). Skipped ${result.skippedCount} item(s).` });
      setSelectedItems([]);
      queryClient.invalidateQueries(['orders']);
    } catch (error) {
      setMessageDialog({ open: true, title: 'Error', message: `Error processing items: ${error.message}` });
    }
  };

  const toggleRowExpansion = (sku) => {
    setExpandedRows(prev => ({
      ...prev,
      [sku]: !prev[sku]
    }));
  };

  const handleStartEdit = (sku, field, currentValue, location = null) => {
    setEditingCell({ sku, field, location });
    setEditValue(currentValue);
  };

  const handleSaveEdit = () => {
    if (editingCell) {
      updateSheetDataMutation.mutate({
        sku: editingCell.sku,
        field: editingCell.field,
        value: editValue,
        location: editingCell.location
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const handleCreateVendor = () => {
    if (!newVendorName.trim()) {
      showNotification('Please enter a vendor name', 'warning');
      return;
    }
    
    createVendorMutation.mutate({
      name: newVendorName,
      contactInfo: {
        email: newVendorEmail,
        phone: newVendorPhone
      }
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const handleViewHistory = async (sku) => {
    try {
      setLoadingHistory(true);
      
      // Fetch processed history by SKU (last 10 records)
      try {
        const encodedSku = encodeURIComponent(sku);
        const historyResponse = await axios.get(`${API_BASE_URL}/orders/sku-processing-history/${encodedSku}?limit=10`);
        if (historyResponse.data && historyResponse.data.success) {
          setProcessedHistory(historyResponse.data.history || []);
          // Set order name from first history record if available
          if (historyResponse.data.history && historyResponse.data.history.length > 0) {
            setSelectedOrderHistory({ 
              orderName: `SKU: ${sku}`,
              sku: sku
            });
          } else {
            setSelectedOrderHistory({ 
              orderName: `SKU: ${sku}`,
              sku: sku
            });
          }
        } else {
          setProcessedHistory([]);
          setSelectedOrderHistory({ 
            orderName: `SKU: ${sku}`,
            sku: sku
          });
        }
      } catch (historyError) {
        console.error('Error fetching processed history:', historyError);
        setProcessedHistory([]);
        setSelectedOrderHistory({ 
          orderName: `SKU: ${sku}`,
          sku: sku
        });
      }
      
      setHistoryDialogOpen(true);
    } catch (error) {
      console.error('Error fetching order history:', error);
      setMessageDialog({ open: true, title: 'Error', message: 'Failed to load order history' });
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleOpenOrderEditor = async (order) => {
    try {
      const oid = order?._id || order?.orderId;
      if (!oid) {
        setMessageDialog({ open: true, title: 'Error', message: 'Failed to load order details: missing order id' });
        return;
      }
      const response = await axios.get(`${API_BASE_URL}/orders/${encodeURIComponent(oid)}`);
      setSelectedOrderForEdit(response.data);
      setOrderEditorOpen(true);
    } catch (error) {
      console.error('Error fetching order details:', error);
      const msg = error?.response?.data?.message || 'Failed to load order details for editing';
      setMessageDialog({ open: true, title: 'Error', message: msg });
    }
  };

  const handleOrderSaved = () => {
    queryClient.invalidateQueries(['orders']);
    setOrderEditorOpen(false);
    setSelectedOrderForEdit(null);
  };

  const handleClearFilters = () => {
    const defaultFilters = {
      search: '',
      vendorId: '',
      vendorFilter: '',
      sortBy: 'createdAt',
      sortOrder: 'desc',
      startDate: getDefaultStartDate(),
      endDate: '',
      hideProcessed: true,
      showOnlyUnsatisfiable: false,
      locationFilter: 'all',
      orderSourceFilter: 'all',
      stageFilter: 'all',
    };
    setFilters(defaultFilters);
    localStorage.removeItem('initialOrdersFilters');
  };

  // Process and filter groupedOrders - MUST be before conditional returns to follow Rules of Hooks
  useEffect(() => {
    if (!data?.orders) {
      setGroupedOrders([]);
      return;
    }

    let processedOrders = Array.isArray(data.orders) ? data.orders : [];

    // Ensure individual SKUs array is always defined
    processedOrders = processedOrders.map(group => ({
      ...group,
      individualSkus: Array.isArray(group?.individualSkus) ? group.individualSkus : []
    }));

    // Apply unsatisfiable filter if enabled
    if (filters.showOnlyUnsatisfiable) {
      processedOrders = processedOrders.filter(group => !group?.canSatisfy);
    }

    // Apply location-specific satisfiable filter
    if (filters.locationFilter !== 'all') {
      processedOrders = processedOrders.filter(group => {
        if (!group?.canSatisfy) return false; // Only show satisfiable orders
        
        switch (filters.locationFilter) {
          case 'okhla':
            return group.satisfyLocation === 'Okhla' || group.satisfyLocation === 'Both';
          case 'bahadurgarh':
            return group.satisfyLocation === 'Bahadurgarh' || group.satisfyLocation === 'Both';
          case 'both':
            return group.satisfyLocation === 'Both';
          case 'combined':
            return group.satisfyLocation === 'Combined';
          default:
            return true;
        }
      });
    }

    // Apply order source filter (manual/imported)
    if (filters.orderSourceFilter !== 'all') {
      processedOrders = processedOrders.filter(group => {
        if (!group?.orders || !Array.isArray(group.orders)) return false;
        
        // Check if any order in the group matches the filter
        const hasMatchingSource = group.orders.some(order => {
          if (filters.orderSourceFilter === 'manual' || filters.orderSourceFilter === 'imported') {
            return order.isManual === true;
          } else if (filters.orderSourceFilter === 'shopify') {
            return !order.isManual;
          }
          return true;
        });
        
        return hasMatchingSource;
      });
    }
    
    setGroupedOrders(processedOrders);
  }, [data, filters]);

  useEffect(() => {
    const orderIds = getCurrentOrderIds();
    if (!orderIds.length) {
      setLastFulfillmentSignature('');
      return;
    }
    const signature = orderIds.slice().sort().join('|');
    if (signature !== lastFulfillmentSignature && !refreshingFulfillment) {
      refreshFulfillmentStatuses({ silent: true, orderIdsOverride: orderIds });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeGroupedOrders, filters.startDate, filters.endDate, filters.stageFilter, refreshingFulfillment, lastFulfillmentSignature]);

  if (isLoading) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading orders...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Error loading orders: {error.message}
        </Alert>
      </Box>
    );
  }

  // Add comprehensive data validation
  if (!data) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">
          No data received from server
        </Alert>
      </Box>
    );
  }

  
  return (
      <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>Initial Orders</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, maxWidth: { xs: '100%', md: '50%' }, mb: 2 }}>
        <Chip label={safeGroupedOrders.length} color="primary" size="small" />
        <Chip label={`${satisfiableCount} Satisfiable`} color="success" size="small" />
        <Chip label={`${unsatisfiableCount} Unsatisfiable`} color="warning" size="small" />
        <Chip label={`${okhlaOnlyCount} Okhla-only`} color="secondary" size="small" />
        <Chip label={`${bahadurgarhOnlyCount} Bahadurgarh-only`} color="info" size="small" />
        <Chip label={`${bothCount} Both`} color="success" size="small" />
        <Chip label={`${shopifyCount} Shopify`} size="small" sx={{ bgcolor: '#95BF47', color: 'white' }} />
        <Chip label={`${manualCount} Manual/Imported`} size="small" sx={{ bgcolor: '#9C27B0', color: 'white' }} />
      </Box>

      {/* Info Alert */}
      {isGrouped && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Multi-order SKUs are grouped. Single orders remain ungrouped. Click expand to see details.
        </Alert>
      )}

      {/* Action Buttons - Organized in rows */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>Actions</Typography>
        

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(auto-fill, minmax(180px, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' },
            gap: 2
          }}
        >
          <Button
            fullWidth
            variant="contained"
            color="primary"
            onClick={handleAutoAssignVendors}
            startIcon={<AutoFixHighIcon />}
            size="small"
            disabled={autoAssignMutation.isLoading}
          >
            {autoAssignMutation.isLoading ? 'ASSIGNING...' : 'AUTO ASSIGN VENDORS'}
          </Button>

          <Button
            fullWidth
            variant="contained"
            color="success"
            onClick={async () => {
              try {
                const tasks = [];
                // Accept suggestions only for items without a vendor and in Initial stage
                safeGroupedOrders.forEach((group) => {
                  if (!group || !Array.isArray(group.orders)) return;
                  group.orders.forEach((order) => {
                    const hasVendor = !!order.vendor;
                    const suggestions = Array.isArray(order.vendorSuggestions) ? order.vendorSuggestions : [];
                    const isInitial = !order.stage || String(order.stage).toLowerCase() === 'initial';
                    if (!hasVendor && suggestions.length > 0 && isInitial) {
                      const normalized = String(suggestions[0] || '').trim();
                      if (normalized) {
                        tasks.push(acceptVendorMutation.mutateAsync({ orderId: order.orderId, itemId: order.itemId, vendorName: normalized }));
                      }
                    } else if (!hasVendor && isInitial) {
                      const normSku = String(order.sku || group.sku || '').toUpperCase().trim();
                      const fallback = suggestionCache[normSku];
                      if (fallback && fallback.trim()) {
                        tasks.push(acceptVendorMutation.mutateAsync({ orderId: order.orderId, itemId: order.itemId, vendorName: fallback.trim() }));
                      }
                    }
                  });
                });
                if (tasks.length === 0) {
                  setMessageDialog({ open: true, title: 'Info', message: 'No suggestions to accept (either already assigned or none available).' });
                  return;
                }
                await Promise.allSettled(tasks);
                setMessageDialog({ open: true, title: 'Success', message: 'Accepted available vendor suggestions for visible Initial orders.' });
                queryClient.invalidateQueries(['orders']);
              } catch (error) {
                setMessageDialog({ open: true, title: 'Error', message: 'Failed to accept all suggestions: ' + (error?.message || 'Unknown error') });
              }
            }}
            startIcon={<CheckCircleIcon />}
            size="small"
          >
            ACCEPT ALL SUGGESTIONS
          </Button>

          <Button
            fullWidth
            variant="contained"
            color="success"
            onClick={() => {
              const satisfiableItems = safeGroupedOrders
                .filter(group => group?.canSatisfy && group?.orders && Array.isArray(group.orders))
                .flatMap(g => g.orders.map(o => ({ orderId: o.orderId, itemId: o.itemId })));
              setSelectedItems(satisfiableItems);
            }}
            size="small"
          >
            SELECT SATISFIABLE
          </Button>

          <Button
            fullWidth
            variant="contained"
            color="warning"
            onClick={() => {
              const unsatisfiableItems = safeGroupedOrders
                .filter(group => !group?.canSatisfy && group?.orders && Array.isArray(group.orders))
                .flatMap(g => g.orders.map(o => ({ orderId: o.orderId, itemId: o.itemId })));
              setSelectedItems(unsatisfiableItems);
            }}
            size="small"
          >
            SELECT UNSATISFIABLE
          </Button>

          <Button
            fullWidth
            variant="contained"
            color="primary"
            onClick={handleBulkMapVendors}
            size="small"
          >
            BULK MAP VENDORS
          </Button>

          <Button
            fullWidth
            variant="outlined"
            color="primary"
            onClick={() => setCreateVendorDialogOpen(true)}
            size="small"
          >
            CREATE VENDOR
          </Button>

          <Button
            fullWidth
            variant="contained"
            color="secondary"
            onClick={() => setShowManualOrder(true)}
            size="small"
          >
            CREATE MANUAL ORDER
          </Button>

          <Button
            fullWidth
            variant="contained"
            color="success"
            startIcon={<UploadIcon />}
            onClick={() => setImportDialogOpen(true)}
            size="small"
          >
            IMPORT ORDERS
          </Button>

          <Button
            fullWidth
            variant="outlined"
            color="primary"
            startIcon={<DownloadIcon />}
            onClick={() => setExportDialogOpen(true)}
            disabled={!data || (data.orders && data.orders.length === 0)}
            size="small"
          >
            EXPORT ORDERS
          </Button>

          <Button
            fullWidth
            variant="outlined"
            color="secondary"
            startIcon={<HistoryIcon />}
            onClick={() => setEmailScheduleDialogOpen(true)}
            size="small"
            sx={{ mt: 1 }}
          >
            EMAIL SCHEDULE
          </Button>

          <Box sx={{ width: '100%' }}>
            <Tooltip title="Toggle between Shopify and Google Sheets for size data">
              <Button
                fullWidth
                variant={sizeSource === 'shopify' ? 'contained' : 'outlined'}
                color="info"
                onClick={() => handleToggleSizeSource(sizeSource === 'shopify' ? 'sheet' : 'shopify')}
                size="small"
                sx={{ 
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    transform: 'scale(1.05)',
                  }
                }}
              >
                Size: {sizeSource === 'shopify' ? '?? Shopify' : '?? Sheet'}
              </Button>
            </Tooltip>
          </Box>

          <Button
            fullWidth
            variant="outlined"
            color="primary"
            onClick={async () => {
              try {
                const response = await axios.get(`${API_BASE_URL}/orders/export`, {
                  params: { stage: 'Initial', ...filters },
                  responseType: 'blob'
                });
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `orders-initial-${new Date().toISOString().split('T')[0]}.csv`);
                document.body.appendChild(link);
                link.click();
                link.remove();
              } catch (error) {
                setMessageDialog({ open: true, title: 'Error', message: 'Failed to export orders: ' + error.message });
              }
            }}
          >
            QUICK EXPORT CSV
          </Button>

          <Button
            fullWidth
            variant="contained"
            color="info"
            startIcon={<RefreshIcon />}
            onClick={() => refreshFulfillmentStatuses()}
            disabled={refreshingFulfillment}
            size="small"
          >
            {refreshingFulfillment ? 'REFRESHING...' : 'REFRESH FULFILLMENT'}
          </Button>

          <Button
            fullWidth
            variant="contained"
            color="success"
            startIcon={<SendIcon />}
            onClick={handleProcessSelected}
            disabled={selectedItems.length === 0}
            size="small"
          >
            PROCESS SELECTED ({selectedItems.length})
          </Button>

          <Button
            fullWidth
            variant="contained"
            color="secondary"
            onClick={async () => {
              // Filter items where fulfillmentStatus is 'Fulfilled'
              const fulfilledItems = safeGroupedOrders
                .filter(group => group?.orders && Array.isArray(group.orders))
                .flatMap(g => g.orders
                  .filter(o => o.fulfillmentStatus === 'Fulfilled')
                  .map(o => ({ orderId: o.orderId, itemId: o.itemId }))
                );
              
              if (fulfilledItems.length === 0) {
                setMessageDialog({ open: true, title: 'Info', message: 'No fulfilled items found to move.' });
                return;
              }
              
              try {
                const response = await axios.post(`${API_BASE_URL}/orders/move-items-to-stage`, {
                  items: fulfilledItems,
                  targetStage: 'Fulfilled'
                });
                const result = response.data;
                setMessageDialog({ open: true, title: 'Success', message: `Moved ${result.movedCount || 0} fulfilled items to Fulfilled stage.` });
                queryClient.invalidateQueries(['orders']);
              } catch (error) {
                setMessageDialog({ open: true, title: 'Error', message: 'Failed to move items: ' + (error?.response?.data?.message || error.message) });
              }
            }}
            size="small"
          >
            SELECT FULFILLED AND MOVE
          </Button>

          <Button
            fullWidth
            variant="outlined"
            color="warning"
            onClick={() => setChangeStageDialogOpen(true)}
            disabled={selectedItems.length === 0}
            size="small"
          >
            CHANGE STAGE ({selectedItems.length})
          </Button>

          <Button
            fullWidth
            variant="outlined"
            color={showPricing ? 'primary' : 'inherit'}
            startIcon={showPricing ? <VisibilityOffIcon /> : <VisibilityIcon />}
            onClick={() => setShowPricing(!showPricing)}
          >
            {showPricing ? 'HIDE' : 'SHOW'} PRICING
          </Button>
        </Box>
      </Paper>

      {/* Filters Section */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>Filters & Sorting</Typography>
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
          <TextField
            label="Search"
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            size="small"
            sx={{ minWidth: 200 }}
          />

          <TextField
            label="Search Vendors"
            value={vendorSearch}
            onChange={(e) => setVendorSearch(e.target.value)}
            size="small"
            sx={{ minWidth: 200 }}
          />
          
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Filter by Vendor</InputLabel>
            <Select
              value={filters.vendorFilter}
              onChange={(e) => setFilters(prev => ({ ...prev, vendorFilter: e.target.value }))}
              label="Filter by Vendor"
            >
              <MenuItem value="">All Vendors</MenuItem>
              {vendors?.map((vendor) => (
                <MenuItem key={vendor._id} value={vendor._id}>
                  {vendor.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Filter by Stage</InputLabel>
            <Select
              value={filters.stageFilter || 'all'}
              onChange={(e) => setFilters(prev => ({ ...prev, stageFilter: e.target.value }))}
              label="Filter by Stage"
            >
              <MenuItem value="all">All Stages</MenuItem>
              <MenuItem value="Initial">Initial</MenuItem>
              <MenuItem value="Hold">Hold</MenuItem>
              <MenuItem value="Processed">Processed</MenuItem>
              <MenuItem value="Pending">Pending</MenuItem>
              <MenuItem value="Completed">Completed</MenuItem>
              <MenuItem value="In-Stock">In-Stock</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Start Date"
            type="date"
            value={filters.startDate}
            onChange={(e) => {
              const v = e.target.value;
              setFilters(prev => ({ ...prev, startDate: v }));
            }}
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 150 }}
          />

          <TextField
            label="Start Time"
            type="time"
            value={filters.startTime}
            onChange={(e) => {
              setFilters(prev => ({ ...prev, startTime: e.target.value }));
            }}
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 120 }}
            inputProps={{ step: 1 }}
          />

          <TextField
            label="End Date"
            type="date"
            value={filters.endDate}
            onChange={(e) => {
              const v = e.target.value;
              setFilters(prev => ({ ...prev, endDate: v }));
            }}
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 150 }}
          />

          <TextField
            label="End Time"
            type="time"
            value={filters.endTime}
            onChange={(e) => {
              setFilters(prev => ({ ...prev, endTime: e.target.value }));
            }}
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 120 }}
            inputProps={{ step: 1 }}
          />

          <Button
            variant="outlined"
            onClick={() => setFilters(prev => ({ ...prev, startDate: '', endDate: '', startTime: '', endTime: '' }))}
            size="small"
          >
            CLEAR DATE/TIME
          </Button>

          <Button
            variant="outlined"
            color="secondary"
            onClick={handleClearFilters}
            size="small"
          >
            CLEAR ALL FILTERS
          </Button>

          <Button
            variant="outlined"
            onClick={() => setFilters(prev => ({ 
              ...prev, 
              sortBy: 'productName',
              sortOrder: 'asc'
            }))}
            size="small"
          >
            SORT BY NAME A-Z
          </Button>

          <Button
            variant={filters.showOnlyUnsatisfiable ? "contained" : "outlined"}
            color={filters.showOnlyUnsatisfiable ? "warning" : "inherit"}
            onClick={() => setFilters(prev => ({ 
              ...prev, 
              showOnlyUnsatisfiable: !prev.showOnlyUnsatisfiable,
              locationFilter: 'all' // Reset location filter when toggling unsatisfiable
            }))}
            size="small"
            sx={{
              animation: filters.showOnlyUnsatisfiable ? 'pulse 2s ease-in-out infinite' : 'none',
              '@keyframes pulse': {
                '0%, 100%': { transform: 'scale(1)' },
                '50%': { transform: 'scale(1.05)' },
              },
            }}
          >
            {filters.showOnlyUnsatisfiable ? '✓ SHOWING UNSATISFIABLE' : 'SHOW UNSATISFIABLE ONLY'}
          </Button>
        </Stack>

        {/* Second row: Location Filters */}
        <Stack direction="row" spacing={2} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
          <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
            Filter by Location:
          </Typography>
          
          <Button
            variant={filters.locationFilter === 'all' ? "contained" : "outlined"}
            color={filters.locationFilter === 'all' ? "primary" : "inherit"}
            onClick={() => setFilters(prev => ({ 
              ...prev, 
              locationFilter: 'all',
              showOnlyUnsatisfiable: false
            }))}
            size="small"
          >
            All Locations
          </Button>

          <Button
            variant={filters.locationFilter === 'okhla' ? "contained" : "outlined"}
            color={filters.locationFilter === 'okhla' ? "secondary" : "inherit"}
            onClick={() => setFilters(prev => ({ 
              ...prev, 
              locationFilter: 'okhla',
              showOnlyUnsatisfiable: false
            }))}
            size="small"
          >
            📍 Okhla Can Satisfy
          </Button>

          <Button
            variant={filters.locationFilter === 'bahadurgarh' ? "contained" : "outlined"}
            color={filters.locationFilter === 'bahadurgarh' ? "info" : "inherit"}
            onClick={() => setFilters(prev => ({ 
              ...prev, 
              locationFilter: 'bahadurgarh',
              showOnlyUnsatisfiable: false
            }))}
            size="small"
          >
            📍 Bahadurgarh Can Satisfy
          </Button>

          <Button
            variant={filters.locationFilter === 'both' ? "contained" : "outlined"}
            color={filters.locationFilter === 'both' ? "success" : "inherit"}
            onClick={() => setFilters(prev => ({ 
              ...prev, 
              locationFilter: 'both',
              showOnlyUnsatisfiable: false
            }))}
            size="small"
          >
            ✓ Both Can Satisfy
          </Button>

          <Button
            variant={filters.locationFilter === 'combined' ? "contained" : "outlined"}
            color={filters.locationFilter === 'combined' ? "warning" : "inherit"}
            onClick={() => setFilters(prev => ({ 
              ...prev, 
              locationFilter: 'combined',
              showOnlyUnsatisfiable: false
            }))}
            size="small"
          >
            🔄 Combined Stock Needed
          </Button>
        </Stack>
        
        {/* Third row: Order Source Filters */}
        <Stack direction="row" spacing={2} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
          <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
            Filter by Source:
          </Typography>
          
          <Button
            variant={filters.orderSourceFilter === 'all' ? "contained" : "outlined"}
            color={filters.orderSourceFilter === 'all' ? "primary" : "inherit"}
            onClick={() => setFilters(prev => ({ 
              ...prev, 
              orderSourceFilter: 'all'
            }))}
            size="small"
          >
            All Sources
          </Button>

          <Button
            variant={filters.orderSourceFilter === 'shopify' ? "contained" : "outlined"}
            sx={{
              bgcolor: filters.orderSourceFilter === 'shopify' ? '#95BF47' : 'transparent',
              color: filters.orderSourceFilter === 'shopify' ? 'white' : 'inherit',
              '&:hover': {
                bgcolor: filters.orderSourceFilter === 'shopify' ? '#7da33a' : 'rgba(149, 191, 71, 0.08)',
              }
            }}
            onClick={() => setFilters(prev => ({ 
              ...prev, 
              orderSourceFilter: 'shopify'
            }))}
            size="small"
          >
            🛒 Shopify Orders
          </Button>

          <Button
            variant={filters.orderSourceFilter === 'manual' ? "contained" : "outlined"}
            sx={{
              bgcolor: filters.orderSourceFilter === 'manual' ? '#9C27B0' : 'transparent',
              color: filters.orderSourceFilter === 'manual' ? 'white' : 'inherit',
              '&:hover': {
                bgcolor: filters.orderSourceFilter === 'manual' ? '#7b1fa2' : 'rgba(156, 39, 176, 0.08)',
              }
            }}
            onClick={() => setFilters(prev => ({ 
              ...prev, 
              orderSourceFilter: 'manual'
            }))}
            size="small"
          >
            ✏️ Manual/Imported Orders
          </Button>

          <Button
            variant="outlined"
            onClick={() => {
              // Select all manual/imported orders
              const manualItems = safeGroupedOrders
                .filter(group => group?.orders && Array.isArray(group.orders) && 
                  group.orders.some(o => o.isManual === true))
                .flatMap(g => g.orders.map(o => ({ orderId: o.orderId, itemId: o.itemId })));
              setSelectedItems(manualItems);
            }}
            size="small"
          >
            SELECT MANUAL/IMPORTED
          </Button>
        </Stack>
        
        <Stack direction="row" spacing={2} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
          <Button
            variant="outlined"
            color="error"
            onClick={() => setFilters({
              search: '',
              vendorId: '',
              vendorFilter: '',
              sortBy: 'createdAt',
              sortOrder: 'desc',
              startDate: getDefaultStartDate(),
              endDate: '',
              hideProcessed: true,
              showOnlyUnsatisfiable: false,
              locationFilter: 'all',
              orderSourceFilter: 'all',
            })}
            size="small"
          >
            CLEAR ALL FILTERS
          </Button>
        </Stack>
      </Paper>

      {/* Grouped orders table */}
      {safeGroupedOrders.length > 0 ? (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ 
                backgroundColor: (theme) => theme.palette.mode === 'dark' ? theme.palette.action.hover : theme.palette.grey[100],
                '& .MuiTableCell-root': {
                  color: (theme) => theme.palette.text.primary
                }
              }}>
                <TableCell width={40}>
                  <Checkbox
                    indeterminate={selectedItems.length > 0 && selectedItems.length < safeGroupedOrders.reduce((sum, g) => sum + (g?.orders?.length || 0), 0)}
                    checked={safeGroupedOrders.length > 0 && selectedItems.length === safeGroupedOrders.reduce((sum, g) => sum + (g?.orders?.length || 0), 0)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const allItems = safeGroupedOrders
                          .filter(g => g?.orders && Array.isArray(g.orders))
                          .flatMap(g => g.orders.map(o => ({ orderId: o.orderId, itemId: o.itemId })));
                        setSelectedItems(allItems);
                      } else {
                        setSelectedItems([]);
                      }
                    }}
                  />
                </TableCell>
                <TableCell width={50}></TableCell>
                <TableCell><strong>SKU</strong></TableCell>
                <TableCell><strong>Product Name</strong></TableCell>
                <TableCell><strong>Received Date</strong></TableCell>
                
                {/* Inventory Header with Child Locations */}
                {showInventory && (
                  <TableCell colSpan={hideSafetyStock ? 2 : 4} align="center" sx={{ 
                    borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                    fontWeight: 'bold'
                  }}>
                    Current Inventory
                  </TableCell>
                )}
                
                <TableCell><strong>Received Qty</strong></TableCell>
                <TableCell><strong>Pack Qty</strong></TableCell>
                <TableCell><strong>Final Qty</strong></TableCell>
                <TableCell><strong>Order Price</strong></TableCell>
                {showPricing && (
                  <>
                    <TableCell><strong>Price Before GST</strong></TableCell>
                    <TableCell><strong>GST %</strong></TableCell>
                    <TableCell><strong>Total Price</strong></TableCell>
                  </>
                )}
                <TableCell><strong>Vendor</strong></TableCell>
                <TableCell><strong>Payment Status</strong></TableCell>
                <TableCell><strong>Fulfillment Status</strong></TableCell>
                <TableCell><strong>Actions</strong></TableCell>
              </TableRow>
              
              {/* Second header row for inventory sub-columns */}
              <TableRow sx={{ 
                backgroundColor: (theme) => theme.palette.mode === 'dark' ? theme.palette.action.selected : theme.palette.grey[50],
                '& .MuiTableCell-root': {
                  color: (theme) => theme.palette.text.primary
                }
              }}>
                <TableCell colSpan={5}></TableCell>
                
                {showInventory && (
                  <>
                    <TableCell align="center"><strong>Okhla Available</strong></TableCell>
                    {!hideSafetyStock && <TableCell align="center"><strong>Okhla Safety</strong></TableCell>}
                    <TableCell align="center"><strong>Bahadurgarh Available</strong></TableCell>
                    {!hideSafetyStock && <TableCell align="center"><strong>Bahadurgarh Safety</strong></TableCell>}
                  </>
                )}
                
                <TableCell colSpan={showPricing ? 12 : 9}></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {safeGroupedOrders.map((group) => {
                // Safe check for orders array
                if (!group || !group.orders || !Array.isArray(group.orders) || group.orders.length === 0) {
                  return null;
                }

                const isGroupChecked = group.orders.every(o => 
                  selectedItems.some(si => si.orderId === o.orderId && si.itemId === o.itemId)
                );
                const isGroupIndeterminate = !isGroupChecked && group.orders.some(o =>
                  selectedItems.some(si => si.orderId === o.orderId && si.itemId === o.itemId)
                );

                const groupVendorOptionPool = buildVendorOptionList(group.vendorSuggestions);

                return (
                  <Fragment key={group.sku}>
                    <TableRow hover>
                      <TableCell>
                        {group.isGrouped ? (
                          <Tooltip title="Select all in group">
                            <Checkbox
                              indeterminate={isGroupIndeterminate}
                              checked={isGroupChecked}
                              onChange={(e) => handleGroupSelect(group, e.target.checked)}
                            />
                          </Tooltip>
                        ) : (
                          <Checkbox
                            checked={selectedItems.some(si => si.orderId === group.orders[0].orderId && si.itemId === group.orders[0].itemId)}
                            onChange={(e) => handleGroupSelect(group, e.target.checked)}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {group.isGrouped && (
                          <IconButton
                            size="small"
                            onClick={() => toggleRowExpansion(group.sku)}
                          >
                            {expandedRows[group.sku] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          </IconButton>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {group.sku}
                        </Typography>
                        {group.isPack && (
                          <Chip label="PACK" size="small" color="warning" sx={{ mt: 0.5 }} />
                        )}
                        {/* Show pack/combo SKU expansion */}
                        <PackComboSkuExpansion sku={group.sku} prefetchedSkus={group.individualSkus} />
                        {group.isGrouped && (
                          <Chip label={`${group.orders.length} orders`} size="small" color="info" sx={{ mt: 0.5, ml: 0.5 }} />
                        )}
                        {group.canSatisfy && group.satisfyLocation && (
                          <Chip 
                            label={
                              group.satisfyLocation === 'Both' 
                                ? '✓ Both Locations' 
                                : group.satisfyLocation === 'Combined'
                                ? '✓ Combined Stock'
                                : `✓ ${group.satisfyLocation}`
                            } 
                            size="small" 
                            color="success" 
                            sx={{ mt: 0.5, ml: 0.5 }} 
                          />
                        )}
                      </TableCell>
                      <TableCell onDoubleClick={() => {
                        const store = 'medanshv2.myshopify.com';
                        const url = `https://admin.shopify.com/store/${store.replace('.myshopify.com','')}/products?query=${encodeURIComponent(group.sku)}`;
                        window.open(url, '_blank', 'noopener');
                      }}
                      >
                        <Typography variant="body2" sx={{ cursor: 'pointer', textDecoration: 'underline' }}>
                          {group.productName}
                        </Typography>
                        {/* Show order name chip only for single-order groups; grouped orders list names inside the dropdown */}
                        {Array.isArray(group.orders) && group.orders.length === 1 && (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                            <Chip
                              key={`${group.orders[0].orderId}-${group.orders[0].itemId}`}
                              label={group.orders[0].orderName || `#${String(group.orders[0].orderId).slice(-6)}`}
                              size="small"
                            />
                          </Box>
                        )}
                        {group.variantName && (
                          <Typography variant="caption" color="text.secondary">
                            {group.variantName}
                          </Typography>
                        )}
                        {/* Display size based on selected source */}
                        {(sizeSource === 'shopify' ? group.sizeFromShopify : group.sizeFromSheet) && (
                          <Tooltip title={`Size from ${sizeSource === 'shopify' ? 'Shopify' : 'Google Sheet'}`}>
                            <Chip 
                              label={`Size: ${sizeSource === 'shopify' ? group.sizeFromShopify : group.sizeFromSheet}`} 
                              size="small" 
                              color={sizeSource === 'shopify' ? 'secondary' : 'info'}
                              sx={{ 
                                mt: 0.5,
                                transition: 'all 0.3s ease',
                                '&:hover': {
                                  transform: 'scale(1.05)',
                                }
                              }} 
                            />
                          </Tooltip>
                        )}
                        {/* Fallback if selected source has no size */}
                        {!(sizeSource === 'shopify' ? group.sizeFromShopify : group.sizeFromSheet) && 
                         (sizeSource === 'shopify' ? group.sizeFromSheet : group.sizeFromShopify) && (
                          <Tooltip title={`Size from ${sizeSource === 'shopify' ? 'Google Sheet (fallback)' : 'Shopify (fallback)'}`}>
                            <Chip 
                              label={`Size: ${sizeSource === 'shopify' ? group.sizeFromSheet : group.sizeFromShopify}`} 
                              size="small" 
                              color="default"
                              sx={{ mt: 0.5, opacity: 0.7 }} 
                            />
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell>
                        {group.orders[0]?.receivedDate ? (
                          <Typography variant="body2">
                            {formatDateTime(group.orders[0].receivedDate)}
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="text.secondary">-</Typography>
                        )}
                      </TableCell>
                      
                      {/* Okhla Available */}
                      {showInventory && (
                        <>
                          <TableCell>
                            {editingCell?.sku === group.sku && editingCell?.field === 'available' && editingCell?.location === 'Okhla' ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <TextField
                                  size="small"
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  sx={{ width: 60 }}
                                />
                                <IconButton size="small" color="primary" onClick={handleSaveEdit}>
                                  <SaveIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={handleCancelEdit}>
                                  <CancelIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            ) : (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography variant="body2">{group.okhlaAvailable !== undefined ? group.okhlaAvailable : 0}</Typography>
                                <IconButton 
                                  size="small" 
                                  onClick={() => handleStartEdit(group.sku, 'available', group.okhlaAvailable || 0, 'Okhla')}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            )}
                          </TableCell>
                          
                          {/* Okhla Safety Stock */}
                          {!hideSafetyStock && (
                            <TableCell>
                              {editingCell?.sku === group.sku && editingCell?.field === 'safetyStock' && editingCell?.location === 'Okhla' ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <TextField
                                  size="small"
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  sx={{ width: 60 }}
                                />
                                <IconButton size="small" color="primary" onClick={handleSaveEdit}>
                                  <SaveIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={handleCancelEdit}>
                                  <CancelIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            ) : (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography variant="body2">{group.okhlaSafetyStock !== undefined ? group.okhlaSafetyStock : 0}</Typography>
                                <IconButton 
                                  size="small" 
                                  onClick={() => handleStartEdit(group.sku, 'safetyStock', group.okhlaSafetyStock || 0, 'Okhla')}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            )}
                            </TableCell>
                          )}
                          
                          {/* Bahadurgarh Available */}
                          <TableCell>
                            {editingCell?.sku === group.sku && editingCell?.field === 'available' && editingCell?.location === 'Bahadurgarh' ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <TextField
                                  size="small"
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  sx={{ width: 60 }}
                                />
                                <IconButton size="small" color="primary" onClick={handleSaveEdit}>
                                  <SaveIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={handleCancelEdit}>
                                  <CancelIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            ) : (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography variant="body2">{group.bahadurgarhAvailable !== undefined ? group.bahadurgarhAvailable : 0}</Typography>
                                <IconButton 
                                  size="small" 
                                  onClick={() => handleStartEdit(group.sku, 'available', group.bahadurgarhAvailable || 0, 'Bahadurgarh')}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            )}
                          </TableCell>
                          
                          {/* Bahadurgarh Safety Stock */}
                          {!hideSafetyStock && (
                            <TableCell>
                              {editingCell?.sku === group.sku && editingCell?.field === 'safetyStock' && editingCell?.location === 'Bahadurgarh' ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <TextField
                                  size="small"
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  sx={{ width: 60 }}
                                />
                                <IconButton size="small" color="primary" onClick={handleSaveEdit}>
                                  <SaveIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={handleCancelEdit}>
                                  <CancelIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            ) : (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography variant="body2">{group.bahadurgarhSafetyStock !== undefined ? group.bahadurgarhSafetyStock : 0}</Typography>
                                <IconButton 
                                  size="small" 
                                  onClick={() => handleStartEdit(group.sku, 'safetyStock', group.bahadurgarhSafetyStock || 0, 'Bahadurgarh')}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            )}
                            </TableCell>
                          )}
                        </>
                      )}
                      
                      <TableCell>
                        <Chip label={group.totalQuantity} color="info" size="small" />
                      </TableCell>
                      <TableCell>
                        {group.isPack ? (
                          <Chip 
                            label={group.packQuantity > 0 ? group.packQuantity : 'Not Found'} 
                            color={group.packQuantity > 0 ? 'success' : 'error'}
                            size="small"
                          />
                        ) : (
                          <Typography variant="body2" color="text.secondary">-</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {group.isPack && group.packQuantity > 0 ? (
                          <Tooltip title={`Calculation: ${group.totalQuantity} × ${group.packQuantity} = ${group.finalQuantity}`}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Chip label={group.finalQuantity} color="secondary" size="small" />
                              <Typography variant="caption" color="text.secondary">
                                ({group.totalQuantity} × {group.packQuantity})
                              </Typography>
                            </Box>
                          </Tooltip>
                        ) : (
                          <Chip label={group.finalQuantity} color="primary" size="small" />
                        )}
                      </TableCell>
                      {/* Order Price */}
                      <TableCell>
                        <SKUPrice 
                          sku={group.sku} 
                          fallbackPrice={group.orders[0]?.price || group.totalPrice || null}
                          page="initial"
                          location={group.orders[0]?.warehouse || 'Okhla'}
                        />
                      </TableCell>
                      {/* Pricing - Editable - Conditional */}
                      {showPricing && (
                        <>
                          <TableCell>
                            {editingCell?.sku === group.sku && editingCell?.field === 'priceBeforeGst' ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <TextField
                                  size="small"
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  sx={{ width: 80 }}
                                />
                                <IconButton size="small" color="primary" onClick={handleSaveEdit}>
                                  <SaveIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={handleCancelEdit}>
                                  <CancelIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            ) : (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography variant="body2">₹{group.priceBeforeGst || 0}</Typography>
                                <IconButton 
                                  size="small" 
                                  onClick={() => handleStartEdit(group.sku, 'priceBeforeGst', group.priceBeforeGst)}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            )}
                              </TableCell>
                      
                          <TableCell>
                            {editingCell?.sku === group.sku && editingCell?.field === 'gst' ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <TextField
                                  size="small"
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  sx={{ width: 60 }}
                                />
                                <IconButton size="small" color="primary" onClick={handleSaveEdit}>
                                  <SaveIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={handleCancelEdit}>
                                  <CancelIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            ) : (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography variant="body2">{group.gst || 0}%</Typography>
                                <IconButton 
                                  size="small" 
                                  onClick={() => handleStartEdit(group.sku, 'gst', group.gst)}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            )}
                          </TableCell>
                          
                          <TableCell>
                            {editingCell?.sku === group.sku && editingCell?.field === 'totalPrice' ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <TextField
                                  size="small"
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  sx={{ width: 80 }}
                                />
                                <IconButton size="small" color="primary" onClick={handleSaveEdit}>
                                  <SaveIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={handleCancelEdit}>
                                  <CancelIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            ) : (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography variant="body2">₹{group.totalPrice || 0}</Typography>
                                <IconButton 
                                  size="small" 
                                  onClick={() => handleStartEdit(group.sku, 'totalPrice', group.totalPrice)}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            )}
                          </TableCell>
                        </>
                      )}
                      
                      {/* Vendor Assignment - Always editable with custom vendor support */}
                      <TableCell>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                            <Autocomplete
                              freeSolo
                              size="small"
                              options={groupVendorOptionPool}
                              getOptionLabel={(option) => {
                                if (!option) return '';
                                if (typeof option === 'string') return option;
                                return option?.name || option?.label || '';
                              }}
                              filterOptions={(options, params) => {
                                const filtered = options.filter((option) => {
                                  if (!option) return false;
                                  const name = typeof option === 'string' ? option : (option?.name || option?.label || '');
                                  if (typeof name !== 'string') return false;
                                  return name.toLowerCase().includes(params.inputValue.toLowerCase());
                                });
                                // If inputValue doesn't match any option, add it as a new option
                                if (params.inputValue && !filtered.some(opt => {
                                  const optName = typeof opt === 'string' ? opt : (opt?.name || opt?.label || '');
                                  return optName.toLowerCase() === params.inputValue.toLowerCase();
                                })) {
                                  filtered.push({ name: params.inputValue });
                                }
                                return filtered;
                              }}
                              value={(() => {
                                try {
                                  if (!group.vendor) return null;
                                  const vendorName = typeof group.vendor === 'string' 
                                    ? group.vendor 
                                    : (group.vendor?.name || '');
                                  if (!vendorName) return null;
                                  
                                  const byId = groupVendorOptionPool.find(o => {
                                    if (!o || !o._id) return false;
                                    const vendorId = typeof group.vendor === 'object' && group.vendor._id 
                                      ? String(group.vendor._id) 
                                      : String(group.vendor);
                                    return String(o._id) === vendorId;
                                  });
                                  if (byId) return byId;
                                  
                                  const byName = groupVendorOptionPool.find(o => {
                                    if (!o) return false;
                                    const optName = o.name || o.label || '';
                                    if (typeof optName !== 'string') return false;
                                    return optName.toLowerCase() === vendorName.toLowerCase();
                                  });
                                  if (byName) return byName;
                                  
                                  return { name: vendorName };
                                } catch (e) {
                                  console.error('Error setting vendor value:', e);
                                  return null;
                                }
                              })()}
                              onChange={(e, newValue) =>
                                handleVendorSelection(
                                  group.orders[0]?.orderId,
                                  group.orders[0]?.itemId,
                                  newValue
                                )
                              }
                              renderInput={(params) => (
                                <TextField 
                                  {...params} 
                                  placeholder={group.autoDetectedVendor || "Assign or Type"} 
                                  variant="outlined"
                                  size="small"
                                  helperText={(group.autoDetectedVendor || suggestionCache[(group.sku||'').toUpperCase().trim()]) ? `Suggested: ${group.autoDetectedVendor || suggestionCache[(group.sku||'').toUpperCase().trim()]}` : ''}
                                  InputProps={{
                                    ...params.InputProps,
                                    endAdornment: (
                                      <>
                                        {params.InputProps.endAdornment}
                                        {(group.autoDetectedVendor || suggestionCache[(group.sku||'').toUpperCase().trim()]) && (
                                          <InputAdornment position="end">
                                            <IconButton
                                              size="small"
                                              color="success"
                                              aria-label="accept suggestion"
                                              onClick={() => {
                                                const orderId = group.orders?.[0]?.orderId;
                                                const itemId = group.orders?.[0]?.itemId;
                                                const vendorName = group.autoDetectedVendor || suggestionCache[(group.sku||'').toUpperCase().trim()];
                                                if (orderId && itemId && vendorName) {
                                                  handleAcceptVendor(orderId, itemId, vendorName);
                                                }
                                              }}
                                            >
                                              <CheckCircleIcon fontSize="small" />
                                            </IconButton>
                                          </InputAdornment>
                                        )}
                                      </>
                                    )
                                  }}
                                />
                              )}
                              sx={{ minWidth: 180, flex: 1 }}
                            />
                          </Box>
                          {/* Show all vendor suggestions with accept buttons */}
                          {Array.isArray(group.vendorSuggestions) && group.vendorSuggestions.length > 0 && !group.vendor && (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                              {group.vendorSuggestions.map((vendorName, idx) => {
                                const normalizedName = typeof vendorName === 'string' ? vendorName.trim() : '';
                                if (!normalizedName) return null;
                                return (
                                  <Chip
                                    key={`${normalizedName}-${idx}`}
                                    label={normalizedName}
                                    size="small"
                                    color="info"
                                    variant="outlined"
                                    onDelete={() => handleAcceptVendor(
                                      group.orders[0]?.orderId,
                                      group.orders[0]?.itemId,
                                      normalizedName
                                    )}
                                    deleteIcon={<CheckCircleIcon />}
                                    sx={{
                                      animation: 'pulse 2s infinite',
                                      '@keyframes pulse': {
                                        '0%, 100%': { opacity: 1 },
                                        '50%': { opacity: 0.7 },
                                      },
                                    }}
                                  />
                                );
                              })}
                            </Box>
                          )}
                          {/* Fallback: Show single autoDetectedVendor if no vendorSuggestions array */}
                          {(!Array.isArray(group.vendorSuggestions) || group.vendorSuggestions.length === 0) && group.autoDetectedVendor && !group.vendor && (
                            <Tooltip title={`Accept "${group.autoDetectedVendor}"`}>
                              <Chip
                                label={group.autoDetectedVendor}
                                size="small"
                                color="info"
                                variant="outlined"
                                onDelete={() => handleAcceptVendor(
                                  group.orders[0]?.orderId,
                                  group.orders[0]?.itemId,
                                  group.autoDetectedVendor
                                )}
                                deleteIcon={<CheckCircleIcon />}
                                sx={{
                                  mt: 0.5,
                                  animation: 'pulse 2s infinite',
                                  '@keyframes pulse': {
                                    '0%, 100%': { opacity: 1 },
                                    '50%': { opacity: 0.7 },
                                  },
                                }}
                              />
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      {/* Payment Status */}
                      <TableCell>
                        <Chip 
                          label={group.orders[0]?.paymentStatus || 'Pending'} 
                          size="small" 
                          color={
                            group.orders[0]?.paymentStatus === 'Paid' ? 'success' :
                            group.orders[0]?.paymentStatus === 'Partially_paid' ? 'warning' :
                            group.orders[0]?.paymentStatus === 'Failed' ? 'error' : 'default'
                          }
                        />
                      </TableCell>
                      
                      {/* Fulfillment Status */}
                      <TableCell>
                        <Chip 
                          label={group.orders[0]?.fulfillmentStatus || 'Unfulfilled'} 
                          size="small" 
                          color={
                            group.orders[0]?.fulfillmentStatus === 'Fulfilled' ? 'success' :
                            group.orders[0]?.fulfillmentStatus === 'Partially Fulfilled' ? 'warning' :
                            group.orders[0]?.fulfillmentStatus === 'Cancelled' ? 'error' : 'default'
                          }
                        />
                      </TableCell>
                      
                      {/* Actions Column */}
                      <TableCell>
                        <Tooltip title="View Processing History">
                          <IconButton 
                            size="small" 
                            color="primary"
                            onClick={() => handleViewHistory(group.sku)}
                          >
                            <HistoryIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit Order">
                          <IconButton 
                            size="small" 
                            color="secondary"
                            onClick={() => handleOpenOrderEditor(group.orders[0])}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>

                    {/* Expanded row showing individual orders */}
                    {group.isGrouped && (
                      <TableRow>
                        <TableCell colSpan={showPricing ? 16 : 13} style={{ paddingBottom: 0, paddingTop: 0 }}>
                          <Collapse in={expandedRows[group.sku]} timeout="auto" unmountOnExit>
                            <Box sx={{ margin: 2 }}>
                              <Typography variant="h6" gutterBottom component="div">
                                Order Details ({group.orders.length} orders)
                              </Typography>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell padding="checkbox">
                                      <Checkbox
                                        indeterminate={isGroupIndeterminate}
                                        checked={isGroupChecked}
                                        onChange={(e) => handleGroupSelect(group, e.target.checked)}
                                      />
                                    </TableCell>
                                    <TableCell>Order Name</TableCell>
                                    <TableCell>Customer</TableCell>
                                    <TableCell>Quantity</TableCell>
                                    <TableCell>Price</TableCell>
                                    <TableCell>Received Date</TableCell>
                                    <TableCell>Payment Status</TableCell>
                                    <TableCell>Fulfillment Status</TableCell>
                                    <TableCell>Assign Vendor</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {group.orders.map((order) => {
                                    const orderOptionPool = buildVendorOptionList(order.vendorSuggestions);
                                    return (
                                      <TableRow key={`${order.orderId}-${order.itemId}`}>
                                      <TableCell padding="checkbox">
                                        <Checkbox
                                          checked={selectedItems.some(
                                            item => item.orderId === order.orderId && item.itemId === order.itemId
                                          )}
                                          onChange={(e) => handleItemSelect(order.orderId, order.itemId, e.target.checked)}
                                        />
                                      </TableCell>
                                      <TableCell>
                                        <Typography variant="body2">
                                          {order.orderName}
                                          {order.orderId && (
                                            <Typography variant="caption" display="block" color="text.secondary">
                                              ID: {order.orderId}
                                            </Typography>
                                          )}
                                        </Typography>
                                        {order.sku && (
                                          <Box sx={{ mt: 0.5 }}>
                                            <PackComboSkuExpansion
                                              sku={order.sku}
                                              prefetchedSkus={order.individualSkus}
                                            />
                                          </Box>
                                        )}
                                      </TableCell>
                                      <TableCell>{order.customerName}</TableCell>
                                      <TableCell>{order.quantity}</TableCell>
                                      <TableCell>
                                        {typeof order.linePrice === 'number' ? (
                                          <Box>
                                            <Typography variant="body2">
                                              ₹{order.linePrice.toFixed(2)}
                                            </Typography>
                                            {typeof order.price === 'number' && (
                                              <Typography variant="caption" color="text.secondary">
                                                {order.quantity} × ₹{order.price.toFixed(2)}
                                              </Typography>
                                            )}
                                          </Box>
                                        ) : (
                                          <Typography variant="body2" color="text.secondary">-</Typography>
                                        )}
                                      </TableCell>
                                      <TableCell>{formatDate(order.receivedDate)}</TableCell>
                                      <TableCell>
                                        <Chip 
                                          label={order.paymentStatus || 'Pending'} 
                                          size="small" 
                                          color={
                                            order.paymentStatus === 'Paid' ? 'success' :
                                            order.paymentStatus === 'Partially_paid' ? 'warning' :
                                            order.paymentStatus === 'Failed' ? 'error' : 'default'
                                          }
                                        />
                                      </TableCell>
                                      <TableCell>
                                        <Chip 
                                          label={order.fulfillmentStatus || 'Unfulfilled'} 
                                          size="small" 
                                          color={
                                            order.fulfillmentStatus === 'Fulfilled' ? 'success' :
                                            order.fulfillmentStatus === 'Partially_fulfilled' ? 'warning' :
                                            order.fulfillmentStatus === 'Cancelled' ? 'error' : 'default'
                                          }
                                        />
                                      </TableCell>
                                      {/* Removed duplicate Remark Paid column in expanded table to avoid redundancy */}
                                      <TableCell>
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                          <Autocomplete
                                            freeSolo
                                            size="small"
                                            options={orderOptionPool}
                                            getOptionLabel={(option) => {
                                              if (!option) return '';
                                              if (typeof option === 'string') return option;
                                              return option?.name || option?.label || '';
                                            }}
                                            filterOptions={(options, params) => {
                                              const filtered = options.filter((option) => {
                                                if (!option) return false;
                                                const name = typeof option === 'string' ? option : (option?.name || option?.label || '');
                                                if (typeof name !== 'string') return false;
                                                return name.toLowerCase().includes(params.inputValue.toLowerCase());
                                              });
                                              // If inputValue doesn't match any option, add it as a new option
                                              if (params.inputValue && !filtered.some(opt => {
                                                const optName = typeof opt === 'string' ? opt : (opt?.name || opt?.label || '');
                                                return optName.toLowerCase() === params.inputValue.toLowerCase();
                                              })) {
                                                filtered.push({ name: params.inputValue });
                                              }
                                              return filtered;
                                            }}
                                            value={(() => {
                                              try {
                                                if (!order.vendor) return null;
                                                const vendorName = typeof order.vendor === 'string' 
                                                  ? order.vendor 
                                                  : (order.vendor?.name || '');
                                                if (!vendorName) return null;
                                                
                                                const byId = orderOptionPool.find(o => {
                                                  if (!o || !o._id) return false;
                                                  const vendorId = typeof order.vendor === 'object' && order.vendor._id 
                                                    ? String(order.vendor._id) 
                                                    : String(order.vendor);
                                                  return String(o._id) === vendorId;
                                                });
                                                if (byId) return byId;
                                                
                                                const byName = orderOptionPool.find(o => {
                                                  if (!o) return false;
                                                  const optName = o.name || o.label || '';
                                                  if (typeof optName !== 'string') return false;
                                                  return optName.toLowerCase() === vendorName.toLowerCase();
                                                });
                                                if (byName) return byName;
                                                
                                                return { name: vendorName };
                                              } catch (e) {
                                                console.error('Error setting vendor value:', e);
                                                return null;
                                              }
                                            })()}
                                            onChange={(e, newValue) =>
                                              handleVendorSelection(order.orderId, order.itemId, newValue)
                                            }
                                            renderInput={(params) => (
                                              <TextField 
                                                {...params} 
                                                placeholder={order.autoDetectedVendor || "Assign or Type"} 
                                                variant="outlined"
                                                helperText={(order.autoDetectedVendor || suggestionCache[(order.sku||'').toUpperCase().trim()]) ? `Suggested: ${order.autoDetectedVendor || suggestionCache[(order.sku||'').toUpperCase().trim()]}` : ''}
                                                InputProps={{
                                                  ...params.InputProps,
                                                  endAdornment: (
                                                    <>
                                                      {params.InputProps.endAdornment}
                                                      {(order.autoDetectedVendor || suggestionCache[(order.sku||'').toUpperCase().trim()]) && (
                                                        <InputAdornment position="end">
                                                          <IconButton
                                                            size="small"
                                                            color="success"
                                                            aria-label="accept suggestion"
                                                            onClick={() => {
                                                              const vendorName = order.autoDetectedVendor || suggestionCache[(order.sku||'').toUpperCase().trim()];
                                                              if (vendorName) handleAcceptVendor(order.orderId, order.itemId, vendorName);
                                                            }}
                                                          >
                                                            <CheckCircleIcon fontSize="small" />
                                                          </IconButton>
                                                        </InputAdornment>
                                                      )}
                                                    </>
                                                  )
                                                }}
                                              />
                                            )}
                                            sx={{ minWidth: 200 }}
                                          />
                                          {/* Show all vendor suggestions with accept buttons */}
                                          {Array.isArray(order.vendorSuggestions) && order.vendorSuggestions.length > 0 && !order.vendor && (
                                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                              {order.vendorSuggestions.map((vendorName, idx) => {
                                                const normalizedName = typeof vendorName === 'string' ? vendorName.trim() : '';
                                                if (!normalizedName) return null;
                                                return (
                                                  <Chip
                                                    key={`${normalizedName}-${idx}`}
                                                    label={normalizedName}
                                                    size="small"
                                                    color="info"
                                                    variant="outlined"
                                                    onDelete={() => handleAcceptVendor(
                                                      order.orderId,
                                                      order.itemId,
                                                      normalizedName
                                                    )}
                                                    deleteIcon={<CheckCircleIcon />}
                                                    sx={{
                                                      animation: 'pulse 2s infinite',
                                                      '@keyframes pulse': {
                                                        '0%, 100%': { opacity: 1 },
                                                        '50%': { opacity: 0.7 },
                                                      },
                                                    }}
                                                  />
                                                );
                                              })}
                                            </Box>
                                          )}
                                          {/* Fallback: Show single autoDetectedVendor if no vendorSuggestions array */}
                                          {(!Array.isArray(order.vendorSuggestions) || order.vendorSuggestions.length === 0) && order.autoDetectedVendor && !order.vendor && (
                                            <Tooltip title={`Accept "${order.autoDetectedVendor}"`}>
                                              <Chip
                                                label={order.autoDetectedVendor}
                                                size="small"
                                                color="info"
                                                variant="outlined"
                                                onDelete={() => handleAcceptVendor(
                                                  order.orderId,
                                                  order.itemId,
                                                  order.autoDetectedVendor
                                                )}
                                                deleteIcon={<CheckCircleIcon />}
                                                sx={{
                                                  animation: 'pulse 2s infinite',
                                                  '@keyframes pulse': {
                                                    '0%, 100%': { opacity: 1 },
                                                    '50%': { opacity: 0.7 },
                                                  },
                                                }}
                                              />
                                            </Tooltip>
                                          )}
                                        </Box>
                                      </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">
            No orders found in Initial stage
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Orders will appear here once they are fetched from Shopify
          </Typography>
        </Box>
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
            <MenuItem value="Processed">Processed</MenuItem>
          </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChangeStageDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={async () => {
              try {
                if (selectedItems.length === 0) {
                  setMessageDialog({ open: true, title: 'Warning', message: 'No items selected.' });
                  return;
                }

                // Use new endpoint to move items to target stage
                const response = await axios.post(`${API_BASE_URL}/orders/move-items-to-stage`, {
                  items: selectedItems,
                  targetStage: targetStage
                });

                const result = response.data;
                
                if (result.errors && result.errors.length > 0) {
                  setMessageDialog({ open: true, title: 'Partial Success', message: `Moved ${result.movedCount} items to ${targetStage}. Errors: ${result.errors.length}` });
                } else {
                  setMessageDialog({ open: true, title: 'Success', message: `Successfully moved ${result.movedCount} items to ${targetStage}` });
                }

                setSelectedItems([]);
                setChangeStageDialogOpen(false);
                queryClient.invalidateQueries(['orders']);
              } catch (error) {
                setMessageDialog({ open: true, title: 'Error', message: `Error changing stage: ${error.response?.data?.message || error.message}` });
              }
            }}
          >
            Move to {targetStage}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Manual Order Form */}
      {showManualOrder && (
        <ManualOrderForm
          open={showManualOrder}
          onClose={() => setShowManualOrder(false)}
        />
      )}

      {/* Bulk Order Import Dialog */}
      <BulkOrderImport
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImportComplete={(result) => {
          setImportDialogOpen(false);
          queryClient.invalidateQueries(['orders']);
          setMessageDialog({ open: true, title: 'Success', message: `Successfully imported ${result.created || 0} orders!` });
        }}
      />

      {/* Bulk Order Export Dialog */}
      <BulkOrderExport
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        orders={data?.orders || []}
        selectedItems={selectedItems}
      />

      {/* Email Schedule Dialog */}
      <Dialog open={emailScheduleDialogOpen} onClose={() => setEmailScheduleDialogOpen(false)}>
        <DialogTitle>Processed Orders Email Schedule</DialogTitle>
        <DialogContent>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1 }}>
            <Checkbox checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
            <Typography>Enabled</Typography>
          </Stack>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2 }}>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <TimePicker
                label="Schedule Time (IST)"
                value={(() => {
                  const base = parseInt(emailHour, 10) % 12;
                  const hh24 = emailAmPm === 'PM' ? (base === 12 ? 12 : base + 12) : (base === 12 ? 0 : base);
                  return dayjs(`1970-01-01T${String(hh24).padStart(2,'0')}:${String(emailMinute).padStart(2,'0')}`);
                })()}
                onChange={(newVal) => {
                  if (!newVal || !newVal.isValid()) return;
                  const h24 = dayjs(newVal).format('HH');
                  const mm = dayjs(newVal).format('mm');
                  const hNum = parseInt(h24, 10);
                  let ampm = 'AM';
                  let h12 = hNum;
                  if (hNum === 0) { h12 = 12; ampm = 'AM'; }
                  else if (hNum === 12) { h12 = 12; ampm = 'PM'; }
                  else if (hNum > 12) { h12 = hNum - 12; ampm = 'PM'; } else { ampm = 'AM'; }
                  setEmailHour(String(h12).padStart(2,'0'));
                  setEmailMinute(mm);
                  setEmailAmPm(ampm);
                }
                }
                ampm
                minutesStep={1}
                slotProps={{ textField: { size: 'small', sx: { minWidth: 220 } } }}
              />
            </LocalizationProvider>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailScheduleDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={async () => {
            const base = parseInt(emailHour, 10) % 12;
            const hh24 = emailAmPm === 'PM' ? (base === 12 ? 12 : base + 12) : (base === 12 ? 0 : base);
            const scheduleTime = `${String(hh24).padStart(2,'0')}:${String(emailMinute).padStart(2,'0')}`;
            try {
              await axios.post(`${API_BASE_URL}/settings/email`, { processedOrdersExport: { enabled: emailEnabled, scheduleTime } });
              setNotification({ open: true, message: `Schedule saved: ${emailHour}:${emailMinute} ${emailAmPm}`, severity: 'success' });
              setEmailScheduleDialogOpen(false);
            } catch (e) {
              setNotification({ open: true, message: 'Failed to save schedule', severity: 'error' });
            }
          }}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Create Vendor Dialog */}
      <Dialog open={createVendorDialogOpen} onClose={() => setCreateVendorDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Vendor</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Vendor Name *"
              value={newVendorName}
              onChange={(e) => setNewVendorName(e.target.value)}
              fullWidth
              required
            />
            <TextField
              label="Email"
              type="email"
              value={newVendorEmail}
              onChange={(e) => setNewVendorEmail(e.target.value)}
              fullWidth
            />
            <TextField
              label="Phone"
              value={newVendorPhone}
              onChange={(e) => setNewVendorPhone(e.target.value)}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setCreateVendorDialogOpen(false);
            setNewVendorName('');
            setNewVendorEmail('');
            setNewVendorPhone('');
          }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleCreateVendor}
            disabled={createVendorMutation.isLoading || !newVendorName.trim()}
          >
            {createVendorMutation.isLoading ? 'Creating...' : 'Create Vendor'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Order History Dialog */}
      <Dialog 
        open={historyDialogOpen} 
        onClose={() => setHistoryDialogOpen(false)} 
        maxWidth="lg" 
        fullWidth
      >
        <DialogTitle>
          Processed Orders History
          {selectedOrderHistory && selectedOrderHistory.sku && (
            <Typography variant="subtitle2" color="text.secondary">
              SKU: {selectedOrderHistory.sku}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            {/* Processed Orders History */}
            {loadingHistory ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
              </Box>
            ) : processedHistory && processedHistory.length > 0 ? (
              <TableContainer sx={{ 
                backgroundColor: (theme) => theme.palette.mode === 'dark' ? '#1e293b' : '#ffffff',
              }}>

                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Date (Processed)</strong></TableCell>
                      <TableCell><strong>SKU</strong></TableCell>
                      <TableCell><strong>Product Name</strong></TableCell>
                      <TableCell align="right"><strong>Quantity</strong></TableCell>
                      <TableCell align="right"><strong>Price</strong></TableCell>
                      <TableCell><strong>Vendor Name</strong></TableCell>
                      <TableCell><strong>Actions</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {processedHistory.map((record, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            {formatDateTime(record.processedAt)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Processed on
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <SKULink sku={record.itemSku} />
                        </TableCell>
                        <TableCell>
                          {record.productName}
                          {record.variantName && (
                            <Typography variant="caption" display="block" color="text.secondary">
                              {record.variantName}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">{record.quantity}</TableCell>
                        <TableCell align="right">
                          {record.price !== null && record.price !== undefined 
                            ? `₹${parseFloat(record.price).toFixed(2)}`
                            : '-'
                          }
                        </TableCell>
                        <TableCell>
                          <Chip label={record.vendorName || 'Unknown'} size="small" color="primary" />
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1}>
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<VisibilityIcon />}
                              onClick={() => {
                                // View details action - can be expanded later
                                setMessageDialog({ open: true, title: 'Info', message: `View details for ${record.productName} processed on ${formatDateTime(record.processedAt)}` });
                              }}
                            >
                              View
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Alert severity="info">No processed history found for this order</Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Order Editor Dialog */}
      <OrderEditor 
        open={orderEditorOpen}
        onClose={() => setOrderEditorOpen(false)}
        order={selectedOrderForEdit}
        onSave={handleOrderSaved}
      />

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

      <Snackbar
        open={notification.open}
        autoHideDuration={4000}
        onClose={handleNotificationClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleNotificationClose} severity={notification.severity} sx={{ width: '100%' }}>
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default InitialOrders;
