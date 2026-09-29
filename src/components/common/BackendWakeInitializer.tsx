import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { wakeBackend } from "../../utils/backendWake";

/**
 * Dispara un wake al entrar a cualquier ruta del SPA y sólo repite el ciclo
 * cuando el usuario vuelve a la aplicación, recupera conexión o navega tras
 * un intento agotado. `wakeBackend` deduplica las llamadas y nunca deja un
 * polling activo.
 */
const BackendWakeInitializer = () => {
  const location = useLocation();

  useEffect(() => {
    void wakeBackend("route");
  }, [location.pathname, location.search]);

  useEffect(() => {
    const wakeOnVisibility = () => {
      if (!document.hidden) {
        void wakeBackend("visibility");
      }
    };

    const wakeOnOnline = () => {
      void wakeBackend("online");
    };

    document.addEventListener("visibilitychange", wakeOnVisibility);
    window.addEventListener("online", wakeOnOnline);

    return () => {
      document.removeEventListener("visibilitychange", wakeOnVisibility);
      window.removeEventListener("online", wakeOnOnline);
    };
  }, []);

  return null;
};

export default BackendWakeInitializer;
