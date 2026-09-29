import axiosInstance from "../utils/axiosInstance";
import { makeProxyUrlAbsolute } from "./presignedUrlService";

const API_BASE = "/turismo/vouchers-pagos"; // axiosInstance ya incluye /api en baseURL

/**
 * Helper para convertir proxy URLs del backend a absolutas
 */
const processProxyUrls = (data) => {
  if (!data) return data;
  if (Array.isArray(data)) {
    return data.map((item) => ({
      ...item,
      proxy_url: item.proxy_url ? makeProxyUrlAbsolute(item.proxy_url) : null,
    }));
  }
  return {
    ...data,
    proxy_url: data.proxy_url ? makeProxyUrlAbsolute(data.proxy_url) : null,
  };
};

/**
 * Servicio para gestionar evidencias de pago unificadas
 * Tabla: vouchers_pagos
 */
export const vouchersPagosService = {
  /**
   * Crear múltiples evidencias de pago en batch
   * @param {Array<Object>} evidencias - Array de objetos CreateVoucherPagoDto
   * @returns {Promise}
   */
  createBatch: async (evidencias) => {
    try {
      const response = await axiosInstance.post(
        `${API_BASE}/batch`,
        evidencias,
      );
      return {
        success: true,
        data: processProxyUrls(response.data),
      };
    } catch (error) {
      console.error("Error creating evidencias de pago:", error);
      return {
        success: false,
        error:
          error.response?.data?.message || "Error al crear evidencias de pago",
      };
    }
  },

  /**
   * Obtener evidencias de pago por ID de movimiento
   * @param {number} movimientoId - ID del movimiento contable
   * @returns {Promise}
   */
  getByMovimientoId: async (movimientoId) => {
    try {
      const response = await axiosInstance.get(
        `${API_BASE}/movimiento/${movimientoId}`,
      );
      return {
        success: true,
        data: processProxyUrls(response.data.data || []),
      };
    } catch (error) {
      console.error("Error fetching evidencias by movimiento:", error);
      return {
        success: false,
        error:
          error.response?.data?.message ||
          "Error al obtener evidencias del movimiento",
      };
    }
  },

  /**
   * Obtener evidencias de pago por código de voucher
   * @param {string} voucherCode - Código del voucher (archivo)
   * @returns {Promise}
   */
  getByVoucherCode: async (voucherCode) => {
    try {
      const response = await axiosInstance.get(
        `${API_BASE}/voucher-code/${voucherCode}`,
      );
      return {
        success: true,
        data: processProxyUrls(response.data.data || []),
      };
    } catch (error) {
      console.error("Error fetching evidencias by voucher code:", error);
      return {
        success: false,
        error:
          error.response?.data?.message ||
          "Error al obtener evidencias del voucher",
      };
    }
  },

  /**
   * Obtener una evidencia de pago específica por ID
   * @param {number} id - ID de la evidencia
   * @returns {Promise}
   */
  getById: async (id) => {
    try {
      const response = await axiosInstance.get(`${API_BASE}/${id}`);
      return {
        success: true,
        data: processProxyUrls(response.data.data),
      };
    } catch (error) {
      console.error("Error fetching evidencia:", error);
      return {
        success: false,
        error: error.response?.data?.message || "Error al obtener evidencia",
      };
    }
  },

  /**
   * Eliminar (soft delete) una evidencia de pago
   * @param {number} id - ID de la evidencia
   * @returns {Promise}
   */
  deleteEvidencia: async (id) => {
    try {
      const response = await axiosInstance.delete(`${API_BASE}/${id}`);
      return {
        success: true,
        message: response.data.message,
      };
    } catch (error) {
      console.error("Error deleting evidencia:", error);
      return {
        success: false,
        error: error.response?.data?.message || "Error al eliminar evidencia",
      };
    }
  },
};

export default vouchersPagosService;
