import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config/env.js';
import { query, queryOne } from '../config/db.js';
import { badRequest, notFound } from '../utils/errors.js';
import { uuid } from '../utils/crypto.js';
import { audit } from './auditService.js';
import { brandView } from './tenantService.js';

sharp.cache(false);

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);

// column: coluna em tenant_branding; fit: dimensões máximas; format: formato de saída (sempre re-codificado).
export const ASSET_KINDS = {
  logo: { column: 'logo_path', width: 512, height: 512, format: 'webp', icons: true },
  favicon: { column: 'favicon_path', width: 64, height: 64, format: 'png', cover: true },
  background: { column: 'background_path', width: 1920, height: 1080, format: 'webp' },
  banner: { column: 'banner_path', width: 1920, height: 1080, format: 'webp' },
  'login-image': { column: 'login_image_path', width: 1280, height: 1280, format: 'webp' },
  'menu-logo': { column: 'menu_logo_path', width: 400, height: 160, format: 'webp' },
  'content-logo': { column: 'content_logo_path', width: 400, height: 160, format: 'webp' },
};

export const uploadsRoot = () => path.join(config.storageDir, 'uploads');

async function removeFiles(relPath) {
  if (!relPath) return;
  const base = relPath.replace(/\.(webp|png)$/, '');
  for (const file of [relPath, `${base}-192.png`, `${base}-512.png`]) {
    await fs.rm(path.join(uploadsRoot(), file), { force: true });
  }
}

/** Valida o conteúdo real da imagem (não confia em mimetype/extensão), re-codifica e grava com nome aleatório. */
export async function saveBrandAsset(req, tenant, kind, buffer) {
  const spec = ASSET_KINDS[kind];
  if (!spec) throw notFound('Tipo de imagem desconhecido.');
  if (!buffer?.length) throw badRequest('Envie um arquivo de imagem.');

  let meta;
  try {
    meta = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw badRequest('Arquivo inválido. Envie uma imagem PNG, JPG ou WebP.', 'INVALID_IMAGE');
  }
  if (!ALLOWED_FORMATS.has(meta.format)) {
    throw badRequest('Formato não permitido. Use PNG, JPG ou WebP (SVG não é aceito por segurança).', 'INVALID_IMAGE');
  }
  if ((meta.width ?? 0) < 16 || (meta.height ?? 0) < 16) throw badRequest('Imagem muito pequena.', 'INVALID_IMAGE');

  const id = uuid();
  const rel = `${tenant.id}/${id}.${spec.format}`;
  const dir = path.join(uploadsRoot(), String(tenant.id));
  await fs.mkdir(dir, { recursive: true });

  let pipeline = sharp(buffer, { limitInputPixels: 40_000_000 }).rotate();
  pipeline = spec.cover
    ? pipeline.resize(spec.width, spec.height, { fit: 'cover' })
    : pipeline.resize(spec.width, spec.height, { fit: 'inside', withoutEnlargement: true });
  pipeline = spec.format === 'png' ? pipeline.png({ compressionLevel: 9 }) : pipeline.webp({ quality: 82 });
  await pipeline.toFile(path.join(uploadsRoot(), rel));

  if (spec.icons) {
    for (const size of [192, 512]) {
      await sharp(buffer, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toFile(path.join(dir, `${id}-${size}.png`));
    }
  }

  const old = await queryOne(`SELECT ${spec.column} AS p FROM tenant_branding WHERE tenant_id = ?`, [tenant.id]);
  await query(`UPDATE tenant_branding SET ${spec.column} = ? WHERE tenant_id = ?`, [rel, tenant.id]);
  await removeFiles(old?.p);
  await audit(req, { action: 'tenant.asset_upload', entityType: 'tenant', entityId: tenant.id, metadata: { kind } });
  const row = await queryOne('SELECT * FROM tenant_branding WHERE tenant_id = ?', [tenant.id]);
  return brandView(row);
}

export async function removeBrandAsset(req, tenant, kind) {
  const spec = ASSET_KINDS[kind];
  if (!spec) throw notFound('Tipo de imagem desconhecido.');
  const old = await queryOne(`SELECT ${spec.column} AS p FROM tenant_branding WHERE tenant_id = ?`, [tenant.id]);
  await query(`UPDATE tenant_branding SET ${spec.column} = NULL WHERE tenant_id = ?`, [tenant.id]);
  await removeFiles(old?.p);
  await audit(req, { action: 'tenant.asset_remove', entityType: 'tenant', entityId: tenant.id, metadata: { kind } });
  const row = await queryOne('SELECT * FROM tenant_branding WHERE tenant_id = ?', [tenant.id]);
  return brandView(row);
}
