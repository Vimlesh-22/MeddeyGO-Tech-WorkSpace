import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Grid,
  Switch,
  Divider,
  Alert,
  Card,
  CardContent,
  Tabs,
  Tab,
  CircularProgress,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import FormControlLabel from '@mui/material/FormControlLabel';
import { Save as SaveIcon, Settings as SettingsIcon, Delete as DeleteIcon, Add as AddIcon, Email as EmailIcon, History as HistoryIcon } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { getApiBaseUrlDynamic } from '../config';
import Layout from '../components/Layout';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const parseRecipientList = (value = '') =>
  value
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function Settings() {
  const [tabValue, setTabValue] = useState(0);
  const [sheetsHeaders, setSheetsHeaders] = useState(null);
  const [sheetsMapping, setSheetsMapping] = useState(null);
  const [mappingHistory, setMappingHistory] = useState([]);
  const [vendorSettings, setVendorSettings] = useState({
    autoCreateVendors: true,
    autoMapSkus: true,
    requireApproval: false
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [timeSaved, setTimeSaved] = useState(false);
  const [vendorDirectoryForm, setVendorDirectoryForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: ''
  });
  const [vendorDirectoryMessage, setVendorDirectoryMessage] = useState(null);
  const [vendorDirectoryError, setVendorDirectoryError] = useState(null);
  
  // Local state for email settings to prevent blocking input
  const [emailRecipientsInput, setEmailRecipientsInput] = useState('');
  const [scheduleTimeInput, setScheduleTimeInput] = useState('04:00');
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [vendorRemindersEnabled, setVendorRemindersEnabled] = useState(false);
  const [salesTeamEnabled, setSalesTeamEnabled] = useState(false);
  const [globalTimeline, setGlobalTimeline] = useState(2);
  const [salesTeamEmailsInput, setSalesTeamEmailsInput] = useState('');
  const [newEmailInput, setNewEmailInput] = useState('');
  const [emailHistory, setEmailHistory] = useState([]);
  const [emailSuggestions, setEmailSuggestions] = useState([]);
  const [emailHistoryLoading, setEmailHistoryLoading] = useState(false);
  const [emailHistoryDialogOpen, setEmailHistoryDialogOpen] = useState(false);

  const recipientsSaveTimer = useRef(null);
  const recipientsInitialized = useRef(false);
  const scheduleTimeInitialized = useRef(false);
  const timelineSaveTimer = useRef(null);
  const timelineInitialized = useRef(false);

  const queryClient = useQueryClient();

  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      try {
        const response = await axios.get(`${getApiBaseUrlDynamic()}/settings`);
        return response.data;
      } catch (error) {
        if (error.response && error.response.status === 404) {
          return {
            vendor: {
              autoCreateVendors: true,
              autoMapSkus: true,
              requireApproval: false
            }
          };
        }
        throw error;
      }
    },
    onSuccess: (data) => {
      if (data && data.vendor) {
        setVendorSettings({
          autoCreateVendors: data.vendor.autoCreateVendors !== false,
          autoMapSkus: data.vendor.autoMapSkus !== false,
          requireApproval: data.vendor.requireApproval === true
        });
      }
      if (data && data.email) {
        setEmailEnabled(!!data.email.enabled);
        setVendorRemindersEnabled(!!data.email.vendorEnabled);
        setSalesTeamEnabled(!!data.email.salesTeamEnabled);
        setGlobalTimeline(Number(data.email.globalTimeline) || 2);
        timelineInitialized.current = true;
        const salesEmailsInit = Array.isArray(data.email.salesTeamEmails) ? data.email.salesTeamEmails : [];
        setSalesTeamEmailsInput(salesEmailsInit.join('\n'));
        if (data.email.processedOrdersExport) {
          const recipients = Array.isArray(data.email.processedOrdersExport.recipients) 
            ? data.email.processedOrdersExport.recipients 
            : [];
          setEmailRecipientsInput(recipients.join('\n'));
          setScheduleTimeInput(data.email.processedOrdersExport.scheduleTime || '04:00');
        } else {
          setEmailRecipientsInput('');
          setScheduleTimeInput('04:00');
        }
        recipientsInitialized.current = true;
        scheduleTimeInitialized.current = true;
      }
      setSettingsLoaded(true);
    }
  });

  // Ensure settings are always synced with database
  useEffect(() => {
    if (settingsData && settingsLoaded) {
      if (settingsData.vendor) {
        setVendorSettings({
          autoCreateVendors: settingsData.vendor.autoCreateVendors !== false,
          autoMapSkus: settingsData.vendor.autoMapSkus !== false,
          requireApproval: settingsData.vendor.requireApproval === true
        });
      }

      if (settingsData.email) {
        setEmailEnabled(!!settingsData.email.enabled);
        setVendorRemindersEnabled(!!settingsData.email.vendorEnabled);
        setSalesTeamEnabled(!!settingsData.email.salesTeamEnabled);
        setGlobalTimeline(Number(settingsData.email.globalTimeline) || 2);
        const salesEmailsInit = Array.isArray(settingsData.email.salesTeamEmails) ? settingsData.email.salesTeamEmails : [];
        setSalesTeamEmailsInput(salesEmailsInit.join('\n'));
        if (settingsData.email.processedOrdersExport) {
          const recipients = Array.isArray(settingsData.email.processedOrdersExport.recipients) 
            ? settingsData.email.processedOrdersExport.recipients 
            : [];
          setEmailRecipientsInput(recipients.join('\n'));
          setScheduleTimeInput(settingsData.email.processedOrdersExport.scheduleTime || '04:00');
        } else {
          setEmailRecipientsInput('');
          setScheduleTimeInput('04:00');
        }
      }
    }
  }, [settingsData, settingsLoaded]);


  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const response = await axios.post(`${getApiBaseUrlDynamic()}/settings`, data);
      return response.data;
    },
    onSuccess: (data) => {
      setSaveSuccess(true);
      setSaveError(null);
      setTimeout(() => setSaveSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      if (data && data.email && data.email.processedOrdersExport) {
        const recipients = Array.isArray(data.email.processedOrdersExport.recipients)
          ? data.email.processedOrdersExport.recipients
          : [];
        setEmailRecipientsInput(recipients.join('\n'));
        setScheduleTimeInput(data.email.processedOrdersExport.scheduleTime || '04:00');
      }
    },
    onError: (error) => {
      setSaveError(error.response?.data?.message || 'Failed to save settings');
      setSaveSuccess(false);
    }
  });

  const persistRecipients = useCallback(
    (recipientsArray) => {
      saveMutation.mutate({
        email: {
          ...settingsData?.email,
          processedOrdersExport: {
            ...settingsData?.email?.processedOrdersExport,
            recipients: recipientsArray,
          },
        },
      });
    },
    [saveMutation, settingsData?.email]
  );

  const handleAddEmail = useCallback(
    (rawEmail) => {
      const normalized = (rawEmail || '').trim();
      if (!normalized) {
        return;
      }

      if (!EMAIL_REGEX.test(normalized.toLowerCase())) {
        setSaveError('Please enter a valid email address');
        setTimeout(() => setSaveError(null), 3000);
        return;
      }

      const current = parseRecipientList(emailRecipientsInput);
      const exists = current.some(
        (email) => email.toLowerCase() === normalized.toLowerCase()
      );
      if (exists) {
        setNewEmailInput('');
        return;
      }

      const updated = [...current, normalized];
      setEmailRecipientsInput(updated.join('\n'));
      setNewEmailInput('');
      persistRecipients(updated);
    },
    [emailRecipientsInput, persistRecipients]
  );

  const handleRemoveEmail = useCallback(
    (emailToRemove) => {
      const normalized = (emailToRemove || '').trim().toLowerCase();
      if (!normalized) {
        return;
      }
      const current = parseRecipientList(emailRecipientsInput);
      const updated = current.filter(
        (email) => email.toLowerCase() !== normalized
      );
      setEmailRecipientsInput(updated.join('\n'));
      persistRecipients(updated);
    },
    [emailRecipientsInput, persistRecipients]
  );

  // Function to save email recipients with debouncing
  const saveEmailRecipients = useCallback((recipientsStr) => {
    // Clear existing timer
    if (recipientsSaveTimer.current) {
      clearTimeout(recipientsSaveTimer.current);
    }
    
    // Set new timer to save after 1 second of no typing
    recipientsSaveTimer.current = setTimeout(() => {
      const recipients = parseRecipientList(recipientsStr);
      persistRecipients(recipients);
    }, 1000);
  }, [persistRecipients]);
  
  // Function to save global timeline with debouncing
  const saveGlobalTimeline = useCallback((timeline) => {
    // Clear existing timer
    if (timelineSaveTimer.current) {
      clearTimeout(timelineSaveTimer.current);
    }
    
    // Set new timer to save after 1 second of no typing
    timelineSaveTimer.current = setTimeout(() => {
      saveMutation.mutate({ 
        email: { 
          ...settingsData?.email,
          globalTimeline: timeline
        } 
      });
    }, 1000);
  }, [settingsData?.email, saveMutation]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (recipientsSaveTimer.current) {
        clearTimeout(recipientsSaveTimer.current);
      }
      if (timelineSaveTimer.current) {
        clearTimeout(timelineSaveTimer.current);
      }
    };
  }, []);

  const { data: sheetVendorSuggestions = [], isLoading: vendorSuggestionsLoading } = useQuery({
    queryKey: ['sheet-vendor-suggestions'],
    queryFn: async () => {
      const response = await axios.get(`${getApiBaseUrlDynamic()}/settings/vendor-suggestions`);
      return response.data?.vendors || [];
    }
  });

  // Load DB vendors for quick-remove chips
  const { data: settingsDbVendors = [], isLoading: dbVendorsLoading } = useQuery({
    queryKey: ['settings-db-vendors'],
    queryFn: async () => {
      const response = await axios.get(`${getApiBaseUrlDynamic()}/vendors`);
      return response.data || [];
    }
  });

  

  const vendorDirectoryMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await axios.post(`${getApiBaseUrlDynamic()}/settings/vendor-directory/sync`, payload);
      return response.data;
    },
    onSuccess: (data) => {
      const summary = data?.summary || {};
      const message = `Created ${summary.created || 0}, updated ${summary.updated || 0}, removed ${summary.duplicatesRemoved || 0} duplicates`;
      setVendorDirectoryMessage(message);
      setVendorDirectoryError(null);
      setVendorDirectoryForm({ name: '', email: '', phone: '', address: '' });
      queryClient.invalidateQueries('sheet-vendor-suggestions');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries(['vendors']);
    },
    onError: (error) => {
      setVendorDirectoryError(error.response?.data?.message || 'Vendor directory update failed');
      setVendorDirectoryMessage(null);
    }
  });

  // Delete vendor mutation (quick remove from DB) with optimistic updates
  const deleteVendorMutation = useMutation({
    mutationFn: async (vendorId) => {
      const response = await axios.delete(`${getApiBaseUrlDynamic()}/vendors/${vendorId}`);
      return response.data;
    },
    onMutate: async (vendorId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries('settings-db-vendors');
      await queryClient.cancelQueries(['vendors']);
      
      // Snapshot the previous value
      const previousVendors = queryClient.getQueryData('settings-db-vendors');
      
      // Optimistically update the cache
      queryClient.setQueryData('settings-db-vendors', (old) => {
        if (!Array.isArray(old)) return old;
        return old.filter(v => v._id !== vendorId);
      });
      
      queryClient.setQueryData(['vendors'], (old) => {
        if (!Array.isArray(old)) return old;
        return old.filter(v => v._id !== vendorId);
      });
      
      // Return context with snapshot
      return { previousVendors };
    },
    onSuccess: (data, vendorId) => {
      // Invalidate and refetch to ensure consistency
      queryClient.invalidateQueries('settings-db-vendors');
      queryClient.invalidateQueries(['vendors']);
      // Also remove from any other vendor-related queries
      queryClient.removeQueries({ queryKey: ['vendors', vendorId] });
    },
    onError: (error, vendorId, context) => {
      // Rollback to previous state on error
      if (context?.previousVendors) {
        queryClient.setQueryData('settings-db-vendors', context.previousVendors);
      }
      queryClient.invalidateQueries('settings-db-vendors');
      queryClient.invalidateQueries(['vendors']);
      alert(`Failed to remove vendor: ${error.response?.data?.message || error.message}`);
    }
  });

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleVendorSettingChange = (event) => {
    const { name, checked } = event.target;
    const newSettings = {
      ...vendorSettings,
      [name]: checked
    };
    setVendorSettings(newSettings);
    
    // Save to database immediately for live updates
    saveMutation.mutate({
      vendor: newSettings
    });
  };

  const handleSaveSettings = () => {
    saveMutation.mutate({
      vendor: vendorSettings
    });
  };

  const handleVendorDirectoryInputChange = (field, value) => {
    setVendorDirectoryForm((prev) => ({
      ...prev,
      [field]: value
    }));
    setVendorDirectoryError(null);
  };

  const handleVendorDirectorySave = () => {
    if (!vendorDirectoryForm.name.trim()) {
      setVendorDirectoryError('Vendor name is required');
      setVendorDirectoryMessage(null);
      return;
    }

    vendorDirectoryMutation.mutate({
      vendorUpdates: [{
        name: vendorDirectoryForm.name.trim(),
        email: vendorDirectoryForm.email.trim(),
        phone: vendorDirectoryForm.phone.trim(),
        address: vendorDirectoryForm.address.trim()
      }],
      syncSheets: false,
      removeDuplicates: true
    });
  };

  const handleVendorSync = () => {
    vendorDirectoryMutation.mutate({
      syncSheets: true,
      removeDuplicates: true
    });
  };

  const handleVendorCleanup = () => {
    vendorDirectoryMutation.mutate({
      syncSheets: false,
      removeDuplicates: true
    });
  };

  const loadEmailHistory = async () => {
    setEmailHistoryLoading(true);
    try {
      const response = await axios.get(`${getApiBaseUrlDynamic()}/settings/email/history`);
      setEmailHistory(response.data?.history || []);
    } catch (error) {
      console.error('Failed to load email history:', error);
      setEmailHistory([]);
    } finally {
      setEmailHistoryLoading(false);
    }
  };

  const loadEmailSuggestions = async () => {
    try {
      const response = await axios.get(`${getApiBaseUrlDynamic()}/settings/email/suggestions`);
      const suggestions = Array.isArray(response.data?.suggestions) ? response.data.suggestions : [];
      setEmailSuggestions(suggestions);
    } catch (error) {
      console.error('Failed to load email suggestions:', error);
      setEmailSuggestions([]);
    }
  };

  return (
    <Layout>
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
          <SettingsIcon sx={{ mr: 1 }} />
          System Settings
        </Typography>

        <Paper sx={{ mt: 3 }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={tabValue} onChange={handleTabChange} aria-label="settings tabs">
              <Tab label="Vendor Settings" />
              <Tab label="Sheets Mapping" />
              <Tab label="Reminders" />
              <Tab label="Notifications" disabled />
            </Tabs>
          </Box>

          <TabPanel value={tabValue} index={0}>
            {isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
              </Box>
            ) : (
              <>
                <Typography variant="h6" gutterBottom>
                  Vendor Management Settings
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Configure how vendors are created and managed throughout the system.
                </Typography>

                <Card variant="outlined" sx={{ mb: 3 }}>
                  <CardContent>
                    <Grid container spacing={2}>
                      <Grid item xs={12}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={vendorSettings.autoCreateVendors}
                              onChange={handleVendorSettingChange}
                              name="autoCreateVendors"
                              color="primary"
                            />
                          }
                          label="Automatically create vendors from Google Sheets"
                        />
                        <Typography variant="caption" color="text.secondary" display="block">
                          When enabled, new vendors will be automatically created from the Master Needs sheet.
                        </Typography>
                      </Grid>

                      <Grid item xs={12}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={vendorSettings.autoMapSkus}
                              onChange={handleVendorSettingChange}
                              name="autoMapSkus"
                              color="primary"
                            />
                          }
                          label="Automatically map SKUs to vendors"
                        />
                        <Typography variant="caption" color="text.secondary" display="block">
                          When enabled, SKUs will be automatically mapped to vendors when detected.
                        </Typography>
                      </Grid>

                      <Grid item xs={12}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={vendorSettings.requireApproval}
                              onChange={handleVendorSettingChange}
                              name="requireApproval"
                              color="primary"
                            />
                          }
                          label="Require approval for vendor suggestions"
                        />
                        <Typography variant="caption" color="text.secondary" display="block">
                          When enabled, vendor suggestions must be manually approved before being applied.
                        </Typography>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>

                <Card variant="outlined" sx={{ mb: 3 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Vendor Directory Tools
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Keep vendor names in sync with Google Sheets and capture additional contact details here.
                    </Typography>

                    <Grid container spacing={2} sx={{ mt: 1 }}>
                      <Grid item xs={12} md={6}>
                        <Typography variant="subtitle2" gutterBottom>
                          Google Sheets Suggestions
                        </Typography>
                        {vendorSuggestionsLoading ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CircularProgress size={18} />
                            <Typography variant="body2">Loading suggestions...</Typography>
                          </Box>
                        ) : sheetVendorSuggestions.length > 0 ? (
                          <Box
                            sx={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 1,
                              maxHeight: 180,
                              overflowY: 'auto',
                              p: 1,
                              border: (theme) => `1px solid ${theme.palette.divider}`,
                              borderRadius: 1
                            }}
                          >
                            {sheetVendorSuggestions.map((name) => (
                              <Chip key={name} label={name} size="small" />
                            ))}
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            No vendor names detected in the linked sheet yet.
                          </Typography>
                        )}
                      </Grid>

                      <Grid item xs={12} md={6}>
                        <Typography variant="subtitle2" gutterBottom>
                          Add / Update Vendor Details
                        </Typography>
                        <Grid container spacing={1}>
                          <Grid item xs={12}>
                            <TextField
                              fullWidth
                              label="Vendor Name"
                              required
                              value={vendorDirectoryForm.name}
                              onChange={(e) => handleVendorDirectoryInputChange('name', e.target.value)}
                            />
                          </Grid>
                          <Grid item xs={12}>
                            <TextField
                              fullWidth
                              label="Email"
                              type="email"
                              value={vendorDirectoryForm.email}
                              onChange={(e) => handleVendorDirectoryInputChange('email', e.target.value)}
                            />
                          </Grid>
                          <Grid item xs={12}>
                            <TextField
                              fullWidth
                              label="Phone"
                              value={vendorDirectoryForm.phone}
                              onChange={(e) => handleVendorDirectoryInputChange('phone', e.target.value)}
                            />
                          </Grid>
                          <Grid item xs={12}>
                            <TextField
                              fullWidth
                              label="Address"
                              multiline
                              rows={2}
                              value={vendorDirectoryForm.address}
                              onChange={(e) => handleVendorDirectoryInputChange('address', e.target.value)}
                            />
                          </Grid>
                        </Grid>
                      </Grid>

                      {/* DB Vendors quick remove */}
                      <Grid item xs={12}>
                        <Divider sx={{ my: 2 }} />
                        <Typography variant="subtitle2" gutterBottom>
                          Database Vendors
                        </Typography>
                        {dbVendorsLoading ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CircularProgress size={18} />
                            <Typography variant="body2">Loading vendors...</Typography>
                          </Box>
                        ) : settingsDbVendors.length > 0 ? (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, maxHeight: 240, overflowY: 'auto', p: 1, border: (theme) => `1px solid ${theme.palette.divider}`, borderRadius: 1 }}>
                            {settingsDbVendors.map((v) => (
                              <Chip
                                key={v._id}
                                label={v.name}
                                onDelete={() => {
                                  if (window.confirm(`Remove vendor "${v.name}" from database? This will unassign it from orders.`)) {
                                    deleteVendorMutation.mutate(v._id);
                                  }
                                }}
                                sx={{ mr: 0.5 }}
                              />
                            ))}
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.secondary">No vendors in database yet.</Typography>
                        )}
                      </Grid>
                    </Grid>

                    {vendorDirectoryMessage && (
                      <Alert severity="success" sx={{ mt: 2 }}>
                        {vendorDirectoryMessage}
                      </Alert>
                    )}

                    {vendorDirectoryError && (
                      <Alert severity="error" sx={{ mt: 2 }}>
                        {vendorDirectoryError}
                      </Alert>
                    )}

                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
                      <Button
                        variant="contained"
                        onClick={handleVendorDirectorySave}
                        disabled={vendorDirectoryMutation.isLoading}
                      >
                        {vendorDirectoryMutation.isLoading ? 'Saving...' : 'Save Vendor Details'}
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={handleVendorSync}
                        disabled={vendorDirectoryMutation.isLoading}
                      >
                        Sync From Google Sheets
                      </Button>
                      <Button
                        variant="outlined"
                        color="warning"
                        onClick={handleVendorCleanup}
                        disabled={vendorDirectoryMutation.isLoading}
                      >
                        Remove Duplicates
                      </Button>
                    </Box>
                  </CardContent>
                </Card>

                {saveSuccess && (
                  <Alert severity="success" sx={{ mb: 2 }}>
                    Settings saved successfully!
                  </Alert>
                )}

                {saveError && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {saveError}
                  </Alert>
                )}

                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<SaveIcon />}
                  onClick={() => {
                    const recipients = emailRecipientsInput.split('\n').map(s => s.trim()).filter(Boolean);
                    const salesEmails = salesTeamEmailsInput.split('\n').map(s => s.trim()).filter(Boolean);
                    const payload = {
                      vendor: vendorSettings,
                      email: {
                        enabled: emailEnabled,
                        vendorEnabled: vendorRemindersEnabled,
                        salesTeamEnabled: salesTeamEnabled,
                        globalTimeline: globalTimeline,
                        salesTeamEmails: salesEmails,
                        processedOrdersExport: {
                          enabled: settingsData?.email?.processedOrdersExport?.enabled !== false,
                          recipients: recipients,
                          scheduleTime: scheduleTimeInput
                        }
                      }
                    };
                    saveMutation.mutate(payload);
                  }}
                  disabled={saveMutation.isLoading}
                >
                  {saveMutation.isLoading ? 'Saving...' : 'Save Settings'}
                </Button>
              </>
            )}
          </TabPanel>

          {/* Sheets Mapping */}
          <TabPanel value={tabValue} index={1}>
            <Typography variant="h6" gutterBottom>
              Google Sheets Header Mapping
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Map required fields to your sheet headers. Saved mapping persists until changed and can be restored.
            </Typography>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Button
                variant="outlined"
                onClick={async () => {
                  const base = getApiBaseUrlDynamic();
                  const [hdrs, mapResp] = await Promise.all([
                    axios.get(`${base}/settings/sheets/headers`),
                    axios.get(`${base}/settings/sheets/mapping`)
                  ]);
                  setSheetsHeaders(hdrs.data?.sheets || null);
                  setSheetsMapping(mapResp.data?.mapping || null);
                  setMappingHistory(mapResp.data?.history || []);
                }}
              >
                Load Headers & Current Mapping
              </Button>
              <Button
                variant="outlined"
                onClick={async () => {
                  const resp = await axios.post(`${getApiBaseUrlDynamic()}/settings/sheets/mapping/restore`, { defaultMapping: true });
                  setSheetsMapping(resp.data?.mapping || null);
                }}
              >
                Restore Default
              </Button>
            </Box>

            {sheetsMapping && (
              <>
                <Card variant="outlined" sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>Pack (Master Needs) Mapping</Typography>
                    <Grid container spacing={2}>
                      {Object.entries(sheetsMapping.requiredFields?.pack || {}).map(([field, value]) => (
                        <Grid item xs={12} md={4} key={field}>
                          <TextField
                            fullWidth
                            label={`${field}`}
                            value={value}
                            onChange={(e) => setSheetsMapping(prev => ({
                              ...prev,
                              requiredFields: {
                                ...prev.requiredFields,
                                pack: { ...prev.requiredFields.pack, [field]: e.target.value }
                              }
                            }))}
                            helperText={Array.isArray(sheetsHeaders?.pack?.headersDetailed) ? `Available: ${sheetsHeaders.pack.headersDetailed.map(h => `${h.letter}:${h.name}`).join(', ')}` : ''}
                          />
                        </Grid>
                      ))}
                    </Grid>
                  </CardContent>
                </Card>

                <Card variant="outlined" sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>Pack Products Mapping</Typography>
                    <Grid container spacing={2}>
                      {Object.entries(sheetsMapping.requiredFields?.packProducts || {}).map(([field, value]) => (
                        <Grid item xs={12} md={4} key={`packProducts-${field}`}>
                          <TextField
                            fullWidth
                            label={`${field}`}
                            value={value}
                            onChange={(e) => setSheetsMapping(prev => ({
                              ...prev,
                              requiredFields: {
                                ...prev.requiredFields,
                                packProducts: { ...prev.requiredFields.packProducts, [field]: e.target.value }
                              }
                            }))}
                            helperText={Array.isArray(sheetsHeaders?.packProducts?.headersDetailed) ? `Available: ${sheetsHeaders.packProducts.headersDetailed.map(h => `${h.letter}:${h.name}`).join(', ')}` : ''}
                          />
                        </Grid>
                      ))}
                    </Grid>
                  </CardContent>
                </Card>

                <Card variant="outlined" sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>Combo Products Mapping</Typography>
                    <Grid container spacing={2}>
                      {Object.entries(sheetsMapping.requiredFields?.comboProducts || {}).map(([field, value]) => (
                        <Grid item xs={12} md={4} key={`comboProducts-${field}`}>
                          <TextField
                            fullWidth
                            label={`${field}`}
                            value={value}
                            onChange={(e) => setSheetsMapping(prev => ({
                              ...prev,
                              requiredFields: {
                                ...prev.requiredFields,
                                comboProducts: { ...prev.requiredFields.comboProducts, [field]: e.target.value }
                              }
                            }))}
                            helperText={Array.isArray(sheetsHeaders?.comboProducts?.headersDetailed) ? `Available: ${sheetsHeaders.comboProducts.headersDetailed.map(h => `${h.letter}:${h.name}`).join(', ')}` : ''}
                          />
                        </Grid>
                      ))}
                    </Grid>
                  </CardContent>
                </Card>

                <Card variant="outlined" sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>Okhla Inventory Mapping</Typography>
                    <Grid container spacing={2}>
                      {Object.entries(sheetsMapping.requiredFields?.okhlaInventory || {}).map(([field, value]) => (
                        <Grid item xs={12} md={4} key={`okhla-${field}`}>
                          <TextField
                            fullWidth
                            label={`${field}`}
                            value={value}
                            onChange={(e) => setSheetsMapping(prev => ({
                              ...prev,
                              requiredFields: {
                                ...prev.requiredFields,
                                okhlaInventory: { ...prev.requiredFields.okhlaInventory, [field]: e.target.value }
                              }
                            }))}
                            helperText={Array.isArray(sheetsHeaders?.okhlaInventory?.headersDetailed) ? `Available: ${sheetsHeaders.okhlaInventory.headersDetailed.map(h => `${h.letter}:${h.name}`).join(', ')}` : ''}
                          />
                        </Grid>
                      ))}
                    </Grid>
                  </CardContent>
                </Card>

                <Card variant="outlined" sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>Bahadurgarh Inventory Mapping</Typography>
                    <Grid container spacing={2}>
                      {Object.entries(sheetsMapping.requiredFields?.bahadurgarhInventory || {}).map(([field, value]) => (
                        <Grid item xs={12} md={4} key={`bahadurgarh-${field}`}>
                          <TextField
                            fullWidth
                            label={`${field}`}
                            value={value}
                            onChange={(e) => setSheetsMapping(prev => ({
                              ...prev,
                              requiredFields: {
                                ...prev.requiredFields,
                                bahadurgarhInventory: { ...prev.requiredFields.bahadurgarhInventory, [field]: e.target.value }
                              }
                            }))}
                            helperText={Array.isArray(sheetsHeaders?.bahadurgarhInventory?.headersDetailed) ? `Available: ${sheetsHeaders.bahadurgarhInventory.headersDetailed.map(h => `${h.letter}:${h.name}`).join(', ')}` : ''}
                          />
                        </Grid>
                      ))}
                    </Grid>
                  </CardContent>
                </Card>

                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    onClick={async () => {
                      await axios.post(`${API_BASE_URL}/settings/sheets/mapping`, { mapping: sheetsMapping, label: 'manual-update' });
                      alert('Mapping saved');
                    }}
                  >
                    Save Mapping
                  </Button>
                </Box>

                {mappingHistory?.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2">Previous Versions</Typography>
                    <Grid container spacing={1} sx={{ mt: 1 }}>
                      {mappingHistory.map((h, idx) => (
                        <Grid item key={idx}>
                          <Button size="small" variant="outlined" onClick={async () => {
                            await axios.post(`${getApiBaseUrlDynamic()}/settings/sheets/mapping/restore`, { historyIndex: idx });
                            const mapResp = await axios.get(`${getApiBaseUrlDynamic()}/settings/sheets/mapping`);
                            setSheetsMapping(mapResp.data?.mapping || null);
                            setMappingHistory(mapResp.data?.history || []);
                          }}>
                            Restore #{idx + 1} {h.label ? `(${h.label})` : ''}
                          </Button>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                )}
              </>
            )}
          </TabPanel>

          {/* Reminders Settings */}
          <TabPanel value={tabValue} index={2}>
            {isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
              </Box>
            ) : (
            <>
              <Typography variant="h6" gutterBottom>Email & Reminder Settings</Typography>
              <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>Email Configuration</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <FormControlLabel 
                      control={
                        <Switch 
                          checked={emailEnabled} 
                          onChange={(e) => {
                            setEmailEnabled(e.target.checked);
                            // Save immediately
                            saveMutation.mutate({ 
                              email: { 
                                ...settingsData?.email,
                                enabled: e.target.checked
                              } 
                            });
                          }} 
                        />
                      } 
                      label="Enable Email Notifications" 
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <FormControlLabel 
                      control={
                        <Switch 
                          checked={vendorRemindersEnabled} 
                          onChange={(e) => {
                            setVendorRemindersEnabled(e.target.checked);
                            // Save immediately
                            saveMutation.mutate({ 
                              email: { 
                                ...settingsData?.email,
                                vendorEnabled: e.target.checked
                              } 
                            });
                          }} 
                        />
                      } 
                      label="Enable Vendor Reminders" 
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <FormControlLabel 
                      control={
                        <Switch 
                          checked={salesTeamEnabled} 
                          onChange={(e) => {
                            setSalesTeamEnabled(e.target.checked);
                            // Save immediately
                            saveMutation.mutate({ 
                              email: { 
                                ...settingsData?.email,
                                salesTeamEnabled: e.target.checked
                              } 
                            });
                          }} 
                        />
                      } 
                      label="Enable Sales Team Reminders" 
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField 
                      fullWidth 
                      type="number" 
                      label="Reminder Timeline (Days)" 
                      value={globalTimeline} 
                      onChange={(e) => {
                        const newValue = Number(e.target.value);
                        setGlobalTimeline(newValue);
                        // Save with debouncing (after 1 second of no typing)
                        if (timelineInitialized.current) {
                          saveGlobalTimeline(newValue);
                        }
                      }}
                      onBlur={(e) => {
                        // Clear any pending timer and save immediately when user leaves the field
                        if (timelineSaveTimer.current) {
                          clearTimeout(timelineSaveTimer.current);
                        }
                        const currentValue = Number(e.target.value);
                        saveMutation.mutate({ 
                          email: { 
                            ...settingsData?.email,
                            globalTimeline: currentValue
                          } 
                        });
                      }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField 
                      fullWidth 
                      multiline 
                      rows={3} 
                      label="Sales Team Emails (one per line)" 
                      value={salesTeamEmailsInput} 
                      onChange={(e) => {
                        setSalesTeamEmailsInput(e.target.value);
                        // Save with debouncing
                        const emails = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
                        saveMutation.mutate({ 
                          email: { 
                            ...settingsData?.email,
                            salesTeamEmails: emails
                          } 
                        });
                      }}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            <Card variant="outlined" sx={{ mb: 2, mt: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>Processed Orders Export & Auto-Move</Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Configure automatic email export of processed orders and scheduled auto-move from Pending to Processed.
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <FormControlLabel
                      control={
                        <Switch 
                        checked={settingsData?.email?.processedOrdersExport?.enabled !== false} 
                          onChange={(e) => saveMutation.mutate({ 
                            email: { 
                              ...settingsData?.email,
                              processedOrdersExport: {
                                ...settingsData?.email?.processedOrdersExport,
                                enabled: e.target.checked
                              }
                            } 
                          })} 
                        />
                      }
                      label="Enable Processed Orders Email Export"
                    />
                    <Typography variant="caption" color="text.secondary" display="block">
                      When enabled, Excel export will be emailed before moving processed orders to Pending.
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>
                      Export Recipient Emails
                    </Typography>
                    <Box sx={{ mb: 2 }}>
                      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                        <TextField
                          size="small"
                          placeholder="Enter email address"
                          value={newEmailInput}
                          onChange={(e) => setNewEmailInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const value = (newEmailInput || '').trim();
                              if (value) {
                                handleAddEmail(value);
                              }
                            }
                          }}
                          sx={{ flex: 1 }}
                        />
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<AddIcon />}
                          onClick={() => {
                            if (newEmailInput.trim()) {
                              handleAddEmail(newEmailInput.trim());
                            }
                          }}
                          disabled={!newEmailInput.trim() || saveMutation.isLoading}
                        >
                          Add
                        </Button>
                      </Box>
                      {Array.isArray(settingsData?.email?.processedOrdersExport?.recipients) && settingsData?.email?.processedOrdersExport?.recipients.length > 0 && (
                        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}>
                          {settingsData?.email?.processedOrdersExport?.recipients.map((email, idx) => (
                            <Chip
                              key={idx}
                              label={email}
                              onDelete={() => handleRemoveEmail(email)}
                              sx={{ m: 0.5 }}
                              deleteIcon={<DeleteIcon />}
                            />
                          ))}
                        </Box>
                      )}
                      {emailSuggestions.length > 0 && (
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                            Suggestions
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {emailSuggestions.map((sug, idx) => (
                              <Chip
                                key={`${sug}-${idx}`}
                                label={sug}
                                variant="outlined"
                                onClick={() => handleAddEmail(sug)}
                                sx={{ cursor: 'pointer' }}
                              />
                            ))}
                          </Box>
                        </Box>
                      )}
                    </Box>
                    <TextField 
                      fullWidth 
                      multiline 
                      rows={3} 
                      label="Or paste multiple emails (one per line)" 
                      value={emailRecipientsInput} 
                      onChange={(e) => {
                        const newValue = e.target.value;
                        setEmailRecipientsInput(newValue);
                        // Save with debouncing (after 1 second of no typing)
                        if (recipientsInitialized.current) {
                          saveEmailRecipients(newValue);
                        }
                      }}
                      onBlur={(e) => {
                        // Clear any pending timer and save immediately when user leaves the field
                        if (recipientsSaveTimer.current) {
                          clearTimeout(recipientsSaveTimer.current);
                        }
                        const currentValue = e.target.value;
                        const recipients = currentValue.split('\n').map(s => s.trim()).filter(Boolean);
                        saveMutation.mutate({ 
                          email: { 
                            ...settingsData?.email,
                            processedOrdersExport: {
                              ...settingsData?.email?.processedOrdersExport,
                              recipients: recipients
                            }
                          } 
                        });
                      }}
                      helperText="Email addresses that will receive processed orders Excel export. You can add individually above or paste multiple (one per line). Auto-saves after 1 second of no typing."
                      placeholder="user1@example.com&#10;user2@example.com" 
                      disabled={saveMutation.isLoading} 
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LocalizationProvider dateAdapter={AdapterDayjs}>
                        <TimePicker
                        label="Auto-Move Schedule Time (IST)"
                          value={dayjs(`1970-01-01T${scheduleTimeInput || '04:00'}`)}
                          onChange={(newVal) => {
                            if (!newVal || !newVal.isValid()) return;
                            const formatted = dayjs(newVal).format('HH:mm');
                            setScheduleTimeInput(formatted);
                            if (scheduleTimeInitialized.current) {
                              saveMutation.mutate({
                              email: {
                                ...settingsData?.email,
                                processedOrdersExport: {
                                  ...settingsData?.email?.processedOrdersExport,
                                  scheduleTime: formatted
                                }
                              }
                            }, {
                                onSuccess: () => {
                                  setSaveSuccess(true);
                                  setTimeSaved(true);
                                  setTimeout(() => {
                                    setSaveSuccess(false);
                                    setTimeSaved(false);
                                  }, 2000);
                                }
                              });
                            }
                          }}
                          ampm
                          minutesStep={1}
                          slotProps={{ textField: { fullWidth: true, size: 'small', helperText: 'Select time using clock (IST). Auto-saves instantly.', disabled: saveMutation.isLoading } }}
                        />
                      </LocalizationProvider>
                      {timeSaved && (
                        <Chip 
                          label="Saved" 
                          size="small" 
                          color="success" 
                          sx={{ mt: 1 }}
                        />
                      )}
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            {/* Email History Section */}
            <Card variant="outlined" sx={{ mb: 2, mt: 2 }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle1">Email History</Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<HistoryIcon />}
                    onClick={() => {
                      setEmailHistoryDialogOpen(true);
                      loadEmailHistory();
                      loadEmailSuggestions();
                    }}
                  >
                    View History
                  </Button>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  View all sent processed orders export emails with timestamps, recipients, and order counts.
                </Typography>
              </CardContent>
            </Card>
            
            <Box sx={{ mt: 2 }}>
              <Button
                variant="contained"
                onClick={async () => {
                  try {
                    const emailSettings = await axios.get(`${getApiBaseUrlDynamic()}/settings/email`);
                    setSaveSuccess(true);
                    queryClient.invalidateQueries({ queryKey: ['settings'] });
                  } catch (error) {
                    setSaveError('Failed to load email settings');
                  }
                }}
              >
                Load Settings
              </Button>
            </Box>

            <Box sx={{ mt: 3 }}>
              <Button
                variant="contained"
                color="primary"
                startIcon={<SaveIcon />}
                onClick={() => {
                  const recipients = emailRecipientsInput.split('\n').map(s => s.trim()).filter(Boolean);
                  const salesEmails = salesTeamEmailsInput.split('\n').map(s => s.trim()).filter(Boolean);
                  const payload = {
                    email: {
                      enabled: emailEnabled,
                      vendorEnabled: vendorRemindersEnabled,
                      salesTeamEnabled: salesTeamEnabled,
                      globalTimeline: globalTimeline,
                      salesTeamEmails: salesEmails,
                      processedOrdersExport: {
                        enabled: settingsData?.email?.processedOrdersExport?.enabled !== false,
                        recipients: recipients,
                        scheduleTime: scheduleTimeInput
                      }
                    }
                  };
                  saveMutation.mutate(payload);
                }}
                disabled={saveMutation.isLoading}
              >
                {saveMutation.isLoading ? 'Saving...' : 'Save Email & Timeline Settings'}
              </Button>
            </Box>

            {saveSuccess && (
              <Alert severity="success" sx={{ mt: 2 }}>
                Settings saved successfully!
              </Alert>
            )}

            {saveError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {saveError}
              </Alert>
            )}

            {/* Email History Dialog */}
            <Dialog
              open={emailHistoryDialogOpen}
              onClose={() => setEmailHistoryDialogOpen(false)}
              maxWidth="md"
              fullWidth
            >
              <DialogTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <EmailIcon />
                  <Typography variant="h6">Email History</Typography>
                </Box>
              </DialogTitle>
              <DialogContent>
                {emailHistoryLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                    <CircularProgress />
                  </Box>
                ) : emailHistory.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                    No email history found.
                  </Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Date & Time</TableCell>
                          <TableCell>Recipients</TableCell>
                          <TableCell>Orders</TableCell>
                          <TableCell>Date Range</TableCell>
                          <TableCell>Type</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {emailHistory.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              {item.timestamp ? new Date(item.timestamp).toLocaleString() : 'N/A'}
                            </TableCell>
                            <TableCell>
                              {Array.isArray(item.recipients) && item.recipients.length > 0
                                ? item.recipients.join(', ')
                                : 'N/A'}
                            </TableCell>
                            <TableCell>{item.orderCount || 0}</TableCell>
                            <TableCell>
                              {item.startDate && item.endDate
                                ? `${item.startDate}${item.startTime ? ' ' + item.startTime : ''} to ${item.endDate}${item.endTime ? ' ' + item.endTime : ''}`
                                : item.startDate || 'N/A'}
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={item.isSystemGenerated ? 'Scheduled' : 'Manual'}
                                size="small"
                                color={item.isSystemGenerated ? 'primary' : 'default'}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setEmailHistoryDialogOpen(false)}>Close</Button>
                <Button onClick={loadEmailHistory} disabled={emailHistoryLoading}>
                  Refresh
                </Button>
              </DialogActions>
            </Dialog>
            </>
            )}
          </TabPanel>
        </Paper>
      </Box>
    </Layout>
  );
}
