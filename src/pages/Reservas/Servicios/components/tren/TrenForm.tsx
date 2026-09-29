import { useState, useEffect, useCallback } from "react";
import { FRECUENCIAS_TREN } from "../../utils/constants";
import { FaPlus, FaTimes, FaEdit } from "react-icons/fa";
import useAuditInfo from "../../hooks/useAuditInfo";
import { fetchTrenes } from "../../services/api";
import FormField from "../../../../../components/common/FormField";
import "../../../../../components/common/FormComponents.scss";

const TrenForm = ({ tren, onSubmit, isSubmitting }) => {
  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  const initialState = {
    nombre_empresa: "",
    frecuencia: "",
    telefono: "",
    correo: "",
    mostrar_en_servicepicker: true,
    created_by: userId,
    ...tren,
  };

  const [formData, setFormData] = useState(initialState);
  const [errors, setErrors] = useState({});
  const [isCustomFrecuencia, setIsCustomFrecuencia] = useState(false);
  const [frecuenciasUnicas, setFrecuenciasUnicas] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Cargar frecuencias únicas de trenes existentes
  useEffect(() => {
    const cargarFrecuenciasUnicas = async () => {
      setIsLoading(true);
      try {
        const trenes = await fetchTrenes();
        // Extraer frecuencias únicas (excluyendo valores nulos o vacíos)
        const frecuencias = trenes
          .map((t) => t.frecuencia)
          .filter((f) => f && f.trim() !== "")
          // Filtrar duplicados
          .filter(
            (f, index, self) =>
              self.indexOf(f) === index && !FRECUENCIAS_TREN.includes(f),
          );

        setFrecuenciasUnicas(frecuencias);
      } catch (error) {
        console.error("Error al cargar frecuencias únicas:", error);
      } finally {
        setIsLoading(false);
      }
    };

    cargarFrecuenciasUnicas();
  }, []);

  useEffect(() => {
    if (tren) {
      setFormData({
        ...initialState,
        ...tren,
      });

      // Verificar si la frecuencia actual no está en las opciones predefinidas
      if (
        tren.frecuencia &&
        !FRECUENCIAS_TREN.includes(tren.frecuencia) &&
        tren.frecuencia !== "Otro"
      ) {
        setIsCustomFrecuencia(true);
      }
    }
  }, [tren]);

  const validate = () => {
    const newErrors = {};

    if (!formData.nombre_empresa?.trim()) {
      newErrors.nombre_empresa = "El nombre de la empresa es obligatorio";
    } else if (formData.nombre_empresa.length > 15) {
      newErrors.nombre_empresa =
        "El nombre de la empresa no debe exceder 15 caracteres";
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

  // Memoizamos esta función para evitar cambios de referencia innecesarios
  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    const nextValue = type === "checkbox" ? checked : value;

    setFormData((prev) => {
      if (name === "frecuencia" && value === "Otro") {
        setIsCustomFrecuencia(true);
        return { ...prev, [name]: "" };
      } else if (name === "frecuencia" && value === "") {
        // Caso para "Ninguno"
        return { ...prev, [name]: null };
      } else {
        return { ...prev, [name]: nextValue };
      }
    });
  }, []);

  const toggleCustomFrecuencia = useCallback(() => {
    setIsCustomFrecuencia((prevState) => {
      // Si estamos activando el modo personalizado, limpiar el campo
      if (!prevState) {
        setFormData((prev) => ({ ...prev, frecuencia: "" }));
      }
      return !prevState;
    });
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (validate()) {
      const cleanedData = {
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
      };
      onSubmit(cleanedData);
    }
  };

  // Combinar opciones predefinidas con las únicas encontradas en la base de datos
  const todasLasFrecuencias = [
    { value: "", label: "Ninguno" },
    ...FRECUENCIAS_TREN.map((f) => ({ value: f, label: f })),
    ...frecuenciasUnicas.map((f) => ({ value: f, label: f })),
  ];

  return (
    <form onSubmit={handleSubmit} className="tren-form">
      <div className="form-group">
        <label htmlFor="nombre_empresa">Nombre de Empresa *</label>
        <input
          type="text"
          id="nombre_empresa"
          name="nombre_empresa"
          value={formData.nombre_empresa || ""}
          onChange={handleChange}
          className={errors.nombre_empresa ? "error" : ""}
          disabled={isSubmitting}
          maxLength={15}
        />
        {errors.nombre_empresa && (
          <div className="error-message">{errors.nombre_empresa}</div>
        )}
        <small className="text-muted">Máximo 15 caracteres</small>
      </div>

      <div className="form-group">
        <div className="custom-field-container">
          <label htmlFor="frecuencia">Frecuencia</label>
          <button
            type="button"
            className="custom-option-btn"
            onClick={toggleCustomFrecuencia}
            disabled={isSubmitting}
            title={
              isCustomFrecuencia
                ? "Cancelar entrada personalizada"
                : "Agregar frecuencia personalizada"
            }
          >
            {isCustomFrecuencia ? <FaTimes /> : <FaEdit />}
            <span className="btn-text">
              {isCustomFrecuencia ? "Cancelar" : "Personalizar"}
            </span>
          </button>
        </div>

        {isCustomFrecuencia ? (
          <div className="custom-input-container">
            <input
              type="text"
              id="frecuencia_custom"
              name="frecuencia"
              value={formData.frecuencia || ""}
              onChange={handleChange}
              className={`custom-field ${errors.frecuencia ? "error" : ""}`}
              disabled={isSubmitting}
              maxLength={20}
              placeholder="Escriba una frecuencia personalizada"
            />
          </div>
        ) : (
          <select
            id="frecuencia"
            name="frecuencia"
            value={formData.frecuencia || ""}
            onChange={handleChange}
            className={errors.frecuencia ? "error" : ""}
            disabled={isSubmitting || isLoading}
          >
            {todasLasFrecuencias.map((option, index) => (
              <option key={index} value={option.value}>
                {option.label}
              </option>
            ))}
            <option value="Otro">Otro...</option>
          </select>
        )}

        {isLoading && (
          <small className="text-muted">Cargando opciones...</small>
        )}
        <small className="text-muted">
          Máximo 20 caracteres para frecuencias personalizadas
        </small>
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
          <small>Permite usar este tren al armar cotizaciones.</small>
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
          {tren ? "Actualizar" : "Crear"} Tren
        </button>
      </div>
    </form>
  );
};

export default TrenForm;
