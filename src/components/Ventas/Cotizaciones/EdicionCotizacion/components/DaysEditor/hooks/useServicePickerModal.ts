/**
 * Custom hook for managing service selection modals
 * Following Single Responsibility Principle
 */
import { useState, useCallback } from "react";

/**
 * Hook for managing category/service picker modal state
 * @returns {Object} Modal state and handlers
 */
export const useServicePickerModal = () => {
  // Category modal state
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  // Passenger selection state
  const [paxModalOpen, setPaxModalOpen] = useState(false);
  const [pendingSelection, setPendingSelection] = useState(null);

  /**
   * Open category modal for a specific day
   * @param {number} dayIndex - Index of the day
   * @param {string} categoryId - Selected category ID
   * @param {number} prevLen - Previous number of services (for detecting new additions)
   */
  const openCategoryModal = useCallback(
    (dayIndex, categoryId = null, prevLen = 0) => {
      setPendingSelection({
        mode: "addService",
        dayIndex,
        categoryId,
        prevLen,
      });
      setCategoryModalOpen(true);
    },
    [],
  );

  /**
   * Close category modal
   */
  const closeCategoryModal = useCallback(() => {
    setCategoryModalOpen(false);
  }, []);

  /**
   * Open passenger modal for selecting passengers for a service
   * @param {Object} params - Selection parameters
   */
  const openPassengerModal = useCallback((params) => {
    setPendingSelection(params);
    setPaxModalOpen(true);
  }, []);

  /**
   * Open passenger modal for editing existing service passengers
   * @param {number} dayIndex - Day index
   * @param {number} serviceIndex - Service index
   * @param {Object} service - Service object
   * @param {number} prevLen - Previous services length
   */
  const openPassengerModalForEdit = useCallback(
    (dayIndex, serviceIndex, service, prevLen) => {
      setPendingSelection({
        mode: "editService",
        dayIndex,
        serviceIndex,
        preselectedIds: service?.assignedPassengerIds || [],
        prevLen,
      });
      setPaxModalOpen(true);
    },
    [],
  );

  /**
   * Close passenger modal
   */
  const closePassengerModal = useCallback(() => {
    setPaxModalOpen(false);
  }, []);

  /**
   * Clear pending selection
   */
  const clearPendingSelection = useCallback(() => {
    setPendingSelection(null);
  }, []);

  /**
   * Reset all modal states
   */
  const resetModals = useCallback(() => {
    setCategoryModalOpen(false);
    setPaxModalOpen(false);
    setPendingSelection(null);
  }, []);

  return {
    // State
    categoryModalOpen,
    paxModalOpen,
    pendingSelection,

    // Handlers
    openCategoryModal,
    closeCategoryModal,
    openPassengerModal,
    openPassengerModalForEdit,
    closePassengerModal,
    clearPendingSelection,
    resetModals,

    // Direct setters for advanced use
    setCategoryModalOpen,
    setPaxModalOpen,
    setPendingSelection,
  };
};

export default useServicePickerModal;
