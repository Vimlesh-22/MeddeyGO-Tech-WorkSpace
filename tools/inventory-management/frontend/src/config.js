// API base URL and configuration
// This function is called dynamically to ensure proxy detection variables are available
const collapseExtraSlashes = (value) => {
  if (typeof value !== 'string') return value;
  // Preserve protocol double slashes while collapsing everything else
  return value.replace(/(https?:\/\/)|(\/\/)/g, (match, protocol) => protocol ? protocol : '/');
};

const normalizeProxyBase = (u) => (typeof u === 'string' ? u.replace(/^\/api\/_proxy\//, '/_proxy/') : u);

// Normalize API paths to avoid duplicate prefixes like /api/api or /_proxy/_proxy
export const normalizeApiPath = (url) => {
  if (typeof url !== 'string') return url;
  
  let normalized = url
    .replace(/\/api\/api(\/|$)/g, '/api$1')
    .replace(/\/_proxy\/([^/]+)\/api\/api(\/|$)/g, '/_proxy/$1/api$2')
    .replace(/\/_proxy\/_proxy\//g, '/_proxy/')
    .replace(/\/api\/_proxy\//g, '/_proxy/');
  
  normalized = collapseExtraSlashes(normalized);
  return normalized;
};
const getApiBaseUrl = () => {
  if (typeof window === 'undefined') {
    return normalizeApiPath('/api');
  }
  
  const pathname = window.location.pathname || '';
  const fullUrl = window.location.href || '';
  const hostname = window.location.hostname || '';
  const injectedProxyBase = typeof window.__PROXY_BASE__ === 'string' && window.__PROXY_BASE__.length > 0;
  const injectedToolSlug = typeof window.__TOOL_SLUG__ === 'string' && window.__TOOL_SLUG__.length > 0;
  
  // Check for injected proxy mode detection first (most reliable)
  const isProxyMode = window.__PROXY_MODE__ === true || injectedProxyBase || injectedToolSlug;
  
  // Fallback: only rely on explicit proxy paths rather than host heuristics
  const hasProxyPath =
    pathname.includes('/tools/') ||
    pathname.includes('/_proxy/') ||
    fullUrl.includes('/tools/') ||
    fullUrl.includes('/_proxy/');
  
  // Debug logging (only in development)
  if (import.meta.env?.DEV || process.env.NODE_ENV === 'development') {
    console.log('[Inventory] Proxy detection:', {
      injectedProxyMode: window.__PROXY_MODE__,
      injectedToolSlug: window.__TOOL_SLUG__,
      injectedProxyBase: window.__PROXY_BASE__,
      pathname,
      fullUrl,
      hostname,
      port: window.location.port,
      hasProxyPath,
      isProxyMode
    });
  }
  
  if (isProxyMode) {
    // Use injected proxy base if available (most reliable)
    if (injectedProxyBase) {
      const apiUrl = normalizeApiPath(`${window.__PROXY_BASE__}/api`);
      if (import.meta.env?.DEV || process.env.NODE_ENV === 'development') {
        console.log('[Inventory] Using injected proxy base, API_BASE_URL:', apiUrl);
      }
      return normalizeProxyBase(apiUrl);
    } else if (injectedToolSlug) {
      const apiUrl = normalizeApiPath(`/_proxy/${window.__TOOL_SLUG__}/api`);
      if (import.meta.env?.DEV || process.env.NODE_ENV === 'development') {
        console.log('[Inventory] Using injected tool slug, API_BASE_URL:', apiUrl);
      }
      return normalizeProxyBase(apiUrl);
    } else {
      const apiUrl = normalizeApiPath('/_proxy/inventory-management/api');
      if (import.meta.env?.DEV || process.env.NODE_ENV === 'development') {
        console.log('[Inventory] Using default proxy path, API_BASE_URL:', apiUrl);
      }
      return normalizeProxyBase(apiUrl);
    }
  } else if (hasProxyPath || window.location.port === '4090') {
    // Fallback detection: Extract tool slug from pathname or full URL
    const pathMatch =
      pathname.match(/\/(?:tools|_proxy)\/([^\/]+)/) ||
      fullUrl.match(/\/(?:tools|_proxy)\/([^\/]+)/);
    if (pathMatch) {
      const toolSlug = pathMatch[1];
      const apiUrl = normalizeApiPath(`/_proxy/${toolSlug}/api`);
      if (import.meta.env?.DEV || process.env.NODE_ENV === 'development') {
        console.log('[Inventory] Using proxy mode (fallback), API_BASE_URL:', apiUrl);
      }
      return normalizeProxyBase(apiUrl);
    }
    // Fallback to default proxy path when URL clearly contains proxy indicators
    const apiUrl = normalizeApiPath('/_proxy/inventory-management/api');
    if (import.meta.env?.DEV || process.env.NODE_ENV === 'development') {
      console.log('[Inventory] Using proxy mode (fallback default), API_BASE_URL:', apiUrl);
    }
    return normalizeProxyBase(apiUrl);
  }
  
  // Standalone mode - use relative /api (backend serves frontend)
  const apiUrl = '/api';
  if (import.meta.env?.DEV || process.env.NODE_ENV === 'development') {
    console.log('[Inventory] Using standalone mode, API_BASE_URL:', apiUrl);
  }
  return normalizeApiPath(apiUrl);
};

// Export as a function that's called dynamically
export const getApiBaseUrlDynamic = getApiBaseUrl;

// For ES6 module compatibility, export a value that's computed at module load
// Note: This is computed once, but proxy variables should be injected before React loads
// Components can use getApiBaseUrlDynamic() for dynamic evaluation if needed
export const API_BASE_URL = getApiBaseUrl();

// Status colors for MUI chips
export const STATUS_COLORS = {
  'Pending': 'warning',
  'Paid': 'success',
  'Failed': 'error',
  'Refunded': 'info',
  'Partially_paid': 'warning',
  'Partially paid': 'warning',
  'Unknown': 'default',
  'Unfulfilled': 'warning',
  'Partially Fulfilled': 'info',
  'Fulfilled': 'success',
  'Cancelled': 'error',
  'Initial': 'default',
  'Hold': 'warning',
  'Processed': 'info',
  'Pending': 'warning',
  'Completed': 'success',
  'In-Stock': 'primary'
};
