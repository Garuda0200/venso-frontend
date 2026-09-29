import React, { useState, useEffect, useCallback, useRef } from "react";
import { ESTADOS_SERVICIO, TIPOS_TREN } from "../../utils/constants";
import { formatTime } from "../../utils/formatters";
import { FaPlus, FaTimes, FaEdit } from "react-icons/fa";
import useAuditInfo from "../../hooks/useAuditInfo";
import { fetchVagonesByTren } from "../../services/api";

const VagonForm = ({ vagon, trenId, onSubmit, isSubmitting }) => {
  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  // Refs para manejar el focus de los inputs
  const lugarSalidaInputRef = useRef(null);
  const lugarDestinoInputRef = useRef(null);
  const tipoTrenInputRef = useRef(null);

  const initialState = {
    id_tren: trenId || "",
    tipo_tren: "",
    serv_add: "",
    lugar_salida: "",
    lugar_destino: "",
    hora_salida: "08:00",
    hora_llegada: "10:00",
    estado: "disponible",
    es_bimodal: false,
    created_by: userId,
    ...vagon,
  };

  const [formData, setFormData] = useState(initialState);
  const [errors, setErrors] = useState({});
  const [isCustomTipoTren, setIsCustomTipoTren] = useState(false);
  const [tiposTrenUnicos, setTiposTrenUnicos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Estados para controlar lugares de origen y destino
  const [isCustomLugarSalida, setIsCustomLugarSalida] = useState(false);
  const [isCustomLugarDestino, setIsCustomLugarDestino] = useState(false);

  // Nuevo estado combinado para todos los lugares únicos (origenes + destinos)
  const [lugaresUnicos, setLugaresUnicos] = useState([]);

  // Cargar tipos de tren y lugares únicos de vagones existentes
  useEffect(() => {
    const cargarDatosUnicos = async () => {
      if (!trenId) return;

      setIsLoading(true);
      try {
        // Obtener vagones existentes
        const vagones = await fetchVagonesByTren(trenId);

        // Extraer tipos de tren únicos
        const tipos = vagones
          .map((v) => v.tipo_tren)
          .filter((t) => t && t.trim() !== "")
          // Filtrar duplicados y no incluidos en las constantes
          .filter(
            (t, index, self) =>
              self.indexOf(t) === index &&
              !Object.values(TIPOS_TREN).includes(t),
          );

        // Extraer TODOS los lugares únicos (tanto salida como destino)
        const origenes = vagones
          .map((v) => v.lugar_salida)
          .filter((l) => l && l.trim() !== "");
        const destinos = vagones
          .map((v) => v.lugar_destino)
          .filter((l) => l && l.trim() !== "");

        // Combinar y eliminar duplicados
        const todosLugares = [...origenes, ...destinos]
          .filter(
            (lugar, index, self) =>
              lugar && lugar.trim() !== "" && self.indexOf(lugar) === index,
          )
          .sort(); // Ordenar alfabéticamente para mejor usabilidad

        setTiposTrenUnicos(tipos);
        setLugaresUnicos(todosLugares);
      } catch (error) {
        console.error("Error al cargar datos únicos:", error);
      } finally {
        setIsLoading(false);
      }
    };

    cargarDatosUnicos();
  }, [trenId]);

  useEffect(() => {
    if (vagon) {
      setFormData({
        ...initialState,
        ...vagon,
        hora_salida: formatTime(vagon.hora_salida || "08:00"),
        hora_llegada: formatTime(vagon.hora_llegada || "10:00"),
      });

      // Verificar si el tipo de tren actual no está en las opciones predefinidas
      if (
        vagon.tipo_tren &&
        !Object.values(TIPOS_TREN).includes(vagon.tipo_tren) &&
        vagon.tipo_tren !== "Otro"
      ) {
        setIsCustomTipoTren(true);
      }
    } else if (trenId) {
      setFormData({
        ...initialState,
        id_tren: trenId,
      });
    }
  }, [vagon, trenId]);

  // Efectos para establecer el focus cuando se cambia el modo
  useEffect(() => {
    if (isCustomLugarSalida && lugarSalidaInputRef.current) {
      setTimeout(() => lugarSalidaInputRef.current.focus(), 50);
    }
  }, [isCustomLugarSalida]);

  useEffect(() => {
    if (isCustomLugarDestino && lugarDestinoInputRef.current) {
      setTimeout(() => lugarDestinoInputRef.current.focus(), 50);
    }
  }, [isCustomLugarDestino]);

  useEffect(() => {
    if (isCustomTipoTren && tipoTrenInputRef.current) {
      setTimeout(() => tipoTrenInputRef.current.focus(), 50);
    }
  }, [isCustomTipoTren]);

  const validate = () => {
    const newErrors = {};

    if (!formData.tipo_tren?.trim()) {
      newErrors.tipo_tren = "El tipo de tren es obligatorio";
    } else if (formData.tipo_tren.length > 255) {
      newErrors.tipo_tren = "El tipo de tren no debe exceder 255 caracteres";
    }

    if (!formData.lugar_salida?.trim()) {
      newErrors.lugar_salida = "El lugar de salida es obligatorio";
    } else if (formData.lugar_salida.length > 255) {
      newErrors.lugar_salida =
        "El lugar de salida no debe exceder 255 caracteres";
    }

    if (!formData.lugar_destino?.trim()) {
      newErrors.lugar_destino = "El lugar de destino es obligatorio";
    } else if (formData.lugar_destino.length > 255) {
      newErrors.lugar_destino =
        "El lugar de destino no debe exceder 255 caracteres";
    }

    if (!formData.hora_salida) {
      newErrors.hora_salida = "La hora de salida es obligatoria";
    }

    if (!formData.hora_llegada) {
      newErrors.hora_llegada = "La hora de llegada es obligatoria";
    }

    // Validación opcional para serv_add
    if (formData.serv_add && formData.serv_add.length > 255) {
      newErrors.serv_add =
        "Los servicios adicionales no deben exceder 255 caracteres";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Memoizamos esta función para evitar cambios de referencia innecesarios
  const handleChange = useCallback((e) => {
    const { name, value } = e.target;

    setFormData((prev) => {
      if (name === "tipo_tren" && value === "Otro") {
        setIsCustomTipoTren(true);
        return { ...prev, [name]: "" };
      } else if (name === "lugar_salida" && value === "Otro") {
        // Activar modo de entrada manual para lugar de salida
        setIsCustomLugarSalida(true);
        return { ...prev, [name]: "" };
      } else if (name === "lugar_destino" && value === "Otro") {
        // Activar modo de entrada manual para lugar de destino
        setIsCustomLugarDestino(true);
        return { ...prev, [name]: "" };
      } else {
        return { ...prev, [name]: value };
      }
    });
  }, []);

  const toggleCustomTipoTren = useCallback(() => {
    setIsCustomTipoTren((prevState) => {
      // Si estamos activando el modo personalizado, limpiar el campo
      if (!prevState) {
        setFormData((prev) => ({ ...prev, tipo_tren: "" }));
      }
      return !prevState;
    });
  }, []);

  // Manejadores para lugar de salida y destino
  const toggleCustomLugarSalida = useCallback(() => {
    setIsCustomLugarSalida((prevState) => {
      // Si estamos activando el modo personalizado, mantener el valor actual
      return !prevState;
    });
  }, []);

  const toggleCustomLugarDestino = useCallback(() => {
    setIsCustomLugarDestino((prevState) => {
      // Si estamos activando el modo personalizado, mantener el valor actual
      return !prevState;
    });
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (validate()) {
      // Si serv_add está vacío, enviarlo como null
      const dataToSubmit = {
        ...formData,
        serv_add: formData.serv_add?.trim() || null,
      };
      onSubmit(dataToSubmit);
    }
  };

  // Combinar tipos predefinidos con los únicos encontrados en la base de datos
  const todosLosTiposTren = [
    ...Object.values(TIPOS_TREN).map((t) => ({ value: t, label: t })),
    ...tiposTrenUnicos.map((t) => ({ value: t, label: t })),
  ];

  // Filtrar opciones de destino para excluir el origen seleccionado
  const opcionesDestino = lugaresUnicos.filter(
    (lugar) => lugar !== formData.lugar_salida,
  );

  return (
    <form onSubmit={handleSubmit} className="vagon-form">
      <div className="form-group">
        <div className="custom-field-container">
          <label htmlFor="tipo_tren">Tipo de Vagón *</label>
          <button
            type="button"
            className="custom-option-btn"
            onClick={toggleCustomTipoTren}
            disabled={isSubmitting}
            title={
              isCustomTipoTren
                ? "Cancelar entrada personalizada"
                : "Agregar tipo personalizado"
            }
          >
            {isCustomTipoTren ? <FaTimes /> : <FaEdit />}
            <span className="btn-text">
              {isCustomTipoTren ? "Cancelar" : "Personalizar"}
            </span>
          </button>
        </div>

        {isCustomTipoTren ? (
          <div className="custom-input-container">
            <input
              type="text"
              id="tipo_tren_custom"
              name="tipo_tren"
              value={formData.tipo_tren || ""}
              onChange={handleChange}
              className={`custom-field ${errors.tipo_tren ? "error" : ""}`}
              disabled={isSubmitting}
              maxLength={255}
              placeholder="Escriba un tipo de vagón personalizado"
              ref={tipoTrenInputRef}
            />
          </div>
        ) : (
          <select
            id="tipo_tren"
            name="tipo_tren"
            value={formData.tipo_tren || ""}
            onChange={handleChange}
            className={errors.tipo_tren ? "error" : ""}
            disabled={isSubmitting || isLoading}
          >
            <option value="">Seleccione un tipo...</option>
            {todosLosTiposTren.map((option, index) => (
              <option key={index} value={option.value}>
                {option.label}
              </option>
            ))}
            <option value="Otro">Otro...</option>
          </select>
        )}

        {errors.tipo_tren && (
          <div className="error-message">{errors.tipo_tren}</div>
        )}
        {isLoading && (
          <small className="text-muted">Cargando opciones...</small>
        )}
        <small className="text-muted">Máximo 255 caracteres</small>
      </div>

      {/* Servicios Adicionales */}
      <div className="form-group">
        <label htmlFor="serv_add">Servicios Adicionales (Opcional)</label>
        <textarea
          id="serv_add"
          name="serv_add"
          value={formData.serv_add || ""}
          onChange={handleChange}
          className={errors.serv_add ? "error" : ""}
          disabled={isSubmitting}
          maxLength={255}
          placeholder="Ingrese los servicios adicionales que ofrece este vagón"
          rows={3}
        />
        {errors.serv_add && (
          <div className="error-message">{errors.serv_add}</div>
        )}
        <small className="text-muted">
          Máximo 255 caracteres. Deje en blanco si no hay servicios adicionales.
        </small>
      </div>

      {/* Lugar de Salida con selector de opciones existentes */}
      <div className="form-group">
        <div className="custom-field-container">
          <label htmlFor="lugar_salida">Lugar de Salida *</label>
          <button
            type="button"
            className="custom-option-btn"
            onClick={toggleCustomLugarSalida}
            disabled={isSubmitting || lugaresUnicos.length === 0}
            title={
              isCustomLugarSalida
                ? "Seleccionar de opciones existentes"
                : "Escribir manualmente"
            }
          >
            {isCustomLugarSalida ? <FaTimes /> : <FaEdit />}
            <span className="btn-text">
              {isCustomLugarSalida ? "Opciones" : "Manual"}
            </span>
          </button>
        </div>

        {!isCustomLugarSalida && lugaresUnicos.length > 0 ? (
          <select
            id="lugar_salida"
            name="lugar_salida"
            value={formData.lugar_salida || ""}
            onChange={handleChange}
            className={errors.lugar_salida ? "error" : ""}
            disabled={isSubmitting || isLoading}
          >
            <option value="">Seleccione un origen...</option>
            {lugaresUnicos.map((lugar, index) => (
              <option key={index} value={lugar}>
                {lugar}
              </option>
            ))}
            <option value="Otro">Escribir otro...</option>
          </select>
        ) : (
          <input
            type="text"
            id="lugar_salida"
            name="lugar_salida"
            value={formData.lugar_salida || ""}
            onChange={handleChange}
            className={errors.lugar_salida ? "error" : ""}
            disabled={isSubmitting}
            maxLength={255}
            placeholder="Ingrese el lugar de salida"
            ref={lugarSalidaInputRef}
          />
        )}

        {errors.lugar_salida && (
          <div className="error-message">{errors.lugar_salida}</div>
        )}
        <small className="text-muted">Máximo 255 caracteres</small>
      </div>

      {/* Lugar de Destino con selector de opciones existentes */}
      <div className="form-group">
        <div className="custom-field-container">
          <label htmlFor="lugar_destino">Lugar de Destino *</label>
          <button
            type="button"
            className="custom-option-btn"
            onClick={toggleCustomLugarDestino}
            disabled={isSubmitting || lugaresUnicos.length === 0}
            title={
              isCustomLugarDestino
                ? "Seleccionar de opciones existentes"
                : "Escribir manualmente"
            }
          >
            {isCustomLugarDestino ? <FaTimes /> : <FaEdit />}
            <span className="btn-text">
              {isCustomLugarDestino ? "Opciones" : "Manual"}
            </span>
          </button>
        </div>

        {!isCustomLugarDestino && opcionesDestino.length > 0 ? (
          <select
            id="lugar_destino"
            name="lugar_destino"
            value={formData.lugar_destino || ""}
            onChange={handleChange}
            className={errors.lugar_destino ? "error" : ""}
            disabled={isSubmitting || isLoading}
          >
            <option value="">Seleccione un destino...</option>
            {opcionesDestino.map((lugar, index) => (
              <option key={index} value={lugar}>
                {lugar}
              </option>
            ))}
            <option value="Otro">Escribir otro...</option>
          </select>
        ) : (
          <input
            type="text"
            id="lugar_destino"
            name="lugar_destino"
            value={formData.lugar_destino || ""}
            onChange={handleChange}
            className={errors.lugar_destino ? "error" : ""}
            disabled={isSubmitting}
            maxLength={255}
            placeholder="Ingrese el lugar de destino"
            ref={lugarDestinoInputRef}
          />
        )}

        {formData.lugar_salida && !isCustomLugarDestino && (
          <small className="text-muted">
            El origen seleccionado no se muestra como opción de destino
          </small>
        )}

        {errors.lugar_destino && (
          <div className="error-message">{errors.lugar_destino}</div>
        )}
        <small className="text-muted">Máximo 255 caracteres</small>
      </div>

      <div className="form-group">
        <label htmlFor="hora_salida">Hora de Salida *</label>
        <input
          type="time"
          id="hora_salida"
          name="hora_salida"
          value={formData.hora_salida || ""}
          onChange={handleChange}
          className={errors.hora_salida ? "error" : ""}
          disabled={isSubmitting}
        />
        {errors.hora_salida && (
          <div className="error-message">{errors.hora_salida}</div>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="hora_llegada">Hora de Llegada *</label>
        <input
          type="time"
          id="hora_llegada"
          name="hora_llegada"
          value={formData.hora_llegada || ""}
          onChange={handleChange}
          className={errors.hora_llegada ? "error" : ""}
          disabled={isSubmitting}
        />
        {errors.hora_llegada && (
          <div className="error-message">{errors.hora_llegada}</div>
        )}
      </div>

      {/* Es Bimodal Switch */}
      <div className="form-group">
        <label htmlFor="es_bimodal">Vagón Bimodal</label>
        <div className="switch-container">
          <label className="switch">
            <input
              type="checkbox"
              id="es_bimodal"
              name="es_bimodal"
              checked={formData.es_bimodal || false}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  es_bimodal: e.target.checked,
                }))
              }
              disabled={isSubmitting}
            />
            <span className="slider round"></span>
          </label>
          <span className="switch-label">
            {formData.es_bimodal ? "Sí, es bimodal" : "No, es estándar"}
          </span>
        </div>
        <small className="text-muted">
          Un vagón bimodal opera en dos rutas diferentes (ej:
          Ollantaytambo-Machu Picchu en ambas direcciones)
        </small>
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
          {vagon ? "Actualizar" : "Crear"} Vagón
        </button>
      </div>
    </form>
  );
};

export default VagonForm;
