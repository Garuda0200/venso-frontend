/**
 * Diálogo de detalles de un registro de log.
 * Muestra operación, entidad, usuario, endpoint e información técnica.
 */
import { Dialog } from "primereact/dialog";
import {
  FaBook,
  FaCheck,
  FaExclamationCircle,
  FaUser,
  FaCalendarAlt,
  FaServer,
  FaInfoCircle,
  FaExclamationTriangle,
} from "react-icons/fa";
import { OPERATION_LABEL_MAP, ENTITY_LABEL_MAP } from "./logConstants";
import { getOperationIcon, getEntityIcon, parseLogDetails } from "./logHelpers";

export default function LogDetailsDialog({ log, visible, onHide }) {
  if (!log) return null;

  const parsedDetails = parseLogDetails(log.details);

  return (
    <Dialog
      header={
        <div className="log-detail-header">
          <FaBook className="header-icon" />
          <span>Detalles del Registro de Actividad</span>
          <div className="header-border" />
        </div>
      }
      visible={visible}
      style={{ width: "1000px", maxWidth: "95vw", maxHeight: "90vh" }}
      onHide={onHide}
      className="log-details-dialog simplified"
      modal
      draggable={false}
      resizable={false}
    >
      <div className="log-details">
        {/* Header con operación + estado */}
        <div className="log-details-header">
          <div className="operation-section">
            <div className="operation-badge">
              <div className="operation-icon">
                {getOperationIcon(log.operation_type)}
              </div>
              <span className="operation-text">
                {OPERATION_LABEL_MAP[log.operation_type] || log.operation_type}
              </span>
            </div>
          </div>
          <div className="status-section">
            <div className={`status-badge ${log.status ? "success" : "error"}`}>
              {log.status ? (
                <FaCheck className="status-icon" />
              ) : (
                <FaExclamationCircle className="status-icon" />
              )}
              <span className="status-text">{log.statusText}</span>
            </div>
          </div>
        </div>

        {/* Cards resumen */}
        <div className="summary-cards">
          <div className="summary-card entity-card">
            <div className="card-icon">{getEntityIcon(log.entity_type)}</div>
            <div className="card-content">
              <div className="card-label">Entidad Afectada</div>
              <div className="card-value">
                {ENTITY_LABEL_MAP[log.entity_type] || log.entity_type}
                {log.entity_id && (
                  <span className="entity-id">#{log.entity_id}</span>
                )}
              </div>
            </div>
          </div>

          <div className="summary-card user-card">
            <div className="card-icon">
              <FaUser />
            </div>
            <div className="card-content">
              <div className="card-label">Usuario Responsable</div>
              <div className="card-value">
                {log.user_fullname ||
                  (log.dniuser
                    ? `Usuario (${log.dniuser})`
                    : "Sistema Automático")}
              </div>
            </div>
          </div>

          <div className="summary-card date-card">
            <div className="card-icon">
              <FaCalendarAlt />
            </div>
            <div className="card-content">
              <div className="card-label">Fecha y Hora</div>
              <div className="card-value">{log.formattedDate}</div>
            </div>
          </div>

          {log.request_path && (
            <div className="summary-card path-card full-width">
              <div className="card-icon">
                <FaServer />
              </div>
              <div className="card-content">
                <div className="card-label">Endpoint de API</div>
                <div className="card-value">
                  <div className="endpoint-info">
                    {log.request_method && (
                      <span
                        className={`http-method method-${log.request_method.toLowerCase()}`}
                      >
                        {log.request_method}
                      </span>
                    )}
                    <span className="endpoint-path">{log.request_path}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Información técnica */}
        {Object.keys(parsedDetails).length > 0 && (
          <div className="technical-details">
            <div className="section-title">
              <FaInfoCircle className="section-icon" />
              <span>Información Técnica Detallada</span>
            </div>
            <div className="details-grid">
              {Object.entries(parsedDetails).map(([key, value]) => (
                <div key={key} className="detail-row">
                  <div className="detail-label">{key}</div>
                  <div className="detail-content">
                    {typeof value === "object"
                      ? JSON.stringify(value, null, 2)
                      : String(value)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {log.error_details && (
          <div className="error-details">
            <div className="section-title error-title">
              <FaExclamationTriangle className="section-icon" />
              <span>Detalles del Error</span>
            </div>
            <div className="error-content">
              <pre className="error-message">{log.error_details}</pre>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
