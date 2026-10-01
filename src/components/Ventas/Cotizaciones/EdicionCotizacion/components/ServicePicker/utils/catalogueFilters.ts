type CatalogItem = Record<string, any>;

const childKeys: Record<string, string> = {
  hoteles: "habitacion", transportes: "movilidad", trenes: "vagon",
  vuelos: "tipo_vuelo", guias: "ruta", endoses: "tour",
  restaurantes: "restaurante", tickets: "ticket",
};
const parentKeys: Record<string, string> = {
  hoteles: "hotel", transportes: "transporte", trenes: "tren",
  vuelos: "vuelo", guias: "guia", endoses: "endose",
  restaurantes: "restaurante", tickets: "ticket",
};
export const catalogueBase = (item: CatalogItem, category: string): CatalogItem =>
  item?.[childKeys[category]] || item?.childService || item || {};

export const catalogueParentId = (item: CatalogItem, category: string): string => {
  const key = parentKeys[category];
  const base = catalogueBase(item, category);
  const parent = item?.parentService || item?.[key] || {};
  return String(base[`id_${key}`] ?? base[`${key}_id`] ?? item?.[`id_${key}`] ??
    item?.[`${key}_id`] ?? parent[`id_${key}`] ?? parent.id ?? "");
};
export const catalogueProviderName = (item: CatalogItem): string =>
  item.nombre_empresa || item.nombre_agencia || item.nombre_transporte ||
  item.nombre_completo || [item.nombres, item.apellidos].filter(Boolean).join(" ") ||
  item.nombre || item.aerolinea || item.entrada || item.servicio || "Proveedor";

export type CatalogueFacet = { field: string; label: string };
export const catalogueFacets: Record<string, CatalogueFacet[]> = {
  hoteles: [{ field: "ciudad", label: "Ciudad" }, { field: "categoria", label: "Categoría" }, { field: "tipo_habitacion", label: "Habitación" }, { field: "capacidad", label: "Capacidad de habitación" }, { field: "desayuno", label: "Desayuno" }],
  transportes: [{ field: "zona", label: "Destino" }, { field: "tipo_auto", label: "Vehículo" }],
  trenes: [{ field: "lugar_salida", label: "Origen" }, { field: "lugar_destino", label: "Destino" }, { field: "tipo_tren", label: "Servicio / vagón" }, { field: "es_bimodal", label: "Modalidad del tren" }],
  vuelos: [{ field: "lugar_ida", label: "Origen" }, { field: "lugar_vuelta", label: "Destino" }, { field: "tipovuelo", label: "Tipo de vuelo" }],
  guias: [{ field: "idioma", label: "Idioma" }, { field: "tour_nombre", label: "Tour" }],
  endoses: [{ field: "zona", label: "Destino" }, { field: "tipo_guiado", label: "Tour / guiado" }, { field: "idioma", label: "Idioma" }],
  restaurantes: [{ field: "direccion", label: "Dirección" }, { field: "estado", label: "Estado" }],
  tickets: [{ field: "procedencia", label: "Procedencia" }, { field: "tipo_usuario", label: "Beneficiario" }],
};
export const catalogueFacetValues = (item: CatalogItem, category: string, field: string, parents: CatalogItem[] = []): string[] => {
  const base = catalogueBase(item, category);
  const parent = parents.find(p => catalogueParentId(p, category) === catalogueParentId(item, category));
  let value = base[field] ?? item[field] ?? item.parentService?.[field] ?? item?.[parentKeys[category]]?.[field] ?? parent?.[field];
  if (value == null || value === "") return [];
  if (field === "es_bimodal" || field === "desayuno") {
    const enabled = [true, 1, "1", "true", "si", "sí"].includes(typeof value === "string" ? value.toLowerCase() : value);
    return [field === "es_bimodal" ? (enabled ? "Bimodal" : "Solo tren") : (enabled ? "Incluido" : "Sin desayuno")];
  }
  if (field === "idioma" && typeof value === "string") {
    try { value = JSON.parse(value); } catch { /* Ordinary language label, not JSON. */ }
  }
  const values = Array.isArray(value) ? value : [value];
  return [...new Set<string>(values.filter(v => v != null && typeof v !== "object").map(v => String(v).trim()).filter(Boolean))];
};
export const catalogueFacetValue = (item: CatalogItem, category: string, field: string, parents: CatalogItem[] = []): string =>
  catalogueFacetValues(item, category, field, parents).join(", ");
export const catalogueCapacity = (item: CatalogItem, category: string): number | null => {
  const base = catalogueBase(item, category);
  const value = Number(category === "endoses" ? base.capacidad : base.nro_pasajeros);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : null;
};
export const filterCatalogueCapacity = <T extends CatalogItem>(items: T[], category: string, required: number): T[] => {
  if (!["transportes", "endoses"].includes(category) || required <= 0) return items;
  return items.filter(item => {
    const capacity = catalogueCapacity(item, category);
    // An endose without an explicit capacity is priced per person, not a limited vehicle.
    return capacity == null ? category === "endoses" : capacity >= required;
  }).sort((a, b) => (catalogueCapacity(a, category) ?? Infinity) - (catalogueCapacity(b, category) ?? Infinity));
};
export const filterCatalogue = <T extends CatalogItem>(items: T[], category: string, parents: CatalogItem[], providerIds: string[], facets: Record<string, string>): T[] =>
  items.filter(item => (!providerIds.length || providerIds.includes(catalogueParentId(item, category))) &&
    Object.entries(facets).every(([field, value]) => !value || catalogueFacetValues(item, category, field, parents).includes(value)));

export const quotationPickerPax = (people: CatalogItem, selection: CatalogItem | null, fallback: number): number => {
  const ids = selection?.selectedIds ?? selection?.ids;
  if (Array.isArray(ids)) return new Set(ids.map(String)).size;
  const count = Array.isArray(people?.details) && people.details.length ? people.details.length :
    (Array.isArray(people?.adults) ? people.adults.length : 0) +
    (Array.isArray(people?.children) ? people.children.length : 0) +
    (Array.isArray(people?.infants) ? people.infants.length : 0);
  return count || Math.max(0, Number(fallback) || 0);
};
