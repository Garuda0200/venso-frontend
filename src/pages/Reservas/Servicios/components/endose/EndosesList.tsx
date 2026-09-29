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
} from "react-icons/fa";
import {
  fetchEndoses,
  createEndose,
  updateEndose,
  deleteEndose,
  getEndoseDependencies,
} from "../../services/api";
import Modal from "../Modal";
import EndoseForm from "./EndoseForm";
import DeleteConfirmation from "../DeleteConfirmation";
import useAuditInfo from "../../hooks/useAuditInfo";
import ToursEndoseList from "../tour/ToursEndoseList";
import ValoracionModal from "../common/ValoracionModal";
import TarifaFilterPanel from "../common/TarifaFilterPanel";

const EndosesList = () => {
  const [endoses, setEndoses] = useState([]);
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
  const [selectedEndose, setSelectedEndose] = useState(null);
  const [dependentEntities, setDependentEntities] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToursEndose, setShowToursEndose] = useState(false);

  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  // Cargar datos
  useEffect(() => {
    loadEndoses();
  }, []);

  const loadEndoses = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchEndoses();
      setEndoses(data);
      setLoading(false);
    } catch (err) {
      setError("Error al cargar los endoses: " + err.message);
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
  const filteredAndSortedEndoses = React.useMemo(() => {
    let filtered = [...endoses];

    // Aplicar filtro de búsqueda
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (endose) =>
          endose.nombre_agencia?.toLowerCase().includes(lowerSearchTerm) ||
          false ||
          endose.zona?.toLowerCase().includes(lowerSearchTerm) ||
          false,
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
          if (a[sortConfig.key] == null && b[sortConfig.key] == null) return 0;
          if (a[sortConfig.key] == null)
            return sortConfig.direction === "ascending" ? -1 : 1;
          if (b[sortConfig.key] == null)
            return sortConfig.direction === "ascending" ? 1 : -1;
          valueA = a[sortConfig.key];
          valueB = b[sortConfig.key];
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
        return (a.nombre_agencia || "").localeCompare(b.nombre_agencia || "");
      });
    }

    return filtered;
  }, [endoses, searchTerm, sortConfig]);

  // Handlers para CRUD con info de auditoría
  const handleCreate = async (formData) => {
    try {
      setIsSubmitting(true);
      // Asegurarse de que formData incluye la información de auditoría
      const dataWithAudit = {
        ...formData,
        created_by: userId,
      };

      await createEndose(dataWithAudit);
      setShowCreateModal(false);
      await loadEndoses();
      setIsSubmitting(false);
    } catch (error) {
      setError("Error al crear endose: " + error.message);
      setIsSubmitting(false);
    }
  };

  const handleEdit = (endose) => {
    setSelectedEndose(endose);
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

      await updateEndose(selectedEndose.id_endose, dataWithAudit);
      setShowEditModal(false);
      await loadEndoses();
      setIsSubmitting(false);
    } catch (error) {
      setError("Error al actualizar endose: " + error.message);
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = async (endose) => {
    setSelectedEndose(endose);
    setIsSubmitting(true);

    try {
      // Consultar entidades dependientes (tours)
      const dependencies = await getEndoseDependencies(endose.id_endose);
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
      await deleteEndose(selectedEndose.id_endose);
      setShowDeleteModal(false);
      await loadEndoses();
      setIsSubmitting(false);
    } catch (error) {
      setError("Error al eliminar endose: " + error.message);
      setIsSubmitting(false);
    }
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

      await updateEndose(selectedEntityForRating.id_endose, updateData);

      handleCloseValoracion();
      await loadEndoses(); // Recargar para ver la nueva valoración
      setIsSubmitting(false);
    } catch (error) {
      console.error("Error al guardar valoración:", error);
      setError("Error al guardar la valoración: " + error.message);
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

  // Nueva función para manejar la acción de ver tours
  const handleViewTours = (endose) => {
    setSelectedEndose(endose);
    setShowToursEndose(true);
  };

  // Si estamos viendo los tours de un endose
  if (showToursEndose && selectedEndose) {
    return (
      <ToursEndoseList
        endose={selectedEndose}
        onBack={() => setShowToursEndose(false)}
      />
    );
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Cargando endoses...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="header-with-actions">
        <h2>Lista de Endoses</h2>
        <button
          className="button button-primary"
          onClick={() => setShowCreateModal(true)}
        >
          <FaPlus style={{ marginRight: 8 }} /> Nuevo Endose
        </button>
      </div>

      {error && <div className="alert danger">{error}</div>}

      {/* Barra de búsqueda y filtros */}
      <div className="search-container">
        <div style={{ display: "flex", flex: 1 }}>
          <div className="search-icon-container">
            <FaSearch />
          </div>
          <input
            className="search-input"
            placeholder="Buscar por nombre de agencia o zona..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {searchTerm && (
          <button className="clear-button" onClick={() => setSearchTerm("")}>
            Limpiar
          </button>
        )}
      </div>

      {/* Tabla de endoses */}
      {filteredAndSortedEndoses.length === 0 ? (
        <div className="alert info">
          No se encontraron endoses con el criterio de búsqueda.
        </div>
      ) : (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th onClick={() => requestSort("nombre_agencia")}>
                  Nombre de Agencia {getSortIcon("nombre_agencia")}
                </th>
                <th onClick={() => requestSort("zona")}>
                  Zona {getSortIcon("zona")}
                </th>
                <th onClick={() => requestSort("calificacion")}>
                  Calificacion {getSortIcon("calificacion")}
                </th>
                <th onClick={() => requestSort("correo")}>
                  Correo {getSortIcon("correo")}
                </th>
                <th onClick={() => requestSort("telefono")}>
                  Telefono {getSortIcon("telefono")}
                </th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedEndoses.map((endose) => (
                <tr key={endose.id_endose}>
                  <td>{endose.nombre_agencia || "N/A"}</td>
                  <td>{endose.zona || "N/A"}</td>
                  <td>{renderValoracion(endose.calificacion)}</td>
                  <td>{endose.correo}</td>
                  <td>{endose.telefono}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="action-button rating"
                        onClick={() => handleOpenValoracion(endose)}
                        title="Calificar endose"
                      >
                        <FaStar />
                      </button>
                      <button
                        className="action-button view"
                        onClick={() => handleViewTours(endose)}
                        title="Ver Tours"
                      >
                        <FaRoute />
                      </button>
                      <button
                        className="action-button edit"
                        onClick={() => handleEdit(endose)}
                        title="Editar"
                      >
                        <FaEdit />
                      </button>
                      <button
                        className="action-button delete"
                        onClick={() => handleDeleteClick(endose)}
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

      {/* Modal para crear endose */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Crear Nuevo Endose"
      >
        <EndoseForm onSubmit={handleCreate} isSubmitting={isSubmitting} />
      </Modal>

      {/* Modal para editar endose */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Editar Endose"
      >
        <EndoseForm
          endose={selectedEndose}
          onSubmit={handleUpdate}
          isSubmitting={isSubmitting}
        />
      </Modal>

      {/* Modal para eliminar endose */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Eliminar Endose"
        size="small"
      >
        <DeleteConfirmation
          entityName="este endose"
          entityData={selectedEndose}
          dependentEntities={dependentEntities}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
          isDeleting={isSubmitting}
        />
      </Modal>
      {/* Modal para valoración */}
      {showValoracionModal && (
        <ValoracionModal
          show={showValoracionModal}
          onClose={handleCloseValoracion}
          entity={selectedEntityForRating}
          entityType="endose"
          onSave={handleSaveValoracion}
        />
      )}
    </div>
  );
};

export default EndosesList;
