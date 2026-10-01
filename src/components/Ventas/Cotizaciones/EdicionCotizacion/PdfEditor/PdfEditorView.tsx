import { useEffect, useLayoutEffect, useState, useRef, memo } from "react";
import { useMemo } from "react";
import LanguageFlag from "../../../../common/LanguageFlag/LanguageFlag";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { flushSync } from "react-dom";
import {
  MdSave,
  MdArrowBack,
  MdImage,
  MdDelete,
  MdAdd,
  MdClose,
  MdCloudUpload,
  MdTranslate,
  MdPhotoLibrary,
  MdStar,
  MdSearch,
  MdOutlineImageNotSupported,
  MdOpenInNew,
} from "react-icons/md";
import "./PdfEditorView.scss";
import {
  PdfCotizacion,
  PdfPages,
  PDF_COVER_TITLE_FIELD,
  getLabels,
  getDefaultPdfExcelCategories,
  getPdfHotelCategoryOptions,
  prewarmCotizacionPdfExportAssets,
  resolveInfoPdfCoverTitle,
} from "../PdfCotizacion/PdfCotizacion";
import { LazyPdfImage } from "../PdfCotizacion/PdfCotizacion";
import { PricingPage, TermsAndConditionsPage } from "../PdfCotizacion/TycPages";
import { createApiInstance, getApiUrl } from "../../../../../utils/apiUtils";
import SecureStorage from "../../../../../utils/secureStorage";
import { hasRoutePermission } from "../../../../../utils/permissionRoutes";
import { useFileUpload } from "../../../../../hooks/useFileUpload";
import { getProxyUrl } from "../../../../../services/presignedUrlService";
import { queryClient, queryKeys } from "../../../../../config/queryClient";
import {
  extractEditableBlocksFromHtml,
  normalizeMojibakeValue,
  normalizeHotelDetallePayload,
  normalizeHotelDetalleTranslations,
  repairMojibakeText,
  selectHotelDetalleLanguage,
  upsertHotelDetalleLanguage,
} from "../utils/hotelDetallePayload";
import {
  buildAutoPdfMedia,
  buildImagenesEditorFromMedia,
  chooseReplacementImageForDay,
  fetchReferenceImageManifest,
  getOverviewImageFromPdfMedia,
  imageSearchText,
  normalizePdfMediaDaysForInfoPdf,
  normalizePdfImageText,
  scoreReferenceImage,
} from "../utils/pdfReferenceImageMatcher";
import axios from "../../../../../utils/axiosInstance";
import useHotelQuoteDictionary, {
  resolveQuotationTariffType,
} from "../utils/useHotelQuoteDictionary";
import buildRoomOptionsByCategory from "../utils/buildRoomOptionsByCategory";
import { formatPdfHotelCategoryChip } from "../utils/pdfHotelPreviewData";
import { hydrateCotizacionPricingContext } from "../../../../../pages/Ventas/Cotizaciones/utils/cotizacionPricingContext";
import {
  getVensoCanvaPageCount,
  resolveVensoCanvaCoverImages,
  setVensoCanvaCoverImage,
} from "../utils/vensoPdfCanvaDesign";
import {
  formatPdfCanvaDuration,
  getPdfCanvaCopy,
} from "../utils/pdfCanvaCopy";

const logoBlanco = "/brand/logo-principal-blanco.webp";
const TRANSPARENT_PDF_PIXEL_PREFIX = "data:image/gif;base64,R0lGODlhAQABAIA";

const forceHydratePdfExportPreviewImages = (root) => {
  if (!root?.querySelectorAll) return;

  root.querySelectorAll("img").forEach((img) => {
    const fullSrc =
      img.getAttribute("data-pdf-full-src") ||
      img.getAttribute("data-src") ||
      img.currentSrc ||
      img.getAttribute("src") ||
      "";

    if (!fullSrc || fullSrc.startsWith(TRANSPARENT_PDF_PIXEL_PREFIX)) return;

    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.setAttribute("data-pdf-full-src", fullSrc);
    img.setAttribute("loading", "eager");
    img.setAttribute("decoding", "sync");
    img.setAttribute("fetchpriority", "high");
    img.setAttribute("crossorigin", "anonymous");
    img.style.visibility = "visible";
    img.style.opacity = "1";
    img.style.display = "block";

    if (img.getAttribute("src") !== fullSrc) {
      img.setAttribute("src", fullSrc);
    }
  });
};


const DATA_KEY = "cotizacion_pdf_editor";

const areSameCategoryKeys = (left = [], right = []) =>
  left.length === right.length &&
  left.every((value, index) => String(value) === String(right[index]));

const IDIOMAS = [
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
  { code: "pt", label: "Português" },
];

const LAYOUTS = [
  { value: "1", tip: "1 imagen" },
  { value: "2", tip: "2 imágenes" },
  { value: "3-top", tip: "1 arriba + 2 abajo" },
  { value: "3-bottom", tip: "2 arriba + 1 abajo" },
];

const maxSlotsFor = (l) => (l === "1" ? 1 : l === "2" ? 2 : 3);

const isPdfMediaComplete = (media, daysInfo) => {
  if (resolveVensoCanvaCoverImages(media, daysInfo).filter(Boolean).length < 3) return false;
  const days = media?.days || {};
  return daysInfo.every((_, index) => {
    const dayData = days[index] || days[String(index)];
    if (!dayData) return false;
    const images = Array.isArray(dayData.images) ? dayData.images : [];
    return Boolean(images[0]);
  });
};

/** Textarea cuya altura se auto-ajusta al contenido (una o varias líneas). */
const AutoResizeTextarea = memo(({ value, onChange, placeholder, className, rows = 1 }) => {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={className}
      value={value || ""}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
    />
  );
});
AutoResizeTextarea.displayName = "AutoResizeTextarea";

/** Degradados entre imágenes: devuelve las direcciones de fade según layout y posición */
const getImageFades = (layout, index, total) => {
  const fades = [];
  if (total <= 1) return fades;
  if (layout === "2") {
    if (index === 0) fades.push("bottom");
    if (index === 1) fades.push("top");
  }
  if (layout === "3-top") {
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
  if (layout === "4") {
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

const safeText = (s = "") =>
  repairMojibakeText(String(s))
    .replace(/[\u2012\u2013\u2014\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const limpiarLista = (arr) =>
  Array.isArray(arr)
    ? arr.filter(
        (v) =>
          v != null &&
          String(v).trim() !== "" &&
          String(v).toLowerCase() !== "null",
      )
    : [];

/* ==================== TRANSLATION HELPERS ==================== */

const LANG_PAIRS = { en: "es|en", pt: "es|pt" };

/** Traduce un texto usando MyMemory API (gratis, sin clave). */
const translateText = async (text, targetLang) => {
  if (!text || !text.trim()) return text;
  const pair = LANG_PAIRS[targetLang];
  if (!pair) return text;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${pair}`;
  const res = await fetch(url);
  const data = await res.json();
  return data?.responseData?.translatedText || text;
};

/** Traduce un array de strings. */
const translateArray = async (arr, targetLang) => {
  if (!Array.isArray(arr) || arr.length === 0) return arr;
  // Unir con separador especial para minimizar requests
  const joined = arr.join(" ||| ");
  const translated = await translateText(joined, targetLang);
  return translated.split(" ||| ").map((s) => s.trim());
};

/** Traduce todos los campos de texto de un día de cotización. */
const translateDay = async (day, targetLang) => {
  const [
    titulo,
    descripcion,
    recomendaciones,
    incluye,
    no_incluye,
    tipo_servicio,
    servicios_resumen,
  ] = await Promise.all([
    translateText(day.titulo || "", targetLang),
    translateText(day.descripcion || "", targetLang),
    translateArray(day.recomendaciones, targetLang),
    translateArray(day.incluye, targetLang),
    translateArray(day.no_incluye, targetLang),
    translateArray(day.tipo_servicio, targetLang),
    translateServiciosResumen(day.servicios_resumen, targetLang),
  ]);
  return {
    ...day,
    titulo,
    descripcion,
    recomendaciones,
    incluye,
    no_incluye,
    tipo_servicio,
    servicios_resumen,
  };
};

/** Traduce servicios_resumen (array de {tipo, nombre, detalle}). */
const translateServiciosResumen = async (arr, targetLang) => {
  if (!Array.isArray(arr) || arr.length === 0) return arr;
  return Promise.all(
    arr.map(async (s) => {
      const [nombre, detalle] = await Promise.all([
        translateText(s.nombre || "", targetLang),
        translateText(s.detalle || "", targetLang),
      ]);
      return { ...s, nombre, detalle }; // mantiene `tipo` sin traducir
    }),
  );
};

/** Traduce toda la info_pdf (array de días). */
const translateInfoPdf = async (days, targetLang) => {
  if (!Array.isArray(days)) return days;
  return Promise.all(days.map((d) => translateDay(d, targetLang)));
};

const translateHotelDetalle = async (detalle, targetLang) => {
  const normalized = normalizeHotelDetallePayload(detalle);
  if (!normalized) return normalized;

  const [title, subtitle, nota] = await Promise.all([
    translateText(normalized.main?.title || "", targetLang),
    translateText(normalized.main?.subtitle || "", targetLang),
    translateText(normalized.nota || "", targetLang),
  ]);

  const rows = await Promise.all(
    (normalized.main?.rows || []).map(async (row) => {
      const cells = await translateArray(row.cells || [], targetLang);
      const columnsEntries = await Promise.all(
        Object.entries(row.columns || {}).map(async ([key, value]) => [
          key,
          await translateText(value || "", targetLang),
        ]),
      );
      return {
        ...row,
        cells,
        columns: Object.fromEntries(columnsEntries),
      };
    }),
  );

  const priceLabelEntries = await Promise.all(
    Object.entries(normalized.priceLabelTexts || {}).map(
      async ([key, value]) => [
        key,
        await translateText(value || "", targetLang),
      ],
    ),
  );

  return {
    ...normalized,
    main: {
      ...normalized.main,
      title,
      subtitle,
      rows,
    },
    nota,
    priceLabelTexts: Object.fromEntries(priceLabelEntries),
  };
};

/* ===================================================================
 MAIN COMPONENT
 =================================================================== */

export default function PdfEditorView() {
  const { auth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const canvasRef = useRef(null);
  const previewExportRef = useRef(null);
  const pageRefs = useRef({});

  const [cotizacion, setCotizacion] = useState(null);
  const [infoPdf, setInfoPdf] = useState([]);
  const [coverTitle, setCoverTitle] = useState("");
  const [pdfMedia, setPdfMedia] = useState({ cover: null, days: {} });
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [mediaUploadError, setMediaUploadError] = useState("");
  const [idioma, setIdioma] = useState("es");
  const [translating, setTranslating] = useState(false);
  const [infoPdfOriginal, setInfoPdfOriginal] = useState(null);
  const [uploadingSlot, setUploadingSlot] = useState(null); // "cover" | "day-{i}-{s}"
  const [hotelDetalle, setHotelDetalle] = useState(null);
  const [hotelDetalleByIdioma, setHotelDetalleByIdioma] = useState({
    es: null,
  });
  const [dragOverSlot, setDragOverSlot] = useState(null); // Track which slot is being dragged over
  const [referenceLibrary, setReferenceLibrary] = useState({
    images: [],
    categories: [],
  });
  const [referencePicker, setReferencePicker] = useState(null);
  const [excelPreviewCategories, setExcelPreviewCategories] = useState([]);
  const canManageReferenceLibrary = useMemo(
    () => hasRoutePermission(auth, "/almacen/inventario"),
    [auth],
  );
  const dragCounterRef = useRef(0);
  const failedPdfImageKeysRef = useRef(new Set());

  const { uploadFile, deleteFile, isUploading } = useFileUpload();

  /** Carpeta en Tigris para las imágenes del PDF de esta cotización */
  const tigrisFolder = cotizacion?.id
    ? `pdf_media/${cotizacion.id}`
    : "pdf_media/tmp";

  /** Devuelve la URL para mostrar una imagen (proxy si es Tigris, directa si es asset local) */
  const displayUrl = (value) => {
    const url =
      typeof value === "object" && value
        ? value.originalSrc ||
          value.original_src ||
          value.src ||
          value.tigrisUrl ||
          value.tigris_url ||
          value.previewSrc ||
          value.preview_src ||
          value.proxyUrl ||
          value.proxy_url ||
          value.url
        : value;
    if (!url || typeof url !== "string") return null;
    if (url.includes("/upload/tigris/proxy")) return url;
    if (url.includes("fly.storage.tigris.dev")) return getProxyUrl(url);
    if (url.startsWith("/pdf-reference-images/") || url.startsWith("pdf-reference-images/")) {
      return `${getApiUrl()}/upload/tigris/proxy?url=${encodeURIComponent(url.replace(/^\//, ""))}`;
    }
    return url;
  };

  const isReferenceImageUrl = (value = "") => {
    if (typeof value !== "string") return false;
    const decoded = (() => {
      if (!value.includes("/upload/tigris/proxy")) return value;
      try {
        return new URL(value, window.location.origin).searchParams.get("url") || value;
      } catch {
        return value;
      }
    })();
    return /(?:^|\/)pdf-reference-images\//i.test(decoded);
  };

  const isCotizacionPdfUploadUrl = (value = "") => {
    if (typeof value !== "string") return false;
    if (isReferenceImageUrl(value)) return false;
    return /(?:^|\/)pdf_media\//i.test(value);
  };

  const getReferenceSelectionSrc = (image) => {
    if (!image) return null;
    if (typeof image === "string") return image;
    if (typeof image !== "object") return null;

    // Guardamos exactamente la URL visible de la tarjeta seleccionada.
    // Así evitamos que el preview muestre una imagen, pero el slot persista otra.
    return (
      image.previewSrc ||
      image.preview_src ||
      image.proxyUrl ||
      image.proxy_url ||
      image.src ||
      image.originalSrc ||
      image.original_src ||
      image.tigrisUrl ||
      image.tigris_url ||
      image.url ||
      null
    );
  };

  const getDayMediaForSlot = (media, dayIndex) => {
    const days = media?.days && typeof media.days === "object" ? media.days : {};
    return days[dayIndex] || days[String(dayIndex)] || { layout: "1", images: [] };
  };

  const replaceDayImageAtSlot = (media, dayIndex, slot, nextImage, meta = {}) => {
    const days = media?.days && typeof media.days === "object" ? media.days : {};
    const dayData = getDayMediaForSlot(media, dayIndex);
    const currentImages = Array.isArray(dayData.images) ? dayData.images : [];
    const minLength = Math.max(maxSlotsFor(dayData.layout || "1"), slot + 1);
    const images = Array.from({ length: minLength }, (_, index) =>
      currentImages[index] || null,
    );

    images[slot] = nextImage || null;

    return {
      ...media,
      days: {
        ...days,
        [dayIndex]: {
          ...dayData,
          images,
          autoAssigned: false,
          autoSource: "manual",
          ...meta,
        },
      },
    };
  };

  const clampCoverPositionY = (value, fallback = 50) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Math.min(100, numeric));
  };

  const coverPositionY = clampCoverPositionY(
    pdfMedia?.coverPositionY ??
      pdfMedia?.cover_position_y ??
      pdfMedia?.coverObjectPositionY ??
      50,
  );

  const setCoverPositionY = (value) => {
    const nextValue = clampCoverPositionY(value);
    setPdfMedia((current) => ({
      ...current,
      coverPositionY: nextValue,
    }));
  };

  /* ==================== LOAD ==================== */

  useEffect(() => {
    let active = true;
    const c = JSON.parse(localStorage.getItem(DATA_KEY) || "null");
    if (!c) return undefined;
    setCotizacion(c);
    const pdf = Array.isArray(c.info_pdf)
      ? normalizeMojibakeValue(JSON.parse(JSON.stringify(c.info_pdf)))
      : [];
    setInfoPdf(pdf);
    setCoverTitle(
      resolveInfoPdfCoverTitle(pdf, c.titulo || "Cotización sin título"),
    );
    setInfoPdfOriginal(JSON.parse(JSON.stringify(pdf)));
    const initialIdioma = c.idioma || "es";
    setIdioma(initialIdioma);
    const m =
      c.pdf_media &&
      typeof c.pdf_media === "object" &&
      Object.keys(c.pdf_media).length > 0
        ? JSON.parse(JSON.stringify(c.pdf_media))
        : { cover: null, days: {} };
    setPdfMedia({
      ...m,
      coverPositionY: clampCoverPositionY(
        m.coverPositionY ?? m.cover_position_y ?? m.coverObjectPositionY ?? 50,
      ),
    });
    const detalleTranslations = normalizeHotelDetalleTranslations(
      c.hotel_detalle || c.hotelDetalle || null,
    );
    setHotelDetalleByIdioma(detalleTranslations);
    setHotelDetalle(selectHotelDetalleLanguage(detalleTranslations, initialIdioma));

    const hasCompletePricingContext =
      Array.isArray(c.perRoomPricing || c.per_room_pricing) &&
      (c.perRoomPricing || c.per_room_pricing).length > 0 &&
      Boolean(c.selectedHotel || c.selected_hotel) &&
      Boolean(c.peopleDetails || c.people_details);

    if (!hasCompletePricingContext) {
      hydrateCotizacionPricingContext(c, { skipCache: true })
        .then((hydrated) => {
          if (!active || !hydrated) return;
          setCotizacion((current) => ({
            ...hydrated,
            // La edición del documento conserva su contenido local; únicamente
            // se reemplaza el contexto financiero/hotelero faltante.
            info_pdf: current?.info_pdf || hydrated.info_pdf,
            pdf_media: current?.pdf_media || hydrated.pdf_media,
            idioma: current?.idioma || hydrated.idioma,
          }));
        })
        .catch((error) => {
          console.warn(
            "No se pudo hidratar el contexto de precios del editor PDF:",
            error,
          );
        });
    }

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    failedPdfImageKeysRef.current = new Set();
  }, [cotizacion?.id, infoPdf.length]);

  useEffect(() => {
    if (!infoPdf.length) return;
    if (isPdfMediaComplete(pdfMedia, infoPdf)) return;

    let active = true;
    fetchReferenceImageManifest()
      .then((library) => {
        if (!active) return;
        const images = library?.images || [];
        setReferenceLibrary({ images, categories: library?.categories || [] });
        setPdfMedia((current) => {
          if (isPdfMediaComplete(current, infoPdf)) return current;
          const next = buildAutoPdfMedia({
            pdfMedia: current,
            cotizacion: {
              id: cotizacion?.id,
              titulo: cotizacion?.titulo,
            },
            infoPdf,
            referenceImages: images,
          });
          return JSON.stringify(next) === JSON.stringify(current) ? current : next;
        });
      })
      .catch(() => {
        if (active) setReferenceLibrary({ images: [], categories: [] });
      });
    return () => {
      active = false;
    };
  }, [cotizacion?.id, cotizacion?.titulo, infoPdf]);

  /* ==================== TRANSLATION ==================== */

  const handleIdiomaChange = async (newIdioma) => {
    if (newIdioma === idioma) return;

    let nextHotelDetalleByIdioma = upsertHotelDetalleLanguage(
      hotelDetalleByIdioma,
      idioma,
      hotelDetalle,
    );
    setHotelDetalleByIdioma(nextHotelDetalleByIdioma);

    // Si volvemos a español, restaurar original
    if (newIdioma === "es") {
      if (infoPdfOriginal) {
        const restored = JSON.parse(JSON.stringify(infoPdfOriginal));
        setInfoPdf(restored);
        setCoverTitle(
          resolveInfoPdfCoverTitle(
            restored,
            cotizacion?.titulo || "Cotización sin título",
          ),
        );
      }
      setHotelDetalle(
        selectHotelDetalleLanguage(nextHotelDetalleByIdioma, "es"),
      );
      setIdioma("es");
      return;
    }

    // Si cambiamos de idioma y estamos en español, guardar original actual
    if (idioma === "es") {
      setInfoPdfOriginal(JSON.parse(JSON.stringify(buildInfoPdfForSave())));
    }

    setTranslating(true);
    try {
      const source = idioma === "es" ? infoPdf : infoPdfOriginal;
      const translated = await translateInfoPdf(source, newIdioma);
      const existingDetalle = nextHotelDetalleByIdioma[newIdioma] || null;
      const translatedDetalle =
        existingDetalle ||
        (await translateHotelDetalle(
          selectHotelDetalleLanguage(nextHotelDetalleByIdioma, "es") ||
            hotelDetalle,
          newIdioma,
        ));
      nextHotelDetalleByIdioma = upsertHotelDetalleLanguage(
        nextHotelDetalleByIdioma,
        newIdioma,
        translatedDetalle,
      );
      setInfoPdf(translated);
      setCoverTitle(
        resolveInfoPdfCoverTitle(
          translated,
          cotizacion?.titulo || "Cotización sin título",
        ),
      );
      setHotelDetalleByIdioma(nextHotelDetalleByIdioma);
      setHotelDetalle(translatedDetalle);
      setIdioma(newIdioma);
    } catch (err) {
      console.error("Error traduciendo:", err);
    } finally {
      setTranslating(false);
    }
  };

  /* ==================== HELPERS ==================== */

  /** Intenta eliminar un archivo de Tigris (silencia errores) */
  const tryDeleteFromTigris = async (url) => {
    if (!url || typeof url !== "string") return;
    if (!url.includes("fly.storage.tigris.dev")) return;
    if (!isCotizacionPdfUploadUrl(url)) return;
    try {
      await deleteFile(url);
    } catch {
      /* no-op */
    }
  };

  const openReferencePicker = (target) => {
    setReferencePicker(target);
  };

  const applyReferenceImage = (image) => {
    const selectedSrc = getReferenceSelectionSrc(image);
    if (!referencePicker || !selectedSrc) return;

    if (referencePicker.type === "cover") {
      const slot = Number(referencePicker.slot) || 0;
      const oldUrl = resolveVensoCanvaCoverImages(pdfMedia, infoPdf)[slot];
      setPdfMedia((current) =>
        setVensoCanvaCoverImage(current, slot, selectedSrc),
      );
      tryDeleteFromTigris(oldUrl);
      setReferencePicker(null);
      return;
    }

    if (referencePicker.type === "overview") {
      const oldUrl = pdfMedia.overviewImage;
      setPdfMedia((p) => ({ ...p, overviewImage: selectedSrc }));
      tryDeleteFromTigris(oldUrl);
      setReferencePicker(null);
      return;
    }

    const { dayIndex, slot } = referencePicker;
    const dd = getDayMediaForSlot(pdfMedia, dayIndex);
    const oldUrl = dd.images?.[slot];
    setPdfMedia((p) => replaceDayImageAtSlot(p, dayIndex, slot, selectedSrc));
    tryDeleteFromTigris(oldUrl);
    setReferencePicker(null);
  };

  const referencePickerSeed = useMemo(() => {
    if (!referencePicker || referencePicker.type === "cover") {
      return normalizePdfImageText(cotizacion?.titulo || "");
    }
    if (referencePicker.type === "overview") {
      return normalizePdfImageText(
        infoPdf.map((d) => [d?.titulo, d?.descripcion].filter(Boolean).join(" ")).join(" "),
      );
    }
    return normalizePdfImageText(
      [
        infoPdf?.[referencePicker.dayIndex]?.titulo,
        infoPdf?.[referencePicker.dayIndex]?.descripcion,
        ...(Array.isArray(infoPdf?.[referencePicker.dayIndex]?.tipo_servicio)
          ? infoPdf?.[referencePicker.dayIndex]?.tipo_servicio
          : []),
      ]
        .filter(Boolean)
        .join(" "),
    );
  }, [cotizacion?.titulo, infoPdf, referencePicker]);

  const handleRenderedDayImageBad = (dayIndex, slot, brokenValue) => {
    if (!referenceLibrary.images.length) return;

    const failedKey = `${dayIndex}:${slot}:${displayUrl(brokenValue) || brokenValue || ""}`;
    if (failedPdfImageKeysRef.current.has(failedKey)) return;
    failedPdfImageKeysRef.current.add(failedKey);

    setPdfMedia((current) => {
      const sourceDays = current?.days || {};
      const dayData = sourceDays[dayIndex] || sourceDays[String(dayIndex)] || { layout: "1", images: [] };
      const currentValue = dayData.images?.[slot] || null;
      if ((brokenValue || null) !== (currentValue || null)) return current;
      if (dayData.autoSource === "manual" || dayData.autoAssigned === false) {
        return current;
      }

      const replacement = chooseReplacementImageForDay({
        images: referenceLibrary.images,
        day: infoPdf?.[dayIndex],
        dayIndex,
        cotizacion,
        avoid: [
          ...(dayData.images || []),
          brokenValue,
          ...Array.from(failedPdfImageKeysRef.current),
        ],
      });

      if (!replacement) return current;

      const nextImages = [...(dayData.images || [])];
      nextImages[slot] = replacement;
      return {
        ...current,
        days: {
          ...sourceDays,
          [dayIndex]: {
            ...dayData,
            images: nextImages,
            autoAssigned: true,
            autoSource: "repair",
          },
        },
      };
    });
  };

  const packageType =
    cotizacion?.selectedHotel?.packageType ||
    cotizacion?.selected_hotel?.packageType ||
    cotizacion?.hotel?.packageType ||
    cotizacion?.packagetype ||
    cotizacion?.packageType ||
    "compartido";
  const { byCategory: hotelDict } = useHotelQuoteDictionary({
    axios,
    tariffType: resolveQuotationTariffType(cotizacion),
    agencyId: Number(cotizacion?.agency_id || 1),
  });
  const roomOptionsByCategory = useMemo(
    () =>
      buildRoomOptionsByCategory(
        hotelDict,
        resolveQuotationTariffType(cotizacion),
        packageType,
      ),
    [hotelDict, packageType],
  );
  const hotelCategoryOptions = useMemo(
    () =>
      getPdfHotelCategoryOptions(cotizacion, {
        roomOptionsByCategory,
        packageType,
      }),
    [cotizacion, packageType, roomOptionsByCategory],
  );

  useEffect(() => {
    if (!hotelCategoryOptions.length) {
      setExcelPreviewCategories((current) => (current.length ? [] : current));
      return;
    }

    setExcelPreviewCategories((current) => {
      const allowed = new Set(
        hotelCategoryOptions.map((option) => String(option.category)),
      );
      const filtered = current.filter((category) => allowed.has(category));
      const allCategoriesSelected =
        hotelCategoryOptions.length > 1 &&
        filtered.length >= hotelCategoryOptions.length;
      if (filtered.length > 0 && !allCategoriesSelected) {
        return areSameCategoryKeys(current, filtered) ? current : filtered;
      }

      const defaults = getDefaultPdfExcelCategories(
        cotizacion,
        hotelCategoryOptions,
      );
      return areSameCategoryKeys(current, defaults) ? current : defaults;
    });
  }, [cotizacion, hotelCategoryOptions]);

  const toggleExcelPreviewCategory = (category) => {
    const key = String(category);
    setExcelPreviewCategories((current) => {
      if (current.includes(key)) {
        return current.length > 1
          ? current.filter((item) => item !== key)
          : current;
      }
      return [...current, key];
    });
  };

  /* ==================== SLOT DRAG & DROP ==================== */

  const makeSlotDragHandlers = (slotKey, onFile) => ({
    onDragEnter: (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current += 1;
      if (e.dataTransfer.types.includes("Files")) setDragOverSlot(slotKey);
    },
    onDragOver: (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onDragLeave: (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setDragOverSlot(null);
      }
    },
    onDrop: (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setDragOverSlot(null);
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith("image/")) onFile(file);
    },
  });

  /* ==================== COVER IMAGE ==================== */

  const handleCoverImage = async (slot, file) => {
    const slotKey = `cover-${slot}`;
    setUploadingSlot(slotKey);
    try {
      const oldUrl = resolveVensoCanvaCoverImages(pdfMedia, infoPdf)[slot];
      const result = await uploadFile(file, tigrisFolder);
      setMediaUploadError("");
      setPdfMedia((current) =>
        setVensoCanvaCoverImage(current, slot, result.tigrisUrl),
      );
      tryDeleteFromTigris(oldUrl);
    } catch (err) {
      console.error("Error subiendo imagen de portada:", err);
      setMediaUploadError(
        err?.message ||
          "No se pudo subir la imagen de portada. Revisa el almacenamiento e inténtalo otra vez.",
      );
    } finally {
      setUploadingSlot(null);
    }
  };

  const removeCoverImage = (slot) => {
    const oldUrl = resolveVensoCanvaCoverImages(pdfMedia, infoPdf)[slot];
    setPdfMedia((current) => setVensoCanvaCoverImage(current, slot, null));
    tryDeleteFromTigris(oldUrl);
  };

  /* ==================== OVERVIEW IMAGE ==================== */

  const handleOverviewImage = async (file) => {
    const slotKey = "overview";
    setUploadingSlot(slotKey);
    try {
      const oldUrl = pdfMedia.overviewImage;
      const result = await uploadFile(file, tigrisFolder);
      setMediaUploadError("");
      setPdfMedia((p) => ({ ...p, overviewImage: result.tigrisUrl }));
      tryDeleteFromTigris(oldUrl);
    } catch (err) {
      console.error("Error subiendo imagen de overview:", err);
      setMediaUploadError(
        err?.message ||
          "No se pudo subir la imagen. Revisa el almacenamiento e inténtalo otra vez.",
      );
    } finally {
      setUploadingSlot(null);
    }
  };

  const removeOverviewImage = () => {
    const oldUrl = pdfMedia.overviewImage;
    setPdfMedia((p) => ({ ...p, overviewImage: null }));
    tryDeleteFromTigris(oldUrl);
  };

  /* ==================== DAY IMAGES ==================== */

  const handleDayImage = async (di, slot, file) => {
    const slotKey = `day-${di}-${slot}`;
    setUploadingSlot(slotKey);
    try {
      const dd = getDayMediaForSlot(pdfMedia, di);
      const oldUrl = dd.images?.[slot];
      const result = await uploadFile(file, tigrisFolder);
      setMediaUploadError("");
      setPdfMedia((p) => replaceDayImageAtSlot(p, di, slot, result.tigrisUrl));
      tryDeleteFromTigris(oldUrl);
    } catch (err) {
      console.error("Error subiendo imagen:", err);
      setMediaUploadError(
        err?.message ||
          "No se pudo subir la imagen. Revisa el almacenamiento e inténtalo otra vez.",
      );
    } finally {
      setUploadingSlot(null);
    }
  };

  const removeDayImage = (di, slot) => {
    const dd = getDayMediaForSlot(pdfMedia, di);
    const oldUrl = dd.images?.[slot];
    setPdfMedia((p) => replaceDayImageAtSlot(p, di, slot, null));
    tryDeleteFromTigris(oldUrl);
  };

  const setDayLayout = (di, layout) => {
    setPdfMedia((p) => {
      const dd = getDayMediaForSlot(p, di);
      const slotCount = maxSlotsFor(layout);
      const currentImages = Array.isArray(dd.images) ? dd.images : [];
      const imgs = Array.from({ length: slotCount }, (_, index) =>
        currentImages[index] || null,
      );
      return {
        ...p,
        days: {
          ...p.days,
          [di]: {
            ...dd,
            layout,
            images: imgs,
            autoAssigned: false,
            autoSource: "manual",
          },
        },
      };
    });
  };

  /* ==================== TEXT EDITING ==================== */

  const updateField = (di, field, value) =>
    setInfoPdf((p) => {
      const u = [...p];
      u[di] = { ...u[di], [field]: value };
      return u;
    });

  const updateListItem = (di, field, idx, value) =>
    setInfoPdf((p) => {
      const u = [...p];
      const l = [...(u[di][field] || [])];
      l[idx] = value;
      u[di] = { ...u[di], [field]: l };
      return u;
    });

  const addListItem = (di, field) =>
    setInfoPdf((p) => {
      const u = [...p];
      u[di] = { ...u[di], [field]: [...(u[di][field] || []), ""] };
      return u;
    });

  const removeListItem = (di, field, idx) =>
    setInfoPdf((p) => {
      const u = [...p];
      const l = [...(u[di][field] || [])];
      l.splice(idx, 1);
      u[di] = { ...u[di], [field]: l };
      return u;
    });

  const buildInfoPdfForSave = () => {
    const normalized = Array.isArray(infoPdf)
      ? normalizeMojibakeValue(JSON.parse(JSON.stringify(infoPdf)))
      : [];
    if (!normalized.length) return normalized;
    normalized[0] = {
      ...normalized[0],
      [PDF_COVER_TITLE_FIELD]: coverTitle,
    };
    return normalized;
  };

  /* ==================== NAV ==================== */

  const scrollToPage = (key) => {
    const fallbackSelectors = {
      pricing: ".pricing-page",
      reservation: ".tyc-reservation-page",
      purchase: ".tyc-purchase-page",
    };
    const el =
      pageRefs.current[key] ||
      (fallbackSelectors[key]
        ? canvasRef.current?.querySelector(fallbackSelectors[key])
        : null);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* ==================== SAVE ==================== */

  const handleSave = async () => {
    if (!cotizacion?.id) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      const api = createApiInstance(true);
      const user = SecureStorage.getItem("user") || {};
      const normalizedHotelDetalleByIdioma = upsertHotelDetalleLanguage(
        hotelDetalleByIdioma,
        idioma,
        hotelDetalle,
      );
      const normalizedHotelDetalle = normalizeMojibakeValue(
        normalizedHotelDetalleByIdioma,
      );
      const infoPdfWithCoverTitle = buildInfoPdfForSave();
      const normalizedPdfMedia = {
        ...pdfMedia,
        days: normalizePdfMediaDaysForInfoPdf(pdfMedia, infoPdfWithCoverTitle),
      };
      await api.put(`/turismo/cotizaciones/${cotizacion.id}`, {
        info_pdf: infoPdfWithCoverTitle,
        pdf_media: normalizedPdfMedia,
        hotel_detalle: normalizedHotelDetalle,
        updatedby: user.dni || "12345678",
        idioma,
      });
      const updated = {
        ...cotizacion,
        info_pdf: infoPdfWithCoverTitle,
        pdf_media: normalizedPdfMedia,
        hotel_detalle: normalizedHotelDetalle,
        pdf_excel_preview_categories: excelPreviewCategories,
        idioma,
      };
      setHotelDetalleByIdioma(normalizedHotelDetalle);
      localStorage.setItem(DATA_KEY, JSON.stringify(updated));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.cotizaciones.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.cotizaciones.detail(cotizacion.id),
        }),
      ]);
      setCotizacion(updated);
      setSaveStatus("success");
      const cotizacionesReturnPath = location.pathname.startsWith("/reservas/")
        ? "/reservas/cotizaciones"
        : "/ventas/cotizaciones";
      setTimeout(() => navigate(cotizacionesReturnPath), 1200);
    } catch (err) {
      console.error("Error saving:", err);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  /* ==================== RENDER / PDF EXPORT DATA ==================== */

  const dias = infoPdf || [];
  const labels = getLabels(idioma);
  const canvaCopy = getPdfCanvaCopy(idioma);
  const canvaDuration = formatPdfCanvaDuration(dias.length, idioma);
  const normalizedPdfMediaDays = useMemo(
    () => normalizePdfMediaDaysForInfoPdf(pdfMedia, dias),
    [pdfMedia, dias],
  );
  const effectivePdfMedia = useMemo(
    () => ({ ...pdfMedia, days: normalizedPdfMediaDays }),
    [pdfMedia, normalizedPdfMediaDays],
  );
  const coverImages = useMemo(
    () => resolveVensoCanvaCoverImages(effectivePdfMedia, dias),
    [effectivePdfMedia, dias],
  );
  const [exportPreviewHydrated, setExportPreviewHydrated] = useState(false);
  const getEditorPreviewPageElements = useMemo(
    () => () =>
      Array.from(
        previewExportRef.current?.querySelectorAll(
          ".pdf-pages-wrapper .pdf-page",
        ) || [],
      ),
    [],
  );
  const getHydratedEditorPreviewPageElements = useMemo(
    () => () => {
      if (!exportPreviewHydrated) {
        flushSync(() => setExportPreviewHydrated(true));
      }
      forceHydratePdfExportPreviewImages(previewExportRef.current);
      return getEditorPreviewPageElements();
    },
    [exportPreviewHydrated, getEditorPreviewPageElements],
  );
  const editorPdfCotizacion = useMemo(() => {
    if (!cotizacion) return null;
    return {
      ...cotizacion,
      info_pdf: buildInfoPdfForSave(),
      pdf_media: effectivePdfMedia,
      hotel_detalle: hotelDetalle,
      pdf_excel_preview_categories: excelPreviewCategories,
      idioma,
    };
  }, [
    cotizacion,
    infoPdf,
    coverTitle,
    effectivePdfMedia,
    hotelDetalle,
    excelPreviewCategories,
    idioma,
  ]);
  const editorPreviewImagenesEditor = useMemo(
    () => buildImagenesEditorFromMedia(effectivePdfMedia, dias),
    [effectivePdfMedia, dias],
  );

  useEffect(() => {
    if (!editorPdfCotizacion?.info_pdf?.length) return undefined;

    let active = true;
    let timeoutId = null;
    let idleId = null;
    const requestIdle =
      window.requestIdleCallback || ((callback) => setTimeout(callback, 1));
    const cancelIdle = window.cancelIdleCallback || clearTimeout;

    // El editor no debe capturar/generar PDF al entrar. Solo calentamos assets
    // y proxy de Tigris para que la descarga posterior use caché HTTP.
    timeoutId = setTimeout(() => {
      idleId = requestIdle(() => {
        if (!active) return;
        prewarmCotizacionPdfExportAssets(
          editorPdfCotizacion,
          getEditorPreviewPageElements(),
        ).catch(
          (error) => {
            console.warn(
              "No fue posible precalentar imágenes del PDF editor.",
              error,
            );
          },
        );
      }, { timeout: 2500 });
    }, 600);

    return () => {
      active = false;
      if (timeoutId != null) clearTimeout(timeoutId);
      if (idleId != null) cancelIdle(idleId);
    };
  }, [editorPdfCotizacion, getEditorPreviewPageElements]);

  if (!cotizacion)
    return <div style={{ padding: 40 }}>No hay cotización cargada</div>;

  return (
    <div className="pdf-editor-view">
      {/* ===== TOP BAR ===== */}
      <header className="editor-topbar">
        <button
          className="topbar-back"
          onClick={() => navigate(-1)}
          title="Volver"
        >
          <MdArrowBack size={20} />
        </button>
        <div className="topbar-brand">
          <img src={logoBlanco} alt="Venso Tours" className="topbar-brand-logo" />
          <div>
            <span className="topbar-kicker">DISEÑO VENSO · CANVA</span>
            <span className="topbar-title">Editor de cotización</span>
          </div>
        </div>

        {hotelCategoryOptions.length > 1 && (
          <div className="hpp-header-actions editor-cat-filters pdf-hotel-filter-actions">
            <div className="hpp-filter-chips pdf-hotel-filter-chips">
              {hotelCategoryOptions.map((cat) => {
                const chip = formatPdfHotelCategoryChip(cat);
                const category = chip.category;
                const isActive = excelPreviewCategories.includes(category);
                return (
                  <button
                    key={category}
                    type="button"
                    className={`hpp-cat-chip pdf-hotel-cat-chip ${isActive ? "active" : ""}`}
                    onClick={() => toggleExcelPreviewCategory(category)}
                    title={
                      isActive
                        ? `Ocultar ${chip.title}`
                        : `Mostrar ${chip.title}`
                    }
                  >
                    <MdStar className="pdf-hotel-cat-chip__icon" />
                    <span>{chip.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Language selector */}
        <div className="idioma-selector">
          {IDIOMAS.map((lang) => (
            <button
              key={lang.code}
              className={`idioma-btn ${idioma === lang.code ? "active" : ""}`}
              onClick={() => handleIdiomaChange(lang.code)}
              disabled={translating}
              title={lang.label}
              aria-label={lang.label}
              aria-pressed={idioma === lang.code}
              type="button"
            >
              <LanguageFlag code={lang.code} />
            </button>
          ))}
          {translating && <span className="idioma-loading"></span>}
        </div>

        <div className="topbar-actions">
          <PdfCotizacion
            cotizacion={editorPdfCotizacion}
            pageElements={getHydratedEditorPreviewPageElements}
            autoPrepare={false}
          />
          <button
            className={`topbar-save ${saving ? "saving" : ""} ${saveStatus || ""}`}
            onClick={handleSave}
            disabled={saving}
          >
            <MdSave size={16} />
            {saving
              ? "Guardando..."
              : saveStatus === "success"
                ? "¡Guardado!"
                : saveStatus === "error"
                  ? "Error"
                  : "Guardar"}
          </button>
        </div>
      </header>

      {mediaUploadError && (
        <div className="editor-upload-error" role="alert">
          {mediaUploadError}
        </div>
      )}

      {/* ===== WORKSPACE ===== */}
      <div className="editor-workspace editor-workspace--venso-canva">
        <aside className="editor-page-rail" aria-label="Páginas del PDF Venso Canva">
          <div className="editor-page-rail__intro">
            <span className="editor-page-rail__eyebrow">{canvaCopy.editor.structureEyebrow}</span>
            <strong>{getVensoCanvaPageCount(dias.length)} {canvaCopy.editor.pages}</strong>
            <small>{canvaCopy.editor.structureSummary}</small>
          </div>
          <button type="button" className="editor-page-rail__item" onClick={() => scrollToPage("cover")}>
            <span>01</span><strong>{canvaCopy.editor.cover}</strong>
          </button>
          <div className="editor-page-rail__days">
            {dias.map((d, i) => (
              <button
                type="button"
                key={i}
                className="editor-page-rail__item editor-page-rail__item--day"
                onClick={() => scrollToPage(`day-${i}`)}
              >
                <span>{String(i + 2).padStart(2, "0")}</span>
                <strong>{canvaCopy.dayScript} {d.dia || i + 1}</strong>
              </button>
            ))}
          </div>
          <button type="button" className="editor-page-rail__item" onClick={() => scrollToPage("pricing")}>
            <span>{String(dias.length + 2).padStart(2, "0")}</span><strong>{canvaCopy.editor.price}</strong>
          </button>
          <button type="button" className="editor-page-rail__item" onClick={() => scrollToPage("reservation")}>
            <span>{String(dias.length + 3).padStart(2, "0")}</span><strong>{canvaCopy.editor.reservation}</strong>
          </button>
          <button type="button" className="editor-page-rail__item" onClick={() => scrollToPage("purchase")}>
            <span>{String(dias.length + 4).padStart(2, "0")}</span><strong>{canvaCopy.editor.terms}</strong>
          </button>
        </aside>

        {/* ===== CANVAS ===== */}
        <div className="editor-canvas editor-canvas--venso-canva" ref={canvasRef}>
          {/* ---- COVER: three editable Canva photo panels ---- */}
          <div
            className="pdf-page cover-page venso-canva-page editor-page editor-canva-cover"
            ref={(el) => (pageRefs.current["cover"] = el)}
          >
            <div className="canva-cover-collage">
              {[0, 1, 2].map((slot) => {
                const slotKey = `cover-${slot}`;
                const image = coverImages[slot] || null;
                const slotUploading = uploadingSlot === slotKey;
                const isDragOver = dragOverSlot === slotKey;
                return (
                  <div
                    key={slot}
                    className={`canva-cover-panel canva-cover-panel--${slot + 1} editor-cover-slot ${isDragOver ? "drag-over" : ""}`}
                    data-pdf-editor-control="true"
                    {...makeSlotDragHandlers(slotKey, (file) => handleCoverImage(slot, file))}
                  >
                    {image ? (
                      <LazyPdfImage
                        src={image}
                        alt={`Portada ${slot + 1}`}
                        className="canva-cover-image"
                        draggable={false}
                        usePreview={false}
                        rootMargin="0px"
                      />
                    ) : (
                      <div className="canva-cover-placeholder" />
                    )}
                    <div className="editor-cover-slot__actions">
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        id={`cover-file-${slot}`}
                        disabled={slotUploading}
                        onChange={(event) =>
                          event.target.files?.[0] &&
                          handleCoverImage(slot, event.target.files[0])
                        }
                      />
                      <label htmlFor={`cover-file-${slot}`} className="editor-media-pill" title="Subir o reemplazar imagen">
                        {slotUploading ? <span className="upload-spinner" /> : <MdCloudUpload size={15} />}
                        <span>{slotUploading ? "Subiendo" : `Foto ${slot + 1}`}</span>
                      </label>
                      {referenceLibrary.images.length > 0 && (
                        <button
                          type="button"
                          className="editor-media-pill"
                          onClick={() => openReferencePicker({ type: "cover", slot })}
                          title="Elegir imagen de galería"
                        >
                          <MdPhotoLibrary size={15} />
                        </button>
                      )}
                      {image && (
                        <button
                          type="button"
                          className="editor-media-pill editor-media-pill--danger"
                          onClick={() => removeCoverImage(slot)}
                          title="Quitar imagen"
                        >
                          <MdDelete size={14} />
                        </button>
                      )}
                    </div>
                    {isDragOver && <span className="editor-cover-drop-hint">Suelta aquí</span>}
                  </div>
                );
              })}
            </div>
            <img src={logoBlanco} alt="Venso Tours" className="canva-cover-logo" />
            <div className="canva-cover-title-frame editor-canva-title-frame" data-pdf-editor-control="true">
              <textarea
                className="canva-cover-title cover-title-input editor-cover-title-input"
                value={coverTitle}
                onChange={(e) => setCoverTitle(e.target.value)}
                placeholder={canvaCopy.editor.coverTitlePlaceholder}
                spellCheck={false}
              />
            </div>
            {dias.length > 0 && (
              <div className="canva-cover-duration">
                <span>{canvaDuration.days}</span>
                <span className="canva-cover-duration__sep">/</span>
                <span>{canvaDuration.nights}</span>
              </div>
            )}
          </div>

          {/* ---- DAY PAGES ---- */}
          {dias.map((day, i) => {
            const dayData = normalizedPdfMediaDays[i] || { layout: "3-bottom", images: [] };
            const imgs = Array.isArray(dayData.images) ? dayData.images : [];
            const dayNumber = day.dia || i + 1;
            const tipoServicio = limpiarLista(day.tipo_servicio);

            const renderDayImageSlot = (slot, kind) => {
              const slotKey = `day-${i}-${slot}`;
              const image = imgs[slot] || null;
              const slotUploading = uploadingSlot === slotKey;
              const isDragOver = dragOverSlot === slotKey;
              return (
                <div
                  className={`editor-canva-image-slot editor-canva-image-slot--${kind} ${isDragOver ? "drag-over" : ""}`}
                  data-pdf-editor-control="true"
                  {...makeSlotDragHandlers(slotKey, (file) => handleDayImage(i, slot, file))}
                >
                  {image ? (
                    <LazyPdfImage
                      src={image}
                      alt=""
                      draggable={false}
                      usePreview={false}
                      rootMargin="0px"
                      onLoad={(event) => {
                        const img = event.currentTarget;
                        if (img.naturalWidth <= 1 && img.naturalHeight <= 1) {
                          handleRenderedDayImageBad(i, slot, image);
                        }
                      }}
                      onError={() => handleRenderedDayImageBad(i, slot, image)}
                    />
                  ) : (
                    <div className="canva-day-photo-placeholder" />
                  )}
                  <div className="editor-day-image-actions">
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      id={`canva-day-${i}-${slot}`}
                      disabled={slotUploading}
                      onChange={(event) =>
                        event.target.files?.[0] &&
                        handleDayImage(i, slot, event.target.files[0])
                      }
                    />
                    <label htmlFor={`canva-day-${i}-${slot}`} className="editor-media-pill">
                      {slotUploading ? <span className="upload-spinner" /> : <MdCloudUpload size={14} />}
                      <span>{slot === 0 ? "Foto principal" : `Foto ${slot + 1}`}</span>
                    </label>
                    {referenceLibrary.images.length > 0 && (
                      <button
                        type="button"
                        className="editor-media-pill"
                        onClick={() => openReferencePicker({ type: "day", dayIndex: i, slot })}
                        title="Elegir imagen de galería"
                      >
                        <MdPhotoLibrary size={14} />
                      </button>
                    )}
                    {image && (
                      <button
                        type="button"
                        className="editor-media-pill editor-media-pill--danger"
                        onClick={() => removeDayImage(i, slot)}
                        title="Quitar imagen"
                      >
                        <MdDelete size={14} />
                      </button>
                    )}
                  </div>
                  {isDragOver && <span className="editor-day-drop-hint">Suelta aquí</span>}
                </div>
              );
            };

            return (
              <div
                key={i}
                className="pdf-page day-page venso-canva-page editor-page"
                ref={(el) => (pageRefs.current[`day-${i}`] = el)}
              >
                <div className="canva-day-media-column">
                  <div className="canva-day-main-photo">{renderDayImageSlot(0, "main")}</div>
                  <div className="canva-day-list canva-day-list--compact canva-editor-list">
                    <EditableListBlock
                      title={labels.recomendaciones}
                      iconType="rec"
                      field="recomendaciones"
                      items={day.recomendaciones || []}
                      dayIndex={i}
                      onUpdate={updateListItem}
                      onAdd={addListItem}
                      onRemove={removeListItem}
                    />
                  </div>
                </div>

                <div className="canva-day-copy-column">
                  <div className="canva-day-script-row">
                    <span className="canva-day-script">{canvaCopy.dayScript} {dayNumber}</span>
                    <span className="canva-day-script-line" />
                  </div>
                  {i === 0 && (
                    <p className="canva-day-intro">{canvaCopy.firstDayIntro}</p>
                  )}
                  <AutoResizeTextarea
                    className="canva-day-title day-title-input canva-editor-textarea"
                    value={day.titulo || ""}
                    onChange={(e) => updateField(i, "titulo", e.target.value)}
                    placeholder={canvaCopy.editor.dayTitlePlaceholder}
                    rows={1}
                  />
                  <textarea
                    className="canva-day-description day-desc-textarea canva-editor-textarea"
                    value={day.descripcion || ""}
                    onChange={(e) => updateField(i, "descripcion", e.target.value)}
                    placeholder={canvaCopy.editor.dayDescriptionPlaceholder}
                    rows={7}
                  />
                  <div className="canva-day-details canva-editor-details">
                    <div className="canva-day-list canva-day-list--include canva-editor-list">
                      <EditableListBlock
                        title={labels.incluye}
                        iconType="inc"
                        field="incluye"
                        items={day.incluye || []}
                        dayIndex={i}
                        onUpdate={updateListItem}
                        onAdd={addListItem}
                        onRemove={removeListItem}
                      />
                    </div>
                    <div className="canva-day-list canva-day-list--exclude canva-editor-list">
                      <EditableListBlock
                        title={labels.no_incluye}
                        iconType="no"
                        field="no_incluye"
                        items={day.no_incluye || []}
                        dayIndex={i}
                        onUpdate={updateListItem}
                        onAdd={addListItem}
                        onRemove={removeListItem}
                      />
                    </div>
                    {tipoServicio.length > 0 && (
                      <div className="canva-day-list canva-day-list--service">
                        <h3>{labels.tipo_servicio}</h3>
                        <ul>{tipoServicio.map((item, index) => <li key={index}>{safeText(String(item))}</li>)}</ul>
                      </div>
                    )}
                  </div>
                  <div className="canva-day-accent-grid canva-day-accent-grid--2 editor-canva-accents">
                    {renderDayImageSlot(1, "accent")}
                    {renderDayImageSlot(2, "accent")}
                  </div>
                </div>
              </div>
            );
          })}

          {/* ---- PRICING + LEGAL PAGES, same renderer as preview/export ---- */}
          <PricingPage
            cotizacion={{ ...cotizacion, pdf_media: effectivePdfMedia, info_pdf: buildInfoPdfForSave(), idioma }}
            availableCategories={hotelCategoryOptions}
            excelPreviewCategories={excelPreviewCategories}
            idioma={idioma}
          />
          <TermsAndConditionsPage
            idioma={idioma || cotizacion?.idioma || "es"}
            cotizacion={{ ...cotizacion, pdf_media: effectivePdfMedia, info_pdf: buildInfoPdfForSave(), idioma }}
          />
        </div>
      </div>

      {editorPdfCotizacion?.info_pdf?.length > 0 && (
        <div
          className="pdf-editor-export-preview"
          ref={previewExportRef}
          aria-hidden="true"
        >
          <PdfPages
            cotizacion={editorPdfCotizacion}
            imagenesEditor={editorPreviewImagenesEditor}
            excelPreviewCategories={excelPreviewCategories}
            referenceImages={referenceLibrary.images}
            forceLoadImages={exportPreviewHydrated}
          />
        </div>
      )}

      {referencePicker && (
        <ReferenceImagePicker
          images={referenceLibrary.images}
          categories={referenceLibrary.categories}
          seedText={referencePickerSeed}
          onSelect={applyReferenceImage}
          onManageLibrary={
            canManageReferenceLibrary
              ? () => window.open("/almacen/inventario", "_blank", "noopener,noreferrer")
              : null
          }
          onClose={() => setReferencePicker(null)}
        />
      )}
    </div>
  );
}

function ReferenceImagePicker({
  images = [],
  categories = [],
  seedText = "",
  onSelect,
  onManageLibrary,
  onClose,
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const categoryCounts = useMemo(() => {
    const counts = images.reduce((acc, image) => {
      const key = image.category || "General";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return counts;
  }, [images]);

  const sidebarCategories = useMemo(() => {
    const set = new Set(categories);
    images.forEach((image) => set.add(image.category || "General"));
    return Array.from(set)
      .filter((item) => item !== "Todas")
      .sort((a, b) => {
        if (a === "General") return 1;
        if (b === "General") return -1;
        return a.localeCompare(b);
      });
  }, [categories, images]);

  const visibleImages = useMemo(() => {
    const queryTokens = normalizePdfImageText(query)
      .split(/\s+/)
      .filter((token) => token.length >= 2);

    return images
      .filter((image) => {
        if (category !== "all" && image.category !== category) return false;
        if (!queryTokens.length) return true;
        const haystack = imageSearchText(image);
        return queryTokens.every((token) => haystack.includes(token));
      })
      .map((image) => ({
        ...image,
        score: scoreReferenceImage(image, seedText),
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return String(a.category).localeCompare(String(b.category));
      })
      .slice(0, 200);
  }, [category, images, query, seedText]);

  const suggestedImages = useMemo(
    () => visibleImages.filter((image) => image.score > 0).slice(0, 10),
    [visibleImages],
  );

  const suggestedIds = useMemo(
    () => new Set(suggestedImages.map((image) => image.id || image.src)),
    [suggestedImages],
  );
  const mainImages = useMemo(
    () => visibleImages.filter((image) => !suggestedIds.has(image.id || image.src)),
    [visibleImages, suggestedIds],
  );

  const handleCategoryClick = (next) => {
    setCategory(next);
  };

  const ImageCard = ({ image, variant = "default" }) => {
    const title = image.displayTitle || image.title || "Sin título";
    return (
      <button
        type="button"
        className={`ref-card ${variant === "suggested" ? "ref-card--suggested" : ""}`}
        onClick={() => onSelect(image)}
        title={title}
      >
        <div className="ref-card__media">
          <img
            src={image.previewSrc || image.proxyUrl || image.src}
            alt={title}
            loading="lazy"
          />
          <div className="ref-card__overlay">
            <span className="ref-card__select">Seleccionar</span>
          </div>
          {variant === "suggested" && <span className="ref-card__badge">Sugerida</span>}
        </div>
        <div className="ref-card__meta">
          <span className="ref-card__title">{title}</span>
          <span className="ref-card__category">{image.category || "General"}</span>
        </div>
      </button>
    );
  };

  return (
    <div className="ref-picker-overlay" onClick={onClose}>
      <div className="ref-picker" onClick={(e) => e.stopPropagation()}>
        {/* ---- SIDEBAR ---- */}
        <aside className="ref-picker__sidebar">
          <div className="ref-picker__brand">
            <MdPhotoLibrary size={22} />
            <span>Categorías</span>
          </div>
          <nav className="ref-picker__category-list" aria-label="Categorías">
            <button
              type="button"
              className={`ref-picker__cat-item ${category === "all" ? "active" : ""}`}
              onClick={() => handleCategoryClick("all")}
            >
              <span className="ref-picker__cat-name">Todas</span>
              <span className="ref-picker__cat-count">{images.length}</span>
            </button>
            {sidebarCategories.map((item) => (
              <button
                type="button"
                key={item}
                className={`ref-picker__cat-item ${category === item ? "active" : ""}`}
                onClick={() => handleCategoryClick(item)}
              >
                <span className="ref-picker__cat-name">{item}</span>
                <span className="ref-picker__cat-count">
                  {categoryCounts[item] || 0}
                </span>
              </button>
            ))}
          </nav>
        </aside>

        {/* ---- MAIN PANEL ---- */}
        <div className="ref-picker__main">
          <div className="ref-picker__header">
            <div>
              <h3>Galería de imágenes</h3>
              <span>
                {visibleImages.length} de {images.length} imágenes
                {category !== "all" && ` en “${category}”`}
              </span>
            </div>
            <div className="ref-picker__header-actions">
              {onManageLibrary && (
                <button
                  type="button"
                  className="ref-picker__manage"
                  onClick={onManageLibrary}
                  title="Abrir Gestión Media en una pestaña nueva"
                >
                  <MdPhotoLibrary size={18} />
                  Gestionar banco
                  <MdOpenInNew size={16} />
                </button>
              )}
              <button
                type="button"
                className="ref-picker__close"
                onClick={onClose}
                title="Cerrar"
              >
                <MdClose size={24} />
              </button>
            </div>
          </div>

          <div className="ref-picker__search">
            <MdSearch size={20} className="ref-picker__search-icon" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar destino, servicio o nombre..."
              aria-label="Buscar imágenes"
            />
            {query && (
              <button
                type="button"
                className="ref-picker__search-clear"
                onClick={() => setQuery("")}
                title="Limpiar búsqueda"
              >
                <MdClose size={16} />
              </button>
            )}
          </div>

          <div className="ref-picker__body">
            {suggestedImages.length > 0 && (
              <section className="ref-picker__suggested">
                <div className="ref-picker__section-header">
                  <strong>Sugeridas para este día</strong>
                  <span>{suggestedImages.length} coincidencias</span>
                </div>
                <div className="ref-picker__suggested-track">
                  {suggestedImages.map((image) => (
                    <ImageCard
                      key={`suggested-${image.id || image.src}`}
                      image={image}
                      variant="suggested"
                    />
                  ))}
                </div>
              </section>
            )}

            {mainImages.length > 0 && (
              <section className="ref-picker__grid-section">
                <div className="ref-picker__section-header">
                  <strong>{category === "all" ? "Todas las imágenes" : category}</strong>
                  <span>{mainImages.length} imágenes</span>
                </div>
                <div className="ref-picker__grid">
                  {mainImages.map((image) => (
                    <ImageCard
                      key={`main-${image.id || image.src}`}
                      image={image}
                    />
                  ))}
                </div>
              </section>
            )}

            {visibleImages.length === 0 && (
              <div className="ref-picker__empty">
                <MdOutlineImageNotSupported size={48} />
                <p>No se encontraron imágenes</p>
                <span>Prueba con otro término o categoría</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================================================================
 EDITABLE LIST BLOCK
 =================================================================== */

const EDITABLE_ICON_MAP = {
  rec:  { bg: "#f59e0b", sym: "⊙" },
  tipo: { bg: "#6b7280", sym: "✦" },
  inc:  { bg: "#16a34a", sym: "+" },
  no:   { bg: "#dc2626", sym: "✕" },
};

function EditableListBlock({
  title,
  iconType,
  field,
  items,
  dayIndex,
  onUpdate,
  onAdd,
  onRemove,
}) {
  const ic = EDITABLE_ICON_MAP[iconType];
  return (
    <div className="list-block editable">
      <div className="list-block-header">
        {ic && (
          <span className="list-icon" style={{ background: ic.bg }}>
            {ic.sym}
          </span>
        )}
        <span className="list-block-title">{title}</span>
        <button
          className="list-add-btn"
          onClick={() => onAdd(dayIndex, field)}
          title="Agregar"
        >
          <MdAdd size={12} />
        </button>
      </div>
      <ul className="list-block-items editable-items">
        {items.map((item, idx) => (
          <li key={idx} className="editable-item">
            <input
              className="list-item-input"
              value={item || ""}
              onChange={(e) => onUpdate(dayIndex, field, idx, e.target.value)}
              placeholder="..."
            />
            <button
              className="list-rm-btn"
              onClick={() => onRemove(dayIndex, field, idx)}
            >
              <MdClose size={11} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ===================================================================
 LAYOUT ICON (mini visual)
 =================================================================== */

function LayoutIcon({ layout }) {
  const b = { display: "grid", width: 18, height: 14, gap: 1 };
  const c = { background: "currentColor", borderRadius: 1, opacity: 0.65 };

  if (layout === "1")
    return (
      <div style={{ ...b, gridTemplateRows: "1fr" }}>
        <div style={c} />
      </div>
    );

  if (layout === "2")
    return (
      <div style={{ ...b, gridTemplateRows: "1fr 1fr" }}>
        <div style={c} />
        <div style={c} />
      </div>
    );

  if (layout === "3-top")
    return (
      <div
        style={{
          ...b,
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
        }}
      >
        <div style={{ ...c, gridColumn: "1 / span 2" }} />
        <div style={c} />
        <div style={c} />
      </div>
    );

  // 3-bottom
  return (
    <div
      style={{
        ...b,
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
      }}
    >
      <div style={c} />
      <div style={c} />
      <div style={{ ...c, gridColumn: "1 / span 2" }} />
    </div>
  );
}
