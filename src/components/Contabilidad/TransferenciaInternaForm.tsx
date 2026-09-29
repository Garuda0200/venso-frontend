import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  FaExchangeAlt,
  FaSync,
  FaInfoCircle,
  FaTimes,
  FaCheck,
} from "react-icons/fa";
import contabilidadService from "../../services/contabilidadService";
import SecureStorage from "../../utils/secureStorage";
import EvidenciaUpload from "./shared/EvidenciaUpload";
import "./TransferenciaInternaForm.scss";

/**
 * Componente modal de formulario para crear transferencias internas
 * Separado de TransferenciasInternas para mejor organización
 */
const TransferenciaInternaForm = ({
  isOpen,
  onClose,
  saldos = [],
  selectedYear,
  selectedPlatform,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    saldo_origen_id: "",
    saldo_destino_id: "",
    monto_origen: "",
    monto_destino: "",
    tasa_cambio: "",
    descripcion: "",
  });
  const [validated, setValidated] = useState(false);

  // Estado para subida de evidencia post-creación
  const [createdTransferencia, setCreatedTransferencia] = useState(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [showSuccessStep, setShowSuccessStep] = useState(false);

  // Obtener info del saldo origen seleccionado
  const saldoOrigen = saldos.find(
    (s) => s.id === parseInt(formData.saldo_origen_id),
  );

  // Obtener info del saldo destino seleccionado
  const saldoDestino = saldos.find(
    (s) => s.id === parseInt(formData.saldo_destino_id),
  );

  // Verificar si es cambio de moneda
  const esCambioMoneda =
    saldoOrigen && saldoDestino && saldoOrigen.moneda !== saldoDestino.moneda;

  // Filtrar saldos válidos para destino (diferente al origen)
  const saldosDestino = saldos.filter(
    (s) => s.id !== parseInt(formData.saldo_origen_id),
  );

  // Reset form cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen]);

  // Calcular monto destino automáticamente cuando cambie la tasa
  useEffect(() => {
    if (esCambioMoneda && formData.monto_origen && formData.tasa_cambio) {
      const montoOrigen = parseFloat(formData.monto_origen);
      const tasa = parseFloat(formData.tasa_cambio);

      if (montoOrigen > 0 && tasa > 0) {
        let montoDestino;
        // Si origen es dólares -> destino es soles: multiplicar por tasa
        // Si origen es soles -> destino es dólares: dividir por tasa
        if (saldoOrigen.moneda === "dolares") {
          montoDestino = montoOrigen * tasa;
        } else {
          montoDestino = montoOrigen / tasa;
        }
        setFormData((prev) => ({
          ...prev,
          monto_destino: montoDestino.toFixed(2),
        }));
      }
    } else if (!esCambioMoneda && formData.monto_origen) {
      setFormData((prev) => ({
        ...prev,
        monto_destino: formData.monto_origen,
        tasa_cambio: "",
      }));
    }
  }, [
    formData.monto_origen,
    formData.tasa_cambio,
    esCambioMoneda,
    saldoOrigen?.moneda,
  ]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const resetForm = () => {
    setFormData({
      saldo_origen_id: "",
      saldo_destino_id: "",
      monto_origen: "",
      monto_destino: "",
      tasa_cambio: "",
      descripcion: "",
    });
    setValidated(false);
    setCreatedTransferencia(null);
    setShowSuccessStep(false);
  };

  const handleCloseModal = () => {
    const wasCreated = !!createdTransferencia;
    resetForm();
    onClose();
    if (wasCreated && onSuccess) {
      onSuccess();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;

    if (form.checkValidity() === false) {
      e.stopPropagation();
      setValidated(true);
      return;
    }

    // Validaciones adicionales
    if (!formData.saldo_origen_id || !formData.saldo_destino_id) {
      toast.error("Debe seleccionar cuenta origen y destino");
      return;
    }

    if (formData.saldo_origen_id === formData.saldo_destino_id) {
      toast.error("La cuenta origen y destino deben ser diferentes");
      return;
    }

    if (!formData.monto_origen || parseFloat(formData.monto_origen) <= 0) {
      toast.error("El monto debe ser mayor a 0");
      return;
    }

    // Verificar saldo suficiente (excepto cuenta crédito)
    if (saldoOrigen && saldoOrigen.tipo !== "cuenta_credito") {
      if (
        parseFloat(formData.monto_origen) > parseFloat(saldoOrigen.saldo_actual)
      ) {
        toast.error(
          `Saldo insuficiente. Disponible: ${saldoOrigen.moneda === "soles" ? "S/" : "$"} ${parseFloat(saldoOrigen.saldo_actual).toFixed(2)}`,
        );
        return;
      }
    }

    if (
      esCambioMoneda &&
      (!formData.tasa_cambio || parseFloat(formData.tasa_cambio) <= 0)
    ) {
      toast.error("Debe ingresar la tasa de cambio para conversión de moneda");
      return;
    }

    setLoading(true);
    try {
      // Obtener usuario actual
      const user = SecureStorage.getItem("user") || {};
      const createdBy =
        user.dniuser || SecureStorage.getItem("dniuser") || "system";

      // Mapear platform de frontend (venso/mil) a backend (b2c/b2b)
      const platformMap = {
        venso: "b2c",
        mil: "b2b",
      };
      const backendPlatform = platformMap[selectedPlatform] || "all";
      const businessType = selectedPlatform === "mil" ? "b2b" : "b2c";

      const payload = {
        saldo_origen_id: parseInt(formData.saldo_origen_id),
        saldo_destino_id: parseInt(formData.saldo_destino_id),
        monto_origen: formData.monto_origen,
        descripcion: formData.descripcion.trim() || "Transferencia interna",
        created_by: createdBy,
        // Incluir platform y business_type del contexto seleccionado
        platform: backendPlatform,
        business_type: businessType,
      };

      // Agregar tasa si hay cambio de moneda
      if (esCambioMoneda && formData.tasa_cambio) {
        payload.tasa_cambio = formData.tasa_cambio;
        payload.monto_destino = formData.monto_destino;
      }

      console.log(" Enviando transferencia con payload:", payload);
      const response = await contabilidadService.createTransferencia(payload);

      if (response.success) {
        toast.success("Transferencia realizada correctamente");
        // Guardar la transferencia creada para poder subir evidencia
        const transferencia = response.data?.transferencia || response.data;
        setCreatedTransferencia(transferencia);
        setShowSuccessStep(true);
        // No cerrar el modal aún para permitir subir evidencia
      } else {
        toast.error(response.message || "Error al realizar la transferencia");
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Manejar subida de evidencia usando EvidenciaUpload
  const handleUploadMedia = async (file) => {
    if (!createdTransferencia?.id) return;

    setUploadingMedia(true);
    try {
      const response = await contabilidadService.uploadTransferenciaMedia(
        createdTransferencia.id,
        file,
      );
      if (response.success) {
        toast.success("Evidencia subida correctamente");
        // Actualizar la transferencia creada con los nuevos datos de media
        setCreatedTransferencia(response.data);
      } else {
        toast.error(response.message || "Error al subir evidencia");
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setUploadingMedia(false);
    }
  };

  // Helper para mostrar etiqueta de tipo de cuenta
  const getTipoLabel = (tipo) => {
    const labels = {
      efectivo: "Efectivo",
      cuenta_debito: "Cuenta Débito",
      cuenta_credito: "Cuenta Crédito",
      global66: "Global66",
      paypal: "PayPal",
      western_union: "Western Union",
      wetravel: "WeTravel",
    };
    return labels[tipo] || tipo;
  };

  // Helper para formatear saldo en la opción del select
  const formatSaldoOption = (saldo) => {
    const monedaSymbol = saldo.moneda === "soles" ? "S/" : "$";
    return `${getTipoLabel(saldo.tipo)} (${saldo.moneda === "soles" ? "Soles" : "Dólares"}) - ${monedaSymbol} ${parseFloat(saldo.saldo_actual).toFixed(2)}`;
  };

  // Prevenir cambio con rueda del mouse y flechas
  const preventWheelChange = (e) => e.target.blur();
  const preventArrowChange = (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
  };

  // Preparar currentFile para EvidenciaUpload
  const getCurrentFileForEvidence = () => {
    if (!createdTransferencia?.media_tigris_url) return null;
    return {
      filename: createdTransferencia.media_filename,
      file_size: createdTransferencia.media_file_size,
      file_type: createdTransferencia.media_file_type,
      tigris_url: createdTransferencia.media_tigris_url,
    };
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay transferencia-form-overlay">
      <div className="transferencia-form-modal">
        <div className="modal-header">
          <h3>
            {showSuccessStep ? (
              <>
                <FaCheck /> Transferencia Exitosa
              </>
            ) : (
              <>
                <FaExchangeAlt /> Nueva Transferencia Interna
              </>
            )}
          </h3>
          <button className="close-btn" onClick={handleCloseModal}>
            <FaTimes />
          </button>
        </div>

        {/* Paso de éxito con opción de subir evidencia */}
        {showSuccessStep ? (
          <div className="modal-body success-step">
            <div className="success-message">
              <div className="success-icon">
                <FaCheck />
              </div>
              <h4>¡Transferencia realizada!</h4>
              <p>La transferencia se ha registrado correctamente.</p>
            </div>

            {/* Sección de subida de evidencia usando EvidenciaUpload */}
            <div className="evidencia-form-section">
              <EvidenciaUpload
                currentFile={getCurrentFileForEvidence()}
                onUpload={handleUploadMedia}
                uploading={uploadingMedia}
                disabled={uploadingMedia}
                label="Evidencia de Pago (opcional)"
                placeholder="Arrastra el comprobante de la transferencia"
              />
            </div>

            {/* Botón de cerrar */}
            <div className="modal-actions">
              <button
                type="button"
                className="btn-submit"
                onClick={handleCloseModal}
              >
                <FaCheck /> Finalizar
              </button>
            </div>
          </div>
        ) : (
          <form
            className={`modal-body ${validated ? "validated" : ""}`}
            noValidate
            onSubmit={handleSubmit}
          >
            {/* Context Info */}
            <div className="context-info">
              <span className="context-badge year">
                {" "}
                Año {selectedYear || new Date().getFullYear()}
              </span>
              <span className="context-badge platform">
                {selectedPlatform === "mil" ? " MIL (B2B)" : " Venso (B2C)"}
              </span>
            </div>

            {/* Layout horizontal: Origen y Destino lado a lado */}
            <div className="transfer-horizontal-layout">
              {/* Columna Origen */}
              <div className="transfer-column origin-column">
                <div className="column-header origin">
                  <span className="icon"></span> CUENTA ORIGEN
                </div>

                <div className="form-section">
                  <select
                    name="saldo_origen_id"
                    value={formData.saldo_origen_id}
                    onChange={handleInputChange}
                    required
                    className="form-control"
                  >
                    <option value="">Seleccionar cuenta origen...</option>
                    {saldos.map((saldo) => (
                      <option key={`origen-${saldo.id}`} value={saldo.id}>
                        {formatSaldoOption(saldo)}
                      </option>
                    ))}
                  </select>
                  {saldoOrigen && (
                    <div className="saldo-info origin">
                      <span className="label">Saldo disponible:</span>
                      <span className="value">
                        {saldoOrigen.moneda === "soles" ? "S/" : "$"}{" "}
                        {parseFloat(saldoOrigen.saldo_actual).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Monto a transferir */}
                <div className="form-section">
                  <label className="section-label">Monto a transferir</label>
                  <div className="input-group">
                    <span className="currency-prefix">
                      {saldoOrigen
                        ? saldoOrigen.moneda === "soles"
                          ? "S/"
                          : "$"
                        : "?"}
                    </span>
                    <input
                      type="number"
                      name="monto_origen"
                      value={formData.monto_origen}
                      onChange={handleInputChange}
                      placeholder="0.00"
                      min="0.01"
                      step="0.01"
                      required
                      className="form-control"
                      onWheel={preventWheelChange}
                      onKeyDown={preventArrowChange}
                      disabled={!saldoOrigen}
                    />
                  </div>
                </div>
              </div>

              {/* Flecha de transferencia central */}
              <div className="transfer-arrow-center">
                <div className="arrow-container">
                  <FaExchangeAlt className="arrow-icon" />
                </div>
              </div>

              {/* Columna Destino */}
              <div className="transfer-column destination-column">
                <div className="column-header destination">
                  <span className="icon"></span> CUENTA DESTINO
                </div>

                <div className="form-section">
                  <select
                    name="saldo_destino_id"
                    value={formData.saldo_destino_id}
                    onChange={handleInputChange}
                    required
                    className="form-control"
                    disabled={!saldoOrigen}
                  >
                    <option value="">Seleccionar cuenta destino...</option>
                    {saldosDestino.map((saldo) => (
                      <option key={`destino-${saldo.id}`} value={saldo.id}>
                        {formatSaldoOption(saldo)}
                      </option>
                    ))}
                  </select>
                  {saldoDestino && (
                    <div className="saldo-info destination">
                      <span className="label">Saldo actual:</span>
                      <span className="value">
                        {saldoDestino.moneda === "soles" ? "S/" : "$"}{" "}
                        {parseFloat(saldoDestino.saldo_actual).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Monto a recibir (si hay cambio de moneda) */}
                {esCambioMoneda && (
                  <div className="form-section">
                    <label className="section-label">Monto a recibir</label>
                    <div className="result-value-box">
                      <span className="currency">
                        {saldoDestino?.moneda === "soles" ? "S/" : "$"}
                      </span>
                      <span className="amount">
                        {formData.monto_destino || "0.00"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Tasa de cambio (solo si hay cambio de moneda) */}
            {esCambioMoneda && (
              <div className="form-section exchange-section">
                <div className="exchange-header">
                  <FaInfoCircle className="info-icon" />
                  <span>Conversión de Moneda</span>
                </div>
                <div className="exchange-row">
                  <div className="exchange-input">
                    <label>Tasa de Cambio (S/ por $1)</label>
                    <input
                      type="number"
                      name="tasa_cambio"
                      value={formData.tasa_cambio}
                      onChange={handleInputChange}
                      placeholder="Ej: 3.75"
                      min="0.01"
                      step="0.0001"
                      required
                      className="form-control"
                      onWheel={preventWheelChange}
                      onKeyDown={preventArrowChange}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Descripción */}
            <div className="form-section">
              <label className="section-label">
                <span className="icon"></span> Descripción
              </label>
              <input
                type="text"
                name="descripcion"
                value={formData.descripcion}
                onChange={handleInputChange}
                placeholder="Motivo de la transferencia (opcional)"
                className="form-control"
                maxLength={255}
              />
            </div>

            {/* Resumen de la transferencia */}
            {saldoOrigen && saldoDestino && formData.monto_origen && (
              <div className="transfer-summary">
                <h4>Resumen</h4>
                <div className="summary-row">
                  <span className="summary-label">De:</span>
                  <span className="summary-value">
                    {getTipoLabel(saldoOrigen.tipo)} (
                    {saldoOrigen.moneda === "soles" ? "Soles" : "Dólares"})
                  </span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">Sale:</span>
                  <span className="summary-value negative">
                    - {saldoOrigen.moneda === "soles" ? "S/" : "$"}{" "}
                    {parseFloat(formData.monto_origen).toFixed(2)}
                  </span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">A:</span>
                  <span className="summary-value">
                    {getTipoLabel(saldoDestino.tipo)} (
                    {saldoDestino.moneda === "soles" ? "Soles" : "Dólares"})
                  </span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">Llega:</span>
                  <span className="summary-value positive">
                    + {saldoDestino.moneda === "soles" ? "S/" : "$"}{" "}
                    {esCambioMoneda
                      ? formData.monto_destino
                      : parseFloat(formData.monto_origen).toFixed(2)}
                  </span>
                </div>
                {esCambioMoneda && formData.tasa_cambio && (
                  <div className="summary-row exchange">
                    <span className="summary-label">Tipo de cambio:</span>
                    <span className="summary-value">
                      S/ {parseFloat(formData.tasa_cambio).toFixed(4)} por $1
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Botones */}
            <div className="modal-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={handleCloseModal}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-submit"
                disabled={
                  loading ||
                  !saldoOrigen ||
                  !saldoDestino ||
                  !formData.monto_origen
                }
              >
                {loading ? (
                  <>
                    <FaSync className="spin" /> Procesando...
                  </>
                ) : (
                  <>
                    <FaExchangeAlt /> Realizar Transferencia
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default TransferenciaInternaForm;
