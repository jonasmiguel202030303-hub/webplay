import { query, queryOne } from '../config/db.js';
import { defaultPlatformSettings } from '../../database/defaults.js';

let cache = { at: 0, data: null };
const TTL_MS = 5000;

export function invalidateSettingsCache() {
  cache = { at: 0, data: null };
}

export async function getSettings() {
  if (cache.data && Date.now() - cache.at < TTL_MS) return cache.data;
  const rows = await query('SELECT setting_key, setting_value FROM platform_settings');
  const data = { ...defaultPlatformSettings };
  for (const row of rows) {
    try {
      data[row.setting_key] = JSON.parse(row.setting_value);
    } catch {
      data[row.setting_key] = row.setting_value;
    }
  }
  cache = { at: Date.now(), data };
  return data;
}

export async function setSettings(updates, userId) {
  for (const [key, value] of Object.entries(updates)) {
    await query(
      `INSERT INTO platform_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
      [key, JSON.stringify(value), userId ?? null],
    );
  }
  invalidateSettingsCache();
  return getSettings();
}

/** Subconjunto seguro para exibição pública (landing, cadastro, rodapé). */
export async function getPublicPlatform() {
  const s = await getSettings();
  return {
    productName: s.product_name,
    priceCents: s.price_cents,
    subscriptionMonths: s.subscription_months,
    trialHours: s.trial_hours,
    headline: s.commercial_headline,
    description: s.commercial_description,
    footerText: s.footer_text,
    supportWhatsapp: s.support_whatsapp || null,
    supportEmail: s.support_email || null,
    supportHoursText: s.support_hours_text || null,
  };
}

export async function getCurrentTerms(docType) {
  return queryOne(
    'SELECT id, doc_type, version, title, content, published_at FROM terms_versions WHERE doc_type = ? AND is_current = 1 ORDER BY id DESC LIMIT 1',
    [docType],
  );
}
