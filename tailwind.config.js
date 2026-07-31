/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#0b1220',
        panel: '#111a2e',
        line: '#22304d',
        accent: '#4f8cff',
        accent2: '#22d3ee',
        good: '#2fd480',
        warn: '#f5b642',
        bad: '#f5566a',
        muted: '#7c8aa8'
      }
    },
  },
  plugins: [],
};
