import { serviceHasPeruvianBeneficiary } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/igvUtils";

export type CurrencyKey = "soles" | "dolares";

const toNumber = (value: unknown): number => {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const roundMoney = (value: unknown): number =>
  Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

export const normalizeCurrency = (value: unknown): CurrencyKey => {
  const currency = String(value ?? "").trim().toLowerCase();
  if (
    currency === "soles" ||
    currency === "pen" ||
    currency.includes("sol") ||
    currency.includes("s/")
  ) {
    return "soles";
  }
  return "dolares";
};

const firstText = (...values: unknown[]): string => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

const getParent = (service: any) =>
  service?.parentService || service?.parent_service || {};
const getChild = (service: any) =>
  service?.childService || service?.child_service || {};

const getOperationalParent = (service: any) =>
  service?.assignedParentService || service?.assigned_parent_service || getParent(service);
const getOperationalChild = (service: any) =>
  service?.assignedChildService || service?.assigned_child_service || getChild(service);

export const resolveProviderId = (service: any): number | null => {
  const raw = service?.assignedParentId ?? service?.assigned_parent_id ?? service?.parentId ?? service?.parent_id;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const resolveProviderName = (service: any): string => {
  const parent = getOperationalParent(service);
  return firstText(
    parent.nombre,
    parent.nombre_empresa,
    parent.nombre_transporte,
    parent.nombre_completo,
    parent.nombre_agencia,
    parent.razon_social,
    parent.nombres && parent.apellidos
      ? `${parent.nombres} ${parent.apellidos}`
      : "",
    parent.nombres,
    parent.entrada,
    parent.tipo_tour,
    `Proveedor ${resolveProviderId(service) ?? "sin ID"}`,
  );
};

export const resolveServiceName = (service: any): string => {
  const child = getOperationalChild(service);
  const parent = getOperationalParent(service);
  return firstText(
    child.nombre,
    child.nombre_servicio,
    child.servicio,
    child.tipo_tour,
    child.entrada,
    child.descripcion,
    child.nombre_habitacion,
    child.tipo_habitacion,
    child.ruta,
    child.origen && child.destino ? `${child.origen} - ${child.destino}` : "",
    parent.nombre,
    parent.nombre_empresa,
    service?.typeService,
    service?.tipo_servicio,
    "Servicio",
  );
};

const parseBeneficiaries = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getAdultBeneficiaries = (service: any): any[] =>
  parseBeneficiaries(service?.beneficiariosAdultos ?? service?.beneficiarios_adultos);

const getChildBeneficiaries = (service: any): any[] =>
  parseBeneficiaries(service?.beneficiariosNinos ?? service?.beneficiarios_ninos);

const isConvertedChildBeneficiary = (entry: any): boolean => {
  const id = String(entry?.id ?? entry?.passengerId ?? entry?.passenger_id ?? entry ?? "").trim();
  return Boolean(
    entry?.child_origin ??
      entry?.childOrigin ??
      entry?.child_as_adult ??
      entry?.childAsAdult ??
      id.startsWith("child:"),
  );
};

const childBeneficiaryPrice = (entry: any): number =>
  roundMoney(entry?.precio ?? entry?.price ?? entry?.amount ?? entry?.valor ?? 0);

const isHotelServiceForReport = (service: any): boolean => {
  const type = firstText(
    service?.typeService,
    service?.type_service,
    service?.tipo_servicio,
    service?.parentService?.typeService,
    service?.parent_service?.typeService,
  ).toLowerCase();
  return (
    type === "hotel" ||
    type === "hoteles" ||
    Boolean(
      service?.childService?.tipo_habitacion ??
        service?.child_service?.tipo_habitacion ??
        service?.childService?.habitacion?.tipo_habitacion,
    )
  );
};

const readBoolean = (...values: any[]): boolean =>
  values.some(
    (value) =>
      value === true ||
      value === 1 ||
      String(value ?? "").trim().toLowerCase() === "true",
  );

const firstPositiveNumber = (...values: any[]): number => {
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed > 0) return parsed;
  }
  return 0;
};

const resolveQuotePeopleDetails = (quote: any): any =>
  quote?.peopleDetails ?? quote?.people_details ?? quote?.peopledetails ?? {};

export interface ServiceCommercialBaseBreakdown {
  pax: number;
  adultPax: number;
  childPax: number;
  adultUnit: number;
  childUnit: number;
  adultPresentationTotal: number;
  childPresentationTotal: number;
  presentationTotal: number;
  providerTotal: number;
  igvAmount: number;
  igvPerPerson: number;
  hasIgv: boolean;
}

/**
 * Rebuilds the exact per-service commercial base used by the quotation.
 * `precioServicio/precioTotal` persisted by Venso represent the supplier base;
 * hotel IGV and explicit child amounts are reconstructed here before applying
 * quote-level fee/administrative percentages.
 */
export const resolveServiceCommercialBase = (
  service: any,
  peopleDetails: any = {},
  fallbackPax = 1,
): ServiceCommercialBaseBreakdown => {
  const adultEntries = getAdultBeneficiaries(service);
  const childEntries = getChildBeneficiaries(service);
  const convertedChildCount = adultEntries.filter(isConvertedChildBeneficiary).length;
  const actualAdultCount = adultEntries.length > 0
    ? Math.max(0, adultEntries.length - convertedChildCount)
    : Math.max(1, Math.trunc(toNumber(fallbackPax) || 1) - childEntries.length);
  const explicitChildCount = childEntries.length;
  const adultRatedCount = Math.max(
    1,
    adultEntries.length || actualAdultCount + convertedChildCount,
  );
  const explicitChildTotalFromRows = roundMoney(
    childEntries.reduce((sum, entry) => sum + childBeneficiaryPrice(entry), 0),
  );
  const explicitChildTotal = Math.max(
    explicitChildTotalFromRows,
    roundMoney(
      service?.tariff?.childExtrasTotal ??
        service?.assignedChildExplicitPriceSum ??
        service?.assigned_child_explicit_price_sum ??
        0,
    ),
  );
  const divided = readBoolean(
    service?.precioAdultoDividido,
    service?.precio_adulto_dividido,
    service?.tariff?.precio_adulto_dividido,
  );
  const unit = firstPositiveNumber(
    service?.precioServicio,
    service?.precio_servicio,
    service?.tariff?.precio,
  );
  const flatTotal = firstPositiveNumber(
    service?.precioTotal,
    service?.precio_total,
    service?.tariff?.precio_original,
  );
  const isHotel = isHotelServiceForReport(service);
  const persistedIgv = readBoolean(
    service?.igv,
    service?.tieneIgv,
    service?.tiene_igv,
    service?.tariff?.tieneIgv,
    service?.tariff?.tiene_igv,
  );
  const hasIgv =
    isHotel &&
    (persistedIgv || serviceHasPeruvianBeneficiary(service, peopleDetails));

  // Hotels persist their canonical room tariff without IGV in precioServicio.
  // For the remaining service types precioTotal is the authoritative supplier
  // total whenever it exists.
  const supplierAdultBase = isHotel
    ? firstPositiveNumber(
        service?.tariff?.precio_base_sin_igv,
        service?.roomBaseUnitPrice,
        service?.room_base_unit_price,
        service?.precioServicio,
        service?.precio_servicio,
        flatTotal,
        service?.tariff?.basePrice,
      )
    : flatTotal > 0
      ? flatTotal
      : roundMoney(unit * (divided ? 1 : adultRatedCount));

  const igvAmount = hasIgv ? roundMoney(supplierAdultBase * 0.18) : 0;
  const supplierAdultWithIgv = roundMoney(supplierAdultBase + igvAmount);
  const adultRatedUnit = roundMoney(supplierAdultWithIgv / adultRatedCount);

  const effectiveActualAdultCount = adultEntries.length > 0
    ? actualAdultCount
    : adultRatedCount;
  const adultPax = Math.max(0, effectiveActualAdultCount);
  const childPax = Math.max(0, convertedChildCount + explicitChildCount);
  const resolvedPax = Math.max(1, adultPax + childPax || toNumber(fallbackPax) || 1);

  const adultExactTotal = roundMoney(adultRatedUnit * adultPax);
  const convertedChildExactTotal = roundMoney(adultRatedUnit * convertedChildCount);
  const childExactTotal = roundMoney(convertedChildExactTotal + explicitChildTotal);
  const adultUnit = adultPax > 0 ? roundMoney(adultExactTotal / adultPax) : 0;
  const childUnit = childPax > 0 ? roundMoney(childExactTotal / childPax) : 0;
  const adultPresentationTotal = roundMoney(adultUnit * adultPax);
  const childPresentationTotal = roundMoney(childUnit * childPax);
  const presentationTotal = roundMoney(
    adultPresentationTotal + childPresentationTotal,
  );
  const providerTotal = roundMoney(supplierAdultWithIgv + explicitChildTotal);

  return {
    pax: resolvedPax,
    adultPax,
    childPax,
    adultUnit,
    childUnit,
    adultPresentationTotal,
    childPresentationTotal,
    presentationTotal: presentationTotal || providerTotal,
    providerTotal,
    igvAmount,
    igvPerPerson: roundMoney(igvAmount / resolvedPax),
    hasIgv,
  };
};

export const resolveServicePax = (service: any, fallback = 1): number => {
  const adults = getAdultBeneficiaries(service).length;
  const children = getChildBeneficiaries(service).length;
  const explicit = toNumber(service?.cantidad ?? service?.pax ?? service?.quantity);
  return Math.max(1, adults + children || explicit || fallback || 1);
};

export const resolveQuotedServiceTotal = (
  service: any,
  peopleDetails: any = {},
  fallbackPax = 1,
): number =>
  resolveServiceCommercialBase(service, peopleDetails, fallbackPax).providerTotal;

export const resolveQuotedUnitPrice = (
  service: any,
  peopleDetails: any = {},
  fallbackPax = 1,
): number => {
  const pricing = resolveServiceCommercialBase(service, peopleDetails, fallbackPax);
  return roundMoney(pricing.presentationTotal / Math.max(1, pricing.pax));
};

export const getServiceDate = (quoteStartDate: unknown, dayNumber: unknown): string | null => {
  const raw = String(quoteStartDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const offset = Math.max(0, Math.trunc(toNumber(dayNumber) || 1) - 1);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

export interface QuoteServiceRow {
  quoteId: string;
  voucherCode: string;
  voucherVentaId: number | null;
  quoteTitle: string;
  agencyId: number | null;
  agencyName: string;
  agencyIsPrimary: boolean | null;
  payerScope: "client" | "agency";
  quotePaxCount: number;
  dayNumber: number;
  dayTitle: string;
  daySource: "main" | "external";
  serviceOrder: number;
  serviceId: number | null;
  providerId: number | null;
  providerKey: string;
  providerName: string;
  serviceName: string;
  serviceType: string;
  serviceDate: string | null;
  currency: CurrencyKey;
  quotedUnit: number;
  quotedTotal: number;
  commercialBaseTotal: number;
  commercialAdultBaseTotal: number;
  commercialChildBaseTotal: number;
  adultBaseUnit: number;
  childBaseUnit: number;
  adultPax: number;
  childPax: number;
  igvAmount: number;
  igvPerPerson: number;
  hasIgv: boolean;
  pax: number;
  service: any;
}

const asItineraryDays = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.values(value).filter((day) => day && typeof day === "object");
  }
  return [];
};

const positiveInteger = (...values: unknown[]): number | null => {
  for (const value of values) {
    const parsed = Math.trunc(toNumber(value));
    if (parsed > 0) return parsed;
  }
  return null;
};

const resolveServiceOrder = (service: any, fallbackIndex: number): number =>
  positiveInteger(
    service?.orden,
    service?.order,
    service?.posicion,
    service?.position,
    service?.numero,
    service?.itinerario_servicio_orden,
  ) ?? fallbackIndex + 1;

interface NormalizedItineraryDay {
  dayNumber: number;
  dayTitle: string;
  mainServices: any[];
  externalServices: any[];
}

/**
 * Replica el orden visible de SummaryContent: primero se fusionan los días del
 * itinerario principal y externo por `numero`, luego se ordenan por día y,
 * dentro de cada día, se conserva el orden de `itinerario_servicio`.
 */
const normalizeItineraryDaysForReport = (quote: any): NormalizedItineraryDay[] => {
  const mainDays = asItineraryDays(quote?.itinerario);
  const externalDays = asItineraryDays(
    quote?.itinerario_externo ?? quote?.externalItinerary ?? quote?.external_itinerary,
  );
  const dayMap = new Map<number, NormalizedItineraryDay>();

  mainDays.forEach((day, index) => {
    const dayNumber = positiveInteger(day?.numero, day?.orden, day?.dayNumber) ?? index + 1;
    dayMap.set(dayNumber, {
      dayNumber,
      dayTitle: firstText(day?.titulo, day?.title, `Día ${dayNumber}`),
      mainServices: Array.isArray(day?.servicios) ? day.servicios : [],
      externalServices: [],
    });
  });

  externalDays.forEach((day, index) => {
    const dayNumber =
      positiveInteger(day?.numero, day?.orden, day?.dayNumber) ?? mainDays.length + index + 1;
    const services = Array.isArray(day?.servicios) ? day.servicios : [];
    if (services.length === 0) return;
    const current = dayMap.get(dayNumber);
    if (current) {
      current.externalServices.push(...services);
      if (!current.dayTitle) current.dayTitle = firstText(day?.titulo, day?.title, `Día ${dayNumber}`);
      return;
    }
    dayMap.set(dayNumber, {
      dayNumber,
      dayTitle: firstText(day?.titulo, day?.title, `Día ${dayNumber}`),
      mainServices: [],
      externalServices: services,
    });
  });

  return [...dayMap.values()].sort((left, right) => left.dayNumber - right.dayNumber);
};

export const flattenQuoteServices = (
  quote: any,
  agency: any = null,
): QuoteServiceRow[] => {
  const quoteId = firstText(quote?.id);
  const voucherCodes = Array.isArray(quote?.voucher_codes)
    ? quote.voucher_codes.filter(Boolean)
    : [];
  const voucherCode = firstText(
    voucherCodes[0],
    quote?.voucher_code,
    quote?.voucherCode,
    quoteId ? `COT-${quoteId}` : "SIN-FILE",
  );
  const agencyIdRaw = quote?.agency_id ?? quote?.agencyId ?? agency?.id;
  const agencyId = Number.isFinite(Number(agencyIdRaw)) ? Number(agencyIdRaw) : null;
  const agencyIsPrimary =
    typeof agency?.is_primary === "boolean"
      ? agency.is_primary
      : typeof quote?.agency_is_primary === "boolean"
        ? quote.agency_is_primary
        : null;
  const agencyName = firstText(
    agency?.name,
    quote?.agency_name,
    quote?.agency?.name,
    agencyIsPrimary ? "Venso Tours" : "Agencia",
  );
  const quoteStartDate = quote?.fechainicio ?? quote?.fecha_inicio;
  const quotePaxCount = Math.max(
    1,
    toNumber(
      quote?.cantidadpersonas ??
        quote?.peopleCount?.adults + quote?.peopleCount?.children ??
        1,
    ),
  );
  const peopleDetails = resolveQuotePeopleDetails(quote);

  const rows: QuoteServiceRow[] = [];
  const days = normalizeItineraryDaysForReport(quote);

  const appendServices = (
    day: NormalizedItineraryDay,
    services: any[],
    daySource: "main" | "external",
  ) => {
    services.forEach((service, serviceIndex) => {
      const serviceIdRaw = service?.id ?? service?.servicioId ?? service?.itinerario_servicio_id;
      const serviceId = Number.isFinite(Number(serviceIdRaw)) ? Number(serviceIdRaw) : null;
      const providerId = resolveProviderId(service);
      const serviceType = firstText(
        service?.typeService,
        service?.type_service,
        service?.tipo_servicio,
        "servicio",
      );
      const providerName = resolveProviderName(service);
      const providerKey = `${serviceType}:${providerId ?? providerName.toLowerCase()}`;
      const pricing = resolveServiceCommercialBase(
        service,
        peopleDetails,
        quotePaxCount,
      );
      rows.push({
        quoteId,
        voucherCode,
        voucherVentaId: null,
        quoteTitle: firstText(quote?.titulo, quoteId),
        agencyId,
        agencyName,
        agencyIsPrimary,
        payerScope: agencyIsPrimary === false ? "agency" : "client",
        quotePaxCount,
        dayNumber: day.dayNumber,
        dayTitle: day.dayTitle,
        daySource,
        serviceOrder: resolveServiceOrder(service, serviceIndex),
        serviceId,
        providerId,
        providerKey,
        providerName,
        serviceName: resolveServiceName(service),
        serviceType,
        serviceDate: getServiceDate(quoteStartDate, day.dayNumber),
        currency: normalizeCurrency(service?.moneda ?? service?.tariff?.moneda),
        quotedUnit: roundMoney(pricing.presentationTotal / Math.max(1, pricing.pax)),
        quotedTotal: pricing.providerTotal,
        commercialBaseTotal: pricing.presentationTotal,
        commercialAdultBaseTotal: pricing.adultPresentationTotal,
        commercialChildBaseTotal: pricing.childPresentationTotal,
        adultBaseUnit: pricing.adultUnit,
        childBaseUnit: pricing.childUnit,
        adultPax: pricing.adultPax,
        childPax: pricing.childPax,
        igvAmount: pricing.igvAmount,
        igvPerPerson: pricing.igvPerPerson,
        hasIgv: pricing.hasIgv,
        pax: pricing.pax,
        service,
      });
    });
  };

  days.forEach((day) => {
    appendServices(day, day.mainServices, "main");
    appendServices(day, day.externalServices, "external");
  });

  return rows.sort((left, right) => {
    if (left.dayNumber !== right.dayNumber) return left.dayNumber - right.dayNumber;
    if (left.daySource !== right.daySource) return left.daySource === "main" ? -1 : 1;
    if (left.serviceOrder !== right.serviceOrder) return left.serviceOrder - right.serviceOrder;
    return (left.serviceId ?? Number.MAX_SAFE_INTEGER) - (right.serviceId ?? Number.MAX_SAFE_INTEGER);
  });
};

export interface PaymentReportDayGroup<T extends QuoteServiceRow = QuoteServiceRow> {
  dayNumber: number;
  dayTitle: string;
  serviceDate: string | null;
  rows: T[];
}

export const groupPaymentRowsByDay = <T extends QuoteServiceRow>(
  rows: T[],
): PaymentReportDayGroup<T>[] => {
  const groups = new Map<number, PaymentReportDayGroup<T>>();
  rows.forEach((row) => {
    if (!groups.has(row.dayNumber)) {
      groups.set(row.dayNumber, {
        dayNumber: row.dayNumber,
        dayTitle: row.dayTitle || `Día ${row.dayNumber}`,
        serviceDate: row.serviceDate,
        rows: [],
      });
    }
    groups.get(row.dayNumber)!.rows.push(row);
  });
  return [...groups.values()]
    .sort((left, right) => left.dayNumber - right.dayNumber)
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort((left, right) => {
        if (left.daySource !== right.daySource) return left.daySource === "main" ? -1 : 1;
        if (left.serviceOrder !== right.serviceOrder) return left.serviceOrder - right.serviceOrder;
        return (left.serviceId ?? Number.MAX_SAFE_INTEGER) - (right.serviceId ?? Number.MAX_SAFE_INTEGER);
      }),
    }));
};

export const normalizePaymentStatus = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase();

export const isPaidPaymentRequest = (request: any): boolean => {
  const status = normalizePaymentStatus(request?.status);
  return (
    ["paid", "approved", "completed", "pagado", "aprobado"].includes(status) ||
    Boolean(request?.paid_at)
  );
};

export const summarizeServiceRequests = (requests: any[] = []) => {
  let requested = 0;
  let paid = 0;
  let pending = 0;
  for (const request of requests) {
    const amount = roundMoney(request?.amount);
    requested += amount;
    if (isPaidPaymentRequest(request)) paid += amount;
    else if (normalizePaymentStatus(request?.status) !== "cancelled") pending += amount;
  }
  const active = requests.filter(
    (request) => normalizePaymentStatus(request?.status) !== "cancelled",
  );
  return {
    requested: roundMoney(requested),
    paid: roundMoney(paid),
    pending: roundMoney(pending),
    status:
      active.length === 0
        ? "unrequested"
        : active.every(isPaidPaymentRequest)
          ? "paid"
          : paid > 0
            ? "partial"
            : "pending",
  } as const;
};

const normalizePaymentContext = (context: any): string => {
  if (!context) return "";
  if (typeof context === "string") return context.trim();
  return String(context?.tipo ?? "").trim();
};

const movementAmountInUsd = (movement: any): number => {
  const explicitBase = toNumber(movement?.contexto_pago?.conversion?.monto_base_usd);
  if (explicitBase > 0) return explicitBase;
  const amount = toNumber(movement?.monto);
  if (normalizeCurrency(movement?.moneda) === "dolares") return amount;
  const exchangeRate = toNumber(
    movement?.contexto_pago?.conversion?.tipo_cambio ??
      movement?.contexto_pago?.tipo_cambio,
  );
  return exchangeRate > 0 ? amount / exchangeRate : 0;
};

export const summarizeFileCollection = ({
  movements = [],
  voucherCode,
  voucherVentaId,
  quoteTotal,
}: {
  movements?: any[];
  voucherCode?: string;
  voucherVentaId?: number | null;
  quoteTotal?: number;
}) => {
  const code = String(voucherCode ?? "").trim().toLowerCase();
  const voucherId = voucherVentaId == null ? "" : String(voucherVentaId);
  const relevant = movements.filter((movement) => {
    if (String(movement?.tipo_movimiento ?? "").toLowerCase() !== "ingreso") return false;
    const context = normalizePaymentContext(movement?.contexto_pago);
    if (context && context !== "PagoCotizacion") return false;
    const movementCode = String(movement?.voucher_code ?? "").trim().toLowerCase();
    const saleReference = String(movement?.referencia_voucher_venta ?? "").trim();
    return Boolean((code && movementCode === code) || (voucherId && saleReference === voucherId));
  });
  const paid = roundMoney(relevant.reduce((sum, movement) => sum + movementAmountInUsd(movement), 0));
  const total = roundMoney(quoteTotal);
  const remaining = roundMoney(Math.max(0, total - paid));
  return {
    paid,
    total,
    remaining,
    status: total > 0 && remaining <= 0.01 ? "paid" : paid > 0 ? "partial" : "pending",
  } as const;
};

export interface AgencyReportRow extends QuoteServiceRow {
  /** Fee/comisión exacta atribuida al servicio antes del redondeo comercial. */
  commissionAmount: number;
  commissionPerPerson: number;
  /** Gastos administrativos exactos atribuidos al servicio. */
  administrativeAmount: number;
  administrativePerPerson: number;
  /** Otros adicionales exactos distribuidos en el itinerario principal. */
  extraAmount: number;
  extraPerPerson: number;
  additionalAmount: number;
  additionalPerPerson: number;
  /** Cálculo exacto (2 decimales) conservado exclusivamente para auditoría. */
  exactUnitWithCommission: number;
  exactTotalWithCommission: number;
  /** Valores enteros reconciliados que deben mostrarse/exportarse. */
  displayQuotedUnit: number;
  displayCommissionPerPerson: number;
  displayAdministrativePerPerson: number;
  displayExtraPerPerson: number;
  displayAdditionalPerPerson: number;
  displayAdditionalAmount: number;
  displayIgvPerPerson: number;
  /** Precio comercial por pax y total final del servicio, ambos sin decimales. */
  unitWithCommission: number;
  totalWithCommission: number;
  /** Diferencia entre el total exacto y el total comercial reconciliado. */
  roundingAdjustment: number;
}

const readAdditionalNumber = (costs: any, ...keys: string[]): number => {
  for (const key of keys) {
    const value = toNumber(costs?.[key]);
    if (value !== 0) return value;
  }
  return 0;
};

const readAdditionalFlag = (costs: any, field: string, fallback = true): boolean => {
  const snake = field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  const value =
    costs?.[field] ??
    costs?.[snake] ??
    costs?.applyAdditionalCostsToChildren ??
    costs?.apply_additional_costs_to_children;
  return value == null ? fallback : value !== false;
};

interface AudienceAdditionalConfig {
  operationalMode: string;
  operationalValue: number;
  feeMode: string;
  feeValue: number;
  extraValue: number;
}

/** Mirrors quotePricingEngine.calculateAdditionalAmount configuration rules. */
const resolveAudienceAdditionalConfig = (
  costs: any,
  audience: "adult" | "child",
): AudienceAdditionalConfig => {
  const isChild = audience === "child";
  const useAdultOperational =
    !isChild || readAdditionalFlag(costs, "applyOperationalCostsToChildren");
  const useAdultFee = !isChild || readAdditionalFlag(costs, "applyFeeToChildren");
  const useAdultExtra =
    !isChild || readAdditionalFlag(costs, "applyExtraFeeToChildren");

  return {
    operationalMode: String(
      useAdultOperational
        ? costs?.operationalMode ?? costs?.operational_mode ?? "fixed"
        : costs?.childOperationalMode ??
            costs?.child_operational_mode ??
            costs?.operationalMode ??
            costs?.operational_mode ??
            "fixed",
    ).toLowerCase(),
    operationalValue: readAdditionalNumber(
      useAdultOperational
        ? costs
        : {
            value:
              costs?.childOperationalCosts ??
              costs?.child_operational_costs ??
              costs?.operationalCosts ??
              costs?.operational_costs,
          },
      ...(useAdultOperational
        ? ["operationalCosts", "operational_costs"]
        : ["value"]),
    ),
    feeMode: String(
      useAdultFee
        ? costs?.feeMode ?? costs?.fee_mode ?? "fixed"
        : costs?.childFeeMode ??
            costs?.child_fee_mode ??
            costs?.feeMode ??
            costs?.fee_mode ??
            "fixed",
    ).toLowerCase(),
    feeValue: readAdditionalNumber(
      useAdultFee
        ? costs
        : { value: costs?.childFee ?? costs?.child_fee ?? costs?.fee ?? costs?.feeVal ?? costs?.fee_val },
      ...(useAdultFee ? ["fee", "feeVal", "fee_val"] : ["value"]),
    ),
    extraValue: readAdditionalNumber(
      useAdultExtra
        ? costs
        : { value: costs?.childExtraFee ?? costs?.child_extra_fee ?? costs?.extraFee ?? costs?.extra_fee },
      ...(useAdultExtra ? ["extraFee", "extra_fee"] : ["value"]),
    ),
  };
};

/** Cent-exact weighted distribution copied from the ExportVentaJpg strategy. */
const allocateMoneyTarget = (
  target: number,
  weights: number[],
  eligibleIndices: number[],
): number[] => {
  const count = Math.max(1, weights.length);
  const targetCents = Math.max(0, Math.round(toNumber(target) * 100));
  if (targetCents === 0) return Array(count).fill(0);

  const eligible = new Set(eligibleIndices);
  let safeWeights = Array.from({ length: count }, (_, index) =>
    eligible.has(index) ? Math.max(0, toNumber(weights[index])) : 0,
  );
  let weightTotal = safeWeights.reduce((sum, value) => sum + value, 0);
  if (weightTotal <= 0) {
    safeWeights = safeWeights.map((_, index) => (eligible.has(index) ? 1 : 0));
    weightTotal = safeWeights.reduce((sum, value) => sum + value, 0);
  }
  if (weightTotal <= 0) return Array(count).fill(0);

  const raw = safeWeights.map((weight) => (targetCents * weight) / weightTotal);
  const cents = raw.map((value) => Math.floor(value));
  let remaining = targetCents - cents.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .filter((item) => eligible.has(item.index))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let cursor = 0; remaining > 0 && order.length > 0; cursor += 1) {
    cents[order[cursor % order.length].index] += 1;
    remaining -= 1;
  }
  return cents.map((value) => value / 100);
};

const resolveQuoteAudienceCounts = (quote: any, rows: QuoteServiceRow[]) => {
  const details = resolveQuotePeopleDetails(quote);
  const detailsAdults = Array.isArray(details?.adults) ? details.adults.length : 0;
  const detailsChildren = Array.isArray(details?.children) ? details.children.length : 0;
  const configuredAdults = Math.max(
    0,
    Math.trunc(
      toNumber(quote?.peopleCount?.adults ?? quote?.num_adults ?? quote?.adultos),
    ),
  );
  const configuredChildren = Math.max(
    0,
    Math.trunc(
      toNumber(quote?.peopleCount?.children ?? quote?.num_children ?? quote?.ninos),
    ),
  );
  const fallbackChildren = Math.max(0, ...rows.map((row) => row.childPax));
  const children = detailsChildren || configuredChildren || fallbackChildren;
  const total = Math.max(
    1,
    Math.trunc(toNumber(quote?.cantidadpersonas)) ||
      detailsAdults + detailsChildren ||
      configuredAdults + configuredChildren ||
      Math.max(...rows.map((row) => row.pax), 1),
  );
  const adults =
    detailsAdults || configuredAdults || Math.max(0, total - children);
  return { adults, children };
};

const percentageAmountForRowAudience = (
  unitBase: number,
  pax: number,
  percentage: number,
): number => {
  if (pax <= 0 || percentage <= 0) return 0;
  // SummaryContent rounds the per-person base first, then each percentage.
  const perPerson = roundMoney((roundMoney(unitBase) * percentage) / 100);
  return roundMoney(perPerson * pax);
};

const resolveRoundedQuoteCommercialTarget = (quote: any, rows: QuoteServiceRow[]): number | null => {
  if (rows.length === 0) return null;
  // `total_final` is the persisted value produced by SummaryContent after
  // Math.ceil(price-per-person) × beneficiaries. It is only safe to reconcile
  // directly when the report is expressed in one currency.
  if (new Set(rows.map((row) => row.currency)).size !== 1) return null;
  const costs = quote?.additionalcosts ?? quote?.additionalCosts ?? {};
  const raw = firstPositiveNumber(
    quote?.total_final,
    quote?.totalFinal,
    quote?.grandTotal,
    quote?.grand_total,
    costs?.visibleSummaryGrandTotal,
    costs?.summaryVisibleGrandTotal,
    costs?.acSummaryGrandTotal,
    costs?.finalTotal,
    costs?.final_total,
    costs?.grandTotal,
    costs?.grand_total,
  );
  return raw > 0 ? Math.ceil(raw - Number.EPSILON) : null;
};

interface IntegerUnitAllocation {
  units: number[];
  target: number;
  reconciled: boolean;
}

/**
 * Distribuye el redondeo entero de SummaryContent entre servicios.
 *
 * El total de la cotización se forma con precios por persona enteros. Para no
 * inflar un file con `ceil()` independiente en cada servicio, buscamos la
 * combinación de unidades enteras más cercana a los importes exactos cuyo
 * `unidad × pax` reconcilie exactamente con `total_final`.
 */
const reconcileIntegerServiceUnits = (
  rows: Array<{ pax: number; exactUnitWithCommission: number }>,
  target: number | null,
): IntegerUnitAllocation => {
  const exactUnits = rows.map((row) => Math.max(0, toNumber(row.exactUnitWithCommission)));
  const pax = rows.map((row) => Math.max(1, Math.trunc(toNumber(row.pax) || 1)));
  const fallbackUnits = exactUnits.map((value) => Math.ceil(value - Number.EPSILON));
  const fallbackTarget = fallbackUnits.reduce(
    (sum, unit, index) => sum + unit * pax[index],
    0,
  );

  if (target == null || !Number.isFinite(target) || target < 0) {
    return { units: fallbackUnits, target: fallbackTarget, reconciled: false };
  }

  const normalizedTarget = Math.max(0, Math.ceil(target - Number.EPSILON));
  const floors = exactUnits.map((value) => Math.max(0, Math.floor(value + Number.EPSILON)));
  const floorTotal = floors.reduce((sum, unit, index) => sum + unit * pax[index], 0);
  const delta = normalizedTarget - floorTotal;
  // En una cotización consistente el desfase proviene del redondeo por pax y
  // no debería superar unas pocas unidades por beneficiario. Este límite evita
  // una búsqueda costosa si llega un snapshot histórico incoherente.
  const maxReasonableDelta = Math.max(200, pax.reduce((sum, value) => sum + value, 0) * 2);

  if (delta < 0 || delta > maxReasonableDelta) {
    return { units: fallbackUnits, target: fallbackTarget, reconciled: false };
  }
  if (delta === 0) {
    return { units: floors, target: normalizedTarget, reconciled: true };
  }

  type State = { cost: number; increments: number[] };
  let states = new Map<number, State>([[0, { cost: 0, increments: [] }]]);

  rows.forEach((_, index) => {
    const next = new Map<number, State>();
    const step = pax[index];
    states.forEach((state, amount) => {
      const maxIncrement = Math.floor((delta - amount) / step);
      for (let increment = 0; increment <= maxIncrement; increment += 1) {
        const nextAmount = amount + increment * step;
        const unit = floors[index] + increment;
        const deviation = unit - exactUnits[index];
        const cost = state.cost + deviation * deviation * step;
        const previous = next.get(nextAmount);
        if (!previous || cost < previous.cost - 1e-9) {
          next.set(nextAmount, {
            cost,
            increments: [...state.increments, increment],
          });
        }
      }
    });
    states = next;
  });

  const resolved = states.get(delta);
  if (!resolved) {
    return { units: fallbackUnits, target: fallbackTarget, reconciled: false };
  }

  return {
    units: floors.map((unit, index) => unit + (resolved.increments[index] || 0)),
    target: normalizedTarget,
    reconciled: true,
  };
};

/** Reparte una unidad comercial entera entre base + adicionales sin decimales. */
const reconcileIntegerUnitBreakdown = (
  exactValues: number[],
  targetUnit: number,
): number[] => {
  const safe = exactValues.map((value) => Math.max(0, toNumber(value)));
  const values = safe.map((value) => Math.floor(value + Number.EPSILON));
  let remaining = Math.max(0, Math.trunc(targetUnit) - values.reduce((sum, value) => sum + value, 0));
  const order = safe
    .map((value, index) => ({
      index,
      remainder: value - Math.floor(value + Number.EPSILON),
      weight: value,
    }))
    .sort(
      (left, right) =>
        right.remainder - left.remainder || right.weight - left.weight || left.index - right.index,
    );

  for (let cursor = 0; remaining > 0 && order.length > 0; cursor += 1) {
    values[order[cursor % order.length].index] += 1;
    remaining -= 1;
  }
  return values;
};

export const buildAgencyPaymentRows = (quote: any, agency: any = null): AgencyReportRow[] => {
  const baseRows = flattenQuoteServices(quote, agency);
  if (baseRows.length === 0) return [];

  const costs = quote?.additionalcosts ?? quote?.additionalCosts ?? {};
  const adultCfg = resolveAudienceAdditionalConfig(costs, "adult");
  const childCfg = resolveAudienceAdditionalConfig(costs, "child");
  const { adults: quoteAdults, children: quoteChildren } = resolveQuoteAudienceCounts(
    quote,
    baseRows,
  );
  const mainIndices = baseRows
    .map((row, index) => (row.daySource === "main" ? index : -1))
    .filter((index) => index >= 0);

  const buildComponentAmounts = (
    adultMode: string,
    adultValue: number,
    childMode: string,
    childValue: number,
  ) => {
    const amounts = Array(baseRows.length).fill(0);

    if (adultMode === "percentage") {
      baseRows.forEach((row, index) => {
        if (row.daySource !== "main") return;
        amounts[index] += percentageAmountForRowAudience(
          row.adultBaseUnit,
          row.adultPax,
          adultValue,
        );
      });
    } else if (adultValue > 0 && quoteAdults > 0) {
      const allocated = allocateMoneyTarget(
        roundMoney(adultValue * quoteAdults),
        baseRows.map((row) => row.commercialAdultBaseTotal),
        mainIndices,
      );
      allocated.forEach((amount, index) => {
        amounts[index] += amount;
      });
    }

    if (childMode === "percentage") {
      baseRows.forEach((row, index) => {
        if (row.daySource !== "main") return;
        amounts[index] += percentageAmountForRowAudience(
          row.childBaseUnit,
          row.childPax,
          childValue,
        );
      });
    } else if (childValue > 0 && quoteChildren > 0) {
      const allocated = allocateMoneyTarget(
        roundMoney(childValue * quoteChildren),
        baseRows.map((row) => row.commercialChildBaseTotal),
        mainIndices,
      );
      allocated.forEach((amount, index) => {
        amounts[index] += amount;
      });
    }

    return amounts.map(roundMoney);
  };

  const operationalAmounts = buildComponentAmounts(
    adultCfg.operationalMode,
    adultCfg.operationalValue,
    childCfg.operationalMode,
    childCfg.operationalValue,
  );
  const feeAmounts = buildComponentAmounts(
    adultCfg.feeMode,
    adultCfg.feeValue,
    childCfg.feeMode,
    childCfg.feeValue,
  );
  // extraFee is a fixed per-person additional in quotePricingEngine.
  const extraAmounts = buildComponentAmounts(
    "fixed",
    adultCfg.extraValue,
    "fixed",
    childCfg.extraValue,
  );

  const exactRows = baseRows.map((row, index) => {
    const servicePax = Math.max(1, row.pax);
    const administrativeAmount =
      row.daySource === "main" ? roundMoney(operationalAmounts[index]) : 0;
    const commissionAmount =
      row.daySource === "main" ? roundMoney(feeAmounts[index]) : 0;
    const extraAmount =
      row.daySource === "main" ? roundMoney(extraAmounts[index]) : 0;
    const additionalAmount = roundMoney(
      administrativeAmount + commissionAmount + extraAmount,
    );
    const exactTotalWithCommission = roundMoney(
      row.commercialBaseTotal + additionalAmount,
    );
    const exactUnitWithCommission = roundMoney(
      exactTotalWithCommission / servicePax,
    );

    return {
      ...row,
      quotedUnit: roundMoney(row.commercialBaseTotal / servicePax),
      commissionAmount,
      commissionPerPerson: roundMoney(commissionAmount / servicePax),
      administrativeAmount,
      administrativePerPerson: roundMoney(administrativeAmount / servicePax),
      extraAmount,
      extraPerPerson: roundMoney(extraAmount / servicePax),
      additionalAmount,
      additionalPerPerson: roundMoney(additionalAmount / servicePax),
      exactUnitWithCommission,
      exactTotalWithCommission,
    };
  });

  const target = resolveRoundedQuoteCommercialTarget(quote, baseRows);
  const allocation = reconcileIntegerServiceUnits(exactRows, target);

  return exactRows.map((row, index) => {
    const servicePax = Math.max(1, row.pax);
    const unitWithCommission = allocation.units[index];
    const totalWithCommission = unitWithCommission * servicePax;
    const [
      displayQuotedUnit,
      displayAdministrativePerPerson,
      displayCommissionPerPerson,
      displayExtraPerPerson,
    ] = reconcileIntegerUnitBreakdown(
      [
        row.quotedUnit,
        row.administrativePerPerson,
        row.commissionPerPerson,
        row.extraPerPerson,
      ],
      unitWithCommission,
    );
    const displayAdditionalPerPerson =
      displayAdministrativePerPerson +
      displayCommissionPerPerson +
      displayExtraPerPerson;

    return {
      ...row,
      displayQuotedUnit,
      displayCommissionPerPerson,
      displayAdministrativePerPerson,
      displayExtraPerPerson,
      displayAdditionalPerPerson,
      displayAdditionalAmount: displayAdditionalPerPerson * servicePax,
      displayIgvPerPerson: Math.ceil(row.igvPerPerson - Number.EPSILON),
      unitWithCommission,
      totalWithCommission,
      roundingAdjustment: roundMoney(totalWithCommission - row.exactTotalWithCommission),
    };
  });
};

export interface ProviderPaymentReportRow extends AgencyReportRow {
  requestSummary: ReturnType<typeof summarizeServiceRequests>;
}

export interface ProviderPaymentReportGroup {
  providerKey: string;
  providerId: number | null;
  providerName: string;
  rows: ProviderPaymentReportRow[];
  dayGroups: PaymentReportDayGroup<ProviderPaymentReportRow>[];
  totals: Record<
    CurrencyKey,
    {
      /** Importe comercial mostrado en el documento: servicio + IGV + G.Adm + Fee. */
      commercial: number;
      /** Costo proveedor usado para conciliar solicitudes/liquidaciones. */
      supplier: number;
      paid: number;
      pending: number;
    }
  >;
  status: "unrequested" | "pending" | "partial" | "paid";
}

/**
 * Construye el documento Kelly/Venso desde las mismas filas comerciales que el
 * informativo de agencia. El monto visible SIEMPRE incluye los adicionales
 * configurados de la cotización por servicio, mientras que el estado de pago
 * continúa conciliándose contra el costo proveedor (`quotedTotal`).
 */
export const buildProviderPaymentGroups = (
  quote: any,
  agency: any = null,
  paymentRequests: any[] = [],
): ProviderPaymentReportGroup[] => {
  const requestsByService = new Map<string, any[]>();
  paymentRequests.forEach((request) => {
    const quoteMatches =
      request?.cotizacion_id == null || String(request.cotizacion_id) === String(quote?.id);
    if (!quoteMatches || request?.itinerario_servicio_id == null) return;
    const key = String(request.itinerario_servicio_id);
    requestsByService.set(key, [...(requestsByService.get(key) || []), request]);
  });

  const groups = new Map<string, Omit<ProviderPaymentReportGroup, "dayGroups" | "status">>();

  buildAgencyPaymentRows(quote, agency).forEach((row) => {
    const requestSummary = summarizeServiceRequests(
      row.serviceId == null ? [] : requestsByService.get(String(row.serviceId)) || [],
    );
    if (!groups.has(row.providerKey)) {
      groups.set(row.providerKey, {
        providerKey: row.providerKey,
        providerId: row.providerId,
        providerName: row.providerName,
        rows: [],
        totals: {
          soles: { commercial: 0, supplier: 0, paid: 0, pending: 0 },
          dolares: { commercial: 0, supplier: 0, paid: 0, pending: 0 },
        },
      });
    }

    const group = groups.get(row.providerKey)!;
    group.rows.push({ ...row, requestSummary });
    const totals = group.totals[row.currency];
    totals.commercial += row.totalWithCommission;
    totals.supplier += row.quotedTotal;
    totals.paid += requestSummary.paid;
    // El estado de la solicitud corresponde al costo real del proveedor, no al fee comercial.
    totals.pending += Math.max(0, row.quotedTotal - requestSummary.paid);
  });

  return [...groups.values()].map((group) => {
    Object.values(group.totals).forEach((total) => {
      total.commercial = roundMoney(total.commercial);
      total.supplier = roundMoney(total.supplier);
      total.paid = roundMoney(total.paid);
      total.pending = roundMoney(total.pending);
    });
    const states = group.rows.map((row) => row.requestSummary.status);
    const status: ProviderPaymentReportGroup["status"] =
      states.length > 0 && states.every((state) => state === "paid")
        ? "paid"
        : states.some((state) => state === "paid" || state === "partial")
          ? "partial"
          : states.some((state) => state === "pending")
            ? "pending"
            : "unrequested";

    return {
      ...group,
      dayGroups: groupPaymentRowsByDay(group.rows),
      status,
    };
  });
};
