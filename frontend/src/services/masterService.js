import { api } from './api.js';

export const masterService = {
  dashboard: () => api.get('/master/dashboard'),
  system: () => api.get('/master/system'),

  tenants: (query) => api.get('/master/tenants', { query }),
  tenant: (id) => api.get(`/master/tenants/${id}`),
  suspend: (id, reason) => api.post(`/master/tenants/${id}/suspend`, { reason }),
  reactivate: (id) => api.post(`/master/tenants/${id}/reactivate`),
  grantDays: (id, days, reason) => api.post(`/master/tenants/${id}/grant-days`, { days, reason }),

  settings: () => api.get('/master/settings'),
  saveSettings: (data) => api.put('/master/settings', data),
  termsVersions: (docType) => api.get('/master/terms', { query: { docType } }),
  publishTerms: (data) => api.post('/master/terms', data),

  mercadopago: () => api.get('/master/mercadopago'),
  saveMercadopago: (data) => api.put('/master/mercadopago', data),
  setMercadopagoMode: (mode) => api.put('/master/mercadopago/mode', { mode }),
  testMercadopago: (mode) => api.post('/master/mercadopago/test', { mode }),

  payments: (query) => api.get('/master/payments', { query }),
  paymentEvents: (id) => api.get(`/master/payments/${id}/events`),
  syncPayment: (id) => api.post(`/master/payments/${id}/sync`),
  webhookEvents: (query) => api.get('/master/webhook-events', { query }),

  audit: (query) => api.get('/master/audit', { query }),

  admins: () => api.get('/master/admins'),
  createAdmin: (data) => api.post('/master/admins', data),
  setAdminStatus: (id, status) => api.patch(`/master/admins/${id}/status`, { status }),

  support: (query) => api.get('/master/support', { query }),
  setSupportStatus: (id, status) => api.patch(`/master/support/${id}`, { status }),
  privacyRequests: (query) => api.get('/master/privacy-requests', { query }),
  setPrivacyStatus: (id, status) => api.patch(`/master/privacy-requests/${id}`, { status }),
};
