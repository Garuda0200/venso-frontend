/** Mantiene la identidad registrada del archivo a través del upload genérico. */
export const normalizeTigrisUploadResponse = (payload: any) => {
  if (!payload?.success || typeof payload?.url !== "string" || !payload.url.trim()) {
    throw new Error("Tigris no devolvió la URL del archivo subido");
  }
  const metadata = payload.metadata || {};
  const mediaAssetId = String(payload.media_asset_id || payload.mediaAssetId || "").trim();
  return {
    tigrisUrl: payload.url.trim(),
    ...(mediaAssetId ? { mediaAssetId } : {}),
    metadata: {
      originalName: metadata.original_name || metadata.originalName,
      contentType: metadata.content_type || metadata.contentType,
      sizeBytes: metadata.size_bytes ?? metadata.sizeBytes,
      uploadedAt: metadata.uploaded_at || metadata.uploadedAt,
    },
  };
};
