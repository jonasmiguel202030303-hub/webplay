import { Router } from 'express';
import { asyncHandler, badRequest } from '../utils/errors.js';
import { idParam } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { sensitiveLimiter, authLimiter } from '../middleware/rateLimit.js';
import { noStore } from '../middleware/security.js';
import { authenticateViewer, bindViewerLine, requireActiveLine, requireActiveSubscription, requireProfile, resolveTenantFromSlug } from '../middleware/auth.js';
import {
  viewerRegisterSchema, loginSchema, lineLoginSchema, emailOnlySchema, resetSchema, profileSchema, contentRef, progressSchema, viewerDeleteSchema,
  adultControlSchema, adultControlVerifySchema, chatMessageSchema,
} from '../validators/schemas.js';
import * as viewers from '../services/viewerService.js';
import * as sources from '../services/sourceService.js';
import * as catalog from '../services/catalogService.js';
import * as chat from '../services/chatService.js';
import * as news from '../services/newsService.js';
import { getBackdrop } from '../services/tmdbService.js';
import { VIEWER_COOKIE, cookieOptions, signAdultUnlockToken, verifyToken, viewerCookieMaxAge } from '../utils/tokens.js';

const router = Router({ mergeParams: true });
router.use(noStore, resolveTenantFromSlug);

const TYPES = new Set(['live', 'vod', 'series']);
const typeParam = (req) => {
  if (!TYPES.has(req.params.type)) throw badRequest('Tipo de conteúdo inválido. Use "live", "vod" ou "series".', 'INVALID_TYPE');
  return req.params.type;
};
const streamIdParam = (req) => {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(req.params.streamId)) throw badRequest('Identificador de conteúdo inválido.', 'INVALID_ID');
  return req.params.streamId;
};

const setSession = (res, token) => res.cookie(VIEWER_COOKIE, token, cookieOptions(viewerCookieMaxAge()));

/** Com o PIN parental ativo, abrir/reproduzir um título de categoria adulta exige a prova de desbloqueio dessa categoria. */
const guardAdult = async (req, serverId, type, streamId) => {
  if (!req.viewer.adult_control_enabled) return;
  const gate = await catalog.adultGate(req, serverId, type);
  const stream = await sources.getStream(req.tenant.id, serverId, type, streamId);
  gate?.assertAllowed(stream.categoryId);
};

// ----- Acesso (sem sessão) -----
router.post('/register', authLimiter(), requireActiveSubscription, validate(viewerRegisterSchema), asyncHandler(async (req, res) => {
  const { email, password } = req.valid.body;
  await viewers.registerViewer(req, req.tenant, req.valid.body);
  const { token, viewer } = await viewers.loginViewer(req, req.tenant, { email, password });
  setSession(res, token);
  res.status(201).json({ viewer, profiles: await viewers.listProfiles(req.tenant.id, viewer.id) });
}));

router.post('/login', authLimiter(), requireActiveSubscription, validate(loginSchema), asyncHandler(async (req, res) => {
  const { token, viewer } = await viewers.loginViewer(req, req.tenant, req.valid.body);
  setSession(res, token);
  res.json({ viewer, profiles: await viewers.listProfiles(req.tenant.id, viewer.id) });
}));

// Entrada com usuário e senha da linha Xtream do cliente, conferidos em tempo real no servidor.
router.post('/line-login', authLimiter(), requireActiveSubscription, validate(lineLoginSchema), asyncHandler(async (req, res) => {
  const { token, viewer, account } = await viewers.loginViewerWithLine(req, req.tenant, req.valid.body);
  setSession(res, token);
  res.json({ viewer, account, profiles: await viewers.listProfiles(req.tenant.id, viewer.id) });
}));

router.get('/posters', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ posters: await sources.listPosters(req.tenant.id) });
}));

router.post('/forgot-password', authLimiter(), validate(emailOnlySchema), asyncHandler(async (req, res) => {
  const result = await viewers.forgotViewerPassword(req, req.tenant, req.valid.body.email);
  res.json({ ok: true, message: 'Se o e-mail estiver cadastrado, enviaremos as instruções de redefinição.', ...result });
}));

router.post('/reset-password', authLimiter(), validate(resetSchema), asyncHandler(async (req, res) => {
  await viewers.resetViewerPassword(req, req.tenant, req.valid.body);
  res.json({ ok: true, message: 'Senha redefinida. Entre com a nova senha.' });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const payload = verifyToken(req.cookies?.[VIEWER_COOKIE], 'viewer');
  if (payload?.jti && Number(payload.tid) === req.tenant.id) await viewers.logoutViewer(payload.jti);
  res.clearCookie(VIEWER_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
}));

// ----- Conta e perfis (sessão do espectador; funcionam mesmo com assinatura vencida, para sair/excluir dados) -----
router.use(authenticateViewer, bindViewerLine);

router.get('/me', asyncHandler(async (req, res) => {
  res.json(await viewers.getViewerSession(req.tenant, req.viewer));
}));

router.get('/me/export', asyncHandler(async (req, res) => {
  res.json(await viewers.exportViewerData(req.tenant, req.viewer.id));
}));

router.delete('/me', validate(viewerDeleteSchema), asyncHandler(async (req, res) => {
  await viewers.deleteViewerAccount(req, req.tenant, req.viewer.id, req.valid.body.password);
  res.clearCookie(VIEWER_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
}));

router.get('/profiles', asyncHandler(async (req, res) => {
  res.json({ profiles: await viewers.listProfiles(req.tenant.id, req.viewer.id) });
}));

router.post('/profiles', validate(profileSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ profile: await viewers.createProfile(req, req.tenant, req.viewer.id, req.valid.body) });
}));

router.put('/profiles/:id', validate(profileSchema), asyncHandler(async (req, res) => {
  res.json({ profile: await viewers.updateProfile(req, req.tenant, req.viewer.id, idParam(req), req.valid.body) });
}));

router.delete('/profiles/:id', asyncHandler(async (req, res) => {
  await viewers.deleteProfile(req, req.tenant, req.viewer.id, idParam(req));
  res.json({ ok: true });
}));

// ----- Controle parental (PIN de categorias adultas) -----
router.get('/account/adult-control', asyncHandler(async (req, res) => {
  res.json(await viewers.getAdultControlStatus(req.viewer.id));
}));

router.put('/account/adult-control', sensitiveLimiter(), validate(adultControlSchema), asyncHandler(async (req, res) => {
  res.json(await viewers.setAdultControl(req, req.tenant, req.viewer.id, req.valid.body));
}));

router.post('/account/adult-control/verify', authLimiter(), validate(adultControlVerifySchema), asyncHandler(async (req, res) => {
  const { pin, type, categoryId } = req.valid.body;
  const ok = await viewers.verifyAdultPin(req.viewer.id, pin);
  const token = ok && type && categoryId ? signAdultUnlockToken({ viewerId: req.viewer.id, scope: `${type}:${categoryId}` }) : null;
  res.json({ ok, token });
}));

// ----- Conteúdo (exige assinatura/teste ativo e perfil) -----
router.use(requireActiveSubscription, requireProfile, requireActiveLine);

router.get('/servers', asyncHandler(async (req, res) => {
  res.json({ servers: await sources.listServersForViewer(req.tenant.id) });
}));

router.get('/home', asyncHandler(async (req, res) => {
  const serverId = await catalog.resolveServerId(req.tenant.id, req.query.serverId);
  res.json(await catalog.buildHome(req.tenant.id, serverId, req.profile, { hideAdult: !!req.viewer.adult_control_enabled }));
}));

router.post('/catalog/refresh', sensitiveLimiter(), asyncHandler(async (req, res) => {
  const serverId = await catalog.resolveServerId(req.tenant.id, req.query.serverId);
  res.json(await sources.refreshViewerCatalog(req.tenant.id, serverId));
}));

// ----- Chat dos espectadores (consulta periódica; sem conexão aberta, por causa do proxy da hospedagem) -----
router.get('/chat', asyncHandler(async (req, res) => {
  const after = Math.max(0, Number.parseInt(req.query.after ?? '0', 10) || 0);
  res.json({ meId: req.profile.id, ...(await chat.listChat(req.tenant.id, req.profile, after)) });
}));

router.post('/chat', validate(chatMessageSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ message: await chat.postChat(req.tenant.id, req.profile, req.profile.avatar, req.valid.body.body) });
}));

// ----- Sininho de novidades -----
router.get('/news', asyncHandler(async (req, res) => {
  const serverId = await catalog.resolveServerId(req.tenant.id, req.query.serverId);
  res.json(await news.getNews(req, serverId, { fetch: req.query.fetch === '1' }));
}));

router.post('/news/seen', asyncHandler(async (req, res) => {
  await news.markNewsSeen(req.profile.id);
  res.json({ ok: true });
}));

router.post('/news/clear', asyncHandler(async (req, res) => {
  await news.clearNews(req.profile.id);
  res.json({ ok: true });
}));

router.get('/backdrops', asyncHandler(async (req, res) => {
  let items;
  try { items = JSON.parse(String(req.query.items ?? '[]')); } catch { throw badRequest('Lista inválida.', 'INVALID_ITEMS'); }
  if (!Array.isArray(items) || items.length > 8) throw badRequest('Lista inválida.', 'INVALID_ITEMS');
  const urls = await Promise.all(items.map((i) => {
    const type = i?.type === 'series' ? 'series' : 'vod';
    const name = typeof i?.name === 'string' ? i.name.slice(0, 120) : '';
    const year = /^\d{4}$/.test(String(i?.year ?? '')) ? String(i.year) : undefined;
    return getBackdrop({ type, name, year });
  }));
  res.set('Cache-Control', 'private, max-age=3600');
  res.json({ urls });
}));

router.get('/search', asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '').trim().slice(0, 80);
  if (q.length < 2) throw badRequest('Digite ao menos 2 caracteres para buscar.', 'QUERY_TOO_SHORT');
  const serverId = await catalog.resolveServerId(req.tenant.id, req.query.serverId);
  const gates = {};
  if (req.viewer.adult_control_enabled) {
    await Promise.all(['live', 'vod', 'series'].map(async (t) => { gates[t] = await catalog.adultGate(req, serverId, t).catch(() => null); }));
  }
  res.json(await catalog.search(req.tenant.id, serverId, q, req.profile, { gates }));
}));

router.get('/catalog/:type/categories', asyncHandler(async (req, res) => {
  const serverId = await catalog.resolveServerId(req.tenant.id, req.query.serverId);
  res.json({ serverId, ...(await sources.getCategories(req.tenant.id, serverId, typeParam(req), { kidsOnly: req.profile.isKids })) });
}));

router.get('/catalog/:type/streams', asyncHandler(async (req, res) => {
  const serverId = await catalog.resolveServerId(req.tenant.id, req.query.serverId);
  const page = Math.max(1, Number.parseInt(req.query.page ?? '1', 10) || 1);
  const pageSize = Math.min(60, Math.max(1, Number.parseInt(req.query.pageSize ?? '40', 10) || 40));
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 80) : undefined;
  const categoryId = typeof req.query.categoryId === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(req.query.categoryId) ? req.query.categoryId : undefined;
  const type = typeParam(req);
  const gate = await catalog.adultGate(req, serverId, type);
  gate?.assertAllowed(categoryId);
  res.json({ serverId, ...(await sources.getStreams(req.tenant.id, serverId, type, { categoryId, q, page, pageSize, kidsOnly: req.profile.isKids, hideCategoryIds: categoryId ? null : gate?.ids })) });
}));

router.get('/details/:type/:streamId', asyncHandler(async (req, res) => {
  const type = typeParam(req);
  if (type === 'live') throw badRequest('Detalhes não disponíveis para canais ao vivo.', 'INVALID_TYPE');
  const serverId = await catalog.resolveServerId(req.tenant.id, req.query.serverId);
  const streamId = streamIdParam(req);
  await guardAdult(req, serverId, type, streamId);
  const [stream, details] = await Promise.all([
    sources.getStream(req.tenant.id, serverId, type, streamId),
    sources.getDetails(req.tenant.id, serverId, type, streamId).catch(() => null),
  ]);
  const ref = { serverId, contentType: type, streamId };
  const favorite = await viewers.isFavorite(req.tenant.id, req.profile.id, ref);
  res.json({ serverId, stream, details, favorite });
}));

router.get('/epg/:streamId', asyncHandler(async (req, res) => {
  const serverId = await catalog.resolveServerId(req.tenant.id, req.query.serverId);
  res.json({ items: await sources.getEpg(req.tenant.id, serverId, streamIdParam(req)) });
}));

router.get('/play/series/:streamId/episode/:episodeId', asyncHandler(async (req, res) => {
  const streamId = streamIdParam(req);
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(req.params.episodeId)) throw badRequest('Identificador de episódio inválido.', 'INVALID_ID');
  const extension = typeof req.query.ext === 'string' && /^[a-z0-9]{2,5}$/i.test(req.query.ext) ? req.query.ext : 'mp4';
  const serverId = await catalog.resolveServerId(req.tenant.id, req.query.serverId);
  await guardAdult(req, serverId, 'series', streamId);
  const playback = await sources.getEpisodePlayback(req.tenant.id, serverId, streamId, req.params.episodeId, extension);
  const ref = { serverId, contentType: 'series', streamId, name: playback.stream.name, icon: playback.stream.icon ?? null };
  await viewers.recordHistory(req.tenant.id, req.profile.id, ref);
  const progress = await viewers.getProgress(req.tenant.id, req.profile.id, { serverId, streamId, contentType: 'series', episodeId: req.params.episodeId });
  res.json({ serverId, ...playback, progress });
}));

router.get('/play/:type/:streamId', asyncHandler(async (req, res) => {
  const type = typeParam(req);
  if (type === 'series') throw badRequest('Escolha um episódio para reproduzir a série.', 'INVALID_TYPE');
  const streamId = streamIdParam(req);
  const serverId = await catalog.resolveServerId(req.tenant.id, req.query.serverId);
  await guardAdult(req, serverId, type, streamId);
  const playback = await sources.getPlayback(req.tenant.id, serverId, type, streamId);
  const ref = { serverId, contentType: type, streamId, name: playback.stream.name, icon: playback.stream.icon ?? null };
  await viewers.recordHistory(req.tenant.id, req.profile.id, ref);
  const [favorite, progress] = await Promise.all([
    viewers.isFavorite(req.tenant.id, req.profile.id, ref),
    type === 'vod' ? viewers.getProgress(req.tenant.id, req.profile.id, ref) : null,
  ]);
  res.json({ serverId, ...playback, favorite, progress });
}));

// ----- Favoritos, histórico e progresso -----
router.get('/favorites', asyncHandler(async (req, res) => {
  res.json({ items: await viewers.listFavorites(req.tenant.id, req.profile.id) });
}));

router.put('/favorites', validate(contentRef), asyncHandler(async (req, res) => {
  await viewers.addFavorite(req.tenant.id, req.profile.id, req.valid.body);
  res.json({ ok: true });
}));

router.post('/favorites/remove', validate(contentRef), asyncHandler(async (req, res) => {
  await viewers.removeFavorite(req.tenant.id, req.profile.id, req.valid.body);
  res.json({ ok: true });
}));

router.get('/history', asyncHandler(async (req, res) => {
  res.json({ items: await viewers.listHistory(req.tenant.id, req.profile.id) });
}));

router.delete('/history', asyncHandler(async (req, res) => {
  await viewers.clearHistory(req.tenant.id, req.profile.id);
  res.json({ ok: true });
}));

router.put('/progress', validate(progressSchema), asyncHandler(async (req, res) => {
  await viewers.saveProgress(req.tenant.id, req.profile.id, req.valid.body);
  res.json({ ok: true });
}));

router.get('/continue-watching', asyncHandler(async (req, res) => {
  res.json({ items: await viewers.listContinueWatching(req.tenant.id, req.profile.id) });
}));

export default router;
