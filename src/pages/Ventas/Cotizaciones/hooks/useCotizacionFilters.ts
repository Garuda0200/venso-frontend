import { useState, useMemo, useCallback } from "react";
import { matchesCotizacionSearch } from "../utils/cotizacionSearch";

function useCotizacionFilters(cotizaciones, { allowIdSearch = false } = {}) {
  // Estado para filtros
  const [filters, setFilters] = useState({
    fechaInicio: "",
    fechaFin: "",
    titulo: "",
    vendedor: "",
  });

  // Helper function to format dates to YYYY-MM-DD for comparison
  const formatDateForComparison = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toISOString().split("T")[0];
  };

  // Cotizaciones activas como base
  const activeCotizaciones = useMemo(() => {
    return cotizaciones.filter((c) => c.is_active === true);
  }, [cotizaciones]);

  // FILTRADO REACTIVO: se recalcula automáticamente cada vez que cambian los filtros o las cotizaciones
  const filteredCotizaciones = useMemo(() => {
    const hasAnyFilter =
      filters.titulo || filters.fechaInicio || filters.fechaFin || filters.vendedor;
    if (!hasAnyFilter) return activeCotizaciones;

    return activeCotizaciones.filter((cotizacion) => {
      // Filter by title
      if (
        filters.titulo &&
        !matchesCotizacionSearch(cotizacion, filters.titulo, { allowIdSearch })
      ) {
        return false;
      }

      // FOCUS ON TRAVEL DATES ONLY - Exact matching of travel dates
      const filterStartDate = formatDateForComparison(filters.fechaInicio);
      const filterEndDate = formatDateForComparison(filters.fechaFin);

      // Check filter by fechainicio
      if (filters.fechaInicio && filterStartDate) {
        const cotizacionStartDate = formatDateForComparison(
          cotizacion.fechainicio,
        );
        if (!cotizacionStartDate || cotizacionStartDate !== filterStartDate) {
          return false;
        }
      }

      // Check filter by fechafin
      if (filters.fechaFin && filterEndDate) {
        const cotizacionEndDate = formatDateForComparison(cotizacion.fechafin);
        if (!cotizacionEndDate || cotizacionEndDate !== filterEndDate) {
          return false;
        }
      }

      // Filter by seller (creator DNI)
      if (filters.vendedor) {
        const sellerDni =
          cotizacion.createdby || cotizacion.createdBy || "";
        if (sellerDni !== filters.vendedor) {
          return false;
        }
      }

      return true;
    });
  }, [activeCotizaciones, filters, allowIdSearch]);

  // Manejar cambios en los campos de filtro (ahora reactivo)
  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
  }, []);

  // handleSearch ahora es noop ya que el filtrado es reactivo, pero mantener para compatibilidad del form submit
  const handleSearch = useCallback((e) => {
    e.preventDefault();
    // El filtrado ya es reactivo via useMemo, no necesita acción adicional
  }, []);

  // Limpiar filtros
  const clearFilters = useCallback(() => {
    setFilters({
      fechaInicio: "",
      fechaFin: "",
      titulo: "",
      vendedor: "",
    });
  }, []);

  // Sort: updated_at desc (most recently edited first), fallback created_at desc
  const sortedCotizaciones = useMemo(() => {
    return [...filteredCotizaciones].sort((a, b) => {
      const dateA = new Date(
        a.updatedat || a.updatedAt || a.createdat || a.createdAt || 0,
      );
      const dateB = new Date(
        b.updatedat || b.updatedAt || b.createdat || b.createdAt || 0,
      );
      return dateB - dateA;
    });
  }, [filteredCotizaciones]);

  return {
    filters,
    filteredCotizaciones: sortedCotizaciones,
    handleInputChange,
    handleSearch,
    setFilters,
    setFilteredCotizaciones: () => {}, // Deprecated: filtrado es reactivo ahora
    clearFilters,
  };
}

// Export both as default and named export
export { useCotizacionFilters };
export default useCotizacionFilters;
