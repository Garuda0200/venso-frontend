import {
  createApiInstance,
  handleApiError,
} from "../utils/apiUtils";

// Base URL
const API_URL = "/protected/account";

// Utility function for GET requests with error handling
const fetchData = async (url, params = {}) => {
  try {
    // Usar createApiInstance para enviar la cookie de sesión y CSRF.
    const axiosClient = createApiInstance();
    const response = await axiosClient.get(url, { params });
    return response.data;
  } catch (error) {
    console.error(`Error fetching data from ${url}:`, error);
    return handleApiError(error, "Error al obtener datos del servidor");
  }
};

// Utility function for POST/PUT requests with error handling
const sendData = async (url, data, method = "post") => {
  try {
    // Usar createApiInstance para trabajar con la sesión vigente.
    const axiosClient = createApiInstance();
    const response = await (method === "post"
      ? axiosClient.post(url, data)
      : axiosClient.put(url, data));
    return response.data;
  } catch (error) {
    console.error(`Error sending data to ${url}:`, error);
    return handleApiError(error, "Error al enviar datos al servidor");
  }
};

// Get users with pagination and sorting
export const getUsers = async (
  page = 1,
  limit = 10,
  sortField = "created_at",
  sortOrder = -1,
) => {
  return await fetchData(API_URL, {
    page,
    size: limit,
    per_page: limit,
    sort_field: sortField,
    sort_order: sortOrder,
  });
};

// Get user profile
export const getUserProfile = async (dniuser) => {
  return await fetchData(`${API_URL}/${dniuser}/profile`);
};

// Create new user
export const createUser = async (userData) => {
  return await sendData(API_URL, userData);
};

// Update all editable account fields in one atomic backend operation.
export const updateUser = async (dniuser, userData) => {
  return await sendData(`${API_URL}/${dniuser}`, userData, "put");
};

// Update user profile
export const updateUserProfile = async (dniuser, profileData) => {
  try {
    // Estructurar correctamente el objeto antes de enviarlo
    const requestData = {
      // Solo campos del perfil (account_details)
      nombre: profileData.nombre,
      apellidopaterno: profileData.apellidopaterno,
      apellidomaterno: profileData.apellidomaterno,
      telefono: profileData.telefono || "",
    };

    const response = await sendData(
      `${API_URL}/${dniuser}/profile`,
      requestData,
      "put",
    );
    return response;
  } catch (error) {
    console.error(`Error updating profile for user ${dniuser}:`, error);
    return handleApiError(error);
  }
};

// Update admin fields (role, platform, business_type) - Only for superadmin
export const updateAdminFields = async (dniuser, adminFieldsData) => {
  try {
    const requestData = {
      role: adminFieldsData.role !== undefined ? adminFieldsData.role : null,
      platform: adminFieldsData.platform || null,
      business_type: adminFieldsData.business_type || null,
      permissions: adminFieldsData.permissions || null,
    };

    const response = await sendData(
      `${API_URL}/${dniuser}/admin-fields`,
      requestData,
      "put",
    );
    return response;
  } catch (error) {
    console.error(`Error updating admin fields for user ${dniuser}:`, error);
    return handleApiError(error);
  }
};

// Update user email
export const updateUserEmail = async (dniuser, emailData) => {
  return await sendData(`${API_URL}/${dniuser}/email`, emailData, "put");
};

// Update user password (admin version)
export const updateUserPassword = async (dniuser, passwordData) => {
  try {
    // Determinar qué endpoint usar basado en si es un reseteo administrativo
    const endpoint = passwordData.admin_reset
      ? `${API_URL}/${dniuser}/assign-password` // Usar assign-password para reseteos administrativos
      : `${API_URL}/${dniuser}/password`; // Usar password para cambios normales

    const axiosClient = createApiInstance();
    const response = await axiosClient.put(endpoint, passwordData);
    return response.data;
  } catch (error) {
    console.error(`Error updating password for user ${dniuser}:`, error);
    // Mejorar el manejo de errores específicos
    const errorMessage =
      error.response?.data?.message || "Error al actualizar la contraseña";
    return {
      success: false,
      message: errorMessage,
      error: true,
    };
  }
};

// Toggle user active status
export const toggleUserStatus = async (dniuser, isActive) => {
  return await sendData(
    `${API_URL}/${dniuser}/status`,
    { is_active: isActive },
    "put",
  );
};

// Update user status (alias for consistency)
export const updateUserStatus = toggleUserStatus;

// Delete user
export const deleteUser = async (dniuser) => {
  try {
    const axiosClient = createApiInstance();
    const response = await axiosClient.delete(`${API_URL}/${dniuser}`);
    return response.data;
  } catch (error) {
    console.error(`Error deleting user ${dniuser}:`, error);
    // Mejorar el manejo de errores específicos
    const errorMessage =
      error.response?.data?.message || "Error al eliminar el usuario";
    return {
      success: false,
      message: errorMessage,
      error: true,
    };
  }
};

// Verify user password
export const verifyPassword = async (dniuser, password) => {
  try {
    const axiosClient = createApiInstance();
    const response = await axiosClient.post(
      `${API_URL}/${dniuser}/verify-password`,
      { current_password: password },
    );
    return response.data;
  } catch (error) {
    console.error(`Error verifying password for user ${dniuser}:`, error);
    return handleApiError(error, "Error al verificar la contraseña");
  }
};

