// Fonte Xtream Codes FALSA, apenas para desenvolvimento e testes automatizados. Não contém conteúdo real:
// os "canais" e "filmes" apontam para vídeos públicos de demonstração (Mux e Google sample bucket).
import http from 'node:http';

const USER = process.env.MOCK_USER || 'demo';
const PASS = process.env.MOCK_PASS || 'demo';

const HLS_SAMPLES = [
  'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  'https://test-streams.mux.dev/test_001/stream.m3u8',
  'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
];
const MP4_SAMPLES = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
];

const liveCategories = [
  { category_id: '1', category_name: 'Notícias (demo)' },
  { category_id: '2', category_name: 'Esportes (demo)' },
  { category_id: '3', category_name: 'Infantil (demo)' },
  { category_id: '4', category_name: 'XXX | +18 (demo)' },
];
const vodCategories = [
  { category_id: '10', category_name: 'Ação (demo)' },
  { category_id: '11', category_name: 'Comédia (demo)' },
  { category_id: '12', category_name: 'Infantil e Desenhos (demo)' },
];

const liveStreams = [...Array.from({ length: 24 }, (_, i) => ({
  num: i + 1,
  name: `Canal Demo ${i + 1}`,
  stream_type: 'live',
  stream_id: 100 + i,
  stream_icon: '',
  category_id: String((i % 3) + 1),
})), ...Array.from({ length: 3 }, (_, i) => ({
  num: 25 + i,
  name: `Canal Adulto Demo ${i + 1}`,
  stream_type: 'live',
  stream_id: 200 + i,
  stream_icon: '',
  category_id: '4',
}))];
const vodStreams = Array.from({ length: 30 }, (_, i) => ({
  num: i + 1,
  name: `Filme Demo ${i + 1}`,
  stream_type: 'movie',
  stream_id: 500 + i,
  stream_icon: '',
  rating_5based: ((i % 5) + 1).toFixed(1),
  added: String(Math.floor(Date.now() / 1000) - i * 86400),
  category_id: String(10 + (i % 3)),
  container_extension: 'mp4',
}));

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}

export function createMockXtream() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://mock');
    const { pathname, searchParams } = url;

    if (pathname === '/player_api.php') {
      if (searchParams.get('username') !== USER || searchParams.get('password') !== PASS) {
        return json(res, 200, { user_info: { auth: 0 } });
      }
      switch (searchParams.get('action')) {
        case null:
          return json(res, 200, {
            user_info: {
              username: USER, password: PASS, auth: 1, status: 'Active', is_trial: '0', active_cons: '0', max_connections: '2',
              exp_date: String(Math.floor(Date.now() / 1000) + 365 * 86400), allowed_output_formats: ['m3u8', 'ts'],
            },
            server_info: { server_protocol: 'http', time_now: new Date().toISOString() },
          });
        case 'get_live_categories': return json(res, 200, liveCategories);
        case 'get_vod_categories': return json(res, 200, vodCategories);
        case 'get_series_categories': return json(res, 200, []);
        case 'get_live_streams': return json(res, 200, liveStreams);
        case 'get_vod_streams': return json(res, 200, vodStreams);
        default: return json(res, 200, []);
      }
    }

    const live = pathname.match(/^\/live\/([^/]+)\/([^/]+)\/(\d+)\.(m3u8|ts)$/);
    const movie = pathname.match(/^\/movie\/([^/]+)\/([^/]+)\/(\d+)\.(\w+)$/);
    const match = live || movie;
    if (match) {
      if (decodeURIComponent(match[1]) !== USER || decodeURIComponent(match[2]) !== PASS) {
        res.writeHead(403);
        return res.end();
      }
      const list = live ? HLS_SAMPLES : MP4_SAMPLES;
      res.writeHead(302, { Location: list[Number(match[3]) % list.length], 'Access-Control-Allow-Origin': '*' });
      return res.end();
    }
    res.writeHead(404);
    res.end();
  });
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('mock-xtream.js')) {
  const port = Number(process.env.MOCK_PORT || 4010);
  createMockXtream().listen(port, '127.0.0.1', () => console.log(`Fonte mock Xtream em http://127.0.0.1:${port} (usuário/senha: ${USER}/${PASS})`));
}
