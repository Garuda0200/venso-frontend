import { useEffect, useMemo, useState } from "react";
import {
  FaCheckCircle,
  FaLayerGroup,
  FaPlus,
  FaPrint,
  FaSave,
  FaTimes,
} from "react-icons/fa";
import LoadingSpinner from "../../../../components/LoadingSpinner";
import CategoryCombobox from "../../../../components/common/CategoryCombobox";
import patrimonioService from "../../../../services/patrimonioService";
import { canonicalCategory, mergeCategoryOptions } from "../../../../utils/categoryOptions";
import {
  BASE_COLUMNS,
  BATCH_CREATE_LIMIT,
  buildBatchPayload,
  getCell,
  isGridPaste,
  pasteGrid,
  previewCodes,
  resizeRows,
  setCell,
} from "../batchCreate";
import { CATEGORY_DEFINITIONS, CATEGORY_MAP, ESTADOS } from "../constants";
import { attributeLabel, customAttributeKey, getResponseData } from "../utils";

const EMPTY_SHARED = {
  categoria: "",
  nombre: "",
  estado: "operativo",
  ubicacion: "",
  descripcion: "",
  responsable_nombre: "",
  responsable_dni: "",
  atributos: {},
};

export default function BatchCreateModal({ categories, onClose, onSaved, onPrintLabels }) {
  const [shared, setShared] = useState(EMPTY_SHARED);
  const [rows, setRows] = useState(() => resizeRows([], 5));
  const [extraKeys, setExtraKeys] = useState([]);
  const [customAttribute, setCustomAttribute] = useState("");
  const [nextCode, setNextCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const categoryOptions = useMemo(
    () => mergeCategoryOptions(CATEGORY_DEFINITIONS.map(({ value }) => value), categories || []),
    [categories],
  );
  const resolvedCategory = canonicalCategory(shared.categoria, categoryOptions);
  const definition = CATEGORY_MAP[resolvedCategory];

  const attributeColumns = useMemo(() => {
    const templateKeys = (definition?.fields || []).map(({ key, label }) => ({ key, label }));
    const known = new Set(["serie", ...templateKeys.map(({ key }) => key)]);
    const extra = extraKeys
      .filter((key) => !known.has(key))
      .map((key) => ({ key, label: attributeLabel(key) }));
    return [...templateKeys.filter(({ key }) => key !== "serie"), ...extra];
  }, [definition, extraKeys]);
  const columns = useMemo(() => [...BASE_COLUMNS, ...attributeColumns], [attributeColumns]);
  const codes = useMemo(() => previewCodes(rows, nextCode), [rows, nextCode]);

  useEffect(() => {
    if (!resolvedCategory) {
      setNextCode("");
      return undefined;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const response = await patrimonioService.getNextCode(resolvedCategory);
      if (!cancelled) setNextCode(getResponseData(response, {})?.codigo || "");
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [resolvedCategory]);

  const setSharedField = (field, value) =>
    setShared((current) => ({ ...current, [field]: value }));

  const setSharedAttribute = (key, value) =>
    setShared((current) => ({ ...current, atributos: { ...current.atributos, [key]: value } }));

  const updateCell = (rowIndex, key, value) =>
    setRows((current) =>
      current.map((row, index) => (index === rowIndex ? setCell(row, key, value) : row)),
    );

  const handlePaste = (event, rowIndex, key) => {
    const text = event.clipboardData?.getData("text") || "";
    if (!isGridPaste(text)) return;
    event.preventDefault();
    setRows((current) => pasteGrid(current, columns, rowIndex, key, text));
  };

  const addCustomColumn = () => {
    const key = customAttributeKey(customAttribute);
    if (!key) return;
    setExtraKeys((current) => (current.includes(key) ? current : [...current, key]));
    setCustomAttribute("");
  };

  const finish = () => {
    if (result) onSaved(result.items, result.message);
    else onClose();
  };

  const save = async (event) => {
    event.preventDefault();
    if (!resolvedCategory) {
      setError("Elige o escribe una categoría para el lote.");
      return;
    }
    setSaving(true);
    setError("");
    const response = await patrimonioService.createItemsBatch(
      buildBatchPayload({ ...shared, categoria: resolvedCategory }, rows),
    );
    setSaving(false);
    if (response?.success === false) {
      setError(response.message || "No se pudo registrar el lote.");
      return;
    }
    setResult({
      items: getResponseData(response, {})?.items || [],
      message: response?.message,
    });
  };

  if (result) {
    return (
      <div className="patrimonio-modal-backdrop" onClick={finish}>
        <div
          className="patrimonio-modal patrimonio-batch-modal"
          role="dialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
        >
          <header>
            <div className="patrimonio-modal-title">
              <span className="patrimonio-modal-icon"><FaCheckCircle /></span>
              <div>
                <h3>Lote registrado</h3>
                <p>{result.message || `${result.items.length} bienes creados.`}</p>
              </div>
            </div>
            <button className="patrimonio-icon-btn" onClick={finish} type="button">
              <FaTimes />
            </button>
          </header>
          <div className="patrimonio-modal-body">
            <div className="patrimonio-batch-codes">
              {result.items.map((item) => (
                <span key={item.id} className="patrimonio-code-chip">{item.codigo}</span>
              ))}
            </div>
          </div>
          <footer>
            <button type="button" className="patrimonio-secondary-btn" onClick={finish}>
              Listo
            </button>
            <button
              type="button"
              className="patrimonio-primary-btn"
              onClick={() => onPrintLabels(result.items)}
            >
              <FaPrint /> Imprimir {result.items.length} etiquetas
            </button>
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div className="patrimonio-modal-backdrop" onClick={onClose}>
      <form
        className="patrimonio-modal patrimonio-form-modal patrimonio-batch-create-modal"
        onSubmit={save}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div className="patrimonio-modal-title">
            <span className="patrimonio-modal-icon"><FaLayerGroup /></span>
            <div>
              <h3>Alta por lote</h3>
              <p>Define los datos comunes una vez y completa solo lo que cambia por unidad.</p>
            </div>
          </div>
          <button className="patrimonio-icon-btn" onClick={onClose} type="button" disabled={saving}>
            <FaTimes />
          </button>
        </header>

        <div className="patrimonio-modal-body patrimonio-compact-form-body">
          {error && <div className="patrimonio-alert">{error}</div>}
          {saving && <LoadingSpinner />}

          <section className="patrimonio-compact-card">
            <div className="patrimonio-compact-heading">
              <div>
                <h4>1. Datos comunes del lote</h4>
                <p>Se aplican a todas las unidades salvo que la fila indique otro valor.</p>
              </div>
            </div>

            <div className="patrimonio-form-grid">
              <label className="field">
                <span>Categoría *</span>
                <CategoryCombobox
                  value={shared.categoria}
                  onChange={(value) => setSharedField("categoria", value)}
                  options={categoryOptions}
                />
              </label>
              <label className="field">
                <span>Cantidad de unidades</span>
                <input
                  type="number"
                  min={1}
                  max={BATCH_CREATE_LIMIT}
                  value={rows.length}
                  onChange={(event) => setRows((current) => resizeRows(current, event.target.value))}
                  disabled={saving}
                />
              </label>
              <label className="field">
                <span>Nombre base</span>
                <input
                  value={shared.nombre}
                  onChange={(event) => setSharedField("nombre", event.target.value)}
                  placeholder={resolvedCategory || "Igual a la categoría"}
                  disabled={saving}
                />
              </label>
              <label className="field">
                <span>Estado</span>
                <select
                  value={shared.estado}
                  onChange={(event) => setSharedField("estado", event.target.value)}
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
                  value={shared.ubicacion}
                  onChange={(event) => setSharedField("ubicacion", event.target.value)}
                  placeholder="Almacén, oficina o área"
                  disabled={saving}
                />
              </label>
              <label className="field">
                <span>Responsable</span>
                <input
                  value={shared.responsable_nombre}
                  onChange={(event) => setSharedField("responsable_nombre", event.target.value)}
                  placeholder="Sin asignar"
                  disabled={saving}
                />
              </label>
              <label className="field">
                <span>DNI responsable <em>(opcional)</em></span>
                <input
                  value={shared.responsable_dni}
                  onChange={(event) => setSharedField("responsable_dni", event.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="field span-2">
                <span>Descripción común</span>
                <input
                  value={shared.descripcion}
                  onChange={(event) => setSharedField("descripcion", event.target.value)}
                  placeholder="Opcional"
                  disabled={saving}
                />
              </label>
            </div>

            {attributeColumns.length > 0 && (
              <>
                <div className="patrimonio-attributes-heading">
                  <h5>Características comunes de {resolvedCategory}</h5>
                </div>
                <div className="patrimonio-attribute-grid">
                  {attributeColumns.map((attribute) => (
                    <label className="field" key={attribute.key}>
                      <span>{attribute.label}</span>
                      <input
                        value={shared.atributos[attribute.key] ?? ""}
                        onChange={(event) => setSharedAttribute(attribute.key, event.target.value)}
                        disabled={saving}
                      />
                    </label>
                  ))}
                </div>
              </>
            )}

            <div className="patrimonio-add-attribute">
              <input
                value={customAttribute}
                onChange={(event) => setCustomAttribute(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomColumn();
                  }
                }}
                placeholder="Agregar característica, por ejemplo garantía"
              />
              <button type="button" onClick={addCustomColumn} disabled={!customAttribute.trim()}>
                <FaPlus /> Agregar
              </button>
            </div>
          </section>

          <section className="patrimonio-compact-card">
            <div className="patrimonio-compact-heading">
              <div>
                <h4>2. Unidades ({rows.length})</h4>
                <p>
                  Deja vacío lo que hereda del lote. Puedes pegar celdas copiadas desde Excel.
                </p>
              </div>
            </div>

            <div className="patrimonio-batch-grid-wrapper">
              <table className="patrimonio-batch-grid">
                <thead>
                  <tr>
                    <th>#</th>
                    {columns.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      <td className="patrimonio-batch-grid-index">{rowIndex + 1}</td>
                      {columns.map((column) => (
                        <td key={column.key}>
                          <input
                            value={getCell(row, column.key)}
                            onChange={(event) => updateCell(rowIndex, column.key, event.target.value)}
                            onPaste={(event) => handlePaste(event, rowIndex, column.key)}
                            placeholder={
                              column.key === "codigo"
                                ? codes[rowIndex] || "Automático"
                                : column.key === "nombre"
                                  ? shared.nombre || resolvedCategory || ""
                                  : shared.atributos[column.key] || ""
                            }
                            aria-label={`${column.label} fila ${rowIndex + 1}`}
                            disabled={saving}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <footer>
          <button type="button" className="patrimonio-secondary-btn" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="patrimonio-primary-btn" disabled={saving || !resolvedCategory}>
            <FaSave /> {saving ? "Registrando..." : `Registrar ${rows.length} bien(es)`}
          </button>
        </footer>
      </form>
    </div>
  );
}
