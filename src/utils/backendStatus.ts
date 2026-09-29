const BACKEND_STATUS_EVENT = "backend:status";

const dispatchBackendStatus = (detail) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(BACKEND_STATUS_EVENT, {
      detail: {
        available: Boolean(detail.available),
        source: detail.source || "unknown",
        reason: detail.reason || null,
        at: detail.at || new Date().toISOString(),
      },
    }),
  );
};

export const reportBackendAvailable = (source = "unknown") => {
  dispatchBackendStatus({ available: true, source });
};

export const reportBackendUnavailable = (source = "unknown", reason = null) => {
  dispatchBackendStatus({ available: false, source, reason });
};

export { BACKEND_STATUS_EVENT };
