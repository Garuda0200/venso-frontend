import React, { useState, useEffect } from "react";
import useAuditInfo from "../../hooks/useAuditInfo";
import "../../../../../components/common/FormComponents.scss";

/**
 * Formulario para Vuelos (Aerolíneas/Empresas de Vuelos)
 * Segun schema.rs actualizado:
 * - id_vuelo (PK, auto)
 * - nombre (required)
 * - calificacion (jsonb, nullable) - se maneja aparte con ValoracionModal
 * - telefono (nullable)
 * - correo (nullable)
 * - procedencia (nullable)
 * - Campos audit: created_at, created_by, updated_at, updated_by
 */
const VueloForm = ({ vuelo, onSubmit, isSubmitting }) => {
  const { userId } = useAuditInfo();

  const initialState = {
    nombre: "",
    telefono: "",
    correo: "",
    procedencia: "",
    mostrar_en_servicepicker: true,
    created_by: userId,
  };

  const [formData, setFormData] = useState(
    vuelo ? { ...initialState, ...vuelo } : initialState,
  );
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (vuelo) {
      setFormData({ ...initialState, ...vuelo });
    }
  }, [vuelo]);

  const validate = () => {
    const newErrors = {};

    if (!formData.nombre || !formData.nombre.trim()) {
      newErrors.nombre = "El nombre de la aerolínea/empresa es obligatorio";
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

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (validate()) {
      const submitData = {
        nombre: formData.nombre.trim(),
        telefono: formData.telefono?.trim() || null,
        correo: formData.correo?.trim() || null,
        procedencia: formData.procedencia?.trim() || null,
        mostrar_en_servicepicker: formData.mostrar_en_servicepicker !== false,
      };

      // Agregar información de auditoría
      if (vuelo) {
        submitData.updated_by = userId;
      } else {
        submitData.created_by = userId;
      }

      onSubmit(submitData);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="nombre">Nombre de Aerolínea/Empresa *</label>
        <input
          type="text"
          id="nombre"
          name="nombre"
          value={formData.nombre || ""}
          onChange={handleChange}
          className={errors.nombre ? "error" : ""}
          disabled={isSubmitting}
          placeholder="Ej: LATAM, Avianca, Sky Airlines..."
        />
        {errors.nombre && <div className="error-message">{errors.nombre}</div>}
      </div>

      <div className="form-group">
        <label htmlFor="procedencia">Procedencia</label>
        <select
          id="procedencia"
          name="procedencia"
          value={formData.procedencia || ""}
          onChange={handleChange}
          disabled={isSubmitting}
        >
          <option value="">Seleccionar procedencia</option>
          <option value="Nacional">Nacional</option>
          <option value="Internacional">Internacional</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="telefono">Teléfono de Contacto</label>
        <input
          type="text"
          id="telefono"
          name="telefono"
          value={formData.telefono || ""}
          onChange={handleChange}
          disabled={isSubmitting}
          placeholder="Ej: +51 1 123 4567"
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
          placeholder="contacto@aerolinea.com"
        />
        {errors.correo && <div className="error-message">{errors.correo}</div>}
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
          <small>Permite usar esta aerolínea al armar cotizaciones.</small>
        </span>
      </label>

      <div className="button-group">
        <button
          type="submit"
          className="button button-primary"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Guardando..." : vuelo ? "Actualizar" : "Crear"} Vuelo
        </button>
      </div>
    </form>
  );
};

export default VueloForm;
