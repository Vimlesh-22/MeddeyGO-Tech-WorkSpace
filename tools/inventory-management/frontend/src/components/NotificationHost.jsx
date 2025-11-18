import { useEffect, useState } from 'react';
import { Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from '@mui/material';

export default function NotificationHost() {
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'info', duration: 4000 });
  const [confirm, setConfirm] = useState({ open: false, title: 'Confirm', message: '', onConfirm: null });

  useEffect(() => {
    const handleNotify = (e) => {
      const { message, severity = 'info', duration = 4000 } = e.detail || {};
      setSnack({ open: true, message, severity, duration });
    };
    const handleConfirm = (e) => {
      const { title = 'Confirm', message = '', onConfirm } = e.detail || {};
      setConfirm({ open: true, title, message, onConfirm });
    };
    window.addEventListener('app-notify', handleNotify);
    window.addEventListener('app-confirm', handleConfirm);
    return () => {
      window.removeEventListener('app-notify', handleNotify);
      window.removeEventListener('app-confirm', handleConfirm);
    };
  }, []);

  return (
    <>
      <Snackbar
        open={snack.open}
        autoHideDuration={snack.duration}
        onClose={() => setSnack({ ...snack, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnack({ ...snack, open: false })} severity={snack.severity} sx={{ width: '100%' }}>
          {snack.message}
        </Alert>
      </Snackbar>

      <Dialog open={confirm.open} onClose={() => setConfirm({ ...confirm, open: false })} maxWidth="sm" fullWidth>
        <DialogTitle>{confirm.title}</DialogTitle>
        <DialogContent>
          <Typography>{confirm.message}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm({ ...confirm, open: false })}>Cancel</Button>
          <Button
            variant="contained"
            onClick={async () => {
              if (typeof confirm.onConfirm === 'function') {
                await confirm.onConfirm();
              }
              setConfirm({ ...confirm, open: false });
            }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}


