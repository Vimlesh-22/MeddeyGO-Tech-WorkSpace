import { useState, useEffect } from 'react';
import {
  Box,
  Drawer,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Chip,
  Divider,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  TextField,
  Button,
  Paper,
  Tooltip,
  Badge,
} from '@mui/material';
import {
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  Refresh as RefreshIcon,
  History as HistoryIcon,
  Business as BusinessIcon,
  ShoppingCart as ShoppingCartIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE_URL } from '../config';

const ActivityHistory = ({ open, onClose }) => {
  const [filterType, setFilterType] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [searchSku, setSearchSku] = useState('');
  const [limit, setLimit] = useState(50);

  // Fetch recent activities
  const { 
    data: activitiesData, 
    isLoading, 
    error, 
    refetch 
  } = useQuery({
    queryKey: ['activities', 'recent', limit, filterType, filterSeverity],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE_URL}/activities/recent`, {
        params: { limit }
      });
      let activities = response.data.activities || [];
      if (filterType !== 'all') {
        activities = activities.filter(activity => activity.type === filterType);
      }
      if (filterSeverity !== 'all') {
        activities = activities.filter(activity => activity.severity === filterSeverity);
      }
      return {
        ...response.data,
        activities
      };
    },
    enabled: open,
    refetchInterval: 30000,
    staleTime: 10000
  });

  // Fetch SKU-specific activities when searching
  const { data: skuActivitiesData, isLoading: skuLoading } = useQuery({
    queryKey: ['activities', 'sku', searchSku],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE_URL}/activities/sku/${encodeURIComponent(searchSku)}`);
      return response.data;
    },
    enabled: open && searchSku.length >= 3,
    staleTime: 10000
  });

  const formatDateTime = (dateStr) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const getActivityIcon = (type) => {
    switch (type) {
      case 'order_created': 
      case 'order_updated': 
      case 'stage_changed': 
        return <ShoppingCartIcon fontSize="small" />;
      case 'vendor_assigned': 
      case 'vendor_updated': 
        return <BusinessIcon fontSize="small" />;
      case 'export_generated': 
        return <HistoryIcon fontSize="small" />;
      default: 
        return <SettingsIcon fontSize="small" />;
    }
  };

  const getActivityColor = (type, severity) => {
    if (severity === 'critical') return 'error';
    if (severity === 'high') return 'warning';
    
    switch (type) {
      case 'order_created': return 'success';
      case 'stage_changed': return 'info';
      case 'vendor_assigned': return 'primary';
      case 'vendor_updated': return 'secondary';
      case 'pack_calculation_updated': return 'purple';
      default: return 'default';
    }
  };

  const getTypeLabel = (type) => {
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const activities = searchSku.length >= 3 
    ? (skuActivitiesData?.activities || []) 
    : (activitiesData?.activities || []);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: 400,
          maxWidth: '90vw'
        }
      }}
    >
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HistoryIcon />
          Activity History
          {activities.length > 0 && (
            <Badge badgeContent={activities.length} color="primary" />
          )}
        </Typography>
        <Box>
          <Tooltip title="Refresh">
            <IconButton onClick={refetch} disabled={isLoading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>
      
      <Divider />

      {/* Filters */}
      <Box sx={{ p: 2, borderBottom: (theme) => `1px solid ${theme.palette.divider}` }}>
        <Accordion defaultExpanded={false}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Filters</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Search by SKU"
                value={searchSku}
                onChange={(e) => setSearchSku(e.target.value)}
                placeholder="Enter SKU to search..."
                size="small"
                fullWidth
              />
              
              <FormControl size="small" fullWidth>
                <InputLabel>Activity Type</InputLabel>
                <Select
                  value={filterType}
                  label="Activity Type"
                  onChange={(e) => setFilterType(e.target.value)}
                >
                  <MenuItem value="all">All Types</MenuItem>
                  <MenuItem value="order_created">Order Created</MenuItem>
                  <MenuItem value="stage_changed">Stage Changed</MenuItem>
                  <MenuItem value="vendor_assigned">Vendor Assigned</MenuItem>
                  <MenuItem value="vendor_updated">Vendor Updated</MenuItem>
                  <MenuItem value="pack_calculation_updated">Pack Calculation</MenuItem>
                  <MenuItem value="export_generated">Export Generated</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel>Severity</InputLabel>
                <Select
                  value={filterSeverity}
                  label="Severity"
                  onChange={(e) => setFilterSeverity(e.target.value)}
                >
                  <MenuItem value="all">All Severities</MenuItem>
                  <MenuItem value="low">Low</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="high">High</MenuItem>
                  <MenuItem value="critical">Critical</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel>Limit</InputLabel>
                <Select
                  value={limit}
                  label="Limit"
                  onChange={(e) => setLimit(e.target.value)}
                >
                  <MenuItem value={25}>25 items</MenuItem>
                  <MenuItem value={50}>50 items</MenuItem>
                  <MenuItem value={100}>100 items</MenuItem>
                  <MenuItem value={200}>200 items</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </AccordionDetails>
        </Accordion>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {isLoading || skuLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Box sx={{ p: 2 }}>
            <Alert severity="error">
              Failed to load activities: {error.message}
            </Alert>
          </Box>
        ) : activities.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Alert severity="info">
              {searchSku ? `No activities found for SKU "${searchSku}"` : 'No activities found'}
            </Alert>
          </Box>
        ) : (
          <List dense>
            {activities.map((activity, index) => (
              <Box key={activity.id || index}>
                <ListItem sx={{ flexDirection: 'column', alignItems: 'stretch', py: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', width: '100%', mb: 1 }}>
                    <Box sx={{ mr: 1, mt: 0.5 }}>
                      {getActivityIcon(activity.type)}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Chip 
                          label={getTypeLabel(activity.type)}
                          size="small"
                          color={getActivityColor(activity.type, activity.severity)}
                          variant="outlined"
                        />
                        {activity.severity && activity.severity !== 'medium' && (
                          <Chip 
                            label={activity.severity.toUpperCase()}
                            size="small"
                            color={activity.severity === 'critical' || activity.severity === 'high' ? 'error' : 'warning'}
                          />
                        )}
                      </Box>
                      
                      <Typography variant="body2" fontWeight="medium" sx={{ mb: 0.5 }}>
                        {activity.title}
                      </Typography>
                      
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {activity.description}
                      </Typography>

                      {activity.metadata && (
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                          {activity.metadata.sku && (
                            <Chip label={`SKU: ${activity.metadata.sku}`} size="small" variant="outlined" />
                          )}
                          {activity.metadata.stage && (
                            <Chip label={`Stage: ${activity.metadata.stage}`} size="small" variant="outlined" />
                          )}
                          {activity.metadata.quantity && (
                            <Chip label={`Qty: ${activity.metadata.quantity}`} size="small" variant="outlined" />
                          )}
                        </Box>
                      )}

                      <Typography variant="caption" color="text.secondary">
                        {formatDateTime(activity.timestamp)}
                        {activity.orderId && (
                          <> • Order: {activity.orderId.orderName || activity.orderId.shopifyOrderName || 'Unknown'}</>
                        )}
                        {activity.vendorId && (
                          <> • Vendor: {activity.vendorId.name || 'Unknown'}</>
                        )}
                      </Typography>
                    </Box>
                  </Box>
                </ListItem>
                {index < activities.length - 1 && <Divider />}
              </Box>
            ))}
          </List>
        )}
      </Box>

      {/* Summary */}
      {activities.length > 0 && (
        <Paper sx={{ p: 2, m: 2, backgroundColor: 'grey.50' }}>
          <Typography variant="body2" color="text.secondary">
            Showing {activities.length} activities
            {searchSku && ` for SKU "${searchSku}"`}
          </Typography>
        </Paper>
      )}
    </Drawer>
  );
};

export default ActivityHistory;
