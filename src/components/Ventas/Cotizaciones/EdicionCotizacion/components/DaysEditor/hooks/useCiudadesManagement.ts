/**
 * Custom hook for managing cities modal state
 * Following Single Responsibility Principle
 */
import { useState, useCallback } from "react";

/**
 * Hook for managing cities selection modal
 * @param {Function} updateDayCities - Function to update cities for a day
 * @returns {Object} Modal state and handlers
 */
export const useCiudadesManagement = (updateDayCities) => {
  // Modal visibility state
  const [showCiudadesModal, setShowCiudadesModal] = useState(false);

  // Currently selected day index for city editing
  const [ciudadesDayIndex, setCiudadesDayIndex] = useState(null);

  /**
   * Open cities modal for a specific day
   * @param {number} dayIndex - Index of the day to edit cities for
   */
  const openCiudadesModal = useCallback((dayIndex) => {
    setCiudadesDayIndex(dayIndex);
    setShowCiudadesModal(true);
  }, []);

  /**
   * Close cities modal
   */
  const closeCiudadesModal = useCallback(() => {
    setShowCiudadesModal(false);
    setCiudadesDayIndex(null);
  }, []);

  /**
   * Save selected cities and close modal
   * @param {Array} selectedCities - Array of selected city names
   */
  const saveCiudades = useCallback(
    (selectedCities) => {
      if (ciudadesDayIndex !== null && updateDayCities) {
        updateDayCities(ciudadesDayIndex, selectedCities);
      }
      closeCiudadesModal();
    },
    [ciudadesDayIndex, updateDayCities, closeCiudadesModal],
  );

  /**
   * Toggle city selection for current day
   * @param {string} cityName - Name of city to toggle
   * @param {Array} currentCities - Current cities array
   */
  const toggleCity = useCallback((cityName, currentCities = []) => {
    const isSelected = currentCities.includes(cityName);
    if (isSelected) {
      return currentCities.filter((c) => c !== cityName);
    } else {
      return [...currentCities, cityName];
    }
  }, []);

  /**
   * Clear all cities from current selection
   */
  const clearAllCities = useCallback(() => {
    return [];
  }, []);

  return {
    // State
    showCiudadesModal,
    ciudadesDayIndex,

    // Handlers
    openCiudadesModal,
    closeCiudadesModal,
    saveCiudades,
    toggleCity,
    clearAllCities,

    // Setters (for direct control if needed)
    setShowCiudadesModal,
    setCiudadesDayIndex,
  };
};

export default useCiudadesManagement;
