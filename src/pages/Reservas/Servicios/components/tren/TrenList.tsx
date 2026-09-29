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
  FaSubway,
} from "react-icons/fa";
import {
  fetchTrenes,
  createTren,
  updateTren,
  deleteTren,
  getTrenDependencies,
} from "../../services/api";
import Modal from "../Modal";
import TrenForm from "./TrenForm";
import DeleteConfirmation from "../DeleteConfirmation";
import useAuditInfo from "../../hooks/useAuditInfo";
import VagonesTrenList from "../vagon/VagonesTrenList";
import ValoracionModal from "../common/ValoracionModal";
const TrenList = () => {
  const [trenes, setTrenes] = useState([]);
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
  const [selectedTren, setSelectedTren] = useState(null);
  const [dependentEntities, setDependentEntities] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estado para ver vagones de un tren
  const [showVagonesTren, setShowVagonesTren] = useState(false);

  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  // Cargar datos
  useEffect(() => {
    loadTrenes();
  }, []);

  const loadTrenes = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchTrenes();
      setTrenes(data);
      setLoading(false);
    } catch (err) {
      setError("Error al cargar los trenes: " + err.message);
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
  const filteredAndSortedTrenes = React.useMemo(() => {
    let filtered = [...trenes];

    // Aplicar filtro de búsqueda
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (tren) =>
          tren.nombre_empresa.toLowerCase().includes(lowerSearchTerm) ||
          (tren.frecuencia &&
            tren.frecuencia.toLowerCase().includes(lowerSearchTerm)),
      );
    }

    // Aplicar ordenamiento
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aValue, bValue;
        if (sortConfig.key === "calificacion") {
          aValue = parseFloat(a.calificacion?.valoracion) || 0;
          bValue = parseFloat(b.calificacion?.valoracion) || 0;
        } else {
          aValue = a[sortConfig.key] || "";
          bValue = b[sortConfig.key] || "";
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
      filtered.sort((a, b) => {
        const califA = parseFloat(a.calificacion?.valoracion) || -1;
        const califB = parseFloat(b.calificacion?.valoracion) || -1;
        if (califB !== califA) return califB - califA;
        return (a.nombre_empresa || "").localeCompare(b.nombre_empresa || "");
      });
    }

    return filtered;
  }, [trenes, searchTerm, sortConfig]);

  // Handlers para CRUD con info de auditoría
  const handleCreate = async (formData) => {
    try {
      setIsSubmitting(true);
      if (formData === null) {
        setShowCreateModal(false);
        setIsSubmitting(false);
        return;
      }

      // Asegurarse de que formData incluye la información de auditoría
      const dataWithAudit = {
        ...formData,
        created_by: userId,
      };

      await createTren(dataWithAudit);
      setShowCreateModal(false);
      await loadTrenes();
      setIsSubmitting(false);
    } catch (error) {
      setError("Error al crear tren: " + error.message);
      setIsSubmitting(false);
    }
  };

  const handleEdit = (tren) => {
    setSelectedTren(tren);
    setShowEditModal(true);
  };

  const handleUpdate = async (formData) => {
    try {
      setIsSubmitting(true);
      // Si formData es null, significa que se canceló la operación
      if (formData === null) {
        setShowEditModal(false);
        setIsSubmitting(false);
        return;
      }

      // Asegurarse de que formData incluye la información de auditoría
      const dataWithAudit = {
        ...formData,
        updated_by: userId,
      };

      await updateTren(selectedTren.id_tren, dataWithAudit);
      setShowEditModal(false);
      await loadTrenes();
      setIsSubmitting(false);
    } catch (error) {
      setError("Error al actualizar tren: " + error.message);
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = async (tren) => {
    setSelectedTren(tren);
    setIsSubmitting(true);

    try {
      // Consultar entidades dependientes (vagones)
      const dependencies = await getTrenDependencies(tren.id_tren);
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
      await deleteTren(selectedTren.id_tren);
      setShowDeleteModal(false);
      await loadTrenes();
      setIsSubmitting(false);
    } catch (error) {
      setError("Error al eliminar tren: " + error.message);
      setIsSubmitting(false);
    }
  };

  const handleOpenValoracion = (tren) => {
    setSelectedEntityForRating(tren);
    setShowValoracionModal(true);
  };

  const handleCloseValoracion = () => {
    setShowValoracionModal(false);
    setSelectedEntityForRating(null);
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

      // Actualizar el tren con la nueva valoración
      const updateData = {
        calificacion: calificacionObj,
        updated_by: userId,
      };

      await updateTren(selectedEntityForRating.id_tren, updateData);

      handleCloseValoracion();
      await loadTrenes(); // Recargar para ver la nueva valoración
      setIsSubmitting(false);
    } catch (error) {
      console.error("Error al guardar valoración:", error);
      setError("Error al guardar la valoración: " + error.message);
      setIsSubmitting(false);
    }
  };

  const handleViewVagones = (tren) => {
    setSelectedTren(tren);
    setShowVagonesTren(true);
  };

  // Si estamos viendo los vagones de un tren
  if (showVagonesTren && selectedTren) {
    return (
      <VagonesTrenList
        tren={selectedTren}
        onBack={() => setShowVagonesTren(false)}
      />
    );
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Cargando trenes...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="header-with-actions">
        <h2>Lista de Trenes</h2>
        <button
          className="button button-primary"
          onClick={() => setShowCreateModal(true)}
        >
          <FaPlus style={{ marginRight: 8 }} /> Nuevo Tren
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
            placeholder="Buscar por nombre de empresa o frecuencia..."
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

      {/* Tabla de trenes */}
      {filteredAndSortedTrenes.length === 0 ? (
        <div className="alert info">
          No se encontraron trenes con el criterio de búsqueda.
        </div>
      ) : (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th onClick={() => requestSort("nombre_empresa")}>
                  Empresa {getSortIcon("nombre_empresa")}
                </th>
                <th onClick={() => requestSort("frecuencia")}>
                  Frecuencia {getSortIcon("frecuencia")}
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
              {filteredAndSortedTrenes.map((tren) => (
                <tr key={tren.id_tren}>
                  <td>{tren.nombre_empresa}</td>
                  <td>
                    {tren.frecuencia || (
                      <span className="text-muted">No especificada</span>
                    )}
                  </td>
                  <td>{renderValoracion(tren.calificacion)}</td>
                  <td>{tren.correo}</td>
                  <td>{tren.telefono}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="action-button rating"
                        onClick={() => handleOpenValoracion(tren)}
                        title="Calificar tren"
                      >
                        <FaStar />
                      </button>
                      <button
                        className="action-button view"
                        onClick={() => handleViewVagones(tren)}
                        title="Ver Vagones"
                      >
                        <FaSubway />
                      </button>
                      <button
                        className="action-button edit"
                        onClick={() => handleEdit(tren)}
                        title="Editar"
                      >
                        <FaEdit />
                      </button>
                      <button
                        className="action-button delete"
                        onClick={() => handleDeleteClick(tren)}
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

      {/* Modal para crear tren */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Crear Nuevo Tren"
      >
        <TrenForm onSubmit={handleCreate} isSubmitting={isSubmitting} />
      </Modal>

      {/* Modal para editar tren */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Editar Tren"
      >
        <TrenForm
          tren={selectedTren}
          onSubmit={handleUpdate}
          isSubmitting={isSubmitting}
        />
      </Modal>

      {/* Modal para eliminar tren */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Eliminar Tren"
        size="small"
      >
        <DeleteConfirmation
          entityName="este tren"
          entityData={selectedTren}
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
          entityType="tren"
          onSave={handleSaveValoracion}
        />
      )}
    </div>
  );
};

export default TrenList;
