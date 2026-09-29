/**
 * Panel colapsable de resumen de actividades.
 * Muestra barras de distribución por operación, entidad y participante.
 */
import { useMemo } from "react";
import { Card } from "primereact/card";
import { Tag } from "primereact/tag";
import { FaChartBar, FaChevronDown } from "react-icons/fa";
import { OPERATION_LABEL_MAP, ENTITY_LABEL_MAP } from "./logConstants";

export default function LogActivitySummary({ logs, expanded, setExpanded }) {
  const summary = useMemo(() => {
    if (!logs || logs.length === 0) return null;

    const byOperation = {};
    const byEntity = {};
    const byUser = {};

    for (const log of logs) {
      const opLabel =
        OPERATION_LABEL_MAP[log.operation_type] || log.operation_type;
      byOperation[opLabel] = (byOperation[opLabel] || 0) + 1;

      const entityLabel = ENTITY_LABEL_MAP[log.entity_type] || log.entity_type;
      byEntity[entityLabel] = (byEntity[entityLabel] || 0) + 1;

      const userName = log.user_fullname || log.dniuser || "Sistema";
      byUser[userName] = (byUser[userName] || 0) + 1;
    }

    return {
      byOperation: Object.entries(byOperation).sort((a, b) => b[1] - a[1]),
      byEntity: Object.entries(byEntity).sort((a, b) => b[1] - a[1]),
      byUser: Object.entries(byUser)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
    };
  }, [logs]);

  if (!summary) return null;

  const renderBars = (entries, cssClass) =>
    entries.map(([label, count]) => {
      const pct = logs.length > 0 ? (count / logs.length) * 100 : 0;
      return (
        <div key={label} className="summary-bar-row">
          <span className="bar-label">{label}</span>
          <div className="bar-track">
            <div
              className={`bar-fill ${cssClass}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="bar-count">{count}</span>
        </div>
      );
    });

  return (
    <Card className="summary-card-panel">
      <div
        className="summary-panel-header"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="summary-title">
          <FaChartBar className="summary-icon" />
          <span>Resumen de Actividades</span>
          <Tag
            value={`${logs.length} reg. en página`}
            severity="info"
            className="count-tag"
          />
        </div>
        <FaChevronDown className={`chevron ${expanded ? "expanded" : ""}`} />
      </div>

      <div className={`summary-content ${expanded ? "expanded" : ""}`}>
        <div className="summary-grid">
          <div className="summary-section">
            <h4>Por Tipo de Operación</h4>
            <div className="summary-bars">
              {renderBars(summary.byOperation, "operation-bar")}
            </div>
          </div>

          <div className="summary-section">
            <h4>Por Entidad</h4>
            <div className="summary-bars">
              {renderBars(summary.byEntity.slice(0, 10), "entity-bar")}
            </div>
          </div>

          <div className="summary-section full-width">
            <h4>Por Participante (Top 10)</h4>
            <div className="summary-bars">
              {renderBars(summary.byUser, "user-bar")}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
