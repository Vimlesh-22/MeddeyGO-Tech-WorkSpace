import { useState, useEffect } from 'react';
import { notify } from '../utils/notify';
import axios from 'axios';
import { Box, Button, Typography, CircularProgress, Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';

export default function ReminderSection() {
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const [pendingResp, historyResp] = await Promise.all([
        axios.get('/api/reminders/pending'),
        axios.get('/api/reminders/history'),
      ]);
      setPending(pendingResp.data.reminders || []);
      setHistory(historyResp.data.history || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { fetchData(); }, []);

  const handleSendNow = async (orderId, to, template) => {
    try {
      await axios.post('/api/reminders/send', { orderId, to, template });
      fetchData();
    } catch (e) { notify('Send failed: ' + e.message, 'error'); }
  };
  const handleMarkAsSent = async (orderId, vendorId) => {
    try {
      await axios.post('/api/reminders/mark-sent', { orderId, vendorId });
      fetchData();
    } catch (e) { notify('Mark as sent failed: '+e.message, 'error'); }
  };
  const handleRetry = async (orderId) => {
    try {
      await axios.post('/api/reminders/retry', { orderId });
      fetchData();
    } catch (e) { notify('Retry failed: ' + e.message, 'error'); }
  };

  return (
    <Box>
      <Typography variant="h6">Pending Reminders</Typography>
      {loading && <CircularProgress />}
      {error && <Typography color="error">{error}</Typography>}
      <Table><TableHead><TableRow><TableCell>Order</TableCell><TableCell>To</TableCell><TableCell>When</TableCell><TableCell>Status</TableCell><TableCell>Actions</TableCell><TableCell>Mark as Sent</TableCell></TableRow></TableHead>
        <TableBody>
          {pending.map((r, idx) => (<TableRow key={idx}>
            <TableCell>{r.orderId}</TableCell>
            <TableCell>{r.to}</TableCell>
            <TableCell>{new Date(r.when).toLocaleString()}</TableCell>
            <TableCell>{r.status}</TableCell>
            <TableCell>
              <Button onClick={()=>handleSendNow(r.orderId,r.to,r.template)}>Send Now</Button>
              <Button onClick={()=>handleRetry(r.orderId)}>Retry</Button>
            </TableCell>
            <TableCell>
              <Button variant='contained' color='warning' onClick={()=>handleMarkAsSent(r.orderId, r.vendorId)}>
                Mark as Sent
              </Button>
            </TableCell>
          </TableRow>))}
        </TableBody>
      </Table>
      <Typography variant="h6" sx={{ mt: 3 }}>History</Typography>
      <Table><TableHead><TableRow><TableCell>Order</TableCell><TableCell>To</TableCell><TableCell>Sent</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
        <TableBody>
          {history.map((r, idx) => (<TableRow key={idx}><TableCell>{r.orderId}</TableCell><TableCell>{r.to}</TableCell><TableCell>{r.sent ? 'Yes' : 'No'}</TableCell><TableCell>{r.status}</TableCell></TableRow>))}
        </TableBody>
      </Table>
    </Box>
  );
}
