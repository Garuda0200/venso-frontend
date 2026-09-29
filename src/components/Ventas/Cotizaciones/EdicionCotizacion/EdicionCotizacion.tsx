"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import ReactDOM from "react-dom";
import { useQuery } from "@tanstack/react-query";
import ServicePicker from "./components/ServicePicker/ServicePicker";
import ExtraServiceModal from "./components/ServicePicker/components/ExtraServiceModal/ExtraServiceModal";
import SourceVoucherPreviewModal from "../../../../pages/Ventas/Cotizaciones/components/SourceVoucherPreviewModal";
import PreLiquidacionModal from "../../../../pages/Ventas/Cotizaciones/components/PreLiquidacionModal";
import { normalizePreLiquidacion } from "../../../../pages/Ventas/Cotizaciones/utils/preliquidacion";
import { normalizeSourceVoucher } from "../../../../pages/Ventas/Cotizaciones/utils/sourceVoucher";
import "./EdicionCotizacion.scss";
import {
  MdClose,
  MdAttachFile,
  MdPeople,
  MdCalendarViewMonth,
  MdAttachMoney,
  MdSummarize,
  MdSave,
  MdImportExport,
  MdNavigateBefore,
  MdNavigateNext,
  MdCheck,
  MdCheckCircle,
  MdHotel,
  MdArrowBack,
  MdFlightTakeoff,
  MdErrorOutline,
  MdInfoOutline,
  MdWarningAmber,
  MdBusinessCenter,
  MdHistory,
  MdReceiptLong,
} from "react-icons/md";
import axios from "../../../../utils/axiosInstance";
import { getUsers } from "../../../../services/userService";
import {
  Agency,
  createAgency,
  getAgencies,
} from "../../../../services/agencyService";

import PeopleSelection from "./components/PeopleSelection/PeopleSelection";
import DaysEditor from "./components/DaysEditor/DaysEditor";
import AdditionalCosts from "./components/AdditionalCosts/AdditionalCosts";
import SummaryContent from "./components/SummaryContent/SummaryContent";
import HotelPricingModal from "./components/HotelPricingModal/HotelPricingModal";
import PackageTypeSelector from "./components/PackageTypeSelector/PackageTypeSelector";
import PackageImportModal from "./components/PackageImportModal/PackageImportModal";
// import TransportConflictModal from "./components/TransportConflictModal/TransportConflictModal";
import {
  cleanItinerarioForDB,
  hydrateItinerarioFromDB,
} from "./utils/itinerarioCleanupUtils";
import { formatCurrency } from "./utils/formatters";
import {
  getTourCapacity,
  updateServicePricesForPassengerChange,
} from "./utils/unifiedServiceManager";
import unifiedServiceManager from "./utils/unifiedServiceManager";
import {
  calculateExternalItineraryBreakdown,
  calculateCotizacionFinancialSummary,
} from "./utils/cotizacionFinancialSummary";
import { calculateGeneralTotalsDetailed } from "./components/DaysEditor/utils/priceCalculations";
import { buildPeruvianPassengerIdSet } from "./utils/igvUtils";
import { normalizeHotelBasePriceAgainstCatalog } from "./utils/hotelPriceNormalization";
import { useAuth } from "../../../../context/AuthContext";
import {
  isHotelService,
  isAutoHotelService,
  normalizeHotelDetallePayload,
  normalizeSelectedHotelConfig,
  deriveSelectedHotelFromDays,
  stripAutoHotelsFromDays,
  injectHotelIntoDaysPure,
  buildHotelServicesForNight,
} from "./utils/hotelServiceHelpers";
import {
  findBetterFitVehicle,
  buildReplacementService,
  detectTransportConflicts,
} from "./utils/transportConflictHelpers";

// Diccionario / catálogo hoteles
import useHotelQuoteDictionary from "./utils/useHotelQuoteDictionary";
import { shouldEnableHotelDictionary } from "./utils/editorRenderOptimization";
import buildRoomOptionsByCategory from "./utils/buildRoomOptionsByCategory";
import buildCategoryRowsFromDict from "./utils/buildCategoryRowsFromDict";
import { sanitizeAdditionalCostsConfig } from "./utils/quotePricingEngine";
import { autoMixWithConvertedChildren } from "./utils/hotelRoomMix";
import {
  clearHotelRoomCalculationCache,
  getHotelConvertedChildCount,
  resetHotelRoomsForPassengerChange,
  sanitizeHotelConfigForPeople,
} from "./utils/hotelPassengerSync";
import { resolveHotelRoomAssignments } from "./utils/hotelRoomAssignments";

// Hook para auto-guardado de borradores
import { useCotizacionDraft } from "./utils/useCotizacionDraft";

// Editor de itinerario externo (servicios fuera del paquete vendido)
import ExternalItineraryEditor from "./components/ExternalItineraryEditor/ExternalItineraryEditor";
import { applyHotelDetalleToGeneratedHtml } from "./utils/hotelDetallePayload";
import {
  buildCotizacionPreviewHtml,
  filterLuxuryHotelCategoryRows,
  isLuxuryHotelPreviewSource,
  LUXURY_HOTEL_CATEGORY,
  NO_HOTEL_CATEGORY,
} from "./utils/cotizacionPreviewHtml";
import {
  buildVisibleSummaryPayload,
  resolveAuthoritativeQuotationTotal,
  resolveVisibleSummaryTotalFromAdditionalCosts,
} from "./utils/visibleSummaryTotals";
import {
  buildFinancialSummaryParts,
  buildRoomBasedFinancialSummaryParts,
  resolveChildChargeSummary,
} from "./utils/financialDisplayHelpers";
import { buildSummaryContentPricingModel } from "./utils/summaryContentPricingParts";
import { resolveNoHotelPreviewChildBreakdown } from "./utils/noHotelPreviewPricing";
import { queryClient, queryKeys } from "../../../../config/queryClient";
import { buildCanonicalPassengerComposition } from "./utils/passengerComposition";
import {
  isOperationallyAssignedService,
  preserveOperationallyAssignedServices,
} from "./utils/assignmentProtection";
import {
  buildImportedPackageFeeState,
  normalizeNullablePackageFee,
} from "../../../../utils/packageFeeUtils";

import { pruneEmptyMutableTicketCohorts } from "./utils/passengerPricingReconciliation";

const repriceServicesPreservingOperationalAssignments = (
  services,
  peopleDetails,
  options,
) => {
  const current = Array.isArray(services) ? services : [];
  const recalculated = updateServicePricesForPassengerChange(
    current,
    peopleDetails,
    options,
  );
  return pruneEmptyMutableTicketCohorts(
    preserveOperationallyAssignedServices(current, recalculated),
  );
};
import PredecesoresExpander from "../../../../pages/Ventas/Cotizaciones/components/PredecesoresExpander";
import {
  formatRemainingApprovalTime,
  isApprovedAndUsable,
} from "../../../../pages/Ventas/Cotizaciones/utils/postSaleEditState";

/* ===================== PASOS ===================== */
const STEPS = {
  PASAJEROS: "pasajeros",
  ITINERARIO: "itinerario",
  COSTOS: "costos",
};
const STEPS_ORDER = [STEPS.PASAJEROS, STEPS.ITINERARIO, STEPS.COSTOS];

const normalizeAgencyTariffType = (value: unknown) => {
  const normalized = String(value || "").trim().toLowerCase();
  return ["interna", "externa", "cotizacion"].includes(normalized)
    ? normalized
    : null;
};

const roundCurrencyValue = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

const STEPS_INFO = [
  { id: STEPS.PASAJEROS, label: "Pasajeros", icon: MdPeople },
  { id: STEPS.ITINERARIO, label: "Itinerario", icon: MdCalendarViewMonth },
  { id: STEPS.COSTOS, label: "Costos", icon: MdAttachMoney },
];

const HOTEL_IGV_RATE = 0.18;

const SNACKBAR_META = {
  success: { title: "Proceso completado", icon: MdCheckCircle },
  error: { title: "No se pudo completar", icon: MdErrorOutline },
  warning: { title: "Revisa este punto", icon: MdWarningAmber },
  info: { title: "Información", icon: MdInfoOutline },
};

/* ===================== HELPERS MÍNIMOS ===================== */
const preserveServicePassengerState = (replacement, source) => {
  if (!replacement || !source) return replacement;

  const sourceIds = Array.isArray(source.assignedPassengerIds)
    ? source.assignedPassengerIds
    : [];
  const sourceSelectionIds = Array.isArray(
    source.passengerSelection?.selectedIds,
  )
    ? source.passengerSelection.selectedIds
    : [];

  if (sourceIds.length === 0 && sourceSelectionIds.length === 0) {
    return replacement;
  }

  const selectedIds = sourceIds.length > 0 ? sourceIds : sourceSelectionIds;

  return {
    ...replacement,
    assignedPassengerIds: selectedIds,
    assignedPassengerCount:
      source.assignedPassengerCount ||
      source.passengerSelection?.assignedPassengerCount ||
      selectedIds.length,
    assignedPassengers:
      source.assignedPassengers || replacement.assignedPassengers,
    assignedChildExplicitPriceMap:
      source.assignedChildExplicitPriceMap ||
      source.passengerSelection?.assignedChildExplicitPriceMap ||
      replacement.assignedChildExplicitPriceMap,
    assignedChildExplicitPriceSum:
      source.assignedChildExplicitPriceSum ||
      source.passengerSelection?.assignedChildExplicitPriceSum ||
      replacement.assignedChildExplicitPriceSum,
    convertedChildToAdultMap:
      source.convertedChildToAdultMap ||
      source.passengerSelection?.convertedChildToAdultMap ||
      replacement.convertedChildToAdultMap,
    pricingMode: source.pricingMode || replacement.pricingMode,
    uniformPercentage:
      source.uniformPercentage || replacement.uniformPercentage,
    childPercentageMap:
      source.childPercentageMap || replacement.childPercentageMap,
    treatChildrenAsAdults:
      source.treatChildrenAsAdults || replacement.treatChildrenAsAdults,
    passengerSelection: {
      ...(replacement.passengerSelection || {}),
      ...(source.passengerSelection || {}),
      selectedIds,
      assignedPassengerCount:
        source.passengerSelection?.assignedPassengerCount ||
        source.assignedPassengerCount ||
        selectedIds.length,
    },
  };
};

/**
 * Solo durante la importación: detecta transportes cuya capacidad sea menor
 * que la cantidad de pasajeros y los reemplaza automáticamente por una
 * movilidad del mismo proveedor/ruta con capacidad suficiente.
 * No se muestra modal ni se activa la lógica de reajuste posterior.
 */
const resolveTransportConflictsOnImport = async (
  itinerary,
  totalPax,
  packageType,
  peopleDetails,
) => {
  const { undersizedList } = detectTransportConflicts(itinerary, totalPax);
  if (undersizedList.length === 0) return itinerary;

  let resolvedItinerary = itinerary.map((day) => ({
    ...day,
    servicios: [...(day.servicios || [])],
  }));
  let replacedCount = 0;

  for (const item of undersizedList) {
    const service = item.service;
    const parentService = service.parentService || {};
    const idTransporte =
      parentService.id_transporte || parentService.transporte?.id_transporte;
    if (!idTransporte) continue;

    const suitable = await findBetterFitVehicle(
      axios,
      service,
      idTransporte,
      totalPax,
      "upsize",
    );
    if (!suitable) continue;

    const newService = buildReplacementService(
      parentService,
      suitable,
      service,
      packageType,
      peopleDetails,
    );
    if (!newService) continue;

    const replacementService = preserveServicePassengerState(newService, service);

    resolvedItinerary = resolvedItinerary.map((day, dayIdx) => {
      if (dayIdx !== item.dayIdx) return day;
      const newServicios = [...(day.servicios || [])];
      newServicios[item.svcIdx] = {
        ...replacementService,
        id: `service-${dayIdx}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      };
      return { ...day, servicios: newServicios };
    });
    replacedCount++;
  }

  if (replacedCount > 0) {
    console.log(
      `[import] ${replacedCount} movilidad(es) ajustadas a ${totalPax} pasajero(s)`,
    );
  }
  return resolvedItinerary;
};

/**
 * calculateGeneralTotal — Wraps calculateGeneralTotalsDetailed to produce
 * the shape consumed by AdditionalCosts and cotizacionPreviewData.
 */
const calculateGeneralTotal = (days, peopleDetails = null) => {
  const d = calculateGeneralTotalsDetailed(days, peopleDetails);

  const hotelExplicitChildTotal = Math.max(
    0,
    Number(d.hotelChildrenTotal || 0) - Number(d.hotelConvertedChildTotal || 0),
  );
  const subtotalNinos =
    Number(d.baseExplicitChildTotal || 0) +
    Number(d.baseConvertedChildTotal || 0) +
    Number(d.hotelChildrenTotal || 0);

  return {
    grandTotal: d.grandTotal,
    totalPerPerson: d.totalPerPerson,
    totalIGV: d.totalIGV,
    subtotalIndividual: d.totalPerPerson,
    servicesTotal: d.grandTotal,
    nonHotelsTotal: d.totalPerPerson,
    hotelsTotal: d.hotelAdultTotal,
    hotelFullTotal: d.hotelsTotal,
    hotelChildTotal: d.hotelChildrenTotal,
    hotelExplicitChildTotal,
    hotelConvertedChildTotal: d.hotelConvertedChildTotal,
    hotelAdultTotal: d.hotelAdultTotal,
    subtotalNinos,
    nonHotelExplicitChildTotal: d.baseExplicitChildTotal,
    nonHotelConvertedChildTotal: d.baseConvertedChildTotal,
    nonHotelExplicitChildTotalsById: d.baseExplicitChildTotalsById || {},
    nonHotelConvertedChildTotalsById: d.baseConvertedChildTotalsById || {},
    hotelExplicitChildTotalsById: d.hotelExplicitChildTotalsById || {},
    hotelConvertedChildTotalsById: d.hotelConvertedChildTotalsById || {},
    baseExplicitChildCount: d.baseExplicitChildCount || 0,
    baseConvertedChildCount: d.baseConvertedChildCount || 0,
    hotelExplicitChildCount: d.hotelExplicitChildCount || 0,
    hotelConvertedChildCount: d.hotelConvertedChildCount || 0,
    baseAdultCount: d.baseAdultCount || 0,
    hotelAdultCount: d.hotelAdultCount || 0,
  };
};

const parseHotelRoomVisibleAdultTotal = (html) => {
  if (!html || typeof DOMParser === "undefined") return null;

  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const selectedAdultRow =
      doc.querySelector(
        '[data-preview-selected-row="true"][data-preview-price-kind="adult"]',
      ) || doc.querySelector('[data-preview-price-kind="adult"]');

    if (!selectedAdultRow) return null;

    const cells = Array.from(
      selectedAdultRow.querySelectorAll('[data-preview-price-value$="-adult"]'),
    );
    if (cells.length === 0) return null;

    const total = cells.reduce((sum, cell) => {
      const value = Number.parseFloat(
        String(cell.textContent || "")
          .replace(/[^\d.,-]/g, "")
          .replace(/,/g, ""),
      );
      const beneficiaries = Number.parseInt(
        cell.getAttribute("data-hpm-room-beneficiaries") || "1",
        10,
      );
      if (!Number.isFinite(value) || value <= 0) return sum;
      return sum + Math.ceil(value) * Math.max(1, beneficiaries || 1);
    }, 0);

    return total > 0 ? total : null;
  } catch {
    return null;
  }
};

const coercePositiveCurrencyTotal = (...values) => {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round((parsed + Number.EPSILON) * 100) / 100;
    }
  }
  return 0;
};

const resolveFinalTotalFromSources = ({
  additionalCosts = null,
  roomVisibleTotals = null,
  summaryTotals = null,
  visibleParts = [],
} = {}) => {
  const storedVisibleTotal = resolveVisibleSummaryTotalFromAdditionalCosts(
    additionalCosts || {},
  );

  const previewFinalTotal =
    roomVisibleTotals != null
      ? coercePositiveCurrencyTotal(
          Number(roomVisibleTotals.adultTotal || 0) +
            Number(roomVisibleTotals.childTotal || 0) +
            Number(summaryTotals?.orphanExternalChildTotal || 0),
        )
      : 0;

  const additionalFinalTotal = coercePositiveCurrencyTotal(
    additionalCosts?.finalTotal,
    additionalCosts?.final_total,
    additionalCosts?.grandTotal,
    additionalCosts?.grand_total,
  );

  return (
    resolveAuthoritativeQuotationTotal({
      additionalCosts: additionalCosts || {},
      visibleParts,
      previewTotal: previewFinalTotal,
      fallbackAdditionalTotal: additionalFinalTotal,
      fallbackTotal: summaryTotals?.grandTotal,
    }) || storedVisibleTotal
  );
};

const parseHotelRoomVisibleTotals = (html) => {
  if (!html || typeof DOMParser === "undefined") return null;

  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const getBeneficiaryCount = (cell, attrs) => {
      for (const attr of attrs) {
        const value = Number.parseInt(cell.getAttribute(attr) || "0", 10);
        if (Number.isFinite(value) && value > 0) return value;
      }
      return 0;
    };
    const getRowTotal = (selector, beneficiaryAttrs) => {
      const row = doc.querySelector(selector);
      if (!row) return 0;

      return Array.from(
        row.querySelectorAll("[data-preview-price-value]"),
      ).reduce((sum, cell) => {
        const value = Number.parseFloat(
          String(cell.textContent || "")
            .replace(/[^\d.,-]/g, "")
            .replace(/,/g, ""),
        );
        const beneficiaries = getBeneficiaryCount(cell, beneficiaryAttrs);
        if (!Number.isFinite(value) || value <= 0 || beneficiaries <= 0) {
          return sum;
        }
        return sum + Math.ceil(value) * beneficiaries;
      }, 0);
    };

    const selectedAdultRow = doc.querySelector(
      '[data-preview-selected-row="true"][data-preview-price-kind="adult"]',
    );
    const selectedCategory = selectedAdultRow?.getAttribute(
      "data-preview-price-row",
    );
    const adultTotal = selectedAdultRow
      ? getRowTotal(
          '[data-preview-selected-row="true"][data-preview-price-kind="adult"]',
          ["data-hpm-room-adult-beneficiaries", "data-hpm-room-beneficiaries"],
        )
      : 0;
    const childTotal = selectedCategory
      ? getRowTotal(`[data-preview-price-row="${selectedCategory}-child"]`, [
          "data-hpm-room-converted-beneficiaries",
          "data-hpm-room-beneficiaries",
        ])
      : 0;

    if (adultTotal <= 0 && childTotal <= 0) return null;
    return { adultTotal, childTotal, convertedTotal: childTotal };
  } catch {
    return null;
  }
};

const hotelNumber = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundHotelAmount = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const normalizeRoomText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normalizeHotelCategoryKey = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const normalizeHotelPriceOverrideMap = (overrides = {}) => {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return {};
  }

  return Object.entries(overrides).reduce((accumulator, [roomKey, value]) => {
    const parsed = Number.parseFloat(value);
    if (!roomKey || !Number.isFinite(parsed) || parsed < 0) {
      return accumulator;
    }

    return {
      ...accumulator,
      [roomKey]: parsed,
    };
  }, {});
};

const getHotelRoomOptionAliases = (room = {}) => {
  const details = Array.isArray(room?.roomDetails) ? room.roomDetails : [];
  const rawAliases = [
    room?.key,
    room?.roomKey,
    room?.sourceRoomKey,
    room?.baseKey,
    room?.id_habitacion,
    room?.idHabitacion,
    room?.child_id,
    room?.assigned_child_id,
    room?.label,
    room?.baseLabel,
    room?.roomType,
    room?.room_type,
    room?.tipo_habitacion,
    room?.childService?.id_habitacion,
    room?.childService?.tipo_habitacion,
    room?.child_service?.id_habitacion,
    room?.child_service?.tipo_habitacion,
    ...details.flatMap((detail) => [
      detail?.roomId,
      detail?.roomKey,
      detail?.sourceRoomKey,
      detail?.id_habitacion,
      detail?.label,
      detail?.baseLabel,
    ]),
  ];

  const aliases = new Set();
  rawAliases.forEach((value) => {
    const raw = String(value ?? "").trim();
    if (!raw) return;

    aliases.add(raw);
    aliases.add(raw.split(":")[0]);
    const normalized = normalizeRoomText(raw);
    if (normalized) {
      aliases.add(normalized);
      aliases.add(normalized.split(":")[0]);
    }
  });

  return [...aliases].filter(Boolean);
};

const applyHotelRoomPriceOverridesToOptions = (roomOptions = [], overrides = {}) => {
  const normalizedOverrides = normalizeHotelPriceOverrideMap(overrides);
  if (Object.keys(normalizedOverrides).length === 0) {
    return Array.isArray(roomOptions) ? roomOptions : [];
  }

  return (Array.isArray(roomOptions) ? roomOptions : []).map((room) => {
    const overrideKey = getHotelRoomOptionAliases(room).find((alias) =>
      Object.prototype.hasOwnProperty.call(normalizedOverrides, alias),
    );
    if (!overrideKey) return room;

    const nextPrice = normalizedOverrides[overrideKey];
    return {
      ...room,
      pricePerRoomNight: nextPrice,
      roomUnitPrice: nextPrice,
      precio_servicio: nextPrice,
      precioServicio: nextPrice,
    };
  });
};

const getHotelRoomOptionBasePrice = (room = {}) =>
  hotelNumber(
    room?.pricePerRoomNight ??
      room?.roomBaseUnitPrice ??
      room?.roomUnitPrice ??
      room?.precio_base_sin_igv ??
      room?.precio_servicio ??
      room?.precioServicio,
  );

const hotelRoomOptionsMatch = (left = {}, right = {}) => {
  const leftAliases = new Set(getHotelRoomOptionAliases(left));
  return getHotelRoomOptionAliases(right).some((alias) =>
    leftAliases.has(alias),
  );
};

const mergePersistedHotelRoomOptionsWithDictionary = (
  dictionaryOptions = [],
  persistedOptions = [],
) => {
  const dictionary = Array.isArray(dictionaryOptions) ? dictionaryOptions : [];
  const persisted = Array.isArray(persistedOptions) ? persistedOptions : [];

  if (dictionary.length === 0) return persisted;
  if (persisted.length === 0) return dictionary;

  const usedPersisted = new Set();
  const merged = dictionary.map((dictionaryRoom) => {
    const persistedIndex = persisted.findIndex(
      (persistedRoom, index) =>
        !usedPersisted.has(index) &&
        hotelRoomOptionsMatch(dictionaryRoom, persistedRoom),
    );
    if (persistedIndex < 0) return dictionaryRoom;

    usedPersisted.add(persistedIndex);
    const persistedRoom = persisted[persistedIndex];
    const canonicalBasePrice = normalizeHotelBasePriceAgainstCatalog(
      getHotelRoomOptionBasePrice(persistedRoom),
      getHotelRoomOptionBasePrice(dictionaryRoom),
    );

    return {
      ...dictionaryRoom,
      ...persistedRoom,
      key: dictionaryRoom.key || persistedRoom.key,
      label: dictionaryRoom.label || persistedRoom.label,
      capacity: dictionaryRoom.capacity || persistedRoom.capacity,
      id_habitacion:
        dictionaryRoom.id_habitacion || persistedRoom.id_habitacion,
      pricePerRoomNight: canonicalBasePrice,
      roomBaseUnitPrice: canonicalBasePrice,
      roomUnitPrice: canonicalBasePrice,
      precio_base_sin_igv: canonicalBasePrice,
    };
  });

  persisted.forEach((persistedRoom, index) => {
    if (!usedPersisted.has(index)) merged.push(persistedRoom);
  });
  return merged;
};

const sanitizeHotelPriceOverridesAgainstRoomOptions = (
  overrides = {},
  roomOptions = [],
) => {
  const normalizedOverrides = normalizeHotelPriceOverrideMap(overrides);
  return Object.entries(normalizedOverrides).reduce(
    (accumulator, [overrideKey, value]) => {
      const matchingRoom = (Array.isArray(roomOptions) ? roomOptions : []).find(
        (room) => getHotelRoomOptionAliases(room).includes(overrideKey),
      );
      accumulator[overrideKey] = normalizeHotelBasePriceAgainstCatalog(
        value,
        matchingRoom ? getHotelRoomOptionBasePrice(matchingRoom) : 0,
      );
      return accumulator;
    },
    {},
  );
};

const resolveHotelGroupRoomOptions = (group = {}, roomOptionsByCategory = {}) => {
  const category = normalizeHotelCategoryKey(group?.category);
  const persistedRoomOptions = Array.isArray(group?.roomOptions)
    ? group.roomOptions
    : [];
  const dictionaryRoomOptions =
    category && Array.isArray(roomOptionsByCategory?.[category]?.roomOptions)
      ? roomOptionsByCategory[category].roomOptions
      : [];
  const sourceRoomOptions = mergePersistedHotelRoomOptionsWithDictionary(
    dictionaryRoomOptions,
    persistedRoomOptions,
  );
  const canonicalOverrides = sanitizeHotelPriceOverridesAgainstRoomOptions(
    group?.priceOverrides || group?.price_overrides || {},
    sourceRoomOptions,
  );

  return applyHotelRoomPriceOverridesToOptions(
    sourceRoomOptions,
    canonicalOverrides,
  );
};

const getHotelGroupNightIndices = (group = {}) => {
  const source = Array.isArray(group?.dayIndices)
    ? group.dayIndices
    : Array.isArray(group?.selectedNightIndices)
      ? group.selectedNightIndices
      : [];
  return [...new Set(source)]
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value >= 0)
    .sort((a, b) => a - b);
};

const prefixGroupedRoomPricing = (perRoomPricing = [], group, groupIndex = 0) => {
  const dayIdentity = getHotelGroupNightIndices(group).join("-");
  const groupKey =
    group?.id ||
    group?.groupKey ||
    `${group?.category || "group"}-${groupIndex + 1}${dayIdentity ? `:${dayIdentity}` : ""}`;
  const groupLabel = group?.label || `Grupo ${groupIndex + 1}`;

  return (Array.isArray(perRoomPricing) ? perRoomPricing : []).map((room) => ({
    ...room,
    key: `${groupKey}:${room.key}`,
    groupKey,
    groupLabel,
    groupCategory: group?.category || null,
    groupDayIndices: getHotelGroupNightIndices(group),
    roomDetails: Array.isArray(room?.roomDetails)
      ? room.roomDetails.map((detail) => ({
          ...detail,
          roomId: `${groupKey}:${detail.roomId}`,
        }))
      : room.roomDetails,
  }));
};

const roomRank = (room = {}) => {
  const text = normalizeRoomText(`${room.key || ""} ${room.label || ""}`);
  const capacity = Math.max(1, hotelNumber(room.capacity) || 1);
  if (text.includes("simple") || text.includes("single") || capacity === 1) {
    return 1;
  }
  if (
    text.includes("doble") ||
    text.includes("double") ||
    text.includes("matrimonial") ||
    text.includes("twin") ||
    capacity === 2
  ) {
    return 2;
  }
  if (text.includes("triple") || capacity === 3) return 3;
  return 10 + capacity;
};

const buildAdultBeneficiariosPayload = (passengerIds = []) =>
  passengerIds.map((id) =>
    String(id).startsWith("child:") ? { id, child_origin: id } : { id },
  );

const buildHotelRoomPricingSignature = (hotelConfig = null) => {
  if (!hotelConfig || typeof hotelConfig !== "object") return "";
  const roomPricing = Array.isArray(hotelConfig.perRoomPricing)
    ? hotelConfig.perRoomPricing
    : [];

  return JSON.stringify({
    category: hotelConfig.category || null,
    hotel: hotelConfig.id_hotel || hotelConfig.hotelName || null,
    nights: Array.isArray(hotelConfig.selectedNightIndices)
      ? hotelConfig.selectedNightIndices
      : hotelConfig.nights || null,
    mix: hotelConfig.mix || null,
    rooms: roomPricing.map((room) => ({
      key: room.key,
      roomCount: room.roomCount,
      beneficiaries: room.beneficiaries,
      adultBeneficiaries: room.adultBeneficiaries,
      convertedChildBeneficiaries: room.convertedChildBeneficiaries,
      hotelPerPerson: room.hotelPerPerson,
      hotelTotalRoom: room.hotelTotalRoom,
      totalPerPerson: room.totalPerPerson,
      convertedChildTotalPerPerson: room.convertedChildTotalPerPerson,
      roomDetails: (room.roomDetails || []).map((detail) => ({
        roomId: detail.roomId,
        passengerIds: detail.passengerIds || [],
        hasIgv: Boolean(detail.hasIgv || detail.tieneIgv),
        igvAmount: detail.igvAmount || 0,
        unit: detail.unitWithIgv ?? detail.unit ?? detail.baseUnit ?? 0,
        hotelTotalRoom: detail.hotelTotalRoom || 0,
      })),
    })),
  });
};

const deriveRoomMixFromPerRoomPricing = (perRoomPricing = []) => {
  if (!Array.isArray(perRoomPricing) || perRoomPricing.length === 0) {
    return null;
  }

  const mix = perRoomPricing.reduce((accumulator, room) => {
    const key = String(
      room?.sourceRoomKey ||
        room?.roomKey ||
        String(room?.key || "").split(":")[0] ||
        "",
    ).trim();
    if (!key) return accumulator;

    const detailsCount = Array.isArray(room?.roomDetails)
      ? room.roomDetails.length
      : 0;
    const count = Math.max(1, Number(room?.roomCount) || detailsCount || 1);
    accumulator[key] = (accumulator[key] || 0) + count;
    return accumulator;
  }, {});

  return Object.keys(mix).length > 0 ? mix : null;
};

const getHotelPreviewMix = (hotelConfig = null) => {
  if (!hotelConfig || typeof hotelConfig !== "object") return null;
  const perRoomMix = deriveRoomMixFromPerRoomPricing(
    hotelConfig.perRoomPricing,
  );
  if (perRoomMix) return perRoomMix;
  return hotelConfig.mix && typeof hotelConfig.mix === "object"
    ? hotelConfig.mix
    : null;
};

const mergeRoomOptionsByCategory = (baseOptions = {}, ...rowGroups) => {
  const merged = {};

  Object.entries(baseOptions || {}).forEach(([category, value]) => {
    const key = normalizeHotelCategoryKey(category);
    if (!key || !Array.isArray(value?.roomOptions)) return;
    if (value.roomOptions.length === 0) return;
    merged[key] = value;
  });

  rowGroups.flat().forEach((row) => {
    const key = normalizeHotelCategoryKey(row?.category);
    if (!key || !Array.isArray(row?.roomOptions)) return;
    if (row.roomOptions.length === 0 || merged[key]?.roomOptions?.length) {
      return;
    }
    merged[key] = {
      hotelName: row.hotelName || "Hotel",
      id_hotel: row.id_hotel || null,
      roomOptions: row.roomOptions,
    };
  });

  return merged;
};

const getHotelDayGroupCategoryKeys = (hotelConfig = {}) => {
  const groups = Array.isArray(hotelConfig?.dayGroups)
    ? hotelConfig.dayGroups
    : [];
  const keys = groups
    .map((group) => normalizeHotelCategoryKey(group?.category || group?.groupCategory))
    .filter(Boolean);
  return Array.from(new Set(keys));
};

const getHotelDayGroupCount = (hotelConfig = {}) =>
  Array.isArray(hotelConfig?.dayGroups)
    ? hotelConfig.dayGroups.filter((group) => {
        const indices = Array.isArray(group?.selectedNightIndices)
          ? group.selectedNightIndices
          : Array.isArray(group?.groupDayIndices)
            ? group.groupDayIndices
            : [];
        return indices.length > 0 || group?.category || group?.groupCategory;
      }).length
    : 0;

const limitRowsToHotelGroupCategories = (rows = [], hotelConfig = {}) => {
  const groupCount = getHotelDayGroupCount(hotelConfig);
  const categoryKeys = getHotelDayGroupCategoryKeys(hotelConfig);
  if (groupCount <= 1 || categoryKeys.length === 0) return rows;

  const allowed = new Set(categoryKeys);
  const filtered = (Array.isArray(rows) ? rows : []).filter((row) =>
    allowed.has(normalizeHotelCategoryKey(row?.category)),
  );

  return filtered.length > 0 ? filtered : rows;
};

const attachComputedPerRoomPricingToRows = (
  rows = [],
  {
    hotelConfig,
    adultsCount = 1,
    childrenCount = 0,
    nonHotelsTotal = 0,
    nonHotelExplicitChildTotal = 0,
    nonHotelConvertedChildTotal = 0,
    additionalCosts = {},
    nights = 1,
    externalAdultTotal = 0,
    peopleDetails = {},
  } = {},
) => {
  if (!Array.isArray(rows) || rows.length === 0 || !hotelConfig) {
    return Array.isArray(rows) ? rows : [];
  }

  return rows.map((row) => {
    const roomOptions = Array.isArray(row?.roomOptions) ? row.roomOptions : [];
    if (roomOptions.length === 0) return row;

    const rowNights = Math.max(
      1,
      Number(row?.nights) ||
        (Array.isArray(hotelConfig?.selectedNightIndices)
          ? hotelConfig.selectedNightIndices.length
          : Number(hotelConfig?.nights)) ||
        nights ||
        1,
    );
    const perRoomPricing = buildCanonicalHotelPerRoomPricing({
      hotelConfig: {
        ...hotelConfig,
        ...row,
        category: row.category || hotelConfig.category,
        mix: row.mix || getHotelPreviewMix(hotelConfig) || {},
        roomOptions,
        roomAssignments: hotelConfig.roomAssignments || row.roomAssignments,
        childPricing: hotelConfig.childPricing || row.childPricing,
      },
      roomOptions,
      adultsCount,
      childrenCount,
      nonHotelsTotal,
      nonHotelExplicitChildTotal,
      nonHotelConvertedChildTotal,
      additionalCosts,
      nights: rowNights,
      externalAdultTotal,
      peopleDetails,
    });

    return {
      ...row,
      perRoomPricing:
        perRoomPricing.length > 0 ? perRoomPricing : row.perRoomPricing,
    };
  });
};

const hotelConfigHasRoomIgv = (hotelConfig = null) =>
  Array.isArray(hotelConfig?.perRoomPricing) &&
  hotelConfig.perRoomPricing.some((room) =>
    (room.roomDetails || []).some((detail) =>
      Boolean(detail?.hasIgv || detail?.tieneIgv || detail?.igvAmount > 0),
    ),
  );

const getHotelChildAdditionalPolicy = (additionalCosts = {}, field) =>
  additionalCosts?.[field] ??
  additionalCosts?.applyAdditionalCostsToChildren ??
  true;

const computeHotelAdditional = (
  additionalCosts = {},
  base = 0,
  audience = "adult",
) => {
  const isChild = audience === "child";
  const useAdultOperational =
    !isChild ||
    getHotelChildAdditionalPolicy(
      additionalCosts,
      "applyOperationalCostsToChildren",
    );
  const useAdultFee =
    !isChild ||
    getHotelChildAdditionalPolicy(additionalCosts, "applyFeeToChildren");
  const useAdultExtra =
    !isChild ||
    getHotelChildAdditionalPolicy(additionalCosts, "applyExtraFeeToChildren");

  const opMode = String(
    useAdultOperational
      ? additionalCosts?.operationalMode || "fixed"
      : additionalCosts?.childOperationalMode ||
          additionalCosts?.operationalMode ||
          "fixed",
  ).toLowerCase();
  const feeMode = String(
    useAdultFee
      ? additionalCosts?.feeMode || "fixed"
      : additionalCosts?.childFeeMode || additionalCosts?.feeMode || "fixed",
  ).toLowerCase();
  const opValue = hotelNumber(
    useAdultOperational
      ? additionalCosts?.operationalCosts
      : (additionalCosts?.childOperationalCosts ??
          additionalCosts?.operationalCosts),
  );
  const feeValue = hotelNumber(
    useAdultFee
      ? additionalCosts?.fee
      : (additionalCosts?.childFee ?? additionalCosts?.fee),
  );
  const extraValue = hotelNumber(
    useAdultExtra
      ? additionalCosts?.extraFee
      : (additionalCosts?.childExtraFee ?? additionalCosts?.extraFee),
  );
  const operational =
    opMode === "percentage"
      ? roundHotelAmount((opValue * base) / 100)
      : opValue;
  const fee =
    feeMode === "percentage"
      ? roundHotelAmount((feeValue * base) / 100)
      : feeValue;
  return roundHotelAmount(operational + fee + extraValue);
};

const buildCanonicalHotelPerRoomPricing = ({
  hotelConfig,
  roomOptions = [],
  adultsCount = 1,
  childrenCount = 0,
  nonHotelsTotal = 0,
  nonHotelExplicitChildTotal = 0,
  nonHotelConvertedChildTotal = 0,
  additionalCosts = {},
  nights = 1,
  externalAdultTotal = 0,
  peopleDetails = {},
}) => {
  if (!hotelConfig || !Array.isArray(roomOptions) || roomOptions.length === 0) {
    return [];
  }

  const mix =
    hotelConfig.mix && typeof hotelConfig.mix === "object"
      ? hotelConfig.mix
      : {};
  const optionMap = new Map(roomOptions.map((option) => [option.key, option]));
  const slots = Object.entries(mix).flatMap(([roomKey, rawCount]) => {
    const option = optionMap.get(roomKey);
    const count = Math.max(0, Number.parseInt(rawCount, 10) || 0);
    if (!option || count <= 0) return [];
    return Array.from({ length: count }, (_, index) => ({
      id: `${roomKey}:${index + 1}`,
      key: roomKey,
      label: option.label || roomKey,
      capacity: Math.max(1, hotelNumber(option.capacity) || 1),
      unit: hotelNumber(option.pricePerRoomNight),
      id_habitacion: option.id_habitacion || null,
    }));
  });

  if (slots.length === 0) return [];
  const peruvianPassengerIds = buildPeruvianPassengerIdSet(peopleDetails, {
    includeChildren: true,
  });

  const childPricing = hotelConfig.childPricing || {};
  const convertedMap = childPricing.convertedChildToAdultMap || {};
  const adultIds = Array.from(
    { length: Math.max(0, Number(adultsCount) || 0) },
    (_, index) => `adult:${index + 1}`,
  );
  const rawChildIds = Array.from(
    { length: Math.max(0, Number(childrenCount) || 0) },
    (_, index) => `child:${index + 1}`,
  );
  const assignedChildIds = new Set(
    Object.values(hotelConfig?.roomAssignments || {})
      .flat()
      .filter((id) => String(id).startsWith("child:")),
  );
  const convertedMapChildIds = Object.keys(convertedMap).filter((id) =>
    String(id).startsWith("child:"),
  );
  const allChildIds = Array.from(
    new Set([
      ...rawChildIds,
      ...Array.from(assignedChildIds),
      ...convertedMapChildIds,
    ]),
  );
  const convertedChildIds = allChildIds.filter(
    (id) => convertedMap[id] || assignedChildIds.has(id),
  );
  const assignments = Object.fromEntries(slots.map((slot) => [slot.id, []]));
  const resolvedRoomAssignments = resolveHotelRoomAssignments(
    hotelConfig.roomAssignments,
    slots,
  );
  const assignablePassengerIds = new Set([...adultIds, ...convertedChildIds]);
  const assignedPassengerIds = new Set();

  if (resolvedRoomAssignments && typeof resolvedRoomAssignments === "object") {
    slots.forEach((slot) => {
      const savedPassengerIds = Array.isArray(resolvedRoomAssignments[slot.id])
        ? resolvedRoomAssignments[slot.id]
        : [];
      savedPassengerIds.forEach((id) => {
        if (
          assignablePassengerIds.has(id) &&
          !assignedPassengerIds.has(id) &&
          assignments[slot.id].length < slot.capacity
        ) {
          assignments[slot.id].push(id);
          assignedPassengerIds.add(id);
        }
      });
    });
  }

  const assign = (ids, orderedSlots) => {
    ids.forEach((id) => {
      if (assignedPassengerIds.has(id)) return;
      const target = orderedSlots.find(
        (slot) => assignments[slot.id].length < slot.capacity,
      );
      if (target) {
        assignments[target.id].push(id);
        assignedPassengerIds.add(id);
      }
    });
  };

  assign(
    adultIds,
    [...slots].sort((left, right) => {
      const capacityDiff = right.capacity - left.capacity;
      if (capacityDiff !== 0) return capacityDiff;
      return roomRank(right) - roomRank(left);
    }),
  );
  assign(
    convertedChildIds,
    [...slots].sort((left, right) => {
      const capacityDiff = left.capacity - right.capacity;
      if (capacityDiff !== 0) return capacityDiff;
      return roomRank(left) - roomRank(right);
    }),
  );

  const selectedNights = Math.max(1, Number(nights) || 1);
  const sameTypeCounters = {};
  const convertedBasePerChild =
    convertedChildIds.length > 0
      ? roundHotelAmount(nonHotelConvertedChildTotal / convertedChildIds.length)
      : 0;
  const explicitBasePerChild =
    childrenCount > 0
      ? roundHotelAmount(nonHotelExplicitChildTotal / childrenCount)
      : 0;

  return slots
    .flatMap((slot) => {
      const passengerIds = assignments[slot.id] || [];
      if (passengerIds.length === 0) return [];
      const adultPassengerIds = passengerIds.filter((id) =>
        String(id).startsWith("adult:"),
      );
      const convertedChildPassengerIds = passengerIds.filter((id) =>
        String(id).startsWith("child:"),
      );
      const hasRoomIgv = passengerIds.some((id) =>
        peruvianPassengerIds.has(String(id)),
      );
      sameTypeCounters[slot.key] = (sameTypeCounters[slot.key] || 0) + 1;
      const roomIndex = sameTypeCounters[slot.key];
      const sameTypeCount = slots.filter(
        (item) => item.key === slot.key,
      ).length;
      const baseLabel = slot.label || slot.key;
      const displayLabel =
        sameTypeCount > 1 ? `${baseLabel} ${roomIndex}` : baseLabel;
      const roomBaseUnit = roundHotelAmount(slot.unit);
      const roomIgvAmount = hasRoomIgv
        ? roundHotelAmount(roomBaseUnit * HOTEL_IGV_RATE)
        : 0;
      const roomUnitWithIgv = roundHotelAmount(roomBaseUnit + roomIgvAmount);
      const hotelTotalSlot = roundHotelAmount(roomUnitWithIgv * selectedNights);
      const beneficiaries = Math.max(1, passengerIds.length);
      const adultBeneficiaries = adultPassengerIds.length;
      const convertedChildBeneficiaries = convertedChildPassengerIds.length;
      const hotelPerPerson = roundHotelAmount(hotelTotalSlot / beneficiaries);
      const base = roundHotelAmount(
        hotelNumber(nonHotelsTotal) + hotelPerPerson,
      );
      const adicionales = computeHotelAdditional(additionalCosts, base);
      const totalPerPerson = roundHotelAmount(base + adicionales);
      const roomDetails = [
        {
          roomId: slot.id,
          label: displayLabel,
          capacity: slot.capacity,
          passengerIds,
          adultPassengerIds,
          convertedChildPassengerIds,
          hasIgv: hasRoomIgv,
          tieneIgv: hasRoomIgv,
          igvRate: hasRoomIgv ? 18 : 0,
          igvAmount: roomIgvAmount,
          roomBaseUnit,
          unit: roomUnitWithIgv,
          unitWithIgv: roomUnitWithIgv,
          baseUnit: roomBaseUnit,
          hotelTotalRoom: hotelTotalSlot,
        },
      ];

      return [
        {
          key: `${slot.key}:${roomIndex}`,
          roomKey: slot.key,
          sourceRoomKey: slot.key,
          label: displayLabel,
          baseLabel,
          capacity: slot.capacity,
          roomCount: 1,
          beneficiaries,
          adultBeneficiaries,
          convertedChildBeneficiaries,
          passengerIds: [...new Set(passengerIds)],
          adultPassengerIds: [...new Set(adultPassengerIds)],
          convertedChildPassengerIds: [...new Set(convertedChildPassengerIds)],
          roomDetails,
          hotelPerNight: roomUnitWithIgv,
          hotelTotalRoom: hotelTotalSlot,
          beneficiarios_adulto: buildAdultBeneficiariosPayload([
            ...new Set(passengerIds),
          ]),
          hotelPerPerson,
          hasIgv: hasRoomIgv,
          tieneIgv: hasRoomIgv,
          igvRate: hasRoomIgv ? 18 : 0,
          igvPerPerson: roundHotelAmount(
            (roomIgvAmount * selectedNights) / Math.max(1, beneficiaries),
          ),
          convertedChildHotelPerPerson: hotelPerPerson,
          convertedChildTotalPerPerson:
            convertedChildBeneficiaries > 0
              ? roundHotelAmount(
                  explicitBasePerChild + convertedBasePerChild + hotelPerPerson,
                )
              : 0,
          convertedChildDisplayTotalPerPerson:
            convertedChildBeneficiaries > 0
              ? roundHotelAmount(
                  explicitBasePerChild + convertedBasePerChild + hotelPerPerson,
                )
              : 0,
          convertedChildServicePerPerson:
            convertedChildBeneficiaries > 0
              ? roundHotelAmount(explicitBasePerChild + convertedBasePerChild)
              : 0,
          convertedChildAdicionales:
            convertedChildBeneficiaries > 0
              ? computeHotelAdditional(
                  additionalCosts,
                  roundHotelAmount(
                    explicitBasePerChild +
                      convertedBasePerChild +
                      hotelPerPerson,
                  ),
                  "child",
                )
              : 0,
          convertedChildAdditionalApplied:
            convertedChildBeneficiaries > 0 &&
            (getHotelChildAdditionalPolicy(
              additionalCosts,
              "applyOperationalCostsToChildren",
            ) ||
              getHotelChildAdditionalPolicy(
                additionalCosts,
                "applyFeeToChildren",
              ) ||
              getHotelChildAdditionalPolicy(
                additionalCosts,
                "applyExtraFeeToChildren",
              )),
          base,
          adicionales,
          totalPerPerson,
          displayTotalPerPerson: roundHotelAmount(
            totalPerPerson + externalAdultTotal,
          ),
        },
      ];
    })
    .sort((left, right) => roomRank(left) - roomRank(right));
};


const toDateTimeLocalInputValue = (value) => {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};

const dateTimeLocalInputToIso = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const getCotizacionCreationDateValue = (cotizacion) =>
  toDateTimeLocalInputValue(
    cotizacion?.fecha || cotizacion?.createdat || cotizacion?.createdAt || "",
  );

const getCreatorOptionValue = (user) =>
  user?.dniuser || user?.dni || user?.id || user?.username || "";

const getCreatorOptionLabel = (user) => {
  const fullName = [
    user?.nombres || user?.nombre,
    user?.apellidopaterno || user?.apellido_paterno,
    user?.apellidomaterno || user?.apellido_materno,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const identifier = getCreatorOptionValue(user);
  return fullName ? `${fullName} (${identifier})` : identifier || user?.email || "Usuario";
};

const parseAdditionalCostsForEditor = (rawAdditionalCosts) => {
  if (!rawAdditionalCosts) return {};

  try {
    const parsed =
      typeof rawAdditionalCosts === "string"
        ? JSON.parse(rawAdditionalCosts)
        : rawAdditionalCosts;

    return sanitizeAdditionalCostsConfig(parsed || {});
  } catch {
    return {};
  }
};

const buildEditorAdditionalCostsState = (rawAdditionalCosts, cotizacion = {}) => {
  const parsedAdditionalCosts = parseAdditionalCostsForEditor(rawAdditionalCosts);
  const applyAdditionalCostsToChildren =
    parsedAdditionalCosts.applyAdditionalCostsToChildren !== false;

  return {
    ...parsedAdditionalCosts,
    operationalCosts: String(parsedAdditionalCosts.operationalCosts ?? "0"),
    fee: String(parsedAdditionalCosts.fee ?? "25"),
    feeVal: String(parsedAdditionalCosts.feeVal ?? parsedAdditionalCosts.fee ?? "25"),
    extraFee: String(parsedAdditionalCosts.extraFee ?? "0"),
    operationalMode: String(parsedAdditionalCosts.operationalMode ?? "fixed"),
    feeMode: String(parsedAdditionalCosts.feeMode ?? "percentage"),
    applyAdditionalCostsToChildren,
    applyOperationalCostsToChildren:
      parsedAdditionalCosts.applyOperationalCostsToChildren ??
      applyAdditionalCostsToChildren,
    applyFeeToChildren:
      parsedAdditionalCosts.applyFeeToChildren ?? applyAdditionalCostsToChildren,
    applyExtraFeeToChildren:
      parsedAdditionalCosts.applyExtraFeeToChildren ?? applyAdditionalCostsToChildren,
    childOperationalMode: String(
      parsedAdditionalCosts.childOperationalMode ??
        parsedAdditionalCosts.operationalMode ??
        "fixed",
    ),
    childOperationalCosts: String(
      parsedAdditionalCosts.childOperationalCosts ??
        parsedAdditionalCosts.operationalCosts ??
        "0",
    ),
    childFeeMode: String(
      parsedAdditionalCosts.childFeeMode ??
        parsedAdditionalCosts.feeMode ??
        "percentage",
    ),
    childFee: String(
      parsedAdditionalCosts.childFee ?? parsedAdditionalCosts.fee ?? "25",
    ),
    childExtraFee: String(
      parsedAdditionalCosts.childExtraFee ?? parsedAdditionalCosts.extraFee ?? "0",
    ),
    subtotalNinos: Number(parsedAdditionalCosts.subtotalNinos ?? 0),
    nonHotelExplicitChildTotal: Number(
      parsedAdditionalCosts.nonHotelExplicitChildTotal ??
        parsedAdditionalCosts.baseExplicitChildTotal ??
        parsedAdditionalCosts.subtotalNinos ??
        0,
    ),
    nonHotelConvertedChildTotal: Number(
      parsedAdditionalCosts.nonHotelConvertedChildTotal ??
        parsedAdditionalCosts.baseConvertedChildTotal ??
        0,
    ),
    nonHotelExplicitChildTotalsById:
      parsedAdditionalCosts.nonHotelExplicitChildTotalsById ||
      parsedAdditionalCosts.baseExplicitChildTotalsById ||
      {},
    nonHotelConvertedChildTotalsById:
      parsedAdditionalCosts.nonHotelConvertedChildTotalsById ||
      parsedAdditionalCosts.baseConvertedChildTotalsById ||
      {},
    hotelExplicitChildTotalsById:
      parsedAdditionalCosts.hotelExplicitChildTotalsById || {},
    hotelConvertedChildTotalsById:
      parsedAdditionalCosts.hotelConvertedChildTotalsById || {},
    hasIgv: cotizacion?.hasIgv ?? parsedAdditionalCosts.hasIgv ?? false,
    igvRate: cotizacion?.igvRate ?? parsedAdditionalCosts.igvRate ?? 18,
    igvAmount: cotizacion?.igvAmount ?? parsedAdditionalCosts.igvAmount ?? 0,
    calculatedOperational: parsedAdditionalCosts.calculatedOperational || 0,
    calculatedFee: parsedAdditionalCosts.calculatedFee || 0,
  };
};

/* =========================================
 COMPONENTE PRINCIPAL
========================================= */
export function EdicionCotizacion({
  onNext,
  onBack,
  onClose,
  selectedPackage,
  editingCotizacion,
  clientData,
  userPlatform,
  userBusinessType,
  quotationAgency = null,
  quotationAgencyId = 1,
  quotationTariffType = null,
  userRole,
  sourceVoucher = null,
  initialStep,
  isSaving: isSavingFromParent = false,
}) {
  const [showSourceVoucherPreview, setShowSourceVoucherPreview] = useState(false);
  const effectiveSourceVoucher = useMemo(
    () => normalizeSourceVoucher(sourceVoucher || editingCotizacion?.source_voucher || editingCotizacion?.sourceVoucher),
    [sourceVoucher, editingCotizacion?.source_voucher, editingCotizacion?.sourceVoucher],
  );

  const [showPreLiquidacion, setShowPreLiquidacion] = useState(false);
  const [preliquidacion, setPreliquidacion] = useState(() =>
    normalizePreLiquidacion(editingCotizacion?.preliquidacion),
  );

  const { user } = useAuth();
  const normalizedUserRole = Number(userRole ?? user?.role ?? -1);
  const isSuperAdmin = normalizedUserRole === 0;
  const currentUserIdentifier = user?.dni || user?.dniuser || user?.sub || "";
  const currentUserFullName = [
    user?.nombres || user?.nombre || user?.firstName,
    user?.apellidopaterno || user?.apellido_paterno || user?.apellidoPaterno || user?.lastName,
    user?.apellidomaterno || user?.apellido_materno || user?.apellidoMaterno,
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const postSaleEditRequest = editingCotizacion?._postSaleEditRequest || null;
  const [postSaleClock, setPostSaleClock] = useState(Date.now());
  const postSaleAuthorizationValid = editingCotizacion?.tiene_voucher
    ? Boolean(postSaleEditRequest) &&
      isApprovedAndUsable(postSaleEditRequest, postSaleClock)
    : true;

  useEffect(() => {
    if (!postSaleEditRequest?.expires_at) return undefined;
    const timer = window.setInterval(() => setPostSaleClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [postSaleEditRequest?.expires_at]);

  const effectivePlatform = userPlatform || user?.platform || "venso";
  const initialAgencyId = Math.max(
    1,
    Number(
      quotationAgencyId ||
        quotationAgency?.id ||
        editingCotizacion?.agency_id ||
        editingCotizacion?.agencyId ||
        1,
    ),
  );
  const [selectedAgencyId, setSelectedAgencyId] = useState(initialAgencyId);
  const [selectedTariffType, setSelectedTariffType] = useState<string | null>(
    () =>
      normalizeAgencyTariffType(
        quotationTariffType ||
          editingCotizacion?.tariff_type ||
          editingCotizacion?.tariffType ||
          quotationAgency?.default_tariff_type,
      ),
  );
  const [showAgencyCreateForm, setShowAgencyCreateForm] = useState(false);
  const [newAgencyName, setNewAgencyName] = useState("");
  const [isCreatingAgency, setIsCreatingAgency] = useState(false);
  const [agencyCreateError, setAgencyCreateError] = useState<string | null>(
    null,
  );
  const agenciesQuery = useQuery<Agency[]>({
    queryKey: ["agencies", "quotation-editor"],
    queryFn: () => getAgencies(false),
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });
  const selectableAgencies = agenciesQuery.data || [];
  const selectedQuotationAgency = useMemo(
    () =>
      selectableAgencies.find((agency) => agency.id === selectedAgencyId) ||
      (Number(quotationAgency?.id) === selectedAgencyId
        ? quotationAgency
        : null) ||
      (Number(editingCotizacion?.agency?.id) === selectedAgencyId
        ? editingCotizacion.agency
        : null),
    [
      selectableAgencies,
      selectedAgencyId,
      quotationAgency,
      editingCotizacion?.agency,
    ],
  );
  const agencySelectOptions = useMemo(() => {
    if (
      !selectedQuotationAgency ||
      selectableAgencies.some((agency) => agency.id === selectedQuotationAgency.id)
    ) {
      return selectableAgencies;
    }
    return [...selectableAgencies, selectedQuotationAgency].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }, [selectableAgencies, selectedQuotationAgency]);
  const effectiveAgencyId = Math.max(
    1,
    Number(
      selectedQuotationAgency?.id || selectedAgencyId || initialAgencyId,
    ),
  );
  const effectiveBusinessType =
    selectedQuotationAgency?.business_type ||
    editingCotizacion?.business_type ||
    editingCotizacion?.businessType ||
    userBusinessType ||
    user?.business_type ||
    "B2C";

  const effectiveAgencyName =
    selectedQuotationAgency?.name ||
    editingCotizacion?.agency_name ||
    editingCotizacion?.agency?.name ||
    (effectiveAgencyId === 1 ? "Venso Tours" : `Agencia #${effectiveAgencyId}`);

  useEffect(() => {
    setPreliquidacion((current) => {
      const normalized = normalizePreLiquidacion(current);
      return normalizePreLiquidacion({
        ...normalized,
        program: normalized.program || editingCotizacion?.titulo || "",
        // La agencia comercial del documento siempre debe seguir el contexto
        // que se guardará en la cotización, incluso si se cambió en el editor.
        agency: effectiveAgencyName,
        counter: normalized.counter || currentUserFullName,
      });
    });
  }, [editingCotizacion?.titulo, effectiveAgencyName, currentUserFullName]);

  const isPrimaryAgency = Boolean(
    selectedQuotationAgency?.is_primary ||
      String(selectedQuotationAgency?.code || "").toLowerCase() === "venso" ||
      String(effectiveAgencyName || "").trim().toLowerCase() === "venso tours" ||
      effectiveAgencyId === 1,
  );
  // El gestor hotelero pertenece al editor de Venso y está disponible para
  // cualquier agencia. La agencia solo determina las tarifas consultadas.
  const useVensoHotelPricing = true;

  const tariffType = useMemo(() => {
    const explicit = normalizeAgencyTariffType(selectedTariffType);
    if (explicit) return explicit;
    return String(effectiveBusinessType).toUpperCase() === "B2B"
      ? "interna"
      : "externa";
  }, [selectedTariffType, effectiveBusinessType]);
  const canChangeAgency =
    !editingCotizacion?.tiene_voucher || postSaleAuthorizationValid;
  const handleQuotationAgencyChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const nextAgencyId = Number(event.target.value);
      const nextAgency = selectableAgencies.find(
        (agency) => agency.id === nextAgencyId,
      );
      if (!Number.isInteger(nextAgencyId) || nextAgencyId <= 0 || !nextAgency) {
        return;
      }
      setSelectedAgencyId(nextAgencyId);
      setSelectedTariffType(
        normalizeAgencyTariffType(nextAgency.default_tariff_type),
      );
      setShowAgencyCreateForm(false);
      setAgencyCreateError(null);
    },
    [selectableAgencies],
  );
  const canCreateAgency = isSuperAdmin && canChangeAgency;
  const handleCreateQuotationAgency = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const name = newAgencyName.trim();
      if (!name) {
        setAgencyCreateError("Ingresa el nombre de la agencia.");
        return;
      }

      setIsCreatingAgency(true);
      setAgencyCreateError(null);
      try {
        const created = await createAgency({
          name,
          active: true,
          is_primary: false,
        });
        queryClient.setQueryData<Agency[]>(
          ["agencies", "quotation-editor"],
          (current = []) =>
            [...current.filter((agency) => agency.id !== created.id), created].sort(
              (left, right) => left.name.localeCompare(right.name),
            ),
        );
        setSelectedAgencyId(created.id);
        setSelectedTariffType(
          normalizeAgencyTariffType(created.default_tariff_type),
        );
        setNewAgencyName("");
        setShowAgencyCreateForm(false);
      } catch (error: any) {
        setAgencyCreateError(
          error?.response?.data?.message ||
            error?.response?.data?.error ||
            error?.message ||
            "No fue posible crear la agencia.",
        );
      } finally {
        setIsCreatingAgency(false);
      }
    },
    [newAgencyName],
  );

  const creatorUsersQuery = useQuery({
    queryKey: ["accounts", "quotation-creators"],
    queryFn: async () => {
      const response = await getUsers(1, 5000, "created_at", -1);
      return response?.accounts || response?.data?.accounts || [];
    },
    enabled: isSuperAdmin,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 120,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const creatorUsers = isSuperAdmin ? creatorUsersQuery.data || [] : [];
  const creatorUsersLoading = isSuperAdmin && creatorUsersQuery.isLoading;

  // ===== Navegación / encabezado =====
  const [currentStep, setCurrentStep] = useState(
    initialStep && STEPS[initialStep.toUpperCase()]
      ? STEPS[initialStep.toUpperCase()]
      : STEPS.PASAJEROS,
  );
  const [showResumen, setShowResumen] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showSuperAdminAudit, setShowSuperAdminAudit] = useState(false);
  const [showPostSaleAuthorizationDetails, setShowPostSaleAuthorizationDetails] =
    useState(false);
  const superAdminAuditRef = useRef(null);
  const postSaleAuthorizationDetailsRef = useRef(null);

  useEffect(() => {
    if (!showSuperAdminAudit) return undefined;

    const handlePointerDown = (event) => {
      if (!superAdminAuditRef.current?.contains(event.target)) {
        setShowSuperAdminAudit(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setShowSuperAdminAudit(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showSuperAdminAudit]);

  useEffect(() => {
    if (!showPostSaleAuthorizationDetails) return undefined;

    const handlePointerDown = (event) => {
      if (!postSaleAuthorizationDetailsRef.current?.contains(event.target)) {
        setShowPostSaleAuthorizationDetails(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setShowPostSaleAuthorizationDetails(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showPostSaleAuthorizationDetails]);

  // NUEVO: modal unificado hoteles+resumen
  const [showHotelModal, setShowHotelModal] = useState(false);
  const [showExternalModal, setShowExternalModal] = useState(false);

  const [summarySnapshot, setSummarySnapshot] = useState(null);

  const [titulo, setTitulo] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [titleInitialized, setTitleInitialized] = useState(false);
  const [showTitleError, setShowTitleError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // React state is intentionally complemented by a ref: two clicks can arrive
  // in the same render frame, before `isSubmitting` disables the buttons.
  const submitInFlightRef = useRef(false);

  // ===== Itinerario =====
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentDayIndex, setCurrentDayIndex] = useState(null);
  const [selectedServiceCategory, setSelectedServiceCategory] = useState(null);
  const [passengerSelection, setPassengerSelection] = useState(null);
  const [replacingServiceIndex, setReplacingServiceIndex] = useState(null);

  const [days, _setDays] = useState([]);
  const [selectedHotelConfig, setSelectedHotelConfig] = useState(() =>
    normalizeSelectedHotelConfig(
      editingCotizacion?.selectedHotel ||
        editingCotizacion?.selected_hotel ||
        null,
      editingCotizacion?.hotel_detalle ||
        editingCotizacion?.hotelDetalle ||
        null,
    ),
  );
  const setDays = (updaterOrValue) => {
    _setDays((prev) => {
      const prevClone = JSON.parse(JSON.stringify(prev));
      const next =
        typeof updaterOrValue === "function"
          ? updaterOrValue(prevClone)
          : updaterOrValue;
      return next;
    });
  };

  const lockedHotelDayIndices = useMemo(
    () =>
      (Array.isArray(days) ? days : []).reduce((indices, day, dayIndex) => {
        const hasAssignedHotel = (day?.servicios || []).some(
          (service) =>
            isHotelService(service) &&
            isOperationallyAssignedService(service),
        );
        if (hasAssignedHotel) indices.push(dayIndex);
        return indices;
      }, []),
    [days],
  );

  // Itinerario externo (no participa en cálculos por persona/día)
  const [externalDays, _setExternalDays] = useState([]);
  const setExternalDays = (updaterOrValue) => {
    _setExternalDays((prev) => {
      const prevClone = JSON.parse(JSON.stringify(prev));
      const next =
        typeof updaterOrValue === "function"
          ? updaterOrValue(prevClone)
          : updaterOrValue;
      return next;
    });
  };
  // Estado de filtrado de categorías en el preview Excel
  const [excelPreviewCategories, setExcelPreviewCategories] = useState(() => {
    const savedCategories =
      editingCotizacion?.pdf_excel_preview_categories ||
      editingCotizacion?.excelPreviewCategories ||
      editingCotizacion?.excel_preview_categories;
    return Array.isArray(savedCategories)
      ? savedCategories.map((category) => String(category)).filter(Boolean)
      : [];
  });

  // Costos adicionales del itinerario externo (separados de los principales)
  const [externalAdditionalCosts, setExternalAdditionalCosts] = useState(() => {
    const saved = editingCotizacion?.externalAdditionalCosts;
    if (saved && typeof saved === "object") {
      return {
        operationalCosts: String(saved.operationalCosts || "0"),
        operationalMode: String(saved.operationalMode || "fixed"),
        fee: String(saved.fee || "0"),
        extraFee: String(saved.extraFee || "0"),
      };
    }
    return {
      operationalCosts: "0",
      operationalMode: "fixed",
      fee: "0",
      extraFee: "0",
    };
  });

  // Tasa de cambio persistida (se recibe de DaysEditor y se guarda en BD)
  const [currentTc, setCurrentTc] = useState(() => {
    const saved = editingCotizacion?.tasa_cambio;
    return saved != null && Number(saved) > 0 ? Number(saved) : 3;
  });
  const [showExtraModal, setShowExtraModal] = useState(false);
  const [extraModalDayIndex, setExtraModalDayIndex] = useState(null);

  // ===== Paquete importado (tracking) =====
  const [importedPackageInfo, setImportedPackageInfo] = useState(() => {
    if (editingCotizacion?.id_paquete) {
      return {
        id: editingCotizacion.id_paquete,
        nombre: editingCotizacion.nombre_paquete || null,
        modificado: editingCotizacion.paquete_modificado || false,
      };
    }
    return null;
  });
  const importedPackageInfoRef = useRef(importedPackageInfo);
  useEffect(() => {
    importedPackageInfoRef.current = importedPackageInfo;
  }, [importedPackageInfo]);
  const importedDaysSnapshotRef = useRef(null);

  // Fetch nombre del paquete si falta (no se persiste en la BD)
  useEffect(() => {
    if (importedPackageInfo?.id && !importedPackageInfo.nombre) {
      axios
        .get(`/turismo/paquetes-turisticos/${importedPackageInfo.id}`)
        .then((res) => {
          const nombre = res.data?.data?.nombre;
          if (nombre) {
            setImportedPackageInfo((prev) => ({ ...prev, nombre }));
          }
        })
        .catch(() => {}); // silenciar si no existe
    }
  }, [importedPackageInfo?.id, importedPackageInfo?.nombre]);

  /* [AUTO-TRANSPORT-DISABLED]
  // ===== Conflictos de capacidad de transporte al importar paquetes =====
  const [transportConflicts, setTransportConflicts] = useState(null);
  const [replacingConflictIndex, setReplacingConflictIndex] = useState(null);
  // Track last pax count used for transport check to avoid redundant modals
  const transportCheckPaxRef = useRef(null);
  */

  // ===== Personas =====
  const [peopleCount, setPeopleCount] = useState({
    adults: editingCotizacion?.peopleCount?.adults || 1,
    children: editingCotizacion?.peopleCount?.children || 0,
  });

  const [formData, setFormData] = useState({
    cantidadPersonas:
      editingCotizacion?.cantidadPersonas ||
      (editingCotizacion?.peopleCount
        ? (editingCotizacion.peopleCount.adults || 0) +
          (editingCotizacion.peopleCount.children || 0)
        : 1),
    fechainicio: editingCotizacion?.fechainicio || "",
    fechafin: editingCotizacion?.fechafin || "",
    adminFechaCreacion: getCotizacionCreationDateValue(editingCotizacion),
    adminCreatedBy: editingCotizacion?.createdby || currentUserIdentifier || "",
  });

  const [additionalCosts, setAdditionalCosts] = useState(() =>
    buildEditorAdditionalCostsState(
      editingCotizacion?.additionalCosts || editingCotizacion?.additionalcosts,
      {
        hasIgv: editingCotizacion?.hasIgv ?? editingCotizacion?.hasigv,
        igvRate: editingCotizacion?.igvRate ?? editingCotizacion?.igvrate,
        igvAmount: editingCotizacion?.igvAmount ?? editingCotizacion?.igvamount,
      },
    ),
  );

  const [packageType, setPackageType] = useState(
    editingCotizacion?.packageType || "compartido",
  );
  const [includeChildrenInPricing, setIncludeChildrenInPricing] = useState(
    editingCotizacion?.includeChildrenInPricing ?? false,
  );

  const [stepsCompleted, setStepsCompleted] = useState({
    [STEPS.PASAJEROS]: false,
    [STEPS.ITINERARIO]: false,
    [STEPS.COSTOS]: false,
  });

  const [peopleDetails, setPeopleDetails] = useState(() => {
    if (
      editingCotizacion?.peopleDetails &&
      editingCotizacion.peopleDetails.adults &&
      Array.isArray(editingCotizacion.peopleDetails.adults)
    ) {
      return editingCotizacion.peopleDetails;
    }
    return {
      adults: Array(editingCotizacion?.peopleCount?.adults || 1)
        .fill(0)
        .map((_, idx) => ({
          id: idx + 1,
          age: "18",
          nacionalidad: "",
        })),
      children: Array(editingCotizacion?.peopleCount?.children || 0)
        .fill(0)
        .map((_, idx) => ({
          id: idx + 1,
          age: "6",
        })),
    };
  });

  useEffect(() => {
    setPeopleDetails((prev) =>
      buildCanonicalPassengerComposition(prev, peopleCount).peopleDetails,
    );
  }, [peopleCount]);

  // Refs de guardado: permiten construir el payload con la composición más
  // reciente aunque el usuario guarde desde cualquier step inmediatamente
  // después de agregar o quitar pasajeros.
  const peopleCountRef = useRef(peopleCount);
  const peopleDetailsRef = useRef(peopleDetails);
  peopleCountRef.current = peopleCount;
  peopleDetailsRef.current = peopleDetails;

  const getCurrentPassengerComposition = useCallback(
    () =>
      buildCanonicalPassengerComposition(
        peopleDetailsRef.current,
        peopleCountRef.current,
      ),
    [],
  );

  const [errors, setErrors] = useState({ adults: {}, children: {} });
  const [showImportModal, setShowImportModal] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  const snackbarTimerRef = useRef(null);
  const daysEditorRef = useRef(null);
  const justInitializedRef = useRef(false);

  /* ===================== FECHAS / DÍAS ===================== */
  const toDateOnly = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const diffDaysInclusive = (startStr, endStr) => {
    const start = toDateOnly(startStr);
    const end = toDateOnly(endStr);
    if (!start || !end) return null;
    const ms = end.getTime() - start.getTime();
    const days = Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
    return days;
  };

  const MAX_DAYS_ALLOWED = 60;

  const buildEmptyDay = (index) => ({
    numero: index + 1,
    titulo: "",
    ciudades: [],
    servicios: [],
  });

  const ensureDaysMinLength = (prevDays = [], targetLen = 1) => {
    const safeTarget = Math.max(1, Number(targetLen) || 1);
    const cloned = Array.isArray(prevDays) ? [...prevDays] : [];

    let next = [...cloned];
    while (next.length < safeTarget) {
      next.push(buildEmptyDay(next.length));
    }

    next = next.map((d, idx) => ({
      ...d,
      numero: idx + 1,
      servicios: Array.isArray(d?.servicios) ? d.servicios : [],
      ciudades: Array.isArray(d?.ciudades) ? d.ciudades : [],
    }));

    return next;
  };

  const activeDaysLen = useMemo(() => {
    const computed = diffDaysInclusive(
      formData?.fechainicio,
      formData?.fechafin,
    );
    return computed ? Math.max(1, computed) : null;
  }, [formData?.fechainicio, formData?.fechafin]);

  const visibleDays = useMemo(() => days || [], [days]);

  /* ===================== AUTOGUARDADO BORRADOR ===================== */
  const { clearCurrentDraft } = useCotizacionDraft({
    editingCotizacion,
    days,
    peopleCount,
    peopleDetails,
    packageType,
    additionalCosts,
    titulo,
    formData,
    clientData,
    platform: effectivePlatform,
    businessType: effectiveBusinessType,
    agency: selectedQuotationAgency,
    agencyId: effectiveAgencyId,
    tariffType,
    externalDays,
    externalAdditionalCosts,
    includeChildrenInPricing,
    currentTc,
    enabled: true,
  });

  const showSnackbar = (message, severity = "success") => {
    if (snackbarTimerRef.current) {
      clearTimeout(snackbarTimerRef.current);
    }
    setSnackbar({ open: true, message, severity });
    snackbarTimerRef.current = setTimeout(() => {
      setSnackbar((prev) => ({ ...prev, open: false }));
      snackbarTimerRef.current = null;
    }, 5000);
  };

  useEffect(() => {
    return () => {
      if (snackbarTimerRef.current) clearTimeout(snackbarTimerRef.current);
    };
  }, []);

  /* ===================== HOTEL -> DAYS (AUTO) ===================== */
  /** Inject hotel services into days based on the selected hotel configuration. */
  const injectHotelIntoDays = useCallback((row) => {
    setDays((prevDays) => injectHotelIntoDaysPure(prevDays, row));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ===================== DICCIONARIO HOTELES ===================== */
  const hasExistingHotelForDictionary = Boolean(
    selectedHotelConfig?.category ||
      selectedHotelConfig?.hotelName ||
      editingCotizacion?.hotel_detalle ||
      editingCotizacion?.hotelDetalle ||
      editingCotizacion?.selectedHotel ||
      editingCotizacion?.selected_hotel,
  );
  const hotelDictionaryEnabled = shouldEnableHotelDictionary({
    currentStep,
    passengerStep: STEPS.PASAJEROS,
    showHotelModal,
    hasExistingHotel: hasExistingHotelForDictionary,
  });

  const {
    loading: hotelDictLoading,
    error: hotelDictError,
    byCategory: hotelDict,
  } = useHotelQuoteDictionary({
    axios,
    tariffType,
    // La agencia de la cotización es autoritativa para el tarifario hotelero.
    // No debe cambiar desde el modal ni heredar un scope temporal de otros pickers.
    agencyId: effectiveAgencyId,
    enabled: hotelDictionaryEnabled,
  });

  const roomOptionsByCategoryMemo = useMemo(() => {
    return buildRoomOptionsByCategory(hotelDict, tariffType, packageType);
  }, [hotelDict, tariffType, packageType]);

  /* ===================== PASAJEROS ===================== */
  const passengers = useMemo(() => {
    const all = [];
    if (peopleDetails?.adults && Array.isArray(peopleDetails.adults))
      all.push(...peopleDetails.adults);
    if (peopleDetails?.children && Array.isArray(peopleDetails.children))
      all.push(...peopleDetails.children);
    if (peopleDetails?.infants && Array.isArray(peopleDetails.infants))
      all.push(...peopleDetails.infants);
    return all;
  }, [peopleDetails]);

  const totalPassengers = useMemo(() => {
    return (
      (peopleCount?.adults || 0) +
        (peopleCount?.children || 0) +
        (peopleCount?.infants || 0) || 1
    );
  }, [peopleCount]);

  const normalizedExternalPeopleDetails = useMemo(() => {
    const normalizeGroup = (items, count, defaults) => {
      const safeCount = Math.max(0, Number(count) || 0);
      const currentItems = Array.isArray(items)
        ? items.slice(0, safeCount)
        : [];

      return Array.from({ length: safeCount }, (_, index) => ({
        id: currentItems[index]?.id ?? index + 1,
        ...defaults,
        ...(currentItems[index] || {}),
      }));
    };

    const adults = normalizeGroup(peopleDetails?.adults, peopleCount?.adults, {
      age: "18",
      nacionalidad: "",
    });

    const children = normalizeGroup(
      peopleDetails?.children,
      peopleCount?.children,
      { age: "6", nacionalidad: "" },
    );

    const infants = normalizeGroup(
      peopleDetails?.infants,
      peopleCount?.infants,
      { age: "0", nacionalidad: "" },
    );

    return {
      ...(peopleDetails || {}),
      adults,
      children,
      infants,
    };
  }, [
    peopleCount?.adults,
    peopleCount?.children,
    peopleCount?.infants,
    peopleDetails,
  ]);

  const handlePackageTypeChange = useCallback(
    (newPackageType) => {
      if (newPackageType !== packageType && days.length > 0) {
        const updatedDays =
          unifiedServiceManager.updateServicesForPackageTypeChange(
            days,
            newPackageType,
            totalPassengers,
          );
        setDays(updatedDays);
        showSnackbar(
          `Tipo de paquete cambiado a ${newPackageType}. Precios actualizados.`,
          "info",
        );
      }
      setPackageType(newPackageType);
    },
    [packageType, days, totalPassengers],
  ); // eslint-disable-line

  useEffect(() => {
    setStepsCompleted((prev) => ({
      ...prev,
      [STEPS.PASAJEROS]: peopleCount.adults > 0,
    }));
  }, [peopleCount]);

  useEffect(() => {
    setStepsCompleted((prev) => ({
      ...prev,
      [STEPS.ITINERARIO]: days.some(
        (d) => Array.isArray(d.servicios) && d.servicios.length > 0,
      ),
    }));
  }, [days]);

  useEffect(() => {
    setStepsCompleted((prev) => ({ ...prev, [STEPS.COSTOS]: true }));
  }, [additionalCosts]);

  /* ===================== CARGA INICIAL / NORMALIZACIÓN ===================== */
  useEffect(() => {
    if (editingCotizacion) {
      let parsedAdditionalCosts = {};
      const rawAdditionalCosts =
        editingCotizacion.additionalcosts || editingCotizacion.additionalCosts;
      if (rawAdditionalCosts) {
        try {
          parsedAdditionalCosts =
            typeof rawAdditionalCosts === "string"
              ? JSON.parse(rawAdditionalCosts)
              : rawAdditionalCosts;
        } catch {
          parsedAdditionalCosts = {};
        }
      }

      const normalizedCotizacion = {
        ...editingCotizacion,
        peopleDetails: editingCotizacion.peopleDetails || {},
        peopleCount: editingCotizacion.peopleCount || {
          adults: 1,
          children: 0,
        },
        additionalCosts: parsedAdditionalCosts,
        packageType:
          editingCotizacion.packagetype ||
          editingCotizacion.packageType ||
          "compartido",
        hasIgv: editingCotizacion.hasigv || editingCotizacion.hasIgv || false,
        igvRate: editingCotizacion.igvrate || editingCotizacion.igvRate || 18,
        igvAmount:
          editingCotizacion.igvamount || editingCotizacion.igvAmount || 0,
        cantidadPersonas:
          editingCotizacion.cantidadpersonas ||
          editingCotizacion.cantidadPersonas ||
          1,
      };

      if (!titleInitialized) {
        setTitulo(normalizedCotizacion.titulo || "");
        setVoucherCode(normalizedCotizacion.voucher_code || normalizedCotizacion.voucherCode || "");
        setTitleInitialized(true);
      }

      const itinerario =
        normalizedCotizacion.itinerario || normalizedCotizacion.dias || [];
      const diasHidratados = hydrateItinerarioFromDB(itinerario);
      const diasFormateados = diasHidratados.map((dia) => ({
        ...dia,
        servicios: repriceServicesPreservingOperationalAssignments(
          dia.servicios || [],
          normalizedCotizacion.peopleDetails,
          { preserveExistingSelection: true },
        ),
        ciudades: dia.ciudades || [],
      }));
      setDays(diasFormateados);
      const restoredHotelConfig = deriveSelectedHotelFromDays(
        diasFormateados,
        editingCotizacion?.hotel_detalle ||
          editingCotizacion?.hotelDetalle ||
          null,
        editingCotizacion?.selectedHotel ||
          editingCotizacion?.selected_hotel ||
          null,
      );
      setSelectedHotelConfig(
        sanitizeHotelConfigForPeople(
          restoredHotelConfig,
          normalizedCotizacion.peopleCount.adults || 1,
          normalizedCotizacion.peopleCount.children || 0,
        ),
      );

      // Inicializar itinerario externo si existe
      const itinerarioExt =
        normalizedCotizacion.itinerario_externo ||
        normalizedCotizacion.itinerarioExterno ||
        [];
      if (Array.isArray(itinerarioExt) && itinerarioExt.length > 0) {
        const diasExtHidratados = hydrateItinerarioFromDB(itinerarioExt);
        // Determine which external days are linked to main days
        const mainDayNumbers = new Set(diasFormateados.map((d) => d.numero));
        setExternalDays(
          diasExtHidratados.map((dia) => ({
            ...dia,
            servicios: repriceServicesPreservingOperationalAssignments(
              dia.servicios || [],
              normalizedCotizacion.peopleDetails,
              { preserveExistingSelection: true },
            ),
            ciudades: dia.ciudades || [],
            isLinked: mainDayNumbers.has(dia.numero),
          })),
        );
      } else {
        setExternalDays([]);
      }

      setFormData({
        cantidadPersonas: normalizedCotizacion.cantidadPersonas || 1,
        fechainicio: normalizedCotizacion.fechainicio || "",
        fechafin: normalizedCotizacion.fechafin || "",
        adminFechaCreacion: getCotizacionCreationDateValue(normalizedCotizacion),
        adminCreatedBy: normalizedCotizacion.createdby || currentUserIdentifier || "",
      });

      setPeopleCount({
        adults: normalizedCotizacion.peopleCount.adults || 1,
        children: normalizedCotizacion.peopleCount.children || 0,
      });

      setPeopleDetails(normalizedCotizacion.peopleDetails);

      setAdditionalCosts(
        buildEditorAdditionalCostsState(normalizedCotizacion.additionalCosts, {
          hasIgv: normalizedCotizacion.hasIgv,
          igvRate: normalizedCotizacion.igvRate,
          igvAmount: normalizedCotizacion.igvAmount,
        }),
      );

      setPackageType(normalizedCotizacion.packageType || "compartido");

      // Mark that we just initialized — skip the next passenger sync effect.
      // Use requestAnimationFrame as safety net: if the recalc effect doesn't
      // fire (e.g. editingCotizacion provides same peopleCount as initial state),
      // the flag still gets cleared before the next user interaction.
      justInitializedRef.current = true;
      requestAnimationFrame(() => {
        justInitializedRef.current = false;
      });
    } else if (selectedPackage) {
      if (!titleInitialized) {
        setTitulo(selectedPackage.nombre || "");
        setVoucherCode("");
        setTitleInitialized(true);
      }

      let diasPaquete = [];
      if (selectedPackage.itinerario && selectedPackage.itinerario.length > 0) {
        diasPaquete = selectedPackage.itinerario;
      } else if (selectedPackage.dias && selectedPackage.dias.length > 0) {
        diasPaquete = selectedPackage.dias;
      } else {
        diasPaquete = [{ numero: 1, servicios: [] }];
      }

      const diasFormateados = diasPaquete.map((dia) => {
        const servicios = (dia.servicios || [])
          .filter((s) => !isHotelService(s))
          .map((s) => ({
            ...s,
            assignedPassengerIds: [],
            assignedPassengerCount: 0,
            // Clear stale backend beneficiario fields — assignedPassengerIds
            // is the authoritative runtime source and these would cause
            // duplicate counts in getServiceBeneficiarySnapshot.
            beneficiariosAdultos: undefined,
            beneficiariosNinos: undefined,
            passengerSelection: {
              ...(s.passengerSelection || {}),
              selectedIds: [],
              assignedPassengerCount: 0,
            },
          }));

        // Initialize services with current passenger data so sr__pax
        // and prices are correct even before the recalc effect fires
        const updated = repriceServicesPreservingOperationalAssignments(
          servicios,
          normalizedExternalPeopleDetails,
          { preserveExistingSelection: false },
        );

        return {
          ...dia,
          numero: dia.numero || dia.dia,
          ciudades: dia.ciudades || [],
          servicios: updated,
        };
      });

      setDays(diasFormateados);
      setSelectedHotelConfig(null);
      setExternalDays([]);
      setAdditionalCosts((prev) =>
        buildImportedPackageFeeState(prev, selectedPackage.fee),
      );
      if (!importedPackageInfo && selectedPackage) {
        setImportedPackageInfo({
          id: selectedPackage.id || selectedPackage._id || null,
          nombre: selectedPackage.nombre || null,
          fee: normalizeNullablePackageFee(selectedPackage.fee),
          modificado: false,
        });
        importedDaysSnapshotRef.current = JSON.stringify(diasFormateados);
      }
    } else {
      if (!titleInitialized) {
        setTitulo("");
        setVoucherCode("");
        setTitleInitialized(true);
      }
      setDays([{ numero: 1, servicios: [], ciudades: [] }]);
      setSelectedHotelConfig(null);
      setExternalDays([]);
    }
  }, [
    editingCotizacion,
    selectedPackage,
    titleInitialized,
    injectHotelIntoDays,
  ]); // eslint-disable-line

  // Detectar si el itinerario importado fue modificado
  useEffect(() => {
    if (!importedPackageInfo || !importedDaysSnapshotRef.current) return;
    if (importedPackageInfo.modificado) return; // ya marcado
    const currentSnapshot = JSON.stringify(days);
    if (currentSnapshot !== importedDaysSnapshotRef.current) {
      setImportedPackageInfo((prev) =>
        prev ? { ...prev, modificado: true } : prev,
      );
    }
  }, [days, importedPackageInfo]);

  // IGV auto por nacionalidad: para hotel aplica solo si hay adulto peruano.
  useEffect(() => {
    const hasPeruvianPassenger =
      buildPeruvianPassengerIdSet(normalizedExternalPeopleDetails).size > 0;
    if (hasPeruvianPassenger !== additionalCosts.hasIgv) {
      setAdditionalCosts((prev) => ({
        ...prev,
        hasIgv: hasPeruvianPassenger,
        igvRate: 18,
      }));
    }
  }, [normalizedExternalPeopleDetails, additionalCosts.hasIgv]);

  // Sync formData.cantidadPersonas con peopleCount
  useEffect(() => {
    const total = (peopleCount.adults || 0) + (peopleCount.children || 0);
    setFormData((prev) => {
      if (prev.cantidadPersonas !== total) {
        return { ...prev, cantidadPersonas: total };
      }
      return prev;
    });
  }, [peopleCount]);

  // Helper centralizado: recalcular precios de servicios non-hotel
  const recalcItineraryPrices = useCallback(
    (itinerary) =>
      itinerary.map((day) => {
        const servicios = Array.isArray(day.servicios) ? day.servicios : [];
        if (servicios.length === 0) return day;

        // Process ALL services (including hotels) to ensure passenger cleanup
        const updated = repriceServicesPreservingOperationalAssignments(
          servicios,
          normalizedExternalPeopleDetails,
          { preserveExistingSelection: false },
        );

        return { ...day, servicios: updated };
      }),
    [normalizedExternalPeopleDetails],
  );

  // Re-normalize external itinerary pricing metadata when passenger details
  // change without altering the selected beneficiaries. Passenger count changes
  // are handled by the same synchronization effect used by DaysEditor below.
  useEffect(() => {
    if (externalDays.length === 0) return;
    setExternalDays((prev) =>
      prev.map((dia) => {
        const servicios = Array.isArray(dia.servicios) ? dia.servicios : [];
        if (servicios.length === 0) return dia;
        const updated = repriceServicesPreservingOperationalAssignments(
          servicios,
          normalizedExternalPeopleDetails,
          { preserveExistingSelection: true },
        );
        return { ...dia, servicios: updated };
      }),
    );
  }, [normalizedExternalPeopleDetails]);

  const getAutoHotelMix = useCallback(
    (category, adults, convertedChildren) => {
      const roomOptions =
        roomOptionsByCategoryMemo?.[category]?.roomOptions || [];
      return autoMixWithConvertedChildren(
        roomOptions,
        Math.max(1, Number(adults) || 1),
        Math.max(0, Number(convertedChildren) || 0),
      );
    },
    [roomOptionsByCategoryMemo],
  );

  const syncCurrentHotelPassengers = useCallback(
    (hotelConfig) => {
      if (!hotelConfig) return hotelConfig;
      return sanitizeHotelConfigForPeople(
        hotelConfig,
        peopleCount.adults || 1,
        peopleCount.children || 0,
      );
    },
    [peopleCount.adults, peopleCount.children],
  );

  const ticketNationalitySignature = useMemo(() => {
    const normalizeNationality = (value) =>
      String(value ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const buildGroupSignature = (groupName, passengers = []) =>
      (Array.isArray(passengers) ? passengers : [])
        .map((passenger, index) => {
          const passengerId =
            passenger?.id ??
            passenger?.id_pasajero ??
            passenger?.pasajero_id ??
            passenger?.passenger_key ??
            passenger?.passengerKey ??
            index;
          const nationality = normalizeNationality(
            passenger?.nacionalidad ||
              passenger?.nationality ||
              passenger?.pais ||
              passenger?.country ||
              passenger?.pais_origen ||
              passenger?.countryCode ||
              "",
          );
          return `${groupName}:${index}:${passengerId}:${nationality || "extranjero"}`;
        })
        .join("|");

    return [
      buildGroupSignature("adult", normalizedExternalPeopleDetails?.adults),
      buildGroupSignature("child", normalizedExternalPeopleDetails?.children),
    ].join("||");
  }, [normalizedExternalPeopleDetails]);

  // Actualizar precios cuando cambian pasajeros o su nacionalidad.
  // Tickets depende de Perú/extranjero; por eso no basta comparar solo cantidades.
  const prevPeopleCountRef = useRef({
    adults: peopleCount.adults,
    children: peopleCount.children,
    nationalitySignature: ticketNationalitySignature,
  });
  useEffect(() => {
    // Skip during initial load / draft restore to preserve child pricing
    if (justInitializedRef.current) {
      justInitializedRef.current = false;
      prevPeopleCountRef.current = {
        adults: peopleCount.adults,
        children: peopleCount.children,
        nationalitySignature: ticketNationalitySignature,
      };
      return;
    }
    if (!days?.length || !normalizedExternalPeopleDetails) return;

    const prevCounts = prevPeopleCountRef.current;
    const countsChanged =
      prevCounts.adults !== peopleCount.adults ||
      prevCounts.children !== peopleCount.children;
    const nationalityChanged =
      prevCounts.nationalitySignature !== ticketNationalitySignature;

    prevPeopleCountRef.current = {
      adults: peopleCount.adults,
      children: peopleCount.children,
      nationalitySignature: ticketNationalitySignature,
    };
    if (!countsChanged && !nationalityChanged) return;

    // Keep the external itinerary in lockstep with DaysEditor. When the roster
    // grows or shrinks, services that already followed the active passenger
    // selection must receive/remove the same beneficiaries and recalculate
    // their totals. For nationality-only changes, preserve the exact selection.
    setExternalDays((prevDays) => {
      if (!Array.isArray(prevDays) || prevDays.length === 0) return prevDays;

      return prevDays.map((day) => {
        const servicios = Array.isArray(day?.servicios) ? day.servicios : [];
        if (servicios.length === 0) return day;

        return {
          ...day,
          servicios: repriceServicesPreservingOperationalAssignments(
            servicios,
            normalizedExternalPeopleDetails,
            { preserveExistingSelection: !countsChanged },
          ),
        };
      });
    });

    setSelectedHotelConfig((prev) => {
      if (!prev) return prev;
      return resetHotelRoomsForPassengerChange(
        prev,
        peopleCount.adults || 1,
        peopleCount.children || 0,
      );
    });

    const totalAdults = parseInt(peopleCount.adults) || 1;
    const currentHotel = syncCurrentHotelPassengers(
      deriveSelectedHotelFromDays(
        days,
        editingCotizacion?.hotel_detalle ||
          editingCotizacion?.hotelDetalle ||
          null,
        selectedHotelConfig,
      ),
    );

    if (currentHotel && currentHotel.category) {
      const cat = currentHotel.category;
      const opts = roomOptionsByCategoryMemo?.[cat]?.roomOptions || [];

      if (opts && opts.length > 0) {
        const convertedCount = getHotelConvertedChildCount(
          currentHotel.childPricing,
        );

        let updatedHotelRow = clearHotelRoomCalculationCache(
          sanitizeHotelConfigForPeople(
            {
              ...currentHotel,
              allCategoryRows: null,
              categoryRows: null,
              mix: getAutoHotelMix(cat, totalAdults, convertedCount),
              roomOptions: opts,
              roomMixNeedsAutoRefresh: false,
            },
            totalAdults,
            peopleCount.children || 0,
          ),
          { resetRows: true, markForAutoRefresh: false },
        );

        if (
          Array.isArray(currentHotel.dayGroups) &&
          currentHotel.dayGroups.length > 0
        ) {
          updatedHotelRow = {
            ...updatedHotelRow,
            dayGroups: currentHotel.dayGroups.map((g) => ({
              ...g,
              roomMix: getAutoHotelMix(
                g.category || cat,
                totalAdults,
                convertedCount,
              ),
              roomOptions:
                roomOptionsByCategoryMemo?.[g.category || cat]?.roomOptions ||
                opts,
            })),
          };
        }

        const normalizedHotel = normalizeSelectedHotelConfig(
          updatedHotelRow,
          updatedHotelRow.hotelDetalle || updatedHotelRow.hotel_detalle,
        );
        setSelectedHotelConfig(normalizedHotel);
        if (updatedHotelRow.category) {
          setExcelPreviewCategories((prev) => {
            if (
              prev.length === 0 ||
              (prev.length === 1 &&
                !prev.includes(String(updatedHotelRow.category)))
            ) {
              return [String(updatedHotelRow.category)];
            }
            return prev;
          });
        }

        setDays((prevDays) => {
          let updatedDays = recalcItineraryPrices(prevDays);
          updatedDays = injectHotelIntoDaysPure(updatedDays, updatedHotelRow);
          return updatedDays;
        });

        return;
      }
    }

    setDays((prevDays) => {
      return recalcItineraryPrices(prevDays);
    });
  }, [
    peopleCount.adults,
    peopleCount.children,
    normalizedExternalPeopleDetails,
    recalcItineraryPrices,
    ticketNationalitySignature,
  ]); // eslint-disable-line

  // Auto-distribuir habitaciones de hotel cuando el usuario sale del paso de Pasajeros.
  // IMPORTANT: This must NOT override a manually saved room mix. It should only
  // auto-redistribute when roomMixNeedsAutoRefresh is true (set by passenger changes).
  useEffect(() => {
    if (currentStep === STEPS.PASAJEROS || !days?.length) return;

    const currentHotel = syncCurrentHotelPassengers(
      deriveSelectedHotelFromDays(
        days,
        editingCotizacion?.hotel_detalle ||
          editingCotizacion?.hotelDetalle ||
          null,
        selectedHotelConfig,
      ),
    );

    if (!currentHotel || !currentHotel.category) return;

    // Only auto-redistribute when explicitly flagged (passenger count changed).
    // Never override a user's manually saved room distribution.
    if (!currentHotel.roomMixNeedsAutoRefresh) return;

    const targetCat = currentHotel.category;
    const opts = roomOptionsByCategoryMemo?.[targetCat]?.roomOptions || [];
    if (!opts || opts.length === 0) return;

    const totalAdults = parseInt(peopleCount.adults) || 1;
    const convertedCount = getHotelConvertedChildCount(
      currentHotel.childPricing,
    );
    const requiredMix = getAutoHotelMix(
      currentHotel.category,
      totalAdults,
      convertedCount,
    );

    let updatedHotelRow = clearHotelRoomCalculationCache(
      sanitizeHotelConfigForPeople(
        {
          ...currentHotel,
          allCategoryRows: null,
          categoryRows: null,
          mix: requiredMix,
          roomOptions:
            roomOptionsByCategoryMemo?.[currentHotel.category]?.roomOptions ||
            [],
          roomMixNeedsAutoRefresh: false,
        },
        totalAdults,
        peopleCount.children || 0,
      ),
      { resetRows: true, markForAutoRefresh: false },
    );

    if (
      Array.isArray(currentHotel.dayGroups) &&
      currentHotel.dayGroups.length > 0
    ) {
      updatedHotelRow = {
        ...updatedHotelRow,
        dayGroups: currentHotel.dayGroups.map((g) => ({
          ...g,
          roomMix: getAutoHotelMix(
            g.category || currentHotel.category,
            totalAdults,
            convertedCount,
          ),
          roomOptions:
            roomOptionsByCategoryMemo?.[g.category || currentHotel.category]
              ?.roomOptions || [],
        })),
      };
    }

    const normalizedHotel = normalizeSelectedHotelConfig(
      updatedHotelRow,
      updatedHotelRow.hotelDetalle || updatedHotelRow.hotel_detalle,
    );
    setSelectedHotelConfig(normalizedHotel);

    setDays((prevDays) => injectHotelIntoDaysPure(prevDays, updatedHotelRow));
  }, [
    currentStep,
    days,
    getAutoHotelMix,
    peopleCount.adults,
    peopleCount.children,
    roomOptionsByCategoryMemo,
    syncCurrentHotelPassengers,
  ]);

  // TITLE SYNC: Update title when passengers change if it follows the generated pattern
  useEffect(() => {
    if (justInitializedRef.current || !titulo) return;

    const pattern = /(.*) — \d+ adulto\(s\)(?: \d+ niño\(s\))?/;
    const match = titulo.match(pattern);
    if (match) {
      const baseName = match[1];
      const childrenText =
        peopleCount.children > 0 ? ` ${peopleCount.children} niño(s)` : "";
      const newTitle = `${baseName} — ${peopleCount.adults} adulto(s)${childrenText}`;
      if (newTitle !== titulo) {
        setTitulo(newTitle);
      }
    }
  }, [peopleCount, titulo]);

  /* ===================== IMPORT/EXPORT (sin cambios) ===================== */
  const handleDeletePaquete = useCallback(() => {
    const confirmed = window.confirm(
      "¿Eliminar el paquete actual? Esta acción no se puede deshacer.",
    );
    if (confirmed) setDays([]);
  }, []);

  const handleImportPackage = useCallback(
    async (selectedPkg) => {
      if (!selectedPkg || !selectedPkg.itinerario) {
        showSnackbar("El paquete seleccionado no tiene itinerario", "error");
        return;
      }

      try {
        const hydratedItinerary = hydrateItinerarioFromDB(
          selectedPkg.itinerario,
        );
        const totalPax =
          (peopleCount.adults || 0) + (peopleCount.children || 0);

        const adjustedItinerary = hydratedItinerary.map((day) => {
          const servicios = (day.servicios || []).filter(
            (s) => !isHotelService(s),
          );

          const normalizedServicios = servicios.map((s) => ({
            ...s,
            assignedPassengerIds: [],
            assignedPassengerCount: 0,
            beneficiariosAdultos: undefined,
            beneficiariosNinos: undefined,
            passengerSelection: {
              ...(s.passengerSelection || {}),
              selectedIds: [],
              assignedPassengerCount: 0,
            },
            tariff: { ...(s.tariff || {}) },
          }));

          return { ...day, servicios: normalizedServicios };
        });

        // Al importar se ajustan automáticamente las movilidades cuya
        // capacidad sea inferior a la cantidad de pasajeros. El reajuste
        // posterior al cambiar pasajeros en PeopleSelection sigue desactivado.
        const resolvedItinerary = await resolveTransportConflictsOnImport(
          adjustedItinerary,
          totalPax,
          packageType,
          normalizedExternalPeopleDetails,
        );
        const finalItinerary = recalcItineraryPrices(resolvedItinerary);

        setDays(finalItinerary);
        setAdditionalCosts((prev) =>
          buildImportedPackageFeeState(prev, selectedPkg.fee),
        );
        setImportedPackageInfo({
          id: selectedPkg.id || selectedPkg._id || null,
          nombre: selectedPkg.nombre || null,
          fee: normalizeNullablePackageFee(selectedPkg.fee),
          modificado: false,
        });
        importedDaysSnapshotRef.current = JSON.stringify(finalItinerary);
        setShowImportModal(false);

        const displayPax = Math.max(1, Number(totalPax) || 1);
        showSnackbar(
          `Paquete "${selectedPkg.nombre}" importado y ajustado a ${displayPax} pasajero(s)`,
          "success",
        );
      } catch (error) {
        console.error("Error al importar paquete:", error);
        showSnackbar("Error al importar el paquete: " + error.message, "error");
      }
    },
    [
      peopleCount.adults,
      peopleCount.children,
      normalizedExternalPeopleDetails,
      packageType,
    ],
  ); // eslint-disable-line

  /* [AUTO-TRANSPORT-DISABLED]
  const handleFinalizeImport = useCallback(() => {
    if (!transportConflicts?.itinerary) return;

    const finalItinerary = recalcItineraryPrices(transportConflicts.itinerary);

    setDays(finalItinerary);
    importedDaysSnapshotRef.current = JSON.stringify(finalItinerary);
    // Only update importedPackageInfo when coming from an actual package import
    // (non-import contexts like badge clicks or step navigation don't have packageId)
    if (transportConflicts.packageId) {
      setImportedPackageInfo({
        id: transportConflicts.packageId,
        nombre: transportConflicts.packageName || null,
        modificado: false,
      });
    }
    // Mark transport check as done for current pax count
    transportCheckPaxRef.current = `${peopleCount.adults || 1}:${peopleCount.children || 0}`;
    if (transportConflicts.packageName) {
      const totalPax =
        (Number(peopleCount.adults) || 0) +
          (Number(peopleCount.children) || 0) || 1;
      showSnackbar(
        `Paquete "${transportConflicts.packageName}" importado y ajustado a ${totalPax} pasajero(s)`,
        "success",
      );
    }
    const onFinalize = transportConflicts.onFinalize;
    setTransportConflicts(null);
    setReplacingConflictIndex(null);
    if (onFinalize) onFinalize();
  }, [transportConflicts, recalcItineraryPrices, peopleCount.adults]);

  const handleReplaceConflictTransport = useCallback(
    (newService) => {
      if (replacingConflictIndex === null || !transportConflicts) return;

      const conflict = transportConflicts.conflicts[replacingConflictIndex];
      if (!conflict) return;

      const updatedItinerary = transportConflicts.itinerary.map(
        (day, dayIdx) => {
          if (dayIdx !== conflict.dayIndex) return day;
          const newServicios = [...(day.servicios || [])];
          const previousService = newServicios[conflict.serviceIndex];
          newServicios[conflict.serviceIndex] = {
            ...preserveServicePassengerState(newService, previousService),
            id: `service-${dayIdx}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            typeService:
              newService.typeService ||
              newService.parentService?.typeService ||
              "transportes",
          };
          return { ...day, servicios: newServicios };
        },
      );

      const updatedConflicts = transportConflicts.conflicts.map((c, idx) =>
        idx === replacingConflictIndex
          ? {
              ...c,
              resolved: true,
              newCapacity: newService.childService?.nro_pasajeros,
              newVehicleName: newService.childService?.tipo_auto || "",
              newRuta: newService.childService?.ruta || "",
            }
          : c,
      );

      setTransportConflicts({
        ...transportConflicts,
        itinerary: updatedItinerary,
        conflicts: updatedConflicts,
      });
      setReplacingConflictIndex(null);
    },
    [replacingConflictIndex, transportConflicts],
  );

  // Abrir modal de conflictos desde el header de DaysEditor
  const handleOpenConflictFromHeader = useCallback(() => {
    const totalPax = (peopleCount.adults || 0) + (peopleCount.children || 0);
    const conflicts = [];
    days.forEach((day, dayIdx) => {
      (day.servicios || []).forEach((s, svcIdx) => {
        const ts = (
          s?.parentService?.typeService ||
          s?.typeService ||
          ""
        ).toLowerCase();
        if (ts !== "transportes") return;
        const capacity = parseInt(s?.childService?.nro_pasajeros) || 0;
        if (capacity > 0 && capacity < totalPax) {
          conflicts.push({
            dayIndex: dayIdx,
            serviceIndex: svcIdx,
            dayTitle: day.titulo || `Día ${day.numero || dayIdx + 1}`,
            dayNumber: day.numero || dayIdx + 1,
            transportName: s.parentService?.nombre_transporte || "Transporte",
            movilidadName: s.childService?.tipo_auto || "",
            ruta: s.childService?.ruta || "",
            capacity,
            required: totalPax,
          });
        }
      });
    });

    if (conflicts.length === 0) return;

    setTransportConflicts({
      itinerary: days.map((d) => ({
        ...d,
        servicios: [...(d.servicios || [])],
      })),
      packageName: "",
      conflicts,
    });
  }, [days, peopleCount.adults, peopleCount.children]);
  */

  /* [AUTO-TRANSPORT-DISABLED]
  // Fetch optimization suggestion preview for a conflict (no state change)
  const fetchConflictSuggestion = useCallback(
    async (conflict) => {
      if (!transportConflicts) return null;
      const itinerary = transportConflicts.itinerary;
      const service =
        itinerary[conflict.dayIndex]?.servicios?.[conflict.serviceIndex];
      if (!service) return null;

      const parentService = service.parentService || {};
      const idTransporte =
        parentService.id_transporte || parentService.transporte?.id_transporte;
      if (!idTransporte) return null;

      const requiredPax = totalPassengers || 1;
      const mode = conflict.capacity < requiredPax ? "upsize" : "downsize";

      try {
        const result = await findBetterFitVehicle(
          axios,
          service,
          idTransporte,
          requiredPax,
          mode,
        );
        if (!result) return null;
        const mov = result.movilidad || result;
        return {
          tipo_auto: mov.tipo_auto || "",
          ruta: mov.ruta || "",
          nro_pasajeros: parseInt(mov.nro_pasajeros) || 0,
        };
      } catch {
        return null;
      }
    },
    [transportConflicts, totalPassengers, axios],
  );

  // Auto-replace oversized transport with best-fit from same provider
  const handleAutoReplaceDownsized = useCallback(
    async (idx) => {
      if (!transportConflicts) return;
      const conflict = transportConflicts.conflicts[idx];
      if (!conflict) return;

      const itinerary = transportConflicts.itinerary;
      const service =
        itinerary[conflict.dayIndex]?.servicios?.[conflict.serviceIndex];
      if (!service) return;

      const parentService = service.parentService || {};
      const idTransporte =
        parentService.id_transporte || parentService.transporte?.id_transporte;
      if (!idTransporte) {
        showSnackbar(
          "No se pudo identificar el proveedor de transporte",
          "error",
        );
        return;
      }

      const requiredPax = totalPassengers || 1;
      const mode = conflict.capacity < requiredPax ? "upsize" : "downsize";

      try {
        const suitable = await findBetterFitVehicle(
          axios,
          service,
          idTransporte,
          requiredPax,
          mode,
        );
        if (!suitable) {
          showSnackbar("No se encontró un vehículo más ajustado", "warning");
          return;
        }

        const pkgType = service.childService?.packageType || "compartido";
        const newService = buildReplacementService(
          parentService,
          suitable,
          service,
          pkgType,
          normalizedExternalPeopleDetails,
        );
        if (!newService) {
          showSnackbar("El vehículo alternativo no tiene tarifas", "warning");
          return;
        }

        const replacementService = preserveServicePassengerState(
          newService,
          service,
        );

        const movilidad = suitable.movilidad || suitable;
        const newCap = parseInt(movilidad.nro_pasajeros) || 0;

        const updatedItinerary = itinerary.map((day, dayIdx) => {
          if (dayIdx !== conflict.dayIndex) return day;
          const newServicios = [...(day.servicios || [])];
          newServicios[conflict.serviceIndex] = {
            ...replacementService,
            id: `service-${dayIdx}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          };
          return { ...day, servicios: newServicios };
        });

        const updatedConflicts = transportConflicts.conflicts.map((c, i) =>
          i === idx
            ? {
                ...c,
                resolved: true,
                newCapacity: newCap,
                newVehicleName: movilidad.tipo_auto || "",
                newRuta: movilidad.ruta || "",
              }
            : c,
        );

        setTransportConflicts({
          ...transportConflicts,
          itinerary: updatedItinerary,
          conflicts: updatedConflicts,
        });

        showSnackbar(
          `Optimizado: ${movilidad.tipo_auto || "vehículo"} (${newCap} pax)`,
          "success",
        );
      } catch (e) {
        console.warn("Error auto-reemplazando transporte:", e);
        showSnackbar("Error al buscar vehículo alternativo", "error");
      }
    },
    [transportConflicts, totalPassengers, normalizedExternalPeopleDetails],
  );

  // Optimizar todos los conflictos pendientes de una sola vez
  const handleOptimizeAllConflicts = useCallback(async () => {
    if (!transportConflicts) return;

    const requiredPax = totalPassengers || 1;
    let itinerary = transportConflicts.itinerary.map((d) => ({
      ...d,
      servicios: [...(d.servicios || [])],
    }));
    let updatedConflicts = [...transportConflicts.conflicts];
    let optimizedCount = 0;

    for (let idx = 0; idx < updatedConflicts.length; idx++) {
      const conflict = updatedConflicts[idx];
      if (conflict.resolved) continue;

      const service =
        itinerary[conflict.dayIndex]?.servicios?.[conflict.serviceIndex];
      if (!service) continue;

      const parentService = service.parentService || {};
      const idTransporte =
        parentService.id_transporte || parentService.transporte?.id_transporte;
      if (!idTransporte) continue;

      const mode = conflict.capacity < requiredPax ? "upsize" : "downsize";

      try {
        const suitable = await findBetterFitVehicle(
          axios,
          service,
          idTransporte,
          requiredPax,
          mode,
        );
        if (!suitable) continue;

        const pkgType = service.childService?.packageType || "compartido";
        const newService = buildReplacementService(
          parentService,
          suitable,
          service,
          pkgType,
          normalizedExternalPeopleDetails,
        );
        if (!newService) continue;

        const replacementService = preserveServicePassengerState(
          newService,
          service,
        );

        const movilidad = suitable.movilidad || suitable;
        const newCap = parseInt(movilidad.nro_pasajeros) || 0;

        itinerary = itinerary.map((day, dayIdx) => {
          if (dayIdx !== conflict.dayIndex) return day;
          const newServicios = [...day.servicios];
          newServicios[conflict.serviceIndex] = {
            ...replacementService,
            id: `service-${dayIdx}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          };
          return { ...day, servicios: newServicios };
        });

        updatedConflicts[idx] = {
          ...conflict,
          resolved: true,
          newCapacity: newCap,
          newVehicleName: movilidad.tipo_auto || "",
          newRuta: movilidad.ruta || "",
        };
        optimizedCount++;
      } catch (e) {
        console.warn(`Error optimizando conflicto ${idx}:`, e);
      }
    }

    setTransportConflicts({
      ...transportConflicts,
      itinerary,
      conflicts: updatedConflicts,
    });

    if (optimizedCount > 0) {
      showSnackbar(`${optimizedCount} transporte(s) optimizado(s)`, "success");
    } else {
      showSnackbar("No se encontraron alternativas automáticas", "warning");
    }
  }, [transportConflicts, totalPassengers, normalizedExternalPeopleDetails]);
  */

  // ===== Verificación de capacidad de transportes al navegar a ITINERARIO =====
  // [AUTO-TRANSPORT-DISABLED] La lógica de auto-reemplazo de transportes se
  // desactiva temporalmente. Al navegar al itinerario se avanza directamente.
  const handleNavigateToItinerary = useCallback(async () => {
    setCurrentStep(STEPS.ITINERARIO);
  }, []);

  const handleExportPackage = useCallback(
    async (packageData) => {
      if (!days || days.length === 0) {
        showSnackbar("No hay itinerario para exportar", "error");
        return;
      }

      try {
        const cleanedItinerary = cleanItinerarioForDB(days);

        const noHotelItinerary = cleanedItinerary.map((day) => ({
          ...day,
          servicios: (day.servicios || [])
            .filter((s) => {
              const ts = (
                s?.parentService?.typeService ||
                s?.typeService ||
                ""
              ).toLowerCase();
              return ts !== "hoteles";
            })
            .map((s) => {
              const ts = (
                s?.parentService?.typeService ||
                s?.typeService ||
                ""
              ).toLowerCase();
              const tariff = s.tariff || {};
              const currentPrecio = parseFloat(tariff.precio) || 0;
              const currentPrecioOriginal =
                parseFloat(tariff.precio_original) || currentPrecio;

              const isEndose = ts === "endoses";
              const isPerGroup =
                ts === "transportes" ||
                ts === "guias" ||
                (isEndose && getTourCapacity(s) != null);
              const isExtra = ts === "extras";

              let normalizedPrecio, normalizedPrecioOriginal;
              if (isPerGroup) {
                normalizedPrecio = currentPrecioOriginal;
                normalizedPrecioOriginal = currentPrecioOriginal;
              } else if (isExtra) {
                normalizedPrecio = currentPrecio;
                normalizedPrecioOriginal = currentPrecioOriginal;
              } else {
                normalizedPrecio = currentPrecio;
                normalizedPrecioOriginal = currentPrecio;
              }

              return {
                ...s,
                passengerSelection: {
                  ...(s.passengerSelection || {}),
                  selectedIds: [],
                  assignedPassengerCount: 0,
                },
                tariff: {
                  ...tariff,
                  precio: normalizedPrecio,
                  precio_original: normalizedPrecioOriginal,
                  childExtrasTotal: 0,
                  precio_original_with_child_extras: normalizedPrecioOriginal,
                },
              };
            }),
        }));

        const rawPackageFee = packageData.fee;
        const packageFee = normalizeNullablePackageFee(rawPackageFee);
        if (String(rawPackageFee ?? "").trim() !== "" && packageFee === null) {
          throw new Error("El fee debe ser un porcentaje entre 0 y 100");
        }

        const newPackageData = {
          nombre: packageData.nombre,
          descripcion: packageData.descripcion || "",
          packagetype: packageData.packagetype || packageType,
          fee: packageFee,
          itinerario: noHotelItinerary,
          es_general: false,
          destacado: false,
        };

        const response = await axios.post(
          "/turismo/paquetes-turisticos",
          newPackageData,
        );

        if (response.data && response.data.success) {
          await queryClient.invalidateQueries({
            queryKey: queryKeys.paquetes.all,
          });
          setShowImportModal(false);
          showSnackbar(
            `Itinerario exportado como paquete "${packageData.nombre}" correctamente`,
            "success",
          );
        } else {
          throw new Error(
            response.data?.message || "Error al crear el paquete",
          );
        }
      } catch (error) {
        console.error("Error al exportar paquete:", error);
        showSnackbar(
          "Error al exportar el paquete: " +
            (error.response?.data?.message || error.message),
          "error",
        );
      }
    },
    [days, packageType],
  ); // eslint-disable-line

  /* ===================== FECHAS AUTO (fin auto) ===================== */
  const addDays = (dateStr, daysToAdd) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    const d = new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2]),
    );
    d.setDate(d.getDate() + daysToAdd);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  useEffect(() => {
    const start = formData?.fechainicio;
    if (!start) return;

    const currentDaysCount = Math.min(
      Math.max(1, days.length),
      MAX_DAYS_ALLOWED,
    );

    if (!Array.isArray(days) || days.length < currentDaysCount) {
      setDays((prev) => ensureDaysMinLength(prev, currentDaysCount));
    }

    const calculatedEnd = addDays(start, currentDaysCount - 1);
    if (calculatedEnd && formData.fechafin !== calculatedEnd) {
      setFormData((prev) => ({ ...prev, fechafin: calculatedEnd }));
    }
  }, [formData.fechainicio, days.length]); // eslint-disable-line

  /* ===================== TOTALES (sin hoteles auto) ===================== */
  const calculatedTotals = useMemo(() => {
    const g = calculateGeneralTotal(
      visibleDays || [],
      normalizedExternalPeopleDetails || peopleDetails,
    );

    return {
      subtotalIndividual: g.subtotalIndividual,
      servicesTotal: g.servicesTotal,
      additionalTotal: 0,
      totalAmount: 0,
      grandTotal: 0,
      nonHotelsTotal: g.nonHotelsTotal,
      hotelsTotal: g.hotelsTotal,
      hotelFullTotal: g.hotelFullTotal || 0,
      hotelChildTotal: g.hotelChildTotal || 0,
      hotelExplicitChildTotal: g.hotelExplicitChildTotal || 0,
      hotelConvertedChildTotal: g.hotelConvertedChildTotal || 0,
      hotelAdultTotal: g.hotelAdultTotal || 0,
      totalIGV: g.totalIGV,
      hasIGV: g.totalIGV > 0,
      igvRate: g.totalIGV > 0 ? 18 : 0,
      subtotalninos: g.subtotalNinos,
      nonHotelExplicitChildTotal: g.nonHotelExplicitChildTotal || 0,
      nonHotelConvertedChildTotal: g.nonHotelConvertedChildTotal || 0,
      nonHotelExplicitChildTotalsById: g.nonHotelExplicitChildTotalsById || {},
      nonHotelConvertedChildTotalsById:
        g.nonHotelConvertedChildTotalsById || {},
      hotelExplicitChildTotalsById: g.hotelExplicitChildTotalsById || {},
      hotelConvertedChildTotalsById: g.hotelConvertedChildTotalsById || {},
      baseExplicitChildCount: g.baseExplicitChildCount || 0,
      baseConvertedChildCount: g.baseConvertedChildCount || 0,
      hotelExplicitChildCount: g.hotelExplicitChildCount || 0,
      hotelConvertedChildCount: g.hotelConvertedChildCount || 0,
      baseAdultCount: g.baseAdultCount || 0,
      hotelAdultCount: g.hotelAdultCount || 0,
    };
  }, [days, visibleDays, normalizedExternalPeopleDetails, peopleDetails]);

  // Hotel totals derived from auto-hotel services in itinerary (single source of truth)
  const hotelsTotal = useMemo(() => {
    return Number(calculatedTotals.hotelsTotal || 0);
  }, [calculatedTotals.hotelsTotal]);

  const externalItineraryBreakdown = useMemo(() => {
    return calculateExternalItineraryBreakdown(
      externalDays,
      normalizedExternalPeopleDetails,
    );
  }, [externalDays, normalizedExternalPeopleDetails]);

  // External itinerary total with its own additional costs
  const externalItineraryTotal = useMemo(() => {
    return externalItineraryBreakdown.grandTotal;
  }, [externalItineraryBreakdown]);
  const externalItineraryChildAverage = useMemo(() => {
    const explicit = Number(externalItineraryBreakdown.childTotal || 0);
    const converted = Number(
      externalItineraryBreakdown.convertedChildTotal || 0,
    );
    return Math.round((explicit + converted + Number.EPSILON) * 100) / 100;
  }, [
    externalItineraryBreakdown.childTotal,
    externalItineraryBreakdown.convertedChildTotal,
  ]);

  // Hotel config lives at cotización level and falls back to hotel services for legacy quotes.
  const defaultNights = useMemo(
    () => Math.max(1, (Array.isArray(days) ? days.length : 1) - 1),
    [days.length],
  );

  const hotelConfig = useMemo(() => {
    return deriveSelectedHotelFromDays(
      days,
      editingCotizacion?.hotel_detalle ||
        editingCotizacion?.hotelDetalle ||
        null,
      selectedHotelConfig,
    );
  }, [
    days,
    editingCotizacion?.hotel_detalle,
    editingCotizacion?.hotelDetalle,
    selectedHotelConfig,
  ]);

  const hotelConfigForCurrentPeople = useMemo(
    () =>
      sanitizeHotelConfigForPeople(
        hotelConfig,
        peopleCount?.adults || 1,
        peopleCount?.children || 0,
      ),
    [hotelConfig, peopleCount?.adults, peopleCount?.children],
  );

  const canonicalHotelConfigForCurrentPeople = useMemo(() => {
    const cfg = hotelConfigForCurrentPeople || hotelConfig;
    if (!cfg || typeof cfg !== "object") return cfg;

    const commonPricingArgs = {
      adultsCount: peopleCount?.adults || 1,
      childrenCount: peopleCount?.children || 0,
      nonHotelsTotal:
        calculatedTotals.nonHotelsTotal ?? calculatedTotals.subtotalIndividual,
      nonHotelExplicitChildTotal:
        calculatedTotals.nonHotelExplicitChildTotal || 0,
      nonHotelConvertedChildTotal:
        calculatedTotals.nonHotelConvertedChildTotal || 0,
      additionalCosts,
      externalAdultTotal: externalItineraryBreakdown.adultTotal,
      peopleDetails: normalizedExternalPeopleDetails,
    };

    const groupedHotelDays = Array.isArray(cfg.dayGroups)
      ? cfg.dayGroups.filter((group) =>
          Boolean(
            group?.category && getHotelGroupNightIndices(group).length > 0,
          ),
        )
      : [];

    if (groupedHotelDays.length > 0) {
      const canonicalGroups = groupedHotelDays.map((group, groupIndex) => {
        const category = normalizeHotelCategoryKey(group.category);
        const roomOptions = resolveHotelGroupRoomOptions(
          { ...group, category },
          roomOptionsByCategoryMemo,
        );
        const dayIndices = getHotelGroupNightIndices(group);
        const nightsCount = Math.max(
          1,
          dayIndices.length || Number(group?.nights) || defaultNights || 1,
        );
        const groupMix =
          group?.roomMix && typeof group.roomMix === "object"
            ? group.roomMix
            : group?.mix && typeof group.mix === "object"
              ? group.mix
              : {};

        if (!Array.isArray(roomOptions) || roomOptions.length === 0) {
          return {
            ...group,
            category,
            dayIndices,
            selectedNightIndices: dayIndices,
            nights: nightsCount,
            roomOptions,
            perRoomPricing: Array.isArray(group?.perRoomPricing)
              ? group.perRoomPricing
              : [],
          };
        }

        const perRoomPricing = prefixGroupedRoomPricing(
          buildCanonicalHotelPerRoomPricing({
            hotelConfig: {
              ...cfg,
              ...group,
              category,
              selectedNightIndices: dayIndices,
              nights: nightsCount,
              mix: groupMix,
              roomOptions,
              roomAssignments: group.roomAssignments || cfg.roomAssignments || {},
              childPricing: group.childPricing || cfg.childPricing || {},
            },
            roomOptions,
            ...commonPricingArgs,
            nights: nightsCount,
          }),
          { ...group, category },
          groupIndex,
        );

        return {
          ...group,
          category,
          dayIndices,
          selectedNightIndices: dayIndices,
          nights: nightsCount,
          mix: groupMix,
          roomMix: groupMix,
          roomOptions,
          perRoomPricing,
          hotelTotal: perRoomPricing.reduce(
            (sum, room) => sum + Number(room.hotelTotalRoom || 0),
            0,
          ),
          perNightSum: perRoomPricing.reduce(
            (sum, room) => sum + Number(room.hotelTotalRoom || 0),
            0,
          ) / Math.max(1, nightsCount),
        };
      });

      const groupedPerRoomPricing = canonicalGroups.flatMap((group) =>
        Array.isArray(group.perRoomPricing) ? group.perRoomPricing : [],
      );

      if (groupedPerRoomPricing.length > 0) {
        const roomAssignments = groupedPerRoomPricing.reduce(
          (accumulator, room) => {
            (room.roomDetails || []).forEach((detail) => {
              if (detail.roomId) {
                accumulator[detail.roomId] = detail.passengerIds || [];
              }
            });
            return accumulator;
          },
          {},
        );
        const selectedNightIndices = [
          ...new Set(canonicalGroups.flatMap((group) => group.dayIndices || [])),
        ].sort((a, b) => a - b);

        return {
          ...cfg,
          category: cfg.category || canonicalGroups[0]?.category || null,
          dayGroups: canonicalGroups,
          selectedNightIndices,
          roomOptions: canonicalGroups[0]?.roomOptions || cfg.roomOptions || [],
          perRoomPricing: groupedPerRoomPricing,
          peruvianPassengerIds: Array.from(
            buildPeruvianPassengerIdSet(normalizedExternalPeopleDetails, {
              includeChildren: true,
            }),
          ),
          roomAssignments,
          roomAssignmentSummary: groupedPerRoomPricing.map((room) => ({
            key: room.key,
            label: room.label,
            groupLabel: room.groupLabel,
            groupCategory: room.groupCategory,
            beneficiaries: room.beneficiaries,
            adultBeneficiaries: room.adultBeneficiaries,
            convertedChildBeneficiaries: room.convertedChildBeneficiaries,
          })),
          hotelTotal: groupedPerRoomPricing.reduce(
            (sum, room) => sum + Number(room.hotelTotalRoom || 0),
            0,
          ),
          hotelAdultTotal: groupedPerRoomPricing.reduce(
            (sum, room) =>
              sum +
              Number(room.hotelPerPerson || 0) *
                Number(room.adultBeneficiaries || 0),
            0,
          ),
          hotelConvertedChildTotal: groupedPerRoomPricing.reduce(
            (sum, room) =>
              sum +
              Number(
                room.convertedChildHotelPerPerson || room.hotelPerPerson || 0,
              ) *
                Number(room.convertedChildBeneficiaries || 0),
            0,
          ),
        };
      }
    }

    if (!cfg.category) return cfg;

    const savedRoomOptions = Array.isArray(cfg.roomOptions)
      ? cfg.roomOptions
      : [];
    const dictionaryRoomOptions =
      roomOptionsByCategoryMemo?.[cfg.category]?.roomOptions || [];
    const mergedRoomOptions = mergePersistedHotelRoomOptionsWithDictionary(
      dictionaryRoomOptions,
      savedRoomOptions,
    );
    const canonicalPriceOverrides =
      sanitizeHotelPriceOverridesAgainstRoomOptions(
        cfg.priceOverrides || cfg.price_overrides || {},
        mergedRoomOptions,
      );
    const roomOptions = applyHotelRoomPriceOverridesToOptions(
      mergedRoomOptions,
      canonicalPriceOverrides,
    );
    if (!Array.isArray(roomOptions) || roomOptions.length === 0) return cfg;

    const nightsCount = Array.isArray(cfg.selectedNightIndices)
      ? cfg.selectedNightIndices.length
      : Number(cfg.nights) || defaultNights || 1;
    const perRoomPricing = buildCanonicalHotelPerRoomPricing({
      hotelConfig: cfg,
      roomOptions,
      ...commonPricingArgs,
      nights: nightsCount,
    });
    if (perRoomPricing.length === 0) return cfg;

    const roomAssignments = perRoomPricing.reduce((accumulator, room) => {
      (room.roomDetails || []).forEach((detail) => {
        if (detail.roomId) {
          accumulator[detail.roomId] = detail.passengerIds || [];
        }
      });
      return accumulator;
    }, {});

    return {
      ...cfg,
      roomOptions,
      perRoomPricing,
      peruvianPassengerIds: Array.from(
        buildPeruvianPassengerIdSet(normalizedExternalPeopleDetails, {
          includeChildren: true,
        }),
      ),
      roomAssignments,
      roomAssignmentSummary: perRoomPricing.map((room) => ({
        key: room.key,
        label: room.label,
        beneficiaries: room.beneficiaries,
        adultBeneficiaries: room.adultBeneficiaries,
        convertedChildBeneficiaries: room.convertedChildBeneficiaries,
      })),
      hotelTotal: perRoomPricing.reduce(
        (sum, room) => sum + Number(room.hotelTotalRoom || 0),
        0,
      ),
      hotelAdultTotal: perRoomPricing.reduce(
        (sum, room) =>
          sum +
          Number(room.hotelPerPerson || 0) *
            Number(room.adultBeneficiaries || 0),
        0,
      ),
      hotelConvertedChildTotal: perRoomPricing.reduce(
        (sum, room) =>
          sum +
          Number(
            room.convertedChildHotelPerPerson || room.hotelPerPerson || 0,
          ) *
            Number(room.convertedChildBeneficiaries || 0),
        0,
      ),
    };
  }, [
    additionalCosts,
    calculatedTotals.nonHotelExplicitChildTotal,
    calculatedTotals.nonHotelConvertedChildTotal,
    calculatedTotals.nonHotelsTotal,
    calculatedTotals.subtotalIndividual,
    defaultNights,
    externalDays,
    externalItineraryBreakdown.adultTotal,
    hotelConfig,
    hotelConfigForCurrentPeople,
    normalizedExternalPeopleDetails,
    peopleCount?.adults,
    peopleCount?.children,
    roomOptionsByCategoryMemo,
  ]);

  const activeHotelConfig = useMemo(() => {
    const authoritativeGroupedHotel =
      selectedHotelConfig?.dayGroupsAuthoritative === true &&
      Array.isArray(selectedHotelConfig?.dayGroups) &&
      selectedHotelConfig.dayGroups.length > 0
        ? selectedHotelConfig
        : null;
    const cfg =
      authoritativeGroupedHotel ||
      canonicalHotelConfigForCurrentPeople ||
      hotelConfigForCurrentPeople ||
      hotelConfig;
    if (!cfg || typeof cfg !== "object") return null;

    const normalizedHotelCategory = String(cfg.category || "")
      .trim()
      .toLowerCase();
    const hasSelectedCategory =
      Boolean(normalizedHotelCategory) &&
      normalizedHotelCategory !== NO_HOTEL_CATEGORY &&
      normalizedHotelCategory !== "sin hotel";
    const hasHotelIdentity =
      hasSelectedCategory &&
      Boolean(String(cfg.id_hotel || cfg.hotelId || cfg.hotelName || "").trim());
    const hasHotelAmount =
      hasSelectedCategory &&
      Number(cfg.hotelTotal || cfg.total || cfg.hotelAdultTotal || 0) > 0;
    const hasSelectedNights =
      hasSelectedCategory &&
      Array.isArray(cfg.selectedNightIndices) &&
      cfg.selectedNightIndices.length > 0;
    const hasRoomMix =
      hasSelectedCategory &&
      cfg.mix &&
      typeof cfg.mix === "object" &&
      Object.keys(cfg.mix).length > 0;
    const hasRoomPricing =
      hasSelectedCategory &&
      Array.isArray(cfg.perRoomPricing) &&
      cfg.perRoomPricing.some((room) => {
        const beneficiaries =
          Number(room?.beneficiaries || 0) +
          Number(room?.adultBeneficiaries || 0) +
          Number(room?.convertedChildBeneficiaries || 0);
        const amount =
          Number(room?.hotelPerPerson || 0) +
          Number(room?.hotelTotalRoom || 0) +
          Number(room?.convertedChildHotelPerPerson || 0);
        return beneficiaries > 0 || amount > 0;
      });
    const hasSelectedCategoryRow =
      hasSelectedCategory &&
      Array.isArray(cfg.allCategoryRows) &&
      cfg.allCategoryRows.some(
        (row) => row?.isSelected || row?.category === cfg.category,
      );

    return hasSelectedCategory ||
      hasHotelIdentity ||
      hasHotelAmount ||
      hasSelectedNights ||
      hasRoomMix ||
      hasRoomPricing ||
      hasSelectedCategoryRow
      ? cfg
      : null;
  }, [
    canonicalHotelConfigForCurrentPeople,
    hotelConfig,
    hotelConfigForCurrentPeople,
    selectedHotelConfig,
  ]);

  const hasActiveHotelSelection = Boolean(activeHotelConfig);
  const isLuxuryHotelSelection = useMemo(
    () =>
      isLuxuryHotelPreviewSource(
        activeHotelConfig,
        activeHotelConfig?.allCategoryRows || [],
      ),
    [activeHotelConfig],
  );
  const activeExcelPreviewCategories = useMemo(() => {
    if (isLuxuryHotelSelection) return [LUXURY_HOTEL_CATEGORY];
    return Array.isArray(excelPreviewCategories)
      ? excelPreviewCategories
          .map((category) => String(category))
          .filter(Boolean)
      : [];
  }, [excelPreviewCategories, isLuxuryHotelSelection]);

  const hotelPreviewRoomOptionsByCategory = useMemo(
    () =>
      mergeRoomOptionsByCategory(
        roomOptionsByCategoryMemo,
        activeHotelConfig?.allCategoryRows || [],
        selectedHotelConfig?.allCategoryRows || [],
        hotelConfig?.allCategoryRows || [],
      ),
    [
      activeHotelConfig?.allCategoryRows,
      hotelConfig?.allCategoryRows,
      roomOptionsByCategoryMemo,
      selectedHotelConfig?.allCategoryRows,
    ],
  );

  const hotelQuoteButtonMessage = useMemo(() => {
    if (!activeHotelConfig) return "";

    const hotelName = activeHotelConfig.hotelName || "Hotel elegido";
    const nightsCount = Array.isArray(activeHotelConfig.selectedNightIndices)
      ? activeHotelConfig.selectedNightIndices.length
      : Number(activeHotelConfig.nights || 0);

    return nightsCount > 0
      ? `${hotelName} · ${nightsCount} día${nightsCount > 1 ? "s" : ""}`
      : hotelName;
  }, [activeHotelConfig]);

  const hotelCanonicalSyncSignatureRef = useRef("");
  useEffect(() => {
    if (!activeHotelConfig?.category) return;
    const needsCanonicalHotelInjection =
      getHotelConvertedChildCount(activeHotelConfig.childPricing) > 0 ||
      buildPeruvianPassengerIdSet(normalizedExternalPeopleDetails).size > 0 ||
      hotelConfigHasRoomIgv(activeHotelConfig);
    if (!needsCanonicalHotelInjection) return;
    if (
      !Array.isArray(activeHotelConfig.perRoomPricing) ||
      activeHotelConfig.perRoomPricing.length === 0
    ) {
      return;
    }

    const canonicalRow = clearHotelRoomCalculationCache(
      sanitizeHotelConfigForPeople(
        {
          ...activeHotelConfig,
          allCategoryRows: null,
          categoryRows: null,
          roomMixNeedsAutoRefresh: false,
        },
        peopleCount.adults || 1,
        peopleCount.children || 0,
      ),
      { resetRows: true, markForAutoRefresh: false },
    );

    const rowForInjection = {
      ...canonicalRow,
      perRoomPricing: activeHotelConfig.perRoomPricing,
      roomAssignments: activeHotelConfig.roomAssignments || {},
      roomAssignmentSummary: activeHotelConfig.roomAssignmentSummary || null,
    };
    const nextSignature = buildHotelRoomPricingSignature(rowForInjection);
    if (
      nextSignature &&
      hotelCanonicalSyncSignatureRef.current === nextSignature
    ) {
      return;
    }

    hotelCanonicalSyncSignatureRef.current = nextSignature;

    setSelectedHotelConfig(
      normalizeSelectedHotelConfig(
        rowForInjection,
        rowForInjection.hotelDetalle || rowForInjection.hotel_detalle,
      ),
    );

    setDays((prevDays) =>
      injectHotelIntoDaysPure(recalcItineraryPrices(prevDays), rowForInjection),
    );
  }, [
    activeHotelConfig,
    normalizedExternalPeopleDetails,
    peopleCount.adults,
    peopleCount.children,
    recalcItineraryPrices,
  ]);

  // Live hotel preview HTML (regenerated with current additional costs)
  const liveHotelPreviewHtml = useMemo(() => {
    const n = (v) => {
      const x = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(x) ? x : 0;
    };
    const round2 = (value) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return 0;
      return Math.round((num + Number.EPSILON) * 100) / 100;
    };
    const currentSubtotal = n(
      calculatedTotals.nonHotelsTotal ?? calculatedTotals.subtotalIndividual,
    );
    const opMode = String(
      additionalCosts?.operationalMode || "fixed",
    ).toLowerCase();
    const feeMode = String(additionalCosts?.feeMode || "fixed").toLowerCase();
    const opVal = n(additionalCosts?.operationalCosts);
    const feeVal = n(additionalCosts?.fee);
    const extraFee = n(additionalCosts?.extraFee);
    const calcAd = (base) => {
      const op = opMode === "percentage" ? (opVal * base) / 100 : opVal;
      const fee = feeMode === "percentage" ? (feeVal * base) / 100 : feeVal;
      return round2(round2(op) + round2(fee) + round2(extraFee));
    };
    const effectiveHotelConfig = activeHotelConfig;
    const liveSummaryPricingSource = {
      ...formData,
      itinerario: visibleDays,
      dias: visibleDays,
      peopleDetails: normalizedExternalPeopleDetails,
      people_details: normalizedExternalPeopleDetails,
      peopleCount,
      peoplecount: peopleCount,
      itinerario_externo: externalDays,
      itinerarioExterno: externalDays,
      externalItinerary: externalDays,
      selectedHotel: effectiveHotelConfig,
      selected_hotel: effectiveHotelConfig,
      perRoomPricing: effectiveHotelConfig?.perRoomPricing || [],
      additionalCosts,
      additionalcosts: additionalCosts,
      subtotalIndividual: currentSubtotal,
      subtotal_individual: currentSubtotal,
      nonHotelsTotal: currentSubtotal,
      subtotalNinos:
        calculatedTotals.subtotalNinos ?? calculatedTotals.subtotal_ninos ?? 0,
      subtotal_ninos:
        calculatedTotals.subtotalNinos ?? calculatedTotals.subtotal_ninos ?? 0,
      nonHotelExplicitChildTotal:
        calculatedTotals.nonHotelExplicitChildTotal || 0,
      nonHotelConvertedChildTotal:
        calculatedTotals.nonHotelConvertedChildTotal || 0,
      baseExplicitChildCount: calculatedTotals.baseExplicitChildCount || 0,
      baseConvertedChildCount: calculatedTotals.baseConvertedChildCount || 0,
      hotelExplicitChildCount: calculatedTotals.hotelExplicitChildCount || 0,
      hotelConvertedChildCount: calculatedTotals.hotelConvertedChildCount || 0,
      hotelChildTotal: calculatedTotals.hotelChildTotal || 0,
      hotelConvertedChildTotal:
        calculatedTotals.hotelConvertedChildTotal || 0,
      precio_it_ext_adulto: externalItineraryBreakdown.adultTotal,
      precio_it_ext_ninos: round2(
        n(externalItineraryBreakdown.childTotal) +
          n(externalItineraryBreakdown.convertedChildTotal),
      ),
      externalExplicitChildCount: n(
        externalItineraryBreakdown.explicitChildCount,
      ),
      externalConvertedChildCount: n(
        externalItineraryBreakdown.convertedChildCount,
      ),
    };
    const liveSummaryPricingModel = buildSummaryContentPricingModel(
      liveSummaryPricingSource,
    );
    // El snapshot guardado puede provenir de una edición previa. Para el
    // editor/preview se usa primero el cálculo vivo del core compartido; el
    // snapshot permanece solo como respaldo de cotizaciones históricas.
    const liveSummaryVisibleParts =
      Array.isArray(liveSummaryPricingModel?.parts) &&
      liveSummaryPricingModel.parts.length > 0
        ? liveSummaryPricingModel.parts
        : Array.isArray(additionalCosts?.summaryVisibleParts)
          ? additionalCosts.summaryVisibleParts
          : [];
    if (!effectiveHotelConfig) {
      const adults = Math.max(1, n(peopleCount?.adults));
      const children = Math.max(0, n(peopleCount?.children));
      const noHotelChildBreakdown = resolveNoHotelPreviewChildBreakdown({
        childrenCount: children,
        subtotalNinos: calculatedTotals.subtotalninos || 0,
        hotelChildTotal: calculatedTotals.hotelChildTotal || 0,
        nonHotelExplicitChildTotal:
          calculatedTotals.nonHotelExplicitChildTotal || 0,
        nonHotelConvertedChildTotal:
          calculatedTotals.nonHotelConvertedChildTotal || 0,
        baseExplicitChildCount: calculatedTotals.baseExplicitChildCount || 0,
        baseConvertedChildCount: calculatedTotals.baseConvertedChildCount || 0,
        nonHotelExplicitChildTotalsById:
          calculatedTotals.nonHotelExplicitChildTotalsById || {},
        nonHotelConvertedChildTotalsById:
          calculatedTotals.nonHotelConvertedChildTotalsById || {},
      });
      const explicitChildBase = noHotelChildBreakdown.explicitTotal;
      const convertedChildBase = noHotelChildBreakdown.convertedTotal;
      const convertedChildCount = noHotelChildBreakdown.convertedCount;
      const explicitChildCount = noHotelChildBreakdown.explicitCount;
      const noHotelPreviewAdditionalCosts = {
        ...(additionalCosts || {}),
        feeMode: "percentage",
        childFeeMode: "percentage",
        childFee: additionalCosts?.fee,
        childOperationalMode: additionalCosts?.operationalMode || "fixed",
        childOperationalCosts: additionalCosts?.operationalCosts,
        childExtraFee: additionalCosts?.extraFee,
        applyAdditionalCostsToChildren: true,
        applyOperationalCostsToChildren: true,
        applyFeeToChildren: true,
        applyExtraFeeToChildren: true,
      };
      const noHotelSummaryTotals = calculateCotizacionFinancialSummary({
        subtotalIndividual: currentSubtotal,
        adultsCount: adults,
        childrenCount: children,
        hotelsTotal: 0,
        hotelAdultTotal: 0,
        hotelChildTotal: 0,
        hotelConvertedChildTotal: 0,
        subtotalNinos: noHotelChildBreakdown.unifiedBaseTotal,
        externalAdultTotal: n(externalItineraryBreakdown.adultTotal),
        externalChildTotal: n(externalItineraryBreakdown.childTotal),
        externalConvertedChildTotal: n(
          externalItineraryBreakdown.convertedChildTotal,
        ),
        externalExplicitChildCount: n(
          externalItineraryBreakdown.explicitChildCount,
        ),
        externalConvertedChildCount: n(
          externalItineraryBreakdown.convertedChildCount,
        ),
        baseExplicitChildCount: explicitChildCount,
        baseConvertedChildCount: convertedChildCount,
        hotelExplicitChildCount: 0,
        hotelConvertedChildCount: 0,
        nonHotelExplicitChildTotal: explicitChildBase,
        nonHotelConvertedChildTotal: convertedChildBase,
        additionalCosts: noHotelPreviewAdditionalCosts,
      });
      const totalPerChild = round2(
        noHotelSummaryTotals.perUnifiedChildVisibleTotal ||
          noHotelSummaryTotals.perUnifiedChildTotal ||
          0,
      );

      return buildCotizacionPreviewHtml({
        cotizacion: liveSummaryPricingSource,
        pricingModel: liveSummaryPricingModel,
        summaryVisibleParts: liveSummaryVisibleParts,
        titulo: formData.titulo || "Cotización",
        days: visibleDays,
        fechaInicio: formData.fechainicio || null,
        nights: defaultNights || Math.max(1, visibleDays.length - 1),
        breakfasts: 0,
        packageType,
        peopleCount: { ...peopleCount, adults, children },
        noHotel: true,
        noHotelTotalPerAdult: round2(
          noHotelSummaryTotals.perAdultVisibleTotal ||
            currentSubtotal +
              calcAd(currentSubtotal) +
              n(externalItineraryBreakdown.adultTotal),
        ),
        noHotelTotalPerChild: totalPerChild,
        noHotelBaseExplicitChildTotal: explicitChildBase,
        noHotelNonHotelsTotal: currentSubtotal,
        noHotelAdditionalCfg: noHotelPreviewAdditionalCosts,
        noHotelExplicitChildCount:
          explicitChildCount > 0 ? explicitChildCount : 0,
        noHotelConvertedChildTotal: convertedChildBase,
        noHotelConvertedChildCount: convertedChildCount,
        baseExplicitChildTotalsById:
          calculatedTotals.nonHotelExplicitChildTotalsById || {},
        baseConvertedChildTotalsById:
          calculatedTotals.nonHotelConvertedChildTotalsById || {},
        previewCategories: [NO_HOTEL_CATEGORY],
        externalAdultTotal: n(externalItineraryBreakdown.adultTotal),
        externalChildTotal: n(externalItineraryBreakdown.childTotal),
        externalConvertedChildTotal: n(
          externalItineraryBreakdown.convertedChildTotal,
        ),
        additionalCosts: noHotelPreviewAdditionalCosts,
      });
    }
    const hasChildren = n(peopleCount?.children) > 0;
    const shouldAutoRefreshHotelMix =
      effectiveHotelConfig?.roomMixNeedsAutoRefresh === true;
    const nightsCount = Array.isArray(
      effectiveHotelConfig?.selectedNightIndices,
    )
      ? effectiveHotelConfig.selectedNightIndices.length
      : n(effectiveHotelConfig?.nights) || defaultNights || 1;
    const hotelConvertedChildCount = hasChildren
      ? n(calculatedTotals?.hotelConvertedChildCount) ||
        Object.keys(
          effectiveHotelConfig?.childPricing?.convertedChildToAdultMap || {},
        ).length ||
        0
      : 0;
    const realAdultsCount = Math.max(1, n(peopleCount?.adults));
    const hotelAdultEquivalentCount =
      realAdultsCount + hotelConvertedChildCount;
    const previewPeopleCount = {
      ...peopleCount,
      adults: realAdultsCount,
      children: Math.max(0, n(peopleCount?.children)),
    };
    const enrichPreviewRows = (rows = []) =>
      rows.map((row) => {
        const rowCategory = String(row?.category || "").toLowerCase();
        const selectedCategory = String(
          effectiveHotelConfig?.category || "",
        ).toLowerCase();
        return {
          ...row,
          perRoomPricing:
            Array.isArray(row.perRoomPricing) && row.perRoomPricing.length > 0
              ? row.perRoomPricing
              : rowCategory && rowCategory === selectedCategory
                ? effectiveHotelConfig?.perRoomPricing || []
                : [],
          adultEquivalentCount: hotelAdultEquivalentCount,
          convertedChildCount: hotelConvertedChildCount,
          explicitChildrenCount: Math.max(0, n(peopleCount?.children)),
          baseExplicitChildTotal:
            calculatedTotals.nonHotelExplicitChildTotal || 0,
          baseConvertedChildTotal:
            calculatedTotals.nonHotelConvertedChildTotal || 0,
          nonHotelConvertedChildTotal:
            calculatedTotals.nonHotelConvertedChildTotal || 0,
          hotelExplicitChildCount:
            calculatedTotals.hotelExplicitChildCount || 0,
          hotelConvertedChildCount,
          baseExplicitChildTotalsById:
            calculatedTotals.nonHotelExplicitChildTotalsById || {},
          baseConvertedChildTotalsById:
            calculatedTotals.nonHotelConvertedChildTotalsById || {},
          hotelConvertedChildTotal:
            calculatedTotals.hotelConvertedChildTotal || 0,
          hotelExplicitChildTotalsById:
            calculatedTotals.hotelExplicitChildTotalsById || {},
          hotelConvertedChildTotalsById:
            calculatedTotals.hotelConvertedChildTotalsById || {},
        };
      });

    const previewSavedMix = shouldAutoRefreshHotelMix
      ? null
      : getHotelPreviewMix(effectiveHotelConfig);
    const preferSavedLuxuryRows = isLuxuryHotelPreviewSource(
      effectiveHotelConfig,
      effectiveHotelConfig?.allCategoryRows || [],
    );

    /* ── 1. Saved allCategoryRows → recalc totalPerAdult with live data ── */
    const primaryDictRows = buildCategoryRowsFromDict({
      roomOptionsByCategory: hotelPreviewRoomOptionsByCategory,
      selectedCategory: effectiveHotelConfig?.category,
      priceOverrides: effectiveHotelConfig?.priceOverrides,
      savedMix: previewSavedMix,
      adultsCount: hotelAdultEquivalentCount,
      selectedNights: nightsCount,
      defaultNights: defaultNights || 1,
      subtotalIndividual: currentSubtotal,
      additionalCosts,
      externalAdultTotal: externalItineraryBreakdown.adultTotal,
      childrenCount: peopleCount?.children || 0,
      externalChildTotal: externalItineraryBreakdown.childTotal,
      externalConvertedChildTotal:
        externalItineraryBreakdown.convertedChildTotal,
      baseExplicitChildTotal: calculatedTotals.nonHotelExplicitChildTotal || 0,
      baseConvertedChildTotal:
        calculatedTotals.nonHotelConvertedChildTotal || 0,
      nonHotelConvertedChildTotal:
        calculatedTotals.nonHotelConvertedChildTotal || 0,
      baseExplicitChildTotalsById:
        calculatedTotals.nonHotelExplicitChildTotalsById || {},
      baseConvertedChildTotalsById:
        calculatedTotals.nonHotelConvertedChildTotalsById || {},
      hotelExplicitChildTotalsById:
        calculatedTotals.hotelExplicitChildTotalsById || {},
      hotelConvertedChildTotalsById:
        calculatedTotals.hotelConvertedChildTotalsById || {},
      hotelExplicitChildTotal: calculatedTotals.hotelExplicitChildTotal || 0,
      hotelConvertedChildTotal: calculatedTotals.hotelConvertedChildTotal || 0,
      hotelChildTotal:
        calculatedTotals.hotelChildTotal ||
        calculatedTotals.hotelExplicitChildTotal ||
        0,
      hotelExplicitChildCount: calculatedTotals.hotelExplicitChildCount || 0,
      hotelConvertedChildCount,
    });

    const primaryRowsForPreview = preferSavedLuxuryRows
      ? []
      : filterLuxuryHotelCategoryRows(primaryDictRows, effectiveHotelConfig);

    const enrichedPrimaryDictRows = enrichPreviewRows(
      attachComputedPerRoomPricingToRows(primaryRowsForPreview, {
        hotelConfig: effectiveHotelConfig,
        adultsCount: realAdultsCount,
        childrenCount: n(peopleCount?.children),
        nonHotelsTotal: currentSubtotal,
        nonHotelExplicitChildTotal:
          calculatedTotals.nonHotelExplicitChildTotal || 0,
        nonHotelConvertedChildTotal:
          calculatedTotals.nonHotelConvertedChildTotal || 0,
        additionalCosts,
        nights: nightsCount,
        externalAdultTotal: externalItineraryBreakdown.adultTotal,
        peopleDetails: normalizedExternalPeopleDetails,
      }),
    );

    if (enrichedPrimaryDictRows.length > 0) {
      try {
        const freshHtml = buildCotizacionPreviewHtml({
          cotizacion: liveSummaryPricingSource,
          pricingModel: liveSummaryPricingModel,
          summaryVisibleParts: liveSummaryVisibleParts,
          titulo: formData.titulo || "Cotización",
          days: visibleDays,
          fechaInicio: formData.fechainicio || null,
          nights: nightsCount,
          breakfasts: nightsCount,
          packageType,
          categoryRows: enrichedPrimaryDictRows,
          peopleCount: previewPeopleCount,
          accommodationType: "doble o matrimonial",
          mealsIncluded: 0,
          selectedCat: effectiveHotelConfig?.category,
          selectedHotel: effectiveHotelConfig,
          previewCategories: activeExcelPreviewCategories,
          externalAdultTotal: externalItineraryBreakdown.adultTotal,
          externalChildTotal: externalItineraryBreakdown.childTotal,
          externalConvertedChildTotal:
            externalItineraryBreakdown.convertedChildTotal,
          additionalCosts,
        });
        return applyHotelDetalleToGeneratedHtml(
          freshHtml,
          effectiveHotelConfig?.hotelDetalle,
        );
      } catch {
        /* fall through to saved rows */
      }
    }

    const savedRows = shouldAutoRefreshHotelMix
      ? null
      : filterLuxuryHotelCategoryRows(
          effectiveHotelConfig?.allCategoryRows,
          effectiveHotelConfig,
        );
    if (Array.isArray(savedRows) && savedRows.length > 0) {
      try {
        const updatedRows = enrichPreviewRows(savedRows).map((row) => {
          const hotelPerAdult = n(row.hotelPerAdult);
          const basePerAdult = round2(currentSubtotal + hotelPerAdult);
          const adicionales = calcAd(basePerAdult);
          const rowCategory = String(row?.category || "").toLowerCase();
          const selectedCategory = String(
            effectiveHotelConfig?.category || "",
          ).toLowerCase();
          const rowWithUpdatedAdult = {
            ...row,
            isSelected: rowCategory && rowCategory === selectedCategory,
            nonHotelsTotal: currentSubtotal,
            additionalCfg: {
              operationalMode: additionalCosts.operationalMode,
              operationalCosts: additionalCosts.operationalCosts,
              feeMode: additionalCosts.feeMode,
              fee: additionalCosts.fee,
              feeVal: additionalCosts.fee,
              extraFee: additionalCosts.extraFee,
              applyAdditionalCostsToChildren:
                additionalCosts.applyAdditionalCostsToChildren !== false,
              applyOperationalCostsToChildren:
                additionalCosts.applyOperationalCostsToChildren ??
                additionalCosts.applyAdditionalCostsToChildren ??
                true,
              applyFeeToChildren:
                additionalCosts.applyFeeToChildren ??
                additionalCosts.applyAdditionalCostsToChildren ??
                true,
              applyExtraFeeToChildren:
                additionalCosts.applyExtraFeeToChildren ??
                additionalCosts.applyAdditionalCostsToChildren ??
                true,
              childOperationalMode:
                additionalCosts.childOperationalMode ||
                additionalCosts.operationalMode,
              childOperationalCosts:
                additionalCosts.childOperationalCosts ??
                additionalCosts.operationalCosts,
              childFeeMode:
                additionalCosts.childFeeMode || additionalCosts.feeMode,
              childFee: additionalCosts.childFee ?? additionalCosts.fee,
              childExtraFee:
                additionalCosts.childExtraFee ?? additionalCosts.extraFee,
            },
            totalPerAdult: round2(
              basePerAdult +
                adicionales +
                externalItineraryBreakdown.adultTotal,
            ),
          };
          return rowWithUpdatedAdult;
        });
        const freshHtml = buildCotizacionPreviewHtml({
          cotizacion: liveSummaryPricingSource,
          pricingModel: liveSummaryPricingModel,
          summaryVisibleParts: liveSummaryVisibleParts,
          titulo: formData.titulo || "Cotización",
          days: visibleDays,
          fechaInicio: formData.fechainicio || null,
          nights: nightsCount,
          breakfasts: nightsCount,
          packageType,
          categoryRows: updatedRows,
          peopleCount: previewPeopleCount,
          accommodationType: "doble o matrimonial",
          mealsIncluded: 0,
          selectedCat: effectiveHotelConfig?.category,
          selectedHotel: effectiveHotelConfig,
          previewCategories: activeExcelPreviewCategories,
          externalAdultTotal: externalItineraryBreakdown.adultTotal,
          externalChildTotal: externalItineraryBreakdown.childTotal,
          externalConvertedChildTotal:
            externalItineraryBreakdown.convertedChildTotal,
          additionalCosts,
        });
        return applyHotelDetalleToGeneratedHtml(
          freshHtml,
          effectiveHotelConfig?.hotelDetalle,
        );
      } catch {
        /* fall through to next strategy */
      }
    }

    /* ── 2. No saved rows → rebuild from hotel dictionary ── */
    const dictRows = filterLuxuryHotelCategoryRows(
      buildCategoryRowsFromDict({
        roomOptionsByCategory: hotelPreviewRoomOptionsByCategory,
        selectedCategory: effectiveHotelConfig?.category,
        priceOverrides: effectiveHotelConfig?.priceOverrides,
        savedMix: previewSavedMix,
        adultsCount: hotelAdultEquivalentCount,
        selectedNights: nightsCount,
        defaultNights: defaultNights || 1,
        subtotalIndividual: currentSubtotal,
        additionalCosts,
        externalAdultTotal: externalItineraryBreakdown.adultTotal,
        childrenCount: peopleCount?.children || 0,
        externalChildTotal: externalItineraryBreakdown.childTotal,
        externalConvertedChildTotal:
          externalItineraryBreakdown.convertedChildTotal,
        baseExplicitChildTotal:
          calculatedTotals.nonHotelExplicitChildTotal || 0,
        baseConvertedChildTotal:
          calculatedTotals.nonHotelConvertedChildTotal || 0,
        nonHotelConvertedChildTotal:
          calculatedTotals.nonHotelConvertedChildTotal || 0,
        baseExplicitChildTotalsById:
          calculatedTotals.nonHotelExplicitChildTotalsById || {},
        baseConvertedChildTotalsById:
          calculatedTotals.nonHotelConvertedChildTotalsById || {},
        hotelExplicitChildTotalsById:
          calculatedTotals.hotelExplicitChildTotalsById || {},
        hotelConvertedChildTotalsById:
          calculatedTotals.hotelConvertedChildTotalsById || {},
        hotelExplicitChildTotal: calculatedTotals.hotelExplicitChildTotal || 0,
        hotelConvertedChildTotal:
          calculatedTotals.hotelConvertedChildTotal || 0,
        hotelChildTotal:
          calculatedTotals.hotelChildTotal ||
          calculatedTotals.hotelExplicitChildTotal ||
          0,
        hotelExplicitChildCount: calculatedTotals.hotelExplicitChildCount || 0,
        hotelConvertedChildCount,
      }),
      effectiveHotelConfig,
    );

    const enrichedDictRows = enrichPreviewRows(
      attachComputedPerRoomPricingToRows(dictRows, {
        hotelConfig: effectiveHotelConfig,
        adultsCount: realAdultsCount,
        childrenCount: n(peopleCount?.children),
        nonHotelsTotal: currentSubtotal,
        nonHotelExplicitChildTotal:
          calculatedTotals.nonHotelExplicitChildTotal || 0,
        nonHotelConvertedChildTotal:
          calculatedTotals.nonHotelConvertedChildTotal || 0,
        additionalCosts,
        nights: nightsCount,
        externalAdultTotal: externalItineraryBreakdown.adultTotal,
        peopleDetails: normalizedExternalPeopleDetails,
      }),
    );

    if (enrichedDictRows.length > 0) {
      try {
        const freshHtml = buildCotizacionPreviewHtml({
          cotizacion: liveSummaryPricingSource,
          pricingModel: liveSummaryPricingModel,
          summaryVisibleParts: liveSummaryVisibleParts,
          titulo: formData.titulo || "Cotización",
          days: visibleDays,
          fechaInicio: formData.fechainicio || null,
          nights: nightsCount,
          breakfasts: nightsCount,
          packageType,
          categoryRows: enrichedDictRows,
          peopleCount: previewPeopleCount,
          accommodationType: "doble o matrimonial",
          mealsIncluded: 0,
          selectedCat: effectiveHotelConfig?.category,
          selectedHotel: effectiveHotelConfig,
          previewCategories: activeExcelPreviewCategories,
          externalAdultTotal: externalItineraryBreakdown.adultTotal,
          externalChildTotal: externalItineraryBreakdown.childTotal,
          externalConvertedChildTotal:
            externalItineraryBreakdown.convertedChildTotal,
          additionalCosts,
        });
        return applyHotelDetalleToGeneratedHtml(
          freshHtml,
          effectiveHotelConfig?.hotelDetalle,
        );
      } catch {
        /* fall through */
      }
    }

    /* ── 3. Last fallback → stale saved HTML ── */
    return effectiveHotelConfig?.hotelDetalleHtml || "";
  }, [
    additionalCosts,
    activeHotelConfig,
    activeExcelPreviewCategories,
    calculatedTotals.nonHotelsTotal,
    calculatedTotals.hotelExplicitChildCount,
    calculatedTotals.hotelConvertedChildCount,
    calculatedTotals.hotelChildTotal,
    calculatedTotals.hotelExplicitChildTotal,
    calculatedTotals.hotelConvertedChildTotal,
    calculatedTotals.hotelConvertedChildTotalsById,
    calculatedTotals.hotelExplicitChildTotalsById,
    calculatedTotals.nonHotelConvertedChildTotal,
    calculatedTotals.nonHotelConvertedChildTotalsById,
    calculatedTotals.nonHotelExplicitChildTotalsById,
    calculatedTotals.baseConvertedChildCount,
    calculatedTotals.baseExplicitChildCount,
    calculatedTotals.nonHotelExplicitChildTotal,
    calculatedTotals.subtotalNinos,
    calculatedTotals.subtotal_ninos,
    calculatedTotals.subtotalIndividual,
    defaultNights,
    externalItineraryBreakdown.adultTotal,
    externalItineraryBreakdown.childTotal,
    externalItineraryBreakdown.convertedChildTotal,
    formData.fechainicio,
    formData.titulo,
    hotelPreviewRoomOptionsByCategory,
    normalizedExternalPeopleDetails,
    packageType,
    peopleCount,
    visibleDays,
  ]);

  /* ===================== PREVIEW DATA (para modal resumen y hotel) ===================== */
  const cotizacionPreviewData = useMemo(() => {
    const summaryTotals = calculateCotizacionFinancialSummary({
      subtotalIndividual: Number(calculatedTotals.subtotalIndividual || 0),
      adultsCount: Number(peopleCount.adults || 0),
      childrenCount: Number(peopleCount.children || 0),
      hotelsTotal: hasActiveHotelSelection ? Number(hotelsTotal || 0) : 0,
      hotelAdultTotal: hasActiveHotelSelection
        ? Number(calculatedTotals.hotelAdultTotal || 0)
        : 0,
      hotelChildTotal: hasActiveHotelSelection
        ? Number(calculatedTotals.hotelChildTotal || 0)
        : 0,
      hotelConvertedChildTotal: hasActiveHotelSelection
        ? Number(calculatedTotals.hotelConvertedChildTotal || 0)
        : 0,
      subtotalNinos: Number(calculatedTotals.subtotalninos || 0),
      externalAdultTotal: externalItineraryBreakdown.adultTotal,
      externalChildTotal: externalItineraryBreakdown.childTotal,
      externalConvertedChildTotal:
        externalItineraryBreakdown.convertedChildTotal,
      externalExplicitChildCount:
        externalItineraryBreakdown.explicitChildCount,
      externalConvertedChildCount:
        externalItineraryBreakdown.convertedChildCount,
      baseExplicitChildCount: Number(
        calculatedTotals.baseExplicitChildCount || 0,
      ),
      baseConvertedChildCount: Number(
        calculatedTotals.baseConvertedChildCount || 0,
      ),
      hotelExplicitChildCount: hasActiveHotelSelection
        ? Number(calculatedTotals.hotelExplicitChildCount || 0)
        : 0,
      hotelConvertedChildCount: hasActiveHotelSelection
        ? Number(calculatedTotals.hotelConvertedChildCount || 0)
        : 0,
      nonHotelExplicitChildTotal: Number(
        calculatedTotals.nonHotelExplicitChildTotal || 0,
      ),
      nonHotelConvertedChildTotal: Number(
        calculatedTotals.nonHotelConvertedChildTotal || 0,
      ),
      additionalCosts,
    });

    const visibleChildSummary = resolveChildChargeSummary({
      childrenCount: Number(peopleCount.children || 0),
      baseExplicitChildCount: Number(
        calculatedTotals.baseExplicitChildCount || 0,
      ),
      baseConvertedChildCount: Number(
        calculatedTotals.baseConvertedChildCount || 0,
      ),
      hotelExplicitChildCount: hasActiveHotelSelection
        ? Number(calculatedTotals.hotelExplicitChildCount || 0)
        : 0,
      hotelConvertedChildCount: hasActiveHotelSelection
        ? Number(calculatedTotals.hotelConvertedChildCount || 0)
        : 0,
      nonHotelExplicitChildTotal: Number(
        calculatedTotals.nonHotelExplicitChildTotal || 0,
      ),
      nonHotelConvertedChildTotal: Number(
        calculatedTotals.nonHotelConvertedChildTotal || 0,
      ),
      hotelExplicitChildTotal: hasActiveHotelSelection
        ? Number(
            calculatedTotals.hotelExplicitChildTotal ??
              calculatedTotals.hotelChildTotal ??
              0,
          )
        : 0,
      hotelConvertedChildTotal: hasActiveHotelSelection
        ? Number(calculatedTotals.hotelConvertedChildTotal || 0)
        : 0,
    });
    const roomBasedVisibleSummaryParts = hasActiveHotelSelection
      ? buildRoomBasedFinancialSummaryParts({
          adultsCount: Number(peopleCount.adults || 0),
          childrenCount: Number(peopleCount.children || 0),
          subtotalIndividual: Number(calculatedTotals.subtotalIndividual || 0),
          additionalCosts,
          childSummary: visibleChildSummary,
          perRoomPricing: activeHotelConfig?.perRoomPricing || [],
          adultClassName: "ac__summary-total-pill--adult",
          childClassName: "ac__summary-total-pill--child",
          roomClassName: "ac__summary-total-pill--room",
          externalAdultTotal: externalItineraryBreakdown.adultTotal || 0,
          externalChildTotal: externalItineraryBreakdown.childTotal || 0,
          externalConvertedChildTotal:
            externalItineraryBreakdown.convertedChildTotal || 0,
        })
      : [];
    const visibleSummaryParts =
      roomBasedVisibleSummaryParts.length > 0
        ? roomBasedVisibleSummaryParts
        : buildFinancialSummaryParts({
            adultsCount: Number(peopleCount.adults || 0),
            adultTotal: summaryTotals.perAdultVisibleTotal,
            childTotal: summaryTotals.perExplicitChildVisibleTotal,
            convertedChildTotal:
              summaryTotals.perConvertedChildVisibleTotal ||
              visibleChildSummary.convertedPerChild,
            unifiedChildTotal:
              summaryTotals.perUnifiedChildTotal ||
              summaryTotals.perUnifiedChildVisibleTotal,
            childSummary: visibleChildSummary,
            perRoomPricing: hasActiveHotelSelection
              ? activeHotelConfig?.perRoomPricing || []
              : [],
            adultClassName: "ac__summary-total-pill--adult",
            childClassName: "ac__summary-total-pill--child",
            convertedChildClassName: "ac__summary-total-pill--child",
            roomClassName: "ac__summary-total-pill--room",
            externalAdultTotal: externalItineraryBreakdown.adultTotal || 0,
            externalChildTotal: externalItineraryBreakdown.childTotal || 0,
            externalConvertedChildTotal:
              externalItineraryBreakdown.convertedChildTotal || 0,
          }) || [];
    const visibleSummaryPayload =
      buildVisibleSummaryPayload(visibleSummaryParts);

    const enrichedAdditionalCosts = {
      ...additionalCosts,
      calculatedOperational: summaryTotals.operationalAmount,
      calculatedFee: summaryTotals.feeAmount,
      totalAdditional: summaryTotals.totalAdditionalPerAdult,
      totalAdditionalPerChild: summaryTotals.totalAdditionalPerChild,
      additionalChildTotal: summaryTotals.additionalChildTotal,
      calculatedChildOperational: summaryTotals.childOperationalAmount || 0,
      calculatedChildFee: summaryTotals.childFeeAmount || 0,
      calculatedChildExtraFee: summaryTotals.childExtraFeeAmount || 0,
      subtotalNinos: Number(calculatedTotals.subtotalninos || 0),
      nonHotelExplicitChildTotal:
        calculatedTotals.nonHotelExplicitChildTotal || 0,
      nonHotelConvertedChildTotal:
        calculatedTotals.nonHotelConvertedChildTotal || 0,
      nonHotelExplicitChildTotalsById:
        calculatedTotals.nonHotelExplicitChildTotalsById || {},
      nonHotelConvertedChildTotalsById:
        calculatedTotals.nonHotelConvertedChildTotalsById || {},
      hotelExplicitChildTotalsById:
        calculatedTotals.hotelExplicitChildTotalsById || {},
      hotelConvertedChildTotalsById:
        calculatedTotals.hotelConvertedChildTotalsById || {},
      summaryVisibleParts: visibleSummaryPayload.parts,
      visibleSummaryGrandTotal: visibleSummaryPayload.grandTotal,
      summaryVisibleGrandTotal: visibleSummaryPayload.grandTotal,
      acSummaryGrandTotal: visibleSummaryPayload.grandTotal,
    };
    const roomVisibleTotals = hasActiveHotelSelection
      ? parseHotelRoomVisibleTotals(liveHotelPreviewHtml)
      : null;
    const resolvedTotalFinal = resolveFinalTotalFromSources({
      additionalCosts: enrichedAdditionalCosts,
      roomVisibleTotals,
      summaryTotals,
      visibleParts: visibleSummaryPayload.parts,
    });
    const totalFinal =
      visibleSummaryPayload.grandTotal > 0
        ? visibleSummaryPayload.grandTotal
        : resolvedTotalFinal;
    const subtotalFinal = roundCurrencyValue(
      visibleSummaryPayload.commissionableGrandTotal > 0
        ? visibleSummaryPayload.commissionableGrandTotal
        : Math.max(0, totalFinal - (externalItineraryBreakdown.grandTotal || 0)),
    );
    enrichedAdditionalCosts.subtotalFinal = subtotalFinal;
    enrichedAdditionalCosts.subtotal_final = subtotalFinal;
    enrichedAdditionalCosts.commissionableSubtotal = subtotalFinal;
    enrichedAdditionalCosts.commissionable_subtotal = subtotalFinal;

    return {
      titulo,
      id: editingCotizacion?.id || "PREVIEW",
      platform: effectivePlatform,
      business_type: effectiveBusinessType,
      businessType: effectiveBusinessType,
      agency_id: effectiveAgencyId,
      agencyId: effectiveAgencyId,
      agency: selectedQuotationAgency,
      agency_name: effectiveAgencyName,
      tariff_type: tariffType,
      tariffType,
      fechaCreacion: new Date().toISOString(),
      clienteData: clientData,
      peopleCount,
      peopleDetails: normalizedExternalPeopleDetails,
      packageType,
      itinerario: visibleDays,
      fechainicio: formData.fechainicio || null,
      fechafin: formData.fechafin || null,

      selectedHotel: activeHotelConfig,
      pdf_excel_preview_categories: activeExcelPreviewCategories,
      hotelsTotal: hasActiveHotelSelection ? hotelsTotal : 0,
      itinerario_externo: externalDays,
      itinerarioExterno: externalDays,
      externalAdditionalCosts,

      hotel_detalle: hasActiveHotelSelection
        ? normalizeHotelDetallePayload(
            activeHotelConfig?.hotelDetalle ||
              editingCotizacion?.hotel_detalle ||
              editingCotizacion?.hotelDetalle ||
              null,
          )
        : null,

      nonHotelsTotal: calculatedTotals.nonHotelsTotal,
      subtotalIndividual: Number(calculatedTotals.subtotalIndividual || 0),
      subtotal_individual: Number(calculatedTotals.subtotalIndividual || 0),
      hotelAdultTotal: hasActiveHotelSelection
        ? Number(calculatedTotals.hotelAdultTotal || 0)
        : 0,
      hotelFullTotal: hasActiveHotelSelection
        ? Number(calculatedTotals.hotelFullTotal || 0)
        : 0,
      hotelChildTotal: hasActiveHotelSelection
        ? Number(calculatedTotals.hotelChildTotal || 0)
        : 0,
      hotelConvertedChildTotal: hasActiveHotelSelection
        ? Number(calculatedTotals.hotelConvertedChildTotal || 0)
        : 0,
      baseForFee: summaryTotals.percentageBase,
      grandTotal: totalFinal,
      subtotalFinal,
      subtotal_final: subtotalFinal,
      additionalCosts: enrichedAdditionalCosts,
      total_adicionales:
        summaryTotals.additionalGrandTotal ?? summaryTotals.additionalTotal,
      subtotal_ninos: calculatedTotals.subtotalninos,
      subtotal_nino: calculatedTotals.subtotalninos,
      total_final: totalFinal,

      // Unique passenger counts for display
      baseExplicitChildCount: calculatedTotals.baseExplicitChildCount || 0,
      baseConvertedChildCount: calculatedTotals.baseConvertedChildCount || 0,
      hotelExplicitChildCount: hasActiveHotelSelection
        ? calculatedTotals.hotelExplicitChildCount || 0
        : 0,
      hotelConvertedChildCount: hasActiveHotelSelection
        ? calculatedTotals.hotelConvertedChildCount || 0
        : 0,
      nonHotelExplicitChildTotal:
        calculatedTotals.nonHotelExplicitChildTotal || 0,
      nonHotelConvertedChildTotal:
        calculatedTotals.nonHotelConvertedChildTotal || 0,
      nonHotelExplicitChildTotalsById:
        calculatedTotals.nonHotelExplicitChildTotalsById || {},
      nonHotelConvertedChildTotalsById:
        calculatedTotals.nonHotelConvertedChildTotalsById || {},
      hotelExplicitChildTotalsById:
        calculatedTotals.hotelExplicitChildTotalsById || {},
      hotelConvertedChildTotalsById:
        calculatedTotals.hotelConvertedChildTotalsById || {},

      // Per-room-type pricing breakdown for multi-room distributions
      perRoomPricing: hasActiveHotelSelection
        ? activeHotelConfig?.perRoomPricing || []
        : [],
    };
  }, [
    titulo,
    editingCotizacion?.id,
    clientData,
    peopleCount,
    normalizedExternalPeopleDetails,
    packageType,
    days,
    calculatedTotals,
    additionalCosts,
    activeHotelConfig,
    hasActiveHotelSelection,
    hotelsTotal,
    visibleDays,
    externalDays,
    externalAdditionalCosts,
    formData.fechainicio,
    formData.fechafin,
    externalItineraryBreakdown,
    liveHotelPreviewHtml,
    activeExcelPreviewCategories,
    effectivePlatform,
    effectiveBusinessType,
    effectiveAgencyId,
    selectedQuotationAgency,
    effectiveAgencyName,
    tariffType,
  ]);

  /* ===================== RESUMEN MODAL ===================== */
  const handleOpenResumen = useCallback(() => {
    setSummarySnapshot({ ...cotizacionPreviewData });
    setShowResumen(true);
  }, [cotizacionPreviewData]);

  const handleCloseSummaryModal = useCallback((e) => {
    if (e && e.target === e.currentTarget) {
      setShowResumen(false);
      setSummarySnapshot(null);
    }
  }, []);

  const handleCloseSummary = useCallback(() => {
    setShowResumen(false);
    setSummarySnapshot(null);
  }, []);

  const summaryDisplayData = useMemo(
    () => summarySnapshot || cotizacionPreviewData,
    [summarySnapshot, cotizacionPreviewData],
  );

  /* ===================== GUARDADO ===================== */
  const generateDefaultTitle = async () => {
    try {
      const response = await axios.get("/cotizaciones", {
        params: { page: 1, limit: 1, sort: "-createdAt" },
      });
      let count = 1;
      if (response.data?.success && response.data.data?.length > 0) {
        const titleNumbers = response.data.data
          .map((cot) => {
            const match = cot.titulo?.match(/Cotización\s+#?(\d+)/i);
            return match ? parseInt(match[1], 10) : 0;
          })
          .filter((num) => !isNaN(num));
        if (titleNumbers.length > 0) count = Math.max(...titleNumbers) + 1;
      }
      return `Cotización #${count}`;
    } catch {
      return `Cotización #1`;
    }
  };

  const generateUpdateTitle = useCallback(() => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    return `Actualización de Cotización ${day}/${month}/${year}`;
  }, []);

  // Whether this cotizacion was already AI-processed (has PDF)
  const isProcessedCotizacion = !!(
    editingCotizacion?.es_procesado === true &&
    editingCotizacion?.info_pdf?.length > 0
  );

  const handleSubmit = useCallback(
    async (resetPdf = null) => {
      if (submitInFlightRef.current || isSavingFromParent) {
        return;
      }

      if (!titulo.trim()) {
        setShowTitleError(true);
        const titleInput = document.querySelector(".title-input");
        if (titleInput) {
          titleInput.focus();
          titleInput.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return;
      }

      submitInFlightRef.current = true;
      setIsSubmitting(true);

      try {
        const passengerComposition = getCurrentPassengerComposition();
        const currentPeopleDetails = passengerComposition.peopleDetails;
        const currentPeopleCount = passengerComposition.peopleCount;

        const normalizedItinerario = visibleDays;
        const cleanedItinerario = cleanItinerarioForDB(normalizedItinerario);

        let finalTitle = titulo.trim();
        if (!finalTitle) {
          finalTitle = editingCotizacion
            ? generateUpdateTitle()
            : await generateDefaultTitle();
        }

        const safeAdditionalCosts =
          typeof additionalCosts === "object" && additionalCosts !== null
            ? additionalCosts
            : {};

        const adultsCount = Math.max(1, Number(peopleCount.adults || 0));

        const cleanObjectForSerialization = {
          operationalCosts: String(safeAdditionalCosts.operationalCosts || "0"),
          fee: String(safeAdditionalCosts.fee || "0"),
          extraFee: Number(safeAdditionalCosts.extraFee || 0),
          operationalMode: String(
            safeAdditionalCosts.operationalMode || "fixed",
          ),
          feeMode: String(safeAdditionalCosts.feeMode || "fixed"),
          calculatedOperational: 0,
          calculatedFee: 0,
          applyAdditionalCostsToChildren:
            safeAdditionalCosts.applyAdditionalCostsToChildren !== false,
          applyOperationalCostsToChildren:
            safeAdditionalCosts.applyOperationalCostsToChildren ??
            safeAdditionalCosts.applyAdditionalCostsToChildren ??
            true,
          applyFeeToChildren:
            safeAdditionalCosts.applyFeeToChildren ??
            safeAdditionalCosts.applyAdditionalCostsToChildren ??
            true,
          applyExtraFeeToChildren:
            safeAdditionalCosts.applyExtraFeeToChildren ??
            safeAdditionalCosts.applyAdditionalCostsToChildren ??
            true,
          childOperationalMode: String(
            safeAdditionalCosts.childOperationalMode ||
              safeAdditionalCosts.operationalMode ||
              "fixed",
          ),
          childOperationalCosts: String(
            safeAdditionalCosts.childOperationalCosts ??
              safeAdditionalCosts.operationalCosts ??
              "0",
          ),
          childFeeMode: String(
            safeAdditionalCosts.childFeeMode ||
              safeAdditionalCosts.feeMode ||
              "percentage",
          ),
          childFee: String(
            safeAdditionalCosts.childFee ?? safeAdditionalCosts.fee ?? "0",
          ),
          childExtraFee: String(
            safeAdditionalCosts.childExtraFee ??
              safeAdditionalCosts.extraFee ??
              "0",
          ),
          subtotalNinos: Number(calculatedTotals.subtotalninos || 0),
          nonHotelExplicitChildTotal: Number(
            calculatedTotals.nonHotelExplicitChildTotal || 0,
          ),
          nonHotelConvertedChildTotal: Number(
            calculatedTotals.nonHotelConvertedChildTotal || 0,
          ),
          nonHotelExplicitChildTotalsById:
            calculatedTotals.nonHotelExplicitChildTotalsById || {},
          nonHotelConvertedChildTotalsById:
            calculatedTotals.nonHotelConvertedChildTotalsById || {},
          hotelExplicitChildTotalsById:
            calculatedTotals.hotelExplicitChildTotalsById || {},
          hotelConvertedChildTotalsById:
            calculatedTotals.hotelConvertedChildTotalsById || {},
        };

        const summaryTotals = calculateCotizacionFinancialSummary({
          subtotalIndividual: Number(calculatedTotals.subtotalIndividual || 0),
          adultsCount: Number(peopleCount.adults || 0),
          childrenCount: Number(peopleCount.children || 0),
          hotelsTotal: hasActiveHotelSelection ? Number(hotelsTotal || 0) : 0,
          hotelAdultTotal: hasActiveHotelSelection
            ? Number(calculatedTotals.hotelAdultTotal || 0)
            : 0,
          hotelChildTotal: hasActiveHotelSelection
            ? Number(calculatedTotals.hotelChildTotal || 0)
            : 0,
          hotelConvertedChildTotal: hasActiveHotelSelection
            ? Number(calculatedTotals.hotelConvertedChildTotal || 0)
            : 0,
          subtotalNinos: Number(calculatedTotals.subtotalninos || 0),
          externalAdultTotal: externalItineraryBreakdown.adultTotal,
          externalChildTotal: externalItineraryBreakdown.childTotal,
          externalConvertedChildTotal:
            externalItineraryBreakdown.convertedChildTotal,
          externalExplicitChildCount:
            externalItineraryBreakdown.explicitChildCount,
          externalConvertedChildCount:
            externalItineraryBreakdown.convertedChildCount,
          baseExplicitChildCount: Number(
            calculatedTotals.baseExplicitChildCount || 0,
          ),
          baseConvertedChildCount: Number(
            calculatedTotals.baseConvertedChildCount || 0,
          ),
          hotelExplicitChildCount: hasActiveHotelSelection
            ? Number(calculatedTotals.hotelExplicitChildCount || 0)
            : 0,
          hotelConvertedChildCount: hasActiveHotelSelection
            ? Number(calculatedTotals.hotelConvertedChildCount || 0)
            : 0,
          nonHotelExplicitChildTotal: Number(
            calculatedTotals.nonHotelExplicitChildTotal || 0,
          ),
          nonHotelConvertedChildTotal: Number(
            calculatedTotals.nonHotelConvertedChildTotal || 0,
          ),
          additionalCosts: sanitizeAdditionalCostsConfig(
            cleanObjectForSerialization,
          ),
        });

        const visibleChildSummary = resolveChildChargeSummary({
          childrenCount: Number(peopleCount.children || 0),
          baseExplicitChildCount: Number(
            calculatedTotals.baseExplicitChildCount || 0,
          ),
          baseConvertedChildCount: Number(
            calculatedTotals.baseConvertedChildCount || 0,
          ),
          hotelExplicitChildCount: hasActiveHotelSelection
            ? Number(calculatedTotals.hotelExplicitChildCount || 0)
            : 0,
          hotelConvertedChildCount: hasActiveHotelSelection
            ? Number(calculatedTotals.hotelConvertedChildCount || 0)
            : 0,
          nonHotelExplicitChildTotal: Number(
            calculatedTotals.nonHotelExplicitChildTotal || 0,
          ),
          nonHotelConvertedChildTotal: Number(
            calculatedTotals.nonHotelConvertedChildTotal || 0,
          ),
          hotelExplicitChildTotal: hasActiveHotelSelection
            ? Number(
                calculatedTotals.hotelExplicitChildTotal ??
                  calculatedTotals.hotelChildTotal ??
                  0,
              )
            : 0,
          hotelConvertedChildTotal: hasActiveHotelSelection
            ? Number(calculatedTotals.hotelConvertedChildTotal || 0)
            : 0,
        });
        const roomBasedVisibleSummaryParts = hasActiveHotelSelection
          ? buildRoomBasedFinancialSummaryParts({
              adultsCount: Number(peopleCount.adults || 0),
              childrenCount: Number(peopleCount.children || 0),
              subtotalIndividual: Number(
                calculatedTotals.subtotalIndividual || 0,
              ),
              additionalCosts,
              childSummary: visibleChildSummary,
              perRoomPricing: activeHotelConfig?.perRoomPricing || [],
              adultClassName: "ac__summary-total-pill--adult",
              childClassName: "ac__summary-total-pill--child",
              roomClassName: "ac__summary-total-pill--room",
              externalAdultTotal: externalItineraryBreakdown.adultTotal || 0,
              externalChildTotal: externalItineraryBreakdown.childTotal || 0,
              externalConvertedChildTotal:
                externalItineraryBreakdown.convertedChildTotal || 0,
            })
          : [];
        const visibleSummaryParts =
          roomBasedVisibleSummaryParts.length > 0
            ? roomBasedVisibleSummaryParts
            : buildFinancialSummaryParts({
                adultsCount: Number(peopleCount.adults || 0),
                adultTotal: summaryTotals.perAdultVisibleTotal,
                childTotal: summaryTotals.perExplicitChildVisibleTotal,
                convertedChildTotal:
                  summaryTotals.perConvertedChildVisibleTotal ||
                  visibleChildSummary.convertedPerChild,
                unifiedChildTotal:
                  summaryTotals.perUnifiedChildTotal ||
                  summaryTotals.perUnifiedChildVisibleTotal,
                childSummary: visibleChildSummary,
                perRoomPricing: hasActiveHotelSelection
                  ? activeHotelConfig?.perRoomPricing || []
                  : [],
                adultClassName: "ac__summary-total-pill--adult",
                childClassName: "ac__summary-total-pill--child",
                convertedChildClassName: "ac__summary-total-pill--child",
                roomClassName: "ac__summary-total-pill--room",
                externalAdultTotal: externalItineraryBreakdown.adultTotal || 0,
                externalChildTotal: externalItineraryBreakdown.childTotal || 0,
                externalConvertedChildTotal:
                  externalItineraryBreakdown.convertedChildTotal || 0,
              }) || [];
        const visibleSummaryPayload =
          buildVisibleSummaryPayload(visibleSummaryParts);

        const enrichedAdditionalCosts = {
          ...additionalCosts,
          calculatedOperational: summaryTotals.operationalAmount,
          calculatedFee: summaryTotals.feeAmount,
          totalAdditional: summaryTotals.totalAdditionalPerAdult,
          totalAdditionalPerChild: summaryTotals.totalAdditionalPerChild,
          additionalChildTotal: summaryTotals.additionalChildTotal,
          calculatedChildOperational: summaryTotals.childOperationalAmount || 0,
          calculatedChildFee: summaryTotals.childFeeAmount || 0,
          calculatedChildExtraFee: summaryTotals.childExtraFeeAmount || 0,
          subtotalNinos: Number(calculatedTotals.subtotalninos || 0),
          nonHotelExplicitChildTotal:
            calculatedTotals.nonHotelExplicitChildTotal || 0,
          nonHotelConvertedChildTotal:
            calculatedTotals.nonHotelConvertedChildTotal || 0,
          nonHotelExplicitChildTotalsById:
            calculatedTotals.nonHotelExplicitChildTotalsById || {},
          nonHotelConvertedChildTotalsById:
            calculatedTotals.nonHotelConvertedChildTotalsById || {},
          hotelExplicitChildTotalsById:
            calculatedTotals.hotelExplicitChildTotalsById || {},
          hotelConvertedChildTotalsById:
            calculatedTotals.hotelConvertedChildTotalsById || {},
          summaryVisibleParts: visibleSummaryPayload.parts,
          visibleSummaryGrandTotal: visibleSummaryPayload.grandTotal,
          summaryVisibleGrandTotal: visibleSummaryPayload.grandTotal,
          acSummaryGrandTotal: visibleSummaryPayload.grandTotal,
        };
        cleanObjectForSerialization.calculatedOperational =
          summaryTotals.operationalAmount;
        cleanObjectForSerialization.calculatedFee = summaryTotals.feeAmount;
        cleanObjectForSerialization.totalAdditional =
          summaryTotals.totalAdditionalPerAdult;
        cleanObjectForSerialization.totalAdditionalPerChild =
          summaryTotals.totalAdditionalPerChild;
        cleanObjectForSerialization.additionalChildTotal =
          summaryTotals.additionalChildTotal;
        cleanObjectForSerialization.calculatedChildOperational =
          summaryTotals.childOperationalAmount || 0;
        cleanObjectForSerialization.calculatedChildFee =
          summaryTotals.childFeeAmount || 0;
        cleanObjectForSerialization.calculatedChildExtraFee =
          summaryTotals.childExtraFeeAmount || 0;
        const roomVisibleTotals = hasActiveHotelSelection
          ? parseHotelRoomVisibleTotals(liveHotelPreviewHtml)
          : null;
        const additionalCostsForResolution = {
          ...safeAdditionalCosts,
          summaryVisibleParts: visibleSummaryPayload.parts,
          visibleSummaryGrandTotal: visibleSummaryPayload.grandTotal,
          summaryVisibleGrandTotal: visibleSummaryPayload.grandTotal,
          acSummaryGrandTotal: visibleSummaryPayload.grandTotal,
        };
        const resolvedTotalFinal = resolveFinalTotalFromSources({
          additionalCosts: additionalCostsForResolution,
          roomVisibleTotals,
          summaryTotals,
          visibleParts: visibleSummaryPayload.parts,
        });
        const totalFinal =
          visibleSummaryPayload.grandTotal > 0
            ? visibleSummaryPayload.grandTotal
            : resolvedTotalFinal;
        const subtotalFinal = roundCurrencyValue(
          visibleSummaryPayload.commissionableGrandTotal > 0
            ? visibleSummaryPayload.commissionableGrandTotal
            : Math.max(0, totalFinal - (externalItineraryBreakdown.grandTotal || 0)),
        );
        const visibleSummaryGrandTotalForSave =
          visibleSummaryPayload.grandTotal > 0
            ? visibleSummaryPayload.grandTotal
            : totalFinal;
        cleanObjectForSerialization.finalTotal = totalFinal;
        cleanObjectForSerialization.final_total = totalFinal;
        cleanObjectForSerialization.grandTotal = totalFinal;
        cleanObjectForSerialization.grand_total = totalFinal;
        cleanObjectForSerialization.subtotalFinal = subtotalFinal;
        cleanObjectForSerialization.subtotal_final = subtotalFinal;
        cleanObjectForSerialization.commissionableSubtotal = subtotalFinal;
        cleanObjectForSerialization.commissionable_subtotal = subtotalFinal;
        cleanObjectForSerialization.visibleSummaryGrandTotal =
          visibleSummaryGrandTotalForSave;
        cleanObjectForSerialization.summaryVisibleGrandTotal =
          visibleSummaryGrandTotalForSave;
        cleanObjectForSerialization.acSummaryGrandTotal =
          visibleSummaryGrandTotalForSave;
        cleanObjectForSerialization.summaryVisibleParts =
          visibleSummaryPayload.parts;
        cleanObjectForSerialization.visibleSummaryGrandTotal =
          visibleSummaryGrandTotalForSave;
        cleanObjectForSerialization.summaryVisibleGrandTotal =
          visibleSummaryGrandTotalForSave;
        cleanObjectForSerialization.acSummaryGrandTotal =
          visibleSummaryGrandTotalForSave;
        enrichedAdditionalCosts.finalTotal = totalFinal;
        enrichedAdditionalCosts.final_total = totalFinal;
        enrichedAdditionalCosts.grandTotal = totalFinal;
        enrichedAdditionalCosts.grand_total = totalFinal;
        enrichedAdditionalCosts.subtotalFinal = subtotalFinal;
        enrichedAdditionalCosts.subtotal_final = subtotalFinal;
        enrichedAdditionalCosts.commissionableSubtotal = subtotalFinal;
        enrichedAdditionalCosts.commissionable_subtotal = subtotalFinal;
        enrichedAdditionalCosts.visibleSummaryGrandTotal =
          visibleSummaryGrandTotalForSave;
        enrichedAdditionalCosts.summaryVisibleGrandTotal =
          visibleSummaryGrandTotalForSave;
        enrichedAdditionalCosts.acSummaryGrandTotal =
          visibleSummaryGrandTotalForSave;
        const activeHotelPreviewMix =
          activeHotelConfig?.roomMixNeedsAutoRefresh === true
            ? null
            : getHotelPreviewMix(activeHotelConfig);

        const cotizacionData = {
          titulo: finalTitle,
          voucher_code: voucherCode.trim() || null,
          cantidadPersonas: passengerComposition.total,
          itinerario: cleanedItinerario,
          packageType,
          additionalCosts: sanitizeAdditionalCostsConfig(
            cleanObjectForSerialization,
          ),

          id_paquete: importedPackageInfoRef.current?.id || null,
          paquete_modificado:
            importedPackageInfoRef.current?.modificado || false,

          subtotal_individual: Number(calculatedTotals.subtotalIndividual || 0),
          hotel_adult_total: hasActiveHotelSelection
            ? Number(calculatedTotals.hotelAdultTotal || 0)
            : 0,
          hotel_child_total: hasActiveHotelSelection
            ? Number(calculatedTotals.hotelChildTotal || 0)
            : 0,
          hotel_converted_child_total: hasActiveHotelSelection
            ? Number(calculatedTotals.hotelConvertedChildTotal || 0)
            : 0,
          precio_it_adulto: Number(
            calculatedTotals.nonHotelsTotal ??
              calculatedTotals.subtotalIndividual ??
              0,
          ),
          precio_it_ninos:
            Number(peopleCount?.children || 0) > 0
              ? Number(
                  (
                    (Number(calculatedTotals.nonHotelExplicitChildTotal || 0) +
                      Number(
                        calculatedTotals.nonHotelConvertedChildTotal || 0,
                      )) /
                    Math.max(1, Number(peopleCount.children || 0))
                  ).toFixed(2),
                )
              : 0,
          precio_it_ext_adulto: Number(
            externalItineraryBreakdown.adultTotal || 0,
          ),
          precio_it_ext_ninos: Number(
            (externalItineraryBreakdown.childTotal || 0) +
              (externalItineraryBreakdown.convertedChildTotal || 0),
          ),
          total_adicionales:
            summaryTotals.additionalGrandTotal ?? summaryTotals.additionalTotal,
          total_final: totalFinal,
          subtotal_final: subtotalFinal,

          subtotal_nino: calculatedTotals.subtotalninos,
          subtotal_ninos: calculatedTotals.subtotalninos,
          igv_aplicado: calculatedTotals.hasIGV,
          igv_monto: calculatedTotals.totalIGV,
          igv_detalle: calculatedTotals.hasIGV ? "IGV aplicado" : "Sin IGV",
          igv_tasa: calculatedTotals.hasIGV ? 18 : 0,

          clientData,
          peopleDetails: currentPeopleDetails,
          peopleCount: currentPeopleCount,
          fechainicio: formData.fechainicio || null,
          fechafin: formData.fechafin || null,

          tiene_voucher: editingCotizacion?.tiene_voucher || false,
          platform: effectivePlatform || "venso",
          business_type: effectiveBusinessType || "B2C",
          agency_id: effectiveAgencyId,
          tariff_type: tariffType,
          ...(isSuperAdmin && formData.adminFechaCreacion
            ? {
                fecha: dateTimeLocalInputToIso(formData.adminFechaCreacion),
                createdat: dateTimeLocalInputToIso(formData.adminFechaCreacion),
              }
            : {}),
          ...(isSuperAdmin && formData.adminCreatedBy
            ? { createdby: formData.adminCreatedBy }
            : {}),

          // Hotel config persisted so HPM can fully restore on reload
          selectedHotel: activeHotelConfig
            ? {
                category: activeHotelConfig.category || null,
                label: activeHotelConfig.label || null,
                luxuryManual: activeHotelConfig.luxuryManual === true,
                hotelName: activeHotelConfig.hotelName || null,
                id_hotel: activeHotelConfig.id_hotel || null,
                ciudad: activeHotelConfig.ciudad || null,
                nights: activeHotelConfig.nights || 0,
                selectedNightIndices:
                  activeHotelConfig.selectedNightIndices || [],
                dayGroups: activeHotelConfig.dayGroups || [],
                mix: activeHotelPreviewMix,
                roomAssignments: activeHotelConfig.roomAssignments || null,
                roomAssignmentSummary:
                  activeHotelConfig.roomAssignmentSummary || null,
                perRoomPricing: activeHotelConfig.perRoomPricing || [],
                priceOverrides: activeHotelConfig.priceOverrides || null,
                childPricing: activeHotelConfig.childPricing || null,
                roomType: activeHotelConfig.roomType || null,
                hotelTotal: activeHotelConfig.hotelTotal || 0,
                allCategoryRows: (() => {
                  const savedLuxuryRows = filterLuxuryHotelCategoryRows(
                    activeHotelConfig.allCategoryRows || [],
                    activeHotelConfig,
                  );
                  if (
                    isLuxuryHotelSelection &&
                    Array.isArray(savedLuxuryRows) &&
                    savedLuxuryRows.length > 0
                  ) {
                    return savedLuxuryRows;
                  }
                  if (
                    !hotelPreviewRoomOptionsByCategory ||
                    !activeHotelConfig.category
                  )
                    return (
                      filterLuxuryHotelCategoryRows(
                        activeHotelConfig.allCategoryRows || [],
                        activeHotelConfig,
                      ) || null
                    );
                  const rows = filterLuxuryHotelCategoryRows(
                    buildCategoryRowsFromDict({
                      roomOptionsByCategory: hotelPreviewRoomOptionsByCategory,
                      selectedCategory: activeHotelConfig.category,
                      priceOverrides: activeHotelConfig.priceOverrides,
                      savedMix: activeHotelPreviewMix,
                      adultsCount: Math.max(
                        1,
                        (Number(peopleCount?.adults) || 1) +
                          (Number(calculatedTotals.hotelConvertedChildCount) ||
                            0),
                      ),
                      selectedNights: Array.isArray(
                        activeHotelConfig.selectedNightIndices,
                      )
                        ? activeHotelConfig.selectedNightIndices.length
                        : Number(activeHotelConfig.nights) ||
                          defaultNights ||
                          1,
                      defaultNights: defaultNights || 1,
                      subtotalIndividual:
                        Number(
                          calculatedTotals.nonHotelsTotal ??
                            calculatedTotals.subtotalIndividual,
                        ) || 0,
                      additionalCosts,
                      externalAdultTotal: externalItineraryBreakdown.adultTotal,
                      childrenCount: peopleCount?.children || 0,
                      externalChildTotal: externalItineraryBreakdown.childTotal,
                      externalConvertedChildTotal:
                        externalItineraryBreakdown.convertedChildTotal,
                      baseExplicitChildTotal:
                        calculatedTotals.nonHotelExplicitChildTotal || 0,
                      baseConvertedChildTotal:
                        calculatedTotals.nonHotelConvertedChildTotal || 0,
                      nonHotelConvertedChildTotal:
                        calculatedTotals.nonHotelConvertedChildTotal || 0,
                      baseExplicitChildTotalsById:
                        calculatedTotals.nonHotelExplicitChildTotalsById || {},
                      baseConvertedChildTotalsById:
                        calculatedTotals.nonHotelConvertedChildTotalsById || {},
                      hotelExplicitChildTotalsById:
                        calculatedTotals.hotelExplicitChildTotalsById || {},
                      hotelConvertedChildTotalsById:
                        calculatedTotals.hotelConvertedChildTotalsById || {},
                      hotelExplicitChildTotal:
                        calculatedTotals.hotelExplicitChildTotal || 0,
                      hotelConvertedChildTotal:
                        calculatedTotals.hotelConvertedChildTotal || 0,
                      hotelChildTotal:
                        calculatedTotals.hotelChildTotal ||
                        calculatedTotals.hotelExplicitChildTotal ||
                        0,
                      hotelExplicitChildCount:
                        calculatedTotals.hotelExplicitChildCount || 0,
                      hotelConvertedChildCount:
                        calculatedTotals.hotelConvertedChildCount || 0,
                    }),
                    activeHotelConfig,
                  );
                  const rowsWithPricing = attachComputedPerRoomPricingToRows(
                    rows,
                    {
                      hotelConfig: activeHotelConfig,
                      adultsCount: Math.max(
                        1,
                        Number(peopleCount?.adults || 0),
                      ),
                      childrenCount: Math.max(
                        0,
                        Number(peopleCount?.children || 0),
                      ),
                      nonHotelsTotal:
                        Number(
                          calculatedTotals.nonHotelsTotal ??
                            calculatedTotals.subtotalIndividual,
                        ) || 0,
                      nonHotelExplicitChildTotal:
                        calculatedTotals.nonHotelExplicitChildTotal || 0,
                      nonHotelConvertedChildTotal:
                        calculatedTotals.nonHotelConvertedChildTotal || 0,
                      additionalCosts,
                      nights: Array.isArray(
                        activeHotelConfig.selectedNightIndices,
                      )
                        ? activeHotelConfig.selectedNightIndices.length
                        : Number(activeHotelConfig.nights) ||
                          defaultNights ||
                          1,
                      externalAdultTotal: externalItineraryBreakdown.adultTotal,
                      peopleDetails: normalizedExternalPeopleDetails,
                    },
                  );
                  const filteredRowsWithPricing = filterLuxuryHotelCategoryRows(
                    rowsWithPricing,
                    activeHotelConfig,
                  );
                  return filteredRowsWithPricing.length > 0
                    ? filteredRowsWithPricing
                    : filterLuxuryHotelCategoryRows(
                        activeHotelConfig.allCategoryRows || [],
                        activeHotelConfig,
                      ) || null;
                })(),
              }
            : null,
          hotelsTotal,
          source_voucher: effectiveSourceVoucher || {},
          preliquidacion,
          hotel_detalle: activeHotelConfig
            ? normalizeHotelDetallePayload(
                activeHotelConfig?.hotelDetalle ||
                  editingCotizacion?.hotel_detalle ||
                  editingCotizacion?.hotelDetalle ||
                  null,
              )
            : null,
          tasa_cambio: currentTc,

          // Itinerario externo (separado del cálculo por persona/día)
          itinerario_externo:
            externalDays.length > 0 ? cleanItinerarioForDB(externalDays) : [],

          // Costos adicionales del itinerario externo
          externalAdditionalCosts,
        };

        const newCotizacion = editingCotizacion
          ? {
              id: editingCotizacion.id,
              ...cotizacionData,
            }
          : { ...cotizacionData };

        if (editingCotizacion?._postSaleEditRequest) {
          newCotizacion._postSaleEditRequest = editingCotizacion._postSaleEditRequest;
        }

        // Embed PDF reset flag so parent knows the user's choice directly
        if (resetPdf !== null) {
          newCotizacion._resetPdf = resetPdf;
        }

        // The parent owns the HTTP mutation. Awaiting it keeps this screen
        // locked until the API, passenger synchronization and cache update have
        // all completed. The draft is removed only after a confirmed save.
        await Promise.resolve(onNext(newCotizacion));
        clearCurrentDraft();
      } catch (error) {
        console.error(" Error al procesar la cotización:", error);
        alert(
          "Hubo un error al procesar la cotización. Por favor, intenta de nuevo.",
        );
      } finally {
        submitInFlightRef.current = false;
        setIsSubmitting(false);
      }
    },
    [
      days,
      titulo,
      voucherCode,
      additionalCosts,
      packageType,
      normalizedExternalPeopleDetails,
      peopleCount,
      clientData,
      editingCotizacion,
      onNext,
      calculatedTotals,
      generateDefaultTitle,
      generateUpdateTitle,
      user,
      formData,
      effectivePlatform,
      effectiveBusinessType,
      isSuperAdmin,
      hotelsTotal,
      clearCurrentDraft,
      visibleDays,
      activeHotelConfig,
      hasActiveHotelSelection,
      currentTc,
      externalDays,
      externalAdditionalCosts,
      externalItineraryBreakdown,
      importedPackageInfo,
      liveHotelPreviewHtml,
      isLuxuryHotelSelection,
      getCurrentPassengerComposition,
      isSavingFromParent,
    ],
  );

  const isSaveButtonEnabled = useMemo(() => {
    const hasTitulo = !!titulo.trim();
    const hasAdults = peopleCount.adults >= 1;
    const hasAnyServiceOrHotel = days.some(
      (d) => Array.isArray(d.servicios) && d.servicios.length > 0,
    );
    return (
      hasTitulo &&
      hasAdults &&
      hasAnyServiceOrHotel &&
      postSaleAuthorizationValid
    );
  }, [titulo, peopleCount, days, postSaleAuthorizationValid]);

  const renderSaveActions = (variant = "header") => {
    const isFooter = variant === "footer";
    const containerClass = isFooter ? "footer-save-group" : "header-save-group";
    const buttonClass = isFooter ? "nav-btn save-btn-footer" : "save-btn";

    const pdfLabel = isProcessedCotizacion
      ? isFooter
        ? "Actualizar PDF"
        : "PDF"
      : isFooter
        ? "Generar PDF"
        : "PDF";
    const saveLocked = isSubmitting || isSavingFromParent;
    const primarySaveLabel = editingCotizacion?.tiene_voucher
      ? "Guardar cambios aprobados"
      : "Guardar";

    return (
      <div className={containerClass}>
        <button
          className={buttonClass}
          onClick={() => handleSubmit(false)}
          disabled={!isSaveButtonEnabled || saveLocked}
          aria-busy={saveLocked}
          title="Guardar cambios sin generar PDF"
        >
          <MdSave />
          <span>{saveLocked ? "Guardando…" : primarySaveLabel}</span>
        </button>
        <button
          className={`${buttonClass} save-action-secondary`}
          onClick={() => handleSubmit(true)}
          disabled={!isSaveButtonEnabled || saveLocked}
          aria-busy={saveLocked}
          title="Guardar y generar/regenerar el PDF"
        >
          <MdSave />
          <span>{saveLocked ? "Guardando…" : pdfLabel}</span>
        </button>
      </div>
    );
  };

  const versionWorkingSnapshot = useMemo(() => ({
    ...(editingCotizacion || {}),
    titulo,
    title: titulo,
    voucher_code: voucherCode.trim() || null,
    cantidadpersonas: Number(peopleCount.adults || 0) + Number(peopleCount.children || 0),
    peopleCount: { ...peopleCount },
    peoplecount: { ...peopleCount },
    peopleDetails: normalizedExternalPeopleDetails,
    peopledetails: normalizedExternalPeopleDetails,
    itinerario: days,
    itinerario_externo: externalDays,
    additionalcosts: additionalCosts,
    additionalCosts,
    selectedHotel: activeHotelConfig,
    selected_hotel: activeHotelConfig,
    hotelDetalle: editingCotizacion?.hotelDetalle || editingCotizacion?.hotel_detalle,
    hotel_detalle: editingCotizacion?.hotel_detalle || editingCotizacion?.hotelDetalle,
    total_final: calculatedTotals?.grandTotal ?? calculatedTotals?.totalFinal ?? editingCotizacion?.total_final ?? 0,
    current_version: editingCotizacion?.current_version ?? editingCotizacion?.currentVersion ?? 0,
  }), [
    editingCotizacion,
    titulo,
    voucherCode,
    peopleCount,
    normalizedExternalPeopleDetails,
    days,
    externalDays,
    additionalCosts,
    activeHotelConfig,
    calculatedTotals,
  ]);

  /* ===================== RENDER ===================== */

  // Ciudades preseleccionadas para ServicePicker: memoizadas para evitar re-render
  const preselectedCitiesForPicker = useMemo(() => {
    const set = new Set();
    const d = days[currentDayIndex];
    if (d?.servicios)
      d.servicios.forEach((s) => s?.ciudad && set.add(s.ciudad));
    if (d?.ciudades) d.ciudades.forEach((c) => c && set.add(c));
    return Array.from(set);
  }, [days, currentDayIndex]);

  return (
    <div className="edicion-cotizacion-container">
      <header className="custom-header">
        <div className="quotation-header-main">
          <button
            className="header-back-btn"
            onClick={onBack || onClose}
            title="Volver a la lista"
            aria-label="Volver a cotizaciones"
          >
            <MdArrowBack />
          </button>

          <div className="header-title-container">
            <span className="quotation-header-eyebrow">
              {editingCotizacion ? "Edición de cotización" : "Nueva cotización"}
            </span>
            <input
              type="text"
              className="voucher-code-input"
              value={voucherCode}
              onChange={(e) => setVoucherCode(e.target.value)}
              placeholder="Código de file / voucher"
              maxLength={50}
              aria-label="Código de file o voucher"
            />
            <input
              type="text"
              className={`title-input ${showTitleError && !titulo.trim() ? "error" : ""}`}
              value={titulo}
              onChange={(e) => {
                setTitulo(e.target.value);
                if (e.target.value.trim()) setShowTitleError(false);
              }}
              placeholder={
                editingCotizacion
                  ? "Nombre de la cotización"
                  : "Escribe un nombre para la cotización"
              }
              autoFocus={!!editingCotizacion}
            />
            {editingCotizacion && (
              <span className="edit-indicator">
                Cotización #{editingCotizacion.id || "N/A"} · {new Date(
                  editingCotizacion.fecha || editingCotizacion.createdAt,
                ).toLocaleString()}
              </span>
            )}
          </div>

          <div className="header-right-actions">
            {editingCotizacion && (
              <button
                type="button"
                className="quotation-version-button"
                onClick={() => setShowVersionHistory(true)}
                title="Comparar el trabajo actual con sus versiones"
              >
                <MdHistory />
                <span>Versiones</span>
              </button>
            )}
            {renderSaveActions("header")}
          </div>
        </div>

      </header>

      <div className="quotation-workspace">
        <aside className="quotation-step-sidebar" aria-label="Navegación de la cotización">
          <div className="quotation-sidebar-context" aria-label="Agencia de la cotización">
            <label className="quotation-sidebar-agency">
              <span className="quotation-sidebar-agency__label">
                <MdBusinessCenter />
                <span>
                  <small>Agencia</small>
                  <strong>Catálogo de la cotización</strong>
                </span>
              </span>
              <span className="quotation-sidebar-agency__controls">
                <select
                  value={effectiveAgencyId}
                  onChange={handleQuotationAgencyChange}
                  disabled={
                    !canChangeAgency ||
                    agenciesQuery.isLoading ||
                    agencySelectOptions.length === 0
                  }
                  aria-label="Cambiar agencia de la cotización"
                  title={
                    canChangeAgency
                      ? "El catálogo de nuevas selecciones usará esta agencia"
                      : "La agencia queda bloqueada mientras la venta cerrada no tenga autorización vigente"
                  }
                >
                  {agencySelectOptions.map((agency) => (
                    <option key={agency.id} value={agency.id}>
                      {agency.name}
                    </option>
                  ))}
                </select>
                {canCreateAgency && (
                  <button
                    type="button"
                    className="quotation-sidebar-agency__add"
                    onClick={() => {
                      setAgencyCreateError(null);
                      setShowAgencyCreateForm((current) => !current);
                    }}
                    aria-expanded={showAgencyCreateForm}
                    title="Agregar una agencia al sistema"
                  >
                    {showAgencyCreateForm ? "Cerrar" : "+ Agencia"}
                  </button>
                )}
              </span>
              {showAgencyCreateForm && canCreateAgency && (
                <form
                  className="quotation-sidebar-agency__create-form"
                  onSubmit={handleCreateQuotationAgency}
                >
                  <label>
                    <span>Nueva agencia</span>
                    <input
                      value={newAgencyName}
                      onChange={(event) => setNewAgencyName(event.target.value)}
                      placeholder="Nombre de agencia"
                      autoFocus
                    />
                  </label>
                  <button type="submit" disabled={isCreatingAgency}>
                    {isCreatingAgency ? "Creando…" : "Agregar"}
                  </button>
                  {agencyCreateError && (
                    <small role="alert">{agencyCreateError}</small>
                  )}
                </form>
              )}
            </label>
          </div>

          <div className="quotation-sidebar-group">
            <span className="quotation-sidebar-label">Proceso</span>
            <nav className="quotation-step-nav">
              {STEPS_INFO.map((step, index) => {
                const StepIcon = step.icon;
                const isActive = currentStep === step.id;
                const isCompleted = stepsCompleted[step.id];
                const stepDetail =
                  step.id === STEPS.PASAJEROS
                    ? `${peopleCount.adults || 0} adulto${peopleCount.adults === 1 ? "" : "s"} · ${peopleCount.children || 0} niño${peopleCount.children === 1 ? "" : "s"}`
                    : isActive
                      ? "Sección actual"
                      : isCompleted
                        ? "Completado"
                        : "Pendiente";
                return (
                  <button
                    type="button"
                    key={step.id}
                    className={`quotation-step-button ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""}`}
                    onClick={() => {
                      if (step.id === STEPS.ITINERARIO && currentStep === STEPS.PASAJEROS) {
                        handleNavigateToItinerary();
                        return;
                      }
                      setCurrentStep(step.id);
                    }}
                    aria-current={isActive ? "step" : undefined}
                  >
                    <span className="quotation-step-button__number">
                      {isCompleted && !isActive ? <MdCheck /> : index + 1}
                    </span>
                    <StepIcon className="quotation-step-button__icon" />
                    <span className="quotation-step-button__copy">
                      <strong>{step.label}</strong>
                      <small
                        className={
                          step.id === STEPS.PASAJEROS
                            ? "quotation-step-button__passenger-count"
                            : undefined
                        }
                      >
                        {stepDetail}
                      </small>
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="quotation-sidebar-group quotation-sidebar-tools">
            <span className="quotation-sidebar-label">Opciones</span>
            <div className="quotation-tool-list">
            <button
              type="button"
              className="quotation-tool-button"
              onClick={() => setShowPreLiquidacion(true)}
              title="Abrir preliquidación"
            >
              <MdReceiptLong />
              <span><strong>Preliquidación</strong><small>Liquidación y plan de pagos</small></span>
            </button>
            {effectiveSourceVoucher && (
              <button
                type="button"
                className="quotation-tool-button"
                onClick={() => setShowSourceVoucherPreview(true)}
                title="Ver el archivo asociado al voucher"
              >
                <MdAttachFile />
                <span><strong>Archivo del voucher</strong><small>Ver archivo asociado</small></span>
              </button>
            )}
            {useVensoHotelPricing && (
              <button
                type="button"
                className={`quotation-tool-button ${hasActiveHotelSelection ? "has-selection" : ""}`}
                onClick={() => setShowHotelModal(true)}
                title={hasActiveHotelSelection ? `Hoteles · ${hotelQuoteButtonMessage}` : "Configurar hoteles Venso"}
              >
                <MdHotel />
                <span><strong>Hoteles</strong><small>{hasActiveHotelSelection ? hotelQuoteButtonMessage : "Configurar alojamiento"}</small></span>
              </button>
            )}
            <button
              type="button"
              className="quotation-tool-button"
              onClick={handleOpenResumen}
              title="Ver resumen de la cotización"
            >
              <MdSummarize />
              <span><strong>Resumen</strong><small>Vista completa y totales</small></span>
            </button>
            </div>
          </div>

        </aside>

        <div className="quotation-workspace-main">
      <div className="step-container">
        {currentStep === STEPS.PASAJEROS && (
          <div className="step-content">
            <PeopleSelection
              peopleCount={peopleCount}
              setPeopleCount={setPeopleCount}
              peopleDetails={peopleDetails}
              setPeopleDetails={setPeopleDetails}
              errors={errors}
              setErrors={setErrors}
              clientData={clientData}
              isStep={true}
              selectedPackage={selectedPackage}
            />
          </div>
        )}

        {currentStep === STEPS.ITINERARIO && (
          <div className="step-content">
            <div className="package-config-content">
              {/* Toolbar disponible en cotizaciones abiertas o con autorización vigente. */}
              {(!editingCotizacion?.tiene_voucher || postSaleAuthorizationValid) && (
                <div className="itinerary-toolbar">
                  <div className="toolbar-left">
                    <PackageTypeSelector
                      packageType={packageType}
                      setPackageType={handlePackageTypeChange}
                    />

                    <div className="dates-row">
                      <div className="date-field">
                        <label>Inicio</label>
                        <input
                          type="date"
                          value={formData.fechainicio || ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setFormData((prev) => ({
                              ...prev,
                              fechainicio: v,
                            }));
                          }}
                        />
                      </div>

                      <div className="date-field">
                        <label>
                          Fin <span className="auto-hint">(auto)</span>
                        </label>
                        <input
                          type="date"
                          value={formData.fechafin || ""}
                          readOnly
                          className="readonly-date"
                          title="Se calcula automáticamente: Fecha inicio + cantidad de días"
                        />
                      </div>

                      <div className="date-field days-indicator">
                        <label>Días</label>
                        <div className="days-pill">{days.length || 1}</div>
                      </div>
                    </div>
                  </div>

                  <div className="toolbar-right">
                    <button
                      className="toolbar-btn btn-clear-itinerary"
                      onClick={() => handleDeletePaquete()}
                      title="Eliminar paquete actual"
                    >
                      <MdImportExport /> <span>Eliminar</span>
                    </button>
                    <button
                      className="toolbar-btn btn-import-export"
                      onClick={() => setShowImportModal(true)}
                      title="Importar o exportar itinerario"
                    >
                      <MdImportExport /> <span>Importar / Exportar</span>
                    </button>
                  </div>
                </div>
              )}

              {editingCotizacion?.tiene_voucher &&
                !postSaleAuthorizationValid && (
                  <div className="locked-itinerary-banner">
                    <span>
                      Itinerario vendido — solo lectura. Use el itinerario
                      extra para agregar servicios adicionales.
                    </span>
                  </div>
                )}

              <DaysEditor
                ref={daysEditorRef}
                days={visibleDays}
                setDays={setDays}
                readOnly={
                  !!editingCotizacion?.tiene_voucher &&
                  !postSaleAuthorizationValid
                }
                onAddService={(
                  dayIndex,
                  categoryId,
                  passengerSelectionPayload = null,
                ) => {
                  setCurrentDayIndex(dayIndex);
                  setSelectedServiceCategory(categoryId);
                  setPassengerSelection(passengerSelectionPayload);
                  setReplacingServiceIndex(null);
                  setIsModalOpen(true);
                }}
                onChangeService={(dayIndex, serviceIndex, categoryId) => {
                  setCurrentDayIndex(dayIndex);
                  setSelectedServiceCategory(categoryId);
                  setReplacingServiceIndex(serviceIndex);
                  setPassengerSelection(null);
                  setIsModalOpen(true);
                }}
                onExtrasClick={(idx) => {
                  setExtraModalDayIndex(idx);
                  setShowExtraModal(true);
                }}
                peopleDetails={normalizedExternalPeopleDetails}
                tariffType={tariffType}
                platform={effectivePlatform}
                agencyId={effectiveAgencyId}
                useVensoHotelPricing={useVensoHotelPricing}
                initialTc={currentTc}
                onTcChange={setCurrentTc}
                onOpenConflictModal={null}
                importedPackageInfo={importedPackageInfo}
                perRoomPricing={
                  hasActiveHotelSelection
                    ? activeHotelConfig?.perRoomPricing || []
                    : []
                }
              />

              {/* Ya NO va HotelsSelector aquí (se maneja en modal unificado) */}
            </div>
          </div>
        )}

        {currentStep === STEPS.COSTOS && (
          <div className="step-content">
            <AdditionalCosts
              platform={effectivePlatform}
              businessType={effectiveBusinessType}
              isPrimaryAgency={isPrimaryAgency}
              additionalCosts={additionalCosts}
              setAdditionalCosts={setAdditionalCosts}
              formatCurrency={formatCurrency}
              contingencyTotal={externalItineraryTotal}
              externalAdultTotal={externalItineraryBreakdown.adultTotal}
              externalChildTotal={externalItineraryBreakdown.childTotal}
              externalConvertedChildTotal={
                externalItineraryBreakdown.convertedChildTotal
              }
              externalExplicitChildCount={
                externalItineraryBreakdown.explicitChildCount
              }
              externalConvertedChildCount={
                externalItineraryBreakdown.convertedChildCount
              }
              hotelsTotal={hasActiveHotelSelection ? hotelsTotal : 0}
              hotelChildTotal={
                hasActiveHotelSelection ? calculatedTotals.hotelChildTotal : 0
              }
              hotelExplicitChildTotal={
                hasActiveHotelSelection
                  ? calculatedTotals.hotelExplicitChildTotal || 0
                  : 0
              }
              hotelConvertedChildTotal={
                hasActiveHotelSelection
                  ? (activeHotelConfig?.hotelConvertedChildTotal ??
                    calculatedTotals.hotelConvertedChildTotal ??
                    0)
                  : 0
              }
              hotelAdultTotal={
                hasActiveHotelSelection
                  ? (activeHotelConfig?.hotelAdultTotal ??
                    calculatedTotals.hotelAdultTotal ??
                    0)
                  : 0
              }
              subtotalNinos={calculatedTotals.subtotalninos}
              nonHotelExplicitChildTotal={
                calculatedTotals.nonHotelExplicitChildTotal || 0
              }
              nonHotelConvertedChildTotal={
                calculatedTotals.nonHotelConvertedChildTotal || 0
              }
              adultsCount={peopleCount.adults || 1}
              childrenCount={peopleCount.children || 0}
              peopleDetails={normalizedExternalPeopleDetails}
              subtotalIndividual={calculatedTotals.subtotalIndividual}
              baseExplicitChildCount={
                calculatedTotals.baseExplicitChildCount || 0
              }
              baseConvertedChildCount={
                calculatedTotals.baseConvertedChildCount || 0
              }
              hotelExplicitChildCount={
                hasActiveHotelSelection
                  ? calculatedTotals.hotelExplicitChildCount || 0
                  : 0
              }
              hotelConvertedChildCount={
                hasActiveHotelSelection
                  ? calculatedTotals.hotelConvertedChildCount || 0
                  : 0
              }
              hotelPreviewHtml={liveHotelPreviewHtml}
              perRoomPricing={
                hasActiveHotelSelection
                  ? activeHotelConfig?.perRoomPricing || []
                  : []
              }
              selectedCat={
                hasActiveHotelSelection
                  ? activeHotelConfig?.category || null
                  : NO_HOTEL_CATEGORY
              }
              selectedHotel={hasActiveHotelSelection ? activeHotelConfig : null}
            />

          </div>
        )}
      </div>

      {showExternalModal && (
        <ExternalItineraryEditor
          days={externalDays}
          setDays={setExternalDays}
          mainDays={visibleDays}
          packageType={packageType}
          platform={effectivePlatform}
          peopleDetails={normalizedExternalPeopleDetails}
          peopleCount={peopleCount}
          formatCurrency={formatCurrency}
          tariffType={tariffType}
          onClose={() => setShowExternalModal(false)}
        />
      )}

      <div className="cotizacion-footer">
        <button
          className="nav-btn prev-btn"
          onClick={() =>
            setCurrentStep((prev) =>
              prev === STEPS.PASAJEROS
                ? prev
                : STEPS_ORDER[STEPS_ORDER.indexOf(prev) - 1],
            )
          }
          disabled={STEPS_ORDER.indexOf(currentStep) === 0}
        >
          <MdNavigateBefore /> Anterior
        </button>

        {(postSaleEditRequest || isSuperAdmin) && (
          <div className="cotizacion-footer__context">
            {postSaleEditRequest && (
              <div
                className={`post-sale-authorization-banner post-sale-authorization-banner--footer ${
                  postSaleAuthorizationValid ? "is-valid" : "is-expired"
                }`}
                role="status"
              >
                <span className="post-sale-authorization-banner__time">
                  {postSaleAuthorizationValid
                    ? `Vence en ${formatRemainingApprovalTime(
                        postSaleEditRequest,
                        postSaleClock,
                      )}`
                    : "Guardado bloqueado"}
                </span>
                <div
                  className="post-sale-authorization-details"
                  ref={postSaleAuthorizationDetailsRef}
                >
                  <button
                    type="button"
                    className={`post-sale-authorization-details__trigger ${
                      showPostSaleAuthorizationDetails ? "is-open" : ""
                    }`}
                    onClick={() =>
                      setShowPostSaleAuthorizationDetails((current) => !current)
                    }
                    aria-expanded={showPostSaleAuthorizationDetails}
                    aria-controls="post-sale-authorization-details-popover"
                    aria-label="Ver detalles de la autorización postventa"
                    title="Ver detalles de la autorización"
                  >
                    <MdInfoOutline />
                  </button>
                  {showPostSaleAuthorizationDetails && (
                    <div
                      id="post-sale-authorization-details-popover"
                      className="post-sale-authorization-details__popover"
                      role="dialog"
                      aria-label="Detalles de la autorización postventa"
                    >
                      <div className="post-sale-authorization-details__header">
                        <strong>Autorización postventa</strong>
                        <button
                          type="button"
                          onClick={() => setShowPostSaleAuthorizationDetails(false)}
                          aria-label="Cerrar detalles de la autorización"
                        >
                          <MdClose />
                        </button>
                      </div>
                      <dl>
                        <div>
                          <dt>Aprobado por</dt>
                          <dd>
                            {postSaleEditRequest.reviewer_name ||
                              postSaleEditRequest.reviewed_by ||
                              "Aprobación automática"}
                          </dd>
                        </div>
                        <div>
                          <dt>Motivo</dt>
                          <dd>{postSaleEditRequest.reason || "Sin motivo registrado"}</dd>
                        </div>
                      </dl>
                    </div>
                  )}
                </div>
              </div>
            )}

            {isSuperAdmin && (
              <div className="superadmin-footer-control" ref={superAdminAuditRef}>
                <button
                  type="button"
                  className={`superadmin-creation-trigger ${
                    showSuperAdminAudit ? "is-open" : ""
                  }`}
                  onClick={() => setShowSuperAdminAudit((current) => !current)}
                  aria-expanded={showSuperAdminAudit}
                  aria-controls="superadmin-creation-popover"
                  title="Editar auditoría de creación"
                >
                  <MdInfoOutline />
                  <span>Auditoría</span>
                </button>

                {showSuperAdminAudit && (
                  <div
                    id="superadmin-creation-popover"
                    className="superadmin-creation-panel superadmin-creation-panel--footer-popover"
                    aria-label="Auditoría de creación de cotización"
                  >
                    <div className="superadmin-creation-popover__header">
                      <div className="superadmin-creation-intro">
                        <span className="superadmin-creation-icon">
                          <MdInfoOutline />
                        </span>
                        <div>
                          <strong>Auditoría de creación</strong>
                          <span>Solo superadmin · sincroniza vouchers vinculados</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="superadmin-creation-popover__close"
                        onClick={() => setShowSuperAdminAudit(false)}
                        aria-label="Cerrar auditoría de creación"
                      >
                        <MdClose />
                      </button>
                    </div>

                    <div className="superadmin-creation-fields">
                      <div className="superadmin-creation-field">
                        <label htmlFor="cotizacion-created-at">Fecha de creación</label>
                        <input
                          id="cotizacion-created-at"
                          type="datetime-local"
                          value={formData.adminFechaCreacion || ""}
                          onChange={(event) =>
                            setFormData((prev) => ({
                              ...prev,
                              adminFechaCreacion: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="superadmin-creation-field">
                        <label htmlFor="cotizacion-created-by">Usuario creador</label>
                        <select
                          id="cotizacion-created-by"
                          value={formData.adminCreatedBy || ""}
                          disabled={creatorUsersLoading}
                          onChange={(event) =>
                            setFormData((prev) => ({
                              ...prev,
                              adminCreatedBy: event.target.value,
                            }))
                          }
                        >
                          <option value="">
                            {creatorUsersLoading
                              ? "Cargando usuarios..."
                              : "Seleccionar usuario"}
                          </option>
                          {currentUserIdentifier && (
                            <option value={currentUserIdentifier}>
                              Usuario actual ({currentUserIdentifier})
                            </option>
                          )}
                          {creatorUsers.map((creator) => {
                            const value = getCreatorOptionValue(creator);
                            if (!value || value === currentUserIdentifier) return null;
                            return (
                              <option key={value} value={value}>
                                {getCreatorOptionLabel(creator)}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="step-indicator">
          Paso {STEPS_ORDER.indexOf(currentStep) + 1} de {STEPS_ORDER.length}
        </div>

        {STEPS_ORDER.indexOf(currentStep) === STEPS_ORDER.length - 1 ? (
          renderSaveActions("footer")
        ) : (
          <button
            className="nav-btn next-btn"
            onClick={() => {
              if (currentStep === STEPS.PASAJEROS) {
                handleNavigateToItinerary();
              } else {
                setCurrentStep(
                  STEPS_ORDER[STEPS_ORDER.indexOf(currentStep) + 1],
                );
              }
            }}
            disabled={
              currentStep === STEPS.PASAJEROS
                ? !(peopleCount.adults > 0)
                : !(days.length > 0)
            }
          >
            Siguiente <MdNavigateNext />
          </button>
        )}
      </div>

        </div>
      </div>

      {/* ===== Modal Resumen ===== */}
      {showResumen &&
        ReactDOM.createPortal(
          <div
            className="summary-modal-overlay"
            onClick={handleCloseSummaryModal}
          >
            <div className="summary-modal" onClick={(e) => e.stopPropagation()}>
              <div className="summary-modal-header">
                <h3>Resumen de Cotización</h3>
                <button className="close-summary" onClick={handleCloseSummary}>
                  <MdClose />
                </button>
              </div>

              <div className="summary-modal-body">
                <SummaryContent
                  cotizacion={summaryDisplayData}
                  readonly={true}
                  nonHotelsTotal={calculatedTotals.nonHotelsTotal}
                />
              </div>

              <div className="summary-modal-footer">
                <button
                  className="secondary-button"
                  onClick={handleCloseSummary}
                >
                  Cerrar
                </button>
                <button className="action-button" onClick={handleCloseSummary}>
                  Aceptar
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ===== Modal Unificado Hoteles + Resumen tipo imagen ===== */}
      {useVensoHotelPricing && (
        <HotelPricingModal
        isOpen={showHotelModal}
        onClose={() => setShowHotelModal(false)}
        cotizacion={cotizacionPreviewData}
        roomOptionsByCategory={hotelPreviewRoomOptionsByCategory}
        defaultNights={defaultNights}
        additionalCfg={{
          operationalCosts: isPrimaryAgency
            ? 0
            : Number(additionalCosts.operationalCosts || 0),
          operationalMode: (
            additionalCosts.operationalMode || "fixed"
          ).toLowerCase(),
          feeVal: Number(additionalCosts.fee || 0),
          feeMode: "percentage",
          extraFee: Number(additionalCosts.extraFee || 0),
          applyAdditionalCostsToChildren:
            additionalCosts.applyAdditionalCostsToChildren !== false,
          applyOperationalCostsToChildren: isPrimaryAgency
            ? false
            : additionalCosts.applyOperationalCostsToChildren ??
              additionalCosts.applyAdditionalCostsToChildren ??
              true,
          applyFeeToChildren:
            additionalCosts.applyFeeToChildren ??
            additionalCosts.applyAdditionalCostsToChildren ??
            true,
          applyExtraFeeToChildren:
            additionalCosts.applyExtraFeeToChildren ??
            additionalCosts.applyAdditionalCostsToChildren ??
            true,
          childOperationalMode:
            additionalCosts.childOperationalMode ||
            additionalCosts.operationalMode,
          childOperationalCosts: isPrimaryAgency
            ? 0
            : additionalCosts.childOperationalCosts ??
              additionalCosts.operationalCosts,
          childFeeMode: "percentage",
          childFee: additionalCosts.childFee ?? additionalCosts.fee,
          childExtraFee:
            additionalCosts.childExtraFee ?? additionalCosts.extraFee,
        }}
        initialSelectedHotel={activeHotelConfig}
        isNewCotizacion={!editingCotizacion}
        adultCount={Number(peopleCount.adults || 0)}
        childrenCount={Number(peopleCount.children || 0)}
        peopleDetails={normalizedExternalPeopleDetails}
        externalAdultTotal={externalItineraryBreakdown.adultTotal}
        externalChildTotal={externalItineraryBreakdown.childTotal}
        externalConvertedChildTotal={
          externalItineraryBreakdown.convertedChildTotal
        }
        lockedHotelDayIndices={lockedHotelDayIndices}
        onSaveSelection={(row) => {
          const normalizedHotel = normalizeSelectedHotelConfig(
            row,
            row?.hotelDetalle ||
              row?.hotelDetalleJson ||
              row?.hotelDetalleHtml ||
              null,
          );
          setSelectedHotelConfig(normalizedHotel);
          const selectedCategory = String(
            normalizedHotel?.category || "",
          ).trim();
          if (selectedCategory) {
            setExcelPreviewCategories([selectedCategory]);
          }
          injectHotelIntoDays(normalizedHotel);
          setShowHotelModal(false);
        }}
        />
      )}

      {/* ===== Portales y modales ===== */}
      {isModalOpen &&
        ReactDOM.createPortal(
          <ServicePicker
            onSelectService={(selectedService) => {
              if (currentDayIndex !== null) {
                setDays((prevDays) => {
                  const newDays = [...prevDays];
                  if (!newDays[currentDayIndex].servicios)
                    newDays[currentDayIndex].servicios = [];
                  const serviceWithId = {
                    ...selectedService,
                    id: `service-${currentDayIndex}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    typeService:
                      selectedService.typeService ||
                      selectedService.parentService?.typeService ||
                      "otros",
                  };
                  const [initializedService] =
                    repriceServicesPreservingOperationalAssignments(
                      [serviceWithId],
                      normalizedExternalPeopleDetails,
                      { preserveExistingSelection: false },
                    );
                  if (replacingServiceIndex != null) {
                    // Replacement: copy passenger assignments from old service
                    const oldService =
                      newDays[currentDayIndex].servicios[replacingServiceIndex];
                    if (oldService) {
                      initializedService.assignedPassengerIds =
                        oldService.assignedPassengerIds || [];
                      initializedService.assignedPassengerCount =
                        oldService.assignedPassengerCount || 0;
                      initializedService.assignedPassengers =
                        oldService.assignedPassengers || [];
                      initializedService.assignedChildExplicitPriceMap =
                        oldService.assignedChildExplicitPriceMap || {};
                      initializedService.assignedChildExplicitPriceSum =
                        oldService.assignedChildExplicitPriceSum || 0;
                      initializedService.assignedChildExplicitCount =
                        oldService.assignedChildExplicitCount || 0;
                      initializedService.hasChildExplicitPrices =
                        oldService.hasChildExplicitPrices || false;
                    }
                    newDays[currentDayIndex].servicios[replacingServiceIndex] =
                      initializedService;
                  } else {
                    newDays[currentDayIndex].servicios.push(initializedService);
                  }
                  return newDays;
                });
              }
              setIsModalOpen(false);
              setSelectedServiceCategory(null);
              setReplacingServiceIndex(null);
            }}
            onClose={() => {
              setIsModalOpen(false);
              setPassengerSelection(null);
              setSelectedServiceCategory(null);
              setReplacingServiceIndex(null);
            }}
            packageType={packageType}
            serviceFilter="ventas"
            selectedDay={days[currentDayIndex]?.numero || currentDayIndex + 1}
            filterTariffType={tariffType}
            totalPassengers={
              (peopleCount.adults || 0) + (peopleCount.children || 0)
            }
            peopleDetails={normalizedExternalPeopleDetails}
            preselectedCities={preselectedCitiesForPicker}
            passengerSelection={passengerSelection}
            preselectedCategory={selectedServiceCategory}
            platform={effectivePlatform}
            agencyId={effectiveAgencyId}
          />,
          document.body,
        )}

      {showImportModal && (
        <PackageImportModal
          onClose={() => setShowImportModal(false)}
          onImport={handleImportPackage}
          onExport={handleExportPackage}
          currentItinerary={days}
          currentPackageType={packageType}
          adultCount={peopleCount.adults || 1}
          currentFee={additionalCosts?.fee ?? null}
        />
      )}

      {showExtraModal && (
        <ExtraServiceModal
          isOpen={showExtraModal}
          onClose={() => {
            setShowExtraModal(false);
            setExtraModalDayIndex(null);
          }}
          tieneFeeFilter={true}
          onSave={(extraServiceData) => {
            if (extraModalDayIndex !== null) {
              setDays((prevDays) => {
                const newDays = [...prevDays];
                if (!newDays[extraModalDayIndex].servicios)
                  newDays[extraModalDayIndex].servicios = [];
                const existing = newDays[extraModalDayIndex].servicios.find(
                  (s) => s.id === extraServiceData.id,
                );
                if (!existing) {
                  const [initializedExtra] =
                    repriceServicesPreservingOperationalAssignments(
                      [extraServiceData],
                      normalizedExternalPeopleDetails,
                      { preserveExistingSelection: false },
                    );
                  newDays[extraModalDayIndex].servicios.push(initializedExtra);
                }
                return newDays;
              });
            }
          }}
          packageType={packageType}
          existingServices={[]}
          peopleDetails={normalizedExternalPeopleDetails}
          platform={effectivePlatform}
          tariffType={tariffType}
          agencyId={effectiveAgencyId}
          fallbackAgencyId={effectiveAgencyId}
        />
      )}

      {/* [AUTO-TRANSPORT-DISABLED]
      { ===== Modal conflictos transporte ===== }
      {replacingConflictIndex === null && (
        <TransportConflictModal
          transportConflicts={transportConflicts}
          onClose={() => setTransportConflicts(null)}
          onReplace={(idx) => setReplacingConflictIndex(idx)}
          onOptimize={(idx) => handleAutoReplaceDownsized(idx)}
          onOptimizeAll={handleOptimizeAllConflicts}
          onFinalizeImport={handleFinalizeImport}
          fetchSuggestion={fetchConflictSuggestion}
        />
      )}

      { ===== ServicePicker para reemplazar transporte conflictivo ===== }
      {replacingConflictIndex !== null &&
        transportConflicts &&
        ReactDOM.createPortal(
          <ServicePicker
            onSelectService={(newService) => {
              handleReplaceConflictTransport(newService);
            }}
            onClose={() => setReplacingConflictIndex(null)}
            packageType={packageType}
            serviceFilter="ventas"
            selectedDay={
              transportConflicts.conflicts[replacingConflictIndex]?.dayNumber ||
              1
            }
            filterTariffType={tariffType}
            totalPassengers={
              (peopleCount.adults || 0) + (peopleCount.children || 0)
            }
            peopleDetails={normalizedExternalPeopleDetails}
            preselectedCategory="transportes"
            platform={effectivePlatform}
            agencyId={effectiveAgencyId}
          />
      )},
          document.body,
        )}
      */}

      {snackbar.open &&
        (() => {
          const meta = SNACKBAR_META[snackbar.severity] || SNACKBAR_META.info;
          const SnackbarIcon = meta.icon;
          return (
            <div
              className={`ec-snackbar ec-snackbar--${snackbar.severity}`}
              role={snackbar.severity === "error" ? "alert" : "status"}
            >
              <div className="ec-snackbar__icon">
                <SnackbarIcon />
              </div>
              <div className="ec-snackbar__body">
                <strong>{meta.title}</strong>
                <span>{snackbar.message}</span>
              </div>
              <button
                className="ec-snackbar__close"
                type="button"
                aria-label="Cerrar notificación"
                onClick={() =>
                  setSnackbar((prev) => ({ ...prev, open: false }))
                }
              >
                <MdClose />
              </button>
              <div className="ec-snackbar__progress" />
            </div>
          );
        })()}
      {showVersionHistory && editingCotizacion && (
        <PredecesoresExpander
          cotizacion={{ ...editingCotizacion, tiene_voucher: Boolean(editingCotizacion?.tiene_voucher) }}
          workingSnapshot={versionWorkingSnapshot}
          userRole={normalizedUserRole}
          modalMode
          allowRestore={false}
          onClose={() => setShowVersionHistory(false)}
        />
      )}

      <PreLiquidacionModal
        isOpen={showPreLiquidacion}
        onClose={() => setShowPreLiquidacion(false)}
        value={preliquidacion}
        onSave={setPreliquidacion}
        peopleDetails={peopleDetails}
        defaults={{
          code: editingCotizacion?.id || "",
          program: formData?.titulo || editingCotizacion?.titulo || "",
          agency: effectiveAgencyName,
          counter: currentUserFullName,
        }}
      />
      <SourceVoucherPreviewModal
        isOpen={showSourceVoucherPreview}
        onClose={() => setShowSourceVoucherPreview(false)}
        voucher={effectiveSourceVoucher}
      />
    </div>
  );
}

export default EdicionCotizacion;
