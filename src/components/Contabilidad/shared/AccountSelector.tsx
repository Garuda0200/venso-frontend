import React from "react";
import {
  FaWallet,
  FaDollarSign,
  FaUniversity,
  FaCreditCard,
  FaGlobe,
  FaExchangeAlt,
} from "react-icons/fa";
import "./AccountSelector.scss";

const AccountSelector = ({
  accounts = [],
  selectedId,
  onChange,
  disabled = false,
  showBalance = true,
  compactMode = false,
}) => {
  const getTipoConfig = (tipo) => {
    const configs = {
      efectivo: {
        label: "Efectivo",
        icon: FaWallet,
        color: "#1cc88a",
        bgLight: "#e6f7ef",
      },
      cuenta_debito: {
        label: "Cuenta Débito",
        icon: FaUniversity,
        color: "#3b82f6",
        bgLight: "#eff6ff",
      },
      cuenta_credito: {
        label: "Cuenta Crédito",
        icon: FaCreditCard,
        color: "#8b5cf6",
        bgLight: "#f5f3ff",
      },
      niubiz: {
        label: "Niubiz",
        icon: FaCreditCard,
        color: "#ef4444",
        bgLight: "#fef2f2",
      },
      paypal: {
        label: "PayPal",
        icon: FaGlobe,
        color: "#0070ba",
        bgLight: "#e5f3fc",
      },
      western_union: {
        label: "Western Union",
        icon: FaExchangeAlt,
        color: "#ffbf00",
        bgLight: "#fff9e6",
      },
    };
    return (
      configs[tipo] || {
        label: tipo,
        icon: FaWallet,
        color: "#868e96",
        bgLight: "#f8f9fa",
      }
    );
  };

  const formatMonto = (monto, moneda) => {
    const num = parseFloat(monto || 0).toFixed(2);
    return moneda === "soles" ? `S/ ${num}` : `$ ${num}`;
  };

  const handleSelect = (account) => {
    if (disabled) return;
    onChange(
      {
        target: {
          name: "saldo_id",
          value: account.id,
        },
      },
      account,
    );
  };

  if (compactMode) {
    // Modo compacto: dropdown select
    return (
      <div className="account-selector-v2 compact">
        <select
          className="account-select"
          value={selectedId || ""}
          onChange={(e) => {
            const account = accounts.find(
              (a) => a.id === parseInt(e.target.value),
            );
            if (account) handleSelect(account);
          }}
          disabled={disabled}
        >
          <option value="">Seleccionar fondo...</option>
          {accounts.map((account) => {
            const config = getTipoConfig(account.tipo);
            return (
              <option key={account.id} value={account.id}>
                {config.label} ({account.moneda === "soles" ? "S/" : "$"})
                {showBalance &&
                  ` - ${formatMonto(account.saldo_actual, account.moneda)}`}
              </option>
            );
          })}
        </select>
      </div>
    );
  }

  // Modo visual: cards
  return (
    <div className="account-selector-v2">
      <div className="accounts-grid">
        {accounts.map((account) => {
          const config = getTipoConfig(account.tipo);
          const IconComponent = config.icon;
          const isSelected = parseInt(selectedId) === account.id;

          return (
            <div
              key={account.id}
              className={`account-card ${isSelected ? "selected" : ""} ${disabled ? "disabled" : ""}`}
              onClick={() => handleSelect(account)}
              style={{
                "--accent-color": config.color,
                "--bg-light": config.bgLight,
              }}
            >
              <div className="card-header">
                <div className="icon-wrapper">
                  <IconComponent />
                </div>
                <div className="currency-badge">
                  {account.moneda === "soles" ? "🇵🇪 PEN" : "🇺🇸 USD"}
                </div>
              </div>

              <div className="card-body">
                <span className="account-type">{config.label}</span>
                {showBalance && (
                  <span className="account-balance">
                    {formatMonto(account.saldo_actual, account.moneda)}
                  </span>
                )}
              </div>

              {isSelected && (
                <div className="selected-indicator">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AccountSelector;
