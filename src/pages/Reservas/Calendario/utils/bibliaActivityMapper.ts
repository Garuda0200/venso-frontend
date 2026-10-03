import { compactBibliaTrainText } from "./bibliaTrainCatalog";

export type BibliaActivityCategory =
  | "machupicchu"
  | "montana"
  | "valle"
  | "maras"
  | "city"
  | "humantay"
  | "traslado"
  | "tour"
  | "general";

export type BibliaSourceType = "day" | "manual" | "standalone";

export interface BibliaRichTextRun {
  text: string;
  font?: {
    name?: string;
    size?: number;
    bold?: boolean;
    italic?: boolean;
    color?: string;
  };
}

export interface BibliaExcelSource {
  workbook?: string;
  sheet?: string;
  row?: number;
  importBatch?: string;
  importKey?: string;
  cellDateKey?: string;
  rowColor?: string;
  cellColors?: Record<string, string>;
  richText?: Record<string, BibliaRichTextRun[]>;
}

export interface BibliaParticipantGroup {
  count: number;
  nationalities: Array<{ country: string; count: number }>;
}

export interface BibliaParticipantPlan {
  version: 1;
  adults: BibliaParticipantGroup;
  children: BibliaParticipantGroup;
}

export interface BibliaActivity {
  id: string;
  dateKey: string;
  date: Date;
  file: string;
  reservationName: string;
  pax: number;
  nationality: string;
  participantPlan?: BibliaParticipantPlan | null;
  language: string;
  serviceMode: "SIC" | "PRIV" | string;
  time: string;
  excursion: string;
  hotelCusco: string;
  tickets: string;
  hotelValle: string;
  hotelMapi: string;
  restaurant: string;
  endorse: string;
  transport: string;
  guide: string;
  trainOutbound: string;
  trainReturn: string;
  observations: string;
  incidents: string;
  counter: string;
  agency: string;
  category: BibliaActivityCategory;
  color: string;
  order: number;
  sourceType: BibliaSourceType;
  sourceQuotationId: string;
  platform?: string;
  sourceServiceId: string;
  sourceDayId: string;
  sourceItinerary: "base" | "external" | "manual" | "standalone";
  sourceVoucherMedia: Record<string, any> | null;
  sourceSalesVoucherId: number | null;
  standaloneRecordId: string | null;
  service: Record<string, any>;
  overrideRecord: Record<string, any> | null;
  dayNumber: number;
  quotationOrigin: string;
  syncQuotation: boolean;
  isDeleted: boolean;
  // Metadatos de importación: permiten reproducir excepciones visuales de la
  // hoja original sin alterar la información operativa del registro.
  sourceExcel?: BibliaExcelSource | null;
}

const EMPTY = "—";
export const BIBLIA_EMPTY_VALUE = EMPTY;
// v4 completa los servicios que antes quedaban fuera de la Biblia (en especial
// ingresos/tickets) sin mezclar datos de una asignación operativa.
export const BIBLIA_SCHEMA_VERSION = 4;
export const BIBLIA_DEFAULT_COLOR = "#CFE2F3";
export const BIBLIA_EXCEL_PALETTE = [
  "#CFE2F3", "#E6B8AF", "#F1CEEE", "#EFC9A8", "#00FF00",
  "#FFFF00", "#FFF2CC", "#D9EAD3", "#FCE5CD", "#FF9900",
  "#C9DAF8", "#D5A6BD", "#D9D2E9", "#6AA84F", "#FFE599",
  "#F199E3", "#F9CB9C", "#B6D7A8", "#B4A7D6", "#EAD1DC",
  "#A4C2F4", "#F4CCCC", "#FF0000", "#FF00FF", "#FFFFFF",
] as const;

export const BIBLIA_EDITABLE_FIELDS: Array<keyof BibliaActivity> = [
  "dateKey", "file", "reservationName", "pax", "nationality", "language",
  "serviceMode", "time", "excursion", "hotelCusco", "tickets", "hotelValle",
  "hotelMapi", "restaurant", "endorse", "transport", "guide", "trainOutbound",
  "trainReturn", "observations", "incidents", "counter", "agency", "color",
];

export const normalizeBibliaColor = (value: unknown) => {
  const raw = String(value ?? "").trim().toUpperCase();
  const normalized = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : BIBLIA_DEFAULT_COLOR;
};

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text && text !== "***" && text !== "****" && text !== EMPTY) return text;
  }
  return "";
};

const normalize = (value: unknown) =>
  String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

const asArray = <T = any>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") return Object.values(value) as T[];
  return [];
};

const joinName = (...values: unknown[]) =>
  values.map((value) => String(value ?? "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

const uniqueText = (values: unknown[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const text = firstText(value);
    const key = normalize(text);
    if (!text || !key || seen.has(key)) return;
    seen.add(key);
    result.push(text);
  });
  return result.join(" / ");
};

export const parseBibliaDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    const result = new Date(value.getFullYear(), value.getMonth(), value.getDate());
    return Number.isNaN(result.getTime()) ? null : result;
  }
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const result = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(result.getTime()) ? null : result;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

export const toBibliaDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const addDays = (date: Date, amount: number) => {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + amount);
  return result;
};

const fullPersonName = (value: Record<string, any> = {}) => {
  const person = value.persona || value;
  return firstText(
    person.nombre_completo,
    value.nombre_completo,
    joinName(person.nombres || person.nombre, person.apellidos || joinName(person.apellidopaterno, person.apellidomaterno)),
    value.nombre,
  );
};

// La Biblia representa el servicio cotizado, no la asignación operativa de Reservas.
// assigned* solo queda como fallback de datos históricos incompletos.
const resolveQuotedService = (service: Record<string, any> = {}) => {
  const assigned = service.assignedService || service.assigned_service || {};
  return {
    ...assigned,
    ...service,
    parentService:
      service.parentService || service.parent_service || service.assignedParentService ||
      service.assigned_parent_service || assigned.parentService || {},
    childService:
      service.childService || service.child_service || service.assignedChildService ||
      service.assigned_child_service || assigned.childService || {},
  };
};

export const getBibliaServiceType = (service: Record<string, any> = {}) =>
  normalize(
    service.typeService || service.tipo_servicio || service.tipo ||
      service.parentService?.typeService || service.parentService?.tipo_servicio,
  ) || "general";

const serviceDescription = (service: Record<string, any> = {}) => {
  const s = resolveQuotedService(service);
  const parent = s.parentService || {};
  const child = s.childService || {};
  const type = getBibliaServiceType(s);
  if (type === "hoteles") return firstText(parent.nombre_hotel, parent.nombre, child.hotel?.nombre, child.nombre, "Hotel");
  if (type === "transportes") return uniqueText([
    parent.nombre_transporte,
    parent.nombre,
    child.movilidad?.tipo_auto,
    child.movilidad?.nombre,
    child.tipo_auto,
    child.nombre,
    child.ruta,
    parent.ruta,
  ]) || "Traslado";
  if (type === "restaurantes") return firstText(child.restaurante?.nombre, child.nombre, parent.nombre, "Restaurante");
  if (type === "guias") return firstText(fullPersonName(parent), fullPersonName(child), child.ruta?.tour_nombre, child.tour_nombre, "Guía");
  if (type === "trenes") {
    const route = child.lugar_salida && child.lugar_destino
      ? `${compactBibliaTrainText(child.lugar_salida)} → ${compactBibliaTrainText(child.lugar_destino)}`
      : "";
    return uniqueText([parent.nombre_empresa, parent.nombre, child.tipo_tren, route]) || "Tren";
  }
  if (type === "endoses") return firstText(parent.nombre_agencia, parent.nombre, child.nombre_agencia, child.tour?.nombre, child.tour_nombre, "Endose");
  if (type === "tickets") return firstText(child.entrada, child.ticket?.entrada, parent.entrada, parent.nombre, "Ingreso");
  return firstText(parent.nombre, child.nombre, s.nombre, type, "Actividad");
};

const classifyHotel = (value: string) => {
  const text = normalize(value);
  if (/machu|mapi|aguas calientes/.test(text)) return "mapi" as const;
  if (/valle|urubamba|ollanta|yucay|calca|pisac/.test(text)) return "valle" as const;
  return "cusco" as const;
};

export const getBibliaExcelCellColor = (activity: BibliaActivity, field: keyof BibliaActivity) =>
  normalizeBibliaColor(activity.sourceExcel?.cellColors?.[String(field)] || activity.color);

export const getBibliaExcelRichText = (activity: BibliaActivity, field: keyof BibliaActivity) => {
  const value = activity.sourceExcel?.richText?.[String(field)];
  return Array.isArray(value) && value.length ? value : null;
};

const classifyHotelService = (service: Record<string, any>, description: string) => {
  const resolved = resolveQuotedService(service);
  const parent = resolved.parentService || {};
  const child = resolved.childService || {};
  return classifyHotel([
    description,
    parent.ciudad,
    parent.city,
    child.ciudad,
    child.city,
    child.hotel?.ciudad,
    child.hotel?.city,
    child.ubicacion,
    child.hotel?.ubicacion,
  ].filter(Boolean).join(" "));
};

const isReturnTrain = (service: Record<string, any>) => {
  const s = resolveQuotedService(service);
  const child = s.childService || {};
  const combined = normalize([child.lugar_salida, child.lugar_destino, child.tipo_tren, child.nombre, s.nombre].join(" "));
  const from = normalize(child.lugar_salida);
  const to = normalize(child.lugar_destino);
  if (/retorno|regreso|vuelta/.test(combined)) return true;
  return /mapi|machu|aguas/.test(from) && !/mapi|machu|aguas/.test(to);
};

const aggregateServiceColumns = (services: Array<Record<string, any>>) => {
  const columns: Record<string, string> = {
    hotelCusco: "", tickets: "", hotelValle: "", hotelMapi: "", restaurant: "", endorse: "",
    transport: "", guide: "", trainOutbound: "", trainReturn: "",
  };
  const buckets: Record<string, string[]> = Object.fromEntries(Object.keys(columns).map((key) => [key, []]));
  services.forEach((raw) => {
    const service = resolveQuotedService(raw);
    const type = getBibliaServiceType(service);
    const description = serviceDescription(service);
    if (type === "hoteles") {
      const location = classifyHotelService(service, description);
      buckets[location === "mapi" ? "hotelMapi" : location === "valle" ? "hotelValle" : "hotelCusco"].push(description);
    } else if (type === "tickets") buckets.tickets.push(description);
    else if (type === "transportes") buckets.transport.push(description);
    else if (type === "guias") buckets.guide.push(description);
    else if (type === "restaurantes") buckets.restaurant.push(description);
    else if (type === "endoses") buckets.endorse.push(description);
    else if (type === "trenes") buckets[isReturnTrain(service) ? "trainReturn" : "trainOutbound"].push(description);
  });
  Object.keys(columns).forEach((key) => { columns[key] = uniqueText(buckets[key]); });
  return columns;
};

const resolveTimeFromServices = (services: Array<Record<string, any>>) => {
  for (const raw of services) {
    const service = resolveQuotedService(raw);
    const time = firstText(service.hora, service.hour, service.childService?.hora, service.childService?.hora_inicio, service.parentService?.hora);
    if (time) return time;
  }
  return "";
};

const resolveLanguage = (quotation: Record<string, any>) => {
  const language = normalize(quotation.idioma);
  if (language === "en") return "INGLES";
  if (language === "pt") return "PORTUGUES";
  if (language === "es") return "ESPAÑOL";
  return firstText(quotation.idioma) || EMPTY;
};

const resolveServiceMode = (quotation: Record<string, any>) => {
  const mode = normalize(quotation.packagetype || quotation.packageType || quotation.tipo_servicio);
  if (mode.includes("priv")) return "PRIV";
  if (mode.includes("comp") || mode.includes("sic")) return "SIC";
  return firstText(quotation.packagetype, quotation.packageType, "SIC").toUpperCase();
};

export const resolveBibliaCounter = (quotation: Record<string, any> = {}) =>
  firstText(quotation.creator_name, quotation.created_by_name, quotation.createdByName, quotation.creator_full_name, quotation.creatorFullName);

const normalizeVoucherMedia = (value: any): Record<string, any> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const url = firstText(value.url, value.tigrisUrl, value.tigris_url);
  return url ? { ...value, url } : null;
};

export const resolveBibliaVoucherTarget = (quotation: Record<string, any> = {}) => {
  const reservationMedia = normalizeVoucherMedia(quotation.voucher_reserva_media || quotation.voucherReservaMedia);
  if (reservationMedia) return { kind: "reservation" as const, media: reservationMedia, voucherId: null };
  const sourceMedia = normalizeVoucherMedia(quotation.source_voucher || quotation.sourceVoucher);
  if (sourceMedia) return { kind: "source" as const, media: sourceMedia, voucherId: null };
  const voucherId = Number(quotation.source_sales_voucher_id ?? quotation.sourceSalesVoucherId);
  if (Number.isFinite(voucherId) && voucherId > 0) return { kind: "sales" as const, media: null, voucherId };
  return { kind: null, media: null, voucherId: null };
};

const getPassengers = (quotation: Record<string, any>) => asArray<Record<string, any>>(quotation.passengers);
const getPrimaryPassenger = (quotation: Record<string, any>) => {
  const passenger = getPassengers(quotation)[0] || {};
  return firstText(joinName(passenger.nombres || passenger.nombre, passenger.apellidos), passenger.nombre_completo, quotation.titulo, "Sin nombre");
};
const getPassengerCount = (quotation: Record<string, any>) => {
  const passengers = getPassengers(quotation);
  if (passengers.length) return passengers.length;
  const backendCount = Number(quotation.num_adults || 0) + Number(quotation.num_children || 0);
  return backendCount || Number(quotation.cantidadpersonas || 0) || 0;
};
const getNationality = (quotation: Record<string, any>) => {
  const values = getPassengers(quotation)
    .map((passenger) => firstText(passenger.nacionalidad, passenger.nationality, passenger.pais, passenger.country))
    .filter(Boolean);
  return uniqueText(values) || EMPTY;
};
const resolveAgencyName = (quotation: Record<string, any>, agencyMap: Map<number, string>) => {
  const agencyId = Number(quotation.agency_id || quotation.agencyId || 0);
  return firstText(quotation.agency_name, quotation.agency?.name, agencyMap.get(agencyId), agencyId > 0 ? `Agencia ${agencyId}` : "") || EMPTY;
};

export const classifyBibliaActivity = (excursion: string): BibliaActivityCategory => {
  const value = normalize(excursion);
  if (/machu|mapi|aguas calientes/.test(value)) return "machupicchu";
  if (/traslado|aeropuerto|estacion|poroy|wanchaq/.test(value)) return "traslado";
  if (/montana|palcoyo|vinicunca/.test(value)) return "montana";
  if (/humantay/.test(value)) return "humantay";
  if (/valle/.test(value)) return "valle";
  if (/maras|moray/.test(value)) return "maras";
  if (/city|ruinas cercanas/.test(value)) return "city";
  if (/tour|guiado|excursion/.test(value)) return "tour";
  return "general";
};
export const getInitialBibliaColor = (category: BibliaActivityCategory) => ({
  machupicchu: "#00FF00", montana: "#E6B8AF", valle: "#F1CEEE", maras: "#D9EAD3",
  city: "#EFC9A8", humantay: "#CFE2F3", traslado: "#FFFF00", tour: "#FFF2CC",
  general: BIBLIA_DEFAULT_COLOR,
}[category] || BIBLIA_DEFAULT_COLOR);
export const getBibliaCategoryLabel = (category: BibliaActivityCategory) => ({
  machupicchu: "Machu Picchu", montana: "Montaña", valle: "Valle", maras: "Maras / Moray",
  city: "City Tour", humantay: "Humantay", traslado: "Traslado", tour: "Tour", general: "Actividad",
}[category]);

const dayNumberOf = (day: Record<string, any>, fallback: number) => Number(day.numero ?? day.dayNumber ?? day.orden ?? fallback) || fallback;
const getDayTitle = (day: Record<string, any>) => firstText(day.titulo, day.title, day.descripcion, day.description);
const getDayServices = (day: Record<string, any>) => asArray<Record<string, any>>(day.servicios || day.services);

const mergeDays = (quotation: Record<string, any>) => {
  const map = new Map<number, { number: number; base: Record<string, any>[]; external: Record<string, any>[]; title: string; dayIds: string[] }>();
  const consume = (value: unknown, source: "base" | "external") => {
    asArray<Record<string, any>>(value).forEach((day, index) => {
      const number = dayNumberOf(day, index + 1);
      const current = map.get(number) || { number, base: [], external: [], title: "", dayIds: [] };
      current[source].push(...getDayServices(day));
      current.title ||= getDayTitle(day);
      if (day.id !== undefined && day.id !== null) current.dayIds.push(String(day.id));
      map.set(number, current);
    });
  };
  consume(quotation.itinerario, "base");
  consume(quotation.itinerario_externo || quotation.itinerarioExterno, "external");
  return [...map.values()].sort((a, b) => a.number - b.number);
};

const baseRecordForDay = (
  quotation: Record<string, any>,
  day: ReturnType<typeof mergeDays>[number],
  agencyMap: Map<number, string>,
): Record<string, any> => {
  const start = parseBibliaDate(quotation.fechainicio || quotation.fecha_inicio || quotation.startDate) || new Date();
  const date = addDays(start, Math.max(0, day.number - 1));
  const services = [...day.base, ...day.external];
  const columns = aggregateServiceColumns(services);
  const excursion = day.title || firstText(
    day.base.map(serviceDescription).find((value) => getBibliaServiceType(day.base.find((s) => serviceDescription(s) === value) || {}) === "endoses"),
    `Día ${day.number}`,
  );
  const category = classifyBibliaActivity(excursion);
  const voucherTarget = resolveBibliaVoucherTarget(quotation);
  return {
    schemaVersion: BIBLIA_SCHEMA_VERSION,
    id: `${String(quotation.id)}-day-${day.number}`,
    sourceType: "day",
    sourceQuotationId: String(quotation.id || ""),
    sourceServiceId: null,
    sourceDayId: day.dayIds.join(",") || String(day.number),
    sourceItinerary: "base",
    quotationId: String(quotation.id || ""),
    dayNumber: day.number,
    order: day.number,
    dateKey: toBibliaDateKey(date),
    file: firstText(quotation.voucher_code, quotation.voucherCode, quotation.id) || EMPTY,
    reservationName: getPrimaryPassenger(quotation),
    pax: getPassengerCount(quotation),
    nationality: getNationality(quotation),
    language: resolveLanguage(quotation),
    serviceMode: resolveServiceMode(quotation),
    time: resolveTimeFromServices(services) || "Sin hora",
    excursion,
    hotelCusco: columns.hotelCusco || EMPTY,
    tickets: columns.tickets || EMPTY,
    hotelValle: columns.hotelValle || EMPTY,
    hotelMapi: columns.hotelMapi || EMPTY,
    restaurant: columns.restaurant || EMPTY,
    endorse: columns.endorse || EMPTY,
    transport: columns.transport || EMPTY,
    guide: columns.guide || EMPTY,
    trainOutbound: columns.trainOutbound || EMPTY,
    trainReturn: columns.trainReturn || EMPTY,
    observations: EMPTY,
    incidents: EMPTY,
    counter: resolveBibliaCounter(quotation) || EMPTY,
    agency: resolveAgencyName(quotation, agencyMap),
    category,
    color: getInitialBibliaColor(category),
    quotationOrigin: "quotation",
    syncQuotation: false,
    isDeleted: false,
    sourceVoucherMedia: voucherTarget.media,
    sourceSalesVoucherId: voucherTarget.voucherId,
  };
};

const editableKeys = BIBLIA_EDITABLE_FIELDS.map(String);
const mergeExplicitRecord = (base: Record<string, any>, explicit: Record<string, any>) => {
  const next = { ...base, ...explicit, schemaVersion: BIBLIA_SCHEMA_VERSION };
  // Preserve auto metadata if a legacy snapshot did not store it.
  editableKeys.forEach((key) => {
    if (explicit[key] === undefined || explicit[key] === null || explicit[key] === "") next[key] = base[key];
  });
  next.color = normalizeBibliaColor(explicit.color || base.color);
  next.dayNumber = Number(explicit.dayNumber ?? explicit.day_number ?? base.dayNumber) || Number(base.dayNumber) || 1;
  next.order = Number(explicit.order ?? base.order ?? next.dayNumber) || next.dayNumber;
  next.sourceType = "day";
  next.sourceQuotationId = String(explicit.sourceQuotationId || explicit.source_quotation_id || base.sourceQuotationId || "");
  next.sourceServiceId = null;
  next.sourceDayId = String(explicit.sourceDayId || explicit.source_day_id || base.sourceDayId || next.dayNumber);
  next.sourceItinerary = "base";
  next.quotationOrigin = firstText(explicit.quotationOrigin, base.quotationOrigin, "quotation");
  next.syncQuotation = explicit.syncQuotation === true || base.syncQuotation === true;
  next.isDeleted = explicit.isDeleted === true;
  return next;
};

const groupLegacyByDate = (records: Array<Record<string, any>>) => {
  const map = new Map<string, Record<string, any>[] >();
  records.forEach((record) => {
    const date = parseBibliaDate(record.dateKey || record.date || record.fecha);
    const key = date ? toBibliaDateKey(date) : "";
    if (!key) return;
    map.set(key, [...(map.get(key) || []), record]);
  });
  return map;
};

const compactLegacyRecords = (records: Record<string, any>[], base: Record<string, any>, dayNumber: number) => {
  if (!records.length) return base;
  const last = records[records.length - 1];
  const merged = { ...base };
  const textFields = [
    "hotelCusco", "tickets", "hotelValle", "hotelMapi", "restaurant", "endorse", "transport", "guide",
    "trainOutbound", "trainReturn", "observations", "incidents",
  ];
  textFields.forEach((key) => {
    const values = records.map((record) => record[key]).filter((value) => firstText(value));
    if (values.length) merged[key] = uniqueText(values);
  });
  ["reservationName", "nationality", "language", "serviceMode", "time", "excursion", "counter", "agency", "color"].forEach((key) => {
    const value = [...records].reverse().map((record) => record[key]).find((candidate) => firstText(candidate));
    if (value !== undefined) merged[key] = value;
  });
  const explicitPax = [...records].reverse().map((record) => Number(record.pax)).find((value) => Number.isFinite(value) && value > 0);
  if (explicitPax) merged.pax = explicitPax;
  merged.id = `${String(base.sourceQuotationId || last.sourceQuotationId || "file")}-day-${dayNumber}`;
  merged.dayNumber = dayNumber;
  merged.order = Number(last.order || base.order || dayNumber);
  merged.isDeleted = records.every((record) => record.isDeleted === true);
  merged.color = normalizeBibliaColor(merged.color);
  return merged;
};

export const materializeQuotationBibliaRecords = (
  quotation: Record<string, any>,
  agencies: Array<Record<string, any>> = [],
): Array<Record<string, any>> => {
  const agencyMap = new Map<number, string>(agencies.map((item) => [Number(item.id), String(item.name || item.nombre || "")]));
  const current = asArray<Record<string, any>>(quotation.biblia_actividades || quotation.bibliaActividades);
  const currentRecords = current.filter((record) => Number(record.schemaVersion || 1) >= BIBLIA_SCHEMA_VERSION);
  if (currentRecords.length && current.every((record) => Number(record.schemaVersion || 1) >= BIBLIA_SCHEMA_VERSION)) {
    // Persisted JSONB is authoritative. Never recreate soft-deleted rows from itinerary.
    return currentRecords.map((record, index) => ({
      ...record,
      schemaVersion: BIBLIA_SCHEMA_VERSION,
      id: String(record.id || `${quotation.id}-day-${record.dayNumber || index + 1}`),
      sourceType: "day",
      sourceQuotationId: String(record.sourceQuotationId || record.quotationId || quotation.id || ""),
      sourceServiceId: null,
      dayNumber: Number(record.dayNumber || index + 1),
      order: Number(record.order || record.dayNumber || index + 1),
      color: normalizeBibliaColor(record.color),
      isDeleted: record.isDeleted === true,
    }));
  }

  const days = mergeDays(quotation);
  const v3 = current.filter((record) => {
    const version = Number(record.schemaVersion || 1);
    return version >= 3 && version < BIBLIA_SCHEMA_VERSION;
  });
  if (v3.length && current.every((record) => Number(record.schemaVersion || 1) >= 3)) {
    // v3 ya es una fila por día. Conservamos cada edición; solamente completamos
    // tickets que v3 dejó vacíos y marcamos el snapshot como v4.
    const pending = new Set(v3);
    const records = days.map((day) => {
      const base = baseRecordForDay(quotation, day, agencyMap);
      const record = v3.find((candidate) =>
        pending.has(candidate)
        && (Number(candidate.dayNumber || 0) === day.number || String(candidate.dateKey || "") === String(base.dateKey)),
      );
      if (!record) return base;
      pending.delete(record);
      const explicit = firstText(record.tickets) ? record : { ...record, tickets: undefined };
      return mergeExplicitRecord(base, explicit);
    });
    // Una fila creada manualmente o de un día que ya no está en el itinerario
    // nunca se descarta durante la transición.
    pending.forEach((record, index) => {
      records.push({
        ...record,
        schemaVersion: BIBLIA_SCHEMA_VERSION,
        id: String(record.id || `${quotation.id}-day-${record.dayNumber || records.length + index + 1}`),
        sourceType: "day",
        sourceQuotationId: String(record.sourceQuotationId || record.quotationId || quotation.id || ""),
        sourceServiceId: null,
        dayNumber: Number(record.dayNumber || records.length + index + 1),
        order: Number(record.order || record.dayNumber || records.length + index + 1),
        color: normalizeBibliaColor(record.color),
        isDeleted: record.isDeleted === true,
      });
    });
    return records;
  }

  const legacy = current.filter((record) => Number(record.schemaVersion || 1) < 3);
  const legacyByDate = groupLegacyByDate(legacy);
  const usedLegacyDates = new Set<string>();
  const records = days.map((day) => {
    const base = baseRecordForDay(quotation, day, agencyMap);
    const sameDate = legacyByDate.get(String(base.dateKey)) || [];
    if (sameDate.length) usedLegacyDates.add(String(base.dateKey));
    return compactLegacyRecords(sameDate, base, day.number);
  });

  // Legacy/manual dates that are not represented by an itinerary day still become a
  // day of the file so no operational data disappears during v2 -> v3 migration.
  let nextNumber = records.reduce((max, row) => Math.max(max, Number(row.dayNumber || 0)), 0) + 1;
  for (const [dateKey, rows] of legacyByDate.entries()) {
    if (usedLegacyDates.has(dateKey)) continue;
    const date = parseBibliaDate(dateKey) || new Date();
    const fallback: Record<string, any> = {
      schemaVersion: BIBLIA_SCHEMA_VERSION,
      id: `${quotation.id}-day-${nextNumber}`,
      sourceType: "day",
      sourceQuotationId: String(quotation.id || ""),
      sourceServiceId: null,
      sourceDayId: String(nextNumber),
      sourceItinerary: "manual",
      quotationId: String(quotation.id || ""),
      dayNumber: nextNumber,
      order: nextNumber,
      dateKey: toBibliaDateKey(date),
      file: firstText(quotation.voucher_code, quotation.voucherCode, quotation.id) || EMPTY,
      reservationName: getPrimaryPassenger(quotation),
      pax: getPassengerCount(quotation),
      nationality: getNationality(quotation),
      language: resolveLanguage(quotation),
      serviceMode: resolveServiceMode(quotation),
      time: "Sin hora",
      excursion: `Día ${nextNumber}`,
      hotelCusco: EMPTY, tickets: EMPTY, hotelValle: EMPTY, hotelMapi: EMPTY,
      restaurant: EMPTY, endorse: EMPTY, transport: EMPTY, guide: EMPTY,
      trainOutbound: EMPTY, trainReturn: EMPTY, observations: EMPTY, incidents: EMPTY,
      counter: resolveBibliaCounter(quotation) || EMPTY,
      agency: resolveAgencyName(quotation, agencyMap),
      category: "general",
      color: BIBLIA_DEFAULT_COLOR,
      quotationOrigin: "quotation",
      syncQuotation: false,
      isDeleted: false,
      sourceVoucherMedia: resolveBibliaVoucherTarget(quotation).media,
      sourceSalesVoucherId: resolveBibliaVoucherTarget(quotation).voucherId,
    };
    records.push(compactLegacyRecords(rows, fallback, nextNumber));
    nextNumber += 1;
  }

  // Cotizaciones nacidas desde Biblia pueden existir antes de tener itinerarios materializados.
  if (!records.length && current.length) {
    return current.map((record, index) => mergeExplicitRecord({
      ...record,
      schemaVersion: BIBLIA_SCHEMA_VERSION,
      id: String(record.id || `${quotation.id}-day-${index + 1}`),
      sourceQuotationId: String(quotation.id || ""),
      dayNumber: Number(record.dayNumber || index + 1),
      order: Number(record.order || index + 1),
      color: normalizeBibliaColor(record.color),
    }, record));
  }
  return records;
};

export const isQuotationBibliaMaterialized = (quotation: Record<string, any>) => {
  const records = asArray<Record<string, any>>(quotation.biblia_actividades || quotation.bibliaActividades);
  return records.length > 0 && records.every((record) => Number(record.schemaVersion || 1) >= BIBLIA_SCHEMA_VERSION);
};

const recordToActivity = (
  record: Record<string, any>,
  quotation: Record<string, any> = {},
  standaloneRecordId: string | null = null,
): BibliaActivity | null => {
  const date = parseBibliaDate(record.dateKey || record.date || record.fecha);
  if (!date) return null;
  const sourceType: BibliaSourceType = standaloneRecordId ? "standalone" : "day";
  const excursion = firstText(record.excursion, record.activity, record.actividad, `Día ${record.dayNumber || ""}`) || "Actividad";
  const voucherTarget = resolveBibliaVoucherTarget(quotation);
  const sourceQuotationId = String(record.sourceQuotationId || record.quotationId || quotation.id || "");
  return {
    id: standaloneRecordId ? `standalone:${standaloneRecordId}` : String(record.id || `${sourceQuotationId}-day-${record.dayNumber || record.order || 1}`),
    dateKey: toBibliaDateKey(date), date,
    file: firstText(record.file, sourceQuotationId) || EMPTY,
    reservationName: firstText(record.reservationName) || EMPTY,
    pax: Number(record.pax || 0), nationality: firstText(record.nationality) || EMPTY,
    participantPlan: record.participantPlan && typeof record.participantPlan === "object"
      ? record.participantPlan as BibliaParticipantPlan
      : null,
    language: firstText(record.language) || EMPTY, serviceMode: firstText(record.serviceMode) || "SIC",
    time: firstText(record.time) || "Sin hora", excursion,
    hotelCusco: firstText(record.hotelCusco) || EMPTY, tickets: firstText(record.tickets) || EMPTY,
    hotelValle: firstText(record.hotelValle) || EMPTY, hotelMapi: firstText(record.hotelMapi) || EMPTY,
    restaurant: firstText(record.restaurant) || EMPTY, endorse: firstText(record.endorse) || EMPTY,
    transport: firstText(record.transport) || EMPTY, guide: firstText(record.guide) || EMPTY,
    trainOutbound: firstText(record.trainOutbound) || EMPTY, trainReturn: firstText(record.trainReturn) || EMPTY,
    observations: firstText(record.observations) || EMPTY, incidents: firstText(record.incidents) || EMPTY,
    counter: firstText(record.counter) || EMPTY, agency: firstText(record.agency, quotation.agency_name) || EMPTY,
    category: classifyBibliaActivity(excursion), color: normalizeBibliaColor(record.color),
    order: Number(record.order || record.dayNumber || 0), sourceType,
    sourceQuotationId, sourceServiceId: "", sourceDayId: String(record.sourceDayId || record.dayNumber || ""),
    sourceItinerary: standaloneRecordId ? "standalone" : (record.sourceItinerary === "manual" ? "manual" : "base"),
    sourceVoucherMedia: normalizeVoucherMedia(record.sourceVoucherMedia) || voucherTarget.media,
    sourceSalesVoucherId: Number(record.sourceSalesVoucherId || voucherTarget.voucherId || 0) || null,
    standaloneRecordId, service: record.service || {}, overrideRecord: record,
    dayNumber: Number(record.dayNumber || 0), quotationOrigin: firstText(record.quotationOrigin) || "quotation",
    syncQuotation: record.syncQuotation === true, isDeleted: record.isDeleted === true,
    sourceExcel: record.sourceExcel && typeof record.sourceExcel === "object" ? record.sourceExcel : null,
  };
};

export const buildBibliaActivitiesFromSnapshots = (
  quotations: Array<Record<string, any>> = [],
  standaloneRows: Array<Record<string, any>> = [],
): BibliaActivity[] => {
  const result: BibliaActivity[] = [];
  const quotationMap = new Map(quotations.map((quotation) => [String(quotation.id || ""), quotation]));
  quotations.forEach((quotation) => {
    asArray<Record<string, any>>(quotation.biblia_actividades || quotation.bibliaActividades).forEach((record) => {
      const activity = recordToActivity(record, quotation);
      if (activity && !activity.isDeleted) result.push(activity);
    });
  });
  standaloneRows.forEach((outer) => {
    const linkedQuotationId = String(outer.cotizacion_id || "");
    const linkedQuotation = quotationMap.get(linkedQuotationId) || {};
    const activity = recordToActivity(outer.actividad || outer.activity || {}, linkedQuotation, String(outer.id || ""));
    if (activity && !activity.isDeleted && outer.is_active !== false) {
      activity.sourceQuotationId = linkedQuotationId || activity.sourceQuotationId;
      activity.platform = String(outer.platform || linkedQuotation.platform || "");
      result.push(activity);
    }
  });
  return result.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.order - b.order || a.id.localeCompare(b.id));
};

// Compatibilidad para callers/tests antiguos: primero materializa y luego renderiza snapshots.
export const buildBibliaActivities = (
  quotations: Array<Record<string, any>> = [],
  agencies: Array<Record<string, any>> = [],
) => buildBibliaActivitiesFromSnapshots(
  quotations.map((quotation) => ({ ...quotation, biblia_actividades: materializeQuotationBibliaRecords(quotation, agencies) })),
  [],
);

export const materializeBibliaOverride = (
  activity: BibliaActivity,
  changes: Partial<BibliaActivity> = {},
): Record<string, any> => {
  const merged = { ...activity, ...changes } as BibliaActivity;
  const record: Record<string, any> = {
    ...(activity.overrideRecord || {}),
    schemaVersion: BIBLIA_SCHEMA_VERSION,
    id: activity.overrideRecord?.id || activity.id.replace(/^standalone:/, "standalone-entry:"),
    sourceType: activity.sourceType === "standalone" ? "standalone" : "day",
    sourceQuotationId: merged.sourceQuotationId || "",
    sourceServiceId: null,
    sourceDayId: merged.sourceDayId || String(merged.dayNumber || ""),
    sourceItinerary: merged.sourceItinerary,
    quotationId: merged.sourceQuotationId || null,
    dayNumber: Number(merged.dayNumber || 0),
    quotationOrigin: merged.quotationOrigin || (activity.sourceType === "standalone" ? "standalone" : "quotation"),
    syncQuotation: merged.syncQuotation === true,
    isDeleted: merged.isDeleted === true,
    order: Number(merged.order || 0),
  };
  BIBLIA_EDITABLE_FIELDS.forEach((field) => { record[field] = merged[field]; });
  if (merged.participantPlan) record.participantPlan = merged.participantPlan;
  if (merged.sourceExcel) record.sourceExcel = merged.sourceExcel;
  return record;
};

export const upsertBibliaOverride = (
  existing: Array<Record<string, any>> = [],
  record: Record<string, any>,
) => {
  const id = String(record.id || "");
  const next = existing.filter((item) => String(item.id || "") !== id);
  next.push(record);
  return next.sort((a, b) => Number(a.order || a.dayNumber || 0) - Number(b.order || b.dayNumber || 0));
};

const stableRecord = (record: Record<string, any>) => {
  const sorted: Record<string, any> = {};
  Object.keys(record).sort().forEach((key) => { sorted[key] = record[key]; });
  return sorted;
};
export const bibliaRecordsEqual = (left: Array<Record<string, any>>, right: Array<Record<string, any>>) =>
  JSON.stringify(left.map(stableRecord)) === JSON.stringify(right.map(stableRecord));

export const getBibliaTransportOptions = (activities: BibliaActivity[] = []) => {
  const seen = new Set<string>();
  return activities
    .map((activity) => firstText(activity.transport))
    .filter((transport) => {
      const key = normalize(transport);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" }));
};

export const matchesBibliaTransport = (activity: Pick<BibliaActivity, "transport">, selectedTransport: string) => {
  if (!selectedTransport || selectedTransport === "all") return true;
  return normalize(activity.transport) === normalize(selectedTransport);
};

const getBibliaTextOptions = (values: unknown[] = []) => {
  const seen = new Set<string>();
  return values
    .map((value) => firstText(value))
    .filter((value) => {
      const key = normalize(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" }));
};

export const getBibliaEndorseOptions = (activities: BibliaActivity[] = []) =>
  getBibliaTextOptions(activities.map((activity) => activity.endorse));

export const getBibliaReservationOptions = (activities: BibliaActivity[] = []) =>
  getBibliaTextOptions(activities.map((activity) => activity.reservationName));

// La descripción de tren conserva el proveedor como primer segmento, tanto en
// el formato de catálogo (Empresa · Servicio · Ruta) como en snapshots antiguos
// (Empresa / Servicio / Ruta). El filtro no expone vagón, ruta ni horario.
const getBibliaTrainProvider = (value: unknown) => {
  const train = firstText(value);
  if (!train) return "";
  return train.split(/\s+[·/]\s+/u)[0]?.trim() || "";
};

const activityTrainProviders = (activity: Pick<BibliaActivity, "trainOutbound" | "trainReturn">) =>
  [getBibliaTrainProvider(activity.trainOutbound), getBibliaTrainProvider(activity.trainReturn)].filter(Boolean);

export const getBibliaTrainProviderOptions = (activities: BibliaActivity[] = []) =>
  getBibliaTextOptions(activities.flatMap((activity) => activityTrainProviders(activity)));

export const matchesBibliaTrainProvider = (
  activity: Pick<BibliaActivity, "trainOutbound" | "trainReturn">,
  selectedProvider: string,
) => {
  if (!selectedProvider || selectedProvider === "all") return true;
  return activityTrainProviders(activity).some((provider) => normalize(provider) === normalize(selectedProvider));
};

export type BibliaActivityFilters = {
  search?: string;
  serviceMode?: string;
  language?: string;
  agency?: string;
  transport?: string;
  endorse?: string;
  reservationName?: string;
  trainProvider?: string;
};

const matchesBibliaSelection = (value: unknown, selection?: string) =>
  !selection || selection === "all" || normalize(value) === normalize(selection);

const searchableBibliaActivityText = (activity: BibliaActivity) => normalize([
  activity.dateKey,
  activity.file,
  activity.reservationName,
  activity.pax,
  activity.nationality,
  activity.language,
  activity.serviceMode,
  activity.time,
  activity.excursion,
  activity.hotelCusco,
  activity.tickets,
  activity.hotelValle,
  activity.hotelMapi,
  activity.restaurant,
  activity.endorse,
  activity.transport,
  activity.guide,
  activity.trainOutbound,
  activity.trainReturn,
  activity.observations,
  activity.incidents,
  activity.counter,
  activity.agency,
].join(" "));

export const filterBibliaActivities = (
  activities: BibliaActivity[] = [],
  filters: BibliaActivityFilters = {},
) => {
  const query = normalize(filters.search);
  return activities.filter((activity) => {
    if (!matchesBibliaSelection(activity.serviceMode, filters.serviceMode)) return false;
    if (!matchesBibliaSelection(activity.language, filters.language)) return false;
    if (!matchesBibliaSelection(activity.agency, filters.agency)) return false;
    if (!matchesBibliaTransport(activity, filters.transport || "all")) return false;
    if (!matchesBibliaSelection(activity.endorse, filters.endorse)) return false;
    if (!matchesBibliaSelection(activity.reservationName, filters.reservationName)) return false;
    if (!matchesBibliaTrainProvider(activity, filters.trainProvider || "all")) return false;
    return !query || searchableBibliaActivityText(activity).includes(query);
  });
};

export const hasBibliaActiveFilters = (filters: BibliaActivityFilters = {}) =>
  Boolean(String(filters.search || "").trim())
  || [
    filters.serviceMode, filters.language, filters.agency, filters.transport,
    filters.endorse, filters.reservationName, filters.trainProvider,
  ]
    .some((value) => value && value !== "all");

export const getBibliaQuotationVoucherCode = (quotation: Record<string, any> = {}) =>
  firstText(quotation.source_sales_voucher_code, quotation.sourceSalesVoucherCode, quotation.voucher_code, quotation.voucherCode);

export const getBibliaQuotationLinkLabel = (quotation: Record<string, any> = {}) => {
  const id = firstText(quotation.id) || "Cotización";
  const title = firstText(quotation.titulo, quotation.title);
  const voucherCode = getBibliaQuotationVoucherCode(quotation);
  return [id, title, voucherCode].filter(Boolean).join(" · ");
};

export const matchesBibliaQuotationLinkQuery = (quotation: Record<string, any> = {}, query = "") => {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;
  return normalize([
    quotation.id, quotation.titulo, quotation.title, quotation.agency_name,
    getBibliaQuotationVoucherCode(quotation),
  ].filter(Boolean).join(" ")).includes(normalizedQuery);
};

export const buildStandaloneBibliaRecord = ({
  dateKey,
  order,
  localId,
}: {
  dateKey: string;
  order: number;
  localId: string;
}): Record<string, any> => ({
  schemaVersion: BIBLIA_SCHEMA_VERSION,
  id: `standalone-entry:${localId}`,
  sourceType: "standalone",
  sourceQuotationId: "",
  sourceServiceId: null,
  sourceDayId: null,
  sourceItinerary: "standalone",
  quotationId: null,
  quotationOrigin: "standalone",
  syncQuotation: false,
  isDeleted: false,
  dayNumber: 1,
  order: Math.max(1, Number(order || 1)),
  dateKey,
  file: EMPTY,
  reservationName: EMPTY,
  pax: 0,
  nationality: EMPTY,
  language: EMPTY,
  serviceMode: "SIC",
  time: "Sin hora",
  excursion: "Actividad",
  hotelCusco: EMPTY,
  tickets: EMPTY,
  hotelValle: EMPTY,
  hotelMapi: EMPTY,
  restaurant: EMPTY,
  endorse: EMPTY,
  transport: EMPTY,
  guide: EMPTY,
  trainOutbound: EMPTY,
  trainReturn: EMPTY,
  observations: EMPTY,
  incidents: EMPTY,
  counter: EMPTY,
  agency: EMPTY,
  color: BIBLIA_DEFAULT_COLOR,
});
