import axiosInstance from "../utils/axiosInstance";
import { makeProxyUrlAbsolute } from "./presignedUrlService";

const API_BASE = "/turismo/vouchers-venta"; // axiosInstance ya incluye /api en baseURL

/**
 * Servicio para gestionar documentos de vouchers de venta
 * usando la tabla relacional voucher_venta_documentos
 */
export const voucherDocumentService = {
  /**
   * Obtener todos los documentos de un voucher (agrupados por tipo)
   * @param {number} voucherId - ID del voucher
   * @returns {Promise} - { idCards: [], passports: [], otherDocuments: [] }
   */
  getDocumentsByVoucherId: async (voucherId) => {
    try {
      const response = await axiosInstance.get(
        `${API_BASE}/${voucherId}/documentos`,
      );
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error("Error fetching voucher documents:", error);
      return {
        success: false,
        error:
          error.response?.data?.message ||
          "Error al obtener documentos del voucher",
      };
    }
  },

  /**
   * Obtener un documento específico por ID
   * @param {number} docId - ID del documento
   * @returns {Promise}
   */
  getDocumentById: async (docId) => {
    try {
      const response = await axiosInstance.get(
        `${API_BASE}/documentos/${docId}`,
      );
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error("Error fetching document:", error);
      return {
        success: false,
        error: error.response?.data?.message || "Error al obtener documento",
      };
    }
  },

  /**
   * Subir un nuevo documento para un voucher
   * @param {number} voucherId - ID del voucher
   * @param {Object} documentData - Datos del documento
   * @returns {Promise}
   */
  uploadDocument: async (voucherId, documentData) => {
    try {
      const response = await axiosInstance.post(
        `${API_BASE}/${voucherId}/documentos`,
        documentData,
      );
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error("Error uploading document:", error);
      return {
        success: false,
        error: error.response?.data?.message || "Error al subir documento",
      };
    }
  },

  /**
   * Eliminar un documento
   * @param {number} docId - ID del documento
   * @returns {Promise}
   */
  deleteDocument: async (docId) => {
    try {
      const response = await axiosInstance.delete(
        `${API_BASE}/documentos/${docId}`,
      );
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error("Error deleting document:", error);
      return {
        success: false,
        error: error.response?.data?.message || "Error al eliminar documento",
      };
    }
  },

  /**
   * Obtener URL del proxy para un documento
   * @param {number} docId - ID del documento
   * @returns {string} - URL del proxy
   */
  getProxyUrl: (docId) => {
    // Usar URL base del backend (sin /api prefix porque ya está en axiosInstance)
    const baseURL = axiosInstance.defaults.baseURL || "";
    return `${baseURL}${API_BASE}/documentos/${docId}/proxy`;
  },

  /**
   * Convertir documentos del formato backend al formato frontend
   * @param {Object} backendData - { idCards: [], passports: [], otherDocuments: [] }
   * @returns {Object} - Formato compatible con PassengerDocuments
   */
  convertBackendToFrontend: (backendData) => {
    const converted = {
      idCards: [],
      passports: [],
      otherDocuments: [],
    };

    // Procesar cada categoría
    ["idCards", "passports", "otherDocuments"].forEach((category) => {
      if (Array.isArray(backendData[category])) {
        converted[category] = backendData[category].map((doc) => {
          // Convertir proxy URL relativa a absoluta
          const absoluteProxyUrl = makeProxyUrlAbsolute(doc.proxyUrl);

          return {
            // ID del documento en la DB
            id: doc.id,
            dbId: doc.id, // Guardar también como dbId para referencia

            // Información del archivo
            name: doc.filename,
            filename: doc.filename,
            tigrisUrl: doc.tigrisUrl,

            // Usar proxy URL absoluta para <img src>
            dataUrl: absoluteProxyUrl, // El proxy URL sirve el archivo directamente
            proxyUrl: absoluteProxyUrl,

            // Metadatos del archivo
            type: doc.fileType || "application/octet-stream",
            size: doc.fileSize,

            // Información del pasajero (ahora usa passengerId en lugar de passengerKey)
            passengerId: doc.passengerId, // FK to pasajero.id_pasajero
            ownerId: doc.passengerId, // Usar passengerId como ownerId
            ownerName: doc.passengerName, // Auto-completed from pasajero table
            passengerName: doc.passengerName,

            // Tipo de documento
            documentoTipo: doc.documentoTipo,

            // Fechas
            uploadDate: doc.uploadedAt || doc.createdAt,
            createdAt: doc.createdAt,
            createdBy: doc.createdBy,

            // Flag para saber que viene de la DB
            isFromDatabase: true,
          };
        });
      }
    });

    return converted;
  },

  /**
   * Convertir documento del formato frontend al formato backend
   * @param {Object} frontendDoc - Documento en formato frontend
   * @param {string} voucherCode - Código del voucher
   * @param {number} passengerId - ID del pasajero (FK to pasajero.id_pasajero)
   * @param {string} passengerName - Nombre del pasajero (auto-completed by backend)
   * @returns {Object} - Formato para enviar al backend
   */
  convertFrontendToBackend: (
    frontendDoc,
    voucherCode,
    passengerId,
    passengerName,
  ) => {
    // Determinar tipo de documento basado en la categoría
    const getTipoDocumento = (doc) => {
      if (doc.documentoTipo) return doc.documentoTipo;
      if (doc.category === "passports") return "passport";
      if (doc.category === "idCards") return "idcard";
      return "other";
    };

    return {
      voucherCode: voucherCode,
      documentoTipo: getTipoDocumento(frontendDoc),
      passengerId: passengerId, // Use passengerId instead of passengerKey
      passengerName: passengerName, // Backend will auto-complete if passengerId provided
      filename: frontendDoc.filename || frontendDoc.name,
      fileSize: frontendDoc.size || null,
      fileType: frontendDoc.type || null,
      tigrisUrl: frontendDoc.tigrisUrl,
    };
  },
};

export default voucherDocumentService;
