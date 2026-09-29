import * as XLSX from "xlsx";
import { format } from "date-fns";

const getMonthName = (month) => {
  const months = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  return months[month - 1];
};

export const exportToPDF = async (reportData, filters) => {
  const formatTipoCuenta = (tipo) => {
    if (tipo === "efectivo") return "Efectivo";
    if (tipo === "cuenta_debito" || tipo === "cuenta_débito")
      return "Cuenta Débito";
    if (tipo === "cuenta_credito" || tipo === "cuenta_crédito")
      return "Cuenta Crédito";
    if (tipo === "cuenta") return "Cuenta Débito";
    return tipo;
  };

  const filterInfo = `Periodo: ${getMonthName(filters.mes)} ${filters.año}`;
  let additionalFilters = [];
  if (filters.moneda)
    additionalFilters.push(
      `Moneda: ${filters.moneda === "soles" ? "Soles" : "Dólares"}`,
    );
  if (filters.tipoSaldo)
    additionalFilters.push(
      `Tipo: ${filters.tipoSaldo === "efectivo" ? "Efectivo" : "Cuenta Bancaria"}`,
    );
  if (filters.tipoMovimiento)
    additionalFilters.push(
      `Movimiento: ${filters.tipoMovimiento === "ingreso" ? "Ingresos" : "Egresos"}`,
    );

  const rowsHtml = reportData.movimientos
    .map(
      (mov) => `
 <tr>
 <td>${format(new Date(mov.fecha), "dd/MM/yyyy")}</td>
 <td>${mov.descripcion}</td>
 <td>${mov.tipo_movimiento === "ingreso" ? "Ingreso" : "Egreso"}</td>
 <td>${formatTipoCuenta(mov.tipo_cuenta)}</td>
 <td>${mov.moneda === "soles" ? "S/" : "US$"}</td>
 <td style="text-align:right">${mov.moneda === "soles" ? "S/ " : "US$ "}${parseFloat(mov.monto).toFixed(2)}</td>
 </tr>
 `,
    )
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
 <title>Reporte ${getMonthName(filters.mes)} ${filters.año}</title>
 <style>
 @page { size: A4 portrait; margin: 15mm; }
 body { font-family: Helvetica, Arial, sans-serif; font-size: 10pt; color: #333;
 -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
 h1 { font-size: 16pt; text-align: center; margin-bottom: 4px; }
 .filter-info { text-align: center; font-size: 10pt; color: #555; margin-bottom: 10px; }
 h2 { font-size: 12pt; margin: 14px 0 6px; }
 .resumen p { margin: 2px 0; font-size: 9pt; }
 table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 8pt; }
 th { background: #647eea; color: #fff; padding: 6px 4px; text-align: left; font-weight: bold; }
 td { padding: 4px; border-bottom: 1px solid #eee; }
 tr:nth-child(even) td { background: #f5f5f5; }
 .footer { margin-top: 20px; font-size: 7pt; color: #999; text-align: center; }
 </style></head><body>
 <h1>Reporte Mensual de Movimientos</h1>
 <div class="filter-info">${filterInfo}${additionalFilters.length ? " | " + additionalFilters.join(" | ") : ""}</div>
 <h2>Resumen Ejecutivo</h2>
 <div class="resumen">
 <p>Total de Movimientos: ${reportData.resumen.totalMovimientos}</p>
 <p>Total de Ingresos: ${reportData.resumen.totalIngresos}</p>
 <p>Total de Egresos: ${reportData.resumen.totalEgresos}</p>
 <p>Monto Total en Soles: S/ ${reportData.resumen.totalMonto.soles.toFixed(2)}</p>
 <p>Monto Total en Dólares: US$ ${reportData.resumen.totalMonto.dolares.toFixed(2)}</p>
 </div>
 <table><thead><tr>
 <th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Cuenta</th><th>Moneda</th><th style="text-align:right">Monto</th>
 </tr></thead><tbody>${rowsHtml}</tbody></table>
 <div class="footer">Generado el ${format(new Date(), "dd/MM/yyyy HH:mm")}</div>
 </body></html>`;

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Habilita los popups para descargar el PDF.");
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 400);
};

export const exportToExcel = async (reportData, filters) => {
  const workbook = XLSX.utils.book_new();

  // Hoja de resumen
  const resumenData = [
    ["REPORTE MENSUAL DE MOVIMIENTOS"],
    [""],
    ["Periodo:", `${getMonthName(filters.mes)} ${filters.año}`],
    ["Generado:", format(new Date(), "dd/MM/yyyy HH:mm")],
    [""],
    ["RESUMEN EJECUTIVO"],
    ["Total de Movimientos:", reportData.resumen.totalMovimientos],
    ["Total de Ingresos:", reportData.resumen.totalIngresos],
    ["Total de Egresos:", reportData.resumen.totalEgresos],
    [
      "Monto Total en Soles:",
      `S/ ${reportData.resumen.totalMonto.soles.toFixed(2)}`,
    ],
    [
      "Monto Total en Dólares:",
      `US$ ${reportData.resumen.totalMonto.dolares.toFixed(2)}`,
    ],
    [""],
    ["TOTALES POR MONEDA"],
    ["", "Ingresos", "Egresos", "Balance"],
    [
      "Soles",
      `S/ ${reportData.totalesPorMoneda.soles.ingresos.toFixed(2)}`,
      `S/ ${reportData.totalesPorMoneda.soles.egresos.toFixed(2)}`,
      `S/ ${(reportData.totalesPorMoneda.soles.ingresos - reportData.totalesPorMoneda.soles.egresos).toFixed(2)}`,
    ],
    [
      "Dólares",
      `US$ ${reportData.totalesPorMoneda.dolares.ingresos.toFixed(2)}`,
      `US$ ${reportData.totalesPorMoneda.dolares.egresos.toFixed(2)}`,
      `US$ ${(reportData.totalesPorMoneda.dolares.ingresos - reportData.totalesPorMoneda.dolares.egresos).toFixed(2)}`,
    ],
    [""],
    ["TOTALES POR TIPO DE CUENTA"],
    ["", "Ingresos", "Egresos", "Balance"],
    [
      "Efectivo",
      `S/ ${reportData.totalesPorTipo.efectivo.ingresos.toFixed(2)}`,
      `S/ ${reportData.totalesPorTipo.efectivo.egresos.toFixed(2)}`,
      `S/ ${(reportData.totalesPorTipo.efectivo.ingresos - reportData.totalesPorTipo.efectivo.egresos).toFixed(2)}`,
    ],
    [
      "Cuenta Bancaria",
      `S/ ${reportData.totalesPorTipo.cuenta.ingresos.toFixed(2)}`,
      `S/ ${reportData.totalesPorTipo.cuenta.egresos.toFixed(2)}`,
      `S/ ${(reportData.totalesPorTipo.cuenta.ingresos - reportData.totalesPorTipo.cuenta.egresos).toFixed(2)}`,
    ],
  ];

  const resumenSheet = XLSX.utils.aoa_to_sheet(resumenData);
  XLSX.utils.book_append_sheet(workbook, resumenSheet, "Resumen");

  // Hoja de movimientos detallados
  const movimientosData = [
    [
      "Fecha",
      "Descripción",
      "Tipo Movimiento",
      "Tipo Cuenta",
      "Moneda",
      "Monto",
    ],
  ];

  reportData.movimientos.forEach((mov) => {
    movimientosData.push([
      format(new Date(mov.fecha), "dd/MM/yyyy"),
      mov.descripcion,
      mov.tipo_movimiento === "ingreso" ? "Ingreso" : "Egreso",
      mov.tipo_cuenta === "efectivo" ? "Efectivo" : "Cuenta Bancaria",
      mov.moneda === "soles" ? "Soles" : "Dólares",
      parseFloat(mov.monto),
    ]);
  });

  const movimientosSheet = XLSX.utils.aoa_to_sheet(movimientosData);

  // Configurar el ancho de las columnas
  const colWidths = [
    { wch: 12 }, // Fecha
    { wch: 40 }, // Descripción
    { wch: 15 }, // Tipo Movimiento
    { wch: 15 }, // Tipo Cuenta
    { wch: 10 }, // Moneda
    { wch: 15 }, // Monto
  ];
  movimientosSheet["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(
    workbook,
    movimientosSheet,
    "Movimientos Detallados",
  );

  // Hoja de análisis por día (si hay datos)
  if (Object.keys(reportData.movimientosPorDia).length > 0) {
    const analisisDiarioData = [
      ["Fecha", "Ingresos", "Egresos", "Balance Diario"],
    ];

    Object.entries(reportData.movimientosPorDia)
      .sort(([a], [b]) => new Date(a) - new Date(b))
      .forEach(([fecha, datos]) => {
        const balance = datos.ingresos - datos.egresos;
        analisisDiarioData.push([
          format(new Date(fecha), "dd/MM/yyyy"),
          datos.ingresos.toFixed(2),
          datos.egresos.toFixed(2),
          balance.toFixed(2),
        ]);
      });

    const analisisSheet = XLSX.utils.aoa_to_sheet(analisisDiarioData);
    analisisSheet["!cols"] = [
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
    ];
    XLSX.utils.book_append_sheet(workbook, analisisSheet, "Análisis Diario");
  }

  // Guardar el archivo
  const fileName = `reporte_${getMonthName(filters.mes)}_${filters.año}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};
