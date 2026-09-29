import axiosInstance from "../../../../utils/axiosInstance";

const BASE_URL = "/turismo/paquetes-turisticos";

const paqueteService = {
  getAllPaquetes: async () => {
    try {
      const response = await axiosInstance.get(BASE_URL);
      return response.data;
    } catch (error) {
      console.error("Error al obtener paquetes:", error);
      throw error;
    }
  },

  getPaqueteById: async (id) => {
    try {
      const response = await axiosInstance.get(`${BASE_URL}/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error al obtener paquete ${id}:`, error);
      throw error;
    }
  },

  getDestacados: async () => {
    try {
      const response = await axiosInstance.get(`${BASE_URL}/destacados`);
      return response.data;
    } catch (error) {
      console.error("Error al obtener paquetes destacados:", error);
      throw error;
    }
  },

  createPaquete: async (paqueteData) => {
    try {
      const response = await axiosInstance.post(BASE_URL, paqueteData);
      return response.data;
    } catch (error) {
      console.error("Error al crear paquete:", error);
      throw error;
    }
  },

  updatePaquete: async (id, paqueteData) => {
    try {
      const response = await axiosInstance.put(
        `${BASE_URL}/${id}`,
        paqueteData,
      );
      return response.data;
    } catch (error) {
      console.error(`Error al actualizar paquete ${id}:`, error);
      throw error;
    }
  },

  deletePaquete: async (id) => {
    try {
      const response = await axiosInstance.delete(`${BASE_URL}/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error al eliminar paquete ${id}:`, error);
      throw error;
    }
  },

  duplicatePaquete: async (duplicateData) => {
    try {
      const response = await axiosInstance.post(
        `${BASE_URL}/duplicate`,
        duplicateData,
      );
      return response.data;
    } catch (error) {
      console.error("Error al duplicar paquete:", error);
      throw error;
    }
  },

  updateItinerario: async (id, itinerario) => {
    try {
      const response = await axiosInstance.put(
        `${BASE_URL}/${id}/itinerario`,
        itinerario,
      );
      return response.data;
    } catch (error) {
      console.error(`Error al actualizar itinerario del paquete ${id}:`, error);
      throw error;
    }
  },

  updatePrecio: async (id, precioData) => {
    try {
      const response = await axiosInstance.put(
        `${BASE_URL}/${id}/precio`,
        precioData,
      );
      return response.data;
    } catch (error) {
      console.error(`Error al actualizar precio del paquete ${id}:`, error);
      throw error;
    }
  },

  toggleDestacado: async (id) => {
    try {
      const response = await axiosInstance.patch(`${BASE_URL}/${id}/destacado`);
      return response.data;
    } catch (error) {
      console.error(
        `Error al cambiar estado destacado del paquete ${id}:`,
        error,
      );
      throw error;
    }
  },
};

export default paqueteService;
