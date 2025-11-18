import { useState, useEffect } from 'react';
import { Box, AppBar, Toolbar, Typography, Container, Drawer, List, ListItem, ListItemIcon, ListItemText, ListItemButton, Button, Dialog, DialogTitle, DialogContent, DialogActions, Typography as MuiTypography, IconButton } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import {
  Inbox as InboxIcon,
  Pause as PauseIcon,
  CheckCircle as CheckCircleIcon,
  Pending as PendingIcon,
  Done as DoneIcon,
  Inventory as InventoryIcon,
  Category as CategoryIcon,
  CloudDownload as CloudDownloadIcon,
  Assessment as AssessmentIcon,
  History as HistoryIcon,
  Settings as SettingsIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  LocalShipping as LocalShippingIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { getApiBaseUrlDynamic, normalizeApiPath } from '../config';
import ActivityHistory from './ActivityHistory';
import NotificationHost from './NotificationHost';
import { useTheme } from '../contexts/ThemeContext';

const drawerWidth = 240;

const menuItems = [
  { text: 'Initial Orders', icon: <InboxIcon />, path: '/stages/initial' },
  { text: 'Hold Orders', icon: <PauseIcon />, path: '/stages/hold' },
  { text: 'Processed Orders', icon: <CheckCircleIcon />, path: '/stages/processed' },
  { text: 'Pending Orders', icon: <PendingIcon />, path: '/stages/pending' },
  { text: 'Fulfilled Orders', icon: <LocalShippingIcon />, path: '/stages/fulfilled' },
  { text: 'Completed Orders', icon: <DoneIcon />, path: '/stages/completed' },
  { text: 'In-Stock Orders', icon: <InventoryIcon />, path: '/stages/in-stock' },
  { text: 'Inventory Count', icon: <AssessmentIcon />, path: '/inventory-count' },
  { text: 'Products', icon: <CategoryIcon />, path: '/products' },
  { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
];

function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { theme, toggleTheme } = useTheme();
  const [activityHistoryOpen, setActivityHistoryOpen] = useState(false);
  const [notificationDialog, setNotificationDialog] = useState({ open: false, title: '', message: '', isLoading: false });

  // Global axios configuration to avoid double prefixes like /api/api/... or /_proxy/.../api/_proxy/.../api/...
  // Applies across all pages using Layout
  const getApiUrl = () => {
    try {
      const url = normalizeApiPath(getApiBaseUrlDynamic());
      return url || '/api';
    } catch (error) {
      console.error('[Layout] Error getting API URL:', error);
      return '/api';
    }
  };

  // Set default baseURL carefully; avoid setting it when base is a proxied or local /api base
  // Add interceptors to clear baseURL for absolute URLs
  useEffect(() => {
    const base = normalizeApiPath(getApiUrl());
    if (typeof base === 'string' && (base.startsWith('/_proxy/') || base === '/api')) {
      axios.defaults.baseURL = '';
    } else {
      axios.defaults.baseURL = base;
    }

    const reqInterceptor = axios.interceptors.request.use((config) => {
      const url = typeof config.url === 'string' ? normalizeApiPath(config.url) : '';
      const isAbsolute = url.startsWith('http') || url.startsWith('/_proxy/') || url.startsWith('/api/');
      if (url.startsWith('/_proxy/') || url.startsWith('/api/')) {
        config.baseURL = undefined;
      }
      if (!config.baseURL && !isAbsolute) {
        config.baseURL = normalizeApiPath(getApiUrl());
      }
      if (typeof config.baseURL === 'string') {
        const normalizedBase = normalizeApiPath(config.baseURL);
        // Avoid /api/api/... when both base and path include /api
        if (normalizedBase.endsWith('/api') && url.startsWith('/api/')) {
          config.baseURL = normalizedBase.replace(/\/api$/, '');
        } else {
          config.baseURL = normalizedBase;
        }
      }
      config.url = url;
      return config;
    }, (error) => Promise.reject(error));

    return () => {
      axios.interceptors.request.eject(reqInterceptor);
    };
  }, []);

  const handleFetchShopifyOrders = async () => {
    setNotificationDialog({ open: true, title: 'Fetching Orders', message: 'Fetching orders from Shopify...', isLoading: true });
    try {
      const apiBaseUrl = getApiUrl();
      // Use consolidated endpoint so all stores are handled server-side
      const resp = await axios.post(`${apiBaseUrl}/orders/fetch-all-shopify`);
      queryClient.invalidateQueries(['orders']);
      const results = resp?.data?.results || [];
      const summary = results.map(r => `${r.storeId}: ${r.processed}/${r.total} processed`).join('\n');
      const message = `Fetched orders from ${results.length} store(s)\n\n${summary}`;
      setNotificationDialog({ open: true, title: 'Success', message, isLoading: false });
    } catch (error) {
      setNotificationDialog({ open: true, title: 'Error', message: 'Failed to fetch orders from Shopify: ' + error.message, isLoading: false });
    }
  };

  const handleAutoMoveFulfilled = async () => {
    setNotificationDialog({ open: true, title: 'Auto-Move Fulfilled', message: 'Refreshing fulfillment and scanning orders...', isLoading: true });
    try {
      const apiBaseUrl = getApiUrl();
      // First, get all processed orders to get their IDs
      const resp = await axios.get(`${apiBaseUrl}/orders`, { params: { stage: 'Processed', limit: 5000 } });
      const ordersList = Array.isArray(resp.data?.orders) ? resp.data.orders : (Array.isArray(resp.data) ? resp.data : []);
      
      if (ordersList.length === 0) {
        setNotificationDialog({ open: true, title: 'Info', message: 'No processed orders found.', isLoading: false });
        return;
      }
      
      // Extract order IDs for refresh-fulfillment endpoint
      const orderIds = ordersList.map(order => order._id || order.orderId).filter(Boolean);
      
      // Refresh fulfillment status for all processed orders
      if (orderIds.length > 0) {
        await axios.post(`${apiBaseUrl}/orders/refresh-fulfillment`, { orderIds });
      }
      
      // Re-fetch orders after refresh to get updated fulfillment status
      const respAfterRefresh = await axios.get(`${apiBaseUrl}/orders`, { params: { stage: 'Processed', limit: 5000 } });
      const ordersListAfterRefresh = Array.isArray(respAfterRefresh.data?.orders) ? respAfterRefresh.data.orders : (Array.isArray(respAfterRefresh.data) ? respAfterRefresh.data : []);
      
      const items = [];
      for (const order of ordersListAfterRefresh) {
        const orderId = order._id || order.orderId;
        const list = Array.isArray(order.items) ? order.items : [];
        for (const it of list) {
          const status = (it.fulfillmentStatus || '').toLowerCase();
          if (status === 'fulfilled') {
            const itemId = it._id || it.itemId;
            if (orderId && itemId) items.push({ orderId, itemId });
          }
        }
      }

      if (items.length === 0) {
        setNotificationDialog({ open: true, title: 'Info', message: 'No fulfilled items found to move.', isLoading: false });
        return;
      }

      const moveResp = await axios.post(`${apiBaseUrl}/orders/move-items-to-stage`, { items, targetStage: 'Fulfilled' });
      const moved = moveResp.data?.movedCount || items.length;
      queryClient.invalidateQueries(['orders']);
      setNotificationDialog({ open: true, title: 'Success', message: `Moved ${moved} item(s) to Fulfilled.`, isLoading: false });
    } catch (error) {
      const err = error.response?.data?.message || error.message;
      setNotificationDialog({ open: true, title: 'Error', message: `Failed to auto-move: ${err}`, isLoading: false });
    }
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Shopify Order Management
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <IconButton
              onClick={toggleTheme}
              sx={{ 
                color: 'inherit',
                border: '1px solid',
                borderColor: 'divider',
                '&:hover': {
                  backgroundColor: 'action.hover',
                }
              }}
              aria-label="toggle theme"
            >
              {theme === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<HistoryIcon />}
              onClick={() => setActivityHistoryOpen(true)}
            >
              Activity History
            </Button>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<CloudDownloadIcon />}
            onClick={handleFetchShopifyOrders}
          >
            Fetch Shopify Orders
          </Button>
          <Button
            variant="outlined"
            color="inherit"
            startIcon={<LocalShippingIcon />}
            onClick={handleAutoMoveFulfilled}
          >
            Auto-Move Fulfilled
          </Button>
        </Box>
      </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {menuItems.map((item) => (
              <ListItem key={item.text} disablePadding>
                <ListItemButton
                  selected={location.pathname === item.path}
                  onClick={() => navigate(item.path)}
                >
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.text} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        {children}
      </Box>
      
      {/* Activity History Sidebar */}
      <ActivityHistory 
        open={activityHistoryOpen} 
        onClose={() => setActivityHistoryOpen(false)} 
      />

      {/* Notification Dialog for Shopify Fetch */}
      <Dialog open={notificationDialog.open} onClose={() => !notificationDialog.isLoading && setNotificationDialog({ ...notificationDialog, open: false })} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <MuiTypography component="span" variant="h6">{notificationDialog.title}</MuiTypography>
          {!notificationDialog.isLoading && (
            <IconButton size="small" onClick={() => setNotificationDialog({ ...notificationDialog, open: false })}>
              <CloseIcon />
            </IconButton>
          )}
        </DialogTitle>
        <DialogContent>
          <MuiTypography sx={{ whiteSpace: 'pre-line' }}>{notificationDialog.message}</MuiTypography>
        </DialogContent>
        {!notificationDialog.isLoading && (
          <DialogActions>
            <Button onClick={() => setNotificationDialog({ ...notificationDialog, open: false })} variant="contained">OK</Button>
          </DialogActions>
        )}
      </Dialog>

      {/* Global notifications host */}
      <NotificationHost />
    </Box>
  );
}

export default Layout;
