import { getReservationQuotedIdentity, getReservationSummaryServiceSource } from "../../../utils/reservationSummaryServiceMatching";

const first = (...values: unknown[]) => values.find(value => value !== undefined && value !== null && String(value).trim() !== "");
const id = (row: any = {}) => first(row.servicioId, row.itinerarioServicioId, row.itinerario_servicio_id, row.id);
const uid = (row: any = {}) => first(row.versionUid, row.version_uid);
const reference = (row: any = {}) => row.cotizacionServiceRef || row.cotizacion_service_ref || {};
const equal = (left: unknown, right: unknown) => left != null && right != null && String(left) === String(right);
const only = (rows: any[]) => rows.length === 1 ? rows[0] : null;
const beneficiaries = (row: any = {}) => {
  const selection = row.passengerSelection || row.tariff?.passengerSelection;
  const rows = [...(row.beneficiariosAdultos || row.beneficiarios_adultos || []), ...(row.beneficiariosNinos || row.beneficiarios_ninos || [])];
  const ids = selection?.selectedIds || rows.map(person => typeof person === "string" ? person : person.child_origin || person.childOrigin || person.id);
  return Array.isArray(ids) && ids.length ? [...ids].map(String).sort().join("|") : "";
};
const identity = (row: any = {}) => getReservationQuotedIdentity(row) || (() => {
  const parent = row.parentService || {}, child = row.childService || {}, ref = reference(row);
  const parentId = first(row.parentId, row.parent_id, ref.parentId, ref.parent_id, parent.id_endose, parent.id_guia, parent.id_restaurante);
  const childId = first(row.childId, row.child_id, ref.childId, ref.child_id, child.id_tipotour, child.id_ruta, child.id_restaurante);
  return parentId != null && childId != null ? [row.typeService || parent.typeService, parentId, childId].map(String).join("|").toLowerCase() : "";
})();

/** Cross-itinerary matching never uses array positions or a first ambiguous child. */
export function findReservationEditorQuotedMatch({ service = {}, day = {}, quotedItinerary = [] }: any = {}) {
  if (service.isCustomService) return { service: null, reason: "custom" };
  const source = getReservationSummaryServiceSource(service, day);
  const all = (Array.isArray(quotedItinerary) ? quotedItinerary : []).flatMap(candidateDay =>
    (candidateDay.servicios || []).filter(candidate => getReservationSummaryServiceSource(candidate, candidateDay) === source)
      .map(candidate => ({ service: candidate, day: candidateDay })));
  const ref = reference(service);
  const refId = first(ref.id, ref.servicioId, ref.servicio_id);
  const refUid = first(ref.versionUid, ref.version_uid);
  const select = (matches: any[]) => ({ service: only(matches)?.service || null, reason: matches.length > 1 ? "ambiguous" : matches.length ? "matched" : "missing" });
  if (refId != null) return select(all.filter(candidate => equal(id(candidate.service), refId)));
  if (refUid != null) return select(all.filter(candidate => equal(uid(candidate.service), refUid)));
  const byId = all.filter(candidate => equal(id(candidate.service), id(service)));
  if (byId.length) return select(byId);
  const byUid = all.filter(candidate => equal(uid(candidate.service), uid(service)));
  if (byUid.length) return select(byUid);

  const dayId = first(day.diaId, day.dia_id, day.id), dayUid = uid(day);
  const number = first(day.numero, day.day);
  const dayCandidates = (Array.isArray(quotedItinerary) ? quotedItinerary : []).filter(candidate =>
    getReservationSummaryServiceSource({}, candidate) === source &&
    (dayId != null && equal(first(candidate.diaId, candidate.dia_id, candidate.id), dayId) ||
      dayUid != null && equal(uid(candidate), dayUid)));
  const dayMatch = only(dayCandidates) || (dayCandidates.length ? null : only((quotedItinerary || []).filter(candidate =>
    getReservationSummaryServiceSource({}, candidate) === source && equal(first(candidate.numero, candidate.day), number))));
  if (!dayMatch) return { service: null, reason: dayCandidates.length > 1 ? "ambiguous" : "missing" };
  const key = identity(service);
  const matches = all.filter(candidate => candidate.day === dayMatch && key && identity(candidate.service) === key);
  if (matches.length <= 1) return select(matches);
  const people = beneficiaries(service);
  return people ? select(matches.filter(candidate => beneficiaries(candidate.service) === people)) : { service: null, reason: "ambiguous" };
}
