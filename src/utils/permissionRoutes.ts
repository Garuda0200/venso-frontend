export const ROLE_DEFAULT_MODULES = {
  0: ["admin", "ventas", "reservas", "contabilidad", "almacen"],
  1: ["admin"],
  2: ["ventas"],
  3: ["reservas"],
  4: ["contabilidad"],
  5: ["almacen"],
};

export const MODULE_DEFAULT_PATHS = {
  admin: "/admin/dashboard",
  ventas: "/ventas/dashboard",
  reservas: "/reservas/dashboard",
  contabilidad: "/contabilidad/dashboard",
  almacen: "/almacen/inventario",
};

const cleanPath = (value = "") => {
  const path = String(value || "").trim();
  if (!path) return "";
  if (path === "/") return "/";
  return path.replace(/\/+$/, "");
};

const migrateLegacyRoutePattern = (value = "") =>
  String(value || "").replace(
    /^\/contabilidad\/patrimonio(?=\/|$)/,
    "/almacen/patrimonio",
  );

const EMPTY_PERMISSIONS = {
  allowed_modules: [],
  allowed_routes: [],
  extra_menus: [],
  actions: [],
};

export const normalizePermissions = (permissions) => {
  if (!permissions) return { ...EMPTY_PERMISSIONS };

  let parsed = permissions;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return { ...EMPTY_PERMISSIONS };
    }
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ...EMPTY_PERMISSIONS };
  }

  return {
    ...parsed,
    allowed_modules: uniqueStrings(parsed.allowed_modules),
    allowed_routes: uniqueStrings(parsed.allowed_routes).map(
      migrateLegacyRoutePattern,
    ),
    extra_menus: Array.isArray(parsed.extra_menus) ? parsed.extra_menus : [],
    actions: uniqueStrings(parsed.actions),
  };
};

export const uniqueStrings = (values = []) => {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values.map((value) => String(value || "").trim()).filter(Boolean),
    ),
  ];
};

export const resolveAllowedModules = (auth = {}) => {
  const role = Number(auth?.role);
  const permissions = normalizePermissions(auth?.permissions);
  const configuredModules = permissions.allowed_modules;

  if (role === 0) {
    return configuredModules.length > 0
      ? configuredModules
      : ROLE_DEFAULT_MODULES[0];
  }

  if (configuredModules.length > 0) {
    return configuredModules;
  }

  return ROLE_DEFAULT_MODULES[role] || [];
};

export const pathMatchesPattern = (path, pattern) => {
  const currentPath = cleanPath(path);
  const routePattern = cleanPath(pattern);

  if (!currentPath || !routePattern) return false;
  if (routePattern === "/*" || routePattern === "*") return true;

  if (routePattern.endsWith("/*")) {
    const base = cleanPath(routePattern.slice(0, -2));
    return currentPath === base || currentPath.startsWith(`${base}/`);
  }

  return (
    currentPath === routePattern || currentPath.startsWith(`${routePattern}/`)
  );
};

export const moduleRootFromPath = (path = "") => {
  const [moduleId] = cleanPath(path).split("/").filter(Boolean);
  return moduleId || "";
};

export const getFirstAllowedPath = (auth = {}) => {
  const role = Number(auth?.role);
  const permissions = normalizePermissions(auth?.permissions);
  const firstConcreteRoute = permissions.allowed_routes.find((routePattern) => {
    const route = cleanPath(routePattern);
    return route && route !== "/*" && !route.endsWith("/*");
  });

  if (firstConcreteRoute) return firstConcreteRoute;

  const firstWildcardRoute = permissions.allowed_routes.find((routePattern) => {
    const route = cleanPath(routePattern);
    return route && route !== "/*" && route.endsWith("/*");
  });

  if (firstWildcardRoute) {
    const moduleId = moduleRootFromPath(firstWildcardRoute);
    return (
      MODULE_DEFAULT_PATHS[moduleId] ||
      cleanPath(firstWildcardRoute.slice(0, -2))
    );
  }

  const firstModule =
    resolveAllowedModules(auth)[0] || ROLE_DEFAULT_MODULES[role]?.[0];
  return MODULE_DEFAULT_PATHS[firstModule] || "/";
};

export const hasRoutePermission = (auth = {}, path = "") => {
  const role = Number(auth?.role);
  if (role === 0) return true;

  const currentPath = cleanPath(path);
  const permissions = normalizePermissions(auth?.permissions);
  const allowedRoutes = permissions.allowed_routes;

  if (
    allowedRoutes.some((routePattern) =>
      pathMatchesPattern(currentPath, routePattern),
    )
  ) {
    return true;
  }

  const extraMenuAllowsRoute = permissions.extra_menus.some((extra = {}) => {
    const moduleName = String(extra.module || "").trim();
    const key = String(extra.key || "").trim();
    return (
      moduleName &&
      key &&
      pathMatchesPattern(currentPath, `/${moduleName}/${key}`)
    );
  });

  if (extraMenuAllowsRoute) return true;

  if (allowedRoutes.length === 0) {
    return resolveAllowedModules(auth).some((moduleName) =>
      pathMatchesPattern(currentPath, `/${moduleName}/*`),
    );
  }

  return false;
};
