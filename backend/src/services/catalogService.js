import { notFound } from '../utils/errors.js';
import * as sources from './sourceService.js';
import * as viewers from './viewerService.js';
import { currentLine } from './lineContext.js';

export async function resolveServerId(tenantId, raw) {
  // Espectador com linha própria só enxerga o servidor onde a linha existe.
  const line = currentLine();
  if (line) return line.serverId;
  if (raw !== undefined && raw !== '') {
    const id = Number.parseInt(String(raw), 10);
    if (Number.isInteger(id) && id > 0) return id;
  }
  const fallback = await sources.defaultServerId(tenantId);
  if (!fallback) throw notFound('Nenhuma fonte de conteúdo foi configurada ainda.', 'NO_SERVER');
  return fallback;
}

/** Monta a página inicial do espectador: continuar assistindo, favoritos, histórico e carrosséis por categoria. */
export async function buildHome(tenantId, serverId, profile) {
  const kidsOnly = profile.isKids;
  const [continueWatching, history, favorites] = await Promise.all([
    viewers.listContinueWatching(tenantId, profile.id),
    viewers.listHistory(tenantId, profile.id),
    viewers.listFavorites(tenantId, profile.id),
  ]);

  const warnings = [];
  const rails = [];
  const plan = [];
  for (const type of ['vod', 'series', 'live']) {
    try {
      const { categories, warning } = await sources.getCategories(tenantId, serverId, type, { kidsOnly });
      if (warning) warnings.push(warning);
      for (const c of categories.slice(0, type === 'live' ? 3 : 4)) plan.push({ type, category: c });
    } catch (err) {
      warnings.push(err.message);
    }
  }
  const results = await Promise.allSettled(
    plan.map(({ type, category }) => sources.getStreams(tenantId, serverId, type, { categoryId: category.id, pageSize: 20, kidsOnly })),
  );
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.items.length) {
      const { type, category } = plan[i];
      rails.push({ id: `${type}-${category.id}`, type, categoryId: category.id, title: category.name, items: r.value.items });
    } else if (r.status === 'rejected') {
      warnings.push(r.reason?.message ?? 'Falha ao carregar categoria.');
    }
  });

  return {
    serverId,
    continueWatching,
    history: history.slice(0, 20),
    favorites: favorites.slice(0, 20),
    rails,
    warning: [...new Set(warnings)][0] ?? null,
  };
}

export async function search(tenantId, serverId, q, profile) {
  const kidsOnly = profile.isKids;
  const [live, vod, series] = await Promise.allSettled([
    sources.getStreams(tenantId, serverId, 'live', { q, pageSize: 30, kidsOnly }),
    sources.getStreams(tenantId, serverId, 'vod', { q, pageSize: 30, kidsOnly }),
    sources.getStreams(tenantId, serverId, 'series', { q, pageSize: 30, kidsOnly }),
  ]);
  const first = [live, vod, series].find((r) => r.status === 'rejected');
  if (first && [live, vod, series].every((r) => r.status === 'rejected')) throw first.reason;
  return {
    live: live.status === 'fulfilled' ? live.value.items : [],
    vod: vod.status === 'fulfilled' ? vod.value.items : [],
    series: series.status === 'fulfilled' ? series.value.items : [],
    warning: first ? first.reason?.message : null,
  };
}
