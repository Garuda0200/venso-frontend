import React, { useState, useEffect, useCallback, useRef } from "react";
import useAuditInfo from "../../hooks/useAuditInfo";
import { TIPOS_HABITACION } from "../../utils/constants";
import { FaEdit, FaTimes } from "react-icons/fa";
import { fetchHabitacionesByHotel } from "../../services/api";
import { positiveRoomCapacity, roomCatalogDefaults, defaultRoomCapacity } from "../../../../../utils/roomCapacity";

const HabitacionForm = ({
  habitacion,
  hotelId,
  tiposHabitacion,
  onSubmit,
  isSubmitting,
}) => {
  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  const initialState = roomCatalogDefaults({
    id_hotel: hotelId || "",
    tipo_habitacion: "",
    capacidad: "",
    tipo_unidad: habitacion ? "" : "habitacion",
    estado: "disponible",
    mostrar_en_servicepicker: true,
    created_by: userId, // Establecer por defecto
    ...habitacion,
  });

  const capacityEdited = useRef(habitacion?.capacidad != null);

  const [formData, setFormData] = useState(initialState);
  const [errors, setErrors] = useState({});
  const [isCustomTipoHabitacion, setIsCustomTipoHabitacion] = useState(false);
  const [tiposHabitacionUnicos, setTiposHabitacionUnicos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Determinar los tipos de habitación predefinidos disponibles
  const tiposDisponiblesPredefinidos = tiposHabitacion || TIPOS_HABITACION;

  // Cargar tipos de habitación únicos existentes
  useEffect(() => {
    const cargarTiposHabitacionUnicos = async () => {
      if (!hotelId) return;

      setIsLoading(true);
      try {
        // Obtener habitaciones existentes del hotel
        const habitaciones = await fetchHabitacionesByHotel(hotelId);

        // Extraer tipos únicos que no estén en las constantes predefinidas
        const tipos = habitaciones
          .map((h) => h.tipo_habitacion)
          .filter((t) => t && t.trim() !== "")
          // Filtrar duplicados y no incluidos en las constantes
          .filter(
            (t, index, self) =>
              self.indexOf(t) === index &&
              !tiposDisponiblesPredefinidos.includes(t),
          );

        setTiposHabitacionUnicos(tipos);
      } catch (error) {
        console.error("Error al cargar tipos de habitación únicos:", error);
      } finally {
        setIsLoading(false);
      }
    };

    cargarTiposHabitacionUnicos();
  }, [hotelId, tiposDisponiblesPredefinidos]);

  useEffect(() => {
    capacityEdited.current = habitacion?.capacidad != null;
    if (habitacion) {
      setFormData(roomCatalogDefaults({
        ...initialState,
        ...habitacion,
      }));
    } else if (hotelId) {
      setFormData((prev) => ({
        ...prev,
        id_hotel: hotelId,
      }));
    }
  }, [habitacion, hotelId]);

  // Check if custom tipo needed (separate to avoid resetting formData)
  useEffect(() => {
    if (
      habitacion?.tipo_habitacion &&
      !tiposDisponiblesPredefinidos.includes(habitacion.tipo_habitacion)
    ) {
      setIsCustomTipoHabitacion(true);
    }
  }, [habitacion, tiposDisponiblesPredefinidos]);

  const validate = () => {
    const newErrors = {};

    if (!formData.tipo_habitacion?.trim()) {
      newErrors.tipo_habitacion = "El tipo de habitación es obligatorio";
    }
    if (formData.capacidad !== "" && formData.capacidad != null && (!positiveRoomCapacity(formData.capacidad) || Number(formData.capacidad)>20)) {
      newErrors.capacidad = "Ingresa una capacidad entera positiva";
    }
    if (!positiveRoomCapacity(formData.capacidad)) {
      newErrors.capacidad = "Confirma la capacidad de la habitación";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    if (name === "capacidad") capacityEdited.current = true;

    if (name === "tipo_habitacion" && value === "Otro") {
      setIsCustomTipoHabitacion(true);
      setFormData((prev) => ({ ...prev, tipo_habitacion: "", ...(!capacityEdited.current ? { capacidad: "" } : {}) }));
    } else {
      setFormData((prev) => {
        const next = { ...prev, [name]: value };
        if (!capacityEdited.current && ["tipo_habitacion", "tipo_unidad"].includes(name)) {
          next.capacidad = !next.tipo_unidad || next.tipo_unidad === "habitacion" ? defaultRoomCapacity(next.tipo_habitacion) ?? "" : "";
          if (next.capacidad !== "" && !next.tipo_unidad) next.tipo_unidad = "habitacion";
        }
        return next;
      });
    }
  }, []);

  const toggleCustomTipoHabitacion = useCallback(() => {
    setIsCustomTipoHabitacion((prevState) => {
      // Si estamos activando el modo personalizado, limpiar el campo
      if (!prevState) {
        setFormData((prev) => ({ ...prev, tipo_habitacion: "", ...(!capacityEdited.current ? { capacidad: "" } : {}) }));
      }
      return !prevState;
    });
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (validate()) {
      // Agregar información de auditoría
      const formDataWithAudit = {
        ...formData,
        capacidad: positiveRoomCapacity(formData.capacidad),
        tipo_unidad: formData.tipo_unidad || undefined,
        created_by: userId,
        updated_by: userId,
      };

      onSubmit(formDataWithAudit);
    }
  };

  // Combinar tipos predefinidos con los únicos encontrados en la base de datos
  const todosLosTiposHabitacion = [
    ...tiposDisponiblesPredefinidos.map((tipo) => ({
      value: tipo,
      label: tipo,
    })),
    ...tiposHabitacionUnicos.map((tipo) => ({ value: tipo, label: tipo })),
  ];

  return (
    <form onSubmit={handleSubmit} className="habitacion-form">
      <div className="form-group">
        <div className="custom-field-container">
          <label htmlFor="tipo_habitacion">Tipo de Habitación *</label>
          <button
            type="button"
            className="custom-option-btn"
            onClick={toggleCustomTipoHabitacion}
            disabled={isSubmitting}
            title={
              isCustomTipoHabitacion
                ? "Cancelar entrada personalizada"
                : "Agregar tipo personalizado"
            }
          >
            {isCustomTipoHabitacion ? <FaTimes /> : <FaEdit />}
            <span className="btn-text">
              {isCustomTipoHabitacion ? "Cancelar" : "Personalizar"}
            </span>
          </button>
        </div>

        {isCustomTipoHabitacion ? (
          <div className="custom-input-container">
            <input
              type="text"
              id="tipo_habitacion_custom"
              name="tipo_habitacion"
              value={formData.tipo_habitacion || ""}
              onChange={handleChange}
              className={`custom-field ${errors.tipo_habitacion ? "error" : ""}`}
              disabled={isSubmitting}
              placeholder="Escriba un tipo de habitación personalizado"
              maxLength={255}
              autoFocus
            />
          </div>
        ) : (
          <select
            id="tipo_habitacion"
            name="tipo_habitacion"
            value={formData.tipo_habitacion || ""}
            onChange={handleChange}
            className={errors.tipo_habitacion ? "error" : ""}
            disabled={isSubmitting || isLoading}
          >
            <option value="">Seleccione un tipo...</option>
            {todosLosTiposHabitacion.map((option, index) => (
              <option key={index} value={option.value}>
                {option.label}
              </option>
            ))}
            <option value="Otro">Otro...</option>
          </select>
        )}
        {errors.tipo_habitacion && (
          <div className="error-message">{errors.tipo_habitacion}</div>
        )}
        {isLoading && (
          <small className="text-muted">Cargando opciones...</small>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="tipo_unidad">Unidad vendida</label>
        <select id="tipo_unidad" name="tipo_unidad" value={formData.tipo_unidad || ""} onChange={handleChange} disabled={isSubmitting}>
          <option value="">Pendiente de clasificar</option>
          <option value="habitacion">Habitación completa</option><option value="plaza">Plaza en dormitorio</option>
          <option value="complemento">Cama / persona adicional</option><option value="otro">Otro concepto</option>
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="capacidad">Capacidad máxima de personas</label>
        <input id="capacidad" name="capacidad" type="number" min="1" step="1" value={formData.capacidad ?? ""} onChange={handleChange} disabled={isSubmitting} />
        <small>No es la ocupación incluida en la tarifa ni la cantidad de habitaciones.</small>
        {errors.capacidad && <div role="alert" className="error-message">{errors.capacidad}</div>}
      </div>
      <label className="habitacion-visibility-field">
        <input type="checkbox" checked={formData.mostrar_en_servicepicker !== false} disabled={isSubmitting}
          onChange={event=>setFormData(previous=>({...previous,mostrar_en_servicepicker:event.target.checked}))}/>
        Disponible para seleccionar servicios
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
          {habitacion ? "Actualizar" : "Crear"} Habitación
        </button>
      </div>
    </form>
  );
};

export default HabitacionForm;
