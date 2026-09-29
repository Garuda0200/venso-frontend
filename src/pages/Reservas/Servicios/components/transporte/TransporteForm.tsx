import React, { useState, useEffect, useCallback } from "react";
import useAuditInfo from "../../hooks/useAuditInfo";
import { fetchTransportes } from "../../services/api";
import {
  FormField,
  SelectField,
  TextAreaField,
} from "../../../../../components/common";
import "../../../../../components/common/FormComponents.scss";

const TransporteForm = ({ transporte, onSubmit, isSubmitting }) => {
  const { userId } = useAuditInfo();

  // Estado inicial para el formulario
  const initialFormState = {
    nombre_transporte: "",
    zona: "",
    telefono: "",
    correo: "",
    mostrar_en_servicepicker: true,
    created_by: userId,
  };

  // Estado del formulario
  const [formData, setFormData] = useState(initialFormState);
  const [errors, setErrors] = useState({});
  // Estados para campos personalizables
  const [isCustomNombre, setIsCustomNombre] = useState(false);
  // Estados para opciones únicas
  const [nombresUnicos, setNombresUnicos] = useState([]);
  const [zonasUnicas, setZonasUnicas] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Cargar nombres y zonas únicas de transportes existentes
  useEffect(() => {
    const cargarOpcionesUnicas = async () => {
      setIsLoading(true);
      try {
        const transportesData = await fetchTransportes();

        // Extraer nombres únicos
        const nombres = transportesData
          .map((t) => t.nombre_transporte)
          .filter((n) => n && n.trim() !== "")
          .filter((n, index, self) => self.indexOf(n) === index)
          .sort();

        // Extraer zonas únicas
        const zonas = transportesData
          .map((t) => t.zona)
          .filter((z) => z && z.trim() !== "")
          .filter((z, index, self) => self.indexOf(z) === index)
          .sort();

        setNombresUnicos(nombres);
        setZonasUnicas(zonas);
      } catch (error) {
        console.error("Error al cargar opciones únicas:", error);
      } finally {
        setIsLoading(false);
      }
    };

    cargarOpcionesUnicas();
  }, []);

  // Cargar datos si estamos editando
  useEffect(() => {
    if (transporte) {
      // Si estamos editando un transporte existente
      setFormData({
        ...initialFormState,
        ...transporte,
      });
    } else {
      setFormData(initialFormState);
      setIsCustomNombre(false);
    }
  }, [transporte]);

  // Check if nombre is custom (separate to avoid resetting formData)
  useEffect(() => {
    if (
      transporte?.nombre_transporte &&
      nombresUnicos.length > 0 &&
      !nombresUnicos.includes(transporte.nombre_transporte)
    ) {
      setIsCustomNombre(true);
    }
  }, [transporte, nombresUnicos]);

  // Manejar cambios en los campos
  const handleChange = useCallback(
    (e) => {
      const { name, value, type, checked } = e.target;
      const nextValue = type === "checkbox" ? checked : value;

      if (name === "nombre_transporte_select" && value !== "") {
        // Cuando se selecciona desde el dropdown
        if (value === "nuevo") {
          setIsCustomNombre(true);
          setFormData((prev) => ({ ...prev, nombre_transporte: "" }));
        } else {
          setFormData((prev) => ({ ...prev, nombre_transporte: value }));
        }
      } else {
        // Para otros campos o cuando se escribe directamente
        setFormData((prev) => ({ ...prev, [name]: nextValue }));
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

    if (!formData.nombre_transporte?.trim()) {
      newErrors.nombre_transporte = "El nombre del transporte es requerido";
    } else if (formData.nombre_transporte.length > 50) {
      newErrors.nombre_transporte = "El nombre debe tener máximo 50 caracteres";
    }

    if (!formData.zona?.trim()) {
      newErrors.zona = "La zona es requerida";
    } else if (formData.zona.length > 1000) {
      // Prevenir entradas extremadamente largas, aunque el backend usa TEXT
      newErrors.zona = "La descripción de la zona es demasiado larga";
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

  // Manejar envío del formulario
  const handleSubmit = (e) => {
    e.preventDefault();

    if (validate()) {
      // Limpiar espacios en blanco innecesarios antes de enviar
      const cleanedData = {
        ...formData,
        nombre_transporte: formData.nombre_transporte.trim(),
        zona: formData.zona.trim(),
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

      // Si estamos editando, asegurarse de no enviar created_by
      if (transporte) {
        const { created_by, ...finalData } = cleanedData;
        onSubmit(finalData);
      } else {
        onSubmit(cleanedData);
      }
    }
  };

  // Manejar el formato de entrada de zona
  const handleZonaInput = (e) => {
    // Permitir máximo 5 líneas
    const lines = e.target.value.split("\n");
    if (lines.length > 5) {
      // Limitar a 5 líneas
      const truncated = lines.slice(0, 5).join("\n");
      setFormData((prev) => ({ ...prev, zona: truncated }));
    } else {
      setFormData((prev) => ({ ...prev, zona: e.target.value }));
    }
  };

  // Función para manejar campos personalizados
  const toggleCustomNombre = useCallback(() => {
    setIsCustomNombre((prevState) => {
      // Si estamos activando el modo personalizado, limpiar el campo
      if (!prevState) {
        setFormData((prev) => ({ ...prev, nombre_transporte: "" }));
      }
      return !prevState;
    });
  }, []);

  return (
    <form onSubmit={handleSubmit} className="transporte-form habitacion-form">
      <SelectField
        id="nombre_transporte"
        name="nombre_transporte"
        label="Nombre del Transporte"
        options={nombresUnicos.map((nombre) => ({
          value: nombre,
          label: nombre,
        }))}
        value={formData.nombre_transporte}
        onChange={handleChange}
        required={true}
        allowCustom={true}
        isCustomMode={isCustomNombre}
        onToggleCustom={toggleCustomNombre}
        customPlaceholder="Escriba un nombre de transporte nuevo"
        customLabel="Nuevo"
        showOtherOption={false}
        isLoading={isLoading}
        disabled={isSubmitting}
        error={errors.nombre_transporte}
      />

      <TextAreaField
        id="zona"
        name="zona"
        label="Zona de Operación"
        value={formData.zona}
        onChange={handleZonaInput}
        required={true}
        placeholder="Ingrese la zona o áreas de operación del transporte"
        hint="Ejemplo: Cusco, Valle Sagrado, Machu Picchu"
        rows={3}
        suggestions={zonasUnicas}
        onSelectSuggestion={(zona) =>
          setFormData((prev) => ({ ...prev, zona }))
        }
        maxSuggestions={5}
        suggestionLabel="Zonas sugeridas:"
        disabled={isSubmitting}
        error={errors.zona}
      />

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
          <small>Permite usar este proveedor al armar cotizaciones.</small>
        </span>
      </label>

      <div className="button-group">
        <button
          type="button"
          onClick={() => onSubmit(null)}
          disabled={isSubmitting}
        >
          Cancelar
        </button>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : transporte ? "Actualizar" : "Crear"}
        </button>
      </div>
    </form>
  );
};

export default TransporteForm;
