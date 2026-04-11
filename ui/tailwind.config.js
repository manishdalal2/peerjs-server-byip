/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      animation: {
        'eco-pulse': 'eco-pulse 3s ease-in-out infinite',
      },
      keyframes: {
        'eco-pulse': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%':       { transform: 'scale(1.08)' },
        },
      },
    },
  },
  plugins: [],
}
