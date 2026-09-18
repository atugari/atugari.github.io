import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [tailwindcss(), viteReact()],
  build: {
    outDir: "dist-pages",
    emptyOutDir: true,
    target: ["es2019", "chrome90", "firefox91", "safari14"],
    cssTarget: "safari14",
  },
});
