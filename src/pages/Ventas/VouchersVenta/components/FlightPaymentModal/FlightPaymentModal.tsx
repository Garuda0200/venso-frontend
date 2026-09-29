import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "../../../../../components/UI/Modal/Modal";
import SmartComboBox from "../../../../../components/common/SmartComboBox/SmartComboBox";
import {
  MdAttachMoney,
  MdAdd,
  MdCalendarToday,
  MdCheckCircle,
  MdClose,
  MdConfirmationNumber,
  MdDelete,
  MdFlightTakeoff,
  MdInfo,
  MdRefresh,
  MdTrain,
  MdVisibility,
  MdCloudUpload,
  MdWarning,
} from "react-icons/md";
import ServicePicker from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/ServicePicker/ServicePicker";
import ServiceDetailedInfo from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/components/ServiceDetailedInfo/ServiceDetailedInfo";
import { hydrateServiceFromDB } from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/itinerarioCleanupUtils";
import {
  createUnifiedService,
  getPassengerIdsByType,
  getTotalPassengerCount,
} from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/unifiedServiceManager";
import { getPassengerSlotKey } from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/passengerPricingState";
import MovimientoForm from "../../../../../components/Contabilidad/MovimientoForm";
import MovimientoPreviewModal from "../../../../../components/Contabilidad/MovimientoPreviewModal";
import { voucherReservaService } from "../../../../../services/voucherReservaService";
import { voucherVentaService } from "../../../../../services/voucherVentaService";
import { movimientoService } from "../../../../../services/movimientoService";
import {
  createTipoVuelo,
  createVuelo,
  fetchTipoVueloByVuelo,
  fetchTiposVuelo,
  fetchVuelos,
  updateTipoVuelo,
} from "../../../../Reservas/Servicios/services/api";
import { normalizePaymentServiceData } from "../../../../../utils/paymentFacturacion";
import SecureStorage from "../../../../../utils/secureStorage";
import { toast } from "react-toastify";
import FpmChildrenPanel from "./FpmChildrenPanel";
import "./FlightPaymentModal.scss";

const SERVICE_CONFIG = {
  vuelos: {
    singular: "vuelo",
    plural: "vuelos",
    title: "Pago de vuelos por separado",
    selectTitle: "Selecciona el vuelo a pagar",
    assignTitle: "Asignar vuelo interno",
    assignedTitle: "Vuelo interno asignado",
    icon: <MdFlightTakeoff />,
  },
  trenes: {
    singular: "tren",
    plural: "trenes",
    title: "Pago de trenes por separado",
    selectTitle: "Selecciona el tren a pagar",
    assignTitle: "Asignar tren interno",
    assignedTitle: "Tren interno asignado",
    icon: <MdTrain />,
  },
  tickets: {
    singular: "ticket",
    plural: "tickets",
    title: "Pago de tickets por separado",
    selectTitle: "Selecciona el ticket a pagar",
    assignTitle: "Asignar ticket interno",
    assignedTitle: "Ticket interno asignado",
    icon: <MdConfirmationNumber />,
  },
};

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.values(value).filter((item) => item && typeof item === "object");
  }
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return Object.values(parsed);
  } catch {
    return [];
  }

  return [];
};

const round2 = (value) => {
  const num = Number(value);
  return Number.isFinite(num)
    ? Math.round((num + Number.EPSILON) * 100) / 100
    : 0;
};

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatUsd = (value) => `$${USD_FORMATTER.format(round2(value))}`;

const formatSignedUsd = (value) => {
  const amount = round2(value);
  if (amount > 0) return `+${formatUsd(amount)}`;
  if (amount < 0) return `-${formatUsd(Math.abs(amount))}`;
  return formatUsd(0);
};

const parseCurrencyInput = (value) => {
  const normalized = String(value ?? "").replace(",", ".").trim();
  if (!normalized) return 0;
  const num = Number(normalized);
  return Number.isFinite(num) && num >= 0 ? num : null;
};

const blurPriceInputOnWheel = (event) => {
  // A focused number input changes its value with the mouse wheel. Blur it
  // before the browser applies that native step so the modal can keep
  // scrolling without altering the price accidentally.
  event.currentTarget.blur();
};

const preventPriceInputStepKeys = (event) => {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return false;
  event.preventDefault();
  return true;
};

const parseMaybeJson = (value, fallback = {}) => {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return fallback;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const buildPlaceholderPassengers = (count, type) =>
  Array.from({ length: Math.max(0, Number(count) || 0) }, (_, index) => ({
    id: `${type}-${index + 1}`,
    type,
    nombres: type === "child" ? `Niño ${index + 1}` : `Adulto ${index + 1}`,
  }));

const normalizePeopleDetails = (cotizacionData = {}) => {
  const inputLooksLikePeople =
    Array.isArray(cotizacionData?.adults) ||
    Array.isArray(cotizacionData?.children) ||
    Array.isArray(cotizacionData?.details) ||
    cotizacionData?.adultos != null ||
    cotizacionData?.ninos != null ||
    cotizacionData?.ninios != null;
  const raw = inputLooksLikePeople
    ? cotizacionData
    : parseMaybeJson(
        cotizacionData?.peopledetails || cotizacionData?.peopleDetails,
        {},
      );
  const summary =
    cotizacionData?.passenger_summary ||
    cotizacionData?.passengerSummary ||
    raw?.passenger_summary ||
    raw?.passengerSummary ||
    {};

  let adults = Array.isArray(raw.adults) ? raw.adults : [];
  let children = Array.isArray(raw.children) ? raw.children : [];
  let infants = Array.isArray(raw.infants) ? raw.infants : [];

  if ((!adults.length || !children.length) && Array.isArray(raw.details)) {
    adults = raw.details.filter((person) => {
      const type = String(
        person?.type || person?.tipo || person?.tipo_pasajero || "",
      ).toLowerCase();
      return !type.includes("child") && !type.includes("ni");
    });
    children = raw.details.filter((person) => {
      const type = String(
        person?.type || person?.tipo || person?.tipo_pasajero || "",
      ).toLowerCase();
      return type.includes("child") || type.includes("ni");
    });
  }

  const adultCount =
    adults.length ||
    Number(
      raw.adultos ||
        raw.adultsCount ||
        raw.adults ||
        summary.adults ||
        summary.adultos ||
        cotizacionData?.adultos ||
        cotizacionData?.cantidadAdultos ||
        (!raw.ninos &&
        !raw.ninios &&
        !raw.childrenCount &&
        !summary.children &&
        !cotizacionData?.ninos &&
        !cotizacionData?.ninios
          ? cotizacionData?.cantidadpersonas
          : 0) ||
        0,
    );
  const childCount =
    children.length ||
    Number(
      raw.ninos ||
        raw.ninios ||
        raw.childrenCount ||
        raw.children ||
        summary.children ||
        summary.ninos ||
        summary.ninios ||
        cotizacionData?.ninos ||
        cotizacionData?.ninios ||
        cotizacionData?.cantidadNinos ||
        0,
    );
  const infantCount =
    infants.length ||
    Number(raw.infantes || raw.infantsCount || cotizacionData?.infantes || 0);

  if (!adults.length)
    adults = buildPlaceholderPassengers(adultCount || 1, "adult");
  if (!children.length)
    children = buildPlaceholderPassengers(childCount, "child");
  if (!infants.length)
    infants = buildPlaceholderPassengers(infantCount, "infant");

  return {
    ...raw,
    adults,
    children,
    infants,
    adultos: adults.length,
    ninos: children.length,
    ninios: children.length,
    infantes: infants.length,
    total: adults.length + children.length + infants.length,
    details: raw.details || [...adults, ...children, ...infants],
  };
};

const hasPassengerRows = (value = {}) =>
  (Array.isArray(value?.adults) && value.adults.length > 0) ||
  (Array.isArray(value?.children) && value.children.length > 0) ||
  (Array.isArray(value?.details) && value.details.length > 0);

const getServiceType = (service = {}) =>
  String(
    service?.assignedParentService?.typeService ||
      service?.assignedParentService?.tipo_servicio ||
      service?.assignedService?.parentService?.typeService ||
      service?.assignedService?.parentService?.tipo_servicio ||
      service?.parentService?.typeService ||
      service?.parentService?.tipo_servicio ||
      service?.cotizacionServiceRef?.typeService ||
      service?.typeService ||
      service?.tipoServicio ||
      service?.tipo_servicio ||
      service?.category ||
      service?.categoria ||
      "",
  )
    .trim()
    .toLowerCase();

const isType = (service, type) => getServiceType(service) === type;

const getServiceName = (service = {}, fallback = "Servicio") =>
  service?.parentService?.nombre ||
  service?.parentService?.nombre_empresa ||
  service?.parentService?.nombre_transporte ||
  service?.assignedParentService?.nombre ||
  service?.assignedParentService?.nombre_empresa ||
  service?.assignedParentService?.nombre_transporte ||
  service?.childService?.ticket?.entrada ||
  service?.childService?.entrada ||
  service?.assignedChildService?.ticket?.entrada ||
  service?.assignedChildService?.entrada ||
  service?.nombre ||
  fallback;

const getTariff = (service = {}) =>
  service?.assignedService?.tariff ||
  service?.assignedTariff ||
  service?.tariff ||
  {};

const getPassengerSelection = (service = {}, peopleDetails = {}) => {
  const tariff = getTariff(service);
  const baseSelection =
    service?.assignedService?.assignedPassengerSelection ||
    service?.assignedService?.passengerSelection ||
    service?.assignedPassengerSelection ||
    service?.passengerSelection ||
    tariff?.assignedPassengerSelection ||
    tariff?.passengerSelection ||
    {};

  const { adultIds, childIds, allPassengerIds } =
    getPassengerIdsByType(peopleDetails);
  const selectedIdsFromSelection = Array.isArray(baseSelection?.selectedIds)
    ? baseSelection.selectedIds.filter(Boolean)
    : [];
  const selectedIdsFromService = Array.isArray(service?.assignedPassengerIds)
    ? service.assignedPassengerIds.filter(Boolean)
    : [];
  const selectedIds =
    selectedIdsFromSelection.length > 0
      ? selectedIdsFromSelection
      : selectedIdsFromService.length > 0
        ? selectedIdsFromService
        : allPassengerIds;

  const assignedChildExplicitPriceMap =
    baseSelection?.assignedChildExplicitPriceMap ||
    baseSelection?.childPriceMap ||
    service?.assignedChildExplicitPriceMap ||
    {};
  const convertedChildToAdultMap =
    baseSelection?.convertedChildToAdultMap ||
    service?.convertedChildToAdultMap ||
    {};
  const childExplicitPriceSum = Object.entries(
    assignedChildExplicitPriceMap,
  ).reduce(
    (sum, [id, value]) =>
      convertedChildToAdultMap?.[id] ? sum : sum + (Number(value) || 0),
    0,
  );

  return {
    ...baseSelection,
    selectedIds,
    selectedPassengers: baseSelection?.selectedPassengers || [],
    assignedPassengerCount: selectedIds.length,
    assignedChildExplicitPriceMap,
    childPriceMap:
      baseSelection?.childPriceMap || assignedChildExplicitPriceMap || {},
    assignedChildExplicitPriceSum: round2(childExplicitPriceSum),
    assignedChildExplicitCount: Object.keys(assignedChildExplicitPriceMap)
      .length,
    pricingMode:
      baseSelection?.pricingMode || service?.pricingMode || "percentage",
    childPercentageMap:
      baseSelection?.childPercentageMap || service?.childPercentageMap || {},
    uniformPercentage:
      baseSelection?.uniformPercentage || service?.uniformPercentage || "",
    treatChildrenAsAdults:
      baseSelection?.treatChildrenAsAdults === true ||
      service?.treatChildrenAsAdults === true,
    convertedChildToAdultMap,
    adultIds,
    childIds,
  };
};

const canonicalizePassengerIdsForPeople = (ids = [], peopleDetails = {}) => {
  const { allPassengerIds } = getPassengerIdsByType(peopleDetails);
  const currentIdBySlot = new Map(
    allPassengerIds.map((id) => [getPassengerSlotKey(id), id]),
  );
  const bySlot = new Map();

  (Array.isArray(ids) ? ids : []).filter(Boolean).forEach((rawId) => {
    const slot = getPassengerSlotKey(rawId);
    const currentId = currentIdBySlot.get(slot);
    if (!currentId) return;
    bySlot.set(slot, currentId);
  });

  return [...bySlot.values()];
};

const canonicalizeChildMapForSelection = (
  rawMap = {},
  selectedIds = [],
  peopleDetails = {},
  { numeric = false } = {},
) => {
  const selectedChildBySlot = new Map(
    canonicalizePassengerIdsForPeople(selectedIds, peopleDetails)
      .filter((id) => String(id).startsWith("child:"))
      .map((id) => [getPassengerSlotKey(id), id]),
  );

  return Object.entries(rawMap || {}).reduce((result, [rawKey, rawValue]) => {
    const rawChildId = String(rawKey).startsWith("child:")
      ? String(rawKey)
      : typeof rawValue === "string" && rawValue.startsWith("child:")
        ? rawValue
        : null;
    if (!rawChildId) return result;

    const currentChildId = selectedChildBySlot.get(
      getPassengerSlotKey(rawChildId),
    );
    if (!currentChildId) return result;

    if (numeric) {
      const parsed = Number(rawValue);
      if (Number.isFinite(parsed)) result[currentChildId] = parsed;
      return result;
    }

    if (rawValue) result[currentChildId] = true;
    return result;
  }, {});
};

/**
 * El pago debe usar exactamente los beneficiarios del servicio cotizado.
 * La tarifa del proveedor es independiente: los niños comienzan en cero y el
 * usuario decide si pagan una tarifa propia o la tarifa de adulto.
 */
const buildPaymentPassengerSelection = (service = {}, peopleDetails = {}) => {
  const hydratedService = hydrateServiceFromDB(service) || service;
  const sourceSelection = getPassengerSelection(
    hydratedService,
    peopleDetails,
  );
  const beneficiaryIds = [
    ...(Array.isArray(hydratedService?.beneficiariosAdultos)
      ? hydratedService.beneficiariosAdultos.map((entry) => entry?.id)
      : []),
    ...(Array.isArray(hydratedService?.beneficiariosNinos)
      ? hydratedService.beneficiariosNinos.map((entry) => entry?.id)
      : []),
  ].filter(Boolean);
  const selectedIds = canonicalizePassengerIdsForPeople(
    beneficiaryIds.length > 0
      ? beneficiaryIds
      : sourceSelection.selectedIds || [],
    peopleDetails,
  );
  const fallbackIds = canonicalizePassengerIdsForPeople(
    getPassengerIdsByType(peopleDetails).allPassengerIds,
    peopleDetails,
  );
  const effectiveSelectedIds = selectedIds.length > 0 ? selectedIds : fallbackIds;

  return {
    selectedIds: effectiveSelectedIds,
    assignedPassengerCount: effectiveSelectedIds.length,
    pricingMode: "percentage",
    childPriceMap: {},
    assignedChildExplicitPriceMap: {},
    assignedChildExplicitPriceSum: 0,
    assignedChildExplicitCount: 0,
    childPercentageMap: {},
    uniformPercentage: "",
    treatChildrenAsAdults: false,
    convertedChildToAdultMap: {},
  };
};

const reconcilePaymentPassengerSelection = (
  currentSelection = {},
  sourceSelection = {},
  peopleDetails = {},
) => {
  const selectedIds = canonicalizePassengerIdsForPeople(
    sourceSelection.selectedIds || [],
    peopleDetails,
  );
  const selectedChildIds = selectedIds.filter((id) =>
    String(id).startsWith("child:"),
  );
  const treatChildrenAsAdults =
    currentSelection.treatChildrenAsAdults === true ||
    currentSelection.pricingMode === "adult";
  const convertedChildToAdultMap = treatChildrenAsAdults
    ? selectedChildIds.reduce((result, id) => {
        result[id] = true;
        return result;
      }, {})
    : canonicalizeChildMapForSelection(
        currentSelection.convertedChildToAdultMap || {},
        selectedIds,
        peopleDetails,
      );
  const convertedSlots = new Set(
    Object.keys(convertedChildToAdultMap).map(getPassengerSlotKey),
  );
  const assignedChildExplicitPriceMap = Object.fromEntries(
    Object.entries(
      canonicalizeChildMapForSelection(
        currentSelection.assignedChildExplicitPriceMap ||
          currentSelection.childPriceMap ||
          {},
        selectedIds,
        peopleDetails,
        { numeric: true },
      ),
    ).filter(([id]) => !convertedSlots.has(getPassengerSlotKey(id))),
  );
  const childPercentageMap = Object.fromEntries(
    Object.entries(
      canonicalizeChildMapForSelection(
        currentSelection.childPercentageMap || {},
        selectedIds,
        peopleDetails,
        { numeric: true },
      ),
    ).filter(([id]) => !convertedSlots.has(getPassengerSlotKey(id))),
  );
  const assignedChildExplicitPriceSum = round2(
    Object.values(assignedChildExplicitPriceMap).reduce(
      (sum, value) => sum + (Number(value) || 0),
      0,
    ),
  );
  const assignedChildExplicitCount = Object.keys(
    assignedChildExplicitPriceMap,
  ).length;

  return {
    ...sourceSelection,
    ...currentSelection,
    selectedIds,
    assignedPassengerCount: selectedIds.length,
    pricingMode: treatChildrenAsAdults
      ? "adult"
      : currentSelection.pricingMode || sourceSelection.pricingMode || "percentage",
    childPriceMap: assignedChildExplicitPriceMap,
    assignedChildExplicitPriceMap,
    assignedChildExplicitPriceSum,
    assignedChildExplicitCount,
    childPercentageMap,
    uniformPercentage: currentSelection.uniformPercentage || "",
    treatChildrenAsAdults,
    convertedChildToAdultMap,
  };
};

const isChildTreatedAsAdult = (selection = {}, childId) => {
  const value = String(childId || "");
  if (!value.startsWith("child:")) return false;
  return Boolean(
    selection.treatChildrenAsAdults ||
    selection.pricingMode === "adult" ||
    selection.convertedChildToAdultMap?.[value],
  );
};

const getBillableAdultIds = (selection = {}) =>
  (selection.selectedIds || []).filter((id) => {
    const value = String(id || "");
    if (value.startsWith("adult:")) return true;
    return (
      value.startsWith("child:") && isChildTreatedAsAdult(selection, value)
    );
  });

const getBillableAdultCount = (selection = {}) => {
  const idsCount = getBillableAdultIds(selection).length;
  if (idsCount > 0) return idsCount;

  const total = Number(selection.assignedPassengerCount || 0);
  const children = Number(selection.childIds?.length || 0);
  if (selection.treatChildrenAsAdults || selection.pricingMode === "adult") {
    return Math.max(1, total);
  }
  return Math.max(1, total - children);
};

const getPercentageChildTotal = (selection = {}, adultUnit = 0) =>
  (selection.selectedIds || []).reduce((sum, id) => {
    const value = String(id || "");
    if (!value.startsWith("child:")) return sum;
    if (isChildTreatedAsAdult(selection, value)) return sum;

    const percent = Number(
      selection.childPercentageMap?.[value] ?? selection.uniformPercentage ?? 0,
    );
    return sum + (Number.isFinite(percent) ? (adultUnit * percent) / 100 : 0);
  }, 0);

const getExplicitChildTotal = (selection = {}) =>
  Object.entries(selection.assignedChildExplicitPriceMap || {}).reduce(
    (sum, [id, value]) =>
      isChildTreatedAsAdult(selection, id) ? sum : sum + (Number(value) || 0),
    0,
  );

const getPayableAmount = (
  service = {},
  peopleDetails = {},
  serviceType = "",
) => {
  const tariff = getTariff(service);
  const normalizedType = String(
    serviceType || getServiceType(service),
  ).toLowerCase();
  const isPayablePerPassenger = ["vuelos", "trenes", "tickets"].includes(
    normalizedType,
  );
  const selection = getPassengerSelection(service, peopleDetails);
  const adultUnit = Number(
    tariff?.precio ?? service?.precioServicio ?? service?.precio_tarifa ?? 0,
  );
  const trustedAssignedTotal = Number(
    service?.assignedPrecioTotal ?? service?.assigned_precio_total ?? 0,
  );

  if (isPayablePerPassenger) {
    if (service?._trustAssignedTotal && trustedAssignedTotal > 0) {
      return round2(trustedAssignedTotal);
    }

    const adultTotal = round2(adultUnit * getBillableAdultCount(selection));
    const explicitChildTotal = round2(getExplicitChildTotal(selection));
    const childTotal =
      selection.assignedChildExplicitCount > 0
        ? explicitChildTotal
        : round2(getPercentageChildTotal(selection, adultUnit));

    return round2(adultTotal + childTotal);
  }

  const explicitTotal = Number(
    tariff?.precio_original_with_child_extras ??
      service?.assignedPrecioServicio ??
      service?.assigned_precio_servicio,
  );
  if (Number.isFinite(explicitTotal) && explicitTotal > 0) {
    return round2(explicitTotal);
  }

  const adultTotal = round2(adultUnit * getBillableAdultCount(selection));
  const childTotal = round2(getExplicitChildTotal(selection));

  const fallbackTotal = Number(tariff?.precio_original ?? 0);
  return round2(adultTotal + childTotal || fallbackTotal || adultUnit || 0);
};

/**
 * Obtiene el ingreso cotizado del vuelo original seleccionado.
 *
 * La fuente de venta puede llegar en formato runtime (tariff /
 * passengerSelection) o en el formato plano de itinerario_servicio
 * (precioServicio, precioTotal, beneficiariosAdultos y beneficiariosNinos).
 * hydrateServiceFromDB unifica ambos formatos usando la misma lógica aplicada
 * por EdicionCotizacion y SummaryContent, sin mezclar los campos assigned_* que
 * representan el costo real que se pagará al proveedor.
 */
const getQuotedFlightBreakdown = (service = {}, peopleDetails = {}) => {
  if (!service || typeof service !== "object") return null;

  const hydratedService = hydrateServiceFromDB(service) || service;
  const tariff = getTariff(hydratedService);
  const passengerSelection = getPassengerSelection(
    hydratedService,
    peopleDetails,
  );
  const fallbackPassengerIds = getPassengerIdsByType(peopleDetails);
  const selectedIds = Array.isArray(passengerSelection.selectedIds)
    ? passengerSelection.selectedIds.filter(Boolean)
    : [];
  const passengerIds =
    selectedIds.length > 0
      ? selectedIds
      : fallbackPassengerIds.allPassengerIds || [];
  const adultUnit = round2(
    Number(
      tariff?.precio ??
        hydratedService?.precioServicio ??
        hydratedService?.precio_servicio ??
        0,
    ),
  );
  const explicitChildPriceMap =
    passengerSelection.assignedChildExplicitPriceMap ||
    passengerSelection.childPriceMap ||
    {};
  const childPercentageMap = passengerSelection.childPercentageMap || {};

  let adultCount = 0;
  let childCount = 0;
  let childTotal = 0;

  passengerIds.forEach((passengerId) => {
    const id = String(passengerId || "");
    if (id.startsWith("adult:")) {
      adultCount += 1;
      return;
    }
    if (!id.startsWith("child:")) return;

    childCount += 1;
    if (isChildTreatedAsAdult(passengerSelection, id)) {
      childTotal += adultUnit;
      return;
    }

    if (Object.prototype.hasOwnProperty.call(explicitChildPriceMap, id)) {
      childTotal += Number(explicitChildPriceMap[id]) || 0;
      return;
    }

    const percentage = Number(
      childPercentageMap[id] ?? passengerSelection.uniformPercentage ?? 0,
    );
    if (Number.isFinite(percentage)) {
      childTotal += (adultUnit * percentage) / 100;
    }
  });

  // Los servicios antiguos pueden no conservar selectedIds. En ese caso la
  // cantidad real de pasajeros de la cotización sigue siendo el mejor fallback.
  if (adultCount === 0 && childCount === 0) {
    adultCount = fallbackPassengerIds.adultIds?.length || 0;
    childCount = fallbackPassengerIds.childIds?.length || 0;
  }

  const adultTotal = round2(adultUnit * adultCount);
  const quotedTotal = round2(
    getPayableAmount(hydratedService, peopleDetails, "vuelos"),
  );

  // precioTotal es la cifra canónica de venta. Cuando existe, el residuo luego
  // de los adultos permite mantener exacto el total infantil incluso en datos
  // legacy con IDs child:* de distinta generación.
  if (quotedTotal > 0 && childCount > 0) {
    const reconciledChildTotal = round2(quotedTotal - adultTotal);
    if (reconciledChildTotal >= 0) childTotal = reconciledChildTotal;
  }

  childTotal = round2(childTotal);
  const childUnit = childCount > 0 ? round2(childTotal / childCount) : 0;
  const effectiveTotal = quotedTotal || round2(adultTotal + childTotal);

  return {
    adultUnit,
    adultCount,
    childUnit,
    childCount,
    childTotal,
    total: effectiveTotal,
    hasQuoteData: effectiveTotal > 0 || adultUnit > 0 || childTotal > 0,
  };
};

const getDisplayNameForPassengerId = (id, peopleDetails = {}) => {
  const value = String(id || "");
  const isChild = value.startsWith("child:");
  const indexMatch = value.match(/^(adult|child):(\d+)/);
  const index = indexMatch ? Number(indexMatch[2]) : -1;
  const list = isChild
    ? peopleDetails.children || []
    : peopleDetails.adults || [];
  const person = list[index] || {};

  return (
    person.nombres ||
    person.nombre ||
    person.name ||
    person.fullName ||
    (isChild ? `Niño ${index + 1}` : `Adulto ${index + 1}`)
  );
};

const normalizePaymentService = ({
  service = {},
  peopleDetails = {},
  serviceType = "vuelos",
  passengerSelectionOverride = null,
}) => {
  const parentService =
    service.parentService || service.assignedParentService || service;
  const childService =
    service.childService || service.assignedChildService || {};
  const tariff = getTariff(service);
  const passengerSelection = getPassengerSelection(
    {
      ...service,
      passengerSelection:
        passengerSelectionOverride || service.passengerSelection,
    },
    peopleDetails,
  );
  const unitPrice = Number(
    tariff?.precio ??
      service?.precioServicio ??
      service?.precio_tarifa ??
      tariff?.precio_original ??
      0,
  );

  const normalizedTariff = {
    ...tariff,
    precio: unitPrice,
    precio_original: unitPrice,
    precio_original_with_child_extras: undefined,
  };

  const normalized = createUnifiedService(
    {
      ...parentService,
      typeService: parentService.typeService || serviceType,
    },
    childService,
    normalizedTariff,
    peopleDetails,
    tariff?.tipo_tarifa || childService?.packageType || "compartido",
    passengerSelection,
  );

  return {
    ...normalized,
    parentService,
    childService,
    passengerSelection: {
      ...passengerSelection,
      ...(normalized.passengerSelection || {}),
    },
    assignedPassengerSelection: {
      ...passengerSelection,
      ...(normalized.assignedPassengerSelection ||
        normalized.passengerSelection ||
        {}),
    },
  };
};

const getServicioId = (service = {}) => {
  const id = service?.servicioId || service?.servicio_id || service?.db_id;
  const numericId = Number(id);
  return Number.isFinite(numericId) && numericId > 0 ? numericId : null;
};

const getParentId = (parent = {}) =>
  parent?.id_hotel ||
  parent?.id_transporte ||
  parent?.id_tren ||
  parent?.id_vuelo ||
  parent?.guia?.id_guia ||
  parent?.id_guia ||
  parent?.id_endose ||
  null;

const getChildId = (child = {}, selectedService = {}) =>
  child?.id_habitacion ||
  child?.id_movilidad ||
  child?.id_vagon ||
  child?.idtipo_vuelo ||
  child?.id_ruta ||
  child?.id_tipotour ||
  child?.restaurante?.id_restaurante ||
  child?.id_restaurante ||
  child?.ticket?.id_ticket ||
  child?.id_ticket ||
  child?.id_servicio_extra ||
  child?.servicio_extra?.id ||
  selectedService?.id_servicio_extra ||
  selectedService?.servicio_extra?.id ||
  null;

const normalizeAssignedService = (service = {}) => {
  if (service?.assignedService) {
    const assignedUnitPrice =
      service.assignedPrecioServicio ??
      service.assigned_precio_servicio ??
      service.assignedService.assignedPrecioServicio ??
      service.assignedService.assigned_precio_servicio;
    const assignedTotalPrice =
      service.assignedPrecioTotal ??
      service.assigned_precio_total ??
      service.assignedService.assignedPrecioTotal ??
      service.assignedService.assigned_precio_total;

    return {
      ...service.assignedService,
      _trustAssignedTotal: Number(assignedTotalPrice || 0) > 0,
      assignedPrecioServicio: assignedUnitPrice,
      assigned_precio_servicio: assignedUnitPrice,
      assignedPrecioTotal: assignedTotalPrice,
      assigned_precio_total: assignedTotalPrice,
    };
  }
  if (!service?.isAssigned) return null;

  const tariff = {
    moneda: service.assignedMoneda || service.assigned_moneda,
    precio: Number(
      service.assignedPrecioServicio || service.assigned_precio_servicio || 0,
    ),
    precio_original: Number(
      service.assignedPrecioServicio || service.assigned_precio_servicio || 0,
    ),
    tieneIgv: Boolean(service.assignedIgv || service.assigned_igv),
    precioAdultoDividido: Boolean(
      service.assignedPrecioAdultoDividido ||
      service.assigned_precio_adulto_dividido,
    ),
  };

  return {
    id: `assigned-${service.servicioId || service.id || "service"}`,
    _trustAssignedTotal:
      Number(service.assignedPrecioTotal ?? service.assigned_precio_total ?? 0) >
      0,
    assignedPrecioServicio: service.assignedPrecioServicio,
    assigned_precio_servicio: service.assigned_precio_servicio,
    assignedPrecioTotal:
      service.assignedPrecioTotal ?? service.assigned_precio_total,
    assigned_precio_total:
      service.assigned_precio_total ?? service.assignedPrecioTotal,
    typeService: getServiceType(service),
    parentService: service.assignedParentService || service.parentService || {},
    childService: service.assignedChildService || service.childService || {},
    tariff,
    assignedPassengerSelection:
      service.assignedPassengerSelection || service.passengerSelection || null,
  };
};

const buildServicesByDay = (itinerary = [], type) =>
  parseJsonArray(itinerary)
    .map((day, dayIndex) => {
      const allServices = Array.isArray(day?.servicios) ? day.servicios : [];
      const services = allServices
        .map((service, serviceIndex) => ({
          ...service,
          _sourceDayIndex: dayIndex,
          _sourceServiceIndex: serviceIndex,
        }))
        .filter((service) => isType(service, type));

      if (!services.length) return null;

      return {
        dayNumber: day?.numero || dayIndex + 1,
        dayData: day,
        services,
        flights: services,
      };
    })
    .filter(Boolean);

const getServiceGroupKey = (service = {}, fallback = "") => {
  const serviceId = getServicioId(service);
  if (serviceId) return `svc:${serviceId}`;

  const parentService =
    service.parentService || service.assignedParentService || service || {};
  const childService =
    service.childService || service.assignedChildService || {};
  return [
    fallback,
    getServiceType(service),
    getParentId(parentService) || "",
    getChildId(childService, service) || "",
    service?.sourceItinerary || service?.source_itinerary || "",
  ].join(":");
};

const mergeServiceGroupsByDay = (primaryGroups = [], fallbackGroups = []) => {
  const byDay = new Map();

  [...primaryGroups, ...fallbackGroups].forEach((group, groupIndex) => {
    if (!group) return;
    const dayNumber =
      Number(group.dayNumber || group.dayData?.numero || 0) || groupIndex + 1;
    const current =
      byDay.get(dayNumber) || {
        ...group,
        dayNumber,
        services: [],
        flights: [],
      };
    const seen = new Set(
      current.services.map((service, index) =>
        getServiceGroupKey(service, `${dayNumber}:${index}`),
      ),
    );
    const nextServices = [...current.services];

    parseJsonArray(group.services || group.flights).forEach((service, index) => {
      const key = getServiceGroupKey(service, `${dayNumber}:${index}`);
      if (seen.has(key)) return;
      seen.add(key);
      nextServices.push(service);
    });

    byDay.set(dayNumber, {
      ...group,
      ...current,
      dayNumber,
      services: nextServices,
      flights: nextServices,
    });
  });

  return Array.from(byDay.values()).sort(
    (left, right) => Number(left.dayNumber || 0) - Number(right.dayNumber || 0),
  );
};

const hasAssignedServiceData = (service = {}) =>
  service?.isAssigned === true &&
  Boolean(
    service.assignedService ||
      service.assignedParentService ||
      service.assignedChildService ||
      service.assigned_parent_id ||
      service.assigned_child_id,
  );

const isSameItineraryService = (left = {}, right = {}) => {
  const leftId = getServicioId(left);
  const rightId = getServicioId(right);
  if (leftId && rightId) return leftId === rightId;

  return (
    getServiceGroupKey(left, "") === getServiceGroupKey(right, "")
  );
};

const getRequestForService = (requests = [], service = {}) => {
  const servicioId = getServicioId(service);
  if (!servicioId) return null;
  return (
    requests.find(
      (request) =>
        Number(request.itinerario_servicio_id) === servicioId &&
        !["cancelled", "canceled"].includes(
          String(request?.status || request?.estado || "").toLowerCase(),
        ),
    ) || null
  );
};

const getPaymentStatusFromRequest = (request = null) =>
  request?.status || request?.estado || null;

const PAYMENT_STATUS_WEIGHT = {
  cancelled: 0,
  rejected: 0,
  pending: 1,
  requested: 1,
  approved: 2,
  completed: 3,
  paid: 3,
};

const getPaymentRequestKey = (request = {}) => {
  const serviceId = Number(request?.itinerario_servicio_id);
  if (Number.isFinite(serviceId) && serviceId > 0) return `svc:${serviceId}`;

  const requestId =
    request?.id || request?.payment_request_id || request?.notification_id;
  return requestId ? `id:${requestId}` : null;
};

const pickPaymentStatus = (currentStatus, incomingStatus) => {
  const current = currentStatus || null;
  const incoming = incomingStatus || null;
  if (!current) return incoming;
  if (!incoming) return current;

  const currentWeight = PAYMENT_STATUS_WEIGHT[current] ?? 0;
  const incomingWeight = PAYMENT_STATUS_WEIGHT[incoming] ?? 0;
  return incomingWeight >= currentWeight ? incoming : current;
};

const mergePaymentRequest = (current = {}, incoming = {}) => {
  const status = pickPaymentStatus(
    getPaymentStatusFromRequest(current),
    getPaymentStatusFromRequest(incoming),
  );
  return {
    ...current,
    ...incoming,
    ...(status ? { status, estado: status } : {}),
  };
};

const mergePaymentRequests = (current = [], incoming = []) => {
  const byKey = new Map();

  [...parseJsonArray(current), ...parseJsonArray(incoming)].forEach(
    (request) => {
      const key = getPaymentRequestKey(request);
      if (!key) return;
      byKey.set(key, mergePaymentRequest(byKey.get(key), request));
    },
  );

  return Array.from(byKey.values());
};

const markPaymentRequestAsPaid = (requests = [], service = {}) => {
  const serviceId = getServicioId(service);
  if (!serviceId) return requests;

  return parseJsonArray(requests).map((request) =>
    Number(request?.itinerario_servicio_id) === serviceId
      ? mergePaymentRequest(request, { status: "paid", estado: "paid" })
      : request,
  );
};

const normalizeReservaResponseArray = (response) =>
  Array.isArray(response)
    ? response
    : Array.isArray(response?.data)
      ? response.data
      : [];

const normalizeEntityResponseArray = (response) => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.data)) return response.data.data;
  return [];
};

const normalizeCreatedEntity = (response) =>
  response?.data?.data || response?.data || response || null;

const normalizeFlightOrigin = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.startsWith("nac")) return "nacional";
  if (normalized.startsWith("int")) return "internacional";
  return normalized || "nacional";
};

const formatFlightOriginLabel = (value = "") =>
  normalizeFlightOrigin(value) === "internacional" ? "Internacional" : "Nacional";

const normalizeFlightText = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const uniqueFlightValues = (items = [], getter) =>
  Array.from(
    new Set(
      items
        .map((item) => String(getter(item) || "").trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, "es"));

const FLIGHT_TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hours = String(Math.floor(index / 2)).padStart(2, "0");
  const minutes = index % 2 === 0 ? "00" : "30";
  return `${hours}:${minutes}`;
});

const FLIGHT_BAGGAGE_DEFAULT_OPTIONS = [
  "Sin equipaje",
  "Equipaje de mano",
  "Mochila",
  "10kg + cabina",
  "20kg",
  "23kg",
  "23kg + cabina",
];

const getFlightId = (flight = {}) =>
  flight?.id_vuelo || flight?.idVuelo || flight?.id || null;

const getFlightTypeId = (flightType = {}) =>
  flightType?.idtipo_vuelo ||
  flightType?.id_tipo_vuelo ||
  flightType?.idTipoVuelo ||
  flightType?.id ||
  null;

const buildManualFlightService = ({
  flight = {},
  flightType = {},
  price = 0,
  peopleDetails = {},
  passengerSelectionOverride = null,
}) => {
  const unitPrice = round2(price);
  const { allPassengerIds } = getPassengerIdsByType(peopleDetails);
  const passengerSelection = passengerSelectionOverride || {
    selectedIds: allPassengerIds,
    assignedPassengerCount: allPassengerIds.length,
    pricingMode: "percentage",
    childPriceMap: {},
    assignedChildExplicitPriceMap: {},
    assignedChildExplicitPriceSum: 0,
    assignedChildExplicitCount: 0,
    childPercentageMap: {},
    uniformPercentage: "",
    treatChildrenAsAdults: false,
    convertedChildToAdultMap: {},
  };
  const parentService = {
    ...flight,
    id_vuelo: getFlightId(flight),
    nombre: flight?.nombre || flight?.aerolinea || "Vuelo",
    procedencia: normalizeFlightOrigin(flight?.procedencia),
    typeService: "vuelos",
    tipo_servicio: "vuelos",
  };
  const childService = {
    ...flightType,
    idtipo_vuelo: getFlightTypeId(flightType),
    tipovuelo:
      flightType?.tipovuelo ||
      flightType?.tipo_vuelo ||
      flightType?.nombre ||
      "Tipo de vuelo",
    packageType: "compartido",
  };
  const tariff = {
    id_tarifa: `manual-flight-${getFlightTypeId(childService) || "new"}`,
    tipo_tarifa: "interna",
    moneda: "dolares",
    precio: unitPrice,
    precio_original: unitPrice,
    precio_compartido: unitPrice,
    precio_privado: unitPrice,
    precio_unico: true,
    precio_adulto_dividido: false,
    capacidad_limite: false,
  };

  return normalizePaymentService({
    service: {
      parentService,
      childService,
      tariff,
      passengerSelection,
    },
    peopleDetails,
    serviceType: "vuelos",
    passengerSelectionOverride: passengerSelection,
  });
};

const calculateAssignedServicePrice = (
  passengerSelection = {},
  tariff = {},
  serviceType = "vuelos",
) => {
  const selectedIds = Array.isArray(passengerSelection.selectedIds)
    ? passengerSelection.selectedIds
    : [];
  const convertedMap = passengerSelection.convertedChildToAdultMap || {};
  const childPriceMap = passengerSelection.assignedChildExplicitPriceMap || {};
  const treatAsAdults = passengerSelection.treatChildrenAsAdults === true;

  const adultUnitPrice = round2(
    Number(tariff?.precio || tariff?.precio_original || 0),
  );

  // Contar adultos incluyendo niños convertidos a adulto
  const adultCount = selectedIds.filter(
    (id) =>
      String(id).startsWith("adult:") ||
      (String(id).startsWith("child:") && (treatAsAdults || convertedMap[id])),
  ).length;

  // Total de niños con precios explícitos (no convertidos)
  const childTotal = round2(
    selectedIds
      .filter(
        (id) =>
          String(id).startsWith("child:") &&
          !treatAsAdults &&
          !convertedMap[id],
      )
      .reduce((sum, id) => sum + Number(childPriceMap[id] || 0), 0),
  );

  const billableAdultCount = selectedIds.length === 0 ? 1 : adultCount;
  const adultoTotal = round2(adultUnitPrice * billableAdultCount);
  const precioServicio = round2(adultoTotal + childTotal);

  return precioServicio;
};

const buildAssignmentPayload = (
  selectedService = {},
  peopleDetails = {},
  serviceType = "vuelos",
) => {
  const normalizedService = normalizePaymentService({
    service: selectedService,
    peopleDetails,
    serviceType,
  });
  const parentService =
    selectedService.parentService ||
    selectedService.assignedParentService ||
    selectedService ||
    {};
  const childService =
    selectedService.childService || selectedService.assignedChildService || {};
  const tariff = normalizedService.tariff || selectedService.tariff || {};
  const passengerSelection = getPassengerSelection(
    normalizedService,
    peopleDetails,
  );

  const selectedIds = Array.isArray(passengerSelection.selectedIds)
    ? passengerSelection.selectedIds
    : [];
  const childPriceMap =
    passengerSelection.assignedChildExplicitPriceMap ||
    selectedService.assignedChildExplicitPriceMap ||
    {};

  const selectedAdultBeneficiaries = selectedIds
    .filter(
      (id) =>
        typeof id === "string" &&
        (id.startsWith("adult:") ||
          isChildTreatedAsAdult(passengerSelection, id)),
    )
    .map((id) => {
      const entry = { id };
      if (String(id).startsWith("child:")) {
        entry.child_origin =
          passengerSelection.convertedChildToAdultMap?.[id] || id;
      }
      return entry;
    });
  const selectedChildBeneficiaries = selectedIds
    .filter(
      (id) =>
        typeof id === "string" &&
        id.startsWith("child:") &&
        !isChildTreatedAsAdult(passengerSelection, id),
    )
    .map((id) => ({
      id,
      precio: Number(childPriceMap[id] || 0),
    }));

  const adultos =
    selectedIds.length > 0
      ? selectedAdultBeneficiaries
      : normalizedService.assignedBeneficiariosAdultos ||
        normalizedService.beneficiariosAdultos ||
        [];
  const ninos =
    selectedIds.length > 0
      ? selectedChildBeneficiaries
      : normalizedService.assignedBeneficiariosNinos ||
        normalizedService.beneficiariosNinos ||
        [];

  // Calcular precio usando la misma lógica que SortableService
  const assignedTotalPrice = calculateAssignedServicePrice(
    passengerSelection,
    tariff,
    serviceType,
  );
  const assignedUnitPrice = round2(
    Number(
      tariff?.precio ??
        tariff?.precio_original ??
        selectedService?.precioServicio ??
        selectedService?.precio_servicio ??
        0,
    ),
  );

  // Construir assignedPassengerSelection completo para preservar estado de pricing
  const assignedPassengerSelection = {
    selectedIds,
    assignedPassengerCount: selectedIds.length,
    assignedChildExplicitPriceMap:
      passengerSelection.assignedChildExplicitPriceMap || {},
    assignedChildExplicitPriceSum:
      passengerSelection.assignedChildExplicitPriceSum || 0,
    assignedChildExplicitCount:
      passengerSelection.assignedChildExplicitCount || 0,
    pricingMode: passengerSelection.pricingMode || "percentage",
    childPercentageMap: passengerSelection.childPercentageMap || {},
    uniformPercentage: passengerSelection.uniformPercentage || "",
    treatChildrenAsAdults: passengerSelection.treatChildrenAsAdults || false,
    convertedChildToAdultMap: passengerSelection.convertedChildToAdultMap || {},
  };

  return {
    assigned_parent_id: getParentId(parentService),
    assigned_child_id: getChildId(childService, selectedService),
    assigned_moneda: tariff.moneda || selectedService.moneda || "dolares",
    assigned_precio_servicio: assignedUnitPrice,
    assigned_precio_total: assignedTotalPrice,
    assigned_igv: Boolean(tariff.tieneIgv || tariff.tiene_igv),
    assigned_precio_adulto_dividido: Boolean(
      tariff.precioAdultoDividido ||
      tariff.precio_adulto_dividido ||
      selectedService.precioAdultoDividido,
    ),
    assigned_capacidad_limite: Boolean(
      tariff.capacidadLimite ||
      tariff.capacidad_limite ||
      selectedService.capacidadLimite,
    ),
    assigned_beneficiarios_adultos: adultos,
    assigned_beneficiarios_ninos: ninos,
    assigned_passenger_selection: assignedPassengerSelection,
    assignedPassengerSelection: assignedPassengerSelection,
    hora: selectedService.hora || null,
    is_assigned: true,
  };
};

const FlightPaymentModal = ({
  isOpen,
  onClose,
  flightsByDay = [],
  servicesByDay = null,
  serviceType = "vuelos",
  cotizacionData,
  passengerData,
  voucherId,
  voucherCode,
  onPaymentSuccess,
}) => {
  const config = SERVICE_CONFIG[serviceType] || SERVICE_CONFIG.vuelos;
  const cotizacionPeopleDetails = useMemo(
    () =>
      normalizePeopleDetails(
        hasPassengerRows(passengerData) ? passengerData : cotizacionData,
      ),
    [cotizacionData, passengerData],
  );
  const totalCotizacionPassengers = useMemo(
    () => getTotalPassengerCount(cotizacionPeopleDetails),
    [cotizacionPeopleDetails],
  );
  const [selectedDayIndex, setSelectedDayIndex] = useState(null);
  const [selectedServiceIndex, setSelectedServiceIndex] = useState(null);
  const [selectedServiceKey, setSelectedServiceKey] = useState(null);
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [assignedService, setAssignedService] = useState(null);
  const [showMovimientoForm, setShowMovimientoForm] = useState(false);
  const [selectedMovimiento, setSelectedMovimiento] = useState(null);
  const [mediaEditMovimiento, setMediaEditMovimiento] = useState(null);
  const [loadingPaidMovementAction, setLoadingPaidMovementAction] = useState(null);
  const [voucherReservaId, setVoucherReservaId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [existingVoucherReserva, setExistingVoucherReserva] = useState(null);
  const [isLoadingVoucherReserva, setIsLoadingVoucherReserva] = useState(true);
  const [existingAssignment, setExistingAssignment] = useState(null);
  const [existingPaymentRequest, setExistingPaymentRequest] = useState(null);
  const [paymentRequestStatus, setPaymentRequestStatus] = useState(null);
  const [reservationPaymentRequests, setReservationPaymentRequests] = useState(
    [],
  );
  const [normalizedItinerary, setNormalizedItinerary] = useState([]);
  const [assignedAdultPriceDraft, setAssignedAdultPriceDraft] = useState("");
  const [flightCatalog, setFlightCatalog] = useState([]);
  const [flightTypes, setFlightTypes] = useState([]);
  const [allFlightTypes, setAllFlightTypes] = useState([]);
  const [selectedFlightId, setSelectedFlightId] = useState("");
  const [selectedFlightTypeId, setSelectedFlightTypeId] = useState("");
  const [isLoadingFlightCatalog, setIsLoadingFlightCatalog] = useState(false);
  const [isSavingFlightCatalog, setIsSavingFlightCatalog] = useState(false);
  const [showNewFlightForm, setShowNewFlightForm] = useState(false);
  const [showNewFlightTypeForm, setShowNewFlightTypeForm] = useState(false);
  const [newFlightDraft, setNewFlightDraft] = useState({
    nombre: "",
    procedencia: "nacional",
  });
  const [newFlightTypeDraft, setNewFlightTypeDraft] = useState({
    tipovuelo: "",
    lugar_ida: "",
    lugar_vuelta: "",
    hora_salida: "",
    hora_llegada: "",
    equipaje: "",
  });
  const [confirmingCancelId, setConfirmingCancelId] = useState(null);
  const [cancellingPaymentId, setCancellingPaymentId] = useState(null);
  const cancelTimerRef = useRef(null);

  const inputServicesByDay = servicesByDay || flightsByDay;
  const sourceServicesByDay = useMemo(() => {
    const normalized = buildServicesByDay(normalizedItinerary, serviceType);
    return mergeServiceGroupsByDay(normalized, inputServicesByDay);
  }, [inputServicesByDay, normalizedItinerary, serviceType]);

  const loadFlightCatalog = useCallback(async () => {
    if (serviceType !== "vuelos") return;
    setIsLoadingFlightCatalog(true);
    try {
      const response = await fetchVuelos();
      const flights = normalizeEntityResponseArray(response);
      setFlightCatalog(flights);

      try {
        const typeResponse = await fetchTiposVuelo();
        const globalTypes = normalizeEntityResponseArray(typeResponse);

        if (globalTypes.length > 0) {
          setAllFlightTypes(globalTypes);
        } else {
          const typeGroups = await Promise.all(
            flights
              .map((flight) => getFlightId(flight))
              .filter(Boolean)
              .map((flightId) =>
                fetchTipoVueloByVuelo(flightId)
                  .then(normalizeEntityResponseArray)
                  .catch(() => []),
              ),
          );
          setAllFlightTypes(typeGroups.flat());
        }
      } catch (typeError) {
        console.warn(
          "No se pudo cargar el catálogo global de tipos de vuelo:",
          typeError,
        );
        const typeGroups = await Promise.all(
          flights
            .map((flight) => getFlightId(flight))
            .filter(Boolean)
            .map((flightId) =>
              fetchTipoVueloByVuelo(flightId)
                .then(normalizeEntityResponseArray)
                .catch(() => []),
            ),
        );
        setAllFlightTypes(typeGroups.flat());
      }
    } catch (error) {
      console.error("Error cargando vuelos:", error);
      toast.error("No se pudo cargar el catálogo de vuelos");
      setFlightCatalog([]);
      setAllFlightTypes([]);
    } finally {
      setIsLoadingFlightCatalog(false);
    }
  }, [serviceType]);

  useEffect(() => {
    if (!isOpen || serviceType !== "vuelos") return;
    loadFlightCatalog();
  }, [isOpen, loadFlightCatalog, serviceType]);

  useEffect(() => {
    if (serviceType !== "vuelos" || !selectedFlightId) {
      setFlightTypes([]);
      setSelectedFlightTypeId("");
      return;
    }

    let cancelled = false;
    const loadTypes = async () => {
      try {
        const response = await fetchTipoVueloByVuelo(selectedFlightId);
        if (!cancelled) {
          setFlightTypes(normalizeEntityResponseArray(response));
        }
      } catch (error) {
        console.error("Error cargando tipos de vuelo:", error);
        if (!cancelled) {
          setFlightTypes([]);
          toast.error("No se pudieron cargar los tipos de vuelo");
        }
      }
    };

    loadTypes();
    return () => {
      cancelled = true;
    };
  }, [selectedFlightId, serviceType]);

  const selectedFlight = useMemo(
    () =>
      flightCatalog.find(
        (flight) => String(getFlightId(flight)) === String(selectedFlightId),
      ) || null,
    [flightCatalog, selectedFlightId],
  );

  const selectedFlightOrigin = normalizeFlightOrigin(newFlightDraft.procedencia);
  const filteredFlightCatalog = useMemo(
    () =>
      flightCatalog.filter(
        (flight) =>
          normalizeFlightOrigin(flight?.procedencia) === selectedFlightOrigin,
      ),
    [flightCatalog, selectedFlightOrigin],
  );

  const flightNameOptions = useMemo(
    () => uniqueFlightValues(flightCatalog, (flight) => flight?.nombre),
    [flightCatalog],
  );

  const flightOriginOptions = useMemo(
    () =>
      Array.from(
        new Set([
          "Nacional",
          "Internacional",
          ...uniqueFlightValues(flightCatalog, (flight) =>
            formatFlightOriginLabel(flight?.procedencia),
          ),
        ]),
      ),
    [flightCatalog],
  );

  const selectedFlightType = useMemo(
    () =>
      flightTypes.find(
        (flightType) =>
          String(getFlightTypeId(flightType)) ===
          String(selectedFlightTypeId),
      ) || null,
    [flightTypes, selectedFlightTypeId],
  );

  const mergedFlightTypeOptions = useMemo(() => {
    const byKey = new Map();
    [...allFlightTypes, ...flightTypes].forEach((flightType, index) => {
      if (!flightType) return;
      const key =
        getFlightTypeId(flightType) ||
        [
          flightType?.tipovuelo || flightType?.tipo_vuelo,
          flightType?.lugar_ida,
          flightType?.lugar_vuelta,
          flightType?.hora_salida,
          flightType?.hora_llegada,
          flightType?.equipaje,
          index,
        ]
          .map((value) => normalizeFlightText(value))
          .join("|");
      if (!byKey.has(String(key))) {
        byKey.set(String(key), flightType);
      }
    });
    return Array.from(byKey.values());
  }, [allFlightTypes, flightTypes]);

  const flightTypeOptionValues = useMemo(
    () => ({
      tipovuelo: uniqueFlightValues(
        mergedFlightTypeOptions,
        (item) => item?.tipovuelo || item?.tipo_vuelo,
      ),
      lugarIda: uniqueFlightValues(mergedFlightTypeOptions, (item) => item?.lugar_ida),
      lugarVuelta: uniqueFlightValues(
        mergedFlightTypeOptions,
        (item) => item?.lugar_vuelta,
      ),
      salida: uniqueFlightValues(mergedFlightTypeOptions, (item) =>
        String(item?.hora_salida || "").slice(0, 5),
      ),
      llegada: uniqueFlightValues(mergedFlightTypeOptions, (item) =>
        String(item?.hora_llegada || "").slice(0, 5),
      ),
      equipaje: Array.from(
        new Set([
          ...uniqueFlightValues(mergedFlightTypeOptions, (item) => item?.equipaje),
          ...FLIGHT_BAGGAGE_DEFAULT_OPTIONS,
        ]),
      ),
    }),
    [mergedFlightTypeOptions],
  );

  const flightNameInputValue = showNewFlightForm
    ? newFlightDraft.nombre
    : selectedFlight?.nombre || newFlightDraft.nombre || "";

  const flightOriginInputValue = formatFlightOriginLabel(
    selectedFlight?.procedencia || newFlightDraft.procedencia,
  );

  const flightTypeInputValue = showNewFlightTypeForm
    ? newFlightTypeDraft.tipovuelo
    : selectedFlightType?.tipovuelo ||
      selectedFlightType?.tipo_vuelo ||
      newFlightTypeDraft.tipovuelo ||
      "";

  const syncFlightTypeDraftFromRecord = useCallback((flightType = {}) => {
    setNewFlightTypeDraft({
      tipovuelo: flightType?.tipovuelo || flightType?.tipo_vuelo || "",
      lugar_ida: flightType?.lugar_ida || "",
      lugar_vuelta: flightType?.lugar_vuelta || "",
      hora_salida: String(flightType?.hora_salida || "").slice(0, 5),
      hora_llegada: String(flightType?.hora_llegada || "").slice(0, 5),
      equipaje: flightType?.equipaje || "",
    });
  }, []);

  const handleFlightNameComboChange = useCallback(
    (value) => {
      const nextName = String(value || "");
      const currentOrigin = normalizeFlightOrigin(newFlightDraft.procedencia);
      const exactFlight =
        filteredFlightCatalog.find(
          (flight) =>
            normalizeFlightText(flight?.nombre) === normalizeFlightText(nextName),
        ) || null;

      setNewFlightDraft({
        nombre: exactFlight?.nombre || nextName,
        procedencia: normalizeFlightOrigin(
          exactFlight?.procedencia || currentOrigin,
        ),
      });
      setSelectedFlightTypeId("");
      syncFlightTypeDraftFromRecord({});
      setAssignedService(null);

      if (exactFlight) {
        setSelectedFlightId(String(getFlightId(exactFlight)));
        setShowNewFlightForm(false);
        setShowNewFlightTypeForm(false);
        return;
      }

      setSelectedFlightId("");
      setFlightTypes([]);
      setShowNewFlightForm(Boolean(nextName.trim()));
      setShowNewFlightTypeForm(Boolean(nextName.trim()));
    },
    [filteredFlightCatalog, newFlightDraft.procedencia, syncFlightTypeDraftFromRecord],
  );

  const handleFlightOriginComboChange = useCallback(
    (value) => {
      const origin = normalizeFlightOrigin(value);
      const currentName = String(flightNameInputValue || "");
      const exactFlight =
        flightCatalog.find(
          (flight) =>
            normalizeFlightOrigin(flight?.procedencia) === origin &&
            normalizeFlightText(flight?.nombre) === normalizeFlightText(currentName),
        ) || null;

      setNewFlightDraft({
        nombre: exactFlight?.nombre || currentName,
        procedencia: origin,
      });
      setSelectedFlightTypeId("");
      syncFlightTypeDraftFromRecord({});
      setAssignedService(null);

      if (exactFlight) {
        setSelectedFlightId(String(getFlightId(exactFlight)));
        setShowNewFlightForm(false);
        setShowNewFlightTypeForm(false);
        return;
      }

      setSelectedFlightId("");
      setFlightTypes([]);
      setShowNewFlightForm(Boolean(currentName.trim()));
      setShowNewFlightTypeForm(Boolean(currentName.trim()));
    },
    [flightCatalog, flightNameInputValue, syncFlightTypeDraftFromRecord],
  );

  const handleFlightTypeComboChange = useCallback(
    (value) => {
      const nextType = String(value || "");
      const exactTypeForSelectedFlight =
        flightTypes.find(
          (flightType) =>
            normalizeFlightText(flightType?.tipovuelo || flightType?.tipo_vuelo) ===
            normalizeFlightText(nextType),
        ) || null;
      const globalTemplate =
        mergedFlightTypeOptions.find(
          (flightType) =>
            normalizeFlightText(flightType?.tipovuelo || flightType?.tipo_vuelo) ===
            normalizeFlightText(nextType),
        ) || null;

      if (exactTypeForSelectedFlight) {
        setSelectedFlightTypeId(String(getFlightTypeId(exactTypeForSelectedFlight)));
        syncFlightTypeDraftFromRecord(exactTypeForSelectedFlight);
        setShowNewFlightTypeForm(false);
      } else if (globalTemplate) {
        setSelectedFlightTypeId("");
        syncFlightTypeDraftFromRecord(globalTemplate);
        setShowNewFlightTypeForm(true);
      } else {
        setSelectedFlightTypeId("");
        setNewFlightTypeDraft((current) => ({
          ...current,
          tipovuelo: nextType,
        }));
        setShowNewFlightTypeForm(Boolean(nextType.trim()));
      }

      setAssignedService(null);
    },
    [flightTypes, mergedFlightTypeOptions, syncFlightTypeDraftFromRecord],
  );

  const handleFlightTypeFieldChange = useCallback((field, value) => {
    setNewFlightTypeDraft((current) => ({
      ...current,
      [field]: value,
    }));
    setSelectedFlightTypeId("");
    setShowNewFlightTypeForm(true);
    setAssignedService(null);
  }, []);

  const effectiveFlight = useMemo(() => {
    if (!showNewFlightForm) return selectedFlight;
    const nombre = String(newFlightDraft.nombre || "").trim();
    if (!nombre) return null;
    return {
      nombre,
      procedencia: normalizeFlightOrigin(newFlightDraft.procedencia),
      _isManualDraft: true,
    };
  }, [newFlightDraft, selectedFlight, showNewFlightForm]);

  const effectiveFlightType = useMemo(() => {
    if (!showNewFlightTypeForm) return selectedFlightType;
    const tipovuelo =
      String(newFlightTypeDraft.tipovuelo || "").trim() ||
      selectedFlightType?.tipovuelo ||
      selectedFlightType?.tipo_vuelo ||
      "Otro";
    const hasManualData =
      tipovuelo ||
      newFlightTypeDraft.lugar_ida ||
      newFlightTypeDraft.lugar_vuelta ||
      newFlightTypeDraft.hora_salida ||
      newFlightTypeDraft.hora_llegada ||
      newFlightTypeDraft.equipaje;
    if (!hasManualData) return null;
    return {
      ...(selectedFlightType || {}),
      id_vuelo: getFlightId(effectiveFlight) || selectedFlightId || null,
      tipovuelo,
      lugar_ida: String(newFlightTypeDraft.lugar_ida || "").trim() || null,
      lugar_vuelta: String(newFlightTypeDraft.lugar_vuelta || "").trim() || null,
      hora_salida: String(newFlightTypeDraft.hora_salida || "").trim() || null,
      hora_llegada: String(newFlightTypeDraft.hora_llegada || "").trim() || null,
      equipaje: String(newFlightTypeDraft.equipaje || "").trim() || null,
      estado: "disponible",
      _isManualDraft: true,
    };
  }, [
    effectiveFlight,
    newFlightTypeDraft,
    selectedFlightId,
    selectedFlightType,
    showNewFlightTypeForm,
  ]);

  const selectedService = useMemo(() => {
    if (selectedServiceKey) {
      const selectedByKey = sourceServicesByDay
        .flatMap((day) => day.services || [])
        .find(
          (service) => getServiceGroupKey(service, "") === selectedServiceKey,
        );
      if (selectedByKey) return selectedByKey;
    }

    if (selectedDayIndex === null || selectedServiceIndex === null) return null;
    return sourceServicesByDay[selectedDayIndex]?.services?.[
      selectedServiceIndex
    ];
  }, [
    selectedDayIndex,
    selectedServiceIndex,
    selectedServiceKey,
    sourceServicesByDay,
  ]);

  const sourcePaymentPassengerSelection = useMemo(
    () =>
      selectedService
        ? buildPaymentPassengerSelection(
            selectedService,
            cotizacionPeopleDetails,
          )
        : null,
    [cotizacionPeopleDetails, selectedService],
  );

  const payableChildPassengerIds = useMemo(
    () =>
      (sourcePaymentPassengerSelection?.selectedIds || []).filter((id) =>
        String(id).startsWith("child:"),
      ),
    [sourcePaymentPassengerSelection],
  );

  const effectivePaymentPassengerCount =
    sourcePaymentPassengerSelection?.selectedIds?.length ||
    totalCotizacionPassengers;

  const syncManualFlightAssignment = useCallback(
    (rawValue = assignedAdultPriceDraft) => {
      if (serviceType !== "vuelos") return;
      const isEmpty = String(rawValue ?? "").trim() === "";
      const parsed = isEmpty ? null : parseCurrencyInput(rawValue);
      if (!effectiveFlight || !effectiveFlightType || parsed === null) {
        setAssignedService(null);
        return;
      }

      setAssignedService((current) => {
        const currentSelection =
          current?.passengerSelection || current?.assignedPassengerSelection;
        const paymentSelection = reconcilePaymentPassengerSelection(
          currentSelection || sourcePaymentPassengerSelection || {},
          sourcePaymentPassengerSelection || {},
          cotizacionPeopleDetails,
        );
        const normalized = buildManualFlightService({
          flight: effectiveFlight,
          flightType: effectiveFlightType,
          price: parsed,
          peopleDetails: cotizacionPeopleDetails,
          passengerSelectionOverride: paymentSelection,
        });
        return normalized;
      });
    },
    [
      assignedAdultPriceDraft,
      cotizacionPeopleDetails,
      effectiveFlight,
      effectiveFlightType,
      serviceType,
      sourcePaymentPassengerSelection,
    ],
  );

  useEffect(() => {
    if (serviceType !== "vuelos") return;
    syncManualFlightAssignment();
  }, [
    selectedFlightId,
    selectedFlightTypeId,
    serviceType,
    syncManualFlightAssignment,
  ]);

  const allVisibleServices = useMemo(
    () => sourceServicesByDay.flatMap((day) => day.services || []),
    [sourceServicesByDay],
  );

  const selectedExistingAssignment = useMemo(() => {
    if (!selectedService) return null;

    const assignedFromList = allVisibleServices.find(
      (service) =>
        hasAssignedServiceData(service) &&
        isSameItineraryService(service, selectedService),
    );
    if (assignedFromList) return assignedFromList;

    if (
      existingAssignment &&
      isSameItineraryService(existingAssignment, selectedService)
    ) {
      return existingAssignment;
    }

    return null;
  }, [allVisibleServices, existingAssignment, selectedService]);

  const selectedPaymentRequest = useMemo(() => {
    if (!selectedService) return null;
    const targetService = selectedExistingAssignment || selectedService;
    return (
      getRequestForService(reservationPaymentRequests, targetService) ||
      (existingPaymentRequest &&
      isSameItineraryService(targetService, existingAssignment)
        ? existingPaymentRequest
        : null)
    );
  }, [
    existingAssignment,
    existingPaymentRequest,
    reservationPaymentRequests,
    selectedExistingAssignment,
    selectedService,
  ]);

  const selectedPaymentRequestStatus = useMemo(
    () => getPaymentStatusFromRequest(selectedPaymentRequest),
    [selectedPaymentRequest],
  );

  const loadPaidMovement = useCallback(async (paymentRequest, action) => {
    if (!paymentRequest) {
      toast.info("No se encontró la solicitud asociada a este pago.");
      return null;
    }

    const paymentKey =
      paymentRequest?.movimiento_id ||
      paymentRequest?.id ||
      paymentRequest?.payment_request_id ||
      paymentRequest?.notification_id ||
      "payment";
    const actionKey = `${paymentKey}:${action}`;
    setLoadingPaidMovementAction(actionKey);
    try {
      const result = await movimientoService.resolveByPaymentRequest(paymentRequest);
      if (result?.success && result?.data) return result.data;

      toast.error(result?.error || "No se pudo cargar el movimiento asociado.");
      return null;
    } catch (error) {
      console.error("Error cargando movimiento de vuelo pagado:", error);
      toast.error("No se pudo cargar el movimiento asociado.");
      return null;
    } finally {
      setLoadingPaidMovementAction(null);
    }
  }, []);

  const handleViewPaidMovement = useCallback(
    async (paymentRequest) => {
      const movimiento = await loadPaidMovement(paymentRequest, "preview");
      if (movimiento) setSelectedMovimiento(movimiento);
    },
    [loadPaidMovement],
  );

  const handleUpdatePaidMovementMedia = useCallback(
    async (paymentRequest) => {
      const movimiento = await loadPaidMovement(paymentRequest, "media");
      if (movimiento) setMediaEditMovimiento(movimiento);
    },
    [loadPaidMovement],
  );

  const getVisibleServicePaymentRequest = useCallback(
    (service) => {
      const assigned = allVisibleServices.find(
        (candidate) =>
          hasAssignedServiceData(candidate) &&
          isSameItineraryService(candidate, service),
      );
      if (!assigned) return null;

      return (
        getRequestForService(reservationPaymentRequests, assigned) ||
        (existingPaymentRequest &&
        isSameItineraryService(assigned, existingAssignment)
          ? existingPaymentRequest
          : null)
      );
    },
    [
      allVisibleServices,
      existingAssignment,
      existingPaymentRequest,
      reservationPaymentRequests,
    ],
  );

  const getServiceCardStatus = useCallback(
    (service) => {
      const assigned = allVisibleServices.some(
        (candidate) =>
          hasAssignedServiceData(candidate) &&
          isSameItineraryService(candidate, service),
      );
      if (!assigned) return "available";

      const status = getPaymentStatusFromRequest(
        getVisibleServicePaymentRequest(service),
      );
      if (["paid", "completed"].includes(status)) return "paid";
      if (status === "pending") return "pending";
      return "assigned";
    },
    [allVisibleServices, getVisibleServicePaymentRequest],
  );

  const loadReservationContext = useCallback(async () => {
    if (!isOpen || !voucherId) return;
    setIsLoadingVoucherReserva(true);

    try {
      const [reservasResponse, itineraryResponse] = await Promise.all([
        voucherReservaService.getAllVoucherReservas({ skipCache: true }),
        voucherReservaService.getItinerarioByVoucherVenta(voucherId, {
          skipCache: true,
        }),
      ]);

      const reservasArray = normalizeReservaResponseArray(reservasResponse);
      const reservationVoucher = reservasArray.find(
        (rv) => rv.voucher_id === parseInt(voucherId, 10),
      );
      const itinerary = parseJsonArray(itineraryResponse);

      setExistingVoucherReserva(reservationVoucher || null);
      setVoucherReservaId(reservationVoucher?.id || null);
      setNormalizedItinerary(itinerary);

      const requests = reservationVoucher?.id
        ? await voucherReservaService.getPaymentRequestsByVoucherReservaId(
            reservationVoucher.id,
            { skipCache: true },
          )
        : [];
      const requestList = Array.isArray(requests) ? requests : [];
      setReservationPaymentRequests((current) =>
        mergePaymentRequests(current, requestList),
      );

      const assigned = mergeServiceGroupsByDay(
        buildServicesByDay(itinerary, serviceType),
        inputServicesByDay,
      )
        .flatMap((day) => day.services)
        .find((service) => service.isAssigned);

      setExistingAssignment(assigned || null);

      if (reservationVoucher?.id && assigned) {
        const servicioId = getServicioId(assigned);
        const paymentRequest = requestList.find(
          (pr) =>
            pr.itinerario_servicio_id === servicioId &&
            !["cancelled", "canceled"].includes(
              String(pr?.status || pr?.estado || "").toLowerCase(),
            ),
        );
        setExistingPaymentRequest(paymentRequest || null);
        setPaymentRequestStatus(paymentRequest?.status || null);
      } else {
        setExistingPaymentRequest(null);
        setPaymentRequestStatus(null);
      }
    } catch (error) {
      console.error("Error cargando contexto de reserva:", error);
      setExistingVoucherReserva(null);
      setExistingAssignment(null);
      setExistingPaymentRequest(null);
      setPaymentRequestStatus(null);
      setReservationPaymentRequests([]);
    } finally {
      setIsLoadingVoucherReserva(false);
    }
  }, [inputServicesByDay, isOpen, voucherId, serviceType]);

  useEffect(() => {
    loadReservationContext();
  }, [loadReservationContext]);

  const handleSelectService = useCallback(
    (dayIndex, serviceIndex) => {
      const service = sourceServicesByDay[dayIndex]?.services?.[serviceIndex];
      setSelectedDayIndex(dayIndex);
      setSelectedServiceIndex(serviceIndex);
      setSelectedServiceKey(
        service ? getServiceGroupKey(service, `${dayIndex}:${serviceIndex}`) : null,
      );
      setAssignedService(null);
      setSelectedFlightId("");
      setSelectedFlightTypeId("");
      setAssignedAdultPriceDraft("");
      setShowServicePicker(false);
    },
    [sourceServicesByDay],
  );

  const handleOpenServicePicker = useCallback(() => {
    if (!selectedService) {
      toast.error(`Selecciona un ${config.singular} primero`);
      return;
    }
    setShowServicePicker(true);
  }, [config.singular, selectedService]);

  const handleServiceSelected = useCallback(
    (service) => {
      const paymentSelection = reconcilePaymentPassengerSelection(
        {},
        sourcePaymentPassengerSelection || {},
        cotizacionPeopleDetails,
      );
      const normalizedService = normalizePaymentService({
        service,
        peopleDetails: cotizacionPeopleDetails,
        serviceType,
        passengerSelectionOverride: paymentSelection,
      });
      setAssignedService(normalizedService);
      setAssignedAdultPriceDraft(
        String(round2(Number(getTariff(normalizedService)?.precio || 0))),
      );
      setShowServicePicker(false);
    },
    [cotizacionPeopleDetails, serviceType, sourcePaymentPassengerSelection],
  );

  const handleCreateFlight = useCallback(async () => {
    const nombre = String(newFlightDraft.nombre || "").trim();
    if (!nombre) {
      toast.error("Ingresa el nombre del vuelo o aerolínea");
      return;
    }

    setIsSavingFlightCatalog(true);
    try {
      const response = await createVuelo({
        nombre,
        procedencia: normalizeFlightOrigin(newFlightDraft.procedencia),
        created_by: String(SecureStorage.getItem("dniuser") || ""),
      });
      const created = normalizeCreatedEntity(response);
      await loadFlightCatalog();
      const createdId = getFlightId(created);
      if (createdId) setSelectedFlightId(String(createdId));
      setSelectedFlightTypeId("");
      setNewFlightDraft({ nombre: "", procedencia: "nacional" });
      setShowNewFlightForm(false);
      toast.success("Vuelo registrado");
    } catch (error) {
      console.error("Error registrando vuelo:", error);
      toast.error(error.message || "No se pudo registrar el vuelo");
    } finally {
      setIsSavingFlightCatalog(false);
    }
  }, [loadFlightCatalog, newFlightDraft]);

  const handleCreateFlightType = useCallback(async () => {
    if (!selectedFlightId) {
      toast.error("Selecciona un vuelo primero");
      return;
    }
    const tipovuelo = String(newFlightTypeDraft.tipovuelo || "").trim();
    if (!tipovuelo) {
      toast.error("Ingresa el tipo de vuelo");
      return;
    }

    setIsSavingFlightCatalog(true);
    try {
      const response = await createTipoVuelo({
        id_vuelo: Number(selectedFlightId),
        tipovuelo,
        estado: "disponible",
        lugar_ida: String(newFlightTypeDraft.lugar_ida || "").trim() || null,
        lugar_vuelta:
          String(newFlightTypeDraft.lugar_vuelta || "").trim() || null,
        hora_salida:
          String(newFlightTypeDraft.hora_salida || "").trim() || null,
        hora_llegada:
          String(newFlightTypeDraft.hora_llegada || "").trim() || null,
        equipaje: String(newFlightTypeDraft.equipaje || "").trim() || null,
        created_by: String(SecureStorage.getItem("dniuser") || ""),
      });
      const created = normalizeCreatedEntity(response);
      const freshTypes = await fetchTipoVueloByVuelo(selectedFlightId);
      const normalizedFreshTypes = normalizeEntityResponseArray(freshTypes);
      setFlightTypes(normalizedFreshTypes);
      setAllFlightTypes((current) => {
        const byKey = new Map();
        [...current, ...normalizedFreshTypes].forEach((item, index) => {
          const key = getFlightTypeId(item) || `type-${index}`;
          byKey.set(String(key), item);
        });
        return Array.from(byKey.values());
      });
      const createdId = getFlightTypeId(created);
      if (createdId) setSelectedFlightTypeId(String(createdId));
      setNewFlightTypeDraft({
        tipovuelo: "",
        lugar_ida: "",
        lugar_vuelta: "",
        hora_salida: "",
        hora_llegada: "",
        equipaje: "",
      });
      setShowNewFlightTypeForm(false);
      toast.success("Tipo de vuelo registrado");
    } catch (error) {
      console.error("Error registrando tipo de vuelo:", error);
      toast.error(error.message || "No se pudo registrar el tipo de vuelo");
    } finally {
      setIsSavingFlightCatalog(false);
    }
  }, [newFlightTypeDraft, selectedFlightId]);

  const resolveFlightCatalogSelection = useCallback(
    async (rawPrice) => {
      if (serviceType !== "vuelos") return assignedService;

      const parsedPrice = parseCurrencyInput(rawPrice);
      if (String(rawPrice ?? "").trim() === "" || parsedPrice === null || parsedPrice <= 0) {
        throw new Error("Ingresa el precio por persona del vuelo");
      }

      const manualFlightName = String(newFlightDraft.nombre || "").trim();
      const flightName = showNewFlightForm
        ? manualFlightName
        : String(selectedFlight?.nombre || "").trim();
      const flightOrigin = normalizeFlightOrigin(
        showNewFlightForm
          ? newFlightDraft.procedencia
          : selectedFlight?.procedencia || newFlightDraft.procedencia,
      );

      if (!flightName) {
        throw new Error("Selecciona o personaliza el vuelo/aerolínea");
      }

      setIsSavingFlightCatalog(true);

      let resolvedFlight = selectedFlight;
      if (showNewFlightForm || !resolvedFlight) {
        resolvedFlight =
          flightCatalog.find(
            (flight) =>
              normalizeFlightText(flight?.nombre) === normalizeFlightText(flightName) &&
              normalizeFlightOrigin(flight?.procedencia) === flightOrigin,
          ) || null;

        if (!resolvedFlight) {
          const response = await createVuelo({
            nombre: flightName,
            procedencia: flightOrigin,
            created_by: String(SecureStorage.getItem("dniuser") || ""),
          });
          resolvedFlight = normalizeCreatedEntity(response);
          toast.success("Vuelo registrado automáticamente");
        }
      }

      const resolvedFlightId = getFlightId(resolvedFlight);
      if (!resolvedFlightId) {
        throw new Error("No se pudo resolver el ID del vuelo");
      }

      const availableTypes =
        String(resolvedFlightId) === String(selectedFlightId)
          ? flightTypes
          : normalizeEntityResponseArray(await fetchTipoVueloByVuelo(resolvedFlightId));

      const sourceType = showNewFlightTypeForm
        ? effectiveFlightType
        : selectedFlightType;
      const typePayload = {
        id_vuelo: Number(resolvedFlightId),
        tipovuelo:
          String(sourceType?.tipovuelo || sourceType?.tipo_vuelo || "").trim() ||
          "Otro",
        estado: "disponible",
        lugar_ida: String(sourceType?.lugar_ida || "").trim() || null,
        lugar_vuelta: String(sourceType?.lugar_vuelta || "").trim() || null,
        hora_salida: String(sourceType?.hora_salida || "").trim() || null,
        hora_llegada: String(sourceType?.hora_llegada || "").trim() || null,
        equipaje: String(sourceType?.equipaje || "").trim() || null,
      };

      if (!typePayload.tipovuelo) {
        throw new Error("Selecciona o personaliza el tipo de vuelo");
      }

      const normalizeTime = (value) => String(value || "").slice(0, 5);

      const sameRoute = (flightType) =>
        normalizeFlightText(flightType?.lugar_ida) ===
          normalizeFlightText(typePayload.lugar_ida) &&
        normalizeFlightText(flightType?.lugar_vuelta) ===
          normalizeFlightText(typePayload.lugar_vuelta);

      let resolvedFlightType =
        !showNewFlightTypeForm && selectedFlightType
          ? selectedFlightType
          : availableTypes.find(sameRoute) || null;

      if (resolvedFlightType) {
        const typeId = getFlightTypeId(resolvedFlightType);
        const updates = {};
        if (
          normalizeFlightText(
            resolvedFlightType?.tipovuelo || resolvedFlightType?.tipo_vuelo,
          ) !== normalizeFlightText(typePayload.tipovuelo)
        ) {
          updates.tipovuelo = typePayload.tipovuelo;
        }
        if (
          normalizeFlightText(resolvedFlightType?.lugar_ida) !==
          normalizeFlightText(typePayload.lugar_ida)
        ) {
          updates.lugar_ida = typePayload.lugar_ida;
        }
        if (
          normalizeFlightText(resolvedFlightType?.lugar_vuelta) !==
          normalizeFlightText(typePayload.lugar_vuelta)
        ) {
          updates.lugar_vuelta = typePayload.lugar_vuelta;
        }
        if (
          normalizeTime(resolvedFlightType?.hora_salida) !==
          normalizeTime(typePayload.hora_salida)
        ) {
          updates.hora_salida = typePayload.hora_salida;
        }
        if (
          normalizeTime(resolvedFlightType?.hora_llegada) !==
          normalizeTime(typePayload.hora_llegada)
        ) {
          updates.hora_llegada = typePayload.hora_llegada;
        }
        if (
          normalizeFlightText(resolvedFlightType?.equipaje) !==
          normalizeFlightText(typePayload.equipaje)
        ) {
          updates.equipaje = typePayload.equipaje;
        }

        if (Object.keys(updates).length > 0 && typeId) {
          const updateResponse = await updateTipoVuelo(typeId, {
            ...typePayload,
            ...updates,
            updated_by: String(SecureStorage.getItem("dniuser") || ""),
          });
          if (updateResponse?.success) {
            resolvedFlightType = {
              ...resolvedFlightType,
              ...typePayload,
              idtipo_vuelo: typeId,
            };
            toast.success("Tipo de vuelo actualizado");
          } else {
            console.warn(
              "No se pudo actualizar el tipo de vuelo:",
              updateResponse,
            );
          }
        }
      } else {
        const response = await createTipoVuelo({
          ...typePayload,
          created_by: String(SecureStorage.getItem("dniuser") || ""),
        });
        resolvedFlightType = normalizeCreatedEntity(response);
        toast.success("Tipo de vuelo registrado automáticamente");
      }

      const freshCatalog = normalizeEntityResponseArray(await fetchVuelos());
      setFlightCatalog(freshCatalog);
      setSelectedFlightId(String(resolvedFlightId));
      const freshTypes = normalizeEntityResponseArray(
        await fetchTipoVueloByVuelo(resolvedFlightId),
      );
      setFlightTypes(freshTypes);
      setAllFlightTypes((current) => {
        const byKey = new Map();
        [...current, ...freshTypes].forEach((item, index) => {
          const key = getFlightTypeId(item) || `type-${index}`;
          byKey.set(String(key), item);
        });
        return Array.from(byKey.values());
      });
      const resolvedTypeId = getFlightTypeId(resolvedFlightType);
      if (resolvedTypeId) setSelectedFlightTypeId(String(resolvedTypeId));
      setShowNewFlightForm(false);
      setShowNewFlightTypeForm(false);
      setNewFlightDraft({
        nombre: "",
        procedencia: flightOrigin,
      });
      setNewFlightTypeDraft({
        tipovuelo: "",
        lugar_ida: "",
        lugar_vuelta: "",
        hora_salida: "",
        hora_llegada: "",
        equipaje: "",
      });

      const resolvedService = buildManualFlightService({
        flight: {
          ...resolvedFlight,
          id_vuelo: resolvedFlightId,
          procedencia: flightOrigin,
        },
        flightType: resolvedFlightType,
        price: parsedPrice,
        peopleDetails: cotizacionPeopleDetails,
        passengerSelectionOverride: reconcilePaymentPassengerSelection(
          assignedService?.passengerSelection ||
            assignedService?.assignedPassengerSelection ||
            sourcePaymentPassengerSelection ||
            {},
          sourcePaymentPassengerSelection || {},
          cotizacionPeopleDetails,
        ),
      });

      setAssignedService(resolvedService);

      setAssignedAdultPriceDraft(String(round2(parsedPrice)));
      return resolvedService;
    },
    [
      assignedService,
      cotizacionPeopleDetails,
      effectiveFlightType,
      flightCatalog,
      flightTypes,
      newFlightDraft,
      selectedFlight,
      selectedFlightId,
      selectedFlightType,
      serviceType,
      showNewFlightForm,
      showNewFlightTypeForm,
      sourcePaymentPassengerSelection,
    ],
  );

  const assignedServiceIdentity = useMemo(() => {
    if (!assignedService) return "";
    const parentService =
      assignedService.parentService ||
      assignedService.assignedParentService ||
      {};
    const childService =
      assignedService.childService || assignedService.assignedChildService || {};
    return [
      assignedService.id || "",
      getParentId(parentService) || "",
      getChildId(childService, assignedService) || "",
    ].join(":");
  }, [assignedService]);

  useEffect(() => {
    if (!assignedService) {
      setAssignedAdultPriceDraft("");
      return;
    }

    setAssignedAdultPriceDraft(
      String(round2(Number(getTariff(assignedService)?.precio || 0))),
    );
  }, [assignedServiceIdentity]);

  const applyAssignedAdultPrice = useCallback((rawValue) => {
    const parsed = parseCurrencyInput(rawValue);
    if (parsed === null) return;
    const nextPrice = round2(parsed);

    setAssignedService((current) => {
      if (!current) return current;
      const currentTariff = getTariff(current);
      const nextTariff = {
        ...currentTariff,
        precio: nextPrice,
        precio_original: nextPrice,
        precio_original_with_child_extras: undefined,
      };
      const currentSelection =
        current.passengerSelection || current.assignedPassengerSelection;

      return {
        ...current,
        tariff: nextTariff,
        assignedTariff: current.assignedTariff
          ? { ...current.assignedTariff, ...nextTariff }
          : current.assignedTariff,
        precioServicio: nextPrice,
        precio_servicio: nextPrice,
        precio_tarifa: nextPrice,
        passengerSelection: currentSelection,
        assignedPassengerSelection:
          current.assignedPassengerSelection || currentSelection,
      };
    });
  }, []);

  const handleAssignedAdultPriceChange = useCallback(
    (event) => {
      const value = event.target.value;
      setAssignedAdultPriceDraft(value);
      if (serviceType === "vuelos") {
        syncManualFlightAssignment(value);
        return;
      }
      applyAssignedAdultPrice(value);
    },
    [applyAssignedAdultPrice, serviceType, syncManualFlightAssignment],
  );

  const handleAssignedAdultPriceBlur = useCallback(() => {
    if (String(assignedAdultPriceDraft ?? "").trim() === "") {
      if (serviceType === "vuelos") setAssignedService(null);
      return;
    }
    const parsed = parseCurrencyInput(assignedAdultPriceDraft);
    const formatted = String(round2(parsed ?? 0));
    setAssignedAdultPriceDraft(formatted);
    if (serviceType === "vuelos") {
      syncManualFlightAssignment(formatted);
      return;
    }
    applyAssignedAdultPrice(formatted);
  }, [
    applyAssignedAdultPrice,
    assignedAdultPriceDraft,
    serviceType,
    syncManualFlightAssignment,
  ]);

  const updateAssignedChildPricing = useCallback(
    (mode, childId = null, rawValue = "") => {
      if (!assignedService) return;

      const currentSelection = reconcilePaymentPassengerSelection(
        getPassengerSelection(assignedService, cotizacionPeopleDetails),
        sourcePaymentPassengerSelection || {},
        cotizacionPeopleDetails,
      );
      const childIds = payableChildPassengerIds;
      if (childIds.length === 0) return;
      const selectedIds = [...(currentSelection.selectedIds || [])];
      const currentExplicitMap = {
        ...(currentSelection.childPriceMap || {}),
        ...(currentSelection.assignedChildExplicitPriceMap || {}),
      };
      const currentPercentageMap = {
        ...(currentSelection.childPercentageMap || {}),
      };
      const currentConvertedMap = {
        ...(currentSelection.convertedChildToAdultMap || {}),
      };
      let nextSelection = {
        ...currentSelection,
        selectedIds,
        assignedPassengerCount: selectedIds.length,
        treatChildrenAsAdults: false,
        convertedChildToAdultMap: currentConvertedMap,
        childPriceMap: currentExplicitMap,
        assignedChildExplicitPriceMap: currentExplicitMap,
        childPercentageMap: currentPercentageMap,
        pricingMode: currentSelection.pricingMode || "percentage",
        uniformPercentage: currentSelection.uniformPercentage || "",
      };

      const adultUnitPrice = round2(
        Number(getTariff(assignedService)?.precio || 0),
      );

      if (mode === "adult") {
        const convertedMap = childIds.reduce((acc, id) => {
          acc[id] = id;
          return acc;
        }, {});
        nextSelection = {
          ...nextSelection,
          pricingMode: "adult",
          treatChildrenAsAdults: true,
          convertedChildToAdultMap: convertedMap,
          childPriceMap: {},
          assignedChildExplicitPriceMap: {},
          childPercentageMap: {},
          uniformPercentage: "",
          assignedChildExplicitCount: 0,
          assignedChildExplicitPriceSum: 0,
        };
      } else if (mode === "child-adult") {
        const nextConvertedMap = {
          ...currentConvertedMap,
          [childId]: childId,
        };
        const nextExplicitMap = { ...currentExplicitMap };
        delete nextExplicitMap[childId];
        const nextPercentageMap = { ...currentPercentageMap };
        delete nextPercentageMap[childId];

        nextSelection = {
          ...nextSelection,
          pricingMode: "mixed",
          convertedChildToAdultMap: nextConvertedMap,
          childPriceMap: nextExplicitMap,
          assignedChildExplicitPriceMap: nextExplicitMap,
          childPercentageMap: nextPercentageMap,
          assignedChildExplicitCount: Object.keys(nextExplicitMap).length,
          assignedChildExplicitPriceSum: round2(
            Object.values(nextExplicitMap).reduce(
              (sum, v) => sum + Number(v || 0),
              0,
            ),
          ),
        };
      } else if (mode === "revert-child") {
        const convertedMap = { ...currentConvertedMap };
        delete convertedMap[childId];
        nextSelection = {
          ...nextSelection,
          pricingMode: Object.keys(convertedMap).length
            ? "mixed"
            : "percentage",
          convertedChildToAdultMap: convertedMap,
          assignedChildExplicitCount: Object.keys(
            nextSelection.assignedChildExplicitPriceMap || {},
          ).length,
          assignedChildExplicitPriceSum: round2(
            Object.values(
              nextSelection.assignedChildExplicitPriceMap || {},
            ).reduce((sum, v) => sum + Number(v || 0), 0),
          ),
        };
      } else if (mode === "percentage") {
        const percentage = rawValue === "" ? "" : Number(rawValue);
        const percentNum = Number.isFinite(percentage) ? percentage : 0;
        const convertedMap = { ...currentConvertedMap };

        if (childId) {
          const childPrice = round2((percentNum / 100) * adultUnitPrice);
          const nextExplicitMap = {
            ...currentExplicitMap,
            [childId]: childPrice,
          };
          delete convertedMap[childId];
          const nextPercentageMap = {
            ...currentPercentageMap,
            [childId]: percentNum,
          };

          nextSelection = {
            ...nextSelection,
            pricingMode: "mixed",
            convertedChildToAdultMap: convertedMap,
            childPriceMap: nextExplicitMap,
            assignedChildExplicitPriceMap: nextExplicitMap,
            childPercentageMap: nextPercentageMap,
            assignedChildExplicitCount: Object.keys(nextExplicitMap).length,
            assignedChildExplicitPriceSum: round2(
              Object.values(nextExplicitMap).reduce(
                (sum, v) => sum + Number(v || 0),
                0,
              ),
            ),
          };
        } else {
          const childPrice = round2((percentNum / 100) * adultUnitPrice);
          const nextExplicitMap = {};
          const nextPercentageMap = {};

          childIds.forEach((id) => {
            nextExplicitMap[id] = childPrice;
            nextPercentageMap[id] = percentNum;
          });

          nextSelection = {
            ...nextSelection,
            pricingMode: "percentage",
            convertedChildToAdultMap: {},
            childPriceMap: nextExplicitMap,
            assignedChildExplicitPriceMap: nextExplicitMap,
            uniformPercentage: Number.isFinite(percentage)
              ? String(percentage)
              : "",
            childPercentageMap: nextPercentageMap,
            assignedChildExplicitCount: Object.keys(nextExplicitMap).length,
            assignedChildExplicitPriceSum: round2(childPrice * childIds.length),
          };
        }
      } else if (mode === "fixed") {
        const price = rawValue === "" ? 0 : round2(rawValue);
        const convertedMap = { ...currentConvertedMap };

        if (childId) {
          const nextExplicitMap = {
            ...currentExplicitMap,
            [childId]: price,
          };
          delete convertedMap[childId];

          nextSelection = {
            ...nextSelection,
            pricingMode: "mixed",
            convertedChildToAdultMap: convertedMap,
            childPriceMap: nextExplicitMap,
            assignedChildExplicitPriceMap: nextExplicitMap,
            assignedChildExplicitCount: Object.keys(nextExplicitMap).length,
            assignedChildExplicitPriceSum: round2(
              Object.values(nextExplicitMap).reduce(
                (sum, v) => sum + Number(v || 0),
                0,
              ),
            ),
          };
        } else {
          const nextExplicitMap = {};
          childIds.forEach((id) => {
            nextExplicitMap[id] = price;
          });

          nextSelection = {
            ...nextSelection,
            pricingMode: "fixed",
            convertedChildToAdultMap: {},
            childPriceMap: nextExplicitMap,
            assignedChildExplicitPriceMap: nextExplicitMap,
            uniformPercentage: "",
            childPercentageMap: {},
            assignedChildExplicitCount: Object.keys(nextExplicitMap).length,
            assignedChildExplicitPriceSum: round2(price * childIds.length),
          };
        }
      }

      // Actualizar assignedService directamente preservando la estructura
      const normalizedNextSelection = reconcilePaymentPassengerSelection(
        nextSelection,
        sourcePaymentPassengerSelection || {},
        cotizacionPeopleDetails,
      );
      const updatedService = {
        ...assignedService,
        passengerSelection: normalizedNextSelection,
        assignedPassengerSelection: normalizedNextSelection,
        assignedChildExplicitPriceMap:
          normalizedNextSelection.assignedChildExplicitPriceMap,
        assignedChildExplicitCount:
          normalizedNextSelection.assignedChildExplicitCount ??
          Object.keys(
            normalizedNextSelection.assignedChildExplicitPriceMap || {},
          ).length,
        assignedChildExplicitPriceSum:
          normalizedNextSelection.assignedChildExplicitPriceSum ?? 0,
        convertedChildToAdultMap:
          normalizedNextSelection.convertedChildToAdultMap,
        childPriceMap: normalizedNextSelection.childPriceMap,
        childPercentageMap: normalizedNextSelection.childPercentageMap,
        uniformPercentage: normalizedNextSelection.uniformPercentage,
        pricingMode: normalizedNextSelection.pricingMode,
        treatChildrenAsAdults:
          normalizedNextSelection.treatChildrenAsAdults,
        _trustAssignedTotal: false,
        assignedPrecioTotal: undefined,
        assigned_precio_total: undefined,
      };

      setAssignedService(updatedService);
    },
    [
      assignedService,
      cotizacionPeopleDetails,
      payableChildPassengerIds,
      sourcePaymentPassengerSelection,
    ],
  );

  const ensureVoucherReserva = useCallback(async () => {
    if (existingVoucherReserva?.id) return existingVoucherReserva.id;

    const dniUser = String(SecureStorage.getItem("dniuser") || "");
    const payload = {
      id: `RV-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      voucher_id: parseInt(voucherId, 10),
      cotizacion_id: cotizacionData.id,
      voucher_code: voucherCode,
      status: "active",
      created_by: dniUser,
      platform: cotizacionData?.platform || "venso",
      business_type: cotizacionData?.business_type || "B2C",
    };

    const response = await voucherReservaService.createVoucherReserva(payload);
    const newId = response?.id || response?.data?.id || payload.id;
    setVoucherReservaId(newId);
    setExistingVoucherReserva({ ...payload, id: newId });
    return newId;
  }, [cotizacionData, existingVoucherReserva, voucherCode, voucherId]);

  const getPaymentRequestForService = useCallback(
    async (targetVoucherReservaId, targetService) => {
      const servicioId = getServicioId(targetService);
      if (!servicioId) return null;

      const requests =
        await voucherReservaService.getPaymentRequestsByVoucherReservaId(
          targetVoucherReservaId,
        );
      return (
        requests.find(
          (pr) =>
            pr.itinerario_servicio_id === servicioId &&
            !["cancelled", "canceled"].includes(
              String(pr?.status || pr?.estado || "").toLowerCase(),
            ),
        ) || null
      );
    },
    [],
  );

  const createPaymentRequest = useCallback(
    async (
      targetVoucherReservaId,
      targetAssignedService,
      targetSourceService,
    ) => {
      const servicioId = getServicioId(targetSourceService);
      if (!servicioId) {
        throw new Error("No se encontró el ID normalizado del servicio");
      }

      const amount = getPayableAmount(
        targetAssignedService,
        cotizacionPeopleDetails,
        serviceType,
      );
      const serviceName = getServiceName(
        targetAssignedService,
        config.singular,
      );
      const response = await voucherReservaService.requestPayment({
        voucher_reserva_id: targetVoucherReservaId,
        itinerario_servicio_id: servicioId,
        amount,
        observaciones: `Pago de ${config.singular} interno: ${serviceName}`,
        service_data: {
          parentService: targetAssignedService.parentService || {},
          childService: targetAssignedService.childService || {},
          tariff: getTariff(targetAssignedService),
        },
        payment_deadline: null,
      });

      if (!response?.success) {
        throw new Error("No se pudo crear la solicitud de pago");
      }

      return {
        id: response.notification_id || response.data?.id || response.id,
        status: "pending",
        amount,
        itinerario_servicio_id: servicioId,
        voucher_reserva_id: targetVoucherReservaId,
      };
    },
    [config.singular, cotizacionPeopleDetails, serviceType],
  );

  const prepareMovimientoData = useCallback(
    async (targetVoucherReservaId, targetAssignedService, paymentRequest) => {
      let referenciaVoucherVenta = voucherId || null;
      if (!referenciaVoucherVenta && voucherCode) {
        try {
          const voucher =
            await voucherVentaService.getVoucherByCode(voucherCode);
          referenciaVoucherVenta = voucher?.id || null;
        } catch (error) {
          console.warn("No se pudo resolver voucher venta por código:", error);
        }
      }

      const amount = getPayableAmount(
        targetAssignedService,
        cotizacionPeopleDetails,
        serviceType,
      );
      const serviceName = getServiceName(
        targetAssignedService,
        config.singular,
      );

      const assignedServiceData = normalizePaymentServiceData({
        ...targetAssignedService,
        typeService: serviceType,
      });

      return {
        descripcion: `Pago de ${config.singular} del file ${voucherCode || targetVoucherReservaId}`,
        monto: amount,
        observaciones: `Pago de ${config.singular} interno: ${serviceName}`,
        contexto_pago: {
          tipo: "ServiciosVoucherReserva",
          payment_request_id: paymentRequest?.id,
          platform: cotizacionData?.platform || "venso",
          business_type: cotizacionData?.business_type || "B2C",
        },
        voucher_code: voucherCode,
        referencia_voucher_reserva: targetVoucherReservaId,
        referencia_voucher_venta: referenciaVoucherVenta,
        platform: cotizacionData?.platform || "venso",
        business_type: cotizacionData?.business_type || "B2C",
        payment_request_service_data: assignedServiceData,
        payment_request_itinerario_servicio_id:
          paymentRequest?.itinerario_servicio_id || null,
      };
    },
    [
      config.singular,
      cotizacionData,
      cotizacionPeopleDetails,
      serviceType,
      voucherCode,
      voucherId,
    ],
  );

  const handleCreateVoucherReserva = useCallback(async () => {
    if (!selectedService) {
      toast.error(`Selecciona un ${config.singular} primero`);
      return;
    }

    let serviceToAssign = assignedService;
    if (!serviceToAssign && serviceType !== "vuelos") {
      toast.error(`Debes seleccionar un ${config.singular} interno primero`);
      return;
    }

    const servicioId = getServicioId(selectedService);
    if (!servicioId) {
      toast.error("El servicio de la cotización no tiene ID normalizado");
      return;
    }

    setIsProcessing(true);
    try {
      if (serviceType === "vuelos") {
        serviceToAssign = await resolveFlightCatalogSelection(
          assignedAdultPriceDraft,
        );
      }

      if (!serviceToAssign) {
        toast.error(`Debes seleccionar un ${config.singular} interno primero`);
        return;
      }

      const targetVoucherReservaId = await ensureVoucherReserva();
      const normalizedAssignedService = normalizePaymentService({
        service: serviceToAssign,
        peopleDetails: cotizacionPeopleDetails,
        serviceType,
      });
      const assignmentPayload = buildAssignmentPayload(
        normalizedAssignedService,
        cotizacionPeopleDetails,
        serviceType,
      );

      await voucherReservaService.assignService(servicioId, assignmentPayload);

      const assignedWrapper = {
        ...selectedService,
        isAssigned: true,
        assignedPrecioServicio: assignmentPayload.assigned_precio_servicio,
        assigned_precio_servicio: assignmentPayload.assigned_precio_servicio,
        assignedPrecioTotal: assignmentPayload.assigned_precio_total,
        assigned_precio_total: assignmentPayload.assigned_precio_total,
        assignedService: {
          ...normalizedAssignedService,
          _trustAssignedTotal: true,
          assignedPrecioServicio: assignmentPayload.assigned_precio_servicio,
          assigned_precio_servicio: assignmentPayload.assigned_precio_servicio,
          assignedPrecioTotal: assignmentPayload.assigned_precio_total,
          assigned_precio_total: assignmentPayload.assigned_precio_total,
          assignedBeneficiariosAdultos:
            assignmentPayload.assigned_beneficiarios_adultos,
          assigned_beneficiarios_adultos:
            assignmentPayload.assigned_beneficiarios_adultos,
          assignedBeneficiariosNinos:
            assignmentPayload.assigned_beneficiarios_ninos,
          assigned_beneficiarios_ninos:
            assignmentPayload.assigned_beneficiarios_ninos,
          assignedPassengerSelection:
            assignmentPayload.assigned_passenger_selection,
          tariff: normalizedAssignedService.tariff || {},
        },
      };

      let paymentRequest = await getPaymentRequestForService(
        targetVoucherReservaId,
        selectedService,
      );

      if (!paymentRequest) {
        paymentRequest = await createPaymentRequest(
          targetVoucherReservaId,
          assignedWrapper.assignedService,
          selectedService,
        );
        toast.success("Solicitud de pago creada");
      }

      setExistingAssignment(assignedWrapper);
      setExistingPaymentRequest(paymentRequest);
      setPaymentRequestStatus(paymentRequest.status || "pending");
      setReservationPaymentRequests((current) =>
        mergePaymentRequests(current, [paymentRequest]),
      );

      await loadReservationContext();

      const movimientoData = await prepareMovimientoData(
        targetVoucherReservaId,
        assignedWrapper.assignedService,
        paymentRequest,
      );
      setShowMovimientoForm(movimientoData);
    } catch (error) {
      console.error("Error procesando pago separado:", error);
      toast.error(error.message || "Error al procesar el servicio");
    } finally {
      setIsProcessing(false);
      setIsSavingFlightCatalog(false);
    }
  }, [
    assignedAdultPriceDraft,
    assignedService,
    config.singular,
    cotizacionPeopleDetails,
    createPaymentRequest,
    ensureVoucherReserva,
    getPaymentRequestForService,
    loadReservationContext,
    prepareMovimientoData,
    resolveFlightCatalogSelection,
    selectedService,
    serviceType,
  ]);

  const handleRemoveExistingAssignment = useCallback(async () => {
    const targetAssignment = selectedExistingAssignment || existingAssignment;
    const servicioId = getServicioId(targetAssignment);
    if (!servicioId) {
      toast.error("No se pudo identificar el servicio asignado");
      return;
    }

    const status = selectedPaymentRequestStatus || paymentRequestStatus;
    if (["pending", "paid", "completed"].includes(status)) {
      toast.error(
        "No se puede quitar la asignación porque tiene un pago pendiente o registrado",
      );
      return;
    }

    setIsProcessing(true);
    try {
      await voucherReservaService.unassignService(servicioId);
      setExistingAssignment(null);
      setExistingPaymentRequest(null);
      setPaymentRequestStatus(null);
      await loadReservationContext();
      toast.success("Asignación quitada");
    } catch (error) {
      console.error("Error quitando asignación:", error);
      toast.error(error.message || "No se pudo quitar la asignación");
    } finally {
      setIsProcessing(false);
    }
  }, [
    existingAssignment,
    loadReservationContext,
    paymentRequestStatus,
    selectedExistingAssignment,
    selectedPaymentRequestStatus,
  ]);

  useEffect(
    () => () => {
      if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current);
    },
    [],
  );

  const handleCancelPaymentRequest = useCallback(
    async (paymentRequest = null) => {
      const targetRequest =
        paymentRequest || selectedPaymentRequest || existingPaymentRequest;
      const requestId = targetRequest?.id || targetRequest?.notification_id;
      const requestStatus = String(
        targetRequest?.status || targetRequest?.estado || "",
      ).toLowerCase();

      if (!requestId) {
        toast.error("No se pudo identificar la solicitud de pago");
        return;
      }
      if (requestStatus !== "pending" && requestStatus !== "requested") {
        toast.error("Solo se pueden cancelar solicitudes pendientes");
        return;
      }

      if (confirmingCancelId !== requestId) {
        setConfirmingCancelId(requestId);
        if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current);
        cancelTimerRef.current = setTimeout(
          () => setConfirmingCancelId(null),
          5000,
        );
        return;
      }

      setCancellingPaymentId(requestId);
      try {
        await voucherReservaService.cancelPendingPaymentRequest(
          requestId,
          "Cancelado desde pago de vuelos en ventas",
        );
        const cancelledServiceId = Number(targetRequest.itinerario_servicio_id);
        setReservationPaymentRequests((current) =>
          parseJsonArray(current).filter(
            (request) =>
              Number(request?.itinerario_servicio_id) !== cancelledServiceId,
          ),
        );
        if (
          Number(existingPaymentRequest?.itinerario_servicio_id) ===
          cancelledServiceId
        ) {
          setExistingPaymentRequest(null);
          setPaymentRequestStatus(null);
        }
        setConfirmingCancelId(null);
        window.dispatchEvent(
          new CustomEvent("paymentRequestCancelled", {
            detail: { paymentRequestId: requestId },
          }),
        );
        toast.success("Solicitud de pago cancelada");
        await loadReservationContext();
      } catch (error) {
        console.error("Error cancelando solicitud de pago:", error);
        toast.error(error.message || "No se pudo cancelar la solicitud");
      } finally {
        setCancellingPaymentId(null);
      }
    },
    [
      confirmingCancelId,
      existingPaymentRequest,
      loadReservationContext,
      selectedPaymentRequest,
    ],
  );

  const preparePaymentData = useCallback(async () => {
    const targetVoucherReservaId =
      voucherReservaId || existingVoucherReserva?.id;
    const targetSourceService = selectedExistingAssignment || existingAssignment;
    const targetAssignedService = normalizeAssignedService(targetSourceService);

    if (
      !targetVoucherReservaId ||
      !targetSourceService ||
      !targetAssignedService
    ) {
      toast.error("Faltan datos para preparar el pago");
      return null;
    }

    let paymentRequest = selectedPaymentRequest || existingPaymentRequest;
    if (!paymentRequest) {
      paymentRequest = await createPaymentRequest(
        targetVoucherReservaId,
        targetAssignedService,
        targetSourceService,
      );
      setExistingPaymentRequest(paymentRequest);
      setPaymentRequestStatus("pending");
      setReservationPaymentRequests((current) =>
        mergePaymentRequests(current, [paymentRequest]),
      );
    }

    return prepareMovimientoData(
      targetVoucherReservaId,
      targetAssignedService,
      paymentRequest,
    );
  }, [
    createPaymentRequest,
    existingAssignment,
    existingPaymentRequest,
    existingVoucherReserva,
    prepareMovimientoData,
    selectedExistingAssignment,
    selectedPaymentRequest,
    voucherReservaId,
  ]);

  const handleMovimientoSuccess = useCallback(async (movimiento = null) => {
    const paidService =
      selectedExistingAssignment || selectedService || existingAssignment;
    const paidRequest = selectedPaymentRequest || existingPaymentRequest;
    const paidServiceId = getServicioId(paidService);
    const movimientoId = Number(movimiento?.id || movimiento?.data?.id || 0) || null;

    toast.success(`Pago de ${config.singular} registrado correctamente`);
    setShowMovimientoForm(false);

    if (paidServiceId) {
      const paidRequestPatch = {
        ...(paidRequest || {}),
        status: "paid",
        estado: "paid",
        itinerario_servicio_id: paidServiceId,
        ...(movimientoId ? { movimiento_id: movimientoId } : {}),
      };
      setExistingPaymentRequest((current) =>
        !current
          ? paidRequestPatch
          : Number(current?.itinerario_servicio_id) === paidServiceId
          ? mergePaymentRequest(current, paidRequestPatch)
          : current,
      );
      setPaymentRequestStatus("paid");
      setReservationPaymentRequests((current) =>
        mergePaymentRequests(markPaymentRequestAsPaid(current, paidService), [
          paidRequestPatch,
        ]),
      );
    }

    await onPaymentSuccess?.();
    await loadReservationContext();
  }, [
    config.singular,
    existingAssignment,
    existingPaymentRequest,
    loadReservationContext,
    onPaymentSuccess,
    selectedExistingAssignment,
    selectedPaymentRequest,
    selectedService,
  ]);

  const assignedPassengerSelection = useMemo(
    () =>
      assignedService
        ? {
            ...(assignedService.passengerSelection ||
              assignedService.assignedPassengerSelection ||
              getPassengerSelection(assignedService, cotizacionPeopleDetails)),
            assignedChildExplicitPriceMap:
              assignedService.assignedChildExplicitPriceMap ||
              assignedService.passengerSelection
                ?.assignedChildExplicitPriceMap ||
              assignedService.passengerSelection?.childPriceMap ||
              {},
            convertedChildToAdultMap:
              assignedService.convertedChildToAdultMap ||
              assignedService.passengerSelection?.convertedChildToAdultMap ||
              {},
            childPercentageMap:
              assignedService.childPercentageMap ||
              assignedService.passengerSelection?.childPercentageMap ||
              {},
            uniformPercentage:
              assignedService.uniformPercentage ||
              assignedService.passengerSelection?.uniformPercentage ||
              "",
            pricingMode:
              assignedService.pricingMode ||
              assignedService.passengerSelection?.pricingMode ||
              "percentage",
            treatChildrenAsAdults:
              assignedService.treatChildrenAsAdults ||
              assignedService.passengerSelection?.treatChildrenAsAdults ||
              false,
          }
        : null,
    [assignedService, cotizacionPeopleDetails],
  );
  const assignedAdultUnit = useMemo(
    () =>
      assignedService
        ? round2(Number(getTariff(assignedService)?.precio || 0))
        : 0,
    [assignedService],
  );

  const assignedAdultCount = useMemo(
    () =>
      assignedPassengerSelection
        ? getBillableAdultCount(assignedPassengerSelection)
        : 0,
    [assignedPassengerSelection],
  );

  const assignedChildTotal = useMemo(
    () =>
      assignedPassengerSelection && assignedService
        ? (() => {
            const explicitMap =
              assignedPassengerSelection.assignedChildExplicitPriceMap || {};
            const explicitCount = Object.keys(explicitMap).filter(
              (id) =>
                !assignedPassengerSelection.convertedChildToAdultMap?.[id],
            ).length;
            const explicitTotal = round2(
              getExplicitChildTotal(assignedPassengerSelection),
            );

            if (explicitCount > 0) {
              return explicitTotal;
            }
            return round2(
              getPercentageChildTotal(
                assignedPassengerSelection,
                assignedAdultUnit,
              ),
            );
          })()
        : 0,
    [assignedPassengerSelection, assignedService, assignedAdultUnit],
  );

  const assignedPaymentAmount = useMemo(
    () =>
      assignedService
        ? getPayableAmount(
            assignedService,
            cotizacionPeopleDetails,
            serviceType,
          )
        : 0,
    [assignedService, cotizacionPeopleDetails, serviceType],
  );

  const quotedFlightBreakdown = useMemo(
    () =>
      serviceType === "vuelos" && selectedService
        ? getQuotedFlightBreakdown(selectedService, cotizacionPeopleDetails)
        : null,
    [cotizacionPeopleDetails, selectedService, serviceType],
  );

  const estimatedFlightProfit = useMemo(
    () =>
      quotedFlightBreakdown?.hasQuoteData
        ? round2(quotedFlightBreakdown.total - assignedPaymentAmount)
        : 0,
    [assignedPaymentAmount, quotedFlightBreakdown],
  );

  const estimatedFlightProfitStatus =
    estimatedFlightProfit > 0
      ? "positive"
      : estimatedFlightProfit < 0
        ? "negative"
        : "neutral";

  if (!isOpen) return null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={config.title}
        size="large"
      >
        <div className="flight-payment-modal">
          {isLoadingVoucherReserva ? (
            <div className="loading-state">
              <MdInfo />
              <p>Verificando voucher de reserva...</p>
            </div>
          ) : false && existingAssignment ? (
            <div className="existing-assignment-section">
              <div className="info-banner">
                <MdCheckCircle />
                <span>
                  Ya existe un {config.singular} asignado en este voucher de
                  reserva.
                </span>
              </div>

              <h3>{config.assignedTitle}</h3>
              {!["pending", "paid", "completed"].includes(
                paymentRequestStatus,
              ) && (
                <div className="assigned-header-actions">
                  <button
                    className="btn-header-remove"
                    onClick={handleRemoveExistingAssignment}
                    disabled={isProcessing}
                    title="Quitar asignación"
                  >
                    <MdDelete /> Quitar asignación
                  </button>
                </div>
              )}
              <div className="assigned-flight-card">
                <ServiceDetailedInfo
                  service={normalizeAssignedService(existingAssignment)}
                  typeService={serviceType}
                />
              </div>

              {existingPaymentRequest ? (
                <div
                  className={`payment-request-status ${paymentRequestStatus}`}
                >
                  <h4>Estado del pago</h4>
                  {paymentRequestStatus === "paid" ||
                  paymentRequestStatus === "completed" ? (
                    <div className="status-paid">
                      <span className="status-paid__message">
                        <MdCheckCircle />
                        Este {config.singular} ya está pagado
                      </span>
                      <div className="payment-request-actions payment-request-actions--paid">
                        <button
                          type="button"
                          className="btn-payment-evidence"
                          onClick={() => handleViewPaidMovement(existingPaymentRequest)}
                          disabled={Boolean(loadingPaidMovementAction)}
                        >
                          <MdVisibility /> Ver movimiento
                        </button>
                        <button
                          type="button"
                          className="btn-payment-evidence btn-payment-evidence--media"
                          onClick={() =>
                            handleUpdatePaidMovementMedia(existingPaymentRequest)
                          }
                          disabled={Boolean(loadingPaidMovementAction)}
                        >
                          <MdCloudUpload /> Actualizar archivos
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="status-pending">
                      <MdWarning />
                      <span>
                        Este {config.singular} tiene una solicitud de pago{" "}
                        {paymentRequestStatus || "pendiente"}.
                      </span>
                      <button
                        className="btn-primary"
                        onClick={async () => {
                          const paymentData = await preparePaymentData();
                          if (paymentData) setShowMovimientoForm(paymentData);
                        }}
                      >
                        <MdAttachMoney /> Completar pago
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="no-payment-request">
                  <MdWarning />
                  <p>No existe una solicitud de pago para este servicio.</p>
                  <button
                    className="btn-primary"
                    onClick={async () => {
                      const paymentData = await preparePaymentData();
                      if (paymentData) setShowMovimientoForm(paymentData);
                    }}
                  >
                    <MdAttachMoney /> Crear pago
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {existingVoucherReserva && (
                <div className="info-banner info-update">
                  <MdInfo />
                  <span>
                    Se actualizará el voucher de reserva existente con el{" "}
                    {config.singular} seleccionado.
                  </span>
                </div>
              )}

              <div className="flight-selection-section">
                <h3>
                  {config.icon} {config.selectTitle}
                </h3>

                <div className="flights-by-day">
                  {sourceServicesByDay.map((dayData, dayIdx) => (
                    <div key={dayIdx} className="day-flights-group">
                      <div className="day-header">
                        <MdCalendarToday />
                        <span>
                          Día {dayData.dayNumber}:{" "}
                          {dayData.dayData?.ciudad || dayData.dayData?.titulo}
                        </span>
                      </div>

                      <div className="flights-list">
                        {dayData.services.map((service, serviceIdx) => {
                          const cardStatus = getServiceCardStatus(service);
                          const cardPaymentRequest =
                            cardStatus === "paid"
                              ? getVisibleServicePaymentRequest(service)
                              : null;
                          const isSelected =
                            selectedService
                              ? isSameItineraryService(service, selectedService)
                              : selectedDayIndex === dayIdx &&
                                selectedServiceIndex === serviceIdx;
                          const serviceKey = getServiceGroupKey(
                            service,
                            `${dayIdx}:${serviceIdx}`,
                          );

                          return (
                            <div
                              key={serviceKey}
                              className={`flight-card flight-card--${cardStatus} ${
                                isSelected ? "selected" : ""
                              }`}
                              onClick={() =>
                                handleSelectService(dayIdx, serviceIdx)
                              }
                            >
                              <div className="flight-card__status-row">
                                {cardStatus !== "available" && (
                                  <span
                                    className={`flight-card__status flight-card__status--${cardStatus}`}
                                  >
                                    {cardStatus === "paid"
                                      ? "Pagado"
                                      : cardStatus === "pending"
                                        ? "Pago pendiente"
                                        : "Asignado"}
                                  </span>
                                )}
                              </div>
                              <ServiceDetailedInfo
                                service={service}
                                typeService={serviceType}
                              />
                              {cardPaymentRequest && !isSelected && (
                                <div className="flight-card__paid-actions">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleViewPaidMovement(cardPaymentRequest);
                                    }}
                                    disabled={Boolean(loadingPaidMovementAction)}
                                  >
                                    <MdVisibility /> Ver movimiento
                                  </button>
                                  <button
                                    type="button"
                                    className="is-media"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleUpdatePaidMovementMedia(cardPaymentRequest);
                                    }}
                                    disabled={Boolean(loadingPaidMovementAction)}
                                  >
                                    <MdCloudUpload /> Actualizar archivos
                                  </button>
                                </div>
                              )}
                              {isSelected && (
                                <div className="selected-indicator">
                                  <MdCheckCircle /> Seleccionado
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedService && selectedExistingAssignment && (
                <div className="existing-assignment-section existing-assignment-section--selected">
                  <div className="existing-assignment-header">
                    <MdCheckCircle />
                    <div>
                      <span>Servicio interno</span>
                      <strong>Asignado al {config.singular} seleccionado</strong>
                    </div>
                  </div>

                  <div className="assigned-flight-card">
                    <ServiceDetailedInfo
                      service={normalizeAssignedService(
                        selectedExistingAssignment,
                      )}
                      typeService={serviceType}
                    />
                  </div>

                  {!["pending", "paid", "completed"].includes(
                    selectedPaymentRequestStatus,
                  ) && (
                    <div className="assigned-header-actions">
                      <button
                        className="btn-header-remove"
                        onClick={handleRemoveExistingAssignment}
                        disabled={isProcessing}
                        title="Quitar asignación"
                      >
                        <MdDelete /> Quitar asignación
                      </button>
                    </div>
                  )}

                  {selectedPaymentRequest ? (
                    <div
                      className={`payment-request-status ${selectedPaymentRequestStatus || "pending"}`}
                    >
                      {selectedPaymentRequestStatus === "paid" ||
                      selectedPaymentRequestStatus === "completed" ? (
                        <div className="status-paid">
                          <span className="status-paid__message">
                            <MdCheckCircle />
                            Pago completado
                          </span>
                          <div className="payment-request-actions payment-request-actions--paid">
                            <button
                              type="button"
                              className="btn-payment-evidence"
                              onClick={() =>
                                handleViewPaidMovement(selectedPaymentRequest)
                              }
                              disabled={Boolean(loadingPaidMovementAction)}
                            >
                              <MdVisibility />
                              {loadingPaidMovementAction?.endsWith(":preview")
                                ? "Cargando…"
                                : "Ver movimiento"}
                            </button>
                            <button
                              type="button"
                              className="btn-payment-evidence btn-payment-evidence--media"
                              onClick={() =>
                                handleUpdatePaidMovementMedia(selectedPaymentRequest)
                              }
                              disabled={Boolean(loadingPaidMovementAction)}
                            >
                              <MdCloudUpload />
                              {loadingPaidMovementAction?.endsWith(":media")
                                ? "Cargando…"
                                : "Actualizar archivos"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="status-pending">
                          <MdWarning />
                          <span>
                            Este {config.singular} tiene una solicitud de pago{" "}
                            {selectedPaymentRequestStatus || "pendiente"}.
                          </span>
                          <div className="payment-request-actions">
                            <button
                              className="btn-primary"
                              onClick={async () => {
                                const paymentData = await preparePaymentData();
                                if (paymentData)
                                  setShowMovimientoForm(paymentData);
                              }}
                              disabled={isProcessing}
                            >
                              <MdAttachMoney /> Completar pago
                            </button>
                            {["pending", "requested"].includes(
                              selectedPaymentRequestStatus,
                            ) && (
                              <button
                                className={`btn-cancel-request ${
                                  confirmingCancelId ===
                                  (selectedPaymentRequest?.id ||
                                    selectedPaymentRequest?.notification_id)
                                    ? "confirming"
                                    : ""
                                }`}
                                onClick={() =>
                                  handleCancelPaymentRequest(
                                    selectedPaymentRequest,
                                  )
                                }
                                disabled={
                                  cancellingPaymentId ===
                                  (selectedPaymentRequest?.id ||
                                    selectedPaymentRequest?.notification_id)
                                }
                              >
                                <MdClose />
                                {cancellingPaymentId ===
                                (selectedPaymentRequest?.id ||
                                  selectedPaymentRequest?.notification_id)
                                  ? "Cancelando..."
                                  : confirmingCancelId ===
                                      (selectedPaymentRequest?.id ||
                                        selectedPaymentRequest?.notification_id)
                                    ? "Confirmar cancelación"
                                    : "Cancelar solicitud"}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="no-payment-request">
                      <MdWarning />
                      <p>No existe una solicitud de pago para este servicio.</p>
                      <button
                        className="btn-primary"
                        onClick={async () => {
                          const paymentData = await preparePaymentData();
                          if (paymentData) setShowMovimientoForm(paymentData);
                        }}
                      >
                        <MdAttachMoney /> Crear pago
                      </button>
                    </div>
                  )}
                </div>
              )}

              {selectedService && !selectedExistingAssignment && (
                <div className="assigned-flight-section">
                  <h3>{config.assignTitle}</h3>

                  {serviceType === "vuelos" && (
                    <div className="fpm-flight-builder">
                      <div className="fpm-flight-builder__header">
                        <div>
                          <strong>Vuelo del sistema</strong>
                          <span>
                            Elige o registra el vuelo y su tipo; el precio se
                            ingresa manualmente por pasajero.
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn-secondary fpm-icon-btn"
                          onClick={loadFlightCatalog}
                          disabled={isLoadingFlightCatalog}
                          title="Actualizar catálogo"
                        >
                          <MdRefresh />
                        </button>
                      </div>

                      <div className="fpm-flight-builder__grid fpm-flight-builder__grid--flight">
                        <label className="fpm-flight-field">
                          <span>Vuelo / aerolínea</span>
                          <SmartComboBox
                            value={flightNameInputValue}
                            onChange={handleFlightNameComboChange}
                            options={flightNameOptions}
                            loading={isLoadingFlightCatalog}
                            placeholder="Ej: LATAM Airlines"
                            className="fpm-smart-combo"
                          />
                          {false && (
                          <select
                            value={selectedFlightId}
                            onChange={(event) => {
                              const nextId = event.target.value;
                              const nextFlight = flightCatalog.find(
                                (flight) =>
                                  String(getFlightId(flight)) ===
                                  String(nextId),
                              );
                              setSelectedFlightId(nextId);
                              setSelectedFlightTypeId("");
                              setShowNewFlightForm(false);
                              setShowNewFlightTypeForm(false);
                              setNewFlightDraft((current) => ({
                                ...current,
                                procedencia: normalizeFlightOrigin(
                                  nextFlight?.procedencia ||
                                    current.procedencia,
                                ),
                              }));
                              setAssignedService(null);
                            }}
                            disabled={isLoadingFlightCatalog}
                          >
                            <option value="">Seleccionar vuelo</option>
                            {filteredFlightCatalog.map((flight) => {
                              const flightId = getFlightId(flight);
                              return (
                                <option key={flightId} value={flightId}>
                                  {flight?.nombre || "Vuelo"} ·{" "}
                                  {normalizeFlightOrigin(flight?.procedencia)}
                                </option>
                              );
                            })}
                          </select>
                          )}
                        </label>

                        <label className="fpm-flight-field">
                          <span>Procedencia</span>
                          <SmartComboBox
                            value={flightOriginInputValue}
                            onChange={handleFlightOriginComboChange}
                            options={flightOriginOptions}
                            loading={isLoadingFlightCatalog}
                            placeholder="Nacional o internacional"
                            className="fpm-smart-combo"
                          />
                          {false && (
                          <select
                            value={selectedFlightOrigin}
                            onChange={(event) => {
                              setNewFlightDraft((current) => ({
                                ...current,
                                procedencia: event.target.value,
                              }));
                              setSelectedFlightId("");
                              setSelectedFlightTypeId("");
                              setFlightTypes([]);
                              setAssignedService(null);
                            }}
                            disabled={isLoadingFlightCatalog}
                          >
                            <option value="nacional">Nacional</option>
                            <option value="internacional">Internacional</option>
                            {false && flightTypes.map((flightType) => {
                              const flightTypeId = getFlightTypeId(flightType);
                              const route = [
                                flightType?.lugar_ida,
                                flightType?.lugar_vuelta,
                              ]
                                .filter(Boolean)
                                .join(" → ");
                              return (
                                <option
                                  key={flightTypeId}
                                  value={flightTypeId}
                                >
                                  {flightType?.tipovuelo ||
                                    flightType?.tipo_vuelo ||
                                    "Tipo de vuelo"}
                                  {route ? ` · ${route}` : ""}
                                </option>
                              );
                            })}
                          </select>
                          )}
                        </label>

                        <label className="fpm-flight-field">
                          <span>Precio por pasajero</span>
                          <div className="fpm-flight-price-input">
                            <MdAttachMoney />
                            <input
                              className="fpm__price-step-locked"
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Ingresar precio"
                              value={assignedAdultPriceDraft}
                              onChange={handleAssignedAdultPriceChange}
                              onBlur={handleAssignedAdultPriceBlur}
                              onWheel={blurPriceInputOnWheel}
                              onKeyDown={preventPriceInputStepKeys}
                            />
                          </div>
                        </label>
                      </div>

                      <div className="fpm-flight-builder__grid fpm-flight-builder__grid--type-main">
                        <label className="fpm-flight-field fpm-flight-field--wide">
                          <span>Tipo de vuelo</span>
                          <SmartComboBox
                            value={flightTypeInputValue}
                            onChange={handleFlightTypeComboChange}
                            options={flightTypeOptionValues.tipovuelo}
                            loading={isLoadingFlightCatalog}
                            placeholder="Ej: Económica"
                            className="fpm-smart-combo"
                          />
                        </label>

                        <label className="fpm-flight-field">
                          <span>Lugar ida</span>
                          <SmartComboBox
                            value={newFlightTypeDraft.lugar_ida}
                            onChange={(value) =>
                              handleFlightTypeFieldChange("lugar_ida", value)
                            }
                            options={flightTypeOptionValues.lugarIda}
                            placeholder="Lima"
                            className="fpm-smart-combo"
                          />
                        </label>

                        <label className="fpm-flight-field">
                          <span>Lugar vuelta</span>
                          <SmartComboBox
                            value={newFlightTypeDraft.lugar_vuelta}
                            onChange={(value) =>
                              handleFlightTypeFieldChange("lugar_vuelta", value)
                            }
                            options={flightTypeOptionValues.lugarVuelta}
                            placeholder="Cusco"
                            className="fpm-smart-combo"
                          />
                        </label>

                        <label className="fpm-flight-field">
                          <span>Salida</span>
                          <SmartComboBox
                            value={newFlightTypeDraft.hora_salida}
                            onChange={(value) =>
                              handleFlightTypeFieldChange("hora_salida", value)
                            }
                            options={[
                              ...flightTypeOptionValues.salida,
                              ...FLIGHT_TIME_OPTIONS,
                            ]}
                            placeholder="07:30"
                            className="fpm-smart-combo"
                          />
                        </label>

                        <label className="fpm-flight-field">
                          <span>Llegada</span>
                          <SmartComboBox
                            value={newFlightTypeDraft.hora_llegada}
                            onChange={(value) =>
                              handleFlightTypeFieldChange("hora_llegada", value)
                            }
                            options={[
                              ...flightTypeOptionValues.llegada,
                              ...FLIGHT_TIME_OPTIONS,
                            ]}
                            placeholder="09:00"
                            className="fpm-smart-combo"
                          />
                        </label>

                        <label className="fpm-flight-field">
                          <span>Equipaje</span>
                          <SmartComboBox
                            value={newFlightTypeDraft.equipaje}
                            onChange={(value) =>
                              handleFlightTypeFieldChange("equipaje", value)
                            }
                            options={flightTypeOptionValues.equipaje}
                            placeholder="23kg + cabina"
                            className="fpm-smart-combo"
                          />
                        </label>
                      </div>

                      {effectiveFlightType && (
                        <div className="fpm-flight-route-card">
                          <strong>
                            {effectiveFlightType?.lugar_ida || "Origen"} -&gt;{" "}
                            {effectiveFlightType?.lugar_vuelta || "Destino"}
                          </strong>
                          <span>
                            Salida:{" "}
                            {String(effectiveFlightType?.hora_salida || "--").slice(0, 5)}
                            {" · "}
                            Llegada:{" "}
                            {String(effectiveFlightType?.hora_llegada || "--").slice(0, 5)}
                          </span>
                          {effectiveFlightType?.equipaje && (
                            <small>Equipaje: {effectiveFlightType.equipaje}</small>
                          )}
                        </div>
                      )}

                      <div className="fpm-auto-create-note fpm-auto-create-note--inline">
                        Si el vuelo o tipo no existe, se registrará automáticamente al proceder al pago.
                      </div>

                      {false && (<>
                      <div className="fpm-flight-builder__actions">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => {
                            setShowNewFlightForm((value) => !value);
                            setShowNewFlightTypeForm(false);
                            setSelectedFlightId("");
                            setSelectedFlightTypeId("");
                            setAssignedService(null);
                          }}
                        >
                          <MdAdd />{" "}
                          {showNewFlightForm
                            ? "Usar vuelo existente"
                            : "Personalizar vuelo"}
                        </button>
                      </div>

                      {showNewFlightForm && (
                        <div className="fpm-inline-create fpm-inline-create--flight">
                          <label className="fpm-flight-field">
                            <span>Aerolínea / vuelo</span>
                            <input
                              list="fpm-flight-name-options"
                              value={newFlightDraft.nombre}
                              onChange={(event) => {
                                setNewFlightDraft((current) => ({
                                  ...current,
                                  nombre: event.target.value,
                                }));
                                setAssignedService(null);
                              }}
                              placeholder="Ej: LATAM Airlines"
                            />
                          </label>
                          <label className="fpm-flight-field">
                            <span>Procedencia</span>
                            <select
                              value={newFlightDraft.procedencia}
                              onChange={(event) => {
                                setNewFlightDraft((current) => ({
                                  ...current,
                                  procedencia: event.target.value,
                                }));
                                setAssignedService(null);
                              }}
                            >
                              <option value="nacional">Nacional</option>
                              <option value="internacional">Internacional</option>
                            </select>
                          </label>
                          <span className="fpm-auto-create-note">
                            Se usará uno existente si coincide; si no, se creará
                            al proceder al pago.
                          </span>
                        </div>
                      )}

                      <div className="fpm-flight-builder__grid fpm-flight-builder__grid--type">
                        <label className="fpm-flight-field">
                          <span>Tipo de vuelo</span>
                          <select
                            value={selectedFlightTypeId}
                            onChange={(event) => {
                              const nextId = event.target.value;
                              const nextType = flightTypes.find(
                                (flightType) =>
                                  String(getFlightTypeId(flightType)) ===
                                  String(nextId),
                              );
                              setSelectedFlightTypeId(nextId);
                              setShowNewFlightTypeForm(false);
                              setNewFlightTypeDraft({
                                tipovuelo:
                                  nextType?.tipovuelo ||
                                  nextType?.tipo_vuelo ||
                                  "",
                                lugar_ida: nextType?.lugar_ida || "",
                                lugar_vuelta: nextType?.lugar_vuelta || "",
                                hora_salida: String(
                                  nextType?.hora_salida || "",
                                ).slice(0, 5),
                                hora_llegada: String(
                                  nextType?.hora_llegada || "",
                                ).slice(0, 5),
                                equipaje: nextType?.equipaje || "",
                              });
                              setAssignedService(null);
                            }}
                            disabled={
                              (!selectedFlightId && !showNewFlightForm) ||
                              isLoadingFlightCatalog
                            }
                          >
                            <option value="">Seleccionar tipo</option>
                            {flightTypes.map((flightType) => {
                              const flightTypeId = getFlightTypeId(flightType);
                              const route = [
                                flightType?.lugar_ida,
                                flightType?.lugar_vuelta,
                              ]
                                .filter(Boolean)
                                .join(" -> ");
                              return (
                                <option key={flightTypeId} value={flightTypeId}>
                                  {flightType?.tipovuelo ||
                                    flightType?.tipo_vuelo ||
                                    "Tipo de vuelo"}
                                  {route ? ` · ${route}` : ""}
                                </option>
                              );
                            })}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="btn-secondary fpm-customize-type-btn"
                          onClick={() => {
                            setShowNewFlightTypeForm((value) => !value);
                            if (!showNewFlightTypeForm && selectedFlightType) {
                              setNewFlightTypeDraft({
                                tipovuelo:
                                  selectedFlightType?.tipovuelo ||
                                  selectedFlightType?.tipo_vuelo ||
                                  "",
                                lugar_ida: selectedFlightType?.lugar_ida || "",
                                lugar_vuelta:
                                  selectedFlightType?.lugar_vuelta || "",
                                hora_salida: String(
                                  selectedFlightType?.hora_salida || "",
                                ).slice(0, 5),
                                hora_llegada: String(
                                  selectedFlightType?.hora_llegada || "",
                                ).slice(0, 5),
                                equipaje: selectedFlightType?.equipaje || "",
                              });
                            }
                            setAssignedService(null);
                          }}
                          disabled={!effectiveFlight}
                        >
                          <MdAdd />{" "}
                          {showNewFlightTypeForm
                            ? "Usar tipo existente"
                            : "Personalizar tipo"}
                        </button>
                      </div>

                      {showNewFlightTypeForm && (
                        <div className="fpm-inline-create fpm-inline-create--type">
                          <label className="fpm-flight-field">
                            <span>Clase / tipo</span>
                            <input
                              list="fpm-flight-type-options"
                              value={newFlightTypeDraft.tipovuelo}
                              onChange={(event) =>
                                setNewFlightTypeDraft((current) => ({
                                  ...current,
                                  tipovuelo: event.target.value,
                                }))
                              }
                              placeholder="Ej: Económica"
                            />
                          </label>
                          <label className="fpm-flight-field">
                            <span>Lugar ida</span>
                            <input
                              list="fpm-flight-origin-options"
                              value={newFlightTypeDraft.lugar_ida}
                              onChange={(event) =>
                                setNewFlightTypeDraft((current) => ({
                                  ...current,
                                  lugar_ida: event.target.value,
                                }))
                              }
                              placeholder="Lima"
                            />
                          </label>
                          <label className="fpm-flight-field">
                            <span>Lugar vuelta</span>
                            <input
                              list="fpm-flight-destination-options"
                              value={newFlightTypeDraft.lugar_vuelta}
                              onChange={(event) =>
                                setNewFlightTypeDraft((current) => ({
                                  ...current,
                                  lugar_vuelta: event.target.value,
                                }))
                              }
                              placeholder="Cusco"
                            />
                          </label>
                          <label className="fpm-flight-field">
                            <span>Salida</span>
                            <input
                              type="time"
                              value={newFlightTypeDraft.hora_salida}
                              onChange={(event) =>
                                setNewFlightTypeDraft((current) => ({
                                  ...current,
                                  hora_salida: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="fpm-flight-field">
                            <span>Llegada</span>
                            <input
                              type="time"
                              value={newFlightTypeDraft.hora_llegada}
                              onChange={(event) =>
                                setNewFlightTypeDraft((current) => ({
                                  ...current,
                                  hora_llegada: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="fpm-flight-field">
                            <span>Equipaje</span>
                            <input
                              list="fpm-flight-baggage-options"
                              value={newFlightTypeDraft.equipaje}
                              onChange={(event) =>
                                setNewFlightTypeDraft((current) => ({
                                  ...current,
                                  equipaje: event.target.value,
                                }))
                              }
                              placeholder="23kg + cabina"
                            />
                          </label>
                          <span className="fpm-auto-create-note">
                            El tipo se creará solo si no existe una ruta igual.
                          </span>
                        </div>
                      )}

                      {effectiveFlightType && (
                        <div className="fpm-flight-route-card">
                          <strong>
                            {selectedFlightType?.lugar_ida || "Origen"} →{" "}
                            {selectedFlightType?.lugar_vuelta || "Destino"}
                          </strong>
                          <span>
                            Salida: {selectedFlightType?.hora_salida || "--"} ·
                            Llegada: {selectedFlightType?.hora_llegada || "--"}
                          </span>
                          {selectedFlightType?.equipaje && (
                            <small>Equipaje: {selectedFlightType.equipaje}</small>
                          )}
                        </div>
                      )}

                      <datalist id="fpm-flight-name-options">
                        {flightNameOptions.map((name) => (
                          <option key={name} value={name} />
                        ))}
                      </datalist>
                      <datalist id="fpm-flight-type-options">
                        {flightTypeOptionValues.tipovuelo.map((value) => (
                          <option key={value} value={value} />
                        ))}
                      </datalist>
                      <datalist id="fpm-flight-origin-options">
                        {flightTypeOptionValues.lugarIda.map((value) => (
                          <option key={value} value={value} />
                        ))}
                      </datalist>
                      <datalist id="fpm-flight-destination-options">
                        {flightTypeOptionValues.lugarVuelta.map((value) => (
                          <option key={value} value={value} />
                        ))}
                      </datalist>
                      <datalist id="fpm-flight-baggage-options">
                        {flightTypeOptionValues.equipaje.map((value) => (
                          <option key={value} value={value} />
                        ))}
                      </datalist>

                      </>)}
                      {false && (<>
                      <div className="fpm-flight-builder__actions">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setShowNewFlightForm((value) => !value)}
                        >
                          <MdAdd /> Nuevo vuelo
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() =>
                            setShowNewFlightTypeForm((value) => !value)
                          }
                          disabled={!selectedFlightId}
                        >
                          <MdAdd /> Nuevo tipo
                        </button>
                      </div>

                      {showNewFlightForm && (
                        <div className="fpm-inline-create">
                          <input
                            value={newFlightDraft.nombre}
                            onChange={(event) =>
                              setNewFlightDraft((current) => ({
                                ...current,
                                nombre: event.target.value,
                              }))
                            }
                            placeholder="Nombre del vuelo o aerolínea"
                          />
                          <select
                            value={newFlightDraft.procedencia}
                            onChange={(event) =>
                              setNewFlightDraft((current) => ({
                                ...current,
                                procedencia: event.target.value,
                              }))
                            }
                          >
                            <option value="nacional">Nacional</option>
                            <option value="internacional">Internacional</option>
                          </select>
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={handleCreateFlight}
                            disabled={isSavingFlightCatalog}
                          >
                            Guardar vuelo
                          </button>
                        </div>
                      )}

                      {showNewFlightTypeForm && (
                        <div className="fpm-inline-create fpm-inline-create--type">
                          <input
                            value={newFlightTypeDraft.tipovuelo}
                            onChange={(event) =>
                              setNewFlightTypeDraft((current) => ({
                                ...current,
                                tipovuelo: event.target.value,
                              }))
                            }
                            placeholder="Tipo de vuelo"
                          />
                          <input
                            value={newFlightTypeDraft.lugar_ida}
                            onChange={(event) =>
                              setNewFlightTypeDraft((current) => ({
                                ...current,
                                lugar_ida: event.target.value,
                              }))
                            }
                            placeholder="Lugar ida"
                          />
                          <input
                            value={newFlightTypeDraft.lugar_vuelta}
                            onChange={(event) =>
                              setNewFlightTypeDraft((current) => ({
                                ...current,
                                lugar_vuelta: event.target.value,
                              }))
                            }
                            placeholder="Lugar vuelta"
                          />
                          <input
                            type="time"
                            value={newFlightTypeDraft.hora_salida}
                            onChange={(event) =>
                              setNewFlightTypeDraft((current) => ({
                                ...current,
                                hora_salida: event.target.value,
                              }))
                            }
                          />
                          <input
                            type="time"
                            value={newFlightTypeDraft.hora_llegada}
                            onChange={(event) =>
                              setNewFlightTypeDraft((current) => ({
                                ...current,
                                hora_llegada: event.target.value,
                              }))
                            }
                          />
                          <input
                            value={newFlightTypeDraft.equipaje}
                            onChange={(event) =>
                              setNewFlightTypeDraft((current) => ({
                                ...current,
                                equipaje: event.target.value,
                              }))
                            }
                            placeholder="Equipaje"
                          />
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={handleCreateFlightType}
                            disabled={isSavingFlightCatalog}
                          >
                            Guardar tipo
                          </button>
                        </div>
                      )}
                      </>)}
                    </div>
                  )}

                  {!assignedService ? (
                    serviceType === "vuelos" ? (
                      <div className="warning-message warning-message--soft">
                        <MdInfo />
                        <span>
                          Selecciona vuelo, tipo de vuelo y precio por pasajero
                          para preparar la asignación.
                        </span>
                      </div>
                    ) : (
                    <button
                      className="btn-primary"
                      onClick={handleOpenServicePicker}
                      disabled={isProcessing}
                    >
                      {config.icon} Seleccionar {config.singular} interno
                    </button>
                    )
                  ) : (
                    <div className="assigned-flight-display">
                      <div className="assigned-flight-header">
                        <h4>{config.assignedTitle}</h4>
                        {serviceType !== "vuelos" && (
                          <button
                            className="btn-secondary"
                            onClick={handleOpenServicePicker}
                            disabled={isProcessing}
                          >
                            Cambiar
                          </button>
                        )}
                      </div>
                      <ServiceDetailedInfo
                        service={assignedService}
                        typeService={serviceType}
                      />

                      <div className="fpm__adult-price-editor">
                        <div className="fpm__adult-price-copy">
                          <span>Precio por adulto</span>
                          <small>
                            Se usará para guardar el precio unitario asignado.
                          </small>
                        </div>
                        <label className="fpm__adult-price-input">
                          <MdAttachMoney />
                          <input
                            className="fpm__price-step-locked"
                            type="number"
                            min="0"
                            step="0.01"
                            value={assignedAdultPriceDraft}
                            onChange={handleAssignedAdultPriceChange}
                            onBlur={handleAssignedAdultPriceBlur}
                            onWheel={blurPriceInputOnWheel}
                            onKeyDown={(event) => {
                              if (preventPriceInputStepKeys(event)) return;
                              if (event.key === "Enter") {
                                event.currentTarget.blur();
                              }
                            }}
                          />
                        </label>
                      </div>

                      {payableChildPassengerIds.length > 0 &&
                        assignedPassengerSelection && (
                          <FpmChildrenPanel
                            childPassengerIds={payableChildPassengerIds}
                            passengerSelection={assignedPassengerSelection}
                            adultUnit={assignedAdultUnit}
                            getDisplayName={(id) =>
                              getDisplayNameForPassengerId(
                                id,
                                cotizacionPeopleDetails,
                              )
                            }
                            onUpdatePricing={updateAssignedChildPricing}
                          />
                        )}

                      {serviceType === "vuelos" &&
                        quotedFlightBreakdown?.hasQuoteData && (
                          <section className="fpm__commercial-summary">
                            <div className="fpm__commercial-summary-head">
                              <div className="fpm__commercial-summary-title">
                                <MdInfo />
                                <div>
                                  <strong>
                                    Cotización del vuelo seleccionado
                                  </strong>
                                  <span>
                                    Ingreso vendido al pasajero frente al costo
                                    real que se pagará al proveedor.
                                  </span>
                                </div>
                              </div>
                              <span className="fpm__commercial-summary-badge">
                                Cotización vs. pago
                              </span>
                            </div>

                            <div className="fpm__commercial-metrics">
                              <article className="fpm__commercial-metric">
                                <span>Cotizado por adulto</span>
                                <strong>
                                  {formatUsd(quotedFlightBreakdown.adultUnit)}
                                </strong>
                                <small>
                                  {quotedFlightBreakdown.adultCount} adulto
                                  {quotedFlightBreakdown.adultCount === 1
                                    ? ""
                                    : "s"}
                                </small>
                              </article>

                              <article className="fpm__commercial-metric">
                                <span>Cotizado por niño</span>
                                <strong>
                                  {formatUsd(quotedFlightBreakdown.childUnit)}
                                </strong>
                                <small>
                                  {quotedFlightBreakdown.childCount > 0
                                    ? `${quotedFlightBreakdown.childCount} niño${
                                        quotedFlightBreakdown.childCount === 1
                                          ? ""
                                          : "s"
                                      }${
                                        quotedFlightBreakdown.childCount > 1
                                          ? " · promedio"
                                          : ""
                                      }`
                                    : "Sin niños cotizados"}
                                </small>
                              </article>

                              <article className="fpm__commercial-metric fpm__commercial-metric--total">
                                <span>Total cotizado en vuelo</span>
                                <strong>
                                  {formatUsd(quotedFlightBreakdown.total)}
                                </strong>
                                <small>
                                  Solo el vuelo seleccionado, sin otros
                                  servicios
                                </small>
                              </article>
                            </div>

                            <div
                              className={`fpm__profit-summary fpm__profit-summary--${estimatedFlightProfitStatus}`}
                            >
                              <div>
                                <span>
                                  {estimatedFlightProfitStatus === "positive"
                                    ? "Ganancia estimada"
                                    : estimatedFlightProfitStatus ===
                                        "negative"
                                      ? "Pérdida estimada"
                                      : "Margen estimado"}
                                </span>
                                <small>
                                  {formatUsd(quotedFlightBreakdown.total)}
                                  {" cotizado - "}
                                  {formatUsd(assignedPaymentAmount)} a pagar
                                </small>
                              </div>
                              <strong>
                                {formatSignedUsd(estimatedFlightProfit)}
                              </strong>
                            </div>
                          </section>
                        )}

                      <div className="payment-amount">
                        <MdAttachMoney />
                        <span>
                          Monto a pagar: {formatUsd(assignedPaymentAmount)}
                        </span>
                      </div>
                      {assignedAdultUnit > 0 && (
                        <div className="fpm__payment-breakdown">
                          <span>
                            {assignedAdultCount} adultos x {formatUsd(assignedAdultUnit)}
                          </span>
                          {payableChildPassengerIds.length > 0 && (
                            <span>Niños: {formatUsd(assignedChildTotal)}</span>
                          )}
                          <strong>
                            Total: {formatUsd(assignedPaymentAmount)}
                          </strong>
                        </div>
                      )}

                      <button
                        className="btn-success"
                        onClick={handleCreateVoucherReserva}
                        disabled={isProcessing}
                      >
                        {isProcessing ? "Procesando..." : "Proceder al pago"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {!selectedService && !sourceServicesByDay.length && (
                <div className="warning-message">
                  <MdWarning />
                  <span>
                    Esta cotización no tiene {config.plural} disponibles.
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

      {showServicePicker && serviceType !== "vuelos" && (
        <ServicePicker
          onSelectService={handleServiceSelected}
          onClose={() => setShowServicePicker(false)}
          packageType="compartido"
          selectedDay={sourceServicesByDay[selectedDayIndex]?.dayNumber || 1}
          filterTariffType="interna"
          platform="mil"
          preselectedCategory={serviceType}
          totalPassengers={effectivePaymentPassengerCount}
          peopleDetails={cotizacionPeopleDetails}
        />
      )}

      {showMovimientoForm && typeof showMovimientoForm === "object" && (
        <MovimientoForm
          tipo="egreso"
          isOpen={true}
          onClose={() => setShowMovimientoForm(false)}
          onSuccess={handleMovimientoSuccess}
          initialData={showMovimientoForm}
        />
      )}

      {selectedMovimiento && (
        <MovimientoPreviewModal
          isOpen={true}
          movimiento={selectedMovimiento}
          onClose={() => setSelectedMovimiento(null)}
        />
      )}

      {mediaEditMovimiento && (
        <MovimientoForm
          tipo={mediaEditMovimiento?.tipo_movimiento || "egreso"}
          isOpen={true}
          mode="edit"
          mediaOnly={true}
          initialData={mediaEditMovimiento}
          onClose={() => setMediaEditMovimiento(null)}
          onSuccess={() => setMediaEditMovimiento(null)}
        />
      )}
    </>
  );
};

export default FlightPaymentModal;
