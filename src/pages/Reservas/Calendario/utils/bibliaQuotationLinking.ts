import { BIBLIA_EMPTY_VALUE, BibliaActivity, materializeBibliaOverride } from "./bibliaActivityMapper";

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
  return [...groups.values()].map(group => ({ ...group, dates: group.dates.sort() }))
    .sort((a, b) => b.records - a.records || String(a.quotation.id).localeCompare(String(b.quotation.id), "es"));
}

export function getBibliaLinkUnavailableReason(activity: BibliaActivity, quotation: Record<string, any>) {
  if (quotation.is_active === false) return "Cotización inactiva";
  if (quotation.tiene_voucher === true || quotation.source_sales_voucher_id || quotation.sourceSalesVoucherId)
    return "Venta cerrada: requiere revisión postventa";
  const start = String(quotation.fechainicio ?? quotation.fechaInicio ?? "").slice(0, 10);
  const day = String(activity.dateKey).slice(0, 10);
  const timestamp = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
  const difference = (timestamp(day) - timestamp(start)) / 86400000;
  if (!Number.isFinite(difference)) return "Completa la fecha de inicio de la cotización";
  if (difference < 0 || difference >= 120) return "La fecha del registro queda fuera del itinerario permitido";
  return "";
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
      if (Object.prototype.hasOwnProperty.call(changes, field)
        && JSON.stringify(comparable(activity[field])) !== JSON.stringify(comparable(record[field]))) fields.add(field);
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
