import React, { useState, useEffect, useMemo } from "react";
import {
  FaPlus,
  FaEdit,
  FaStar,
  FaTrashAlt,
  FaSearch,
  FaFilter,
  FaUtensils,
  FaMapMarkerAlt,
  FaInfoCircle,
  FaEnvelope,
  FaPhoneAlt,
} from "react-icons/fa";
import {
  fetchRestaurantesWithTarifas,
  createRestaurante,
  updateRestaurante,
  deleteRestaurante,
  getRestauranteDependencies,
  fetchProtectedServiceUsage,
} from "../../services/api";
import ValoracionModal from "../common/ValoracionModal";
import Modal from "../Modal";
import RestauranteForm from "./RestauranteForm";
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

const RestaurantesManager = () => {
  // Estado único para datos normalizados (entidad + tarifas)
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [tipoTarifaFilter, setTipoTarifaFilter] = useState([]);
  const [showFilters, setShowFilters] = useState(true);

  // Estado para modal de valoración
  const [showValoracionModal, setShowValoracionModal] = useState(false);
  const [selectedEntityForRating, setSelectedEntityForRating] = useState(null);

  // Estados para modales
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [selectedRestaurante, setSelectedRestaurante] = useState(null);
  const [dependentEntities, setDependentEntities] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  // Cargar restaurantes
  useEffect(() => {
    loadRestaurantes();
  }, []);

  const loadRestaurantes = async () => {
    try {
      setLoading(true);
      setError(null);

      // Cargamos directamente con tarifas para tener todo en un solo objeto
      const withTarifasData = await fetchRestaurantesWithTarifas();

      // Normalizar datos
      const normalizedData = withTarifasData.map((item) => ({
        ...(item.restaurante || {}),
        tarifas: item.tarifas || [],
      }));

      const allTarifas = normalizedData.flatMap(
        (restaurante) => restaurante.tarifas || [],
      );
      const [protectedUsage, protectedTarifaUsage] = await Promise.all([
        fetchProtectedServiceUsage(
          buildProtectedQueryItems(
            normalizedData,
            "restaurantes",
            (restaurante) => restaurante.id_restaurante,
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
          "restaurantes",
          (restaurante) => restaurante.id_restaurante,
        ).map((restaurante) => ({
          ...restaurante,
          tarifas: annotateProtectedRecords(
            restaurante.tarifas || [],
            protectedTarifaUsage,
            "tarifa",
            (tarifa) => tarifa.id_tarifa,
          ),
        })),
      );
      setLoading(false);
    } catch (err) {
      setError("Error al cargar los restaurantes: " + err.message);
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
          (r.nombre || "").toLowerCase().includes(term) ||
          (r.direccion || "").toLowerCase().includes(term) ||
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
      return (a.nombre || "").localeCompare(b.nombre || "");
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
      const dataWithAudit = { ...formData, created_by: userId };
      await createRestaurante(dataWithAudit);
      setShowCreateModal(false);
      await loadRestaurantes();
    } catch (error) {
      setError("Error al crear restaurante: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (restaurante) => {
    setSelectedRestaurante(restaurante);
    setShowEditModal(true);
  };

  const handleUpdate = async (formData) => {
    if (!formData) {
      setShowEditModal(false);
      return;
    }

    try {
      setIsSubmitting(true);
      const dataWithAudit = { ...formData, updated_by: userId };
      await updateRestaurante(
        selectedRestaurante.id_restaurante,
        dataWithAudit,
      );
      setShowEditModal(false);
      await loadRestaurantes();
    } catch (error) {
      setError("Error al actualizar restaurante: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = async (restaurante) => {
    if (restaurante?.is_protected_by_voucher) return;
    setSelectedRestaurante(restaurante);
    setIsSubmitting(true);
    try {
      const dependencies = await getRestauranteDependencies(
        restaurante.id_restaurante,
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
      await deleteRestaurante(selectedRestaurante.id_restaurante);
      setShowDeleteModal(false);
      await loadRestaurantes();
    } catch (error) {
      setError("Error al eliminar restaurante: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleOpenValoracion = (restaurante) => {
    setSelectedEntityForRating(restaurante);
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
      await updateRestaurante(selectedEntityForRating.id_restaurante, {
        calificacion: calificacionObj,
        updated_by: userId,
      });
      setShowValoracionModal(false);
      await loadRestaurantes();
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
        <p>Cargando restaurantes...</p>
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
              <FaUtensils className="title-icon-main" />
            </div>
            <div className="title-text-group">
              <h2 className="main-title">Gestión de Restaurantes</h2>
              <p className="sub-title">
                Administra locales gastronómicos y sus tarifas
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
              setSelectedRestaurante(null);
              setShowCreateModal(true);
            }}
          >
            <FaPlus /> <span>Nuevo Restaurante</span>
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
              placeholder="Buscar por nombre, dirección o estado..."
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
            <FaUtensils className="empty-icon" />
            <h3>No se encontraron restaurantes</h3>
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
                  <th>Restaurante</th>
                  <th>Ubicación</th>
                  <th>Detalles</th>
                  <th>Tarifas</th>
                  <th>Valoración</th>
                  <th>Contacto</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedData.map((restaurante) => (
                  <tr key={restaurante.id_restaurante} className="premium-row">
                    <td>
                      <div className="entity-cell">
                        <div className="entity-icon-box">
                          <FaUtensils />
                        </div>
                        <div className="entity-info">
                          <span className="entity-name">
                            {restaurante.nombre}
                          </span>
                          <span className="entity-status">
                            {renderEstadoBadge(restaurante.estado)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="location-cell">
                        <FaMapMarkerAlt /> <span>{restaurante.direccion}</span>
                      </div>
                    </td>
                    <td>
                      <div
                        className="details-cell"
                        title={restaurante.detalles}
                      >
                        <FaInfoCircle />
                        <span>
                          {restaurante.detalles
                            ? restaurante.detalles.substring(0, 40) +
                              (restaurante.detalles.length > 40 ? "..." : "")
                            : "Sin detalles"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <TarifasCellRenderer
                        tarifas={restaurante.tarifasFiltradas}
                        serviceId={restaurante.id_restaurante}
                        serviceType="restaurante"
                        allTarifas={restaurante.tarifas}
                        onTarifasUpdated={loadRestaurantes}
                      />
                    </td>
                    <td>{renderValoracion(restaurante.calificacion)}</td>
                    <td>
                      <div className="contact-info-stack">
                        {restaurante.correo && (
                          <div className="contact-item">
                            <FaEnvelope /> <span>{restaurante.correo}</span>
                          </div>
                        )}
                        {restaurante.telefono && (
                          <div className="contact-item">
                            <FaPhoneAlt /> <span>{restaurante.telefono}</span>
                          </div>
                        )}
                        {!restaurante.correo && !restaurante.telefono && (
                          <span className="text-muted">Sin datos</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="premium-actions">
                        <button
                          className="action-btn rate"
                          onClick={() => handleOpenValoracion(restaurante)}
                          title="Calificar"
                        >
                          <FaStar />
                        </button>
                        <button
                          className="action-btn edit"
                          onClick={() => handleEdit(restaurante)}
                          title="Editar"
                        >
                          <FaEdit />
                        </button>
                        <button
                          className={`action-btn delete ${restaurante.is_protected_by_voucher ? "disabled" : ""}`}
                          onClick={() => handleDeleteClick(restaurante)}
                          disabled={restaurante.is_protected_by_voucher}
                          title={getProtectedDeleteTitle(restaurante)}
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
        title="Crear Nuevo Restaurante"
      >
        <RestauranteForm onSubmit={handleCreate} isSubmitting={isSubmitting} />
      </Modal>

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Editar Restaurante"
      >
        <RestauranteForm
          restaurante={selectedRestaurante}
          onSubmit={handleUpdate}
          isSubmitting={isSubmitting}
        />
      </Modal>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Eliminar Restaurante"
        size="small"
      >
        <DeleteConfirmation
          entityName="este restaurante"
          entityData={selectedRestaurante}
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
          entityType="restaurante"
          onSave={handleSaveValoracion}
        />
      )}

    </div>
  );
};

export default RestaurantesManager;
