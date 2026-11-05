import { query, queryOne, isDuplicateError, parseJson } from '../config/db.js';
import { conflict, notFound } from '../utils/errors.js';
import { audit } from './auditService.js';
import { clearChatSettingsCache } from './chatService.js';
import { parseWordList } from '../utils/chatFilter.js';
import { getAccess, getSubscriptionView, syncExpiryNotifications } from './subscriptionService.js';

const slugCache = new Map();
const SLUG_TTL = 10_000;

export function invalidateSlugCache(slug) {
  if (slug) slugCache.delete(slug);
  else slugCache.clear();
}

export async function getTenantBySlug(slug) {
  const hit = slugCache.get(slug);
  if (hit && Date.now() - hit.at < SLUG_TTL) return hit.tenant;
  const tenant = await queryOne('SELECT id, slug, owner_user_id FROM tenants WHERE slug = ? AND deleted_at IS NULL LIMIT 1', [slug]);
  slugCache.set(slug, { at: Date.now(), tenant });
  return tenant;
}

export const getTenantByOwner = (userId) =>
  queryOne('SELECT id, slug, owner_user_id FROM tenants WHERE owner_user_id = ? AND deleted_at IS NULL LIMIT 1', [userId]);

const asset = (p) => (p ? `/uploads/${p}` : null);

export function brandView(row) {
  return {
    displayName: row.display_name,
    shortName: row.short_name,
    colors: { primary: row.color_primary, secondary: row.color_secondary, button: row.color_button, background: row.color_background },
    assets: {
      logo: asset(row.logo_path),
      favicon: asset(row.favicon_path),
      background: asset(row.background_path),
      banner: asset(row.banner_path),
      loginImage: asset(row.login_image_path),
      menuLogo: asset(row.menu_logo_path),
      contentLogo: asset(row.content_logo_path),
    },
    bannerTitle: row.banner_title,
    bannerSubtitle: row.banner_subtitle,
    welcomeText: row.welcome_text,
    supportText: row.support_text,
    whatsapp: row.whatsapp,
    externalLinks: parseJson(row.external_links, []),
    notice: row.notice,
    footerText: row.footer_text,
  };
}

export async function getBrandRow(tenantId) {
  return queryOne('SELECT * FROM tenant_branding WHERE tenant_id = ?', [tenantId]);
}

export async function getBrand(tenantId) {
  const row = await getBrandRow(tenantId);
  if (!row) throw notFound('Marca não encontrada.');
  return brandView(row);
}

export async function updateBrand(req, tenant, data) {
  if (data.slug && data.slug !== tenant.slug) {
    try {
      await query('UPDATE tenants SET slug = ? WHERE id = ?', [data.slug, tenant.id]);
    } catch (err) {
      if (isDuplicateError(err)) throw conflict('Este endereço já está em uso. Escolha outro.', 'SLUG_TAKEN');
      throw err;
    }
    invalidateSlugCache(tenant.slug);
    invalidateSlugCache(data.slug);
    await audit(req, { action: 'tenant.slug_change', entityType: 'tenant', entityId: tenant.id, metadata: { from: tenant.slug, to: data.slug } });
  }
  await query(
    `UPDATE tenant_branding SET display_name = ?, short_name = ?, color_primary = ?, color_secondary = ?, color_button = ?, color_background = ?,
      banner_title = ?, banner_subtitle = ?, welcome_text = ?, support_text = ?, whatsapp = ?, external_links = ?, notice = ?, footer_text = ?
     WHERE tenant_id = ?`,
    [
      data.displayName, data.shortName, data.colorPrimary, data.colorSecondary, data.colorButton, data.colorBackground,
      data.bannerTitle || null, data.bannerSubtitle || null, data.welcomeText || null, data.supportText || null,
      data.whatsapp || null, JSON.stringify(data.externalLinks ?? []), data.notice || null, data.footerText || null,
      tenant.id,
    ],
  );
  await audit(req, { action: 'tenant.brand_update', entityType: 'tenant', entityId: tenant.id });
  return getBrand(tenant.id);
}

export const settingsView = (row) => ({
  allowViewerSignup: !!row.allow_viewer_signup,
  kidsProfilesEnabled: !!row.kids_profiles_enabled,
  maxViewers: row.max_viewers,
  maxProfilesPerViewer: row.max_profiles_per_viewer,
  maxSessionsPerViewer: row.max_sessions_per_viewer,
  catalogCacheTtlSeconds: row.catalog_cache_ttl_seconds,
  uiSoundsEnabled: !!row.ui_sounds_enabled,
  chatEnabled: row.chat_enabled === undefined ? true : !!row.chat_enabled,
  chatBannedWords: row.chat_banned_words ?? '',
});

export async function getTenantSettingsRow(tenantId) {
  return queryOne('SELECT * FROM tenant_settings WHERE tenant_id = ?', [tenantId]);
}

export async function getTenantSettings(tenantId) {
  const row = await getTenantSettingsRow(tenantId);
  if (!row) throw notFound('Configurações não encontradas.');
  return settingsView(row);
}

export async function updateTenantSettings(req, tenantId, d) {
  await query(
    `UPDATE tenant_settings SET allow_viewer_signup = ?, kids_profiles_enabled = ?, max_profiles_per_viewer = ?,
       max_sessions_per_viewer = ?, catalog_cache_ttl_seconds = ?, ui_sounds_enabled = ?,
       chat_enabled = COALESCE(?, chat_enabled), chat_banned_words = COALESCE(?, chat_banned_words) WHERE tenant_id = ?`,
    [
      d.allowViewerSignup ? 1 : 0, d.kidsProfilesEnabled ? 1 : 0, d.maxProfilesPerViewer, d.maxSessionsPerViewer, d.catalogCacheTtlSeconds, d.uiSoundsEnabled ? 1 : 0,
      d.chatEnabled === undefined ? null : d.chatEnabled ? 1 : 0,
      d.chatBannedWords === undefined ? null : parseWordList(d.chatBannedWords).join('\n'),
      tenantId,
    ],
  );
  clearChatSettingsCache(tenantId);
  await audit(req, { action: 'tenant.settings_update', entityType: 'tenant', entityId: tenantId });
  return getTenantSettings(tenantId);
}

/** Dados públicos de uma marca (página do espectador). Nunca inclui dados de cobrança. */
export async function getPublicTenant(slug) {
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return null;
  const [brand, settings, { access }] = await Promise.all([getBrand(tenant.id), getTenantSettings(tenant.id), getAccess(tenant.id)]);
  return {
    slug: tenant.slug,
    brand,
    allowViewerSignup: settings.allowViewerSignup,
    kidsProfilesEnabled: settings.kidsProfilesEnabled,
    maxProfilesPerViewer: settings.maxProfilesPerViewer,
    uiSoundsEnabled: settings.uiSoundsEnabled,
    chatEnabled: settings.chatEnabled,
    available: access.hasAccess,
  };
}

export async function getOverview(tenant) {
  const sub = await queryOne('SELECT s.*, t.owner_user_id, u.email AS owner_email, u.name AS owner_name FROM subscriptions s JOIN tenants t ON t.id = s.tenant_id JOIN users u ON u.id = t.owner_user_id WHERE s.tenant_id = ?', [tenant.id]);
  if (sub) await syncExpiryNotifications(sub);
  const [brand, subscription, profiles, viewers, servers, activity, notifications] = await Promise.all([
    getBrand(tenant.id),
    getSubscriptionView(tenant.id),
    queryOne('SELECT COUNT(*) AS n FROM viewer_profiles WHERE tenant_id = ? AND deleted_at IS NULL', [tenant.id]),
    queryOne('SELECT COUNT(*) AS n FROM viewer_accounts WHERE tenant_id = ? AND deleted_at IS NULL', [tenant.id]),
    queryOne('SELECT COUNT(*) AS n, SUM(status = \'online\') AS online FROM source_servers WHERE tenant_id = ? AND deleted_at IS NULL', [tenant.id]),
    query('SELECT action, result, created_at FROM audit_logs WHERE tenant_id = ? ORDER BY id DESC LIMIT 8', [tenant.id]),
    query('SELECT id, kind, title, body, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 5', [tenant.owner_user_id]),
  ]);
  return {
    tenant: { slug: tenant.slug },
    brand,
    subscription,
    counts: { profiles: Number(profiles.n), viewers: Number(viewers.n), servers: Number(servers.n), serversOnline: Number(servers.online ?? 0) },
    activity: activity.map((a) => ({ action: a.action, result: a.result, at: a.created_at })),
    notifications: notifications.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, read: !!n.read_at, at: n.created_at })),
  };
}
