import React, { useState, useEffect } from "react";
import { ESTADOS_SERVICIO } from "../../utils/constants";
import useAuditInfo from "../../hooks/useAuditInfo";
import FormField from "../../../../../components/common/FormField";

const RestauranteForm = ({ restaurante, onSubmit, isSubmitting }) => {
  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  const initialState = {
    nombre: "",
    direccion: "",
    estado: "disponible",
    detalles: "",
    telefono: "",
    correo: "",
    mostrar_en_servicepicker: true,
    created_by: userId,
  };

  const [formData, setFormData] = useState(initialState);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (restaurante) {
      setFormData({
        ...initialState,
        ...restaurante,
      });
    }
  }, [restaurante]);

  const validate = () => {
    const newErrors = {};

    if (!formData.nombre.trim()) {
      newErrors.nombre = "El nombre del restaurante es obligatorio";
    }

    if (!formData.direccion.trim()) {
      newErrors.direccion = "La dirección es obligatoria";
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
      // Agregar información de auditoría
      const formDataWithAudit = {
        ...formData,
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
        created_by: userId,
        updated_by: userId,
      };

      onSubmit(formDataWithAudit);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="nombre">Nombre *</label>
        <input
          type="text"
          id="nombre"
          name="nombre"
          value={formData.nombre}
          onChange={handleChange}
          className={errors.nombre ? "error" : ""}
          disabled={isSubmitting}
          maxLength={255}
        />
        {errors.nombre && <div className="error-message">{errors.nombre}</div>}
      </div>

      <div className="form-group">
        <label htmlFor="direccion">Dirección *</label>
        <input
          type="text"
          id="direccion"
          name="direccion"
          value={formData.direccion}
          onChange={handleChange}
          className={errors.direccion ? "error" : ""}
          disabled={isSubmitting}
          maxLength={255}
        />
        {errors.direccion && (
          <div className="error-message">{errors.direccion}</div>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="detalles">Detalles</label>
        <textarea
          id="detalles"
          name="detalles"
          value={formData.detalles || ""}
          onChange={handleChange}
          rows={4}
          disabled={isSubmitting}
        />
      </div>

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

      <div className="switch-container">
        <label className="switch">
          <input
            type="checkbox"
            id="mostrar_en_servicepicker"
            name="mostrar_en_servicepicker"
            checked={formData.mostrar_en_servicepicker !== false}
            onChange={handleChange}
            disabled={isSubmitting}
          />
          <span className="slider round"></span>
        </label>
        <div className="switch-label-text">
          <span>Mostrar en ServicePicker</span>
          <span className="switch-label-desc">
            Si está desactivado, ventas no podrá seleccionar este restaurante en cotizaciones.
          </span>
        </div>
      </div>

      <div className="button-group">
        <button
          type="submit"
          className="button button-primary"
          disabled={isSubmitting}
        >
          {restaurante ? "Actualizar" : "Crear"} Restaurante
        </button>
      </div>
    </form>
  );
};

export default RestauranteForm;
