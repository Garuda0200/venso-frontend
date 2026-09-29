import React, { useState, useEffect } from "react";
import {
  FaSearch,
  FaSort,
  FaStar,
  FaSortUp,
  FaSortDown,
  FaEdit,
  FaTrashAlt,
  FaPlus,
  FaCar,
  FaTaxi,
  FaMapMarkerAlt,
} from "react-icons/fa";
import {
  fetchTransportes,
  createTransporte,
  updateTransporte,
  deleteTransporte,
  getTransporteDependencies,
} from "../../services/api";
import Modal from "../Modal";
import TransporteForm from "./TransporteForm";
import DeleteConfirmation from "../DeleteConfirmation";
import useAuditInfo from "../../hooks/useAuditInfo";
import MovilidadesTransporteList from "../movilidad/MovilidadesTransporteList";
import ValoracionModal from "../common/ValoracionModal";
import "./TransporteList.scss";

const TransporteList = () => {
  const [transportes, setTransportes] = useState([]);
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
  const [selectedTransporte, setSelectedTransporte] = useState(null);
  const [dependentEntities, setDependentEntities] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estado para ver las movilidades de un transporte
  const [showMovilidadesTransporte, setShowMovilidadesTransporte] =
    useState(false);

  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  // Cargar datos
  useEffect(() => {
    loadTransportes();
  }, []);

  const loadTransportes = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchTransportes();
      setTransportes(data);
      setLoading(false);
    } catch (err) {
      setError("Error al cargar los transportes: " + err.message);
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

  // Filtrar y ordenar datos
  const filteredAndSortedTransportes = React.useMemo(() => {
    let filtered = [...transportes];

    // Aplicar filtro de búsqueda
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (transporte) =>
          transporte.nombre_transporte
            .toLowerCase()
            .includes(lowerSearchTerm) ||
          transporte.zona.toLowerCase().includes(lowerSearchTerm),
      );
    }

    // Aplicar ordenamiento
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let valueA, valueB;
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
      filtered.sort((a, b) => {
        const califA = parseFloat(a.calificacion?.valoracion) || -1;
        const califB = parseFloat(b.calificacion?.valoracion) || -1;
        if (califB !== califA) return califB - califA;
        return (a.nombre_transporte || "").localeCompare(
          b.nombre_transporte || "",
        );
      });
    }

    return filtered;
  }, [transportes, searchTerm, sortConfig]);

  // Handlers para CRUD con info de auditoría
  const handleCreate = async (formData) => {
    try {
      setIsSubmitting(true);

      // Si formData es null, el usuario canceló
      if (!formData) {
        setShowCreateModal(false);
        setIsSubmitting(false);
        return;
      }

      // Asegurarse de que formData incluye la información de auditoría
      const dataWithAudit = {
        ...formData,
        created_by: userId,
      };

      await createTransporte(dataWithAudit);
      setShowCreateModal(false);
      await loadTransportes();
      setIsSubmitting(false);
    } catch (error) {
      setError("Error al crear transporte: " + error.message);
      setIsSubmitting(false);
    }
  };

  const handleEdit = (transporte) => {
    setSelectedTransporte(transporte);
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

      await updateTransporte(selectedEntityForRating.id_transporte, updateData);

      handleCloseValoracion();
      await loadTransportes(); // Recargar para ver la nueva valoración
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

      // Si formData es null, el usuario canceló
      if (!formData) {
        setShowEditModal(false);
        setIsSubmitting(false);
        return;
      }

      // Asegurarse de que formData incluye la información de auditoría
      const dataWithAudit = {
        ...formData,
        updated_by: userId,
      };

      await updateTransporte(selectedTransporte.id_transporte, dataWithAudit);
      setShowEditModal(false);
      await loadTransportes();
      setIsSubmitting(false);
    } catch (error) {
      setError("Error al actualizar transporte: " + error.message);
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = async (transporte) => {
    setSelectedTransporte(transporte);
    setIsSubmitting(true);

    try {
      // Consultar entidades dependientes (movilidades)
      const dependencies = await getTransporteDependencies(
        transporte.id_transporte,
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
      await deleteTransporte(selectedTransporte.id_transporte);
      setShowDeleteModal(false);
      await loadTransportes();
      setIsSubmitting(false);
    } catch (error) {
      setError("Error al eliminar transporte: " + error.message);
      setIsSubmitting(false);
    }
  };

  // Función para manejar la acción de ver movilidades
  const handleViewMovilidades = (transporte) => {
    setSelectedTransporte(transporte);
    setShowMovilidadesTransporte(true);
  };

  // Si estamos viendo las movilidades de un transporte
  if (showMovilidadesTransporte && selectedTransporte) {
    return (
      <MovilidadesTransporteList
        transporte={selectedTransporte}
        onBack={() => setShowMovilidadesTransporte(false)}
      />
    );
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Cargando transportes...</p>
      </div>
    );
  }

  return (
    <div className="entity-view-container premium-design transport-list-view">
      <div className="header-with-actions transport-hero">
        <div className="header-title">
          <FaTaxi className="title-icon" />
          <h2>Gestión de Transportes</h2>
        </div>
        <button
          className="premium-btn primary"
          onClick={() => setShowCreateModal(true)}
        >
          <FaPlus style={{ marginRight: 8 }} /> Nuevo Transporte
        </button>
      </div>

      {error && <div className="premium-alert danger">{error}</div>}

      {/* Barra de búsqueda */}
      <div className="filters-container transport-filter-open">
        <div className="search-container">
          <div className="search-icon-container">
            <FaSearch />
          </div>
          <input
            className="search-input"
            placeholder="Buscar por nombre o zona..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="clear-button" onClick={() => setSearchTerm("")}>
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Tabla de transportes */}
      {filteredAndSortedTransportes.length === 0 ? (
        <div className="alert info">
          No se encontraron transportes con el criterio de búsqueda.
        </div>
      ) : (
        <div className="table-container transport-table-card">
          <table className="custom-table transport-premium-table">
            <thead>
              <tr>
                <th onClick={() => requestSort("nombre_transporte")}>
                  Nombre {getSortIcon("nombre_transporte")}
                </th>
                <th onClick={() => requestSort("zona")}>
                  Zona {getSortIcon("zona")}
                </th>
                <th onClick={() => requestSort("calificacion")}>
                  Valoración {getSortIcon("calificacion")}
                </th>
                <th onClick={() => requestSort("telefono")}>
                  Teléfono {getSortIcon("telefono")}
                </th>
                <th onClick={() => requestSort("correo")}>
                  Correo {getSortIcon("correo")}
                </th>
                <th className="actions-column">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedTransportes.map((transporte) => (
                <tr key={transporte.id_transporte} className="entity-row">
                  <td>
                    <div className="entity-name-cell">
                      <FaTaxi className="entity-icon-small" />
                      <span className="entity-name">
                        {transporte.nombre_transporte}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="entity-details">
                      <div className="location-info">
                        <FaMapMarkerAlt className="location-icon" />
                        <span>{transporte.zona}</span>
                      </div>
                    </div>
                  </td>
                  <td>{renderValoracion(transporte.calificacion)}</td>
                  <td>
                    {transporte.telefono || (
                      <span className="text-muted">N/A</span>
                    )}
                  </td>
                  <td>
                    {transporte.correo || (
                      <span className="text-muted">N/A</span>
                    )}
                  </td>
                  <td>
                    <div className="premium-actions">
                      <button
                        className="action-btn rate"
                        onClick={() => handleOpenValoracion(transporte)}
                        title="Calificar transporte"
                      >
                        <FaStar />
                      </button>

                      <button
                        className="action-btn view"
                        onClick={() => handleViewMovilidades(transporte)}
                        title="Ver Movilidades"
                      >
                        <FaCar />
                      </button>
                      <button
                        className="action-btn edit"
                        onClick={() => handleEdit(transporte)}
                        title="Editar"
                      >
                        <FaEdit />
                      </button>
                      <button
                        className="action-btn delete"
                        onClick={() => handleDeleteClick(transporte)}
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

      {/* Modal para crear transporte */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Crear Nuevo Transporte"
      >
        <TransporteForm onSubmit={handleCreate} isSubmitting={isSubmitting} />
      </Modal>

      {/* Modal para valoración */}
      {showValoracionModal && (
        <ValoracionModal
          show={showValoracionModal}
          onClose={handleCloseValoracion}
          entity={selectedEntityForRating}
          entityType="transporte"
          onSave={handleSaveValoracion}
        />
      )}

      {/* Modal para editar transporte */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Editar Transporte"
      >
        <TransporteForm
          transporte={selectedTransporte}
          onSubmit={handleUpdate}
          isSubmitting={isSubmitting}
        />
      </Modal>

      {/* Modal para eliminar transporte */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Eliminar Transporte"
        size="small"
      >
        <DeleteConfirmation
          entityName="este transporte"
          entityData={selectedTransporte}
          dependentEntities={dependentEntities}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
          isDeleting={isSubmitting}
        />
      </Modal>
    </div>
  );
};

export default TransporteList;
