/**
 * Format a number as currency
 * @param {number|string} amount - Amount to format
 * @param {string} currency - "soles" | "dolares"
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount, currency = "dolares", decimals = 2) => {
  if (amount === undefined || amount === null)
    return decimals > 0 ? "0.00" : "0";

  let currency_code, locale;
  switch (currency) {
    case "soles":
      currency_code = "PEN";
      locale = "es-PE";
      break;
    case "dolares":
      currency_code = "USD";
      locale = "en-US";
      break;
    default:
      console.error("Parametro 'currency' no es valido.");
  }

  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency_code,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numAmount);
};

export const formatDate = (date, locale = "en-US") => {
  if (!date) return "-";

  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;

    return dateObj.toLocaleDateString(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    console.error("Error formatting date:", error);
    return String(date);
  }
};

export const parseLocalDate = (dateInput, fallback = null) => {
  if (!dateInput) return fallback;
  if (dateInput instanceof Date) {
    const cloned = new Date(dateInput.getTime());
    return Number.isNaN(cloned.getTime()) ? fallback : cloned;
  }

  if (typeof dateInput !== "string") return fallback;
  const value = dateInput.trim();
  if (!value) return fallback;

  if (value.includes("T")) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

export const addDaysToDate = (dateInput, daysToAdd = 0, fallback = null) => {
  const date = parseLocalDate(dateInput, fallback);
  if (!date) return fallback;
  const nextDate = new Date(date.getTime());
  nextDate.setDate(nextDate.getDate() + Number(daysToAdd || 0));
  return nextDate;
};

export const toIsoDate = (dateInput, fallback = "") => {
  const date = parseLocalDate(dateInput, null);
  if (!date) return fallback;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const formatLongDate = (
  dateInput,
  locale = "es-ES",
  fallback = "",
) => {
  const date = parseLocalDate(dateInput, null);
  if (!date) return fallback;
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

export const formatShortDate = (
  dateInput,
  locale = "es-PE",
  fallback = "",
) => {
  const date = parseLocalDate(dateInput, null);
  if (!date) return fallback;
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
  });
};

export const formatDateRangeLong = (
  startDate,
  endDate,
  locale = "es-ES",
  separator = " - ",
) => {
  const start = formatLongDate(startDate, locale);
  const end = formatLongDate(endDate, locale);
  if (start && end) return `${start}${separator}${end}`;
  return start || end || "";
};

export const formatPercentage = (value, decimals = 1) => {
  if (value === undefined || value === null) return "0%";

  try {
    return `${parseFloat(value).toFixed(decimals)}%`;
  } catch (error) {
    console.error("Error formatting percentage:", error);
    return `${value}%`;
  }
};

export const formatNumber = (value, decimals = 0) => {
  if (value === undefined || value === null) return "0";

  try {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch (error) {
    console.error("Error formatting number:", error);
    return String(value);
  }
};

export const formatFileSize = (bytes) => {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export const formatPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return "";

  // Remove all non-digit characters
  const cleaned = String(phoneNumber).replace(/\D/g, "");

  // Format based on length
  if (cleaned.length === 9) {
    // Peruvian mobile format: 999 999 999
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
  }

  return phoneNumber;
};

export const truncateText = (text, maxLength = 30) => {
  if (!text) return "";
  if (text.length <= maxLength) return text;

  return `${text.substring(0, maxLength - 3)}...`;
};
