import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  MdAdd,
  MdDelete,
  MdEdit,
  MdPayment,
  MdCreditCard,
  MdAccountBalanceWallet,
  MdCheckCircle,
  MdErrorOutline,
  MdReceipt,
  MdOutlineAttachMoney,
  MdCalendarToday,
  MdContentCopy,
  MdHelpOutline,
  MdVisibility,
  MdFlightTakeoff,
} from "react-icons/md";
import "./PaymentStep.scss";
import MovimientoForm from "../../../../../../components/Contabilidad/MovimientoForm";
import MovimientoPreviewModal from "../../../../../../components/Contabilidad/MovimientoPreviewModal";
import FlightPaymentModal from "../../FlightPaymentModal/FlightPaymentModal";
import axiosInstance from "../../../../../../utils/axiosInstance";
import contabilidadService from "../../../../../../services/contabilidadService";
import { voucherReservaService } from "../../../../../../services/voucherReservaService";
import { toast } from "react-toastify";
import {
  filterVoucherPaymentMovements,
  movementAmountInUsd,
} from "../../../utils/voucherFinancials";
import { normalizePreLiquidacion, getRegisteredPreLiquidacionPaymentIds } from "../../../../Cotizaciones/utils/preliquidacion";

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.values(value).filter(
      (item) => item && typeof item === "object",
    );
  }
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      return Object.values(parsed).filter(
        (item) => item && typeof item === "object",
      );
    }
    return [];
  } catch {
    return [];
  }
};

const normalizeExternalDay = (day = {}, fallbackIndex = 0) => ({
  ...day,
  numero:
    Number(day?.numero || day?.day || fallbackIndex + 1) || fallbackIndex + 1,
  isExternalItinerary: true,
  sourceItinerary: "external",
  refTipo: day?.refTipo || day?.ref_tipo || "cotizacion_externa",
  ref_tipo: day?.ref_tipo || day?.refTipo || "cotizacion_externa",
  servicios: parseJsonArray(day?.servicios).map((service) => ({
    ...service,
    isExternalItinerary: true,
    sourceItinerary: "external",
    refTipo: service?.refTipo || service?.ref_tipo || "cotizacion_externa",
    ref_tipo: service?.ref_tipo || service?.refTipo || "cotizacion_externa",
  })),
});

const mergeDaysByNumber = (baseDays = [], externalDays = []) => {
  const byNumber = new Map();

  baseDays.forEach((day, index) => {
    const dayNumber = Number(day?.numero || day?.day || index + 1) || index + 1;
    byNumber.set(dayNumber, {
      ...day,
      numero: dayNumber,
      servicios: parseJsonArray(day?.servicios),
    });
  });

  externalDays.forEach((rawDay, index) => {
    const day = normalizeExternalDay(rawDay, index);
    const dayNumber = Number(day.numero || index + 1) || index + 1;
    const existing = byNumber.get(dayNumber);

    if (!existing) {
      byNumber.set(dayNumber, day);
      return;
    }

    byNumber.set(dayNumber, {
      ...existing,
      servicios: [...parseJsonArray(existing.servicios), ...day.servicios],
    });
  });

  return Array.from(byNumber.values()).sort(
    (left, right) => Number(left.numero || 0) - Number(right.numero || 0),
  );
};

const getCotizacionDaySets = (cotizacionData = {}) => {
  const cotizacion = cotizacionData?.cotizacion_data || cotizacionData || {};
  const baseDays = parseJsonArray(
    cotizacionData?.itinerario ??
      cotizacionData?.itinerary ??
      cotizacion?.itinerario,
  );
  const externalDays = parseJsonArray(
    cotizacionData?.itinerario_externo ??
      cotizacionData?.itinerarioExterno ??
      cotizacionData?.externalItinerary ??
      cotizacion?.itinerario_externo ??
      cotizacion?.itinerarioExterno ??
      cotizacion?.externalItinerary,
  );

  return { baseDays, externalDays };
};

const getCotizacionDays = (cotizacionData = {}) => {
  const { baseDays, externalDays } = getCotizacionDaySets(cotizacionData);
  return mergeDaysByNumber(baseDays, externalDays);
};

const getServiceKey = (service = {}, fallback = "") => {
  const value =
    service.servicioId ||
    service.servicio_id ||
    service.db_id ||
    service.id ||
    "";
  if (value) return `svc:${value}`;

  return [
    fallback,
    service?.typeService || service?.tipoServicio || service?.tipo_servicio || "",
    service?.parentService?.id_vuelo || service?.assignedParentService?.id_vuelo || "",
    service?.childService?.idtipo_vuelo ||
      service?.assignedChildService?.idtipo_vuelo ||
      "",
    service?.sourceItinerary || service?.source_itinerary || "",
  ].join(":");
};

const mergeItineraryWithCotizacionExternal = (
  reservationDays = [],
  cotizacionData = {},
) => {
  const { baseDays, externalDays } = getCotizacionDaySets(cotizacionData);
  const operationalDays = reservationDays.length > 0 ? reservationDays : baseDays;
  const dayMap = new Map();

  operationalDays.forEach((day, index) => {
    const dayNumber = Number(day?.numero || day?.day || index + 1) || index + 1;
    dayMap.set(dayNumber, {
      ...day,
      numero: dayNumber,
      servicios: parseJsonArray(day?.servicios),
    });
  });

  externalDays.forEach((rawDay, index) => {
    const day = normalizeExternalDay(rawDay, index);
    const dayNumber = Number(day.numero || index + 1) || index + 1;
    const existing = dayMap.get(dayNumber);

    if (!existing) {
      dayMap.set(dayNumber, day);
      return;
    }

    const currentServices = parseJsonArray(existing.servicios);
    const seen = new Set(
      currentServices.map((service, serviceIndex) =>
        getServiceKey(service, `${dayNumber}:current:${serviceIndex}`),
      ),
    );
    const nextExternalServices = day.servicios.filter((service, serviceIndex) => {
      const key = getServiceKey(service, `${dayNumber}:external:${serviceIndex}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    dayMap.set(dayNumber, {
      ...existing,
      servicios: [...currentServices, ...nextExternalServices],
    });
  });

  return Array.from(dayMap.values()).sort(
    (left, right) => Number(left.numero || 0) - Number(right.numero || 0),
  );
};

const getServiceType = (service = {}) =>
  String(
    service?.parentService?.typeService ||
      service?.parentService?.tipo_servicio ||
      service?.typeService ||
      service?.tipoServicio ||
      service?.tipo_servicio ||
      service?.category ||
      service?.categoria ||
      "",
  )
    .trim()
    .toLowerCase();

const isFlightService = (service = {}) => getServiceType(service) === "vuelos";
const PAYABLE_SERVICE_TYPES = ["vuelos"];

const areStatusMapsEqual = (a = {}, b = {}) =>
  PAYABLE_SERVICE_TYPES.every(
    (type) => (a[type] || "none") === (b[type] || "none"),
  );

const isPayableService = (service = {}) =>
  PAYABLE_SERVICE_TYPES.includes(getServiceType(service));

const getServiceTypeIcon = () => <MdFlightTakeoff />;

const getServiceTypeLabel = () => "Vuelos";

const getItineraryServiceId = (service = {}) => {
  const value = service.servicioId || service.servicio_id || service.db_id;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const PaymentStep = ({
  paymentData,
  onPaymentDataChange,
  cotizacionData,
  passengerData,
  isEditMode, // Nuevo prop para indicar modo edición
  voucherId, // ID del voucher para asociar con movimientos
  voucherCode, // Código del voucher (file) para organización de archivos en Tigris
}) => {
  // Use refs to track initialization state and prevent unnecessary re-renders
  const isInitializedRef = useRef(false);

  // Memoize initial values to prevent unnecessary re-renders
  const initialValues = useMemo(() => {
    return {
      payments: paymentData?.payments || [],
      total_final: parseFloat(
        cotizacionData?.cotizacion_data?.total_final ||
          cotizacionData?.total_final ||
          cotizacionData?.totalFinal ||
          0,
      ),
      totalPaid: parseFloat(paymentData?.totalPaid || 0),
      remainingAmount: parseFloat(paymentData?.remainingAmount || 0),
      paymentStatus: paymentData?.paymentStatus || "pending",
    };
  }, [paymentData, cotizacionData]);
  const cotizacionTotalFinal = useMemo(
    () =>
      parseFloat(
        cotizacionData?.cotizacion_data?.total_final ||
          cotizacionData?.total_final ||
          cotizacionData?.totalFinal ||
          0,
      ),
    [
      cotizacionData?.cotizacion_data?.total_final,
      cotizacionData?.total_final,
      cotizacionData?.totalFinal,
    ],
  );

  // State for payment list - using memoized initial values
  const [payments, setPayments] = useState(initialValues.payments);

  // Ref para evitar sincronización circular entre padre e hijo
  const localUpdateRef = useRef(false);

  // Sincronizar estados cuando paymentData cambie desde el padre (ej: después de cargar voucher)
  // SOLO si no fue una actualización local
  useEffect(() => {
    // Si fue una actualización local, ignorar (evitar ciclo)
    if (localUpdateRef.current) {
      localUpdateRef.current = false;
      return;
    }

    // Solo sincronizar si el padre tiene valores válidos
    if (paymentData?.totalPaid !== undefined && paymentData.totalPaid > 0) {
      const round2 = (num) => Math.round(parseFloat(num || 0) * 100) / 100;
      setTotalPaid(round2(paymentData.totalPaid));
      setRemainingAmount(round2(paymentData.remainingAmount || 0));
    }
  }, [paymentData?.totalPaid, paymentData?.remainingAmount]);
  const [showMovimientoForm, setShowMovimientoForm] = useState(false); // Cambiado de showPaymentModal
  const [editingPayment, setEditingPayment] = useState(null);
  const [showFlightPaymentModal, setShowFlightPaymentModal] = useState(false);
  const [selectedPaymentServiceType, setSelectedPaymentServiceType] =
    useState("vuelos");
  const [reservationItinerary, setReservationItinerary] = useState([]);
  const [movimientoInitialData, setMovimientoInitialData] = useState(null); // Datos para MovimientoForm

  // Preview state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewPayment, setPreviewPayment] = useState(null);

  // Total amounts - using memoized initial values
  const [total_final, settotal_final] = useState(initialValues.total_final);
  const [totalPaid, setTotalPaid] = useState(initialValues.totalPaid);
  const [remainingAmount, setRemainingAmount] = useState(
    initialValues.remainingAmount,
  );
  const [paymentStatus, setPaymentStatus] = useState(
    initialValues.paymentStatus,
  );
  const [isCopyTooltipVisible, setIsCopyTooltipVisible] = useState(false);

  // Errors
  const [errors, setErrors] = useState([]);
  const preLiquidacion = useMemo(
    () => normalizePreLiquidacion(cotizacionData?.preliquidacion),
    [cotizacionData?.preliquidacion],
  );
  const preLiquidacionSchedule = preLiquidacion.paymentSchedule || [];
  const registeredPreLiquidacionPaymentIds = useMemo(
    () => getRegisteredPreLiquidacionPaymentIds(payments),
    [payments],
  );

  // NOTA: La conversión de moneda ahora se maneja por movimiento individual en MovimientoForm
  // Cada pago puede tener su propio tipo_cambio almacenado en datos_extra

  // NUEVO: Cargar movimientos existentes desde la tabla movimientos
  const loadMovimientosFromDatabase = useCallback(async () => {
    try {
      const totalFinalFromProps = parseFloat(
        cotizacionData?.cotizacion_data?.total_final ||
          cotizacionData?.total_final ||
          cotizacionData?.totalFinal ||
          0,
      );

      // Usar el nuevo endpoint específico para filtrar por referencia de voucher
      const response = await axiosInstance.get(
        "/turismo/movimientos/voucher-reference",
        {
          params: {
            referencia_voucher_venta: voucherId?.toString(),
            voucher_code: voucherCode,
          },
        },
      );

      if (response.data?.data) {
        const movimientos = response.data.data;

        // Convertir movimientos a formato de payments
        const convertedPayments = filterVoucherPaymentMovements(movimientos, {
          id: voucherId,
          voucher_code: voucherCode,
        }).map((m) => {
            // Mapear moneda del backend: "soles" → "PEN", "dolares" → "USD"
            let monedaMapped = "USD";
            if (m.moneda) {
              const monedaLower = m.moneda.toLowerCase();
              if (monedaLower === "soles" || monedaLower === "pen") {
                monedaMapped = "PEN";
              } else if (monedaLower === "dolares" || monedaLower === "usd") {
                monedaMapped = "USD";
              }
            }

            return {
              id: `mov-${m.id}`,
              dbId: m.id,
              amount: parseFloat(m.monto) || 0,
              moneda: monedaMapped, // Moneda mapeada correctamente
              date: m.fecha,
              method: m.metodo_pago || "other",
              reference: m.referencia_pago || "",
              payer: m.datos_extra?.payer_name || "",
              receiver: m.datos_extra?.receiver_name || "",
              notes: m.observaciones || "",
              descripcion: m.descripcion || "", // Guardar descripción para mostrar como título
              evidencia: m.datos_extra?.evidencia?.[0] || null,
              isFromDatabase: true,
              // Tipo de cambio desde datos_extra, tipo_cambio directo, o contexto_pago.conversion
              tipo_cambio:
                m.datos_extra?.tipo_cambio ||
                m.tipo_cambio ||
                m.contexto_pago?.conversion?.tipo_cambio ||
                null,
              monto_convertido:
                m.datos_extra?.monto_convertido ||
                m.contexto_pago?.conversion?.monto_convertido ||
                null,
              // Guardar todos los datos del movimiento para edición
              originalData: m,
            };
          });

        setPayments(convertedPayments);

        const roundToTwoDecimals = (num) => Math.round(num * 100) / 100;
        const paid = convertedPayments.reduce(
          (sum, payment) =>
            roundToTwoDecimals(
              sum + movementAmountInUsd(payment.originalData),
            ),
          0,
        );

        setTotalPaid(roundToTwoDecimals(paid));
        setRemainingAmount(
          Math.max(0, roundToTwoDecimals(totalFinalFromProps - paid)),
        );
        // También actualizar el estado total_final si está en 0
        if (totalFinalFromProps > 0) {
          settotal_final(totalFinalFromProps);
        }
      }
    } catch (err) {
      console.error(" Error cargando movimientos:", err);
    }
  }, [
    voucherId,
    voucherCode,
    cotizacionData?.cotizacion_data?.total_final,
    cotizacionData?.total_final,
    cotizacionData?.totalFinal,
  ]);

  // Ejecutar loadMovimientosFromDatabase cuando entre al step
  useEffect(() => {
    if (isEditMode && voucherId) {
      loadMovimientosFromDatabase();
    }
  }, [isEditMode, voucherId, loadMovimientosFromDatabase]);

  // One-time initialization from props - improved to only run once
  useEffect(() => {
    // If already initialized, don't re-initialize
    if (isInitializedRef.current) return;

    // CORREGIDO: Priorizar cotizacionData.total_final incluso en modo edición
    const total =
      cotizacionData?.cotizacion_data?.total_final ||
      cotizacionData?.total_final ||
      cotizacionData?.totalFinal ||
      0;

    settotal_final(parseFloat(total));

    // Mark as initialized
    isInitializedRef.current = true;
  }, [isEditMode, paymentData, cotizacionData]);

  useEffect(() => {
    const loadReservationItinerary = async () => {
      if (!voucherId) {
        setReservationItinerary([]);
        return;
      }

      try {
        const itinerary =
          await voucherReservaService.getItinerarioByVoucherVenta(voucherId);
        setReservationItinerary(parseJsonArray(itinerary));
      } catch (error) {
        console.error("Error cargando itinerario normalizado:", error);
        setReservationItinerary([]);
      }
    };

    loadReservationItinerary();
  }, [voucherId]);

  const itineraryForServicePayments = useMemo(
    () => mergeItineraryWithCotizacionExternal(reservationItinerary, cotizacionData),
    [
      reservationItinerary,
      cotizacionData?.itinerario,
      cotizacionData?.itinerary,
      cotizacionData?.itinerario_externo,
      cotizacionData?.itinerarioExterno,
      cotizacionData?.externalItinerary,
      cotizacionData?.cotizacion_data?.itinerario,
      cotizacionData?.cotizacion_data?.itinerario_externo,
      cotizacionData?.cotizacion_data?.itinerarioExterno,
      cotizacionData?.cotizacion_data?.externalItinerary,
    ],
  );

  const payableServicesByType = useMemo(() => {
    const result = PAYABLE_SERVICE_TYPES.reduce((acc, type) => {
      acc[type] = [];
      return acc;
    }, {});

    itineraryForServicePayments.forEach((day, dayIndex) => {
      const servicios = Array.isArray(day?.servicios) ? day.servicios : [];

      PAYABLE_SERVICE_TYPES.forEach((type) => {
        const services = servicios
          .map((service, serviceIndex) => ({
            ...service,
            _sourceDayIndex: dayIndex,
            _sourceServiceIndex: serviceIndex,
          }))
          .filter((service) => getServiceType(service) === type);

        if (services.length > 0) {
          result[type].push({
            dayNumber: day?.numero || dayIndex + 1,
            dayData: day,
            services,
            flights: services,
          });
        }
      });
    });

    return result;
  }, [itineraryForServicePayments]);

  // Compatibilidad para el modal existente de vuelos.
  const flightsByDay = useMemo(() => {
    const days = getCotizacionDays(cotizacionData);
    if (days.length === 0) {
      return [];
    }

    const flights = [];

    days.forEach((day, dayIndex) => {
      const servicios = Array.isArray(day?.servicios) ? day.servicios : [];
      const dayFlights = servicios.filter(isFlightService);

      if (dayFlights.length > 0) {
        flights.push({
          dayNumber: dayIndex + 1,
          dayData: day,
          flights: dayFlights,
        });
      }
    });

    return flights;
  }, [
    cotizacionData?.itinerario,
    cotizacionData?.itinerary,
    cotizacionData?.itinerario_externo,
    cotizacionData?.itinerarioExterno,
    cotizacionData?.externalItinerary,
    cotizacionData?.cotizacion_data?.itinerario,
    cotizacionData?.cotizacion_data?.itinerario_externo,
    cotizacionData?.cotizacion_data?.itinerarioExterno,
    cotizacionData?.cotizacion_data?.externalItinerary,
  ]);

  // Estado y verificación de asignación de vuelos
  const [flightAssignmentStatus, setFlightAssignmentStatus] = useState("none"); // 'none', 'assigned', 'pending', 'paid'
  const [servicePaymentStatuses, setServicePaymentStatuses] = useState({
    vuelos: "none",
    trenes: "none",
    tickets: "none",
  });
  const updateFlightAssignmentStatus = useCallback((nextStatus) => {
    setFlightAssignmentStatus((prev) =>
      prev === nextStatus ? prev : nextStatus,
    );
  }, []);

  // Verificar estado de asignación de vuelos cuando hay voucherId
  useEffect(() => {
    const checkFlightAssignment = async () => {
      if (!voucherId || flightsByDay.length === 0) {
        updateFlightAssignmentStatus("none");
        return;
      }

      try {
        // Obtener todas las reservas y buscar la correspondiente a este voucher
        const reservasResponse =
          await voucherReservaService.getAllVoucherReservas();
        const reservasArray = Array.isArray(reservasResponse)
          ? reservasResponse
          : reservasResponse?.data && Array.isArray(reservasResponse.data)
            ? reservasResponse.data
            : [];

        const reservationVoucher = reservasArray.find(
          (rv) => rv.voucher_id === parseInt(voucherId, 10),
        );

        if (!reservationVoucher) {
          updateFlightAssignmentStatus("none");
          return;
        }

        // Verificar si hay vuelos asignados
        let hasAssignedFlight = false;
        let hasPendingPayment = false;
        let hasPaidPayment = false;

        const assignedItinerary = parseJsonArray(
          reservationVoucher.assigned_itinerary,
        );
        if (assignedItinerary.length > 0) {
          for (const day of assignedItinerary) {
            if (day.servicios && Array.isArray(day.servicios)) {
              const assignedFlight = day.servicios.find(
                (service) =>
                  service.isAssigned &&
                  service.assignedService &&
                  isFlightService(service.assignedService),
              );

              if (assignedFlight) {
                hasAssignedFlight = true;

                // Verificar si hay payment_request
                if (assignedFlight.paymentRequest) {
                  if (
                    assignedFlight.paymentRequest.status === "paid" ||
                    assignedFlight.paymentRequest.status === "completed"
                  ) {
                    hasPaidPayment = true;
                  } else if (
                    assignedFlight.paymentRequest.status === "pending"
                  ) {
                    hasPendingPayment = true;
                  }
                }
                break;
              }
            }
          }
        }

        // Determinar el estado final
        if (hasPaidPayment) {
          updateFlightAssignmentStatus("paid");
        } else if (hasPendingPayment) {
          updateFlightAssignmentStatus("pending");
        } else if (hasAssignedFlight) {
          updateFlightAssignmentStatus("assigned");
        } else {
          updateFlightAssignmentStatus("none");
        }
      } catch (error) {
        console.error(" Error verificando asignación de vuelos:", error);
        updateFlightAssignmentStatus("none");
      }
    };

    checkFlightAssignment();
  }, [voucherId, flightsByDay, updateFlightAssignmentStatus]);

  useEffect(() => {
    const checkServicePaymentStatuses = async () => {
      const nextStatuses = {
        vuelos: "none",
        trenes: "none",
        tickets: "none",
      };

      PAYABLE_SERVICE_TYPES.forEach((type) => {
        if ((payableServicesByType[type] || []).length > 0) {
          nextStatuses[type] = "available";
        }
      });

      if (!voucherId || itineraryForServicePayments.length === 0) {
        setServicePaymentStatuses((prev) =>
          areStatusMapsEqual(prev, nextStatuses) ? prev : nextStatuses,
        );
        return;
      }

      try {
        const reservasResponse =
          await voucherReservaService.getAllVoucherReservas();
        const reservasArray = Array.isArray(reservasResponse)
          ? reservasResponse
          : Array.isArray(reservasResponse?.data)
            ? reservasResponse.data
            : [];
        const reservationVoucher = reservasArray.find(
          (rv) => rv.voucher_id === parseInt(voucherId, 10),
        );
        const paymentRequests = reservationVoucher?.id
          ? await voucherReservaService.getPaymentRequestsByVoucherReservaId(
              reservationVoucher.id,
            )
          : [];

        PAYABLE_SERVICE_TYPES.forEach((type) => {
          const services = itineraryForServicePayments
            .flatMap((day) => day?.servicios || [])
            .filter((service) => getServiceType(service) === type);

          if (services.length === 0) {
            nextStatuses[type] = "none";
            return;
          }

          const assignedServices = services.filter((service) => {
            const hasAssignedFlag = service.isAssigned === true;
            const hasAssignedData =
              service.assignedParentService ||
              service.assignedChildService ||
              service.assignedService;
            return hasAssignedFlag && hasAssignedData;
          });

          if (assignedServices.length === 0) {
            nextStatuses[type] = "available";
            return;
          }

          const relatedRequests = assignedServices
            .map((service) => {
              const serviceId = getItineraryServiceId(service);
              return paymentRequests.find(
                (request) => request.itinerario_servicio_id === serviceId,
              );
            })
            .filter(Boolean);

          const allAssignedServicesPaid =
            assignedServices.length === services.length &&
            assignedServices.length > 0 &&
            assignedServices.every((service) => {
              const serviceId = getItineraryServiceId(service);
              const request = paymentRequests.find(
                (item) => item.itinerario_servicio_id === serviceId,
              );
              return ["paid", "completed"].includes(request?.status);
            });

          if (allAssignedServicesPaid) {
            nextStatuses[type] = "paid";
          } else if (
            relatedRequests.some((request) => request.status === "pending")
          ) {
            nextStatuses[type] = "pending";
          } else {
            nextStatuses[type] = "assigned";
          }
        });

        setServicePaymentStatuses((prev) =>
          areStatusMapsEqual(prev, nextStatuses) ? prev : nextStatuses,
        );
        updateFlightAssignmentStatus(nextStatuses.vuelos || "none");
      } catch (error) {
        console.error("Error verificando pagos de servicios:", error);
        setServicePaymentStatuses((prev) =>
          areStatusMapsEqual(prev, nextStatuses) ? prev : nextStatuses,
        );
      }
    };

    checkServicePaymentStatuses();
  }, [
    itineraryForServicePayments,
    payableServicesByType,
    voucherId,
    updateFlightAssignmentStatus,
  ]);

  // Helper para redondear a 2 decimales (evitar problemas de punto flotante)
  const roundToTwoDecimals = useCallback((num) => {
    return Math.round(parseFloat(num || 0) * 100) / 100;
  }, []);

  const paymentAmountInUsd = useCallback((payment) => {
    if (payment?.originalData) {
      return movementAmountInUsd(payment.originalData);
    }
    let amount = parseFloat(payment?.amount || 0);
    if (payment?.moneda === "PEN") {
      const rate = parseFloat(payment?.tipo_cambio) || 3.75;
      amount = rate > 0 ? amount / rate : 0;
    }
    return Math.round(amount * 100) / 100;
  }, []);

  // Memoize payment status calculation to avoid unnecessary calculations
  const calculatedPaymentStatus = useMemo(() => {
    const paid = payments.reduce(
      (sum, payment) => sum + paymentAmountInUsd(payment),
      0,
    );
    // Redondear para comparación precisa
    const roundedPaid = roundToTwoDecimals(paid);
    const roundedTotal = roundToTwoDecimals(total_final);
    const remaining = roundToTwoDecimals(roundedTotal - roundedPaid);

    if (remaining <= 0.01) return "completed"; // Tolerancia de 1 centavo
    if (roundedPaid > 0) return "partial";
    return "pending";
  }, [payments, total_final, roundToTwoDecimals, paymentAmountInUsd]);

  // DEPRECADO: La conversión de moneda ahora se maneja por movimiento individual
  // El tipo_cambio se almacena en datos_extra de cada movimiento

  // Calculate totals when payments change - memoized with useCallback
  useEffect(() => {
    const paid = payments.reduce(
      (sum, payment) =>
        roundToTwoDecimals(sum + paymentAmountInUsd(payment)),
      0,
    );

    const roundedPaid = roundToTwoDecimals(paid);
    setTotalPaid(roundedPaid);

    // Calcular restante en USD (redondeado a 2 decimales)
    const roundedTotal = roundToTwoDecimals(total_final);
    const remainingUSD = Math.max(
      0,
      roundToTwoDecimals(roundedTotal - roundedPaid),
    );

    // Ahora el restante siempre se muestra en USD (moneda base del voucher)
    // La conversión se hace cuando el usuario registra un nuevo pago
    setRemainingAmount(remainingUSD);

    // Set payment status based on calculated status
    setPaymentStatus(calculatedPaymentStatus);

    // Marcar que esta es una actualización local (evitar ciclo de sincronización)
    localUpdateRef.current = true;

    // Update parent component with payment data
    const originalAmount = roundToTwoDecimals(
      cotizacionTotalFinal || total_final,
    );
    onPaymentDataChange({
      payments,
      totalPaid: roundedPaid,
      total_final: roundedTotal, // Always send original USD total (redondeado)
      remainingAmount: remainingUSD, // Send remaining in USD to parent (redondeado)
      paymentStatus: calculatedPaymentStatus,
      // Currency data simplificado (la conversión se maneja por movimiento)
      original_currency: "USD",
      original_amount: originalAmount,
    });
  }, [
    payments,
    total_final,
    calculatedPaymentStatus,
    onPaymentDataChange,
    cotizacionTotalFinal,
    roundToTwoDecimals,
    paymentAmountInUsd,
  ]);

  // Add a new payment - memoized with useCallback
  const handleAddPayment = useCallback(
    (newPayment) => {
      // Validate that the new payment doesn't exceed the remaining amount
      if (
        parseFloat(newPayment.amount) > remainingAmount &&
        remainingAmount > 0
      ) {
        setErrors([
          `El monto excede el saldo pendiente de ${formatCurrency(remainingAmount)}`,
        ]);
        return false;
      }

      // Add the payment with a unique ID
      const paymentWithId = {
        ...newPayment,
        id: `payment-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        createdAt: new Date().toISOString(),
      };

      setPayments((prev) => [...prev, paymentWithId]);
      setErrors([]);
      return true;
    },
    [remainingAmount],
  );

  // Edit a payment - memoized with useCallback
  const handleEditPayment = useCallback(
    (updatedPayment) => {
      // Calculate how much we would have paid without this payment
      const otherPaymentsTotal = payments
        .filter((p) => p.id !== updatedPayment.id)
        .reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0);

      // Check if new amount would exceed the total
      if (
        parseFloat(updatedPayment.amount) + otherPaymentsTotal >
        total_final
      ) {
        setErrors([`El monto excede el saldo disponible`]);
        return false;
      }

      // Update the payment
      setPayments((prev) =>
        prev.map((payment) =>
          payment.id === updatedPayment.id
            ? { ...updatedPayment, updatedAt: new Date().toISOString() }
            : payment,
        ),
      );
      setErrors([]);
      return true;
    },
    [payments, total_final],
  );

  // Delete a payment - memoized with useCallback
  const handleDeletePayment = useCallback(
    async (paymentId, isFromDatabase, dbId = null) => {
      if (
        !window.confirm(
          "¿Está seguro que desea eliminar este pago? Esta acción no se puede deshacer.",
        )
      ) {
        return;
      }

      try {
        // Si el pago está en la base de datos, eliminarlo del backend
        if (isFromDatabase) {
          // CORREGIDO: Usar dbId (ID numérico real) en lugar de paymentId (mov-X)
          const movimientoId =
            dbId ||
            (paymentId.startsWith("mov-")
              ? paymentId.replace("mov-", "")
              : paymentId);
          const result =
            await contabilidadService.deleteMovimiento(movimientoId);
          if (!result.success) {
            toast.error(
              `Error al eliminar el pago: ${result.error || "Error desconocido"}`,
            );
            return;
          }
          toast.success("Pago eliminado correctamente de la contabilidad");
        }

        // Actualizar el estado local
        setPayments((prev) =>
          prev.filter((payment) => payment.id !== paymentId),
        );

        // Recargar movimientos para actualizar la lista
        if (voucherId) {
          await loadMovimientosFromDatabase();
        }
      } catch (error) {
        console.error("Error eliminando pago:", error);
        toast.error("Error al eliminar el pago");
      }
    },
    [voucherId, loadMovimientosFromDatabase],
  );

  // Modal actions - memoized with useCallback
  const openEditPaymentModal = useCallback(
    (payment) => {
      setEditingPayment(payment);

      // Obtener platform y business_type de la cotización
      const voucherPlatform = cotizacionData?.platform || "venso";
      const voucherBusinessType =
        cotizacionData?.business_type ||
        (voucherPlatform === "venso" ? "B2C" : "B2B");

      // Si el pago es de la BD, usar los datos originales del movimiento
      let initialData;
      if (payment.isFromDatabase && payment.originalData) {
        const m = payment.originalData;
        initialData = {
          id: m.id, // CRÍTICO: ID para modo edición
          descripcion: m.descripcion || "",
          tipo_cuenta: m.tipo_cuenta || "efectivo",
          tipo_movimiento: m.tipo_movimiento || "ingreso",
          monto: m.monto || payment.amount,
          fecha: new Date(m.fecha || payment.date),
          contexto_pago: m.contexto_pago || "PagoCotizacion",
          referencia_voucher_venta:
            m.referencia_voucher_venta || voucherId?.toString() || "",
          voucher_code: m.voucher_code || voucherCode || "",
          metodo_pago: m.metodo_pago || payment.method || "",
          referencia_pago: m.referencia_pago || payment.reference || "",
          observaciones: m.observaciones || payment.notes || "",
          // Heredar platform y business_type del movimiento o del voucher
          platform: m.platform || voucherPlatform,
          business_type: m.business_type || voucherBusinessType,
        };
      } else {
        // Pago nuevo (no guardado en BD)
        initialData = {
          descripcion:
            payment.descripcion ||
            `Pago de voucher venta ${voucherCode || voucherId || ""}`,
          tipo_cuenta: payment.method === "cash" ? "efectivo" : "cuenta_debito",
          tipo_movimiento: "ingreso",
          monto: payment.amount,
          fecha: new Date(payment.date),
          contexto_pago: "PagoCotizacion",
          referencia_voucher_venta: voucherId?.toString() || "",
          voucher_code: voucherCode || "",
          metodo_pago: payment.method || "",
          referencia_pago: payment.reference || "",
          // Heredar platform y business_type del voucher
          platform: voucherPlatform,
          business_type: voucherBusinessType,
        };
      }

      setMovimientoInitialData(initialData);
      setShowMovimientoForm(true);
    },
    [voucherId, voucherCode, cotizacionData],
  );

  const handlePreviewPayment = useCallback((payment) => {
    // MovimientoPreviewModal espera el objeto completo del movimiento
    const movimientoToPreview = payment.originalData || payment;
    setPreviewPayment(movimientoToPreview);
    setShowPreviewModal(true);
  }, []);

  const closePreviewModal = useCallback(() => {
    setShowPreviewModal(false);
    setPreviewPayment(null);
  }, []);

  const openScheduledPayment = useCallback((scheduledPayment) => {
    if (!scheduledPayment || registeredPreLiquidacionPaymentIds.has(String(scheduledPayment.id))) return;
    const voucherPlatform = cotizacionData?.platform || "venso";
    const voucherBusinessType = cotizacionData?.business_type || "B2C";
    setEditingPayment(null);
    setMovimientoInitialData({
      descripcion: `Pago programado ${scheduledPayment.id} · ${voucherCode || voucherId || ""}`,
      tipo_cuenta: "cuenta_debito",
      tipo_movimiento: "ingreso",
      monto: scheduledPayment.amount || "",
      fecha: scheduledPayment.dueDate ? new Date(`${scheduledPayment.dueDate}T12:00:00`) : new Date(),
      moneda: scheduledPayment.currency === "PEN" ? "soles" : "dolares",
      contexto_pago: "PagoCotizacion",
      referencia_voucher_venta: voucherId?.toString() || "",
      voucher_code: voucherCode || "",
      metodo_pago: scheduledPayment.method || "",
      observaciones: scheduledPayment.notes || "",
      platform: voucherPlatform,
      business_type: voucherBusinessType,
      datos_extra: {
        preliquidacion_payment_id: String(scheduledPayment.id),
        preliquidacion_due_date: scheduledPayment.dueDate || null,
        preliquidacion_currency: scheduledPayment.currency || "USD",
        preliquidacion_notes: scheduledPayment.notes || "",
        payment_notes: scheduledPayment.notes || "",
      },
    });
    setShowMovimientoForm(true);
  }, [registeredPreLiquidacionPaymentIds, cotizacionData, voucherCode, voucherId]);

  const openAddPaymentModal = useCallback(() => {
    setEditingPayment(null);
    // Preparar datos iniciales para nuevo movimiento
    // Redondear el monto pendiente a 2 decimales
    const roundedRemaining = roundToTwoDecimals(remainingAmount);

    // Obtener platform y business_type de la cotización
    const voucherPlatform = cotizacionData?.platform || "venso";
    const voucherBusinessType =
      cotizacionData?.business_type ||
      (voucherPlatform === "venso" ? "B2C" : "B2B");

    const initialData = {
      descripcion: `Pago de voucher venta ${voucherCode || voucherId || ""}`,
      tipo_cuenta: "efectivo",
      tipo_movimiento: "ingreso",
      monto: roundedRemaining > 0 ? roundedRemaining : "",
      fecha: new Date(),
      contexto_pago: "PagoCotizacion",
      referencia_voucher_venta: voucherId?.toString() || "",
      voucher_code: voucherCode || "",
      metodo_pago: "",
      referencia_pago: "",
      // Heredar platform y business_type del voucher/cotización
      platform: voucherPlatform,
      business_type: voucherBusinessType,
    };

    setMovimientoInitialData(initialData);
    setShowMovimientoForm(true);
  }, [
    voucherId,
    voucherCode,
    remainingAmount,
    roundToTwoDecimals,
    cotizacionData,
  ]);

  // Handle saving from payment modal - memoized with useCallback
  const handleSavePayment = useCallback(
    (paymentData) => {
      let success = false;

      if (editingPayment) {
        // Edit existing payment
        success = handleEditPayment({
          ...editingPayment,
          ...paymentData,
        });
      } else {
        // Add new payment
        success = handleAddPayment(paymentData);
      }

      if (success) {
        setShowMovimientoForm(false);
        setEditingPayment(null);
        setMovimientoInitialData(null);
      }

      return success;
    },
    [editingPayment, handleEditPayment, handleAddPayment],
  );

  // Handler cuando se crea exitosamente un movimiento desde MovimientoForm
  const handleMovimientoSuccess = useCallback(
    async (movimientoData) => {
      // Validar que movimientoData existe
      if (!movimientoData || !movimientoData.id) {
        console.error(" Error: movimientoData inválido o sin ID");
        toast.error("Error al procesar el pago");
        return;
      }

      try {
        // 1. Agregar el pago a la lista local
        const paymentForList = {
          id: `payment-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          amount: movimientoData.monto || 0,
          method:
            movimientoData.metodo_pago ||
            movimientoData.datos_extra?.payment_method ||
            "cash",
          reference:
            movimientoData.referencia_pago ||
            movimientoData.datos_extra?.payment_reference ||
            "",
          date: movimientoData.fecha || new Date().toISOString(),
          payer: movimientoData.datos_extra?.payer_name || "",
          receiver: movimientoData.datos_extra?.receiver_name || "",
          notes: movimientoData.datos_extra?.payment_notes || "",
          movimientoId: movimientoData.id,
          createdAt: new Date().toISOString(),
        };

        // No agregar manualmente, mejor recargar desde BD
        // setPayments(prev => [...prev, paymentForList]);

        // Recargar lista desde la base de datos para mostrar el movimiento recién creado
        if (voucherId) {
          // Esperar un poco para que la BD procese completamente
          await new Promise((resolve) => setTimeout(resolve, 200));

          // loadMovimientosFromDatabase ya calcula totalPaid y remainingAmount
          // basándose en los movimientos, NO usar valores del voucher (no hay trigger que los actualice)
          await loadMovimientosFromDatabase();
        }

        toast.success("Pago registrado correctamente");

        // 2. Cerrar el formulario - usar setTimeout para asegurar que el estado se actualice antes de cerrar
        setTimeout(() => {
          setShowMovimientoForm(false);
          setEditingPayment(null);
          setMovimientoInitialData(null);
          setErrors([]);
        }, 100);
      } catch (error) {
        console.error(
          " Error al procesar post-creación del movimiento:",
          error,
        );
        toast.error("Hubo un error al actualizar la lista de pagos");
      }
    },
    [voucherId, voucherCode, loadMovimientosFromDatabase],
  );

  // Close payment modal - memoized with useCallback
  const handleClosePaymentModal = useCallback(() => {
    setShowMovimientoForm(false);
    setEditingPayment(null);
    setMovimientoInitialData(null);
    setErrors([]);
  }, []);

  // Helper to format currency - memoized with useMemo
  // Formato de moneda con soporte multi-currency
  const formatCurrency = useCallback((amount, currency = "USD") => {
    if (amount === undefined || amount === null)
      return currency === "PEN" ? "S/ 0.00" : "$0.00";

    const formatted = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);

    return currency === "PEN" ? `S/ ${formatted}` : `$ ${formatted}`;
  }, []);

  // Format date - memoized with useCallback
  const formatDate = useCallback((dateString) => {
    try {
      return new Date(dateString).toLocaleDateString("es-ES", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch (e) {
      return dateString;
    }
  }, []);

  // Get icon for payment method - memoized with useCallback
  const getPaymentMethodIcon = useCallback((method) => {
    switch (method?.toLowerCase()) {
      case "credit":
      case "credit card":
      case "tarjeta de crédito":
        return <MdCreditCard />;
      case "debit":
      case "debit card":
      case "tarjeta de débito":
        return <MdCreditCard />;
      case "cash":
      case "efectivo":
        return <MdOutlineAttachMoney />;
      case "transfer":
      case "bank transfer":
      case "transferencia bancaria":
        return <MdAccountBalanceWallet />;
      default:
        return <MdPayment />;
    }
  }, []);

  // Helper to get color class based on payment status - memoized with useMemo
  const getStatusClass = useMemo(() => {
    switch (paymentStatus) {
      case "completed":
        return "status-completed";
      case "partial":
        return "status-partial";
      case "pending":
      default:
        return "status-pending";
    }
  }, [paymentStatus]);

  // Copy payment summary to clipboard - memoized with useCallback
  const copyPaymentSummary = useCallback(() => {
    const summary = `
Resumen de Pagos:
Total: ${formatCurrency(total_final)}
Pagado: ${formatCurrency(totalPaid)}
Saldo: ${formatCurrency(remainingAmount)}

Detalles:
${payments.map((p) => `${p.method} - ${formatCurrency(p.amount)} - ${p.reference || "Sin referencia"} - ${formatDate(p.date)}`).join("\n")}
 `.trim();

    navigator.clipboard.writeText(summary).then(() => {
      setIsCopyTooltipVisible(true);
      setTimeout(() => {
        setIsCopyTooltipVisible(false);
      }, 2000);
    });
  }, [
    formatCurrency,
    formatDate,
    payments,
    remainingAmount,
    total_final,
    totalPaid,
  ]);

  // NUEVA FUNCIÓN: Obtener etiqueta amigable del método de pago
  const getPaymentMethodLabel = useCallback((method) => {
    const labels = {
      cash: "Efectivo",
      efectivo: "Efectivo",
      transfer: "Transferencia",
      "transferencia bancaria": "Transferencia",
      "bank transfer": "Transferencia",
      debit: "Tarjeta de Débito",
      "tarjeta de débito": "Tarjeta de Débito",
      credit: "Tarjeta de Crédito",
      "tarjeta de crédito": "Tarjeta de Crédito",
      check: "Cheque",
      other: "Otro",
    };
    return labels[method] || method;
  }, []);

  // NUEVA FUNCIÓN: Confirmar eliminación de pago
  const confirmDeletePayment = useCallback((index) => {
    if (window.confirm("¿Estás seguro de eliminar este pago?")) {
      handleDeletePayment(index);
    }
  }, []);

  return (
    <div className="payment-step">
      <div className="payment-header">
        <h2>Información de Pagos</h2>
        <div className="payment-instructions">
          <p>
            Registre los pagos realizados por el cliente para esta cotización.
          </p>
        </div>
      </div>

      <div className="payment-summary">
        <div className={`summary-card ${getStatusClass}`}>
          <div className="summary-header">
            <h3>Resumen del Pago</h3>
            <button
              className="copy-button"
              onClick={copyPaymentSummary}
              title="Copiar resumen"
            >
              <MdContentCopy />
              {isCopyTooltipVisible && (
                <span className="tooltip">¡Copiado!</span>
              )}
            </button>
          </div>

          <div className="summary-content">
            {(() => {
              // Detectar pagos mixtos
              const hasMixedCurrencies =
                payments.length > 0 &&
                new Set(payments.map((p) => p.moneda || "USD")).size > 1;

              const paymentsInUSD = payments.filter(
                (p) => (p.moneda || "USD") === "USD",
              );
              const paymentsInPEN = payments.filter((p) => p.moneda === "PEN");

              if (
                hasMixedCurrencies &&
                paymentsInUSD.length > 0 &&
                paymentsInPEN.length > 0
              ) {
                return (
                  <div className="summary-row currency-note mixed">
                    <MdHelpOutline className="info-icon" />
                    <span className="info-text">
                      <strong>Pagos mixtos detectados:</strong>{" "}
                      {paymentsInUSD.length} pago(s) en USD y{" "}
                      {paymentsInPEN.length} pago(s) en PEN. Los montos se
                      convierten automáticamente a USD usando el tipo de cambio
                      de cada movimiento.
                    </span>
                  </div>
                );
              }

              return null;
            })()}
            <div className="summary-row">
              <span className="label">Total a Pagar (USD):</span>
              <span className="value">$ {total_final.toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span className="label">Pagado (USD):</span>
              <span className="value">$ {totalPaid.toFixed(2)}</span>
            </div>
            <div className="summary-row divider">
              <span className="label">Saldo (USD):</span>
              <span className="value">
                $ {(total_final - totalPaid).toFixed(2)}
              </span>
            </div>

            <div className="summary-status">
              <div className={`status-indicator ${getStatusClass}`}>
                {paymentStatus === "completed" && (
                  <>
                    <MdCheckCircle className="status-icon" />
                    <span className="status-text">Pago Completo</span>
                  </>
                )}
                {paymentStatus === "partial" && (
                  <>
                    <MdPayment className="status-icon" />
                    <span className="status-text">Pago Parcial</span>
                  </>
                )}
                {paymentStatus === "pending" && (
                  <>
                    <MdErrorOutline className="status-icon" />
                    <span className="status-text">Pendiente de Pago</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* NOTA: La conversión de moneda ahora se maneja por movimiento individual en MovimientoForm */}

      {errors.length > 0 && (
        <div className="payment-errors">
          {errors.map((error, index) => (
            <div key={index} className="error-message">
              <MdErrorOutline /> {error}
            </div>
          ))}
        </div>
      )}

      {preLiquidacionSchedule.length > 0 && (
        <section className="preliquidacion-payment-plan">
          <div className="preliquidacion-payment-plan__head">
            <div><strong>Preliquidación · Plan de pagos del pax</strong><span>Programado no significa cobrado. El pago solo se contabiliza al registrar el movimiento.</span></div>
          </div>
          <div className="preliquidacion-payment-plan__grid">
            {preLiquidacionSchedule.map((scheduledPayment) => {
              const registered = registeredPreLiquidacionPaymentIds.has(String(scheduledPayment.id));
              return (
                <article key={scheduledPayment.id} className={`preliquidacion-payment-plan__card ${registered ? "is-registered" : ""}`}>
                  <div><strong>{formatCurrency(scheduledPayment.amount, scheduledPayment.currency)}</strong><span>{scheduledPayment.dueDate || "Sin vencimiento"}</span></div>
                  <small>{scheduledPayment.method || "Método por definir"}{scheduledPayment.notes ? ` · ${scheduledPayment.notes}` : ""}</small>
                  <button type="button" disabled={registered} onClick={() => openScheduledPayment(scheduledPayment)}>
                    {registered ? "Pago registrado" : "Registrar este pago"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <div className="payments-container">
        <div className="payments-header">
          <h3>Pagos Registrados</h3>
          <div className="payment-buttons">
            {PAYABLE_SERVICE_TYPES.map((type) => {
              const groups = payableServicesByType[type] || [];
              if (groups.length === 0) return null;

              const status = servicePaymentStatuses[type] || "available";
              const label = getServiceTypeLabel(type);
              const buttonText =
                status === "paid"
                  ? `${label} pagados`
                  : status === "pending"
                    ? `${label}: pago pendiente`
                    : status === "assigned"
                      ? `Pagar ${label}`
                      : `Pagar ${label}`;

              return (
                <button
                  key={type}
                  className={`flight-payment-button status-${status}`}
                  onClick={() => {
                    setSelectedPaymentServiceType(type);
                    setShowFlightPaymentModal(true);
                  }}
                  title={buttonText}
                >
                  {getServiceTypeIcon(type)} {buttonText}
                </button>
              );
            })}
            <button
              className="add-payment-button"
              onClick={openAddPaymentModal}
              disabled={remainingAmount <= 0 && total_final > 0}
              title={
                remainingAmount <= 0 && total_final > 0
                  ? "El pago está completo"
                  : "Añadir nuevo pago"
              }
            >
              <MdAdd /> Nuevo Pago
            </button>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="no-payments">
            <MdReceipt className="no-payments-icon" />
            <p>No hay pagos registrados</p>
            <button
              className="no-payments-button"
              onClick={openAddPaymentModal}
            >
              <MdAdd /> Registrar Pago
            </button>
          </div>
        ) : (
          <div className="payments-cards-grid">
            {payments.map((payment, index) => (
              <div
                key={payment.id || index}
                className={`payment-card ${payment.isFromDatabase ? "from-db" : "new"}`}
              >
                <div className="payment-card-header">
                  <div className="payment-method-icon">
                    {getPaymentMethodIcon(payment.method)}
                  </div>
                  <div className="payment-card-title">
                    <h4>
                      {payment.descripcion ||
                        payment.description ||
                        getPaymentMethodLabel(payment.method)}
                      <span
                        className={`currency-badge ${(payment.moneda || "USD").toLowerCase()}`}
                      >
                        {payment.moneda || "USD"}
                      </span>
                    </h4>
                    <span className="payment-date">
                      <MdCalendarToday /> {formatDate(payment.date)}
                    </span>
                  </div>
                </div>

                <div className="payment-card-body">
                  <div className="payment-amount">
                    <span className="amount-label">Monto</span>
                    <span className="amount-value">
                      {formatCurrency(
                        payment.amount,
                        payment.moneda || payment.currency || "USD",
                      )}
                      {payment.moneda &&
                        payment.moneda !== "USD" &&
                        payment.tipo_cambio && (
                          <span
                            className="currency-conversion-hint"
                            title={`Tipo de cambio: ${payment.tipo_cambio}`}
                          >
                            {" "}
                            (≈{" "}
                            {formatCurrency(
                              payment.amount / parseFloat(payment.tipo_cambio),
                              "USD",
                            )}
                            )
                          </span>
                        )}
                    </span>
                  </div>

                  {payment.reference && (
                    <div className="payment-detail">
                      <span className="detail-label">Referencia:</span>
                      <span className="detail-value">{payment.reference}</span>
                    </div>
                  )}

                  {payment.payer && (
                    <div className="payment-detail">
                      <span className="detail-label">Pagado por:</span>
                      <span className="detail-value">{payment.payer}</span>
                    </div>
                  )}

                  {payment.receiver && (
                    <div className="payment-detail">
                      <span className="detail-label">Recibido por:</span>
                      <span className="detail-value">{payment.receiver}</span>
                    </div>
                  )}

                  {payment.notes && (
                    <div className="payment-notes">
                      <span className="notes-label">Notas:</span>
                      <p className="notes-text">{payment.notes}</p>
                    </div>
                  )}

                  {payment.evidencia && (
                    <div className="payment-evidencia">
                      <MdReceipt className="evidencia-icon" />
                      <span>Tiene comprobante adjunto</span>
                    </div>
                  )}
                </div>

                <div className="payment-card-footer">
                  {payment.isFromDatabase && (
                    <span className="from-db-badge">
                      <MdCheckCircle /> Registrado en contabilidad
                    </span>
                  )}
                  <div className="payment-card-actions">
                    <button
                      className="action-button preview"
                      onClick={() => handlePreviewPayment(payment)}
                      title="Ver detalles"
                    >
                      <MdVisibility />
                    </button>
                    <button
                      className="action-button edit"
                      onClick={() => openEditPaymentModal(payment, index)}
                      title="Editar pago"
                    >
                      <MdEdit />
                    </button>
                    <button
                      className="action-button delete"
                      onClick={() =>
                        handleDeletePayment(
                          payment.id,
                          payment.isFromDatabase,
                          payment.dbId,
                        )
                      }
                      title="Eliminar pago"
                    >
                      <MdDelete />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabla de respaldo (oculta por defecto, se puede activar para exportar) */}
        <div className="payments-table-wrapper" style={{ display: "none" }}>
          <table className="payments-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Método</th>
                <th>Monto</th>
                <th>Referencia</th>
                <th>Observación</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="payment-row">
                  <td className="payment-date">
                    <div className="cell-content">
                      <MdCalendarToday className="cell-icon" />
                      <span>{formatDate(payment.date)}</span>
                    </div>
                  </td>
                  <td className="payment-method">
                    <div className="cell-content">
                      {getPaymentMethodIcon(payment.method)}
                      <span>{payment.method}</span>
                    </div>
                  </td>
                  <td className="payment-amount">
                    {formatCurrency(payment.amount)}
                  </td>
                  <td className="payment-reference">
                    {payment.reference || <span className="no-data">--</span>}
                  </td>
                  <td className="payment-notes">
                    {payment.notes || <span className="no-data">--</span>}
                  </td>
                  <td className="payment-actions">
                    <button
                      className="edit-button"
                      onClick={() => openEditPaymentModal(payment)}
                    >
                      <MdEdit />
                    </button>
                    <button
                      className="delete-button"
                      onClick={() =>
                        handleDeletePayment(
                          payment.id,
                          payment.isFromDatabase,
                          payment.dbId,
                        )
                      }
                    >
                      <MdDelete />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Movimiento Form - Reemplaza PaymentModal */}
      {showMovimientoForm && (
        <MovimientoForm
          tipo="ingreso"
          isOpen={showMovimientoForm}
          onClose={handleClosePaymentModal}
          onSuccess={handleMovimientoSuccess}
          initialData={movimientoInitialData}
          mode={editingPayment ? "edit" : "create"}
          monedaBase="dolares" // Los vouchers de venta usan USD como moneda base
        />
      )}

      {/* Preview Modal - usando MovimientoPreviewModal */}
      {showPreviewModal && previewPayment && (
        <MovimientoPreviewModal
          isOpen={showPreviewModal}
          onClose={closePreviewModal}
          movimiento={previewPayment}
        />
      )}

      {/* Service Payment Modal: vuelos, trenes y tickets */}
      {showFlightPaymentModal &&
        (payableServicesByType[selectedPaymentServiceType] || []).length >
          0 && (
          <FlightPaymentModal
            isOpen={showFlightPaymentModal}
            onClose={() => setShowFlightPaymentModal(false)}
            flightsByDay={payableServicesByType[selectedPaymentServiceType]}
            servicesByDay={payableServicesByType[selectedPaymentServiceType]}
            serviceType={selectedPaymentServiceType}
            cotizacionData={cotizacionData}
            passengerData={passengerData}
            voucherId={voucherId}
            voucherCode={voucherCode}
            onPaymentSuccess={async () => {
              await loadMovimientosFromDatabase();
              if (voucherId) {
                try {
                  const itinerary =
                    await voucherReservaService.getItinerarioByVoucherVenta(
                      voucherId,
                    );
                  setReservationItinerary(parseJsonArray(itinerary));
                } catch (error) {
                  console.error("Error refrescando itinerario:", error);
                }
              }
            }}
          />
        )}
    </div>
  );
};

// Export with React.memo to prevent unnecessary re-renders
export default React.memo(PaymentStep);
