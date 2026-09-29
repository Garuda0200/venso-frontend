export type SourceVoucherKind = "image" | "pdf" | "document";

export interface SourceVoucherMedia {
  version?: number;
  mediaAssetId?: string;
  url: string;
  tigrisUrl?: string;
  originalName?: string;
  contentType?: string;
  sizeBytes?: number;
  uploadedAt?: string;
  uploadedBy?: string;
  origin?: string;
}

export const SOURCE_VOUCHER_MAX_BYTES = 25 * 1024 * 1024;

const clean = (value: unknown) => String(value ?? "").trim();

export const normalizeSourceVoucher = (value: any): SourceVoucherMedia | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const url = clean(value.url || value.tigrisUrl || value.tigris_url);
  if (!url) return null;
  return {
    version: Number(value.version || 1),
    mediaAssetId: clean(value.mediaAssetId || value.media_asset_id) || undefined,
    url,
    tigrisUrl: clean(value.tigrisUrl || value.tigris_url || url) || url,
    originalName: clean(value.originalName || value.original_name || value.filename) || "Voucher de origen",
    contentType: clean(value.contentType || value.content_type || value.mimeType || value.mime_type),
    sizeBytes: Number(value.sizeBytes || value.size_bytes || 0) || undefined,
    uploadedAt: clean(value.uploadedAt || value.uploaded_at) || undefined,
    uploadedBy: clean(value.uploadedBy || value.uploaded_by) || undefined,
    origin: clean(value.origin) || undefined,
  };
};

export const isValidSourceVoucher = (value: unknown) => Boolean(normalizeSourceVoucher(value));

export const resolveVoucherMediaForFile = (canonicalValue: any, legacyValue: any) => {
  const canonical = normalizeSourceVoucher(canonicalValue);
  if (canonical) {
    return { media: canonical, canonicalLinked: true };
  }
  return {
    media: normalizeSourceVoucher(legacyValue),
    canonicalLinked: false,
  };
};

export const getSourceVoucherKind = (value: unknown): SourceVoucherKind => {
  const voucher = normalizeSourceVoucher(value);
  if (!voucher) return "document";
  const mime = clean(voucher.contentType).toLowerCase();
  const names = [voucher.originalName, voucher.url]
    .map((candidate) => clean(candidate).toLowerCase().split(/[?#]/)[0])
    .filter(Boolean);
  if (mime.startsWith("image/") || names.some((name) => /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name))) return "image";
  if (mime === "application/pdf" || names.some((name) => name.endsWith(".pdf"))) return "pdf";
  return "document";
};

export const validateSourceVoucherFile = (file: Pick<File, "name" | "size"> | null | undefined) => {
  if (!file) return "Selecciona el voucher o documento de origen.";
  if (!clean(file.name)) return "El archivo debe tener un nombre válido.";
  if (Number(file.size || 0) <= 0) return "El archivo seleccionado está vacío.";
  if (Number(file.size || 0) > SOURCE_VOUCHER_MAX_BYTES) return "El archivo supera el límite de 25 MB.";
  return "";
};

export const buildSourceVoucherMedia = (
  upload: any,
  uploadedBy?: string,
  origin = "reservas",
): SourceVoucherMedia | null => {
  const url = clean(upload?.tigrisUrl || upload?.url);
  if (!url) return null;
  const metadata = upload?.metadata || {};
  return normalizeSourceVoucher({
    version: 1,
    url,
    tigrisUrl: url,
    originalName: metadata.originalName || metadata.original_name,
    contentType: metadata.contentType || metadata.content_type,
    sizeBytes: metadata.sizeBytes || metadata.size_bytes,
    uploadedAt: metadata.uploadedAt || metadata.uploaded_at,
    uploadedBy,
    origin,
  });
};
