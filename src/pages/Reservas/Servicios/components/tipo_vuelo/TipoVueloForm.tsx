import { useState, useEffect } from "react";
import useAuditInfo from "../../hooks/useAuditInfo";

/**
 * Formulario para Tipo de Vuelo (Rutas/Horarios de vuelo)
 * Segun schema.rs actualizado:
 * - idtipo_vuelo (PK, auto)
 * - id_vuelo (FK) - referencia a vuelos
 * - tipovuelo (clase de vuelo: Business, Economica, etc.)
 * - equipaje (nullable)
 * - detalles (nullable)
 * - estado (required)
 * - lugar_ida (nullable) - origen del vuelo
 * - lugar_vuelta (nullable) - destino del vuelo
 * - hora_salida (nullable) - hora de salida
 * - hora_llegada (nullable) - hora de llegada
 * - Campos audit: created_at, created_by, updated_at, updated_by
 */
const TipoVueloForm = ({ tipoVuelo, vueloId, onSubmit, isSubmitting }) => {
  const { userId } = useAuditInfo();

  const initialState = {
    id_vuelo: vueloId || "",
    tipovuelo: "",
    equipaje: "",
    detalles: "",
    estado: "disponible",
    lugar_ida: "",
    lugar_vuelta: "",
    hora_salida: "",
    hora_llegada: "",
    created_by: userId,
  };

  const [formData, setFormData] = useState(
    tipoVuelo ? { ...initialState, ...tipoVuelo } : initialState,
  );
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (tipoVuelo) {
      setFormData({
        ...initialState,
        ...tipoVuelo,
        // Formatear horas para input type="time"
        hora_salida: tipoVuelo.hora_salida
          ? tipoVuelo.hora_salida.substring(0, 5)
          : "",
        hora_llegada: tipoVuelo.hora_llegada
          ? tipoVuelo.hora_llegada.substring(0, 5)
          : "",
      });
    } else if (vueloId) {
      setFormData({
        ...initialState,
        id_vuelo: vueloId,
      });
    }
  }, [tipoVuelo, vueloId]);

  const tiposDeVuelo = [
    "Primera Clase",
    "Business",
    "Económica Premium",
    "Económica",
    "Clase Turista",
    "Clase Ejecutiva",
  ];

  const validate = () => {
    const newErrors = {};

    if (!formData.tipovuelo) {
      newErrors.tipovuelo = "El tipo de vuelo es obligatorio";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (validate()) {
      const submitData = {
        id_vuelo: Number(formData.id_vuelo),
        tipovuelo: formData.tipovuelo,
        equipaje: formData.equipaje?.trim() || null,
        detalles: formData.detalles?.trim() || null,
        estado: formData.estado,
        lugar_ida: formData.lugar_ida?.trim() || null,
        lugar_vuelta: formData.lugar_vuelta?.trim() || null,
        hora_salida: formData.hora_salida || null,
        hora_llegada: formData.hora_llegada || null,
      };

      if (tipoVuelo) {
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
        <label htmlFor="tipovuelo">Clase de Vuelo *</label>
        <select
          id="tipovuelo"
          name="tipovuelo"
          value={formData.tipovuelo}
          onChange={handleChange}
          className={errors.tipovuelo ? "error" : ""}
          disabled={isSubmitting}
        >
          <option value="">Seleccione una clase...</option>
          {tiposDeVuelo.map((tipo, index) => (
            <option key={index} value={tipo}>
              {tipo}
            </option>
          ))}
          <option value="Otro">Otro</option>
        </select>
        {errors.tipovuelo && (
          <div className="error-message">{errors.tipovuelo}</div>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="lugar_ida">Origen (Ciudad/Aeropuerto)</label>
        <input
          type="text"
          id="lugar_ida"
          name="lugar_ida"
          value={formData.lugar_ida || ""}
          onChange={handleChange}
          disabled={isSubmitting}
          placeholder="Ej: Lima - Jorge Chavez (LIM)"
        />
      </div>

      <div className="form-group">
        <label htmlFor="lugar_vuelta">Destino (Ciudad/Aeropuerto)</label>
        <input
          type="text"
          id="lugar_vuelta"
          name="lugar_vuelta"
          value={formData.lugar_vuelta || ""}
          onChange={handleChange}
          disabled={isSubmitting}
          placeholder="Ej: Cusco - Velasco Astete (CUZ)"
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="hora_salida">Hora de Salida</label>
          <input
            type="time"
            id="hora_salida"
            name="hora_salida"
            value={formData.hora_salida || ""}
            onChange={handleChange}
            disabled={isSubmitting}
          />
        </div>

        <div className="form-group">
          <label htmlFor="hora_llegada">Hora de Llegada</label>
          <input
            type="time"
            id="hora_llegada"
            name="hora_llegada"
            value={formData.hora_llegada || ""}
            onChange={handleChange}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="equipaje">Equipaje Permitido</label>
        <input
          type="text"
          id="equipaje"
          name="equipaje"
          placeholder="Ej: 23kg facturado + 8kg cabina"
          value={formData.equipaje || ""}
          onChange={handleChange}
          disabled={isSubmitting}
        />
      </div>

      <div className="form-group">
        <label htmlFor="detalles">Detalles Adicionales</label>
        <textarea
          id="detalles"
          name="detalles"
          value={formData.detalles || ""}
          onChange={handleChange}
          placeholder="Información adicional sobre este vuelo..."
          disabled={isSubmitting}
          rows={3}
        />
      </div>

      <div className="button-group">
        <button
          type="submit"
          className="button button-primary"
          disabled={isSubmitting}
        >
          {tipoVuelo ? "Actualizar" : "Crear"} Tipo de Vuelo
        </button>
      </div>
    </form>
  );
};

export default TipoVueloForm;
