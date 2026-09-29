import { getApiUrl } from "../utils/apiUtils";

/**
 * Genera la URL del proxy del backend para evitar problemas de CORS/ad-blockers
 * Esta es la forma preferida de acceder a archivos de Tigris
 * @param {string} tigrisUrl - URL original de Tigris
 * @returns {string} URL del proxy del backend (URL completa)
 */
export const getProxyUrl = (tigrisUrl) => {
  if (!tigrisUrl || !tigrisUrl.includes("fly.storage.tigris.dev")) {
    return tigrisUrl; // Retornar tal cual si no es de Tigris
  }

  // Obtener la baseURL del API y construir la URL completa
  // Esto es necesario porque <img src> no usa axios y necesita URL absoluta
  const apiUrl = getApiUrl();
  // El apiUrl incluye /api, así que la ruta es /upload/tigris/proxy
  return `${apiUrl}/upload/tigris/proxy?url=${encodeURIComponent(tigrisUrl)}`;
};

/**
 * Convierte una proxy URL relativa (del backend) a una URL absoluta
 * El backend retorna URLs como /api/upload/tigris/proxy?url=...
 * @param {string} relativeProxyUrl - URL relativa del proxy
 * @returns {string} URL absoluta del proxy
 */
export const makeProxyUrlAbsolute = (relativeProxyUrl) => {
  if (!relativeProxyUrl) return null;

  // Si ya es absoluta, retornar tal cual
  if (
    relativeProxyUrl.startsWith("http://") ||
    relativeProxyUrl.startsWith("https://")
  ) {
    return relativeProxyUrl;
  }

  // Si es una URL relativa del proxy, convertir a absoluta
  if (relativeProxyUrl.startsWith("/api/upload/tigris/proxy")) {
    const apiUrl = getApiUrl(); // Esto incluye /api
    // Remover /api del inicio de la URL relativa porque apiUrl ya lo tiene
    const pathWithoutApi = relativeProxyUrl.replace(/^\/api/, "");
    return `${apiUrl}${pathWithoutApi}`;
  }

  // Si no es una URL del proxy, retornar tal cual
  return relativeProxyUrl;
};

/**
 * Procesa un array de archivos y obtiene URLs del proxy
 * @param {Array} files - Array de objetos file con tigrisUrl
 * @returns {Array} Array de archivos con proxy_url
 */
export const processFilesWithProxyUrls = (files) => {
  if (!files || !Array.isArray(files)) return [];

  return files.map((file) => {
    // Si ya tiene proxyUrl del backend, hacerla absoluta
    if (file.proxyUrl || file.proxy_url) {
      const proxyUrl = file.proxyUrl || file.proxy_url;
      return {
        ...file,
        proxyUrl: makeProxyUrlAbsolute(proxyUrl),
        proxy_url: makeProxyUrlAbsolute(proxyUrl),
      };
    }

    // Si tiene tigrisUrl, generar proxy URL
    if (file.tigrisUrl || file.tigris_url) {
      const tigrisUrl = file.tigrisUrl || file.tigris_url;
      return {
        ...file,
        proxy_url: getProxyUrl(tigrisUrl),
      };
    }
    return file;
  });
};

export default {
  getProxyUrl,
  makeProxyUrlAbsolute,
  processFilesWithProxyUrls,
};
