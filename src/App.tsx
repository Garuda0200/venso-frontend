import React, { useMemo } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import {
  AdminRoutes,
  VentasRoutes,
  HomeRoutes,
  ReservasRoutes,
  AlmacenRoutes,
  ContabilidadRoutes,
  ExtraRoutes,
} from "./router";
import { useAuth } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";
import NotificationInitializer from "./components/notifications/NotificationInitializer";
import NotificationPreviewContainer from "./components/notifications/NotificationPreview/NotificationPreview";
import BackendStatusBanner from "./components/common/BackendStatusBanner";
import BackendWakeInitializer from "./components/common/BackendWakeInitializer";
import RoleBasedRoute from "./components/RoleBasedRoute";
import LoadingSpinner from "./components/LoadingSpinner";
import { NotFoundPage } from "./pages/Extra";
import { MyTour } from "./pages/Home/MyTour";
import {
  getFirstAllowedPath,
  hasRoutePermission,
} from "./utils/permissionRoutes";
import "primereact/resources/themes/saga-blue/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";

export default function App() {
  const { auth } = useAuth();

  // Routing inicial basado en permisos efectivos, no solo en el rol nominal.
  const getDefaultPath = useMemo(
    () => (role, permissions) => getFirstAllowedPath({ role, permissions }),
    [],
  );

  // Mostrar spinner mientras se carga la autenticación
  if (auth.loading) {
    return <LoadingSpinner />;
  }

  // Function to determine where to redirect based on the current path and user role
  const redirectBasedOnPath = (path) => {
    // If the user is authenticated, check if they're already in a valid module
    if (auth.isAuthenticated) {
      // First check if the path is one of the extra routes, which are accessible to all
      if (path.startsWith("/extra") || path === "/404") {
        return path;
      }

      if (hasRoutePermission(auth, path)) {
        return path;
      }

      // If the path is not allowed, send the user to a 404 page instead of redirecting
      // This way they see "page not found" rather than being redirected without context
      return "/404";
    }

    // Not authenticated, go to login
    return "/login";
  };

  return (
    <NotificationProvider>
      <NotificationInitializer>
        <BackendWakeInitializer />
        <BackendStatusBanner />
        <Routes>
          {/* Ruta raíz - redirige a login o dashboard según autenticación */}
          <Route
            path="/"
            element={
              auth.isAuthenticated ? (
                <Navigate
                  to={getDefaultPath(auth.role, auth.permissions)}
                  replace
                />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

          {/* Ruta de login - si ya está autenticado, redirige a su dashboard */}
          <Route
            path="/login/*"
            element={
              auth.isAuthenticated ? (
                <Navigate
                  to={getDefaultPath(auth.role, auth.permissions)}
                  replace
                />
              ) : (
                <HomeRoutes />
              )
            }
          />

          {/* Rutas de administración */}
          <Route
            path="/admin/*"
            element={
              <RoleBasedRoute
                allowedRoles={[0, 1]}
                defaultPath={redirectBasedOnPath(window.location.pathname)}
              >
                <AdminRoutes />
              </RoleBasedRoute>
            }
          />

          {/* Rutas de ventas */}
          <Route
            path="/ventas/*"
            element={
              <RoleBasedRoute
                allowedRoles={[0, 2]}
                defaultPath={redirectBasedOnPath(window.location.pathname)}
              >
                <VentasRoutes />
              </RoleBasedRoute>
            }
          />

          <Route
            path="/reservas/*"
            element={
              <RoleBasedRoute
                allowedRoles={[0, 3]}
                defaultPath={redirectBasedOnPath(window.location.pathname)}
              >
                <ReservasRoutes />
              </RoleBasedRoute>
            }
          />

          {/* Rutas de contabilidad */}
          <Route
            path="/contabilidad/*"
            element={
              <RoleBasedRoute
                allowedRoles={[0, 4]}
                defaultPath={redirectBasedOnPath(window.location.pathname)}
              >
                <ContabilidadRoutes />
              </RoleBasedRoute>
            }
          />

          {/* Rutas de almacen */}
          <Route
            path="/almacen/*"
            element={
              <RoleBasedRoute
                allowedRoles={[0, 5]}
                defaultPath={redirectBasedOnPath(window.location.pathname)}
              >
                <AlmacenRoutes />
              </RoleBasedRoute>
            }
          />

          {/* Rutas especiales (páginas de error y bajo construcción) */}
          <Route path="/extra/*" element={<ExtraRoutes />} />

          {/* Ruta 404 directa - accesible para todos */}
          <Route path="/404" element={<NotFoundPage />} />

          {/* Ruta directa para MyTour - accesible para todos sin login */}
          <Route path="/mi-tour" element={<MyTour />} />

          {/* Ruta directa para MyTour alternativo */}
          <Route path="/mytour" element={<MyTour />} />

          {/* Ruta para manejar URLs no encontradas en la raíz de la aplicación */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>

        {/* Contenedor global de previews de notificaciones - idéntico a Leptos */}
        <NotificationPreviewContainer />
      </NotificationInitializer>
    </NotificationProvider>
  );
}
