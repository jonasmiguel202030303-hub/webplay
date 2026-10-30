const withVar = (name) => `rgb(var(${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Todas as cores vêm de variáveis CSS (triplas RGB) para permitir o tema white-label por assinante.
        primary: withVar('--c-primary'),
        secondary: withVar('--c-secondary'),
        button: withVar('--c-button'),
        'on-button': withVar('--c-on-button'),
        bg: withVar('--c-bg'),
        fg: withVar('--c-fg'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      keyframes: {
        'fade-in': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: { 'fade-in': 'fade-in .2s ease-out', shimmer: 'shimmer 1.6s infinite' },
    },
  },
  plugins: [],
};
