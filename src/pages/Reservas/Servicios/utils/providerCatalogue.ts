export const PROVIDER_CATALOGUES = {
  hoteles: { label: "Hoteles", services: "Habitaciones", id: "id_hotel" },
  transportes: { label: "Transportistas", services: "Movilidades", id: "id_transporte" },
  vuelos: { label: "Aerolíneas", services: "Tipos de vuelo", id: "id_vuelo" },
  trenes: { label: "Empresas de tren", services: "Vagones", id: "id_tren" },
  endoses: { label: "Operadores", services: "Tours", id: "id_endose" },
  guias: { label: "Guías", services: "Rutas", id: "id_guia" },
} as const;

export type ProviderCategory = keyof typeof PROVIDER_CATALOGUES;
export type ProviderRecord = Record<string, any>;
export type CatalogueProvider = { id: string; name: string; detail: string };

export function isProviderCategory(category: string | null): category is ProviderCategory {
  return category != null && Object.prototype.hasOwnProperty.call(PROVIDER_CATALOGUES, category);
}

export function providerId(category: ProviderCategory, record: ProviderRecord): string {
  const value = record[PROVIDER_CATALOGUES[category].id] ?? (category === "guias" ? record.guia?.id_guia : null);
  return value == null ? "" : String(value);
}

export function catalogueProviders(category: ProviderCategory, rows: ProviderRecord[]): CatalogueProvider[] {
  return rows.map(record => {
    const id = providerId(category, record);
    const names = [record.nombres || record.persona?.nombres, record.apellidos || record.persona?.apellidos].filter(Boolean).join(" ");
    const labels = {
      hoteles: record.nombre,
      transportes: record.nombre_transporte,
      vuelos: record.nombre || record.nombre_vuelo,
      trenes: record.nombre_empresa || record.nombre_tren,
      endoses: record.nombre_agencia || record.nombre,
      guias: names,
    };
    const detail = category === "guias"
      ? record.idioma || record.guia?.idioma || record.codigo_guia || record.guia?.codigo_guia
      : record.ciudad || record.zona || record.ruta || record.procedencia;
    return { id, name: String(labels[category] || `Proveedor ${id}`), detail: Array.isArray(detail) ? detail.join(" · ") : String(detail || "") };
  }).filter(record => record.id).sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
}

export function filterCatalogueProviders(providers: CatalogueProvider[], search: string) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const term = normalize(search.trim());
  return providers.filter(provider => normalize(`${provider.name} ${provider.detail}`).includes(term));
}
