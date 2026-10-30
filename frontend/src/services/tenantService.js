import { api } from './api.js';

export const tenantService = {
  overview: () => api.get('/tenant/overview'),
  brand: () => api.get('/tenant/brand'),
  saveBrand: (data) => api.put('/tenant/brand', data),
  uploadAsset: (kind, file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/tenant/brand/assets/${kind}`, form);
  },
  removeAsset: (kind) => api.del(`/tenant/brand/assets/${kind}`),
  settings: () => api.get('/tenant/settings'),
  saveSettings: (data) => api.put('/tenant/settings', data),

  servers: () => api.get('/tenant/servers'),
  testConnection: (data) => api.post('/tenant/servers/test', data),
  createServer: (data) => api.post('/tenant/servers', data),
  updateServer: (id, data) => api.put(`/tenant/servers/${id}`, data),
  deleteServer: (id) => api.del(`/tenant/servers/${id}`),
  testServer: (id) => api.post(`/tenant/servers/${id}/test`),
  refreshServer: (id) => api.post(`/tenant/servers/${id}/refresh`),
  defaultServer: (id) => api.post(`/tenant/servers/${id}/default`),

  viewers: (query) => api.get('/tenant/viewers', { query }),
  createViewer: (data) => api.post('/tenant/viewers', data),
  setViewerStatus: (id, status) => api.patch(`/tenant/viewers/${id}/status`, { status }),
  setViewerPassword: (id, password) => api.post(`/tenant/viewers/${id}/password`, { password }),
  deleteViewer: (id) => api.del(`/tenant/viewers/${id}`),
  viewerProfiles: (id) => api.get(`/tenant/viewers/${id}/profiles`),

  subscription: () => api.get('/tenant/subscription'),
  payments: () => api.get('/tenant/payments'),
  checkout: (method) => api.post('/tenant/payments/checkout', { method }),
  syncPayment: (id) => api.post(`/tenant/payments/${id}/sync`),

  notifications: () => api.get('/tenant/notifications'),
  markNotificationsRead: () => api.post('/tenant/notifications/read'),
  supportRequests: () => api.get('/tenant/support'),
  createSupport: (data) => api.post('/tenant/support', data),
  createPrivacyRequest: (data) => api.post('/tenant/privacy-requests', data),
  termsAcceptances: () => api.get('/tenant/terms-acceptances'),
};
