import { createApiInstance, isRequestCanceled } from "../../../../utils/apiUtils";
import { calculateExternalItineraryBreakdown } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/cotizacionFinancialSummary";
import { sanitizeAdditionalCostsConfig } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/quotePricingEngine";
import { resolveVisibleSummaryTotalFromAdditionalCosts } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/visibleSummaryTotals";
import SecureStorage from "../../../../utils/secureStorage";
import { invalidateCotizacionGraphCache } from "../../../../utils/cacheInvalidation";
import { resolveCotizacionIgvInfo } from "../utils/cotizacionIgv";

// Crear una instancia API para todos los servicios de cotizaciones
// Usamos la función mejorada para crear una instancia con el token actual
const getApiInstance = () => createApiInstance(true);
const BASE_URL = "/turismo/cotizaciones";

const logUnlessCanceled = (message, error) => {
  if (!isRequestCanceled(error)) {
    console.error(message, error);
  }
};

// Helper function to clean additionalCosts data corruption
const cleanAdditionalCostsData = (additionalCosts) => {
  if (!additionalCosts) return {};

  let cleanCosts = additionalCosts;

  // If it's a string, try to parse it
  if (typeof cleanCosts === "string") {
    try {
      cleanCosts = JSON.parse(cleanCosts);
    } catch (error) {
      console.error(" Failed to parse additionalCosts:", error);
      return {};
    }
  }

  // If it's an object with indexed keys (corrupted), extract valid properties
  if (cleanCosts && typeof cleanCosts === "object") {
    const hasIndexedKeys = Object.keys(cleanCosts).some((key) =>
      /^\d+$/.test(key),
    );

    if (hasIndexedKeys) {
      // Extract only non-indexed properties
      const validData = {};
      Object.entries(cleanCosts).forEach(([key, value]) => {
        if (!/^\d+$/.test(key)) {
          validData[key] = value;
        }
      });
      cleanCosts = validData;
    }
  }

  return sanitizeAdditionalCostsConfig(cleanCosts || {});
};

const toNumber = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const calculateFallbackTotalFinal = (cotizacionData) => {
  const additional = toNumber(cotizacionData.total_adicionales);
  const rawPeopleCount = cotizacionData.peopleCount ?? {};
  const rawPeopleDetails = cotizacionData.peopleDetails ?? {};
  const adultsFromDetails = Array.isArray(rawPeopleDetails?.adults)
    ? rawPeopleDetails.adults.length
    : 0;
  const childrenFromDetails = Array.isArray(rawPeopleDetails?.children)
    ? rawPeopleDetails.children.length
    : 0;
  const adults = Math.max(
    1,
    toNumber(rawPeopleCount?.adults ?? adultsFromDetails),
  );
  const children = Math.max(
    0,
    toNumber(rawPeopleCount?.children ?? childrenFromDetails),
  );
  const externalBreakdown = calculateExternalItineraryBreakdown(
    cotizacionData.itinerario_externo ?? cotizacionData.itinerarioExterno,
    rawPeopleDetails,
  );
  const adultPerPerson = toNumber(
    cotizacionData.precio_it_adulto ?? cotizacionData.precioItAdulto,
  );
  const childPerPerson = toNumber(
    cotizacionData.precio_it_ninos ?? cotizacionData.precioItNinos,
  );
  const externalAdultPerPerson = toNumber(
    cotizacionData.precio_it_ext_adulto ??
      cotizacionData.precioItExtAdulto ??
      externalBreakdown.adultTotal,
  );
  const externalChildPerPerson = toNumber(
    cotizacionData.precio_it_ext_ninos ??
      cotizacionData.precioItExtNinos ??
      round2(externalBreakdown.childTotal + externalBreakdown.convertedChildTotal),
  );

  return round2(
    (adultPerPerson + externalAdultPerPerson) * adults +
      (childPerPerson + externalChildPerPerson) * children +
      additional,
  );
};

// Get all cotizaciones
export const getAllCotizaciones = async (options = {}) => {
  try {
    const api = getApiInstance(); // Obtiene una instancia fresca cada vez
    const response = await api.get(BASE_URL, {
      params: {
        include_inactive: true,
        // Cuando se pide saltar caché, forzamos refresco en el backend también
        // para evitar que el caché en memoria devuelva datos obsoletos tras mutaciones.
        ...(options.skipCache ? { force_refresh: true } : {}),
      }, // Get all including inactive for predecessor chains
      _skipDedup: Boolean(options.skipCache || options._skipDedup),
      signal: options.signal,
    });

    // Clean additionalCosts in all cotizaciones
    const cleanedData = response.data.data.map((cotizacion) => {
      const rawAdditionalCosts =
        cotizacion.additionalcosts ?? cotizacion.additionalCosts;
      const cleanedAdditionalCosts = cleanAdditionalCostsData(rawAdditionalCosts);
      const igvInfo = resolveCotizacionIgvInfo(cotizacion);
      return {
        ...cotizacion,
        additionalcosts: cleanedAdditionalCosts,
        additionalCosts: cleanedAdditionalCosts, // Also provide camelCase version
        has_igv: igvInfo.hasIgv,
        hasIgv: igvInfo.hasIgv,
        hasigv: igvInfo.hasIgv,
        igv_service_count: igvInfo.serviceCount,
        igvServiceCount: igvInfo.serviceCount,
      };
    });

    return cleanedData;
  } catch (error) {
    logUnlessCanceled("Error fetching cotizaciones:", error);
    throw error;
  }
};

// Get cotizacion by ID
export const getCotizacionById = async (id, options = {}) => {
  try {
    const api = getApiInstance(); // Obtiene una instancia fresca cada vez
    const response = await api.get(`${BASE_URL}/${id}`, {
      params: {
        ...(options.skipCache ? { force_refresh: true, no_cache: true } : {}),
      },
      _skipDedup: Boolean(options.skipCache || options._skipDedup),
      signal: options.signal,
    });

    // Clean additionalCosts in the single cotizacion
    const rawAdditionalCosts =
      response.data.data.additionalcosts ?? response.data.data.additionalCosts;
    const cleanedAdditionalCosts = cleanAdditionalCostsData(rawAdditionalCosts);
    const igvInfo = resolveCotizacionIgvInfo(response.data.data);
    const cleanedCotizacion = {
      ...response.data.data,
      additionalcosts: cleanedAdditionalCosts,
      additionalCosts: cleanedAdditionalCosts, // Also provide camelCase version
      has_igv: igvInfo.hasIgv,
      hasIgv: igvInfo.hasIgv,
      hasigv: igvInfo.hasIgv,
      igv_service_count: igvInfo.serviceCount,
      igvServiceCount: igvInfo.serviceCount,
    };

    return cleanedCotizacion;
  } catch (error) {
    logUnlessCanceled(`Error fetching cotizacion ${id}:`, error);
    throw error;
  }
};

// Get cotizaciones by creator
export const getCotizacionesByCreator = async (createdby) => {
  try {
    const api = getApiInstance(); // Obtiene una instancia fresca cada vez
    const response = await api.get(`${BASE_URL}/by-createdby`, {
      params: { createdby },
    });
    return response.data.data;
  } catch (error) {
    console.error(
      `Error fetching cotizaciones for creator ${createdby}:`,
      error,
    );
    throw error;
  }
};

// Create new cotizacion
export const createCotizacion = async (cotizacionData) => {
  try {
    // ENSURE ADDITIONAL COSTS IS ALWAYS A CLEAN OBJECT (NOT STRING)
    if (typeof cotizacionData.additionalcosts === "string") {
      try {
        cotizacionData.additionalcosts = JSON.parse(
          cotizacionData.additionalcosts,
        );
      } catch (error) {
        console.error(
          " Failed to parse additionalcosts in create service:",
          error,
        );
        cotizacionData.additionalcosts = {};
      }
    }

    // Validate additionalcosts structure
    if (
      cotizacionData.additionalcosts &&
      typeof cotizacionData.additionalcosts === "object"
    ) {
      const hasIndexedKeys = Object.keys(cotizacionData.additionalcosts).some(
        (key) => /^\d+$/.test(key),
      );
      if (hasIndexedKeys) {
        const cleanCosts = {};
        Object.entries(cotizacionData.additionalcosts).forEach(
          ([key, value]) => {
            if (!/^\d+$/.test(key)) {
              cleanCosts[key] = value;
            }
          },
        );
        cotizacionData.additionalcosts = cleanCosts;
      }
    }
    cotizacionData.additionalcosts = sanitizeAdditionalCostsConfig(
      cotizacionData.additionalcosts || {},
    );

    const visibleTotalForSave = resolveVisibleSummaryTotalFromAdditionalCosts(
      cotizacionData.additionalcosts,
    );
    if (visibleTotalForSave > 0) {
      cotizacionData.total_final = visibleTotalForSave;
    }

    // VALIDATE TOTAL FIELDS BEFORE SENDING TO BACKEND
    if (
      cotizacionData.total_final === undefined ||
      cotizacionData.total_final === null
    ) {
      console.warn(
        " total_final is missing in create, calculating from available data",
      );
      cotizacionData.total_final = calculateFallbackTotalFinal(cotizacionData);
    }

    const api = getApiInstance(); // Obtiene una instancia fresca cada vez
    const response = await api.post(BASE_URL, cotizacionData);
    invalidateCotizacionGraphCache({ refetchType: "none", includeVouchers: false });
    return response.data.data;
  } catch (error) {
    console.error("Error creating cotizacion:", error);
    throw error;
  }
};

// Update cotizacion
export const updateCotizacion = async (id, cotizacionData) => {
  try {
    const hasAdditionalCosts = Object.prototype.hasOwnProperty.call(
      cotizacionData,
      "additionalcosts",
    );

    // Ensure updatedby field is always present
    if (!cotizacionData.updatedby) {
      const user = SecureStorage.getItem("user") || {};
      cotizacionData.updatedby =
        user.dni || user.id || SecureStorage.getItem("dniuser") || "12345678";
    }

    if (hasAdditionalCosts) {
      // ENSURE ADDITIONAL COSTS IS ALWAYS A CLEAN OBJECT (NOT STRING)
      if (typeof cotizacionData.additionalcosts === "string") {
        try {
          cotizacionData.additionalcosts = JSON.parse(
            cotizacionData.additionalcosts,
          );
        } catch (error) {
          console.error(" Failed to parse additionalcosts in service:", error);
          cotizacionData.additionalcosts = {};
        }
      }

      // Validate additionalcosts structure
      if (
        cotizacionData.additionalcosts &&
        typeof cotizacionData.additionalcosts === "object"
      ) {
        const hasIndexedKeys = Object.keys(cotizacionData.additionalcosts).some(
          (key) => /^\d+$/.test(key),
        );
        if (hasIndexedKeys) {
          const cleanCosts = {};
          Object.entries(cotizacionData.additionalcosts).forEach(
            ([key, value]) => {
              if (!/^\d+$/.test(key)) {
                cleanCosts[key] = value;
              }
            },
          );
          cotizacionData.additionalcosts = cleanCosts;
        }
      }
      cotizacionData.additionalcosts = sanitizeAdditionalCostsConfig(
        cotizacionData.additionalcosts || {},
      );

      const visibleTotalForSave = resolveVisibleSummaryTotalFromAdditionalCosts(
        cotizacionData.additionalcosts,
      );
      if (visibleTotalForSave > 0) {
        cotizacionData.total_final = visibleTotalForSave;
      }
    }

    // VALIDACIÓN MEJORADA: Proteger total_final de ser sobrescrito incorrectamente
    if (
      cotizacionData.total_final === undefined ||
      cotizacionData.total_final === null ||
      cotizacionData.total_final === 0
    ) {
      console.warn(
        " total_final is missing or zero, checking if we should preserve existing value",
      );

      // Si estamos actualizando solo campos específicos (como tiene_voucher), no recalcular total_final
      const isPartialUpdate = Object.keys(cotizacionData).length <= 3; // solo tiene_voucher, updated_by, y quizás otro campo

      if (
        isPartialUpdate &&
        (cotizacionData.tiene_voucher !== undefined ||
          cotizacionData.updated_by !== undefined)
      ) {
        // No tocar total_final en actualizaciones parciales
        delete cotizacionData.total_final;
      } else {
        // Solo recalcular si es una actualización completa
        console.warn(" Recalculating total_final from available data");
        cotizacionData.total_final =
          calculateFallbackTotalFinal(cotizacionData);
      }
    }

    const currentVersion =
      cotizacionData.current_version ?? cotizacionData.currentVersion;
    if (
      currentVersion !== undefined &&
      currentVersion !== null &&
      cotizacionData.expected_version === undefined
    ) {
      cotizacionData.expected_version = Number(currentVersion);
    }

    const api = getApiInstance(); // Obtiene una instancia fresca cada vez
    const response = await api.put(`${BASE_URL}/${id}`, cotizacionData);
    invalidateCotizacionGraphCache({ refetchType: "none", includeVouchers: false });
    return response.data.data;
  } catch (error) {
    console.error(`Error updating cotizacion ${id}:`, error);
    throw error;
  }
};

// Delete cotizacion
export const deleteCotizacion = async (id) => {
  try {
    const api = getApiInstance(); // Obtiene una instancia fresca cada vez
    const response = await api.delete(`${BASE_URL}/${id}`);
    invalidateCotizacionGraphCache();
    return response.data.data;
  } catch (error) {
    console.error(` API Error deleting cotizacion ${id}:`, error);
    throw error;
  }
};

// GET ARCHIVED VERSIONS - Obtiene versiones archivadas desde la tabla dedicada
export const getArchivedVersions = async (cotizacionId) => {
  try {
    const api = getApiInstance();
    const response = await api.get(
      `${BASE_URL}/${cotizacionId}/archived-versions`,
    );
    return response.data.data || [];
  } catch (error) {
    console.error(
      ` Error obteniendo versiones archivadas de cotización ${cotizacionId}:`,
      error,
    );
    throw error;
  }
};

// GET ARCHIVED VERSION BY ID - Obtiene una versión archivada específica con snapshot completo
export const getArchivedVersionById = async (versionId) => {
  try {
    const api = getApiInstance();
    const response = await api.get(`${BASE_URL}/archived-versions/${versionId}`);
    return response.data.data;
  } catch (error) {
    console.error(` Error obteniendo versión archivada ${versionId}:`, error);
    throw error;
  }
};

// DELETE ARCHIVED VERSION - Elimina solo una versión de la tabla de versiones archivadas
// NO elimina la cotización completa, solo elimina esa versión del historial
export const deleteArchivedVersion = async (_cotizacionId, versionId) => {
  try {
    const api = getApiInstance();
    const response = await api.delete(
      `${BASE_URL}/archived-versions/${versionId}`,
    );
    // El historial se gestiona localmente en su modal; no recargar el listado
    // completo ni el grafo de vouchers por eliminar una versión archivada.
    return response.data.data;
  } catch (error) {
    console.error(` Error eliminando versión archivada ${versionId}:`, error);
    throw error;
  }
};

// RELATIONAL VERSION HISTORY - quotation, additional costs, days and services.
export const getCotizacionVersions = async (cotizacionId) => {
  const api = getApiInstance();
  const response = await api.get(`${BASE_URL}/${cotizacionId}/versions`);
  return response.data.data || [];
};

export const getCotizacionVersionById = async (cotizacionId, versionId) => {
  const api = getApiInstance();
  const response = await api.get(
    `${BASE_URL}/${cotizacionId}/versions/${versionId}`,
  );
  return response.data.data;
};

export const restoreCotizacionVersion = async (
  cotizacionId,
  versionId,
  note = null,
) => {
  const api = getApiInstance();
  const response = await api.post(
    `${BASE_URL}/${cotizacionId}/versions/${versionId}/restore`,
    { note },
  );
  invalidateCotizacionGraphCache();
  return response.data.data;
};

// Duplicate cotizacion
export const duplicateCotizacion = async (duplicateData) => {
  try {
    const api = getApiInstance(); // Obtiene una instancia fresca cada vez
    const response = await api.post(`${BASE_URL}/duplicate`, duplicateData);
    invalidateCotizacionGraphCache();
    return response.data.data;
  } catch (error) {
    console.error(`Error duplicating cotizacion:`, error);
    throw error;
  }
};

// Clone cotizacion as a quote-only copy.
export const duplicarCotizacionModelo = async (duplicateData) => {
  try {
    const api = getApiInstance();
    const response = await api.post(
      `${BASE_URL}/duplicate-modelo`,
      duplicateData,
    );
    invalidateCotizacionGraphCache();
    return response.data.data;
  } catch (error) {
    console.error(` Error cloning quote-only cotizacion:`, error);
    throw error;
  }
};


export const upsertVoucherMedia = async (id, media) => {
  if (!id) throw new Error("ID de cotización requerido");
  const payload = media?.mediaAssetId
    ? { mediaAssetId: media.mediaAssetId }
    : {
        tigrisUrl: media?.tigrisUrl || media?.url,
        originalName: media?.originalName,
        contentType: media?.contentType,
        sizeBytes: media?.sizeBytes,
        title: media?.title,
      };
  const api = getApiInstance();
  const response = await api.put(`${BASE_URL}/${id}/voucher-media`, payload);
  invalidateCotizacionGraphCache();
  return response.data;
};

export const clearVoucherMedia = async (id) => {
  if (!id) throw new Error("ID de cotización requerido");
  const api = getApiInstance();
  const response = await api.delete(`${BASE_URL}/${id}/voucher-media`);
  invalidateCotizacionGraphCache();
  return response.data;
};

// Process cotizacion: save info_pdf and mark as processed
export const processCotizacion = async (id, infoPdf) => {
  try {
    console.log(` [PROCESS] Procesando cotización ${id}`);
    const api = getApiInstance();
    const response = await api.post(`${BASE_URL}/${id}/process`, {
      info_pdf: infoPdf,
    });
    invalidateCotizacionGraphCache();
    console.log(` [PROCESS] Cotización procesada:`, response.data.data);
    return response.data.data;
  } catch (error) {
    console.error(` Error procesando cotización ${id}:`, error);
    throw error;
  }
};

// Check if cotizacion has been processed
export const checkCotizacionProcesado = async (id) => {
  try {
    const api = getApiInstance();
    const response = await api.get(`${BASE_URL}/${id}/is-procesado`);
    return response.data.data;
  } catch (error) {
    console.error(
      ` Error verificando procesamiento de cotización ${id}:`,
      error,
    );
    throw error;
  }
};

// Trigger N8N workflow to generate PDF Canva content for a cotizacion
export const triggerN8NCotizacion = async (id) => {
  try {
    const api = getApiInstance();
    const response = await api.post(`${BASE_URL}/${id}/trigger-n8n`);
    invalidateCotizacionGraphCache();
    return response.data;
  } catch (error) {
    console.error(` Error disparando N8N para cotización ${id}:`, error);
    throw error;
  }
};


const cotizacionService = {
  getAllCotizaciones,
  getCotizacionById,
  getCotizacionesByCreator,
  createCotizacion,
  updateCotizacion,
  deleteCotizacion,
  getArchivedVersions,
  getArchivedVersionById,
  deleteArchivedVersion,
  getCotizacionVersions,
  getCotizacionVersionById,
  restoreCotizacionVersion,
  duplicateCotizacion,
  duplicarCotizacionModelo,
  processCotizacion,
  checkCotizacionProcesado,
  triggerN8NCotizacion,
  upsertVoucherMedia,
  clearVoucherMedia,
};

export default cotizacionService;
