/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        retroGreen: "#00FF41",
        retroDark: "#111",
      },
      fontFamily: {
        retro: ["Press Start 2P", "cursive"],
        terminal: ["VT323", "monospace"],
      },
    },
  },
  plugins: [],
};
