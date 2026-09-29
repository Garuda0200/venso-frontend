import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  MdImage,
  MdPictureAsPdf,
  MdAttachFile,
  MdInfo,
  MdCalendarToday,
  MdAttachMoney,
  MdAccountBalance,
  MdReceipt,
  MdVisibility,
} from "react-icons/md";
import Modal from "../UI/Modal/Modal";
import ImagePreviewModal from "./shared/ImagePreviewModal";
import { getProxyUrl } from "../../services/presignedUrlService";
import vouchersPagosService from "../../services/vouchersPagosService";
import { paymentRequestService } from "../../services/paymentRequestService";
import { PaymentServiceComparison } from "./shared";
import axiosInstance from "../../utils/axiosInstance";
import "./MovimientoPreviewModal.scss";

// Helper para formatear tipo de cuenta
const formatTipoCuenta = (tipo) => {
  const tipoLabelMap = {
    efectivo: "Efectivo",
    cuenta_debito: "Cuenta Débito",
    cuenta_credito: "Cuenta Crédito",
    cuenta: "Cuenta Débito", // Legacy
    global66: "Global66",
    paypal: "PayPal",
    western_union: "Western Union",
    wetravel: "WeTravel",
  };
  return (
    tipoLabelMap[tipo] ||
    (tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1) : tipo)
  );
};


const parsePaymentContext = (contextoPago) => {
  if (!contextoPago) return null;
  if (typeof contextoPago === "object") return contextoPago;

  if (typeof contextoPago === "string") {
    try {
      const parsed = JSON.parse(contextoPago);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
};

const getMovementPaymentRequestId = (movimiento) => {
  const contextoPago = parsePaymentContext(movimiento?.contexto_pago);
  return (
    contextoPago?.payment_request_id ||
    movimiento?.payment_request_id ||
    movimiento?.paymentRequestId ||
    null
  );
};

const mergeEnrichedPaymentRequest = (baseRequest, enrichedRequest) => {
  if (!enrichedRequest) return baseRequest || null;
  if (!baseRequest) return enrichedRequest;

  return {
    ...baseRequest,
    ...enrichedRequest,
    service_data:
      enrichedRequest.service_data ||
      enrichedRequest.serviceData ||
      baseRequest.service_data ||
      baseRequest.serviceData ||
      null,
  };
};

const MovimientoPreviewModal = ({
  isOpen,
  onClose,
  movimiento,
  paymentRequest: providedPaymentRequest = null,
}) => {
  const [filesWithProxyUrls, setFilesWithProxyUrls] = useState([]);
  const [loadingUrls, setLoadingUrls] = useState(false);
  const [paymentRequest, setPaymentRequest] = useState(null);
  const [loadingPaymentRequest, setLoadingPaymentRequest] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const previewContentRef = useRef(null);

  // El cuerpo del Modal es el único contenedor desplazable. Al abrir otro
  // movimiento, devolverlo explícitamente al inicio evita heredar una posición
  // previa del mismo modal. Los cambios asíncronos posteriores no alteran esta
  // posición porque el scroll anchoring está deshabilitado en el SCSS.
  useEffect(() => {
    if (!isOpen || !movimiento?.id) return;

    const modalBody = previewContentRef.current?.closest(".modal-body");
    if (modalBody) {
      modalBody.scrollTop = 0;
    }
  }, [isOpen, movimiento?.id]);

  useEffect(() => {
    if (isOpen && movimiento?.id) {
      setFilesWithProxyUrls([]);
      loadEvidenciasFromVouchersPagos();

      loadPaymentRequestIfExists(providedPaymentRequest);
      return;
    }

    if (!isOpen) {
      setFilesWithProxyUrls([]);
      setPaymentRequest(null);
      setLoadingPaymentRequest(false);
      setSelectedEvidence(null);
    }
  }, [isOpen, movimiento?.id, providedPaymentRequest]);

  // Resolver el payment_request con la misma fuente enriquecida que usa
  // MovimientoForm/PendingPaymentsModal. El endpoint reportable agrega tanto
  // el servicio cotizado como los campos assigned_* de Reservas.
  const loadPaymentRequestIfExists = async (providedRequest = null) => {
    if (!movimiento?.id && !providedRequest) {
      setPaymentRequest(null);
      return;
    }

    setLoadingPaymentRequest(true);
    try {
      let baseRequest = providedRequest || null;
      let paymentRequestId =
        providedRequest?.id ||
        providedRequest?.payment_request_id ||
        providedRequest?.notification_id ||
        getMovementPaymentRequestId(movimiento);

      // Los movimientos creados desde PendingPaymentsModal/FlightPaymentModal
      // conservan payment_request_id en contexto_pago. Resolverlo directamente
      // evita depender del listado global y mantiene el mismo service_data que
      // MovimientoForm muestra al momento de pagar.
      if (paymentRequestId) {
        const enriched =
          await paymentRequestService.getPendingEnrichedById(paymentRequestId);
        if (enriched?.success && enriched?.data) {
          setPaymentRequest(
            mergeEnrichedPaymentRequest(baseRequest, enriched.data),
          );
          return;
        }
      }

      // Fallback para movimientos históricos que no guardaron el ID en
      // contexto_pago: localizar la solicitud por movimiento_id y después
      // volver a hidratarla por ID para recuperar la comparación completa.
      if (!movimiento?.id) {
        setPaymentRequest(baseRequest);
        return;
      }

      const response = await axiosInstance.get(
        "/turismo/vouchers-reserva/payment-requests/all",
        { _skipDedup: true },
      );
      const requests = Array.isArray(response?.data?.data)
        ? response.data.data
        : Array.isArray(response?.data)
          ? response.data
          : [];
      baseRequest =
        requests.find(
          (request) =>
            String(request?.movimiento_id || "") === String(movimiento.id),
        ) || baseRequest;

      paymentRequestId =
        baseRequest?.id ||
        baseRequest?.payment_request_id ||
        baseRequest?.notification_id ||
        null;

      if (paymentRequestId) {
        const enriched =
          await paymentRequestService.getPendingEnrichedById(paymentRequestId);
        setPaymentRequest(
          enriched?.success && enriched?.data
            ? mergeEnrichedPaymentRequest(baseRequest, enriched.data)
            : baseRequest,
        );
      } else {
        setPaymentRequest(baseRequest);
      }
    } catch (error) {
      console.error(
        "[MovimientoPreviewModal] Error cargando payment_request enriquecido:",
        error,
      );
      setPaymentRequest(providedRequest || null);
    } finally {
      setLoadingPaymentRequest(false);
    }
  };

  // Cargar evidencias desde vouchers_pagos en lugar de datos_extra
  const loadEvidenciasFromVouchersPagos = async () => {
    setLoadingUrls(true);
    try {
      console.log(
        " [MovimientoPreviewModal] Cargando evidencias para movimiento ID:",
        movimiento.id,
      );

      // Detectar si es una liquidación
      const esLiquidacion =
        movimiento?.contexto_pago?.tipo === "LiquidacionServicioProveedor";
      let result;

      if (esLiquidacion && movimiento?.liq_movimiento_id) {
        // Para liquidaciones: buscar evidencia por el ID del voucher_pago referenciado
        console.log(
          " [MovimientoPreviewModal] Es liquidación - Buscando evidencia con ID:",
          movimiento.liq_movimiento_id,
        );
        result = await vouchersPagosService.getById(
          movimiento.liq_movimiento_id,
        );
        // Convertir a array para mantener compatibilidad
        result = {
          success: result.success,
          data: result.data ? [result.data] : [],
        };
      } else {
        // Para pagos normales: buscar por movimiento_id
        console.log(
          " [MovimientoPreviewModal] Es pago normal - Buscando por movimiento_id:",
          movimiento.id,
        );
        result = await vouchersPagosService.getByMovimientoId(movimiento.id);
      }

      console.log(
        " [MovimientoPreviewModal] Resultado de vouchersPagosService:",
        result,
      );

      if (result.success && result.data && result.data.length > 0) {
        console.log(
          " [MovimientoPreviewModal] Evidencias cargadas desde vouchers_pagos:",
          result.data,
        );
        console.log(
          " [MovimientoPreviewModal] Cantidad de evidencias:",
          result.data.length,
        );

        // Generar proxy URLs para cada evidencia (no requiere async)
        const filesWithProxyUrls = result.data.map((evidencia, index) => {
          console.log(
            ` [MovimientoPreviewModal] Procesando evidencia ${index + 1}:`,
            evidencia,
          );

          // Usar proxy URL directamente
          const proxyUrl = evidencia.tigris_url
            ? getProxyUrl(evidencia.tigris_url)
            : null;

          const fileData = {
            filename: evidencia.filename,
            type: evidencia.file_type,
            size: evidencia.file_size,
            tigrisUrl: evidencia.tigris_url,
            proxyUrl: proxyUrl,
            uploaded_at: evidencia.created_at,
          };
          console.log(
            ` [MovimientoPreviewModal] Archivo procesado ${index + 1}:`,
            fileData,
          );
          return fileData;
        });

        console.log(
          " [MovimientoPreviewModal] Todos los archivos procesados:",
          filesWithProxyUrls,
        );
        console.log(
          " [MovimientoPreviewModal] Actualizando estado con",
          filesWithProxyUrls.length,
          "archivos",
        );
        setFilesWithProxyUrls(filesWithProxyUrls);
      } else {
        console.log(
          " [MovimientoPreviewModal] No se encontraron evidencias en vouchers_pagos para movimiento:",
          movimiento.id,
        );

        // Fallback: buscar evidencias legacy en datos_extra
        if (movimiento?.datos_extra?.evidencia) {
          console.log(
            " [MovimientoPreviewModal] Usando evidencias legacy de datos_extra",
          );
          const evidencia = movimiento.datos_extra.evidencia;
          const filesWithUrls = evidencia.map((file) => {
            if (file.tigrisUrl) {
              const proxyUrl = getProxyUrl(file.tigrisUrl);
              return { ...file, proxyUrl: proxyUrl };
            }
            return file;
          });
          setFilesWithProxyUrls(filesWithUrls);
        } else {
          console.log(
            " [MovimientoPreviewModal] No hay evidencias ni en vouchers_pagos ni en datos_extra",
          );
          setFilesWithProxyUrls([]);
        }
      }
    } catch (error) {
      console.error(
        " [MovimientoPreviewModal] Error loading evidencias from vouchers_pagos:",
        error,
      );
      setFilesWithProxyUrls([]);
    } finally {
      setLoadingUrls(false);
      console.log(" [MovimientoPreviewModal] Finalizado cargado de evidencias");
    }
  };

  const formatFecha = (fecha) => {
    if (!fecha) return "Fecha no disponible";

    try {
      const date = new Date(fecha);
      if (isNaN(date.getTime())) {
        return "Fecha inválida";
      }
      return format(date, "dd 'de' MMMM 'de' yyyy", { locale: es });
    } catch (error) {
      console.error("Error formateando fecha:", error);
      return "Fecha inválida";
    }
  };

  const renderFilePreview = useCallback((file, index) => {
    const normalizedFilename = file.filename?.toLowerCase() || "";
    const isImage =
      file.type?.startsWith("image/") ||
      /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(normalizedFilename);
    const isPdf =
      file.type === "application/pdf" || normalizedFilename.endsWith(".pdf");

    // La URL se calcula una sola vez al cargar las evidencias. Priorizarla
    // evita reconstruir el proxy durante cada render del modal padre.
    let fileUrl = file.proxyUrl || null;
    if (!fileUrl && file.tigrisUrl) {
      fileUrl = getProxyUrl(file.tigrisUrl);
    } else if (!fileUrl && file.content && file.type) {
      fileUrl = `data:${file.type};base64,${file.content}`;
    }

    // Formatear fecha de carga de forma segura
    let formattedUploadDate = "";
    if (file.uploaded_at) {
      try {
        const uploadDate = new Date(file.uploaded_at);
        if (!isNaN(uploadDate.getTime())) {
          formattedUploadDate = format(uploadDate, "dd/MM/yyyy HH:mm", {
            locale: es,
          });
        }
      } catch (error) {
        console.error("Error formateando fecha de carga:", error);
      }
    }

    if (!fileUrl) {
      console.warn(
        " [MovimientoPreviewModal] No se pudo generar URL para archivo:",
        file,
      );
      return (
        <div
          key={file.tigrisUrl || file.proxyUrl || file.filename || index}
          className="file-preview-card error"
        >
          <div className="file-icon-large">
            <MdAttachFile className="icon-file" />
          </div>
          <span className="error-text">
            Archivo no disponible (no se encontró tigrisUrl ni content)
          </span>
        </div>
      );
    }

    const openEvidencePreview = () => {
      setSelectedEvidence({
        fileUrl,
        filename: file.filename || `evidencia-${index + 1}`,
        fileType:
          file.type ||
          (isPdf ? "application/pdf" : isImage ? "image/*" : ""),
      });
    };

    return (
      <div
        key={file.tigrisUrl || file.proxyUrl || file.filename || index}
        className="file-preview-card"
      >
        <div className="file-preview-header">
          <div className="file-icon-large">
            {isImage && <MdImage className="icon-image" />}
            {isPdf && <MdPictureAsPdf className="icon-pdf" />}
            {!isImage && !isPdf && <MdAttachFile className="icon-file" />}
          </div>
          <div className="file-meta">
            <span className="file-name">{file.filename || "Sin nombre"}</span>
            <span className="file-size">
              {file.size ? (file.size / 1024).toFixed(2) : "0"} KB
            </span>
            {formattedUploadDate && (
              <span className="file-date">{formattedUploadDate}</span>
            )}
            {file.tigrisUrl && (
              <span className="file-source tigris-badge"></span>
            )}
          </div>
        </div>

        {isImage && fileUrl && (
          <div className="image-preview">
            <button
              type="button"
              className="media-preview-trigger"
              onClick={openEvidencePreview}
              aria-label={`Visualizar ${file.filename || "imagen de evidencia"} en tamaño completo`}
            >
              <img
                src={fileUrl}
                alt={file.filename || "Imagen de evidencia"}
                className="preview-image"
                loading="lazy"
                onLoad={() =>
                  console.log(
                    ` [MovimientoPreviewModal] Imagen ${index + 1} cargada exitosamente`,
                  )
                }
                onError={(e) => {
                  console.error(
                    ` [MovimientoPreviewModal] Error cargando imagen ${index + 1}:`,
                    fileUrl,
                  );
                  e.currentTarget.style.display = "none";
                  const errorElement = e.currentTarget.parentElement?.querySelector(
                    ".image-error",
                  );
                  if (errorElement) errorElement.hidden = false;
                }}
              />
              <span className="image-error" hidden>
                Error al cargar la imagen
              </span>
              <span className="media-preview-overlay" aria-hidden="true">
                <MdVisibility />
                Visualizar
              </span>
            </button>
          </div>
        )}

        {isPdf && (
          <div className="pdf-preview-placeholder">
            <MdPictureAsPdf size={80} />
            <span className="pdf-label">Documento PDF</span>
            <span className="file-name-pdf">
              {file.filename || "documento.pdf"}
            </span>
            <div className="pdf-actions">
              <button
                type="button"
                className="btn-view-file"
                onClick={openEvidencePreview}
              >
                <MdVisibility /> Visualizar PDF
              </button>
              {file.tigrisUrl && (
                <a
                  href={fileUrl}
                  download={file.filename}
                  className="btn-download-file"
                >
                  <MdAttachFile /> Descargar
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }, []);

  const renderedEvidenceFiles = useMemo(
    () => filesWithProxyUrls.map(renderFilePreview),
    [filesWithProxyUrls, renderFilePreview],
  );

  const handleCloseEvidencePreview = useCallback(() => {
    setSelectedEvidence(null);
  }, []);

  if (!movimiento) return null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={
          <div className="modal-title-wrapper">
            <MdInfo className="title-icon" />
            <span>Detalles del Movimiento</span>
          </div>
        }
        size="large"
        className="movimiento-preview-modal"
      >
        <div ref={previewContentRef} className="preview-content">
        {/* Resumen compacto del movimiento */}
        <section
          className={`movement-summary movement-summary--${String(
            movimiento.tipo_movimiento || "",
          ).toLowerCase()}`}
        >
          <div className="movement-summary__headline">
            <div className="movement-summary__copy">
              <div className="movement-summary__eyebrow">
                <span
                  className={`movement-type-badge movement-type-badge--${String(
                    movimiento.tipo_movimiento || "",
                  ).toLowerCase()}`}
                >
                  {movimiento.tipo_movimiento || "Movimiento"}
                </span>
                {movimiento.id && (
                  <span className="movement-summary__id">#{movimiento.id}</span>
                )}
              </div>
              <h3>{movimiento.descripcion || "Movimiento sin descripción"}</h3>
            </div>

            <div className="movement-summary__amount">
              <span>Monto</span>
              <strong>
                {movimiento.moneda === "soles" ? "S/ " : "US$ "}
                {Number.isFinite(Number.parseFloat(movimiento.monto))
                  ? Number.parseFloat(movimiento.monto).toFixed(2)
                  : "0.00"}
              </strong>
              <small>
                {movimiento.moneda === "soles"
                  ? "Soles"
                  : "Dólares"}
              </small>
            </div>
          </div>

          <div className="movement-summary__meta">
            <div className="movement-meta-item">
              <MdCalendarToday />
              <span>Fecha</span>
              <strong>{formatFecha(movimiento.fecha)}</strong>
            </div>
            <div className="movement-meta-item">
              <MdAccountBalance />
              <span>Cuenta</span>
              <strong>
                {formatTipoCuenta(movimiento.tipo_cuenta) || "No especificado"}
              </strong>
            </div>
            <div className="movement-meta-item">
              <MdAttachMoney />
              <span>Moneda</span>
              <strong>
                {movimiento.moneda === "soles" ? "Soles (S/)" : "Dólares (US$)"}
              </strong>
            </div>
          </div>

          {(movimiento.voucher_code ||
            movimiento.metodo_pago ||
            movimiento.referencia_pago ||
            movimiento.pagado_por ||
            movimiento.recepcionado_por) && (
            <dl className="movement-summary__details">
              {movimiento.voucher_code && (
                <div>
                  <dt>Código de voucher</dt>
                  <dd>{movimiento.voucher_code}</dd>
                </div>
              )}
              {movimiento.metodo_pago && (
                <div>
                  <dt>Método de pago</dt>
                  <dd>{movimiento.metodo_pago}</dd>
                </div>
              )}
              {movimiento.referencia_pago && (
                <div>
                  <dt>Referencia</dt>
                  <dd>{movimiento.referencia_pago}</dd>
                </div>
              )}
              {movimiento.pagado_por && (
                <div>
                  <dt>Pagado por</dt>
                  <dd>{movimiento.pagado_por}</dd>
                </div>
              )}
              {movimiento.recepcionado_por && (
                <div>
                  <dt>Recepcionado por</dt>
                  <dd>{movimiento.recepcionado_por}</dd>
                </div>
              )}
            </dl>
          )}
        </section>

        {/* Contexto de pago asociado (si existe) */}
        {paymentRequest && (
          <section className="payment-context">
            <div className="payment-context__header">
              <div>
                <MdReceipt />
                <span>Pago asociado</span>
              </div>
              {paymentRequest.status && (
                <span className={`payment-context__status payment-context__status--${paymentRequest.status}`}>
                  {paymentRequest.status === "paid" || paymentRequest.status === "completed"
                    ? "Pagado"
                    : paymentRequest.status}
                </span>
              )}
            </div>

            {(paymentRequest.observaciones ||
              paymentRequest.paid_at ||
              paymentRequest.payment_deadline) && (
              <div className="payment-context__meta">
                {paymentRequest.paid_at && (
                  <div>
                    <span>Fecha de pago</span>
                    <strong>
                      {format(
                        new Date(paymentRequest.paid_at),
                        "dd MMM yyyy · HH:mm",
                        { locale: es },
                      )}
                    </strong>
                  </div>
                )}
                {paymentRequest.payment_deadline && (
                  <div>
                    <span>Fecha límite</span>
                    <strong>
                      {format(
                        new Date(paymentRequest.payment_deadline),
                        "dd MMM yyyy",
                        { locale: es },
                      )}
                    </strong>
                  </div>
                )}
                {paymentRequest.observaciones && (
                  <div className="payment-context__observation">
                    <span>Observaciones</span>
                    <strong>{paymentRequest.observaciones}</strong>
                  </div>
                )}
              </div>
            )}

            {(paymentRequest.service_data || paymentRequest.serviceData) && (
              <div className="payment-context__service">
                <span className="payment-context__service-label">
                  Servicios vinculados
                </span>
                <PaymentServiceComparison
                  serviceData={
                    paymentRequest.service_data || paymentRequest.serviceData
                  }
                  itinerarioServicioId={
                    paymentRequest.itinerario_servicio_id ||
                    paymentRequest.itinerarioServicioId ||
                    null
                  }
                  showHeading={false}
                  embedded={true}
                  layout="horizontal"
                  className="preview-payment-service-comparison"
                />
              </div>
            )}
          </section>
        )}

        {loadingPaymentRequest && (
          <div className="preview-section loading-section">
            <p> Cargando solicitud de pago asociada...</p>
          </div>
        )}

        {/* Evidencia de Pago (SIEMPRE VISIBLE - Independiente de datos_extra) */}
        <section className="evidencia-section">
          <div className="evidencia-container">
            <h5 className="section-title">
              Evidencia de Pago
              {loadingUrls && (
                <span className="loading-badge">Cargando URLs...</span>
              )}
              {!loadingUrls && (
                <span className="count-badge">
                  ({filesWithProxyUrls.length})
                </span>
              )}
            </h5>
            {loadingUrls ? (
              <div className="files-loading">
                <p> Cargando archivos desde Tigris...</p>
              </div>
            ) : filesWithProxyUrls.length === 0 ? (
              <div className="no-files">
                <MdAttachFile className="no-files-icon" />
                <p>
                  No se encontraron archivos de evidencia para este movimiento
                </p>
                <small>
                  Los archivos se almacenan en la tabla vouchers_pagos
                </small>
              </div>
            ) : (
              <div className="files-grid">{renderedEvidenceFiles}</div>
            )}
          </div>
        </section>
        </div>
      </Modal>

      <ImagePreviewModal
        isOpen={Boolean(selectedEvidence)}
        onClose={handleCloseEvidencePreview}
        fileUrl={selectedEvidence?.fileUrl}
        filename={selectedEvidence?.filename}
        fileType={selectedEvidence?.fileType}
      />
    </>
  );
};

export default React.memo(MovimientoPreviewModal);
