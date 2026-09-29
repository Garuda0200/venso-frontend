import { useState, useCallback } from "react";
import axiosInstance from "../utils/axiosInstance";

const getUploadErrorMessage = (error, fallback) => {
  const payload = error?.response?.data;
  const message =
    typeof payload === "string"
      ? payload
      : payload?.message || payload?.error || error?.message;

  return typeof message === "string" && message.trim()
    ? message.trim()
    : fallback;
};

/**
 * Hook para subir archivos a Tigris Object Storage
 *
 * @returns {Object} Métodos y estado del upload
 * @property {Function} uploadFile - Sube un archivo a Tigris
 * @property {Function} uploadMultipleFiles - Sube múltiples archivos
 * @property {Function} migrateBase64 - Migra base64 existente a Tigris
 * @property {Function} deleteFile - Elimina archivo de Tigris
 * @property {boolean} isUploading - Estado de carga
 * @property {number} uploadProgress - Progreso del upload (0-100)
 * @property {string|null} uploadError - Error del upload
 */
export const useFileUpload = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);

  /**
   * Sube un archivo a Tigris
   *
   * @param {File} file - Archivo a subir
   * @param {string} folder - Carpeta destino ('documents', 'evidencias', etc.)
   * @returns {Promise<Object>} Objeto con tigrisUrl y metadata
   */
  const uploadFile = useCallback(async (file, folder = "documents") => {
    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      if (!(file instanceof File)) {
        throw new Error("No se recibió un archivo válido para subir");
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", folder);

      const response = await axiosInstance.post("/upload/tigris", formData, {
        // No establecer Content-Type manualmente: el navegador agrega el
        // boundary requerido por multipart/form-data.
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && progressEvent.total > 0) {
            setUploadProgress(
              Math.round((progressEvent.loaded * 100) / progressEvent.total),
            );
          }
        },
      });

      if (!response.data?.success || !response.data?.url) {
        throw new Error("Tigris no devolvió la URL del archivo subido");
      }

      setIsUploading(false);
      setUploadProgress(100);

      return {
        tigrisUrl: response.data.url,
        metadata: {
          originalName: response.data.metadata.original_name,
          contentType: response.data.metadata.content_type,
          sizeBytes: response.data.metadata.size_bytes,
          uploadedAt: response.data.metadata.uploaded_at,
        },
      };
    } catch (error) {
      setIsUploading(false);
      setUploadProgress(0);

      const errorMessage = getUploadErrorMessage(error, "Error al subir archivo");
      setUploadError(errorMessage);

      console.error("Error uploading file:", error);
      throw new Error(errorMessage);
    }
  }, []);

  /**
   * Sube múltiples archivos a Tigris
   *
   * @param {File[]} files - Array de archivos
   * @param {string} folder - Carpeta destino
   * @returns {Promise<Array>} Array de objetos con tigrisUrl y metadata
   */
  const uploadMultipleFiles = useCallback(
    async (files, folder = "documents") => {
      const uploads = files.map((file) => uploadFile(file, folder));

      try {
        const results = await Promise.all(uploads);
        return results;
      } catch (error) {
        console.error("Error uploading multiple files:", error);
        throw error;
      }
    },
    [uploadFile],
  );

  /**
   * Migra datos base64 existentes a Tigris
   *
   * @param {string} base64Data - Datos en base64 (con o sin prefijo data:)
   * @param {string} filename - Nombre del archivo original
   * @param {string} contentType - Tipo MIME (e.g., 'image/jpeg')
   * @param {string} folder - Carpeta destino
   * @returns {Promise<Object>} Objeto con tigrisUrl
   */
  const migrateBase64 = useCallback(
    async (base64Data, filename, contentType, folder = "documents") => {
      setIsUploading(true);
      setUploadError(null);

      try {
        const response = await axiosInstance.post("/upload/tigris/migrate", {
          base64_data: base64Data,
          filename,
          content_type: contentType,
          folder,
        });

        setIsUploading(false);

        return {
          tigrisUrl: response.data.url,
          originalSize: response.data.original_size,
          uploadedAt: response.data.uploaded_at,
        };
      } catch (error) {
        setIsUploading(false);

        const errorMessage = getUploadErrorMessage(error, "Error al migrar base64");
        setUploadError(errorMessage);

        console.error("Error migrating base64:", error);
        throw new Error(errorMessage);
      }
    },
    [],
  );

  /**
   * Elimina un archivo de Tigris
   *
   * @param {string} url - URL del archivo en Tigris
   * @returns {Promise<boolean>} true si se eliminó correctamente
   */
  const deleteFile = useCallback(async (url) => {
    try {
      await axiosInstance.delete("/upload/tigris/delete", {
        data: { url },
      });

      return true;
    } catch (error) {
      const errorMessage = getUploadErrorMessage(error, "Error al eliminar archivo");
      setUploadError(errorMessage);

      console.error("Error deleting file:", error);
      throw new Error(errorMessage);
    }
  }, []);

  /**
   * Resetea el estado de error
   */
  const clearError = useCallback(() => {
    setUploadError(null);
  }, []);

  return {
    uploadFile,
    uploadMultipleFiles,
    migrateBase64,
    deleteFile,
    isUploading,
    uploadProgress,
    uploadError,
    clearError,
  };
};

export default useFileUpload;
