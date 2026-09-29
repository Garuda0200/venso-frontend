import axiosInstance from "../utils/axiosInstance";
import { invalidateReservaAssignmentGraphCache } from "../utils/cacheInvalidation";

const API_BASE = "/turismo/payment-requests";

export const paymentRequestService = {
  /**
   * Crear una nueva solicitud de pago
   */
  create: async (data) => {
    try {
      const response = await axiosInstance.post(API_BASE, data);
      invalidateReservaAssignmentGraphCache();
      return { success: true, data: response.data };
    } catch (error) {
      console.error("Error creating payment request:", error);
      return {
        success: false,
        message:
          error.response?.data?.message ||
          "Error al crear la solicitud de pago",
      };
    }
  },

  /**
   * Obtener solicitudes de pago por voucher_reserva_id
   */
  getByVoucherReserva: async (voucherReservaId) => {
    try {
      const response = await axiosInstance.get(
        `${API_BASE}/voucher-reserva/${voucherReservaId}`,
      );
      return { success: true, data: response.data };
    } catch (error) {
      console.error("Error fetching payment requests:", error);
      return {
        success: false,
        data: [],
        message:
          error.response?.data?.message ||
          "Error al obtener las solicitudes de pago",
      };
    }
  },

  /**
   * Obtener una solicitud de pago por ID
   */
  getById: async (id) => {
    try {
      const response = await axiosInstance.get(`${API_BASE}/${id}`);
      return { success: true, data: response.data };
    } catch (error) {
      console.error("Error fetching payment request:", error);
      return {
        success: false,
        message:
          error.response?.data?.message ||
          "Error al obtener la solicitud de pago",
      };
    }
  },

  getPendingEnrichedById: async (id) => {
    try {
      const response = await axiosInstance.get(
        "/turismo/vouchers-reserva/payment-requests/pending",
        { _skipDedup: true },
      );

      const requests = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
          ? response.data.data
          : [];

      const match = requests.find(
        (request) => String(request.id) === String(id),
      );

      return { success: true, data: match || null };
    } catch (error) {
      console.error("Error fetching enriched pending payment request:", error);
      return {
        success: false,
        message:
          error.response?.data?.message ||
          "Error al obtener la solicitud de pago enriquecida",
      };
    }
  },

  /**
   * Actualizar una solicitud de pago
   */
  update: async (id, data) => {
    try {
      const response = await axiosInstance.put(`${API_BASE}/${id}`, data);
      invalidateReservaAssignmentGraphCache();
      return { success: true, data: response.data };
    } catch (error) {
      console.error("Error updating payment request:", error);
      return {
        success: false,
        message:
          error.response?.data?.message ||
          "Error al actualizar la solicitud de pago",
      };
    }
  },

  /**
   * Eliminar una solicitud de pago
   */
  delete: async (id) => {
    try {
      const response = await axiosInstance.delete(`${API_BASE}/${id}`);
      invalidateReservaAssignmentGraphCache();
      return { success: true, message: response.data.message };
    } catch (error) {
      console.error("Error deleting payment request:", error);
      return {
        success: false,
        message:
          error.response?.data?.message ||
          "Error al eliminar la solicitud de pago",
      };
    }
  },

  /**
   * Aprobar una solicitud de pago
   */
  approve: async (id) => {
    try {
      const response = await axiosInstance.post(`${API_BASE}/${id}/approve`);
      invalidateReservaAssignmentGraphCache();
      return { success: true, data: response.data };
    } catch (error) {
      console.error("Error approving payment request:", error);
      return {
        success: false,
        message:
          error.response?.data?.message ||
          "Error al aprobar la solicitud de pago",
      };
    }
  },

  /**
   * Rechazar una solicitud de pago
   */
  reject: async (id, reason) => {
    try {
      const response = await axiosInstance.post(`${API_BASE}/${id}/reject`, {
        reason,
      });
      invalidateReservaAssignmentGraphCache();
      return { success: true, data: response.data };
    } catch (error) {
      console.error("Error rejecting payment request:", error);
      return {
        success: false,
        message:
          error.response?.data?.message ||
          "Error al rechazar la solicitud de pago",
      };
    }
  },

  /**
   * Marcar una solicitud de pago como pagada
   * @param {string} id - ID del payment_request (UUID)
   * @param {number} movimientoId - ID del movimiento de pago
   * @note pagado_por se obtiene desde la sesión en el backend
   */
  markAsPaid: async (id, movimientoId) => {
    try {
      const response = await axiosInstance.post(`${API_BASE}/${id}/mark-paid`, {
        movimiento_id: movimientoId,
      });
      invalidateReservaAssignmentGraphCache();
      return { success: true, data: response.data };
    } catch (error) {
      console.error("Error marking payment request as paid:", error);
      return {
        success: false,
        message:
          error.response?.data?.message ||
          "Error al marcar la solicitud de pago como pagada",
      };
    }
  },
};

export default paymentRequestService;
