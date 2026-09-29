import { MdOutlineConstruction } from "react-icons/md";

import "./DashboardPlaceholder.scss";

type DashboardPlaceholderProps = {
  section: string;
  description?: string;
};

export function DashboardPlaceholder({
  section,
  description = "Este espacio se encuentra reservado para la siguiente implementación.",
}: DashboardPlaceholderProps) {
  return (
    <main className="dashboard-placeholder" aria-labelledby="dashboard-placeholder-title">
      <div className="dashboard-placeholder__content">
        <span className="dashboard-placeholder__eyebrow">Dashboard</span>
        <span className="dashboard-placeholder__icon" aria-hidden="true">
          <MdOutlineConstruction />
        </span>
        <h1 id="dashboard-placeholder-title">{section}</h1>
        <p>{description}</p>
        <span className="dashboard-placeholder__status">Por implementar</span>
      </div>
    </main>
  );
}

export default DashboardPlaceholder;
