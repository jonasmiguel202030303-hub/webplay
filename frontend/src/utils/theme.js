/** Cores do tema white-label: o backend envia #RRGGBB; o CSS usa tripla RGB para suportar opacidade. */

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const triplet = (rgb) => rgb.join(' ');

/** Luminância relativa (WCAG) de 0 a 1. */
export function luminance([r, g, b]) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

const WHITE = [255, 255, 255];
const DARK = [17, 17, 17];

/** Escolhe branco ou quase preto conforme o contraste com o fundo informado. */
export const readableOn = (rgb) => (luminance(rgb) > 0.45 ? DARK : WHITE);

/** Barra de status do celular/PWA sempre preta, independente da cor da marca. */
const STATUS_BAR_COLOR = '#000000';

export const DEFAULT_COLORS = { primary: '#7c3aed', secondary: '#2563eb', button: '#7c3aed', background: '#050505' };

/** Retorna as variáveis CSS (objeto de style) para um conjunto de cores da marca. */
export function themeVars(colors = {}) {
  const c = { ...DEFAULT_COLORS, ...colors };
  const bg = hexToRgb(c.background) ?? hexToRgb(DEFAULT_COLORS.background);
  const button = hexToRgb(c.button) ?? hexToRgb(DEFAULT_COLORS.button);
  return {
    '--c-primary': triplet(hexToRgb(c.primary) ?? hexToRgb(DEFAULT_COLORS.primary)),
    '--c-secondary': triplet(hexToRgb(c.secondary) ?? hexToRgb(DEFAULT_COLORS.secondary)),
    '--c-button': triplet(button),
    '--c-on-button': triplet(readableOn(button)),
    '--c-bg': triplet(bg),
    '--c-fg': triplet(readableOn(bg)),
  };
}

export function applyTheme(colors, el = document.documentElement) {
  const vars = themeVars(colors);
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', STATUS_BAR_COLOR);
}

export function resetTheme(el = document.documentElement) {
  for (const k of Object.keys(themeVars())) el.style.removeProperty(k);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', STATUS_BAR_COLOR);
}
