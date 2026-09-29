export const POST_SALE_EDIT_STATUSES = Object.freeze({
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  REVOKED: "REVOKED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  CONSUMED: "CONSUMED",
  CONFLICT: "CONFLICT",
});

export const normalizePostSaleEditStatus = (value) =>
  String(value || "").trim().toUpperCase();

export const normalizeUserRole = (role) => {
  if (role === null || role === undefined || role === "") return null;
  const parsed = Number(role);
  return Number.isInteger(parsed) ? parsed : null;
};

export const canManagePostSaleEditRequests = (role) =>
  normalizeUserRole(role) === 0;

export const canRequestPostSaleEdit = ({ role, actorDni, ownerDni }) => {
  const normalizedRole = normalizeUserRole(role);
  if (normalizedRole === 0) return true;
  if (normalizedRole !== 2) return false;
  const actor = String(actorDni || "").trim();
  const owner = String(ownerDni || "").trim();
  return Boolean(actor) && actor === owner;
};

export const isApprovalExpired = (request, now = Date.now()) => {
  if (!request?.expires_at) return true;
  const expiresAt = Date.parse(request.expires_at);
  return !Number.isFinite(expiresAt) || expiresAt <= now;
};

const hasIntegerVersion = (value) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isInteger(Number(value));

export const isApprovedAndUsable = (request, now = Date.now()) =>
  normalizePostSaleEditStatus(request?.status) === POST_SALE_EDIT_STATUSES.APPROVED &&
  Boolean(request?.approval_nonce) &&
  hasIntegerVersion(request?.approved_version) &&
  !isApprovalExpired(request, now);

export const isApprovalValidForSnapshot = (request, cotizacion, now = Date.now()) => {
  if (!isApprovedAndUsable(request, now)) return false;
  const rawSnapshotVersion =
    cotizacion?.current_version ?? cotizacion?.currentVersion;
  if (!hasIntegerVersion(rawSnapshotVersion)) return false;
  const approvedVersion = Number(request?.approved_version);
  const snapshotVersion = Number(rawSnapshotVersion);
  return (
    Number.isInteger(approvedVersion) &&
    Number.isInteger(snapshotVersion) &&
    approvedVersion === snapshotVersion
  );
};

export const isPending = (request) =>
  normalizePostSaleEditStatus(request?.status) === POST_SALE_EDIT_STATUSES.PENDING;

export const canCancelRequest = (request) => isPending(request);

export const canCreateNewRequest = (request, now = Date.now()) => {
  if (!request) return true;
  if (isPending(request)) return false;
  if (isApprovedAndUsable(request, now)) return false;
  return true;
};

export const getRemainingApprovalSeconds = (request, now = Date.now()) => {
  const expiresAt = Date.parse(request?.expires_at || "");
  if (!Number.isFinite(expiresAt)) return 0;
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
};

export const formatRemainingApprovalTime = (request, now = Date.now()) => {
  const totalSeconds = getRemainingApprovalSeconds(request, now);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export const indexLatestRequestsByCotizacion = (requests = []) => {
  const map = {};
  for (const request of Array.isArray(requests) ? requests : []) {
    const key = String(request?.cotizacion_id || "");
    if (!key) continue;
    const existing = map[key];
    const requestedAt = Date.parse(request?.requested_at || "") || 0;
    const existingAt = Date.parse(existing?.requested_at || "") || 0;
    if (!existing || requestedAt >= existingAt) map[key] = request;
  }
  return map;
};

export const getRequestUiState = (request, now = Date.now()) => {
  if (!request) {
    return { key: "NONE", label: "Solicitar edición", tone: "neutral", canEdit: false, canRequest: true };
  }
  const status = normalizePostSaleEditStatus(request.status);
  if (status === POST_SALE_EDIT_STATUSES.PENDING) {
    return { key: status, label: "Pendiente de aprobación", tone: "warning", canEdit: false, canRequest: false };
  }
  if (status === POST_SALE_EDIT_STATUSES.APPROVED) {
    if (isApprovedAndUsable(request, now)) {
      return { key: status, label: "Edición aprobada", tone: "success", canEdit: true, canRequest: false };
    }
    return { key: POST_SALE_EDIT_STATUSES.EXPIRED, label: "Autorización expirada", tone: "muted", canEdit: false, canRequest: true };
  }
  const labels = {
    REJECTED: "Solicitud rechazada",
    REVOKED: "Autorización revocada",
    CANCELLED: "Solicitud cancelada",
    EXPIRED: "Autorización expirada",
    CONSUMED: "Autorización utilizada",
    CONFLICT: "Solicitud en conflicto",
  };
  return {
    key: status || "UNKNOWN",
    label: labels[status] || "Solicitar nueva edición",
    tone: status === "REJECTED" || status === "CONFLICT" ? "danger" : "muted",
    canEdit: false,
    canRequest: true,
  };
};

export const buildPostSaleCommitPayload = ({ request, cotizacion, passengers }) => {
  if (!isApprovedAndUsable(request)) {
    throw new Error("La autorización postventa no está vigente");
  }
  return {
    request_id: request.id,
    nonce: request.approval_nonce,
    expected_version: Number(request.approved_version),
    cotizacion,
    passengers,
  };
};
