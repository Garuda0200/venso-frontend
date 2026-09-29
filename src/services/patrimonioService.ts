import axiosInstance from "../utils/axiosInstance";
import { handleApiError } from "../utils/apiUtils";

const BASE_URL = "/turismo/patrimonio";

const patrimonioService = {
  listItems: async (params = {}) => {
    try {
      const response = await axiosInstance.get(`${BASE_URL}/items`, { params });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  getSummary: async () => {
    try {
      const response = await axiosInstance.get(`${BASE_URL}/items/summary`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  getNextCode: async (categoria) => {
    try {
      const response = await axiosInstance.get(`${BASE_URL}/items/next-code`, {
        params: { categoria },
      });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  getItem: async (id) => {
    try {
      const response = await axiosInstance.get(`${BASE_URL}/items/${id}`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  findByBarcode: async (code) => {
    try {
      const response = await axiosInstance.get(
        `${BASE_URL}/items/barcode/${encodeURIComponent(code)}`,
      );
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  createItem: async (payload) => {
    try {
      const response = await axiosInstance.post(`${BASE_URL}/items`, payload);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  updateItem: async (id, payload) => {
    try {
      const response = await axiosInstance.put(`${BASE_URL}/items/${id}`, payload);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  deleteItem: async (id) => {
    try {
      const response = await axiosInstance.delete(`${BASE_URL}/items/${id}`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  listCategories: async () => {
    try {
      const response = await axiosInstance.get(`${BASE_URL}/items/categories`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  listMovimientos: async (itemId) => {
    try {
      const response = await axiosInstance.get(
        `${BASE_URL}/items/${itemId}/movimientos`,
      );
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  createMovimiento: async (itemId, payload) => {
    try {
      const response = await axiosInstance.post(
        `${BASE_URL}/items/${itemId}/movimientos`,
        payload,
      );
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
};

export default patrimonioService;
