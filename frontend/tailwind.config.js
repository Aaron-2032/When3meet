/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        glow: "0 20px 60px rgba(76, 110, 245, 0.18)",
      },
      colors: {
        brand: {
          50: "#f3f3ff",
          100: "#e9ebff",
          500: "#6d76f7",
          600: "#5d63ec",
          700: "#4e52d3",
        },
      },
    },
  },
  plugins: [],
};
