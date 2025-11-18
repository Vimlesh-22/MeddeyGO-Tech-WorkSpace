import axios from 'axios';

const getApiUrl = () => {
  // Check for proxy mode detection
  const isProxyMode = window.__PROXY_MODE__ === true || 
                     (typeof window.__TOOL_SLUG__ === 'string' && window.__TOOL_SLUG__.length > 0) ||
                     (typeof window.__PROXY_BASE__ === 'string' && window.__PROXY_BASE__.length > 0);
  
  console.log('[Quote App API] Detection:', {
    isProxyMode,
    __PROXY_MODE__: window.__PROXY_MODE__,
    __TOOL_SLUG__: window.__TOOL_SLUG__,
    __PROXY_BASE__: window.__PROXY_BASE__,
    pathname: window.location.pathname,
    port: window.location.port
  });
  
  if (isProxyMode) {
    // Use injected proxy base if available
    if (typeof window.__PROXY_BASE__ === 'string' && window.__PROXY_BASE__.length > 0) {
      const url = `${window.__PROXY_BASE__}/api`;
      console.log('[Quote App API] Using proxy base:', url);
      return url;
    } else if (typeof window.__TOOL_SLUG__ === 'string' && window.__TOOL_SLUG__.length > 0) {
      const url = `/_proxy/${window.__TOOL_SLUG__}/api`;
      console.log('[Quote App API] Using tool slug proxy:', url);
      return url;
    } else {
      // Default to quote-generator proxy
      const url = '/_proxy/quote-generator/api';
      console.log('[Quote App API] Using default proxy:', url);
      return url;
    }
  }
  
  const pathname = window.location.pathname || '';
  const portStr = window.location.port || '';
  const hostname = window.location.hostname;

  // Hub fallback: if running under hub port or proxy routes, use proxy
  const inHubProxy = portStr === '4090' || pathname.startsWith('/_proxy/');
  if (inHubProxy) {
    const url = '/_proxy/quote-generator/api';
    console.log('[Quote App API] In hub proxy mode, using proxy:', url);
    return url;
  }

  // If served directly under the tool slug (backend hosting frontend), use slug path
  if (pathname.startsWith('/tools/quote-generator')) {
    const url = '/tools/quote-generator/api';
    console.log('[Quote App API] Served from tool slug, using slug base:', url);
    return url;
  }

  // Standalone dev mode - backend is configured with /tools/quote-generator slug
  const port = '4094';
  const url = `http://${hostname}:${port}/tools/quote-generator/api`;
  console.log('[Quote App API] Standalone mode:', url);
  return url;
};

const API_URL = getApiUrl();
console.log('[Quote App API] Final API URL:', API_URL);

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to add auth token to requests
api.interceptors.request.use(
  (config) => {
    console.log('[Quote App API] Request:', {
      method: config.method,
      url: config.url,
      baseURL: config.baseURL,
      fullURL: `${config.baseURL}${config.url}`
    });
    const user = JSON.parse(localStorage.getItem('user'));
    if (user && user.token) {
      config.headers.Authorization = `Bearer ${user.token}`;
    }
    return config;
  },
  (error) => {
    console.error('[Quote App API] Request error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for error logging
api.interceptors.response.use(
  (response) => {
    console.log('[Quote App API] Response success:', {
      status: response.status,
      url: response.config.url
    });
    return response;
  },
  (error) => {
    console.error('[Quote App API] Response error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      url: error.config?.url
    });
    return Promise.reject(error);
  }
);

// Auth services
export const loginUser = (email, password) => {
  console.log('[Quote App API] Login attempt for:', email);
  return api.post('/users/login', { email, password });
};

export const registerUser = (userData) => {
  return api.post('/users/register', userData);
};

export const getCurrentUser = () => {
  return api.get('/users/me');
};

// User services
export const getAllUsers = () => {
  return api.get('/users');
};

export const getUserById = (id) => {
  return api.get(`/users/${id}`);
};

export const updateUser = (id, userData) => {
  return api.put(`/users/${id}`, userData);
};

export const deleteUser = (id) => {
  return api.delete(`/users/${id}`);
};

export const getAllManagers = () => {
  return api.get('/users/managers');
};

export const updateTemplatePreference = (templateId) => {
  return api.put('/users/template', { defaultTemplate: templateId });
};

export const getAvailableTemplates = () => {
  return api.get('/users/templates');
};

// Product services
export const getAllProducts = (searchTerm = '', page = 1, limit = 50) => {
  return api.get(`/products?search=${searchTerm}&page=${page}&limit=${limit}`);
};

export const getProductById = (id) => {
  return api.get(`/products/${id}`);
};

export const createProduct = (productData) => {
  return api.post('/products', productData);
};

export const updateProduct = (id, productData) => {
  return api.put(`/products/${id}`, productData);
};

export const deleteProduct = (id) => {
  return api.delete(`/products/${id}`);
};

export const importProductsFromCSV = (file) => {
  const formData = new FormData();
  formData.append('csv', file);
  
  return api.post('/products/import', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

// Quotation services
export const createQuotation = (quotationData) => {
  return api.post('/quotations', quotationData);
};

export const getAllQuotations = (searchTerm = '') => {
  const params = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : '';
  return api.get(`/quotations${params}`);
};

export const getQuotationById = (id) => {
  return api.get(`/quotations/${id}`);
};

export const updateQuotation = async (id, data) => {
  const user = JSON.parse(localStorage.getItem('user'));
  return axios.put(`${API_URL}/quotations/${id}`, data, {
    headers: {
      Authorization: `Bearer ${user.token}`
    }
  });
};

export const deleteQuotation = (id) => {
  return api.delete(`/quotations/${id}`);
};

export const downloadQuotationPDF = (id, template = null) => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (user && user.token) {
    const templateParam = template ? `&template=${template}` : '';
    window.open(`${API_URL}/quotations/${id}/pdf?token=${user.token}${templateParam}`, '_blank');
  } else {
    throw new Error('Authentication token not found');
  }
};

export const exportQuotations = async () => {
  try {
    const response = await api.get('/quotations/export', {
      responseType: 'blob'
    });
    
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'quotations.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    throw error;
  }
};

// Pricing rule services
export const createPricingRule = (ruleData) => {
  return api.post('/rules', ruleData);
};

export const getAllPricingRules = () => {
  return api.get('/rules');
};

export const getPricingRuleById = (id) => {
  return api.get(`/rules/${id}`);
};

export const updatePricingRule = (id, ruleData) => {
  return api.put(`/rules/${id}`, ruleData);
};

export const deletePricingRule = (id) => {
  return api.delete(`/rules/${id}`);
};

export const applyPricingRules = (products) => {
  return api.post('/rules/apply', { products });
};

// Default export
export default api;
