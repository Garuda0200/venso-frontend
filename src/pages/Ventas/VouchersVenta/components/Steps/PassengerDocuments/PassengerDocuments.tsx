import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  MdUpload,
  MdDescription,
  MdPerson,
  MdChildCare,
  MdCheck,
  MdError,
  MdOutlineFilePresent,
  MdClose,
  MdWarning,
  MdCardMembership,
  MdCreditCard,
  MdLibraryBooks,
  MdDownload,
  MdArrowForward,
} from "react-icons/md";
import {
  getProxyUrl,
  makeProxyUrlAbsolute,
} from "../../../../../../services/presignedUrlService";
import useFileUpload from "../../../../../../hooks/useFileUpload"; // Hook para subir archivos a Tigris
import { getTigrisPathForDocumentosVenta } from "../../../../../../utils/tigrisPathHelper"; // Helper para rutas organizadas
import voucherDocumentService from "../../../../../../services/voucherDocumentService"; // Servicio para documentos relacionales
import FileDropZone from "../../../../../../components/common/FileDropZone/FileDropZone";
import "./PassengerDocuments.scss";
import { v4 as uuidv4 } from "uuid";

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/jpg",
  "application/pdf",
];

const PassengerDocuments = ({
  passengerData,
  documentData,
  onDocumentDataChange,
  isEditMode = false,
  voucherId = null, // ID del voucher para jerarquía en Tigris
  voucherCode = null, // Código del voucher para rutas organizadas en Tigris
}) => {
  // Hook para subir archivos a Tigris
  const {
    uploadFile,
    isUploading,
    uploadProgress: tigrisUploadProgress,
    uploadError,
  } = useFileUpload();

  // CRÍTICO: Ref persistente que NUNCA se resetea
  const documentsMapRef = useRef(new Map());
  const isInitializedRef = useRef(false);
  const syncTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastDocumentDataHashRef = useRef("");

  // Document management state
  const [passengerDocuments, setPassengerDocuments] = useState(new Map());

  // Selected passenger state
  const [selectedPassengerId, setSelectedPassengerId] = useState(null);
  const [activeCategory, setActiveCategory] = useState("passports");

  // UI states
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState([]);
  const [uploadErrors, setUploadErrors] = useState([]);
  const [statusMessage, setStatusMessage] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  // Format passengers list with unique IDs for selection - MEMOIZED
  const allPassengers = React.useMemo(
    () => [
      ...(passengerData?.adults || []).map((adult, idx) => ({
        ...adult,
        type: "adult",
        passengerKey: `adult-${idx}`, // CRÍTICO: Usar índice, no ID (para coincidir con saveVoucherDocuments)
      })),
      ...(passengerData?.children || []).map((child, idx) => ({
        ...child,
        type: "child",
        passengerKey: `child-${idx}`, // CRÍTICO: Usar índice, no ID
      })),
    ],
    [passengerData],
  );

  // CRÍTICO: Función de sincronización mejorada con debounce
  const syncToParent = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = setTimeout(() => {
      try {
        // CORREGIDO: Crear objeto vacío que se llenará con passengerKeys como top-level keys
        const outputDocumentData = {};

        documentsMapRef.current.forEach((passengerDocs, passengerKey) => {
          const passenger = allPassengers.find(
            (p) => p.passengerKey === passengerKey,
          );

          if (!passenger) {
            return;
          }

          // CORREGIDO: Inicializar entrada para este pasajero
          if (!outputDocumentData[passengerKey]) {
            outputDocumentData[passengerKey] = {
              passports: [],
              idCards: [],
              otherDocuments: [],
            };
          }

          // CORREGIDO: Agregar documentos organizados por pasajero
          ["passports", "idCards", "otherDocuments"].forEach((category) => {
            if (Array.isArray(passengerDocs[category])) {
              passengerDocs[category].forEach((doc) => {
                outputDocumentData[passengerKey][category].push({
                  ...doc,
                  ownerId: passenger.id,
                  ownerName:
                    `${passenger.nombres || ""} ${passenger.apellidos || ""}`.trim(),
                  ownerType: passenger.type,
                  passengerKey: passengerKey,
                });
              });
            }
          });
        });

        // Llamar callback del padre
        onDocumentDataChange(outputDocumentData);
      } catch (error) {
        // Silent error handling
      } finally {
        syncTimeoutRef.current = null;
      }
    }, 150);
  }, [allPassengers, onDocumentDataChange]);

  // CRÍTICO: Reset initialization cuando cambia el voucherId O cuando se monta el componente
  useEffect(() => {
    isInitializedRef.current = false;
    lastDocumentDataHashRef.current = "";

    // Cleanup when component unmounts
    return () => {
      isInitializedRef.current = false;
    };
  }, [voucherId]);

  // CRÍTICO: Inicialización única - SOLO UNA VEZ (por voucherId o mount)
  useEffect(() => {
    if (isInitializedRef.current) {
      return;
    }

    // No inicializar si aún no hay pasajeros cargados (evita race condition
    // cuando isDocumentManagementMode salta directo al step de documentos
    // antes de que loadVoucherData termine de cargar los pasajeros)
    if (isEditMode && voucherId && allPassengers.length === 0) {
      return;
    }

    const initializeDocuments = async () => {
      try {
        const documentsByPassenger = new Map();

        // Create empty document containers for each passenger
        allPassengers.forEach((passenger) => {
          documentsByPassenger.set(passenger.passengerKey, {
            passports: [],
            idCards: [],
            otherDocuments: [],
          });
        });

        // PRIORIDAD 1: Si estamos en modo edición Y tenemos voucherId, cargar desde la base de datos
        if (isEditMode && voucherId) {
          try {
            const response =
              await voucherDocumentService.getDocumentsByVoucherId(voucherId);

            if (response.success && response.data) {
              const backendDocs = response.data.data || response.data;

              // Crear mapa passengerId -> passengerKey
              const passengerIdToKeyMap = {};
              allPassengers.forEach((p) => {
                passengerIdToKeyMap[p.id_pasajero] = p.passengerKey;
              });

              // Asignar documentos a los pasajeros correspondientes
              ["passports", "idCards", "otherDocuments"].forEach((category) => {
                if (Array.isArray(backendDocs[category])) {
                  backendDocs[category].forEach((doc) => {
                    // Construir passengerKey desde passengerId
                    const passengerKey = passengerIdToKeyMap[doc.passengerId];

                    if (
                      passengerKey &&
                      documentsByPassenger.has(passengerKey)
                    ) {
                      // Convertir proxy URL relativa a absoluta
                      const absoluteProxyUrl = makeProxyUrlAbsolute(
                        doc.proxyUrl,
                      );

                      // Transformar doc al formato que espera el componente
                      const transformedDoc = {
                        id: doc.id,
                        dbId: doc.id,
                        name: doc.filename,
                        filename: doc.filename,
                        tigrisUrl: doc.tigrisUrl,
                        dataUrl: absoluteProxyUrl,
                        proxyUrl: absoluteProxyUrl,
                        type: doc.fileType || "application/octet-stream",
                        size: doc.fileSize,
                        ownerId: doc.passengerId,
                        ownerName: doc.passengerName,
                        passengerKey: passengerKey,
                        documentoTipo: doc.documentoTipo,
                        uploadDate: doc.uploadedAt,
                        createdAt: doc.uploadedAt,
                        createdBy: doc.createdBy,
                        isFromDatabase: true,
                        category: category,
                      };

                      documentsByPassenger
                        .get(passengerKey)
                        [category].push(transformedDoc);
                    }
                  });
                }
              });
            } else {
              console.warn(
                " No se pudieron cargar documentos desde DB:",
                response.error,
              );
              // Continuar con el flujo normal usando documentData
            }
            // CRÍTICO: Marcar hash del documentData actual para que el segundo effect
            // no sobreescriba los datos cargados de la DB con datos que usan passengerKeys incompatibles
            if (documentData) {
              lastDocumentDataHashRef.current = JSON.stringify(documentData);
            }
          } catch (error) {
            console.error(" Error cargando documentos desde DB:", error);
            // Continuar con el flujo normal usando documentData
          }
        }
        // PRIORIDAD 2: Si NO hay documentos cargados de la DB, usar documentData (JSONB legacy)
        else if (documentData && Object.keys(documentData).length > 0) {
          // Process existing document data SOLO SI EXISTE
          await Promise.all(
            ["passports", "idCards", "otherDocuments"].map(async (category) => {
              if (Array.isArray(documentData[category])) {
                const processedDocs = documentData[category].map((doc) => {
                  if (!doc) return null;

                  // Usar proxy URL en lugar de presigned URL
                  let processedDoc = { ...doc };
                  if (doc.tigrisUrl && !doc.dataUrl) {
                    const proxyUrl = getProxyUrl(doc.tigrisUrl);
                    processedDoc.proxyUrl = proxyUrl;
                    processedDoc.dataUrl = proxyUrl;
                  } else if (doc.proxyUrl && !doc.dataUrl) {
                    // Convertir proxy URL relativa a absoluta
                    const absoluteProxyUrl = makeProxyUrlAbsolute(doc.proxyUrl);
                    processedDoc.proxyUrl = absoluteProxyUrl;
                    processedDoc.dataUrl = absoluteProxyUrl;
                  } else if (doc.dataUrl) {
                    // Ya tiene dataUrl, usarla directamente
                    processedDoc.dataUrl = doc.dataUrl;
                  }

                  return processedDoc;
                });

                // Ahora asignar los documentos procesados a los pasajeros
                processedDocs.forEach((processedDoc) => {
                  if (!processedDoc) return;

                  const ownerId =
                    processedDoc.ownerId || processedDoc.owner_id || null;
                  const passengerKey =
                    processedDoc.passengerKey ||
                    processedDoc.passenger_key ||
                    null;

                  let assignedToPassenger = false;

                  // Method 1: By passengerKey
                  if (passengerKey && documentsByPassenger.has(passengerKey)) {
                    documentsByPassenger.get(passengerKey)[category].push({
                      ...processedDoc,
                      id: processedDoc.id || `doc-${uuidv4()}`,
                      passengerKey: passengerKey,
                    });
                    assignedToPassenger = true;
                  }
                  // Method 2: By ownerId
                  else if (ownerId) {
                    const matchingPassenger = allPassengers.find(
                      (p) => String(p.id) === String(ownerId),
                    );

                    if (matchingPassenger) {
                      const targetKey = matchingPassenger.passengerKey;

                      documentsByPassenger.get(targetKey)[category].push({
                        ...processedDoc,
                        id: processedDoc.id || `doc-${uuidv4()}`,
                        passengerKey: targetKey,
                      });
                      assignedToPassenger = true;
                    }
                  }

                  // Method 3: By name/type match
                  if (
                    !assignedToPassenger &&
                    processedDoc.ownerType &&
                    processedDoc.ownerName
                  ) {
                    const matchingPassenger = allPassengers.find(
                      (p) =>
                        p.type === processedDoc.ownerType &&
                        `${p.nombres} ${p.apellidos}`.trim() ===
                          processedDoc.ownerName.trim(),
                    );

                    if (matchingPassenger) {
                      const targetKey = matchingPassenger.passengerKey;

                      documentsByPassenger.get(targetKey)[category].push({
                        ...processedDoc,
                        id: processedDoc.id || `doc-${uuidv4()}`,
                        passengerKey: targetKey,
                        ownerId: matchingPassenger.id,
                      });
                    }
                  }
                });
              }
            }),
          );
        }

        // Auto-select passenger with documents
        if (!selectedPassengerId) {
          for (const [key, docs] of documentsByPassenger.entries()) {
            const totalDocs =
              docs.passports.length +
              docs.idCards.length +
              docs.otherDocuments.length;
            if (totalDocs > 0) {
              setSelectedPassengerId(key);
              break;
            }
          }
        }

        // Initialize refs and state
        documentsMapRef.current = new Map(documentsByPassenger);
        setPassengerDocuments(new Map(documentsByPassenger));

        // Select first passenger if none selected
        if (allPassengers.length > 0 && !selectedPassengerId) {
          setSelectedPassengerId(allPassengers[0].passengerKey);
        }

        isInitializedRef.current = true;
      } catch (error) {
        console.error(" Error initializing documents:", error);
      }
    };

    // Ejecutar la inicialización asíncrona
    initializeDocuments();
  }, [voucherId, isEditMode, allPassengers]); // Re-ejecutar cuando cambian estos valores

  // NUEVO: Effect para procesar cambios en documentData DESPUÉS de la inicialización
  useEffect(() => {
    if (!isInitializedRef.current || !documentData) return;

    // Crear un hash de los documentos para detectar cambios reales
    const currentDocumentHash = JSON.stringify(documentData);
    if (currentDocumentHash === lastDocumentDataHashRef.current) {
      return; // No hay cambios, no hacer nada
    }

    lastDocumentDataHashRef.current = currentDocumentHash;

    // FIX: Eliminar validación que impedía actualizar cuando se borraba solo 1 documento
    // Ahora siempre se actualizará cuando haya cambios en documentData

    // Re-procesar documentos con la estructura correcta {passengerKey: {category: [docs]}}
    const documentsByPassenger = new Map();

    // Inicializar estructura vacía para cada pasajero
    allPassengers.forEach((passenger) => {
      documentsByPassenger.set(passenger.passengerKey, {
        passports: [],
        idCards: [],
        otherDocuments: [],
      });
    });

    // FIX: Iterar sobre passengerKeys (nivel superior de documentData)
    Object.keys(documentData).forEach((passengerKey) => {
      const passengerDocs = documentData[passengerKey];

      if (!passengerDocs || typeof passengerDocs !== "object") return;

      // Verificar si este passengerKey existe en nuestros pasajeros
      if (!documentsByPassenger.has(passengerKey)) {
        console.warn(
          ` PassengerKey ${passengerKey} no encontrado en allPassengers`,
        );
        return;
      }

      // Iterar sobre categorías dentro de cada pasajero
      ["passports", "idCards", "otherDocuments"].forEach((category) => {
        if (Array.isArray(passengerDocs[category])) {
          passengerDocs[category].forEach((doc) => {
            if (!doc) return;

            documentsByPassenger.get(passengerKey)[category].push({
              ...doc,
              id: doc.id || `doc-${uuidv4()}`,
              passengerKey: passengerKey,
            });
          });
        }
      });
    });

    documentsMapRef.current = documentsByPassenger;
    setPassengerDocuments(new Map(documentsByPassenger));
  }, [documentData, allPassengers]);

  // Handle file upload
  const handleFileUpload = useCallback(
    async (files) => {
      if (!selectedPassengerId) {
        showStatusMessage("error", "Por favor seleccione un pasajero primero");
        return;
      }

      const fileArray = Array.from(files);
      const passenger = allPassengers.find(
        (p) => p.passengerKey === selectedPassengerId,
      );

      if (!passenger) {
        showStatusMessage("error", "Pasajero no encontrado");
        return;
      }

      setUploadErrors([]);
      setUploadProgress(
        fileArray.map((file) => ({
          name: file.name,
          progress: 0,
        })),
      );

      const newDocuments = [];

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];

        // Simular progreso durante el upload
        const progressInterval = setInterval(() => {
          setUploadProgress((prev) =>
            prev.map((item, idx) =>
              idx === i
                ? { ...item, progress: Math.min(item.progress + 10, 90) }
                : item,
            ),
          );
        }, 200);

        try {
          if (!ACCEPTED_TYPES.includes(file.type)) {
            throw new Error(`Tipo de archivo no permitido: ${file.name}`);
          }

          // MAPEO DE CATEGORÍAS: activeCategory -> tipo para Tigris
          const categoryMap = {
            passports: "passports",
            idCards: "idCards",
            otherDocuments: "otherDocuments",
          };

          const tipoDocumento = categoryMap[activeCategory] || "otherDocuments";

          // NO SUBIR INMEDIATAMENTE - Solo preparar para subir después
          // Convertir archivo a base64 para preview temporal
          const reader = new FileReader();
          const base64Promise = new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const dataUrl = await base64Promise;

          clearInterval(progressInterval);
          setUploadProgress((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, progress: 100 } : item,
            ),
          );

          // ESTRUCTURA TEMPORAL (sin tigrisUrl aún)
          const document = {
            id: `doc-${selectedPassengerId}-${uuidv4()}`,
            name: file.name,
            filename: file.name,
            fileObject: file, // Guardar archivo para subirlo después
            dataUrl: dataUrl, // Base64 para preview inmediato
            type: file.type,
            size: file.size,
            uploadDate: new Date().toISOString(),
            ownerId: passenger.id,
            ownerName:
              `${passenger.nombres || ""} ${passenger.apellidos || ""}`.trim(),
            ownerType: passenger.type,
            passengerKey: selectedPassengerId,
            category: activeCategory,
            isPending: true, // Marca que aún no se subió a Tigris/DB
          };

          newDocuments.push(document);
        } catch (error) {
          clearInterval(progressInterval);
          console.error(` Error al subir ${file.name}:`, error);
          setUploadErrors((prev) => [
            ...prev,
            `Error procesando ${file.name}: ${error.message}`,
          ]);
        }
      }

      if (newDocuments.length > 0) {
        const currentDocs = documentsMapRef.current.get(
          selectedPassengerId,
        ) || {
          passports: [],
          idCards: [],
          otherDocuments: [],
        };

        const updatedPassengerDocs = {
          ...currentDocs,
          [activeCategory]: [...currentDocs[activeCategory], ...newDocuments],
        };

        documentsMapRef.current.set(selectedPassengerId, updatedPassengerDocs);

        setPassengerDocuments((prevMap) => {
          const newMap = new Map(prevMap);
          newMap.set(selectedPassengerId, updatedPassengerDocs);
          return newMap;
        });

        syncToParent();
        showStatusMessage(
          "success",
          `${newDocuments.length} documento(s) agregado(s). Se subirán al guardar el voucher.`,
        );
      }

      setTimeout(() => {
        setUploadProgress([]);
      }, 2000);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [
      selectedPassengerId,
      activeCategory,
      allPassengers,
      syncToParent,
      voucherId,
      voucherCode,
      uploadFile,
    ],
  );

  const showStatusMessage = (type, message) => {
    setStatusMessage({ type, message });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handlePassengerChange = useCallback((passengerKey) => {
    setSelectedPassengerId(passengerKey);
  }, []);

  /** Bridge: FileDropZone gives us pre-processed file objects; feed raw files into existing handler */
  const handleDropZoneFiles = useCallback(
    (pendingFiles) => {
      // Extract the raw File objects and pass them to existing handleFileUpload
      const rawFiles = pendingFiles.map((f) => f.fileObject).filter(Boolean);
      if (rawFiles.length > 0) handleFileUpload(rawFiles);
    },
    [handleFileUpload],
  );

  const handleDeleteDocument = useCallback(
    async (docId) => {
      if (!selectedPassengerId) return;

      if (window.confirm("¿Está seguro de eliminar este documento?")) {
        const currentDocs = documentsMapRef.current.get(selectedPassengerId);
        if (!currentDocs) return;

        // Encontrar el documento para saber si está en la base de datos
        const docToDelete = currentDocs[activeCategory]?.find(
          (doc) => doc.id === docId,
        );

        // SIEMPRE eliminar de la UI inmediatamente (optimistic)
        const updatedDocs = {
          ...currentDocs,
          [activeCategory]: currentDocs[activeCategory].filter(
            (doc) => doc.id !== docId,
          ),
        };

        documentsMapRef.current.set(selectedPassengerId, updatedDocs);
        setPassengerDocuments((prevMap) => {
          const newMap = new Map(prevMap);
          newMap.set(selectedPassengerId, { ...updatedDocs });
          return newMap;
        });

        // Prevent the documentData useEffect from overwriting this local change
        // by marking the current parent documentData hash as "already processed"
        // (syncToParent will update the parent shortly, but until then the old hash protects us)

        // Si el documento está en la base de datos, eliminarlo también de allí
        if (
          docToDelete &&
          (docToDelete.dbId || docToDelete.isFromDatabase) &&
          isEditMode
        ) {
          try {
            const deleteResponse = await voucherDocumentService.deleteDocument(
              docToDelete.dbId || docId,
            );

            if (!deleteResponse.success) {
              console.error(
                " Error eliminando documento de DB:",
                deleteResponse.error,
              );
              showStatusMessage(
                "warning",
                "El documento se eliminó de la vista pero puede haber un error en la base de datos",
              );
            }
          } catch (error) {
            console.error(" Error al eliminar documento de DB:", error);
            showStatusMessage(
              "warning",
              "El documento se eliminó de la vista pero puede haber un error en la base de datos",
            );
          }
        }

        syncToParent();
        showStatusMessage("success", "Documento eliminado correctamente");
      }
    },
    [
      selectedPassengerId,
      activeCategory,
      syncToParent,
      isEditMode,
      voucherId,
      allPassengers,
    ],
  );

  const handleShowPreview = useCallback((doc) => {
    setPreviewDocument(doc);
    setShowPreview(true);
  }, []);

  const handleClosePreview = useCallback(() => {
    setShowPreview(false);
    setTimeout(() => setPreviewDocument(null), 300);
  }, []);

  const getDocumentCount = useCallback((passengerKey, category) => {
    if (!passengerKey) return 0;

    const docs = documentsMapRef.current.get(passengerKey);
    if (!docs || !docs[category]) return 0;

    return docs[category].length;
  }, []);

  const getTotalDocumentCount = useCallback((passengerKey) => {
    if (!passengerKey) return 0;

    const docs = documentsMapRef.current.get(passengerKey);
    if (!docs) return 0;

    return (
      (docs.passports?.length || 0) +
      (docs.idCards?.length || 0) +
      (docs.otherDocuments?.length || 0)
    );
  }, []);

  const getSelectedPassengerDocuments = useCallback(() => {
    if (!selectedPassengerId) {
      return { passports: [], idCards: [], otherDocuments: [] };
    }

    const documents = documentsMapRef.current.get(selectedPassengerId) || {
      passports: [],
      idCards: [],
      otherDocuments: [],
    };

    return documents;
  }, [selectedPassengerId]);

  const getCategoryDisplayName = useCallback((category) => {
    switch (category) {
      case "passports":
        return "Pasaportes";
      case "idCards":
        return "Documentos de Identidad";
      case "otherDocuments":
        return "Otros Documentos";
      default:
        return category;
    }
  }, []);

  const renderDocumentPreview = useCallback(() => {
    if (!previewDocument) return null;

    const isImage = previewDocument.type?.startsWith("image/");
    const isPdf = previewDocument.type === "application/pdf";

    // Determinar URL del archivo
    // Prioridad: dataUrl (local) > getProxyUrl(tigrisUrl) (proxy público) > proxyUrl
    let fileUrl = null;
    if (previewDocument.dataUrl) {
      fileUrl = previewDocument.dataUrl;
    } else if (previewDocument.tigrisUrl) {
      fileUrl = getProxyUrl(previewDocument.tigrisUrl);
    } else if (previewDocument.proxyUrl) {
      fileUrl = previewDocument.proxyUrl;
    }

    if (!fileUrl) {
      console.warn(" No se encontró URL para preview:", previewDocument);
      return (
        <div className="preview-unsupported">
          <MdDescription className="unsupported-icon" />
          <p>No se puede previsualizar este archivo (URL no disponible).</p>
        </div>
      );
    }

    if (isImage) {
      return (
        <img
          src={fileUrl}
          alt={previewDocument.name}
          className="preview-image"
          onError={(e) => {
            console.error(" Error cargando imagen:", fileUrl);
            e.target.style.display = "none";
            const errorDiv = document.createElement("div");
            errorDiv.className = "image-error";
            errorDiv.textContent = " Error al cargar la imagen";
            e.target.parentElement.appendChild(errorDiv);
          }}
        />
      );
    } else if (isPdf) {
      return (
        <div className="pdf-container">
          <iframe
            src={fileUrl}
            title={previewDocument.name}
            className="preview-pdf"
            onError={(e) => {
              console.error(" Error cargando PDF:", fileUrl);
            }}
          />
          <div className="pdf-actions">
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="download-button"
            >
              <MdDownload /> Ver en nueva pestaña
            </a>
          </div>
        </div>
      );
    } else {
      return (
        <div className="preview-unsupported">
          <MdDescription className="unsupported-icon" />
          <p>No se puede previsualizar este tipo de archivo.</p>
          <a
            href={fileUrl}
            download={previewDocument.name}
            className="download-button"
          >
            <MdDownload /> Descargar
          </a>
        </div>
      );
    }
  }, [previewDocument]);

  // Final sync on unmount - NO DEPENDENCY ARRAY PARA EVITAR LOOPS
  useEffect(() => {
    return () => {
      if (
        isInitializedRef.current &&
        onDocumentDataChange &&
        documentsMapRef.current.size > 0
      ) {
        try {
          // CORREGIDO: Mantener estructura con passengerKey como top-level (igual que syncToParent)
          const outputDocumentData = {};

          documentsMapRef.current.forEach((passengerDocs, passengerKey) => {
            const passenger = allPassengers.find(
              (p) => p.passengerKey === passengerKey,
            );
            if (passenger) {
              // Inicializar entrada para este pasajero
              if (!outputDocumentData[passengerKey]) {
                outputDocumentData[passengerKey] = {
                  passports: [],
                  idCards: [],
                  otherDocuments: [],
                };
              }

              // Agregar documentos organizados por pasajero
              ["passports", "idCards", "otherDocuments"].forEach((category) => {
                if (Array.isArray(passengerDocs[category])) {
                  passengerDocs[category].forEach((doc) => {
                    outputDocumentData[passengerKey][category].push({
                      ...doc,
                      ownerId: passenger.id,
                      ownerName:
                        `${passenger.nombres} ${passenger.apellidos}`.trim(),
                      ownerType: passenger.type,
                      passengerKey: passengerKey,
                    });
                  });
                }
              });
            }
          });

          onDocumentDataChange(outputDocumentData);
        } catch (error) {
          // Silent error handling
        }
      }
    };
  }, []); // EMPTY dependency array

  const selectedPassengerDocuments = getSelectedPassengerDocuments();
  const selectedPassenger = allPassengers.find(
    (p) => p.passengerKey === selectedPassengerId,
  );

  return (
    <div className="passenger-documents">
      <div className="documents-header">
        <h2>Documentos de Pasajeros</h2>
        <p>
          Cargue y gestione los documentos de identificación para cada pasajero.
        </p>
      </div>

      <div className="document-panels">
        {/* Left panel: Passenger selection */}
        <div className="passengers-panel">
          <h3>Seleccione un Pasajero</h3>

          <div className="passenger-list">
            {allPassengers.map((passenger) => (
              <div
                key={passenger.passengerKey}
                className={`passenger-item ${passenger.type} ${selectedPassengerId === passenger.passengerKey ? "selected" : ""}`}
                onClick={() => handlePassengerChange(passenger.passengerKey)}
              >
                <div className="passenger-icon">
                  {passenger.type === "adult" ? <MdPerson /> : <MdChildCare />}
                </div>

                <div className="passenger-info">
                  <div className="passenger-name">
                    {passenger.nombres} {passenger.apellidos}
                  </div>
                  <div className="passenger-type">
                    {passenger.type === "adult"
                      ? "Adulto"
                      : `Niño (${passenger.edad} años)`}
                  </div>
                </div>

                <div className="document-counter">
                  {getTotalDocumentCount(passenger.passengerKey) > 0 && (
                    <span>{getTotalDocumentCount(passenger.passengerKey)}</span>
                  )}
                </div>

                {selectedPassengerId === passenger.passengerKey && (
                  <div className="active-indicator">
                    <MdArrowForward />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right panel: Document management for selected passenger */}
        <div className="documents-panel">
          {selectedPassenger ? (
            <>
              <div className="documents-panel-header">
                <h3>
                  Documentos de {selectedPassenger.nombres}{" "}
                  {selectedPassenger.apellidos}
                </h3>
              </div>

              {/* Document category tabs */}
              <div className="document-categories">
                <button
                  className={`category-tab ${activeCategory === "passports" ? "active" : ""}`}
                  onClick={() => setActiveCategory("passports")}
                >
                  <MdCardMembership className="category-icon" />
                  <span>Pasaportes</span>
                  {getDocumentCount(selectedPassengerId, "passports") > 0 && (
                    <span className="count-badge">
                      {getDocumentCount(selectedPassengerId, "passports")}
                    </span>
                  )}
                </button>

                <button
                  className={`category-tab ${activeCategory === "idCards" ? "active" : ""}`}
                  onClick={() => setActiveCategory("idCards")}
                >
                  <MdCreditCard className="category-icon" />
                  <span>Documentos de Identidad</span>
                  {getDocumentCount(selectedPassengerId, "idCards") > 0 && (
                    <span className="count-badge">
                      {getDocumentCount(selectedPassengerId, "idCards")}
                    </span>
                  )}
                </button>

                <button
                  className={`category-tab ${activeCategory === "otherDocuments" ? "active" : ""}`}
                  onClick={() => setActiveCategory("otherDocuments")}
                >
                  <MdLibraryBooks className="category-icon" />
                  <span>Otros Documentos</span>
                  {getDocumentCount(selectedPassengerId, "otherDocuments") >
                    0 && (
                    <span className="count-badge">
                      {getDocumentCount(selectedPassengerId, "otherDocuments")}
                    </span>
                  )}
                </button>
              </div>

              {/* Upload area */}
              <div className="document-upload-area-wrapper">
                <FileDropZone
                  files={[]}
                  onFilesAdded={handleDropZoneFiles}
                  accept=".jpg,.jpeg,.png,.pdf"
                  label={`Arrastra archivos de ${getCategoryDisplayName(activeCategory)} aquí`}
                  hint="Formatos permitidos: JPG, PNG, PDF"
                  inputId={`doc-upload-${activeCategory}`}
                />
              </div>

              {/* Upload progress */}
              {uploadProgress.length > 0 && (
                <div className="upload-progress">
                  {uploadProgress.map((item, index) => (
                    <div key={index} className="progress-item">
                      <div className="progress-info">
                        <span className="filename">{item.name}</span>
                        <span className="percent">{item.progress}%</span>
                      </div>
                      <div className="progress-bar-container">
                        <div
                          className="progress-bar"
                          style={{ width: `${item.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload errors */}
              {uploadErrors.length > 0 && (
                <div className="upload-errors">
                  {uploadErrors.map((error, index) => (
                    <div key={index} className="error-item">
                      <MdError />
                      <span>{error}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Documents list */}
              <div className="document-list">
                <h4>
                  {getCategoryDisplayName(activeCategory)} (
                  {selectedPassengerDocuments[activeCategory]?.length || 0})
                </h4>

                {selectedPassengerDocuments[activeCategory]?.length > 0 ? (
                  <div className="document-grid">
                    {selectedPassengerDocuments[activeCategory].map((doc) => (
                      <div key={doc.id} className="document-card">
                        <div
                          className="document-preview"
                          onClick={() => handleShowPreview(doc)}
                        >
                          {doc.type?.startsWith("image/") ? (
                            <img
                              src={
                                doc.dataUrl ||
                                doc.proxyUrl ||
                                (doc.tigrisUrl
                                  ? getProxyUrl(doc.tigrisUrl)
                                  : null)
                              }
                              alt={doc.name}
                              className="document-thumbnail"
                              onError={(e) => {
                                console.error(
                                  " Error cargando miniatura:",
                                  doc,
                                );
                                e.target.style.display = "none";
                                // Mostrar icono de error en lugar de imagen rota
                                const iconDiv = document.createElement("div");
                                iconDiv.className = "document-icon error";
                                iconDiv.innerHTML =
                                  "<span></span><span>Error</span>";
                                e.target.parentElement.appendChild(iconDiv);
                              }}
                            />
                          ) : doc.type === "application/pdf" ? (
                            <div className="document-icon pdf">
                              <MdDescription />
                              <span>PDF</span>
                            </div>
                          ) : (
                            <div className="document-icon file">
                              <MdOutlineFilePresent />
                              <span>Archivo</span>
                            </div>
                          )}
                        </div>

                        <div className="document-details">
                          <div className="document-name" title={doc.name}>
                            {doc.name}
                          </div>
                          <div className="document-meta">
                            <span>{Math.round((doc.size || 0) / 1024)} KB</span>
                            <span>•</span>
                            <span>
                              {new Date(
                                doc.uploadDate || Date.now(),
                              ).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <button
                          className="delete-button"
                          onClick={() => handleDeleteDocument(doc.id)}
                          title="Eliminar documento"
                        >
                          <MdClose />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-documents">
                    <MdDescription className="empty-icon" />
                    <p>
                      No hay{" "}
                      {getCategoryDisplayName(activeCategory).toLowerCase()}{" "}
                      subidos para este pasajero
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="no-passenger-selected">
              <MdWarning className="warning-icon" />
              <h3>Ningún pasajero seleccionado</h3>
              <p>
                Seleccione un pasajero del panel izquierdo para gestionar sus
                documentos
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Status message */}
      {statusMessage && (
        <div className={`status-message ${statusMessage.type}`}>
          {statusMessage.type === "success" ? <MdCheck /> : <MdError />}
          <span>{statusMessage.message}</span>
        </div>
      )}

      {/* Document preview modal */}
      {showPreview && (
        <div className="preview-modal-overlay" onClick={handleClosePreview}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="preview-header">
              <h3>{previewDocument?.name}</h3>
              <button className="close-preview" onClick={handleClosePreview}>
                <MdClose />
              </button>
            </div>
            <div className="preview-content">{renderDocumentPreview()}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PassengerDocuments;
