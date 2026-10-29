import React from "react";
import { formatReservationSummaryDate } from "../../utils/reservationSummaryDate";
import {
  MdArrowForward,
  MdCalendarToday,
  MdCheckCircle,
  MdHotel,
  MdOutlineChildCare,
  MdPaid,
  MdPending,
  MdPerson,
  MdReceiptLong,
  MdSchedule,
} from "react-icons/md";
import ServiceDetailedInfo from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/components/ServiceDetailedInfo/ServiceDetailedInfo";
import FlightCodeBadge from "../../../../../components/common/FlightCodeBadge";
import "./ReservationServiceSummaryReport.scss";

const money = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);


const getQuotedHotelRoomType = (service = {}) => {
  const childService =
    service?.quotedChildService ||
    service?.cotizacionServiceRef?.childService ||
    service?.cotizacion_service_ref?.child_service ||
    service?.childService ||
    service?.child_service ||
    {};

  return (
    childService?.tipo_habitacion ||
    childService?.tipoHabitacion ||
    childService?.habitacion?.tipo_habitacion ||
    childService?.habitacion?.tipoHabitacion ||
    service?.habitacion_tipo ||
    service?.habitacionTipo ||
    ""
  );
};

const getAssignedHotelRoomType = (service = {}) => {
  const assignment = service?.assignedService || service?.assigned_service || {};
  const childService =
    service?.assignedChildService ||
    service?.assigned_child_service ||
    assignment?.assignedChildService ||
    assignment?.assigned_child_service ||
    assignment?.childService ||
    assignment?.child_service ||
    {};

  return (
    childService?.tipo_habitacion ||
    childService?.tipoHabitacion ||
    childService?.habitacion?.tipo_habitacion ||
    childService?.habitacion?.tipoHabitacion ||
    service?.assigned_habitacion_tipo ||
    service?.assignedHabitacionTipo ||
    assignment?.habitacion_tipo ||
    assignment?.habitacionTipo ||
    ""
  );
};

const getAssignedHotelRoomId = (service = {}) => {
  const assignment = service?.assignedService || service?.assigned_service || {};
  const childService =
    service?.assignedChildService ||
    service?.assigned_child_service ||
    assignment?.assignedChildService ||
    assignment?.assigned_child_service ||
    assignment?.childService ||
    assignment?.child_service ||
    service?.childService ||
    {};

  return (
    service?.assignedChildId ??
    service?.assigned_child_id ??
    assignment?.assignedChildId ??
    assignment?.assigned_child_id ??
    assignment?.childId ??
    assignment?.child_id ??
    childService?.id_habitacion ??
    childService?.habitacion?.id_habitacion ??
    null
  );
};

const isHotelService = (service = {}) =>
  String(
    service?.typeService ||
      service?.type_service ||
      service?.parentService?.typeService ||
      service?.assignedParentService?.typeService ||
      "",
  )
    .toLowerCase()
    .includes("hotel");

const HotelRoomType = ({ roomType, assignedRoomId = null, isHotel = false }) => {
  if (!isHotel) return null;
  const hasRoomType = Boolean(roomType);
  const hasAssignedRoom = assignedRoomId != null;
  const isPending = !hasRoomType && !hasAssignedRoom;
  const displayType = roomType || (hasAssignedRoom ? "Asignada" : "Pendiente de asignar");

  return (
    <div
      className={`rsr-room-type ${isPending ? "rsr-room-type--pending" : ""}`.trim()}
      title={
        hasRoomType
          ? `Tipo de habitación: ${displayType}`
          : hasAssignedRoom
            ? "La habitación está asignada por su ID operativo; el detalle del catálogo no llegó en esta respuesta."
            : "El hotel está asignado, pero aún no tiene una habitación operativa seleccionada."
      }
    >
      <span>Habitación</span>
      <strong>{displayType}</strong>
    </div>
  );
};

const PricingStack = ({ pricing, emptyLabel = "Sin precio" }) => {
  if (!pricing?.hasPricing) {
    return (
      <div className="rsr-pricing-stack rsr-pricing-stack--empty">
        <span className="rsr-pricing-stack__title">Precios</span>
        <span className="rsr-pricing-empty">{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="rsr-pricing-stack">
      <div className="rsr-pricing-stack__header">
        <span>Precio por persona</span>
        <small>USD</small>
      </div>

      <div className="rsr-pricing-stack__rows">
        {pricing.perAdult > 0 && (
          <div className="rsr-pricing-row">
            <span>
              <MdPerson /> Adulto
            </span>
            <div>
              <strong>{money(pricing.perAdult)}</strong>
              {pricing.adultCount > 0 && <small>{pricing.adultCount} pax</small>}
            </div>
          </div>
        )}

        {(pricing.childPriceGroups || []).map((group) => (
          <div
            key={`child-${group.price}`}
            className="rsr-pricing-row rsr-pricing-row--child"
          >
            <span>
              <MdOutlineChildCare /> Niño
            </span>
            <div>
              <strong>{money(group.price)}</strong>
              {group.count > 0 && <small>{group.count} pax</small>}
            </div>
          </div>
        ))}
      </div>

      {pricing.convertedChildCount > 0 && (
        <div className="rsr-pricing-stack__note">
          {pricing.convertedChildCount} niño
          {pricing.convertedChildCount > 1 ? "s" : ""} con tarifa de adulto
        </div>
      )}

      <div className="rsr-pricing-stack__total">
        <span>Total</span>
        <strong>{money(pricing.total)}</strong>
      </div>
    </div>
  );
};

// El resumen operativo necesita explicar a quién aplica una tarifa sin llevar
// datos personales al modal ni al PDF. Los beneficiarios se condensan por
// tipo; los niños convertidos conservan su propio conteo para no inflar la
// cantidad de adultos.
const BeneficiaryCounts = ({ pricing }) => {
  const convertedChildCount = Math.max(0, Number(pricing?.convertedChildCount) || 0);
  const adultCount = Math.max(
    0,
    (Number(pricing?.adultCount) || 0) - convertedChildCount,
  );
  const childCount = Math.max(0, Number(pricing?.explicitChildCount) || 0);

  if (adultCount === 0 && childCount === 0 && convertedChildCount === 0) {
    return null;
  }

  return (
    <div className="rsr-beneficiary-counts" aria-label="Beneficiarios del servicio">
      {adultCount > 0 && (
        <span className="rsr-beneficiary-count rsr-beneficiary-count--adult">
          <MdPerson /> {adultCount} adulto{adultCount === 1 ? "" : "s"}
        </span>
      )}
      {childCount > 0 && (
        <span className="rsr-beneficiary-count rsr-beneficiary-count--child">
          <MdOutlineChildCare /> {childCount} niño{childCount === 1 ? "" : "s"}
        </span>
      )}
      {convertedChildCount > 0 && (
        <span className="rsr-beneficiary-count rsr-beneficiary-count--converted">
          <MdOutlineChildCare /> {convertedChildCount} con tarifa adulta
        </span>
      )}
    </div>
  );
};

const PaymentBadge = ({ payment, onViewEvidence }) => {
  const Icon = payment?.key === "paid" ? MdCheckCircle : MdPending;
  return (
    <div className={`rsr-payment rsr-payment--${payment?.key || "none"}`}>
      <Icon />
      <span>{payment?.label || "Sin solicitud"}</span>
      {payment?.key === "paid" && onViewEvidence && (
        <button
          type="button"
          className="rsr-no-export"
          onClick={() => onViewEvidence(payment.request)}
        >
          Ver pago
        </button>
      )}
    </div>
  );
};

const ReservationServiceSummaryReport = ({
  model,
  showAssignedCosts = true,
  showOperationalMetadata = false,
  onViewEvidence = null,
  className = "",
}) => {
  if (!model) return null;

  const voucherCode =
    model.voucher?.voucher_code ||
    model.voucher?.voucherCode ||
    model.voucher?.id ||
    "Voucher";
  const quoteTitle =
    model.cotizacion?.titulo ||
    model.cotizacion?.nombre ||
    model.cotizacion?.title ||
    "Itinerario de servicios";
  const quotationSummary = model.quotationSummary || {};
  const pricingParts = Array.isArray(quotationSummary.parts)
    ? quotationSummary.parts
    : Array.isArray(model.commercialPricing?.parts)
      ? model.commercialPricing.parts
      : [];
  const quotedPassengerCount =
    Number(quotationSummary.passengerCount) ||
    Number(model.peopleCount?.total) ||
    0;

  return (
    <article className={`reservation-summary-report ${className}`.trim()}>
      <header className="rsr-header">
        <div>
          <span className="rsr-eyebrow">RESERVAS · ITINERARIO COTIZADO</span>
          <h2>{quoteTitle}</h2>
          <p>
            {voucherCode} · {model.days.length} día
            {model.days.length === 1 ? "" : "s"} · {quotedPassengerCount} pax
            cotizados
          </p>
        </div>
        <div className="rsr-header-meta">
          <span>Inicio</span>
          <strong>{formatReservationSummaryDate(model.fechaInicio)}</strong>
          <span>Asignados</span>
          <strong>
            {model.totals.assignedCount}/{model.totals.serviceCount}
          </strong>
        </div>
      </header>

      <section className="rsr-section rsr-commercial">
        <div className="rsr-section-title">
          <MdReceiptLong />
          <div>
            <h3>Cotización por persona</h3>
            <p>
              Importes por persona y total de la cotización.
            </p>
          </div>
          <div className="rsr-commercial-total">
            <span>Total cotizado</span>
            <strong>
              {money(
                quotationSummary.grandTotal ?? model.totals.commercialGrandTotal,
              )}
            </strong>
          </div>
        </div>

        <div className="rsr-person-prices">
          {pricingParts.length > 0 ? (
            pricingParts.map((part) => (
              <div className="rsr-person-price" key={part.key || part.label}>
                <span>{part.label}</span>
                <strong>{money(part.displayValue ?? part.value)} / persona</strong>
                <small>
                  {part.beneficiaries} pax · subtotal cotizado {money(part.lineTotal)}
                </small>
                <div className="rsr-person-price__parts">
                  {Number(part.services) > 0 && <span>Servicios {money(part.services)}</span>}
                  {Number(part.hotel) > 0 && <span>Hotel {money(part.hotel)}</span>}
                  {Number(part.additional) > 0 && <span>Adicionales {money(part.additional)}</span>}
                  {Number(part.external) > 0 && <span>Externo {money(part.external)}</span>}
                </div>
              </div>
            ))
          ) : (
            <div className="rsr-person-price rsr-person-price--empty">
              <span>Precio total cotizado</span>
              <strong>
                {money(
                  quotationSummary.grandTotal ?? model.totals.commercialGrandTotal,
                )}
              </strong>
            </div>
          )}
        </div>

        {model.additionalCostRows.length > 0 && (
          <div className="rsr-additional-costs">
            {model.additionalCostRows.map((row) => (
              <div key={row.key}>
                <span>{row.label}</span>
                <small>{row.configured}</small>
                <strong>{money(row.calculated)}</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      {model.hotelRows?.length > 0 && (
        <section className="rsr-section rsr-hotel-summary">
          <div className="rsr-section-title">
            <MdHotel />
            <div>
              <h3>Hotel y habitaciones</h3>
              <p>Distribución hotelera utilizada para el precio por persona.</p>
            </div>
          </div>
          <div className="rsr-hotel-rows">
            {model.hotelRows.map((room) => (
              <div key={room.key}>
                <div>
                  <strong>{room.label}</strong>
                  <small>
                    {room.groupLabel ? `${room.groupLabel} · ` : ""}
                    {room.nights} noche{room.nights === 1 ? "" : "s"} · {room.beneficiaries} pax
                  </small>
                </div>
                <span>{money(room.perPerson)} / persona</span>
                <strong>{money(room.total)}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rsr-kpis rsr-kpis--quoted">
        <div>
          <span>Adultos cotizados</span>
          <strong>{money(quotationSummary.adultTotal)}</strong>
          <small>{Number(quotationSummary.adultCount) || 0} pax</small>
        </div>
        <div>
          <span>Niños cotizados</span>
          <strong>{money(quotationSummary.childTotal)}</strong>
          <small>
            {Number(quotationSummary.childCount) > 0
              ? `${quotationSummary.childCount} pax`
              : "Sin tarifa infantil"}
          </small>
        </div>
        <div className="rsr-kpi-total">
          <span>Total cotizado</span>
          <strong>
            {money(
              quotationSummary.grandTotal ?? model.totals.commercialGrandTotal,
            )}
          </strong>
          <small>Precio final informado por Ventas</small>
        </div>
      </section>

      <section className="rsr-days">
        {model.days.map((day) => (
          <div className="rsr-day" key={day.key}>
            <header>
              <div>
                <MdCalendarToday />
                <strong>Día {day.number}</strong>
                <span>{day.title}</span>
              </div>
              <div className="rsr-day-totals">
                <span>Servicios cotizados</span>
                <strong>{money(day.quotedTotal)}</strong>
              </div>
            </header>

            {day.description && <p className="rsr-day-description">{day.description}</p>}
            {day.cities.length > 0 && (
              <div className="rsr-cities">{day.cities.join(" · ")}</div>
            )}

            <div className="rsr-services">
              {day.services.map((service, index) => {
                const sourceLabel =
                  service.sourceLabel ||
                  (service.isExternalItinerary
                    ? "Extras sin fee"
                    : "Itinerario principal");
                const typeLabel = String(service.typeService || "servicio")
                  .replaceAll("_", " ")
                  .toUpperCase();
                const quotedHotelRoomType = getQuotedHotelRoomType(
                  service.quotedServiceData,
                );
                const assignedHotelRoomType = getAssignedHotelRoomType(
                  service.assignedServiceData,
                );
                const assignedHotelRoomId = getAssignedHotelRoomId(
                  service.assignedServiceData,
                );
                const isQuotedHotel = isHotelService(service.quotedServiceData);
                const isAssignedHotel = isHotelService(service.assignedServiceData);

                return (
                  <article
                    className={`rsr-service-card ${
                      service.isExternalItinerary
                        ? "rsr-service-card--external"
                        : "rsr-service-card--main"
                    }`}
                    key={service.key}
                  >
                    <header className="rsr-service-card__header">
                      <div className="rsr-service-number">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <div className="rsr-service-card__heading">
                        <div className="rsr-service-card__meta">
                          <span
                            className={`rsr-source-badge ${
                              service.isExternalItinerary
                                ? "rsr-source-badge--external"
                                : "rsr-source-badge--main"
                            }`}
                          >
                            {sourceLabel}
                          </span>
                          <span className="rsr-type-badge">{typeLabel}</span>
                          {showOperationalMetadata&&service.typeService==="vuelos"&&<FlightCodeBadge service={{servicioId:service.serviceId,codigo:service.codigo}}/>}
                        </div>
                        <strong>
                          Cotizado {money(service.quotedPricing?.total)}
                          {service.assignedServiceData && showAssignedCosts
                            ? ` · Asignado ${money(service.assignedPricing?.total)}`
                            : ""}
                        </strong>
                      </div>
                      <PaymentBadge
                        payment={service.payment}
                        onViewEvidence={onViewEvidence}
                      />
                    </header>

                    <div className="rsr-service-flow">
                      <section className="rsr-service-stage rsr-service-stage--quoted">
                        <header className="rsr-service-stage__header">
                          <div>
                            <span>Ventas</span>
                            <strong>Cotizado</strong>
                          </div>
                          <b>{money(service.quotedPricing?.total)}</b>
                        </header>
                        <div className="rsr-service-stage__content">
                          <div className="rsr-service-stage__service">
                            <HotelRoomType
                              roomType={quotedHotelRoomType}
                              isHotel={isQuotedHotel}
                            />
                            <ServiceDetailedInfo
                              service={service.quotedServiceData}
                              className="compact rsr-service-info"
                              hideHotelRoomType={Boolean(quotedHotelRoomType)}
                            />
                            <BeneficiaryCounts pricing={service.quotedPricing} />
                          </div>
                          <div className="rsr-service-stage__pricing">
                            <PricingStack pricing={service.quotedPricing} />
                          </div>
                        </div>
                      </section>

                      <div
                        className="rsr-service-flow__connector"
                        aria-hidden="true"
                      >
                        <MdArrowForward />
                        <span>Asignación</span>
                      </div>

                      <section className="rsr-service-stage rsr-service-stage--assigned">
                        <header className="rsr-service-stage__header">
                          <div>
                            <span>Reservas</span>
                            <strong>
                              {service.assignedServiceData
                                ? "Asignado"
                                : "Por asignar"}
                            </strong>
                          </div>
                          {service.assignedServiceData && showAssignedCosts && (
                            <b>{money(service.assignedPricing?.total)}</b>
                          )}
                        </header>

                        {service.assignedServiceData ? (
                          <div className="rsr-service-stage__content">
                            <div className="rsr-service-stage__service">
                              <HotelRoomType
                                roomType={assignedHotelRoomType}
                                assignedRoomId={assignedHotelRoomId}
                                isHotel={isAssignedHotel}
                              />
                              <ServiceDetailedInfo
                                service={service.assignedServiceData}
                                className="compact rsr-service-info"
                                hideHotelRoomType={Boolean(assignedHotelRoomType)}
                              />
                              <BeneficiaryCounts pricing={service.assignedPricing} />
                              {service.hora && (
                                <span className="rsr-time">
                                  <MdSchedule /> {service.hora}
                                </span>
                              )}
                            </div>
                            <div className="rsr-service-stage__pricing">
                              {showAssignedCosts ? (
                                <PricingStack pricing={service.assignedPricing} />
                              ) : (
                                <span className="rsr-assigned-restricted">
                                  Asignación registrada en Reservas
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="rsr-service-stage__empty">
                            <span className="rsr-unassigned">
                              Pendiente de proveedor, servicio y costo asignado.
                            </span>
                          </div>
                        )}
                      </section>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <footer className="rsr-footer">
        <MdPaid />
        <span>
          La cabecera reproduce la cotización de Ventas. La asignación y sus
          costos se consultan servicio por servicio en el itinerario.
        </span>
      </footer>
    </article>
  );
};

export default ReservationServiceSummaryReport;
