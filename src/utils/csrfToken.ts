// Token CSRF asociado a la cookie HttpOnly de sesión. Se mantiene en memoria
// para no exponerlo en localStorage/sessionStorage.
let _csrfToken = null;
let _csrfRefreshPromise = null;

export const setCsrfToken = (token) => {
  _csrfToken = typeof token === "string" && token.trim() ? token : null;
};

export const getCsrfToken = () => _csrfToken;

export const clearCsrfToken = () => {
  _csrfToken = null;
};

const createRefreshError = (message, status = null) => {
  const error = new Error(message);
  if (status !== null) error.status = status;
  return error;
};

/**
 * Recupera el CSRF desde la sesión server-side sin tocar la cookie HttpOnly.
 * La promesa se comparte para que varias mutaciones simultáneas no lancen
 * múltiples /auth/verify ni terminen compitiendo por el mismo estado de sesión.
 */
export const refreshCsrfToken = async (verifyUrl) => {
  if (_csrfRefreshPromise) return _csrfRefreshPromise;

  if (!verifyUrl) {
    throw createRefreshError("URL de verificación de sesión no disponible");
  }

  _csrfRefreshPromise = (async () => {
    const response = await globalThis.fetch(verifyUrl, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // El status HTTP sigue siendo suficiente para decidir la recuperación.
    }

    if (!response.ok) {
      throw createRefreshError(
        payload?.message || "No se pudo verificar la sesión",
        response.status,
      );
    }

    const token = payload?.csrf_token;
    if (typeof token !== "string" || !token.trim()) {
      throw createRefreshError("La sesión no devolvió un token CSRF válido");
    }

    setCsrfToken(token);
    return token;
  })().finally(() => {
    _csrfRefreshPromise = null;
  });

  return _csrfRefreshPromise;
};

export const ensureCsrfToken = async (verifyUrl) =>
  getCsrfToken() || refreshCsrfToken(verifyUrl);

export const isCsrfMismatchResponse = (error) => {
  if (error?.response?.status !== 403) return false;
  const payload = error.response?.data || {};
  return (
    payload.error_code === "csrf_token_mismatch" ||
    String(payload.message || "").toLowerCase().includes("csrf")
  );
};
