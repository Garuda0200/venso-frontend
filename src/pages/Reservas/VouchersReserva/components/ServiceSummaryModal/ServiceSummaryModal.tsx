import { useState, useEffect } from "react";
import Modal from "../../../../../components/UI/Modal/Modal";
import {
  MdCalendarToday,
  MdWarning,
  MdPrint,
  MdCheckCircle,
  MdPending,
  MdVisibility,
  MdSchedule,
  MdReceipt,
} from "react-icons/md";
import ServiceDetailedInfo from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/components/ServiceDetailedInfo/ServiceDetailedInfo";
import MovimientoPreviewModal from "../../../../../components/Contabilidad/MovimientoPreviewModal";
import VentasSummaryModal from "../../../../Ventas/VouchersVenta/components/VentasSummaryModal/VentasSummaryModal";
import "./ServiceSummaryModal.scss";
import { useVoucherReservaWithRelations } from "../../../../../hooks/useVouchersReserva";
import { voucherVentaService } from "../../../../../services/voucherVentaService";
import { movimientoService } from "../../../../../services/movimientoService";
import { invalidateReservaAssignmentGraphCache } from "../../../../../utils/cacheInvalidation";
import { getAssignedTariff } from "../../utils/serviceAssignment";
import { useAuth } from "../../../../../context/AuthContext";
import SecureStorage from "../../../../../utils/secureStorage";

// Helper function to format currency
const formatCurrency = (amount) => {
  if (amount === undefined || amount === null) return "$0.00";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

// Helper function to format date
const formatDate = (dateString) => {
  if (!dateString) return "N/A";

  return new Date(dateString).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const ServiceSummaryModal = ({
  isOpen,
  onClose,
  reservationVoucher,
  userRole: userRoleProp,
}) => {
  const { user, auth } = useAuth();
  const [cotizacionItinerary, setCotizacionItinerary] = useState([]);
  const [summaryData, setSummaryData] = useState({
    totalServices: 0,
    totalAdditionalCost: 0,
    profitAmount: 0,
    profitPercentage: 0,
    servicesByDay: [],
  });

  // Estados para payment requests y evidencia
  const [paymentRequests, setPaymentRequests] = useState({});
  const [showMovimientoPreview, setShowMovimientoPreview] = useState(false);
  const [selectedMovimiento, setSelectedMovimiento] = useState(null);
  const [loadingMovimiento, setLoadingMovimiento] = useState(false);

  // Estados para VentasSummaryModal
  const [showVentasSummary, setShowVentasSummary] = useState(false);
  const [voucherVentaData, setVoucherVentaData] = useState(null);
  const [loadingVoucherVenta, setLoadingVoucherVenta] = useState(false);
  const rawRole =
    user?.role !== undefined
      ? user.role
      : auth?.role !== undefined
        ? auth.role
        : userRoleProp !== undefined
          ? userRoleProp
          : SecureStorage.getItem("userRole");
  const normalizedUserRole =
    typeof rawRole === "string" ? parseInt(rawRole, 10) : Number(rawRole);
  const showFinancialDetails = normalizedUserRole !== 2;

  // Usar TanStack Query para obtener el voucher con relaciones (con caché)
  const {
    data: voucherData,
    isLoading,
    error: queryError,
    isSuccess,
    refetch,
  } = useVoucherReservaWithRelations(reservationVoucher?.id, {
    enabled: isOpen && !!reservationVoucher?.id,
    refetchOnWindowFocus: true, // Refetch al volver para datos frescos
    staleTime: 1000 * 60 * 20, // 20 minutos en caché
  });

  useEffect(() => {
    if (!isOpen || !reservationVoucher?.id) return;

    const handlePaymentRequestUpdate = async (event) => {
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

      const voucherReservaId = normalizeValue(reservationVoucher?.id);
      const voucherCodes = new Set(
        [reservationVoucher?.voucher_code, reservationVoucher?.voucherCode]
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

      if (!isForThisVoucher) return;

      invalidateReservaAssignmentGraphCache();
      await refetch();
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
  }, [
    isOpen,
    refetch,
    reservationVoucher?.id,
    reservationVoucher?.voucher_code,
  ]);

  // Procesar datos cuando se obtienen exitosamente
  useEffect(() => {
    if (isSuccess && voucherData) {
      const data = voucherData.data || voucherData;

      // Extraer cotización del response
      const cotizacionData = data.cotizacion_data;
      if (cotizacionData && cotizacionData.itinerario) {
        setCotizacionItinerary(cotizacionData.itinerario);
      }

      // Procesar datos para el resumen
      const processableData = {
        ...data,
        assigned_itinerary: data.assigned_itinerary || [],
        cotizacion_itinerary: cotizacionData?.itinerario || [],
      };

      processReservationData(processableData);

      // Extraer payment requests directamente del itinerario enriquecido (ya vienen del with-relations)
      extractPaymentRequestsFromItinerary(data);
    }
  }, [isSuccess, voucherData]);

  // Extraer payment requests desde el itinerario enriquecido (sin API call adicional)
  const extractPaymentRequestsFromItinerary = (data) => {
    const itinerary = data.assigned_itinerary || [];
    const requests = {};

    for (let dayIndex = 0; dayIndex < itinerary.length; dayIndex++) {
      const day = itinerary[dayIndex];
      if (!day.servicios || !Array.isArray(day.servicios)) continue;

      for (
        let serviceIndex = 0;
        serviceIndex < day.servicios.length;
        serviceIndex++
      ) {
        const service = day.servicios[serviceIndex];
        if (!service.isAssigned) continue;

        // El backend with-relations ya enriquece cada servicio con paymentRequest
        if (service.paymentRequest && service.paymentRequest.id) {
          const key = `${dayIndex}-${serviceIndex}`;
          requests[key] = service.paymentRequest;
        }
      }
    }

    setPaymentRequests(requests);
  };

  // Función para ver evidencia de pago — abre MovimientoPreviewModal
  const handleViewEvidence = async (paymentRequest) => {
    setLoadingMovimiento(true);
    try {
      let movimiento = paymentRequest?.movimiento || null;

      if (!movimiento && paymentRequest?.movimiento_id) {
        movimiento = {
          id: paymentRequest.movimiento_id,
          monto: paymentRequest.payment_amount || paymentRequest.amount || 0,
          moneda: paymentRequest.currency || paymentRequest.moneda || "PEN",
          descripcion: paymentRequest.observaciones || "Pago de servicio",
          fecha_movimiento:
            paymentRequest.paid_at ||
            paymentRequest.updated_at ||
            paymentRequest.created_at ||
            null,
          contexto_pago: {
            payment_request_id: paymentRequest.id,
            tipo: "ServiciosVoucherReserva",
          },
        };
      }

      if (!movimiento) {
        const result = await movimientoService.getByPaymentRequestId(
          paymentRequest.id,
        );
        if (result.success && result.data && result.data.length > 0) {
          movimiento = result.data[0];
        }
      }

      if (movimiento) {
        setSelectedMovimiento(movimiento);
        setShowMovimientoPreview(true);
      } else {
        console.warn("No se encontraron evidencias de pago para este servicio");
      }
    } catch (error) {
      console.error("Error al cargar evidencias:", error);
    } finally {
      setLoadingMovimiento(false);
    }
  };

  // Función para obtener el estado de pago de un servicio
  const getPaymentStatus = (dayIndex, serviceIndex) => {
    const key = `${dayIndex}-${serviceIndex}`;
    const paymentRequest = paymentRequests[key];

    if (!paymentRequest) {
      return { status: "no-request", text: "Sin solicitud", icon: null };
    }

    if (paymentRequest.status === "paid") {
      return {
        status: "paid",
        text: "Pagado",
        icon: <MdCheckCircle />,
        paymentRequest,
      };
    }

    return {
      status: "pending",
      text: "Pendiente",
      icon: <MdPending />,
      paymentRequest,
    };
  };

  // Función para abrir el modal de ventas
  const handleOpenVentasSummary = async () => {
    if (!voucherData?.referencia_voucher_venta) {
      console.warn("No hay referencia a voucher de venta");
      return;
    }

    setLoadingVoucherVenta(true);
    try {
      const response = await voucherVentaService.getVoucher(
        voucherData.referencia_voucher_venta,
      );
      setVoucherVentaData(response.data);
      setShowVentasSummary(true);
    } catch (error) {
      console.error("Error cargando voucher de venta:", error);
    } finally {
      setLoadingVoucherVenta(false);
    }
  };

  // Process reservation data for summary - OPTIMIZADO para nueva estructura
  const processReservationData = (reservationData) => {
    try {
      // Extract the itinerary from the reservation voucher - handle both camelCase and snake_case
      const assignedItinerary =
        reservationData.assigned_itinerary ||
        reservationData.assignedItinerary ||
        reservationData.itinerario ||
        [];

      const cotizacionItinerary =
        reservationData.cotizacion_itinerary ||
        reservationData.cotizacionItinerary ||
        [];

      if (!Array.isArray(assignedItinerary) || assignedItinerary.length === 0) {
        throw new Error("El itinerario asignado está vacío o no es válido");
      }

      // Calculate summary data from the itinerary
      let totalExternalServices = 0;
      let totalInternalServices = 0;

      // Process each day's services
      const servicesByDay = assignedItinerary.map((day, dayIndex) => {
        if (!day.servicios || !Array.isArray(day.servicios)) {
          console.warn(`Day ${dayIndex} has no valid services array:`, day);
          return {
            dayNumber: day.numero || dayIndex + 1,
            title: day.titulo || `Día ${day.numero || dayIndex + 1}`,
            dailyExternalTotal: 0,
            dailyInternalTotal: 0,
            dailyProfit: 0,
            services: [],
          };
        }

        // Obtener servicios de cotización del día correspondiente
        const cotizacionDayServices =
          cotizacionItinerary[dayIndex]?.servicios || [];

        let dailyExternalTotal = 0;
        let dailyInternalTotal = 0;

        // Calculate totals for each service
        // IMPORTANTE: Preservar el índice original para el match con payment_requests
        // MODIFICADO: Mostrar TODOS los servicios (asignados y no asignados)
        const services = day.servicios
          .map((service, originalServiceIndex) => ({
            service,
            originalServiceIndex,
          })) // Guardar índice original
          .filter((item) => item.service) // Solo filtrar servicios nulos, mostrar todos (asignados y no asignados)
          .map(({ service, originalServiceIndex }) => {
            // Usar originalServiceIndex para match con payment_requests
            // IMPORTANTE: Buscar el servicio correspondiente en la cotización
            // usando cotizacionServiceRef o el índice del servicio
            let cotizacionService = null;

            // CORREGIDO: Verificar que cotizacionServiceRef tenga datos válidos (no sea objeto vacío)
            const cotizacionRef = service.cotizacionServiceRef;
            const hasValidCotizacionRef =
              cotizacionRef &&
              (cotizacionRef.typeService ||
                cotizacionRef.serviceIndex !== undefined);

            if (hasValidCotizacionRef) {
              // Buscar por ID de servicio o usar el serviceIndex guardado
              const serviceId = cotizacionRef.id;
              const typeService = cotizacionRef.typeService;
              const refServiceIndex = cotizacionRef.serviceIndex;

              // Primero intentar buscar por ID específico
              if (serviceId && typeService) {
                cotizacionService = cotizacionDayServices.find((cs) => {
                  // Comparar por ID según el tipo de servicio
                  if (typeService === "hoteles") {
                    return cs.childService?.id_hotel === serviceId;
                  } else if (typeService === "trenes") {
                    return cs.childService?.id_tren === serviceId;
                  } else if (typeService === "restaurantes") {
                    return cs.childService?.id_restaurante === serviceId;
                  } else if (typeService === "transportes") {
                    return cs.childService?.id_transporte === serviceId;
                  } else if (typeService === "guias") {
                    return cs.childService?.id_guia === serviceId;
                  } else if (typeService === "tickets") {
                    return cs.childService?.id_ticket === serviceId;
                  } else if (typeService === "endoses") {
                    return cs.childService?.id_endose === serviceId;
                  } else if (typeService === "vuelos") {
                    return (
                      cs.childService?.id_vuelo === serviceId ||
                      cs.parentService?.id_vuelo === serviceId
                    );
                  }
                  return false;
                });
              }

              // Si no encontramos por ID, usar el serviceIndex guardado en cotizacionRef
              if (
                !cotizacionService &&
                refServiceIndex !== undefined &&
                cotizacionDayServices[refServiceIndex]
              ) {
                cotizacionService = cotizacionDayServices[refServiceIndex];
              }
            }

            // Buscar por typeService del servicio (normalizado)
            if (!cotizacionService && service.typeService) {
              const assignedType = service.typeService;
              // Buscar un servicio de cotización del mismo tipo en el mismo índice
              const cotizSvc = cotizacionDayServices[originalServiceIndex];
              if (
                cotizSvc &&
                cotizSvc.parentService?.typeService === assignedType
              ) {
                cotizacionService = cotizSvc;
              }
            }

            // Para servicios NO asignados, buscar por índice o usar cotizacionServiceRef.originalData
            if (!cotizacionService && !service.isAssigned) {
              // Primero intentar usar originalData de cotizacionServiceRef
              if (service.cotizacionServiceRef?.originalData) {
                cotizacionService = service.cotizacionServiceRef.originalData;
              }
              // Si no, usar el índice en cotizacionDayServices
              else if (cotizacionDayServices[originalServiceIndex]) {
                cotizacionService = cotizacionDayServices[originalServiceIndex];
              }
            }

            // Si no encontramos por referencia, usar el mismo índice
            if (
              !cotizacionService &&
              cotizacionDayServices[originalServiceIndex]
            ) {
              cotizacionService = cotizacionDayServices[originalServiceIndex];
            }

            // ── Precio externo (cotización) — usa campos planos igual que SummaryContent ──
            const extSrc = cotizacionService || service;
            const extPrecioServicio = parseFloat(
              extSrc?.precioServicio ?? extSrc?.tariff?.precio ?? 0,
            );
            const extPrecioTotal = parseFloat(
              extSrc?.precioTotal ??
                extSrc?.tariff?.precio_original ??
                extSrc?.tariff?.precio ??
                0,
            );
            const extPrecioAdultoDividido = Boolean(
              extSrc?.precioAdultoDividido,
            );
            const extAdultos = Array.isArray(extSrc?.beneficiariosAdultos)
              ? extSrc.beneficiariosAdultos
              : [];
            const extNinos = Array.isArray(extSrc?.beneficiariosNinos)
              ? extSrc.beneficiariosNinos
              : [];
            const extDivisor = Math.max(1, extAdultos.length || 1);
            const extChildExtrasTotal = extNinos.reduce(
              (s, c) => s + (parseFloat(c?.precio || 0) || 0),
              0,
            );

            let externalPricePerAdult, externalPriceTotal;
            if (extPrecioTotal > 0) {
              externalPriceTotal = extPrecioTotal + extChildExtrasTotal;
              externalPricePerAdult = extPrecioAdultoDividido
                ? extPrecioTotal / extDivisor
                : extPrecioServicio;
            } else if (extPrecioServicio > 0) {
              externalPricePerAdult = extPrecioAdultoDividido
                ? extPrecioServicio / extDivisor
                : extPrecioServicio;
              const extBase = extPrecioAdultoDividido
                ? extPrecioServicio
                : extPrecioServicio * extDivisor;
              externalPriceTotal = extBase + extChildExtrasTotal;
            } else {
              externalPricePerAdult = 0;
              externalPriceTotal = 0;
            }

            const extExplicitChildCount = extNinos.length;
            const extConvertedChildCount = 0;
            const extChildPricePerChild =
              extNinos.length > 0 && extChildExtrasTotal > 0
                ? extChildExtrasTotal / extNinos.length
                : 0;

            // ── Precio interno (asignado) — via getAssignedTariff (campos planos assigned*) ──
            const assignedTariff = service.isAssigned
              ? getAssignedTariff(service)
              : null;
            const internalPricePerAdult = parseFloat(
              assignedTariff?.precio || 0,
            );
            const internalPriceTotal = parseFloat(
              assignedTariff?.precio_original_with_child_extras ??
                assignedTariff?.precio_original ??
                assignedTariff?.precio ??
                0,
            );
            const intNinos = Array.isArray(service.assignedBeneficiariosNinos)
              ? service.assignedBeneficiariosNinos
              : Array.isArray(service.assigned_beneficiarios_ninos)
                ? service.assigned_beneficiarios_ninos
                : [];
            const intChildExtrasTotal = parseFloat(
              assignedTariff?.childExtrasTotal || 0,
            );
            const intExplicitChildCount = intNinos.length;
            const intConvertedChildCount = 0;
            const intChildPricePerChild =
              intNinos.length > 0 && intChildExtrasTotal > 0
                ? intChildExtrasTotal / intNinos.length
                : 0;

            const externalTotal = externalPriceTotal;
            const internalTotal = internalPriceTotal;

            dailyExternalTotal += externalTotal;
            dailyInternalTotal += internalTotal;

            // Get service names
            let externalName = "Servicio";
            if (service.isCustomService) {
              externalName =
                service.parentService?.nombre || "Servicio personalizado";
            } else {
              // Mapear nombres según tipo de servicio
              const typeService =
                service.cotizacionServiceRef?.typeService ||
                service.parentService?.typeService;
              if (typeService === "hoteles") {
                externalName = service.parentService?.nombre || "Hotel";
              } else if (typeService === "trenes") {
                externalName = service.parentService?.nombre_empresa || "Tren";
              } else if (typeService === "restaurantes") {
                externalName = service.parentService?.nombre || "Restaurante";
              } else if (typeService === "transportes") {
                externalName =
                  service.parentService?.nombre_transporte || "Transporte";
              } else if (typeService === "guias") {
                externalName =
                  service.childService?.ruta?.tour_nombre || "Guía";
              } else if (typeService === "tickets") {
                externalName =
                  service.childService?.ticket?.entrada || "Ticket";
              } else if (typeService === "endoses") {
                externalName = service.parentService?.tipo_tour || "Endose";
              }
            }

            let internalName = "Servicio interno";
            const assignedParent = service.assignedParentService;
            const assignedChild = service.assignedChildService;
            if (service.isAssigned && (assignedParent || assignedChild)) {
              const internalType = service.typeService;
              if (internalType === "hoteles") {
                internalName = assignedParent?.nombre || "Hotel";
              } else if (internalType === "trenes") {
                internalName = assignedParent?.nombre_empresa || "Tren";
              } else if (internalType === "restaurantes") {
                internalName =
                  assignedChild?.restaurante?.nombre ||
                  assignedChild?.nombre ||
                  "Restaurante";
              } else if (internalType === "transportes") {
                internalName =
                  assignedParent?.nombre_transporte || "Transporte";
              } else if (internalType === "guias") {
                internalName =
                  assignedChild?.ruta?.tour_nombre ||
                  assignedParent?.persona?.nombres ||
                  "Guía";
              } else if (internalType === "tickets") {
                internalName = assignedChild?.ticket?.entrada || "Ticket";
              } else if (internalType === "endoses") {
                internalName = assignedParent?.tipo_tour || "Endose";
              }
            }

            // Return processed service data
            return {
              // IMPORTANTE: Guardar el índice original para el match con payment_requests
              originalServiceIndex,
              // Estado de asignación del servicio
              isAssigned: !!service.isAssigned,
              // Servicio original de cotización (para ServiceDetailedInfo)
              externalServiceData: cotizacionService
                ? {
                    parentService: cotizacionService.parentService,
                    childService: cotizacionService.childService,
                    tariff: cotizacionService.tariff,
                    typeService: cotizacionService.parentService?.typeService,
                  }
                : {
                    parentService: service.parentService,
                    childService: service.childService,
                    tariff: service.tariff,
                    typeService:
                      service.cotizacionServiceRef?.typeService ||
                      service.parentService?.typeService,
                  },
              // Servicio asignado (para ServiceDetailedInfo) — estructura normalizada
              internalServiceData:
                service.isAssigned &&
                (service.assignedParentService || service.assignedChildService)
                  ? {
                      parentService: service.assignedParentService,
                      childService: service.assignedChildService,
                      tariff: service.assignedTariff || service.tariff,
                      typeService: service.typeService,
                      hora: service.hora, // Hora del servicio
                    }
                  : null,
              // Datos de precio y ganancia
              externalService: {
                name: externalName,
                pricePerAdult: externalPricePerAdult,
                childPricePerChild: extChildPricePerChild,
                explicitChildCount: extExplicitChildCount,
                convertedChildCount: extConvertedChildCount,
                priceTotal: externalPriceTotal,
                total: externalTotal,
              },
              internalService:
                service.isAssigned &&
                (service.assignedParentService || service.assignedChildService)
                  ? {
                      name: internalName,
                      pricePerAdult: internalPricePerAdult,
                      childPricePerChild: intChildPricePerChild,
                      explicitChildCount: intExplicitChildCount,
                      convertedChildCount: intConvertedChildCount,
                      priceTotal: internalPriceTotal,
                      total: internalTotal,
                    }
                  : null,
              profit: externalTotal - internalTotal, // Ganancia = Cotización total - Servicio asignado total
            };
          });

        totalExternalServices += dailyExternalTotal;
        totalInternalServices += dailyInternalTotal;

        return {
          dayNumber: day.numero || dayIndex + 1,
          title: day.titulo || `Día ${day.numero || dayIndex + 1}`,
          dailyExternalTotal,
          dailyInternalTotal,
          dailyProfit: dailyExternalTotal - dailyInternalTotal,
          services,
        };
      });

      // Calculate overall profit
      const profitAmount = totalExternalServices - totalInternalServices;
      const profitPercentage =
        totalExternalServices > 0
          ? (profitAmount / totalExternalServices) * 100
          : 0;

      // Update state with calculated data
      setSummaryData({
        totalExternalServices,
        totalInternalServices,
        profitAmount,
        profitPercentage,
        servicesByDay,
      });
    } catch (err) {
      console.error("Error calculating summary data:", err);
      // El error se mostrará a través del queryError del hook
    }
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="service-summary-modal-wrapper">
        <Modal
          isOpen={isOpen}
          onClose={onClose}
          title="Resumen de Servicios"
          size="large"
          className="service-summary-modal"
        >
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Cargando resumen de servicios...</p>
          </div>
        </Modal>
      </div>
    );
  }

  // Render error state
  if (queryError) {
    return (
      <div className="service-summary-modal-wrapper">
        <Modal
          isOpen={isOpen}
          onClose={onClose}
          title="Resumen de Servicios"
          size="large"
          className="service-summary-modal"
        >
          <div className="error-container">
            <MdWarning size={48} color="#dc3545" />
            <p>{queryError?.message || "Error al cargar los datos"}</p>
            <button onClick={onClose} className="btn-close">
              Cerrar
            </button>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="service-summary-modal-wrapper">
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Resumen de Servicios - ${reservationVoucher?.voucherCode || "Voucher"}`}
        size="large"
        className="service-summary-modal"
        actions={[
          {
            label: "Cerrar",
            onClick: onClose,
            variant: "secondary",
          },
          {
            label: "Imprimir Resumen",
            onClick: () => window.print(),
            variant: "primary",
            icon: <MdPrint />,
          },
        ]}
      >
        <div className="summary-content" id="printable-summary">
          <div className="summary-header">
            <div className="voucher-details">
              <h3>Detalles del Voucher</h3>
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="label">File:</span>
                  <span className="value">
                    {reservationVoucher?.voucherId ||
                      reservationVoucher?.voucher_id ||
                      "N/A"}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="label">Creado el:</span>
                  <span className="value">
                    {formatDate(reservationVoucher?.createdAt)}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="label">Cliente:</span>
                  <span className="value">
                    {reservationVoucher?.clientName || "No especificado"}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="label">Estado:</span>
                  <span className="value status-badge">
                    {reservationVoucher?.status || "Activo"}
                  </span>
                </div>
                {voucherData?.referencia_voucher_venta && (
                  <div className="detail-item full-width">
                    <button
                      className="btn-view-ventas-summary"
                      onClick={handleOpenVentasSummary}
                      disabled={loadingVoucherVenta}
                    >
                      <MdReceipt />
                      {loadingVoucherVenta
                        ? "Cargando..."
                        : "Ver file"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {showFinancialDetails && (
              <div className="financial-summary">
                <h3>Resumen Financiero</h3>
                <div className="financial-grid">
                  <div className="financial-item">
                    <span className="label">Total Ventas:</span>
                    <span className="value positive">
                      {formatCurrency(summaryData.totalExternalServices)}
                    </span>
                  </div>
                  <div className="financial-item">
                    <span className="label">Costo Servicios:</span>
                    <span className="value negative">
                      {formatCurrency(summaryData.totalInternalServices)}
                    </span>
                  </div>
                  <div className="financial-item profit">
                    <span className="label">Ganancia Total:</span>
                    <span
                      className={`value ${summaryData.profitAmount >= 0 ? "positive" : "negative"}`}
                    >
                      {formatCurrency(summaryData.profitAmount)}
                      <span className="percentage">
                        ({summaryData.profitPercentage.toFixed(2)}%)
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="services-breakdown">
            <h3>Desglose por Días</h3>

            {summaryData.servicesByDay.map((day, dayIndex) => (
              <div className="day-breakdown" key={`day-${dayIndex}`}>
                <div className="day-header">
                  <div className="day-title">
                    <MdCalendarToday />
                    <span>Día {day.dayNumber}</span>
                  </div>
                  {showFinancialDetails && (
                    <div className="day-totals">
                      <div className="total-item">
                        <span className="label">Venta:</span>
                        <span className="value">
                          {formatCurrency(day.dailyExternalTotal)}
                        </span>
                      </div>
                      <div className="total-item">
                        <span className="label">Costo:</span>
                        <span className="value">
                          {formatCurrency(day.dailyInternalTotal)}
                        </span>
                      </div>
                      <div className="total-item">
                        <span className="label">Ganancia:</span>
                        <span
                          className={`value ${day.dailyProfit >= 0 ? "positive" : "negative"}`}
                        >
                          {formatCurrency(day.dailyProfit)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <table className="services-table">
                  <thead>
                    <tr>
                      <th>Servicio Vendido</th>
                      {showFinancialDetails && (
                        <>
                          <th>Precio por pasajero</th>
                          <th>Total Venta</th>
                        </>
                      )}
                      <th>Servicio Asignado</th>
                      {showFinancialDetails && (
                        <>
                          <th>Costo por pasajero</th>
                          <th>Total Costo</th>
                          <th>Ganancia</th>
                        </>
                      )}
                      <th>Estado Pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.services.map((service, serviceIndex) => {
                      // IMPORTANTE: Usar originalServiceIndex para el match con payment_requests
                      const realServiceIndex =
                        service.originalServiceIndex ?? serviceIndex;
                      const paymentStatus = getPaymentStatus(
                        dayIndex,
                        realServiceIndex,
                      );

                      return (
                        <tr key={`service-${dayIndex}-${realServiceIndex}`}>
                          <td className="service-cell">
                            {service.externalServiceData && (
                              <ServiceDetailedInfo
                                service={service.externalServiceData}
                                className="summary-service-card external"
                              />
                            )}
                          </td>
                          {showFinancialDetails && (
                            <>
                          <td className="price-pax-cell">
                            <div className="price-stack">
                              <span className="price-adult">
                                {formatCurrency(
                                  service.externalService.pricePerAdult,
                                )}
                                <small>/adulto</small>
                              </span>
                              {service.externalService.childPricePerChild >
                                0 && (
                                <span className="price-child">
                                  {formatCurrency(
                                    service.externalService.childPricePerChild,
                                  )}
                                  <small>/niño</small>
                                </span>
                              )}
                              {service.externalService.convertedChildCount >
                                0 && (
                                <span className="price-converted">
                                  +{service.externalService.convertedChildCount}{" "}
                                  niño
                                  {service.externalService.convertedChildCount >
                                  1
                                    ? "s"
                                    : ""}{" "}
                                  c/a
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="price-total">
                            {formatCurrency(service.externalService.priceTotal)}
                          </td>
                            </>
                          )}
                          <td className="service-cell">
                            {service.internalServiceData ? (
                              <>
                                <ServiceDetailedInfo
                                  service={service.internalServiceData}
                                  className="summary-service-card internal"
                                />
                                {/* Mostrar hora del servicio si existe */}
                                {service.internalServiceData.hora && (
                                  <div className="service-time-display">
                                    <MdSchedule className="time-icon" />
                                    <span className="time-value">
                                      {service.internalServiceData.hora}
                                    </span>
                                  </div>
                                )}
                              </>
                            ) : (
                              <span className="no-assignment">No asignado</span>
                            )}
                          </td>
                          {showFinancialDetails && (
                            <>
                          <td className="price-pax-cell">
                            {service.internalService ? (
                              <div className="price-stack">
                                <span className="price-adult">
                                  {formatCurrency(
                                    service.internalService.pricePerAdult,
                                  )}
                                  <small>/adulto</small>
                                </span>
                                {service.internalService.childPricePerChild >
                                  0 && (
                                  <span className="price-child">
                                    {formatCurrency(
                                      service.internalService
                                        .childPricePerChild,
                                    )}
                                    <small>/niño</small>
                                  </span>
                                )}
                                {service.internalService.convertedChildCount >
                                  0 && (
                                  <span className="price-converted">
                                    +
                                    {
                                      service.internalService
                                        .convertedChildCount
                                    }{" "}
                                    niño
                                    {service.internalService
                                      .convertedChildCount > 1
                                      ? "s"
                                      : ""}{" "}
                                    c/a
                                  </span>
                                )}
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="price-total">
                            {service.internalService
                              ? formatCurrency(
                                  service.internalService.priceTotal,
                                )
                              : "-"}
                          </td>
                          <td
                            className={`profit ${service.profit >= 0 ? "positive" : "negative"}`}
                          >
                            <span className="profit-badge">
                              {formatCurrency(service.profit)}
                            </span>
                            <span className="profit-note">
                              (Cotización - Asignado)
                            </span>
                          </td>
                            </>
                          )}
                          <td className="payment-status-cell">
                            <div
                              className={`payment-status ${paymentStatus.status}`}
                            >
                              {paymentStatus.icon}
                              <span>{paymentStatus.text}</span>
                              {paymentStatus.status === "paid" &&
                                paymentStatus.paymentRequest && (
                                  <button
                                    className="btn-view-evidence"
                                    onClick={() =>
                                      handleViewEvidence(
                                        paymentStatus.paymentRequest,
                                      )
                                    }
                                    title="Ver evidencia de pago"
                                    disabled={loadingMovimiento}
                                  >
                                    <MdVisibility />
                                  </button>
                                )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {showFinancialDetails && (
                  <tfoot>
                    <tr>
                      <td colSpan="2" className="right">
                        Subtotal del Día:
                      </td>
                      <td className="price-total">
                        {formatCurrency(day.dailyExternalTotal)}
                      </td>
                      <td colSpan="2" className="right">
                        Subtotal Costos:
                      </td>
                      <td className="price-total">
                        {formatCurrency(day.dailyInternalTotal)}
                      </td>
                      <td
                        className={`profit ${day.dailyProfit >= 0 ? "positive" : "negative"}`}
                      >
                        {formatCurrency(day.dailyProfit)}
                      </td>
                    </tr>
                  </tfoot>
                  )}
                </table>
              </div>
            ))}
          </div>

          {showFinancialDetails && (
          <div className="summary-footer">
            <div className="grand-total">
              <span className="label">Ganancia Total:</span>
              <span
                className={`value ${summaryData.profitAmount >= 0 ? "positive" : "negative"}`}
              >
                {formatCurrency(summaryData.profitAmount)}
                <span className="percentage">
                  ({summaryData.profitPercentage.toFixed(2)}%)
                </span>
              </span>
            </div>
            <div className="notes">
              <p>
                Este resumen muestra la comparativa entre los servicios vendidos
                en la cotización y los servicios internos asignados.
              </p>
            </div>
          </div>
          )}
        </div>
      </Modal>

      {/* Modal de evidencia de pago — MovimientoPreviewModal */}
      {showMovimientoPreview && selectedMovimiento && (
        <div className="movimiento-preview-wrapper">
          <MovimientoPreviewModal
            isOpen={showMovimientoPreview}
            onClose={() => {
              setShowMovimientoPreview(false);
              setSelectedMovimiento(null);
            }}
            movimiento={selectedMovimiento}
          />
        </div>
      )}

      {/* Modal de resumen de voucher de venta */}
      {showVentasSummary && voucherVentaData && (
        <VentasSummaryModal
          isOpen={showVentasSummary}
          onClose={() => {
            setShowVentasSummary(false);
            setVoucherVentaData(null);
          }}
          voucher={voucherVentaData}
        />
      )}
    </div>
  );
};

export default ServiceSummaryModal;
