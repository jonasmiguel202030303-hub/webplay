import { api } from './api.js';

/** Cria o cliente do espectador para uma marca. O perfil ativo segue no cabeçalho X-Profile-Id. */
export function createViewerService(slug, getProfileId) {
  const base = `/v/${encodeURIComponent(slug)}`;
  const withProfile = (opts = {}) => {
    const id = getProfileId?.();
    return id ? { ...opts, headers: { ...(opts.headers ?? {}), 'X-Profile-Id': String(id) } } : opts;
  };
  const get = (p, opts) => api.get(`${base}${p}`, withProfile(opts));
  const post = (p, body, opts) => api.post(`${base}${p}`, body, withProfile(opts));
  const put = (p, body, opts) => api.put(`${base}${p}`, body, withProfile(opts));
  const del = (p, opts) => api.del(`${base}${p}`, withProfile(opts));

  return {
    register: (data) => post('/register', data),
    login: (email, password) => post('/login', { email, password }),
    lineLogin: (username, password) => post('/line-login', { username, password }),
    logout: () => post('/logout'),
    forgotPassword: (email) => post('/forgot-password', { email }),
    resetPassword: (token, password) => post('/reset-password', { token, password }),
    me: () => get('/me'),
    exportData: () => get('/me/export'),
    deleteAccount: (password) => api.del(`${base}/me`, { ...withProfile(), body: { password } }),

    profiles: () => get('/profiles'),
    createProfile: (data) => post('/profiles', data),
    updateProfile: (id, data) => put(`/profiles/${id}`, data),
    deleteProfile: (id) => del(`/profiles/${id}`),

    home: (serverId) => get('/home', { query: { serverId } }),
    search: (q, serverId) => get('/search', { query: { q, serverId } }),
    categories: (type, serverId) => get(`/catalog/${type}/categories`, { query: { serverId } }),
    streams: (type, params) => get(`/catalog/${type}/streams`, { query: params }),
    play: (type, streamId, serverId) => get(`/play/${type}/${encodeURIComponent(streamId)}`, { query: { serverId } }),
    playEpisode: (seriesId, episodeId, ext, serverId) => get(`/play/series/${encodeURIComponent(seriesId)}/episode/${encodeURIComponent(episodeId)}`, { query: { serverId, ext } }),
    details: (type, streamId, serverId) => get(`/details/${type}/${encodeURIComponent(streamId)}`, { query: { serverId } }),
    epg: (streamId, serverId) => get(`/epg/${encodeURIComponent(streamId)}`, { query: { serverId } }),
    posters: () => api.get(`${base}/posters`),

    favorites: () => get('/favorites'),
    addFavorite: (ref) => put('/favorites', ref),
    removeFavorite: (ref) => post('/favorites/remove', ref),
    history: () => get('/history'),
    clearHistory: () => del('/history'),
    saveProgress: (data, opts) => put('/progress', data, opts),
    continueWatching: () => get('/continue-watching'),
  };
}
