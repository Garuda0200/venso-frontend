import axios, { invalidateGetCache } from "../utils/axiosInstance";
import { queryClient } from "../config/queryClient";

const CACHE_PREFIX = "venso:comisiones:";
const CACHE_TTL_MS = 45_000;
const CACHE_INVALIDATED_EVENT = "comisionesCacheInvalidated";

const keyFor = (name, params = {}) =>
  `${CACHE_PREFIX}${name}:${JSON.stringify(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .sort(([a], [b]) => a.localeCompare(b)),
  )}`;

const readLocalCache = (key) => {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || Date.now() - parsed.ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
};

const writeLocalCache = (key, data) => {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // El caché de frontend es oportunista; no bloquea la UI.
  }
};

export const invalidateComisionesCache = ({ notify = true } = {}) => {
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(CACHE_PREFIX))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // noop
  }
  invalidateGetCache("/admin/comisiones");
  queryClient.invalidateQueries({ queryKey: ["ventas-dashboard", "comisiones"] });
  queryClient.invalidateQueries({ queryKey: ["admin", "comisiones"] });

  if (notify && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CACHE_INVALIDATED_EVENT));
  }
};

const getCached = async (name, endpoint, params = {}, options = {}) => {
  const cacheKey = keyFor(name, params);
  const skipCache = Boolean(options.skipCache);

  if (!skipCache) {
    const cached = readLocalCache(cacheKey);
    if (cached) return cached;
  }

  const requestParams = skipCache
    ? { ...params, force_refresh: true }
    : params;
  const response = await axios.get(endpoint, {
    params: requestParams,
    _skipDedup: skipCache,
  });
  const payload = response.data?.data ?? response.data;
  writeLocalCache(cacheKey, payload);
  return payload;
};

export const comisionesService = {
  getResumen(params = {}, options = {}) {
    return getCached("resumen", "/admin/comisiones/resumen", params, options);
  },

  getVendedores(options = {}) {
    return getCached("vendedores", "/admin/comisiones/vendedores", {}, options);
  },

  getMetaMinima(params = {}, options = {}) {
    return getCached("meta-minima", "/admin/comisiones/meta-minima", params, options);
  },

  async createMetaMinima(payload) {
    const response = await axios.post("/admin/comisiones/meta-minima", payload);
    invalidateComisionesCache();
    return response.data?.data ?? response.data;
  },

  async updateMetaMinima(id, payload) {
    const response = await axios.put(`/admin/comisiones/meta-minima/${id}`, payload);
    invalidateComisionesCache();
    return response.data?.data ?? response.data;
  },

  async deleteMetaMinima(id) {
    const response = await axios.delete(`/admin/comisiones/meta-minima/${id}`);
    invalidateComisionesCache();
    return response.data?.data ?? response.data;
  },
};

export default comisionesService;
