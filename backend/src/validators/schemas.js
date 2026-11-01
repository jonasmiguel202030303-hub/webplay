import { z } from 'zod';
import { normalizeSlug, slugProblem } from '../utils/slug.js';

z.config(z.locales.pt());

const trimmed = (min, max, label) =>
  z
    .string({ error: `${label} é obrigatório.` })
    .trim()
    .min(min, `${label} deve ter ao menos ${min} caractere(s).`)
    .max(max, `${label} deve ter no máximo ${max} caracteres.`);

// Remove caracteres de controle e marcação básica de HTML de textos livres (a saída ainda é escapada pelo React).
const plainText = (min, max, label) => trimmed(min, max, label).transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[<>]/g, ''));

export const emailField = z
  .string({ error: 'E-mail é obrigatório.' })
  .trim()
  .toLowerCase()
  .max(190, 'E-mail muito longo.')
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Informe um e-mail válido.');

export const passwordField = z
  .string({ error: 'Senha é obrigatória.' })
  .min(10, 'A senha deve ter ao menos 10 caracteres.')
  .max(72, 'A senha deve ter no máximo 72 caracteres.')
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'A senha deve conter letras e números.');

export const slugField = z
  .string({ error: 'Endereço é obrigatório.' })
  .transform(normalizeSlug)
  .superRefine((slug, ctx) => {
    const problem = slugProblem(slug);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida. Use o formato #RRGGBB.').transform((c) => c.toLowerCase());

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((u) => {
    try {
      const p = new URL(u);
      return p.protocol === 'https:' || p.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'URL inválida (use http:// ou https://).');

const whatsapp = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v === '' || (v.length >= 10 && v.length <= 15), 'WhatsApp inválido. Informe DDI + DDD + número.');

const optionalText = (max, label) => plainText(0, max, label).optional().nullable();

export const registerSchema = z.object({
  name: plainText(2, 120, 'Nome'),
  email: emailField,
  password: passwordField,
  brandName: plainText(2, 80, 'Nome da marca'),
  slug: slugField,
  acceptTerms: z.literal(true, { error: 'É necessário aceitar os Termos de Uso e a Política de Privacidade.' }),
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Informe a senha.').max(200),
});

export const tokenSchema = z.object({ token: z.string().min(20).max(200) });
export const emailOnlySchema = z.object({ email: emailField });
export const resetSchema = z.object({ token: z.string().min(20).max(200), password: passwordField });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordField });

export const brandSchema = z.object({
  slug: slugField.optional(),
  displayName: plainText(2, 80, 'Nome da plataforma'),
  shortName: plainText(1, 20, 'Nome curto'),
  colorPrimary: hexColor,
  colorSecondary: hexColor,
  colorButton: hexColor,
  colorBackground: hexColor,
  bannerTitle: optionalText(120, 'Título do banner'),
  bannerSubtitle: optionalText(240, 'Subtítulo do banner'),
  welcomeText: optionalText(500, 'Texto de boas-vindas'),
  supportText: optionalText(500, 'Texto de suporte'),
  whatsapp: whatsapp.optional().nullable(),
  externalLinks: z.array(z.object({ label: plainText(1, 40, 'Rótulo'), url: httpUrl })).max(5, 'No máximo 5 links.').optional(),
  notice: optionalText(500, 'Aviso'),
  footerText: optionalText(300, 'Rodapé'),
});

export const tenantSettingsSchema = z.object({
  allowViewerSignup: z.boolean(),
  kidsProfilesEnabled: z.boolean(),
  maxProfilesPerViewer: z.number().int().min(1).max(10),
  maxSessionsPerViewer: z.number().int().min(1).max(10),
  catalogCacheTtlSeconds: z.number().int().min(60).max(86400),
  uiSoundsEnabled: z.boolean(),
  chatEnabled: z.boolean().optional(),
  chatBannedWords: z.string().max(4000, 'Lista de palavras muito longa.').optional(),
});

export const chatMessageSchema = z.object({
  body: z.string({ error: 'Escreva uma mensagem.' }).max(1000, 'Mensagem muito longa.'),
});

export const serverCreateSchema = z.object({
  name: plainText(2, 80, 'Nome do servidor'),
  url: trimmed(8, 500, 'URL do servidor'),
});
export const serverUpdateSchema = serverCreateSchema;
export const serverTestSchema = z.object({
  url: trimmed(8, 500, 'URL do servidor'),
});

export const lineLoginSchema = z.object({
  username: trimmed(1, 120, 'Usuário'),
  password: z.string({ error: 'Informe a senha.' }).min(1, 'Informe a senha.').max(200),
});

export const viewerCreateByOwnerSchema = z.object({
  name: plainText(2, 120, 'Nome'),
  email: emailField,
  password: passwordField,
});
export const viewerRegisterSchema = viewerCreateByOwnerSchema.extend({
  acceptTerms: z.literal(true, { error: 'É necessário aceitar os Termos de Uso e a Política de Privacidade.' }),
});
export const viewerDeleteSchema = z.object({ password: z.string().min(1).max(200) });
export const viewerStatusSchema = z.object({ status: z.enum(['active', 'suspended']) });
export const viewerPasswordSchema = z.object({ password: passwordField });

const pinField = z.string().regex(/^\d{4}$/, 'PIN deve ter exatamente 4 dígitos.');
export const adultControlSchema = z.object({
  enabled: z.boolean(),
  pin: pinField.optional(),
  currentPin: pinField.optional(),
});
export const adultControlVerifySchema = z.object({
  pin: pinField,
  type: z.enum(['live', 'vod', 'series']).optional(),
  categoryId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).optional(),
});

export const profileSchema = z.object({
  name: plainText(1, 40, 'Nome do perfil'),
  avatar: z.string().regex(/^(violet|blue|pink|amber|emerald|rose|cyan|slate|(people|pet|robot|smiley|avatar)-\d{1,2})$/, 'Avatar inválido.').default('people-1'),
  isKids: z.boolean().default(false),
});

export const contentRef = z.object({
  serverId: z.coerce.number().int().positive(),
  contentType: z.enum(['live', 'vod', 'series']),
  streamId: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/),
  name: plainText(1, 250, 'Nome'),
  icon: z.string().trim().max(500).optional().nullable(),
});
export const progressSchema = contentRef.extend({
  episodeId: z.string().trim().max(40).regex(/^[A-Za-z0-9_-]+$/).optional(),
  positionSeconds: z.number().int().min(0).max(60 * 60 * 24),
  durationSeconds: z.number().int().min(0).max(60 * 60 * 24),
});

export const checkoutSchema = z.object({ method: z.enum(['checkout', 'pix']).default('checkout') });

export const supportSchema = z.object({ subject: plainText(3, 160, 'Assunto'), message: plainText(10, 3000, 'Mensagem') });

export const privacyRequestSchema = z.object({
  requestType: z.enum(['access', 'correction', 'deletion', 'portability']),
  notes: optionalText(1000, 'Observações'),
});

// Master
export const masterSettingsSchema = z.object({
  priceCents: z.number().int().min(100).max(10_000_000).optional(),
  subscriptionMonths: z.number().int().min(1).max(36).optional(),
  trialHours: z.number().int().min(1).max(24 * 30).optional(),
  renewalWindowDays: z.number().int().min(0).max(1100).optional(),
  headline: plainText(0, 120, 'Título comercial').optional(),
  description: plainText(0, 500, 'Descrição comercial').optional(),
  footerText: plainText(0, 300, 'Rodapé').optional(),
  supportWhatsapp: whatsapp.optional(),
  supportEmail: z.union([emailField, z.literal('')]).optional(),
  supportHoursText: plainText(0, 200, 'Horário de atendimento').optional(),
});

export const termsPublishSchema = z.object({
  docType: z.enum(['terms', 'privacy', 'legal']),
  version: z.string().trim().min(1).max(20),
  title: plainText(3, 160, 'Título'),
  content: z.string().trim().min(50).max(200_000),
});

export const mpSettingsSchema = z.object({
  mode: z.enum(['test', 'production']),
  accessToken: z.string().trim().min(10).max(300).optional(),
  publicKey: z.string().trim().max(255).optional(),
  webhookSecret: z.string().trim().min(8).max(200).optional(),
});
export const mpModeSchema = z.object({ mode: z.enum(['test', 'production']) });

export const grantDaysSchema = z.object({
  days: z.number().int().min(1).max(730),
  reason: plainText(10, 500, 'Justificativa'),
});
export const suspendSchema = z.object({ reason: plainText(5, 500, 'Motivo') });
export const adminCreateSchema = z.object({ name: plainText(2, 120, 'Nome'), email: emailField, password: passwordField });
export const supportStatusSchema = z.object({ status: z.enum(['open', 'answered', 'closed']) });
