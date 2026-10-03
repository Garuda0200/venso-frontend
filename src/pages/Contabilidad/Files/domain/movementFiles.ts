export function movementCurrency(value: unknown): string {
  const text = String(value || "").trim().toLowerCase();
  if (["usd", "us$", "$", "dolares", "dólares", "dolar", "dólar"].includes(text)) return "USD";
  if (["pen", "s/", "sol", "soles"].includes(text)) return "PEN";
  return text.toUpperCase() || "SIN MONEDA";
}
export type CurrencyTotal = { currency: string; ingresos: number; egresos: number; balance: number };
export function movementTotals(movements: any[]): CurrencyTotal[] {
  const totals = new Map<string, CurrencyTotal>();
  movements.forEach(row => {
    const currency = movementCurrency(row.moneda ?? row.currency);
    const value = Number(row.monto);
    if (!Number.isFinite(value)) return;
    const total = totals.get(currency) || { currency, ingresos: 0, egresos: 0, balance: 0 };
    const cents = Math.round(value * 100);
    if (row.tipo_movimiento === "ingreso") total.ingresos += cents;
    if (row.tipo_movimiento === "egreso") total.egresos += cents;
    totals.set(currency, total);
  });
  return [...totals.values()].map(row => ({ ...row, ingresos: row.ingresos / 100,
    egresos: row.egresos / 100, balance: (row.ingresos - row.egresos) / 100 })).sort((a, b) => a.currency.localeCompare(b.currency));
}
const searchable = (value: any) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function buildMovementYears(movements: any[], search = "", type = "todos") {
  const years = new Map<number, any>();
  const query = searchable(search.trim());
  const files = new Map<string, any>();
  const activeRows = movements.filter(row => row.is_active !== false);
  const scope = (row: any) => `${row.platform || "venso"}:${row.business_type || "B2C"}`;
  const salesByCode = new Map<string, Set<string>>();
  const salesByReservation = new Map<string, Set<string>>();
  const reservationsByCode = new Map<string, Set<string>>();
  const link = (index: Map<string, Set<string>>, key: string, id: any) => {
    if (!id) return;
    const ids = index.get(key) || new Set<string>(); ids.add(String(id)); index.set(key, ids);
  };
  const unique = (ids?: Set<string>) => ids?.size === 1 ? [...ids][0] : null;
  for (const row of activeRows) {
    const code = String(row.voucher_code || "").trim();
    const context = scope(row);
    if (code) {
      link(salesByCode, `${context}:${code}`, row.referencia_voucher_venta);
      link(reservationsByCode, `${context}:${code}`, row.referencia_voucher_reserva);
    }
    if (row.referencia_voucher_reserva) link(salesByReservation,
      `${context}:${row.referencia_voucher_reserva}`, row.referencia_voucher_venta);
  }
  for (const row of activeRows) {
    const code = String(row.voucher_code || "").trim();
    const context = scope(row);
    // Un egreso legacy puede traer solo reserva/código. Se reúne con la venta
    // únicamente si la relación observada es inequívoca dentro de su contexto.
    const sale = row.referencia_voucher_venta || unique(salesByReservation.get(`${context}:${row.referencia_voucher_reserva}`))
      || (code ? unique(salesByCode.get(`${context}:${code}`)) : null);
    const reservation = row.referencia_voucher_reserva || (code ? unique(reservationsByCode.get(`${context}:${code}`)) : null);
    const identity = `${context}:${sale ? `venta:${sale}` : reservation ? `reserva:${reservation}` : code ? `code:${code}` : "sin-file"}`;
    const group = files.get(identity) || { key: identity, voucher_code: code || "Sin file", movimientos: [],
      referencia_voucher_venta: null, referencia_voucher_reserva: null, cotizacion_id: null, titulo: "" };
    group.movimientos.push(row);
    if (code && group.voucher_code === "Sin file") group.voucher_code = code;
    group.referencia_voucher_venta ||= sale;
    group.referencia_voucher_reserva ||= reservation;
    group.cotizacion_id ||= row.cotizacion_id;
    group.titulo ||= row.titulo;
    files.set(identity, group);
  }
  for (const file of files.values()) {
    const typed = file.movimientos.filter(row => type === "todos" || row.tipo_movimiento === type);
    if (!typed.length || (query && ![file.voucher_code, file.titulo, file.cotizacion_id,
      ...typed.flatMap(row => [row.descripcion, row.creator_name, row.created_by, row.metodo_pago, row.referencia_pago])]
      .some(value => searchable(value).includes(query)))) continue;
    // Se conserva el file completo al buscar; el filtro de tipo sí cambia
    // los movimientos y sus totales. Nunca inventamos un intervalo de viaje.
    const months = new Map<string, any[]>();
    typed.forEach(row => {
      const value = row.fecha || row.created_at;
      const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T12:00:00`) : new Date(value);
      const key = Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : "0-00";
      months.set(key, [...(months.get(key) || []), row]);
    });
    for (const [monthKey, rows] of months) {
      const [year, month] = monthKey.split("-").map(Number);
      const yearData = years.get(year) || { year, months: new Map() };
      const monthData = yearData.months.get(monthKey) || { monthKey, month, year, files: [] };
      monthData.files.push({ ...file, fileKey: file.key, key: `${monthKey}:${file.key}`, movimientos: rows,
        currencyTotals: movementTotals(rows) });
      yearData.months.set(monthKey, monthData); years.set(year, yearData);
    }
  }
  return [...years.values()].sort((a, b) => b.year - a.year).map(year => {
    const months = [...year.months.values()].sort((a: any, b: any) => b.month - a.month).map((month: any) => ({
      ...month, files: month.files.sort((a: any, b: any) => a.voucher_code.localeCompare(b.voucher_code, "es")),
      currencyTotals: movementTotals(month.files.flatMap((file: any) => file.movimientos)),
    }));
    return { ...year, months, currencyTotals: movementTotals(months.flatMap(month => month.files.flatMap((file: any) => file.movimientos))) };
  });
}

export function movementInitialData(file: any) {
  return { voucher_code: file.voucher_code === "Sin file" ? "" : file.voucher_code,
    referencia_voucher_venta: file.referencia_voucher_venta || null,
    referencia_voucher_reserva: file.referencia_voucher_reserva || null,
    platform: file.movimientos[0]?.platform || "venso",
    business_type: file.movimientos[0]?.business_type || "B2C" };
}
