import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f1a14",
        paper: "#f7f5ef",
        till: { 50: "#ecfdf3", 100: "#d1fae1", 200: "#a6f3c6", 400: "#3fd68a", 500: "#16b86a", 600: "#0b9655", 700: "#0a7746", 800: "#0c5e3a", 900: "#0b4d31" },
        brass: { 400: "#f2c14e", 500: "#e0a526", 600: "#b9831a" },
        alarm: { 500: "#e0483b", 600: "#c2352a" },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: { receipt: "0 1px 0 rgba(15,26,20,.06), 0 8px 24px -12px rgba(15,26,20,.25)" },
    },
  },
  plugins: [],
} satisfies Config;
