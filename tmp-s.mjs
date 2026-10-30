import { safeFetchStream, readLimited } from './backend/src/adapters/safeFetch.js';
const u = process.env.T_USER, p = process.env.T_PASS;
const url = `http://lumotv.top/live/${u}/${p}/91750.m3u8`;
for (const hdr of [{}, { Accept: '*/*' }]) {
  const t0 = Date.now();
  try {
    const { response, url: fu } = await safeFetchStream(url, { headers: hdr });
    console.log('hdr', JSON.stringify(hdr), response.status, Date.now() - t0, 'ms', response.headers.get('content-type'));
    const t1 = Date.now();
    const body = await readLimited(response, 2e6);
    console.log(' corpo', body.length, Date.now() - t1, 'ms');
  } catch (e) { console.log('ERR', e.code, e.message, Date.now() - t0); }
}
process.exit(0);
