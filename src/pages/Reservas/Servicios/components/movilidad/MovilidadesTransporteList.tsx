import React, { useState, useEffect, useMemo } from "react";
import {
  FaPlus,
  FaEdit,
  FaTrashAlt,
  FaSearch,
  FaSortUp,
  FaSortDown,
  FaSort,
  FaCar,
  FaCarSide,
  FaBus,
  FaRoute,
  FaUsers,
  FaIdCard,
  FaStar,
  FaFilter,
  FaChevronLeft,
  FaChevronDown,
  FaChevronRight,
  FaLayerGroup,
  FaListUl,
} from "react-icons/fa";
import {
  fetchMovilidadesByTransporteWithTarifas,
  createMovilidad,
  updateMovilidad,
  deleteMovilidad,
  getMovilidadDependencies,
} from "../../services/api";
import { BADGE_COLORS } from "../../utils/constants";
import Modal from "../Modal";
import MovilidadForm from "./MovilidadForm";
import DeleteConfirmation from "../DeleteConfirmation";
import TarifasCellRenderer from "../tarifa/TarifasCellRenderer";
import useAuditInfo from "../../hooks/useAuditInfo";
import TarifaFilterPanel from "../common/TarifaFilterPanel";
import ValoracionModal from "../common/ValoracionModal";
import "./MovilidadesTransporteList.scss";

const NO_ROUTE_KEY = "__sin_ruta__";

const normalizeRoute = (route) => (route || "").trim();

const getRouteKey = (route) => normalizeRoute(route) || NO_ROUTE_KEY;

const getRouteLabel = (routeKey) =>
  routeKey === NO_ROUTE_KEY ? "Sin ruta definida" : routeKey;

const sanitizeMovilidadPayload = (payload = {}) => {
  const {
    tarifas,
    tarifasFiltradas,
    isVariantCreation,
    existingRouteVariants,
    ...cleanPayload
  } = payload;

  return cleanPayload;
};

const MovilidadesTransporteList = ({ transporte, onBack }) => {
  // Estado único para datos normalizados (entidad + tarifas)
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [tipoTarifaFilter, setTipoTarifaFilter] = useState([]);
  const [showFilters, setShowFilters] = useState(true);
  const [viewMode, setViewMode] = useState("grouped");
  const [expandedGroups, setExpandedGroups] = useState({});
  const [sortConfig, setSortConfig] = useState({
    key: "calificacion",
    direction: "descending",
  });

  // Estados para modales
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [selectedMovilidad, setSelectedMovilidad] = useState(null);
  const [dependentEntities, setDependentEntities] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showValoracionModal, setShowValoracionModal] = useState(false);
  const [selectedEntityForRating, setSelectedEntityForRating] = useState(null);

  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  // Memoize create data to avoid inline object re-creation
  const createMovilidadData = useMemo(
    () => ({ id_transporte: transporte.id_transporte }),
    [transporte.id_transporte],
  );

  // Cargar movilidades
  useEffect(() => {
    loadMovilidades();
  }, [transporte]);

  const loadMovilidades = async () => {
    if (!transporte || !transporte.id_transporte) {
      console.error("No se encontró el ID del transporte");
      setError(
        "No se pudo cargar las movilidades porque no se proporcionó un transporte válido",
      );
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Cargamos directamente con tarifas para tener todo en un solo objeto
      const withTarifasData = await fetchMovilidadesByTransporteWithTarifas(
        transporte.id_transporte,
      );

      // Normalizar datos: { movilidad: {...}, tarifas: [...] } -> { ...movilidad, tarifas: [...] }
      const normalizedData = withTarifasData.map((item) => ({
        ...(item.movilidad || {}),
        tarifas: item.tarifas || [],
      }));

      setData(normalizedData);
      const routeKeys = [
        ...new Set(
          normalizedData.map((movilidad) => getRouteKey(movilidad.ruta)),
        ),
      ];
      setExpandedGroups((prev) =>
        routeKeys.reduce((acc, routeKey) => {
          acc[routeKey] = prev[routeKey] ?? true;
          return acc;
        }, {}),
      );
      setLoading(false);
    } catch (err) {
      setError("Error al cargar las movilidades: " + err.message);
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

  // Filtrar y ordenar datos
  const filteredAndSortedData = useMemo(() => {
    // 1. Mapeamos los datos para incluir solo las tarifas filtradas si es necesario
    let processed = data.map((m) => ({
      ...m,
      tarifasFiltradas:
        tipoTarifaFilter.length > 0
          ? (m.tarifas || []).filter((t) =>
              tipoTarifaFilter.includes(t.tipo_tarifa),
            )
          : m.tarifas || [],
    }));

    // 2. Aplicar filtro de búsqueda sobre los datos procesados
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      processed = processed.filter(
        (m) =>
          (m.tipo_auto || "").toLowerCase().includes(lowerSearchTerm) ||
          (m.ruta || "").toLowerCase().includes(lowerSearchTerm) ||
          (m.nro_placa || "").toLowerCase().includes(lowerSearchTerm),
      );
    }

    // 3. Si hay filtro de tarifas activo, solo mostramos los que tienen al menos una tarifa que coincida
    if (tipoTarifaFilter.length > 0) {
      processed = processed.filter((m) => m.tarifasFiltradas.length > 0);
    }

    // 4. Aplicar ordenamiento
    if (sortConfig.key) {
      processed.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        if (sortConfig.key === "calificacion") {
          aValue = parseFloat(a.calificacion?.valoracion) || 0;
          bValue = parseFloat(b.calificacion?.valoracion) || 0;
        } else if (sortConfig.key === "nro_pasajeros") {
          aValue = parseInt(aValue) || 0;
          bValue = parseInt(bValue) || 0;
        } else {
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
      // Orden por defecto: Calificación desc, luego tipo_auto
      processed.sort((a, b) => {
        const califA = parseFloat(a.calificacion?.valoracion) || -1;
        const califB = parseFloat(b.calificacion?.valoracion) || -1;
        if (califB !== califA) return califB - califA;
        return (a.tipo_auto || "").localeCompare(b.tipo_auto || "");
      });
    }

    return processed;
  }, [data, searchTerm, tipoTarifaFilter, sortConfig]);

  const rutasDisponibles = useMemo(() => {
    return [
      ...new Set(data.map((m) => normalizeRoute(m.ruta)).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const groupedMovilidades = useMemo(() => {
    const groups = {};

    filteredAndSortedData.forEach((movilidad) => {
      const routeKey = getRouteKey(movilidad.ruta);
      if (!groups[routeKey]) groups[routeKey] = [];
      groups[routeKey].push(movilidad);
    });

    return Object.entries(groups)
      .map(([routeKey, movilidades]) => {
        const capacities = movilidades.map(
          (m) => parseInt(m.nro_pasajeros, 10) || 0,
        );
        const ratings = movilidades.map(
          (m) => parseFloat(m.calificacion?.valoracion) || 0,
        );

        return {
          routeKey,
          label: getRouteLabel(routeKey),
          movilidades,
          count: movilidades.length,
          tarifaCount: movilidades.reduce(
            (total, m) => total + (m.tarifasFiltradas?.length || 0),
            0,
          ),
          maxCapacity: capacities.length ? Math.max(...capacities) : 0,
          bestRating: ratings.length ? Math.max(...ratings) : 0,
        };
      })
      .sort((a, b) => {
        if (a.routeKey === NO_ROUTE_KEY) return 1;
        if (b.routeKey === NO_ROUTE_KEY) return -1;
        return a.label.localeCompare(b.label);
      });
  }, [filteredAndSortedData]);

  const allGroupsExpanded =
    groupedMovilidades.length > 0 &&
    groupedMovilidades.every(
      (group) => expandedGroups[group.routeKey] !== false,
    );

  // Cálculo de total de tarifas filtradas para la barra de acciones masivas

  const hasActiveFilters = () => {
    return searchTerm !== "" || tipoTarifaFilter.length > 0;
  };

  // Handlers para CRUD
  const handleCreate = async (formData) => {
    try {
      setIsSubmitting(true);
      if (!formData) {
        setShowCreateModal(false);
        setIsSubmitting(false);
        return;
      }

      const dataToSend = {
        ...sanitizeMovilidadPayload(formData),
        id_transporte: transporte.id_transporte,
        created_by: userId,
      };

      await createMovilidad(dataToSend);
      setShowCreateModal(false);
      await loadMovilidades();
    } catch (error) {
      setError("Error al crear movilidad: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (movilidad) => {
    setSelectedMovilidad(movilidad);
    setShowEditModal(true);
  };

  const handleUpdate = async (formData) => {
    try {
      setIsSubmitting(true);
      if (!formData) {
        setShowEditModal(false);
        setIsSubmitting(false);
        return;
      }

      const dataToSend = {
        ...sanitizeMovilidadPayload(formData),
        id_transporte: transporte.id_transporte,
        updated_by: userId,
      };

      await updateMovilidad(selectedMovilidad.id_movilidad, dataToSend);
      setShowEditModal(false);
      await loadMovilidades();
    } catch (error) {
      setError("Error al actualizar movilidad: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = async (movilidad) => {
    setSelectedMovilidad(movilidad);
    setIsSubmitting(true);
    try {
      const dependencies = await getMovilidadDependencies(
        movilidad.id_movilidad,
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
      await deleteMovilidad(selectedMovilidad.id_movilidad);
      setShowDeleteModal(false);
      await loadMovilidades();
    } catch (error) {
      setError("Error al eliminar movilidad: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenValoracion = (movilidad) => {
    setSelectedEntityForRating(movilidad);
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
      await updateMovilidad(selectedEntityForRating.id_movilidad, {
        calificacion: calificacionObj,
        updated_by: userId,
      });
      setShowValoracionModal(false);
      await loadMovilidades();
    } catch (error) {
      setError("Error al guardar valoración: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleNewMovilidad = () => {
    setSelectedMovilidad(null);
    setShowCreateModal(true);
  };

  const handleQuickAddVariant = (routeKey) => {
    setSelectedMovilidad({
      ...createMovilidadData,
      ruta: routeKey === NO_ROUTE_KEY ? "" : routeKey,
      estado: "disponible",
      isVariantCreation: true,
    });
    setShowCreateModal(true);
  };

  const toggleGroup = (routeKey) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [routeKey]: !(prev[routeKey] !== false),
    }));
  };

  const toggleAllGroups = (expand) => {
    const nextState = {};
    groupedMovilidades.forEach((group) => {
      nextState[group.routeKey] = expand;
    });
    setExpandedGroups(nextState);
  };

  // Render helpers
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

  const getVehicleIcon = (tipoAuto) => {
    const tipo = (tipoAuto || "").toLowerCase();
    if (tipo.includes("bus") || tipo.includes("micro")) return <FaBus />;
    if (tipo.includes("van") || tipo.includes("minivan")) return <FaCarSide />;
    return <FaCar />;
  };

  const renderEstadoBadge = (estado) => {
    const badgeClass = `badge ${BADGE_COLORS[(estado || "").toLowerCase()] || "secondary"}`;
    return <span className={badgeClass}>{estado}</span>;
  };

  const renderMovilidadRow = (movilidad, { showRouteColumn = true } = {}) => (
    <tr key={movilidad.id_movilidad} className="premium-row">
      <td>
        <div className="vehicle-cell">
          <div className="vehicle-icon-box">
            {getVehicleIcon(movilidad.tipo_auto)}
          </div>
          <div className="vehicle-info">
            <span className="vehicle-name">{movilidad.tipo_auto}</span>
            <span className="vehicle-status">
              {renderEstadoBadge(movilidad.estado)}
            </span>
          </div>
        </div>
      </td>
      <td className="text-center">
        <div className="capacity-badge">
          <FaUsers /> <span>{movilidad.nro_pasajeros} pax</span>
        </div>
      </td>
      <td>
        <div className="placa-badge">
          <FaIdCard /> <span>{movilidad.nro_placa || "N/A"}</span>
        </div>
      </td>
      {showRouteColumn && (
        <td>
          <div className="route-cell">
            <FaRoute /> <span>{movilidad.ruta || "No definida"}</span>
          </div>
        </td>
      )}
      <td>
        <TarifasCellRenderer
          tarifas={movilidad.tarifasFiltradas}
          serviceId={movilidad.id_movilidad}
          serviceType="movilidad"
          allTarifas={movilidad.tarifas}
          onTarifasUpdated={loadMovilidades}
        />
      </td>
      <td>{renderValoracion(movilidad.calificacion)}</td>
      <td>
        <div className="premium-actions">
          <button
            className="action-btn rate"
            onClick={() => handleOpenValoracion(movilidad)}
            title="Calificar"
          >
            <FaStar />
          </button>
          <button
            className="action-btn edit"
            onClick={() => handleEdit(movilidad)}
            title="Editar"
          >
            <FaEdit />
          </button>
          <button
            className="action-btn delete"
            onClick={() => handleDeleteClick(movilidad)}
            title="Eliminar"
          >
            <FaTrashAlt />
          </button>
        </div>
      </td>
    </tr>
  );

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Cargando movilidades...</p>
      </div>
    );
  }

  return (
    <div className="entity-view-container premium-design">
      {/* Botón Volver con estilo mejorado */}
      <div className="back-navigation">
        <button onClick={onBack} className="back-link-btn">
          <FaChevronLeft /> <span>Volver a Transportes</span>
        </button>
      </div>

      {/* Header Premium */}
      <div className="header-dashboard">
        <div className="header-main-info">
          <div className="header-title-group">
            <div className="title-icon-wrapper">
              <FaCar className="title-icon-main" />
            </div>
            <div className="title-text-group">
              <h2 className="main-title">Movilidades</h2>
              <p className="sub-title">{transporte.nombre_transporte}</p>
            </div>
          </div>
          <div className="header-badges">
            <span className="info-badge">
              <FaRoute className="badge-icon" />
              Zona: {transporte.zona}
            </span>
          </div>
        </div>

        <div className="header-actions-group">
          <button
            className="premium-btn secondary"
            onClick={() =>
              setViewMode(viewMode === "grouped" ? "list" : "grouped")
            }
          >
            {viewMode === "grouped" ? <FaListUl /> : <FaLayerGroup />}
            <span>
              {viewMode === "grouped" ? "Vista Lista" : "Vista Rutas"}
            </span>
          </button>
          <button
            className={`premium-btn secondary ${showFilters ? "active" : ""}`}
            onClick={() => setShowFilters(true)}
          >
            <FaFilter /> <span>Filtros</span>
            {hasActiveFilters() && <span className="filter-dot"></span>}
          </button>
          <button className="premium-btn primary" onClick={handleNewMovilidad}>
            <FaPlus /> <span>Nueva Movilidad</span>
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
              placeholder="Buscar por tipo, placa o ruta..."
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

      {/* Barra de Acciones Masivas */}


      {/* Contenido Principal */}
      {viewMode === "grouped" ? (
        <div className="tickets-view-container movilidades-routes-view">
          <div className="grouped-controls">
            <button
              className="premium-btn secondary-outline sm"
              onClick={() => toggleAllGroups(!allGroupsExpanded)}
            >
              {allGroupsExpanded ? "Contraer Todas" : "Expandir Todas"}
            </button>
          </div>

          {filteredAndSortedData.length === 0 ? (
            <div className="content-card">
              <div className="empty-state-modern">
                <FaCar className="empty-icon" />
                <h3>No se encontraron resultados</h3>
                <p>Intenta ajustar tus filtros o busca otro termino.</p>
                <button
                  className="premium-btn secondary-outline"
                  onClick={() => {
                    setSearchTerm("");
                    setTipoTarifaFilter([]);
                  }}
                >
                  Limpiar Filtros
                </button>
              </div>
            </div>
          ) : (
            <div className="tickets-grouped-view">
              {groupedMovilidades.map((group) => {
                const isExpanded = expandedGroups[group.routeKey] !== false;

                return (
                  <div
                    key={group.routeKey}
                    className={`ticket-group-card movilidad-route-card ${isExpanded ? "expanded" : ""}`}
                  >
                    <div
                      className="group-header"
                      onClick={() => toggleGroup(group.routeKey)}
                    >
                      <div className="group-info">
                        <FaRoute className="group-icon" />
                        <div>
                          <h3 className="group-title">{group.label}</h3>
                          <span className="group-count">
                            {group.count} variantes disponibles -{" "}
                            {group.tarifaCount} tarifas
                          </span>
                        </div>
                      </div>

                      <div className="route-metrics">
                        <span className="route-metric">
                          <FaUsers />{" "}
                          {group.maxCapacity
                            ? `hasta ${group.maxCapacity} pax`
                            : "sin capacidad"}
                        </span>
                        <span className="route-metric">
                          <FaStar />{" "}
                          {group.bestRating
                            ? `${group.bestRating}/10`
                            : "sin valorar"}
                        </span>
                      </div>

                      <div className="group-actions">
                        <button
                          className="action-btn-add"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickAddVariant(group.routeKey);
                          }}
                        >
                          <FaPlus /> Variante
                        </button>
                        <div className="toggle-icon">
                          {isExpanded ? <FaChevronDown /> : <FaChevronRight />}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="group-content">
                        <table className="premium-table movilidad-variants-table">
                          <thead>
                            <tr>
                              <th>Tipo de Vehiculo</th>
                              <th className="text-center">Capacidad</th>
                              <th>Identificacion</th>
                              <th>Tarifas Disponibles</th>
                              <th>Calificacion</th>
                              <th className="text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.movilidades.map((movilidad) =>
                              renderMovilidadRow(movilidad, {
                                showRouteColumn: false,
                              }),
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="content-card">
          {filteredAndSortedData.length === 0 ? (
            <div className="empty-state-modern">
              <FaCar className="empty-icon" />
              <h3>No se encontraron resultados</h3>
              <p>Intenta ajustar tus filtros o busca otro término.</p>
              <button
                className="premium-btn secondary-outline"
                onClick={() => {
                  setSearchTerm("");
                  setTipoTarifaFilter([]);
                }}
              >
                Limpiar Filtros
              </button>
            </div>
          ) : (
            <div className="table-responsive-modern">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th
                      onClick={() => requestSort("tipo_auto")}
                      className="sortable"
                    >
                      Tipo de Vehículo {getSortIcon("tipo_auto")}
                    </th>
                    <th
                      onClick={() => requestSort("nro_pasajeros")}
                      className="sortable text-center"
                    >
                      Capacidad {getSortIcon("nro_pasajeros")}
                    </th>
                    <th
                      onClick={() => requestSort("nro_placa")}
                      className="sortable"
                    >
                      Identificación {getSortIcon("nro_placa")}
                    </th>
                    <th
                      onClick={() => requestSort("ruta")}
                      className="sortable"
                    >
                      Ruta / Trayecto {getSortIcon("ruta")}
                    </th>
                    <th>Tarifas Disponibles</th>
                    <th>Calificación</th>
                    <th className="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedData.map((movilidad) =>
                    renderMovilidadRow(movilidad),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modales - Manteniendo la lógica pero con títulos coherentes */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={
          selectedMovilidad?.isVariantCreation
            ? `Nueva Variante: ${getRouteLabel(getRouteKey(selectedMovilidad.ruta))}`
            : "Nueva Movilidad"
        }
      >
        <MovilidadForm
          movilidad={
            selectedMovilidad?.isVariantCreation
              ? selectedMovilidad
              : createMovilidadData
          }
          onSubmit={handleCreate}
          isSubmitting={isSubmitting}
          availableRoutes={rutasDisponibles}
          existingMovilidades={data}
        />
      </Modal>

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Editar Movilidad"
      >
        <MovilidadForm
          movilidad={selectedMovilidad}
          onSubmit={handleUpdate}
          isSubmitting={isSubmitting}
          availableRoutes={rutasDisponibles}
          existingMovilidades={data}
        />
      </Modal>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Eliminar Movilidad"
        size="small"
      >
        <DeleteConfirmation
          entityName="esta movilidad"
          entityData={selectedMovilidad}
          dependentEntities={dependentEntities}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
          isDeleting={isSubmitting}
        />
      </Modal>


      {showValoracionModal && (
        <ValoracionModal
          show={showValoracionModal}
          onClose={() => setShowValoracionModal(false)}
          entity={selectedEntityForRating}
          entityType="movilidad"
          onSave={handleSaveValoracion}
        />
      )}

    </div>
  );
};

export default MovilidadesTransporteList;
