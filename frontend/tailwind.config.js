/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        navy: {
          950: '#0a1628',
          900: '#0f1f38',
          800: '#16294a',
          700: '#1f3660',
        },
        forecast: '#2a78d6',
        actual: '#1baf7a',
        over: '#e34948',
        under: '#2a78d6',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 31, 56, 0.06), 0 1px 3px rgba(15, 31, 56, 0.04)',
      },
    },
  },
  plugins: [],
};
