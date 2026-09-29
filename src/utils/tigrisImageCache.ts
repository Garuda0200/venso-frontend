/**
 * Helper para interactuar con el Service Worker que cachea imágenes Tigris.
 * Si no hay SW disponible, las funciones son no-op.
 */

const isServiceWorkerAvailable = () =>
  typeof navigator !== "undefined" && "serviceWorker" in navigator && navigator.serviceWorker.controller;

const postMessageToSw = (message) => {
  if (!isServiceWorkerAvailable()) return Promise.resolve();
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      resolve(event.data);
    };
    navigator.serviceWorker.controller.postMessage(message, [channel.port2]);
  });
};

/**
 * Invalida una URL específica de la caché de imágenes Tigris.
 */
export const invalidateTigrisCache = (url) => {
  if (!url) return Promise.resolve();
  return postMessageToSw({ type: "INVALIDATE_TIGRIS_CACHE", url });
};

/**
 * Limpia toda la caché de imágenes Tigris.
 * Útil tras subir/actualizar/eliminar imágenes en Media Manager.
 */
export const clearTigrisImageCache = () =>
  postMessageToSw({ type: "INVALIDATE_TIGRIS_CACHE", clearAll: true });

/**
 * Verifica si el Service Worker está controlando la página.
 */
export const isTigrisCacheActive = () => isServiceWorkerAvailable();
