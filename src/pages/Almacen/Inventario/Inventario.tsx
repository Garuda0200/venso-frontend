import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MdAddPhotoAlternate,
  MdCheckCircle,
  MdClose,
  MdDriveFileMove,
  MdEdit,
  MdFolder,
  MdImageSearch,
  MdRefresh,
  MdRestore,
  MdSave,
  MdSearch,
  MdUploadFile,
  MdVisibility,
  MdVisibilityOff,
} from "react-icons/md";
import BulkSelectionBar from "../../../components/common/BulkSelectionBar";
import CategoryCombobox from "../../../components/common/CategoryCombobox";
import { useAuth } from "../../../context/AuthContext";
import useBulkSelection from "../../../hooks/useBulkSelection";
import CategoryChipBar from "./CategoryChipBar";
import mediaService from "../../../services/mediaService";
import { canonicalCategory, mergeCategoryOptions } from "../../../utils/categoryOptions";
import "./Inventario.scss";

const DEFAULT_CATEGORY = "General";
const MAX_BATCH_FILES = 50;
// Tipo MIME propio para arrastrar imágenes de la biblioteca entre categorías.
const MEDIA_DRAG_TYPE = "application/x-venso-media";

const hasDragType = (event, type) => Array.from(event.dataTransfer?.types || []).includes(type);
// "move": imágenes de la biblioteca; "files": archivos desde el escritorio.
const dragKind = (event) =>
  hasDragType(event, MEDIA_DRAG_TYPE) ? "move" : hasDragType(event, "Files") ? "files" : null;

const parseDraggedIds = (data) => {
  try {
    const ids = JSON.parse(data);
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
};

const formatBytes = (bytes = 0) => {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let size = Number(bytes);
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
};

const fileBaseName = (file) =>
  file?.name?.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "";

const createClientId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `media-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function CategorySelector({
  label,
  value,
  categories,
  onChange,
  disabled = false,
  commitMode = false,
  hint = "",
}) {
  return (
    <div className="media-category-field">
      <div className="media-category-field__head">
        <span>{label}</span>
      </div>
      <fieldset className="media-category-field__control" disabled={disabled}>
        <CategoryCombobox
          value={value}
          onChange={onChange}
          options={categories}
          commitMode={commitMode}
          placeholder="Ej. Valle Sagrado / Pisac"
        />
      </fieldset>
      {hint && <small className="media-category-field__hint">{hint}</small>}
    </div>
  );
}

const getAssetId = (asset) => asset.id;
const getUploadId = (item) => item.clientId;

export function Inventario() {
  const { getCurrentUser } = useAuth();
  const currentUser = getCurrentUser();
  const canManage = [0, 5].includes(Number(currentUser?.role));

  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [uploadItems, setUploadItems] = useState([]);
  const [defaultCategory, setDefaultCategory] = useState(DEFAULT_CATEGORY);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("active");
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // Diálogo "Cambiar categoría" para la selección de la biblioteca o del lote.
  const [moveDialog, setMoveDialog] = useState(null);
  const [confirmBulkDeactivate, setConfirmBulkDeactivate] = useState(false);
  // Zona de la biblioteca bajo el cursor: { key, kind }.
  const [dropOver, setDropOver] = useState(null);
  const [dragCount, setDragCount] = useState(0);
  // Contenido soltado en "Nueva categoría" a la espera de nombre: { ids } o { files }.
  const [newCategoryDrop, setNewCategoryDrop] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const uploadItemsRef = useRef([]);
  const selection = useBulkSelection(getAssetId);
  const uploadSelection = useBulkSelection(getUploadId);
  const { sync: syncSelection } = selection;

  // Las imágenes del lote sin categoría propia (`category: null`) heredan la
  // categoría del lote.
  const effectiveCategory = (item) => item.category ?? defaultCategory;

  // Las categorías salen de la propia biblioteca (incluye inactivas) y del lote
  // en curso, para que una categoría nueva se sugiera en todos los campos.
  const categories = useMemo(
    () =>
      mergeCategoryOptions(
        [DEFAULT_CATEGORY],
        assets.map((asset) => asset.category),
        [defaultCategory],
        uploadItems.map((item) => item.category),
      ),
    [assets, defaultCategory, uploadItems],
  );
  const resolveCategory = (value) =>
    canonicalCategory(value, categories) || DEFAULT_CATEGORY;

  const libraryCategories = useMemo(
    () => mergeCategoryOptions(assets.map((asset) => asset.category || DEFAULT_CATEGORY)),
    [assets],
  );

  const matchesStatusAndQuery = useCallback(
    (asset) => {
      if (status === "active" && !asset.isActive) return false;
      if (status === "inactive" && asset.isActive) return false;
      const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
      if (!tokens.length) return true;
      const haystack = [asset.title, asset.category, asset.originalFilename]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    },
    [query, status],
  );

  // Chips de la biblioteca: filtran por categoría y aceptan imágenes soltadas.
  const libraryChips = useMemo(() => {
    const counts = new Map();
    let total = 0;
    assets.filter(matchesStatusAndQuery).forEach((asset) => {
      const key = asset.category || DEFAULT_CATEGORY;
      counts.set(key, (counts.get(key) || 0) + 1);
      total += 1;
    });
    return [
      { category: null, label: "Todas", count: total, active: category === "all" },
      ...libraryCategories.map((item) => ({
        category: item,
        label: item,
        count: counts.get(item) || 0,
        active: category === item,
      })),
    ];
  }, [assets, category, libraryCategories, matchesStatusAndQuery]);

  // Si la categoría filtrada se queda vacía (p. ej. tras mover todo), volver a "Todas".
  useEffect(() => {
    if (category !== "all" && !libraryCategories.includes(category)) setCategory("all");
  }, [category, libraryCategories]);

  const filteredAssets = useMemo(
    () =>
      assets.filter(
        (asset) =>
          (category === "all" || (asset.category || DEFAULT_CATEGORY) === category) &&
          matchesStatusAndQuery(asset),
      ),
    [assets, category, matchesStatusAndQuery],
  );

  const groupedAssets = useMemo(() => {
    const grouped = new Map();
    filteredAssets.forEach((asset) => {
      const key = asset.category || DEFAULT_CATEGORY;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(asset);
    });

    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([groupCategory, items]) => ({ category: groupCategory, items }));
  }, [filteredAssets]);

  useEffect(() => {
    const existing = new Set(assets.map(getAssetId));
    syncSelection(assets, (asset) => existing.has(asset.id));
  }, [assets, syncSelection]);

  const selectedAssets = selection.items;
  const visibleSelectedCount = filteredAssets.filter(selection.isSelected).length;

  const groupedUploadItems = useMemo(() => {
    const grouped = new Map();
    uploadItems.forEach((item) => {
      const key = (item.category ?? defaultCategory)?.trim() || DEFAULT_CATEGORY;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });
    return [...grouped.entries()].map(([groupCategory, items]) => ({
      category: groupCategory,
      items,
    }));
  }, [uploadItems, defaultCategory]);

  const mediaStats = useMemo(() => {
    const active = assets.filter((asset) => asset.isActive).length;
    const inactive = Math.max(0, assets.length - active);
    const categoryCount = new Set(
      assets.map((asset) => asset.category || DEFAULT_CATEGORY),
    ).size;
    return {
      total: assets.length,
      active,
      inactive,
      categories: categoryCount,
    };
  }, [assets]);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const library = await mediaService.getReferenceImages({ includeInactive: true });
      setAssets(library.images || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "No se pudo cargar la media");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    uploadItemsRef.current = uploadItems;
  }, [uploadItems]);

  // Quitar de la selección las imágenes que salen del lote (subidas o quitadas).
  const { sync: syncUploadSelection } = uploadSelection;
  useEffect(() => {
    const existing = new Set(uploadItems.map(getUploadId));
    syncUploadSelection(uploadItems, (item) => existing.has(item.clientId));
  }, [uploadItems, syncUploadSelection]);

  useEffect(
    () => () => {
      uploadItemsRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    },
    [],
  );

  // `targetCategory` asigna una categoría propia (al soltar archivos sobre una
  // categoría de la biblioteca); sin ella, las imágenes heredan la del lote.
  const addFiles = (fileList, targetCategory = null) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    const resolved = targetCategory ? resolveCategory(targetCategory) : null;
    const itemCategory = resolved && resolved !== defaultCategory ? resolved : null;

    const invalid = incoming.filter((file) => !file.type?.startsWith("image/"));
    const valid = incoming.filter((file) => file.type?.startsWith("image/"));
    if (invalid.length) {
      setError(`${invalid.length} archivo(s) omitido(s): solo se aceptan imágenes`);
    } else {
      setError("");
    }

    setUploadItems((current) => {
      const existingKeys = new Set(
        current.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`),
      );
      const available = Math.max(0, MAX_BATCH_FILES - current.length);
      const next = valid
        .filter(
          (file) =>
            !existingKeys.has(`${file.name}:${file.size}:${file.lastModified}`),
        )
        .slice(0, available)
        .map((file) => ({
          clientId: createClientId(),
          file,
          previewUrl: URL.createObjectURL(file),
          title: fileBaseName(file),
          category: itemCategory,
          status: "pending",
          error: "",
        }));
      if (valid.length > available) {
        setError(`El lote admite un máximo de ${MAX_BATCH_FILES} imágenes`);
      }
      return [...current, ...next];
    });
  };

  const updateUploadItem = (clientId, changes) => {
    setUploadItems((current) =>
      current.map((item) =>
        item.clientId === clientId ? { ...item, ...changes, error: "" } : item,
      ),
    );
  };

  const removeUploadItem = (clientId) => {
    setUploadItems((current) => {
      const target = current.find((item) => item.clientId === clientId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.clientId !== clientId);
    });
  };

  const handleDrop = (event) => {
    if (dragKind(event) !== "files") return;
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const moveUploadItems = (clientIds, nextCategory) => {
    const target = resolveCategory(nextCategory);
    // Volver a la categoría del lote equivale a heredarla de nuevo.
    const category = target === defaultCategory ? null : target;
    const moving = new Set(clientIds);
    setUploadItems((current) =>
      current.map((item) => (moving.has(item.clientId) ? { ...item, category } : item)),
    );
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!canManage || !uploadItems.length) return;

    setSaving(true);
    setUploadProgress(0);
    setError("");
    setMessage("");
    setUploadItems((current) =>
      current.map((item) => ({ ...item, status: "uploading", error: "" })),
    );

    try {
      const response = await mediaService.uploadReferenceImagesBatch(
        uploadItems.map((item) => ({
          ...item,
          category: resolveCategory(effectiveCategory(item)),
        })),
        (progressEvent) => {
          if (!progressEvent.total) return;
          setUploadProgress(
            Math.min(100, Math.round((progressEvent.loaded * 100) / progressEvent.total)),
          );
        },
      );
      const resultById = new Map(
        (response.results || []).map((result) => [result.clientId, result]),
      );
      const created = response.created || [];
      setAssets((current) => [
        ...created,
        ...current.filter((asset) => !created.some((item) => item.id === asset.id)),
      ]);

      setUploadItems((current) =>
        current
          .map((item) => {
            const result = resultById.get(item.clientId);
            if (result?.success) {
              if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
              return null;
            }
            return {
              ...item,
              status: "error",
              error: result?.error || "No se pudo subir esta imagen",
            };
          })
          .filter(Boolean),
      );

      const failed = Number(response.failed || 0);
      const succeeded = Number(response.succeeded ?? created.length);
      if (failed > 0) {
        setError(`${succeeded} imagen(es) subidas y ${failed} con error`);
      } else {
        setMessage(`${succeeded} imagen(es) optimizadas y guardadas como WebP`);
      }
    } catch (err) {
      setUploadItems((current) =>
        current.map((item) => ({
          ...item,
          status: "error",
          error: err.response?.data?.message || err.message || "Error de carga",
        })),
      );
      setError(err.response?.data?.message || err.message || "No se pudo subir el lote");
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  };

  const startEdit = (asset) => {
    setEditing({
      id: asset.id,
      title: asset.title || "",
      category: asset.category || DEFAULT_CATEGORY,
      isActive: asset.isActive,
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      const updated = await mediaService.updateReferenceImage(editing.id, {
        title: editing.title,
        category: resolveCategory(editing.category),
        is_active: editing.isActive,
      });
      setAssets((current) =>
        current.map((asset) => (asset.id === updated.id ? updated : asset)),
      );
      setEditing(null);
      setMessage("Media actualizada");
    } catch (err) {
      setError(err.response?.data?.message || err.message || "No se pudo actualizar");
    } finally {
      setSaving(false);
    }
  };

  const toggleAssetActive = async (asset) => {
    if (!canManage) return;
    setSaving(true);
    setError("");
    try {
      const updated = await mediaService.updateReferenceImage(asset.id, {
        is_active: !asset.isActive,
      });
      setAssets((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setMessage(
        updated.isActive
          ? "Imagen visible de nuevo en el editor PDF"
          : "Imagen oculta del editor PDF — la encuentras en el filtro Inactivas",
      );
    } catch (err) {
      setError(err.response?.data?.message || err.message || "No se pudo actualizar");
    } finally {
      setSaving(false);
    }
  };

  const applyBulkPatch = async (ids, patch, successMessage) => {
    if (!canManage || !ids.length) return false;
    setSaving(true);
    setError("");
    try {
      const updated = await mediaService.updateReferenceImagesBatch(ids, patch);
      const byId = new Map(updated.map((asset) => [asset.id, asset]));
      setAssets((current) => current.map((asset) => byId.get(asset.id) || asset));
      selection.clear();
      setMessage(successMessage(updated.length));
      return true;
    } catch (err) {
      setError(err.response?.data?.message || err.message || "No se pudo actualizar el lote");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const moveAssets = async (ids, nextCategory) => {
    const target = resolveCategory(nextCategory);
    const moving = assets
      .filter((asset) => ids.includes(asset.id) && asset.category !== target)
      .map(getAssetId);
    if (!moving.length) return true;
    return applyBulkPatch(
      moving,
      { category: target },
      (count) => `${count} imagen(es) movidas a ${target}`,
    );
  };

  // Al arrastrar una tarjeta seleccionada se mueve toda la selección.
  const startCardDrag = (event, asset) => {
    const ids = selection.isSelected(asset) ? selection.ids : [asset.id];
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(MEDIA_DRAG_TYPE, JSON.stringify(ids));
    // Fuera del dragstart: cambiar el DOM dentro del evento puede cancelar el arrastre en Chrome.
    setTimeout(() => setDragCount(ids.length), 0);
  };

  const endCardDrag = () => {
    setDragCount(0);
    setDropOver(null);
  };

  const filesAddedMessage = (count, target) =>
    setMessage(
      `${count} imagen(es) añadidas al lote en «${resolveCategory(target)}». Revisa los títulos y pulsa «Optimizar y subir».`,
    );

  // Props de una zona de la biblioteca que acepta tarjetas y archivos. Firefox
  // solo acepta el drop si se cancelan dragenter y dragover.
  const libraryDropZone = (key, { onMove, onFiles }) => {
    const accept = (event) => {
      const kind = dragKind(event);
      if (!kind) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = kind === "move" ? "move" : "copy";
      if (dropOver?.key !== key || dropOver?.kind !== kind) setDropOver({ key, kind });
    };
    return {
      onDragEnter: accept,
      onDragOver: accept,
      onDragLeave: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setDropOver((current) => (current?.key === key ? null : current));
        }
      },
      onDrop: (event) => {
        const kind = dragKind(event);
        if (!kind) return;
        event.preventDefault();
        if (kind === "move") {
          const ids = parseDraggedIds(event.dataTransfer.getData(MEDIA_DRAG_TYPE));
          endCardDrag();
          if (ids.length) onMove(ids);
        } else {
          setDropOver(null);
          onFiles(event.dataTransfer.files);
        }
      },
    };
  };

  // `target` ya viene formateado: «Cusco» o "una nueva categoría".
  const dropHint = (key, target) => {
    if (dropOver?.key !== key) return null;
    return dropOver.kind === "move"
      ? `Suelta para mover ${dragCount ? `${dragCount} ` : ""}imagen(es) a ${target}`
      : `Suelta para añadir al lote en ${target}`;
  };

  const confirmNewCategory = () => {
    const name = newCategoryName.trim();
    const pending = newCategoryDrop;
    setNewCategoryDrop(null);
    setNewCategoryName("");
    if (!name || !pending) return;
    if (pending.ids) moveAssets(pending.ids, name);
    if (pending.files) {
      addFiles(pending.files, name);
      filesAddedMessage(pending.files.length, name);
    }
  };

  const openMoveDialog = (kind) =>
    setMoveDialog({
      kind,
      ids: kind === "upload" ? uploadSelection.ids : selection.ids,
      value: "",
    });

  const saveMoveDialog = async () => {
    if (!moveDialog) return;
    if (moveDialog.kind === "upload") {
      moveUploadItems(moveDialog.ids, moveDialog.value);
      uploadSelection.clear();
      setMoveDialog(null);
      return;
    }
    const done = await moveAssets(moveDialog.ids, moveDialog.value);
    if (done) setMoveDialog(null);
  };

  const deactivateSelected = async () => {
    const done = await applyBulkPatch(
      selection.ids,
      { is_active: false },
      (count) => `${count} imagen(es) desactivadas`,
    );
    if (done) setConfirmBulkDeactivate(false);
  };

  const reactivateSelected = () =>
    applyBulkPatch(selection.ids, { is_active: true }, (count) => `${count} imagen(es) reactivadas`);

  const toggleGroup = (items) => selection.toggleAll(items);

  return (
    <div className="media-manager">
      <header className="media-manager__header">
        <div className="media-manager__hero-main">
          <div className="media-manager__brand-mark" aria-hidden="true">
            <img src="/brand/isotipo-blanco.webp" alt="" />
          </div>
          <div className="media-manager__header-copy">
            <span className="media-manager__eyebrow">Gestión Media · Venso Tours</span>
            <h1>Banco visual de experiencias</h1>
            <p>
              Organiza el contenido visual que alimenta las cotizaciones PDF. Sube lotes,
              clasifica por destino o servicio y reutiliza imágenes optimizadas directamente
              desde el editor Canva de Venso.
            </p>
          </div>
        </div>
        <div className="media-manager__header-actions">
          <span>Biblioteca conectada al editor PDF</span>
          <button type="button" className="media-manager__refresh" onClick={loadAssets}>
            <MdRefresh /> Actualizar biblioteca
          </button>
        </div>
      </header>

      <section className="media-manager__metrics" aria-label="Resumen del banco de imágenes">
        <article>
          <span className="media-manager__metric-icon"><MdImageSearch /></span>
          <div><strong>{mediaStats.total}</strong><small>Imágenes registradas</small></div>
        </article>
        <article>
          <span className="media-manager__metric-icon"><MdCheckCircle /></span>
          <div><strong>{mediaStats.active}</strong><small>Activas en PDF</small></div>
        </article>
        <article>
          <span className="media-manager__metric-icon"><MdFolder /></span>
          <div><strong>{mediaStats.categories}</strong><small>Categorías</small></div>
        </article>
        <article>
          <span className="media-manager__metric-icon"><MdUploadFile /></span>
          <div><strong>{uploadItems.length}</strong><small>En el lote actual</small></div>
        </article>
      </section>

      {(message || error) && (
        <div className={`media-manager__notice ${error ? "error" : "success"}`}>
          {error || message}
          <button type="button" onClick={() => (error ? setError("") : setMessage(""))}>
            <MdClose />
          </button>
        </div>
      )}

      <section className="media-manager__workspace">
        <form className="media-upload" onSubmit={handleUpload}>
          <div
            className={`media-upload__dropzone ${dragging ? "dragging" : ""}`}
            onDragOver={(event) => {
              if (dragKind(event) !== "files") return;
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            {uploadItems.length ? (
              <div className="media-upload__batch-preview">
                {uploadItems.slice(0, 6).map((item) => (
                  <img key={item.clientId} src={item.previewUrl} alt="" />
                ))}
                <strong>{uploadItems.length} imagen(es) en el lote</strong>
              </div>
            ) : (
              <div className="media-upload__empty">
                <MdAddPhotoAlternate />
                <strong>Arrastra varias imágenes</strong>
                <span>
                  JPG, PNG, WebP, GIF o BMP. Máximo {MAX_BATCH_FILES} por lote.
                </span>
              </div>
            )}
            <label>
              <MdUploadFile />
              Elegir imágenes
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
          </div>

          <div className="media-upload__batch-tools">
            <CategorySelector
              label="Categoría del lote"
              value={defaultCategory}
              categories={categories}
              onChange={setDefaultCategory}
              commitMode
              disabled={!canManage || saving}
              hint="Se aplica a las imágenes del lote sin categoría propia."

            />
          </div>

          {uploadItems.length > 0 && (
            <BulkSelectionBar
              visibleCount={uploadItems.length}
              visibleSelectedCount={uploadItems.filter(uploadSelection.isSelected).length}
              selectedCount={uploadSelection.count}
              onToggleVisible={() => uploadSelection.toggleAll(uploadItems)}
              onClear={uploadSelection.clear}
              itemLabel="imágenes"
            >
              <button type="button" onClick={() => openMoveDialog("upload")} disabled={saving}>
                <MdDriveFileMove /> Cambiar categoría
              </button>
            </BulkSelectionBar>
          )}

          {groupedUploadItems.length > 0 && (
            <div className="media-upload__groups">
              {groupedUploadItems.map((group) => (
                <section className="media-upload__group" key={group.category}>
                  <header>
                    <span><MdFolder /> {group.category}</span>
                    {group.category === defaultCategory && (
                      <em className="media-upload__group-tag">categoría del lote</em>
                    )}
                    <small>{group.items.length}</small>
                  </header>
                  <div className="media-upload__queue">
                    {group.items.map((item) => (
                      <article
                        className={`media-upload-item media-upload-item--${item.status} ${uploadSelection.isSelected(item) ? "selected" : ""}`}
                        key={item.clientId}
                      >
                        <label className="media-upload-item__select" title="Seleccionar">
                          <input
                            type="checkbox"
                            checked={uploadSelection.isSelected(item)}
                            onChange={() => uploadSelection.toggle(item)}
                            disabled={saving}
                            aria-label={`Seleccionar ${item.title || item.file.name}`}
                          />
                        </label>
                        <img src={item.previewUrl} alt="" />
                        <div className="media-upload-item__fields">
                          <input
                            value={item.title}
                            onChange={(event) =>
                              updateUploadItem(item.clientId, { title: event.target.value })
                            }
                            placeholder="Título"
                            disabled={saving}
                          />
                          <CategorySelector
                            label="Categoría"
                            value={effectiveCategory(item)}
                            categories={categories}
                            onChange={(nextCategory) => moveUploadItems([item.clientId], nextCategory)}
                            commitMode
                            disabled={saving}
                          />
                          {item.error && <small className="media-upload-item__error">{item.error}</small>}
                        </div>
                        <button
                          type="button"
                          className="media-upload-item__remove"
                          onClick={() => removeUploadItem(item.clientId)}
                          disabled={saving}
                          title="Quitar del lote"
                        >
                          <MdClose />
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {saving && (
            <div className="media-upload__progress" aria-label="Progreso del lote">
              <span style={{ width: `${uploadProgress}%` }} />
              <small>{uploadProgress}%</small>
            </div>
          )}

          <button
            type="submit"
            className="media-upload__submit"
            disabled={!canManage || !uploadItems.length || saving}
          >
            <MdCheckCircle />
            {saving ? "Subiendo lote..." : `Optimizar y subir ${uploadItems.length || ""}`}
          </button>
        </form>

        <section className="media-library">
          <div className="media-library__toolbar">
            <div className="media-library__search">
              <MdSearch />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por destino, categoría o archivo"
              />
            </div>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="active">Activas</option>
              <option value="inactive">Inactivas</option>
              <option value="all">Todas</option>
            </select>
          </div>

          <CategoryChipBar
            className="media-chipbar--sticky"
            chips={libraryChips}
            onSelect={(next) => setCategory(next === null || next === category ? "all" : next)}
          />

          {canManage && (
            <BulkSelectionBar
              visibleCount={filteredAssets.length}
              visibleSelectedCount={visibleSelectedCount}
              selectedCount={selection.count}
              onToggleVisible={() => selection.toggleAll(filteredAssets)}
              onClear={selection.clear}
              itemLabel="imágenes"
            >
              <button
                type="button"
                onClick={() => openMoveDialog("library")}
                disabled={saving || selection.overLimit}
              >
                <MdDriveFileMove /> Cambiar categoría
              </button>
              <button
                type="button"
                onClick={reactivateSelected}
                disabled={saving || selection.overLimit || selectedAssets.every((asset) => asset.isActive)}
              >
                <MdRestore /> Reactivar
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => setConfirmBulkDeactivate(true)}
                disabled={saving || selection.overLimit || selectedAssets.every((asset) => !asset.isActive)}
              >
                <MdVisibilityOff /> Desactivar
              </button>
            </BulkSelectionBar>
          )}

          {loading ? (
            <div className="media-library__state"><MdImageSearch /> Cargando galería...</div>
          ) : filteredAssets.length ? (
            <div className="media-library__groups">
              {groupedAssets.map((group) => (
                <section
                  className={`media-library__group ${dropOver?.key === group.category ? "is-drop-over" : ""}`}
                  key={group.category}
                  {...(canManage
                    ? libraryDropZone(group.category, {
                        onMove: (ids) => moveAssets(ids, group.category),
                        onFiles: (files) => {
                          addFiles(files, group.category);
                          filesAddedMessage(files.length, group.category);
                        },
                      })
                    : {})}
                >
                  {dropHint(group.category, `«${group.category}»`) && (
                    <div className="media-library__drop-hint">{dropHint(group.category, `«${group.category}»`)}</div>
                  )}
                  <header>
                    {canManage && (
                      <input
                        type="checkbox"
                        className="media-library__group-select"
                        checked={group.items.every(selection.isSelected)}
                        ref={(element) => {
                          if (element) {
                            const some = group.items.some(selection.isSelected);
                            element.indeterminate = some && !group.items.every(selection.isSelected);
                          }
                        }}
                        onChange={() => toggleGroup(group.items)}
                        aria-label={`Seleccionar categoría ${group.category}`}
                      />
                    )}
                    <h2>{group.category}</h2>
                    <span>{group.items.length} imágenes</span>
                  </header>
                  <div className="media-library__grid">
                    {group.items.map((asset) => (
                      <article
                        className={`media-card ${asset.isActive ? "" : "inactive"} ${selection.isSelected(asset) ? "selected" : ""}`}
                        key={asset.id}
                        data-asset-id={asset.id}
                        draggable={canManage && !saving}
                        onDragStart={(event) => startCardDrag(event, asset)}
                        onDragEnd={endCardDrag}
                      >
                        {canManage && (
                          <label className="media-card__select" title="Seleccionar">
                            <input
                              type="checkbox"
                              checked={selection.isSelected(asset)}
                              onChange={() => selection.toggle(asset)}
                              aria-label={`Seleccionar ${asset.title}`}
                            />
                          </label>
                        )}
                        <img src={asset.previewSrc || asset.proxyUrl || asset.src} alt="" draggable={false} />
                        <div className="media-card__body">
                          <strong>{asset.title}</strong>
                          <span>{asset.category}</span>
                          <small>{asset.width || "-"}x{asset.height || "-"} · {formatBytes(asset.sizeBytes)}</small>
                        </div>
                        {canManage && (
                          <div className="media-card__actions">
                            <button type="button" onClick={() => startEdit(asset)} title="Editar"><MdEdit /></button>
                            <button
                              type="button"
                              className={asset.isActive ? "" : "is-hidden"}
                              onClick={() => toggleAssetActive(asset)}
                              disabled={saving}
                              title={asset.isActive ? "Ocultar del editor PDF" : "Mostrar en el editor PDF"}
                              aria-pressed={!asset.isActive}
                            >
                              {asset.isActive ? <MdVisibility /> : <MdVisibilityOff />}
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="media-library__state"><MdImageSearch /> No hay imágenes para los filtros actuales.</div>
          )}

          {canManage && !loading && (
            <div
              className={`media-library__new-category ${dropOver?.key === "__new" ? "is-drop-over" : ""}`}
              {...libraryDropZone("__new", {
                onMove: (ids) => setNewCategoryDrop({ ids }),
                onFiles: (files) => setNewCategoryDrop({ files: Array.from(files) }),
              })}
            >
              {newCategoryDrop ? (
                <label>
                  {newCategoryDrop.ids
                    ? `Nueva categoría para ${newCategoryDrop.ids.length} imagen(es)`
                    : `Nueva categoría para ${newCategoryDrop.files.length} archivo(s) del lote`}
                  <input
                    autoFocus
                    value={newCategoryName}
                    placeholder="Ej. Valle Sagrado / Pisac"
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") confirmNewCategory();
                      if (event.key === "Escape") {
                        setNewCategoryDrop(null);
                        setNewCategoryName("");
                      }
                    }}
                  />
                  <span>
                    <button type="button" onClick={confirmNewCategory} disabled={!newCategoryName.trim()}>
                      <MdCheckCircle /> Crear
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewCategoryDrop(null);
                        setNewCategoryName("");
                      }}
                    >
                      Cancelar
                    </button>
                  </span>
                </label>
              ) : (
                <>
                  <MdAddPhotoAlternate />
                  <strong>
                    {dropHint("__new", "una nueva categoría") || "Nueva categoría"}
                  </strong>
                  <small>Arrastra aquí imágenes de la galería o archivos de tu equipo.</small>
                </>
              )}
            </div>
          )}
        </section>
      </section>

      {moveDialog && (
        <div className="media-edit" onClick={() => !saving && setMoveDialog(null)}>
          <div className="media-edit__panel" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Cambiar categoría</h2>
              <button type="button" onClick={() => setMoveDialog(null)} disabled={saving}><MdClose /></button>
            </header>
            <p className="media-edit__hint">
              {moveDialog.ids.length} imagen(es)
              {moveDialog.kind === "upload" ? " del lote" : ""}. La categoría también influye en
              cómo el editor PDF sugiere y rotula las imágenes automáticamente.
            </p>
            <CategorySelector
              label="Nueva categoría"
              value={moveDialog.value}
              categories={categories}
              onChange={(value) => setMoveDialog((current) => current && { ...current, value })}
              disabled={saving}
            />
            <button
              type="button"
              className="media-edit__save"
              onClick={saveMoveDialog}
              disabled={saving || !moveDialog.value.trim()}
            >
              <MdSave /> {saving ? "Guardando..." : `Mover ${moveDialog.ids.length} imagen(es)`}
            </button>
          </div>
        </div>
      )}

      {confirmBulkDeactivate && (
        <div className="media-edit" onClick={() => !saving && setConfirmBulkDeactivate(false)}>
          <div className="media-edit__panel" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Desactivar imágenes</h2>
              <button type="button" onClick={() => setConfirmBulkDeactivate(false)} disabled={saving}><MdClose /></button>
            </header>
            <p className="media-edit__hint">
              {selectedAssets.filter((asset) => asset.isActive).length} imagen(es) dejarán de
              aparecer al elegir imágenes en el editor de cotizaciones PDF. Puedes reactivarlas
              después; los PDF ya guardados conservan sus imágenes.
            </p>
            <button
              type="button"
              className="media-edit__save media-edit__save--danger"
              onClick={deactivateSelected}
              disabled={saving}
            >
              <MdVisibilityOff /> {saving ? "Desactivando..." : "Desactivar"}
            </button>
          </div>
        </div>
      )}

      {editing && (
        <div className="media-edit">
          <div className="media-edit__panel">
            <header>
              <h2>Editar media</h2>
              <button type="button" onClick={() => setEditing(null)}><MdClose /></button>
            </header>
            <label>
              Título
              <input
                value={editing.title}
                onChange={(event) => setEditing({ ...editing, title: event.target.value })}
              />
            </label>
            <CategorySelector
              label="Categoría"
              value={editing.category}
              categories={categories}
              onChange={(nextCategory) => setEditing({ ...editing, category: nextCategory })}
              disabled={saving}
            />
            <label className="media-edit__toggle">
              <input
                type="checkbox"
                checked={editing.isActive}
                onChange={(event) => setEditing({ ...editing, isActive: event.target.checked })}
              />
              Visible en el editor de cotizaciones PDF
            </label>
            <p className="media-edit__hint">
              Si la desactivas no aparecerá al elegir imágenes para una cotización; los PDF ya
              guardados no cambian.
            </p>
            <button type="button" className="media-edit__save" onClick={saveEdit} disabled={saving}>
              <MdSave /> Guardar cambios
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
