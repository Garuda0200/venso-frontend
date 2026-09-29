import {
  FaCalendarAlt,
  FaEdit,
  FaEye,
  FaMapMarkerAlt,
  FaTrash,
  FaUserFriends,
} from "react-icons/fa";
import BarcodeLabel from "./BarcodeLabel";
import {
  formatDate,
  itemLocation,
  itemName,
  itemSpecifications,
  itemState,
  primaryResponsibleLabel,
  stateLabel,
} from "../utils";

export default function ItemsMobileCards({ items, onView, onEdit, onDelete }) {
  if (items.length === 0) {
    return <div className="patrimonio-empty-card">No existen bienes para los filtros aplicados.</div>;
  }

  return (
    <div className="patrimonio-mobile-list">
      {items.map((item) => {
        const state = itemState(item);
        const specs = itemSpecifications(item);
        return (
          <article
            key={item.id}
            className={`patrimonio-mobile-card ${!item.is_active ? "inactive" : ""}`}
          >
            <div className="patrimonio-mobile-card-header">
              <div>
                <span className="patrimonio-item-category">{item.categoria}</span>
                <h4>{itemName(item)}</h4>
              </div>
              <span className={`patrimonio-status status-${state}`}>{stateLabel(state)}</span>
            </div>

            <button
              type="button"
              className="patrimonio-mobile-barcode"
              onClick={() => onView(item)}
            >
              <BarcodeLabel code={item.codigo} compact />
            </button>

            <div className="patrimonio-mobile-card-body">
              <div className="patrimonio-mobile-card-full">
                <span><FaUserFriends /> Responsable</span>
                <strong>{primaryResponsibleLabel(item)}</strong>
              </div>
              <div>
                <span><FaMapMarkerAlt /> Ubicación</span>
                <strong>{itemLocation(item) || "Sin ubicación"}</strong>
              </div>
              <div>
                <span><FaCalendarAlt /> Actualización</span>
                <strong>{formatDate(item.updated_at || item.created_at)}</strong>
              </div>
              {specs && (
                <div className="patrimonio-mobile-card-full">
                  <span>Características</span>
                  <strong>{specs}</strong>
                </div>
              )}
            </div>

            <div className="patrimonio-mobile-card-footer">
              <button type="button" onClick={() => onView(item)}><FaEye /> Ficha</button>
              <button type="button" onClick={() => onEdit(item)}><FaEdit /> Editar</button>
              {item.is_active && (
                <button type="button" className="danger" onClick={() => onDelete(item)}>
                  <FaTrash /> Desactivar
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
