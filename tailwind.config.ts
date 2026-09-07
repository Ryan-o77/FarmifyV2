import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        soil: {
          50: "#f7f4ef",
          100: "#ebe3d6",
          600: "#7a6a52",
          900: "#3a3125",
        },
        leaf: {
          50: "#f0f9f1",
          100: "#dcf0de",
          200: "#bbe1c0",
          500: "#3f9c50",
          600: "#2f7d3e",
          700: "#25642f",
          900: "#153a1c",
        },
        water: {
          50: "#eef7fd",
          100: "#d7ecfa",
          200: "#b3dbf5",
          500: "#2b8fd6",
          600: "#1f74b3",
          700: "#195c8f",
          900: "#0f3552",
        },
        alert: {
          50: "#fef4ec",
          100: "#fde4cf",
          500: "#e07b2a",
          600: "#c1631a",
          700: "#964d13",
        },
      },
    },
  },
  plugins: [],
};

export default config;
