import {
  FaCalendarAlt,
  FaEdit,
  FaEye,
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

export default function ItemsTable({ items, onView, onEdit, onDelete }) {
  return (
    <div className="patrimonio-table-card">
      <table className="patrimonio-table">
        <thead>
          <tr>
            <th>Código Code 128</th>
            <th>Bien patrimonial</th>
            <th>Responsable actual</th>
            <th>Ubicación</th>
            <th>Estado</th>
            <th>Actualización</th>
            <th className="patrimonio-actions-col" />
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan="7" className="patrimonio-empty">
                No existen bienes para los filtros aplicados.
              </td>
            </tr>
          )}
          {items.map((item) => {
            const state = itemState(item);
            const specs = itemSpecifications(item);
            return (
              <tr key={item.id} className={!item.is_active ? "inactive" : ""}>
                <td>
                  <button
                    className="patrimonio-barcode-button"
                    type="button"
                    onClick={() => onView(item)}
                    title="Abrir ficha patrimonial"
                  >
                    <BarcodeLabel code={item.codigo} compact />
                  </button>
                </td>
                <td>
                  <div className="patrimonio-item-name">{itemName(item)}</div>
                  <div className="patrimonio-item-category">{item.categoria || "Sin categoría"}</div>
                  {specs && <div className="patrimonio-item-meta">{specs}</div>}
                </td>
                <td>
                  <span className="patrimonio-responsible-cell">
                    <FaUserFriends /> {primaryResponsibleLabel(item)}
                  </span>
                </td>
                <td>{itemLocation(item) || "Sin ubicación"}</td>
                <td>
                  <span className={`patrimonio-status status-${state}`}>
                    {stateLabel(state)}
                  </span>
                  {!item.is_active && <small className="patrimonio-inactive-label">Inactivo</small>}
                </td>
                <td>
                  <span className="patrimonio-date">
                    <FaCalendarAlt /> {formatDate(item.updated_at || item.created_at)}
                  </span>
                </td>
                <td>
                  <div className="patrimonio-row-actions">
                    <button type="button" onClick={() => onView(item)} title="Ver ficha">
                      <FaEye />
                    </button>
                    <button type="button" onClick={() => onEdit(item)} title="Editar información">
                      <FaEdit />
                    </button>
                    {item.is_active && (
                      <button
                        type="button"
                        className="danger"
                        onClick={() => onDelete(item)}
                        title="Desactivar"
                      >
                        <FaTrash />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
