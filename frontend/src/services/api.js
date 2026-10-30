/** Cliente HTTP único. Cookies HttpOnly + cabeçalho anti-CSRF; nunca guarda tokens no navegador. */

export class ApiError extends Error {
  constructor(status, code, message, details, requestId) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

const BASE = '/api';

function buildUrl(path, query) {
  const url = `${BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function request(method, path, { body, query, headers = {}, signal, keepalive } = {}) {
  const init = {
    method,
    credentials: 'include',
    signal,
    keepalive,
    headers: { Accept: 'application/json', 'X-Requested-With': 'webplay', ...headers },
  };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(buildUrl(path, query), init);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const e = data?.error;
    const err = new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? `Erro inesperado (${res.status}).`, e?.details, e?.requestId);
    if (res.status === 401) window.dispatchEvent(new CustomEvent('wp:unauthorized', { detail: { path } }));
    throw err;
  }
  return data;
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  put: (path, body, opts) => request('PUT', path, { ...opts, body }),
  patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
  del: (path, opts) => request('DELETE', path, opts),
};

/** Mensagens por campo vindas de erros de validação (details: { fields: { campo: mensagem } }). */
export function fieldErrors(err) {
  const fields = err?.details?.fields;
  return fields && typeof fields === 'object' ? { ...fields } : {};
}
