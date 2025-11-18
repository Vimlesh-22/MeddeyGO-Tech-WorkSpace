import { useState, useEffect } from 'react';
import { Typography, CircularProgress, Tooltip, Box } from '@mui/material';
import axios from 'axios';
import { getApiBaseUrlDynamic } from '../config';

/**
 * SKUPrice Component - Displays price fetched by SKU
 * @param {string} sku - The SKU to fetch price for
 * @param {number} fallbackPrice - Optional fallback price if SKU lookup fails
 * @param {string} page - Page context for prioritization (inventory, orders, initial, processed)
 * @param {string} location - Location for sheet-based fetching (Okhla, Bahadurgarh)
 */
export default function SKUPrice({ sku, fallbackPrice = null, page = null, location = null }) {
  const [price, setPrice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Auto-detect page context from URL if not provided
  const detectPageContext = () => {
    if (page) return page;
    const pathname = window.location.pathname.toLowerCase();
    if (pathname.includes('inventory') || pathname.includes('count')) return 'inventory';
    if (pathname.includes('order')) return 'orders';
    if (pathname.includes('initial')) return 'initial';
    if (pathname.includes('processed')) return 'processed';
    return null;
  };

  useEffect(() => {
    const fetchPrice = async () => {
      if (!sku || sku === 'No SKU') {
        if (fallbackPrice !== null) {
          setPrice(fallbackPrice);
        }
        return;
      }
      
      setLoading(true);
      try {
        const pageContext = detectPageContext();
        const params = new URLSearchParams();
        if (pageContext) params.append('page', pageContext);
        if (location) params.append('location', location);
        
        const apiBaseUrl = getApiBaseUrlDynamic();
        const url = `${apiBaseUrl}/products/price/${encodeURIComponent(sku)}${params.toString() ? '?' + params.toString() : ''}`;
        const response = await axios.get(url);
        if (response.data && response.data.success) {
          // If price is null (not found), use fallback
          if (response.data.price === null || response.data.price === undefined) {
            if (fallbackPrice !== null) {
              setPrice(fallbackPrice);
            } else {
              setError('Price not available');
            }
          } else {
            setPrice(response.data.price);
          }
        } else {
          // If API doesn't return price, use fallback if available
          if (fallbackPrice !== null) {
            setPrice(fallbackPrice);
          } else {
            setError('Price not available');
          }
        }
      } catch (err) {
        // Silently handle errors - don't log 404s as errors
        if (err.response?.status !== 404) {
          console.error('Error fetching price:', err);
        }
        // If error occurs, use fallback if available
        if (fallbackPrice !== null) {
          setPrice(fallbackPrice);
        } else {
          setError('Price not available');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPrice();
  }, [sku, fallbackPrice, page, location]);

  if (loading) {
    return (
      <Tooltip title="Loading price...">
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <CircularProgress size={12} />
        </Box>
      </Tooltip>
    );
  }

  if (error && price === null) {
    return (
      <Typography variant="body2" color="textSecondary">
        {fallbackPrice !== null ? `₹${fallbackPrice.toFixed(2)}` : '-'}
      </Typography>
    );
  }

  if (price !== null) {
    return (
      <Typography variant="body2">
        ₹{price.toFixed(2)}
      </Typography>
    );
  }

  // Fallback to fallbackPrice if provided
  if (fallbackPrice !== null) {
    return (
      <Typography variant="body2">
        ₹{fallbackPrice.toFixed(2)}
      </Typography>
    );
  }

  return (
    <Typography variant="body2" color="textSecondary">
      -
    </Typography>
  );
}

