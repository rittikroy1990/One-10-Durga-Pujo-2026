/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        brown: {
          950: "#1F120C",
          900: "#2C1810",
          800: "#3D2418",
          700: "#5C3A28",
          600: "#7A4E34",
        },
        ivory: { 100: "#FFFEFA", 200: "#FFF8EC", 300: "#FFEFD6" },
        sky: {
          50: "#F5FBFF",
          100: "#E8F4FC",
          200: "#D4EAF8",
          300: "#A8D4F0",
        },
        sun: {
          50: "#FFF9F0",
          100: "#FFF1D6",
          200: "#FFE0A3",
          300: "#FFC857",
          400: "#F5A623",
          500: "#E8940F",
        },
        vermilion: { 400: "#F04A35", 500: "#E03520", 600: "#C42B18" },
        gold: { 300: "#F0D78C", 400: "#E0B84A", 500: "#D4A017", 600: "#B8860B" },
      },
      fontFamily: {
        display: ["'Cormorant Garamond'", "Georgia", "serif"],
        body: ["'Outfit'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 12px 40px -14px rgba(245,166,35,0.35)",
        card: "0 1px 2px rgba(44,24,16,0.06), 0 12px 32px -16px rgba(44,24,16,0.14)",
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
