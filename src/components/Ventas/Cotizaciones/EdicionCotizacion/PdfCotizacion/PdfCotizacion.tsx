// @refresh reset
import React from "react";
import { toJpeg, toPng } from "html-to-image";
import { PDFDocument } from "pdf-lib";
import "./PdfCotizacion.scss";
import { getProxyUrl } from "../../../../../services/presignedUrlService";

import {
  PricingPage,
  TermsAndConditionsPage,
  getPricingPageHtml,
  getTermsAndConditionsPageHtml,
} from "./TycPages";
import {
  buildAutoPdfMedia,
  buildImagenesEditorFromMedia,
  chooseReplacementImageForDay,
  fetchReferenceImageManifest,
  getMediaImageSrc,
  getOverviewImageFromPdfMedia,
  getReferenceImagePreviewSrc,
  normalizePdfMediaDaysForInfoPdf,
} from "../utils/pdfReferenceImageMatcher";
import {
  getDefaultPdfHotelCategories,
  getPdfHotelCategoryOptionsFromCotizacion,
} from "../utils/pdfHotelPreviewData";
import {
  fetchHotelQuoteDictionaryData,
  resolveQuotationTariffType,
} from "../utils/useHotelQuoteDictionary";
import buildRoomOptionsByCategory from "../utils/buildRoomOptionsByCategory";
import axios from "../../../../../utils/axiosInstance";
import {
  normalizeMojibakeValue,
  repairMojibakeText,
} from "../utils/hotelDetallePayload";
import {
  buildDocxFromPageCaptures,
  downloadBrowserBlob,
} from "../../../../../utils/pageImageDocumentExport";
import {
  VENSO_CANVA_PAGE_ASPECT,
  VENSO_CANVA_PAGE_HEIGHT,
  VENSO_CANVA_PAGE_WIDTH,
  resolveVensoCanvaCoverImages,
} from "../utils/vensoPdfCanvaDesign";
import {
  formatPdfCanvaDuration,
  getPdfCanvaCopy,
} from "../utils/pdfCanvaCopy";

const logoBlanco = "/brand/logo-principal-blanco.webp";

const PDF_EXPORT_BASE_WIDTH_PT = 842;
const PDF_EXPORT_CAPTURE_WIDTH = VENSO_CANVA_PAGE_WIDTH;
const PDF_EXPORT_CAPTURE_HEIGHT = VENSO_CANVA_PAGE_HEIGHT;
const PDF_EXPORT_ASPECT_RATIO = `${VENSO_CANVA_PAGE_WIDTH} / ${VENSO_CANVA_PAGE_HEIGHT}`;
const PDF_EXPORT_PIXEL_RATIO = 1;
const PDF_TEXT_PAGE_FORMAT = "jpeg";

// Static pages served from /public/pdf-static-pages/
const PAGE_ELEGIRNOS_VACIO = "/pdf-static-pages/page_elegirnos_vacio.webp";
const PAGE_PRICING = "/pdf-static-pages/page_pricing.webp";
const PAGE_EQUIPO = "/pdf-static-pages/page_equipo.webp";
const PAGE_SOCIAL = "/pdf-static-pages/page_social.webp";
const TRANSPARENT_IMAGE_SRC =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

const IMAGE_DATA_URL_CACHE = new Map();
const PDF_STATIC_PAGE_CAPTURE_CACHE = new Map();
const PDF_RENDER_PLAN_CACHE = new Map();
const PDF_IMAGE_PREWARM_CACHE = new Map();
const PDF_RENDER_PLAN_TTL_MS = 60_000;
const PDF_EXPORT_IMAGE_TIMEOUT_MS = 6_000;
const PDF_EXPORT_IMAGE_CHUNK_SIZE = 10;
const PDF_EXPORT_CAPTURE_BATCH_SIZE = 2;
// The active Canva renderer only prewarms shared brand assets; itinerary,
// cover and closing-page imagery comes from the quotation media itself.
const PDF_STATIC_IMAGE_URLS = [logoBlanco];


const ELEGIRNOS_CONTENT = {
  es: {
    headerLeft: "Por que",
    headerBold: "Elegirnos",
    headerRight: "Venso Tours",
    headerBoldRight: "Per\u00fa",
    para1: "En Venso Tours Per\u00fa dise\u00f1amos actividades pensadas para el viajero actual, que busca experiencias aut\u00e9nticas, sorprendentes e inolvidables. Creamos tours personalizados en todo el Per\u00fa, adaptados a los deseos y necesidades de cada pasajero, manteniendo altos est\u00e1ndares de calidad en cada servicio.",
    para2: "Nuestra excelencia ha sido reconocida con el premio Miradas Internacional 2023 por la calidad tur\u00edstica y con los Travelers\u2019 Choice Awards 2021, 2022, 2023, 2024 y 2025 otorgados por Tripadvisor, reflejo de la satisfacci\u00f3n y confianza de nuestros viajeros.",
  },
  en: {
    headerLeft: "Why",
    headerBold: "Choose Us",
    headerRight: "Venso Tours",
    headerBoldRight: "Peru",
    para1: "At Venso Tours we design activities tailored for today\u2019s traveler, seeking authentic, surprising and unforgettable experiences. We create personalized tours throughout Peru, adapted to the desires and needs of each passenger, maintaining high quality standards in every service.",
    para2: "Our excellence has been recognized with the Miradas Internacional 2023 award for tourism quality and with the Travelers\u2019 Choice Awards 2021, 2022, 2023, 2024 and 2025 awarded by Tripadvisor, a reflection of the satisfaction and trust of our travelers.",
  },
  pt: {
    headerLeft: "Por que",
    headerBold: "Nos Escolher",
    headerRight: "Venso Tours",
    headerBoldRight: "Peru",
    para1: "Na Venso Tours desenhamos atividades pensadas para o viajante atual, que busca experi\u00eancias aut\u00eanticas, surpreendentes e inesquec\u00edveis. Criamos tours personalizados em todo o Peru, adaptados aos desejos e necessidades de cada passageiro, mantendo altos padr\u00f5es de qualidade em cada servi\u00e7o.",
    para2: "Nossa excel\u00eancia foi reconhecida com o pr\u00eamio Miradas Internacional 2023 pela qualidade tur\u00edstica e com os Travelers\u2019 Choice Awards 2021, 2022, 2023, 2024 e 2025 concedidos pelo Tripadvisor, reflexo da satisfa\u00e7\u00e3o e confian\u00e7a dos nossos viajantes.",
  },
};


/* =========================
 HELPERS DE TEXTO
========================= */

const UI_LABELS = {
  es: {
    dia: "DIA",
    descripcion: "Descripción:",
    recomendaciones: "Recomendaciones",
    tipo_servicio: "Tipo de servicio",
    incluye: "Incluye",
    no_incluye: "No incluye",
    itinerario_general: "ITINERARIO GENERAL",
  },
  en: {
    dia: "DAY",
    descripcion: "Description:",
    recomendaciones: "Recommendations",
    tipo_servicio: "Service type",
    incluye: "Includes",
    no_incluye: "Does not include",
    itinerario_general: "GENERAL ITINERARY",
  },
  pt: {
    dia: "DIA",
    descripcion: "Descrição:",
    recomendaciones: "Recomendações",
    tipo_servicio: "Tipo de serviço",
    incluye: "Inclui",
    no_incluye: "Não inclui",
    itinerario_general: "ITINERÁRIO GERAL",
  },
};

export const getLabels = (idioma) => UI_LABELS[idioma] || UI_LABELS.es;

const safeText = (s = "") =>
  repairMojibakeText(String(s))
    .replace(/[\u2012\u2013\u2014\u2212]/g, "-")
    .replace(/[↦→⟶⟹⟿]/g, "->")
    .replace(/[·]/g, "•")
    .replace(/\s+/g, " ")
    .trim();

export const PDF_COVER_TITLE_FIELD = "cover_title";

export const resolveInfoPdfCoverTitle = (infoPdf, fallbackTitle = "") => {
  if (Array.isArray(infoPdf)) {
    const holder = infoPdf.find(
      (day) =>
        day &&
        typeof day === "object" &&
        Object.prototype.hasOwnProperty.call(day, PDF_COVER_TITLE_FIELD),
    );
    if (holder) return safeText(holder[PDF_COVER_TITLE_FIELD]);
  }
  return safeText(fallbackTitle);
};

const limpiarLista = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr.filter(
    (v) =>
      v !== null &&
      v !== undefined &&
      String(v).trim() !== "" &&
      String(v).toLowerCase() !== "null",
  );
};

/* =========================
 COMPONENTES REACT (PREVIEW)
========================= */

/** Resuelve URLs de Tigris a proxy, deja intactas las demás */
const extractImageUrl = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value !== "object") return null;
  return (
    value.originalSrc ||
    value.original_src ||
    value.src ||
    value.tigrisUrl ||
    value.tigris_url ||
    value.previewSrc ||
    value.preview_src ||
    value.proxyUrl ||
    value.proxy_url ||
    value.url ||
    null
  );
};

const isReferenceImageUrl = (resolved = "") =>
  /(?:^|\/)pdf-reference-images\//i.test(resolved) ||
  /fly\.storage\.tigris\.dev\/pdf-reference-images\//i.test(resolved);

const resolveImgSrcSet = (url) => {
  const resolved = extractImageUrl(url);
  if (!resolved || typeof resolved !== "string") {
    return { full: null, preview: null, isReference: false };
  }

  let full = resolved;
  if (resolved.includes("/upload/tigris/proxy")) {
    full = resolved;
  } else if (resolved.includes("fly.storage.tigris.dev")) {
    full = getProxyUrl(resolved);
  } else if (resolved.startsWith("/pdf-reference-images/") || resolved.startsWith("pdf-reference-images/")) {
    full = `${import.meta.env.VITE_API_URL || "http://localhost:8080/api"}/upload/tigris/proxy?url=${encodeURIComponent(resolved.replace(/^\//, ""))}`;
  }

  const isReference = isReferenceImageUrl(resolved);
  const preview = isReference ? getReferenceImagePreviewSrc(resolved) || full : full;
  return { full, preview, isReference };
};

const resolveImgSrc = (url) => resolveImgSrcSet(url).full;

const getCotizacionRenderPlanCacheKey = (cotizacion = {}) => {
  const id = cotizacion?.id;
  if (!id) return null;
  return [
    id,
    cotizacion?.updatedat || cotizacion?.updated_at || "",
    cotizacion?.idioma || "es",
  ].join("@@");
};

const fetchCotizacionPdfRenderPlan = async (cotizacion, { forceRefresh = false } = {}) => {
  const id = cotizacion?.id;
  if (!id) return null;

  const cacheKey = getCotizacionRenderPlanCacheKey(cotizacion);
  const cached = cacheKey ? PDF_RENDER_PLAN_CACHE.get(cacheKey) : null;
  if (!forceRefresh && cached && Date.now() - cached.createdAt < PDF_RENDER_PLAN_TTL_MS) {
    return cached.plan;
  }

  try {
    const response = await axios.get(`/turismo/cotizaciones/${id}/pdf-render-plan`, {
      params: forceRefresh ? { force_refresh: true } : undefined,
      _skipDedup: true,
    });
    const plan = response?.data?.data || null;
    if (cacheKey && plan) {
      PDF_RENDER_PLAN_CACHE.set(cacheKey, { plan, createdAt: Date.now() });
      if (PDF_RENDER_PLAN_CACHE.size > 12) {
        const oldestKey = [...PDF_RENDER_PLAN_CACHE.entries()]
          .sort((a, b) => a[1].createdAt - b[1].createdAt)[0]?.[0];
        if (oldestKey) PDF_RENDER_PLAN_CACHE.delete(oldestKey);
      }
    }
    return plan;
  } catch (error) {
    console.warn("No fue posible obtener el plan optimizado de PDF.", error);
    return null;
  }
};

const mergeCotizacionRenderPlan = (cotizacion, renderPlan) => {
  const planned = renderPlan?.cotizacion;
  if (!planned || typeof planned !== "object") return cotizacion;
  return {
    ...cotizacion,
    ...planned,
    // Mantener selecciones locales no persistidas si el editor las está enviando.
    info_pdf: Array.isArray(cotizacion?.info_pdf) && cotizacion.info_pdf.length
      ? cotizacion.info_pdf
      : planned.info_pdf,
    pdf_media: cotizacion?.pdf_media && Object.keys(cotizacion.pdf_media || {}).length
      ? cotizacion.pdf_media
      : planned.pdf_media,
    pdf_render_fingerprint: planned.pdf_render_fingerprint || renderPlan.fingerprint,
    pdf_render_image_urls: planned.pdf_render_image_urls || renderPlan.image_urls || [],
  };
};

const collectPdfMediaImageUrls = (value, output = new Set()) => {
  if (!value) return output;
  if (typeof value === "string") {
    const resolved = resolveImgSrc(value);
    if (resolved && resolved !== TRANSPARENT_IMAGE_SRC) output.add(resolved);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectPdfMediaImageUrls(item, output));
    return output;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((item) => collectPdfMediaImageUrls(item, output));
  }
  return output;
};

const collectRenderedPageImageUrls = (pageElements, output = new Set()) => {
  asPdfPageArray(pageElements).forEach((page) => {
    const imgs = page.querySelectorAll?.("img") || [];
    imgs.forEach((img) => {
      const fullSrc =
        img.getAttribute("data-pdf-full-src") ||
        img.currentSrc ||
        img.src;
      const resolved =
        fullSrc && fullSrc !== TRANSPARENT_IMAGE_SRC
          ? resolveImgSrc(fullSrc)
          : null;
      if (resolved && resolved !== TRANSPARENT_IMAGE_SRC) output.add(resolved);
    });
  });
  return output;
};

const getPlannedCotizacionImageUrls = (cotizacion = {}, renderPlan = null) => [
  ...PDF_STATIC_IMAGE_URLS,
  ...(renderPlan?.image_urls || []),
  ...(cotizacion?.pdf_render_image_urls || []),
  ...collectPdfMediaImageUrls(cotizacion?.pdf_media || {}),
];

const normalizePrewarmUrl = (url) => {
  if (!url || url === TRANSPARENT_IMAGE_SRC) return null;
  const resolved = resolveImgSrc(url) || url;
  if (!resolved || /^data:|^blob:/i.test(resolved)) return null;
  if (resolved.startsWith("/api/upload/tigris/proxy")) return resolved;
  return resolved;
};

const prewarmPdfImages = async (urls = []) => {
  const list = Array.isArray(urls) ? urls : Array.from(urls || []);
  const uniqueUrls = Array.from(
    new Set(
      list
        .map(normalizePrewarmUrl)
        .filter(Boolean),
    ),
  );
  if (!uniqueUrls.length) return;

  const cacheKey = uniqueUrls.sort().join("|");
  const cached = PDF_IMAGE_PREWARM_CACHE.get(cacheKey);
  if (cached) return cached;

  const tigrisUrls = uniqueUrls.filter((url) =>
    url.includes("/upload/tigris/proxy") || url.includes("fly.storage.tigris.dev"),
  );

  const promise = Promise.allSettled([
    tigrisUrls.length
      ? axios.post("/upload/tigris/prewarm", { urls: tigrisUrls }, { _skipDedup: true })
      : Promise.resolve(null),
    preloadImagesInChunks(uniqueUrls, PDF_EXPORT_IMAGE_CHUNK_SIZE, PDF_EXPORT_IMAGE_TIMEOUT_MS),
  ]).then(() => undefined);

  PDF_IMAGE_PREWARM_CACHE.set(cacheKey, promise);
  if (PDF_IMAGE_PREWARM_CACHE.size > 20) {
    const firstKey = PDF_IMAGE_PREWARM_CACHE.keys().next().value;
    if (firstKey) PDF_IMAGE_PREWARM_CACHE.delete(firstKey);
  }
  return promise;
};

export const prewarmCotizacionPdfExportAssets = async (cotizacion, pageElements = null, options = {}) => {
  const { forceRefreshPlan = false } = options;
  const renderPlan = await fetchCotizacionPdfRenderPlan(cotizacion, {
    forceRefresh: forceRefreshPlan,
  });
  const exportCotizacion = mergeCotizacionRenderPlan(cotizacion, renderPlan);
  const imageUrls = new Set(getPlannedCotizacionImageUrls(exportCotizacion, renderPlan));
  collectRenderedPageImageUrls(pageElements, imageUrls);
  await prewarmPdfImages(imageUrls);
  return {
    renderPlan,
    cotizacion: exportCotizacion,
    imageUrls: Array.from(imageUrls),
  };
};

/**
 * Imagen lazy que:
 * - No carga/recarga nada hasta que el elemento esté cerca del viewport.
 * - Usa la versión preview (menor resolución) para referencias cuando exista.
 * - Deja un placeholder transparente mientras está fuera de pantalla,
 *   ahorrando descargas de Tigris y trabajo de layout/paint.
 * - Guarda la URL full en data-pdf-full-src para que la exportación use
 *   la resolución original sin volver a construir la página.
 */
export const LazyPdfImage = React.memo(({
  src,
  alt = "",
  className,
  style,
  draggable = false,
  onError,
  onLoad,
  rootMargin = "300px",
  usePreview = true,
  forceLoad = false,
}) => {
  const [shouldLoad, setShouldLoad] = React.useState(Boolean(forceLoad));
  const imgRef = React.useRef(null);

  React.useEffect(() => {
    if (forceLoad) {
      setShouldLoad(true);
      return undefined;
    }

    const img = imgRef.current;
    if (!img || shouldLoad) return undefined;

    if (!("IntersectionObserver" in window)) {
      setShouldLoad(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(img);
    return () => observer.disconnect();
  }, [forceLoad, rootMargin, shouldLoad]);

  const { full, preview } = React.useMemo(() => {
    if (!src) return { full: null, preview: null };
    return typeof src === "object" && (src.full || src.preview)
      ? src
      : resolveImgSrcSet(src);
  }, [src]);

  const shouldRenderImage = shouldLoad || Boolean(forceLoad);
  const displaySrc = shouldRenderImage
    ? (forceLoad ? full : usePreview ? preview || full : full) || TRANSPARENT_IMAGE_SRC
    : TRANSPARENT_IMAGE_SRC;

  return (
    <img
      ref={imgRef}
      src={displaySrc}
      data-pdf-full-src={full || displaySrc}
      alt={alt}
      className={className}
      style={style}
      draggable={draggable}
      loading={forceLoad ? "eager" : "lazy"}
      decoding={forceLoad ? "sync" : "async"}
      fetchPriority={forceLoad ? "high" : "auto"}
      onLoad={onLoad}
      onError={(event) => {
        if (displaySrc !== TRANSPARENT_IMAGE_SRC) {
          handlePdfImageError(event);
          onError?.(event);
        }
      }}
    />
  );
});
LazyPdfImage.displayName = "LazyPdfImage";

const clampPercent = (value, fallback = 50) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, numeric));
};

const resolveCoverPositionY = (pdfMedia = {}) => {
  const cover = pdfMedia?.cover;
  const direct =
    pdfMedia?.coverPositionY ??
    pdfMedia?.cover_position_y ??
    pdfMedia?.coverObjectPositionY ??
    pdfMedia?.cover_object_position_y;
  const fromCoverObject =
    cover && typeof cover === "object"
      ? cover.positionY ?? cover.position_y ?? cover.objectPositionY
      : null;
  return clampPercent(direct ?? fromCoverObject, 50);
};

const getCoverImageStyle = (positionY) => ({
  objectPosition: `center ${clampPercent(positionY, 50)}%`,
});

const handlePdfImageError = (event) => {
  const img = event?.currentTarget;
  if (!img || img.src === TRANSPARENT_IMAGE_SRC) return;
  img.removeAttribute("srcset");
  img.src = TRANSPARENT_IMAGE_SRC;
};

const waitForImageToSettle = (img, timeoutMs = PDF_EXPORT_IMAGE_TIMEOUT_MS, options = {}) =>
  new Promise((resolve) => {
    const { fallbackOnTimeout = true } = options;
    const fallback = () => {
      img.removeAttribute("srcset");
      if (img.src !== TRANSPARENT_IMAGE_SRC) img.src = TRANSPARENT_IMAGE_SRC;
      resolve();
    };
    const timeoutDone = () => {
      if (fallbackOnTimeout) {
        fallback();
        return;
      }
      resolve();
    };
    const done = () => resolve();

    if (!img) {
      resolve();
      return;
    }

    const fullSrc =
      img.getAttribute("data-pdf-full-src") ||
      img.getAttribute("data-src") ||
      "";
    const currentSrc = img.currentSrc || img.getAttribute("src") || "";
    if (
      fullSrc &&
      isUsablePdfImageSrc(fullSrc) &&
      (!currentSrc || currentSrc === TRANSPARENT_IMAGE_SRC || currentSrc.startsWith("data:image/gif"))
    ) {
      img.removeAttribute("srcset");
      img.removeAttribute("sizes");
      img.setAttribute("loading", "eager");
      img.setAttribute("decoding", "sync");
      img.setAttribute("fetchpriority", "high");
      img.src = fullSrc;
    }

    if (!img.getAttribute("src")) {
      fallback();
      return;
    }

    const timer = setTimeout(timeoutDone, timeoutMs);
    const clearAndResolve = () => {
      clearTimeout(timer);
      done();
    };
    const clearAndFallback = () => {
      clearTimeout(timer);
      fallback();
    };

    if (img.complete) {
      clearTimeout(timer);
      if (img.naturalWidth || img.naturalHeight) done();
      else fallback();
      return;
    }

    img.onload = clearAndResolve;
    img.onerror = clearAndFallback;
  });

const preloadImage = (src, timeoutMs = PDF_EXPORT_IMAGE_TIMEOUT_MS) =>
  new Promise((resolve) => {
    if (!src || src === TRANSPARENT_IMAGE_SRC) {
      resolve();
      return;
    }
    const img = new Image();
    const timer = setTimeout(() => resolve(), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve();
    };
    img.crossOrigin = "anonymous";
    img.src = src;
  });

const preloadImagesInChunks = async (srcs, chunkSize = PDF_EXPORT_IMAGE_CHUNK_SIZE, timeoutMs = PDF_EXPORT_IMAGE_TIMEOUT_MS) => {
  const list = Array.from(srcs).filter(Boolean);
  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);
    await Promise.all(chunk.map((src) => preloadImage(src, timeoutMs)));
  }
};

const waitForImagesToSettle = async (root) => {
  const imgs = root?.querySelectorAll ? Array.from(root.querySelectorAll("img")) : [];
  await Promise.all(
    imgs.map(async (img) => {
      await waitForImageToSettle(img, PDF_EXPORT_IMAGE_TIMEOUT_MS, {
        fallbackOnTimeout: false,
      });
      if (img?.decode && img.src && img.src !== TRANSPARENT_IMAGE_SRC) {
        try {
          await Promise.race([
            img.decode(),
            new Promise((resolve) => setTimeout(resolve, 350)),
          ]);
        } catch {
          // La imagen ya esta cargada o el navegador no pudo decodificarla a tiempo.
        }
      }
    }),
  );
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
};

export const forceHydratePdfImages = (root) => {
  if (!root?.querySelectorAll) return;

  root.querySelectorAll("img").forEach((img) => {
    const fullSrc =
      img.getAttribute("data-pdf-full-src") ||
      img.getAttribute("data-src") ||
      img.currentSrc ||
      img.getAttribute("src") ||
      "";

    if (!fullSrc || fullSrc === TRANSPARENT_IMAGE_SRC || fullSrc.startsWith("data:image/gif")) {
      return;
    }

    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.setAttribute("data-pdf-full-src", fullSrc);
    img.setAttribute("loading", "eager");
    img.setAttribute("decoding", "sync");
    img.setAttribute("fetchpriority", "high");
    img.setAttribute("crossorigin", "anonymous");
    img.style.visibility = "visible";
    img.style.opacity = "1";

    if (!img.getAttribute("src") || img.getAttribute("src") === TRANSPARENT_IMAGE_SRC || img.src?.startsWith("data:image/gif")) {
      img.setAttribute("src", fullSrc);
    }
  });
};

export const getUnreadyPdfImageCount = (root) => {
  if (!root?.querySelectorAll) return 0;
  return Array.from(root.querySelectorAll("img"))
    .filter((img) => {
      const fullSrc = img.getAttribute("data-pdf-full-src") || img.getAttribute("src") || "";
      if (!fullSrc || fullSrc === TRANSPARENT_IMAGE_SRC || fullSrc.startsWith("data:image/gif")) {
        return false;
      }
      return !isRenderablePdfImageElement(img);
    }).length;
};

export const waitForCotizacionPdfImagesReady = async (root, timeoutMs = PDF_EXPORT_IMAGE_TIMEOUT_MS) => {
  forceHydratePdfImages(root);
  await waitForImagesToSettle(root);
  const start = Date.now();
  while (getUnreadyPdfImageCount(root) > 0 && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    forceHydratePdfImages(root);
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return getUnreadyPdfImageCount(root) === 0;
};

export const pdfMediaHasUsableImages = (pdfMedia = {}, infoPdf = []) => {
  if (!pdfMedia || typeof pdfMedia !== "object") return false;
  const days = pdfMedia.days || {};
  const hasDayImage = (index) => {
    const entry = days[index] || days[String(index)];
    return Array.isArray(entry?.images) && entry.images.some(Boolean);
  };
  const everyDayHasImages = Array.isArray(infoPdf) && infoPdf.length > 0
    ? infoPdf.every((_, index) => hasDayImage(index))
    : Object.values(days).some((entry) => Array.isArray(entry?.images) && entry.images.some(Boolean));
  return resolveVensoCanvaCoverImages(pdfMedia, infoPdf).some(Boolean) && everyDayHasImages;
};

const shouldExportPageAsPng = (page) =>
  page?.classList?.contains("day-page") ||
  page?.classList?.contains("pricing-page") ||
  page?.classList?.contains("tyc-reservation-page") ||
  page?.classList?.contains("tyc-purchase-page") ||
  page?.classList?.contains("pdf-page--summary-portrait");

const asPdfPageArray = (pageElements) => {
  if (!pageElements) return [];
  if (typeof pageElements === "function") return asPdfPageArray(pageElements());
  return Array.from(pageElements).filter(
    (el) => el && el.nodeType === 1 && el.classList?.contains("pdf-page"),
  );
};

const getMeasuredPageRatio = (page) => {
  const rect = page?.getBoundingClientRect?.();
  const width = rect?.width || page?.offsetWidth || 0;
  const height = rect?.height || page?.offsetHeight || 0;
  if (width > 0 && height > 0) return width / height;
  if (page?.classList?.contains("pdf-page--summary-portrait")) return 900 / 636;
  return VENSO_CANVA_PAGE_ASPECT;
};

const getPdfPageLayout = (page) => {
  const aspect = getMeasuredPageRatio(page);
  const pdfWidth = PDF_EXPORT_BASE_WIDTH_PT;
  const pdfHeight = Math.round((pdfWidth / aspect) * 100) / 100;
  return { pdfWidth, pdfHeight, aspectRatio: `${aspect}` };
};

const syncFormValues = (source, clone) => {
  const sourceControls = source.querySelectorAll?.("input, textarea, select") || [];
  const cloneControls = clone.querySelectorAll?.("input, textarea, select") || [];
  sourceControls.forEach((control, index) => {
    const target = cloneControls[index];
    if (!target) return;
    if (control.tagName === "TEXTAREA") target.textContent = control.value;
    if ("value" in target) target.value = control.value;
    if ("checked" in target) target.checked = control.checked;
  });
};

const isUsablePdfImageSrc = (src = "") =>
  Boolean(src) && src !== TRANSPARENT_IMAGE_SRC && !src.startsWith("data:image/gif;base64,R0lGODlhAQABAIA");

const isRenderablePdfImageElement = (img) =>
  Boolean(
    img &&
      isUsablePdfImageSrc(img.currentSrc || img.src || "") &&
      img.complete &&
      (img.naturalWidth || 0) > 1 &&
      (img.naturalHeight || 0) > 1,
  );

const rememberImageDataUrlAliases = (dataUrl, ...aliases) => {
  if (!dataUrl) return;
  aliases
    .filter((alias) => alias && isUsablePdfImageSrc(alias) && !/^data:|^blob:/i.test(alias))
    .forEach((alias) => IMAGE_DATA_URL_CACHE.set(alias, dataUrl));
};

const canvasDataUrlFromLoadedImage = (img) => {
  if (!isRenderablePdfImageElement(img)) return null;
  const currentSrc = img.currentSrc || img.src || "";
  const cached = IMAGE_DATA_URL_CACHE.get(currentSrc);
  if (cached) return cached;

  const naturalWidth = img.naturalWidth || img.width || 0;
  const naturalHeight = img.naturalHeight || img.height || 0;
  if (!naturalWidth || !naturalHeight) return null;

  const maxWidth = 1920;
  const scale = Math.min(1, maxWidth / naturalWidth);
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    rememberImageDataUrlAliases(dataUrl, currentSrc, img.src);
    return dataUrl;
  } catch {
    // Si el canvas queda tainted por CORS, usamos fetchImageAsDataUrl como fallback.
    return null;
  }
};

const loadedImageToDataUrl = (img) => {
  const src = img?.currentSrc || img?.src || "";
  if (!src) return null;
  if (src.startsWith("data:") || src.startsWith("blob:")) return src;
  return canvasDataUrlFromLoadedImage(img);
};

const normalizeStaticPdfPath = (src = "") => {
  if (!src || typeof src !== "string") return "";
  try {
    const url = src.startsWith("data:") || src.startsWith("blob:")
      ? null
      : new URL(src, window.location.origin);
    return url ? url.pathname : src;
  } catch {
    return src.split("?")[0].split("#")[0];
  }
};

const PDF_DIRECT_STATIC_FULL_PAGES = new Set([PAGE_EQUIPO, PAGE_SOCIAL]);

const getDirectStaticFullPageImageSrc = (page) => {
  if (!page?.classList?.contains("full-image-page")) return null;
  const img = page.querySelector?.("img.full-bg");
  if (!img) return null;
  const src =
    img.getAttribute("data-pdf-full-src") ||
    img.currentSrc ||
    img.getAttribute("src") ||
    "";
  const path = normalizeStaticPdfPath(src);
  return PDF_DIRECT_STATIC_FULL_PAGES.has(path) ? path : null;
};

const loadImageElement = (src, timeoutMs = PDF_EXPORT_IMAGE_TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error("No image src"));
      return;
    }
    const img = new Image();
    const timer = setTimeout(() => {
      reject(new Error(`Image load timeout: ${src}`));
    }, timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`Image load failed: ${src}`));
    };
    img.crossOrigin = "anonymous";
    img.decoding = "sync";
    img.src = src;
  });

const drawImageCover = (ctx, img, width, height) => {
  const srcWidth = img.naturalWidth || img.width || width;
  const srcHeight = img.naturalHeight || img.height || height;
  const scale = Math.max(width / srcWidth, height / srcHeight);
  const drawWidth = srcWidth * scale;
  const drawHeight = srcHeight * scale;
  const dx = (width - drawWidth) / 2;
  const dy = (height - drawHeight) / 2;
  ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
};

const renderStaticFullPageImageCapture = async (src, page) => {
  const layout = getPdfPageLayout(page);
  const aspect = Number(layout.aspectRatio) || 16 / 9;
  const width = 1920;
  const height = Math.round(width / aspect);
  const cacheKey = `${src}@@${width}x${height}`;
  const cached = PDF_STATIC_PAGE_CAPTURE_CACHE.get(cacheKey);
  if (cached) return { dataUrl: cached, format: "jpeg", layout };

  const absoluteSrc = new URL(src, window.location.origin).href;
  const dataSrc = await fetchImageAsDataUrl(absoluteSrc, PDF_EXPORT_IMAGE_TIMEOUT_MS);
  const img = await loadImageElement(dataSrc || absoluteSrc, PDF_EXPORT_IMAGE_TIMEOUT_MS);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  drawImageCover(ctx, img, width, height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.93);

  PDF_STATIC_PAGE_CAPTURE_CACHE.set(cacheKey, dataUrl);
  if (PDF_STATIC_PAGE_CAPTURE_CACHE.size > 8) {
    const firstKey = PDF_STATIC_PAGE_CAPTURE_CACHE.keys().next().value;
    if (firstKey) PDF_STATIC_PAGE_CAPTURE_CACHE.delete(firstKey);
  }

  return { dataUrl, format: "jpeg", layout };
};

const fetchImageAsDataUrl = async (url, timeoutMs = PDF_EXPORT_IMAGE_TIMEOUT_MS) => {
  if (!url || url === TRANSPARENT_IMAGE_SRC) return null;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;

  const cached = IMAGE_DATA_URL_CACHE.get(url);
  if (cached !== undefined) return cached;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const isAbsolute = /^https?:\/\//i.test(url);
  const isProxy = url.includes("/upload/tigris/proxy");
  let isSameOrigin = false;
  if (isAbsolute) {
    try {
      isSameOrigin = new URL(url).origin === window.location.origin;
    } catch {
      isSameOrigin = false;
    }
  }
  const credentials =
    (isAbsolute && isSameOrigin) || isProxy ? "include" : "same-origin";

  try {
    const response = await fetch(url, {
      credentials,
      signal: controller.signal,
    });
    if (!response.ok) {
      IMAGE_DATA_URL_CACHE.set(url, null);
      return null;
    }
    const blob = await response.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    IMAGE_DATA_URL_CACHE.set(url, dataUrl);
    return dataUrl;
  } catch {
    IMAGE_DATA_URL_CACHE.set(url, null);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

const cloneRenderedPageForExport = async (page, options = {}) => {
  const { timeoutMs = PDF_EXPORT_IMAGE_TIMEOUT_MS, inlineImages = false } = options;
  const clone = page.cloneNode(true);
  clone.querySelectorAll?.("[data-pdf-editor-control]").forEach((el) => el.remove());
  syncFormValues(page, clone);

  const sourceImages = page.querySelectorAll?.("img") || [];
  const cloneImages = clone.querySelectorAll?.("img") || [];
  const inlinePromises = [];
  sourceImages.forEach((sourceImg, index) => {
    const cloneImg = cloneImages[index];
    if (!cloneImg) return;
    const inlined = loadedImageToDataUrl(sourceImg);
    const renderedSrc = sourceImg.currentSrc || sourceImg.src || "";
    const fullSrc = sourceImg.getAttribute("data-pdf-full-src") || renderedSrc;
    const resolvedRenderedSrc =
      renderedSrc && isUsablePdfImageSrc(renderedSrc)
        ? resolveImgSrc(renderedSrc)
        : null;
    const resolvedFullSrc =
      fullSrc && isUsablePdfImageSrc(fullSrc)
        ? resolveImgSrc(fullSrc)
        : null;
    const initialSrc =
      inlined ||
      resolvedRenderedSrc ||
      resolvedFullSrc ||
      TRANSPARENT_IMAGE_SRC;

    cloneImg.removeAttribute("srcset");
    cloneImg.removeAttribute("sizes");
    cloneImg.removeAttribute("loading");
    cloneImg.removeAttribute("decoding");
    cloneImg.crossOrigin = "anonymous";
    cloneImg.setAttribute("crossorigin", "anonymous");
    cloneImg.setAttribute("loading", "eager");
    cloneImg.setAttribute("decoding", "sync");
    cloneImg.setAttribute("data-pdf-full-src", resolvedFullSrc || initialSrc);
    cloneImg.style.display = "block";
    cloneImg.style.opacity = "1";
    cloneImg.style.visibility = "visible";
    cloneImg.style.objectFit = cloneImg.classList?.contains("full-bg") ? "cover" : sourceImg.style.objectFit || "cover";
    cloneImg.src = initialSrc;

    if (!inlineImages || inlined) return;

    const fetchCandidates = [
      resolvedRenderedSrc,
      resolvedFullSrc,
      sourceImg.getAttribute("data-pdf-full-src"),
    ].filter((candidate, candidateIndex, candidates) =>
      candidate &&
      isUsablePdfImageSrc(candidate) &&
      !/^data:|^blob:/i.test(candidate) &&
      candidates.indexOf(candidate) === candidateIndex,
    );

    if (!fetchCandidates.length) return;

    inlinePromises.push(
      (async () => {
        for (const candidate of fetchCandidates) {
          const dataUrl = await fetchImageAsDataUrl(candidate, timeoutMs);
          if (dataUrl) {
            cloneImg.src = dataUrl;
            rememberImageDataUrlAliases(dataUrl, ...fetchCandidates);
            return;
          }
        }
      })(),
    );
  });

  if (inlineImages) {
    clone.querySelectorAll?.("*").forEach((el) => {
      const bg = el.style?.backgroundImage;
      if (!bg || bg === "none") return;
      const match = /url\(["']?([^"')]+)["']?\)/i.exec(bg);
      if (!match) return;
      const bgUrl = match[1];
      if (
        !bgUrl ||
        bgUrl === TRANSPARENT_IMAGE_SRC ||
        /^data:|^blob:/i.test(bgUrl)
      ) {
        return;
      }
      inlinePromises.push(
        fetchImageAsDataUrl(bgUrl, timeoutMs).then((dataUrl) => {
          if (dataUrl) el.style.backgroundImage = `url("${dataUrl}")`;
        }),
      );
    });
  }

  await Promise.all(inlinePromises);

  // El preview usa content-visibility:auto para saltar páginas fuera de pantalla.
  // html-to-image necesita que todo el contenido esté renderizado, así que
  // forzamos visible en el clon y en todos sus descendientes.
  clone.style.contentVisibility = "visible";
  clone.style.contain = "none";
  clone.querySelectorAll?.("*").forEach((el) => {
    if (el.style) {
      el.style.contentVisibility = "visible";
      el.style.contain = "none";
    }
  });

  const rect = page.getBoundingClientRect?.();
  const width = Math.max(1, Math.round(rect?.width || page.offsetWidth || PDF_EXPORT_CAPTURE_WIDTH));
  const height = Math.max(1, Math.round(rect?.height || page.offsetHeight || width / getMeasuredPageRatio(page)));
  clone.style.width = `${width}px`;
  clone.style.minWidth = `${width}px`;
  clone.style.maxWidth = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.minHeight = `${height}px`;
  clone.style.maxHeight = `${height}px`;
  clone.style.margin = "0";
  clone.style.borderRadius = "0";
  clone.style.boxShadow = "none";
  clone.style.transform = "none";
  clone.style.flex = "0 0 auto";
  clone.style.overflow = "hidden";
  clone.style.position = "relative";
  return clone;
};

const htmlImgAttrs = () =>
  ` onerror="this.onerror=null;this.removeAttribute('srcset');this.src='${TRANSPARENT_IMAGE_SRC}'"`;

const collectImageUrlsFromHtml = (html) => {
  const urls = new Set();
  const add = (u) => {
    if (!u || /^data:|^blob:/i.test(u)) return;
    urls.add(u);
  };
  const imgRegex = /<img[^>]*\ssrc=["']([^"']+)["']/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) add(match[1]);
  const bgRegex = /url\(["']?([^"')]+)["']?\)/gi;
  while ((match = bgRegex.exec(html)) !== null) add(match[1]);
  return Array.from(urls);
};

const resolveHtmlImageUrl = (url) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return new URL(url, window.location.origin).href;
};

const inlineHtmlImages = async (html, timeoutMs = PDF_EXPORT_IMAGE_TIMEOUT_MS) => {
  const urls = collectImageUrlsFromHtml(html);
  if (!urls.length) return html;

  const dataUrls = await Promise.all(
    urls.map((u) => fetchImageAsDataUrl(resolveHtmlImageUrl(u), timeoutMs)),
  );

  const replacementMap = new Map();
  urls.forEach((original, index) => {
    const dataUrl = dataUrls[index];
    if (dataUrl) replacementMap.set(original, dataUrl);
  });

  let result = html;
  replacementMap.forEach((dataUrl, original) => {
    result = result.split(original).join(dataUrl);
  });
  return result;
};

const CoverPage = React.memo(({ titulo, images = [], numDias, idioma = "es", forceLoadImages = false }) => {
  const duration = formatPdfCanvaDuration(numDias, idioma);
  const panels = Array.from({ length: 3 }, (_, index) => images[index] || images[0] || null);
  const hasImage = panels.some(Boolean);

  return (
    <div className={`pdf-page cover-page venso-canva-page ${!hasImage ? "cover-empty" : ""}`}>
      <div className="canva-cover-collage" aria-hidden="true">
        {panels.map((image, index) => (
          <div
            key={`${index}-${extractImageUrl(image) || "empty"}`}
            className={`canva-cover-panel canva-cover-panel--${index + 1}`}
          >
            {image ? (
              <LazyPdfImage
                src={image}
                alt=""
                draggable={false}
                className="canva-cover-image"
                onError={handlePdfImageError}
                forceLoad={forceLoadImages}
              />
            ) : (
              <div className="canva-cover-placeholder" />
            )}
          </div>
        ))}
      </div>

      <img
        src={logoBlanco}
        alt="Venso Tours"
        className="canva-cover-logo"
        onError={handlePdfImageError}
      />

      <div className="canva-cover-title-frame">
        <h1 className="canva-cover-title">{safeText(titulo)}</h1>
      </div>

      {numDias > 0 && (
        <div className="canva-cover-duration">
          <span>{duration.days}</span>
          <span className="canva-cover-duration__sep">/</span>
          <span>{duration.nights}</span>
        </div>
      )}
    </div>
  );
});
CoverPage.displayName = "CoverPage";

const FullImagePage = React.memo(({ image, forceLoadImages = false }) => (
  <div className="pdf-page full-image-page">
    <LazyPdfImage
      src={image}
      alt=""
      className="full-bg"
      draggable={false}
      onError={handlePdfImageError}
      rootMargin="0px"
      usePreview={false}
      forceLoad={forceLoadImages}
    />
  </div>
));
FullImagePage.displayName = "FullImagePage";

const LIST_ICON_MAP = {
  rec:  { bg: "#f59e0b", sym: "⊙" },
  tipo: { bg: "#6b7280", sym: "✦" },
  inc:  { bg: "#16a34a", sym: "+" },
  no:   { bg: "#dc2626", sym: "✕" },
};

const ListBlock = React.memo(({ title, items, iconType }) => {
  const ic = LIST_ICON_MAP[iconType];
  return (
    <div className="list-block">
      <div className="list-block-header">
        {ic && (
          <span className="list-icon" style={{ background: ic.bg }}>
            {ic.sym}
          </span>
        )}
        <span className="list-block-title">{title}</span>
      </div>
      <ul className="list-block-items">
        {items.map((item, i) => (
          <li key={i}>{safeText(String(item))}</li>
        ))}
      </ul>
    </div>
  );
});
ListBlock.displayName = "ListBlock";

/**
 * Calcula qué degradados necesita cada imagen según su posición en el grid.
 * Solo se ponen degradados en los bordes compartidos con otra imagen.
 */
const getImageFades = (layout, index, total) => {
  const fades = [];
  if (total <= 1) return fades;

  // layout "2": dos filas apiladas verticalmente
  if (layout === "2" || (layout == null && total === 2)) {
    if (index === 0) fades.push("bottom"); // borde inferior compartido
    if (index === 1) fades.push("top"); // borde superior compartido
  }

  // layout "3-top": 1 arriba (ancha), 2 abajo
  if (layout === "3-top" || (layout == null && total === 3)) {
    if (index === 0) fades.push("bottom");
    if (index === 1) {
      fades.push("top");
      fades.push("right");
    }
    if (index === 2) {
      fades.push("top");
      fades.push("left");
    }
  }

  // layout "3-bottom": 2 arriba, 1 abajo (ancha)
  if (layout === "3-bottom") {
    if (index === 0) {
      fades.push("bottom");
      fades.push("right");
    }
    if (index === 1) {
      fades.push("bottom");
      fades.push("left");
    }
    if (index === 2) fades.push("top");
  }

  // layout "4": 2×2 grid
  if (layout === "4" || (layout == null && total >= 4)) {
    if (index === 0) {
      fades.push("right");
      fades.push("bottom");
    }
    if (index === 1) {
      fades.push("left");
      fades.push("bottom");
    }
    if (index === 2) {
      fades.push("right");
      fades.push("top");
    }
    if (index === 3) {
      fades.push("left");
      fades.push("top");
    }
  }

  return fades;
};

const DayImagesGrid = React.memo(({ images = [], layout, onImageBad, forceLoadImages = false }) => {
  const count = images.length;

  const resolvedLayout =
    layout ||
    (count === 1
      ? "1"
      : count === 2
        ? "2"
        : count === 3
          ? "3-top"
          : count >= 4
            ? "4"
            : "0");

  const className = `img-grid-${resolvedLayout}`;

  return (
    <div className="day-images-wrapper">
      <div className={`day-images-grid ${className}`}>
        {images.slice(0, 4).map((src, i) => {
          const { full: resolvedSrc } = resolveImgSrcSet(src);
          return (
            <div key={`${i}-${resolvedSrc || ""}`} className="img-cell">
              <LazyPdfImage
                src={src}
                alt=""
                draggable={false}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  if (img.naturalWidth <= 1 && img.naturalHeight <= 1) {
                    onImageBad?.(i, src);
                  }
                }}
                onError={(event) => {
                  handlePdfImageError(event);
                  onImageBad?.(i, src);
                }}
                forceLoad={forceLoadImages}
              />
              {getImageFades(resolvedLayout, i, Math.min(count, 4)).map((dir) => (
                <div key={dir} className={`fade-${dir}`} />
              ))}
            </div>
          );
        })}
      </div>

      <div className="day-fade" />
    </div>
  );
});
DayImagesGrid.displayName = "DayImagesGrid";

const CanvaCompactList = React.memo(({ title, items = [], tone = "dark" }) => {
  if (!items.length) return null;
  return (
    <section className={`canva-day-list canva-day-list--${tone}`}>
      <h3>{title}</h3>
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{safeText(String(item))}</li>
        ))}
      </ul>
    </section>
  );
});
CanvaCompactList.displayName = "CanvaCompactList";

const DayPage = React.memo(({ day, index, images = [], idioma = "es", onImageBad, forceLoadImages = false }) => {
  const dayNumber = day.dia || index + 1;
  const incluye = limpiarLista(day.incluye);
  const noIncluye = limpiarLista(day.no_incluye);
  const recomendaciones = limpiarLista(day.recomendaciones);
  const tipoServicio = limpiarLista(day.tipo_servicio);
  const labels = getLabels(idioma);
  const canvaCopy = getPdfCanvaCopy(idioma);
  const primaryImage = images.find(Boolean) || null;
  const accentImages = images.filter(Boolean).slice(1, 3);

  const handleImageBad = React.useCallback(
    (slot, badSrc) => onImageBad?.(index, slot, badSrc),
    [index, onImageBad],
  );

  return (
    <div className="pdf-page day-page venso-canva-page">
      <div className="canva-day-media-column">
        <div className="canva-day-main-photo">
          {primaryImage ? (
            <LazyPdfImage
              src={primaryImage}
              alt=""
              draggable={false}
              onLoad={(event) => {
                const img = event.currentTarget;
                if (img.naturalWidth <= 1 && img.naturalHeight <= 1) handleImageBad(0, primaryImage);
              }}
              onError={(event) => {
                handlePdfImageError(event);
                handleImageBad(0, primaryImage);
              }}
              forceLoad={forceLoadImages}
            />
          ) : (
            <div className="canva-day-photo-placeholder" />
          )}
        </div>

        <CanvaCompactList
          title={labels.recomendaciones}
          items={recomendaciones}
          tone="compact"
        />
      </div>

      <div className="canva-day-copy-column">
        <div className="canva-day-script-row">
          <span className="canva-day-script">{canvaCopy.dayScript} {dayNumber}</span>
          <span className="canva-day-script-line" />
        </div>

        {index === 0 && (
          <p className="canva-day-intro">{canvaCopy.firstDayIntro}</p>
        )}

        <h2 className="canva-day-title">{safeText(day.titulo || "")}</h2>
        {day.descripcion && <p className="canva-day-description">{safeText(day.descripcion)}</p>}

        <div className="canva-day-details">
          <CanvaCompactList title={labels.incluye} items={incluye} tone="include" />
          <CanvaCompactList title={labels.no_incluye} items={noIncluye} tone="exclude" />
          <CanvaCompactList title={labels.tipo_servicio} items={tipoServicio} tone="service" />
        </div>

        {accentImages.length > 0 && (
          <div className={`canva-day-accent-grid canva-day-accent-grid--${accentImages.length}`}>
            {accentImages.map((image, accentIndex) => (
              <div className="canva-day-accent-photo" key={`${accentIndex}-${extractImageUrl(image) || ""}`}>
                <LazyPdfImage
                  src={image}
                  alt=""
                  draggable={false}
                  onError={(event) => {
                    handlePdfImageError(event);
                    handleImageBad(accentIndex + 1, image);
                  }}
                  forceLoad={forceLoadImages}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
DayPage.displayName = "DayPage";

export const ElegirnosPage = React.memo(({ idioma = "es", className = "" }) => {
  const c = ELEGIRNOS_CONTENT[idioma] || ELEGIRNOS_CONTENT.es;
  return (
    <div className={`pdf-page elegirnos-page${className ? " " + className : ""}`.trim()}>
      <img
        src={PAGE_ELEGIRNOS_VACIO}
        data-pdf-full-src={PAGE_ELEGIRNOS_VACIO}
        alt=""
        className="full-bg"
        crossOrigin="anonymous"
        loading="eager"
        decoding="sync"
        onError={handlePdfImageError}
      />
      <div className="elegirnos-title-bar">
        <span className="elegirnos-title-group">
          {c.headerLeft} <strong>{c.headerBold}</strong>
        </span>
        <span className="elegirnos-title-group">
          {c.headerRight} <strong>{c.headerBoldRight}</strong>
        </span>
      </div>
      <div className="elegirnos-text-panel">
        <p className="elegirnos-para">{c.para1}</p>
        <p className="elegirnos-para">{c.para2}</p>
      </div>
    </div>
  );
});
ElegirnosPage.displayName = "ElegirnosPage";

const ItineraryOverviewPage = React.memo(({ dias = [], image, idioma = "es", forceLoadImages = false }) => {
  const labels = getLabels(idioma);
  const mid = Math.ceil(dias.length / 2);
  const col1 = dias.slice(0, mid);
  const col2 = dias.slice(mid);
  const { full: src } = resolveImgSrcSet(image);
  return (
    <div className="pdf-page overview-page">
      <div className="overview-left">
        {src ? (
          <LazyPdfImage
            src={image}
            alt=""
            className="full-bg"
            draggable={false}
            onError={handlePdfImageError}
            forceLoad={forceLoadImages}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "#2d6a4f" }} />
        )}
      </div>
      <div className="overview-right">
        <h2 className="overview-title">{labels.itinerario_general}</h2>
        <div className="overview-grid">
          <div className="overview-col">
            {col1.map((d, i) => (
              <div key={i} className="overview-item">
                <div className="overview-num">
                  {String(d.dia || i + 1).padStart(2, "0")}
                </div>
                <span className="overview-item-text">{safeText(d.titulo || "")}</span>
              </div>
            ))}
          </div>
          <div className="overview-divider" />
          <div className="overview-col">
            {col2.map((d, i) => (
              <div key={i} className="overview-item">
                <div className="overview-num">
                  {String(d.dia || mid + i + 1).padStart(2, "0")}
                </div>
                <span className="overview-item-text">{safeText(d.titulo || "")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});
ItineraryOverviewPage.displayName = "ItineraryOverviewPage";

/* =========================
 HELPERS TITULO ITINERARIO
========================= */

const buildItineraryTitleMap = (cotizacion) => {
  const itinerario = cotizacion?.itinerario || cotizacion?.dias || [];
  const map = {};
  if (Array.isArray(itinerario)) {
    for (const day of itinerario) {
      const num = day?.numero ?? day?.dia;
      const titulo = String(
        day?.itinerarioDia?.titulo ||
        day?.itinerario_dia?.titulo ||
        day?.titulo || ""
      ).trim();
      if (num != null && titulo) map[String(num)] = titulo;
    }
  }
  return map;
};

const applyItineraryTitles = (diasInfoPdf, cotizacion) => {
  const titleMap = buildItineraryTitleMap(cotizacion);
  if (!Object.keys(titleMap).length) return diasInfoPdf;
  return diasInfoPdf.map((day) => {
    const titulo =
      titleMap[String(day.dia)] || titleMap[String(day.numero)];
    return titulo ? { ...day, titulo } : day;
  });
};

/* =========================
 CONTENEDOR PREVIEW
========================= */

export const PdfPages = React.memo(({
  cotizacion,
  imagenesEditor = {},
  excelPreviewCategories = null,
  referenceImages = [],
  forceLoadImages = false,
}) => {
  const diasInfoPdf = React.useMemo(
    () =>
      applyItineraryTitles(
        Array.isArray(cotizacion?.info_pdf)
          ? normalizeMojibakeValue(cotizacion.info_pdf)
          : [],
        cotizacion,
      ),
    [cotizacion?.info_pdf, cotizacion?.itinerario, cotizacion?.dias],
  );

  const categoryOptions = React.useMemo(
    () => getPdfHotelCategoryOptions(cotizacion),
    [cotizacion?.selectedHotel, cotizacion?.hotel, cotizacion?.packagetype, cotizacion?.packageType],
  );

  const activeExcelPreviewCategories = React.useMemo(
    () =>
      Array.isArray(excelPreviewCategories)
        ? excelPreviewCategories
        : getDefaultPdfExcelCategories(cotizacion, categoryOptions),
    [excelPreviewCategories, cotizacion, categoryOptions],
  );

  const [repairMedia, setRepairMedia] = React.useState(null);
  const failedImageKeysRef = React.useRef(new Set());

  React.useEffect(() => {
    setRepairMedia(null);
    failedImageKeysRef.current = new Set();
  }, [cotizacion?.id, diasInfoPdf.length]);

  const mediaForRender = repairMedia || cotizacion?.pdf_media || {};

  const imagenesEditorFromRepair = React.useMemo(
    () => (repairMedia ? buildImagenesEditorFromMedia(repairMedia, diasInfoPdf) : null),
    [repairMedia, diasInfoPdf],
  );

  const handleDayImageBad = React.useCallback(
    (dayIndex, slot, badSrc) => {
      const badKey = resolveImgSrc(badSrc) || String(badSrc || "");
      const repairKey = `${dayIndex}:${slot}:${badKey}`;
      if (!referenceImages.length || failedImageKeysRef.current.has(repairKey)) {
        return;
      }
      failedImageKeysRef.current.add(repairKey);

      setRepairMedia((currentRepairMedia) => {
        const sourceMedia = currentRepairMedia || cotizacion?.pdf_media || {};
        const sourceDays = sourceMedia.days || {};
        const dayMedia = sourceDays[dayIndex] || sourceDays[String(dayIndex)] || { layout: "1", images: [] };
        const currentImages = Array.isArray(dayMedia.images) ? dayMedia.images : [];
        const replacement = chooseReplacementImageForDay({
          images: referenceImages,
          day: diasInfoPdf?.[dayIndex],
          dayIndex,
          cotizacion,
          avoid: [
            ...currentImages,
            badSrc,
            ...Array.from(failedImageKeysRef.current),
          ],
        });

        if (!replacement) return currentRepairMedia;

        const nextImages = [...currentImages];
        nextImages[slot] = replacement;

        return {
          ...sourceMedia,
          days: {
            ...sourceDays,
            [dayIndex]: {
              ...dayMedia,
              images: nextImages,
              autoAssigned: true,
              autoSource: "repair",
            },
          },
        };
      });
    },
    // Stabilize dependencies so the callback identity does not change on every parent render.
    [cotizacion?.id, cotizacion?.pdf_media, diasInfoPdf, referenceImages],
  );

  if (!diasInfoPdf.length) return null;

  const hasEditorImages = Boolean(
    imagenesEditor &&
      (imagenesEditor.cover ||
        imagenesEditor.overviewImage ||
        Object.keys(imagenesEditor.days || {}).length ||
        Object.keys(imagenesEditor.layouts || {}).length),
  );

  const effectiveImagenesEditor = React.useMemo(
    () =>
      imagenesEditorFromRepair ||
      (hasEditorImages
        ? imagenesEditor
        : buildImagenesEditorFromMedia(mediaForRender, diasInfoPdf)),
    [imagenesEditorFromRepair, hasEditorImages, imagenesEditor, mediaForRender, diasInfoPdf],
  );

  const coverImages = React.useMemo(
    () =>
      resolveVensoCanvaCoverImages(
        {
          ...mediaForRender,
          cover: effectiveImagenesEditor?.cover || mediaForRender?.cover,
          coverImages:
            effectiveImagenesEditor?.coverImages ||
            mediaForRender?.coverImages ||
            mediaForRender?.cover_images,
          days: mediaForRender?.days || {},
        },
        diasInfoPdf,
      ),
    [effectiveImagenesEditor, mediaForRender, diasInfoPdf],
  );

  const idioma = cotizacion?.idioma || "es";
  const canvaCopy = getPdfCanvaCopy(idioma);
  const coverTitle = React.useMemo(
    () => resolveInfoPdfCoverTitle(diasInfoPdf, cotizacion.titulo || canvaCopy.untitledQuote),
    [diasInfoPdf, cotizacion?.titulo, canvaCopy.untitledQuote],
  );

  return (
    <div className="pdf-pages-wrapper pdf-pages-wrapper--venso-canva">
      <CoverPage
        titulo={coverTitle}
        images={coverImages}
        numDias={diasInfoPdf.length}
        idioma={idioma}
        forceLoadImages={forceLoadImages}
      />

      {diasInfoPdf.map((day, i) => (
        <DayPage
          key={i}
          day={day}
          index={i}
          images={effectiveImagenesEditor?.days?.[i] || []}
          idioma={idioma}
          onImageBad={handleDayImageBad}
          forceLoadImages={forceLoadImages}
        />
      ))}

      <PricingPage
        cotizacion={{ ...cotizacion, pdf_media: mediaForRender }}
        availableCategories={categoryOptions}
        excelPreviewCategories={activeExcelPreviewCategories}
        idioma={idioma}
      />

      <TermsAndConditionsPage
        idioma={idioma}
        cotizacion={{ ...cotizacion, pdf_media: mediaForRender }}
      />
    </div>
  );
});
PdfPages.displayName = "PdfPages";

/* =========================
 ESTILOS PARA IMPRESIÓN
========================= */

const getPrintStyles = () => `
 @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=Poppins:wght@400;500;600;700;800;900&display=swap');
 *, *::before, *::after { box-sizing:border-box; }
 @page { size:${VENSO_CANVA_PAGE_WIDTH}pt ${VENSO_CANVA_PAGE_HEIGHT}pt; margin:0 !important; }
 html, body { margin:0; padding:0; width:${VENSO_CANVA_PAGE_WIDTH}px; background:#fff; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
 .pdf-page { width:${VENSO_CANVA_PAGE_WIDTH}px; height:${VENSO_CANVA_PAGE_HEIGHT}px; position:relative; overflow:hidden; page-break-after:always; break-after:page; background:#fff; font-family:'Montserrat',Arial,sans-serif; }
 .venso-canva-page { background:#fff; color:#161616; }

 /* Cover inspired by the supplied Venso Canva proposals */
 .cover-page { background:#111; }
 .canva-cover-collage { position:absolute; inset:0; overflow:hidden; background:#151515; }
 .canva-cover-panel { position:absolute; top:0; bottom:0; overflow:hidden; }
 .canva-cover-panel--1 { left:0; width:34%; clip-path:polygon(0 0,100% 0,83% 100%,0 100%); }
 .canva-cover-panel--2 { left:27%; width:48%; z-index:2; clip-path:polygon(12% 0,100% 0,88% 100%,0 100%); }
 .canva-cover-panel--3 { right:0; width:36%; clip-path:polygon(17% 0,100% 0,100% 100%,0 100%); }
 .canva-cover-image,.canva-cover-panel img { width:100%; height:100%; object-fit:cover; display:block; }
 .canva-cover-panel::after { content:''; position:absolute; inset:0; background:linear-gradient(180deg,rgba(0,0,0,.1),rgba(0,0,0,.26)); }
 .canva-cover-placeholder,.canva-image-placeholder { width:100%; height:100%; background:linear-gradient(145deg,#252525,#555); }
 .canva-cover-logo { position:absolute; left:34px; top:30px; z-index:5; width:92px; height:auto; object-fit:contain; filter:drop-shadow(0 2px 8px rgba(0,0,0,.35)); }
 .canva-cover-title-frame { position:absolute; z-index:5; left:12%; right:12%; top:34%; padding:18px 24px 20px; border:2px solid rgba(255,255,255,.92); background:rgba(0,0,0,.25); box-shadow:0 0 0 1px rgba(0,0,0,.18); }
 .canva-cover-title { margin:0; color:#fff; text-align:center; text-transform:uppercase; font-family:Georgia,'Times New Roman',serif; font-size:42px; line-height:1.08; font-weight:700; letter-spacing:.025em; text-shadow:0 2px 12px rgba(0,0,0,.55); }
 .canva-cover-duration { position:absolute; z-index:6; left:50%; top:52.8%; transform:translateX(-50%); display:flex; align-items:center; gap:10px; padding:9px 28px; background:#ff007e; color:#fff; font-family:'Montserrat',sans-serif; font-size:16px; font-weight:800; letter-spacing:.03em; white-space:nowrap; }
 .canva-cover-duration__sep { opacity:.72; }

 /* Itinerary day */
 .day-page { display:grid; grid-template-columns:43% 57%; padding:28px 30px 28px 26px; gap:28px; }
 .canva-day-media-column { min-width:0; display:flex; flex-direction:column; }
 .canva-day-main-photo { width:100%; height:675px; overflow:hidden; background:#ececec; }
 .canva-day-main-photo img { width:100%; height:100%; object-fit:cover; display:block; }
 .canva-day-photo-placeholder { width:100%; height:100%; background:linear-gradient(145deg,#efefef,#d8d8d8); }
 .canva-day-copy-column { min-width:0; position:relative; display:flex; flex-direction:column; padding:6px 0 0; }
 .canva-day-script-row { display:flex; align-items:flex-end; gap:12px; height:56px; margin-bottom:4px; }
 .canva-day-script { color:#ff007e; font-family:'Brush Script MT','Segoe Script',cursive; font-size:48px; line-height:.95; transform:rotate(-3deg); white-space:nowrap; }
 .canva-day-script-line { height:2px; background:#ff007e; flex:1; margin-bottom:8px; }
 .canva-day-intro { margin:0 0 14px; color:#ff007e; font-family:'Montserrat',sans-serif; font-weight:800; font-size:15px; line-height:1.25; max-width:90%; }
 .canva-day-title { margin:0 0 10px; font-family:Georgia,'Times New Roman',serif; font-size:24px; line-height:1.12; font-weight:700; text-transform:uppercase; color:#171717; }
 .canva-day-description { margin:0; font-size:12.2px; line-height:1.47; text-align:justify; color:#2f2f2f; white-space:normal; }
 .canva-day-details { display:grid; grid-template-columns:1fr 1fr; gap:12px 22px; margin-top:16px; align-items:start; }
 .canva-day-list { min-width:0; }
 .canva-day-list h3 { margin:0 0 5px; color:#151515; font-family:Georgia,'Times New Roman',serif; font-size:15px; line-height:1.1; font-weight:700; }
 .canva-day-list ul { margin:0; padding-left:15px; }
 .canva-day-list li { color:#313131; font-size:9.7px; line-height:1.35; margin-bottom:2px; }
 .canva-day-list--compact { margin-top:12px; padding-top:8px; border-top:1px solid #d7d7d7; }
 .canva-day-list--compact h3 { font-size:15px; }
 .canva-day-list--compact li { font-size:9.4px; }
 .canva-day-list--include h3,.canva-day-list--service h3 { color:#151515; }
 .canva-day-list--exclude h3 { color:#151515; }
 .canva-day-accent-grid { margin-top:auto; margin-left:auto; width:78%; height:150px; display:grid; gap:8px; padding-top:12px; }
 .canva-day-accent-grid--1 { grid-template-columns:1fr; }
 .canva-day-accent-grid--2 { grid-template-columns:1fr 1fr; }
 .canva-day-accent-photo { overflow:hidden; border-radius:8px; box-shadow:0 6px 18px rgba(0,0,0,.12); }
 .canva-day-accent-photo img { width:100%; height:100%; object-fit:cover; display:block; }

 /* Shared closing pages */
 .canva-closing-page { position:relative; padding:48px 58px 50px; background:#f6f6f4; color:#222; }
 .canva-closing-backdrop { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; filter:grayscale(1); opacity:.10; }
 .canva-closing-veil { position:absolute; inset:0; background:rgba(248,248,246,.84); }
 .canva-closing-content { position:relative; z-index:2; }
 .canva-closing-title { margin:0 0 22px; text-align:center; color:#ff007e; font-family:Georgia,'Times New Roman',serif; font-size:24px; font-weight:700; text-transform:uppercase; }
 .canva-closing-subtitle { margin:14px 0 8px; color:#ff007e; font-family:Georgia,'Times New Roman',serif; font-size:17px; font-weight:700; }
 .canva-closing-copy,.canva-closing-copy li { font-size:10.5px; line-height:1.48; color:#333; }
 .canva-closing-copy ul { padding-left:18px; margin:5px 0 12px; }

 /* Pricing page */
 .pricing-page { position:relative; padding:44px 56px 48px; background:#f6f6f4; color:#222; }
 .pricing-page .canva-closing-content { height:100%; display:flex; flex-direction:column; }
 .pricing-canva-lists { display:grid; grid-template-columns:1fr 1fr; gap:26px; margin-bottom:16px; }
 .pricing-canva-list h3 { color:#ff007e; font-family:Georgia,'Times New Roman',serif; font-size:17px; margin:0 0 7px; }
 .pricing-canva-list ul { margin:0; padding-left:17px; }
 .pricing-canva-list li { font-size:9.8px; line-height:1.38; margin-bottom:3px; }
 .pricing-canva-table { width:100%; border-collapse:collapse; margin-top:12px; font-size:10px; background:rgba(255,255,255,.72); }
 .pricing-canva-table th { padding:9px 8px; background:#ff007e; color:#fff; text-transform:uppercase; font-size:9px; letter-spacing:.04em; border:1px solid #d50069; }
 .pricing-canva-table td { padding:8px; border:1px solid #f0a4ca; vertical-align:top; }
 .pricing-canva-price { font-weight:900; color:#ff007e; white-space:nowrap; }
 .pricing-canva-notes { margin-top:auto; padding-top:14px; border-top:1px solid rgba(255,0,126,.25); }
 .pricing-canva-notes h3 { color:#ff007e; font-family:Georgia,'Times New Roman',serif; font-size:16px; margin:0 0 5px; }
 .pricing-canva-notes li { font-size:9px; line-height:1.35; margin-bottom:2px; }
 .canva-legal-sections { display:grid; grid-template-columns:1fr 1fr; gap:18px 30px; align-content:start; }
 .canva-legal-section { break-inside:avoid; }
 .canva-legal-section h3 { margin:0 0 5px; color:#ff007e; font-family:Georgia,'Times New Roman',serif; font-size:15px; line-height:1.18; }
 .canva-legal-section p { margin:0 0 5px; }
 .canva-legal-section ul { margin:4px 0 0; padding-left:16px; }
 .canva-legal-signature { margin-top:auto; padding-top:12px; border-top:1px solid rgba(255,0,126,.22); color:#ff007e; font-size:9px; font-weight:800; letter-spacing:.08em; text-align:right; }
`;

/* =========================
 HTML BUILDER
========================= */

const HTML_ICON_STYLES = {
  rec:  { bg: "#f59e0b", sym: "&#x2299;" },
  tipo: { bg: "#6b7280", sym: "&#x2726;" },
  inc:  { bg: "#16a34a", sym: "+"        },
  no:   { bg: "#dc2626", sym: "&#x2715;" },
};

const buildListBlockHtml = (title, items, iconType) => {
  const ic = HTML_ICON_STYLES[iconType];
  const iconHtml = ic
    ? `<span class="list-icon" style="background:${ic.bg}">${ic.sym}</span>`
    : "";
  const itemsHtml = items
    .map((item) => `<li>${safeText(String(item))}</li>`)
    .join("");
  return `
 <div class="list-block">
 <div class="list-block-header">
 ${iconHtml}
 <span class="list-block-title">${title}</span>
 </div>
 <ul class="list-block-items">${itemsHtml}</ul>
 </div>`;
};

export const buildCotizacionHtmlPages = (
  cotizacion,
  { roomOptionsByCategory = {} } = {},
) => {
  const diasInfoPdf = applyItineraryTitles(
    Array.isArray(cotizacion?.info_pdf)
      ? normalizeMojibakeValue(cotizacion.info_pdf)
      : [],
    cotizacion,
  );

  if (!diasInfoPdf.length) return "";

  const labels = getLabels(cotizacion.idioma);
  const canvaCopy = getPdfCanvaCopy(cotizacion.idioma);
  const titulo = resolveInfoPdfCoverTitle(
    diasInfoPdf,
    cotizacion.titulo || canvaCopy.untitledQuote,
  );
  const rawMedia = cotizacion.pdf_media || {};
  const media = {
    ...rawMedia,
    days: normalizePdfMediaDaysForInfoPdf(rawMedia, diasInfoPdf),
  };
  const coverImages = resolveVensoCanvaCoverImages(media, diasInfoPdf).map(
    (image) => resolveImgSrc(image),
  );

  const imageTag = (src, className = "") =>
    src
      ? `<img src="${src}"${className ? ` class="${className}"` : ""} alt=""${htmlImgAttrs()} />`
      : `<div class="canva-image-placeholder"></div>`;
  const compactList = (title, items, tone) => {
    const list = limpiarLista(items);
    if (!list.length) return "";
    return `<section class="canva-day-list canva-day-list--${tone}"><h3>${safeText(title)}</h3><ul>${list
      .map((item) => `<li>${safeText(String(item))}</li>`)
      .join("")}</ul></section>`;
  };

  const numDias = diasInfoPdf.length;
  const duration = formatPdfCanvaDuration(numDias, cotizacion.idioma);
  const panels = Array.from(
    { length: 3 },
    (_, index) => coverImages[index] || "",
  );

  let pagesHtml = `
 <div class="pdf-page cover-page venso-canva-page${coverImages.some(Boolean) ? "" : " cover-empty"}">
  <div class="canva-cover-collage">
   ${panels
     .map(
       (src, index) =>
         `<div class="canva-cover-panel canva-cover-panel--${index + 1}">${imageTag(src, "canva-cover-image")}</div>`,
     )
     .join("")}
  </div>
  <img src="${logoBlanco}" class="canva-cover-logo" alt=""${htmlImgAttrs()} />
  <div class="canva-cover-title-frame"><h1 class="canva-cover-title">${safeText(titulo)}</h1></div>
  <div class="canva-cover-duration"><span>${duration.days}</span><span class="canva-cover-duration__sep">/</span><span>${duration.nights}</span></div>
 </div>`;

  diasInfoPdf.forEach((day, index) => {
    const dayMedia = media.days?.[index] || media.days?.[String(index)] || {};
    const dayImages = (Array.isArray(dayMedia.images) ? dayMedia.images : [])
      .map((image) => resolveImgSrc(getMediaImageSrc(image) || image))
      .filter(Boolean);
    const dayNumber = day.dia || index + 1;
    const primaryImage = dayImages[0] || "";
    const accentImages = dayImages.slice(1, 3);

    pagesHtml += `
 <div class="pdf-page day-page venso-canva-page">
  <div class="canva-day-media-column">
   <div class="canva-day-main-photo">${imageTag(primaryImage)}</div>
   ${compactList(labels.recomendaciones, day.recomendaciones, "compact")}
  </div>
  <div class="canva-day-copy-column">
   <div class="canva-day-script-row"><span class="canva-day-script">${canvaCopy.dayScript} ${dayNumber}</span><span class="canva-day-script-line"></span></div>
   ${index === 0 ? `<p class="canva-day-intro">${canvaCopy.firstDayIntro}</p>` : ""}
   <h2 class="canva-day-title">${safeText(day.titulo || "")}</h2>
   ${day.descripcion ? `<p class="canva-day-description">${safeText(day.descripcion)}</p>` : ""}
   <div class="canva-day-details">
    ${compactList(labels.incluye, day.incluye, "include")}
    ${compactList(labels.no_incluye, day.no_incluye, "exclude")}
    ${compactList(labels.tipo_servicio, day.tipo_servicio, "service")}
   </div>
   ${
     accentImages.length
       ? `<div class="canva-day-accent-grid canva-day-accent-grid--${accentImages.length}">${accentImages
           .map((src) => `<div class="canva-day-accent-photo">${imageTag(src)}</div>`)
           .join("")}</div>`
       : ""
   }
  </div>
 </div>`;
  });

  pagesHtml += `
 ${getPricingPageHtml(cotizacion, { roomOptionsByCategory })}
 ${getTermsAndConditionsPageHtml(cotizacion?.idioma || "es", cotizacion)}
 `;

  return pagesHtml;
};

/* =========================
 EXPORTAR PDF
========================= */

const capturePdfPage = async (page, pageIndex, baseCaptureOpts) => {
  const staticFullPageSrc = getDirectStaticFullPageImageSrc(page);
  if (staticFullPageSrc) {
    try {
      return await renderStaticFullPageImageCapture(staticFullPageSrc, page);
    } catch (error) {
      console.warn(
        `No se pudo renderizar página estática ${staticFullPageSrc}; usando captura DOM.`,
        error,
      );
    }
  }

  const format = shouldExportPageAsPng(page) ? PDF_TEXT_PAGE_FORMAT : "jpeg";
  const pageCaptureOpts = {
    ...baseCaptureOpts,
    backgroundColor: page?.classList?.contains("tyc-reservation-page")
      ? "#0d583d"
      : "#ffffff",
  };
  try {
    const dataUrl = format === "png"
      ? await toPng(page, pageCaptureOpts)
      : await toJpeg(page, pageCaptureOpts);
    return { dataUrl, format, layout: getPdfPageLayout(page) };
  } catch (error) {
    console.warn(`Error capturando página ${pageIndex + 1} (${page.className}):`, error);
    throw error;
  }
};

const capturePdfPagesInBatches = async (pagesToCapture, baseCaptureOpts) => {
  const captures = new Array(pagesToCapture.length);
  for (let start = 0; start < pagesToCapture.length; start += PDF_EXPORT_CAPTURE_BATCH_SIZE) {
    const batch = pagesToCapture.slice(start, start + PDF_EXPORT_CAPTURE_BATCH_SIZE);
    const results = await Promise.all(
      batch.map((page, offset) =>
        capturePdfPage(page, start + offset, baseCaptureOpts),
      ),
    );
    results.forEach((capture, offset) => {
      captures[start + offset] = capture;
    });
    if (start + PDF_EXPORT_CAPTURE_BATCH_SIZE < pagesToCapture.length) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }
  return captures;
};

const buildCotizacionPdfBlob = async (cotizacion, pageElements, { silent = false } = {}) => {
  const renderedPageElements = asPdfPageArray(pageElements);
  const renderPlan = renderedPageElements.length
    ? null
    : await fetchCotizacionPdfRenderPlan(cotizacion);
  const exportCotizacion = mergeCotizacionRenderPlan(cotizacion, renderPlan);
  const diasInfoPdf = Array.isArray(exportCotizacion?.info_pdf)
    ? normalizeMojibakeValue(exportCotizacion.info_pdf)
    : [];

  if (!diasInfoPdf.length) {
    throw new Error("No existe cotizacion.info_pdf");
  }

  const plannedImageUrls = getPlannedCotizacionImageUrls(exportCotizacion, renderPlan);

  // Loading overlay solo cuando el usuario descarga sin PDF precompilado.
  let overlay = null;
  if (!silent) {
    overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.45);" +
      "display:flex;align-items:center;justify-content:center;";
    overlay.innerHTML =
      '<div style="background:#fff;padding:24px 36px;border-radius:12px;' +
      'font-family:sans-serif;font-size:15px;color:#333;box-shadow:0 8px 32px rgba(0,0,0,0.18);">' +
      "Generando PDF\u2026</div>";
    document.body.appendChild(overlay);
  }

  let iframeToClean = null;
  let captureHostToClean = null;

  try {
    const fontCSS = "";

    const applyFallbackCaptureLayout = (page) => {
      const aspect = page?.classList?.contains("pdf-page--summary-portrait")
        ? 900 / 636
        : VENSO_CANVA_PAGE_ASPECT;
      const width = PDF_EXPORT_CAPTURE_WIDTH;
      const height = Math.round(width / aspect);
      page.style.width = `${width}px`;
      page.style.minWidth = `${width}px`;
      page.style.maxWidth = `${width}px`;
      page.style.height = `${height}px`;
      page.style.minHeight = `${height}px`;
      page.style.maxHeight = `${height}px`;
      page.style.aspectRatio = `${aspect}`;
      page.style.margin = "0";
      page.style.borderRadius = "0";
      page.style.boxShadow = "none";
      page.style.flex = "0 0 auto";
    };

    let pagesToCapture = [];

    if (renderedPageElements.length > 0) {
      // Fast path: reutiliza el DOM visible del editor/preview sin reconstruir páginas
      // ni convertir cada imagen a base64. El backend calienta Tigris y el navegador
      // usa cache HTTP para que html-to-image lea las imágenes ya resueltas.
      const fullSrcs = new Set(plannedImageUrls);
      collectRenderedPageImageUrls(renderedPageElements, fullSrcs);
      await prewarmPdfImages(fullSrcs);
      await Promise.all(renderedPageElements.map((page) => waitForCotizacionPdfImagesReady(page)));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const maxWidth = Math.max(
        ...renderedPageElements.map((page) =>
          Math.round(page.getBoundingClientRect?.().width || page.offsetWidth || PDF_EXPORT_CAPTURE_WIDTH),
        ),
        PDF_EXPORT_CAPTURE_WIDTH,
      );
      captureHostToClean = document.createElement("div");
      captureHostToClean.setAttribute("aria-hidden", "true");
      captureHostToClean.style.cssText =
        `position:fixed;top:0;left:-20000px;width:${maxWidth}px;z-index:-1;` +
        "overflow:hidden;background:#fff;pointer-events:none;";
      document.body.appendChild(captureHostToClean);

      pagesToCapture = await Promise.all(
        renderedPageElements.map(async (page) => {
          const clone = await cloneRenderedPageForExport(page, {
            // Exportar siempre con las imágenes ya pintadas/resueltas del DOM.
            // Esto evita que html-to-image vuelva a pedir Tigris y capture paneles vacíos.
            inlineImages: true,
            timeoutMs: PDF_EXPORT_IMAGE_TIMEOUT_MS,
          });
          clone.querySelectorAll(".full-image-page .full-bg").forEach((img) => {
            img.style.width = "100%";
            img.style.height = "100%";
            img.style.objectFit = "cover";
            img.style.display = "block";
          });
          captureHostToClean.appendChild(clone);
          return clone;
        }),
      );

      await waitForCotizacionPdfImagesReady(captureHostToClean);
    } else {
      const hasPdfMediaImages = pdfMediaHasUsableImages(exportCotizacion?.pdf_media || {}, diasInfoPdf);
      const referenceLibrary = hasPdfMediaImages
        ? { images: [], categories: [] }
        : await fetchReferenceImageManifest();
      const effectiveCotizacion = {
        ...exportCotizacion,
        pdf_media: hasPdfMediaImages
          ? { ...(exportCotizacion?.pdf_media || {}) }
          : buildAutoPdfMedia({
              pdfMedia: exportCotizacion?.pdf_media || {},
              cotizacion: exportCotizacion,
              infoPdf: diasInfoPdf,
              referenceImages: referenceLibrary.images || [],
            }),
      };

      let roomOptionsByCategory = {};
      try {
        const packageType =
          effectiveCotizacion?.selectedHotel?.packageType ||
          effectiveCotizacion?.selected_hotel?.packageType ||
          effectiveCotizacion?.hotel?.packageType ||
          effectiveCotizacion?.packagetype ||
          effectiveCotizacion?.packageType ||
          "compartido";
        const dictionary = await fetchHotelQuoteDictionaryData({
          axios,
          tariffType: resolveQuotationTariffType(effectiveCotizacion),
          agencyId: Number(effectiveCotizacion?.agency_id || 1),
        });
        roomOptionsByCategory = buildRoomOptionsByCategory(
          dictionary.byCategory,
          "externa",
          packageType,
        );
      } catch (error) {
        console.warn(
          "No fue posible cargar tarifas hoteleras para el PDF directo.",
          error,
        );
      }

      const pagesHtml = buildCotizacionHtmlPages(effectiveCotizacion, {
        roomOptionsByCategory,
      });
      const htmlImageUrls = collectImageUrlsFromHtml(pagesHtml).map(resolveHtmlImageUrl);
      await prewarmPdfImages([
        ...plannedImageUrls,
        ...collectPdfMediaImageUrls(effectiveCotizacion?.pdf_media || {}),
        ...htmlImageUrls,
      ]);
      const cleanCss = getPrintStyles().replace(/@page[^{]*\{[^}]*\}/g, "");

      const iframe = document.createElement("iframe");
      iframe.style.cssText =
        `position:fixed;top:-9999px;left:0;width:${PDF_EXPORT_CAPTURE_WIDTH}px;height:${PDF_EXPORT_CAPTURE_HEIGHT}px;border:none;`;
      document.body.appendChild(iframe);
      iframeToClean = iframe;

      const iDoc = iframe.contentDocument;
      iDoc.open();
      iDoc.write(
        `<!DOCTYPE html><html><head>` +
          `<base href="${window.location.origin}/">` +
          `<style>${cleanCss}</style>` +
          `</head><body style="margin:0;padding:0;width:${PDF_EXPORT_CAPTURE_WIDTH}px;">${pagesHtml}</body></html>`,
      );
      iDoc.close();

      const iPageEls = iDoc.querySelectorAll(".pdf-page");
      iPageEls.forEach((el) => {
        applyFallbackCaptureLayout(el);
        el.style.overflow = "hidden";
        el.style.position = "relative";
        el.style.padding = el.classList.contains("pdf-page--summary-portrait") ? el.style.padding : "0";
      });

      await waitForCotizacionPdfImagesReady(iDoc);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      pagesToCapture = Array.from(iPageEls);
    }

    const baseCaptureOpts = {
      quality: 0.86,
      pixelRatio: PDF_EXPORT_PIXEL_RATIO,
      cacheBust: false,
      fontEmbedCSS: fontCSS,
      includeQueryParams: true,
      imagePlaceholder: TRANSPARENT_IMAGE_SRC,
      fetchRequestInit: { cache: "force-cache" },
      filter: (node) => {
        if (!node || !node.getAttribute) return true;
        return !node.closest?.("[data-pdf-editor-control]");
      },
      style: {
        boxShadow: "none",
        borderRadius: "0",
        margin: "0",
        transform: "none",
      },
    };

    const pageCaptures = await capturePdfPagesInBatches(pagesToCapture, baseCaptureOpts);

    if (iframeToClean) {
      iframeToClean.remove();
      iframeToClean = null;
    }
    if (captureHostToClean) {
      captureHostToClean.remove();
      captureHostToClean = null;
    }

    const pdfDoc = await PDFDocument.create();
    for (let pageIndex = 0; pageIndex < pageCaptures.length; pageIndex += 1) {
      const { dataUrl, format, layout } = pageCaptures[pageIndex];
      const raw = atob(dataUrl.split(",")[1]);
      const bytes = new Uint8Array(raw.length);
      for (let j = 0; j < raw.length; j++) bytes[j] = raw.charCodeAt(j);
      const img = format === "png"
        ? await pdfDoc.embedPng(bytes)
        : await pdfDoc.embedJpg(bytes);
      const p = pdfDoc.addPage([layout.pdfWidth, layout.pdfHeight]);
      p.drawImage(img, {
        x: 0,
        y: 0,
        width: layout.pdfWidth,
        height: layout.pdfHeight,
      });
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    // Reutilizamos exactamente las mismas capturas para Word. Así PDF y DOCX
    // mantienen paridad visual sin volver a renderizar todas las páginas.
    blob.__vensoPageCaptures = pageCaptures;
    return blob;
  } finally {
    if (iframeToClean) iframeToClean.remove();
    if (captureHostToClean) captureHostToClean.remove();
    overlay?.remove();
  }
};

const PDF_EXPORT_PREFETCH_CACHE = new Map();

const downloadPdfBlob = (blob, cotizacion) => {
  downloadBrowserBlob(
    blob,
    `${safeText(cotizacion?.titulo || "cotizacion")}.pdf`,
  );
};

const downloadWordBlob = (blob, cotizacion) => {
  downloadBrowserBlob(
    blob,
    `${safeText(cotizacion?.titulo || "cotizacion")}.docx`,
  );
};

const hashPdfExportText = (value = "") => {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const getCotizacionExportFingerprint = (cotizacion = {}) => {
  if (cotizacion?.pdf_render_fingerprint) return cotizacion.pdf_render_fingerprint;

  return hashPdfExportText(
    JSON.stringify({
      id: cotizacion?.id || "",
      updatedat: cotizacion?.updatedat || cotizacion?.updated_at || cotizacion?.updatedAt || "",
      idioma: cotizacion?.idioma || "es",
      info_pdf: cotizacion?.info_pdf || [],
      pdf_media: cotizacion?.pdf_media || {},
      pdf_excel_preview_categories: cotizacion?.pdf_excel_preview_categories || [],
      hotel_detalle: cotizacion?.hotel_detalle || cotizacion?.hotelDetalle || {},
      total_final: cotizacion?.total_final || cotizacion?.totalFinal || "",
    }),
  );
};

const getPdfExportCacheKey = (cotizacion, pageElements) => {
  const pages = asPdfPageArray(pageElements);
  if (!pages.length) return null;
  const pageMetrics = pages
    .map((page, index) => {
      const rect = page.getBoundingClientRect?.();
      return [
        index,
        page.className || "",
        Math.round(rect?.width || page.offsetWidth || 0),
        Math.round(rect?.height || page.offsetHeight || 0),
      ].join("~");
    })
    .join("::");

  return [
    cotizacion?.id || "cotizacion",
    getCotizacionExportFingerprint(cotizacion),
    pages.length,
    pageMetrics,
  ].join("@@");
};

const putPdfExportCache = (key, entry) => {
  PDF_EXPORT_PREFETCH_CACHE.set(key, { ...entry, createdAt: Date.now() });
  if (PDF_EXPORT_PREFETCH_CACHE.size > 3) {
    const oldestKey = [...PDF_EXPORT_PREFETCH_CACHE.entries()]
      .sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0))[0]?.[0];
    if (oldestKey && oldestKey !== key) PDF_EXPORT_PREFETCH_CACHE.delete(oldestKey);
  }
};

export const prepareCotizacionPdfExport = (cotizacion, pageElements) => {
  const pages = asPdfPageArray(pageElements);
  if (!pages.length) return null;
  const key = getPdfExportCacheKey(cotizacion, pages);
  if (!key) return null;

  const cached = PDF_EXPORT_PREFETCH_CACHE.get(key);
  if (cached?.blob || cached?.promise) return cached.promise || Promise.resolve(cached.blob);

  const promise = buildCotizacionPdfBlob(cotizacion, pages, { silent: true })
    .then((blob) => {
      putPdfExportCache(key, {
        blob,
        pageCaptures: blob.__vensoPageCaptures || [],
      });
      return blob;
    })
    .catch((error) => {
      PDF_EXPORT_PREFETCH_CACHE.delete(key);
      throw error;
    });

  putPdfExportCache(key, { promise });
  return promise;
};

export const exportCotizacionToPdf = async (cotizacion, pageElements) => {
  const pages = asPdfPageArray(pageElements);
  const key = getPdfExportCacheKey(cotizacion, pages);
  const cached = key ? PDF_EXPORT_PREFETCH_CACHE.get(key) : null;

  if (cached?.blob) {
    downloadPdfBlob(cached.blob, cotizacion);
    return;
  }

  if (cached?.promise) {
    const blob = await cached.promise;
    downloadPdfBlob(blob, cotizacion);
    return;
  }

  const blob = await buildCotizacionPdfBlob(cotizacion, pages.length ? pages : pageElements, {
    silent: false,
  });
  if (key) {
    putPdfExportCache(key, {
      blob,
      pageCaptures: blob.__vensoPageCaptures || [],
    });
  }
  downloadPdfBlob(blob, cotizacion);
};

export const exportCotizacionToWord = async (cotizacion, pageElements) => {
  const pages = asPdfPageArray(pageElements);
  const key = getPdfExportCacheKey(cotizacion, pages);
  let cached = key ? PDF_EXPORT_PREFETCH_CACHE.get(key) : null;

  if (cached?.wordBlob) {
    downloadWordBlob(cached.wordBlob, cotizacion);
    return;
  }

  if (cached?.promise) {
    const blob = await cached.promise;
    cached = key ? PDF_EXPORT_PREFETCH_CACHE.get(key) : cached;
    if (!cached?.pageCaptures?.length && blob?.__vensoPageCaptures?.length) {
      cached = { ...cached, pageCaptures: blob.__vensoPageCaptures };
    }
  }

  let pageCaptures = cached?.pageCaptures || cached?.blob?.__vensoPageCaptures || [];
  if (!pageCaptures.length) {
    const pdfBlob = await buildCotizacionPdfBlob(
      cotizacion,
      pages.length ? pages : pageElements,
      { silent: true },
    );
    pageCaptures = pdfBlob.__vensoPageCaptures || [];
    if (key) {
      putPdfExportCache(key, {
        ...(PDF_EXPORT_PREFETCH_CACHE.get(key) || {}),
        blob: pdfBlob,
        pageCaptures,
      });
    }
  }

  if (!pageCaptures.length) {
    throw new Error("No fue posible capturar las páginas para Word");
  }

  const wordBlob = buildDocxFromPageCaptures(pageCaptures, {
    title: safeText(cotizacion?.titulo || "Cotización Venso Tours"),
  });
  if (key) {
    putPdfExportCache(key, {
      ...(PDF_EXPORT_PREFETCH_CACHE.get(key) || {}),
      wordBlob,
      pageCaptures,
    });
  }
  downloadWordBlob(wordBlob, cotizacion);
};

// Cache Google Fonts as base64 data URLs for html-to-image SVG embedding
let _fontCSSPromise = null;
function getCachedFontCSS() {
  if (!_fontCSSPromise) {
    _fontCSSPromise = (async () => {
      try {
        const resp = await fetch(
          "https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&family=Montserrat:wght@400;700&display=swap",
        );
        let css = await resp.text();
        const urlMatches = [...css.matchAll(/url\(([^)]+)\)/g)];
        await Promise.all(
          urlMatches.map(async (m) => {
            try {
              const fontResp = await fetch(m[1]);
              const blob = await fontResp.blob();
              const dataUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
              });
              css = css.split(m[1]).join(dataUrl);
            } catch {
              /* skip */
            }
          }),
        );
        return css;
      } catch {
        return "";
      }
    })();
  }
  return _fontCSSPromise;
}

function getCachedFontCSSFast(timeoutMs = 350) {
  return Promise.race([
    getCachedFontCSS(),
    new Promise((resolve) => setTimeout(() => resolve(""), timeoutMs)),
  ]);
}

// Start font pre-fetch immediately on module load
getCachedFontCSS();

/* =========================
 BOTÓN / PANEL
========================= */

const calculateTotal = (cotizacion) => {
  if (!cotizacion) return 0;
  const ensureNumber = (v) =>
    v === undefined || v === null
      ? 0
      : Number.isNaN(parseFloat(v))
        ? 0
        : parseFloat(v);
  return ensureNumber(cotizacion.total_final || 0);
};

export const getPdfHotelCategoryOptions = (
  cotizacion = {},
  { roomOptionsByCategory = {}, packageType = null } = {},
) => {
  return getPdfHotelCategoryOptionsFromCotizacion(
    cotizacion,
    roomOptionsByCategory,
    packageType,
  );
};

export const getDefaultPdfExcelCategories = (
  cotizacion = {},
  options = getPdfHotelCategoryOptions(cotizacion),
) => {
  return getDefaultPdfHotelCategories(cotizacion, options);
};

export const PdfCotizacion = ({
  cotizacion,
  pageElements = null,
  autoPrepare = true,
  prepareOnIntent = true,
}) => {
  const [prepared, setPrepared] = React.useState(false);
  const [preparing, setPreparing] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [downloadingWord, setDownloadingWord] = React.useState(false);
  const preparePromiseRef = React.useRef(null);
  const intentTimerRef = React.useRef(null);

  const getRenderedPages = React.useCallback(() => {
    return asPdfPageArray(
      typeof pageElements === "function" ? pageElements() : pageElements,
    );
  }, [pageElements]);

  const startPrepare = React.useCallback((options = {}) => {
    const { logErrors = true } = options;
    if (!pageElements || !cotizacion?.info_pdf?.length) return null;
    const pages = getRenderedPages();
    if (!pages.length) return null;
    if (preparePromiseRef.current) return preparePromiseRef.current;

    setPreparing(true);
    const promise = prepareCotizacionPdfExport(cotizacion, pages)
      .then((blob) => {
        setPrepared(true);
        return blob;
      })
      .catch((error) => {
        preparePromiseRef.current = null;
        setPrepared(false);
        if (logErrors) {
          console.warn("No fue posible preparar PDF en segundo plano.", error);
        }
        throw error;
      })
      .finally(() => {
        setPreparing(false);
      });

    preparePromiseRef.current = promise;
    return promise;
  }, [cotizacion, getRenderedPages, pageElements]);

  React.useEffect(() => {
    setPrepared(false);
    setPreparing(false);
    preparePromiseRef.current = null;
    if (intentTimerRef.current != null) {
      clearTimeout(intentTimerRef.current);
      intentTimerRef.current = null;
    }

    if (!autoPrepare || !pageElements || !cotizacion?.info_pdf?.length) {
      return undefined;
    }

    let active = true;
    let timeoutId = null;
    let idleId = null;
    const requestIdle = window.requestIdleCallback || ((callback) => setTimeout(callback, 1));
    const cancelIdle = window.cancelIdleCallback || clearTimeout;

    // Preparar pronto, pero cediendo el primer render visible al navegador.
    timeoutId = setTimeout(() => {
      idleId = requestIdle(() => {
        if (!active) return;
        startPrepare({ logErrors: false })?.catch((error) => {
          if (active) {
            console.warn("No fue posible preparar PDF en segundo plano.", error);
          }
        });
      }, { timeout: 1800 });
    }, 900);

    return () => {
      active = false;
      if (timeoutId != null) clearTimeout(timeoutId);
      if (idleId != null) cancelIdle(idleId);
    };
  }, [autoPrepare, cotizacion, pageElements, startPrepare]);

  const handlePrepareIntent = React.useCallback(() => {
    if (!prepareOnIntent || autoPrepare || prepared || preparing || downloading || downloadingWord) return;
    if (intentTimerRef.current != null) return;
    intentTimerRef.current = setTimeout(() => {
      intentTimerRef.current = null;
      startPrepare({ logErrors: false })?.catch(() => {
        // La descarga explícita volverá a intentar y mostrará el error si corresponde.
      });
    }, 180);
  }, [autoPrepare, downloading, downloadingWord, prepared, prepareOnIntent, preparing, startPrepare]);

  React.useEffect(() => () => {
    if (intentTimerRef.current != null) clearTimeout(intentTimerRef.current);
  }, []);

  const handleGeneratePdf = async () => {
    if (downloading || downloadingWord) return;
    try {
      setDownloading(true);
      const renderedPages = getRenderedPages();
      await exportCotizacionToPdf(cotizacion, renderedPages);
      setPrepared(true);
    } catch (error) {
      console.error("Error al generar el PDF:", error);
      alert("Hubo un error al generar el PDF.");
    } finally {
      setDownloading(false);
    }
  };

  const handleGenerateWord = async () => {
    if (downloading || downloadingWord) return;
    try {
      setDownloadingWord(true);
      const renderedPages = getRenderedPages();
      await exportCotizacionToWord(cotizacion, renderedPages);
      setPrepared(true);
    } catch (error) {
      console.error("Error al generar el Word:", error);
      alert("Hubo un error al generar el documento Word.");
    } finally {
      setDownloadingWord(false);
    }
  };


  const diasArr = cotizacion?.dias || cotizacion?.itinerario || [];
  const totalDias = diasArr.length;
  const totalServicios = diasArr.reduce(
    (acc, dia) => acc + (dia.servicios?.length || 0),
    0,
  );
  const totalCosto = calculateTotal(cotizacion);

  return (
    <div className="pdf-cotizacion-container">
      <div className="pdf-info">
        <div className="pdf-stats">
          <div className="stat-item">
            <span className="stat-icon">D</span>
            <span className="stat-value">{totalDias}</span>
            <span>{totalDias === 1 ? "día" : "días"}</span>
          </div>
          <div className="stat-item">
            <span className="stat-icon">S</span>
            <span className="stat-value">{totalServicios}</span>
            <span>servicios</span>
          </div>
          <div className="stat-item">
            <span className="stat-icon">$</span>
            <span className="stat-value">{Number(totalCosto).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="pdf-actions-wrapper">
        <button
          className="pdf-cotizacion-button"
          onClick={handleGeneratePdf}
          onMouseEnter={handlePrepareIntent}
          onFocus={handlePrepareIntent}
          onTouchStart={handlePrepareIntent}
          disabled={downloading || downloadingWord}
        >
          <span className="pdf-icon">PDF</span>
          {downloading
            ? "Generando PDF Canva..."
            : prepared
              ? "Descargar PDF Canva"
              : preparing && autoPrepare
                ? "Preparando PDF Canva..."
                : "Descargar PDF Canva"}
        </button>
        <button
          className="pdf-cotizacion-button pdf-cotizacion-button--word"
          onClick={handleGenerateWord}
          onMouseEnter={handlePrepareIntent}
          onFocus={handlePrepareIntent}
          onTouchStart={handlePrepareIntent}
          disabled={downloading || downloadingWord}
          title="Descargar el mismo diseño como documento Word"
        >
          <span className="pdf-icon">W</span>
          {downloadingWord ? "Generando Word..." : "Descargar Word"}
        </button>
      </div>
    </div>
  );
};
