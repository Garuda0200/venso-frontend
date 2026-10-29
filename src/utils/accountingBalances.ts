export const normalizeAccountingDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getTime());
  if (typeof value === "string") {
    const sqlDate = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (sqlDate) {
      return new Date(Number(sqlDate[1]), Number(sqlDate[2]) - 1, Number(sqlDate[3]));
    }
  }
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

export const accountingYear = (value) => normalizeAccountingDate(value).getFullYear();

export const normalizeAccountingPlatform = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "b2b") return "mil";
  if (normalized === "b2c") return "magic";
  return normalized || "magic";
};

export const accountingBusinessType = (platform, explicit) => {
  const normalized = String(explicit || "").trim().toUpperCase();
  if (normalized === "B2C" || normalized === "B2B") return normalized;
  return ({magic:"B2C",mil:"B2B"})[normalizeAccountingPlatform(platform)] || "";
};

export const filterMovementSaldos = (
  saldos,
  { fecha, platform, businessType, moneda = null },
) => {
  const year = accountingYear(fecha);
  const normalizedPlatform = normalizeAccountingPlatform(platform);
  const normalizedBusiness = accountingBusinessType(normalizedPlatform, businessType);
  const normalizedCurrency = moneda ? String(moneda).toLowerCase() : null;

  return (saldos || []).filter((saldo) => {
    return (
      Number(saldo.year_saldo) === year &&
      normalizeAccountingPlatform(saldo.platform) === normalizedPlatform &&
      accountingBusinessType(saldo.platform, saldo.business_type) === normalizedBusiness &&
      (!normalizedCurrency || String(saldo.moneda || "").toLowerCase() === normalizedCurrency)
    );
  });
};

export const findPreferredMovementSaldo = (
  saldos,
  context,
  { tipo = "efectivo", moneda = null } = {},
) => {
  const candidates = filterMovementSaldos(saldos, context);
  const normalizedCurrency = moneda ? String(moneda).toLowerCase() : null;
  return (
    candidates.find(
      (saldo) =>
        saldo.tipo === tipo &&
        (!normalizedCurrency || String(saldo.moneda).toLowerCase() === normalizedCurrency),
    ) ||
    candidates.find(
      (saldo) => !normalizedCurrency || String(saldo.moneda).toLowerCase() === normalizedCurrency,
    ) ||
    null
  );
};

export const buildMissingSaldoPayload = ({ tipo, moneda, fecha, platform, businessType }) => {
  const normalizedPlatform = normalizeAccountingPlatform(platform);
  return {
    tipo: tipo || "efectivo",
    moneda: String(moneda || "soles").toLowerCase(),
    saldo_inicial: "0",
    saldo_actual: "0",
    platform: normalizedPlatform,
    business_type: accountingBusinessType(normalizedPlatform, businessType),
    year_saldo: accountingYear(fecha),
  };
};


const DEFAULT_ACCOUNTING_SALDO_ORDER = [
  "efectivo",
  "cuenta_debito",
  "cuenta_credito",
  "global66",
  "paypal",
  "western_union",
  "wetravel",
];

export const orderAccountingSaldoTypes = (types = []) => {
  const unique = [...new Set((types || []).filter(Boolean))];
  const known = DEFAULT_ACCOUNTING_SALDO_ORDER.filter((tipo) => unique.includes(tipo));
  const custom = unique
    .filter((tipo) => !DEFAULT_ACCOUNTING_SALDO_ORDER.includes(tipo))
    .sort((a, b) => String(a).localeCompare(String(b), "es"));
  return [...known, ...custom];
};

export const accountingSaldoTypeLabel = (tipo) => {
  const known = {
    efectivo: "Efectivo",
    cuenta_debito: "Débito",
    cuenta_credito: "Crédito",
    cuenta: "Débito",
    global66: "Global66",
    paypal: "PayPal",
    western_union: "W. Union",
    wetravel: "WeTravel",
  };
  if (known[tipo]) return known[tipo];
  return String(tipo || "Saldo")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const validateSaldoReassignmentIntent = ({
  saldoChanged,
  saldoId,
  hasOtherChanges,
}) => {
  if (!saldoChanged) return { valid: true, reason: null };
  if (!saldoId) {
    return {
      valid: false,
      reason: "Selecciona el saldo destino antes de guardar la corrección",
    };
  }
  if (hasOtherChanges) {
    return {
      valid: false,
      reason:
        "La corrección de saldo debe guardarse sola. Guarda o descarta primero los demás cambios del movimiento.",
    };
  }
  return { valid: true, reason: null };
};
