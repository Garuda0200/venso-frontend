import React, { useState, useEffect, useCallback } from "react";
import useAuditInfo from "../../hooks/useAuditInfo";
import {
  FaEdit,
  FaInfo,
  FaTimes,
  FaPlus,
  FaCheck,
  FaExclamationTriangle,
} from "react-icons/fa";
import { fetchTickets } from "../../services/api";
import FormField from "../../../../../components/common/FormField";
import {
  ESTADOS_SERVICIO,
  PROCEDENCIAS_TICKET,
  TIPOS_USUARIO_TICKET,
} from "../../utils/constants";

const TicketForm = ({ ticket, onSubmit, isSubmitting }) => {
  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  const initialState = {
    entrada: "",
    procedencia: "",
    tipo_usuario: "",
    edad_estudiante_min: null,
    edad_estudiante_max: null,
    estado: "disponible",
    telefono: "",
    correo: "",
    mostrar_en_servicepicker: true,
    created_by: userId, // Establecer por defecto
  };

  // Initialize form data from ticket prop or default
  const [formData, setFormData] = useState(
    ticket ? { ...initialState, ...ticket } : initialState,
  );
  const [errors, setErrors] = useState({});
  const [isCustomEntrada, setIsCustomEntrada] = useState(false);
  const [entradasUnicas, setEntradasUnicas] = useState([]);
  const [existingTickets, setExistingTickets] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mostrarEdades, setMostrarEdades] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [isVariantCreation, setIsVariantCreation] = useState(
    ticket?.isVariantCreation || false,
  );

  // Estado para combinaciones disponibles de procedencia y tipo_usuario para la entrada seleccionada
  const [availableCombinations, setAvailableCombinations] = useState({
    procedencias: PROCEDENCIAS_TICKET,
    tipos_usuario: TIPOS_USUARIO_TICKET,
  });

  // Add state for tracking existing student age ranges
  const [existingStudentAgeRange, setExistingStudentAgeRange] = useState(null);

  // Cargar entradas únicas y todos los tickets existentes
  useEffect(() => {
    const cargarDatos = async () => {
      setIsLoading(true);
      try {
        // Obtener tickets existentes
        const tickets = await fetchTickets();
        setExistingTickets(tickets);

        // Extraer entradas únicas
        const entradas = tickets
          .map((t) => t.entrada)
          .filter((e) => e && e.trim() !== "")
          .filter((e, index, self) => self.indexOf(e) === index)
          .sort();

        setEntradasUnicas(entradas);
      } catch (error) {
        console.error("Error al cargar tickets:", error);
      } finally {
        setIsLoading(false);
      }
    };

    cargarDatos();
  }, []);

  // Actualizar formData cuando se recibe un ticket
  useEffect(() => {
    if (ticket) {
      // Keep track of existing student age range if provided
      if (ticket.existingStudentAgeRange) {
        setExistingStudentAgeRange(ticket.existingStudentAgeRange);
      }

      // First set the form data with all ticket properties
      setFormData({
        entrada: ticket.entrada || "",
        procedencia: ticket.procedencia || "",
        tipo_usuario: ticket.tipo_usuario || "",
        edad_estudiante_min: ticket.edad_estudiante_min || null,
        edad_estudiante_max: ticket.edad_estudiante_max || null,
        estado: ticket.estado || "disponible",
        mostrar_en_servicepicker: ticket.mostrar_en_servicepicker !== false,
        created_by: userId,
        ...ticket,
      });

      // Set variant creation mode if flag is present
      if (ticket.isVariantCreation) {
        setIsVariantCreation(true);
        setIsCustomEntrada(false);
      } else {
        setIsVariantCreation(false);
      }

      // Determinar si mostrar campos de edad
      setMostrarEdades(ticket.tipo_usuario?.toLowerCase() === "estudiante");
    } else {
      // Handle brand new ticket case (ticket is null)
      setFormData(initialState);
      setIsVariantCreation(false);
      setIsCustomEntrada(false);
      setMostrarEdades(false);
      setExistingStudentAgeRange(null);
    }
  }, [ticket, userId]);

  // Check if custom entrada flag needed (separate to avoid resetting formData)
  useEffect(() => {
    if (
      ticket &&
      !ticket.isVariantCreation &&
      ticket.entrada &&
      entradasUnicas.length > 0
    ) {
      if (!entradasUnicas.includes(ticket.entrada)) {
        setIsCustomEntrada(true);
      }
    }
  }, [ticket, entradasUnicas]);

  // Force re-render of form fields to ensure proper binding
  useEffect(() => {}, [formData]);

  // Actualizar combinaciones disponibles cuando se selecciona una entrada
  useEffect(() => {
    if (!formData.entrada || isCustomEntrada) {
      // Si es una entrada nueva o personalizada, todas las combinaciones están disponibles
      setAvailableCombinations({
        procedencias: PROCEDENCIAS_TICKET,
        tipos_usuario: TIPOS_USUARIO_TICKET,
      });
      return;
    }

    // Filtered tickets with same entrada
    const ticketsWithSameEntrada = existingTickets.filter(
      (t) => t.entrada.toLowerCase() === formData.entrada.toLowerCase(),
    );

    // Processing used combinations map
    const usedCombinationsMap = {};
    ticketsWithSameEntrada.forEach((t) => {
      if (ticket && t.id_ticket === ticket.id_ticket) return;

      if (!usedCombinationsMap[t.procedencia]) {
        usedCombinationsMap[t.procedencia] = new Set();
      }
      usedCombinationsMap[t.procedencia].add(t.tipo_usuario);
    });

    // Convert to expected format
    const usedCombinations = Object.entries(usedCombinationsMap).flatMap(
      ([proc, tiposSet]) =>
        Array.from(tiposSet).map((tipo) => ({
          procedencia: proc,
          tipo_usuario: tipo,
          id_ticket: ticketsWithSameEntrada.find(
            (t) => t.procedencia === proc && t.tipo_usuario === tipo,
          )?.id_ticket,
        })),
    );

    // Calculate available options
    const availableProcedencias = PROCEDENCIAS_TICKET.map((proc) => {
      const tiposUsadosForProc = usedCombinationsMap[proc] || new Set();
      const isComplete = tiposUsadosForProc.size >= TIPOS_USUARIO_TICKET.length;

      return {
        value: proc,
        label: proc.charAt(0).toUpperCase() + proc.slice(1),
        isComplete,
        usedTipos: Array.from(tiposUsadosForProc),
      };
    });

    setAvailableCombinations({
      procedencias: availableProcedencias,
      tipos_usuario: TIPOS_USUARIO_TICKET,
      usedCombinations,
    });
  }, [formData.entrada, existingTickets, isCustomEntrada, ticket]);

  // Verificar si la combinación actual ya existe
  useEffect(() => {
    if (!formData.entrada || !formData.procedencia || !formData.tipo_usuario) {
      setDuplicateWarning(null);
      return;
    }

    // Buscar si existe la combinación actual
    const matchingTicket = existingTickets.find(
      (t) =>
        t.entrada.toLowerCase() === formData.entrada.toLowerCase() &&
        t.procedencia === formData.procedencia &&
        t.tipo_usuario === formData.tipo_usuario &&
        // Excluir el ticket actual si estamos editando
        (!ticket || t.id_ticket !== ticket.id_ticket),
    );

    if (matchingTicket) {
      setDuplicateWarning(
        `Ya existe un ticket para "${formData.entrada}" con procedencia "${formData.procedencia}" y tipo de usuario "${formData.tipo_usuario}".`,
      );
    } else {
      setDuplicateWarning(null);
    }
  }, [
    formData.entrada,
    formData.procedencia,
    formData.tipo_usuario,
    existingTickets,
    ticket,
  ]);

  const validate = () => {
    const newErrors = {};

    if (!formData.entrada?.trim()) {
      newErrors.entrada = "El nombre de la entrada es obligatorio";
    } else if (formData.entrada.trim().length < 3) {
      newErrors.entrada =
        "El nombre de la entrada debe tener al menos 3 caracteres";
    }

    if (!formData.procedencia?.trim()) {
      newErrors.procedencia = "La procedencia es obligatoria";
    }

    if (!formData.tipo_usuario?.trim()) {
      newErrors.tipo_usuario = "El tipo de usuario es obligatorio";
    }

    // Validar combinación única
    if (duplicateWarning) {
      newErrors.combinacion = duplicateWarning;
    }

    // Validar rango de edades si es estudiante
    if (formData.tipo_usuario === "estudiante") {
      if (
        formData.edad_estudiante_min === null ||
        formData.edad_estudiante_min === ""
      ) {
        newErrors.edad_estudiante_min =
          "La edad mínima es obligatoria para estudiantes";
      }

      if (
        formData.edad_estudiante_max === null ||
        formData.edad_estudiante_max === ""
      ) {
        newErrors.edad_estudiante_max =
          "La edad máxima es obligatoria para estudiantes";
      }

      if (
        formData.edad_estudiante_min !== null &&
        formData.edad_estudiante_max !== null &&
        parseInt(formData.edad_estudiante_min) >
          parseInt(formData.edad_estudiante_max)
      ) {
        newErrors.edad_estudiante_min =
          "La edad mínima no puede ser mayor que la edad máxima";
      }
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

  // Improved handleChange to more explicitly handle select elements
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (name === "entrada") {
      if (value === "Otro") {
        setIsCustomEntrada(true);
        setFormData((prev) => ({
          ...prev,
          entrada: "",
          procedencia: "",
          tipo_usuario: "",
        }));
      } else {
        setFormData((prev) => ({
          ...prev,
          [name]: value,
          procedencia: "",
          tipo_usuario: "",
        }));
      }
    } else if (name === "procedencia") {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
        tipo_usuario: "",
      }));
    } else if (name === "tipo_usuario") {
      const esEstudiante = value === "estudiante";
      setMostrarEdades(esEstudiante);

      // If switching to estudiante and we have existing age ranges for this entrada
      if (esEstudiante && existingStudentAgeRange) {
        setFormData((prev) => ({
          ...prev,
          [name]: value,
          edad_estudiante_min: existingStudentAgeRange.min,
          edad_estudiante_max: existingStudentAgeRange.max,
        }));
      } else if (!esEstudiante) {
        // Resetear valores de edad si no es estudiante
        setFormData((prev) => ({
          ...prev,
          [name]: value,
          edad_estudiante_min: null,
          edad_estudiante_max: null,
        }));
      } else {
        setFormData((prev) => ({
          ...prev,
          [name]: value,
        }));
      }
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      }));
    }
  };

  const toggleCustomEntrada = useCallback(() => {
    setIsCustomEntrada((prevState) => {
      if (!prevState) {
        setFormData((prev) => ({ ...prev, entrada: "" }));
      }
      return !prevState;
    });
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (validate()) {
      const formDataWithAudit = {
        ...formData,
        created_by: userId,
        updated_by: userId,
        edad_estudiante_min: formData.edad_estudiante_min
          ? parseInt(formData.edad_estudiante_min)
          : null,
        edad_estudiante_max: formData.edad_estudiante_max
          ? parseInt(formData.edad_estudiante_max)
          : null,
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

      onSubmit(formDataWithAudit);
    }
  };

  const handleQuickAdd = () => {
    const entradaActual = formData.entrada;

    setFormData({
      ...initialState,
      entrada: entradaActual,
    });

    setErrors({});
    setMostrarEdades(false);
    setDuplicateWarning(null);
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
    <form onSubmit={handleSubmit} className="ticket-form habitacion-form">
      {/* Sección de entrada */}
      <div className="form-group">
        <div className="custom-field-container">
          <label htmlFor="entrada">Nombre de Entrada *</label>
          {!isVariantCreation && (
            <button
              type="button"
              className="custom-option-btn"
              onClick={toggleCustomEntrada}
              disabled={isSubmitting}
              title={
                isCustomEntrada
                  ? "Cancelar entrada personalizada"
                  : "Agregar entrada personalizada"
              }
            >
              {isCustomEntrada ? <FaTimes /> : <FaEdit />}
              <span className="btn-text">
                {isCustomEntrada ? "Cancelar" : "Personalizar"}
              </span>
            </button>
          )}
        </div>

        {isVariantCreation ? (
          <div className="variant-input-container">
            <input
              type="text"
              id="entrada_variant"
              name="entrada"
              value={formData.entrada || ""}
              className="variant-field"
              readOnly
            />
            <small className="form-text text-muted">
              <FaInfo style={{ marginRight: 5 }} /> Creando una variante para
              esta entrada
            </small>
          </div>
        ) : isCustomEntrada ? (
          <div className="custom-input-container">
            <input
              type="text"
              id="entrada_custom"
              name="entrada"
              value={formData.entrada || ""}
              onChange={handleChange}
              className={`custom-field ${errors.entrada ? "error" : ""}`}
              disabled={isSubmitting}
              placeholder="Escriba un nombre de entrada personalizado"
              maxLength={255}
              autoFocus
            />
          </div>
        ) : (
          <select
            id="entrada"
            name="entrada"
            value={formData.entrada || ""}
            onChange={handleChange}
            className={errors.entrada ? "form-control error" : "form-control"}
            disabled={isSubmitting || isLoading || isVariantCreation}
          >
            <option value="">Seleccione una entrada...</option>
            {entradasUnicas.map((entrada, index) => (
              <option key={index} value={entrada}>
                {entrada}
              </option>
            ))}
            <option value="Otro">Otro...</option>
          </select>
        )}
        {errors.entrada && (
          <div className="error-message">{errors.entrada}</div>
        )}
        {isLoading && (
          <small className="text-muted">Cargando opciones...</small>
        )}

        {/* Quick Add Button */}
        {formData.entrada && !isCustomEntrada && !isVariantCreation && (
          <div className="quick-add-container">
            <button
              type="button"
              className="quick-add-btn"
              onClick={handleQuickAdd}
              disabled={isSubmitting}
              title="Agregar otro registro para esta entrada"
            >
              <FaPlus /> Añadir variante para esta entrada
            </button>
            <small className="form-text text-muted">
              Crea un nuevo ticket para la misma entrada con diferentes
              características
            </small>
          </div>
        )}
      </div>

      {/* Sección de procedencia */}
      <div className="form-group">
        <label htmlFor="procedencia">Procedencia *</label>
        <select
          id="procedencia"
          name="procedencia"
          value={formData.procedencia || ""}
          onChange={handleChange}
          className={errors.procedencia ? "form-control error" : "form-control"}
          disabled={isSubmitting || !formData.entrada}
        >
          <option value="">Seleccione una procedencia...</option>
          {availableCombinations.procedencias.map((proc, index) =>
            typeof proc === "object" ? (
              <option
                key={index}
                value={proc.value}
                disabled={
                  proc.isComplete && formData.procedencia !== proc.value
                }
              >
                {proc.label} {proc.isComplete ? "(Completo)" : ""}
              </option>
            ) : (
              <option key={index} value={proc}>
                {proc.charAt(0).toUpperCase() + proc.slice(1)}
              </option>
            ),
          )}
        </select>
        {errors.procedencia && (
          <div className="error-message">{errors.procedencia}</div>
        )}
        {!formData.entrada && (
          <small className="form-text text-muted">
            Primero seleccione una entrada
          </small>
        )}
      </div>

      {/* Sección de tipo de usuario */}
      <div className="form-group">
        <label htmlFor="tipo_usuario">Tipo de Usuario *</label>
        <select
          id="tipo_usuario"
          name="tipo_usuario"
          value={formData.tipo_usuario || ""}
          onChange={handleChange}
          className={
            errors.tipo_usuario ? "form-control error" : "form-control"
          }
          disabled={isSubmitting || !formData.procedencia}
        >
          <option value="">Seleccione un tipo de usuario...</option>
          {TIPOS_USUARIO_TICKET.map((tipo, index) => {
            const isUsed =
              formData.procedencia &&
              availableCombinations.usedCombinations?.some(
                (c) =>
                  c.procedencia === formData.procedencia &&
                  c.tipo_usuario === tipo,
              );

            return (
              <option
                key={index}
                value={tipo}
                disabled={isUsed && formData.tipo_usuario !== tipo}
              >
                {tipo.charAt(0).toUpperCase() + tipo.slice(1)}
                {isUsed ? " (En uso)" : ""}
              </option>
            );
          })}
        </select>
        {errors.tipo_usuario && (
          <div className="error-message">{errors.tipo_usuario}</div>
        )}
        {!formData.procedencia && (
          <small className="form-text text-muted">
            Primero seleccione una procedencia
          </small>
        )}
      </div>

      {/* Advertencia de duplicación */}
      {duplicateWarning && (
        <div className="duplicate-warning">
          <FaExclamationTriangle className="warning-icon" />
          <span>{duplicateWarning}</span>
        </div>
      )}
      {errors.combinacion && (
        <div className="error-message">{errors.combinacion}</div>
      )}

      {/* Campos de edad para estudiantes */}
      {mostrarEdades && (
        <div className="form-row">
          <div className="form-group half">
            <label htmlFor="edad_estudiante_min">
              Edad Mínima *
              {existingStudentAgeRange && (
                <small className="hint-text"> (Usando valor existente)</small>
              )}
            </label>
            <input
              type="number"
              id="edad_estudiante_min"
              name="edad_estudiante_min"
              value={formData.edad_estudiante_min || ""}
              onChange={handleChange}
              className={errors.edad_estudiante_min ? "error" : ""}
              disabled={isSubmitting || existingStudentAgeRange !== null}
              min="0"
              max="100"
              required
              onWheel={preventWheelChange}
              onKeyDown={preventArrowChange}
            />
            {errors.edad_estudiante_min && (
              <div className="error-message">{errors.edad_estudiante_min}</div>
            )}
            {existingStudentAgeRange && (
              <small className="form-text text-muted">
                Este valor se mantiene consistente para todas las variantes de
                esta entrada.
              </small>
            )}
          </div>

          <div className="form-group half">
            <label htmlFor="edad_estudiante_max">
              Edad Máxima *
              {existingStudentAgeRange && (
                <small className="hint-text"> (Usando valor existente)</small>
              )}
            </label>
            <input
              type="number"
              id="edad_estudiante_max"
              name="edad_estudiante_max"
              value={formData.edad_estudiante_max || ""}
              onChange={handleChange}
              className={errors.edad_estudiante_max ? "error" : ""}
              disabled={isSubmitting || existingStudentAgeRange !== null}
              min="0"
              max="100"
              required
              onWheel={preventWheelChange}
              onKeyDown={preventArrowChange}
            />
            {errors.edad_estudiante_max && (
              <div className="error-message">{errors.edad_estudiante_max}</div>
            )}
          </div>
        </div>
      )}

      {/* Sección de combinaciones disponibles/usadas para la entrada seleccionada */}
      {formData.entrada &&
        availableCombinations.usedCombinations &&
        availableCombinations.usedCombinations.length > 0 && (
          <div className="combinations-info">
            <h4>Combinaciones ya registradas para "{formData.entrada}":</h4>
            <div className="combinations-list">
              {availableCombinations.usedCombinations.map((combo, index) => (
                <div key={index} className="combination-item">
                  <FaCheck className="check-icon" />
                  <span className="badge primary">{combo.procedencia}</span>
                  <span>+</span>
                  <span className="badge info">{combo.tipo_usuario}</span>
                </div>
              ))}
            </div>
          </div>
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

      <div className="switch-container">
        <label className="switch">
          <input
            type="checkbox"
            id="mostrar_en_servicepicker"
            name="mostrar_en_servicepicker"
            checked={formData.mostrar_en_servicepicker !== false}
            onChange={handleChange}
            disabled={isSubmitting}
          />
          <span className="slider round"></span>
        </label>
        <div className="switch-label-text">
          <span>Mostrar en ServicePicker</span>
          <span className="switch-label-desc">
            Si está desactivado, ventas no podrá seleccionar este ticket en cotizaciones.
          </span>
        </div>
      </div>

      {/* Botones */}
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
          disabled={isSubmitting || duplicateWarning !== null}
        >
          {ticket ? "Actualizar" : "Crear"} Ticket
        </button>
      </div>
    </form>
  );
};

export default TicketForm;
