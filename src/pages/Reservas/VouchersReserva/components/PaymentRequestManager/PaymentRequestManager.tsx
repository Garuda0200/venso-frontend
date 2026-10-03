import React, {
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from "react";
import {
  MdPending,
  MdCheckCircle,
  MdCancel,
  MdAttachMoney,
  MdAccessTime,
  MdInfo,
  MdWarning,
  MdAccountBalance,
  MdCalendarToday,
  MdReceipt,
  MdImage,
  MdPictureAsPdf,
  MdAttachFile,
} from "react-icons/md";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "react-toastify";
import voucherReservaService from "../../../../../services/voucherReservaService";
import { invalidateGetCache } from "../../../../../utils/axiosInstance";
import contabilidadService from "../../../../../services/contabilidadService";
import ServiceDetailedInfo from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/components/ServiceDetailedInfo/ServiceDetailedInfo";
import "./PaymentRequestManager.scss";
import { getOperationalPaymentRequest } from "../../utils/reservationPaymentManagement";

const PENDING_PAYMENT_REFRESH_MS = 60000;

const PaymentRequestManager = forwardRef(
  (
    {
      voucherReservaId,
      voucherReservaCode,
      servicioId,
      service,
      onRequestPayment,
      onStatusLoaded,
    },
    ref,
  ) => {
    const [paymentRequest, setPaymentRequest] = useState(null);
    const [movimiento, setMovimiento] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [loadingMovimiento, setLoadingMovimiento] = useState(false);
    const hasFetchedOnce = React.useRef(false);

    useEffect(() => {
      if (voucherReservaId && servicioId) {
        fetchPaymentRequest();
      }
    }, [voucherReservaId, servicioId]);

    // Refresh conservador mientras una solicitud sigue pendiente.
    useEffect(() => {
      if (!paymentRequest || paymentRequest.status !== "pending") {
        return; // No consultar si no hay request o ya está pagado/cancelado.
      }

      const intervalId = setInterval(() => {
        if (document.visibilityState === "hidden") return;
        fetchPaymentRequest();
      }, PENDING_PAYMENT_REFRESH_MS);

      return () => clearInterval(intervalId);
    }, [paymentRequest?.status, voucherReservaId, servicioId]);

    // Exponer el método refresh para que el componente padre pueda actualizar
    useImperativeHandle(ref, () => ({
      refresh: () => {
        invalidateGetCache("payment-request");
        fetchPaymentRequest();
      },
    }));

    const fetchPaymentRequest = async () => {
      setLoadError(false);
      onStatusLoaded?.(undefined);
      if (!hasFetchedOnce.current) {
        setLoading(true);
      }
      try {
        const response = await voucherReservaService.getPaymentRequest(
          voucherReservaId,
          servicioId,
        );

        if (!response?.success) throw new Error("No se pudo verificar el estado de pago");
        const current = getOperationalPaymentRequest({ paymentRequest: response.data });
        if (current) {
          setPaymentRequest(current);
          onStatusLoaded?.(current);

          // Si está pagado y tiene movimiento_id, cargar el movimiento
          if (response.data.status === "paid" && response.data.movimiento_id) {
            fetchMovimiento(response.data.movimiento_id);
          }
        } else {
          setPaymentRequest(null);
          onStatusLoaded?.(null);
        }
      } catch (error) {
        console.error("Error al cargar solicitud de pago:", error);
        setLoadError(true);
      } finally {
        setLoading(false);
        hasFetchedOnce.current = true;
      }
    };

    const fetchMovimiento = async (movimientoId) => {
      setLoadingMovimiento(true);
      try {
        const response =
          await contabilidadService.getMovimientoById(movimientoId);
        if (response && response.success && response.data) {
          setMovimiento(response.data);
        }
      } catch (error) {
        console.error("Error al cargar movimiento:", error);
        toast.error("No se pudo cargar los detalles del movimiento");
      } finally {
        setLoadingMovimiento(false);
      }
    };

    // Not used when parent shows form inline, but kept for backwards compat
    const handleRequestPayment = () => {
      if (onRequestPayment) {
        onRequestPayment();
      }
    };

    const getStatusIcon = (status) => {
      switch (status) {
        case "pending":
          return <MdPending className="status-icon pending" />;
        case "paid":
          return <MdCheckCircle className="status-icon paid" />;
        case "cancelled":
          return <MdCancel className="status-icon cancelled" />;
        default:
          return <MdWarning className="status-icon" />;
      }
    };

    const getStatusText = (status) => {
      switch (status) {
        case "pending":
          return "Pendiente de Pago";
        case "paid":
          return "Pagado";
        case "cancelled":
          return "Cancelado";
        default:
          return "Desconocido";
      }
    };

    const getStatusColor = (status) => {
      switch (status) {
        case "pending":
          return "warning";
        case "paid":
          return "success";
        case "cancelled":
          return "danger";
        default:
          return "secondary";
      }
    };

    if (loading) {
      return (
        <div className="payment-request-manager loading">
          <div className="spinner"></div>
          <span>Cargando estado de pago...</span>
        </div>
      );
    }

    // Si NO hay solicitud de pago, no renderizar nada (el padre muestra el formulario)
    if (loadError) {
      return <div className="payment-request-manager" role="alert">
        <span>No se pudo verificar el estado de pago.</span>
        <button type="button" onClick={fetchPaymentRequest}>Reintentar</button>
      </div>;
    }
    if (!paymentRequest) {
      return null;
    }

    // Si HAY solicitud de pago, mostrar el estado con circular progress
    return (
      <div
        className={`payment-request-manager has-request status-${paymentRequest.status}`}
      >
        <div className="payment-status-card">
          <div className="status-header">
            <div className="status-progress">
              {paymentRequest.status === "pending" ? (
                <div className="circular-progress">
                  <div className="spinner-circle"></div>
                </div>
              ) : (
                <div className="status-icon-wrapper">
                  {getStatusIcon(paymentRequest.status)}
                </div>
              )}
            </div>
            <div className="status-info">
              <h4 className="status-title">
                {getStatusText(paymentRequest.status)}
              </h4>
              <p className="status-subtitle">
                <MdAttachMoney />
                {(service?.assignedService?.tariff?.moneda ||
                  service?.assignedMoneda ||
                  service?.moneda) === "dolares"
                  ? "US$ "
                  : "S/ "}
                {parseFloat(paymentRequest.amount).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="status-details">
            <div className="detail-item">
              <MdAccessTime className="detail-icon" />
              <span className="detail-label">Solicitado:</span>
              <span className="detail-value">
                {format(
                  new Date(paymentRequest.created_at),
                  "dd/MM/yyyy HH:mm",
                  { locale: es },
                )}
              </span>
            </div>

            {/* Mostrar fecha límite de pago si existe */}
            {paymentRequest.payment_deadline &&
              (() => {
                const deadline = new Date(paymentRequest.payment_deadline);
                const now = new Date();
                const hoursUntilDeadline = (deadline - now) / (1000 * 60 * 60);

                let deadlineClass = "detail-item deadline";
                let deadlineIcon = <MdCalendarToday className="detail-icon" />;

                // Si ya pasó el deadline
                if (hoursUntilDeadline < 0) {
                  deadlineClass += " expired";
                  deadlineIcon = <MdWarning className="detail-icon danger" />;
                }
                // Si quedan menos de 24 horas
                else if (hoursUntilDeadline < 24) {
                  deadlineClass += " warning";
                  deadlineIcon = <MdWarning className="detail-icon warning" />;
                }

                return (
                  <div className={deadlineClass}>
                    {deadlineIcon}
                    <span className="detail-label">Fecha límite:</span>
                    <span className="detail-value">
                      {format(deadline, "dd/MM/yyyy HH:mm", { locale: es })}
                      {hoursUntilDeadline < 0 && (
                        <span className="expired-badge"> (VENCIDA)</span>
                      )}
                      {hoursUntilDeadline >= 0 && hoursUntilDeadline < 24 && (
                        <span className="warning-badge">
                          {" "}
                          (Próxima a vencer)
                        </span>
                      )}
                    </span>
                  </div>
                );
              })()}

            {paymentRequest.paid_at && (
              <div className="detail-item">
                <MdCheckCircle className="detail-icon success" />
                <span className="detail-label">Pagado:</span>
                <span className="detail-value">
                  {format(
                    new Date(paymentRequest.paid_at),
                    "dd/MM/yyyy HH:mm",
                    { locale: es },
                  )}
                </span>
              </div>
            )}

            {paymentRequest.observaciones && (
              <div className="detail-item full-width">
                <MdInfo className="detail-icon" />
                <span className="detail-label">Observaciones:</span>
                <p className="detail-value">{paymentRequest.observaciones}</p>
              </div>
            )}

            {paymentRequest.movimiento_id && (
              <div className="detail-item">
                <MdCheckCircle className="detail-icon success" />
                <span className="detail-label">ID Movimiento:</span>
                <span className="detail-value">
                  #{paymentRequest.movimiento_id}
                </span>
              </div>
            )}
          </div>

          {paymentRequest.status === "pending" && (
            <div className="status-actions">
              <button
                className="btn-view-details"
                onClick={handleRequestPayment}
              >
                <MdInfo />
                Ver Detalles
              </button>
            </div>
          )}
        </div>

        {/* Mostrar información del movimiento si está pagado (igual que MovimientoPreviewModal) */}
        {paymentRequest.status === "paid" && paymentRequest.movimiento_id && (
          <div className="movimiento-details-section">
            <div className="section-header">
              <MdReceipt className="section-icon" />
              <h5>Información del Movimiento de Pago</h5>
            </div>

            {loadingMovimiento ? (
              <div className="loading-movimiento">
                <div className="spinner"></div>
                <span>Cargando detalles del movimiento...</span>
              </div>
            ) : movimiento ? (
              <div className="movimiento-preview">
                {/* Información General */}
                <div className="preview-section info-section">
                  <h6 className="subsection-title">
                    <MdInfo /> Información General
                  </h6>

                  <div className="movimiento-info-grid">
                    <div className="info-card">
                      <div className="card-icon descripcion">
                        <MdInfo />
                      </div>
                      <div className="card-content">
                        <span className="card-label">Descripción</span>
                        <span className="card-value">
                          {movimiento.descripcion}
                        </span>
                      </div>
                    </div>

                    <div className="info-card">
                      <div
                        className={`card-icon tipo ${movimiento.tipo_movimiento.toLowerCase()}`}
                      >
                        <MdAccountBalance />
                      </div>
                      <div className="card-content">
                        <span className="card-label">Tipo de Movimiento</span>
                        <span
                          className={`card-value badge ${movimiento.tipo_movimiento.toLowerCase()}`}
                        >
                          {movimiento.tipo_movimiento}
                        </span>
                      </div>
                    </div>

                    <div className="info-card">
                      <div className="card-icon fecha">
                        <MdCalendarToday />
                      </div>
                      <div className="card-content">
                        <span className="card-label">Fecha</span>
                        <span className="card-value">
                          {format(
                            new Date(movimiento.fecha),
                            "dd 'de' MMMM 'de' yyyy",
                            { locale: es },
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="info-card">
                      <div className="card-icon cuenta">
                        <MdAccountBalance />
                      </div>
                      <div className="card-content">
                        <span className="card-label">Tipo de Cuenta</span>
                        <span className="card-value badge tipo-cuenta">
                          {movimiento.tipo_cuenta.charAt(0).toUpperCase() +
                            movimiento.tipo_cuenta.slice(1)}
                        </span>
                      </div>
                    </div>

                    <div className="info-card">
                      <div className={`card-icon moneda ${movimiento.moneda}`}>
                        <MdAttachMoney />
                      </div>
                      <div className="card-content">
                        <span className="card-label">Moneda</span>
                        <span
                          className={`card-value badge moneda ${movimiento.moneda}`}
                        >
                          {movimiento.moneda === "soles"
                            ? "Soles (S/)"
                            : "Dólares (US$)"}
                        </span>
                      </div>
                    </div>

                    <div className="info-card monto-card">
                      <div
                        className={`card-icon monto ${movimiento.tipo_movimiento.toLowerCase()}`}
                      >
                        <MdAttachMoney />
                      </div>
                      <div className="card-content">
                        <span className="card-label">Monto</span>
                        <span
                          className={`card-value monto-value ${movimiento.tipo_movimiento.toLowerCase()}`}
                        >
                          {movimiento.moneda === "soles" ? "S/ " : "US$ "}
                          {parseFloat(movimiento.monto).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Datos Extra (Servicio Asignado + Evidencia) */}
                {movimiento.datos_extra && (
                  <div className="preview-section datos-extra-section">
                    <h6 className="subsection-title">Información Adicional</h6>

                    {/* Servicio Asignado */}
                    {movimiento.datos_extra.servicio_asignado && (
                      <div className="servicio-asignado-container">
                        <h6 className="subsection-subtitle">
                          Servicio Relacionado
                        </h6>
                        <div className="service-wrapper">
                          <ServiceDetailedInfo
                            service={movimiento.datos_extra.servicio_asignado}
                            className="preview-service-info"
                          />
                        </div>
                      </div>
                    )}

                    {/* Evidencia (Archivos) */}
                    {movimiento.datos_extra.evidencia &&
                      movimiento.datos_extra.evidencia.length > 0 && (
                        <div className="evidencia-container">
                          <h6 className="subsection-subtitle">
                            Evidencia de Pago (
                            {movimiento.datos_extra.evidencia.length})
                          </h6>
                          <div className="files-grid">
                            {movimiento.datos_extra.evidencia.map(
                              (file, index) => {
                                const isImage = file.type.startsWith("image/");
                                const isPdf = file.type === "application/pdf";

                                return (
                                  <div
                                    key={index}
                                    className="file-preview-card"
                                  >
                                    <div className="file-preview-header">
                                      <div className="file-icon-large">
                                        {isImage && (
                                          <MdImage className="icon-image" />
                                        )}
                                        {isPdf && (
                                          <MdPictureAsPdf className="icon-pdf" />
                                        )}
                                        {!isImage && !isPdf && (
                                          <MdAttachFile className="icon-file" />
                                        )}
                                      </div>
                                      <div className="file-meta">
                                        <span className="file-name">
                                          {file.filename}
                                        </span>
                                        <span className="file-size">
                                          {(file.size / 1024).toFixed(2)} KB
                                        </span>
                                        {file.uploaded_at && (
                                          <span className="file-date">
                                            {format(
                                              new Date(file.uploaded_at),
                                              "dd/MM/yyyy HH:mm",
                                              { locale: es },
                                            )}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {isImage && (
                                      <div className="image-preview">
                                        <img
                                          src={`data:${file.type};base64,${file.content}`}
                                          alt={file.filename}
                                          className="preview-image"
                                        />
                                      </div>
                                    )}

                                    {isPdf && (
                                      <div className="pdf-preview-placeholder">
                                        <MdPictureAsPdf size={80} />
                                        <span className="pdf-label">
                                          Documento PDF
                                        </span>
                                        <a
                                          href={`data:${file.type};base64,${file.content}`}
                                          download={file.filename}
                                          className="btn-download-file"
                                        >
                                          <MdAttachFile /> Descargar
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                );
                              },
                            )}
                          </div>
                        </div>
                      )}
                  </div>
                )}

                {/* Pagado por */}
                {paymentRequest.pagado_por && (
                  <div className="pagado-por-info">
                    <MdCheckCircle className="icon" />
                    <span>
                      Aprobado por: <strong>{paymentRequest.pagado_por}</strong>
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="no-movimiento-data">
                <MdWarning />
                <span>No se pudo cargar la información del movimiento</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
);

// Agregar displayName para debugging
PaymentRequestManager.displayName = "PaymentRequestManager";

export default PaymentRequestManager;
