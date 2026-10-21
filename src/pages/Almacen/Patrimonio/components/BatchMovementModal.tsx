import { useState } from "react";
import { FaExchangeAlt, FaPlus, FaTimes } from "react-icons/fa";
import patrimonioService from "../../../../services/patrimonioService";
import { ESTADOS, MOVEMENT_FORM, TIPOS_MOVIMIENTO } from "../constants";
import { buildMovementPayload, getResponseData, validateMovement } from "../utils";

export default function BatchMovementModal({ items, onClose, onSaved }) {
  const [movement, setMovement] = useState(MOVEMENT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setMovementField = (field, value) =>
    setMovement((current) => ({ ...current, [field]: value }));

  const showResponsibleFields = ["asignacion", "reasignacion", "devolucion"].includes(
    movement.tipo,
  );

  const save = async (event) => {
    event.preventDefault();
    const validationError = validateMovement(movement);
    setError(validationError);
    if (validationError) return;

    setSaving(true);
    const response = await patrimonioService.createMovimientosBatch(
      items.map((item) => item.id),
      buildMovementPayload(movement),
    );
    setSaving(false);

    if (response?.success === false) {
      setError(response.message || "No se pudo registrar el movimiento por lote.");
      return;
    }
    onSaved(getResponseData(response, {})?.items || [], response?.message);
  };

  return (
    <div className="patrimonio-modal-backdrop" onClick={onClose}>
      <form
        className="patrimonio-modal patrimonio-form-modal patrimonio-batch-modal"
        onSubmit={save}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div className="patrimonio-modal-title">
            <span className="patrimonio-modal-icon"><FaExchangeAlt /></span>
            <div>
              <h3>Movimiento por lote</h3>
              <p>Se registrará un movimiento en el historial de cada bien seleccionado.</p>
            </div>
          </div>
          <button className="patrimonio-icon-btn" onClick={onClose} type="button">
            <FaTimes />
          </button>
        </header>

        <div className="patrimonio-modal-body">
          <div className="patrimonio-batch-codes" aria-label="Bienes seleccionados">
            {items.map((item) => (
              <span key={item.id} className="patrimonio-code-chip">{item.codigo}</span>
            ))}
          </div>

          <div className="patrimonio-movement-form">
            {error && <div className="patrimonio-alert span-full">{error}</div>}
            <label>
              <span>Tipo de movimiento</span>
              <select
                value={movement.tipo}
                onChange={(event) => setMovementField("tipo", event.target.value)}
                disabled={saving}
              >
                {TIPOS_MOVIMIENTO.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </label>

            {showResponsibleFields && (
              <>
                <label>
                  <span>Nombre responsable</span>
                  <input
                    value={movement.responsable_nombre}
                    onChange={(event) => setMovementField("responsable_nombre", event.target.value)}
                    placeholder={movement.tipo === "devolucion" ? "Vacío devuelve todos" : "Nombre completo"}
                    disabled={saving}
                  />
                </label>
                <label>
                  <span>DNI / documento</span>
                  <input
                    value={movement.responsable_dni}
                    onChange={(event) => setMovementField("responsable_dni", event.target.value)}
                    placeholder="Documento de identidad"
                    disabled={saving}
                  />
                </label>
              </>
            )}

            {movement.tipo === "traslado" && (
              <label>
                <span>Nueva ubicación</span>
                <input
                  value={movement.ubicacion_nueva}
                  onChange={(event) => setMovementField("ubicacion_nueva", event.target.value)}
                  placeholder="Destino físico"
                  required
                  disabled={saving}
                />
              </label>
            )}

            {movement.tipo === "cambio_estado" && (
              <label>
                <span>Nuevo estado</span>
                <select
                  value={movement.estado_nuevo}
                  onChange={(event) => setMovementField("estado_nuevo", event.target.value)}
                  disabled={saving}
                >
                  {ESTADOS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            )}

            <label className="movement-observation">
              <span>Observación</span>
              <textarea
                value={movement.observacion}
                onChange={(event) => setMovementField("observacion", event.target.value)}
                placeholder="Motivo del movimiento, aplica a todo el lote"
                disabled={saving}
              />
            </label>
          </div>
        </div>

        <footer>
          <button type="button" className="patrimonio-secondary-btn" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="patrimonio-primary-btn" disabled={saving}>
            <FaPlus /> {saving ? "Registrando..." : `Registrar en ${items.length} bien(es)`}
          </button>
        </footer>
      </form>
    </div>
  );
}
