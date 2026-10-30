import { safeFetchText, safeFetchStream } from './backend/src/adapters/safeFetch.js';
const u = process.env.T_USER, p = process.env.T_PASS, base = 'http://lumotv.top';
const start = Date.now();
const t = () => ((Date.now() - start) / 1000).toFixed(1).padStart(6);
const info = async () => { const j = JSON.parse((await safeFetchText(`${base}/player_api.php?username=${u}&password=${p}`)).body); return `cons ${j.user_info.active_cons}/${j.user_info.max_connections}`; };
const list = JSON.parse((await safeFetchText(`${base}/player_api.php?username=${u}&password=${p}&action=get_live_streams`)).body);
console.log('canais', list.length);
const ids = list.slice(0, 3).map((s) => s.stream_id);
const id = ids[Number(process.env.IDX ?? 0)];
const entry = `${base}/live/${u}/${p}/${id}.m3u8`;
const san = (s) => String(s).replaceAll(u, '***').replaceAll(p, '***');
let cur = entry;
const seen = new Set();
const limit = Number(process.env.SECS ?? 100) * 1000;
while (Date.now() - start < limit) {
  try {
    const r = await safeFetchText(cur);
    if (r.status !== 200) { console.log(t(), 'playlist HTTP', r.status, san(r.body.slice(0, 100))); await new Promise((x) => setTimeout(x, 4000)); continue; }
    const lines = r.body.split(/\r?\n/);
    const td = Number((lines.find((l) => l.startsWith('#EXT-X-TARGETDURATION')) ?? ':6').split(':')[1]);
    const segs = lines.filter((l) => l && !l.startsWith('#'));
    const fresh = segs.filter((s) => !seen.has(s));
    console.log(t(), 'playlist ok td', td, 'segs', segs.length, 'novos', fresh.length, san(segs[0]?.slice(0, 90)), await info());
    for (const s of fresh) {
      seen.add(s);
      const t0 = Date.now();
      try {
        const { response } = await safeFetchStream(new URL(s, cur).toString());
        let n = 0; for await (const c of response.body) n += c.length;
        console.log(t(), 'seg', response.status, n, 'bytes', Date.now() - t0, 'ms');
      } catch (e) { console.log(t(), 'seg ERR', e.code, e.message); }
    }
    await new Promise((x) => setTimeout(x, Math.max(1500, td * 500)));
  } catch (e) { console.log(t(), 'ERR', e.code, san(e.message)); await new Promise((x) => setTimeout(x, 3000)); }
}
process.exit(0);
