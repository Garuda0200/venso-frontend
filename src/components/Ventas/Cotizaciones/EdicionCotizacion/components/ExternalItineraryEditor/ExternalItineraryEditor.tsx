import React, { useState, useMemo, useCallback } from "react";
import ReactDOM from "react-dom";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  MdAdd,
  MdDelete,
  MdFlightTakeoff,
  MdAddCircleOutline,
  MdClose,
  MdLock,
} from "react-icons/md";
import ExtraServiceModal from "../ServicePicker/components/ExtraServiceModal/ExtraServiceModal";
import SortableService from "../DaysEditor/components/SortableService/SortableService";
import {
  detectServiceType,
  getServiceName,
} from "../DaysEditor/utils/serviceTypeMapper";
import { getDivisionCountsForService } from "../DaysEditor/utils/priceCalculations";
import {
  getPassengerIdsByType,
  getTourCapacity,
  createUnifiedService,
  updateServicePricesForPassengerChange,
} from "../../utils/unifiedServiceManager";
import {
  buildRuntimePassengerSelection,
  getPassengerSlotKey,
  getServiceBeneficiarySnapshot,
} from "../../utils/passengerPricingState";
import { calculateExternalItineraryBreakdown } from "../../utils/cotizacionFinancialSummary";
import {
  isOperationallyAssignedService,
  preserveOperationallyAssignedServices,
} from "../../utils/assignmentProtection";
import { pruneEmptyMutableTicketCohorts } from "../../utils/passengerPricingReconciliation";
import axiosInstance from "../../../../../../utils/axiosInstance";
import { getHotelRoomCapacity } from "../../../../../../utils/hotelRoomTypes";
import "./ExternalItineraryEditor.scss";

const SERVICE_TYPE_LABELS = {
  hoteles: "Hotel",
  vuelos: "Vuelo",
  trenes: "Tren",
  transportes: "Transporte",
  buses: "Bus",
  guias: "Guía",
  endoses: "Endose",
  restaurantes: "Restaurante",
  tickets: "Ticket",
  extras: "Extra",
  otros: "Otro",
};

const INITIAL_EDITING_PRICE = {
  dayIndex: null,
  serviceIndex: null,
  isDiscount: false,
  mode: null,
  value: "",
  isDirectEdit: false,
  isGroupEdit: false,
  editType: "total",
  error: "",
};

const INITIAL_EDITING_CHILD_PRICE = {
  dayIndex: null,
  serviceIndex: null,
  isOpen: false,
  mode: "fixed",
  value: "",
  percentage: "",
};

const parseMoney = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeApiList = (response) => {
  const data = response?.data?.data ?? response?.data;
  return Array.isArray(data) ? data : [];
};

const normalizeFlightText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const getFlightOptionProcedencia = (entry = {}) =>
  normalizeFlightText(
    entry?.vuelo?.procedencia ||
      entry?.vuelos?.procedencia ||
      entry?.tipo_vuelo?.vuelo?.procedencia ||
      entry?.procedencia ||
      "",
  );

const getFlightOptionParent = (entry = {}, procedencia = "") => {
  const tipoVuelo = entry?.tipo_vuelo || entry?.tipoVuelo || entry;
  const parent =
    entry?.vuelo ||
    entry?.vuelos ||
    tipoVuelo?.vuelo ||
    tipoVuelo?.vuelos ||
    {};

  return {
    ...parent,
    id_vuelo: parent?.id_vuelo ?? tipoVuelo?.id_vuelo ?? entry?.id_vuelo,
    nombre: parent?.nombre || "Vuelos",
    procedencia: parent?.procedencia || procedencia,
    typeService: "vuelos",
  };
};

const getFlightOptionChild = (entry = {}, packageType = "compartido") => {
  const tipoVuelo = entry?.tipo_vuelo || entry?.tipoVuelo || entry;
  const { tarifas, vuelo, vuelos, ...cleanChild } = tipoVuelo || {};

  return {
    ...cleanChild,
    idtipo_vuelo:
      cleanChild?.idtipo_vuelo ?? entry?.idtipo_vuelo ?? entry?.id_tipo_vuelo,
    id_vuelo: cleanChild?.id_vuelo ?? entry?.id_vuelo,
    tipo_vuelo: tipoVuelo,
    packageType,
  };
};

const selectFlightTariff = (entry = {}, packageType = "compartido") => {
  const tarifas = Array.isArray(entry?.tarifas)
    ? entry.tarifas
    : Array.isArray(entry?.tipo_vuelo?.tarifas)
      ? entry.tipo_vuelo.tarifas
      : [];
  const matchingTariffs = tarifas.filter(
    (item) => normalizeFlightText(item?.tipo_tarifa) === "externa",
  );
  const tariff =
    matchingTariffs.find((item) => item?.precio_unico === true) ||
    matchingTariffs[0] ||
    tarifas.find((item) => item?.precio_unico === true) ||
    tarifas[0];

  if (!tariff) return null;

  const price =
    packageType === "privado"
      ? tariff.precio_privado ?? tariff.precio_compartido ?? tariff.precio
      : tariff.precio_compartido ?? tariff.precio_privado ?? tariff.precio;

  return {
    ...tariff,
    selectedPackageType: packageType,
    precio: parseMoney(price),
    precio_original: parseMoney(price),
    tieneIgv: false,
  };
};

const getRoomCapacity = (roomType) => getHotelRoomCapacity(roomType, 1);

const getServiceTotal = (service) =>
  parseMoney(
    service?.tariff?.precio_original_with_child_extras ??
      service?.tariff?.precio_original ??
      service?.tariff?.precio ??
      service?.precio_original ??
      service?.precio ??
      0,
  );

const getSortableId = (service, dayIndex, serviceIndex) =>
  service?.id || `ext-service-${dayIndex}-${serviceIndex}`;

const ExternalItineraryEditor = ({
  days,
  setDays,
  mainDays = [],
  packageType = "compartido",
  platform = "venso",
  peopleDetails = {},
  peopleCount = { adults: 1, children: 0 },
  formatCurrency,
  tariffType = "externa",
  onClose,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDayNumero, setPickerDayNumero] = useState(null);
  const [pickerCategory, setPickerCategory] = useState(null);
  const [flightPickerDay, setFlightPickerDay] = useState(null);
  const [flightLoading, setFlightLoading] = useState(false);
  const [flightError, setFlightError] = useState("");
  const [editingPrice, setEditingPrice] = useState(INITIAL_EDITING_PRICE);
  const [editingChildPrice, setEditingChildPrice] = useState(
    INITIAL_EDITING_CHILD_PRICE,
  );

  const normalizedPeopleDetails = useMemo(() => {
    const fallbackAdults = Number(peopleCount?.adults || 0);
    const fallbackChildren = Number(peopleCount?.children || 0);

    const adults =
      Array.isArray(peopleDetails?.adults) && peopleDetails.adults.length > 0
        ? peopleDetails.adults
        : Array.from({ length: fallbackAdults }, (_, index) => ({
            id: index + 1,
            age: "18",
            nacionalidad: "",
          }));

    const children =
      Array.isArray(peopleDetails?.children) &&
      peopleDetails.children.length > 0
        ? peopleDetails.children
        : Array.from({ length: fallbackChildren }, (_, index) => ({
            id: index + 1,
            age: "6",
            nacionalidad: "",
          }));

    return {
      ...(peopleDetails || {}),
      adults,
      children,
    };
  }, [peopleCount?.adults, peopleCount?.children, peopleDetails]);

  const { adultIds, childIds, allPassengerIds } = useMemo(
    () => getPassengerIdsByType(normalizedPeopleDetails),
    [normalizedPeopleDetails],
  );

  const allPassengers = useMemo(
    () => [
      ...normalizedPeopleDetails.adults.map((passenger, index) => ({
        ...passenger,
        type: "adult",
        rowId:
          adultIds[index] || `adult:${index}:${passenger?.id || index + 1}`,
      })),
      ...normalizedPeopleDetails.children.map((passenger, index) => ({
        ...passenger,
        type: "child",
        rowId:
          childIds[index] || `child:${index}:${passenger?.id || index + 1}`,
      })),
    ],
    [adultIds, childIds, normalizedPeopleDetails],
  );

  const adultsCount = adultIds.length || Number(peopleCount?.adults || 0);
  const childCount = childIds.length || Number(peopleCount?.children || 0);
  const totalPassengers = Math.max(
    1,
    allPassengerIds.length || adultsCount + childCount,
  );

  const normalizeServicesForPeople = useCallback(
    (services, options = { preserveExistingSelection: true }) => {
      const current = Array.isArray(services) ? services : [];
      const repriced = updateServicePricesForPassengerChange(
        current,
        normalizedPeopleDetails,
        options,
      );
      return pruneEmptyMutableTicketCohorts(
        preserveOperationallyAssignedServices(current, repriced),
      );
    },
    [normalizedPeopleDetails],
  );

  const syncServicePassengerState = useCallback(
    (service) => {
      const currentIdBySlot = new Map(
        allPassengerIds.map((id) => [getPassengerSlotKey(id), id]),
      );
      const beneficiarySnapshot = getServiceBeneficiarySnapshot(service);
      const rawAssignedPassengerIds =
        Array.isArray(service?.assignedPassengerIds) &&
        service.assignedPassengerIds.length > 0
          ? service.assignedPassengerIds
          : Array.isArray(service?.passengerSelection?.selectedIds) &&
              service.passengerSelection.selectedIds.length > 0
            ? service.passengerSelection.selectedIds
            : beneficiarySnapshot.selectedIds.length > 0
              ? beneficiarySnapshot.selectedIds
              : allPassengerIds;
      const assignedBySlot = new Map();
      rawAssignedPassengerIds.filter(Boolean).forEach((rawId) => {
        const slot = getPassengerSlotKey(rawId);
        const currentId = currentIdBySlot.get(slot);
        if (currentId) assignedBySlot.set(slot, currentId);
      });
      const assignedPassengerIds = [...assignedBySlot.values()];
      const selectedChildBySlot = new Map(
        assignedPassengerIds
          .filter((id) => id.startsWith("child:"))
          .map((id) => [getPassengerSlotKey(id), id]),
      );
      const pricingMode =
        service?.pricingMode ||
        service?.passengerSelection?.pricingMode ||
        "percentage";
      const uniformPercentage =
        service?.uniformPercentage ||
        service?.passengerSelection?.uniformPercentage ||
        "";
      const treatChildrenAsAdults =
        pricingMode === "adult" ||
        service?.treatChildrenAsAdults === true ||
        service?.passengerSelection?.treatChildrenAsAdults === true;
      const canonicalizeNumericChildMap = (...sources) =>
        sources.reduce((result, source) => {
          Object.entries(source || {}).forEach(([rawId, rawValue]) => {
            const currentChildId = selectedChildBySlot.get(
              getPassengerSlotKey(rawId),
            );
            const value = Number(rawValue);
            if (currentChildId && Number.isFinite(value)) {
              result[currentChildId] = value;
            }
          });
          return result;
        }, {});
      const convertedChildToAdultMap = [
        beneficiarySnapshot.pricingState?.convertedChildToAdultMap,
        service?.passengerSelection?.convertedChildToAdultMap,
        service?.passengerSelection?.ninosComoAdulto,
        service?.convertedChildToAdultMap,
      ].reduce((result, source) => {
        Object.entries(source || {}).forEach(([rawKey, rawValue]) => {
          const rawChildId = rawKey.startsWith("child:")
            ? rawKey
            : typeof rawValue === "string" && rawValue.startsWith("child:")
              ? rawValue
              : null;
          if (!rawChildId || !rawValue) return;
          const currentChildId = selectedChildBySlot.get(
            getPassengerSlotKey(rawChildId),
          );
          if (currentChildId) result[currentChildId] = true;
        });
        return result;
      }, {});
      if (treatChildrenAsAdults) {
        selectedChildBySlot.forEach((id) => {
          convertedChildToAdultMap[id] = true;
        });
      }
      const convertedChildSlots = new Set(
        Object.keys(convertedChildToAdultMap).map(getPassengerSlotKey),
      );
      const assignedChildExplicitPriceMap = Object.fromEntries(
        Object.entries(
          canonicalizeNumericChildMap(
            beneficiarySnapshot.childPriceMap,
            service?.passengerSelection?.preciosNinos,
            service?.passengerSelection?.assignedChildExplicitPriceMap,
            service?.assignedChildExplicitPriceMap,
          ),
        ).filter(
          ([id]) => !convertedChildSlots.has(getPassengerSlotKey(id)),
        ),
      );
      const childPercentageMap = Object.fromEntries(
        Object.entries(
          canonicalizeNumericChildMap(
            service?.passengerSelection?.childPercentageMap,
            service?.childPercentageMap,
          ),
        ).filter(
          ([id]) => !convertedChildSlots.has(getPassengerSlotKey(id)),
        ),
      );
      const assignedChildExplicitPriceSum = Object.values(
        assignedChildExplicitPriceMap,
      ).reduce((sum, price) => sum + parseMoney(price), 0);
      const assignedChildExplicitCount = Object.keys(
        assignedChildExplicitPriceMap,
      ).length;
      const hasChildExplicitPrices = assignedChildExplicitCount > 0;
      const beneficiariosAdultos = assignedPassengerIds
        .filter(
          (id) =>
            id.startsWith("adult:") ||
            convertedChildSlots.has(getPassengerSlotKey(id)),
        )
        .map((id) =>
          id.startsWith("child:") ? { id, child_origin: id } : { id },
        );
      const beneficiariosNinos = assignedPassengerIds
        .filter(
          (id) =>
            id.startsWith("child:") &&
            !convertedChildSlots.has(getPassengerSlotKey(id)),
        )
        .map((id) => ({
          id,
          precio: parseMoney(assignedChildExplicitPriceMap[id]),
        }));

      const baseAdultTotal = parseMoney(
        service?.tariff?.precio_original ?? service?.tariff?.precio ?? 0,
      );
      const passengerSelection = buildRuntimePassengerSelection(
        service?.passengerSelection || {},
        {
          selectedIds: assignedPassengerIds,
          assignedPassengerCount: assignedPassengerIds.length,
          hasChildExplicitPrices,
          assignedChildExplicitCount,
          assignedChildExplicitPriceMap,
          assignedChildExplicitPriceSum,
          pricingMode,
          uniformPercentage,
          childPercentageMap,
          treatChildrenAsAdults,
          convertedChildToAdultMap,
        },
      );

      return {
        ...service,
        tariff: {
          ...(service?.tariff || {}),
          childExtrasTotal: assignedChildExplicitPriceSum,
          precio_original_with_child_extras:
            baseAdultTotal + assignedChildExplicitPriceSum,
        },
        assignedPassengerIds,
        assignedPassengerCount: assignedPassengerIds.length,
        assignedChildExplicitPriceMap,
        assignedChildExplicitCount,
        assignedChildExplicitPriceSum,
        hasChildExplicitPrices,
        pricingMode,
        uniformPercentage,
        childPercentageMap,
        treatChildrenAsAdults,
        convertedChildToAdultMap,
        childPriceMap: assignedChildExplicitPriceMap,
        beneficiariosAdultos,
        beneficiariosNinos,
        beneficiarios_adultos: undefined,
        beneficiarios_ninos: undefined,
        passenger_selection: undefined,
        passengerSelection,
      };
    },
    [allPassengerIds],
  );

  const normalizeServiceForDisplay = useCallback(
    (service) => {
      const [normalized] = normalizeServicesForPeople([service], {
        preserveExistingSelection: true,
      });
      return syncServicePassengerState(normalized || service);
    },
    [normalizeServicesForPeople, syncServicePassengerState],
  );

  const normalizeExternalServicesForDisplay = useCallback(
    (services = []) =>
      normalizeServicesForPeople(services, {
        preserveExistingSelection: true,
      }).map(syncServicePassengerState),
    [normalizeServicesForPeople, syncServicePassengerState],
  );

  const updateServiceByIndex = useCallback(
    (dayIndex, serviceIndex, updater) => {
      setDays((prev) => {
        const day = prev?.[dayIndex];
        const currentService = day?.servicios?.[serviceIndex];
        if (!day || !currentService) return prev;
        if (isOperationallyAssignedService(currentService)) return prev;

        const next = [...prev];
        const nextDay = {
          ...day,
          servicios: [...(day.servicios || [])],
        };
        const normalizedService = normalizeServiceForDisplay(currentService);
        const updatedService = updater(normalizedService);
        if (!updatedService) return prev;

        nextDay.servicios[serviceIndex] =
          syncServicePassengerState(updatedService);
        next[dayIndex] = nextDay;
        return next;
      });
    },
    [normalizeServiceForDisplay, setDays, syncServicePassengerState],
  );

  const mergedDays = useMemo(() => {
    const daysWithSourceIndex = (days || []).map((day, sourceDayIndex) => ({
      ...day,
      sourceDayIndex,
    }));
    const linkedDays = new Map(
      daysWithSourceIndex
        .filter((day) => day.isLinked)
        .map((day) => [day.numero, day]),
    );
    const extraDays = daysWithSourceIndex.filter((day) => !day.isLinked);

    const result = [];
    mainDays.forEach((md) => {
      const extDay = linkedDays.get(md.numero);
      result.push({
        numero: md.numero,
        titulo: md.titulo || `Día ${md.numero}`,
        isLinked: true,
        sourceDayIndex: extDay?.sourceDayIndex ?? null,
        mainServices: md.servicios || [],
        servicios: normalizeExternalServicesForDisplay(
          extDay?.servicios || [],
        ),
      });
    });
    extraDays.forEach((ed) => {
      result.push({
        numero: ed.numero,
        titulo: ed.titulo || "",
        isLinked: false,
        sourceDayIndex: ed.sourceDayIndex,
        mainServices: [],
        servicios: normalizeExternalServicesForDisplay(ed.servicios || []),
      });
    });
    return result;
  }, [days, mainDays, normalizeExternalServicesForDisplay]);


  const externalBreakdown = useMemo(
    () =>
      calculateExternalItineraryBreakdown(
        mergedDays.map((day) => ({
          ...day,
          servicios: Array.isArray(day?.servicios) ? day.servicios : [],
        })),
        normalizedPeopleDetails,
      ),
    [mergedDays, normalizedPeopleDetails],
  );

  const svcCount = useMemo(
    () =>
      mergedDays.reduce((sum, day) => sum + (day.servicios?.length || 0), 0),
    [mergedDays],
  );

  const handleAddExtraDay = useCallback(() => {
    setDays((prev) => {
      const maxExtra = prev
        .filter((d) => !d.isLinked)
        .reduce((max, d) => Math.max(max, d.numero || 0), 0);
      const maxMain = mainDays.reduce(
        (max, d) => Math.max(max, d.numero || 0),
        0,
      );
      const newNum = Math.max(maxExtra, maxMain) + 1;
      return [
        ...prev,
        {
          numero: newNum,
          titulo: "",
          ciudades: [],
          servicios: [],
          isLinked: false,
        },
      ];
    });
  }, [setDays, mainDays]);

  const handleRemoveExtraDay = useCallback(
    (dayNumero) => {
      setDays((prev) => {
        const targetDay = prev.find(
          (day) => day.numero === dayNumero && !day.isLinked,
        );
        const hasProtectedService = (targetDay?.servicios || []).some(
          isOperationallyAssignedService,
        );
        if (hasProtectedService) return prev;

        return prev.filter((d) => d.numero !== dayNumero || d.isLinked);
      });
    },
    [setDays],
  );

  const handleDayTitleChange = useCallback(
    (dayNumero, title) => {
      setDays((prev) =>
        prev.map((d) =>
          d.numero === dayNumero && !d.isLinked ? { ...d, titulo: title } : d,
        ),
      );
    },
    [setDays],
  );

  const handleOpenPicker = useCallback((dayNumero, isLinked, category) => {
    setPickerDayNumero({ numero: dayNumero, isLinked });
    setPickerCategory(category || null);
    setPickerOpen(true);
  }, []);

  const addServiceToExternalDay = useCallback(
    (selectedService, targetDay) => {
      if (!targetDay) return;
      const { numero, isLinked } = targetDay;
      setDays((prev) => {
        const existingIdx = prev.findIndex(
          (d) => d.numero === numero && d.isLinked === isLinked,
        );
        const newSvc = {
          ...selectedService,
          id: `ext-${numero}-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`,
          typeService:
            detectServiceType(selectedService) ||
            selectedService.typeService ||
            selectedService.parentService?.typeService ||
            "otros",
        };
        const [normalizedService] = normalizeServicesForPeople([newSvc], {
          preserveExistingSelection: false,
        });

        if (existingIdx >= 0) {
          const next = [...prev];
          const day = { ...next[existingIdx] };
          day.servicios = [
            ...(day.servicios || []),
            syncServicePassengerState(normalizedService || newSvc),
          ];
          next[existingIdx] = day;
          return next;
        } else {
          return [
            ...prev,
            {
              numero,
              titulo: "",
              ciudades: [],
              servicios: [
                syncServicePassengerState(normalizedService || newSvc),
              ],
              isLinked,
            },
          ];
        }
      });
    },
    [
      normalizeServicesForPeople,
      setDays,
      syncServicePassengerState,
    ],
  );

  const handleServiceSelected = useCallback(
    (selectedService) => {
      if (!pickerDayNumero) return;
      addServiceToExternalDay(selectedService, pickerDayNumero);
      setPickerOpen(false);
      setPickerCategory(null);
    },
    [addServiceToExternalDay, pickerDayNumero],
  );

  const handleOpenFlightPicker = useCallback((dayNumero, isLinked) => {
    setFlightError("");
    setFlightPickerDay({ numero: dayNumero, isLinked });
  }, []);

  const handleAddFlightByProcedencia = useCallback(
    async (procedencia) => {
      if (!flightPickerDay || flightLoading) return;

      setFlightLoading(true);
      setFlightError("");
      try {
        const [tiposResponse, vuelosResponse] = await Promise.all([
          axiosInstance.get("/turismo/tipos-vuelo/con-tarifas"),
          axiosInstance.get("/turismo/vuelos"),
        ]);
        const vuelosById = new Map(
          normalizeApiList(vuelosResponse).map((vuelo) => [
            Number(vuelo?.id_vuelo),
            vuelo,
          ]),
        );
        const options = normalizeApiList(tiposResponse)
          .map((entry) => {
            const tipoVuelo = entry?.tipo_vuelo || entry?.tipoVuelo || entry;
            const fallbackVuelo = vuelosById.get(Number(tipoVuelo?.id_vuelo));
            return fallbackVuelo
              ? {
                  ...entry,
                  vuelo: entry?.vuelo || entry?.vuelos || fallbackVuelo,
                }
              : entry;
          })
          .filter((entry) => {
            const parent = getFlightOptionParent(entry, procedencia);
            const parentName = normalizeFlightText(parent?.nombre);
            const entryProcedencia = getFlightOptionProcedencia(entry);
            return (
              parentName.includes("vuelos") &&
              entryProcedencia === normalizeFlightText(procedencia)
            );
          });
        const selectedEntry =
          options.find((entry) => selectFlightTariff(entry, packageType)) ||
          null;

        if (!selectedEntry) {
          setFlightError(
            `No se encontró vuelo ${procedencia} con tarifa disponible.`,
          );
          return;
        }

        const parentService = getFlightOptionParent(
          selectedEntry,
          procedencia,
        );
        const childService = getFlightOptionChild(selectedEntry, packageType);
        const tariff = selectFlightTariff(selectedEntry, packageType);
        const unifiedFlight = createUnifiedService(
          parentService,
          childService,
          tariff,
          normalizedPeopleDetails,
          packageType,
          null,
        );

        addServiceToExternalDay(
          {
            ...unifiedFlight,
            typeService: "vuelos",
          },
          flightPickerDay,
        );
        setFlightPickerDay(null);
      } catch (error) {
        console.error("No se pudo agregar vuelo automático:", error);
        setFlightError("No se pudo cargar la tarifa de vuelos.");
      } finally {
        setFlightLoading(false);
      }
    },
    [
      addServiceToExternalDay,
      flightLoading,
      flightPickerDay,
      normalizedPeopleDetails,
      packageType,
    ],
  );

  const handleRemoveService = useCallback(
    (dayIndex, serviceIndex) => {
      setDays((prev) => {
        const day = prev?.[dayIndex];
        const currentService = day?.servicios?.[serviceIndex];
        if (!day || !currentService) return prev;
        if (isOperationallyAssignedService(currentService)) return prev;

        const next = [...prev];
        const nextDay = { ...day };
        nextDay.servicios = (nextDay.servicios || []).filter(
          (_, index) => index !== serviceIndex,
        );
        if (nextDay.isLinked && nextDay.servicios.length === 0) {
          return prev.filter((_, index) => index !== dayIndex);
        }
        next[dayIndex] = nextDay;
        return next;
      });
    },
    [setDays],
  );

  const handleServiceDragEnd = useCallback(
    (dayIndex, event) => {
      const { active, over } = event;
      if (!over || active.id === over.id || dayIndex == null) return;

      setDays((prev) => {
        const day = prev?.[dayIndex];
        if (!day?.servicios?.length) return prev;

        const oldIndex = day.servicios.findIndex(
          (service, serviceIndex) =>
            getSortableId(service, dayIndex, serviceIndex) === active.id,
        );
        const newIndex = day.servicios.findIndex(
          (service, serviceIndex) =>
            getSortableId(service, dayIndex, serviceIndex) === over.id,
        );

        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
          return prev;
        }
        if (
          isOperationallyAssignedService(day.servicios[oldIndex]) ||
          isOperationallyAssignedService(day.servicios[newIndex])
        ) {
          return prev;
        }

        const next = [...prev];
        next[dayIndex] = {
          ...day,
          servicios: arrayMove(day.servicios, oldIndex, newIndex),
        };
        return next;
      });
    },
    [setDays],
  );

  const getServiceCapacityForEdit = useCallback(
    (service) => {
      const serviceType = detectServiceType(service);
      const { paxAssigned } = getDivisionCountsForService(
        service,
        totalPassengers,
      );

      if (serviceType === "hoteles") {
        const roomType =
          service.childService?.tipo_habitacion ||
          service.childService?.habitacion?.tipo_habitacion ||
          "";
        return getRoomCapacity(roomType);
      }

      if (serviceType === "transportes" || serviceType === "guias") {
        return paxAssigned;
      }

      if (serviceType === "endoses") {
        return getTourCapacity(service) || 1;
      }

      if (serviceType === "extras") {
        return (
          service.parentService?.capacidad ||
          service.capacidad ||
          service.pasajerosBeneficiados ||
          service.tariff?.pasajeros_beneficiados ||
          1
        );
      }

      return paxAssigned;
    },
    [totalPassengers],
  );

  const togglePriceAdjustment = useCallback(
    (
      dayIndex,
      serviceIndex,
      isDiscount,
      isDirectEdit = false,
      isGroupEdit = false,
      editType = "total",
    ) => {
      const persistedService = days?.[dayIndex]?.servicios?.[serviceIndex];
      if (!isGroupEdit && isOperationallyAssignedService(persistedService)) {
        setEditingPrice(INITIAL_EDITING_PRICE);
        setEditingChildPrice(INITIAL_EDITING_CHILD_PRICE);
        return;
      }

      setEditingChildPrice(INITIAL_EDITING_CHILD_PRICE);

      if (
        editingPrice.dayIndex === dayIndex &&
        editingPrice.serviceIndex === serviceIndex &&
        editingPrice.isGroupEdit === isGroupEdit
      ) {
        setEditingPrice(INITIAL_EDITING_PRICE);
        return;
      }

      let currentPrice = 0;
      const currentService = normalizeServiceForDisplay(
        days?.[dayIndex]?.servicios?.[serviceIndex],
      );

      if (isGroupEdit) {
        currentPrice = 0;
      } else if (currentService) {
        currentPrice = isDirectEdit
          ? parseMoney(
              currentService.tariff?.precio ||
                currentService.tariff?.precio_original ||
                0,
            )
          : getServiceTotal(currentService);
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
    },
    [days, editingPrice, normalizeServiceForDisplay],
  );

  const handleAdjustmentValueChange = useCallback((e) => {
    const { value } = e.target;
    setEditingPrice((prev) => ({ ...prev, value, error: "" }));
  }, []);

  const applyAdjustment = useCallback(() => {
    const { dayIndex, serviceIndex, value } = editingPrice;
    if (dayIndex == null || serviceIndex == null) return;

    const numValue = parseMoney(value);
    if (numValue < 0) {
      setEditingPrice((prev) => ({
        ...prev,
        error: "Ingresa un valor válido",
      }));
      return;
    }

    const service = normalizeServiceForDisplay(
      days?.[dayIndex]?.servicios?.[serviceIndex],
    );
    if (!service?.tariff) return;

    const { paxForDivision } = getDivisionCountsForService(
      service,
      totalPassengers,
    );
    const serviceType = detectServiceType(service);
    const capacity = getServiceCapacityForEdit(service);

    let newPrecioOriginal = 0;
    if (serviceType === "hoteles") {
      newPrecioOriginal = numValue * capacity;
    } else if (serviceType === "transportes" || serviceType === "guias") {
      newPrecioOriginal = numValue * paxForDivision;
    } else if (serviceType === "endoses") {
      newPrecioOriginal =
        getTourCapacity(service) != null
          ? numValue * capacity
          : numValue * paxForDivision;
    } else if (serviceType === "extras") {
      newPrecioOriginal = numValue * capacity;
    } else {
      newPrecioOriginal = numValue * paxForDivision;
    }

    updateServiceByIndex(dayIndex, serviceIndex, (currentService) => ({
      ...currentService,
      tariff: {
        ...(currentService.tariff || {}),
        precio: numValue,
        precio_original: newPrecioOriginal,
        precio_original_with_child_extras:
          newPrecioOriginal +
          parseMoney(currentService.tariff?.childExtrasTotal),
      },
    }));

    setEditingPrice(INITIAL_EDITING_PRICE);
  }, [
    days,
    editingPrice,
    getServiceCapacityForEdit,
    normalizeServiceForDisplay,
    totalPassengers,
    updateServiceByIndex,
  ]);

  const applyUniformChildPrice = useCallback(
    (dayIndex, serviceIndex, priceType, customValue = null) => {
      if (dayIndex == null || serviceIndex == null) return;

      updateServiceByIndex(dayIndex, serviceIndex, (service) => {
        const assignedIds =
          service.assignedPassengerIds ||
          service.passengerSelection?.selectedIds ||
          allPassengerIds;
        const benefSnap = getServiceBeneficiarySnapshot(service);
        const materializedAssignedIds =
          assignedIds.length > 0 ? assignedIds : benefSnap.selectedIds;
        const serviceChildIds =
          benefSnap.allChildIds.length > 0
            ? benefSnap.allChildIds
            : materializedAssignedIds.filter((id) => id.startsWith("child:"));
        const adultUnitPrice = parseMoney(
          service.tariff?.precio || service.precio || 0,
        );

        let newChildPriceMap = {};
        let newChildExtrasTotal = 0;
        let pricingMode = "fixed";
        let uniformPercentage = "";

        switch (priceType) {
          case "zero":
            serviceChildIds.forEach((childId) => {
              newChildPriceMap[childId] = 0;
            });
            break;
          case "adult": {
            const currentAssignedIds = [...materializedAssignedIds];
            const convertedMap = {
              ...(service.convertedChildToAdultMap || {}),
            };
            serviceChildIds.forEach((childId) => {
              convertedMap[childId] = true;
            });
            const svcTypeStr = (
              service.parentService?.typeService ||
              service.typeService ||
              ""
            ).toLowerCase();
            const isHotelSvc = svcTypeStr === "hoteles";
            const isDividedSvc =
              svcTypeStr === "transportes" ||
              svcTypeStr === "guias" ||
              (svcTypeStr === "endoses" && getTourCapacity(service) != null);
            const newAdultEquivCount = currentAssignedIds.length;

            let updatedTariff = {
              ...(service.tariff || {}),
              childExtrasTotal: 0,
              precio_original_with_child_extras: parseMoney(
                service.tariff?.precio_original,
              ),
            };

            if (!isHotelSvc && service.tariff && newAdultEquivCount > 0) {
              if (isDividedSvc) {
                const basePrice = parseMoney(
                  service.tariff.precio_original || 0,
                );
                if (basePrice > 0) {
                  updatedTariff = {
                    ...updatedTariff,
                    precio:
                      Math.round((basePrice / newAdultEquivCount) * 100) / 100,
                    childExtrasTotal: 0,
                    precio_original_with_child_extras: basePrice,
                  };
                }
              } else {
                const unitPrice = parseMoney(service.tariff.precio || 0);
                const newPrecioOriginal =
                  Math.round(unitPrice * newAdultEquivCount * 100) / 100;
                updatedTariff = {
                  ...updatedTariff,
                  precio_original: newPrecioOriginal,
                  childExtrasTotal: 0,
                  precio_original_with_child_extras: newPrecioOriginal,
                };
              }
            }

            return {
              ...service,
              precio_adult: undefined,
              pricingMode: "adult",
              treatChildrenAsAdults: true,
              uniformPercentage: "",
              assignedPassengerIds: currentAssignedIds,
              convertedChildToAdultMap: convertedMap,
              assignedChildExplicitPriceMap: {},
              assignedChildExplicitPriceSum: 0,
              hasChildExplicitPrices: false,
              assignedChildExplicitCount: 0,
              tariff: updatedTariff,
              passengerSelection: {
                ...(service.passengerSelection || {}),
                selectedIds: currentAssignedIds,
                assignedPassengerCount: currentAssignedIds.length,
                hasChildExplicitPrices: false,
                assignedChildExplicitCount: 0,
                assignedChildExplicitPriceMap: {},
                assignedChildExplicitPriceSum: 0,
                pricingMode: "adult",
                treatChildrenAsAdults: true,
                uniformPercentage: "",
                convertedChildToAdultMap: convertedMap,
                ninosComoAdulto: convertedMap,
              },
            };
          }
          case "percentage": {
            const percentage = parseMoney(customValue) || 50;
            const childPrice = (percentage / 100) * adultUnitPrice;
            serviceChildIds.forEach((childId) => {
              newChildPriceMap[childId] = childPrice;
            });
            newChildExtrasTotal = childPrice * serviceChildIds.length;
            pricingMode = "percentage";
            uniformPercentage = percentage.toString();
            break;
          }
          case "fixed": {
            const fixedPrice = parseMoney(customValue);
            serviceChildIds.forEach((childId) => {
              newChildPriceMap[childId] = fixedPrice;
            });
            newChildExtrasTotal = fixedPrice * serviceChildIds.length;
            break;
          }
          default:
            return service;
        }

        const nonAdultServiceType = (
          service.parentService?.typeService ||
          service.typeService ||
          ""
        ).toLowerCase();
        const nonAdultIsDivided =
          nonAdultServiceType === "transportes" ||
          nonAdultServiceType === "guias" ||
          (nonAdultServiceType === "endoses" && getTourCapacity(service) != null);
        const nonAdultIsHotel = nonAdultServiceType === "hoteles";
        const nonAdultRealAdultCount = materializedAssignedIds.filter(
          (id) => !id.startsWith("child:"),
        ).length;
        const nonAdultEffectiveCount = Math.max(1, nonAdultRealAdultCount);
        let nonAdultTariff = { ...(service.tariff || {}) };
        if (service.tariff && !nonAdultIsHotel) {
          if (nonAdultIsDivided) {
            const bp = parseMoney(service.tariff.precio_original || 0);
            if (bp > 0) {
              nonAdultTariff = {
                ...nonAdultTariff,
                precio:
                  Math.round((bp / nonAdultEffectiveCount) * 100) / 100,
                childExtrasTotal: newChildExtrasTotal,
                precio_original_with_child_extras: bp + newChildExtrasTotal,
              };
            }
          } else {
            const up = parseMoney(service.tariff.precio || 0);
            const np = Math.round(up * nonAdultEffectiveCount * 100) / 100;
            nonAdultTariff = {
              ...nonAdultTariff,
              precio_original: np,
              childExtrasTotal: newChildExtrasTotal,
              precio_original_with_child_extras: np + newChildExtrasTotal,
            };
          }
        } else {
          nonAdultTariff = {
            ...nonAdultTariff,
            childExtrasTotal: newChildExtrasTotal,
            precio_original_with_child_extras:
              parseMoney(service.tariff?.precio_original) + newChildExtrasTotal,
          };
        }
        return {
          ...service,
          precio_adult: nonAdultIsHotel ? service.precio_adult : undefined,
          assignedPassengerIds: materializedAssignedIds,
          convertedChildToAdultMap: {},
          pricingMode,
          treatChildrenAsAdults: false,
          uniformPercentage,
          assignedChildExplicitPriceMap: newChildPriceMap,
          assignedChildExplicitPriceSum: newChildExtrasTotal,
          hasChildExplicitPrices: true,
          tariff: nonAdultTariff,
          passengerSelection: {
            ...(service.passengerSelection || {}),
            selectedIds: materializedAssignedIds,
            assignedPassengerCount: materializedAssignedIds.length,
            convertedChildToAdultMap: {},
            ninosComoAdulto: {},
            hasChildExplicitPrices: true,
            assignedChildExplicitCount: serviceChildIds.length,
            assignedChildExplicitPriceMap: newChildPriceMap,
            assignedChildExplicitPriceSum: newChildExtrasTotal,
            pricingMode,
            treatChildrenAsAdults: false,
            uniformPercentage,
            preciosNinos: newChildPriceMap,
          },
        };
      });
    },
    [allPassengerIds, updateServiceByIndex],
  );

  const applyIndividualChildPrice = useCallback(
    (dayIndex, serviceIndex, childId, priceType, customValue) => {
      if (dayIndex == null || serviceIndex == null || !childId) return;

      updateServiceByIndex(dayIndex, serviceIndex, (service) => {
        const adultUnitPrice = parseMoney(
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
          case "percentage":
            newChildPrice = (parseMoney(customValue) / 100) * adultUnitPrice;
            break;
          case "fixed":
            newChildPrice = parseMoney(customValue);
            break;
          default:
            return service;
        }

        const currentChildPriceMap = {
          ...(service.assignedChildExplicitPriceMap || {}),
          [childId]: newChildPrice,
        };
        const childSlot = getPassengerSlotKey(childId);
        const convertedMap = Object.fromEntries(
          Object.entries({
            ...(service.passengerSelection?.convertedChildToAdultMap || {}),
            ...(service.convertedChildToAdultMap || {}),
          }).filter(([key, value]) => {
            const convertedChildId = key.startsWith("child:")
              ? key
              : typeof value === "string" && value.startsWith("child:")
                ? value
                : "";
            return getPassengerSlotKey(convertedChildId) !== childSlot;
          }),
        );
        const childPercentageMap = {
          ...(service.passengerSelection?.childPercentageMap || {}),
          ...(service.childPercentageMap || {}),
        };
        if (priceType === "percentage") {
          childPercentageMap[childId] = parseMoney(customValue);
        } else {
          Object.keys(childPercentageMap).forEach((key) => {
            if (getPassengerSlotKey(key) === childSlot) {
              delete childPercentageMap[key];
            }
          });
        }
        const newChildExtrasTotal = Object.values(currentChildPriceMap).reduce(
          (sum, price) => sum + parseMoney(price),
          0,
        );
        const assignedIds =
          service.assignedPassengerIds ||
          service.passengerSelection?.selectedIds ||
          allPassengerIds;
        const serviceChildIds = assignedIds.filter((id) =>
          id.startsWith("child:"),
        );

        return {
          ...service,
          assignedChildExplicitPriceMap: currentChildPriceMap,
          assignedChildExplicitPriceSum: newChildExtrasTotal,
          assignedChildExplicitCount: Object.keys(currentChildPriceMap).length,
          hasChildExplicitPrices: true,
          pricingMode: "mixed",
          treatChildrenAsAdults: false,
          convertedChildToAdultMap: convertedMap,
          childPercentageMap,
          tariff: {
            ...(service.tariff || {}),
            childExtrasTotal: newChildExtrasTotal,
            precio_original_with_child_extras:
              parseMoney(service.tariff?.precio_original) + newChildExtrasTotal,
          },
          passengerSelection: {
            ...(service.passengerSelection || {}),
            selectedIds: assignedIds,
            assignedPassengerCount: assignedIds.length,
            hasChildExplicitPrices: true,
            assignedChildExplicitCount: serviceChildIds.length,
            assignedChildExplicitPriceMap: currentChildPriceMap,
            assignedChildExplicitPriceSum: newChildExtrasTotal,
            pricingMode: "mixed",
            treatChildrenAsAdults: false,
            convertedChildToAdultMap: convertedMap,
            childPercentageMap,
          },
        };
      });
    },
    [allPassengerIds, updateServiceByIndex],
  );

  const handleConvertChildToAdult = useCallback(
    (dayIndex, serviceIndex, childIdToConvert) => {
      if (dayIndex == null || serviceIndex == null || !childIdToConvert) return;

      updateServiceByIndex(dayIndex, serviceIndex, (service) => {
        const assignedIds = service.assignedPassengerIds || [];
        if (!assignedIds.includes(childIdToConvert)) return service;

        const convertedMap = {
          ...(service.convertedChildToAdultMap || {}),
          [childIdToConvert]: true,
        };
        const newAssignedIds = [...assignedIds];
        const adultCount = newAssignedIds.filter((id) =>
          id.startsWith("adult:"),
        ).length;
        const convertedCount = Object.entries(convertedMap).filter(
          ([key, value]) =>
            key.startsWith("child:") ||
            (typeof value === "string" && value.startsWith("child:")),
        ).length;
        const effectiveAdultCount = Math.max(1, adultCount + convertedCount);

        const childPriceMap = {
          ...(service.assignedChildExplicitPriceMap || {}),
        };
        delete childPriceMap[childIdToConvert];

        let newChildExtrasTotal = Object.values(childPriceMap).reduce(
          (sum, price) => sum + parseMoney(price),
          0,
        );
        const remainingChildCount = Object.keys(childPriceMap).length;

        const updatedService = {
          ...service,
          assignedPassengerIds: newAssignedIds,
          convertedChildToAdultMap: convertedMap,
          assignedChildExplicitPriceMap: childPriceMap,
          assignedChildExplicitPriceSum: newChildExtrasTotal,
          hasChildExplicitPrices: remainingChildCount > 0,
          assignedChildExplicitCount: remainingChildCount,
        };

        const serviceType = detectServiceType(updatedService);
        const isDividedPricing =
          serviceType === "transportes" ||
          serviceType === "guias" ||
          (serviceType === "endoses" && getTourCapacity(updatedService) != null);

        if (isDividedPricing) {
          const basePrice = parseMoney(updatedService.tariff?.precio_original);
          if (basePrice > 0) {
            updatedService.tariff = {
              ...(updatedService.tariff || {}),
              precio: Math.round((basePrice / effectiveAdultCount) * 100) / 100,
              childExtrasTotal: newChildExtrasTotal,
              precio_original_with_child_extras:
                basePrice + newChildExtrasTotal,
            };
          }
        } else if (serviceType === "hoteles") {
          updatedService.tariff = {
            ...(updatedService.tariff || {}),
            childExtrasTotal: newChildExtrasTotal,
            precio_original_with_child_extras:
              parseMoney(updatedService.tariff?.precio_original) +
              newChildExtrasTotal,
          };
        } else {
          const unitPrice = parseMoney(updatedService.tariff?.precio);
          const newPrecioOriginal = unitPrice * effectiveAdultCount;
          updatedService.tariff = {
            ...(updatedService.tariff || {}),
            precio_original: newPrecioOriginal,
            childExtrasTotal: newChildExtrasTotal,
            precio_original_with_child_extras:
              newPrecioOriginal + newChildExtrasTotal,
          };
        }

        if (
          updatedService.pricingMode === "percentage" &&
          updatedService.uniformPercentage &&
          remainingChildCount > 0
        ) {
          const percentage = parseMoney(updatedService.uniformPercentage);
          const newUnitPrice = parseMoney(updatedService.tariff?.precio);
          const recalculatedChildPrice = (percentage / 100) * newUnitPrice;

          Object.keys(childPriceMap).forEach((childId) => {
            childPriceMap[childId] = recalculatedChildPrice;
          });

          newChildExtrasTotal = Object.values(childPriceMap).reduce(
            (sum, price) => sum + parseMoney(price),
            0,
          );

          updatedService.assignedChildExplicitPriceMap = childPriceMap;
          updatedService.assignedChildExplicitPriceSum = newChildExtrasTotal;
          updatedService.tariff = {
            ...(updatedService.tariff || {}),
            childExtrasTotal: newChildExtrasTotal,
            precio_original_with_child_extras:
              parseMoney(updatedService.tariff?.precio_original) +
              newChildExtrasTotal,
          };
        }

        updatedService.passengerSelection = {
          ...(updatedService.passengerSelection || {}),
          selectedIds: newAssignedIds,
          assignedPassengerCount: newAssignedIds.length,
          convertedChildToAdultMap: { ...convertedMap },
          hasChildExplicitPrices: remainingChildCount > 0,
          assignedChildExplicitCount: remainingChildCount,
          assignedChildExplicitPriceMap:
            updatedService.assignedChildExplicitPriceMap,
          assignedChildExplicitPriceSum:
            updatedService.assignedChildExplicitPriceSum,
        };

        delete updatedService.precio_adult;
        return updatedService;
      });
    },
    [updateServiceByIndex],
  );

  const handleRevertAdultToChild = useCallback(
    (dayIndex, serviceIndex, convertedAdultId) => {
      if (dayIndex == null || serviceIndex == null || !convertedAdultId) return;

      updateServiceByIndex(dayIndex, serviceIndex, (service) => {
        const serviceSnapshot = getServiceBeneficiarySnapshot(service);
        const convertedMap = {
          ...(serviceSnapshot.pricingState?.convertedChildToAdultMap || {}),
          ...(service.convertedChildToAdultMap || {}),
          ...(service.passengerSelection?.convertedChildToAdultMap || {}),
          ...(service.passengerSelection?.ninosComoAdulto || {}),
        };
        const findConvertedKeyByChildSlot = (childId) => {
          const childSlot = getPassengerSlotKey(childId);
          return Object.entries(convertedMap).find(([key, value]) => {
            if (
              key.startsWith("child:") &&
              value &&
              getPassengerSlotKey(key) === childSlot
            ) {
              return true;
            }
            return (
              typeof value === "string" &&
              value.startsWith("child:") &&
              getPassengerSlotKey(value) === childSlot
            );
          })?.[0];
        };
        let originalChildId = null;
        if (convertedAdultId.startsWith("child:")) {
          originalChildId = convertedAdultId;
          const keyToDelete =
            convertedMap[convertedAdultId] !== undefined
              ? convertedAdultId
              : findConvertedKeyByChildSlot(convertedAdultId);
          if (!keyToDelete) return service;
          delete convertedMap[keyToDelete];
        } else {
          originalChildId = convertedMap[convertedAdultId];
          if (!originalChildId) return service;
          delete convertedMap[convertedAdultId];
        }

        const assignedIds =
          service.assignedPassengerIds?.length > 0
            ? service.assignedPassengerIds
            : serviceSnapshot.selectedIds;
        if (
          convertedAdultId.startsWith("adult:") &&
          !assignedIds.includes(convertedAdultId)
        ) {
          return service;
        }

        const newAssignedIds = convertedAdultId.startsWith("adult:")
          ? assignedIds.map((id) =>
              id === convertedAdultId ? originalChildId : id,
            )
          : [...assignedIds];

        const adultCount = newAssignedIds.filter((id) =>
          id.startsWith("adult:"),
        ).length;
        const convertedCount = Object.entries(convertedMap).filter(
          ([key, value]) =>
            key.startsWith("child:") ||
            (typeof value === "string" && value.startsWith("child:")),
        ).length;
        const effectiveAdultCount = Math.max(1, adultCount + convertedCount);
        const newChildIds = newAssignedIds.filter((id) =>
          id.startsWith("child:"),
        );

        const childPriceMap = {
          ...(service.assignedChildExplicitPriceMap || {}),
        };
        const revertServiceType = detectServiceType(service);
        const revertIsDivided =
          revertServiceType === "transportes" ||
          revertServiceType === "guias" ||
          (revertServiceType === "endoses" && getTourCapacity(service) != null);
        const revertBasePrice = parseMoney(
          service.tariff?.precio_original || 0,
        );
        const adultUnitPrice =
          revertIsDivided && revertBasePrice > 0 && effectiveAdultCount > 0
            ? Math.round(
                (revertBasePrice / effectiveAdultCount) * 100,
              ) / 100
            : parseMoney(service.tariff?.precio);
        const revertPricingMode =
          service.pricingMode ||
          service.passengerSelection?.pricingMode ||
          "fixed";
        const revertUniformPercentage = parseMoney(
          service.uniformPercentage ||
            service.passengerSelection?.uniformPercentage ||
            0,
        );

        let revertedChildPrice = 0;
        if (revertPricingMode === "adult") {
          revertedChildPrice = 0;
        } else if (
          revertPricingMode === "percentage" &&
          revertUniformPercentage > 0
        ) {
          revertedChildPrice =
            Math.round((revertUniformPercentage / 100) * adultUnitPrice * 100) /
            100;
        } else {
          revertedChildPrice = parseMoney(childPriceMap[originalChildId]);
        }
        childPriceMap[originalChildId] = revertedChildPrice;

        const newChildExtrasTotal = Object.values(childPriceMap).reduce(
          (sum, price) => sum + parseMoney(price),
          0,
        );
        const explicitChildCount = Object.keys(childPriceMap).filter((id) =>
          id.startsWith("child:"),
        ).length;
        const updatedService = {
          ...service,
          assignedPassengerIds: newAssignedIds,
          convertedChildToAdultMap:
            Object.keys(convertedMap).length > 0 ? convertedMap : {},
          assignedChildExplicitPriceMap: childPriceMap,
          assignedChildExplicitPriceSum: newChildExtrasTotal,
          hasChildExplicitPrices: explicitChildCount > 0,
          assignedChildExplicitCount: explicitChildCount,
          pricingMode: "fixed",
          treatChildrenAsAdults: false,
        };

        const serviceType = detectServiceType(updatedService);
        const isDividedPricing =
          serviceType === "transportes" ||
          serviceType === "guias" ||
          (serviceType === "endoses" && getTourCapacity(updatedService) != null);

        if (isDividedPricing) {
          const basePrice = parseMoney(updatedService.tariff?.precio_original);
          if (basePrice > 0) {
            updatedService.tariff = {
              ...(updatedService.tariff || {}),
              precio: Math.round((basePrice / effectiveAdultCount) * 100) / 100,
              childExtrasTotal: newChildExtrasTotal,
              precio_original_with_child_extras:
                basePrice + newChildExtrasTotal,
            };
          }
        } else if (serviceType === "hoteles") {
          updatedService.tariff = {
            ...(updatedService.tariff || {}),
            childExtrasTotal: newChildExtrasTotal,
            precio_original_with_child_extras:
              parseMoney(updatedService.tariff?.precio_original) +
              newChildExtrasTotal,
          };
        } else {
          const unitPrice = parseMoney(updatedService.tariff?.precio);
          const newPrecioOriginal = unitPrice * effectiveAdultCount;
          updatedService.tariff = {
            ...(updatedService.tariff || {}),
            precio_original: newPrecioOriginal,
            childExtrasTotal: newChildExtrasTotal,
            precio_original_with_child_extras:
              newPrecioOriginal + newChildExtrasTotal,
          };
        }

        updatedService.passengerSelection = {
          ...(updatedService.passengerSelection || {}),
          selectedIds: newAssignedIds,
          assignedPassengerCount: newAssignedIds.length,
          convertedChildToAdultMap:
            Object.keys(convertedMap).length > 0 ? { ...convertedMap } : {},
          hasChildExplicitPrices: explicitChildCount > 0,
          assignedChildExplicitCount: explicitChildCount,
          assignedChildExplicitPriceMap:
            updatedService.assignedChildExplicitPriceMap,
          assignedChildExplicitPriceSum:
            updatedService.assignedChildExplicitPriceSum,
          pricingMode: "fixed",
          treatChildrenAsAdults: false,
          ninosComoAdulto:
            Object.keys(convertedMap).length > 0
              ? { ...convertedMap }
              : {},
          preciosNinos: updatedService.assignedChildExplicitPriceMap,
        };

        delete updatedService.precio_adult;
        return updatedService;
      });
    },
    [updateServiceByIndex],
  );

  const getDayExternalSubtotal = (servicios) =>
    (servicios || []).reduce(
      (sum, service) => sum + getServiceTotal(service),
      0,
    );

  const fmt = formatCurrency || ((v) => `$${Number(v).toFixed(2)}`);
  const externalChildAverage =
    parseMoney(externalBreakdown.childTotal) +
    parseMoney(externalBreakdown.convertedChildTotal);

  const modalContent = (
    <div
      className="ext-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className="ext-modal">
        {/* Header */}
        <div className="ext-modal__header">
          <MdFlightTakeoff className="ext-modal__header-icon" />
          <h2 className="ext-modal__title">Itinerario Adicional</h2>
          {svcCount > 0 && (
            <span className="ext-modal__badge">{svcCount} servicio(s)</span>
          )}
          <button className="ext-modal__close" onClick={onClose}>
            <MdClose />
          </button>
        </div>

        {/* Body */}
        <div className="ext-modal__body">
          {mergedDays.length === 0 && (
            <div className="ext-modal__empty">
              Aún no hay días en el itinerario principal. Agrega un día
              adicional abajo.
            </div>
          )}

          {mergedDays.map((day) => {
            const dayExtSubtotal = getDayExternalSubtotal(day.servicios);
            const hasProtectedExternalService = (day.servicios || []).some(
              isOperationallyAssignedService,
            );
            return (
              <div
                key={`${day.isLinked ? "linked" : "extra"}-${day.numero}`}
                className={`ext-modal__day${day.isLinked ? " ext-modal__day--linked" : ""}`}
              >
                {/* Day header */}
                <div className="ext-modal__day-header">
                  <span className="ext-modal__day-badge">Día {day.numero}</span>
                  {day.isLinked ? (
                    <span className="ext-modal__day-title">{day.titulo}</span>
                  ) : (
                    <>
                      <input
                        className="ext-modal__day-title-input"
                        type="text"
                        placeholder="Título del día adicional"
                        value={day.titulo || ""}
                        onChange={(e) =>
                          handleDayTitleChange(day.numero, e.target.value)
                        }
                      />
                      <button
                        className={`ext-modal__day-remove${
                          hasProtectedExternalService
                            ? " ext-modal__day-remove--locked"
                            : ""
                        }`}
                        title={
                          hasProtectedExternalService
                            ? "Este día contiene servicios asignados al voucher y no puede eliminarse"
                            : "Eliminar día"
                        }
                        onClick={() => handleRemoveExtraDay(day.numero)}
                        disabled={hasProtectedExternalService}
                      >
                        {hasProtectedExternalService ? <MdLock /> : <MdDelete />}
                      </button>
                    </>
                  )}
                  {hasProtectedExternalService && (
                    <span
                      className="ext-modal__day-protected"
                      title="Los servicios asignados se conservan sin cambios"
                    >
                      <MdLock /> Asignación protegida
                    </span>
                  )}
                  {dayExtSubtotal > 0 && (
                    <span className="ext-modal__day-subtotal">
                      {fmt(dayExtSubtotal)}
                    </span>
                  )}
                </div>

                {/* Main services summary chips */}
                {day.isLinked && day.mainServices.length > 0 && (
                  <div className="ext-modal__main-chips">
                    {day.mainServices.map((svc, i) => (
                      <span key={i} className="ext-modal__main-chip">
                        {SERVICE_TYPE_LABELS[svc.typeService] ||
                          svc.typeService}
                        : {getServiceName(svc)}
                      </span>
                    ))}
                  </div>
                )}

                {/* External services */}
                <div className="ext-modal__services">
                  {day.servicios.length === 0 && (
                    <div className="ext-modal__empty-svc">
                      Sin servicios adicionales
                    </div>
                  )}
                  {day.servicios.length > 0 && day.sourceDayIndex != null && (
                    <DndContext
                      collisionDetection={closestCenter}
                      onDragEnd={(event) =>
                        handleServiceDragEnd(day.sourceDayIndex, event)
                      }
                    >
                      <SortableContext
                        items={day.servicios.map((service, svcIndex) =>
                          getSortableId(service, day.sourceDayIndex, svcIndex),
                        )}
                        strategy={verticalListSortingStrategy}
                      >
                        {day.servicios.map((service, svcIndex) => {
                          const serviceType = detectServiceType(service);
                          const typeLabel =
                            SERVICE_TYPE_LABELS[serviceType] ||
                            SERVICE_TYPE_LABELS[service.typeService] ||
                            serviceType ||
                            "Servicio";

                          return (
                            <div
                              key={service.id || svcIndex}
                              className="ext-modal__service-sortable"
                              data-service-type={typeLabel}
                            >
                              <SortableService
                                service={service}
                                serviceIndex={svcIndex}
                                dayIndex={day.sourceDayIndex}
                                totalPassengers={totalPassengers}
                                passengers={allPassengers}
                                getAllPassengers={allPassengers}
                                removeService={handleRemoveService}
                                togglePriceAdjustment={togglePriceAdjustment}
                                editingPrice={editingPrice}
                                handleAdjustmentValueChange={
                                  handleAdjustmentValueChange
                                }
                                applyAdjustment={applyAdjustment}
                                onConvertChildToAdult={
                                  handleConvertChildToAdult
                                }
                                onRevertAdultToChild={handleRevertAdultToChild}
                                applyUniformChildPrice={applyUniformChildPrice}
                                applyIndividualChildPrice={
                                  applyIndividualChildPrice
                                }
                                days={days}
                                editingChildPrice={editingChildPrice}
                                setEditingChildPrice={setEditingChildPrice}
                              />
                            </div>
                          );
                        })}
                      </SortableContext>
                    </DndContext>
                  )}
                </div>

                {/* Day footer */}
                <div className="ext-modal__day-footer">
                  <button
                    className="ext-modal__add-svc-btn"
                    onClick={() => handleOpenPicker(day.numero, day.isLinked)}
                  >
                    <MdAddCircleOutline /> Agregar servicio
                  </button>
                  <div className="ext-modal__flight-add">
                    <button
                      className="ext-modal__add-flight-btn"
                      onClick={() =>
                        handleOpenFlightPicker(day.numero, day.isLinked)
                      }
                    >
                      <MdFlightTakeoff /> Agregar vuelo
                    </button>
                    {flightPickerDay?.numero === day.numero &&
                      flightPickerDay?.isLinked === day.isLinked && (
                        <div className="ext-modal__flight-picker">
                          <div className="ext-modal__flight-picker-title">
                            Procedencia del vuelo
                          </div>
                          <div className="ext-modal__flight-picker-actions">
                            <button
                              type="button"
                              disabled={flightLoading}
                              onClick={() =>
                                handleAddFlightByProcedencia("nacional")
                              }
                            >
                              Nacional
                            </button>
                            <button
                              type="button"
                              disabled={flightLoading}
                              onClick={() =>
                                handleAddFlightByProcedencia("internacional")
                              }
                            >
                              Internacional
                            </button>
                          </div>
                          {flightError && (
                            <div className="ext-modal__flight-error">
                              {flightError}
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                </div>
              </div>
            );
          })}

          <button
            className="ext-modal__add-day-btn"
            onClick={handleAddExtraDay}
          >
            <MdAdd /> Agregar día adicional
          </button>
        </div>

        {/* Footer */}
        {(externalBreakdown.adultTotal > 0 || externalChildAverage > 0) && (
          <div className="ext-modal__footer">
            {externalBreakdown.adultTotal > 0 && (
              <div className="ext-modal__footer-item ext-modal__footer-item--adult">
                <span className="ext-modal__footer-label">Por adulto</span>
                <span className="ext-modal__footer-total">
                  {fmt(externalBreakdown.adultTotal)}
                </span>
              </div>
            )}
            {externalChildAverage > 0 && (
              <div
                className="ext-modal__footer-item ext-modal__footer-item--child"
                title={
                  externalBreakdown.convertedChildTotal > 0
                    ? `Niño: ${fmt(externalBreakdown.childTotal)} · Niño como adulto: ${fmt(externalBreakdown.convertedChildTotal)}`
                    : undefined
                }
              >
                <span className="ext-modal__footer-label">Por niño</span>
                <span className="ext-modal__footer-total">
                  {fmt(externalChildAverage)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ServicePicker portal */}
        {pickerOpen &&
          ReactDOM.createPortal(
            <ExtraServiceModal
              isOpen={pickerOpen}
              onClose={() => {
                setPickerOpen(false);
                setPickerCategory(null);
              }}
              onSave={handleServiceSelected}
              packageType={packageType}
              peopleDetails={normalizedPeopleDetails}
              platform={platform}
              tariffType={tariffType}
              tieneFeeFilter={false} // Itinerario Externo = Sin Fee
            />,
            document.body,
          )}
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};

export default ExternalItineraryEditor;
