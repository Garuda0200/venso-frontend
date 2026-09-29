import React from "react";
import { FaHotel } from "react-icons/fa";
import { MdClose } from "react-icons/md";
import { formatCurrency } from "../../../../utils/formatters";
import "./AutoHotelCard.scss";

const AutoHotelCard = ({ service, dayIndex, serviceIndex, onRemove }) => {
  const child = service?.childService || {};
  const parent = service?.parentService || {};

  const hotelName =
    parent?.nombre_hotel || parent?.nombre || service?.hotelName || "Hotel";
  const category = (
    parent?.categoria ||
    service?.hotelCategory ||
    ""
  ).toString();
  const nights =
    Number(child?.nights ?? service?.hotelNights ?? service?.nights ?? 1) || 1;
  const perNightSum = Number(service?.hotelPerNightSum ?? 0) || 0;
  const totalFacturado = Number(service?.hotelTotalFacturado ?? 0) || 0;
  const mix = child?.mix || service?.hotelMix || {};

  return (
    <div
      className="auto-hotel-card"
      data-day={dayIndex}
      data-svc={serviceIndex}
    >
      <div className="ahc-header">
        <div className="ahc-title">
          <FaHotel />
          <span className="name">{hotelName}</span>
          {category && (
            <span className={`badge badge-${category.replace("3s", "3")}`}>
              {category.toUpperCase()}
            </span>
          )}
          {nights > 0 && <span className="chip">{nights}n</span>}
        </div>
        <button
          className="ahc-remove"
          onClick={onRemove}
          title="Quitar hotel del día"
        >
          <MdClose />
        </button>
      </div>

      <div className="ahc-body">
        <div className="ahc-row">
          <div className="stat">
            <span className="label">Precio / noche (mix)</span>
            <span className="value">{formatCurrency(perNightSum)}</span>
          </div>
          <div className="stat">
            <span className="label">Total facturado</span>
            <span className="value strong">
              {formatCurrency(totalFacturado)}
            </span>
          </div>
        </div>

        <div className="ahc-mix">
          <span className="label">Mix:</span>
          <div className="mix-pills">
            {Object.keys(mix).length === 0 ? (
              <span className="muted">—</span>
            ) : (
              Object.entries(mix).map(([k, cnt]) => (
                <span className="pill" key={k}>
                  {cnt}× <b>{k}</b>
                </span>
              ))
            )}
          </div>
        </div>

        <p className="hint">
          Este hotel se visualiza aquí para referencia. El costo se calcula en
          el resumen (no suma al subtotal del día).
        </p>
      </div>
    </div>
  );
};

export default AutoHotelCard;
