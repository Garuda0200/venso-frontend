import { BIBLIA_CHANGED_EVENT } from "../../../../utils/bibliaCacheEvents";
import { BibliaReadCache, type BibliaOperationalData } from "../utils/bibliaReadCache";
import { createApiInstance } from "../../../../utils/apiUtils";
import { invalidateAgenciesCache, invalidateCotizacionGraphCache } from "../../../../utils/cacheInvalidation";
import { buildBibliaPublicationRecords } from "../utils/bibliaPublication";

const BASE_URL = "/turismo/cotizaciones";
const getApi = () => createApiInstance(true);

const readCache = new BibliaReadCache<BibliaOperationalData>();
if (typeof window !== "undefined") {
  [BIBLIA_CHANGED_EVENT, "auth:logout", "auth:login", "auth:unauthorized"].forEach(event => {
    window.addEventListener(event, () => readCache.clear());
  });
}

export type BibliaReadOptions = {
  startDate?: string;
  endDate?: string;
  fileCode?: string;
  cacheScope?: string;
  forceRefresh?: boolean;
};

export const bibliaActivityService = {
  async getOperationalData(quotationId?: string, options: BibliaReadOptions = {}): Promise<BibliaOperationalData> {
    const params = {
      ...(quotationId ? { quote_id: quotationId } : {}),
      ...(options.startDate ? { start_date: options.startDate, end_date: options.endDate } : {}),
      ...(options.fileCode ? { file_code: options.fileCode } : {}),
      ...(options.forceRefresh ? { force_refresh: true } : {}),
    };
    const load = async () => {
      const response = await getApi().get(`${BASE_URL}/biblia-actividades`, { params });
      const data = response?.data?.data ?? {};
      return {
        quotations: Array.isArray(data) ? data : Array.isArray(data.quotations) ? data.quotations : [],
        standalone: Array.isArray(data.standalone) ? data.standalone : [],
      };
    };
    if (options.forceRefresh) readCache.clear();
    if (!options.cacheScope) return load();
    const key = JSON.stringify([
      options.cacheScope, quotationId, options.startDate, options.endDate, options.fileCode,
    ]);
    return readCache.get(key, load);
  },

  async setQuotationVisibility(id: string, visible: boolean) {
    let payload: Record<string, any> = { visible };
    if (visible) {
      const data = await this.getOperationalData(id);
      const quote = data.quotations.find(item => String(item.id) === id);
      if (!quote) throw new Error("No se encontró el file. Actualiza el listado e inténtalo nuevamente.");
      payload = { visible, expected_version: quote.current_version,
        expected_records: quote.biblia_actividades,
        records: buildBibliaPublicationRecords(quote, data.standalone) };
    }
    const response = await getApi().patch(`${BASE_URL}/${encodeURIComponent(id)}/biblia-visibilidad`, payload);
    invalidateCotizacionGraphCache();
    return response?.data?.data;
  },

  // Compatibilidad transitoria para aplicar 017 antes de 018 sin romper la
  // pantalla anterior. 018 migra Calendario a getOperationalData().
  async getOperationalQuotations() {
    const data = await this.getOperationalData();
    return data.quotations;
  },

  async saveQuotationOverrides(quotationId: string, records: Array<Record<string, any>>) {
    const response = await getApi().patch(`${BASE_URL}/${quotationId}/biblia-actividades`, {
      biblia_actividades: records,
    });
    if (response?.data?.data?.synchronized_records > 0) invalidateCotizacionGraphCache();
    return response?.data;
  },

  async saveQuotationSnapshotsBatch(quotations: Array<{ id: string; biblia_actividades: Array<Record<string, any>> }>) {
    if (!quotations.length) return { success: true, updated: 0 };
    const response = await getApi().patch(`${BASE_URL}/biblia-actividades/batch`, { quotations });
    return response?.data;
  },


  async recommendTours(actividad: Record<string, any>, quotationId?: string | null, signal?: AbortSignal) {
    const response = await getApi().post(`${BASE_URL}/biblia-actividades/excursiones`, {
      actividad, cotizacion_id: quotationId || null,
    }, { signal });
    return response?.data?.data || [];
  },

  async createBibliaFile(payload: {
    title?: string;
    startDate: string;
    days: number;
    pax?: number;
    packageType?: string;
    agencyId?: number;
    sourceVoucher?: Record<string, any> | null;
  }) {
    const response = await getApi().post(`${BASE_URL}/biblia-actividades/files`, payload);
    return response?.data?.data ?? response?.data;
  },

  async softDeleteQuotationActivity(quotationId: string, recordId: string) {
    const response = await getApi().delete(
      `${BASE_URL}/${quotationId}/biblia-actividades/${encodeURIComponent(recordId)}`,
    );
    return response?.data;
  },

  async createStandaloneActivity(cotizacionId: string | null, actividad: Record<string, any>) {
    const response = await getApi().post(`${BASE_URL}/biblia-actividades/independientes`, {
      cotizacion_id: cotizacionId || null,
      actividad,
    });
    if (response?.data?.data?.cotizacion_id) invalidateCotizacionGraphCache();
    return response?.data?.data ?? response?.data;
  },

  async createQuotationFromStandaloneActivity(id: string, payload: { voucherCode: string; title?: string }) {
    const response = await getApi().post(
      `${BASE_URL}/biblia-actividades/independientes/${encodeURIComponent(id)}/cotizacion`,
      payload,
    );
    await invalidateAgenciesCache();
    invalidateCotizacionGraphCache();
    return response?.data?.data ?? response?.data;
  },

  async updateStandaloneActivity(id: string, cotizacionId: string | null, actividad: Record<string, any>) {
    const response = await getApi().patch(`${BASE_URL}/biblia-actividades/independientes/${id}`, {
      cotizacion_id: cotizacionId || null,
      actividad,
    });
    if (response?.data?.data?.service_count != null || response?.data?.data?.cotizacion_id) invalidateCotizacionGraphCache();
    return response?.data?.data ?? response?.data;
  },

  async deleteStandaloneActivity(id: string) {
    const response = await getApi().delete(`${BASE_URL}/biblia-actividades/independientes/${id}`);
    return response?.data;
  },
};
