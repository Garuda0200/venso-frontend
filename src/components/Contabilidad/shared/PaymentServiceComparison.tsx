import React, { useMemo } from "react";
import { MdEast, MdSouth } from "react-icons/md";
import ServiceDetailedInfo from "../../Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/components/ServiceDetailedInfo/ServiceDetailedInfo";
import {
  buildPaymentServiceComparison,
  inferPaymentServiceType,
  normalizePaymentServiceData,
} from "../../../utils/paymentFacturacion";
import "./PaymentServiceComparison.scss";

const formatServiceMoney = (value, currency = "USD") => {
  const normalizedCurrency = String(currency || "USD").toLowerCase();
  const isoCurrency = ["pen", "sol", "soles", "s/"].includes(normalizedCurrency)
    ? "PEN"
    : "USD";

  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: isoCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
};

const PaymentServicePricing = ({ pricing, emptyLabel }) => {
  if (!pricing?.hasPricing) {
    return (
      <div className="payment-service-pricing payment-service-pricing--empty">
        <span className="payment-service-pricing__label">Precios</span>
        <span className="payment-service-pricing__empty">{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="payment-service-pricing">
      <div className="payment-service-pricing__header">
        <span>Precio por persona</span>
        <small>{pricing.currency || "USD"}</small>
      </div>

      <div className="payment-service-pricing__rows">
        {pricing.unit > 0 && (
          <div className="payment-service-pricing__row">
            <span>Adulto</span>
            <div>
              <strong>{formatServiceMoney(pricing.unit, pricing.currency)}</strong>
              {pricing.adultCount > 0 && <small>{pricing.adultCount} pax</small>}
            </div>
          </div>
        )}

        {pricing.childPrices.map((price, index) => (
          <div
            className="payment-service-pricing__row payment-service-pricing__row--child"
            key={`child-${price}-${index}`}
          >
            <span>Niño</span>
            <div>
              <strong>{formatServiceMoney(price, pricing.currency)}</strong>
              <small>precio individual</small>
            </div>
          </div>
        ))}
      </div>

      {pricing.convertedChildCount > 0 && (
        <div className="payment-service-pricing__converted">
          {pricing.convertedChildCount} niño
          {pricing.convertedChildCount === 1 ? "" : "s"} con tarifa de adulto
        </div>
      )}

      <div className="payment-service-pricing__total">
        <span>Total</span>
        <strong>{formatServiceMoney(pricing.total, pricing.currency)}</strong>
      </div>
    </div>
  );
};

const PaymentServiceComparison = ({
  serviceData,
  itinerarioServicioId = null,
  eyebrow = "Solicitud de pago",
  title = "Servicio relacionado",
  showHeading = true,
  embedded = false,
  layout = "vertical",
  className = "",
}) => {
  const normalizedServiceData = useMemo(
    () => normalizePaymentServiceData(serviceData),
    [serviceData],
  );

  const comparison = useMemo(
    () => buildPaymentServiceComparison(normalizedServiceData),
    [normalizedServiceData],
  );

  const quotedType = useMemo(
    () =>
      inferPaymentServiceType(comparison.quoted || normalizedServiceData) ||
      "guias",
    [comparison.quoted, normalizedServiceData],
  );

  if (!normalizedServiceData) return null;

  const isHorizontal = layout === "horizontal";

  return (
    <div
      className={`payment-service-overview${embedded ? " payment-service-overview--embedded" : ""}${isHorizontal ? " payment-service-overview--horizontal" : ""}${className ? ` ${className}` : ""}`}
    >
      {showHeading && (
        <div className="service-info-title-row">
          <div>
            <span className="service-info-eyebrow">{eyebrow}</span>
            <h4 className="service-info-title">{title}</h4>
          </div>
          {itinerarioServicioId && (
            <span className="service-info-reference">
              Servicio #{itinerarioServicioId}
            </span>
          )}
        </div>
      )}

      <div className="payment-service-comparison">
        <section className="payment-service-panel payment-service-panel--quoted">
          <header>
            <div>
              <span>Ventas</span>
              <small>Servicio original de la cotización</small>
            </div>
            <strong>Cotizado</strong>
          </header>
          <div className="payment-service-panel__body">
            {comparison.quoted ? (
              <>
                <ServiceDetailedInfo
                  service={comparison.quoted}
                  categoryId={quotedType}
                />
                <div className="payment-service-panel__pricing">
                  <PaymentServicePricing
                    pricing={comparison.quotedPricing}
                    emptyLabel="Sin precio cotizado disponible"
                  />
                </div>
              </>
            ) : (
              <span className="payment-service-panel__empty">
                No se encontró el servicio original de Ventas.
              </span>
            )}
          </div>
        </section>

        <div className="payment-service-flow-connector" aria-hidden="true">
          {isHorizontal ? <MdEast /> : <MdSouth />}
          <span>Asignación operativa vinculada</span>
        </div>

        <section className="payment-service-panel payment-service-panel--assigned">
          <header>
            <div>
              <span>Reservas</span>
              <small>Proveedor y costo asignados</small>
            </div>
            <strong>{comparison.assigned ? "Asignado" : "Por asignar"}</strong>
          </header>
          <div className="payment-service-panel__body">
            {comparison.assigned ? (
              <>
                <ServiceDetailedInfo
                  service={comparison.assigned}
                  categoryId={
                    inferPaymentServiceType(comparison.assigned) || quotedType
                  }
                />
                <div className="payment-service-panel__pricing">
                  <PaymentServicePricing
                    pricing={comparison.assignedPricing}
                    emptyLabel="Sin costo asignado disponible"
                  />
                </div>
              </>
            ) : (
              <span className="payment-service-panel__empty">
                El servicio todavía no tiene proveedor o costo asignado en
                Reservas.
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default React.memo(PaymentServiceComparison);
