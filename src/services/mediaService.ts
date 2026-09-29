import axiosInstance, { invalidateGetCache } from "../utils/axiosInstance";
import { getApiUrl } from "../utils/apiUtils";
import { clearTigrisImageCache } from "../utils/tigrisImageCache";
import { clearReferenceManifestCache } from "../components/Ventas/Cotizaciones/EdicionCotizacion/utils/pdfReferenceImageMatcher";

const API_BASE = "/turismo/media/reference-images";

const backendOrigin = () => getApiUrl().replace(/\/api\/?$/, "");

export const toBackendUrl = (url) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/api/")) return `${backendOrigin()}${url}`;
  return url;
};

const normalizeMediaAsset = (asset = {}) => ({
  ...asset,
  id: asset.id,
  src: asset.src || asset.tigrisUrl || asset.tigris_url || "",
  previewSrc: toBackendUrl(
    asset.previewSrc || asset.preview_src || asset.proxyUrl || asset.proxy_url,
  ),
  proxyUrl: toBackendUrl(asset.proxyUrl || asset.proxy_url || asset.previewSrc),
  displayTitle:
    asset.displayTitle || asset.display_title || asset.title || "Imagen referencial",
  originalSrc: asset.originalSrc || asset.original_src || null,
  originalFilename: asset.originalFilename || asset.original_filename || null,
  sizeBytes: asset.sizeBytes ?? asset.size_bytes ?? 0,
  mimeType: asset.mimeType || asset.mime_type || "image/webp",
  isActive: asset.isActive ?? asset.is_active ?? true,
  createdAt: asset.createdAt || asset.created_at,
  updatedAt: asset.updatedAt || asset.updated_at,
});

export const mediaService = {
  async getReferenceImages({ includeInactive = false } = {}) {
    const response = await axiosInstance.get(API_BASE, {
      params: includeInactive ? { include_inactive: true } : undefined,
      _skipDedup: includeInactive,
    });

    const payload = response.data || {};
    const images = Array.isArray(payload.images)
      ? payload.images.map(normalizeMediaAsset)
      : [];
    const categories = Array.isArray(payload.categories) ? payload.categories : [];

    return { images, categories };
  },

  async uploadReferenceImage(file, metadata = {}, onUploadProgress) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", metadata.title || "");
    formData.append("category", metadata.category || "General");
    if (metadata.originalSrc) formData.append("originalSrc", metadata.originalSrc);

    const response = await axiosInstance.post(API_BASE, formData, {
      // El navegador define automáticamente el boundary multipart.
      onUploadProgress,
    });
    invalidateGetCache(API_BASE);
    invalidateGetCache("/turismo/media");
    clearReferenceManifestCache();
    clearTigrisImageCache();
    return normalizeMediaAsset(response.data?.data);
  },

  async uploadReferenceImagesBatch(items = [], onUploadProgress) {
    const entries = (Array.isArray(items) ? items : []).filter(
      (item) => item?.file instanceof File,
    );
    if (!entries.length) return { created: [], results: [] };

    const formData = new FormData();
    formData.append(
      "metadata",
      JSON.stringify(
        entries.map((item, index) => ({
          clientId: item.clientId || item.id || `media-${index + 1}`,
          title: item.title || "",
          category: item.category || "General",
          originalSrc: item.originalSrc || null,
        })),
      ),
    );
    entries.forEach((item) => formData.append("files", item.file));

    const response = await axiosInstance.post(`${API_BASE}/batch`, formData, {
      // El navegador define automáticamente el boundary multipart.
      onUploadProgress,
      _skipDedup: true,
    });
    invalidateGetCache(API_BASE);
    invalidateGetCache("/turismo/media");
    clearReferenceManifestCache();
    clearTigrisImageCache();

    const payload = response.data || {};
    const results = Array.isArray(payload.results)
      ? payload.results.map((result) => ({
          ...result,
          data: result?.data ? normalizeMediaAsset(result.data) : null,
        }))
      : [];
    const created = Array.isArray(payload.created)
      ? payload.created.map(normalizeMediaAsset)
      : results.filter((result) => result.success && result.data).map((result) => result.data);
    return { ...payload, results, created };
  },

  async updateReferenceImage(id, payload) {
    const response = await axiosInstance.patch(`${API_BASE}/${id}`, payload);
    invalidateGetCache(API_BASE);
    invalidateGetCache("/turismo/media");
    clearReferenceManifestCache();
    clearTigrisImageCache();
    return normalizeMediaAsset(response.data?.data);
  },

  async deleteReferenceImage(id) {
    const response = await axiosInstance.delete(`${API_BASE}/${id}`);
    invalidateGetCache(API_BASE);
    invalidateGetCache("/turismo/media");
    clearReferenceManifestCache();
    clearTigrisImageCache();
    return normalizeMediaAsset(response.data?.data);
  },
};

export default mediaService;
