/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{html,ts}'],
  theme: {
    // Custom breakpoints. IMPORTANT: must live under `extend.screens` so the
    // Tailwind defaults (sm 640, md 768, lg 1024, xl 1280, 2xl 1536) are kept.
    // Putting `3xl` directly under `theme.screens` REPLACED the default
    // screen set, so `md:flex` / `md:hidden` stopped being generated and the
    // desktop sidebar collapsed to mobile layout. (regression Jun 2026)
    extend: {
      screens: {
        '3xl': '1100px', // three-column docs shell (sidebar + content + ToC)
      },
      colors: {
        primary: {
          50: 'var(--color-primary-50)',
          100: 'var(--color-primary-100)',
          200: 'var(--color-primary-200)',
          300: 'var(--color-primary-300)',
          400: 'var(--color-primary-400)',
          500: 'var(--color-primary-500)',
          600: 'var(--color-primary-600)',
          700: 'var(--color-primary-700)',
          800: 'var(--color-primary-800)',
          900: 'var(--color-primary-900)',
        },
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease',
      },
    },
  },
  plugins: [require('tailwind-scrollbar')({ nocompatible: true })],
};
