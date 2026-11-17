import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        villainy: {
          purple: '#3B1F54',
          deep: '#1F102F',
          black: '#121212',
          canvas: '#FFFDF7',
          pink: '#FF2E93',
          pinkLight: '#FF4B91',
          teal: '#00F5D4',
          amber: '#FFB703',
        },
        ink: {
          amber: '#E5A93B',
          amethyst: '#8B5FA8',
          emerald: '#2E8B57',
          ruby: '#D62828',
          sapphire: '#1D70B8',
          steel: '#7A8B99',
        },
      },
      boxShadow: {
        brutal: '4px 4px 0px #000000',
        'brutal-sm': '2px 2px 0px #000000',
        'brutal-lg': '6px 6px 0px #000000',
        'brutal-xl': '8px 8px 0px #000000',
        'brutal-pink': '4px 4px 0px #FF2E93',
        'brutal-teal': '4px 4px 0px #00F5D4',
        'brutal-amber': '4px 4px 0px #FFB703',
      },
      borderWidth: {
        '3': '3px',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Impact', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
