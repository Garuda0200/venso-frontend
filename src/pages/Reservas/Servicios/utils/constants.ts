/**
 * Estados comunes para todos los servicios
 */
export const ESTADOS_SERVICIO = [
  "disponible",
  "reservado",
  "confirmado",
  "cancelado",
  "completado",
  "mantenimiento",
  "inactivo",
];

/**
 * Lista de estados para selects y dropdowns
 */
export const LISTA_ESTADOS = Object.values(ESTADOS_SERVICIO);

/**
 * Tipos de servicios para la tabla de tarifas
 */
export const TIPOS_SERVICIO = {
  HABITACION: "habitacion",
  MOVILIDAD: "movilidad",
  TICKETS: "tickets",
  RESTAURANTE: "restaurante",
  TOUR: "tour",
  RUTA: "ruta",
  VAGONES: "vagones",
  TIPO_VUELO: "tipo_vuelo",
};

/**
 * Tipos de tarifas disponibles
 */
export const TIPOS_TARIFA = {
  INTERNA: "interna",
  EXTERNA: "externa",
  COTIZACION: "cotizacion",
};

/**
 * Temporadas disponibles para tarifas
 */
export const TEMPORADAS = {
  ALTA: "alta",
  BAJA: "baja",
  ESTANDAR: null, // Valor null para temporada estándar (sin temporada)
};

/**
 * Configuración de colores para las badges según estado
 */
export const BADGE_COLORS = {
  [ESTADOS_SERVICIO.DISPONIBLE]: "success",
  [ESTADOS_SERVICIO.RESERVADO]: "primary",
  [ESTADOS_SERVICIO.CONFIRMADO]: "primary",
  [ESTADOS_SERVICIO.CANCELADO]: "danger",
  [ESTADOS_SERVICIO.COMPLETADO]: "info",
  [ESTADOS_SERVICIO.MANTENIMIENTO]: "warning",
  [ESTADOS_SERVICIO.INACTIVO]: "secondary",
};

/**
 * Tipos comunes de habitación
 */
export const TIPOS_HABITACION = [
  "Simple",
  "Doble / Matrimonial",
  "Doble",
  "Matrimonial",
  "Triple",
  "Cuádruple",
  "Familiar",
  "Suite",
  "Suite Jr.",
];

/**
 * Tipos comunes de autos para movilidad
 */
export const TIPOS_AUTO = [
  "Auto",
  "Bus",
  "Cam",
  "Camioneta",
  "H1",
  "H1 / Staria",
  "Microbus",
  "Minibus",
  "Minivan",
  "No Especifica",
  "Sedán",
  "SPC",
  "SPL",
  "Sprinter corta",
  "Sprinter larga",
  "Staria",
  "SUV",
  "Van",
];

/**
 * Constantes para tipos de vuelo
 */
export const TIPOS_VUELO = {
  PRIMERA_CLASE: "Primera Clase",
  BUSINESS: "Business",
  ECONOMICA_PREMIUM: "Económica Premium",
  ECONOMICA: "Económica",
  CLASE_TURISTA: "Clase Turista",
  CLASE_EJECUTIVA: "Clase Ejecutiva",
};

/**
 * Constantes para opciones de equipaje
 */
export const OPCIONES_EQUIPAJE = {
  MALETA_CABINA: "1 maleta en cabina",
  MALETA_BODEGA_23KG: "1 maleta en bodega (23kg)",
  MALETA_BODEGA_32KG: "1 maleta en bodega (32kg)",
  DOS_MALETAS_BODEGA: "2 maletas en bodega",
  SIN_EQUIPAJE: "Sin equipaje",
};

/**
 * Constantes para formatos de fecha y hora
 */
export const FORMATO_FECHA = "yyyy-MM-dd";
export const FORMATO_HORA = "HH:mm";
export const FORMATO_FECHA_HORA = "yyyy-MM-ddTHH:mm";

/**
 * Constantes para valores por defecto
 */
export const DEFAULTS = {
  HORA_INICIAL: "08:00",
  HORA_FINAL: "18:00",
};

/**
 * Constantes para servicios
 */
export const SERVICIOS = {
  HABITACION: "habitacion",
  MOVILIDAD: "movilidad",
  TICKETS: "tickets",
  TIPO_VUELO: "tipo_vuelo",
  RESTAURANTE: "restaurante",
  TOUR: "tour",
  RUTA: "ruta",
  VAGONES: "vagones",
};

/**
 * Constantes para tipos de tour
 */
export const TIPOS_TOUR = {
  CITY_TOUR: "City Tour",
};

/**
 * Constantes para tipos de tren
 */
export const TIPOS_TREN = {
  PRIMERA_CLASE: "Primera Clase",
};

/**
 * Constantes para frecuencia de trenes
 */
export const FRECUENCIAS_TREN = [
  "Diario",
  "Semanal",
  "Quincenal",
  "Mensual",
  "Especial",
];

/**
 * Constantes para idiomas
 */
export const IDIOMAS = [
  "Español",
  "Inglés",
  "Francés",
  "Alemán",
  "Italiano",
  "Portugués",
  "Ruso",
  "Chino",
  "Japonés",
];

/**
 * Constantes para idiomas de guía
 */
export const IDIOMAS_GUIA = [
  "Español",
  "Inglés",
  "Francés",
  "Alemán",
  "Italiano",
  "Portugués",
  "Japonés",
  "Chino",
  "Ruso",
  "Árabe",
];

/**
 * Opciones de estado civil para formularios - Exactamente iguales a las restricciones de BD
 */
export const OPCIONES_ESTADO_CIVIL = [
  "Soltero",
  "Casado",
  "Divorciado",
  "Viudo",
  "Otro",
];

/**
 * Opciones de género para formularios - Exactamente iguales a las restricciones de BD
 */
export const OPCIONES_GENERO = ["Masculino", "Femenino"];

/**
 * Mapeo de endpoint para servicios con tarifas
 */
export const SERVICE_ENDPOINTS = {
  habitacion: "habitaciones",
  movilidad: "movilidades",
  tickets: "tickets",
  restaurante: "restaurantes",
  tour: "tours",
  ruta: "rutas",
  vagones: "vagones",
  tipo_vuelo: "tipos-vuelo",
};

/**
 * Categorías de hotel
 */
export const CATEGORIAS_HOTEL = [
  "Hotel ",
  "Hotel ",
  "Hotel ",
  "Hotel *",
  "Hotel ",
  "Hotel ",
  "Hostal",
  "Albergue",
  "Resort",
  "Apart Hotel",
  "Boutique Hotel",
  "Lodge",
];

/**
 * Tipos de desayuno para hoteles
 */
export const TIPOS_DESAYUNO = [
  "Americano",
  "Continental",
  "Buffet",
  "Buffet completo",
  "Ejecutivo",
  "A la carta",
];

/**
 * Procedencias permitidas para tickets (según restricción de BD)
 */
export const PROCEDENCIAS_TICKET = ["nacional", "extranjero"];

/**
 * Tipos de usuario permitidos para tickets (según restricción de BD)
 */
export const TIPOS_USUARIO_TICKET = ["adulto", "estudiante"];

/**
 * Tipos de tarifa habilitados en la gestión actual.
 * `cotizacion` permanece en backend únicamente para compatibilidad histórica.
 */
export const TIPOS_TARIFA_EDITABLES = [
  TIPOS_TARIFA.INTERNA,
  TIPOS_TARIFA.EXTERNA,
];

export const TARIFA_TYPE_LABELS = {
  [TIPOS_TARIFA.INTERNA]: "Confidencial",
  [TIPOS_TARIFA.EXTERNA]: "Pública",
  [TIPOS_TARIFA.COTIZACION]: "Heredada",
};

export const getTarifaTypeLabel = (tipo: string) =>
  TARIFA_TYPE_LABELS[tipo] || "Sin tipo";

export const normalizeEditableTariffType = (tipo?: string | null) =>
  TIPOS_TARIFA_EDITABLES.includes(tipo as string)
    ? tipo
    : TIPOS_TARIFA.EXTERNA;
