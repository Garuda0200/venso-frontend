import type { Agency } from "../services/agencyService";

type AgencyRecord = Record<string, any>;
export interface QuotationAgencyGroup<T> {
  key: string;
  agencyId: number | null;
  name: string;
  isPrimary: boolean;
  items: T[];
}

const normalizeName = (value: string) => value.trim().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-PE").replace(/\s+/g, " ");
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const collator = new Intl.Collator("es-PE", { sensitivity: "base", numeric: true });

/** La agencia pertenece a la cotización, no al proveedor ni al voucher. */
export function getQuotationAgency(
  record: AgencyRecord,
  directory: readonly Agency[] = [],
) {
  const quotation = record.cotizacion_data || record.cotizacionData || record.cotizacion || record;
  const rawId = Number(quotation.agency_id ?? quotation.agencyId ?? quotation.agency?.id);
  const agencyId = Number.isInteger(rawId) && rawId > 0 ? rawId : null;
  const agency = agencyId ? directory.find((item) => Number(item.id) === agencyId) : undefined;
  const name = text(agency?.name) || text(quotation.agency_name) || text(quotation.agencyName)
    || text(quotation.agency?.name) || (agencyId ? `Agencia ${agencyId}` : "Sin agencia registrada");
  return {
    key: agencyId ? `agency:${agencyId}` : name === "Sin agencia registrada" ? "agency:unknown" : `name:${normalizeName(name)}`,
    agencyId,
    name,
    isPrimary: Boolean(agency?.is_primary),
  };
}

/** Ordena las agencias, manteniendo el orden cronológico de cada lista recibida. */
export function groupByQuotationAgency<T extends AgencyRecord>(
  records: readonly T[],
  directory: readonly Agency[] = [],
): QuotationAgencyGroup<T>[] {
  const groups = new Map<string, QuotationAgencyGroup<T>>();
  records.forEach((record) => {
    const agency = getQuotationAgency(record, directory);
    let group = groups.get(agency.key);
    if (!group) {
      group = { ...agency, items: [] };
      groups.set(agency.key, group);
    }
    group.items.push(record);
  });
  return [...groups.values()].sort((a, b) => {
    if (a.key === "agency:unknown" || b.key === "agency:unknown") {
      return Number(a.key === "agency:unknown") - Number(b.key === "agency:unknown");
    }
    return Number(b.isPrimary) - Number(a.isPrimary) || collator.compare(a.name, b.name)
      || collator.compare(a.key, b.key);
  });
}

/** Se agrupa antes de paginar, para que las agencias no se mezclen entre páginas. */
export function paginateQuotationAgencyGroups<T extends AgencyRecord>(
  records: readonly T[], directory: readonly Agency[], page: number, pageSize: number,
) {
  const allGroups = groupByQuotationAgency(records, directory);
  const ordered = allGroups.flatMap((group) => group.items);
  const start = (page - 1) * pageSize;
  const visible = ordered.slice(start, start + pageSize);
  return groupByQuotationAgency(visible, directory).map((group) => ({
    ...group,
    totalCount: allGroups.find((item) => item.key === group.key)?.items.length || 0,
  }));
}
