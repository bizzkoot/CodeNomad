import { defineConfig } from "vite"
import solid from "vite-plugin-solid"
import { resolve } from "path"

export default defineConfig({
  root: "./src/renderer",
  plugins: [solid()],
  css: {
    postcss: "./postcss.config.js",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ["lucide-solid"],
  },
  ssr: {
    noExternal: ["lucide-solid"],
  },
  server: {
    port: 3000,
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "./src/renderer/index.html"),
        loading: resolve(__dirname, "./src/renderer/loading.html"),
      },
    },
  },
})
