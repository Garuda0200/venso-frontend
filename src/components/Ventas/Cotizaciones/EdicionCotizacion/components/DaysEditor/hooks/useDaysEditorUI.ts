/**
 * Custom hook for managing DaysEditor UI state
 * Following Single Responsibility Principle
 */
import { useState, useCallback } from "react";

/**
 * Hook for managing expanded days and delete confirmations
 * All days start expanded by default (collapsedDays starts empty).
 * @returns {Object} UI state and handlers
 */
export const useDaysEditorUI = () => {
  // Track collapsed days — empty Set means all expanded
  const [collapsedDays, setCollapsedDays] = useState(new Set());

  // Delete confirmation modal state
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [dayToDelete, setDayToDelete] = useState(null);

  /**
   * Check if a day is expanded
   * @param {number} dayIndex
   * @returns {boolean}
   */
  const isDayExpanded = useCallback(
    (dayIndex) => {
      return !collapsedDays.has(dayIndex);
    },
    [collapsedDays],
  );

  /**
   * Toggle day expansion
   * @param {number} dayIndex - Index of day to toggle
   */
  const toggleDayExpansion = useCallback((dayIndex) => {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayIndex)) next.delete(dayIndex);
      else next.add(dayIndex);
      return next;
    });
  }, []);

  /**
   * Expand a specific day
   * @param {number} dayIndex - Index of day to expand
   */
  const expandDay = useCallback((dayIndex) => {
    setCollapsedDays((prev) => {
      if (!prev.has(dayIndex)) return prev;
      const next = new Set(prev);
      next.delete(dayIndex);
      return next;
    });
  }, []);

  /**
   * Collapse all days
   */
  const collapseAllDays = useCallback((totalDays) => {
    const all = new Set();
    for (let i = 0; i < (totalDays || 50); i++) all.add(i);
    setCollapsedDays(all);
  }, []);

  /**
   * Request day deletion (opens confirmation)
   * @param {number} dayIndex - Index of day to delete
   */
  const requestDeleteDay = useCallback((dayIndex) => {
    setDayToDelete(dayIndex);
    setShowDeleteConfirmation(true);
  }, []);

  /**
   * Confirm day deletion
   * @returns {number|null} Index of day to delete
   */
  const confirmDeleteDay = useCallback(() => {
    const index = dayToDelete;
    setShowDeleteConfirmation(false);
    setDayToDelete(null);
    return index;
  }, [dayToDelete]);

  /**
   * Cancel day deletion
   */
  const cancelDeleteDay = useCallback(() => {
    setShowDeleteConfirmation(false);
    setDayToDelete(null);
  }, []);

  /**
   * Update collapsed days after drag reorder
   * @param {number} oldIndex - Original index of moved day
   * @param {number} newIndex - New index of moved day
   */
  const updateExpandedDayAfterReorder = useCallback((oldIndex, newIndex) => {
    setCollapsedDays((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set();
      for (const idx of prev) {
        let newIdx = idx;
        if (idx === oldIndex) {
          newIdx = newIndex;
        } else if (oldIndex < newIndex && idx > oldIndex && idx <= newIndex) {
          newIdx = idx - 1;
        } else if (oldIndex > newIndex && idx < oldIndex && idx >= newIndex) {
          newIdx = idx + 1;
        }
        next.add(newIdx);
      }
      return next;
    });
  }, []);

  /**
   * Remove a day index from collapsed tracking and shift higher indices
   */
  const removeDayFromCollapsed = useCallback((deletedIndex) => {
    setCollapsedDays((prev) => {
      const next = new Set();
      for (const idx of prev) {
        if (idx === deletedIndex) continue;
        next.add(idx > deletedIndex ? idx - 1 : idx);
      }
      return next;
    });
  }, []);

  return {
    // State
    isDayExpanded,
    collapsedDays,
    showDeleteConfirmation,
    dayToDelete,

    // Expansion handlers
    toggleDayExpansion,
    expandDay,
    collapseAllDays,

    // Delete handlers
    requestDeleteDay,
    confirmDeleteDay,
    cancelDeleteDay,

    // Utility
    updateExpandedDayAfterReorder,
    removeDayFromCollapsed,

    // Direct setters
    setCollapsedDays,
    setShowDeleteConfirmation,
    setDayToDelete,
  };
};

export default useDaysEditorUI;
