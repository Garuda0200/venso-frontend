import axios from "../utils/axiosInstance";
import { handleApiError } from "../utils/apiUtils";

const PERMISSIONS_ENDPOINT = "/permissions";

export const permissionService = {
  async requestEditPermission(
    entityType,
    entityId,
    requiredApproverRole,
    reason = null,
    expiresInHours = null,
  ) {
    try {
      const payload = {
        entity_type: entityType,
        entity_id: entityId,
        required_approver_role: requiredApproverRole,
        reason,
        expires_in_hours: expiresInHours,
      };

      const response = await axios.post(
        `${PERMISSIONS_ENDPOINT}/request`,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error(
        `Error requesting permission for ${entityType} #${entityId}:`,
        error,
      );
      throw handleApiError(error);
    }
  },

  async checkEditPermission(entityType, entityId) {
    try {
      const response = await axios.get(
        `${PERMISSIONS_ENDPOINT}/check/${entityType}/${entityId}`,
      );
      return response.data;
    } catch (error) {
      console.error(
        `Error checking permission for ${entityType} #${entityId}:`,
        error,
      );
      throw handleApiError(error);
    }
  },

  async approvePermission(permissionId, approved, rejectionReason = null) {
    try {
      const payload = {
        approved,
        rejection_reason: rejectionReason,
      };

      const response = await axios.post(
        `${PERMISSIONS_ENDPOINT}/${permissionId}/approve`,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error(
        `Error ${approved ? "approving" : "rejecting"} permission #${permissionId}:`,
        error,
      );
      throw handleApiError(error);
    }
  },

  async requestVoucherVentaPermission(
    voucherVentaId,
    reason = "Solicitud de edición de voucher de venta",
  ) {
    return this.requestEditPermission(
      "voucherventa",
      voucherVentaId,
      3,
      reason,
      24,
    );
  },

  async requestCotizacionPermission(
    cotizacionId,
    reason = "Solicitud de edición de cotización",
  ) {
    return this.requestEditPermission(
      "cotizacion",
      cotizacionId,
      0,
      reason,
      24,
    );
  },

  async requestVoucherReservaPermission(
    voucherReservaId,
    reason = "Solicitud de edición de voucher de reserva",
  ) {
    return this.requestEditPermission(
      "voucherreserva",
      voucherReservaId,
      0,
      reason,
      24,
    );
  },

  async checkVoucherVentaPermission(voucherVentaId) {
    return this.checkEditPermission("voucherventa", voucherVentaId);
  },

  async checkCotizacionPermission(cotizacionId) {
    return this.checkEditPermission("cotizacion", cotizacionId);
  },

  async checkVoucherReservaPermission(voucherReservaId) {
    return this.checkEditPermission("voucherreserva", voucherReservaId);
  },
};

export default permissionService;
