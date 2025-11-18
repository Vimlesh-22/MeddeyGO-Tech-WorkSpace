import { useEffect, useState } from 'react';
import { Link, Tooltip } from '@mui/material';
import { OpenInNew as OpenInNewIcon } from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../config';

/**
 * SKULink Component - Makes SKUs clickable and opens Shopify product page
 * @param {string} sku - The SKU to display and link
 * @param {string} shopifyStore - The Shopify store domain (optional, defaults to main store)
 */
let __packDataCache = null; // { packSkuMap, packProducts, comboProducts }
let __packDataPromise = null;

const PACK_QTY_ENDPOINT = `${API_BASE_URL}/orders/pack-qty`;
const PACK_DATA_ENDPOINT = `${API_BASE_URL}/orders/pack-sku-data`;

export default function SKULink({ sku, shopifyStore = 'medanshv2.myshopify.com' }) {
  const [packQty, setPackQty] = useState(null);

  useEffect(() => {
    const normalized = (sku || '').toUpperCase();
    if (!normalized || normalized === 'NO SKU') return;

    const computeQty = (data) => {
      if (!data) return null;
      // Prefer explicit Pack Products quantity
      const fromPackProducts = Array.isArray(data.packProducts)
        ? data.packProducts.find(p => (p['Pack sku'] || '').toUpperCase() === normalized)
        : null;
      if (fromPackProducts && fromPackProducts['Pack Quantity']) {
        return parseInt(fromPackProducts['Pack Quantity'], 10) || null;
      }
      // Fallback to Master Needs quantity
      const mapEntry = data.packSkuMap ? data.packSkuMap[normalized] : null;
      if (mapEntry && typeof mapEntry.quantity === 'number') {
        return mapEntry.quantity || null;
      }
      return null;
    };

    const load = async () => {
      try {
        // Try focused endpoint first
        const q = await axios
          .get(`${PACK_QTY_ENDPOINT}/${encodeURIComponent(normalized)}`)
          .then(r => r.data)
          .catch(() => null);
        if (q && q.success) {
          setPackQty(q.qty || null);
          return;
        }
        // Fallback to cached dataset
        if (__packDataCache) {
          setPackQty(computeQty(__packDataCache));
          return;
        }
        if (!__packDataPromise) {
          __packDataPromise = axios
            .get(PACK_DATA_ENDPOINT)
            .then(res => res.data?.data || res.data)
            .catch(() => null)
            .finally(() => { /* keep promise for pending callers */ });
        }
        const data = await __packDataPromise;
        if (data) __packDataCache = data;
        setPackQty(computeQty(data));
      } catch (e) {
        // ignore
      }
    };

    load();
  }, [sku]);

  if (!sku || sku === 'No SKU') {
    return <span>{sku || '-'}</span>;
  }

  // Generate Shopify admin product search URL
  const shopifyAdminUrl = `https://admin.shopify.com/store/${shopifyStore.replace('.myshopify.com', '')}/products?query=${encodeURIComponent(sku)}`;

  const text = packQty && packQty > 1 ? `${sku} (x${packQty})` : sku;
  const tooltip = packQty && packQty > 1 ? `Pack quantity: ${packQty}` : 'Open in Shopify';

  return (
    <Tooltip title={tooltip} arrow>
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
        {text}
        <OpenInNewIcon fontSize="small" sx={{ fontSize: '0.875rem' }} />
      </Link>
    </Tooltip>
  );
}
