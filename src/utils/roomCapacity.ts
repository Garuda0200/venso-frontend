// Physical occupancy is independent of the occupancy included in a tariff.
export const positiveRoomCapacity = value => {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= 2147483647 ? number : null;
};

// Only catalog defaults. Generic suites, mixed occupancy and supplements need review.
export const defaultRoomCapacity = label => {
  const text = String(label ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/[0-9]|cama|sofa|cuna|dormitorio|day[ -]*use|dayuse|lunch|almuerzo|cena|desayuno|breakfast|dinner|menu|check|permite|considera|adicional|additional|extra|hasta|desc[ou]rche|corkage/.test(text)) return null;
  const words = text.split(/[^a-z]+/);
  if (["sin","no","guia","guias","conductor","tc"].some(word => words.includes(word))) return null;
  const groups = [["simple","single","individual","sgl","swb"],
    ["doble","double","matrimonial","twin","dwb","dbl","twn","mat"],
    ["triple","trp","trl","tpl"], ["cuadruple","quadruple","quad"], ["quintuple"], ["sextuple"]];
  const values = groups.flatMap((tokens,index) => tokens.some(token => words.includes(token)) ? [index+1] : []);
  return values.length === 1 ? values[0] : null;
};

export const roomCatalogDefaults = (room = {}) => {
  if (room.capacidad != null && room.capacidad !== "") return room;
  if (room.tipo_unidad && room.tipo_unidad !== "habitacion") return room;
  const capacity = defaultRoomCapacity(room.tipo_habitacion);
  return capacity == null ? room : { ...room, capacidad: capacity, tipo_unidad: "habitacion" };
};

export const roomCapacity = (room = {}, { allowLegacy = true } = {}) => {
  if (typeof room === "string") room = { tipo_habitacion: room };
  if (Object.prototype.hasOwnProperty.call(room || {}, "capacidad_ocupacion")) return positiveRoomCapacity(room.capacidad_ocupacion);
  const entity = room?.habitacion || room || {};
  const kind = room?.tipo_unidad ?? entity.tipo_unidad;
  if (kind && kind !== "habitacion") return null;
  for (const value of [room?.capacidad_ocupacion, room?.roomCapacitySnapshot, room?.habitacion_capacidad,
    room?.capacidad, entity.capacidad, room?.capacity, room?.capacidad_maxima, room?.numero_personas]) {
    if (value !== undefined && value !== null) return positiveRoomCapacity(value);
  }
  if (!allowLegacy) return null;
  return defaultRoomCapacity(room?.tipo_habitacion ?? entity.tipo_habitacion ?? room?.label);
};

// Use only within the already resolved quotation/day scope. Long IDs are the
// current UI's zero-based rows; historical short IDs are one-based slots.
export const hotelOccupantId = value => {
  const raw = typeof value === "object" ? value?.child_origin ?? value?.childOrigin ?? value?.id : value;
  if (raw == null) return null;
  const text = String(raw), match = text.match(/^(adult|child):(\d+)(:.*)?$/);
  if (!match) return text || null;
  const index = Number(match[2]) + (match[3] ? 1 : 0);
  return Number.isSafeInteger(index) && index > 0 ? `${match[1]}:${index}` : null;
};

export const hotelPassengerIds = service => {
  const selection = service?.assignedPassengerSelection?.selectedIds ?? service?.assignedService?.passengerSelection?.selectedIds;
  const values = Array.isArray(selection) ? selection : [
    ...(service?.assigned_beneficiarios_adultos ?? service?.assignedBeneficiariosAdultos ?? service?.beneficiariosAdultos ?? service?.beneficiarios_adultos ?? []),
    ...(service?.assigned_beneficiarios_ninos ?? service?.assignedBeneficiariosNinos ?? service?.beneficiariosNinos ?? service?.beneficiarios_ninos ?? []),
  ];
  return [...new Set(values.map(hotelOccupantId).filter(Boolean))];
};
