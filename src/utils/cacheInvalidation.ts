/**
 * Utilidades para invalidar caché de React Query y el caché manual de GET.
 */

import { queryClient, queryKeys } from "../config/queryClient";
import { invalidateGetCache } from "./axiosInstance";

const normalizeVoucherId = (value) =>
  value === undefined || value === null ? "" : String(value);

const mergeVoucherPatch = (voucher, voucherId, patch) => {
  if (!voucher || typeof voucher !== "object") return voucher;
  if (normalizeVoucherId(voucher.id) !== normalizeVoucherId(voucherId)) {
    return voucher;
  }

  return {
    ...voucher,
    ...patch,
  };
};

const patchVoucherQueryValue = (current, voucherId, patch) => {
  if (!current) return current;

  if (Array.isArray(current)) {
    return current.map((voucher) =>
      mergeVoucherPatch(voucher, voucherId, patch),
    );
  }

  if (Array.isArray(current.data)) {
    return {
      ...current,
      data: current.data.map((voucher) =>
        mergeVoucherPatch(voucher, voucherId, patch),
      ),
    };
  }

  if (current.data && typeof current.data === "object") {
    return {
      ...current,
      data: mergeVoucherPatch(current.data, voucherId, patch),
    };
  }

  return mergeVoucherPatch(current, voucherId, patch);
};

/**
 * Sincroniza de inmediato un cambio parcial de voucher en todas las formas de
 * caché usadas por VouchersVenta. La lista guarda un array, mientras que los
 * endpoints de detalle conservan el wrapper `{ success, data }` del backend.
 */
export const patchVoucherVentaCache = (voucherId, patch) => {
  if (!voucherId || !patch || typeof patch !== "object") return;

  const updater = (current) =>
    patchVoucherQueryValue(current, voucherId, patch);

  queryClient.setQueriesData(
    { queryKey: queryKeys.vouchersVenta.all },
    updater,
  );
};

/**
 * Invalida todas las queries de vouchers de venta.
 */
export const invalidateVouchersVentaCache = ({ refetchType = "active" } = {}) => {
  invalidateGetCache("/turismo/vouchers-venta");
  queryClient.invalidateQueries({ queryKey: queryKeys.vouchersVenta.all, refetchType });
  queryClient.invalidateQueries({
    queryKey: queryKeys.vouchersVenta.withCotizaciones(),
    refetchType,
  });
};

/**
 * Invalida todas las queries de vouchers de reserva.
 */
export const invalidateVouchersReservaCache = ({ refetchType = "active" } = {}) => {
  queryClient.invalidateQueries({ queryKey: queryKeys.vouchersReserva.all, refetchType });
  queryClient.invalidateQueries({
    queryKey: queryKeys.vouchersReserva.withRelations(),
    refetchType,
  });
};

/**
 * Invalida un voucher de venta específico.
 * @param {string} voucherId - ID del voucher
 */
export const invalidateVoucherVentaById = (voucherId) => {
  invalidateGetCache("/turismo/vouchers-venta");
  queryClient.invalidateQueries({
    queryKey: queryKeys.vouchersVenta.detail(voucherId),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.vouchersVenta.withCotizacion(voucherId),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.vouchersVenta.withCotizaciones(),
  });
};

/**
 * Invalida un voucher de reserva específico.
 * @param {string} voucherId - ID del voucher
 */
export const invalidateVoucherReservaById = (voucherId) => {
  queryClient.invalidateQueries({
    queryKey: queryKeys.vouchersReserva.detail(voucherId),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.vouchersReserva.withRelation(voucherId),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.vouchersReserva.withRelations(),
  });
};

/**
 * Invalida queries de cotizaciones.
 */
export const invalidateCotizacionesCache = ({ refetchType = "active" } = {}) => {
  queryClient.invalidateQueries({
    queryKey: queryKeys.cotizaciones.lists(),
    refetchType,
  });
  queryClient.invalidateQueries({ queryKey: queryKeys.cotizaciones.all, refetchType });
};

/**
 * Invalida todo el caché de vouchers (venta + reserva).
 */
export const invalidateCotizacionGraphCache = ({
  refetchType = "active",
  includeVouchers = true,
} = {}) => {
  [
    "/turismo/cotizaciones",
    "/turismo/vouchers-venta",
    "/turismo/vouchers-venta/with-cotizacion",
    "/turismo/vouchers-reserva",
    "/turismo/vouchers-reserva/with-relations",
    "/turismo/vouchers-reserva/itinerario",
    "/turismo/payment-requests",
    "/turismo/pasajeros",
    "cotizaciones",
    "vouchers-venta",
    "vouchers-reserva",
    "payment-requests",
    "pasajeros",
    "itinerario",
  ].forEach(invalidateGetCache);

  invalidateCotizacionesCache({ refetchType });
  if (includeVouchers) {
    invalidateVouchersVentaCache({ refetchType });
    invalidateVouchersReservaCache({ refetchType });
  }

  queryClient.invalidateQueries({ queryKey: ["turismo"], refetchType });
  queryClient.invalidateQueries({ queryKey: ["cotizaciones"], refetchType });
  if (includeVouchers) {
    queryClient.invalidateQueries({ queryKey: ["vouchers-venta"], refetchType });
    queryClient.invalidateQueries({ queryKey: ["vouchers-reserva"], refetchType });
    queryClient.invalidateQueries({ queryKey: ["payment-requests"], refetchType });
  }
};

export const invalidateAllVouchersCache = () => {
  invalidateVouchersVentaCache();
  invalidateVouchersReservaCache();
};

/**
 * Invalida el grafo completo afectado por asignaciones y pagos de reservas.
 * Las cards de VouchersReserva se construyen con voucher_venta, voucher_reserva,
 * cotización, itinerario normalizado y payment_requests; si queda viva una sola
 * entrada, los contadores pueden mostrarse obsoletos.
 */
export const invalidateReservaAssignmentGraphCache = () => {
  [
    "/turismo/vouchers-reserva",
    "/turismo/vouchers-reserva/with-relations",
    "/turismo/vouchers-reserva/itinerario",
    "/turismo/vouchers-venta",
    "/turismo/vouchers-venta/with-cotizacion",
    "/turismo/cotizaciones",
    "/turismo/payment-requests",
    "vouchers-reserva",
    "vouchers-venta",
    "cotizaciones",
    "payment-requests",
    "itinerario",
  ].forEach(invalidateGetCache);

  invalidateVouchersReservaCache();
  invalidateVouchersVentaCache();
  invalidateCotizacionesCache();

  queryClient.invalidateQueries({ queryKey: ["turismo"] });
  queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
  queryClient.invalidateQueries({ queryKey: ["vouchers-reserva"] });
  queryClient.invalidateQueries({ queryKey: ["vouchers-venta"] });
  queryClient.invalidateQueries({ queryKey: ["cotizaciones"] });
};

export default {
  patchVoucherVentaCache,
  invalidateVouchersVentaCache,
  invalidateVouchersReservaCache,
  invalidateVoucherVentaById,
  invalidateVoucherReservaById,
  invalidateCotizacionesCache,
  invalidateCotizacionGraphCache,
  invalidateAllVouchersCache,
  invalidateReservaAssignmentGraphCache,
};
