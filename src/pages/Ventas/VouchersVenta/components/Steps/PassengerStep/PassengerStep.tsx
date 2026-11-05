import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  MdPerson,
  MdChildCare,
  MdWarning,
  MdCheck,
  MdEdit,
} from "react-icons/md";
import { getCountryNames } from "../../../../../../utils/countries";
import {
  normalizePassengerInput,
} from "../../passengerDraft";
import "./PassengerStep.scss";
import { ageFromBirthDate, procedenciaFromCountry } from '../../passengerIdentityDerived';

// Lista de países obtenida del archivo de utilidades
const COUNTRIES = getCountryNames();

const PROCEDENCIA_OPTIONS = ["Extranjero", "Nacional"];

const DOCUMENT_OPTIONS = {
  adults: ["Pasaporte", "DNI", "CE", "Otro"],
  children: ["Pasaporte", "DNI", "Partida de Nacimiento", "Otro"],
};
const DOCUMENT_LABELS = { passport: "Pasaporte", national_id: "DNI", foreign_resident: "CE", birth_certificate: "Partida de Nacimiento", other: "Otro" };

const joinNames = (...parts) => parts.filter(Boolean).join(" ").trim();

const PassengerStep = ({
  passengerData,
  onPassengerDataChange,
  disabled = false,
}: any) => {
  // Memoize initial data to avoid unnecessary recalculations
  const initialData = useMemo(() => normalizePassengerInput(passengerData), [passengerData]);

  // Use memoized state to avoid renders from parent state changes
  const [localPassengerData, setLocalPassengerData] = useState(initialData);
  const [peopleCount, setPeopleCount] = useState({
    adults: initialData.adults.length,
    children: initialData.children.length,
  });
  const [errors, setErrors] = useState({});
  const localPassengerDataRef = useRef(initialData);

  // Estado para pasajero seleccionado
  const [selectedPassenger, setSelectedPassenger] = useState(null);

  // VoucherModal is the single owner that loads the draft. This step only
  // renders and edits the data it receives; it must never fetch or synthesize
  // passengers from quote counters because that can overwrite foreign data.
  useEffect(() => {
    const normalized = normalizePassengerInput(passengerData);
    localPassengerDataRef.current = normalized;
    setLocalPassengerData(normalized);
    setPeopleCount({
      adults: normalized.adults.length,
      children: normalized.children.length,
    });
    setSelectedPassenger((current) => current && normalized[current.type][current.index]
      ? { ...current, data: normalized[current.type][current.index] }
      : null);
  }, [passengerData]);

  // Handle person data changes
  const handlePersonChange = useCallback(
    (type, index, field, value) => {
      {
        const previous = localPassengerDataRef.current;
        const newData = {
          adults: [...(previous.adults || [])],
          children: [...(previous.children || [])],
        };
        const nextPassenger = {
          ...newData[type][index],
          [field]: value,
        };

        if (field === "pais" || field === "nacionalidad") {
          nextPassenger.pais = value;
          nextPassenger.nacionalidad = value;
          nextPassenger.procedencia = procedenciaFromCountry(value);
        }

        if (field === "apellido_paterno" || field === "apellido_materno") {
          nextPassenger.apellidos = joinNames(
            field === "apellido_paterno"
              ? value
              : nextPassenger.apellido_paterno,
            field === "apellido_materno"
              ? value
              : nextPassenger.apellido_materno,
          );
        }

        if (field === "fecha_nacimiento") {
          nextPassenger.edad = ageFromBirthDate(value);
        }

        newData[type][index] = {
          ...nextPassenger,
        };

        // Update selectedPassenger if it's the one being edited
        if (
          selectedPassenger &&
          selectedPassenger.type === type &&
          selectedPassenger.index === index
        ) {
          setSelectedPassenger({
            ...selectedPassenger,
            data: newData[type][index],
          });
        }

        // Special validation for age
        if (field === "edad") {
          const age = parseInt(value, 10);
          const errorKey = `${type}_${index}_edad`;

          // Validate age range
          if (type === "adults" && (age < 18 || age > 120)) {
            setErrors((prevErrors) => ({
              ...prevErrors,
              [errorKey]:
                "La edad de los adultos debe estar entre 18 y 120 años",
            }));
          } else if (type === "children" && (age < 0 || age > 17)) {
            setErrors((prevErrors) => ({
              ...prevErrors,
              [errorKey]: "La edad de los niños debe estar entre 0 y 17 años",
            }));
          } else {
            setErrors((prevErrors) => {
              const newErrors = { ...prevErrors };
              delete newErrors[errorKey];
              return newErrors;
            });
          }
        }

        // Validate email format
        if (field === "correo") {
          const errorKey = `${type}_${index}_correo`;
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

          if (value && !emailRegex.test(value)) {
            setErrors((prevErrors) => ({
              ...prevErrors,
              [errorKey]: "Formato de correo inválido",
            }));
          } else {
            setErrors((prevErrors) => {
              const newErrors = { ...prevErrors };
              delete newErrors[errorKey];
              return newErrors;
            });
          }
        }

        localPassengerDataRef.current = newData;
        setLocalPassengerData(newData);
        setPeopleCount({
          adults: newData.adults.length,
          children: newData.children.length,
        });
        // Propagate the same event synchronously. Navigation can therefore not
        // observe a stale 300 ms-debounced draft.
        onPassengerDataChange(newData);
      }
    },
    [onPassengerDataChange, selectedPassenger],
  );

  // Compute render passenger data (handle empty arrays)
  const renderPassengerData = useMemo(() => {
    return {
      adults: localPassengerData.adults || [],
      children: localPassengerData.children || [],
    };
  }, [localPassengerData]);

  // Check if there are errors
  const hasErrors = Object.keys(errors).length > 0;

  // Add helper function to prevent wheel from changing input values
  const preventWheelChange = (e) => {
    e.target.blur();
    e.stopPropagation();
  };

  // Add helper function to prevent arrow keys from changing values
  const preventArrowChange = (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
    }
  };

  // Función para calcular si un pasajero tiene datos completos
  const isPassengerComplete = useCallback((passenger) => {
    return !!(
      passenger.nombres?.trim() &&
      (passenger.apellidos?.trim() || passenger.apellido_paterno?.trim()) &&
      passenger.edad &&
      (passenger.pais || passenger.nacionalidad) &&
      passenger.tipoDocumento &&
      passenger.numeroDocumento
    );
  }, []);

  // Inicializar pasajero seleccionado (primer adulto por defecto)
  useEffect(() => {
    if (!selectedPassenger && renderPassengerData.adults.length > 0) {
      setSelectedPassenger({
        type: "adults",
        index: 0,
        data: renderPassengerData.adults[0],
      });
    }
  }, [selectedPassenger, renderPassengerData.adults]);

  // Función para seleccionar pasajero
  const handleSelectPassenger = useCallback(
    (type, index) => {
      const passenger =
        type === "adults"
          ? renderPassengerData.adults[index]
          : renderPassengerData.children[index];
      setSelectedPassenger({
        type,
        index,
        data: passenger,
      });
    },
    [renderPassengerData],
  );

  return (
    <div className="passenger-step">
      <div className="passenger-panels">
        {/* Panel izquierdo: Lista de pasajeros */}
        <div className="passengers-list-panel">
          {/* Panel de contadores (solo lectura - pasajeros de la cotización) */}
          <div className="passenger-counters compact readonly">
            <div className="counter-card adult-counter">
              <div className="counter-icon">
                <MdPerson />
              </div>
              <div className="counter-info">
                <span className="counter-value">{peopleCount.adults}</span>
                <span className="counter-label">Adultos</span>
              </div>
            </div>

            {peopleCount.children > 0 && (
              <div className="counter-card child-counter">
                <div className="counter-icon">
                  <MdChildCare />
                </div>
                <div className="counter-info">
                  <span className="counter-value">{peopleCount.children}</span>
                  <span className="counter-label">Niños</span>
                </div>
              </div>
            )}
          </div>

          <h3>Lista de Pasajeros</h3>

          <div className="passengers-group">
            {/* Adultos */}
            {renderPassengerData.adults.length > 0 && (
              <>
                <div className="group-header">
                  <MdPerson />
                  <span>Adultos</span>
                </div>
                <div className="passenger-items">
                  {renderPassengerData.adults.map((adult, index) => {
                    const isComplete = isPassengerComplete(adult);
                    const isSelected =
                      selectedPassenger?.type === "adults" &&
                      selectedPassenger?.index === index;
                    const passengerLastName =
                      adult.apellidos ||
                      joinNames(adult.apellido_paterno, adult.apellido_materno);
                    const hasName = adult.nombres && passengerLastName;

                    return (
                      <div
                        key={adult.id}
                        className={`passenger-list-item adult ${isSelected ? "selected" : ""}`}
                        onClick={() => handleSelectPassenger("adults", index)}
                      >
                        <div className="passenger-icon">
                          <MdPerson />
                        </div>
                        <div className="passenger-info">
                          <div className="passenger-name">
                            {hasName
                              ? `${adult.nombres} ${passengerLastName}`
                              : `Adulto ${index + 1}`}
                          </div>
                          <div className="passenger-details">
                            {adult.tipoDocumento && adult.numeroDocumento ? (
                              <span className="doc-info">
                                {adult.tipoDocumento}: {adult.numeroDocumento}
                              </span>
                            ) : (
                              <span className="doc-missing">Sin documento</span>
                            )}
                            {adult.edad && (
                              <span className="age-info">
                                {adult.edad} años
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="passenger-status">
                          {isComplete ? (
                            <MdCheck className="status-icon complete" />
                          ) : (
                            <MdEdit className="status-icon pending" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Niños */}
            {renderPassengerData.children.length > 0 && (
              <>
                <div className="group-header child">
                  <MdChildCare />
                  <span>Niños</span>
                </div>
                <div className="passenger-items">
                  {renderPassengerData.children.map((child, index) => {
                    const isComplete = isPassengerComplete(child);
                    const isSelected =
                      selectedPassenger?.type === "children" &&
                      selectedPassenger?.index === index;
                    const passengerLastName =
                      child.apellidos ||
                      joinNames(child.apellido_paterno, child.apellido_materno);
                    const hasName = child.nombres && passengerLastName;

                    return (
                      <div
                        key={child.id}
                        className={`passenger-list-item child ${isSelected ? "selected" : ""}`}
                        onClick={() => handleSelectPassenger("children", index)}
                      >
                        <div className="passenger-icon">
                          <MdChildCare />
                        </div>
                        <div className="passenger-info">
                          <div className="passenger-name">
                            {hasName
                              ? `${child.nombres} ${passengerLastName}`
                              : `Niño ${index + 1}`}
                          </div>
                          <div className="passenger-details">
                            {child.tipoDocumento && child.numeroDocumento ? (
                              <span className="doc-info">
                                {child.tipoDocumento}: {child.numeroDocumento}
                              </span>
                            ) : (
                              <span className="doc-missing">Sin documento</span>
                            )}
                            {child.edad && (
                              <span className="age-info">
                                {child.edad} años
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="passenger-status">
                          {isComplete ? (
                            <MdCheck className="status-icon complete" />
                          ) : (
                            <MdEdit className="status-icon pending" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Panel derecho: Formulario del pasajero seleccionado */}
        <div className="passenger-form-panel">
          {selectedPassenger ? (
            <>
              <div className="passenger-form compact">
                <div className="form-row form-row--grid-3">
                  <div className="form-group">
                    <label>Procedencia</label>
                    <select disabled={disabled}
                      value={selectedPassenger.data.procedencia || ""}
                      onChange={(e) =>
                        handlePersonChange(
                          selectedPassenger.type,
                          selectedPassenger.index,
                          "procedencia",
                          e.target.value,
                        )
                      }
                    >
                      <option value="">Seleccione procedencia</option>
                      {selectedPassenger.data.procedencia && !PROCEDENCIA_OPTIONS.includes(selectedPassenger.data.procedencia) && (
                        <option value={selectedPassenger.data.procedencia}>{selectedPassenger.data.procedencia}</option>
                      )}
                      {PROCEDENCIA_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>País</label>
                    <select disabled={disabled}
                      value={selectedPassenger.data.nacionalidad || ""}
                      onChange={(e) =>
                        handlePersonChange(
                          selectedPassenger.type,
                          selectedPassenger.index,
                          "pais",
                          e.target.value,
                        )
                      }
                      className="country-select"
                    >
                      <option value="">Seleccione país</option>
                      {selectedPassenger.data.nacionalidad && !COUNTRIES.includes(selectedPassenger.data.nacionalidad) && (
                        <option value={selectedPassenger.data.nacionalidad}>{selectedPassenger.data.nacionalidad}</option>
                      )}
                      {COUNTRIES.map((country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Sexo</label>
                    <div className="radio-group">
                      {["", "Masculino", "Femenino"].map((option) => (
                        <label className="radio-option" key={option}>
                          <input disabled={disabled}
                            type="radio"
                            name={`sexo-${selectedPassenger.type}-${selectedPassenger.index}`}
                            checked={(selectedPassenger.data.sexo || "") === option}
                            onChange={() =>
                              handlePersonChange(
                                selectedPassenger.type,
                                selectedPassenger.index,
                                "sexo",
                                option,
                              )
                            }
                          />
                          <span>{option || "Sin especificar"}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Documento primero (más importante) */}
                <div className="form-row">
                  <div className="form-group">
                    <label>Tipo de documento</label>
                    <select disabled={disabled}
                      value={selectedPassenger.data.tipoDocumento || ""}
                      onChange={(e) =>
                        handlePersonChange(
                          selectedPassenger.type,
                          selectedPassenger.index,
                          "tipoDocumento",
                          e.target.value,
                        )
                      }
                    >
                      <option value="">Seleccione tipo de documento</option>
                      {selectedPassenger.data.tipoDocumento && !DOCUMENT_OPTIONS[selectedPassenger.type].includes(selectedPassenger.data.tipoDocumento) && (
                        <option value={selectedPassenger.data.tipoDocumento}>
                          {DOCUMENT_LABELS[selectedPassenger.data.tipoDocumento] || selectedPassenger.data.tipoDocumento}
                        </option>
                      )}
                      {DOCUMENT_OPTIONS[selectedPassenger.type].map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Número de documento</label>
                    <input disabled={disabled}
                      type="text"
                      value={selectedPassenger.data.numeroDocumento || ""}
                      onChange={(e) =>
                        handlePersonChange(
                          selectedPassenger.type,
                          selectedPassenger.index,
                          "numeroDocumento",
                          e.target.value,
                        )
                      }
                      placeholder="Número de documento"
                    />
                  </div>
                  <div className="form-group">
                    <label>Fecha de nacimiento</label>
                    <input disabled={disabled}
                      type="date"
                      value={
                        selectedPassenger.data.fecha_nacimiento ||
                        ""
                      }
                      onChange={(e) =>
                        handlePersonChange(
                          selectedPassenger.type,
                          selectedPassenger.index,
                          "fecha_nacimiento",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="passenger-document-expiry">Fecha de caducidad del documento <small>(opcional)</small></label>
                    <input disabled={disabled}
                      id="passenger-document-expiry"
                      type="date"
                      value={selectedPassenger.data.fecha_caducidad || ""}
                      onChange={(event) => handlePersonChange(
                        selectedPassenger.type, selectedPassenger.index,
                        "fecha_caducidad", event.target.value,
                      )}
                    />
                  </div>
                </div>

                {/* Nombres y apellidos */}
                <div className="form-row">
                  <div className="form-group">
                    <label>Nombres</label>
                    <input disabled={disabled}
                      type="text"
                      value={selectedPassenger.data.nombres || ""}
                      onChange={(e) =>
                        handlePersonChange(
                          selectedPassenger.type,
                          selectedPassenger.index,
                          "nombres",
                          e.target.value,
                        )
                      }
                      placeholder="Nombres"
                    />
                  </div>
                  <div className="form-group">
                    <label>Apellido paterno</label>
                    <input disabled={disabled}
                      type="text"
                      value={selectedPassenger.data.apellido_paterno || ""}
                      onChange={(e) =>
                        handlePersonChange(
                          selectedPassenger.type,
                          selectedPassenger.index,
                          "apellido_paterno",
                          e.target.value,
                        )
                      }
                      placeholder="Apellido paterno"
                    />
                  </div>
                  <div className="form-group">
                    <label>Apellido materno</label>
                    <input disabled={disabled}
                      type="text"
                      value={selectedPassenger.data.apellido_materno || ""}
                      onChange={(e) =>
                        handlePersonChange(
                          selectedPassenger.type,
                          selectedPassenger.index,
                          "apellido_materno",
                          e.target.value,
                        )
                      }
                      placeholder="Apellido materno"
                    />
                  </div>
                </div>

                {/* Edad y teléfonos */}
                <div className="form-row">
                  <div className="form-group small">
                    <label>Edad</label>
                    <input disabled={disabled}
                      type="number"
                      min={selectedPassenger.type === "adults" ? "18" : "0"}
                      max={selectedPassenger.type === "adults" ? "120" : "17"}
                      value={selectedPassenger.data.edad || ""}
                      readOnly={!!selectedPassenger.data.fecha_nacimiento}
                      title={selectedPassenger.data.fecha_nacimiento ? 'Calculada desde la fecha de nacimiento' : undefined}
                      onChange={(e) =>
                        handlePersonChange(
                          selectedPassenger.type,
                          selectedPassenger.index,
                          "edad",
                          e.target.value,
                        )
                      }
                      placeholder="Edad"
                      onWheel={preventWheelChange}
                      onKeyDown={preventArrowChange}
                      className={
                        errors[
                          `${selectedPassenger.type}_${selectedPassenger.index}_edad`
                        ]
                          ? "error"
                          : ""
                      }
                    />
                    {errors[
                      `${selectedPassenger.type}_${selectedPassenger.index}_edad`
                    ] && (
                      <div className="error-message">
                        {
                          errors[
                            `${selectedPassenger.type}_${selectedPassenger.index}_edad`
                          ]
                        }
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label>Teléfono de emergencia</label>
                    <input disabled={disabled}
                      type="tel"
                      value={selectedPassenger.data.telefono || ""}
                      onChange={(e) =>
                        handlePersonChange(
                          selectedPassenger.type,
                          selectedPassenger.index,
                          "telefono",
                          e.target.value,
                        )
                      }
                      placeholder="+51 999 999 999"
                    />
                  </div>
                </div>

                {/* Contacto solo para adultos */}
                {selectedPassenger.type === "adults" && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Correo</label>
                      <input disabled={disabled}
                        type="email"
                        value={selectedPassenger.data.correo || ""}
                        onChange={(e) =>
                          handlePersonChange(
                            selectedPassenger.type,
                            selectedPassenger.index,
                            "correo",
                            e.target.value,
                          )
                        }
                        placeholder="Email"
                        className={
                          errors[
                            `${selectedPassenger.type}_${selectedPassenger.index}_correo`
                          ]
                            ? "error"
                            : ""
                        }
                      />
                      {errors[
                        `${selectedPassenger.type}_${selectedPassenger.index}_correo`
                      ] && (
                        <div className="error-message">
                          {
                            errors[
                              `${selectedPassenger.type}_${selectedPassenger.index}_correo`
                            ]
                          }
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Observaciones compactas */}
                <div className="form-row">
                  <div className="form-group">
                    <label>Observaciones</label>
                    <textarea disabled={disabled}
                      value={selectedPassenger.data.observaciones || ""}
                      onChange={(e) =>
                        handlePersonChange(
                          selectedPassenger.type,
                          selectedPassenger.index,
                          "observaciones",
                          e.target.value,
                        )
                      }
                      placeholder="Alergias, restricciones, necesidades especiales..."
                      rows="2"
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="no-passenger-selected">
              <MdPerson className="placeholder-icon" />
              <p>
                Seleccione un pasajero de la lista para editar su información
              </p>
            </div>
          )}
        </div>
      </div>

      {hasErrors && (
        <div className="validation-errors">
          <MdWarning className="error-icon" />
          <p>
            Por favor, corrige los errores en el formulario antes de continuar.
          </p>
        </div>
      )}
    </div>
  );
};

// Wrap in React.memo to prevent unnecessary re-renders
export default React.memo(PassengerStep);
