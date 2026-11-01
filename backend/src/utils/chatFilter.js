// Moderação do chat: lista base de palavras ofensivas + lista própria de cada assinante. Compara sem acentos, com troca
// de números por letras (p0rra), letras repetidas (puuuta) e plurais simples.
const BASE_WORDS = [
  'porra', 'caralho', 'puta', 'puto', 'putaria', 'fdp', 'vsf', 'viado', 'buceta', 'xereca', 'cuzao', 'cu', 'arrombado',
  'arrombada', 'foder', 'fodase', 'foda se', 'vai se foder', 'filho da puta', 'filha da puta', 'desgraca', 'otario',
  'otaria', 'imbecil', 'idiota', 'retardado', 'retardada', 'macaco fedido', 'nazista', 'estuprador', 'estupro', 'pedofilo',
  'pedofilia', 'vagabundo', 'vagabunda', 'piranha', 'safado', 'safada', 'punheta', 'pau no cu', 'toma no cu',
];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };

const strip = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const squash = (s) => s.replace(/[^a-z0-9]+/g, ' ').replace(/(.)\1+/g, '$1').trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Texto da mensagem em duas versões comparáveis: literal e com números/símbolos trocados por letras. */
function variants(text) {
  const plain = strip(text);
  const leet = plain.replace(/[013457@$!]/g, (c) => LEET[c]);
  return [squash(plain), squash(leet)];
}

/** Lista digitada pelo assinante (uma palavra ou frase por linha, ou separadas por vírgula) -> lista limpa. */
export function parseWordList(raw) {
  const seen = new Set();
  for (const part of String(raw ?? '').split(/[\n,;]+/)) {
    const w = squash(strip(part));
    if (w.length >= 2 && w.length <= 40) seen.add(w);
    if (seen.size >= 300) break;
  }
  return [...seen];
}

const matchers = new Map();
function matcherFor(words) {
  const key = words.join('|');
  let re = matchers.get(key);
  if (!re) {
    const list = words.map((w) => escapeRe(squash(w))).filter(Boolean);
    re = list.length ? new RegExp(`(?:^| )(?:${list.join('|')})(?:s|es)?(?: |$)`) : null;
    matchers.set(key, re ?? false);
    if (matchers.size > 200) matchers.delete(matchers.keys().next().value);
  }
  return re || null;
}

const LINK_RE = /(https?:\/\/|www\.|\bt\.me\/|\bwa\.me\/|\b[a-z0-9-]{2,}\.(com|net|org|br|tv|top|xyz|me|io|cc|info|site|online|app|club|live|link|ly)\b)/i;

/** Devolve null se a mensagem pode ser enviada, ou o motivo do bloqueio ('link' | 'word'). */
export function checkMessage(text, extraWords = []) {
  if (LINK_RE.test(String(text))) return 'link';
  const re = matcherFor([...BASE_WORDS, ...extraWords]);
  if (!re) return null;
  return variants(text).some((v) => re.test(v)) ? 'word' : null;
}
