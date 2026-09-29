import React, { useState, useEffect } from "react";
import { ESTADOS_SERVICIO } from "../../utils/constants";
import useAuditInfo from "../../hooks/useAuditInfo";

const ServicioExtraForm = ({ servicioExtra, onSubmit, isSubmitting }) => {
  const { userId } = useAuditInfo();

  const initialState = {
    nombre: "",
    descripcion: "",
    estado: "disponible",
    tiene_fee: true,
    mostrar_en_servicepicker: true,
    created_by: userId,
  };

  const [formData, setFormData] = useState(initialState);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (servicioExtra) {
      setFormData({ ...initialState, ...servicioExtra });
    }
  }, [servicioExtra]);

  const validate = () => {
    const newErrors = {};
    if (!formData.nombre.trim())
      newErrors.nombre = "El nombre del servicio extra es obligatorio";
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
      const formDataWithAudit = {
        ...formData,
        descripcion: formData.descripcion?.trim() || null,
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
          placeholder="Ej: Making Sour, City Tour Privado..."
        />
        {errors.nombre && <div className="error-message">{errors.nombre}</div>}
      </div>

      <div className="form-group">
        <label htmlFor="descripcion">Descripción</label>
        <textarea
          id="descripcion"
          name="descripcion"
          value={formData.descripcion || ""}
          onChange={handleChange}
          rows={4}
          disabled={isSubmitting}
          placeholder="Descripción del servicio extra..."
        />
      </div>

      <div className="switch-container">
        <label className="switch" onClick={(e) => e.stopPropagation()}>
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
            Si está desactivado, ventas no podrá seleccionar este extra en cotizaciones.
          </span>
        </div>
      </div>

      <div
        className="switch-container"
        onClick={() =>
          setFormData((prev) => ({ ...prev, tiene_fee: !prev.tiene_fee }))
        }
      >
        <label className="switch" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            id="tiene_fee"
            name="tiene_fee"
            checked={formData.tiene_fee}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, tiene_fee: e.target.checked }))
            }
            disabled={isSubmitting}
          />
          <span className="slider round"></span>
        </label>
        <div className="switch-label-text">
          <span>
            {formData.tiene_fee
              ? "Con Costo (Servicio Regular)"
              : "Sin Costo (Itinerario Externo)"}
          </span>
          <span className="switch-label-desc">
            {formData.tiene_fee
              ? "Este servicio se sumará al costo total de la cotización."
              : "Este servicio es informativo y no suma costo (se mostrará en itinerario externo)."}
          </span>
        </div>
      </div>

      <div className="button-group">
        <button
          type="submit"
          className="button button-primary"
          disabled={isSubmitting}
        >
          {servicioExtra ? "Actualizar" : "Crear"} Servicio Extra
        </button>
      </div>
    </form>
  );
};

export default ServicioExtraForm;
