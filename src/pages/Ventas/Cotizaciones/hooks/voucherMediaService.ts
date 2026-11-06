import { createApiInstance } from "../../../../utils/apiUtils";
import { invalidateCotizacionGraphCache } from "../../../../utils/cacheInvalidation";
import type {
  PublishVoucherMediaVersion, VoucherMediaChange, VoucherMediaHistory, VoucherMediaMutation,
} from "../utils/voucherMediaHistory";

const root = (id: string | number) => `/turismo/cotizaciones/${encodeURIComponent(String(id))}/voucher-media`;

export const VOUCHER_MEDIA_CHANGED = "venso:voucher-media-changed";

const changed = (id: string | number) => {
  invalidateCotizacionGraphCache();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(VOUCHER_MEDIA_CHANGED, { detail: { quotationId: String(id) } }));
  }
};

export const voucherMediaService = {
  async history(id: string | number, beforeVersion?: number, signal?: AbortSignal): Promise<VoucherMediaHistory> {
    const response = await createApiInstance().get(`${root(id)}/versions`, {
      params: beforeVersion ? { beforeVersion } : undefined, signal,
      headers: { "Cache-Control": "no-cache" },
    });
    return response.data;
  },
  async publish(id: string | number, request: PublishVoucherMediaVersion): Promise<VoucherMediaChange> {
    const response = await createApiInstance().post(`${root(id)}/versions`, request);
    changed(id);
    return response.data;
  },
  async restore(id: string | number, versionId: string, request: VoucherMediaMutation): Promise<VoucherMediaChange> {
    const response = await createApiInstance().post(`${root(id)}/versions/${encodeURIComponent(versionId)}/restore`, request);
    changed(id);
    return response.data;
  },
  async detach(id: string | number, request: VoucherMediaMutation): Promise<VoucherMediaChange> {
    const response = await createApiInstance().delete(root(id), { data: request });
    changed(id);
    return response.data;
  },
  async operation(id: string | number, operationId: string): Promise<VoucherMediaChange> {
    const response = await createApiInstance().get(`${root(id)}/operations/${encodeURIComponent(operationId)}`);
    changed(id);
    return response.data;
  },
  async download(path: string): Promise<Blob> {
    if (!/^\/turismo\/cotizaciones\/[^/]+\/voucher-media\/versions\/[^/]+\/download$/.test(path)) {
      throw new Error("El documento no tiene una versión descargable. Actualiza su file.");
    }
    const response = await createApiInstance().get(path, { responseType: "blob" });
    return response.data;
  },
};
