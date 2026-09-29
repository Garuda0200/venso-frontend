import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaBoxOpen,
  FaEdit,
  FaExchangeAlt,
  FaHistory,
  FaMapMarkerAlt,
  FaPlus,
  FaTimes,
  FaUser,
  FaUsers,
} from "react-icons/fa";
import LoadingSpinner from "../../../../components/LoadingSpinner";
import patrimonioService from "../../../../services/patrimonioService";
import { ESTADOS, MOVEMENT_FORM, TIPOS_MOVIMIENTO } from "../constants";
import {
  attributeLabel,
  buildMovementPayload,
  formatAttributeValue,
  formatDateTime,
  getResponseData,
  itemAlternateCodes,
  itemAttributes,
  itemDescription,
  itemLocation,
  itemName,
  itemResponsibles,
  itemState,
  movementInfo,
  movementTypeLabel,
  responsibleLabel,
  stateLabel,
} from "../utils";
import BarcodeLabel from "./BarcodeLabel";

const responsibleListLabel = (value) => {
  if (!Array.isArray(value) || value.length === 0) return "Sin asignar";
  return value.map(responsibleLabel).join("; ");
};

const HistoryEvent = ({ movement }) => {
  const info = movementInfo(movement);
  const responsibleChanged =
    JSON.stringify(info.responsables_anteriores || []) !==
    JSON.stringify(info.responsables_resultantes || []);
  const locationChanged =
    (info.ubicacion_anterior || "") !== (info.ubicacion_resultante || "");
  const stateChanged =
    (info.estado_anterior || "") !== (info.estado_resultante || "");

  return (
    <article className="patrimonio-history-event">
      <div className="patrimonio-history-marker"><FaExchangeAlt /></div>
      <div className="patrimonio-history-content">
        <div className="patrimonio-history-main">
          <div>
            <strong>{movementTypeLabel(movement.tipo)}</strong>
            <span>{formatDateTime(movement.created_at)}</span>
          </div>
          <small>{movement.created_by || "Sistema"}</small>
        </div>

        {info.observacion && <p className="patrimonio-history-note">{info.observacion}</p>}
        {info.responsable_nuevo && !responsibleChanged && (
          <p className="patrimonio-history-note">
            Responsable involucrado: <strong>{responsibleLabel(info.responsable_nuevo)}</strong>
          </p>
        )}
        {info.responsable_salida && !responsibleChanged && (
          <p className="patrimonio-history-note">
            Devolución registrada por: <strong>{responsibleLabel(info.responsable_salida)}</strong>
          </p>
        )}

        <div className="patrimonio-history-changes">
          {responsibleChanged && (
            <div>
              <span>Responsables</span>
              <strong>{responsibleListLabel(info.responsables_anteriores)}</strong>
              <em>→</em>
              <strong>{responsibleListLabel(info.responsables_resultantes)}</strong>
            </div>
          )}
          {locationChanged && (
            <div>
              <span>Ubicación</span>
              <strong>{info.ubicacion_anterior || "Sin ubicación"}</strong>
              <em>→</em>
              <strong>{info.ubicacion_resultante || "Sin ubicación"}</strong>
            </div>
          )}
          {stateChanged && (
            <div>
              <span>Estado</span>
              <strong>{stateLabel(info.estado_anterior)}</strong>
              <em>→</em>
              <strong>{stateLabel(info.estado_resultante)}</strong>
            </div>
          )}
        </div>
      </div>
    </article>
  );
};

export default function DetailModal({ item, onClose, onEdit, onMovementCreated }) {
  const [currentItem, setCurrentItem] = useState(item);
  const [movimientos, setMovimientos] = useState([]);
  const [movement, setMovement] = useState(MOVEMENT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setCurrentItem(item), [item]);

  const loadMovimientos = useCallback(async () => {
    setLoading(true);
    const response = await patrimonioService.listMovimientos(item.id);
    setMovimientos(getResponseData(response, []) || []);
    setLoading(false);
  }, [item.id]);

  useEffect(() => {
    loadMovimientos();
  }, [loadMovimientos]);

  const attributes = useMemo(() => Object.entries(itemAttributes(currentItem)), [currentItem]);
  const responsibles = itemResponsibles(currentItem);
  const alternateCodes = itemAlternateCodes(currentItem);
  const state = itemState(currentItem);

  const setMovementField = (field, value) =>
    setMovement((current) => ({ ...current, [field]: value }));

  const selectResponsible = (index) => {
    const responsible = responsibles[Number(index)];
    setMovement((current) => ({
      ...current,
      responsable_nombre: responsible?.nombre || "",
      responsable_dni: responsible?.dni || "",
    }));
  };

  const saveMovement = async (event) => {
    event.preventDefault();
    setError("");

    if (
      ["asignacion", "reasignacion"].includes(movement.tipo) &&
      !movement.responsable_nombre.trim() &&
      !movement.responsable_dni.trim()
    ) {
      setError("Registra el nombre o DNI de la persona responsable.");
      return;
    }
    if (movement.tipo === "traslado" && !movement.ubicacion_nueva.trim()) {
      setError("Indica la nueva ubicación del bien.");
      return;
    }

    setSaving(true);
    const response = await patrimonioService.createMovimiento(
      currentItem.id,
      buildMovementPayload(movement, currentItem),
    );
    setSaving(false);

    if (response?.success === false) {
      setError(response.message || "No se pudo registrar el movimiento.");
      return;
    }

    const data = getResponseData(response, {});
    if (data?.item) setCurrentItem(data.item);
    setMovement(MOVEMENT_FORM);
    await loadMovimientos();
    onMovementCreated?.(data?.item || currentItem);
  };

  const showResponsibleFields = ["asignacion", "reasignacion", "devolucion"].includes(
    movement.tipo,
  );

  return (
    <div className="patrimonio-modal-backdrop" onClick={onClose}>
      <div
        className="patrimonio-modal patrimonio-detail-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div className="patrimonio-modal-title">
            <span className="patrimonio-modal-icon"><FaBoxOpen /></span>
            <div>
              <span className="patrimonio-modal-kicker">Ficha patrimonial</span>
              <h3>{itemName(currentItem)}</h3>
              <p>{currentItem.categoria} · versión {currentItem.version || 1}</p>
            </div>
          </div>
          <div className="patrimonio-modal-actions">
            <button type="button" className="patrimonio-modal-action-btn" onClick={() => onEdit(currentItem)}>
              <FaEdit /> Editar información
            </button>
            <button className="patrimonio-icon-btn" onClick={onClose} type="button">
              <FaTimes />
            </button>
          </div>
        </header>

        <div className="patrimonio-modal-body patrimonio-detail-body">
          <section className="patrimonio-identification-card">
            <BarcodeLabel code={currentItem.codigo} title={itemName(currentItem)} actions />
            <div className="patrimonio-identification-meta">
              <div>
                <span>Estado</span>
                <strong className={`patrimonio-status status-${state}`}>{stateLabel(state)}</strong>
              </div>
              <div>
                <span>Ubicación actual</span>
                <strong><FaMapMarkerAlt /> {itemLocation(currentItem) || "Sin ubicación"}</strong>
              </div>
              <div>
                <span>Registro</span>
                <strong>{currentItem.is_active ? "Activo" : "Inactivo"}</strong>
              </div>
            </div>
          </section>

          <div className="patrimonio-detail-columns">
            <section className="patrimonio-detail-panel">
              <div className="patrimonio-panel-heading">
                <div><FaUsers /><h4>Responsables actuales</h4></div>
                <span>{responsibles.length}</span>
              </div>
              {responsibles.length ? (
                <div className="patrimonio-responsible-list">
                  {responsibles.map((responsible, index) => (
                    <article key={`${responsible.dni || responsible.nombre}-${index}`}>
                      <span><FaUser /></span>
                      <div>
                        <strong>{responsible.nombre || "Sin nombre"}</strong>
                        <small>{responsible.dni ? `DNI ${responsible.dni}` : "DNI no registrado"}</small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="patrimonio-panel-empty">El bien está disponible y no tiene responsable asignado.</p>
              )}
            </section>

            <section className="patrimonio-detail-panel">
              <div className="patrimonio-panel-heading">
                <div><FaBoxOpen /><h4>Información general</h4></div>
              </div>
              <dl className="patrimonio-detail-list">
                <div><dt>Categoría</dt><dd>{currentItem.categoria}</dd></div>
                <div><dt>Descripción</dt><dd>{itemDescription(currentItem) || "Sin descripción"}</dd></div>
                <div>
                  <dt>Códigos alternos</dt>
                  <dd>{alternateCodes.length ? alternateCodes.join(", ") : "Sin códigos alternos"}</dd>
                </div>
                <div><dt>Creado por</dt><dd>{currentItem.created_by || "-"}</dd></div>
                <div><dt>Última edición</dt><dd>{formatDateTime(currentItem.updated_at || currentItem.created_at)}</dd></div>
              </dl>
            </section>
          </div>

          <section className="patrimonio-detail-panel patrimonio-attributes-panel">
            <div className="patrimonio-panel-heading">
              <div><FaBoxOpen /><h4>Características del equipo</h4></div>
              <span>{attributes.length}</span>
            </div>
            {attributes.length ? (
              <dl className="patrimonio-attributes-grid">
                {attributes.map(([key, value]) => (
                  <div key={key}>
                    <dt>{attributeLabel(key)}</dt>
                    <dd>{formatAttributeValue(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="patrimonio-panel-empty">Aún no se registraron características para este bien.</p>
            )}
          </section>

          <section className="patrimonio-history-section">
            <div className="patrimonio-history-heading">
              <div>
                <FaHistory />
                <div>
                  <h4>Custodia e historial</h4>
                  <p>Cada cambio conserva quién lo registró y cómo quedó el bien.</p>
                </div>
              </div>
            </div>

            <form className="patrimonio-movement-form" onSubmit={saveMovement}>
              {error && <div className="patrimonio-alert span-full">{error}</div>}
              <label>
                <span>Tipo de movimiento</span>
                <select
                  value={movement.tipo}
                  onChange={(event) => setMovementField("tipo", event.target.value)}
                >
                  {TIPOS_MOVIMIENTO.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </label>

              {showResponsibleFields && responsibles.length > 0 && movement.tipo === "devolucion" && (
                <label>
                  <span>Responsable que devuelve</span>
                  <select defaultValue="" onChange={(event) => selectResponsible(event.target.value)}>
                    <option value="">Todos / seleccionar persona</option>
                    {responsibles.map((responsible, index) => (
                      <option key={`${responsible.dni || responsible.nombre}-${index}`} value={index}>
                        {responsibleLabel(responsible)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {showResponsibleFields && (
                <>
                  <label>
                    <span>Nombre responsable</span>
                    <input
                      value={movement.responsable_nombre}
                      onChange={(event) => setMovementField("responsable_nombre", event.target.value)}
                      placeholder={movement.tipo === "devolucion" ? "Vacío devuelve todos" : "Nombre completo"}
                    />
                  </label>
                  <label>
                    <span>DNI / documento</span>
                    <input
                      value={movement.responsable_dni}
                      onChange={(event) => setMovementField("responsable_dni", event.target.value)}
                      placeholder="Documento de identidad"
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
                  />
                </label>
              )}

              {movement.tipo === "cambio_estado" && (
                <label>
                  <span>Nuevo estado</span>
                  <select
                    value={movement.estado_nuevo}
                    onChange={(event) => setMovementField("estado_nuevo", event.target.value)}
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
                  placeholder="Motivo, condición de entrega u observación de auditoría"
                />
              </label>

              <button type="submit" disabled={saving}>
                <FaPlus /> {saving ? "Registrando..." : "Registrar movimiento"}
              </button>
            </form>

            {loading ? (
              <LoadingSpinner />
            ) : (
              <div className="patrimonio-history-list">
                {movimientos.length === 0 && (
                  <p className="patrimonio-history-empty">Sin movimientos registrados.</p>
                )}
                {movimientos.map((movementItem) => (
                  <HistoryEvent key={movementItem.id} movement={movementItem} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
