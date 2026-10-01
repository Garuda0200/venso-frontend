import React, { Fragment, useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  FaChevronDown,
  FaChevronUp,
  FaFileExcel,
  FaPrint,
} from "react-icons/fa";
import Modal from "../UI/Modal/Modal";
import * as cotizacionService from "../../pages/Ventas/Cotizaciones/hooks/cotizacionService";
import { getAgencyById } from "../../services/agencyService";
import axiosInstance from "../../utils/axiosInstance";
import { BRAND } from "../../config/brand";
import {
  buildAgencyPaymentRows,
  buildProviderPaymentGroups,
  groupPaymentRowsByDay,
  normalizeCurrency,
  roundMoney,
} from "../../pages/Contabilidad/Reportes/utils/paymentReportUtils";
import "./AgencyPaymentReportModal.scss";
import TicketPaymentBreakdown from "./shared/TicketPaymentBreakdown";
import {
  groupPaymentServiceSections,
  ticketPaymentDetailText,
  ticketPaymentTariffs,
} from "../../pages/Contabilidad/Reportes/utils/ticketPaymentPresentation";

interface AgencyPaymentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  cotizacionId?: string | number | null;
  voucherCode?: string | null;
  initialCotizacion?: any;
}

const VENSO_CONTACT = {
  address: "Calle Matara 405 – Of. 201 – Cercado de Cusco",
  phones: "958 722 109 – 955 012 915",
  email: "vensotours@gmail.com",
  website: "www.vensotours.com",
};

const moneyLabel = (amount: number, currency: string) =>
  `${normalizeCurrency(currency) === "soles" ? "S/" : "US$"} ${Math.round(
    roundMoney(amount),
  ).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const sanitizeFileName = (value: unknown) =>
  String(value ?? "reporte")
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, "_")
    .replace(/^_+|_+$/g, "") || "reporte";

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const reportServiceHtml = (row: any, showName = true) =>
  `${showName ? `<strong>${escapeHtml(row.serviceName)}</strong>` : ""}${ticketPaymentDetailText(row)
    .split("\n").filter(Boolean).map((line) => `<small>${escapeHtml(line)}</small>`).join("")}`;

const getPrimaryColor = () => {
  if (typeof window === "undefined") return "#ff007e";
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue("--color-primary")
    .trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#ff007e";
};

const toExcelArgb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

const styleExcelTitle = (cell: any, primaryArgb: string) => {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: primaryArgb } };
  cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 14 };
  cell.alignment = { horizontal: "center", vertical: "middle" };
};

const styleExcelHeader = (row: any, primaryArgb: string) => {
  row.height = 24;
  row.eachCell((cell: any) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: primaryArgb } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: primaryArgb } },
      left: { style: "thin", color: { argb: "FFD1D5DB" } },
      bottom: { style: "thin", color: { argb: primaryArgb } },
      right: { style: "thin", color: { argb: "FFD1D5DB" } },
    };
  });
};

const formatDisplayDate = (value: string | null) => {
  if (!value) return "";
  const raw = String(value).slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : raw;
};

const getReportDateParts = () => {
  const now = new Date();
  return {
    day: String(now.getDate()).padStart(2, "0"),
    month: String(now.getMonth() + 1).padStart(2, "0"),
    year: String(now.getFullYear()).slice(-2),
  };
};

const getLeadPaxLabel = (quote: any, reportCode: unknown) => {
  const peopleDetails = quote?.peopleDetails ?? quote?.people_details ?? quote?.peopledetails ?? {};
  const adults = Array.isArray(peopleDetails?.adults) ? peopleDetails.adults : [];
  const firstAdult = adults[0] || {};
  const passengerName = [
    firstAdult?.nombres ?? firstAdult?.nombre ?? firstAdult?.firstName,
    firstAdult?.apellidos ?? firstAdult?.apellido ?? firstAdult?.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  return passengerName || String(quote?.titulo || reportCode || "PAX").trim();
};

const loadBrandLogoAsPngDataUrl = async (): Promise<string | null> => {
  if (typeof document === "undefined") return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const naturalWidth = image.naturalWidth || 900;
        const naturalHeight = image.naturalHeight || 320;
        const maxWidth = 720;
        const scale = Math.min(1, maxWidth / naturalWidth);
        canvas.width = Math.max(1, Math.round(naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) return resolve(null);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = BRAND.assets.logoColor;
  });
};

const requestStatusLabel = (status: string) => {
  if (status === "paid") return "PAGADO";
  if (status === "partial") return "PARCIAL";
  if (status === "pending") return "PENDIENTE";
  return "SIN SOLICITAR";
};

const AgencyPaymentReportModal: React.FC<AgencyPaymentReportModalProps> = ({
  isOpen,
  onClose,
  cotizacionId,
  voucherCode,
  initialCotizacion,
}) => {
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [agency, setAgency] = useState<any>(null);
  const [paymentRequests, setPaymentRequests] = useState<any[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      setExpandedRows(new Set());
      try {
        const id = cotizacionId ?? initialCotizacion?.id;
        if (!id) throw new Error("La cotización no tiene un identificador válido.");
        const fresh = await cotizacionService.getCotizacionById(String(id), {
          skipCache: true,
        });
        const agencyId = fresh?.agency_id ?? fresh?.agencyId;
        const resolvedAgency = agencyId ? await getAgencyById(Number(agencyId)) : null;
        let requests: any[] = [];
        if (resolvedAgency?.is_primary === true) {
          try {
            const response = await axiosInstance.get("/turismo/vouchers-reserva/payment-requests/all");
            const payload = response?.data?.data ?? response?.data ?? [];
            requests = Array.isArray(payload) ? payload : [];
          } catch (requestError) {
            console.warn("No se pudieron cargar estados de proveedor para el documento Venso:", requestError);
          }
        }
        if (!active) return;
        setQuote({ ...initialCotizacion, ...fresh });
        setAgency(resolvedAgency);
        setPaymentRequests(requests);
      } catch (loadError: any) {
        if (!active) return;
        console.error("Error cargando informativo de pago:", loadError);
        setError(loadError?.message || "No se pudo cargar el informativo de pago.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [cotizacionId, initialCotizacion, isOpen]);

  const isPrimaryAgency =
    agency?.is_primary === true || quote?.agency_is_primary === true || quote?.agencyIsPrimary === true;
  const agencyRows = useMemo(() => buildAgencyPaymentRows(quote, agency), [agency, quote]);
  const agencyDayGroups = useMemo(() => groupPaymentRowsByDay(agencyRows), [agencyRows]);
  const reportCode =
    voucherCode || quote?.voucher_codes?.[0] || quote?.voucher_code || quote?.id || "FILE";

  const agencyTotals = useMemo(() => {
    const result: Record<
      string,
      { base: number; administrative: number; fee: number; extra: number; additional: number; total: number }
    > = {};
    agencyRows.forEach((row) => {
      const currency = row.currency;
      result[currency] ||= {
        base: 0,
        administrative: 0,
        fee: 0,
        extra: 0,
        additional: 0,
        total: 0,
      };
      result[currency].base += row.commercialBaseTotal;
      result[currency].administrative += row.administrativeAmount;
      result[currency].fee += row.commissionAmount;
      result[currency].extra += row.extraAmount;
      result[currency].additional += row.additionalAmount;
      result[currency].total += row.totalWithCommission;
    });
    Object.values(result).forEach((item) => {
      item.base = roundMoney(item.base);
      item.administrative = roundMoney(item.administrative);
      item.fee = roundMoney(item.fee);
      item.extra = roundMoney(item.extra);
      item.additional = roundMoney(item.additional);
      item.total = roundMoney(item.total);
    });
    return result;
  }, [agencyRows]);

  const providerGroups = useMemo(
    () =>
      isPrimaryAgency && quote
        ? buildProviderPaymentGroups(quote, agency, paymentRequests)
        : [],
    [agency, isPrimaryAgency, paymentRequests, quote],
  );

  const toggleRowDetail = (key: string) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const exportAgencyExcel = async () => {
    if (!quote || agencyRows.length === 0) return;
    const workbook = new ExcelJS.Workbook();
    const primaryArgb = toExcelArgb(getPrimaryColor());

    const summary = workbook.addWorksheet("RESUMEN");
    summary.columns = [
      { key: "field", width: 28 },
      { key: "value", width: 42 },
      { key: "currency", width: 13 },
      { key: "total", width: 20 },
    ];
    summary.mergeCells("A1:D1");
    summary.getCell("A1").value = "RESUMEN · PAGO DE AGENCIA";
    styleExcelTitle(summary.getCell("A1"), primaryArgb);
    summary.getRow(1).height = 28;
    summary.addRow({ field: "FILE", value: reportCode });
    summary.addRow({ field: "AGENCIA", value: agency?.name || "Agencia" });
    summary.addRow({ field: "COTIZACIÓN", value: quote?.titulo || quote?.id });
    summary.addRow({ field: "PAX", value: quote?.cantidadpersonas || 1 });
    summary.addRow([]);
    const summaryHeader = summary.addRow(["", "TOTAL POR MONEDA", "MONEDA", "TOTAL AGENCIA"]);
    styleExcelHeader(summaryHeader, primaryArgb);
    Object.entries(agencyTotals).forEach(([currency, total]) => {
      summary.addRow({
        currency: currency === "soles" ? "PEN" : "USD",
        total: total.total,
      });
    });
    summary.getColumn(4).numFmt = "#,##0";

    const ledger = workbook.addWorksheet("Ingresos&Gastos");
    ledger.columns = [
      { key: "day", width: 9 },
      { key: "date", width: 14 },
      { key: "file", width: 16 },
      { key: "agency", width: 24 },
      { key: "pax", width: 9 },
      { key: "provider", width: 28 },
      { key: "service", width: 36 },
      { key: "currency", width: 11 },
      { key: "unitAgency", width: 20 },
      { key: "total", width: 18 },
    ];
    ledger.mergeCells("A1:J1");
    ledger.getCell("A1").value = "INGRESOS & GASTOS · INFORMATIVO DE PAGO DE AGENCIA";
    styleExcelTitle(ledger.getCell("A1"), primaryArgb);
    ledger.getRow(1).height = 28;
    const ledgerHeader = ledger.getRow(3);
    ledgerHeader.values = [
      "DÍA",
      "FECHA",
      "FILE",
      "AGENCIA",
      "PAX",
      "PROVEEDOR",
      "SERVICIO",
      "MONEDA",
      "PRECIO / PAX AGENCIA",
      "TOTAL AGENCIA",
    ];
    styleExcelHeader(ledgerHeader, primaryArgb);
    agencyRows.forEach((row) => {
      ledger.addRow({
        day: `Día ${row.dayNumber}`,
        date: row.serviceDate || "",
        file: reportCode,
        agency: agency?.name || "Agencia",
        pax: row.pax,
        provider: row.providerName,
        service: [row.serviceName, ticketPaymentDetailText(row)].filter(Boolean).join("\n"),
        currency: row.currency === "soles" ? "PEN" : "USD",
        unitAgency: ticketPaymentTariffs(row).length > 1 ? "" : row.unitWithCommission,
        total: row.totalWithCommission,
      });
    });
    [9, 10].forEach((column) => {
      ledger.getColumn(column).numFmt = "#,##0";
    });
    ledger.views = [{ state: "frozen", ySplit: 3 }];

    const detailName = sanitizeFileName(String(reportCode)).slice(0, 31) || "LIQUIDACION";
    const sheet = workbook.addWorksheet(detailName);
    sheet.columns = [
      { key: "service", width: 42 },
      { key: "pax", width: 10 },
      { key: "currency", width: 11 },
      { key: "unitAgency", width: 22 },
      { key: "total", width: 20 },
    ];
    sheet.mergeCells("A1:E1");
    sheet.getCell("A1").value = "LIQUIDACIÓN DE SERVICIOS - PAGO DE AGENCIA";
    styleExcelTitle(sheet.getCell("A1"), primaryArgb);
    sheet.getRow(1).height = 28;
    sheet.mergeCells("A2:E2");
    sheet.getCell("A2").value = `FILE: ${reportCode} · AGENCIA: ${agency?.name || "Agencia"}`;
    sheet.mergeCells("A3:E3");
    sheet.getCell("A3").value = `COTIZACIÓN: ${quote?.titulo || quote?.id} · PAX: ${quote?.cantidadpersonas || 1}`;

    let cursor = 5;
    agencyDayGroups.forEach((dayGroup) => {
      sheet.mergeCells(`A${cursor}:E${cursor}`);
      const dayCell = sheet.getCell(`A${cursor}`);
      dayCell.value = `DÍA ${dayGroup.dayNumber} · ${dayGroup.dayTitle} · ${formatDisplayDate(dayGroup.serviceDate)}`;
      dayCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE6F2" } };
      dayCell.font = { bold: true, color: { argb: primaryArgb } };
      dayCell.alignment = { vertical: "middle" };
      cursor += 1;
      const header = sheet.getRow(cursor);
      header.values = ["SERVICIO", "PAX", "MONEDA", "PRECIO / PAX AGENCIA", "TOTAL AGENCIA"];
      styleExcelHeader(header, primaryArgb);
      cursor += 1;
      groupPaymentServiceSections(dayGroup.rows).forEach((section) => {
        if (section.isTicket) {
          sheet.mergeCells(`A${cursor}:E${cursor}`);
          sheet.getCell(`A${cursor}`).value = section.title;
          sheet.getCell(`A${cursor}`).font = { bold: true, color: { argb: primaryArgb } };
          cursor += 1;
        }
        section.rows.forEach((row) => {
        const current = sheet.getRow(cursor);
        current.values = [
          [section.isTicket ? "" : row.serviceName, ticketPaymentDetailText(row)].filter(Boolean).join("\n"),
          row.pax,
          row.currency === "soles" ? "PEN" : "USD",
          ticketPaymentTariffs(row).length > 1 ? "" : row.unitWithCommission,
          row.totalWithCommission,
        ];
        current.getCell(4).numFmt = "#,##0";
        current.getCell(5).numFmt = "#,##0";
        current.getCell(1).alignment = { wrapText: true, vertical: "middle" };
        current.height = Math.max(24, ticketPaymentTariffs(row).length * 30);
        cursor += 1;
        });
      });
      cursor += 1;
    });

    Object.entries(agencyTotals).forEach(([currency, total]) => {
      const row = sheet.getRow(cursor++);
      row.values = ["", "", `TOTAL ${currency === "soles" ? "PEN" : "USD"}`, "", total.total];
      row.font = { bold: true };
      row.getCell(5).numFmt = "#,##0";
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `Pago_Agencia_${sanitizeFileName(reportCode)}.xlsx`,
    );
  };

  const addVensoProviderSheet = async (
    workbook: ExcelJS.Workbook,
    provider: any,
    logoDataUrl: string | null,
  ) => {
    const primaryArgb = toExcelArgb(getPrimaryColor());
    const paleArgb = "FFFFE6F2";
    const rawName = sanitizeFileName(provider.providerName).slice(0, 24) || "Proveedor";
    let sheetName = rawName;
    let suffix = 2;
    while (workbook.getWorksheet(sheetName)) {
      sheetName = `${rawName.slice(0, 20)}-${suffix++}`;
    }
    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = [
      { width: 3 },
      { width: 14 },
      { width: 17 },
      { width: 9 },
      { width: 26 },
      { width: 34 },
      { width: 16 },
      { width: 16 },
      { width: 18 },
    ];

    if (logoDataUrl) {
      try {
        const logoId = workbook.addImage({ base64: logoDataUrl, extension: "png" } as any);
        sheet.addImage(logoId, { tl: { col: 1.15, row: 1.1 }, ext: { width: 215, height: 76 } });
      } catch (imageError) {
        console.warn("No se pudo incrustar el logo Venso en Excel:", imageError);
      }
    }

    sheet.mergeCells("F2:I2");
    sheet.getCell("F2").value = "DOCUMENTO DE COBRANZA";
    sheet.getCell("F2").font = { bold: true, size: 15, color: { argb: primaryArgb } };
    sheet.getCell("F2").alignment = { horizontal: "center" };
    [
      VENSO_CONTACT.address,
      `Telf.: ${VENSO_CONTACT.phones}`,
      `Email: ${VENSO_CONTACT.email}`,
      VENSO_CONTACT.website,
    ].forEach((value, index) => {
      sheet.mergeCells(`F${3 + index}:I${3 + index}`);
      sheet.getCell(`F${3 + index}`).value = value;
      sheet.getCell(`F${3 + index}`).alignment = { horizontal: "center" };
    });

    sheet.mergeCells("B8:F8");
    sheet.getCell("B8").value = provider.providerName;
    sheet.getCell("B8").font = { bold: true, size: 14 };
    sheet.mergeCells("B9:F9");
    sheet.getCell("B9").value = `FILE ${reportCode}`;
    sheet.getCell("B9").font = { color: { argb: "FF64748B" }, size: 10 };

    const parts = getReportDateParts();
    ["Día", "Mes", "Año"].forEach((label, index) => {
      const cell = sheet.getCell(8, 7 + index);
      cell.value = label;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: paleArgb } };
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center" };
      cell.border = {
        top: { style: "medium", color: { argb: primaryArgb } },
        bottom: { style: "medium", color: { argb: primaryArgb } },
        left: { style: "medium", color: { argb: primaryArgb } },
        right: { style: "medium", color: { argb: primaryArgb } },
      };
    });
    [parts.day, parts.month, parts.year].forEach((value, index) => {
      const cell = sheet.getCell(9, 7 + index);
      cell.value = value;
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center" };
      cell.border = {
        top: { style: "medium", color: { argb: primaryArgb } },
        bottom: { style: "medium", color: { argb: primaryArgb } },
        left: { style: "medium", color: { argb: primaryArgb } },
        right: { style: "medium", color: { argb: primaryArgb } },
      };
    });

    const headerRow = sheet.getRow(12);
    headerRow.values = ["", "FECHA", "FILE", "CANT", "PAX", "SERVICIO", "SOLES", "DÓLARES", "ESTADO"];
    for (let column = 2; column <= 9; column += 1) {
      const cell = headerRow.getCell(column);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: paleArgb } };
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "medium", color: { argb: primaryArgb } },
        bottom: { style: "medium", color: { argb: primaryArgb } },
        left: { style: "thin", color: { argb: primaryArgb } },
        right: { style: "thin", color: { argb: primaryArgb } },
      };
    }

    const leadPax = getLeadPaxLabel(quote, reportCode);
    let rowNumber = 13;
    provider.dayGroups.forEach((dayGroup: any) => {
      groupPaymentServiceSections(dayGroup.rows).forEach((section) => {
        if (section.isTicket) {
          sheet.mergeCells(`B${rowNumber}:I${rowNumber}`);
          sheet.getCell(`B${rowNumber}`).value = `Día ${dayGroup.dayNumber} · ${section.title}`;
          sheet.getCell(`B${rowNumber}`).font = { bold: true, color: { argb: primaryArgb } };
          rowNumber += 1;
        }
        section.rows.forEach((row: any) => {
      const excelRow = sheet.getRow(rowNumber++);
      excelRow.values = [
        "",
        formatDisplayDate(row.serviceDate),
        reportCode,
        row.pax,
        leadPax,
        [section.isTicket ? "" : `Día ${row.dayNumber} · ${row.serviceName}`, ticketPaymentDetailText(row)].filter(Boolean).join("\n"),
        row.currency === "soles" ? row.totalWithCommission : "",
        row.currency === "dolares" ? row.totalWithCommission : "",
        requestStatusLabel(row.requestSummary.status),
      ];
      for (let column = 2; column <= 9; column += 1) {
        const cell = excelRow.getCell(column);
        cell.border = {
          top: { style: "thin", color: { argb: primaryArgb } },
          bottom: { style: "thin", color: { argb: primaryArgb } },
          left: { style: "thin", color: { argb: primaryArgb } },
          right: { style: "thin", color: { argb: primaryArgb } },
        };
        cell.alignment = { vertical: "middle", wrapText: true };
      }
      excelRow.getCell(7).numFmt = '"S/" #,##0';
      excelRow.getCell(8).numFmt = '"US$" #,##0';
      excelRow.height = Math.max(25, ticketPaymentTariffs(row).length * 38);
        });
      });
    });

    const totalRow = sheet.getRow(rowNumber + 1);
    totalRow.values = [
      "",
      "",
      "",
      "",
      "",
      "TOTAL",
      provider.totals.soles.commercial || "",
      provider.totals.dolares.commercial || "",
      requestStatusLabel(provider.status),
    ];
    for (let column = 2; column <= 9; column += 1) {
      const cell = totalRow.getCell(column);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: paleArgb } };
      cell.font = { bold: true };
      cell.border = {
        top: { style: "medium", color: { argb: primaryArgb } },
        bottom: { style: "medium", color: { argb: primaryArgb } },
      };
    }
    totalRow.getCell(7).numFmt = '"S/" #,##0';
    totalRow.getCell(8).numFmt = '"US$" #,##0';

    sheet.mergeCells(`D${rowNumber + 4}:F${rowNumber + 4}`);
    const statusCell = sheet.getCell(`D${rowNumber + 4}`);
    statusCell.value = requestStatusLabel(provider.status);
    statusCell.font = { bold: true, size: 13, color: { argb: primaryArgb } };
    statusCell.alignment = { horizontal: "center" };
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    return sheet;
  };

  const exportVensoExcel = async () => {
    if (!quote || providerGroups.length === 0) return;
    const workbook = new ExcelJS.Workbook();
    const logoDataUrl = await loadBrandLogoAsPngDataUrl();
    for (const provider of providerGroups) {
      await addVensoProviderSheet(workbook, provider, logoDataUrl);
    }
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(
      new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      `Pagos_Venso_${sanitizeFileName(reportCode)}.xlsx`,
    );
  };

  const printAgencyReport = () => {
    if (!quote || agencyRows.length === 0) return;
    const popup = window.open("", "_blank", "width=1100,height=760");
    if (!popup) return;
    const daysHtml = agencyDayGroups
      .map(
        (dayGroup) => `<section class="day"><div class="day-head"><strong>DÍA ${dayGroup.dayNumber}</strong><span>${escapeHtml(dayGroup.dayTitle)} · ${escapeHtml(formatDisplayDate(dayGroup.serviceDate))}</span></div>
          <table><thead><tr><th>SERVICIO</th><th>PAX</th><th>MONEDA</th><th>PRECIO / PAX AGENCIA</th><th>TOTAL AGENCIA</th></tr></thead><tbody>${groupPaymentServiceSections(dayGroup.rows)
            .map((section) => `${section.isTicket ? `<tr><td colspan="5"><strong>${escapeHtml(section.title)}</strong></td></tr>` : ""}${section.rows.map(
              (row) => `<tr><td>${reportServiceHtml(row, !section.isTicket)}<small>${escapeHtml(row.providerName)}</small></td><td>${row.pax}</td><td>${row.currency === "soles" ? "PEN" : "USD"}</td><td>${ticketPaymentTariffs(row).length > 1 ? "Tarifas por pasajero" : moneyLabel(row.unitWithCommission, row.currency)}</td><td><strong>${moneyLabel(row.totalWithCommission, row.currency)}</strong></td></tr>`,
            ).join("")}`)
            .join("")}</tbody></table></section>`,
      )
      .join("");
    const totalHtml = Object.entries(agencyTotals)
      .map(
        ([currency, total]) => `<div class="total"><span>Total ${currency === "soles" ? "PEN" : "USD"}</span><strong>${moneyLabel(total.total, currency)}</strong></div>`,
      )
      .join("");
    const primaryColor = getPrimaryColor();
    popup.document.write(`<!doctype html><html><head><title>Pago de agencia ${escapeHtml(reportCode)}</title><style>
      body{font-family:Arial,sans-serif;color:#1f2937;padding:28px}.title{font-size:22px;margin:0;padding:12px 14px;color:#fff;background:${primaryColor}}.meta{margin:3px 0;color:#475569}.meta-block{border:1px solid #d1d5db;border-top:0;padding:12px 14px}.day{margin-top:18px}.day-head{display:flex;justify-content:space-between;gap:12px;padding:8px 10px;border-left:4px solid ${primaryColor};background:#fff3f8}.day-head strong{color:${primaryColor}}.day-head span{font-size:12px;color:#64748b}
      table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left}th{background:${primaryColor};color:#fff}td small{display:block;color:#64748b;margin-top:2px}tbody tr:nth-child(even){background:#f8fafc}
      .totals{margin-top:18px;margin-left:auto;max-width:360px}.total{display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid #cbd5e1}.total strong{color:${primaryColor}}
      @media print{body{padding:0}}
    </style></head><body>
      <h1 class="title">LIQUIDACIÓN DE SERVICIOS - PAGO DE AGENCIA</h1>
      <div class="meta-block"><p class="meta"><strong>FILE:</strong> ${escapeHtml(reportCode)}</p><p class="meta"><strong>AGENCIA:</strong> ${escapeHtml(agency?.name || "Agencia")}</p><p class="meta"><strong>COTIZACIÓN:</strong> ${escapeHtml(quote?.titulo || quote?.id)} · <strong>PAX:</strong> ${quote?.cantidadpersonas || 1}</p></div>
      ${daysHtml}<div class="totals">${totalHtml}</div><script>window.onload=()=>window.print();</script></body></html>`);
    popup.document.close();
  };

  const printVensoReport = () => {
    if (!quote || providerGroups.length === 0) return;
    const popup = window.open("", "_blank", "width=1180,height=820");
    if (!popup) return;
    const primaryColor = getPrimaryColor();
    const dateParts = getReportDateParts();
    const leadPax = getLeadPaxLabel(quote, reportCode);
    const documents = providerGroups
      .map((provider) => {
        const body = provider.dayGroups
          .map((dayGroup: any) => groupPaymentServiceSections(dayGroup.rows).map((section) =>
            `${section.isTicket ? `<tr><td colspan="8"><strong>Día ${dayGroup.dayNumber} · ${escapeHtml(section.title)}</strong></td></tr>` : ""}${section.rows.map(
              (row: any) => `<tr><td>${escapeHtml(formatDisplayDate(row.serviceDate))}</td><td>${escapeHtml(reportCode)}</td><td>${row.pax}</td><td>${escapeHtml(leadPax)}</td><td>${reportServiceHtml(row, !section.isTicket)}</td><td>${row.currency === "soles" ? moneyLabel(row.totalWithCommission, row.currency) : ""}</td><td>${row.currency === "dolares" ? moneyLabel(row.totalWithCommission, row.currency) : ""}</td><td>${requestStatusLabel(row.requestSummary.status)}</td></tr>`,
            ).join("")}`,
          ).join(""))
          .join("");
        return `<article class="kelly-doc"><header class="brand"><img src="${BRAND.assets.logoColor}" alt="${BRAND.name}"/><div class="contact"><strong>DOCUMENTO DE COBRANZA</strong><span>${VENSO_CONTACT.address}</span><span>Telf.: ${VENSO_CONTACT.phones}</span><span>Email: ${VENSO_CONTACT.email}</span><span>${VENSO_CONTACT.website}</span></div></header><div class="identity"><div><h2>${escapeHtml(provider.providerName)}</h2><small>FILE ${escapeHtml(reportCode)}</small></div><div class="date-box"><span>Día<b>${dateParts.day}</b></span><span>Mes<b>${dateParts.month}</b></span><span>Año<b>${dateParts.year}</b></span></div></div><table><thead><tr><th>FECHA</th><th>FILE</th><th>CANT</th><th>PAX</th><th>SERVICIO</th><th>SOLES</th><th>DÓLARES</th><th>ESTADO</th></tr></thead><tbody>${body}<tr class="total"><td colspan="5">TOTAL</td><td>${provider.totals.soles.commercial ? moneyLabel(provider.totals.soles.commercial, "soles") : ""}</td><td>${provider.totals.dolares.commercial ? moneyLabel(provider.totals.dolares.commercial, "dolares") : ""}</td><td>${requestStatusLabel(provider.status)}</td></tr></tbody></table><div class="status">${requestStatusLabel(provider.status)}</div></article>`;
      })
      .join("");
    popup.document.write(`<!doctype html><html><head><title>Pagos Venso ${escapeHtml(reportCode)}</title><style>
      *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111827;margin:0;padding:24px;background:#fff}.kelly-doc{page-break-after:always;padding:8px 10px 24px}.kelly-doc:last-child{page-break-after:auto}.brand{display:flex;justify-content:space-between;align-items:flex-start;min-height:105px;border-top:4px solid ${primaryColor};padding-top:10px}.brand img{width:225px;max-height:85px;object-fit:contain;object-position:left top}.contact{display:grid;text-align:center;gap:3px;font-size:12px}.contact strong{font-size:17px;color:${primaryColor};margin-bottom:4px}.identity{display:flex;justify-content:space-between;align-items:end;margin:18px 0 12px}.identity h2{margin:0 0 3px;font-size:18px}.identity small{color:#64748b}.date-box{display:grid;grid-template-columns:repeat(3,62px);border:2px solid ${primaryColor}}.date-box span{display:grid;text-align:center;padding:4px;border-right:1px solid ${primaryColor};background:#fff0f7;font-size:12px;font-weight:700}.date-box span:last-child{border-right:0}.date-box b{display:block;background:#fff;padding-top:4px;font-size:14px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid ${primaryColor};padding:7px 6px;text-align:left;vertical-align:top}th{background:#ffd8eb;text-align:center}.total td{font-weight:800;background:#ffe7f2}.total td:first-child{text-align:right}.status{text-align:center;margin-top:18px;font-weight:800;font-size:15px;color:${primaryColor}}@media print{body{padding:0}.kelly-doc{padding:0 0 18px}}
    </style></head><body>${documents}<script>window.onload=()=>window.print();</script></body></html>`);
    popup.document.close();
  };

  const activeRowCount = isPrimaryAgency
    ? providerGroups.reduce((sum, provider) => sum + provider.rows.length, 0)
    : agencyRows.length;
  const actions = [
    {
      label: "Imprimir / PDF",
      onClick: isPrimaryAgency ? printVensoReport : printAgencyReport,
      variant: "secondary",
      icon: <FaPrint />,
      disabled: loading || activeRowCount === 0,
    },
    {
      label: "Exportar Excel",
      onClick: isPrimaryAgency ? exportVensoExcel : exportAgencyExcel,
      variant: "success",
      icon: <FaFileExcel />,
      disabled: loading || activeRowCount === 0,
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isPrimaryAgency
          ? `Documento de cobranza Venso · ${reportCode}`
          : `Pago de agencia · ${reportCode}`
      }
      actions={actions}
      size="large"
      className="agency-payment-report-modal"
    >
      {loading ? (
        <div className="agency-payment-report__state">Cargando cotización completa…</div>
      ) : error ? (
        <div className="agency-payment-report__state agency-payment-report__state--error">{error}</div>
      ) : isPrimaryAgency ? (
        <div className="venso-payment-documents">
          {providerGroups.length === 0 ? (
            <div className="agency-payment-report__state">Esta cotización no contiene servicios de proveedores.</div>
          ) : (
            providerGroups.map((provider) => {
              const dateParts = getReportDateParts();
              const leadPax = getLeadPaxLabel(quote, reportCode);
              return (
                <article className="venso-kelly-document" key={provider.providerKey}>
                  <header className="venso-kelly-document__brand">
                    <img src={BRAND.assets.logoColor} alt={BRAND.name} />
                    <div>
                      <strong>DOCUMENTO DE COBRANZA</strong>
                      <span>{VENSO_CONTACT.address}</span>
                      <span>Telf.: {VENSO_CONTACT.phones}</span>
                      <span>Email: {VENSO_CONTACT.email}</span>
                      <span>{VENSO_CONTACT.website}</span>
                    </div>
                  </header>
                  <div className="venso-kelly-document__identity">
                    <div>
                      <h3>{provider.providerName}</h3>
                      <span>FILE {reportCode}</span>
                    </div>
                    <div className="venso-kelly-document__date-box" aria-label="Fecha del documento">
                      <span>Día<strong>{dateParts.day}</strong></span>
                      <span>Mes<strong>{dateParts.month}</strong></span>
                      <span>Año<strong>{dateParts.year}</strong></span>
                    </div>
                  </div>
                  <div className="venso-kelly-document__table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Fecha</th><th>File</th><th>Cant.</th><th>Pax</th><th>Servicio</th><th>Soles</th><th>Dólares</th><th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {provider.dayGroups.map((dayGroup: any) => (
                          <Fragment key={`${provider.providerKey}-day-${dayGroup.dayNumber}`}>
                            <tr className="venso-kelly-document__day-row">
                              <td colSpan={8}>Día {dayGroup.dayNumber} · {dayGroup.dayTitle} · {formatDisplayDate(dayGroup.serviceDate)}</td>
                            </tr>
                            {groupPaymentServiceSections(dayGroup.rows).map((section) => (
                              <Fragment key={section.key}>
                                {section.isTicket && <tr className="payment-ticket-section"><td colSpan={8}><strong>{section.title}</strong></td></tr>}
                                {section.rows.map((row: any, rowIndex: number) => (
                              <tr key={`${row.serviceId ?? rowIndex}-${row.serviceOrder}`}>
                                <td>{formatDisplayDate(row.serviceDate)}</td>
                                <td>{reportCode}</td>
                                <td>{row.pax}</td>
                                <td>{leadPax}</td>
                                <td>
                                  {!section.isTicket && <><strong>{row.serviceName}</strong><small>{row.serviceType}</small></>}
                                  <TicketPaymentBreakdown row={row} />
                                </td>
                                <td>{row.currency === "soles" ? moneyLabel(row.totalWithCommission, row.currency) : "—"}</td>
                                <td>{row.currency === "dolares" ? moneyLabel(row.totalWithCommission, row.currency) : "—"}</td>
                                <td><span className={`venso-payment-status venso-payment-status--${row.requestSummary.status}`}>{requestStatusLabel(row.requestSummary.status)}</span></td>
                              </tr>
                                ))}
                              </Fragment>
                            ))}
                          </Fragment>
                        ))}
                        <tr className="venso-kelly-document__total-row">
                          <td colSpan={5}>TOTAL</td>
                          <td>{provider.totals.soles.commercial ? moneyLabel(provider.totals.soles.commercial, "soles") : "—"}</td>
                          <td>{provider.totals.dolares.commercial ? moneyLabel(provider.totals.dolares.commercial, "dolares") : "—"}</td>
                          <td>{requestStatusLabel(provider.status)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className={`venso-kelly-document__status venso-kelly-document__status--${provider.status}`}>
                    {requestStatusLabel(provider.status)}
                  </div>
                </article>
              );
            })
          )}
        </div>
      ) : (
        <div className="agency-payment-report">
          <header className="agency-payment-report__header">
            <div>
              <span>LIQUIDACIÓN DE SERVICIOS</span>
              <h3>{agency?.name || "Agencia externa"}</h3>
              <p>{quote?.titulo || quote?.id}</p>
            </div>
            <div className="agency-payment-report__meta">
              <strong>{reportCode}</strong>
              <span>{quote?.cantidadpersonas || 1} pax</span>
              <span>Tarifa final de agencia por persona</span>
            </div>
          </header>

          <div className="agency-payment-report__days">
            {agencyDayGroups.map((dayGroup) => (
              <section className="agency-payment-report__day" key={`day-${dayGroup.dayNumber}`}>
                <header className="agency-payment-report__day-header">
                  <div><strong>Día {dayGroup.dayNumber}</strong><span>{dayGroup.dayTitle}</span></div>
                  <time>{formatDisplayDate(dayGroup.serviceDate)}</time>
                </header>
                <div className="agency-payment-report__table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Servicio</th><th>Pax</th><th>Moneda</th><th>Precio / pax agencia</th><th>Total agencia</th><th>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupPaymentServiceSections(dayGroup.rows).map((section) => (
                        <Fragment key={section.key}>
                          {section.isTicket && <tr className="payment-ticket-section"><td colSpan={6}><strong>{section.title}</strong></td></tr>}
                          {section.rows.map((row, index) => {
                        const rowKey = `${row.dayNumber}-${row.daySource}-${row.serviceId ?? index}-${row.serviceOrder}`;
                        const isExpanded = expandedRows.has(rowKey);
                        return (
                          <Fragment key={rowKey}>
                            <tr>
                              <td>
                                {!section.isTicket && <strong>{row.serviceName}</strong>}
                                <small>{row.providerName}</small>
                                <TicketPaymentBreakdown row={row} />
                              </td>
                              <td>{row.pax}</td>
                              <td>{row.currency === "soles" ? "PEN" : "USD"}</td>
                              <td className="agency-payment-report__agency-price"><strong>{ticketPaymentTariffs(row).length > 1 ? "Tarifas por pasajero" : moneyLabel(row.unitWithCommission, row.currency)}</strong></td>
                              <td><strong>{moneyLabel(row.totalWithCommission, row.currency)}</strong></td>
                              <td>
                                <button
                                  type="button"
                                  className={`agency-payment-report__detail-toggle ${isExpanded ? "active" : ""}`}
                                  onClick={() => toggleRowDetail(rowKey)}
                                  aria-expanded={isExpanded}
                                >
                                  {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
                                  {isExpanded ? "Ocultar" : "Ver detalle"}
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="agency-payment-report__detail-row">
                                <td colSpan={6}>
                                  <div className="agency-payment-report__detail-grid">
                                    <span>
                                      <small>{row.hasIgv ? "Precio servicio + IGV / pax" : "Precio servicio / pax"}</small>
                                      <strong>{moneyLabel(row.displayQuotedUnit, row.currency)}</strong>
                                    </span>
                                    {row.hasIgv && row.igvAmount > 0 && (
                                      <span><small>IGV incluido / pax</small><strong>{moneyLabel(row.displayIgvPerPerson, row.currency)}</strong></span>
                                    )}
                                    {row.administrativeAmount > 0 && (
                                      <span><small>Gastos adm. / pax</small><strong>{moneyLabel(row.displayAdministrativePerPerson, row.currency)}</strong></span>
                                    )}
                                    {row.commissionAmount > 0 && (
                                      <span><small>Fee / comisión / pax</small><strong>{moneyLabel(row.displayCommissionPerPerson, row.currency)}</strong></span>
                                    )}
                                    {row.extraAmount > 0 && (
                                      <span><small>Otros adicionales / pax</small><strong>{moneyLabel(row.displayExtraPerPerson, row.currency)}</strong></span>
                                    )}
                                    <span><small>Precio agencia / pax</small><strong>{moneyLabel(row.unitWithCommission, row.currency)}</strong></span>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                          })}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>

          <div className="agency-payment-report__totals">
            {Object.entries(agencyTotals).map(([currency, total]) => (
              <div key={currency}>
                <span>{currency === "soles" ? "Total PEN" : "Total USD"}</span>
                <small>{agencyRows.length} servicio(s) incluidos en el informativo</small>
                <strong>{moneyLabel(total.total, currency)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default AgencyPaymentReportModal;
