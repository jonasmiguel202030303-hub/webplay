import { randomUUID } from 'node:crypto';

const startedAt = Date.now();
const buckets = new Map();
let total = 0;
let errors5xx = 0;

export function metricsMiddleware(logger) {
  return (req, res, next) => {
    const begin = process.hrtime.bigint();
    req.id = randomUUID();
    res.set('X-Request-Id', req.id);
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - begin) / 1e6;
      const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'outros';
      const key = `${req.method} ${route}`;
      const b = buckets.get(key) ?? { count: 0, totalMs: 0, maxMs: 0, errors: 0 };
      b.count += 1;
      b.totalMs += ms;
      b.maxMs = Math.max(b.maxMs, ms);
      if (res.statusCode >= 500) b.errors += 1;
      if (buckets.size < 500) buckets.set(key, b);
      total += 1;
      if (res.statusCode >= 500) errors5xx += 1;
      if (ms > 2000) logger.warn('Requisição lenta', { id: req.id, method: req.method, route, ms: Math.round(ms) });
    });
    next();
  };
}

export function metricsSnapshot() {
  const routes = [...buckets.entries()]
    .map(([key, b]) => ({ route: key, count: b.count, avgMs: Math.round(b.totalMs / b.count), maxMs: Math.round(b.maxMs), errors: b.errors }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  return {
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    totalRequests: total,
    errors5xx,
    memoryMb: { rss: Math.round(mem.rss / 1048576), heapUsed: Math.round(mem.heapUsed / 1048576) },
    cpuMs: { user: Math.round(cpu.user / 1000), system: Math.round(cpu.system / 1000) },
    routes,
  };
}
