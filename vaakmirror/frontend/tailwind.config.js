/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0E2A2E',
          light: '#16403F',
          deep: '#081A1C',
        },
        paper: '#FBF7EE',
        coral: {
          DEFAULT: '#F0604A',
          dark: '#D14A36',
          light: '#FF8A73',
        },
        gold: {
          DEFAULT: '#F4B942',
          light: '#FCD87E',
        },
        mint: {
          DEFAULT: '#2FB8A6',
          dark: '#1E8C7D',
          light: '#8FE0D4',
        },
      },
      fontFamily: {
        display: ['"Baloo 2"', 'ui-rounded', 'sans-serif'],
        body: ['Sora', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        blob: '42% 58% 63% 37% / 41% 45% 55% 59%',
      },
      keyframes: {
        morph: {
          '0%, 100%': { opacity: 1 },
          '33%': { opacity: 0 },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        drift: {
          '0%': { transform: 'translateX(0) rotate(0deg)' },
          '100%': { transform: 'translateX(-50%) rotate(360deg)' },
        },
      },
      animation: {
        float: 'float 5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
