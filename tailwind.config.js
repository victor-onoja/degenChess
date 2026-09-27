/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        retroGreen: "#00FF41",
        retroGreenLight: "#7dff9f",
        retroBlack: "#111",
        retroDark: "#1a1a1a",
      },
      fontFamily: {
        retro: ['"Press Start 2P"', "cursive"],
        terminal: ["VT323", "monospace"],
      },
    },
  },
  plugins: [],
};
