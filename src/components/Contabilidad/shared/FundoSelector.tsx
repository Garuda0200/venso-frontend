import React, { useState, useEffect, useMemo } from "react";
import {
  MdAccountBalance,
  MdAccountBalanceWallet,
  MdCreditCard,
  MdAttachMoney,
  MdPublic,
  MdFlightTakeoff,
} from "react-icons/md";
import {
  FaPaypal,
  FaMoneyBillWave,
  FaPlane,
  FaDollarSign,
  FaGlobeAmericas,
} from "react-icons/fa";
import { SiWesternunion } from "react-icons/si";
import "./FundoSelector.scss";

/**
 * Iconos para cada tipo de fondo/cuenta
 */
const FUNDO_ICONS = {
  efectivo: <FaMoneyBillWave />,
  cuenta_debito: <MdCreditCard />,
  cuenta_credito: <MdAccountBalanceWallet />,
  cuenta: <MdCreditCard />, // Legacy
  global66: <FaGlobeAmericas />,
  paypal: <FaPaypal />,
  western_union: <SiWesternunion />,
  wetravel: <MdFlightTakeoff />,
  default: <MdAccountBalance />,
};

/**
 * Labels para cada tipo de fondo
 */
const FUNDO_LABELS = {
  efectivo: "Efectivo",
  cuenta_debito: "Débito",
  cuenta_credito: "Crédito",
  cuenta: "Débito",
  global66: "Global66",
  paypal: "PayPal",
  western_union: "W. Union",
  wetravel: "WeTravel",
};

/**
 * Colores de fondo para cada tipo
 */
const FUNDO_COLORS = {
  efectivo: "#10b981", // Verde efectivo
  cuenta_debito: "#3b82f6", // Azul débito
  cuenta_credito: "#8b5cf6", // Violeta crédito
  cuenta: "#3b82f6",
  global66: "#00d4aa", // Verde Global66
  paypal: "#003087", // Azul PayPal
  western_union: "#ffdd00", // Amarillo Western Union
  wetravel: "#ff6b35", // Naranja WeTravel
};

/**
 * Orden preferido de los fondos
 */
const FUNDO_ORDER = [
  "efectivo",
  "cuenta_debito",
  "cuenta_credito",
  "global66",
  "paypal",
  "western_union",
  "wetravel",
];

const FundoSelector = ({
  saldos = [],
  selectedId = "",
  onChange,
  disabled = false,
  compact = false,
  className = "",
  validated = false,
  excludeTypes = [], // Tipos de fondo a excluir (ej: ['cuenta_credito'] para ingresos)
}) => {
  // Agrupar saldos por tipo de fondo (excluyendo tipos no deseados)
  const fundosAgrupados = useMemo(() => {
    const grupos = {};
    saldos.forEach((saldo) => {
      const tipo = saldo.tipo;
      // Excluir tipos especificados
      if (excludeTypes.includes(tipo)) return;

      if (!grupos[tipo]) {
        grupos[tipo] = {
          tipo,
          monedas: [],
        };
      }
      grupos[tipo].monedas.push({
        moneda: saldo.moneda,
        saldoId: saldo.id,
        saldo_actual: saldo.saldo_actual,
      });
    });

    // Ordenar según FUNDO_ORDER
    return FUNDO_ORDER.filter((tipo) => grupos[tipo]).map(
      (tipo) => grupos[tipo],
    );
  }, [saldos, excludeTypes]);

  // Estado local para tipo y moneda seleccionados
  const [selectedTipo, setSelectedTipo] = useState("");
  const [selectedMoneda, setSelectedMoneda] = useState("");

  // Sincronizar con selectedId cuando cambia externamente
  useEffect(() => {
    if (selectedId) {
      const saldo = saldos.find((s) => String(s.id) === String(selectedId));
      if (saldo) {
        setSelectedTipo(saldo.tipo);
        setSelectedMoneda(saldo.moneda);
      }
    } else {
      setSelectedTipo("");
      setSelectedMoneda("");
    }
  }, [selectedId, saldos]);

  // Obtener monedas disponibles para el tipo seleccionado
  const monedasDisponibles = useMemo(() => {
    const fondo = fundosAgrupados.find((f) => f.tipo === selectedTipo);
    return fondo ? fondo.monedas : [];
  }, [selectedTipo, fundosAgrupados]);

  // Manejar selección de tipo
  const handleSelectTipo = (tipo) => {
    if (disabled) return;

    setSelectedTipo(tipo);

    // Obtener monedas del nuevo tipo
    const fondo = fundosAgrupados.find((f) => f.tipo === tipo);
    if (fondo) {
      // Si solo hay una moneda, seleccionarla automáticamente
      if (fondo.monedas.length === 1) {
        const monedaInfo = fondo.monedas[0];
        setSelectedMoneda(monedaInfo.moneda);
        notifyChange(monedaInfo.saldoId);
      } else {
        // Intentar mantener la moneda anterior si está disponible
        const monedaAnterior = fondo.monedas.find(
          (m) => m.moneda === selectedMoneda,
        );
        if (monedaAnterior) {
          notifyChange(monedaAnterior.saldoId);
        } else {
          // Si no, limpiar para que elija
          setSelectedMoneda("");
          // NO notificar hasta que elija moneda
        }
      }
    }
  };

  // Manejar selección de moneda
  const handleSelectMoneda = (moneda) => {
    if (disabled) return;

    setSelectedMoneda(moneda);

    // Buscar el saldo correspondiente
    const fondo = fundosAgrupados.find((f) => f.tipo === selectedTipo);
    if (fondo) {
      const monedaInfo = fondo.monedas.find((m) => m.moneda === moneda);
      if (monedaInfo) {
        notifyChange(monedaInfo.saldoId);
      }
    }
  };

  // Notificar cambio al padre
  const notifyChange = (saldoId) => {
    if (onChange) {
      onChange({
        target: {
          name: "saldo_id",
          value: String(saldoId),
        },
      });
    }
  };

  const getIcon = (tipo) => FUNDO_ICONS[tipo] || FUNDO_ICONS.default;
  const getLabel = (tipo) => FUNDO_LABELS[tipo] || tipo;
  const getColor = (tipo) => FUNDO_COLORS[tipo] || "#6b7280";

  // Vista compacta: dropdown simple
  if (compact) {
    // Filtrar saldos excluyendo tipos no deseados
    const saldosFiltrados = saldos.filter(
      (s) => !excludeTypes.includes(s.tipo),
    );

    return (
      <div
        className={`fundo-selector compact ${className} ${validated && !selectedId ? "invalid" : ""}`}
      >
        <select
          value={selectedId}
          onChange={(e) => {
            const saldo = saldosFiltrados.find(
              (s) => String(s.id) === e.target.value,
            );
            if (saldo) {
              setSelectedTipo(saldo.tipo);
              setSelectedMoneda(saldo.moneda);
              notifyChange(saldo.id);
            }
          }}
          disabled={disabled}
          className="fundo-select"
        >
          <option value="">Seleccione un fondo</option>
          {saldosFiltrados.map((saldo) => (
            <option key={saldo.id} value={saldo.id}>
              {getLabel(saldo.tipo)} -{" "}
              {saldo.moneda === "soles" ? "Soles" : "Dólares"}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Vista completa: selector de fondo + moneda separados
  return (
    <div
      className={`fundo-selector two-step ${className} ${validated && !selectedId ? "invalid" : ""} ${disabled ? "disabled" : ""}`}
    >
      {/* PASO 1: Selección de Fondo */}
      <div className="selector-section">
        <label className="section-label">Fondo</label>
        <div className="fundos-grid">
          {fundosAgrupados.map((fondo) => {
            const isSelected = fondo.tipo === selectedTipo;
            const color = getColor(fondo.tipo);
            const tieneMultiplesMonedas = fondo.monedas.length > 1;

            return (
              <button
                key={fondo.tipo}
                type="button"
                className={`fundo-card ${isSelected ? "selected" : ""}`}
                style={{ "--fundo-color": color }}
                onClick={() => handleSelectTipo(fondo.tipo)}
                disabled={disabled}
                title={getLabel(fondo.tipo)}
              >
                <span className="card-icon">{getIcon(fondo.tipo)}</span>
                <span className="card-label">{getLabel(fondo.tipo)}</span>
                {isSelected && <span className="selected-check"></span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* PASO 2: Selección de Moneda (solo si hay tipo seleccionado y múltiples monedas) */}
      {selectedTipo && monedasDisponibles.length > 1 && (
        <div className="selector-section moneda-section">
          <label className="section-label">Moneda</label>
          <div className="monedas-grid">
            <button
              type="button"
              className={`moneda-card ${selectedMoneda === "soles" ? "selected" : ""}`}
              onClick={() => handleSelectMoneda("soles")}
              disabled={
                disabled ||
                !monedasDisponibles.find((m) => m.moneda === "soles")
              }
            >
              <span className="moneda-flag">🇵🇪</span>
              <span className="moneda-label">Soles</span>
              <span className="moneda-symbol">S/</span>
            </button>
            <button
              type="button"
              className={`moneda-card ${selectedMoneda === "dolares" ? "selected" : ""}`}
              onClick={() => handleSelectMoneda("dolares")}
              disabled={
                disabled ||
                !monedasDisponibles.find((m) => m.moneda === "dolares")
              }
            >
              <span className="moneda-flag">🇺🇸</span>
              <span className="moneda-label">Dólares</span>
              <span className="moneda-symbol">$</span>
            </button>
          </div>
        </div>
      )}

      {/* Indicador de moneda única */}
      {selectedTipo && monedasDisponibles.length === 1 && (
        <div className="moneda-unica">
          <span className="moneda-flag">
            {monedasDisponibles[0].moneda === "soles" ? "🇵🇪" : "🇺🇸"}
          </span>
          <span>
            Solo{" "}
            {monedasDisponibles[0].moneda === "soles" ? "Soles" : "Dólares"}
          </span>
        </div>
      )}
    </div>
  );
};

export default FundoSelector;
