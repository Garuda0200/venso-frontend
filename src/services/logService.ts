// services/logService.js
import { createApiInstance, handleApiError } from "../utils/apiUtils";

const API_URL = "/admin/logs";

// Utility function para obtener datos con paginación
const fetchPaginatedData = async (endpoint, params = {}) => {
  try {
    const axiosClient = createApiInstance();
    const response = await axiosClient.get(endpoint, { params });
    return response.data;
  } catch (error) {
    console.error(`Error fetching data from ${endpoint}:`, error);
    return handleApiError(error, "Error al obtener logs del servidor");
  }
};

// Obtener logs con paginación (endpoint principal)
export const getLogs = async (
  page = 0,
  size = 10,
  sortField = "action_timestamp",
  sortOrder = "desc",
  filters = {},
) => {
  const params = {
    page,
    size,
    sort: sortField,
    order: sortOrder,
    ...filters,
  };

  return await fetchPaginatedData(API_URL, params);
};

// Obtener logs del usuario actual
export const getMyLogs = async (
  page = 0,
  size = 10,
  sortField = "action_timestamp",
  sortOrder = "desc",
) => {
  const params = {
    page,
    size,
    sort: sortField,
    order: sortOrder,
  };

  return await fetchPaginatedData(`${API_URL}/my`, params);
};

// Obtener logs de un usuario específico (solo admin)
export const getUserLogs = async (
  dniuser,
  page = 0,
  size = 10,
  sortField = "action_timestamp",
  sortOrder = "desc",
) => {
  const params = {
    page,
    size,
    sort: sortField,
    order: sortOrder,
  };

  return await fetchPaginatedData(`${API_URL}/user/${dniuser}`, params);
};

// Obtener logs por entidad
export const getEntityLogs = async (
  entityType,
  entityId = null,
  page = 0,
  size = 10,
  sortField = "action_timestamp",
  sortOrder = "desc",
) => {
  const endpoint = entityId
    ? `${API_URL}/entity/${entityType}/${entityId}`
    : `${API_URL}/entity/${entityType}`;
  const params = {
    page,
    size,
    sort: sortField,
    order: sortOrder,
  };

  return await fetchPaginatedData(endpoint, params);
};

// Obtener logs por tipo de operación
export const getOperationLogs = async (
  operation,
  page = 0,
  size = 10,
  sortField = "action_timestamp",
  sortOrder = "desc",
) => {
  const params = {
    page,
    size,
    sort: sortField,
    order: sortOrder,
  };

  return await fetchPaginatedData(`${API_URL}/operation/${operation}`, params);
};

// Obtener todos los logs sin paginación (solo superadmin)
export const getAllLogsNoPagination = async (
  sortField = "action_timestamp",
  sortOrder = "desc",
  limit = 500,
) => {
  const params = {
    sort: sortField,
    order: sortOrder,
    size: limit,
  };

  return await fetchPaginatedData(`${API_URL}/all`, params);
};

// Exportar logs a CSV/Excel (funcionalidad del cliente)
export const exportLogs = async (format = "csv", filters = {}) => {
  try {
    // Obtener todos los logs filtrados para exportar
    const allLogs = await getLogs(0, 1000, "action_timestamp", "desc", filters);

    if (!allLogs.success || !allLogs.data) {
      throw new Error("No hay datos para exportar");
    }

    return {
      success: true,
      data: allLogs.data,
      total: allLogs.total,
      format,
    };
  } catch (error) {
    console.error("Error exporting logs:", error);
    return handleApiError(error, "Error al exportar logs");
  }
};

// Función helper para construir filtros
export const buildLogFilters = (filters) => {
  const params = {};

  if (filters.dniuser) {
    params.dniuser = filters.dniuser;
  }

  if (filters.operation) {
    params.operation = filters.operation;
  }

  if (filters.entity) {
    params.entity = filters.entity;
  }

  if (filters.dateFrom) {
    params.date_from = filters.dateFrom;
  }

  if (filters.dateTo) {
    params.date_to = filters.dateTo;
  }

  if (filters.status !== undefined) {
    params.status = filters.status;
  }

  return params;
};
