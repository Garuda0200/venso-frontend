/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_TIMEOUT?: string;
  readonly VITE_BACKEND_WAKE_PATH?: string;
  readonly VITE_BACKEND_WAKE_TIMEOUT_MS?: string;
  readonly VITE_BACKEND_WAKE_MAX_ATTEMPTS?: string;
  readonly VITE_BACKEND_WAKE_RETRY_COOLDOWN_MS?: string;
  readonly VITE_TURISMO_CACHE_TTL_MS?: string;
  readonly VITE_EXCHANGE_RATE?: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_PLATFORM?: string;
  readonly VITE_BRAND_WEBSITE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
