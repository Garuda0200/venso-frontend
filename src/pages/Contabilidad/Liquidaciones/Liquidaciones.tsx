import React, { useState, useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import {
  FaArrowLeft,
  FaCheckCircle,
  FaMoneyBillWave,
  FaFileInvoiceDollar,
} from "react-icons/fa";
import { usePendingPaymentRequests } from "../../../hooks/usePendingPaymentRequests";
import { resolvePendingPaymentAssignment, resolvePendingPaymentCurrency } from "../../../utils/pendingPayments";
import { buildPendingPaymentGroups, reconcilePendingPaymentSelection } from "./domain/pendingPaymentGroups";
import ServiceDetailedInfo from "../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/components/ServiceDetailedInfo/ServiceDetailedInfo";
import PagoLoteForm from "../../../components/Contabilidad/LiquidacionForm";
import { DateRangeFilter } from "./components/DateRangeFilter";
import { DateFilterDomain } from "./domain/DateFilterDomain";
import { formatCurrency } from "../../../utils/formatters";
import "./Liquidaciones.scss";
import { voucherReservaService } from "../../../services/voucherReservaService";
import { pasajeroService } from "../../../services/pasajeroService";

const EMPTY_REQUESTS: any[] = [];

export function PagosLote() {
  const [view, setView] = useState("services"); // 'services' or 'payments'
  const pending = usePendingPaymentRequests();
  const allPaymentRequests = pending.data ?? EMPTY_REQUESTS;
  const loading = pending.isLoading;
  const [selectedServiceKey, setSelectedServiceKey] = useState<string | null>(null);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("all");

  const [pasajeros, setPasajeros] = useState({});
  const [vouchers, setVouchers] = useState({}); // cache de vouchers por id: { [voucher_reserva_id]: voucherData }

  // Filtro de fechas
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);


  const [showPagoLoteModal, setShowPagoLoteModal] = useState(false);

  const invalidDateRange = Boolean(startDate && endDate && startDate > endDate);
  const services = useMemo(() => {
    if (invalidDateRange) return [];
    const filter = DateFilterDomain.createDateRangeFilter(startDate, endDate);
    return buildPendingPaymentGroups(DateFilterDomain.applyDateFilter(allPaymentRequests, filter), getServiceName);
  }, [allPaymentRequests, startDate, endDate, invalidDateRange]);
  const filteredServices = useMemo(() => selectedTypeFilter === "all" ? services :
    services.filter((service) => service.tipo === selectedTypeFilter), [services, selectedTypeFilter]);
  const selectedService = services.find((service) => service.serviceKey === selectedServiceKey) || null;
  const paymentRequests = useMemo(() => selectedService?.paymentRequests || [], [selectedService]);
  const selectedPayments = useMemo(() => reconcilePendingPaymentSelection(paymentRequests, selectedPaymentIds),
    [paymentRequests, selectedPaymentIds]);

  useEffect(() => {
    if (!pending.isSuccess) return;
    if (selectedPaymentIds.some((id) => !selectedPayments.some((payment) => String(payment.id) === id))) {
      setSelectedPaymentIds(selectedPayments.map((payment) => String(payment.id)));
      setShowPagoLoteModal(false);
    }
    if (selectedServiceKey && !selectedService) {
      setSelectedServiceKey(null);
      setView("services");
    }
  }, [pending.isSuccess, selectedServiceKey, selectedService, selectedPaymentIds, selectedPayments]);

  // Cuando cambie la lista de paymentRequests (por seleccionar servicio), cargar los vouchers correspondientes
  useEffect(() => {
    const loadVouchersForPayments = async () => {
      const idsToFetch = Array.from(
        new Set(
          paymentRequests
            .map((p) => p.voucher_reserva_id)
            .filter(Boolean)
            .filter((id) => !vouchers[id]),
        ),
      );

      if (!idsToFetch.length) return;

      try {
        const responses = await Promise.all(
          idsToFetch.map((id) =>
            voucherReservaService.getVoucherReservaById(id),
          ),
        );

        const newMap = {};
        responses.forEach((res, index) => {
          const id = idsToFetch[index];
          if (!res) return;

          const data =
            res.data?.data || // axios { data: { data: ... } }
            res.data || // axios { data: ... }
            res; // fallback

          if (data) {
            newMap[id] = data;
          }
        });

        if (Object.keys(newMap).length > 0) {
          setVouchers((prev) => ({ ...prev, ...newMap }));
        }
      } catch (error) {
        console.error("Error cargando vouchers de reserva:", error);
      }
    };

    if (paymentRequests.length > 0) {
      loadVouchersForPayments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentRequests, vouchers]);

  console.log("Vouchers cacheados:", vouchers);

  // Cargar pasajeros por cada voucher cacheado
  useEffect(() => {
    const loadPasajerosForVouchers = async () => {
      const voucherReservaIds = Array.from(
        new Set(
          Object.values(vouchers)
            .map((v) => v.id) // id del voucher_reserva
            .filter(Boolean)
            .filter((id) => !pasajeros[id]),
        ),
      );
      if (voucherReservaIds.length === 0) return;

      console.log("Cargando pasajeros para vouchers:", voucherReservaIds);
      try {
        const pasajerosMap = {};
        await Promise.all(
          voucherReservaIds.map(async (voucherReservaId) => {
            const paxList =
              await pasajeroService.getPassengersByVoucherReserva(
                voucherReservaId,
              );
            pasajerosMap[voucherReservaId] = paxList;
          }),
        );
        setPasajeros((prev) => ({ ...prev, ...pasajerosMap }));
      } catch (error) {
        console.error(
          "Error cargando pasajeros para vouchers de venta:",
          error,
        );
      }
    };

    if (Object.keys(vouchers).length > 0) loadPasajerosForVouchers();
  }, [vouchers, pasajeros]);

  console.log("Pasajeros cacheados:", pasajeros);

  /**
   * Cargar servicios únicos con payment_requests pendientes
   */
  const handleTypeFilterChange = (typeService) => setSelectedTypeFilter(typeService);

  const handleSelectService = (service) => {
    console.log(" Servicio seleccionado:", service);
    setSelectedServiceKey(service.serviceKey);
    setSelectedPaymentIds([]);
    setView("payments");
  };

  const handleBackToServices = () => {
    setView("services");
    setSelectedServiceKey(null);
    setSelectedPaymentIds([]);
  };

  const handleTogglePayment = (payment) => {
    if (pending.isFetching || pending.isError) return;
    const id = String(payment.id);
    setSelectedPaymentIds((prev) => prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]);
  };

  const handleSelectAll = () => {
    if (pending.isFetching || pending.isError) return;
    setSelectedPaymentIds(selectedPayments.length === paymentRequests.length ? [] :
      paymentRequests.map((payment) => String(payment.id)));
  };

  const handleOpenPagoLote = () => {
    if (pending.isFetching || pending.isError) return;
    if (selectedPayments.length === 0) {
      toast.warning("Seleccione al menos un pago para procesar");
      return;
    }
    setShowPagoLoteModal(true);
  };

  const handlePagoLoteSuccess = () => {
    setShowPagoLoteModal(false);
    setSelectedPaymentIds([]);
    void pending.refetch();
    toast.success("Pago por lote registrado exitosamente");
  };

  // Robust: acepta evento o valor directo
  const handleStartDateChange = (valueOrEvent) => {
    const value =
      valueOrEvent && valueOrEvent.target
        ? valueOrEvent.target.value
        : valueOrEvent;
    setStartDate(value || "");
  };

  const handleEndDateChange = (valueOrEvent) => {
    const value =
      valueOrEvent && valueOrEvent.target
        ? valueOrEvent.target.value
        : valueOrEvent;
    setEndDate(value || "");
  };

  const handleClearDateFilter = () => {
    setStartDate("");
    setEndDate("");
  };

  const getAvailableTypes = () => {
    const types = new Set();
    services.forEach((s) => types.add(s.tipo));
    return Array.from(types);
  };

  const getTypeLabel = (type) => {
    const labels = {
      hoteles: "Hoteles",
      guias: "Guías",
      transportes: "Transportes",
      trenes: "Trenes",
      vuelos: "Vuelos",
      endoses: "Endoses",
      restaurantes: "Restaurantes",
      tickets: "Tickets",
      atractivos: "Atractivos",
      extras: "Extras",
      unknown: "Otros",
    };
    return labels[type] || type;
  };

  // Fecha desde cache de vouchers (sincrónico)
  const getVoucherDateForPayment = (refVoucherId) => {
    if (!refVoucherId) return "";

    const voucherData = vouchers[refVoucherId];
    if (!voucherData) return ""; // todavía no cargó

    const quote = voucherData.cotizacion_data || voucherData.cotizacionData || {};
    const rawDate = quote.fechainicio || voucherData.created_at || voucherData.createdat;

    if (!rawDate) return "";

    const d = new Date(rawDate);
    if (Number.isNaN(d.getTime())) return "";

    return d.toLocaleDateString("es-ES");
  };

  const getPassengersByVoucherReserva = (refVoucherId) => {
    if (!refVoucherId) return "-";

    const passengerData = pasajeros[refVoucherId];
    if (!passengerData) return "-";

    const passengers = passengerData.data || passengerData.passengers || [];
    if (!passengers || passengers.length === 0) return "-";

    const names = passengers
      .map((p) => {
        const nombres = p.nombres || "";
        const apellidos = p.apellidos || "";
        return `${nombres} ${apellidos}`.trim();
      })
      .filter((name) => name);

    return names.length > 0 ? names[0] : "-";
  };

  // Helper para inferir si un pasajero es adulto o niño
  const getPassengerType = (pax) => {
    const rawType = (
      pax.tipo_pasajero ||
      pax.tipo ||
      pax.categoria ||
      pax.category ||
      ""
    )
      .toString()
      .toLowerCase();

    if (rawType.includes("adult")) return "adult";
    if (
      rawType.includes("niñ") ||
      rawType.includes("child") ||
      rawType.includes("menor")
    ) {
      return "child";
    }

    const age = pax.edad ?? pax.age;
    if (typeof age === "number") {
      return age < 12 ? "child" : "adult";
    }

    return "unknown";
  };

  function getServiceName(serviceData) {
    const parentService = serviceData.parentService || {};
    const childService = serviceData.childService || {};
    const typeService = String(
      parentService.typeService ||
        serviceData.typeService ||
        (childService.ticket || childService.tickets || childService.id_ticket
          ? "tickets"
          : childService.restaurante ||
              childService.restaurant ||
              childService.id_restaurante
            ? "restaurantes"
            : ""),
    ).toLowerCase();

    switch (typeService) {
      case "hoteles":
        return childService.tipo_habitacion || parentService.nombre || "Hotel";
      case "transportes":
        return (
          childService.ruta ||
          childService.nombre_movilidad ||
          parentService.nombre_transporte ||
          "Transporte"
        );
      case "tickets":
        return (
          childService.ticket?.entrada ||
          childService.tickets?.entrada ||
          childService.entrada ||
          serviceData.entrada ||
          parentService.entrada ||
          "Ticket"
        );
      case "restaurantes": {
        const restaurante =
          childService.restaurante?.nombre ||
          childService.restaurant?.nombre ||
          childService.nombre ||
          serviceData.nombre ||
          parentService.nombre ||
          "";
        const comida = childService.tipo_comida || "";
        return comida
          ? `${restaurante} - ${comida}`
          : restaurante || "Restaurante";
      }
      case "guias":
        return parentService.nombre_completo || parentService.nombres || "Guía";
      case "trenes": {
        const vagon = childService.tipo_tren || "";
        const ruta = [childService.lugar_salida, childService.lugar_destino]
          .filter(Boolean)
          .join(" → ");
        return (
          [vagon, ruta].filter(Boolean).join(" ") ||
          parentService.nombre_empresa ||
          "Tren"
        );
      }
      case "endoses":
        return (
          parentService.tipo_tour ||
          childService.tour?.tipo_tour ||
          childService.tipo_tour ||
          childService.tour?.nombre ||
          childService.nombre ||
          childService.tour?.tipo_guiado ||
          childService.tipo_guiado ||
          parentService.nombre_agencia ||
          "Tour"
        );
      case "vuelos": {
        const tipo = childService.tipo_vuelo?.tipovuelo || "";
        const ruta = [parentService.lugar_vuelta, parentService.lugar_ida]
          .filter(Boolean)
          .join(" → ");
        return (
          [tipo, ruta].filter(Boolean).join(" ") ||
          parentService.nombre ||
          "Vuelo"
        );
      }
      default:
        return (
          parentService.nombre ||
          childService.nombre ||
          serviceData.nombre ||
          parentService.entrada ||
          childService.entrada ||
          serviceData.entrada ||
          "Servicio"
        );
    }
  }

  // Obtener conteo de pasajeros (adultos/niños) por voucher_reserva
  const getPassengerCountByVoucherReserva = (refVoucherId) => {
    if (!refVoucherId) return "-";

    const passengerData = pasajeros[refVoucherId];
    if (!passengerData) return "-";

    const passengers = Array.isArray(passengerData)
      ? passengerData
      : passengerData.data || passengerData.passengers || [];

    if (!Array.isArray(passengers) || passengers.length === 0) return "-";

    const adults = passengers.filter(
      (p) => getPassengerType(p) === "adult",
    ).length;
    const children = passengers.filter(
      (p) => getPassengerType(p) === "child",
    ).length;

    if (adults === 0 && children === 0) {
      return passengerData.count || passengers.length || "-";
    }

    if (children === 0) return `${adults} ADT`;
    if (adults === 0) return `${children} CHD`;
    return `${adults} ADT / ${children} CHD`;
  };

  const renderServicesView = () => {
    const availableTypes = getAvailableTypes();

    return (
      <div className="liquidaciones-services-view">
        {/* Filtro de fechas (SERVICIOS) */}
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={handleStartDateChange}
          onEndDateChange={handleEndDateChange}
          onClear={handleClearDateFilter}
        />

        <div className="filters-section">
          <button
            className={`filter-btn ${selectedTypeFilter === "all" ? "active" : ""}`}
            onClick={() => handleTypeFilterChange("all")}
          >
            Todos ({services.length})
          </button>
          {availableTypes.map((type) => {
            const count = services.filter((s) => s.tipo === type).length;
            return (
              <button
                key={type}
                className={`filter-btn ${selectedTypeFilter === type ? "active" : ""}`}
                onClick={() => handleTypeFilterChange(type)}
              >
                {getTypeLabel(type)} ({count})
              </button>
            );
          })}
        </div>

        <div className="services-grid">
          {filteredServices.map((service) => (
            <div
              key={service.serviceKey}
              className="service-card"
              onClick={() => handleSelectService(service)}
            >
              <div className="service-card-header">
                <h3 className="service-name">{service.nombre}</h3>
                <span className="service-type-badge">
                  {getTypeLabel(service.tipo)}
                </span>
              </div>

              <ServiceDetailedInfo
                service={service.serviceData}
                categoryId={service.categoryId}
              />

              <div className="service-card-footer">
                <div className="stat">
                  <FaFileInvoiceDollar className="stat-icon" />
                  <span className="stat-value">{service.cantidadPagos}</span>
                  <span className="stat-label">Pagos pendientes</span>
                </div>
                <div className="stat total">
                  <FaMoneyBillWave className="stat-icon" />
                  <span className="stat-value">
                    {formatCurrency(
                      service.totalPendiente,
                      service.currency,
                    )}
                  </span>
                  <span className="stat-label">Total pendiente</span>
                </div>
              </div>
            </div>
          ))}

          {filteredServices.length === 0 && (
            <div className="empty-state">
              <FaCheckCircle className="empty-icon" />
              <h3>No hay servicios pendientes</h3>
              <p>Todos los pagos están al día</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderPaymentsView = () => {
    const totalSelected = selectedPayments.reduce(
      (sum, p) => sum + parseFloat(p.amount || 0),
      0,
    );

    return (
      <div className="liquidaciones-payments-view">
        <div className="payments-header">
          <button className="btn-back" onClick={handleBackToServices}>
            <FaArrowLeft /> Volver a servicios
          </button>
          <div className="service-info">
            <h2>{selectedService?.nombre}</h2>
            <span className="service-type">
              {getTypeLabel(selectedService?.tipo)}
            </span>
          </div>
        </div>

        {/* Filtro de fechas también en la vista de PAGOS */}
        <div className="payments-filters">
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={handleStartDateChange}
            onEndDateChange={handleEndDateChange}
            onClear={handleClearDateFilter}
          />
        </div>

        {selectedService && (
          <div className="selected-service-details">
            <ServiceDetailedInfo
              service={selectedService.serviceData}
              categoryId={selectedService.categoryId}
            />
          </div>
        )}

        <div className="payments-toolbar">
          <div className="toolbar-left">
            <button className="btn-select-all" onClick={handleSelectAll}>
              {selectedPayments.length === paymentRequests.length
                ? "Deseleccionar todos"
                : "Seleccionar todos"}
            </button>
            <span className="selection-count">
              {selectedPayments.length} de {paymentRequests.length}{" "}
              seleccionados
            </span>
          </div>
          <div className="toolbar-right">
            {selectedPayments.length > 0 && (
              <>
                <span className="total-selected">
                  Total:{" "}
                  {formatCurrency(
                    totalSelected,
                    selectedService?.currency || "USD",
                  )}
                </span>
                <button
                  className="btn-liquidar"
                  onClick={handleOpenPagoLote}
                  disabled={pending.isFetching || pending.isError}
                >
                  <FaMoneyBillWave /> Procesar lote
                </button>
              </>
            )}
          </div>
        </div>

        <div className="payments-table-wrapper">
          <table className="payments-table">
            <thead>
              <tr>
                <th style={{ width: "40px" }}>
                  <input
                    type="checkbox"
                    checked={
                      paymentRequests.length > 0 &&
                      selectedPayments.length === paymentRequests.length
                    }
                    onChange={handleSelectAll}
                  />
                </th>
                <th>Fecha</th>
                <th>File / Voucher</th>
                <th>N Pax</th>
                <th>Nombres</th>
                <th>Detalle</th>
                <th>Total</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {paymentRequests.length === 0 && (
                <tr>
                  <td colSpan={8} className="no-payments-cell">
                    No hay pagos pendientes para este servicio
                  </td>
                </tr>
              )}

              {paymentRequests.map((payment) => {
                const isSelected = selectedPayments.some(
                  (p) => p.id === payment.id,
                );
                const assignedPaymentService =
                  resolvePendingPaymentAssignment(payment).service;

                const monedaPayment = resolvePendingPaymentCurrency(payment);

                const servicioDetalle =
                  getServiceName(assignedPaymentService) || "-";

                return (
                  <tr
                    key={payment.id}
                    className={isSelected ? "selected" : ""}
                    onClick={() => handleTogglePayment(payment)}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={!!isSelected}
                        onChange={() => handleTogglePayment(payment)}
                      />
                    </td>

                    <td className="date-cell">
                      {getVoucherDateForPayment(payment.voucher_reserva_id)}
                    </td>

                    <td>
                      <span className="file-value">
                        {payment.voucher_code ||
                          `VR-${payment.voucher_reserva_id}`}
                      </span>
                    </td>

                    <td className="pax-cell">
                      {getPassengerCountByVoucherReserva(
                        payment.voucher_reserva_id,
                      )}
                    </td>

                    <td className="names-cell">
                      {getPassengersByVoucherReserva(
                        payment.voucher_reserva_id,
                      )}
                    </td>

                    <td className="detail-cell">{servicioDetalle}</td>

                    <td className="amount-cell">
                      {formatCurrency(
                        parseFloat(payment.amount || 0),
                        monedaPayment,
                      )}
                    </td>

                    <td className="payment-notes-cell">
                      {payment.observaciones ? (
                        <span className="payment-notes-text">
                          {payment.observaciones}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="liquidaciones-page loading">
        <div className="spinner"></div>
        <p>Cargando pagos pendientes...</p>
      </div>
    );
  }

  return (
    <div className="liquidaciones-page">
      <div className="page-header">
        <div className="header-content">
          <h1 className="page-title">
            <FaMoneyBillWave className="title-icon" />
            Pagos por lote
          </h1>
          <p className="page-subtitle">
            Seleccione un servicio y procese sus pagos pendientes en una sola operación.
          </p>
        </div>
      </div>

      <div className="pending-payments-refresh">
        <button type="button" className="filter-btn" disabled={pending.isFetching} onClick={() => void pending.refetch()}>
          {pending.isFetching ? "Actualizando…" : "Actualizar pendientes"}
        </button>
        {pending.isError && <p role="alert">No se pudieron comprobar los pagos pendientes. Reintente antes de procesar un lote.</p>}
        {invalidDateRange && <p role="alert">La fecha inicial no puede ser posterior a la fecha final.</p>}
      </div>
      <div className="page-content">
        {!pending.isError && (view === "services" ? renderServicesView() : renderPaymentsView())}
      </div>

      {showPagoLoteModal && (
        <PagoLoteForm
          isOpen={showPagoLoteModal}
          onClose={() => setShowPagoLoteModal(false)}
          onSuccess={handlePagoLoteSuccess}
          selectedPayments={selectedPayments}
          pendingValidation={pending.isFetching || pending.isError}
        />
      )}
    </div>
  );
}

export const Liquidaciones = PagosLote;
export default PagosLote;
