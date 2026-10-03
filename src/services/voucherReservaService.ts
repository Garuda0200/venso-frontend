import api from "../utils/axiosInstance";
import {
  invalidateReservaAssignmentGraphCache,
  invalidateVoucherReservaById,
} from "../utils/cacheInvalidation";
import { invalidateGetCache } from "../utils/axiosInstance";
import { getIdempotencyHeaders } from "../utils/idempotency";

const invalidateAssignmentCaches = () => {
  invalidateReservaAssignmentGraphCache();
};

const sanitizeVoucherReservaPayload = (voucherReservaData) => {
  const cleanData = { ...voucherReservaData };
  delete cleanData.assigned_itinerary;
  delete cleanData.fechainicio;
  delete cleanData.fechafin;
  delete cleanData.has_voucher_reserva;
  return JSON.parse(JSON.stringify(cleanData));
};

export const voucherReservaService = {
  // Get all reservation vouchers
  getAllVoucherReservas: async (options = {}) => {
    try {
      const response = await api.get("/turismo/vouchers-reserva", {
        params: options.skipCache ? { force_refresh: true } : undefined,
        _skipDedup: Boolean(options.skipCache || options._skipDedup),
        signal: options.signal,
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching reservation vouchers:", error);
      throw error;
    }
  },

  // Get all reservation vouchers with relations
  getVoucherReservasWithRelations: async (options = {}) => {
    try {
      const response = await api.get(
        "/turismo/vouchers-reserva/with-relations",
        {
          params: options.skipCache ? { force_refresh: true } : undefined,
          _skipDedup: Boolean(options.skipCache || options._skipDedup),
          signal: options.signal,
        },
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching reservation vouchers:", error);
      throw error;
    }
  },

  // Create a new reservation voucher
  createVoucherReserva: async (voucherReservaData, options = {}) => {
    try {
      // Validate required fields
      if (
        !voucherReservaData.id ||
        !voucherReservaData.voucher_id ||
        !voucherReservaData.cotizacion_id
      ) {
        throw new Error(
          "Faltan campos obligatorios para crear el voucher de reserva",
        );
      }

      // Ensure voucher_id is a number
      if (typeof voucherReservaData.voucher_id === "string") {
        voucherReservaData.voucher_id = parseInt(
          voucherReservaData.voucher_id,
          10,
        );
        if (isNaN(voucherReservaData.voucher_id)) {
          throw new Error("voucher_id debe ser un número");
        }
      }

      // assigned_itinerary y los atributos derivados de cotización no se persisten aquí.
      const dataToSend = sanitizeVoucherReservaPayload(voucherReservaData);

      const response = await api.post(
        "/turismo/vouchers-reserva",
        dataToSend,
        {
          headers: getIdempotencyHeaders(options.idempotencyKey),
        },
      );

      // Invalidar caché de React Query después de crear
      invalidateAssignmentCaches();

      return response.data;
    } catch (error) {
      console.error("Error creando voucher de reserva:", error);
      throw error;
    }
  },

  // Update an existing reservation voucher
  updateVoucherReserva: async (id, voucherReservaData) => {
    try {
      // Validate ID
      if (!id) {
        throw new Error(
          "Se requiere un ID para actualizar el voucher de reserva",
        );
      }

      // El voucher de reserva solo persiste sus atributos propios.
      const dataToSend = sanitizeVoucherReservaPayload(voucherReservaData);

      const response = await api.put(
        `/turismo/vouchers-reserva/${id}`,
        dataToSend,
      );

      // Invalidar caché de React Query después de actualizar
      invalidateAssignmentCaches();

      return response.data;
    } catch (error) {
      console.error(`Error actualizando voucher de reserva ${id}:`, error);
      throw error;
    }
  },

  upsertVoucherReservaMedia: async (id, media) => {
    if (!id) throw new Error("ID de voucher reserva requerido");
    const payload = media?.mediaAssetId
      ? { mediaAssetId: media.mediaAssetId }
      : {
          tigrisUrl: media?.tigrisUrl || media?.url,
          originalName: media?.originalName,
          contentType: media?.contentType,
          sizeBytes: media?.sizeBytes,
          title: media?.title,
        };
    const response = await api.put(
      `/turismo/vouchers-reserva/${id}/voucher-media`,
      payload,
    );
    invalidateAssignmentCaches();
    invalidateVoucherReservaById(id);
    return response.data;
  },

  // Delete a reservation voucher
  deleteVoucherReserva: async (id) => {
    try {
      const response = await api.delete(`/turismo/vouchers-reserva/${id}`);

      invalidateAssignmentCaches();
      invalidateGetCache(`/turismo/vouchers-reserva/${id}`);
      invalidateAssignmentCaches();
      invalidateVoucherReservaById(id);

      return response.data;
    } catch (error) {
      console.error(`Error deleting reservation voucher ${id}:`, error);
      throw error;
    }
  },

  /**
   * Obtiene las versiones archivadas de un voucher desde la tabla dedicada
   */
  getArchivedVersions: async (voucherId) => {
    try {
      const response = await api.get(
        `/turismo/vouchers-reserva/${voucherId}/archived-versions`,
      );
      return response.data?.data || [];
    } catch (error) {
      console.error(
        ` Error obteniendo versiones archivadas de voucher reserva ${voucherId}:`,
        error,
      );
      return [];
    }
  },

  /**
   * Elimina una versión archivada específica (usando la tabla dedicada)
   * NO elimina el voucher completo, solo elimina la versión del historial
   * @param {string} voucherId - ID del voucher padre
   * @param {number} versionId - ID de la versión archivada a eliminar
   */
  deleteArchivedVersion: async (voucherId, versionId) => {
    try {
      // Usar el nuevo endpoint de la tabla de versiones archivadas
      const response = await api.delete(
        `/turismo/vouchers-reserva/archived-versions/${versionId}`,
      );

      // Invalidar caché
      invalidateAssignmentCaches();
      invalidateVoucherReservaById(voucherId);

      return response.data;
    } catch (error) {
      console.error(` Error eliminando versión archivada ${versionId}:`, error);
      throw error;
    }
  },

  // Get a specific reservation voucher by ID with full details
  getVoucherReservaById: async (id) => {
    try {
      // Ensure ID is provided
      if (!id) {
        throw new Error("ID de voucher de reserva no proporcionado");
      }

      const response = await api.get(`/turismo/vouchers-reserva/${id}`);

      // Adaptamos el manejo de la respuesta para funcionar con diferentes formatos
      // Podría ser { data: {...} } o directamente los datos
      const responseData = response.data;

      // Verificar si la respuesta contiene los datos directamente o está envuelta
      const actualData =
        responseData && responseData.data ? responseData.data : responseData;

      // Verificar que la respuesta tenga los datos necesarios
      if (!actualData || !actualData.id) {
        console.error("Invalid response format:", responseData);
        throw new Error("Formato de respuesta inválido del servidor");
      }

      return { success: true, data: actualData };
    } catch (error) {
      console.error(`Error fetching reservation voucher with ID ${id}:`, error);
      throw error;
    }
  },

  // Get a specific reservation voucher by ID WITH RELATIONS (voucher venta + cotización)
  getVoucherReservaWithRelationsById: async (id, options = {}) => {
    try {
      // Ensure ID is provided
      if (!id) {
        throw new Error("ID de voucher de reserva no proporcionado");
      }

      const response = await api.get(
        `/turismo/vouchers-reserva/with-relations/${id}`,
        { _skipDedup: Boolean(options.skipCache || options._skipDedup) },
      );

      // La respuesta debe incluir: voucher_data, cotizacion_data, assigned_itinerary
      const responseData = response.data;

      // Verificar si la respuesta contiene los datos directamente o está envuelta
      const actualData =
        responseData && responseData.data ? responseData.data : responseData;

      // Verificar que la respuesta tenga los datos necesarios
      if (!actualData || !actualData.id) {
        console.error("Invalid response format:", responseData);
        throw new Error("Formato de respuesta inválido del servidor");
      }

      return { success: true, data: actualData };
    } catch (error) {
      console.error(
        `Error fetching reservation voucher with relations for ID ${id}:`,
        error,
      );
      throw error;
    }
  },

  // Request payment for a service
  requestPayment: async (paymentData) => {
    try {
      const response = await api.post(
        "/turismo/vouchers-reserva/request-payment",
        paymentData,
      );

      // Invalidar caché después de solicitar pago (puede cambiar el estado del voucher)
      invalidateAssignmentCaches();
      if (paymentData.voucher_reserva_id) {
        invalidateVoucherReservaById(paymentData.voucher_reserva_id);
      }

      return response.data;
    } catch (error) {
      console.error("Error requesting payment:", error);
      throw error;
    }
  },

  // Request payments for multiple services in one atomic batch
  requestPaymentsBatch: async (batchData) => {
    try {
      const response = await api.post(
        "/turismo/vouchers-reserva/request-payment/batch",
        batchData,
      );

      invalidateAssignmentCaches();
      if (batchData.voucher_reserva_id) {
        invalidateVoucherReservaById(batchData.voucher_reserva_id);
      }

      return response.data;
    } catch (error) {
      console.error("Error requesting batch payments:", error);
      throw error;
    }
  },

  // Get payment request for a specific service (by itinerario_servicio_id)
  getPaymentRequest: async (voucherReservaId, itinerarioServicioId) => {
    try {
      const response = await api.get(
        "/turismo/vouchers-reserva/payment-request",
        {
          _skipDedup: true,
          params: {
            voucher_reserva_id: voucherReservaId,
            itinerario_servicio_id: itinerarioServicioId,
          },
        },
      );
      return response.data;
    } catch (error) {
      console.error("Error getting payment request:", error);
      return { success: false, data: null };
    }
  },

  // Get payment request by ID
  getPaymentRequestById: async (paymentRequestId) => {
    try {
      const response = await api.get(
        `/turismo/vouchers-reserva/payment-requests/${paymentRequestId}`,
      );
      return response.data;
    } catch (error) {
      console.error("Error getting payment request by ID:", error);
      return { success: false, data: null };
    }
  },

  // Get vouchers de reserva por cotización_id
  getVoucherReservaByCotizacionId: async (cotizacionId) => {
    try {
      if (!cotizacionId) {
        throw new Error("ID de cotización no proporcionado");
      }

      // Usar endpoint dedicado en lugar de cargar TODOS los vouchers
      const response = await api.get(
        `/turismo/vouchers-reserva/by-cotizacion/${cotizacionId}`,
      );
      const matchingVouchers = response.data?.data || response.data || [];

      return {
        success: true,
        data: Array.isArray(matchingVouchers)
          ? matchingVouchers
          : [matchingVouchers],
      };
    } catch (error) {
      console.error("Error getting voucher reserva by cotizacion:", error);
      throw error;
    }
  },

  // Get payment requests by voucher_reserva_id
  getPaymentRequestsByVoucherReservaId: async (voucherReservaId, options = {}) => {
    try {
      if (!voucherReservaId) {
        throw new Error("ID de voucher reserva no proporcionado");
      }

      // Ruta correcta del backend: /turismo/payment-requests/voucher-reserva/{id}
      const response = await api.get(
        `/turismo/payment-requests/voucher-reserva/${voucherReservaId}`,
        { _skipDedup: Boolean(options.skipCache || options._skipDedup) },
      );

      // La respuesta puede ser un array directo o estar envuelta en data
      if (options.skipCache && !Array.isArray(response.data) && !Array.isArray(response.data?.data)) {
        throw new Error("Respuesta de estado de pagos inválida");
      }
      const paymentRequests = Array.isArray(response.data)
        ? response.data
        : response.data?.data && Array.isArray(response.data.data)
          ? response.data.data
          : [];

      return paymentRequests;
    } catch (error) {
      console.error(
        `Error getting payment requests for voucher_reserva ${voucherReservaId}:`,
        error,
      );
      // Si el endpoint no existe o retorna 404, retornar array vacío
      if (error.response?.status === 404 && !options.skipCache) {
        return [];
      }
      throw error;
    }
  },

  // Create a new payment request
  createPaymentRequest: async (paymentRequestData) => {
    try {
      if (!paymentRequestData) {
        throw new Error("Datos de payment request no proporcionados");
      }

      const response = await api.post(
        "/turismo/payment-requests",
        paymentRequestData,
      );

      invalidateAssignmentCaches();
      if (paymentRequestData.voucher_reserva_id) {
        invalidateVoucherReservaById(paymentRequestData.voucher_reserva_id);
      }

      return response.data.data || response.data;
    } catch (error) {
      console.error(" Error creating payment request:", error);
      throw error;
    }
  },

  // Cancel a pending payment request (only works if status is 'pending')
  cancelPendingPaymentRequest: async (paymentRequestId, reason = null) => {
    try {
      if (!paymentRequestId) {
        throw new Error("ID de payment request no proporcionado");
      }

      const response = await api.post(
        `/turismo/payment-requests/${paymentRequestId}/cancel-pending`,
        {
          reason: reason,
        },
      );

      invalidateAssignmentCaches();

      return response.data.data || response.data;
    } catch (error) {
      console.error(" Error cancelling payment request:", error);
      throw error;
    }
  },

  // -----------------------------------------------------------------------------
  // Nuevos métodos para itinerario normalizado
  // -----------------------------------------------------------------------------

  /**
   * Obtiene el itinerario enriquecido de la cotización vinculada a un voucher_venta.
   * Retorna la estructura normalizada con campos de asignación (isAssigned, assignedParentService, etc.)
   */
  getItinerarioByVoucherVenta: async (voucherVentaId, options = {}) => {
    try {
      if (!voucherVentaId) throw new Error("ID de voucher venta requerido");
      const response = await api.get(
        `/turismo/vouchers-reserva/itinerario/by-voucher-venta/${voucherVentaId}`,
        { _skipDedup: Boolean(options.skipCache || options._skipDedup) },
      );
      return response.data?.data || response.data || [];
    } catch (error) {
      console.error(
        `Error obteniendo itinerario para voucher_venta ${voucherVentaId}:`,
        error,
      );
      throw error;
    }
  },

  /**
   * Actualiza la asignación de un servicio individual del itinerario normalizado.
   * @param {number} servicioId - ID del registro itinerario_servicio
   * @param {Object} assignmentData - { assigned_parent_id, assigned_child_id, assigned_tariff, hora, is_assigned }
   */
  assignService: async (servicioId, assignmentData) => {
    try {
      if (!servicioId) throw new Error("ID de servicio requerido");
      const response = await api.put(
        `/turismo/vouchers-reserva/servicio/${servicioId}/asignar`,
        assignmentData,
      );
      invalidateAssignmentCaches();
      return response.data;
    } catch (error) {
      console.error(`Error asignando servicio ${servicioId}:`, error);
      throw error;
    }
  },

  /**
   * Actualiza precio/hora/beneficiarios de un servicio ya validado sin permitir
   * cambiar la identidad cotizada. Los IDs parent/child se omiten a propósito:
   * el backend siempre conserva los originales de la cotización.
   */
  updateValidatedService: async (servicioId, assignmentData = {}) => {
    try {
      if (!servicioId) throw new Error("ID de servicio requerido");
      const response = await api.put(
        `/turismo/vouchers-reserva/servicio/${servicioId}/asignar`,
        {
          ...assignmentData,
          assigned_parent_id: null,
          assigned_child_id: null,
          is_assigned: true,
        },
      );
      invalidateAssignmentCaches();
      return response.data;
    } catch (error) {
      console.error(`Error actualizando servicio validado ${servicioId}:`, error);
      throw error;
    }
  },

  /**
   * Valida el mismo servicio cotizado para Reservas. El backend conserva los
   * parent/child originales y resuelve automáticamente la tarifa interna del
   * año de viaje; si no existe, usa la misma tarifa cotizada.
   */
  validateQuotedService: async (servicioId, payload = {}) => {
    try {
      if (!servicioId) throw new Error("ID de servicio requerido");
      const response = await api.put(
        `/turismo/vouchers-reserva/servicio/${servicioId}/validar`,
        payload,
      );
      invalidateAssignmentCaches();
      return response.data;
    } catch (error) {
      console.error(`Error validando servicio ${servicioId}:`, error);
      throw error;
    }
  },

  /**
   * Desasigna un servicio (marca is_assigned=false y limpia campos de asignación).
   */
  unassignService: async (servicioId) => {
    try {
      if (!servicioId) throw new Error("ID de servicio requerido");
      const response = await api.put(
        `/turismo/vouchers-reserva/servicio/${servicioId}/asignar`,
        {
          assigned_parent_id: null,
          assigned_child_id: null,
          assigned_moneda: null,
          assigned_precio_servicio: null,
          assigned_igv: null,
          assigned_precio_adulto_dividido: null,
          assigned_capacidad_limite: null,
          assigned_beneficiarios_adultos: null,
          assigned_beneficiarios_ninos: null,
          assigned_precio_total: null,
          hora: null,
          is_assigned: false,
        },
      );
      invalidateAssignmentCaches();
      return response.data;
    } catch (error) {
      console.error(`Error desasignando servicio ${servicioId}:`, error);
      throw error;
    }
  },
};

export default voucherReservaService;
