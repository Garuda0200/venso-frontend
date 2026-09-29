import { createApiInstance } from "../utils/apiUtils";
import { invalidateCotizacionGraphCache } from "../utils/cacheInvalidation";

const BASE_URL = "/turismo/cotizacion-edit-requests";
const COTIZACION_BASE_URL = "/turismo/cotizaciones";
const getApi = () => createApiInstance(true);

const unwrapData = (response) => response?.data?.data ?? response?.data ?? null;

export const postSaleEditService = {
  async create(cotizacionId, reason) {
    const response = await getApi().post(`${BASE_URL}/${cotizacionId}`, { reason });
    return unwrapData(response);
  },

  async listMine() {
    const response = await getApi().get(`${BASE_URL}/mine`, {
      _skipDedup: true,
    });
    return Array.isArray(response?.data?.data) ? response.data.data : [];
  },

  async getMine(cotizacionId) {
    const response = await getApi().get(`${BASE_URL}/mine/${cotizacionId}`, {
      _skipDedup: true,
      params: { _ts: Date.now() },
    });
    return unwrapData(response);
  },

  async cancel(requestId) {
    const response = await getApi().post(`${BASE_URL}/${requestId}/cancel`, {});
    return unwrapData(response);
  },

  async listAll({ status = "", limit = 250 } = {}) {
    const response = await getApi().get(BASE_URL, {
      params: { ...(status ? { status } : {}), limit },
      _skipDedup: true,
    });
    return Array.isArray(response?.data?.data) ? response.data.data : [];
  },

  async approve(requestId, reason = "") {
    const response = await getApi().post(`${BASE_URL}/${requestId}/approve`, {
      reason: reason?.trim() || null,
    });
    return unwrapData(response);
  },

  async reject(requestId, reason) {
    const response = await getApi().post(`${BASE_URL}/${requestId}/reject`, {
      reason,
    });
    return unwrapData(response);
  },

  async revoke(requestId, reason) {
    const response = await getApi().post(`${BASE_URL}/${requestId}/revoke`, {
      reason,
    });
    return unwrapData(response);
  },

  async commit(cotizacionId, payload) {
    const response = await getApi().put(
      `${COTIZACION_BASE_URL}/${cotizacionId}/post-sale-commit`,
      payload,
    );
    invalidateCotizacionGraphCache({ refetchType: "all", includeVouchers: true });
    return response?.data ?? {};
  },
};

export default postSaleEditService;
