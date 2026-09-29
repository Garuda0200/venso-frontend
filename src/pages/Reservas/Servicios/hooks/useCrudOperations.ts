import { useState, useCallback } from "react";
import useAuditInfo from "./useAuditInfo";

const useCrudOperations = ({
  fetchAll,
  fetchById,
  create,
  update,
  remove,
  getDependencies,
}) => {
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [dependencies, setDependencies] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modales
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  // Cargar todos los elementos
  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAll();
      setItems(data);
    } catch (err) {
      setError(`Error al cargar datos: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [fetchAll]);

  // Crear elemento nuevo
  const handleCreate = useCallback(
    async (formData) => {
      try {
        setIsSubmitting(true);
        const dataWithAudit = {
          ...formData,
          created_by: userId,
        };

        await create(dataWithAudit);
        setShowCreateModal(false);
        await loadAll();
      } catch (err) {
        setError(`Error al crear: ${err.message}`);
      } finally {
        setIsSubmitting(false);
      }
    },
    [create, loadAll, userId],
  );

  // Seleccionar elemento para editar
  const handleSelectForEdit = useCallback((item) => {
    setSelectedItem(item);
    setShowEditModal(true);
  }, []);

  // Actualizar elemento
  const handleUpdate = useCallback(
    async (formData) => {
      try {
        if (!selectedItem) return;

        setIsSubmitting(true);
        const dataWithAudit = {
          ...formData,
          updated_by: userId,
        };

        await update(
          selectedItem.id ||
            selectedItem.id_hotel ||
            selectedItem.id_ticket ||
            selectedItem.id_transporte ||
            selectedItem.id_movilidad,
          dataWithAudit,
        );
        setShowEditModal(false);
        await loadAll();
      } catch (err) {
        setError(`Error al actualizar: ${err.message}`);
      } finally {
        setIsSubmitting(false);
      }
    },
    [selectedItem, update, loadAll, userId],
  );

  // Seleccionar elemento para eliminar
  const handleSelectForDelete = useCallback(
    async (item) => {
      try {
        setIsSubmitting(true);
        setSelectedItem(item);

        if (getDependencies) {
          const deps = await getDependencies(
            item.id ||
              item.id_hotel ||
              item.id_ticket ||
              item.id_transporte ||
              item.id_movilidad,
          );
          setDependencies(deps);
        }

        setShowDeleteModal(true);
      } catch (err) {
        setError(`Error al consultar dependencias: ${err.message}`);
      } finally {
        setIsSubmitting(false);
      }
    },
    [getDependencies],
  );

  // Eliminar elemento
  const handleDelete = useCallback(async () => {
    try {
      if (!selectedItem) return;

      setIsSubmitting(true);
      await remove(
        selectedItem.id ||
          selectedItem.id_hotel ||
          selectedItem.id_ticket ||
          selectedItem.id_transporte ||
          selectedItem.id_movilidad,
      );
      setShowDeleteModal(false);
      await loadAll();
    } catch (err) {
      setError(`Error al eliminar: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedItem, remove, loadAll]);

  // Seleccionar elemento para ver detalles
  const handleShowDetails = useCallback((item) => {
    setSelectedItem(item);
    setShowDetailsModal(true);
  }, []);

  return {
    // Estado
    items,
    selectedItem,
    dependencies,
    loading,
    error,
    isSubmitting,
    showCreateModal,
    showEditModal,
    showDeleteModal,
    showDetailsModal,

    // Setter de estado
    setItems,
    setError,
    setSelectedItem,
    setLoading,

    // Gestión de modales
    setShowCreateModal,
    setShowEditModal,
    setShowDeleteModal,
    setShowDetailsModal,

    // Operaciones
    loadAll,
    handleCreate,
    handleSelectForEdit,
    handleUpdate,
    handleSelectForDelete,
    handleDelete,
    handleShowDetails,
  };
};

export default useCrudOperations;
