import { config } from '../config/env.js';
import { SourceError, safeFetchJson, safeFetchText } from './safeFetch.js';

const asArray = (data) => {
  if (Array.isArray(data)) return data;
  // Alguns painéis devolvem objeto indexado em vez de array.
  if (data && typeof data === 'object') return Object.values(data);
  return [];
};
const str = (v) => (v === null || v === undefined ? '' : String(v));
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const unixToIso = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
};

const ACTIONS = {
  live: { categories: 'get_live_categories', streams: 'get_live_streams' },
  vod: { categories: 'get_vod_categories', streams: 'get_vod_streams' },
  series: { categories: 'get_series_categories', streams: 'get_series' },
};

/**
 * Adaptador para APIs compatíveis com Xtream Codes (player_api.php).
 * Não presume que todas as versões ofereçam os mesmos recursos: cada método trata ausência de dados.
 */
export function createXtreamAdapter({ baseUrl, username, password, cfg = config.source }) {
  const api = (action, extra = {}) => {
    const params = new URLSearchParams({ username, password });
    if (action) params.set('action', action);
    for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    return safeFetchJson(`${baseUrl}/player_api.php?${params.toString()}`, { cfg });
  };

  return {
    name: 'xtream',

    /** Verifica só se a DNS responde (sem credenciais): qualquer resposta HTTP abaixo de 500 conta como servidor no ar. */
    async probe() {
      const res = await safeFetchText(`${baseUrl}/player_api.php`, { cfg });
      if (res.status >= 500) throw new SourceError('SERVER_ERROR', `O servidor da fonte respondeu com erro (${res.status}).`);
      let xtream = false;
      try {
        const data = JSON.parse(res.body);
        xtream = !!(data?.user_info || data?.server_info);
      } catch {
        xtream = /xui|xtream/i.test(res.body);
      }
      return { reachable: true, httpStatus: res.status, looksLikeXtream: xtream };
    },

    /** Consulta dados da conta. Não devolve credenciais. */
    async authenticate() {
      const data = await api();
      const info = data?.user_info;
      if (!info || typeof info !== 'object') {
        throw new SourceError('BAD_RESPONSE', 'A resposta não parece ser de uma API Xtream Codes (user_info ausente).');
      }
      const authenticated = Number(info.auth) === 1 || info.auth === true;
      if (!authenticated) throw new SourceError('AUTH_FAILED', 'Usuário ou senha recusados pelo servidor.');
      const status = str(info.status);
      return {
        status,
        active: !status || /^active$/i.test(status),
        expiresAt: unixToIso(info.exp_date),
        createdAt: unixToIso(info.created_at),
        isTrial: str(info.is_trial) === '1',
        maxConnections: num(info.max_connections),
        activeConnections: num(info.active_cons),
        allowedFormats: Array.isArray(info.allowed_output_formats) ? info.allowed_output_formats.map(str) : [],
        serverProtocol: str(data?.server_info?.server_protocol) || null,
      };
    },

    async getCategories(type) {
      const action = ACTIONS[type]?.categories;
      if (!action) throw new SourceError('UNSUPPORTED', 'Tipo de conteúdo não suportado.');
      const data = await api(action);
      return asArray(data)
        .filter((c) => c && c.category_id !== undefined)
        .map((c, i) => ({ id: str(c.category_id), name: str(c.category_name) || `Categoria ${c.category_id}`, parentId: c.parent_id ? str(c.parent_id) : null, position: i }));
    },

    async getStreams(type, categoryId) {
      const action = ACTIONS[type]?.streams;
      if (!action) throw new SourceError('UNSUPPORTED', 'Tipo de conteúdo não suportado.');
      const data = await api(action, { category_id: categoryId });
      const isSeries = type === 'series';
      return asArray(data)
        .filter((s) => s && (isSeries ? s.series_id : s.stream_id) !== undefined && (isSeries ? s.series_id : s.stream_id) !== null)
        .map((s) => ({
          id: str(isSeries ? s.series_id : s.stream_id),
          name: str(s.name) || `Canal ${s.stream_id}`,
          icon: str(isSeries ? s.cover : s.stream_icon) || null,
          categoryId: str(s.category_id ?? s.category_ids?.[0] ?? ''),
          number: num(s.num),
          rating: num(s.rating_5based ?? s.rating),
          year: str(s.year ?? s.releaseDate ?? s.release_date).slice(0, 4) || null,
          extension: str(s.container_extension) || null,
          addedAt: unixToIso(s.added ?? s.last_modified),
          plot: isSeries ? str(s.plot) || null : null,
          backdrop: isSeries && Array.isArray(s.backdrop_path) ? str(s.backdrop_path[0]) || null : null,
          type,
        }));
    },

    /** Detalhes de um filme (sinopse, elenco, trailer...). Campos ausentes viram null. */
    async getVodInfo(id) {
      const data = await api('get_vod_info', { vod_id: id });
      const i = data?.info ?? {};
      return {
        plot: str(i.plot ?? i.description) || null,
        cast: str(i.cast ?? i.actors) || null,
        director: str(i.director) || null,
        genre: str(i.genre) || null,
        releaseDate: str(i.releasedate ?? i.release_date) || null,
        duration: str(i.duration) || null,
        rating: num(i.rating_5based ?? i.rating),
        backdrop: (Array.isArray(i.backdrop_path) ? str(i.backdrop_path[0]) : str(i.backdrop_path)) || null,
        cover: str(i.movie_image ?? i.cover_big) || null,
        trailer: str(i.youtube_trailer) || null,
        extension: str(data?.movie_data?.container_extension) || null,
      };
    },

    /** Temporadas e episódios de uma série. */
    async getSeriesInfo(id) {
      const data = await api('get_series_info', { series_id: id });
      const i = data?.info ?? {};
      const episodesRaw = data?.episodes;
      const bySeason = Array.isArray(episodesRaw) ? Object.fromEntries(episodesRaw.map((list, idx) => [String(idx + 1), list])) : (episodesRaw ?? {});
      const seasons = Object.keys(bySeason)
        .sort((a, b) => Number(a) - Number(b))
        .map((season) => ({
          season: Number(season),
          episodes: asArray(bySeason[season])
            .filter((e) => e && e.id !== undefined)
            .map((e) => ({
              id: str(e.id),
              number: num(e.episode_num),
              title: str(e.title) || `Episódio ${e.episode_num ?? ''}`.trim(),
              extension: str(e.container_extension) || 'mp4',
              duration: str(e.info?.duration) || null,
              plot: str(e.info?.plot) || null,
              image: str(e.info?.movie_image) || null,
            })),
        }));
      return {
        plot: str(i.plot) || null,
        cast: str(i.cast) || null,
        director: str(i.director) || null,
        genre: str(i.genre) || null,
        releaseDate: str(i.releaseDate ?? i.release_date) || null,
        rating: num(i.rating_5based ?? i.rating),
        backdrop: (Array.isArray(i.backdrop_path) ? str(i.backdrop_path[0]) : str(i.backdrop_path)) || null,
        cover: str(i.cover) || null,
        seasons,
      };
    },

    /** Programação curta (EPG) de um canal ao vivo. Títulos vêm codificados em base64 na API Xtream. */
    async getShortEpg(streamId, limit = 8) {
      const data = await api('get_short_epg', { stream_id: streamId, limit });
      const decode = (v) => {
        const s = str(v);
        if (!s) return '';
        try {
          const out = Buffer.from(s, 'base64').toString('utf8');
          return out && !out.includes('\ufffd') ? out : s;
        } catch {
          return s;
        }
      };
      return asArray(data?.epg_listings).map((e) => ({
        title: decode(e.title),
        description: decode(e.description),
        start: unixToIso(e.start_timestamp),
        end: unixToIso(e.stop_timestamp),
      }));
    },

    /** Monta a URL de reprodução direta. Contém credenciais: entregar apenas a espectador autenticado e autorizado. */
    buildPlayUrl({ type, id, extension, allowedFormats = [] }) {
      const u = encodeURIComponent(username);
      const p = encodeURIComponent(password);
      const safeId = encodeURIComponent(id);
      if (type === 'live') {
        const format = allowedFormats.includes('m3u8') || allowedFormats.length === 0 ? 'm3u8' : allowedFormats[0];
        return { url: `${baseUrl}/live/${u}/${p}/${safeId}.${format}`, format };
      }
      const ext = (extension || 'mp4').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'mp4';
      return { url: `${baseUrl}/${type === 'series' ? 'series' : 'movie'}/${u}/${p}/${safeId}.${ext}`, format: ext };
    },
  };
}

const registry = { xtream: createXtreamAdapter };
export function getAdapter(name, options) {
  const factory = registry[name];
  if (!factory) throw new SourceError('UNSUPPORTED', `Adaptador "${name}" não disponível.`);
  return factory(options);
}
