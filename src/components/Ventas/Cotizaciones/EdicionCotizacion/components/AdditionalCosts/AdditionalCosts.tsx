import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  MdPercent,
  MdAttachMoney,
  MdRoomService,
  MdHotel,
  MdPerson,
  MdChildCare,
} from "react-icons/md";
import { calculateCotizacionFinancialSummary } from "../../utils/cotizacionFinancialSummary";
import {
  aggregatePerRoomPricingByStayGroup,
  buildFinancialSummaryParts,
  resolveConvertedChildRoomFinancials,
  resolveChildChargeSummary,
} from "../../utils/financialDisplayHelpers";
import PassengerPriceVerification from "../PassengerPriceVerification/PassengerPriceVerification";
import { buildVisibleSummaryPayload } from "../../utils/visibleSummaryTotals";
import {
  enrichPassengerPricePartsWithRoomImpact,
  resolveRoomNationalityImpact,
} from "../../utils/passengerPricingPresentation";
import "./AdditionalCosts.scss";
import {
  buildVensoFeeSelectOptions,
  DEFAULT_VENSO_FEE_PERCENT,
} from "../../../../../../utils/packageFeeUtils";

const round2 = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const toFiniteNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const parsePreviewMoney = (value) => {
  const cleaned = String(value || "")
    .replace(/[^\d.,-]/g, "")
    .replace(/,/g, "");
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeRoomLabel = (value) =>
  String(value || "Habitacion")
    .replace(/^HABITACION\s+/i, "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const normalizePreviewRoomKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const canonicalPreviewRoomKey = (value) => {
  const normalized = normalizePreviewRoomKey(value)
    .replace(/^(adult-room-|converted-room-|unified-)/, "")
    .replace(/:\d+$/, "")
    .replace(/\s+\d+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";
  if (normalized.includes("familiar") || normalized.includes("cuad"))
    return "familiar";
  if (normalized.includes("triple")) return "triple";
  if (normalized.includes("doble") || normalized.includes("matrimonial"))
    return "doble";
  if (normalized.includes("simple")) return "simple";
  return normalized;
};

const formatPreviewCurrency = (value) =>
  `$ ${Math.ceil(Number(value || 0)).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const HOTEL_CATEGORY_GROUP_LABELS = {
  2: "2 Estándar",
  3: "3 Estándar",
  "3s": "3 Superior",
  4: "4 Estrellas",
  5: "5 Estrellas",
  ["sin-hotel"]: "Sin hotel",
};

const normalizeHotelGroupCategory = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const formatHotelGroupCategoryLabel = (category, group = {}) => {
  const normalized = normalizeHotelGroupCategory(category || group?.category);
  const base =
    HOTEL_CATEGORY_GROUP_LABELS[normalized] ||
    group?.label ||
    group?.categoryLabel ||
    (normalized ? `${String(normalized).toUpperCase()} Estrellas` : "Hotel");
  const city = String(
    group?.ciudad || group?.city || group?.hotelCity || "",
  ).trim();

  if (normalized === "5" && city) {
    return `${base} · ${city.toUpperCase()}`;
  }

  return base;
};

const getHotelGroupDayIndices = (group = {}) => {
  const source = Array.isArray(group?.dayIndices)
    ? group.dayIndices
    : Array.isArray(group?.selectedNightIndices)
      ? group.selectedNightIndices
      : Array.isArray(group?.groupDayIndices)
        ? group.groupDayIndices
        : [];

  return [...new Set(source)]
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value >= 0)
    .sort((a, b) => a - b);
};

const formatHotelGroupDaysLabel = (indices = []) => {
  const normalized = [...new Set(indices)]
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value >= 0)
    .sort((a, b) => a - b);

  if (normalized.length === 0) return "";
  return normalized.map((value) => `D${value + 1}`).join(", ");
};

const sameHotelGroupDays = (left = [], right = []) => {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((value, index) => Number(value) === Number(right[index]));
};

const resolveHotelGroupMeta = (room = {}, selectedHotel = {}, index = 0) => {
  const groups = Array.isArray(selectedHotel?.dayGroups)
    ? selectedHotel.dayGroups
    : [];
  const roomDays = getHotelGroupDayIndices(room);
  const roomGroupKey = String(room?.groupKey || room?.groupId || "").trim();
  const roomCategory = normalizeHotelGroupCategory(
    room?.groupCategory || room?.category,
  );

  const matchedIndex = groups.findIndex((group, groupIndex) => {
    const groupDays = getHotelGroupDayIndices(group);
    const groupKey = String(group?.id || group?.groupKey || "").trim();
    const generatedKey = `${normalizeHotelGroupCategory(group?.category)}-${groupIndex + 1}`;
    const groupCategory = normalizeHotelGroupCategory(group?.category);

    if (groupKey && roomGroupKey && groupKey === roomGroupKey) return true;
    if (roomGroupKey && generatedKey === roomGroupKey) return true;
    if (
      roomCategory &&
      groupCategory === roomCategory &&
      roomDays.length > 0 &&
      sameHotelGroupDays(groupDays, roomDays)
    ) {
      return true;
    }
    return false;
  });
  const matchedGroup = matchedIndex >= 0 ? groups[matchedIndex] : null;
  const fallbackOrder = Math.max(0, Number(index || 0));
  const groupOrder = matchedIndex >= 0 ? matchedIndex : fallbackOrder;
  const category =
    roomCategory ||
    normalizeHotelGroupCategory(matchedGroup?.category) ||
    normalizeHotelGroupCategory(selectedHotel?.category);
  const dayIndices =
    roomDays.length > 0 ? roomDays : getHotelGroupDayIndices(matchedGroup);
  const label = room?.groupLabel || `Grupo ${groupOrder + 1}`;
  const stableKey = [
    roomGroupKey || `${category || "hotel"}-${groupOrder + 1}`,
    dayIndices.join("-"),
  ]
    .filter(Boolean)
    .join(":");

  return {
    key: stableKey || `group-${groupOrder + 1}`,
    order: groupOrder,
    label,
    category,
    categoryLabel: formatHotelGroupCategoryLabel(
      category,
      matchedGroup || room,
    ),
    dayIndices,
    daysLabel: formatHotelGroupDaysLabel(dayIndices),
    hotelName:
      matchedGroup?.hotelName ||
      room?.hotelName ||
      selectedHotel?.hotelName ||
      "Hotel",
    city:
      matchedGroup?.ciudad ||
      matchedGroup?.city ||
      room?.ciudad ||
      room?.city ||
      selectedHotel?.ciudad ||
      selectedHotel?.city ||
      "",
  };
};

const resolveHotelGroupMetas = (selectedHotel = {}) => {
  const groups = Array.isArray(selectedHotel?.dayGroups)
    ? selectedHotel.dayGroups
    : [];

  return groups
    .map((group, index) => {
      const dayIndices = getHotelGroupDayIndices(group);
      if (!group?.category || dayIndices.length === 0) return null;
      const category = normalizeHotelGroupCategory(group.category);
      return {
        key:
          group?.id ||
          group?.groupKey ||
          `${category || "hotel"}-${index + 1}:${dayIndices.join("-")}`,
        order: index,
        label: group?.label || `Grupo ${index + 1}`,
        category,
        categoryLabel: formatHotelGroupCategoryLabel(category, group),
        dayIndices,
        daysLabel: formatHotelGroupDaysLabel(dayIndices),
        hotelName: group?.hotelName || selectedHotel?.hotelName || "Hotel",
        city: group?.ciudad || group?.city || selectedHotel?.ciudad || "",
      };
    })
    .filter(Boolean);
};

const buildHotelRoomGroupBreakdown = (
  perRoomPricing = [],
  selectedHotel = {},
  peopleDetails = {},
) => {
  const groups = new Map();

  (Array.isArray(perRoomPricing) ? perRoomPricing : []).forEach(
    (room, index) => {
      const adultBeneficiaries = Number(room?.adultBeneficiaries || 0);
      const convertedChildBeneficiaries = Number(
        room?.convertedChildBeneficiaries || 0,
      );
      if (adultBeneficiaries <= 0 && convertedChildBeneficiaries <= 0) return;

      const meta = resolveHotelGroupMeta(room, selectedHotel, index);
      const target = groups.get(meta.key) || { ...meta, rooms: [] };
      const roomLabel = normalizeRoomLabel(room?.label || room?.baseLabel);
      const nationalityImpact = resolveRoomNationalityImpact(room, peopleDetails);

      if (adultBeneficiaries > 0) {
        target.rooms.push({
          key: `${room?.key || index}-adult`,
          audience: "adult",
          label: roomLabel,
          beneficiaries: adultBeneficiaries,
          value: Number(room?.hotelPerPerson || 0),
          ...nationalityImpact,
        });
      }

      if (convertedChildBeneficiaries > 0) {
        target.rooms.push({
          key: `${room?.key || index}-child`,
          audience: "child",
          label: `Niños ${roomLabel}`,
          beneficiaries: convertedChildBeneficiaries,
          value: Number(
            room?.convertedChildHotelPerPerson || room?.hotelPerPerson || 0,
          ),
          ...nationalityImpact,
        });
      }

      groups.set(meta.key, target);
    },
  );

  return Array.from(groups.values()).sort(
    (left, right) => left.order - right.order,
  );
};

const getRoomIgvStayTotal = (room = {}) =>
  (room.roomDetails || []).reduce((sum, detail) => {
    if (!detail?.hasIgv && !detail?.tieneIgv) return sum;
    const unit = Number(
      detail.unitWithIgv ?? detail.unit ?? detail.roomUnitPrice ?? 0,
    );
    const nights =
      unit > 0
        ? Number(detail.hotelTotalRoom || 0) / unit
        : Number(room.nights || 1);
    return (
      sum + Number(detail.igvAmount || 0) * Math.max(1, Number(nights || 1))
    );
  }, 0);

const getRoomBeneficiaryCount = (room = {}) =>
  Math.max(
    0,
    Number(room?.beneficiaries || 0) ||
      (Array.isArray(room?.passengerIds) ? room.passengerIds.length : 0) ||
      Number(room?.adultBeneficiaries || 0) +
        Number(room?.convertedChildBeneficiaries || 0),
  );

const getRoomIgvPerPerson = (room = {}) => {
  const beneficiaries = getRoomBeneficiaryCount(room);
  return beneficiaries > 0
    ? round2(getRoomIgvStayTotal(room) / beneficiaries)
    : 0;
};

const AdditionalCosts = ({
  additionalCosts,
  setAdditionalCosts,
  formatCurrency,
  contingencyTotal = 0,
  externalAdultTotal = 0,
  externalChildTotal = 0,
  externalConvertedChildTotal = 0,
  externalExplicitChildCount = 0,
  externalConvertedChildCount = 0,
  hotelsTotal = 0,
  hotelChildTotal = 0,
  hotelExplicitChildTotal = null,
  hotelConvertedChildTotal = 0,
  hotelAdultTotal = 0,
  subtotalNinos = 0,
  nonHotelExplicitChildTotal = null,
  nonHotelConvertedChildTotal = 0,
  adultsCount = 1,
  childrenCount = 0,
  subtotalIndividual = 0,
  baseExplicitChildCount = 0,
  baseConvertedChildCount = 0,
  hotelExplicitChildCount = 0,
  hotelConvertedChildCount = 0,
  hotelPreviewHtml = "",
  perRoomPricing = [],
  selectedCat = null,
  selectedHotel = null,
  peopleDetails = {},
  platform = "venso",
  businessType = "B2C",
  isPrimaryAgency = false,
}) => {
  // Venso mantiene un selector estándar desde 25%, pero un paquete importado
  // puede traer un fee promocional menor o decimal. No se fuerza el valor al
  // catálogo: se conserva exactamente dentro del rango 0..100.
  const normalizeFee = (value) => {
    const numeric = Number.parseFloat(value);
    if (!Number.isFinite(numeric)) return DEFAULT_VENSO_FEE_PERCENT;
    return Math.min(
      100,
      Math.max(
        0,
        Math.round((numeric + Number.EPSILON) * 100) / 100,
      ),
    );
  };

  const feePercentOptions = useMemo(
    () => buildVensoFeeSelectOptions(additionalCosts?.fee),
    [additionalCosts?.fee],
  );

  const [operationalMode, setOperationalMode] = useState(
    additionalCosts?.operationalMode || "fixed",
  );
  const feeMode = "percentage";

  // Refs de control
  const isUpdating = useRef(false);
  const isMounted = useRef(false);

  // Asegurar estructura mínima al montar
  useEffect(() => {
    if (isUpdating.current) return;

    try {
      isUpdating.current = true;

      setAdditionalCosts((prev) => ({
        ...prev,
        operationalCosts: isPrimaryAgency
          ? "0"
          : String(prev?.operationalCosts ?? "0"),
        operationalMode: prev?.operationalMode ?? operationalMode ?? "fixed",
        fee: String(normalizeFee(prev?.fee ?? DEFAULT_VENSO_FEE_PERCENT)),
        extraFee: prev?.extraFee ?? "0",
        feeMode: "percentage",
        applyAdditionalCostsToChildren: true,
        applyOperationalCostsToChildren: !isPrimaryAgency,
        applyFeeToChildren: true,
        applyExtraFeeToChildren: true,
        childOperationalMode:
          prev?.operationalMode ?? operationalMode ?? "fixed",
        childOperationalCosts: isPrimaryAgency
          ? "0"
          : String(prev?.operationalCosts ?? "0"),
        childFeeMode: "percentage",
        childFee: String(normalizeFee(prev?.fee ?? DEFAULT_VENSO_FEE_PERCENT)),
        childExtraFee: prev?.extraFee ?? "0",
      }));

      if (!isMounted.current) isMounted.current = true;
    } finally {
      isUpdating.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincronizar operationalMode si cambia desde props
  useEffect(() => {
    if (isUpdating.current) return;

    try {
      isUpdating.current = true;

      if (
        additionalCosts?.operationalMode &&
        additionalCosts.operationalMode !== operationalMode
      ) {
        setOperationalMode(additionalCosts.operationalMode);
      }

      if (
        additionalCosts?.feeMode !== "percentage" ||
        additionalCosts?.childFeeMode !== "percentage" ||
        (isPrimaryAgency &&
          (Number(additionalCosts?.operationalCosts || 0) !== 0 ||
            Number(additionalCosts?.childOperationalCosts || 0) !== 0))
      ) {
        setAdditionalCosts((prev) => ({
          ...prev,
          operationalCosts: isPrimaryAgency
            ? "0"
            : String(prev?.operationalCosts ?? "0"),
          childOperationalCosts: isPrimaryAgency
            ? "0"
            : String(prev?.childOperationalCosts ?? prev?.operationalCosts ?? "0"),
          applyOperationalCostsToChildren: !isPrimaryAgency,
          feeMode: "percentage",
          childFeeMode: "percentage",
        }));
      }

      if (!isMounted.current) isMounted.current = true;
    } finally {
      isUpdating.current = false;
    }
  }, [
    additionalCosts,
    feeMode,
    isPrimaryAgency,
    operationalMode,
    setAdditionalCosts,
  ]);

  // Persistir modos
  useEffect(() => {
    if (!isMounted.current || isUpdating.current) return;

    try {
      isUpdating.current = true;

      setAdditionalCosts((prev) => ({
        ...prev,
        operationalMode,
        feeMode,
      }));
    } finally {
      setTimeout(() => {
        isUpdating.current = false;
      }, 0);
    }
  }, [feeMode, operationalMode, setAdditionalCosts]);

  // Helpers
  const calculatePercentageValue = (percentage, total) => {
    const p = parseFloat(percentage);
    const t = parseFloat(total);
    if (!Number.isFinite(p) || !Number.isFinite(t)) return 0;
    return round2((p * t) / 100);
  };

  // Handlers
  const handleOperationalCostsChange = (e) => {
    const value = e.target.value;
    setAdditionalCosts((prev) => ({
      ...prev,
      operationalCosts: value,
      operationalMode: operationalMode,
      childOperationalCosts: value,
      childOperationalMode: operationalMode,
      applyAdditionalCostsToChildren: true,
      applyOperationalCostsToChildren: !isPrimaryAgency,
    }));
  };

  const setFeePercent = (value) => {
    const nextValue = String(normalizeFee(value));
    setAdditionalCosts((prev) => ({
      ...prev,
      fee: nextValue,
      feeMode: "percentage",
      childFee: nextValue,
      childFeeMode: "percentage",
      applyAdditionalCostsToChildren: true,
      applyFeeToChildren: true,
    }));
  };

  const handleFeeChange = (e) => {
    setFeePercent(e.target.value);
  };

  const handleCustomFeeClick = () => {
    const current = additionalCosts?.fee || String(DEFAULT_VENSO_FEE_PERCENT);
    const raw = window.prompt(
      "Ingresa el fee porcentual (puede ser menor a 25)",
      current,
    );
    if (raw === null) return;
    setFeePercent(raw);
  };

  const handleExtraFeeChange = (e) => {
    const value = e.target.value;
    setAdditionalCosts((prev) => ({
      ...prev,
      extraFee: value,
      childExtraFee: value,
      applyAdditionalCostsToChildren: true,
      applyExtraFeeToChildren: true,
    }));
  };

  const applyAdditionalCostsToChildren = true;
  const applyOperationalCostsToChildren = !isPrimaryAgency;
  const applyFeeToChildren = true;
  const applyExtraFeeToChildren = true;
  const childOperationalMode = operationalMode;
  const childFeeMode = "percentage";
  const hasPerFeeChildPolicy =
    Object.prototype.hasOwnProperty.call(
      additionalCosts || {},
      "applyOperationalCostsToChildren",
    ) ||
    Object.prototype.hasOwnProperty.call(
      additionalCosts || {},
      "applyFeeToChildren",
    ) ||
    Object.prototype.hasOwnProperty.call(
      additionalCosts || {},
      "applyExtraFeeToChildren",
    );
  const shouldCalculateChildAdditional =
    hasPerFeeChildPolicy || applyAdditionalCostsToChildren;

  const rawHotelPerRoomPricing = useMemo(
    () => (Array.isArray(perRoomPricing) ? perRoomPricing : []),
    [perRoomPricing],
  );

  const hasHotelPricingInput = useMemo(() => {
    const selected = selectedHotel && typeof selectedHotel === "object"
      ? selectedHotel
      : null;
    const selectedCategory = String(
      selected?.category || selectedCat || "",
    )
      .trim()
      .toLowerCase();
    const hasRealCategory =
      selectedCategory !== "" && selectedCategory !== "sin-hotel";
    if (!selected || !hasRealCategory) {
      return false;
    }

    const hasSelectedHotel =
      Boolean(selected) &&
      hasRealCategory &&
      (Boolean(selected?.id_hotel || selected?.hotelId) ||
        Boolean(String(selected?.hotelName || "").trim()) ||
        (Array.isArray(selected?.dayGroups) &&
          selected.dayGroups.length > 0) ||
        (Array.isArray(selected?.perRoomPricing) &&
          selected.perRoomPricing.length > 0));
    const hasRoomPricing = rawHotelPerRoomPricing.some((room) => {
      const beneficiaries =
        toFiniteNumber(room?.beneficiaries) +
        toFiniteNumber(room?.adultBeneficiaries) +
        toFiniteNumber(room?.convertedChildBeneficiaries);
      const money =
        toFiniteNumber(room?.hotelPerPerson) +
        toFiniteNumber(room?.hotelTotalRoom) +
        toFiniteNumber(room?.convertedChildHotelPerPerson);
      return beneficiaries > 0 || money > 0;
    });
    const hasHotelMoney = [
      hotelsTotal,
      hotelAdultTotal,
      hotelChildTotal,
      hotelExplicitChildTotal,
      hotelConvertedChildTotal,
    ].some((value) => toFiniteNumber(value) > 0);

    return hasSelectedHotel || hasRoomPricing || hasHotelMoney;
  }, [
    hotelAdultTotal,
    hotelChildTotal,
    hotelConvertedChildTotal,
    hotelExplicitChildTotal,
    hotelsTotal,
    rawHotelPerRoomPricing,
    selectedCat,
    selectedHotel,
  ]);

  const effectiveHotelsTotal = hasHotelPricingInput
    ? toFiniteNumber(hotelsTotal)
    : 0;
  const effectiveHotelAdultTotal = hasHotelPricingInput
    ? toFiniteNumber(hotelAdultTotal)
    : 0;
  const effectiveHotelChildTotal = hasHotelPricingInput
    ? toFiniteNumber(hotelChildTotal)
    : 0;
  const effectiveHotelConvertedChildTotal = hasHotelPricingInput
    ? toFiniteNumber(hotelConvertedChildTotal)
    : 0;
  const effectiveHotelExplicitChildCount = hasHotelPricingInput
    ? toFiniteNumber(hotelExplicitChildCount)
    : 0;
  const effectiveHotelConvertedChildCount = hasHotelPricingInput
    ? toFiniteNumber(hotelConvertedChildCount)
    : 0;

  const toggleMode = (_field, currentMode) => {
    if (isPrimaryAgency) return;
    const newMode = currentMode === "percentage" ? "fixed" : "percentage";
    setOperationalMode(newMode);

    setAdditionalCosts((prev) => {
      const rawValue = prev.operationalCosts;
      const effectiveAdults = Math.max(1, Number(adultsCount || 0));
      const hotelPerAdultConv =
        effectiveAdults > 0 ? round2(hotelAdultTotal / effectiveAdults) : 0;
      const conversionBase = round2(
        (subtotalIndividual || 0) + (hotelPerAdultConv || 0),
      );
      let nextValue = rawValue;

      if (rawValue) {
        nextValue =
          newMode === "fixed"
            ? calculatePercentageValue(rawValue, conversionBase).toFixed(2)
            : conversionBase > 0
              ? ((parseFloat(rawValue) / conversionBase) * 100).toFixed(2)
              : "0";
      }

      return {
        ...prev,
        operationalCosts: nextValue,
        operationalMode: newMode,
        childOperationalCosts: nextValue,
        childOperationalMode: newMode,
        applyAdditionalCostsToChildren: true,
        applyOperationalCostsToChildren: !isPrimaryAgency,
      };
    });
  };

  // Cálculos
  const summaryTotals = useMemo(
    () =>
      calculateCotizacionFinancialSummary({
        subtotalIndividual,
        adultsCount,
        childrenCount,
        hotelsTotal: effectiveHotelsTotal,
        hotelAdultTotal: effectiveHotelAdultTotal,
        hotelChildTotal: effectiveHotelChildTotal,
        hotelConvertedChildTotal: effectiveHotelConvertedChildTotal,
        subtotalNinos,
        externalAdultTotal,
        externalChildTotal,
        externalConvertedChildTotal,
        externalExplicitChildCount,
        externalConvertedChildCount,
        baseExplicitChildCount,
        baseConvertedChildCount,
        hotelExplicitChildCount: effectiveHotelExplicitChildCount,
        hotelConvertedChildCount: effectiveHotelConvertedChildCount,
        nonHotelExplicitChildTotal,
        nonHotelConvertedChildTotal,
        additionalCosts: {
          operationalCosts: isPrimaryAgency
            ? "0"
            : additionalCosts?.operationalCosts,
          operationalMode,
          fee: additionalCosts?.fee ?? "0",
          feeMode,
          extraFee: additionalCosts?.extraFee,
          applyAdditionalCostsToChildren: true,
          applyOperationalCostsToChildren: !isPrimaryAgency,
          applyFeeToChildren: true,
          applyExtraFeeToChildren: true,
          childOperationalMode: operationalMode,
          childOperationalCosts: isPrimaryAgency
            ? "0"
            : additionalCosts?.operationalCosts,
          childFeeMode: feeMode,
          childFee: additionalCosts?.fee,
          childExtraFee: additionalCosts?.extraFee,
        },
      }),
    [
      additionalCosts?.extraFee,
      additionalCosts?.fee,
      additionalCosts?.operationalCosts,
      applyAdditionalCostsToChildren,
      applyOperationalCostsToChildren,
      applyFeeToChildren,
      applyExtraFeeToChildren,
      additionalCosts?.childOperationalCosts,
      additionalCosts?.childFee,
      additionalCosts?.childExtraFee,
      childOperationalMode,
      childFeeMode,
      adultsCount,
      baseConvertedChildCount,
      baseExplicitChildCount,
      childrenCount,
      externalAdultTotal,
      externalChildTotal,
      externalConvertedChildTotal,
      externalExplicitChildCount,
      externalConvertedChildCount,
      feeMode,
      effectiveHotelAdultTotal,
      effectiveHotelChildTotal,
      effectiveHotelConvertedChildCount,
      effectiveHotelConvertedChildTotal,
      effectiveHotelExplicitChildCount,
      effectiveHotelsTotal,
      nonHotelConvertedChildTotal,
      nonHotelExplicitChildTotal,
      operationalMode,
      subtotalIndividual,
      subtotalNinos,
    ],
  );

  const hotelPerAdult = summaryTotals.hotelPerAdult;
  const percentageBase = summaryTotals.percentageBase;
  const operationalAmount = summaryTotals.operationalAmount;
  const feeAmount = summaryTotals.feeAmount;
  const extraFeeAmount = summaryTotals.extraFeeAmount;
  const childOperationalAmount = summaryTotals.childOperationalAmount || 0;
  const childFeeAmount = summaryTotals.childFeeAmount || 0;
  const childExtraFeeAmount = summaryTotals.childExtraFeeAmount || 0;
  const totalAdditional = summaryTotals.totalAdditionalPerAdult;
  const contingencyAmount = summaryTotals.externalItineraryTotal;
  const externalAdultAmount = summaryTotals.externalAdultTotal;
  const externalChildAmount = summaryTotals.externalChildTotal;
  const externalConvertedChildAmount =
    summaryTotals.externalConvertedChildTotal;
  const externalUnifiedChildAmount = round2(
    externalChildAmount + externalConvertedChildAmount,
  );
  const hasExternalItineraryAmount =
    round2(
      externalAdultAmount + externalChildAmount + externalConvertedChildAmount,
    ) > 0;
  const adultSummaryTotal = summaryTotals.perAdultVisibleTotal;

  // Non-hotel children (for Services breakdown display)
  const fallbackNonHotelChildTotal = round2(summaryTotals.nonHotelChildTotal);
  const resolvedNonHotelExplicitChildTotal = Math.max(
    0,
    nonHotelExplicitChildTotal ??
      fallbackNonHotelChildTotal - (nonHotelConvertedChildTotal || 0),
  );
  const resolvedHotelExplicitChildTotal = hasHotelPricingInput
    ? Math.max(
        0,
        hotelExplicitChildTotal ?? summaryTotals.hotelExplicitChildTotal,
      )
    : 0;

  const childChargeSummary = resolveChildChargeSummary({
    childrenCount,
    baseExplicitChildCount,
    baseConvertedChildCount,
    hotelExplicitChildCount: effectiveHotelExplicitChildCount,
    hotelConvertedChildCount: effectiveHotelConvertedChildCount,
    nonHotelExplicitChildTotal: resolvedNonHotelExplicitChildTotal,
    nonHotelConvertedChildTotal,
    hotelExplicitChildTotal: resolvedHotelExplicitChildTotal,
    hotelConvertedChildTotal: effectiveHotelConvertedChildTotal,
  });
  const totalConvertedChildCount = childChargeSummary.convertedCount;
  const effectiveUnifiedChildCount =
    summaryTotals.perUnifiedChildTotal > 0
      ? Math.max(0, Number(childrenCount || 0), childChargeSummary.unifiedCount)
      : childChargeSummary.unifiedCount;

  // Per-child amounts for display
  const totalExplicitChildCount = childChargeSummary.explicitCount;
  const perExplicitChild = childChargeSummary.explicitPerChild;
  const perConvertedChild = childChargeSummary.convertedPerChild;
  const childDisplayDenominator = Math.max(
    1,
    Number(childrenCount || 0),
    totalExplicitChildCount,
    totalConvertedChildCount,
  );
  const nonHotelExplicitPerChild =
    resolvedNonHotelExplicitChildTotal > 0
      ? round2(resolvedNonHotelExplicitChildTotal / childDisplayDenominator)
      : 0;
  const nonHotelConvertedPerChild =
    Number(nonHotelConvertedChildTotal || 0) > 0
      ? round2(
          Number(nonHotelConvertedChildTotal || 0) / childDisplayDenominator,
        )
      : 0;
  const unifiedNonHotelChildPerChild = round2(
    nonHotelExplicitPerChild + nonHotelConvertedPerChild,
  );
  const unifiedChildCount = Math.max(
    totalExplicitChildCount,
    totalConvertedChildCount,
    Number(childrenCount || 0),
  );
  const explicitChildVisibleTotal =
    summaryTotals.perExplicitChildVisibleTotal ||
    (perExplicitChild > 0 ? Math.ceil(perExplicitChild) : 0);
  const convertedChildVisibleTotal =
    summaryTotals.perConvertedChildVisibleTotal ||
    (perConvertedChild > 0 ? Math.ceil(perConvertedChild) : 0);
  const unifiedChildVisibleTotal =
    summaryTotals.perUnifiedChildVisibleTotal ||
    (childChargeSummary.unifiedPerChild > 0
      ? Math.ceil(childChargeSummary.unifiedPerChild)
      : 0);

  const calculateTypedAdditionalForBase = useMemo(
    () =>
      (base, audience = "adult") => {
        const safeBase = round2(base);
        const isChild = audience === "child";
        const opMode =
          isChild && !applyOperationalCostsToChildren
            ? childOperationalMode
            : operationalMode;
        const feeCalcMode =
          isChild && !applyFeeToChildren ? childFeeMode : feeMode;
        const opValue = parsePreviewMoney(
          isChild && !applyOperationalCostsToChildren
            ? additionalCosts?.childOperationalCosts
            : additionalCosts?.operationalCosts,
        );
        const feeValue = parsePreviewMoney(
          isChild && !applyFeeToChildren
            ? additionalCosts?.childFee
            : additionalCosts?.fee,
        );
        const extraValue = parsePreviewMoney(
          isChild && !applyExtraFeeToChildren
            ? additionalCosts?.childExtraFee
            : additionalCosts?.extraFee,
        );
        const operational =
          opMode === "percentage"
            ? round2((opValue * safeBase) / 100)
            : round2(opValue);
        const fee =
          feeCalcMode === "percentage"
            ? round2((feeValue * safeBase) / 100)
            : round2(feeValue);
        const extra = round2(extraValue);

        return {
          operational,
          fee,
          extra,
          // Para el subtotal comisionable solo interviene el Fee.
          // G. administrativos y contingencia siguen sumando al total final,
          // pero no deben incrementar subtotal_final ni comisiones.
          commissionable: round2(fee),
          total: round2(operational + fee + extra),
        };
      },
    [
      additionalCosts?.extraFee,
      additionalCosts?.fee,
      additionalCosts?.operationalCosts,
      additionalCosts?.childExtraFee,
      additionalCosts?.childFee,
      additionalCosts?.childOperationalCosts,
      applyExtraFeeToChildren,
      applyFeeToChildren,
      applyOperationalCostsToChildren,
      childFeeMode,
      childOperationalMode,
      feeMode,
      isPrimaryAgency,
      operationalMode,
    ],
  );

  const calculateAdditionalForBase = useMemo(
    () => (base) => calculateTypedAdditionalForBase(base, "adult"),
    [calculateTypedAdditionalForBase],
  );

  const calculateChildAdditionalForBase = useMemo(
    () => (base) => calculateTypedAdditionalForBase(base, "child"),
    [calculateTypedAdditionalForBase],
  );

  const aggregatedHotelPerRoomPricing = useMemo(
    () => aggregatePerRoomPricingByStayGroup(rawHotelPerRoomPricing),
    [rawHotelPerRoomPricing],
  );
  const effectiveHotelPerRoomPricing =
    hasHotelPricingInput && aggregatedHotelPerRoomPricing.length > 0
      ? aggregatedHotelPerRoomPricing
      : hasHotelPricingInput
        ? rawHotelPerRoomPricing
        : [];
  const effectiveHotelPreviewHtml = hasHotelPricingInput
    ? hotelPreviewHtml
    : "";
  const hotelGroupMetas = useMemo(
    () => (hasHotelPricingInput ? resolveHotelGroupMetas(selectedHotel) : []),
    [hasHotelPricingInput, selectedHotel],
  );
  const hotelGroupMetaSummary = useMemo(
    () =>
      hotelGroupMetas
        .map((group) =>
          [group.label, group.categoryLabel, group.daysLabel]
            .filter(Boolean)
            .join(" · "),
        )
        .join("  |  "),
    [hotelGroupMetas],
  );
  const hotelGroupBreakdown = useMemo(
    () =>
      hasHotelPricingInput
        ? buildHotelRoomGroupBreakdown(
            rawHotelPerRoomPricing,
            selectedHotel,
            peopleDetails,
          )
        : [],
    [hasHotelPricingInput, peopleDetails, rawHotelPerRoomPricing, selectedHotel],
  );

  const hotelRoomAdultParts = useMemo(() => {
    if (effectiveHotelPerRoomPricing.length > 0) {
      return effectiveHotelPerRoomPricing
        .map((room, index) => {
          const beneficiaries = Number(
            room?.adultBeneficiaries ?? room?.beneficiaries ?? 0,
          );
          if (beneficiaries <= 0) return null;
          // Recompute adicionales live from current fee so Excel stays in sync
          const hotelShare = Number(room?.hotelPerPerson || 0);
          const liveBase = round2(subtotalIndividual + hotelShare);
          const liveAdditional = calculateAdditionalForBase(liveBase);
          const roomBaseTotal = round2(liveBase + liveAdditional.total);
          const commissionableValue = round2(
            liveBase + (liveAdditional.commissionable ?? liveAdditional.fee ?? 0),
          );

          return {
            key: `adult-room-${room?.key || index}`,
            icon: MdHotel,
            label:
              beneficiaries > 0
                ? `${normalizeRoomLabel(room?.label)} (${beneficiaries})`
                : normalizeRoomLabel(room?.label),
            value: round2(roomBaseTotal + externalAdultAmount),
            commissionableValue,
            beneficiaries,
            className: "ac__summary-total-pill--adult",
          };
        })
        .filter(Boolean);
    }

    if (!effectiveHotelPreviewHtml || typeof DOMParser === "undefined") return [];

    try {
      const doc = new DOMParser().parseFromString(
        effectiveHotelPreviewHtml,
        "text/html",
      );
      const selectedAdultRow =
        doc.querySelector(
          '[data-preview-selected-row="true"][data-preview-price-kind="adult"]',
        ) ||
        doc.querySelector('[data-preview-price-kind="adult"]') ||
        doc.querySelector("[data-preview-price-row]");

      if (!selectedAdultRow) return [];

      return Array.from(
        selectedAdultRow.querySelectorAll(
          '[data-preview-price-value$="-adult"]',
        ),
      )
        .map((cell, index) => {
          const value = parsePreviewMoney(cell.textContent);
          if (value <= 0) return null;

          const label = normalizeRoomLabel(
            cell.getAttribute("data-hpm-room-label") ||
              cell.getAttribute("data-hpm-room-key"),
          );
          const beneficiaries = Number(
            cell.getAttribute("data-hpm-room-adult-beneficiaries") ||
              cell.getAttribute("data-hpm-room-beneficiaries") ||
              0,
          );
          if (beneficiaries <= 0) return null;

          return {
            key: `adult-room-${cell.getAttribute("data-hpm-room-key") || index}`,
            icon: MdHotel,
            label: beneficiaries > 0 ? `${label} (${beneficiaries})` : label,
            value,
            commissionableValue: Math.max(0, round2(value - externalAdultAmount)),
            beneficiaries,
            className: "ac__summary-total-pill--adult",
          };
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }, [
    externalAdultAmount,
    effectiveHotelPreviewHtml,
    effectiveHotelPerRoomPricing,
    calculateAdditionalForBase,
    subtotalIndividual,
  ]);

  const hotelRoomHotelParts = useMemo(() => {
    if (effectiveHotelPerRoomPricing.length > 0) {
      return effectiveHotelPerRoomPricing
        .map((room, index) => {
          const beneficiaries = Number(room?.adultBeneficiaries || 0);
          if (beneficiaries <= 0) return null;

          const igvPerPerson = getRoomIgvPerPerson(room);
          const nationalityImpact = resolveRoomNationalityImpact(
            room,
            peopleDetails,
          );

          return {
            key: `hotel-room-${room?.key || index}`,
            label: normalizeRoomLabel(room?.label),
            value: Number(room?.hotelPerPerson || 0),
            igvTotal: round2(getRoomIgvStayTotal(room)),
            igvPerPerson,
            hotelBasePerPerson: Math.max(
              0,
              round2(Number(room?.hotelPerPerson || 0) - igvPerPerson),
            ),
            beneficiaries,
            ...nationalityImpact,
          };
        })
        .filter(Boolean);
    }

    if (!effectiveHotelPreviewHtml || typeof DOMParser === "undefined") return [];

    try {
      const doc = new DOMParser().parseFromString(
        effectiveHotelPreviewHtml,
        "text/html",
      );
      const selectedAdultRow =
        doc.querySelector(
          '[data-preview-selected-row="true"][data-preview-price-kind="adult"]',
        ) ||
        doc.querySelector('[data-preview-price-kind="adult"]') ||
        doc.querySelector("[data-preview-price-row]");

      if (!selectedAdultRow) return [];

      return Array.from(
        selectedAdultRow.querySelectorAll(
          '[data-preview-price-value$="-adult"]',
        ),
      )
        .map((cell, index) => {
          const value = Number(cell.getAttribute("data-hpm-hotel-share") || 0);
          if (!Number.isFinite(value) || value <= 0) return null;

          const label = normalizeRoomLabel(
            cell.getAttribute("data-hpm-room-label") ||
              cell.getAttribute("data-hpm-room-key"),
          );
          const beneficiaries = Number(
            cell.getAttribute("data-hpm-room-adult-beneficiaries") ||
              cell.getAttribute("data-hpm-room-beneficiaries") ||
              0,
          );
          if (beneficiaries <= 0) return null;

          return {
            key: `hotel-room-${cell.getAttribute("data-hpm-room-key") || index}`,
            label,
            value,
            beneficiaries,
          };
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }, [effectiveHotelPerRoomPricing, effectiveHotelPreviewHtml, peopleDetails]);

  const hotelRoomConvertedParts = useMemo(() => {
    if (effectiveHotelPerRoomPricing.length > 0) {
      return effectiveHotelPerRoomPricing
        .map((room, index) => {
          const beneficiaries = Number(room?.convertedChildBeneficiaries || 0);
          if (beneficiaries <= 0) return null;

          const igvPerPerson = getRoomIgvPerPerson(room);
          const hotelPerPerson = Number(
            room?.convertedChildHotelPerPerson || room?.hotelPerPerson || 0,
          );
          const nationalityImpact = resolveRoomNationalityImpact(
            room,
            peopleDetails,
          );

          return {
            key: `converted-room-${room?.key || index}`,
            icon: MdChildCare,
            label: `Niños ${normalizeRoomLabel(room?.label)} (${beneficiaries})`,
            value: hotelPerPerson,
            igvTotal: round2(getRoomIgvStayTotal(room)),
            igvPerPerson,
            hotelBasePerPerson: Math.max(
              0,
              round2(hotelPerPerson - igvPerPerson),
            ),
            finalValue:
              Number(
                room?.convertedChildDisplayTotalPerPerson ||
                  room?.convertedChildTotalPerPerson ||
                  0,
              ) + externalUnifiedChildAmount,
            beneficiaries,
            className: "ac__summary-total-pill--child",
            ...nationalityImpact,
          };
        })
        .filter(Boolean);
    }

    if (!effectiveHotelPreviewHtml || typeof DOMParser === "undefined") return [];

    try {
      const doc = new DOMParser().parseFromString(
        effectiveHotelPreviewHtml,
        "text/html",
      );
      const selectedAdultRow = doc.querySelector(
        '[data-preview-selected-row="true"][data-preview-price-kind="adult"]',
      );
      const selectedCategory = selectedAdultRow?.getAttribute(
        "data-preview-price-row",
      );
      if (!selectedCategory) return [];

      const convertedRow = doc.querySelector(
        `[data-preview-price-row="${selectedCategory}-child"]`,
      );
      if (!convertedRow) return [];

      return Array.from(
        convertedRow.querySelectorAll('[data-preview-price-value$="-child"]'),
      )
        .map((cell, index) => {
          const value = parsePreviewMoney(cell.textContent);
          if (value <= 0) return null;

          const label = normalizeRoomLabel(
            cell.getAttribute("data-hpm-room-label") ||
              cell.getAttribute("data-hpm-room-key"),
          );
          const beneficiaries = Number(
            cell.getAttribute("data-hpm-room-converted-beneficiaries") ||
              cell.getAttribute("data-hpm-room-beneficiaries") ||
              0,
          );
          if (beneficiaries <= 0) return null;

          return {
            key: `converted-room-${cell.getAttribute("data-hpm-room-key") || index}`,
            icon: MdChildCare,
            label: `Niños ${label} (${beneficiaries})`,
            value,
            includesExplicitChild: true,
            beneficiaries,
            className: "ac__summary-total-pill--child",
          };
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }, [
    effectiveHotelPerRoomPricing,
    externalUnifiedChildAmount,
    effectiveHotelPreviewHtml,
    peopleDetails,
  ]);

  const buildAdditionalLabel = useMemo(
    () =>
      ({ audience = "adult" } = {}) => {
        const isChild = audience === "child";
        const useAdultOperational = isChild
          ? applyOperationalCostsToChildren
          : true;
        const useAdultFee = isChild ? applyFeeToChildren : true;
        const useAdultExtra = isChild ? applyExtraFeeToChildren : true;
        const resolvedOperationalMode = useAdultOperational
          ? operationalMode
          : childOperationalMode;
        const resolvedFeeMode = useAdultFee ? feeMode : childFeeMode;
        const feeVal = parseFloat(
          useAdultFee
            ? additionalCosts?.fee || 0
            : (additionalCosts?.childFee ?? additionalCosts?.fee ?? 0),
        );
        const opVal = isPrimaryAgency
          ? 0
          : parseFloat(
              useAdultOperational
                ? additionalCosts?.operationalCosts || 0
                : (additionalCosts?.childOperationalCosts ??
                    additionalCosts?.operationalCosts ??
                    0),
            );
        const extraVal = parseFloat(
          useAdultExtra
            ? additionalCosts?.extraFee || 0
            : (additionalCosts?.childExtraFee ??
                additionalCosts?.extraFee ??
                0),
        );
        const parts = [];
        if (feeVal > 0) {
          parts.push(
            resolvedFeeMode === "percentage"
              ? `Fee (${feeVal % 1 === 0 ? feeVal : feeVal}%)`
              : `Fee`,
          );
        }
        if (opVal > 0) {
          parts.push(
            resolvedOperationalMode === "percentage"
              ? `Fee agencia (${opVal % 1 === 0 ? opVal : opVal}%)`
              : `Fee agencia`,
          );
        }
        if (extraVal > 0) parts.push(`Cont.`);
        return parts.length > 0
          ? parts.join(" + ")
          : isChild
            ? "Adicionales niño"
            : "Adicionales";
      },
    [
      additionalCosts?.fee,
      additionalCosts?.operationalCosts,
      additionalCosts?.extraFee,
      additionalCosts?.childFee,
      additionalCosts?.childOperationalCosts,
      additionalCosts?.childExtraFee,
      applyExtraFeeToChildren,
      applyFeeToChildren,
      applyOperationalCostsToChildren,
      childFeeMode,
      childOperationalMode,
      feeMode,
      operationalMode,
    ],
  );

  const feeLabel = useMemo(
    () => buildAdditionalLabel({ audience: "adult" }),
    [buildAdditionalLabel],
  );

  const childFeeLabel = useMemo(
    () => buildAdditionalLabel({ audience: "child" }),
    [buildAdditionalLabel],
  );

  const hotelRoomCalcParts = useMemo(
    () =>
      hotelRoomHotelParts.map((part) => {
        const base = round2(subtotalIndividual + part.value);
        const additional = calculateAdditionalForBase(base);
        return {
          ...part,
          base,
          additional,
          final: round2(base + additional.total + externalAdultAmount),
        };
      }),
    [
      calculateAdditionalForBase,
      hotelRoomHotelParts,
      subtotalIndividual,
      externalAdultAmount,
    ],
  );
  const syncedHotelPreviewHtml = useMemo(() => {
    if (!hasHotelPricingInput) {
      return hotelPreviewHtml;
    }

    if (!effectiveHotelPreviewHtml || typeof DOMParser === "undefined") {
      return hotelPreviewHtml;
    }

    try {
      const doc = new DOMParser().parseFromString(
        effectiveHotelPreviewHtml,
        "text/html",
      );
      const selectedRow = doc.querySelector(
        '[data-preview-selected-row="true"][data-preview-price-kind="adult"]',
      );
      const selectedRoomValueMap = new Map(
        hotelRoomAdultParts.map((part) => [
          canonicalPreviewRoomKey(part.key.replace(/^adult-room-/, "")),
          part.value,
        ]),
      );

      doc
        .querySelectorAll('[data-preview-price-kind="adult"]')
        .forEach((row) => {
          const isSelectedRow = row === selectedRow;

          row
            .querySelectorAll(
              ".hpm-preview-price-cell--adult[data-preview-price-value]",
            )
            .forEach((cell) => {
              const key = canonicalPreviewRoomKey(
                cell.getAttribute("data-hpm-room-key"),
              );

              if (isSelectedRow && selectedRoomValueMap.has(key)) {
                cell.textContent = formatPreviewCurrency(
                  selectedRoomValueMap.get(key),
                );
                return;
              }

              const currentValue = parsePreviewMoney(cell.textContent);
              if (
                currentValue <= 0 ||
                externalAdultAmount <= 0 ||
                cell.getAttribute("data-hpm-price-includes-external") ===
                  "true" ||
                cell.getAttribute("data-ac-external-synced") === "true"
              ) {
                return;
              }
              cell.setAttribute("data-ac-external-synced", "true");
              cell.setAttribute("data-hpm-price-includes-external", "true");
              cell.textContent = formatPreviewCurrency(
                currentValue + externalAdultAmount,
              );
            });
        });

      const selectedCategory = selectedRow?.getAttribute(
        "data-preview-price-row",
      );
      const childRows = Array.from(
        doc.querySelectorAll(".hpm-preview-price-row--child"),
      );
      const selectedChildRow = selectedCategory
        ? childRows.find(
            (row) =>
              row.getAttribute("data-preview-price-row") ===
              `${selectedCategory}-child`,
          )
        : null;

      if (selectedChildRow) {
        const assignedChildRoomKeys = new Set(
          Array.from(
            selectedChildRow.querySelectorAll(
              ".hpm-preview-price-cell--child[data-preview-price-value]",
            ),
          )
            .filter((cell) => {
              const beneficiaries = Number(
                cell.getAttribute("data-hpm-room-converted-beneficiaries") ||
                  cell.getAttribute("data-hpm-room-beneficiaries") ||
                  0,
              );
              return (
                beneficiaries > 0 && parsePreviewMoney(cell.textContent) > 0
              );
            })
            .map((cell) =>
              canonicalPreviewRoomKey(cell.getAttribute("data-hpm-room-key")),
            )
            .filter(Boolean),
        );

        if (assignedChildRoomKeys.size > 0) {
          childRows.forEach((row) => {
            if (row === selectedChildRow) return;

            row
              .querySelectorAll(
                ".hpm-preview-price-cell--child[data-preview-price-value]",
              )
              .forEach((cell) => {
                const roomKey = canonicalPreviewRoomKey(
                  cell.getAttribute("data-hpm-room-key"),
                );
                if (assignedChildRoomKeys.has(roomKey)) return;

                cell.textContent = "—";
                cell.setAttribute("data-hpm-room-beneficiaries", "0");
                cell.setAttribute(
                  "data-hpm-room-total-beneficiaries",
                  "0",
                );
                cell.setAttribute(
                  "data-hpm-room-converted-beneficiaries",
                  "0",
                );
              });
          });
        }
      }

      // El HTML recibido ya fue calculado por el motor canónico de hoteles.
      // Solo se replica la distribución de habitaciones de la categoría elegida;
      // los importes comparativos permanecen intactos y no se recalculan aquí.

      return doc.body.innerHTML;
    } catch {
      return hotelPreviewHtml;
    }
  }, [
    externalAdultAmount,
    effectiveHotelPreviewHtml,
    hasHotelPricingInput,
    hotelPreviewHtml,
    hotelRoomAdultParts,
  ]);

  const hotelRoomConvertedFinalParts = useMemo(
    () =>
      hotelRoomConvertedParts.map((part) => ({
        ...part,
        finalValueResolved: Number(part.finalValue || part.value || 0),
      })),
    [hotelRoomConvertedParts],
  );

  const hotelConvertedRoomBeneficiaryCount = useMemo(
    () =>
      hotelRoomConvertedFinalParts.reduce(
        (sum, part) => sum + Math.max(0, Number(part.beneficiaries || 0)),
        0,
      ),
    [hotelRoomConvertedFinalParts],
  );
  const hasHotelRoomPricing = hotelRoomCalcParts.length > 0;
  const hotelRoomUnifiedChildFinalParts = useMemo(
    () =>
      hotelRoomConvertedFinalParts.map((part) => {
        const baseWithoutExternal = Math.max(
          0,
          round2(
            Number(part.finalValueResolved || part.value || 0) -
              externalUnifiedChildAmount,
          ),
        );
        const hotelPerPerson = Number(
          part.convertedChildHotelPerPerson ||
            part.hotelPerPerson ||
            part.hotelBasePerPerson ||
            part.value ||
            0,
        );
        const roomFinancials = resolveConvertedChildRoomFinancials(
          {
            ...part,
            hotelPerPerson,
            convertedChildHotelPerPerson: hotelPerPerson,
            convertedChildDisplayTotalPerPerson:
              part.convertedChildDisplayTotalPerPerson || baseWithoutExternal,
            convertedChildTotalPerPerson:
              part.convertedChildTotalPerPerson || baseWithoutExternal,
          },
          childChargeSummary,
          0,
          0,
        );
        const childBase = round2(roomFinancials.basePerChild);
        const childAdditional = shouldCalculateChildAdditional
          ? calculateChildAdditionalForBase(childBase)
          : { total: 0, fee: 0, commissionable: 0 };
        const commissionableValue = round2(
          childBase +
            (childAdditional.commissionable ?? childAdditional.fee ?? 0),
        );

        return {
          ...part,
          key: `unified-${part.key}`,
          label: String(part.label || "")
            .replace(/Niños\s+c\/a/i, "Niños")
            .replace(/\s+c\/a\b/i, ""),
          servicesValue: round2(roomFinancials.includedServices),
          missingServices: round2(roomFinancials.missingServices),
          hotelValue: Number(
            part.hotelBasePerPerson ??
              roomFinancials.hotelPerPerson ??
              part.value ??
              0,
          ),
          value: round2(
            childBase + childAdditional.total + externalUnifiedChildAmount,
          ),
          commissionableValue,
          additional: childAdditional,
          className: "ac__summary-total-pill--child",
        };
      }),
    [
      shouldCalculateChildAdditional,
      calculateChildAdditionalForBase,
      childChargeSummary,
      externalConvertedChildAmount,
      externalUnifiedChildAmount,
      hotelRoomConvertedFinalParts,
    ],
  );

  const hotelNoRoomChildCalcParts = useMemo(() => {
    if (!hasHotelRoomPricing) return [];

    const childrenWithoutHotelRoom = Math.max(
      0,
      Number(childrenCount || 0) - hotelConvertedRoomBeneficiaryCount,
    );
    if (childrenWithoutHotelRoom <= 0) return [];

    const hotelExplicitPerChild =
      resolvedHotelExplicitChildTotal > 0
        ? round2(
            resolvedHotelExplicitChildTotal /
              Math.max(
                1,
                effectiveHotelExplicitChildCount || childrenWithoutHotelRoom,
              ),
          )
        : 0;
    const servicesPerChild = round2(
      nonHotelExplicitPerChild + nonHotelConvertedPerChild,
    );
    // Un niño sin habitación puede tener una tarifa externa propia, una
    // tarifa externa aplicada como adulto, o ambas. El externo se agrega
    // después de calcular el fee sobre su base comercial (servicios + hotel).
    const childExternal = externalUnifiedChildAmount;
    const childBase = round2(servicesPerChild + hotelExplicitPerChild);
    const childAdditional = shouldCalculateChildAdditional
      ? calculateChildAdditionalForBase(childBase)
      : { total: 0, fee: 0, commissionable: 0 };
    const commissionableValue = round2(
      childBase + (childAdditional.commissionable ?? childAdditional.fee ?? 0),
    );
    const final = round2(childBase + childAdditional.total + childExternal);

    const shouldShow =
      childrenWithoutHotelRoom > 0 &&
      (final > 0 ||
        servicesPerChild > 0 ||
        hotelExplicitPerChild > 0 ||
        totalExplicitChildCount > 0 ||
        Number(childrenCount || 0) > 0);

    if (!shouldShow) return [];

    return [
      {
        key: "hotel-no-room-child",
        icon: MdChildCare,
        label:
          childrenWithoutHotelRoom > 1
            ? `Niños sin hotel (${childrenWithoutHotelRoom})`
            : "Niño sin hotel",
        beneficiaries: childrenWithoutHotelRoom,
        services: servicesPerChild,
        hotel: hotelExplicitPerChild,
        additional: childAdditional,
        external: childExternal,
        final,
        commissionableValue,
        className: "ac__summary-total-pill--child",
      },
    ];
  }, [
    shouldCalculateChildAdditional,
    calculateChildAdditionalForBase,
    childrenCount,
    externalUnifiedChildAmount,
    hasHotelRoomPricing,
    hotelConvertedRoomBeneficiaryCount,
    effectiveHotelExplicitChildCount,
    nonHotelConvertedPerChild,
    nonHotelExplicitPerChild,
    resolvedHotelExplicitChildTotal,
    totalExplicitChildCount,
  ]);

  const isNoHotelMode =
    effectiveHotelsTotal <= 0 && hotelRoomHotelParts.length === 0;
  const noHotelAdultCalcParts = useMemo(() => {
    if (hasHotelRoomPricing || !isNoHotelMode) return [];

    const base = round2(subtotalIndividual);
    const additional = calculateAdditionalForBase(base);
    const commissionableValue = round2(
      base + (additional.commissionable ?? additional.fee ?? 0),
    );
    const final = round2(base + additional.total + externalAdultAmount);

    if (final <= 0 && adultsCount <= 0) return [];

    return [
      {
        key: "no-hotel-adult",
        icon: MdPerson,
        label: adultsCount > 1 ? `Sin hotel (${adultsCount})` : "Sin hotel",
        beneficiaries: Math.max(1, Number(adultsCount || 1)),
        services: base,
        hotel: 0,
        additional,
        external: externalAdultAmount,
        final,
        commissionableValue,
        className: "ac__summary-total-pill--adult",
      },
    ];
  }, [
    adultsCount,
    calculateAdditionalForBase,
    externalAdultAmount,
    hasHotelRoomPricing,
    isNoHotelMode,
    subtotalIndividual,
  ]);

  const noHotelChildCalcParts = useMemo(() => {
    if (
      hasHotelRoomPricing ||
      !isNoHotelMode ||
      hotelRoomConvertedParts.length > 0
    ) {
      return [];
    }

    const parts = [];
    const unifiedCount = Math.max(
      effectiveUnifiedChildCount,
      totalExplicitChildCount,
      totalConvertedChildCount,
    );
    const servicesPerChild = round2(
      nonHotelExplicitPerChild + nonHotelConvertedPerChild,
    );
    const childExternal = round2(
      externalChildAmount + externalConvertedChildAmount,
    );
    const additional = shouldCalculateChildAdditional
      ? calculateChildAdditionalForBase(servicesPerChild)
      : { total: 0, fee: 0, commissionable: 0 };
    const commissionableValue = round2(
      servicesPerChild + (additional.commissionable ?? additional.fee ?? 0),
    );
    const final = round2(servicesPerChild + additional.total + childExternal);

    if (unifiedCount > 0 && final > 0) {
      parts.push({
        key: "no-hotel-child",
        icon: MdChildCare,
        label: `Niños (${unifiedCount})`,
        beneficiaries: unifiedCount,
        services: servicesPerChild,
        hotel: 0,
        additional,
        external: childExternal,
        final,
        commissionableValue,
        className: "ac__summary-total-pill--child",
      });
    }

    return parts;
  }, [
    hasHotelRoomPricing,
    hotelRoomConvertedParts.length,
    isNoHotelMode,
    shouldCalculateChildAdditional,
    calculateChildAdditionalForBase,
    externalChildAmount,
    externalConvertedChildAmount,
    effectiveUnifiedChildCount,
    nonHotelConvertedPerChild,
    nonHotelExplicitPerChild,
    totalConvertedChildCount,
    totalExplicitChildCount,
  ]);

  const noHotelCalcParts = useMemo(
    () => [...noHotelAdultCalcParts, ...noHotelChildCalcParts],
    [noHotelAdultCalcParts, noHotelChildCalcParts],
  );
  const hasSummaryCalcCards =
    hasHotelRoomPricing ||
    hotelRoomConvertedParts.length > 0 ||
    hotelNoRoomChildCalcParts.length > 0 ||
    noHotelCalcParts.length > 0;

  const legacySummaryVisibleParts = [
    adultSummaryTotal > 0
      ? {
          key: "adult-total",
          icon: MdPerson,
          label:
            totalConvertedChildCount > 0
              ? `Por adulto (${adultsCount})`
              : adultsCount > 1
                ? `Por adulto (${adultsCount})`
                : "Por adulto",
          value: adultSummaryTotal,
          className: "ac__summary-total-pill--adult",
        }
      : null,
    effectiveUnifiedChildCount > 0
      ? {
          key: "child-total",
          icon: MdChildCare,
          label: `Niños (${effectiveUnifiedChildCount})`,
          value: unifiedChildVisibleTotal,
          className: "ac__summary-total-pill--child",
        }
      : null,
  ].filter(Boolean);
  const defaultSummaryVisibleParts =
    buildFinancialSummaryParts({
      adultIcon: MdPerson,
      childIcon: MdChildCare,
      hotelIcon: MdHotel,
      adultsCount,
      adultTotal: adultSummaryTotal,
      childTotal: explicitChildVisibleTotal,
      convertedChildTotal: convertedChildVisibleTotal,
      unifiedChildTotal: unifiedChildVisibleTotal,
      childSummary: childChargeSummary,
      perRoomPricing,
      adultClassName: "ac__summary-total-pill--adult",
      childClassName: "ac__summary-total-pill--child",
      convertedChildClassName: "ac__summary-total-pill--child",
      roomClassName: "ac__summary-total-pill--room",
      externalAdultTotal: externalAdultAmount,
      externalChildTotal: externalChildAmount,
      externalConvertedChildTotal: externalConvertedChildAmount,
    }) || legacySummaryVisibleParts;
  const summaryVisibleParts =
    hotelRoomAdultParts.length > 0
      ? [
          ...hotelRoomAdultParts,
          ...hotelRoomUnifiedChildFinalParts,
          ...hotelNoRoomChildCalcParts.map((part) => ({
            key: `summary-${part.key}`,
            icon: part.icon,
            label: part.label,
            value: part.final,
            beneficiaries: part.beneficiaries,
            commissionableValue: Number(part.commissionableValue ?? 0) > 0
              ? round2(part.commissionableValue)
              : Math.max(
                  0,
                  round2(Number(part.final || 0) - Number(part.external || 0)),
                ),
            className: part.className,
          })),
          ...defaultSummaryVisibleParts.filter(
            (part) =>
              part.key !== "adult-total" &&
              part.key !== "child-total" &&
              part.key !== "child-adult-total" &&
              !String(part.key || "").startsWith("room-"),
          ),
        ]
      : noHotelCalcParts.length > 0
        ? noHotelCalcParts.map((part) => ({
            key: `summary-${part.key}`,
            icon: part.icon,
            label: part.label,
            value: part.final,
            commissionableValue: Number(part.commissionableValue ?? 0) > 0
              ? round2(part.commissionableValue)
              : Math.max(
                  0,
                  round2(Number(part.final || 0) - Number(part.external || 0)),
                ),
            className: part.className,
          }))
        : defaultSummaryVisibleParts;
  const visibleSummaryPayload = useMemo(
    () => buildVisibleSummaryPayload(summaryVisibleParts),
    [summaryVisibleParts],
  );
  const passengerVerificationParts = useMemo(
    () =>
      enrichPassengerPricePartsWithRoomImpact({
        parts: summaryVisibleParts,
        perRoomPricing: effectiveHotelPerRoomPricing,
        peopleDetails,
      }),
    [effectiveHotelPerRoomPricing, peopleDetails, summaryVisibleParts],
  );

  const roomBasedVisibleGrandTotal = useMemo(() => {
    if (visibleSummaryPayload.grandTotal > 0) {
      return visibleSummaryPayload.grandTotal;
    }

    if (hotelRoomAdultParts.length === 0) return null;

    const adultRoomTotal = hotelRoomAdultParts.reduce((sum, part) => {
      const beneficiaries = Number(part.beneficiaries || 0);
      return (
        sum + Math.ceil(Number(part.value || 0)) * Math.max(1, beneficiaries)
      );
    }, 0);

    const convertedRoomTotal = hotelRoomUnifiedChildFinalParts.reduce(
      (sum, part) =>
        sum +
        Math.ceil(Number(part.value || 0)) *
          Math.max(1, Number(part.beneficiaries || 0)),
      0,
    );
    const noRoomChildTotal = hotelNoRoomChildCalcParts.reduce(
      (sum, part) =>
        sum +
        Math.ceil(Number(part.final || 0)) *
          Math.max(1, Number(part.beneficiaries || 0)),
      0,
    );
    const convertedChildTotal =
      convertedRoomTotal > 0
        ? convertedRoomTotal
        : totalConvertedChildCount > 0 && noRoomChildTotal <= 0
          ? unifiedChildVisibleTotal * totalConvertedChildCount
          : 0;

    return round2(adultRoomTotal + noRoomChildTotal + convertedChildTotal);
  }, [
    hotelNoRoomChildCalcParts,
    hotelRoomAdultParts,
    hotelRoomUnifiedChildFinalParts,
    totalConvertedChildCount,
    unifiedChildVisibleTotal,
    visibleSummaryPayload.grandTotal,
  ]);

  // Update cálculos hacia el parent con debounce
  useEffect(() => {
    if (isUpdating.current || !isMounted.current) return;

    const timeout = setTimeout(() => {
      try {
        isUpdating.current = true;

        const calculatedFinalTotal =
          roomBasedVisibleGrandTotal ?? summaryTotals.grandTotal;
        const calculatedSubtotalFinal =
          visibleSummaryPayload.commissionableGrandTotal > 0
            ? visibleSummaryPayload.commissionableGrandTotal
            : Math.max(0, round2(calculatedFinalTotal));

        setAdditionalCosts((prev) => ({
          ...prev,
          calculatedOperational: isPrimaryAgency ? 0 : operationalAmount,
          calculatedFee: feeAmount,
          calculatedChildOperational: isPrimaryAgency ? 0 : childOperationalAmount,
          calculatedChildFee: childFeeAmount,
          calculatedChildExtraFee: childExtraFeeAmount,
          totalAdditional,
          totalAdditionalPerChild: summaryTotals.totalAdditionalPerChild,
          additionalChildTotal: summaryTotals.additionalChildTotal,
          contingencyAmount,
          subtotalFinal: calculatedSubtotalFinal,
          subtotal_final: calculatedSubtotalFinal,
          commissionableSubtotal: calculatedSubtotalFinal,
          commissionable_subtotal: calculatedSubtotalFinal,
          feeOnlySubtotalFinal: calculatedSubtotalFinal,
          fee_only_subtotal_final: calculatedSubtotalFinal,
          commissionableFeeSubtotal: calculatedSubtotalFinal,
          commissionable_fee_subtotal: calculatedSubtotalFinal,
          finalTotal: calculatedFinalTotal,
          final_total: calculatedFinalTotal,
          grandTotal: calculatedFinalTotal,
          grand_total: calculatedFinalTotal,
          visibleSummaryGrandTotal: calculatedFinalTotal,
          summaryVisibleGrandTotal: calculatedFinalTotal,
          acSummaryGrandTotal: calculatedFinalTotal,
          summaryVisibleParts: visibleSummaryPayload.parts,
          operationalMode,
          feeMode,
          applyAdditionalCostsToChildren: true,
          applyOperationalCostsToChildren: !isPrimaryAgency,
          applyFeeToChildren: true,
          applyExtraFeeToChildren: true,
          childOperationalMode: operationalMode,
          childOperationalCosts: isPrimaryAgency
            ? "0"
            : prev?.operationalCosts ?? "0",
          childFeeMode: feeMode,
          childFee: prev?.fee ?? "0",
          childExtraFee: prev?.extraFee ?? "0",
        }));
      } finally {
        setTimeout(() => {
          isUpdating.current = false;
        }, 0);
      }
    }, 100);

    return () => clearTimeout(timeout);
  }, [
    operationalAmount,
    feeAmount,
    extraFeeAmount,
    childOperationalAmount,
    childFeeAmount,
    childExtraFeeAmount,
    setAdditionalCosts,
    totalAdditional,
    feeMode,
    isPrimaryAgency,
    operationalMode,
    childFeeMode,
    childOperationalMode,
    contingencyAmount,
    roomBasedVisibleGrandTotal,
    summaryTotals.grandTotal,
    summaryTotals.totalAdditionalPerChild,
    summaryTotals.additionalChildTotal,
    visibleSummaryPayload.parts,
    visibleSummaryPayload.commissionableGrandTotal,
  ]);

  // Prevenir rueda y flechas
  const preventWheelChange = (e) => e.target.blur();
  const preventArrowChange = (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
  };

  const nationalHotelRoomParts = hotelRoomHotelParts.filter(
    (part) => part.isNationalRoom && part.igvPerPerson > 0,
  );

  return (
    <div className="ac">
      <div className="ac__title">Costos Adicionales</div>

      <div className="ac__table ac__table--fees">
        {!isPrimaryAgency && (
          <div className="ac__fee-group">
            <div className="ac__row ac__row--adult">
              <div className="ac__row-head">
                <span className="ac__label">Fee de agencia</span>
              </div>
              <div className="ac__input-cell">
                <button
                  className={`ac__toggle-btn ${operationalMode === "percentage" ? "ac__toggle-btn--pct" : ""}`}
                  onClick={() => toggleMode("operational", operationalMode)}
                  title={
                    operationalMode === "percentage"
                      ? "Cambiar a monto fijo"
                      : "Cambiar a porcentaje"
                  }
                  type="button"
                >
                  {operationalMode === "percentage" ? (
                    <MdPercent />
                  ) : (
                    <MdAttachMoney />
                  )}
                </button>
                {operationalMode !== "percentage" && (
                  <span className="ac__unit">$</span>
                )}
                <input
                  type="number"
                  min="0"
                  step={operationalMode === "percentage" ? "0.1" : "0.01"}
                  value={additionalCosts?.operationalCosts ?? "0"}
                  onChange={handleOperationalCostsChange}
                  onWheel={preventWheelChange}
                  onKeyDown={preventArrowChange}
                  className={`ac__input ${operationalMode === "percentage" ? "ac__input--pct" : ""}`}
                  aria-label="Fee de agencia"
                />
                {operationalMode === "percentage" && (
                  <span className="ac__unit">%</span>
                )}
              </div>
              <span className="ac__value">
                {formatCurrency(operationalAmount)}
              </span>
            </div>
          </div>
        )}

        <div className="ac__fee-group">
          <div className="ac__row ac__row--adult ac__row--fee-percent-only">
            <div className="ac__row-head">
              <span className="ac__label">Fee</span>
            </div>
            <div className="ac__fee-select-wrap">
              <select
                value={normalizeFee(additionalCosts?.fee)}
                onChange={handleFeeChange}
                className="ac__fee-select"
                aria-label="Fee porcentual"
              >
                {feePercentOptions.map((option) => (
                  <option value={option} key={option}>
                    {option}%
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="ac__fee-custom-btn"
                onClick={handleCustomFeeClick}
                title="Personalizar fee porcentual, incluso por debajo de 25"
              >
                Personalizar
              </button>
              <span className="ac__unit ac__unit--fee">%</span>
            </div>
            <small className="ac__input-help">Porcentaje comercial</small>
          </div>
        </div>

        {/* Costos de Contingencia */}
        <div className="ac__fee-group">
          <div className="ac__row ac__row--adult">
            <div className="ac__row-head">
              <span className="ac__label">Contingencia</span>
            </div>
            <div className="ac__input-cell">
              <span className="ac__unit">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={additionalCosts?.extraFee ?? "0"}
                onChange={handleExtraFeeChange}
                onWheel={preventWheelChange}
                onKeyDown={preventArrowChange}
                className="ac__input"
              />
            </div>
            <span className="ac__value">{formatCurrency(extraFeeAmount)}</span>
          </div>
        </div>
      </div>

      {/* Summary rows */}
      <div className="ac__summary">
        {nationalHotelRoomParts.length > 0 && (
          <div className="ac__national-note" role="note">
            <div>
              <strong>Tarifa nacional en hotel</strong>
              <span>
                El IGV de la habitación se distribuye entre todos sus ocupantes,
                no solo en el pasajero peruano.
              </span>
            </div>
            <small>
              {nationalHotelRoomParts.length} habitación
              {nationalHotelRoomParts.length !== 1 ? "es" : ""} afectada
              {nationalHotelRoomParts.length !== 1 ? "s" : ""}
            </small>
          </div>
        )}
        {/* ── Breakdown rows ── */}
        <div className="ac__summary-breakdown">
          {/* Servicios por persona */}
          <div className="ac__summary-breakdown-row">
            <span className="ac__summary-breakdown-label">
              <MdRoomService /> Servicios
            </span>
            <span className="ac__summary-breakdown-item">
              <MdPerson className="icon-adult" />
              <strong>{formatCurrency(subtotalIndividual)}</strong>
              <small>/adulto</small>
            </span>
            {unifiedNonHotelChildPerChild > 0 && (
              <span className="ac__summary-breakdown-item">
                <MdChildCare className="icon-child" />
                <strong>{formatCurrency(unifiedNonHotelChildPerChild)}</strong>
                <small>
                  {unifiedChildCount > 0
                    ? `niños (${unifiedChildCount})`
                    : "niños"}
                </small>
              </span>
            )}
          </div>

          {/* Hoteles por persona */}
          {(effectiveHotelsTotal > 0 || isNoHotelMode) && (
            <div className="ac__summary-breakdown-row">
              <span className="ac__summary-breakdown-label">
                <MdHotel /> Hoteles
              </span>
              {hotelGroupBreakdown.length > 0 && (
                <div className="ac__hotel-group-breakdown">
                  {hotelGroupBreakdown.map((group) => (
                    <div className="ac__hotel-group-card" key={group.key}>
                      <div className="ac__hotel-group-card-head">
                        <strong>{group.label}</strong>
                        <span>{group.categoryLabel}</span>
                        {group.daysLabel && <small>{group.daysLabel}</small>}
                      </div>
                      <div className="ac__hotel-group-card-rooms">
                        {group.rooms.map((room) => (
                          <span
                            className={`ac__hotel-group-room ${
                              room.audience === "child"
                                ? "ac__hotel-group-room--child"
                                : ""
                            } ${
                              room.isNationalRoom && room.igvPerPerson > 0
                                ? "ac__hotel-group-room--national"
                                : ""
                            }`.trim()}
                            key={room.key}
                            title={
                              room.nationalPassengerLabels?.length
                                ? `Pasajero nacional: ${room.nationalPassengerLabels.join(", ")}`
                                : undefined
                            }
                          >
                            <span className="ac__hotel-group-room-label">
                              {room.label}
                              {room.beneficiaries > 0
                                ? ` (${room.beneficiaries})`
                                : ""}
                            </span>
                            {room.isNationalRoom && room.igvPerPerson > 0 && (
                              <em className="ac__national-badge">
                                Nacional · IGV 18%
                              </em>
                            )}
                            <strong>{formatCurrency(room.value)}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {hotelRoomHotelParts.length > 0 ? (
                <>
                  <span className="ac__summary-breakdown-item ac__summary-breakdown-item--room ac__summary-breakdown-item--room-total-label">
                    <MdHotel className="icon-room" />
                    <strong>Total</strong>
                    <small>por habitación / persona</small>
                  </span>
                  {hotelRoomHotelParts.map((part, index) => (
                    <span
                      className={`ac__summary-breakdown-item ac__summary-breakdown-item--room ac__summary-breakdown-item--room-total ${
                        part.isNationalRoom && part.igvPerPerson > 0
                          ? "ac__summary-breakdown-item--national"
                          : ""
                      }`.trim()}
                      key={`${part.key}-${index}`}
                    >
                      <MdHotel className="icon-room" />
                      <div className="ac__room-total-copy">
                        <small>
                          {part.label}
                          {part.beneficiaries > 0
                            ? ` (${part.beneficiaries} pax)`
                            : ""}
                        </small>
                        {part.isNationalRoom && part.igvPerPerson > 0 && (
                          <span className="ac__room-tax-note">
                            Base {formatCurrency(part.hotelBasePerPerson)} + IGV{" "}
                            {formatCurrency(part.igvPerPerson)}
                          </span>
                        )}
                      </div>
                      {part.isNationalRoom && part.igvPerPerson > 0 && (
                        <em className="ac__national-badge">Nacional</em>
                      )}
                      <strong>{formatCurrency(part.value)}</strong>
                    </span>
                  ))}
                </>
              ) : effectiveHotelsTotal > 0 ? (
                <span className="ac__summary-breakdown-item">
                  <MdPerson className="icon-adult" />
                  <strong>{formatCurrency(hotelPerAdult)}</strong>
                  <small>/adulto</small>
                </span>
              ) : (
                <span className="ac__summary-breakdown-item ac__summary-breakdown-item--room ac__summary-breakdown-item--no-hotel">
                  <MdHotel className="icon-room" />
                  <strong>{formatCurrency(0)}</strong>
                  <small>
                    Sin hotel{adultsCount > 0 ? ` (${adultsCount})` : ""}
                  </small>
                </span>
              )}
              {resolvedHotelExplicitChildTotal > 0 && (
                <span className="ac__summary-breakdown-item">
                  <MdChildCare className="icon-child" />
                  <strong>
                    {formatCurrency(resolvedHotelExplicitChildTotal)}
                  </strong>
                  <small>
                    {effectiveHotelExplicitChildCount > 0
                      ? `niños (${effectiveHotelExplicitChildCount})`
                      : "niños"}
                  </small>
                </span>
              )}
              {effectiveHotelsTotal > 0 &&
                resolvedHotelExplicitChildTotal <= 0 &&
                hotelNoRoomChildCalcParts.length > 0 && (
                  <span className="ac__summary-breakdown-item ac__breakdown-item--child">
                    <MdChildCare className="icon-child" />
                    <strong>{formatCurrency(0)}</strong>
                    <small>
                      niños ({hotelNoRoomChildCalcParts[0].beneficiaries})
                    </small>
                  </span>
                )}
              {effectiveHotelsTotal <= 0 && totalExplicitChildCount > 0 && (
                <span className="ac__summary-breakdown-item">
                  <MdChildCare className="icon-child" />
                  <strong>{formatCurrency(0)}</strong>
                  <small>niños ({totalExplicitChildCount})</small>
                </span>
              )}
              {hotelRoomConvertedParts.length > 0
                ? hotelRoomConvertedParts.map((part, index) => (
                    <span
                      className={`ac__summary-breakdown-item ac__breakdown-item--child ${
                        part.isNationalRoom && part.igvPerPerson > 0
                          ? "ac__summary-breakdown-item--national"
                          : ""
                      }`.trim()}
                      key={`hotel-converted-${part.key}-${index}`}
                    >
                      <MdChildCare />
                      <div className="ac__room-total-copy">
                        <small>
                          {String(part.label || "").replace(/\s+c\/a\b/i, "")}
                        </small>
                        {part.isNationalRoom && part.igvPerPerson > 0 && (
                          <span className="ac__room-tax-note">
                            Base {formatCurrency(part.hotelBasePerPerson)} + IGV{" "}
                            {formatCurrency(part.igvPerPerson)}
                          </span>
                        )}
                      </div>
                      {part.isNationalRoom && part.igvPerPerson > 0 && (
                        <em className="ac__national-badge">Nacional</em>
                      )}
                      <strong>{formatCurrency(part.value)}</strong>
                    </span>
                  ))
                : effectiveHotelConvertedChildTotal > 0 && (
                    <span className="ac__summary-breakdown-item ac__breakdown-item--child">
                      <MdChildCare />
                      <strong>
                        {formatCurrency(effectiveHotelConvertedChildTotal)}
                      </strong>
                      <small>
                        niños ({effectiveHotelConvertedChildCount})
                      </small>
                    </span>
                  )}
              {effectiveHotelsTotal <= 0 && totalConvertedChildCount > 0 && (
                <span className="ac__summary-breakdown-item ac__breakdown-item--child">
                  <MdChildCare />
                  <strong>{formatCurrency(0)}</strong>
                  <small>niños ({totalConvertedChildCount})</small>
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Calculation process ── */}
        <div className="ac__summary-calc">
          <div className="ac__summary-calc-header">
            <span>Cálculo por persona</span>
            <small>Servicios + hotel + adicionales</small>
          </div>

          {hasSummaryCalcCards && (
            <div className="ac__summary-calc-grid">
              {hotelRoomCalcParts.map((part, index) => (
                <div
                  className={`ac__summary-calc-card ${
                    part.isNationalRoom && part.igvPerPerson > 0
                      ? "ac__summary-calc-card--national"
                      : ""
                  }`.trim()}
                  key={`${part.key}-${index}`}
                >
                  <div className="ac__summary-calc-card-head">
                    <MdHotel />
                    <span>{part.label}</span>
                    {part.isNationalRoom && part.igvPerPerson > 0 && (
                      <em className="ac__national-badge">Nacional</em>
                    )}
                    {part.beneficiaries > 0 && (
                      <small>{part.beneficiaries} pax</small>
                    )}
                  </div>
                  {part.isNationalRoom && part.igvPerPerson > 0 && (
                    <div className="ac__national-room-caption">
                      IGV aplicado a los{" "}
                      {part.affectedPaxCount || part.beneficiaries} ocupantes
                      {part.nationalPassengerLabels?.length
                        ? ` · ${part.nationalPassengerLabels.join(", ")}`
                        : ""}
                    </div>
                  )}
                  <div className="ac__summary-calc-line">
                    <span>Servicios</span>
                    <strong>{formatCurrency(subtotalIndividual)}</strong>
                  </div>
                  <div className="ac__summary-calc-line">
                    <span>{part.igvPerPerson > 0 ? "Hotel base" : "Hotel"}</span>
                    <strong>
                      {formatCurrency(part.hotelBasePerPerson ?? part.value)}
                    </strong>
                  </div>
                  {part.igvPerPerson > 0 && (
                    <div className="ac__summary-calc-line ac__summary-calc-line--igv">
                      <span>IGV hotel 18% · todos los pax</span>
                      <strong>{formatCurrency(part.igvPerPerson)}</strong>
                    </div>
                  )}
                  <div className="ac__summary-calc-line">
                    <span>{feeLabel}</span>
                    <strong>{formatCurrency(part.additional.total)}</strong>
                  </div>
                  {externalAdultAmount > 0 && (
                    <div className="ac__summary-calc-line">
                      <span>Ext. Itinerario</span>
                      <strong>{formatCurrency(externalAdultAmount)}</strong>
                    </div>
                  )}
                  <div className="ac__summary-calc-line ac__summary-calc-line--final">
                    <span>Total</span>
                    <strong>{formatCurrency(part.final)}</strong>
                  </div>
                </div>
              ))}
              {hotelRoomUnifiedChildFinalParts.map((part, index) => {
                return (
                  <div
                    className={`ac__summary-calc-card ac__summary-calc-card--child ${
                      part.isNationalRoom && part.igvPerPerson > 0
                        ? "ac__summary-calc-card--national"
                        : ""
                    }`.trim()}
                    key={`calc-converted-${part.key}-${index}`}
                  >
                    <div className="ac__summary-calc-card-head">
                      <MdChildCare />
                      <span>
                        {String(part.label || "").replace(/\s+c\/a\b/i, "")}
                      </span>
                      {part.isNationalRoom && part.igvPerPerson > 0 && (
                        <em className="ac__national-badge">Nacional</em>
                      )}
                      {part.beneficiaries > 0 && (
                        <small>{part.beneficiaries} pax</small>
                      )}
                    </div>
                    {part.isNationalRoom && part.igvPerPerson > 0 && (
                      <div className="ac__national-room-caption">
                        Comparte la tarifa nacional de la habitación
                      </div>
                    )}
                    <div className="ac__summary-calc-line">
                      <span>Servicios</span>
                      <strong>{formatCurrency(part.servicesValue || 0)}</strong>
                    </div>
                    <div className="ac__summary-calc-line">
                      <span>{part.igvPerPerson > 0 ? "Hotel base" : "Hotel"}</span>
                      <strong>
                        {formatCurrency(
                          part.igvPerPerson > 0
                            ? Math.max(
                                0,
                                (part.hotelValue || 0) - part.igvPerPerson,
                              )
                            : part.hotelValue || 0,
                        )}
                      </strong>
                    </div>
                    {part.igvPerPerson > 0 && (
                      <div className="ac__summary-calc-line ac__summary-calc-line--igv">
                        <span>IGV hotel 18% · todos los pax</span>
                        <strong>{formatCurrency(part.igvPerPerson)}</strong>
                      </div>
                    )}
                    <div className="ac__summary-calc-line">
                      <span>{childFeeLabel}</span>
                      <strong>
                        {formatCurrency(part.additional?.total || 0)}
                      </strong>
                    </div>
                    {externalUnifiedChildAmount > 0 && (
                      <div className="ac__summary-calc-line">
                        <span>Ext. Itinerario</span>
                        <strong>
                          {formatCurrency(externalUnifiedChildAmount)}
                        </strong>
                      </div>
                    )}
                    <div className="ac__summary-calc-line ac__summary-calc-line--final">
                      <span>Total</span>
                      <strong>{formatCurrency(part.value || 0)}</strong>
                    </div>
                  </div>
                );
              })}
              {hotelNoRoomChildCalcParts.map((part, index) => {
                const Icon = part.icon;
                return (
                  <div
                    className="ac__summary-calc-card ac__summary-calc-card--child ac__summary-calc-card--no-hotel"
                    key={`calc-${part.key}-${index}`}
                  >
                    <div className="ac__summary-calc-card-head">
                      <Icon />
                      <span>{part.label}</span>
                      {part.beneficiaries > 0 && (
                        <small>{part.beneficiaries} pax</small>
                      )}
                    </div>
                    <div className="ac__summary-calc-line">
                      <span>Servicios</span>
                      <strong>{formatCurrency(part.services || 0)}</strong>
                    </div>
                    <div className="ac__summary-calc-line">
                      <span>Hotel</span>
                      <strong>{formatCurrency(part.hotel || 0)}</strong>
                    </div>
                    <div className="ac__summary-calc-line">
                      <span>{childFeeLabel}</span>
                      <strong>
                        {formatCurrency(part.additional?.total || 0)}
                      </strong>
                    </div>
                    {part.external > 0 && (
                      <div className="ac__summary-calc-line">
                        <span>Ext. Itinerario</span>
                        <strong>{formatCurrency(part.external)}</strong>
                      </div>
                    )}
                    <div className="ac__summary-calc-line ac__summary-calc-line--final">
                      <span>Total</span>
                      <strong>{formatCurrency(part.final)}</strong>
                    </div>
                  </div>
                );
              })}
              {noHotelCalcParts.map((part, index) => {
                const Icon = part.icon;
                return (
                  <div
                    className={`ac__summary-calc-card ac__summary-calc-card--no-hotel ${
                      part.key.includes("child")
                        ? "ac__summary-calc-card--child"
                        : ""
                    }`}
                    key={`calc-${part.key}-${index}`}
                  >
                    <div className="ac__summary-calc-card-head">
                      <Icon />
                      <span>{part.label}</span>
                      {part.beneficiaries > 0 && (
                        <small>{part.beneficiaries} pax</small>
                      )}
                    </div>
                    <div className="ac__summary-calc-line">
                      <span>Servicios</span>
                      <strong>{formatCurrency(part.services)}</strong>
                    </div>
                    <div className="ac__summary-calc-line">
                      <span>Hotel</span>
                      <strong>{formatCurrency(part.hotel)}</strong>
                    </div>
                    <div className="ac__summary-calc-line">
                      <span>
                        {part.key.includes("child") ? childFeeLabel : feeLabel}
                      </span>
                      <strong>
                        {formatCurrency(part.additional?.total || 0)}
                      </strong>
                    </div>
                    {part.external > 0 && (
                      <div className="ac__summary-calc-line">
                        <span>Ext. Itinerario</span>
                        <strong>{formatCurrency(part.external)}</strong>
                      </div>
                    )}
                    <div className="ac__summary-calc-line ac__summary-calc-line--final">
                      <span>Total</span>
                      <strong>{formatCurrency(part.final)}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!hasSummaryCalcCards && percentageBase > 0 && (
            <div className="ac__summary-calc-row">
              <span>= Costos operativos + hotel / adulto:</span>
              <span>{formatCurrency(percentageBase)}</span>
            </div>
          )}

          {!hasSummaryCalcCards && totalAdditional > 0 && (
            <div className="ac__summary-calc-row">
              <span>+ Costos adicionales / adulto:</span>
              <span>{formatCurrency(totalAdditional)}</span>
            </div>
          )}

          {summaryTotals.perUnifiedChildTotal > 0 && !hasSummaryCalcCards && (
            <div className="ac__summary-calc-row">
              <span>
                + Tarifa / niño
                {effectiveUnifiedChildCount > 1
                  ? ` (${effectiveUnifiedChildCount})`
                  : ""}
                :
              </span>
              <span>{formatCurrency(summaryTotals.perUnifiedChildTotal)}</span>
            </div>
          )}

          {externalAdultAmount > 0 && !hasSummaryCalcCards && (
            <div className="ac__summary-calc-row">
              <span>+ Itinerario externo / adulto:</span>
              <span>{formatCurrency(externalAdultAmount)}</span>
            </div>
          )}

          {externalChildAmount > 0 &&
            totalExplicitChildCount <= 0 &&
            !hasSummaryCalcCards && (
              <div className="ac__summary-calc-row">
                <span>+ Itinerario externo niños:</span>
                <span>{formatCurrency(externalChildAmount)}</span>
              </div>
            )}
        </div>

        {/* ── RESUMEN VISIBLE ── */}

        <div className="ac__summary-row ac__summary-row--total">
          <div className="ac__summary-total-main">
            <span className="ac__summary-total-label">RESUMEN</span>
            {summaryVisibleParts.length > 0 && (
              <div className="ac__summary-total-formula">
                {summaryVisibleParts.map((part, index) => {
                  const Icon = part.icon;
                  return (
                    <React.Fragment key={`${part.key}-${index}`}>
                      <span
                        className={`ac__summary-total-pill ${part.className}`}
                      >
                        <Icon />
                        <strong>
                          {formatCurrency(Math.ceil(part.value), "dolares", 0)}
                        </strong>
                        <small>{part.label}</small>
                      </span>
                    </React.Fragment>
                  );
                })}
              </div>
            )}
            {hasExternalItineraryAmount &&
              visibleSummaryPayload.commissionableGrandTotal > 0 &&
              visibleSummaryPayload.commissionableGrandTotal <
                visibleSummaryPayload.grandTotal && (
                <div className="ac__summary-subtotal-note">
                  <span>Subtotal sin itinerario externo</span>
                  <strong>
                    {formatCurrency(
                      visibleSummaryPayload.commissionableGrandTotal,
                    )}
                  </strong>
                </div>
              )}
          </div>
        </div>

        <PassengerPriceVerification
          parts={passengerVerificationParts}
          total={visibleSummaryPayload.grandTotal}
          title="Comprobación del total por pasajeros"
          description="Precio redondeado por tipo de habitación × cantidad de pasajeros"
          compact
        />
      </div>
    </div>
  );
};

export default React.memo(AdditionalCosts);
