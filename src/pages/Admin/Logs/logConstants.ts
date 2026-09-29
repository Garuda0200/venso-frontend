/**
 * Constantes centralizadas para el módulo de Logs.
 * Entidades, operaciones, mapas de labels en español.
 */

// ============== TIPOS DE OPERACIÓN ==============

export const OPERATION_TYPES = [
  { label: "Todas", value: "" },
  { label: "Crear", value: "CREATE" },
  { label: "Actualizar", value: "UPDATE" },
  { label: "Duplicar", value: "DUPLICATE" },
  { label: "Eliminar", value: "DELETE" },
  { label: "Login", value: "LOGIN" },
  { label: "Logout", value: "LOGOUT" },
];

// ============== TIPOS DE ENTIDAD ==============

export const ENTITY_TYPES = [
  { label: "Todas", value: "" },
  // Usuarios y sesiones
  { label: "Usuario", value: "user_account" },
  { label: "Sesión", value: "session" },
  // Ventas
  { label: "Cotización", value: "cotizacion" },
  { label: "Voucher Venta", value: "voucher_venta" },
  { label: "Voucher Reserva", value: "voucher_reserva" },
  // Turismo - Servicios padres
  { label: "Hotel", value: "hotel" },
  { label: "Restaurante", value: "restaurante" },
  { label: "Transporte", value: "transporte" },
  { label: "Guía", value: "guia" },
  { label: "Endose", value: "endose" },
  { label: "Tren", value: "tren" },
  { label: "Vuelos", value: "vuelos" },
  { label: "Persona", value: "persona" },
  // Turismo - Servicios hijos
  { label: "Habitación", value: "habitacion" },
  { label: "Tour", value: "tour" },
  { label: "Ruta", value: "ruta" },
  { label: "Movilidad", value: "movilidad" },
  { label: "Vagones", value: "vagones" },
  { label: "Tipo Vuelo", value: "tipo_vuelo" },
  { label: "Tickets", value: "tickets" },
  { label: "Tarifa", value: "tarifa" },
  // Paquetes y contabilidad
  { label: "Paquete Turístico", value: "paquete_turistico" },
  { label: "Itinerario Paquete", value: "paquete_turistico_itinerario" },
  { label: "Transferencia", value: "transferencia_interna" },
  { label: "Saldo", value: "saldo" },
  { label: "Movimiento", value: "movimiento" },
  // Sistema
  { label: "Logs del Sistema", value: "system_logs" },
  { label: "Sistema", value: "system" },
];

// ============== MAPAS DE LABELS ==============

/** Mapa entity_type → label en español */
export const ENTITY_LABEL_MAP = ENTITY_TYPES.reduce((acc, et) => {
  if (et.value) acc[et.value] = et.label;
  return acc;
}, {});

/** Mapa operation_type → label en español */
export const OPERATION_LABEL_MAP = {
  CREATE: "Crear",
  UPDATE: "Actualizar",
  DUPLICATE: "Duplicar",
  DELETE: "Eliminar",
  LOGIN: "Login",
  LOGOUT: "Logout",
  READ: "Lectura",
};

// ============== COLORES PARA OPERACIONES (usados en exports) ==============

export const OPERATION_COLORS = {
  CREATE: { bg: "FFE8F5E9", font: "FF2E7D32", label: "Crear" },
  UPDATE: { bg: "FFFFF3E0", font: "FFE65100", label: "Actualizar" },
  DUPLICATE: { bg: "FFE3F2FD", font: "FF1565C0", label: "Duplicar" },
  DELETE: { bg: "FFFFEBEE", font: "FFC62828", label: "Eliminar" },
  LOGIN: { bg: "FFF3E5F5", font: "FF6A1B9A", label: "Login" },
  LOGOUT: { bg: "FFECEFF1", font: "FF37474F", label: "Logout" },
  READ: { bg: "FFE8EAF6", font: "FF283593", label: "Lectura" },
};

// ============== COLORES PARA ENTIDADES (usados en exports) ==============

export const ENTITY_COLORS = {
  user_account: { bg: "FFE1F5FE", font: "FF0277BD" },
  session: { bg: "FFF3E5F5", font: "FF6A1B9A" },
  cotizacion: { bg: "FFFFF8E1", font: "FFFF8F00" },
  voucher_venta: { bg: "FFE8F5E9", font: "FF2E7D32" },
  voucher_reserva: { bg: "FFE0F2F1", font: "FF00695C" },
  hotel: { bg: "FFFCE4EC", font: "FFC62828" },
  restaurante: { bg: "FFFFF3E0", font: "FFE65100" },
  transporte: { bg: "FFE8EAF6", font: "FF283593" },
  paquete_turistico: { bg: "FFF1F8E9", font: "FF33691E" },
};

// ============== PAGINACIÓN POR DEFECTO ==============

export const DEFAULT_LAZY_PARAMS = {
  first: 0,
  rows: 20,
  page: 0,
  sortField: "action_timestamp",
  sortOrder: -1,
};

export const DEFAULT_FILTERS = {
  dniuser: "",
  operation: "",
  entity: "",
  dateFrom: null,
  dateTo: null,
};

// ============== ROLES DE USUARIO ==============

export const ROLE_LABEL_MAP = {
  0: "Super Admin",
  1: "Admin",
  2: "Ventas",
  3: "Reservas",
  4: "Contabilidad",
};

export const ROLE_COLORS = {
  0: { bg: "FFEDE7F6", font: "FF4A148C", severity: "danger" }, // Morado
  1: { bg: "FFE3F2FD", font: "FF0D47A1", severity: "info" }, // Azul
  2: { bg: "FFE8F5E9", font: "FF1B5E20", severity: "success" }, // Verde
  3: { bg: "FFFFF3E0", font: "FFE65100", severity: "warning" }, // Naranja
  4: { bg: "FFFCE4EC", font: "FF880E4F", severity: null }, // Rosa
};

// ============== COLUMNAS DEL EXCEL ==============

export const EXCEL_COLUMNS = [
  { header: "Fecha y Hora", key: "action_timestamp", width: 22 },
  { header: "Operación", key: "operation_type", width: 16 },
  { header: "Entidad", key: "entity_type", width: 20 },
  { header: "ID Entidad", key: "entity_id", width: 14 },
  { header: "DNI Usuario", key: "dniuser", width: 14 },
  { header: "Nombre Completo", key: "user_fullname", width: 30 },
  { header: "Rol", key: "user_role", width: 16 },
  { header: "Estado", key: "status", width: 12 },
  { header: "Error", key: "error_details", width: 30 },
];
