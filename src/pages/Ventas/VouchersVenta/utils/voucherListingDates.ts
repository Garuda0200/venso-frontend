import { canViewAllVouchers } from "../../../../utils/permissions";

// This preference only reorganizes the authorized list already returned by
// the API. It must never select a broader endpoint or change visibility.
export const canUseVoucherTravelDates = (user) => {
  const role = Number(user?.role ?? user?.auth?.role ?? -1);
  return role === 0 || (role === 2 && Boolean(canViewAllVouchers(user)));
};

export const parseVoucherListingDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value).trim();
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly.map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 &&
      date.getDate() === day ? date : null;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getVoucherTravelDates = (voucher = {}) => {
  const quote = voucher.cotizacion_data || voucher.cotizacionData || voucher.cotizacion || {};
  return {
    start: parseVoucherListingDate(quote.fechainicio || quote.fechaInicio || voucher.fechaInicio),
    end: parseVoucherListingDate(quote.fechafin || quote.fechaFin || voucher.fechaFin),
  };
};

export const formatVoucherTravelDates = (voucher) => {
  const { start, end } = getVoucherTravelDates(voucher);
  const format = date => date.toLocaleDateString("es-PE", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
  if (!start) return end ? `Inicio pendiente · Fin: ${format(end)}` : "Fechas pendientes";
  return end ? `${format(start)} – ${format(end)}` : `${format(start)} · Fin pendiente`;
};

const creationDate = voucher => parseVoucherListingDate(voucher.created_at || voucher.createdAt);

export const groupSalesVouchersByDate = (vouchers = [], mode = "sale") => {
  const travel = mode === "travel";
  const years = new Map();
  const undated = [];
  // Sort only in travel mode; the classic mode retains the API's ordering.
  const items = travel ? [...vouchers].sort((left, right) => {
    const a = getVoucherTravelDates(left), b = getVoucherTravelDates(right);
    return (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity) ||
      (a.end?.getTime() ?? a.start?.getTime() ?? Infinity) -
      (b.end?.getTime() ?? b.start?.getTime() ?? Infinity) ||
      (creationDate(right)?.getTime() ?? 0) - (creationDate(left)?.getTime() ?? 0);
  }) : vouchers;
  for (const voucher of items) {
    const date = travel ? getVoucherTravelDates(voucher).start : creationDate(voucher);
    if (!date) { undated.push(voucher); continue; }
    const year = date.getFullYear(), month = date.getMonth() + 1;
    if (!years.has(year)) years.set(year, { year, totalCount: 0, monthsMap: new Map() });
    const group = years.get(year);
    group.totalCount++;
    if (!group.monthsMap.has(month)) {
      const label = date.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
      group.monthsMap.set(month, {
        key: `${year}-${String(month).padStart(2, "0")}`, month,
        label: label.charAt(0).toUpperCase() + label.slice(1), vouchers: [],
      });
    }
    group.monthsMap.get(month).vouchers.push(voucher);
  }
  const groups = [...years.values()].sort((a, b) => b.year - a.year).map(group => ({
    year: group.year, totalCount: group.totalCount,
    months: [...group.monthsMap.values()].sort((a, b) => b.month - a.month),
  }));
  // A file with an open travel date must remain reachable, without presenting
  // its sale date as if it were a confirmed departure date.
  if (undated.length) groups.push({
    year: "undated", label: travel ? "Sin fecha de viaje" : "Sin fecha de cierre",
    totalCount: undated.length,
    months: [{ key: `${mode}-undated`, month: null, label: "Fechas pendientes", vouchers: undated }],
  });
  return groups;
};
