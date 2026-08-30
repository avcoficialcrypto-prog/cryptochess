import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary dark palette
        dark: {
          950: '#030305',
          900: '#0a0a0f',
          800: '#111118',
          700: '#1a1a25',
          600: '#242433',
          500: '#2e2e42',
          400: '#3a3a52',
        },
        // Accent colors
        gold: {
          400: '#f0b90b',
          500: '#d4a30a',
          600: '#b89008',
        },
        neon: {
          green: '#00ff88',
          red: '#ff3366',
          blue: '#3388ff',
          purple: '#9944ff',
        },
        // Chess specific
        board: {
          light: '#f0d9b5',
          dark: '#b58863',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-dark': 'linear-gradient(135deg, #0a0a0f 0%, #111118 50%, #0a0a0f 100%)',
        'gradient-card': 'linear-gradient(145deg, #1a1a25 0%, #111118 100%)',
        'gradient-gold': 'linear-gradient(135deg, #f0b90b 0%, #d4a30a 100%)',
      },
      boxShadow: {
        'neon-green': '0 0 20px rgba(0, 255, 136, 0.3)',
        'neon-red': '0 0 20px rgba(255, 51, 102, 0.3)',
        'neon-blue': '0 0 20px rgba(51, 136, 255, 0.3)',
        'neon-gold': '0 0 20px rgba(240, 185, 11, 0.3)',
        'card': '0 4px 30px rgba(0, 0, 0, 0.5)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(240, 185, 11, 0.5)' },
          '100%': { boxShadow: '0 0 20px rgba(240, 185, 11, 0.8)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-5px)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
