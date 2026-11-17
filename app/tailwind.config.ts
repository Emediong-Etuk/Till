import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#0b1210", 2: "#141d19", 3: "#1d2924" },
        paper: { DEFAULT: "#fbfaf6", 2: "#f3f1ea" },
        till: { 50: "#ecfdf4", 100: "#d2f9e4", 200: "#a7f0c9", 300: "#6ee2a7", 400: "#34cc84", 500: "#14b16b", 600: "#0b9157", 700: "#0a7448", 800: "#0b5c3b", 900: "#0a4b31" },
        lime: { 300: "#d4f56c", 400: "#bfeb3b" },
        brass: { 300: "#f7d88a", 400: "#f2c14e", 500: "#e0a526", 600: "#b9831a" },
        alarm: { 400: "#ff7a6b", 500: "#ef4b3c", 600: "#d0372a" },
        sky: { 400: "#5cc8ff" },
      },
      fontFamily: {
        sans: ["'Inter Variable'", "Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["'JetBrains Mono Variable'", "'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(11,18,16,.04), 0 1px 2px rgba(11,18,16,.06), 0 12px 32px -16px rgba(11,18,16,.18)",
        lift: "0 2px 4px rgba(11,18,16,.06), 0 24px 48px -20px rgba(11,18,16,.28)",
        glow: "0 0 0 1px rgba(20,177,107,.25), 0 12px 40px -12px rgba(20,177,107,.55)",
      },
      borderRadius: { "2.5xl": "1.25rem" },
      keyframes: {
        drift: { "0%,100%": { transform: "translate3d(0,0,0) scale(1)" }, "50%": { transform: "translate3d(4%,-6%,0) scale(1.08)" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
      },
      animation: {
        drift: "drift 14s ease-in-out infinite",
        "drift-slow": "drift 22s ease-in-out infinite reverse",
        shimmer: "shimmer 2.4s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
