const EntidadIconView = ({ entidades, onSelectEntidad }) => {
  return (
    <div className="entity-grid">
      {entidades.map((entidad) => (
        <div
          key={entidad.id}
          className="entity-card"
          onClick={() => onSelectEntidad(entidad.id)}
        >
          <div className="icon-container">{entidad.icon}</div>
          <h3>{entidad.name}</h3>
          <p>{entidad.description}</p>
        </div>
      ))}
    </div>
  );
};

export default EntidadIconView;
