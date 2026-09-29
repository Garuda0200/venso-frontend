import React, { useState, useEffect, useMemo } from "react";
import {
  FaPlus,
  FaEdit,
  FaTrashAlt,
  FaSearch,
  FaFilter,
  FaConciergeBell,
  FaInfoCircle,
} from "react-icons/fa";
import {
  fetchServiciosExtraWithTarifas,
  createServicioExtra,
  updateServicioExtra,
  deleteServicioExtra,
  getServicioExtraDependencies,
  fetchProtectedServiceUsage,
} from "../../services/api";
import Modal from "../Modal";
import ServicioExtraForm from "./ServicioExtraForm";
import DeleteConfirmation from "../DeleteConfirmation";
import TarifasCellRenderer from "../tarifa/TarifasCellRenderer";
import useAuditInfo from "../../hooks/useAuditInfo";
import TarifaFilterPanel from "../common/TarifaFilterPanel";
import { BADGE_COLORS } from "../../utils/constants";
import {
  annotateProtectedRecords,
  buildProtectedQueryItems,
  getProtectedDeleteTitle,
} from "../../utils/serviceProtection";

const ServiciosExtraManager = () => {
  // Estado único para datos normalizados (entidad + tarifas)
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

  const [selectedServicioExtra, setSelectedServicioExtra] = useState(null);
  const [dependentEntities, setDependentEntities] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  // Cargar servicios extras
  useEffect(() => {
    loadServiciosExtra();
  }, []);

  const loadServiciosExtra = async () => {
    try {
      setLoading(true);
      setError(null);

      // Cargamos directamente con tarifas
      const withTarifasData = await fetchServiciosExtraWithTarifas();

      // Normalizar datos
      const normalizedData = withTarifasData.map((item) => ({
        ...(item.servicio_extra || {}),
        tarifas: item.tarifas || [],
      }));

      const allTarifas = normalizedData.flatMap(
        (servicioExtra) => servicioExtra.tarifas || [],
      );
      const [protectedUsage, protectedTarifaUsage] = await Promise.all([
        fetchProtectedServiceUsage(
          buildProtectedQueryItems(
            normalizedData,
            "servicio_extra",
            (servicioExtra) => servicioExtra.id,
          ),
        ),
        fetchProtectedServiceUsage(
          buildProtectedQueryItems(
            allTarifas,
            "tarifa",
            (tarifa) => tarifa.id_tarifa,
          ),
        ),
      ]);
      setData(
        annotateProtectedRecords(
          normalizedData,
          protectedUsage,
          "servicio_extra",
          (servicioExtra) => servicioExtra.id,
        ).map((servicioExtra) => ({
          ...servicioExtra,
          tarifas: annotateProtectedRecords(
            servicioExtra.tarifas || [],
            protectedTarifaUsage,
            "tarifa",
            (tarifa) => tarifa.id_tarifa,
          ),
        })),
      );
      setLoading(false);
    } catch (err) {
      setError("Error al cargar los servicios extras: " + err.message);
      setLoading(false);
    }
  };

  // Filtrar y ordenar datos
  const filteredAndSortedData = useMemo(() => {
    // 1. Mapeamos los datos para incluir solo las tarifas filtradas si es necesario
    let processed = data.map((se) => ({
      ...se,
      tarifasFiltradas:
        tipoTarifaFilter.length > 0
          ? (se.tarifas || []).filter((t) =>
              tipoTarifaFilter.includes(t.tipo_tarifa),
            )
          : se.tarifas || [],
    }));

    // 2. Aplicar filtro de búsqueda sobre los datos procesados
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      processed = processed.filter(
        (se) =>
          (se.nombre || "").toLowerCase().includes(term) ||
          (se.descripcion || "").toLowerCase().includes(term) ||
          (se.estado || "").toLowerCase().includes(term),
      );
    }

    // 3. Si hay filtro de tarifas activo, solo mostramos los que tienen al menos una tarifa que coincida
    if (tipoTarifaFilter.length > 0) {
      processed = processed.filter((se) => se.tarifasFiltradas.length > 0);
    }

    // 4. Ordenar por nombre
    return processed.sort((a, b) =>
      (a.nombre || "").localeCompare(b.nombre || ""),
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
      await createServicioExtra({ ...formData, created_by: userId });
      setShowCreateModal(false);
      await loadServiciosExtra();
    } catch (error) {
      setError("Error al crear servicio extra: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (servicioExtra) => {
    setSelectedServicioExtra(servicioExtra);
    setShowEditModal(true);
  };

  const handleUpdate = async (formData) => {
    if (!formData) {
      setShowEditModal(false);
      return;
    }
    try {
      setIsSubmitting(true);
      await updateServicioExtra(selectedServicioExtra.id, {
        ...formData,
        updated_by: userId,
      });
      setShowEditModal(false);
      await loadServiciosExtra();
    } catch (error) {
      setError("Error al actualizar servicio extra: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = async (servicioExtra) => {
    if (servicioExtra?.is_protected_by_voucher) return;
    setSelectedServicioExtra(servicioExtra);
    setIsSubmitting(true);
    try {
      const dependencies = await getServicioExtraDependencies(servicioExtra.id);
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
      await deleteServicioExtra(selectedServicioExtra.id);
      setShowDeleteModal(false);
      await loadServiciosExtra();
    } catch (error) {
      setError("Error al eliminar servicio extra: " + error.message);
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
        <p>Cargando servicios extras...</p>
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
              <FaConciergeBell className="title-icon-main" />
            </div>
            <div className="title-text-group">
              <h2 className="main-title">Servicios Extras</h2>
              <p className="sub-title">
                Gestión de servicios adicionales y complementarios
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
              setSelectedServicioExtra(null);
              setShowCreateModal(true);
            }}
          >
            <FaPlus /> <span>Nuevo Servicio</span>
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
            <FaConciergeBell className="empty-icon" />
            <h3>No se encontraron servicios</h3>
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
                  <th>Servicio</th>
                  <th>Descripción</th>
                  <th>Tarifas</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedData.map((se) => (
                  <tr key={se.id} className="premium-row">
                    <td>
                      <div className="entity-cell">
                        <div className="entity-icon-box">
                          <FaConciergeBell />
                        </div>
                        <div className="entity-info">
                          <span className="entity-name">{se.nombre}</span>
                          <span className="entity-status">
                            {renderEstadoBadge(se.estado)}
                          </span>
                          <span
                            className={`badge ${se.tiene_fee ? "primary" : "warning"}`}
                            style={{ marginLeft: "5px", fontSize: "0.7rem" }}
                          >
                            {se.tiene_fee ? "Con Fee" : "Sin Fee"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="details-cell" title={se.descripcion}>
                        <FaInfoCircle />
                        <span>
                          {se.descripcion
                            ? se.descripcion.substring(0, 100) +
                              (se.descripcion.length > 100 ? "..." : "")
                            : "Sin descripción"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <TarifasCellRenderer
                        tarifas={se.tarifasFiltradas}
                        serviceId={se.id}
                        serviceType="servicio_extra"
                        allTarifas={se.tarifas}
                        onTarifasUpdated={loadServiciosExtra}
                      />
                    </td>
                    <td>
                      <div className="premium-actions">
                        <button
                          className="action-btn edit"
                          onClick={() => handleEdit(se)}
                          title="Editar"
                        >
                          <FaEdit />
                        </button>
                        <button
                          className={`action-btn delete ${se.is_protected_by_voucher ? "disabled" : ""}`}
                          onClick={() => handleDeleteClick(se)}
                          disabled={se.is_protected_by_voucher}
                          title={getProtectedDeleteTitle(se)}
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
        title="Crear Nuevo Servicio Extra"
      >
        <ServicioExtraForm
          onSubmit={handleCreate}
          isSubmitting={isSubmitting}
        />
      </Modal>

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Editar Servicio Extra"
      >
        <ServicioExtraForm
          servicioExtra={selectedServicioExtra}
          onSubmit={handleUpdate}
          isSubmitting={isSubmitting}
        />
      </Modal>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Eliminar Servicio Extra"
        size="small"
      >
        <DeleteConfirmation
          entityName="este servicio extra"
          entityData={selectedServicioExtra}
          dependentEntities={dependentEntities}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
          isDeleting={isSubmitting}
        />
      </Modal>


    </div>
  );
};

export default ServiciosExtraManager;
