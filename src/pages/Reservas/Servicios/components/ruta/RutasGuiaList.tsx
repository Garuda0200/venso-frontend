import React, { useState, useEffect, useMemo } from "react";
import {
  FaSearch,
  FaEdit,
  FaTrashAlt,
  FaPlus,
  FaStar,
  FaFilter,
  FaChevronLeft,
  FaMapMarkedAlt,
  FaUserTie,
  FaRoute,
} from "react-icons/fa";
import {
  fetchRutasByGuiaWithTarifas,
  createRuta,
  updateRuta,
  deleteRuta,
  getRutaDependencies,
} from "../../services/api";
import Modal from "../Modal";
import RutaForm from "./RutaForm";
import DeleteConfirmation from "../DeleteConfirmation";
import useAuditInfo from "../../hooks/useAuditInfo";
import ValoracionModal from "../common/ValoracionModal";
import TarifasCellRenderer from "../tarifa/TarifasCellRenderer";
import TarifaFilterPanel from "../common/TarifaFilterPanel";
import { BADGE_COLORS } from "../../utils/constants";

const RutasGuiaList = ({ guia, onBack }) => {
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
  const [selectedRuta, setSelectedRuta] = useState(null);
  const [dependentEntities, setDependentEntities] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showValoracionModal, setShowValoracionModal] = useState(false);
  const [selectedEntityForRating, setSelectedEntityForRating] = useState(null);

  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  const guiaId = guia?.id_guia || (guia?.guia && guia.guia.id_guia);

  // Cargar datos
  useEffect(() => {
    loadRutas();
  }, [guiaId]);

  const loadRutas = async () => {
    if (!guiaId) return;
    try {
      setLoading(true);
      setError(null);
      const normalizedData = await fetchRutasByGuiaWithTarifas(guiaId);
      setData(normalizedData);
    } catch (err) {
      setError("Error al cargar las rutas: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filtrar y ordenar datos
  const filteredAndSortedData = useMemo(() => {
    // 1. Mapeamos los datos para incluir solo las tarifas filtradas si es necesario
    let processed = data.map((r) => ({
      ...r,
      tarifasFiltradas:
        tipoTarifaFilter.length > 0
          ? (r.tarifas || []).filter((t) =>
              tipoTarifaFilter.includes(t.tipo_tarifa),
            )
          : r.tarifas || [],
    }));

    // 2. Aplicar filtro de búsqueda sobre los datos procesados
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      processed = processed.filter(
        (r) =>
          (r.nombre_ruta || "").toLowerCase().includes(term) ||
          (r.descripcion || "").toLowerCase().includes(term) ||
          (r.estado || "").toLowerCase().includes(term),
      );
    }

    // 3. Si hay filtro de tarifas activo, solo mostramos los que tienen al menos una tarifa que coincida
    if (tipoTarifaFilter.length > 0) {
      processed = processed.filter((r) => r.tarifasFiltradas.length > 0);
    }

    // 4. Ordenar: calificación alta primero, luego nombre
    return processed.sort((a, b) => {
      const califA = parseFloat(a.calificacion?.valoracion) || -1;
      const califB = parseFloat(b.calificacion?.valoracion) || -1;
      if (califB !== califA) return califB - califA;
      return (a.nombre_ruta || "").localeCompare(b.nombre_ruta || "");
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
      await createRuta({ ...formData, id_guia: guiaId, created_by: userId });
      setShowCreateModal(false);
      await loadRutas();
    } catch (error) {
      setError("Error al crear ruta: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (ruta) => {
    setSelectedRuta(ruta);
    setShowEditModal(true);
  };

  const handleUpdate = async (formData) => {
    if (!formData) {
      setShowEditModal(false);
      return;
    }
    try {
      setIsSubmitting(true);
      await updateRuta(selectedRuta.id_ruta, {
        ...formData,
        id_guia: guiaId,
        updated_by: userId,
      });
      setShowEditModal(false);
      await loadRutas();
    } catch (error) {
      setError("Error al actualizar ruta: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = async (ruta) => {
    setSelectedRuta(ruta);
    setIsSubmitting(true);
    try {
      const dependencies = await getRutaDependencies(ruta.id_ruta);
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
      await deleteRuta(selectedRuta.id_ruta);
      setShowDeleteModal(false);
      await loadRutas();
    } catch (error) {
      setError("Error al eliminar ruta: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleOpenValoracion = (ruta) => {
    setSelectedEntityForRating(ruta);
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
      await updateRuta(selectedEntityForRating.id_ruta, {
        calificacion: calificacionObj,
        updated_by: userId,
      });
      setShowValoracionModal(false);
      await loadRutas();
    } catch (error) {
      setError("Error al guardar valoración: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render helpers
  const renderEstadoBadge = (estado) => {
    const badgeClass = `badge ${BADGE_COLORS[(estado || "").toLowerCase()] || "secondary"}`;
    return <span className={badgeClass}>{estado}</span>;
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

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Cargando rutas...</p>
      </div>
    );
  }

  const nombres = guia?.nombres || guia?.persona?.nombres || "";
  const apellidos = guia?.apellidos || guia?.persona?.apellidos || "";
  const guiaName = `${nombres} ${apellidos}`.trim() || "Guía";

  return (
    <div className="entity-view-container premium-design">
      {/* Botón Volver */}
      <div className="back-navigation">
        <button onClick={onBack} className="back-link-btn">
          <FaChevronLeft /> <span>Volver a Guías</span>
        </button>
      </div>

      {/* Header Premium */}
      <div className="header-dashboard">
        <div className="header-main-info">
          <div className="header-title-group">
            <div className="title-icon-wrapper">
              <FaMapMarkedAlt className="title-icon-main" />
            </div>
            <div className="title-text-group">
              <h2 className="main-title">Rutas & Excursiones</h2>
              <p className="sub-title">Guía: {guiaName}</p>
            </div>
          </div>
          <div className="header-badges">
            <span className="info-badge">
              <FaUserTie className="badge-icon" />
              Cédula:{" "}
              {guia?.cedula_identidad ||
                guia?.persona?.cedula_identidad ||
                "N/A"}
            </span>
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
              setSelectedRuta(null);
              setShowCreateModal(true);
            }}
          >
            <FaPlus /> <span>Nueva Ruta</span>
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
            <FaRoute className="empty-icon" />
            <h3>No se encontraron rutas</h3>
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
                  <th>Tour / Ruta</th>
                  <th>Viáticos</th>
                  <th>Observaciones</th>
                  <th>Tarifas</th>
                  <th>Valoración</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedData.map((ruta) => (
                  <tr key={ruta.id_ruta} className="premium-row">
                    <td>
                      <div className="entity-cell">
                        <div className="entity-icon-box">
                          <FaRoute />
                        </div>
                        <div className="entity-info">
                          <span className="entity-name">
                            {ruta.tour_nombre}
                          </span>
                          <span className="entity-status">
                            {renderEstadoBadge(ruta.estado)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="details-cell">
                        {ruta.viaticos ? (
                          <span className="badge success">
                            Incluye:{" "}
                            {ruta.costo_viaticos
                              ? `$ ${ruta.costo_viaticos}`
                              : "Sí"}
                          </span>
                        ) : (
                          <span className="badge secondary">No incluye</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="description-cell">
                        <span>
                          {ruta.observaciones
                            ? ruta.observaciones.substring(0, 50) +
                              (ruta.observaciones.length > 50 ? "..." : "")
                            : "Sin observaciones"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <TarifasCellRenderer
                        tarifas={ruta.tarifasFiltradas}
                        serviceId={ruta.id_ruta}
                        serviceType="ruta"
                        allTarifas={ruta.tarifas}
                        onTarifasUpdated={loadRutas}
                      />
                    </td>
                    <td>{renderValoracion(ruta.calificacion)}</td>
                    <td>
                      <div className="premium-actions">
                        <button
                          className="action-btn rate"
                          onClick={() => handleOpenValoracion(ruta)}
                          title="Calificar"
                        >
                          <FaStar />
                        </button>
                        <button
                          className="action-btn edit"
                          onClick={() => handleEdit(ruta)}
                          title="Editar"
                        >
                          <FaEdit />
                        </button>
                        <button
                          className="action-btn delete"
                          onClick={() => handleDeleteClick(ruta)}
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
        title="Nueva Ruta"
      >
        <RutaForm
          guiaId={guiaId}
          onSubmit={handleCreate}
          isSubmitting={isSubmitting}
        />
      </Modal>

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Editar Ruta"
      >
        <RutaForm
          ruta={selectedRuta}
          onSubmit={handleUpdate}
          isSubmitting={isSubmitting}
        />
      </Modal>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Eliminar Ruta"
        size="small"
      >
        <DeleteConfirmation
          entityName="esta ruta"
          entityData={selectedRuta}
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
          entityType="ruta_guia"
          onSave={handleSaveValoracion}
        />
      )}

    </div>
  );
};

export default RutasGuiaList;
