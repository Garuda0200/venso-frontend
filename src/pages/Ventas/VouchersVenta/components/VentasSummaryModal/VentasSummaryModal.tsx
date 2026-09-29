import { useState, useEffect, useMemo } from "react";
import {
  MdClose,
  MdDownload,
  MdPerson,
  MdDescription,
  MdPayment,
  MdLocationOn,
  MdEmail,
  MdPhone,
  MdCalendarToday,
  MdWarning,
  MdVisibility,
  MdCheckCircle,
  MdCancel,
  MdHotel,
  MdDirectionsCar,
  MdRestaurant,
  MdLocalActivity,
  MdFlight,
  MdTrain,
  MdAssignment,
} from "react-icons/md";
import { voucherVentaService } from "../../../../../services/voucherVentaService";
import ServiceDetailedInfo from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/components/ServiceDetailedInfo";
import { detectServiceType } from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/utils/serviceTypeMapper";
import {
  getTicketEntrada,
  getTicketProcedencia,
  getTicketTipoUsuario,
  normalizeTicketProcedencia,
} from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/ticketBeneficiaries";
import contabilidadService from "../../../../../services/contabilidadService";
import pasajeroService from "../../../../../services/pasajeroService";
import voucherDocumentService from "../../../../../services/voucherDocumentService";
import MovimientoPreviewModal from "../../../../../components/Contabilidad/MovimientoPreviewModal";
import {
  getProxyUrl,
  makeProxyUrlAbsolute,
} from "../../../../../services/presignedUrlService";
import "./VentasSummaryModal.scss";
import { formatCurrency } from "../../../../../utils/formatters";
import {
  filterVoucherPaymentMovements,
  summarizeVoucherFinancials,
} from "../../utils/voucherFinancials";

const normalizeDaysArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.values(value).filter((day) => day && typeof day === "object");
  }
  return [];
};

const isExternalItineraryDay = (day = {}) =>
  day?.isExternalItinerary === true ||
  day?.sourceItinerary === "external" ||
  day?.refTipo === "cotizacion_externa" ||
  day?.ref_tipo === "cotizacion_externa";

const getDayNumber = (day, index, fallbackOffset = 0) => {
  const explicitNumber = Number(day?.numero || day?.day || 0);
  return explicitNumber > 0 ? explicitNumber : fallbackOffset + index + 1;
};

const normalizeTicketGroupKey = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const isTicketSummaryService = (service = {}) => {
  let type = service?.typeService || service?.categoria || service?.type || "";
  try {
    type = detectServiceType(service) || type;
  } catch {
    // fallback
  }
  return String(type).toLowerCase() === "tickets" || Boolean(service?.childService?.ticket || service?.ticket);
};

const groupTicketServicesForItinerary = (services = []) => {
  const result = [];
  const groups = new Map();

  (Array.isArray(services) ? services : []).forEach((service) => {
    if (!isTicketSummaryService(service)) {
      result.push(service);
      return;
    }

    const entrada = getTicketEntrada(service);
    const key = normalizeTicketGroupKey(entrada) || `ticket-${groups.size + 1}`;
    if (!groups.has(key)) {
      const group = { __ticketGroup: true, key, entrada, services: [] };
      groups.set(key, group);
      result.push(group);
    }
    groups.get(key).services.push(service);
  });

  return result;
};

const mergeSummaryItineraryDays = (voucherData) => {
  if (!voucherData) return [];

  const cotizacion = voucherData.cotizacion_data || voucherData.cotizacion || {};
  const voucherDays = normalizeDaysArray(voucherData.itinerario);
  const cotizacionBaseDays = normalizeDaysArray(cotizacion.itinerario);
  const cotizacionExternalDays = normalizeDaysArray(
    cotizacion.itinerario_externo || cotizacion.itinerarioExterno,
  );

  const baseDays =
    cotizacionBaseDays.length > 0
      ? cotizacionBaseDays
      : voucherDays.filter((day) => !isExternalItineraryDay(day));
  const externalDays =
    cotizacionExternalDays.length > 0
      ? cotizacionExternalDays
      : voucherDays.filter(isExternalItineraryDay);

  const dayMap = new Map();

  baseDays.forEach((day, index) => {
    const dayNumber = getDayNumber(day, index);
    dayMap.set(dayNumber, {
      ...day,
      numero: dayNumber,
      titulo: day?.titulo || `Día ${dayNumber}`,
      mainServices: normalizeDaysArray(day?.servicios),
      externalServices: [],
      externalOnly: false,
    });
  });

  externalDays.forEach((day, index) => {
    const dayNumber = getDayNumber(day, index, baseDays.length);
    const externalServices = normalizeDaysArray(day?.servicios);
    if (externalServices.length === 0) return;

    if (dayMap.has(dayNumber)) {
      const current = dayMap.get(dayNumber);
      dayMap.set(dayNumber, {
        ...current,
        externalServices: [...current.externalServices, ...externalServices],
      });
      return;
    }

    dayMap.set(dayNumber, {
      ...day,
      numero: dayNumber,
      titulo: day?.titulo || `Día ${dayNumber}`,
      mainServices: [],
      externalServices,
      externalOnly: true,
    });
  });

  return Array.from(dayMap.values()).sort(
    (left, right) => Number(left.numero || 0) - Number(right.numero || 0),
  );
};

const getSummaryServiceIcon = (service) => {
  let type = service?.typeService || service?.categoria || service?.type || "";
  try {
    type = detectServiceType(service) || type;
  } catch {
    // Mantener fallback visual si el servicio viene parcial.
  }

  switch (String(type).toLowerCase()) {
    case "hoteles":
    case "hotel":
      return <MdHotel />;
    case "transportes":
    case "transporte":
      return <MdDirectionsCar />;
    case "vuelos":
    case "vuelo":
      return <MdFlight />;
    case "trenes":
    case "tren":
      return <MdTrain />;
    case "restaurantes":
    case "restaurante":
      return <MdRestaurant />;
    case "tickets":
      return <MdLocalActivity />;
    case "endoses":
      return <MdAssignment />;
    case "guias":
      return <MdPerson />;
    default:
      return <MdLocalActivity />;
  }
};

const getSummaryServiceName = (service) => {
  if (!service) return "Servicio sin nombre";
  const parentName =
    service.parentService?.nombre_hotel ||
    service.parentService?.nombre_transporte ||
    service.parentService?.aerolinea ||
    service.parentService?.nombre ||
    service.parentService?.nombre_empresa ||
    service.parentService?.nombre_agencia ||
    service.childService?.restaurante?.nombre ||
    service.childService?.ticket?.entrada ||
    service.childService?.servicio_extra?.nombre ||
    (service.parentService?.persona
      ? `${service.parentService.persona.nombres || ""} ${
          service.parentService.persona.apellidos || ""
        }`.trim()
      : "") ||
    "";
  const childName =
    service.childService?.tipo_habitacion ||
    service.childService?.tipo_auto ||
    service.childService?.tipo_vuelo?.tipovuelo ||
    service.childService?.nombre ||
    service.childService?.tipo_tren ||
    service.childService?.ruta?.tour_nombre ||
    service.parentService?.tipo_tour ||
    "";

  if (parentName && childName) return `${parentName} - ${childName}`;
  return (
    parentName ||
    childName ||
    service.nombre ||
    service.title ||
    "Servicio sin nombre"
  );
};

const getDocumentPreviewUrl = (doc) =>
  doc?.proxyUrl || (doc?.tigrisUrl ? getProxyUrl(doc.tigrisUrl) : doc?.url);

const getDocumentMimeType = (doc = {}) =>
  String(
    doc.fileType ||
      doc.file_type ||
      doc.mimeType ||
      doc.mime_type ||
      doc.contentType ||
      "",
  ).toLowerCase();

const isPdfDocument = (doc = {}) => {
  const mimeType = getDocumentMimeType(doc);
  const filename = String(doc.filename || doc.fileName || "").toLowerCase();
  return mimeType.includes("pdf") || filename.endsWith(".pdf");
};

const isImageDocument = (doc = {}) => getDocumentMimeType(doc).startsWith("image/");

const getDocumentId = (doc = {}) =>
  doc.id ||
  doc.id_documento ||
  doc.documentId ||
  doc.document_id ||
  doc.filename ||
  doc.fileName ||
  doc.proxyUrl ||
  doc.tigrisUrl ||
  doc.url;

const getDocumentKey = (doc, category, index) =>
  `${category}-${getDocumentId(doc) || "document"}-${index}`;

const getPassengerKey = (passenger = {}, index) =>
  passenger.id ||
  passenger.id_pasajero ||
  passenger.id_persona ||
  `${passenger.nombres || "pasajero"}-${passenger.apellidos || ""}-${index}`;

const getMovimientoKey = (mov = {}, index) =>
  mov.id || mov.id_movimiento || mov.id_movimiento_contable || index;

const getDayKey = (day = {}, index) =>
  day.id || day.id_dia || day.numero || `day-${index}`;

const getServiceKey = (service = {}, prefix, index) =>
  `${prefix}-${service.servicioId || service.id || service.id_servicio || service.id_itinerario_servicio || service.uuid || "service"}-${index}`;

const formatDocumentSize = (size) => {
  const bytes = Number(size || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "Tamano no disponible";
  return `${(bytes / 1024).toFixed(1)} KB`;
};

const DocumentPreviewModal = ({ isOpen, onClose, document }) => {
  if (!isOpen) return null;

  const documentUrl = getDocumentPreviewUrl(document);
  const filename = document?.filename || "documento";
  const isPdf = isPdfDocument(document);
  const isImage = isImageDocument(document);

  return (
    <div className="image-preview-overlay" onClick={onClose}>
      <div className="image-preview-modal" onClick={(e) => e.stopPropagation()}>
        <button className="preview-close-btn" onClick={onClose}>
          <MdClose size={24} />
        </button>
        {isPdf ? (
          <div className="preview-file-placeholder preview-file-placeholder--pdf">
            <MdDescription size={56} />
            <span>El PDF esta listo para abrirse.</span>
            <small>
              La vista incrustada puede ser bloqueada por la politica CSP del
              servidor.
            </small>
            {documentUrl && (
              <a
                href={documentUrl}
                target="_blank"
                rel="noreferrer"
                className="preview-open-btn"
                onClick={(e) => e.stopPropagation()}
              >
                <MdVisibility size={18} />
                Abrir PDF
              </a>
            )}
          </div>
        ) : isImage ? (
          <img src={documentUrl} alt={filename} className="preview-image" />
        ) : (
          <div className="preview-file-placeholder">
            <MdDescription size={48} />
            <span>Vista previa no disponible</span>
          </div>
        )}
        <div className="preview-filename">{filename}</div>
        {documentUrl && (
          <a
            href={documentUrl}
            download={filename}
            className="preview-download-btn"
            onClick={(e) => e.stopPropagation()}
          >
            <MdDownload size={20} />
            Descargar
          </a>
        )}
      </div>
    </div>
  );
};

const VentasSummaryModal = ({ isOpen, onClose, voucher }) => {
  const [loading, setLoading] = useState(true);
  const [voucherData, setVoucherData] = useState(null);
  const [passengers, setPassengers] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [loadingMovimientos, setLoadingMovimientos] = useState(false);
  const [showMovimientoPreview, setShowMovimientoPreview] = useState(false);
  const [selectedMovimiento, setSelectedMovimiento] = useState(null);
  const [activeTab, setActiveTab] = useState("pasajeros"); // pasajeros, documentos, pagos, itinerario
  const [previewImage, setPreviewImage] = useState(null);
  const [showImagePreview, setShowImagePreview] = useState(false);

  // Cargar datos completos del voucher, pasajeros, documentos y movimientos
  useEffect(() => {
    if (!isOpen || !voucher?.id) {
      return;
    }

    const loadAllData = async () => {
      setLoading(true);
      setLoadingMovimientos(true);
      try {
        // Cargar voucher con cotizacion
        const voucherResponse =
          await voucherVentaService.getVoucherWithCotizacionById(voucher.id);
        setVoucherData(voucherResponse.data);

        // Cargar pasajeros desde el endpoint correcto
        const passengersData =
          await pasajeroService.getPassengersByVoucherVenta(voucher.id);
        setPassengers(passengersData || []);

        // Cargar documentos
        const documentsResponse =
          await voucherDocumentService.getDocumentsByVoucherId(voucher.id);

        // Los documentos vienen agrupados por tipo en data.data
        if (documentsResponse.success && documentsResponse.data) {
          const backendDocs =
            documentsResponse.data.data || documentsResponse.data;

          // Convertir a array plano con tipo de documento y proxyUrl absoluta
          const allDocs = [];

          // Helper para agregar proxyUrl absoluta a cada documento
          const addProxyUrl = (doc, tipo) => ({
            ...doc,
            documentoTipo: tipo,
            fileType: doc.fileType || doc.file_type || doc.mimeType,
            fileSize: doc.fileSize || doc.file_size || doc.size,
            tigrisUrl: doc.tigrisUrl || doc.tigris_url,
            proxyUrl: doc.proxyUrl || doc.proxy_url
              ? makeProxyUrlAbsolute(doc.proxyUrl || doc.proxy_url)
              : doc.tigrisUrl || doc.tigris_url
                ? getProxyUrl(doc.tigrisUrl || doc.tigris_url)
                : null,
          });

          if (backendDocs.passports) {
            backendDocs.passports.forEach((doc) =>
              allDocs.push(addProxyUrl(doc, "passport")),
            );
          }
          if (backendDocs.idCards) {
            backendDocs.idCards.forEach((doc) =>
              allDocs.push(addProxyUrl(doc, "idcard")),
            );
          }
          if (backendDocs.otherDocuments) {
            backendDocs.otherDocuments.forEach((doc) =>
              allDocs.push(addProxyUrl(doc, "other")),
            );
          }

          setDocuments(allDocs);
        }

        // Cargar solo movimientos de pago de la cotización asociados a este voucher.
        const movResponse = await contabilidadService.getMovimientos();
        const pagosCotizacion = filterVoucherPaymentMovements(
          movResponse.data || [],
          voucher,
        );

        setMovimientos(pagosCotizacion);
      } catch (error) {
        console.error("Error cargando datos:", error);
        setMovimientos([]);
      } finally {
        setLoading(false);
        setLoadingMovimientos(false);
      }
    };

    loadAllData();
  }, [isOpen, voucher?.id]);

  // El total nace en cotización y los pagos nacen exclusivamente en movimientos.
  const paymentSummary = useMemo(() => {
    const summary = summarizeVoucherFinancials({
      voucher: voucherData || voucher,
      cotizacion: voucherData?.cotizacion_data || voucher?.cotizacion_data,
      movimientos,
    });

    return {
      totalPagado: summary.totalPaid,
      totalCotizacion: summary.totalFinal,
      pendiente: summary.remainingAmount,
      estado:
        summary.paymentStatus === "completed"
          ? "Pagado"
          : summary.paymentStatus === "partial"
            ? "Parcial"
            : "Pendiente",
    };
  }, [movimientos, voucherData, voucher]);

  const summaryItineraryDays = useMemo(
    () => mergeSummaryItineraryDays(voucherData),
    [voucherData],
  );

  // Organizar documentos por pasajero (igual que PassengerDocuments)
  const documentsByPassenger = useMemo(() => {
    if (!documents.length || !passengers.length) {
      return [];
    }

    const organized = [];

    passengers.forEach((passenger) => {
      const passengerId = passenger.id || passenger.id_pasajero;

      // Filtrar documentos de este pasajero
      const passengerDocs = documents.filter((doc) => {
        return doc.passengerId === passengerId;
      });

      if (passengerDocs.length > 0) {
        // Organizar por categoría
        const categorizedDocs = {
          passports: [],
          idCards: [],
          otherDocuments: [],
        };

        passengerDocs.forEach((doc) => {
          if (doc.documentoTipo === "passport") {
            categorizedDocs.passports.push(doc);
          } else if (doc.documentoTipo === "idcard") {
            categorizedDocs.idCards.push(doc);
          } else {
            categorizedDocs.otherDocuments.push(doc);
          }
        });

        organized.push({
          passenger,
          ...categorizedDocs,
        });
      }
    });

    return organized;
  }, [passengers, documents]);

  const handleViewMovimiento = async (movimientoId) => {
    try {
      const response =
        await contabilidadService.getMovimientoById(movimientoId);
      setSelectedMovimiento(response.data);
      setShowMovimientoPreview(true);
    } catch (error) {
      console.error("Error al cargar movimiento:", error);
    }
  };

  const handleImageClick = (doc) => {
    setPreviewImage(doc);
    setShowImagePreview(true);
  };

  if (!isOpen) return null;

  return (
    <div className="ventas-summary-overlay">
      <div className="ventas-summary-modal">
        {/* Header */}
        <div className="modal-header">
          <div className="header-content">
            <h2>Resumen de Voucher de Venta</h2>
            <div className="voucher-info">
              <span className="voucher-code">#{voucher?.voucher_code}</span>
              <span className="voucher-date">
                <MdCalendarToday size={16} />
                {new Date(voucher?.created_at).toLocaleDateString("es-ES")}
              </span>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn-close" onClick={onClose}>
              <MdClose size={24} />
            </button>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="tabs-navigation">
          <button
            className={`tab-btn ${activeTab === "pasajeros" ? "active" : ""}`}
            onClick={() => setActiveTab("pasajeros")}
          >
            <MdPerson size={20} />
            Pasajeros
          </button>
          <button
            className={`tab-btn ${activeTab === "documentos" ? "active" : ""}`}
            onClick={() => setActiveTab("documentos")}
          >
            <MdDescription size={20} />
            Documentos
          </button>
          <button
            className={`tab-btn ${activeTab === "pagos" ? "active" : ""}`}
            onClick={() => setActiveTab("pagos")}
          >
            <MdPayment size={20} />
            Pagos
          </button>
          <button
            className={`tab-btn ${activeTab === "itinerario" ? "active" : ""}`}
            onClick={() => setActiveTab("itinerario")}
          >
            <MdLocationOn size={20} />
            Itinerario
          </button>
        </div>

        {/* Content */}
        <div className="modal-content">
          {loading ? (
            <div className="loading-state">Cargando información...</div>
          ) : (
            <>
              {/* Tab: Pasajeros */}
              {activeTab === "pasajeros" && (
                <div className="tab-content passengers-tab">
                  <div className="section-header">
                    <h3>Información de Pasajeros</h3>
                  </div>

                  {passengers.length === 0 ? (
                    <div className="empty-state">
                      <MdWarning size={48} />
                      <p>No hay pasajeros registrados</p>
                    </div>
                  ) : (
                    <div className="passengers-section">
                      <div className="passengers-grid">
                        {passengers.map((passenger, index) => (
                          <div
                            key={getPassengerKey(passenger, index)}
                            className="passenger-card"
                          >
                            <div
                              className={`passenger-icon ${passenger.tipo_pasajero === "child" ? "child" : ""}`}
                            >
                              <MdPerson size={24} />
                            </div>
                            <div className="passenger-info">
                              <h5>
                                {passenger.nombres} {passenger.apellidos}
                              </h5>
                              {passenger.tipo_pasajero === "child" && (
                                <span className="passenger-type">Niño</span>
                              )}
                              <div className="info-row">
                                <MdCalendarToday size={14} />
                                <span>
                                  {passenger.fecha_nacimiento || "N/A"}
                                </span>
                              </div>
                              <div className="info-row">
                                <MdLocationOn size={14} />
                                <span>{passenger.nacionalidad || "N/A"}</span>
                              </div>
                              {passenger.email && (
                                <div className="info-row">
                                  <MdEmail size={14} />
                                  <span>{passenger.email}</span>
                                </div>
                              )}
                              {passenger.telefono && (
                                <div className="info-row">
                                  <MdPhone size={14} />
                                  <span>{passenger.telefono}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Documentos */}
              {activeTab === "documentos" && (
                <div className="tab-content documents-tab">
                  <div className="section-header">
                    <h3>Documentos de Pasajeros</h3>
                  </div>

                  {documentsByPassenger.length === 0 ? (
                    <div className="empty-state">
                      <MdWarning size={48} />
                      <p>No hay documentos registrados</p>
                    </div>
                  ) : (
                    <div className="documents-list">
                      {documentsByPassenger.map((item, idx) => {
                        const totalDocs =
                          item.passports.length +
                          item.idCards.length +
                          item.otherDocuments.length;

                        return (
                          <div
                            key={getPassengerKey(item.passenger, idx)}
                            className="passenger-documents"
                          >
                            <div className="passenger-header">
                              <MdPerson size={20} />
                              <span>
                                {item.passenger.nombres}{" "}
                                {item.passenger.apellidos}
                              </span>
                              <span className="doc-count">
                                ({totalDocs} documento
                                {totalDocs !== 1 ? "s" : ""})
                              </span>
                            </div>

                            {/* Pasaportes */}
                            {item.passports.length > 0 && (
                              <div className="document-category">
                                <h4>Pasaportes</h4>
                                <div className="documents-grid">
                                  {item.passports.map((doc, docIdx) => (
                                    <div
                                      key={getDocumentKey(
                                        doc,
                                        "passport",
                                        docIdx,
                                      )}
                                      className="document-card"
                                      onClick={() => handleImageClick(doc)}
                                    >
                                      <div className="document-preview">
                                        {isImageDocument(doc) ? (
                                          <img
                                            src={getDocumentPreviewUrl(doc)}
                                            alt={doc.filename}
                                          />
                                        ) : (
                                          <div className="file-icon">
                                            <MdDescription size={40} />
                                          </div>
                                        )}
                                      </div>
                                      <div className="document-info">
                                        <span className="filename">
                                          {doc.filename}
                                        </span>
                                        <span className="filesize">
                                          {formatDocumentSize(doc.fileSize)}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Documentos de Identidad */}
                            {item.idCards.length > 0 && (
                              <div className="document-category">
                                <h4>Documentos de Identidad</h4>
                                <div className="documents-grid">
                                  {item.idCards.map((doc, docIdx) => (
                                    <div
                                      key={getDocumentKey(
                                        doc,
                                        "idcard",
                                        docIdx,
                                      )}
                                      className="document-card"
                                      onClick={() => handleImageClick(doc)}
                                    >
                                      <div className="document-preview">
                                        {isImageDocument(doc) ? (
                                          <img
                                            src={getDocumentPreviewUrl(doc)}
                                            alt={doc.filename}
                                          />
                                        ) : (
                                          <div className="file-icon">
                                            <MdDescription size={40} />
                                          </div>
                                        )}
                                      </div>
                                      <div className="document-info">
                                        <span className="filename">
                                          {doc.filename}
                                        </span>
                                        <span className="filesize">
                                          {formatDocumentSize(doc.fileSize)}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Otros Documentos */}
                            {item.otherDocuments.length > 0 && (
                              <div className="document-category">
                                <h4>Otros Documentos</h4>
                                <div className="documents-grid">
                                  {item.otherDocuments.map((doc, docIdx) => (
                                    <div
                                      key={getDocumentKey(
                                        doc,
                                        "other",
                                        docIdx,
                                      )}
                                      className="document-card"
                                      onClick={() => handleImageClick(doc)}
                                    >
                                      <div className="document-preview">
                                        {isImageDocument(doc) ? (
                                          <img
                                            src={getDocumentPreviewUrl(doc)}
                                            alt={doc.filename}
                                          />
                                        ) : (
                                          <div className="file-icon">
                                            <MdDescription size={40} />
                                          </div>
                                        )}
                                      </div>
                                      <div className="document-info">
                                        <span className="filename">
                                          {doc.filename}
                                        </span>
                                        <span className="filesize">
                                          {formatDocumentSize(doc.fileSize)}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Pagos */}
              {activeTab === "pagos" && (
                <div className="tab-content payments-tab">
                  <div className="section-header">
                    <h3>Registro de Pagos</h3>
                    <div className="payment-status">
                      {paymentSummary.estado === "Pagado" && (
                        <MdCheckCircle className="status-icon paid" />
                      )}
                      {paymentSummary.estado === "Parcial" && (
                        <MdWarning className="status-icon partial" />
                      )}
                      {paymentSummary.estado === "Pendiente" && (
                        <MdCancel className="status-icon pending" />
                      )}
                      <span
                        className={`status-text ${paymentSummary.estado.toLowerCase()}`}
                      >
                        {paymentSummary.estado}
                      </span>
                    </div>
                  </div>

                  {/* Resumen de pagos */}
                  <div className="payment-summary-card">
                    <div className="summary-row">
                      <span className="label">Total Cotización:</span>
                      <span className="value">
                        {" "}
                        {formatCurrency(paymentSummary.totalCotizacion)}
                      </span>
                    </div>
                    <div className="summary-row paid">
                      <span className="label">Total Pagado:</span>
                      <span className="value">
                        {" "}
                        {formatCurrency(paymentSummary.totalPagado)}
                      </span>
                    </div>
                    <div className="summary-row pending">
                      <span className="label">Pendiente:</span>
                      <span className="value">
                        {" "}
                        {formatCurrency(paymentSummary.pendiente)}
                      </span>
                    </div>
                  </div>

                  {/* Lista de movimientos */}
                  {loadingMovimientos ? (
                    <div className="loading-state">Cargando pagos...</div>
                  ) : movimientos.length === 0 ? (
                    <div className="empty-state">
                      <MdPayment size={48} />
                      <p>No hay pagos registrados</p>
                    </div>
                  ) : (
                    <div className="payments-list">
                      {movimientos.map((mov, index) => (
                        <div
                          key={getMovimientoKey(mov, index)}
                          className="payment-item"
                        >
                          <div className="payment-icon">
                            <MdPayment size={24} />
                          </div>
                          <div className="payment-info">
                            <h5>{mov.descripcion || "Pago sin descripción"}</h5>
                            <div className="payment-details">
                              <span className="payment-date">
                                <MdCalendarToday size={14} />
                                {new Date(mov.fecha).toLocaleDateString(
                                  "es-ES",
                                )}
                              </span>
                              <span className="payment-method">
                                {mov.metodo_pago || "N/A"}
                              </span>
                            </div>
                          </div>
                          <div className="payment-amount">
                            <span className="amount">
                              {formatCurrency(
                                parseFloat(mov.monto),
                                mov.moneda,
                              )}
                            </span>
                            <button
                              className="btn-view"
                              onClick={() => handleViewMovimiento(mov.id)}
                            >
                              <MdVisibility size={18} />
                              Ver detalles
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Itinerario */}
              {activeTab === "itinerario" && (
                <div className="tab-content itinerary-tab">
                  <div className="section-header">
                    <h3>Itinerario del Viaje</h3>
                  </div>

                  {summaryItineraryDays.length === 0 ? (
                    <div className="empty-state">
                      <MdLocationOn size={48} />
                      <p>No hay itinerario disponible</p>
                    </div>
                  ) : (
                    <div className="itinerary-list">
                      {summaryItineraryDays.map((day, dayIdx) => (
                        <div
                          key={getDayKey(day, dayIdx)}
                          className="day-section"
                        >
                          <div className="day-header">
                            <div className="day-title-group">
                              <span className="day-number">
                                Día {day.numero || dayIdx + 1}
                              </span>
                              <h4>{day.titulo || `Día ${dayIdx + 1}`}</h4>
                            </div>
                            <h4>Día {day.numero || dayIdx + 1}</h4>
                            {day.externalServices?.length > 0 && (
                              <span className="day-external-badge">
                                {day.externalOnly
                                  ? "Día externo"
                                  : "Con itinerario externo"}
                              </span>
                            )}
                          </div>
                          <div className="services-list">
                            {groupTicketServicesForItinerary(day.mainServices).map((service, serviceIdx) => {
                              if (service?.__ticketGroup) {
                                return (
                                  <div
                                    key={getServiceKey(
                                      service,
                                      `ticket-group-${day.numero || dayIdx}-${service.key}`,
                                      serviceIdx,
                                    )}
                                    className="service-wrapper service-wrapper--summary service-wrapper--ticket-group"
                                  >
                                    <div className="service-summary-header">
                                      <span className="service-summary-icon">
                                        <MdLocalActivity />
                                      </span>
                                      <span className="service-summary-name">
                                        {service.entrada}
                                      </span>
                                      <span className="service-origin-badge">
                                        Tickets agrupados
                                      </span>
                                    </div>
                                    <div className="ticket-group-details">
                                      {(service.services || []).map((ticketService, ticketIndex) => {
                                        const procedencia = normalizeTicketProcedencia(
                                          getTicketProcedencia(ticketService),
                                        );
                                        const tipoUsuario = getTicketTipoUsuario(ticketService);
                                        const paxCount =
                                          ticketService?.passengerSelection?.selectedIds?.length ||
                                          ticketService?.assignedPassengerIds?.length ||
                                          0;
                                        return (
                                          <span
                                            key={getServiceKey(
                                              ticketService,
                                              `${day.numero || dayIdx}-${service.key}-ticket`,
                                              ticketIndex,
                                            )}
                                            className={`ticket-group-detail ticket-group-detail--${procedencia || "none"}`}
                                          >
                                            {procedencia || "sin procedencia"} · {tipoUsuario} · {paxCount} pax
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={getServiceKey(
                                    service,
                                    `main-${day.numero || dayIdx}`,
                                    serviceIdx,
                                  )}
                                  className="service-wrapper service-wrapper--summary"
                                >
                                  <div className="service-summary-header">
                                    <span className="service-summary-icon">
                                      {getSummaryServiceIcon(service)}
                                    </span>
                                    <span className="service-summary-name">
                                      {getSummaryServiceName(service)}
                                    </span>
                                  </div>
                                  <ServiceDetailedInfo
                                    service={service}
                                    categoryId={service.typeService}
                                    className="compact"
                                  />
                                </div>
                              );
                            })}
                            {day.externalServices?.map(
                              (service, serviceIdx) => (
                                <div
                                  key={getServiceKey(
                                    service,
                                    `external-${day.numero || dayIdx}`,
                                    serviceIdx,
                                  )}
                                  className="service-wrapper service-wrapper--summary service-wrapper--external"
                                >
                                  <div className="service-summary-header">
                                    <span className="service-summary-icon">
                                      {getSummaryServiceIcon(service)}
                                    </span>
                                    <span className="service-summary-name">
                                      {getSummaryServiceName(service)}
                                    </span>
                                    <span className="service-origin-badge">
                                      Itinerario externo
                                    </span>
                                  </div>
                                  <ServiceDetailedInfo
                                    service={service}
                                    categoryId={service.typeService}
                                    className="compact"
                                  />
                                </div>
                              ),
                            )}
                            {!day.mainServices?.length &&
                              !day.externalServices?.length && (
                                <div className="day-empty-services">
                                  Sin servicios registrados para este día
                                </div>
                              )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal de preview de movimiento - debe aparecer encima de VentasSummaryModal */}
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

      {/* Modal de preview de documentos */}
      {showImagePreview && previewImage && (
        <DocumentPreviewModal
          isOpen={showImagePreview}
          onClose={() => {
            setShowImagePreview(false);
            setPreviewImage(null);
          }}
          document={previewImage}
        />
      )}
    </div>
  );
};

export default VentasSummaryModal;
