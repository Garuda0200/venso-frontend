const DeleteConfirmation = ({
  entityName,
  entityData,
  dependentEntities,
  onConfirm,
  onCancel,
  isDeleting,
}) => {
  const hasDependencies =
    dependentEntities &&
    Object.values(dependentEntities).some((items) => items.length > 0);

  return (
    <div>
      <div className="delete-alert">
        <div className="alert-title">
          ¿Está seguro de eliminar {entityName}?
        </div>
        <p>Esta acción no se puede deshacer.</p>

        {entityData && (
          <div className="entity-summary">
            {Object.entries(entityData).map(([key, value]) => {
              // Filtrar campos relevantes y formatear para mostrar
              if (
                [
                  "id",
                  "created_at",
                  "created_by",
                  "updated_at",
                  "updated_by",
                ].includes(key)
              ) {
                return null;
              }
              return (
                <div key={key} className="entity-field">
                  <strong>{key}:</strong> {value ? value.toString() : "N/A"}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {hasDependencies && (
        <div className="delete-alert" style={{ marginTop: "16px" }}>
          <div className="alert-title">
            ¡Atención! Las siguientes entidades serán eliminadas en cascada:
          </div>

          {Object.entries(dependentEntities).map(([entityType, items]) => {
            if (items.length === 0) return null;

            return (
              <div key={entityType} style={{ marginTop: "8px" }}>
                <strong>
                  {entityType} ({items.length}):
                </strong>
                <div className="related-items">
                  {items.map((item, index) => (
                    <div key={index} className="item">
                      {item.nombre ||
                        item.empresa ||
                        item.tipo_habitacion ||
                        `${entityType} #${item.id || index + 1}`}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="button-group" style={{ marginTop: "16px" }}>
        <button
          className="button button-secondary"
          onClick={onCancel}
          disabled={isDeleting}
        >
          Cancelar
        </button>
        <button
          className="button button-danger"
          onClick={onConfirm}
          disabled={isDeleting}
        >
          {isDeleting ? "Eliminando..." : "Eliminar"}
        </button>
      </div>
    </div>
  );
};

export default DeleteConfirmation;
