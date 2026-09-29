import React, { useState, useEffect, useCallback, useMemo } from "react";
import useAuditInfo from "../../hooks/useAuditInfo";
import {
  FaEdit,
  FaTimes,
  FaInfoCircle,
  FaUsers,
  FaCarAlt,
  FaRoute,
  FaPlus,
  FaCheck,
} from "react-icons/fa";
import { TIPOS_AUTO } from "../../utils/constants";
import "./MovilidadForm.scss";

const normalizeRoute = (route) => (route || "").trim();

const MovilidadForm = ({
  movilidad,
  onSubmit,
  isSubmitting,
  availableRoutes = [],
  existingMovilidades = [],
}) => {
  const { userId } = useAuditInfo();
  const isEditMode = Boolean(movilidad?.id_movilidad);

  // Estado inicial para el formulario
  const initialFormState = {
    id_transporte: movilidad?.id_transporte || "",
    tipo_auto: "",
    nro_pasajeros: "",
    nro_placa: "",
    ruta: "",
    estado: "disponible",
    created_by: userId,
    isVariantCreation: false,
  };

  // Estado del formulario
  const [formData, setFormData] = useState(initialFormState);
  const [errors, setErrors] = useState({});
  // Estados para campos personalizables
  const [isCustomTipo, setIsCustomTipo] = useState(false);
  const [isCustomRuta, setIsCustomRuta] = useState(false);
  const [isVariantCreation, setIsVariantCreation] = useState(
    Boolean(movilidad?.isVariantCreation),
  );

  // Cargar datos si estamos editando
  useEffect(() => {
    if (movilidad) {
      const nextFormData = {
        ...initialFormState,
        ...movilidad,
        isVariantCreation: Boolean(movilidad.isVariantCreation),
      };

      setFormData(nextFormData);
      setIsVariantCreation(Boolean(movilidad.isVariantCreation));

      // Verificar si el tipo_auto es personalizado
      if (movilidad.tipo_auto && !TIPOS_AUTO.includes(movilidad.tipo_auto)) {
        setIsCustomTipo(true);
      } else {
        setIsCustomTipo(false);
      }

      const routeValue = normalizeRoute(nextFormData.ruta);
      setIsCustomRuta(
        Boolean(
          routeValue &&
            availableRoutes.length > 0 &&
            !availableRoutes.includes(routeValue) &&
            !movilidad.isVariantCreation,
        ),
      );
    } else {
      setFormData({
        ...initialFormState,
        id_transporte: movilidad?.id_transporte || "",
      });
      setIsCustomTipo(false);
      setIsCustomRuta(false);
      setIsVariantCreation(false);
    }
  }, [movilidad, availableRoutes]);

  const routeVariants = useMemo(() => {
    const currentRoute = normalizeRoute(formData.ruta);
    if (!currentRoute) return [];

    return existingMovilidades.filter((item) => {
      const sameRoute = normalizeRoute(item.ruta) === currentRoute;
      const differentItem =
        !formData.id_movilidad || item.id_movilidad !== formData.id_movilidad;
      return sameRoute && differentItem;
    });
  }, [existingMovilidades, formData.ruta, formData.id_movilidad]);

  const availableTiposAuto = useMemo(() => {
    const combined = [...TIPOS_AUTO];
    if (Array.isArray(existingMovilidades)) {
      existingMovilidades.forEach((item) => {
        if (item.tipo_auto && !combined.includes(item.tipo_auto)) {
          combined.push(item.tipo_auto);
        }
      });
    }
    return combined.sort((a, b) => (a || "").localeCompare(b || ""));
  }, [existingMovilidades]);

  // Manejar cambios en los campos

  const handleChange = useCallback(
    (e) => {
      const { name, value, type } = e.target;

      if (name === "tipo_auto_select" && value !== "") {
        // Cuando se selecciona desde el dropdown
        if (value === "otro") {
          setIsCustomTipo(true);
          setFormData((prev) => ({ ...prev, tipo_auto: "" }));
        } else {
          setFormData((prev) => ({ ...prev, tipo_auto: value }));
        }
      } else if (name === "ruta_select") {
        if (value === "__custom_route__") {
          setIsCustomRuta(true);
          setFormData((prev) => ({ ...prev, ruta: "" }));
        } else {
          setFormData((prev) => ({ ...prev, ruta: value }));
        }
      } else if (name === "nro_pasajeros") {
        // Asegurar que sea un número positivo
        const numValue = parseInt(value);
        if (value === "" || (numValue > 0 && numValue <= 100)) {
          setFormData((prev) => ({ ...prev, [name]: value }));
        }
      } else {
        // Para otros campos
        setFormData((prev) => ({ ...prev, [name]: value }));
      }

      // Limpiar error al cambiar el valor
      if (errors[name]) {
        setErrors((prev) => ({ ...prev, [name]: null }));
      }
    },
    [errors],
  );

  // Validar el formulario
  const validate = () => {
    const newErrors = {};

    if (!formData.tipo_auto.trim()) {
      newErrors.tipo_auto = "El tipo de auto es requerido";
    } else if (formData.tipo_auto.length > 255) {
      newErrors.tipo_auto = "El tipo de auto debe tener máximo 255 caracteres";
    }

    if (!formData.nro_pasajeros || formData.nro_pasajeros === "") {
      newErrors.nro_pasajeros = "El número de pasajeros es requerido";
    } else {
      const nroPasajeros = parseInt(formData.nro_pasajeros);
      if (isNaN(nroPasajeros) || nroPasajeros <= 0) {
        newErrors.nro_pasajeros =
          "El número de pasajeros debe ser un número positivo";
      }
    }

    if (formData.nro_placa && formData.nro_placa.length > 10) {
      newErrors.nro_placa =
        "El número de placa debe tener máximo 10 caracteres";
    }

    if (formData.ruta && formData.ruta.length > 255) {
      newErrors.ruta = "La ruta debe tener máximo 255 caracteres";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Manejar envío del formulario
  const handleSubmit = (e) => {
    e.preventDefault();

    if (validate()) {
      // Asegurar que nro_pasajeros sea un entero
      const cleanedData = {
        ...formData,
        nro_pasajeros: parseInt(formData.nro_pasajeros),
      };

      // Si estamos editando, asegurarse de mantener el id_movilidad
      if (movilidad?.id_movilidad) {
        cleanedData.id_movilidad = movilidad.id_movilidad;
      }

      const {
        isVariantCreation: _isVariantCreation,
        tarifas,
        tarifasFiltradas,
        ...payload
      } = cleanedData;

      onSubmit(payload);
    }
  };

  // Función para manejar campos personalizados
  const toggleCustomTipo = useCallback(() => {
    setIsCustomTipo((prevState) => {
      // Si estamos activando el modo personalizado, limpiar el campo
      if (!prevState) {
        setFormData((prev) => ({ ...prev, tipo_auto: "" }));
      }
      return !prevState;
    });
  }, []);

  const toggleCustomRuta = useCallback(() => {
    setIsCustomRuta((prevState) => {
      if (!prevState) {
        setFormData((prev) => ({ ...prev, ruta: "" }));
      }
      return !prevState;
    });
  }, []);

  const handlePrepareRouteVariant = () => {
    if (!formData.ruta) return;

    setFormData((prev) => ({
      ...initialFormState,
      id_transporte: prev.id_transporte,
      ruta: prev.ruta,
      estado: "disponible",
      isVariantCreation: true,
    }));
    setIsVariantCreation(true);
    setIsCustomRuta(false);
    setErrors({});
  };

  // Add helper function to prevent wheel scrolling
  const preventWheelChange = (e) => {
    e.target.blur();
  };

  // Add helper function to prevent arrow keys from changing values
  const preventArrowChange = (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="movilidad-form habitacion-form">
      <div className="form-group">
        <div className="custom-field-container">
          <label htmlFor="tipo_auto">Tipo de Vehículo *</label>
          <button
            type="button"
            className="custom-option-btn"
            onClick={toggleCustomTipo}
            disabled={isSubmitting}
            title={
              isCustomTipo
                ? "Usar tipos predefinidos"
                : "Crear tipo personalizado"
            }
          >
            {isCustomTipo ? <FaTimes /> : <FaEdit />}
            <span className="btn-text">
              {isCustomTipo ? "Cancelar" : "Personalizar"}
            </span>
          </button>
        </div>

        {isCustomTipo ? (
          <div className="custom-input-container">
            <input
              type="text"
              id="tipo_auto"
              name="tipo_auto"
              value={formData.tipo_auto || ""}
              onChange={handleChange}
              className={`custom-field ${errors.tipo_auto ? "error" : ""}`}
              disabled={isSubmitting}
              placeholder="Ingrese un tipo de vehículo personalizado"
              maxLength={255}
              autoFocus
            />
          </div>
        ) : (
          <select
            id="tipo_auto_select"
            name="tipo_auto_select"
            value={formData.tipo_auto || ""}
            onChange={handleChange}
            className={errors.tipo_auto ? "error" : ""}
            disabled={isSubmitting}
          >
            <option value="">Seleccione un tipo de vehículo...</option>
            {availableTiposAuto.map((tipo, index) => (
              <option key={index} value={tipo}>
                {tipo}
              </option>
            ))}
            <option value="otro">Otro tipo...</option>
          </select>
        )}
        {errors.tipo_auto && (
          <div className="error-message">{errors.tipo_auto}</div>
        )}
      </div>

      <div className="form-group movilidad-route-field">
        <div className="custom-field-container">
          <label htmlFor="ruta">
            <FaRoute className="icon-inline" /> Ruta de Operacion
          </label>
          {!isVariantCreation && availableRoutes.length > 0 && (
            <button
              type="button"
              className="custom-option-btn"
              onClick={toggleCustomRuta}
              disabled={isSubmitting}
              title={
                isCustomRuta
                  ? "Usar rutas registradas"
                  : "Crear ruta personalizada"
              }
            >
              {isCustomRuta ? <FaTimes /> : <FaEdit />}
              <span className="btn-text">
                {isCustomRuta ? "Cancelar" : "Personalizar"}
              </span>
            </button>
          )}
        </div>

        {isVariantCreation ? (
          <div className="variant-input-container route-variant-input">
            <input
              type="text"
              id="ruta_variant"
              value={normalizeRoute(formData.ruta) || "Sin ruta definida"}
              className="variant-field"
              readOnly
            />
            <small className="form-text text-muted">
              <FaInfoCircle style={{ marginRight: 5 }} /> Creando una variante
              para esta ruta
            </small>
          </div>
        ) : isCustomRuta || availableRoutes.length === 0 ? (
          <div className="custom-input-container">
            <input
              type="text"
              id="ruta"
              name="ruta"
              value={formData.ruta || ""}
              onChange={handleChange}
              className={`custom-field ${errors.ruta ? "error" : ""}`}
              disabled={isSubmitting}
              placeholder="Ejemplo: Aeropuerto - Centro Historico"
              maxLength={255}
              autoFocus
            />
          </div>
        ) : (
          <select
            id="ruta_select"
            name="ruta_select"
            value={formData.ruta || ""}
            onChange={handleChange}
            className={`form-control ${errors.ruta ? "error" : ""}`}
            disabled={isSubmitting}
          >
            <option value="">Sin ruta / por definir</option>
            {availableRoutes.map((route) => (
              <option key={route} value={route}>
                {route}
              </option>
            ))}
            <option value="__custom_route__">Otra ruta...</option>
          </select>
        )}
        {errors.ruta && <div className="error-message">{errors.ruta}</div>}

        {formData.ruta && !isVariantCreation && !isCustomRuta && (
          <div className="quick-add-container route-quick-add">
            <button
              type="button"
              className="quick-add-btn"
              onClick={handlePrepareRouteVariant}
              disabled={isSubmitting}
              title="Agregar otra movilidad para esta ruta"
            >
              <FaPlus /> Preparar variante para esta ruta
            </button>
            <small className="form-text text-muted">
              Conserva la ruta y limpia vehiculo, placa y capacidad.
            </small>
          </div>
        )}
      </div>

      {routeVariants.length > 0 && (
        <div className="combinations-info movilidad-variants-info">
          <h4>Variantes registradas para "{formData.ruta}":</h4>
          <div className="combinations-list">
            {routeVariants.map((variant) => (
              <div key={variant.id_movilidad} className="combination-item">
                <FaCheck className="check-icon" />
                <span className="badge primary">{variant.tipo_auto}</span>
                <span className="badge secondary">
                  {variant.nro_pasajeros} pax
                </span>
                {variant.nro_placa && (
                  <span className="badge info">{variant.nro_placa}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="form-group">
        <label htmlFor="nro_pasajeros">
          <FaUsers className="icon-inline" /> Número de Pasajeros *
        </label>
        <input
          type="number"
          id="nro_pasajeros"
          name="nro_pasajeros"
          value={formData.nro_pasajeros || ""}
          onChange={handleChange}
          className={`form-control ${errors.nro_pasajeros ? "error" : ""}`}
          min="1"
          max="100"
          disabled={isSubmitting}
          onWheel={preventWheelChange}
          onKeyDown={preventArrowChange}
        />
        {errors.nro_pasajeros && (
          <div className="error-message">{errors.nro_pasajeros}</div>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="nro_placa">
          <FaCarAlt className="icon-inline" /> Número de Placa
        </label>
        <input
          type="text"
          id="nro_placa"
          name="nro_placa"
          value={formData.nro_placa || ""}
          onChange={handleChange}
          className={`form-control ${errors.nro_placa ? "error" : ""}`}
          disabled={isSubmitting}
          placeholder="Opcional"
          maxLength={10}
        />
        {errors.nro_placa && (
          <div className="error-message">{errors.nro_placa}</div>
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
          {isSubmitting ? "Guardando..." : isEditMode ? "Actualizar" : "Crear"}
        </button>
      </div>
    </form>
  );
};

export default MovilidadForm;
