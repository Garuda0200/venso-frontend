import React, { useState, useEffect, useMemo } from "react";
import {
  FaPlus,
  FaEdit,
  FaTrashAlt,
  FaSearch,
  FaSortUp,
  FaSortDown,
  FaSort,
  FaBed,
  FaMapMarkerAlt,
  FaClock,
  FaStar,
  FaFilter,
  FaRegTimesCircle,
  FaArrowLeft,
} from "react-icons/fa";
import {
  fetchHabitacionesByHotel,
  fetchHabitacionesByHotelWithTarifas,
  createHabitacion,
  updateHabitacion,
  deleteHabitacion,
  getHabitacionDependencies,
} from "../../services/api";
import { BADGE_COLORS } from "../../utils/constants";
import Modal from "../Modal";
import HabitacionForm from "./HabitacionForm";
import DeleteConfirmation from "../DeleteConfirmation";
import TarifasCellRenderer from "../tarifa/TarifasCellRenderer";
import useAuditInfo from "../../hooks/useAuditInfo";
import TarifaFilterPanel from "../common/TarifaFilterPanel";
import ValoracionModal from "../common/ValoracionModal";

const HabitacionesHotelList = ({ hotel, onBack }) => {
  const [habitaciones, setHabitaciones] = useState([]);
  const [habitacionesConTarifas, setHabitacionesConTarifas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({
    key: "calificacion",
    direction: "descending",
  });

  // Estados para filtros avanzados
  const [showFilters, setShowFilters] = useState(true);
  const [filters, setFilters] = useState({
    tiposHabitacion: [],
    estados: [],
    tieneTarifa: null,
    rangoPrecio: {
      min: null,
      max: null,
    },
    tipoTarifa: [], // 'interna', 'externa'
  });

  // Valores para los filtros
  const [availableRoomTypes, setAvailableRoomTypes] = useState([]);
  const [availableStates, setAvailableStates] = useState([]);
  const [priceRange, setPriceRange] = useState({ min: 0, max: 0 });

  // Estados para modales
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [selectedHabitacion, setSelectedHabitacion] = useState(null);
  const [dependentEntities, setDependentEntities] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showValoracionModal, setShowValoracionModal] = useState(false);
  const [selectedEntityForRating, setSelectedEntityForRating] = useState(null);

  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  // Memoize create data to avoid inline object re-creation
  const createHabitacionData = useMemo(
    () => ({ id_hotel: hotel.id_hotel }),
    [hotel.id_hotel],
  );

  // Cargar habitaciones
  useEffect(() => {
    loadHabitaciones();
  }, [hotel]);

  // Extraer valores únicos para filtros
  useEffect(() => {
    if (habitaciones.length > 0) {
      // Extraer tipos de habitación
      const types = [
        ...new Set(habitaciones.map((h) => h.tipo_habitacion)),
      ].sort();
      setAvailableRoomTypes(types);

      // Extraer estados
      const states = [...new Set(habitaciones.map((h) => h.estado))].sort();
      setAvailableStates(states);
    }

    if (habitacionesConTarifas.length > 0) {
      // Calcular rango de precios
      let minPrice = Infinity;
      let maxPrice = 0;

      habitacionesConTarifas.forEach((hab) => {
        if (hab.tarifas && hab.tarifas.length > 0) {
          hab.tarifas.forEach((tarifa) => {
            const prices = [
              parseFloat(tarifa.precio_compartido) || 0,
              parseFloat(tarifa.precio_privado) || 0,
            ];

            const currentMin = Math.min(...prices);
            const currentMax = Math.max(...prices);

            if (currentMin < minPrice) minPrice = currentMin;
            if (currentMax > maxPrice) maxPrice = currentMax;
          });
        }
      });

      // Ajustar para evitar valores extremos
      if (minPrice === Infinity) minPrice = 0;
      if (maxPrice === 0) maxPrice = 1000;

      setPriceRange({ min: minPrice, max: maxPrice });
    }
  }, [habitaciones, habitacionesConTarifas]);

  const loadHabitaciones = async () => {
    if (!hotel || !hotel.id_hotel) {
      console.error("No se encontró el ID del hotel");
      setError(
        "No se pudo cargar las habitaciones porque no se proporcionó un hotel válido",
      );
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Cargar datos básicos de habitaciones
      const habitacionesData = await fetchHabitacionesByHotel(hotel.id_hotel);
      setHabitaciones(habitacionesData);

      // Cargar datos con tarifas para visualización
      const withTarifasData = await fetchHabitacionesByHotelWithTarifas(
        hotel.id_hotel,
      );
      setHabitacionesConTarifas(withTarifasData);

      setLoading(false);
    } catch (err) {
      setError("Error al cargar las habitaciones: " + err.message);
      setLoading(false);
    }
  };

  // Actualizar filtros
  const handleFilterChange = (filterName, value) => {
    setFilters((prev) => ({
      ...prev,
      [filterName]: value,
    }));
  };

  // Actualizar filtro de rango de precio
  const handlePriceRangeChange = (minOrMax, value) => {
    setFilters((prev) => ({
      ...prev,
      rangoPrecio: {
        ...prev.rangoPrecio,
        [minOrMax]: value !== "" ? parseFloat(value) : null,
      },
    }));
  };

  // Limpiar todos los filtros
  const clearAllFilters = () => {
    setFilters({
      tiposHabitacion: [],
      estados: [],
      tieneTarifa: null,
      rangoPrecio: {
        min: null,
        max: null,
      },
      tipoTarifa: [],
    });
    setSearchTerm("");
  };

  // Ordenar datos
  const requestSort = (key) => {
    let direction = "ascending";
    if (sortConfig.key === key && sortConfig.direction === "ascending") {
      direction = "descending";
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (columnName) => {
    if (sortConfig.key === columnName) {
      return sortConfig.direction === "ascending" ? (
        <FaSortUp />
      ) : (
        <FaSortDown />
      );
    }
    return <FaSort />;
  };

  // Determinar si una habitación tiene tarifas
  const habitacionTieneTarifas = (habitacionId) => {
    const habitacionConTarifa = habitacionesConTarifas.find(
      (h) => h.habitacion?.id_habitacion === habitacionId,
    );

    return !!(
      habitacionConTarifa &&
      habitacionConTarifa.tarifas &&
      habitacionConTarifa.tarifas.length > 0
    );
  };

  // Obtener precios mínimos y máximos para una habitación
  const getHabitacionPriceRange = (habitacionId) => {
    const habitacionConTarifa = habitacionesConTarifas.find(
      (h) => h.habitacion?.id_habitacion === habitacionId,
    );

    if (
      !habitacionConTarifa ||
      !habitacionConTarifa.tarifas ||
      habitacionConTarifa.tarifas.length === 0
    ) {
      return { min: null, max: null };
    }

    let minPrice = Infinity;
    let maxPrice = 0;

    habitacionConTarifa.tarifas.forEach((tarifa) => {
      const prices = [
        parseFloat(tarifa.precio_compartido) || 0,
        parseFloat(tarifa.precio_privado) || 0,
      ];

      const currentMin = Math.min(...prices);
      const currentMax = Math.max(...prices);

      if (currentMin < minPrice) minPrice = currentMin;
      if (currentMax > maxPrice) maxPrice = currentMax;
    });

    if (minPrice === Infinity) minPrice = null;

    return { min: minPrice, max: maxPrice };
  };

  // Obtener tipos de tarifa para una habitación
  const getHabitacionTiposTarifa = (habitacionId) => {
    const habitacionConTarifa = habitacionesConTarifas.find(
      (h) => h.habitacion?.id_habitacion === habitacionId,
    );

    if (
      !habitacionConTarifa ||
      !habitacionConTarifa.tarifas ||
      habitacionConTarifa.tarifas.length === 0
    ) {
      return [];
    }

    return [
      ...new Set(
        habitacionConTarifa.tarifas.map((tarifa) => tarifa.tipo_tarifa),
      ),
    ];
  };

  // Determinar si hay filtros activos
  const hasActiveFilters = () => {
    return (
      searchTerm !== "" ||
      filters.tiposHabitacion.length > 0 ||
      filters.estados.length > 0 ||
      filters.tieneTarifa !== null ||
      filters.rangoPrecio.min !== null ||
      filters.rangoPrecio.max !== null ||
      filters.tipoTarifa.length > 0
    );
  };

  // Filtrar y ordenar datos
  const filteredAndSortedHabitaciones = React.useMemo(() => {
    let filtered = [...habitaciones];

    // Aplicar filtro de búsqueda
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (habitacion) =>
          habitacion.tipo_habitacion.toLowerCase().includes(lowerSearchTerm) ||
          habitacion.estado.toLowerCase().includes(lowerSearchTerm),
      );
    }

    // Aplicar filtro de tipo de habitación
    if (filters.tiposHabitacion.length > 0) {
      filtered = filtered.filter((habitacion) =>
        filters.tiposHabitacion.includes(habitacion.tipo_habitacion),
      );
    }

    // Aplicar filtro de estado
    if (filters.estados.length > 0) {
      filtered = filtered.filter((habitacion) =>
        filters.estados.includes(habitacion.estado),
      );
    }

    // Aplicar filtro de tarifa
    if (filters.tieneTarifa !== null) {
      filtered = filtered.filter((habitacion) => {
        const tieneTarifas = habitacionTieneTarifas(habitacion.id_habitacion);
        return filters.tieneTarifa ? tieneTarifas : !tieneTarifas;
      });
    }

    // Aplicar filtro de rango de precio
    if (filters.rangoPrecio.min !== null || filters.rangoPrecio.max !== null) {
      filtered = filtered.filter((habitacion) => {
        const priceRange = getHabitacionPriceRange(habitacion.id_habitacion);

        // Si no tiene tarifas, excluir
        if (priceRange.min === null) return false;

        // Filtrar por precio mínimo y máximo
        if (
          filters.rangoPrecio.min !== null &&
          priceRange.min < filters.rangoPrecio.min
        )
          return false;
        if (
          filters.rangoPrecio.max !== null &&
          priceRange.max > filters.rangoPrecio.max
        )
          return false;

        return true;
      });
    }

    // Aplicar filtro de tipo de tarifa
    if (filters.tipoTarifa.length > 0) {
      filtered = filtered.filter((habitacion) => {
        const tiposTarifa = getHabitacionTiposTarifa(habitacion.id_habitacion);
        return filters.tipoTarifa.some((tipo) => tiposTarifa.includes(tipo));
      });
    }

    // Aplicar ordenamiento
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aValue, bValue;
        if (sortConfig.key === "calificacion") {
          aValue = parseFloat(a.calificacion?.valoracion) || 0;
          bValue = parseFloat(b.calificacion?.valoracion) || 0;
        } else {
          aValue = a[sortConfig.key];
          bValue = b[sortConfig.key];
          if (aValue === undefined || aValue === null) aValue = "";
          if (bValue === undefined || bValue === null) bValue = "";
        }
        if (aValue < bValue) {
          return sortConfig.direction === "ascending" ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === "ascending" ? 1 : -1;
        }
        return 0;
      });
    } else {
      filtered.sort((a, b) => {
        const califA = parseFloat(a.calificacion?.valoracion) || -1;
        const califB = parseFloat(b.calificacion?.valoracion) || -1;
        if (califB !== califA) return califB - califA;
        return (a.tipo_habitacion || "").localeCompare(b.tipo_habitacion || "");
      });
    }

    return filtered;
  }, [habitaciones, searchTerm, sortConfig, filters, habitacionesConTarifas]);

  // Cálculo de total de tarifas filtradas para la barra de acciones masivas

  // Handlers para CRUD
  const handleOpenValoracion = (habitacion) => {
    setSelectedEntityForRating(habitacion);
    setShowValoracionModal(true);
  };

  const handleSaveValoracion = async (valoracionData) => {
    try {
      setIsSubmitting(true);
      const calificacionObj = {
        valoracion: valoracionData.valoracion,
        tipo: valoracionData.tipo,
        fecha: new Date().toISOString(),
        usuario: userId,
      };
      await updateHabitacion(selectedEntityForRating.id_habitacion, {
        calificacion: calificacionObj,
        updated_by: userId,
      });
      setShowValoracionModal(false);
      setSelectedEntityForRating(null);
      await loadHabitaciones();
    } catch (error) {
      console.error("Error al guardar valoración:", error);
      setError("Error al guardar la valoración: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderValoracion = (calificacion) => {
    if (!calificacion || !calificacion.valoracion) {
      return <span className="badge secondary">Sin valorar</span>;
    }
    const valor = parseFloat(calificacion.valoracion);
    if (valor >= 0 && valor <= 3)
      return <span className="badge danger">No recomendable ({valor}/10)</span>;
    if (valor >= 4 && valor <= 7)
      return <span className="badge warning">Servicio apto ({valor}/10)</span>;
    if (valor >= 8 && valor <= 10)
      return <span className="badge success">Recomendable ({valor}/10)</span>;
    return <span className="badge secondary">N/A</span>;
  };

  const handleCreate = async (formData) => {
    try {
      setIsSubmitting(true);

      // Si formData es null, el usuario canceló
      if (!formData) {
        setShowCreateModal(false);
        setIsSubmitting(false);
        return;
      }

      // Asegurarse que se incluya el id_hotel
      const dataToSend = {
        ...formData,
        id_hotel: hotel.id_hotel,
        created_by: userId,
      };

      await createHabitacion(dataToSend);
      setShowCreateModal(false);
      await loadHabitaciones();
      setIsSubmitting(false);
    } catch (error) {
      setError("Error al crear habitación: " + error.message);
      setIsSubmitting(false);
    }
  };

  const handleEdit = (habitacion) => {
    setSelectedHabitacion(habitacion);
    setShowEditModal(true);
  };

  const handleUpdate = async (formData) => {
    try {
      setIsSubmitting(true);

      // Si formData es null, el usuario canceló
      if (!formData) {
        setShowEditModal(false);
        setIsSubmitting(false);
        return;
      }

      // Asegurarse que se incluya el id_hotel
      const dataToSend = {
        ...formData,
        id_hotel: hotel.id_hotel,
        updated_by: userId,
      };

      await updateHabitacion(selectedHabitacion.id_habitacion, dataToSend);
      setShowEditModal(false);
      await loadHabitaciones();
      setIsSubmitting(false);
    } catch (error) {
      setError("Error al actualizar habitación: " + error.message);
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = async (habitacion) => {
    setSelectedHabitacion(habitacion);
    setIsSubmitting(true);

    try {
      // Consultar entidades dependientes (tarifas)
      const dependencies = await getHabitacionDependencies(
        habitacion.id_habitacion,
      );
      setDependentEntities(dependencies);
      setShowDeleteModal(true);
    } catch (error) {
      setError("Error al consultar dependencias: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsSubmitting(true);
      await deleteHabitacion(selectedHabitacion.id_habitacion);
      setShowDeleteModal(false);
      await loadHabitaciones();
      setIsSubmitting(false);
    } catch (error) {
      setError("Error al eliminar habitación: " + error.message);
      setIsSubmitting(false);
    }
  };


  // Renderizar badge de estado
  const renderEstadoBadge = (estado) => {
    const badgeClass = `badge ${BADGE_COLORS[estado.toLowerCase()] || "secondary"}`;
    return <span className={badgeClass}>{estado}</span>;
  };

  // Función para renderizar resumen de tarifas en la tabla
  const renderResumenTarifas = (habitacion) => {
    const habitacionConTarifa = habitacionesConTarifas.find(
      (h) => h.habitacion?.id_habitacion === habitacion.id_habitacion,
    );

    let tarifas = habitacionConTarifa?.tarifas || [];

    // Aplicar filtro de tipo de tarifa si existe
    if (filters.tipoTarifa.length > 0) {
      tarifas = tarifas.filter((t) =>
        filters.tipoTarifa.includes(t.tipo_tarifa),
      );
    }

    return (
      <TarifasCellRenderer
        tarifas={tarifas}
        serviceId={habitacion.id_habitacion}
        serviceType="habitacion"
        allTarifas={habitacionConTarifa?.tarifas || []}
        onTarifasUpdated={loadHabitaciones}
      />
    );
  };

  // Renderizar filtros activos como badges
  const renderActiveFilters = () => {
    if (!hasActiveFilters()) return null;

    return (
      <div className="active-filters">
        <div className="active-filters-header">
          <span>Filtros activos:</span>
          <button className="clear-all-button" onClick={clearAllFilters}>
            Limpiar todos
          </button>
        </div>
        <div className="filter-badges">
          {searchTerm && (
            <div className="filter-badge">
              <span>Búsqueda: {searchTerm}</span>
              <button onClick={() => setSearchTerm("")}>
                <FaRegTimesCircle />
              </button>
            </div>
          )}

          {filters.tiposHabitacion.map((tipo) => (
            <div key={tipo} className="filter-badge">
              <span>Tipo: {tipo}</span>
              <button
                onClick={() =>
                  handleFilterChange(
                    "tiposHabitacion",
                    filters.tiposHabitacion.filter((t) => t !== tipo),
                  )
                }
              >
                <FaRegTimesCircle />
              </button>
            </div>
          ))}

          {filters.estados.map((estado) => (
            <div key={estado} className="filter-badge">
              <span>Estado: {estado}</span>
              <button
                onClick={() =>
                  handleFilterChange(
                    "estados",
                    filters.estados.filter((e) => e !== estado),
                  )
                }
              >
                <FaRegTimesCircle />
              </button>
            </div>
          ))}

          {filters.tieneTarifa !== null && (
            <div className="filter-badge">
              <span>{filters.tieneTarifa ? "Con tarifas" : "Sin tarifas"}</span>
              <button onClick={() => handleFilterChange("tieneTarifa", null)}>
                <FaRegTimesCircle />
              </button>
            </div>
          )}

          {filters.rangoPrecio.min !== null && (
            <div className="filter-badge">
              <span>Precio mínimo: $ {filters.rangoPrecio.min}</span>
              <button onClick={() => handlePriceRangeChange("min", null)}>
                <FaRegTimesCircle />
              </button>
            </div>
          )}

          {filters.rangoPrecio.max !== null && (
            <div className="filter-badge">
              <span>Precio máximo: $ {filters.rangoPrecio.max}</span>
              <button onClick={() => handlePriceRangeChange("max", null)}>
                <FaRegTimesCircle />
              </button>
            </div>
          )}

          {filters.tipoTarifa.map((tipo) => (
            <div key={tipo} className="filter-badge">
              <span>Tarifa {tipo}</span>
              <button
                onClick={() =>
                  handleFilterChange(
                    "tipoTarifa",
                    filters.tipoTarifa.filter((t) => t !== tipo),
                  )
                }
              >
                <FaRegTimesCircle />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Cargando habitaciones...</p>
      </div>
    );
  }

  // Add helper function to prevent wheel scrolling
  const preventWheelChange = (e) => {
    e.target.blur();
  };

  // Add helper function to prevent arrow keys from changing values
  const preventArrowChange = (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
    }
  };

  return (
    <div className="entity-view-container premium-design">
      <div className="back-navigation">
        <button onClick={onBack} className="back-link-btn">
          <FaArrowLeft /> <span>Volver a Hoteles</span>
        </button>
      </div>

      <div className="header-dashboard no-back">
        <div className="header-main-info">
          <div className="header-title-group">
            <div className="title-icon-wrapper">
              <FaBed className="title-icon-main" />
            </div>
            <div className="title-text-group">
              <h2 className="main-title">Habitaciones: {hotel.nombre}</h2>
              <div className="header-badges">
                {hotel.categoria && (
                  <div className="info-badge">
                    <FaStar className="badge-icon" /> {hotel.categoria}
                  </div>
                )}
                {hotel.ciudad && (
                  <div className="info-badge">
                    <FaMapMarkerAlt className="badge-icon" /> {hotel.ciudad}
                  </div>
                )}
                {hotel.check_in && (
                  <div className="info-badge">
                    <FaClock className="badge-icon" /> In:{" "}
                    {hotel.check_in.substring(0, 5)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="header-actions-group">
          <button
            className={`premium-btn secondary ${showFilters ? "active" : ""}`}
            onClick={() => setShowFilters(true)}
          >
            <FaFilter /> <span>Filtros</span>
            {hasActiveFilters() && <span className="filter-dot"></span>}
          </button>
          <button
            className="premium-btn primary"
            onClick={() => {
              setSelectedHabitacion(null);
              setShowCreateModal(true);
            }}
          >
            <FaPlus /> <span>Nueva Habitación</span>
          </button>
        </div>
      </div>

      {error && <div className="premium-alert danger">{error}</div>}

      {/* Panel de Filtros Moderno */}
      <div className={`filters-wrapper ${showFilters ? "show" : ""}`}>
        <div className="filters-glass-panel">
          <div className="filters-row">
            <div className="search-bar-modern">
              <FaSearch className="search-icon" />
              <input
                type="text"
                placeholder="Buscar por tipo de habitación o estado..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  className="search-clear"
                  onClick={() => setSearchTerm("")}
                >
                  &times;
                </button>
              )}
            </div>

            <div className="filter-select-wrapper">
              <FaBed className="select-icon" />
              <select
                onChange={(e) =>
                  handleFilterChange(
                    "tiposHabitacion",
                    e.target.value ? [e.target.value] : [],
                  )
                }
              >
                <option value="">Todos los tipos</option>
                {availableRoomTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <TarifaFilterPanel
            tipoTarifaFilter={filters.tipoTarifa}
            onChange={(val) => handleFilterChange("tipoTarifa", val)}
            onClear={() => handleFilterChange("tipoTarifa", [])}
            label="Filtrar por Tarifas"
          />
        </div>
      </div>

      {/* Resultados y Filtros Activos */}
      <div className="results-summary-modern">
        <span>
          Mostrando {filteredAndSortedHabitaciones.length} habitaciones
        </span>
        {hasActiveFilters() && (
          <button className="clear-filters-link" onClick={clearAllFilters}>
            Limpiar Filtros
          </button>
        )}
      </div>



      {/* Contenido Principal (Tabla) */}
      <div className="content-card">
        {filteredAndSortedHabitaciones.length === 0 ? (
          <div className="empty-state-modern">
            <FaBed className="empty-icon" />
            <h3>No se encontraron habitaciones</h3>
            <p>Intenta ajustar tus filtros o busca otro término.</p>
          </div>
        ) : (
          <div className="table-responsive-modern">
            <table className="premium-table">
              <thead>
                <tr>
                  <th
                    onClick={() => requestSort("tipo_habitacion")}
                    className="sortable"
                  >
                    Tipo {getSortIcon("tipo_habitacion")}
                  </th>
                  <th
                    onClick={() => requestSort("capacidad")}
                    className="sortable"
                  >
                    Capacidad {getSortIcon("capacidad")}
                  </th>
                  <th>Tarifas</th>
                  <th
                    onClick={() => requestSort("calificacion")}
                    className="sortable"
                  >
                    Valoración {getSortIcon("calificacion")}
                  </th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedHabitaciones.map((habitacion) => (
                  <tr key={habitacion.id_habitacion} className="premium-row">
                    <td>
                      <div className="entity-cell">
                        <div className="entity-icon-box">
                          <FaBed />
                        </div>
                        <div className="entity-info">
                          <span className="entity-name">
                            {habitacion.tipo_habitacion}
                          </span>
                          <span className="entity-status">
                            {renderEstadoBadge(habitacion.estado)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="room-capacity-badge">
                        {Number(habitacion.capacidad) || 2} pax
                      </span>
                    </td>
                    <td>{renderResumenTarifas(habitacion)}</td>
                    <td>{renderValoracion(habitacion.calificacion)}</td>
                    <td>
                      <div className="premium-actions">
                        <button
                          className="action-btn rate"
                          onClick={() => handleOpenValoracion(habitacion)}
                          title="Calificar"
                        >
                          <FaStar />
                        </button>
                        <button
                          className="action-btn edit"
                          onClick={() => handleEdit(habitacion)}
                          title="Editar"
                        >
                          <FaEdit />
                        </button>
                        <button
                          className="action-btn delete"
                          onClick={() => handleDeleteClick(habitacion)}
                          title="Eliminar"
                        >
                          <FaTrashAlt />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal para crear habitación */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Crear Nueva Habitación"
      >
        <HabitacionForm
          habitacion={createHabitacionData}
          onSubmit={handleCreate}
          isSubmitting={isSubmitting}
        />
      </Modal>

      {/* Modal para editar habitación */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Editar Habitación"
      >
        <HabitacionForm
          habitacion={selectedHabitacion}
          onSubmit={handleUpdate}
          isSubmitting={isSubmitting}
        />
      </Modal>

      {/* Modal para eliminar habitación */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Eliminar Habitación"
        size="small"
      >
        <DeleteConfirmation
          entityName="esta habitación"
          entityData={selectedHabitacion}
          dependentEntities={dependentEntities}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
          isDeleting={isSubmitting}
        />
      </Modal>


      {/* Modal para valoración */}
      {showValoracionModal && (
        <ValoracionModal
          show={showValoracionModal}
          onClose={() => {
            setShowValoracionModal(false);
            setSelectedEntityForRating(null);
          }}
          entity={selectedEntityForRating}
          entityType="habitación"
          onSave={handleSaveValoracion}
        />
      )}

    </div>
  );
};

export default HabitacionesHotelList;
