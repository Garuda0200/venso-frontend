export const getCurrentTimestamp = () => {
  return new Date().toISOString();
};

export const formatDateTime = (date, options = {}) => {
  const defaultOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };

  const dateObject = typeof date === "string" ? new Date(date) : date;

  try {
    return new Intl.DateTimeFormat("en-US", {
      ...defaultOptions,
      ...options,
    }).format(dateObject);
  } catch (error) {
    console.error("Error formatting date:", error);
    return String(date);
  }
};

export const getDateDifference = (startDate, endDate, unit = "days") => {
  const start = typeof startDate === "string" ? new Date(startDate) : startDate;
  const end =
    typeof endDate === "string" ? new Date(endDate) : endDate || new Date();

  // Get difference in milliseconds
  const diffMs = end.getTime() - start.getTime();

  // Convert to the requested unit
  switch (unit.toLowerCase()) {
    case "seconds":
      return Math.floor(diffMs / 1000);
    case "minutes":
      return Math.floor(diffMs / (1000 * 60));
    case "hours":
      return Math.floor(diffMs / (1000 * 60 * 60));
    case "days":
    default:
      return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }
};
