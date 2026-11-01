import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

const POSTER_BASE = 'https://image.tmdb.org/t/p/w342';
const PROFILE_BASE = 'https://image.tmdb.org/t/p/w185';
const STILL_BASE = 'https://image.tmdb.org/t/p/w300';
const ADULT = /xxx|adulto|adult|porn|\+ ?18|18 ?\+|er[óo]tic|sexo/i;

let cache = { at: 0, posters: [] };
let inflight = null;

async function tmdbGet(endpoint) {
  const sep = endpoint.includes('?') ? '&' : '?';
  const url = `https://api.themoviedb.org/3/${endpoint}${sep}api_key=${config.tmdb.apiKey}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.tmdb.timeoutMs);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPage(endpoint) {
  const data = await tmdbGet(endpoint);
  return Array.isArray(data?.results) ? data.results : [];
}

/** Tira ano, qualidade e rótulos do provedor do nome para a busca na TMDB. */
const cleanTitle = (name) => String(name ?? '')
  .replace(/[\[(].*?[\])]/g, ' ')
  .replace(/\b(4k|uhd|fhd|hd|sd|1080p|720p|dublado|legendado|dub|leg|nacional)\b/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const enrichCache = new Map();
const ENRICH_TTL_MS = 24 * 3600_000;

const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';
const backdropCache = new Map();

/** Capa horizontal (backdrop) da TMDB para o fundo do destaque. Nunca falha: sem chave/rede/resultado devolve null. */
export async function getBackdrop({ type, name, year }) {
  const title = cleanTitle(name);
  if (!title) return null;
  const kind = type === 'series' ? 'tv' : 'movie';
  const key = `${kind}:${title.toLowerCase()}:${year ?? ''}`;
  const hit = backdropCache.get(key);
  if (hit && Date.now() - hit.at < ENRICH_TTL_MS) return hit.url;
  let url = null;
  try {
    const yearParam = year ? `&${kind === 'tv' ? 'first_air_date_year' : 'year'}=${encodeURIComponent(year)}` : '';
    let results = await fetchPage(`search/${kind}?language=pt-BR&query=${encodeURIComponent(title)}${yearParam}`);
    if (!results.length && yearParam) results = await fetchPage(`search/${kind}?language=pt-BR&query=${encodeURIComponent(title)}`);
    const found = results.find((r) => r.backdrop_path);
    if (found) url = `${BACKDROP_BASE}${found.backdrop_path}`;
  } catch (err) {
    logger.warn('Falha ao buscar backdrop na TMDB', { erro: err?.message });
  }
  backdropCache.set(key, { at: Date.now(), url });
  if (backdropCache.size > 500) backdropCache.delete(backdropCache.keys().next().value);
  return url;
}

/**
 * Elenco com foto (e, para séries, a imagem de cada episódio) vindos da TMDB. Nunca falha: sem chave/rede devolve vazio.
 * `seasons` são os números das temporadas existentes na fonte.
 */
export async function getTitleExtras({ type, name, year, seasons = [] }) {
  const title = cleanTitle(name);
  if (!title) return { cast: [], episodeImages: {} };
  const kind = type === 'series' ? 'tv' : 'movie';
  const key = `${kind}:${title.toLowerCase()}:${year ?? ''}`;
  const hit = enrichCache.get(key);
  if (hit && Date.now() - hit.at < ENRICH_TTL_MS) return hit.data;

  let data = { cast: [], episodeImages: {} };
  try {
    const yearParam = year ? `&${kind === 'tv' ? 'first_air_date_year' : 'year'}=${encodeURIComponent(year)}` : '';
    let results = await fetchPage(`search/${kind}?language=pt-BR&query=${encodeURIComponent(title)}${yearParam}`);
    if (!results.length && yearParam) results = await fetchPage(`search/${kind}?language=pt-BR&query=${encodeURIComponent(title)}`);
    const found = results[0];
    if (found) {
      const [credits, ...seasonData] = await Promise.all([
        tmdbGet(`${kind}/${found.id}/credits?language=pt-BR`),
        ...(kind === 'tv' ? [...new Set(seasons)].slice(0, 20).map((s) => tmdbGet(`tv/${found.id}/season/${s}?language=pt-BR`)) : []),
      ]);
      const cast = (credits?.cast ?? []).slice(0, 14).map((c) => ({
        name: c.name,
        character: c.character || null,
        photo: c.profile_path ? `${PROFILE_BASE}${c.profile_path}` : null,
      }));
      const episodeImages = {};
      for (const s of seasonData) {
        for (const e of s?.episodes ?? []) {
          if (e.still_path) episodeImages[`${e.season_number}:${e.episode_number}`] = `${STILL_BASE}${e.still_path}`;
        }
      }
      data = { cast, episodeImages };
    }
  } catch (err) {
    logger.warn({ err }, 'Falha ao enriquecer título com a TMDB');
  }
  enrichCache.set(key, { at: Date.now(), data });
  if (enrichCache.size > 500) enrichCache.delete(enrichCache.keys().next().value);
  return data;
}

/** Capas de lançamento (TMDB) para o mural de pôsteres das telas públicas. Cache em memória (~1h). */
export async function getLaunchPosters() {
  const now = Date.now();
  if (cache.posters.length && now - cache.at < config.tmdb.cacheTtlMs) return cache.posters;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const [p1, p2, upcoming] = await Promise.all([
        fetchPage('movie/popular?language=pt-BR&page=1'),
        fetchPage('movie/popular?language=pt-BR&page=2'),
        fetchPage('movie/upcoming?language=pt-BR&page=1'),
      ]);
      let movies = [...upcoming, ...p1, ...p2];
      if (!movies.length) movies = await fetchPage('trending/movie/week?language=pt-BR');

      const seen = new Set();
      const posters = [];
      for (const m of movies) {
        if (!m.poster_path || !m.title || seen.has(m.id) || ADULT.test(m.title)) continue;
        seen.add(m.id);
        posters.push({ title: m.title, poster: `${POSTER_BASE}${m.poster_path}`, vote: m.vote_average ?? 0, year: String(m.release_date || '').slice(0, 4) });
        if (posters.length >= 40) break;
      }
      if (posters.length) cache = { at: now, posters };
      return cache.posters;
    } catch (err) {
      logger.warn({ err }, 'Falha ao buscar pôsteres da TMDB');
      return cache.posters;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
