import type { BibliaActivity, BibliaParticipantPlan } from "./bibliaActivityMapper";
import { isUnresolvedParticipantNationality } from "./bibliaNationality";
import { getCountryNames } from "../../../../utils/countries";
export { participantCountryLabel } from "./bibliaNationality";

export type ParticipantKind = "adults" | "children";
export interface ParticipantDraft { adults: string[]; children: string[] }
const normalized = (value: unknown) => String(value ?? "").trim().toLowerCase()
  .normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ");
const nationalityKey = (country: string) => ["peru", "peruana", "peruano", "peruvian"].includes(normalized(country))
  ? "peru" : normalized(country);
const safeCount = (value: unknown) => Math.min(200, Math.max(0, Math.trunc(Number(value) || 0)));
const claimCountryIndex = (available: string[], country: string) => {
  const exact = available.findIndex(value => nationalityKey(value) === nationalityKey(country));
  return exact >= 0 ? exact : available.findIndex(isUnresolvedParticipantNationality);
};
const expand = (group: BibliaParticipantPlan["adults"]) => {
  const result: string[] = [];
  for (const row of Array.isArray(group?.nationalities) ? group.nationalities.filter(Boolean) : []) {
    result.push(...Array.from({ length: Math.min(safeCount(row.count), 200 - result.length) }, () => String(row.country || "").trim()));
  }
  return Array.from({ length: safeCount(group?.count) }, (_, index) => result[index] || "");
};

export function quotationParticipantDraft(quotation?: Record<string, any>): ParticipantDraft | null {
  if (!Array.isArray(quotation?.passengers) || !quotation.passengers.length) return null;
  const draft: ParticipantDraft = { adults: [], children: [] };
  for (const passenger of quotation.passengers) {
    const type = normalized(passenger.tipo_pasajero);
    const kind = ["child", "children", "nino"].includes(type)
      || normalized(passenger.passenger_key).startsWith("child") ? "children" : "adults";
    draft[kind].push(String(passenger.nacionalidad ?? "").trim());
  }
  return draft;
}

/** Redimensiona solo el formulario; nunca modifica el padrón ni el snapshot. */
export function resizeParticipantDraft(draft: ParticipantDraft, pax: number): ParticipantDraft {
  const total = safeCount(pax);
  const adults = draft.adults.slice(0, total);
  const children = draft.children.slice(0, total - adults.length);
  while (adults.length + children.length < total) adults.push("");
  return { adults, children };
}

export function initialParticipantDraft(activity: BibliaActivity, quotation?: Record<string, any>): ParticipantDraft {
  const roster = quotationParticipantDraft(quotation);
  if (roster) {
    // Un file existente es el máximo; la selección del día no redefine su padrón.
    if (activity.participantPlan) {
      const saved = { adults: expand(activity.participantPlan.adults), children: expand(activity.participantPlan.children) };
      if (!participantQuotationError(saved, saved.adults.length + saved.children.length, quotation)) {
        const total = Math.min(safeCount(activity.pax), roster.adults.length + roster.children.length);
        let next = { adults: saved.adults.slice(0, total), children: saved.children.slice(0, Math.max(0, total - saved.adults.length)) };
        while (next.adults.length + next.children.length < total) {
          const kind = next.adults.length < roster.adults.length ? "adults" : "children";
          next = changeLinkedParticipantCount(next, kind, 1, roster);
        }
        return next;
      }
    }
    const total = Math.min(safeCount(activity.pax), roster.adults.length + roster.children.length);
    const individual = (country: string) => isUnresolvedParticipantNationality(country) ? "" : country;
    return { adults: roster.adults.slice(0, total).map(individual), children: roster.children.slice(0, Math.max(0, total - roster.adults.length)).map(individual) };
  }
  if (activity.participantPlan) return resizeParticipantDraft({
    adults: expand(activity.participantPlan.adults), children: expand(activity.participantPlan.children),
  }, activity.pax);
  const raw = String(activity.overrideRecord?.nationality ?? activity.nationality ?? "").trim();
  const rows = raw === "—" ? [] : raw.split(/[,;/\n]/).map(country => country.trim()).filter(Boolean);
  const countries = rows.flatMap(row => {
    const counted = row.match(/^(.*?)\s*[xX]\s*(\d+)$/);
    return counted ? Array.from({ length: safeCount(counted[2]) }, () => counted[1].trim()) : [row];
  });
  const adults = countries.length === 1 && rows.length === 1 && !/[xX]\s*\d+$/.test(raw)
    ? Array.from({ length: safeCount(activity.pax) }, () => countries[0]) : countries;
  return resizeParticipantDraft({ adults, children: [] }, activity.pax);
}

/** Agrega o retira un beneficiario real, sin convertir adultos en niños. */
export function changeLinkedParticipantCount(draft: ParticipantDraft, kind: ParticipantKind, delta: 1 | -1, roster: ParticipantDraft): ParticipantDraft {
  if (delta < 0) return draft[kind].length
    ? { ...draft, [kind]: draft[kind].slice(0, -1) } : draft;
  const remaining = [...roster[kind]];
  for (const country of draft[kind]) {
    const index = claimCountryIndex(remaining, country);
    if (index >= 0) remaining.splice(index, 1);
  }
  return remaining.length ? { ...draft, [kind]: [...draft[kind], isUnresolvedParticipantNationality(remaining[0]) ? "" : remaining[0]] } : draft;
}

export function availableParticipantCountries(draft: ParticipantDraft, kind: ParticipantKind, index: number, roster: ParticipantDraft): string[] {
  const remaining = [...roster[kind]];
  draft[kind].forEach((country, selected) => {
    if (selected === index) return;
    const found = claimCountryIndex(remaining, country);
    if (found >= 0) remaining.splice(found, 1);
  });
  return remaining.some(isUnresolvedParticipantNationality) ? getCountryNames() : [...new Set(remaining)];
}

/** +/- cambia la categoría de un pasajero, sin aumentar ni reducir el PAX. */
export function changeParticipantCategory(draft: ParticipantDraft, kind: ParticipantKind, delta: 1 | -1): ParticipantDraft {
  const destination = delta > 0 ? kind : kind === "adults" ? "children" : "adults";
  const source = destination === "adults" ? "children" : "adults";
  if (!draft[source].length) return draft;
  const next = { adults: [...draft.adults], children: [...draft.children] };
  next[destination].push(next[source].pop()!);
  return next;
}

export function buildParticipantPlan(draft: ParticipantDraft): BibliaParticipantPlan {
  const group = (values: string[]) => {
    const counts = new Map<string, number>();
    for (const value of values) {
      const country = value.trim();
      counts.set(country, (counts.get(country) || 0) + 1);
    }
    return { count: values.length, nationalities: [...counts].map(([country, count]) => ({ country, count })) };
  };
  return { version: 1, adults: group(draft.adults), children: group(draft.children) };
}

export function participantDraftError(draft: ParticipantDraft, pax: number): string {
  if (!Number.isInteger(pax) || pax < 0 || pax > 200 || draft.adults.length + draft.children.length !== pax)
    return "Adultos y niños deben sumar el PAX del día (entre 0 y 200 pasajeros).";
  if ([...draft.adults, ...draft.children].some(isUnresolvedParticipantNationality))
    return "Selecciona la nacionalidad de cada adulto y niño antes de guardar.";
  return "";
}

/** La compatibilidad con el file se valida al vincular/sincronizar, no al guardar Biblia. */
export function participantQuotationError(draft: ParticipantDraft, pax: number, quotation?: Record<string, any>): string {
  const roster = quotationParticipantDraft(quotation);
  // Un día puede ser un subconjunto, pero no ampliar ni redefinir el file.
  if (!roster) return "";
  if (pax > roster.adults.length + roster.children.length)
    return "Los beneficiarios del día no pueden superar el padrón de la cotización. Revisa sus pasajeros en Cotizaciones.";
  for (const kind of ["adults", "children"] as const) {
    const available = [...roster[kind]];
    for (const country of draft[kind]) {
      const index = claimCountryIndex(available, country);
      if (index < 0) return `La cotización vinculada no tiene suficientes ${kind === "adults" ? "adultos" : "niños"} de ${country} para este día. Ajusta la distribución o revisa sus pasajeros en Cotizaciones.`;
      available.splice(index, 1);
    }
  }
  return "";
}

export function bibliaParticipantPlanError(activity: BibliaActivity, quotation?: Record<string, any>): string {
  if (Number(activity.pax) < 1) return "El día necesita al menos un beneficiario para vincular o sincronizar sus servicios.";
  if (!activity.participantPlan) {
    const roster = quotationParticipantDraft(quotation);
    return roster && Number(activity.pax) > roster.adults.length + roster.children.length
      ? "Los beneficiarios del día no pueden superar el padrón de la cotización. Revisa sus pasajeros en Cotizaciones." : "";
  }
  for (const group of [activity.participantPlan.adults, activity.participantPlan.children]) {
    if (!group || !Number.isInteger(group.count) || group.count < 0 || group.count > 200
      || !Array.isArray(group.nationalities)
      || group.nationalities.some(row => !Number.isInteger(row.count) || row.count <= 0 || !String(row.country || "").trim())
      || group.nationalities.reduce((total, row) => total + row.count, 0) !== group.count)
      return "Revisa la distribución de participantes: las nacionalidades deben completar cada grupo antes de vincular.";
  }
  const draft = { adults: expand(activity.participantPlan.adults), children: expand(activity.participantPlan.children) };
  return participantDraftError(draft, Number(activity.pax)) || participantQuotationError(draft, Number(activity.pax), quotation);
}
