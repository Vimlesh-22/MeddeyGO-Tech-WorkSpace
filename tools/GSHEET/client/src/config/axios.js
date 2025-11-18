import axios from 'axios';

// Detect if we're running in proxy mode (embedded in Project Hub)
const getApiBaseUrl = () => {
  if (typeof window === 'undefined') {
    return '/api';
  }
  
  // Check for proxy mode variables injected by ToolFrame
  const toolProxy = window.__TOOL_PROXY__;
  const toolSlug = window.__TOOL_SLUG__;
  const proxyMode = window.__PROXY_MODE__;
  
  // If proxy mode is detected, use the proxy path (without /api - we'll add it in the calls)
  if (proxyMode && toolProxy && toolSlug === 'gsheet-integration') {
    // Return proxy path without /api - the API calls will include /api/ in their paths
    const basePath = toolProxy.endsWith('/') ? toolProxy.slice(0, -1) : toolProxy;
    return basePath;
  }
  
  // Check if current URL contains /_proxy/gsheet-integration
  const currentPath = window.location.pathname;
  if (currentPath.includes('/_proxy/gsheet-integration')) {
    // Return proxy path without /api
    return '/_proxy/gsheet-integration';
  }
  
  // Check if we're in an iframe (likely proxied)
  try {
    if (window.parent !== window) {
      // We're in an iframe - likely proxied
      return '/_proxy/gsheet-integration';
    }
  } catch (e) {
    // Cross-origin iframe - use proxy path
    return '/_proxy/gsheet-integration';
  }
  
  // Standalone mode - use relative path (Vite proxy will handle it)
  return '/api';
};

// Configure axios with the correct base URL
const apiBaseUrl = getApiBaseUrl();

// Debug logging (only in development)
if (import.meta.env?.DEV || process.env.NODE_ENV === 'development') {
  console.log('[GSHEET Client] API Base URL:', apiBaseUrl);
  console.log('[GSHEET Client] Current Path:', window.location.pathname);
  console.log('[GSHEET Client] Proxy Mode:', window.__PROXY_MODE__);
  console.log('[GSHEET Client] Tool Proxy:', window.__TOOL_PROXY__);
}

// Create a custom axios instance that handles the base URL correctly
// We'll use this instance instead of the default axios
const axiosInstance = axios.create({
  baseURL: apiBaseUrl,
  // Ensure baseURL doesn't get modified
  transformRequest: [(data, headers) => {
    // Don't modify the request
    return data;
  }]
});

// Override the request interceptor to ensure correct URL construction
axiosInstance.interceptors.request.use((config) => {
  // If baseURL is set and url starts with /, ensure proper joining
  if (config.baseURL && config.url && config.url.startsWith('/')) {
    // Remove trailing slash from baseURL and leading slash from url, then join
    const base = config.baseURL.endsWith('/') ? config.baseURL.slice(0, -1) : config.baseURL;
    const path = config.url.startsWith('/') ? config.url : '/' + config.url;
    const finalUrl = base + path;
    
    // Debug logging
    if (import.meta.env?.DEV || process.env.NODE_ENV === 'development') {
      console.log('[GSHEET Axios] Request interceptor:', {
        originalBaseURL: config.baseURL,
        originalURL: config.url,
        finalURL: finalUrl
      });
    }
    
    config.url = finalUrl;
    delete config.baseURL; // Remove baseURL to prevent axios from double-joining
  }
  return config;
});

export default axiosInstance;

