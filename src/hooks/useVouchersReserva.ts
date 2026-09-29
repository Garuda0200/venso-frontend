import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { voucherReservaService } from "../services/voucherReservaService";
import { queryKeys } from "../config/queryClient";
import { invalidateReservaAssignmentGraphCache } from "../utils/cacheInvalidation";

/**
 * Hook para obtener todos los vouchers de reserva
 * @returns {UseQueryResult} Query result con los vouchers
 */
export const useVouchersReserva = () => {
  return useQuery({
    queryKey: queryKeys.vouchersReserva.all,
    queryFn: ({ signal }) =>
      voucherReservaService.getAllVoucherReservas({ skipCache: true, signal }),
    staleTime: 1000 * 60 * 20, // 20 minutos - Lista general menos volátil
    refetchOnMount: true,
  });
};

/**
 * Hook para obtener todos los vouchers de reserva con relaciones (voucher venta + cotización)
 * @returns {UseQueryResult} Query result con los vouchers completos
 */
export const useVouchersReservaWithRelations = () => {
  return useQuery({
    queryKey: queryKeys.vouchersReserva.withRelations(),
    queryFn: ({ signal }) =>
      voucherReservaService.getVoucherReservasWithRelations({
        skipCache: true,
        signal,
      }),
    staleTime: 1000 * 60 * 15, // 15 minutos - Datos más complejos
    refetchOnMount: true,
  });
};

/**
 * Hook para obtener un voucher de reserva por ID (simple, sin relaciones)
 * @param {string} id - ID del voucher de reserva
 * @param {Object} options - Opciones adicionales para el query
 * @returns {UseQueryResult} Query result con el voucher
 */
export const useVoucherReserva = (id, options = {}) => {
  return useQuery({
    queryKey: queryKeys.vouchersReserva.detail(id),
    queryFn: () => voucherReservaService.getVoucherReservaById(id),
    enabled: !!id, // Solo ejecutar si hay ID
    staleTime: 1000 * 60 * 30, // 30 minutos - Dato específico
    ...options,
  });
};

/**
 * Hook para obtener un voucher de reserva por ID CON RELACIONES
 * Incluye: voucher_data, cotizacion_data, assigned_itinerary
 *
 * @param {string} id - ID del voucher de reserva
 * @param {Object} options - Opciones adicionales para el query
 * @returns {UseQueryResult} Query result con el voucher completo
 */
export const useVoucherReservaWithRelations = (id, options = {}) => {
  return useQuery({
    queryKey: queryKeys.vouchersReserva.withRelation(id),
    queryFn: () => voucherReservaService.getVoucherReservaWithRelationsById(id),
    enabled: !!id, // Solo ejecutar si hay ID
    staleTime: 1000 * 60 * 20, // 20 minutos - Datos completos cambian con frecuencia moderada
    ...options,
  });
};

/**
 * Hook para crear un nuevo voucher de reserva
 * Invalida el caché de vouchers al completar
 *
 * @returns {UseMutationResult} Mutation result
 */
export const useCreateVoucherReserva = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (voucherReservaData) =>
      voucherReservaService.createVoucherReserva(voucherReservaData),
    onSuccess: () => {
      invalidateReservaAssignmentGraphCache();
      // Invalidar TODAS las queries relacionadas con vouchers de reserva
      queryClient.invalidateQueries({
        queryKey: queryKeys.vouchersReserva.all,
      });

      console.log(" Caché de vouchers de reserva invalidado después de crear");
    },
    onError: (error) => {
      console.error(" Error al crear voucher de reserva:", error);
    },
  });
};

/**
 * Hook para actualizar un voucher de reserva existente
 * Invalida el caché del voucher específico y la lista
 *
 * @returns {UseMutationResult} Mutation result
 */
export const useUpdateVoucherReserva = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) =>
      voucherReservaService.updateVoucherReserva(id, data),
    onSuccess: (data, variables) => {
      invalidateReservaAssignmentGraphCache();
      // Invalidar el voucher específico
      queryClient.invalidateQueries({
        queryKey: queryKeys.vouchersReserva.detail(variables.id),
      });

      // Invalidar el voucher con relaciones
      queryClient.invalidateQueries({
        queryKey: queryKeys.vouchersReserva.withRelation(variables.id),
      });

      // Invalidar la lista completa
      queryClient.invalidateQueries({
        queryKey: queryKeys.vouchersReserva.lists(),
      });

      // Invalidar la lista con relaciones
      queryClient.invalidateQueries({
        queryKey: queryKeys.vouchersReserva.withRelations(),
      });

      console.log(" Caché de voucher de reserva actualizado:", variables.id);
    },
    onError: (error, variables) => {
      console.error(
        " Error al actualizar voucher de reserva:",
        variables.id,
        error,
      );
    },
  });
};

/**
 * Hook para actualizar la asignación de servicios de un voucher
 * Similar a updateVoucherReserva pero específico para assigned_itinerary
 *
 * @returns {UseMutationResult} Mutation result
 */
export const useUpdateServiceAssignments = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ voucherId, assignedItinerary, dateInfo }) =>
      voucherReservaService.updateServiceAssignments(
        voucherId,
        assignedItinerary,
        dateInfo,
      ),
    onSuccess: (data, variables) => {
      invalidateReservaAssignmentGraphCache();
      // Invalidar el voucher específico
      queryClient.invalidateQueries({
        queryKey: queryKeys.vouchersReserva.detail(variables.voucherId),
      });

      // Invalidar el voucher con relaciones
      queryClient.invalidateQueries({
        queryKey: queryKeys.vouchersReserva.withRelation(variables.voucherId),
      });

      // Invalidar listas
      queryClient.invalidateQueries({
        queryKey: queryKeys.vouchersReserva.lists(),
      });

      queryClient.invalidateQueries({
        queryKey: queryKeys.vouchersReserva.withRelations(),
      });

      console.log(
        " Asignación de servicios actualizada y caché invalidado:",
        variables.voucherId,
      );
    },
    onError: (error, variables) => {
      console.error(
        " Error al actualizar asignación de servicios:",
        variables.voucherId,
        error,
      );
    },
  });
};

/**
 * Hook para prefetch (pre-cargar) un voucher de reserva con relaciones
 * Útil para cargar datos antes de que el usuario los necesite
 *
 * @param {string} id - ID del voucher a prefetch
 */
export const usePrefetchVoucherReservaWithRelations = () => {
  const queryClient = useQueryClient();

  return (id) => {
    if (!id) return;

    queryClient.prefetchQuery({
      queryKey: queryKeys.vouchersReserva.withRelation(id),
      queryFn: () =>
        voucherReservaService.getVoucherReservaWithRelationsById(id),
      staleTime: 1000 * 60 * 3,
    });
  };
};

export default {
  useVouchersReserva,
  useVouchersReservaWithRelations,
  useVoucherReserva,
  useVoucherReservaWithRelations,
  useCreateVoucherReserva,
  useUpdateVoucherReserva,
  useUpdateServiceAssignments,
  usePrefetchVoucherReservaWithRelations,
};
