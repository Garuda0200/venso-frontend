import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { voucherVentaService } from "../services/voucherVentaService";
import { queryKeys } from "../config/queryClient";
import { invalidateComisionesCache } from "../services/comisionesService";
import { invalidateCotizacionGraphCache } from "../utils/cacheInvalidation";

/**
 * Hook para obtener todos los vouchers de venta
 * @returns {UseQueryResult} Query result con los vouchers
 */
export const useVouchersVenta = () => {
  return useQuery({
    queryKey: queryKeys.vouchersVenta.all,
    queryFn: ({ signal }) =>
      voucherVentaService.getVouchers({ skipCache: true, signal }),
    staleTime: 1000 * 60 * 20, // 20 minutos - Lista general menos volátil
    refetchOnMount: true,
  });
};

/**
 * Hook para obtener todos los vouchers de venta con cotización
 * @returns {UseQueryResult} Query result con los vouchers completos
 */
export const useVouchersVentaWithCotizacion = () => {
  return useQuery({
    queryKey: queryKeys.vouchersVenta.withCotizaciones(),
    // La lista es una consulta de página compartida. No se enlaza al AbortSignal
    // efímero del observador porque el doble montaje de React StrictMode puede
    // cancelar la primera lectura justo antes de que el segundo observador la
    // reutilice, dejando la pantalla en estado "canceled" hasta reintentar.
    queryFn: async () => {
      const response = await voucherVentaService.getVouchersWithCotizacion({
        skipCache: false,
      });
      if (response.success && response.data) {
        return Array.isArray(response.data) ? response.data : [];
      }
      throw new Error("Error al obtener vouchers");
    },
    staleTime: 1000 * 60 * 15, // 15 minutos - Datos con relaciones
    refetchOnMount: true,
    retry: (failureCount, error) =>
      error?.code !== "ERR_CANCELED" &&
      error?.name !== "CanceledError" &&
      failureCount < 2,
  });
};

/**
 * Hook para obtener un voucher de venta por ID (simple, sin cotización)
 * @param {string} id - ID del voucher de venta
 * @param {Object} options - Opciones adicionales para el query
 * @returns {UseQueryResult} Query result con el voucher
 */
export const useVoucherVenta = (id, options = {}) => {
  return useQuery({
    queryKey: queryKeys.vouchersVenta.detail(id),
    queryFn: () => voucherVentaService.getVoucherById(id),
    enabled: !!id, // Solo ejecutar si hay ID
    staleTime: 1000 * 60 * 30, // 30 minutos - Dato específico
    ...options,
  });
};

/**
 * Hook para obtener un voucher de venta por ID CON COTIZACIÓN
 * Incluye: cotizacion_data, movimientos, documentos
 *
 * @param {string} id - ID del voucher de venta
 * @param {Object} options - Opciones adicionales para el query
 * @returns {UseQueryResult} Query result con el voucher completo
 */
export const useVoucherVentaWithCotizacion = (id, options = {}) => {
  return useQuery({
    queryKey: queryKeys.vouchersVenta.withCotizacion(id),
    queryFn: () => voucherVentaService.getVoucherWithCotizacionById(id),
    enabled: !!id, // Solo ejecutar si hay ID
    staleTime: 1000 * 60 * 20, // 20 minutos - Datos completos
    ...options,
  });
};

/**
 * Hook para crear un nuevo voucher de venta
 * Invalida el caché de vouchers al completar
 *
 * @returns {UseMutationResult} Mutation result
 */
export const useCreateVoucherVenta = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (voucherData) => voucherVentaService.createVoucher(voucherData),
    onSuccess: () => {
      invalidateCotizacionGraphCache();
      // Invalidar TODAS las queries relacionadas con vouchers de venta
      queryClient.invalidateQueries({
        queryKey: queryKeys.vouchersVenta.all,
      });

      // Invalidar explícitamente la lista con cotizaciones
      queryClient.invalidateQueries({
        queryKey: queryKeys.vouchersVenta.withCotizaciones(),
      });

      // Invalidar caché de comisiones porque depende de vouchers de venta
      invalidateComisionesCache();

      console.log(" Caché de vouchers de venta invalidado después de crear");
    },
    onError: (error) => {
      console.error(" Error al crear voucher de venta:", error);
    },
  });
};

/**
 * Hook para actualizar un voucher de venta existente
 * Invalida el caché del voucher específico y la lista
 *
 * @returns {UseMutationResult} Mutation result
 */
export const useUpdateVoucherVenta = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) => voucherVentaService.updateVoucher(id, data),
    onSuccess: (data, variables) => {
      invalidateCotizacionGraphCache();
      // Invalidar el voucher específico
      queryClient.invalidateQueries({
        queryKey: queryKeys.vouchersVenta.detail(variables.id),
      });

      // Invalidar la versión con cotización específica
      queryClient.invalidateQueries({
        queryKey: queryKeys.vouchersVenta.withCotizacion(variables.id),
      });

      // Invalidar lista de todos con cotizaciones
      queryClient.invalidateQueries({
        queryKey: queryKeys.vouchersVenta.withCotizaciones(),
      });

      // Invalidar las listas
      queryClient.invalidateQueries({
        queryKey: queryKeys.vouchersVenta.lists(),
      });

      // Invalidar caché de comisiones porque depende de vouchers de venta
      invalidateComisionesCache();

      console.log(
        " Caché de voucher de venta invalidado después de actualizar",
      );
    },
    onError: (error) => {
      console.error(" Error al actualizar voucher de venta:", error);
    },
  });
};

/**
 * Hook para eliminar un voucher de venta
 * Invalida el caché después de eliminar
 *
 * @returns {UseMutationResult} Mutation result
 */
export const useDeleteVoucherVenta = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => voucherVentaService.deleteVoucher(id),
    onSuccess: (data, voucherId) => {
      invalidateCotizacionGraphCache();
      // Invalidar el voucher específico
      queryClient.invalidateQueries({
        queryKey: queryKeys.vouchersVenta.detail(voucherId),
      });

      // Invalidar la versión con cotización específica
      queryClient.invalidateQueries({
        queryKey: queryKeys.vouchersVenta.withCotizacion(voucherId),
      });

      // Invalidar lista de todos con cotizaciones
      queryClient.invalidateQueries({
        queryKey: queryKeys.vouchersVenta.withCotizaciones(),
      });

      // Invalidar las listas
      queryClient.invalidateQueries({
        queryKey: queryKeys.vouchersVenta.lists(),
      });

      // Invalidar la lista general
      queryClient.invalidateQueries({
        queryKey: queryKeys.vouchersVenta.all,
      });

      // Invalidar caché de comisiones porque depende de vouchers de venta
      invalidateComisionesCache();

      console.log(" Caché de voucher de venta invalidado después de eliminar");
    },
    onError: (error) => {
      console.error(" Error al eliminar voucher de venta:", error);
    },
  });
};

export default {
  useVouchersVenta,
  useVouchersVentaWithCotizacion,
  useVoucherVenta,
  useVoucherVentaWithCotizacion,
  useCreateVoucherVenta,
  useUpdateVoucherVenta,
  useDeleteVoucherVenta,
};
