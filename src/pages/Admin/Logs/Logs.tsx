/**
 * Logs — Componente orquestador principal.
 * Sigue principios SOLID: cada sub-componente y hook tiene una única responsabilidad.
 *
 * Estructura:
 * logConstants.js → Constantes y mapas de labels
 * logHelpers.js → Funciones de íconos y formateo
 * useLogData.js → Hook de carga lazy con filtros y paginación
 * useLogExport.js → Hook de exportación a Excel (exceljs, 5 hojas)
 * LogFilters.jsx → Panel de filtros colapsable
 * LogActivitySummary.jsx → Panel de resumen con barras
 * LogTable.jsx → DataTable con body templates
 * LogDetailsDialog.jsx → Diálogo de detalle individual
 */
import { useState, useRef } from "react";
import { Toast } from "primereact/toast";
import { FaServer } from "react-icons/fa";
import { useAuth } from "../../../context/AuthContext";

// Sub-componentes y hooks
import { useLogData } from "./useLogData";
import { useLogExport } from "./useLogExport";
import LogFilters from "./LogFilters";
import LogActivitySummary from "./LogActivitySummary";
import LogTable from "./LogTable";
import LogDetailsDialog from "./LogDetailsDialog";

import "./Logs.scss";

export function Logs() {
  const toast = useRef(null);
  const { getCurrentUser } = useAuth();
  const currentUser = getCurrentUser();

  // Data hook
  const {
    logs,
    loading,
    totalRecords,
    lazyParams,
    filters,
    setFilters,
    applyFilters,
    resetFilters,
    refresh,
    onPage,
    onSort,
    fetchAllForExport,
  } = useLogData(currentUser?.role, currentUser?.sub);

  // Export hook
  const { exportLoading, exportToExcel } = useLogExport(
    fetchAllForExport,
    toast,
  );

  // UI states
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="logs-container">
      <Toast ref={toast} position="bottom-right" />

      {/* Header */}
      <div className="page-header">
        <div className="header-content">
          <div className="header-info">
            <h1>
              <FaServer className="header-icon" />
              Logs de Actividad
            </h1>
            <p>Monitoreo y auditoría completa de actividades del sistema</p>
          </div>
          <div className="header-stats">
            <div className="stat-item">
              <span className="stat-number">
                {totalRecords.toLocaleString()}
              </span>
              <span className="stat-label">Registros Totales</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <LogFilters
        filters={filters}
        setFilters={setFilters}
        applyFilters={applyFilters}
        resetFilters={resetFilters}
        exportToExcel={exportToExcel}
        exportLoading={exportLoading}
        loading={loading}
        totalRecords={totalRecords}
        filtersExpanded={filtersExpanded}
        setFiltersExpanded={setFiltersExpanded}
      />

      {/* Resumen */}
      <LogActivitySummary
        logs={logs}
        expanded={summaryExpanded}
        setExpanded={setSummaryExpanded}
      />

      {/* Tabla */}
      <LogTable
        logs={logs}
        loading={loading}
        totalRecords={totalRecords}
        lazyParams={lazyParams}
        onPage={onPage}
        onSort={onSort}
        refresh={refresh}
        onViewDetails={(log) => {
          setSelectedLog(log);
          setShowDetails(true);
        }}
        exportLoading={exportLoading}
      />

      {/* Diálogo de detalles */}
      <LogDetailsDialog
        log={selectedLog}
        visible={showDetails}
        onHide={() => setShowDetails(false)}
      />
    </div>
  );
}

export default Logs;
