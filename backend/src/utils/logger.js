const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const SENSITIVE_KEYS = /pass(word)?|secret|token|authorization|cookie|access_token|credential|api[_-]?key|username/i;

export function redact(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 4) return '[profundo]';
  if (value instanceof Error) return { name: value.name, message: redactString(value.message), code: value.code };
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.test(k) ? '[omitido]' : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string') return redactString(value);
  return value;
}

/** Remove credenciais embutidas em URLs e parâmetros sensíveis de query strings. */
export function redactString(text) {
  return String(text)
    .replace(/(\/\/)([^/\s:@]+):([^@\s/]+)@/g, '$1[omitido]@')
    .replace(/([?&](?:password|pass|token|username|user|access_token)=)[^&\s]+/gi, '$1[omitido]')
    .replace(/\/(live|movie|series)\/[^/\s]+\/[^/\s]+\//gi, '/$1/[omitido]/[omitido]/');
}

export function createLogger(levelName = 'info') {
  const threshold = LEVELS[levelName] ?? LEVELS.info;
  const emit = (level, msg, meta) => {
    if (LEVELS[level] < threshold) return;
    const line = JSON.stringify({ t: new Date().toISOString(), level, msg: redactString(msg), ...(meta ? { meta: redact(meta) } : {}) });
    (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line + '\n');
  };
  return {
    debug: (m, x) => emit('debug', m, x),
    info: (m, x) => emit('info', m, x),
    warn: (m, x) => emit('warn', m, x),
    error: (m, x) => emit('error', m, x),
  };
}
