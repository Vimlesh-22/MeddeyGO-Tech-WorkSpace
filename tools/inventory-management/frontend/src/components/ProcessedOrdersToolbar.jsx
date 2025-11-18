import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Chip,
  Switch,
  FormControlLabel,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Divider
} from '@mui/material';
import {
  Email as EmailIcon,
  Send as SendIcon,
  Settings as SettingsIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Schedule as ScheduleIcon
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE_URL } from '../config';

const ProcessedOrdersToolbar = ({ selectedOrderIds, onOrdersUpdated }) => {
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailMode, setEmailMode] = useState('manual'); // 'manual' or 'automatic'
  const [autoExportEnabled, setAutoExportEnabled] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('04:00');
  const [emailMessage, setEmailMessage] = useState('');
  const queryClient = useQueryClient();

  // Fetch email settings
  const { data: emailSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ['email-settings'],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE_URL}/settings/email`);
      return response.data;
    }
  });

  // Fetch configured recipients
  const { data: recipients = [], isLoading: recipientsLoading } = useQuery({
    queryKey: ['email-recipients'],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE_URL}/settings/email`);
      return response.data.processedOrdersExport?.recipients || [];
    }
  });

  // Update email settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (data) => {
      const response = await axios.post(`${API_BASE_URL}/settings/email`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['email-settings']);
      queryClient.invalidateQueries(['email-recipients']);
    }
  });

  // Send manual email mutation
  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      const response = await axios.post(`${API_BASE_URL}/orders/export-email`, {
        orderIds: selectedOrderIds,
        recipients: recipients,
        message: emailMessage
      });
      return response.data;
    },
    onSuccess: () => {
      setEmailDialogOpen(false);
      alert('Email sent successfully!');
    },
    onError: (error) => {
      alert(`Failed to send email: ${error.response?.data?.message || error.message}`);
    }
  });

  // Add email recipient mutation
  const addRecipientMutation = useMutation({
    mutationFn: async (email) => {
      const response = await axios.post(`${API_BASE_URL}/settings/email/recipients`, { email });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['email-recipients']);
      setNewEmail('');
    }
  });

  // Remove email recipient mutation
  const removeRecipientMutation = useMutation({
    mutationFn: async (email) => {
      const response = await axios.delete(`${API_BASE_URL}/settings/email/recipients`, { 
        data: { email } 
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['email-recipients']);
    }
  });

  // Update settings when they load
  useEffect(() => {
    if (emailSettings?.processedOrdersExport) {
      setAutoExportEnabled(emailSettings.processedOrdersExport.enabled !== false);
      setScheduleTime(emailSettings.processedOrdersExport.scheduleTime || '04:00');
    }
  }, [emailSettings]);

  const handleAddEmail = () => {
    const trimmedEmail = newEmail.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      alert('Please enter a valid email address');
      return;
    }
    addRecipientMutation.mutate(trimmedEmail);
  };

  const handleRemoveEmail = (email) => {
    if (window.confirm(`Remove ${email} from recipients?`)) {
      removeRecipientMutation.mutate(email);
    }
  };

  const handleSendManualEmail = () => {
    if (selectedOrderIds.length === 0) {
      alert('Please select at least one order');
      return;
    }
    if (recipients.length === 0) {
      alert('Please add at least one email recipient');
      return;
    }
    sendEmailMutation.mutate();
  };

  const handleUpdateAutoExport = (enabled) => {
    setAutoExportEnabled(enabled);
    updateSettingsMutation.mutate({
      processedOrdersExport: {
        ...emailSettings.processedOrdersExport,
        enabled: enabled
      }
    });
  };

  const handleUpdateScheduleTime = (time) => {
    setScheduleTime(time);
    updateSettingsMutation.mutate({
      processedOrdersExport: {
        ...emailSettings.processedOrdersExport,
        scheduleTime: time
      }
    });
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleAddEmail();
    }
  };

  return (
    <>
      <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="h6" component="div">
          Processed Orders
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            variant="contained"
            startIcon={<EmailIcon />}
            onClick={() => setEmailDialogOpen(true)}
            disabled={selectedOrderIds.length === 0 || sendEmailMutation.isLoading}
            size="small"
          >
            Send Email ({selectedOrderIds.length})
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={async () => {
              if (selectedOrderIds.length === 0) return;
              if (!window.confirm(`Delete ${selectedOrderIds.length} processed order(s)? This will also remove related history.`)) return;
              try {
                for (const id of selectedOrderIds) {
                  await axios.delete(`${API_BASE_URL}/orders/processed/${id}`);
                }
                onOrdersUpdated?.();
              } catch (e) {
                alert(e.response?.data?.message || e.message);
              }
            }}
            size="small"
          >
            Delete Selected
          </Button>
          
          <Button
            variant="outlined"
            startIcon={<SettingsIcon />}
            onClick={() => setEmailDialogOpen(true)}
            size="small"
          >
            Email Settings
          </Button>
        </Box>

        {autoExportEnabled && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ScheduleIcon fontSize="small" color="success" />
            <Typography variant="body2" color="success.main">
              Auto-export enabled at {scheduleTime} IST
            </Typography>
          </Box>
        )}
      </Box>

      <Dialog 
        open={emailDialogOpen} 
        onClose={() => setEmailDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Email Settings & Manual Export
        </DialogTitle>
        <DialogContent>
          {settingsLoading || recipientsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {/* Auto Export Settings */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Automatic Email Export
                </Typography>
                
                <FormControlLabel
                  control={
                    <Switch
                      checked={autoExportEnabled}
                      onChange={(e) => handleUpdateAutoExport(e.target.checked)}
                      disabled={updateSettingsMutation.isLoading}
                    />
                  }
                  label="Enable automatic email export"
                />
                
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  When enabled, processed orders will be automatically emailed before moving from Pending to Processed stage
                </Typography>
                
                <TextField
                  fullWidth
                  type="time"
                  label="Schedule Time (IST)"
                  value={scheduleTime}
                  onChange={(e) => handleUpdateScheduleTime(e.target.value)}
                  disabled={!autoExportEnabled || updateSettingsMutation.isLoading}
                  size="small"
                  sx={{ maxWidth: 200 }}
                />
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Email Recipients */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Email Recipients
                </Typography>
                
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Enter email address"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={addRecipientMutation.isLoading}
                  />
                  <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={handleAddEmail}
                    disabled={!newEmail.trim() || addRecipientMutation.isLoading}
                    size="small"
                  >
                    Add
                  </Button>
                </Box>

                {recipients.length > 0 && (
                  <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}>
                    {recipients.map((email, index) => (
                      <Chip
                        key={index}
                        label={email}
                        onDelete={() => handleRemoveEmail(email)}
                        sx={{ m: 0.5 }}
                        deleteIcon={
                          <Tooltip title="Remove recipient">
                            <DeleteIcon />
                          </Tooltip>
                        }
                      />
                    ))}
                  </Box>
                )}
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Manual Export */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Manual Email Export
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  minRows={3}
                  label="Message/Remark to include"
                  placeholder="Enter a note to include in the email"
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  sx={{ mb: 2 }}
                />
                
                <Alert severity="info" sx={{ mb: 2 }}>
                  Selected {selectedOrderIds.length} order(s) for manual export
                </Alert>

                <Button
                  variant="contained"
                  startIcon={<SendIcon />}
                  onClick={handleSendManualEmail}
                  disabled={selectedOrderIds.length === 0 || recipients.length === 0 || sendEmailMutation.isLoading}
                  fullWidth
                >
                  {sendEmailMutation.isLoading ? 'Sending...' : `Send Email to ${recipients.length} recipient(s)`}
                </Button>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailDialogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ProcessedOrdersToolbar;