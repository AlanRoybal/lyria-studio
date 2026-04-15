/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        studio: {
          bg: '#0a0a0b',
          panel: '#111113',
          card: '#1a1a1e',
          border: '#2a2a30',
          accent: '#7c3aed',
          accentLight: '#a78bfa',
          record: '#ef4444',
          play: '#22c55e',
        },
      },
    },
  },
  plugins: [],
}
