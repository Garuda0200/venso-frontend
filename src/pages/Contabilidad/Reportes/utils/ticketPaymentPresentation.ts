import {
  getTicketEntrada,
  getTicketProcedencia,
  getTicketTipoUsuario,
  normalizeTicketText,
} from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/ticketBeneficiaries";
import type { QuoteServiceRow } from "./paymentReportUtils";

export const isReportTicket = (service: any): boolean =>
  ["ticket", "tickets", "entrada", "entradas"].includes(normalizeTicketText(
    service?.typeService ?? service?.type_service ?? service?.tipo_servicio ?? service?.parentService?.typeService,
  ));

// Assigned data wins only when present; the persisted quotation remains the fallback.
const ticketSource = (service: any) => ({
  ...service,
  childService: service?.assignedChildService ?? service?.assigned_child_service ??
    service?.assignedService?.childService ?? service?.childService ?? service?.child_service,
});

export const reportTicketName = (service: any): string => {
  const source = ticketSource(service);
  const name = getTicketEntrada(source);
  if (name !== "Ticket") return name;
  return String(source?.parentService?.entrada ?? source?.parent_service?.entrada ?? "Entrada").trim() || "Entrada";
};

const originLabel = (service: any): string => {
  const origin = normalizeTicketText(getTicketProcedencia(ticketSource(service)));
  // "internacional" contains "nacional": check foreign first.
  if (/extranj|foreign|internacional|exterior/.test(origin)) return "Extranjero";
  if (/nacional|peru/.test(origin) || ["pe", "per"].includes(origin)) return "Nacional";
  return "Procedencia no indicada";
};

const userTypeLabel = (service: any): string => {
  const raw = getTicketTipoUsuario(ticketSource(service));
  const type = normalizeTicketText(raw);
  if (/estudiant|student/.test(type)) return "Estudiante";
  if (/nino|child|menor/.test(type)) return "Niño";
  if (/adult/.test(type)) return "Adulto";
  return raw || "";
};

const arrayValue = (value: unknown): any[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
};
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export interface TicketPaymentTariff {
  label: string;
  pax: number;
  unit: number;
  total: number;
}

/** Base de proveedor por tarifa, no el promedio comercial adulto/niño.
 * No crea servicios ni solicitudes; mantiene los importes canónicos intactos.
 */
export const ticketPaymentTariffs = (row: QuoteServiceRow): TicketPaymentTariff[] => {
  if (!isReportTicket(row.service)) return [];
  const tariffs: TicketPaymentTariff[] = [];
  const origin = originLabel(row.service);
  const type = userTypeLabel(row.service);
  const add = (audience: string, pax: number, unit: number, total: number, user = type) => {
    if (pax <= 0) return;
    tariffs.push({ label: [audience, origin, user].filter(Boolean).join(" · "), pax, unit: money(unit), total: money(total) });
  };
  add("Adultos", row.adultPax, row.adultBaseUnit, row.commercialAdultBaseTotal);
  const children = arrayValue(row.service?.beneficiariosNinos ?? row.service?.beneficiarios_ninos);
  const byPrice = new Map<number, number>();
  children.forEach((child) => {
    const raw = Number(child?.precio ?? child?.price ?? child?.amount ?? child?.valor ?? 0);
    const price = money(Number.isFinite(raw) ? raw : 0);
    byPrice.set(price, (byPrice.get(price) ?? 0) + 1);
  });
  const explicitTotal = [...byPrice].reduce((sum, [price, pax]) => sum + price * pax, 0);
  const convertedCount = Math.max(0, row.childPax - children.length);
  if (children.length && (money(explicitTotal) === money(row.commercialChildBaseTotal) ||
    (convertedCount > 0 && money(explicitTotal) <= money(row.commercialChildBaseTotal)))) {
    byPrice.forEach((pax, price) => add("Niños", pax, price, price * pax, type === "Adulto" ? "Tarifa infantil" : type));
    const remaining = money(row.commercialChildBaseTotal - explicitTotal);
    add("Niños", convertedCount, convertedCount ? remaining / convertedCount : 0, remaining);
  } else {
    add("Niños", row.childPax, row.childBaseUnit, row.commercialChildBaseTotal);
  }
  return tariffs;
};

export const ticketPaymentDetailText = (row: QuoteServiceRow): string => {
  const currency = row.currency === "soles" ? "S/" : "US$";
  return ticketPaymentTariffs(row).map((tariff) =>
    `${tariff.label}: ${tariff.pax} pax × ${currency} ${tariff.unit.toFixed(2)} = ${currency} ${tariff.total.toFixed(2)}`,
  ).join("\n");
};

export interface PaymentServiceSection<T extends QuoteServiceRow> {
  key: string;
  title: string;
  isTicket: boolean;
  rows: T[];
}

/** Agrupación exclusivamente visual por entrada, día, moneda y proveedor. */
export const groupPaymentServiceSections = <T extends QuoteServiceRow>(rows: T[]): PaymentServiceSection<T>[] => {
  const sections: PaymentServiceSection<T>[] = [];
  const tickets = new Map<string, PaymentServiceSection<T>>();
  rows.forEach((row, index) => {
    const isTicket = isReportTicket(row.service);
    const title = isTicket ? reportTicketName(row.service) : row.serviceName;
    const nameKey = normalizeTicketText(title);
    const key = isTicket && !["entrada", "ticket"].includes(nameKey)
      ? JSON.stringify([row.quoteId, row.dayNumber, row.daySource, row.providerKey, row.currency, nameKey])
      : `row-${index}-${row.serviceId}`;
    const existing = isTicket ? tickets.get(key) : null;
    if (existing) existing.rows.push(row);
    else {
      const section = { key, title, isTicket, rows: [row] };
      sections.push(section);
      if (isTicket) tickets.set(key, section);
    }
  });
  return sections;
};
