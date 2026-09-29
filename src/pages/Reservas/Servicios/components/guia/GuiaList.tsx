import React, { useState, useEffect } from "react";
import {
  FaSearch,
  FaSort,
  FaSortUp,
  FaStar,
  FaSortDown,
  FaEdit,
  FaTrashAlt,
  FaPlus,
  FaRoute,
  FaUserTie,
} from "react-icons/fa";
import {
  fetchGuias,
  createGuia,
  updateGuia,
  deleteGuia,
  getGuiaDependencies,
} from "../../services/api";
import Modal from "../Modal";
import GuiaForm from "./GuiaForm";
import DeleteConfirmation from "../DeleteConfirmation";
import useAuditInfo from "../../hooks/useAuditInfo";
import RutasGuiaList from "../ruta/RutasGuiaList";
import ValoracionModal from "../common/ValoracionModal";

const GuiaList = () => {
  const [guias, setGuias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({
    key: "calificacion",
    direction: "descending",
  });

  // Estado para modal de valoración
  const [showValoracionModal, setShowValoracionModal] = useState(false);
  const [selectedEntityForRating, setSelectedEntityForRating] = useState(null);

  // Estados para modales
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRutasGuia, setShowRutasGuia] = useState(false);
  const [selectedGuia, setSelectedGuia] = useState(null);
  const [dependentEntities, setDependentEntities] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  // Cargar datos
  useEffect(() => {
    loadGuias();
  }, []);

  const loadGuias = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchGuias();
      setGuias(data);
      setLoading(false);
    } catch (err) {
      setError("Error al cargar los guías: " + err.message);
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
  const filteredAndSortedGuias = React.useMemo(() => {
    let filtered = [...guias];

    // Aplicar filtro de búsqueda
    if (searchTerm.trim() !== "") {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter((guia) => {
        // Adaptado para la estructura GuiaConPersona
        // Primero intentar acceder a los campos directamente (por compatibilidad)
        const nombres = guia.nombres || guia.persona?.nombres || "";
        const apellidos = guia.apellidos || guia.persona?.apellidos || "";
        const codigo_guia = guia.codigo_guia || guia.guia?.codigo_guia || "";
        const idioma = (guia.idioma || guia.guia?.idioma || "").toString();

        return (
          nombres.toLowerCase().includes(lowerSearchTerm) ||
          apellidos.toLowerCase().includes(lowerSearchTerm) ||
          codigo_guia.toLowerCase().includes(lowerSearchTerm) ||
          idioma.toLowerCase().includes(lowerSearchTerm)
        );
      });
    }

    // Aplicar ordenamiento - adaptado para manejar estructura GuiaConPersona
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aValue, bValue;

        switch (sortConfig.key) {
          case "nombres":
            aValue = a.nombres || a.persona?.nombres || "";
            bValue = b.nombres || b.persona?.nombres || "";
            break;

          case "apellidos":
            aValue = a.apellidos || a.persona?.apellidos || "";
            bValue = b.apellidos || b.persona?.apellidos || "";
            break;

          case "codigo_guia":
            aValue = a.codigo_guia || a.guia?.codigo_guia || "";
            bValue = b.codigo_guia || b.guia?.codigo_guia || "";
            break;

          case "idioma":
            aValue = (a.guia?.idioma || a.idioma || []).toString();
            bValue = (b.guia?.idioma || b.idioma || []).toString();
            break;

          case "genero":
            aValue = a.genero || a.persona?.genero || "";
            bValue = b.genero || b.persona?.genero || "";
            break;

          case "calificacion":
            aValue = a.guia?.calificacion?.valoracion ?? 0;
            bValue = b.guia?.calificacion?.valoracion ?? 0;
            break;

          default:
            aValue = a[sortConfig.key] ?? "";
            bValue = b[sortConfig.key] ?? "";
        }

        // Manejar nulls y undefined
        if (aValue == null)
          return sortConfig.direction === "ascending" ? -1 : 1;
        if (bValue == null)
          return sortConfig.direction === "ascending" ? 1 : -1;

        // Comparar strings insensible a mayúsculas/minúsculas
        if (typeof aValue === "string" && typeof bValue === "string") {
          const comparison = aValue.localeCompare(bValue);
          return sortConfig.direction === "ascending"
            ? comparison
            : -comparison;
        }

        // Comparación normal
        if (aValue < bValue) {
          return sortConfig.direction === "ascending" ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === "ascending" ? 1 : -1;
        }
        return 0;
      });
    }

    return filtered;
  }, [guias, searchTerm, sortConfig]);

  // Handlers para CRUD con info de auditoría
  const handleCreate = async (formData) => {
    try {
      setIsSubmitting(true);
      // Asegurarse de que formData incluye la información de auditoría
      const dataWithAudit = {
        ...formData,
        created_by: userId,
      };

      await createGuia(dataWithAudit);
      setShowCreateModal(false);
      await loadGuias();
      setIsSubmitting(false);
    } catch (error) {
      setError("Error al crear guía: " + error.message);
      setIsSubmitting(false);
    }
  };

  const handleEdit = (guia) => {
    setSelectedGuia(guia);
    setShowEditModal(true);
  };

  const handleUpdate = async (formData) => {
    try {
      setIsSubmitting(true);
      // Asegurarse de que formData incluye la información de auditoría
      const dataWithAudit = {
        ...formData,
        updated_by: userId,
      };

      // IMPORTANTE: Extraer el ID correctamente
      const guiaId = selectedGuia?.guia?.id_guia || selectedGuia?.id_guia;

      if (!guiaId) {
        throw new Error("ID de guía no encontrado");
      }

      await updateGuia(guiaId, dataWithAudit);
      setShowEditModal(false);
      await loadGuias();
      setIsSubmitting(false);
    } catch (error) {
      setError("Error al actualizar guía: " + error.message);
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = async (guia) => {
    try {
      // Extraer el ID correctamente, considerando diferentes estructuras posibles
      const guiaId = guia?.guia?.id_guia || guia?.id_guia;

      if (!guiaId) {
        throw new Error("ID de guía no encontrado");
      }

      setSelectedGuia(guia);
      setIsSubmitting(true);

      // Consultar entidades dependientes
      const dependencies = await getGuiaDependencies(guiaId);
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

      // IMPORTANTE: Extraer el ID correctamente
      const guiaId = selectedGuia?.guia?.id_guia || selectedGuia?.id_guia;

      if (!guiaId) {
        throw new Error("ID de guía no encontrado");
      }

      await deleteGuia(guiaId);
      setShowDeleteModal(false);
      await loadGuias();
      setIsSubmitting(false);
    } catch (error) {
      setError("Error al eliminar guía: " + error.message);
      setIsSubmitting(false);
    }
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

  const handleOpenValoracion = (guia) => {
    setSelectedEntityForRating(guia);
    setShowValoracionModal(true);
  };

  const handleCloseValoracion = () => {
    setShowValoracionModal(false);
    setSelectedEntityForRating(null);
  };
  console.log("Selected Entity for Rating:", selectedEntityForRating);

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

      // Actualizar el guia con la nueva valoración
      const updateData = {
        calificacion: calificacionObj,
        updated_by: userId,
      };

      await updateGuia(selectedEntityForRating.guia.id_guia, updateData);

      handleCloseValoracion();
      await loadGuias(); // Recargar para ver la nueva valoración
      setIsSubmitting(false);
    } catch (error) {
      console.error("Error al guardar valoración:", error);
      setError("Error al guardar la valoración: " + error.message);
      setIsSubmitting(false);
    }
  };

  const handleShowRutas = (guia) => {
    // IMPORTANTE: Asegurarse de que tenemos el objeto completo
    setSelectedGuia(guia);
    setShowRutasGuia(true);
  };

  // Si estamos viendo las rutas de un guía
  if (showRutasGuia && selectedGuia) {
    return (
      <RutasGuiaList
        guia={selectedGuia}
        onBack={() => setShowRutasGuia(false)}
        onRefreshParent={loadGuias}
      />
    );
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Cargando guías...</p>
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
              <FaUserTie className="title-icon-main" />
            </div>
            <div className="title-text-group">
              <h2 className="main-title">Guías</h2>
              <p className="sub-title">
                Gestión de personal de guiado y sus especialidades
              </p>
            </div>
          </div>
        </div>

        <div className="header-actions-group">
          <button
            className="premium-btn primary"
            onClick={() => {
              setSelectedGuia(null);
              setShowCreateModal(true);
            }}
          >
            <FaPlus /> <span>Nuevo Guía</span>
          </button>
        </div>
      </div>

      {error && <div className="premium-alert danger">{error}</div>}

      {/* Panel de Filtros Moderno */}
      <div className="filters-wrapper show">
        <div className="filters-glass-panel">
          <div className="search-bar-modern">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Buscar por nombre, apellidos, código o idioma..."
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
        </div>
      </div>

      {/* Contenido Principal (Tabla) */}
      <div className="content-card">
        {filteredAndSortedGuias.length === 0 ? (
          <div className="empty-state-modern">
            <FaUserTie className="empty-icon" />
            <h3>No se encontraron guías</h3>
            <p>Intenta ajustar tus criterios de búsqueda o crea uno nuevo.</p>
          </div>
        ) : (
          <div className="table-responsive-modern">
            <table className="premium-table">
              <thead>
                <tr>
                  <th
                    onClick={() => requestSort("nombres")}
                    className="sortable"
                  >
                    Nombres {getSortIcon("nombres")}
                  </th>
                  <th
                    onClick={() => requestSort("apellidos")}
                    className="sortable"
                  >
                    Apellidos {getSortIcon("apellidos")}
                  </th>
                  <th
                    onClick={() => requestSort("codigo_guia")}
                    className="sortable"
                  >
                    Código {getSortIcon("codigo_guia")}
                  </th>
                  <th
                    onClick={() => requestSort("idioma")}
                    className="sortable"
                  >
                    Idioma {getSortIcon("idioma")}
                  </th>
                  <th
                    onClick={() => requestSort("genero")}
                    className="sortable"
                  >
                    Género {getSortIcon("genero")}
                  </th>
                  <th
                    onClick={() => requestSort("calificacion")}
                    className="sortable"
                  >
                    Calificación {getSortIcon("calificacion")}
                  </th>
                  <th>Contacto</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedGuias.map((guia) => {
                  const id = guia.id_guia || guia.guia?.id_guia;
                  const nombres = guia.nombres || guia.persona?.nombres || "";
                  const apellidos =
                    guia.apellidos || guia.persona?.apellidos || "";
                  const codigo =
                    guia.codigo_guia || guia.guia?.codigo_guia || "-";

                  let idioma = "-";
                  if (guia.idioma || guia.guia?.idioma) {
                    const idiomaData = guia.guia?.idioma || guia.idioma;
                    if (typeof idiomaData === "string") idioma = idiomaData;
                    else if (Array.isArray(idiomaData))
                      idioma = idiomaData.join(", ");
                    else if (
                      typeof idiomaData === "object" &&
                      idiomaData !== null
                    ) {
                      idioma = Array.isArray(idiomaData)
                        ? idiomaData.join(", ")
                        : JSON.stringify(idiomaData);
                    }
                  }

                  const genero = guia.genero || guia.persona?.genero || "-";
                  const telefono = guia.guia?.telefono || guia.telefono || "-";
                  const correo = guia.guia?.correo || guia.correo || "-";

                  return (
                    <tr key={id} className="premium-row">
                      <td>
                        <span className="entity-name">{nombres}</span>
                      </td>
                      <td>
                        <span className="entity-name">{apellidos}</span>
                      </td>
                      <td>
                        <span className="badge secondary">{codigo}</span>
                      </td>
                      <td>
                        <span className="text-small">{idioma}</span>
                      </td>
                      <td>{genero}</td>
                      <td>{renderValoracion(guia.guia?.calificacion)}</td>
                      <td>
                        <div className="contact-info-cell">
                          <span className="text-small d-block">{correo}</span>
                          <span className="text-muted text-small">
                            {telefono}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="premium-actions">
                          <button
                            className="action-btn rating"
                            onClick={() => handleOpenValoracion(guia)}
                            title="Calificar"
                          >
                            <FaStar />
                          </button>
                          <button
                            className="action-btn edit"
                            onClick={() => handleEdit(guia)}
                            title="Editar"
                          >
                            <FaEdit />
                          </button>
                          <button
                            className="action-btn view"
                            onClick={() => handleShowRutas(guia)}
                            title="Ver Rutas"
                          >
                            <FaRoute />
                          </button>
                          <button
                            className="action-btn delete"
                            onClick={() => handleDeleteClick(guia)}
                            title="Eliminar"
                          >
                            <FaTrashAlt />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modales */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Crear Nuevo Guía"
      >
        <GuiaForm onSubmit={handleCreate} isSubmitting={isSubmitting} />
      </Modal>

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Editar Guía"
      >
        <GuiaForm
          guia={selectedGuia}
          onSubmit={handleUpdate}
          isSubmitting={isSubmitting}
        />
      </Modal>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Eliminar Guía"
        size="small"
      >
        <DeleteConfirmation
          entityName="este guía"
          entityData={
            selectedGuia
              ? {
                  nombre:
                    (selectedGuia.persona?.nombres || selectedGuia.nombres) +
                    " " +
                    (selectedGuia.persona?.apellidos || selectedGuia.apellidos),
                  codigo:
                    selectedGuia.codigo_guia || selectedGuia.guia?.codigo_guia,
                }
              : {}
          }
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
          entityType="guia"
          onSave={handleSaveValoracion}
        />
      )}
    </div>
  );
};

export default GuiaList;
