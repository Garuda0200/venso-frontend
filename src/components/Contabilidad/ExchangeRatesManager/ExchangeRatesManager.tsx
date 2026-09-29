import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import {
  MdRefresh,
  MdEdit,
  MdSave,
  MdClose,
  MdAttachMoney,
  MdTrendingUp,
  MdInfo,
} from "react-icons/md";
import { FaDollarSign, FaCoins } from "react-icons/fa";
import exchangeRateService from "../../../services/exchangeRateService";
import "./ExchangeRatesManager.scss";

/**
 * Componente para gestionar las tasas de cambio
 * Permite ver y editar las tasas USD→PEN y MXN→PEN
 */
const ExchangeRatesManager = ({ refreshTrigger = 0 }) => {
  const [rates, setRates] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingRate, setEditingRate] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Cargar tasas de cambio
  const loadExchangeRates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await exchangeRateService.getExchangeRates();

      if (response && response.success && response.data) {
        setRates(response.data.rates || {});
        setLastUpdate(response.data.updated_at || new Date().toISOString());
      } else {
        // Si no hay respuesta del backend, usar valores por defecto
        setRates({
          USD: 3.0,
          MXN: 0.2,
        });
        setLastUpdate(new Date().toISOString());
      }
    } catch (err) {
      console.error("Error loading exchange rates:", err);
      // Usar valores por defecto en caso de error
      setRates({
        USD: 3.0,
        MXN: 0.2,
      });
      setError(
        "No se pudieron cargar las tasas desde el servidor. Usando valores por defecto.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExchangeRates();
  }, [loadExchangeRates, refreshTrigger]);

  // Iniciar edición
  const handleStartEdit = (currency) => {
    setEditingRate(currency);
    setEditValue(rates[currency]?.toString() || "");
  };

  // Cancelar edición
  const handleCancelEdit = () => {
    setEditingRate(null);
    setEditValue("");
  };

  // Guardar tasa editada
  const handleSaveRate = async () => {
    if (!editingRate || !editValue) return;

    const newRate = parseFloat(editValue);
    if (isNaN(newRate) || newRate <= 0) {
      toast.error("Por favor ingrese un valor válido mayor a 0");
      return;
    }

    try {
      setSaving(true);

      const response = await exchangeRateService.updateExchangeRate(
        editingRate,
        newRate,
      );

      if (response && response.success) {
        // Actualizar estado local
        setRates((prev) => ({
          ...prev,
          [editingRate]: newRate,
        }));
        setLastUpdate(new Date().toISOString());
        toast.success(
          `Tasa de ${editingRate} actualizada a S/ ${newRate.toFixed(2)}`,
        );
        handleCancelEdit();
      } else {
        throw new Error(response?.message || "Error al actualizar");
      }
    } catch (err) {
      console.error("Error updating rate:", err);
      toast.error(`Error al actualizar la tasa: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Obtener icono por moneda
  const getCurrencyIcon = (currency) => {
    switch (currency) {
      case "USD":
        return <FaDollarSign className="currency-icon usd" />;
      case "MXN":
        return <FaCoins className="currency-icon mxn" />;
      default:
        return <MdAttachMoney className="currency-icon" />;
    }
  };

  // Obtener nombre completo de moneda
  const getCurrencyName = (currency) => {
    switch (currency) {
      case "USD":
        return "Dólar Estadounidense";
      case "MXN":
        return "Peso Mexicano";
      default:
        return currency;
    }
  };

  // Formatear fecha
  const formatDate = (dateString) => {
    if (!dateString) return "-";
    try {
      return new Date(dateString).toLocaleString("es-PE", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="exchange-rates-manager">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Cargando tasas de cambio...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="exchange-rates-manager">
      {/* Header */}
      <div className="manager-header">
        <div className="header-title">
          <MdTrendingUp className="header-icon" />
          <h2>Tasas de Cambio</h2>
        </div>
        <button
          className="btn-refresh"
          onClick={loadExchangeRates}
          title="Actualizar tasas"
          disabled={loading}
        >
          <MdRefresh className={loading ? "spinning" : ""} />
        </button>
      </div>

      {/* Info Banner */}
      <div className="info-banner">
        <MdInfo className="info-icon" />
        <div className="info-content">
          <p>
            <strong>Moneda base:</strong> Sol Peruano (PEN)
          </p>
          <p>
            Las tasas indican cuántos soles equivalen a 1 unidad de cada moneda
            extranjera.
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="error-banner">
          <p>{error}</p>
        </div>
      )}

      {/* Rates Cards */}
      <div className="rates-grid">
        {Object.entries(rates).map(([currency, rate]) => (
          <div
            key={currency}
            className={`rate-card ${editingRate === currency ? "editing" : ""}`}
          >
            <div className="rate-header">
              {getCurrencyIcon(currency)}
              <div className="rate-info">
                <span className="currency-code">{currency}</span>
                <span className="currency-name">
                  {getCurrencyName(currency)}
                </span>
              </div>
            </div>

            <div className="rate-content">
              {editingRate === currency ? (
                <div className="edit-mode">
                  <div className="input-group">
                    <span className="prefix">S/</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      autoFocus
                      placeholder="0.00"
                    />
                  </div>
                  <div className="edit-actions">
                    <button
                      className="btn-save"
                      onClick={handleSaveRate}
                      disabled={saving}
                    >
                      {saving ? (
                        <span className="spinner-small"></span>
                      ) : (
                        <MdSave />
                      )}
                      Guardar
                    </button>
                    <button
                      className="btn-cancel"
                      onClick={handleCancelEdit}
                      disabled={saving}
                    >
                      <MdClose />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="view-mode">
                  <div className="rate-display">
                    <span className="rate-value">
                      S/ {parseFloat(rate).toFixed(2)}
                    </span>
                    <span className="rate-label">por 1 {currency}</span>
                  </div>
                  <button
                    className="btn-edit"
                    onClick={() => handleStartEdit(currency)}
                  >
                    <MdEdit />
                    Editar
                  </button>
                </div>
              )}
            </div>

            {/* Ejemplo de conversión */}
            <div className="conversion-example">
              <span className="example-label">Ejemplo:</span>
              <span className="example-value">
                100 {currency} = S/ {(100 * parseFloat(rate)).toFixed(2)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer con última actualización */}
      <div className="manager-footer">
        <span className="last-update">
          Última actualización: {formatDate(lastUpdate)}
        </span>
      </div>
    </div>
  );
};

export default ExchangeRatesManager;
