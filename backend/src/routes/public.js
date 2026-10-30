import { Router } from 'express';
import { asyncHandler, notFound, badRequest } from '../utils/errors.js';
import { getPublicPlatform, getCurrentTerms } from '../services/settingsService.js';
import { getPublicTenant, getTenantBySlug, getBrandRow } from '../services/tenantService.js';
import { getLaunchPosters } from '../services/tmdbService.js';
import { slugField } from '../validators/schemas.js';
import { queryOne } from '../config/db.js';

const router = Router();

router.get('/platform', asyncHandler(async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json(await getPublicPlatform());
}));

/** Mural de pôsteres (capas de lançamento TMDB) para o fundo das telas de login/cadastro. */
router.get('/tmdb-posters', asyncHandler(async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=600');
  res.json({ posters: await getLaunchPosters() });
}));

router.get('/terms/:type', asyncHandler(async (req, res) => {
  const type = req.params.type;
  if (!['terms', 'privacy', 'legal'].includes(type)) throw notFound();
  const doc = await getCurrentTerms(type);
  if (!doc) throw notFound();
  res.json({ type: doc.doc_type, version: doc.version, title: doc.title, content: doc.content, publishedAt: doc.published_at });
}));

router.get('/slug-available', asyncHandler(async (req, res) => {
  const parsed = slugField.safeParse(req.query.slug ?? '');
  if (!parsed.success) return res.json({ available: false, reason: parsed.error.issues[0]?.message });
  const taken = await queryOne('SELECT id FROM tenants WHERE slug = ? LIMIT 1', [parsed.data]);
  res.json({ available: !taken, slug: parsed.data, reason: taken ? 'Este endereço já está em uso.' : null });
}));

router.get('/tenants/:slug', asyncHandler(async (req, res) => {
  const tenant = await getPublicTenant(String(req.params.slug).toLowerCase());
  if (!tenant) throw notFound('Esta página não existe.', 'TENANT_NOT_FOUND');
  res.set('Cache-Control', 'no-cache');
  res.json(tenant);
}));

/** Manifest PWA dinâmico por marca (nome, cores e ícones do assinante). */
router.get('/tenants/:slug/manifest.webmanifest', asyncHandler(async (req, res) => {
  const slug = String(req.params.slug).toLowerCase();
  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw badRequest('Marca inválida.');
  const b = await getBrandRow(tenant.id);
  const icons = [];
  if (b.logo_path) {
    const base = `/uploads/${b.logo_path.replace(/\.webp$/, '')}`;
    icons.push({ src: `${base}-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' });
    icons.push({ src: `${base}-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' });
    icons.push({ src: `${base}-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' });
  } else {
    icons.push({ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' });
    icons.push({ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' });
  }
  res.set('Cache-Control', 'no-cache');
  res.type('application/manifest+json').send(
    JSON.stringify({
      name: b.display_name,
      short_name: b.short_name,
      description: b.welcome_text || `${b.display_name} — webplayer`,
      id: `/${slug}/`,
      start_url: `/${slug}/`,
      scope: `/${slug}/`,
      display: 'standalone',
      orientation: 'any',
      background_color: b.color_background,
      theme_color: b.color_primary,
      lang: 'pt-BR',
      icons,
    }),
  );
}));

export default router;
