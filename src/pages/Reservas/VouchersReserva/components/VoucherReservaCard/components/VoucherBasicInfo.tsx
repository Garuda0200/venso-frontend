import React, { useEffect, useMemo, useState } from "react";
import {
  MdPerson,
  MdChildCare,
  MdCalendarToday,
  MdDateRange,
} from "react-icons/md";
import pasajeroService from "../../../../../../services/pasajeroService";
import PassengerPortal from "../../../../../Ventas/VouchersVenta/components/PassengerPortal/PassengerPortal";
import {
  countCanonicalReservationPassengers,
  getCanonicalReservationPassengerType,
} from "../../../utils/passengerClassification";
import "./VoucherBasicInfo.scss";

const VoucherBasicInfo = ({ voucher, formatDate }) => {
  const embeddedPassengers = useMemo(() => {
    const passengerData = voucher.passengerData || voucher.passenger_data || {};
    const adults = Array.isArray(passengerData.adults)
      ? passengerData.adults.map((passenger) => ({
          ...passenger,
          tipo_pasajero: getCanonicalReservationPassengerType(
            passenger,
            "adult",
          ),
        }))
      : [];
    const children = Array.isArray(passengerData.children)
      ? passengerData.children.map((passenger) => ({
          ...passenger,
          tipo_pasajero: getCanonicalReservationPassengerType(
            passenger,
            "child",
          ),
        }))
      : [];
    return [...adults, ...children];
  }, [voucher.passengerData, voucher.passenger_data]);

  const [passengers, setPassengers] = useState(embeddedPassengers);
  const [loadingPassengers, setLoadingPassengers] = useState(false);
  const [showPassengers, setShowPassengers] = useState(false);
  const passengerSummary =
    voucher.passengerSummary || voucher.passenger_summary || null;

  useEffect(() => {
    if (embeddedPassengers.length > 0) {
      setPassengers(embeddedPassengers);
    }
  }, [embeddedPassengers]);

  const handleOpenPassengers = async () => {
    if (!voucher.id || loadingPassengers) return;

    setLoadingPassengers(true);
    try {
      const passengerList =
        await pasajeroService.getPassengersByVoucherVenta(voucher.id);
      const resolvedPassengers = Array.isArray(passengerList)
        ? passengerList
        : embeddedPassengers;
      setPassengers(resolvedPassengers);
      if (resolvedPassengers.length > 0) setShowPassengers(true);
    } catch (error) {
      console.error("Error loading passengers:", error);
      if (embeddedPassengers.length > 0) {
        setPassengers(embeddedPassengers);
        setShowPassengers(true);
      }
    } finally {
      setLoadingPassengers(false);
    }
  };

  // El listado de voucher_venta ya trae passenger_summary. Usarlo evita un
  // request N+1 por cada card; los pasajeros completos se cargan solo al abrir.
  const getTotalPassengers = () => {
    const source = embeddedPassengers.length > 0 ? embeddedPassengers : passengers;
    if (source.length > 0) {
      const counts = countCanonicalReservationPassengers(source);
      return {
        total: counts.total,
        adults: counts.adults,
        children: counts.children + counts.infants,
      };
    }

    const summaryTotal = Number(passengerSummary?.total);
    if (Number.isFinite(summaryTotal)) {
      return {
        total: summaryTotal,
        adults: Number(passengerSummary?.adults) || 0,
        children: Number(passengerSummary?.children) || 0,
      };
    }

    return { total: 0, adults: 0, children: 0 };
  };
  // Las fechas de viaje pertenecen exclusivamente a la cotización asociada.
  const getReservationDates = () => {
    const reservation = voucher.reservationVoucher || voucher.voucher_reserva || {};
    const quote =
      voucher.cotizacionData ||
      voucher.cotizacion_data ||
      reservation.cotizacionData ||
      reservation.cotizacion_data ||
      voucher.cotizacion ||
      {};
    const start = quote.fechainicio;
    const end = quote.fechafin;

    return start && end ? { start, end } : null;
  };

  const passengerCounts = getTotalPassengers();
  const dates = getReservationDates();

  return (
    <>
      <div className="voucher-basic-info compact">
        <div className="info-row single">
          <div
            className="info-item clickable passengers-item"
            onClick={() => passengerCounts.total > 0 && handleOpenPassengers()}
          >
            <div className="passengers-icons">
              {!loadingPassengers && passengerCounts.adults > 0 && (
                <div className="passenger-type adults">
                  <MdPerson className="passenger-icon" />
                  <span className="passenger-count">
                    {passengerCounts.adults}
                  </span>
                </div>
              )}
              {!loadingPassengers && passengerCounts.children > 0 && (
                <div className="passenger-type children">
                  <MdChildCare className="passenger-icon" />
                  <span className="passenger-count">
                    {passengerCounts.children}
                  </span>
                </div>
              )}
            </div>
            <div className="info-content">
              <span className="info-label">Pasajeros</span>
              <span className="info-value">
                {loadingPassengers
                  ? "Cargando..."
                  : `${passengerCounts.total} total`}
              </span>
            </div>
          </div>

          <div className="info-item">
            <MdCalendarToday className="info-icon" />
            <div className="info-content">
              <span className="info-label">Emisión</span>
              <span className="info-value">
                {formatDate(voucher.createdAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="info-row dates-row">
          {dates && (
            <div className="info-item dates-range">
              <MdDateRange className="info-icon" />
              <div className="info-content dates-content">
                <span className="info-label">Fechas Reserva</span>
                <div className="dates-wrapper">
                  <span className="date-badge start">
                    {formatDate(dates.start, true)}
                  </span>
                  <span className="date-arrow">→</span>
                  <span className="date-badge end">
                    {formatDate(dates.end, true)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showPassengers && (
        <PassengerPortal
          passengers={passengers}
          onClose={() => setShowPassengers(false)}
        />
      )}
    </>
  );
};

export default VoucherBasicInfo;
