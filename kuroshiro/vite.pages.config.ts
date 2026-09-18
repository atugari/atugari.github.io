import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), viteReact()],
  build: {
    outDir: "dist-pages",
    emptyOutDir: true,
    target: "es2020",
  },
});
