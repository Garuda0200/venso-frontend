import React, { useMemo, useState } from "react";
import {
  MdChildCare,
  MdCheckCircle,
  MdExpandLess,
  MdExpandMore,
  MdHotel,
  MdPerson,
  MdWarning,
} from "react-icons/md";
import { formatCurrency } from "../../utils/formatters";
import { inferHotelRoomCapacityFromType } from "../../../../../../utils/hotelRoomTypes";
import "./PassengerPriceVerification.scss";

const round2 = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getBeneficiaryCount = (part = {}) => {
  const direct = Number(part?.beneficiaries ?? part?.count ?? part?.pax ?? 0);
  if (Number.isFinite(direct) && direct > 0) return Math.floor(direct);

  const match = String(part?.label || "").match(/\((\d+)\)\s*$/);
  return match ? Math.max(1, Number.parseInt(match[1], 10) || 1) : 1;
};

const normalizeText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const inferRoomCapacity = (label = "") =>
  inferHotelRoomCapacityFromType(label);

const cleanRoomLabel = (label = "") =>
  String(label || "Tarifa por pasajero")
    .replace(/^niñ(?:o|os|a|as)\s+/i, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .trim();

const isChildPart = (part = {}) => {
  const className = normalizeText(part?.className);
  const label = normalizeText(part?.label);
  const key = normalizeText(part?.key);
  return (
    className.includes("child") ||
    key.includes("converted") ||
    label.includes("nino") ||
    label.includes("nina")
  );
};

const resolvePartIcon = (part, child) => {
  if (part?.icon) return part.icon;
  if (child) return MdChildCare;
  return inferRoomCapacity(part?.label) ? MdHotel : MdPerson;
};

const PassengerPriceVerification = ({
  parts = [],
  total = 0,
  title = "Verificación por pasajero",
  description = "Tarifa redondeada × pasajeros",
  compact = false,
  initiallyExpanded = true,
}) => {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const rows = useMemo(
    () =>
      (Array.isArray(parts) ? parts : [])
        .map((part, index) => {
          const unitValue = Number(part?.value ?? part?.roundedValue ?? 0);
          if (!Number.isFinite(unitValue) || unitValue <= 0) return null;

          const beneficiaries = getBeneficiaryCount(part);
          const roundedUnit = Math.ceil(unitValue);
          const child = isChildPart(part);
          const roomLabel = cleanRoomLabel(
            part?.roomLabel || part?.label || "Tarifa por pasajero",
          );
          const capacity =
            Number(part?.roomCapacity || 0) || inferRoomCapacity(roomLabel);
          const Icon = resolvePartIcon(part, child);
          const igvPerPerson = round2(part?.igvPerPerson);
          const hotelPerPerson = round2(part?.hotelPerPerson);
          const hotelBasePerPerson =
            part?.hotelBasePerPerson != null
              ? round2(part.hotelBasePerPerson)
              : Math.max(0, round2(hotelPerPerson - igvPerPerson));
          const isNationalRoom = Boolean(
            (part?.isNationalRoom || part?.hasIgv) && igvPerPerson > 0,
          );

          return {
            key: part?.key || `passenger-price-${index}`,
            child,
            Icon,
            roomLabel,
            capacity,
            beneficiaries,
            roundedUnit,
            subtotal: roundedUnit * beneficiaries,
            isNationalRoom,
            igvPerPerson,
            hotelPerPerson,
            hotelBasePerPerson,
            affectedPaxCount:
              Number(part?.affectedPaxCount || 0) || beneficiaries,
            nationalPassengerLabels: Array.isArray(
              part?.nationalPassengerLabels,
            )
              ? part.nationalPassengerLabels
              : [],
          };
        })
        .filter(Boolean),
    [parts],
  );

  if (rows.length === 0) return null;

  const calculatedTotal = rows.reduce((sum, row) => sum + row.subtotal, 0);
  const expectedTotal = round2(total || calculatedTotal);
  const difference = round2(expectedTotal - calculatedTotal);
  const matches = Math.abs(difference) < 0.01;
  const nationalRows = rows.filter((row) => row.isNationalRoom).length;

  return (
    <section
      className={`pax-price-check ${compact ? "pax-price-check--compact" : ""} ${
        expanded ? "pax-price-check--expanded" : "pax-price-check--collapsed"
      }`.trim()}
      aria-label={title}
    >
      <button
        type="button"
        className="pax-price-check__toggle"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
      >
        <div className="pax-price-check__heading">
          <span className="pax-price-check__heading-icon">
            <MdHotel />
          </span>
          <div>
            <strong>{title}</strong>
            <small>{description}</small>
          </div>
        </div>

        <div className="pax-price-check__header-summary">
          {nationalRows > 0 && (
            <span className="pax-price-check__national-summary">
              {nationalRows} tarifa{nationalRows !== 1 ? "s" : ""} con IGV
            </span>
          )}
          <span
            className={`pax-price-check__status ${
              matches
                ? "pax-price-check__status--ok"
                : "pax-price-check__status--warning"
            }`}
          >
            {matches ? <MdCheckCircle /> : <MdWarning />}
            {matches ? "Cálculo verificado" : "Revisar diferencia"}
          </span>
          <span className="pax-price-check__grand-total">
            <small>Total</small>
            <strong>{formatCurrency(expectedTotal, "dolares", 0)}</strong>
          </span>
          <span className="pax-price-check__chevron">
            {expanded ? <MdExpandLess /> : <MdExpandMore />}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="pax-price-check__content">
          <div className="pax-price-check__rows">
            {rows.map((row) => {
              const Icon = row.Icon;
              return (
                <div
                  className={`pax-price-check__row ${
                    row.child ? "pax-price-check__row--child" : ""
                  } ${
                    row.isNationalRoom
                      ? "pax-price-check__row--national"
                      : ""
                  }`.trim()}
                  key={row.key}
                >
                  <div className="pax-price-check__identity">
                    <span className="pax-price-check__icon">
                      <Icon />
                    </span>
                    <div>
                      <span className="pax-price-check__identity-topline">
                        <strong>{row.roomLabel}</strong>
                        {row.isNationalRoom && (
                          <em className="pax-price-check__national-badge">
                            Nacional · IGV 18%
                          </em>
                        )}
                      </span>
                      <small>
                        {row.child ? "Niño" : "Adulto"}
                        {row.capacity ? ` · Capacidad ${row.capacity}` : ""}
                        {` · ${row.beneficiaries} pax`}
                      </small>
                      {row.isNationalRoom && (
                        <span className="pax-price-check__tax-detail">
                          <span>
                            IGV aplicado a los {row.affectedPaxCount} ocupantes
                            {row.nationalPassengerLabels.length > 0
                              ? ` · ${row.nationalPassengerLabels.join(", ")}`
                              : ""}
                          </span>
                          {row.hotelPerPerson > 0 && (
                            <small>
                              Hotel base {formatCurrency(row.hotelBasePerPerson)} +
                              IGV {formatCurrency(row.igvPerPerson)} = {" "}
                              {formatCurrency(row.hotelPerPerson)} por pax
                            </small>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="pax-price-check__operation">
                    <span>{formatCurrency(row.roundedUnit, "dolares", 0)} / pax</span>
                    <small>× {row.beneficiaries} pasajeros</small>
                  </div>
                  <strong className="pax-price-check__subtotal">
                    {formatCurrency(row.subtotal, "dolares", 0)}
                  </strong>
                </div>
              );
            })}
          </div>

          <div className="pax-price-check__footer">
            <span>
              <small>Suma por pasajeros</small>
              <strong>{formatCurrency(calculatedTotal, "dolares", 0)}</strong>
            </span>
            <span>
              <small>Total de la cotización</small>
              <strong>{formatCurrency(expectedTotal, "dolares", 0)}</strong>
            </span>
            {!matches && (
              <span className="pax-price-check__difference">
                <small>Diferencia</small>
                <strong>{formatCurrency(difference, "dolares", 2)}</strong>
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default React.memo(PassengerPriceVerification);
