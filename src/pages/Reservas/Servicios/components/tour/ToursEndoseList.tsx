import React, { useState, useEffect, useMemo } from "react";
import {
  FaPlus,
  FaEdit,
  FaTrashAlt,
  FaSearch,
  FaFilter,
  FaChevronLeft,
  FaInfoCircle,
  FaChevronDown,
  FaChevronRight,
  FaRoute,
} from "react-icons/fa";
import {
  fetchToursByEndoseWithTarifas,
  createTour,
  updateTour,
  deleteTour,
  getTourDependencies,
} from "../../services/api";
import { BADGE_COLORS } from "../../utils/constants";
import Modal from "../Modal";
import TourForm from "./TourForm";
import DeleteConfirmation from "../DeleteConfirmation";
import TarifasCellRenderer from "../tarifa/TarifasCellRenderer";
import useAuditInfo from "../../hooks/useAuditInfo";
import TarifaFilterPanel from "../common/TarifaFilterPanel";

const ToursEndoseList = ({ endose, onBack }) => {
  // Estado único para datos normalizados
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [tipoTarifaFilter, setTipoTarifaFilter] = useState([]);
  const [showFilters, setShowFilters] = useState(true);

  // Track expanded groups
  const [expandedGroups, setExpandedGroups] = useState({});

  // Estados para modales
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [selectedTour, setSelectedTour] = useState(null);
  const [dependentEntities, setDependentEntities] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  // Cargar tours
  useEffect(() => {
    loadTours();
  }, [endose]);

  const loadTours = async () => {
    if (!endose?.id_endose) return;
    try {
      setLoading(true);
      setError(null);

      // Cargamos directamente con tarifas
      const withTarifasData = await fetchToursByEndoseWithTarifas(
        endose.id_endose,
      );

      // Normalizar datos
      const normalizedData = withTarifasData.map((item) => ({
        ...(item.tour || {}),
        tarifas: item.tarifas || [],
      }));

      setData(normalizedData);

      // Initialize expanded state for all tipo_guiado groups
      const tipos = [...new Set(normalizedData.map((t) => t.tipo_guiado))];
      const initialExpandedState = {};
      tipos.forEach((tipo) => {
        initialExpandedState[tipo] = true;
      });
      setExpandedGroups(initialExpandedState);

      setLoading(false);
    } catch (err) {
      setError("Error al cargar los tours: " + err.message);
      setLoading(false);
    }
  };

  // Filtrar y ordenar datos
  const filteredData = useMemo(() => {
    // 1. Mapeamos los datos para incluir solo las tarifas filtradas si es necesario
    const processed = data.map((t) => ({
      ...t,
      tarifasFiltradas:
        tipoTarifaFilter.length > 0
          ? (t.tarifas || []).filter((tr) =>
              tipoTarifaFilter.includes(tr.tipo_tarifa),
            )
          : t.tarifas || [],
    }));

    return processed.filter((t) => {
      // Búsqueda
      const matchesSearch =
        !searchTerm ||
        (t.tipo_guiado || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        (t.idioma || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.observaciones || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        (t.estado || "").toLowerCase().includes(searchTerm.toLowerCase());

      // Tipo Tarifa: Si hay filtro activo, solo mostramos si tiene al menos una tarifa filtrada
      const matchesTarifa =
        tipoTarifaFilter.length === 0 || t.tarifasFiltradas.length > 0;

      return matchesSearch && matchesTarifa;
    });
  }, [data, searchTerm, tipoTarifaFilter]);

  // Cálculo de total de tarifas filtradas para la barra de acciones masivas

  const hasActiveFilters = () => {
    return searchTerm !== "" || tipoTarifaFilter.length > 0;
  };

  // Group tours by tipo_guiado
  const groupedTours = useMemo(() => {
    const groups = {};
    filteredData.forEach((tour) => {
      const groupKey = tour.tipo_guiado || "Sin Categoría";
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(tour);
    });

    return Object.entries(groups).map(([tipo_guiado, tours]) => ({
      tipo_guiado,
      tours,
      count: tours.length,
    }));
  }, [filteredData]);

  // Toggle expanded state for a group
  const toggleGroup = (tipo_guiado) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [tipo_guiado]: !prev[tipo_guiado],
    }));
  };

  const toggleAllGroups = (expand) => {
    const newState = {};
    Object.keys(expandedGroups).forEach((tipo) => {
      newState[tipo] = expand;
    });
    setExpandedGroups(newState);
  };

  // Handlers para CRUD
  const handleCreate = async (formData) => {
    if (!formData) {
      setShowCreateModal(false);
      return;
    }
    try {
      setIsSubmitting(true);
      await createTour({
        ...formData,
        id_endose: endose.id_endose,
        created_by: userId,
      });
      setShowCreateModal(false);
      await loadTours();
    } catch (error) {
      setError("Error al crear tour: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (tour) => {
    setSelectedTour(tour);
    setShowEditModal(true);
  };

  const handleUpdate = async (formData) => {
    if (!formData) {
      setShowEditModal(false);
      return;
    }
    try {
      setIsSubmitting(true);
      await updateTour(selectedTour.id_tipotour, {
        ...formData,
        updated_by: userId,
      });
      setShowEditModal(false);
      await loadTours();
    } catch (error) {
      setError("Error al actualizar tour: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = async (tour) => {
    setSelectedTour(tour);
    setIsSubmitting(true);
    try {
      const dependencies = await getTourDependencies(tour.id_tipotour);
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
      await deleteTour(selectedTour.id_tipotour);
      setShowDeleteModal(false);
      await loadTours();
    } catch (error) {
      setError("Error al eliminar tour: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleQuickAddVariant = (tipo_guiado) => {
    setSelectedTour({
      tipo_guiado,
      estado: "disponible",
      isVariantCreation: true,
    });
    setShowCreateModal(true);
  };

  // Render helpers
  const renderEstadoBadge = (estado) => {
    const badgeClass = `badge ${BADGE_COLORS[(estado || "").toLowerCase()] || "secondary"}`;
    return <span className={badgeClass}>{estado}</span>;
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Cargando tours...</p>
      </div>
    );
  }

  return (
    <div className="entity-view-container premium-design">
      {/* Botón Volver */}
      <div className="back-navigation">
        <button onClick={onBack} className="back-link-btn">
          <FaChevronLeft /> <span>Volver a Endoses</span>
        </button>
      </div>

      {/* Header Premium */}
      <div className="header-dashboard">
        <div className="header-main-info">
          <div className="header-title-group">
            <div className="title-icon-wrapper">
              <FaRoute className="title-icon-main" />
            </div>
            <div className="title-text-group">
              <h2 className="main-title">Tours / Paquetes</h2>
              <p className="sub-title">Endose: {endose.nombre}</p>
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
              setSelectedTour(null);
              setShowCreateModal(true);
            }}
          >
            <FaPlus /> <span>Nuevo Tour</span>
          </button>
        </div>
      </div>

      {error && <div className="premium-alert danger">{error}</div>}

      {/* Panel de Filtros Moderno */}
      <div className={`filters-wrapper ${showFilters ? "show" : ""}`}>
        <div className="filters-glass-panel">
          <div className="search-bar-modern">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Buscar por tipo, idioma, observaciones..."
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

          <TarifaFilterPanel
            tipoTarifaFilter={tipoTarifaFilter}
            onChange={setTipoTarifaFilter}
            onClear={() => setTipoTarifaFilter([])}
            label="Tipos de Tarifa"
          />
        </div>
      </div>



      {/* Vista Agrupada */}
      <div className="tickets-view-container">
        <div className="tickets-grouped-view">
          <div className="grouped-controls">
            <button
              className="premium-btn secondary-outline sm"
              onClick={() =>
                toggleAllGroups(Object.values(expandedGroups).some((v) => !v))
              }
            >
              {Object.values(expandedGroups).some((v) => !v)
                ? "Expandir Todos"
                : "Contraer Todos"}
            </button>
          </div>

          {groupedTours.length === 0 ? (
            <div className="empty-state-modern">
              <FaRoute className="empty-icon" />
              <h3>No se encontraron tours</h3>
              <p>Intenta ajustar tus filtros o busca otro término.</p>
            </div>
          ) : (
            groupedTours.map((group) => (
              <div
                key={group.tipo_guiado}
                className={`ticket-group-card ${expandedGroups[group.tipo_guiado] ? "expanded" : ""}`}
              >
                <div
                  className="group-header"
                  onClick={() => toggleGroup(group.tipo_guiado)}
                >
                  <div className="group-info">
                    <FaRoute className="group-icon" />
                    <div>
                      <h3 className="group-title">{group.tipo_guiado}</h3>
                      <span className="group-count">
                        {group.count} tours disponibles
                      </span>
                    </div>
                  </div>
                  <div className="group-actions">
                    <button
                      className="action-btn-add"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickAddVariant(group.tipo_guiado);
                      }}
                    >
                      <FaPlus /> Variante
                    </button>
                    <div className="toggle-icon">
                      {expandedGroups[group.tipo_guiado] ? (
                        <FaChevronDown />
                      ) : (
                        <FaChevronRight />
                      )}
                    </div>
                  </div>
                </div>

                {expandedGroups[group.tipo_guiado] && (
                  <div className="group-content">
                    <table className="premium-table">
                      <thead>
                        <tr>
                          <th>Idioma</th>
                          <th>Capacidad</th>
                          <th>Tarifas</th>
                          <th>Observaciones</th>
                          <th className="text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.tours.map((tour) => (
                          <tr key={tour.id_tipotour} className="premium-row">
                            <td>
                              <span className="badge secondary">
                                {tour.idioma || "N/A"}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`badge ${tour.capacidad ? "success" : "secondary"}`}
                              >
                                {tour.capacidad
                                  ? `${tour.capacidad} pax`
                                  : "Sin límite"}
                              </span>
                            </td>
                            <td>
                              <TarifasCellRenderer
                                tarifas={tour.tarifasFiltradas}
                                serviceId={tour.id_tipotour}
                                serviceType="tour"
                                allTarifas={tour.tarifas}
                                onTarifasUpdated={loadTours}
                              />
                            </td>
                            <td>
                              <div
                                className="details-cell"
                                title={tour.observaciones}
                              >
                                <FaInfoCircle />
                                <span>
                                  {tour.observaciones
                                    ? tour.observaciones.substring(0, 40) +
                                      (tour.observaciones.length > 40
                                        ? "..."
                                        : "")
                                    : "Sin observaciones"}
                                </span>
                              </div>
                            </td>
                            <td>
                              <div className="premium-actions">
                                <button
                                  className="action-btn edit"
                                  onClick={() => handleEdit(tour)}
                                  title="Editar"
                                >
                                  <FaEdit />
                                </button>
                                <button
                                  className="action-btn delete"
                                  onClick={() => handleDeleteClick(tour)}
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
            ))
          )}
        </div>
      </div>

      {/* Modales */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={
          selectedTour?.isVariantCreation
            ? `Nueva variante: ${selectedTour.tipo_guiado}`
            : "Nuevo Tour"
        }
      >
        <TourForm
          tour={selectedTour}
          onSubmit={handleCreate}
          isSubmitting={isSubmitting}
        />
      </Modal>

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Editar Tour"
      >
        <TourForm
          tour={selectedTour}
          onSubmit={handleUpdate}
          isSubmitting={isSubmitting}
        />
      </Modal>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Eliminar Tour"
        size="small"
      >
        <DeleteConfirmation
          entityName="este tour"
          entityData={selectedTour}
          dependentEntities={dependentEntities}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
          isDeleting={isSubmitting}
        />
      </Modal>


    </div>
  );
};

export default ToursEndoseList;
