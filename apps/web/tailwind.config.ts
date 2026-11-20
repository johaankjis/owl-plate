import type { Config } from "tailwindcss";
const color = (token: string) => `rgb(var(--owl-${token}-rgb) / <alpha-value>)`;
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: color("bg"),
        surface: { DEFAULT: color("surface"), subtle: color("surface-subtle") },
        line: color("border"),
        ink: { DEFAULT: color("ink"), muted: color("ink-muted") },
        success: { DEFAULT: color("success"), tint: color("success-tint") },
        warning: { DEFAULT: color("warning"), tint: color("warning-tint") },
        danger: { DEFAULT: color("danger"), tint: color("danger-tint") },
        owl: {
          gold: color("gold"),
          goldDark: color("gold-hover"),
          goldInk: color("gold-ink"),
          goldText: color("gold-text"),
          goldTint: color("gold-tint"),
          black: "#121214",
          slate: "#1E1F24",
          surface: "#272930",
        },
      },
      boxShadow: { card: "0 3px 20px rgb(18 18 20 / 0.045)" },
    },
  },
  plugins: [],
};
export default config;
