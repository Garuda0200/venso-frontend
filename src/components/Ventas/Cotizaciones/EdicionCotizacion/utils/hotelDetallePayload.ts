export const PRICE_LABEL_PREFIX = "price-label-";

const hasOwn = (obj, key) =>
  Object.prototype.hasOwnProperty.call(obj || {}, key);

const buildNodeFromHtml = (doc, html) => {
  const wrap = doc.createElement("div");
  wrap.innerHTML = String(html || "").trim();
  return wrap.firstElementChild;
};

const emptyMainBlock = () => ({
  title: "",
  subtitle: "",
  rows: [],
});

const emptyHotelDetalle = () => ({
  version: 4,
  main: emptyMainBlock(),
  nota: "",
  priceLabelTexts: {},
});

const HOTEL_DETALLE_LANGS = ["es", "en", "pt"];

const CP1252_REVERSE = new Map(
  Object.entries({
    "\u20ac": 0x80,
    "\u201a": 0x82,
    "\u0192": 0x83,
    "\u201e": 0x84,
    "\u2026": 0x85,
    "\u2020": 0x86,
    "\u2021": 0x87,
    "\u02c6": 0x88,
    "\u2030": 0x89,
    "\u0160": 0x8a,
    "\u2039": 0x8b,
    "\u0152": 0x8c,
    "\u017d": 0x8e,
    "\u2018": 0x91,
    "\u2019": 0x92,
    "\u201c": 0x93,
    "\u201d": 0x94,
    "\u2022": 0x95,
    "\u2013": 0x96,
    "\u2014": 0x97,
    "\u02dc": 0x98,
    "\u2122": 0x99,
    "\u0161": 0x9a,
    "\u203a": 0x9b,
    "\u0153": 0x9c,
    "\u017e": 0x9e,
    "\u0178": 0x9f,
  }),
);

const MOJIBAKE_PATTERN =
  /[\u00c2\u00c3\u00c5\u00e2\u00f0][\u0080-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2018-\u201e\u2020-\u2022\u2026\u2030\u2039\u203a\u20ac\u2122]+/g;

const cp1252ByteFromChar = (char) => {
  const code = char.charCodeAt(0);
  if (code <= 0xff) return code;
  return CP1252_REVERSE.get(char) ?? null;
};

const decodeMojibakeSegment = (segment) => {
  if (typeof TextDecoder === "undefined") return segment;

  const bytes = [];
  for (const char of segment) {
    const byte = cp1252ByteFromChar(char);
    if (byte == null) return segment;
    bytes.push(byte);
  }

  const decoded = new TextDecoder("utf-8").decode(Uint8Array.from(bytes));
  return decoded.includes("\ufffd") ? segment : decoded;
};

export const repairMojibakeText = (value) => {
  let text = String(value ?? "");
  if (!/[\u00c2\u00c3\u00c5\u00e2\u00f0]/.test(text)) return text;

  for (let index = 0; index < 4; index += 1) {
    const next = text
      .replace(MOJIBAKE_PATTERN, decodeMojibakeSegment)
      .replace(/ÃƒÂ¡|Ã¡/g, "á")
      .replace(/ÃƒÂ©|Ã©/g, "é")
      .replace(/ÃƒÂ­|Ãƒ­|Ã­/g, "í")
      .replace(/ÃƒÂ³|Ã³/g, "ó")
      .replace(/ÃƒÂº|Ãº/g, "ú")
      .replace(/ÃƒÂ±|Ã±/g, "ñ")
      .replace(/ÃƒÂ¼|Ã¼/g, "ü")
      .replace(/ÃƒÂ|Ã/g, "Á")
      .replace(/ÃƒÂ‰|Ãƒâ€°|Ã‰/g, "É")
      .replace(/ÃƒÂ|Ã/g, "Í")
      .replace(/ÃƒÂ“|Ãƒâ€œ|Ã“/g, "Ó")
      .replace(/ÃƒÂš|ÃƒÅ¡|Ãš/g, "Ú")
      .replace(/ÃƒÂ‘|Ãƒâ€˜|Ã‘/g, "Ñ")
      .replace(/ÃƒÂœ|ÃƒÅ“|Ãœ/g, "Ü")
      .replace(/â€œ/g, "“")
      .replace(/â€/g, "”")
      .replace(/â€˜/g, "‘")
      .replace(/â€™/g, "’")
      .replace(/â€¦/g, "…")
      .replace(/â€“/g, "–")
      .replace(/â€”/g, "—")
      .replace(/â†’/g, "→")
      .replace(/â€¢/g, "•")
      .replace(/Â¿/g, "¿")
      .replace(/Â¡/g, "¡")
      .replace(/Â°/g, "°")
      .replace(/Â/g, "");
    if (next === text) break;
    text = next;
  }

  return text.replace(/\ufffd/g, "");
};

export const normalizeMojibakeValue = (value) => {
  if (typeof value === "string") return repairMojibakeText(value);
  if (Array.isArray(value)) return value.map(normalizeMojibakeValue);
  if (value && typeof value === "object") {
    return Object.entries(value).reduce((accumulator, [key, item]) => {
      accumulator[repairMojibakeText(key)] = normalizeMojibakeValue(item);
      return accumulator;
    }, {});
  }
  return value;
};

const cleanText = (value) => repairMojibakeText(value).trim();

const isHotelDetalleLanguageMap = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.version != null || value.main != null || value.fullHtml != null) {
    return false;
  }
  return HOTEL_DETALLE_LANGS.some((lang) => value[lang] != null);
};

export const getHotelDetalleLanguagePayload = (value, idioma = "es") => {
  if (!isHotelDetalleLanguageMap(value)) return value;

  const preferredLang = HOTEL_DETALLE_LANGS.includes(idioma) ? idioma : "es";
  return (
    value[preferredLang] ??
    value.es ??
    value.en ??
    value.pt ??
    null
  );
};

export const normalizeHotelDetalleTranslations = (value) => {
  const source = normalizeMojibakeValue(value);
  const entries = {};

  if (isHotelDetalleLanguageMap(source)) {
    HOTEL_DETALLE_LANGS.forEach((lang) => {
      const normalized = normalizeHotelDetallePayload(source[lang]);
      if (normalized) entries[lang] = normalized;
    });
    return Object.keys(entries).length ? entries : { es: null };
  }

  const normalized = normalizeHotelDetallePayload(source);
  return normalized ? { es: normalized } : { es: null };
};

export const selectHotelDetalleLanguage = (value, idioma = "es") => {
  const translations = normalizeHotelDetalleTranslations(value);
  const preferredLang = HOTEL_DETALLE_LANGS.includes(idioma) ? idioma : "es";
  return (
    translations[preferredLang] ??
    translations.es ??
    translations.en ??
    translations.pt ??
    null
  );
};

export const upsertHotelDetalleLanguage = (
  value,
  idioma = "es",
  detalle = null,
) => {
  const translations = normalizeHotelDetalleTranslations(value);
  const targetLang = HOTEL_DETALLE_LANGS.includes(idioma) ? idioma : "es";
  translations[targetLang] = normalizeHotelDetallePayload(detalle);
  return HOTEL_DETALLE_LANGS.reduce((accumulator, lang) => {
    if (translations[lang]) accumulator[lang] = translations[lang];
    return accumulator;
  }, {});
};

const AUTO_MAIN_COLUMNS = new Set([
  "noches",
  "destino",
  "fecha",
  "dias",
  "titulo",
]);

const normalizeMainRow = (row) => {
  const cells = Array.isArray(row?.cells)
    ? row.cells.map((cell) => cleanText(cell))
    : [];
  const columns =
    row?.columns && typeof row.columns === "object" && !Array.isArray(row.columns)
      ? Object.entries(row.columns).reduce((accumulator, [key, text]) => {
          if (!key) return accumulator;
          return {
            ...accumulator,
            [key]: cleanText(text),
          };
        }, {})
      : {};
  const manualColumns =
    row?.manualColumns &&
    typeof row.manualColumns === "object" &&
    !Array.isArray(row.manualColumns)
      ? Object.entries(row.manualColumns).reduce((accumulator, [key, value]) => {
          if (!key || !value) return accumulator;
          return { ...accumulator, [key]: true };
        }, {})
      : {};

  return Object.keys(columns).length > 0
    ? {
        cells,
        columns,
        ...(Object.keys(manualColumns).length > 0 ? { manualColumns } : {}),
      }
    : { cells };
};

const normalizeMainBlock = (main) => {
  if (!main || typeof main !== "object" || Array.isArray(main)) {
    return emptyMainBlock();
  }

  return {
    title: cleanText(main.title ?? main.headerTitle ?? ""),
    subtitle: cleanText(main.subtitle ?? main.headerSubtitle ?? ""),
    rows: Array.isArray(main.rows)
      ? main.rows.map(normalizeMainRow)
      : [],
  };
};

const extractMainBlockFromRoot = (root, baselineRoot = null) => {
  const mainEl = root?.querySelector?.('[data-preview-block-id="main"]');
  if (!mainEl) return emptyMainBlock();

  const baselineRows = baselineRoot
    ? Array.from(
        baselineRoot.querySelectorAll?.(
          '[data-preview-block-id="main"] tbody tr',
        ) || [],
      )
    : [];

  const directChildren = Array.from(mainEl.children || []);
  const tableRows = Array.from(mainEl.querySelectorAll("tbody tr")).map(
    (row, rowIndex) => {
      const cells = Array.from(row.children || []);
      const baselineCells = Array.from(baselineRows[rowIndex]?.children || []);
      const manualColumns = {};
      const columns = cells.reduce((accumulator, cell) => {
        const columnName = cell.getAttribute?.("data-preview-column");
        if (!columnName) return accumulator;
        const text = cleanText(cell.textContent || "");
        const baselineCell = baselineCells.find(
          (item) => item.getAttribute?.("data-preview-column") === columnName,
        );
        const baselineText = cleanText(baselineCell?.textContent || "");
        if (baselineCell && text !== baselineText) {
          manualColumns[columnName] = true;
        }
        return {
          ...accumulator,
          [columnName]: text,
        };
      }, {});

      return normalizeMainRow({
        cells: cells.map((cell) => cleanText(cell.textContent || "")),
        columns,
        manualColumns,
      });
    },
  );

  const titleChild = directChildren.find(
    (el) => el.tagName !== "THEAD" && el.tagName !== "TBODY",
  );
  const subtitleChild = directChildren.filter(
    (el) => el.tagName !== "THEAD" && el.tagName !== "TBODY",
  )[1];

  return {
    title: cleanText(titleChild?.textContent || ""),
    subtitle: cleanText(subtitleChild?.textContent || ""),
    rows: tableRows,
  };
};

export const extractEditableBlocksFromHtml = (html, baselineHtml = "") => {
  const empty = emptyHotelDetalle();

  if (!html || typeof DOMParser === "undefined") return empty;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const root = doc.body.firstElementChild;
    const baselineRoot = baselineHtml
      ? parser.parseFromString(baselineHtml, "text/html").body.firstElementChild
      : null;

    if (!root) return empty;

    const noteEl = root.querySelector('[data-preview-block-id="note"]');
    const nota = noteEl ? cleanText(noteEl.textContent || "") : "";

    const priceLabelTexts = {};
    root
      .querySelectorAll(`[data-preview-block-id^="${PRICE_LABEL_PREFIX}"]`)
      .forEach((el) => {
        const blockId = el.getAttribute("data-preview-block-id") || "";
        const catKey = blockId.replace(PRICE_LABEL_PREFIX, "");
        if (catKey) {
          priceLabelTexts[catKey] = cleanText(el.textContent || "");
        }
      });

    return {
      version: 4,
      main: extractMainBlockFromRoot(root, baselineRoot),
      nota,
      priceLabelTexts,
    };
  } catch {
    return empty;
  }
};

export const normalizeHotelDetallePayload = (value) => {
  if (!value) return null;

  value = normalizeMojibakeValue(value);

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") {
        return normalizeHotelDetallePayload(parsed);
      }
    } catch {
      return extractEditableBlocksFromHtml(value);
    }
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  if (isHotelDetalleLanguageMap(value)) {
    return normalizeHotelDetallePayload(getHotelDetalleLanguagePayload(value));
  }

  if (
    value.version === 4 ||
    value.main != null ||
    value.nota != null ||
    value.priceLabelTexts != null ||
    value.note != null
  ) {
    const hasMainOverrides = value.version === 4 || value.main != null;
    return {
      version: hasMainOverrides ? 4 : 3,
      main: hasMainOverrides ? normalizeMainBlock(value.main) : null,
      nota: cleanText(value.nota ?? value.note ?? ""),
      priceLabelTexts: Object.entries(value.priceLabelTexts || {}).reduce(
        (accumulator, [key, text]) => ({
          ...accumulator,
          [key]: cleanText(text),
        }),
        {},
      ),
    };
  }

  const fullHtml =
    value.fullHtml ||
    value.html ||
    value.previewHtml ||
    value.hotelDetalleHtml ||
    "";

  const blocks = {
    main: value?.blocks?.main || "",
    note: value?.blocks?.note || "",
    priceLabels: { ...(value?.blocks?.priceLabels || {}) },
  };

  const hasBlocks =
    blocks.main || blocks.note || Object.keys(blocks.priceLabels).length > 0;

  if (hasBlocks) {
    // Migrate legacy version 2 (blocks with raw HTML) to version 4.
    // Reconstruct full HTML from blocks, then extract structured data.
    const legacyHtml = fullHtml || blocks.main || "";
    if (legacyHtml && typeof DOMParser !== "undefined") {
      const extracted = extractEditableBlocksFromHtml(legacyHtml);
      if (extracted && extracted.version === 4) return extracted;
    }
    return { version: 2, fullHtml, blocks };
  }

  if (fullHtml) {
    return extractEditableBlocksFromHtml(fullHtml);
  }

  return null;
};

export const stableHotelDetalleString = (value) =>
  JSON.stringify(normalizeHotelDetallePayload(value) || null);

const applyStructuredDetalle = (generatedRoot, normalized) => {
  const mainEl = generatedRoot.querySelector('[data-preview-block-id="main"]');

  if (mainEl && normalized.main) {
    const main = normalizeMainBlock(normalized.main);
    const directChildren = Array.from(mainEl.children || []);
    const titleChild = directChildren.find(
      (el) => el.tagName !== "THEAD" && el.tagName !== "TBODY",
    );
    const subtitleChild = directChildren.filter(
      (el) => el.tagName !== "THEAD" && el.tagName !== "TBODY",
    )[1];

    if (titleChild && hasOwn(main, "title")) {
      titleChild.textContent = main.title;
    }
    if (subtitleChild && hasOwn(main, "subtitle")) {
      subtitleChild.textContent = main.subtitle;
    }

    const generatedRows = Array.from(mainEl.querySelectorAll("tbody tr"));
    main.rows.forEach((savedRow, rowIndex) => {
      const targetRow = generatedRows[rowIndex];
      if (!targetRow) return;

      const targetCells = Array.from(targetRow.children || []);
      const savedColumns =
        savedRow?.columns &&
        typeof savedRow.columns === "object" &&
        !Array.isArray(savedRow.columns)
          ? savedRow.columns
          : {};

      const manualColumns =
        savedRow?.manualColumns &&
        typeof savedRow.manualColumns === "object" &&
        !Array.isArray(savedRow.manualColumns)
          ? savedRow.manualColumns
          : {};

      if (hasOwn(savedColumns, "titulo") && manualColumns.titulo) {
        const targetTitleCell = targetCells.find(
          (cell) => cell.getAttribute("data-preview-column") === "titulo",
        );
        if (targetTitleCell) {
          targetTitleCell.textContent = String(savedColumns.titulo ?? "");
          return;
        }
      }

      (savedRow?.cells || []).forEach((text, cellIndex) => {
        const targetCell = targetCells[cellIndex];
        if (!targetCell) return;

        // Keep live automatic columns derived from the quote; allow edited itinerary text.
        const columnName = targetCell.getAttribute("data-preview-column");
        if (AUTO_MAIN_COLUMNS.has(columnName)) {
          return;
        }

        targetCell.textContent = String(text ?? "");
      });
    });
  }

  const noteEl = generatedRoot.querySelector('[data-preview-block-id="note"]');
  if (noteEl) {
    noteEl.textContent = String(normalized.nota ?? "");
  }

  Object.entries(normalized.priceLabelTexts || {}).forEach(([cat, text]) => {
    const el = generatedRoot.querySelector(
      `[data-preview-block-id="${PRICE_LABEL_PREFIX}${cat}"]`,
    );
    if (el) {
      el.textContent = String(text ?? "");
    }
  });
};

export const applyHotelDetalleToGeneratedHtml = (
  generatedHtml,
  hotelDetalle,
) => {
  const normalized = normalizeHotelDetallePayload(hotelDetalle);

  if (!generatedHtml) return "";
  if (!normalized) return generatedHtml;

  try {
    const parser = new DOMParser();
    const generatedDoc = parser.parseFromString(generatedHtml, "text/html");
    const generatedRoot = generatedDoc.body.firstElementChild;

    if (!generatedRoot) return generatedHtml;

    if (normalized.version === 2) {
      const replaceBlock = (selector, html) => {
        if (!html) return;
        const target = generatedRoot.querySelector(selector);
        const incoming = buildNodeFromHtml(generatedDoc, html);
        if (target && incoming) {
          target.replaceWith(incoming);
        }
      };

      replaceBlock('[data-preview-block-id="main"]', normalized?.blocks?.main);
      replaceBlock('[data-preview-block-id="note"]', normalized?.blocks?.note);

      Object.entries(normalized?.blocks?.priceLabels || {}).forEach(
        ([catKey, html]) => {
          replaceBlock(
            `[data-preview-block-id="${PRICE_LABEL_PREFIX}${catKey}"]`,
            html,
          );
        },
      );

      return generatedRoot.outerHTML || generatedHtml;
    }

    applyStructuredDetalle(generatedRoot, normalized);
    return generatedRoot.outerHTML || generatedHtml;
  } catch {
    return generatedHtml;
  }
};
