import menuConfig, { moduleMeta, moduleOrder } from "./menuConfig";
import {
  normalizePermissions,
  pathMatchesPattern,
  resolveAllowedModules,
} from "../../../utils/permissionRoutes";

const itemMatchesExtraMenu = (item, extra = {}) => {
  const key = String(extra.key || "").toLowerCase();
  if (!key) return false;

  return (
    String(item.key || "").toLowerCase() === key ||
    String(item.name || "")
      .toLowerCase()
      .includes(key) ||
    String(item.path || "")
      .toLowerCase()
      .includes(`/${key}`)
  );
};

const hasModuleWildcard = (moduleId, allowedRoutes) =>
  allowedRoutes.some((routePattern) =>
    pathMatchesPattern(`/${moduleId}/dashboard`, routePattern),
  ) &&
  allowedRoutes.some(
    (routePattern) =>
      routePattern === "/*" || routePattern === `/${moduleId}/*`,
  );

const LEGACY_ROUTE_ALIASES = {
  "/contabilidad/movimientos": ["/contabilidad/files"],
  "/contabilidad/pagos-lote": ["/contabilidad/liquidaciones"],
};

const hasItemRoutePermission = (item, allowedRoutes) => {
  const candidatePaths = [
    item.path,
    ...(LEGACY_ROUTE_ALIASES[item.path] || []),
  ];
  return candidatePaths.some((path) =>
    allowedRoutes.some((routePattern) => pathMatchesPattern(path, routePattern)),
  );
};

const hasAllModuleRoutes = (moduleId, allowedRoutes) => {
  const items = menuConfig[moduleId] || [];
  return (
    items.length > 0 &&
    items.every((item) => hasItemRoutePermission(item, allowedRoutes))
  );
};

export const buildSidebarGroups = (auth = {}) => {
  const rawRole = auth?.role;
  const role = rawRole === null || rawRole === undefined || rawRole === ""
    ? null
    : Number(rawRole);
  const normalizedRole = Number.isInteger(role) ? role : null;
  const permissions = normalizePermissions(auth?.permissions);
  const allowedModules = resolveAllowedModules(auth);
  const allowedRoutes = permissions.allowed_routes;
  const extraMenus = permissions.extra_menus;
  const hasExplicitPermissions =
    permissions.allowed_modules.length > 0 ||
    allowedRoutes.length > 0 ||
    extraMenus.length > 0;
  const usesLegacyFallback = allowedRoutes.length === 0;
  const hasGlobalSuperAdminAccess = normalizedRole === 0 && !hasExplicitPermissions;

  return moduleOrder
    .map((moduleId) => {
      const moduleItems = menuConfig[moduleId] || [];
      const moduleExtras = extraMenus.filter(
        (extra) => extra?.module === moduleId,
      );
      const moduleIsAllowed =
        hasGlobalSuperAdminAccess || allowedModules.includes(moduleId);
      const moduleIsFull =
        hasGlobalSuperAdminAccess ||
        (moduleIsAllowed && usesLegacyFallback) ||
        hasModuleWildcard(moduleId, allowedRoutes) ||
        hasAllModuleRoutes(moduleId, allowedRoutes);

      const items = moduleItems.filter((item) => {
        if (item.hidden) return false;
        if (item.superadminOnly && normalizedRole !== 0) return false;
        if (hasGlobalSuperAdminAccess) return true;
        if (normalizedRole === 5 && moduleId === "almacen" && item.key === "inventario") {
          return true;
        }
        if (moduleIsAllowed && moduleIsFull) return true;
        if (hasItemRoutePermission(item, allowedRoutes)) return true;
        return moduleExtras.some((extra) => itemMatchesExtraMenu(item, extra));
      });

      if (items.length === 0) return null;

      return {
        id: moduleId,
        ...moduleMeta[moduleId],
        items,
        isPrimary: moduleIsAllowed,
      };
    })
    .filter(Boolean);
};
