const normalizeText = (value) => String(value ?? "").replace(/\r\n/g, "\n");

const normalizeRef = (value) => {
  if (value === undefined || value === null || value === "") return "";
  const normalized = String(value).trim();
  return normalized;
};

const getDatosPdf = (snapshot = {}) => {
  const value = snapshot?.datos_pdf ?? snapshot?.datosPdf ?? {};
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
};

const getItinerary = (snapshot = {}) => {
  const itinerary = getDatosPdf(snapshot)?.itinerary;
  return itinerary && typeof itinerary === "object" && !Array.isArray(itinerary)
    ? itinerary
    : {};
};

const getDays = (snapshot = {}) => {
  const days = getItinerary(snapshot)?.days;
  return Array.isArray(days) ? days : [];
};

const getDayRefs = (snapshot = {}) => {
  const itinerary = getItinerary(snapshot);
  const refs =
    itinerary?.day_refs ||
    itinerary?.dayRefs ||
    itinerary?.day_ids ||
    itinerary?.dayIds ||
    [];
  return Array.isArray(refs) ? refs.map(normalizeRef) : [];
};

const getFlights = (snapshot = {}) => {
  const flights = snapshot?.vuelos_externos ?? snapshot?.vuelosExternos ?? [];
  return Array.isArray(flights) ? flights : [];
};

const dayKey = (day, index, refs) => {
  const ref = normalizeRef(refs[index]);
  if (ref) return `day-ref:${ref}`;

  const id = normalizeRef(
    day?.id ?? day?.dia_id ?? day?.diaId ?? day?.itinerario_dia_id,
  );
  return id ? `day-id:${id}` : `day-index:${index}`;
};

const flightKey = (flight, index) => {
  const id = normalizeRef(flight?.id ?? flight?.flight_id ?? flight?.flightId);
  if (id) return `flight-id:${id}`;

  const number = normalizeRef(
    flight?.flight_number ??
      flight?.flightNumber ??
      flight?.numero_vuelo ??
      flight?.numeroVuelo,
  );
  // La fecha/hora es justamente un dato que puede editar Ventas; no debe
  // participar en la identidad o se mostraría como un vuelo eliminado y otro
  // agregado, en vez de una modificación del mismo vuelo.
  const route = [
    flight?.airline ?? flight?.aerolinea,
    flight?.origin ?? flight?.origen,
    flight?.destination ?? flight?.destino,
  ]
    .map(normalizeRef)
    .filter(Boolean)
    .join("|");
  return number || route ? `flight:${number}|${route}` : `flight-index:${index}`;
};

const buildIndexedRows = (rows, getKey) => {
  const map = new Map();
  rows.forEach((row, index) => {
    const key = getKey(row, index);
    // Los IDs/ref del backend son únicos. En snapshots legacy duplicados,
    // conservar un sufijo hace que el diff siga siendo determinista.
    const uniqueKey = map.has(key) ? `${key}#${index}` : key;
    map.set(uniqueKey, { row, index });
  });
  return map;
};

/**
 * Diff de líneas basado en LCS. Conserva el contexto sin colorear todo el
 * bloque y evidencia claramente una línea añadida o retirada, como un diff de
 * Git, incluso si el texto tiene varias líneas.
 */
export const buildLineDiff = (beforeValue, afterValue) => {
  const before = normalizeText(beforeValue).split("\n");
  const after = normalizeText(afterValue).split("\n");

  if (before.length === 1 && before[0] === "") before.length = 0;
  if (after.length === 1 && after[0] === "") after.length = 0;

  const matrix = Array.from({ length: before.length + 1 }, () =>
    Array(after.length + 1).fill(0),
  );

  for (let beforeIndex = before.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = after.length - 1; afterIndex >= 0; afterIndex -= 1) {
      matrix[beforeIndex][afterIndex] =
        before[beforeIndex] === after[afterIndex]
          ? matrix[beforeIndex + 1][afterIndex + 1] + 1
          : Math.max(
              matrix[beforeIndex + 1][afterIndex],
              matrix[beforeIndex][afterIndex + 1],
            );
    }
  }

  const lines = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  while (beforeIndex < before.length || afterIndex < after.length) {
    if (
      beforeIndex < before.length &&
      afterIndex < after.length &&
      before[beforeIndex] === after[afterIndex]
    ) {
      lines.push({ type: "unchanged", value: before[beforeIndex] });
      beforeIndex += 1;
      afterIndex += 1;
    } else if (
      afterIndex < after.length &&
      (beforeIndex === before.length ||
        matrix[beforeIndex][afterIndex + 1] >=
          matrix[beforeIndex + 1][afterIndex])
    ) {
      lines.push({ type: "added", value: after[afterIndex] });
      afterIndex += 1;
    } else {
      lines.push({ type: "removed", value: before[beforeIndex] });
      beforeIndex += 1;
    }
  }

  return lines;
};

const compareDays = (beforeSnapshot, afterSnapshot) => {
  const beforeDays = getDays(beforeSnapshot);
  const afterDays = getDays(afterSnapshot);
  const beforeRefs = getDayRefs(beforeSnapshot);
  const afterRefs = getDayRefs(afterSnapshot);
  const beforeByKey = buildIndexedRows(beforeDays, (day, index) =>
    dayKey(day, index, beforeRefs),
  );
  const afterByKey = buildIndexedRows(afterDays, (day, index) =>
    dayKey(day, index, afterRefs),
  );
  const keys = [
    ...afterByKey.keys(),
    ...[...beforeByKey.keys()].filter((key) => !afterByKey.has(key)),
  ];

  return keys.map((key) => {
    const before = beforeByKey.get(key);
    const after = afterByKey.get(key);
    const beforeDay = before?.row || null;
    const afterDay = after?.row || null;
    const titleBefore = normalizeText(beforeDay?.title);
    const titleAfter = normalizeText(afterDay?.title);
    const contentBefore = normalizeText(beforeDay?.content);
    const contentAfter = normalizeText(afterDay?.content);
    const state = !beforeDay
      ? "added"
      : !afterDay
        ? "removed"
        : titleBefore === titleAfter && contentBefore === contentAfter
          ? "unchanged"
          : "modified";

    return {
      key,
      state,
      beforeIndex: before?.index ?? null,
      afterIndex: after?.index ?? null,
      number: (after?.index ?? before?.index ?? 0) + 1,
      before: beforeDay,
      after: afterDay,
      titleLines: buildLineDiff(titleBefore, titleAfter),
      contentLines: buildLineDiff(contentBefore, contentAfter),
    };
  });
};

const compareFlights = (beforeSnapshot, afterSnapshot) => {
  const beforeByKey = buildIndexedRows(getFlights(beforeSnapshot), flightKey);
  const afterByKey = buildIndexedRows(getFlights(afterSnapshot), flightKey);
  const keys = [
    ...afterByKey.keys(),
    ...[...beforeByKey.keys()].filter((key) => !afterByKey.has(key)),
  ];

  return keys.map((key) => {
    const before = beforeByKey.get(key)?.row || null;
    const after = afterByKey.get(key)?.row || null;
    return {
      key,
      state: !before
        ? "added"
        : !after
          ? "removed"
          : JSON.stringify(before) === JSON.stringify(after)
            ? "unchanged"
            : "modified",
      before,
      after,
    };
  });
};

const getValueAtPath = (source, path) =>
  path.reduce(
    (value, key) => (value && typeof value === "object" ? value[key] : undefined),
    source,
  );

const GENERAL_FIELDS = [
  { label: "Nombre del paquete", path: ["general", "packageName"] },
  { label: "Agente de viajes", path: ["general", "travelAgent"] },
  { label: "Sistema de pago", path: ["general", "paymentSystem"] },
  { label: "Indicaciones", path: ["indicaciones_pdf"] },
  { label: "Observaciones", path: ["observaciones"] },
];

const compareGeneral = (beforeSnapshot, afterSnapshot) => {
  const before = getDatosPdf(beforeSnapshot);
  const after = getDatosPdf(afterSnapshot);
  return GENERAL_FIELDS.map((field) => {
    const previous = normalizeText(getValueAtPath(before, field.path));
    const next = normalizeText(getValueAtPath(after, field.path));
    return {
      ...field,
      before: previous,
      after: next,
      changed: previous !== next,
      lines: buildLineDiff(previous, next),
    };
  }).filter((field) => field.changed);
};

/**
 * Construye una comparación estable entre dos snapshots persistidos del PDF.
 * La versión más reciente es `after`; la anterior es `before`.
 */
export const buildVoucherPdfVersionDiff = (beforeSnapshot = {}, afterSnapshot = {}) => {
  const days = compareDays(beforeSnapshot, afterSnapshot);
  const flights = compareFlights(beforeSnapshot, afterSnapshot);
  const general = compareGeneral(beforeSnapshot, afterSnapshot);
  const changedDays = days.filter((day) => day.state !== "unchanged");
  const changedFlights = flights.filter((flight) => flight.state !== "unchanged");
  const addedLines = changedDays.reduce(
    (total, day) =>
      total +
      day.titleLines.filter((line) => line.type === "added").length +
      day.contentLines.filter((line) => line.type === "added").length,
    0,
  );
  const removedLines = changedDays.reduce(
    (total, day) =>
      total +
      day.titleLines.filter((line) => line.type === "removed").length +
      day.contentLines.filter((line) => line.type === "removed").length,
    0,
  );

  return {
    itineraryTitle: {
      before: normalizeText(getItinerary(beforeSnapshot)?.title),
      after: normalizeText(getItinerary(afterSnapshot)?.title),
    },
    days,
    flights,
    general,
    summary: {
      changedDays: changedDays.length,
      changedFlights: changedFlights.length,
      changedFields: general.length,
      addedLines,
      removedLines,
      hasChanges:
        changedDays.length > 0 || changedFlights.length > 0 || general.length > 0,
    },
  };
};

export const getVoucherPdfSnapshotDays = getDays;
export const getVoucherPdfSnapshotFlights = getFlights;
