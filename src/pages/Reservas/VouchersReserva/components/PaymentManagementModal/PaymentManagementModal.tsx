import React, { useState, useEffect, useCallback, useMemo } from "react";
import Modal from "../../../../../components/UI/Modal/Modal";
import PaymentVoucherModal from "../PaymentVoucherModal/PaymentVoucherModal";
import MovimientoPreviewModal from "../../../../../components/Contabilidad/MovimientoPreviewModal";
import { invalidateReservaAssignmentGraphCache } from "../../../../../utils/cacheInvalidation";
import {
  MdPayment,
  MdCheck,
  MdCheckCircle,
  MdWarning,
  MdClose,
  MdAttachMoney,
  MdCalendarToday,
  MdVisibility,
  MdCancel,
  MdSchedule,
  MdFlightTakeoff,
  MdConfirmationNumber,
} from "react-icons/md";
import { paymentRequestService } from "../../../../../services/paymentRequestService";
import { voucherReservaService } from "../../../../../services/voucherReservaService";
import pasajeroService from "../../../../../services/pasajeroService";
import movimientoService from "../../../../../services/movimientoService";
import MovimientoForm from "../../../../../components/Contabilidad/MovimientoForm";
import FlightPaymentModal from "../../../../Ventas/VouchersVenta/components/FlightPaymentModal/FlightPaymentModal";
import { toast } from "react-toastify";
import {
  getAssignedChildService,
  getAssignedParentService,
  getAssignedTariff,
  hasAssignedService,
  resolveServiceType,
} from "../../utils/serviceAssignment";
import {
  getSpecializedPaymentGroups,
  getSpecializedServiceType,
} from "../../utils/specializedPaymentGroups";
import {
  normalizePaymentItinerary,
  enrichPaymentItinerary,
  getAssignedPaymentAmount,
  getAssignedTicketQuantity,
  getPaymentServiceId,
  getOperationalPaymentRequest,
  canRequestReservationPayment,
  buildReservationPaymentCandidates,
} from "../../utils/reservationPaymentManagement";
import TicketChargeSummary from "./TicketChargeSummary";
import PaymentBatchBar from "./PaymentBatchBar";
import "./PaymentManagementModal.scss";

const normalizeItinerary = normalizePaymentItinerary;

const generatePaymentDescription = (serviceData, voucherCode) => {
  // Si no hay service_data, usar el formato antiguo
  if (!serviceData) {
    return `Pago de servicio del file ${voucherCode || "Sin código"}`;
  }

  const parentService = serviceData.parentService || {};
  const childService = serviceData.childService || {};
  const typeService = String(
    serviceData.typeService || parentService.typeService || "",
  ).toLowerCase();

  // Obtener el nombre del servicio según el tipo
  const nombreServicio =
    parentService.nombre_empresa ||
    parentService.nombreEmpresa ||
    parentService.nombre ||
    parentService.tour_nombre ||
    parentService.tourNombre ||
    parentService.nombre_transporte ||
    parentService.nombreTransporte ||
    parentService.nombre_agencia ||
    parentService.nombreAgencia ||
    childService.ticket?.entrada ||
    childService.servicio_extra?.nombre ||
    childService.nombre ||
    "";

  // Mapear typeService a texto legible
  const tipoServicios = {
    trenes: "tren",
    tren: "tren",
    hoteles: "hotel",
    hotel: "hotel",
    restaurantes: "restaurante",
    restaurante: "restaurante",
    tours: "tour",
    tour: "tour",
    rutas: "tour",
    ruta: "tour",
    endoses: "endose",
    endose: "endose",
    vuelos: "vuelo",
    vuelo: "vuelo",
    transporte: "transporte",
    transportes: "transporte",
    guias: "guía",
    guia: "guía",
    entradas: "entrada",
    entrada: "entrada",
    tickets: "ticket",
    ticket: "ticket",
    paquetes: "paquete turístico",
    paquete: "paquete turístico",
    actividades: "actividad",
    actividad: "actividad",
    seguros: "seguro",
    seguro: "seguro",
    cruceros: "crucero",
    crucero: "crucero",
    movilidades: "movilidad",
    movilidad: "movilidad",
    extras: "servicio extra",
    extra: "servicio extra",
    otros: "servicio",
    otro: "servicio",
  };

  const tipoLegible = tipoServicios[typeService] || typeService || "servicio";

  if (nombreServicio) {
    return `Pago de ${tipoLegible} - ${nombreServicio}`;
  } else {
    return `Pago de ${tipoLegible} (file ${voucherCode || "Sin código"})`;
  }
};

const normalizeDirectPaymentType = (typeService = "") => {
  const normalized = String(typeService || "")
    .trim()
    .toLowerCase();

  if (["tren", "trenes"].includes(normalized)) return "trenes";
  if (["ticket", "tickets", "entrada", "entradas"].includes(normalized)) {
    return "tickets";
  }
  if (["endose", "endoses"].includes(normalized)) return "endoses";

  return normalized;
};

const normalizeMatchingValue = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
};

const collectMatchingValues = (value) => {
  if (Array.isArray(value)) {
    return value.map(normalizeMatchingValue).filter(Boolean);
  }

  const normalized = normalizeMatchingValue(value);
  return normalized ? [normalized] : [];
};

const PaymentManagementModal = ({
  isOpen,
  onClose,
  voucherReserva,
  onPaymentCompleted,
}) => {
  const [assignedItinerary, setAssignedItinerary] = useState([]);
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [principalPax, setPrincipalPax] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paymentLoadError, setPaymentLoadError] = useState(false);
  const [refreshingPayments, setRefreshingPayments] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentRequest, setSelectedPaymentRequest] = useState(null);
  const [specializedPaymentType, setSpecializedPaymentType] = useState<string | null>(null);
  const initialLoadDone = React.useRef(false);

  // Estado para solicitud individual o por lote
  const [showPaymentVoucherModal, setShowPaymentVoucherModal] = useState(false);
  const [requestModalItems, setRequestModalItems] = useState([]);
  const [selectedServiceKeys, setSelectedServiceKeys] = useState(
    () => new Set(),
  );

  // Estados para MovimientoPreviewModal
  const [showMovimientoPreview, setShowMovimientoPreview] = useState(false);
  const [selectedMovimiento, setSelectedMovimiento] = useState(null);
  const [selectedPreviewPaymentRequest, setSelectedPreviewPaymentRequest] =
    useState(null);
  const [loadingMovimiento, setLoadingMovimiento] = useState(false);

  const handleCloseMovimientoPreview = useCallback(() => {
    setShowMovimientoPreview(false);
    setSelectedMovimiento(null);
    setSelectedPreviewPaymentRequest(null);
  }, []);

  // Inline cancel confirmation: stores the payment_request.id being confirmed
  const [confirmingCancelId, setConfirmingCancelId] = useState(null);
  const [cancellingPaymentId, setCancellingPaymentId] = useState(null);
  const cancelTimerRef = React.useRef(null);
  const loadVoucherDataRef = React.useRef(null);

  // Cargar datos del voucher de reserva
  useEffect(() => {
    if (isOpen && voucherReserva?.id) {
      loadVoucherData();
    }
    if (!isOpen) {
      initialLoadDone.current = false;
      setLoading(true);
      setSelectedServiceKeys(new Set());
    }
  }, [isOpen, voucherReserva]);

  // Keep ref in sync so event handlers always invoke latest loadVoucherData
  useEffect(() => {
    loadVoucherDataRef.current = loadVoucherData;
  });

  // Suscribirse a eventos de payment requests para actualización reactiva
  useEffect(() => {
    if (!isOpen) return;

    const handlePaymentRequestUpdate = (event) => {
      const voucherReservaId = normalizeMatchingValue(
        voucherReserva?.id ||
          voucherReserva?.reservationVoucher?.id ||
          voucherReserva?.voucher_reserva_id,
      );
      const voucherCodes = new Set(
        [
          voucherReserva?.voucher_code,
          voucherReserva?.voucherCode,
          voucherReserva?.voucher_code_venta,
          voucherReserva?.reservationVoucher?.voucher_code,
          voucherReserva?.reservationVoucher?.voucherCode,
        ]
          .map(normalizeMatchingValue)
          .filter(Boolean),
      );

      const eventVoucherIds = [
        ...collectMatchingValues(event.detail?.voucher_reserva_id),
        ...collectMatchingValues(event.detail?.voucherReservaId),
        ...collectMatchingValues(event.detail?.voucher_reserva_ids),
        ...collectMatchingValues(event.detail?.voucherReservaIds),
      ];
      const eventVoucherCodes = [
        ...collectMatchingValues(event.detail?.voucher_code),
        ...collectMatchingValues(event.detail?.voucherCode),
        ...collectMatchingValues(event.detail?.voucher_codes),
        ...collectMatchingValues(event.detail?.voucherCodes),
      ];

      const isForThisVoucher =
        (!!voucherReservaId && eventVoucherIds.includes(voucherReservaId)) ||
        eventVoucherCodes.some((code) => voucherCodes.has(code));

      if (isForThisVoucher) {
        invalidateReservaAssignmentGraphCache();
        setRefreshingPayments(true);
        // Direct invocation to bypass useEffect dependency chain without
        // reopening or showing the initial full-screen loader.
        setTimeout(() => loadVoucherDataRef.current?.(), 150);
      }
    };

    // Escuchar eventos de payment requests (creación, completado, pagado, cancelado)
    // + movimientoCreated como señal amplia de que datos contables cambiaron
    const events = [
      "paymentRequestCreated",
      "paymentRequestCompleted",
      "paymentRequestPaid",
      "paymentRequestCancelled",
      "movimientoCreated",
      "reservationAssignmentsSaved",
    ];
    events.forEach((evt) =>
      window.addEventListener(evt, handlePaymentRequestUpdate),
    );

    return () => {
      events.forEach((evt) =>
        window.removeEventListener(evt, handlePaymentRequestUpdate),
      );
    };
  }, [isOpen, voucherReserva]);

  useEffect(() => {
    return () => {
      if (cancelTimerRef.current) {
        clearTimeout(cancelTimerRef.current);
      }
    };
  }, []);

  const loadVoucherData = async () => {
    setRefreshingPayments(true);
    setPaymentLoadError(false);
    try {
      // Only show full loading spinner on initial load, not on refreshes
      if (!initialLoadDone.current) {
        setLoading(true);
      }

      const voucherVentaId =
        voucherReserva.voucherId || voucherReserva.voucher_id || voucherReserva.voucher_venta_id;
      const voucherReservaId =
        voucherReserva.reservationVoucher?.id ||
        voucherReserva.id ||
        voucherReserva.voucher_reserva_id;

      let itinerary = [];

      // PRIMARIO: Cargar desde tablas normalizadas (misma fuente que ServiceAssignmentModal)
      if (voucherVentaId) {
        try {
          const normalizedItinerary =
            await voucherReservaService.getItinerarioByVoucherVenta(
              voucherVentaId,
              { skipCache: true },
            );
          if (
            Array.isArray(normalizedItinerary) &&
            normalizedItinerary.length > 0
          ) {
            itinerary = normalizeItinerary(normalizedItinerary);
          }
        } catch (normalizedError) {
          console.warn(
            "Error cargando itinerario normalizado:",
            normalizedError,
          );
        }
      }

      // FALLBACK 1: Cargar desde getVoucherReservaWithRelationsById (JSONB blob)
      if (itinerary.length === 0 && voucherReservaId) {
        try {
          const response =
            await voucherReservaService.getVoucherReservaWithRelationsById(
              voucherReservaId, { skipCache: true },
            );
          const freshData = response?.data;
          if (freshData?.assigned_itinerary || freshData?.assignedItinerary) {
            itinerary = normalizeItinerary(
              freshData.assigned_itinerary || freshData.assignedItinerary,
            );
          }
        } catch (fallbackError) {
          console.warn("Error en fallback con relations:", fallbackError);
        }
      }

      // FALLBACK 2: Datos del prop
      if (itinerary.length === 0) {
        const raw =
          voucherReserva.assignedItinerary ||
          voucherReserva.assigned_itinerary ||
          voucherReserva.reservationVoucher?.assignedItinerary ||
          voucherReserva.reservationVoucher?.assigned_itinerary ||
          [];
        itinerary = normalizeItinerary(raw);
      }

      // Don't set itinerary yet — wait until enrichment with payment requests is done
      // to avoid a flash from "Sin solicitud" → "Pendiente" during re-renders

      // El documento de cobranza de entradas se emite siempre a nombre del PAX principal.
      // Preferimos la marca explícita y, para vouchers históricos, usamos el primer pasajero.
      if (voucherReservaId) {
        try {
          const pax = await pasajeroService.getPassengersByVoucherReserva(voucherReservaId);
          const paxList = Array.isArray(pax) ? pax : pax?.data || [];
          const principal =
            paxList.find((item) =>
              Boolean(item?.es_principal || item?.is_main || item?.principal || item?.isPrincipal),
            ) || paxList[0] || null;
          setPrincipalPax(principal);
        } catch (paxError) {
          console.warn("No se pudo resolver el PAX principal del voucher:", paxError);
          setPrincipalPax(null);
        }
      }

      // Cargar payment requests y enriquecer el itinerario
      if (voucherReservaId && itinerary.length > 0) {
        try {
          const allRequests =
            await voucherReservaService.getPaymentRequestsByVoucherReservaId(
              voucherReservaId, { skipCache: true },
            );
          if (Array.isArray(allRequests) && allRequests.length > 0) {
            // Only match active (non-cancelled) payment requests to services
            const activeRequests = allRequests.filter(pr => getOperationalPaymentRequest({ paymentRequest: pr }));
            // Merge payment requests into itinerary services by itinerario_servicio_id
            const enriched = enrichPaymentItinerary(itinerary, activeRequests);
            setAssignedItinerary(enriched);
            setPaymentRequests(activeRequests);
          } else {
            setAssignedItinerary(enrichPaymentItinerary(itinerary, []));
            setPaymentRequests([]);
          }
        } catch (prError) {
          console.warn("Error cargando payment requests:", prError);
          setPaymentLoadError(true);
          setAssignedItinerary(itinerary);
          setPaymentRequests([]);
        }
      } else {
        setAssignedItinerary(itinerary);
        setPaymentRequests([]);
      }
    } catch (error) {
      console.error("Error cargando datos del voucher:", error);
      setPaymentLoadError(true);
      toast.error("Error al cargar los datos del voucher");
    } finally {
      setLoading(false);
      setRefreshingPayments(false);
      initialLoadDone.current = true;
    }
  };

  // Contar pagos pendientes
  const getPendingPaymentsCount = useCallback(() => {
    let count = 0;
    assignedItinerary.forEach((day) => {
      day.servicios?.forEach((service) => {
        if (
          service.isAssigned &&
          service.paymentRequest?.status === "pending"
        ) {
          count++;
        }
      });
    });
    return count;
  }, [assignedItinerary]);

  const getCompletedPaymentsCount = useCallback(() => {
    let count = 0;
    assignedItinerary.forEach((day) => {
      day.servicios?.forEach((service) => {
        if (service.isAssigned && service.paymentRequest?.status === "paid") {
          count++;
        }
      });
    });
    return count;
  }, [assignedItinerary]);

  const getTotalAssignedCount = useCallback(() => {
    let count = 0;
    assignedItinerary.forEach((day) => {
      day.servicios?.forEach((service) => {
        if (hasAssignedService(service)) {
          count++;
        }
      });
    });
    return count;
  }, [assignedItinerary]);

  // Helper: build a service object compatible with ServiceDetailedInfo
  // which expects { parentService, childService, tariff, typeService }
  const buildServiceDetailObj = useCallback((service) => {
    return {
      parentService: getAssignedParentService(service),
      childService: getAssignedChildService(service),
      tariff: getAssignedTariff(service),
      typeService: resolveServiceType(service),
    };
  }, []);

  // Helper: get service display name
  const getServiceDisplayName = useCallback((service) => {
    const parent = getAssignedParentService(service);
    const child = getAssignedChildService(service);
    const typeService = normalizeDirectPaymentType(resolveServiceType(service));
    if (!parent && !child) return resolveServiceType(service) || "Servicio";

    if (typeService === "endoses") {
      return (
        parent?.nombre_agencia ||
        parent?.nombreAgencia ||
        parent?.nombre ||
        "Agencia sin nombre"
      );
    }

    return (
      parent?.nombre ||
      parent?.nombre_empresa ||
      parent?.nombreEmpresa ||
      parent?.tour_nombre ||
      parent?.tourNombre ||
      parent?.nombre_transporte ||
      parent?.nombreTransporte ||
      child?.ticket?.entrada ||
      child?.servicio_extra?.nombre ||
      child?.nombre ||
      resolveServiceType(service) ||
      "Servicio"
    );
  }, []);

  const getServiceDisplayDetail = useCallback((service) => {
    const typeService = normalizeDirectPaymentType(resolveServiceType(service));
    if (typeService !== "endoses") return "";

    const parent = getAssignedParentService(service) || {};
    const child = getAssignedChildService(service) || {};
    const tour = child.tour || child;
    const details = [
      parent.tipo_tour ? `Tour: ${parent.tipo_tour}` : null,
      tour.tipo_guiado ? `Guiado: ${tour.tipo_guiado}` : null,
      tour.idioma
        ? `Idioma: ${
            Array.isArray(tour.idioma)
              ? tour.idioma.join(", ")
              : tour.idioma
          }`
        : null,
    ].filter(Boolean);

    return details.join(" · ");
  }, []);

  // Map typeService to readable label
  const getServiceTypeLabel = useCallback((typeService) => {
    const normalizedType = normalizeDirectPaymentType(typeService);
    const map = {
      hoteles: "Hotel",
      trenes: "Tren",
      transportes: "Transporte",
      vuelos: "Vuelo",
      restaurantes: "Restaurante",
      tickets: "Ticket",
      extras: "Extra",
      guias: "Guia",
      endoses: "Endose",
      rutas: "Ruta",
      tours: "Tour",
    };
    return map[normalizedType] || typeService || "Servicio";
  }, []);

  // Obtener payment request de un servicio específico
  const getServicePaymentRequest = useCallback((service) => {
    return getOperationalPaymentRequest(service);
  }, []);

  const formatPaymentCurrency = useCallback((amount) => {
    const numericAmount = parseFloat(amount || 0);
    return `$ ${Number.isFinite(numericAmount) ? numericAmount.toFixed(2) : "0.00"}`;
  }, []);

  // Verificar si un servicio es pagable (TODOS los servicios asignados)
  const isServicePayableByReservas = useCallback((service) => {
    return hasAssignedService(service);
  }, []);

  const linkedPaymentFallbackItinerary = useMemo(
    () => voucherReserva?.linkedPaymentItinerary || voucherReserva?.linked_payment_itinerary || [],
    [voucherReserva?.linkedPaymentItinerary, voucherReserva?.linked_payment_itinerary],
  );

  const getSpecializedGroupsForType = useCallback((type) => {
    const operational = getSpecializedPaymentGroups(assignedItinerary, type);
    const fallback = getSpecializedPaymentGroups(linkedPaymentFallbackItinerary, type);
    const count = (groups) => groups.reduce((total, group) => total + (group?.services?.length || 0), 0);
    return count(fallback) > count(operational) ? fallback : operational;
  }, [assignedItinerary, linkedPaymentFallbackItinerary]);

  const specializedFlightGroups = useMemo(
    () => getSpecializedGroupsForType("vuelos"),
    [getSpecializedGroupsForType],
  );
  const specializedTicketGroups = useMemo(
    () => getSpecializedGroupsForType("tickets"),
    [getSpecializedGroupsForType],
  );
  const voucherVentaId = voucherReserva?.voucher_venta_id || voucherReserva?.voucher_id || voucherReserva?.voucherId || null;
  const specializedCotizacionData = voucherReserva?.cotizacionData || voucherReserva?.cotizacion_data || {};
  const specializedPassengerData = voucherReserva?.passengerData || voucherReserva?.passenger_data || specializedCotizacionData?.peopleDetails || specializedCotizacionData?.peopledetails || {};

  // Solo trenes usan el egreso directo estándar; vuelos y entradas tienen conciliación propia.
  const canPayDirectlyByReservas = useCallback((service) => {
    const typeService = normalizeDirectPaymentType(resolveServiceType(service));

    if (typeService === "trenes") {
      // Los trenes requieren un parentService (empresa de tren) asignado.
      return !!getAssignedParentService(service);
    }

    return false;
  }, []);

  const getDirectPaymentAmount = useCallback((service) => {
    return getAssignedPaymentAmount(service);
  }, []);

  const getServiceSelectionKey = useCallback((service) => {
    const serviceId = getPaymentServiceId(service);
    return serviceId ? String(serviceId) : null;
  }, []);

  const batchCandidates = useMemo(() => paymentLoadError ? [] : buildReservationPaymentCandidates(assignedItinerary), [assignedItinerary, paymentLoadError]);

  const batchCandidateKeySignature = batchCandidates
    .map((candidate) => candidate.key)
    .join("|");

  useEffect(() => {
    const validKeys = new Set(batchCandidates.map((candidate) => candidate.key));
    setSelectedServiceKeys((current) => {
      const next = new Set(
        [...current].filter((serviceKey) => validKeys.has(serviceKey)),
      );
      if (
        next.size === current.size &&
        [...next].every((serviceKey) => current.has(serviceKey))
      ) {
        return current;
      }
      return next;
    });
  }, [batchCandidateKeySignature]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedBatchItems = useMemo(
    () =>
      batchCandidates.filter((candidate) =>
        selectedServiceKeys.has(candidate.key),
      ),
    [batchCandidates, selectedServiceKeys],
  );

  const selectedBatchTotal = useMemo(
    () =>
      selectedBatchItems.reduce(
        (total, candidate) => total + Math.round(candidate.amount * 100),
        0,
      ) / 100,
    [selectedBatchItems],
  );

  const ticketChargeSummary = useMemo(() => {
    const lines = [];
    assignedItinerary.forEach((day) => {
      (day.servicios || []).forEach((service) => {
        if (normalizeDirectPaymentType(resolveServiceType(service)) !== "tickets") return;
        if (!hasAssignedService(service)) return;

        const tariff = getAssignedTariff(service) || {};
        const child = getAssignedChildService(service) || {};
        const quantity = getAssignedTicketQuantity(service);
        const total = getDirectPaymentAmount(service);
        const unit = Number(
          service?.assignedPrecioServicio ?? tariff?.precio ??
            (quantity > 0 ? total / quantity : 0) ??
            0,
        );
        const ticket = child?.ticket || child?.tickets || child;
        const variant = [ticket?.procedencia, ticket?.tipo_usuario].filter(Boolean).join(" ");
        lines.push({
          id: getServiceSelectionKey(service) || `${day.numero}-${lines.length}`,
          quantity,
          description: `${ticket?.entrada || child?.entrada || "ENTRADA"}${variant ? ` ${variant}` : ""}`,
          unit,
          total,
        });
      });
    });

    const total = lines.reduce((sum, line) => sum + Number(line.total || 0), 0);
    const paxName = [
      principalPax?.nombres || principalPax?.nombre,
      principalPax?.apellidos || principalPax?.apellido,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
    return {
      lines,
      total,
      paxName: paxName || voucherReserva?.pax_principal || voucherReserva?.nombre_pasajero || "PAX PRINCIPAL",
      agencyName:
        voucherReserva?.agency_name ||
        voucherReserva?.agencia ||
        voucherReserva?.agency?.name ||
        "VENSO TOURS",
    };
  }, [assignedItinerary, getDirectPaymentAmount, getServiceSelectionKey, principalPax, voucherReserva]);

  const buildDirectPaymentServiceData = useCallback((service) => {
    return {
      parentService: getAssignedParentService(service),
      childService: getAssignedChildService(service),
      tariff: getAssignedTariff(service),
      typeService: normalizeDirectPaymentType(resolveServiceType(service)),
      payment_deadline:
        service?.payment_deadline ||
        service?.assignedService?.payment_deadline ||
        null,
    };
  }, []);

  // Handler para pago directo por reservas (similar a PendingPaymentsModal)
  const handlePayDirectly = async (service, paymentRequest, dayIndex, serviceIndex) => {
    let requestForPayment = paymentRequest;

    if (!requestForPayment) {
      const servicioId =
        service?.servicioId ||
        service?.itinerario_servicio_id ||
        service?.assignedService?.servicioId ||
        service?.assignedService?.itinerario_servicio_id ||
        null;
      const amount = getDirectPaymentAmount(service);

      if (!servicioId) {
        toast.error("No se encontró el servicio de itinerario para pagar");
        return;
      }
      if (!amount || amount <= 0) {
        toast.error("El monto debe ser mayor a 0");
        return;
      }

      try {
        const response = await voucherReservaService.requestPayment({
          voucher_reserva_id: voucherReserva.id,
          voucher_reserva_code: voucherReserva.voucher_code,
          itinerario_servicio_id: servicioId,
          amount,
          currency: "USD",
          moneda: "dolares",
          observaciones: null,
          service_data: buildDirectPaymentServiceData(service),
          payment_deadline: null,
        });

        requestForPayment =
          response?.data?.payment_request ||
          response?.data ||
          response?.payment_request ||
          response;

        if (!requestForPayment?.id) {
          const refreshed = await voucherReservaService.getPaymentRequest(
            voucherReserva.id,
            servicioId,
          );
          requestForPayment = refreshed?.data || refreshed?.payment_request || null;
        }

        window.dispatchEvent(
          new CustomEvent("paymentRequestCreated", {
            detail: { voucherReservaId: voucherReserva.id, dayIndex, serviceIndex },
          }),
        );
      } catch (error) {
        console.error("Error creando solicitud para pago directo:", error);
        toast.error("No se pudo preparar el pago directo");
        return;
      }
    }

    if (!requestForPayment?.id) {
      toast.error("No hay solicitud de pago para este servicio");
      return;
    }

    const normalizedServiceData =
      requestForPayment.service_data || buildDirectPaymentServiceData(service);

    // Obtener el voucher_code de forma robusta - priorizar voucher_code_venta
    const voucherCode =
      voucherReserva.voucher_code_venta ||
      requestForPayment.voucher_code ||
      voucherReserva.voucher_code;

    // Preparar datos para el formulario de pago
    // Usar descripción basada en el tipo de servicio (parentService.typeService)
    const descripcionPago = generatePaymentDescription(
      normalizedServiceData,
      voucherCode,
    );

    const paymentData = {
      descripcion: descripcionPago,
      amount: requestForPayment.amount || requestForPayment.monto,
      monto: requestForPayment.amount || requestForPayment.monto,
      moneda: "USD",
      observaciones: requestForPayment.observaciones || "",
      service_data: normalizedServiceData,
      contexto_pago: {
        payment_request_id: requestForPayment.id,
        tipo: "ServiciosVoucherReserva",
      },
      voucher_code: voucherCode,
      referencia_voucher_reserva:
        requestForPayment.voucher_reserva_id || voucherReserva.id,
      referencia_voucher_venta:
        voucherReserva.voucher_venta_id || voucherReserva.voucherId,
    };

    // Abrir modal de MovimientoForm con los datos preparados
    setSelectedPaymentRequest({ ...requestForPayment, ...paymentData });
    setShowPaymentModal(true);
  };

  // Ver el movimiento contable completo y sus evidencias.
  // Se consulta la misma fuente usada por Contabilidad para evitar construir
  // un movimiento parcial sin fecha, cuenta, tipo ni referencias de pago.
  const handleViewEvidencias = async (paymentRequest) => {
    setLoadingMovimiento(true);
    try {
      const movimientoId =
        paymentRequest?.movimiento_id || paymentRequest?.movimiento?.id || null;
      let movimiento = null;

      // Fuente principal: movimiento persistido completo por su ID.
      if (movimientoId) {
        const result = await movimientoService.getById(movimientoId);
        if (result.success && result.data) {
          movimiento = result.data;
        }
      }

      // Respaldo: localizar el movimiento completo por payment_request_id.
      if (!movimiento && paymentRequest?.id) {
        const result = await movimientoService.getByPaymentRequestId(
          paymentRequest.id,
        );

        if (result.success && Array.isArray(result.data) && result.data.length) {
          movimiento =
            result.data.find(
              (item) => String(item.id) === String(movimientoId),
            ) || result.data[0];
        }
      }

      // Compatibilidad con respuestas antiguas que ya incluían el movimiento.
      if (!movimiento && paymentRequest?.movimiento) {
        movimiento = paymentRequest.movimiento;
      }

      const voucherCode =
        movimiento?.voucher_code ||
        voucherReserva?.voucher_code_venta ||
        paymentRequest.voucher_code ||
        voucherReserva?.voucher_code ||
        null;
      const fallbackDate =
        paymentRequest.paid_at ||
        paymentRequest.updated_at ||
        paymentRequest.created_at ||
        null;

      // Último respaldo para registros legacy: conserva el acceso a la
      // evidencia aunque la consulta detallada no esté disponible.
      if (!movimiento && movimientoId) {
        movimiento = {
          id: movimientoId,
          descripcion: generatePaymentDescription(
            paymentRequest.service_data,
            voucherCode,
          ),
          tipo_movimiento: "egreso",
          fecha: fallbackDate,
          monto:
            paymentRequest.payment_amount ?? paymentRequest.amount ?? 0,
          moneda: String(
            paymentRequest.currency || paymentRequest.moneda || "",
          )
            .toLowerCase()
            .includes("sol")
            ? "soles"
            : "dolares",
          tipo_cuenta: paymentRequest.tipo_cuenta || null,
          voucher_code: voucherCode,
          contexto_pago: {
            payment_request_id: paymentRequest.id,
            tipo: "ServiciosVoucherReserva",
          },
        };
      }

      if (movimiento) {
        // Completar únicamente campos ausentes; los valores contables reales
        // recuperados del backend siempre tienen prioridad.
        setSelectedPreviewPaymentRequest(paymentRequest);
        setSelectedMovimiento({
          ...movimiento,
          id: movimiento.id || movimientoId,
          descripcion:
            movimiento.descripcion ||
            generatePaymentDescription(paymentRequest.service_data, voucherCode),
          tipo_movimiento: movimiento.tipo_movimiento || "egreso",
          fecha: movimiento.fecha || movimiento.fecha_movimiento || fallbackDate,
          monto:
            movimiento.monto ??
            paymentRequest.payment_amount ??
            paymentRequest.amount ??
            0,
          moneda:
            movimiento.moneda ||
            (String(paymentRequest.currency || paymentRequest.moneda || "")
              .toLowerCase()
              .includes("sol")
              ? "soles"
              : "dolares"),
          tipo_cuenta:
            movimiento.tipo_cuenta || paymentRequest.tipo_cuenta || null,
          voucher_code: voucherCode,
          contexto_pago: movimiento.contexto_pago || {
            payment_request_id: paymentRequest.id,
            tipo: "ServiciosVoucherReserva",
          },
          referencia_voucher_reserva:
            movimiento.referencia_voucher_reserva ||
            paymentRequest.voucher_reserva_id ||
            voucherReserva?.id ||
            null,
          referencia_voucher_venta:
            movimiento.referencia_voucher_venta ||
            voucherReserva?.voucher_venta_id ||
            voucherReserva?.voucherId ||
            null,
          metodo_pago:
            movimiento.metodo_pago || paymentRequest.metodo_pago || null,
          referencia_pago:
            movimiento.referencia_pago ||
            paymentRequest.referencia_pago ||
            null,
          pagado_por:
            movimiento.pagado_por || paymentRequest.pagado_por || null,
        });
        setShowMovimientoPreview(true);
      } else {
        toast.info("No se encontró el movimiento contable de este pago");
      }
    } catch (error) {
      console.error(" Error cargando el movimiento y sus evidencias:", error);
      toast.error("Error al cargar los detalles del movimiento");
    } finally {
      setLoadingMovimiento(false);
    }
  };

  // Cancelar petición de pago pendiente
  const handleCancelPaymentRequest = async (paymentRequest) => {
    if (!paymentRequest?.id) {
      toast.error("No hay solicitud de pago para cancelar");
      return;
    }

    if (paymentRequest.status !== "pending") {
      toast.error("Solo se pueden cancelar solicitudes pendientes");
      return;
    }

    if (confirmingCancelId !== paymentRequest.id) {
      setConfirmingCancelId(paymentRequest.id);
      if (cancelTimerRef.current) {
        clearTimeout(cancelTimerRef.current);
      }
      cancelTimerRef.current = setTimeout(() => {
        setConfirmingCancelId(null);
      }, 5000);
      return;
    }

    try {
      setConfirmingCancelId(null);
      setCancellingPaymentId(paymentRequest.id);
      if (cancelTimerRef.current) {
        clearTimeout(cancelTimerRef.current);
        cancelTimerRef.current = null;
      }
      await voucherReservaService.cancelPendingPaymentRequest(
        paymentRequest.id,
        "Cancelado por el usuario desde gestión de pagos",
      );

      toast.success("Solicitud de pago cancelada exitosamente");

      invalidateReservaAssignmentGraphCache();

      // Notificar a otros componentes
      window.dispatchEvent(
        new CustomEvent("paymentRequestCancelled", {
          detail: {
            payment_request_id: paymentRequest.id,
            voucher_reserva_id: paymentRequest.voucher_reserva_id,
            voucher_code:
              paymentRequest.voucher_code || voucherReserva?.voucher_code,
            voucherReservaId:
              voucherReserva?.id || voucherReserva?.reservationVoucher?.id,
          },
        }),
      );
    } catch (error) {
      console.error(" Error cancelando solicitud de pago:", error);
      const errorMessage =
        error.response?.data?.message || error.message || "Error desconocido";
      toast.error(`Error al cancelar solicitud: ${errorMessage}`);
    } finally {
      setCancellingPaymentId(null);
    }
  };

  const toggleServiceSelection = (service) => {
    const serviceKey = getServiceSelectionKey(service);
    if (!serviceKey) return;

    setSelectedServiceKeys((current) => {
      const next = new Set(current);
      if (next.has(serviceKey)) next.delete(serviceKey);
      else next.add(serviceKey);
      return next;
    });
  };

  const toggleAllBatchCandidates = () => {
    setSelectedServiceKeys((current) => {
      if (current.size === batchCandidates.length) return new Set();
      return new Set(batchCandidates.map((candidate) => candidate.key));
    });
  };

  // Solicitar pago para un servicio - abre el popover compacto
  const handleRequestPayment = (day, dayIndex, service, serviceIndex) => {
    if (paymentLoadError || refreshingPayments || !canRequestReservationPayment(service)) {
      toast.error("Actualiza el estado y selecciona un servicio disponible para solicitar pago");
      return;
    }

    setRequestModalItems([
      {
        service,
        dayIndex,
        serviceIndex,
        dayNumber: day.numero,
      },
    ]);
    setShowPaymentVoucherModal(true);
  };

  const handleRequestSelectedPayments = () => {
    if (paymentLoadError || refreshingPayments) return;
    if (selectedBatchItems.length === 0) {
      toast.info("Selecciona al menos un servicio");
      return;
    }
    if (selectedBatchItems.length > 100) {
      toast.info("Selecciona como máximo 100 servicios por lote");
      return;
    }

    setRequestModalItems(selectedBatchItems);
    setShowPaymentVoucherModal(true);
  };

  // Cerrar modal de solicitud de pago
  const handleClosePaymentVoucherModal = () => {
    setShowPaymentVoucherModal(false);
    setRequestModalItems([]);
  };

  // Abrir modal de pago
  const handleOpenPayment = (paymentRequest) => {
    setSelectedPaymentRequest(paymentRequest);
    setShowPaymentModal(true);
  };

  // Completar pago
  const handlePaymentSuccess = async () => {
    toast.success("Pago registrado exitosamente");
    setShowPaymentModal(false);
    setSelectedPaymentRequest(null);
    invalidateReservaAssignmentGraphCache();
    loadVoucherDataRef.current?.();

    if (onPaymentCompleted) {
      onPaymentCompleted();
    }
  };

  // Datos iniciales estables para MovimientoForm (evita loop infinito por referencia nueva en cada render)
  const movimientoFormInitialData = useMemo(() => {
    if (!selectedPaymentRequest) return null;
    return {
      descripcion: generatePaymentDescription(
        selectedPaymentRequest.service_data,
        voucherReserva.voucher_code_venta ||
          selectedPaymentRequest.voucher_code ||
          voucherReserva.voucher_code ||
          "N/A",
      ),
      monto: selectedPaymentRequest.amount,
      moneda: "USD",
      observaciones: selectedPaymentRequest.observaciones || "",
      contexto_pago: {
        payment_request_id: selectedPaymentRequest.id,
        tipo: "ServiciosVoucherReserva",
      },
      voucher_code:
        voucherReserva.voucher_code_venta ||
        selectedPaymentRequest.voucher_code ||
        voucherReserva.voucher_code,
      referencia_voucher_reserva:
        selectedPaymentRequest.voucher_reserva_id || voucherReserva.id,
      referencia_voucher_venta:
        voucherReserva.voucher_venta_id || voucherReserva.voucherId,
    };
  }, [
    selectedPaymentRequest?.id,
    selectedPaymentRequest?.amount,
    selectedPaymentRequest?.observaciones,
    selectedPaymentRequest?.voucher_code,
    selectedPaymentRequest?.voucher_reserva_id,
    selectedPaymentRequest?.service_data,
    voucherReserva?.voucher_code_venta,
    voucherReserva?.voucher_code,
    voucherReserva?.id,
    voucherReserva?.voucher_venta_id,
    voucherReserva?.voucherId,
  ]);

  if (loading) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Gestión de Pagos"
        size="large"
        className="payment-management-modal"
      >
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Cargando información de pagos...</p>
        </div>
      </Modal>
    );
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Gestión de Pagos - ${voucherReserva?.voucher_code_venta || voucherReserva?.voucher_code || voucherReserva?.voucherCode || ""}`}
        size="large"
        className="payment-management-modal"
      >
        <div className="payment-management-content">
          <div className="payment-management-scroll">
          <div className="payment-management-overview">
            {(specializedFlightGroups.length > 0 || specializedTicketGroups.length > 0) && (
              <div className="linked-service-payment-tools">
                <div className="linked-service-payment-tools__copy">
                  <strong>Paneles de servicios</strong>
                  <span>Revisar asignaciones y pagos de vuelos y entradas.</span>
                </div>
                <div className="linked-service-payment-tools__actions">
                  {specializedFlightGroups.length > 0 && (
                    <button type="button" className="linked-service-payment-button flights" onClick={() => setSpecializedPaymentType("vuelos")}>
                      <MdFlightTakeoff /><span>Vuelos</span><small>{specializedFlightGroups.reduce((total, group) => total + (group.services?.length || 0), 0)} servicio(s)</small>
                    </button>
                  )}
                  {specializedTicketGroups.length > 0 && (
                    <button type="button" className="linked-service-payment-button tickets" onClick={() => setSpecializedPaymentType("tickets")}>
                      <MdConfirmationNumber /><span>Entradas</span><small>{specializedTicketGroups.reduce((total, group) => total + (group.services?.length || 0), 0)} servicio(s)</small>
                    </button>
                  )}
                </div>
              </div>
            )}
            {/* ── Summary Strip ── */}
            <div className="payment-summary-strip">
              <div className="summary-chip days">
                <MdCalendarToday />
                <span className="chip-value">{assignedItinerary.length}</span>
                <span className="chip-label">Días</span>
              </div>
              <div className="summary-chip assigned">
                <MdCheckCircle />
                <span className="chip-value">{getTotalAssignedCount()}</span>
                <span className="chip-label">Asignados</span>
              </div>
              <div className="summary-chip pending">
                <MdPayment />
                <span className="chip-value">{getPendingPaymentsCount()}</span>
                <span className="chip-label">Pendientes</span>
              </div>
              <div className="summary-chip completed">
                <MdCheck />
                <span className="chip-value">{getCompletedPaymentsCount()}</span>
                <span className="chip-label">Pagados</span>
              </div>
            </div>

          </div>
          <TicketChargeSummary summary={ticketChargeSummary} formatAmount={formatPaymentCurrency} />
          {paymentLoadError && <div className="payment-load-error" role="alert">
            No se pudo verificar el estado de los pagos. Las solicitudes están deshabilitadas para evitar duplicados.
            <button type="button" onClick={loadVoucherData}>Reintentar</button>
          </div>}

          {/* ── Itinerary ── */}
          <div className="itinerary-container">
            {getTotalAssignedCount() === 0 ? (
              <div className="empty-state">
                <MdWarning size={40} />
                <p>No hay servicios asignados en este voucher</p>
              </div>
            ) : (
              assignedItinerary.map((day, dayIndex) => {
                const assignedServices = (day.servicios || [])
                  .map((service, serviceIndex) => ({ service, serviceIndex }))
                  .filter(({ service }) => hasAssignedService(service));
                if (assignedServices.length === 0) return null;

                return (
                  <div key={dayIndex} className="day-section">
                    <div className="day-header">
                      <div className="day-title">
                        <span className="day-num">Día {day.numero}</span>
                        <span className="day-name">
                          {day.titulo || "Sin título"}
                        </span>
                      </div>
                      {day.ciudades?.length > 0 && (
                        <span className="day-cities">
                          {day.ciudades.join(" · ")}
                        </span>
                      )}
                    </div>

                    <div className="day-services-list">
                      {assignedServices.map(({ service, serviceIndex }) => {
                        const paymentRequest =
                          getServicePaymentRequest(service);
                        const isPaid = paymentRequest?.status === "paid";
                        const isPending = paymentRequest?.status === "pending";
                        const normalizedPaymentType = getSpecializedServiceType(service);
                        const isSpecializedPayment = ["vuelos", "tickets"].includes(normalizedPaymentType);
                        const canPayDirect = canPayDirectlyByReservas(service);
                        const canRequestPayment = !paymentLoadError && !refreshingPayments && canRequestReservationPayment(service);
                        const serviceSelectionKey =
                          getServiceSelectionKey(service);
                        const canSelectForBatch = canRequestPayment;
                        const isSelected =
                          !!serviceSelectionKey &&
                          selectedServiceKeys.has(serviceSelectionKey);
                        const statusClass = isPaid
                          ? "paid"
                          : isPending
                            ? "pending"
                            : "no-request";
                        const serviceDisplayDetail =
                          getServiceDisplayDetail(service);

                        return (
                          <div
                            key={serviceIndex}
                            className={`service-row ${statusClass}`}
                          >
                            <div className="service-select-cell">
                              {canSelectForBatch ? (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleServiceSelection(service)}
                                  aria-label={`Seleccionar ${getServiceDisplayName(service)}`}
                                />
                              ) : (
                                <span className="service-select-placeholder" />
                              )}
                            </div>

                            {/* Left: service info */}
                            <div className="service-main">
                              <span className="service-type-badge">
                                {getServiceTypeLabel(
                                  resolveServiceType(service),
                                )}
                              </span>
                              <div className="service-name-block">
                                <div className="service-name-line">
                                  <span className="service-name">
                                    {getServiceDisplayName(service)}
                                  </span>
                                  {service.hora && (
                                    <span className="service-time">
                                      <MdSchedule size={12} /> {service.hora}
                                    </span>
                                  )}
                                </div>
                                {serviceDisplayDetail && (
                                  <span className="service-detail">
                                    {serviceDisplayDetail}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Center: tariff */}
                            <div className="service-tariff">
                              {(() => {
                                const price = getDirectPaymentAmount(service);
                                return price > 0 ? (
                                  <span className="tariff-amount">
                                    {formatPaymentCurrency(price)}
                                  </span>
                                ) : null;
                              })()}
                            </div>

                            {/* Right: status + actions */}
                            <div className="service-payment-area">
                              <div className={`status-pill ${statusClass}`}>
                                {isPaid && (
                                  <>
                                    <MdCheck size={14} /> Pagado
                                  </>
                                )}
                                {isPending && (
                                  <>
                                    <MdWarning size={14} /> Pendiente
                                  </>
                                )}
                                {!isPaid && !isPending && "Sin solicitud"}
                              </div>

                              {canPayDirect && !isPaid && (
                                <span className="direct-badge">
                                  Pago directo
                                </span>
                              )}

                              <div className="action-buttons">
                                {isSpecializedPayment && !isPaid && (
                                  <button
                                    type="button"
                                    className="btn-action btn-specialized-payment"
                                    onClick={() => setSpecializedPaymentType(normalizedPaymentType)}
                                    title={`Abrir gestión especializada de ${normalizedPaymentType === "vuelos" ? "vuelos" : "entradas"}`}
                                  >
                                    {normalizedPaymentType === "vuelos" ? <MdFlightTakeoff /> : <MdConfirmationNumber />}
                                    Abrir panel
                                  </button>
                                )}
                                {canRequestPayment && (
                                  <button
                                    className="btn-action btn-request"
                                    onClick={() =>
                                      handleRequestPayment(
                                        day,
                                        dayIndex,
                                        service,
                                        serviceIndex,
                                      )
                                    }
                                    title="Solicitar pago"
                                  >
                                    <MdAttachMoney /> Solicitar
                                  </button>
                                )}

                                {!isPaid && canPayDirect && (
                                  <button
                                    className="btn-action btn-pay"
                                    onClick={() =>
                                      handlePayDirectly(
                                        service,
                                        paymentRequest,
                                        dayIndex,
                                        serviceIndex,
                                      )
                                    }
                                    title="Pagar directamente"
                                  >
                                    <MdPayment /> Pagar
                                  </button>
                                )}

                                {isPending && !canPayDirect && normalizedPaymentType !== "vuelos" && (
                                  <span className="contabilidad-tag">
                                    Vía Contabilidad
                                  </span>
                                )}

                                {isPending &&
                                  confirmingCancelId === paymentRequest.id && (
                                    <>
                                      <button
                                        className="btn-action btn-cancel-confirm"
                                        onClick={() =>
                                          handleCancelPaymentRequest(
                                            paymentRequest,
                                          )
                                        }
                                        disabled={
                                          cancellingPaymentId ===
                                          paymentRequest.id
                                        }
                                        title="Confirmar cancelación"
                                      >
                                        {cancellingPaymentId ===
                                        paymentRequest.id
                                          ? "Cancelando..."
                                          : "Confirmar"}
                                      </button>
                                      <button
                                        className="btn-action btn-cancel-dismiss"
                                        onClick={() =>
                                          setConfirmingCancelId(null)
                                        }
                                        disabled={
                                          cancellingPaymentId ===
                                          paymentRequest.id
                                        }
                                        title="No cancelar"
                                      >
                                        <MdClose />
                                      </button>
                                    </>
                                  )}

                                {isPending &&
                                  confirmingCancelId !== paymentRequest.id && (
                                    <button
                                      className="btn-action btn-cancel"
                                      onClick={() =>
                                        handleCancelPaymentRequest(
                                          paymentRequest,
                                        )
                                      }
                                      disabled={
                                        cancellingPaymentId ===
                                        paymentRequest.id
                                      }
                                      title="Cancelar solicitud"
                                    >
                                      {cancellingPaymentId ===
                                      paymentRequest.id ? (
                                        "..."
                                      ) : (
                                        <MdCancel />
                                      )}
                                    </button>
                                  )}

                                {isPaid && (
                                  <>
                                    {paymentRequest?.payment_amount && (
                                      <span className="paid-amount">
                                        {formatPaymentCurrency(
                                          paymentRequest.payment_amount,
                                        )}
                                      </span>
                                    )}
                                    <button
                                      className="btn-action btn-evidence"
                                      onClick={() =>
                                        handleViewEvidencias(paymentRequest)
                                      }
                                      disabled={loadingMovimiento}
                                      title="Ver movimiento y evidencias"
                                    >
                                      <MdVisibility />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          </div>
          <PaymentBatchBar count={batchCandidates.length} selectedCount={selectedBatchItems.length}
            total={selectedBatchTotal} formatAmount={formatPaymentCurrency}
            onSelectAll={toggleAllBatchCandidates} onRequest={handleRequestSelectedPayments}
            disabled={paymentLoadError || refreshingPayments} />
        </div>
      </Modal>

      {specializedPaymentType === "vuelos" && specializedFlightGroups.length > 0 && (
        <FlightPaymentModal
          isOpen={true}
          onClose={() => setSpecializedPaymentType(null)}
          flightsByDay={specializedFlightGroups}
          servicesByDay={specializedFlightGroups}
          serviceType="vuelos"
          cotizacionData={specializedCotizacionData}
          passengerData={specializedPassengerData}
          voucherId={voucherVentaId}
          voucherCode={voucherReserva?.voucher_code_venta || voucherReserva?.voucher_code}
          onPaymentSuccess={async () => { await loadVoucherData(); await onPaymentCompleted?.(); }}
        />
      )}

      {specializedPaymentType === "tickets" && specializedTicketGroups.length > 0 && (
        <FlightPaymentModal
          isOpen={true}
          onClose={() => setSpecializedPaymentType(null)}
          flightsByDay={specializedTicketGroups}
          servicesByDay={specializedTicketGroups}
          serviceType="tickets"
          cotizacionData={specializedCotizacionData}
          passengerData={specializedPassengerData}
          voucherId={voucherVentaId}
          voucherCode={voucherReserva?.voucher_code_venta || voucherReserva?.voucher_code}
          onPaymentSuccess={async () => { await loadVoucherData(); await onPaymentCompleted?.(); }}
        />
      )}

      {/* Modal de pago */}
      {showPaymentModal && selectedPaymentRequest && (
        <MovimientoForm
          tipo="egreso"
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedPaymentRequest(null);
          }}
          onSuccess={handlePaymentSuccess}
          initialData={movimientoFormInitialData}
        />
      )}

      {/* Popover compacto para solicitud individual o por lote */}
      {showPaymentVoucherModal && requestModalItems.length > 0 && (
        <PaymentVoucherModal
          show={showPaymentVoucherModal}
          onClose={handleClosePaymentVoucherModal}
          onSubmitted={() => {
            setSelectedServiceKeys(new Set());
            setRefreshingPayments(true);
          }}
          service={requestModalItems[0].service}
          items={requestModalItems}
          voucherReservaId={
            voucherReserva.id || voucherReserva.reservationVoucher?.id
          }
          voucherReservaCode={
            voucherReserva.voucher_code ||
            voucherReserva.reservationVoucher?.voucher_code
          }
          dayIndex={requestModalItems[0].dayIndex}
          serviceIndex={requestModalItems[0].serviceIndex}
        />
      )}

      {/* Modal de preview de movimiento con evidencias */}
      {showMovimientoPreview && selectedMovimiento && (
        <div className="movimiento-preview-wrapper">
          <MovimientoPreviewModal
            isOpen={showMovimientoPreview}
            onClose={handleCloseMovimientoPreview}
            movimiento={selectedMovimiento}
            paymentRequest={selectedPreviewPaymentRequest}
          />
        </div>
      )}
    </>
  );
};

export default PaymentManagementModal;
