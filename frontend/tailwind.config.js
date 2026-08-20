/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        brown: { 900: "#170D0B", 800: "#1F1412", 700: "#2A1B18", 600: "#3A2A25" },
        ivory: { 100: "#FFFFF0", 200: "#FDFBF7", 300: "#F5F0E6" },
        vermilion: { 400: "#E8543C", 500: "#D9381E", 600: "#B92B15" },
        gold: { 300: "#EFCB63", 400: "#E6B31E", 500: "#D4AF37", 600: "#B5952F" },
      },
      fontFamily: {
        display: ["'Cormorant Garamond'", "serif"],
        body: ["'Manrope'", "sans-serif"],
      },
      boxShadow: {
        glow: "0 10px 40px -12px rgba(212,175,55,0.35)",
        card: "0 1px 3px rgba(23,13,11,0.08), 0 8px 24px -12px rgba(23,13,11,0.12)",
      },
      keyframes: {
        "fade-up": { "0%": { opacity: 0, transform: "translateY(16px)" }, "100%": { opacity: 1, transform: "translateY(0)" } },
        "fade-in": { "0%": { opacity: 0 }, "100%": { opacity: 1 } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.22,1,0.36,1) both",
        "fade-in": "fade-in 0.6s ease both",
      },
    },
  },
  plugins: [],
};
