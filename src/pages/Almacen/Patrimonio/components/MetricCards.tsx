import {
  FaExclamationTriangle,
  FaLayerGroup,
  FaLink,
  FaUnlink,
} from "react-icons/fa";

export default function MetricCards({ summary }) {
  const attention = Number(summary.mantenimiento || 0) + Number(summary.observados || 0);
  const metrics = [
    {
      key: "active",
      icon: <FaLayerGroup />,
      label: "Bienes activos",
      value: summary.activos || 0,
      detail: `${summary.categorias || 0} categorías`,
    },
    {
      key: "assigned",
      icon: <FaLink />,
      label: "Con responsable",
      value: summary.asignados || 0,
      detail: "Asignación vigente",
    },
    {
      key: "unassigned",
      icon: <FaUnlink />,
      label: "Sin asignar",
      value: summary.sin_asignar || 0,
      detail: "Disponibles en almacén",
    },
    {
      key: "attention",
      icon: <FaExclamationTriangle />,
      label: "Requieren atención",
      value: attention,
      detail: `${summary.mantenimiento || 0} mantenimiento · ${summary.observados || 0} observados`,
    },
  ];

  return (
    <section className="patrimonio-metrics" aria-label="Resumen patrimonial">
      {metrics.map((metric) => (
        <article key={metric.key} className={`patrimonio-metric metric-${metric.key}`}>
          <div className="patrimonio-metric-icon">{metric.icon}</div>
          <div className="patrimonio-metric-body">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </div>
        </article>
      ))}
    </section>
  );
}
