import { handleRelay, makeRelayToken } from './backend/src/services/relayService.js';
import { EventEmitter } from 'node:events';
const u = process.env.T_USER, p = process.env.T_PASS;
const tok = makeRelayToken(1, `http://lumotv.top/live/${u}/${p}/91750.m3u8`);
const res = new EventEmitter();
res.set = (...a) => { console.log('set', JSON.stringify(a).slice(0, 80)); return res; };
res.status = (s) => { console.log('status', s); return res; };
res.send = (b) => { console.log('send', String(b).slice(0, 80)); };
res.end = () => console.log('end');
const t0 = Date.now();
try { await handleRelay({ params: { token: tok }, headers: {} }, res); console.log('ok', Date.now() - t0); } catch (e) { console.log('ERR', e.code, e.message, Date.now() - t0); }
process.exit(0);
