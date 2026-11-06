import { BIBLIA_EMPTY_VALUE, getBibliaQuotationVoucherCode, type BibliaActivity } from "./bibliaActivityMapper";
import { buildParticipantPlan, initialParticipantDraft, participantDraftError, quotationParticipantDraft } from "./bibliaParticipantEditor";
import { participantNationalityLabel } from "./bibliaNationality";

const text = (...values: unknown[]) => values.map(value => String(value ?? "").trim())
  .find(value => value && ![BIBLIA_EMPTY_VALUE, "***", "****"].includes(value)) || "";
const modeLabel = (value: unknown) => {
  const mode = String(value ?? "").toLowerCase();
  return mode.includes("priv") ? "PRIV" : /comp|sic/.test(mode) ? "SIC" : mode === "mixto" ? "MIXTO" : "";
};
const languageLabel = (value: unknown) => ({ es: "ESPAÑOL", en: "INGLES", pt: "PORTUGUES" }[String(value ?? "").toLowerCase()] || text(value));

/** Completa datos del file antes de validar. Conserva el subconjunto del día y
 * todos sus servicios; una fila nueva no necesita inventar pasajeros primero. */
export function prepareBibliaLinkActivity(activity: BibliaActivity, quotation: Record<string, any>): BibliaActivity {
  const next = { ...activity };
  const templates = (Array.isArray(quotation.biblia_actividades) ? quotation.biblia_actividades : [])
    .filter(row => row && !row.isDeleted)
    .sort((a, b) => Number(b.dateKey === activity.dateKey) - Number(a.dateKey === activity.dateKey));
  const templateText = (field: string) => text(...templates.map(row => row[field]));
  const dayNumber = Math.round((Date.parse(`${activity.dateKey}T00:00:00Z`)
    - Date.parse(`${String(quotation.fechainicio ?? quotation.fechaInicio ?? "").slice(0, 10)}T00:00:00Z`)) / 86400000) + 1;
  const day = (Array.isArray(quotation.itinerario) ? quotation.itinerario : [])
    .find((day, index) => Number(day.numero ?? day.dayNumber ?? index + 1) === dayNumber);
  const roster = quotationParticipantDraft(quotation);
  const count = roster ? roster.adults.length + roster.children.length
    : Number(quotation.num_adults || 0) + Number(quotation.num_children || 0) || Number(quotation.cantidadpersonas || 0);
  // Los ceros importados (p. ej. traslado de equipaje) son datos explícitos.
  const inheritPax = Number(activity.pax) === 0 && !activity.sourceExcel;
  if (inheritPax && Number.isInteger(count) && count > 0 && count <= 200) next.pax = count;
  const firstPassenger = quotation.passengers?.[0];
  next.file = getBibliaQuotationVoucherCode(quotation) || String(quotation.id);
  next.reservationName = text(activity.reservationName, templateText("reservationName"), quotation.titulo,
    [firstPassenger?.nombres, firstPassenger?.apellidos].filter(Boolean).join(" ")) || BIBLIA_EMPTY_VALUE;
  next.language = text(activity.language) || languageLabel(quotation.idioma) || templateText("language") || BIBLIA_EMPTY_VALUE;
  if (inheritPax || !text(activity.serviceMode)) next.serviceMode = modeLabel(day?.tipoServicio ?? day?.tipo_servicio)
    || templates.filter(row => row.dateKey === activity.dateKey).map(row => modeLabel(row.serviceMode)).find(Boolean)
    || modeLabel(quotation.packagetype ?? quotation.packageType) || "SIC";
  const planCount = Number(activity.participantPlan?.adults?.count || 0) + Number(activity.participantPlan?.children?.count || 0);
  if (next.pax > 0 && (!next.participantPlan || inheritPax && planCount === 0)
    && (inheritPax || !text(activity.nationality))) {
    const draft = initialParticipantDraft({ ...next, participantPlan: null }, quotation);
    if (!participantDraftError(draft, next.pax) && (roster || text(activity.nationality))) {
      next.participantPlan = buildParticipantPlan(draft);
      next.nationality = participantNationalityLabel(next.participantPlan);
    } else if (inheritPax && roster) {
      // Un padrón sin nacionalidades sigue siendo el padrón real: no convertir
      // niños a adultos ni atribuir un país a todos para superar la validación.
      next.participantPlan = null;
      next.nationality = BIBLIA_EMPTY_VALUE;
    }
  }
  return next;
}
