import React, { useState, useEffect, useCallback } from "react";
import useAuditInfo from "../../hooks/useAuditInfo";
import { TIPOS_HABITACION } from "../../utils/constants";
import { FaEdit, FaTimes } from "react-icons/fa";
import { fetchHabitacionesByHotel } from "../../services/api";
import { getHotelRoomCapacity } from "../../../../../utils/hotelRoomTypes";

const HabitacionForm = ({
  habitacion,
  hotelId,
  tiposHabitacion,
  onSubmit,
  isSubmitting,
}) => {
  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  const initialState = {
    id_hotel: hotelId || "",
    tipo_habitacion: "",
    capacidad: 2,
    estado: "disponible",
    created_by: userId, // Establecer por defecto
    ...habitacion,
  };

  const [formData, setFormData] = useState(initialState);
  const [errors, setErrors] = useState({});
  const [isCustomTipoHabitacion, setIsCustomTipoHabitacion] = useState(false);
  const [tiposHabitacionUnicos, setTiposHabitacionUnicos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [capacityTouched, setCapacityTouched] = useState(Boolean(habitacion?.capacidad));

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
    if (habitacion) {
      setFormData({
        ...initialState,
        ...habitacion,
      });
      setCapacityTouched(Boolean(habitacion?.capacidad));
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

    const capacidad = Number(formData.capacidad);
    if (!Number.isInteger(capacidad) || capacidad < 1 || capacidad > 20) {
      newErrors.capacidad = "La capacidad debe estar entre 1 y 20 pasajeros";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;

    if (name === "capacidad") {
      setCapacityTouched(true);
      setFormData((prev) => ({
        ...prev,
        capacidad: value === "" ? "" : Number(value),
      }));
      return;
    }

    if (name === "tipo_habitacion" && value === "Otro") {
      setIsCustomTipoHabitacion(true);
      setFormData((prev) => ({ ...prev, tipo_habitacion: "" }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
      ...(name === "tipo_habitacion" && !capacityTouched
        ? { capacidad: getHotelRoomCapacity(value, 2) }
        : {}),
    }));
  }, [capacityTouched]);

  const toggleCustomTipoHabitacion = useCallback(() => {
    setIsCustomTipoHabitacion((prevState) => {
      // Si estamos activando el modo personalizado, limpiar el campo
      if (!prevState) {
        setFormData((prev) => ({ ...prev, tipo_habitacion: "" }));
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
        capacidad: Number(formData.capacidad),
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

      <div className="form-group room-capacity-field">
        <label htmlFor="capacidad">Capacidad máxima *</label>
        <div className="room-capacity-control">
          <input
            type="number"
            id="capacidad"
            name="capacidad"
            min="1"
            max="20"
            step="1"
            value={formData.capacidad ?? ""}
            onChange={handleChange}
            className={errors.capacidad ? "error" : ""}
            disabled={isSubmitting}
          />
          <span>pasajeros</span>
        </div>
        <small className="text-muted">
          Se usa para distribuir pasajeros en HotelPricingModal. Puedes escribir
          cualquier tipo de habitación y definir aquí su capacidad real.
        </small>
        {errors.capacidad && (
          <div className="error-message">{errors.capacidad}</div>
        )}
      </div>

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
