export const formatearFecha = (fecha) => {
  if (!fecha) return "N/A";

  try {
    // Intenta parsear la fecha
    const date = new Date(fecha);

    // Si es una fecha inválida, retorna un mensaje de error
    if (isNaN(date.getTime())) return "Fecha inválida";

    // Formatear fecha
    return date.toLocaleDateString("es-ES", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch (error) {
    console.error("Error al formatear fecha:", error);
    return "Error en fecha";
  }
};

export const formatearPrecio = (precio, moneda = "USD") => {
  if (precio === null || precio === undefined || precio === "") return "$0.00";

  const options = {
    style: "currency",
    currency: moneda,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };

  return new Intl.NumberFormat("en-US", options).format(parseFloat(precio));
};

export const getEstadoClass = (estado, tipoServicio = "") => {
  if (!estado) return "estado-desconocido";

  const estadoLower = estado.toLowerCase();

  switch (estadoLower) {
    case "disponible":
      return "estado-disponible";
    case "reservado":
      return "estado-reservado";
    case "confirmado":
      return "estado-confirmado";
    case "cancelado":
      return "estado-cancelado";
    case "completado":
      return "estado-completado";
    case "cerrado":
      return "estado-cerrado";
    case "inactivo":
      return "estado-inactivo";
    default:
      return "estado-otro";
  }
};

export const formatearNumero = (num) => {
  if (num === null || num === undefined) return "-";
  return new Intl.NumberFormat("en-US").format(num);
};

export const truncateText = (text, maxLength = 100) => {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
};

/**
 * Format a number as currency (USD)
 * @param {number|string} amount - Amount to format
 * @param {string} currency - Currency type: "dolares" or "soles"
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount, currency = "dolares") => {
  if (amount === undefined || amount === null) return "$0.00";

  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;

  // Determinar código de moneda y locale basado en el parámetro
  let currencyCode = "USD";
  let locale = "en-US";

  if (currency) {
    const currencyLower = currency.toLowerCase();
    if (
      currencyLower === "soles" ||
      currencyLower.includes("sol") ||
      currencyLower.includes("pen")
    ) {
      currencyCode = "PEN";
      locale = "es-PE";
    }
  }

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numAmount);
};

/**
 * Format a date string to a localized date format
 * @param {string|Date} dateString - Date to format
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export const formatDate = (dateString, options = {}) => {
  if (!dateString) return "N/A";

  const date =
    typeof dateString === "string" ? new Date(dateString) : dateString;

  const defaultOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };

  try {
    return new Intl.DateTimeFormat("es-ES", {
      ...defaultOptions,
      ...options,
    }).format(date);
  } catch (error) {
    console.error("Error formatting date:", error);
    return String(dateString);
  }
};

/**
 * Formatea una hora en formato ISO a un formato legible
 * @param {string} timeString - Hora en formato ISO o HH:MM:SS
 * @returns {string} - Hora formateada
 */
export const formatTime = (timeString) => {
  if (!timeString) return "—";

  try {
    // Si es una hora completa con fecha
    if (timeString.includes("T")) {
      const date = new Date(timeString);
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    // Si es solo una hora HH:MM:SS
    const timeParts = timeString.split(":");
    return `${timeParts[0].padStart(2, "0")}:${timeParts[1].padStart(2, "0")}`;
  } catch (e) {
    console.error("Error al formatear hora:", e);
    return timeString;
  }
};

export const formatBoolean = (value) => {
  return value ? "Sí" : "No";
};

export const formatPrices = (value, currency = "$") => {
  if (!value || typeof value !== "object") return "-";

  const compartido =
    typeof value.compartido === "number"
      ? formatCurrency(value.compartido, currency)
      : "-";
  const privado =
    typeof value.privado === "number"
      ? formatCurrency(value.privado, currency)
      : "-";

  return `Comp: ${compartido} / Priv: ${privado}`;
};

export const getNestedValue = (obj, path, defaultValue = "-") => {
  if (!obj || !path) return defaultValue;

  const keys = path.split(".");
  let result = obj;

  for (const key of keys) {
    if (result === null || result === undefined || typeof result !== "object") {
      return defaultValue;
    }
    result = result[key];
  }

  return result !== null && result !== undefined ? result : defaultValue;
};

export const formatearHora = (hora) => {
  if (!hora) return "";

  try {
    // Si es una cadena que parece contener segundos, extraer solo HH:MM
    if (typeof hora === "string") {
      if (hora.includes("T")) {
        // ISO datetime format
        return hora.split("T")[1].substring(0, 5);
      } else if (hora.split(":").length > 2) {
        // HH:MM:SS format
        return hora.split(":").slice(0, 2).join(":");
      }
      return hora;
    }
    // Si es un objeto Date
    else if (hora instanceof Date) {
      return hora.toTimeString().substring(0, 5);
    }

    return String(hora);
  } catch (error) {
    console.error("Error al formatear hora:", error);
    return String(hora);
  }
};

export function generateVoucherId() {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `VCH${year}${month}${day}-${random}`;
}

export function getStatusClass(status) {
  if (!status) return "";

  const statusLower = status.toString().toLowerCase();
  switch (statusLower) {
    case "confirmado":
    case "completed":
    case "success":
      return "status-success";
    case "pendiente":
    case "pending":
    case "warning":
      return "status-warning";
    case "cancelado":
    case "cancelled":
    case "canceled":
    case "error":
    case "danger":
      return "status-danger";
    default:
      return "status-info";
  }
}

/**
 * Safely convert an ID to string, ensuring proper display
 * Useful for handling IDs that could be either numeric or string
 * @param {any} id - ID to convert
 * @returns {string} String representation of the ID
 */
export const formatId = (id) => {
  if (id === undefined || id === null) return "N/A";
  return String(id);
};
