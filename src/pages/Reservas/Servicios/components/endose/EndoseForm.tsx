import React, { useState, useEffect, useCallback } from "react";
import useAuditInfo from "../../hooks/useAuditInfo";
import { FaEdit, FaTimes } from "react-icons/fa";
import { fetchEndoses } from "../../services/api";
import FormField from "../../../../../components/common/FormField";
import "../../../../../components/common/FormComponents.scss";

const normalizeNullableText = (value) => {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
};

const EndoseForm = ({ endose, onSubmit, isSubmitting }) => {
  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  const initialState = {
    nombre_agencia: "",
    zona: "",
    tipo_tour: "",
    telefono: "",
    correo: "",
    mostrar_en_servicepicker: true,
    created_by: userId,
  };

  const [formData, setFormData] = useState(
    endose
      ? { ...initialState, ...endose, tipo_tour: endose.tipo_tour || "" }
      : initialState,
  );
  const [errors, setErrors] = useState({});

  // New state for handling zona selection
  const [zonasUnicas, setZonasUnicas] = useState([]);
  const [isCustomZona, setIsCustomZona] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Load unique zonas from existing endoses
  useEffect(() => {
    const cargarZonas = async () => {
      setIsLoading(true);
      try {
        // Get existing endoses
        const endosesList = await fetchEndoses();

        // Extract unique zona values (excluding null/empty)
        const zonas = endosesList
          .map((e) => e.zona)
          .filter((z) => z && z.trim() !== "")
          .filter((z, index, self) => self.indexOf(z) === index)
          .sort();

        setZonasUnicas(zonas);
      } catch (error) {
        console.error("Error loading zonas:", error);
      } finally {
        setIsLoading(false);
      }
    };

    cargarZonas();
  }, []);

  // Update form when endose prop changes
  useEffect(() => {
    if (endose) {
      setFormData({
        ...initialState,
        ...endose,
        tipo_tour: endose.tipo_tour || "",
      });
    }
  }, [endose]);

  // Check if current zona is custom (separate to avoid resetting formData)
  useEffect(() => {
    if (
      endose?.zona &&
      zonasUnicas.length > 0 &&
      !zonasUnicas.includes(endose.zona)
    ) {
      setIsCustomZona(true);
    }
  }, [endose, zonasUnicas]);

  const validate = () => {
    const newErrors = {};

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

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (name === "zona" && value === "Otra") {
      // User selected "Other" option
      setIsCustomZona(true);
      setFormData((prev) => ({ ...prev, zona: "" }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      }));
    }
  };

  // Toggle between custom and select input for zona
  const toggleCustomZona = useCallback(() => {
    setIsCustomZona((prevState) => {
      if (!prevState) {
        setFormData((prev) => ({ ...prev, zona: "" }));
      }
      return !prevState;
    });
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (validate()) {
      const formDataWithAudit = {
        ...formData,
        // Mantener el campo presente en create/update. El backend distingue
        // entre campo ausente y campo enviado como null para limpiar valores previos.
        tipo_tour: normalizeNullableText(formData.tipo_tour),
        telefono: normalizeNullableText(formData.telefono),
        correo: normalizeNullableText(formData.correo),
        created_by: userId,
        updated_by: userId,
      };

      onSubmit(formDataWithAudit);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="nombre_agencia">Nombre de Agencia</label>
        <input
          type="text"
          id="nombre_agencia"
          name="nombre_agencia"
          value={formData.nombre_agencia || ""}
          onChange={handleChange}
          className={errors.nombre_agencia ? "error" : ""}
          disabled={isSubmitting}
        />
        {errors.nombre_agencia && (
          <div className="error-message">{errors.nombre_agencia}</div>
        )}
      </div>

      <div className="form-group">
        <div className="custom-field-container">
          <label htmlFor="zona">Zona</label>
          <button
            type="button"
            className="custom-option-btn"
            onClick={toggleCustomZona}
            disabled={isSubmitting}
            title={
              isCustomZona
                ? "Seleccionar zona existente"
                : "Ingresar zona personalizada"
            }
          >
            {isCustomZona ? <FaTimes /> : <FaEdit />}
            <span className="btn-text">
              {isCustomZona ? "Cancelar" : "Personalizar"}
            </span>
          </button>
        </div>

        {isCustomZona ? (
          <div className="custom-input-container">
            <input
              type="text"
              id="zona_custom"
              name="zona"
              value={formData.zona || ""}
              onChange={handleChange}
              className="custom-field"
              disabled={isSubmitting}
              placeholder="Ingrese una zona personalizada"
              maxLength={255}
            />
          </div>
        ) : (
          <select
            id="zona"
            name="zona"
            value={formData.zona || ""}
            onChange={handleChange}
            disabled={isSubmitting || isLoading}
          >
            <option value="">Seleccione zona...</option>
            {zonasUnicas.map((zona, index) => (
              <option key={index} value={zona}>
                {zona}
              </option>
            ))}
            <option value="Otra">Otra...</option>
          </select>
        )}
        {isLoading && <small className="text-muted">Cargando zonas...</small>}
      </div>

      <FormField
        id="tipo_tour"
        name="tipo_tour"
        label="Tipo de tour (opcional)"
        type="text"
        value={formData.tipo_tour || ""}
        onChange={handleChange}
        placeholder="Ej: Full day, medio día, privado, grupal..."
        maxLength={100}
        disabled={isSubmitting}
      />

      <FormField
        id="telefono"
        name="telefono"
        label="Teléfono"
        type="tel"
        value={formData.telefono}
        onChange={handleChange}
        placeholder="Ej: +51 999 999 999"
        maxLength={50}
      />

      <FormField
        id="correo"
        name="correo"
        label="Correo Electrónico"
        type="email"
        value={formData.correo}
        onChange={handleChange}
        placeholder="correo@ejemplo.com"
        maxLength={255}
        error={errors.correo}
      />

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
          <small>Permite usar este endose al armar cotizaciones.</small>
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
          {endose ? "Actualizar" : "Crear"} Endose
        </button>
      </div>
    </form>
  );
};

export default EndoseForm;
