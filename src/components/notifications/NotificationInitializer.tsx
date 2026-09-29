import React, { useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useNotificationContext } from "../../context/NotificationContext";

/**
 * Componente para inicializar las notificaciones SSE cuando el usuario se autentica
 * Maneja múltiples sesiones simultáneas sin interferencia
 * Cada sesión tiene su propia conexión SSE basada en la cookie de sesión
 * Se desconecta correctamente al cerrar sesión específica
 */
const NotificationInitializer = ({ children }) => {
  const { auth } = useAuth();
  const { setUserAndConnect, isConnected, disconnectFromSse } =
    useNotificationContext();

  // Listener para evento de logout - desconectar SSE ANTES de limpiar el auth
  useEffect(() => {
    const handleLogout = () => {
      disconnectFromSse();
    };

    window.addEventListener("auth:logout", handleLogout);

    return () => {
      window.removeEventListener("auth:logout", handleLogout);
    };
  }, [disconnectFromSse]);

  // Conectar cuando el usuario esté autenticado (la sesión viaja en cookie)
  useEffect(() => {
    if (
      auth.isAuthenticated &&
      auth.dniuser &&
      auth.role !== undefined
    ) {
      // Solo configurar info del usuario si no está ya conectado
      if (!isConnected) {
        setUserAndConnect(auth.dniuser, auth.role);
      }
    } else if (!auth.isAuthenticated && isConnected) {
      disconnectFromSse();
    }
  }, [
    auth.isAuthenticated,
    auth.dniuser,
    auth.role,
    setUserAndConnect,
    isConnected,
    disconnectFromSse,
  ]);

  return children;
};

export default NotificationInitializer;


