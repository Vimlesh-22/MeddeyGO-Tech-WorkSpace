import { useState, useEffect } from 'react';
import { Link, Tooltip, CircularProgress } from '@mui/material';
import { OpenInNew as OpenInNewIcon } from '@mui/icons-material';
import axios from 'axios';
import { getApiBaseUrlDynamic } from '../config';

/**
 * SKUPriceLink Component - Makes SKUs clickable, opens Shopify product page, and shows price
 * @param {string} sku - The SKU to display and link
 * @param {string} shopifyStore - The Shopify store domain (optional, defaults to main store)
 * @param {string} page - Page context for prioritization (inventory, orders, initial, processed)
 * @param {string} location - Location for sheet-based fetching (Okhla, Bahadurgarh)
 */
export default function SKUPriceLink({ sku, shopifyStore = 'medanshv2.myshopify.com', page = null, location = null }) {
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
      if (!sku || sku === 'No SKU') return;
      
      setLoading(true);
      try {
        const apiBaseUrl = getApiBaseUrlDynamic();
        const pageContext = detectPageContext();
        const params = new URLSearchParams();
        if (pageContext) params.append('page', pageContext);
        if (location) params.append('location', location);
        
        const url = `${apiBaseUrl}/products/price/${encodeURIComponent(sku)}${params.toString() ? '?' + params.toString() : ''}`;
        const response = await axios.get(url);
        if (response.data && response.data.success) {
          // If price is null (not found), just don't show it (not an error)
          if (response.data.price === null || response.data.price === undefined) {
            setError(null); // Not an error, just no price available
          } else {
          setPrice(response.data.price);
          }
        } else {
          setError(null); // Not an error, just no price available
        }
      } catch (err) {
        // Silently handle errors - don't log 404s as errors
        if (err.response?.status !== 404) {
        console.error('Error fetching price:', err);
        }
        setError(null); // Don't show error, just don't show price
      } finally {
        setLoading(false);
      }
    };

    fetchPrice();
  }, [sku, page, location]);

  if (!sku || sku === 'No SKU') {
    return <span>{sku || '-'}</span>;
  }

  // Generate Shopify admin product search URL
  const shopifyAdminUrl = `https://admin.shopify.com/store/${shopifyStore.replace('.myshopify.com', '')}/products?query=${encodeURIComponent(sku)}`;

  const displayText = loading ? sku : (price ? `${sku} (₹${price})` : sku);
  
  return (
    <Tooltip 
      title={error ? error : (loading ? 'Loading price...' : (price ? `Price: ₹${price}` : 'Price not available'))}
      arrow
    >
      <Link
        href={shopifyAdminUrl}
        target="_blank"
        rel="noopener noreferrer"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          textDecoration: 'none',
          color: 'primary.main',
          '&:hover': {
            textDecoration: 'underline'
          }
        }}
      >
        {displayText}
        {loading && <CircularProgress size={12} sx={{ ml: 0.5 }} />}
        <OpenInNewIcon fontSize="small" sx={{ fontSize: '0.875rem' }} />
      </Link>
    </Tooltip>
  );
}