import { makeRelayToken } from './backend/src/services/relayService.js';
const u = process.env.T_USER, p = process.env.T_PASS;
const id = process.env.SID ?? '91750';
const tok = makeRelayToken(1, `http://lumotv.top/live/${u}/${p}/${id}.m3u8`);
for (let i = 0; i < 3; i++) {
  const t0 = Date.now();
  try {
    const r = await fetch(`http://localhost:4000/api/relay/${tok}`, { signal: AbortSignal.timeout(40000) });
    const b = await r.text();
    console.log(i, r.status, Date.now() - t0, 'ms', b.slice(0, 60).replace(/\n/g, ' '));
  } catch (e) { console.log(i, 'ERR', e.message, Date.now() - t0); }
  await new Promise((x) => setTimeout(x, 3000));
}
process.exit(0);
