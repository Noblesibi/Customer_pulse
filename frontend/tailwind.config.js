/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#2563EB",
        success: "#22C55E",
        warning: "#F59E0B",
        danger: "#EF4444",
        dark: {
          950: "#050814",
          900: "#090D1F",
          800: "#0F172A",
          700: "#1E293B",
          600: "#334155"
        }
      },
      fontFamily: {
        sans: ['Montserrat', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
