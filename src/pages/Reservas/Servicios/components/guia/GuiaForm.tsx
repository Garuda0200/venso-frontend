import React, { useState, useEffect } from "react";
import { MdClose, MdAdd, MdExpandMore, MdExpandLess } from "react-icons/md";
import {
  IDIOMAS_GUIA,
  OPCIONES_GENERO,
  OPCIONES_ESTADO_CIVIL,
} from "../../utils/constants";
import useAuditInfo from "../../hooks/useAuditInfo";
import "../../../../../components/common/FormComponents.scss";
import "./GuiaForm.scss";

const GuiaForm = ({ guia, onSubmit, isSubmitting }) => {
  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  // Estado inicial
  const initialState = {
    // Datos de persona
    nombres: "",
    apellidos: "",
    direccion: "",
    genero: "",
    estado_civil: "",

    // Datos de guía
    codigo_guia: "",
    // Idioma ahora es un array (JSONB en el backend)
    idioma: [],

    // Contacto
    telefono: "",
    correo: "",
    mostrar_en_servicepicker: true,

    // Auditoría
    created_by: userId,
  };

  const [formData, setFormData] = useState(initialState);
  const [errors, setErrors] = useState({});
  const [showOptionalInfo, setShowOptionalInfo] = useState(false);

  // Cargar datos de guía si se está editando
  useEffect(() => {
    if (guia) {
      // Preparar el valor de idioma
      let idiomaValue = [];

      // Manejar diferentes formatos/estructuras posibles en los datos recibidos
      if (guia.guia?.idioma || guia.idioma) {
        const idiomaData = guia.guia?.idioma || guia.idioma;

        // Si idioma es un string, convertirlo a array
        if (typeof idiomaData === "string") {
          idiomaValue = [idiomaData];
        }
        // Si es un array, usarlo directamente
        else if (Array.isArray(idiomaData)) {
          idiomaValue = idiomaData;
        }
        // Si es un objeto JSON, intentar extraer valores
        else if (typeof idiomaData === "object" && idiomaData !== null) {
          // Si es un JSON que vino como objeto, intentar extraer valores
          idiomaValue = Array.isArray(idiomaData) ? idiomaData : [];
        }
      }

      // Extraer datos combinados de guía+persona
      console.log(
        "GuiaForm - Loading guia data:",
        JSON.stringify(guia, null, 2),
      );

      const newFormData = {
        // Include ID (important for updates)
        id_guia: guia.id_guia || guia.guia?.id_guia,
        id_persona: guia.persona?.id_persona || guia.id_persona,

        // Datos de persona
        nombres: guia.persona?.nombres || guia.nombres || "",
        apellidos: guia.persona?.apellidos || guia.apellidos || "",
        direccion: guia.persona?.direccion || guia.direccion || "",
        genero: guia.persona?.genero || guia.genero || "",
        estado_civil: guia.persona?.estado_civil || guia.estado_civil || "",

        // Datos de guía
        codigo_guia: guia.guia?.codigo_guia || guia.codigo_guia || "",
        idioma: idiomaValue,

        // Datos de contacto (en tabla guia)
        telefono: guia.guia?.telefono || guia.telefono || "",
        correo: guia.guia?.correo || guia.correo || "",
        mostrar_en_servicepicker:
          (guia.guia?.mostrar_en_servicepicker ??
            guia.mostrar_en_servicepicker) !== false,
      };

      console.log("GuiaForm - Setting formData:", newFormData);
      setFormData(newFormData);
    }
  }, [guia]);

  const validate = () => {
    const newErrors = {};

    // Validar campos de persona
    if (!formData.nombres?.trim()) {
      newErrors.nombres = "El nombre es obligatorio";
    } else if (formData.nombres.trim().length < 2) {
      newErrors.nombres = "El nombre debe tener al menos 2 caracteres";
    } else if (formData.nombres.length > 50) {
      newErrors.nombres = "El nombre no puede exceder 50 caracteres";
    }

    if (!formData.apellidos?.trim()) {
      newErrors.apellidos = "Los apellidos son obligatorios";
    } else if (formData.apellidos.trim().length < 2) {
      newErrors.apellidos = "Los apellidos deben tener al menos 2 caracteres";
    } else if (formData.apellidos.length > 50) {
      newErrors.apellidos = "Los apellidos no pueden exceder 50 caracteres";
    }

    // Validar dirección (opcional)
    if (formData.direccion && formData.direccion.length > 100) {
      newErrors.direccion = "La dirección no puede exceder 100 caracteres";
    }

    // Validar código guía (opcional)
    if (formData.codigo_guia && formData.codigo_guia.trim().length > 15) {
      newErrors.codigo_guia =
        "El código de guía no puede exceder 15 caracteres";
    }

    // Validar idioma (ahora es un array)
    if (formData.idioma && !Array.isArray(formData.idioma)) {
      newErrors.idioma = "El formato de idioma no es válido";
    }

    // Validación de correo electrónico (si está presente)
    if (formData.correo && formData.correo.trim() !== "") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.correo)) {
        newErrors.correo = "El formato del correo electrónico no es válido";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Mejorar el handler de cambio para mejor tracking de codigo_guia
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));

    // Limpiar error cuando el usuario cambia el campo
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: undefined,
      }));
    }
  };

  // Nuevo manejador para selección múltiple de idiomas con chips
  const handleIdiomaToggle = (idioma) => {
    setFormData((prev) => {
      const currentIdiomas = prev.idioma || [];
      if (currentIdiomas.includes(idioma)) {
        // Remover idioma si ya está seleccionado
        return {
          ...prev,
          idioma: currentIdiomas.filter((i) => i !== idioma),
        };
      } else {
        // Agregar idioma si no está seleccionado
        return {
          ...prev,
          idioma: [...currentIdiomas, idioma],
        };
      }
    });
  };

  // Remover un idioma específico
  const handleRemoveIdioma = (idiomaToRemove) => {
    setFormData((prev) => ({
      ...prev,
      idioma: (prev.idioma || []).filter((i) => i !== idiomaToRemove),
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (validate()) {
      // Verify that we have the basic required fields
      if (!formData.nombres || !formData.apellidos) {
        setErrors((prev) => ({
          ...prev,
          nombres: formData.nombres ? undefined : "El nombre es obligatorio",
          apellidos: formData.apellidos
            ? undefined
            : "Los apellidos son obligatorios",
        }));
        return;
      }

      // Create a copy of the form data for submission
      const submissionData = {
        ...formData,
        // IMPORTANT: This sets codigo_guia to null if it's an empty string
        // We need to be explicit that empty means null
        codigo_guia:
          formData.codigo_guia === "" || formData.codigo_guia === null
            ? null
            : formData.codigo_guia,
        telefono: formData.telefono
          ? formData.telefono.trim() === ""
            ? null
            : formData.telefono.trim()
          : null,
        correo: formData.correo
          ? formData.correo.trim() === ""
            ? null
            : formData.correo.trim()
          : null,
        // Convert empty strings to null for genero and estado_civil to avoid constraint violation
        genero:
          formData.genero === "" || formData.genero === null
            ? null
            : formData.genero,
        estado_civil:
          formData.estado_civil === "" || formData.estado_civil === null
            ? null
            : formData.estado_civil,
        direccion:
          formData.direccion === "" || formData.direccion === null
            ? null
            : formData.direccion,
        created_by: userId,
        updated_by: userId,
      };

      console.log("GuiaForm - Submitting data:", submissionData);
      onSubmit(submissionData);
    }
  };

  // Determinar si hay información adicional llena para mostrar sección expandida automáticamente
  useEffect(() => {
    if (guia) {
      const hasOptionalData =
        formData.direccion || formData.genero || formData.estado_civil;
      setShowOptionalInfo(!!hasOptionalData);
    }
  }, [guia, formData.direccion, formData.genero, formData.estado_civil]);

  return (
    <form onSubmit={handleSubmit} className="guia-form">
      {/* Sección principal - Datos obligatorios */}
      <div className="form-section">
        <h3>Información Principal</h3>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="nombres">Nombres *</label>
            <input
              type="text"
              id="nombres"
              name="nombres"
              value={formData.nombres || ""}
              onChange={handleChange}
              className={errors.nombres ? "error" : ""}
              disabled={isSubmitting}
              placeholder="Ingrese nombres"
            />
            {errors.nombres && (
              <div className="error-message">{errors.nombres}</div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="apellidos">Apellidos *</label>
            <input
              type="text"
              id="apellidos"
              name="apellidos"
              value={formData.apellidos || ""}
              onChange={handleChange}
              className={errors.apellidos ? "error" : ""}
              disabled={isSubmitting}
              placeholder="Ingrese apellidos"
            />
            {errors.apellidos && (
              <div className="error-message">{errors.apellidos}</div>
            )}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="telefono">Teléfono</label>
            <input
              type="tel"
              id="telefono"
              name="telefono"
              value={formData.telefono || ""}
              onChange={handleChange}
              disabled={isSubmitting}
              placeholder="Ej: +51 999 999 999"
              maxLength={50}
            />
          </div>

          <div className="form-group">
            <label htmlFor="correo">Correo Electrónico</label>
            <input
              type="email"
              id="correo"
              name="correo"
              value={formData.correo || ""}
              onChange={handleChange}
              className={errors.correo ? "error" : ""}
              disabled={isSubmitting}
              placeholder="correo@ejemplo.com"
              maxLength={255}
            />
            {errors.correo && (
              <div className="error-message">{errors.correo}</div>
            )}
          </div>
        </div>
      </div>

      {/* Sección de datos de guía */}
      <div className="form-section">
        <h3>Datos de Guía</h3>

        <div className="form-group">
          <label htmlFor="codigo_guia">Código de Guía</label>
          <input
            type="text"
            id="codigo_guia"
            name="codigo_guia"
            value={formData.codigo_guia || ""}
            onChange={handleChange}
            className={errors.codigo_guia ? "error" : ""}
            disabled={isSubmitting}
            placeholder="Código opcional"
          />
          {errors.codigo_guia && (
            <div className="error-message">{errors.codigo_guia}</div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="idioma">Idiomas</label>

          {/* Chips de idiomas seleccionados */}
          <div className="selected-idiomas-chips">
            {(formData.idioma || []).length === 0 && (
              <span className="no-selection-text">
                Ningún idioma seleccionado
              </span>
            )}
            {(formData.idioma || []).map((idioma, idx) => (
              <span key={idx} className="idioma-chip selected">
                {idioma}
                <button
                  type="button"
                  className="chip-remove"
                  onClick={() => handleRemoveIdioma(idioma)}
                  disabled={isSubmitting}
                >
                  <MdClose />
                </button>
              </span>
            ))}
          </div>

          {/* Chips de idiomas disponibles */}
          <div className="available-idiomas-chips">
            {IDIOMAS_GUIA.filter(
              (idioma) => !(formData.idioma || []).includes(idioma),
            ).map((idioma, idx) => (
              <button
                key={idx}
                type="button"
                className="idioma-chip available"
                onClick={() => handleIdiomaToggle(idioma)}
                disabled={isSubmitting}
              >
                <MdAdd /> {idioma}
              </button>
            ))}
          </div>

          {errors.idioma && (
            <div className="error-message">{errors.idioma}</div>
          )}
          <small className="form-text">
            Haga clic para agregar o quitar idiomas
          </small>
        </div>
      </div>

      {/* Sección colapsable - Información adicional */}
      <div
        className={`form-section collapsible ${showOptionalInfo ? "expanded" : "collapsed"}`}
      >
        <button
          type="button"
          className="collapsible-header"
          onClick={() => setShowOptionalInfo(!showOptionalInfo)}
        >
          <span className="header-content">
            {showOptionalInfo ? <MdExpandLess /> : <MdExpandMore />}
            <span>Información Adicional</span>
          </span>
          <span className="optional-badge">Opcional</span>
        </button>

        {showOptionalInfo && (
          <div className="collapsible-content">
            <div className="form-group">
              <label htmlFor="direccion">Dirección</label>
              <input
                type="text"
                id="direccion"
                name="direccion"
                value={formData.direccion || ""}
                onChange={handleChange}
                className={errors.direccion ? "error" : ""}
                disabled={isSubmitting}
                placeholder="Dirección de domicilio"
              />
              {errors.direccion && (
                <div className="error-message">{errors.direccion}</div>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="genero">Género</label>
                <select
                  id="genero"
                  name="genero"
                  value={formData.genero || ""}
                  onChange={handleChange}
                  disabled={isSubmitting}
                >
                  <option value="">Seleccione...</option>
                  {OPCIONES_GENERO.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="estado_civil">Estado Civil</label>
                <select
                  id="estado_civil"
                  name="estado_civil"
                  value={formData.estado_civil || ""}
                  onChange={handleChange}
                  disabled={isSubmitting}
                >
                  <option value="">Seleccione...</option>
                  {OPCIONES_ESTADO_CIVIL.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      <label className="servicepicker-switch">
        <input
          type="checkbox"
          name="mostrar_en_servicepicker"
          checked={formData.mostrar_en_servicepicker !== false}
          onChange={handleChange}
          disabled={isSubmitting}
        />
        <span>
          Mostrar en ServicePicker
          <small>Permite usar este guía al armar cotizaciones.</small>
        </span>
      </label>

      <div className="button-group">
        <button
          type="button"
          className="button button-secondary"
          onClick={() => onSubmit(null)}
          disabled={isSubmitting}
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="button button-primary"
          disabled={isSubmitting}
        >
          {guia ? "Actualizar" : "Crear"} Guía
        </button>
      </div>
    </form>
  );
};

export default GuiaForm;
