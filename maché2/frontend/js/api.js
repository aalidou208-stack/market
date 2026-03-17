/**
 * AFRIMARKET — API Client
 * Centralise toutes les communications avec le backend
 */

const API = (() => {
  const BASE_URL = window.AFRIMARKET_API_URL || 'http://localhost:3000/api';
  let authToken = localStorage.getItem('afrimarket_token');

  // ─── HTTP helpers ───
  async function request(method, path, body = null, options = {}) {
    const url = `${BASE_URL}${path}`;
    const headers = { 'Content-Type': 'application/json' };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const config = { method, headers };

    if (body && method !== 'GET') {
      config.body = JSON.stringify(body);
    }

    // Handle file uploads
    if (options.formData) {
      delete headers['Content-Type'];
      config.body = options.formData;
    }

    try {
      const res = await fetch(url, config);
      const data = await res.json();

      if (!res.ok) {
        const error = new Error(data.message || `HTTP ${res.status}`);
        error.status = res.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (err) {
      if (err.status === 401) {
        authToken = null;
        localStorage.removeItem('afrimarket_token');
        window.dispatchEvent(new Event('auth:logout'));
      }
      throw err;
    }
  }

  const get = (path) => request('GET', path);
  const post = (path, body) => request('POST', path, body);
  const put = (path, body) => request('PUT', path, body);
  const del = (path) => request('DELETE', path);

  function upload(path, formData) {
    return request('POST', path, null, { formData });
  }

  // ─── Auth ───
  function setToken(token) {
    authToken = token;
    localStorage.setItem('afrimarket_token', token);
  }
  function clearToken() {
    authToken = null;
    localStorage.removeItem('afrimarket_token');
  }
  function isAuthenticated() {
    return !!authToken;
  }

  // ─── Public API methods ───
  return {
    // Auth
    sendOTP: (phone) => post('/auth/send-otp', { phone }),
    verifyOTP: (phone, code) => post('/auth/verify-otp', { phone, code }),
    register: (data) => post('/auth/register', data),
    login: (data) => post('/auth/login', data),
    me: () => get('/auth/me'),

    // Sellers
    registerSeller: (data) => post('/sellers/register', data),
    uploadDocument: (formData) => upload('/sellers/documents', formData),
    checkSlug: (slug) => get(`/sellers/check-slug/${slug}`),
    getSellerDashboard: () => get('/sellers/dashboard'),
    getSellerOrders: (params = '') => get(`/sellers/orders${params}`),
    getSellerProducts: () => get('/sellers/products'),
    getSellerPayments: () => get('/sellers/payments'),
    updateSellerProfile: (data) => put('/sellers/profile', data),

    // Products
    getProducts: (params = '') => get(`/products${params}`),
    getProduct: (id) => get(`/products/${id}`),
    createProduct: (data) => post('/products', data),
    updateProduct: (id, data) => put(`/products/${id}`, data),
    deleteProduct: (id) => del(`/products/${id}`),
    uploadProductImage: (formData) => upload('/products/images', formData),

    // Reviews
    getReviews: (productId) => get(`/products/${productId}/reviews`),
    createReview: (productId, data) => post(`/products/${productId}/reviews`, data),

    // Stats (public)
    getPublicStats: () => get('/stats/public'),

    // Categories
    getCategories: () => get('/categories'),

    // Orders
    createOrder: (data) => post('/orders', data),

    // Token management
    setToken,
    clearToken,
    isAuthenticated,
  };
})();

// ─── Toast system ───
const Toast = (() => {
  let container;

  function init() {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  function show(message, type = 'info', duration = 4000) {
    if (!container) init();

    const icons = {
      success: '✓',
      error: '✕',
      info: 'ℹ',
      warning: '⚠'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = '0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  return {
    success: (msg) => show(msg, 'success'),
    error: (msg) => show(msg, 'error'),
    info: (msg) => show(msg, 'info'),
    warning: (msg) => show(msg, 'warning'),
  };
})();

// ─── Format helpers ───
function formatCFA(amount) {
  return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}