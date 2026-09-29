const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== "");

const normalizeRole = (role) => {
  const parsed = Number(role);
  return Number.isFinite(parsed) ? parsed : null;
};

export const normalizeNotificationContext = (notification = {}) => {
  const rawContext = notification?.datos_contexto ?? notification?.metadata ?? {};
  if (!rawContext) return {};
  if (typeof rawContext === "object") return rawContext;

  try {
    return JSON.parse(rawContext);
  } catch {
    return {};
  }
};

const normalizeComparableText = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const getTitle = (notification) =>
  normalizeComparableText(notification?.titulo || notification?.title);

const getAction = (context) => String(context?.action || "").toLowerCase();

const isQuotationCreationNotification = (notification, context) => {
  const title = getTitle(notification);
  const action = getAction(context);
  const entityType = String(context?.entity_type || "").toLowerCase();

  return (
    (entityType === "cotizacion" && action === "created") ||
    title.includes("nueva cotizacion creada") ||
    title === "cotizacion creada"
  );
};

const wantsQuotationHistory = (notification, context) => {
  const title = getTitle(notification);
  const action = getAction(context);
  const navigationTarget = String(context?.navigation_target || "").toLowerCase();

  return (
    navigationTarget === "quotation_history" ||
    context?.open_history === true ||
    action === "sold_quotation_updated" ||
    action === "updated" ||
    title.includes("cotizacion actualizada")
  );
};

const isPostSaleQuotation = (notification, context) => {
  const title = getTitle(notification);
  const action = getAction(context);
  return (
    action === "sold_quotation_updated" ||
    String(context?.quotation_status || "").toLowerCase() === "sold" ||
    context?.refresh_graph === "cotizacion_sale" ||
    Boolean(
      context?.voucher_venta_id ||
        context?.voucher_id ||
        context?.voucher_reserva_id,
    ) ||
    title.includes("cotizacion de venta actualizada")
  );
};

const isQuotationNotification = (notification, context) => {
  const title = getTitle(notification);
  return (
    String(context?.entity_type || "").toLowerCase() === "cotizacion" ||
    Boolean(context?.cotizacion_id) ||
    title.includes("cotizacion")
  );
};

const isQuotationUpdateNotification = (notification, context) => {
  const title = getTitle(notification);
  const action = getAction(context);
  return (
    action === "updated" ||
    action === "sold_quotation_updated" ||
    title.includes("cotizacion actualizada") ||
    title.includes("cotizacion de venta actualizada")
  );
};

const isVoucherVentaNotification = (notification, context) => {
  const title = getTitle(notification);
  return (
    String(context?.entity_type || "").toLowerCase() === "voucher_venta" ||
    Boolean(context?.voucher_venta_id || context?.voucher_id) ||
    title.includes("voucher de venta")
  );
};

const isVoucherVentaUpdateNotification = (notification, context) => {
  const title = getTitle(notification);
  const action = getAction(context);
  return (
    action === "updated" ||
    action === "voucher_updated" ||
    action === "sold_quotation_updated" ||
    title.includes("voucher de venta actualizado")
  );
};

const isSafePathForRole = (path, role) => {
  if (!path || !path.startsWith("/")) return false;
  if (path.startsWith("/ventas")) return role === 0 || role === 2;
  if (path.startsWith("/reservas")) return role === 0 || role === 3;
  if (path.startsWith("/admin")) return role === 0 || role === 1;
  if (path.startsWith("/contabilidad")) return role === 0 || role === 4;
  if (path.startsWith("/almacen")) return role === 0 || role === 5;
  return true;
};

/**
 * Oculta ruido histórico y evita que Reservas reciba avisos comerciales que
 * todavía no corresponden a una venta. El backend aplica la misma regla, pero
 * esta protección mantiene limpio el dropdown durante despliegues escalonados.
 */
export const isNotificationVisibleForRole = (notification, userRole) => {
  const context = normalizeNotificationContext(notification);
  const role = normalizeRole(userRole);

  if (isQuotationCreationNotification(notification, context)) return false;

  if (
    role === 3 &&
    isQuotationNotification(notification, context) &&
    isQuotationUpdateNotification(notification, context)
  ) {
    return isPostSaleQuotation(notification, context);
  }

  return true;
};

export const resolveNotificationDestination = (notification, userRole) => {
  const context = normalizeNotificationContext(notification);
  const role = normalizeRole(userRole);
  const cotizacionId = firstDefined(
    context.cotizacion_id,
    context.quotation_id,
    context.original_cotizacion_id,
  );
  const voucherVentaId = firstDefined(
    context.voucher_venta_id,
    context.voucher_id,
  );
  const voucherReservaId = firstDefined(
    context.voucher_reserva_id,
    context.reservation_voucher_id,
  );

  if (!isNotificationVisibleForRole(notification, role)) return null;

  if (
    isQuotationNotification(notification, context) &&
    (wantsQuotationHistory(notification, context) ||
      isQuotationUpdateNotification(notification, context))
  ) {
    if (role === 0 || role === 2 || (role === 3 && isPostSaleQuotation(notification, context))) {
      return {
        kind: "quotation_history",
        label:
          role === 3
            ? "Ver historial de la venta"
            : "Ver historial de la cotización",
        cotizacionId,
        voucherVentaId,
        voucherReservaId,
      };
    }
  }

  if (
    isVoucherVentaNotification(notification, context) &&
    isVoucherVentaUpdateNotification(notification, context)
  ) {
    if (role === 0 || role === 2 || role === 3) {
      return {
        kind: "quotation_history",
        label: "Ver historial de la venta",
        cotizacionId,
        voucherVentaId,
        voucherReservaId,
      };
    }
  }

  const rawPath = notification?.url_accion || notification?.action_url;
  if (isSafePathForRole(rawPath, role)) {
    return {
      path: rawPath,
      kind: "route",
      label: "Abrir módulo relacionado",
    };
  }

  return null;
};
