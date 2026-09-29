const n = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizePassengerId = (value) =>
  String(
    typeof value === "object" && value !== null
      ? value.id || value.passengerId || value.passenger_id || ""
      : value || "",
  ).trim();

const CHILD_ID_RE = /^child(?::|$)/i;

/**
 * Normaliza la etiqueta comercial de habitación de un niño.
 * Una etiqueta vacía o el antiguo placeholder "Habitación" significa que el
 * niño no está alojado y debe presentarse como "Sin hotel".
 */
export const normalizeChildRoomLabel = (value) => {
  const source = String(value ?? "").trim();
  if (!source) return "Sin hotel";

  const normalized = source
    .replace(/^HABITACI[ÓO]N\s+/i, "")
    .replace(/^NIÑOS?\s+/i, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .trim();

  if (!normalized || /^habitaci[oó]n$/i.test(normalized)) return "Sin hotel";
  return normalized;
};

const roomHasPassengerIdentityData = (room = {}) => {
  const details = Array.isArray(room?.roomDetails) ? room.roomDetails : [];
  const arrays = [
    room?.passengerIds,
    room?.adultPassengerIds,
    room?.convertedChildPassengerIds,
    room?.explicitChildPassengerIds,
    room?.childPassengerIds,
    ...details.flatMap((detail) => [
      detail?.passengerIds,
      detail?.adultPassengerIds,
      detail?.convertedChildPassengerIds,
      detail?.explicitChildPassengerIds,
      detail?.childPassengerIds,
    ]),
  ];

  return arrays.some((value) => Array.isArray(value));
};

/**
 * Cuenta únicamente niños que ocupan una habitación.
 *
 * Las tarifas infantiles de hotel (por ejemplo $37/$30) no implican que el
 * niño esté asignado a una habitación: pueden existir aunque el menor quede
 * "Sin hotel". Cuando la distribución contiene IDs de pasajeros, esos IDs son
 * la fuente de verdad. Los conteos numéricos se conservan solo como fallback
 * para snapshots legacy que no almacenaban identidad de pasajeros.
 */
export const resolveHotelRoomChildBeneficiaryCount = (perRoomPricing = []) => {
  const rooms = Array.isArray(perRoomPricing) ? perRoomPricing : [];
  const childIds = new Set();
  const hasIdentityData = rooms.some(roomHasPassengerIdentityData);

  rooms.forEach((room) => {
    const details = Array.isArray(room?.roomDetails) ? room.roomDetails : [];
    const explicitChildSources = [
      room?.convertedChildPassengerIds,
      room?.explicitChildPassengerIds,
      room?.childPassengerIds,
      ...details.flatMap((detail) => [
        detail?.convertedChildPassengerIds,
        detail?.explicitChildPassengerIds,
        detail?.childPassengerIds,
      ]),
    ];

    explicitChildSources.forEach((source) => {
      if (!Array.isArray(source)) return;
      source.forEach((value) => {
        const id = normalizePassengerId(value);
        if (id) childIds.add(id);
      });
    });

    const passengerIds = [
      ...(Array.isArray(room?.passengerIds) ? room.passengerIds : []),
      ...details.flatMap((detail) =>
        Array.isArray(detail?.passengerIds) ? detail.passengerIds : [],
      ),
    ];
    passengerIds.forEach((value) => {
      const id = normalizePassengerId(value);
      if (CHILD_ID_RE.test(id)) childIds.add(id);
    });
  });

  if (hasIdentityData) return childIds.size;
  if (childIds.size > 0) return childIds.size;

  return Math.max(
    0,
    rooms.reduce(
      (sum, room) =>
        sum +
        Math.max(
          0,
          n(room?.explicitChildBeneficiaries) +
            n(room?.convertedChildBeneficiaries),
        ),
      0,
    ),
  );
};
