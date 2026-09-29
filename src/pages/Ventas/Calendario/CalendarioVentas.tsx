import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  MdCalendarViewMonth,
  MdChevronLeft,
  MdChevronRight,
  MdClose,
  MdConfirmationNumber,
  MdDirectionsBus,
  MdFlight,
  MdHotel,
  MdPerson,
  MdRestaurant,
  MdToday,
  MdTour,
  MdTrain,
  MdViewAgenda,
  MdViewDay,
  MdViewWeek,
} from "react-icons/md";
import { FaFileInvoiceDollar } from "react-icons/fa";
import LoadingSpinner from "../../../components/UI/LoadingSpinner/LoadingSpinner";
import cotizacionService from "../Cotizaciones/hooks/cotizacionService";
import voucherVentaService from "../../../services/voucherVentaService";
import { useAuth } from "../../../context/AuthContext";
import SecureStorage from "../../../utils/secureStorage";
import {
  detectServiceType,
  getServiceName,
  getServiceSubtype,
} from "../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/utils/serviceTypeMapper";
import "./CalendarioVentas.scss";

const TYPE_META = {
  hoteles: { label: "Hotel", color: "#f59e0b", icon: MdHotel },
  transportes: { label: "Transporte", color: "#2563eb", icon: MdDirectionsBus },
  trenes: { label: "Tren", color: "#7c3aed", icon: MdTrain },
  guias: { label: "Guia", color: "#0f766e", icon: MdPerson },
  endoses: { label: "Tour", color: "#16a34a", icon: MdTour },
  vuelos: { label: "Vuelo", color: "#0284c7", icon: MdFlight },
  restaurantes: { label: "Restaurante", color: "#dc2626", icon: MdRestaurant },
  tickets: { label: "Ticket", color: "#9333ea", icon: MdConfirmationNumber },
  extras: { label: "Extra", color: "#64748b", icon: FaFileInvoiceDollar },
  cotizacion: { label: "Cotizacion", color: "#111827", icon: FaFileInvoiceDollar },
  voucher: { label: "Voucher", color: "#059669", icon: FaFileInvoiceDollar },
};

const padDate = (value) => String(value).padStart(2, "0");

const toDateKey = (date) => {
  if (!date || Number.isNaN(new Date(date).getTime())) return null;
  const d = new Date(date);
  return `${d.getFullYear()}-${padDate(d.getMonth() + 1)}-${padDate(d.getDate())}`;
};

const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  if (typeof value === "string") {
    const clean = value.trim();
    const localDateMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (localDateMatch && !clean.includes("T")) {
      const [, year, month, day] = localDateMatch;
      const localDate = new Date(Number(year), Number(month) - 1, Number(day));
      return Number.isNaN(localDate.getTime()) ? null : localDate;
    }
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const addDays = (date, amount) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const parseArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return Object.values(parsed);
  } catch {
    return [];
  }
  return [];
};

const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

const getClientName = (cotizacion = {}) =>
  cotizacion.cliente_nombre ||
  cotizacion.customerName ||
  cotizacion.titulo ||
  cotizacion.id ||
  "Sin cliente";

const getServiceDescription = (service) => {
  let type = "extras";
  let serviceName = "Servicio";
  let subtype = "";
  try {
    type = detectServiceType(service);
    serviceName = getServiceName(service);
    subtype = getServiceSubtype(service);
  } catch {
    type = service?.typeService || service?.parentService?.typeService || "extras";
  }
  const parent = service?.parentService || {};
  const child = service?.childService || {};

  if (type === "transportes") {
    return child.ruta || child.movilidad?.ruta || serviceName || "Transporte";
  }

  if (type === "trenes") {
    const route = [child.lugar_salida, child.lugar_destino]
      .filter(Boolean)
      .join(" - ");
    return [serviceName, subtype, route].filter(Boolean).join(" · ");
  }

  if (type === "vuelos") {
    const route = [parent.lugar_ida, parent.lugar_vuelta]
      .filter(Boolean)
      .join(" - ");
    return [serviceName, subtype, route].filter(Boolean).join(" · ");
  }

  if (type === "tickets") {
    return child.ticket?.entrada || child.entrada || parent.entrada || "Ticket";
  }

  if (type === "restaurantes") {
    return child.restaurante?.nombre || child.nombre || parent.nombre || "Restaurante";
  }

  if (type === "hoteles") {
    return [serviceName, subtype].filter(Boolean).join(" · ") || "Hotel";
  }

  return [serviceName, subtype].filter(Boolean).join(" · ") || "Servicio";
};

const getDayTitle = (day, index) =>
  day?.titulo ||
  day?.title ||
  day?.nombre ||
  `Dia ${Number(day?.numero || index + 1)}`;

const buildVoucherMap = (vouchers) => {
  const byCotizacion = new Map();
  vouchers.forEach((voucher) => {
    const cotizacionId = voucher?.cotizacion_id || voucher?.cotizacionId;
    if (!cotizacionId) return;
    byCotizacion.set(String(cotizacionId), voucher);
  });
  return byCotizacion;
};

const getUserDniCandidates = (user = {}) =>
  new Set(
    [
      user?.dni,
      user?.dniuser,
      user?.id,
      user?.sub,
      SecureStorage.getItem("dniuser"),
      SecureStorage.getItem("dni"),
    ]
      .filter(Boolean)
      .map((value) => String(value).trim()),
  );

const resolveUserRole = (user = {}) => {
  const rawRole =
    user?.role !== undefined ? user.role : SecureStorage.getItem("userRole");
  const parsedRole =
    typeof rawRole === "string" ? Number.parseInt(rawRole, 10) : rawRole;
  return Number.isFinite(parsedRole) ? parsedRole : null;
};

const userHasGlobalCotizacionAccess = (user = {}) => {
  const role = resolveUserRole(user);
  if ([0, 1, 3, 4].includes(role)) return true;
  return (
    String(user?.platform || "").toLowerCase() === "all" &&
    String(user?.business_type || "").toLowerCase() === "all"
  );
};

const filterCotizacionesForUser = (cotizaciones = [], user = {}) => {
  const activeCotizaciones = (cotizaciones || []).filter(
    (cotizacion) => cotizacion?.is_active === true,
  );

  if (userHasGlobalCotizacionAccess(user)) return activeCotizaciones;

  const dniCandidates = getUserDniCandidates(user);
  return activeCotizaciones.filter((cotizacion) => {
    const creator = String(
      cotizacion?.createdby ||
        cotizacion?.created_by ||
        cotizacion?.createdBy ||
        "",
    ).trim();
    return creator && dniCandidates.has(creator);
  });
};

const buildEvents = (cotizaciones, vouchers, user) => {
  const voucherByCotizacion = buildVoucherMap(vouchers);
  const events = [];
  const visibleCotizaciones = filterCotizacionesForUser(cotizaciones, user)
    .sort((a, b) => {
      const dateA = parseDate(a.updatedat || a.updatedAt || a.createdat || a.createdAt);
      const dateB = parseDate(b.updatedat || b.updatedAt || b.createdat || b.createdAt);
      return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
    });

  visibleCotizaciones.forEach((cotizacion) => {
    const startDate = parseDate(cotizacion.fechainicio);
    const endDate =
      parseDate(cotizacion.fechafin) || startDate;
    if (!startDate) return;

    const cotizacionId = String(cotizacion.id);
    const voucher = voucherByCotizacion.get(cotizacionId);
    const client = getClientName(cotizacion);
    const code = cotizacionId;
    const rangeEnd = endDate || startDate;

    events.push({
      id: `quote-${cotizacionId}`,
      dateKey: toDateKey(startDate),
      endDateKey: toDateKey(rangeEnd),
      kind: "cotizacion",
      type: "cotizacion",
      title: cotizacion.titulo || "Cotizacion",
      subtitle: `${code} · ${client}`,
      code,
      client,
      status: cotizacion.status || "cotizacion",
      cotizacion,
      voucher,
      color: TYPE_META.cotizacion.color,
      hora: "",
    });

    if (voucher) {
      events.push({
        id: `voucher-${voucher.id}`,
        dateKey: toDateKey(startDate),
        endDateKey: toDateKey(rangeEnd),
        kind: "voucher",
        type: "voucher",
        title: voucher.voucher_code || `Voucher ${voucher.id}`,
        subtitle: `${code} · ${client}`,
        code: voucher.voucher_code || code,
        client,
        status: voucher.status || "active",
        cotizacion,
        voucher,
        color: TYPE_META.voucher.color,
        hora: "",
      });
    }

    const itinerary = parseArray(cotizacion.itinerario || cotizacion.dias);
    itinerary.forEach((day, dayIndex) => {
      const dayDate = addDays(startDate, Number(day?.numero || dayIndex + 1) - 1);
      const dateKey = toDateKey(dayDate);
      const dayTitle = getDayTitle(day, dayIndex);
      const services = parseArray(day?.servicios || day?.services);

      services.forEach((service, serviceIndex) => {
        const type = detectServiceType(service);
        const meta = TYPE_META[type] || TYPE_META.extras;
        events.push({
          id: `service-${cotizacionId}-${dayIndex}-${serviceIndex}`,
          dateKey,
          endDateKey: dateKey,
          kind: "service",
          type,
          title: getServiceDescription(service),
          subtitle: dayTitle,
          dayTitle,
          code,
          client,
          hora: service?.hora || service?.assigned_hora || service?.time || "",
          status: cotizacion.status || "cotizacion",
          cotizacion,
          voucher,
          service,
          color: meta.color,
        });
      });
    });
  });

  return events;
};

const formatDate = (date) =>
  new Date(date).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const isBetweenKeys = (dateKey, startKey, endKey) =>
  dateKey >= startKey && dateKey <= (endKey || startKey);

const expandDateKeys = (startKey, endKey) => {
  const keys = [];
  const start = parseDate(`${startKey}T00:00:00`);
  const end = parseDate(`${endKey || startKey}T00:00:00`) || start;
  if (!start) return keys;

  let cursor = start;
  while (cursor <= end) {
    keys.push(toDateKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return keys;
};

const CalendarioVentas = () => {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState("agenda");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [cotizaciones, vouchersResponse] = await Promise.all([
        cotizacionService.getAllCotizaciones(),
        voucherVentaService.getVouchersWithCotizacion(),
      ]);
      const vouchers = vouchersResponse?.data || vouchersResponse || [];
      setEvents(
        buildEvents(
          cotizaciones || [],
          Array.isArray(vouchers) ? vouchers : [],
          user || {},
        ),
      );
    } catch (err) {
      console.error("Error cargando calendario de ventas:", err);
      setError("No se pudo cargar el calendario de ventas.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredEvents = useMemo(() => {
    const term = normalizeText(search);
    return events.filter((event) => {
      const typeMatches = typeFilter === "all" || event.type === typeFilter;
      const textMatches =
        !term ||
        normalizeText(
          `${event.title} ${event.subtitle} ${event.code} ${event.client} ${event.dayTitle}`,
        ).includes(term);
      return typeMatches && textMatches;
    });
  }, [events, search, typeFilter]);

  const visibleTypes = useMemo(() => {
    const term = normalizeText(search);
    const searchableEvents = events.filter(
      (event) =>
        !term ||
        normalizeText(
          `${event.title} ${event.subtitle} ${event.code} ${event.client} ${event.dayTitle}`,
        ).includes(term),
    );
    const types = new Set(searchableEvents.map((event) => event.type));
    return Object.entries(TYPE_META).filter(([key]) => types.has(key));
  }, [events, search]);

  const getEventsForDate = useCallback(
    (date) => {
      const key = toDateKey(date);
      return filteredEvents
        .filter((event) => isBetweenKeys(key, event.dateKey, event.endDateKey))
        .sort((a, b) => String(a.hora || "").localeCompare(String(b.hora || "")));
    },
    [filteredEvents],
  );

  const monthTitle = useMemo(() => {
    if (viewMode === "agenda") return "Agenda de cotizaciones";
    if (viewMode === "day") return formatDate(currentDate);
    if (viewMode === "week") {
      const start = new Date(currentDate);
      start.setDate(currentDate.getDate() - currentDate.getDay());
      const end = addDays(start, 6);
      return `${formatDate(start)} - ${formatDate(end)}`;
    }
    return new Intl.DateTimeFormat("es-ES", {
      month: "long",
      year: "numeric",
    }).format(currentDate);
  }, [currentDate, viewMode]);

  const changeDate = (direction) => {
    const next = new Date(currentDate);
    const amount = direction === "next" ? 1 : -1;
    if (viewMode === "day") next.setDate(next.getDate() + amount);
    if (viewMode === "week") next.setDate(next.getDate() + amount * 7);
    if (viewMode === "month") next.setMonth(next.getMonth() + amount);
    setCurrentDate(next);
  };

  const renderEvent = (event, compact = false) => {
    const meta = TYPE_META[event.type] || TYPE_META.extras;
    const Icon = meta.icon;
    return (
      <button
        key={event.id}
        className={`vc-event vc-event--${event.kind}`}
        style={{ "--event-color": event.color }}
        onClick={() => setSelectedEvent(event)}
        type="button"
      >
        <span className="vc-event__icon">
          <Icon />
        </span>
        <span className="vc-event__body">
          <strong>{compact ? event.title : event.title}</strong>
          {!compact && <small>{event.subtitle}</small>}
          {event.hora && <em>{event.hora}</em>}
        </span>
      </button>
    );
  };

  const renderDayTable = (date, dayEvents) => (
    <section className="vc-day-panel">
      <div className="vc-day-panel__header">
        <h3>{formatDate(date)}</h3>
        <span>{dayEvents.length} eventos</span>
      </div>
      {dayEvents.length ? (
        <div className="vc-table">
          <div className="vc-table__head">
            <span>Hora</span>
            <span>Evento</span>
            <span>Cotizacion</span>
            <span>Cliente</span>
            <span>Estado</span>
          </div>
          {dayEvents.map((event) => (
            <button
              key={event.id}
              className="vc-table__row"
              style={{ "--event-color": event.color }}
              onClick={() => setSelectedEvent(event)}
              type="button"
            >
              <span>{event.hora || "-"}</span>
              <span>
                <strong>{event.title}</strong>
                <small>{event.dayTitle || event.subtitle}</small>
              </span>
              <span>{event.code}</span>
              <span>{event.client}</span>
              <span>{event.status}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="vc-empty">No hay cotizaciones o servicios en este dia.</div>
      )}
    </section>
  );

  const renderDayView = () => renderDayTable(currentDate, getEventsForDate(currentDate));

  const renderWeekView = () => {
    const start = new Date(currentDate);
    start.setDate(currentDate.getDate() - currentDate.getDay());
    const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));

    return (
      <div className="vc-week-grid">
        {days.map((date) => {
          const dayEvents = getEventsForDate(date);
          return (
            <section key={toDateKey(date)} className="vc-week-day">
              <header>
                <strong>{date.toLocaleDateString("es-ES", { weekday: "short" })}</strong>
                <span>{date.getDate()}</span>
              </header>
              <div className="vc-week-day__events">
                {dayEvents.slice(0, 5).map((event) => renderEvent(event, true))}
                {dayEvents.length > 5 && (
                  <span className="vc-more">+{dayEvents.length - 5} mas</span>
                )}
              </div>
            </section>
          );
        })}
      </div>
    );
  };

  const renderMonthView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];

    for (let index = 0; index < firstDay; index += 1) {
      cells.push(<div key={`empty-${index}`} className="vc-month-day vc-month-day--empty" />);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const dayEvents = getEventsForDate(date);
      cells.push(
        <section key={toDateKey(date)} className="vc-month-day">
          <header>{day}</header>
          <div>
            {dayEvents.slice(0, 4).map((event) => renderEvent(event, true))}
            {dayEvents.length > 4 && (
              <span className="vc-more">+{dayEvents.length - 4} mas</span>
            )}
          </div>
        </section>,
      );
    }

    return <div className="vc-month-grid">{cells}</div>;
  };

  const renderAgendaView = () => {
    const grouped = filteredEvents.reduce((acc, event) => {
      expandDateKeys(event.dateKey, event.endDateKey).forEach((key) => {
        if (!acc[key]) acc[key] = [];
        acc[key].push(event);
      });
      return acc;
    }, {});
    const keys = Object.keys(grouped).sort();

    return (
      <div className="vc-agenda">
        {keys.length ? (
          keys.map((key) => (
            <Fragment key={key}>
              {renderDayTable(new Date(`${key}T00:00:00`), grouped[key])}
            </Fragment>
          ))
        ) : (
          <div className="vc-empty">No hay resultados para los filtros actuales.</div>
        )}
      </div>
    );
  };

  if (loading) return <LoadingSpinner />;

  return (
    <main className="ventas-calendar">
      <section className="vc-toolbar">
        <div>
          <span className="vc-eyebrow">Ventas</span>
          <h1>{monthTitle}</h1>
          <p>Cotizaciones, itinerarios y vouchers de venta por rango de viaje.</p>
        </div>
        <div className="vc-actions">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por codigo, cliente o servicio"
          />
          <button type="button" onClick={() => setCurrentDate(new Date())}>
            <MdToday /> Hoy
          </button>
          <button type="button" onClick={() => changeDate("prev")}>
            <MdChevronLeft />
          </button>
          <button type="button" onClick={() => changeDate("next")}>
            <MdChevronRight />
          </button>
        </div>
      </section>

      {error && <div className="vc-error">{error}</div>}

      <section className="vc-filters">
        <div className="vc-view-switcher">
          {[
            ["day", MdViewDay, "Dia"],
            ["week", MdViewWeek, "Semana"],
            ["month", MdCalendarViewMonth, "Mes"],
            ["agenda", MdViewAgenda, "Agenda"],
          ].map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              className={viewMode === key ? "active" : ""}
              onClick={() => setViewMode(key)}
            >
              <Icon /> {label}
            </button>
          ))}
        </div>
        <div className="vc-type-chips">
          <button
            type="button"
            className={typeFilter === "all" ? "active" : ""}
            onClick={() => setTypeFilter("all")}
          >
            Todo
          </button>
          {visibleTypes.map(([key, meta]) => {
            const Icon = meta.icon;
            return (
              <button
                key={key}
                type="button"
                className={typeFilter === key ? "active" : ""}
                onClick={() => setTypeFilter(key)}
              >
                <Icon /> {meta.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="vc-content">
        {viewMode === "day" && renderDayView()}
        {viewMode === "week" && renderWeekView()}
        {viewMode === "month" && renderMonthView()}
        {viewMode === "agenda" && renderAgendaView()}
      </section>

      {selectedEvent && (
        <div className="vc-modal-overlay" onClick={() => setSelectedEvent(null)}>
          <aside
            className="vc-modal"
            onClick={(event) => event.stopPropagation()}
            style={{ "--event-color": selectedEvent.color }}
          >
            <header>
              <div>
                <span>{TYPE_META[selectedEvent.type]?.label || "Evento"}</span>
                <h2>{selectedEvent.title}</h2>
              </div>
              <button type="button" onClick={() => setSelectedEvent(null)}>
                <MdClose />
              </button>
            </header>
            <dl>
              <dt>Cotizacion</dt>
              <dd>{selectedEvent.code}</dd>
              <dt>Cliente</dt>
              <dd>{selectedEvent.client}</dd>
              <dt>Dia</dt>
              <dd>{selectedEvent.dayTitle || selectedEvent.subtitle}</dd>
              <dt>Rango</dt>
              <dd>
                {selectedEvent.dateKey}
                {selectedEvent.endDateKey && selectedEvent.endDateKey !== selectedEvent.dateKey
                  ? ` - ${selectedEvent.endDateKey}`
                  : ""}
              </dd>
              {selectedEvent.voucher && (
                <>
                  <dt>Voucher</dt>
                  <dd>{selectedEvent.voucher.voucher_code || selectedEvent.voucher.id}</dd>
                </>
              )}
            </dl>
          </aside>
        </div>
      )}
    </main>
  );
};

export default CalendarioVentas;
