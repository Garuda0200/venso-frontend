import { useState, useEffect, useRef, useCallback } from "react";
import {
  MdClose,
  MdNavigateNext,
  MdNavigateBefore,
  MdCheckCircleOutline,
  MdWarning,
  MdEdit,
  MdAddCircleOutline,
} from "react-icons/md";
// Remove CotizacionSelectorModal import
import SecureStorage from "../../../../../utils/secureStorage";
import axiosInstance from "../../../../../utils/axiosInstance"; // Para crear movimientos
import voucherDocumentService from "../../../../../services/voucherDocumentService"; // Para guardar documentos
import useFileUpload from "../../../../../hooks/useFileUpload"; // Hook para subir archivos a Tigris
import { getTigrisPathForDocumentosVenta } from "../../../../../utils/tigrisPathHelper"; // Helper para rutas organizadas
import { getProxyUrl } from "../../../../../services/presignedUrlService"; // Para URLs proxy
import PassengerStep from "../Steps/PassengerStep/PassengerStep";
import PaymentStep from "../Steps/PaymentStep/PaymentStep";
import PassengerDocuments from "../Steps/PassengerDocuments/PassengerDocuments";
import ConfirmationStep from "../Steps/ConfirmationStep/ConfirmationStep";
import { voucherVentaService } from "../../../../../services/voucherVentaService";
import { getUsers } from "../../../../../services/userService";
import * as cotizacionService from "../../../../Ventas/Cotizaciones/hooks/cotizacionService";
import pasajeroService from "../../../../../services/pasajeroService"; // Import pasajero service
import { createIdempotencyKey } from "../../../../../utils/idempotency";
import { summarizeVoucherFinancials } from "../../utils/voucherFinancials";
import "./VoucherModal.scss";

const STEPS = [
  { id: "passengers", label: "Pasajeros" },
  { id: "documents", label: "Documentos" },
  { id: "payments", label: "Pagos" },
  { id: "confirmation", label: "Confirmar" },
];

const parseItineraryValue = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return Object.values(parsed);
    return [];
  } catch {
    return [];
  }
};

const mergeCotizacionItinerary = (cotizacion = null, voucher = {}) => {
  if (!cotizacion) return null;

  const cotizacionItinerary = parseItineraryValue(
    cotizacion.itinerario || cotizacion.dias,
  );
  const voucherItinerary = parseItineraryValue(voucher.itinerario);
  const itinerario =
    cotizacionItinerary.length > 0 ? cotizacionItinerary : voucherItinerary;

  return {
    ...cotizacion,
    ...(itinerario.length > 0
      ? {
          itinerario,
          dias: itinerario,
        }
      : {}),
  };
};


const toDateTimeLocalInputValue = (value) => {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};

const dateTimeLocalInputToIso = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const getCreatorOptionValue = (user) =>
  user?.dniuser || user?.dni || user?.id || user?.username || "";

const getCreatorOptionLabel = (user) => {
  const fullName = [
    user?.nombres || user?.nombre,
    user?.apellidopaterno || user?.apellido_paterno,
    user?.apellidomaterno || user?.apellido_materno,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const identifier = getCreatorOptionValue(user);
  return fullName ? `${fullName} (${identifier})` : identifier || user?.email || "Usuario";
};

const resolveVoucherCreationDate = (voucher = {}, fallbackCotizacion = {}) =>
  voucher?.created_at ||
  voucher?.createdAt ||
  fallbackCotizacion?.createdat ||
  fallbackCotizacion?.createdAt ||
  fallbackCotizacion?.fecha ||
  "";

const resolveVoucherCreatedBy = (voucher = {}, fallbackCotizacion = {}) =>
  voucher?.created_by ||
  voucher?.createdBy ||
  fallbackCotizacion?.createdby ||
  fallbackCotizacion?.created_by ||
  SecureStorage.getItem("dniuser") ||
  "";

const VoucherModal = ({
  isOpen,
  onClose,
  onSave,
  voucherData = null,
  cotizacionData = null,
  isEditMode = false,
  skipCotizacionSelector = false,
  isPaymentManagementMode = false,
  isDocumentManagementMode = false,
}) => {
  const currentUserRole = Number(SecureStorage.getItem("userRole") ?? -1);
  const isSuperAdmin = currentUserRole === 0;
  const currentUserIdentifier = SecureStorage.getItem("dniuser") || "";

  const [creatorUsers, setCreatorUsers] = useState([]);
  const [creatorUsersLoading, setCreatorUsersLoading] = useState(false);

  // Estado para cotización seleccionada
  const [cotizacion, setCotizacion] = useState(() => {
    return cotizacionData;
  });

  // Estado para el voucher en edición
  const [editedVoucherData, setEditedVoucherData] = useState({
    passengerData: { adults: [], children: [] },
    documentData: { passports: [], idCards: [], otherDocuments: [] },
    paymentData: {
      payments: [],
      totalAmount: 0,
      totalPaid: 0,
      remainingAmount: 0,
      paymentStatus: "pending",
    },
    cotizacionId: cotizacionData?.id || null,
    cotizacionData: cotizacionData || null,
    created_by: resolveVoucherCreatedBy(voucherData, cotizacionData),
    created_at: resolveVoucherCreationDate(voucherData, cotizacionData),
    is_initialized: false,
    voucher_code: "",
  });

  // Estado para el código del voucher (separado para mejor control)
  const [voucherCode, setVoucherCode] = useState("");

  // NUEVO: Estados para el voucher creado (flujo progresivo)
  const [createdVoucherId, setCreatedVoucherId] = useState(null);
  const [createdVoucherCode, setCreatedVoucherCode] = useState(null);

  // CRÍTICO: Refs para persistir IDs entre renders (no esperan actualizaciones de estado)
  const voucherIdRef = useRef(null);
  const voucherCodeRef = useRef(null);
  const initialVoucherPromiseRef = useRef(null);
  const nextStepPromiseRef = useRef(null);
  const completionPromiseRef = useRef(null);
  const completionSucceededRef = useRef(false);
  const voucherCreateIdempotencyKeyRef = useRef(null);
  const voucherUpdateIdempotencyKeyRef = useRef(null);

  // Hook para subir archivos a Tigris
  const { uploadFile } = useFileUpload();

  // Control de pasos del wizard
  const [currentStep, setCurrentStep] = useState(0);
  // Remove showCotizacionModal state

  // Estados de UI
  const [error, setError] = useState(null);
  const [isVoucherLoaded, setIsVoucherLoaded] = useState(false);
  const [showToast, setShowToast] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);

  // Referencias para tracking
  const hasLoadedData = useRef(false);

  useEffect(() => {
    let isMounted = true;

    if (!isOpen || !isSuperAdmin) {
      setCreatorUsers([]);
      return () => {
        isMounted = false;
      };
    }

    setCreatorUsersLoading(true);
    getUsers(1, 5000, "created_at", -1)
      .then((response) => {
        if (!isMounted) return;
        setCreatorUsers(response?.accounts || response?.data?.accounts || []);
      })
      .catch((error) => {
        console.error("Error cargando usuarios creadores del voucher:", error);
        if (isMounted) setCreatorUsers([]);
      })
      .finally(() => {
        if (isMounted) setCreatorUsersLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, isSuperAdmin]);

  // Efecto para forzar step a 'payments' cuando está en modo gestión de pagos
  useEffect(() => {
    if (isPaymentManagementMode) {
      const paymentsStepIndex = STEPS.findIndex(
        (step) => step.id === "payments",
      );
      setCurrentStep(paymentsStepIndex);
    }
  }, [isPaymentManagementMode]);

  // Efecto para forzar step a 'documents' cuando está en modo gestión de documentos
  useEffect(() => {
    if (isDocumentManagementMode) {
      const documentsStepIndex = STEPS.findIndex(
        (step) => step.id === "documents",
      );
      setCurrentStep(documentsStepIndex);
    }
  }, [isDocumentManagementMode]);

  // Actualizar cotización cuando cambia el prop
  useEffect(() => {
    if (cotizacionData && !cotizacion) {
      setCotizacion(cotizacionData);
      setEditedVoucherData((prev) => ({
        ...prev,
        cotizacionId: cotizacionData.id,
        cotizacionData: cotizacionData,
      }));
    }
  }, [cotizacionData, cotizacion]);

  // Inicializar datos cuando se está editando un voucher existente
  useEffect(() => {
    const loadVoucherData = async () => {
      // Para edición, cargamos datos del voucher si no se han cargado ya
      if (
        isEditMode &&
        voucherData &&
        voucherData.id &&
        !hasLoadedData.current
      ) {
        try {
          setError(null);

          // Obtener datos completos del voucher CON COTIZACIÓN desde la API
          const response =
            await voucherVentaService.getVoucherWithCotizacionById(
              voucherData.id,
            );

          console.log(" Response getVoucherWithCotizacionById:", response);

          if (response && response.success && response.data) {
            const fullVoucherData = response.data;
            const embeddedCotizacion =
              fullVoucherData.cotizacion_data ||
              fullVoucherData.cotizacion ||
              cotizacionData ||
              null;
            let resolvedCotizacion = mergeCotizacionItinerary(
              embeddedCotizacion,
              fullVoucherData,
            );

            if (fullVoucherData.cotizacion_id) {
              try {
                const freshCotizacion =
                  await cotizacionService.getCotizacionById(
                    fullVoucherData.cotizacion_id,
                  );
                resolvedCotizacion = mergeCotizacionItinerary(
                  freshCotizacion || resolvedCotizacion,
                  fullVoucherData,
                );
              } catch (cotizacionErr) {
                console.warn(
                  "No se pudo cargar la cotización fresca; usando datos embebidos del voucher:",
                  cotizacionErr,
                );
              }
            }

            // CARGAR PASAJEROS DESDE LA TABLA pasajero
            let parsedPassengerData = { adults: [], children: [] };
            try {
              const passengersResponse =
                await pasajeroService.getPassengersByVoucherVenta(
                  fullVoucherData.id,
                );

              // Transform to format expected by frontend
              passengersResponse.forEach((p) => {
                const passengerObj = {
                  id_pasajero: p.id_pasajero, // ID de la BD para usar como passengerId
                  id_persona: p.id_persona,
                  id: p.id_pasajero, // Alias para compatibilidad
                  nombres: p.nombres,
                  apellidos: p.apellidos,
                  apellido_paterno: p.apellido_paterno,
                  apellido_materno: p.apellido_materno,
                  firstName: p.nombres,
                  lastName: p.apellidos,
                  birthDate: p.fecha_nacimiento,
                  fecha_nacimiento: p.fecha_nacimiento,
                  edad: p.edad,
                  age: p.edad,
                  procedencia: p.procedencia,
                  pais: p.pais || p.nacionalidad,
                  nacionalidad: p.nacionalidad,
                  nationality: p.nacionalidad,
                  sexo: p.sexo || p.genero,
                  tipo_documento: p.tipo_documento,
                  tipoDocumento: p.tipo_documento || "DNI",
                  docType: p.tipo_documento,
                  numero_documento: p.numero_documento,
                  numeroDocumento: p.numero_documento || "",
                  docNumber: p.numero_documento,
                  correo: p.correo,
                  email: p.correo,
                  telefono: p.telefono,
                  phone: p.telefono,
                  observaciones: p.observaciones,
                  notes: p.observaciones,
                  passenger_key: p.passenger_key,
                };

                if (p.tipo_pasajero === "adult") {
                  parsedPassengerData.adults.push(passengerObj);
                } else if (p.tipo_pasajero === "child") {
                  parsedPassengerData.children.push(passengerObj);
                }
              });
            } catch (passengerErr) {
              console.error(
                " Error cargando pasajeros del voucher:",
                passengerErr,
              );
              // Sin fallback legacy - pasajeros vacíos si falla la API
              parsedPassengerData = { adults: [], children: [] };
            }

            // CARGAR DOCUMENTOS DESDE LA TABLA voucher_venta_documentos
            let parsedDocumentData = {};
            try {
              const docsResponse =
                await voucherDocumentService.getDocumentsByVoucherId(
                  fullVoucherData.id,
                );
              if (docsResponse.success && docsResponse.data) {
                // El backend ya devuelve en formato camelCase: {idCards: [], passports: [], otherDocuments: []}
                const backendDocs = docsResponse.data;

                // Crear mapa de passenger_id -> tipo_pasajero para construir passengerKey
                const passengerTypeMap = {};
                parsedPassengerData.adults.forEach((p) => {
                  passengerTypeMap[p.id_pasajero] = "adult";
                });
                parsedPassengerData.children.forEach((p) => {
                  passengerTypeMap[p.id_pasajero] = "child";
                });

                // Organizar documentos por pasajero
                parsedDocumentData = {};

                // Procesar cada categoría de documentos
                ["passports", "idCards", "otherDocuments"].forEach(
                  (category) => {
                    if (Array.isArray(backendDocs[category])) {
                      backendDocs[category].forEach((doc) => {
                        // Construir passengerKey desde passenger_id
                        if (!doc.passengerId) {
                          console.warn(" Documento sin passengerId:", doc);
                          return;
                        }

                        const passengerType =
                          passengerTypeMap[doc.passengerId] || "adult";
                        const passengerKey = `${passengerType}-${doc.passengerId}`;

                        if (!parsedDocumentData[passengerKey]) {
                          parsedDocumentData[passengerKey] = {
                            passports: [],
                            idCards: [],
                            otherDocuments: [],
                          };
                        }

                        // Transformar documento al formato que espera PassengerDocuments
                        const transformedDoc = {
                          id: doc.id,
                          dbId: doc.id,
                          name: doc.filename,
                          filename: doc.filename,
                          tigrisUrl: doc.tigrisUrl,
                          dataUrl: doc.proxyUrl,
                          proxyUrl: doc.proxyUrl,
                          type: doc.fileType || "application/octet-stream",
                          size: doc.fileSize,
                          ownerId: doc.passengerId, // Usar passenger_id directamente
                          ownerName: doc.passengerName,
                          passengerKey: passengerKey, // passengerKey construido correctamente
                          documentoTipo: doc.documentoTipo,
                          uploadDate: doc.uploadedAt,
                          createdAt: doc.uploadedAt,
                          createdBy: doc.createdBy,
                          isFromDatabase: true,
                        };

                        parsedDocumentData[passengerKey][category].push(
                          transformedDoc,
                        );
                      });
                    }
                  },
                );
              }
            } catch (docErr) {
              console.error(" Error cargando documentos del voucher:", docErr);
              parsedDocumentData = {};
            }

            // El resumen financiero no se persiste en voucher_venta: se deriva de
            // cotizacion.total_final + movimientos asociados al voucher.
            const financialSummary = summarizeVoucherFinancials({
              voucher: fullVoucherData,
              cotizacion: resolvedCotizacion,
            });
            const parsedPaymentData = {
              payments: [],
              totalPaid: financialSummary.totalPaid,
              remainingAmount: financialSummary.remainingAmount,
              paymentStatus: financialSummary.paymentStatus,
              total_final: financialSummary.totalFinal,
            };

            setEditedVoucherData({
              id: fullVoucherData.id,
              voucher_code: fullVoucherData.voucher_code,
              cotizacionId: fullVoucherData.cotizacion_id,
              cotizacion_id: fullVoucherData.cotizacion_id,
              passengerData: parsedPassengerData,
              documentData: parsedDocumentData, // Documentos desde la tabla, no desde JSONB
              paymentData: parsedPaymentData,
              is_initialized: fullVoucherData.is_initialized || false,
              created_by: resolveVoucherCreatedBy(fullVoucherData, resolvedCotizacion),
              updated_by: fullVoucherData.updated_by,
              created_at: resolveVoucherCreationDate(fullVoucherData, resolvedCotizacion),
              updated_at: fullVoucherData.updated_at,
              status: fullVoucherData.status || "active",
              // CORREGIR: usar cotizacion_data si está disponible
              cotizacionData: resolvedCotizacion,
            });

            // Inicializar el código del voucher para edición
            setVoucherCode(fullVoucherData.voucher_code || "");

            // Establecer los datos de la cotización si vienen en la respuesta
            // CORREGIR: El backend devuelve cotizacion_data, no cotizacion
            if (resolvedCotizacion) {
              setCotizacion(resolvedCotizacion);
            } else if (
              fullVoucherData.cotizacion &&
              typeof fullVoucherData.cotizacion === "object"
            ) {
              setCotizacion(fullVoucherData.cotizacion);
            } else if (fullVoucherData.cotizacion_id) {
              // Fallback: cargar cotización por separado solo si no viene en la respuesta
              try {
                const cotizacionResponse =
                  await cotizacionService.getCotizacionById(
                    fullVoucherData.cotizacion_id,
                  );

                if (cotizacionResponse) {
                  setCotizacion(cotizacionResponse);
                }
              } catch (err) {
                console.warn(
                  "No se pudo cargar la información de la cotización:",
                  err,
                );
                // No es crítico, podemos continuar sin los datos de la cotización
              }
            }

            setIsVoucherLoaded(true);
            hasLoadedData.current = true;
          } else {
            throw new Error("Formato de respuesta inválido");
          }
        } catch (err) {
          console.error("Error al cargar datos del voucher:", err);
          setError(
            `Error al cargar datos: ${err.message || "Error desconocido"}`,
          );
        }
      } else if (!isEditMode) {
        let resolvedCotizacion = cotizacionData;

        if (cotizacionData?.id) {
          try {
            const freshCotizacion = await cotizacionService.getCotizacionById(
              cotizacionData.id,
            );
            resolvedCotizacion = mergeCotizacionItinerary(
              freshCotizacion || cotizacionData,
              {},
            );
            setCotizacion(resolvedCotizacion);
            setEditedVoucherData((prev) => ({
              ...prev,
              cotizacionId: resolvedCotizacion?.id || cotizacionData.id,
              cotizacion_id: resolvedCotizacion?.id || cotizacionData.id,
              cotizacionData: resolvedCotizacion,
            }));
          } catch (cotizacionErr) {
            console.warn(
              "No se pudo cargar la cotización completa para el voucher; usando datos recibidos:",
              cotizacionErr,
            );
            setCotizacion(cotizacionData);
          }
        }
        // Para nuevo voucher, intentar cargar pasajeros existentes de la cotización
        if (cotizacionData?.id) {
          try {
            const cotPassengers =
              await pasajeroService.getPassengersByCotizacion(
                cotizacionData.id,
              );
            if (cotPassengers && cotPassengers.length > 0) {
              console.log(
                ` Cargados ${cotPassengers.length} pasajeros de cotización ${cotizacionData.id}`,
              );
              const parsedData = { adults: [], children: [] };
              cotPassengers.forEach((p) => {
                const obj = {
                  id_pasajero: p.id_pasajero,
                  id_persona: p.id_persona,
                  id: p.id_pasajero,
                  nombres: p.nombres || "",
                  apellidos: p.apellidos || "",
                  firstName: p.nombres || "",
                  lastName: p.apellidos || "",
                  birthDate: p.fecha_nacimiento,
                  fecha_nacimiento: p.fecha_nacimiento,
                  edad: p.edad,
                  age: p.edad,
                  procedencia: p.procedencia,
                  pais: p.pais || p.nacionalidad,
                  nacionalidad: p.nacionalidad,
                  nationality: p.nacionalidad,
                  sexo: p.sexo || p.genero,
                  tipo_documento: p.tipo_documento,
                  tipoDocumento: p.tipo_documento || "DNI",
                  docType: p.tipo_documento,
                  numero_documento: p.numero_documento,
                  numeroDocumento: p.numero_documento || "",
                  docNumber: p.numero_documento,
                  correo: p.correo,
                  email: p.correo,
                  telefono: p.telefono,
                  phone: p.telefono,
                  observaciones: p.observaciones,
                  notes: p.observaciones,
                  passenger_key: p.passenger_key,
                };
                if (p.tipo_pasajero === "adult") {
                  parsedData.adults.push(obj);
                } else if (p.tipo_pasajero === "child") {
                  parsedData.children.push(obj);
                }
              });
              setEditedVoucherData((prev) => ({
                ...prev,
                passengerData: parsedData,
                cotizacionData: resolvedCotizacion || prev.cotizacionData,
              }));
            }
          } catch (err) {
            console.log(
              "No cotizacion passengers found, will init from peopleDetails",
            );
          }
        }
        setVoucherCode(
          resolvedCotizacion?.voucher_code ||
            resolvedCotizacion?.voucherCode ||
            cotizacionData?.voucher_code ||
            cotizacionData?.voucherCode ||
            "",
        );
        setIsVoucherLoaded(true);
        hasLoadedData.current = true;
      }
    };

    loadVoucherData();
  }, [isEditMode, voucherData, cotizacionData]);

  // Manejo de cambios en los datos de los pasajeros
  const handlePassengerDataChange = useCallback((newPassengerData) => {
    setEditedVoucherData((prev) => ({
      ...prev,
      passengerData: newPassengerData,
    }));
  }, []);

  // Manejo de cambios en los documentos
  const handleDocumentDataChange = useCallback((newDocumentData) => {
    console.log(" handleDocumentDataChange recibido:", {
      keys: Object.keys(newDocumentData),
      docCount: Object.values(newDocumentData).reduce((sum, passengerDocs) => {
        if (typeof passengerDocs === "object" && passengerDocs !== null) {
          return (
            sum +
            (passengerDocs.passports?.length || 0) +
            (passengerDocs.idCards?.length || 0) +
            (passengerDocs.otherDocuments?.length || 0)
          );
        }
        return sum;
      }, 0),
    });

    setEditedVoucherData((prev) => ({
      ...prev,
      documentData: newDocumentData,
    }));
  }, []);

  // Manejo de cambios en los datos de pago
  const handlePaymentDataChange = useCallback((newPaymentData) => {
    setEditedVoucherData((prev) => ({
      ...prev,
      paymentData: newPaymentData,
    }));
  }, []);

  // Manejo de cambios en el código del voucher
  const handleVoucherCodeChange = useCallback((e) => {
    const newCode = e.target.value;
    setVoucherCode(newCode);
  }, []);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      // Reset all state when modal closes
      setVoucherCode("");
      setEditedVoucherData({
        passengerData: { adults: [], children: [] },
        documentData: { passports: [], idCards: [], otherDocuments: [] },
        paymentData: {
          payments: [],
          totalAmount: 0,
          totalPaid: 0,
          remainingAmount: 0,
          paymentStatus: "pending",
        },
        cotizacionId: cotizacionData?.id || null,
        cotizacionData: cotizacionData || null,
        created_by: resolveVoucherCreatedBy(null, cotizacionData),
        created_at: resolveVoucherCreationDate(null, cotizacionData),
        is_initialized: false,
        voucher_code: "",
      });
      setCurrentStep(0);
      setError(null);
      setIsVoucherLoaded(false);
      setShowToast(null);
      setIsSubmitting(false);
      setShowUnsavedWarning(false);
      hasLoadedData.current = false;
      documentsSavedInStepRef.current = false;
      // Reset voucher refs to prevent stale IDs on next open
      voucherIdRef.current = null;
      voucherCodeRef.current = null;
      initialVoucherPromiseRef.current = null;
      nextStepPromiseRef.current = null;
      completionPromiseRef.current = null;
      completionSucceededRef.current = false;
      voucherCreateIdempotencyKeyRef.current = null;
      voucherUpdateIdempotencyKeyRef.current = null;
      setCreatedVoucherId(null);
      setCreatedVoucherCode(null);
    }
  }, [isOpen, cotizacionData]);

  // Initialize voucher code from props if in edit mode
  useEffect(() => {
    if (isEditMode && voucherData && voucherData.voucher_code) {
      setEditedVoucherData((prev) => ({
        ...prev,
        voucher_code: voucherData.voucher_code,
      }));
    }
  }, [isEditMode, voucherData]);

  // NUEVO: Crear voucher inicial después del primer step
  const createInitialVoucher = async () => {
    if (initialVoucherPromiseRef.current) {
      return initialVoucherPromiseRef.current;
    }

    const operation = (async () => {
      try {
        setIsSubmitting(true);

        // Construir payload mínimo para crear el voucher
        const initialVoucherData = {
          voucher_code: voucherCode.trim() || "",
          cotizacion_id: editedVoucherData.cotizacionId || cotizacion?.id || "",
          // ELIMINADO: passenger_data (legacy JSONB) - Pasajeros se guardan en tabla `pasajeros`
          status: "draft", // Estado borrador hasta que se complete
          is_initialized: false,
          platform: cotizacion?.platform || "venso",
          business_type: cotizacion?.business_type || "B2C",
          ...(isSuperAdmin
            ? {
                created_by:
                  editedVoucherData.created_by ||
                  cotizacion?.createdby ||
                  currentUserIdentifier,
                ...(editedVoucherData.created_at ||
                cotizacion?.createdat ||
                cotizacion?.fecha
                  ? {
                      created_at: dateTimeLocalInputToIso(
                        toDateTimeLocalInputValue(
                          editedVoucherData.created_at ||
                            cotizacion?.createdat ||
                            cotizacion?.fecha,
                        ),
                      ),
                    }
                  : {}),
              }
            : {}),
        };

        if (!initialVoucherData.cotizacion_id) {
          throw new Error(
            "El ID de cotización es obligatorio para crear un voucher",
          );
        }

        if (!voucherCreateIdempotencyKeyRef.current) {
          voucherCreateIdempotencyKeyRef.current = createIdempotencyKey(
            "voucher-venta-create",
            initialVoucherData.cotizacion_id,
          );
        }

        console.log(" Creando voucher inicial...", initialVoucherData);
        const result = await voucherVentaService.createVoucher(
          initialVoucherData,
          {
            idempotencyKey: voucherCreateIdempotencyKeyRef.current,
          },
        );

        if (!result.success) {
          throw new Error(result.error || "Error al crear voucher inicial");
        }

        const voucherId = result.data?.id || result.id;
        const voucherCodeFromBackend =
          result.data?.voucher_code || result.voucher_code || voucherCode.trim();

        setCreatedVoucherId(voucherId);
        setCreatedVoucherCode(voucherCodeFromBackend);
        setVoucherCode(voucherCodeFromBackend || voucherCode.trim());
        voucherIdRef.current = voucherId;
        voucherCodeRef.current = voucherCodeFromBackend;

        console.log(
          ` Voucher inicial resuelto: ID=${voucherId}, Code=${voucherCodeFromBackend}`,
        );

        setShowToast({
          type: "success",
          message: result.data?.reused_existing
            ? `La cotización ya tenía el voucher ${voucherCodeFromBackend}. Se continuará con ese registro.`
            : `Voucher ${voucherCodeFromBackend} creado. Ahora puede agregar pasajeros.`,
        });

        return true;
      } catch (error) {
        console.error(" Error creando voucher inicial:", error);
        setShowToast({
          type: "error",
          message: `Error al crear voucher: ${error.message}`,
        });
        return false;
      } finally {
        setIsSubmitting(false);
      }
    })();

    initialVoucherPromiseRef.current = operation;

    try {
      return await operation;
    } finally {
      if (initialVoucherPromiseRef.current === operation) {
        initialVoucherPromiseRef.current = null;
      }
    }
  };

  // NUEVO: Guardar pasajeros en la BD y actualizar con IDs retornados
  const savePassengers = async () => {
    try {
      // CRÍTICO: Usar refs primero (tienen el valor más reciente)
      const voucherIdToUse =
        voucherIdRef.current || createdVoucherId || voucherData?.id;
      const voucherCodeToUse =
        voucherCodeRef.current ||
        createdVoucherCode ||
        voucherData?.voucher_code;
      if (!voucherIdToUse) {
        throw new Error("No hay voucherId para guardar pasajeros");
      }

      // Transformar passengerData a formato de backend
      const passengersPayload = voucherVentaService.transformPassengerData(
        editedVoucherData.passengerData,
        voucherIdToUse,
        voucherCodeToUse,
      );

      if (passengersPayload.length === 0) {
        return true;
      }

      // Guardar pasajeros en paralelo (independientes entre sí)
      const results = await Promise.all(
        passengersPayload.map(async (passenger) => {
          if (passenger.id_pasajero) {
            try {
              await pasajeroService.updatePassenger(
                passenger.id_pasajero,
                passenger,
              );
            } catch (updateErr) {
              console.error(
                ` Error actualizando pasajero ${passenger.id_pasajero}:`,
                updateErr,
              );
            }
            return {
              passenger_key: passenger.passenger_key,
              id_pasajero: passenger.id_pasajero,
            };
          }

          // Crear solo pasajeros nuevos
          const response = await pasajeroService.createPassenger(passenger);
          if (response.success && response.data?.id) {
            return {
              passenger_key: passenger.passenger_key,
              id_pasajero: response.data.id,
            };
          }
          console.error(
            ` Error creando pasajero ${passenger.passenger_key}:`,
            response,
          );
          return null;
        }),
      );
      const savedPassengerIds = results.filter(Boolean);

      // CRÍTICO: Actualizar editedVoucherData con los id_pasajero retornados
      setEditedVoucherData((prev) => {
        const updated = { ...prev };

        // Actualizar adultos
        if (updated.passengerData?.adults) {
          updated.passengerData.adults = updated.passengerData.adults.map(
            (adult, idx) => {
              const passengerKey = `adult-${idx}`;
              const saved = savedPassengerIds.find(
                (p) => p.passenger_key === passengerKey,
              );
              if (saved) {
                return { ...adult, id_pasajero: saved.id_pasajero };
              }
              return adult;
            },
          );
        }

        // Actualizar niños
        if (updated.passengerData?.children) {
          updated.passengerData.children = updated.passengerData.children.map(
            (child, idx) => {
              const passengerKey = `child-${idx}`;
              const saved = savedPassengerIds.find(
                (p) => p.passenger_key === passengerKey,
              );
              if (saved) {
                return { ...child, id_pasajero: saved.id_pasajero };
              }
              return child;
            },
          );
        }

        return updated;
      });

      return true;
    } catch (error) {
      console.error(" Error guardando pasajeros:", error);
      setShowToast({
        type: "error",
        message: `Error al guardar pasajeros: ${error.message}`,
      });
      return false;
    }
  };

  // Función para guardar documentos en voucher_venta_documentos
  const savingDocumentsRef = useRef(false); // Flag para prevenir duplicados
  const documentsSavedInStepRef = useRef(false); // Track si ya se guardaron en navegación de step

  const saveVoucherDocuments = useCallback(
    async (documentData, voucherId, voucherCode) => {
      if (!documentData || Object.keys(documentData).length === 0) {
        return { savedCount: 0, failedDocuments: [] };
      }

      // Prevenir llamadas simultáneas
      if (savingDocumentsRef.current) {
        return;
      }

      savingDocumentsRef.current = true;

      try {
        let savedCount = 0;
        const failedDocuments = [];

        // CORREGIDO: Crear mapa de passengerKey -> passenger data (incluyendo id_pasajero)
        const passengerMap = {};
        if (editedVoucherData?.passengerData?.adults) {
          editedVoucherData.passengerData.adults.forEach((adult, idx) => {
            // Usar siempre el índice para consistencia con PassengerDocuments
            const key = `adult-${idx}`;
            passengerMap[key] = adult;
          });
        }
        if (editedVoucherData?.passengerData?.children) {
          editedVoucherData.passengerData.children.forEach((child, idx) => {
            // Usar siempre el índice para consistencia con PassengerDocuments
            const key = `child-${idx}`;
            passengerMap[key] = child;
          });
        }

        console.log(
          " Mapa de pasajeros para guardar documentos:",
          Object.keys(passengerMap),
        );

        // Iterar sobre cada pasajero en documentData
        for (const [passengerKey, passengerDocs] of Object.entries(
          documentData,
        )) {
          if (!passengerDocs || typeof passengerDocs !== "object") continue;

          // CORREGIDO: Buscar passenger en el mapa
          const passengerInfo = passengerMap[passengerKey];
          if (!passengerInfo) {
            console.warn(` No se encontró pasajero para key: ${passengerKey}`);
            console.warn(
              "Keys disponibles en mapa:",
              Object.keys(passengerMap),
            );
            continue;
          }

          const passengerId = passengerInfo.id_pasajero;
          const passengerName =
            `${passengerInfo.nombres || ""} ${passengerInfo.apellidos || ""}`.trim();

          console.log(
            ` Procesando documentos para ${passengerKey}: ${passengerName} (ID: ${passengerId})`,
          );

          // VALIDACIÓN: Verificar que tengamos id_pasajero
          if (!passengerId) {
            console.warn(
              ` Pasajero sin id_pasajero: ${passengerKey}`,
              passengerInfo,
            );
            continue;
          }

          // Iterar sobre cada categoría de documentos (passports, idCards, otherDocuments)
          for (const [category, documents] of Object.entries(passengerDocs)) {
            if (!Array.isArray(documents)) continue;

            console.log(
              ` Categoría ${category}: ${documents.length} documentos`,
            );

            // Guardar cada documento
            for (const doc of documents) {
              console.log(` Procesando documento:`, {
                name: doc.name,
                isPending: doc.isPending,
                hasFileObject: !!doc.fileObject,
                hasTigrisUrl: !!doc.tigrisUrl,
                hasDbId: !!doc.dbId,
                isFromDatabase: doc.isFromDatabase,
              });

              // NUEVA LÓGICA: Si el documento está pendiente (isPending), subirlo a Tigris primero
              if (doc.isPending && doc.fileObject) {
                console.log(
                  ` Subiendo documento pendiente a Tigris: ${doc.name}`,
                );

                try {
                  // Mapear categoría a tipo Tigris
                  const categoryMap = {
                    passports: "passports",
                    idCards: "idCards",
                    otherDocuments: "otherDocuments",
                  };
                  const tipoDocumento =
                    categoryMap[category] || "otherDocuments";
                  const tigrisFolder = getTigrisPathForDocumentosVenta(
                    voucherId,
                    voucherCode,
                    tipoDocumento,
                  );

                  // Subir a Tigris
                  const uploadResult = await uploadFile(
                    doc.fileObject,
                    tigrisFolder,
                  );

                  // Actualizar documento con URLs de Tigris
                  doc.tigrisUrl = uploadResult.tigrisUrl;
                  doc.filename = uploadResult.metadata.originalName;
                  doc.uploaded_at =
                    uploadResult.metadata.uploadedAt ||
                    new Date().toISOString();

                  // Usar proxy URL en lugar de presigned URL
                  doc.proxyUrl = getProxyUrl(uploadResult.tigrisUrl);

                  // Limpiar datos temporales
                  delete doc.isPending;
                  delete doc.fileObject;

                  console.log(
                    ` Documento subido a Tigris: ${uploadResult.tigrisUrl}`,
                  );
                } catch (uploadErr) {
                  console.error(
                    ` Error subiendo documento a Tigris: ${doc.name}`,
                    uploadErr,
                  );
                  failedDocuments.push({
                    name: doc.name || "Documento sin nombre",
                    stage: "subir a Tigris",
                    error: uploadErr?.message || "Error de almacenamiento",
                  });
                  // Mantener isPending/fileObject para que el usuario pueda
                  // reintentar; no continuar como si el documento existiera.
                  continue;
                }
              }

              // Solo guardar en DB si tiene tigrisUrl (fue subido) y no tiene dbId (no guardado aún)
              if (doc.tigrisUrl && !doc.dbId && !doc.isFromDatabase) {
                try {
                  const documentPayload =
                    voucherDocumentService.convertFrontendToBackend(
                      doc,
                      voucherCode,
                      passengerId, // CORREGIDO: Pasar passengerId (entero) en lugar de passengerKey
                      passengerName,
                    );

                  const saveResponse =
                    await voucherDocumentService.uploadDocument(
                      voucherId,
                      documentPayload,
                    );

                  if (saveResponse.success) {
                    console.log(
                      ` Documento guardado: ${doc.name} (ID: ${saveResponse.data.id})`,
                    );
                    // Actualizar documento con ID de DB
                    doc.dbId = saveResponse.data.id;
                    doc.id = saveResponse.data.id;
                    doc.proxyUrl = saveResponse.data.proxyUrl;
                    doc.isFromDatabase = true;
                    savedCount++;
                  } else {
                    console.error(
                      ` Error guardando documento ${doc.name}:`,
                      saveResponse.error,
                    );
                    failedDocuments.push({
                      name: doc.name || "Documento sin nombre",
                      stage: "registrar el documento",
                      error: saveResponse.error || "Error de base de datos",
                    });
                  }
                } catch (docErr) {
                  console.error(
                    ` Error al guardar documento ${doc.name}:`,
                    docErr,
                  );
                  failedDocuments.push({
                    name: doc.name || "Documento sin nombre",
                    stage: "registrar el documento",
                    error: docErr?.message || "Error de base de datos",
                  });
                }
              }
            }
          }
        }

        if (failedDocuments.length > 0) {
          const filenames = failedDocuments.map((item) => item.name).join(", ");
          throw new Error(
            `No se guardaron ${failedDocuments.length} documento(s): ${filenames}. Corrige el almacenamiento y vuelve a intentarlo.`,
          );
        }

        console.log(" Proceso de guardado de documentos completado", {
          savedCount,
        });
        return { savedCount, failedDocuments };
      } catch (err) {
        console.error(" Error general al guardar documentos:", err);
        throw err;
      } finally {
        // CRÍTICO: Restablecer flag siempre
        savingDocumentsRef.current = false;
      }
    },
    [editedVoucherData, uploadFile],
  );

  // Navegación entre pasos
  const handleNextStep = useCallback(async () => {
    if (nextStepPromiseRef.current) {
      return nextStepPromiseRef.current;
    }

    const operation = (async () => {
    // Validar que el código del voucher esté lleno antes de avanzar del primer step
    if (currentStep === 0 && !voucherCode.trim()) {
      setShowToast({
        type: "error",
        message: "Por favor, ingrese el código del voucher antes de continuar",
      });
      return;
    }

    // NUEVO: Si estamos en el step de pasajeros (step 0) y no es modo edición, crear el voucher PRIMERO
    if (
      currentStep === 0 &&
      !isEditMode &&
      !voucherIdRef.current &&
      !createdVoucherId
    ) {
      console.log(` Creando voucher inicial antes de guardar pasajeros...`);
      const success = await createInitialVoucher();
      if (!success) {
        console.log(` Error creando voucher, no avanzaremos`);
        return; // No avanzar si falló la creación
      }
      // CONTINUAR con el flujo de guardar pasajeros (no hacer return aquí)
      console.log(` Voucher creado, ahora guardando pasajeros...`);
    }

    // NUEVO: Si estamos en el step de pasajeros (step 0), guardar pasajeros antes de avanzar
    // CRÍTICO: Usar voucherIdRef que persiste inmediatamente, no el estado
    const voucherIdToUse =
      voucherIdRef.current || createdVoucherId || voucherData?.id;
    const voucherCodeToUse =
      voucherCodeRef.current || createdVoucherCode || voucherData?.voucher_code;

    if (currentStep === 0 && voucherIdToUse) {
      console.log(
        ` Guardando pasajeros antes de avanzar a Step 1 (Documentos)...`,
      );
      console.log(
        ` Usando voucherId=${voucherIdToUse}, voucherCode=${voucherCodeToUse}`,
      );
      setIsSubmitting(true);
      const success = await savePassengers();
      setIsSubmitting(false);
      if (!success) {
        return;
      }
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
      return;
    }

    if (currentStep === 1 && voucherIdToUse) {
      setIsSubmitting(true);
      try {
        await saveVoucherDocuments(
          editedVoucherData.documentData,
          voucherIdToUse,
          voucherCodeToUse,
        );
        documentsSavedInStepRef.current = true;
        setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
      } catch (error) {
        console.error("No se pudo guardar los documentos del voucher:", error);
        setShowToast({
          type: "error",
          message:
            error?.message ||
            "No se pudieron guardar los documentos. Revisa el almacenamiento e inténtalo otra vez.",
        });
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    })();

    nextStepPromiseRef.current = operation;

    try {
      return await operation;
    } finally {
      if (nextStepPromiseRef.current === operation) {
        nextStepPromiseRef.current = null;
      }
    }
  },  [
    currentStep,
    voucherCode,
    isEditMode,
    createdVoucherId,
    createdVoucherCode,
    voucherData,
    editedVoucherData,
    cotizacion,
    saveVoucherDocuments,
    createInitialVoucher,
    savePassengers,
  ]);

  const handlePrevStep = useCallback(async () => {
    // NUEVO: Guardar datos del step actual antes de retroceder

    // Si estamos en el step de documentos (step 1), guardar documentos antes de retroceder
    const voucherIdToUse =
      voucherIdRef.current || createdVoucherId || voucherData?.id;
    const voucherCodeToUse =
      voucherCodeRef.current || createdVoucherCode || voucherData?.voucher_code;

    if (currentStep === 1 && voucherIdToUse) {
      setIsSubmitting(true);
      try {
        await saveVoucherDocuments(
          editedVoucherData.documentData,
          voucherIdToUse,
          voucherCodeToUse,
        );
        documentsSavedInStepRef.current = true;
      } catch (error) {
        console.error("No se pudo guardar los documentos del voucher:", error);
        setShowToast({
          type: "error",
          message:
            error?.message ||
            "No se pudieron guardar los documentos. Revisa el almacenamiento e inténtalo otra vez.",
        });
        return;
      } finally {
        setIsSubmitting(false);
      }
    }

    // Si retrocedemos al step de documentos, resetear flag para que se guarden al avanzar de nuevo
    if (currentStep === 2) {
      documentsSavedInStepRef.current = false;
    }

    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, [
    currentStep,
    createdVoucherId,
    createdVoucherCode,
    voucherData,
    editedVoucherData,
    saveVoucherDocuments,
  ]);

  // Fix the handleClose function to ensure it always works
  const handleClose = useCallback(() => {
    // Check if there are unsaved changes
    if (
      editedVoucherData.passengerData.adults?.length > 0 ||
      editedVoucherData.paymentData.payments?.length > 0
    ) {
      setShowUnsavedWarning(true);
    } else {
      // If no unsaved changes, close directly
      // Notificar al padre para refrescar la lista si se creó un voucher
      if (createdVoucherId && onSave) {
        onSave();
      }
      onClose();
    }
  }, [editedVoucherData, createdVoucherId, onSave, onClose]);

  // Add a force close function that bypasses the unsaved changes check
  const handleForceClose = useCallback(() => {
    // Notificar al padre para refrescar la lista si se creó un voucher
    if (createdVoucherId && onSave) {
      onSave();
    }
    // Close without checking for unsaved changes
    onClose();
  }, [createdVoucherId, onSave, onClose]);

  // Deshabilitar cierre al hacer clic fuera del modal (mantener otros métodos de cierre)
  const handleOverlayClick = useCallback((e) => {
    // No hacer nada - modal no se cierra al hacer clic fuera
  }, []);

  // Add ESC key handler
  useEffect(() => {
    const handleEscKey = (e) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscKey);
    }

    return () => {
      document.removeEventListener("keydown", handleEscKey);
    };
  }, [isOpen, handleClose]);

  // Función para guardar documentos del voucher en la base de datos
  // Completar el proceso de creación/edición
  const handleCompleteVoucher = async (voucherData) => {
    if (completionSucceededRef.current) {
      return null;
    }

    if (completionPromiseRef.current) {
      return completionPromiseRef.current;
    }

    const operation = (async () => {
      try {
        setIsSubmitting(true);

        // NUEVO FLUJO: Si ya existe createdVoucherId, actualizar en lugar de crear
        const voucherIdToUpdate =
          voucherIdRef.current || createdVoucherId || voucherData?.id;
        const isUpdate = Boolean(isEditMode || voucherIdToUpdate);
        if (isUpdate && !voucherIdToUpdate) {
          throw new Error("No se encontró el voucher que debe actualizarse");
        }

        // GUARDAR PASAJEROS PENDIENTES antes de completar voucher
        if (voucherIdToUpdate) {
          await savePassengers();
        }

        // GUARDAR DOCUMENTOS PENDIENTES antes de completar el voucher
        // Solo si no se guardaron ya en la navegación de steps
        if (voucherIdToUpdate && isUpdate && !documentsSavedInStepRef.current) {
          await saveVoucherDocuments(
            editedVoucherData?.documentData || {},
            voucherIdToUpdate,
            voucherCodeRef.current ||
              createdVoucherCode ||
              voucherData?.voucher_code,
          );
        }

        const finalVoucherData = {
          ...(isUpdate && voucherIdToUpdate ? { id: voucherIdToUpdate } : {}),
          voucher_code:
            voucherCodeRef.current ||
            createdVoucherCode ||
            voucherCode.trim() ||
            "",
          cotizacion_id:
            voucherData.cotizacionId ||
            voucherData.cotizacion_id ||
            editedVoucherData.cotizacionId ||
            cotizacion?.id ||
            "",
          status: "active",
          is_initialized: true,
          created_by: String(
            isSuperAdmin
              ? editedVoucherData.created_by ||
                  cotizacion?.createdby ||
                  currentUserIdentifier
              : currentUserIdentifier,
          ),
          platform: cotizacion?.platform || "venso",
          business_type: cotizacion?.business_type || "B2C",
          ...(isSuperAdmin &&
          (editedVoucherData.created_at ||
            cotizacion?.createdat ||
            cotizacion?.fecha)
            ? {
                created_at: dateTimeLocalInputToIso(
                  toDateTimeLocalInputValue(
                    editedVoucherData.created_at ||
                      cotizacion?.createdat ||
                      cotizacion?.fecha,
                  ),
                ),
              }
            : {}),
        };

        if (!finalVoucherData.cotizacion_id) {
          throw new Error(
            "El ID de cotización es obligatorio para crear un voucher",
          );
        }

        let result;
        if (isUpdate) {
          if (!voucherUpdateIdempotencyKeyRef.current) {
            voucherUpdateIdempotencyKeyRef.current = createIdempotencyKey(
              "voucher-venta-update",
              voucherIdToUpdate,
            );
          }

          result = await voucherVentaService.updateVoucher(
            voucherIdToUpdate,
            finalVoucherData,
            {
              idempotencyKey: voucherUpdateIdempotencyKeyRef.current,
            },
          );
        } else {
          if (!voucherCreateIdempotencyKeyRef.current) {
            voucherCreateIdempotencyKeyRef.current = createIdempotencyKey(
              "voucher-venta-create",
              finalVoucherData.cotizacion_id,
            );
          }

          result = await voucherVentaService.createVoucher(finalVoucherData, {
            idempotencyKey: voucherCreateIdempotencyKeyRef.current,
          });
        }

        setShowToast({
          type: "success",
          message: isUpdate
            ? "Voucher actualizado exitosamente"
            : result.data?.reused_existing
              ? "La cotización ya tenía un voucher. Se reutilizó el registro existente."
              : "Voucher creado exitosamente",
        });

        completionSucceededRef.current = true;
        try {
          await onSave(result.data || result);
        } catch (callbackError) {
          console.error(
            "El voucher se guardó, pero falló la actualización de la vista padre:",
            callbackError,
          );
        }

        setTimeout(() => {
          handleForceClose();
        }, 1500);

        return result;
      } catch (error) {
        console.error("Error al completar el voucher:", error);
        setShowToast({
          type: "error",
          message: `Error: ${error.response?.data || error.message || "Error desconocido"}`,
        });
        return null;
      } finally {
        if (!completionSucceededRef.current) {
          setIsSubmitting(false);
        }
      }
    })();

    completionPromiseRef.current = operation;

    try {
      return await operation;
    } finally {
      if (completionPromiseRef.current === operation) {
        completionPromiseRef.current = null;
      }
    }
  };

  // Renderizar contenido según el paso currentStep
  const renderStepContent = () => {
    switch (STEPS[currentStep].id) {
      case "passengers":
        return (
          <PassengerStep
            passengerData={editedVoucherData.passengerData}
            onPassengerDataChange={handlePassengerDataChange}
            cotizacionData={{
              ...(cotizacion || {}),
              peopleDetails:
                cotizacion?.peopleDetails ||
                cotizacion?.peopledetails ||
                editedVoucherData.passengerData,
              peopledetails:
                cotizacion?.peopledetails ||
                cotizacion?.peopleDetails ||
                editedVoucherData.passengerData,
            }}
            isEditMode={isEditMode}
            voucherId={createdVoucherId || voucherData?.id} // Pasar ID del voucher creado
            voucherCode={createdVoucherCode || voucherData?.voucher_code} // Pasar código
          />
        );
      case "documents":
        return (
          <PassengerDocuments
            passengerData={editedVoucherData.passengerData}
            documentData={editedVoucherData.documentData}
            onDocumentDataChange={handleDocumentDataChange}
            isEditMode={isEditMode}
            voucherCode={
              createdVoucherCode || voucherCode || voucherData?.voucher_code
            } // Usar código creado
            voucherId={
              createdVoucherId || editedVoucherData.id || voucherData?.id
            } // Usar ID creado
          />
        );
      case "payments":
        return (
          <PaymentStep
            paymentData={editedVoucherData.paymentData}
            onPaymentDataChange={handlePaymentDataChange}
            passengerData={editedVoucherData.passengerData}
            cotizacionData={{
              ...(cotizacion || {}),
              passenger_summary:
                voucherData?.passenger_summary ||
                editedVoucherData.passenger_summary,
              passengerSummary:
                voucherData?.passenger_summary ||
                editedVoucherData.passenger_summary,
              peopleDetails:
                (editedVoucherData.passengerData?.adults?.length ||
                editedVoucherData.passengerData?.children?.length
                  ? editedVoucherData.passengerData
                  : null) ||
                cotizacion?.peopleDetails ||
                cotizacion?.peopledetails ||
                voucherData?.passenger_summary,
              peopledetails:
                (editedVoucherData.passengerData?.adults?.length ||
                editedVoucherData.passengerData?.children?.length
                  ? editedVoucherData.passengerData
                  : null) ||
                cotizacion?.peopledetails ||
                cotizacion?.peopleDetails ||
                voucherData?.passenger_summary,
            }}
            isEditMode={isEditMode}
            voucherCode={
              createdVoucherCode || voucherCode || voucherData?.voucher_code
            } // Usar código creado
            voucherId={
              createdVoucherId || editedVoucherData.id || voucherData?.id
            } // Usar ID creado
          />
        );
      case "confirmation":
        return (
          <ConfirmationStep
            voucherData={editedVoucherData}
            cotizacionData={cotizacion || editedVoucherData.cotizacionData}
            onComplete={handleCompleteVoucher}
            onPrevious={handlePrevStep}
            isEditMode={isEditMode}
            hideActions={true} // Ocultar botones internos, usar footer del modal
          />
        );
      default:
        return <div>Paso no implementado</div>;
    }
  };

  if (!isOpen) return null;

  // Exit early if we don't have cotizacionData in non-edit mode
  if (!isEditMode && !cotizacionData) {
    return (
      <div className="voucher-modal-overlay">
        <div className="voucher-modal">
          <div className="voucher-modal-header">
            <h2>Error de Inicialización</h2>
            <button className="close-button" onClick={handleClose}>
              <MdClose />
            </button>
          </div>
          <div className="voucher-error">
            <MdWarning className="error-icon" />
            <p>No se ha proporcionado una cotización para crear el voucher.</p>
            <button onClick={handleClose} className="retry-button">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Critical fix: Move the unsaved changes warning outside the voucher-modal div
  // so it's not constrained by its parent's styles
  return (
    <>
      <div className="voucher-modal-overlay" onClick={handleOverlayClick}>
        <div className="voucher-modal">
          {/* NUEVO HEADER MEJORADO */}
          <div className="voucher-modal-header">
            <div className="header-left">
              <div className="header-icon">
                {isEditMode ? <MdEdit /> : <MdAddCircleOutline />}
              </div>
              <div className="header-info">
                <h2>{isEditMode ? "Editar Voucher" : "Crear Nuevo Voucher"}</h2>
                {cotizacion && (
                  <span className="header-subtitle">
                    {voucherCode || "Sin código"}
                  </span>
                )}
              </div>
            </div>

            <div className="header-center">
              <div className="voucher-code-inline">
                <label htmlFor="voucher-code-header">
                  Código del Voucher <span className="required-mark">*</span>
                </label>
                <input
                  id="voucher-code-header"
                  type="text"
                  value={voucherCode}
                  onChange={handleVoucherCodeChange}
                  placeholder="Ej: VCH-2025-001"
                  className={`voucher-code-input-header ${!voucherCode.trim() ? "empty" : ""}`}
                  maxLength={50}
                  required
                  readOnly={isEditMode} // Solo lectura en modo edición
                  disabled={isEditMode} // También deshabilitado visualmente
                />
              </div>
            </div>

            {isSuperAdmin && (
              <div className="header-admin-metadata" aria-label="Auditoría de creación del voucher">
                <div className="admin-metadata-title">
                  <span>Auditoría superadmin</span>
                  <small>Creación del voucher</small>
                </div>
                <div className="admin-metadata-fields">
                  <div className="voucher-metadata-field">
                    <label htmlFor="voucher-created-by-header">Creado por</label>
                    <select
                      id="voucher-created-by-header"
                      value={editedVoucherData.created_by || ""}
                      onChange={(event) =>
                        setEditedVoucherData((prev) => ({
                          ...prev,
                          created_by: event.target.value,
                        }))
                      }
                      disabled={creatorUsersLoading}
                    >
                      <option value="">
                        {creatorUsersLoading ? "Cargando usuarios..." : "Seleccionar usuario"}
                      </option>
                      {creatorUsers.map((creator) => {
                        const value = getCreatorOptionValue(creator);
                        if (!value) return null;
                        return (
                          <option key={value} value={value}>
                            {getCreatorOptionLabel(creator)}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="voucher-metadata-field compact">
                    <label htmlFor="voucher-created-at-header">Fecha creación</label>
                    <input
                      id="voucher-created-at-header"
                      type="datetime-local"
                      value={toDateTimeLocalInputValue(editedVoucherData.created_at)}
                      onChange={(event) =>
                        setEditedVoucherData((prev) => ({
                          ...prev,
                          created_at: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            <button className="close-button" onClick={() => handleClose()}>
              <MdClose />
            </button>
          </div>

          {!isVoucherLoaded ? (
            <div className="voucher-loading">
              <div className="spinner"></div>
              <p>Cargando datos del voucher...</p>
            </div>
          ) : error ? (
            <div className="voucher-error">
              <MdWarning className="error-icon" />
              <p>{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="retry-button"
              >
                Reintentar
              </button>
            </div>
          ) : (
            <>
              {/* Steps progress indicator */}
              <div className="voucher-modal-steps">
                {STEPS.map((step, index) => (
                  <div
                    key={step.id}
                    className={`step ${index === currentStep ? "active" : ""} ${index < currentStep ? "completed" : ""}`}
                  >
                    <div className="step-number">
                      {index < currentStep ? (
                        <MdCheckCircleOutline className="step-check" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <div className="step-label">{step.label}</div>
                  </div>
                ))}
              </div>

              {/* Contenedor del contenido del step */}
              <div className="voucher-modal-content">{renderStepContent()}</div>

              {/* Footer con navegación o botón guardar según modo */}
              {isPaymentManagementMode || isDocumentManagementMode ? (
                // Modo gestión de pagos o documentos - Solo botón guardar
                <div className="voucher-modal-footer payment-management">
                  <button
                    className="save-button"
                    onClick={() => handleCompleteVoucher(editedVoucherData)}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Guardando..." : "Guardar Cambios"}
                  </button>
                </div>
              ) : currentStep === STEPS.length - 1 ? (
                // Último step (Confirmation) - Botones de completar voucher
                <div className="voucher-modal-footer confirmation">
                  <button
                    className="prev-button"
                    onClick={handlePrevStep}
                    disabled={isSubmitting}
                  >
                    <MdNavigateBefore /> Anterior
                  </button>
                  <button
                    className="confirm-button"
                    onClick={() => handleCompleteVoucher(editedVoucherData)}
                    disabled={
                      isSubmitting ||
                      !editedVoucherData.passengerData?.adults?.length
                    }
                  >
                    {isSubmitting
                      ? "Procesando..."
                      : isEditMode
                        ? "Actualizar Voucher"
                        : "Emitir Voucher"}
                  </button>
                </div>
              ) : (
                // Modo normal - navegación entre steps intermedios
                <div className="voucher-modal-footer">
                  <button
                    className="prev-button"
                    onClick={handlePrevStep}
                    disabled={currentStep === 0}
                  >
                    <MdNavigateBefore /> Anterior
                  </button>
                  <button
                    className="next-button"
                    onClick={handleNextStep}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Guardando..." : "Siguiente"}{" "}
                    <MdNavigateNext />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Move unsaved changes warning outside the modal for proper styling */}
      {showUnsavedWarning && (
        <div className="unsaved-changes-warning-overlay">
          <div className="unsaved-changes-warning">
            <div className="warning-content">
              <div className="warning-header">
                <MdWarning className="warning-icon" />
                <h3>¿Descartar cambios?</h3>
              </div>
              <p>
                Hay cambios sin guardar. ¿Está seguro que desea cerrar el
                formulario?
              </p>
              <div className="warning-actions">
                <button
                  className="cancel-button"
                  onClick={() => setShowUnsavedWarning(false)}
                >
                  Cancelar
                </button>
                <button className="discard-button" onClick={handleForceClose}>
                  Descartar cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add toast component if not already present */}
      {showToast && (
        <div className={`toast ${showToast.type}`}>
          <span className="toast-message">{showToast.message}</span>
          <button className="toast-close" onClick={() => setShowToast(null)}>
            ×
          </button>
        </div>
      )}
    </>
  );
};

export default VoucherModal;
