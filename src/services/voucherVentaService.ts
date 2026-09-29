/**
 * Servicio de Vouchers de Venta
 * Maneja todas las operaciones CRUD y consultas relacionadas con vouchers de venta
 */
import axios from "../utils/axiosInstance";
import { handleApiError, isRequestCanceled } from "../utils/apiUtils";
import SecureStorage from "../utils/secureStorage";
import {
  invalidateCotizacionGraphCache,
  invalidateVoucherVentaById,
  patchVoucherVentaCache,
} from "../utils/cacheInvalidation";
import { getIdempotencyHeaders } from "../utils/idempotency";

// Define the complete voucher endpoint path
const VOUCHER_ENDPOINT = "/turismo/vouchers-venta";

export const voucherVentaService = {
  /**
   * Obtiene todos los vouchers de venta
   */
  async getVouchers(options = {}) {
    try {
      const response = await axios.get(`${VOUCHER_ENDPOINT}`, {
        params: options.skipCache ? { force_refresh: true } : undefined,
        _skipDedup: Boolean(options.skipCache || options._skipDedup),
        signal: options.signal,
      });
      return response.data;
    } catch (error) {
      if (isRequestCanceled(error)) throw error;
      console.error("Error fetching vouchers:", error);
      throw handleApiError(error);
    }
  },

  /**
   * Obtiene todos los vouchers de venta con datos de cotización
   */
  async getVouchersWithCotizacion(options = {}) {
    try {
      const response = await axios.get(`${VOUCHER_ENDPOINT}/with-cotizacion`, {
        params: options.skipCache ? { force_refresh: true } : undefined,
        _skipDedup: Boolean(options.skipCache || options._skipDedup),
        signal: options.signal,
      });
      return response.data;
    } catch (error) {
      // La cancelación por desmontaje/refetch de TanStack Query es esperada y
      // debe conservarse como cancelación, no convertirse en un error de UI.
      if (isRequestCanceled(error)) throw error;
      console.error("Error fetching vouchers with cotizacion:", error);
      throw handleApiError(error);
    }
  },

  /**
   * Obtiene un voucher de venta por ID
   */
  async getVoucherById(id, options = {}) {
    try {
      const response = await axios.get(`${VOUCHER_ENDPOINT}/${id}`, {
        params: options.skipCache
          ? { force_refresh: true, no_cache: true }
          : undefined,
        _skipDedup: Boolean(options.skipCache || options._skipDedup),
        signal: options.signal,
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching voucher with ID ${id}:`, error);
      throw handleApiError(error);
    }
  },

  /**
   * Obtiene un voucher de venta por ID con datos de cotización
   */
  async getVoucherWithCotizacionById(id, options = {}) {
    try {
      const response = await axios.get(
        `${VOUCHER_ENDPOINT}/${id}/with-cotizacion`,
        {
          params: options.skipCache
            ? { force_refresh: true, no_cache: true }
            : undefined,
          _skipDedup: Boolean(options.skipCache || options._skipDedup),
          signal: options.signal,
        },
      );
      return response.data;
    } catch (error) {
      console.error(`Error fetching voucher with cotizacion, ID ${id}:`, error);
      throw handleApiError(error);
    }
  },

  /**
   * Crea un nuevo voucher de venta
   */
  async createVoucher(voucherData, options = {}) {
    try {
      // Normalizar datos para el backend
      const payload = {
        id: null, // Nunca enviar ID para creación
        voucher_code: voucherData.voucher_code || voucherData.voucherCode,
        cotizacion_id: voucherData.cotizacion_id || voucherData.cotizacionId,
        status: voucherData.status || "active",
        is_initialized:
          voucherData.is_initialized !== undefined
            ? voucherData.is_initialized
            : true,
        // Transformar passenger_data en array de pasajeros
        passengers: this.transformPassengerData(
          voucherData.passenger_data || voucherData.passengerData || {},
        ),

        // Información de usuario
        created_by: String(
          voucherData.created_by || SecureStorage.getItem("dniuser") || "",
        ),
        ...(voucherData.created_at ? { created_at: voucherData.created_at } : {}),

        // Platform y Business Type
        platform: voucherData.platform || "venso",
        business_type: voucherData.business_type || "B2C",
      };

      // Validación crítica
      if (!payload.cotizacion_id) {
        throw new Error(
          "La ID de cotización es obligatoria para crear un voucher",
        );
      }

      const response = await axios.post(VOUCHER_ENDPOINT, payload, {
        headers: getIdempotencyHeaders(options.idempotencyKey),
      });

      invalidateCotizacionGraphCache();

      return response.data;
    } catch (error) {
      console.error("Error creating voucher:", error);
      throw handleApiError(error);
    }
  },

  /**
   * Transforma datos de pasajeros al formato esperado por el backend
   */
  transformPassengerData(passengerData, voucherId = null, voucherCode = null) {
    if (!passengerData) return [];

    const passengers = [];

    // Procesar adultos
    if (passengerData.adults && Array.isArray(passengerData.adults)) {
      passengerData.adults.forEach((adult, index) => {
        const passengerPayload = {
          id_persona: adult.id_persona || adult.idPersona || null,
          voucher_venta_id: voucherId,
          voucher_code: voucherCode,
          nombres: adult.nombres || adult.firstName || null,
          apellidos: adult.apellidos || adult.lastName || null,
          apellido_paterno:
            adult.apellido_paterno || adult.apellidoPaterno || null,
          apellido_materno:
            adult.apellido_materno || adult.apellidoMaterno || null,
          fecha_nacimiento: adult.fecha_nacimiento || adult.birthDate || null,
          edad: adult.edad || adult.age?.toString() || null,
          procedencia: adult.procedencia || null,
          pais: adult.pais || adult.nacionalidad || adult.nationality || null,
          nacionalidad: adult.nacionalidad || adult.nationality || null,
          sexo: adult.sexo || null,
          tipo_documento:
            adult.tipoDocumento ||
            adult.tipo_documento ||
            adult.docType ||
            null,
          numero_documento:
            adult.numeroDocumento ||
            adult.numero_documento ||
            adult.docNumber ||
            null,
          correo: adult.correo || adult.email || null,
          telefono: adult.telefono || adult.phone || null,
          observaciones: adult.observaciones || adult.notes || null,
          tipo_pasajero: "adult",
          passenger_key: `adult-${index}`,
          created_by: String(SecureStorage.getItem("dniuser") || ""),
        };

        if (adult.id_pasajero) {
          passengerPayload.id_pasajero = adult.id_pasajero;
        }

        passengers.push(passengerPayload);
      });
    }

    // Procesar niños
    if (passengerData.children && Array.isArray(passengerData.children)) {
      passengerData.children.forEach((child, index) => {
        const passengerPayload = {
          id_persona: child.id_persona || child.idPersona || null,
          voucher_venta_id: voucherId,
          voucher_code: voucherCode,
          nombres: child.nombres || child.firstName || null,
          apellidos: child.apellidos || child.lastName || null,
          apellido_paterno:
            child.apellido_paterno || child.apellidoPaterno || null,
          apellido_materno:
            child.apellido_materno || child.apellidoMaterno || null,
          fecha_nacimiento: child.fecha_nacimiento || child.birthDate || null,
          edad: child.edad || child.age?.toString() || null,
          procedencia: child.procedencia || null,
          pais: child.pais || child.nacionalidad || child.nationality || null,
          nacionalidad: child.nacionalidad || child.nationality || null,
          sexo: child.sexo || null,
          tipo_documento:
            child.tipoDocumento ||
            child.tipo_documento ||
            child.docType ||
            null,
          numero_documento:
            child.numeroDocumento ||
            child.numero_documento ||
            child.docNumber ||
            null,
          correo: child.correo || child.email || null,
          telefono: child.telefono || child.phone || null,
          observaciones: child.observaciones || child.notes || null,
          tipo_pasajero: "child",
          passenger_key: `child-${index}`,
          created_by: String(SecureStorage.getItem("dniuser") || ""),
        };

        if (child.id_pasajero) {
          passengerPayload.id_pasajero = child.id_pasajero;
        }

        passengers.push(passengerPayload);
      });
    }

    return passengers;
  },

  /**
   * Actualiza un voucher de venta existente
   */
  async updateVoucher(id, voucherData, options = {}) {
    try {
      const payload = {
        voucher_code: voucherData.voucher_code || voucherData.voucherCode,
        status: voucherData.status || "active",
        is_initialized:
          voucherData.is_initialized !== undefined
            ? voucherData.is_initialized
            : true,
        vuelos_externos: voucherData.vuelos_externos,
        ...(voucherData.created_at ? { created_at: voucherData.created_at } : {}),
        ...(voucherData.created_by ? { created_by: voucherData.created_by } : {}),

        updated_by: String(SecureStorage.getItem("dniuser") || ""),
      };

      const response = await axios.put(`${VOUCHER_ENDPOINT}/${id}`, payload, {
        headers: getIdempotencyHeaders(options.idempotencyKey),
      });

      invalidateCotizacionGraphCache();
      invalidateVoucherVentaById(id);

      return response.data;
    } catch (error) {
      console.error(`Error updating voucher ${id}:`, error);
      throw handleApiError(error);
    }
  },

  /**
   * Actualiza solo los datos editables del PDF del voucher
   */
  async updateDatosPdf(id, datosPdf) {
    try {
      const payload = {
        datos_pdf: datosPdf,
      };
      // datos_pdf tiene un endpoint operativo propio. No usar el PUT general:
      // ese endpoint modifica el voucher completo y restringe por created_by,
      // mientras este editor también debe funcionar para ventas con visibilidad
      // global explícita sobre cotizaciones y vouchers.
      const response = await axios.put(
        `${VOUCHER_ENDPOINT}/${id}/datos-pdf`,
        payload,
      );

      const updatedVoucher =
        response.data?.data?.voucher || response.data?.voucher || null;
      patchVoucherVentaCache(id, {
        datos_pdf: updatedVoucher?.datos_pdf ?? datosPdf,
        updated_by:
          updatedVoucher?.updated_by ??
          String(SecureStorage.getItem("dniuser") || ""),
        updated_at: updatedVoucher?.updated_at ?? new Date().toISOString(),
        ...(updatedVoucher?.status
          ? { status: updatedVoucher.status }
          : {}),
      });

      invalidateCotizacionGraphCache();
      invalidateVoucherVentaById(id);
      return response.data;
    } catch (error) {
      console.error(`Error updating datos_pdf for voucher ${id}:`, error);
      throw handleApiError(error);
    }
  },

  /**
   * Actualiza solo los vuelos externos del voucher
   */
  async updateVuelosExternos(id, vuelosExternos) {
    try {
      const payload = {
        vuelos_externos: vuelosExternos,
      };
      // Los vuelos del voucher tienen un permiso operativo propio. No usar el PUT
      // general del voucher, que está reservado al propietario/superadmin y además
      // procesa campos financieros que este editor no necesita tocar.
      const response = await axios.put(
        `${VOUCHER_ENDPOINT}/${id}/vuelos-externos`,
        payload,
      );

      const updatedVoucher =
        response.data?.data?.voucher || response.data?.voucher || null;
      patchVoucherVentaCache(id, {
        vuelos_externos: updatedVoucher?.vuelos_externos ?? vuelosExternos,
        updated_by:
          updatedVoucher?.updated_by ??
          String(SecureStorage.getItem("dniuser") || ""),
        updated_at: updatedVoucher?.updated_at ?? new Date().toISOString(),
        ...(updatedVoucher?.status
          ? { status: updatedVoucher.status }
          : {}),
      });

      invalidateCotizacionGraphCache();
      invalidateVoucherVentaById(id);
      return response.data;
    } catch (error) {
      console.error(`Error updating vuelos_externos for voucher ${id}:`, error);
      throw handleApiError(error);
    }
  },

  /**
   * Elimina un voucher de venta
   */
  async deleteVoucher(id) {
    try {
      const response = await axios.delete(`${VOUCHER_ENDPOINT}/${id}`);

      invalidateCotizacionGraphCache();

      return response.data;
    } catch (error) {
      console.error(`Error deleting voucher ${id}:`, error);
      throw handleApiError(error);
    }
  },

  /**
   * Obtiene las versiones archivadas de un voucher desde la tabla dedicada
   */
  async getArchivedVersions(voucherId) {
    try {
      console.log(
        ` [ARCHIVED VERSIONS] Obteniendo versiones archivadas de voucher ${voucherId}`,
      );
      const response = await axios.get(
        `${VOUCHER_ENDPOINT}/${voucherId}/archived-versions`,
      );
      return response.data?.data || [];
    } catch (error) {
      console.error(
        ` Error obteniendo versiones archivadas de voucher ${voucherId}:`,
        error,
      );
      return [];
    }
  },

  /**
   * Elimina una versión archivada específica (usando la tabla dedicada)
   * NO elimina el voucher completo, solo elimina la versión del historial
   * @param {number} voucherId - ID del voucher padre
   * @param {number} versionId - ID de la versión archivada a eliminar
   */
  async deleteArchivedVersion(voucherId, versionId) {
    try {
      console.log(
        ` [DELETE ARCHIVED VERSION] Eliminando versión ${versionId} de voucher ${voucherId}`,
      );

      // Usar el nuevo endpoint de la tabla de versiones archivadas
      const response = await axios.delete(
        `${VOUCHER_ENDPOINT}/archived-versions/${versionId}`,
      );

      // Invalidar caché
      invalidateVoucherVentaById(voucherId);

      console.log(
        ` [DELETE ARCHIVED VERSION] Versión ${versionId} eliminada exitosamente`,
      );
      return response.data;
    } catch (error) {
      console.error(` Error eliminando versión archivada ${versionId}:`, error);
      throw handleApiError(error);
    }
  },

  /**
   * Obtiene la cadena de predecesores de un voucher
   */
  async getPredecessorChain(id) {
    try {
      const response = await axios.get(
        `${VOUCHER_ENDPOINT}/${id}/predecessors`,
      );
      return response.data || [];
    } catch (error) {
      console.error(
        `Error fetching predecessor chain for voucher ${id}:`,
        error,
      );
      return [];
    }
  },

  /**
   * Obtiene un voucher por su código
   */
  async getVoucherByCode(voucherCode) {
    try {
      const response = await axios.get(
        `${VOUCHER_ENDPOINT}/by-code/${voucherCode}`,
      );
      return response.data?.data || null;
    } catch (error) {
      console.error(`Error fetching voucher by code ${voucherCode}:`, error);
      return null;
    }
  },
};

// Alias para compatibilidad con código antiguo (deprecado, usar voucherVentaService)
export const voucherService = voucherVentaService;

export default voucherVentaService;
