/** Public visibility flag only. Backend capabilities still authorize every operation. */
export const isDocumentAiUiEnabled = (environment = {}) =>
  environment?.VITE_DOCUMENT_AI_UI === "true";
