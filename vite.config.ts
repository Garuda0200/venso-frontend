import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      src: fileURLToPath(new URL("./src", import.meta.url))
    },
    extensions: [".ts", ".tsx", ".json", ".scss", ".css"]
  },
  css: {
    preprocessorOptions: {
      scss: {
        silenceDeprecations: [
          "legacy-js-api",
          "import",
          "global-builtin",
          "color-functions"
        ],
        quietDeps: true
      }
    }
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      // Igual que Nginx en Fly: el wake público del SPA se traduce al health
      // raíz del backend, mientras el resto de /api conserva su prefijo.
      "/api/health": {
        target: "http://localhost:8080",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/health$/, "/health"),
      },
      "/api": { target: "http://localhost:8080", changeOrigin: true },
      "/health": { target: "http://localhost:8080", changeOrigin: true }
    }
  },
  build: {
    outDir: "build",
    sourcemap: false,
    minify: "esbuild",
    rollupOptions: {
      external: ["quill"],
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          data: ["@tanstack/react-query", "axios"],
          ui: ["primereact", "react-icons"],
          forms: ["react-datepicker"],
          dnd: ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
          charts: ["chart.js", "react-chartjs-2"],
          excel: ["xlsx", "exceljs", "file-saver"],
          pdf: ["pdf-lib", "html2canvas", "html-to-image"]
        }
      }
    }
  },
  esbuild: {
    drop: mode === "production" ? ["debugger"] : [],
    pure: mode === "production"
      ? ["console.log", "console.info", "console.debug", "console.trace"]
      : []
  },
  envPrefix: "VITE_"
}));
