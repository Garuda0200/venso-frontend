import {
  BACKEND_STATUS_EVENT,
  reportBackendAvailable,
  reportBackendUnavailable,
} from "./backendStatus";

/**
 * Un único ciclo de activación para el backend autosuspendido.
 *
 * La petición siempre se realiza al origen del frontend (/api/health). Nginx
 * la reenvía al backend a través del proxy de Fly, que es el componente que
 * puede iniciar una Machine suspendida. No hay temporizador persistente: cada
 * carga, navegación, vuelta a primer plano u orden manual puede iniciar como
 * máximo un ciclo acotado y las llamadas simultáneas comparten la misma promesa.
 */

export type BackendWakeReason =
  | "bootstrap"
  | "route"
  | "visibility"
  | "online"
  | "manual";

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const WAKE_PATH = import.meta.env.VITE_BACKEND_WAKE_PATH || "/api/health";
const WAKE_TIMEOUT_MS = parsePositiveInt(
  import.meta.env.VITE_BACKEND_WAKE_TIMEOUT_MS,
  30_000,
);
const MAX_WAKE_ATTEMPTS = parsePositiveInt(
  import.meta.env.VITE_BACKEND_WAKE_MAX_ATTEMPTS,
  4,
);
const WAKE_RETRY_COOLDOWN_MS = parsePositiveInt(
  import.meta.env.VITE_BACKEND_WAKE_RETRY_COOLDOWN_MS,
  10_000,
);
// Un 502 de Fly puede llegar antes de que la Machine termine de arrancar.
// Este presupuesto deja 30 s entre el primer y el último intento sin crear un
// polling persistente: 0 s, 2 s, 8 s y 20 s.
const RETRY_DELAYS_MS = [0, 2_000, 8_000, 20_000];

let backendReady = false;
let wakeInFlight: Promise<boolean> | null = null;
let exhaustedAt = 0;

// A successful wake only confirms the state at that moment. If Axios or an
// auth request subsequently reports a 5xx/network failure, allow the next
// user-driven route/visibility/online event to start another bounded cycle.
export const markBackendWakeUnavailable = () => {
  backendReady = false;
};

if (typeof window !== "undefined") {
  window.addEventListener(BACKEND_STATUS_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<{ available?: boolean }>).detail;
    if (detail?.available === false) {
      markBackendWakeUnavailable();
    }
  });
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const resolveWakeUrl = () => {
  const url = new URL(WAKE_PATH, window.location.origin);

  // El wake debe atravesar el proxy same-origin. Esto evita CORS y garantiza
  // que una visita al frontend pueda despertar la Machine del backend.
  if (url.origin !== window.location.origin) {
    return new URL("/api/health", window.location.origin);
  }

  return url;
};

const canStartNewCycle = (reason: BackendWakeReason) => {
  if (!exhaustedAt) return true;
  if (reason === "manual") return true;

  return Date.now() - exhaustedAt >= WAKE_RETRY_COOLDOWN_MS;
};

const isRecoverableStatus = (status: number) =>
  status === 408 || status === 425 || status === 429 || status >= 500;

const performWake = async (reason: BackendWakeReason) => {
  let lastFailure = "El backend no respondió durante la activación.";

  for (let attempt = 0; attempt < MAX_WAKE_ATTEMPTS; attempt += 1) {
    const retryDelay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1) ?? 0;
    if (retryDelay > 0) {
      await delay(retryDelay);
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), WAKE_TIMEOUT_MS);

    try {
      const url = resolveWakeUrl();
      url.searchParams.set("_wake", String(Date.now()));

      const response = await fetch(url.toString(), {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json, text/plain;q=0.9" },
        signal: controller.signal,
      });

      if (response.ok) {
        backendReady = true;
        exhaustedAt = 0;
        reportBackendAvailable(`frontend-wake:${reason}`);
        return true;
      }

      lastFailure = `El backend respondió con estado ${response.status}.`;
      if (!isRecoverableStatus(response.status)) {
        break;
      }
    } catch (error) {
      lastFailure =
        error instanceof DOMException && error.name === "AbortError"
          ? "El backend tardó demasiado en iniciar."
          : "No se pudo contactar al backend durante la activación.";
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  exhaustedAt = Date.now();
  reportBackendUnavailable(`frontend-wake:${reason}`, lastFailure);
  return false;
};

export const wakeBackend = (reason: BackendWakeReason = "bootstrap") => {
  if (backendReady) {
    return Promise.resolve(true);
  }

  if (wakeInFlight) {
    return wakeInFlight;
  }

  if (!canStartNewCycle(reason)) {
    return Promise.resolve(false);
  }

  wakeInFlight = performWake(reason).finally(() => {
    wakeInFlight = null;
  });

  return wakeInFlight;
};

export const resetBackendWakeForTests = () => {
  markBackendWakeUnavailable();
  wakeInFlight = null;
  exhaustedAt = 0;
};
