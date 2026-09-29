// Domain: Tipos y lógica de negocio para filtros de pagos por lote
export const DateFilterDomain = {
  /**
   * Crear filtro por rango de fechas
   * @param {Date} startDate - Fecha inicial
   * @param {Date} endDate - Fecha final
   * @returns {Object} Filtro válido
   */
  createDateRangeFilter(startDate, endDate) {
    if (startDate && endDate && startDate > endDate) {
      throw new Error("La fecha inicial no puede ser mayor que la fecha final");
    }

    return {
      startDate: startDate || null,
      endDate: endDate || null,
      isActive: !!(startDate || endDate),
    };
  },

  /**
   * Aplicar filtro de fechas a lista de payment requests
   * @param {Array} paymentRequests - Lista de payment requests
   * @param {Object} dateFilter - Filtro de fechas
   * @returns {Array} Lista filtrada
   */
  applyDateFilter(paymentRequests, dateFilter) {
    if (!dateFilter.isActive) {
      return paymentRequests;
    }

    return paymentRequests.filter((pr) => {
      if (!pr.created_at) return false;

      const prDate = new Date(pr.created_at);
      const start = dateFilter.startDate
        ? new Date(dateFilter.startDate)
        : null;
      const end = dateFilter.endDate ? new Date(dateFilter.endDate) : null;

      // Ajustar end date para incluir todo el día
      if (end) {
        end.setHours(23, 59, 59, 999);
      }

      if (start && end) {
        return prDate >= start && prDate <= end;
      } else if (start) {
        return prDate >= start;
      } else if (end) {
        return prDate <= end;
      }

      return true;
    });
  },

  /**
   * Formatear fecha para display
   * @param {Date} date - Fecha
   * @returns {string} Fecha formateada
   */
  formatDate(date) {
    if (!date) return "";
    return date.toISOString().split("T")[0];
  },
};
