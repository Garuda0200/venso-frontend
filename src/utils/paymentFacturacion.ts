import {
  getServiceBeneficiaries,
  getServiceTariff,
} from "../pages/Reservas/VouchersReserva/utils/serviceAssignment";

const EXPORTACION_SERVICE_TYPES = new Set([
  "restaurante",
  "restaurantes",
  "endose",
  "endoses",
  "transporte",
  "transportes",
]);

export const normalizeFacturacionValue = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (normalized.includes("export")) {
    return "exportacion";
  }

  if (normalized.includes("intang")) {
    return "intangible";
  }

  return "";
};

const normalizeOptionalObject = (value) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  return Object.keys(value).length > 0 ? value : null;
};

export const inferPaymentServiceType = (serviceData, childService) => {
  const declaredCandidates = [
    serviceData?.typeService,
    serviceData?.type_service,
    serviceData?.tipo_servicio,
    serviceData?.parentService?.typeService,
    serviceData?.parentService?.type_service,
    serviceData?.parentService?.tipo_servicio,
    childService?.typeService,
    childService?.type_service,
    childService?.tipo_servicio,
  ];

  const declaredType = declaredCandidates
    .map((value) =>
      String(value || "")
        .trim()
        .toLowerCase(),
    )
    .find(Boolean);

  if (declaredType) return declaredType;

  if (childService?.servicio_extra || childService?.id_servicio_extra) {
    return "extras";
  }
  if (childService?.ticket || childService?.id_ticket) {
    return "tickets";
  }
  if (childService?.restaurante || childService?.id_restaurante) {
    return "restaurantes";
  }
  if (
    childService?.transporte ||
    childService?.id_transporte ||
    childService?.movilidad ||
    childService?.id_movilidad
  ) {
    return "transportes";
  }
  if (childService?.endose || childService?.id_endose) {
    return "endoses";
  }

  return "";
};

export const normalizePaymentServiceData = (serviceData) => {
  if (!serviceData || typeof serviceData !== "object") {
    return null;
  }

  const rawChildService = serviceData.childService || null;
  const normalizedType = inferPaymentServiceType(serviceData, rawChildService);
  const embeddedChild =
    rawChildService?.servicio_extra ||
    rawChildService?.ticket ||
    rawChildService?.restaurante ||
    rawChildService?.transporte ||
    rawChildService?.movilidad ||
    rawChildService?.endose ||
    rawChildService ||
    serviceData.parentService ||
    null;

  const normalizedChildService = rawChildService
    ? rawChildService
    : normalizedType === "extras"
      ? { servicio_extra: embeddedChild }
      : normalizedType === "tickets"
        ? { ticket: embeddedChild }
        : normalizedType === "restaurantes"
          ? { restaurante: embeddedChild }
          : normalizedType === "transportes"
            ? { transporte: embeddedChild }
            : normalizedType === "endoses"
              ? { endose: embeddedChild }
              : embeddedChild || {};

  return {
    ...serviceData,
    typeService: normalizedType || serviceData.typeService || "otros",
    parentService: normalizeOptionalObject(serviceData.parentService),
    childService: normalizedChildService,
  };
};

export const resolveFacturacionFromServiceData = (serviceData) => {
  const normalizedServiceData = normalizePaymentServiceData(serviceData);
  const inferredType = inferPaymentServiceType(
    normalizedServiceData,
    normalizedServiceData?.childService,
  );

  return EXPORTACION_SERVICE_TYPES.has(inferredType)
    ? "exportacion"
    : "intangible";
};


const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== "");

const normalizePricingNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundPaymentPrice = (value) =>
  Math.round(normalizePricingNumber(value) * 100) / 100;

const buildPricingSummary = (rootService, assigned = false) => {
  const tariff = getServiceTariff(rootService, assigned) || {};
  const beneficiaries = getServiceBeneficiaries(rootService, assigned) || {};
  const adults = Array.isArray(beneficiaries.adults)
    ? beneficiaries.adults
    : [];
  const children = Array.isArray(beneficiaries.children)
    ? beneficiaries.children
    : [];
  const childPrices = children
    .map((child) =>
      roundPaymentPrice(
        firstDefined(child?.precio, child?.price, child?.precio_nino, 0),
      ),
    )
    .filter((price) => price > 0);
  const uniqueChildPrices = [...new Set(childPrices)].sort(
    (left, right) => left - right,
  );
  const childTotal = roundPaymentPrice(
    childPrices.reduce((sum, price) => sum + price, 0),
  );
  const total = roundPaymentPrice(
    firstDefined(
      tariff?.precio_original_with_child_extras,
      tariff?.precioOriginalWithChildExtras,
      tariff?.precio_original,
      tariff?.precioOriginal,
      assigned
        ? firstDefined(
            rootService?.assignedPrecioTotal,
            rootService?.assigned_precio_total,
          )
        : firstDefined(rootService?.precioTotal, rootService?.precio_total),
      tariff?.precio,
      0,
    ),
  );
  const unit = roundPaymentPrice(
    firstDefined(
      tariff?.precio,
      assigned
        ? firstDefined(
            rootService?.assignedPrecioServicio,
            rootService?.assigned_precio_servicio,
          )
        : firstDefined(
            rootService?.precioServicio,
            rootService?.precio_servicio,
          ),
      0,
    ),
  );

  return {
    unit,
    total,
    adults,
    children,
    adultCount: adults.length,
    childCount: children.length,
    convertedChildCount: adults.filter((adult) => adult?.child_origin).length,
    childPrices: uniqueChildPrices,
    childTotal,
    currency:
      tariff?.moneda ||
      tariff?.currency ||
      (assigned
        ? firstDefined(
            rootService?.assignedMoneda,
            rootService?.assigned_moneda,
          )
        : rootService?.moneda) ||
      "USD",
    hasPricing: unit > 0 || total > 0 || childTotal > 0,
  };
};

const buildQuotedPresentation = (serviceData) => {
  const quoted =
    serviceData?.quotedService || serviceData?.quoted_service || serviceData;

  return normalizePaymentServiceData({
    ...serviceData,
    ...(quoted || {}),
    typeService: firstDefined(
      quoted?.typeService,
      quoted?.type_service,
      serviceData?.typeService,
      serviceData?.type_service,
      serviceData?.tipo_servicio,
    ),
    parentService: firstDefined(
      quoted?.parentService,
      quoted?.parent_service,
      serviceData?.parentService,
      serviceData?.parent_service,
    ),
    childService: firstDefined(
      quoted?.childService,
      quoted?.child_service,
      serviceData?.childService,
      serviceData?.child_service,
    ),
    tariff: firstDefined(
      quoted?.tariff,
      quoted?.tarifa,
      serviceData?.tariff,
      serviceData?.tarifa,
    ),
  });
};

const buildAssignedPresentation = (serviceData) => {
  const assigned = serviceData?.assignedService || serviceData?.assigned_service;
  const parentService = firstDefined(
    assigned?.parentService,
    assigned?.parent_service,
    serviceData?.assignedParentService,
    serviceData?.assigned_parent_service,
  );
  const childService = firstDefined(
    assigned?.childService,
    assigned?.child_service,
    serviceData?.assignedChildService,
    serviceData?.assigned_child_service,
  );
  const hasAssignedPricing = [
    assigned?.precioServicio,
    assigned?.precio_servicio,
    assigned?.precioTotal,
    assigned?.precio_total,
    serviceData?.assignedPrecioServicio,
    serviceData?.assigned_precio_servicio,
    serviceData?.assignedPrecioTotal,
    serviceData?.assigned_precio_total,
  ].some((value) => value !== undefined && value !== null && value !== "");
  const hasAssigned = Boolean(
    assigned ||
      parentService ||
      childService ||
      serviceData?.isAssigned ||
      serviceData?.is_assigned ||
      hasAssignedPricing,
  );

  if (!hasAssigned) return null;

  return normalizePaymentServiceData({
    ...(assigned || {}),
    typeService: firstDefined(
      assigned?.typeService,
      assigned?.type_service,
      serviceData?.typeService,
      serviceData?.type_service,
      serviceData?.tipo_servicio,
    ),
    parentService,
    childService,
    tariff: firstDefined(
      assigned?.tariff,
      assigned?.tarifa,
      serviceData?.assignedTariff,
      serviceData?.assigned_tariff,
      {
        precio: firstDefined(
          serviceData?.assignedPrecioServicio,
          serviceData?.assigned_precio_servicio,
          assigned?.precioServicio,
          assigned?.precio_servicio,
        ),
        precio_original: firstDefined(
          serviceData?.assignedPrecioTotal,
          serviceData?.assigned_precio_total,
          assigned?.precioTotal,
          assigned?.precio_total,
        ),
        precio_original_with_child_extras: firstDefined(
          serviceData?.assignedPrecioTotal,
          serviceData?.assigned_precio_total,
          assigned?.precioTotal,
          assigned?.precio_total,
        ),
        moneda: firstDefined(
          serviceData?.assignedMoneda,
          serviceData?.assigned_moneda,
          assigned?.moneda,
        ),
      },
    ),
  });
};

/**
 * Devuelve la lectura operativa del servicio realmente asignado por Reservas.
 * Los payment_requests conservan también el servicio originalmente cotizado,
 * por lo que las pantallas de pagos y liquidaciones deben resolver de forma
 * explícita assignedParentService / assignedChildService para no mostrar al
 * proveedor equivocado.
 */
export const resolveAssignedPaymentServiceData = (
  serviceData,
  { fallbackToQuoted = true } = {},
) => {
  if (!serviceData || typeof serviceData !== "object") {
    return null;
  }

  const assigned = buildAssignedPresentation(serviceData);
  if (assigned) return assigned;

  return fallbackToQuoted ? buildQuotedPresentation(serviceData) : null;
};

/**
 * Construye las dos lecturas del servicio vinculado a una solicitud de pago.
 * - Ventas: servicio y precio originalmente cotizados.
 * - Reservas: proveedor/servicio y costo realmente asignados.
 *
 * Acepta tanto el payload nuevo enriquecido como las notificaciones históricas
 * que solo incluían campos planos.
 */
export const buildPaymentServiceComparison = (serviceData) => {
  if (!serviceData || typeof serviceData !== "object") {
    return { quoted: null, assigned: null, quotedPricing: null, assignedPricing: null };
  }

  const quoted = buildQuotedPresentation(serviceData);
  const assigned = buildAssignedPresentation(serviceData);

  return {
    quoted,
    assigned,
    quotedPricing: buildPricingSummary(serviceData, false),
    assignedPricing: assigned ? buildPricingSummary(serviceData, true) : null,
  };
};
