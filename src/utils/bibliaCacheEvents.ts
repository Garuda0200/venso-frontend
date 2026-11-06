/** Shared by both HTTP clients so every successful write invalidates Biblia. */
export const BIBLIA_CHANGED_EVENT = "biblia:changed";
const MUTATING_METHODS = new Set(["post", "put", "patch", "delete"]);

export const isBibliaMutation = (response: any): boolean => {
  const method = String(response?.config?.method || "").toLowerCase();
  if (!MUTATING_METHODS.has(method) || response.status < 200 || response.status >= 300) return false;
  const path = String(response.config.url || "").split("?")[0];
  if (path.endsWith("/biblia-actividades/excursiones")) return false;
  return /(?:^|\/)turismo(?:\/|$)/.test(path)
    || /(?:^|\/)(?:upload|media)(?:\/|$)/.test(path);
};

export const notifyBibliaMutation = (response: any) => {
  if (typeof window !== "undefined" && isBibliaMutation(response)) {
    window.dispatchEvent(new CustomEvent(BIBLIA_CHANGED_EVENT));
  }
};
