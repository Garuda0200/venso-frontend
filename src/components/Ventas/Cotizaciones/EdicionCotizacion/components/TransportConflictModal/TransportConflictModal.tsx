import React, { useState, useEffect } from "react";
import {
  MdClose,
  MdAutoFixHigh,
  MdSwapHoriz,
  MdDirectionsBus,
  MdArrowForward,
} from "react-icons/md";
import "./TransportConflictModal.scss";

const TransportConflictModal = ({
  transportConflicts,
  onClose,
  onReplace,
  onOptimize,
  onOptimizeAll,
  onFinalizeImport,
  fetchSuggestion,
}) => {
  const [suggestions, setSuggestions] = useState({});
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  useEffect(() => {
    if (!fetchSuggestion || !transportConflicts) return;
    const { conflicts } = transportConflicts;
    setLoadingSuggestions(true);
    let cancelled = false;

    Promise.all(
      conflicts.map((c, idx) => {
        if (c.resolved) return Promise.resolve(null);
        return fetchSuggestion(c).catch(() => null);
      }),
    ).then((results) => {
      if (cancelled) return;
      const map = {};
      results.forEach((r, idx) => {
        if (r) map[idx] = r;
      });
      setSuggestions(map);
      setLoadingSuggestions(false);
    });

    return () => {
      cancelled = true;
    };
  }, [fetchSuggestion, transportConflicts]);

  if (!transportConflicts) return null;

  const { packageName, conflicts, downsizing } = transportConflicts;
  const allResolved = conflicts.every((c) => c.resolved);
  const pendingCount = conflicts.filter((c) => !c.resolved).length;

  const title = downsizing
    ? "Transportes Sobredimensionados"
    : "Transportes con Capacidad Insuficiente";

  const description = downsizing
    ? `Hay transportes con capacidad mayor a los ${conflicts[0]?.required || 0} pasajeros actuales. Puedes optimizarlos por vehículos más ajustados, reemplazarlos manualmente o continuar tal cual.`
    : packageName
      ? `El paquete "${packageName}" contiene transportes cuya capacidad es menor a los ${conflicts[0]?.required || 0} pasajeros. Puedes optimizarlos automáticamente, reemplazarlos manualmente o importar tal cual.`
      : `Hay transportes cuya capacidad es menor a los ${conflicts[0]?.required || 0} pasajeros. Puedes optimizarlos automáticamente, reemplazarlos manualmente o continuar tal cual.`;

  const finalizeLabel = downsizing
    ? allResolved
      ? "Continuar"
      : "Continuar Sin Cambios"
    : packageName
      ? allResolved
        ? "Importar Paquete"
        : "Importar Tal Cual"
      : allResolved
        ? "Continuar"
        : "Continuar Tal Cual";

  return (
    <div className="transport-conflict-overlay" onClick={() => {}}>
      <div
        className="transport-conflict-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="transport-conflict-header">
          <h3>
            {downsizing ? "" : ""} {title}
          </h3>
          <button className="close-btn" onClick={onClose}>
            <MdClose />
          </button>
        </div>

        <div className="transport-conflict-body">
          <p className="conflict-description">{description}</p>

          <div className="conflict-list">
            {conflicts.map((conflict, idx) => {
              const suggestion = suggestions[idx];
              return (
                <div
                  key={idx}
                  className={`conflict-item ${conflict.resolved ? "resolved" : "pending"}`}
                >
                  <div className="conflict-day-label">{conflict.dayTitle}</div>

                  <div className="conflict-vehicles">
                    {/* Current vehicle */}
                    <div className="vehicle-card current">
                      <div className="vehicle-card__icon">
                        <MdDirectionsBus />
                      </div>
                      <div className="vehicle-card__info">
                        <div className="vehicle-card__label">Actual</div>
                        <div className="vehicle-card__provider">
                          {conflict.transportName}
                        </div>
                        <div className="vehicle-card__type">
                          {conflict.movilidadName || "—"}
                        </div>
                        {conflict.ruta && (
                          <div className="vehicle-card__route">
                            {conflict.ruta}
                          </div>
                        )}
                        <div className="vehicle-card__capacity">
                          <span
                            className={
                              conflict.resolved
                                ? "neutral"
                                : downsizing
                                  ? "info"
                                  : "warning"
                            }
                          >
                            {conflict.capacity} pax
                          </span>
                          <span className="required">
                            {" "}
                            / {conflict.required} necesarios
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Suggestion preview (pending) */}
                    {!conflict.resolved && suggestion && (
                      <>
                        <div className="vehicle-arrow">
                          <MdArrowForward />
                        </div>
                        <div className="vehicle-card suggestion">
                          <div className="vehicle-card__icon">
                            <MdDirectionsBus />
                          </div>
                          <div className="vehicle-card__info">
                            <div className="vehicle-card__label">
                              Sugerencia
                            </div>
                            <div className="vehicle-card__provider">
                              {conflict.transportName}
                            </div>
                            <div className="vehicle-card__type">
                              {suggestion.tipo_auto || "—"}
                            </div>
                            {suggestion.ruta && (
                              <div className="vehicle-card__route">
                                {suggestion.ruta}
                                {suggestion.ruta === conflict.ruta && (
                                  <span className="same-route-badge">
                                    misma ruta
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="vehicle-card__capacity">
                              <span className="ok">
                                {suggestion.nro_pasajeros} pax
                              </span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {/* No suggestion available */}
                    {!conflict.resolved &&
                      !suggestion &&
                      !loadingSuggestions && (
                        <>
                          <div className="vehicle-arrow">
                            <MdArrowForward />
                          </div>
                          <div className="vehicle-card suggestion no-suggestion">
                            <div className="vehicle-card__info">
                              <div className="vehicle-card__label">
                                Sugerencia
                              </div>
                              <div className="vehicle-card__type muted">
                                Sin vehículo automático disponible
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                    {/* Loading */}
                    {!conflict.resolved && loadingSuggestions && (
                      <>
                        <div className="vehicle-arrow">
                          <MdArrowForward />
                        </div>
                        <div className="vehicle-card suggestion loading">
                          <div className="vehicle-card__info">
                            <div className="vehicle-card__type muted">
                              Buscando…
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Replacement vehicle — resolved */}
                    {conflict.resolved && (
                      <>
                        <div className="vehicle-arrow">
                          <MdArrowForward />
                        </div>
                        <div className="vehicle-card replacement">
                          <div className="vehicle-card__icon">
                            <MdDirectionsBus />
                          </div>
                          <div className="vehicle-card__info">
                            <div className="vehicle-card__label">Nuevo</div>
                            <div className="vehicle-card__provider">
                              {conflict.transportName}
                            </div>
                            <div className="vehicle-card__type">
                              {conflict.newVehicleName || "—"}
                            </div>
                            {conflict.newRuta && (
                              <div className="vehicle-card__route">
                                {conflict.newRuta}
                              </div>
                            )}
                            <div className="vehicle-card__capacity">
                              <span className="ok">
                                {conflict.newCapacity} pax
                              </span>
                            </div>
                          </div>
                          <span className="resolved-badge"></span>
                        </div>
                      </>
                    )}
                  </div>

                  {!conflict.resolved && (
                    <div className="conflict-actions">
                      {onOptimize && suggestion && (
                        <button
                          className="optimize-btn"
                          onClick={() => onOptimize(idx)}
                          title="Aplicar la sugerencia automática"
                        >
                          <MdAutoFixHigh /> Optimizar
                        </button>
                      )}
                      <button
                        className="replace-btn"
                        onClick={() => onReplace(idx)}
                        title="Abrir el catálogo de servicios para elegir manualmente"
                      >
                        <MdSwapHoriz /> Reemplazar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="transport-conflict-footer">
          <button className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          {pendingCount > 0 && onOptimizeAll && (
            <button
              className="optimize-all-button"
              onClick={onOptimizeAll}
              title="Optimizar automáticamente todos los transportes pendientes"
            >
              <MdAutoFixHigh /> Optimizar Todos ({pendingCount})
            </button>
          )}
          <button className="action-button" onClick={onFinalizeImport}>
            {finalizeLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransportConflictModal;
