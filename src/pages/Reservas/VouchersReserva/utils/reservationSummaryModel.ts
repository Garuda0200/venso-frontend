import { buildSummaryContentPricingModel } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/summaryContentPricingParts";
import { paymentCurrency, assignedPaymentCurrency } from "../../../../utils/paymentCurrency";
import {
  getServiceBeneficiaries,
  getServiceTariff,
  mergeItineraryDaysByNumber,
  resolveServiceType,
} from "./serviceAssignment";
import {
  dedupeReservationSummaryServices,
  findReservationQuotedService,
  getReservationSummaryServiceSource,
  markReservationExternalItinerary,
} from "./reservationSummaryServiceMatching";

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const numeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizePeopleDetails = (value = {}) => {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      value = {};
    }
  }
  if (!value || typeof value !== "object") {
    return { adults: [], children: [], infants: [], details: [] };
  }

  const adults = Array.isArray(value.adults) ? value.adults : [];
  const children = Array.isArray(value.children) ? value.children : [];
  const infants = Array.isArray(value.infants) ? value.infants : [];
  const details = Array.isArray(value.details) ? value.details : [];

  return { ...value, adults, children, infants, details };
};

const getServiceId = (service = {}) =>
  service?.servicioId ??
  service?.itinerarioServicioId ??
  service?.itinerario_servicio_id ??
  service?.id ??
  null;

const normalizeServiceType = (service = {}) =>
  String(
    resolveServiceType(service) ||
      service?.typeService ||
      service?.type_service ||
      service?.parentService?.typeService ||
      service?.parentService?.type_service ||
      "otros",
  ).toLowerCase();

const getAssignedIdentity = (service = {}) => ({
  parentId:
    service?.assignedParentId ??
    service?.assigned_parent_id ??
    service?.assignedService?.assignedParentId ??
    service?.assignedService?.assigned_parent_id ??
    service?.assignedService?.parentId ??
    service?.assignedService?.parent_id ??
    null,
  childId:
    service?.assignedChildId ??
    service?.assigned_child_id ??
    service?.assignedService?.assignedChildId ??
    service?.assignedService?.assigned_child_id ??
    service?.assignedService?.childId ??
    service?.assignedService?.child_id ??
    null,
});

const buildAssignedServiceData = (service = {}) => {
  const parentService =
    service?.assignedParentService ||
    service?.assigned_parent_service ||
    service?.assignedService?.parentService ||
    service?.assigned_service?.parentService ||
    service?.assigned_service?.parent_service ||
    null;
  const childService =
    service?.assignedChildService ||
    service?.assigned_child_service ||
    service?.assignedService?.childService ||
    service?.assigned_service?.childService ||
    service?.assigned_service?.child_service ||
    null;

  const assignedIdentity = getAssignedIdentity(service);
  const hasAssignedIdentity =
    assignedIdentity.parentId != null || assignedIdentity.childId != null;

  if (
    !parentService &&
    !childService &&
    !hasAssignedIdentity &&
    !service?.isAssigned &&
    !service?.is_assigned
  ) {
    return null;
  }

  return {
    ...service,
    typeService: normalizeServiceType(service),
    parentService,
    childService,
    assignedParentId: assignedIdentity.parentId,
    assigned_parent_id: assignedIdentity.parentId,
    assignedChildId: assignedIdentity.childId,
    assigned_child_id: assignedIdentity.childId,
    tariff:
      service?.assignedTariff ||
      service?.assignedService?.tariff ||
      service?.assigned_service?.tariff ||
      service?.assignedTariff ||
      service?.assigned_tariff ||
      service?.tariff ||
      null,
  };
};

const getUniqueChildPrices = (children = []) =>
  [...new Set(
    (Array.isArray(children) ? children : [])
      .map((child) => round2(child?.precio || child?.price || 0))
      .filter((value) => value > 0),
  )].sort((left, right) => left - right);

const buildScopePricing = (service = {}, assigned = false) => {
  const tariff = getServiceTariff(service, assigned) || {};
  const beneficiaries = getServiceBeneficiaries(service, assigned);
  const adults = Array.isArray(beneficiaries?.adults)
    ? beneficiaries.adults
    : [];
  const children = Array.isArray(beneficiaries?.children)
    ? beneficiaries.children
    : [];
  const convertedChildren = adults.filter((beneficiary) => beneficiary?.child_origin);
  const childPrices = getUniqueChildPrices(children);
  const childPriceGroups = children.reduce((groups, child) => {
    const price = round2(child?.precio ?? child?.price ?? 0);
    if (price <= 0) return groups;
    const current = groups.get(price) || { price, count: 0, total: 0 };
    current.count += 1;
    current.total = round2(current.total + price);
    groups.set(price, current);
    return groups;
  }, new Map());
  const childTotal = round2(
    children.reduce(
      (sum, child) => sum + numeric(child?.precio ?? child?.price),
      0,
    ),
  );
  const total = round2(
    tariff?.precio_original_with_child_extras ??
      tariff?.precio_original ??
      tariff?.precio ??
      0,
  );
  const adultBaseTotal = round2(Math.max(0, total - childTotal));

  return {
    tariff,
    adults,
    children,
    adultCount: adults.length,
    explicitChildCount: children.length,
    convertedChildCount: convertedChildren.length,
    perAdult: round2(tariff?.precio || 0),
    childPrices,
    childPriceGroups: [...childPriceGroups.values()],
    childTotal,
    adultBaseTotal,
    total,
    currency: assigned ? assignedPaymentCurrency(service) : paymentCurrency(tariff?.moneda || tariff?.currency || "USD"),
    hasPricing: total > 0 || numeric(tariff?.precio) > 0,
  };
};

const getPaymentStatus = (service = {}) => {
  const request = service?.paymentRequest || service?.payment_request || null;
  const status = String(request?.status || "").toLowerCase();
  if (!request) return { key: "none", label: "Sin solicitud", request: null };
  if (["paid", "approved", "completed", "pagado", "aprobado"].includes(status)) {
    return { key: "paid", label: "Pagado", request };
  }
  if (["cancelled", "rejected", "cancelado", "rechazado"].includes(status)) {
    return { key: "cancelled", label: "Cancelado", request };
  }
  return { key: "pending", label: "Pendiente", request };
};

const normalizeHotelRows = (pricingModel = {}, cotizacion = {}) => {
  const rows = Array.isArray(pricingModel?.perRoomPricing)
    ? pricingModel.perRoomPricing
    : [];
  const selectedHotel =
    cotizacion?.selectedHotel || cotizacion?.selected_hotel || {};

  return rows.map((room, index) => {
    const beneficiaries = Math.max(
      1,
      numeric(room?.beneficiaries) ||
        numeric(room?.adultBeneficiaries) +
          numeric(room?.convertedChildBeneficiaries) ||
        1,
    );
    const perPerson = round2(
      room?.hotelPerPerson ??
        room?.hotel_per_person ??
        (numeric(room?.hotelTotalRoom) > 0
          ? numeric(room.hotelTotalRoom) / beneficiaries
          : 0),
    );
    const total = round2(
      room?.hotelTotalRoom ??
        room?.hotel_total_room ??
        perPerson * beneficiaries,
    );

    return {
      key: room?.key || room?.roomKey || `hotel-room-${index + 1}`,
      label: room?.label || room?.roomLabel || room?.roomKey || "Habitación",
      groupLabel: room?.groupLabel || room?.group_label || "",
      beneficiaries,
      perPerson,
      total,
      nights: Math.max(
        1,
        numeric(room?.nights) ||
          (Array.isArray(room?.groupDayIndices)
            ? room.groupDayIndices.length
            : numeric(selectedHotel?.nights)) ||
          1,
      ),
    };
  });
};

const normalizeAdditionalCostRows = (additionalCosts = {}, pricingModel = {}) => {
  const costs = additionalCosts && typeof additionalCosts === "object"
    ? additionalCosts
    : {};
  const summaryTotals = pricingModel?.summaryTotals || {};
  const rows = [];

  const pushConfigured = ({ key, label, value, mode, calculated }) => {
    const numericValue = numeric(value);
    const calculatedValue = numeric(calculated);
    if (numericValue === 0 && calculatedValue === 0) return;
    rows.push({
      key,
      label,
      configured: mode === "percentage" ? `${numericValue}%` : `$${round2(numericValue).toFixed(2)}`,
      calculated: round2(calculatedValue),
    });
  };

  pushConfigured({
    key: "operational",
    label: "Gastos operativos",
    value: costs.operational ?? costs.gastosAdministrativos ?? costs.gastos_administrativos,
    mode: costs.operationalMode || costs.operational_mode || costs.gastosMode || "fixed",
    calculated: summaryTotals.operationalAmount,
  });
  pushConfigured({
    key: "fee",
    label: "Fee / comisión",
    value: costs.fee ?? costs.feeVal ?? costs.fee_val,
    mode: costs.feeMode || costs.fee_mode || "fixed",
    calculated: summaryTotals.feeAmount,
  });
  pushConfigured({
    key: "contingency",
    label: "Contingencia",
    value: costs.extraFee ?? costs.extra_fee,
    mode: costs.extraFeeMode || costs.extra_fee_mode || "fixed",
    calculated: summaryTotals.extraFeeAmount,
  });

  return rows;
};

const inferPricingAudience = (part = {}) => {
  const explicit = String(part?.audience || "").toLowerCase();
  if (explicit === "child" || explicit === "adult") return explicit;

  const hint = String(
    `${part?.className || ""} ${part?.label || ""} ${part?.key || ""}`,
  ).toLowerCase();
  return /child|niñ|nino/.test(hint) ? "child" : "adult";
};

const buildQuotationSummary = (
  commercialPricing = {},
  peopleCount = {},
  fallbackTotal = 0,
) => {
  const sourceParts = Array.isArray(commercialPricing?.parts)
    ? commercialPricing.parts
    : [];

  const parts = sourceParts.map((part, index) => {
    const beneficiaries = Math.max(
      1,
      numeric(part?.beneficiaries ?? part?.count ?? part?.pax) || 1,
    );
    const rawValue = round2(part?.value ?? part?.displayValue ?? 0);
    const displayValue = Math.max(
      0,
      numeric(part?.displayValue) || Math.ceil(rawValue),
    );
    const lineTotal = round2(
      numeric(part?.lineTotal) || displayValue * beneficiaries,
    );

    return {
      ...part,
      key: part?.key || `quoted-price-${index + 1}`,
      audience: inferPricingAudience(part),
      beneficiaries,
      value: rawValue,
      displayValue,
      lineTotal,
      servicesLineTotal: round2(numeric(part?.services) * beneficiaries),
      hotelLineTotal: round2(numeric(part?.hotel) * beneficiaries),
      additionalLineTotal: round2(numeric(part?.additional) * beneficiaries),
      externalLineTotal: round2(numeric(part?.external) * beneficiaries),
    };
  });

  const sumBy = (predicate, field = "lineTotal") =>
    round2(
      parts.reduce(
        (sum, part) => sum + (predicate(part) ? numeric(part?.[field]) : 0),
        0,
      ),
    );

  const adultCountFromParts = parts.reduce(
    (sum, part) =>
      sum + (part.audience === "adult" ? numeric(part.beneficiaries) : 0),
    0,
  );
  const childCountFromParts = parts.reduce(
    (sum, part) =>
      sum + (part.audience === "child" ? numeric(part.beneficiaries) : 0),
    0,
  );
  const adultCount = adultCountFromParts || numeric(peopleCount?.adults);
  const childCount = childCountFromParts || numeric(peopleCount?.children);
  const partsTotal = sumBy(() => true);
  const grandTotal = round2(
    numeric(commercialPricing?.roundedTotal) || partsTotal || fallbackTotal,
  );

  return {
    parts,
    adultCount,
    childCount,
    passengerCount: adultCount + childCount,
    adultTotal: sumBy((part) => part.audience === "adult"),
    childTotal: sumBy((part) => part.audience === "child"),
    servicesTotal: sumBy(() => true, "servicesLineTotal"),
    hotelTotal: sumBy(() => true, "hotelLineTotal"),
    additionalTotal: sumBy(() => true, "additionalLineTotal"),
    externalTotal: sumBy(() => true, "externalLineTotal"),
    grandTotal,
  };
};

export const buildReservationSummaryModel = ({
  cotizacion = {},
  quotedItinerary = [],
  externalQuotedItinerary = [],
  assignedItinerary = [],
  peopleDetails = {},
  reservationVoucher = {},
  fechaInicio = null,
} = {}) => {
  const normalizedPeople = normalizePeopleDetails(
    peopleDetails || cotizacion?.peopleDetails || cotizacion?.peopledetails || {},
  );
  const normalizedAssignedItinerary = normalizeArray(assignedItinerary);
  const normalizedQuotedItinerary = normalizeArray(
    normalizeArray(quotedItinerary).length > 0
      ? quotedItinerary
      : cotizacion?.itinerario,
  );
  const normalizedExternalQuotedItinerary = markReservationExternalItinerary(
    normalizeArray(
      normalizeArray(externalQuotedItinerary).length > 0
        ? externalQuotedItinerary
        : cotizacion?.itinerario_externo ||
            cotizacion?.itinerarioExterno ||
            cotizacion?.externalItinerary,
    ),
  );
  const mergedAssigned = mergeItineraryDaysByNumber(normalizedAssignedItinerary);
  const mergedQuotedBase = mergeItineraryDaysByNumber(normalizedQuotedItinerary);
  const mergedQuoted = mergeItineraryDaysByNumber([
    ...normalizedQuotedItinerary,
    ...normalizedExternalQuotedItinerary,
  ]).map((day) => ({
    ...day,
    servicios: dedupeReservationSummaryServices(day?.servicios || []),
  }));

  const quotedByDay = new Map(
    mergedQuoted.map((day, index) => [Number(day?.numero || index + 1), day]),
  );
  const assignedByDay = new Map(
    mergedAssigned.map((day, index) => [Number(day?.numero || index + 1), day]),
  );
  const dayNumbers = [...new Set([
    ...quotedByDay.keys(),
    ...assignedByDay.keys(),
  ])].sort((left, right) => left - right);

  let quotedTotal = 0;
  let assignedTotal = 0;
  const assignedTotalsByCurrency = {};
  let serviceCount = 0;
  let assignedCount = 0;

  const days = dayNumbers.map((dayNumber, dayIndex) => {
    const assignedDay = assignedByDay.get(dayNumber) || {};
    const quotedDay = quotedByDay.get(dayNumber) || {};
    const assignedServices = Array.isArray(assignedDay?.servicios)
      ? assignedDay.servicios
      : [];
    const quotedServices = Array.isArray(quotedDay?.servicios)
      ? quotedDay.servicios
      : [];
    const servicesSource = assignedServices.length > 0
      ? assignedServices
      : quotedServices;
    let dayQuotedTotal = 0;
    let dayAssignedTotal = 0;
    const dayAssignedTotalsByCurrency = {};

    const services = servicesSource.map(
      (service, serviceIndex) => {
        const quotedService =
          findReservationQuotedService({ service, quotedServices }) || service;
        // La columna comercial debe permanecer aislada de assigned_*. Una
        // asignación de Reservas puede reemplazar proveedor y habitación, pero
        // nunca debe contaminar parent_id/child_id de la cotización.
        const quotedCarrier = {
          ...quotedService,
          parentService: quotedService?.parentService || service?.parentService,
          childService: quotedService?.childService || service?.childService,
          tariff: quotedService?.tariff || service?.tariff,
          typeService: normalizeServiceType(quotedService || service),
          parent_id: quotedService?.parent_id ?? service?.parent_id ?? null,
          child_id: quotedService?.child_id ?? service?.child_id ?? null,
        };
        const assignedServiceData = buildAssignedServiceData(service);
        const quotedPricing = buildScopePricing(quotedCarrier, false);
        const assignedPricing = buildScopePricing(service, true);
        const isAssigned = Boolean(
          service?.isAssigned ||
            service?.is_assigned ||
            assignedServiceData,
        );

        serviceCount += 1;
        if (isAssigned) assignedCount += 1;
        quotedTotal += quotedPricing.total;
        if (isAssigned) {
          const currency = assignedPricing.currency;
          assignedTotalsByCurrency[currency] = round2((assignedTotalsByCurrency[currency] || 0) + assignedPricing.total);
          dayAssignedTotalsByCurrency[currency] = round2((dayAssignedTotalsByCurrency[currency] || 0) + assignedPricing.total);
        }
        assignedTotal += isAssigned && assignedPricing.currency === "USD" ? assignedPricing.total : 0;
        dayQuotedTotal += quotedPricing.total;
        dayAssignedTotal += isAssigned && assignedPricing.currency === "USD" ? assignedPricing.total : 0;

        const source = getReservationSummaryServiceSource(
          service,
          assignedDay,
        );

        return {
          key: `${dayNumber}-${source}-${getServiceId(service) || serviceIndex}`,
          dayIndex,
          serviceIndex,
          serviceId: getServiceId(service),
          codigo: Object.hasOwn(service,"codigo")?service.codigo:service.assignedService?.codigo,
          typeService: normalizeServiceType(service),
          source,
          isExternalItinerary: source === "external",
          sourceLabel:
            source === "external" ? "Extras sin fee" : "Itinerario principal",
          isAssigned,
          quotedServiceData: quotedCarrier,
          assignedServiceData,
          quotedPricing,
          assignedPricing,
          difference: isAssigned && quotedPricing.currency !== assignedPricing.currency ? null : round2(quotedPricing.total - (isAssigned ? assignedPricing.total : 0)),
          hora:
            service?.hora ||
            service?.assignedService?.hora ||
            service?.assigned_service?.hora ||
            "",
          payment: getPaymentStatus(service),
        };
      },
    );

    return {
      key: `day-${dayNumber}`,
      number: dayNumber,
      title: assignedDay?.titulo || quotedDay?.titulo || `Día ${dayNumber}`,
      description: assignedDay?.descripcion || quotedDay?.descripcion || "",
      cities: Array.isArray(assignedDay?.ciudades)
        ? assignedDay.ciudades
        : Array.isArray(quotedDay?.ciudades)
          ? quotedDay.ciudades
          : [],
      services,
      quotedTotal: round2(dayQuotedTotal),
      assignedTotal: dayAssignedTotalsByCurrency.PEN ? null : round2(dayAssignedTotal),
      assignedTotalsByCurrency: dayAssignedTotalsByCurrency,
      difference: dayAssignedTotalsByCurrency.PEN ? null : round2(dayQuotedTotal - dayAssignedTotal),
    };
  });

  const storedPeopleCount =
    cotizacion?.peopleCount || cotizacion?.peoplecount || {};
  const resolvedPeopleCount = {
    adults:
      normalizedPeople.adults.length ||
      numeric(
        storedPeopleCount?.adults ??
          cotizacion?.num_adults ??
          cotizacion?.numAdults,
      ),
    children:
      normalizedPeople.children.length ||
      numeric(
        storedPeopleCount?.children ??
          cotizacion?.num_children ??
          cotizacion?.numChildren,
      ),
  };
  const pricingSource = {
    ...(cotizacion || {}),
    // SummaryContent suma el itinerario externo por separado. Mantener el
    // itinerario principal aislado aquí evita contabilizar dos veces los
    // servicios externos que sí necesitamos fusionar para el registro operativo.
    itinerario: mergedQuotedBase,
    dias: mergedQuotedBase,
    itinerario_externo: normalizedExternalQuotedItinerary,
    itinerarioExterno: normalizedExternalQuotedItinerary,
    externalItinerary: normalizedExternalQuotedItinerary,
    peopleDetails: normalizedPeople,
    peopledetails: normalizedPeople,
    peopleCount: resolvedPeopleCount,
    peoplecount: resolvedPeopleCount,
    cantidadPersonas:
      resolvedPeopleCount.adults + resolvedPeopleCount.children,
  };
  const commercialPricing = buildSummaryContentPricingModel(pricingSource);
  const quotationSummary = buildQuotationSummary(
    commercialPricing,
    {
      adults: resolvedPeopleCount.adults,
      children: resolvedPeopleCount.children,
    },
    quotedTotal,
  );
  const additionalCosts =
    pricingSource.additionalCosts ||
    pricingSource.additionalcosts ||
    pricingSource.additional_costs ||
    {};

  return {
    voucher: reservationVoucher || {},
    cotizacion: pricingSource,
    fechaInicio,
    peopleDetails: normalizedPeople,
    peopleCount: {
      adults: resolvedPeopleCount.adults,
      children: resolvedPeopleCount.children,
      infants: normalizedPeople.infants.length,
      total:
        resolvedPeopleCount.adults +
        resolvedPeopleCount.children +
        normalizedPeople.infants.length,
    },
    days,
    commercialPricing,
    quotationSummary,
    hotelRows: normalizeHotelRows(commercialPricing, pricingSource),
    additionalCostRows: normalizeAdditionalCostRows(
      additionalCosts,
      commercialPricing,
    ),
    totals: {
      serviceCount,
      assignedCount,
      quotedTotal: round2(quotedTotal),
      assignedTotal: assignedTotalsByCurrency.PEN ? null : round2(assignedTotal),
      assignedTotalsByCurrency,
      margin: assignedTotalsByCurrency.PEN ? null : round2(quotedTotal - assignedTotal),
      commercialGrandTotal: quotationSummary.grandTotal,
    },
  };
};

export default buildReservationSummaryModel;
