import axiosInstance from "../utils/axiosInstance";
import { handleApiError } from "../utils/apiUtils";
import SecureStorage from "../utils/secureStorage";
import { invalidateCotizacionGraphCache } from "../utils/cacheInvalidation";

const contabilidadService = {
  getSaldos: async () => {
    try {
      const response = await axiosInstance.get("/turismo/saldos");
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Crea un saldo contable para una combinación tipo/moneda/plataforma/año
   */
  createSaldo: async (saldoData) => {
    try {
      const payload = {
        ...saldoData,
        created_by: saldoData.created_by || "frontend",
        saldo_actual: saldoData.saldo_actual ?? saldoData.saldo_inicial,
      };
      const response = await axiosInstance.post("/turismo/saldos", payload);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Obtiene un saldo por ID
   */
  getSaldoById: async (id) => {
    try {
      const response = await axiosInstance.get(`/turismo/saldos/${id}`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Obtiene un saldo por tipo y moneda
   */
  getSaldoByTipoMoneda: async (tipo, moneda) => {
    try {
      const response = await axiosInstance.get(
        `/turismo/saldos/buscar?tipo=${tipo}&moneda=${moneda}`,
      );
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Actualiza el saldo inicial de un saldo (automáticamente actualiza el saldo actual)
   */
  updateSaldoInicial: async (id, saldoInicial) => {
    try {
      const response = await axiosInstance.put(`/turismo/saldos/${id}`, {
        saldo_inicial: saldoInicial,
      });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Actualiza directamente el saldo actual sin modificar el saldo inicial
   */
  updateSaldoActual: async (id, nuevoSaldo) => {
    try {
      const response = await axiosInstance.put(
        `/turismo/saldos/${id}/saldo-actual`,
        {
          nuevo_saldo: nuevoSaldo,
        },
      );
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Inicializa los saldos predeterminados si no existen
   */
  initializeSaldos: async (params = {}) => {
    try {
      const query = new URLSearchParams();
      if (params.platform) query.set("platform", params.platform);
      if (params.year_saldo) query.set("year_saldo", params.year_saldo);
      const queryString = query.toString();
      const response = await axiosInstance.post(
        `/turismo/saldos/inicializar-creado${queryString ? `?${queryString}` : ""}`,
      );
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Obtiene todos los movimientos (ingresos y egresos)
   */
  getMovimientos: async () => {
    try {
      const response = await axiosInstance.get("/turismo/movimientos");
      console.log(response.data);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Obtiene un movimiento por ID
   */
  getMovimientoById: async (id) => {
    try {
      const response = await axiosInstance.get(`/turismo/movimientos/${id}`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Obtiene movimientos por tipo (ingreso/egreso)
   */
  getMovimientosByTipo: async (tipo) => {
    try {
      const response = await axiosInstance.get(
        `/turismo/movimientos/tipo?tipo=${tipo}`,
      );
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Obtiene movimientos por mes
   */
  getMovimientosByMes: async (mes) => {
    try {
      const response = await axiosInstance.get(
        `/turismo/movimientos/mes/${mes}`,
      );
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Obtiene movimientos por rango de fechas
   */
  getMovimientosByFechaRange: async (fechaInicio, fechaFin) => {
    try {
      const response = await axiosInstance.get(
        `/turismo/movimientos/fecha-rango?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`,
      );
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Crea un nuevo movimiento (ingreso o egreso)
   */
  createMovimiento: async (movimientoData) => {
    try {
      // Asegurar que movimientoData tiene el campo created_by
      if (!movimientoData.created_by) {
        // Obtener usuario del SecureStorage como respaldo
        const user = SecureStorage.getItem("user") || {};
        movimientoData.created_by =
          user.dniuser || SecureStorage.getItem("dniuser") || "system";
      }

      const response = await axiosInstance.post(
        "/turismo/movimientos",
        movimientoData,
      );

      // Invalidar caché de vouchers (los movimientos afectan los totales)
      invalidateCotizacionGraphCache();

      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Actualiza un movimiento existente
   */
  updateMovimiento: async (id, movimientoData) => {
    try {
      // Asegurar que movimientoData tiene el campo updated_by
      if (!movimientoData.updated_by) {
        // Obtener usuario del SecureStorage como respaldo
        const user = SecureStorage.getItem("user") || {};
        movimientoData.updated_by =
          user.dniuser || SecureStorage.getItem("dniuser") || "system";
      }

      const response = await axiosInstance.put(
        `/turismo/movimientos/${id}`,
        movimientoData,
      );

      // Invalidar caché de vouchers (los movimientos afectan los totales)
      invalidateCotizacionGraphCache();

      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Elimina un movimiento
   */
  deleteMovimiento: async (id) => {
    try {
      const response = await axiosInstance.delete(`/turismo/movimientos/${id}`);

      // Invalidar caché de vouchers (los movimientos afectan los totales)
      invalidateCotizacionGraphCache();

      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  // ============== TRANSFERENCIAS INTERNAS ==============

  /**
   * Obtiene todas las transferencias internas
   */
  getTransferencias: async () => {
    try {
      const response = await axiosInstance.get("/turismo/transferencias");
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Obtiene transferencias con información de saldos
   */
  getTransferenciasWithSaldos: async () => {
    try {
      const response = await axiosInstance.get(
        "/turismo/transferencias/con-saldos",
      );
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Obtiene una transferencia por ID
   */
  getTransferenciaById: async (id) => {
    try {
      const response = await axiosInstance.get(`/turismo/transferencias/${id}`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Obtiene transferencias por saldo (origen o destino)
   */
  getTransferenciasBySaldo: async (saldoId) => {
    try {
      const response = await axiosInstance.get(
        `/turismo/transferencias/saldo/${saldoId}`,
      );
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Obtiene transferencias que involucran cambio de moneda
   */
  getTransferenciasCambioMoneda: async () => {
    try {
      const response = await axiosInstance.get(
        "/turismo/transferencias/cambios-moneda",
      );
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Crea una nueva transferencia interna
   */
  createTransferencia: async (transferenciaData) => {
    try {
      const response = await axiosInstance.post(
        "/turismo/transferencias",
        transferenciaData,
      );
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Actualiza la descripción de una transferencia
   */
  updateTransferencia: async (id, transferenciaData) => {
    try {
      const response = await axiosInstance.put(
        `/turismo/transferencias/${id}`,
        transferenciaData,
      );
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Elimina una transferencia (solo superadmin, revierte los saldos)
   */
  deleteTransferencia: async (id) => {
    try {
      const response = await axiosInstance.delete(
        `/turismo/transferencias/${id}`,
      );
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Sube un archivo de evidencia a una transferencia
   * @param {number} id - ID de la transferencia
   * @param {File} file - Archivo a subir
   */
  uploadTransferenciaMedia: async (id, file) => {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await axiosInstance.post(
        `/turismo/transferencias/${id}/media`,
        formData,
        {
          // No fijar Content-Type: el boundary multipart lo agrega el navegador.
        },
      );
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * Elimina el archivo de evidencia de una transferencia
   * @param {number} id - ID de la transferencia
   */
  deleteTransferenciaMedia: async (id) => {
    try {
      const response = await axiosInstance.delete(
        `/turismo/transferencias/${id}/media`,
      );
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
};

export default contabilidadService;
