/** Normaliza itens vindos de catálogo, favoritos, histórico e "continuar assistindo" para um formato único. */
export function toContent(item, type, serverId) {
  return {
    streamId: String(item.streamId ?? item.id),
    type: item.contentType ?? type,
    serverId: item.serverId ?? serverId,
    name: item.name,
    icon: item.icon ?? null,
    year: item.year ?? null,
    rating: item.rating ?? null,
    positionSeconds: item.positionSeconds ?? null,
    durationSeconds: item.durationSeconds ?? null,
    episodeId: item.episodeId ?? null,
  };
}

export const watchPath = (slug, c, { restart = false, resume = false } = {}) => {
  const q = new URLSearchParams();
  if (c.serverId) q.set('server', c.serverId);
  if (restart) q.set('inicio', '1');
  if (resume) q.set('retomar', '1');
  const qs = q.toString();
  return `/${slug}/assistir/${c.type}/${encodeURIComponent(c.streamId)}${qs ? `?${qs}` : ''}`;
};

export const episodePath = (slug, { serverId, seriesId, episodeId, ext }) => {
  const q = new URLSearchParams({ ep: String(episodeId) });
  if (ext) q.set('ext', ext);
  if (serverId) q.set('server', serverId);
  return `/${slug}/assistir/series/${encodeURIComponent(seriesId)}?${q.toString()}`;
};

export const contentRef = (c) => ({ serverId: Number(c.serverId), contentType: c.type, streamId: c.streamId, name: c.name, icon: c.icon });

export const TYPE_LABEL = { live: 'Canal ao vivo', vod: 'Filme', series: 'Série' };

export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
