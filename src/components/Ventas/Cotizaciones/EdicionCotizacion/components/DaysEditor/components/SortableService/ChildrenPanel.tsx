import React, { useMemo, useState } from "react";
import { FaChild } from "react-icons/fa";

import { formatCurrency } from "../../../../utils/formatters";
import { buildChildPricingRows, getChildSlotKey } from "./childrenPanelRows";
import "./ChildrenPanel.scss";

const INITIAL_INLINE = { value: "", editing: false };
const INITIAL_EDITING = { childId: null, value: "" };

const ChildrenPanel = ({
  childIds = [],
  convertedEntries = [],
  childPriceMap = {},
  adultPrice = 0,
  className = "",
  onApplyUniform,
  onConvertChild,
  onRevertChild,
  onApplyIndividual,
  getDisplayName,
}) => {
  const [inlineUniformPrice, setInlineUniformPrice] = useState(INITIAL_INLINE);
  const [editingIndividualChild, setEditingIndividualChild] = useState(INITIAL_EDITING);

  const childRows = useMemo(
    () => buildChildPricingRows(childIds, convertedEntries),
    [childIds, convertedEntries],
  );

  const resetInline = () => setInlineUniformPrice(INITIAL_INLINE);
  const resetEditing = () => setEditingIndividualChild(INITIAL_EDITING);

  const handleApplyUniform = (type, val) => {
    onApplyUniform?.(type, val);
  };

  return (
    <div className={`sr__children ${className}`.trim()}>
      <div className="sr__ch-actions">
        <span className="sr__ch-label">Aplicar a todos</span>
        <div className="sr__ch-presets">
          <button
            className="sr__ch-btn"
            title="Sin costo para todos los niños"
            onClick={() => handleApplyUniform("zero")}
            type="button"
          >
            Gratis
          </button>
          <button
            className="sr__ch-btn"
            title="Aplicar tarifa adulta a todos los niños"
            onClick={() => handleApplyUniform("adult")}
            type="button"
          >
            Tarifa adulto
          </button>
          <button
            className={`sr__ch-btn sr__ch-btn--custom ${inlineUniformPrice.editing ? "active" : ""}`}
            title="Ingresar un monto personalizado para todos los niños"
            onClick={() =>
              setInlineUniformPrice((prev) => ({ ...prev, editing: !prev.editing }))
            }
            type="button"
          >
            Otro valor
          </button>
        </div>
      </div>

      {inlineUniformPrice.editing && (
        <div className="sr__ch-uniform">
          <span className="sr__ch-amount-label">Monto</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={inlineUniformPrice.value}
            onChange={(event) =>
              setInlineUniformPrice((previous) => ({
                ...previous,
                value: event.target.value,
              }))
            }
            className="sr__ch-input"
            placeholder="0.00"
            onWheel={(event) => event.currentTarget.blur()}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
              }
              if (event.key === "Enter" && inlineUniformPrice.value) {
                handleApplyUniform("fixed", inlineUniformPrice.value);
                resetInline();
              }
            }}
            autoFocus
          />
          <button
            className="sr__ch-apply"
            title="Aplicar monto a todos los niños"
            onClick={() => {
              if (inlineUniformPrice.value) {
                handleApplyUniform("fixed", inlineUniformPrice.value);
              }
              resetInline();
            }}
            type="button"
          >
            Aplicar
          </button>
          <button
            className="sr__ch-cancel"
            title="Cancelar"
            onClick={resetInline}
            type="button"
          >
            Cancelar
          </button>
        </div>
      )}

      {childRows.length > 0 && (
        <div className="sr__ch-list">
          <div className="sr__ch-header">
            <span>Pasajero</span>
            <span>Tarifa</span>
            <span>Acción</span>
          </div>
          {childRows.map(({ childId, isConverted, revertKey }, idx) => {
            const childPrice = isConverted
              ? adultPrice
              : childPriceMap[childId] != null
                ? parseFloat(childPriceMap[childId]) || 0
                : 0;
            const isEditingThis =
              !isConverted && editingIndividualChild.childId === childId;
            const childLabel =
              typeof getDisplayName === "function"
                ? getDisplayName(childId, idx)
                : `Niño ${idx + 1}`;

            return (
              <div
                key={getChildSlotKey(childId)}
                className={`sr__ch-row ${isEditingThis ? "editing" : ""} ${isConverted ? "sr__ch-row--adult" : ""}`}
              >
                <span className="sr__ch-name">
                  <FaChild />
                  <span className="sr__ch-name-text">{childLabel}</span>
                  <small className={isConverted ? "adult" : ""}>
                    {isConverted ? "tarifa adulto" : "tarifa niño"}
                  </small>
                </span>

                <span className="sr__ch-price">
                  {isConverted ? (
                    <span className="sr__ch-val sr__ch-val--adult">
                      {formatCurrency(adultPrice)}
                      <span className="sr__ch-context">adulto</span>
                    </span>
                  ) : isEditingThis ? (
                    <div className="sr__ch-inline">
                      <span className="sr__ch-amount-label sr__ch-amount-label--inline">
                        Monto
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editingIndividualChild.value}
                        onChange={(event) =>
                          setEditingIndividualChild((previous) => ({
                            ...previous,
                            value: event.target.value,
                          }))
                        }
                        className="sr__ch-input sm"
                        placeholder="0.00"
                        onWheel={(event) => event.currentTarget.blur()}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                            event.preventDefault();
                          }
                          if (event.key === "Enter" && editingIndividualChild.value) {
                            onApplyIndividual?.(
                              childId,
                              "fixed",
                              editingIndividualChild.value,
                            );
                            resetEditing();
                          }
                        }}
                        autoFocus
                      />
                      <button
                        className="sr__ch-apply"
                        onClick={() => {
                          if (editingIndividualChild.value) {
                            onApplyIndividual?.(
                              childId,
                              "fixed",
                              editingIndividualChild.value,
                            );
                          }
                          resetEditing();
                        }}
                        type="button"
                      >
                        OK
                      </button>
                      <button
                        className="sr__ch-cancel"
                        onClick={resetEditing}
                        type="button"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <span
                      className={`sr__ch-val ${childPrice === 0 ? "free" : ""}`}
                      onClick={() =>
                        setEditingIndividualChild({
                          childId,
                          value: childPrice.toString(),
                        })
                      }
                      title="Clic para editar monto"
                    >
                      {formatCurrency(childPrice)}
                      {childPrice === 0 && <span className="sr__ch-free">gratis</span>}
                    </span>
                  )}
                </span>

                <span className="sr__ch-convert">
                  {isConverted ? (
                    <button
                      className="sr__ch-revert"
                      onClick={() => onRevertChild?.(revertKey)}
                      title="Volver a tarifa de niño"
                      type="button"
                    >
                      Revertir
                    </button>
                  ) : (
                    <button
                      onClick={() => onConvertChild?.(childId)}
                      title="Cobrar tarifa adulto a este niño"
                      type="button"
                    >
                      Tarifa adulto
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ChildrenPanel;
