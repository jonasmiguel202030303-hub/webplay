export const RESERVED_SLUGS = new Set([
  'api', 'admin', 'administrador', 'master', 'painel', 'dashboard', 'entrar', 'login', 'logout', 'sair', 'cadastro',
  'registrar', 'register', 'signup', 'recuperar-senha', 'redefinir-senha', 'ativar', 'termos', 'privacidade',
  'aviso-legal', 'uso-aceitavel', 'planos', 'precos', 'ajuda', 'suporte', 'contato', 'sobre', 'status', 'health', 'uploads', 'static',
  'assets', 'public', 'img', 'images', 'css', 'js', 'fonts', 'icons', 'favicon', 'favicon-ico', 'manifest', 'sw',
  'service-worker', 'robots', 'sitemap', 'webplay', 'webplaybrasil', 'lumo', 'lumotecnologia', 'www', 'mail', 'ftp',
  'app', 'apps', 'root', 'system', 'sistema', 'null', 'undefined', 'test', 'teste-interno', 'billing', 'checkout',
  'webhook', 'webhooks', 'mercadopago', 'pagamento', 'pagamentos', 'conta', 'perfil', 'perfis', 'assistir', 'canais',
  'buscar', 'favoritos', 'historico', 'inicio',
]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function normalizeSlug(input) {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Retorna null se válido ou uma mensagem em português. */
export function slugProblem(slug) {
  if (!SLUG_RE.test(slug)) {
    return 'Use de 3 a 40 caracteres: letras minúsculas, números e hífen (sem começar ou terminar com hífen).';
  }
  if (slug.includes('--')) return 'O endereço não pode ter hífens consecutivos.';
  if (RESERVED_SLUGS.has(slug)) return 'Este endereço é reservado. Escolha outro.';
  return null;
}
