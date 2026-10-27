import { COUNTRIES } from "../../../../utils/countries";
import type { BibliaParticipantPlan } from "./bibliaActivityMapper";

const normalized = (value: string) => value.trim().toLowerCase().normalize("NFD")
  .replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ");

/** Etiquetas agregadas históricas no identifican el país de un pasajero. */
export function isUnresolvedParticipantNationality(value: string): boolean {
  const key = normalized(value).replace(/[,;/+]/g, " ").replace(/\s+/g, " ").trim();
  return !key || key === "—" || ["peru usa", "usa peru"].includes(key);
}

export function participantCountryLabel(value: string): string {
  const alias = ({ usa: "US", us: "US", eeuu: "US", estadosunidos: "US", unitedstates: "US", unitedstatesofamerica: "US",
    deu: "DE", germany: "DE", deutschland: "DE", bra: "BR", brazil: "BR", brasil: "BR", esp: "ES", spain: "ES",
    gbr: "GB", uk: "GB", reinounido: "GB", unitedkingdom: "GB", ita: "IT", italy: "IT", fra: "FR", france: "FR",
    mex: "MX", per: "PE", peru: "PE", peruana: "PE", peruano: "PE", peruvian: "PE" } as Record<string, string>)[normalized(value).replace(/[.\s-]/g, "")];
  return COUNTRIES.find(country => normalized(country.name) === normalized(value)
    || country.code === alias || country.code.toLowerCase() === normalized(value))?.name || value.trim();
}

/** Identidad de país, no procedencia: dos extranjeros distintos no son intercambiables. */
export const participantNationalityKey = (value: string) => normalized(participantCountryLabel(value));

/** La tabla y los documentos muestran países, nunca cantidades por país. */
export function participantNationalityLabel(plan?: BibliaParticipantPlan | null, fallback: unknown = ""): string {
  const rows = (group: BibliaParticipantPlan["adults"] | undefined) => Array.isArray(group?.nationalities) ? group.nationalities : [];
  const countries = plan
    ? [...rows(plan.adults), ...rows(plan.children)]
      .filter(row => row && row.count > 0).map(row => row.country)
    : String(fallback ?? "").split(/[,;/\n]/).map(value => value.replace(/\s*[xX×]\s*\d+\s*$/, ""));
  return [...new Set(countries.map(value => participantCountryLabel(String(value || "")))
    .filter(value => value && value !== "—")
    .flatMap(value => isUnresolvedParticipantNationality(value)
      ? value.trim() ? ["Perú", "Estados Unidos"] : [] : [value]))].join(", ") || "—";
}
