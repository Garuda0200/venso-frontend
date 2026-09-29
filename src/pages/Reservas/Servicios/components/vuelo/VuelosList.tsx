import React, { useState, useEffect } from "react";
import {
  FaSearch,
  FaSort,
  FaSortUp,
  FaSortDown,
  FaEdit,
  FaStar,
  FaTrashAlt,
  FaPlus,
  FaPlane,
} from "react-icons/fa";
import {
  fetchVuelos,
  createVuelo,
  updateVuelo,
  deleteVuelo,
  getVueloDependencies,
} from "../../services/api";
import Modal from "../Modal";
import VueloForm from "./VueloForm";
import DeleteConfirmation from "../DeleteConfirmation";
import useAuditInfo from "../../hooks/useAuditInfo";
import TipoVuelosVueloList from "../tipo_vuelo/TipoVuelosVueloList";
import ValoracionModal from "../common/ValoracionModal";

const VuelosList = () => {
  const [vuelos, setVuelos] = useState([]);
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
  const [selectedVuelo, setSelectedVuelo] = useState(null);
  const [dependentEntities, setDependentEntities] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Nuevo estado para ver tipos de vuelo
  const [showTiposVuelo, setShowTiposVuelo] = useState(false);

  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  // Cargar datos
  useEffect(() => {
    loadVuelos();
  }, []);

  const loadVuelos = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchVuelos();
      setVuelos(data);
      setLoading(false);
    } catch (err) {
      setError("Error al cargar los vuelos: " + err.message);
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
  const filteredAndSortedVuelos = React.useMemo(() => {
    let filtered = [...vuelos];

    // Aplicar filtro de búsqueda - solo por campos que existen en el nuevo schema
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (vuelo) =>
          vuelo.nombre?.toLowerCase().includes(lowerSearchTerm) ||
          vuelo.procedencia?.toLowerCase().includes(lowerSearchTerm) ||
          vuelo.correo?.toLowerCase().includes(lowerSearchTerm),
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
        return (a.nombre || "").localeCompare(b.nombre || "");
      });
    }

    return filtered;
  }, [vuelos, searchTerm, sortConfig]);

  // Handlers para CRUD con info de auditoría
  const handleCreate = async (formData) => {
    try {
      setIsSubmitting(true);
      // Asegurarse de que formData incluye la información de auditoría
      const dataWithAudit = {
        ...formData,
        created_by: userId,
      };

      await createVuelo(dataWithAudit);
      setShowCreateModal(false);
      await loadVuelos();
      setIsSubmitting(false);
    } catch (error) {
      setError("Error al crear vuelo: " + error.message);
      setIsSubmitting(false);
    }
  };

  const handleEdit = (vuelo) => {
    setSelectedVuelo(vuelo);
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

      await updateVuelo(selectedVuelo.id_vuelo, dataWithAudit);
      setShowEditModal(false);
      await loadVuelos();
      setIsSubmitting(false);
    } catch (error) {
      setError("Error al actualizar vuelo: " + error.message);
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = async (vuelo) => {
    setSelectedVuelo(vuelo);
    setIsSubmitting(true);

    try {
      // Consultar entidades dependientes
      const dependencies = await getVueloDependencies(vuelo.id_vuelo);
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
      await deleteVuelo(selectedVuelo.id_vuelo);
      setShowDeleteModal(false);
      await loadVuelos();
      setIsSubmitting(false);
    } catch (error) {
      setError("Error al eliminar vuelo: " + error.message);
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

      await updateVuelo(selectedEntityForRating.id_vuelo, updateData);

      handleCloseValoracion();
      await loadVuelos(); // Recargar para ver la nueva valoración
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

  // Nueva función para manejar la acción de ver tipos de vuelo
  const handleViewTiposVuelo = (vuelo) => {
    setSelectedVuelo(vuelo);
    setShowTiposVuelo(true);
  };

  // Si estamos viendo los tipos de vuelo
  if (showTiposVuelo && selectedVuelo) {
    return (
      <TipoVuelosVueloList
        vuelo={selectedVuelo}
        onBack={() => setShowTiposVuelo(false)}
      />
    );
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Cargando vuelos...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="header-with-actions">
        <h2>Lista de Vuelos</h2>
        <button
          className="button button-primary"
          onClick={() => setShowCreateModal(true)}
        >
          <FaPlus style={{ marginRight: 8 }} /> Nuevo Vuelo
        </button>
      </div>

      {error && <div className="alert danger">{error}</div>}

      {/* Barra de búsqueda */}
      <div className="search-container">
        <div style={{ display: "flex", flex: 1 }}>
          <div className="search-icon-container">
            <FaSearch />
          </div>
          <input
            className="search-input"
            placeholder="Buscar por nombre, código o destinos..."
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

      {/* Tabla de vuelos */}
      {filteredAndSortedVuelos.length === 0 ? (
        <div className="alert info">
          No se encontraron vuelos con el criterio de búsqueda.
        </div>
      ) : (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th onClick={() => requestSort("nombre")}>
                  Aerolínea {getSortIcon("nombre")}
                </th>
                <th onClick={() => requestSort("procedencia")}>
                  Procedencia {getSortIcon("procedencia")}
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
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedVuelos.map((vuelo) => (
                <tr key={vuelo.id_vuelo}>
                  <td>{vuelo.nombre}</td>
                  <td>{vuelo.procedencia || "-"}</td>
                  <td>{renderValoracion(vuelo.calificacion)}</td>
                  <td>{vuelo.telefono || "-"}</td>
                  <td>{vuelo.correo || "-"}</td>

                  <td>
                    <div className="action-buttons">
                      <button
                        className="action-button rating"
                        onClick={() => handleOpenValoracion(vuelo)}
                        title="Calificar vuelo"
                      >
                        <FaStar />
                      </button>
                      <button
                        className="action-button view"
                        onClick={() => handleViewTiposVuelo(vuelo)}
                        title="Ver Tipos de Vuelo"
                      >
                        <FaPlane />
                      </button>
                      <button
                        className="action-button edit"
                        onClick={() => handleEdit(vuelo)}
                        title="Editar"
                      >
                        <FaEdit />
                      </button>
                      <button
                        className="action-button delete"
                        onClick={() => handleDeleteClick(vuelo)}
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

      {/* Modales */}
      {/* Modal para crear vuelo */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Crear Nuevo Vuelo"
      >
        <VueloForm onSubmit={handleCreate} isSubmitting={isSubmitting} />
      </Modal>

      {/* Modal para editar vuelo */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Editar Vuelo"
      >
        <VueloForm
          vuelo={selectedVuelo}
          onSubmit={handleUpdate}
          isSubmitting={isSubmitting}
        />
      </Modal>

      {/* Modal para eliminar vuelo */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Eliminar Vuelo"
        size="small"
      >
        <DeleteConfirmation
          entityName="este vuelo"
          entityData={selectedVuelo}
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
          entityType="vuelo"
          onSave={handleSaveValoracion}
        />
      )}
    </div>
  );
};

export default VuelosList;
