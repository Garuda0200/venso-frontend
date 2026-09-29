import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MdAddPhotoAlternate,
  MdCheckCircle,
  MdClose,
  MdDelete,
  MdEdit,
  MdFolder,
  MdImageSearch,
  MdRefresh,
  MdSave,
  MdSearch,
  MdUploadFile,
} from "react-icons/md";
import { useAuth } from "../../../context/AuthContext";
import mediaService from "../../../services/mediaService";
import "./Inventario.scss";

const DEFAULT_CATEGORY = "General";
const MAX_BATCH_FILES = 50;

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

function CategorySelector({ label, value, categories, onChange, disabled = false }) {
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    if (value && categories.length && !categories.includes(value)) {
      setCustom(true);
    }
  }, [categories, value]);

  return (
    <div className="media-category-field">
      <div className="media-category-field__head">
        <span>{label}</span>
        <button
          type="button"
          onClick={() => {
            setCustom((current) => !current);
            if (!custom && value === DEFAULT_CATEGORY) onChange("");
            if (custom && !value) onChange(DEFAULT_CATEGORY);
          }}
          disabled={disabled}
        >
          {custom ? "Usar existente" : "Nueva categoría"}
        </button>
      </div>
      {custom ? (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Ej. Valle Sagrado / Pisac"
          disabled={disabled}
        />
      ) : (
        <select
          value={value || DEFAULT_CATEGORY}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        >
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

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
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const uploadItemsRef = useRef([]);

  const categories = useMemo(() => {
    const values = assets.map((asset) => asset.category).filter(Boolean);
    return [...new Set([DEFAULT_CATEGORY, ...values])].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [assets]);

  const filteredAssets = useMemo(() => {
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);

    return assets.filter((asset) => {
      if (category !== "all" && asset.category !== category) return false;
      if (status === "active" && !asset.isActive) return false;
      if (status === "inactive" && asset.isActive) return false;
      if (!tokens.length) return true;
      const haystack = [asset.title, asset.category, asset.originalFilename]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [assets, category, query, status]);

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

  const groupedUploadItems = useMemo(() => {
    const grouped = new Map();
    uploadItems.forEach((item) => {
      const key = item.category?.trim() || DEFAULT_CATEGORY;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });
    return [...grouped.entries()].map(([groupCategory, items]) => ({
      category: groupCategory,
      items,
    }));
  }, [uploadItems]);

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

  useEffect(
    () => () => {
      uploadItemsRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    },
    [],
  );

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

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
          category: defaultCategory || DEFAULT_CATEGORY,
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
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const applyDefaultCategoryToAll = () => {
    const nextCategory = defaultCategory.trim() || DEFAULT_CATEGORY;
    setUploadItems((current) =>
      current.map((item) => ({ ...item, category: nextCategory })),
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
        uploadItems,
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
        category: editing.category,
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

  const deleteAsset = async (asset) => {
    if (!canManage) return;
    setSaving(true);
    setError("");
    try {
      const updated = await mediaService.deleteReferenceImage(asset.id);
      setAssets((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setMessage("Media desactivada");
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "No se pudo desactivar");
    } finally {
      setSaving(false);
    }
  };

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
              label="Categoría para nuevas imágenes"
              value={defaultCategory}
              categories={categories}
              onChange={setDefaultCategory}
              disabled={!canManage || saving}
            />
            <button
              type="button"
              onClick={applyDefaultCategoryToAll}
              disabled={!uploadItems.length || saving}
            >
              <MdFolder /> Aplicar a todo el lote
            </button>
          </div>

          {groupedUploadItems.length > 0 && (
            <div className="media-upload__groups">
              {groupedUploadItems.map((group) => (
                <section className="media-upload__group" key={group.category}>
                  <header>
                    <span><MdFolder /> {group.category}</span>
                    <small>{group.items.length}</small>
                  </header>
                  <div className="media-upload__queue">
                    {group.items.map((item) => (
                      <article
                        className={`media-upload-item media-upload-item--${item.status}`}
                        key={item.clientId}
                      >
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
                            value={item.category}
                            categories={categories}
                            onChange={(nextCategory) =>
                              updateUploadItem(item.clientId, { category: nextCategory })
                            }
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
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="all">Todas las categorías</option>
              {categories.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="active">Activas</option>
              <option value="inactive">Inactivas</option>
              <option value="all">Todas</option>
            </select>
          </div>

          {loading ? (
            <div className="media-library__state"><MdImageSearch /> Cargando galería...</div>
          ) : filteredAssets.length ? (
            <div className="media-library__groups">
              {groupedAssets.map((group) => (
                <section className="media-library__group" key={group.category}>
                  <header>
                    <h2>{group.category}</h2>
                    <span>{group.items.length} imágenes</span>
                  </header>
                  <div className="media-library__grid">
                    {group.items.map((asset) => (
                      <article className={`media-card ${asset.isActive ? "" : "inactive"}`} key={asset.id}>
                        <img src={asset.previewSrc || asset.proxyUrl || asset.src} alt="" />
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
                              onClick={() =>
                                setConfirmDeleteId((current) => current === asset.id ? null : asset.id)
                              }
                              title="Desactivar"
                            ><MdDelete /></button>
                            {confirmDeleteId === asset.id && (
                              <div className="media-card__confirm">
                                <strong>Desactivar imagen</strong>
                                <span>No se mostrará en el selector PDF.</span>
                                <div>
                                  <button type="button" onClick={() => deleteAsset(asset)}>Desactivar</button>
                                  <button type="button" onClick={() => setConfirmDeleteId(null)}>Cancelar</button>
                                </div>
                              </div>
                            )}
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
        </section>
      </section>

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
              Activa en el selector PDF
            </label>
            <button type="button" className="media-edit__save" onClick={saveEdit} disabled={saving}>
              <MdSave /> Guardar cambios
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
