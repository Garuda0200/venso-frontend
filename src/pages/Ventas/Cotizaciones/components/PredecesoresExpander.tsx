import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactDOM from "react-dom";
import {
  MdAdd,
  MdAttachMoney,
  MdCalendarToday,
  MdCheckCircle,
  MdChevronRight,
  MdChildCare,
  MdClose,
  MdCompareArrows,
  MdDelete,
  MdEdit,
  MdHistory,
  MdHotel,
  MdInfoOutline,
  MdPerson,
  MdPreview,
  MdRemove,
  MdRestore,
  MdRoute,
  MdSearch,
  MdSwapVert,
  MdTune,
} from "react-icons/md";
import cotizacionService from "../hooks/cotizacionService";
import "./styles/PredecesoresExpander.scss";

const PHASE_LABELS = {
  DRAFT: "Borrador",
  SALE_BASE: "Base de venta",
  POST_SALE: "Modificación de venta",
  RESTORE_POINT: "Punto de restauración",
  LEGACY_ARCHIVE: "Archivo anterior",
};

const GENERAL_FIELDS = [
  ["title", "Título"],
  ["startDate", "Fecha de inicio"],
  ["endDate", "Fecha de fin"],
  ["packageType", "Tipo de servicio"],
  ["adults", "Adultos"],
  ["children", "Niños"],
  ["total", "Total final"],
];

const HOTEL_FIELDS = [
  ["category", "Categoría de hotel"],
  ["nights", "Noches"],
  ["rooms", "Habitaciones"],
  ["roomSignature", "Detalle de habitaciones"],
  ["total", "Total de hotel"],
];

const ADDITIONAL_FIELDS = [
  ["operationalDisplay", "Gastos administrativos"],
  ["feeDisplay", "Fee / comisión"],
  ["extraFee", "Contingencia"],
  ["childOperationalDisplay", "Gastos administrativos · niños"],
  ["childFeeDisplay", "Fee / comisión · niños"],
  ["childExtraFee", "Contingencia · niños"],
  ["externalItineraryTotal", "Itinerario externo"],
  ["commissionableSubtotal", "Subtotal comisionable"],
  ["hasIgvLabel", "IGV"],
];

const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null);

const toNumber = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeText = (value) => String(value ?? "").trim();
const normalizeKeyText = (value) =>
  normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const normalizeMode = (value) => {
  const mode = normalizeText(value).toLowerCase();
  return ["percentage", "percent", "porcentaje", "%"].includes(mode)
    ? "Porcentaje"
    : "Monto fijo";
};

const normalizeAdditionalCosts = (source = {}) => {
  const data = source.additionalcosts || source.additionalCosts || source || {};
  const operationalMode = normalizeMode(
    firstDefined(data.operationalMode, data.operational_mode),
  );
  const operational = toNumber(
    firstDefined(data.operationalCosts, data.operational_costs),
  );
  const feeMode = normalizeMode(firstDefined(data.feeMode, data.fee_mode));
  const fee = toNumber(data.fee);
  const applyOperationalToChildren = Boolean(
    firstDefined(
      data.applyOperationalCostsToChildren,
      data.apply_operational_to_children,
      false,
    ),
  );
  const applyFeeToChildren = Boolean(
    firstDefined(data.applyFeeToChildren, data.apply_fee_to_children, false),
  );
  const hasChildOperationalConfig =
    data.childOperationalCosts != null ||
    data.child_operational_costs != null ||
    data.childOperationalMode != null ||
    data.child_operational_mode != null ||
    applyOperationalToChildren;
  const hasChildFeeConfig =
    data.childFee != null ||
    data.child_fee != null ||
    data.childFeeMode != null ||
    data.child_fee_mode != null ||
    applyFeeToChildren;
  const childOperationalMode = normalizeMode(
    firstDefined(
      data.childOperationalMode,
      data.child_operational_mode,
      data.operationalMode,
      data.operational_mode,
    ),
  );
  const childOperational = toNumber(
    firstDefined(
      data.childOperationalCosts,
      data.child_operational_costs,
      data.operationalCosts,
      data.operational_costs,
    ),
  );
  const childFeeMode = normalizeMode(
    firstDefined(data.childFeeMode, data.child_fee_mode, data.feeMode, data.fee_mode),
  );
  const childFee = toNumber(firstDefined(data.childFee, data.child_fee, data.fee));
  const formatConfiguredValue = (value, mode) =>
    mode === "Porcentaje" ? `${toNumber(value)}%` : toNumber(value);

  return {
    operationalMode,
    operational,
    operationalDisplay: formatConfiguredValue(operational, operationalMode),
    feeMode,
    fee,
    feeDisplay: formatConfiguredValue(fee, feeMode),
    extraFee: toNumber(firstDefined(data.extraFee, data.extra_fee)),
    childOperationalMode,
    childOperational,
    childOperationalDisplay: hasChildOperationalConfig
      ? formatConfiguredValue(childOperational, childOperationalMode)
      : "No aplica",
    childFeeMode,
    childFee,
    childFeeDisplay: hasChildFeeConfig
      ? formatConfiguredValue(childFee, childFeeMode)
      : "No aplica",
    childExtraFee: toNumber(
      firstDefined(data.childExtraFee, data.child_extra_fee),
    ),
    externalItineraryTotal: toNumber(
      firstDefined(data.externalItineraryTotal, data.external_itinerary_total),
    ),
    commissionableSubtotal: toNumber(
      firstDefined(data.commissionableSubtotal, data.commissionable_subtotal),
    ),
    hasIgv: Boolean(firstDefined(data.hasIgv, data.has_igv, false)),
    hasIgvLabel: Boolean(firstDefined(data.hasIgv, data.has_igv, false))
      ? "Incluido"
      : "No incluido",
  };
};

const normalizeHotelSummary = (source = {}) => {
  const selected = firstDefined(
    source.selectedHotel,
    source.selected_hotel,
    source.hotelConfig,
    source.hotel_config,
    {},
  );
  const detail = firstDefined(source.hotelDetalle, source.hotel_detalle, {});
  const category = normalizeText(
    firstDefined(
      selected.categoryLabel,
      selected.category_name,
      selected.category,
      selected.categoria,
      selected.selectedCategory,
      detail.categoryLabel,
      detail.category,
      detail.selectedCategory,
      "",
    ),
  );
  const nights = toNumber(
    firstDefined(
      selected.nights,
      selected.nightCount,
      selected.selectedNights,
      Array.isArray(selected.selectedNightIndices)
        ? selected.selectedNightIndices.length
        : undefined,
      source.noches,
      0,
    ),
  );
  const rooms = firstDefined(
    selected.perRoomPricing,
    selected.per_room_pricing,
    selected.roomAssignments,
    selected.room_assignments,
    selected.roomOptions,
    selected.rooms,
    detail.perRoomPricing,
    detail.per_room_pricing,
    detail.roomAssignments,
    detail.rooms,
    [],
  );
  const roomList = Array.isArray(rooms) ? rooms : [];
  const roomDetails = roomList
    .map((room, index) => {
      const label = normalizeText(
        firstDefined(
          room.label,
          room.roomType,
          room.room_type,
          room.tipo_habitacion,
          room.name,
          room.key,
          `Habitación ${index + 1}`,
        ),
      );
      const quantity = Math.max(
        1,
        toNumber(
          firstDefined(
            room.quantity,
            room.qty,
            room.count,
            room.cantidad,
            room.rooms,
            room.roomCount,
            1,
          ),
        ),
      );
      const unitPrice = toNumber(
        firstDefined(
          room.unitPrice,
          room.unit_price,
          room.price,
          room.precio,
          room.adultPrice,
          room.precioAdulto,
          0,
        ),
      );
      const total = toNumber(
        firstDefined(
          room.total,
          room.totalPrice,
          room.total_price,
          room.subtotal,
          unitPrice * quantity * Math.max(nights, 1),
        ),
      );
      return {
        key: normalizeKeyText(`${label}-${index}`),
        label,
        quantity,
        unitPrice,
        total,
      };
    })
    .filter((room) => room.label);
  const roomLabel = roomDetails
    .map((room) => `${room.quantity > 1 ? `${room.quantity}× ` : ""}${room.label}`)
    .join(", ");
  const total = toNumber(
    firstDefined(
      selected.hotelsTotal,
      selected.hotelTotal,
      selected.total,
      detail.hotelsTotal,
      detail.hotelTotal,
      source.hotelsTotal,
      source.hotelAdultTotal,
      0,
    ),
  );
  const hasHotel = Boolean(
    category || roomDetails.length > 0 || nights > 0 || Math.abs(total) > 0.005,
  );
  return {
    hasHotel,
    category: category || "Sin hotel",
    nights,
    rooms: roomLabel || (hasHotel ? "Configuración guardada" : "Sin hotel"),
    roomDetails,
    roomSignature: roomDetails
      .map((room) => `${room.label}:${room.quantity}:${room.unitPrice}:${room.total}`)
      .join("|"),
    total,
  };
};

const getServiceName = (service = {}) => {
  const parent = service.parentService || service.parent_service || {};
  const child = service.childService || service.child_service || {};
  const parentName = firstDefined(
    parent.nombre_hotel,
    parent.nombre_transporte,
    parent.aerolinea,
    parent.nombre,
    parent.nombre_empresa,
    parent.nombre_agencia,
    parent.persona
      ? `${parent.persona.nombres || ""} ${parent.persona.apellidos || ""}`.trim()
      : undefined,
    child.restaurante?.nombre,
    child.ticket?.entrada,
    child.servicio_extra?.nombre,
    service.parentName,
  );
  const childName = firstDefined(
    child.tipo_habitacion,
    child.tipo_auto,
    child.tipo_tren,
    child.tipo_vuelo?.tipovuelo,
    child.ruta?.tour_nombre,
    child.nombre,
    parent.tipo_tour,
    service.childName,
  );
  const explicitName = firstDefined(
    service.nombre,
    service.name,
    service.titulo,
    service.descripcion,
  );
  if (parentName && childName) return `${parentName} · ${childName}`;
  if (parentName || childName || explicitName) {
    return normalizeText(parentName || childName || explicitName);
  }
  const type = firstDefined(
    service.typeService,
    service.tipoServicio,
    service.tipo_servicio,
    service.type,
    "Servicio",
  );
  const parentId = firstDefined(service.parentId, service.parent_id);
  const childId = firstDefined(service.childId, service.child_id);
  const ids = [parentId, childId].filter((value) => value != null).join("/");
  return ids ? `${type} · ${ids}` : normalizeText(type);
};

const normalizeService = (service = {}, index = 0, dayKey = "day", scope = "main") => {
  const type = normalizeText(
    firstDefined(
      service.typeService,
      service.tipoServicio,
      service.tipo_servicio,
      service.type,
      "servicio",
    ),
  );
  const parentId = firstDefined(service.parentId, service.parent_id, null);
  const childId = firstDefined(service.childId, service.child_id, null);
  const stableId = firstDefined(
    service.id,
    service.live_servicio_id,
    service.versionUid,
    service.version_uid,
  );
  const fallback = [
    dayKey,
    normalizeKeyText(type),
    parentId ?? "none",
    childId ?? "none",
    firstDefined(service.orden, index + 1),
  ].join("::");
  const legacyTariff = service.tariff || {};
  const legacySelection =
    service.passengerSelection || service.passenger_selection || {};
  const selectedPassengerIds = Array.isArray(legacySelection.selectedIds)
    ? legacySelection.selectedIds
    : [];
  const legacyAdultRows = selectedPassengerIds
    .filter((id) => normalizeText(id).toLowerCase().startsWith("adult"))
    .map((id) => ({ id }));
  const legacyConvertedChildRows = selectedPassengerIds
    .filter((id) => normalizeText(id).toLowerCase().startsWith("child"))
    .map((id) => ({ id, child_origin: true }));
  const adultRows = firstDefined(
    service.beneficiariosAdultos,
    service.beneficiarios_adultos,
    legacyAdultRows.length || legacyConvertedChildRows.length
      ? [...legacyAdultRows, ...legacyConvertedChildRows]
      : [],
  );
  const childRows = firstDefined(
    service.beneficiariosNinos,
    service.beneficiarios_ninos,
    [],
  );
  const adultBeneficiaries = Array.isArray(adultRows) ? adultRows : [];
  const childBeneficiaries = Array.isArray(childRows) ? childRows : [];
  const convertedChildren = adultBeneficiaries.filter((beneficiary) => {
    const id = normalizeText(beneficiary?.id).toLowerCase();
    return Boolean(
      beneficiary?.child_origin ||
        beneficiary?.childOrigin ||
        id.startsWith("child"),
    );
  });
  const pricing = firstDefined(
    service.pricingBreakdown,
    service.pricing_breakdown,
    {},
  );
  const divided = Boolean(
    firstDefined(
      service.precioAdultoDividido,
      service.precio_adulto_dividido,
      false,
    ),
  );
  const price = toNumber(
    firstDefined(
      service.precioServicio,
      service.precio_servicio,
      legacyTariff.precio,
      legacyTariff.precio_original,
    ),
  );
  const rawAdultUnit = divided && adultBeneficiaries.length > 0
    ? price / adultBeneficiaries.length
    : price;
  const explicitChildTotal = childBeneficiaries.reduce(
    (sum, beneficiary) =>
      sum + toNumber(firstDefined(beneficiary?.precio, beneficiary?.price, 0)),
    0,
  );
  const fallbackAdultCount = Math.max(
    0,
    adultBeneficiaries.length - convertedChildren.length,
  );
  const fallbackChildCount = convertedChildren.length + childBeneficiaries.length;
  const fallbackChildTotal =
    rawAdultUnit * convertedChildren.length + explicitChildTotal;

  return {
    key: stableId != null ? `service:${stableId}` : fallback,
    id: stableId,
    type,
    name: getServiceName(service),
    parentId,
    childId,
    order: toNumber(firstDefined(service.orden, index + 1)),
    currency: normalizeText(
      firstDefined(service.moneda, legacyTariff.moneda, "USD"),
    ),
    price,
    total: toNumber(
      firstDefined(
        service.precioTotal,
        service.precio_total,
        legacyTariff.precio_original_with_child_extras,
        legacyTariff.precio_original,
        legacyTariff.precio,
      ),
    ),
    adultBeneficiaries: adultBeneficiaries.length,
    childBeneficiaries: childBeneficiaries.length,
    pricingMode: normalizeText(
      firstDefined(
        pricing.mode,
        legacySelection.pricingMode,
        divided ? "shared" : "per_person",
      ),
    ),
    adultCount: toNumber(firstDefined(pricing.adultCount, fallbackAdultCount)),
    adultUnitPrice: toNumber(
      firstDefined(pricing.adultUnitPrice, rawAdultUnit),
    ),
    adultTotal: toNumber(
      firstDefined(pricing.adultTotal, rawAdultUnit * fallbackAdultCount),
    ),
    convertedChildCount: toNumber(
      firstDefined(pricing.convertedChildCount, convertedChildren.length),
    ),
    explicitChildCount: toNumber(
      firstDefined(pricing.explicitChildCount, childBeneficiaries.length),
    ),
    childCount: toNumber(firstDefined(pricing.childCount, fallbackChildCount)),
    childUnitPrice: toNumber(
      firstDefined(
        pricing.childUnitPrice,
        fallbackChildCount > 0 ? fallbackChildTotal / fallbackChildCount : 0,
      ),
    ),
    childTotal: toNumber(
      firstDefined(pricing.childTotal, fallbackChildTotal),
    ),
    storedTotal: toNumber(
      firstDefined(
        pricing.storedTotal,
        service.precioTotal,
        service.precio_total,
        legacyTariff.precio_original_with_child_extras,
        legacyTariff.precio_original,
        legacyTariff.precio,
      ),
    ),
    scope,
    isExternal: scope === "external",
    legacyPdfSummary: Boolean(service.legacy_pdf_summary),
    legacyTariff: Object.keys(legacyTariff).length > 0,
    description: normalizeText(service.descripcion),
    raw: service,
  };
};

const normalizeDay = (day = {}, index = 0, scope = "main") => {
  const number = toNumber(firstDefined(day.numero, day.orden, index + 1));
  const stableId = firstDefined(
    day.id,
    day.live_dia_id,
    day.versionUid,
    day.version_uid,
  );
  const fallback = `${scope}:${normalizeKeyText(day.titulo || day.title)}:${number}`;
  const key = stableId != null ? `day:${stableId}` : fallback;
  const services = Array.isArray(day.servicios)
    ? day.servicios.map((service, serviceIndex) =>
        normalizeService(service, serviceIndex, key, scope),
      )
    : [];

  return {
    key,
    id: stableId,
    scope,
    number,
    order: toNumber(firstDefined(day.orden, number)),
    title: normalizeText(firstDefined(day.titulo, day.title, `Día ${number}`)),
    description: normalizeText(firstDefined(day.descripcion, day.description)),
    cities: Array.isArray(day.ciudades)
      ? day.ciudades.map(normalizeText).filter(Boolean)
      : [],
    services,
    raw: day,
  };
};

const mergeSnapshotDays = (mainDays = [], externalDays = []) => {
  const merged = new Map();

  mainDays.forEach((day) => {
    merged.set(day.number, {
      ...day,
      externalOnly: false,
      services: [...day.services],
    });
  });

  externalDays.forEach((externalDay) => {
    const current = merged.get(externalDay.number);
    if (current) {
      merged.set(externalDay.number, {
        ...current,
        services: [...current.services, ...externalDay.services],
      });
      return;
    }

    merged.set(externalDay.number, {
      ...externalDay,
      key: `external-day:${externalDay.id ?? externalDay.number}`,
      title: externalDay.title || `Servicios externos · Día ${externalDay.number}`,
      externalOnly: true,
    });
  });

  return Array.from(merged.values()).sort(
    (left, right) => left.number - right.number || left.order - right.order,
  );
};

const isVisibleVersionRow = (row = {}) =>
  normalizeText(
    firstDefined(row.versionStatus, row.version_status, row.row_status, "ACTIVE"),
  ).toUpperCase() !== "REMOVED";

const getServiceMergeKeys = (service = {}, index = 0) => {
  const id = firstDefined(
    service.id,
    service.live_servicio_id,
    service.liveServicioId,
  );
  const uid = firstDefined(service.versionUid, service.version_uid);
  const type = normalizeKeyText(
    firstDefined(
      service.typeService,
      service.tipoServicio,
      service.tipo_servicio,
      service.type,
      "servicio",
    ),
  );
  const parentId = firstDefined(service.parentId, service.parent_id, "none");
  const childId = firstDefined(service.childId, service.child_id, "none");
  const order = toNumber(firstDefined(service.orden, service.order, index + 1));
  return [
    id != null ? `id:${id}` : null,
    uid ? `uid:${uid}` : null,
    `catalog:${type}:${parentId}:${childId}:${order}`,
    `position:${type}:${order}`,
  ].filter(Boolean);
};

const mergeEnrichedDayServices = (rawServices = [], enrichedServices = []) => {
  const raw = Array.isArray(rawServices) ? rawServices : [];
  const enriched = Array.isArray(enrichedServices) ? enrichedServices : [];
  if (enriched.length === 0) return raw;
  if (raw.length === 0) return enriched;

  const enrichedEntries = enriched.map((service, index) => ({
    service,
    index,
    keys: getServiceMergeKeys(service, index),
    used: false,
  }));
  const lookup = new Map();
  enrichedEntries.forEach((entry) => {
    entry.keys.forEach((key) => {
      if (!lookup.has(key)) lookup.set(key, []);
      lookup.get(key).push(entry);
    });
  });

  const merged = raw.map((service, index) => {
    const match = getServiceMergeKeys(service, index)
      .flatMap((key) => lookup.get(key) || [])
      .find((entry) => !entry.used);
    if (!match) return service;
    match.used = true;
    return {
      ...service,
      ...match.service,
      id: firstDefined(match.service.id, service.id),
      versionUid: firstDefined(
        match.service.versionUid,
        match.service.version_uid,
        service.versionUid,
        service.version_uid,
      ),
      parentService: firstDefined(
        match.service.parentService,
        match.service.parent_service,
        service.parentService,
        service.parent_service,
      ),
      childService: firstDefined(
        match.service.childService,
        match.service.child_service,
        service.childService,
        service.child_service,
      ),
      pricingBreakdown: firstDefined(
        match.service.pricingBreakdown,
        match.service.pricing_breakdown,
        service.pricingBreakdown,
        service.pricing_breakdown,
      ),
    };
  });

  enrichedEntries.forEach((entry) => {
    if (!entry.used) merged.push(entry.service);
  });
  return merged;
};

const resolveVersionSnapshotData = (source = {}) => {
  const snapshot =
    source?.snapshot && typeof source.snapshot === "object"
      ? source.snapshot
      : source || {};
  const rawDays = Array.isArray(source?.days)
    ? source.days.filter(isVisibleVersionRow)
    : [];
  const enrichedServices = firstDefined(
    source?.enriched_services,
    source?.enrichedServices,
    source?.services,
    [],
  );
  const activeServices = Array.isArray(enrichedServices)
    ? enrichedServices.filter(isVisibleVersionRow)
    : [];

  if (rawDays.length === 0 || activeServices.length === 0) return snapshot;

  const servicesByVersionDay = new Map();
  activeServices.forEach((service) => {
    const versionDayId = firstDefined(
      service.versionDayId,
      service.version_day_id,
      service.version_dia_id,
    );
    if (versionDayId == null) return;
    const key = String(versionDayId);
    if (!servicesByVersionDay.has(key)) servicesByVersionDay.set(key, []);
    servicesByVersionDay.get(key).push(service);
  });

  const rawDayByLiveId = new Map();
  const rawDayByScopeAndNumber = new Map();
  rawDays.forEach((day) => {
    const liveId = firstDefined(
      day.live_dia_id,
      day.liveDiaId,
      day.versionUid,
      day.version_uid,
    );
    if (liveId != null) rawDayByLiveId.set(String(liveId), day);
    const scope = normalizeText(firstDefined(day.ref_tipo, day.refTipo, "cotizacion"));
    const number = toNumber(firstDefined(day.numero, day.orden));
    rawDayByScopeAndNumber.set(`${scope}:${number}`, day);
  });

  const servicesForRawDay = (rawDay) =>
    servicesByVersionDay.get(String(rawDay?.id ?? "")) || [];

  const hydrateSnapshotDays = (days, refType) => {
    const sourceDays = Array.isArray(days) ? days : [];
    if (sourceDays.length > 0) {
      return sourceDays.map((day) => {
        const liveId = firstDefined(
          day?.id,
          day?.live_dia_id,
          day?.liveDiaId,
          day?.versionUid,
          day?.version_uid,
        );
        const number = toNumber(firstDefined(day?.numero, day?.orden));
        const rawDay =
          (liveId != null ? rawDayByLiveId.get(String(liveId)) : null) ||
          rawDayByScopeAndNumber.get(`${refType}:${number}`);
        const fallbackServices = servicesForRawDay(rawDay);
        const mergedServices = mergeEnrichedDayServices(
          day?.servicios,
          fallbackServices,
        );
        return {
          ...day,
          servicios: mergedServices,
        };
      });
    }

    return rawDays
      .filter(
        (day) =>
          normalizeText(firstDefined(day.ref_tipo, day.refTipo)) === refType,
      )
      .map((day) => ({
        ...day,
        id: firstDefined(
          day.live_dia_id,
          day.liveDiaId,
          day.versionUid,
          day.version_uid,
          day.id,
        ),
        servicios: mergeEnrichedDayServices([], servicesForRawDay(day)),
      }));
  };

  return {
    ...snapshot,
    itinerario: hydrateSnapshotDays(snapshot.itinerario, "cotizacion"),
    itinerario_externo: hydrateSnapshotDays(
      firstDefined(snapshot.itinerario_externo, snapshot.itinerarioExterno, []),
      "cotizacion_externa",
    ),
  };
};

const normalizeLegacyInfoPdfDays = (infoPdf = []) =>
  (Array.isArray(infoPdf) ? infoPdf : []).map((day, index) => ({
    id: `legacy-pdf-day-${firstDefined(day.dia, index + 1)}`,
    numero: toNumber(firstDefined(day.dia, index + 1)),
    orden: toNumber(firstDefined(day.dia, index + 1)),
    titulo: firstDefined(day.titulo, `Día ${index + 1}`),
    descripcion: firstDefined(day.descripcion, ""),
    ciudades: [firstDefined(day.ciudad, "")].filter(Boolean),
    servicios: (Array.isArray(day.servicios_resumen)
      ? day.servicios_resumen
      : []
    ).map((service, serviceIndex) => ({
      id: `legacy-pdf-service-${index + 1}-${serviceIndex + 1}`,
      tipo_servicio: firstDefined(service.tipo, "servicio"),
      nombre: firstDefined(service.nombre, service.detalle, "Servicio histórico"),
      descripcion: firstDefined(service.detalle, ""),
      orden: serviceIndex + 1,
      moneda: "USD",
      precio_servicio: 0,
      precio_total: 0,
      legacy_pdf_summary: true,
    })),
  }));

const normalizeSnapshot = (source = {}) => {
  const data = resolveVersionSnapshotData(source);
  const peopleCount =
    data.peopleCount || data.peoplecount || data.people_count || {};
  const peopleDetails =
    data.peopleDetails || data.peopledetails || data.people_details || {};
  const explicitChildren = firstDefined(
    data.child_count,
    data.childCount,
    data.num_children,
    data.numChildren,
    peopleCount.children,
    Array.isArray(peopleDetails.children)
      ? peopleDetails.children.length
      : undefined,
  );
  const children = toNumber(firstDefined(explicitChildren, 0));
  const totalPassengers = toNumber(
    firstDefined(data.cantidadpersonas, data.cantidadPersonas, 0),
  );
  const explicitAdults = firstDefined(
    data.adult_count,
    data.adultCount,
    data.num_adults,
    data.numAdults,
    peopleCount.adults,
    Array.isArray(peopleDetails.adults)
      ? peopleDetails.adults.length
      : undefined,
  );
  const explicitCompositionIsEmpty =
    totalPassengers > 0 &&
    toNumber(firstDefined(explicitAdults, 0)) + children === 0;
  const adults = toNumber(
    firstDefined(
      explicitCompositionIsEmpty ? undefined : explicitAdults,
      totalPassengers > 0
        ? Math.max(0, totalPassengers - children)
        : 0,
    ),
  );
  const mainDaySource = Array.isArray(data.itinerario)
    ? data.itinerario
    : normalizeLegacyInfoPdfDays(data.info_pdf);
  const mainDays = mainDaySource.map((day, index) =>
    normalizeDay(day, index, "main"),
  );
  const externalSource = firstDefined(
    data.itinerario_externo,
    data.itinerarioExterno,
    [],
  );
  const externalDays = Array.isArray(externalSource)
    ? externalSource.map((day, index) => normalizeDay(day, index, "external"))
    : [];

  return {
    raw: data,
    title: normalizeText(firstDefined(data.titulo, data.title, "Sin título")),
    startDate: firstDefined(data.fechainicio, data.startDate, data.start_date, ""),
    endDate: firstDefined(data.fechafin, data.endDate, data.end_date, ""),
    packageType: normalizeText(
      firstDefined(data.packagetype, data.packageType, "compartido"),
    ),
    adults,
    children,
    total: toNumber(
      firstDefined(data.total_final, data.grandTotal, data.finalTotal, 0),
    ),
    additional: normalizeAdditionalCosts(data),
    hotel: normalizeHotelSummary(data),
    // SummaryContent presenta el itinerario externo dentro del día comercial
    // correspondiente. El versionado replica esa misma lectura para evitar
    // días "Sin título" y falsos reordenamientos por almacenar ambos ámbitos
    // en filas relacionales distintas.
    days: mergeSnapshotDays(mainDays, externalDays),
  };
};

const buildSnapshotFingerprint = (source = {}) => {
  if (!source) return "";
  const snapshot = normalizeSnapshot(source);
  return JSON.stringify({
    title: snapshot.title,
    startDate: snapshot.startDate,
    endDate: snapshot.endDate,
    packageType: snapshot.packageType,
    adults: snapshot.adults,
    children: snapshot.children,
    total: snapshot.total,
    additional: snapshot.additional,
    hotel: snapshot.hotel,
    days: snapshot.days.map((day) => ({
      id: day.id,
      scope: day.scope,
      number: day.number,
      order: day.order,
      title: day.title,
      description: day.description,
      cities: day.cities,
      services: day.services.map((service) => ({
        id: service.id,
        type: service.type,
        parentId: service.parentId,
        childId: service.childId,
        order: service.order,
        currency: service.currency,
        price: service.price,
        total: service.total,
        adultCount: service.adultCount,
        childCount: service.childCount,
        convertedChildCount: service.convertedChildCount,
        isExternal: service.isExternal,
      })),
    })),
  });
};

const sameValue = (left, right) => {
  if (typeof left === "number" || typeof right === "number") {
    return Math.abs(toNumber(left) - toNumber(right)) < 0.005;
  }
  return JSON.stringify(left ?? "") === JSON.stringify(right ?? "");
};

const diffFields = (before, after, fields) =>
  fields
    .map(([key, label]) => ({
      key,
      label,
      before: before?.[key],
      after: after?.[key],
      changed: !sameValue(before?.[key], after?.[key]),
    }))
    .filter((item) => item.changed);

const SERVICE_DIFF_FIELDS = [
  ["type", "Tipo"],
  ["parentId", "Proveedor / padre"],
  ["childId", "Opción / hijo"],
  ["order", "Posición"],
  ["currency", "Moneda"],
  ["pricingMode", "Modalidad de precio"],
  ["price", "Precio unitario"],
  ["total", "Precio total"],
  ["adultCount", "Adultos beneficiarios"],
  ["childCount", "Niños beneficiarios"],
  ["convertedChildCount", "Niños con tarifa adulto"],
];

const servicePairScore = (before, after) => {
  if (!before || !after) return -1;
  if (before.scope !== after.scope) return -1;
  if (normalizeKeyText(before.type) !== normalizeKeyText(after.type)) return -1;

  let score = 5;
  const orderDistance = Math.abs(toNumber(before.order) - toNumber(after.order));
  if (orderDistance === 0) score += 4;
  else if (orderDistance === 1) score += 2;

  if (before.parentId != null && before.parentId === after.parentId) score += 5;
  if (before.childId != null && before.childId === after.childId) score += 5;
  if (before.currency === after.currency) score += 1;
  if (sameValue(before.price, after.price)) score += 2;
  if (sameValue(before.storedTotal, after.storedTotal)) score += 3;
  if (
    before.adultCount === after.adultCount &&
    before.childCount === after.childCount
  ) score += 2;
  if (before.pricingMode === after.pricingMode) score += 1;
  if (normalizeKeyText(before.name) === normalizeKeyText(after.name)) score += 1;
  return score;
};

const classifyServiceMutation = (before, after) => {
  const identityChanged =
    normalizeKeyText(before?.type) !== normalizeKeyText(after?.type) ||
    before?.parentId !== after?.parentId ||
    before?.childId !== after?.childId;
  return identityChanged ? "replaced" : "modified";
};

const compareServices = (beforeServices = [], afterServices = []) => {
  const beforeMap = new Map(beforeServices.map((service) => [service.key, service]));
  const afterMap = new Map(afterServices.map((service) => [service.key, service]));
  const changes = [];
  const matchedBefore = new Set();
  const matchedAfter = new Set();

  afterMap.forEach((service, key) => {
    const previous = beforeMap.get(key);
    if (!previous) return;
    matchedBefore.add(key);
    matchedAfter.add(key);
    const fields = diffFields(previous, service, SERVICE_DIFF_FIELDS);
    if (fields.length > 0) {
      changes.push({
        type: classifyServiceMutation(previous, service),
        service,
        previous,
        fields,
      });
    }
  });

  const unmatchedBefore = beforeServices.filter(
    (service) => !matchedBefore.has(service.key),
  );
  const unmatchedAfter = afterServices.filter(
    (service) => !matchedAfter.has(service.key),
  );
  const candidates = [];

  unmatchedBefore.forEach((previous, beforeIndex) => {
    unmatchedAfter.forEach((service, afterIndex) => {
      const score = servicePairScore(previous, service);
      if (score >= 8) {
        candidates.push({ previous, service, beforeIndex, afterIndex, score });
      }
    });
  });

  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      Math.abs(left.previous.order - left.service.order) -
        Math.abs(right.previous.order - right.service.order),
  );

  const pairedBefore = new Set();
  const pairedAfter = new Set();
  candidates.forEach(({ previous, service, beforeIndex, afterIndex }) => {
    if (pairedBefore.has(beforeIndex) || pairedAfter.has(afterIndex)) return;
    pairedBefore.add(beforeIndex);
    pairedAfter.add(afterIndex);
    const fields = diffFields(previous, service, SERVICE_DIFF_FIELDS);
    // Si el backend conservó el contenido comercial pero cambió el ID físico,
    // no se presenta una baja/alta artificial. Solo se registra una fila cuando
    // existe un reemplazo o una modificación comercial real.
    if (fields.length === 0) return;
    changes.push({
      type: classifyServiceMutation(previous, service),
      service,
      previous,
      fields,
    });
  });

  unmatchedAfter.forEach((service, index) => {
    if (!pairedAfter.has(index)) {
      changes.push({ type: "added", service, previous: null, fields: [] });
    }
  });
  unmatchedBefore.forEach((previous, index) => {
    if (!pairedBefore.has(index)) {
      changes.push({ type: "removed", service: null, previous, fields: [] });
    }
  });

  return changes.sort((left, right) => {
    const leftService = left.service || left.previous;
    const rightService = right.service || right.previous;
    return toNumber(leftService?.order) - toNumber(rightService?.order);
  });
};

const dayPairScore = (before, after) => {
  if (!before || !after) return -1;
  let score = before.scope === after.scope ? 4 : 0;
  if (normalizeKeyText(before.title) === normalizeKeyText(after.title)) score += 8;
  const beforeTypes = new Set(before.services.map((service) => normalizeKeyText(service.type)));
  const afterTypes = new Set(after.services.map((service) => normalizeKeyText(service.type)));
  const overlap = [...beforeTypes].filter((type) => afterTypes.has(type)).length;
  score += Math.min(overlap, 4);
  if (before.services.length === after.services.length) score += 1;
  if (before.id != null && before.id === after.id) score += 12;
  return score;
};

const buildDayMutation = (previous, day) => {
  let fields = diffFields(previous, day, [
    ["number", "Número de día"],
    ["order", "Orden"],
    ["title", "Título"],
    ["description", "Descripción"],
    ["cities", "Ciudades"],
  ]);
  const numberChange = fields.find((field) => field.key === "number");
  const orderChange = fields.find((field) => field.key === "order");
  if (
    numberChange &&
    orderChange &&
    sameValue(numberChange.before, orderChange.before) &&
    sameValue(numberChange.after, orderChange.after)
  ) {
    fields = fields
      .filter((field) => field.key !== "order")
      .map((field) =>
        field.key === "number"
          ? { ...field, label: "Posición del día" }
          : field,
      );
  }
  const services = compareServices(previous.services, day.services);
  const onlyPosition =
    fields.length > 0 &&
    fields.every((field) => ["number", "order"].includes(field.key)) &&
    services.length === 0;
  return {
    type: onlyPosition ? "moved" : "modified",
    day,
    previous,
    fields,
    services,
  };
};

const compareSnapshots = (beforeSource, afterSource) => {
  const before = normalizeSnapshot(beforeSource);
  const after = normalizeSnapshot(afterSource);
  const general = diffFields(before, after, GENERAL_FIELDS);
  const hotel = diffFields(before.hotel, after.hotel, HOTEL_FIELDS);
  const additional = diffFields(before.additional, after.additional, ADDITIONAL_FIELDS);
  const beforeMap = new Map(before.days.map((day) => [day.key, day]));
  const afterMap = new Map(after.days.map((day) => [day.key, day]));
  const matchedBefore = new Set();
  const matchedAfter = new Set();
  const days = [];

  afterMap.forEach((day, key) => {
    const previous = beforeMap.get(key);
    if (!previous) return;
    matchedBefore.add(key);
    matchedAfter.add(key);
    const mutation = buildDayMutation(previous, day);
    if (mutation.fields.length > 0 || mutation.services.length > 0) days.push(mutation);
  });

  const unmatchedBefore = before.days.filter((day) => !matchedBefore.has(day.key));
  const unmatchedAfter = after.days.filter((day) => !matchedAfter.has(day.key));
  const dayCandidates = [];
  unmatchedBefore.forEach((previous, beforeIndex) => {
    unmatchedAfter.forEach((day, afterIndex) => {
      const score = dayPairScore(previous, day);
      if (score >= 8) dayCandidates.push({ previous, day, beforeIndex, afterIndex, score });
    });
  });
  dayCandidates.sort((left, right) => right.score - left.score);
  const pairedBefore = new Set();
  const pairedAfter = new Set();
  dayCandidates.forEach(({ previous, day, beforeIndex, afterIndex }) => {
    if (pairedBefore.has(beforeIndex) || pairedAfter.has(afterIndex)) return;
    pairedBefore.add(beforeIndex);
    pairedAfter.add(afterIndex);
    const mutation = buildDayMutation(previous, day);
    if (mutation.fields.length > 0 || mutation.services.length > 0) days.push(mutation);
  });

  unmatchedAfter.forEach((day, index) => {
    if (pairedAfter.has(index)) return;
    days.push({
      type: "added",
      day,
      previous: null,
      fields: [],
      services: day.services.map((service) => ({
        type: "added",
        service,
        previous: null,
        fields: [],
      })),
    });
  });
  unmatchedBefore.forEach((day, index) => {
    if (pairedBefore.has(index)) return;
    days.push({
      type: "removed",
      day: null,
      previous: day,
      fields: [],
      services: day.services.map((service) => ({
        type: "removed",
        service: null,
        previous: service,
        fields: [],
      })),
    });
  });

  days.sort((left, right) => {
    const leftDay = left.day || left.previous;
    const rightDay = right.day || right.previous;
    return toNumber(leftDay?.number) - toNumber(rightDay?.number);
  });

  const serviceMutations = days.flatMap((day) => day.services);
  const addedServices = serviceMutations.filter((change) => change.type === "added").length;
  const removedServices = serviceMutations.filter((change) => change.type === "removed").length;
  const replacedServices = serviceMutations.filter((change) => change.type === "replaced").length;
  const movedServices = serviceMutations.filter((change) =>
    change.fields?.some((field) => field.key === "order"),
  ).length;
  const priceChanges = serviceMutations.filter((change) =>
    change.fields?.some((field) => ["price", "total", "currency", "pricingMode"].includes(field.key)),
  ).length;
  const externalChanges = serviceMutations.filter((change) =>
    Boolean((change.service || change.previous)?.isExternal),
  ).length;
  const dayMoves = days.filter(
    (change) =>
      change.type === "moved" ||
      change.fields?.some((field) => ["number", "order"].includes(field.key)),
  ).length;
  const serviceChanges = serviceMutations.length;
  return {
    before,
    after,
    general,
    hotel,
    additional,
    days,
    stats: {
      general: general.length,
      hotel: hotel.length,
      additional: additional.length,
      days: days.length,
      services: serviceChanges,
      addedServices,
      removedServices,
      replacedServices,
      movedServices,
      priceChanges,
      externalChanges,
      dayMoves,
      total:
        general.length +
        hotel.length +
        additional.length +
        days.length +
        serviceChanges,
    },
  };
};

const getVersionLabel = (version) => {
  if (!version?.version_number) return "Versión";
  return version.history_source === "archived"
    ? `A${version.version_number}`
    : `V${version.version_number}`;
};

const getVersionSelectionKey = (version) =>
  version ? `${version.history_source || "relational"}:${version.id}` : null;

const defaultFormatDate = (value) => {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const defaultFormatCurrency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(toNumber(value));

const formatServiceCurrency = (value, currency) => {
  const normalized = normalizeText(currency).toLowerCase();
  const currencyCode = normalized.includes("sol") || normalized === "pen"
    ? "PEN"
    : "USD";
  return new Intl.NumberFormat(currencyCode === "PEN" ? "es-PE" : "en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(toNumber(value));
};

const getServiceModeLabel = (service) => {
  if (service.legacyTariff) return "Tarifa histórica";
  return service.pricingMode === "shared" ? "Precio compartido" : "Por persona";
};

const displayValue = (key, value, formatCurrency) => {
  if (
    [
      "total",
      "extraFee",
      "childExtraFee",
      "externalItineraryTotal",
      "commissionableSubtotal",
      "price",
    ].includes(key)
  ) {
    return formatCurrency(value);
  }
  if (
    [
      "operationalDisplay",
      "feeDisplay",
      "childOperationalDisplay",
      "childFeeDisplay",
    ].includes(key) &&
    typeof value === "number"
  ) {
    return formatCurrency(value);
  }
  if (key === "packageType") {
    const normalized = normalizeText(value).toLowerCase();
    return normalized === "privado" ? "Privado" : "Compartido";
  }
  if (["startDate", "endDate"].includes(key) && value) {
    const date = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("es-PE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
    }
  }
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (value === "") return "—";
  return String(value ?? "—");
};

const HistoryLoadingState = () => (
  <div className="version-history-loader" aria-label="Cargando historial">
    <div className="version-history-loader__rail">
      {[0, 1, 2].map((item) => (
        <div className="version-history-loader__row" key={item}>
          <span />
          <div><i /><i /></div>
        </div>
      ))}
    </div>
    <div className="version-history-loader__workspace">
      <div className="version-history-loader__hero" />
      <div className="version-history-loader__metrics">
        {[0, 1, 2, 3].map((item) => <span key={item} />)}
      </div>
      <div className="version-history-loader__lines">
        {[0, 1, 2, 3].map((item) => <i key={item} />)}
      </div>
      <p>Preparando versiones y comparativas…</p>
    </div>
  </div>
);

const getDirectionalChangeText = (type, beforeLabel, afterLabel) => {
  if (type === "added") {
    return `No existía en ${beforeLabel}; aparece en ${afterLabel}.`;
  }
  if (type === "removed") {
    return `Estaba presente en ${beforeLabel}; ya no existe en ${afterLabel}.`;
  }
  if (type === "moved") {
    return `Conserva su identidad y cambia de posición en ${afterLabel}.`;
  }
  if (type === "replaced") {
    return `El servicio de ${beforeLabel} fue reemplazado en ${afterLabel}.`;
  }
  return `Conserva su identidad y contiene cambios en ${afterLabel}.`;
};

const ChangeBadge = ({ type, targetLabel }) => {
  const config = {
    added: { icon: MdAdd, label: "Agregado" },
    removed: { icon: MdRemove, label: "Retirado" },
    modified: { icon: MdEdit, label: "Modificado" },
    replaced: { icon: MdCompareArrows, label: "Reemplazado" },
    moved: { icon: MdSwapVert, label: "Reordenado" },
  }[type] || { icon: MdEdit, label: "Cambio" };
  const Icon = config.icon;
  return (
    <span className={`version-change-badge version-change-badge--${type}`}>
      <Icon /> {config.label}{targetLabel ? ` en ${targetLabel}` : ""}
    </span>
  );
};

const getServiceTypeLabel = (value) => {
  const type = normalizeKeyText(value);
  const labels = {
    hotel: "Hotel",
    habitacion: "Hotel",
    transporte: "Transporte",
    movilidad: "Transporte",
    vuelo: "Vuelo",
    "tipo-vuelo": "Vuelo",
    tren: "Tren",
    vagon: "Tren",
    guia: "Guía",
    ruta: "Guía / ruta",
    endose: "Endose",
    tour: "Endose",
    restaurante: "Restaurante",
    ticket: "Ticket",
    entrada: "Ticket",
    extra: "Servicio extra",
    "servicio-extra": "Servicio extra",
  };
  return labels[type] || normalizeText(value || "Servicio");
};

const formatSignedCurrency = (value, currency = "USD") => {
  const amount = toNumber(value);
  if (Math.abs(amount) < 0.005) return null;
  const formatted = formatServiceCurrency(Math.abs(amount), currency);
  return `${amount > 0 ? "+" : "−"}${formatted}`;
};

const getServicePriceDelta = (previous, current) => {
  if (!previous || !current) return null;
  const before = toNumber(firstDefined(previous.storedTotal, previous.total, previous.price));
  const after = toNumber(firstDefined(current.storedTotal, current.total, current.price));
  if (Math.abs(after - before) < 0.005) return null;
  return {
    before,
    after,
    delta: after - before,
    currency: current.currency || previous.currency || "USD",
  };
};

const getServiceChangeSentence = (change) => {
  const previous = change.previous;
  const current = change.service;
  const service = current || previous;
  if (change.type === "added") {
    return service?.isExternal
      ? "Se agregó al itinerario externo"
      : "Se agregó al itinerario";
  }
  if (change.type === "removed") {
    return service?.isExternal
      ? "Se retiró del itinerario externo"
      : "Se retiró del itinerario";
  }
  if (change.type === "replaced") return "Se reemplazó por otro servicio";
  const orderChange = change.fields?.find((field) => field.key === "order");
  const priceChanged = change.fields?.some((field) =>
    ["price", "total", "currency", "pricingMode"].includes(field.key),
  );
  if (orderChange && priceChanged) return "Cambió de posición y precio";
  if (orderChange) return `Se movió de la posición ${orderChange.before} a ${orderChange.after}`;
  if (priceChanged) return "Se actualizó el precio";
  return "Se actualizaron sus datos";
};

const getDayChangeCounts = (change) => {
  const counts = {
    added: 0,
    removed: 0,
    modified: 0,
    replaced: 0,
    moved: 0,
    price: 0,
    external: 0,
  };
  change.services.forEach((serviceChange) => {
    counts[serviceChange.type] = (counts[serviceChange.type] || 0) + 1;
    if (serviceChange.fields?.some((field) => ["price", "total", "currency", "pricingMode"].includes(field.key))) {
      counts.price += 1;
    }
    if ((serviceChange.service || serviceChange.previous)?.isExternal) counts.external += 1;
    if (serviceChange.fields?.some((field) => field.key === "order")) counts.moved += 1;
  });
  return counts;
};

const getComparisonNarrative = (stats) => {
  const parts = [];
  if (stats.addedServices) parts.push(`${stats.addedServices} servicio${stats.addedServices === 1 ? " agregado" : "s agregados"}`);
  if (stats.removedServices) parts.push(`${stats.removedServices} servicio${stats.removedServices === 1 ? " retirado" : "s retirados"}`);
  if (stats.replacedServices) parts.push(`${stats.replacedServices} reemplazo${stats.replacedServices === 1 ? "" : "s"}`);
  if (stats.priceChanges) parts.push(`${stats.priceChanges} precio${stats.priceChanges === 1 ? " actualizado" : "s actualizados"}`);
  if (stats.dayMoves) parts.push(`${stats.dayMoves} día${stats.dayMoves === 1 ? " reordenado" : "s reordenados"}`);
  if (stats.externalChanges) parts.push(`${stats.externalChanges} cambio${stats.externalChanges === 1 ? "" : "s"} externo${stats.externalChanges === 1 ? "" : "s"}`);
  if (!parts.length) return "No se detectaron diferencias comerciales.";
  return parts.slice(0, -1).join(", ") + (parts.length > 1 ? ` y ${parts.at(-1)}` : parts[0]);
};

const ComparisonOverview = ({ comparison, formatCurrency }) => {
  const { before, after, stats } = comparison;
  const totalDelta = toNumber(after.total) - toNumber(before.total);
  const paxBefore = toNumber(before.adults) + toNumber(before.children);
  const paxAfter = toNumber(after.adults) + toNumber(after.children);
  return (
    <div className="version-overview">
      <div className="version-overview__summary">
        <span className="version-overview__eyebrow">Resumen</span>
        <strong>{getComparisonNarrative(stats)}</strong>
      </div>
      <div className="version-overview__facts">
        <div>
          <span>Total</span>
          <strong>{formatCurrency(before.total)} <MdChevronRight /> {formatCurrency(after.total)}</strong>
          {formatSignedCurrency(totalDelta) && <em>{formatSignedCurrency(totalDelta)}</em>}
        </div>
        <div>
          <span>Pasajeros</span>
          <strong>{paxBefore} <MdChevronRight /> {paxAfter}</strong>
          <small>{after.adults} adultos · {after.children} niños</small>
        </div>
        <div>
          <span>Alcance</span>
          <strong>{stats.days} día{stats.days === 1 ? "" : "s"}</strong>
          <small>{stats.services} servicio{stats.services === 1 ? "" : "s"}</small>
        </div>
      </div>
    </div>
  );
};

const HotelComparison = ({ before, after, formatCurrency }) => {
  const beforeRooms = Array.isArray(before?.roomDetails) ? before.roomDetails : [];
  const afterRooms = Array.isArray(after?.roomDetails) ? after.roomDetails : [];
  const roomSummary = (rooms = []) =>
    rooms.length
      ? rooms
          .map(
            (room) =>
              `${room.quantity > 1 ? `${room.quantity}× ` : ""}${room.label}${
                room.unitPrice > 0
                  ? ` · ${formatServiceCurrency(room.unitPrice, "USD")}`
                  : ""
              }`,
          )
          .join(", ")
      : "—";
  const rows = [
    ["Categoría", before?.category, after?.category],
    ["Noches", before?.nights, after?.nights],
    ["Habitaciones", before?.rooms, after?.rooms],
    ["Tarifas de habitación", roomSummary(beforeRooms), roomSummary(afterRooms)],
    ["Total hotel", formatCurrency(before?.total), formatCurrency(after?.total)],
  ].filter(([, left, right]) => !sameValue(left, right));
  return (
    <div className="version-hotel-comparison">
      <div className="version-hotel-comparison__states">
        <div><small>Antes</small><strong>{before?.hasHotel ? before.category : "Sin hotel"}</strong><span>{before?.nights || 0} noches · {beforeRooms.length || 0} tipos</span></div>
        <MdChevronRight />
        <div className="is-current"><small>Después</small><strong>{after?.hasHotel ? after.category : "Sin hotel"}</strong><span>{after?.nights || 0} noches · {afterRooms.length || 0} tipos</span></div>
      </div>
      {rows.length > 0 && (
        <div className="version-hotel-comparison__rows">
          {rows.map(([label, left, right]) => (
            <div key={label}><span>{label}</span><small>{left || "—"}</small><MdChevronRight /><strong>{right || "—"}</strong></div>
          ))}
        </div>
      )}
    </div>
  );
};

const FieldChanges = ({ changes, formatCurrency }) => {
  if (!changes.length) return null;
  return (
    <div className="version-field-changes">
      {changes.map((change) => (
        <div className="version-field-change" key={change.key}>
          <span className="version-field-change__label">{change.label}</span>
          <span className="version-field-change__before">
            {displayValue(change.key, change.before, formatCurrency)}
          </span>
          <MdChevronRight />
          <span className="version-field-change__after">
            {displayValue(change.key, change.after, formatCurrency)}
          </span>
        </div>
      ))}
    </div>
  );
};

const PassengerCompositionChange = ({ before, after, beforeLabel, afterLabel }) => {
  return (
    <div className="version-passenger-change">
      <div className="version-passenger-state">
        <small>{beforeLabel}</small>
        <span><MdPerson /> {before?.adults || 0} adultos</span>
        <span className="is-child"><MdChildCare /> {before?.children || 0} niños</span>
      </div>
      <MdChevronRight className="version-passenger-change__arrow" />
      <div className="version-passenger-state is-current">
        <small>{afterLabel}</small>
        <span><MdPerson /> {after?.adults || 0} adultos</span>
        <span className="is-child"><MdChildCare /> {after?.children || 0} niños</span>
      </div>
    </div>
  );
};

const CompactChangeGrid = ({ changes, formatCurrency }) => (
  <div className="version-compact-change-grid">
    {changes.map((change) => (
      <div className="version-compact-change" key={change.key}>
        <span>{change.label}</span>
        <div>
          <small>{displayValue(change.key, change.before, formatCurrency)}</small>
          <MdChevronRight />
          <strong>{displayValue(change.key, change.after, formatCurrency)}</strong>
        </div>
      </div>
    ))}
  </div>
);

const ServicePricingDetail = ({ service }) => {
  if (!service) return null;
  if (service.legacyPdfSummary) {
    return (
      <div className="version-service-pricing-detail version-service-pricing-detail--legacy">
        <p>{service.description || "Resumen incluido en el PDF histórico."}</p>
        <footer>
          <span>Tarifa estructurada</span>
          <strong>No disponible</strong>
        </footer>
      </div>
    );
  }
  const storedTotal = firstDefined(
    service.storedTotal,
    service.total,
    service.price,
    0,
  );
  const hasBeneficiaries = service.adultCount > 0 || service.childCount > 0;

  return (
    <div className="version-service-pricing-detail">
      <div className="version-service-pricing-detail__meta">
        <span>
          {getServiceModeLabel(service)}
          {service.isExternal && (
            <em className="version-service-external-badge">Externo · sin fee</em>
          )}
        </span>
        <span>{service.currency || "USD"}</span>
      </div>
      {service.adultCount > 0 && (
        <div className="version-service-pricing-detail__row">
          <span><MdPerson /> Adultos beneficiarios</span>
          <span>
            {service.adultCount} × {formatServiceCurrency(
              service.adultUnitPrice,
              service.currency,
            )}
          </span>
          <strong>{formatServiceCurrency(service.adultTotal, service.currency)}</strong>
        </div>
      )}
      {service.childCount > 0 && (
        <div className="version-service-pricing-detail__row version-service-pricing-detail__row--child">
          <span><MdChildCare /> Niños beneficiarios</span>
          <span>
            {service.childCount} × {formatServiceCurrency(
              service.childUnitPrice,
              service.currency,
            )}
          </span>
          <strong>{formatServiceCurrency(service.childTotal, service.currency)}</strong>
        </div>
      )}
      {!hasBeneficiaries && (
        <div className="version-service-pricing-detail__row">
          <span><MdAttachMoney /> Precio registrado</span>
          <span>1 × {formatServiceCurrency(service.price, service.currency)}</span>
          <strong>{formatServiceCurrency(storedTotal, service.currency)}</strong>
        </div>
      )}
      {service.convertedChildCount > 0 && (
        <p>
          {service.convertedChildCount} niño(s) utilizan tarifa de adulto en este servicio.
        </p>
      )}
      <footer>
        <span>Total guardado</span>
        <strong>{formatServiceCurrency(storedTotal, service.currency)}</strong>
      </footer>
    </div>
  );
};

const formatBeneficiaryLine = (service, kind) => {
  if (!service) return "—";
  const child = kind === "child";
  const count = child ? service.childCount : service.adultCount;
  const unit = child ? service.childUnitPrice : service.adultUnitPrice;
  const total = child ? service.childTotal : service.adultTotal;
  if (count <= 0) return "—";
  return `${count} × ${formatServiceCurrency(unit, service.currency)} · ${formatServiceCurrency(
    total,
    service.currency,
  )}`;
};

const ServiceInlineAmounts = ({ service }) => {
  if (!service) return null;
  const storedTotal = firstDefined(
    service.storedTotal,
    service.total,
    service.price,
    0,
  );
  return (
    <div className="version-service-inline-amounts">
      {service.adultCount > 0 && (
        <span><MdPerson /> {service.adultCount} adulto(s)</span>
      )}
      {service.childCount > 0 && (
        <span className="is-child"><MdChildCare /> {service.childCount} niño(s)</span>
      )}
      {service.isExternal && (
        <span className="is-external">Externo · sin fee</span>
      )}
      <strong>{formatServiceCurrency(storedTotal, service.currency)}</strong>
    </div>
  );
};

const ServiceComparisonTable = ({ previous, current, beforeLabel, afterLabel }) => {
  const priceDelta = getServicePriceDelta(previous, current);
  const rows = [
    {
      label: "Servicio",
      before: previous?.name || "—",
      after: current?.name || "—",
    },
    {
      label: "Posición",
      before: previous?.order || "—",
      after: current?.order || "—",
      hidden: sameValue(previous?.order, current?.order),
    },
    {
      label: "Precio unitario",
      before: formatServiceCurrency(previous?.price, previous?.currency),
      after: formatServiceCurrency(current?.price, current?.currency),
      hidden:
        sameValue(previous?.price, current?.price) &&
        sameValue(previous?.currency, current?.currency),
    },
    {
      label: "Adultos",
      before: formatBeneficiaryLine(previous, "adult"),
      after: formatBeneficiaryLine(current, "adult"),
      hidden:
        sameValue(previous?.adultCount, current?.adultCount) &&
        sameValue(previous?.adultUnitPrice, current?.adultUnitPrice),
    },
    {
      label: "Niños",
      before: formatBeneficiaryLine(previous, "child"),
      after: formatBeneficiaryLine(current, "child"),
      hidden:
        sameValue(previous?.childCount, current?.childCount) &&
        sameValue(previous?.childUnitPrice, current?.childUnitPrice),
    },
    {
      label: "Total guardado",
      before: formatServiceCurrency(
        firstDefined(previous?.storedTotal, previous?.total, previous?.price, 0),
        previous?.currency,
      ),
      after: formatServiceCurrency(
        firstDefined(current?.storedTotal, current?.total, current?.price, 0),
        current?.currency,
      ),
      emphasized: true,
      hidden: !priceDelta,
    },
  ].filter((row) => !row.hidden);

  return (
    <div className="version-service-compare-table">
      <div className="version-service-compare-table__head">
        <span />
        <strong>{beforeLabel}</strong>
        <MdChevronRight />
        <strong>{afterLabel}</strong>
      </div>
      {rows.map((row) => (
        <div
          className={`version-service-compare-table__row ${
            row.emphasized ? "is-emphasized" : ""
          }`}
          key={row.label}
        >
          <span>{row.label}</span>
          <span>{row.before}</span>
          <MdChevronRight />
          <strong>{row.after}</strong>
          {row.emphasized && priceDelta && (
            <em className={priceDelta.delta > 0 ? "is-up" : "is-down"}>
              {formatSignedCurrency(priceDelta.delta, priceDelta.currency)}
            </em>
          )}
        </div>
      ))}
      {(previous?.convertedChildCount > 0 || current?.convertedChildCount > 0) && (
        <p>
          Niños con tarifa adulta: {previous?.convertedChildCount || 0} → {current?.convertedChildCount || 0}
        </p>
      )}
    </div>
  );
};

const ServiceChangeRow = ({
  change,
  beforeLabel,
  afterLabel,
  formatCurrency,
}) => {
  const previous = change.previous;
  const current = change.service;
  const service = current || previous;
  const paired = Boolean(previous && current);
  const priceDelta = getServicePriceDelta(previous, current);
  const serviceCurrency = current?.currency || previous?.currency || "USD";
  const compactFields = change.fields.filter((field) =>
    ["type", "order", "currency", "pricingMode"].includes(field.key),
  );

  return (
    <article
      className={`version-service-change version-service-change--${change.type} ${
        paired ? "version-service-change--paired" : ""
      }`}
    >
      <header className="version-service-change__summary">
        <span className="version-service-change__marker">
          {change.type === "added" ? <MdAdd /> : change.type === "removed" ? <MdRemove /> : change.type === "moved" ? <MdSwapVert /> : <MdEdit />}
        </span>
        <div className="version-service-change__identity">
          <small>{getServiceTypeLabel(service.type)}{service.isExternal ? " · Externo" : ""}</small>
          {paired && normalizeKeyText(previous.name) !== normalizeKeyText(current.name) ? (
            <span className="version-service-change__name-flow">
              <span>{previous.name}</span>
              <MdChevronRight />
              <strong>{current.name}</strong>
            </span>
          ) : (
            <strong>{service.name}</strong>
          )}
          <span className="version-service-change__sentence">
            {getServiceChangeSentence(change)}
          </span>
        </div>
        <div className="version-service-change__impact">
          {priceDelta ? (
            <>
              <small>{formatServiceCurrency(priceDelta.before, priceDelta.currency)} → {formatServiceCurrency(priceDelta.after, priceDelta.currency)}</small>
              <strong className={priceDelta.delta > 0 ? "is-up" : "is-down"}>{formatSignedCurrency(priceDelta.delta, priceDelta.currency)}</strong>
            </>
          ) : (
            <ServiceInlineAmounts service={service} />
          )}
        </div>
        <ChangeBadge type={change.type} />
      </header>

      <div className="version-service-change__body">
        {paired ? (
          <ServiceComparisonTable
            previous={previous}
            current={current}
            beforeLabel={beforeLabel}
            afterLabel={afterLabel}
          />
        ) : (
          <ServicePricingDetail service={service} />
        )}
        <FieldChanges
          changes={compactFields}
          formatCurrency={(value) => formatServiceCurrency(value, serviceCurrency)}
        />
      </div>
    </article>
  );
};

const DayDiffCard = ({
  change,
  fallbackNumber,
  beforeLabel,
  afterLabel,
  formatCurrency,
}) => {
  const day = change.day || change.previous;
  const counts = getDayChangeCounts(change);
  const concise = [
    counts.added ? `+${counts.added} agregado${counts.added === 1 ? "" : "s"}` : null,
    counts.removed ? `−${counts.removed} retirado${counts.removed === 1 ? "" : "s"}` : null,
    counts.price ? `${counts.price} precio${counts.price === 1 ? "" : "s"}` : null,
    counts.moved ? `${counts.moved} reordenado${counts.moved === 1 ? "" : "s"}` : null,
    counts.external ? `${counts.external} externo${counts.external === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");
  const positionChange = change.fields.find((field) => ["number", "order"].includes(field.key));

  return (
    <article className={`version-day-diff version-day-diff--${change.type} is-open`}>
      <header className="version-day-diff__head">
        <span className="version-day-number">D{day.number || fallbackNumber}</span>
        <span className="version-day-diff__identity">
          <strong>{day.title || "Día sin título"}</strong>
          <small>
            {positionChange
              ? `Pasó de día ${positionChange.before} a día ${positionChange.after}${concise ? ` · ${concise}` : ""}`
              : concise || getDirectionalChangeText(change.type, beforeLabel, afterLabel)}
          </small>
        </span>
        <span className="version-day-diff__meta">
          {change.type !== "modified" && <ChangeBadge type={change.type} />}
        </span>
      </header>
      <div className="version-day-diff__body">
        <FieldChanges changes={change.fields} formatCurrency={formatCurrency} />
        {change.services.length > 0 && (
          <div className="version-service-changes">
            {change.services.map((serviceChange, serviceIndex) => {
              const changedService = serviceChange.service || serviceChange.previous;
              return (
                <ServiceChangeRow
                  key={`${changedService.key}-${serviceIndex}`}
                  change={serviceChange}
                  beforeLabel={beforeLabel}
                  afterLabel={afterLabel}
                  formatCurrency={formatCurrency}
                />
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
};

const ComparisonWorkspace = ({
  comparison,
  beforeLabel,
  afterLabel,
  loading,
  formatCurrency,
}) => {
  if (loading && !comparison) return <HistoryLoadingState />;
  if (!comparison) {
    return (
      <div className="version-comparison-empty">
        <MdCompareArrows />
        <h4>Elija una versión</h4>
        <p>Verá únicamente lo que cambió, sin alterar la cotización.</p>
      </div>
    );
  }

  const { stats, general, hotel, additional, days, before, after } = comparison;
  const passengerChanged =
    !sameValue(before?.adults, after?.adults) ||
    !sameValue(before?.children, after?.children);
  const generalDetails = general.filter(
    (change) => !["adults", "children", "total"].includes(change.key),
  );
  const hotelChanged = hotel.length > 0;
  return (
    <div className={`version-comparison-workspace ${loading ? "is-updating" : ""}`} aria-busy={loading}>
      {loading && <div className="version-comparison-refresh" role="status"><span /> Actualizando…</div>}
      <div className="version-comparison-head">
        <div>
          <span className="version-comparison-kicker">Cambios de la versión</span>
          <h4>{beforeLabel} <MdChevronRight /> {afterLabel}</h4>
        </div>
        <span className={`version-comparison-result ${stats.total === 0 ? "is-clean" : ""}`}>
          {stats.total === 0 ? <MdCheckCircle /> : <MdTune />}
          {stats.total === 0 ? "Sin cambios" : `${stats.total} cambios`}
        </span>
      </div>

      {stats.total === 0 ? (
        <div className="version-no-differences">
          <MdCheckCircle />
          <div><strong>Las versiones coinciden</strong><span>No se detectaron diferencias comerciales.</span></div>
        </div>
      ) : (
        <>
          <ComparisonOverview comparison={comparison} formatCurrency={formatCurrency} />
          <div className="version-change-sections">
            {passengerChanged && (
              <section className="version-change-section version-change-section--passengers">
                <header><MdPerson /><div><strong>Pasajeros</strong><span>Composición del grupo</span></div></header>
                <PassengerCompositionChange before={before} after={after} beforeLabel={beforeLabel} afterLabel={afterLabel} />
              </section>
            )}

            {generalDetails.length > 0 && (
              <section className="version-change-section">
                <header><MdInfoOutline /><div><strong>Datos de la cotización</strong><span>{generalDetails.length} cambio{generalDetails.length === 1 ? "" : "s"}</span></div></header>
                <CompactChangeGrid changes={generalDetails} formatCurrency={formatCurrency} />
              </section>
            )}

            {hotelChanged && (
              <section className="version-change-section version-change-section--hotel">
                <header><MdHotel /><div><strong>Hotel</strong><span>{hotel.length} cambio{hotel.length === 1 ? "" : "s"}</span></div></header>
                <HotelComparison before={before.hotel} after={after.hotel} formatCurrency={formatCurrency} />
              </section>
            )}

            {additional.length > 0 && (
              <section className="version-change-section version-change-section--financial">
                <header><MdAttachMoney /><div><strong>Fee, comisión y costos</strong><span>{additional.length} cambio{additional.length === 1 ? "" : "s"}</span></div></header>
                <CompactChangeGrid changes={additional} formatCurrency={formatCurrency} />
              </section>
            )}

            {days.length > 0 && (
              <section className="version-change-section version-change-section--days">
                <header><MdRoute /><div><strong>Itinerario</strong><span>{days.length} día{days.length === 1 ? "" : "s"} afectado{days.length === 1 ? "" : "s"}</span></div></header>
                <div className="version-days-diff">
                  {days.map((change, index) => {
                    const day = change.day || change.previous;
                    return <DayDiffCard key={`${day.key}-${index}`} change={change} fallbackNumber={index + 1} beforeLabel={beforeLabel} afterLabel={afterLabel} formatCurrency={formatCurrency} />;
                  })}
                </div>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const SnapshotServiceRow = ({ service }) => {
  return (
    <article className="snapshot-service-row is-open">
      <header className="snapshot-service-row__head">
        <span className="snapshot-service-row__type">{service.type || "Servicio"}</span>
        <span className="snapshot-service-row__identity">
          <strong>{service.name}</strong>
          <small>
            {service.legacyPdfSummary
              ? "Resumen PDF histórico"
              : `${getServiceModeLabel(service)} · ${service.currency || "USD"}`}
            {service.isExternal ? " · Externo sin fee" : ""}
          </small>
        </span>
        <ServiceInlineAmounts service={service} />
      </header>
      <ServicePricingDetail service={service} />
    </article>
  );
};

const SnapshotDayBlock = ({ day }) => {
  const externalCount = day.services.filter((service) => service.isExternal).length;
  return (
    <section className="snapshot-day is-open">
      <header className="snapshot-day__toggle">
        <span>Día {day.number}</span>
        <span className="snapshot-day__identity">
          <strong>{day.title}</strong>
          <small>
            {day.services.length} servicio{day.services.length === 1 ? "" : "s"}
            {externalCount > 0 ? ` · ${externalCount} externo${externalCount === 1 ? "" : "s"}` : ""}
          </small>
        </span>
        <span className="snapshot-day__scope">
          {day.externalOnly
            ? "Solo externo"
            : externalCount > 0
              ? "Principal + externo"
              : "Principal"}
        </span>
      </header>
      <div className="snapshot-day__body">
        {day.description && <p className="snapshot-day__description">{day.description}</p>}
        {day.services.length > 0 ? (
          <div className="snapshot-day-services">
            {day.services.map((service) => (
              <SnapshotServiceRow service={service} key={service.key} />
            ))}
          </div>
        ) : (
          <p className="snapshot-day__empty">Sin servicios registrados.</p>
        )}
      </div>
    </section>
  );
};

const SnapshotPreviewModal = ({ version, formatDate, formatCurrency, onClose }) => {
  const [search, setSearch] = useState("");
  const snapshot = useMemo(() => normalizeSnapshot(version), [version]);
  const query = normalizeKeyText(search);
  const filteredDays = useMemo(() => {
    if (!query) return snapshot.days;
    return snapshot.days
      .map((day) => {
        const dayMatches = normalizeKeyText(
          `${day.title} ${day.description} ${day.cities.join(" ")}`,
        ).includes(query);
        const matchingServices = day.services.filter((service) =>
          normalizeKeyText(
            `${service.name} ${service.type} ${service.parentId || ""} ${service.childId || ""}`,
          ).includes(query),
        );
        if (!dayMatches && matchingServices.length === 0) return null;
        return {
          ...day,
          services: dayMatches ? day.services : matchingServices,
        };
      })
      .filter(Boolean);
  }, [query, snapshot.days]);
  const serviceCount = snapshot.days.reduce(
    (sum, day) => sum + day.services.length,
    0,
  );
  const externalCount = snapshot.days.reduce(
    (sum, day) => sum + day.services.filter((service) => service.isExternal).length,
    0,
  );

  const content = (
    <div className="snapshot-modal-overlay" onMouseDown={onClose}>
      <div className="snapshot-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="snapshot-modal-header">
          <div>
            <span>{getVersionLabel(version)} · {PHASE_LABELS[version.phase] || version.phase || "Histórico"}</span>
            <h3>{snapshot.title}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar vista previa"><MdClose /></button>
        </header>
        <div className="snapshot-modal-summary">
          <span><MdCalendarToday /> {formatDate(version.archived_at)}</span>
          <span><MdPerson /> {snapshot.adults} adultos</span>
          {snapshot.children > 0 && <span><MdChildCare /> {snapshot.children} niños</span>}
          <span><MdRoute /> {snapshot.days.length} días</span>
          <span>{serviceCount} servicios</span>
          {externalCount > 0 && <span>{externalCount} externos</span>}
          <strong>{formatCurrency(snapshot.total)}</strong>
        </div>
        <div className="snapshot-modal-tools">
          <label>
            <MdSearch />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar día, proveedor o servicio…"
            />
          </label>
          <div className="snapshot-modal-tools__actions">
            <span>{filteredDays.length} de {snapshot.days.length} días</span>
            <strong>Detalle completo</strong>
          </div>
        </div>
        <div className="snapshot-modal-body">
          {filteredDays.length > 0 ? filteredDays.map((day) => (
            <SnapshotDayBlock day={day} key={day.key} />
          )) : (
            <div className="version-comparison-empty">
              <MdSearch />
              <h4>Sin coincidencias</h4>
              <p>No se encontraron días o servicios para “{search}”.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? ReactDOM.createPortal(content, document.body) : content;
};

const PredecesoresExpander = ({
  cotizacion,
  archivedVersionCount = 0,
  formatDate = defaultFormatDate,
  formatCurrency = defaultFormatCurrency,
  calculateTotalFinal = () => 0,
  userRole,
  onRefresh,
  modalMode = false,
  onClose,
  workingSnapshot = null,
  allowRestore = true,
}) => {
  const [displayPredecessors, setDisplayPredecessors] = useState(modalMode);
  const [loadedPredecessors, setLoadedPredecessors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(null);
  const [selectedVersionKey, setSelectedVersionKey] = useState(null);
  const [comparisonMode, setComparisonMode] = useState("current");
  const [comparison, setComparison] = useState(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState(null);
  const [deletingVersion, setDeletingVersion] = useState(null);
  const [currentSnapshot, setCurrentSnapshot] = useState(workingSnapshot);
  const versionCache = useRef(new Map());
  const currentSnapshotFingerprintRef = useRef(
    buildSnapshotFingerprint(workingSnapshot),
  );
  const workingSnapshotFingerprint = useMemo(
    () => buildSnapshotFingerprint(workingSnapshot),
    [workingSnapshot],
  );

  const isSold = Boolean(cotizacion?.tiene_voucher ?? cotizacion?.tieneVoucher);

  const versionGroups = useMemo(() => {
    const relational = loadedPredecessors
      .filter((version) => version.history_source !== "archived")
      .sort(
        (left, right) =>
          toNumber(right.version_number) - toNumber(left.version_number),
      );
    const archived = loadedPredecessors
      .filter((version) => version.history_source === "archived")
      .filter((version) => !isSold || version.is_closed_sale === true)
      .sort(
        (left, right) =>
          toNumber(right.version_number) - toNumber(left.version_number),
      );

    if (!isSold) return { relational, archived };
    const baseline = relational.find((version) => version.phase === "SALE_BASE");
    const visibleRelational = baseline
      ? relational.filter(
          (version) =>
            toNumber(version.version_number) >=
            toNumber(baseline.version_number),
        )
      : relational.filter((version) => version.phase !== "DRAFT");
    return { relational: visibleRelational, archived };
  }, [isSold, loadedPredecessors]);

  const visibleVersions = useMemo(
    () => [...versionGroups.relational, ...versionGroups.archived],
    [versionGroups],
  );
  const selectedVersion = visibleVersions.find(
    (version) => getVersionSelectionKey(version) === selectedVersionKey,
  ) || null;
  const selectedGroup = selectedVersion?.history_source === "archived"
    ? versionGroups.archived
    : versionGroups.relational;
  const selectedIndex = selectedGroup.findIndex(
    (version) => getVersionSelectionKey(version) === selectedVersionKey,
  );
  const previousVersion =
    selectedIndex >= 0 ? selectedGroup[selectedIndex + 1] || null : null;
  const latestVersion =
    versionGroups.relational[0] || versionGroups.archived[0] || null;
  const selectedHistorySource =
    selectedVersion?.history_source || "relational";

  const fetchVersions = useCallback(async ({ force = false } = {}) => {
    if ((!force && hasFetched) || !cotizacion?.id) return;
    setLoading(true);
    try {
      const [relationalResult, archivedResult] = await Promise.allSettled([
        cotizacionService.getCotizacionVersions(cotizacion.id),
        cotizacionService.getArchivedVersions(cotizacion.id),
      ]);
      const relational =
        relationalResult.status === "fulfilled"
          ? (relationalResult.value || []).map((version) => ({
              ...version,
              history_source: "relational",
            }))
          : [];
      const archived =
        archivedResult.status === "fulfilled"
          ? (archivedResult.value || []).map((version) => ({
              ...version,
              phase: "LEGACY_ARCHIVE",
              history_source: "archived",
            }))
          : [];
      const combined = [...relational, ...archived];
      setLoadedPredecessors(combined);
      setSelectedVersionKey((current) => {
        if (current && combined.some(
          (version) => getVersionSelectionKey(version) === current,
        )) {
          return current;
        }
        const firstRelational = relational[0];
        const firstArchived = archived.find(
          (version) => !isSold || version.is_closed_sale === true,
        );
        return getVersionSelectionKey(firstRelational || firstArchived);
      });
      if (relationalResult.status === "rejected") {
        console.error(
          "No se pudo cargar el historial relacional:",
          relationalResult.reason,
        );
      }
      if (archivedResult.status === "rejected") {
        console.error(
          "No se pudo cargar el archivo legacy:",
          archivedResult.reason,
        );
      }
      if (!workingSnapshot) {
        const live = await cotizacionService.getCotizacionById(cotizacion.id, {
          skipCache: true,
          _skipDedup: true,
        });
        // El listado ya contiene los conteos batch de pasajero. Se conservan
        // al enriquecer el detalle para que una respuesta legacy sin
        // num_adults/num_children no convierta cantidadpersonas en adultos.
        setCurrentSnapshot({
          ...cotizacion,
          ...live,
        });
      }
    } catch (error) {
      console.error("No se pudo cargar el historial de la cotización:", error);
      setLoadedPredecessors([]);
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  }, [cotizacion, hasFetched, isSold, workingSnapshot]);

  useEffect(() => {
    if (!workingSnapshot) return;
    if (currentSnapshotFingerprintRef.current === workingSnapshotFingerprint) {
      return;
    }
    currentSnapshotFingerprintRef.current = workingSnapshotFingerprint;
    setCurrentSnapshot(workingSnapshot);
  }, [workingSnapshot, workingSnapshotFingerprint]);

  useEffect(() => {
    if (modalMode && !hasFetched) fetchVersions();
  }, [fetchVersions, hasFetched, modalMode]);

  useEffect(() => {
    if (!modalMode || typeof document === "undefined") return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        if (previewVersion) setPreviewVersion(null);
        else onClose?.();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [modalMode, onClose, previewVersion]);

  const loadVersionDetail = useCallback(async (version) => {
    if (!version) return null;
    const source = version.history_source || "relational";
    const hasRelationalDetail =
      Array.isArray(version.days) ||
      Array.isArray(version.services) ||
      Array.isArray(version.enriched_services) ||
      Array.isArray(version.enrichedServices);
    if (version.snapshot && (source === "archived" || hasRelationalDetail)) {
      return version;
    }
    const cacheKey = getVersionSelectionKey(version);
    if (versionCache.current.has(cacheKey)) {
      return versionCache.current.get(cacheKey);
    }
    const detail = source === "relational"
      ? await cotizacionService.getCotizacionVersionById(cotizacion.id, version.id)
      : await cotizacionService.getArchivedVersionById(version.id);
    const normalizedDetail = {
      ...version,
      ...detail,
      phase: source === "archived" ? "LEGACY_ARCHIVE" : detail.phase,
      history_source: source,
    };
    versionCache.current.set(cacheKey, normalizedDetail);
    return normalizedDetail;
  }, [cotizacion?.id]);

  useEffect(() => {
    let active = true;
    const buildComparison = async () => {
      if (!selectedVersion) {
        setComparison(null);
        return;
      }
      setComparisonLoading(true);
      try {
        const selectedDetail = await loadVersionDetail(selectedVersion);
        let before;
        let after;
        if (comparisonMode === "current" && currentSnapshot) {
          before = selectedDetail;
          after = currentSnapshot;
        } else if (previousVersion) {
          before = await loadVersionDetail(previousVersion);
          after = selectedDetail;
        } else {
          before = selectedDetail;
          after = selectedDetail;
        }
        if (active) setComparison(compareSnapshots(before, after));
      } catch (error) {
        console.error("No se pudo comparar versiones:", error);
        if (active) setComparison(null);
      } finally {
        if (active) setComparisonLoading(false);
      }
    };
    buildComparison();
    return () => { active = false; };
  }, [comparisonMode, currentSnapshot, loadVersionDetail, previousVersion, selectedVersion]);

  useEffect(() => {
    if (!latestVersion) return;
    const selectionIsVisible = visibleVersions.some(
      (version) => getVersionSelectionKey(version) === selectedVersionKey,
    );
    if (!selectionIsVisible) {
      setSelectedVersionKey(getVersionSelectionKey(latestVersion));
      setComparisonMode("current");
    }
  }, [latestVersion, selectedVersionKey, visibleVersions]);

  const handlePreview = async (version) => {
    try {
      setPreviewVersion(await loadVersionDetail(version));
    } catch (error) {
      console.error("No se pudo abrir la versión:", error);
    }
  };

  const handleRestore = async (version) => {
    if (version?.history_source === "archived" || restoringVersion) return;
    const label = getVersionLabel(version);
    if (!window.confirm(`¿Restaurar ${label}?\n\nSe creará un punto reversible antes de aplicar los cambios.`)) return;
    try {
      setRestoringVersion(version.id);
      await cotizacionService.restoreCotizacionVersion(
        cotizacion.id,
        version.id,
        `Restauración solicitada desde el comparador (${label})`,
      );
      versionCache.current.clear();
      setHasFetched(false);
      await fetchVersions({ force: true });
      await onRefresh?.();
    } catch (error) {
      window.alert(`No se pudo restaurar la versión: ${error.message}`);
    } finally {
      setRestoringVersion(null);
    }
  };

  const handleDelete = async (version) => {
    if (userRole !== 0 || version?.history_source !== "archived") return;
    if (!window.confirm(`¿Eliminar ${getVersionLabel(version)} del historial archivado?`)) return;
    try {
      setDeletingVersion(version.id);
      await cotizacionService.deleteArchivedVersion(cotizacion.id, version.id);
      setLoadedPredecessors((current) =>
        current.filter(
          (item) =>
            getVersionSelectionKey(item) !== getVersionSelectionKey(version),
        ),
      );
    } finally {
      setDeletingVersion(null);
    }
  };

  const estimatedCount = Math.max(
    toNumber(cotizacion?.current_version ?? cotizacion?.currentVersion),
    toNumber(archivedVersionCount),
  );

  if (!modalMode && estimatedCount === 0 && !hasFetched) return null;
  if (!modalMode && hasFetched && visibleVersions.length === 0) return null;

  const renderVersionRailRows = (versions, archived = false) =>
    versions.map((version, index) => {
      const selectionKey = getVersionSelectionKey(version);
      const active = selectionKey === selectedVersionKey;
      return (
        <button
          type="button"
          className={`version-rail-row ${active ? "is-active" : ""} ${
            archived ? "is-archived" : ""
          }`}
          key={selectionKey}
          onClick={() => {
            setSelectedVersionKey(selectionKey);
            setComparisonMode(index === 0 ? "current" : "previous");
          }}
        >
          <span className="version-rail-row__number">
            {getVersionLabel(version)}
          </span>
          <span className="version-rail-row__content">
            <strong>
              {PHASE_LABELS[version.phase] || version.phase || "Histórico"}
            </strong>
            <small>{formatDate(version.archived_at)}{version.archived_by ? ` · ${version.archived_by}` : ""}</small>
          </span>
          <span className="version-rail-row__total">
            {formatCurrency(version.total_final)}
          </span>
          <MdChevronRight />
        </button>
      );
    });

  const beforeLabel = comparisonMode === "current"
    ? getVersionLabel(selectedVersion)
    : getVersionLabel(previousVersion || selectedVersion);
  const afterLabel = comparisonMode === "current"
    ? "Trabajo actual"
    : getVersionLabel(selectedVersion);

  const body = (
    <div
      className={modalMode ? "history-modal-backdrop" : undefined}
      onMouseDown={modalMode ? onClose : undefined}
    >
      <div
        className={modalMode ? "history-modal-panel" : "predecessors-expander"}
        onMouseDown={modalMode ? (event) => event.stopPropagation() : undefined}
      >
        {modalMode && (
          <header className="history-modal-header">
            <div className="history-modal-title">
              <span className="history-modal-icon"><MdHistory /></span>
              <div>
                <span className="history-modal-kicker">Historial de cambios</span>
                <h3>{cotizacion?.titulo || cotizacion?.id}</h3>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Cerrar historial"><MdClose /></button>
          </header>
        )}

        {!modalMode && (
          <button
            className="predecessors-toggle"
            type="button"
            onClick={() => {
              if (!hasFetched) fetchVersions();
              setDisplayPredecessors((value) => !value);
            }}
          >
            <MdHistory />
            <span>Historial de versiones</span>
            <strong>{hasFetched ? visibleVersions.length : estimatedCount}</strong>
          </button>
        )}

        {(modalMode || displayPredecessors) && (
          <div className="version-manager-shell">
            {loading ? (
              <HistoryLoadingState />
            ) : visibleVersions.length === 0 ? (
              <div className="version-comparison-empty">
                <MdHistory />
                <h4>Sin versiones disponibles</h4>
                <p>
                  {isSold
                    ? "No existen backups posteriores al cierre de la venta."
                    : "La primera versión aparecerá después de guardar un cambio."}
                </p>
              </div>
            ) : (
              <>
                <aside className="version-manager-rail">
                  <div className="version-current-card">
                    <span className="version-current-card__icon"><MdEdit /></span>
                    <div><small>Estado activo</small><strong>Trabajo actual</strong><span>{formatCurrency(normalizeSnapshot(currentSnapshot || cotizacion).total)}</span></div>
                  </div>
                  {versionGroups.relational.length > 0 && (
                    <section className="version-rail-section">
                      <div className="version-rail-heading">
                        <span>Historial actual</span>
                        <strong>{versionGroups.relational.length}</strong>
                      </div>
                      <div className="version-rail-list">
                        {renderVersionRailRows(versionGroups.relational)}
                      </div>
                    </section>
                  )}
                  {versionGroups.archived.length > 0 && (
                    <section className="version-rail-section version-rail-section--archived">
                      <div className="version-rail-heading">
                        <span>Archivo anterior</span>
                        <strong>{versionGroups.archived.length}</strong>
                      </div>
                      <div className="version-rail-list">
                        {renderVersionRailRows(versionGroups.archived, true)}
                      </div>
                    </section>
                  )}
                </aside>

                <main className="version-manager-main">
                  <div className="version-manager-toolbar">
                    <div className="version-compare-switch">
                      <button
                        type="button"
                        className={comparisonMode === "current" ? "is-active" : ""}
                        disabled={!currentSnapshot}
                        onClick={() => setComparisonMode("current")}
                      >
                        <MdEdit /> Comparar con actual
                      </button>
                      <button
                        type="button"
                        className={comparisonMode === "previous" ? "is-active" : ""}
                        disabled={!previousVersion}
                        onClick={() => setComparisonMode("previous")}
                      >
                        <MdCompareArrows /> Comparar con anterior
                      </button>
                    </div>
                    <div className="version-manager-actions">
                      <button type="button" onClick={() => handlePreview(selectedVersion)} disabled={!selectedVersion}>
                        <MdPreview /> Ver versión
                      </button>
                      {allowRestore && selectedHistorySource === "relational" && selectedVersion?.can_restore !== false && (
                        <button
                          type="button"
                          className="is-restore"
                          onClick={() => handleRestore(selectedVersion)}
                          disabled={!selectedVersion || restoringVersion === selectedVersion.id}
                        >
                          <MdRestore /> {restoringVersion === selectedVersion?.id ? "Restaurando…" : "Restaurar"}
                        </button>
                      )}
                      {userRole === 0 && selectedHistorySource === "archived" && (
                        <button
                          type="button"
                          className="is-delete"
                          onClick={() => handleDelete(selectedVersion)}
                          disabled={!selectedVersion || deletingVersion === selectedVersion.id}
                        >
                          <MdDelete />
                        </button>
                      )}
                    </div>
                  </div>
                  {selectedHistorySource === "archived" && (
                    <div className="legacy-history-notice">
                      <MdInfoOutline />
                      <div>
                        <strong>Versión del archivo anterior</strong>
                        <span>
                          Se interpreta el snapshot original en modo lectura. Algunos
                          campos antiguos pueden no tener el detalle relacional actual.
                        </span>
                      </div>
                    </div>
                  )}
                  <ComparisonWorkspace
                    comparison={comparison}
                    beforeLabel={beforeLabel}
                    afterLabel={afterLabel}
                    loading={comparisonLoading}
                    formatCurrency={formatCurrency}
                  />
                </main>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {previewVersion && (
        <SnapshotPreviewModal
          version={previewVersion}
          formatDate={formatDate}
          formatCurrency={formatCurrency}
          onClose={() => setPreviewVersion(null)}
        />
      )}
      {modalMode && typeof document !== "undefined"
        ? ReactDOM.createPortal(body, document.body)
        : body}
    </>
  );
};

export default PredecesoresExpander;
