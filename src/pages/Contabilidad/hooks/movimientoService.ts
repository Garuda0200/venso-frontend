import { createApiInstance } from "../../../utils/apiUtils";
import SecureStorage from "../../../utils/secureStorage";

// Crear una instancia API para todos los servicios de cotizaciones
// Usamos la función mejorada para crear una instancia con el token actual
const getApiInstance = () => createApiInstance(true);
const BASE_URL = "/turismo/movimientos";

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

  return cleanCosts || {};
};

// Get all cotizaciones
export const getAllCotizaciones = async () => {
  try {
    const api = getApiInstance(); // Obtiene una instancia fresca cada vez
    const response = await api.get(BASE_URL);
    console.log("Raw cotizaciones data:", response.data);
    // Clean additionalCosts in all cotizaciones
    const cleanedData = response.data.data.map((cotizacion) => ({
      ...cotizacion,
      additionalcosts: cleanAdditionalCostsData(cotizacion.additionalcosts),
      additionalCosts: cleanAdditionalCostsData(cotizacion.additionalcosts), // Also provide camelCase version
    }));

    return cleanedData;
  } catch (error) {
    console.error("Error fetching cotizaciones:", error);
    throw error;
  }
};

// Get cotizacion by ID
export const getCotizacionById = async (id) => {
  try {
    const api = getApiInstance(); // Obtiene una instancia fresca cada vez
    const response = await api.get(`${BASE_URL}/${id}`);

    // Clean additionalCosts in the single cotizacion
    const cleanedCotizacion = {
      ...response.data.data,
      additionalcosts: cleanAdditionalCostsData(
        response.data.data.additionalcosts,
      ),
      additionalCosts: cleanAdditionalCostsData(
        response.data.data.additionalcosts,
      ), // Also provide camelCase version
    };

    return cleanedCotizacion;
  } catch (error) {
    console.error(`Error fetching cotizacion ${id}:`, error);
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

    // VALIDATE TOTAL FIELDS BEFORE SENDING TO BACKEND
    if (
      cotizacionData.total_final === undefined ||
      cotizacionData.total_final === null
    ) {
      console.warn(
        " total_final is missing in create, calculating from available data",
      );
      const services = parseFloat(cotizacionData.precio_it_adulto || 0);
      const externalServices = parseFloat(
        cotizacionData.precio_it_ext_adulto || 0,
      );
      const additional = parseFloat(cotizacionData.total_adicionales || 0);
      cotizacionData.total_final = services + externalServices + additional;
    }

    const api = getApiInstance(); // Obtiene una instancia fresca cada vez
    const response = await api.post(BASE_URL, cotizacionData);
    return response.data.data;
  } catch (error) {
    console.error("Error creating cotizacion:", error);
    throw error;
  }
};

// Update cotizacion
export const updateCotizacion = async (id, cotizacionData) => {
  try {
    // Ensure updatedby field is always present
    if (!cotizacionData.updatedby) {
      const user = SecureStorage.getItem("user") || {};
      cotizacionData.updatedby =
        user.dni || user.id || SecureStorage.getItem("dniuser") || "12345678";
    }

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
        const services = parseFloat(cotizacionData.precio_it_adulto || 0);
        const externalServices = parseFloat(
          cotizacionData.precio_it_ext_adulto || 0,
        );
        const additional = parseFloat(cotizacionData.total_adicionales || 0);
        cotizacionData.total_final = services + externalServices + additional;
      }
    }

    const api = getApiInstance(); // Obtiene una instancia fresca cada vez
    const response = await api.put(`${BASE_URL}/${id}`, cotizacionData);
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
    return response.data.data;
  } catch (error) {
    console.error(` API Error deleting cotizacion ${id}:`, error);
    throw error;
  }
};

// Duplicate cotizacion
export const duplicateCotizacion = async (duplicateData) => {
  try {
    const api = getApiInstance(); // Obtiene una instancia fresca cada vez
    const response = await api.post(`${BASE_URL}/duplicate`, duplicateData);
    return response.data.data;
  } catch (error) {
    console.error(`Error duplicating cotizacion:`, error);
    throw error;
  }
};

export default {
  getAllCotizaciones,
  getCotizacionById,
  getCotizacionesByCreator,
  createCotizacion,
  updateCotizacion,
  deleteCotizacion,
  duplicateCotizacion,
};
