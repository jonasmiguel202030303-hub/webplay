/** Normaliza e-mail para unicidade e prevenção de contas repetidas (remove +tag e pontos do Gmail). */
export function normalizeEmail(email) {
  const lower = String(email ?? '').trim().toLowerCase();
  const at = lower.lastIndexOf('@');
  if (at < 1) return lower;
  let local = lower.slice(0, at);
  let domain = lower.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  local = local.split('+')[0];
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

export const cleanEmail = (email) => String(email ?? '').trim().toLowerCase();
