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
import { documentSnapshot, mergeConfirmedDocuments, persistVoucherDocuments } from "../../../../../services/voucherDocumentPersistence";
import { normalizePassengerData, passengerRowsToDraft, passengerDraftFingerprint, toVoucherPassengerSyncPayload, mergeNominalRoster } from "../passengerDraft";
import { hasPendingDocumentUploads } from "../Steps/PassengerDocuments/documentPermissions";
import { reconcileDocumentListing } from "../Steps/PassengerDocuments/documentListing";
import { makeProxyUrlAbsolute } from "../../../../../services/presignedUrlService";
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
  onPassengerInfoSaved = null,
}) => {
  const isPassengerInfoOnlyMode = isEditMode && !isPaymentManagementMode && !isDocumentManagementMode;
  const isDedicatedManagement = isEditMode;
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
  const loadRequestRef = useRef(0);
  const passengerDraftRef = useRef<any>(null);
  const passengerPersistedFingerprintRef = useRef<string | null>(null);
  const passengerPersistedVoucherIdRef = useRef<number | null>(null);
  const passengerSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const documentDraftRef = useRef<any>(editedVoucherData.documentData);
  const documentScopeRef = useRef("");
  documentScopeRef.current = JSON.stringify([isOpen,voucherData?.id,cotizacionData?.id]);
  const [documentsPreparing,setDocumentsPreparing]=useState(false);
  const [documentsSaving,setDocumentsSaving]=useState(false);
  const hasPassengerChanges = isVoucherLoaded && passengerPersistedFingerprintRef.current !== null &&
    passengerDraftFingerprint(editedVoucherData.passengerData) !== passengerPersistedFingerprintRef.current;
  const needsPassengerLink = isPassengerInfoOnlyMode && isVoucherLoaded && passengerPersistedVoucherIdRef.current !== Number(voucherData?.id);
  useEffect(() => {
    if (isVoucherLoaded && passengerPersistedFingerprintRef.current === null) {
      passengerDraftRef.current=normalizePassengerData(editedVoucherData.passengerData);
      passengerPersistedFingerprintRef.current=passengerDraftFingerprint(passengerDraftRef.current);
    }
  },[isVoucherLoaded,editedVoucherData.passengerData]);

  useEffect(() => {
    let isMounted = true;

    if (!isOpen || !isSuperAdmin || isDedicatedManagement) {
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
  }, [isOpen, isSuperAdmin, isDedicatedManagement]);

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
    if (!isOpen) return;
    const request=++loadRequestRef.current;
    const scope=documentScopeRef.current;
    const isCurrent=()=>request===loadRequestRef.current && scope===documentScopeRef.current;
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
          if(!isCurrent()) return;

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

              parsedPassengerData=passengerRowsToDraft(passengersResponse);
            } catch (passengerErr) {
              console.error(
                " Error cargando pasajeros del voucher:",
                passengerErr,
              );
              // Sin fallback legacy - pasajeros vacíos si falla la API
              parsedPassengerData = { adults: [], children: [] };
            }

            if(fullVoucherData.cotizacion_id){
              const linkedIds=new Set([...parsedPassengerData.adults,...parsedPassengerData.children].map(p=>Number(p.id_pasajero)));
              parsedPassengerData=mergeNominalRoster(await pasajeroService.getPassengersByCotizacion(fullVoucherData.cotizacion_id),parsedPassengerData);
              passengerPersistedVoucherIdRef.current=[...parsedPassengerData.adults,...parsedPassengerData.children].every(p=>linkedIds.has(Number(p.id_pasajero)))
                ? Number(fullVoucherData.id) : null;
            }
            if(!isCurrent()) return;
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
                          canDelete: doc.canDelete === true,
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

            if(!isCurrent()) return;
            passengerDraftRef.current=normalizePassengerData(parsedPassengerData);
            documentDraftRef.current=parsedDocumentData;
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
    return ()=>{if(request===loadRequestRef.current)loadRequestRef.current++;};
  }, [isOpen,isEditMode, voucherData, cotizacionData]);

  // Manejo de cambios en los datos de los pasajeros
  const handlePassengerDataChange = useCallback((newPassengerData) => {
    passengerDraftRef.current=normalizePassengerData(newPassengerData);
    setEditedVoucherData((prev) => ({
      ...prev,
      passengerData: newPassengerData,
    }));
  }, []);

  // Manejo de cambios en los documentos
  const handleDocumentDataChange = useCallback((newDocumentData) => {
    documentDraftRef.current=newDocumentData;
    setEditedVoucherData(prev=>({...prev,documentData:newDocumentData}));
  },[]);

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
      passengerDraftRef.current=null; passengerPersistedFingerprintRef.current=null;
      passengerPersistedVoucherIdRef.current=null;
      passengerSavePromiseRef.current=null; documentDraftRef.current={};
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

  const savePassengers = async () => {
    if (passengerSavePromiseRef.current) return passengerSavePromiseRef.current;
    const draft = normalizePassengerData(passengerDraftRef.current || editedVoucherData.passengerData);
    const id = voucherIdRef.current || createdVoucherId || voucherData?.id;
    const quote = cotizacion?.id || cotizacionData?.id || voucherData?.cotizacion_id;
    const scope=documentScopeRef.current;
    const fingerprint=passengerDraftFingerprint(draft);
    if (fingerprint===passengerPersistedFingerprintRef.current && passengerPersistedVoucherIdRef.current===Number(id)) return true;
    const operation=(async()=>{
      setIsSubmitting(true);
      try {
        const rows=await pasajeroService.syncPassengersByVoucherVenta(id,toVoucherPassengerSyncPayload(draft,quote));
        if (scope!==documentScopeRef.current) return false;
        const confirmed=passengerRowsToDraft(rows);
        // A save response cannot erase typing which happened during the request.
        if (passengerDraftFingerprint(passengerDraftRef.current || editedVoucherData.passengerData)!==fingerprint)
          throw new Error("Los pasajeros cambiaron durante el guardado. Revisa el borrador antes de continuar.");
        passengerDraftRef.current=confirmed;
        passengerPersistedFingerprintRef.current=passengerDraftFingerprint(confirmed);
        passengerPersistedVoucherIdRef.current=Number(id);
        setEditedVoucherData(prev=>({...prev,passengerData:confirmed}));
        return true;
      } catch (error) {
        if(scope===documentScopeRef.current)setShowToast({type:"error",message:error.message || "No se guardaron los pasajeros."});
        return false;
      } finally {if(scope===documentScopeRef.current)setIsSubmitting(false);}
    })();
    passengerSavePromiseRef.current=operation;
    try{return await operation;}finally{if(passengerSavePromiseRef.current===operation)passengerSavePromiseRef.current=null;}
  };

  const savingDocumentsRef=useRef<any>(null);
  const documentsResaveRef=useRef(false);
  const documentsSavedInStepRef=useRef(false);
  const saveVoucherDocuments=useCallback(async(documentData,voucherId,voucherCode)=>{
    const scope=documentScopeRef.current;
    if(savingDocumentsRef.current?.scope===scope){documentsResaveRef.current=true;return savingDocumentsRef.current.promise;}
    setDocumentsSaving(true);
    const operation=(async()=>{
      try {
        do {
          documentsResaveRef.current=false;
          const snapshot=documentSnapshot(documentDraftRef.current || documentData || {});
          const progress=()=>{
            if(documentScopeRef.current!==scope)return;
            const merged=mergeConfirmedDocuments(documentDraftRef.current,snapshot);
            documentDraftRef.current=merged;
            setEditedVoucherData(prev=>({...prev,documentData:merged}));
          };
          try {
            await persistVoucherDocuments({documentData:snapshot,passengerData:passengerDraftRef.current || editedVoucherData.passengerData,
              quote:cotizacion?.id || cotizacionData?.id || voucherData?.cotizacion_id,voucher:voucherId,code:voucherCode},{
              authorize:async (id,passengerIds)=>{
                const roster=await pasajeroService.getPassengersByVoucherVenta(id,{_skipDedup:true});
                return passengerIds.every(passengerId=>roster.some(row=>Number(row.id_pasajero)===passengerId));
              },
              legacyUpload:uploadFile,legacyFolder:getTigrisPathForDocumentosVenta,legacyProxy:getProxyUrl,
              legacyRegister:voucherDocumentService.uploadDocument,legacyPayload:voucherDocumentService.convertFrontendToBackend,
              privateProxy:makeProxyUrlAbsolute,isCurrent:()=>documentScopeRef.current===scope,onProgress:progress,
            });
          } finally {progress();}
        } while(documentsResaveRef.current && scope===documentScopeRef.current);
        return scope===documentScopeRef.current;
      } catch (failure) {
        if(scope===documentScopeRef.current)setShowToast({type:"error",message:failure.message || "No se guardaron todos los documentos. Se conservaron los pendientes para reintentar."});
        return false;
      } finally {if(scope===documentScopeRef.current)setDocumentsSaving(false);}
    })();
    savingDocumentsRef.current={scope,promise:operation};
    try{return await operation;}finally{if(savingDocumentsRef.current?.promise===operation)savingDocumentsRef.current=null;}
  },[cotizacion?.id,cotizacionData?.id,voucherData?.cotizacion_id,uploadFile]);
  const handleDocumentsAdded=useCallback(()=>saveVoucherDocuments(documentDraftRef.current,
    voucherIdRef.current || createdVoucherId || voucherData?.id,
    voucherCodeRef.current || createdVoucherCode || voucherData?.voucher_code),
    [saveVoucherDocuments,createdVoucherId,createdVoucherCode,voucherData?.id,voucherData?.voucher_code]);

  const handleNextStep = useCallback(async () => {
    if (documentsPreparing || documentsSaving || isDedicatedManagement) return;
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
        const documentsSaved = await saveVoucherDocuments(
          editedVoucherData.documentData,
          voucherIdToUse,
          voucherCodeToUse,
        );
        if (!documentsSaved) return;
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
    if(documentsPreparing || documentsSaving || isDedicatedManagement) return;
    // NUEVO: Guardar datos del step actual antes de retroceder

    // Si estamos en el step de documentos (step 1), guardar documentos antes de retroceder
    const voucherIdToUse =
      voucherIdRef.current || createdVoucherId || voucherData?.id;
    const voucherCodeToUse =
      voucherCodeRef.current || createdVoucherCode || voucherData?.voucher_code;

    if (currentStep === 1 && voucherIdToUse) {
      setIsSubmitting(true);
      try {
        const documentsSaved = await saveVoucherDocuments(
          editedVoucherData.documentData,
          voucherIdToUse,
          voucherCodeToUse,
        );
        if (!documentsSaved) return;
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

  const handleClose=useCallback(()=>{
    if(isSubmitting || documentsPreparing || documentsSaving || savingDocumentsRef.current?.scope===documentScopeRef.current)return;
    if(isDocumentManagementMode){
      if(hasPendingDocumentUploads(documentDraftRef.current)){
        setShowToast({type:"error",message:"Reintenta guardar los documentos o retira los archivos pendientes antes de cerrar."});return;
      }
      onClose();return;
    }
    if(isPaymentManagementMode){onClose();return;}
    if(!isVoucherLoaded){onClose();return;}
    if(passengerPersistedFingerprintRef.current!==null &&
        passengerDraftFingerprint(passengerDraftRef.current || editedVoucherData.passengerData)!==passengerPersistedFingerprintRef.current){
      setShowUnsavedWarning(true);return;
    }
    onClose();
  },[isSubmitting,documentsPreparing,documentsSaving,isVoucherLoaded,isDocumentManagementMode,isPaymentManagementMode,editedVoucherData.passengerData,onClose]);
  const handleForceClose=useCallback(()=>{
    if(isSubmitting || documentsPreparing || documentsSaving || hasPendingDocumentUploads(documentDraftRef.current))return;
    onClose();
  },[isSubmitting,documentsPreparing,documentsSaving,onClose]);
  const savePassengerInformation=async()=>{
    if(await savePassengers()){
      await onPassengerInfoSaved?.();
      setShowUnsavedWarning(false);
      onClose();
    }
  };

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
    if(isDedicatedManagement) return;
    if(documentsPreparing || documentsSaving) return;
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
          if(!(await savePassengers())) throw new Error("No se emitio el voucher: los pasajeros no se guardaron.");
        }

        // GUARDAR DOCUMENTOS PENDIENTES antes de completar el voucher
        // Solo si no se guardaron ya en la navegación de steps
        if (voucherIdToUpdate && isUpdate && !documentsSavedInStepRef.current) {
          const documentsSaved = await saveVoucherDocuments(
            editedVoucherData?.documentData || {},
            voucherIdToUpdate,
            voucherCodeRef.current ||
              createdVoucherCode ||
              voucherData?.voucher_code,
          );
          if(!documentsSaved) throw new Error("No se emitio el voucher: quedan documentos pendientes.");
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
    const step = isPassengerInfoOnlyMode ? "passengers" : isDocumentManagementMode ? "documents" : isPaymentManagementMode ? "payments" : STEPS[currentStep].id;
    switch (step) {
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
            isPassengerInfoOnlyMode={isPassengerInfoOnlyMode}
            disabled={isSubmitting}
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
            cotizacionId={cotizacion?.id || cotizacionData?.id}
            onDocumentsAdded={handleDocumentsAdded}
            onPreparingChange={setDocumentsPreparing}
            documentsSaving={documentsSaving}
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
                <h2>{isPassengerInfoOnlyMode ? "Información de pasajeros" : isDocumentManagementMode ? "Documentos del file" : isPaymentManagementMode ? "Pagos del file" : "Crear Nuevo Voucher"}</h2>
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

            {isSuperAdmin && !isDedicatedManagement && (
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

            <button className="close-button" onClick={() => handleClose()} disabled={isSubmitting || documentsPreparing || documentsSaving}>
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
              {!isDedicatedManagement && <div className="voucher-modal-steps">
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
              </div>}

              {/* Contenedor del contenido del step */}
              <div className="voucher-modal-content">{renderStepContent()}</div>

              {/* Footer con navegación o botón guardar según modo */}
              {isDedicatedManagement ? (
                <div className="voucher-modal-footer document-management">
                  <span role="status" aria-live="polite">{isDocumentManagementMode
                    ? documentsPreparing ? "Preparando documentos..." : documentsSaving ? "Guardando documentos..." :
                      hasPendingDocumentUploads(editedVoucherData.documentData) ? "Hay documentos pendientes de guardar." : "Los documentos se guardan automáticamente."
                    : isPassengerInfoOnlyMode ? hasPassengerChanges ? "Información de pasajeros pendiente de guardar." : needsPassengerLink ? "Los pasajeros cotizados necesitan vincularse al voucher." : "Sin cambios pendientes."
                    : "Los pagos se registran desde sus propios formularios."}</span>
                  {isPassengerInfoOnlyMode && (hasPassengerChanges || needsPassengerLink) && <button type="button" className="save-button" onClick={savePassengerInformation}
                    disabled={isSubmitting}>{isSubmitting ? "Guardando..." : "Guardar información de pasajeros"}</button>}
                  <button type="button" className="close-documents-button" onClick={handleClose}
                    disabled={isSubmitting || documentsPreparing || documentsSaving}>Cerrar</button>
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
                {isPassengerInfoOnlyMode && <button type="button" className="save-button" disabled={isSubmitting} onClick={savePassengerInformation}>Guardar y cerrar</button>}
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
