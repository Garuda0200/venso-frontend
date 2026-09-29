/**
 * Canonical hotel-room terminology used across Venso.
 *
 * `WB` means "with breakfast" and is descriptive only; it never increases the
 * occupancy of a room. The room type/capacity is determined by the actual room
 * code/name (SWB, DWB, matrimonial, triple, etc.).
 */
export const normalizeHotelRoomType = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[._/\\-]+/g, " ")
    .replace(/\s+/g, " ");

const roomTypeText = (value: unknown): string => {
  if (value && typeof value === "object") {
    const room = value as Record<string, any>;
    return normalizeHotelRoomType(
      room.tipo_habitacion ??
        room.habitacion_tipo ??
        room.roomType ??
        room.room_type ??
        room.tipo ??
        room.label ??
        room.nombre ??
        room.habitacion?.tipo_habitacion ??
        room.childService?.tipo_habitacion ??
        room.childService?.habitacion?.tipo_habitacion ??
        "",
    );
  }
  return normalizeHotelRoomType(value);
};

const hasToken = (text: string, token: string): boolean =>
  new RegExp(`(?:^|\\s)${token}(?:$|\\s)`, "i").test(text);

export const isExtraBedRoomType = (value: unknown): boolean => {
  const text = roomTypeText(value);
  return (
    text.includes("cama adicional") ||
    text.includes("cama extra") ||
    text.includes("extra bed") ||
    text.includes("additional bed") ||
    text.includes("rollaway")
  );
};

/** Returns a canonical capacity only when the terminology is recognized. */
export const inferHotelRoomCapacityFromType = (
  value: unknown,
): number | null => {
  const text = roomTypeText(value);
  if (!text) return null;

  if (isExtraBedRoomType(text)) return 1;

  // Venso/current supplier abbreviations.
  if (
    hasToken(text, "swb") ||
    hasToken(text, "swp") ||
    hasToken(text, "sgl") ||
    text.includes("simple") ||
    text.includes("single") ||
    text.includes("individual")
  ) {
    return 1;
  }

  if (
    hasToken(text, "dwb") ||
    hasToken(text, "mat") ||
    hasToken(text, "dbl") ||
    text.includes("doble") ||
    text.includes("double") ||
    text.includes("matrimonial") ||
    text.includes("twin")
  ) {
    return 2;
  }

  if (
    text.includes("triple") ||
    hasToken(text, "trl") ||
    hasToken(text, "trp") ||
    hasToken(text, "tpl")
  ) {
    return 3;
  }

  if (
    text.includes("cuadruple") ||
    text.includes("quadruple") ||
    text.includes("familiar") ||
    text.includes("family") ||
    text.includes("suite") ||
    hasToken(text, "quad")
  ) {
    return 4;
  }

  if (text.includes("quintuple")) return 5;
  if (text.includes("sextuple")) return 6;

  return null;
};

const directCapacity = (room: Record<string, any>): number | null => {
  const raw =
    room.capacidad ??
    room.habitacion_capacidad ??
    room.capacity ??
    room.capacidad_maxima ??
    room.numero_personas ??
    room.roomCapacity ??
    room.habitacion?.capacidad ??
    room.childService?.capacidad ??
    room.childService?.habitacion?.capacidad;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : null;
};

/**
 * Resolve capacity from a room object or a room-type string.
 * Known Venso terminology wins over stale legacy capacity values; custom room
 * types keep their explicit catalog capacity.
 */
export const getHotelRoomCapacity = (
  roomOrType: unknown,
  fallback = 2,
): number => {
  const inferred = inferHotelRoomCapacityFromType(roomOrType);
  if (inferred != null) return inferred;

  if (roomOrType && typeof roomOrType === "object") {
    const explicit = directCapacity(roomOrType as Record<string, any>);
    if (explicit != null) return explicit;
  }

  return Math.max(1, Math.floor(Number(fallback) || 1));
};

export const getHotelRoomKind = (roomOrType: unknown): string => {
  if (isExtraBedRoomType(roomOrType)) return "extra-bed";
  const capacity = getHotelRoomCapacity(roomOrType, 2);
  if (capacity === 1) return "single";
  if (capacity === 2) return "double";
  if (capacity === 3) return "triple";
  if (capacity === 4) return "quadruple";
  if (capacity === 5) return "quintuple";
  if (capacity === 6) return "sextuple";
  return `capacity:${capacity}`;
};

export const isExtraBedRoom = isExtraBedRoomType;
