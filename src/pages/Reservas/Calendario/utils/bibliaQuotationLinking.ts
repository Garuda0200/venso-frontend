import { prepareBibliaLinkActivity } from "./bibliaLinkDefaults";
import { bibliaQuotationFieldValue, isBibliaHotelField } from "./bibliaServiceLinkModes";
import { BIBLIA_EMPTY_VALUE, BibliaActivity, materializeBibliaOverride } from "./bibliaActivityMapper";
import { bibliaParticipantPlanError } from "./bibliaParticipantEditor";
import { isEmptyReservationFile } from "../../../Ventas/Cotizaciones/utils/reservationFileCreation";

export const BIBLIA_QUOTATION_SYNC_LABELS = {
  dateKey: "Fecha", pax: "Pasajeros", participantPlan: "Participantes y nacionalidades",
  nationality: "Nacionalidad", language: "Idioma", serviceMode: "Tipo de servicio",
  transport: "Transporte", trainOutbound: "Tren ida", trainReturn: "Tren retorno",
  restaurant: "Restaurante", hotelCusco: "Hotel Cusco", hotelValle: "Hotel Valle",
  hotelMapi: "Hotel Mapi", tickets: "Entradas", endorse: "Endose", guide: "Guía",
  excursion: "Excursión", time: "Hora",
} as const;
const fileKey = (value: unknown) => {
  const text = String(value ?? "").trim().normalize("NFKC").toUpperCase();
  return text === BIBLIA_EMPTY_VALUE ? "" : text;
};

/** Nunca aproxima un código ni elige una cotización si hay varias. */
export function getBibliaLinkRecommendations(activity: BibliaActivity, activities: BibliaActivity[], quotations: Record<string, any>[]) {
  const code = fileKey(activity.file);
  if (!code) return [];
  const authorized = new Map(quotations.filter(quote => quote.is_active !== false)
    .map(quote => [String(quote.id), quote]));
  const groups = new Map<string, { quotation: Record<string, any>; dates: string[]; records: number }>();
  for (const other of activities) {
    if (other.id === activity.id || other.isDeleted || !other.sourceQuotationId
      || fileKey(other.file) !== code || other.sourceQuotationId === activity.sourceQuotationId) continue;
    const quotation = authorized.get(other.sourceQuotationId);
    if (!quotation || (activity.platform && quotation.platform && activity.platform !== quotation.platform)) continue;
    const group = groups.get(other.sourceQuotationId) || { quotation, dates: [], records: 0 };
    group.records++;
    if (!group.dates.includes(other.dateKey)) group.dates.push(other.dateKey);
    groups.set(other.sourceQuotationId, group);
  }
  // Un file abierto desde Reservas todavía no tiene un primer día que recomendar.
  const emptyMatches = [...authorized.values()].filter(quotation =>
    fileKey(quotation.voucher_code) === code
    && String(quotation.id) !== activity.sourceQuotationId
    && (!activity.platform || !quotation.platform || activity.platform === quotation.platform));
  if (!groups.size && emptyMatches.length === 1 && isEmptyReservationFile(emptyMatches[0])) {
    const quotation = emptyMatches[0];
    groups.set(String(quotation.id), { quotation, dates: [], records: 0 });
  }
  return [...groups.values()].map(group => ({ ...group, dates: group.dates.sort() }))
    .sort((a, b) => b.records - a.records || String(a.quotation.id).localeCompare(String(b.quotation.id), "es"));
}

const dateTimestamp = (value: unknown) => {
  const date = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date ? time : NaN;
};

/** La fecha absoluta manda sobre dayNumber, que puede proceder de un Excel. */
export function getBibliaLinkDateWindow(activity: BibliaActivity, quotation: Record<string, any>) {
  const start = dateTimestamp(quotation.fechainicio ?? quotation.fechaInicio);
  const incoming = dateTimestamp(activity.dateKey);
  const lastDay = Math.max(1, ...[quotation.itinerario, quotation.itinerario_externo]
    .flatMap(days => Array.isArray(days) ? days : [])
    .map((day, index) => Number(day.numero ?? day.dayNumber ?? index + 1))
    .filter(number => Number.isInteger(number) && number > 0));
  const end = dateTimestamp(quotation.fechafin ?? quotation.fechaFin);
  const existingEnd = Math.max(start + (lastDay - 1) * 86400000, Number.isFinite(end) ? end : start);
  const first = Math.min(start, incoming);
  const last = Math.max(existingEnd, incoming);
  return { start, incoming, first, last, days: (last - first) / 86400000 + 1 };
}

export function getBibliaLinkDateNotice(activity: BibliaActivity, quotation: Record<string, any>) {
  const window = getBibliaLinkDateWindow(activity, quotation);
  if (!Number.isFinite(window.days) || window.days > 120 || window.incoming >= window.start) return "";
  const date = new Date(window.incoming).toISOString().slice(0, 10).split("-").reverse().join("/");
  return `El inicio se ampliará al ${date}; los días existentes conservarán sus fechas.`;
}

export function getBibliaLinkUnavailableReason(activity: BibliaActivity, quotation: Record<string, any>) {
  if (quotation.is_active === false) return "Cotización inactiva";
  if (quotation.tiene_voucher === true || quotation.source_sales_voucher_id || quotation.sourceSalesVoucherId)
    return "Venta cerrada: requiere revisión postventa";
  const window = getBibliaLinkDateWindow(activity, quotation);
  if (!Number.isFinite(window.incoming)) return "Fecha del registro inválida";
  if (isEmptyReservationFile(quotation)) return Number(activity.pax) === 0 ? "" : bibliaParticipantPlanError(activity);
  if (!Number.isFinite(window.start)) return "Completa la fecha de inicio de la cotización";
  if (window.days > 120) return "El vínculo superaría el máximo de 120 días del itinerario";
  return bibliaParticipantPlanError(prepareBibliaLinkActivity(activity, quotation), quotation);
}

const comparable = (value: unknown) => typeof value === "string"
  ? (["", BIBLIA_EMPTY_VALUE, "Sin hora"].includes(value.trim()) ? null : value.trim()) : value ?? null;

/** Guarda el registro operativo sin ejecutar una sincronización implícita. */
export function buildBibliaEditRecord(activity: BibliaActivity, changes: Partial<BibliaActivity>) {
  const record = materializeBibliaOverride(activity, changes);
  const fields = new Set<string>((activity.overrideRecord?.quotationSyncFields || [])
    .filter((field: string) => field in BIBLIA_QUOTATION_SYNC_LABELS));
  if (activity.sourceQuotationId) {
    for (const field of Object.keys(BIBLIA_QUOTATION_SYNC_LABELS)) {
      if ((Object.prototype.hasOwnProperty.call(changes, field) || (changes.serviceLinkModes !== undefined && isBibliaHotelField(field)))
        && JSON.stringify(comparable(bibliaQuotationFieldValue(activity, field))) !== JSON.stringify(comparable(bibliaQuotationFieldValue(record, field)))) fields.add(field);
    }
  }
  record.syncQuotation = false;
  record.quotationSyncPending = Boolean(activity.sourceQuotationId)
    && (activity.overrideRecord?.quotationSyncPending === true || fields.size > 0);
  record.quotationSyncFields = activity.sourceQuotationId ? [...fields] : [];
  return record;
}

/** Solo el registro confirmado lleva el comando; las marcas legacy de otros
 * días no deben provocar una resincronización de toda la cotización. */
export function quotationSyncCommandRecords(records: Record<string, any>[], targetId?: string) {
  return records.map(record => ({ ...record, syncQuotation: Boolean(targetId) && String(record.id) === targetId }));
}

export function getBibliaPendingChangeLabels(activity: BibliaActivity) {
  return [...new Set<string>((activity.overrideRecord?.quotationSyncFields || [])
    .map((field: string) => BIBLIA_QUOTATION_SYNC_LABELS[field]).filter(Boolean))];
}
