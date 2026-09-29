import React, { useState, useEffect, useCallback } from "react";
import useAuditInfo from "../../hooks/useAuditInfo";
import { FaEdit, FaTimes } from "react-icons/fa";
import { fetchRutas } from "../../services/api";
import { TIPOS_TOUR, ESTADOS_SERVICIO } from "../../utils/constants";

const RutaForm = ({ ruta, guiaId, onSubmit, isSubmitting }) => {
  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  // CORREGIDO: Asegurar que guiaId sea pasado como número una sola vez
  const numericGuiaId = guiaId ? parseInt(guiaId, 10) : null;

  const initialState = {
    id_guia: numericGuiaId || "",
    tour_nombre: "",
    viaticos: false,
    costo_viaticos: "",
    observaciones: "",
    estado: "disponible",
    created_by: userId,
  };

  const [formData, setFormData] = useState({ ...initialState });
  const [errors, setErrors] = useState({});
  // Estado para campo personalizable de tour_nombre
  const [isCustomTourNombre, setIsCustomTourNombre] = useState(false);
  // Estados para opciones únicas
  const [tourNombresUnicos, setTourNombresUnicos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Cargar nombres de tour únicos de rutas existentes - CORREGIDO: Añadida lista de dependencias correcta
  useEffect(() => {
    const cargarOpcionesUnicas = async () => {
      setIsLoading(true);
      try {
        const rutas = await fetchRutas();

        // Extraer nombres de tour únicos que no estén en las constantes predefinidas
        const nombresTour = rutas
          .map((r) => r.tour_nombre)
          .filter((t) => t && t.trim() !== "")
          .filter(
            (t, index, self) =>
              self.indexOf(t) === index &&
              !Object.values(TIPOS_TOUR).includes(t),
          );

        setTourNombresUnicos(nombresTour);
      } catch (error) {
        console.error("Error al cargar opciones únicas:", error);
      } finally {
        setIsLoading(false);
      }
    };

    cargarOpcionesUnicas();
  }, []); // Solo se ejecuta una vez al montar el componente

  // CORREGIDO: Inicialización del formulario cuando cambia ruta o guiaId
  useEffect(() => {
    // Si estamos en modo edición
    if (ruta) {
      // Crear un nuevo objeto para evitar referencias
      const rutaData = { ...initialState };

      // Copiar propiedades específicas para evitar valores no deseados
      if (ruta.id_ruta !== undefined) rutaData.id_ruta = ruta.id_ruta;
      if (ruta.tour_nombre !== undefined)
        rutaData.tour_nombre = ruta.tour_nombre;
      if (ruta.viaticos !== undefined) rutaData.viaticos = ruta.viaticos;
      if (ruta.costo_viaticos !== undefined) {
        rutaData.costo_viaticos =
          ruta.costo_viaticos !== null ? ruta.costo_viaticos.toString() : "";
      }
      if (ruta.observaciones !== undefined)
        rutaData.observaciones = ruta.observaciones || "";
      if (ruta.estado !== undefined) rutaData.estado = ruta.estado;

      setFormData(rutaData);

      // Verificar si el nombre del tour es personalizado
      setIsCustomTourNombre(
        ruta.tour_nombre &&
          !Object.values(TIPOS_TOUR).includes(ruta.tour_nombre) &&
          ruta.tour_nombre !== "Otro",
      );
    } else if (numericGuiaId) {
      // Si estamos creando una nueva ruta
      setFormData({
        ...initialState,
        id_guia: numericGuiaId,
      });
      setIsCustomTourNombre(false);
    }
  }, [ruta, numericGuiaId]); // CORREGIDO: Dependencias específicas

  const validate = () => {
    const newErrors = {};

    if (!formData.tour_nombre || formData.tour_nombre.trim() === "") {
      newErrors.tour_nombre = "El nombre del tour es obligatorio";
    }

    // Validación para viáticos
    if (formData.viaticos === true) {
      if (!formData.costo_viaticos) {
        newErrors.costo_viaticos =
          "Debe especificar un costo de viáticos válido";
      } else if (
        isNaN(parseFloat(formData.costo_viaticos)) ||
        parseFloat(formData.costo_viaticos) <= 0
      ) {
        newErrors.costo_viaticos =
          "El costo de viáticos debe ser un número mayor a 0";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    // Manejar checkboxes
    if (type === "checkbox") {
      setFormData((prev) => ({
        ...prev,
        [name]: checked,
      }));

      // Si desmarcamos viáticos, limpiar el costo
      if (name === "viaticos" && !checked) {
        setFormData((prev) => ({
          ...prev,
          costo_viaticos: "",
        }));
      }
    }
    // Manejar campos numéricos
    else if (name === "costo_viaticos") {
      // Permitir solo números y punto decimal
      const numericValue = value.replace(/[^\d.]/g, "");

      // Asegurar que solo hay un punto decimal
      const parts = numericValue.split(".");
      const formattedValue =
        parts.length > 1
          ? parts[0] + "." + parts.slice(1).join("")
          : numericValue;

      setFormData((prev) => ({
        ...prev,
        [name]: formattedValue,
      }));
    }
    // Manejar otros campos
    else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }

    // Si es el campo de nombre de tour y se selecciona "Otro", activar campo personalizado
    if (name === "tour_nombre" && value === "Otro") {
      setIsCustomTourNombre(true);
      setFormData((prev) => ({ ...prev, tour_nombre: "" }));
    }

    // Limpiar error cuando el usuario cambia el campo
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: undefined,
      }));
    }
  };

  // Funciones para manejar campos personalizados
  const toggleCustomTourNombre = useCallback(() => {
    setIsCustomTourNombre((prevState) => {
      // Si estamos activando el modo personalizado, limpiar el campo
      if (!prevState) {
        setFormData((prev) => ({ ...prev, tour_nombre: "" }));
      }
      return !prevState;
    });
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (validate()) {
      // CORREGIDO: Procesar los datos correctamente antes de enviar
      const dataToSubmit = {
        ...formData,
        // Asegurar id_guia como número válido
        id_guia: numericGuiaId,

        // Manejar costo_viaticos apropiadamente
        costo_viaticos:
          formData.viaticos && formData.costo_viaticos
            ? parseFloat(formData.costo_viaticos)
            : null,

        // IMPORTANTE: Convertir observaciones vacías a null explícitamente
        observaciones:
          formData.observaciones && formData.observaciones.trim() !== ""
            ? formData.observaciones
            : null,
      };

      onSubmit(dataToSubmit);
    }
  };

  // CORREGIDO: Botón de cancelar ahora pasa null para indicar cancelación
  const handleCancel = () => {
    onSubmit(null);
  };

  // Combinar tipos de ruta predefinidos con los únicos encontrados en la base de datos
  const todosLosTiposRuta = [
    { value: "", label: "Seleccione un tipo de tour..." },
    ...Object.values(TIPOS_TOUR).map((tipo) => ({ value: tipo, label: tipo })),
    ...tourNombresUnicos.map((tipo) => ({ value: tipo, label: tipo })),
    { value: "Otro", label: "Otro..." },
  ];

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <div className="custom-field-container">
          <label htmlFor="tour_nombre">Nombre del Tour *</label>
          <button
            type="button"
            className="custom-option-btn"
            onClick={toggleCustomTourNombre}
            disabled={isSubmitting}
            title={
              isCustomTourNombre
                ? "Cancelar entrada personalizada"
                : "Agregar nombre de tour personalizado"
            }
          >
            {isCustomTourNombre ? <FaTimes /> : <FaEdit />}
            <span className="btn-text">
              {isCustomTourNombre ? "Cancelar" : "Personalizar"}
            </span>
          </button>
        </div>

        {isCustomTourNombre ? (
          <div className="custom-input-container">
            <input
              type="text"
              id="tour_nombre_custom"
              name="tour_nombre"
              value={formData.tour_nombre || ""}
              onChange={handleChange}
              className={`custom-field ${errors.tour_nombre ? "error" : ""}`}
              disabled={isSubmitting}
              placeholder="Escriba un nombre de tour personalizado"
              maxLength={255}
              autoFocus
            />
          </div>
        ) : (
          <select
            id="tour_nombre"
            name="tour_nombre"
            value={formData.tour_nombre || ""}
            onChange={handleChange}
            className={`form-control ${errors.tour_nombre ? "error" : ""}`}
            disabled={isSubmitting || isLoading}
          >
            {todosLosTiposRuta.map((option, index) => (
              <option key={index} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
        {errors.tour_nombre && (
          <div className="error-message">{errors.tour_nombre}</div>
        )}
        {isLoading && (
          <small className="text-muted">Cargando opciones...</small>
        )}
      </div>

      <div className="form-group switch-container">
        <div className="switch-label-container">
          <label htmlFor="viaticos">¿Incluye Viáticos?</label>
          <div className="text-muted">
            Si el tour incluye viáticos para el guía
          </div>
        </div>
        <div
          className={`toggle-switch ${formData.viaticos ? "active" : ""} ${isSubmitting ? "disabled" : ""}`}
          onClick={() =>
            !isSubmitting &&
            setFormData((prev) => ({
              ...prev,
              viaticos: !prev.viaticos,
              // Si estamos desactivando viáticos, limpiar el costo
              costo_viaticos: !prev.viaticos ? prev.costo_viaticos : "",
            }))
          }
        >
          <div className="switch-handle"></div>
        </div>
      </div>

      {formData.viaticos && (
        <div className="form-group">
          <label htmlFor="costo_viaticos">Costo de Viáticos *</label>
          <input
            type="text"
            id="costo_viaticos"
            name="costo_viaticos"
            value={formData.costo_viaticos || ""}
            onChange={handleChange}
            className={errors.costo_viaticos ? "error" : ""}
            disabled={isSubmitting}
            placeholder="Ingrese el costo (ej: 50.00)"
          />
          {errors.costo_viaticos && (
            <div className="error-message">{errors.costo_viaticos}</div>
          )}
          <small className="form-text text-muted">
            Ingrese un valor numérico mayor a cero
          </small>
        </div>
      )}

      <div className="form-group">
        <label htmlFor="observaciones">Observaciones</label>
        <textarea
          id="observaciones"
          name="observaciones"
          value={formData.observaciones || ""}
          onChange={handleChange}
          className={errors.observaciones ? "error" : ""}
          disabled={isSubmitting}
          rows="3"
          placeholder="Ingrese observaciones o deje en blanco para 'null'"
        ></textarea>
        <small className="form-text text-muted">
          Si no hay observaciones, deje en blanco para guardar como null
        </small>
      </div>

      <div className="button-group">
        <button
          type="button"
          className="button button-secondary"
          onClick={handleCancel}
          disabled={isSubmitting}
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="button button-primary"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Guardando..." : ruta ? "Actualizar" : "Crear"} Ruta
        </button>
      </div>
    </form>
  );
};

export default RutaForm;
