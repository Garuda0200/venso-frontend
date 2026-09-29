// PdfPreviewModal.jsx
// ============================================================
// Modal de vista previa del PDF de cotización
// Renderiza las páginas HTML directamente (sin jsPDF / iframe blob)
// Descarga vía window.print() → "Guardar como PDF"
// ============================================================
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  MdClose,
  MdFileDownload,
  MdDescription,
  MdEditSquare,
  MdKeyboardArrowUp,
  MdKeyboardArrowDown,
  MdFirstPage,
  MdLastPage,
  MdStar,
} from "react-icons/md";
import "./PdfPreviewModal.scss";
import {
  PdfPages,
  exportCotizacionToPdf,
  exportCotizacionToWord,
  prepareCotizacionPdfExport,
  prewarmCotizacionPdfExportAssets,
  getDefaultPdfExcelCategories,
  getPdfHotelCategoryOptions,
  pdfMediaHasUsableImages,
  forceHydratePdfImages,
  waitForCotizacionPdfImagesReady,
} from "../EdicionCotizacion/PdfCotizacion/PdfCotizacion";
import {
  buildAutoPdfMedia,
  buildImagenesEditorFromMedia,
  fetchReferenceImageManifest,
} from "../EdicionCotizacion/utils/pdfReferenceImageMatcher";
import axios from "../../../../utils/axiosInstance";
import useHotelQuoteDictionary, {
  resolveQuotationTariffType,
} from "../EdicionCotizacion/utils/useHotelQuoteDictionary";
import buildRoomOptionsByCategory from "../EdicionCotizacion/utils/buildRoomOptionsByCategory";
import { formatPdfHotelCategoryChip } from "../EdicionCotizacion/utils/pdfHotelPreviewData";
import { getVensoCanvaPageCount } from "../EdicionCotizacion/utils/vensoPdfCanvaDesign";

const areSameCategoryKeys = (left = [], right = []) =>
  left.length === right.length &&
  left.every((value, index) => String(value) === String(right[index]));

export const PdfPreviewModal = ({ cotizacion, onClose }) => {
  const modalRef = useRef(null);
  const scrollRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [referenceImages, setReferenceImages] = useState([]);
  const [excelPreviewCategories, setExcelPreviewCategories] = useState([]);
  const [downloading, setDownloading] = useState(false);
  const [downloadingWord, setDownloadingWord] = useState(false);
  const [previewImagesHydrated, setPreviewImagesHydrated] = useState(true);
  const [previewImagesReady, setPreviewImagesReady] = useState(false);
  const initialCategoriesSet = useRef(false);

  // Calcular total de páginas
  const diasInfoPdf = Array.isArray(cotizacion?.info_pdf)
    ? cotizacion.info_pdf
    : [];
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
      initialCategoriesSet.current = false;
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

      let next;
      if (filtered.length > 0 && !allCategoriesSelected) {
        next = filtered;
      } else if (initialCategoriesSet.current) {
        next = current;
      } else {
        next = getDefaultPdfExcelCategories(cotizacion, hotelCategoryOptions);
      }

      if (!areSameCategoryKeys(current, next)) {
        if (!initialCategoriesSet.current) initialCategoriesSet.current = true;
        return next;
      }
      if (!initialCategoriesSet.current && current.length > 0) {
        initialCategoriesSet.current = true;
      }
      return current;
    });
  }, [cotizacion?.id, hotelCategoryOptions]);

  const toggleExcelPreviewCategory = useCallback((category) => {
    const key = String(category);
    setExcelPreviewCategories((current) => {
      if (current.includes(key)) {
        return current.length > 1
          ? current.filter((item) => item !== key)
          : current;
      }
      return [...current, key];
    });
  }, []);

  // cover + itinerary days + pricing + reservation conditions + purchase terms
  const expectedPages = getVensoCanvaPageCount(diasInfoPdf.length);

  useEffect(() => {
    setTotalPages(expectedPages);
  }, [expectedPages]);

  const hasUsablePdfMedia = useMemo(
    () => pdfMediaHasUsableImages(cotizacion?.pdf_media, diasInfoPdf),
    [cotizacion?.pdf_media, diasInfoPdf],
  );

  useEffect(() => {
    if (hasUsablePdfMedia) return;
    let active = true;
    fetchReferenceImageManifest().then((library) => {
      if (active) setReferenceImages(library.images || []);
    });
    return () => {
      active = false;
    };
  }, [hasUsablePdfMedia]);

  // Stable metadata object so the memoized media builder does not re-run on every
  // parent re-render when the cotizacion reference changes but the content does not.
  const cotizacionMediaMeta = useMemo(
    () => ({
      id: cotizacion?.id,
      titulo: cotizacion?.titulo,
      idioma: cotizacion?.idioma,
      pdf_media: cotizacion?.pdf_media,
    }),
    [
      cotizacion?.id,
      cotizacion?.titulo,
      cotizacion?.idioma,
      cotizacion?.pdf_media,
    ],
  );

  const effectivePdfMedia = useMemo(() => {
    if (hasUsablePdfMedia) {
      return cotizacionMediaMeta.pdf_media || {};
    }
    return buildAutoPdfMedia({
      pdfMedia: cotizacionMediaMeta.pdf_media || {},
      cotizacion: cotizacionMediaMeta,
      infoPdf: diasInfoPdf,
      referenceImages,
    });
  }, [hasUsablePdfMedia, cotizacionMediaMeta, diasInfoPdf, referenceImages]);

  const previewCotizacion = useMemo(
    () => ({
      ...cotizacion,
      pdf_media: effectivePdfMedia,
      pdf_excel_preview_categories: excelPreviewCategories,
    }),
    [cotizacion, effectivePdfMedia, excelPreviewCategories],
  );

  const previewImagenesEditor = useMemo(
    () => buildImagenesEditorFromMedia(effectivePdfMedia, diasInfoPdf),
    [effectivePdfMedia, diasInfoPdf],
  );

  const previewAssetsKey = useMemo(
    () =>
      [
        previewCotizacion?.id,
        previewCotizacion?.pdf_render_fingerprint,
        previewCotizacion?.updatedat || previewCotizacion?.updated_at,
        JSON.stringify(effectivePdfMedia || {}),
        JSON.stringify(excelPreviewCategories || []),
      ].join("@@"),
    [
      previewCotizacion?.id,
      previewCotizacion?.pdf_render_fingerprint,
      previewCotizacion?.updatedat,
      previewCotizacion?.updated_at,
      effectivePdfMedia,
      excelPreviewCategories,
    ],
  );

  useEffect(() => {
    setPreviewImagesHydrated(true);
    setPreviewImagesReady(false);
  }, [previewAssetsKey]);

  useEffect(() => {
    if (!previewCotizacion?.info_pdf?.length) return undefined;

    let active = true;
    const run = async () => {
      const root = scrollRef.current;
      const pages = root?.querySelectorAll(".pdf-pages-wrapper .pdf-page") || null;
      forceHydratePdfImages(root);

      // Calienta proxy + caché de navegador antes de que el usuario haga scroll
      // o descargue, evitando que el panel izquierdo repita consultas a Tigris.
      await prewarmCotizacionPdfExportAssets(previewCotizacion, pages);
      if (!active) return;

      forceHydratePdfImages(root);
      const ready = await waitForCotizacionPdfImagesReady(root);
      if (!active) return;
      setPreviewImagesReady(ready);
    };

    const frameId = requestAnimationFrame(() => {
      run().catch((error) => {
        console.warn("No fue posible precalentar imágenes del preview PDF.", error);
        if (active) setPreviewImagesReady(true);
      });
    });

    return () => {
      active = false;
      cancelAnimationFrame(frameId);
    };
  }, [previewCotizacion, previewAssetsKey]);


  useEffect(() => {
    if (!previewCotizacion?.info_pdf?.length || !previewImagesReady) return undefined;
    let active = true;
    let timeoutId = null;
    let idleId = null;
    const requestIdle = window.requestIdleCallback || ((callback) => setTimeout(callback, 1));
    const cancelIdle = window.cancelIdleCallback || clearTimeout;

    timeoutId = setTimeout(() => {
      idleId = requestIdle(() => {
        if (!active) return;
        const pages = Array.from(
          scrollRef.current?.querySelectorAll(".pdf-pages-wrapper .pdf-page") || [],
        );
        if (!pages.length) return;
        prepareCotizacionPdfExport(previewCotizacion, pages).catch((error) => {
          console.warn("No fue posible preparar PDF desde la vista previa.", error);
        });
      }, { timeout: 1800 });
    }, 700);

    return () => {
      active = false;
      if (timeoutId != null) clearTimeout(timeoutId);
      if (idleId != null) cancelIdle(idleId);
    };
  }, [previewCotizacion, previewImagesReady]);

  // Rastreo de scroll para saber qué página está visible
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const pages = container.querySelectorAll(".pdf-page");
        if (pages.length) {
          const containerMid = container.scrollTop + container.clientHeight / 2;
          for (let i = 0; i < pages.length; i++) {
            const top = pages[i].offsetTop - container.offsetTop;
            const bottom = top + pages[i].offsetHeight;
            if (containerMid >= top && containerMid <= bottom) {
              setCurrentPage(i + 1);
              break;
            }
          }
        }
        ticking = false;
      });
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Navegación por teclado + cerrar con ESC
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        scrollToPage(Math.max(1, currentPage - 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        scrollToPage(Math.min(totalPages, currentPage + 1));
      }
    },
    [onClose, currentPage, totalPages],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Hacer scroll a una página específica
  const scrollToPage = (pageNum) => {
    const container = scrollRef.current;
    if (!container) return;
    const pages = container.querySelectorAll(".pdf-page");
    if (pages[pageNum - 1]) {
      pages[pageNum - 1].scrollIntoView({
        behavior: "instant",
        block: "start",
      });
    }
  };

  const goToFirstPage = () => scrollToPage(1);
  const goToPrevPage = () => scrollToPage(Math.max(1, currentPage - 1));
  const goToNextPage = () =>
    scrollToPage(Math.min(totalPages, currentPage + 1));
  const goToLastPage = () => scrollToPage(totalPages);

  // Descargar PDF usando las páginas que ya están renderizadas en el modal.
  const handleDownloadPdf = async () => {
    if (downloading || downloadingWord) return;
    flushSync(() => setPreviewImagesHydrated(true));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const root = scrollRef.current;
    const renderedPages = Array.from(
      root?.querySelectorAll(".pdf-pages-wrapper .pdf-page") || [],
    );
    if (!renderedPages.length) return;
    setDownloading(true);
    try {
      forceHydratePdfImages(root);
      await prewarmCotizacionPdfExportAssets(previewCotizacion, renderedPages);
      const ready = await waitForCotizacionPdfImagesReady(root);
      setPreviewImagesReady(ready);
      if (!ready) {
        throw new Error("Las imágenes del PDF aún no están listas para descargar.");
      }
      await exportCotizacionToPdf(previewCotizacion, renderedPages);
    } catch (error) {
      console.error("Error al generar el PDF:", error);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadWord = async () => {
    if (downloading || downloadingWord) return;
    flushSync(() => setPreviewImagesHydrated(true));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const root = scrollRef.current;
    const renderedPages = Array.from(
      root?.querySelectorAll(".pdf-pages-wrapper .pdf-page") || [],
    );
    if (!renderedPages.length) return;

    setDownloadingWord(true);
    try {
      forceHydratePdfImages(root);
      await prewarmCotizacionPdfExportAssets(previewCotizacion, renderedPages);
      await exportCotizacionToWord(previewCotizacion, renderedPages);
    } catch (error) {
      console.error("Error al generar el Word:", error);
    } finally {
      setDownloadingWord(false);
    }
  };

  // Editar PDF abre ventana de edit
  const handleEditPdf = () => {
    localStorage.setItem(
      "cotizacion_pdf_editor",
      JSON.stringify(previewCotizacion),
    );

    if (onClose) onClose();

    navigate(
      location.pathname.startsWith("/reservas/")
        ? "/reservas/cotizaciones/viewPDF"
        : "/ventas/cotizaciones/viewPDF",
    );
  };
  // No renderizar si no hay info_pdf
  if (!diasInfoPdf.length) return null;

  return (
    <div className="pdf-preview-modal-overlay" onClick={onClose}>
      <div
        className="pdf-preview-modal"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="pdf-preview-header">
          <div className="header-left">
            <img
              src="/brand/logo-principal-blanco.webp"
              alt="Venso Tours"
              className="pdf-preview-brand-logo"
            />
            <div className="pdf-preview-brand-copy">
              <span className="pdf-preview-eyebrow">DISEÑO VENSO · CANVA</span>
              <h2>Vista previa de cotización</h2>
              <span className="page-info">
                {cotizacion?.titulo || `Cotización #${cotizacion?.id || "---"}`}
              </span>
            </div>
          </div>
          {hotelCategoryOptions.length > 0 && (
            <div className="hpp-header-actions pdf-hotel-filter-actions">
              <div className="hpp-filter-chips pdf-hotel-filter-chips pdf-hotel-filter-chips--preview">
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
          <button
            className="close-button"
            onClick={onClose}
            title="Cerrar (ESC)"
          >
            <MdClose size={24} />
          </button>
        </div>

        {/* Body: Nav izquierda + Páginas + Descarga derecha */}
        <div className="pdf-preview-body">
          {/* Sidebar navegación */}
          <div className="navigation-sidebar">
            <span className="sidebar-eyebrow">PÁGINAS</span>
            <button
              className="nav-btn"
              onClick={goToFirstPage}
              disabled={currentPage <= 1}
              title="Primera página"
            >
              <MdFirstPage size={22} />
            </button>
            <button
              className="nav-btn"
              onClick={goToPrevPage}
              disabled={currentPage <= 1}
              title="Página anterior (↑)"
            >
              <MdKeyboardArrowUp size={28} />
            </button>

            <div className="page-indicator">
              <span className="current-page">{currentPage}</span>
              <span className="separator">/</span>
              <span className="total-pages">{totalPages}</span>
            </div>

            <button
              className="nav-btn"
              onClick={goToNextPage}
              disabled={currentPage >= totalPages}
              title="Página siguiente (↓)"
            >
              <MdKeyboardArrowDown size={28} />
            </button>
            <button
              className="nav-btn"
              onClick={goToLastPage}
              disabled={currentPage >= totalPages}
              title="Última página"
            >
              <MdLastPage size={22} />
            </button>
          </div>

          {/* Contenido scrollable con las páginas */}
          <div className="pdf-preview-content" ref={scrollRef}>
            <PdfPages
              cotizacion={previewCotizacion}
              imagenesEditor={previewImagenesEditor}
              excelPreviewCategories={excelPreviewCategories}
              referenceImages={referenceImages}
              forceLoadImages={previewImagesHydrated}
            />
          </div>

          {/* Sidebar descarga y editarPDF */}
          <div className="download-sidebar">
            <span className="sidebar-eyebrow">ACCIONES</span>
            <button
              className="download-button"
              onClick={handleDownloadPdf}
              disabled={downloading || downloadingWord || !previewImagesReady}
              title={
                previewImagesReady
                  ? "Descargar PDF"
                  : "Esperando imágenes del PDF"
              }
            >
              <MdFileDownload size={24} />
              <span>
                {downloading
                  ? "Generando..."
                  : previewImagesReady
                    ? "Descargar"
                    : "Cargando imágenes..."}
              </span>
            </button>
            <button
              className="download-button word"
              onClick={handleDownloadWord}
              disabled={downloading || downloadingWord || !previewImagesReady}
              title="Descargar el mismo documento en Word"
            >
              <MdDescription size={24} />
              <span>{downloadingWord ? "Generando Word..." : "Word"}</span>
            </button>
            <button
              className="download-button"
              onClick={handleEditPdf}
              title="Editar PDF"
            >
              <MdEditSquare size={24} />
              <span>Editar contenido</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PdfPreviewModal;
