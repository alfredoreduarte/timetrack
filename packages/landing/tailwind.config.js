/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "neon-green": "#00ff9e",
        "neon-purple": "#931bff",
        "deep-blue": "#071327",
      },
      fontFamily: {
        mono: [
          "'IBM Plex Mono'",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      boxShadow: {
        neon: "0 0 8px rgba(147, 27, 255, 0.8)",
      },
    },
  },
  plugins: [],
};
