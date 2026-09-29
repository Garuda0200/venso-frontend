import axiosInstance from "../utils/axiosInstance";

const API_BASE = "/turismo/movimientos";

/**
 * Servicio para gestionar movimientos contables
 */
export const movimientoService = {
  /**
   * Obtener movimientos por payment_request_id
   * @param {string} paymentRequestId - UUID del payment request
   * @returns {Promise}
   */
  getByPaymentRequestId: async (paymentRequestId) => {
    try {
      const response = await axiosInstance.get(
        `${API_BASE}/by-payment-request/${paymentRequestId}`,
      );
      return {
        success: true,
        data: response.data.data || [],
      };
    } catch (error) {
      console.error("Error fetching movimientos by payment_request_id:", error);
      return {
        success: false,
        error: error.response?.data?.message || "Error al obtener movimientos",
      };
    }
  },

  /**
   * Obtener un movimiento por ID
   * @param {number} id - ID del movimiento
   * @returns {Promise}
   */
  getById: async (id) => {
    try {
      const response = await axiosInstance.get(`${API_BASE}/${id}`);
      return {
        success: true,
        data: response.data.data,
      };
    } catch (error) {
      console.error("Error fetching movimiento by ID:", error);
      return {
        success: false,
        error: error.response?.data?.message || "Error al obtener movimiento",
      };
    }
  },

  /** Resolver el movimiento asociado a una solicitud de pago. */
  resolveByPaymentRequest: async (paymentRequest = {}) => {
    const movimientoId = Number(paymentRequest?.movimiento_id);
    if (Number.isFinite(movimientoId) && movimientoId > 0) {
      return movimientoService.getById(movimientoId);
    }
    const paymentRequestId =
      paymentRequest?.id ||
      paymentRequest?.payment_request_id ||
      paymentRequest?.notification_id;
    if (!paymentRequestId) {
      return {
        success: false,
        error: "No se encontró un movimiento asociado a este pago",
      };
    }
    const result =
      await movimientoService.getByPaymentRequestId(paymentRequestId);
    if (!result.success) return result;
    const movimientos = Array.isArray(result.data) ? result.data : [];
    const movimiento = [...movimientos]
      .filter((item) => item && item.is_active !== false)
      .sort(
        (left, right) => Number(right?.id || 0) - Number(left?.id || 0),
      )[0] || null;
    return movimiento
      ? { success: true, data: movimiento }
      : {
          success: false,
          error: "No se encontró un movimiento asociado a este pago",
        };
  },
};

export default movimientoService;
