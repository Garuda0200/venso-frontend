import { useState, useEffect, useMemo } from "react";
import Modal from "../../../../../components/UI/Modal/Modal";
import {
  MdCalendarToday,
  MdWarning,
  MdDownload,
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
import {
  getServiceBeneficiaries,
  getServiceTariff,
} from "../../utils/serviceAssignment";
import { useAuth } from "../../../../../context/AuthContext";
import SecureStorage from "../../../../../utils/secureStorage";
import { normalizePermissions } from "../../../../../utils/permissionRoutes";
import ReservationServiceSummaryReport from "../ReservationServiceSummaryReport/ReservationServiceSummaryReport";
import { buildReservationSummaryModel } from "../../utils/reservationSummaryModel";
import { downloadReservationSummaryPdf } from "../../utils/reservationSummaryPdf";
import * as cotizacionService from "../../../../Ventas/Cotizaciones/hooks/cotizacionService";
import pasajeroService from "../../../../../services/pasajeroService";

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

const normalizeIdentifier = (value) =>
  value === undefined || value === null ? "" : String(value).trim();

const buildPeopleDetailsFromPassengers = (passengers = []) => {
  const peopleDetails = { adults: [], children: [] };

  (Array.isArray(passengers) ? passengers : []).forEach((passenger, index) => {
    const type = String(
      passenger?.tipo_pasajero ||
        passenger?.passenger_type ||
        passenger?.type ||
        "adult",
    ).toLowerCase();
    const entry = {
      ...passenger,
      id:
        passenger?.id_pasajero ||
        passenger?.id ||
        passenger?.passenger_key ||
        `${type === "child" ? "child" : "adult"}:${index}`,
      age: passenger?.edad ?? passenger?.age ?? null,
      nacionalidad: passenger?.nacionalidad || passenger?.pais || "",
    };

    if (type === "child" || type === "niño" || type === "nino") {
      peopleDetails.children.push(entry);
    } else {
      peopleDetails.adults.push(entry);
    }
  });

  return peopleDetails;
};

const ServiceSummaryModal = ({
  isOpen,
  onClose,
  reservationVoucher,
  pricingCotizacion = null,
  userRole: userRoleProp,
}) => {
  const { user, auth } = useAuth();
  const [cotizacionItinerary, setCotizacionItinerary] = useState([]);
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
  const normalizedPermissions = normalizePermissions(
    auth?.permissions || user?.permissions,
  );
  const hasReservationSummaryPermission =
    normalizedPermissions.actions.includes("download_reservation_summary");
  const canDownloadReservationSummary =
    normalizedUserRole === 0 ||
    normalizedUserRole === 3 ||
    hasReservationSummaryPermission;
  const showFinancialDetails =
    normalizedUserRole !== 2 || hasReservationSummaryPermission;
  const [downloadingPdf, setDownloadingPdf] = useState(false);

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

  const resolvedVoucherData = useMemo(
    () => voucherData?.data || voucherData || reservationVoucher || {},
    [reservationVoucher, voucherData],
  );

  // El resumen contrasta la asignación operativa en tiempo real. Al reabrirlo,
  // no debe reutilizar hasta 20 minutos de una respuesta previa, porque una
  // habitación recién asignada cambia assigned_parent_id/assigned_child_id.
  useEffect(() => {
    if (isOpen && reservationVoucher?.id) {
      refetch();
    }
  }, [isOpen, refetch, reservationVoucher?.id]);

  const relationCotizacionData = useMemo(
    () =>
      resolvedVoucherData?.cotizacion_data ||
      resolvedVoucherData?.cotizacionData ||
      resolvedVoucherData?.cotizacion ||
      reservationVoucher?.cotizacion_data ||
      reservationVoucher?.cotizacionData ||
      reservationVoucher?.cotizacion ||
      {},
    [reservationVoucher, resolvedVoucherData],
  );
  const directPricingCotizacion =
    pricingCotizacion ||
    reservationVoucher?.pricingCotizacion ||
    reservationVoucher?.pricing_cotizacion ||
    null;
  const cotizacionId = normalizeIdentifier(
    directPricingCotizacion?.id ||
      relationCotizacionData?.id ||
      resolvedVoucherData?.cotizacion_id ||
      resolvedVoucherData?.cotizacionId ||
      reservationVoucher?.cotizacion_id ||
      reservationVoucher?.cotizacionId,
  );
  const pricingSourceKey = normalizeIdentifier(
    cotizacionId || reservationVoucher?.id || "reservation-summary",
  );
  const [hydratedPricingSource, setHydratedPricingSource] = useState({
    key: "",
    data: null,
  });
  const hydratedCotizacion =
    hydratedPricingSource.key === pricingSourceKey
      ? hydratedPricingSource.data
      : null;
  const pricingSourcePending = Boolean(
    isOpen &&
      pricingSourceKey &&
      !directPricingCotizacion &&
      hydratedPricingSource.key !== pricingSourceKey,
  );

  useEffect(() => {
    if (!isOpen || !pricingSourceKey) return undefined;

    if (directPricingCotizacion) {
      setHydratedPricingSource({
        key: pricingSourceKey,
        data: directPricingCotizacion,
      });
      return undefined;
    }

    let active = true;
    const controller = new AbortController();

    const hydratePricingSource = async () => {
      let freshCotizacion = null;
      let passengers = [];

      if (cotizacionId) {
        const [cotizacionResult, passengersResult] = await Promise.allSettled([
          cotizacionService.getCotizacionById(cotizacionId, {
            skipCache: true,
            signal: controller.signal,
          }),
          pasajeroService.getPassengersByCotizacion(cotizacionId),
        ]);

        if (cotizacionResult.status === "fulfilled") {
          freshCotizacion = cotizacionResult.value;
        } else if (cotizacionResult.reason?.name !== "CanceledError") {
          console.warn(
            "No se pudo hidratar la cotización completa para el resumen de reservas:",
            cotizacionResult.reason,
          );
        }

        if (passengersResult.status === "fulfilled") {
          passengers = passengersResult.value;
        } else {
          console.warn(
            "No se pudieron hidratar los pasajeros para el resumen de reservas:",
            passengersResult.reason,
          );
        }
      }

      if (!active) return;

      const mergedCotizacion = {
        ...(relationCotizacionData || {}),
        ...(freshCotizacion || {}),
      };
      const peopleDetails =
        Array.isArray(passengers) && passengers.length > 0
          ? buildPeopleDetailsFromPassengers(passengers)
          : mergedCotizacion?.peopleDetails ||
            mergedCotizacion?.peopledetails ||
            mergedCotizacion?.people_details ||
            {};
      const adults = Array.isArray(peopleDetails?.adults)
        ? peopleDetails.adults.length
        : Number(
            mergedCotizacion?.peopleCount?.adults ??
              mergedCotizacion?.peoplecount?.adults ??
              mergedCotizacion?.num_adults ??
              mergedCotizacion?.numAdults ??
              0,
          );
      const children = Array.isArray(peopleDetails?.children)
        ? peopleDetails.children.length
        : Number(
            mergedCotizacion?.peopleCount?.children ??
              mergedCotizacion?.peoplecount?.children ??
              mergedCotizacion?.num_children ??
              mergedCotizacion?.numChildren ??
              0,
          );

      setHydratedPricingSource({
        key: pricingSourceKey,
        data: {
          ...mergedCotizacion,
          peopleDetails,
          peopledetails: peopleDetails,
          peopleCount: { adults, children },
          peoplecount: { adults, children },
          cantidadPersonas: adults + children,
        },
      });
    };

    hydratePricingSource().catch((error) => {
      if (!active || error?.name === "CanceledError") return;
      console.error(
        "No se pudo preparar la fuente comercial de la cotización:",
        error,
      );
      setHydratedPricingSource({
        key: pricingSourceKey,
        data: relationCotizacionData || {},
      });
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    cotizacionId,
    directPricingCotizacion,
    isOpen,
    pricingSourceKey,
    relationCotizacionData,
  ]);

  const reservationSummaryModel = useMemo(() => {
    const cotizacionData =
      directPricingCotizacion ||
      hydratedCotizacion ||
      relationCotizacionData ||
      {};
    return buildReservationSummaryModel({
      cotizacion: cotizacionData,
      quotedItinerary:
        cotizacionData?.itinerario ||
        resolvedVoucherData?.cotizacion_itinerary ||
        cotizacionItinerary ||
        [],
      externalQuotedItinerary:
        cotizacionData?.itinerario_externo ||
        cotizacionData?.itinerarioExterno ||
        cotizacionData?.externalItinerary ||
        resolvedVoucherData?.cotizacion_external_itinerary ||
        [],
      assignedItinerary:
        resolvedVoucherData?.assigned_itinerary ||
        resolvedVoucherData?.assignedItinerary ||
        resolvedVoucherData?.itinerario ||
        [],
      peopleDetails:
        cotizacionData?.peopleDetails ||
        cotizacionData?.peopledetails ||
        resolvedVoucherData?.peopleDetails ||
        resolvedVoucherData?.people_details ||
        {},
      reservationVoucher: {
        ...(reservationVoucher || {}),
        ...(resolvedVoucherData || {}),
      },
      fechaInicio:
        cotizacionData?.fechainicio || null,
    });
  }, [
    cotizacionItinerary,
    directPricingCotizacion,
    hydratedCotizacion,
    relationCotizacionData,
    reservationVoucher,
    resolvedVoucherData,
  ]);

  const handleDownloadSummaryPdf = async () => {
    if (!canDownloadReservationSummary || !reservationSummaryModel || downloadingPdf) {
      return;
    }

    setDownloadingPdf(true);
    try {
      const voucherCode =
        reservationVoucher?.voucherCode ||
        reservationVoucher?.voucher_code ||
        resolvedVoucherData?.voucher_code ||
        resolvedVoucherData?.id ||
        "voucher_reserva";
      await downloadReservationSummaryPdf({
        model: reservationSummaryModel,
        filename: `${voucherCode}_itinerario_costos`,
        showAssignedCosts: showFinancialDetails,
      });
    } catch (error) {
      console.error("No se pudo descargar el resumen de reserva:", error);
    } finally {
      setDownloadingPdf(false);
    }
  };

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

  // Render loading state
  if (isLoading || pricingSourcePending) {
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
          ...(canDownloadReservationSummary
            ? [
                {
                  label: downloadingPdf ? "Generando PDF..." : "Descargar PDF",
                  onClick: handleDownloadSummaryPdf,
                  variant: "primary",
                  icon: <MdDownload />,
                  disabled: downloadingPdf,
                },
              ]
            : []),
        ]}
      >
        <div id="printable-summary">
          <ReservationServiceSummaryReport
            model={reservationSummaryModel}
            showAssignedCosts={showFinancialDetails}
            showOperationalMetadata
            onViewEvidence={handleViewEvidence}
          />
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
