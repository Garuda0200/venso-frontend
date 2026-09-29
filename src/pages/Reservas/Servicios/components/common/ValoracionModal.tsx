import React, { useState, useEffect } from "react";
import { FaTimes, FaStar, FaCheckCircle } from "react-icons/fa";
import "./ValoracionModal.scss";

const ValoracionModal = ({ show, onClose, entity, entityType, onSave }) => {
  const [modo, setModo] = useState("valoracion"); // 'criterios' o 'valoracion'
  const [valoracion, setValoracion] = useState("");
  const [criterios, setCriterios] = useState({
    // Por implementar - placeholder para futura funcionalidad
    calidad: 0,
    servicio: 0,
    limpieza: 0,
    relacion_calidad_precio: 0,
  });

  useEffect(() => {
    if (entity?.calificacion?.valoracion) {
      setValoracion(entity.calificacion.valoracion.toString());
    } else {
      setValoracion("");
    }
  }, [entity]);

  if (!show) return null;

  const handleSave = () => {
    if (modo === "valoracion") {
      const valor = parseFloat(valoracion);
      if (isNaN(valor) || valor < 0 || valor > 10) {
        alert("Por favor ingrese una valoración válida entre 0 y 10");
        return;
      }

      onSave({
        valoracion: valor,
        tipo: "valoracion_numerica",
      });
    } else {
      // Modo criterios - por implementar
      alert("La valoración por criterios se implementará próximamente");
    }
  };

  const getValoracionColor = (valor) => {
    if (valor >= 0 && valor <= 3) return "danger";
    if (valor >= 4 && valor <= 7) return "warning";
    if (valor >= 8 && valor <= 10) return "success";
    return "secondary";
  };

  const getValoracionText = (valor) => {
    if (valor >= 0 && valor <= 3) return "No recomendable";
    if (valor >= 4 && valor <= 7) return "Servicio apto";
    if (valor >= 8 && valor <= 10) return "Recomendable";
    return "";
  };

  const valorActual = parseFloat(valoracion) || 0;

  return (
    <div className="valoracion-modal-overlay" onClick={onClose}>
      <div className="valoracion-modal" onClick={(e) => e.stopPropagation()}>
        <div className="valoracion-modal-header">
          <h3>
            <FaStar className="icon-star" />
            Calificar {entityType === "hotel" ? "Hotel" : entityType}
          </h3>
          <button className="close-button" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <div className="valoracion-modal-body">
          {/* Información del servicio */}
          <div className="entity-info">
            <strong>{entity?.nombre || "Sin nombre"}</strong>
            {entity?.ciudad && <small> - {entity.ciudad}</small>}
          </div>

          {/* Switch de modo */}
          <div className="modo-switch">
            <button
              className={`modo-button ${modo === "valoracion" ? "active" : ""}`}
              onClick={() => setModo("valoracion")}
            >
              Valoración Numérica
            </button>
            <button
              className={`modo-button ${modo === "criterios" ? "active" : ""} disabled`}
              onClick={() => setModo("criterios")}
              disabled
              title="Próximamente disponible"
            >
              Por Criterios
              <small>(Próximamente)</small>
            </button>
          </div>

          {/* Contenido según modo */}
          {modo === "valoracion" ? (
            <div className="valoracion-numerica">
              <div className="valoracion-input-group">
                <label htmlFor="valoracion">
                  Valoración del servicio (0-10):
                </label>
                <input
                  id="valoracion"
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  value={valoracion}
                  onChange={(e) => setValoracion(e.target.value)}
                  className="valoracion-input"
                  placeholder="0.0"
                />
              </div>

              {/* Preview de la valoración */}
              {valoracion &&
                !isNaN(valorActual) &&
                valorActual >= 0 &&
                valorActual <= 10 && (
                  <div
                    className={`valoracion-preview ${getValoracionColor(valorActual)}`}
                  >
                    <FaCheckCircle />
                    <span>
                      {getValoracionText(valorActual)}:{" "}
                      <strong>{valorActual.toFixed(1)}/10</strong>
                    </span>
                  </div>
                )}

              {/* Escala de referencia */}
              <div className="valoracion-scale">
                <h4>Escala de valoración:</h4>
                <div className="scale-items">
                  <div className="scale-item danger">
                    <span className="scale-range">0 - 3</span>
                    <span className="scale-label">No recomendable</span>
                  </div>
                  <div className="scale-item warning">
                    <span className="scale-range">4 - 7</span>
                    <span className="scale-label">Servicio apto</span>
                  </div>
                  <div className="scale-item success">
                    <span className="scale-range">8 - 10</span>
                    <span className="scale-label">Recomendable</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="valoracion-criterios">
              <div className="coming-soon">
                <p>
                  La valoración por criterios específicos estará disponible
                  próximamente.
                </p>
                <p>Podrá calificar aspectos como:</p>
                <ul>
                  <li>Calidad del servicio</li>
                  <li>Atención al cliente</li>
                  <li>Limpieza</li>
                  <li>Relación calidad-precio</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="valoracion-modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn-save"
            onClick={handleSave}
            disabled={
              modo === "valoracion" &&
              (!valoracion ||
                isNaN(valorActual) ||
                valorActual < 0 ||
                valorActual > 10)
            }
          >
            <FaStar /> Guardar Valoración
          </button>
        </div>
      </div>
    </div>
  );
};

export default ValoracionModal;
