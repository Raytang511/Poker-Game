/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'poker-green': '#0e5e33',
        'poker-green-dark': '#0a4223',
        'poker-green-light': '#188248',
        'poker-gold': '#cfb53b',
      }
    },
  },
  plugins: [],
}
