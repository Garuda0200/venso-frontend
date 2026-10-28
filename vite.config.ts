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
    open: false,
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
    minify: true,
    rolldownOptions: {
      treeshake: {
        manualPureFunctions: mode === "production" ? ["console.log", "console.info", "console.debug", "console.trace"] : [],
      },
      external: ["quill"],
      output: {
        codeSplitting: {
          groups: Object.entries({
          react: ["react", "react-dom", "react-router-dom"],
          data: ["@tanstack/react-query", "axios"],
          ui: ["primereact", "react-icons"],
          forms: ["react-datepicker"],
          dnd: ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
          charts: ["chart.js", "react-chartjs-2"],
          excel: ["xlsx", "exceljs", "file-saver"],
          pdf: ["pdf-lib", "html2canvas", "html-to-image"]
          }).map(([name, packages]) => ({
            name,
            test: (id) => packages.some((pkg) => id.replaceAll("\\", "/").includes(`/node_modules/${pkg}/`)),
          })),
        }
      }
    }
  },
  envPrefix: "VITE_"
}));
