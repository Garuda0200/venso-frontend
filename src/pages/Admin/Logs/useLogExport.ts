/**
 * Hook para exportación estética a Excel con exceljs.
 * Genera un workbook con múltiples hojas organizadas por categoría.
 *
 * Hojas:
 * 1. "Todos los Logs" – Listado completo con estilos
 * 2. "Por Usuario" – Agrupado por DNI + nombre completo
 * 3. "Por Operación" – Agrupado por tipo de operación
 * 4. "Por Entidad" – Agrupado por tipo de entidad
 * 5. "Resumen" – Estadísticas generales
 */
import { useState, useCallback } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  OPERATION_LABEL_MAP,
  ENTITY_LABEL_MAP,
  ROLE_LABEL_MAP,
  OPERATION_COLORS,
  ENTITY_COLORS,
  EXCEL_COLUMNS,
} from "./logConstants";

// ============== ESTILOS BASE ==============

const HEADER_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1B5E20" },
};
const HEADER_FONT = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 11,
  name: "Calibri",
};
const HEADER_ALIGN = {
  vertical: "middle",
  horizontal: "center",
  wrapText: true,
};
const HEADER_BORDER = {
  top: { style: "thin", color: { argb: "FF388E3C" } },
  bottom: { style: "thin", color: { argb: "FF388E3C" } },
  left: { style: "thin", color: { argb: "FF388E3C" } },
  right: { style: "thin", color: { argb: "FF388E3C" } },
};

const CELL_BORDER = {
  top: { style: "thin", color: { argb: "FFE0E0E0" } },
  bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
  left: { style: "thin", color: { argb: "FFE0E0E0" } },
  right: { style: "thin", color: { argb: "FFE0E0E0" } },
};

const TITLE_FONT = {
  bold: true,
  size: 14,
  color: { argb: "FF1B5E20" },
  name: "Calibri",
};
const SUBTITLE_FONT = {
  bold: false,
  size: 10,
  color: { argb: "FF757575" },
  name: "Calibri",
};
const GROUP_HEADER_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8F5E9" },
};
const GROUP_HEADER_FONT = {
  bold: true,
  size: 11,
  color: { argb: "FF1B5E20" },
  name: "Calibri",
};

// ============== HELPERS ==============

function formatDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString();
}

function applyHeaderStyle(row) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = HEADER_ALIGN;
    cell.border = HEADER_BORDER;
  });
  row.height = 28;
}

function applyCellStyle(row, isAlt) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = CELL_BORDER;
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.font = { size: 10, name: "Calibri" };
    if (isAlt) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF5F5F5" },
      };
    }
  });
  row.height = 22;
}

function applyGroupHeaderStyle(row, colCount) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = GROUP_HEADER_FILL;
    cell.font = GROUP_HEADER_FONT;
    cell.border = CELL_BORDER;
    cell.alignment = { vertical: "middle" };
  });
  row.height = 26;
}

function addTitleRows(ws, title, subtitle, colCount) {
  // Fila de título
  const titleRow = ws.addRow([title]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, colCount);
  titleRow.getCell(1).font = TITLE_FONT;
  titleRow.getCell(1).alignment = { vertical: "middle" };
  titleRow.height = 30;

  // Fila de subtítulo
  const subRow = ws.addRow([subtitle]);
  ws.mergeCells(subRow.number, 1, subRow.number, colCount);
  subRow.getCell(1).font = SUBTITLE_FONT;
  subRow.getCell(1).alignment = { vertical: "middle" };
  subRow.height = 20;

  // Fila vacía
  ws.addRow([]);
}

function setColumnWidths(ws, widths) {
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

/** Ajustar automáticamente el ancho de las columnas según el contenido */
function autoFitColumns(ws, minWidth = 10, maxWidth = 50) {
  ws.columns.forEach((col, colIdx) => {
    let maxLen = minWidth;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const val = cell.value != null ? String(cell.value) : "";
      // Tomar la línea más larga si hay saltos
      const lines = val.split("\n");
      const longest = Math.max(...lines.map((l) => l.length));
      if (longest + 2 > maxLen) maxLen = longest + 2;
    });
    col.width = Math.min(maxLen, maxWidth);
  });
}

function colorizeOperation(cell, opType) {
  const c = OPERATION_COLORS[opType];
  if (c) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.bg } };
    cell.font = { ...cell.font, color: { argb: c.font }, bold: true };
  }
}

function colorizeStatus(cell, status) {
  if (status) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8F5E9" },
    };
    cell.font = { ...cell.font, color: { argb: "FF2E7D32" }, bold: true };
  } else {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFEBEE" },
    };
    cell.font = { ...cell.font, color: { argb: "FFC62828" }, bold: true };
  }
}

/** Obtener label del rol del usuario */
function getRoleLabel(role) {
  if (role === null || role === undefined) return "";
  return ROLE_LABEL_MAP[role] || `Rol ${role}`;
}

// ============== SHEET BUILDERS ==============

/** Hoja 1: Todos los logs con estilos */
function buildAllLogsSheet(wb, data) {
  const ws = wb.addWorksheet("Todos los Logs", {
    properties: { tabColor: { argb: "FF1B5E20" } },
    views: [{ state: "frozen", ySplit: 4 }],
  });

  const colCount = EXCEL_COLUMNS.length;
  addTitleRows(
    ws,
    "Registro de Actividad del Sistema",
    `Exportado: ${new Date().toLocaleString()} — Total: ${data.length} registros`,
    colCount,
  );

  // Headers
  ws.columns = EXCEL_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));
  const headerRow = ws.addRow(EXCEL_COLUMNS.map((c) => c.header));
  applyHeaderStyle(headerRow);

  // Auto-filter
  ws.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number, column: colCount },
  };

  // Data rows
  data.forEach((log, idx) => {
    const row = ws.addRow([
      formatDate(log.action_timestamp),
      OPERATION_LABEL_MAP[log.operation_type] || log.operation_type,
      ENTITY_LABEL_MAP[log.entity_type] || log.entity_type,
      log.entity_id || "",
      log.dniuser || "",
      log.user_fullname || "",
      getRoleLabel(log.user_role),
      log.status ? "Éxito" : "Error",
      log.error_details || "",
    ]);
    applyCellStyle(row, idx % 2 === 1);

    // Colorear operación y estado
    colorizeOperation(row.getCell(2), log.operation_type);
    colorizeStatus(row.getCell(8), log.status);
  });

  autoFitColumns(ws);
}

/** Hoja 2: Agrupado por usuario */
function buildByUserSheet(wb, data) {
  const ws = wb.addWorksheet("Por Usuario", {
    properties: { tabColor: { argb: "FF0277BD" } },
    views: [{ state: "frozen", ySplit: 4 }],
  });

  const cols = [
    { w: 14, h: "DNI" },
    { w: 30, h: "Nombre Completo" },
    { w: 14, h: "Rol" },
    { w: 20, h: "Fecha y Hora" },
    { w: 14, h: "Operación" },
    { w: 20, h: "Entidad" },
    { w: 14, h: "ID Entidad" },
    { w: 10, h: "Estado" },
  ];
  const colCount = cols.length;

  addTitleRows(
    ws,
    "Actividad por Usuario",
    `Listado detallado de acciones por cada participante — ${data.length} registros`,
    colCount,
  );
  setColumnWidths(
    ws,
    cols.map((c) => c.w),
  );

  const headerRow = ws.addRow(cols.map((c) => c.h));
  applyHeaderStyle(headerRow);
  ws.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number, column: colCount },
  };

  // Agrupar por usuario
  const grouped = {};
  for (const log of data) {
    const key = log.dniuser || "SISTEMA";
    if (!grouped[key])
      grouped[key] = { name: log.user_fullname || "Sistema", logs: [] };
    grouped[key].logs.push(log);
    // Actualizar nombre si estaba vacío
    if (log.user_fullname && grouped[key].name === "Sistema") {
      grouped[key].name = log.user_fullname;
    }
  }

  // Ordenar por cantidad desc
  const sorted = Object.entries(grouped).sort(
    (a, b) => b[1].logs.length - a[1].logs.length,
  );

  let rowIdx = 0;
  for (const [dni, { name, logs: userLogs }] of sorted) {
    // Group header
    const groupRow = ws.addRow([
      `▸ ${name} (${dni}) — ${userLogs.length} acciones`,
    ]);
    ws.mergeCells(groupRow.number, 1, groupRow.number, colCount);
    applyGroupHeaderStyle(groupRow, colCount);

    for (const log of userLogs) {
      const row = ws.addRow([
        log.dniuser || "",
        log.user_fullname || "",
        getRoleLabel(log.user_role),
        formatDate(log.action_timestamp),
        OPERATION_LABEL_MAP[log.operation_type] || log.operation_type,
        ENTITY_LABEL_MAP[log.entity_type] || log.entity_type,
        log.entity_id || "",
        log.status ? "Éxito" : "Error",
      ]);
      applyCellStyle(row, rowIdx % 2 === 1);
      colorizeOperation(row.getCell(5), log.operation_type);
      colorizeStatus(row.getCell(8), log.status);
      rowIdx++;
    }

    // Fila vacía entre grupos
    ws.addRow([]);
  }

  autoFitColumns(ws);
}

/** Hoja 3: Agrupado por operación */
function buildByOperationSheet(wb, data) {
  const ws = wb.addWorksheet("Por Operación", {
    properties: { tabColor: { argb: "FFE65100" } },
    views: [{ state: "frozen", ySplit: 4 }],
  });

  const cols = [
    { w: 14, h: "Operación" },
    { w: 20, h: "Fecha y Hora" },
    { w: 20, h: "Entidad" },
    { w: 14, h: "ID Entidad" },
    { w: 14, h: "DNI" },
    { w: 28, h: "Nombre" },
    { w: 14, h: "Rol" },
    { w: 10, h: "Estado" },
  ];
  const colCount = cols.length;

  addTitleRows(
    ws,
    "Actividad por Tipo de Operación",
    `Agrupación por CREATE, UPDATE, DELETE, etc. — ${data.length} registros`,
    colCount,
  );
  setColumnWidths(
    ws,
    cols.map((c) => c.w),
  );

  const headerRow = ws.addRow(cols.map((c) => c.h));
  applyHeaderStyle(headerRow);
  ws.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number, column: colCount },
  };

  // Agrupar
  const grouped = {};
  for (const log of data) {
    const op = log.operation_type || "UNKNOWN";
    if (!grouped[op]) grouped[op] = [];
    grouped[op].push(log);
  }

  const opOrder = [
    "CREATE",
    "UPDATE",
    "DUPLICATE",
    "DELETE",
    "LOGIN",
    "LOGOUT",
  ];
  const sorted = opOrder.filter((o) => grouped[o]).map((o) => [o, grouped[o]]);
  // Agregar los que no estén en el orden predefinido
  Object.keys(grouped)
    .filter((k) => !opOrder.includes(k))
    .forEach((k) => sorted.push([k, grouped[k]]));

  let rowIdx = 0;
  for (const [opType, opLogs] of sorted) {
    const label = OPERATION_LABEL_MAP[opType] || opType;
    const groupRow = ws.addRow([`▸ ${label} — ${opLogs.length} registros`]);
    ws.mergeCells(groupRow.number, 1, groupRow.number, colCount);
    applyGroupHeaderStyle(groupRow, colCount);

    const c = OPERATION_COLORS[opType];
    if (c) {
      groupRow.getCell(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: c.bg },
      };
      groupRow.getCell(1).font = {
        bold: true,
        size: 11,
        color: { argb: c.font },
        name: "Calibri",
      };
    }

    for (const log of opLogs) {
      const row = ws.addRow([
        label,
        formatDate(log.action_timestamp),
        ENTITY_LABEL_MAP[log.entity_type] || log.entity_type,
        log.entity_id || "",
        log.dniuser || "",
        log.user_fullname || "",
        getRoleLabel(log.user_role),
        log.status ? "Éxito" : "Error",
      ]);
      applyCellStyle(row, rowIdx % 2 === 1);
      colorizeOperation(row.getCell(1), opType);
      colorizeStatus(row.getCell(8), log.status);
      rowIdx++;
    }
    ws.addRow([]);
  }

  autoFitColumns(ws);
}

/** Hoja 4: Agrupado por entidad */
function buildByEntitySheet(wb, data) {
  const ws = wb.addWorksheet("Por Entidad", {
    properties: { tabColor: { argb: "FF6A1B9A" } },
    views: [{ state: "frozen", ySplit: 4 }],
  });

  const cols = [
    { w: 20, h: "Entidad" },
    { w: 20, h: "Fecha y Hora" },
    { w: 14, h: "Operación" },
    { w: 14, h: "ID Entidad" },
    { w: 14, h: "DNI" },
    { w: 28, h: "Nombre" },
    { w: 14, h: "Rol" },
    { w: 10, h: "Estado" },
  ];
  const colCount = cols.length;

  addTitleRows(
    ws,
    "Actividad por Tipo de Entidad",
    `Agrupación por tabla/entidad afectada — ${data.length} registros`,
    colCount,
  );
  setColumnWidths(
    ws,
    cols.map((c) => c.w),
  );

  const headerRow = ws.addRow(cols.map((c) => c.h));
  applyHeaderStyle(headerRow);
  ws.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number, column: colCount },
  };

  const grouped = {};
  for (const log of data) {
    const ent = log.entity_type || "unknown";
    if (!grouped[ent]) grouped[ent] = [];
    grouped[ent].push(log);
  }

  const sorted = Object.entries(grouped).sort(
    (a, b) => b[1].length - a[1].length,
  );
  let rowIdx = 0;

  for (const [entityType, entLogs] of sorted) {
    const label = ENTITY_LABEL_MAP[entityType] || entityType;
    const groupRow = ws.addRow([`▸ ${label} — ${entLogs.length} registros`]);
    ws.mergeCells(groupRow.number, 1, groupRow.number, colCount);
    applyGroupHeaderStyle(groupRow, colCount);

    const ec = ENTITY_COLORS[entityType];
    if (ec) {
      groupRow.getCell(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: ec.bg },
      };
      groupRow.getCell(1).font = {
        bold: true,
        size: 11,
        color: { argb: ec.font },
        name: "Calibri",
      };
    }

    for (const log of entLogs) {
      const row = ws.addRow([
        label,
        formatDate(log.action_timestamp),
        OPERATION_LABEL_MAP[log.operation_type] || log.operation_type,
        log.entity_id || "",
        log.dniuser || "",
        log.user_fullname || "",
        getRoleLabel(log.user_role),
        log.status ? "Éxito" : "Error",
      ]);
      applyCellStyle(row, rowIdx % 2 === 1);
      colorizeOperation(row.getCell(3), log.operation_type);
      colorizeStatus(row.getCell(8), log.status);
      rowIdx++;
    }
    ws.addRow([]);
  }

  autoFitColumns(ws);
}

/** Hoja 5: Resumen estadístico */
function buildSummarySheet(wb, data) {
  const ws = wb.addWorksheet("Resumen", {
    properties: { tabColor: { argb: "FF283593" } },
  });

  const colCount = 4;
  addTitleRows(
    ws,
    "Resumen Estadístico",
    `Generado: ${new Date().toLocaleString()} — Total: ${data.length} registros`,
    colCount,
  );
  setColumnWidths(ws, [24, 14, 24, 14]);

  // --- Conteo por operación ---
  const secRow1 = ws.addRow([
    "RESUMEN POR OPERACIÓN",
    "",
    "RESUMEN POR ENTIDAD",
    "",
  ]);
  secRow1.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.border = HEADER_BORDER;
    cell.alignment = HEADER_ALIGN;
  });
  secRow1.height = 26;

  const opCounts = {};
  const entCounts = {};
  const userCounts = {};
  let successCount = 0;

  for (const log of data) {
    const op = OPERATION_LABEL_MAP[log.operation_type] || log.operation_type;
    opCounts[op] = (opCounts[op] || 0) + 1;

    const ent = ENTITY_LABEL_MAP[log.entity_type] || log.entity_type;
    entCounts[ent] = (entCounts[ent] || 0) + 1;

    const user = log.user_fullname
      ? `${log.user_fullname} (${log.dniuser || "-"})`
      : log.dniuser || "Sistema";
    userCounts[user] = (userCounts[user] || 0) + 1;

    if (log.status) successCount++;
  }

  const sortedOps = Object.entries(opCounts).sort((a, b) => b[1] - a[1]);
  const sortedEnts = Object.entries(entCounts).sort((a, b) => b[1] - a[1]);
  const sortedUsers = Object.entries(userCounts).sort((a, b) => b[1] - a[1]);

  const maxRows = Math.max(sortedOps.length, sortedEnts.length);
  for (let i = 0; i < maxRows; i++) {
    const row = ws.addRow([
      sortedOps[i]?.[0] || "",
      sortedOps[i]?.[1] ?? "",
      sortedEnts[i]?.[0] || "",
      sortedEnts[i]?.[1] ?? "",
    ]);
    applyCellStyle(row, i % 2 === 1);
  }

  // Fila vacía
  ws.addRow([]);

  // --- Conteo por usuario ---
  const secRow2 = ws.addRow([
    "RESUMEN POR USUARIO",
    "Acciones",
    "Porcentaje",
    "",
  ]);
  secRow2.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.border = HEADER_BORDER;
    cell.alignment = HEADER_ALIGN;
  });
  secRow2.height = 26;

  for (let i = 0; i < sortedUsers.length; i++) {
    const [name, count] = sortedUsers[i];
    const pct =
      data.length > 0 ? ((count / data.length) * 100).toFixed(1) + "%" : "0%";
    const row = ws.addRow([name, count, pct, ""]);
    applyCellStyle(row, i % 2 === 1);
  }

  ws.addRow([]);

  // --- Conteo por rol ---
  const secRowRole = ws.addRow([
    "RESUMEN POR ROL",
    "Acciones",
    "Porcentaje",
    "",
  ]);
  secRowRole.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.border = HEADER_BORDER;
    cell.alignment = HEADER_ALIGN;
  });
  secRowRole.height = 26;

  const roleCounts = {};
  for (const log of data) {
    const roleLabel = getRoleLabel(log.user_role) || "Sin rol";
    roleCounts[roleLabel] = (roleCounts[roleLabel] || 0) + 1;
  }
  const sortedRoles = Object.entries(roleCounts).sort((a, b) => b[1] - a[1]);
  for (let i = 0; i < sortedRoles.length; i++) {
    const [roleLabel, count] = sortedRoles[i];
    const pct =
      data.length > 0 ? ((count / data.length) * 100).toFixed(1) + "%" : "0%";
    const row = ws.addRow([roleLabel, count, pct, ""]);
    applyCellStyle(row, i % 2 === 1);
  }

  ws.addRow([]);

  // --- Estadísticas generales ---
  const secRow3 = ws.addRow(["ESTADÍSTICAS GENERALES", "", "", ""]);
  secRow3.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.border = HEADER_BORDER;
    cell.alignment = HEADER_ALIGN;
  });
  secRow3.height = 26;

  const errorCount = data.length - successCount;
  const statRows = [
    ["Total de registros", data.length],
    ["Operaciones exitosas", successCount],
    ["Operaciones con error", errorCount],
    [
      "Tasa de éxito",
      data.length > 0
        ? ((successCount / data.length) * 100).toFixed(1) + "%"
        : "0%",
    ],
    ["Usuarios únicos", Object.keys(userCounts).length],
    ["Entidades únicas", Object.keys(entCounts).length],
    ["Tipos de operación", Object.keys(opCounts).length],
  ];

  statRows.forEach(([label, value], i) => {
    const row = ws.addRow([label, value, "", ""]);
    applyCellStyle(row, i % 2 === 1);
    row.getCell(1).font = { ...row.getCell(1).font, bold: true };
  });

  autoFitColumns(ws);
}

/** Hoja 6: Detalle por Área — conteo por rol (excluye superadmin) */
function buildVentasDetailSheet(wb, data) {
  const ws = wb.addWorksheet("Detalle por Área", {
    properties: { tabColor: { argb: "FFFF8F00" } },
  });

  const colCount = 8;

  // Secciones por rol operativo (excl. Super Admin = 0)
  const ROLE_SECTIONS = [
    {
      role: 1,
      title: "ADMIN",
      subtitle: "Administración general del sistema",
      color: { bg: "FFE3F2FD", font: "FF0D47A1" },
    },
    {
      role: 2,
      title: "VENTAS",
      subtitle: "Cotizaciones y Vouchers de Venta",
      color: { bg: "FFE8F5E9", font: "FF1B5E20" },
    },
    {
      role: 3,
      title: "RESERVAS",
      subtitle: "Servicios, Vouchers de Reserva y Payment Requests",
      color: { bg: "FFFFF3E0", font: "FFE65100" },
    },
    {
      role: 4,
      title: "CONTABILIDAD",
      subtitle: "Movimientos, Saldos y Transferencias",
      color: { bg: "FFFCE4EC", font: "FF880E4F" },
    },
  ];

  // Excluir superadmin (role 0) y nulos
  const operationalLogs = data.filter(
    (l) => l.user_role != null && l.user_role !== 0,
  );

  addTitleRows(
    ws,
    "Detalle de Gestión por Área",
    `Actividad operativa por rol (excl. Super Admin) — ${operationalLogs.length} registros de ${data.length} totales`,
    colCount,
  );
  setColumnWidths(ws, [14, 28, 12, 12, 12, 12, 12, 12]);

  // =================== SECCIONES POR ROL ===================
  for (const section of ROLE_SECTIONS) {
    const roleLogs = operationalLogs.filter(
      (l) => l.user_role === section.role,
    );
    if (roleLogs.length === 0) continue;

    // Cabecera de sección
    ws.addRow([]);
    const secTitleRow = ws.addRow([
      `▸ ${section.title} — ${section.subtitle} (${roleLogs.length} acciones)`,
    ]);
    ws.mergeCells(secTitleRow.number, 1, secTitleRow.number, colCount);
    secTitleRow.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: section.color.bg },
    };
    secTitleRow.getCell(1).font = {
      bold: true,
      size: 12,
      color: { argb: section.color.font },
      name: "Calibri",
    };
    secTitleRow.getCell(1).border = HEADER_BORDER;
    secTitleRow.getCell(1).alignment = {
      vertical: "middle",
      horizontal: "left",
    };
    secTitleRow.height = 28;

    // Cabecera de tabla
    const summaryHeader = ws.addRow([
      "DNI",
      "Nombre Completo",
      "Creados",
      "Actualizados",
      "Duplicados",
      "Eliminados",
      "Otros",
      "Total",
    ]);
    applyHeaderStyle(summaryHeader);

    // Agrupar por usuario (DNI → conteos por operación)
    const userMap = {};
    for (const log of roleLogs) {
      const userKey = log.dniuser || "SISTEMA";
      if (!userMap[userKey]) {
        userMap[userKey] = {
          name: log.user_fullname || "Sistema",
          CREATE: 0,
          UPDATE: 0,
          DUPLICATE: 0,
          DELETE: 0,
          OTHER: 0,
          TOTAL: 0,
        };
      }
      if (log.user_fullname && userMap[userKey].name === "Sistema") {
        userMap[userKey].name = log.user_fullname;
      }
      const op = log.operation_type;
      if (["CREATE", "UPDATE", "DUPLICATE", "DELETE"].includes(op)) {
        userMap[userKey][op]++;
      } else {
        userMap[userKey].OTHER++;
      }
      userMap[userKey].TOTAL++;
    }

    // Ordenar por total desc
    const sortedUsers = Object.entries(userMap).sort(
      (a, b) => b[1].TOTAL - a[1].TOTAL,
    );

    let rowIdx = 0;
    const sectionTotals = {
      CREATE: 0,
      UPDATE: 0,
      DUPLICATE: 0,
      DELETE: 0,
      OTHER: 0,
      TOTAL: 0,
    };
    for (const [dni, u] of sortedUsers) {
      const row = ws.addRow([
        dni,
        u.name,
        u.CREATE,
        u.UPDATE,
        u.DUPLICATE,
        u.DELETE,
        u.OTHER,
        u.TOTAL,
      ]);
      applyCellStyle(row, rowIdx % 2 === 1);

      if (u.CREATE > 0)
        row.getCell(3).font = {
          ...row.getCell(3).font,
          color: { argb: "FF2E7D32" },
          bold: true,
        };
      if (u.UPDATE > 0)
        row.getCell(4).font = {
          ...row.getCell(4).font,
          color: { argb: "FFE65100" },
          bold: true,
        };
      if (u.DUPLICATE > 0)
        row.getCell(5).font = {
          ...row.getCell(5).font,
          color: { argb: "FF1565C0" },
          bold: true,
        };
      if (u.DELETE > 0)
        row.getCell(6).font = {
          ...row.getCell(6).font,
          color: { argb: "FFC62828" },
          bold: true,
        };
      row.getCell(8).font = { ...row.getCell(8).font, bold: true };

      for (const k of [
        "CREATE",
        "UPDATE",
        "DUPLICATE",
        "DELETE",
        "OTHER",
        "TOTAL",
      ])
        sectionTotals[k] += u[k];
      rowIdx++;
    }

    // Fila de totales de sección
    const sTotalRow = ws.addRow([
      "",
      `TOTAL ${section.title}`,
      sectionTotals.CREATE,
      sectionTotals.UPDATE,
      sectionTotals.DUPLICATE,
      sectionTotals.DELETE,
      sectionTotals.OTHER,
      sectionTotals.TOTAL,
    ]);
    sTotalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: section.color.bg },
      };
      cell.font = {
        bold: true,
        size: 11,
        color: { argb: section.color.font },
        name: "Calibri",
      };
      cell.border = CELL_BORDER;
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    sTotalRow.height = 24;
  }

  autoFitColumns(ws);
}

// ============== HOOK ==============

export function useLogExport(fetchAllForExport, toastRef) {
  const [exportLoading, setExportLoading] = useState(false);

  const exportToExcel = useCallback(
    async (filters) => {
      setExportLoading(true);
      try {
        const data = await fetchAllForExport(50000); // Sin límite práctico

        if (!data || data.length === 0) {
          toastRef.current?.show({
            severity: "warn",
            summary: "Sin datos",
            detail: "No hay registros para exportar con los filtros actuales",
            life: 3000,
          });
          return;
        }

        const wb = new ExcelJS.Workbook();
        wb.creator = "Venso Tours";
        wb.created = new Date();

        // Construir las 6 hojas
        buildAllLogsSheet(wb, data);
        buildByUserSheet(wb, data);
        buildByOperationSheet(wb, data);
        buildByEntitySheet(wb, data);
        buildSummarySheet(wb, data);
        buildVentasDetailSheet(wb, data);

        // Generar archivo
        const buffer = await wb.xlsx.writeBuffer();
        const dateStr = new Date().toISOString().split("T")[0];
        const filterSuffix =
          filters?.dateFrom || filters?.dateTo
            ? `_${filters.dateFrom ? filters.dateFrom.toISOString().split("T")[0] : "inicio"}_${filters.dateTo ? filters.dateTo.toISOString().split("T")[0] : "fin"}`
            : "";
        const filename = `logs_actividad${filterSuffix}_${dateStr}.xlsx`;

        saveAs(
          new Blob([buffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
          filename,
        );

        toastRef.current?.show({
          severity: "success",
          summary: "Exportación exitosa",
          detail: `Se exportaron ${data.length} registros en 6 hojas`,
          life: 4000,
        });
      } catch (error) {
        console.error("Error al exportar:", error);
        toastRef.current?.show({
          severity: "error",
          summary: "Error",
          detail: "Error al exportar los datos: " + (error.message || ""),
          life: 4000,
        });
      } finally {
        setExportLoading(false);
      }
    },
    [fetchAllForExport, toastRef],
  );

  return { exportLoading, exportToExcel };
}
