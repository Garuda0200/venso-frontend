import axiosInstance from "../utils/axiosInstance";

/**
 * Service for managing passengers (pasajeros) in vouchers
 */
export const pasajeroService = {
  /**
   * Get all passengers for a specific voucher de venta
   * @param {number} voucherVentaId - The ID of the voucher de venta
   * @returns {Promise<Array>} List of passengers
   */
  async getPassengersByVoucherVenta(voucherVentaId) {
    try {
      const response = await axiosInstance.get(
        `/turismo/pasajeros/by-voucher/${voucherVentaId}`,
      );
      return response.data.data || [];
    } catch (error) {
      console.error("Error fetching passengers for voucher:", error);
      throw error;
    }
  },

  /**
   * Get all passengers for a specific voucher de reserva
   * This endpoint first fetches the voucher_reserva to get the associated voucher_venta_id
   * and then returns all passengers linked to that voucher_venta
   * @param {string} voucherReservaId - The ID of the voucher de reserva
   * @returns {Promise<Object>} Object with passengers array and voucher_venta_id
   */
  async getPassengersByVoucherReserva(voucherReservaId) {
    try {
      const response = await axiosInstance.get(
        `/turismo/pasajeros/by-voucher-reserva/${voucherReservaId}`,
      );
      return {
        passengers: response.data.data || [],
        count: response.data.count || 0,
        voucherVentaId: response.data.voucher_venta_id,
      };
    } catch (error) {
      console.error("Error fetching passengers for voucher reserva:", error);
      throw error;
    }
  },

  /**
   * Get all passengers for a specific cotización
   * @param {string} cotizacionId - The ID of the cotización
   * @returns {Promise<Array>} List of passengers
   */
  async getPassengersByCotizacion(cotizacionId) {
    try {
      const response = await axiosInstance.get(
        `/turismo/pasajeros/by-cotizacion/${cotizacionId}`,
      );
      return response.data.data || [];
    } catch (error) {
      console.error("Error fetching passengers for cotizacion:", error);
      throw error;
    }
  },

  /**
   * Atomically replaces the passenger composition of a cotización.
   * The backend owns canonical passenger keys and updates cantidadpersonas
   * in the same transaction, preventing partial adult/child saves.
   */
  async syncPassengersByCotizacion(cotizacionId, peopleDetails) {
    try {
      const response = await axiosInstance.put(
        `/turismo/pasajeros/by-cotizacion/${cotizacionId}/sync`,
        {
          adults: Array.isArray(peopleDetails?.adults)
            ? peopleDetails.adults
            : [],
          children: Array.isArray(peopleDetails?.children)
            ? peopleDetails.children
            : [],
        },
      );
      return response.data.data || [];
    } catch (error) {
      console.error("Error syncing passengers for cotizacion:", error);
      throw error;
    }
  },

  /**
   * Create a new passenger
   * @param {Object} passengerData - The passenger data
   * @returns {Promise<Object>} Created passenger
   */
  async createPassenger(passengerData) {
    try {
      const response = await axiosInstance.post(
        "/turismo/pasajeros",
        passengerData,
      );
      return response.data;
    } catch (error) {
      console.error("Error creating passenger:", error);
      throw error;
    }
  },

  /**
   * Update an existing passenger
   * @param {number} passengerId - The ID of the passenger
   * @param {Object} passengerData - The passenger data
   * @returns {Promise<Object>} Updated passenger
   */
  async updatePassenger(passengerId, passengerData) {
    try {
      const response = await axiosInstance.put(
        `/turismo/pasajeros/${passengerId}`,
        passengerData,
      );
      return response.data;
    } catch (error) {
      console.error("Error updating passenger:", error);
      throw error;
    }
  },

  /**
   * Delete a passenger
   * @param {number} passengerId - The ID of the passenger
   * @returns {Promise<Object>} Deletion result
   */
  async deletePassenger(passengerId) {
    try {
      const response = await axiosInstance.delete(
        `/turismo/pasajeros/${passengerId}`,
      );
      return response.data;
    } catch (error) {
      console.error("Error deleting passenger:", error);
      throw error;
    }
  },
};

export default pasajeroService;
