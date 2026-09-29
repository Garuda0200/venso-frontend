import React, { useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { wakeBackend } from "../../utils/backendWake";
import "./BackendStatusBanner.scss";

const BackendStatusBanner = () => {
  const { auth } = useAuth();

  const handleRetry = useCallback(() => {
    void wakeBackend("manual");
  }, []);

  if (auth.loading || auth.backendAvailable) {
    return null;
  }

  return (
    <div className="backend-status-banner" role="status" aria-live="polite">
      <div className="backend-status-banner__glow backend-status-banner__glow--one" />
      <div className="backend-status-banner__glow backend-status-banner__glow--two" />

      <div className="backend-status-banner__card">
        <div className="backend-status-banner__visual" aria-hidden="true">
          <div className="backend-status-banner__orb">
            <div className="backend-status-banner__robot">
              <svg viewBox="0 0 320 260" focusable="false">
                <rect x="84" y="38" width="152" height="118" rx="20" />
                <rect x="102" y="58" width="116" height="72" rx="14" />
                <circle cx="136" cy="94" r="10" />
                <circle cx="184" cy="94" r="10" />
                <path d="M132 122c12-10 44-10 56 0" />
                <path d="M160 18v24" />
                <circle cx="160" cy="14" r="8" />
                <path d="M120 156v34" />
                <path d="M200 156v34" />
                <path d="M104 182l-18 38" />
                <path d="M216 182l18 38" />
                <path d="M78 86l-34 22" />
                <path d="M242 86l34 22" />
                <circle cx="42" cy="110" r="11" />
                <circle cx="278" cy="110" r="11" />
                <path d="M58 188l22-6" />
                <path d="M248 190l16 18" />
                <circle cx="236" cy="198" r="6" />
                <circle cx="70" cy="196" r="4" />
              </svg>
            </div>
          </div>
        </div>

        <div className="backend-status-banner__content">
          <div className="backend-status-banner__header-row">
            <span className="backend-status-banner__eyebrow">
              Reconexión automática
            </span>
            <span className="backend-status-banner__live-chip">
              <span className="backend-status-banner__pulse" />
              En espera
            </span>
          </div>

          <h1>El servidor está temporalmente fuera de línea</h1>
          <p>
            {auth.isAuthenticated
              ? "Tu sesión local sigue protegida. Mantendremos la pantalla en pausa y reanudaremos la aplicación apenas el backend responda nuevamente."
              : "La aplicación necesita recuperar comunicación con el backend para habilitar el ingreso y la carga de datos."}
          </p>

          <div className="backend-status-banner__status-grid">
            <div className="backend-status-banner__status-card">
              <span>Servidor</span>
              <strong>Sin respuesta</strong>
            </div>
            <div className="backend-status-banner__status-card">
              <span>Sesión</span>
              <strong>{auth.isAuthenticated ? "Conservada" : "Pendiente"}</strong>
            </div>
            <div className="backend-status-banner__status-card">
              <span>Reintento</span>
              <strong>Al ingresar</strong>
            </div>
          </div>

          <div className="backend-status-banner__actions">
            <button type="button" onClick={handleRetry}>
              Reintentar ahora
            </button>
            <span>
              Reintentaremos al volver a la aplicación, recuperar conexión o
              navegar a otra pantalla.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BackendStatusBanner;
