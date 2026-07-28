/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          green:  "#A8FF6F",
          teal:   "#1D9E75",
          coral:  "#E24B4A",
          amber:  "#FAC775",
          purple: "#7850DC",
          dark:   "#12122A",
          card:   "#1E1E3F",
        },
        // --- VaakMirror palette (namespaced under its own keys, no overlap with brand.*) ---
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
        // --- Landing/GamePicker signature palette: dusk sky + candle ember ---
        dusk: {
          deep: '#12142E',
          mid: '#332B5E',
          horizon: '#6B4A8A',
        },
        ember: {
          DEFAULT: '#FF9B54',
          hot: '#FF6B4A',
          glow: '#FFD08A',
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Nunito", "system-ui", "sans-serif"],
        // --- VaakMirror fonts, kept separate from BreathQuest's display/mono ---
        "vm-display": ['"Baloo 2"', 'ui-rounded', 'sans-serif'],
        "vm-body": ['Sora', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        "vm-mono": ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        blob: '42% 58% 63% 37% / 41% 45% 55% 59%',
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        "float": "float 3s ease-in-out infinite",
        "spin-slow": "spin 8s linear infinite",
        "flicker": "flicker 2.6s ease-in-out infinite",
        "drift-ember": "driftEmber 12s linear infinite",
      },
      keyframes: {
        float: {
          "0%,100%": { transform: "translateY(0px)" },
          "50%":     { transform: "translateY(-10px)" },
        },
        morph: {
          '0%, 100%': { opacity: 1 },
          '33%': { opacity: 0 },
        },
        drift: {
          '0%': { transform: 'translateX(0) rotate(0deg)' },
          '100%': { transform: 'translateX(-50%) rotate(360deg)' },
        },
        flicker: {
          '0%, 100%':  { transform: 'scaleY(1) scaleX(1) rotate(0deg)', opacity: '1' },
          '25%':       { transform: 'scaleY(1.08) scaleX(0.95) rotate(-2deg)', opacity: '0.95' },
          '50%':       { transform: 'scaleY(0.93) scaleX(1.05) rotate(2deg)', opacity: '1' },
          '75%':       { transform: 'scaleY(1.05) scaleX(0.97) rotate(-1deg)', opacity: '0.97' },
        },
        driftEmber: {
          '0%':   { transform: 'translateY(0) translateX(0)', opacity: '0' },
          '10%':  { opacity: '0.8' },
          '90%':  { opacity: '0.6' },
          '100%': { transform: 'translateY(-180px) translateX(20px)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}
