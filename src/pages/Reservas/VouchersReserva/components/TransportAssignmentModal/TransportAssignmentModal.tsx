import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import axiosInstance from "../../../../../utils/axiosInstance";
import { pasajeroService } from "../../../../../services/pasajeroService";
import "./TransportAssignmentModal.scss";
import {
  FaTimes,
  FaCar,
  FaCalendarCheck,
  FaUsers,
  FaCheck,
  FaTrash,
  FaPlus,
  FaMapMarkerAlt,
  FaDollarSign,
  FaSearch,
} from "react-icons/fa";
import { MdSelectAll, MdDirectionsCar } from "react-icons/md";
import {
  createUnifiedService,
  getPassengerIdsByType,
} from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/unifiedServiceManager";

const calculateAge = (birthDate) => {
  if (!birthDate) return 30;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate()))
    age--;
  return age;
};

const isTransportService = (service) => {
  const ts =
    service?.typeService?.toLowerCase() ||
    service?.parentService?.typeService?.toLowerCase() ||
    service?.assignedService?.parentService?.typeService?.toLowerCase() ||
    "";
  return (
    ts === "transportes" ||
    ts === "movilidades" ||
    ts.includes("transport") ||
    ts.includes("movilidad")
  );
};

const isServiceAssigned = (t) => {
  if (t.isAssigned === true) return true;
  if (t.assignedService && Object.keys(t.assignedService).length > 0)
    return true;
  if (
    t.childService &&
    (t.childService.id_movilidad || t.childService.id_transporte)
  )
    return true;
  return !!(t.transport_id || t.transport_nombre || t.movilidad_id);
};

const TransportAssignmentModal = ({
  isOpen,
  onClose,
  days = [],
  totalPassengers: propTotalPassengers,
  onAddTransportToDays,
  removeTransportFromDay,
  packageType = "compartido",
  peopleDetails: propPeopleDetails = {},
  voucherReservaId = null,
}) => {
  const tariffType = "interna";

  const [passengers, setPassengers] = useState([]);
  const [selectedDays, setSelectedDays] = useState([]);
  const [selectedTransportes, setSelectedTransportes] = useState([]);
  const [selectedMovilidades, setSelectedMovilidades] = useState([]);
  const [transportes, setTransportes] = useState([]);
  const [allMovilidades, setAllMovilidades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [parentSearch, setParentSearch] = useState("");
  const [childSearch, setChildSearch] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setSelectedMovilidades([]);
      setSelectedDays([]);
      setSelectedTransportes([]);
      setParentSearch("");
      setChildSearch("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!voucherReservaId || !isOpen) return;
    (async () => {
      try {
        const { passengers: fetched } =
          await pasajeroService.getPassengersByVoucherReserva(voucherReservaId);
        setPassengers(fetched || []);
      } catch {
        setPassengers([]);
      }
    })();
  }, [voucherReservaId, isOpen]);

  const peopleDetails = useMemo(() => {
    if (passengers.length > 0) {
      const adults = [],
        children = [];
      passengers.forEach((p) => {
        const age =
          p.edad ||
          (p.fecha_nacimiento ? calculateAge(p.fecha_nacimiento) : 30);
        if (age >= 18)
          adults.push({ nombre: p.nombre || p.nombres, edad: age, id: p.id });
        else children.push(age);
      });
      return { adults, children };
    }
    return propPeopleDetails;
  }, [passengers, propPeopleDetails]);

  const totalPassengers = useMemo(() => {
    if (passengers.length > 0) return passengers.length;
    if (propTotalPassengers) return propTotalPassengers;
    const adults = Array.isArray(propPeopleDetails?.adults)
      ? propPeopleDetails.adults.length
      : 0;
    const children = Array.isArray(propPeopleDetails?.children)
      ? propPeopleDetails.children.length
      : 0;
    return adults + children;
  }, [passengers, propTotalPassengers, propPeopleDetails]);

  const transportPassengerSelection = useMemo(() => {
    const ids = getPassengerIdsByType(peopleDetails || {});
    const selectedIds = ids.allPassengerIds || [];
    const convertedChildToAdultMap = (ids.childIds || []).reduce(
      (accumulator, childId) => {
        accumulator[childId] = childId;
        return accumulator;
      },
      {},
    );

    return {
      selectedIds,
      assignedPassengerCount: selectedIds.length,
      assignedChildExplicitCount: 0,
      assignedChildExplicitPriceMap: {},
      assignedChildExplicitPriceSum: 0,
      pricingMode: "adult",
      treatChildrenAsAdults: true,
      convertedChildToAdultMap,
    };
  }, [peopleDetails]);

  // Single bulk fetch: transportes + ALL movilidades/con-tarifas in parallel
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, mRes] = await Promise.all([
        axiosInstance.get("/turismo/transportes", { params: { activo: true } }),
        axiosInstance.get("/turismo/movilidades/con-tarifas"),
      ]);
      const tData =
        tRes.data?.success && Array.isArray(tRes.data.data)
          ? tRes.data.data
          : Array.isArray(tRes.data)
            ? tRes.data
            : [];
      const mRaw =
        mRes.data?.success && Array.isArray(mRes.data.data)
          ? mRes.data.data
          : Array.isArray(mRes.data)
            ? mRes.data
            : [];

      const movsWithInterna = mRaw
        .filter((mov) => {
          const tarifas = mov.tarifas || [];
          return (
            Array.isArray(tarifas) &&
            tarifas.some((t) => t.tipo_tarifa === tariffType)
          );
        })
        .map((mov) => {
          const md = mov.movilidad || mov;
          const tarifasInternas = (mov.tarifas || []).filter(
            (t) => t.tipo_tarifa === tariffType,
          );
          const ti = tarifasInternas[0];
          return {
            id_movilidad: md.id_movilidad || md.id,
            id_transporte: md.id_transporte,
            tipo_auto: md.tipo_auto,
            nro_pasajeros: md.nro_pasajeros,
            nro_placa: md.nro_placa,
            ruta: md.ruta,
            estado: md.estado,
            tarifas: tarifasInternas,
            precioInterno:
              ti?.precio_privado || ti?.precio_compartido || ti?.precio || 0,
          };
        });

      const idsWithMovs = new Set(movsWithInterna.map((m) => m.id_transporte));
      setTransportes(
        tData.filter((t) => idsWithMovs.has(t.id_transporte || t.id)),
      );
      setAllMovilidades(movsWithInterna);
    } catch {
      setError("Error al cargar transportes");
      setTransportes([]);
      setAllMovilidades([]);
    } finally {
      setLoading(false);
    }
  }, [tariffType]);

  useEffect(() => {
    if (isOpen) fetchData();
  }, [isOpen, fetchData]);

  const availableDaysForAssignment = useMemo(() => {
    return days
      .map((day, idx) => {
        const ts = (day.servicios || []).filter(isTransportService);
        return ts.some((t) => !isServiceAssigned(t)) ? idx : null;
      })
      .filter((i) => i !== null);
  }, [days]);

  const maxAllowedMovilidades = useMemo(() => {
    if (selectedDays.length === 0) return 0;
    let max = Infinity;
    selectedDays.forEach((di) => {
      const day = days[di];
      if (!day) return;
      const unassigned = (day.servicios || [])
        .filter(isTransportService)
        .filter((t) => !isServiceAssigned(t)).length;
      max = Math.min(max, unassigned);
    });
    return max === Infinity ? 0 : max;
  }, [selectedDays, days]);

  const filteredTransportes = useMemo(() => {
    if (!parentSearch.trim()) return transportes;
    const q = parentSearch.toLowerCase();
    return transportes.filter(
      (t) =>
        (t.nombre || t.nombre_transporte || "").toLowerCase().includes(q) ||
        (t.zona || "").toLowerCase().includes(q) ||
        (t.ciudad || "").toLowerCase().includes(q),
    );
  }, [transportes, parentSearch]);

  const filteredMovilidades = useMemo(() => {
    let movs = allMovilidades;
    if (selectedTransportes.length > 0) {
      const ids = new Set(
        selectedTransportes.map((t) => t.id_transporte || t.id),
      );
      movs = movs.filter((m) => ids.has(m.id_transporte));
    }
    if (childSearch.trim()) {
      const q = childSearch.toLowerCase();
      movs = movs.filter(
        (m) =>
          (m.tipo_auto || "").toLowerCase().includes(q) ||
          (m.ruta || "").toLowerCase().includes(q) ||
          (m.nro_placa || "").toLowerCase().includes(q),
      );
    }
    return movs;
  }, [allMovilidades, selectedTransportes, childSearch]);

  // -- Handlers --
  const toggleParent = (transporte) => {
    const id = transporte.id_transporte || transporte.id;
    setSelectedTransportes((prev) =>
      prev.some((t) => (t.id_transporte || t.id) === id)
        ? prev.filter((t) => (t.id_transporte || t.id) !== id)
        : [...prev, transporte],
    );
  };

  const selectAllParents = () => {
    setSelectedTransportes((prev) =>
      prev.length === filteredTransportes.length
        ? []
        : [...filteredTransportes],
    );
  };

  const isParentSelected = (transporte) => {
    const id = transporte.id_transporte || transporte.id;
    return selectedTransportes.some((t) => (t.id_transporte || t.id) === id);
  };

  const toggleMovilidad = (movilidad) => {
    const mid = movilidad.id_movilidad || movilidad.id;
    const idx = selectedMovilidades.findIndex(
      (i) => (i.movilidad.id_movilidad || i.movilidad.id) === mid,
    );
    if (idx >= 0) {
      setSelectedMovilidades((prev) => prev.filter((_, i) => i !== idx));
    } else {
      if (
        maxAllowedMovilidades > 0 &&
        selectedMovilidades.length >= maxAllowedMovilidades
      ) {
        alert(
          "Maximo " +
            maxAllowedMovilidades +
            " movilidad(es) para los dias seleccionados",
        );
        return;
      }
      const transporte = transportes.find(
        (t) => (t.id_transporte || t.id) === movilidad.id_transporte,
      );
      if (!transporte) return;
      const tariff = movilidad.tarifas?.find(
        (t) => t.tipo_tarifa === tariffType,
      );
      if (!tariff) return;
      const precio =
        tariff.precio_privado ?? tariff.precio_compartido ?? tariff.precio ?? 0;
      setSelectedMovilidades((prev) => [
        ...prev,
        {
          transporte,
          movilidad,
          tariff: { ...tariff, _unitPrice: Number(precio) },
        },
      ]);
    }
  };

  const isMovSelected = (movilidad) => {
    const id = movilidad.id_movilidad || movilidad.id;
    return selectedMovilidades.some(
      (i) => (i.movilidad.id_movilidad || i.movilidad.id) === id,
    );
  };

  const getParentName = (movilidad) => {
    const p = transportes.find(
      (t) => (t.id_transporte || t.id) === movilidad.id_transporte,
    );
    return p?.nombre || p?.nombre_transporte || "";
  };

  const handleDayToggle = (index) => {
    setSelectedDays((prev) => {
      const next = prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index].sort((a, b) => a - b);
      if (selectedMovilidades.length > 0) setSelectedMovilidades([]);
      return next;
    });
  };

  const handleAdd = () => {
    if (selectedDays.length === 0 || selectedMovilidades.length === 0) return;
    const services = selectedMovilidades
      .map(({ transporte, movilidad, tariff }) => {
        const mwt = {
          ...movilidad,
          transporte_id: transporte.id_transporte || transporte.id,
          movilidad: {
            ...movilidad,
            tipo_auto: movilidad.tipo_auto,
            capacidad: movilidad.capacidad || 1,
          },
        };
        const svc = createUnifiedService(
          transporte,
          mwt,
          tariff,
          peopleDetails,
          packageType,
          transportPassengerSelection,
        );
        const assignedPassengerIds =
          svc.assignedPassengerIds ||
          svc.assignedPassengerSelection?.selectedIds ||
          transportPassengerSelection.selectedIds ||
          [];
        const assignedBeneficiariosAdultos = assignedPassengerIds.map((id) =>
          String(id).startsWith("child:")
            ? { id, child_origin: id }
            : { id },
        );
        const assignedPrecioServicio = Number(svc.precioServicio || precio || 0);
        const assignedPrecioTotal = Number(
          svc.tariff?.precio_original_with_child_extras ||
            svc.tariff?.precio_original ||
            assignedPrecioServicio,
        );

        svc.transport_nombre =
          transporte.nombre || transporte.nombre_transporte;
        svc.transport_ciudad = transporte.ciudad;
        svc.movilidad_tipo = movilidad.tipo_auto;
        svc.tariffType = tariffType;
        svc.typeService = "transportes";
        svc.assignedParentService = svc.parentService || transporte;
        svc.assignedChildService = svc.childService || mwt;
        svc.assignedParentId = transporte.id_transporte || transporte.id;
        svc.assignedChildId = movilidad.id_movilidad || movilidad.id;
        svc.assigned_parent_id = svc.assignedParentId;
        svc.assigned_child_id = svc.assignedChildId;
        svc.assignedTariff = svc.tariff;
        svc.assignedPassengerSelection =
          svc.assignedPassengerSelection ||
          svc.passengerSelection ||
          transportPassengerSelection;
        svc.assignedBeneficiariosAdultos = assignedBeneficiariosAdultos;
        svc.assignedBeneficiariosNinos = [];
        svc.assigned_beneficiarios_adultos = assignedBeneficiariosAdultos;
        svc.assigned_beneficiarios_ninos = [];
        svc.assignedPrecioServicio = assignedPrecioServicio;
        svc.assignedPrecioTotal = assignedPrecioTotal;
        svc.assigned_precio_servicio = assignedPrecioServicio;
        svc.assigned_precio_total = assignedPrecioTotal;
        svc.assignedPrecioAdultoDividido = true;
        svc.assignedCapacidadLimite = true;
        svc.assigned_precio_adulto_dividido = true;
        svc.assigned_capacidad_limite = true;
        return svc;
      })
      .filter(Boolean);
    if (services.length > 0) {
      onAddTransportToDays(selectedDays, services);
      setSelectedDays([]);
      setSelectedMovilidades([]);
    }
  };

  const handleRemove = (dayIndex, serviceId) => {
    if (removeTransportFromDay) removeTransportFromDay(dayIndex, serviceId);
  };

  if (!isOpen) return null;

  const hasReachedLimit =
    maxAllowedMovilidades > 0 &&
    selectedMovilidades.length >= maxAllowedMovilidades;

  const selectedCapacity = selectedMovilidades.reduce(
    (sum, item) => sum + (Number(item.movilidad?.nro_pasajeros) || 0),
    0,
  );
  const selectedTotal = selectedMovilidades.reduce(
    (sum, item) => sum + (item.tariff?._unitPrice || 0),
    0,
  );

  return createPortal(
    <div className="transport-modal-overlay">
      <div className="transport-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="tm-header">
          <div className="tm-header-left">
            <FaCar className="tm-header-icon" />
            <div>
              <h2>Gestionar transportes</h2>
              <p>
                Asignacion interna con movilidades, proveedor y tarifa para los
                slots de transporte de la reserva.
              </p>
            </div>
          </div>
          <div className="tm-header-meta">
            <span className="tm-badge">{totalPassengers} pax</span>
            <span className="tm-badge tm-badge-soft">
              {availableDaysForAssignment.length} dias disponibles
            </span>
          </div>
          <button className="tm-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        {/* Day selector */}
        <div className="tm-days">
          <div className="tm-days-header">
            <span className="tm-days-label">
              <FaCalendarCheck /> Dias
            </span>
            <button
              className="tm-days-toggle"
              onClick={() => {
                if (selectedDays.length === availableDaysForAssignment.length)
                  setSelectedDays([]);
                else setSelectedDays([...availableDaysForAssignment]);
              }}
            >
              <MdSelectAll />{" "}
              {selectedDays.length === availableDaysForAssignment.length
                ? "Ninguno"
                : "Disponibles"}
            </button>
          </div>
          <div className="tm-days-grid">
            {days.map((day, index) => {
              const ts = (day.servicios || []).filter(isTransportService);
              const unassigned = ts.filter((t) => !isServiceAssigned(t));
              const assigned = ts.filter((t) => isServiceAssigned(t));
              const available = unassigned.length > 0;
              return (
                <div
                  key={index}
                  className={`tm-day${selectedDays.includes(index) ? " selected" : ""}${!available ? " disabled" : ""}`}
                  onClick={() => available && handleDayToggle(index)}
                >
                  <span className="tm-day-num">D{index + 1}</span>
                  <span className="tm-day-title">{day.titulo || ""}</span>
                  {assigned.length > 0 && (
                    <span className="tm-day-status complete">
                      {assigned.length} asig.
                    </span>
                  )}
                  {unassigned.length > 0 && (
                    <span className="tm-day-status pending">
                      {unassigned.length} pend.
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Two-panel layout */}
        <div className="tm-panels">
          {/* Left: Parent transportes */}
          <div className="tm-parent-panel">
            <div className="tm-panel-header">
              <h4>Proveedores</h4>
              <span className="tm-panel-count">
                {filteredTransportes.length}/{transportes.length}
              </span>
            </div>
            <div className="tm-panel-search">
              <FaSearch className="tm-search-icon" />
              <input
                type="text"
                placeholder="Buscar transporte..."
                value={parentSearch}
                onChange={(e) => setParentSearch(e.target.value)}
              />
            </div>
            {transportes.length > 0 && (
              <div className="tm-select-all" onClick={selectAllParents}>
                <span
                  className={`tm-dot${selectedTransportes.length === filteredTransportes.length ? " active" : selectedTransportes.length > 0 ? " partial" : ""}`}
                />
                <span className="tm-select-text">
                  {selectedTransportes.length === filteredTransportes.length
                    ? "Deseleccionar todo"
                    : "Seleccionar todo"}
                </span>
                {selectedTransportes.length > 0 && (
                  <span className="tm-select-badge">
                    {selectedTransportes.length}
                  </span>
                )}
              </div>
            )}
            <div className="tm-parent-list">
              {loading ? (
                <div className="tm-state">Cargando...</div>
              ) : error ? (
                <div className="tm-state tm-error">{error}</div>
              ) : filteredTransportes.length === 0 ? (
                <div className="tm-state">Sin transportes disponibles</div>
              ) : (
                filteredTransportes.map((t) => {
                  const id = t.id_transporte || t.id;
                  const checked = isParentSelected(t);
                  const movsCount = allMovilidades.filter(
                    (m) => m.id_transporte === id,
                  ).length;
                  return (
                    <div
                      key={id}
                      className={`tm-parent-row${checked ? " active" : ""}`}
                      onClick={() => toggleParent(t)}
                    >
                      <span className={`tm-row-dot${checked ? " on" : ""}`}>
                        {checked ? "\u2713" : ""}
                      </span>
                      <div className="tm-row-content">
                        <span className="tm-row-name">
                          {t.nombre || t.nombre_transporte}
                        </span>
                        <span className="tm-row-sub">
                          {t.zona || t.ciudad || ""}
                        </span>
                      </div>
                      <span className="tm-row-count">{movsCount}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Child movilidades */}
          <div className="tm-child-panel">
            <div className="tm-panel-header">
              <h4>Movilidades y tarifas</h4>
              <span className="tm-panel-count">
                {filteredMovilidades.length}
                {selectedTransportes.length > 0
                  ? ` de ${selectedTransportes.length} transportes`
                  : ""}
              </span>
            </div>
            <div className="tm-panel-search">
              <FaSearch className="tm-search-icon" />
              <input
                type="text"
                placeholder="Buscar movilidad..."
                value={childSearch}
                onChange={(e) => setChildSearch(e.target.value)}
              />
            </div>
            <div className="tm-child-list">
              {filteredMovilidades.length === 0 ? (
                <div className="tm-state">
                  {selectedTransportes.length === 0
                    ? "Selecciona un transporte para ver movilidades"
                    : "Sin movilidades disponibles"}
                </div>
              ) : (
                filteredMovilidades.map((mov) => {
                  const mid = mov.id_movilidad || mov.id;
                  const selected = isMovSelected(mov);
                  const parentName = getParentName(mov);
                  return (
                    <div
                      key={mid}
                      className={`tm-child-card${selected ? " selected" : ""}${hasReachedLimit && !selected ? " disabled" : ""}`}
                      onClick={() => toggleMovilidad(mov)}
                    >
                      <div className="tm-card-top">
                        <MdDirectionsCar className="tm-card-icon" />
                        <div className="tm-card-info">
                          <span className="tm-card-type">{mov.tipo_auto}</span>
                          {parentName && (
                            <span className="tm-card-parent">{parentName}</span>
                          )}
                        </div>
                        <div className="tm-card-action">
                          {selected ? (
                            <FaCheck className="tm-check" />
                          ) : (
                            <FaPlus className="tm-plus" />
                          )}
                        </div>
                      </div>
                      <div className="tm-card-details">
                        {mov.nro_pasajeros > 0 && (
                          <span className="tm-detail">
                            <FaUsers /> {mov.nro_pasajeros} pax
                          </span>
                        )}
                        {mov.nro_placa && (
                          <span className="tm-detail">{mov.nro_placa}</span>
                        )}
                        {mov.ruta && (
                          <span className="tm-detail tm-ruta" title={mov.ruta}>
                            <FaMapMarkerAlt />{" "}
                            {mov.ruta.length > 25
                              ? mov.ruta.substring(0, 25) + "..."
                              : mov.ruta}
                          </span>
                        )}
                      </div>
                      <div className="tm-card-price">
                        <FaDollarSign />
                        <span>{Number(mov.precioInterno || 0).toFixed(2)}</span>
                        <span className="tm-tariff-tag">interna</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="tm-footer">
          {selectedMovilidades.length > 0 && (
            <div className="tm-selection-summary">
              <span className="tm-sel-text">
                {selectedMovilidades.length} movilidad(es) &middot;{" "}
                {selectedCapacity || 0} pax capacidad &middot; $
                {selectedTotal.toFixed(2)}
              </span>
              <button
                className="tm-clear"
                onClick={() => setSelectedMovilidades([])}
              >
                <FaTrash /> Limpiar
              </button>
            </div>
          )}
          <div className="tm-actions">
            <button className="tm-btn-cancel" onClick={onClose}>
              Cerrar
            </button>
            <button
              className="tm-btn-add"
              disabled={
                selectedDays.length === 0 || selectedMovilidades.length === 0
              }
              onClick={handleAdd}
            >
              <FaPlus /> Agregar {selectedMovilidades.length || 0} a{" "}
              {selectedDays.length || 0} dia(s)
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default TransportAssignmentModal;
