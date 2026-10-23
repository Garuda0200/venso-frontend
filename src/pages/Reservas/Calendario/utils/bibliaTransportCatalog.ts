type CatalogRow = Record<string, any>;

const key = (value: unknown) => String(value ?? "").trim().normalize("NFKC").toLocaleLowerCase("es").replace(/\s+/g, " ");
const label = (value: unknown) => typeof value === "string" ? value.trim() : "";

const available = (row: CatalogRow) => row?.mostrar_en_servicepicker !== false
  && !["inactivo", "inactive", "eliminado", "deleted", "baja", "suspendido", "mantenimiento", "maintenance",
    "no disponible", "unavailable", "deshabilitado", "disabled", "cancelado", "cancelled"].includes(key(row?.estado));

/** El proveedor sin ruta conserva la resolución automática por excursión del día.
 * Las opciones detalladas desempatan rutas/clases sin inventar IDs ni tarifas.
 * No se aproxima aquí el tour: la validación autoritativa vive en el backend. */
export function buildBibliaTransportOptions(providers: CatalogRow[], vehicles: CatalogRow[], pax = 0): string[] {
  const result = new Set<string>();
  const names = new Map<string, string>();
  for (const provider of providers) {
    if (!provider || !available(provider)) continue;
    const name = label(provider.nombre_transporte) || label(provider.nombre) || label(provider.razon_social) || label(provider.name);
    if (!name) continue;
    result.add(name);
    names.set(String(provider.id_transporte ?? provider.id ?? ""), name);
  }
  const required = Number.isFinite(pax) ? Math.max(0, pax) : 0;
  for (const raw of vehicles) {
    const vehicle = raw?.movilidad ?? raw;
    if (!vehicle || !available(vehicle)) continue;
    const provider = names.get(String(vehicle.id_transporte ?? ""));
    const route = label(vehicle.ruta);
    const vehicleClass = label(vehicle.tipo_auto);
    const capacity = Number(vehicle.nro_pasajeros);
    if (!provider || !route || !vehicleClass || !Number.isFinite(capacity) || capacity <= 0 || capacity < required) continue;
    // Los tres segmentos son el contrato opcional de selección explícita.
    // Una ruta que ya contiene el separador no debe generar un selector ambiguo.
    if ([provider, route, vehicleClass].some(part => part.includes("·"))) continue;
    result.add(`${provider} · ${route} · ${vehicleClass}`);
  }
  return [...result].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
}
