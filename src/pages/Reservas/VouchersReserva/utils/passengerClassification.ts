const stripDiacritics = (value = "") =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normalizeToken = (value) => stripDiacritics(value).trim().toLowerCase();

const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");

/**
 * Clasificación canónica de pasajeros para Reservas.
 *
 * Regla principal: si BD/Ventas ya entrega tipo_pasajero, ese valor manda.
 * La edad NO puede convertir un adulto comercial en niño. Solo se usa como
 * fallback para registros legacy que realmente no tienen tipo ni passenger_key.
 */
export const getCanonicalReservationPassengerType = (
  passenger = {},
  fallback = "adult",
) => {
  const explicitType = normalizeToken(
    firstDefined(
      passenger?.tipo_pasajero,
      passenger?.tipoPasajero,
      passenger?.passenger_type,
      passenger?.passengerType,
      passenger?.type,
      passenger?.tipo,
    ) || "",
  );

  if (
    explicitType.includes("infant") ||
    explicitType.includes("bebe") ||
    explicitType.includes("beb")
  ) {
    return "infant";
  }

  if (
    ["child", "children", "nino", "nina", "ninos", "menor"].some(
      (token) => explicitType === token || explicitType.includes(token),
    )
  ) {
    return "child";
  }

  if (
    ["adult", "adults", "adulto", "adultos"].some(
      (token) => explicitType === token || explicitType.includes(token),
    )
  ) {
    return "adult";
  }

  const passengerKey = normalizeToken(
    firstDefined(
      passenger?.passenger_key,
      passenger?.passengerKey,
      passenger?.rowId,
      passenger?.row_id,
    ) || "",
  );

  if (passengerKey.startsWith("child") || passengerKey.startsWith("nino")) {
    return "child";
  }
  if (passengerKey.startsWith("adult")) return "adult";
  if (passengerKey.startsWith("infant") || passengerKey.startsWith("bebe")) {
    return "infant";
  }

  const age = Number(passenger?.age ?? passenger?.edad);
  if (Number.isFinite(age) && age >= 0) {
    if (age < 2) return "infant";
    if (age < 18) return "child";
    return "adult";
  }

  return fallback;
};

export const normalizeReservationPassengerRows = (passengers = []) => {
  const rows = Array.isArray(passengers) ? passengers : [];
  const normalized = {
    adults: [],
    children: [],
    infants: [],
    details: [],
  };

  rows.forEach((passenger) => {
    const type = getCanonicalReservationPassengerType(passenger);
    const normalizedPassenger = {
      ...passenger,
      type,
      tipo_pasajero: type === "infant" ? "child" : type,
    };

    normalized.details.push(normalizedPassenger);
    if (type === "infant") normalized.infants.push(normalizedPassenger);
    else if (type === "child") normalized.children.push(normalizedPassenger);
    else normalized.adults.push(normalizedPassenger);
  });

  return normalized;
};

export const countCanonicalReservationPassengers = (passengers = []) => {
  const normalized = normalizeReservationPassengerRows(passengers);
  return {
    adults: normalized.adults.length,
    children: normalized.children.length,
    infants: normalized.infants.length,
    total:
      normalized.adults.length +
      normalized.children.length +
      normalized.infants.length,
  };
};
