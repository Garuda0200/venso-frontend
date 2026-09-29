import { toJpeg } from "html-to-image";
import { PDFDocument } from "pdf-lib";
import {
  buildDocxFromPageCaptures,
  dataUrlToBytes,
  downloadBrowserBlob,
  type PageImageCapture,
} from "../../../../utils/pageImageDocumentExport";
import { normalizePreLiquidacion } from "./preliquidacion";

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const PRELIQ_CAPTURE_PIXEL_RATIO = 1.2;
const PRELIQ_CAPTURE_QUALITY = 0.94;
const PRELIQ_CACHE_LIMIT = 4;

type ExportCacheEntry = {
  createdAt: number;
  captures?: PageImageCapture[];
  capturePromise?: Promise<PageImageCapture[]>;
  pdfBlob?: Blob;
  wordBlob?: Blob;
};

const exportCache = new Map<string, ExportCacheEntry>();

const safeFilename = (value: unknown) =>
  String(value || "preliquidacion")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120) || "preliquidacion";

const hashText = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export const getPreLiquidacionExportFingerprint = (value: unknown) =>
  hashText(JSON.stringify(normalizePreLiquidacion(value)));

const pruneCache = () => {
  if (exportCache.size <= PRELIQ_CACHE_LIMIT) return;
  const oldest = [...exportCache.entries()].sort(
    (a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0),
  )[0]?.[0];
  if (oldest) exportCache.delete(oldest);
};

const waitForImages = async (root: HTMLElement) => {
  const images = Array.from(root.querySelectorAll("img"));
  if (!images.length) return;
  await Promise.all(
    images.map(async (image) => {
      if (image.complete && image.naturalWidth > 0) {
        try {
          await image.decode?.();
        } catch {
          // already usable
        }
        return;
      }
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        image.addEventListener("load", done, { once: true });
        image.addEventListener("error", done, { once: true });
        setTimeout(done, 1500);
      });
    }),
  );
};

const normalizePages = (pageElements: unknown): HTMLElement[] => {
  const value = typeof pageElements === "function" ? pageElements() : pageElements;
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean) as HTMLElement[];
  if (typeof NodeList !== "undefined" && value instanceof NodeList) {
    return Array.from(value).filter(Boolean) as HTMLElement[];
  }
  return [value as HTMLElement].filter(Boolean);
};

export const capturePreLiquidacionPages = async (
  pageElements: unknown,
): Promise<PageImageCapture[]> => {
  const pages = normalizePages(pageElements);
  if (!pages.length) throw new Error("No hay páginas de preliquidación para exportar");

  await Promise.all(pages.map(waitForImages));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  return Promise.all(
    pages.map(async (page) => ({
      dataUrl: await toJpeg(page, {
        quality: PRELIQ_CAPTURE_QUALITY,
        pixelRatio: PRELIQ_CAPTURE_PIXEL_RATIO,
        cacheBust: false,
        backgroundColor: "#ffffff",
        includeQueryParams: true,
        fetchRequestInit: { cache: "force-cache" },
        style: {
          transform: "none",
          boxShadow: "none",
          margin: "0",
        },
      }),
      format: "jpeg" as const,
      layout: { pdfWidth: A4_WIDTH_PT, pdfHeight: A4_HEIGHT_PT },
    })),
  );
};

export const buildPdfFromPageCaptures = async (captures: PageImageCapture[]) => {
  if (!captures.length) throw new Error("No hay páginas para generar PDF");
  const pdf = await PDFDocument.create();
  for (const capture of captures) {
    const bytes = dataUrlToBytes(capture.dataUrl);
    const image = /^data:image\/png/i.test(capture.dataUrl)
      ? await pdf.embedPng(bytes)
      : await pdf.embedJpg(bytes);
    const width = Number(capture.layout?.pdfWidth || A4_WIDTH_PT);
    const height = Number(capture.layout?.pdfHeight || A4_HEIGHT_PT);
    const page = pdf.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
  }
  return new Blob([await pdf.save({ useObjectStreams: true })], {
    type: "application/pdf",
  });
};

const resolveCaptures = async (data: unknown, pageElements: unknown) => {
  const key = getPreLiquidacionExportFingerprint(data);
  const cached = exportCache.get(key);
  if (cached?.captures) return { key, captures: cached.captures };
  if (cached?.capturePromise) return { key, captures: await cached.capturePromise };

  const capturePromise = capturePreLiquidacionPages(pageElements);
  exportCache.set(key, { createdAt: Date.now(), capturePromise });
  pruneCache();
  try {
    const captures = await capturePromise;
    exportCache.set(key, { ...exportCache.get(key), createdAt: Date.now(), captures });
    return { key, captures };
  } catch (error) {
    exportCache.delete(key);
    throw error;
  }
};

export const preparePreLiquidacionExports = async (data: unknown, pageElements: unknown) => {
  const normalized = normalizePreLiquidacion(data);
  const { key, captures } = await resolveCaptures(normalized, pageElements);
  const cached = exportCache.get(key) || { createdAt: Date.now(), captures };
  // Precalentamos solo el PDF. Es la descarga más frecuente y evita dedicar CPU/memoria
  // a crear DOCX mientras el usuario todavía está editando. Word reutiliza estas mismas
  // capturas y se arma en milisegundos cuando se solicita.
  const pdfBlob = cached.pdfBlob || (await buildPdfFromPageCaptures(captures));
  exportCache.set(key, { ...cached, createdAt: Date.now(), captures, pdfBlob });
  pruneCache();
  return { pdfBlob, captures };
};

export const exportPreLiquidacionPdf = async (data: unknown, pageElements: unknown) => {
  const normalized = normalizePreLiquidacion(data);
  const key = getPreLiquidacionExportFingerprint(normalized);
  const cached = exportCache.get(key);
  const pdfBlob = cached?.pdfBlob
    ? cached.pdfBlob
    : (await preparePreLiquidacionExports(normalized, pageElements)).pdfBlob;
  downloadBrowserBlob(pdfBlob, `${safeFilename(`Preliquidacion ${normalized.code || normalized.program}`)}.pdf`);
};

export const exportPreLiquidacionWord = async (data: unknown, pageElements: unknown) => {
  const normalized = normalizePreLiquidacion(data);
  const key = getPreLiquidacionExportFingerprint(normalized);
  const cached = exportCache.get(key);
  let wordBlob = cached?.wordBlob;
  if (!wordBlob) {
    const captures = cached?.captures?.length
      ? cached.captures
      : (await resolveCaptures(normalized, pageElements)).captures;
    wordBlob = buildDocxFromPageCaptures(captures, {
      title: `Preliquidación ${normalized.code || normalized.program || "Venso Tours"}`,
    });
    exportCache.set(key, {
      ...(exportCache.get(key) || { createdAt: Date.now() }),
      createdAt: Date.now(),
      captures,
      wordBlob,
    });
    pruneCache();
  }
  downloadBrowserBlob(wordBlob, `${safeFilename(`Preliquidacion ${normalized.code || normalized.program}`)}.docx`);
};

export const __clearPreLiquidacionExportCacheForTests = () => exportCache.clear();
