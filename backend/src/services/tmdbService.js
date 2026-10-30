import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

const POSTER_BASE = 'https://image.tmdb.org/t/p/w342';
const ADULT = /xxx|adulto|adult|porn|\+ ?18|18 ?\+|er[óo]tic|sexo/i;

let cache = { at: 0, posters: [] };
let inflight = null;

async function fetchPage(endpoint) {
  const sep = endpoint.includes('?') ? '&' : '?';
  const url = `https://api.themoviedb.org/3/${endpoint}${sep}api_key=${config.tmdb.apiKey}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.tmdb.timeoutMs);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
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
