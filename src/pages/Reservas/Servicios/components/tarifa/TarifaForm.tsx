import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FaCalendarAlt,
  FaCheck,
  FaChevronDown,
  FaExchangeAlt,
  FaEye,
  FaEyeSlash,
  FaSnowflake,
  FaSun,
} from "react-icons/fa";
import {
  TEMPORADAS,
  TIPOS_TARIFA,
  TIPOS_TARIFA_EDITABLES,
  getTarifaTypeLabel,
  normalizeEditableTariffType,
} from "../../utils/constants";
import { EXCHANGE_RATE } from "../../../../../utils/constants";
import useAuditInfo from "../../hooks/useAuditInfo";
import TariffAgencyCombobox from "../../../../../components/common/TariffAgencyCombobox/TariffAgencyCombobox";
import { fetchTarifasByServicio } from "../../services/api";
import "./TarifaForm.scss";

const STANDARD_KEY = "estandar";
const CURRENT_TARIFF_YEAR = new Date().getFullYear();
const TARIFF_YEAR_OPTIONS = Array.from(
  { length: 9 },
  (_, index) => CURRENT_TARIFF_YEAR - 3 + index,
);

const toMoneyString = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "";
};

const TarifaForm = ({
  tarifa = null,
  idServicio,
  tipoServicio,
  onSubmit,
  isSubmitting,
  existingTarifasData,
  agencyId = null,
}) => {
  const precioInputRef = useRef<HTMLInputElement | null>(null);
  const { userId } = useAuditInfo();
  const isEditMode = Boolean(tarifa);

  const initialType = normalizeEditableTariffType(tarifa?.tipo_tarifa);
  const initialCurrency = tarifa?.moneda || "dolares";
  const resolvedAgencyIds = Array.isArray(tarifa?.agency_ids)
    ? tarifa.agency_ids.map(Number).filter((id) => id > 0)
    : [Number(agencyId || 0)].filter((id) => id > 0);

  const [formData, setFormData] = useState({
    agency_ids: resolvedAgencyIds,
    id_servicio: idServicio,
    tipo_servicio: tipoServicio,
    tipo_tarifa: initialType,
    anio: Number(tarifa?.anio || CURRENT_TARIFF_YEAR),
    tiene_temporada: Boolean(tarifa?.tiene_temporada),
    temporada: tarifa?.temporada || null,
    precio_compartido: tarifa?.precio_compartido?.toString() || "",
    precio_privado: tarifa?.precio_privado?.toString() || "",
    precio_unico:
      tarifa?.precio_unico !== undefined ? Boolean(tarifa.precio_unico) : true,
    moneda: initialCurrency,
    tasa_cambio:
      tarifa?.tasa_cambio?.toString() ||
      (initialCurrency === "soles" ? EXCHANGE_RATE.toString() : "1.0"),
    created_by: userId,
  });

  const [existingTarifas, setExistingTarifas] = useState<any[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [seasonExpanded, setSeasonExpanded] = useState(false);
  const [customSeason, setCustomSeason] = useState(
    tarifa?.tiene_temporada &&
      ![TEMPORADAS.ALTA, TEMPORADAS.BAJA].includes(tarifa?.temporada)
      ? tarifa?.temporada || ""
      : "",
  );

  useEffect(() => {
    const timer = window.setTimeout(() => precioInputRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, []);


  useEffect(() => {
    let mounted = true;
    const visibleRows = Array.isArray(existingTarifasData) ? existingTarifasData : [];
    setExistingTarifas(visibleRows);
    if (!idServicio || !tipoServicio) return () => { mounted = false; };

    // Duplicate validation must inspect every agency, not only the current
    // catalog filter shown in Servicios.
    fetchTarifasByServicio(idServicio, tipoServicio)
      .then((rows) => {
        if (!mounted) return;
        const allRows = Array.isArray(rows) ? rows : [];
        const merged = new Map();
        [...visibleRows, ...allRows].forEach((item) => {
          const key = item?.id_tarifa ?? `${item?.tipo_tarifa}:${item?.temporada || "std"}`;
          merged.set(key, item);
        });
        setExistingTarifas(Array.from(merged.values()));
      })
      .catch(() => mounted && setExistingTarifas(visibleRows));

    return () => { mounted = false; };
  }, [existingTarifasData, idServicio, tipoServicio]);

  const scopedExisting = useMemo(() => {
    const selected = new Set((formData.agency_ids || []).map(Number));
    return existingTarifas.filter((item) => {
      if (isEditMode && Number(item.id_tarifa) === Number(tarifa?.id_tarifa)) return false;
      const itemAgencies = Array.isArray(item?.agency_ids)
        ? item.agency_ids.map(Number).filter((id) => id > 0)
        : [];
      const itemYear = Number(item?.anio || CURRENT_TARIFF_YEAR);
      return (
        itemYear === Number(formData.anio) &&
        itemAgencies.some((id) => selected.has(id))
      );
    });
  }, [
    existingTarifas,
    formData.agency_ids,
    formData.anio,
    isEditMode,
    tarifa?.id_tarifa,
  ]);

  const usedForType = useMemo(() => {
    const standard = new Set<string>();
    const seasonal = new Set<string>();

    scopedExisting.forEach((item) => {
      if (item.tipo_tarifa !== formData.tipo_tarifa) return;
      if (item.tiene_temporada && item.temporada) seasonal.add(item.temporada);
      else standard.add(STANDARD_KEY);
    });

    return { standard, seasonal };
  }, [scopedExisting, formData.tipo_tarifa]);

  const selectedSeasonKey = formData.tiene_temporada
    ? formData.temporada || customSeason
    : STANDARD_KEY;

  const isCombinationUsed = (seasonKey) =>
    seasonKey === STANDARD_KEY
      ? usedForType.standard.has(STANDARD_KEY)
      : usedForType.seasonal.has(seasonKey);

  const updateField = (name, value) => {
    setFormData((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const selectTariffType = (type) => {
    updateField("tipo_tarifa", type);
    setErrors((current) => {
      const next = { ...current };
      delete next.combinacion;
      return next;
    });
    window.setTimeout(() => precioInputRef.current?.focus(), 80);
  };

  const selectSeason = (seasonKey) => {
    setErrors((current) => {
      const next = { ...current };
      delete next.temporada;
      delete next.combinacion;
      return next;
    });

    if (seasonKey === STANDARD_KEY) {
      setCustomSeason("");
      setFormData((current) => ({
        ...current,
        tiene_temporada: false,
        temporada: null,
      }));
      return;
    }

    setFormData((current) => ({
      ...current,
      tiene_temporada: true,
      temporada: seasonKey === "otra" ? customSeason : seasonKey,
    }));
  };

  const switchCurrency = (currency) => {
    setFormData((current) => {
      if (current.moneda === currency) return current;
      const rate = Number.parseFloat(current.tasa_cambio) || EXCHANGE_RATE;
      const convert = (value) => {
        const amount = Number.parseFloat(value);
        if (!Number.isFinite(amount)) return "";
        return currency === "soles"
          ? (amount * rate).toFixed(2)
          : (amount / rate).toFixed(2);
      };

      const shared = convert(current.precio_compartido);
      return {
        ...current,
        moneda: currency,
        tasa_cambio:
          currency === "soles" ? rate.toString() : current.tasa_cambio,
        precio_compartido: shared,
        precio_privado: current.precio_unico
          ? shared
          : convert(current.precio_privado),
      };
    });
  };

  const toggleUniquePrice = () => {
    setFormData((current) => {
      const nextUnique = !current.precio_unico;
      return {
        ...current,
        precio_unico: nextUnique,
        precio_privado: nextUnique
          ? current.precio_compartido
          : current.precio_privado || current.precio_compartido,
      };
    });
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    const shared = Number.parseFloat(formData.precio_compartido);
    const privatePrice = Number.parseFloat(formData.precio_privado);

    if (!Array.isArray(formData.agency_ids) || formData.agency_ids.length === 0) nextErrors.agency_ids = "Selecciona al menos una agencia.";
    if (!TIPOS_TARIFA_EDITABLES.includes(formData.tipo_tarifa)) {
      nextErrors.tipo_tarifa = "Selecciona una visibilidad válida.";
    }
    if (!Number.isInteger(Number(formData.anio)) || Number(formData.anio) < 2000 || Number(formData.anio) > 2100) {
      nextErrors.anio = "Selecciona un año válido.";
    }
    if (formData.tiene_temporada && !formData.temporada) {
      nextErrors.temporada = "Selecciona o escribe una temporada.";
    }
    if (isCombinationUsed(selectedSeasonKey)) {
      nextErrors.combinacion = `Ya existe una tarifa ${getTarifaTypeLabel(formData.tipo_tarifa).toLowerCase()} para ${selectedSeasonKey === STANDARD_KEY ? "vigencia estándar" : `temporada ${selectedSeasonKey}`}.`;
    }
    if (!Number.isFinite(shared) || shared <= 0) {
      nextErrors.precio_compartido = "Ingresa un precio mayor a cero.";
    }
    if (!formData.precio_unico && (!Number.isFinite(privatePrice) || privatePrice <= 0)) {
      nextErrors.precio_privado = "Ingresa el precio privado.";
    }
    if (
      formData.moneda === "soles" &&
      (!Number.isFinite(Number.parseFloat(formData.tasa_cambio)) ||
        Number.parseFloat(formData.tasa_cambio) <= 0)
    ) {
      nextErrors.tasa_cambio = "Ingresa una tasa de cambio válida.";
    }

    setErrors(nextErrors);
    if (nextErrors.temporada || nextErrors.combinacion) {
      setSeasonExpanded(true);
    }
    return Object.keys(nextErrors).length === 0;
  };

  const submit = (event) => {
    event.preventDefault();
    if (!validate()) return;

    const shared = Number.parseFloat(formData.precio_compartido);
    const privatePrice = formData.precio_unico
      ? shared
      : Number.parseFloat(formData.precio_privado);

    onSubmit({
      ...formData,
      agency_ids: formData.agency_ids.map(Number),
      anio: Number(formData.anio),
      tipo_tarifa: normalizeEditableTariffType(formData.tipo_tarifa),
      temporada: formData.tiene_temporada ? formData.temporada : null,
      precio_compartido: shared,
      precio_privado: privatePrice,
      tasa_cambio:
        formData.moneda === "soles"
          ? Number.parseFloat(formData.tasa_cambio) || EXCHANGE_RATE
          : 1,
    });
  };

  const currencySymbol = formData.moneda === "soles" ? "S/" : "$";
  const seasonLabel = formData.tiene_temporada
    ? formData.temporada || "Sin nombre"
    : "Estándar";

  return (
    <form className="tarifa-form-compact" onSubmit={submit}>
      <div className="tf__group tf__agency-scope">
        <TariffAgencyCombobox
          multiple
          value={formData.agency_ids}
          onChange={(value) => {
            const agencyIds = Array.isArray(value) ? value.map(Number) : [Number(value)];
            setFormData((current) => ({
              ...current,
              agency_ids: agencyIds,
            }));
            setErrors((current) => {
              const next = { ...current };
              delete next.agency_ids;
              delete next.combinacion;
              return next;
            });
          }}
          disabled={isSubmitting}
          label="Agencias que pueden usar esta tarifa"
        />
        {errors.agency_ids && <p className="tf__error">{errors.agency_ids}</p>}
      </div>

      <div className="tf__group tf__year-scope">
        <span className="tf__group-label">Año de tarifa</span>
        <label className="tf__field tf__year-field">
          <select
            value={formData.anio}
            onChange={(event) => {
              updateField("anio", Number(event.target.value));
              setErrors((current) => {
                const next = { ...current };
                delete next.combinacion;
                return next;
              });
            }}
            disabled={isSubmitting}
          >
            {TARIFF_YEAR_OPTIONS.map((year) => (
              <option key={year} value={year}>
                {year}{year === CURRENT_TARIFF_YEAR ? " · actual" : ""}
              </option>
            ))}
          </select>
          {errors.anio && <em>{errors.anio}</em>}
        </label>
      </div>

      <div className="tf__group tf__visibility-scope">
        <span className="tf__group-label">Visibilidad</span>
        <div className="tf__visibility" role="group" aria-label="Visibilidad de tarifa">
          {TIPOS_TARIFA_EDITABLES.map((type) => {
            const confidential = type === TIPOS_TARIFA.INTERNA;
            return (
              <button
                key={type}
                type="button"
                className={formData.tipo_tarifa === type ? "active" : ""}
                onClick={() => selectTariffType(type)}
                disabled={isSubmitting}
                aria-pressed={formData.tipo_tarifa === type}
              >
                <span className="tf__visibility-icon">
                  {confidential ? <FaEyeSlash /> : <FaEye />}
                </span>
                <span>{getTarifaTypeLabel(type)}</span>
                {formData.tipo_tarifa === type && <FaCheck />}
              </button>
            );
          })}
        </div>
        {errors.tipo_tarifa && <p className="tf__error">{errors.tipo_tarifa}</p>}
      </div>

      <div className={`tf__season ${seasonExpanded ? "expanded" : ""}`}>
        <button
          type="button"
          className="tf__season-toggle"
          onClick={() => setSeasonExpanded((current) => !current)}
          aria-expanded={seasonExpanded}
        >
          <span><FaCalendarAlt /> Vigencia</span>
          <strong>{seasonLabel}</strong>
          <FaChevronDown className="tf__season-chevron" />
        </button>

        {seasonExpanded && (
          <div className="tf__season-content">
            <div className="tf__season-options" role="group" aria-label="Vigencia">
              {[
                { key: STANDARD_KEY, label: "Estándar", icon: <FaCalendarAlt /> },
                { key: TEMPORADAS.ALTA, label: "Alta", icon: <FaSun /> },
                { key: TEMPORADAS.BAJA, label: "Baja", icon: <FaSnowflake /> },
                { key: "otra", label: "Otra", icon: <FaCalendarAlt /> },
              ].map((option) => {
                const active =
                  option.key === "otra"
                    ? formData.tiene_temporada &&
                      ![TEMPORADAS.ALTA, TEMPORADAS.BAJA].includes(formData.temporada)
                    : selectedSeasonKey === option.key;
                const used =
                  option.key !== "otra" && isCombinationUsed(option.key);
                return (
                  <button
                    key={option.key}
                    type="button"
                    className={`${active ? "active" : ""} ${used ? "used" : ""}`}
                    disabled={isSubmitting || used}
                    onClick={() => selectSeason(option.key)}
                    title={used ? "Esta combinación ya existe" : option.label}
                  >
                    {option.icon}
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>

            {formData.tiene_temporada &&
              ![TEMPORADAS.ALTA, TEMPORADAS.BAJA].includes(formData.temporada) && (
                <label className="tf__field tf__custom-season">
                  <span>Nombre de temporada</span>
                  <input
                    type="text"
                    value={customSeason}
                    placeholder="Ej. Festividades"
                    onChange={(event) => {
                      const value = event.target.value;
                      setCustomSeason(value);
                      updateField("temporada", value);
                    }}
                  />
                </label>
              )}
            {errors.temporada && <p className="tf__error">{errors.temporada}</p>}
            {errors.combinacion && <p className="tf__error">{errors.combinacion}</p>}
          </div>
        )}
      </div>

      <div className="tf__price-panel">
        <div className="tf__price-toolbar">
          <div className="tf__segmented" role="group" aria-label="Moneda">
            <button
              type="button"
              className={formData.moneda === "dolares" ? "active" : ""}
              onClick={() => switchCurrency("dolares")}
              disabled={isSubmitting}
              aria-pressed={formData.moneda === "dolares"}
            >
              $ USD
            </button>
            <button
              type="button"
              className={formData.moneda === "soles" ? "active" : ""}
              onClick={() => switchCurrency("soles")}
              disabled={isSubmitting}
              aria-pressed={formData.moneda === "soles"}
            >
              S/ PEN
            </button>
          </div>

          <button
            type="button"
            className={`tf__unique-toggle ${formData.precio_unico ? "active" : ""}`}
            onClick={toggleUniquePrice}
            disabled={isSubmitting}
            aria-pressed={formData.precio_unico}
          >
            {formData.precio_unico ? "Único" : "Compartido / privado"}
          </button>
        </div>

        <div className={`tf__prices ${formData.precio_unico ? "single" : "double"}`}>
          <label className="tf__field tf__price-field">
            <span>{formData.precio_unico ? "Precio" : "Compartido"}</span>
            <div>
              <b>{currencySymbol}</b>
              <input
                ref={precioInputRef}
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={formData.precio_compartido}
                placeholder="0.00"
                onChange={(event) => updateField("precio_compartido", event.target.value)}
                onWheel={(event) => event.currentTarget.blur()}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault();
                  }
                }}
              />
            </div>
            {errors.precio_compartido && <em>{errors.precio_compartido}</em>}
          </label>

          {!formData.precio_unico && (
            <label className="tf__field tf__price-field">
              <span>Privado</span>
              <div>
                <b>{currencySymbol}</b>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={formData.precio_privado}
                  placeholder="0.00"
                  onChange={(event) => updateField("precio_privado", event.target.value)}
                  onWheel={(event) => event.currentTarget.blur()}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                      event.preventDefault();
                    }
                  }}
                />
              </div>
              {errors.precio_privado && <em>{errors.precio_privado}</em>}
            </label>
          )}
        </div>

        {formData.moneda === "soles" && (
          <label className="tf__field tf__exchange-rate">
            <span><FaExchangeAlt /> Tasa de cambio</span>
            <div>
              <b>S/</b>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={formData.tasa_cambio}
                onChange={(event) => updateField("tasa_cambio", event.target.value)}
                onWheel={(event) => event.currentTarget.blur()}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault();
                  }
                }}
              />
              <small>por USD</small>
            </div>
            {errors.tasa_cambio && <em>{errors.tasa_cambio}</em>}
          </label>
        )}
      </div>

      {!seasonExpanded && errors.combinacion && (
        <p className="tf__error tf__error--standalone">{errors.combinacion}</p>
      )}

      <div className="tf__summary">
        <span>{formData.anio} · {getTarifaTypeLabel(formData.tipo_tarifa)} · {seasonLabel} · {formData.agency_ids.length} agencia{formData.agency_ids.length === 1 ? "" : "s"}</span>
        <strong>
          {formData.precio_unico
            ? `${currencySymbol} ${toMoneyString(formData.precio_compartido) || "0.00"}`
            : `${currencySymbol} ${toMoneyString(formData.precio_compartido) || "0.00"} / ${toMoneyString(formData.precio_privado) || "0.00"}`}
        </strong>
      </div>

      <div className="form-actions-compact">
        <button type="button" className="btn-cancel" onClick={() => onSubmit(null)} disabled={isSubmitting}>
          Cancelar
        </button>
        <button type="submit" className="btn-submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando…" : isEditMode ? "Actualizar" : "Crear tarifa"}
        </button>
      </div>
    </form>
  );
};

export default TarifaForm;
