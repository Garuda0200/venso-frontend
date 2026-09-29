import {
  MdPlayArrow,
  MdCheck,
  MdWarning,
  MdEdit,
  MdDelete,
  MdSchedule,
} from "react-icons/md";
import "./VoucherItinerary.scss";

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

// Helper: obtener nombre legible del servicio asignado (normalizado)
const getAssignedServiceName = (service) => {
  const parent = service.assignedParentService;
  const child = service.assignedChildService;
  const tipo = service.typeService;

  if (tipo === "hoteles") return parent?.nombre || "Hotel";
  if (tipo === "trenes") return parent?.nombre_empresa || "Tren";
  if (tipo === "restaurantes")
    return child?.restaurante?.nombre || child?.nombre || "Restaurante";
  if (tipo === "transportes") return parent?.nombre_transporte || "Transporte";
  if (tipo === "guias")
    return parent?.persona?.nombres || child?.ruta?.tour_nombre || "Guía";
  if (tipo === "tickets") return child?.ticket?.entrada || "Ticket";
  if (tipo === "endoses") return parent?.tipo_tour || "Endose";
  if (tipo === "vuelos") return parent?.aerolinea || "Vuelo";
  return parent?.nombre || child?.nombre || "Servicio";
};

// Helper: obtener nombre del servicio de cotización (original)
const getCotizacionServiceName = (service) => {
  const tipo = service.typeService || service.parentService?.typeService;
  if (tipo === "hoteles") return service.parentService?.nombre || "Hotel";
  if (tipo === "trenes") return service.parentService?.nombre_empresa || "Tren";
  if (tipo === "restaurantes")
    return (
      service.childService?.restaurante?.nombre ||
      service.childService?.nombre ||
      "Restaurante"
    );
  if (tipo === "transportes")
    return service.parentService?.nombre_transporte || "Transporte";
  if (tipo === "guias")
    return (
      service.parentService?.persona?.nombres ||
      service.childService?.ruta?.tour_nombre ||
      "Guía"
    );
  if (tipo === "tickets")
    return service.childService?.ticket?.entrada || "Ticket";
  if (tipo === "endoses") return service.parentService?.tipo_tour || "Endose";
  if (tipo === "vuelos") return service.parentService?.aerolinea || "Vuelo";
  return service.parentService?.nombre || "Servicio";
};

const VoucherItinerary = ({
  itinerary,
  onAssignService,
  onRemoveAssignedService,
  onRemoveService,
  onRestoreService,
  readOnly = false,
}) => {
  if (!itinerary || itinerary.length === 0) {
    return (
      <div className="empty-itinerary">
        <p>No hay itinerario disponible</p>
      </div>
    );
  }

  return (
    <div className="voucher-itinerary">
      {itinerary.map((day, dayIndex) => (
        <div className="day-container" key={`day-${dayIndex}`}>
          <div className="day-header">
            <span className="day-number">Día {day.numero}</span>
            <span className="day-title">{day.titulo || "Sin título"}</span>
          </div>

          <div className="day-services">
            {day.servicios && day.servicios.length > 0 ? (
              <ul className="services-list">
                {day.servicios.map((service, serviceIndex) => {
                  // Check if the service is marked as removed
                  if (service.isRemoved) {
                    return (
                      <li
                        className="service-item removed"
                        key={`service-${dayIndex}-${serviceIndex}`}
                      >
                        <div className="removed-service-info">
                          <span className="removed-label">
                            Servicio no incluido:{" "}
                            {getCotizacionServiceName(service)}
                          </span>
                          {!readOnly && (
                            <button
                              className="btn-restore-service"
                              onClick={() =>
                                onRestoreService &&
                                onRestoreService(dayIndex, serviceIndex)
                              }
                              title="Restaurar este servicio"
                            >
                              <MdPlayArrow /> Restaurar
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  }

                  return (
                    <li
                      className={`service-item ${service.isAssigned ? "assigned" : ""} ${service.isCustom ? "custom" : ""}`}
                      key={`service-${dayIndex}-${serviceIndex}`}
                    >
                      <div className="cotizacion-service">
                        <div className="service-header">
                          <span className="service-name">
                            {getCotizacionServiceName(service)}
                          </span>
                          <span className="service-type">
                            {service.typeService || "servicio"}
                          </span>
                          {!readOnly && (
                            <button
                              className="btn-remove-service"
                              onClick={() =>
                                onRemoveService &&
                                onRemoveService(dayIndex, serviceIndex)
                              }
                              title="No incluir este servicio"
                            >
                              <MdDelete />
                            </button>
                          )}
                        </div>

                        <div className="service-info">
                          <span className="service-description">
                            {service.descripcion || ""}
                          </span>
                          <div className="service-meta">
                            <span className="service-price">
                              {formatCurrency(
                                parseFloat(
                                  service.tariff?.precio_original ||
                                    service.tariff?.precio ||
                                    0,
                                ),
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      {!readOnly && (
                        <div className="service-assignment">
                          <div className="assignment-status">
                            {service.isAssigned ? (
                              <div className="assigned-status">
                                <MdCheck className="status-icon assigned" />
                                <span>Servicio Validado</span>
                              </div>
                            ) : (
                              <div className="unassigned-status">
                                <MdWarning className="status-icon unassigned" />
                                <span>Pendiente de Validar</span>
                              </div>
                            )}
                          </div>

                          {service.isAssigned &&
                          (service.assignedParentService ||
                            service.assignedChildService) ? (
                            <div className="assigned-service">
                              <div className="assigned-service-details">
                                <div className="assigned-service-header">
                                  <span className="assigned-service-name">
                                    {getAssignedServiceName(service)}
                                  </span>
                                  <span className="assigned-service-type">
                                    {service.typeService}
                                  </span>
                                </div>
                                <div className="assigned-service-info">
                                  {service.hora && (
                                    <div className="assigned-service-time">
                                      <MdSchedule className="time-icon" />
                                      <span>{service.hora}</span>
                                    </div>
                                  )}
                                  <div className="assigned-service-meta">
                                    <span className="assigned-service-price">
                                      {formatCurrency(
                                        parseFloat(
                                          service.assignedTariff
                                            ?.precio_original_with_child_extras ||
                                            service.assignedTariff
                                              ?.precio_original ||
                                            service.assignedTariff?.precio ||
                                            service.tariff?.precio ||
                                            0,
                                        ),
                                      )}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="assigned-service-actions">
                                <button
                                  className="btn-edit-assignment"
                                  onClick={() =>
                                    onAssignService &&
                                    onAssignService(dayIndex, serviceIndex)
                                  }
                                  title="Revisar validación"
                                >
                                  <MdEdit />
                                </button>
                                <button
                                  className="btn-remove-assignment"
                                  onClick={() =>
                                    onRemoveAssignedService &&
                                    onRemoveAssignedService(
                                      dayIndex,
                                      serviceIndex,
                                    )
                                  }
                                  title="Desvalidar servicio"
                                >
                                  <MdDelete />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              className="btn-assign"
                              onClick={() =>
                                onAssignService &&
                                onAssignService(dayIndex, serviceIndex)
                              }
                            >
                              <MdPlayArrow /> Validar Servicio
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="no-services">No hay servicios para este día</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default VoucherItinerary;
