import React, { useCallback, useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  FaBullseye,
  FaChartLine,
  FaCheckCircle,
  FaFileExcel,
  FaFilter,
  FaInfoCircle,
  FaLayerGroup,
  FaMoneyBillWave,
  FaPercentage,
  FaPlus,
  FaSyncAlt,
  FaTimes,
  FaTrash,
  FaUserCheck,
  FaUsers,
} from "react-icons/fa";
import { useAuth } from "../../../context/AuthContext";
import { normalizePermissions } from "../../../utils/permissionRoutes";
import comisionesService, {
  invalidateComisionesCache,
} from "../../../services/comisionesService";
import {
  COMMISSION_RATES,
  COMMISSION_TIERS,
  calculateCommissionAmount,
  commissionRateForFee,
  conditionForTotal,
  getCommissionSaleTotal as getVentaTotal,
  getCommissionableSaleTotal as getVentaComisionable,
  normalizeCommissionNumber as normalizeNumber,
  progressForGoal,
  tierForTotal,
  tierKeyForCondition,
} from "../../../utils/commissionUtils";
import "./Comisiones.scss";

const MONTHS = [
  { value: "", label: "Todo el año" },
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
];

const COMMISSION_TYPES = [
  { value: "personal", label: "Personal", description: "Cada vendedora activa comisión al superar su propia meta." },
  { value: "general", label: "General", description: "Todas las ventas del mes activan comisión si el total general supera la meta." },
];

const UNUSED_COMMISSION_TIERS = [
  { total: 15000, condition: "Meta mínima" },
  { total: 20000, condition: "Buen desempeño" },
  { total: 25000, condition: "Buen desempeño" },
  { total: 30000, condition: "Buen desempeño" },
  { total: 35000, condition: "Buen desempeño" },
  { total: 40000, condition: "Alto rendimiento" },
  { total: 45000, condition: "Alto rendimiento" },
  { total: 50000, condition: "Alto rendimiento" },
  { total: 55000, condition: "Alto rendimiento" },
  { total: 60000, condition: "Alto rendimiento" },
  { total: 70000, condition: "Alto rendimiento" },
  { total: 75000, condition: "Alto rendimiento" },
  { total: 80000, condition: "Alto rendimiento" },
  { total: 85000, condition: "Alto rendimiento" },
  { total: 90000, condition: "Alto rendimiento" },
  { total: 100000, condition: "Meta top" },
  { total: 120000, condition: "META TOP" },
];

const COMMISSION_NOTES = [
  "Vuelos internacionales: comisión 40%; pago mínimo 70% y 100% para vuelos internacionales.",
  "Bloqueo México: USD 50 por persona y suma a la meta.",
  "Tours sueltos tradicionales: comisión del 30% de la ganancia de venta por tour.",
  "Tours privados de experiencia: suman a la meta y comisionan según fee.",
  "Tripadvisor / Google Ads: USD 5 por comentario, pagado junto a comisiones.",
  "Bono grupal mensual: USD 120. Ejecutiva del mes: USD 100.",
];

const TIER_EXCEL_COLORS = {
  pending: "FFE2E8F0",
  minimum: "FFFFF3B0",
  good: "FFD9F99D",
  high: "FFBBF7D0",
  top: "FF99F6E4",
};

const formatMoney = (value, currency = "USD") =>
  Number(value || 0).toLocaleString("es-PE", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const unusedNormalizeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const unusedGetVentaTotal = (row = {}) =>
  normalizeNumber(row.venta_total ?? row.total_final);

const unusedGetVentaComisionable = (row = {}) =>
  normalizeNumber(row.venta_comisionable ?? row.subtotal_final ?? row.total_final);

const unusedCommissionRateForFee = (feePercent) => {
  const normalizedFee = Math.max(25, Math.round(normalizeNumber(feePercent) / 5) * 5);
  const configuredRate = COMMISSION_RATES.find((item) => item.fee === normalizedFee)?.rate;
  if (configuredRate) return configuredRate;
  if (normalizedFee > 45) return 1.8 + Math.floor((normalizedFee - 45) / 5) * 0.1;
  return 1.2;
};

const unusedCalculateCommissionAmount = (saleAmount, commissionRatePercent) =>
  Math.round(((normalizeNumber(saleAmount) * normalizeNumber(commissionRatePercent)) / 100) * 100) / 100;

const unusedConditionForTotal = (total) => tierForTotal(total).condition;

const tierClassForCondition = (condition = "") => {
  const normalized = String(condition).toLowerCase();
  if (normalized.includes("meta top")) return "top";
  if (normalized.includes("alto")) return "high";
  if (normalized.includes("buen")) return "good";
  if (normalized.includes("mínima") || normalized.includes("minima")) return "minimum";
  return "pending";
};

const unusedTierKeyForCondition = (condition = "") => tierClassForCondition(condition);

const unusedTierForTotal = (total) => {
  const amount = normalizeNumber(total);
  const achieved = [...COMMISSION_TIERS]
    .filter((tier) => amount >= tier.total)
    .sort((a, b) => b.total - a.total)[0];

  if (!achieved) {
    const next = COMMISSION_TIERS[0];
    return {
      total: 0,
      nextTotal: next.total,
      condition: "Meta no alcanzada",
      level: "pending",
      label: "Pendiente",
      progressBase: next.total,
    };
  }

  const nextTier = COMMISSION_TIERS.find((tier) => tier.total > achieved.total);
  return {
    ...achieved,
    nextTotal: nextTier?.total || achieved.total,
    level: tierClassForCondition(achieved.condition),
    label: achieved.condition,
    progressBase: nextTier?.total || achieved.total,
  };
};

const unusedProgressForGoal = (value, goal) => {
  const target = normalizeNumber(goal);
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((normalizeNumber(value) / target) * 100)));
};

const findMetaFor = (metas = [], anio, mes, tipo) => {
  const normalizedType = tipo || "personal";
  const year = Number(anio);
  const month = Number(mes);
  return metas.find(
    (item) =>
      Number(item.anio) === year &&
      Number(item.mes) === month &&
      String(item.tipo_comision || "personal") === normalizedType,
  );
};


const getSellerKey = (row) =>
  String(row?.createdby || row?.vendedor_dni || row?.vendedor_nombre || "sin-vendedor").trim() ||
  "sin-vendedor";

const getSellerName = (row) =>
  String(row?.vendedor_nombre || row?.createdby || "Sin vendedor asignado").trim() ||
  "Sin vendedor asignado";

const monthLabelFor = (value) =>
  MONTHS.find((month) => Number(month.value) === Number(value))?.label || value || "Anual";

const currentYear = new Date().getFullYear();

export function Comisiones() {
  const { auth } = useAuth();
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [generalResumen, setGeneralResumen] = useState(null);
  const [vendedores, setVendedores] = useState([]);
  const [metas, setMetas] = useState([]);
  const [filters, setFilters] = useState({
    anio: currentYear,
    mes: new Date().getMonth() + 1,
    vendedor: "",
    tipo_comision: "personal",
  });
  const [metaForm, setMetaForm] = useState({
    id: null,
    anio: currentYear,
    mes: new Date().getMonth() + 1,
    monto: "15000",
    moneda: "USD",
    tipo_comision: "personal",
  });

  const permissions = useMemo(
    () => normalizePermissions(auth?.permissions),
    [auth?.permissions],
  );
  const canManageMeta =
    Number(auth?.role) === 0 || permissions.actions.includes("manage_sales_goals");

  const loadData = useCallback(async ({ force = false } = {}) => {
    if (force) invalidateComisionesCache({ notify: false });
    setLoading(true);
    setError(null);
    try {
      const params = {
        anio: Number(filters.anio) || undefined,
        mes: filters.mes ? Number(filters.mes) : undefined,
        vendedor: filters.vendedor || undefined,
        tipo_comision: filters.tipo_comision || undefined,
      };
      const generalParams = {
        ...params,
        vendedor: undefined,
        tipo_comision: "general",
      };
      const requestOptions = force ? { skipCache: true } : {};
      const [resumenData, generalResumenData, vendedoresData, metasData] = await Promise.all([
        comisionesService.getResumen(params, requestOptions),
        comisionesService.getResumen(generalParams, requestOptions),
        comisionesService.getVendedores(requestOptions),
        comisionesService.getMetaMinima({ anio: params.anio }, requestOptions),
      ]);
      setResumen(resumenData);
      setGeneralResumen(generalResumenData);
      setVendedores(Array.isArray(vendedoresData) ? vendedoresData : []);
      setMetas(Array.isArray(metasData) ? metasData : []);
    } catch (err) {
      setError(
        err?.response?.data?.message || err?.message || "No se pudo cargar comisiones",
      );
    } finally {
      setLoading(false);
    }
  }, [filters.anio, filters.mes, filters.vendedor, filters.tipo_comision]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handleComisionesInvalidated = () => {
      loadData({ force: true });
    };

    window.addEventListener("comisionesCacheInvalidated", handleComisionesInvalidated);
    return () => {
      window.removeEventListener("comisionesCacheInvalidated", handleComisionesInvalidated);
    };
  }, [loadData]);

  const refreshFiles = () => {
    loadData({ force: true });
  };

  const handleMetaSubmit = async (event) => {
    event.preventDefault();
    if (!canManageMeta) return;
    const payload = {
      anio: Number(metaForm.anio),
      mes: Number(metaForm.mes),
      monto: Number(metaForm.monto),
      moneda: String(metaForm.moneda || "USD").toUpperCase(),
      tipo_comision: metaForm.tipo_comision || "personal",
    };
    try {
      if (metaForm.id) {
        await comisionesService.updateMetaMinima(metaForm.id, payload);
      } else {
        await comisionesService.createMetaMinima(payload);
      }
      setMetaForm({ ...metaForm, id: null, monto: "15000", tipo_comision: metaForm.tipo_comision || "personal" });
      await loadData({ force: true });
    } catch (err) {
      setError(
        err?.response?.data?.message || err?.message || "No se pudo guardar la meta",
      );
    }
  };

  const editMeta = (meta) => {
    setMetaForm({
      id: meta.id,
      anio: meta.anio,
      mes: meta.mes,
      monto: String(meta.monto),
      moneda: meta.moneda || "USD",
      tipo_comision: meta.tipo_comision || "personal",
    });
  };

  const deleteMeta = async (meta) => {
    if (!canManageMeta) return;
    if (!window.confirm(`¿Eliminar la meta ${meta.tipo_comision || "personal"} de ${meta.mes}/${meta.anio}?`)) return;
    try {
      await comisionesService.deleteMetaMinima(meta.id);
      await loadData({ force: true });
    } catch (err) {
      setError(
        err?.response?.data?.message || err?.message || "No se pudo eliminar la meta",
      );
    }
  };

  const rows = resumen?.rows || [];
  const monthNumber = Number(filters.mes) || new Date().getMonth() + 1;
  const personalMeta = findMetaFor(metas, filters.anio, monthNumber, "personal") ||
    (String(resumen?.meta_minima?.tipo_comision || "") === "personal" ? resumen?.meta_minima : null);
  const generalMeta = findMetaFor(metas, filters.anio, monthNumber, "general") ||
    (String(generalResumen?.meta_minima?.tipo_comision || "") === "general" ? generalResumen?.meta_minima : null);
  const selectedMeta = filters.tipo_comision === "general" ? generalMeta : personalMeta;
  const personalMetaAmount = normalizeNumber(personalMeta?.monto);
  const generalMetaAmount = normalizeNumber(generalMeta?.monto);
  const currency = resumen?.moneda || selectedMeta?.moneda || personalMeta?.moneda || generalMeta?.moneda || "USD";
  const commissionType = filters.tipo_comision || "personal";
  const isGeneralCommission = commissionType === "general";
  const allMonthRows = generalResumen?.rows || rows;
  const generalMonthlySales = allMonthRows.reduce((acc, row) => acc + getVentaTotal(row), 0);
  const generalGoalActive = generalMetaAmount > 0 && generalMonthlySales >= generalMetaAmount;
  const commissionTypeLabel = COMMISSION_TYPES.find((item) => item.value === commissionType)?.label || "Personal";
  const generalTier = tierForTotal(generalMonthlySales);

  const sellerStats = useMemo(() => {
    const stats = new Map();
    rows.forEach((row) => {
      const sellerKey = getSellerKey(row);
      const total = getVentaComisionable(row);
      const saleTotal = getVentaTotal(row);
      const feePercent = normalizeNumber(row.fee_percent) || 25;
      if (!stats.has(sellerKey)) {
        stats.set(sellerKey, {
          key: sellerKey,
          name: getSellerName(row),
          total: 0,
          saleTotal: 0,
          vouchers: 0,
          commission: 0,
          condition: "Meta no alcanzada",
          active: false,
          rates: new Set(),
          tier: tierForTotal(0),
        });
      }
      const current = stats.get(sellerKey);
      current.total += total;
      current.saleTotal += saleTotal;
      current.vouchers += 1;
      current.rates.add(feePercent);
    });

    return Array.from(stats.values())
      .map((seller) => {
        const sellerTier = tierForTotal(seller.total);
        const active = isGeneralCommission
          ? generalGoalActive
          : personalMetaAmount > 0 && seller.total >= personalMetaAmount;
        const condition = active
          ? conditionForTotal(isGeneralCommission ? generalMonthlySales : seller.total)
          : "Meta no alcanzada";
        return {
          ...seller,
          active,
          condition,
          tier: active ? (isGeneralCommission ? generalTier : sellerTier) : tierForTotal(0),
          personalTier: sellerTier,
          progress: progressForGoal(
            isGeneralCommission ? seller.saleTotal : seller.total,
            isGeneralCommission ? generalMetaAmount : personalMetaAmount,
          ),
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [rows, personalMetaAmount, isGeneralCommission, generalGoalActive, generalMonthlySales, generalTier, generalMetaAmount]);

  const sellerStatsByKey = useMemo(() => {
    const map = new Map();
    sellerStats.forEach((seller) => map.set(seller.key, seller));
    return map;
  }, [sellerStats]);

  const rowsWithSellerGoal = useMemo(
    () =>
      rows.map((row) => {
        const sellerKey = getSellerKey(row);
        const seller = sellerStatsByKey.get(sellerKey);
        const saleAmount = getVentaComisionable(row);
        const feePercent = normalizeNumber(row.fee_percent) || 25;
        const commissionRate = commissionRateForFee(feePercent);
        const commissionAmount = calculateCommissionAmount(saleAmount, commissionRate);
        const tier = seller?.tier || tierForTotal(0);
        return {
          ...row,
          sellerGoalActive: Boolean(seller?.active),
          sellerGoalCondition: seller?.condition || "Meta no alcanzada",
          sellerGoalTotal: seller?.total || 0,
          sellerTierLevel: tier.level,
          commissionRatePercent: commissionRate,
          commissionAmount,
          ventaTotalAmount: getVentaTotal(row),
          ventaComisionableAmount: saleAmount,
        };
      }),
    [rows, sellerStatsByKey],
  );

  const sellerCommissionByKey = useMemo(() => {
    const map = new Map();
    rowsWithSellerGoal.forEach((row) => {
      const sellerKey = getSellerKey(row);
      map.set(sellerKey, (map.get(sellerKey) || 0) + normalizeNumber(row.commissionAmount));
    });
    return map;
  }, [rowsWithSellerGoal]);

  const recalculatedTotalSales = rowsWithSellerGoal.reduce(
    (acc, row) => acc + normalizeNumber(row.ventaComisionableAmount),
    0,
  );
  const recalculatedTotalGrossSales = rowsWithSellerGoal.reduce(
    (acc, row) => acc + normalizeNumber(row.ventaTotalAmount),
    0,
  );
  const recalculatedTotalCommissions = rowsWithSellerGoal.reduce(
    (acc, row) => acc + normalizeNumber(row.commissionAmount),
    0,
  );
  const personalGoalSummary = personalMeta
    ? `${sellerStats.filter((seller) => seller.total >= personalMetaAmount).length} de ${sellerStats.length} vendedora(s) alcanzaron meta personal`
    : "Configura meta personal";
  const sellerGoalSummary = selectedMeta
    ? isGeneralCommission
      ? generalGoalActive
        ? "Meta general alcanzada"
        : "Meta general pendiente"
      : personalGoalSummary
    : "Configura la meta para activar comisiones";

  const metasByType = useMemo(() => {
    const grouped = { personal: [], general: [] };
    metas.forEach((meta) => {
      const type = meta.tipo_comision === "general" ? "general" : "personal";
      grouped[type].push(meta);
    });
    Object.keys(grouped).forEach((type) => {
      grouped[type].sort((a, b) => Number(b.anio) - Number(a.anio) || Number(b.mes) - Number(a.mes));
    });
    return grouped;
  }, [metas]);

  const exportComisionesExcel = async () => {
    setExportingExcel(true);
    setError(null);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Venso Tours";
      workbook.created = new Date();
      workbook.modified = new Date();

      const periodLabel = `${monthLabelFor(filters.mes)} ${filters.anio || currentYear}`;
      const border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF047857" } };
      const headerFont = { bold: true, color: { argb: "FFFFFFFF" } };
      const moneyFormat = `"${currency}" #,##0.00`;
      const generalCondition = generalGoalActive ? generalTier.condition : "Meta no alcanzada";
      const sellersOnGoal = sellerStats.filter((seller) => seller.active).length;

      const styleHeaderRow = (sheet) => {
        sheet.getRow(1).height = 22;
        sheet.getRow(1).eachCell((cell) => {
          cell.fill = headerFill;
          cell.font = headerFont;
          cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
          cell.border = border;
        });
      };

      const styleSheet = (sheet, moneyColumns = []) => {
        styleHeaderRow(sheet);
        sheet.eachRow((row, rowNumber) => {
          row.eachCell((cell) => {
            cell.border = border;
            cell.alignment = { vertical: "middle", wrapText: true };
            if (rowNumber > 1 && moneyColumns.includes(cell.col) && typeof cell.value === "number") {
              cell.numFmt = moneyFormat;
            }
          });
        });
      };

      const summarySheet = workbook.addWorksheet("Resumen");
      summarySheet.columns = [{ width: 32 }, { width: 22 }, { width: 28 }, { width: 24 }];
      summarySheet.mergeCells("A1:D1");
      summarySheet.getCell("A1").value = `Reporte de comisiones · ${periodLabel}`;
      summarySheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF064E3B" } };
      summarySheet.getCell("A1").alignment = { horizontal: "center" };
      summarySheet.addRow([]);
      summarySheet.addRows([
        ["Tipo activo", commissionTypeLabel, "Moneda", currency],
        ["Venta total", recalculatedTotalGrossSales, "Comisión generada", recalculatedTotalCommissions],
        ["Total comisionable", recalculatedTotalSales, "", ""],
        ["Meta personal", personalMeta ? normalizeNumber(personalMeta.monto) : 0, "Vendedoras en meta", sellerStats.filter((seller) => seller.total >= personalMetaAmount).length],
        ["Meta general", generalMeta ? normalizeNumber(generalMeta.monto) : 0, "Estado general", generalCondition],
        ["Vouchers visibles", rowsWithSellerGoal.length, "Total mensual equipo", generalMonthlySales],
      ]);
      summarySheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.border = border;
          cell.alignment = { vertical: "middle", wrapText: true };
          if (rowNumber >= 3 && [1, 3].includes(cell.col)) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECFDF5" } };
            cell.font = { bold: true, color: { argb: "FF065F46" } };
          }
          if ([2, 4].includes(cell.col) && typeof cell.value === "number") cell.numFmt = moneyFormat;
        });
      });

      const sellersSheet = workbook.addWorksheet("Vendedoras");
      sellersSheet.columns = [
        { header: "Vendedor(a)", key: "seller", width: 34 },
        { header: "Venta total", key: "saleTotal", width: 20 },
        { header: "Total comisionable", key: "total", width: 20 },
        { header: "Vouchers", key: "vouchers", width: 12 },
        { header: "Condición", key: "condition", width: 22 },
        { header: "Avance", key: "progress", width: 14 },
        { header: "Comisión", key: "commission", width: 18 },
      ];
      sellerStats.forEach((seller) => sellersSheet.addRow({
        seller: seller.name,
        saleTotal: seller.saleTotal,
        total: seller.total,
        vouchers: seller.vouchers,
        condition: seller.condition,
        progress: `${seller.progress}%`,
        commission: sellerCommissionByKey.get(seller.key) || 0,
      }));
      styleSheet(sellersSheet, [2, 3, 7]);

      const salesSheet = workbook.addWorksheet("Ventas");
      salesSheet.columns = [
        { header: "Voucher", key: "voucher", width: 30 },
        { header: "Fecha", key: "date", width: 14 },
        { header: "Vendedor(a)", key: "seller", width: 32 },
        { header: "Título", key: "title", width: 42 },
        { header: "Venta total", key: "saleTotal", width: 20 },
        { header: "Venta comisionable", key: "sale", width: 20 },
        { header: "Fee", key: "fee", width: 10 },
        { header: "% comisión", key: "rate", width: 14 },
        { header: "Comisión", key: "commission", width: 18 },
        { header: "Condición", key: "condition", width: 22 },
      ];
      rowsWithSellerGoal.forEach((row) => salesSheet.addRow({
        voucher: row.codigo,
        date: row.fecha ? new Date(row.fecha).toLocaleDateString("es-PE") : "",
        seller: row.vendedor_nombre,
        title: row.titulo,
        saleTotal: normalizeNumber(row.ventaTotalAmount),
        sale: normalizeNumber(row.ventaComisionableAmount),
        fee: `${normalizeNumber(row.fee_percent) || 25}%`,
        rate: `${row.commissionRatePercent}%`,
        commission: normalizeNumber(row.commissionAmount),
        condition: row.sellerGoalActive ? row.sellerGoalCondition : "Meta no alcanzada",
      }));
      styleSheet(salesSheet, [5, 6, 9]);

      const metasSheet = workbook.addWorksheet("Metas");
      metasSheet.columns = [
        { header: "Tipo", key: "type", width: 16 },
        { header: "Mes", key: "month", width: 16 },
        { header: "Año", key: "year", width: 10 },
        { header: "Monto", key: "amount", width: 18 },
        { header: "Moneda", key: "currency", width: 12 },
      ];
      [...metasByType.personal, ...metasByType.general].forEach((item) => metasSheet.addRow({
        type: item.tipo_comision === "general" ? "General" : "Personal",
        month: monthLabelFor(item.mes),
        year: Number(item.anio),
        amount: normalizeNumber(item.monto),
        currency: item.moneda || currency,
      }));
      styleSheet(metasSheet, [4]);

      const rulesSheet = workbook.addWorksheet("Leyenda");
      rulesSheet.columns = [
        { header: "Venta total", key: "total", width: 18 },
        ...COMMISSION_RATES.map((rate) => ({ header: `Fee ${rate.fee}%`, key: `fee_${rate.fee}`, width: 16 })),
        { header: "Condición", key: "condition", width: 22 },
      ];
      COMMISSION_TIERS.forEach((tier) => rulesSheet.addRow({
        total: tier.total,
        ...Object.fromEntries(COMMISSION_RATES.map((rate) => [`fee_${rate.fee}`, (tier.total * rate.rate) / 100])),
        condition: tier.condition,
      }));
      styleSheet(rulesSheet, [1, 2, 3, 4, 5, 6]);

      [sellersSheet, salesSheet, rulesSheet].forEach((sheet) => {
        sheet.eachRow((row, rowNumber) => {
          if (rowNumber <= 1) return;
          const conditionCell = sheet === salesSheet ? 9 : sheet === sellersSheet ? 4 : 7;
          const condition = String(row.getCell(conditionCell).value || "");
          const color = TIER_EXCEL_COLORS[tierKeyForCondition(condition)] || TIER_EXCEL_COLORS.pending;
          row.eachCell((cell) => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
          });
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const safeMonth = filters.mes ? String(filters.mes).padStart(2, "0") : "anual";
      saveAs(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `comisiones_${filters.anio || currentYear}_${safeMonth}_${commissionType}.xlsx`,
      );
    } catch (err) {
      setError(err?.message || "No se pudo exportar el Excel de comisiones");
    } finally {
      setExportingExcel(false);
    }
  };

  const renderMetaList = (type) => {
    const items = metasByType[type] || [];
    return (
      <div className={`commission-goals-card__bucket commission-goals-card__bucket--${type}`}>
        <div className="commission-goals-card__bucket-head">
          <span>{type === "general" ? <FaLayerGroup /> : <FaUsers />}</span>
          <div>
            <h3>Metas {type === "general" ? "generales" : "personales"}</h3>
            <p>
              {type === "general"
                ? "Evalúan el total vendido por todo el equipo durante el mes."
                : "Evalúan el total mensual de cada vendedor(a)."}
            </p>
          </div>
        </div>
        <div className="commission-goals-card__list">
          {items.length === 0 ? (
            <span>No hay metas {type === "general" ? "generales" : "personales"} registradas.</span>
          ) : (
            items.map((item) => (
              <article key={item.id}>
                <button type="button" onClick={() => editMeta(item)} disabled={!canManageMeta}>
                  {monthLabelFor(item.mes)} {item.anio}
                </button>
                <strong>{formatMoney(item.monto, item.moneda)}</strong>
                <em className={`commission-goals-card__type commission-goals-card__type--${item.tipo_comision || "personal"}`}>
                  {(COMMISSION_TYPES.find((commissionTypeItem) => commissionTypeItem.value === (item.tipo_comision || "personal"))?.label) || "Personal"}
                </em>
                {canManageMeta && (
                  <button type="button" className="danger" onClick={() => deleteMeta(item)}>
                    <FaTrash />
                  </button>
                )}
              </article>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="admin-comisiones-page">
      <header className="admin-comisiones-page__header">
        <div className="admin-comisiones-page__title-block">
          <span className="admin-comisiones-page__icon">
            <FaPercentage />
          </span>
          <div>
            <h1>Comisiones</h1>
            <p>
              Administración de metas, fees, vouchers vendidos y comisiones por vendedora.
            </p>
          </div>
        </div>

        <div className="admin-comisiones-page__actions">
          <button
            type="button"
            className="admin-comisiones-page__export"
            onClick={exportComisionesExcel}
            disabled={loading || exportingExcel || rowsWithSellerGoal.length === 0}
          >
            <FaFileExcel />
            {exportingExcel ? "Exportando..." : "Exportar Excel"}
          </button>
          <button
            type="button"
            className="admin-comisiones-page__refresh"
            onClick={refreshFiles}
            disabled={loading}
          >
            <FaSyncAlt />
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </header>

      <section className="commission-rules-card commission-rules-card--collapsed">
        <div className="commission-rules-card__head">
          <span>
            <FaMoneyBillWave /> Leyenda de fees y reglas de comisión
          </span>
          <button
            type="button"
            className="commission-rules-card__open"
            onClick={() => setRulesModalOpen(true)}
          >
            <FaInfoCircle /> Ver leyenda
          </button>
        </div>
        <p className="commission-rules-card__summary">
          Las comisiones se activan según el tipo configurado: personal por vendedora o general por el total mensual del equipo.
        </p>
      </section>

      {rulesModalOpen && (
        <div
          className="commission-rules-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Leyenda de fees y reglas de comisión"
        >
          <div className="commission-rules-modal__backdrop" onClick={() => setRulesModalOpen(false)} />
          <div className="commission-rules-modal__content">
            <button
              type="button"
              className="commission-rules-modal__close"
              onClick={() => setRulesModalOpen(false)}
              aria-label="Cerrar leyenda"
            >
              <FaTimes />
            </button>
            <div className="commission-rules-modal__header">
              <span><FaMoneyBillWave /></span>
              <div>
                <h2>Leyenda de comisiones</h2>
                <p>La meta puede evaluarse en modo personal por vendedora o general por total mensual. Al activarse, cada voucher genera comisión según el fee aplicado.</p>
              </div>
            </div>
            <div className="commission-rules-card__matrix commission-rules-card__matrix--tiers">
              <div className="commission-tier-grid" role="table" aria-label="Tabla de comisiones por venta total y fee">
                <div className="commission-tier-grid__row commission-tier-grid__row--head" role="row">
                  <span role="columnheader">Venta total</span>
                  {COMMISSION_RATES.map((item) => (
                    <span role="columnheader" key={item.fee}>
                      Fee {item.fee}% <small>{item.rate}%</small>
                    </span>
                  ))}
                  <span role="columnheader">Condición</span>
                </div>
                {COMMISSION_TIERS.map((tier) => {
                  const tierMeta = tierForTotal(tier.total);
                  return (
                  <div className={`commission-tier-grid__row commission-tier-grid__row--${tierMeta.level}`} role="row" key={tier.total}>
                    <strong role="cell">{formatMoney(tier.total)}</strong>
                    {COMMISSION_RATES.map((item) => (
                      <span role="cell" key={`${tier.total}-${item.fee}`}>
                        {formatMoney((tier.total * item.rate) / 100)}
                      </span>
                    ))}
                    <em role="cell">{tier.condition}</em>
                  </div>
                  );
                })}
              </div>
            </div>
            <ul className="commission-rules-card__notes">
              {COMMISSION_NOTES.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <section className="commission-dashboard">
        <div className="commission-mode-panel" aria-label="Tipo de comisión">
          {COMMISSION_TYPES.map((type) => {
            const isActive = filters.tipo_comision === type.value;
            const typeMeta = type.value === "general" ? generalMeta : personalMeta;
            const typeTotal = type.value === "general" ? generalMonthlySales : recalculatedTotalSales;
            const typeGoal = normalizeNumber(typeMeta?.monto);
            const typeReached = typeGoal > 0 && typeTotal >= typeGoal;
            const typeTier = tierForTotal(typeTotal);
            return (
              <button
                type="button"
                key={type.value}
                className={`commission-mode-panel__card ${isActive ? "is-active" : ""} ${typeReached ? `is-${typeTier.level}` : "is-pending"}`}
                onClick={() => {
                  setFilters((prev) => ({ ...prev, tipo_comision: type.value }));
                  setMetaForm((prev) => ({ ...prev, tipo_comision: type.value }));
                }}
              >
                <span className="commission-mode-panel__icon">
                  {type.value === "personal" ? <FaUserCheck /> : <FaChartLine />}
                </span>
                <span className="commission-mode-panel__content">
                  <strong>Comisión {type.label.toLowerCase()}</strong>
                  <small>{type.description}</small>
                  <em>
                    {typeMeta ? `${formatMoney(typeTotal, currency)} / ${formatMoney(typeMeta.monto, typeMeta.moneda)}` : "Meta pendiente"}
                  </em>
                </span>
                <span className="commission-mode-panel__progress" aria-hidden="true">
                  <i style={{ width: `${progressForGoal(typeTotal, typeGoal)}%` }} />
                </span>
              </button>
            );
          })}
        </div>

        <div className="commission-dashboard__filters">
          <label>
            <FaFilter /> Año
            <input
              type="number"
              value={filters.anio}
              min="2020"
              max="2100"
              onChange={(e) => setFilters((prev) => ({ ...prev, anio: e.target.value }))}
            />
          </label>
          <label>
            Mes
            <select
              value={filters.mes}
              onChange={(e) => setFilters((prev) => ({ ...prev, mes: e.target.value }))}
            >
              {MONTHS.map((month) => (
                <option value={month.value} key={month.label}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <FaUsers /> Vendedor(a)
            <select
              value={filters.vendedor}
              onChange={(e) => setFilters((prev) => ({ ...prev, vendedor: e.target.value }))}
            >
              <option value="">Todos</option>
              {vendedores.map((seller) => (
                <option value={seller.dniuser} key={seller.dniuser}>
                  {seller.nombre_completo || seller.dniuser}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <div className="commission-dashboard__error">{error}</div>}

        <div className="commission-dashboard__kpis">
          <article className="commission-dashboard__kpi-card commission-dashboard__kpi-card--sales">
            <span>Venta total filtrada</span>
            <strong>{formatMoney(recalculatedTotalGrossSales, currency)}</strong>
            <small>Base de meta general</small>
          </article>
          <article className="commission-dashboard__kpi-card commission-dashboard__kpi-card--sales">
            <span>Total comisionable filtrado</span>
            <strong>{formatMoney(recalculatedTotalSales, currency)}</strong>
            <small>{rowsWithSellerGoal.length} voucher(s) visibles</small>
          </article>
          <article className="commission-dashboard__kpi-card commission-dashboard__kpi-card--commission">
            <span>Comisión generada</span>
            <strong>{formatMoney(recalculatedTotalCommissions, currency)}</strong>
            <small>{sellerGoalSummary}</small>
          </article>
          <article className={`commission-dashboard__kpi-card commission-dashboard__kpi-card--general is-${generalGoalActive ? generalTier.level : "pending"}`}>
            <span>Meta general del mes</span>
            <strong>{generalMeta ? formatMoney(generalMeta.monto, generalMeta.moneda) : "Sin meta"}</strong>
            <small>{generalMeta ? `${formatMoney(generalMonthlySales, currency)} vendido · ${generalGoalActive ? generalTier.condition : "pendiente"}` : "Configura una meta general"}</small>
            <i className="commission-dashboard__goal-bar"><b style={{ width: `${progressForGoal(generalMonthlySales, generalMetaAmount)}%` }} /></i>
          </article>
          <article className="commission-dashboard__kpi-card commission-dashboard__kpi-card--mode">
            <span>Modo activo</span>
            <strong>{commissionTypeLabel}</strong>
            <small>{selectedMeta ? formatMoney(selectedMeta.monto, selectedMeta.moneda) : "Sin meta configurada"}</small>
          </article>
        </div>

        {sellerStats.length > 0 && (
          <div className="commission-dashboard__seller-grid">
            {sellerStats.map((seller) => (
              <article
                key={seller.key}
                className={`commission-seller-card ${seller.active ? "is-goal-met" : "is-goal-pending"} is-${seller.active ? seller.tier.level : "pending"}`}
              >
                <header>
                  <span>{seller.name}</span>
                  {seller.active ? <FaCheckCircle /> : <FaBullseye />}
                </header>
                <div>
                  <strong>{formatMoney(seller.total, currency)}</strong>
                  <em>{seller.vouchers} voucher(s)</em>
                </div>
                <i className="commission-seller-card__bar"><b style={{ width: `${seller.progress}%` }} /></i>
                <small>
                  {isGeneralCommission ? `Meta general · ${generalTier.condition}` : seller.condition} · Comisión {formatMoney(sellerCommissionByKey.get(seller.key) || 0, currency)}
                </small>
              </article>
            ))}
          </div>
        )}

        <div className="commission-dashboard__table-wrap">
          <table className="commission-dashboard__table">
            <thead>
              <tr>
                <th>Voucher</th>
                <th>Fecha</th>
                <th>Vendedor(a)</th>
                <th>Título</th>
                <th>Venta total</th>
                <th>Venta comisionable</th>
                <th>Fee</th>
                <th>Comisión</th>
                <th>Condición</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan="9">No hay vouchers vendidos para los filtros seleccionados.</td>
                </tr>
              ) : (
                rowsWithSellerGoal.map((row) => (
                  <tr
                    key={row.id}
                    className={row.sellerGoalActive ? `commission-dashboard__row--goal-met commission-dashboard__row--${row.sellerTierLevel}` : "commission-dashboard__row--pending"}
                  >
                    <td>{row.codigo}</td>
                    <td>{new Date(row.fecha).toLocaleDateString("es-PE")}</td>
                    <td>
                      <strong>{row.vendedor_nombre}</strong>
                      <small>{row.sellerGoalCondition}</small>
                    </td>
                    <td>{row.titulo}</td>
                    <td>{formatMoney(row.ventaTotalAmount, currency)}</td>
                    <td>{formatMoney(row.ventaComisionableAmount, currency)}</td>
                    <td>
                      {row.fee_percent}%
                      <small>{row.commissionRatePercent}% comisión</small>
                    </td>
                    <td>{formatMoney(row.commissionAmount, currency)}</td>
                    <td>{row.sellerGoalActive ? row.sellerGoalCondition : "Meta no alcanzada"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="commission-goals-card">
        <div className="commission-goals-card__head">
          <div>
            <h2><FaBullseye /> Gestión de metas</h2>
            <p>Crea, edita o elimina metas personales y generales según el mes de evaluación.</p>
          </div>
          <span className="commission-goals-card__badge"><FaChartLine /> {metas.length} meta(s)</span>
        </div>

        {canManageMeta && (
          <form className="commission-goals-card__form" onSubmit={handleMetaSubmit}>
            <select
              value={metaForm.tipo_comision}
              onChange={(e) => setMetaForm((prev) => ({ ...prev, tipo_comision: e.target.value }))}
            >
              {COMMISSION_TYPES.map((type) => (
                <option value={type.value} key={type.value}>
                  Meta {type.label.toLowerCase()}
                </option>
              ))}
            </select>
            <select
              value={metaForm.mes}
              onChange={(e) => setMetaForm((prev) => ({ ...prev, mes: e.target.value }))}
            >
              {MONTHS.filter((month) => month.value).map((month) => (
                <option value={month.value} key={month.value}>{month.label}</option>
              ))}
            </select>
            <input
              type="number"
              min="2020"
              max="2100"
              value={metaForm.anio}
              onChange={(e) => setMetaForm((prev) => ({ ...prev, anio: e.target.value }))}
            />
            <input
              type="number"
              min="1"
              step="0.01"
              value={metaForm.monto}
              onChange={(e) => setMetaForm((prev) => ({ ...prev, monto: e.target.value }))}
              placeholder="Monto"
            />
            <input
              value={metaForm.moneda}
              maxLength="10"
              onChange={(e) => setMetaForm((prev) => ({ ...prev, moneda: e.target.value.toUpperCase() }))}
              placeholder="USD"
            />
            <button type="submit">
              <FaPlus /> {metaForm.id ? "Actualizar meta" : "Agregar meta"}
            </button>
            {metaForm.id && (
              <button
                type="button"
                className="commission-goals-card__cancel"
                onClick={() =>
                  setMetaForm({
                    id: null,
                    anio: filters.anio || currentYear,
                    mes: filters.mes || new Date().getMonth() + 1,
                    monto: "15000",
                    moneda: "USD",
                    tipo_comision: filters.tipo_comision || "personal",
                  })
                }
              >
                Cancelar edición
              </button>
            )}
          </form>
        )}

        <div className="commission-goals-card__buckets">
          {renderMetaList("personal")}
          {renderMetaList("general")}
        </div>
      </section>

    </div>
  );
}

export default Comisiones;
