import { ATTRIBUTE_LABELS, EMPTY_FORM, ESTADOS, TIPOS_MOVIMIENTO } from "./constants";

export const getResponseData = (response, fallback = null) =>
  response?.data?.data ?? response?.data ?? fallback;

export const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-PE");
};

export const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const normalizeCode = (value) => {
  const cleaned = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/[^A-Z0-9-]/g, "");
  const compact = cleaned.replace(/-/g, "");
  const match = compact.match(/^([A-Z]+)0*(\d+)$/);
  if (!match) return cleaned;
  return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}`;
};

export const itemInfo = (item) =>
  item?.info && typeof item.info === "object" && !Array.isArray(item.info)
    ? item.info
    : {};

export const itemName = (item) =>
  itemInfo(item).nombre || item?.categoria || "Bien patrimonial";
export const itemDescription = (item) => itemInfo(item).descripcion || "";
export const itemState = (item) => itemInfo(item).estado || "operativo";
export const itemLocation = (item) => itemInfo(item).ubicacion || "";
export const itemAlternateCodes = (item) =>
  Array.isArray(itemInfo(item).codigos_alternos) ? itemInfo(item).codigos_alternos : [];
export const itemBarcode = (item) =>
  itemInfo(item).codigo_barras?.valor || item?.codigo || "";
export const itemAttributes = (item) => {
  const attributes = itemInfo(item).atributos;
  return attributes && typeof attributes === "object" && !Array.isArray(attributes)
    ? attributes
    : {};
};
export const itemResponsibles = (item) =>
  Array.isArray(itemInfo(item).responsables) ? itemInfo(item).responsables : [];

export const responsibleLabel = (responsible) => {
  if (!responsible || typeof responsible !== "object") return "Sin identificar";
  const name = String(responsible.nombre || "").trim();
  const dni = String(responsible.dni || "").trim();
  if (name && dni) return `${name} · ${dni}`;
  return name || dni || "Sin identificar";
};

export const primaryResponsibleLabel = (item) => {
  const responsibles = itemResponsibles(item);
  if (!responsibles.length) return "Sin asignar";
  const first = responsibleLabel(responsibles[0]);
  return responsibles.length > 1 ? `${first} +${responsibles.length - 1}` : first;
};

export const stateLabel = (value) =>
  ESTADOS.find((state) => state.value === value)?.label || value || "Sin estado";

export const movementTypeLabel = (value) =>
  TIPOS_MOVIMIENTO.find((type) => type.value === value)?.label ||
  String(value || "Movimiento").replace(/_/g, " ");

const parseAlternateCodes = (value) =>
  [...new Set(
    String(value || "")
      .split(/[\n,;]+/)
      .map(normalizeCode)
      .filter(Boolean),
  )];

const editableAttributeValue = (value) => {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return value;
};

export const toForm = (item = {}) => {
  const info = itemInfo(item);
  const primaryResponsible = itemResponsibles(item)[0] || {};
  const attributes = Object.entries(itemAttributes(item)).reduce((result, [key, value]) => {
    result[key] = editableAttributeValue(value);
    return result;
  }, {});

  return {
    ...EMPTY_FORM,
    codigo: item.codigo || "",
    categoria: item.categoria || "",
    nombre: info.nombre || "",
    descripcion: info.descripcion || "",
    estado: info.estado || "operativo",
    ubicacion: info.ubicacion || "",
    responsable_nombre: primaryResponsible.nombre || "",
    responsable_dni: primaryResponsible.dni || "",
    codigos_alternos_text: Array.isArray(info.codigos_alternos)
      ? info.codigos_alternos.join("\n")
      : "",
    atributos: attributes,
  };
};

const ARRAY_ATTRIBUTE_KEYS = new Set([
  "cargadores_relacionados",
  "laptops_relacionadas",
  "equipos_relacionados",
]);

const normalizeAttributeValue = (key, value) => {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  if (ARRAY_ATTRIBUTE_KEYS.has(key)) {
    return String(value)
      .split(/[\n,;]+/)
      .map((entry) => normalizeCode(entry) || entry.trim())
      .filter(Boolean);
  }
  if (key === "ram_gb") {
    const number = Number(value);
    return Number.isFinite(number) ? number : String(value).trim();
  }
  return typeof value === "string" ? value.trim() : value;
};

export const toPayload = (form) => {
  const attributes = Object.entries(form.atributos || {}).reduce((result, [key, value]) => {
    const normalized = normalizeAttributeValue(key, value);
    if (normalized !== null && normalized !== "") result[key] = normalized;
    return result;
  }, {});

  return {
    codigo: normalizeCode(form.codigo) || null,
    categoria: form.categoria.trim(),
    responsable_actual: {
      nombre: form.responsable_nombre.trim() || null,
      dni: form.responsable_dni.trim() || null,
    },
    info: {
      nombre: form.nombre.trim() || form.categoria.trim(),
      descripcion: form.descripcion.trim() || null,
      estado: form.estado,
      ubicacion: form.ubicacion.trim() || null,
      codigos_alternos: parseAlternateCodes(form.codigos_alternos_text),
      atributos: attributes,
    },
  };
};

export const attributeLabel = (key) =>
  ATTRIBUTE_LABELS[key] ||
  String(key)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const formatAttributeValue = (value) => {
  if (Array.isArray(value)) return value.join(", ") || "-";
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, nested]) => `${attributeLabel(key)}: ${formatAttributeValue(nested)}`)
      .join(" · ");
  }
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
};

export const itemSpecifications = (item, limit = 3) =>
  Object.entries(itemAttributes(item))
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, limit)
    .map(([key, value]) => `${attributeLabel(key)}: ${formatAttributeValue(value)}`)
    .join(" · ");

export const buildMovementPayload = (movement, currentItem) => {
  const info = {
    observacion: movement.observacion.trim() || undefined,
  };
  const responsible = {
    nombre: movement.responsable_nombre.trim() || undefined,
    dni: movement.responsable_dni.trim() || undefined,
  };

  if (["asignacion", "reasignacion"].includes(movement.tipo)) {
    info.responsable_nuevo = responsible;
  }
  if (movement.tipo === "devolucion" && (responsible.nombre || responsible.dni)) {
    info.responsable_salida = responsible;
  }
  if (movement.tipo === "traslado") {
    info.ubicacion_nueva = movement.ubicacion_nueva.trim();
  }
  if (movement.tipo === "cambio_estado") {
    info.estado_nuevo = movement.estado_nuevo;
  }
  if (movement.tipo === "mantenimiento") info.estado_nuevo = "mantenimiento";
  if (movement.tipo === "alta") info.estado_nuevo = "operativo";
  if (movement.tipo === "baja") info.estado_nuevo = "baja";

  return {
    tipo: movement.tipo,
    info: {
      ...info,
      item_nombre: itemName(currentItem),
    },
  };
};

export const movementInfo = (movement) =>
  movement?.info && typeof movement.info === "object" && !Array.isArray(movement.info)
    ? movement.info
    : {};
