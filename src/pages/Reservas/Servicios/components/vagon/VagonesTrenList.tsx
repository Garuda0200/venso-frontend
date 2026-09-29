import React, { useState, useEffect, useMemo } from "react";
import {
  FaPlus,
  FaEdit,
  FaTrashAlt,
  FaSearch,
  FaTrain,
  FaFilter,
  FaChevronLeft,
  FaInfoCircle,
} from "react-icons/fa";
import {
  fetchVagonesByTrenWithTarifas,
  createVagon,
  updateVagon,
  deleteVagon,
  getVagonDependencies,
} from "../../services/api";
import { BADGE_COLORS } from "../../utils/constants";
import Modal from "../Modal";
import VagonForm from "./VagonForm";
import DeleteConfirmation from "../DeleteConfirmation";
import TarifasCellRenderer from "../tarifa/TarifasCellRenderer";
import useAuditInfo from "../../hooks/useAuditInfo";
import TarifaFilterPanel from "../common/TarifaFilterPanel";

const getVagonType = (vagon = {}) =>
  vagon.tipo_tren ||
  vagon.tipoTren ||
  vagon.tipo_vagon ||
  vagon.tipoVagon ||
  "";

const VagonesTrenList = ({ tren, onBack }) => {
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

  const [selectedVagon, setSelectedVagon] = useState(null);
  const [dependentEntities, setDependentEntities] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  // Cargar vagones
  useEffect(() => {
    loadVagones();
  }, [tren]);

  const loadVagones = async () => {
    if (!tren?.id_tren) return;
    try {
      setLoading(true);
      setError(null);

      // Cargamos directamente con tarifas
      const withTarifasData = await fetchVagonesByTrenWithTarifas(tren.id_tren);

      // Normalizar datos
      const normalizedData = withTarifasData.map((item) => ({
        ...(item.vagon || {}),
        tarifas: item.tarifas || [],
      }));

      setData(normalizedData);
      setLoading(false);
    } catch (err) {
      setError("Error al cargar los vagones: " + err.message);
      setLoading(false);
    }
  };

  // Filtrar y ordenar datos
  const filteredAndSortedData = useMemo(() => {
    // 1. Mapeamos los datos para incluir solo las tarifas filtradas si es necesario
    let processed = data.map((v) => ({
      ...v,
      tarifasFiltradas:
        tipoTarifaFilter.length > 0
          ? (v.tarifas || []).filter((t) =>
              tipoTarifaFilter.includes(t.tipo_tarifa),
            )
          : v.tarifas || [],
    }));

    // 2. Aplicar filtro de búsqueda sobre los datos procesados
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      processed = processed.filter(
        (v) =>
          (v.nombre_vagon || "").toLowerCase().includes(term) ||
          getVagonType(v).toLowerCase().includes(term) ||
          (v.descripcion || "").toLowerCase().includes(term) ||
          (v.estado || "").toLowerCase().includes(term),
      );
    }

    // 3. Si hay filtro de tarifas activo, solo mostramos los que tienen al menos una tarifa que coincida
    if (tipoTarifaFilter.length > 0) {
      processed = processed.filter((v) => v.tarifasFiltradas.length > 0);
    }

    // 4. Ordenar por nombre
    return processed.sort((a, b) => {
      const left = a.nombre_vagon || getVagonType(a) || "";
      const right = b.nombre_vagon || getVagonType(b) || "";
      return left.localeCompare(right);
    });
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
      await createVagon({
        ...formData,
        id_tren: tren.id_tren,
        created_by: userId,
      });
      setShowCreateModal(false);
      await loadVagones();
    } catch (error) {
      setError("Error al crear vagón: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (vagon) => {
    setSelectedVagon(vagon);
    setShowEditModal(true);
  };

  const handleUpdate = async (formData) => {
    if (!formData) {
      setShowEditModal(false);
      return;
    }
    try {
      setIsSubmitting(true);
      await updateVagon(selectedVagon.id_vagon, {
        ...formData,
        updated_by: userId,
      });
      setShowEditModal(false);
      await loadVagones();
    } catch (error) {
      setError("Error al actualizar vagón: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = async (vagon) => {
    setSelectedVagon(vagon);
    setIsSubmitting(true);
    try {
      const dependencies = await getVagonDependencies(vagon.id_vagon);
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
      await deleteVagon(selectedVagon.id_vagon);
      setShowDeleteModal(false);
      await loadVagones();
    } catch (error) {
      setError("Error al eliminar vagón: " + error.message);
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
        <p>Cargando vagones...</p>
      </div>
    );
  }

  return (
    <div className="entity-view-container premium-design">
      {/* Botón Volver */}
      <div className="back-navigation">
        <button onClick={onBack} className="back-link-btn">
          <FaChevronLeft /> <span>Volver a Trenes</span>
        </button>
      </div>

      {/* Header Premium */}
      <div className="header-dashboard">
        <div className="header-main-info">
          <div className="header-title-group">
            <div className="title-icon-wrapper">
              <FaTrain className="title-icon-main" />
            </div>
            <div className="title-text-group">
              <h2 className="main-title">Vagones / Categorías</h2>
              <p className="sub-title">
                Tren: {tren.nombre_tren} ({tren.ruta})
              </p>
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
              setSelectedVagon(null);
              setShowCreateModal(true);
            }}
          >
            <FaPlus /> <span>Nuevo Vagón</span>
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
              placeholder="Buscar por nombre, descripción o estado..."
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
            <FaTrain className="empty-icon" />
            <h3>No se encontraron vagones</h3>
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
                  <th>Vagón / Clase</th>
                  <th>Capacidad</th>
                  <th>Tarifas</th>
                  <th>Descripción</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedData.map((vagon) => (
                  <tr key={vagon.id_vagon} className="premium-row">
                    <td>
                      <div className="entity-cell">
                        <div className="entity-icon-box">
                          <FaTrain />
                        </div>
                        <div className="entity-info">
                          <span className="entity-name">
                            {vagon.nombre_vagon ||
                              getVagonType(vagon) ||
                              "Vagón sin nombre"}
                          </span>
                          <span className="entity-sub">
                            Tipo: {getVagonType(vagon) || "Sin especificar"}
                          </span>
                          <span className="entity-status">
                            {renderEstadoBadge(vagon.estado)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="duration-badge">
                        <span>{vagon.capacidad || "0"} pers.</span>
                      </div>
                    </td>
                    <td>
                      <TarifasCellRenderer
                        tarifas={vagon.tarifasFiltradas}
                        serviceId={vagon.id_vagon}
                        serviceType="vagones"
                        allTarifas={vagon.tarifas}
                        onTarifasUpdated={loadVagones}
                      />
                    </td>
                    <td>
                      <div className="details-cell" title={vagon.descripcion}>
                        <FaInfoCircle />
                        <span>
                          {vagon.descripcion
                            ? vagon.descripcion.substring(0, 50) +
                              (vagon.descripcion.length > 50 ? "..." : "")
                            : "Sin descripción"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="premium-actions">
                        <button
                          className="action-btn edit"
                          onClick={() => handleEdit(vagon)}
                          title="Editar"
                        >
                          <FaEdit />
                        </button>
                        <button
                          className="action-btn delete"
                          onClick={() => handleDeleteClick(vagon)}
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
        title="Nuevo Vagón"
      >
        <VagonForm onSubmit={handleCreate} isSubmitting={isSubmitting} />
      </Modal>

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Editar Vagón"
      >
        <VagonForm
          vagon={selectedVagon}
          onSubmit={handleUpdate}
          isSubmitting={isSubmitting}
        />
      </Modal>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Eliminar Vagón"
        size="small"
      >
        <DeleteConfirmation
          entityName="este vagón"
          entityData={selectedVagon}
          dependentEntities={dependentEntities}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
          isDeleting={isSubmitting}
        />
      </Modal>


    </div>
  );
};

export default VagonesTrenList;
