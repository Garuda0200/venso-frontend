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
  MdArrowForward,
} from "react-icons/md";
import {
  getProxyUrl,
  makeProxyUrlAbsolute,
} from "../../../../../../services/presignedUrlService";
import voucherDocumentService from "../../../../../../services/voucherDocumentService"; // Servicio para documentos relacionales
import FileDropZone from "../../../../../../components/common/FileDropZone/FileDropZone";
import ImagePreviewModal from "../../../../../../components/Contabilidad/shared/ImagePreviewModal";
import "./PassengerDocuments.scss";
import { v4 as uuidv4 } from "uuid";
import { hydrateDocumentDraft, reconcileDocumentListing } from "./documentListing";
import { getDocumentPreviewUrl, getDocumentFilename, getDocumentMimeType } from "./documentPreview";
import DocumentDeletePopover from "./DocumentDeletePopover";
import { canDeletePassengerDocument } from "./documentPermissions";
import PassengerIdentityModal from "./PassengerIdentityModal";
import { isDocumentAiUiEnabled } from "./documentAiUi";

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
  voucherId = null, // ID del voucher para jerarquía en Tigris
  cotizacionId = null,
  hasUnsavedPassengers = false,
  onIdentityApplied,
  onPersistDocuments,
  onPreparingChange,
  onDocumentsAdded,
  documentsSaving = false,
}: any) => {
  // Local working view; the parent owns the draft across step unmounts.
  const documentsMapRef = useRef(new Map());
  const scopeEpochRef = useRef(0);
  const deletedIdsRef = useRef(new Set());
  const preparingFilesRef = useRef(0);
  const activeReadersRef = useRef(new Set());

  // Document management state
  const [passengerDocuments, setPassengerDocuments] = useState(new Map());
  const [unassignedDocuments, setUnassignedDocuments] = useState([]);

  // Selected passenger state
  const [selectedPassengerId, setSelectedPassengerId] = useState(null);
  const [activeCategory, setActiveCategory] = useState("passports");

  // UI states
  const [uploadProgress, setUploadProgress] = useState([]);
  const [uploadErrors, setUploadErrors] = useState([]);
  const [statusMessage, setStatusMessage] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [deletingDocument, setDeletingDocument] = useState(false);
  const deleteInFlightRef = useRef(false);

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

  // Synchronize immediately: save/next must see the file just selected.
  const syncToParent = useCallback(() => {
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
                  ownerId: passenger.id_pasajero || passenger.id,
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
      }
  }, [allPassengers, onDocumentDataChange]);

  // Restore the parent's canonical draft synchronously, in creation and editing.
  // Do not wait for a database request before interpreting passenger-keyed data.
  useEffect(() => {
    scopeEpochRef.current += 1;
    deletedIdsRef.current = new Set();
    preparingFilesRef.current = 0;
    setUnassignedDocuments([]);
    setDeleteConfirmation(null);
    setDeletingDocument(false);
    deleteInFlightRef.current = false;
    return () => {
      scopeEpochRef.current += 1;
      for (const reader of activeReadersRef.current) reader.abort?.();
      activeReadersRef.current.clear();
      onPreparingChange?.(false);
    };
  }, [voucherId, cotizacionId, onPreparingChange]);

  useEffect(() => { setDeleteConfirmation(null); }, [activeCategory, selectedPassengerId]);

  useEffect(() => {
    const restored = hydrateDocumentDraft(allPassengers, documentData, makeProxyUrlAbsolute, getProxyUrl);
    documentsMapRef.current = restored;
    setPassengerDocuments(restored);
    setSelectedPassengerId(previous => restored.has(previous) ? previous
      : [...restored].find(([, groups]) => Object.values(groups).some(docs => docs.length))?.[0]
        || allPassengers[0]?.passengerKey || null);
  }, [documentData, allPassengers, voucherId, cotizacionId]);

  // A persisted draft is also a real voucher. Reload its saved/unassigned files
  // even when the wizard still has isEditMode=false. Ignore old-file responses.
  const rosterSignature = allPassengers.map(passenger => `${passenger.passengerKey}:${passenger.id_pasajero ?? passenger.id ?? ''}`).join('|');
  const latestSyncRef = useRef(syncToParent);
  latestSyncRef.current = syncToParent;
  useEffect(() => {
    if (!voucherId || !allPassengers.length) return;
    let cancelled = false;
    const epoch = scopeEpochRef.current;
    const reload = async () => {
      try {
        const response = await voucherDocumentService.getDocumentsByVoucherId(voucherId, { _skipDedup: true });
        if (cancelled || epoch !== scopeEpochRef.current) return;
        if (!response.success) throw new Error('Document listing unavailable');
        const next = reconcileDocumentListing(allPassengers, documentsMapRef.current, response, makeProxyUrlAbsolute, {
          preserveSaved: true, excludedIds: deletedIdsRef.current,
        });
        documentsMapRef.current = next.documents;
        setPassengerDocuments(next.documents);
        setUnassignedDocuments(next.unassigned);
        latestSyncRef.current();
      } catch {
        if (!cancelled && epoch === scopeEpochRef.current) {
          setStatusMessage({ type: 'warning', message: 'No se pudo actualizar la lista guardada. Los documentos de esta sesión se conservan; vuelve a abrir Documentos para reintentar.' });
        }
      }
    };
    reload();
    return () => { cancelled = true; };
  }, [voucherId, cotizacionId, rosterSignature]);

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
      const epoch = scopeEpochRef.current;
      preparingFilesRef.current += 1;
      onPreparingChange?.(true);

      try {
        for (let i = 0; i < fileArray.length; i++) {
          const file = fileArray[i];

          // Simular progreso durante el upload
          const progressInterval = setInterval(() => {
            if (epoch !== scopeEpochRef.current) return;
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

            // Prepare a local preview once; the parent persists the batch below.
            const reader = new FileReader();
            const base64Promise = new Promise((resolve, reject) => {
              activeReadersRef.current.add(reader);
              reader.onload = () => {
                activeReadersRef.current.delete(reader);
                resolve(reader.result);
              };
              reader.onerror = reader.onabort = () => {
                activeReadersRef.current.delete(reader);
                reject(new Error("No se pudo leer el archivo seleccionado"));
              };
              reader.readAsDataURL(file);
            });

            const dataUrl = await base64Promise;

            clearInterval(progressInterval);
            if (epoch !== scopeEpochRef.current) return;
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
              fileObject: file, // Keep until storage and DB both confirm the save.
              dataUrl: dataUrl, // Base64 para preview inmediato
              type: file.type,
              size: file.size,
              uploadDate: new Date().toISOString(),
              ownerId: passenger.id_pasajero || passenger.id,
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
            if (epoch !== scopeEpochRef.current) return;
            console.error("No se pudo subir un documento; nombre y detalles omitidos");
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
          onDocumentsAdded?.();
          showStatusMessage(
            "success",
            onDocumentsAdded ? "Archivos preparados. Guardando los documentos en el file..." : "Documentos preparados; pendientes de guardar.",
          );
        }

        setTimeout(() => {
          if (epoch === scopeEpochRef.current) setUploadProgress([]);
        }, 2000);
      } finally {
        if (epoch === scopeEpochRef.current) {
          preparingFilesRef.current -= 1;
          onPreparingChange?.(preparingFilesRef.current > 0);
        }
      }
    },
    [
      onPreparingChange,
      onDocumentsAdded,
      selectedPassengerId,
      activeCategory,
      allPassengers,
      syncToParent,
    ],
  );

  const showStatusMessage = (type, message) => {
    const epoch = scopeEpochRef.current;
    setStatusMessage({ type, message });
    setTimeout(() => {
      if (epoch === scopeEpochRef.current) setStatusMessage(null);
    }, 3000);
  };

  const handlePassengerChange = useCallback((passengerKey) => {
    if (deleteInFlightRef.current) return;
    setDeleteConfirmation(null);
    setSelectedPassengerId(passengerKey);
  }, []);

  const handleDeleteDocument = useCallback(
    async (docId) => {
      if (!selectedPassengerId) return;
      const protectedDoc = documentsMapRef.current.get(selectedPassengerId)?.[activeCategory]?.find(doc => doc.id === docId);
      if (protectedDoc?.documentAssetId) {
        showStatusMessage("warning", "El documento privado se conserva como evidencia. Su eliminación se gestiona mediante la retención documental.");
        return;
      }
      if (!canDeletePassengerDocument(protectedDoc)) {
        showStatusMessage("warning", "No tienes permiso para eliminar este documento.");
        return;
      }

      if (deleteInFlightRef.current || documentsSaving) return;
      deleteInFlightRef.current = true;
      setDeletingDocument(true);
      const deleteEpoch = scopeEpochRef.current;
      preparingFilesRef.current += 1;
      onPreparingChange?.(true);
      try {
        const currentDocs = documentsMapRef.current.get(selectedPassengerId);
        if (!currentDocs) return;

        // Encontrar el documento para saber si está en la base de datos
        const docToDelete = currentDocs[activeCategory]?.find(
          (doc) => doc.id === docId,
        );

        // A new voucher also has saved files: confirm deletion before hiding it.
        const epoch = scopeEpochRef.current;
        const savedId = docToDelete?.dbId || (docToDelete?.isFromDatabase ? docId : null);
        if (savedId && voucherId) {
          try {
            const response = await voucherDocumentService.deleteDocument(savedId);
            if (epoch !== scopeEpochRef.current) return;
            if (!response.success) throw new Error("Document deletion unavailable");
          } catch {
            if (epoch === scopeEpochRef.current) showStatusMessage("error", "No se pudo eliminar el documento. Se conserva en la lista para reintentar.");
            return;
          }
          deletedIdsRef.current.add(String(savedId));
        }
        const latestDocs = documentsMapRef.current.get(selectedPassengerId);
        if (!latestDocs) return;
        const updatedDocs = {
          ...latestDocs,
          [activeCategory]: latestDocs[activeCategory].filter(doc => doc.id !== docId),
        };
        documentsMapRef.current.set(selectedPassengerId, updatedDocs);
        setPassengerDocuments(new Map(documentsMapRef.current));

        syncToParent();
        setDeleteConfirmation(null);
        showStatusMessage("success", "Documento eliminado correctamente");
      } finally {
        if (deleteEpoch === scopeEpochRef.current) {
          deleteInFlightRef.current = false;
          setDeletingDocument(false);
          preparingFilesRef.current -= 1;
          onPreparingChange?.(preparingFilesRef.current > 0);
        }
      }
    },
    [
      selectedPassengerId,
      activeCategory,
      syncToParent,
      voucherId,
      allPassengers,
      documentsSaving,
      onPreparingChange,
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



  const selectedPassengerDocuments = getSelectedPassengerDocuments();
  const selectedPassenger = allPassengers.find(
    (p) => p.passengerKey === selectedPassengerId,
  );

  return (
    <div className="passenger-documents">
      {isDocumentAiUiEnabled(import.meta.env) && <PassengerIdentityModal
        key={`${cotizacionId}:${voucherId}`}
        cotizacionId={cotizacionId} voucherId={voucherId} passengerData={passengerData}
        documentMap={passengerDocuments} unassignedDocuments={unassignedDocuments}
        hasUnsavedPassengers={hasUnsavedPassengers} onIdentityApplied={onIdentityApplied}
        onUnassignedDocumentsChange={setUnassignedDocuments}
        onDocumentsReload={(listing) => {
          const next = reconcileDocumentListing(allPassengers, documentsMapRef.current, listing, makeProxyUrlAbsolute);
          documentsMapRef.current = next.documents;
          setPassengerDocuments(next.documents);
          setUnassignedDocuments(next.unassigned || []);
          syncToParent();
        }}
        onPersistDocuments={onPersistDocuments} documentsSaving={documentsSaving}
      />}
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
                  onRawFilesAdded={handleFileUpload}
                  disabled={deletingDocument}
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
                                console.error("Miniatura no disponible; referencia documental omitida");
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
                          <small className="document-save-state" role="status">
                            {doc.isPending ? (documentsSaving ? "Guardando..." : "Pendiente de guardar") : "Guardado en el file"}
                          </small>
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

                        {canDeletePassengerDocument(doc) && <button
                          className="delete-button"
                          onClick={event => setDeleteConfirmation({ id: doc.id, anchor: event.currentTarget })}
                          disabled={!!doc.documentAssetId || documentsSaving || deletingDocument}
                          aria-haspopup="dialog"
                          aria-expanded={deleteConfirmation?.id === doc.id}
                          title={doc.documentAssetId ? "Documento privado protegido por retención" : "Eliminar documento"}
                        >
                          <MdClose />
                        </button>}
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
      {onDocumentsAdded && !documentsSaving && [...passengerDocuments.values()].some(groups =>
        Object.values(groups).some(docs => docs.some(doc => doc.isPending))) && (
        <button type="button" className="document-retry-button" onClick={onDocumentsAdded}>
          Reintentar guardar documentos pendientes
        </button>
      )}
      {deleteConfirmation && <DocumentDeletePopover anchor={deleteConfirmation.anchor}
        busy={deletingDocument} onCancel={() => setDeleteConfirmation(null)}
        onConfirm={() => handleDeleteDocument(deleteConfirmation.id)} />}
      {statusMessage && (
        <div className={`status-message ${statusMessage.type}`}>
          {statusMessage.type === "success" ? <MdCheck /> : <MdError />}
          <span>{statusMessage.message}</span>
        </div>
      )}

      {/* Vista previa segura para imágenes y PDF. El PDF se convierte a Blob
          antes de insertarlo para evitar bloqueos frame-ancestors/CSP. */}
      {showPreview && previewDocument && (
        <ImagePreviewModal
          isOpen={showPreview}
          onClose={handleClosePreview}
          fileUrl={getDocumentPreviewUrl(previewDocument)}
          filename={getDocumentFilename(previewDocument)}
          fileType={getDocumentMimeType(previewDocument)}
        />
      )}
    </div>
  );
};

export default PassengerDocuments;
