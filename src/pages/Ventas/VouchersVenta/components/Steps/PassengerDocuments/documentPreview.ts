import { getProxyUrl, makeProxyUrlAbsolute } from "../../../../../../services/presignedUrlService";

export function getDocumentPreviewUrl(doc = {}) {
  if (doc.dataUrl) {
    return String(doc.dataUrl).startsWith("/api/upload/tigris/proxy")
      ? makeProxyUrlAbsolute(doc.dataUrl)
      : doc.dataUrl;
  }
  const proxyUrl = doc.proxyUrl || doc.proxy_url;
  if (proxyUrl) return makeProxyUrlAbsolute(proxyUrl);
  const tigrisUrl = doc.tigrisUrl || doc.tigris_url;
  if (tigrisUrl) return getProxyUrl(tigrisUrl);
  return doc.url || null;
}

export const getDocumentFilename = (doc = {}) => doc.name || doc.filename || doc.fileName || "documento";
export const getDocumentMimeType = (doc = {}) =>
  doc.type || doc.fileType || doc.file_type || doc.mimeType || doc.mime_type || "application/octet-stream";
