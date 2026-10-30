import { query, closePool } from './src/config/db.js';
import { decryptSecret } from './src/utils/crypto.js';
import { getAdapter } from './src/adapters/xtream.js';
import { safeFetchStream } from './src/adapters/safeFetch.js';

const rows = await query('SELECT va.id, va.xtream_username, va.xtream_password_enc, va.account_info, s.base_url FROM viewer_accounts va JOIN source_servers s ON s.id = va.server_id WHERE va.xtream_username IS NOT NULL');
console.log('linhas:', rows.map((r) => ({ id: r.id, u: r.xtream_username, base: r.base_url, info: typeof r.account_info === 'string' ? r.account_info.slice(0, 200) : JSON.stringify(r.account_info).slice(0, 200) })));
const r = rows[rows.length - 1];
if (r) {
  const ad = getAdapter('xtream', { baseUrl: r.base_url, username: r.xtream_username, password: decryptSecret(r.xtream_password_enc) });
  const auth = await ad.authenticate();
  console.log('auth:', JSON.stringify(auth).slice(0, 400));
  const streams = await ad.getStreams('live');
  const list = streams.items ?? streams;
  console.log('canais:', list.length, JSON.stringify(list[0]).slice(0, 200));
  for (const fmt of ['ts']) {
    const { url } = ad.buildPlayUrl({ type: 'live', id: list[0].id, allowedFormats: [fmt] });
    const started = Date.now();
    let last = started; let maxGap = 0; let bytes = 0;
    try {
      const { response } = await safeFetchStream(url, {});
      console.log(fmt, 'status', response.status, response.headers.get('content-type'), 'em', Date.now() - started, 'ms');
      for await (const chunk of response.body) {
        const now = Date.now();
        maxGap = Math.max(maxGap, now - last); last = now; bytes += chunk.length;
        if (now - started > 240000) break;
      }
      console.log(fmt, 'terminou normalmente');
    } catch (e) {
      console.log(fmt, 'ERRO', e?.code, e?.message, e?.cause?.code);
    }
    console.log(fmt, 'duração s', Math.round((Date.now() - started) / 1000), 'bytes', bytes, 'maior intervalo ms', maxGap);
  }
}
await closePool();
