import React, { useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  FaBuilding,
  FaCheckCircle,
  FaFileExcel,
  FaFileInvoiceDollar,
  FaHourglassHalf,
  FaPrint,
  FaSearch,
} from "react-icons/fa";
import { toast } from "react-toastify";
import axiosInstance from "../../../utils/axiosInstance";
import contabilidadService from "../../../services/contabilidadService";
import { getAgencies, getPrimaryAgency } from "../../../services/agencyService";
import * as cotizacionService from "../../Ventas/Cotizaciones/hooks/cotizacionService";
import Modal from "../../../components/UI/Modal/Modal";
import TicketPaymentBreakdown from "../../../components/Contabilidad/shared/TicketPaymentBreakdown";
import { groupPaymentServiceSections, ticketPaymentDetailText } from "./utils/ticketPaymentPresentation";
import {
  flattenQuoteServices,
  normalizeCurrency,
  roundMoney,
  summarizeFileCollection,
  summarizeServiceRequests,
} from "./utils/paymentReportUtils";
import "./GestionPagosServicios.scss";

const extractArrayResponse = (response: any): any[] => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.data)) return response.data.data;
  return [];
};

const money = (amount: number, currency: string) =>
  `${normalizeCurrency(currency) === "soles" ? "S/" : "US$"} ${roundMoney(amount).toFixed(2)}`;

const escapeReportHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

const serviceDetailHtml = (row: any, showName: boolean) =>
  `${showName ? escapeReportHtml(row.serviceName) : ""}${ticketPaymentDetailText(row).split("\n")
    .filter(Boolean).map((line) => `<small style="display:block">${escapeReportHtml(line)}</small>`).join("")}`;

const startOfCurrentMonth = () => {
  const now = new Date();
  const value = new Date(now.getFullYear(), now.getMonth(), 1);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-01`;
};

const todayLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const sanitizeFileName = (value: unknown) =>
  String(value ?? "proveedor")
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, "_")
    .replace(/^_+|_+$/g, "") || "proveedor";

const statusLabel = (status: string) => {
  if (status === "paid") return "Pagado";
  if (status === "partial") return "Parcial";
  if (status === "pending") return "Pendiente";
  return "Sin solicitar";
};

const collectionLabel = (status: string, payerScope: string) => {
  const payer = payerScope === "agency" ? "agencia" : "cliente";
  if (status === "paid") return `Pagado por ${payer}`;
  if (status === "partial") return `Pago parcial de ${payer}`;
  return `Pendiente de ${payer}`;
};

export function GestionPagosServicios() {
  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [agencies, setAgencies] = useState<any[]>([]);
  const [primaryAgency, setPrimaryAgency] = useState<any>(null);
  const [dateFrom, setDateFrom] = useState(startOfCurrentMonth);
  const [dateTo, setDateTo] = useState(todayLocal);
  const [search, setSearch] = useState("");
  const [agencyMode, setAgencyMode] = useState("primary");
  const [selectedProvider, setSelectedProvider] = useState<any>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [quoteRows, requestsResponse, movementsResponse, agencyRows, primary] =
          await Promise.all([
            cotizacionService.getAllCotizaciones({ skipCache: true }),
            axiosInstance.get("/turismo/vouchers-reserva/payment-requests/all"),
            contabilidadService.getMovimientos().catch(() => ({ data: [] })),
            getAgencies(false),
            getPrimaryAgency(),
          ]);
        if (!active) return;
        setQuotes(Array.isArray(quoteRows) ? quoteRows : []);
        setRequests(requestsResponse?.data?.data || []);
        setMovements(extractArrayResponse(movementsResponse));
        setAgencies(Array.isArray(agencyRows) ? agencyRows : []);
        setPrimaryAgency(primary || null);
      } catch (error) {
        console.error("Error cargando reporte de proveedores:", error);
        toast.error("No se pudo cargar el reporte de pagos de proveedores");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const agencyMap = useMemo(
    () => new Map(agencies.map((agency) => [Number(agency.id), agency])),
    [agencies],
  );

  const requestsByService = useMemo(() => {
    const map = new Map<string, any[]>();
    requests.forEach((request) => {
      const serviceId = request?.itinerario_servicio_id;
      if (serviceId == null) return;
      const key = String(serviceId);
      const current = map.get(key) || [];
      current.push(request);
      map.set(key, current);
    });
    return map;
  }, [requests]);

  const requestContextByQuote = useMemo(() => {
    const map = new Map<string, any>();
    requests.forEach((request) => {
      if (request?.cotizacion_id && !map.has(String(request.cotizacion_id))) {
        map.set(String(request.cotizacion_id), request);
      }
    });
    return map;
  }, [requests]);

  const allRows = useMemo(() => {
    const result: any[] = [];
    quotes.forEach((quote) => {
      if (!quote?.tiene_voucher && !quote?.has_voucher_reserva && !(quote?.voucher_codes?.length > 0)) {
        return;
      }
      const agencyId = Number(quote?.agency_id ?? quote?.agencyId);
      const agency = agencyMap.get(agencyId) || null;
      const rows = flattenQuoteServices(quote, agency);
      const quoteRequestContext = requestContextByQuote.get(String(quote?.id));
      const voucherVentaId = quoteRequestContext?.voucher_venta_id ?? null;
      const voucherCode =
        quoteRequestContext?.voucher_code ||
        quote?.voucher_codes?.[0] ||
        quote?.voucher_code ||
        `COT-${quote?.id}`;
      const collection = summarizeFileCollection({
        movements,
        voucherCode,
        voucherVentaId,
        quoteTotal: Number(quote?.total_final || 0),
      });
      rows.forEach((row) => {
        const serviceRequests = row.serviceId == null
          ? []
          : requestsByService.get(String(row.serviceId)) || [];
        result.push({
          ...row,
          voucherCode,
          voucherVentaId,
          agencyIsPrimary:
            typeof agency?.is_primary === "boolean"
              ? agency.is_primary
              : primaryAgency?.id != null
                ? Number(agencyId) === Number(primaryAgency.id)
                : null,
          payerScope:
            typeof agency?.is_primary === "boolean" && !agency.is_primary
              ? "agency"
              : "client",
          requestSummary: summarizeServiceRequests(serviceRequests),
          requests: serviceRequests,
          collection,
        });
      });
    });
    return result;
  }, [agencyMap, movements, primaryAgency?.id, quotes, requestContextByQuote, requestsByService]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (agencyMode === "primary" && row.agencyIsPrimary === false) return false;
      if (dateFrom && row.serviceDate && row.serviceDate < dateFrom) return false;
      if (dateTo && row.serviceDate && row.serviceDate > dateTo) return false;
      if (!term) return true;
      return [
        row.providerName,
        row.serviceName,
        row.voucherCode,
        row.quoteTitle,
        row.agencyName,
      ].some((value) => String(value || "").toLowerCase().includes(term));
    });
  }, [agencyMode, allRows, dateFrom, dateTo, search]);

  const providers = useMemo(() => {
    const map = new Map<string, any>();
    filteredRows.forEach((row) => {
      if (!map.has(row.providerKey)) {
        map.set(row.providerKey, {
          providerKey: row.providerKey,
          providerId: row.providerId,
          providerName: row.providerName,
          serviceType: row.serviceType,
          rows: [],
          totals: {},
          paidCount: 0,
          pendingCount: 0,
          unrequestedCount: 0,
        });
      }
      const provider = map.get(row.providerKey);
      provider.rows.push(row);
      const currency = row.currency;
      provider.totals[currency] ||= { quoted: 0, paid: 0, pending: 0 };
      provider.totals[currency].quoted += row.quotedTotal;
      provider.totals[currency].paid += row.requestSummary.paid;
      provider.totals[currency].pending += Math.max(0, row.quotedTotal - row.requestSummary.paid);
      if (row.requestSummary.status === "paid") provider.paidCount += 1;
      else if (row.requestSummary.status === "unrequested") provider.unrequestedCount += 1;
      else provider.pendingCount += 1;
    });
    return Array.from(map.values())
      .map((provider) => {
        Object.values(provider.totals as Record<string, any>).forEach((total: any) => {
          total.quoted = roundMoney(total.quoted);
          total.paid = roundMoney(total.paid);
          total.pending = roundMoney(total.pending);
        });
        provider.rows.sort((a: any, b: any) =>
          String(a.serviceDate || "").localeCompare(String(b.serviceDate || "")),
        );
        return provider;
      })
      .sort((a, b) => a.providerName.localeCompare(b.providerName));
  }, [filteredRows]);

  const globalStats = useMemo(() => ({
    providers: providers.length,
    services: filteredRows.length,
    paid: filteredRows.filter((row) => row.requestSummary.status === "paid").length,
    pending: filteredRows.filter((row) => ["pending", "partial"].includes(row.requestSummary.status)).length,
    unrequested: filteredRows.filter((row) => row.requestSummary.status === "unrequested").length,
  }), [filteredRows, providers.length]);

  const addProviderWorkbookSheet = (workbook: ExcelJS.Workbook, provider: any) => {
    const rawName = sanitizeFileName(provider.providerName).slice(0, 24) || "Proveedor";
    let sheetName = rawName;
    let suffix = 2;
    while (workbook.getWorksheet(sheetName)) {
      sheetName = `${rawName.slice(0, 20)}-${suffix}`;
      suffix += 1;
    }
    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = [
      { key: "date", width: 13 },
      { key: "file", width: 16 },
      { key: "agency", width: 22 },
      { key: "pax", width: 9 },
      { key: "service", width: 34 },
      { key: "currency", width: 10 },
      { key: "cost", width: 15 },
      { key: "providerStatus", width: 18 },
      { key: "fileStatus", width: 23 },
    ];
    sheet.mergeCells("A1:I1");
    sheet.getCell("A1").value = "DOCUMENTO DE COBRANZA";
    sheet.mergeCells("A2:I2");
    sheet.getCell("A2").value = provider.providerName;
    sheet.mergeCells("A3:I3");
    sheet.getCell("A3").value = `PERIODO: ${dateFrom || "inicio"} al ${dateTo || "fin"}`;
    const header = sheet.getRow(5);
    header.values = ["FECHA", "FILE", "AGENCIA", "PAX", "SERVICIO", "MONEDA", "COSTO", "PAGO PROVEEDOR", "COBRO FILE"];
    header.font = { bold: true };
    provider.rows.forEach((row: any) => {
      sheet.addRow({
        date: row.serviceDate || "",
        file: row.voucherCode,
        agency: row.agencyName,
        pax: row.pax,
        service: [row.serviceName, ticketPaymentDetailText(row)].filter(Boolean).join("\n"),
        currency: row.currency === "soles" ? "PEN" : "USD",
        cost: row.quotedTotal,
        providerStatus: statusLabel(row.requestSummary.status),
        fileStatus: collectionLabel(row.collection.status, row.payerScope),
      });
    });
    sheet.addRow([]);
    Object.entries(provider.totals).forEach(([currency, total]: [string, any]) => {
      const row = sheet.addRow([
        "",
        "TOTAL",
        "",
        "",
        "",
        currency === "soles" ? "PEN" : "USD",
        total.quoted,
        `Pagado ${money(total.paid, currency)}`,
        `Pendiente proveedor ${money(total.pending, currency)}`,
      ]);
      row.font = { bold: true };
    });
    sheet.getColumn(7).numFmt = "0.00";
    sheet.getColumn(5).alignment = { wrapText: true, vertical: "middle" };
    sheet.views = [{ state: "frozen", ySplit: 5 }];
    return sheet;
  };

  const exportPeriodExcel = async () => {
    if (providers.length === 0) return;
    const workbook = new ExcelJS.Workbook();

    const summary = workbook.addWorksheet("RESUMEN");
    summary.columns = [
      { key: "provider", width: 30 },
      { key: "type", width: 17 },
      { key: "services", width: 11 },
      { key: "paid", width: 11 },
      { key: "pending", width: 12 },
      { key: "unrequested", width: 14 },
      { key: "currency", width: 10 },
      { key: "quoted", width: 15 },
      { key: "providerPaid", width: 16 },
      { key: "providerPending", width: 18 },
    ];
    summary.mergeCells("A1:J1");
    summary.getCell("A1").value = "RESUMEN DE PAGOS A PROVEEDORES";
    summary.mergeCells("A2:J2");
    summary.getCell("A2").value = `PERIODO: ${dateFrom || "inicio"} al ${dateTo || "fin"} · ${agencyMode === "primary" ? "VENSO PRINCIPAL" : "TODAS LAS AGENCIAS"}`;
    const summaryHeader = summary.getRow(4);
    summaryHeader.values = ["PROVEEDOR", "TIPO", "SERVICIOS", "PAGADOS", "PENDIENTES", "SIN SOLICITAR", "MONEDA", "COSTO", "PAGADO", "PENDIENTE"];
    summaryHeader.font = { bold: true };
    providers.forEach((provider) => {
      Object.entries(provider.totals).forEach(([currency, total]: [string, any]) => {
        summary.addRow({
          provider: provider.providerName,
          type: provider.serviceType,
          services: provider.rows.length,
          paid: provider.paidCount,
          pending: provider.pendingCount,
          unrequested: provider.unrequestedCount,
          currency: currency === "soles" ? "PEN" : "USD",
          quoted: total.quoted,
          providerPaid: total.paid,
          providerPending: total.pending,
        });
      });
    });
    [8, 9, 10].forEach((column) => { summary.getColumn(column).numFmt = "0.00"; });
    summary.views = [{ state: "frozen", ySplit: 4 }];

    const ledger = workbook.addWorksheet("Ingresos&Gastos");
    ledger.columns = [
      { key: "date", width: 13 },
      { key: "file", width: 16 },
      { key: "agency", width: 22 },
      { key: "pax", width: 8 },
      { key: "provider", width: 28 },
      { key: "service", width: 32 },
      { key: "currency", width: 10 },
      { key: "cost", width: 14 },
      { key: "providerPaid", width: 16 },
      { key: "providerPending", width: 17 },
      { key: "providerStatus", width: 18 },
      { key: "filePaid", width: 14 },
      { key: "fileTotal", width: 14 },
      { key: "fileStatus", width: 23 },
    ];
    ledger.mergeCells("A1:N1");
    ledger.getCell("A1").value = "INGRESOS & GASTOS · CONTROL DE FILES Y PROVEEDORES";
    ledger.mergeCells("A2:N2");
    ledger.getCell("A2").value = `PERIODO: ${dateFrom || "inicio"} al ${dateTo || "fin"}`;
    const ledgerHeader = ledger.getRow(4);
    ledgerHeader.values = ["FECHA", "FILE", "AGENCIA", "PAX", "PROVEEDOR", "SERVICIO", "MONEDA", "COSTO", "PAGADO", "PENDIENTE", "ESTADO", "COBRADO FILE USD", "TOTAL FILE USD", "ESTADO DE COBRO"];
    ledgerHeader.font = { bold: true };
    filteredRows.forEach((row) => {
      ledger.addRow({
        date: row.serviceDate || "",
        file: row.voucherCode,
        agency: row.agencyName,
        pax: row.pax,
        provider: row.providerName,
        service: [row.serviceName, ticketPaymentDetailText(row)].filter(Boolean).join("\n"),
        currency: row.currency === "soles" ? "PEN" : "USD",
        cost: row.quotedTotal,
        providerPaid: row.requestSummary.paid,
        providerPending: Math.max(0, roundMoney(row.quotedTotal - row.requestSummary.paid)),
        providerStatus: statusLabel(row.requestSummary.status),
        filePaid: row.collection.paid,
        fileTotal: row.collection.total,
        fileStatus: collectionLabel(row.collection.status, row.payerScope),
      });
    });
    [8, 9, 10, 12, 13].forEach((column) => { ledger.getColumn(column).numFmt = "0.00"; });
    ledger.getColumn(6).alignment = { wrapText: true, vertical: "middle" };
    ledger.views = [{ state: "frozen", ySplit: 4 }];

    providers.forEach((provider) => addProviderWorkbookSheet(workbook, provider));
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(
      new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      `Pagos_Proveedores_${dateFrom}_${dateTo}.xlsx`,
    );
  };

  const exportProviderExcel = async (provider: any) => {
    const workbook = new ExcelJS.Workbook();
    addProviderWorkbookSheet(workbook, provider);
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(
      new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      `Proveedor_${sanitizeFileName(provider.providerName)}_${dateFrom}_${dateTo}.xlsx`,
    );
  };

  const printProvider = (provider: any) => {
    const popup = window.open("", "_blank", "width=1150,height=780");
    if (!popup) return;
    const rowsHtml = groupPaymentServiceSections(provider.rows).map((section) =>
      `${section.isTicket ? `<tr><td colspan="8"><strong>${escapeReportHtml(section.rows[0].voucherCode)} · Día ${section.rows[0].dayNumber} · ${escapeReportHtml(section.title)}</strong></td></tr>` : ""}${section.rows.map((row: any) => `<tr>
      <td>${escapeReportHtml(row.serviceDate || "-")}</td><td>${escapeReportHtml(row.voucherCode)}</td><td>${escapeReportHtml(row.agencyName)}</td><td>${row.pax}</td>
      <td>${serviceDetailHtml(row, !section.isTicket)}</td><td>${money(row.quotedTotal, row.currency)}</td>
      <td>${statusLabel(row.requestSummary.status)}</td><td>${collectionLabel(row.collection.status, row.payerScope)}</td>
    </tr>`).join("")}`,
    ).join("");
    const totalsHtml = Object.entries(provider.totals).map(([currency, total]: [string, any]) =>
      `<div><span>${currency === "soles" ? "SOLES" : "DÓLARES"}</span><strong>${money(total.quoted, currency)}</strong><small>Pagado proveedor ${money(total.paid, currency)} · pendiente ${money(total.pending, currency)}</small></div>`,
    ).join("");
    popup.document.write(`<!doctype html><html><head><title>${provider.providerName}</title><style>
      body{font-family:Arial,sans-serif;padding:28px;color:#1f2937}h1{font-size:22px;margin:0}.meta{color:#64748b;margin:5px 0}
      table{width:100%;border-collapse:collapse;margin-top:22px;font-size:12px}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left}th{background:#f1f5f9}
      .totals{display:flex;justify-content:flex-end;gap:12px;margin-top:18px}.totals div{border:1px solid #cbd5e1;padding:10px;min-width:240px}.totals span,.totals small{display:block;color:#64748b}.totals strong{font-size:18px}
      @media print{body{padding:0}}
    </style></head><body><h1>DOCUMENTO DE COBRANZA</h1><p class="meta"><strong>Proveedor:</strong> ${provider.providerName}</p>
      <p class="meta"><strong>Periodo:</strong> ${dateFrom} al ${dateTo}</p>
      <table><thead><tr><th>FECHA</th><th>FILE</th><th>AGENCIA</th><th>PAX</th><th>SERVICIO</th><th>COSTO</th><th>PAGO PROVEEDOR</th><th>COBRO FILE</th></tr></thead><tbody>${rowsHtml}</tbody></table>
      <div class="totals">${totalsHtml}</div><script>window.onload=()=>window.print();</script></body></html>`);
    popup.document.close();
  };

  return (
    <div className="provider-payments-report">
      <header className="provider-payments-report__hero">
        <div>
          <span>CONTABILIDAD · PAGOS DE PROVEEDORES</span>
          <h2>Pagos a proveedores</h2>
        </div>
        <FaFileInvoiceDollar />
      </header>

      <section className="provider-payments-report__filters">
        <label>Desde<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label>Hasta<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        <label>Agencia<select value={agencyMode} onChange={(event) => setAgencyMode(event.target.value)}><option value="primary">Venso principal</option><option value="all">Todas (auditoría)</option></select></label>
        <label className="provider-payments-report__search"><FaSearch /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Proveedor, file o servicio…" /></label>
        <button
          type="button"
          className="provider-payments-report__export"
          onClick={exportPeriodExcel}
          disabled={loading || providers.length === 0}
        >
          <FaFileExcel /> Exportar periodo
        </button>
      </section>

      <section className="provider-payments-report__stats">
        <div><FaBuilding /><span>Proveedores<strong>{globalStats.providers}</strong></span></div>
        <div><FaFileInvoiceDollar /><span>Servicios<strong>{globalStats.services}</strong></span></div>
        <div><FaCheckCircle /><span>Pagados<strong>{globalStats.paid}</strong></span></div>
        <div><FaHourglassHalf /><span>Pendientes<strong>{globalStats.pending + globalStats.unrequested}</strong></span></div>
      </section>

      {loading ? (
        <div className="provider-payments-report__empty">Cargando servicios, proveedores y pagos…</div>
      ) : providers.length === 0 ? (
        <div className="provider-payments-report__empty">No hay servicios de proveedores para el periodo seleccionado.</div>
      ) : (
        <section className="provider-payments-report__grid">
          {providers.map((provider) => (
            <article key={provider.providerKey} className="provider-card">
              <header><div><small>{provider.serviceType}</small><h3>{provider.providerName}</h3></div><strong>{provider.rows.length} servicio(s)</strong></header>
              <div className="provider-card__statuses">
                <span className="paid">{provider.paidCount} pagados</span>
                <span className="pending">{provider.pendingCount} pendientes</span>
                <span className="unrequested">{provider.unrequestedCount} sin solicitar</span>
              </div>
              <div className="provider-card__totals">
                {Object.entries(provider.totals).map(([currency, total]: [string, any]) => (
                  <div key={currency}><small>{currency === "soles" ? "PEN" : "USD"}</small><strong>{money(total.quoted, currency)}</strong><span>Pagado {money(total.paid, currency)}</span></div>
                ))}
              </div>
              <button type="button" onClick={() => setSelectedProvider(provider)}>Ver informe de pago</button>
            </article>
          ))}
        </section>
      )}

      {selectedProvider && (
        <Modal
          isOpen={Boolean(selectedProvider)}
          onClose={() => setSelectedProvider(null)}
          title={`Documento de cobranza · ${selectedProvider.providerName}`}
          size="large"
          className="provider-document-modal"
          actions={[
            { label: "Imprimir / PDF", onClick: () => printProvider(selectedProvider), variant: "secondary", icon: <FaPrint /> },
            { label: "Exportar Excel", onClick: () => exportProviderExcel(selectedProvider), variant: "success", icon: <FaFileExcel /> },
          ]}
        >
          <div className="provider-document">
            <header><div><span>DOCUMENTO DE COBRANZA</span><h3>{selectedProvider.providerName}</h3></div><div><strong>{dateFrom}</strong><span>al {dateTo}</span></div></header>
            <div className="provider-document__table"><table><thead><tr><th>Fecha</th><th>File</th><th>Agencia</th><th>Pax</th><th>Servicio</th><th>Costo</th><th>Proveedor</th><th>Cobro del file</th></tr></thead><tbody>
              {groupPaymentServiceSections(selectedProvider.rows).map((section) => (
                <React.Fragment key={section.key}>
                  {section.isTicket && <tr className="payment-ticket-section"><td colSpan={8}><strong>{section.rows[0].voucherCode} · Día {section.rows[0].dayNumber} · {section.title}</strong></td></tr>}
                  {section.rows.map((row: any, index: number) => (
                <tr key={`${row.quoteId}-${row.serviceId}-${index}`}>
                  <td>{row.serviceDate || "-"}</td><td><strong>{row.voucherCode}</strong><small>{row.quoteTitle}</small></td>
                  <td>{row.agencyName}</td><td>{row.pax}</td>
                  <td>{!section.isTicket && row.serviceName}<TicketPaymentBreakdown row={row} /></td><td>{money(row.quotedTotal, row.currency)}</td>
                  <td><span className={`report-status ${row.requestSummary.status}`}>{statusLabel(row.requestSummary.status)}</span><small>{row.requestSummary.paid > 0 ? `Liquidado ${money(row.requestSummary.paid, row.currency)}` : "Sin egreso liquidado"}</small></td>
                  <td><span className={`report-status ${row.collection.status}`}>{collectionLabel(row.collection.status, row.payerScope)}</span><small>{row.collection.total > 0 ? `${money(row.collection.paid, "dolares")} / ${money(row.collection.total, "dolares")}` : "Sin total comercial"}</small></td>
                </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody></table></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default GestionPagosServicios;
