import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        owl: {
          gold: "#FDBB30",
          goldDark: "#D99B16",
          black: "#121214",
          slate: "#1E1F24",
          surface: "#272930",
        },
      },
    },
  },
  plugins: [],
};

export default config;
