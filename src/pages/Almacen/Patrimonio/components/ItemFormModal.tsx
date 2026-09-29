import { useEffect, useMemo, useState } from "react";
import {
  FaBarcode,
  FaBoxOpen,
  FaPlus,
  FaSave,
  FaTimes,
  FaTrash,
  FaUser,
} from "react-icons/fa";
import LoadingSpinner from "../../../../components/LoadingSpinner";
import patrimonioService from "../../../../services/patrimonioService";
import {
  CATEGORY_DEFINITIONS,
  CATEGORY_MAP,
  EMPTY_FORM,
  ESTADOS,
} from "../constants";
import {
  attributeLabel,
  getResponseData,
  itemResponsibles,
  normalizeCode,
  toForm,
  toPayload,
} from "../utils";

const customAttributeKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export default function ItemFormModal({
  item,
  categories,
  initialCode,
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState(() =>
    item ? toForm(item) : { ...EMPTY_FORM, codigo: normalizeCode(initialCode) },
  );
  const [saving, setSaving] = useState(false);
  const [suggestingCode, setSuggestingCode] = useState(false);
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(Boolean(item || initialCode));
  const [customAttribute, setCustomAttribute] = useState("");
  const [error, setError] = useState("");

  const categoryOptions = useMemo(
    () => [...new Set([...CATEGORY_DEFINITIONS.map(({ value }) => value), ...(categories || [])])],
    [categories],
  );
  const definition = CATEGORY_MAP[form.categoria];
  const templateKeys = new Set((definition?.fields || []).map(({ key }) => key));
  const extraAttributeKeys = Object.keys(form.atributos || {}).filter(
    (key) => !templateKeys.has(key),
  );
  const additionalResponsibles = item ? Math.max(itemResponsibles(item).length - 1, 0) : 0;
  const hasOptionalData = Boolean(
    item &&
      (form.descripcion ||
        form.codigos_alternos_text ||
        Object.values(form.atributos || {}).some((value) => String(value ?? "").trim())),
  );

  const setField = (field, value) =>
    setForm((current) => ({ ...current, [field]: value }));

  const setAttribute = (key, value) =>
    setForm((current) => ({
      ...current,
      atributos: { ...current.atributos, [key]: value },
    }));

  const removeAttribute = (key) =>
    setForm((current) => {
      const attributes = { ...current.atributos };
      delete attributes[key];
      return { ...current, atributos: attributes };
    });

  const requestNextCode = async (category, force = false) => {
    if (!category || (codeManuallyEdited && !force)) return;
    setSuggestingCode(true);
    const response = await patrimonioService.getNextCode(category);
    const data = getResponseData(response, {});
    if (data?.codigo) {
      setForm((current) => ({ ...current, codigo: normalizeCode(data.codigo) }));
      setCodeManuallyEdited(false);
    }
    setSuggestingCode(false);
  };

  useEffect(() => {
    if (!item && form.categoria) requestNextCode(form.categoria);
    // La sugerencia solo se recalcula al cambiar la categoría.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.categoria, item]);

  const handleCategoryChange = (value) => {
    setForm((current) => ({
      ...current,
      categoria: value,
      nombre: current.nombre || value,
    }));
    if (!item && !initialCode) setCodeManuallyEdited(false);
  };

  const addCustomAttribute = () => {
    const key = customAttributeKey(customAttribute);
    if (!key) return;
    setAttribute(key, form.atributos?.[key] || "");
    setCustomAttribute("");
  };

  const save = async (event) => {
    event.preventDefault();
    if (!form.categoria.trim()) {
      setError("Selecciona una categoría para el bien patrimonial.");
      return;
    }
    if (!form.nombre.trim()) {
      setError("El nombre del bien es obligatorio.");
      return;
    }

    setSaving(true);
    setError("");
    const payload = toPayload(form);
    const response = item
      ? await patrimonioService.updateItem(item.id, payload)
      : await patrimonioService.createItem(payload);
    setSaving(false);

    if (response?.success === false) {
      setError(response.message || "No se pudo guardar el bien patrimonial.");
      return;
    }
    onSaved(getResponseData(response));
  };

  return (
    <div className="patrimonio-modal-backdrop" onClick={onClose}>
      <form
        className="patrimonio-modal patrimonio-form-modal patrimonio-compact-form"
        onSubmit={save}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div className="patrimonio-modal-title">
            <span className="patrimonio-modal-icon"><FaBoxOpen /></span>
            <div>
              <h3>{item ? "Editar bien" : "Nuevo bien patrimonial"}</h3>
              <p>Información esencial, responsable actual y detalles opcionales.</p>
            </div>
          </div>
          <button className="patrimonio-icon-btn" onClick={onClose} type="button">
            <FaTimes />
          </button>
        </header>

        <div className="patrimonio-modal-body patrimonio-compact-form-body">
          {error && <div className="patrimonio-alert">{error}</div>}
          {saving && <LoadingSpinner />}

          <section className="patrimonio-compact-card">
            <div className="patrimonio-compact-heading">
              <div>
                <h4>Datos del bien</h4>
                <p>El código se normaliza automáticamente para Code 128.</p>
              </div>
              {form.codigo && (
                <span className="patrimonio-code-chip"><FaBarcode /> {normalizeCode(form.codigo)}</span>
              )}
            </div>

            <div className="patrimonio-form-grid patrimonio-essential-grid">
              <label className="field">
                <span>Categoría *</span>
                <select
                  value={form.categoria}
                  onChange={(event) => handleCategoryChange(event.target.value)}
                  disabled={saving}
                  required
                >
                  <option value="">Seleccionar categoría</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Código patrimonial</span>
                <div className="patrimonio-code-input">
                  <input
                    value={form.codigo}
                    onChange={(event) => {
                      setCodeManuallyEdited(true);
                      setField("codigo", event.target.value);
                    }}
                    onBlur={() => setField("codigo", normalizeCode(form.codigo))}
                    placeholder={definition ? `${definition.prefix}-01` : "Automático"}
                    disabled={saving}
                  />
                  <button
                    type="button"
                    title="Generar siguiente código"
                    disabled={!form.categoria || saving || suggestingCode}
                    onClick={() => requestNextCode(form.categoria, true)}
                  >
                    <FaBarcode />
                  </button>
                </div>
              </label>

              <label className="field span-2">
                <span>Nombre del bien *</span>
                <input
                  value={form.nombre}
                  onChange={(event) => setField("nombre", event.target.value)}
                  placeholder="Ej. CPU de escritorio, monitor o mouse"
                  required
                  disabled={saving}
                />
              </label>

              <label className="field">
                <span>Estado</span>
                <select
                  value={form.estado}
                  onChange={(event) => setField("estado", event.target.value)}
                  disabled={saving}
                >
                  {ESTADOS.map((state) => (
                    <option key={state.value} value={state.value}>{state.label}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Ubicación</span>
                <input
                  value={form.ubicacion}
                  onChange={(event) => setField("ubicacion", event.target.value)}
                  placeholder="Almacén, oficina o área"
                  disabled={saving}
                />
              </label>
            </div>
          </section>

          <section className="patrimonio-compact-card patrimonio-responsible-card">
            <div className="patrimonio-compact-heading">
              <div className="patrimonio-heading-with-icon">
                <span><FaUser /></span>
                <div>
                  <h4>Responsable actual</h4>
                  <p>Al cambiarlo se registra la asignación, reasignación o devolución en el historial.</p>
                </div>
              </div>
            </div>

            <div className="patrimonio-form-grid">
              <label className="field">
                <span>Nombre completo</span>
                <input
                  value={form.responsable_nombre}
                  onChange={(event) => setField("responsable_nombre", event.target.value)}
                  placeholder="Sin asignar"
                  disabled={saving}
                />
              </label>
              <label className="field">
                <span>DNI / documento <em>(opcional)</em></span>
                <input
                  value={form.responsable_dni}
                  onChange={(event) => setField("responsable_dni", event.target.value)}
                  placeholder="Documento de identidad"
                  disabled={saving}
                />
              </label>
            </div>

            {additionalResponsibles > 0 && (
              <p className="patrimonio-responsible-note">
                Este bien tiene {additionalResponsibles} responsable{additionalResponsibles > 1 ? "s" : ""} adicional{additionalResponsibles > 1 ? "es" : ""}. Se conservarán al editar el responsable principal.
              </p>
            )}
          </section>

          <details className="patrimonio-optional-details">
            <summary>
              <span>Detalles técnicos y observaciones</span>
              <small>{hasOptionalData ? "Con datos" : "Opcional"}</small>
            </summary>

            <div className="patrimonio-optional-content">
              <div className="patrimonio-form-grid">
                <label className="field span-2">
                  <span>Descripción / observación general</span>
                  <textarea
                    value={form.descripcion}
                    onChange={(event) => setField("descripcion", event.target.value)}
                    placeholder="Detalles permanentes del bien"
                    disabled={saving}
                  />
                </label>
                <label className="field span-2">
                  <span>Códigos anteriores o alternos</span>
                  <textarea
                    value={form.codigos_alternos_text}
                    onChange={(event) => setField("codigos_alternos_text", event.target.value)}
                    placeholder="Uno por línea o separados por coma"
                    disabled={saving}
                  />
                </label>
              </div>

              <div className="patrimonio-attributes-heading">
                <h5>Características de {form.categoria || "la categoría"}</h5>
                <p>Se almacenan dentro del JSONB del bien.</p>
              </div>

              <div className="patrimonio-attribute-grid">
                {(definition?.fields || []).map((attribute) => (
                  <label className="field" key={attribute.key}>
                    <span>{attribute.label}</span>
                    <div className="patrimonio-suffixed-input">
                      <input
                        type={attribute.type || "text"}
                        value={form.atributos?.[attribute.key] ?? ""}
                        onChange={(event) => setAttribute(attribute.key, event.target.value)}
                        placeholder={attribute.placeholder}
                        disabled={saving}
                      />
                      {attribute.suffix && <em>{attribute.suffix}</em>}
                    </div>
                  </label>
                ))}

                {extraAttributeKeys.map((key) => (
                  <label className="field patrimonio-custom-field" key={key}>
                    <span>{attributeLabel(key)}</span>
                    <div>
                      <input
                        value={form.atributos?.[key] ?? ""}
                        onChange={(event) => setAttribute(key, event.target.value)}
                        disabled={saving}
                      />
                      <button type="button" onClick={() => removeAttribute(key)} title="Quitar atributo">
                        <FaTrash />
                      </button>
                    </div>
                  </label>
                ))}
              </div>

              {!definition && form.categoria && (
                <div className="patrimonio-form-hint">
                  Esta categoría no tiene plantilla predefinida. Agrega solo los atributos necesarios.
                </div>
              )}

              <div className="patrimonio-add-attribute">
                <input
                  value={customAttribute}
                  onChange={(event) => setCustomAttribute(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCustomAttribute();
                    }
                  }}
                  placeholder="Nuevo atributo, por ejemplo número de serie"
                />
                <button type="button" onClick={addCustomAttribute} disabled={!customAttribute.trim()}>
                  <FaPlus /> Agregar
                </button>
              </div>
            </div>
          </details>
        </div>

        <footer>
          <button type="button" className="patrimonio-secondary-btn" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="patrimonio-primary-btn" disabled={saving}>
            <FaSave /> {saving ? "Guardando..." : item ? "Guardar cambios" : "Crear bien"}
          </button>
        </footer>
      </form>
    </div>
  );
}
