// components/DaysEditor.jsx
import React, {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useCallback,
  useMemo,
  memo,
} from "react";
import {
  MdAdd,
  MdWarning,
  MdPerson,
  MdChildCare,
  MdHotel,
  MdRoomService,
  MdAutoFixHigh,
} from "react-icons/md";
import { FaHotel, FaTrain } from "react-icons/fa";
import { formatCurrency } from "../../utils/formatters";
import axiosInstance from "../../../../../../utils/axiosInstance";
import ServiceCategoryButtons from "../ServicePicker/components/ServiceCategoryButtons";
import HotelItineraryModal from "./HotelItineraryModal";
import CiudadesSelectorModal from "./components/CiudadesSelectorModal";
import { serviceHasPeruvianBeneficiary } from "../../utils/igvUtils";
import { detectServiceType, getServiceName } from "./utils/serviceTypeMapper";
import HotelCategorySelectorModal from "../HotelCategorySelectorModal/HotelCategorySelectormodal";

// Tarjeta especial para hoteles auto-agregados
import AutoHotelCard from "./components/AutoHotelCard/AutoHotelCard";

import {
  updateSingleServicePricesForPassengerChange,
  getTourCapacity,
} from "../../utils/unifiedServiceManager";
import {
  getPassengerSlotKey,
  getServiceBeneficiarySnapshot,
} from "../../utils/passengerPricingState";
import { ensureDaysHaveCiudades } from "../../utils/itinerarioCleanupUtils";
import { resolveTicketChildUnitPrice } from "../../utils/ticketBeneficiaries";
import {
  applyQuotationExchangeRateToDayServices,
  applyQuotationExchangeRateToService,
  collectPendingQuotationExchangeRateServices,
  resolveServiceExchangeRate,
} from "../../utils/serviceExchangeRate";
import { isOperationallyAssignedService } from "../../utils/assignmentProtection";

import {
  DndContext,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import "./DaysEditor.scss";
import "./ServiceDetails.scss";

// [PAX] Modal de pasajeros (con precios opcionales para niños)
import PassengerSelectorModal from "./components/PassengerSelectorModal/PassengerSelectorModal";

// Componentes separados
import SortableService from "./components/SortableService/SortableService";
import SortableDay from "./components/SortableDay/SortableDay";
import {
  extractDayTitleOptions,
  mergeDayTitleOptions,
  normalizeDayTitleOptions,
} from "./utils/dayTitleOptions";

// REFACTORED: Imports de hooks y utilidades extraídas
import {
  validateServiceStructure,
  getDivisionCountsForService,
  getServicePrice,
  getRoomCapacityByType,
  calculateAndSetDividedPrice,
  calculateDaySubtotalDetailed,
  calculateGeneralTotalsDetailed,
  groupServicesByType,
} from "./utils/priceCalculations";

// REFACTORED: Imports de custom hooks
import { useDaysEditorUI } from "./hooks/useDaysEditorUI";
import { useServicePickerModal } from "./hooks/useServicePickerModal";
import { useCiudadesManagement } from "./hooks/useCiudadesManagement";

const isChildPassengerId = (value) =>
  typeof value === "string" && value.startsWith("child:");

const isAdultPassengerId = (value) =>
  typeof value === "string" && value.startsWith("adult:");

const dedupePassengerIdsBySlot = (ids = []) => {
  const bySlot = new Map();
  ids.filter(Boolean).forEach((rawId) => {
    const id = String(rawId);
    const slot = getPassengerSlotKey(id);
    if (!slot) return;

    const previous = bySlot.get(slot);
    if (!previous || id.split(":").length >= previous.split(":").length) {
      bySlot.set(slot, id);
    }
  });
  return [...bySlot.values()];
};

const findPassengerIdBySlot = (ids = [], targetId, predicate = () => true) => {
  const targetSlot = getPassengerSlotKey(targetId);
  return (
    ids.find(
      (id) => predicate(id) && getPassengerSlotKey(id) === targetSlot,
    ) || null
  );
};

const removeChildSlotFromConvertedMap = (source = {}, childId) => {
  const targetSlot = getPassengerSlotKey(childId);
  if (!targetSlot || !source || typeof source !== "object") return {};

  return Object.entries(source).reduce((result, [key, value]) => {
    const keyIsChildMatch =
      isChildPassengerId(key) && getPassengerSlotKey(key) === targetSlot;
    const valueIsChildMatch =
      isChildPassengerId(value) && getPassengerSlotKey(value) === targetSlot;

    if (!keyIsChildMatch && !valueIsChildMatch) {
      result[key] = value;
    }
    return result;
  }, {});
};

const removeChildSlotFromPriceMap = (source = {}, childId) => {
  const targetSlot = getPassengerSlotKey(childId);
  if (!targetSlot || !source || typeof source !== "object") return {};

  return Object.entries(source).reduce((result, [key, value]) => {
    if (!(isChildPassengerId(key) && getPassengerSlotKey(key) === targetSlot)) {
      result[key] = value;
    }
    return result;
  }, {});
};

const upsertChildPriceBySlot = (source = {}, childId, price) => ({
  ...removeChildSlotFromPriceMap(source, childId),
  [childId]: price,
});

const materializeChildInAssignedIds = (ids = [], childId) => {
  const targetSlot = getPassengerSlotKey(childId);
  const nextIds = ids.map((id) =>
    isChildPassengerId(id) && getPassengerSlotKey(id) === targetSlot
      ? childId
      : id,
  );

  if (!nextIds.some((id) => getPassengerSlotKey(id) === targetSlot)) {
    nextIds.push(childId);
  }

  return dedupePassengerIdsBySlot(nextIds);
};

const cleanLegacyChildBeneficiaries = (service = {}, childId, childPrice) => {
  const targetSlot = getPassengerSlotKey(childId);

  const beneficiariosAdultos = Array.isArray(service.beneficiariosAdultos)
    ? service.beneficiariosAdultos.filter((beneficiary) => {
        const idSlot = getPassengerSlotKey(beneficiary?.id);
        const originSlot = getPassengerSlotKey(beneficiary?.child_origin);
        return idSlot !== targetSlot && originSlot !== targetSlot;
      })
    : service.beneficiariosAdultos;

  const baseChildren = Array.isArray(service.beneficiariosNinos)
    ? service.beneficiariosNinos.filter(
        (beneficiary) => getPassengerSlotKey(beneficiary?.id) !== targetSlot,
      )
    : [];

  return {
    beneficiariosAdultos,
    beneficiariosNinos: [
      ...baseChildren,
      { id: childId, precio: parseFloat(childPrice) || 0 },
    ],
  };
};

// ================================
// DaysEditor
// ================================
const DaysEditor = forwardRef(
  (
    {
      days,
      setDays,
      onAddService,
      onChangeService,
      onExtrasClick,
      adultsCount,
      passengers = [],
      peopleDetails = {},
      packageType = "compartido",
      tariffType = "externa",
      platform = "venso",
      agencyId = null,
      agencyName = "",
      useVensoHotelPricing = false,
      initialTc = null,
      onTcChange = null,
      readOnly = false,
      onOpenConflictModal = null,
      importedPackageInfo = null,
      perRoomPricing = [],
      hideServiceTotal = false,
    },
    ref,
  ) => {
    // ============================================
    // REFACTORED: Usando custom hooks
    // ============================================

    // Hook para UI (expansión de días, confirmación de eliminación)
    const {
      isDayExpanded,
      requestDeleteDay,
      updateExpandedDayAfterReorder,
      removeDayFromCollapsed,
      toggleDayExpansion,
      expandDay,
      setCollapsedDays,
    } = useDaysEditorUI();

    // Hook para modales de selección de servicios
    const {
      categoryModalOpen,
      setCategoryModalOpen,
      paxModalOpen,
      setPaxModalOpen,
      pendingSelection,
      setPendingSelection,
      openPassengerModalForEdit,
    } = useServicePickerModal();

    // Hook para modal de ciudades
    const {
      showCiudadesModal: ciudadesModalOpen,
      ciudadesDayIndex: currentDayForCiudades,
      openCiudadesModal,
      closeCiudadesModal: closeCiudadesModalHandler,
      setShowCiudadesModal: setCiudadesModalOpen,
      setCiudadesDayIndex: setCurrentDayForCiudades,
    } = useCiudadesManagement(null);

    // ============================================
    // Estados locales restantes
    // ============================================

    // Estado para modal de hotel
    const [hotelModalOpen, setHotelModalOpen] = useState(false);
    // hotelQuickModalOpen deprecado - ahora usamos solo hotelModalOpen

    // Estado para títulos de días del backend
    const [dayTitles, setDayTitles] = useState(() => extractDayTitleOptions(days));
    const [dayTitlesLoading, setDayTitlesLoading] = useState(true);

    // Fórmula: USD_nuevo = USD_base * TC_base / TC_nuevo
    // =========================
    const FX_BASE_TC = 3;
    const baseTcRef = useRef(FX_BASE_TC);

    // Inicializar TC desde prop guardada (si existe)
    const resolvedInitialTc =
      initialTc != null && Number(initialTc) > 0
        ? Number(initialTc)
        : FX_BASE_TC;

    // TC aplicado (el que recalcula precios)
    const [exchangeRate, setExchangeRate] = useState(resolvedInitialTc);
    // TC anterior (solo UI)
    const [prevExchangeRate, setPrevExchangeRate] = useState(resolvedInitialTc);
    // input controlado (para no recalcular por cada tecla)
    const [tcInput, setTcInput] = useState(String(resolvedInitialTc));
    const [showPendingTcModal, setShowPendingTcModal] = useState(false);
    const [pendingTcTargetRate, setPendingTcTargetRate] = useState(null);

    // Base en memoria por service.id (NO localStorage)
    const fxBaseRef = useRef(new Map());

    const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

    const normalizeRoomLabel = useCallback((value) => {
      const raw = String(value || "Habitacion")
        .replace(/^habitacion\s+/i, "")
        .trim();
      return raw || "Habitacion";
    }, []);

    const getRoomRank = useCallback((label, capacity = 0) => {
      const text = String(label || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const cap = Math.max(1, Number(capacity || 0));
      if (
        text.includes("simple") ||
        text.includes("single") ||
        text.includes("individual") ||
        cap === 1
      ) {
        return 1;
      }
      if (
        text.includes("doble") ||
        text.includes("double") ||
        text.includes("matrimonial") ||
        text.includes("twin") ||
        cap === 2
      ) {
        return 2;
      }
      if (text.includes("triple") || cap === 3) return 3;
      return 10 + cap;
    }, []);

    const buildHotelRoomPartsFromServices = useCallback(
      (services = [], fallbackAdults = 1) => {
        const hotelServices = (services || []).filter((service) => {
          const type = detectServiceType(service);
          return (
            type === "hoteles" ||
            type === "hotel" ||
            service?.autoAddedHotel ||
            service?.autoHotel
          );
        });

        const grouped = new Map();
        hotelServices.forEach((service, index) => {
          const label = normalizeRoomLabel(
            service?.childService?.tipo_habitacion ||
              service?.serviceDetails?.tipo_habitacion ||
              service?.roomKey ||
              service?.nombre ||
              `Habitacion ${index + 1}`,
          );
          const capacity = getRoomCapacityByType(label);
          const key = String(service?.roomKey || label).toLowerCase();
          const current = grouped.get(key) || {
            key,
            label,
            capacity,
            roomCount: 0,
            total: 0,
          };

          const hasExplicitAdultSplit =
            service?.roomAdultBeneficiaries != null ||
            service?.roomConvertedChildBeneficiaries != null;
          current.roomCount += Math.max(1, Number(service?.roomCount || 1));
          const adultBeneficiaries = Number(
            service?.roomAdultBeneficiaries || 0,
          );
          if (hasExplicitAdultSplit && adultBeneficiaries <= 0) {
            grouped.set(key, current);
            return;
          }
          const roomTotal = Number(
            service?.tariff?.precio_original ?? service?.tariff?.precio ?? 0,
          );
          const unitShare = Number(service?.hotelAdultUnitPrice || 0);
          current.beneficiaries = Math.max(
            current.beneficiaries || 0,
            adultBeneficiaries,
          );
          current.total +=
            adultBeneficiaries > 0 && unitShare > 0
              ? unitShare * adultBeneficiaries
              : roomTotal;
          current.capacity = Math.max(current.capacity, capacity);
          grouped.set(key, current);
        });

        let remaining = Math.max(1, Number(fallbackAdults || 0));
        return Array.from(grouped.values())
          .sort(
            (a, b) =>
              getRoomRank(a.label, a.capacity) -
              getRoomRank(b.label, b.capacity),
          )
          .map((room) => {
            const maxBeneficiaries =
              Math.max(1, room.capacity) * Math.max(1, room.roomCount);
            const beneficiaries =
              room.beneficiaries > 0
                ? room.beneficiaries
                : Math.max(1, Math.min(maxBeneficiaries, remaining));
            if (!room.beneficiaries) {
              remaining = Math.max(0, remaining - beneficiaries);
            }

            return {
              ...room,
              beneficiaries,
              value: round2(room.total / beneficiaries),
            };
          })
          .filter((room) => room.value > 0);
      },
      [getRoomRank, normalizeRoomLabel],
    );

    const buildHotelConvertedRoomPartsFromServices = useCallback(
      (services = []) => {
        const grouped = new Map();
        (services || []).forEach((service, index) => {
          const type = detectServiceType(service);
          if (
            type !== "hoteles" &&
            type !== "hotel" &&
            !service?.autoAddedHotel &&
            !service?.autoHotel
          ) {
            return;
          }

          const convertedBeneficiaries = Number(
            service?.roomConvertedChildBeneficiaries || 0,
          );
          if (convertedBeneficiaries <= 0) return;

          const label = normalizeRoomLabel(
            service?.childService?.tipo_habitacion ||
              service?.serviceDetails?.tipo_habitacion ||
              service?.roomKey ||
              service?.nombre ||
              `Habitacion ${index + 1}`,
          );
          const capacity = getRoomCapacityByType(label);
          const key = String(service?.roomKey || label).toLowerCase();
          const current = grouped.get(key) || {
            key,
            label,
            capacity,
            beneficiaries: 0,
            total: 0,
          };

          const roomTotal = Number(
            service?.tariff?.precio_original ?? service?.tariff?.precio ?? 0,
          );
          const unitShare = Number(service?.hotelAdultUnitPrice || 0);
          current.beneficiaries += convertedBeneficiaries;
          current.total +=
            unitShare > 0 ? unitShare * convertedBeneficiaries : roomTotal;
          grouped.set(key, current);
        });

        return Array.from(grouped.values())
          .sort(
            (a, b) =>
              getRoomRank(a.label, a.capacity) -
              getRoomRank(b.label, b.capacity),
          )
          .map((room) => ({
            ...room,
            value: round2(room.total / Math.max(1, room.beneficiaries)),
          }))
          .filter((room) => room.value > 0);
      },
      [getRoomRank, normalizeRoomLabel],
    );

    const buildHotelRoomPartsFromDays = useCallback(
      (daysList = [], fallbackAdults = 1) => {
        const totalsByRoom = new Map();
        (daysList || []).forEach((day) => {
          buildHotelRoomPartsFromServices(
            day?.servicios || [],
            fallbackAdults,
          ).forEach((part) => {
            const current = totalsByRoom.get(part.key) || {
              ...part,
              value: 0,
              beneficiaries: part.beneficiaries,
            };
            current.value = round2(current.value + part.value);
            current.beneficiaries = Math.max(
              current.beneficiaries,
              part.beneficiaries,
            );
            totalsByRoom.set(part.key, current);
          });
        });

        return Array.from(totalsByRoom.values()).sort(
          (a, b) =>
            getRoomRank(a.label, a.capacity) - getRoomRank(b.label, b.capacity),
        );
      },
      [buildHotelRoomPartsFromServices, getRoomRank],
    );

    const buildHotelConvertedRoomPartsFromDays = useCallback(
      (daysList = []) => {
        const totalsByRoom = new Map();
        (daysList || []).forEach((day) => {
          buildHotelConvertedRoomPartsFromServices(
            day?.servicios || [],
          ).forEach((part) => {
            const current = totalsByRoom.get(part.key) || {
              ...part,
              value: 0,
              beneficiaries: part.beneficiaries,
            };
            current.value = round2(current.value + part.value);
            current.beneficiaries = Math.max(
              current.beneficiaries,
              part.beneficiaries,
            );
            totalsByRoom.set(part.key, current);
          });
        });

        return Array.from(totalsByRoom.values()).sort(
          (a, b) =>
            getRoomRank(a.label, a.capacity) - getRoomRank(b.label, b.capacity),
        );
      },
      [buildHotelConvertedRoomPartsFromServices, getRoomRank],
    );

    // factor = TC_base / TC_actual
    const fxFactor = useMemo(() => {
      const tc = Number(exchangeRate) || FX_BASE_TC;
      return baseTcRef.current / tc;
    }, [exchangeRate]);

    const fromBase = useCallback(
      (vBase) => round2((Number(vBase) || 0) * fxFactor),
      [fxFactor],
    );

    const toBaseWithTc = useCallback((vNow, tcApplied) => {
      const tcA = Number(tcApplied) || baseTcRef.current;
      const tcB = baseTcRef.current;
      // vNow = vBase * tcB / tcA => vBase = vNow * tcA / tcB
      return round2((Number(vNow) || 0) * (tcA / tcB));
    }, []);

    const buildBaseForService = useCallback(
      (service, tcApplied = baseTcRef.current) => {
        const t = service?.tariff || {};

        const precioNow = t.precio ?? 0;
        const precioOriginalNow = t.precio_original ?? t.precio ?? 0;

        const childExtrasNow =
          t.childExtrasTotal ?? service?.assignedChildExplicitPriceSum ?? 0;

        const precio_internoNow =
          t.precio_interno ?? t.precioInterno ?? undefined;
        const precioInternoNow = t.precioInterno ?? undefined;
        const basePriceNow = t.basePrice ?? undefined;

        const mapNow = service?.assignedChildExplicitPriceMap || {};
        const mapBase = Object.fromEntries(
          Object.entries(mapNow).map(([k, v]) => [
            k,
            toBaseWithTc(v, tcApplied),
          ]),
        );

        return {
          precio: toBaseWithTc(precioNow, tcApplied),
          precio_original: toBaseWithTc(precioOriginalNow, tcApplied),
          childExtrasTotal: toBaseWithTc(childExtrasNow, tcApplied),
          precio_interno:
            precio_internoNow != null
              ? toBaseWithTc(precio_internoNow, tcApplied)
              : undefined,
          precioInterno:
            precioInternoNow != null
              ? toBaseWithTc(precioInternoNow, tcApplied)
              : undefined,
          basePrice:
            basePriceNow != null
              ? toBaseWithTc(basePriceNow, tcApplied)
              : undefined,
          assignedChildExplicitPriceMap: mapBase,
        };
      },
      [toBaseWithTc],
    );

    const applyFxToService = useCallback(
      (service) => {
        if (!service?.id) return service;

        // FIX: si el servicio ya fue convertido al TC actual, no re-procesar
        if (
          service?.fxMeta &&
          Number(service.fxMeta.tcApplied) === Number(exchangeRate)
        ) {
          return service;
        }

        // OJO: si el servicio ya tenía un tcApplied, úsalo solo para construir base si no existe
        const tcApplied = service?.fxMeta?.tcApplied ?? baseTcRef.current;

        let base = fxBaseRef.current.get(service.id);
        if (!base) {
          base = buildBaseForService(service, tcApplied);
          fxBaseRef.current.set(service.id, base);
        }

        const t = service.tariff ? { ...service.tariff } : {};

        const precio = fromBase(base.precio);
        const precio_original = fromBase(base.precio_original);
        const childExtrasTotal = fromBase(base.childExtrasTotal);

        t.precio = precio;
        t.precio_original = precio_original;
        t.childExtrasTotal = childExtrasTotal;
        t.precio_original_with_child_extras = round2(
          precio_original + childExtrasTotal,
        );

        if (base.precio_interno != null)
          t.precio_interno = fromBase(base.precio_interno);
        if (base.precioInterno != null)
          t.precioInterno = fromBase(base.precioInterno);
        if (base.basePrice != null) t.basePrice = fromBase(base.basePrice);

        // niños
        const mapBase = base.assignedChildExplicitPriceMap || {};
        const mapNow = Object.fromEntries(
          Object.entries(mapBase).map(([k, v]) => [k, fromBase(v)]),
        );
        const assignedChildExplicitPriceSum = round2(
          Object.values(mapNow).reduce((s, v) => s + (Number(v) || 0), 0),
        );

        return {
          ...service,
          tariff: t,
          assignedChildExplicitPriceMap: mapNow,
          assignedChildExplicitPriceSum,
          passengerSelection: {
            ...service.passengerSelection,
            assignedChildExplicitPriceMap: mapNow,
            assignedChildExplicitPriceSum,
          },
          fxMeta: {
            ...(service.fxMeta || {}),
            tcApplied: exchangeRate,
            baseTc: baseTcRef.current,
          },
        };
      },
      [buildBaseForService, exchangeRate, fromBase],
    );

    // Helper: marca servicios tren bimodal con prompt pendiente (solo si aún no fue atendido)
    const markBimodalIfNeeded = useCallback((service) => service, []);

    // La TC comercial se aplica solo de forma explícita. Si existen servicios
    // todavía cotizados con otra TC, primero se pide confirmación y se evita
    // alterar servicios ya asignados operacionalmente en Reservas.
    const applyTc = useCallback(() => {
      const next = Number(tcInput);
      if (!next || next <= 0) {
        setTcInput(String(exchangeRate));
        return;
      }

      const pending = collectPendingQuotationExchangeRateServices(days, next, {
        isLocked: isOperationallyAssignedService,
      });
      const pendingCount = pending.reduce(
        (sum, day) => sum + day.services.length,
        0,
      );

      if (pendingCount > 0) {
        setPendingTcTargetRate(next);
        setShowPendingTcModal(true);
        return;
      }

      if (Math.abs(Number(exchangeRate) - next) > 0.0001) {
        setPrevExchangeRate(exchangeRate);
        setExchangeRate(next);
      }
      setTcInput(String(next));
    }, [tcInput, exchangeRate, days]);

    // mantener input sincronizado con el TC aplicado
    useEffect(() => {
      setTcInput(String(exchangeRate));
      // Propagar TC al componente padre para persistencia
      if (onTcChange) onTcChange(exchangeRate);
    }, [exchangeRate, onTcChange]);

    // Cargar títulos reutilizados desde backend y mezclar con los del editor actual.
    useEffect(() => {
      let mounted = true;
      const loadDayTitles = async () => {
        setDayTitlesLoading(true);
        try {
          const response = await axiosInstance.get("/turismo/cotizaciones/day-titles");
          if (!mounted) return;
          const backendTitles = normalizeDayTitleOptions(response?.data?.data || []);
          setDayTitles((current) => mergeDayTitleOptions(current, backendTitles));
        } catch (error) {
          if (mounted) console.error("Error cargando títulos de días:", error);
        } finally {
          if (mounted) setDayTitlesLoading(false);
        }
      };
      loadDayTitles();
      return () => { mounted = false; };
    }, []);

    useEffect(() => {
      const localTitles = extractDayTitleOptions(days);
      if (localTitles.length === 0) return;
      setDayTitles((current) => mergeDayTitleOptions(current, localTitles));
    }, [days]);

    // Normalizar servicios: asignar IDs únicos a los que no tengan
    useEffect(() => {
      if (!days || days.length === 0) return;

      let needsUpdate = false;
      const normalizedDays = days.map((day, dayIndex) => {
        if (!Array.isArray(day.servicios) || day.servicios.length === 0)
          return day;

        const normalizedServices = day.servicios.map(
          (service, serviceIndex) => {
            if (service.id) return service;

            needsUpdate = true;
            const serviceType =
              service.parentService?.typeService ||
              service.typeService ||
              "service";
            const uniqueId = `${serviceType}-d${dayIndex}-s${serviceIndex}-${Date.now()}-${Math.random()
              .toString(36)
              .substr(2, 6)}`;
            return { ...service, id: uniqueId };
          },
        );

        if (normalizedServices === day.servicios) return day;
        return { ...day, servicios: normalizedServices };
      });

      if (needsUpdate) {
        setDays(normalizedDays);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [days?.length, days?.map((d) => d.servicios?.length).join(",")]);

    // Mantener el snapshot base legacy disponible, pero NO aplicar TC de forma
    // automática. Esto evita que cambiar el input modifique silenciosamente el
    // precio por persona/niños y protege cualquier asignación ya vendida.
    useEffect(() => {
      if (!days?.length) return;

      days.forEach((day) => {
        (day.servicios || []).forEach((svc) => {
          if (!svc?.id) return;
          if (!fxBaseRef.current.has(svc.id)) {
            const tcApplied = resolveServiceExchangeRate(svc);
            fxBaseRef.current.set(svc.id, buildBaseForService(svc, tcApplied));
          }
        });
      });
    }, [days, buildBaseForService]);

    const applyQuotationTcToService = useCallback(
      (dayIndex, serviceIndex) => {
        setDays((prevDays) => {
          const current = prevDays?.[dayIndex]?.servicios?.[serviceIndex];
          if (!current || isOperationallyAssignedService(current)) return prevDays;

          const converted = applyQuotationExchangeRateToService(
            current,
            exchangeRate,
          );
          if (converted === current) return prevDays;

          const nextDays = [...prevDays];
          const nextDay = { ...nextDays[dayIndex] };
          nextDay.servicios = [...(nextDay.servicios || [])];
          nextDay.servicios[serviceIndex] = converted;
          nextDays[dayIndex] = nextDay;

          if (converted?.id) {
            fxBaseRef.current.set(
              converted.id,
              buildBaseForService(converted, exchangeRate),
            );
          }
          return nextDays;
        });
      },
      [buildBaseForService, exchangeRate, setDays],
    );

    // NOTE: Passenger price recalculation is handled by EdicionCotizacion's useEffect
    // which calls recalcItineraryPrices() via setDays(). This avoids the remount timing
    // issue where DaysEditor unmounts during PeopleSelection step and loses its refs.

    // Total de pasajeros
    const totalPassengers = React.useMemo(() => {
      if (peopleDetails && (peopleDetails.adults || peopleDetails.children)) {
        const a = (peopleDetails.adults || []).length;
        const c = (peopleDetails.children || []).length;
        return Math.max(1, a + c);
      }
      if (passengers && passengers.length > 0) return passengers.length;
      return Math.max(1, adultsCount ?? 1);
    }, [passengers, peopleDetails, adultsCount]);

    const pendingTcPreviewRate =
      Number(pendingTcTargetRate) > 0
        ? Number(pendingTcTargetRate)
        : Number(exchangeRate);

    const pendingExchangeRateServices = useMemo(
      () =>
        collectPendingQuotationExchangeRateServices(days, pendingTcPreviewRate, {
          isLocked: isOperationallyAssignedService,
        }),
      [days, pendingTcPreviewRate],
    );

    const pendingExchangeRateServiceCount = useMemo(
      () =>
        pendingExchangeRateServices.reduce(
          (sum, day) => sum + day.services.length,
          0,
        ),
      [pendingExchangeRateServices],
    );

    const closePendingTcModal = useCallback(() => {
      setShowPendingTcModal(false);
      setPendingTcTargetRate(null);
      setTcInput(String(exchangeRate));
    }, [exchangeRate]);

    const applyQuotationTcToAllPendingServices = useCallback(() => {
      const targetRate = Number(pendingTcPreviewRate);
      if (!targetRate || targetRate <= 0) {
        closePendingTcModal();
        return;
      }

      setDays((prevDays) => {
        const result = applyQuotationExchangeRateToDayServices(
          prevDays,
          targetRate,
          {
            isLocked: isOperationallyAssignedService,
            onServiceConverted: (converted) => {
              if (converted?.id) {
                fxBaseRef.current.set(
                  converted.id,
                  buildBaseForService(converted, targetRate),
                );
              }
            },
          },
        );
        return result.mutated ? result.days : prevDays;
      });

      if (Math.abs(Number(exchangeRate) - targetRate) > 0.0001) {
        setPrevExchangeRate(exchangeRate);
        setExchangeRate(targetRate);
      }
      setTcInput(String(targetRate));
      setShowPendingTcModal(false);
      setPendingTcTargetRate(null);
    }, [
      buildBaseForService,
      closePendingTcModal,
      exchangeRate,
      pendingTcPreviewRate,
      setDays,
    ]);

    // Conteo de transportes con capacidad insuficiente
    const transportConflictCount = React.useMemo(() => {
      let count = 0;
      for (const day of days || []) {
        for (const s of day.servicios || []) {
          const ts = (
            s?.parentService?.typeService ||
            s?.typeService ||
            ""
          ).toLowerCase();
          if (ts !== "transportes") continue;
          const cap = parseInt(s?.childService?.nro_pasajeros) || 0;
          if (cap > 0 && cap < totalPassengers) count++;
        }
      }
      return count;
    }, [days, totalPassengers]);

    // Array completo de pasajeros
    const getAllPassengers = React.useMemo(() => {
      if (peopleDetails && (peopleDetails.adults || peopleDetails.children)) {
        return [
          ...(peopleDetails.adults || []),
          ...(peopleDetails.children || []),
        ];
      }
      return passengers || [];
    }, [passengers, peopleDetails]);

    // Subtotal por día
    const getCalculatedDaySubtotal = (services) =>
      calculateDaySubtotalDetailed(services, peopleDetails);

    // Totales generales
    const getCalculatedGeneralTotal = () =>
      calculateGeneralTotalsDetailed(days, peopleDetails);

    // Estados UI para edición de precios
    const [editingPrice, setEditingPrice] = useState({
      dayIndex: null,
      serviceIndex: null,
      isDiscount: false,
      mode: null,
      value: "",
      isDirectEdit: false,
      isGroupEdit: false,
      editType: "total",
      error: "",
    });

    // Estado para editar precios de niños
    const [editingChildPrice, setEditingChildPrice] = useState({
      dayIndex: null,
      serviceIndex: null,
      isOpen: false,
      mode: "fixed",
      value: "",
      percentage: "",
    });

    // Estado y handlers para Tren Bimodal (retorno)
    const [bimodalPrompt, setBimodalPrompt] = useState({
      open: false,
      serviceId: null,
      sourceDayIndex: null,
      targetDayIndex: null,
    });

    const handleConfirmBimodalReturn = () => {
      setBimodalPrompt({
        open: false,
        serviceId: null,
        sourceDayIndex: null,
        targetDayIndex: null,
      });
    };

    const handleCancelBimodalReturn = () => {
      setBimodalPrompt({
        open: false,
        serviceId: null,
        sourceDayIndex: null,
        targetDayIndex: null,
      });
    };

    // Estado para drag and drop
    const [activeId, setActiveId] = useState(null);
    const [activeItem, setActiveItem] = useState(null);

    // Abrir modal de selección de pasajeros para un servicio EXISTENTE
    const handleOpenPassengerSelectorForService = (dayIndex, serviceIndex) => {
      const service = days?.[dayIndex]?.servicios?.[serviceIndex];
      if (!service) return;

      setPendingSelection({
        mode: "editService",
        dayIndex,
        serviceIndex,
        preselectedIds: service.assignedPassengerIds || [],
        prevLen: days?.[dayIndex]?.servicios?.length ?? 0,
      });

      setPaxModalOpen(true);
    };

    // Abrir editor de precio de niños
    const handleEditChildPrice = (dayIndex, serviceIndex) => {
      const service = days?.[dayIndex]?.servicios?.[serviceIndex];
      if (!service) return;

      // Cerrar editor de adulto si está abierto
      setEditingPrice({
        dayIndex: null,
        serviceIndex: null,
        isDiscount: false,
        mode: null,
        value: "",
        isDirectEdit: false,
        isGroupEdit: false,
        editType: "total",
        error: "",
      });

      const currentMode = service.pricingMode || "fixed";
      const childExtrasTotal = Number(
        service?.tariff?.childExtrasTotal ||
          service?.assignedChildExplicitPriceSum ||
          0,
      );
      const assignedIds = service.assignedPassengerIds || [];
      const childCount = assignedIds.filter((id) =>
        id.startsWith("child:"),
      ).length;
      const childUnitPrice = childCount > 0 ? childExtrasTotal / childCount : 0;
      const currentPercentage = service.uniformPercentage || "";

      setEditingChildPrice({
        dayIndex,
        serviceIndex,
        isOpen: true,
        mode: currentMode,
        value: childUnitPrice > 0 ? childUnitPrice.toString() : "",
        percentage: currentPercentage,
      });
    };

    // Aplicar precio de niños
    const applyChildPrice = () => {
      const { dayIndex, serviceIndex, mode, value, percentage } =
        editingChildPrice;

      if (dayIndex === null || serviceIndex === null) return;

      const service = days?.[dayIndex]?.servicios?.[serviceIndex];
      if (!service) return;

      const assignedIds =
        service.assignedPassengerIds ||
        service.passengerSelection?.selectedIds ||
        [];
      const childIds = assignedIds.filter((id) => id.startsWith("child:"));
      const adultUnitPrice = parseFloat(
        service.tariff?.precio || service.precio || 0,
      );

      let newChildPriceMap = {};
      let newChildExtrasTotal = 0;

      if (mode === "fixed") {
        const fixedPrice = parseFloat(value) || 0;
        childIds.forEach((childId) => {
          newChildPriceMap[childId] = fixedPrice;
        });
        newChildExtrasTotal = fixedPrice * childIds.length;
      } else if (mode === "percentage") {
        const pct = parseFloat(percentage) || 0;
        const childPrice = (pct / 100) * adultUnitPrice;
        childIds.forEach((childId) => {
          newChildPriceMap[childId] = childPrice;
        });
        newChildExtrasTotal = childPrice * childIds.length;
      }

      setDays((prevDays) => {
        const newDays = [...prevDays];
        const newService = { ...newDays[dayIndex].servicios[serviceIndex] };

        newService.pricingMode = mode;
        newService.assignedChildExplicitPriceMap = newChildPriceMap;
        newService.assignedChildExplicitPriceSum = newChildExtrasTotal;
        newService.uniformPercentage = mode === "percentage" ? percentage : "";
        newService.hasChildExplicitPrices = true;

        if (newService.tariff) {
          newService.tariff = {
            ...newService.tariff,
            childExtrasTotal: newChildExtrasTotal,
            precio_original_with_child_extras:
              parseFloat(newService.tariff.precio_original || 0) +
              newChildExtrasTotal,
          };
        }

        newService.passengerSelection = {
          ...newService.passengerSelection,
          selectedIds: assignedIds,
          assignedPassengerCount: assignedIds.length,
          hasChildExplicitPrices: true,
          assignedChildExplicitCount: childIds.length,
          assignedChildExplicitPriceMap: newChildPriceMap,
          assignedChildExplicitPriceSum: newChildExtrasTotal,
          pricingMode: mode,
          uniformPercentage: mode === "percentage" ? percentage : "",
          childPercentageMap:
            mode === "percentage"
              ? Object.fromEntries(childIds.map((id) => [id, percentage]))
              : {},
        };

        newService.fxMeta = {
          ...(newService.fxMeta || {}),
          tcApplied: exchangeRate,
          baseTc: baseTcRef.current,
        };

        newDays[dayIndex].servicios[serviceIndex] = newService;
        return newDays;
      });

      setEditingChildPrice({
        dayIndex: null,
        serviceIndex: null,
        isOpen: false,
        mode: "fixed",
        value: "",
        percentage: "",
      });
    };

    // Cancelar edición de precio de niños
    const cancelChildPriceEdit = () => {
      setEditingChildPrice({
        dayIndex: null,
        serviceIndex: null,
        isOpen: false,
        mode: "fixed",
        value: "",
        percentage: "",
      });
    };

    // NUEVO: Aplicar precio uniforme a todos los niños directamente (sin modal)
    const applyUniformChildPrice = (
      dayIndex,
      serviceIndex,
      priceType,
      customValue = null,
    ) => {
      if (dayIndex === null || serviceIndex === null) return;

      const service = days?.[dayIndex]?.servicios?.[serviceIndex];
      if (!service) return;

      const assignedIds =
        service.assignedPassengerIds ||
        service.passengerSelection?.selectedIds ||
        [];
      // Use beneficiary snapshot so services without assignedPassengerIds
      // (tickets, restaurantes, extras) get the correct child/adult IDs
      const benefSnap = getServiceBeneficiarySnapshot(service);
      const allChildIds =
        benefSnap.allChildIds.length > 0
          ? benefSnap.allChildIds
          : assignedIds.filter((id) => id.startsWith("child:"));
      const childIds =
        benefSnap.childIds.length > 0 ? benefSnap.childIds : allChildIds;
      const benefAdultCount = benefSnap.adultIds.length;
      const snapSelectedIds = benefSnap.selectedIds;
      const materializedAssignedIds =
        assignedIds.length > 0 ? assignedIds : snapSelectedIds;
      const adultUnitPrice = parseFloat(
        service.tariff?.precio || service.precio || 0,
      );

      let newChildPriceMap = {};
      let newChildExtrasTotal = 0;
      let pricingMode = "fixed";
      let uniformPercentage = "";
      let bulkConvertedMap = null;

      switch (priceType) {
        case "zero":
          allChildIds.forEach((childId) => {
            newChildPriceMap[childId] = 0;
          });
          newChildExtrasTotal = 0;
          break;

        case "adult": {
          const existingConverted = service.convertedChildToAdultMap || {};
          bulkConvertedMap = { ...existingConverted };
          allChildIds.forEach((childId) => {
            bulkConvertedMap[childId] = true;
          });
          newChildPriceMap = {};
          newChildExtrasTotal = 0;
          pricingMode = "adult";
          break;
        }

        case "percentage": {
          const pct = parseFloat(customValue) || 50;
          const childPricePct = (pct / 100) * adultUnitPrice;
          allChildIds.forEach((childId) => {
            newChildPriceMap[childId] = childPricePct;
          });
          newChildExtrasTotal = childPricePct * allChildIds.length;
          pricingMode = "percentage";
          uniformPercentage = pct.toString();
          break;
        }

        case "fixed": {
          const fixedPrice = parseFloat(customValue) || 0;
          allChildIds.forEach((childId) => {
            newChildPriceMap[childId] = fixedPrice;
          });
          newChildExtrasTotal = fixedPrice * allChildIds.length;
          break;
        }

        default:
          return;
      }

      const isAdultConversion = priceType === "adult";

      setDays((prevDays) => {
        const newDays = [...prevDays];
        const newService = { ...newDays[dayIndex].servicios[serviceIndex] };

        newService.pricingMode = pricingMode;
        // Materialize beneficiary IDs into assignedPassengerIds so that
        // handleRevertAdultToChild and subsequent operations have the correct
        // adult/child counts even when the service had no explicit assignment.
        if (
          !newService.assignedPassengerIds?.length &&
          snapSelectedIds.length > 0
        ) {
          newService.assignedPassengerIds = snapSelectedIds;
        }
        newService.assignedChildExplicitPriceMap = newChildPriceMap;
        newService.assignedChildExplicitPriceSum = newChildExtrasTotal;
        newService.uniformPercentage = uniformPercentage;
        newService.hasChildExplicitPrices =
          !isAdultConversion && allChildIds.length > 0;
        newService.assignedChildExplicitCount = isAdultConversion
          ? 0
          : allChildIds.length;
        newService.treatChildrenAsAdults = isAdultConversion;

        if (isAdultConversion) {
          newService.convertedChildToAdultMap = bulkConvertedMap;
        } else {
          newService.convertedChildToAdultMap = {};
        }

        if (newService.tariff) {
          const svcTypeStr = (
            newService.parentService?.typeService ||
            newService.typeService ||
            ""
          ).toLowerCase();
          const isHotelSvc = svcTypeStr === "hoteles";
          const isDividedSvc =
            svcTypeStr === "transportes" ||
            svcTypeStr === "guias" ||
            (svcTypeStr === "endoses" && getTourCapacity(newService) != null);
          const realAdultCount =
            materializedAssignedIds.filter((id) => !id.startsWith("child:"))
              .length || benefAdultCount;
          const convCount = isAdultConversion ? allChildIds.length : 0;
          const effectiveCount = Math.max(1, realAdultCount + convCount);

          if (!isHotelSvc) {
            if (isDividedSvc) {
              const basePrice = parseFloat(
                newService.tariff.precio_original || 0,
              );
              if (basePrice > 0) {
                newService.tariff = {
                  ...newService.tariff,
                  precio: Math.round((basePrice / effectiveCount) * 100) / 100,
                  childExtrasTotal: newChildExtrasTotal,
                  precio_original_with_child_extras:
                    basePrice + newChildExtrasTotal,
                };
              }
            } else {
              const unitPrice = parseFloat(newService.tariff.precio || 0);
              const newPrecioOriginal =
                Math.round(unitPrice * effectiveCount * 100) / 100;
              newService.tariff = {
                ...newService.tariff,
                precio_original: newPrecioOriginal,
                childExtrasTotal: newChildExtrasTotal,
                precio_original_with_child_extras:
                  newPrecioOriginal + newChildExtrasTotal,
              };
            }
            delete newService.precio_adult;
          } else {
            newService.tariff = {
              ...newService.tariff,
              childExtrasTotal: newChildExtrasTotal,
              precio_original_with_child_extras:
                parseFloat(newService.tariff.precio_original || 0) +
                newChildExtrasTotal,
            };
          }
        }

        newService.passengerSelection = {
          ...newService.passengerSelection,
          selectedIds: materializedAssignedIds,
          assignedPassengerCount: materializedAssignedIds.length,
          hasChildExplicitPrices: !isAdultConversion && allChildIds.length > 0,
          assignedChildExplicitCount: isAdultConversion
            ? 0
            : allChildIds.length,
          assignedChildExplicitPriceMap: newChildPriceMap,
          assignedChildExplicitPriceSum: newChildExtrasTotal,
          pricingMode,
          uniformPercentage,
          treatChildrenAsAdults: isAdultConversion,
          convertedChildToAdultMap: isAdultConversion ? bulkConvertedMap : {},
          ninosComoAdulto: isAdultConversion ? bulkConvertedMap : {},
          preciosNinos: !isAdultConversion ? newChildPriceMap : undefined,
        };

        if (detectServiceType(newService) === "tickets") {
          const ticketChildPricingMode = isAdultConversion
            ? "adult_tariff"
            : "manual";
          const ticketChildrenUseStudentTariffAsAdult = isAdultConversion;
          newService.ticketChildPricingMode = ticketChildPricingMode;
          newService.ticketChildrenUseStudentTariffAsAdult =
            ticketChildrenUseStudentTariffAsAdult;
          newService.passengerSelection = {
            ...newService.passengerSelection,
            ticketChildPricingMode,
            ticketChildrenUseStudentTariffAsAdult,
          };
        }
        // Keep selectedIds in sync with the materialized assignedPassengerIds
        if (
          newService.assignedPassengerIds?.length &&
          newService.passengerSelection?.selectedIds !==
            newService.assignedPassengerIds
        ) {
          newService.passengerSelection.selectedIds =
            newService.assignedPassengerIds;
          newService.passengerSelection.assignedPassengerCount =
            newService.assignedPassengerIds.length;
        }

        newService.fxMeta = {
          ...(newService.fxMeta || {}),
          tcApplied: exchangeRate,
          baseTc: baseTcRef.current,
        };

        newDays[dayIndex].servicios[serviceIndex] = newService;
        return newDays;
      });
    };

    // NUEVO: Aplicar precio individual a un niño específico
    const applyIndividualChildPrice = (
      dayIndex,
      serviceIndex,
      childId,
      priceType,
      customValue,
    ) => {
      if (dayIndex === null || serviceIndex === null || !childId) return;

      const service = days?.[dayIndex]?.servicios?.[serviceIndex];
      if (!service) return;

      const adultUnitPrice = parseFloat(
        service.tariff?.precio || service.precio || 0,
      );
      let newChildPrice = 0;

      switch (priceType) {
        case "zero":
          newChildPrice = 0;
          break;
        case "adult":
          newChildPrice = adultUnitPrice;
          break;
        case "percentage": {
          const pct = parseFloat(customValue) || 0;
          newChildPrice = (pct / 100) * adultUnitPrice;
          break;
        }
        case "fixed":
          newChildPrice = parseFloat(customValue) || 0;
          break;
        default:
          return;
      }

      setDays((prevDays) => {
        const newDays = [...prevDays];
        const newService = { ...newDays[dayIndex].servicios[serviceIndex] };

        const isAdultEquivalent = priceType === "adult";
        const currentSnapshot = getServiceBeneficiarySnapshot(newService);
        const selectedIds =
          newService.assignedPassengerIds?.length > 0
            ? newService.assignedPassengerIds
            : currentSnapshot.selectedIds;
        const canonicalChildId =
          findPassengerIdBySlot(selectedIds, childId, isChildPassengerId) ||
          childId;
        const currentChildPriceMap = removeChildSlotFromPriceMap(
          newService.assignedChildExplicitPriceMap || {},
          canonicalChildId,
        );
        const nextConvertedMap = removeChildSlotFromConvertedMap(
          {
            ...(currentSnapshot.pricingState?.convertedChildToAdultMap || {}),
            ...(newService.convertedChildToAdultMap || {}),
            ...(newService.passengerSelection?.convertedChildToAdultMap || {}),
            ...(newService.passengerSelection?.ninosComoAdulto || {}),
          },
          canonicalChildId,
        );

        if (isAdultEquivalent) {
          nextConvertedMap[canonicalChildId] = true;
        } else {
          currentChildPriceMap[canonicalChildId] = newChildPrice;
        }

        const materializedAssignedIds = materializeChildInAssignedIds(
          selectedIds,
          canonicalChildId,
        );

        const sanitizedConvertedMap = isAdultEquivalent
          ? nextConvertedMap
          : removeChildSlotFromConvertedMap(nextConvertedMap, canonicalChildId);

        const finalChildPriceMap = isAdultEquivalent
          ? removeChildSlotFromPriceMap(currentChildPriceMap, canonicalChildId)
          : currentChildPriceMap;

        newService.assignedPassengerIds = materializedAssignedIds;
        newService.assignedChildExplicitPriceMap = finalChildPriceMap;
        newService.convertedChildToAdultMap = sanitizedConvertedMap;

        const newChildExtrasTotal = Object.values(finalChildPriceMap).reduce(
          (sum, price) => sum + (parseFloat(price) || 0),
          0,
        );

        newService.assignedChildExplicitPriceSum = newChildExtrasTotal;
        newService.hasChildExplicitPrices =
          Object.keys(finalChildPriceMap).length > 0;
        newService.assignedChildExplicitCount =
          Object.keys(finalChildPriceMap).length;
        newService.pricingMode = isAdultEquivalent ? "adult" : "fixed";
        newService.treatChildrenAsAdults = false;

        if (newService.tariff) {
          newService.tariff = {
            ...newService.tariff,
            childExtrasTotal: newChildExtrasTotal,
            precio_original_with_child_extras:
              parseFloat(newService.tariff.precio_original || 0) +
              newChildExtrasTotal,
          };
        }

        newService.passengerSelection = {
          ...newService.passengerSelection,
          selectedIds: materializedAssignedIds,
          assignedPassengerCount: materializedAssignedIds.length,
          hasChildExplicitPrices: Object.keys(finalChildPriceMap).length > 0,
          assignedChildExplicitCount: Object.keys(finalChildPriceMap).length,
          assignedChildExplicitPriceMap: finalChildPriceMap,
          assignedChildExplicitPriceSum: newChildExtrasTotal,
          convertedChildToAdultMap: sanitizedConvertedMap,
          ninosComoAdulto: sanitizedConvertedMap,
          pricingMode: isAdultEquivalent ? "adult" : "fixed",
          treatChildrenAsAdults: false,
          preciosNinos: finalChildPriceMap,
        };

        if (!isAdultEquivalent) {
          Object.assign(
            newService,
            cleanLegacyChildBeneficiaries(
              newService,
              canonicalChildId,
              newChildPrice,
            ),
          );
        }

        if (detectServiceType(newService) === "tickets") {
          const ticketChildPricingMode = isAdultEquivalent
            ? "adult_tariff"
            : "manual";
          const ticketChildrenUseStudentTariffAsAdult = isAdultEquivalent;
          newService.ticketChildPricingMode = ticketChildPricingMode;
          newService.ticketChildrenUseStudentTariffAsAdult =
            ticketChildrenUseStudentTariffAsAdult;
          newService.passengerSelection = {
            ...newService.passengerSelection,
            ticketChildPricingMode,
            ticketChildrenUseStudentTariffAsAdult,
          };
        }

        newService.fxMeta = {
          ...(newService.fxMeta || {}),
          tcApplied: exchangeRate,
          baseTc: baseTcRef.current,
        };

        newDays[dayIndex].servicios[serviceIndex] = newService;
        return newDays;
      });
    };

    // NUEVO: Convertir un niño a adulto en un servicio específico
    const handleConvertChildToAdult = (
      dayIndex,
      serviceIndex,
      childIdToConvert,
    ) => {
      if (dayIndex === null || serviceIndex === null || !childIdToConvert)
        return;

      setDays((prevDays) => {
        const newDays = [...prevDays];
        const day = { ...newDays[dayIndex] };
        if (!day || !day.servicios || !day.servicios[serviceIndex])
          return prevDays;

        day.servicios = [...day.servicios];
        const service = { ...day.servicios[serviceIndex] };
        const serviceSnapshot = getServiceBeneficiarySnapshot(service);
        const baseAssignedIds =
          service.assignedPassengerIds?.length > 0
            ? service.assignedPassengerIds
            : serviceSnapshot.selectedIds;
        const canonicalChildId =
          findPassengerIdBySlot(
            baseAssignedIds,
            childIdToConvert,
            isChildPassengerId,
          ) || childIdToConvert;
        const assignedIds = materializeChildInAssignedIds(
          baseAssignedIds,
          canonicalChildId,
        );

        const convertedMap = removeChildSlotFromConvertedMap(
          {
            ...(serviceSnapshot.pricingState?.convertedChildToAdultMap || {}),
            ...(service.convertedChildToAdultMap || {}),
            ...(service.passengerSelection?.convertedChildToAdultMap || {}),
            ...(service.passengerSelection?.ninosComoAdulto || {}),
          },
          canonicalChildId,
        );
        convertedMap[canonicalChildId] = true;
        service.convertedChildToAdultMap = convertedMap;

        service.assignedPassengerIds = assignedIds;

        const adultCount = assignedIds.filter(isAdultPassengerId).length;
        const convertedChildCount = Object.entries(convertedMap).filter(
          ([key, value]) =>
            (isChildPassengerId(key) && value) ||
            isChildPassengerId(value),
        ).length;
        const newAdultCount = adultCount + convertedChildCount;

        const childPriceMap = removeChildSlotFromPriceMap(
          service.assignedChildExplicitPriceMap || {},
          canonicalChildId,
        );

        const newChildExtrasTotal = Object.values(childPriceMap).reduce(
          (sum, price) => sum + (parseFloat(price) || 0),
          0,
        );
        const remainingChildCount = Object.keys(childPriceMap).length;

        service.assignedChildExplicitPriceMap = childPriceMap;
        service.assignedChildExplicitPriceSum = newChildExtrasTotal;
        service.hasChildExplicitPrices = remainingChildCount > 0;
        service.assignedChildExplicitCount = remainingChildCount;
        service.pricingMode = "fixed";
        service.treatChildrenAsAdults = false;

        const serviceType =
          service.typeService ||
          service.parentService?.typeService ||
          service.serviceCategory ||
          "";
        const isDividedPricing =
          serviceType === "transportes" ||
          serviceType === "guias" ||
          (serviceType === "endoses" && getTourCapacity(service) != null);

        const isHotel = serviceType === "hoteles";

        if (isDividedPricing) {
          const basePrice = parseFloat(service.tariff?.precio_original || 0);
          if (basePrice > 0) {
            const newDividedPrice = basePrice / newAdultCount;
            service.tariff = {
              ...service.tariff,
              precio: Math.round(newDividedPrice * 100) / 100,
              childExtrasTotal: newChildExtrasTotal,
              precio_original_with_child_extras:
                basePrice + newChildExtrasTotal,
            };
          }
        } else if (isHotel) {
          if (service.tariff) {
            service.tariff = {
              ...service.tariff,
              childExtrasTotal: newChildExtrasTotal,
              precio_original_with_child_extras:
                parseFloat(service.tariff.precio_original || 0) +
                newChildExtrasTotal,
            };
          }
        } else {
          if (service.tariff) {
            const unitPrice = parseFloat(service.tariff.precio || 0);
            const newPrecioOriginal = unitPrice * Math.max(1, newAdultCount);
            service.tariff = {
              ...service.tariff,
              precio_original: newPrecioOriginal,
              childExtrasTotal: newChildExtrasTotal,
              precio_original_with_child_extras:
                newPrecioOriginal + newChildExtrasTotal,
            };
          }
        }

        if (
          service.pricingMode === "percentage" &&
          service.uniformPercentage &&
          remainingChildCount > 0
        ) {
          const percentage = parseFloat(service.uniformPercentage) || 0;
          const newUnitPrice = parseFloat(service.tariff?.precio || 0);
          const newChildPrice = (percentage / 100) * newUnitPrice;

          Object.keys(childPriceMap).forEach((childId) => {
            childPriceMap[childId] = newChildPrice;
          });

          const updatedChildExtrasTotal = Object.values(childPriceMap).reduce(
            (sum, price) => sum + (parseFloat(price) || 0),
            0,
          );
          service.assignedChildExplicitPriceMap = childPriceMap;
          service.assignedChildExplicitPriceSum = updatedChildExtrasTotal;

          if (service.tariff) {
            service.tariff.childExtrasTotal = updatedChildExtrasTotal;
            service.tariff.precio_original_with_child_extras =
              parseFloat(service.tariff.precio_original || 0) +
              updatedChildExtrasTotal;
          }
        }

        service.passengerSelection = {
          ...service.passengerSelection,
          selectedIds: assignedIds,
          assignedPassengerCount: assignedIds.length,
          convertedChildToAdultMap: { ...convertedMap },
          hasChildExplicitPrices: remainingChildCount > 0,
          assignedChildExplicitCount: remainingChildCount,
          assignedChildExplicitPriceMap: service.assignedChildExplicitPriceMap,
          assignedChildExplicitPriceSum: service.assignedChildExplicitPriceSum,
          pricingMode: "fixed",
          treatChildrenAsAdults: false,
          ninosComoAdulto: { ...convertedMap },
          preciosNinos: service.assignedChildExplicitPriceMap,
        };

        if (detectServiceType(service) === "tickets") {
          service.ticketChildPricingMode = "adult_tariff";
          service.ticketChildrenUseStudentTariffAsAdult = true;
          service.passengerSelection = {
            ...service.passengerSelection,
            ticketChildPricingMode: "adult_tariff",
            ticketChildrenUseStudentTariffAsAdult: true,
          };
        }

        service.fxMeta = {
          ...(service.fxMeta || {}),
          tcApplied: exchangeRate,
          baseTc: baseTcRef.current,
        };

        // Invalidar precio_adult cacheado para que el runtime recalcule desde tariff.precio
        delete service.precio_adult;
        day.servicios[serviceIndex] = service;
        newDays[dayIndex] = day;
        return newDays;
      });
    };

    /*
        const isTicketSvc = detectServiceType(newService) === "tickets";
        const currentChildPriceMap = {
          ...(newService.assignedChildExplicitPriceMap || {}),
        };
        const nextConvertedMap = {
          ...(newService.convertedChildToAdultMap || {}),
          ...(newService.passengerSelection?.convertedChildToAdultMap || {}),
          ...(newService.passengerSelection?.ninosComoAdulto || {}),
        };

        if (isTicketSvc && priceType === "adult") {
          delete currentChildPriceMap[childId];
          nextConvertedMap[childId] = true;
        } else {
          currentChildPriceMap[childId] = newChildPrice;
          delete nextConvertedMap[childId];
        }

        const newChildExtrasTotal = Object.values(currentChildPriceMap).reduce(
          (sum, price) => sum + (parseFloat(price) || 0),
          0,
        );

        newService.assignedChildExplicitPriceMap = currentChildPriceMap;
        newService.assignedChildExplicitPriceSum = newChildExtrasTotal;
        newService.hasChildExplicitPrices =
          Object.keys(currentChildPriceMap).length > 0;
        newService.convertedChildToAdultMap = nextConvertedMap;

        if (newService.tariff) {
          newService.tariff = {
            ...newService.tariff,
            childExtrasTotal: newChildExtrasTotal,
            precio_original_with_child_extras:
              parseFloat(newService.tariff.precio_original || 0) +
              newChildExtrasTotal,
          };
        }

        const assignedIds = newService.assignedPassengerIds || [];
        const childIds = assignedIds.filter((id) => id.startsWith("child:"));

        newService.passengerSelection = {
          ...newService.passengerSelection,
          hasChildExplicitPrices: Object.keys(currentChildPriceMap).length > 0,
          assignedChildExplicitCount: Object.keys(currentChildPriceMap).length,
          assignedChildExplicitPriceMap: currentChildPriceMap,
          assignedChildExplicitPriceSum: newChildExtrasTotal,
          convertedChildToAdultMap: nextConvertedMap,
          ninosComoAdulto: nextConvertedMap,
        };

        if (isTicketSvc) {
          const ticketChildPricingMode =
            priceType === "adult" ? "adult_tariff" : "manual";
          const ticketChildrenUseStudentTariffAsAdult = priceType === "adult";
          newService.ticketChildPricingMode = ticketChildPricingMode;
          newService.ticketChildrenUseStudentTariffAsAdult =
            ticketChildrenUseStudentTariffAsAdult;
          newService.passengerSelection = {
            ...newService.passengerSelection,
            ticketChildPricingMode,
            ticketChildrenUseStudentTariffAsAdult,
          };
        }

        newService.fxMeta = {
          ...(newService.fxMeta || {}),
          tcApplied: exchangeRate,
          baseTc: baseTcRef.current,
        };

        newDays[dayIndex].servicios[serviceIndex] = newService;
        return newDays;
      });
    };

    // NUEVO: Convertir un niño a adulto en un servicio específico
    const handleConvertChildToAdult = (
      dayIndex,
      serviceIndex,
      childIdToConvert,
    ) => {
      if (dayIndex === null || serviceIndex === null || !childIdToConvert)
        return;

      setDays((prevDays) => {
        const newDays = [...prevDays];
        const day = { ...newDays[dayIndex] };
        if (!day || !day.servicios || !day.servicios[serviceIndex])
          return prevDays;

        day.servicios = [...day.servicios];
        const service = { ...day.servicios[serviceIndex] };
        const assignedIds = [...(service.assignedPassengerIds || [])];

        if (!assignedIds.includes(childIdToConvert)) return prevDays;

        // Mark child as converted (keep child ID, add to map — matches HotelPricingModal format)
        const convertedMap = { ...(service.convertedChildToAdultMap || {}) };
        convertedMap[childIdToConvert] = true;
        service.convertedChildToAdultMap = convertedMap;

        // assignedPassengerIds stays unchanged — child ID remains
        service.assignedPassengerIds = assignedIds;

        const adultCount = assignedIds.filter((id) =>
          id.startsWith("adult:"),
        ).length;
        const convertedChildCount = Object.keys(convertedMap).filter(
          (k) => k.startsWith("child:") && convertedMap[k],
        ).length;
        const newAdultCount = adultCount + convertedChildCount;

        const childPriceMap = {
          ...(service.assignedChildExplicitPriceMap || {}),
        };
        delete childPriceMap[childIdToConvert];

        const newChildExtrasTotal = Object.values(childPriceMap).reduce(
          (sum, price) => sum + (parseFloat(price) || 0),
          0,
        );
        const remainingChildCount = Object.keys(childPriceMap).length;

        service.assignedChildExplicitPriceMap = childPriceMap;
        service.assignedChildExplicitPriceSum = newChildExtrasTotal;
        service.hasChildExplicitPrices = remainingChildCount > 0;
        service.assignedChildExplicitCount = remainingChildCount;
        service.pricingMode = "fixed";
        service.treatChildrenAsAdults = false;

        const serviceType =
          service.typeService ||
          service.parentService?.typeService ||
          service.serviceCategory ||
          "";
        const isDividedPricing =
          serviceType === "transportes" ||
          serviceType === "guias" ||
          (serviceType === "endoses" && getTourCapacity(service) != null);

        const isHotel = serviceType === "hoteles";

        if (isDividedPricing) {
          const basePrice = parseFloat(service.tariff?.precio_original || 0);
          if (basePrice > 0) {
            const newDividedPrice = basePrice / newAdultCount;
            service.tariff = {
              ...service.tariff,
              precio: Math.round(newDividedPrice * 100) / 100,
              childExtrasTotal: newChildExtrasTotal,
              precio_original_with_child_extras:
                basePrice + newChildExtrasTotal,
            };
          }
        } else if (isHotel) {
          if (service.tariff) {
            service.tariff = {
              ...service.tariff,
              childExtrasTotal: newChildExtrasTotal,
              precio_original_with_child_extras:
                parseFloat(service.tariff.precio_original || 0) +
                newChildExtrasTotal,
            };
          }
        } else {
          if (service.tariff) {
            const unitPrice = parseFloat(service.tariff.precio || 0);
            const newPrecioOriginal = unitPrice * newAdultCount;
            service.tariff = {
              ...service.tariff,
              precio_original: newPrecioOriginal,
              childExtrasTotal: newChildExtrasTotal,
              precio_original_with_child_extras:
                newPrecioOriginal + newChildExtrasTotal,
            };
          }
        }

        if (
          service.pricingMode === "percentage" &&
          service.uniformPercentage &&
          remainingChildCount > 0
        ) {
          const percentage = parseFloat(service.uniformPercentage) || 0;
          const newUnitPrice = parseFloat(service.tariff?.precio || 0);
          const newChildPrice = (percentage / 100) * newUnitPrice;

          Object.keys(childPriceMap).forEach((childId) => {
            childPriceMap[childId] = newChildPrice;
          });

          const updatedChildExtrasTotal = Object.values(childPriceMap).reduce(
            (sum, price) => sum + (parseFloat(price) || 0),
            0,
          );
          service.assignedChildExplicitPriceMap = childPriceMap;
          service.assignedChildExplicitPriceSum = updatedChildExtrasTotal;

          if (service.tariff) {
            service.tariff.childExtrasTotal = updatedChildExtrasTotal;
            service.tariff.precio_original_with_child_extras =
              parseFloat(service.tariff.precio_original || 0) +
              updatedChildExtrasTotal;
          }
        }

        service.passengerSelection = {
          ...service.passengerSelection,
          selectedIds: assignedIds,
          assignedPassengerCount: assignedIds.length,
          convertedChildToAdultMap: { ...convertedMap },
          hasChildExplicitPrices: remainingChildCount > 0,
          assignedChildExplicitCount: remainingChildCount,
          assignedChildExplicitPriceMap: service.assignedChildExplicitPriceMap,
          assignedChildExplicitPriceSum: service.assignedChildExplicitPriceSum,
        };

        if (detectServiceType(service) === "tickets") {
          service.ticketChildPricingMode = "adult_tariff";
          service.ticketChildrenUseStudentTariffAsAdult = true;
          service.passengerSelection = {
            ...service.passengerSelection,
            ticketChildPricingMode: "adult_tariff",
            ticketChildrenUseStudentTariffAsAdult: true,
          };
        }

        service.fxMeta = {
          ...(service.fxMeta || {}),
          tcApplied: exchangeRate,
          baseTc: baseTcRef.current,
        };

        // Invalidar precio_adult cacheado para que el runtime recalcule desde tariff.precio
        delete service.precio_adult;
        day.servicios[serviceIndex] = service;
        newDays[dayIndex] = day;
        return newDays;
      });
    };
    */

    const handleRevertAdultToChild = (
      dayIndex,
      serviceIndex,
      convertedAdultId,
    ) => {
      if (dayIndex === null || serviceIndex === null || !convertedAdultId)
        return;

      setDays((prevDays) => {
        const newDays = [...prevDays];
        const day = { ...newDays[dayIndex] };
        if (!day || !day.servicios || !day.servicios[serviceIndex])
          return prevDays;

        day.servicios = [...day.servicios];
        const service = { ...day.servicios[serviceIndex] };
        const serviceSnapshot = getServiceBeneficiarySnapshot(service);
        const rawConvertedMap = {
          ...(serviceSnapshot.pricingState?.convertedChildToAdultMap || {}),
          ...(service.convertedChildToAdultMap || {}),
          ...(service.passengerSelection?.convertedChildToAdultMap || {}),
          ...(service.passengerSelection?.ninosComoAdulto || {}),
        };

        // Support both formats:
        // New format: { "child:X": true } — convertedAdultId IS the child ID
        // Legacy format: { "adult:N": "child:X" } — convertedAdultId is the adult ID
        let originalChildId;
        if (isChildPassengerId(convertedAdultId)) {
          // New format
          originalChildId = convertedAdultId;
        } else {
          // Legacy format
          originalChildId = rawConvertedMap[convertedAdultId];
          if (!originalChildId) return prevDays;
        }

        const assignedIdsBase =
          service.assignedPassengerIds?.length > 0
            ? [...service.assignedPassengerIds]
            : [...serviceSnapshot.selectedIds];
        originalChildId =
          findPassengerIdBySlot(
            assignedIdsBase,
            originalChildId,
            isChildPassengerId,
          ) || originalChildId;

        const convertedMap = removeChildSlotFromConvertedMap(
          rawConvertedMap,
          originalChildId,
        );

        service.convertedChildToAdultMap =
          Object.keys(convertedMap).length > 0 ? convertedMap : {};

        // For legacy format, restore child ID in assignedIds
        let assignedIds = [...assignedIdsBase];
        if (isAdultPassengerId(convertedAdultId)) {
          const idx = assignedIds.indexOf(convertedAdultId);
          if (idx >= 0) assignedIds[idx] = originalChildId;
        }
        assignedIds = materializeChildInAssignedIds(assignedIds, originalChildId);

        let adultCount = assignedIds.filter(isAdultPassengerId).length;
        // Fallback for services without explicit passenger assignment
        // (tickets, restaurantes, extras) whose IDs live in beneficiariosAdultos
        if (adultCount === 0) {
          adultCount = getServiceBeneficiarySnapshot(service).adultIds.length;
        }
        const convertedChildCount = Object.entries(convertedMap).filter(
          ([key, value]) =>
            (isChildPassengerId(key) && value) ||
            isChildPassengerId(value),
        ).length;
        const newAdultCount = adultCount + convertedChildCount;

        const serviceType =
          service.typeService ||
          service.parentService?.typeService ||
          service.serviceCategory ||
          "";
        const isDividedPricing =
          serviceType === "transportes" ||
          serviceType === "guias" ||
          (serviceType === "endoses" && getTourCapacity(service) != null);
        const isHotel = serviceType === "hoteles";

        // For divisor services compute the correct post-revert adult unit price
        // from precio_original / newAdultCount rather than the stale tariff.precio
        const baseAdultPrice = parseFloat(service.tariff?.precio_original || 0);
        const fallbackUnitPrice = parseFloat(service.tariff?.precio || 0);
        const adultUnitPrice =
          isDividedPricing && baseAdultPrice > 0 && newAdultCount > 0
            ? Math.round((baseAdultPrice / Math.max(1, newAdultCount)) * 100) /
              100
            : fallbackUnitPrice;

        // Restore child in price map
        let childPriceMap = removeChildSlotFromPriceMap(
          service.assignedChildExplicitPriceMap || {},
          originalChildId,
        );
        const revertPricingMode =
          service.pricingMode ||
          service.passengerSelection?.pricingMode ||
          "fixed";
        const revertUniformPercentage = parseFloat(
          service.uniformPercentage ||
            service.passengerSelection?.uniformPercentage ||
            0,
        );
        let revertedChildPrice;
        if (detectServiceType(service) === "tickets") {
          revertedChildPrice = resolveTicketChildUnitPrice(
            service?.childService || service,
            {},
          );
        } else if (revertPricingMode === "adult") {
          revertedChildPrice = 0;
        } else if (
          revertPricingMode === "percentage" &&
          revertUniformPercentage > 0
        ) {
          revertedChildPrice =
            Math.round((revertUniformPercentage / 100) * adultUnitPrice * 100) /
            100;
        } else {
          revertedChildPrice =
            service.assignedChildExplicitPriceMap?.[originalChildId] ?? 0;
        }
        childPriceMap = upsertChildPriceBySlot(
          childPriceMap,
          originalChildId,
          revertedChildPrice,
        );

        const newChildExtrasTotal = Object.values(childPriceMap).reduce(
          (sum, price) => sum + (parseFloat(price) || 0),
          0,
        );
        const remainingChildCount = Object.keys(childPriceMap).filter((id) =>
          id.startsWith("child:"),
        ).length;

        service.assignedPassengerIds = assignedIds;
        service.assignedChildExplicitPriceMap = childPriceMap;
        service.assignedChildExplicitPriceSum = newChildExtrasTotal;
        service.hasChildExplicitPrices = remainingChildCount > 0;
        service.assignedChildExplicitCount = remainingChildCount;
        Object.assign(
          service,
          cleanLegacyChildBeneficiaries(
            service,
            originalChildId,
            revertedChildPrice,
          ),
        );

        if (isDividedPricing) {
          const basePrice = parseFloat(service.tariff?.precio_original || 0);
          if (basePrice > 0) {
            const safeDivisor = Math.max(1, newAdultCount);
            const newDividedPrice = basePrice / safeDivisor;
            service.tariff = {
              ...service.tariff,
              precio: Math.round(newDividedPrice * 100) / 100,
              childExtrasTotal: newChildExtrasTotal,
              precio_original_with_child_extras:
                basePrice + newChildExtrasTotal,
            };
          }
        } else if (isHotel) {
          if (service.tariff) {
            service.tariff = {
              ...service.tariff,
              childExtrasTotal: newChildExtrasTotal,
              precio_original_with_child_extras:
                parseFloat(service.tariff.precio_original || 0) +
                newChildExtrasTotal,
            };
          }
        } else {
          if (service.tariff) {
            const unitPrice = parseFloat(service.tariff.precio || 0);
            const newPrecioOriginal = unitPrice * Math.max(1, newAdultCount);
            service.tariff = {
              ...service.tariff,
              precio_original: newPrecioOriginal,
              childExtrasTotal: newChildExtrasTotal,
              precio_original_with_child_extras:
                newPrecioOriginal + newChildExtrasTotal,
            };
          }
        }

        service.passengerSelection = {
          ...service.passengerSelection,
          selectedIds: assignedIds,
          assignedPassengerCount: assignedIds.length,
          convertedChildToAdultMap:
            Object.keys(convertedMap).length > 0 ? { ...convertedMap } : {},
          hasChildExplicitPrices: remainingChildCount > 0,
          assignedChildExplicitCount: remainingChildCount,
          assignedChildExplicitPriceMap: service.assignedChildExplicitPriceMap,
          assignedChildExplicitPriceSum: service.assignedChildExplicitPriceSum,
          pricingMode: "fixed",
          treatChildrenAsAdults: false,
          ninosComoAdulto:
            Object.keys(convertedMap).length > 0 ? { ...convertedMap } : {},
          preciosNinos: service.assignedChildExplicitPriceMap,
        };

        if (detectServiceType(service) === "tickets") {
          service.ticketChildPricingMode = "student_tariff";
          service.ticketChildrenUseStudentTariffAsAdult = true;
          service.passengerSelection = {
            ...service.passengerSelection,
            ticketChildPricingMode: "student_tariff",
            ticketChildrenUseStudentTariffAsAdult: true,
          };
        }

        service.fxMeta = {
          ...(service.fxMeta || {}),
          tcApplied: exchangeRate,
          baseTc: baseTcRef.current,
        };

        // Invalidar precio_adult cacheado para que el runtime recalcule desde tariff.precio
        delete service.precio_adult;
        // Clear stale treatChildrenAsAdults when no more conversions exist
        if (Object.keys(service.convertedChildToAdultMap || {}).length === 0) {
          service.treatChildrenAsAdults = false;
          service.pricingMode = "fixed";
          if (service.passengerSelection) {
            service.passengerSelection.treatChildrenAsAdults = false;
          }
        }
        day.servicios[serviceIndex] = service;
        newDays[dayIndex] = day;
        return newDays;
      });
    };

    // Sensores DnD
    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: { distance: 8 },
      }),
      useSensor(KeyboardSensor, {
        coordinateGetter: sortableKeyboardCoordinates,
      }),
    );

    // Asegurar ciudades y dividir precios en servicios nuevos
    useEffect(() => {
      if (days && days.length > 0) {
        const daysWithCiudades = ensureDaysHaveCiudades(days);
        const needsCiudadesUpdate = days.some(
          (day) => !day.ciudades || !Array.isArray(day.ciudades),
        );
        if (needsCiudadesUpdate) {
          setDays(daysWithCiudades);
          return;
        }

        let needsUpdate = false;
        const updatedDays = days.map((day) => {
          if (!day.servicios || day.servicios.length === 0) return day;

          const updatedServices = day.servicios.map((service) => {
            if (
              validateServiceStructure(service) &&
              service.tariff?.precio &&
              !service.tariff.precio_original
            ) {
              const processedService = calculateAndSetDividedPrice(
                service,
                totalPassengers,
              );
              needsUpdate = true;
              return processedService;
            }
            return service;
          });
          return { ...day, servicios: updatedServices };
        });

        if (needsUpdate) setDays(updatedDays);
      }
    }, [days, totalPassengers, getAllPassengers, setDays]);

    // IDs únicos
    const ensureDaysHaveIds = (daysArray) => {
      return daysArray.map((day) => ({
        ...day,
        id:
          day.id ||
          `day-${day.numero}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        servicios:
          day.servicios?.map((service) => ({
            ...service,
            id:
              service.id ||
              `service-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          })) || [],
      }));
    };

    const buildEmptyDay = (dayNumber) => ({
      numero: dayNumber,
      servicios: [],
      titulo: "",
      ciudades: [],
      id: `day-${dayNumber}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    });

    const renumberDays = (daysArray) =>
      ensureDaysHaveIds(daysArray).map((day, index) => ({
        ...day,
        numero: index + 1,
      }));

    const shiftCollapsedAfterInsert = (insertIndex) => {
      setCollapsedDays((prev) => {
        if (!prev.size) return prev;
        const next = new Set();
        for (const idx of prev) {
          next.add(idx >= insertIndex ? idx + 1 : idx);
        }
        return next;
      });
    };

    // Agregar día
    const addDay = () => {
      setDays((prevDays) => {
        const newDayNumber =
          prevDays.length > 0
            ? Math.max(...prevDays.map((day) => Number(day.numero || 0))) + 1
            : 1;
        const newDay = buildEmptyDay(newDayNumber);
        const updatedDays = [...prevDays, newDay];
        return renumberDays(updatedDays);
      });
      // New days are expanded by default (not in collapsedDays)
      setTimeout(() => expandDay(days.length), 100);
    };

    const insertDayAfter = (dayIndex) => {
      if (readOnly) return;
      const insertIndex = dayIndex + 1;
      shiftCollapsedAfterInsert(insertIndex);
      setDays((prevDays) => {
        const nextDays = [...prevDays];
        nextDays.splice(insertIndex, 0, buildEmptyDay(insertIndex + 1));
        return renumberDays(nextDays);
      });
      setTimeout(() => expandDay(insertIndex), 100);
    };

    // Eliminar día (confirmación ahora se maneja inline en SortableDay popover)
    const handleDeleteDay = (index) => {
      if (readOnly) return;
      setDays((prevDays) => {
        const filtered = prevDays.filter((_, i) => i !== index);
        return filtered.map((day, newIndex) => ({
          ...day,
          numero: newIndex + 1,
        }));
      });
      removeDayFromCollapsed(index);
    };

    // Título día
    const handleTitleChange = (dayIndex, newTitle) => {
      setDays((prevDays) => {
        const newDays = [...prevDays];
        newDays[dayIndex] = { ...newDays[dayIndex], titulo: newTitle };
        return newDays;
      });
    };

    // Ciudades
    const handleCiudadesChange = (dayIndex, newCiudades) => {
      setDays((prevDays) => {
        const newDays = [...prevDays];
        newDays[dayIndex] = {
          ...newDays[dayIndex],
          ciudades: newCiudades || [],
        };
        return newDays;
      });
    };

    const addCiudad = (dayIndex, ciudadName) => {
      if (!ciudadName?.trim()) return;
      setDays((prevDays) => {
        const newDays = [...prevDays];
        const current = newDays[dayIndex]?.ciudades || [];
        if (!current.includes(ciudadName.trim())) {
          newDays[dayIndex] = {
            ...newDays[dayIndex],
            ciudades: [...current, ciudadName.trim()],
          };
        }
        return newDays;
      });
    };

    const removeCiudad = (dayIndex, ciudadIndex) => {
      setDays((prevDays) => {
        const newDays = [...prevDays];
        const current = newDays[dayIndex]?.ciudades || [];
        newDays[dayIndex] = {
          ...newDays[dayIndex],
          ciudades: current.filter((_, i) => i !== ciudadIndex),
        };
        return newDays;
      });
    };

    const toggleCiudad = (dayIndex, ciudadName) => {
      const cleanName = ciudadName?.trim();
      if (!cleanName) return;

      setDays((prevDays) => {
        const newDays = [...prevDays];
        const current = newDays[dayIndex]?.ciudades || [];
        const exists = current.some(
          (city) => city.toLowerCase() === cleanName.toLowerCase(),
        );

        newDays[dayIndex] = {
          ...newDays[dayIndex],
          ciudades: exists
            ? current.filter(
                (city) => city.toLowerCase() !== cleanName.toLowerCase(),
              )
            : [...current, cleanName],
        };

        return newDays;
      });
    };

    // Modal ciudades
    const handleOpenCiudadesModal = (dayIndex) => {
      setCurrentDayForCiudades(dayIndex);
      setCiudadesModalOpen(true);
    };
    const handleCloseCiudadesModal = () => {
      setCiudadesModalOpen(false);
      setCurrentDayForCiudades(null);
    };
    const handleCiudadSelect = (ciudad) => {
      if (
        currentDayForCiudades !== null &&
        currentDayForCiudades < days.length
      ) {
        toggleCiudad(currentDayForCiudades, ciudad);
      }
    };

    // Expandir día
    const toggleDayExpand = (dayIndex) => {
      toggleDayExpansion(dayIndex);
    };

    // Quitar servicio (protege servicios asignados a voucher y modo readOnly)
    const removeService = (dayIndex, serviceIndex) => {
      if (readOnly) return;
      setDays((prevDays) => {
        const service = prevDays[dayIndex]?.servicios?.[serviceIndex];
        // Solo bloquear si isAssigned=true Y existe dato real de asignación
        const hasRealAssignment =
          (service?.isAssigned || service?.is_assigned) &&
          (service?.assignedParentId != null ||
            service?.assignedChildId != null ||
            service?.assignedTariff != null ||
            service?.assignedPassengerSelection != null);
        if (hasRealAssignment) {
          alert(
            "Este servicio está vinculado a un voucher y no puede ser eliminado.",
          );
          return prevDays;
        }
        const newDays = JSON.parse(JSON.stringify(prevDays));
        if (newDays[dayIndex] && Array.isArray(newDays[dayIndex].servicios)) {
          newDays[dayIndex].servicios.splice(serviceIndex, 1);
        }
        return newDays;
      });
    };

    // Cambiar servicio (abrir picker para reemplazar)
    const handleChangeService = (dayIndex, serviceIndex) => {
      if (readOnly) return;
      const service = days[dayIndex]?.servicios?.[serviceIndex];
      // Solo bloquear si isAssigned=true Y existe dato real de asignación
      const hasRealAssignment =
        (service?.isAssigned || service?.is_assigned) &&
        (service?.assignedParentId != null ||
          service?.assignedChildId != null ||
          service?.assignedTariff != null ||
          service?.assignedPassengerSelection != null);
      if (!service || hasRealAssignment) return;
      const category = detectServiceType(service);
      if (onChangeService) {
        onChangeService(dayIndex, serviceIndex, category);
      }
    };

    // DnD
    const handleDragStart = (event) => {
      const { active } = event;
      setActiveId(active.id);
      setActiveItem(active.data.current);
    };

    const handleDragEnd = (event) => {
      const { active, over } = event;
      if (!over) {
        setActiveId(null);
        setActiveItem(null);
        return;
      }
      if (active.id !== over.id) {
        setDays((prevDays) => {
          const activeData = active.data.current;
          const overData = over.data.current;

          if (
            activeData.type === "day" &&
            overData &&
            overData.type === "day"
          ) {
            const oldIndex = prevDays.findIndex(
              (day) =>
                day.id === active.id || `day-${day.numero}` === active.id,
            );
            const newIndex = prevDays.findIndex(
              (day) => day.id === over.id || `day-${day.numero}` === over.id,
            );
            if (oldIndex !== -1 && newIndex !== -1) {
              const reordered = arrayMove(prevDays, oldIndex, newIndex);
              return reordered.map((day, index) => ({
                ...day,
                numero: index + 1,
              }));
            }
          } else if (
            activeData.type === "service" &&
            overData &&
            overData.type === "service" &&
            activeData.dayIndex === overData.dayIndex
          ) {
            const dayIndex = activeData.dayIndex;
            const oldIndex = activeData.serviceIndex;
            const newIndex = overData.serviceIndex;
            const newDays = [...prevDays];
            newDays[dayIndex] = {
              ...newDays[dayIndex],
              servicios: arrayMove(
                newDays[dayIndex].servicios,
                oldIndex,
                newIndex,
              ),
            };
            return newDays;
          } else if (
            activeData.type === "service" &&
            overData &&
            overData.type === "day"
          ) {
            // Servicio soltado sobre un día (mover al final de los servicios del día)
            const sourceDayIndex = activeData.dayIndex;
            const destDayIndex = overData.dayIndex;
            if (sourceDayIndex !== destDayIndex && destDayIndex !== undefined) {
              const newDays = [...prevDays];
              const sourceServiceIndex = activeData.serviceIndex;
              const serviceToMove = {
                ...newDays[sourceDayIndex].servicios[sourceServiceIndex],
              };
              newDays[sourceDayIndex].servicios.splice(sourceServiceIndex, 1);
              if (!newDays[destDayIndex].servicios) {
                newDays[destDayIndex].servicios = [];
              }
              newDays[destDayIndex].servicios.push(serviceToMove);
              return newDays;
            }
          }
          return prevDays;
        });

        if (activeItem?.type === "day") {
          const oldIndex = days.findIndex(
            (day) => day.id === active.id || `day-${day.numero}` === active.id,
          );
          const newIndex = days.findIndex(
            (day) => day.id === over.id || `day-${day.numero}` === over.id,
          );
          if (oldIndex !== -1 && newIndex !== -1) {
            updateExpandedDayAfterReorder(oldIndex, newIndex);
          }
        }
      }
      setActiveId(null);
      setActiveItem(null);
    };

    // [PAX] Confirmación del modal
    const proceedToServicePickerWithPassengers = ({
      ids,
      chosen,
      childPriceMap = {},
      childPriceTotal = 0,
      hasChildExplicitPrices = false,
    }) => {
      if (!pendingSelection) return;

      const { dayIndex, categoryId, prevLen, mode, serviceIndex } =
        pendingSelection;

      if (mode === "editService" && dayIndex != null && serviceIndex != null) {
        setDays((prevDays) => {
          const newDays = [...prevDays];
          const day = newDays[dayIndex];
          if (!day || !day.servicios || !day.servicios[serviceIndex])
            return prevDays;

          let service = { ...day.servicios[serviceIndex] };

          const explicitChildCount = Object.values(childPriceMap).filter(
            (v) => v != null && !isNaN(parseFloat(v)),
          ).length;

          service = {
            ...service,
            assignedPassengerIds: ids || [],
            assignedPassengerCount: (ids || []).length,
            assignedPassengers: chosen || [],
            assignedChildExplicitPriceMap: childPriceMap,
            assignedChildExplicitPriceSum: childPriceTotal,
            assignedChildExplicitCount: explicitChildCount,
            hasChildExplicitPrices: explicitChildCount > 0,
          };

          const totalPassengersLocal = adultsCount;
          const recalculated = updateSingleServicePricesForPassengerChange(
            service,
            totalPassengersLocal,
          );

          day.servicios[serviceIndex] = recalculated;
          newDays[dayIndex] = { ...day };
          return newDays;
        });

        setPaxModalOpen(false);
        setPendingSelection(null);
        return;
      }

      setPendingSelection({
        dayIndex,
        categoryId,
        preselectedIds: ids,
        prevLen,
        selectedIds: ids,
        selectedPassengers: chosen,
        childPriceMap,
        childPriceTotal,
        hasChildExplicitPrices,
        mode: mode || "newService",
      });

      setPaxModalOpen(false);

      onAddServiceWrapper(dayIndex, categoryId, {
        selectedIds: ids,
        selectedPassengers: chosen,
        childPriceMap,
        childPriceTotal,
        hasChildExplicitPrices,
      });
    };

    const getEndoseTourKey = React.useCallback((service = {}) => {
      if (detectServiceType(service) !== "endoses") return null;

      const sources = [
        service.childService,
        service.childService?.tour,
        service.serviceDetails,
        service.serviceDetails?.tour,
        service.tour,
        service,
      ];

      for (const source of sources) {
        const key =
          source?.id_tipotour ??
          source?.id_tour ??
          source?.tour_id ??
          source?.idTour ??
          source?.id;
        if (key !== undefined && key !== null && key !== "") {
          return String(key);
        }
      }

      const name =
        service.childService?.tipo_guiado ||
        service.childService?.nombre ||
        service.serviceDetails?.tipo_guiado ||
        service.nombre ||
        "";
      return name ? name.trim().toLowerCase() : null;
    }, []);

    const excludeAlreadyAssignedEndosePax = React.useCallback(
      (service, existingServices = [], selection = {}) => {
        const tourKey = getEndoseTourKey(service);
        if (!tourKey) return selection;

        const usedSlots = new Set();
        existingServices.forEach((existing) => {
          if (getEndoseTourKey(existing) !== tourKey) return;
          const snapshot = getServiceBeneficiarySnapshot(existing);
          (snapshot.selectedIds || []).forEach((id) => {
            const slot = getPassengerSlotKey(id);
            if (slot) usedSlots.add(slot);
          });
        });

        const selectedIds = selection.ids || selection.selectedIds || [];
        const allowedIds = selectedIds.filter(
          (id) => !usedSlots.has(getPassengerSlotKey(id)),
        );
        const allowedSlots = new Set(allowedIds.map(getPassengerSlotKey));
        const filterMapByAllowedSlots = (map = {}) =>
          Object.fromEntries(
            Object.entries(map || {}).filter(([id]) =>
              allowedSlots.has(getPassengerSlotKey(id)),
            ),
          );
        const filterPassengersByAllowedIds = (people = []) =>
          (people || []).filter((_, index) => {
            const sourceId = selectedIds[index];
            return sourceId && allowedSlots.has(getPassengerSlotKey(sourceId));
          });

        return {
          ...selection,
          ids: allowedIds,
          selectedIds: allowedIds,
          chosen: filterPassengersByAllowedIds(
            selection.chosen || selection.selectedPassengers || [],
          ),
          selectedPassengers: filterPassengersByAllowedIds(
            selection.selectedPassengers || selection.chosen || [],
          ),
          childPriceMap: filterMapByAllowedSlots(selection.childPriceMap),
          assignedChildExplicitPriceMap: filterMapByAllowedSlots(
            selection.assignedChildExplicitPriceMap,
          ),
          childPriceTotal: Object.values(
            filterMapByAllowedSlots(selection.childPriceMap),
          ).reduce((sum, value) => sum + (Number(value) || 0), 0),
        };
      },
      [getEndoseTourKey],
    );

    const limitEndoseSelectionToCapacity = React.useCallback((service, selection = {}) => {
      const capacidad = getTourCapacity(service);
      if (!capacidad || capacidad < 1) return selection;

      const selectedIds = selection.ids || selection.selectedIds || [];
      if (selectedIds.length <= capacidad) return selection;

      const limitedIds = selectedIds.slice(0, capacidad);
      const allowedSlots = new Set(limitedIds.map(getPassengerSlotKey));
      const filterMapByAllowedSlots = (map = {}) =>
        Object.fromEntries(
          Object.entries(map || {}).filter(([id]) =>
            allowedSlots.has(getPassengerSlotKey(id)),
          ),
        );
      const filterPassengersByAllowedIds = (people = []) =>
        (people || []).filter((_, index) => {
          const sourceId = selectedIds[index];
          return sourceId && allowedSlots.has(getPassengerSlotKey(sourceId));
        });

      return {
        ...selection,
        ids: limitedIds,
        selectedIds: limitedIds,
        chosen: filterPassengersByAllowedIds(
          selection.chosen || selection.selectedPassengers || [],
        ),
        selectedPassengers: filterPassengersByAllowedIds(
          selection.selectedPassengers || selection.chosen || [],
        ),
        childPriceMap: filterMapByAllowedSlots(selection.childPriceMap),
        assignedChildExplicitPriceMap: filterMapByAllowedSlots(
          selection.assignedChildExplicitPriceMap,
        ),
        childPriceTotal: Object.values(
          filterMapByAllowedSlots(selection.childPriceMap),
        ).reduce((sum, value) => sum + (Number(value) || 0), 0),
      };
    }, []);

    // Agregar servicios → procesar división + niños con precio fijo en NUEVOS
    const onAddServiceWrapper = React.useCallback(
      (dayIndex, categoryId, selectionPayload = null) => {
        if (onAddService) {
          onAddService(dayIndex, categoryId, {
            passengerSelection: selectionPayload,
          });
        }

        setTimeout(() => {
          setDays((prevDays) => {
            let hasChanges = false;
            const updatedDays = prevDays.map((day, dIndex) => {
              if (dIndex !== dayIndex || !day.servicios) return day;

              let services = day.servicios.map((service) => {
                if (
                  validateServiceStructure(service) &&
                  service.tariff?.precio &&
                  !service.tariff.precio_original
                ) {
                  const processedService = calculateAndSetDividedPrice(
                    service,
                    totalPassengers,
                  );
                  hasChanges = true;
                  return processedService;
                }
                return service;
              });

              const sel = selectionPayload || pendingSelection;

              if (sel?.dayIndex === dayIndex && sel?.prevLen != null) {
                const start = Math.min(sel.prevLen, services.length);
                const end = services.length;

                const existingServices = services.slice(0, start);
                const slice = services.slice(start, end).map((s) => {
                  const effectiveSel = limitEndoseSelectionToCapacity(
                    s,
                    excludeAlreadyAssignedEndosePax(s, existingServices, sel),
                  );
                  const effectiveChildMap = effectiveSel.childPriceMap || {};
                  const effectiveChildSum =
                    Number(effectiveSel.childPriceTotal || 0) || 0;
                  const effectiveExplicitChildCount = Object.values(
                    effectiveChildMap,
                  ).filter((v) => v != null && !isNaN(parseFloat(v))).length;
                  let withAssigned = {
                    ...s,
                    assignedPassengerIds:
                      effectiveSel.ids || effectiveSel.selectedIds || [],
                    assignedPassengerCount: (
                      effectiveSel.ids ||
                      effectiveSel.selectedIds ||
                      []
                    ).length,
                    assignedPassengers:
                      effectiveSel.chosen || effectiveSel.selectedPassengers || [],
                    passengerSelection: {
                      ...(s.passengerSelection || {}),
                      ...effectiveSel,
                      selectedIds:
                        effectiveSel.ids || effectiveSel.selectedIds || [],
                      ids: effectiveSel.ids || effectiveSel.selectedIds || [],
                      assignedPassengerCount: (
                        effectiveSel.ids ||
                        effectiveSel.selectedIds ||
                        []
                      ).length,
                    },
                    assignedChildExplicitPriceMap: effectiveChildMap,
                    assignedChildExplicitPriceSum: effectiveChildSum,
                    assignedChildExplicitCount: effectiveExplicitChildCount,
                    hasChildExplicitPrices: effectiveExplicitChildCount > 0,
                    fxMeta: {
                      ...(s.fxMeta || {}),
                      tcApplied: baseTcRef.current, // recién llega como base (3)
                      baseTc: baseTcRef.current,
                    },
                  };

                  withAssigned = calculateAndSetDividedPrice(
                    withAssigned,
                    totalPassengers,
                  );

                  const baseOriginal = parseFloat(
                    withAssigned?.tariff?.precio_original ||
                      withAssigned?.tariff?.precio ||
                      0,
                  );
                  const extras =
                    Number(withAssigned?.assignedChildExplicitPriceSum || 0) ||
                    0;

                  const withExtras = {
                    ...withAssigned,
                    tariff: {
                      ...withAssigned.tariff,
                      childExtrasTotal: extras,
                      precio_original_with_child_extras: baseOriginal + extras,
                    },
                  };

                  // Guardar base (TC=3) y aplicar TC actual para visualizar
                  if (withExtras?.id) {
                    fxBaseRef.current.set(
                      withExtras.id,
                      buildBaseForService(withExtras, baseTcRef.current),
                    );
                  }

                  let converted = { ...applyFxToService(withExtras) };

                  // Bimodal: SIEMPRE marcar (este es el fix principal)
                  converted = markBimodalIfNeeded(converted, dayIndex);

                  return converted;
                });

                services = [...services.slice(0, start), ...slice];
                hasChanges = true;
              }

              return hasChanges ? { ...day, servicios: services } : day;
            });

            if (pendingSelection?.dayIndex === dayIndex) {
              setPendingSelection(null);
            }
            return hasChanges ? updatedDays : prevDays;
          });
        }, 100);
      },
      [
        onAddService,
        totalPassengers,
        setDays,
        pendingSelection,
        buildBaseForService,
        applyFxToService,
        markBimodalIfNeeded,
        excludeAlreadyAssignedEndosePax,
        limitEndoseSelectionToCapacity,
      ],
    );

    // ——— Helpers para separar adultos/niños
    const { adultsList, childrenList } = React.useMemo(() => {
      let adults = [],
        children = [];
      if (peopleDetails && (peopleDetails.adults || peopleDetails.children)) {
        adults = peopleDetails.adults || [];
        children = peopleDetails.children || [];
      } else if (Array.isArray(passengers)) {
        adults = passengers.filter((p) => p?.type !== "child");
        children = passengers.filter((p) => p?.type === "child");
      }
      return { adultsList: adults, childrenList: children };
    }, [peopleDetails, passengers]);
    const totalChildrenForDisplay = Math.max(
      0,
      Number((childrenList || []).length || 0),
    );

    // Abrir selector de servicios
    const handleOpenServiceSelector = (dayIndex, event, categoryId = null) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      const prevLen = days?.[dayIndex]?.servicios?.length ?? 0;

      const ids = (adultsList || []).map((p, i) => {
        const passengerId = p?.id ?? i + 1;
        return `adult:${i}:${passengerId}`;
      });

      const childIds = (childrenList || []).map((p, i) => {
        const passengerId = p?.id ?? i + 1;
        return `child:${i}:${passengerId}`;
      });

      const allIds = [...ids, ...childIds];

      const chosen = [
        ...(adultsList || []).map((p) => ({ ...p, type: "adult" })),
        ...(childrenList || []).map((p) => ({ ...p, type: "child" })),
      ];

      const selectionPayload = {
        ids: allIds,
        chosen,
        childPriceMap: {},
        childPriceTotal: 0,
        hasChildExplicitPrices: false,
      };

      setPendingSelection({
        dayIndex,
        categoryId,
        preselectedIds: allIds,
        prevLen,
        ...selectionPayload,
        mode: "newService",
      });

      onAddServiceWrapper(dayIndex, categoryId, selectionPayload);
    };

    // Modo edición de precio
    const togglePriceAdjustment = (
      dayIndex,
      serviceIndex,
      isDiscount,
      isDirectEdit = false,
      isGroupEdit = false,
      editType = "total",
    ) => {
      // Cerrar editor de niño si está abierto
      setEditingChildPrice({
        dayIndex: null,
        serviceIndex: null,
        isOpen: false,
        mode: "fixed",
        value: "",
        percentage: "",
      });

      if (
        editingPrice.dayIndex === dayIndex &&
        editingPrice.serviceIndex === serviceIndex &&
        editingPrice.isGroupEdit === isGroupEdit
      ) {
        setEditingPrice({
          dayIndex: null,
          serviceIndex: null,
          isDiscount: false,
          mode: null,
          value: "",
          isDirectEdit: false,
          isGroupEdit: false,
          editType: "total",
          error: "",
        });
      } else {
        let currentPrice = 0;
        if (isGroupEdit) {
          currentPrice = 0;
        } else if (
          serviceIndex >= 0 &&
          days[dayIndex] &&
          days[dayIndex].servicios[serviceIndex]
        ) {
          const currentService = days[dayIndex].servicios[serviceIndex];
          if (isDirectEdit) {
            currentPrice =
              currentService.tariff?.precio ||
              currentService.tariff?.precio_original ||
              0;
          } else {
            currentPrice = getServicePrice(currentService) || 0;
          }
        }
        setEditingPrice({
          dayIndex,
          serviceIndex,
          isDiscount,
          mode: isDirectEdit ? "direct" : "percentage",
          value: isDirectEdit && !isGroupEdit ? currentPrice.toString() : "",
          isDirectEdit,
          isGroupEdit,
          editType,
          error: "",
        });
      }
    };

    const handleAdjustmentValueChange = (e) => {
      const value = e.target.value;
      setEditingPrice((prev) => ({ ...prev, value, error: "" }));
    };

    // Aplicar ajuste (edición directa)
    const applyAdjustment = () => {
      const { dayIndex, serviceIndex, value } = editingPrice;

      if (dayIndex == null || serviceIndex == null) return;

      const numValue = parseFloat(value);
      if (isNaN(numValue) || numValue < 0) {
        setEditingPrice((prev) => ({
          ...prev,
          error: "Ingresa un valor válido",
        }));
        return;
      }

      const service = days?.[dayIndex]?.servicios?.[serviceIndex];
      if (!service || !service.tariff) return;

      const { paxForDivision } = getDivisionCountsForService(
        service,
        totalPassengers,
      );
      const serviceType = detectServiceType(service);

      // capacidad (para hoteles/extras)
      const getServiceCapacity = (service, totalPassengersLocal) => {
        const detected = detectServiceType(service);
        const { paxAssigned } = getDivisionCountsForService(
          service,
          totalPassengersLocal,
        );

        if (detected === "hoteles") {
          const tipoHabitacion =
            service.childService?.tipo_habitacion ||
            service.childService?.habitacion?.tipo_habitacion ||
            "";
          return getRoomCapacityByType(tipoHabitacion);
        } else if (detected === "transportes" || detected === "guias") {
          return paxAssigned;
        } else if (detected === "endoses") {
          const tourCapacity = getTourCapacity(service);
          if (tourCapacity != null) return tourCapacity;

          return 1;
        } else if (detected === "extras") {
          return (
            service.parentService?.capacidad ||
            service.capacidad ||
            service.pasajerosBeneficiados ||
            service.tariff?.pasajeros_beneficiados ||
            1
          );
        }
        return paxAssigned;
      };

      const capacity = getServiceCapacity(service, totalPassengers);

      let newPrecioOriginal = 0;
      const newPrecioMostrado = numValue;

      if (serviceType === "hoteles") {
        newPrecioOriginal = numValue * capacity;
      } else if (serviceType === "transportes" || serviceType === "guias") {
        newPrecioOriginal = numValue * paxForDivision;
      } else if (serviceType === "endoses") {
        // Endose normal: precio por persona. Solo un endose con capacidad
        // explícita representa un total grupal.
        newPrecioOriginal =
          getTourCapacity(service) != null
            ? numValue * capacity
            : numValue * paxForDivision;
      } else if (serviceType === "extras") {
        newPrecioOriginal = numValue * capacity;
      } else {
        newPrecioOriginal = numValue * paxForDivision;
      }

      setDays((prevDays) => {
        const newDays = JSON.parse(JSON.stringify(prevDays));
        const svc = newDays?.[dayIndex]?.servicios?.[serviceIndex];
        if (!svc) return prevDays;

        if (!svc.tariff) svc.tariff = {};

        svc.tariff.precio_original = newPrecioOriginal;
        svc.tariff.precio = newPrecioMostrado;
        svc.tariff.precio_original_with_child_extras =
          newPrecioOriginal + Number(svc.tariff.childExtrasTotal || 0);

        // Sync cached per-adult price fields so getServiceAdultUnitPrice()
        // returns the edited value (it checks these BEFORE tariff.precio).
        svc.precio_adult = newPrecioMostrado;
        svc.amount_per_adult = newPrecioOriginal;
        if (svc.tariff.precio_adult !== undefined) {
          svc.tariff.precio_adult = newPrecioMostrado;
        }
        if (svc.hotelAdultUnitPrice !== undefined) {
          svc.hotelAdultUnitPrice = newPrecioMostrado;
        }

        delete svc.adjustment;
        delete svc.originalPrecio;
        delete svc.originalTariffPrice;

        svc.fxMeta = {
          ...(svc.fxMeta || {}),
          tcApplied: exchangeRate,
          baseTc: baseTcRef.current,
        };

        // actualizar base (TC=3) desde el precio editado (en TC actual)
        const recalculated = updateSingleServicePricesForPassengerChange(
          svc,
          totalPassengers,
        );
        newDays[dayIndex].servicios[serviceIndex] = recalculated;

        if (recalculated?.id) {
          fxBaseRef.current.set(
            recalculated.id,
            buildBaseForService(recalculated, exchangeRate),
          );
        }

        return newDays;
      });

      setEditingPrice({
        dayIndex: null,
        serviceIndex: null,
        isDiscount: false,
        mode: null,
        value: "",
        isDirectEdit: false,
        isGroupEdit: false,
        editType: "total",
        error: "",
      });
    };

    // Modal hotel avanzado (5?)
    const handleOpenHotelModal = () => setHotelModalOpen(true);

    const handleAddHotelToDays = (selectedDayIndices, hotelServices) => {
      setDays((prevDays) => {
        const newDays = [...prevDays];
        selectedDayIndices.forEach((dayIndex) => {
          if (newDays[dayIndex]) {
            newDays[dayIndex].servicios = newDays[dayIndex].servicios || [];

            hotelServices.forEach((hotelService) => {
              let serviceWithDividedPrice = calculateAndSetDividedPrice(
                hotelService,
                totalPassengers,
              );
              const serviceWithId = {
                ...serviceWithDividedPrice,
                id: `hotel-${dayIndex}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                fxMeta: {
                  tcApplied: baseTcRef.current,
                  baseTc: baseTcRef.current,
                },
              };

              const category =
                serviceWithId.parentService?.typeService?.toLowerCase();
              if (category === "hoteles" && serviceWithId.tariff) {
                const basePrice =
                  parseFloat(hotelService.tariff.precio_original) || 0;
                const roomHasIgv = serviceHasPeruvianBeneficiary(
                  serviceWithId,
                  peopleDetails,
                  serviceWithId.passengerSelection,
                );
                serviceWithId.tariff.basePrice = basePrice;
                serviceWithId.tariff.tieneIgv = roomHasIgv;
                serviceWithId.tariff.tiene_igv = roomHasIgv;
                serviceWithId.tariff.hasProcessedIGV = true;
                serviceWithId.igv = roomHasIgv;
              }

              // Guardar base (asume llega base TC=3) y convertir a TC actual
              if (serviceWithId?.id) {
                fxBaseRef.current.set(
                  serviceWithId.id,
                  buildBaseForService(serviceWithId, baseTcRef.current),
                );
              }
              let converted = applyFxToService(serviceWithId);
              converted = markBimodalIfNeeded(converted, dayIndex);
              newDays[dayIndex].servicios.push(converted);
            });
          }
        });
        return newDays;
      });

      setHotelModalOpen(false);
    };

    const removeHotelFromDay = (dayIndex, serviceId) => {
      setDays((prevDays) => {
        const newDays = [...prevDays];
        if (newDays[dayIndex] && newDays[dayIndex].servicios) {
          newDays[dayIndex].servicios = newDays[dayIndex].servicios.filter(
            (service) => service.id !== serviceId,
          );
        }
        return newDays;
      });
    };

    // groupServicesByType
    const groupServices = (services) =>
      groupServicesByType(services, detectServiceType);

    const handleAddTrainService = (dayIndex) => {
      onAddService(dayIndex, "trenes");
    };

    const handleSelectHotelByCategory = (selectedHotel) => {
      if (!selectedHotel) return;

      setDays((prevDays) => {
        const newDays = prevDays.map((day) => ({
          ...day,
          servicios: day.servicios.filter(
            (s) => s.parentService?.typeService !== "hoteles",
          ),
        }));

        newDays.forEach((day, index) => {
          const hotelWithId = {
            ...selectedHotel,
            id: `hotel-selected-${Date.now()}-${index}`,
            fxMeta: { tcApplied: baseTcRef.current, baseTc: baseTcRef.current },
          };

          if (hotelWithId?.id) {
            fxBaseRef.current.set(
              hotelWithId.id,
              buildBaseForService(hotelWithId, baseTcRef.current),
            );
          }
          let converted = applyFxToService(hotelWithId);
          converted = markBimodalIfNeeded(converted, index);
          day.servicios.push(converted);
        });

        return newDays;
      });

      setCategoryModalOpen(false);
    };

    // Abrir popup automáticamente cuando haya un tren bimodal pendiente
    useEffect(() => {
      return undefined;
    }, [days, bimodalPrompt.open, setDays]);

    // =========================
    // RENDER
    // =========================
    // Only the primary Venso catalog uses the dedicated HotelPricingModal.
    // Other agencies manage hotels as regular itinerary services.
    const hideHotelsInDaysEditor = Boolean(useVensoHotelPricing);
    const showAddHotelButton = !useVensoHotelPricing;

    return (
      <div className={`days-editor de${readOnly ? " de--readonly" : ""}`}>
        {" "}
        {/* Minimal header bar */}
        <div className="de__header">
          <div className="de__header-left">
            <div className="de__heading-copy">
              <span className="de__eyebrow">Plan de viaje</span>
              <h3 className="de__title">Itinerario</h3>
            </div>
            <span className="de__count">
              {days.length} {days.length === 1 ? "día" : "días"}
            </span>
            {importedPackageInfo?.nombre && (
              <span
                className={`de__package-badge${importedPackageInfo.modificado ? " de__package-badge--modified" : ""}`}
                title={
                  importedPackageInfo.modificado
                    ? `Paquete "${importedPackageInfo.nombre}" (modificado)`
                    : `Paquete "${importedPackageInfo.nombre}"`
                }
              >
                <MdRoomService /> {importedPackageInfo.nombre}
                {importedPackageInfo.fee != null &&
                  Number.isFinite(Number(importedPackageInfo.fee)) && (
                    <span className="de__package-badge-fee">
                      Fee {Number(importedPackageInfo.fee)}%
                    </span>
                  )}
                {importedPackageInfo.modificado && (
                  <MdWarning className="de__package-badge-icon" />
                )}
              </span>
            )}
          </div>

          <div className="de__header-right">
            {agencyName && (
              <span className="de__agency-context" title={`Catálogo: ${agencyName}`}>
                {agencyName}
              </span>
            )}
            <div className="de__fx">
              <span className="de__fx-label">TC:</span>
              <input
                className="de__fx-input"
                type="number"
                min="0.1"
                step="0.01"
                value={tcInput}
                onChange={(e) => setTcInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    e.preventDefault();
                    return;
                  }
                  if (e.key === "Enter") applyTc();
                  if (e.key === "Escape") setTcInput(String(exchangeRate));
                }}
                onWheel={(e) => e.currentTarget.blur()}
                title="Tipo de cambio"
              />
              <button className="de__fx-btn" onClick={applyTc} type="button">
                Aplicar
              </button>
              <span className="de__fx-rate">
                {prevExchangeRate !== exchangeRate
                  ? `${Number(prevExchangeRate || 0).toFixed(2)} -> ${Number(exchangeRate || 0).toFixed(2)}`
                  : `Base ${Number(exchangeRate || 0).toFixed(2)}`}
              </span>
            </div>

            {showAddHotelButton && !readOnly && (
              <button
                className="de__add-hotel"
                onClick={() => setHotelModalOpen(true)}
                title="Agregar hotel"
                type="button"
              >
                <FaHotel /> Hotel
              </button>
            )}

            {transportConflictCount > 0 && !readOnly && onOpenConflictModal && (
              <button
                className="de__conflict-btn"
                onClick={onOpenConflictModal}
                title={`${transportConflictCount} transporte(s) con capacidad insuficiente`}
                type="button"
              >
                <MdWarning /> {transportConflictCount} conflicto
                {transportConflictCount > 1 ? "s" : ""}
              </button>
            )}

            {!readOnly && (
              <button className="de__add-day" onClick={addDay} type="button">
                <MdAdd /> Día
              </button>
            )}
          </div>
        </div>
        {days.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={days.map((day) => day.id || `day-${day.numero}`)}
              strategy={verticalListSortingStrategy}
            >
              <div className="de__days-list">
                {days.map((day, dayIndex) => (
                  <React.Fragment key={day.id || `day-${day.numero}`}>
                    <SortableDay
                      day={day}
                      dayIndex={dayIndex}
                      handleTitleChange={handleTitleChange}
                      handleCiudadesChange={handleCiudadesChange}
                      addCiudad={addCiudad}
                      removeCiudad={removeCiudad}
                      openCiudadesModal={handleOpenCiudadesModal}
                      handleDeleteDay={handleDeleteDay}
                      dayTitles={dayTitles}
                      dayTitlesLoading={dayTitlesLoading}
                    >
                      <div className="de__day-body">
                        {/* Table column headers */}
                        {(() => {
                          const pkgChildrenCount = (
                            peopleDetails?.children || []
                          ).length;
                          return (
                            <div className="de__table-header">
                              <span></span>
                              <span>Servicio</span>
                              <span>Tipo</span>
                              <span>Pax</span>
                              <span>
                                $/adulto
                                {pkgChildrenCount > 0 && (
                                  <small className="de__th-child">
                                    {" "}
                                    / $/niño
                                  </small>
                                )}
                              </span>
                              <span>Total</span>
                              <span></span>
                            </div>
                          );
                        })()}

                        {day.servicios?.length > 0 ? (
                          (() => {
                            // All services in flat list (no train grouping)
                            let allServices = day.servicios.map((s, idx) => ({
                              ...s,
                              originalIndex: idx,
                            }));
                            // VENSO / MIL: hide hotel services from the day editor
                            if (hideHotelsInDaysEditor) {
                              allServices = allServices.filter((s) => {
                                const sType = (
                                  s.parentService?.typeService ||
                                  s.typeService ||
                                  s.serviceCategory ||
                                  ""
                                ).toLowerCase();
                                return (
                                  sType !== "hoteles" &&
                                  sType !== "hotel" &&
                                  !s?.autoAddedHotel
                                );
                              });
                            }

                            const sortableItems = allServices
                              .filter((s) => !s?.autoAddedHotel)
                              .map(
                                (s) =>
                                  s.id ||
                                  `service-${dayIndex}-${s.originalIndex}`,
                              );

                            return (
                              <SortableContext
                                items={sortableItems}
                                strategy={verticalListSortingStrategy}
                              >
                                <div className="de__services">
                                  {allServices.map((service) => {
                                    if (service?.autoAddedHotel) {
                                      return (
                                        <AutoHotelCard
                                          key={
                                            service.id ||
                                            `auto-hotel-${dayIndex}-${service.originalIndex}`
                                          }
                                          service={service}
                                          dayIndex={dayIndex}
                                          serviceIndex={service.originalIndex}
                                          onRemove={() =>
                                            removeService(
                                              dayIndex,
                                              service.originalIndex,
                                            )
                                          }
                                        />
                                      );
                                    }
                                    return (
                                      <SortableService
                                        key={
                                          service.id ||
                                          `service-${dayIndex}-${service.originalIndex}`
                                        }
                                        service={service}
                                        serviceIndex={service.originalIndex}
                                        dayIndex={dayIndex}
                                        totalPassengers={totalPassengers}
                                        passengers={passengers}
                                        getAllPassengers={getAllPassengers}
                                        removeService={removeService}
                                        togglePriceAdjustment={
                                          togglePriceAdjustment
                                        }
                                        editingPrice={editingPrice}
                                        handleAdjustmentValueChange={
                                          handleAdjustmentValueChange
                                        }
                                        applyAdjustment={applyAdjustment}
                                        onEditChildPrice={handleEditChildPrice}
                                        editingChildPrice={editingChildPrice}
                                        setEditingChildPrice={
                                          setEditingChildPrice
                                        }
                                        applyChildPrice={applyChildPrice}
                                        cancelChildPriceEdit={
                                          cancelChildPriceEdit
                                        }
                                        onConvertChildToAdult={
                                          handleConvertChildToAdult
                                        }
                                        onRevertAdultToChild={
                                          handleRevertAdultToChild
                                        }
                                        applyUniformChildPrice={
                                          applyUniformChildPrice
                                        }
                                        applyIndividualChildPrice={
                                          applyIndividualChildPrice
                                        }
                                        onChangeService={handleChangeService}
                                        days={days}
                                        hideServiceTotal={hideServiceTotal}
                                        quotationExchangeRate={exchangeRate}
                                        onApplyQuotationExchangeRate={
                                          applyQuotationTcToService
                                        }
                                      />
                                    );
                                  })}
                                </div>
                              </SortableContext>
                            );
                          })()
                        ) : (
                          <div className="de__empty">
                            Agrega servicios a este dia
                          </div>
                        )}

                        {/* Add services toolbar (below services) — hidden in readOnly */}
                        {!readOnly && (
                          <div className="de__toolbar">
                            <ServiceCategoryButtons
                              compact
                              onCategorySelect={(categoryId) =>
                                handleOpenServiceSelector(
                                  dayIndex,
                                  null,
                                  categoryId,
                                )
                              }
                              onExtrasClick={() =>
                                onExtrasClick && onExtrasClick(dayIndex)
                              }
                              selectedCategory={null}
                              platform={platform}
                            />
                          </div>
                        )}

                        {/* Day subtotal row */}
                        {!hideServiceTotal && (
                          <div className="de__day-footer">
                            {(() => {
                              const d = getCalculatedDaySubtotal(
                                day.servicios || [],
                              );
                              const effectiveAdultsCount = Math.max(
                                1,
                                Number(adultsCount || 0),
                              );
                              const dayChildrenForDisplay = Math.max(
                                1,
                                totalChildrenForDisplay,
                                d.baseExplicitChildCount || 0,
                                d.baseConvertedChildCount || 0,
                              );
                              // Explicit (non-converted) children — separate line
                              const baseExplicitChildAverage =
                                d.baseExplicitChildTotal > 0
                                  ? round2(
                                      d.baseExplicitChildTotal /
                                        dayChildrenForDisplay,
                                    )
                                  : 0;
                              const baseConvertedChildAverage =
                                d.baseConvertedChildTotal > 0
                                  ? round2(
                                      d.baseConvertedChildTotal /
                                        dayChildrenForDisplay,
                                    )
                                  : 0;
                              const baseUnifiedChildAverage = round2(
                                baseExplicitChildAverage +
                                  baseConvertedChildAverage,
                              );
                              const hotelAdultAverage =
                                d.hotelAdultTotal > 0
                                  ? round2(
                                      d.hotelAdultTotal /
                                        Math.max(
                                          1,
                                          Number(
                                            d.hotelAdultCount ||
                                              effectiveAdultsCount,
                                          ),
                                        ),
                                    )
                                  : 0;
                              // Hotel: explicit children average
                              const hotelExplicitChildAverage =
                                d.hotelChildrenTotal > 0 &&
                                d.hotelExplicitChildCount > 0
                                  ? round2(
                                      (d.hotelChildrenTotal -
                                        (d.hotelConvertedChildTotal || 0)) /
                                        d.hotelExplicitChildCount,
                                    )
                                  : 0;
                              // Hotel: converted children average
                              const hotelConvertedChildAverage =
                                d.hotelConvertedChildTotal > 0 &&
                                d.hotelConvertedChildCount > 0
                                  ? round2(
                                      d.hotelConvertedChildTotal /
                                        d.hotelConvertedChildCount,
                                    )
                                  : 0;
                              const hotelRoomParts =
                                buildHotelRoomPartsFromServices(
                                  day.servicios || [],
                                  Math.max(
                                    1,
                                    Number(
                                      d.hotelAdultCount || effectiveAdultsCount,
                                    ),
                                  ),
                                );
                              const hotelConvertedRoomParts =
                                buildHotelConvertedRoomPartsFromServices(
                                  day.servicios || [],
                                );
                              return (
                                <>
                                  {/* Services row */}
                                  <div className="de__day-footer-row">
                                    <span className="de__day-footer-label">
                                      <MdRoomService /> Servicios
                                    </span>
                                    <span className="de__day-footer-item">
                                      <MdPerson className="icon-adult" />
                                      {d.baseAdultCount > 0 && (
                                        <span className="de__day-footer-pax">
                                          {d.baseAdultCount}
                                        </span>
                                      )}
                                      <strong>
                                        {formatCurrency(d.subtotalPerPerson)}
                                      </strong>
                                      <small>/adulto</small>
                                    </span>
                                    {baseUnifiedChildAverage > 0 && (
                                      <span className="de__day-footer-item">
                                        <MdChildCare className="icon-child" />
                                        {(d.baseExplicitChildCount > 0 ||
                                          d.baseConvertedChildCount > 0) && (
                                          <span className="de__day-footer-pax">
                                            {totalChildrenForDisplay ||
                                              Math.max(
                                                d.baseExplicitChildCount || 0,
                                                d.baseConvertedChildCount || 0,
                                              )}
                                          </span>
                                        )}
                                        <strong>
                                          {formatCurrency(
                                            baseUnifiedChildAverage,
                                          )}
                                        </strong>
                                        <small>/niño</small>
                                      </span>
                                    )}
                                  </div>

                                  {/* Hotels row */}
                                  {d.hotelsTotal > 0 && (
                                    <div className="de__day-footer-row">
                                      <span className="de__day-footer-label">
                                        <MdHotel /> Hoteles
                                      </span>
                                      {hotelRoomParts.length > 0 ? (
                                        hotelRoomParts.map((part) => (
                                          <span
                                            className="de__day-footer-item de__day-footer-item--room"
                                            key={`day-hotel-room-${part.key}`}
                                          >
                                            <MdHotel className="icon-room" />
                                            <span className="de__day-footer-pax">
                                              {part.beneficiaries}
                                            </span>
                                            <strong>
                                              {formatCurrency(part.value)}
                                            </strong>
                                            <small>{part.label}</small>
                                          </span>
                                        ))
                                      ) : d.hotelAdultTotal > 0 ? (
                                        <span className="de__day-footer-item">
                                          <MdPerson className="icon-adult" />
                                          <span className="de__day-footer-pax">
                                            {Math.max(
                                              1,
                                              Number(
                                                d.hotelAdultCount ||
                                                  effectiveAdultsCount,
                                              ),
                                            )}
                                          </span>
                                          <strong>
                                            {formatCurrency(hotelAdultAverage)}
                                          </strong>
                                          <small>/adulto</small>
                                        </span>
                                      ) : null}
                                      {hotelExplicitChildAverage > 0 && (
                                        <span className="de__day-footer-item">
                                          <MdChildCare className="icon-child" />
                                          {d.hotelExplicitChildCount > 0 && (
                                            <span className="de__day-footer-pax">
                                              {d.hotelExplicitChildCount}
                                            </span>
                                          )}
                                          <strong>
                                            {formatCurrency(
                                              hotelExplicitChildAverage,
                                            )}
                                          </strong>
                                          <small>/niño</small>
                                        </span>
                                      )}
                                      {hotelConvertedRoomParts.length > 0
                                        ? hotelConvertedRoomParts.map(
                                            (part) => (
                                              <span
                                                className="de__day-footer-item de__day-footer-item--child-adult"
                                                key={`day-hotel-converted-${part.key}`}
                                              >
                                                <MdChildCare className="icon-child-adult" />
                                                <span className="de__day-footer-pax">
                                                  {part.beneficiaries}
                                                </span>
                                                <strong>
                                                  {formatCurrency(part.value)}
                                                </strong>
                                                <small>{part.label}</small>
                                              </span>
                                            ),
                                          )
                                        : hotelConvertedChildAverage > 0 && (
                                            <span className="de__day-footer-item de__day-footer-item--child-adult">
                                              <MdChildCare className="icon-child-adult" />
                                              {d.hotelConvertedChildCount >
                                                0 && (
                                                <span className="de__day-footer-pax">
                                                  {d.hotelConvertedChildCount}
                                                </span>
                                              )}
                                              <strong>
                                                {formatCurrency(
                                                  hotelConvertedChildAverage,
                                                )}
                                              </strong>
                                              <small>/niño</small>
                                            </span>
                                          )}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </SortableDay>
                    {!readOnly && dayIndex < days.length - 1 && (
                      <div className="de__insert-day-between">
                        <span />
                        <button
                          type="button"
                          onClick={() => insertDayAfter(dayIndex)}
                          title={`Agregar día entre ${dayIndex + 1} y ${dayIndex + 2}`}
                        >
                          <MdAdd /> Agregar día aquí
                        </button>
                        <span />
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </SortableContext>

            {/* Bottom add day */}
            {!readOnly && (
              <button className="de__add-day-bottom" onClick={addDay}>
                <MdAdd /> Agregar día
              </button>
            )}

            {/* General totals */}
            {days.length > 0 &&
              !hideServiceTotal &&
              (() => {
                const totals = getCalculatedGeneralTotal();
                const effectiveAdults = Math.max(1, Number(adultsCount || 0));
                const totalsChildrenForDisplay = Math.max(
                  1,
                  totalChildrenForDisplay,
                  totals.baseExplicitChildCount || 0,
                  totals.baseConvertedChildCount || 0,
                );
                const totalExplicitChildPerPerson =
                  (totals.baseExplicitChildTotal || 0) > 0
                    ? round2(
                        (totals.baseExplicitChildTotal || 0) /
                          totalsChildrenForDisplay,
                      )
                    : 0;
                const totalConvertedChildPerPerson =
                  (totals.baseConvertedChildTotal || 0) > 0
                    ? round2(
                        (totals.baseConvertedChildTotal || 0) /
                          totalsChildrenForDisplay,
                      )
                    : 0;
                const totalUnifiedChildPerPerson = round2(
                  totalExplicitChildPerPerson + totalConvertedChildPerPerson,
                );
                const hotelRoomTotalParts = buildHotelRoomPartsFromDays(
                  days,
                  Math.max(
                    1,
                    Number(totals.hotelAdultCount || effectiveAdults),
                  ),
                );
                const hotelConvertedRoomTotalParts =
                  buildHotelConvertedRoomPartsFromDays(days);

                return (
                  <div className="de__totals">
                    {/* Services row */}
                    <div className="de__totals-row">
                      <span className="de__totals-row-label">
                        <MdRoomService /> Servicios
                      </span>
                      <span className="de__totals-row-item">
                        <MdPerson className="icon-adult" />
                        <strong>{formatCurrency(totals.totalPerPerson)}</strong>
                        <small>/adulto</small>
                      </span>
                      {totalUnifiedChildPerPerson > 0 && (
                        <span className="de__totals-row-item">
                          <MdChildCare className="icon-child" />
                          <strong>
                            {formatCurrency(totalUnifiedChildPerPerson)}
                          </strong>
                          <small>
                            niños
                            {totalChildrenForDisplay > 0
                              ? ` (${totalChildrenForDisplay})`
                              : (totals.baseExplicitChildCount || 0) > 0
                                ? ` (${totals.baseExplicitChildCount})`
                                : (totals.baseConvertedChildCount || 0) > 0
                                  ? ` (${totals.baseConvertedChildCount})`
                                  : ""}
                          </small>
                        </span>
                      )}
                    </div>

                    {/* Hotels row */}
                    {(totals.hotelsTotal || 0) > 0 && (
                      <div className="de__totals-row">
                        <span className="de__totals-row-label">
                          <MdHotel /> Hoteles
                        </span>
                        {perRoomPricing.length > 0 ? (
                          <>
                            {perRoomPricing
                              .filter(
                                (room) =>
                                  Number(room.adultBeneficiaries ?? 0) > 0,
                              )
                              .map((room) => (
                                <span
                                  className="de__totals-row-item de__totals-row-item--room"
                                  key={`total-hotel-room-${room.key}`}
                                >
                                  <MdHotel className="icon-room" />
                                  <strong>
                                    {formatCurrency(room.hotelPerPerson || 0)}
                                  </strong>
                                  <small>
                                    {normalizeRoomLabel(room.label)}
                                    {(room.adultBeneficiaries ||
                                      room.beneficiaries ||
                                      0) > 0
                                      ? ` (${room.adultBeneficiaries || room.beneficiaries})`
                                      : ""}
                                  </small>
                                </span>
                              ))}
                            {perRoomPricing
                              .filter(
                                (room) =>
                                  (room.convertedChildBeneficiaries || 0) > 0,
                              )
                              .map((room) => (
                                <span
                                  className="de__totals-row-item de__totals-row-item--child-adult"
                                  key={`total-hotel-converted-${room.key}`}
                                >
                                  <MdChildCare className="icon-child-adult" />
                                  <strong>
                                    {formatCurrency(
                                      room.convertedChildHotelPerPerson ||
                                        room.hotelPerPerson ||
                                        0,
                                    )}
                                  </strong>
                                  <small>
                                    {normalizeRoomLabel(room.label)}
                                    {room.convertedChildBeneficiaries > 0
                                      ? ` (${room.convertedChildBeneficiaries})`
                                      : ""}
                                  </small>
                                </span>
                              ))}
                          </>
                        ) : (
                          <>
                            {hotelRoomTotalParts.length > 0 ? (
                              hotelRoomTotalParts.map((part) => (
                                <span
                                  className="de__totals-row-item de__totals-row-item--room"
                                  key={`total-hotel-room-${part.key}`}
                                >
                                  <MdHotel className="icon-room" />
                                  <strong>{formatCurrency(part.value)}</strong>
                                  <small>
                                    {part.label}
                                    {part.beneficiaries > 0
                                      ? ` (${part.beneficiaries})`
                                      : ""}
                                  </small>
                                </span>
                              ))
                            ) : (
                              <span className="de__totals-row-item">
                                <MdPerson className="icon-adult" />
                                <strong>
                                  {formatCurrency(
                                    (totals.hotelAdultCount ||
                                      effectiveAdults) > 0
                                      ? round2(
                                          (totals.hotelAdultTotal || 0) /
                                            Math.max(
                                              1,
                                              Number(
                                                totals.hotelAdultCount ||
                                                  effectiveAdults,
                                              ),
                                            ),
                                        )
                                      : totals.hotelsTotalIndividual || 0,
                                  )}
                                </strong>
                                <small>/adulto</small>
                              </span>
                            )}
                            {(totals.hotelChildrenTotal || 0) -
                              (totals.hotelConvertedChildTotal || 0) >
                              0 && (
                              <span className="de__totals-row-item">
                                <MdChildCare className="icon-child" />
                                <strong>
                                  {formatCurrency(
                                    (totals.hotelChildrenTotal || 0) -
                                      (totals.hotelConvertedChildTotal || 0),
                                  )}
                                </strong>
                                <small>
                                  niños
                                  {(totals.hotelExplicitChildCount || 0) > 0 &&
                                    ` (${totals.hotelExplicitChildCount})`}
                                </small>
                              </span>
                            )}
                            {hotelConvertedRoomTotalParts.length > 0
                              ? hotelConvertedRoomTotalParts.map((part) => (
                                  <span
                                    className="de__totals-row-item de__totals-row-item--child-adult"
                                    key={`total-hotel-converted-${part.key}`}
                                  >
                                    <MdChildCare className="icon-child-adult" />
                                    <strong>
                                      {formatCurrency(part.value)}
                                    </strong>
                                    <small>
                                      {part.label}
                                      {part.beneficiaries > 0
                                        ? ` (${part.beneficiaries})`
                                        : ""}
                                    </small>
                                  </span>
                                ))
                              : (totals.hotelConvertedChildTotal || 0) > 0 && (
                                  <span className="de__totals-row-item de__totals-row-item--child-adult">
                                    <MdChildCare className="icon-child-adult" />
                                    <strong>
                                      {formatCurrency(
                                        totals.hotelConvertedChildTotal,
                                      )}
                                    </strong>
                                    <small>
                                      niños
                                      {(totals.hotelConvertedChildCount || 0) >
                                        0 &&
                                        ` (${totals.hotelConvertedChildCount})`}
                                    </small>
                                  </span>
                                )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

            {/* Drag overlay */}
            <DragOverlay>
              {activeId && activeItem?.type === "day" ? (
                <div className="de__drag-overlay de__drag-overlay--day">
                  Día{" "}
                  {
                    days.find(
                      (d) =>
                        d.id === activeId || `day-${d.numero}` === activeId,
                    )?.numero
                  }
                  {days.find(
                    (d) => d.id === activeId || `day-${d.numero}` === activeId,
                  )?.titulo &&
                    ` — ${days.find((d) => d.id === activeId || `day-${d.numero}` === activeId)?.titulo}`}
                </div>
              ) : activeId && activeItem?.type === "service" ? (
                <div className="de__drag-overlay de__drag-overlay--service">
                  {activeItem.service.nombre || "Servicio"}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
        {/* Modal: agregar hotel al itinerario */}
        <HotelItineraryModal
          isOpen={hotelModalOpen}
          onClose={() => setHotelModalOpen(false)}
          days={days}
          totalPassengers={totalPassengers}
          passengers={passengers}
          peopleDetails={peopleDetails}
          packageType={packageType}
          onAddHotelToDays={handleAddHotelToDays}
          removeHotelFromDay={removeHotelFromDay}
          tariffType={tariffType}
          platform={platform}
          agencyId={agencyId}
          isVensoPrimary={useVensoHotelPricing}
        />
        {/* Modal: seleccionar ciudades */}
        <CiudadesSelectorModal
          isOpen={ciudadesModalOpen}
          onClose={handleCloseCiudadesModal}
          onCiudadSelect={handleCiudadSelect}
          ciudadesSeleccionadas={
            currentDayForCiudades !== null
              ? days[currentDayForCiudades]?.ciudades || []
              : []
          }
        />
        <HotelCategorySelectorModal
          isOpen={categoryModalOpen}
          onClose={() => setCategoryModalOpen(false)}
          hotels={days.flatMap((day) =>
            day.servicios.filter(
              (s) => s.parentService?.typeService === "hoteles",
            ),
          )}
          onSelectHotel={handleSelectHotelByCategory}
        />
        {/* [PAX] Modal de selección de pasajeros (con precios de niños) */}
        <PassengerSelectorModal
          isOpen={paxModalOpen}
          onClose={() => setPaxModalOpen(false)}
          onConfirm={proceedToServicePickerWithPassengers}
          peopleDetails={peopleDetails}
          passengers={passengers}
          preselectedIds={pendingSelection?.preselectedIds || []}
          allowChildPriceInput={true}
        />

        {showPendingTcModal && (
          <div className="de__modal-overlay" onClick={closePendingTcModal}>
            <div
              className="de__modal de__modal--pending-tc"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="de__modal-header">
                <MdAutoFixHigh /> Aplicar tasa de cambio a servicios
              </div>
              <p className="de__modal-desc">
                La TC de la cotización será <strong>{Number(pendingTcPreviewRate || 0).toFixed(2)}</strong>.
                Se recalcularán precio por persona, precios de niños y total solamente en servicios cotizados editables.
                Los servicios ya asignados en Reservas no se modifican.
              </p>
              <div className="de__pending-tc-summary">
                <strong>{pendingExchangeRateServiceCount} servicio{pendingExchangeRateServiceCount === 1 ? "" : "s"} pendiente{pendingExchangeRateServiceCount === 1 ? "" : "s"}</strong>
                <span>TC objetivo {Number(pendingTcPreviewRate || 0).toFixed(2)}</span>
              </div>
              <div className="de__pending-tc-list">
                {pendingExchangeRateServices.map((day) => (
                  <section key={`pending-tc-day-${day.dayIndex}`} className="de__pending-tc-day">
                    <header>
                      <strong>Día {day.dayNumber}</strong>
                      {day.dayTitle ? <span>{day.dayTitle}</span> : null}
                    </header>
                    <ul>
                      {day.services.map(({ service, serviceIndex }) => (
                        <li key={service.id || `${day.dayIndex}-${serviceIndex}`}>
                          <span>{getServiceName(service) || service.nombre || `Servicio ${serviceIndex + 1}`}</span>
                          <small>TC {resolveServiceExchangeRate(service).toFixed(2)} → {Number(pendingTcPreviewRate || 0).toFixed(2)}</small>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
              <div className="de__modal-actions">
                <button className="de__modal-btn de__modal-btn--cancel" onClick={closePendingTcModal} type="button">
                  Cancelar
                </button>
                <button
                  className="de__modal-btn de__modal-btn--confirm"
                  onClick={applyQuotationTcToAllPendingServices}
                  type="button"
                  disabled={pendingExchangeRateServiceCount === 0}
                >
                  Aplicar TC a servicios
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Modal: Selección de día de retorno para tren Bimodal */}
        {bimodalPrompt.open && (
          <div
            className="de__modal-overlay"
            onClick={handleCancelBimodalReturn}
          >
            <div
              className="de__modal de__modal--bimodal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="de__modal-header">
                <FaTrain /> Retorno bimodal
              </div>
              <p className="de__modal-desc">
                Selecciona el retorno bimodal (sin costo adicional).
              </p>

              <div className="de__modal-field">
                <label>Retorno en:</label>
                <select
                  value={bimodalPrompt.targetDayIndex ?? 0}
                  onChange={(e) =>
                    setBimodalPrompt((p) => ({
                      ...p,
                      targetDayIndex: Number(e.target.value),
                    }))
                  }
                >
                  {days.map((d, i) => (
                    <option key={d.id || `d-${i}`} value={i}>
                      {`Día ${d.numero || i + 1}${d.titulo ? ` — ${d.titulo}` : ""}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="de__modal-actions">
                <button
                  className="de__modal-btn de__modal-btn--cancel"
                  onClick={handleCancelBimodalReturn}
                >
                  Omitir
                </button>
                <button
                  className="de__modal-btn de__modal-btn--confirm"
                  onClick={handleConfirmBimodalReturn}
                >
                  Confirmar retorno
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Confirmación de eliminar día ahora es un popover inline en SortableDay */}
      </div>
    );
  },
);

export default memo(DaysEditor);
