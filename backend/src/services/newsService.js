import { query, queryOne } from '../config/db.js';
import * as sources from './sourceService.js';
import * as catalog from './catalogService.js';

const SHOW_LIMIT = 60;

/** Sininho de novidades do perfil: o que entrou na fonte nos últimos 7 dias, depois do último "Limpar". */
export async function getNews(req, serverId, { fetch = false } = {}) {
  const state = await queryOne('SELECT news_seen_at, news_cleared_at FROM viewer_profiles WHERE id = ?', [req.profile.id]);
  const clearedAt = state?.news_cleared_at ? new Date(state.news_cleared_at).getTime() : 0;
  const seenAt = state?.news_seen_at ? new Date(state.news_seen_at).getTime() : 0;

  const hide = {};
  if (req.viewer.adult_control_enabled) {
    await Promise.all(['live', 'vod', 'series'].map(async (t) => {
      hide[t] = (await catalog.adultGate(req, serverId, t).catch(() => null))?.ids ?? null;
    }));
  }
  const items = await sources.listNews(req.tenant.id, serverId, { kidsOnly: req.profile.isKids, hide, since: clearedAt, allowFetch: fetch });
  const marked = items.map((i) => ({ ...i, isNew: Date.parse(i.addedAt) > seenAt }));
  return { serverId, unread: marked.filter((i) => i.isNew).length, items: marked.slice(0, SHOW_LIMIT) };
}

export const markNewsSeen = (profileId) => query('UPDATE viewer_profiles SET news_seen_at = UTC_TIMESTAMP(3) WHERE id = ?', [profileId]);

export const clearNews = (profileId) =>
  query('UPDATE viewer_profiles SET news_seen_at = UTC_TIMESTAMP(3), news_cleared_at = UTC_TIMESTAMP(3) WHERE id = ?', [profileId]);
