import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import LoadingSpinner from "./LoadingSpinner";
import {
  hasRoutePermission,
  normalizePermissions,
} from "../utils/permissionRoutes";

const RoleBasedRoute = ({ allowedRoles, defaultPath, children }) => {
  const { auth } = useAuth();

  // Si estamos cargando la autenticación, mostrar spinner
  if (auth.loading) {
    return <LoadingSpinner />;
  }

  // Conservar la ruta actual si estamos autenticados
  const currentPath = window.location.pathname;

  // Check if user is authenticated
  if (!auth.isAuthenticated) {
    return <Navigate to="/" state={{ from: currentPath }} replace />;
  }

  // If no allowed roles are provided, grant access (should not happen)
  if (!allowedRoles || allowedRoles.length === 0) {
    console.warn(
      "No se proporcionaron roles permitidos para la ruta protegida",
    );
    return children;
  }

  // Check if user role is in the allowed roles or if the path is explicitly allowed in permissions
  const hasPermission = React.useMemo(() => {
    const role = Number(auth.role);
    const permissions = normalizePermissions(auth.permissions);
    const hasExplicitPermissionMap =
      permissions.allowed_routes.length > 0 ||
      permissions.allowed_modules.length > 0 ||
      permissions.extra_menus.length > 0;

    const isOwnProfileRoute =
      /^\/(admin|ventas|reservas|contabilidad|almacen)\/configuracion\/?$/.test(
        currentPath,
      );

    if (isOwnProfileRoute) {
      return true;
    }

    if (
      role === 0 &&
      (allowedRoles.includes(0) || allowedRoles.includes("0"))
    ) {
      return true;
    }

    if (hasExplicitPermissionMap) {
      return hasRoutePermission(auth, currentPath);
    }

    return allowedRoles.includes(role) || allowedRoles.includes(auth.role);
  }, [auth.role, auth.permissions, currentPath, allowedRoles]);

  // User is authorized, render the protected route
  if (hasPermission) {
    return children;
  }

  // User is not authorized, redirect to 404 page instead of rendering it in the current layout
  return <Navigate to="/404" replace />;
};

export default RoleBasedRoute;
