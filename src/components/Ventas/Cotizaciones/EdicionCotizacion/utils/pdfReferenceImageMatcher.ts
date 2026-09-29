import { mediaService, toBackendUrl } from "../../../../../services/mediaService";
import { resolveVensoCanvaCoverImages } from "./vensoPdfCanvaDesign";

const LAYOUT_BY_COUNT = {
  1: "1",
  2: "2",
};

const PHRASES = [
  ["machu picchu", "machupicchu", "llacta", "aguas calientes"],
  ["huayna picchu", "huaynapicchu"],
  ["montana de colores", "montaña de colores", "vinicunca", "rainbow mountain"],
  ["laguna humantay", "humantay"],
  ["7 lagunas", "siete lagunas", "ausangate"],
  ["valle sagrado", "sacred valley"],
  ["ollantaytambo"],
  ["pisac", "pisaq"],
  ["maras"],
  ["moray"],
  ["chinchero"],
  ["city tour", "qoricancha", "koricancha", "sacsayhuaman", "tambomachay"],
  ["cusco", "cuzco", "plaza de armas"],
  ["camino inca", "inca trail"],
  ["islas ballestas", "ballestas"],
  ["huacachina", "oasis"],
  ["lima", "colonial", "moderno", "miraflores", "barranco"],
  ["puno", "titicaca", "uros", "taquile"],
  ["paracas", "ica", "islas ballestas"],
  ["vinedos", "viñedos", "bodega", "vino"],
  ["tubulares", "sandboarding", "buggy", "dunas"],
  ["tren", "train"],
  ["pachamanca"],
  ["restaurante", "almuerzo", "cena", "comida", "buffet"],
  ["recojo", "traslado", "transfer", "aeropuerto", "hotel"],
];

export const normalizePdfImageText = (value = "") =>
  String(value)
    .replace(/Ã±/g, "ñ")
    .replace(/Ã¡/g, "á")
    .replace(/Ã©/g, "é")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Ã/g, "Á")
    .replace(/Ã‰/g, "É")
    .replace(/Ã/g, "Í")
    .replace(/Ã“/g, "Ó")
    .replace(/Ãš/g, "Ú")
    .replace(/Â/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const cleanDisplayText = (value = "") =>
  String(value)
    .replace(/Ã±/g, "ñ")
    .replace(/Ã¡/g, "á")
    .replace(/Ã©/g, "é")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Â/g, "");

const categoryLeaf = (category = "") =>
  cleanDisplayText(category).split("/").map((part) => part.trim()).filter(Boolean).pop() ||
  cleanDisplayText(category) ||
  "Imagen referencial";

const displayTitleForImage = (title = "", category = "") => {
  const cleanedTitle = cleanDisplayText(title);
  const normalizedTitle = normalizePdfImageText(cleanedTitle);
  const isCameraName =
    /^(img|dsc|wa|whatsapp|caption|pexels|unnamed|imagen de whatsapp)\b/.test(
      normalizedTitle,
    ) || /^[a-f0-9-]{18,}$/.test(normalizedTitle.replace(/\s+/g, ""));
  return isCameraName || !cleanedTitle ? categoryLeaf(category) : cleanedTitle;
};

const parseReferenceTags = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => cleanDisplayText(item));
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.filter(Boolean).map((item) => cleanDisplayText(item));
  } catch {
    // Keep parsing below for legacy comma-separated values.
  }
  return trimmed
    .split(/[,;\n]+/)
    .map((item) => cleanDisplayText(item).trim())
    .filter(Boolean);
};


const normalizeDayIndex = (value) => {
  const numeric = Number.parseInt(value, 10);
  return Number.isFinite(numeric) ? numeric : null;
};

export const normalizePdfMediaDaysForInfoPdf = (pdfMedia = {}, infoPdf = []) => {
  const rawDays = pdfMedia?.days && typeof pdfMedia.days === "object" ? pdfMedia.days : {};
  const keys = Object.keys(rawDays);
  if (!keys.length) return {};

  const hasZeroKey = Object.prototype.hasOwnProperty.call(rawDays, "0") || Object.prototype.hasOwnProperty.call(rawDays, 0);
  const numericKeys = keys.map(normalizeDayIndex).filter((value) => value !== null);
  const looksOneBased =
    !hasZeroKey &&
    numericKeys.length > 0 &&
    numericKeys.every((value) => value >= 1) &&
    numericKeys.some((value) => value <= Math.max(1, infoPdf.length));

  const normalized = {};
  if (looksOneBased) {
    keys.forEach((key) => {
      const index = normalizeDayIndex(key);
      if (index === null) return;
      normalized[index - 1] = rawDays[key];
    });
  } else {
    keys.forEach((key) => {
      normalized[key] = rawDays[key];
    });
  }

  (Array.isArray(infoPdf) ? infoPdf : []).forEach((day, index) => {
    const candidates = [
      index,
      String(index),
      day?.pdf_day_index,
      day?.pdfDayIndex,
      day?.numero,
      day?.dia,
      String(day?.numero ?? ""),
      String(day?.dia ?? ""),
    ].filter((value) => value !== undefined && value !== null && value !== "");

    for (const candidate of candidates) {
      if (Object.prototype.hasOwnProperty.call(rawDays, candidate)) {
        normalized[index] = rawDays[candidate];
        break;
      }
    }
  });

  return normalized;
};

const hashString = (value = "") => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const seededPick = (items, seed, count) => {
  const scored = items.map((item, index) => ({
    item,
    score: hashString(`${seed}|${item.id || item.src || index}`),
  }));
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .map(({ item }) => item);
};

const imageSearchTextCache = new Map();
const IMAGE_SEARCH_TEXT_CACHE_MAX_SIZE = 5000;

export const imageSearchText = (image) => {
  const cacheKey = image?.id || image?.src || image?.originalSrc || image?.tigrisKey || String(image);
  const cached = imageSearchTextCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const value = normalizePdfImageText(
    [
      image?.title,
      image?.displayTitle,
      image?.display_title,
      image?.category,
      ...(Array.isArray(image?.tags) ? image.tags : parseReferenceTags(image?.tags)),
      image?.searchText,
      image?.search_text,
      image?.originalFilename,
      image?.original_filename,
      image?.originalSrc,
      image?.original_src,
      image?.tigrisKey,
      image?.tigris_key,
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (imageSearchTextCache.size >= IMAGE_SEARCH_TEXT_CACHE_MAX_SIZE) {
    const firstKey = imageSearchTextCache.keys().next().value;
    imageSearchTextCache.delete(firstKey);
  }
  imageSearchTextCache.set(cacheKey, value);
  return value;
};

export const buildDayImageSeedText = (day) =>
  normalizePdfImageText(
    [
      day?.titulo,
      day?.descripcion,
      ...(Array.isArray(day?.ciudades) ? day.ciudades : []),
      ...(Array.isArray(day?.tipo_servicio) ? day.tipo_servicio : []),
      ...(Array.isArray(day?.incluye) ? day.incluye : []),
      ...(Array.isArray(day?.recomendaciones) ? day.recomendaciones : []),
      ...(Array.isArray(day?.servicios_resumen)
        ? day.servicios_resumen.map(
            (item) => `${item?.tipo || ""} ${item?.nombre || ""}`,
          )
        : []),
    ]
      .filter(Boolean)
      .join(" "),
  );


const ABSOLUTE_TIGRIS_RE = /^https?:\/\/[^/]*fly\.storage\.tigris\.dev\//i;
const configuredTigrisOrigin = String(
  import.meta.env.VITE_TIGRIS_PUBLIC_ORIGIN || "",
).replace(/\/+$/, "");

const decodeProxySourceUrl = (url = "") => {
  if (typeof url !== "string" || !url.includes("/upload/tigris/proxy")) return "";
  try {
    const parsed = new URL(url, window.location?.origin || "http://localhost");
    return parsed.searchParams.get("url") || "";
  } catch {
    const match = url.match(/[?&]url=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }
};

const tigrisOriginFrom = (...values) => {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const decoded = decodeProxySourceUrl(value) || value;
    const match = decoded.match(/^(https?:\/\/[^/]*fly\.storage\.tigris\.dev)\//i);
    if (match) return match[1];
  }
  // Relative reference-image keys belong to the storage configured for this
  // deployment. Never fall back to a legacy bucket from another system.
  return configuredTigrisOrigin;
};

const normalizeReferenceAssetPath = (value = "") => {
  if (typeof value !== "string") return "";
  const decoded = decodeProxySourceUrl(value) || value;
  if (!decoded) return "";
  if (ABSOLUTE_TIGRIS_RE.test(decoded)) return decoded;
  if (decoded.startsWith("/pdf-reference-images/") || decoded.startsWith("pdf-reference-images/")) {
    return decoded.replace(/^\//, "");
  }
  return decoded;
};

const toTigrisReferenceUrl = (value = "", originSeed = "") => {
  const normalized = normalizeReferenceAssetPath(value);
  if (!normalized) return "";
  if (ABSOLUTE_TIGRIS_RE.test(normalized)) return normalized;
  if (normalized.startsWith("pdf-reference-images/")) {
    const origin = tigrisOriginFrom(originSeed, value);
    return origin ? `${origin}/${normalized}` : normalized;
  }
  return normalized;
};

const getReferenceStorageSrc = (image) => {
  if (!image) return null;
  if (typeof image === "string") return toTigrisReferenceUrl(image) || image;
  if (typeof image !== "object") return null;

  const originSeed = image.tigrisUrl || image.tigris_url || image.src || image.proxyUrl || image.proxy_url;
  return (
    toTigrisReferenceUrl(image.originalSrc || image.original_src, originSeed) ||
    toTigrisReferenceUrl(image.src, originSeed) ||
    toTigrisReferenceUrl(image.tigrisUrl || image.tigris_url, originSeed) ||
    toTigrisReferenceUrl(image.url, originSeed) ||
    null
  );
};

const referencePreviewSrcMap = new Map();

export const getReferenceImagePreviewSrc = (src = "") => {
  if (!src) return "";
  const normalized = normalizeReferenceAssetPath(src);
  return referencePreviewSrcMap.get(normalized) || "";
};

export const normalizeReferenceManifest = (manifest) => {
  const rawImages = Array.isArray(manifest?.images) ? manifest.images : [];
  referencePreviewSrcMap.clear();

  const seenKeys = new Set();
  const images = [];

  rawImages.forEach((image) => {
    const proxyUrl = toBackendUrl(
      image.proxyUrl || image.proxy_url || image.previewSrc || image.preview_src,
    );
    const previewSrc = toBackendUrl(
      image.previewSrc || image.preview_src || image.proxyUrl || image.proxy_url || image.src,
    );
    const storageSrc = getReferenceStorageSrc(image);

    // Deduplicate by the canonical storage src (or tigrisKey/proxyUrl fallback).
    const dedupKey =
      storageSrc ||
      image.tigrisKey ||
      image.tigris_key ||
      image.src ||
      image.tigrisUrl ||
      image.tigris_url ||
      proxyUrl;
    if (dedupKey) {
      const normalizedKey = normalizeReferenceAssetPath(dedupKey);
      if (seenKeys.has(normalizedKey)) return;
      seenKeys.add(normalizedKey);
    }

    if (storageSrc) {
      const normalizedStorage = normalizeReferenceAssetPath(storageSrc);
      if (normalizedStorage && previewSrc) {
        referencePreviewSrcMap.set(normalizedStorage, previewSrc);
      }
    }

    images.push({
      ...image,
      // Keep pdf_media compatible with the original behavior: store the real
      // Tigris reference image URL, not the backend proxy URL. The renderer
      // converts it to proxy only at <img> time.
      src: storageSrc || image.src || image.tigrisUrl || image.tigris_url || "",
      previewSrc,
      proxyUrl,
      originalSrc: storageSrc || image.src || image.tigrisUrl || image.tigris_url || "",
      title: cleanDisplayText(image.title || ""),
      category: cleanDisplayText(image.category || "General"),
      tags: parseReferenceTags(image.tags),
      searchText: image.searchText || image.search_text || "",
      originalFilename: image.originalFilename || image.original_filename || "",
      tigrisKey: image.tigrisKey || image.tigris_key || "",
      displayTitle:
        cleanDisplayText(image.displayTitle || image.display_title || "") ||
        displayTitleForImage(image.title, image.category),
    });
  });

  const categories = [
    ...new Set(
      (Array.isArray(manifest?.categories)
        ? manifest.categories
        : images.map((image) => image.category)
      )
        .map(cleanDisplayText)
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));

  return { images, categories };
};

// Cache scoring results because the same image/seed combinations are evaluated
// many times when building auto media for multiple days.
const scoreReferenceImageCache = new Map();
const SCORE_CACHE_MAX_SIZE = 5000;

export const scoreReferenceImage = (image, seedText = "") => {
  if (!seedText) return 0;

  const cacheKey = `${seedText}::${image?.id || image?.src || image?.originalSrc || image?.tigrisKey || ""}`;
  const cached = scoreReferenceImageCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const imageText = imageSearchText(image);
  const imageCompact = imageText.replace(/\s+/g, "");
  const seedCompact = seedText.replace(/\s+/g, "");
  let score = 0;

  PHRASES.forEach((phraseGroup) => {
    const seedMatches = phraseGroup.some((phrase) => {
      const normalized = normalizePdfImageText(phrase);
      return (
        seedText.includes(normalized) ||
        seedCompact.includes(normalized.replace(/\s+/g, ""))
      );
    });
    if (!seedMatches) return;

    const imageMatches = phraseGroup.some((phrase) => {
      const normalized = normalizePdfImageText(phrase);
      return (
        imageText.includes(normalized) ||
        imageCompact.includes(normalized.replace(/\s+/g, ""))
      );
    });
    if (imageMatches) score += 120;
  });

  seedText
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .forEach((token) => {
      if (imageText.includes(token)) score += 8;
      else if (imageCompact.includes(token)) score += 5;
    });

  if (scoreReferenceImageCache.size >= SCORE_CACHE_MAX_SIZE) {
    const firstKey = scoreReferenceImageCache.keys().next().value;
    scoreReferenceImageCache.delete(firstKey);
  }
  scoreReferenceImageCache.set(cacheKey, score);

  return score;
};

const fallbackImages = (images, seedText) => {
  const seed = normalizePdfImageText(seedText);
  const contextual = [];
  if (/paracas|ica|ballestas|huacachina|vinedos|viñedos|tubulares|sandboarding|dunas/.test(seed)) {
    contextual.push("paracas", "ica", "ballestas", "huacachina", "vinedos", "viñedos", "tubulares", "sandboarding");
  }
  if (/city tour|sacsayhuaman|qoricancha|koricancha|tambomachay|cusco/.test(seed)) {
    contextual.push("city tour", "cusco", "sacsayhuaman", "tambomachay", "qoricancha");
  }
  if (/machu|machupicchu|aguas calientes/.test(seed)) {
    contextual.push("machupicchu", "machu picchu", "aguas calientes", "huaynapicchu");
  }
  if (/valle sagrado|ollantaytambo|pisac|maras|moray|chinchero/.test(seed)) {
    contextual.push("valle sagrado", "ollantaytambo", "pisac", "maras", "moray", "chinchero");
  }
  if (/traslado|recojo|transfer|aeropuerto|hotel/.test(seed)) {
    contextual.push("recojo", "traslado", "transfer", "aeropuerto");
  }
  if (/tren|train/.test(seed)) contextual.push("tren", "train");
  if (/lima|colonial|moderno|miraflores/.test(seed)) contextual.push("lima", "colonial", "moderno");
  if (/almuerzo|cena|comida|restaurante|buffet|pachamanca/.test(seed)) {
    contextual.push("restaurante", "comida", "pachamanca", "almuerzo", "buffet");
  }

  const preferred = [
    ...contextual,
    "cusco",
    "valle sagrado",
    "machupicchu",
    "lima",
    "otros",
    "mountain view",
  ];
  const scored = images.filter((image) => {
    const text = imageSearchText(image);
    return preferred.some((term) => text.includes(normalizePdfImageText(term)));
  });
  return scored.length ? scored : images;
};


const getReferenceRenderSrc = (image) => getReferenceStorageSrc(image);

const isCotizacionUploadedImage = (value = "") =>
  typeof value === "string" && /(?:^|\/)pdf_media\//i.test(value);

const hasUsableMediaImage = (image) => Boolean(getMediaImageSrc(image));

const getUsableDayMediaImages = (dayMedia = {}) =>
  Array.isArray(dayMedia?.images) ? dayMedia.images.filter(hasUsableMediaImage) : [];

const inferLayoutFromMediaImages = (images = [], fallback = "1") => {
  const count = images.filter(Boolean).length;
  if (count === 1) return "1";
  if (count === 2) return "2";
  if (count >= 3) return fallback && fallback !== "1" && fallback !== "2" ? fallback : "3-bottom";
  return fallback || "1";
};

const shouldPreservePdfMediaDay = (dayMedia = {}) => {
  const images = Array.isArray(dayMedia?.images) ? dayMedia.images.filter(Boolean) : [];
  if (!images.length) return false;

  // Cualquier imagen guardada dentro de pdf_media es autoritativa para el PDF.
  // Antes solo se protegían uploads bajo /pdf_media/, por eso los días que tenían
  // imágenes de referencia persistidas volvían a ser reemplazados por el selector
  // automático/aleatorio en preview, editor y descarga.
  if (images.some(hasUsableMediaImage)) return true;

  if (dayMedia.autoSource === "manual") return true;
  if (dayMedia.manual === true || dayMedia.isManual === true) return true;
  if (dayMedia.autoAssigned === false && images.some(isCotizacionUploadedImage)) return true;

  return images.some(isCotizacionUploadedImage);
};

const isExplicitManualDayMedia = shouldPreservePdfMediaDay;

export const pdfMediaHasAnyUsableImages = (pdfMedia = {}, infoPdf = []) => {
  if (!pdfMedia || typeof pdfMedia !== "object") return false;
  if (resolveVensoCanvaCoverImages(pdfMedia, infoPdf).some(hasUsableMediaImage)) return true;
  if (hasUsableMediaImage(pdfMedia.overviewImage || pdfMedia.overview_image)) return true;

  const normalizedDays = normalizePdfMediaDaysForInfoPdf(pdfMedia, infoPdf);
  return Object.values(normalizedDays || {}).some((dayMedia) =>
    getUsableDayMediaImages(dayMedia).length > 0,
  );
};

export const chooseAutoImagesForDay = ({
  images = [],
  day,
  dayIndex = 0,
  cotizacion = {},
}) => {
  if (!images.length) return { images: [], layout: "1", source: "none" };

  const seedText = buildDayImageSeedText(day);
  const seed = [
    cotizacion?.id,
    cotizacion?.titulo,
    dayIndex,
    seedText,
  ]
    .filter(Boolean)
    .join("|");

  const ranked = images
    .map((image) => ({
      image,
      score: scoreReferenceImage(image, seedText),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return hashString(`${seed}|${a.image.id}`) - hashString(`${seed}|${b.image.id}`);
    })
    .map(({ image }) => image);

  const pool = ranked.length ? ranked : fallbackImages(images, seedText);
  const available = Math.min(pool.length, 3);
  const count = Math.max(1, Math.min(available, (hashString(seed) % 3) + 1));
  const selected = seededPick(pool, seed, count);
  const layout =
    LAYOUT_BY_COUNT[selected.length] ||
    (hashString(`${seed}|layout`) % 2 === 0 ? "3-top" : "3-bottom");

  return {
    images: selected.map(getReferenceRenderSrc).filter(Boolean),
    layout,
    source: ranked.length ? "matched" : "fallback",
  };
};


export const chooseReplacementImageForDay = ({
  images = [],
  day,
  dayIndex = 0,
  cotizacion = {},
  avoid = [],
}) => {
  if (!images.length) return "";

  const avoidSet = new Set(
    (Array.isArray(avoid) ? avoid : [avoid])
      .map(getReferenceRenderSrc)
      .filter(Boolean),
  );

  const seedText = buildDayImageSeedText(day);
  const seed = [
    cotizacion?.id,
    cotizacion?.titulo,
    dayIndex,
    seedText,
    "repair",
  ]
    .filter(Boolean)
    .join("|");

  const getSrc = (image) => getReferenceRenderSrc(image) || "";

  const ranked = images
    .map((image) => ({
      image,
      score: scoreReferenceImage(image, seedText),
    }))
    .filter(({ image, score }) => score > 0 && getSrc(image))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return hashString(`${seed}|${a.image.id || getSrc(a.image)}`) -
        hashString(`${seed}|${b.image.id || getSrc(b.image)}`);
    })
    .map(({ image }) => image);

  const pool = ranked.length ? ranked : fallbackImages(images, seedText);
  const shuffled = seededPick(pool, seed, pool.length || 1);
  const found = shuffled.map(getSrc).find((src) => src && !avoidSet.has(src));

  return found || "";
};

export const buildImagenesEditorFromMedia = (pdfMedia, infoPdf = []) => {
  if (!pdfMedia || typeof pdfMedia !== "object") {
    return { cover: null, coverImages: [], overviewImage: null, days: {}, layouts: {} };
  }
  const normalizedDays = normalizePdfMediaDaysForInfoPdf(pdfMedia, infoPdf);
  const result = {
    cover: pdfMedia.cover || resolveVensoCanvaCoverImages(pdfMedia, infoPdf)[0] || null,
    coverImages: resolveVensoCanvaCoverImages(pdfMedia, infoPdf),
    overviewImage: getOverviewImageFromPdfMedia({ ...pdfMedia, days: normalizedDays }, infoPdf),
    days: {},
    layouts: {},
  };
  Object.keys(normalizedDays).forEach((key) => {
    const dayMedia = normalizedDays[key];
    if (dayMedia && Array.isArray(dayMedia.images)) {
      const images = dayMedia.images.map(getMediaImageSrc).filter(Boolean);
      if (images.length) result.days[key] = images;
      if (dayMedia.layout) result.layouts[key] = dayMedia.layout;
    }
  });
  return result;
};

export const getMediaImageSrc = (image) => {
  if (!image) return null;
  if (typeof image === "string") return image;
  if (typeof image !== "object") return null;

  return (
    getReferenceStorageSrc(image) ||
    image.fullSrc ||
    image.full_src ||
    image.renderSrc ||
    image.render_src ||
    image.storageSrc ||
    image.storage_src ||
    image.previewSrc ||
    image.preview_src ||
    image.proxyUrl ||
    image.proxy_url ||
    image.src ||
    image.tigrisUrl ||
    image.tigris_url ||
    image.imageUrl ||
    image.image_url ||
    image.mediaUrl ||
    image.media_url ||
    image.url ||
    null
  );
};

export const getOverviewImageFromPdfMedia = (pdfMedia, infoPdf = []) => {
  if (!pdfMedia || typeof pdfMedia !== "object") return null;

  const directOverview = getMediaImageSrc(pdfMedia.overviewImage);
  if (directOverview) return directOverview;

  const normalizedDays = normalizePdfMediaDaysForInfoPdf(pdfMedia, infoPdf);
  const dayEntries = Object.entries(normalizedDays || {})
    .map(([key, value]) => ({
      key,
      index: Number.parseInt(key, 10),
      value,
    }))
    .sort((a, b) => {
      const aIndex = Number.isFinite(a.index) ? a.index : Number.MAX_SAFE_INTEGER;
      const bIndex = Number.isFinite(b.index) ? b.index : Number.MAX_SAFE_INTEGER;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return String(a.key).localeCompare(String(b.key));
    });

  if (dayEntries.length) {
    const middleStart = dayEntries.length > 2 ? 1 : 0;
    const middleEnd = dayEntries.length > 2 ? dayEntries.length - 1 : dayEntries.length;
    const orderedDays = [
      ...dayEntries.slice(middleStart, middleEnd),
      ...dayEntries.slice(0, middleStart),
      ...dayEntries.slice(middleEnd),
    ];

    for (const day of orderedDays) {
      const images = Array.isArray(day.value?.images) ? day.value.images : [];
      const found = images.map(getMediaImageSrc).find(Boolean);
      if (found) return found;
    }
  }

  return getMediaImageSrc(pdfMedia.cover);
};

export const buildAutoPdfMedia = ({
  pdfMedia = {},
  cotizacion = {},
  infoPdf = [],
  referenceImages = [],
}) => {
  const days = Array.isArray(infoPdf) ? infoPdf : [];
  const nextMedia = {
    ...pdfMedia,
    days: normalizePdfMediaDaysForInfoPdf(pdfMedia, days),
  };

  days.forEach((day, index) => {
    const current = nextMedia.days[index] || nextMedia.days[String(index)] || {};
    const savedImages = getUsableDayMediaImages(current);

    if (savedImages.length) {
      nextMedia.days[index] = {
        ...current,
        layout: current.layout || inferLayoutFromMediaImages(savedImages),
        images: Array.isArray(current.images) ? current.images : savedImages,
      };
      return;
    }

    const hasManualImages = isExplicitManualDayMedia(current);
    if (hasManualImages) return;

    const auto = chooseAutoImagesForDay({
      images: referenceImages,
      day,
      dayIndex: index,
      cotizacion,
    });
    if (!auto.images.length) return;

    nextMedia.days[index] = {
      ...current,
      layout: auto.layout,
      images: auto.images,
      autoAssigned: true,
      autoSource: auto.source,
    };
  });

  if (!getMediaImageSrc(nextMedia.overviewImage)) {
    const overviewFromSavedPdfMedia = getOverviewImageFromPdfMedia(
      { ...nextMedia, overviewImage: null, overview_image: null },
      days,
    );
    if (overviewFromSavedPdfMedia) {
      nextMedia.overviewImage = overviewFromSavedPdfMedia;
    }
  }

  // Auto-pick overviewImage only if pdf_media still does not provide any usable image.
  if (!getMediaImageSrc(nextMedia.overviewImage) && referenceImages.length && days.length >= 2) {
    const middleDays = days.slice(1, Math.max(2, days.length - 1));
    const combinedSeed = middleDays
      .map((d) => buildDayImageSeedText(d))
      .join(" ");
    const seed = [cotizacion?.id, cotizacion?.titulo, "overview", combinedSeed]
      .filter(Boolean)
      .join("|");
    const ranked = referenceImages
      .map((img) => ({
        img,
        score: scoreReferenceImage(img, combinedSeed),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return hashString(`${seed}|${a.img.id}`) - hashString(`${seed}|${b.img.id}`);
      })
      .map(({ img }) => img);
    const pool = ranked.length ? ranked : fallbackImages(referenceImages, combinedSeed);
    const picked = seededPick(pool, seed, 1);
    const pickedSrc = getMediaImageSrc(picked[0]);
    if (pickedSrc) {
      nextMedia.overviewImage = pickedSrc;
    }
  }

  return nextMedia;
};

let manifestPromise = null;

export const fetchReferenceImageManifest = async () => {
  if (!manifestPromise) {
    manifestPromise = mediaService
      .getReferenceImages()
      .then(normalizeReferenceManifest)
      .catch(() => ({ images: [], categories: [] }));
  }
  return manifestPromise;
};

export const clearReferenceManifestCache = () => {
  manifestPromise = null;
  referencePreviewSrcMap.clear();
  imageSearchTextCache.clear();
  scoreReferenceImageCache.clear();
};
