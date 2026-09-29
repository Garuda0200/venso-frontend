import axios from "axios";
import { getApiUrl, normalizeApiRequestUrl, isRequestCanceled } from "./apiUtils";
import {
  clearCsrfToken,
  ensureCsrfToken,
  getCsrfToken,
  isCsrfMismatchResponse,
  refreshCsrfToken,
} from "./csrfToken";
import {
  reportBackendAvailable,
  reportBackendUnavailable,
} from "./backendStatus";
import { queryClient } from "../config/queryClient";

const API_TIMEOUT =
  Number.parseInt(import.meta.env.VITE_API_TIMEOUT || "15000", 10) || 15000;

// Instancia centralizada de axios. La autenticación va por cookie HttpOnly;
// no enviamos cabeceras de autenticación desde el cliente.
const axiosInstance = axios.create({
  baseURL: getApiUrl(),
  timeout: API_TIMEOUT,
  withCredentials: true,
});

const MUTATING_METHODS = new Set(["post", "put", "patch", "delete"]);
const getCsrfVerifyUrl = () =>
  `${String(getApiUrl()).replace(/\/+$/, "")}/auth/verify`;

const applySessionCsrf = async (config) => {
  config.url = normalizeApiRequestUrl(config.url);
  const method = config.method?.toLowerCase();
  if (!MUTATING_METHODS.has(method)) return config;

  let csrf = getCsrfToken();
  if (!csrf) {
    try {
      csrf = await ensureCsrfToken(getCsrfVerifyUrl());
    } catch {
      // El backend resolverá 401 si la cookie de sesión ya no es válida.
    }
  }
  if (csrf) {
    config.headers = config.headers || {};
    config.headers["X-CSRF-Token"] = csrf;
  }
  return config;
};

const recoverCsrfAndRetry = async (instance, error) => {
  const config = error?.config;
  if (!config || config._csrfRecoveryAttempted || !isCsrfMismatchResponse(error)) {
    return null;
  }

  config._csrfRecoveryAttempted = true;
  clearCsrfToken();
  try {
    const csrf = await refreshCsrfToken(getCsrfVerifyUrl());
    config.headers = config.headers || {};
    config.headers["X-CSRF-Token"] = csrf;
    return instance(config);
  } catch (refreshError) {
    if (refreshError?.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    }
    return null;
  }
};

// Deduplicación de GET requests.
const _inflightGets = new Map();
const _responseCache = new Map();
const CACHE_TTL_MS = 12_000;

function _getCacheKey(config) {
  const params = config.params
    ? "?" +
      Object.entries(config.params)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("&")
    : "";
  return `${config.url}${params}`;
}

const _originalGet = axiosInstance.get.bind(axiosInstance);
axiosInstance.get = function deduplicatedGet(url, config = {}) {
  // TanStack Query ya deduplica por queryKey y entrega un AbortSignal por
  // observador. Compartir manualmente una promesa ligada a ese signal hace que
  // el desmontaje de un observador (por ejemplo, el doble montaje de StrictMode)
  // cancele también la petición del siguiente montaje. Las solicitudes con
  // signal deben conservar su propio ciclo de vida.
  if (config._skipDedup || config.signal) {
    return _originalGet(url, config);
  }

  const key = _getCacheKey({ url, params: config.params });

  const cached = _responseCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return Promise.resolve(cached.data);
  }

  if (_inflightGets.has(key)) {
    return _inflightGets.get(key);
  }

  const promise = _originalGet(url, config)
    .then((response) => {
      _responseCache.set(key, { data: response, ts: Date.now() });
      return response;
    })
    .finally(() => {
      _inflightGets.delete(key);
    });

  _inflightGets.set(key, promise);
  return promise;
};

export const invalidateGetCache = (urlPattern) => {
  for (const key of _responseCache.keys()) {
    if (key.includes(urlPattern)) {
      _responseCache.delete(key);
    }
  }
};

// Configurar interceptores para sesión por cookie.
const setupInterceptors = () => {
  axiosInstance.interceptors.request.handlers = [];

  axiosInstance.interceptors.request.use(
    (config) => applySessionCsrf(config),
    (error) => Promise.reject(error),
  );

  axiosInstance.interceptors.response.use(
    (response) => {
      reportBackendAvailable("http");

      const method = response.config?.method?.toLowerCase();
      if (method && method !== "get") {
        const url = response.config?.url || "";
        const basePath = url.replace(/\/\d+$/, "").replace(/\/\d+\//, "/");
        invalidateGetCache(basePath);

        if (url.startsWith("/turismo/")) {
          queryClient.invalidateQueries({ queryKey: ["turismo"] });
        }
      }
      return response;
    },
    async (error) => {
      if (isRequestCanceled(error)) {
        return Promise.reject(error);
      }

      const csrfRetry = await recoverCsrfAndRetry(axiosInstance, error);
      if (csrfRetry) return csrfRetry;

      if (error.response?.status === 401) {
        window.dispatchEvent(new CustomEvent("auth:unauthorized"));
        if (window.location.pathname !== "/") {
          window.location.href = "/";
        }
      } else if (
        !error.response ||
        [502, 503, 504].includes(error.response?.status)
      ) {
        reportBackendUnavailable("http", error.message);
      }

      return Promise.reject(error);
    },
  );
};

setupInterceptors();

// Helper para crear una instancia de axios con credenciales (sin token)
export const createAxiosInstance = () => {
  const instance = axios.create({
    baseURL: getApiUrl(),
    timeout: API_TIMEOUT,
    withCredentials: true,
  });

  instance.interceptors.request.use((config) => applySessionCsrf(config));
  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const csrfRetry = await recoverCsrfAndRetry(instance, error);
      if (csrfRetry) return csrfRetry;
      return Promise.reject(error);
    },
  );

  return instance;
};

// No-op: mantenido por compatibilidad con llamadas antiguas a updateAuthToken/clearAuthToken
export const updateAuthToken = () => {};
export const clearAuthToken = () => {};

export const getTokenStatus = () => ({
  hasToken: true,
  tokenValue: "session-cookie",
  isValid: true,
});

export default axiosInstance;

