import {
  applyServicePricingRuntime,
  getServicePricingSnapshot,
} from "./servicePricingRuntime";

type AnyRecord = Record<string, any>;

type ExchangeRateOptions = {
  isLocked?: (service: AnyRecord) => boolean;
  onServiceConverted?: (
    converted: AnyRecord,
    original: AnyRecord,
    position: { dayIndex: number; serviceIndex: number },
  ) => void;
};

const round2 = (value: unknown) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export const SERVICE_PICKER_QUOTATION_BASE_TC = 3;

const normalizeCurrency = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const isSoles = (value: unknown) => {
  const currency = normalizeCurrency(value);
  return currency === "pen" || currency === "s/" || currency.includes("sol");
};

const isPositiveRate = (value: unknown) =>
  Number.isFinite(Number(value)) && Number(value) > 0;

/**
 * TC realmente aplicada al precio cotizado del servicio.
 *
 * `tariff.tasa_cambio` pertenece al catálogo. En cambio, `tasaCambio` y
 * `tasa_cambio` en la raíz representan el snapshot comercial ya usado por la
 * cotización. ServicePicker marca ese snapshot explícitamente para no confundir
 * una tarifa técnica USD (TC 1) con la TC comercial de Ventas.
 */
export const resolveServiceExchangeRate = (
  service: AnyRecord | null | undefined,
  fallback = SERVICE_PICKER_QUOTATION_BASE_TC,
) => {
  const tariff = service?.tariff || {};
  const candidates = [
    service?.tasaCambio,
    service?.tasa_cambio,
    tariff?.tasa_cambio_original,
    tariff?.tasaCambioOriginal,
    tariff?.tasa_cambio,
    tariff?.tasaCambio,
  ];

  for (const candidate of candidates) {
    if (isPositiveRate(candidate)) return Number(candidate);
  }

  const originalCurrency = tariff?.moneda_original ?? tariff?.monedaOriginal;
  const currentCurrency = tariff?.moneda ?? service?.moneda;
  if (isSoles(originalCurrency) || isSoles(currentCurrency)) {
    return isPositiveRate(fallback)
      ? Number(fallback)
      : SERVICE_PICKER_QUOTATION_BASE_TC;
  }

  return 1;
};

/**
 * Conserva la TC técnica del catálogo y marca únicamente la TC comercial con
 * la que el servicio entra a la cotización.
 */
export const markServicePickerQuotationExchangeRate = (
  service: AnyRecord | null | undefined,
  baseRate = SERVICE_PICKER_QUOTATION_BASE_TC,
) => {
  if (!service || typeof service !== "object") return service;

  const normalizedRate = isPositiveRate(baseRate)
    ? Number(baseRate)
    : SERVICE_PICKER_QUOTATION_BASE_TC;

  return {
    ...service,
    tasaCambio: normalizedRate,
    tasa_cambio: normalizedRate,
    fxMeta: {
      ...(service.fxMeta || {}),
      source: "service_picker",
      tcApplied: normalizedRate,
    },
  };
};

export const serviceNeedsQuotationExchangeRate = (
  service: AnyRecord | null | undefined,
  quotationExchangeRate: unknown,
  tolerance = 0.0001,
) => {
  const target = Number(quotationExchangeRate);
  if (!isPositiveRate(target)) return false;

  const current = resolveServiceExchangeRate(service);
  return Math.abs(current - target) > tolerance;
};

const scaleNumber = (value: unknown, factor: number) => {
  if (value === null || value === undefined || value === "") return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? round2(numeric * factor) : value;
};

const scaleObjectValues = (source: unknown, factor: number): AnyRecord => {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, scaleNumber(value, factor)]),
  );
};

const scaleChildren = (children: unknown, factor: number) => {
  if (!Array.isArray(children)) return children;

  return children.map((child) => ({
    ...child,
    ...(child?.precio !== undefined
      ? { precio: scaleNumber(child.precio, factor) }
      : {}),
  }));
};

const scaleChildrenPayload = (children: unknown, factor: number) => {
  if (!children || typeof children !== "object" || Array.isArray(children)) {
    return children;
  }

  return Object.fromEntries(
    Object.entries(children).map(([childId, raw]) => {
      if (typeof raw === "number" || typeof raw === "string") {
        return [childId, scaleNumber(raw, factor)];
      }
      if (!raw || typeof raw !== "object") return [childId, raw];

      const next: AnyRecord = { ...(raw as AnyRecord) };
      ["amount", "price", "precio", "value"].forEach((key) => {
        if (next[key] !== undefined) next[key] = scaleNumber(next[key], factor);
      });
      return [childId, next];
    }),
  );
};

const QUOTED_TARIFF_PRICE_KEYS = [
  "precio",
  "precio_adult",
  "precio_original",
  "precio_original_with_child_extras",
  "childExtrasTotal",
  "basePrice",
  "precio_base_sin_igv",
  "roomBaseUnitPrice",
  "roomUnitPrice",
  "roomUnitPriceWithIgv",
  "igvAmount",
] as const;

const scaleTariffPricingState = (tariff: AnyRecord | undefined, factor: number) => {
  const nextTariff: AnyRecord = { ...(tariff || {}) };

  QUOTED_TARIFF_PRICE_KEYS.forEach((key) => {
    if (nextTariff[key] !== undefined) {
      nextTariff[key] = scaleNumber(nextTariff[key], factor);
    }
  });

  if (nextTariff.assignedChildExplicitPriceMap) {
    nextTariff.assignedChildExplicitPriceMap = scaleObjectValues(
      nextTariff.assignedChildExplicitPriceMap,
      factor,
    );
  }
  if (nextTariff.preciosNinos) {
    nextTariff.preciosNinos = scaleObjectValues(nextTariff.preciosNinos, factor);
  }
  if (nextTariff.assignedChildExplicitPriceSum !== undefined) {
    nextTariff.assignedChildExplicitPriceSum = scaleNumber(
      nextTariff.assignedChildExplicitPriceSum,
      factor,
    );
  }

  return nextTariff;
};

/**
 * Aplica manualmente la TC elegida por Ventas al precio cotizado.
 *
 * Fórmula: USD_nuevo = USD_actual * TC_actual / TC_objetivo.
 *
 * No modifica ningún campo operacional `assigned_*` de Reservas.
 */
export const applyQuotationExchangeRateToService = (
  service: AnyRecord | null | undefined,
  quotationExchangeRate: unknown,
) => {
  if (!service || typeof service !== "object") return service;

  const currentRate = resolveServiceExchangeRate(service);
  const targetRate = Number(quotationExchangeRate);
  if (!isPositiveRate(currentRate) || !isPositiveRate(targetRate)) return service;

  if (Math.abs(currentRate - targetRate) <= 0.0001) {
    return {
      ...service,
      tasaCambio: targetRate,
      tasa_cambio: targetRate,
    };
  }

  const factor = currentRate / targetRate;
  const rootChildMap = scaleObjectValues(
    service.assignedChildExplicitPriceMap || {},
    factor,
  );
  const selection = service.passengerSelection || {};
  const selectionChildMap = scaleObjectValues(
    selection.assignedChildExplicitPriceMap || selection.preciosNinos || {},
    factor,
  );

  let nextService: AnyRecord = {
    ...service,
    tariff: scaleTariffPricingState(service.tariff, factor),
    tasaCambio: targetRate,
    tasa_cambio: targetRate,
    ...(service.precioServicio !== undefined
      ? { precioServicio: scaleNumber(service.precioServicio, factor) }
      : {}),
    ...(service.precio_servicio !== undefined
      ? { precio_servicio: scaleNumber(service.precio_servicio, factor) }
      : {}),
    ...(service.precio !== undefined
      ? { precio: scaleNumber(service.precio, factor) }
      : {}),
    ...(service.precio_original !== undefined
      ? { precio_original: scaleNumber(service.precio_original, factor) }
      : {}),
    ...(service.roomBaseUnitPrice !== undefined
      ? { roomBaseUnitPrice: scaleNumber(service.roomBaseUnitPrice, factor) }
      : {}),
    ...(service.roomUnitPrice !== undefined
      ? { roomUnitPrice: scaleNumber(service.roomUnitPrice, factor) }
      : {}),
    ...(service.roomUnitPriceWithIgv !== undefined
      ? { roomUnitPriceWithIgv: scaleNumber(service.roomUnitPriceWithIgv, factor) }
      : {}),
    assignedChildExplicitPriceMap: rootChildMap,
    assignedChildExplicitPriceSum: round2(
      Object.values(rootChildMap).reduce(
        (sum, value) => sum + (Number(value) || 0),
        0,
      ),
    ),
    beneficiariosNinos: scaleChildren(service.beneficiariosNinos, factor),
    beneficiarios_ninos: scaleChildren(service.beneficiarios_ninos, factor),
    children: scaleChildrenPayload(service.children, factor),
    passengerSelection: {
      ...selection,
      assignedChildExplicitPriceMap: selectionChildMap,
      preciosNinos: selectionChildMap,
      assignedChildExplicitPriceSum: round2(
        Object.values(selectionChildMap).reduce(
          (sum, value) => sum + (Number(value) || 0),
          0,
        ),
      ),
    },
  };

  // Son caches derivados. Deben invalidarse antes de reconstruir el runtime,
  // de lo contrario la UI puede conservar el unitario anterior con total nuevo.
  delete nextService.precio_adult;
  delete nextService.amount_per_adult;
  delete nextService.amount_per_child;

  nextService = applyServicePricingRuntime(nextService);
  const pricing = getServicePricingSnapshot(nextService);

  return {
    ...nextService,
    precioTotal: pricing.total,
    precio_total: pricing.total,
    fxMeta: {
      ...(service.fxMeta || {}),
      tcApplied: targetRate,
    },
  };
};

export const collectPendingQuotationExchangeRateServices = (
  days: AnyRecord[] = [],
  quotationExchangeRate: unknown,
  options: ExchangeRateOptions = {},
) => {
  const isLocked = options.isLocked || (() => false);

  return (days || []).reduce<AnyRecord[]>((acc, day, dayIndex) => {
    const services = (day?.servicios || [])
      .map((service: AnyRecord, serviceIndex: number) => ({ service, serviceIndex }))
      .filter(({ service }: { service: AnyRecord }) => {
        if (!service || isLocked(service)) return false;
        return serviceNeedsQuotationExchangeRate(service, quotationExchangeRate);
      });

    if (services.length > 0) {
      acc.push({
        dayIndex,
        dayNumber: day?.numero || dayIndex + 1,
        dayTitle: day?.titulo || "",
        services,
      });
    }

    return acc;
  }, []);
};

export const applyQuotationExchangeRateToDayServices = (
  days: AnyRecord[] = [],
  quotationExchangeRate: unknown,
  options: ExchangeRateOptions = {},
) => {
  const isLocked = options.isLocked || (() => false);
  const onServiceConverted = options.onServiceConverted;

  let mutated = false;
  const nextDays = (days || []).map((day, dayIndex) => ({
    ...day,
    servicios: (day?.servicios || []).map(
      (service: AnyRecord, serviceIndex: number) => {
        if (!service || isLocked(service)) return service;
        if (!serviceNeedsQuotationExchangeRate(service, quotationExchangeRate)) {
          return service;
        }

        const converted = applyQuotationExchangeRateToService(
          service,
          quotationExchangeRate,
        ) as AnyRecord;
        if (converted !== service) {
          mutated = true;
          onServiceConverted?.(converted, service, { dayIndex, serviceIndex });
        }
        return converted;
      },
    ),
  }));

  return {
    mutated,
    days: mutated ? nextDays : days,
  };
};
