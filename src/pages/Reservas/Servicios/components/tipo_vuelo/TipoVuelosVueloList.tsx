import React, { useState, useEffect, useMemo } from "react";
import {
  FaPlus,
  FaEdit,
  FaTrashAlt,
  FaSearch,
  FaPlane,
  FaFilter,
  FaChevronLeft,
  FaInfoCircle,
  FaSuitcase,
} from "react-icons/fa";
import {
  fetchTipoVueloByVueloWithTarifas,
  createTipoVuelo,
  updateTipoVuelo,
  deleteTipoVuelo,
  getTipoVueloDependencies,
} from "../../services/api";
import { BADGE_COLORS } from "../../utils/constants";
import Modal from "../Modal";
import TipoVueloForm from "./TipoVueloForm";
import DeleteConfirmation from "../DeleteConfirmation";
import TarifasCellRenderer from "../tarifa/TarifasCellRenderer";
import useAuditInfo from "../../hooks/useAuditInfo";
import TarifaFilterPanel from "../common/TarifaFilterPanel";

const TipoVuelosVueloList = ({ vuelo, onBack }) => {
  // Estado único para datos normalizados
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [tipoTarifaFilter, setTipoTarifaFilter] = useState([]);
  const [showFilters, setShowFilters] = useState(true);

  // Estados para modales
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [selectedTipoVuelo, setSelectedTipoVuelo] = useState(null);
  const [dependentEntities, setDependentEntities] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  // Cargar tipos de vuelo
  useEffect(() => {
    loadTiposVuelo();
  }, [vuelo]);

  const loadTiposVuelo = async () => {
    if (!vuelo?.id_vuelo) return;
    try {
      setLoading(true);
      setError(null);

      // Cargamos directamente con tarifas
      const withTarifasData = await fetchTipoVueloByVueloWithTarifas(
        vuelo.id_vuelo,
      );

      // Normalizar datos
      const normalizedData = withTarifasData.map((item) => ({
        ...(item.tipo_vuelo || {}),
        tarifas: item.tarifas || [],
      }));

      setData(normalizedData);
      setLoading(false);
    } catch (err) {
      setError("Error al cargar los tipos de vuelo: " + err.message);
      setLoading(false);
    }
  };

  // Filtrar y ordenar datos
  const filteredAndSortedData = useMemo(() => {
    // 1. Mapeamos los datos para incluir solo las tarifas filtradas si es necesario
    let processed = data.map((tv) => ({
      ...tv,
      tarifasFiltradas:
        tipoTarifaFilter.length > 0
          ? (tv.tarifas || []).filter((t) =>
              tipoTarifaFilter.includes(t.tipo_tarifa),
            )
          : tv.tarifas || [],
    }));

    // 2. Aplicar filtro de búsqueda sobre los datos procesados
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      processed = processed.filter(
        (tv) =>
          (tv.tipovuelo || "").toLowerCase().includes(term) ||
          (tv.lugar_ida || "").toLowerCase().includes(term) ||
          (tv.lugar_vuelta || "").toLowerCase().includes(term) ||
          (tv.equipaje || "").toLowerCase().includes(term) ||
          (tv.detalles || "").toLowerCase().includes(term) ||
          (tv.estado || "").toLowerCase().includes(term),
      );
    }

    // 3. Si hay filtro de tarifas activo, solo mostramos los que tienen al menos una tarifa que coincida
    if (tipoTarifaFilter.length > 0) {
      processed = processed.filter((tv) => tv.tarifasFiltradas.length > 0);
    }

    // 4. Ordenar por nombre (tipovuelo)
    return processed.sort((a, b) =>
      (a.tipovuelo || "").localeCompare(b.tipovuelo || ""),
    );
  }, [data, searchTerm, tipoTarifaFilter]);

  // Cálculo de total de tarifas filtradas para la barra de acciones masivas

  const hasActiveFilters = () => {
    return searchTerm !== "" || tipoTarifaFilter.length > 0;
  };

  // Handlers para CRUD
  const handleCreate = async (formData) => {
    if (!formData) {
      setShowCreateModal(false);
      return;
    }
    try {
      setIsSubmitting(true);
      await createTipoVuelo({
        ...formData,
        id_vuelo: vuelo.id_vuelo,
        created_by: userId,
      });
      setShowCreateModal(false);
      await loadTiposVuelo();
    } catch (error) {
      setError("Error al crear tipo de vuelo: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (tipoVuelo) => {
    setSelectedTipoVuelo(tipoVuelo);
    setShowEditModal(true);
  };

  const handleUpdate = async (formData) => {
    if (!formData) {
      setShowEditModal(false);
      return;
    }
    try {
      setIsSubmitting(true);
      await updateTipoVuelo(selectedTipoVuelo.idtipo_vuelo, {
        ...formData,
        updated_by: userId,
      });
      setShowEditModal(false);
      await loadTiposVuelo();
    } catch (error) {
      setError("Error al actualizar tipo de vuelo: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = async (tipoVuelo) => {
    setSelectedTipoVuelo(tipoVuelo);
    setIsSubmitting(true);
    try {
      const dependencies = await getTipoVueloDependencies(
        tipoVuelo.idtipo_vuelo,
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
      await deleteTipoVuelo(selectedTipoVuelo.idtipo_vuelo);
      setShowDeleteModal(false);
      await loadTiposVuelo();
    } catch (error) {
      setError("Error al eliminar tipo de vuelo: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
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
        <p>Cargando tipos de vuelo...</p>
      </div>
    );
  }

  return (
    <div className="entity-view-container premium-design">
      {/* Botón Volver */}
      <div className="back-navigation">
        <button onClick={onBack} className="back-link-btn">
          <FaChevronLeft /> <span>Volver a Vuelos</span>
        </button>
      </div>

      {/* Header Premium */}
      <div className="header-dashboard">
        <div className="header-main-info">
          <div className="header-title-group">
            <div className="title-icon-wrapper">
              <FaPlane className="title-icon-main" />
            </div>
            <div className="title-text-group">
              <h2 className="main-title">Configuración de Vuelo</h2>
              <p className="sub-title">Aerolínea: {vuelo.nombre_vuelo}</p>
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
              setSelectedTipoVuelo(null);
              setShowCreateModal(true);
            }}
          >
            <FaPlus /> <span>Nuevo Tipo</span>
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
              placeholder="Buscar por tipo, ruta, equipaje o detalles..."
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


      {/* Contenido Principal (Tabla) */}
      <div className="content-card">
        {filteredAndSortedData.length === 0 ? (
          <div className="empty-state-modern">
            <FaPlane className="empty-icon" />
            <h3>No se encontraron tipos de vuelo</h3>
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
                  <th>Tipo de Vuelo</th>
                  <th>Ruta</th>
                  <th>Tarifas</th>
                  <th>Detalles</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedData.map((tipoVuelo) => (
                  <tr key={tipoVuelo.idtipo_vuelo} className="premium-row">
                    <td>
                      <div className="entity-cell">
                        <div className="entity-icon-box">
                          <FaPlane />
                        </div>
                        <div className="entity-info">
                          <span className="entity-name">
                            {tipoVuelo.tipovuelo}
                          </span>
                          <span className="entity-status">
                            {renderEstadoBadge(tipoVuelo.estado)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="location-cell">
                        <span>
                          {tipoVuelo.lugar_ida} → {tipoVuelo.lugar_vuelta}
                        </span>
                      </div>
                    </td>
                    <td>
                      <TarifasCellRenderer
                        tarifas={tipoVuelo.tarifasFiltradas}
                        serviceId={tipoVuelo.idtipo_vuelo}
                        serviceType="tipo_vuelo"
                        allTarifas={tipoVuelo.tarifas}
                        onTarifasUpdated={loadTiposVuelo}
                      />
                    </td>
                    <td>
                      <div className="details-cell">
                        {tipoVuelo.equipaje && (
                          <div
                            className="baggage-info"
                            title={`Equipaje: ${tipoVuelo.equipaje}`}
                          >
                            <FaSuitcase /> <span>{tipoVuelo.equipaje}</span>
                          </div>
                        )}
                        <div
                          className="additional-details"
                          title={tipoVuelo.detalles}
                        >
                          <FaInfoCircle />
                          <span>
                            {tipoVuelo.detalles
                              ? tipoVuelo.detalles.substring(0, 40) +
                                (tipoVuelo.detalles.length > 40 ? "..." : "")
                              : "Sin detalles"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="premium-actions">
                        <button
                          className="action-btn edit"
                          onClick={() => handleEdit(tipoVuelo)}
                          title="Editar"
                        >
                          <FaEdit />
                        </button>
                        <button
                          className="action-btn delete"
                          onClick={() => handleDeleteClick(tipoVuelo)}
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
        title="Nuevo Tipo de Vuelo"
      >
        <TipoVueloForm onSubmit={handleCreate} isSubmitting={isSubmitting} />
      </Modal>

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Editar Tipo de Vuelo"
      >
        <TipoVueloForm
          tipoVuelo={selectedTipoVuelo}
          onSubmit={handleUpdate}
          isSubmitting={isSubmitting}
        />
      </Modal>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Eliminar Tipo de Vuelo"
        size="small"
      >
        <DeleteConfirmation
          entityName="este tipo de vuelo"
          entityData={selectedTipoVuelo}
          dependentEntities={dependentEntities}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
          isDeleting={isSubmitting}
        />
      </Modal>


    </div>
  );
};

export default TipoVuelosVueloList;
