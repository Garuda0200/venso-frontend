import React, { useState, useEffect, useRef, useCallback } from "react";
import { MdClose, MdAttachFile, MdRefresh, MdSave } from "react-icons/md";
import { toast } from "react-toastify";
import { voucherVentaService } from "../../../services/voucherVentaService";
import pasajeroService from "../../../services/pasajeroService";
import voucherDocumentService from "../../../services/voucherDocumentService";
import useFileUpload from "../../../hooks/useFileUpload";
import { getTigrisPathForDocumentosVenta } from "../../../utils/tigrisPathHelper";
import { getProxyUrl } from "../../../services/presignedUrlService";
import PassengerDocuments from "../../../pages/Ventas/VouchersVenta/components/Steps/PassengerDocuments/PassengerDocuments";
import "./DocumentsManagerModal.scss";

/**
 * Modal standalone para gestión de documentos de pasajeros
 * Se puede usar desde cualquier parte de la aplicación con solo el ID del voucher
 */
const DocumentsManagerModal = ({
  isOpen,
  onClose,
  voucherId,
  voucherCode: initialVoucherCode = null,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [voucher, setVoucher] = useState(null);
  const [passengerData, setPassengerData] = useState({
    adults: [],
    children: [],
  });
  const [documentData, setDocumentData] = useState({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Refs
  const savingDocumentsRef = useRef(false);

  // Hook para subir archivos a Tigris
  const { uploadFile } = useFileUpload();

  // Cargar datos del voucher
  useEffect(() => {
    if (isOpen && voucherId) {
      loadVoucherData();
    }
  }, [isOpen, voucherId]);

  const loadVoucherData = async () => {
    setLoading(true);
    setError(null);
    setHasUnsavedChanges(false);

    try {
      // 1. Cargar datos básicos del voucher
      const voucherResponse =
        await voucherVentaService.getVoucherWithCotizacionById(voucherId);

      if (!voucherResponse.success || !voucherResponse.data) {
        setError("No se pudo cargar el voucher");
        setLoading(false);
        return;
      }

      const voucherData = voucherResponse.data;
      setVoucher(voucherData);

      // 2. Cargar pasajeros desde la tabla pasajero
      try {
        const passengersData =
          await pasajeroService.getPassengersByVoucherVenta(voucherId);
        console.log(" DocumentsManager - Pasajeros cargados:", passengersData);

        if (
          passengersData &&
          Array.isArray(passengersData) &&
          passengersData.length > 0
        ) {
          const parsedPassengerData = { adults: [], children: [] };

          passengersData.forEach((p) => {
            const passengerObj = {
              id_pasajero: p.id_pasajero,
              id: p.id_pasajero,
              firstName: p.nombres || "",
              lastName: p.apellidos || "",
              nombres: p.nombres || "",
              apellidos: p.apellidos || "",
              birthDate: p.fecha_nacimiento || "",
              documentNumber: p.numero_documento || "",
              documentType: p.tipo_documento || "DNI",
              nationality: p.nacionalidad || "",
              phone: p.telefono || "",
              email: p.correo || "",
            };

            if (p.tipo_pasajero === "adult") {
              parsedPassengerData.adults.push(passengerObj);
            } else if (p.tipo_pasajero === "child") {
              parsedPassengerData.children.push(passengerObj);
            }
          });

          setPassengerData(parsedPassengerData);
          console.log(
            " DocumentsManager - Pasajeros transformados:",
            parsedPassengerData,
          );
        } else {
          console.warn(" No se encontraron pasajeros para el voucher");
          setPassengerData({ adults: [], children: [] });
        }
      } catch (passengerErr) {
        console.error(" Error cargando pasajeros:", passengerErr);
        setPassengerData({ adults: [], children: [] });
      }

      // 3. Cargar documentos desde la tabla voucher_venta_documentos
      try {
        const docsResponse =
          await voucherDocumentService.getDocumentsByVoucherId(voucherId);
        console.log(" DocumentsManager - Documentos cargados:", docsResponse);

        if (docsResponse?.success && docsResponse?.data) {
          setDocumentData(docsResponse.data);
        } else {
          setDocumentData({});
        }
      } catch (docsErr) {
        console.error(" Error cargando documentos:", docsErr);
        setDocumentData({});
      }
    } catch (err) {
      console.error("Error cargando voucher:", err);
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Manejar cambios en documentos
  const handleDocumentDataChange = (newDocumentData) => {
    console.log(" DocumentsManager - Cambio en documentos:", newDocumentData);
    setDocumentData(newDocumentData);
    setHasUnsavedChanges(true);
  };

  // Función para guardar documentos (adaptada de VoucherModal)
  const saveVoucherDocuments = useCallback(async () => {
    if (!documentData || Object.keys(documentData).length === 0) {
      console.log(" No hay documentos para guardar");
      toast.info("No hay documentos para guardar");
      return;
    }

    if (savingDocumentsRef.current) {
      console.log(" Ya se están guardando documentos");
      return;
    }

    savingDocumentsRef.current = true;
    setSaving(true);

    const voucherCodeToUse = voucher?.voucher_code || initialVoucherCode;
    console.log(` Guardando documentos para voucher ${voucherId}`);

    try {
      // Crear mapa de passengerKey -> passenger data
      const passengerMap = {};
      if (passengerData?.adults) {
        passengerData.adults.forEach((adult, idx) => {
          const key = `adult-${idx}`;
          passengerMap[key] = adult;
        });
      }
      if (passengerData?.children) {
        passengerData.children.forEach((child, idx) => {
          const key = `child-${idx}`;
          passengerMap[key] = child;
        });
      }

      console.log(" Mapa de pasajeros:", Object.keys(passengerMap));

      let savedCount = 0;
      let errorCount = 0;

      // Iterar sobre cada pasajero en documentData
      for (const [passengerKey, passengerDocs] of Object.entries(
        documentData,
      )) {
        if (!passengerDocs || typeof passengerDocs !== "object") continue;

        const passengerInfo = passengerMap[passengerKey];
        if (!passengerInfo) {
          console.warn(` No se encontró pasajero para key: ${passengerKey}`);
          continue;
        }

        const passengerId = passengerInfo.id_pasajero;
        const passengerName =
          `${passengerInfo.nombres || passengerInfo.firstName || ""} ${passengerInfo.apellidos || passengerInfo.lastName || ""}`.trim();

        console.log(
          ` Procesando documentos para ${passengerKey}: ${passengerName} (ID: ${passengerId})`,
        );

        if (!passengerId) {
          console.warn(` Pasajero sin id_pasajero: ${passengerKey}`);
          continue;
        }

        // Iterar sobre cada categoría de documentos
        for (const [category, documents] of Object.entries(passengerDocs)) {
          if (!Array.isArray(documents)) continue;

          for (const doc of documents) {
            console.log(` Procesando documento:`, {
              name: doc.name,
              isPending: doc.isPending,
              hasFileObject: !!doc.fileObject,
              hasTigrisUrl: !!doc.tigrisUrl,
              hasDbId: !!doc.dbId,
              isFromDatabase: doc.isFromDatabase,
            });

            // Si el documento está pendiente, subirlo a Tigris primero
            if (doc.isPending && doc.fileObject) {
              console.log(` Subiendo documento pendiente: ${doc.name}`);

              try {
                const categoryMap = {
                  passports: "passports",
                  idCards: "idCards",
                  otherDocuments: "otherDocuments",
                };
                const tipoDocumento = categoryMap[category] || "otherDocuments";
                const tigrisFolder = getTigrisPathForDocumentosVenta(
                  voucherId,
                  voucherCodeToUse,
                  tipoDocumento,
                );

                const uploadResult = await uploadFile(
                  doc.fileObject,
                  tigrisFolder,
                );

                doc.tigrisUrl = uploadResult.tigrisUrl;
                doc.filename = uploadResult.metadata.originalName;
                doc.uploaded_at =
                  uploadResult.metadata.uploadedAt || new Date().toISOString();

                // Usar proxy URL
                doc.proxyUrl = getProxyUrl(uploadResult.tigrisUrl);

                delete doc.isPending;
                delete doc.fileObject;

                console.log(
                  ` Documento subido a Tigris: ${uploadResult.tigrisUrl}`,
                );
              } catch (uploadErr) {
                console.error(
                  ` Error subiendo documento: ${doc.name}`,
                  uploadErr,
                );
                errorCount++;
                continue;
              }
            }

            // Guardar en DB si tiene tigrisUrl y no está guardado aún
            if (doc.tigrisUrl && !doc.dbId && !doc.isFromDatabase) {
              try {
                const documentPayload =
                  voucherDocumentService.convertFrontendToBackend(
                    doc,
                    voucherCodeToUse,
                    passengerId,
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
                  errorCount++;
                }
              } catch (docErr) {
                console.error(
                  ` Error al guardar documento ${doc.name}:`,
                  docErr,
                );
                errorCount++;
              }
            }
          }
        }
      }

      console.log(" Proceso de guardado completado");

      // No cerrar ni limpiar el estado si algún archivo falló: así los documentos
      // pendientes conservan su File y pueden reintentarse sin volver a elegirlos.
      if (errorCount > 0) {
        setHasUnsavedChanges(true);
        toast.error(
          `No se guardaron ${errorCount} documento(s). El modal permanecerá abierto para reintentar.`,
        );
      } else if (savedCount > 0) {
        toast.success(`${savedCount} documento(s) guardado(s) correctamente`);
        setHasUnsavedChanges(false);
        // Cerrar modal después de guardar exitosamente
        savingDocumentsRef.current = false;
        setSaving(false);
        onClose();
        return;
      } else {
        toast.info("No hay documentos nuevos para guardar");
        // También cerrar si no había nada que guardar
        savingDocumentsRef.current = false;
        setSaving(false);
        onClose();
        return;
      }
    } catch (err) {
      console.error(" Error general al guardar documentos:", err);
      toast.error("Error al guardar documentos");
    } finally {
      savingDocumentsRef.current = false;
      setSaving(false);
    }
  }, [
    documentData,
    passengerData,
    voucher,
    voucherId,
    initialVoucherCode,
    uploadFile,
    onClose,
  ]);

  // Manejar cierre del modal
  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (
        window.confirm("Hay cambios sin guardar. ¿Desea cerrar de todos modos?")
      ) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  const displayVoucherCode =
    voucher?.voucher_code || initialVoucherCode || "Sin código";
  const hasPassengers =
    passengerData.adults.length > 0 || passengerData.children.length > 0;

  return (
    <div className="documents-manager-modal-overlay" onClick={handleClose}>
      <div
        className="documents-manager-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="header-title">
            <MdAttachFile className="header-icon" />
            <div className="title-info">
              <h2>Gestión de Documentos</h2>
              <span className="voucher-code">
                Voucher: {displayVoucherCode}
              </span>
            </div>
          </div>
          <div className="header-actions">
            <button
              className="btn-refresh"
              onClick={loadVoucherData}
              disabled={loading || saving}
              title="Recargar datos"
            >
              <MdRefresh className={loading ? "spinning" : ""} />
            </button>
            <button className="btn-close" onClick={handleClose}>
              <MdClose />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="modal-content">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Cargando datos del voucher...</p>
            </div>
          ) : error ? (
            <div className="error-state">
              <p>{error}</p>
              <button onClick={loadVoucherData}>Reintentar</button>
            </div>
          ) : !hasPassengers ? (
            <div className="empty-state">
              <MdAttachFile className="empty-icon" />
              <p>No hay pasajeros registrados en este voucher</p>
              <span className="empty-hint">
                Los pasajeros deben ser agregados desde el módulo de Vouchers de
                Venta
              </span>
            </div>
          ) : (
            <div className="documents-container">
              <PassengerDocuments
                passengerData={passengerData}
                documentData={documentData}
                onDocumentDataChange={handleDocumentDataChange}
                isEditMode={true}
                voucherId={voucherId}
                voucherCode={voucher?.voucher_code}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            className="btn-cancel"
            onClick={handleClose}
            disabled={saving}
          >
            Cancelar
          </button>
          {hasPassengers && (
            <button
              className="btn-save"
              onClick={saveVoucherDocuments}
              disabled={loading || saving}
            >
              <MdSave />
              {saving ? "Guardando..." : "Guardar Documentos"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentsManagerModal;
