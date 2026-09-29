// src/index.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BrowserRouter as Router } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "./config/queryClient";
import * as serviceWorkerRegistration from "./serviceWorkerRegistration";
import { clearTigrisImageCache } from "./utils/tigrisImageCache";
import { installDomTranslationGuard } from "./utils/domTranslationGuard";
import { wakeBackend } from "./utils/backendWake";
import "./index.scss";
import "./styles/venso-brand.scss";

installDomTranslationGuard();
// Inicia el backend autosuspendido antes de que AuthContext verifique sesión.
// Las rutas posteriores comparten este mismo ciclo y no crean polling.
void wakeBackend("bootstrap");

const root = ReactDOM.createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <AuthProvider>
          <App />
        </AuthProvider>
      </Router>
      {/* DevTools solo en desarrollo, posición inferior izquierda, panel minimizado */}
      {import.meta.env.DEV && (
        <ReactQueryDevtools
          initialIsOpen={false}
          position="bottom"
          buttonPosition="bottom-left"
        />
      )}
    </QueryClientProvider>
  </React.StrictMode>,
);

const hasSession = Boolean(
  typeof window !== "undefined" && window.sessionStorage?.getItem("user"),
);

const updateServiceWorkerForAuth = (authenticated: boolean) => {
  if (authenticated) {
    serviceWorkerRegistration.register();
  } else {
    serviceWorkerRegistration.unregister();
    clearTigrisImageCache();
  }
};

updateServiceWorkerForAuth(hasSession);

if (typeof window !== "undefined") {
  window.addEventListener("auth:login", () => updateServiceWorkerForAuth(true));
  window.addEventListener("auth:logout", () => updateServiceWorkerForAuth(false));
}
