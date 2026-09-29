import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  MdPerson,
  MdChildCare,
  MdWarning,
  MdCheck,
  MdEdit,
} from "react-icons/md";
import { v4 as uuidv4 } from "uuid";
import { getCountryNames } from "../../../../../../utils/countries";
import pasajeroService from "../../../../../../services/pasajeroService";
import "./PassengerStep.scss";

// Lista de países obtenida del archivo de utilidades
const COUNTRIES = getCountryNames();

const PROCEDENCIA_OPTIONS = ["Extranjero", "Nacional"];

const DOCUMENT_OPTIONS = {
  adults: ["Pasaporte", "DNI", "CE", "Otro"],
  children: ["Pasaporte", "DNI", "Partida de Nacimiento", "Otro"],
};

const joinNames = (...parts) => parts.filter(Boolean).join(" ").trim();

const calculateAgeFromBirthDate = (value) => {
  if (!value) return "";
  const birthDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return "";

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return String(Math.max(age, 0));
};

const splitLastNames = (value = "") => {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return {
    apellido_paterno: parts[0] || "",
    apellido_materno: parts.slice(1).join(" "),
  };
};

const normalizePassengerForForm = (p = {}, type = "adult") => {
  const split = splitLastNames(p.apellidos || p.lastName || "");
  const apellidoPaterno =
    p.apellido_paterno || p.apellidoPaterno || split.apellido_paterno || "";
  const apellidoMaterno =
    p.apellido_materno || p.apellidoMaterno || split.apellido_materno || "";
  const pais = p.pais || p.nacionalidad || p.nationality || "Perú";

  return {
    id: p.id_pasajero || p.id || uuidv4(),
    id_pasajero: p.id_pasajero,
    nombres: p.nombres || p.firstName || "",
    apellidos:
      p.apellidos || p.lastName || joinNames(apellidoPaterno, apellidoMaterno),
    apellido_paterno: apellidoPaterno,
    apellido_materno: apellidoMaterno,
    fecha_nacimiento: p.fecha_nacimiento || p.birthDate || "",
    edad: p.edad || p.age || (type === "child" ? "10" : "18"),
    procedencia: p.procedencia || "Extranjero",
    pais,
    nacionalidad: pais,
    sexo: p.sexo || "",
    correo: p.correo || p.email || "",
    telefono: p.telefono || p.phone || "",
    tipoDocumento:
      p.tipoDocumento ||
      p.tipo_documento ||
      p.docType ||
      (pais === "Perú" ? "DNI" : "Pasaporte"),
    numeroDocumento:
      p.numeroDocumento || p.numero_documento || p.docNumber || "",
    observaciones: p.observaciones || p.notes || "",
    passenger_key: p.passenger_key || "",
  };
};

const createBlankPassenger = (type = "adult", seed = {}) =>
  normalizePassengerForForm(
    {
      nombres: seed.nombres || "",
      apellidos: seed.apellidos || "",
      fecha_nacimiento: seed.fecha_nacimiento || "",
      edad: type === "child" ? "10" : "30",
      pais: seed.pais || seed.nacionalidad || "Perú",
      nacionalidad: seed.nacionalidad || seed.pais || "Perú",
      tipo_documento: seed.tipoDocumento || seed.tipo_documento || "DNI",
      numero_documento:
        seed.numeroDocumento || seed.numero_documento || "",
      correo: seed.correo || "",
      telefono: seed.telefono || "",
    },
    type,
  );

const PassengerStep = ({
  passengerData,
  onPassengerDataChange,
  cotizacionData,
  isEditMode = false,
  voucherId = null,
  voucherCode = null,
}) => {
  // Memoize initial data to avoid unnecessary recalculations
  const initialData = useMemo(() => {
    return {
      adults: passengerData?.adults?.length
        ? passengerData.adults.map((p) => normalizePassengerForForm(p, "adult"))
        : [],
      children: passengerData?.children?.length
        ? passengerData.children.map((p) => normalizePassengerForForm(p, "child"))
        : [],
    };
  }, [passengerData]);

  // Use memoized state to avoid renders from parent state changes
  const [localPassengerData, setLocalPassengerData] = useState(initialData);
  const [peopleCount, setPeopleCount] = useState({
    adults: initialData.adults.length || 1,
    children: initialData.children.length || 0,
  });
  const [errors, setErrors] = useState({});
  const [dataInitialized, setDataInitialized] = useState(false);
  const [inputDebounceTimers, setInputDebounceTimers] = useState({});

  // Estado para pasajero seleccionado
  const [selectedPassenger, setSelectedPassenger] = useState(null);

  // Synchronize local state with props when they change
  useEffect(() => {
    if (
      passengerData?.adults?.length > 0 ||
      passengerData?.children?.length > 0
    ) {
      setLocalPassengerData({
        adults: passengerData.adults.map((p) => normalizePassengerForForm(p, "adult")),
        children: (passengerData.children || []).map((p) =>
          normalizePassengerForForm(p, "child"),
        ),
      });
      setPeopleCount({
        adults: passengerData.adults.length,
        children: passengerData.children?.length || 0,
      });
    }
  }, [passengerData]);

  // Efecto mejorado para inicializar datos cuando se está editando
  useEffect(() => {
    // Inicialización prioritaria para modo edición
    if (isEditMode && passengerData?.adults?.length) {
      // En modo edición, usar datos del voucher como base, pero reconciliar
      // con los pasajeros actuales de la cotización para detectar nuevos
      const voucherAdults = [...passengerData.adults];
      const voucherChildren = [...(passengerData.children || [])];

      const reconcileWithCotizacion = async () => {
        if (!cotizacionData?.id) return;
        try {
          const cotPassengers = await pasajeroService.getPassengersByCotizacion(
            cotizacionData.id,
          );
          if (!cotPassengers || cotPassengers.length === 0) return;

          // Build set of existing voucher passenger keys for fast lookup
          const existingKeys = new Set();
          voucherAdults.forEach((p) => {
            if (p.id_pasajero) existingKeys.add(String(p.id_pasajero));
            if (p.passenger_key) existingKeys.add(p.passenger_key);
          });
          voucherChildren.forEach((p) => {
            if (p.id_pasajero) existingKeys.add(String(p.id_pasajero));
            if (p.passenger_key) existingKeys.add(p.passenger_key);
          });

          let added = false;
          cotPassengers.forEach((p) => {
            const pId = String(p.id_pasajero || "");
            const pKey = p.passenger_key || "";
            // Skip if already in voucher data
            if (
              (pId && existingKeys.has(pId)) ||
              (pKey && existingKeys.has(pKey))
            )
              return;

            const entry = normalizePassengerForForm(
              p,
              p.tipo_pasajero === "child" ? "child" : "adult",
            );
            if (p.tipo_pasajero === "child") {
              voucherChildren.push(entry);
            } else {
              voucherAdults.push(entry);
            }
            added = true;
          });

          if (added) {
            const merged = {
              adults: voucherAdults,
              children: voucherChildren,
            };
            setLocalPassengerData(merged);
            setPeopleCount({
              adults: merged.adults.length,
              children: merged.children.length,
            });
            onPassengerDataChange(merged);
          }
        } catch (err) {
          console.log("No se pudo reconciliar pasajeros con cotización:", err);
        }
      };

      setLocalPassengerData({
        adults: voucherAdults,
        children: voucherChildren,
      });
      setPeopleCount({
        adults: voucherAdults.length,
        children: voucherChildren.length,
      });
      setDataInitialized(true);

      // Async reconciliation after initial render
      reconcileWithCotizacion();
      return;
    }

    // La inicialización normal si no es modo edición
    if (!dataInitialized && cotizacionData) {
      // If we already have data from props, don't reinitialize
      if (localPassengerData.adults.length > 0) {
        setDataInitialized(true);
        return;
      }

      const newPassengerData = {
        adults: [],
        children: [],
      };

      // PASO 1: Fetch passengers from pasajero API (migrated from peopledetails)
      // This is async, so we use an IIFE
      const fetchAndInit = async () => {
        let fetched = false;
        if (cotizacionData.id) {
          try {
            const passengers = await pasajeroService.getPassengersByCotizacion(
              cotizacionData.id,
            );
            if (passengers && passengers.length > 0) {
              passengers.forEach((p) => {
                const entry = normalizePassengerForForm(
                  p,
                  p.tipo_pasajero === "child" ? "child" : "adult",
                );
                if (p.tipo_pasajero === "child") {
                  newPassengerData.children.push(entry);
                } else {
                  newPassengerData.adults.push(entry);
                }
              });
              fetched = true;
            }
          } catch (err) {
            console.log(
              "No passengers found via API, falling back to counts:",
              err,
            );
          }
        }
        return fetched;
      };

      fetchAndInit().then((fetched) => {
        if (fetched && newPassengerData.adults.length > 0) {
          setPeopleCount({
            adults: newPassengerData.adults.length,
            children: newPassengerData.children.length,
          });
          setLocalPassengerData(newPassengerData);
          onPassengerDataChange(newPassengerData);
          setDataInitialized(true);
          return;
        }

        // Fallback: build from counts if no passengers found in API
        if (cotizacionData.numAdultos || cotizacionData.numNinos) {
          const numAdults = parseInt(cotizacionData.numAdultos || 0, 10);
          const numChildren = parseInt(cotizacionData.numNinos || 0, 10);

          // Crear adultos
          for (let i = 0; i < numAdults; i++) {
            newPassengerData.adults.push({
              id: uuidv4(),
              nombres:
                i === 0 && cotizacionData.client
                  ? cotizacionData.client.nombres || ""
                  : "",
              apellidos:
                i === 0 && cotizacionData.client
                  ? cotizacionData.client.apellidos || ""
                  : "",
              edad: "30",
              nacionalidad: "Perú",
              correo:
                i === 0 && cotizacionData.client
                  ? cotizacionData.client.correo || ""
                  : "",
              telefono:
                i === 0 && cotizacionData.client
                  ? cotizacionData.client.telefono || ""
                  : "",
              tipoDocumento: "DNI",
              numeroDocumento:
                i === 0 && cotizacionData.client
                  ? cotizacionData.client.numeroDocumento || ""
                  : "",
            });
          }

          // Crear niños
          for (let i = 0; i < numChildren; i++) {
            newPassengerData.children.push({
              id: uuidv4(),
              nombres: "",
              apellidos: "",
              edad: "10",
              nacionalidad: "Perú",
              tipoDocumento: "DNI",
              numeroDocumento: "",
            });
          }
        }
        // PASO 3: INTENTAR DATOS DE cantidadAdultos/cantidadNinos
        else if (
          cotizacionData.cantidadAdultos !== undefined ||
          cotizacionData.cantidadNinos !== undefined
        ) {
          const numAdults = parseInt(cotizacionData.cantidadAdultos || 0, 10);
          const numChildren = parseInt(cotizacionData.cantidadNinos || 0, 10);

          // Crear adultos básicos
          for (let i = 0; i < numAdults; i++) {
            newPassengerData.adults.push({
              id: uuidv4(),
              nombres:
                i === 0 && cotizacionData.client
                  ? cotizacionData.client.nombres || ""
                  : "",
              apellidos:
                i === 0 && cotizacionData.client
                  ? cotizacionData.client.apellidos || ""
                  : "",
              edad: "30",
              nacionalidad: "Perú",
              correo:
                i === 0 && cotizacionData.client
                  ? cotizacionData.client.correo || ""
                  : "",
              telefono:
                i === 0 && cotizacionData.client
                  ? cotizacionData.client.telefono || ""
                  : "",
              tipoDocumento: "DNI",
              numeroDocumento:
                i === 0 && cotizacionData.client
                  ? cotizacionData.client.numeroDocumento || ""
                  : "",
            });
          }

          // Crear niños básicos
          for (let i = 0; i < numChildren; i++) {
            newPassengerData.children.push({
              id: uuidv4(),
              nombres: "",
              apellidos: "",
              edad: "10",
              nacionalidad: "Perú",
              tipoDocumento: "DNI",
              numeroDocumento: "",
            });
          }
        }
        // PASO 4: ÚLTIMO INTENTO CON CANTIDADPERSONAS
        else if (cotizacionData.cantidadpersonas) {
          const numPersons = parseInt(cotizacionData.cantidadpersonas || 0, 10);

          // Si hay al menos una persona, crear un adulto
          if (numPersons > 0) {
            // Primer adulto con datos del cliente si está disponible
            newPassengerData.adults.push({
              id: uuidv4(),
              nombres: cotizacionData.client
                ? cotizacionData.client.nombres || ""
                : "",
              apellidos: cotizacionData.client
                ? cotizacionData.client.apellidos || ""
                : "",
              edad: "30",
              nacionalidad: "Perú",
              correo: cotizacionData.client
                ? cotizacionData.client.correo || ""
                : "",
              telefono: cotizacionData.client
                ? cotizacionData.client.telefono || ""
                : "",
              tipoDocumento: "DNI",
              numeroDocumento: cotizacionData.client
                ? cotizacionData.client.numeroDocumento || ""
                : "",
            });

            // Si hay más personas, agregar adultos adicionales
            for (let i = 1; i < numPersons; i++) {
              newPassengerData.adults.push({
                id: uuidv4(),
                nombres: "",
                apellidos: "",
                edad: "30",
                nacionalidad: "Perú",
                correo: "",
                telefono: "",
                tipoDocumento: "DNI",
                numeroDocumento: "",
              });
            }
          }
        }

        // Verificación final: asegurar que haya al menos un adulto
        if (newPassengerData.adults.length === 0) {
          newPassengerData.adults.push({
            id: uuidv4(),
            nombres: cotizacionData.client
              ? cotizacionData.client.nombres || ""
              : "",
            apellidos: cotizacionData.client
              ? cotizacionData.client.apellidos || ""
              : "",
            edad: "30",
            nacionalidad: "Perú",
            correo: cotizacionData.client
              ? cotizacionData.client.correo || ""
              : "",
            telefono: cotizacionData.client
              ? cotizacionData.client.telefono || ""
              : "",
            tipoDocumento: "DNI",
            numeroDocumento: cotizacionData.client
              ? cotizacionData.client.numeroDocumento || ""
              : "",
          });
        }

        // Update counters
        setPeopleCount({
          adults: newPassengerData.adults.length,
          children: newPassengerData.children.length,
        });

        // Update both local state and parent state
        setLocalPassengerData(newPassengerData);
        onPassengerDataChange(newPassengerData);
        setDataInitialized(true);
      }); // end fetchAndInit().then()
    }
  }, [
    cotizacionData,
    isEditMode,
    passengerData,
    onPassengerDataChange,
    dataInitialized,
    localPassengerData.adults.length,
  ]);

  // Debounced propagation of changes to parent
  const propagateChanges = useCallback(
    (newData) => {
      onPassengerDataChange(newData);
    },
    [onPassengerDataChange],
  );

  // Handle person data changes
  const handlePersonChange = useCallback(
    (type, index, field, value) => {
      setLocalPassengerData((prev) => {
        const newData = { ...prev };
        const nextPassenger = {
          ...newData[type][index],
          [field]: value,
        };

        if (field === "pais" || field === "nacionalidad") {
          nextPassenger.pais = value;
          nextPassenger.nacionalidad = value;
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
          const calculatedAge = calculateAgeFromBirthDate(value);
          if (calculatedAge) {
            nextPassenger.edad = calculatedAge;
          }
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

          // Clear previous debounce timer for this field
          if (inputDebounceTimers[errorKey]) {
            clearTimeout(inputDebounceTimers[errorKey]);
          }

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
        if (field === "correo" && value) {
          const errorKey = `${type}_${index}_correo`;
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

          if (!emailRegex.test(value)) {
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

        // Clear debounce timer and set new one
        const timerId = setTimeout(() => {
          propagateChanges(newData);
        }, 300);

        setInputDebounceTimers((prev) => ({
          ...prev,
          [`${type}_${index}_${field}`]: timerId,
        }));

        return newData;
      });
    },
    [propagateChanges, inputDebounceTimers, selectedPassenger],
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
                    <label>Procedencia *</label>
                    <select
                      value={selectedPassenger.data.procedencia || "Extranjero"}
                      onChange={(e) =>
                        handlePersonChange(
                          selectedPassenger.type,
                          selectedPassenger.index,
                          "procedencia",
                          e.target.value,
                        )
                      }
                    >
                      {PROCEDENCIA_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>País *</label>
                    <select
                      value={
                        selectedPassenger.data.pais ||
                        selectedPassenger.data.nacionalidad ||
                        "Perú"
                      }
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
                      {["Masculino", "Femenino"].map((option) => (
                        <label className="radio-option" key={option}>
                          <input
                            type="radio"
                            name={`sexo-${selectedPassenger.type}-${selectedPassenger.index}`}
                            checked={selectedPassenger.data.sexo === option}
                            onChange={() =>
                              handlePersonChange(
                                selectedPassenger.type,
                                selectedPassenger.index,
                                "sexo",
                                option,
                              )
                            }
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Documento primero (más importante) */}
                <div className="form-row">
                  <div className="form-group">
                    <label>Tipo de documento *</label>
                    <select
                      value={selectedPassenger.data.tipoDocumento || "DNI"}
                      onChange={(e) =>
                        handlePersonChange(
                          selectedPassenger.type,
                          selectedPassenger.index,
                          "tipoDocumento",
                          e.target.value,
                        )
                      }
                    >
                      {DOCUMENT_OPTIONS[selectedPassenger.type].map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Número de documento *</label>
                    <input
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
                    <input
                      type="date"
                      value={
                        selectedPassenger.data.fecha_nacimiento ||
                        selectedPassenger.data.birthDate ||
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

                {/* Nombres y apellidos */}
                <div className="form-row">
                  <div className="form-group">
                    <label>Nombres *</label>
                    <input
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
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Apellido paterno *</label>
                    <input
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
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Apellido materno</label>
                    <input
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
                    <label>Edad *</label>
                    <input
                      type="number"
                      min={selectedPassenger.type === "adults" ? "18" : "0"}
                      max={selectedPassenger.type === "adults" ? "120" : "17"}
                      value={selectedPassenger.data.edad || ""}
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
                      required
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
                    <input
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
                      <input
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
                    <textarea
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
