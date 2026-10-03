import { useState, useCallback, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import {
  MdCheck,
  MdWarning,
} from "react-icons/md";
import { FaMapMarkerAlt } from "react-icons/fa";
import ServiceDetailedInfo from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/components/ServiceDetailedInfo/ServiceDetailedInfo";
import { formatCurrency } from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/formatters";
import { getServiceBeneficiarySnapshot } from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/passengerPricingState";
import { getPassengerIdsByType } from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/unifiedServiceManager";
import {
  buildTicketProcedenciaPassengerSelection,
  getTicketEntrada,
  getTicketPassengerTargetGroup,
  getTicketProcedencia,
  normalizeTicketProcedencia,
  normalizeTicketText,
} from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/ticketBeneficiaries";
import QuotationVersionHistory from "../QuotationVersionHistory/QuotationVersionHistory";
import { voucherReservaService } from "../../../../../services/voucherReservaService";
import UnifiedServiceRow from "./components/UnifiedServiceRow";
import {
  calculateDayDate,
  formatDate,
  getTariffBreakdown,
  calculateDayTotal,
  getAssignedPassengerSelectionForService,
  hasChildrenInPeopleDetails,
  syncTariffWithReservationPricing,
  buildAssignedFlatPricingState,
  selectAssignedBeneficiaries,
} from "./utils/editorHelpers";
import {
  applyQuotedServiceValidation,
} from "./utils/validationState";
import "./ReservaServiceEditor.scss";
import { cloneReservationItinerary } from "./utils/itineraryDraft";

const resolveReservationTicketConstraint = (...sources) => {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const procedencia = normalizeTicketProcedencia(getTicketProcedencia(source));
    const targetGroup = getTicketPassengerTargetGroup(source);
    if (procedencia && ["adult", "child", "all"].includes(targetGroup)) {
      return { procedencia, targetGroup };
    }
  }
  return null;
};


const clearAssignedReservationState = (service = {}) => ({
  ...service,
  isAssigned: false,
  is_assigned: false,
  assignedService: null,
  assignedParentService: null,
  assignedChildService: null,
  assignedTariff: null,
  assignedParentId: null,
  assignedChildId: null,
  assigned_parent_id: null,
  assigned_child_id: null,
  assignedPassengerSelection: null,
  assigned_passenger_selection: null,
  assignedPassengerIds: [],
  assignedPassengerCount: 0,
  assignedBeneficiariosAdultos: [],
  assignedBeneficiariosNinos: [],
  assigned_beneficiarios_adultos: [],
  assigned_beneficiarios_ninos: [],
  assignedMoneda: null,
  assigned_moneda: null,
  assignedIgv: null,
  assigned_igv: null,
  assignedHora: null,
  assigned_hora: null,
  assignedPrecioServicio: null,
  assignedPrecioTotal: null,
  assigned_precio_servicio: null,
  assigned_precio_total: null,
  assignedPrecioAdultoDividido: null,
  assigned_precio_adulto_dividido: null,
  assignedCapacidadLimite: null,
  assigned_capacidad_limite: null,
  assignedChildExplicitPriceMap: {},
  assignedChildExplicitPriceSum: 0,
  assignedChildExplicitCount: 0,
});

/**
 * ReservaServiceEditor - Validar servicios cotizados para operación.
 * Cada servicio conserva la identidad vendida y el backend resuelve su tarifa interna.
 */
const ReservaServiceEditor = ({
  cotizacionItinerary = [],
  voucherItinerary = [],
  onChange,
  onImmediateUnassign,
  onBeforeValidation,
  onValidationStateChange,
  totalPassengers = 1,
  peopleDetails = {},
  fechaInicio = null,
  voucherReservaId = "",
  voucherReservaCode = "",
  versionVoucher = null,
  showHeader = true,
  headerActionsContainerId = null,
  onOpenReservationRequest = null,
}) => {
  const [headerActionsTarget, setHeaderActionsTarget] = useState(null);
  const [validatingServiceId, setValidatingServiceId] = useState(null);
  const latestItinerary = useRef(voucherItinerary);
  const validationInFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; onValidationStateChange?.(false); };
  }, []);
  latestItinerary.current = voucherItinerary;

  useEffect(() => {
    if (!headerActionsContainerId || typeof document === "undefined") {
      setHeaderActionsTarget(null);
      return;
    }

    setHeaderActionsTarget(document.getElementById(headerActionsContainerId));
  }, [headerActionsContainerId]);

  const getReservationServiceType = useCallback(
    (...services) => {
      for (const service of services) {
        const rawType =
          service?.typeService ||
          service?.type_service ||
          service?.parentService?.typeService ||
          service?.assignedService?.typeService ||
          service?.assignedService?.parentService?.typeService ||
          service?.assignedParentService?.typeService ||
          service?.category ||
          "";

        if (rawType) return String(rawType).toLowerCase();
      }

      return "";
    },
    [],
  );

  const groupReservationTicketRows = useCallback(
    (services = [], cotizacionServices = []) => {
      const result = [];
      const groups = new Map();

      (Array.isArray(services) ? services : []).forEach((service, index) => {
        const cotService = cotizacionServices?.[index];
        const serviceType = getReservationServiceType(
          service,
          service?.assignedService,
          cotService,
        );
        const isTicket =
          String(serviceType).toLowerCase() === "tickets" ||
          Boolean(
            service?.assignedService?.childService?.ticket ||
              service?.childService?.ticket ||
              cotService?.childService?.ticket,
          );

        const item = { service, serviceIndex: index, cotService };

        if (!isTicket) {
          result.push({ type: "service", ...item });
          return;
        }

        const entrada = getTicketEntrada(
          service?.assignedService?.childService ||
            service?.childService ||
            cotService?.childService ||
            service,
        );
        const key = normalizeTicketText(entrada) || `ticket-${groups.size + 1}`;
        if (!groups.has(key)) {
          const group = { type: "ticketGroup", key, entrada, items: [] };
          groups.set(key, group);
          result.push(group);
        }

        groups.get(key).items.push(item);
      });

      return result;
    },
    [getReservationServiceType],
  );

  // -- State --
  const [editingPrice, setEditingPrice] = useState({
    dayIndex: null,
    serviceIndex: null,
    isDiscount: false,
    mode: "percentage",
    value: "",
    isDirectEdit: false,
  });
  const [editingPaymentDeadline, setEditingPaymentDeadline] = useState({
    dayIndex: null,
    serviceIndex: null,
    value: "",
  });

  const hasChildrenInReservation = hasChildrenInPeopleDetails(peopleDetails);

  const handleValidateQuotedService = useCallback(
    async (dayIndex, serviceIndex) => {
      if (validationInFlight.current) return;
      const service = voucherItinerary?.[dayIndex]?.servicios?.[serviceIndex];
      if (!service?.servicioId) {
        alert("Este servicio no tiene una fila cotizada persistida para validar.");
        return;
      }

      if (service.paymentRequest?.id) {
        const status = service.paymentRequest.status;
        if (status === "pending" || status === "paid") {
          alert(
            `No se puede revalidar este servicio porque tiene una solicitud de pago ${status === "paid" ? "pagada" : "pendiente"}.`,
          );
          return;
        }
      }

      validationInFlight.current = true;
      setValidatingServiceId(service.servicioId);
      onValidationStateChange?.(true);
      try {
        if (onBeforeValidation && !(await onBeforeValidation())) {
          throw new Error("Primero sincronice los cambios pendientes antes de validar otro servicio.");
        }
        const response = await voucherReservaService.validateQuotedService(
          service.servicioId,
          {
            hora:
              service?.assignedService?.hora ||
              service?.assigned_hora ||
              service?.hora ||
              null,
          },
        );
        const enriched = response?.data || {};
        if (!mounted.current) return;
        const validation = response?.validation || {};
        const assignedService =
          enriched.assignedService ||
          enriched.assigned_service ||
          service.assignedService ||
          null;

        const nextItinerary = latestItinerary.current.map((day, currentDayIndex) => {
          if (currentDayIndex !== dayIndex) return day;
          return {
            ...day,
            servicios: (day.servicios || []).map((current, currentServiceIndex) => {
              if (currentServiceIndex !== serviceIndex) return current;
              return applyQuotedServiceValidation(
                current,
                { ...enriched, assignedService },
                validation,
              );
            }),
          };
        });

        latestItinerary.current = nextItinerary;
        await onChange(nextItinerary, { persistedServiceId: service.servicioId });
      } catch (error) {
        if (!mounted.current) return;
        console.error("Error validando el servicio cotizado:", error);
        const message =
          error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          "No se pudo validar el servicio";
        alert(message);
      } finally {
        validationInFlight.current = false;
        if (mounted.current) {
          setValidatingServiceId(null);
          onValidationStateChange?.(false);
        }
      }
    },
    [voucherItinerary, onChange, onBeforeValidation, onValidationStateChange],
  );

  // -- Remove validation --
  const handleRemoveAssignment = async (dayIndex, serviceIndex) => {
    const updatedItinerary = cloneReservationItinerary(latestItinerary.current);
    const service = updatedItinerary[dayIndex].servicios[serviceIndex];

    // Guard: no permitir retirar una validación con una solicitud de pago activa
    if (service.paymentRequest && service.paymentRequest.id) {
      const prStatus = service.paymentRequest.status;
      if (prStatus === "pending" || prStatus === "paid") {
        alert(
          `No se puede desvalidar este servicio porque tiene una solicitud de pago ${prStatus === "paid" ? "pagada" : "pendiente"}. Cancele la solicitud de pago primero.`,
        );
        return;
      }
    }

    // Persistir inmediatamente la desvalidación para liberar el snapshot operativo
    // sin alterar la identidad ni la tarifa comercial de la cotización.
    if (!service.isCustomService && service.servicioId && service.isAssigned) {
      await onImmediateUnassign?.(service.servicioId);
    }

    if (service.isCustomService) {
      updatedItinerary[dayIndex].servicios.splice(serviceIndex, 1);
    } else {
      const cotizacionService =
        cotizacionItinerary[dayIndex]?.servicios?.[serviceIndex];
      const typeServiceFallback =
        cotizacionService?.parentService?.typeService ||
        service.parentService?.typeService ||
        service.cotizacionServiceRef?.typeService ||
        service.assignedService?.parentService?.typeService ||
        "otros";

      updatedItinerary[dayIndex].servicios[serviceIndex] = {
        ...clearAssignedReservationState(service),
        needsUnassign: true,
        _needsUnassign: true,
        parentService: {
          ...service.parentService,
          typeService: typeServiceFallback,
        },
        cotizacionServiceRef: {
          ...service.cotizacionServiceRef,
          typeService: typeServiceFallback,
          dayIndex,
          serviceIndex,
        },
      };
    }
    latestItinerary.current = updatedItinerary;
    void onChange(updatedItinerary);
  };

  // -- Beneficiarios operativos --
  // La validación fija parent/child contra la fila cotizada. Aquí solo se
  // reduce el conjunto que realmente recibe el servicio; nunca se cambia el
  // proveedor/servicio ni se añaden pasajeros ajenos a la cotización.
  const handleAssignedBeneficiariesChange = (
    dayIndex,
    serviceIndex,
    selectedIds,
  ) => {
    if (!Array.isArray(selectedIds) || selectedIds.length === 0) return;

    const updatedItinerary = cloneReservationItinerary(latestItinerary.current);
    const service = updatedItinerary[dayIndex]?.servicios?.[serviceIndex];
    const assignedService = service?.assignedService
      ? { ...service.assignedService }
      : null;
    if (!service || !assignedService) return;

    const currentSelection = getAssignedPassengerSelectionForService(service);
    const nextSelectionInput = selectAssignedBeneficiaries(
      currentSelection,
      selectedIds,
    );
    if (nextSelectionInput.selectedIds.length === 0) return;

    const assignedPrecioAdultoDividido =
      service.assignedPrecioAdultoDividido ??
      assignedService.assignedPrecioAdultoDividido ??
      assignedService.precioAdultoDividido ??
      service.precioAdultoDividido;
    const nextTariff = syncTariffWithReservationPricing({
      tariff: {
        ...(assignedService.tariff || {}),
        childExtrasTotal:
          nextSelectionInput.assignedChildExplicitPriceSum || 0,
      },
      serviceType:
        assignedService.parentService?.typeService ||
        assignedService.typeService ||
        service.parentService?.typeService ||
        service.typeService ||
        "otros",
      childService: assignedService.childService || {},
      passengerSelection: nextSelectionInput,
      unitPrice: parseFloat(assignedService.tariff?.precio || 0),
      fallbackTotal: totalPassengers,
      precioAdultoDividido: assignedPrecioAdultoDividido,
      // Transporte, guía y endose con aforo conservan su importe agrupado.
      // Tickets, trenes y servicios unitarios se reducen con sus beneficiarios.
      preserveGroupedTotal: true,
    });
    const nextSelection = nextTariff.passengerSelection || nextSelectionInput;
    const nextFlatPricing = buildAssignedFlatPricingState({
      tariff: nextTariff,
      passengerSelection: nextSelection,
      precioAdultoDividido: assignedPrecioAdultoDividido,
    });

    assignedService.tariff = nextTariff;
    assignedService.passengerSelection = nextSelection;
    assignedService.assignedPassengerSelection = nextSelection;
    assignedService.assignedPassengerIds = nextSelection.selectedIds;
    assignedService.assignedPassengerCount = nextSelection.selectedIds.length;
    assignedService.convertedChildToAdultMap =
      nextSelection.convertedChildToAdultMap || {};
    assignedService.assignedPrecioAdultoDividido = assignedPrecioAdultoDividido;
    assignedService.assignedPrecioServicio =
      nextFlatPricing.assignedPrecioServicio;
    assignedService.assignedPrecioTotal = nextFlatPricing.assignedPrecioTotal;
    assignedService.assignedBeneficiariosAdultos =
      nextFlatPricing.assignedBeneficiariosAdultos;
    assignedService.assignedBeneficiariosNinos =
      nextFlatPricing.assignedBeneficiariosNinos;

    updatedItinerary[dayIndex].servicios[serviceIndex] = {
      ...service,
      assignedService,
      assignedTariff: nextTariff,
      assignedPassengerIds: nextSelection.selectedIds,
      assignedPassengerCount: nextSelection.selectedIds.length,
      assignedPassengerSelection: nextSelection,
      assignedPrecioAdultoDividido,
      assignedChildExplicitPriceMap:
        nextSelection.assignedChildExplicitPriceMap || {},
      assignedChildExplicitPriceSum:
        nextSelection.assignedChildExplicitPriceSum || 0,
      assignedChildExplicitCount:
        nextSelection.assignedChildExplicitCount || 0,
      pricingMode: nextSelection.pricingMode || "percentage",
      uniformPercentage: nextSelection.uniformPercentage || "",
      childPercentageMap: nextSelection.childPercentageMap || {},
      treatChildrenAsAdults: nextSelection.treatChildrenAsAdults === true,
      convertedChildToAdultMap: nextSelection.convertedChildToAdultMap || {},
      ...nextFlatPricing,
    };
    latestItinerary.current = updatedItinerary;
    void onChange(updatedItinerary);
  };

  // -- Price adjustment (direct edit only) --
  const togglePriceAdjustment = (
    dayIndex,
    serviceIndex,
    _isDiscount,
    _isDirectEdit = true,
  ) => {
    if (
      editingPrice.dayIndex === dayIndex &&
      editingPrice.serviceIndex === serviceIndex
    ) {
      setEditingPrice({
        dayIndex: null,
        serviceIndex: null,
        isDiscount: false,
        mode: "percentage",
        value: "",
        isDirectEdit: false,
      });
    } else {
      const service = voucherItinerary[dayIndex].servicios[serviceIndex];
      let currentPrice = 0;
      if (service.assignedService) {
        currentPrice = parseFloat(
          service.assignedService.tariff?.precio ||
            service.assignedService.precio ||
            0,
        );
      } else if (service.isCustomService && service.tariff) {
        currentPrice = parseFloat(service.tariff.precio || 0);
      }
      setEditingPrice({
        dayIndex,
        serviceIndex,
        isDiscount: false,
        mode: "direct",
        value: currentPrice.toString(),
        isDirectEdit: true,
      });
    }
  };

  const handleAdjustmentValueChange = (e) => {
    setEditingPrice((prev) => ({ ...prev, value: e.target.value }));
  };

  const applyAdjustment = () => {
    const { dayIndex, serviceIndex, value } = editingPrice;
    const newPrice = parseFloat(value);
    if (isNaN(newPrice) || newPrice < 0) return;

    const updatedItinerary = cloneReservationItinerary(latestItinerary.current);
    const service = updatedItinerary[dayIndex].servicios[serviceIndex];

    if (service.isCustomService) {
      const passengerSelection =
        getAssignedPassengerSelectionForService(service);
      const nextTariff = syncTariffWithReservationPricing({
        tariff: service.tariff || { precio: 0, precio_original: 0 },
        serviceType:
          service.parentService?.typeService ||
          service.cotizacionServiceRef?.typeService ||
          service.typeService ||
          "otros",
        childService: service.childService || {},
        passengerSelection,
        unitPrice: newPrice,
        fallbackTotal: totalPassengers,
        precioAdultoDividido:
          service.precioAdultoDividido ??
          service.cotizacionServiceRef?.precioAdultoDividido,
      });
      const nextSelection = nextTariff.passengerSelection || passengerSelection;

      updatedItinerary[dayIndex].servicios[serviceIndex] = {
        ...service,
        tariff: nextTariff,
        assignedTariff: nextTariff,
        assignedPassengerSelection: nextSelection,
      };
    } else {
      if (!service.assignedService) return;
      const assignedService = { ...service.assignedService };
      const passengerSelection =
        getAssignedPassengerSelectionForService(service);
      const nextTariff = syncTariffWithReservationPricing({
        tariff: assignedService.tariff || { precio: 0, precio_original: 0 },
        serviceType:
          assignedService.parentService?.typeService ||
          assignedService.typeService ||
          service.parentService?.typeService ||
          service.cotizacionServiceRef?.typeService ||
          service.typeService ||
          "otros",
        childService: assignedService.childService || {},
        passengerSelection,
        unitPrice: newPrice,
        fallbackTotal: totalPassengers,
        precioAdultoDividido:
          service.assignedPrecioAdultoDividido ??
          assignedService.precioAdultoDividido ??
          service.precioAdultoDividido,
      });
      const nextSelection = nextTariff.passengerSelection || passengerSelection;
      const assignedPrecioAdultoDividido =
        service.assignedPrecioAdultoDividido ??
        assignedService.precioAdultoDividido ??
        service.precioAdultoDividido;
      const nextFlatPricing = buildAssignedFlatPricingState({
        tariff: nextTariff,
        passengerSelection: nextSelection,
        precioAdultoDividido: assignedPrecioAdultoDividido,
      });
      assignedService.tariff = nextTariff;
      assignedService.passengerSelection = nextSelection;
      assignedService.assignedPassengerSelection = nextSelection;
      assignedService.assignedPrecioAdultoDividido =
        assignedPrecioAdultoDividido;
      assignedService.assignedPrecioServicio =
        nextFlatPricing.assignedPrecioServicio;
      assignedService.assignedPrecioTotal = nextFlatPricing.assignedPrecioTotal;
      assignedService.assignedBeneficiariosAdultos =
        nextFlatPricing.assignedBeneficiariosAdultos;
      assignedService.assignedBeneficiariosNinos =
        nextFlatPricing.assignedBeneficiariosNinos;
      updatedItinerary[dayIndex].servicios[serviceIndex] = {
        ...service,
        assignedService,
        assignedTariff: assignedService.tariff,
        assignedPassengerSelection: nextSelection,
        assignedPrecioAdultoDividido,
        ...nextFlatPricing,
      };
    }

    latestItinerary.current = updatedItinerary;
    void onChange(updatedItinerary);
    setEditingPrice({
      dayIndex: null,
      serviceIndex: null,
      isDiscount: false,
      mode: "percentage",
      value: "",
      isDirectEdit: false,
    });
  };

  // -- Assigned service children pricing --
  // mode: 'zero' | 'adult' | 'percentage' | 'individual' | 'setCount'
  const handleUpdateChildPrice = (
    dayIndex,
    serviceIndex,
    mode,
    percentage = null,
    childKey = null,
    rawValue = null,
  ) => {
    const updatedItinerary = cloneReservationItinerary(latestItinerary.current);
    const service = updatedItinerary[dayIndex].servicios[serviceIndex];
    const assignedService = service.assignedService
      ? { ...service.assignedService }
      : null;
    if (!assignedService) return;

    const adultPrice = parseFloat(assignedService.tariff?.precio || 0);

    let paxSel = {
      ...getAssignedPassengerSelectionForService(service),
    };

    const fallbackPassengerIds = getPassengerIdsByType(peopleDetails || {});
    const serviceAssignedIds = Array.isArray(service.assignedPassengerIds)
      ? service.assignedPassengerIds.filter(Boolean)
      : [];
    const paxSelectionIds = Array.isArray(paxSel.selectedIds)
      ? paxSel.selectedIds.filter(Boolean)
      : [];
    const beneficiarySnapshot = getServiceBeneficiarySnapshot(
      {
        ...service,
        tariff: assignedService.tariff || {},
        passengerSelection: paxSel,
        assignedPassengerIds:
          serviceAssignedIds.length > 0 ? serviceAssignedIds : paxSelectionIds,
      },
      paxSel,
    );

    // Derivar IDs reales de niños desde assigned passengers (como DaysEditor.applyChildPrice)
    const assignedIds =
      (serviceAssignedIds.length > 0 ? serviceAssignedIds : null) ||
      (paxSelectionIds.length > 0 ? paxSelectionIds : null) ||
      (beneficiarySnapshot.selectedIds.length > 0
        ? beneficiarySnapshot.selectedIds
        : null) ||
      fallbackPassengerIds.allPassengerIds;
    const allChildIds =
      beneficiarySnapshot.allChildIds.length > 0
        ? beneficiarySnapshot.allChildIds
        : assignedIds.filter(
            (id) => typeof id === "string" && id.startsWith("child:"),
          );

    paxSel = {
      ...paxSel,
      selectedIds: assignedIds,
      assignedPassengerCount:
        paxSel.assignedPassengerCount || assignedIds.length,
      assignedChildExplicitCount:
        typeof paxSel.assignedChildExplicitCount === "number"
          ? paxSel.assignedChildExplicitCount
          : allChildIds.length,
    };

    if (mode === "setCount") {
      const count = typeof rawValue === "number" ? rawValue : 0;
      const existingMap = paxSel.assignedChildExplicitPriceMap || {};
      const newMap = {};
      for (let i = 0; i < count; i++) {
        const key = allChildIds[i] || `child:${i}`;
        newMap[key] =
          existingMap[key] ??
          existingMap[allChildIds[i]] ??
          existingMap[`child:${i}`] ??
          0;
      }
      const newSum = Object.values(newMap).reduce(
        (s, v) => s + (parseFloat(v) || 0),
        0,
      );
      paxSel = {
        ...paxSel,
        assignedChildExplicitCount: count,
        assignedChildExplicitPriceMap: newMap,
        assignedChildExplicitPriceSum: newSum,
        pricingMode: "fixed",
        childPercentageMap: {},
        uniformPercentage: "",
        treatChildrenAsAdults: false,
        convertedChildToAdultMap: {},
      };
    } else if (mode === "individual" && childKey !== null) {
      let price = 0;

      switch (percentage) {
        case "percentage": {
          const pct = parseFloat(rawValue) || 0;
          price = adultPrice * (pct / 100);
          break;
        }
        case "adult":
          price = adultPrice;
          break;
        case "zero":
          price = 0;
          break;
        case "fixed":
        default:
          price = parseFloat(rawValue) || 0;
          break;
      }

      const newMap = {
        ...(paxSel.assignedChildExplicitPriceMap || {}),
        [childKey]: price,
      };
      const newSum = Object.values(newMap).reduce(
        (s, v) => s + (parseFloat(v) || 0),
        0,
      );
      paxSel = {
        ...paxSel,
        assignedChildExplicitPriceMap: newMap,
        assignedChildExplicitPriceSum: newSum,
        pricingMode: "fixed",
        childPercentageMap: {},
        uniformPercentage: "",
        treatChildrenAsAdults: false,
        convertedChildToAdultMap: {
          ...(paxSel.convertedChildToAdultMap || {}),
        },
      };
    } else {
      // Modos bulk: zero / adult / percentage
      // Usar IDs reales de niños (como DaysEditor.applyChildPrice)
      const childIds =
        allChildIds.length > 0
          ? allChildIds
          : Array.from(
              { length: paxSel.assignedChildExplicitCount || 0 },
              (_, i) => `child:${i}`,
            );
      const count = childIds.length;
      if (count === 0) return;

      if (mode === "adult") {
        const bulkConvertedMap = childIds.reduce((accumulator, childId) => {
          accumulator[childId] = true;
          return accumulator;
        }, {});
        paxSel = {
          ...paxSel,
          assignedChildExplicitCount: 0,
          assignedChildExplicitPriceMap: {},
          assignedChildExplicitPriceSum: 0,
          pricingMode: "adult",
          uniformPercentage: "",
          childPercentageMap: {},
          treatChildrenAsAdults: true,
          convertedChildToAdultMap: bulkConvertedMap,
        };
      } else {
        let perChildPrice = 0;
        if (mode === "zero") perChildPrice = 0;
        else if (mode === "fixed" && percentage != null)
          perChildPrice = parseFloat(percentage) || 0;
        else if (mode === "percentage" && percentage != null)
          perChildPrice = adultPrice * (percentage / 100);
        const newMap = {};
        childIds.forEach((id) => {
          newMap[id] = perChildPrice;
        });
        const newSum = perChildPrice * count;
        paxSel = {
          ...paxSel,
          assignedChildExplicitCount: count,
          assignedChildExplicitPriceMap: newMap,
          assignedChildExplicitPriceSum: newSum,
          // Preservar metadata de precios (como DaysEditor.applyChildPrice)
          pricingMode: mode === "zero" ? "fixed" : mode,
          uniformPercentage:
            mode === "percentage"
              ? String(percentage)
              : paxSel.uniformPercentage || "",
          childPercentageMap:
            mode === "percentage"
              ? Object.fromEntries(childIds.map((id) => [id, percentage]))
              : {},
          treatChildrenAsAdults: false,
          convertedChildToAdultMap: {},
        };
      }
    }

    // Recalculate tariff totals
    const nextTariff = syncTariffWithReservationPricing({
      tariff: {
        ...assignedService.tariff,
        childExtrasTotal: paxSel.assignedChildExplicitPriceSum || 0,
      },
      serviceType:
        assignedService.parentService?.typeService ||
        assignedService.typeService ||
        service.parentService?.typeService ||
        service.typeService ||
        "otros",
      childService: assignedService.childService || {},
      passengerSelection: paxSel,
      unitPrice: adultPrice,
      fallbackTotal: totalPassengers,
      precioAdultoDividido:
        service.assignedPrecioAdultoDividido ??
        assignedService.precioAdultoDividido ??
        service.precioAdultoDividido,
      preserveGroupedTotal: true,
    });
    const nextSelection = nextTariff.passengerSelection || paxSel;
    const assignedPrecioAdultoDividido =
      service.assignedPrecioAdultoDividido ??
      assignedService.precioAdultoDividido ??
      service.precioAdultoDividido;
    const nextFlatPricing = buildAssignedFlatPricingState({
      tariff: nextTariff,
      passengerSelection: nextSelection,
      precioAdultoDividido: assignedPrecioAdultoDividido,
    });
    const updatedAssignedService = {
      ...assignedService,
      assignedPassengerSelection: nextSelection,
      passengerSelection: nextSelection,
      assignedPrecioAdultoDividido,
      assignedPrecioServicio: nextFlatPricing.assignedPrecioServicio,
      assignedPrecioTotal: nextFlatPricing.assignedPrecioTotal,
      assignedBeneficiariosAdultos:
        nextFlatPricing.assignedBeneficiariosAdultos,
      assignedBeneficiariosNinos: nextFlatPricing.assignedBeneficiariosNinos,
      tariff: {
        ...nextTariff,
      },
    };

    updatedItinerary[dayIndex].servicios[serviceIndex] = {
      ...service,
      assignedService: updatedAssignedService,
      assignedTariff: updatedAssignedService.tariff,
      assignedPassengerIds: assignedIds,
      assignedPassengerSelection: nextSelection,
      assignedPrecioAdultoDividido,
      ...nextFlatPricing,
      assignedChildExplicitPriceMap:
        nextSelection.assignedChildExplicitPriceMap || {},
      assignedChildExplicitPriceSum:
        nextSelection.assignedChildExplicitPriceSum || 0,
      assignedChildExplicitCount: nextSelection.assignedChildExplicitCount || 0,
      pricingMode: nextSelection.pricingMode || "percentage",
      uniformPercentage: nextSelection.uniformPercentage || "",
      childPercentageMap: nextSelection.childPercentageMap || {},
      treatChildrenAsAdults: nextSelection.treatChildrenAsAdults === true,
      convertedChildToAdultMap: nextSelection.convertedChildToAdultMap || {},
    };
    latestItinerary.current = updatedItinerary;
    void onChange(updatedItinerary);
  };

  const resolveConvertedChildPricingMode = (
    childPriceMap = {},
    childPercentageMap = {},
    uniformPercentage = "",
  ) => {
    if (Object.keys(childPriceMap).length > 0) {
      return "fixed";
    }

    const hasPercentageOverrides =
      Object.keys(childPercentageMap).length > 0 ||
      Number.parseFloat(uniformPercentage || 0) > 0;

    return hasPercentageOverrides ? "percentage" : "percentage";
  };

  const handleConvertChildToAdult = (
    dayIndex,
    serviceIndex,
    childIdToConvert,
  ) => {
    if (!childIdToConvert) return;

    const updatedItinerary = cloneReservationItinerary(latestItinerary.current);
    const service = updatedItinerary[dayIndex]?.servicios?.[serviceIndex];
    const assignedService = service?.assignedService
      ? { ...service.assignedService }
      : null;
    if (!service || !assignedService) return;

    const paxSel = {
      ...getAssignedPassengerSelectionForService(service),
    };
    const fallbackPassengerIds = getPassengerIdsByType(peopleDetails || {});
    const assignedIds =
      Array.isArray(service.assignedPassengerIds) &&
      service.assignedPassengerIds.length > 0
        ? service.assignedPassengerIds.filter(Boolean)
        : Array.isArray(paxSel.selectedIds) && paxSel.selectedIds.length > 0
          ? paxSel.selectedIds.filter(Boolean)
          : fallbackPassengerIds.allPassengerIds;

    if (!assignedIds.includes(childIdToConvert)) return;

    // Formato DaysEditor: convertedChildToAdultMap[childId] = true
    const nextConvertedMap = {
      ...(service.convertedChildToAdultMap ||
        paxSel.convertedChildToAdultMap ||
        {}),
      [childIdToConvert]: true,
    };

    // NO cambiar IDs - mantener assignedIds igual
    // Solo marcar el child como convertido en el map
    const newChildPriceMap = {
      ...(paxSel.assignedChildExplicitPriceMap || {}),
    };
    delete newChildPriceMap[childIdToConvert];

    const newChildPercentageMap = {
      ...(paxSel.childPercentageMap || {}),
    };
    delete newChildPercentageMap[childIdToConvert];
    const nextPricingMode = resolveConvertedChildPricingMode(
      newChildPriceMap,
      newChildPercentageMap,
      paxSel.uniformPercentage,
    );

    const updatedSelection = {
      ...paxSel,
      selectedIds: assignedIds, // Mantener los mismos IDs
      assignedPassengerCount: assignedIds.length,
      assignedChildExplicitCount: assignedIds.filter(
        (id) => typeof id === "string" && id.startsWith("child:") && !nextConvertedMap[id],
      ).length,
      assignedChildExplicitPriceMap: newChildPriceMap,
      assignedChildExplicitPriceSum: Object.values(newChildPriceMap).reduce(
        (sum, price) => sum + (parseFloat(price) || 0),
        0,
      ),
      pricingMode: nextPricingMode,
      childPercentageMap: newChildPercentageMap,
      treatChildrenAsAdults: false,
      convertedChildToAdultMap: nextConvertedMap,
    };

    const nextTariff = syncTariffWithReservationPricing({
      tariff: {
        ...assignedService.tariff,
        childExtrasTotal: updatedSelection.assignedChildExplicitPriceSum || 0,
      },
      serviceType:
        assignedService.parentService?.typeService ||
        assignedService.typeService ||
        service.parentService?.typeService ||
        service.typeService ||
        "otros",
      childService: assignedService.childService || {},
      passengerSelection: updatedSelection,
      unitPrice: parseFloat(assignedService.tariff?.precio || 0),
      fallbackTotal: totalPassengers,
      precioAdultoDividido:
        service.assignedPrecioAdultoDividido ??
        assignedService.precioAdultoDividido ??
        service.precioAdultoDividido,
      preserveGroupedTotal: true,
    });
    const nextSelection = nextTariff.passengerSelection || updatedSelection;
    const assignedPrecioAdultoDividido =
      service.assignedPrecioAdultoDividido ??
      assignedService.precioAdultoDividido ??
      service.precioAdultoDividido;
    const nextFlatPricing = buildAssignedFlatPricingState({
      tariff: nextTariff,
      passengerSelection: nextSelection,
      precioAdultoDividido: assignedPrecioAdultoDividido,
    });
    assignedService.assignedPassengerSelection = nextSelection;
    assignedService.passengerSelection = nextSelection;
    assignedService.convertedChildToAdultMap = nextConvertedMap;
    assignedService.assignedPrecioAdultoDividido = assignedPrecioAdultoDividido;
    assignedService.assignedPrecioServicio =
      nextFlatPricing.assignedPrecioServicio;
    assignedService.assignedPrecioTotal = nextFlatPricing.assignedPrecioTotal;
    assignedService.assignedBeneficiariosAdultos =
      nextFlatPricing.assignedBeneficiariosAdultos;
    assignedService.assignedBeneficiariosNinos =
      nextFlatPricing.assignedBeneficiariosNinos;
    assignedService.tariff = nextTariff;

    updatedItinerary[dayIndex].servicios[serviceIndex] = {
      ...service,
      assignedService,
      assignedTariff: assignedService.tariff,
      assignedPassengerIds: assignedIds, // Mantener los mismos IDs
      assignedPassengerSelection: nextSelection,
      assignedPrecioAdultoDividido,
      ...nextFlatPricing,
      assignedChildExplicitPriceMap:
        nextSelection.assignedChildExplicitPriceMap || {},
      assignedChildExplicitPriceSum:
        nextSelection.assignedChildExplicitPriceSum || 0,
      assignedChildExplicitCount: nextSelection.assignedChildExplicitCount || 0,
      pricingMode: nextSelection.pricingMode || "percentage",
      uniformPercentage: nextSelection.uniformPercentage || "",
      childPercentageMap: nextSelection.childPercentageMap || {},
      treatChildrenAsAdults: nextSelection.treatChildrenAsAdults === true,
      convertedChildToAdultMap: nextConvertedMap,
    };
    latestItinerary.current = updatedItinerary;
    void onChange(updatedItinerary);
  };

  const handleRevertAdultToChild = (
    dayIndex,
    serviceIndex,
    childIdToRevert, // Formato DaysEditor: es el childId que está marcado como true
  ) => {
    if (!childIdToRevert) return;

    const updatedItinerary = cloneReservationItinerary(latestItinerary.current);
    const service = updatedItinerary[dayIndex]?.servicios?.[serviceIndex];
    const assignedService = service?.assignedService
      ? { ...service.assignedService }
      : null;
    if (!service || !assignedService) return;

    const convertedMap = {
      ...(service.convertedChildToAdultMap ||
        assignedService.convertedChildToAdultMap ||
        getAssignedPassengerSelectionForService(service)
          .convertedChildToAdultMap ||
        {}),
    };

    // Formato DaysEditor: convertedMap[childId] = true
    if (!convertedMap[childIdToRevert]) return;
    delete convertedMap[childIdToRevert];

    const paxSel = {
      ...getAssignedPassengerSelectionForService(service),
    };
    const fallbackPassengerIds = getPassengerIdsByType(peopleDetails || {});
    const assignedIds =
      Array.isArray(service.assignedPassengerIds) &&
      service.assignedPassengerIds.length > 0
        ? service.assignedPassengerIds.filter(Boolean)
        : Array.isArray(paxSel.selectedIds) && paxSel.selectedIds.length > 0
          ? paxSel.selectedIds.filter(Boolean)
          : fallbackPassengerIds.allPassengerIds;

    // Mantener los IDs iguales - NO cambiar nada
    const adultPrice = parseFloat(assignedService.tariff?.precio || 0);
    const percentage = parseFloat(
      paxSel.childPercentageMap?.[childIdToRevert] ||
        paxSel.uniformPercentage ||
        0,
    );
    let restoredChildPrice = 0;
    if (paxSel.pricingMode === "adult") restoredChildPrice = adultPrice;
    else if (paxSel.pricingMode === "percentage" && percentage > 0) {
      restoredChildPrice = adultPrice * (percentage / 100);
    }

    const newChildPriceMap = {
      ...(paxSel.assignedChildExplicitPriceMap || {}),
      [childIdToRevert]: restoredChildPrice,
    };
    const nextPricingMode = resolveConvertedChildPricingMode(
      newChildPriceMap,
      paxSel.childPercentageMap || {},
      paxSel.uniformPercentage,
    );

    const updatedSelection = {
      ...paxSel,
      selectedIds: assignedIds, // Mantener los mismos IDs
      assignedPassengerCount: assignedIds.length,
      assignedChildExplicitCount: assignedIds.filter(
        (id) => typeof id === "string" && id.startsWith("child:") && !convertedMap[id],
      ).length,
      assignedChildExplicitPriceMap: newChildPriceMap,
      assignedChildExplicitPriceSum: Object.values(newChildPriceMap).reduce(
        (sum, price) => sum + (parseFloat(price) || 0),
        0,
      ),
      pricingMode: nextPricingMode,
      treatChildrenAsAdults: false,
      convertedChildToAdultMap: convertedMap,
    };

    const nextTariff = syncTariffWithReservationPricing({
      tariff: {
        ...assignedService.tariff,
        childExtrasTotal: updatedSelection.assignedChildExplicitPriceSum || 0,
      },
      serviceType:
        assignedService.parentService?.typeService ||
        assignedService.typeService ||
        service.parentService?.typeService ||
        service.typeService ||
        "otros",
      childService: assignedService.childService || {},
      passengerSelection: updatedSelection,
      unitPrice: adultPrice,
      fallbackTotal: totalPassengers,
      precioAdultoDividido:
        service.assignedPrecioAdultoDividido ??
        assignedService.precioAdultoDividido ??
        service.precioAdultoDividido,
      preserveGroupedTotal: true,
    });

    // Direct recalculation for divided-pricing services (mirrors DaysEditor)
    const assignedPrecioAdultoDividido =
      service.assignedPrecioAdultoDividido ??
      assignedService.precioAdultoDividido ??
      service.precioAdultoDividido;
    if (assignedPrecioAdultoDividido) {
      const basePricePost = parseFloat(nextTariff.precio_original || 0);
      if (basePricePost > 0) {
        const newAdultCount = assignedIds.filter(
          (id) => typeof id === "string" && (id.startsWith("adult:") || (id.startsWith("child:") && convertedMap[id])),
        ).length;
        const safeDivisor = Math.max(1, newAdultCount);
        nextTariff.precio =
          Math.round((basePricePost / safeDivisor) * 100) / 100;
        nextTariff.precio_original_with_child_extras =
          Math.round(
            (basePricePost + (nextTariff.childExtrasTotal || 0)) * 100,
          ) / 100;
      }
    }

    const nextSelection = nextTariff.passengerSelection || updatedSelection;
    const nextFlatPricing = buildAssignedFlatPricingState({
      tariff: nextTariff,
      passengerSelection: nextSelection,
      precioAdultoDividido: assignedPrecioAdultoDividido,
    });
    assignedService.assignedPassengerSelection = nextSelection;
    assignedService.passengerSelection = nextSelection;
    assignedService.convertedChildToAdultMap = convertedMap;
    assignedService.assignedPrecioAdultoDividido = assignedPrecioAdultoDividido;
    assignedService.assignedPrecioServicio =
      nextFlatPricing.assignedPrecioServicio;
    assignedService.assignedPrecioTotal = nextFlatPricing.assignedPrecioTotal;
    assignedService.assignedBeneficiariosAdultos =
      nextFlatPricing.assignedBeneficiariosAdultos;
    assignedService.assignedBeneficiariosNinos =
      nextFlatPricing.assignedBeneficiariosNinos;
    assignedService.tariff = nextTariff;

    updatedItinerary[dayIndex].servicios[serviceIndex] = {
      ...service,
      assignedService,
      assignedTariff: assignedService.tariff,
      assignedPassengerIds: assignedIds, // Mantener los mismos IDs
      assignedPassengerSelection: nextSelection,
      assignedPrecioAdultoDividido,
      ...nextFlatPricing,
      assignedChildExplicitPriceMap:
        nextSelection.assignedChildExplicitPriceMap || {},
      assignedChildExplicitPriceSum:
        nextSelection.assignedChildExplicitPriceSum || 0,
      assignedChildExplicitCount: nextSelection.assignedChildExplicitCount || 0,
      pricingMode: nextSelection.pricingMode || "percentage",
      uniformPercentage: nextSelection.uniformPercentage || "",
      childPercentageMap: nextSelection.childPercentageMap || {},
      treatChildrenAsAdults: nextSelection.treatChildrenAsAdults === true,
      convertedChildToAdultMap: convertedMap,
    };
    latestItinerary.current = updatedItinerary;
    void onChange(updatedItinerary);
  };

  const preventWheelChange = (e) => e.target.blur();
  const preventArrowChange = (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
  };

  // -- Payment deadline --
  const togglePaymentDeadlineEdit = (dayIndex, serviceIndex) => {
    if (
      editingPaymentDeadline.dayIndex === dayIndex &&
      editingPaymentDeadline.serviceIndex === serviceIndex
    ) {
      setEditingPaymentDeadline({
        dayIndex: null,
        serviceIndex: null,
        value: "",
      });
    } else {
      const service = voucherItinerary[dayIndex].servicios[serviceIndex];
      const currentDeadline =
        service.assignedService?.payment_deadline ||
        service.payment_deadline ||
        service.paymentRequest?.payment_deadline ||
        "";
      setEditingPaymentDeadline({
        dayIndex,
        serviceIndex,
        value: currentDeadline,
      });
    }
  };

  const handlePaymentDeadlineChange = (e) => {
    setEditingPaymentDeadline((prev) => ({ ...prev, value: e.target.value }));
  };

  const applyPaymentDeadline = () => {
    const { dayIndex, serviceIndex, value } = editingPaymentDeadline;
    if (!value) return;
    const updatedItinerary = cloneReservationItinerary(latestItinerary.current);
    const service = updatedItinerary[dayIndex].servicios[serviceIndex];
    if (service.isCustomService) {
      service.payment_deadline = value;
    } else if (service.assignedService) {
      service.assignedService = {
        ...service.assignedService,
        payment_deadline: value,
      };
    }
    updatedItinerary[dayIndex].servicios[serviceIndex] = service;
    latestItinerary.current = updatedItinerary;
    void onChange(updatedItinerary);
    setEditingPaymentDeadline({
      dayIndex: null,
      serviceIndex: null,
      value: "",
    });
  };

  // -- Service time --
  const handleServiceTimeChange = (dayIndex, serviceIndex, newTime) => {
    const updatedItinerary = cloneReservationItinerary(latestItinerary.current);
    const service = updatedItinerary[dayIndex].servicios[serviceIndex];
    if (service.isCustomService) {
      service.hora = newTime;
    } else if (service.assignedService) {
      service.assignedService = { ...service.assignedService, hora: newTime };
    }
    updatedItinerary[dayIndex].servicios[serviceIndex] = service;
    latestItinerary.current = updatedItinerary;
    void onChange(updatedItinerary);
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  const editorActionButtons = (
    <div className="editor-header-actions">
      <QuotationVersionHistory
        voucher={versionVoucher}
        variant="header"
        label="Versiones de la venta"
      />
    </div>
  );
  return (
    <div className="reserva-service-editor">
      {/* Header */}
      {showHeader ? (
        <div className="editor-header">
          <div className="editor-header-copy">
            <h3>Validación de servicios cotizados</h3>
            <p className="editor-description">
              Confirma cada servicio vendido. Venso conserva el mismo servicio y
              aplica automáticamente su tarifa interna cuando existe.
            </p>
          </div>
          {editorActionButtons}
        </div>
      ) : (
        headerActionsTarget &&
        ReactDOM.createPortal(editorActionButtons, headerActionsTarget)
      )}

      {voucherItinerary.length === 0 ? (
        <div className="empty-state">
          <MdWarning size={48} />
          <p>No hay itinerario disponible</p>
        </div>
      ) : (
        <div className="days-list">
          {voucherItinerary.map((day, dayIndex) => (
            <div key={`day-${dayIndex}`} className="day-container">
              {/* Day header */}
              <div className="day-header">
                <div className="day-info">
                  <h4>Dia {day.numero}</h4>
                  <span className="day-title">
                    {day.titulo || "Sin titulo"}
                  </span>
                  {fechaInicio && (
                    <span className="day-date">
                      {formatDate(calculateDayDate(fechaInicio, dayIndex))}
                    </span>
                  )}
                </div>
                {day.ciudades && day.ciudades.length > 0 && (
                  <div className="day-ciudades">
                    <FaMapMarkerAlt />
                    {day.ciudades.map((ciudad, idx) => (
                      <span key={idx} className="ciudad-tag">
                        {ciudad}
                      </span>
                    ))}
                  </div>
                )}
                <div className="day-status">
                  {day.servicios?.filter((s) => s.isAssigned).length || 0} /{" "}
                  {day.servicios?.length || 0} validados
                </div>
              </div>

              <div className="day-content">
                <div className="unified-services-list">
                  {day.servicios && day.servicios.length > 0 ? (
                    groupReservationTicketRows(
                      day.servicios,
                      cotizacionItinerary[dayIndex]?.servicios || [],
                    ).map((row) => {
                      const renderRow = ({ service, serviceIndex, cotService }) => (
                        <UnifiedServiceRow
                          key={`row-${serviceIndex}`}
                          service={service}
                          serviceIndex={serviceIndex}
                          dayIndex={dayIndex}
                          cotService={cotService}
                          editingPrice={editingPrice}
                          onTogglePriceAdjustment={togglePriceAdjustment}
                          onAdjustmentValueChange={handleAdjustmentValueChange}
                          onApplyAdjustment={applyAdjustment}
                          preventWheelChange={preventWheelChange}
                          preventArrowChange={preventArrowChange}
                          onUpdateChildPrice={handleUpdateChildPrice}
                          onConvertChildToAdult={handleConvertChildToAdult}
                          onRevertAdultToChild={handleRevertAdultToChild}
                          onAssignedBeneficiariesChange={
                            handleAssignedBeneficiariesChange
                          }
                          onServiceTimeChange={handleServiceTimeChange}
                          onValidateService={handleValidateQuotedService}
                          isValidating={validatingServiceId === service.servicioId}
                          validationBusy={validatingServiceId !== null}
                          onRemoveAssignment={handleRemoveAssignment}
                          editingPaymentDeadline={editingPaymentDeadline}
                          onPaymentDeadlineChange={handlePaymentDeadlineChange}
                          onApplyPaymentDeadline={applyPaymentDeadline}
                          onTogglePaymentDeadlineEdit={togglePaymentDeadlineEdit}
                          peopleDetails={peopleDetails}
                          onOpenReservationRequest={({ service }) =>
                            onOpenReservationRequest?.({
                              dayIndex,
                              serviceIndex,
                              service,
                              cotService,
                            })
                          }
                        />
                      );

                      if (row.type === "ticketGroup") {
                        return (
                          <div key={`ticket-group-${row.key}`} className="reservation-ticket-group">
                            <div className="reservation-ticket-group__header">
                              <span>Tickets</span>
                              <strong>{row.entrada}</strong>
                              <small>{row.items.length} tarifa(s)</small>
                            </div>
                            {row.items.map(renderRow)}
                          </div>
                        );
                      }

                      return renderRow(row);
                    })
                  ) : (
                    <p className="no-services">No hay servicios en este dia</p>
                  )}
                </div>
                <div className="day-total">
                  <span className="total-label">Total validado:</span>
                  <span className="total-value">
                    {formatCurrency(calculateDayTotal(day.servicios))}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="reservation-validation-note">
        <MdCheck />
        <span>Los servicios se validan contra la misma cotización; no se reemplazan por otro proveedor.</span>
      </div>

    </div>
  );
};

export default ReservaServiceEditor;
