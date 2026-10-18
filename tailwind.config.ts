import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        authorityBlue: "#0A1F33",
        dataCharcoal: "#3A3A3C",
        silverLight: "#C0C0C0",
        digitalCyan: "#00BFFF",
        white: "#FFFFFF",
      },
      fontFamily: {
        montserrat: ["var(--font-montserrat)", "sans-serif"],
        inter: ["var(--font-inter)", "sans-serif"],
      },
      boxShadow: {
        none: "none",
        xs: "0 1px 3px 0 rgba(10, 31, 51, 0.05)",
        sm: "0 2px 10px -2px rgba(10, 31, 51, 0.06), 0 1px 4px -1px rgba(10, 31, 51, 0.04)",
        DEFAULT: "0 6px 18px -4px rgba(10, 31, 51, 0.08), 0 2px 6px -2px rgba(10, 31, 51, 0.04)",
        md: "0 10px 26px -5px rgba(10, 31, 51, 0.09), 0 4px 10px -3px rgba(10, 31, 51, 0.04)",
        lg: "0 16px 36px -6px rgba(10, 31, 51, 0.12), 0 6px 16px -4px rgba(10, 31, 51, 0.05)",
        xl: "0 22px 48px -10px rgba(10, 31, 51, 0.16), 0 8px 20px -6px rgba(10, 31, 51, 0.06)",
        "2xl": "0 30px 64px -12px rgba(10, 31, 51, 0.24)",
        glow: "0 8px 28px -4px rgba(0, 191, 255, 0.32)",
      }
    },
  },
  plugins: [],
};
export default config;