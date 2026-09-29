import React, { useState, useEffect } from "react";
import {
  FaSearch,
  FaSort,
  FaSortUp,
  FaSortDown,
  FaEdit,
  FaTrashAlt,
  FaPlus,
  FaBed,
  FaFilter,
  FaMapMarkerAlt,
  FaStar,
  FaUtensils,
  FaRegTimesCircle,
  FaHotel,
} from "react-icons/fa";
import {
  fetchHoteles,
  createHotel,
  updateHotel,
  deleteHotel,
  getHotelDependencies,
} from "../../services/api";
import { formatTime } from "../../utils/formatters";
import Modal from "../Modal";
import HotelForm from "./HotelForm";
import DeleteConfirmation from "../DeleteConfirmation";
import useAuditInfo from "../../hooks/useAuditInfo";
import HabitacionesHotelList from "../habitacion/HabitacionesHotelList";
import ValoracionModal from "../common/ValoracionModal";

const countCategoryStars = (value) => {
  const text = String(value || "");
  const unicodeStars = (text.match(/\u2B50/g) || []).length;
  if (unicodeStars > 0) return unicodeStars;

  const labelMatch = text.match(/([1-5])\s*(?:estrella|star)/i);
  if (labelMatch) return Number(labelMatch[1]);

  const numberMatch = text.match(/\b([1-5])\b/);
  return numberMatch ? Number(numberMatch[1]) : 0;
};

const HotelList = () => {
  const [hoteles, setHoteles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({
    key: "calificacion",
    direction: "descending",
  });

  // Estados para modales
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [dependentEntities, setDependentEntities] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estado para ver las habitaciones de un hotel
  const [showHabitacionesHotel, setShowHabitacionesHotel] = useState(false);

  // Estado para modal de valoración
  const [showValoracionModal, setShowValoracionModal] = useState(false);
  const [selectedEntityForRating, setSelectedEntityForRating] = useState(null);

  // Estado para filtros avanzados
  const [showFilters, setShowFilters] = useState(true);
  const [filters, setFilters] = useState({
    categoria: [],
    ciudad: [],
    tieneDesayuno: null,
    checkInBefore: null,
    checkOutAfter: null,
  });
  const [availableCities, setAvailableCities] = useState([]);
  const [availableCategories, setAvailableCategories] = useState([]);

  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  // Cargar datos
  useEffect(() => {
    loadHoteles();
  }, []);

  // Extraer valores únicos para filtros al cargar datos
  useEffect(() => {
    if (hoteles.length > 0) {
      // Extraer ciudades únicas
      const cities = [
        ...new Set(hoteles.filter((h) => h.ciudad).map((h) => h.ciudad)),
      ].sort();
      setAvailableCities(cities);

      // Extraer categorías únicas
      const categories = [
        ...new Set(hoteles.filter((h) => h.categoria).map((h) => h.categoria)),
      ].sort((a, b) => {
        // Ordenar primero por número de estrellas
        const starsA = countCategoryStars(a);
        const starsB = countCategoryStars(b);

        if (starsA !== starsB) return starsB - starsA;
        return a.localeCompare(b);
      });
      setAvailableCategories(categories);
    }
  }, [hoteles]);

  const loadHoteles = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchHoteles();
      setHoteles(data);
      setLoading(false);
    } catch (err) {
      setError("Error al cargar los hoteles: " + err.message);
      setLoading(false);
    }
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

  // Actualizar filtros
  const handleFilterChange = (filterName, value) => {
    setFilters((prev) => ({
      ...prev,
      [filterName]: value,
    }));
  };

  // Limpiar todos los filtros
  const clearAllFilters = () => {
    setFilters({
      categoria: [],
      ciudad: [],
      tieneDesayuno: null,
      checkInBefore: null,
      checkOutAfter: null,
    });
    setSearchTerm("");
  };

  // Determinar si hay filtros activos
  const hasActiveFilters = () => {
    return (
      searchTerm !== "" ||
      filters.categoria.length > 0 ||
      filters.ciudad.length > 0 ||
      filters.tieneDesayuno !== null ||
      filters.checkInBefore !== null ||
      filters.checkOutAfter !== null
    );
  };

  // Filtrar y ordenar datos
  const filteredAndSortedHoteles = React.useMemo(() => {
    let filtered = [...hoteles];

    // Aplicar filtro de búsqueda
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (hotel) =>
          (hotel.nombre &&
            hotel.nombre.toLowerCase().includes(lowerSearchTerm)) ||
          (hotel.direccion &&
            hotel.direccion.toLowerCase().includes(lowerSearchTerm)) ||
          (hotel.ciudad &&
            hotel.ciudad.toLowerCase().includes(lowerSearchTerm)),
      );
    }

    // Aplicar filtro de categoría
    if (filters.categoria.length > 0) {
      filtered = filtered.filter(
        (hotel) =>
          hotel.categoria && filters.categoria.includes(hotel.categoria),
      );
    }

    // Aplicar filtro de ciudad
    if (filters.ciudad.length > 0) {
      filtered = filtered.filter(
        (hotel) => hotel.ciudad && filters.ciudad.includes(hotel.ciudad),
      );
    }

    // Aplicar filtro de desayuno
    if (filters.tieneDesayuno !== null) {
      filtered = filtered.filter((hotel) =>
        filters.tieneDesayuno ? hotel.desayuno : !hotel.desayuno,
      );
    }

    // Aplicar filtro de check-in
    if (filters.checkInBefore) {
      filtered = filtered.filter((hotel) => {
        if (!hotel.check_in) return false;
        return hotel.check_in <= filters.checkInBefore;
      });
    }

    // Aplicar filtro de check-out
    if (filters.checkOutAfter) {
      filtered = filtered.filter((hotel) => {
        if (!hotel.check_out) return false;
        return hotel.check_out >= filters.checkOutAfter;
      });
    }

    // Aplicar ordenamiento
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let valueA, valueB;
        // Manejar calificación como objeto con .valoracion
        if (sortConfig.key === "calificacion") {
          valueA = parseFloat(a.calificacion?.valoracion) || 0;
          valueB = parseFloat(b.calificacion?.valoracion) || 0;
        } else {
          valueA = a[sortConfig.key] || "";
          valueB = b[sortConfig.key] || "";
        }

        if (valueA < valueB) {
          return sortConfig.direction === "ascending" ? -1 : 1;
        }
        if (valueA > valueB) {
          return sortConfig.direction === "ascending" ? 1 : -1;
        }
        return 0;
      });
    } else {
      // Sort por defecto: calificación alta primero, luego nombre
      filtered.sort((a, b) => {
        const califA = parseFloat(a.calificacion?.valoracion) || -1;
        const califB = parseFloat(b.calificacion?.valoracion) || -1;
        if (califB !== califA) return califB - califA;
        return (a.nombre || "").localeCompare(b.nombre || "");
      });
    }

    return filtered;
  }, [hoteles, searchTerm, sortConfig, filters]);

  // Handlers para CRUD con info de auditoría
  const handleCreate = async (formData) => {
    try {
      setIsSubmitting(true);
      // Asegurarse de que formData incluye la información de auditoría
      const dataWithAudit = {
        ...formData,
        created_by: userId,
      };

      await createHotel(dataWithAudit);
      setShowCreateModal(false);
      await loadHoteles();
      setIsSubmitting(false);
    } catch (error) {
      setError("Error al crear hotel: " + error.message);
      setIsSubmitting(false);
    }
  };

  const handleEdit = (hotel) => {
    setSelectedHotel(hotel);
    setShowEditModal(true);
  };

  const handleOpenValoracion = (hotel) => {
    setSelectedEntityForRating(hotel);
    setShowValoracionModal(true);
  };

  const handleCloseValoracion = () => {
    setShowValoracionModal(false);
    setSelectedEntityForRating(null);
  };

  const handleSaveValoracion = async (valoracionData) => {
    try {
      setIsSubmitting(true);

      // Construir el objeto de calificación según el formato JSONB esperado
      const calificacionObj = {
        valoracion: valoracionData.valoracion,
        tipo: valoracionData.tipo,
        fecha: new Date().toISOString(),
        usuario: userId,
      };

      // Actualizar el hotel con la nueva valoración
      const updateData = {
        calificacion: calificacionObj,
        updated_by: userId,
      };

      await updateHotel(selectedEntityForRating.id_hotel, updateData);

      handleCloseValoracion();
      await loadHoteles(); // Recargar para ver la nueva valoración
      setIsSubmitting(false);
    } catch (error) {
      console.error("Error al guardar valoración:", error);
      setError("Error al guardar la valoración: " + error.message);
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (formData) => {
    try {
      setIsSubmitting(true);
      // Asegurarse de que formData incluye la información de auditoría
      const dataWithAudit = {
        ...formData,
        updated_by: userId,
      };

      await updateHotel(selectedHotel.id_hotel, dataWithAudit);
      setShowEditModal(false);
      await loadHoteles();
      setIsSubmitting(false);
    } catch (error) {
      setError("Error al actualizar hotel: " + error.message);
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = async (hotel) => {
    setSelectedHotel(hotel);
    setIsSubmitting(true);

    try {
      // Consultar entidades dependientes
      const dependencies = await getHotelDependencies(hotel.id_hotel);
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
      await deleteHotel(selectedHotel.id_hotel);
      setShowDeleteModal(false);
      await loadHoteles();
      setIsSubmitting(false);
    } catch (error) {
      setError("Error al eliminar hotel: " + error.message);
      setIsSubmitting(false);
    }
  };

  const formatDisplayTime = (timeString) => {
    if (!timeString) return "N/A";

    // Formatear la hora para mostrar de forma amigable
    const time = formatTime(timeString);
    if (!time) return "N/A";

    // Mostrar en formato 12h más legible
    const [hours, minutes] = time.split(":");
    let hour = parseInt(hours, 10);
    const period = hour >= 12 ? "PM" : "AM";

    if (hour > 12) hour -= 12;
    if (hour === 0) hour = 12;

    return `${hour}:${minutes} ${period}`;
  };

  // Renderizar valoración con badge de color según rango
  const renderValoracion = (calificacion) => {
    if (!calificacion || !calificacion.valoracion) {
      return <span className="badge secondary">Sin valorar</span>;
    }

    const valor = parseFloat(calificacion.valoracion);

    if (valor >= 0 && valor <= 3) {
      return <span className="badge danger">No recomendable ({valor}/10)</span>;
    } else if (valor >= 4 && valor <= 7) {
      return <span className="badge warning">Servicio apto ({valor}/10)</span>;
    } else if (valor >= 8 && valor <= 10) {
      return <span className="badge success">Recomendable ({valor}/10)</span>;
    }

    return <span className="badge secondary">N/A</span>;
  };

  // Nueva función para manejar la acción de ver habitaciones
  const handleViewHabitaciones = (hotel) => {
    setSelectedHotel(hotel);
    setShowHabitacionesHotel(true);
  };

  // Si estamos viendo las habitaciones de un hotel
  if (showHabitacionesHotel && selectedHotel) {
    return (
      <HabitacionesHotelList
        hotel={selectedHotel}
        onBack={() => setShowHabitacionesHotel(false)}
      />
    );
  }

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

          {filters.categoria.map((cat) => (
            <div key={cat} className="filter-badge">
              <span>Categoría: {cat}</span>
              <button
                onClick={() =>
                  handleFilterChange(
                    "categoria",
                    filters.categoria.filter((c) => c !== cat),
                  )
                }
              >
                <FaRegTimesCircle />
              </button>
            </div>
          ))}

          {filters.ciudad.map((city) => (
            <div key={city} className="filter-badge">
              <span>Ciudad: {city}</span>
              <button
                onClick={() =>
                  handleFilterChange(
                    "ciudad",
                    filters.ciudad.filter((c) => c !== city),
                  )
                }
              >
                <FaRegTimesCircle />
              </button>
            </div>
          ))}

          {filters.tieneDesayuno !== null && (
            <div className="filter-badge">
              <span>Desayuno: {filters.tieneDesayuno ? "Sí" : "No"}</span>
              <button onClick={() => handleFilterChange("tieneDesayuno", null)}>
                <FaRegTimesCircle />
              </button>
            </div>
          )}

          {filters.checkInBefore && (
            <div className="filter-badge">
              <span>Check-in antes de: {filters.checkInBefore}</span>
              <button onClick={() => handleFilterChange("checkInBefore", null)}>
                <FaRegTimesCircle />
              </button>
            </div>
          )}

          {filters.checkOutAfter && (
            <div className="filter-badge">
              <span>Check-out después de: {filters.checkOutAfter}</span>
              <button onClick={() => handleFilterChange("checkOutAfter", null)}>
                <FaRegTimesCircle />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Cargando hoteles...</p>
      </div>
    );
  }

  return (
    <div className="entity-view-container premium-design">
      {/* Header Premium */}
      <div className="header-dashboard no-back">
        <div className="header-main-info">
          <div className="header-title-group">
            <div className="title-icon-wrapper">
              <FaHotel className="title-icon-main" />
            </div>
            <div className="title-text-group">
              <h2 className="main-title">Hoteles</h2>
              <p className="sub-title">Gestión de hoteles y sus categorías</p>
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
              setSelectedHotel(null);
              setShowCreateModal(true);
            }}
          >
            <FaPlus /> <span>Nuevo Hotel</span>
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
                placeholder="Buscar por nombre, dirección o ciudad..."
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
              <FaMapMarkerAlt className="select-icon" />
              <select
                onChange={(e) =>
                  handleFilterChange(
                    "ciudad",
                    e.target.value ? [e.target.value] : [],
                  )
                }
              >
                <option value="">Todas las ciudades</option>
                {availableCities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-select-wrapper">
              <FaStar className="select-icon" />
              <select
                onChange={(e) =>
                  handleFilterChange(
                    "categoria",
                    e.target.value ? [e.target.value] : [],
                  )
                }
              >
                <option value="">Todas las categorías</option>
                {availableCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Resumen y Resultados */}
      <div className="results-summary-modern">
        <span>Mostrando {filteredAndSortedHoteles.length} hoteles</span>
        {hasActiveFilters() && (
          <button className="clear-filters-link" onClick={clearAllFilters}>
            Limpiar Filtros
          </button>
        )}
      </div>

      {/* Contenido Principal (Tabla) */}
      <div className="content-card">
        {filteredAndSortedHoteles.length === 0 ? (
          <div className="empty-state-modern">
            <FaHotel className="empty-icon" />
            <h3>No se encontraron hoteles</h3>
            <p>Intenta ajustar tus criterios de búsqueda.</p>
          </div>
        ) : (
          <div className="table-responsive-modern">
            <table className="premium-table">
              <thead>
                <tr>
                  <th
                    onClick={() => requestSort("nombre")}
                    className="sortable"
                  >
                    Nombre {getSortIcon("nombre")}
                  </th>
                  <th
                    onClick={() => requestSort("ciudad")}
                    className="sortable"
                  >
                    Ubicación {getSortIcon("ciudad")}
                  </th>
                  <th
                    onClick={() => requestSort("categoria")}
                    className="sortable"
                  >
                    Categoría {getSortIcon("categoria")}
                  </th>
                  <th>Check-in / Out</th>
                  <th>Desayuno</th>
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
                {filteredAndSortedHoteles.map((hotel) => (
                  <tr key={hotel.id_hotel} className="premium-row">
                    <td>
                      <div className="entity-cell">
                        <span className="entity-name">{hotel.nombre}</span>
                        <span className="entity-sub">
                          {hotel.telefono || "Sin teléfono"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="location-cell">
                        <FaMapMarkerAlt /> <span>{hotel.ciudad || "N/A"}</span>
                      </div>
                    </td>
                    <td>
                      <span className="badge secondary">
                        {hotel.categoria || "N/A"}
                      </span>
                    </td>
                    <td>
                      <div className="time-badge-group">
                        <span className="time-badge in">
                          In: {formatDisplayTime(hotel.check_in)}
                        </span>
                        <span className="time-badge out">
                          Out: {formatDisplayTime(hotel.check_out)}
                        </span>
                      </div>
                    </td>
                    <td>
                      {hotel.desayuno ? (
                        <div className="service-badge success">
                          <FaUtensils /> <span>Incluido</span>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>{renderValoracion(hotel.calificacion)}</td>
                    <td>
                      <div className="premium-actions">
                        <button
                          className="action-btn rating"
                          onClick={() => handleOpenValoracion(hotel)}
                          title="Calificar"
                        >
                          <FaStar />
                        </button>
                        <button
                          className="action-btn view"
                          onClick={() => handleViewHabitaciones(hotel)}
                          title="Habitaciones"
                        >
                          <FaBed />
                        </button>
                        <button
                          className="action-btn edit"
                          onClick={() => handleEdit(hotel)}
                          title="Editar"
                        >
                          <FaEdit />
                        </button>
                        <button
                          className="action-btn delete"
                          onClick={() => handleDeleteClick(hotel)}
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

      {/* Modales */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Crear Nuevo Hotel"
      >
        <HotelForm onSubmit={handleCreate} isSubmitting={isSubmitting} />
      </Modal>

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Editar Hotel"
      >
        <HotelForm
          hotel={selectedHotel}
          onSubmit={handleUpdate}
          isSubmitting={isSubmitting}
        />
      </Modal>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Eliminar Hotel"
        size="small"
      >
        <DeleteConfirmation
          entityName="este hotel"
          entityData={selectedHotel}
          dependentEntities={dependentEntities}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
          isDeleting={isSubmitting}
        />
      </Modal>

      {showValoracionModal && (
        <ValoracionModal
          show={showValoracionModal}
          onClose={handleCloseValoracion}
          entity={selectedEntityForRating}
          entityType="hotel"
          onSave={handleSaveValoracion}
        />
      )}
    </div>
  );
};

export default HotelList;
