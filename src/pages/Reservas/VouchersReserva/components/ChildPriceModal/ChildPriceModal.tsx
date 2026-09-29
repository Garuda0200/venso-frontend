import React from "react";
import { MdClose, MdAttachMoney, MdPercent, MdCheck } from "react-icons/md";
import "./ChildPricingModal.scss";
const ChildPriceModal = ({
  open,
  basePrice = 0,
  numChildren = 0,
  mode = "amount", // 'amount' | 'percentage'
  value = "",
  onModeChange,
  onValueChange,
  onConfirm,
  onCancel,
  formatCurrency = (n) => n?.toFixed?.(2) ?? n,
}) => {
  console.log({ open, basePrice, numChildren, mode, value });
  if (!open) return null;
  console.log({ open, basePrice, numChildren, mode, value });

  const v = Number(value) || 0;
  const unitChild = mode === "percentage" ? basePrice * (v / 100) : v;
  const childrenTotal = unitChild * (Number(numChildren) || 0);
  const total = basePrice + childrenTotal;

  return (
    <div className="service-picker-overlay" onClick={onCancel}>
      <div
        className="service-picker-container child-pricing-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="service-picker-header">
          <h3>Precio para niños</h3>
          <button
            onClick={onCancel}
            className="close-button"
            aria-label="Cerrar"
          >
            <MdClose />
          </button>
        </div>

        <div className="child-modal-body">
          <div className="row">
            <div className="field">
              <label>Precio base (adulto)</label>
              <div className="readonly">{formatCurrency(basePrice)}</div>
            </div>
            <div className="field">
              <label>Niños</label>
              <div className="readonly">{numChildren}</div>
            </div>
          </div>

          <div className="mode-switch">
            <button
              className={mode === "amount" ? "active" : ""}
              onClick={() => onModeChange("amount")}
              title="Monto por niño"
              type="button"
            >
              <MdAttachMoney /> Monto por niño
            </button>
            <button
              className={mode === "percentage" ? "active" : ""}
              onClick={() => onModeChange("percentage")}
              title="% del precio base por niño"
              type="button"
            >
              <MdPercent /> % por niño
            </button>
          </div>

          <div className="value-input">
            <label>
              {mode === "percentage"
                ? "Porcentaje por niño (%)"
                : "Monto por niño"}
            </label>
            <input
              type="number"
              min="0"
              step={mode === "percentage" ? "1" : "0.01"}
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                  e.preventDefault();
                }
              }}
              placeholder={mode === "percentage" ? "Ej. 50" : "Ej. 30.00"}
            />
          </div>

          <div className="preview">
            <div className="preview-line">
              <span>Precio base:</span>
              <strong>{formatCurrency(basePrice)}</strong>
            </div>
            <div className="preview-line">
              <span>Total niños:</span>
              <strong>{formatCurrency(childrenTotal)}</strong>
            </div>
            <div className="preview-total">
              <span>Total servicio:</span>
              <strong>{formatCurrency(total)}</strong>
            </div>
          </div>
        </div>

        <div className="child-modal-actions">
          <button className="btn-cancel" onClick={onCancel} type="button">
            <MdClose /> Cancelar
          </button>
          <button
            className="btn-apply"
            onClick={onConfirm}
            disabled={value === "" || Number(value) < 0}
            title="Aplicar"
            type="button"
          >
            <MdCheck /> Aplicar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChildPriceModal;
