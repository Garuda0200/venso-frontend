import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  FaArrowLeft,
  FaCheckCircle,
  FaMoneyBillWave,
  FaFileInvoiceDollar,
} from "react-icons/fa";
import axiosInstance from "../../../utils/axiosInstance";
import ServiceDetailedInfo from "../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/components/ServiceDetailedInfo/ServiceDetailedInfo";
import PagoLoteForm from "../../../components/Contabilidad/LiquidacionForm";
import { DateRangeFilter } from "./components/DateRangeFilter";
import { DateFilterDomain } from "./domain/DateFilterDomain";
import { formatCurrency } from "../../../utils/formatters";
import {
  resolveAssignedPaymentServiceData,
} from "../../../utils/paymentFacturacion";
import "./Liquidaciones.scss";
import { voucherReservaService } from "../../../services/voucherReservaService";
import { pasajeroService } from "../../../services/pasajeroService";

const firstDefinedId = (...values) =>
  values.find(
    (value) => value !== undefined && value !== null && value !== "",
  );

const resolveParentEntityId = (parentService = {}) =>
  firstDefinedId(
    parentService.id_hotel,
    parentService.id_vuelo,
    parentService.id_tren,
    parentService.id_transporte,
    parentService.id_guia,
    parentService.guia?.id_guia,
    parentService.id_endose,
    parentService.id_restaurant,
    parentService.id_restaurante,
    parentService.id_ticket,
    parentService.id,
  );

const resolveChildEntityId = (childService = {}) =>
  firstDefinedId(
    childService.id_habitacion,
    childService.idtipo_vuelo,
    childService.tipo_vuelo?.idtipo_vuelo,
    childService.id_vagon,
    childService.vagon?.id_vagon,
    childService.id_movilidad,
    childService.movilidad?.id_movilidad,
    childService.id_ruta,
    childService.ruta?.id_ruta,
    childService.id_tipotour,
    childService.tour?.id_tipotour,
    childService.id_restaurante,
    childService.restaurante?.id_restaurante,
    childService.restaurant?.id_restaurante,
    childService.id_ticket,
    childService.ticket?.id_ticket,
    childService.tickets?.id_ticket,
    childService.id,
  );

const resolveAssignedServiceIdentity = (
  rawServiceData = {},
  assignedServiceData = {},
) => {
  const assignedWrapper =
    rawServiceData.assignedService || rawServiceData.assigned_service || {};
  const parentId = firstDefinedId(
    rawServiceData.assignedParentId,
    rawServiceData.assigned_parent_id,
    assignedWrapper.assignedParentId,
    assignedWrapper.assigned_parent_id,
    assignedWrapper.parentId,
    assignedWrapper.parent_id,
    resolveParentEntityId(assignedServiceData.parentService),
  );
  const childId = firstDefinedId(
    rawServiceData.assignedChildId,
    rawServiceData.assigned_child_id,
    assignedWrapper.assignedChildId,
    assignedWrapper.assigned_child_id,
    assignedWrapper.childId,
    assignedWrapper.child_id,
    resolveChildEntityId(assignedServiceData.childService),
  );

  return { parentId, childId };
};

export function PagosLote() {
  const [view, setView] = useState("services"); // 'services' or 'payments'
  const [services, setServices] = useState([]);
  const [filteredServices, setFilteredServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [selectedPayments, setSelectedPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("all");

  const [pasajeros, setPasajeros] = useState({});
  const [vouchers, setVouchers] = useState({}); // cache de vouchers por id: { [voucher_reserva_id]: voucherData }

  // Filtro de fechas
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [allPaymentRequests, setAllPaymentRequests] = useState([]);

  const [showPagoLoteModal, setShowPagoLoteModal] = useState(false);

  useEffect(() => {
    loadPendingServices();

    const handlePagoLoteRegistrado = () => {
      console.log("Refrescando pagos por lote después del registro");
      loadPendingServices();
    };

    window.addEventListener("paymentRequestPaid", handlePagoLoteRegistrado);

    return () => {
      window.removeEventListener("paymentRequestPaid", handlePagoLoteRegistrado);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-aplicar filtros cuando cambien las fechas
  useEffect(() => {
    if (allPaymentRequests.length > 0) {
      loadPendingServices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

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
  const loadPendingServices = async () => {
    setLoading(true);
    try {
      const response = await axiosInstance.get(
        "/turismo/vouchers-reserva/payment-requests/pending",
      );

      if (response.data && response.data.success) {
        const pendingPayments = response.data.data || [];

        console.log(
          " Payment requests pendientes (sin filtrar):",
          pendingPayments,
        );

        setAllPaymentRequests(pendingPayments);

        const dateFilter = DateFilterDomain.createDateRangeFilter(
          startDate,
          endDate,
        );
        const filteredPayments = DateFilterDomain.applyDateFilter(
          pendingPayments,
          dateFilter,
        );

        console.log(
          " Payment requests después de filtro:",
          filteredPayments.length,
        );

        const serviciosMap = new Map();

        const isExtraService = (serviceData = {}) => {
          const parentService = serviceData.parentService || {};
          const childService = serviceData.childService || {};
          const typeService = String(
            parentService.typeService || serviceData.typeService || "",
          ).toLowerCase();

          return (
            typeService === "extras" ||
            Boolean(
              childService.servicio_extra ||
                childService.extra ||
                parentService.id_extra ||
                parentService.id_servicio_extra,
            )
          );
        };

        const getResolvedTypeService = (serviceData = {}) => {
          const parentService = serviceData.parentService || {};
          const childService = serviceData.childService || {};
          const explicitType = String(
            parentService.typeService || serviceData.typeService || "",
          ).toLowerCase();

          if (explicitType) return explicitType;
          if (
            childService.ticket ||
            childService.tickets ||
            childService.id_ticket ||
            parentService.id_ticket
          ) {
            return "tickets";
          }
          if (
            childService.restaurante ||
            childService.restaurant ||
            childService.id_restaurante ||
            parentService.id_restaurante ||
            parentService.id_restaurant
          ) {
            return "restaurantes";
          }

          return "unknown";
        };

        filteredPayments.forEach((pr) => {
          const rawServiceData = pr.service_data;
          const serviceData = resolveAssignedPaymentServiceData(rawServiceData);

          if (!serviceData) {
            console.warn(" Payment request sin service_data:", pr.id);
            return;
          }

          if (isExtraService(serviceData)) {
            console.log(
              " Excluyendo servicio extra de liquidaciones:",
              pr.id,
              serviceData,
            );
            return;
          }

          const parentService = serviceData.parentService || {};
          const childService = serviceData.childService || {};
          const typeService = getResolvedTypeService(serviceData);
          const { parentId, childId } = resolveAssignedServiceIdentity(
            rawServiceData,
            serviceData,
          );
          const assignmentKey =
            parentId !== undefined || childId !== undefined
              ? `parent-${parentId ?? "none"}-child-${childId ?? "none"}`
              : `request-${pr.itinerario_servicio_id || pr.id}`;
          const serviceKey = `${typeService}-${assignmentKey}`;

          if (!serviciosMap.has(serviceKey)) {
            const nombre = getServiceName(serviceData);

            serviciosMap.set(serviceKey, {
              serviceKey,
              serviceData,
              categoryId:
                serviceData.tariff?.tipo_tarifa ||
                serviceData.tipo_tarifa ||
                determineCategory(serviceData),
              nombre,
              tipo: typeService,
              totalPendiente: 0,
              cantidadPagos: 0,
              paymentRequests: [],
            });
          }

          const servicio = serviciosMap.get(serviceKey);
          servicio.paymentRequests.push(pr);
          servicio.cantidadPagos++;
          servicio.totalPendiente += parseFloat(pr.amount || 0);
        });

        const serviciosArray = Array.from(serviciosMap.values());
        console.log(" Servicios agrupados:", serviciosArray.length);

        setServices(serviciosArray);
        setFilteredServices(serviciosArray);

        // Si estamos en vista de pagos, mantener actualizado el servicio seleccionado
        if (selectedService) {
          const updated = serviciosArray.find(
            (s) => s.serviceKey === selectedService.serviceKey,
          );
          if (updated) {
            setSelectedService(updated);
            if (view === "payments") {
              setPaymentRequests(updated.paymentRequests || []);
              setSelectedPayments((prev) =>
                prev.filter((sp) =>
                  (updated.paymentRequests || []).some((p) => p.id === sp.id),
                ),
              );
            }
          } else {
            // El servicio ya no tiene pagos en el rango → volver a vista de servicios
            setSelectedService(null);
            setPaymentRequests([]);
            setSelectedPayments([]);
            setView("services");
          }
        }

        setLoading(false);
      } else {
        toast.error("Error al cargar servicios pendientes");
        setLoading(false);
      }
    } catch (error) {
      console.error("Error cargando servicios:", error);
      toast.error("Error al cargar los servicios pendientes");
      setLoading(false);
    }
  };

  const determineCategory = (serviceData) => {
    const parentService = serviceData.parentService || {};
    const typeService = parentService.typeService || "unknown";

    const categoryMap = {
      hoteles: "hoteles",
      guias: "guias",
      transportes: "transportes",
      restaurantes: "restaurantes",
      atractivos: "atractivos",
    };

    return categoryMap[typeService] || "otros";
  };

  const handleTypeFilterChange = (typeService) => {
    setSelectedTypeFilter(typeService);

    if (typeService === "all") {
      setFilteredServices(services);
    } else {
      const filtered = services.filter((s) => s.tipo === typeService);
      setFilteredServices(filtered);
    }
  };

  const handleSelectService = (service) => {
    console.log(" Servicio seleccionado:", service);
    setSelectedService(service);
    setPaymentRequests(service.paymentRequests || []);
    setSelectedPayments([]);
    setView("payments");
  };

  const handleBackToServices = () => {
    setView("services");
    setSelectedService(null);
    setPaymentRequests([]);
    setSelectedPayments([]);
  };

  const handleTogglePayment = (payment) => {
    setSelectedPayments((prev) => {
      const exists = prev.find((p) => p.id === payment.id);
      if (exists) {
        return prev.filter((p) => p.id !== payment.id);
      } else {
        return [...prev, payment];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedPayments.length === paymentRequests.length) {
      setSelectedPayments([]);
    } else {
      setSelectedPayments([...paymentRequests]);
    }
  };

  const handleOpenPagoLote = () => {
    if (selectedPayments.length === 0) {
      toast.warning("Seleccione al menos un pago para procesar");
      return;
    }
    setShowPagoLoteModal(true);
  };

  const handlePagoLoteSuccess = () => {
    setShowPagoLoteModal(false);
    setSelectedPayments([]);
    loadPendingServices();
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
                      service.serviceData?.tariff?.moneda ||
                        service.serviceData?.moneda ||
                        "soles",
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
    const selectedPaymentService = resolveAssignedPaymentServiceData(
      selectedPayments[0]?.service_data,
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
                    selectedPaymentService?.tariff?.moneda ||
                      selectedPaymentService?.moneda ||
                      "soles",
                  )}
                </span>
                <button
                  className="btn-liquidar"
                  onClick={handleOpenPagoLote}
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
                  resolveAssignedPaymentServiceData(payment.service_data);

                const monedaPayment =
                  assignedPaymentService?.tariff?.moneda ||
                  assignedPaymentService?.moneda ||
                  (payment.moneda === "USD" ? "dolares" : "soles");

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

      <div className="page-content">
        {view === "services" ? renderServicesView() : renderPaymentsView()}
      </div>

      {showPagoLoteModal && (
        <PagoLoteForm
          isOpen={showPagoLoteModal}
          onClose={() => setShowPagoLoteModal(false)}
          onSuccess={handlePagoLoteSuccess}
          selectedPayments={selectedPayments}
        />
      )}
    </div>
  );
}

export const Liquidaciones = PagosLote;
export default PagosLote;
