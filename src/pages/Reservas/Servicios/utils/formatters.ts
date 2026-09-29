// Formatear fechas para mostrar en interfaz o envío
export const formatDate = (date, format = "dd/MM/yyyy") => {
  if (!date) return "";

  const d = new Date(date);
  if (isNaN(d.getTime())) return "";

  const padZero = (num) => String(num).padStart(2, "0");

  const day = padZero(d.getDate());
  const month = padZero(d.getMonth() + 1);
  const year = d.getFullYear();

  return format.replace("dd", day).replace("MM", month).replace("yyyy", year);
};

// Formatear tiempo - mejora para garantizar formato HH:MM para inputs time
export const formatTime = (timeString, format = "HH:mm") => {
  if (!timeString) return ""; // Cambiado para permitir campos vacíos cuando sea necesario

  // Si ya está en formato HH:MM, devolverlo directamente
  if (/^\d{2}:\d{2}$/.test(timeString)) {
    return timeString;
  }

  // Si viene en formato de tiempo de base de datos (algunos backends envían en formato específico)
  if (typeof timeString === "string" && timeString.includes(":")) {
    // Extraer solo la parte de la hora (ignora posible fecha)
    const timeParts = timeString.split(":");
    if (timeParts.length >= 2) {
      const hours = timeParts[0].padStart(2, "0");
      const minutes = timeParts[1].substring(0, 2).padStart(2, "0");
      return `${hours}:${minutes}`;
    }
  }

  // Intentar extraer hora y minutos de diferentes formatos
  let hours, minutes;

  // Caso 1: formato "HH:MM AM/PM"
  const amPmMatch = String(timeString).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (amPmMatch) {
    hours = parseInt(amPmMatch[1], 10);
    minutes = parseInt(amPmMatch[2], 10);
    const period = amPmMatch[3]?.toUpperCase();

    // Convertir a formato 24 horas si es PM
    if (period === "PM" && hours < 12) {
      hours += 12;
    } else if (period === "AM" && hours === 12) {
      hours = 0;
    }
  }
  // Caso 2: intentar extraer solo los números
  else {
    const numbers = String(timeString).match(/\d+/g);
    if (numbers && numbers.length >= 2) {
      hours = parseInt(numbers[0], 10);
      minutes = parseInt(numbers[1], 10);
    } else {
      // Si no podemos extraer hora y minutos, usar un valor vacío
      return "";
    }
  }

  // Validar y ajustar valores
  hours = Math.max(0, Math.min(23, hours));
  minutes = Math.max(0, Math.min(59, minutes));

  // Formatear como HH:MM para input time HTML
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
};

/**
 * Formatea un valor monetario a formato local
 * @param {number} value - El monto a formatear
 * @param {string} currency - El símbolo de moneda (por defecto "$")
 * @returns {string} - El monto formateado
 */
export const formatCurrency = (value, currency = "$") => {
  if (value === undefined || value === null) return "";
  return `${currency} ${parseFloat(value).toFixed(2)}`;
};

/**
 * Extrae los datos de persona de un objeto guía, manejando diferentes estructuras
 * @param {Object} guia - El objeto guía que puede tener diferentes estructuras
 * @returns {Object} - Los datos de persona extraídos
 */
export const extractPersonaData = (guia) => {
  if (!guia) return {};

  return {
    nombres: guia.persona?.nombres || guia.nombres || "",
    apellidos: guia.persona?.apellidos || guia.apellidos || "",
    direccion: guia.persona?.direccion || guia.direccion || "",
    genero: guia.persona?.genero || guia.genero || "",
    estado_civil: guia.persona?.estado_civil || guia.estado_civil || "",
  };
};

/**
 * Extrae los datos específicos de guía de un objeto guía, manejando diferentes estructuras
 * @param {Object} guia - El objeto guía que puede tener diferentes estructuras
 * @returns {Object} - Los datos específicos de guía extraídos
 */
export const extractGuiaData = (guia) => {
  if (!guia) return {};

  return {
    id_guia: guia.id_guia || guia.guia?.id_guia || null,
    codigo_guia: guia.codigo_guia || guia.guia?.codigo_guia || "",
    idioma: guia.idioma || guia.guia?.idioma || "",
  };
};

/**
 * Obtiene el nombre completo formateado de un guía
 * @param {Object} guia - El objeto guía
 * @returns {string} - El nombre completo
 */
export const getFullName = (guia) => {
  const persona = extractPersonaData(guia);
  return `${persona.nombres || ""} ${persona.apellidos || ""}`.trim();
};
