/** Registered per-column policies; extend this registry when another field supports references. */
export const BIBLIA_HOTEL_FIELDS = ["hotelCusco", "hotelValle", "hotelMapi"] as const;
export type BibliaHotelField = typeof BIBLIA_HOTEL_FIELDS[number];
export type BibliaServiceLinkMode = "service" | "reference";
export type BibliaServiceLinkModes = Partial<Record<BibliaHotelField, BibliaServiceLinkMode>>;
export type BibliaModeDraftField = `serviceLinkMode:${BibliaHotelField}`;
export const isBibliaHotelField = (field: string): field is BibliaHotelField =>
  (BIBLIA_HOTEL_FIELDS as readonly string[]).includes(field);
export const getBibliaServiceLinkMode = (record: { serviceLinkModes?: BibliaServiceLinkModes }, field: string): BibliaServiceLinkMode =>
  isBibliaHotelField(field) && record.serviceLinkModes?.[field] === "reference" ? "reference" : "service";
export const normalizeBibliaServiceLinkModes = (value: unknown): BibliaServiceLinkModes =>
  Object.fromEntries(BIBLIA_HOTEL_FIELDS.filter(field => value && typeof value === "object" && value[field] === "reference")
    .map(field => [field, "reference"]));
export const bibliaModeDraftField = (field: BibliaHotelField): BibliaModeDraftField => `serviceLinkMode:${field}`;
export const hotelFieldFromModeDraft = (key: string): BibliaHotelField | null => {
  const field = key.startsWith("serviceLinkMode:") ? key.slice("serviceLinkMode:".length) : "";
  return isBibliaHotelField(field) ? field : null;
};
export function setBibliaServiceLinkMode(modes: BibliaServiceLinkModes | undefined, field: BibliaHotelField, mode: BibliaServiceLinkMode) {
  return normalizeBibliaServiceLinkModes({ ...modes, [field]: mode });
}
export const bibliaQuotationFieldValue = (record: Record<string, any>, field: string) =>
  getBibliaServiceLinkMode(record, field) === "reference" ? null : record[field];
