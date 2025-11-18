import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Chip,
  Box,
  Typography,
  CircularProgress,
  Alert,
  Stack,
  Link,
} from '@mui/material';
import { OpenInNew as OpenInNewIcon } from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../config';

export default function ProductSearchDialog({ open, onClose, productName, sku }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  const handleSearch = async () => {
    if (!productName && !sku) {
      setError('Product name or SKU is required');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const searchQuery = productName || sku;
      const response = await axios.get(`${API_BASE_URL}/products/multi-site-search/${encodeURIComponent(searchQuery)}`);
      setResults(response.data.results || []);
      
      if (!response.data.results || response.data.results.length === 0) {
        setError('No search results found');
      }
    } catch (err) {
      setError(`Failed to search: ${err.message}`);
      console.error('Product search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenLink = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Product Search Results
        <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
          Search: {productName || sku}
        </Typography>
      </DialogTitle>
      
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : results.length > 0 ? (
          <List sx={{ pt: 0 }}>
            {results.map((result, index) => (
              <ListItem key={index} disablePadding sx={{ mb: 1 }}>
                <ListItemButton
                  onClick={() => handleOpenLink(result.url)}
                  sx={{
                    border: (theme) => `1px solid ${theme.palette.divider}`,
                    borderRadius: 1,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    '&:hover': {
                      backgroundColor: (theme) => theme.palette.mode === 'dark' ? theme.palette.action.hover : theme.palette.grey[100],
                      color: (theme) => theme.palette.text.primary,
                      borderColor: '#1976d2',
                    }
                  }}
                >
                  <Stack sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                        {result.site}
                      </Typography>
                      <Chip 
                        label="Click to Open" 
                        size="small" 
                        color="primary" 
                        variant="outlined"
                      />
                    </Box>
                    <Typography 
                      variant="caption" 
                      color="textSecondary"
                      sx={{ mt: 0.5, wordBreak: 'break-all' }}
                    >
                      {result.url}
                    </Typography>
                  </Stack>
                  <OpenInNewIcon sx={{ ml: 2, flexShrink: 0 }} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        ) : (
          <Typography color="textSecondary">
            Click "Search" to find this product on all sites
          </Typography>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button 
          onClick={handleSearch} 
          variant="contained" 
          disabled={loading}
        >
          {loading ? 'Searching...' : 'Search on All Sites'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}