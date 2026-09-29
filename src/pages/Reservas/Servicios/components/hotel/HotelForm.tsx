import { useState, useEffect, useCallback } from "react";
import useAuditInfo from "../../hooks/useAuditInfo";
import { formatTime } from "../../utils/formatters";
import { CATEGORIAS_HOTEL, TIPOS_DESAYUNO } from "../../utils/constants";
import { fetchHoteles } from "../../services/api";
import {
  FormField,
  SelectField,
  TimeField,
  CheckboxField,
  TextAreaField,
} from "../../../../../components/common";
import "../../../../../components/common/FormComponents.scss";

const HotelForm = ({ hotel, onSubmit, isSubmitting }) => {
  const { userId } = useAuditInfo();

  const initialState = {
    nombre: "",
    direccion: "",
    ciudad: "",
    categoria: "",
    check_in: "13:00",
    check_out: "10:00",
    desayuno: false,
    tipo_desayuno: "",
    hora_inicio_desayuno: "",
    hora_fin_desayuno: "",
    telefono: "",
    correo: "",
    observacion: "",
    mostrar_en_servicepicker: true,
    created_by: userId,
  };

  const [formData, setFormData] = useState(initialState);
  const [errors, setErrors] = useState({});
  // Estados para controlar si los campos de hora están habilitados
  const [checkInEnabled, setCheckInEnabled] = useState(true);
  const [checkOutEnabled, setCheckOutEnabled] = useState(true);
  const [horaInicioDesayunoEnabled, setHoraInicioDesayunoEnabled] =
    useState(false);
  const [horaFinDesayunoEnabled, setHoraFinDesayunoEnabled] = useState(false);
  // Estados para campos personalizables
  const [isCustomCategoria, setIsCustomCategoria] = useState(false);
  const [isCustomTipoDesayuno, setIsCustomTipoDesayuno] = useState(false);
  // Estados para opciones únicas
  const [categoriasUnicas, setCategoriasUnicas] = useState([]);
  const [tiposDesayunoUnicos, setTiposDesayunoUnicos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Cargar categorías y tipos de desayuno únicos de hoteles existentes
  useEffect(() => {
    const cargarOpcionesUnicas = async () => {
      setIsLoading(true);
      try {
        const hoteles = await fetchHoteles();

        // Extraer categorías únicas que no estén en las constantes predefinidas
        const categorias = hoteles
          .map((h) => h.categoria)
          .filter((c) => c && c.trim() !== "")
          .filter(
            (c, index, self) =>
              self.indexOf(c) === index && !CATEGORIAS_HOTEL.includes(c),
          );

        // Extraer tipos de desayuno únicos que no estén en las constantes predefinidas
        const tiposDesayuno = hoteles
          .map((h) => h.tipo_desayuno)
          .filter((t) => t && t.trim() !== "")
          .filter(
            (t, index, self) =>
              self.indexOf(t) === index && !TIPOS_DESAYUNO.includes(t),
          );

        setCategoriasUnicas(categorias);
        setTiposDesayunoUnicos(tiposDesayuno);
      } catch (error) {
        console.error("Error al cargar opciones únicas:", error);
      } finally {
        setIsLoading(false);
      }
    };

    cargarOpcionesUnicas();
  }, []);

  useEffect(() => {
    if (hotel) {
      // Si estamos editando un hotel existente
      const newFormData = {
        ...initialState,
        ...hotel,
        // Formatear las horas correctamente si existen, si no dejar en blanco para inputs
        check_in: hotel.check_in ? formatTime(hotel.check_in) : "",
        check_out: hotel.check_out ? formatTime(hotel.check_out) : "",
        hora_inicio_desayuno: hotel.hora_inicio_desayuno
          ? formatTime(hotel.hora_inicio_desayuno)
          : "",
        hora_fin_desayuno: hotel.hora_fin_desayuno
          ? formatTime(hotel.hora_fin_desayuno)
          : "",
      };

      // Establecer el estado de los toggles según los valores existentes
      setCheckInEnabled(hotel.check_in !== null);
      setCheckOutEnabled(hotel.check_out !== null);
      setHoraInicioDesayunoEnabled(hotel.hora_inicio_desayuno !== null);
      setHoraFinDesayunoEnabled(hotel.hora_fin_desayuno !== null);

      // Verificar si la categoría es personalizada
      setIsCustomCategoria(
        hotel.categoria && !CATEGORIAS_HOTEL.includes(hotel.categoria),
      );

      // Verificar si el tipo de desayuno es personalizado
      setIsCustomTipoDesayuno(
        hotel.tipo_desayuno && !TIPOS_DESAYUNO.includes(hotel.tipo_desayuno),
      );

      setFormData(newFormData);
    }
  }, [hotel]);

  const validate = () => {
    const newErrors = {};

    if (!formData.nombre.trim()) {
      newErrors.nombre = "El nombre del hotel es obligatorio";
    }

    // Remove validation for direccion - allow it to be empty
    // We'll convert empty direccion to null in handleSubmit

    // Validación de correo electrónico (si está presente)
    if (formData.correo && formData.correo.trim() !== "") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.correo)) {
        newErrors.correo = "El formato del correo electrónico no es válido";
      }
    }

    // Validaciones para desayuno
    if (formData.desayuno) {
      if (!formData.tipo_desayuno?.trim()) {
        newErrors.tipo_desayuno = "Especifique el tipo de desayuno";
      }

      // Si una hora está habilitada y tiene valor, la otra también debe tener valor
      const tieneHoraInicio =
        horaInicioDesayunoEnabled &&
        formData.hora_inicio_desayuno &&
        formData.hora_inicio_desayuno !== "";
      const tieneHoraFin =
        horaFinDesayunoEnabled &&
        formData.hora_fin_desayuno &&
        formData.hora_fin_desayuno !== "";

      // Solo validar si al menos uno de los toggles está habilitado
      if (horaInicioDesayunoEnabled || horaFinDesayunoEnabled) {
        if (tieneHoraInicio && !tieneHoraFin && horaFinDesayunoEnabled) {
          newErrors.hora_desayuno =
            "Si especifica hora de inicio, debe especificar la hora de fin";
        }

        if (tieneHoraFin && !tieneHoraInicio && horaInicioDesayunoEnabled) {
          newErrors.hora_desayuno =
            "Si especifica hora de fin, debe especificar la hora de inicio";
        }

        // La hora de fin debe ser después de la hora de inicio (solo si ambas están habilitadas y tienen valores)
        if (tieneHoraInicio && tieneHoraFin) {
          if (formData.hora_inicio_desayuno >= formData.hora_fin_desayuno) {
            newErrors.hora_desayuno =
              "La hora de finalización debe ser posterior a la hora de inicio";
          }
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0; // Retornar true si no hay errores
  };

  const handleChange = useCallback(
    (e) => {
      const { name, value, type, checked } = e.target;

      // Manejar diferentes tipos de inputs
      const newValue = type === "checkbox" ? checked : value;

      // Actualizar estado
      setFormData((prev) => ({
        ...prev,
        [name]: newValue,
      }));

      // Si desmarcamos "desayuno", limpiar los campos relacionados
      if (name === "desayuno" && !checked) {
        setFormData((prev) => ({
          ...prev,
          tipo_desayuno: "",
          hora_inicio_desayuno: "",
          hora_fin_desayuno: "",
        }));
        // Resetear también los estados de los toggles de horas de desayuno
        setHoraInicioDesayunoEnabled(false);
        setHoraFinDesayunoEnabled(false);
      }

      // Si es el campo de categoría y se selecciona "Otro", activar campo personalizado
      if (name === "categoria" && value === "Otro") {
        setIsCustomCategoria(true);
        setFormData((prev) => ({ ...prev, categoria: "" }));
      }

      // Si es el campo de tipo de desayuno y se selecciona "Otro", activar campo personalizado
      if (name === "tipo_desayuno" && value === "Otro") {
        setIsCustomTipoDesayuno(true);
        setFormData((prev) => ({ ...prev, tipo_desayuno: "" }));
      }

      // Limpiar error cuando el usuario cambia el campo
      if (errors[name]) {
        setErrors((prev) => ({
          ...prev,
          [name]: undefined,
        }));
      }

      // Limpiar errores de horas de desayuno cuando se modifican campos relacionados
      if (name === "hora_inicio_desayuno" || name === "hora_fin_desayuno") {
        if (errors.hora_desayuno) {
          setErrors((prev) => ({
            ...prev,
            hora_desayuno: undefined,
          }));
        }
      }
    },
    [errors],
  );

  const handleSubmit = (e) => {
    e.preventDefault();

    if (validate()) {
      // Preparar datos para enviar al backend
      const dataToSubmit = {
        ...formData,
        // Convert empty direccion to null - add null check before using trim()
        direccion: formData.direccion
          ? formData.direccion.trim() === ""
            ? null
            : formData.direccion
          : null,
        // Convert empty telefono to null
        telefono: formData.telefono
          ? formData.telefono.trim() === ""
            ? null
            : formData.telefono
          : null,
        // Convert empty correo to null
        correo: formData.correo
          ? formData.correo.trim() === ""
            ? null
            : formData.correo
          : null,
      };

      // Si desayuno es false, establecer campos relacionados como null explícitamente
      if (!dataToSubmit.desayuno) {
        dataToSubmit.tipo_desayuno = null;
        dataToSubmit.hora_inicio_desayuno = null;
        dataToSubmit.hora_fin_desayuno = null;
      } else {
        // Si el desayuno está activado, manejar las horas según los toggles
        if (!horaInicioDesayunoEnabled) {
          dataToSubmit.hora_inicio_desayuno = null;
        } else if (
          !dataToSubmit.hora_inicio_desayuno ||
          (typeof dataToSubmit.hora_inicio_desayuno === "string" &&
            dataToSubmit.hora_inicio_desayuno.trim() === "")
        ) {
          // Si está habilitado pero vacío, usar valor por defecto
          dataToSubmit.hora_inicio_desayuno = "08:00";
        }

        if (!horaFinDesayunoEnabled) {
          dataToSubmit.hora_fin_desayuno = null;
        } else if (
          !dataToSubmit.hora_fin_desayuno ||
          (typeof dataToSubmit.hora_fin_desayuno === "string" &&
            dataToSubmit.hora_fin_desayuno.trim() === "")
        ) {
          // Si está habilitado pero vacío, usar valor por defecto
          dataToSubmit.hora_fin_desayuno = "10:00";
        }
      }

      // IMPROVED: Explicitly set check_in to null when disabled
      if (!checkInEnabled) {
        dataToSubmit.check_in = null;
      } else if (dataToSubmit.check_in === "") {
        // Si está habilitado pero vacío, usar valor por defecto
        dataToSubmit.check_in = initialState.check_in;
      }

      // IMPROVED: Explicitly set check_out to null when disabled
      if (!checkOutEnabled) {
        dataToSubmit.check_out = null;
      } else if (dataToSubmit.check_out === "") {
        // Si está habilitado pero vacío, usar valor por defecto
        dataToSubmit.check_out = initialState.check_out;
      }

      // Si estamos editando, asegurarse de no enviar created_by
      if (hotel) {
        const { created_by, ...finalData } = dataToSubmit;
        onSubmit(finalData);
      } else {
        onSubmit(dataToSubmit);
      }
    }
  };

  // Función para manejar el toggle de check-in
  const toggleCheckIn = () => {
    setCheckInEnabled(!checkInEnabled);

    if (!checkInEnabled) {
      // Si está pasando de deshabilitado a habilitado, establecer un valor por defecto
      setFormData((prev) => ({
        ...prev,
        check_in: initialState.check_in,
      }));
    }
  };

  // Función para manejar el toggle de check-out
  const toggleCheckOut = () => {
    setCheckOutEnabled(!checkOutEnabled);

    if (!checkOutEnabled) {
      // Si está pasando de deshabilitado a habilitado, establecer un valor por defecto
      setFormData((prev) => ({
        ...prev,
        check_out: initialState.check_out,
      }));
    }
  };

  // Función para manejar el toggle de hora inicio desayuno
  const toggleHoraInicioDesayuno = () => {
    setHoraInicioDesayunoEnabled(!horaInicioDesayunoEnabled);

    if (!horaInicioDesayunoEnabled) {
      // Si está pasando de deshabilitado a habilitado, establecer un valor por defecto
      setFormData((prev) => ({
        ...prev,
        hora_inicio_desayuno: "08:00",
      }));
    } else {
      // Si se deshabilita, limpiar el campo (string vacío para el input)
      setFormData((prev) => ({
        ...prev,
        hora_inicio_desayuno: "",
      }));
      // También limpiar cualquier error relacionado
      setErrors((prev) => ({
        ...prev,
        hora_desayuno: undefined,
      }));
    }
  };

  // Función para manejar el toggle de hora fin desayuno
  const toggleHoraFinDesayuno = () => {
    setHoraFinDesayunoEnabled(!horaFinDesayunoEnabled);

    if (!horaFinDesayunoEnabled) {
      // Si está pasando de deshabilitado a habilitado, establecer un valor por defecto
      setFormData((prev) => ({
        ...prev,
        hora_fin_desayuno: "10:00",
      }));
    } else {
      // Si se deshabilita, limpiar el campo (string vacío para el input)
      setFormData((prev) => ({
        ...prev,
        hora_fin_desayuno: "",
      }));
      // También limpiar cualquier error relacionado
      setErrors((prev) => ({
        ...prev,
        hora_desayuno: undefined,
      }));
    }
  };

  // Funciones para manejar campos personalizados
  const toggleCustomCategoria = useCallback(() => {
    setIsCustomCategoria((prevState) => {
      // Si estamos activando el modo personalizado, limpiar el campo
      if (!prevState) {
        setFormData((prev) => ({ ...prev, categoria: "" }));
      }
      return !prevState;
    });
  }, []);

  const toggleCustomTipoDesayuno = useCallback(() => {
    setIsCustomTipoDesayuno((prevState) => {
      // Si estamos activando el modo personalizado, limpiar el campo
      if (!prevState) {
        setFormData((prev) => ({ ...prev, tipo_desayuno: "" }));
      }
      return !prevState;
    });
  }, []);

  // Combinar categorías predefinidas con las únicas encontradas en la base de datos
  const todasLasCategorias = [
    { value: "", label: "Seleccione una categoría" },
    ...CATEGORIAS_HOTEL.map((cat) => ({ value: cat, label: cat })),
    ...categoriasUnicas.map((cat) => ({ value: cat, label: cat })),
  ];

  // Combinar tipos de desayuno predefinidos con los únicos encontrados en la base de datos
  const todosLosTiposDesayuno = [
    { value: "", label: "Seleccione tipo de desayuno" },
    ...TIPOS_DESAYUNO.map((tipo) => ({ value: tipo, label: tipo })),
    ...tiposDesayunoUnicos.map((tipo) => ({ value: tipo, label: tipo })),
  ];

  return (
    <form onSubmit={handleSubmit} className="form-container hotel-form">
      <div className="form-group">
        <label htmlFor="nombre">Nombre del Hotel *</label>
        <input
          type="text"
          id="nombre"
          name="nombre"
          value={formData.nombre}
          onChange={handleChange}
          className={`form-control ${errors.nombre ? "error" : ""}`}
          autoComplete="off"
          placeholder="Ingrese nombre del hotel"
        />
        {errors.nombre && <div className="error-message">{errors.nombre}</div>}
      </div>

      <div className="form-group">
        <label htmlFor="direccion">Dirección</label>
        <input
          type="text"
          id="direccion"
          name="direccion"
          value={formData.direccion}
          onChange={handleChange}
          className={`form-control ${errors.direccion ? "error" : ""}`}
          autoComplete="off"
          placeholder="Ingrese dirección del hotel (opcional)"
        />
        {errors.direccion && (
          <div className="error-message">{errors.direccion}</div>
        )}
        <small className="form-text text-muted">
          Si se deja vacío, se guardará como no especificado
        </small>
      </div>

      <div className="form-group">
        <label htmlFor="ciudad">Ciudad</label>
        <input
          type="text"
          id="ciudad"
          name="ciudad"
          value={formData.ciudad || ""}
          onChange={handleChange}
          className="form-control"
          autoComplete="off"
          placeholder="Ingrese ciudad del hotel"
        />
      </div>

      <SelectField
        id="categoria"
        name="categoria"
        label="Categoría"
        options={todasLasCategorias}
        value={formData.categoria}
        onChange={handleChange}
        allowCustom={true}
        isCustomMode={isCustomCategoria}
        onToggleCustom={toggleCustomCategoria}
        customPlaceholder="Escriba una categoría personalizada"
        isLoading={isLoading}
        disabled={isSubmitting}
        error={errors.categoria}
      />

      <div className="form-group">
        <label>Horarios de check-in/check-out</label>
        <div className="form-row">
          <div className="form-group half">
            <TimeField
              id="check_in"
              name="check_in"
              label="Check-in"
              value={formData.check_in}
              onChange={handleChange}
              isEnabled={checkInEnabled}
              onToggle={toggleCheckIn}
              error={errors.check_in}
            />
          </div>

          <div className="form-group half">
            <TimeField
              id="check_out"
              name="check_out"
              label="Check-out"
              value={formData.check_out}
              onChange={handleChange}
              isEnabled={checkOutEnabled}
              onToggle={toggleCheckOut}
              error={errors.check_out}
            />
          </div>
        </div>
      </div>

      <CheckboxField
        id="desayuno"
        name="desayuno"
        label="Incluye desayuno"
        checked={formData.desayuno}
        onChange={handleChange}
      />

      {formData.desayuno && (
        <>
          <SelectField
            id="tipo_desayuno"
            name="tipo_desayuno"
            label="Tipo de desayuno"
            options={todosLosTiposDesayuno}
            value={formData.tipo_desayuno}
            onChange={handleChange}
            required={true}
            allowCustom={true}
            isCustomMode={isCustomTipoDesayuno}
            onToggleCustom={toggleCustomTipoDesayuno}
            customPlaceholder="Escriba un tipo de desayuno personalizado"
            isLoading={isLoading}
            disabled={isSubmitting}
            error={errors.tipo_desayuno}
          />

          <div className="form-group">
            <label>Horarios de desayuno</label>
            <div className="form-row">
              <div className="form-group half">
                <TimeField
                  id="hora_inicio_desayuno"
                  name="hora_inicio_desayuno"
                  label="Horario desde"
                  value={formData.hora_inicio_desayuno}
                  onChange={handleChange}
                  isEnabled={horaInicioDesayunoEnabled}
                  onToggle={toggleHoraInicioDesayuno}
                  error={errors.hora_desayuno}
                />
              </div>

              <div className="form-group half">
                <TimeField
                  id="hora_fin_desayuno"
                  name="hora_fin_desayuno"
                  label="Horario hasta"
                  value={formData.hora_fin_desayuno}
                  onChange={handleChange}
                  isEnabled={horaFinDesayunoEnabled}
                  onToggle={toggleHoraFinDesayuno}
                  error={errors.hora_desayuno}
                />
              </div>
            </div>
            {errors.hora_desayuno && (
              <div className="error-message">{errors.hora_desayuno}</div>
            )}
          </div>
        </>
      )}

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

      <TextAreaField
        id="observacion"
        name="observacion"
        label="Observaciones"
        value={formData.observacion}
        onChange={handleChange}
        placeholder="Ingrese observaciones adicionales"
        rows={3}
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
          <small>Permite usar este hotel al armar cotizaciones.</small>
        </span>
      </label>

      <div className="button-group">
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : hotel ? "Actualizar" : "Guardar"}
        </button>
      </div>
    </form>
  );
};

export default HotelForm;
