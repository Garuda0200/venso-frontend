import React, { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "react-toastify";
import {
  FaTimes,
  FaClock,
  FaExclamationTriangle,
  FaCheckCircle,
  FaInfoCircle,
  FaFileAlt,
  FaSearch,
} from "react-icons/fa";
import { format, isPast, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import axiosInstance, { invalidateGetCache } from "../../utils/axiosInstance";
import { voucherVentaService } from "../../services/voucherVentaService";
import {
  normalizePaymentServiceData,
  resolveFacturacionFromServiceData,
} from "../../utils/paymentFacturacion";
import {
  formatPendingPaymentAmount,
  matchesPendingPaymentSearch,
  resolvePendingPaymentAssignment,
} from "../../utils/pendingPayments";
import "./PendingPaymentsModal.scss";
import ServiceDetailedInfo from "../Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/components/ServiceDetailedInfo/ServiceDetailedInfo";

/**
 * Genera una descripción de pago basada en el tipo de servicio y datos del parentService
 * @param {object} serviceData - Los datos del servicio del payment_request
 * @param {string} voucherCode - El código del voucher como fallback
 * @returns {string} - Descripción formateada del pago
 */
const generatePaymentDescription = (serviceData, voucherCode) => {
  const normalizedServiceData = normalizePaymentServiceData(serviceData);

  // Si no hay service_data, usar el formato antiguo
  if (!normalizedServiceData) {
    return `Pago de servicio del file ${voucherCode || "Sin código"}`;
  }

  const parentService = normalizedServiceData.parentService || {};
  const childService = normalizedServiceData.childService || {};
  const childEntity =
    childService?.servicio_extra ||
    childService?.ticket ||
    childService?.restaurante ||
    childService;
  const typeService = String(
    normalizedServiceData.typeService || parentService?.typeService || "",
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
    parentService.nombre ||
    childEntity?.nombre ||
    childEntity?.entrada ||
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

const PendingPaymentsModal = ({ isOpen, onClose, onPaymentSelect }) => {
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // 'all', 'urgent', 'normal'
  const [searchQuery, setSearchQuery] = useState("");

  const loadPaymentRequests = useCallback(async () => {
    setLoading(true);
    try {
      invalidateGetCache("/turismo/vouchers-reserva/payment-requests/pending");
      const response = await axiosInstance.get(
        "/turismo/vouchers-reserva/payment-requests/pending",
        { _skipDedup: true },
      );
      if (response.data && response.data.success) {
        const allRequests = response.data.data || [];
        console.log(` Payment requests: ${allRequests.length} total`);
        setPaymentRequests(allRequests);
      }
    } catch (error) {
      console.error("Error cargando payment requests:", error);
      toast.error("Error al cargar las solicitudes de pago");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadPaymentRequests();
    }
  }, [isOpen, loadPaymentRequests]);

  useEffect(() => {
    if (!isOpen) return undefined;

    let refreshTimerId = null;

    const handlePaymentRequestChange = () => {
      if (refreshTimerId) {
        window.clearTimeout(refreshTimerId);
      }

      refreshTimerId = window.setTimeout(() => {
        loadPaymentRequests();
      }, 250);
    };

    window.addEventListener(
      "paymentRequestCreated",
      handlePaymentRequestChange,
    );
    window.addEventListener(
      "paymentRequestCompleted",
      handlePaymentRequestChange,
    );
    window.addEventListener("paymentRequestPaid", handlePaymentRequestChange);
    window.addEventListener(
      "paymentRequestCancelled",
      handlePaymentRequestChange,
    );

    return () => {
      if (refreshTimerId) {
        window.clearTimeout(refreshTimerId);
      }

      window.removeEventListener(
        "paymentRequestCreated",
        handlePaymentRequestChange,
      );
      window.removeEventListener(
        "paymentRequestCompleted",
        handlePaymentRequestChange,
      );
      window.removeEventListener(
        "paymentRequestPaid",
        handlePaymentRequestChange,
      );
      window.removeEventListener(
        "paymentRequestCancelled",
        handlePaymentRequestChange,
      );
    };
  }, [isOpen, loadPaymentRequests]);

  const getUrgencyStatus = (deadline) => {
    if (!deadline) return { level: "normal", label: "Normal", icon: FaClock };

    const deadlineDate = new Date(deadline);
    const daysLeft = differenceInDays(deadlineDate, new Date());

    if (isPast(deadlineDate)) {
      return {
        level: "expired",
        label: "Vencido",
        icon: FaExclamationTriangle,
      };
    } else if (daysLeft <= 2) {
      return { level: "urgent", label: "Urgente", icon: FaExclamationTriangle };
    } else if (daysLeft <= 5) {
      return { level: "warning", label: "Próximo", icon: FaClock };
    }

    return { level: "normal", label: "Normal", icon: FaCheckCircle };
  };

  const presentedRequests = useMemo(
    () => paymentRequests.map((request) => ({
      ...request,
      _assignment: resolvePendingPaymentAssignment(request),
    })),
    [paymentRequests],
  );

  const filteredRequests = useMemo(
    () => presentedRequests.filter((req) => {
      if (!matchesPendingPaymentSearch(req, searchQuery)) return false;
      if (filter === "urgent") {
        const status = getUrgencyStatus(req.deadline);
        return status.level === "urgent" || status.level === "expired";
      }
      if (filter === "normal") {
        const status = getUrgencyStatus(req.deadline);
        return status.level === "normal" || status.level === "warning";
      }
      return true;
    }),
    [filter, presentedRequests, searchQuery],
  );

  const handlePayRequest = async (request) => {
    const assignment = request._assignment || resolvePendingPaymentAssignment(request);
    const normalizedServiceData = assignment.service || normalizePaymentServiceData(request.service_data);

    // Fetch voucher_venta by code to get referencia_voucher_venta
    let referencia_voucher_venta = null;
    if (request.voucher_code) {
      try {
        const voucher = await voucherVentaService.getVoucherByCode(
          request.voucher_code,
        );
        if (voucher) {
          referencia_voucher_venta = voucher.id;
          console.log(
            ` Voucher venta ID encontrado: ${referencia_voucher_venta} para código: ${request.voucher_code}`,
          );
        } else {
          console.warn(
            ` No se encontró voucher venta con código: ${request.voucher_code}`,
          );
        }
      } catch (error) {
        console.error(" Error obteniendo voucher venta por código:", error);
      }
    }

    // Preparar datos para el formulario de pago
    // Usar descripción basada en el tipo de servicio (parentService.typeService)
    const descripcionPago = generatePaymentDescription(
      normalizedServiceData,
      request.voucher_code || request.voucher_reserva_id,
    );

    const facturacion = resolveFacturacionFromServiceData(
      normalizedServiceData,
    );

    const paymentData = {
      descripcion: descripcionPago,
      monto: request.amount,
      observaciones: request.observaciones || "",
      contexto_pago: {
        tipo: "ServiciosVoucherReserva",
        payment_request_id: request.id, // Incluir payment_request_id para que el backend pueda marcarlo como pagado
        facturacion,
        platform: request.platform || "venso", // Incluir platform del payment_request
        business_type: request.business_type || "B2C", // Incluir business_type del payment_request
        assigned_parent_id: assignment.assignedParentId,
        assigned_child_id: assignment.assignedChildId,
      },
      payment_request_service_data: normalizedServiceData,
      payment_request_assigned_parent_id: assignment.assignedParentId,
      payment_request_assigned_child_id: assignment.assignedChildId,
      payment_request_itinerario_servicio_id:
        request.itinerario_servicio_id || null,
      voucher_code: request.voucher_code,
      referencia_voucher_reserva: request.voucher_reserva_id,
      referencia_voucher_venta: referencia_voucher_venta, // Auto-populated
      platform: request.platform || "venso", // Incluir platform
      business_type: request.business_type || "B2C", // Incluir business_type
    };

    onPaymentSelect(paymentData);
    onClose();
  };

  if (!isOpen) return null;

  const urgentCount = paymentRequests.filter((r) => {
    const s = getUrgencyStatus(r.deadline);
    return s.level === "urgent" || s.level === "expired";
  }).length;

  const totalAmount = paymentRequests.reduce(
    (sum, r) => sum + parseFloat(r.amount || 0),
    0,
  );

  return (
    <div className="pp-modal-overlay" onClick={onClose}>
      <div className="pp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pp-header">
          <div className="pp-header-left">
            <h2> Pagos Pendientes ({paymentRequests.length})</h2>
            <span className="pp-total">${totalAmount.toFixed(2)}</span>
            {urgentCount > 0 && (
              <span className="pp-urgent-badge">
                {urgentCount} urgente{urgentCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <button className="pp-close-btn" onClick={onClose} title="Cerrar">
            <FaTimes />
          </button>
        </div>

        <div className="pp-tabs">
          <button
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            Todas ({paymentRequests.length})
          </button>
          <button
            className={filter === "urgent" ? "active urgent" : ""}
            onClick={() => setFilter("urgent")}
          >
            Urgentes ({urgentCount})
          </button>
          <button
            className={filter === "normal" ? "active" : ""}
            onClick={() => setFilter("normal")}
          >
            Normales ({paymentRequests.length - urgentCount})
          </button>
        </div>

        <div className="pp-search-wrap">
          <div className="pp-search-box">
            <FaSearch aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar por file, proveedor, servicio u observación..."
              aria-label="Buscar pagos pendientes"
            />
            {searchQuery && (
              <button type="button" className="pp-search-clear" onClick={() => setSearchQuery("")} title="Limpiar búsqueda">
                <FaTimes />
              </button>
            )}
          </div>
          <span className="pp-search-count">{filteredRequests.length} de {paymentRequests.length}</span>
        </div>

        <div className="pp-body">
          {loading ? (
            <div className="pp-loading">
              <div className="pp-spinner"></div>
              <p>Cargando solicitudes...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="pp-empty">
              <FaCheckCircle size={48} />
              <p>{searchQuery ? "No hay pagos que coincidan con la búsqueda" : "No hay solicitudes de pago pendientes"}</p>
            </div>
          ) : (
            <div className="pp-list">
              {filteredRequests.map((request) => {
                const urgency = getUrgencyStatus(request.deadline);

                return (
                  <div
                    key={request.id}
                    className={`pp-item ${urgency.level}`}
                    data-assigned-parent-id={request._assignment?.assignedParentId ?? ""}
                    data-assigned-child-id={request._assignment?.assignedChildId ?? ""}
                  >
                    <div className="pp-item-left">
                      <span className={`pp-dot ${urgency.level}`}></span>
                      <div className="pp-item-info">
                        <ServiceDetailedInfo
                          service={request._assignment?.service}
                          className="compact"
                        />
                        <div className="pp-item-meta">
                          <span className="pp-voucher-code" title={request.voucher_code || `VR-${request.voucher_reserva_id}`}>
                            <FaFileAlt /> File: {request.voucher_code || `VR-${request.voucher_reserva_id}`}
                          </span>
                          {request.deadline ? (
                            <span
                              className={`pp-deadline ${isPast(new Date(request.deadline)) ? "expired" : ""}`}
                            >
                              <FaClock />
                              {isPast(new Date(request.deadline))
                                ? `Vencido (${differenceInDays(new Date(), new Date(request.deadline))}d)`
                                : `${differenceInDays(new Date(request.deadline), new Date())}d - ${format(new Date(request.deadline), "dd MMM", { locale: es })}`}
                            </span>
                          ) : (
                            <span className="pp-deadline none">
                              <FaInfoCircle /> Sin fecha límite
                            </span>
                          )}
                        </div>
                        {request.observaciones && (
                          <div className="pp-note" title={request.observaciones}>
                            <span className="pp-note-label">Nota</span>
                            <span className="pp-note-text">{request.observaciones}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="pp-item-right">
                      <span className="pp-amount">
                        {formatPendingPaymentAmount(request)}
                      </span>
                      <button
                        className={`pp-pay-btn ${urgency.level === "expired" ? "expired" : ""}`}
                        onClick={() => handlePayRequest(request)}
                      >
                        Pagar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PendingPaymentsModal;
