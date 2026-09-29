import axios from "axios";
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

export const getApiUrl = () => {
  const apiBaseUrl =
    import.meta.env.VITE_API_URL || "http://localhost:8080/api";
  return apiBaseUrl;
};

const getApiPathname = () => {
  try {
    const origin =
      globalThis.window?.location?.origin || "http://localhost:3000";
    return new URL(getApiUrl(), origin).pathname.replace(/\/+$/, "");
  } catch {
    return "/api";
  }
};

export const normalizeApiRequestUrl = (url) => {
  if (!url || typeof url !== "string") return url;

  const apiUrl = getApiUrl();
  const apiPath = getApiPathname();

  if (/^https?:\/\//i.test(url)) {
    try {
      const origin =
        globalThis.window?.location?.origin || "http://localhost:3000";
      const parsedUrl = new URL(url);
      const parsedApi = new URL(apiUrl, origin);
      if (
        parsedUrl.origin === parsedApi.origin &&
        parsedUrl.pathname.startsWith(apiPath)
      ) {
        const suffix = parsedUrl.pathname.slice(apiPath.length) || "/";
        return `${suffix}${parsedUrl.search}${parsedUrl.hash}`;
      }
    } catch {
      return url;
    }
    return url;
  }

  if (apiPath && (url === apiPath || url.startsWith(`${apiPath}/`))) {
    return url.slice(apiPath.length) || "/";
  }

  return url;
};

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
      // Si la sesión realmente expiró dejamos que el request llegue al backend;
      // responderá 401 y el flujo normal de autenticación se encargará del logout.
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
  if (
    !config ||
    config._csrfRecoveryAttempted ||
    !isCsrfMismatchResponse(error)
  ) {
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isWakeUpError = (error) => {
  if (!error.response)
    return (
      error.code === "ECONNABORTED" ||
      error.code === "ERR_NETWORK" ||
      error.message === "Network Error"
    );
  const s = error.response.status;
  return s === 502 || s === 503 || s === 504;
};

/**
 * Extrae un mensaje legible de un error de Axios/Fetch y lo devuelve como Error.
 * Se usa tanto con `throw` como con `return` desde funciones async.
 */
export const parseApiError = (error, defaultMessage = "Error en la solicitud") => {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.response?.data?.error) return error.response.data.error;
  if (error?.message) return error.message;
  return defaultMessage;
};

export const isRequestCanceled = (error) =>
  axios.isCancel?.(error) ||
  error?.code === "ERR_CANCELED" ||
  error?.name === "CanceledError" ||
  error?.message === "canceled";

export const handleApiError = (error, defaultMessage = "Error en la solicitud") => {
  const message = parseApiError(error, defaultMessage);
  console.error("[handleApiError]", message, error);
  return new Error(message);
};

/**
 * Crea los headers base para JSON. La sesión viaja
 * en la cookie HttpOnly configurada por el backend.
 */
export const createAuthHeaders = () => ({
  "Content-Type": "application/json",
  Accept: "application/json",
});

/**
 * Crea una instancia de axios configurada con credenciales y token CSRF
 * para métodos mutadores.
 * @param {boolean} withCredentials - Si se deben incluir credenciales
 * @returns {AxiosInstance} - Instancia configurada de axios
 */
export const createApiInstance = (withCredentials = true) => {
  const instance = axios.create({
    baseURL: getApiUrl(),
    headers: createAuthHeaders(),
    withCredentials: withCredentials,
    timeout: 60000,
  });

  instance.interceptors.request.use(
    (config) => applySessionCsrf(config),
    (error) => Promise.reject(error),
  );

  instance.interceptors.response.use(
    (response) => {
      reportBackendAvailable("http");
      return response;
    },
    async (error) => {
      if (isRequestCanceled(error)) {
        return Promise.reject(error);
      }

      const config = error.config;
      const csrfRetry = await recoverCsrfAndRetry(instance, error);
      if (csrfRetry) return csrfRetry;

      if (
        isWakeUpError(error) &&
        (!config._retryCount || config._retryCount < 2)
      ) {
        config._retryCount = (config._retryCount || 0) + 1;
        await wait(config._retryCount * 1500);
        return instance(config);
      }
      if (error.response && error.response.status === 401) {
        window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      } else if (!error.response || isWakeUpError(error)) {
        reportBackendUnavailable("http", error.message);
      }
      return Promise.reject(error);
    },
  );

  return instance;
};
