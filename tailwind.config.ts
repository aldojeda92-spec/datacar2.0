import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
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
        // Forzamos diseño Flat eliminando sombras por defecto
        none: "none",
        sm: "none",
        DEFAULT: "none",
        md: "none",
        lg: "none",
        xl: "none",
        "2xl": "none",
      }
    },
  },
  plugins: [],
};
export default config;