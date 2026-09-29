import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import {
  FaClone,
  FaExchangeAlt,
  FaUserTie,
  FaUsers,
  FaSun,
  FaSnowflake,
  FaCalendarAlt,
  FaExclamationTriangle,
  FaCheck,
  FaTimes,
} from "react-icons/fa";
import {
  TEMPORADAS,
  TIPOS_TARIFA,
  TIPOS_TARIFA_EDITABLES,
  getTarifaTypeLabel,
} from "../../utils/constants";
import { formatCurrency } from "../../utils/formatters";
import "./TarifaClonePopover.scss";

const STANDARD_KEY = "estandar";
const CURRENT_TARIFF_YEAR = new Date().getFullYear();
const SEASONAL_KEYS = [TEMPORADAS.ALTA, TEMPORADAS.BAJA];

const getUsedCombinations = (tarifas) => {
  const standard = new Set();
  const seasonal = new Map();

  (tarifas || []).forEach((t) => {
    if (!t.tiene_temporada) {
      standard.add(t.tipo_tarifa);
    } else if (t.temporada) {
      if (!seasonal.has(t.tipo_tarifa)) {
        seasonal.set(t.tipo_tarifa, new Set());
      }
      seasonal.get(t.tipo_tarifa).add(t.temporada);
    }
  });

  return { standard, seasonal };
};

const getTipoStatus = (tipo, used) => {
  const hasStandard = used.standard.has(tipo);
  const usedTemporadas = used.seasonal.get(tipo) || new Set();
  const availableTemporadas = SEASONAL_KEYS.filter((t) => !usedTemporadas.has(t));

  return {
    hasStandard,
    usedTemporadas,
    availableTemporadas,
    canCreateStandard: !hasStandard,
    canCreateSeasonal: availableTemporadas.length > 0,
    isFullyUsed: hasStandard && availableTemporadas.length === 0,
  };
};

const getTemporadaLabel = (tieneTemporada, temporada) => {
  if (!tieneTemporada) return { key: STANDARD_KEY, label: "Estándar", icon: FaCalendarAlt };
  if (temporada === TEMPORADAS.ALTA) return { key: "alta", label: "Alta", icon: FaSun };
  if (temporada === TEMPORADAS.BAJA) return { key: "baja", label: "Baja", icon: FaSnowflake };
  return { key: "custom", label: temporada || "Custom", icon: FaCalendarAlt };
};

const buildCloneData = (
  sourceTarifa,
  tipoTarifa,
  tieneTemporada,
  temporada,
) => ({
  agency_ids: Array.isArray(sourceTarifa.agency_ids)
    ? sourceTarifa.agency_ids.map(Number).filter((id) => id > 0)
    : [],
  id_servicio: sourceTarifa.id_servicio,
  tipo_servicio: sourceTarifa.tipo_servicio,
  tipo_tarifa: tipoTarifa,
  anio: Number(sourceTarifa.anio || CURRENT_TARIFF_YEAR),
  tiene_temporada: tieneTemporada,
  temporada: tieneTemporada ? temporada : null,
  precio_compartido: parseFloat(sourceTarifa.precio_compartido),
  precio_privado: parseFloat(
    sourceTarifa.precio_unico
      ? sourceTarifa.precio_compartido
      : sourceTarifa.precio_privado ?? sourceTarifa.precio_compartido,
  ),
  precio_unico: Boolean(sourceTarifa.precio_unico),
  moneda: sourceTarifa.moneda || "dolares",
  tasa_cambio:
    sourceTarifa.tasa_cambio != null
      ? parseFloat(sourceTarifa.tasa_cambio)
      : sourceTarifa.moneda === "soles"
        ? null
        : 1.0,
});

const TarifaClonePopover = ({
  sourceTarifa,
  existingTarifas,
  onClone,
  disabled = false,
  buttonClassName = "",
  buttonTitle = "Generar tarifa desde esta",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const [placement, setPlacement] = useState("bottom");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const scopedExistingTarifas = useMemo(() => {
    const sourceAgencies = new Set(
      (Array.isArray(sourceTarifa?.agency_ids)
        ? sourceTarifa.agency_ids
        : []
      ).map(Number).filter((id) => id > 0),
    );
    const sourceYear = Number(sourceTarifa?.anio || CURRENT_TARIFF_YEAR);
    return (existingTarifas || []).filter((tarifa) => {
      const tarifaAgencies = Array.isArray(tarifa?.agency_ids)
        ? tarifa.agency_ids
        : [];
      return (
        Number(tarifa?.anio || CURRENT_TARIFF_YEAR) === sourceYear &&
        tarifaAgencies.map(Number).some((id) => sourceAgencies.has(id))
      );
    });
  }, [existingTarifas, sourceTarifa?.agency_ids, sourceTarifa?.anio]);
  const used = useMemo(
    () => getUsedCombinations(scopedExistingTarifas),
    [scopedExistingTarifas],
  );
  const otherTipo =
    sourceTarifa?.tipo_tarifa === TIPOS_TARIFA.INTERNA
      ? TIPOS_TARIFA.EXTERNA
      : TIPOS_TARIFA.INTERNA;

  const getDefaultState = () => {
    const defaultTipo = getTipoStatus(otherTipo, used).isFullyUsed
      ? sourceTarifa?.tipo_tarifa || otherTipo
      : otherTipo;
    const status = getTipoStatus(defaultTipo, used);
    return {
      tipoTarifa: defaultTipo,
      tieneTemporada: !status.canCreateStandard,
      temporada: status.canCreateStandard ? null : status.availableTemporadas[0] || null,
    };
  };

  const [tipoTarifa, setTipoTarifa] = useState(getDefaultState().tipoTarifa);
  const [tieneTemporada, setTieneTemporada] = useState(getDefaultState().tieneTemporada);
  const [temporada, setTemporada] = useState(getDefaultState().temporada);
  const [validationError, setValidationError] = useState(null);

  // Reset state when opening
  useEffect(() => {
    if (!isOpen) return;
    const defaults = getDefaultState();
    setTipoTarifa(defaults.tipoTarifa);
    setTieneTemporada(defaults.tieneTemporada);
    setTemporada(defaults.temporada);
    setValidationError(null);
    setIsSubmitting(false);
  }, [isOpen, sourceTarifa, existingTarifas]);

  // Force season when selected type already has standard
  useEffect(() => {
    const status = getTipoStatus(tipoTarifa, used);
    if (!status.canCreateStandard) {
      setTieneTemporada(true);
      setTemporada((prev) =>
        prev && status.availableTemporadas.includes(prev)
          ? prev
          : status.availableTemporadas[0] || null,
      );
    }
  }, [tipoTarifa, used]);

  // Validation
  useEffect(() => {
    const status = getTipoStatus(tipoTarifa, used);

    if (status.isFullyUsed) {
      setValidationError(
        `El tipo "${tipoTarifa}" ya tiene todas sus combinaciones ocupadas.`,
      );
      return;
    }

    if (!tieneTemporada) {
      if (!status.canCreateStandard) {
        setValidationError(
          `Ya existe tarifa estándar para "${tipoTarifa}". Elige una temporada.`,
        );
        return;
      }
    } else if (!temporada || !status.availableTemporadas.includes(temporada)) {
      setValidationError(
        `La temporada seleccionada no está disponible para "${tipoTarifa}".`,
      );
      return;
    }

    setValidationError(null);
  }, [tipoTarifa, tieneTemporada, temporada, used]);

  // Positioning
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !popoverRef.current) return;

    const tr = triggerRef.current.getBoundingClientRect();
    const pr = popoverRef.current.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const margin = 8;

    let top = tr.bottom + margin;
    let left = tr.left + tr.width / 2 - pr.width / 2;

    left = Math.max(margin, Math.min(left, viewportW - pr.width - margin));

    if (top + pr.height + margin > viewportH && tr.top - pr.height - margin > 0) {
      top = tr.top - pr.height - margin;
      setPlacement("top");
    } else {
      setPlacement("bottom");
    }

    setPosition({ top, left });
  }, [isOpen, tipoTarifa, tieneTemporada, temporada]);

  // Close on outside click / escape / scroll / resize
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (popoverRef.current?.contains(e.target)) return;
      setIsOpen(false);
    };

    const handleKey = (e) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    const handleClose = () => setIsOpen(false);

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleClose, true);
    window.addEventListener("resize", handleClose);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleClose, true);
      window.removeEventListener("resize", handleClose);
    };
  }, [isOpen]);

  const handleOpen = () => {
    if (disabled || isSubmitting) return;
    setIsOpen((prev) => !prev);
  };

  const handleTipoChange = (tipo) => {
    if (getTipoStatus(tipo, used).isFullyUsed) return;
    setTipoTarifa(tipo);
  };

  const handleTemporadaChange = (key) => {
    if (key === STANDARD_KEY) {
      setTieneTemporada(false);
      setTemporada(null);
    } else {
      setTieneTemporada(true);
      setTemporada(key);
    }
  };

  const handleClone = async () => {
    if (validationError || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onClone(buildCloneData(sourceTarifa, tipoTarifa, tieneTemporada, temporada));
      setIsOpen(false);
    } catch (error) {
      setValidationError(error.message || "Error al generar tarifa");
    } finally {
      setIsSubmitting(false);
    }
  };

  const currencySymbol = sourceTarifa.moneda === "soles" ? "S/" : "$";
  const sourceTemp = getTemporadaLabel(sourceTarifa.tiene_temporada, sourceTarifa.temporada);
  const SourceTempIcon = sourceTemp.icon;
  const destStatus = getTipoStatus(tipoTarifa, used);

  const popoverStyle = position
    ? { position: "fixed", top: position.top, left: position.left }
    : { position: "fixed", top: -9999, left: 0 };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`tarifa-clone-trigger ${buttonClassName} ${isOpen ? "active" : ""}`}
        onClick={handleOpen}
        disabled={disabled || isSubmitting}
        title={buttonTitle}
      >
        <FaClone />
      </button>

      {isOpen &&
        ReactDOM.createPortal(
          <div
            ref={popoverRef}
            className={`tarifa-clone-popover ${placement}`}
            style={popoverStyle}
          >
            <div className="clone-popover-arrow" />

            <div className="clone-popover-header">
              <span className="clone-popover-title">
                <FaClone /> Generar tarifa
              </span>
              <button
                type="button"
                className="clone-popover-close"
                onClick={() => setIsOpen(false)}
                title="Cerrar"
              >
                <FaTimes />
              </button>
            </div>

            <div className="clone-popover-source">
              <span className={`source-mini tipo ${sourceTarifa.tipo_tarifa}`}>
                {sourceTarifa.tipo_tarifa === TIPOS_TARIFA.INTERNA ? <FaUserTie /> : <FaUsers />}
                {getTarifaTypeLabel(sourceTarifa.tipo_tarifa)}
              </span>
              <span className={`source-mini temp ${sourceTemp.key}`}>
                <SourceTempIcon />
                {sourceTemp.label}
              </span>
              <span className="source-mini price">
                {formatCurrency(sourceTarifa.precio_compartido, currencySymbol)}
              </span>
            </div>

            <div className="clone-popover-body">
              <div className="clone-popover-group">
                <label>Tipo destino</label>
                <div className="clone-popover-options">
                  {TIPOS_TARIFA_EDITABLES.map((tipo) => {
                    const status = getTipoStatus(tipo, used);
                    const disabledBtn = status.isFullyUsed;
                    return (
                      <button
                        key={tipo}
                        type="button"
                        className={`clone-option tipo ${tipoTarifa === tipo ? "active " + tipo : ""} ${disabledBtn ? "disabled" : ""}`}
                        onClick={() => handleTipoChange(tipo)}
                        disabled={disabledBtn}
                        title={
                          disabledBtn
                            ? "Sin espacio"
                            : status.hasStandard
                              ? `Estándar ocupada - temporadas: ${status.availableTemporadas.join(", ")}`
                              : "Disponible"
                        }
                      >
                        {tipo === TIPOS_TARIFA.INTERNA ? <FaUserTie /> : <FaUsers />}
                        <span>{getTarifaTypeLabel(tipo)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="clone-popover-group">
                <label>Temporada destino</label>
                <div className="clone-popover-options">
                  <button
                    type="button"
                    className={`clone-option temp ${!tieneTemporada ? "active estandar" : ""} ${!destStatus.canCreateStandard ? "disabled" : ""}`}
                    onClick={() => handleTemporadaChange(STANDARD_KEY)}
                    disabled={!destStatus.canCreateStandard}
                    title={
                      destStatus.canCreateStandard
                        ? "Tarifa estándar"
                        : "Estándar ya existe"
                    }
                  >
                    <FaCalendarAlt />
                    <span>Std</span>
                  </button>

                  {SEASONAL_KEYS.map((key) => {
                    const disabledBtn = !destStatus.availableTemporadas.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`clone-option temp ${tieneTemporada && temporada === key ? "active " + key : ""} ${disabledBtn ? "disabled" : ""}`}
                        onClick={() => handleTemporadaChange(key)}
                        disabled={disabledBtn}
                        title={disabledBtn ? `Ocupada` : `Temporada ${key}`}
                      >
                        {key === TEMPORADAS.ALTA ? <FaSun /> : <FaSnowflake />}
                        <span>{key === TEMPORADAS.ALTA ? "Alta" : "Baja"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {validationError && (
              <div className="clone-popover-error">
                <FaExclamationTriangle />
                <span>{validationError}</span>
              </div>
            )}

            <div className="clone-popover-actions">
              <button
                type="button"
                className="clone-btn-generate"
                onClick={handleClone}
                disabled={isSubmitting || validationError !== null}
              >
                {isSubmitting ? "Generando..." : <><FaCheck /> Generar</>}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

export default TarifaClonePopover;
