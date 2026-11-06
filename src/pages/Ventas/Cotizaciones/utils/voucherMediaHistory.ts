import type { SourceVoucherMedia } from "./sourceVoucher";

export type VoucherMediaVersion = {
  id: string;
  versionNumber: number;
  mediaAssetId: string;
  baseVersionId?: string | null;
  restoredFromVersionId?: string | null;
  origin: string;
  media: SourceVoucherMedia;
  sha256?: string | null;
  note?: string | null;
  createdAt: string;
  createdBy?: string | null;
  createdByName?: string | null;
};

export type VoucherMediaHistory = {
  cotizacionId: string;
  revision: number;
  voucherMedia: SourceVoucherMedia | null;
  currentVersionId: string | null;
  versions: VoucherMediaVersion[];
  nextBeforeVersion: number | null;
  capabilities: { canManage: boolean; canDownload: boolean };
};

export type VoucherMediaMutation = {
  operationId: string;
  expectedRevision: number;
};

export type PublishVoucherMediaVersion = VoucherMediaMutation & {
  mediaAssetId: string;
  baseVersionId?: string | null;
  origin: "upload" | "external_edit";
  note?: string;
};

export type VoucherMediaChange = {
  cotizacionId: string;
  revision: number;
  voucherMedia: SourceVoucherMedia | null;
  operationId: string;
  resultVersionId: string | null;
  replayed: boolean;
};

const origins: Record<string, string> = {
  upload: "Archivo subido",
  external_edit: "Edición externa",
  restore: "Restauración",
  legacy_import: "Archivo anterior",
  clone: "Cotización duplicada",
  snapshot_restore: "Restauración de cotización",
};

export const voucherMediaOrigin = (origin: string) => origins[origin] || "Archivo del file";

export const voucherMediaFormat = (media: SourceVoucherMedia) => {
  const extension = media.originalName?.split(".").at(-1)?.toUpperCase();
  return extension && extension.length < 8 ? extension : "Documento";
};

export const isWordVoucher = (media: SourceVoucherMedia | null) =>
  Boolean(media && (/\.docx?$/i.test(media.originalName || "") || /msword|wordprocessingml/.test(media.contentType || "")));

export const voucherMediaDownloadPath = (media: SourceVoucherMedia | null) => {
  if (!media?.cotizacionId || !media.documentVersionId) return "";
  return `/turismo/cotizaciones/${encodeURIComponent(media.cotizacionId)}/voucher-media/versions/${encodeURIComponent(media.documentVersionId)}/download`;
};

export const mediaMutationId = () => globalThis.crypto.randomUUID();

export const mediaErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.message || error?.message || fallback;

export const resolveVoucherMediaOperation = async <T>(
  operation: () => Promise<T>,
  lookup: () => Promise<T>,
): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    // A transport or server error can follow a successful database commit.
    if (!error?.response || error.response.status >= 500) {
      try { return await lookup(); } catch { /* Keep the operation for a retry. */ }
    }
    throw error;
  }
};
