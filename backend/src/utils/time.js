export const HOUR_MS = 3600 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** Soma meses em UTC preservando o dia quando possível (31/jan + 1 mês = 28 ou 29/fev). */
export function addMonthsUtc(date, months) {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export const toIso = (d) => (d ? new Date(d).toISOString() : null);

export function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || null;
}

export function pageParams(query, { defaultSize = 20, maxSize = 100 } = {}) {
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const size = Math.min(maxSize, Math.max(1, Number.parseInt(query.pageSize ?? String(defaultSize), 10) || defaultSize));
  return { page, size, offset: (page - 1) * size };
}
