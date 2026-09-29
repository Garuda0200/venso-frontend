import { useState, useEffect, useCallback } from "react";
import { ESTADOS_SERVICIO } from "../../utils/constants";
import useAuditInfo from "../../hooks/useAuditInfo";
import { FaEdit, FaTimes, FaInfo } from "react-icons/fa";
import { fetchTours } from "../../services/api";

const TourForm = ({ tour, endoseId, onSubmit, isSubmitting }) => {
  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  const initialState = {
    tipo_guiado: "",
    idioma: "",
    estado: "disponible",
    id_endose: endoseId || "",
    observaciones: "",
    capacidad: tour?.capacidad ?? null,
    created_by: userId,
    ...tour,
  };

  const [formData, setFormData] = useState(initialState);
  const [errors, setErrors] = useState({});
  const [hasCapacityLimit, setHasCapacityLimit] = useState(
    Number(tour?.capacidad || 0) >= 1,
  );

  // State for handling tipo_guiado selection
  const [tiposGuiadoUnicos, setTiposGuiadoUnicos] = useState([]);
  const [isCustomTipo, setIsCustomTipo] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isVariantCreation, setIsVariantCreation] = useState(
    tour?.isVariantCreation || false,
  );

  // New state for handling idioma selection
  const [idiomasUnicos, setIdiomasUnicos] = useState([]);
  const [isCustomIdioma, setIsCustomIdioma] = useState(false);
  const [isLoadingIdiomas, setIsLoadingIdiomas] = useState(false);

  // Base list of languages
  const idiomasBase = [
    "Español",
    "Inglés",
    "Francés",
    "Alemán",
    "Italiano",
    "Portugués",
    "Ruso",
    "Chino",
    "Japonés",
  ];

  // Load unique tipo_guiado values
  useEffect(() => {
    const cargarTiposGuiado = async () => {
      setIsLoading(true);
      try {
        // Get existing tours
        const toursData = await fetchTours();

        // Extract unique tipo_guiado values
        const tipos = toursData
          .map((t) => t.tipo_guiado)
          .filter((t) => t && t.trim() !== "")
          .filter((t, index, self) => self.indexOf(t) === index)
          .sort();

        setTiposGuiadoUnicos(tipos);
      } catch (error) {
        console.error("Error loading tipos de guiado:", error);
      } finally {
        setIsLoading(false);
      }
    };

    cargarTiposGuiado();
  }, []);

  // Load unique idioma values
  useEffect(() => {
    const cargarIdiomas = async () => {
      setIsLoadingIdiomas(true);
      try {
        // Get existing tours
        const toursData = await fetchTours();

        // Extract unique idioma values
        const idiomas = toursData
          .map((t) => t.idioma)
          .filter((i) => i && i.trim() !== "")
          .filter((i, index, self) => self.indexOf(i) === index)
          .sort();

        // Combine with base languages and remove duplicates
        const allIdiomas = [...new Set([...idiomasBase, ...idiomas])].sort();

        setIdiomasUnicos(allIdiomas);
      } catch (error) {
        console.error("Error loading idiomas:", error);
      } finally {
        setIsLoadingIdiomas(false);
      }
    };

    cargarIdiomas();
  }, []);

  useEffect(() => {
    if (tour) {
      setFormData({
        ...initialState,
        ...tour,
        capacidad: tour.capacidad ?? null,
      });
      setHasCapacityLimit(Number(tour.capacidad || 0) >= 1);

      // Check if we're creating a variant
      if (tour.isVariantCreation) {
        setIsVariantCreation(true);
        setIsCustomTipo(false);
      } else {
        setIsVariantCreation(false);
      }
    } else if (endoseId) {
      setFormData({
        ...initialState,
        id_endose: endoseId,
        capacidad: null,
      });
      setHasCapacityLimit(false);
    }
  }, [tour, endoseId]);

  // Check if custom flags needed (separate to avoid resetting formData)
  useEffect(() => {
    if (tour && !tour.isVariantCreation) {
      if (
        tour.tipo_guiado &&
        tiposGuiadoUnicos.length > 0 &&
        !tiposGuiadoUnicos.includes(tour.tipo_guiado)
      ) {
        setIsCustomTipo(true);
      }
    }
    if (
      tour?.idioma &&
      idiomasUnicos.length > 0 &&
      !idiomasUnicos.includes(tour.idioma) &&
      tour.idioma.trim() !== ""
    ) {
      setIsCustomIdioma(true);
    }
  }, [tour, tiposGuiadoUnicos, idiomasUnicos]);

  const validate = () => {
    const newErrors = {};

    if (!formData.tipo_guiado) {
      newErrors.tipo_guiado = "El tipo de guiado es obligatorio";
    }
    if (
      hasCapacityLimit &&
      (!formData.capacidad || Number(formData.capacidad) < 1)
    ) {
      newErrors.capacidad = "La capacidad debe ser mayor o igual a 1";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "tipo_guiado" && value === "Otro") {
      setIsCustomTipo(true);
      setFormData((prev) => ({ ...prev, tipo_guiado: "" }));
    } else if (name === "idioma" && value === "Otro") {
      setIsCustomIdioma(true);
      setFormData((prev) => ({ ...prev, idioma: "" }));
    } else if (name === "capacidad") {
      setFormData((prev) => ({
        ...prev,
        capacidad: value === "" ? "" : Math.max(1, Number(value) || 1),
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleCapacityToggle = () => {
    setHasCapacityLimit((enabled) => {
      const nextEnabled = !enabled;
      setFormData((prev) => ({
        ...prev,
        capacidad: nextEnabled ? Number(prev.capacidad || 1) : null,
      }));
      return nextEnabled;
    });
  };

  // Toggle between custom and select input for tipo_guiado
  const toggleCustomTipo = useCallback(() => {
    setIsCustomTipo((prevState) => {
      if (!prevState) {
        setFormData((prev) => ({ ...prev, tipo_guiado: "" }));
      }
      return !prevState;
    });
  }, []);

  // Toggle between custom and select input for idioma
  const toggleCustomIdioma = useCallback(() => {
    setIsCustomIdioma((prevState) => {
      if (!prevState) {
        setFormData((prev) => ({ ...prev, idioma: "" }));
      }
      return !prevState;
    });
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (validate()) {
      onSubmit({
        ...formData,
        capacidad: hasCapacityLimit ? Number(formData.capacidad || 1) : null,
      });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <div className="custom-field-container">
          <label htmlFor="tipo_guiado">Tipo de Guiado *</label>
          {!isVariantCreation && (
            <button
              type="button"
              className="custom-option-btn"
              onClick={toggleCustomTipo}
              disabled={isSubmitting}
              title={
                isCustomTipo
                  ? "Seleccionar tipo existente"
                  : "Ingresar tipo personalizado"
              }
            >
              {isCustomTipo ? <FaTimes /> : <FaEdit />}
              <span className="btn-text">
                {isCustomTipo ? "Cancelar" : "Personalizar"}
              </span>
            </button>
          )}
        </div>

        {isVariantCreation ? (
          <div className="variant-input-container">
            <input
              type="text"
              id="tipo_guiado_variant"
              name="tipo_guiado"
              value={formData.tipo_guiado || ""}
              className="variant-field"
              readOnly
            />
            <small className="form-text text-muted">
              <FaInfo style={{ marginRight: 5 }} /> Creando una variante para
              este tipo de guiado
            </small>
          </div>
        ) : isCustomTipo ? (
          <div className="custom-input-container">
            <input
              type="text"
              id="tipo_guiado_custom"
              name="tipo_guiado"
              value={formData.tipo_guiado || ""}
              onChange={handleChange}
              className={`custom-field ${errors.tipo_guiado ? "error" : ""}`}
              disabled={isSubmitting}
              placeholder="Ingrese un tipo de guiado personalizado"
              maxLength={255}
            />
          </div>
        ) : (
          <select
            id="tipo_guiado"
            name="tipo_guiado"
            value={formData.tipo_guiado || ""}
            onChange={handleChange}
            className={errors.tipo_guiado ? "error" : ""}
            disabled={isSubmitting || isLoading}
          >
            <option value="">Seleccione un tipo...</option>
            {tiposGuiadoUnicos.map((tipo, index) => (
              <option key={index} value={tipo}>
                {tipo}
              </option>
            ))}
            <option value="Otro">Otro...</option>
          </select>
        )}
        {errors.tipo_guiado && (
          <div className="error-message">{errors.tipo_guiado}</div>
        )}
        {isLoading && <small className="text-muted">Cargando tipos...</small>}
      </div>

      <div className="form-group">
        <div className="custom-field-container">
          <label htmlFor="idioma">Idioma</label>
          <button
            type="button"
            className="custom-option-btn"
            onClick={toggleCustomIdioma}
            disabled={isSubmitting}
            title={
              isCustomIdioma
                ? "Seleccionar idioma existente"
                : "Ingresar idioma personalizado"
            }
          >
            {isCustomIdioma ? <FaTimes /> : <FaEdit />}
            <span className="btn-text">
              {isCustomIdioma ? "Cancelar" : "Personalizar"}
            </span>
          </button>
        </div>

        {isCustomIdioma ? (
          <div className="custom-input-container">
            <input
              type="text"
              id="idioma_custom"
              name="idioma"
              value={formData.idioma || ""}
              onChange={handleChange}
              className="custom-field"
              disabled={isSubmitting}
              placeholder="Ingrese un idioma personalizado"
              maxLength={255}
            />
          </div>
        ) : (
          <select
            id="idioma"
            name="idioma"
            value={formData.idioma || ""}
            onChange={handleChange}
            disabled={isSubmitting || isLoadingIdiomas}
          >
            <option value="">Seleccione un idioma...</option>
            {idiomasUnicos.map((idioma, index) => (
              <option key={index} value={idioma}>
                {idioma}
              </option>
            ))}
            <option value="Otro">Otro...</option>
          </select>
        )}
        {isLoadingIdiomas && (
          <small className="text-muted">Cargando idiomas...</small>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="observaciones">Observaciones</label>
        <textarea
          id="observaciones"
          name="observaciones"
          value={formData.observaciones || ""}
          onChange={handleChange}
          placeholder="Información adicional sobre este tour"
          disabled={isSubmitting}
        />
      </div>

      <div className="form-group">
        <div className="custom-field-container">
          <label htmlFor="capacidad">Capacidad de pasajeros</label>
          <label className="switch-inline">
            <input
              type="checkbox"
              checked={hasCapacityLimit}
              onChange={handleCapacityToggle}
              disabled={isSubmitting}
            />
            <span>{hasCapacityLimit ? "Limitada" : "Sin límite"}</span>
          </label>
        </div>
        {hasCapacityLimit && (
          <input
            id="capacidad"
            name="capacidad"
            type="number"
            min="1"
            step="1"
            value={formData.capacidad || 1}
            onChange={handleChange}
            disabled={isSubmitting}
            placeholder="Ej: 4"
            className={errors.capacidad ? "error" : ""}
          />
        )}
        <small className="form-text text-muted">
          Si está desactivado, el tour acepta cualquier cantidad de pasajeros.
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
          {tour ? "Actualizar" : "Crear"} Tour
        </button>
      </div>
    </form>
  );
};

export default TourForm;
