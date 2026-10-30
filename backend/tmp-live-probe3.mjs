import { query, closePool } from './src/config/db.js';
import { decryptSecret } from './src/utils/crypto.js';
import { getAdapter } from './src/adapters/xtream.js';
import { safeFetchStream } from './src/adapters/safeFetch.js';

const [r] = await query('SELECT va.xtream_username, va.xtream_password_enc, s.base_url FROM viewer_accounts va JOIN source_servers s ON s.id = va.server_id WHERE va.xtream_username IS NOT NULL ORDER BY va.id DESC');
const ad = getAdapter('xtream', { baseUrl: r.base_url, username: r.xtream_username, password: decryptSecret(r.xtream_password_enc) });
const streams = await ad.getStreams('live');
const { url } = ad.buildPlayUrl({ type: 'live', id: (streams.items ?? streams)[0].id, allowedFormats: ['ts'] });

async function run(label, maxMs, abortAfterMs) {
  const t0 = Date.now();
  const ctl = new AbortController();
  let bytes = 0;
  try {
    const { response } = await safeFetchStream(url, { signal: ctl.signal });
    console.log(label, 'status', response.status, 'headers em', Date.now() - t0, 'ms');
    if (response.status >= 400) { await response.body?.cancel().catch(() => {}); return; }
    const timer = abortAfterMs ? setTimeout(() => ctl.abort(), abortAfterMs) : null;
    for await (const c of response.body) { bytes += c.length; if (Date.now() - t0 > maxMs) { ctl.abort(); break; } }
    clearTimeout(timer);
    console.log(label, 'fim da fonte em', Math.round((Date.now() - t0) / 1000), 's', bytes, 'bytes');
  } catch (e) {
    console.log(label, 'fim por', e?.name, e?.code ?? e?.message, 'em', Math.round((Date.now() - t0) / 1000), 's', bytes, 'bytes');
  }
}
await run('A (aborta aos 3s)', 3500, 3000);
await run('B (imediato, 20s)', 20000, 0);
await run('C (imediato, 20s)', 20000, 0);
await closePool();
