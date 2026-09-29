/**
 * Flags de visibilidad exclusivamente de frontend.
 *
 * Mantener la lógica/rutas existentes permite reactivar módulos temporalmente
 * ocultos sin migraciones ni cambios de backend.
 */
export const FRONTEND_FEATURES = {
  commissionsManagement: false,
} as const;
