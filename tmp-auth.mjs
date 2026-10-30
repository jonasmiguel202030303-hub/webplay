import { safeFetchText } from './backend/src/adapters/safeFetch.js';
const u = process.env.T_USER, p = process.env.T_PASS;
for (const base of ['http://psev.fun', 'http://lumotv.top']) {
  try {
    const r = await safeFetchText(`${base}/player_api.php?username=${u}&password=${p}`);
    let j; try { j = JSON.parse(r.body); } catch { j = null; }
    console.log(base, r.status, j ? JSON.stringify({ auth: j.user_info?.auth, status: j.user_info?.status, exp: j.user_info?.exp_date, active: j.user_info?.active_cons, max: j.user_info?.max_connections, formats: j.user_info?.allowed_output_formats }) : r.body.replace(/<style>.*<\/style>/s, '').slice(0, 200));
  } catch (e) { console.log(base, 'ERR', e.code, e.message); }
}
process.exit(0);
