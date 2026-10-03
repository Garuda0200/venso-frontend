import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import Modal from "../../../../../components/UI/Modal/Modal";
import {
  MdCheck,
  MdWarning,
  MdCalendarToday,
  MdEvent,
  MdDateRange,
  MdPerson,
  MdChildCare,
  MdReceipt,
  MdArrowBack,
  MdPictureAsPdf,
  MdExpandMore,
  MdExpandLess,
} from "react-icons/md";
import { invalidateReservaAssignmentGraphCache } from "../../../../../utils/cacheInvalidation";
import "./ServiceAssignmentModal.scss";
import { voucherReservaService } from "../../../../../services/voucherReservaService";
import { voucherVentaService } from "../../../../../services/voucherVentaService";
import pasajeroService from "../../../../../services/pasajeroService";
import * as cotizacionService from "../../../../Ventas/Cotizaciones/hooks/cotizacionService";
import ReservaServiceEditor from "../ReservaServiceEditor/ReservaServiceEditor";
import VentasSummaryPDFModal from "../../../../Ventas/VouchersVenta/components/VentasSummaryPDFModal/VentasSummaryPDFModal";
import ReservationRequestModal, {
  buildReservationProviderGroups,
  getReservationProviderName,
  getReservationServiceDetails,
  getReservationServiceName,
  getReservationServiceTypeKey,
  getReservationServiceTypeLabel,
} from "./ReservationRequestModal/ReservationRequestModal";
import { buildAssignedFlatPricingState } from "../ReservaServiceEditor/utils/editorHelpers";
import { useAssignmentAutosave } from "./hooks/useAssignmentAutosave";
import AssignmentSaveStatus from "./components/AssignmentSaveStatus";
import {
  getPassengerIdsByType,
  getTourCapacity,
} from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/unifiedServiceManager";
import {
  buildRuntimePassengerSelection,
  getServicePassengerPricingState,
} from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/passengerPricingState";
import { getAssignedTariff, resolveServiceType } from "../../utils/serviceAssignment";
import { hydrateItinerarioFromDB } from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/itinerarioCleanupUtils";
import {
  buildTicketProcedenciaPassengerSelection,
  getTicketPassengerTargetGroup,
  getTicketProcedencia,
  normalizeTicketProcedencia,
} from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/ticketBeneficiaries";
import {
  getCanonicalReservationPassengerType,
  normalizeReservationPassengerRows,
} from "../../utils/passengerClassification";

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const normalizePeopleDetails = (raw) => {
  if (!raw) return null;

  if (raw.peopledetails) return normalizePeopleDetails(raw.peopledetails);
  if (raw.peopleDetails) return normalizePeopleDetails(raw.peopleDetails);
  if (raw.passengerData) return normalizePeopleDetails(raw.passengerData);
  if (raw.passenger_data) return normalizePeopleDetails(raw.passenger_data);

  const adults = Array.isArray(raw.adults) ? raw.adults : [];
  const children = Array.isArray(raw.children) ? raw.children : [];
  const infants = Array.isArray(raw.infants) ? raw.infants : [];

  if (adults.length > 0 || children.length > 0 || infants.length > 0) {
    return {
      ...raw,
      adults,
      children,
      infants,
    };
  }

  if (Array.isArray(raw.details)) {
    const normalized = {
      ...raw,
      adults: [],
      children: [],
      infants: [],
      details: raw.details,
    };

    raw.details.forEach((person) => {
      const passengerType = getCanonicalReservationPassengerType(person);
      if (passengerType === "infant") normalized.infants.push(person);
      else if (passengerType === "child") normalized.children.push(person);
      else normalized.adults.push(person);
    });

    return normalized;
  }

  return null;
};

const normalizeItineraryDays = (value) => {
  let days = [];

  if (Array.isArray(value)) {
    days = value;
  } else if (value && typeof value === "object") {
    days = Object.values(value).filter((day) => day && typeof day === "object");
  } else if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      days = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object"
          ? Object.values(parsed)
          : [];
    } catch {
      days = [];
    }
  }

  return hydrateItinerarioFromDB(days);
};

const getServiceStableId = (service = {}) =>
  service.servicioId ?? service.id ?? service.itinerarioServicioId ?? null;

const markExternalService = (service = {}) => ({
  ...service,
  servicioId: service.servicioId ?? service.id ?? service.itinerarioServicioId,
  sourceItinerary: "external",
  isExternalItinerary: true,
});

const mergeExternalItineraryDays = (baseDays = [], externalDays = []) => {
  const dayMap = new Map();

  (Array.isArray(baseDays) ? baseDays : []).forEach((day, index) => {
    const dayNumber = Number(day?.numero || index + 1);
    const current = dayMap.get(dayNumber);
    const nextServices = Array.isArray(day?.servicios) ? day.servicios : [];

    if (!current) {
      dayMap.set(dayNumber, {
        ...day,
        numero: dayNumber,
        servicios: [...nextServices],
      });
      return;
    }

    const existingIds = new Set(
      (current.servicios || [])
        .map(getServiceStableId)
        .filter((id) => id !== null && id !== undefined)
        .map(String),
    );
    const servicesToAppend = nextServices.filter((service) => {
      const stableId = getServiceStableId(service);
      if (stableId == null) return true;
      return !existingIds.has(String(stableId));
    });

    dayMap.set(dayNumber, {
      ...current,
      titulo: current.titulo || day?.titulo,
      ciudades: current.ciudades || day?.ciudades,
      servicios: [...(current.servicios || []), ...servicesToAppend],
    });
  });

  (Array.isArray(externalDays) ? externalDays : []).forEach((day, index) => {
    const dayNumber = Number(day?.numero || baseDays.length + index + 1);
    const externalServices = (
      Array.isArray(day?.servicios) ? day.servicios : []
    )
      .map(markExternalService)
      .filter((service) => service.servicioId);

    if (externalServices.length === 0) return;

    const current = dayMap.get(dayNumber) || {
      ...day,
      numero: dayNumber,
      titulo: day?.titulo || `Día ${dayNumber}`,
      ciudades: Array.isArray(day?.ciudades) ? day.ciudades : [],
      servicios: [],
    };

    const existingIds = new Set(
      (current.servicios || [])
        .map(getServiceStableId)
        .filter((id) => id !== null && id !== undefined)
        .map(String),
    );

    const servicesToAppend = externalServices.filter((service) => {
      const stableId = getServiceStableId(service);
      if (stableId == null) return false;
      return !existingIds.has(String(stableId));
    });

    if (servicesToAppend.length === 0) {
      dayMap.set(dayNumber, current);
      return;
    }

    dayMap.set(dayNumber, {
      ...current,
      servicios: [...(current.servicios || []), ...servicesToAppend],
    });
  });

  return Array.from(dayMap.values()).sort(
    (left, right) => Number(left.numero || 0) - Number(right.numero || 0),
  );
};

const countPeopleDetailsPassengers = (peopleDetails) => {
  const normalized = normalizePeopleDetails(peopleDetails);
  if (!normalized) return 1;

  if (Array.isArray(normalized.details) && normalized.details.length > 0) {
    return Math.max(1, normalized.details.length);
  }

  return Math.max(
    1,
    (normalized.adults || []).length +
      (normalized.children || []).length +
      (normalized.infants || []).length,
  );
};

const normalizePassengersToPeopleDetails = (passengers = []) => {
  if (!Array.isArray(passengers) || passengers.length === 0) {
    return null;
  }

  return normalizeReservationPassengerRows(
    passengers.map((passenger) => ({
      ...passenger,
      age: passenger?.age ?? passenger?.edad ?? null,
    })),
  );
};

const hasItineraryServices = (value) =>
  normalizeItineraryDays(value).some(
    (day) => Array.isArray(day?.servicios) && day.servicios.length > 0,
  );

const isExternalReservationService = (service = {}) =>
  service?.isExternalItinerary === true ||
  service?.sourceItinerary === "external" ||
  service?.source_itinerary === "external";

const isHotelReservationService = (service = {}) => {
  const rawType =
    resolveServiceType(service) ||
    service?.typeService ||
    service?.type_service ||
    service?.assignedService?.typeService ||
    service?.parentService?.typeService ||
    service?.assignedParentService?.typeService ||
    "";

  return String(rawType).toLowerCase().includes("hotel");
};

const isAssignedReservationService = (service = {}) =>
  service?.isAssigned === true ||
  service?.is_assigned === true ||
  Boolean(
    service?.assignedService &&
    Object.keys(service.assignedService || {}).length > 0,
  );

const shouldStripInheritedChildAdultPricing = (service = {}) =>
  isExternalReservationService(service) &&
  !isAssignedReservationService(service) &&
  !isHotelReservationService(service);

const normalizeChildrenAsChildrenSelection = (
  selection = {},
  peopleDetails = {},
) => {
  const fallbackPassengerIds = getPassengerIdsByType(peopleDetails || {});
  const selectedIds =
    Array.isArray(selection?.selectedIds) && selection.selectedIds.length > 0
      ? selection.selectedIds.filter(Boolean)
      : fallbackPassengerIds.allPassengerIds;
  const childIds = selectedIds.filter(
    (id) => typeof id === "string" && id.startsWith("child:"),
  );

  return {
    ...(selection || {}),
    selectedIds,
    assignedPassengerCount:
      selection?.assignedPassengerCount || selectedIds.length,
    assignedChildExplicitCount:
      typeof selection?.assignedChildExplicitCount === "number"
        ? selection.assignedChildExplicitCount
        : childIds.length,
    assignedChildExplicitPriceMap:
      selection?.assignedChildExplicitPriceMap || selection?.preciosNinos || {},
    assignedChildExplicitPriceSum:
      selection?.assignedChildExplicitPriceSum || 0,
    pricingMode:
      selection?.pricingMode === "adult"
        ? "percentage"
        : selection?.pricingMode || "percentage",
    treatChildrenAsAdults: false,
    convertedChildToAdultMap: {},
    ninosComoAdulto: {},
  };
};

const getAssignedTariffFromService = (service) => {
  const assignedTariff = getAssignedTariff(service);

  if (!assignedTariff) return null;
  return JSON.parse(JSON.stringify(assignedTariff));
};

const getReservationTicketConstraint = (source = {}) => {
  if (!source || typeof source !== "object") return null;

  const procedencia = normalizeTicketProcedencia(getTicketProcedencia(source));
  const targetGroup = getTicketPassengerTargetGroup(source);

  if (!procedencia || !["adult", "child", "all"].includes(targetGroup)) {
    return null;
  }

  return { procedencia, targetGroup };
};

const hasIncompatiblePersistedTicketAssignment = (service = {}) => {
  const serviceType = String(resolveServiceType(service) || "").toLowerCase();
  if (!serviceType.includes("ticket")) return false;
  if (!(service?.isAssigned || service?.is_assigned)) return false;

  const quotedConstraint = getReservationTicketConstraint(
    service?.childService || service?.child_service || service,
  );
  const assignedConstraint = getReservationTicketConstraint(
    service?.assignedChildService ||
      service?.assigned_child_service ||
      service?.assignedService?.childService ||
      service?.assignedService?.child_service ||
      {},
  );

  if (!quotedConstraint || !assignedConstraint) return false;

  return (
    quotedConstraint.procedencia !== assignedConstraint.procedencia ||
    quotedConstraint.targetGroup !== assignedConstraint.targetGroup
  );
};

const clearPersistedTicketAssignment = (service = {}) => ({
  ...service,
  isAssigned: false,
  is_assigned: false,
  assignedService: null,
  assignedParentService: null,
  assignedChildService: null,
  assigned_parent_service: null,
  assigned_child_service: null,
  assignedTariff: null,
  assignedParentId: null,
  assignedChildId: null,
  assigned_parent_id: null,
  assigned_child_id: null,
  assignedPassengerSelection: null,
  assigned_passenger_selection: null,
  assignedPassengerIds: [],
  assigned_passenger_ids: [],
  assignedPassengerCount: 0,
  assigned_passenger_count: 0,
  assignedBeneficiariosAdultos: [],
  assignedBeneficiariosNinos: [],
  assigned_beneficiarios_adultos: [],
  assigned_beneficiarios_ninos: [],
  assignedMoneda: null,
  assigned_moneda: null,
  assignedPrecioServicio: null,
  assigned_precio_servicio: null,
  assignedPrecioTotal: null,
  assigned_precio_total: null,
  assignedIgv: null,
  assigned_igv: null,
  assignedPrecioAdultoDividido: null,
  assigned_precio_adulto_dividido: null,
  assignedCapacidadLimite: null,
  assigned_capacidad_limite: null,
  ticketAssignmentNeedsReview: true,
});

// Reconstruir convertedChildToAdultMap desde assigned_beneficiarios_adultos
// Formato DaysEditor: { [childId]: true }
const reconstructConvertedChildToAdultMapFromBeneficiarios = (
  beneficiariosAdultos = [],
) => {
  const map = {};
  if (Array.isArray(beneficiariosAdultos)) {
    beneficiariosAdultos.forEach((entry) => {
      if (entry?.child_origin) {
        // Format: { id: "adult:2", child_origin: "child:0:1" }
        // Convertir a DaysEditor format: { "child:0:1": true }
        map[entry.child_origin] = true;
      }
    });
  }
  return map;
};

const getAssignedPassengerSelectionFromService = (service) => {
  const assignedTariff = getAssignedTariffFromService(service);
  const baseSelection =
    service?.assignedPassengerSelection ||
    service?.assigned_passenger_selection ||
    service?.assignedService?.assignedPassengerSelection ||
    assignedTariff?.assignedPassengerSelection ||
    assignedTariff?.passengerSelection ||
    service?.assignedService?.passengerSelection ||
    service?.passengerSelection ||
    null;

  // Reconstruir convertedChildToAdultMap desde assigned_beneficiarios_adultos si no existe
  const beneficiariosAdultos =
    service?.assignedBeneficiariosAdultos ||
    service?.assigned_beneficiarios_adultos ||
    service?.assignedService?.assignedBeneficiariosAdultos ||
    service?.assignedService?.beneficiariosAdultos ||
    service?.beneficiariosAdultos;

  const reconstructedConvertedMap =
    reconstructConvertedChildToAdultMapFromBeneficiarios(beneficiariosAdultos);

  const pricingCarrier = {
    ...service,
    beneficiariosAdultos,
    beneficiariosNinos:
      service?.assignedBeneficiariosNinos ||
      service?.assigned_beneficiarios_ninos ||
      service?.assignedService?.assignedBeneficiariosNinos ||
      service?.assignedService?.beneficiariosNinos ||
      service?.beneficiariosNinos,
    tariff:
      assignedTariff ||
      service?.assignedService?.tariff ||
      service?.tariff ||
      {},
    passengerSelection: baseSelection || {},
    assignedPassengerIds:
      service?.assignedPassengerIds || service?.assigned_passenger_ids,
    assignedPassengerCount:
      service?.assignedPassengerCount || service?.assigned_passenger_count,
    assignedChildExplicitPriceMap:
      service?.assignedChildExplicitPriceMap ||
      service?.assignedService?.assignedChildExplicitPriceMap ||
      service?.assignedService?.assignedPassengerSelection
        ?.assignedChildExplicitPriceMap,
    assignedChildExplicitPriceSum:
      service?.assignedChildExplicitPriceSum ||
      service?.assignedService?.assignedChildExplicitPriceSum ||
      service?.assignedService?.assignedPassengerSelection
        ?.assignedChildExplicitPriceSum,
    assignedChildExplicitCount:
      service?.assignedChildExplicitCount ||
      service?.assignedService?.assignedChildExplicitCount ||
      service?.assignedService?.assignedPassengerSelection
        ?.assignedChildExplicitCount,
    pricingMode: service?.pricingMode,
    childPercentageMap: service?.childPercentageMap,
    uniformPercentage: service?.uniformPercentage,
    treatChildrenAsAdults: service?.treatChildrenAsAdults,
    convertedChildToAdultMap:
      service?.convertedChildToAdultMap ||
      service?.assignedService?.convertedChildToAdultMap ||
      service?.assignedService?.assignedPassengerSelection
        ?.convertedChildToAdultMap ||
      reconstructedConvertedMap,
  };

  const pricingState = getServicePassengerPricingState(
    pricingCarrier,
    baseSelection || undefined,
  );

  return buildRuntimePassengerSelection(baseSelection || {}, pricingState);
};

const normalizeReservationPassengerSelection = (
  service,
  peopleDetails,
  selection = null,
) => {
  const baseSelection = selection
    ? JSON.parse(JSON.stringify(selection))
    : JSON.parse(
        JSON.stringify(getAssignedPassengerSelectionFromService(service)),
      );
  const fallbackPassengerIds = getPassengerIdsByType(peopleDetails || {});
  const serviceType = String(resolveServiceType(service) || "").toLowerCase();

  if (serviceType.includes("ticket")) {
    const quotedTicket = service?.childService || service?.child_service || service || {};
    const ticketSelection = buildTicketProcedenciaPassengerSelection({
      childService: quotedTicket,
      peopleDetails: peopleDetails || {},
      passengerSelection: baseSelection || {},
    });
    if (ticketSelection?.selectedIds?.length > 0) return ticketSelection;
  }

  const selectedIds =
    Array.isArray(baseSelection?.selectedIds) &&
    baseSelection.selectedIds.length > 0
      ? baseSelection.selectedIds
      : Array.isArray(service?.assignedPassengerIds) &&
          service.assignedPassengerIds.length > 0
        ? service.assignedPassengerIds
        : Array.isArray(service?.assigned_passenger_ids) &&
            service.assigned_passenger_ids.length > 0
          ? service.assigned_passenger_ids
          : fallbackPassengerIds.allPassengerIds;

  const childIds = selectedIds.filter(
    (id) => typeof id === "string" && id.startsWith("child:"),
  );

  const normalizedSelection = {
    ...(baseSelection || {}),
    selectedIds,
    assignedPassengerCount:
      baseSelection?.assignedPassengerCount || selectedIds.length,
    assignedChildExplicitCount:
      typeof baseSelection?.assignedChildExplicitCount === "number"
        ? baseSelection.assignedChildExplicitCount
        : childIds.length,
    assignedChildExplicitPriceMap:
      baseSelection?.assignedChildExplicitPriceMap ||
      // new lean format fallback
      baseSelection?.preciosNinos ||
      {},
    assignedChildExplicitPriceSum:
      baseSelection?.assignedChildExplicitPriceSum || 0,
  };

  return shouldStripInheritedChildAdultPricing(service)
    ? normalizeChildrenAsChildrenSelection(normalizedSelection, peopleDetails)
    : normalizedSelection;
};

/**
 * Builds flat assigned pricing fields for the backend DTO.
 * Uses the new schema: no precio in adult beneficiaries, division booleans instead.
 */
const buildFlatAssignedPayload = (service) => {
  const baseTariff =
    service?.assignedService?.tariff || service?.assignedTariff || {};
  const passengerSelection = getAssignedPassengerSelectionFromService(service);
  const assignedChildService =
    service?.assignedService?.childService ||
    service?.assignedChildService ||
    service?.childService ||
    {};
  const typeService = String(
    resolveServiceType(service) ||
      service?.assignedService?.typeService ||
      service?.assignedService?.parentService?.typeService ||
      service?.assignedParentService?.typeService ||
      service?.typeService ||
      service?.parentService?.typeService ||
      "",
  ).toLowerCase();

  const inferredIsDivided =
    typeService.includes("transporte") ||
    typeService.includes("hotel") ||
    typeService.includes("guia") ||
    (typeService.includes("endose") &&
      getTourCapacity(assignedChildService) != null);
  const isDivided = Boolean(
    service?.assignedPrecioAdultoDividido ??
    service?.assigned_precio_adulto_dividido ??
    service?.assignedService?.assignedPrecioAdultoDividido ??
    service?.assignedService?.assigned_precio_adulto_dividido ??
    service?.assignedService?.precioAdultoDividido ??
    service?.precioAdultoDividido ??
    inferredIsDivided,
  );
  const inferredIsCapLimited =
    typeService.includes("transporte") ||
    typeService.includes("hotel") ||
    (typeService.includes("endose") &&
      getTourCapacity(assignedChildService) != null);
  const isCapLimited = Boolean(
    service?.assignedCapacidadLimite ??
    service?.assigned_capacidad_limite ??
    service?.assignedService?.assignedCapacidadLimite ??
    service?.assignedService?.assigned_capacidad_limite ??
    service?.assignedService?.capacidadLimite ??
    service?.capacidadLimite ??
    inferredIsCapLimited,
  );

  // El editor ya sincroniza la tarifa cuando cambia precio o beneficiarios.
  // Guardar/autoguardar solo debe serializar ese estado. Recalcular aquí hacía
  // que una tarifa dividida volviera a dividirse o multiplicarse en cada PUT.
  const tariffForPersistence = {
    ...baseTariff,
    passengerSelection,
    assignedPassengerSelection: passengerSelection,
  };
  const flatPricing = buildAssignedFlatPricingState({
    tariff: tariffForPersistence,
    passengerSelection,
    precioAdultoDividido: isDivided,
  });

  const adultBeneficiaries = flatPricing.assignedBeneficiariosAdultos || [];
  const childBeneficiaries = flatPricing.assignedBeneficiariosNinos || [];
  const adultBeneficiaryCount = Math.max(1, adultBeneficiaries.length);
  const childExtrasTotal = round2(
    childBeneficiaries.reduce(
      (sum, child) => sum + (Number(child.precio) || 0),
      0,
    ),
  );

  const precioServicio = round2(
    flatPricing.assignedPrecioServicio ??
      service?.assignedPrecioServicio ??
      service?.assigned_precio_servicio ??
      service?.assignedService?.assignedPrecioServicio ??
      service?.assignedService?.assigned_precio_servicio ??
      (isDivided ? baseTariff.precio_original : baseTariff.precio) ??
      0,
  );
  const precioTotal = round2(
    baseTariff.precio_original_with_child_extras ??
      flatPricing.assignedPrecioTotal ??
      service?.assignedPrecioTotal ??
      service?.assigned_precio_total ??
      service?.assignedService?.assignedPrecioTotal ??
      service?.assignedService?.assigned_precio_total ??
      baseTariff.precio_original ??
      (isDivided
        ? precioServicio + childExtrasTotal
        : precioServicio * adultBeneficiaryCount + childExtrasTotal),
  );

  return {
    assigned_moneda:
      baseTariff.moneda ||
      service?.assignedMoneda ||
      service?.assigned_moneda ||
      service?.assignedService?.assignedMoneda ||
      service?.assignedService?.assigned_moneda ||
      "dolares",
    assigned_precio_servicio: precioServicio,
    assigned_precio_total: precioTotal,
    assigned_igv: Boolean(
      baseTariff.tieneIgv ??
        baseTariff.tiene_igv ??
        service?.assignedIgv ??
        service?.assigned_igv ??
        service?.assignedService?.assignedIgv ??
        service?.assignedService?.assigned_igv,
    ),
    assigned_precio_adulto_dividido: isDivided,
    assigned_capacidad_limite: isCapLimited,
    assigned_beneficiarios_adultos: adultBeneficiaries,
    assigned_beneficiarios_ninos: childBeneficiaries,
  };
};

// Format date for input field - handles various date formats
const formatDateForInput = (dateValue) => {
  if (!dateValue) return "";

  try {
    // Check if already formatted as YYYY-MM-DD
    if (
      typeof dateValue === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
    ) {
      return dateValue;
    }

    // Handle Date objects or date strings
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) {
      console.error("Invalid date value:", dateValue);
      return "";
    }

    // Format as YYYY-MM-DD
    return date.toISOString().split("T")[0];
  } catch (error) {
    console.error("Error formatting date:", error);
    return "";
  }
};

const getFirstValue = (...values) => {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }
  return null;
};

const resolveAssignmentTravelDates = ({
  voucher = {},
  fullVoucherData = {},
  cotizacionData = {},
}) => {
  const quote =
    cotizacionData ||
    fullVoucherData?.cotizacion_data ||
    fullVoucherData?.cotizacionData ||
    voucher?.cotizacionData ||
    voucher?.cotizacion_data ||
    voucher?.reservationVoucher?.cotizacionData ||
    voucher?.reservationVoucher?.cotizacion_data ||
    {};
  const start = getFirstValue(quote?.fechainicio);
  const end = getFirstValue(quote?.fechafin);
  return { start, end, source: start || end ? "Cotización" : "" };
};

const getPeopleCounts = (peopleDetails) => {
  const normalized = normalizePeopleDetails(peopleDetails);
  const adults = normalized?.adults?.length || 0;
  const children = normalized?.children?.length || 0;
  const infants = normalized?.infants?.length || 0;
  return {
    adults,
    children,
    infants,
    total: adults + children + infants,
  };
};

// Add isEditing prop and enhance the component to handle both create and edit modes
const ServiceAssignmentModal = ({
  isOpen,
  onClose,
  voucher,
  onSave,
  isProcessing,
  isEditing = false,
  asPage = false,
  pageTitle,
}) => {
  // State for the cotizacion itinerary (from the voucher)
  const [cotizacionItinerary, setCotizacionItinerary] = useState([]);

  // State for the voucher itinerary (to be assigned)
  const [voucherItinerary, setVoucherItinerary] = useState([]);

  const [peopleDetails, setPeopleDetails] = useState(null);

  const [passengerSelection, setPassengerSelection] = useState(null);

  const [cotizacionMeta, setCotizacionMeta] = useState(null);
  const [travelDateSource, setTravelDateSource] = useState("");

  // State for start and end dates - ensure these are properly initialized
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");

  // Loading and error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const pageRootRef = useRef(null);
  const pageHeaderRef = useRef(null);

  // Add missing state variables
  const [currentStep, setCurrentStep] = useState(1);
  const [validationError, setValidationError] = useState(null);
  const [serviceAssignments, setServiceAssignments] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const autosave = useAssignmentAutosave(voucher, buildFlatAssignedPayload, isOpen);
  const [validationInProgress, setValidationInProgress] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeInProgress = useRef(false);
  const activeVoucherId = useRef(voucher?.id);
  activeVoucherId.current = voucher?.id;
  useEffect(() => { setValidationInProgress(false); }, [voucher?.id]);
  const isSaving = autosave.state === "saving" || validationInProgress || closing;
  useEffect(() => {
    if (autosave.recoveryRevision) setRefreshTrigger(value => value + 1);
  }, [autosave.recoveryRevision]);
  const [showVentasSummaryPdfModal, setShowVentasSummaryPdfModal] =
    useState(false);
  const [expandedProviderType, setExpandedProviderType] = useState(null);
  const [reservationRequestData, setReservationRequestData] = useState(null);

  // State for selected services
  const [selectedServices, setSelectedServices] = useState([]);

  // State for loading status
  const [isLoading, setIsLoading] = useState(true);

  // Inicialización al abrir modal
  useEffect(() => {
    if (isOpen && voucher) {
      setCurrentStep(1);

      setValidationError(null);

      if (voucher.reservationVoucher) {
        setEditMode(true);
        // Las fechas se cargan en el useEffect de loadCotizacionData
      } else {
        setServiceAssignments([]);
        setEditMode(false);
      }
      setCotizacionMeta(null);
      setTravelDateSource("");
    }
  }, [isOpen, voucher]);

  useEffect(() => {
    if (voucherItinerary.length > 0) {
      // Asignar el itinerario actualizado a serviceAssignments
      setServiceAssignments([...voucherItinerary]);
    }
  }, [voucherItinerary]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePaymentRequestUpdate = (event) => {
      const normalizeValue = (value) => {
        if (value === null || value === undefined) return null;
        const normalized = String(value).trim();
        return normalized.length > 0 ? normalized : null;
      };

      const collectValues = (value) => {
        if (Array.isArray(value)) {
          return value.map(normalizeValue).filter(Boolean);
        }

        const normalized = normalizeValue(value);
        return normalized ? [normalized] : [];
      };

      const voucherReservaId = normalizeValue(voucher?.reservationVoucher?.id);
      const voucherCodes = new Set(
        [
          voucher?.reservationVoucher?.voucher_code,
          voucher?.reservationVoucher?.voucherCode,
          voucher?.voucher_code,
          voucher?.voucherCode,
        ]
          .map(normalizeValue)
          .filter(Boolean),
      );
      const eventVoucherIds = [
        ...collectValues(event.detail?.voucher_reserva_id),
        ...collectValues(event.detail?.voucherReservaId),
        ...collectValues(event.detail?.voucher_reserva_ids),
        ...collectValues(event.detail?.voucherReservaIds),
      ];
      const eventVoucherCodes = [
        ...collectValues(event.detail?.voucher_code),
        ...collectValues(event.detail?.voucherCode),
        ...collectValues(event.detail?.voucher_codes),
        ...collectValues(event.detail?.voucherCodes),
      ];

      const isForThisVoucher =
        (!!voucherReservaId && eventVoucherIds.includes(voucherReservaId)) ||
        eventVoucherCodes.some((code) => voucherCodes.has(code));

      if (isForThisVoucher) {
        invalidateReservaAssignmentGraphCache();
        setRefreshTrigger((prev) => prev + 1);
      }
    };

    window.addEventListener(
      "paymentRequestCreated",
      handlePaymentRequestUpdate,
    );
    window.addEventListener(
      "paymentRequestCompleted",
      handlePaymentRequestUpdate,
    );
    window.addEventListener("paymentRequestPaid", handlePaymentRequestUpdate);
    window.addEventListener(
      "paymentRequestCancelled",
      handlePaymentRequestUpdate,
    );

    return () => {
      window.removeEventListener(
        "paymentRequestCreated",
        handlePaymentRequestUpdate,
      );
      window.removeEventListener(
        "paymentRequestCompleted",
        handlePaymentRequestUpdate,
      );
      window.removeEventListener(
        "paymentRequestPaid",
        handlePaymentRequestUpdate,
      );
      window.removeEventListener(
        "paymentRequestCancelled",
        handlePaymentRequestUpdate,
      );
    };
  }, [isOpen, voucher]);

  // Inicializar itinerarios desde voucher data — NORMALIZADO
  // Ahora el itinerario viene de las tablas normalizadas, no de un blob assigned_itinerary
  useEffect(() => {
    if (!voucher || !isOpen) return;
    let disposed = false;

    const loadCotizacionData = async () => {
      try {
        setLoading(true);

        // ── 1. Cargar itinerario normalizado por voucher_venta_id ──
        // El backend retorna el itinerario enriquecido con campos de asignación (isAssigned, assignedParentService, etc.)
        let normalizedItinerary = [];
        try {
          normalizedItinerary =
            await voucherReservaService.getItinerarioByVoucherVenta(voucher.id);
          console.log("Itinerario normalizado cargado:", normalizedItinerary);
        } catch (fetchError) {
          console.warn("No se pudo cargar itinerario normalizado:", fetchError);
        }

        // ── 2. Cargar datos de la cotización para peopleDetails ──
        let cotizacionData = null;
        let voucherWithCotizacion = null;
        let voucherPassengers = [];
        try {
          voucherWithCotizacion =
            await voucherVentaService.getVoucherWithCotizacionById(voucher.id);
          if (voucherWithCotizacion?.data) {
            cotizacionData =
              voucherWithCotizacion.data.cotizacion_data ||
              voucherWithCotizacion.data.cotizacionData ||
              voucherWithCotizacion.data.cotizacion;
          }
        } catch (fetchError) {
          console.warn("No se pudo hacer fetch de cotización:", fetchError);
          cotizacionData = voucher.cotizacionData || voucher.cotizacion;
        }

        const fullVoucherData = voucherWithCotizacion?.data || {};
        const cotizacionId =
          cotizacionData?.id ||
          fullVoucherData.cotizacion_id ||
          fullVoucherData.cotizacionId ||
          voucher?.cotizacionId ||
          voucher?.cotizacion_id ||
          voucher?.cotizacionData?.id ||
          null;

        if (cotizacionId) {
          try {
            const freshCotizacion =
              await cotizacionService.getCotizacionById(cotizacionId);
            cotizacionData = {
              ...(cotizacionData || {}),
              ...(freshCotizacion || {}),
              peopleDetails:
                cotizacionData?.peopleDetails ||
                cotizacionData?.peopledetails ||
                freshCotizacion?.peopleDetails ||
                freshCotizacion?.peopledetails,
              peopledetails:
                cotizacionData?.peopledetails ||
                cotizacionData?.peopleDetails ||
                freshCotizacion?.peopledetails ||
                freshCotizacion?.peopleDetails,
            };
          } catch (freshError) {
            const hasBase = hasItineraryServices(cotizacionData?.itinerario);
            const hasExternal = hasItineraryServices(
              cotizacionData?.itinerario_externo ||
                cotizacionData?.itinerarioExterno,
            );
            if (!hasBase || !hasExternal) {
              console.warn(
                "No se pudo cargar cotizacion completa para edicion de reserva:",
                freshError,
              );
            }
          }
        }

        const resolvedTravelDates = resolveAssignmentTravelDates({
          voucher,
          fullVoucherData,
          cotizacionData,
        });
        if (disposed) return;
        setFechaInicio(formatDateForInput(resolvedTravelDates.start));
        setFechaFin(formatDateForInput(resolvedTravelDates.end));
        setTravelDateSource(resolvedTravelDates.source);
        setCotizacionMeta({
          id:
            cotizacionData?.id ||
            fullVoucherData.cotizacion_id ||
            voucher?.cotizacionId ||
            voucher?.cotizacion_id ||
            null,
          titulo:
            cotizacionData?.titulo ||
            cotizacionData?.nombre ||
            cotizacionData?.title ||
            voucher?.cotizacionData?.titulo ||
            null,
          platform:
            fullVoucherData.platform ||
            cotizacionData?.platform ||
            voucher?.platform ||
            null,
          businessType:
            fullVoucherData.business_type ||
            cotizacionData?.business_type ||
            voucher?.business_type ||
            null,
        });

        try {
          const voucherVentaId = Number(
            voucher?.reservationVoucher?.voucherId ??
              voucher?.reservationVoucher?.voucher_id ??
              voucher?.voucherId ?? voucher?.voucher_id ?? voucher?.id,
          );
          if (Number.isFinite(voucherVentaId) && voucherVentaId > 0) {
            voucherPassengers =
              (await pasajeroService.getPassengersByVoucherVenta(voucherVentaId)) || [];
          } else if (voucher?.reservationVoucher?.id) {
            const reservationPassengers =
              await pasajeroService.getPassengersByVoucherReserva(voucher.reservationVoucher.id);
            voucherPassengers = reservationPassengers?.passengers || [];
          }
        } catch (passengerError) {
          console.warn(
            "No se pudieron cargar pasajeros del voucher:",
            passengerError,
          );
        }

        if (disposed) return;
        const normalizedPeopleDetails =
          normalizePassengersToPeopleDetails(voucherPassengers) ||
          normalizePeopleDetails(cotizacionData) ||
          normalizePeopleDetails(cotizacionData?.cotizacion) ||
          normalizePeopleDetails(voucherWithCotizacion?.data) ||
          normalizePeopleDetails(voucher) ||
          null;

        setPeopleDetails(normalizedPeopleDetails);

        const externalCotizacionItinerary = normalizeItineraryDays(
          cotizacionData?.itinerario_externo ||
            cotizacionData?.itinerarioExterno ||
            cotizacionData?.externalItinerary ||
            cotizacionData?.data?.itinerario_externo ||
            [],
        );

        // ── 3. Usar el itinerario normalizado como fuente única de verdad ──
        if (
          normalizedItinerary &&
          Array.isArray(normalizedItinerary) &&
          normalizedItinerary.length > 0
        ) {
          // El itinerario ya viene con la estructura correcta del backend:
          // { numero, titulo, ciudades, servicios: [{ typeService, parentService, childService, tariff,
          // isAssigned, assignedParentService, assignedChildService, servicioId, hora, ... }] }

          // Cargar payment requests si estamos editando un voucher existente
          let paymentRequestsMap = {};
          if (isEditing && voucher.reservationVoucher?.id) {
            try {
              const prs =
                await voucherReservaService.getPaymentRequestsByVoucherReservaId(
                  voucher.reservationVoucher.id,
                );
              if (Array.isArray(prs)) {
                prs.forEach((pr) => {
                  if (pr.itinerario_servicio_id) {
                    paymentRequestsMap[pr.itinerario_servicio_id] = pr;
                  }
                });
              }
            } catch (prError) {
              console.warn("No se pudieron cargar payment requests:", prError);
            }
          }

          if (disposed) return;
          const combinedItinerary = mergeExternalItineraryDays(
            normalizeItineraryDays(normalizedItinerary),
            externalCotizacionItinerary,
          );

          const formattedItinerary = combinedItinerary.map((day) => ({
            ...day,
            servicios: (day.servicios || []).map((svc) => {
              const hasInvalidTicketAssignment =
                hasIncompatiblePersistedTicketAssignment(svc);
              const serviceForEditor = hasInvalidTicketAssignment
                ? clearPersistedTicketAssignment(svc)
                : svc;
              const normalizedPassengerSelection =
                normalizeReservationPassengerSelection(
                  serviceForEditor,
                  normalizedPeopleDetails,
                );

              // Reconstruir convertedChildToAdultMap desde assigned_beneficiarios_adultos
              const reconstructedConvertedMap =
                reconstructConvertedChildToAdultMapFromBeneficiarios(
                  serviceForEditor?.assigned_beneficiarios_adultos ||
                    serviceForEditor?.assignedBeneficiariosAdultos,
                );
              const stripInheritedChildAdult =
                shouldStripInheritedChildAdultPricing(serviceForEditor);
              const effectiveConvertedMap = stripInheritedChildAdult
                ? {}
                : reconstructedConvertedMap;

              // Asegurar que el mapa esté en la selección de pasajeros
              const enrichedPassengerSelection = {
                ...normalizedPassengerSelection,
                convertedChildToAdultMap:
                  normalizedPassengerSelection?.convertedChildToAdultMap ||
                  effectiveConvertedMap,
              };

              return {
                ...serviceForEditor,
                servicioId:
                  serviceForEditor.servicioId ??
                  serviceForEditor.id ??
                  serviceForEditor.itinerarioServicioId,
                isAssigned: Boolean(
                  serviceForEditor.isAssigned || serviceForEditor.is_assigned,
                ),
                assignedTariff: getAssignedTariffFromService(serviceForEditor),
                assignedPassengerIds: enrichedPassengerSelection.selectedIds,
                assignedPassengerSelection: enrichedPassengerSelection,
                convertedChildToAdultMap: effectiveConvertedMap,
                // Inyectar paymentRequest desde el mapa (match por servicioId)
                paymentRequest: getServiceStableId(svc)
                  ? paymentRequestsMap[getServiceStableId(svc)] || null
                  : null,
                // Mantener compatibilidad: el backend retorna assignedParentService/assignedChildService
                // pero el editor usa assignedService como wrapper
                assignedService:
                  serviceForEditor.isAssigned || serviceForEditor.is_assigned
                    ? {
                        typeService:
                          resolveServiceType(serviceForEditor) ||
                          serviceForEditor.typeService,
                        parentService: serviceForEditor.assignedParentService,
                        childService: serviceForEditor.assignedChildService,
                        tariff:
                          getAssignedTariffFromService(serviceForEditor) ||
                          serviceForEditor.tariff,
                        hora: serviceForEditor.hora || "",
                        passengerSelection: enrichedPassengerSelection,
                        assignedPassengerSelection: enrichedPassengerSelection,
                        convertedChildToAdultMap: effectiveConvertedMap,
                      }
                    : null,
              };
            }),
          }));

          setCotizacionItinerary(formattedItinerary);
          const visibleItinerary = autosave.load(formattedItinerary);
          setVoucherItinerary(visibleItinerary);
          setServiceAssignments(visibleItinerary);
        } else {
          // Fallback: usar itinerario de la cotización directamente
          let itinerario = normalizeItineraryDays(
            cotizacionData?.itinerario ||
              cotizacionData?.dias ||
              cotizacionData?.data?.itinerario ||
              [],
          );
          if (!itinerario || !Array.isArray(itinerario)) {
            throw new Error("No se encontró el itinerario de la cotización");
          }

          const formattedCotizacionItinerary = mergeExternalItineraryDays(
            itinerario,
            externalCotizacionItinerary,
          ).map((day) => ({
            ...day,
            servicios: (day.servicios || []).map((svc) => ({
              ...svc,
              servicioId: svc.servicioId ?? svc.id ?? svc.itinerarioServicioId,
              assignedService: null,
              isAssigned: false,
            })),
          }));

          setCotizacionItinerary(formattedCotizacionItinerary);
          const visibleItinerary = autosave.load(formattedCotizacionItinerary);
          setVoucherItinerary(visibleItinerary);
          setServiceAssignments(visibleItinerary);
        }
      } catch (err) {
        if (disposed) return;
        console.error("Error initializing itineraries:", err);
        setError(err.message || "Error al cargar el itinerario");
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    loadCotizacionData();
    return () => { disposed = true; };
  }, [voucher, isEditing, isOpen, refreshTrigger]);

  // Effect to fetch existing assigned services if in edit mode
  useEffect(() => {
    if (isEditing && voucher?.reservationVoucher?.assignedItinerary) {
      try {
        // Initialize selected services from the assigned itinerary
        const existingServices =
          voucher.reservationVoucher.assignedItinerary || [];
        setSelectedServices(existingServices);
      } catch (error) {
        console.error("Error loading existing services:", error);
      }
    } else {
      // Reset selected services for new assignments
      setSelectedServices([]);
    }

    // Simulate API data loading
    setTimeout(() => {
      setIsLoading(false);
    }, 800);
  }, [isEditing, voucher]);

  // Check if at least one service is validated or has a pending unvalidation
  const areAnyServicesAssigned = useCallback(() => {
    if (!voucherItinerary || !voucherItinerary.length) return false;

    // Check if at least one service is validated
    for (const day of voucherItinerary) {
      if (day.servicios && Array.isArray(day.servicios)) {
        for (const service of day.servicios) {
          if (
            service.isAssigned ||
            service.needsUnassign ||
            service._needsUnassign
          ) {
            return true; // Return true as soon as one validated service is found
          }
        }
      }
    }

    return false; // No validated services found
  }, [voucherItinerary]);

  const handleAssignmentChange = (itinerary, metadata: { persistedServiceId?: number } = {}) => {
    if (activeVoucherId.current !== voucher?.id) return Promise.resolve(false);
    setVoucherItinerary(itinerary);
    setServiceAssignments(itinerary);
    return autosave.change(itinerary, metadata.persistedServiceId);
  };

  // La salida espera todas las mutaciones encadenadas. Una creación fallida
  // también conserva el editor; el callback debe devolver su resultado.
  const handleCloseModal = async () => {
    if (closeInProgress.current) return false;
    setValidationError(null);
    if (validationInProgress) {
      setValidationError("Espera la confirmación de la validación antes de salir.");
      return false;
    }
    if (autosave.draft.length || autosave.recovering) {
      setValidationError("Recupera o descarta el borrador pendiente antes de salir.");
      return false;
    }
    closeInProgress.current = true;
    setClosing(true);
    try {
      if (!(await autosave.flush())) {
        setValidationError("Hay cambios sin guardar. Reintenta antes de salir.");
        return false;
      }
      if (!isEditing && autosave.latest.current.some(day =>
        (day.servicios || []).some(service => service.isAssigned))) {
        const created = await onSave?.(voucher.id, autosave.latest.current);
        if (created === false) {
          setValidationError("No se pudo crear la reserva. Los servicios guardados se conservan.");
          return false;
        }
      }
      await onClose?.();
      return true;
    } catch (error) {
      setValidationError(error?.message || "No se pudo completar la reserva. Reintenta.");
      return false;
    } finally {
      closeInProgress.current = false;
      setClosing(false);
    }
  };

  const handleSaveAssignments = handleCloseModal;

  const retryAssignments = async () => {
    if (await autosave.flush()) {
      setValidationError(null);
    }
  };
  const discardPendingAssignments = () => {
    if (window.confirm("¿Descartar los cambios pendientes y recargar los servicios guardados? Esta acción no modifica lo ya confirmado en el sistema.")) {
      autosave.discardChanges();
    }
  };

  const renderAssignmentSaveFeedback = () => <>
    {!asPage && <AssignmentSaveStatus state={autosave.state} error={autosave.error} onRetry={retryAssignments} onDiscard={discardPendingAssignments} />}
    {validationError && <p className="assignment-save-error" role="alert">{validationError}</p>}
    {autosave.draft.length > 0 && <div className="assignment-draft-notice" role="alert">
      <span>Hay cambios de una sesión anterior sin sincronizar.</span>
      <button type="button" disabled={isSaving} onClick={() => void autosave.restoreDraft()}>Recuperar cambios</button>
      <button type="button" disabled={isSaving} onClick={autosave.discardDraft}>Descartar borrador</button>
    </div>}
  </>;

  const assignmentTitle =
    pageTitle ||
    `Validación de Servicios - ${voucher?.voucherCode || voucher?.id || "Nuevo Voucher"}`;

  const ventasPdfVoucher = useMemo(() => {
    if (!voucher) return null;

    return {
      ...voucher,
      voucher_code:
        voucher.voucher_code ||
        voucher.voucherCode ||
        voucher.id,
      created_at:
        voucher.created_at || voucher.createdAt || voucher.fecha || null,
    };
  }, [voucher]);

  const handleOpenVentasSummaryPdf = () => {
    if (!ventasPdfVoucher?.id) return;
    setShowVentasSummaryPdfModal(true);
  };

  const handleCloseVentasSummaryPdf = () => {
    setShowVentasSummaryPdfModal(false);
  };

  const reservationProviderGroups = useMemo(
    () => buildReservationProviderGroups(voucherItinerary, fechaInicio),
    [voucherItinerary, fechaInicio],
  );

  const handleOpenProviderReservationRequest = useCallback((provider) => {
    if (!provider) return;
    setReservationRequestData({
      mode: "provider",
      typeKey: provider.typeKey,
      typeLabel: provider.typeLabel,
      providerName: provider.providerName,
      items: provider.items || [],
    });
  }, []);

  const handleOpenSingleReservationRequest = useCallback(
    ({ dayIndex, serviceIndex, service, cotService }) => {
      const currentService =
        service || voucherItinerary?.[dayIndex]?.servicios?.[serviceIndex];
      if (!currentService) return;

      const day = voucherItinerary?.[dayIndex] || {};
      const typeKey = getReservationServiceTypeKey(currentService);
      const typeLabel = getReservationServiceTypeLabel(currentService);
      const providerName = getReservationProviderName(currentService);
      const details = getReservationServiceDetails(currentService);
      const serviceName =
        getReservationServiceName(currentService) ||
        details?.[0]?.value ||
        providerName;
      const serviceDate = (() => {
        if (!fechaInicio) return null;
        const [year, month, date] = String(fechaInicio).split("-").map(Number);
        const parsed = new Date(year || 0, (month || 1) - 1, date || 1);
        if (Number.isNaN(parsed.getTime())) return null;
        parsed.setDate(parsed.getDate() + Number(dayIndex || 0));
        return parsed;
      })();

      setReservationRequestData({
        mode: "single",
        typeKey,
        typeLabel,
        providerName,
        items: [
          {
            id: `${dayIndex}-${serviceIndex}`,
            day,
            dayIndex,
            serviceIndex,
            service: currentService,
            cotService,
            typeKey,
            typeLabel,
            providerName,
            serviceName,
            serviceDate,
          },
        ],
      });
    },
    [voucherItinerary, fechaInicio],
  );

  const handleCloseReservationRequest = useCallback(() => {
    setReservationRequestData(null);
  }, []);

  const handleToggleProviderGroup = useCallback((typeKey) => {
    setExpandedProviderType((current) =>
      current === typeKey ? null : typeKey,
    );
  }, []);

  const activeProviderGroup = useMemo(
    () =>
      reservationProviderGroups.find(
        (group) => group.typeKey === expandedProviderType,
      ) || null,
    [reservationProviderGroups, expandedProviderType],
  );

  const renderReservationProviderPanel = (showPanel = false) => {
    if (!showPanel || reservationProviderGroups.length === 0) return null;

    return (
      <div className="assignment-provider-panel">
        <div className="assignment-provider-panel__label">
          Solicitudes por proveedor
        </div>
        <div className="assignment-provider-panel__scroll">
          {reservationProviderGroups.map((group) => {
            const isExpanded = expandedProviderType === group.typeKey;
            return (
              <button
                type="button"
                className={`assignment-provider-chip ${isExpanded ? "active" : ""}`}
                key={group.typeKey}
                onClick={() => handleToggleProviderGroup(group.typeKey)}
                title={`Ver proveedores de ${group.typeLabel}`}
              >
                <span>{group.typeLabel}</span>
                <strong>{group.providers.length} proveedor(es)</strong>
                <em>{group.totalServices} servicio(s)</em>
                {isExpanded ? <MdExpandLess /> : <MdExpandMore />}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderReservationProviderPopover = (showPanel = false) => {
    if (!showPanel || !activeProviderGroup) return null;

    return (
      <div className="assignment-provider-popover">
        <div className="assignment-provider-popover__inner">
          <div className="assignment-provider-popover__header">
            <div>
              <span>Proveedores incluidos</span>
              <h3>{activeProviderGroup.typeLabel}</h3>
            </div>
            <button
              type="button"
              className="assignment-provider-popover__close"
              onClick={() => setExpandedProviderType(null)}
              aria-label="Cerrar proveedores"
            >
              ×
            </button>
          </div>
          <div className="assignment-provider-popover__grid">
            {activeProviderGroup.providers.map((provider) => (
              <button
                type="button"
                key={provider.key}
                className="assignment-provider-option"
                onClick={() => {
                  handleOpenProviderReservationRequest(provider);
                  setExpandedProviderType(null);
                }}
              >
                <strong>{provider.providerName}</strong>
                <span>{provider.items.length} servicio(s)</span>
                <em>
                  {provider.dateLabels.join(" · ") || "Fechas por confirmar"}
                </em>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const assignmentActions = [
    {
      label: "Volver",
      onClick: handleCloseModal,
      variant: "secondary",
      disabled: isSaving,
    },
    {
      label: isSaving ? "Guardando..." : "Listo",
      onClick: handleSaveAssignments,
      variant: "primary",
      disabled: isSaving || autosave.draft.length > 0,
    },
  ];

  useEffect(() => {
    if (!asPage || !pageRootRef.current || !pageHeaderRef.current) return;

    const updateHeaderHeight = () => {
      const headerHeight = pageHeaderRef.current?.offsetHeight || 0;
      pageRootRef.current?.style.setProperty(
        "--er-assignment-header-height",
        `${headerHeight}px`,
      );
    };

    updateHeaderHeight();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateHeaderHeight)
        : null;

    if (resizeObserver) {
      resizeObserver.observe(pageHeaderRef.current);
    }
    window.addEventListener("resize", updateHeaderHeight);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateHeaderHeight);
    };
  }, [asPage]);

  const renderPageFrame = (children, { showActions = false } = {}) => {
    const backAction = assignmentActions.find(
      (action) => action.variant === "secondary",
    );
    const saveAction = assignmentActions.find(
      (action) => action.variant === "primary",
    );

    return (
      <div
        ref={pageRootRef}
        className="service-assignment-modal service-assignment-modal--page"
      >
        <div ref={pageHeaderRef} className="assignment-page-header">
          <div className="assignment-page-header-main">
            <div className="assignment-page-heading">
              {showActions && backAction && (
                <button
                  type="button"
                  onClick={backAction.onClick}
                  className="assignment-page-back"
                  disabled={backAction.disabled || isProcessing}
                >
                  <MdArrowBack />
                  Volver
                </button>
              )}
              <div className="assignment-page-title">
                <h1>{assignmentTitle}</h1>
              </div>
            </div>
            {showActions && (
              <div className="assignment-page-actions-group">
                <button
                  type="button"
                  className="assignment-page-btn pdf"
                  onClick={handleOpenVentasSummaryPdf}
                  disabled={!ventasPdfVoucher?.id}
                  title="Abrir resumen PDF del voucher de venta"
                >
                  <MdPictureAsPdf />
                  PDF venta
                </button>
                <div
                  id="assignment-page-editor-actions"
                  className="assignment-page-editor-actions"
                />
              </div>
            )}
          </div>
          {renderReservationProviderPanel(showActions)}
        </div>
        {renderReservationProviderPopover(showActions)}

        {children}

        {showActions && saveAction && (
          <div className="assignment-page-footer">
            <div className="assignment-page-footer-inner">
              <AssignmentSaveStatus state={autosave.state} error={autosave.error} onRetry={retryAssignments} onDiscard={discardPendingAssignments} />
              <button
                type="button"
                onClick={saveAction.onClick}
                className="assignment-page-btn primary"
                disabled={saveAction.disabled || isProcessing}
              >
                {saveAction.label}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render loading state
  if (loading) {
    if (asPage) {
      return renderPageFrame(
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Cargando itinerario...</p>
        </div>,
      );
    }

    return (
      <Modal
        isOpen={isOpen}
        onClose={handleCloseModal}
        title="Validación de Servicios"
        size="large"
        className="service-assignment-modal"
      >
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Cargando itinerario...</p>
        </div>
      </Modal>
    );
  }

  // Render error state
  if (error) {
    if (asPage) {
      return renderPageFrame(
        <div className="error-container">
          <MdWarning size={48} color="#dc3545" />
          <p>{error}</p>
          {renderAssignmentSaveFeedback()}
          <button type="button" onClick={() => setRefreshTrigger(value => value + 1)}>Reintentar carga</button>
          <button onClick={handleCloseModal} className="btn-close">
            Cerrar
          </button>
        </div>,
      );
    }

    return (
      <Modal
        isOpen={isOpen}
        onClose={handleCloseModal}
        title="Validación de Servicios"
        size="large"
        className="service-assignment-modal"
      >
        <div className="error-container">
          <MdWarning size={48} color="#dc3545" />
          <p>{error}</p>
          {renderAssignmentSaveFeedback()}
          <button type="button" onClick={() => setRefreshTrigger(value => value + 1)}>Reintentar carga</button>
          <button onClick={handleCloseModal} className="btn-close">
            Cerrar
          </button>
        </div>
      </Modal>
    );
  }

  // Calculate fechaFin based on fechaInicio and itinerary days
  const handleFechaInicioChange = (e) => {
    const startDate = e.target.value;
    setFechaInicio(startDate);

    if (startDate && voucherItinerary && voucherItinerary.length > 0) {
      // Get the number of days in the itinerary
      const dayCount = voucherItinerary.length;

      // Calculate end date by adding days-1 to start date (since day 1 is the start date)
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + (dayCount - 1));

      // Format date as YYYY-MM-DD
      setFechaFin(endDate.toISOString().split("T")[0]);
    }
  };

  // Calculate fechaInicio based on fechaFin and itinerary days if fechaInicio is empty
  const handleFechaFinChange = (e) => {
    const endDate = e.target.value;
    setFechaFin(endDate);

    if (
      endDate &&
      !fechaInicio &&
      voucherItinerary &&
      voucherItinerary.length > 0
    ) {
      // Get the number of days in the itinerary
      const dayCount = voucherItinerary.length;

      // Calculate start date by subtracting days-1 from end date
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - (dayCount - 1));

      // Format date as YYYY-MM-DD
      setFechaInicio(startDate.toISOString().split("T")[0]);
    }
  };

  // Format dates for API submission

  const passengerCounts = getPeopleCounts(
    peopleDetails || voucher?.passengerData || voucher?.passenger_data,
  );
  if (asPage) {
    return (
      <>
        {renderPageFrame(
          <div className="assignment-content">
            <div className="header-info">
              <div className="voucher-details">
                <h3>
                  <MdReceipt /> Detalles del Voucher
                </h3>
                <div className="voucher-detail-grid">
                  <div className="voucher-detail-row">
                    <span>File</span>
                    <strong>{voucher?.voucherCode || voucher?.id}</strong>
                  </div>
                  <div className="voucher-detail-row">
                    <span>Emision</span>
                    <strong>
                      {voucher?.createdAt
                        ? new Date(voucher.createdAt).toLocaleDateString()
                        : "N/A"}
                    </strong>
                  </div>
                  {(cotizacionMeta?.platform ||
                    cotizacionMeta?.businessType) && (
                    <div className="voucher-detail-row">
                      <span>Contexto</span>
                      <strong>
                        {[
                          cotizacionMeta?.platform,
                          cotizacionMeta?.businessType,
                        ]
                          .filter(Boolean)
                          .join(" / ")}
                      </strong>
                    </div>
                  )}
                  <div className="voucher-detail-row voucher-detail-row--wide">
                    <span>Pasajeros</span>
                    <div className="passenger-summary-inline">
                      <strong>{passengerCounts.total} total</strong>
                      <span className="pax-pill adults">
                        <MdPerson /> {passengerCounts.adults} adultos
                      </span>
                      <span className="pax-pill children">
                        <MdChildCare /> {passengerCounts.children} ninos
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="assignment-status">
                <h3>Estado de Validación</h3>
                <div className="status-indicator">
                  {areAnyServicesAssigned() ? (
                    <span className="complete">
                      <MdCheck /> Servicios validados
                    </span>
                  ) : (
                    <span className="incomplete">
                      <MdWarning /> Pendiente de validar servicios
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="date-selection-container">
              <div className="date-selection-heading">
                <h3>
                  <MdCalendarToday /> Fechas del Itinerario
                </h3>
                {travelDateSource && (
                  <span className="date-source-pill">
                    Base: {travelDateSource}
                  </span>
                )}
              </div>
              <div className="date-inputs">
                <div className="date-input-group">
                  <label htmlFor="fechaInicio">
                    <MdEvent /> Fecha de Inicio
                    {isEditing && (
                      <span className="edit-mode-indicator">
                        {" "}
                        (Editando: {fechaInicio || "No establecida"})
                      </span>
                    )}
                  </label>
                  <input
                    type="date"
                    id="fechaInicio"
                    value={fechaInicio || ""}
                    onChange={handleFechaInicioChange}
                    className="date-input"
                    placeholder="Seleccione fecha de inicio"
                    data-testid="fecha-inicio-input"
                  />
                </div>
                <div className="date-input-group">
                  <label htmlFor="fechaFin">
                    <MdDateRange /> Fecha de Finalizacion
                    {isEditing && (
                      <span className="edit-mode-indicator">
                        {" "}
                        (Editando: {fechaFin || "No establecida"})
                      </span>
                    )}
                  </label>
                  <input
                    type="date"
                    id="fechaFin"
                    value={fechaFin || ""}
                    onChange={handleFechaFinChange}
                    className="date-input"
                    placeholder="Seleccione fecha de fin"
                    data-testid="fecha-fin-input"
                  />
                </div>
                {voucherItinerary && voucherItinerary.length > 0 && (
                  <div className="date-info">
                    <span className="days-count">
                      {voucherItinerary.length}{" "}
                      {voucherItinerary.length === 1 ? "dia" : "dias"} de
                      itinerario
                    </span>
                  </div>
                )}
              </div>
            </div>

            {renderAssignmentSaveFeedback()}
            <fieldset className="assignment-editor-fieldset" disabled={autosave.draft.length > 0 || autosave.recovering}>
            <ReservaServiceEditor
              key={String(voucher?.id)}
              cotizacionItinerary={cotizacionItinerary}
              voucherItinerary={voucherItinerary}
              onChange={handleAssignmentChange}
              onBeforeValidation={autosave.flush}
              onValidationStateChange={setValidationInProgress}
              totalPassengers={countPeopleDetailsPassengers(peopleDetails)}
              peopleDetails={peopleDetails}
              fechaInicio={fechaInicio}
              voucherReservaId={voucher?.reservationVoucher?.id || ""}
              voucherReservaCode={voucher?.voucherCode || ""}
              versionVoucher={voucher}
              showHeader={false}
              headerActionsContainerId="assignment-page-editor-actions"
              onOpenReservationRequest={handleOpenSingleReservationRequest}
            />
            </fieldset>
          </div>,
          { showActions: true },
        )}
        {showVentasSummaryPdfModal && ventasPdfVoucher && (
          <VentasSummaryPDFModal
            isOpen={showVentasSummaryPdfModal}
            onClose={handleCloseVentasSummaryPdf}
            voucher={ventasPdfVoucher}
          />
        )}
        <ReservationRequestModal
          isOpen={!!reservationRequestData}
          onClose={handleCloseReservationRequest}
          request={reservationRequestData}
          voucher={voucher}
          peopleDetails={peopleDetails}
          fechaInicio={fechaInicio}
          allDays={voucherItinerary}
        />
      </>
    );
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleCloseModal}
        title={`Validación de Servicios - ${voucher?.voucherCode || voucher?.id || "Nuevo Voucher"}`}
        size="large"
        className="service-assignment-modal"
        actions={[
          {
            label: "Volver",
            onClick: handleCloseModal,
            variant: "secondary",
            disabled: isSaving,
          },
          {
            label: isSaving ? "Guardando..." : "Listo",
            onClick: handleSaveAssignments,
            variant: "primary",
            disabled: isSaving || autosave.draft.length > 0,
          },
        ]}
      >
        <div className="assignment-content">
          <div className="header-info">
            <div className="voucher-details">
              <h3>Detalles del Voucher</h3>
              <p>
                <strong>Código:</strong> {voucher?.voucherCode || voucher?.id}
              </p>
              <p>
                <strong>Fecha:</strong>{" "}
                {new Date(voucher?.createdAt).toLocaleDateString()}
              </p>
              <p>
                <strong>Cotización:</strong>{" "}
                {voucher?.cotizacionId || "No disponible"}
              </p>
            </div>

            <div className="assignment-status">
              <h3>Estado de Validación</h3>
              <div className="status-indicator">
                {areAnyServicesAssigned() ? (
                  <span className="complete">
                    <MdCheck /> Servicios validados
                  </span>
                ) : (
                  <span className="incomplete">
                    <MdWarning /> Pendiente de validar servicios
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Enhanced date selection section */}
          <div className="date-selection-container">
            <h3>
              <MdCalendarToday /> Fechas del Itinerario
            </h3>
            <div className="date-inputs">
              <div className="date-input-group">
                <label htmlFor="fechaInicio">
                  <MdEvent /> Fecha de Inicio
                  {isEditing && (
                    <span className="edit-mode-indicator">
                      {" "}
                      (Editando: {fechaInicio || "No establecida"})
                    </span>
                  )}
                </label>
                <input
                  type="date"
                  id="fechaInicio"
                  value={fechaInicio || ""}
                  onChange={handleFechaInicioChange}
                  className="date-input"
                  placeholder="Seleccione fecha de inicio"
                  data-testid="fecha-inicio-input"
                />
              </div>
              <div className="date-input-group">
                <label htmlFor="fechaFin">
                  <MdDateRange /> Fecha de Finalización
                  {isEditing && (
                    <span className="edit-mode-indicator">
                      {" "}
                      (Editando: {fechaFin || "No establecida"})
                    </span>
                  )}
                </label>
                <input
                  type="date"
                  id="fechaFin"
                  value={fechaFin || ""}
                  onChange={handleFechaFinChange}
                  className="date-input"
                  placeholder="Seleccione fecha de fin"
                  data-testid="fecha-fin-input"
                />
              </div>
              {voucherItinerary && voucherItinerary.length > 0 && (
                <div className="date-info">
                  <span className="days-count">
                    {voucherItinerary.length}{" "}
                    {voucherItinerary.length === 1 ? "día" : "días"} de
                    itinerario
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Usar el nuevo ReservaServiceEditor */}
          {renderAssignmentSaveFeedback()}
          <fieldset className="assignment-editor-fieldset" disabled={autosave.draft.length > 0 || autosave.recovering}>
          <ReservaServiceEditor
            key={String(voucher?.id)}
            cotizacionItinerary={cotizacionItinerary}
            voucherItinerary={voucherItinerary}
            onChange={handleAssignmentChange}
            onBeforeValidation={autosave.flush}
            onValidationStateChange={setValidationInProgress}
            totalPassengers={countPeopleDetailsPassengers(peopleDetails)}
            peopleDetails={peopleDetails}
            fechaInicio={fechaInicio}
            voucherReservaId={voucher?.reservationVoucher?.id || ""}
            voucherReservaCode={voucher?.voucherCode || ""}
            versionVoucher={voucher}
            onOpenReservationRequest={handleOpenSingleReservationRequest}
          />
          </fieldset>
        </div>
      </Modal>
      {showVentasSummaryPdfModal && ventasPdfVoucher && (
        <VentasSummaryPDFModal
          isOpen={showVentasSummaryPdfModal}
          onClose={handleCloseVentasSummaryPdf}
          voucher={ventasPdfVoucher}
        />
      )}
      <ReservationRequestModal
        isOpen={!!reservationRequestData}
        onClose={handleCloseReservationRequest}
        request={reservationRequestData}
        voucher={voucher}
        peopleDetails={peopleDetails}
        fechaInicio={fechaInicio}
        allDays={voucherItinerary}
      />
    </>
  );
};

export default ServiceAssignmentModal;
