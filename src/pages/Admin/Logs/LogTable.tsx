/**
 * Componente DataTable de logs con templates personalizados.
 * Principio Abierto/Cerrado: los body templates se inyectan como funciones puras.
 */
import { useRef } from "react";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { Card } from "primereact/card";
import { Tag } from "primereact/tag";
import { ProgressSpinner } from "primereact/progressspinner";
import {
  FaCalendarAlt,
  FaUser,
  FaCheck,
  FaExclamationCircle,
} from "react-icons/fa";
import {
  OPERATION_LABEL_MAP,
  ENTITY_LABEL_MAP,
  ROLE_LABEL_MAP,
  ROLE_COLORS,
} from "./logConstants";
import { getOperationIcon, getEntityIcon } from "./logHelpers";

// ============== BODY TEMPLATES ==============

function operationBodyTemplate(rowData) {
  const label =
    OPERATION_LABEL_MAP[rowData.operation_type] || rowData.operation_type;
  return (
    <div className="operation-cell">
      {getOperationIcon(rowData.operation_type)}
      <span>{label}</span>
    </div>
  );
}

function entityBodyTemplate(rowData) {
  const label = ENTITY_LABEL_MAP[rowData.entity_type] || rowData.entity_type;
  return (
    <div className="entity-cell">
      {getEntityIcon(rowData.entity_type)}
      <span>{label}</span>
    </div>
  );
}

function userBodyTemplate(rowData) {
  const displayName =
    rowData.user_fullname ||
    (rowData.dniuser ? `Usuario (${rowData.dniuser})` : "Sistema");
  return (
    <div className="user-cell">
      <FaUser className="user-icon" />
      <span>{displayName}</span>
    </div>
  );
}

function roleBodyTemplate(rowData) {
  const role = rowData.user_role;
  if (role === null || role === undefined)
    return <span className="text-muted">—</span>;
  const label = ROLE_LABEL_MAP[role] || `Rol ${role}`;
  const colorInfo = ROLE_COLORS[role] || {};
  const severity = colorInfo.severity || null;
  return <Tag severity={severity} value={label} />;
}

function statusBodyTemplate(rowData) {
  const severity = rowData.status ? "success" : "danger";
  const icon = rowData.status ? (
    <FaCheck className="status-icon" />
  ) : (
    <FaExclamationCircle className="status-icon" />
  );
  return (
    <Tag
      severity={severity}
      value={
        <span className="status-tag-content">
          {icon} {rowData.statusText}
        </span>
      }
    />
  );
}

function dateBodyTemplate(rowData) {
  return (
    <div className="date-cell">
      <FaCalendarAlt className="date-icon" />
      <span>{rowData.formattedDate}</span>
    </div>
  );
}

// ============== COMPONENTE PRINCIPAL ==============

export default function LogTable({
  logs,
  loading,
  totalRecords,
  lazyParams,
  onPage,
  onSort,
  refresh,
  onViewDetails,
  exportLoading,
}) {
  const dt = useRef(null);

  const actionBodyTemplate = (rowData) => (
    <div className="action-buttons">
      <Button
        icon="pi pi-eye"
        className="p-button-rounded p-button-info p-button-sm view-details-btn"
        onClick={() => onViewDetails(rowData)}
        tooltip="Ver detalles"
        tooltipOptions={{ position: "top" }}
      />
    </div>
  );

  return (
    <Card className="data-card">
      <DataTable
        ref={dt}
        value={logs}
        lazy
        paginator
        rows={lazyParams.rows}
        totalRecords={totalRecords}
        first={lazyParams.first}
        onPage={onPage}
        onSort={onSort}
        sortField={lazyParams.sortField}
        sortOrder={lazyParams.sortOrder}
        rowsPerPageOptions={[10, 20, 50, 100]}
        loading={loading}
        emptyMessage="No se encontraron registros de actividad"
        className="logs-table"
        rowClassName={(data) => ({ "error-row": !data.status })}
        paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport RowsPerPageDropdown"
        currentPageReportTemplate="Mostrando {first} a {last} de {totalRecords} registros"
        header={
          <div className="table-header">
            <span className="table-title">Registros de Actividad</span>
            <div className="table-header-actions">
              <Button
                icon="pi pi-refresh"
                className="p-button-rounded p-button-text p-button-sm"
                onClick={refresh}
                tooltip="Recargar"
                tooltipOptions={{ position: "top" }}
                disabled={loading}
              />
            </div>
          </div>
        }
      >
        <Column
          field="operation_type"
          header="Operación"
          sortable
          style={{ width: "12%" }}
          body={operationBodyTemplate}
        />
        <Column
          field="entity_type"
          header="Entidad"
          sortable
          style={{ width: "14%" }}
          body={entityBodyTemplate}
        />
        <Column
          field="dniuser"
          header="Usuario"
          sortable
          style={{ width: "16%" }}
          body={userBodyTemplate}
        />
        <Column
          field="user_role"
          header="Rol"
          sortable
          style={{ width: "10%" }}
          body={roleBodyTemplate}
        />
        <Column
          field="status"
          header="Estado"
          sortable
          style={{ width: "8%" }}
          body={statusBodyTemplate}
        />
        <Column
          field="action_timestamp"
          header="Fecha y Hora"
          sortable
          style={{ width: "18%" }}
          body={dateBodyTemplate}
        />
        <Column
          body={actionBodyTemplate}
          exportable={false}
          style={{ width: "8%", textAlign: "center" }}
          header="Acciones"
        />
      </DataTable>

      {(loading || exportLoading) && (
        <div className="global-loading">
          <ProgressSpinner
            style={{ width: "50px", height: "50px" }}
            strokeWidth="4"
            animationDuration=".5s"
          />
          <span>
            {exportLoading ? "Exportando datos..." : "Cargando logs..."}
          </span>
        </div>
      )}
    </Card>
  );
}
