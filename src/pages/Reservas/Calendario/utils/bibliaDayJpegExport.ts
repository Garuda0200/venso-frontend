import type { BibliaActivity } from "./bibliaActivityMapper";
import { BIBLIA_EMPTY_VALUE, getBibliaExcelCellColor, normalizeBibliaColor } from "./bibliaActivityMapper";
import { compactBibliaTrainText } from "./bibliaTrainCatalog";

export const BIBLIA_SHEET_COLUMNS: Array<[keyof BibliaActivity, string]> = [
  ["dateKey", "FECHA"], ["file", "FILE"], ["reservationName", "NOMBRE DE LA RESERVA"],
  ["pax", "N° PAX"], ["nationality", "NAC."], ["language", "IDIOMA"],
  ["serviceMode", "TIPO DE SERVICIO"], ["time", "HORA"], ["excursion", "EXCURSION"],
  ["hotelCusco", "HOTEL CUSCO"], ["tickets", "INGRESOS"], ["hotelValle", "HOTEL VALLE"],
  ["hotelMapi", "HOTEL MAPI"], ["restaurant", "RESTAURANTE"], ["endorse", "ENDOSE"],
  ["transport", "TRANSPORTE"], ["guide", "GUIA TRASLADISTA"], ["trainOutbound", "TREN IDA"],
  ["trainReturn", "TREN RETORNO"], ["observations", "OBSERVACIONES"], ["incidents", "INCIDENCIAS"],
  ["counter", "COUNTER"], ["agency", "NOMBRE DE AGENCIA"],
];

const COLUMN_WIDTHS: Partial<Record<keyof BibliaActivity, number>> = {
  dateKey: 145,
  file: 150,
  reservationName: 300,
  pax: 90,
  nationality: 120,
  language: 135,
  serviceMode: 175,
  time: 110,
  excursion: 340,
  hotelCusco: 235,
  tickets: 235,
  hotelValle: 235,
  hotelMapi: 235,
  restaurant: 235,
  endorse: 210,
  transport: 220,
  guide: 220,
  trainOutbound: 390,
  trainReturn: 390,
  observations: 300,
  incidents: 300,
  counter: 160,
  agency: 235,
};

const valueForExport = (value: unknown, field?: keyof BibliaActivity) => {
  // La distribución detallada de nacionalidad es operativa: solo se gestiona
  // desde la edición de Biblia y no acompaña documentos ni capturas.
  if (field === "nationality") return "—";
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === BIBLIA_EMPTY_VALUE) return "—";
  return field === "trainOutbound" || field === "trainReturn"
    ? compactBibliaTrainText(normalized)
    : normalized;
};

export const buildBibliaDayExportMatrix = (activities: BibliaActivity[]) => ({
  headers: BIBLIA_SHEET_COLUMNS.map(([, label]) => label),
  rows: (Array.isArray(activities) ? activities : []).map((activity) =>
    BIBLIA_SHEET_COLUMNS.map(([field]) => valueForExport(activity[field], field)),
  ),
});

export const buildBibliaDayJpegFilename = (dateKey: string) =>
  `biblia_actividades_${String(dateKey || "dia").replace(/[^0-9a-z_-]+/gi, "_")}.jpg`;

const getReadableTextColor = (color: string) => {
  const hex = normalizeBibliaColor(color).slice(1);
  const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const luminance = (0.299 * channels[0] + 0.587 * channels[1] + 0.114 * channels[2]) / 255;
  return luminance < 0.52 ? "#FFFFFF" : "#20242A";
};

const wrapCanvasText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const source = valueForExport(text);
  const words = source.split(/\s+/).filter(Boolean);
  if (!words.length) return ["—"];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["—"];
};

export const renderBibliaDayJpegBlob = async ({
  date,
  activities,
  quality = 0.9,
}: {
  date: Date;
  activities: BibliaActivity[];
  quality?: number;
}): Promise<{ blob: Blob; width: number; height: number; filename: string }> => {
  if (typeof document === "undefined") throw new Error("La descarga JPG requiere un navegador.");
  if (!activities.length) throw new Error("No hay actividades para exportar en este día.");

  const dateKey = activities[0]?.dateKey || date.toISOString().slice(0, 10);
  const padding = 36;
  const titleHeight = 96;
  const headerHeight = 74;
  const fontSize = 19;
  const lineHeight = 25;
  const cellPaddingX = 10;
  const cellPaddingY = 9;
  const widths = BIBLIA_SHEET_COLUMNS.map(([field]) => COLUMN_WIDTHS[field] || 190);
  const tableWidth = widths.reduce((sum, width) => sum + width, 0);
  const canvasWidth = tableWidth + padding * 2;

  const measurementCanvas = document.createElement("canvas");
  const measurementCtx = measurementCanvas.getContext("2d");
  if (!measurementCtx) throw new Error("No se pudo iniciar el exportador JPG.");
  measurementCtx.font = `600 ${fontSize}px Arial, sans-serif`;

  const rows = activities.map((activity) => {
    const cells = BIBLIA_SHEET_COLUMNS.map(([field], index) =>
      wrapCanvasText(measurementCtx, valueForExport(activity[field], field), widths[index] - cellPaddingX * 2),
    );
    const maxLines = Math.max(1, ...cells.map((cell) => cell.length));
    return { activity, cells, height: Math.max(48, maxLines * lineHeight + cellPaddingY * 2) };
  });

  const tableHeight = headerHeight + rows.reduce((sum, row) => sum + row.height, 0);
  const canvasHeight = titleHeight + tableHeight + padding * 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("No se pudo preparar el lienzo JPG.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.fillStyle = "#111111";
  ctx.font = "800 30px Arial, sans-serif";
  ctx.fillText("BIBLIA DE ACTIVIDADES", padding, padding + 32);
  ctx.fillStyle = "#ff007e";
  ctx.fillRect(padding, padding + 45, 180, 5);
  ctx.fillStyle = "#4b5563";
  ctx.font = "600 18px Arial, sans-serif";
  const longDate = new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
  ctx.fillText(`${longDate} · ${activities.length} registros`, padding + 205, padding + 51);

  let y = padding + titleHeight;
  let x = padding;
  ctx.font = "800 17px Arial, sans-serif";
  BIBLIA_SHEET_COLUMNS.forEach(([, label], index) => {
    ctx.fillStyle = index === 0 ? "#ff007e" : "#151515";
    ctx.fillRect(x, y, widths[index], headerHeight);
    ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(x, y, widths[index], headerHeight);
    ctx.fillStyle = "#ffffff";
    const lines = wrapCanvasText(ctx, label, widths[index] - 18);
    lines.slice(0, 2).forEach((line, lineIndex) => {
      ctx.fillText(line, x + 9, y + 26 + lineIndex * 22);
    });
    x += widths[index];
  });
  y += headerHeight;

  ctx.font = `600 ${fontSize}px Arial, sans-serif`;
  rows.forEach(({ activity, cells, height }) => {
    x = padding;
    cells.forEach((lines, index) => {
      const [field] = BIBLIA_SHEET_COLUMNS[index];
      const cellColor = getBibliaExcelCellColor(activity, field);
      ctx.fillStyle = cellColor;
      ctx.fillRect(x, y, widths[index], height);
      ctx.strokeStyle = "#cfd4da";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, widths[index], height);
      ctx.fillStyle = getReadableTextColor(cellColor);
      lines.forEach((line, lineIndex) => {
        ctx.fillText(line, x + cellPaddingX, y + cellPaddingY + fontSize + lineIndex * lineHeight);
      });
      x += widths[index];
    });
    y += height;
  });

  ctx.fillStyle = "#111111";
  ctx.fillRect(canvasWidth - padding - 245, 20, 245, 45);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 17px Arial, sans-serif";
  ctx.fillText("VENSO TOURS · OPERACIONES", canvasWidth - padding - 225, 49);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("No se pudo convertir la Biblia a JPG."))),
      "image/jpeg",
      Math.min(0.96, Math.max(0.72, quality)),
    );
  });

  return { blob, width: canvasWidth, height: canvasHeight, filename: buildBibliaDayJpegFilename(dateKey) };
};

export const downloadBibliaDayJpeg = async (params: {
  date: Date;
  activities: BibliaActivity[];
  quality?: number;
}) => {
  const rendered = await renderBibliaDayJpegBlob(params);
  const url = URL.createObjectURL(rendered.blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = rendered.filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 750);
  }
  return rendered;
};
