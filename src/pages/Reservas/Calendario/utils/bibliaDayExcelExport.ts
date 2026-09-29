import ExcelJS from "exceljs";
import type { BibliaActivity } from "./bibliaActivityMapper";
import {
  getBibliaExcelCellColor,
  getBibliaExcelRichText,
  normalizeBibliaColor,
} from "./bibliaActivityMapper";
import { BIBLIA_SHEET_COLUMNS, buildBibliaDayExportMatrix } from "./bibliaDayJpegExport";

const EXCEL_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const THIN_BORDER = { style: "thin" as const, color: { argb: "FFCFD4DA" } };

const COLUMN_WIDTHS: Record<string, number> = {
  dateKey: 14,
  file: 16,
  reservationName: 31,
  pax: 10,
  nationality: 14,
  language: 15,
  serviceMode: 19,
  time: 13,
  excursion: 37,
  hotelCusco: 28,
  tickets: 28,
  hotelValle: 28,
  hotelMapi: 28,
  restaurant: 28,
  endorse: 24,
  transport: 26,
  guide: 26,
  trainOutbound: 43,
  trainReturn: 43,
  observations: 34,
  incidents: 34,
  counter: 19,
  agency: 29,
};

const toArgb = (color: string) => `FF${normalizeBibliaColor(color).slice(1)}`;

const getReadableTextArgb = (color: string) => {
  const hex = normalizeBibliaColor(color).slice(1);
  const [red, green, blue] = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance < 0.52 ? "FFFFFFFF" : "FF1F2937";
};

const columnName = (column: number) => {
  let remaining = column;
  let name = "";
  while (remaining > 0) {
    const digit = (remaining - 1) % 26;
    name = String.fromCharCode(65 + digit) + name;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return name;
};

const estimateRowHeight = (activity: BibliaActivity) => {
  const longestCell = BIBLIA_SHEET_COLUMNS.reduce((longest, [field]) => Math.max(longest, String(activity[field] ?? "").length), 0);
  return Math.max(24, Math.min(72, 18 + Math.ceil(longestCell / 42) * 14));
};

export const buildBibliaDayExcelFilename = (dateKey: string) =>
  `biblia_actividades_${String(dateKey || "dia").replace(/[^0-9a-z_-]+/gi, "_")}.xlsx`;

export const buildBibliaMonthExcelFilename = (date: Date) =>
  `biblia_actividades_${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}.xlsx`;

const createWorkbook = () => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Venso Tours";
  workbook.created = new Date();
  workbook.modified = new Date();
  return workbook;
};

const addBibliaDayExcelWorksheet = ({
  workbook,
  date,
  activities,
  sheetName,
}: {
  workbook: ExcelJS.Workbook;
  date: Date;
  activities: BibliaActivity[];
  sheetName?: string;
}) => {
  if (!activities.length) throw new Error("No hay actividades para exportar en este día.");

  const dateKey = activities[0]?.dateKey || date.toISOString().slice(0, 10);
  const worksheet = workbook.addWorksheet((sheetName || `Biblia ${dateKey}`).slice(0, 31));
  const matrix = buildBibliaDayExportMatrix(activities);
  const lastColumn = columnName(BIBLIA_SHEET_COLUMNS.length);

  worksheet.columns = BIBLIA_SHEET_COLUMNS.map(([field]) => ({ width: COLUMN_WIDTHS[field] || 22 }));
  worksheet.views = [{ state: "frozen", ySplit: 3, showGridLines: false }];
  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: false,
  };
  worksheet.properties.defaultRowHeight = 22;

  worksheet.mergeCells(`A1:${lastColumn}1`);
  const title = worksheet.getCell("A1");
  title.value = "BIBLIA DE ACTIVIDADES";
  title.font = { name: "Arial", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111111" } };
  title.alignment = { horizontal: "left", vertical: "middle" };
  worksheet.getRow(1).height = 34;

  worksheet.mergeCells(`A2:${lastColumn}2`);
  const subtitle = worksheet.getCell("A2");
  const longDate = new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
  subtitle.value = `${longDate} · ${activities.length} registros · VENSO TOURS - OPERACIONES`;
  subtitle.font = { name: "Arial", size: 11, bold: true, color: { argb: "FF4B5563" } };
  subtitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F7F8" } };
  subtitle.alignment = { horizontal: "left", vertical: "middle" };
  worksheet.getRow(2).height = 24;

  const headerRow = worksheet.addRow(matrix.headers);
  headerRow.height = 36;
  headerRow.eachCell((cell, index) => {
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: index === 1 ? "FFFF007E" : "FF151515" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER };
  });

  activities.forEach((activity, activityIndex) => {
    const row = worksheet.addRow(matrix.rows[activityIndex]);
    row.height = estimateRowHeight(activity);
    row.eachCell((cell, columnIndex) => {
      const [field] = BIBLIA_SHEET_COLUMNS[columnIndex - 1];
      const cellColor = getBibliaExcelCellColor(activity, field);
      const richText = getBibliaExcelRichText(activity, field);
      cell.font = { name: "Arial", size: 10, color: { argb: getReadableTextArgb(cellColor) } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: toArgb(cellColor) } };
      cell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
      cell.border = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER };
      if (richText) {
        cell.value = {
          richText: richText.map((run) => ({
            text: run.text,
            ...(run.font ? {
              font: {
                ...(run.font.name ? { name: run.font.name } : {}),
                ...(run.font.size ? { size: run.font.size } : {}),
                ...(run.font.bold !== undefined ? { bold: run.font.bold } : {}),
                ...(run.font.italic !== undefined ? { italic: run.font.italic } : {}),
                ...(run.font.color ? { color: { argb: toArgb(run.font.color) } } : {}),
              },
            } : {}),
          })),
        };
      }
    });
    row.getCell(4).alignment = { horizontal: "center", vertical: "top", wrapText: true };
  });

  worksheet.autoFilter = { from: "A3", to: `${lastColumn}${activities.length + 3}` };

  return worksheet;
};

export const createBibliaDayExcelWorkbook = ({
  date,
  activities,
}: {
  date: Date;
  activities: BibliaActivity[];
}) => {
  const workbook = createWorkbook();
  const dateKey = activities[0]?.dateKey || date.toISOString().slice(0, 10);
  const worksheet = addBibliaDayExcelWorksheet({ workbook, date, activities });
  return { workbook, worksheet, filename: buildBibliaDayExcelFilename(dateKey) };
};

export const createBibliaMonthExcelWorkbook = ({
  month,
  activities,
}: {
  month: Date;
  activities: BibliaActivity[];
}) => {
  const grouped = new Map<string, BibliaActivity[]>();
  activities.forEach((activity) => {
    if (activity.date.getFullYear() !== month.getFullYear() || activity.date.getMonth() !== month.getMonth()) return;
    grouped.set(activity.dateKey, [...(grouped.get(activity.dateKey) || []), activity]);
  });
  if (!grouped.size) throw new Error("No hay actividades para exportar en este mes.");

  const workbook = createWorkbook();
  const worksheets = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dateKey, dayActivities]) => {
      const [year, monthNumber, day] = dateKey.split("-").map(Number);
      const date = new Date(year, monthNumber - 1, day);
      const ordered = [...dayActivities].sort((left, right) => left.order - right.order || left.time.localeCompare(right.time, "es", { numeric: true }));
      return addBibliaDayExcelWorksheet({
        workbook,
        date,
        activities: ordered,
        sheetName: `Biblia ${dateKey}`,
      });
    });

  return { workbook, worksheets, filename: buildBibliaMonthExcelFilename(month) };
};

export const downloadBibliaDayExcel = async (params: { date: Date; activities: BibliaActivity[] }) => {
  if (typeof document === "undefined") throw new Error("La descarga Excel requiere un navegador.");

  const { workbook, filename } = createBibliaDayExcelWorkbook(params);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: EXCEL_MIME_TYPE });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 750);
  }
  return { blob, filename };
};

export const downloadBibliaMonthExcel = async (params: { month: Date; activities: BibliaActivity[] }) => {
  if (typeof document === "undefined") throw new Error("La descarga Excel requiere un navegador.");

  const { workbook, filename } = createBibliaMonthExcelWorkbook(params);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: EXCEL_MIME_TYPE });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 750);
  }
  return { blob, filename };
};
