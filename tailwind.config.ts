import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        medical: {
          blue: "#2563eb",
          navy: "#0f172a",
          soft: "#eff6ff",
          mint: "#ecfdf5"
        }
      }
    }
  },
  plugins: []
};

export default config;
