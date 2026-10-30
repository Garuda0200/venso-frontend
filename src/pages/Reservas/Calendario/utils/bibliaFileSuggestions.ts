import type { BibliaActivity } from "./bibliaActivityMapper";
import { buildParticipantPlan, initialParticipantDraft, participantDraftError } from "./bibliaParticipantEditor";
import { participantNationalityLabel } from "./bibliaNationality";
const fileKey = (value: unknown) => String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
export function getBibliaFileSources(activity: BibliaActivity, code: string, activities: BibliaActivity[]): BibliaActivity[] {
  const wanted = fileKey(code);
  if (!wanted || wanted === "—") return [];
  return activities.filter(row => row.id !== activity.id && row.dateKey !== activity.dateKey && !row.isDeleted
    && fileKey(row.file) === wanted && Number.isInteger(row.pax) && row.pax > 0 && row.pax <= 200)
    .sort((a, b) => Number(b.dateKey < activity.dateKey) - Number(a.dateKey < activity.dateKey)
      || b.dateKey.localeCompare(a.dateKey) || b.pax - a.pax || a.id.localeCompare(b.id));
}
/** An explicit choice copies only the day participants, never services or links. */
export function buildBibliaFileCopy(source: BibliaActivity, quotations: Record<string, any>[] = []) {
  const quote = Array.isArray(quotations) ? quotations.find(q => String(q.id) === source.sourceQuotationId) : undefined;
  const draft = initialParticipantDraft(source, quote);
  const plan = participantDraftError(draft, source.pax) ? null : buildParticipantPlan(draft);
  return { pax: String(source.pax), reservationName: source.reservationName,
    language: source.language, nationality: participantNationalityLabel(plan, source.nationality),
    participantPlan: JSON.stringify(plan) };
}
