const getPassengerKey = (passenger = {}) =>
  String(passenger.passenger_key || passenger.passengerKey || "").trim();

const getPassengerType = (passenger = {}) => {
  const key = getPassengerKey(passenger).toLowerCase();
  if (key.startsWith("child")) return "child";
  if (key.startsWith("adult")) return "adult";

  const value = String(
    passenger.tipo_pasajero || passenger.tipoPasajero || passenger.type || "",
  ).toLowerCase();
  return value.includes("child") || value.includes("ni") ? "child" : "adult";
};

const getPassengerRecordId = (passenger = {}) =>
  passenger.id_pasajero || passenger.id || null;

const getPassengerKeyIndex = (passenger = {}) => {
  const match = getPassengerKey(passenger).match(/^(adult|child)[-:](\d+)$/i);
  return match ? Number(match[2]) : Number.MAX_SAFE_INTEGER;
};

const passengerSort = (left, right) => {
  const leftHasKey = Boolean(getPassengerKey(left));
  const rightHasKey = Boolean(getPassengerKey(right));
  if (leftHasKey !== rightHasKey) return leftHasKey ? -1 : 1;

  const indexDifference =
    getPassengerKeyIndex(left) - getPassengerKeyIndex(right);
  if (indexDifference !== 0) return indexDifference;

  return (
    Number(getPassengerRecordId(left) || 0) -
    Number(getPassengerRecordId(right) || 0)
  );
};

const dedupePassengerRows = (rows = []) => {
  const seenKeys = new Set();
  const seenIds = new Set();

  return [...rows].sort(passengerSort).filter((passenger) => {
    const key = getPassengerKey(passenger);
    const recordId = getPassengerRecordId(passenger);

    if (key) {
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
    }

    if (recordId != null) {
      const idKey = String(recordId);
      if (seenIds.has(idKey)) return false;
      seenIds.add(idKey);
    }

    return true;
  });
};

const toPeopleEntry = (passenger = {}, fallbackIndex = 0) => ({
  ...passenger,
  id:
    getPassengerRecordId(passenger) ||
    getPassengerKey(passenger) ||
    `${getPassengerType(passenger)}-${fallbackIndex + 1}`,
  age:
    passenger.edad ||
    passenger.age ||
    (getPassengerType(passenger) === "child" ? "6" : "18"),
  edad:
    passenger.edad ||
    passenger.age ||
    (getPassengerType(passenger) === "child" ? "6" : "18"),
  nacionalidad: passenger.nacionalidad || passenger.pais || "",
  nombres: passenger.nombres || passenger.nombre || "",
  apellidos: passenger.apellidos || "",
  tipo_documento: passenger.tipo_documento || "",
  numero_documento: passenger.numero_documento || "",
  correo: passenger.correo || "",
  telefono: passenger.telefono || "",
  passenger_key: getPassengerKey(passenger),
});

/**
 * Rebuilds peopleDetails from pasajero rows without allowing duplicated or
 * stale rows to inflate the quotation. Typed passenger rows are authoritative
 * for the adult/child split; keyed rows are preferred so passenger slots remain
 * stable after edits.
 */
export const buildCotizacionPeopleDetails = (
  passengerRows = [],
  _cotizacion = {},
) => {
  const normalizedRows = dedupePassengerRows(
    Array.isArray(passengerRows) ? passengerRows : [],
  );
  const adults = normalizedRows.filter(
    (passenger) => getPassengerType(passenger) === "adult",
  );
  const children = normalizedRows.filter(
    (passenger) => getPassengerType(passenger) === "child",
  );
  // The passenger rows are authoritative for the adult/child split. A legacy
  // cantidadpersonas value only contains the total and can be stale after an
  // interrupted save, so it must never truncate correctly typed rows.
  return {
    adults: adults.map(toPeopleEntry),
    children: children.map(toPeopleEntry),
  };
};

export const getCotizacionPassengerRecordId = getPassengerRecordId;
export const getCotizacionPassengerType = getPassengerType;
export const getCotizacionPassengerKey = getPassengerKey;
