import { api } from './api.js';

export const authService = {
  register: (data) => api.post('/auth/register', data),
  activate: (token) => api.post('/auth/activate', { token }),
  resendActivation: (email) => api.post('/auth/resend-activation', { email }),
  login: (email, password) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post('/auth/reset-password', { token, password }),
  changePassword: (currentPassword, newPassword) => api.post('/auth/change-password', { currentPassword, newPassword }),
};

export const publicService = {
  platform: () => api.get('/public/platform'),
  terms: (type) => api.get(`/public/terms/${type}`),
  slugAvailable: (slug, signal) => api.get('/public/slug-available', { query: { slug }, signal }),
  tenant: (slug) => api.get(`/public/tenants/${encodeURIComponent(slug)}`),
};
