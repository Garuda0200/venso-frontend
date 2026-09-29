import { createApiInstance } from "../../../../utils/apiUtils";

const BASE_URL = "/turismo/cotizaciones";
const getApi = () => createApiInstance(true);

export const bibliaActivityService = {
  async getOperationalData() {
    const response = await getApi().get(`${BASE_URL}/biblia-actividades`, {
      _skipDedup: true,
    });
    const data = response?.data?.data ?? {};
    if (Array.isArray(data)) {
      return { quotations: data, standalone: [] };
    }
    return {
      quotations: Array.isArray(data?.quotations) ? data.quotations : [],
      standalone: Array.isArray(data?.standalone) ? data.standalone : [],
    };
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
    return response?.data;
  },

  async saveQuotationSnapshotsBatch(quotations: Array<{ id: string; biblia_actividades: Array<Record<string, any>> }>) {
    if (!quotations.length) return { success: true, updated: 0 };
    const response = await getApi().patch(`${BASE_URL}/biblia-actividades/batch`, { quotations });
    return response?.data;
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
    return response?.data?.data ?? response?.data;
  },

  async createQuotationFromStandaloneActivity(id: string, payload: { voucherCode: string; title?: string }) {
    const response = await getApi().post(
      `${BASE_URL}/biblia-actividades/independientes/${encodeURIComponent(id)}/cotizacion`,
      payload,
    );
    return response?.data?.data ?? response?.data;
  },

  async updateStandaloneActivity(id: string, cotizacionId: string | null, actividad: Record<string, any>) {
    const response = await getApi().patch(`${BASE_URL}/biblia-actividades/independientes/${id}`, {
      cotizacion_id: cotizacionId || null,
      actividad,
    });
    return response?.data?.data ?? response?.data;
  },

  async deleteStandaloneActivity(id: string) {
    const response = await getApi().delete(`${BASE_URL}/biblia-actividades/independientes/${id}`);
    return response?.data;
  },
};
