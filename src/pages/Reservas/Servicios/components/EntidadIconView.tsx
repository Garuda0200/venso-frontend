import type { ReactNode } from "react";

interface EntidadIconViewProps {
  entidades: Array<{ id: string; name: string; description: string; icon: ReactNode }>;
  onSelectEntidad: (id: string) => void;
}

const EntidadIconView = ({ entidades, onSelectEntidad }: EntidadIconViewProps) => {
  return (
    <div className="entity-grid">
      {entidades.map((entidad) => (
        <button
          type="button"
          key={entidad.id}
          className="entity-card"
          onClick={() => onSelectEntidad(entidad.id)}
        >
          <span className="icon-container" aria-hidden="true">{entidad.icon}</span>
          <span className="entity-card__copy"><strong>{entidad.name}</strong><span>{entidad.description}</span></span>
          <span className="entity-card__arrow" aria-hidden="true">→</span>
        </button>
      ))}
    </div>
  );
};

export default EntidadIconView;
