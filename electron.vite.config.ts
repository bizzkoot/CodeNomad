import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import solid from "vite-plugin-solid"
import { resolve } from "path"

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist/main",
      lib: {
        entry: resolve(__dirname, "electron/main/main.ts"),
      },
      rollupOptions: {
        external: ["electron"],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist/preload",
      lib: {
        entry: resolve(__dirname, "electron/preload/index.ts"),
        formats: ["cjs"],
        fileName: () => "index.js",
      },
      rollupOptions: {
        external: ["electron"],
        output: {
          entryFileNames: "index.js",
        },
      },
    },
  },
  renderer: {
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
    server: {
      port: 3000,
    },
    build: {
      outDir: "dist/renderer",
    },
  },
})
