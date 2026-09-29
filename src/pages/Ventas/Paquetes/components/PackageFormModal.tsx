import { useState, useMemo, useCallback } from "react";
import {
  MdClose,
  MdSave,
  MdEditCalendar,
  MdLock,
  MdPublic,
  MdStar,
  MdStarOutline,
} from "react-icons/md";
import FileDropZone from "../../../../components/common/FileDropZone/FileDropZone";
import { useFileUpload } from "../../../../hooks/useFileUpload";
import { getProxyUrl } from "../../../../services/presignedUrlService";
import "./PackageFormModal.scss";

const PackageFormModal = ({
  show,
  modalType,
  packageForm,
  currentPaquete,
  loading,
  onInputChange,
  onToggleDestacado,
  onOpenDirectItinerary,
  onSubmit,
  onClose,
}) => {
  const { uploadFile, isUploading, uploadProgress } = useFileUpload();
  const [imageUploadError, setImageUploadError] = useState("");

  // Build files array for FileDropZone from packageForm.imagen
  const imageFiles = useMemo(() => {
    if (!packageForm.imagen) return [];
    return [
      {
        id: "pkg-img",
        filename: "imagen-paquete",
        file_type: "image",
        tigris_url: packageForm.imagen,
        proxyUrl: getProxyUrl(packageForm.imagen),
      },
    ];
  }, [packageForm.imagen]);

  const handleImageAdded = useCallback(
    async (newFiles) => {
      if (!newFiles.length) return;
      const file = newFiles[0];
      try {
        const result = await uploadFile(file.fileObject, "paquetes");
        setImageUploadError("");
        // Simulate input change to update parent form state
        onInputChange({ target: { name: "imagen", value: result.tigrisUrl } });
      } catch (err) {
        console.error("Error uploading package image:", err);
        setImageUploadError(
          err?.message ||
            "No se pudo subir la imagen. Revisa el almacenamiento e inténtalo otra vez.",
        );
      }
    },
    [uploadFile, onInputChange],
  );

  const handleImageRemove = useCallback(() => {
    setImageUploadError("");
    onInputChange({ target: { name: "imagen", value: "" } });
  }, [onInputChange]);

  if (!show) return null;

  return (
    <div className="paq__overlay">
      <div
        className="paq__modal paq__modal--form"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="paq__modal-head">
          <h2>{modalType === "create" ? "Nuevo paquete" : "Editar paquete"}</h2>
          <button className="paq__modal-close" onClick={onClose}>
            <MdClose />
          </button>
        </div>
        <div className="paq__modal-body">
          <form onSubmit={onSubmit}>
            <div className="paq__field">
              <label htmlFor="nombre">Nombre *</label>
              <input
                type="text"
                id="nombre"
                name="nombre"
                value={packageForm.nombre}
                onChange={onInputChange}
                required
                placeholder="Ej. Tour Valle Sagrado"
              />
            </div>

            <div className="paq__field">
              <label htmlFor="descripcion">Descripción</label>
              <textarea
                id="descripcion"
                name="descripcion"
                value={packageForm.descripcion}
                onChange={onInputChange}
                placeholder="Descripción del paquete"
                rows={3}
              />
            </div>

            <div className="paq__field">
              <label htmlFor="fee">Fee del paquete (%)</label>
              <input
                type="number"
                id="fee"
                name="fee"
                min="0"
                max="100"
                step="0.1"
                value={packageForm.fee ?? ""}
                onChange={onInputChange}
                placeholder="Vacío = fee normal de la cotización"
              />
              <small className="paq__field-hint">
                Opcional. Puede ser menor a 25% para campañas promocionales.
              </small>
            </div>

            <div className="paq__field-row">
              <div className="paq__field">
                <label htmlFor="packagetype">Tipo</label>
                <select
                  id="packagetype"
                  name="packagetype"
                  value={packageForm.packagetype}
                  onChange={onInputChange}
                >
                  <option value="compartido">Compartido</option>
                  <option value="privado">Privado</option>
                </select>
              </div>
              <div className="paq__field">
                <label>Destacado</label>
                <button
                  type="button"
                  className={`paq__toggle-featured${packageForm.destacado ? " active" : ""}`}
                  onClick={onToggleDestacado}
                >
                  {packageForm.destacado ? <MdStar /> : <MdStarOutline />}
                  <span>{packageForm.destacado ? "Destacado" : "Normal"}</span>
                </button>
              </div>
            </div>

            <div className="paq__field">
              <label>Visibilidad</label>
              <button
                type="button"
                className={`paq__visibility-switch${packageForm.es_general ? " active" : ""}`}
                onClick={() =>
                  onInputChange({
                    target: {
                      name: "es_general",
                      type: "checkbox",
                      checked: !packageForm.es_general,
                    },
                  })
                }
                aria-pressed={Boolean(packageForm.es_general)}
              >
                <span className="paq__visibility-icon">
                  {packageForm.es_general ? <MdPublic /> : <MdLock />}
                </span>
                <span className="paq__visibility-copy">
                  <strong>
                    {packageForm.es_general
                      ? "Disponible para todos"
                      : "Solo para mi usuario"}
                  </strong>
                  <small>
                    {packageForm.es_general
                      ? "Todos los usuarios con acceso a paquetes podrán verlo."
                      : "Solo tu cuenta y superadmin lo verán en el listado."}
                  </small>
                </span>
                <span className="paq__visibility-knob" aria-hidden="true" />
              </button>
            </div>

            <div className="paq__field">
              <label>Imagen del paquete</label>
              <FileDropZone
                files={imageFiles}
                onFilesAdded={handleImageAdded}
                onFileRemove={handleImageRemove}
                disabled={isUploading}
                isUploading={isUploading}
                uploadProgress={uploadProgress}
                accept="image/*"
                maxSizeMB={5}
                label="Arrastra una imagen o haz clic"
                hint="JPG, PNG o WebP (máx. 5 MB)"
                inputId="paq-imagen"
              />
              {imageUploadError && (
                <small className="paq__field-hint" role="alert">
                  {imageUploadError}
                </small>
              )}
            </div>

            {modalType === "create" && (
              <div className="paq__field">
                <label>Itinerario</label>
                <button
                  type="button"
                  className="paq__btn--itinerary"
                  onClick={onOpenDirectItinerary}
                >
                  <MdEditCalendar /> Configurar Itinerario
                </button>
                {packageForm._tempItinerary &&
                  packageForm._tempItinerary.length > 0 && (
                    <span className="paq__itinerary-badge">
                      {packageForm._tempItinerary.length} día
                      {packageForm._tempItinerary.length !== 1 ? "s" : ""}
                    </span>
                  )}
              </div>
            )}

            {modalType === "edit" && currentPaquete?.itinerario?.length > 0 && (
              <div className="paq__info-box">
                <MdEditCalendar />
                <span>
                  {currentPaquete.itinerario.length} día
                  {currentPaquete.itinerario.length !== 1 ? "s" : ""}{" "}
                  configurados — edite el itinerario desde la tarjeta del
                  paquete.
                </span>
              </div>
            )}

            <div className="paq__modal-actions">
              <button
                type="button"
                className="paq__btn--ghost"
                onClick={onClose}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="paq__btn--primary"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="paq__spinner--sm" />{" "}
                    {modalType === "create" ? "Creando..." : "Guardando..."}
                  </>
                ) : (
                  <>
                    <MdSave /> {modalType === "create" ? "Crear" : "Guardar"}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PackageFormModal;
