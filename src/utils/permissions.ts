/**
 * Helpers reutilizables para evaluar permisos de usuario.
 * Soportan tanto `user` (AuthContext.user) como `auth` (AuthContext.auth),
 * y normalizan `role` que puede venir como número o string.
 */

const normalizeRole = (user) => {
  const raw = user?.role ?? user?.auth?.role;
  if (raw === undefined || raw === null) return null;
  return typeof raw === "string" ? parseInt(raw, 10) : Number(raw);
};

const getPermissionActions = (user) => {
  const direct = user?.permissions?.actions;
  const nested = user?.auth?.permissions?.actions;
  if (Array.isArray(direct)) return direct;
  if (Array.isArray(nested)) return nested;
  return [];
};

const hasPermissionAction = (user, action) => {
  if (!action) return false;
  const actions = getPermissionActions(user);
  return actions.includes("*") || actions.includes(action);
};

export const isSuperAdmin = (user) => {
  if (!user) return false;
  if (user.platform === "all" || user.auth?.platform === "all") return true;
  const role = normalizeRole(user);
  return role === 0;
};

export const canSearchCotizacionById = (user) => isSuperAdmin(user);

/**
 * Alcance real que el backend aplica al listado de cotizaciones.
 * `all` corresponde a superadmin/multi-plataforma, `platform` a los roles
 * con lectura ampliada dentro de VENSO y `own` al vendedor sin ese permiso.
 */
export const getCotizacionVisibilityScope = (user) => {
  if (isSuperAdmin(user)) return "all";

  const role = normalizeRole(user);
  if (
    role === 1 ||
    role === 3 ||
    role === 4 ||
    hasPermissionAction(user, "view_all_quotes")
  ) {
    return "platform";
  }

  return "own";
};

export const canViewAllCotizaciones = (user) =>
  getCotizacionVisibilityScope(user) !== "own";

export const canViewAllVouchers = (user) => {
  if (isSuperAdmin(user)) return true;
  const role = normalizeRole(user);
  return (
    role === 1 ||
    role === 3 ||
    role === 4 ||
    user?.permissions?.actions?.includes("view_all_vouchers") ||
    user?.auth?.permissions?.actions?.includes("view_all_vouchers")
  );
};

export const getUserPlatform = (user) => {
  const platform = user?.platform || user?.auth?.platform || "venso";
  return platform;
};
