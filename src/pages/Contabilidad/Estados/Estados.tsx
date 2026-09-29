import React, { useEffect, useMemo, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  FaArrowDown,
  FaArrowUp,
  FaCalendarAlt,
  FaChartLine,
  FaExchangeAlt,
  FaFilter,
  FaLayerGroup,
  FaSyncAlt,
  FaWallet,
} from "react-icons/fa";
import { toast } from "react-toastify";
import contabilidadService from "../../../services/contabilidadService";
import { formatCurrency, formatDate } from "../../../utils/formatters";
import "./Estados.scss";

const toNumber = (value) => Number.parseFloat(value || 0) || 0;

const toISODate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, "0");
    const day = `${value.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return toISODate(date);
};

const parseISODate = (value) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const addDays = (date, amount) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const createDateRange = (start, end) => {
  const dates = [];
  const startDate = parseISODate(start);
  const endDate = parseISODate(end);

  if (!startDate || !endDate || startDate > endDate) return dates;

  for (let cursor = startDate; cursor <= endDate; cursor = addDays(cursor, 1)) {
    dates.push(toISODate(cursor));
  }

  return dates;
};

const getTodayISO = () => toISODate(new Date());

const getDefaultMonthlyStart = () => {
  const now = new Date();
  return toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
};

const formatReportDate = (isoDate) => {
  const date = parseISODate(isoDate);
  if (!date) return isoDate || "-";
  return new Intl.DateTimeFormat("es-PE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const normalizePlatform = (item = {}) => {
  const platform = String(item.platform || "").toLowerCase();
  const businessType = String(item.business_type || "").toUpperCase();

  if (["mil", "b2b"].includes(platform) || businessType === "B2B") return "mil";
  if (["venso", "b2c", "web"].includes(platform) || businessType === "B2C")
    return "venso";
  return platform || "venso";
};

const normalizeBusinessType = (item = {}) => {
  const businessType = String(item.business_type || "").toUpperCase();
  if (["B2C", "B2B"].includes(businessType)) return businessType;
  return normalizePlatform(item) === "mil" ? "B2B" : "B2C";
};

const normalizeTipo = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

const titleize = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const getSaldoLabel = (saldo) => {
  if (!saldo) return "Saldo no identificado";
  const cuenta = saldo.tipo_display || titleize(saldo.tipo || "cuenta");
  const moneda = String(saldo.moneda || "").toUpperCase();
  const platform = normalizePlatform(saldo).toUpperCase();
  const businessType = normalizeBusinessType(saldo);
  const year = saldo.year_saldo ? ` · ${saldo.year_saldo}` : "";
  return `${cuenta} · ${moneda} · ${platform}/${businessType}${year}`;
};

const getMovementSign = (tipoMovimiento) =>
  String(tipoMovimiento || "").toLowerCase() === "ingreso" ? 1 : -1;

const createMovimientoEntry = (movimiento, saldo) => {
  const sign = getMovementSign(movimiento.tipo_movimiento);
  const amount = toNumber(movimiento.monto);
  const saldoInfo = saldo || movimiento;

  return {
    id: `mov-${movimiento.id}`,
    rawId: movimiento.id,
    source: "movimiento",
    groupId: movimiento.liq_movimiento_id
      ? `liq-${movimiento.liq_movimiento_id}`
      : `mov-${movimiento.id}`,
    date: toISODate(
      movimiento.fecha || movimiento.transaction_date || movimiento.created_at,
    ),
    saldoId: Number(movimiento.saldo_id),
    saldoLabel: getSaldoLabel(saldo),
    saldoYear: Number(
      saldo?.year_saldo ||
        new Date(`${movimiento.fecha}T00:00:00`).getFullYear(),
    ),
    tipo: movimiento.tipo_movimiento || (sign > 0 ? "ingreso" : "egreso"),
    descripcion: movimiento.descripcion || "Movimiento contable",
    voucherCode:
      movimiento.voucher_code || movimiento.referencia_voucher_reserva || "-",
    metodoPago: movimiento.metodo_pago || "-",
    montoIngreso: sign > 0 ? amount : 0,
    montoEgreso: sign < 0 ? amount : 0,
    transferenciaEntrada: 0,
    transferenciaSalida: 0,
    delta: sign * amount,
    moneda: saldo?.moneda || movimiento.moneda || "soles",
    tipoCuenta: saldo?.tipo || movimiento.tipo_cuenta || "",
    platform: normalizePlatform(saldoInfo),
    businessType: normalizeBusinessType(saldoInfo),
    contextoPago: movimiento.contexto_pago,
  };
};

const createTransferenciaEntries = (transferencia, saldoMap) => {
  const originSaldo = saldoMap.get(Number(transferencia.saldo_origen_id));
  const targetSaldo = saldoMap.get(Number(transferencia.saldo_destino_id));
  const date = toISODate(
    transferencia.fecha_transferencia || transferencia.created_at,
  );
  const originInfo = originSaldo || transferencia;
  const targetInfo = targetSaldo || transferencia;
  const description = transferencia.descripcion || "Transferencia interna";

  return [
    {
      id: `tra-${transferencia.id}-out`,
      rawId: transferencia.id,
      source: "transferencia",
      groupId: `tra-${transferencia.id}`,
      date,
      saldoId: Number(transferencia.saldo_origen_id),
      saldoLabel: getSaldoLabel(originSaldo),
      saldoYear: Number(
        originSaldo?.year_saldo || parseISODate(date)?.getFullYear(),
      ),
      tipo: "transferencia_salida",
      descripcion: description,
      voucherCode: "Transferencia interna",
      metodoPago: "-",
      montoIngreso: 0,
      montoEgreso: 0,
      transferenciaEntrada: 0,
      transferenciaSalida: toNumber(transferencia.monto_origen),
      delta: -toNumber(transferencia.monto_origen),
      moneda: originSaldo?.moneda || transferencia.moneda_origen || "soles",
      tipoCuenta: originSaldo?.tipo || transferencia.tipo_cuenta_origen || "",
      platform: normalizePlatform(originInfo),
      businessType: normalizeBusinessType(originInfo),
      contextoPago: null,
    },
    {
      id: `tra-${transferencia.id}-in`,
      rawId: transferencia.id,
      source: "transferencia",
      groupId: `tra-${transferencia.id}`,
      date,
      saldoId: Number(transferencia.saldo_destino_id),
      saldoLabel: getSaldoLabel(targetSaldo),
      saldoYear: Number(
        targetSaldo?.year_saldo || parseISODate(date)?.getFullYear(),
      ),
      tipo: "transferencia_entrada",
      descripcion: description,
      voucherCode: "Transferencia interna",
      metodoPago: "-",
      montoIngreso: 0,
      montoEgreso: 0,
      transferenciaEntrada: toNumber(transferencia.monto_destino),
      transferenciaSalida: 0,
      delta: toNumber(transferencia.monto_destino),
      moneda: targetSaldo?.moneda || transferencia.moneda_destino || "soles",
      tipoCuenta: targetSaldo?.tipo || transferencia.tipo_cuenta_destino || "",
      platform: normalizePlatform(targetInfo),
      businessType: normalizeBusinessType(targetInfo),
      contextoPago: null,
    },
  ];
};

const summarizeEntries = (entries) =>
  entries.reduce(
    (acc, entry) => {
      acc.ingresos += entry.montoIngreso;
      acc.egresos += entry.montoEgreso;
      acc.transferenciasEntrada += entry.transferenciaEntrada;
      acc.transferenciasSalida += entry.transferenciaSalida;
      acc.neto += entry.delta;
      acc.movimientos += entry.source === "movimiento" ? 1 : 0;
      acc.transferencias += entry.source === "transferencia" ? 1 : 0;
      acc.grupos.add(entry.groupId);
      return acc;
    },
    {
      ingresos: 0,
      egresos: 0,
      transferenciasEntrada: 0,
      transferenciasSalida: 0,
      neto: 0,
      movimientos: 0,
      transferencias: 0,
      grupos: new Set(),
    },
  );

const formatPlainAmount = (amount) =>
  new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(amount));

const formatAmountByCurrency = (amount, moneda) => {
  if (!moneda || moneda === "all") return formatPlainAmount(amount);
  return formatCurrency(amount, moneda);
};

const platformMeta = {
  venso: { label: "Venso", business: "B2C", className: "venso" },
  mil: { label: "MIL", business: "B2B", className: "mil" },
};

const linkedBusinessForPlatform = (platform) => {
  if (platform === "venso") return "B2C";
  if (platform === "mil") return "B2B";
  return "all";
};

const platformFilterLabel = (platform) => {
  if (platform === "venso") return "Venso · B2C";
  if (platform === "mil") return "MIL · B2B";
  return "Todas las plataformas";
};

const monedaMeta = {
  soles: { label: "Soles", short: "S/", className: "soles" },
  dolares: { label: "Dólares", short: "$", className: "dolares" },
};

const getPlatformLabel = (platform, businessType) => {
  const key = platform || "venso";
  const meta = platformMeta[key] || {
    label: titleize(key),
    business: businessType,
    className: key,
  };
  return `${meta.label}${businessType ? ` / ${businessType}` : meta.business ? ` / ${meta.business}` : ""}`;
};

const groupBalancesByPlatformCurrency = (balances = []) => {
  const grouped = new Map();

  balances.forEach((balance) => {
    const platform = balance.platform || "venso";
    const businessType =
      balance.businessType || (platform === "mil" ? "B2B" : "B2C");
    const moneda = balance.moneda || "soles";
    const platformKey = `${platform}-${businessType}`;

    if (!grouped.has(platformKey)) {
      grouped.set(platformKey, {
        key: platformKey,
        platform,
        businessType,
        label: getPlatformLabel(platform, businessType),
        currencies: new Map(),
        rowCount: 0,
      });
    }

    const platformGroup = grouped.get(platformKey);
    if (!platformGroup.currencies.has(moneda)) {
      platformGroup.currencies.set(moneda, {
        moneda,
        label: monedaMeta[moneda]?.label || titleize(moneda),
        rows: [],
        rowCount: 0,
        aperturaTotal: 0,
        cierreTotal: 0,
        deltaTotal: 0,
      });
    }

    const currencyGroup = platformGroup.currencies.get(moneda);
    currencyGroup.rows.push(balance);
    currencyGroup.rowCount += 1;
    currencyGroup.aperturaTotal += balance.apertura;
    currencyGroup.cierreTotal += balance.cierre;
    currencyGroup.deltaTotal += balance.delta;
    platformGroup.rowCount += 1;
  });

  const platformOrder = { venso: 0, mil: 1 };
  const currencyOrder = { soles: 0, dolares: 1 };

  return Array.from(grouped.values())
    .sort(
      (a, b) =>
        (platformOrder[a.platform] ?? 99) - (platformOrder[b.platform] ?? 99),
    )
    .map((group) => ({
      ...group,
      currencies: Array.from(group.currencies.values())
        .map((currencyGroup) => ({
          ...currencyGroup,
          rows: currencyGroup.rows.sort((a, b) =>
            getBalanceAccountName(a.label).localeCompare(
              getBalanceAccountName(b.label),
            ),
          ),
        }))
        .sort(
          (a, b) =>
            (currencyOrder[a.moneda] ?? 99) - (currencyOrder[b.moneda] ?? 99),
        ),
    }));
};

const getBalanceAccountName = (label = "") => {
  const parts = String(label).split(" · ");
  return parts[0] || label || "Saldo";
};

export function Estados() {
  const currentYear = new Date().getFullYear();
  const today = getTodayISO();
  const monthlyStart = getDefaultMonthlyStart();

  const [saldos, setSaldos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [transferencias, setTransferencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState("daily");
  const [expandedDay, setExpandedDay] = useState(today);
  const [expandedBalanceKey, setExpandedBalanceKey] = useState(null);
  const [autoThirtyDays, setAutoThirtyDays] = useState(true);

  const [filters, setFilters] = useState({
    reportDate: today,
    fechaInicio: monthlyStart,
    fechaFin: toISODate(addDays(parseISODate(monthlyStart), 29)),
    yearSaldo: String(currentYear),
    platform: "all",
    businessType: "all",
    moneda: "all",
    tipoCuenta: "all",
    saldoId: "all",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [saldosResponse, movimientosResponse, transferenciasResponse] =
        await Promise.all([
          contabilidadService.getSaldos(),
          contabilidadService.getMovimientos(),
          contabilidadService.getTransferencias(),
        ]);

      if (saldosResponse.success) setSaldos(saldosResponse.data || []);
      if (movimientosResponse.success)
        setMovimientos(movimientosResponse.data || []);
      if (transferenciasResponse.success) {
        setTransferencias(transferenciasResponse.data || []);
      }
    } catch (error) {
      console.error("Error cargando estados contables:", error);
      toast.error("Error al cargar los estados contables");
    } finally {
      setLoading(false);
    }
  };

  const saldoMap = useMemo(
    () => new Map(saldos.map((saldo) => [Number(saldo.id), saldo])),
    [saldos],
  );

  const normalizedEntries = useMemo(() => {
    const movimientoEntries = movimientos
      .map((movimiento) =>
        createMovimientoEntry(
          movimiento,
          saldoMap.get(Number(movimiento.saldo_id)),
        ),
      )
      .filter((entry) => Boolean(entry.date));

    const transferenciaEntries = transferencias
      .flatMap((transferencia) =>
        createTransferenciaEntries(transferencia, saldoMap),
      )
      .filter((entry) => Boolean(entry.date));

    return [...movimientoEntries, ...transferenciaEntries];
  }, [movimientos, saldoMap, transferencias]);

  const effectiveDateRange = useMemo(() => {
    if (activeView === "monthly") {
      return {
        fechaInicio: filters.fechaInicio,
        fechaFin: filters.fechaFin,
      };
    }

    return {
      fechaInicio: filters.reportDate,
      fechaFin: filters.reportDate,
    };
  }, [activeView, filters.fechaFin, filters.fechaInicio, filters.reportDate]);

  const filteredSaldos = useMemo(() => {
    return saldos.filter((saldo) => {
      if (
        filters.yearSaldo !== "all" &&
        Number(saldo.year_saldo) !== Number(filters.yearSaldo)
      ) {
        return false;
      }
      if (
        filters.platform !== "all" &&
        normalizePlatform(saldo) !== filters.platform
      ) {
        return false;
      }
      const linkedBusinessType = linkedBusinessForPlatform(filters.platform);
      if (
        linkedBusinessType !== "all" &&
        normalizeBusinessType(saldo) !== linkedBusinessType
      ) {
        return false;
      }
      if (filters.moneda !== "all" && saldo.moneda !== filters.moneda)
        return false;
      if (filters.tipoCuenta !== "all" && saldo.tipo !== filters.tipoCuenta)
        return false;
      if (
        filters.saldoId !== "all" &&
        Number(saldo.id) !== Number(filters.saldoId)
      ) {
        return false;
      }
      return true;
    });
  }, [filters, saldos]);

  const selectedSaldoIds = useMemo(
    () => new Set(filteredSaldos.map((saldo) => Number(saldo.id))),
    [filteredSaldos],
  );

  const filteredEntries = useMemo(() => {
    return normalizedEntries.filter((entry) => {
      if (!selectedSaldoIds.has(Number(entry.saldoId))) return false;
      if (
        effectiveDateRange.fechaInicio &&
        entry.date < effectiveDateRange.fechaInicio
      )
        return false;
      if (
        effectiveDateRange.fechaFin &&
        entry.date > effectiveDateRange.fechaFin
      )
        return false;
      return true;
    });
  }, [
    effectiveDateRange.fechaFin,
    effectiveDateRange.fechaInicio,
    normalizedEntries,
    selectedSaldoIds,
  ]);

  const allRelevantEntries = useMemo(() => {
    return normalizedEntries.filter((entry) =>
      selectedSaldoIds.has(Number(entry.saldoId)),
    );
  }, [normalizedEntries, selectedSaldoIds]);

  const dailyReports = useMemo(() => {
    if (!effectiveDateRange.fechaInicio || !effectiveDateRange.fechaFin)
      return [];

    const dates = createDateRange(
      effectiveDateRange.fechaInicio,
      effectiveDateRange.fechaFin,
    );
    const entriesByDay = new Map();
    filteredEntries.forEach((entry) => {
      const bucket = entriesByDay.get(entry.date) || [];
      bucket.push(entry);
      entriesByDay.set(entry.date, bucket);
    });

    const currentBalanceBySaldo = new Map(
      filteredSaldos.map((saldo) => [
        Number(saldo.id),
        toNumber(saldo.saldo_actual),
      ]),
    );

    return dates
      .map((date) => {
        const dayEntries = entriesByDay.get(date) || [];
        const summary = summarizeEntries(dayEntries);
        const balances = filteredSaldos.map((saldo) => {
          const saldoId = Number(saldo.id);
          const currentBalance = currentBalanceBySaldo.get(saldoId) || 0;
          const futureDelta = allRelevantEntries
            .filter(
              (entry) => Number(entry.saldoId) === saldoId && entry.date > date,
            )
            .reduce((sum, entry) => sum + entry.delta, 0);
          const saldoEntries = dayEntries
            .filter((entry) => Number(entry.saldoId) === saldoId)
            .sort((left, right) =>
              `${left.descripcion}${left.id}`.localeCompare(
                `${right.descripcion}${right.id}`,
              ),
            );
          const dayDelta = saldoEntries.reduce(
            (sum, entry) => sum + entry.delta,
            0,
          );
          const cierre = currentBalance - futureDelta;
          const apertura = cierre - dayDelta;
          const movimientoSummary = summarizeEntries(saldoEntries);

          return {
            saldoId,
            label: getSaldoLabel(saldo),
            moneda: saldo.moneda,
            tipoCuenta: saldo.tipo,
            yearSaldo: saldo.year_saldo,
            platform: normalizePlatform(saldo),
            businessType: normalizeBusinessType(saldo),
            apertura,
            cierre,
            delta: dayDelta,
            entries: saldoEntries,
            movementCount: saldoEntries.length,
            movementSummary: {
              ...movimientoSummary,
              gruposCount: movimientoSummary.grupos.size,
            },
          };
        });

        const aperturaTotal = balances.reduce(
          (sum, row) => sum + row.apertura,
          0,
        );
        const cierreTotal = balances.reduce((sum, row) => sum + row.cierre, 0);

        return {
          date,
          entries: dayEntries.sort((a, b) =>
            `${a.saldoLabel}${a.id}`.localeCompare(`${b.saldoLabel}${b.id}`),
          ),
          balances,
          balanceGroups: groupBalancesByPlatformCurrency(balances),
          aperturaTotal,
          cierreTotal,
          ...summary,
          gruposCount: summary.grupos.size,
        };
      })
      .reverse();
  }, [
    allRelevantEntries,
    effectiveDateRange.fechaFin,
    effectiveDateRange.fechaInicio,
    filteredEntries,
    filteredSaldos,
  ]);

  const monthlyReports = useMemo(() => {
    const grouped = new Map();

    dailyReports
      .slice()
      .reverse()
      .forEach((day) => {
        const month = day.date.slice(0, 7);
        const current = grouped.get(month) || {
          month,
          dias: 0,
          ingresos: 0,
          egresos: 0,
          transferenciasEntrada: 0,
          transferenciasSalida: 0,
          neto: 0,
          movimientos: 0,
          transferencias: 0,
          aperturaTotal: day.aperturaTotal,
          cierreTotal: day.cierreTotal,
        };

        current.dias += 1;
        current.ingresos += day.ingresos;
        current.egresos += day.egresos;
        current.transferenciasEntrada += day.transferenciasEntrada;
        current.transferenciasSalida += day.transferenciasSalida;
        current.neto += day.neto;
        current.movimientos += day.movimientos;
        current.transferencias += day.transferencias;
        current.cierreTotal = day.cierreTotal;
        grouped.set(month, current);
      });

    return Array.from(grouped.values()).sort((a, b) =>
      b.month.localeCompare(a.month),
    );
  }, [dailyReports]);

  const overallSummary = useMemo(() => {
    const summary = summarizeEntries(filteredEntries);
    const saldoActualTotal = filteredSaldos.reduce(
      (sum, saldo) => sum + toNumber(saldo.saldo_actual),
      0,
    );

    return {
      ...summary,
      gruposCount: summary.grupos.size,
      saldoActualTotal,
      cuentas: filteredSaldos.length,
    };
  }, [filteredEntries, filteredSaldos]);

  const filterOptions = useMemo(() => {
    const unique = (field, data = saldos) =>
      [...new Set(data.map((saldo) => saldo[field]).filter(Boolean))].sort();

    const years = [
      ...new Set(saldos.map((saldo) => saldo.year_saldo).filter(Boolean)),
    ]
      .map(Number)
      .concat(currentYear)
      .filter((year, index, array) => array.indexOf(year) === index)
      .sort((a, b) => b - a);

    const saldosForSelector = saldos.filter((saldo) => {
      if (
        filters.yearSaldo !== "all" &&
        Number(saldo.year_saldo) !== Number(filters.yearSaldo)
      )
        return false;
      if (
        filters.platform !== "all" &&
        normalizePlatform(saldo) !== filters.platform
      )
        return false;
      const linkedBusinessType = linkedBusinessForPlatform(filters.platform);
      if (
        linkedBusinessType !== "all" &&
        normalizeBusinessType(saldo) !== linkedBusinessType
      )
        return false;
      if (filters.moneda !== "all" && saldo.moneda !== filters.moneda)
        return false;
      if (filters.tipoCuenta !== "all" && saldo.tipo !== filters.tipoCuenta)
        return false;
      return true;
    });

    return {
      years,
      monedas: unique("moneda"),
      tiposCuenta: unique("tipo"),
      saldos: saldosForSelector
        .slice()
        .sort((a, b) => getSaldoLabel(a).localeCompare(getSaldoLabel(b))),
    };
  }, [
    currentYear,
    filters.moneda,
    filters.platform,
    filters.tipoCuenta,
    filters.yearSaldo,
    saldos,
  ]);

  const saldoSelectorGroups = useMemo(() => {
    const groups = new Map();

    filterOptions.saldos.forEach((saldo) => {
      const platform = normalizePlatform(saldo);
      const businessType = normalizeBusinessType(saldo);
      const key = `${platform}-${businessType}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: getPlatformLabel(platform, businessType),
          items: [],
        });
      }
      groups.get(key).items.push(saldo);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        items: group.items.sort((left, right) =>
          getSaldoLabel(left).localeCompare(getSaldoLabel(right)),
        ),
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [filterOptions.saldos]);

  useEffect(() => {
    if (filters.saldoId === "all") return;
    const exists = filterOptions.saldos.some(
      (saldo) => Number(saldo.id) === Number(filters.saldoId),
    );
    if (!exists) {
      setFilters((prev) => ({ ...prev, saldoId: "all" }));
    }
  }, [filterOptions.saldos, filters.saldoId]);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => {
      const next = { ...prev, [name]: value };

      if (name === "platform") {
        next.businessType = linkedBusinessForPlatform(value);
      }

      if (name !== "saldoId") next.saldoId = "all";
      return next;
    });
  };

  const handleDateFilterChange = (name, date) => {
    const iso = toISODate(date);
    if (!iso) return;

    setFilters((prev) => {
      const next = {
        ...prev,
        [name]: iso,
        yearSaldo: String(date.getFullYear()),
      };
      if (name === "reportDate") {
        return next;
      }
      if (name === "fechaInicio" && autoThirtyDays) {
        next.fechaFin = toISODate(addDays(date, 29));
      }
      return next;
    });

    if (name === "reportDate") setExpandedDay(iso);
  };

  const handleActiveViewChange = (view) => {
    setActiveView(view);
    if (view === "daily") {
      setExpandedDay(filters.reportDate);
    }
  };

  if (loading) {
    return (
      <div className="estado-contabilidad-page estado-loading">
        <FaSyncAlt className="spin" />
        <p>Cargando estados diarios de saldos y movimientos...</p>
      </div>
    );
  }

  return (
    <div className="estado-contabilidad-page">
      <header className="estado-header">
        <div>
          <span className="estado-eyebrow">Contabilidad · Estados</span>
          <h1>Estados diarios de saldos y movimientos</h1>
          <p>
            Control diario y mensual de saldos por año, plataforma, negocio y
            moneda. Cada movimiento se calcula contra el saldo contable que
            realmente fue afectado.
          </p>
        </div>
        <button
          className="estado-refresh-button"
          onClick={loadData}
          type="button"
        >
          <FaSyncAlt /> Actualizar
        </button>
      </header>

      <section className="estado-filters-card">
        <div className="estado-filters-head">
          <div className="estado-section-title">
            <FaFilter />
            <span>Filtros contables</span>
          </div>
          <div className="estado-period-switch">
            <button
              type="button"
              className={activeView === "daily" ? "active" : ""}
              onClick={() => handleActiveViewChange("daily")}
            >
              Día exacto
            </button>
            <button
              type="button"
              className={activeView === "monthly" ? "active" : ""}
              onClick={() => handleActiveViewChange("monthly")}
            >
              Rango mensual / 30 días
            </button>
          </div>
        </div>

        <div className="estado-filters-grid">
          {activeView !== "monthly" ? (
            <label>
              Fecha del reporte
              <DatePicker
                selected={parseISODate(filters.reportDate)}
                onChange={(date) => handleDateFilterChange("reportDate", date)}
                dateFormat="dd/MM/yyyy"
                className="estado-datepicker-input"
                calendarClassName="estado-datepicker-calendar"
                popperClassName="estado-datepicker-popper"
                popperPlacement="bottom-start"
                popperProps={{ strategy: "fixed" }}
                portalId="estado-datepicker-root"
              />
            </label>
          ) : (
            <>
              <label>
                Desde
                <DatePicker
                  selected={parseISODate(filters.fechaInicio)}
                  onChange={(date) =>
                    handleDateFilterChange("fechaInicio", date)
                  }
                  dateFormat="dd/MM/yyyy"
                  className="estado-datepicker-input"
                  calendarClassName="estado-datepicker-calendar"
                  popperClassName="estado-datepicker-popper"
                />
              </label>
              <label>
                Hasta
                <DatePicker
                  selected={parseISODate(filters.fechaFin)}
                  onChange={(date) => handleDateFilterChange("fechaFin", date)}
                  dateFormat="dd/MM/yyyy"
                  className="estado-datepicker-input"
                  calendarClassName="estado-datepicker-calendar"
                  popperClassName="estado-datepicker-popper"
                  disabled={autoThirtyDays}
                />
              </label>
              <label className="estado-checkbox-filter">
                Cálculo mensual
                <span>
                  <input
                    type="checkbox"
                    checked={autoThirtyDays}
                    onChange={(event) => {
                      setAutoThirtyDays(event.target.checked);
                      if (event.target.checked && filters.fechaInicio) {
                        setFilters((prev) => ({
                          ...prev,
                          fechaFin: toISODate(
                            addDays(parseISODate(prev.fechaInicio), 29),
                          ),
                        }));
                      }
                    }}
                  />
                  30 días desde inicio
                </span>
              </label>
            </>
          )}
          <label>
            Año del saldo
            <select
              name="yearSaldo"
              value={filters.yearSaldo}
              onChange={handleFilterChange}
            >
              <option value="all">Todos los años</option>
              {filterOptions.years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label>
            Plataforma / negocio
            <select
              name="platform"
              value={filters.platform}
              onChange={handleFilterChange}
            >
              <option value="all">Todas las plataformas</option>
              <option value="venso">Venso · B2C</option>
              <option value="mil">MIL · B2B</option>
            </select>
          </label>
          <div className="estado-linked-business-card">
            <span>Negocio vinculado</span>
            <strong>{platformFilterLabel(filters.platform)}</strong>
            <small>La plataforma define automáticamente el negocio contable.</small>
          </div>
          <label>
            Moneda
            <select
              name="moneda"
              value={filters.moneda}
              onChange={handleFilterChange}
            >
              <option value="all">Todas</option>
              {filterOptions.monedas.map((moneda) => (
                <option key={moneda} value={moneda}>
                  {titleize(moneda)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo de cuenta
            <select
              name="tipoCuenta"
              value={filters.tipoCuenta}
              onChange={handleFilterChange}
            >
              <option value="all">Todas</option>
              {filterOptions.tiposCuenta.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {titleize(tipo)}
                </option>
              ))}
            </select>
          </label>
          <label className="estado-filter-wide">
            Saldo específico
            <select
              name="saldoId"
              value={filters.saldoId}
              onChange={handleFilterChange}
            >
              <option value="all">Todos los saldos filtrados</option>
              {saldoSelectorGroups.length === 0 && (
                <option value="__empty" disabled>
                  No hay saldos para plataforma/negocio seleccionado
                </option>
              )}
              {saldoSelectorGroups.map((group) => (
                <optgroup
                  key={group.key}
                  label={`${group.label} · ${group.items.length} saldo(s)`}
                >
                  {group.items.map((saldo) => (
                    <option key={saldo.id} value={saldo.id}>
                      {getSaldoLabel(saldo)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="estado-summary-grid">
        <article className="estado-summary-card saldo">
          <FaWallet />
          <div>
            <span>Saldo actual filtrado</span>
            <strong>
              {formatAmountByCurrency(
                overallSummary.saldoActualTotal,
                filters.moneda,
              )}
            </strong>
            <small>
              {overallSummary.cuentas} cuenta(s) · año{" "}
              {filters.yearSaldo === "all" ? "todos" : filters.yearSaldo}
            </small>
          </div>
        </article>
        <article className="estado-summary-card ingreso">
          <FaArrowUp />
          <div>
            <span>Ingresos del rango</span>
            <strong>
              {formatAmountByCurrency(overallSummary.ingresos, filters.moneda)}
            </strong>
            <small>{overallSummary.movimientos} movimiento(s)</small>
          </div>
        </article>
        <article className="estado-summary-card egreso">
          <FaArrowDown />
          <div>
            <span>Egresos del rango</span>
            <strong>
              {formatAmountByCurrency(overallSummary.egresos, filters.moneda)}
            </strong>
            <small>{overallSummary.gruposCount} grupo(s) / batch</small>
          </div>
        </article>
        <article className="estado-summary-card transferencia">
          <FaExchangeAlt />
          <div>
            <span>Transferencias internas</span>
            <strong>
              {formatAmountByCurrency(
                overallSummary.transferenciasEntrada +
                  overallSummary.transferenciasSalida,
                filters.moneda,
              )}
            </strong>
            <small>{overallSummary.transferencias} registro(s) de saldo</small>
          </div>
        </article>
      </section>

      <section className="estado-view-tabs" aria-label="Vistas del reporte">
        <button
          type="button"
          className={activeView === "daily" ? "active" : ""}
          onClick={() => handleActiveViewChange("daily")}
        >
          <FaCalendarAlt /> Reporte diario
        </button>
        <button
          type="button"
          className={activeView === "monthly" ? "active" : ""}
          onClick={() => handleActiveViewChange("monthly")}
        >
          <FaChartLine /> Resumen mensual
        </button>
        <button
          type="button"
          className={activeView === "balances" ? "active" : ""}
          onClick={() => handleActiveViewChange("balances")}
        >
          <FaLayerGroup /> Saldos filtrados
        </button>
      </section>

      {activeView === "daily" && (
        <section className="estado-report-card">
          <div className="estado-report-heading">
            <div className="estado-section-title">
              <FaCalendarAlt />
              <span>Diario de saldos</span>
            </div>
            <div className="estado-report-meta">
              <span>{formatReportDate(effectiveDateRange.fechaInicio)}</span>
              <span>
                {filters.platform === "all"
                  ? "Todas las plataformas"
                  : getPlatformLabel(
                      filters.platform,
                      filters.businessType === "all"
                        ? undefined
                        : filters.businessType,
                    )}
              </span>
              <span>
                {filters.moneda === "all"
                  ? "Soles y dólares"
                  : titleize(filters.moneda)}
              </span>
            </div>
          </div>
          <div className="estado-table-wrapper">
            <table className="estado-table daily">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Apertura</th>
                  <th>Ingresos</th>
                  <th>Egresos</th>
                  <th>Transf. entrada</th>
                  <th>Transf. salida</th>
                  <th>Neto</th>
                  <th>Cierre</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {dailyReports.map((day) => (
                  <React.Fragment key={day.date}>
                    <tr>
                      <td>{formatReportDate(day.date)}</td>
                      <td>
                        {formatAmountByCurrency(
                          day.aperturaTotal,
                          filters.moneda,
                        )}
                      </td>
                      <td className="positive">
                        {formatAmountByCurrency(day.ingresos, filters.moneda)}
                      </td>
                      <td className="negative">
                        {formatAmountByCurrency(day.egresos, filters.moneda)}
                      </td>
                      <td>
                        {formatAmountByCurrency(
                          day.transferenciasEntrada,
                          filters.moneda,
                        )}
                      </td>
                      <td>
                        {formatAmountByCurrency(
                          day.transferenciasSalida,
                          filters.moneda,
                        )}
                      </td>
                      <td className={day.neto >= 0 ? "positive" : "negative"}>
                        {formatAmountByCurrency(day.neto, filters.moneda)}
                      </td>
                      <td>
                        {formatAmountByCurrency(
                          day.cierreTotal,
                          filters.moneda,
                        )}
                      </td>
                      <td>
                        <button
                          className="estado-link-button"
                          type="button"
                          onClick={() => {
                            const nextExpandedDay =
                              expandedDay === day.date ? null : day.date;
                            setExpandedDay(nextExpandedDay);
                            setExpandedBalanceKey(null);
                          }}
                        >
                          {expandedDay === day.date ? "Ocultar" : "Ver"}
                        </button>
                      </td>
                    </tr>
                    {expandedDay === day.date && (
                      <tr className="estado-detail-row">
                        <td colSpan="9">
                          <div className="estado-day-detail">
                            <div className="estado-balance-detail-panel">
                              <div className="estado-detail-heading">
                                <div>
                                  <h3>Saldos del día</h3>
                                  <p>
                                    Apertura, neto y cierre por plataforma,
                                    negocio y moneda.
                                  </p>
                                </div>
                                <span>{day.balances.length} saldo(s)</span>
                              </div>
                              <div className="estado-balance-groups">
                                {day.balanceGroups.length === 0 ? (
                                  <div className="estado-empty-block">
                                    No hay saldos para los filtros
                                    seleccionados.
                                  </div>
                                ) : (
                                  day.balanceGroups.map((platformGroup) => (
                                    <article
                                      className={`estado-platform-balance-group ${platformGroup.platform}`}
                                      key={platformGroup.key}
                                    >
                                      <div className="estado-platform-header">
                                        <div>
                                          <span className="estado-platform-kicker">
                                            Plataforma
                                          </span>
                                          <strong>{platformGroup.label}</strong>
                                        </div>
                                        <span className="estado-platform-net">
                                          {platformGroup.rowCount} saldo(s) ·{" "}
                                          {platformGroup.currencies.length}{" "}
                                          moneda(s)
                                        </span>
                                      </div>

                                      <div className="estado-currency-groups">
                                        {platformGroup.currencies.map(
                                          (currencyGroup) => (
                                            <section
                                              className={`estado-currency-group ${currencyGroup.moneda}`}
                                              key={`${platformGroup.key}-${currencyGroup.moneda}`}
                                            >
                                              <div className="estado-currency-header">
                                                <span>
                                                  {monedaMeta[
                                                    currencyGroup.moneda
                                                  ]?.short || ""}
                                                </span>
                                                <div>
                                                  <strong>
                                                    {currencyGroup.label}
                                                  </strong>
                                                  <small>
                                                    Apertura{" "}
                                                    {formatCurrency(
                                                      currencyGroup.aperturaTotal,
                                                      currencyGroup.moneda,
                                                    )}{" "}
                                                    · Neto{" "}
                                                    {formatCurrency(
                                                      currencyGroup.deltaTotal,
                                                      currencyGroup.moneda,
                                                    )}{" "}
                                                    · Cierre{" "}
                                                    {formatCurrency(
                                                      currencyGroup.cierreTotal,
                                                      currencyGroup.moneda,
                                                    )}
                                                  </small>
                                                </div>
                                              </div>
                                              <div className="estado-balance-line estado-balance-line-head">
                                                <span>Cuenta</span>
                                                <span>Apertura</span>
                                                <span>Neto</span>
                                                <span>Cierre</span>
                                                <span>Detalle</span>
                                              </div>
                                              <div className="estado-balance-list">
                                                {currencyGroup.rows.map(
                                                  (balance) => {
                                                    const balanceKey = `${day.date}-${balance.saldoId}`;
                                                    const isBalanceExpanded =
                                                      expandedBalanceKey ===
                                                      balanceKey;
                                                    const balanceEntries =
                                                      balance.entries || [];
                                                    const canExpandBalance =
                                                      balanceEntries.length > 0;

                                                    return (
                                                      <React.Fragment
                                                        key={balance.saldoId}
                                                      >
                                                        <div
                                                          className={`estado-balance-line${
                                                            canExpandBalance
                                                              ? " estado-balance-line--clickable"
                                                              : ""
                                                          }${
                                                            isBalanceExpanded
                                                              ? " is-expanded"
                                                              : ""
                                                          }`}
                                                          role={
                                                            canExpandBalance
                                                              ? "button"
                                                              : undefined
                                                          }
                                                          tabIndex={
                                                            canExpandBalance
                                                              ? 0
                                                              : undefined
                                                          }
                                                          onClick={() => {
                                                            if (
                                                              !canExpandBalance
                                                            )
                                                              return;
                                                            setExpandedBalanceKey(
                                                              isBalanceExpanded
                                                                ? null
                                                                : balanceKey,
                                                            );
                                                          }}
                                                          onKeyDown={(event) => {
                                                            if (
                                                              !canExpandBalance ||
                                                              ![
                                                                "Enter",
                                                                " ",
                                                              ].includes(
                                                                event.key,
                                                              )
                                                            )
                                                              return;
                                                            event.preventDefault();
                                                            setExpandedBalanceKey(
                                                              isBalanceExpanded
                                                                ? null
                                                                : balanceKey,
                                                            );
                                                          }}
                                                        >
                                                          <div>
                                                            <strong>
                                                              {getBalanceAccountName(
                                                                balance.label,
                                                              )}
                                                            </strong>
                                                            <small>
                                                              {balance.yearSaldo}
                                                            </small>
                                                          </div>
                                                          <span>
                                                            {formatCurrency(
                                                              balance.apertura,
                                                              balance.moneda,
                                                            )}
                                                          </span>
                                                          <span
                                                            className={
                                                              balance.delta >= 0
                                                                ? "positive"
                                                                : "negative"
                                                            }
                                                          >
                                                            {formatCurrency(
                                                              balance.delta,
                                                              balance.moneda,
                                                            )}
                                                          </span>
                                                          <span>
                                                            {formatCurrency(
                                                              balance.cierre,
                                                              balance.moneda,
                                                            )}
                                                          </span>
                                                          <span className="estado-balance-movement-count">
                                                            {canExpandBalance
                                                              ? `${balanceEntries.length} mov.`
                                                              : "Sin mov."}
                                                          </span>
                                                        </div>

                                                        {isBalanceExpanded && (
                                                          <div className="estado-balance-movement-drawer">
                                                            <div className="estado-balance-movement-summary">
                                                              <strong>
                                                                Movimientos de {getBalanceAccountName(
                                                                  balance.label,
                                                                )}
                                                              </strong>
                                                              <span>
                                                                Ingresos {formatCurrency(
                                                                  balance
                                                                    .movementSummary
                                                                    ?.ingresos,
                                                                  balance.moneda,
                                                                )} · Egresos {formatCurrency(
                                                                  balance
                                                                    .movementSummary
                                                                    ?.egresos,
                                                                  balance.moneda,
                                                                )} · Neto {formatCurrency(
                                                                  balance.delta,
                                                                  balance.moneda,
                                                                )}
                                                              </span>
                                                            </div>
                                                            <div className="estado-balance-movement-list">
                                                              {balanceEntries.map(
                                                                (entry) => (
                                                                  <div
                                                                    className="estado-balance-movement-item"
                                                                    key={entry.id}
                                                                  >
                                                                    <span
                                                                      className={`estado-source-pill ${entry.source}`}
                                                                    >
                                                                      {entry.source ===
                                                                      "transferencia"
                                                                        ? "Transferencia"
                                                                        : "Movimiento"}
                                                                    </span>
                                                                    <div>
                                                                      <strong>
                                                                        {entry.descripcion}
                                                                      </strong>
                                                                      <small>
                                                                        {entry.voucherCode}
                                                                      </small>
                                                                    </div>
                                                                    <span
                                                                      className={
                                                                        entry.delta >=
                                                                        0
                                                                          ? "positive"
                                                                          : "negative"
                                                                      }
                                                                    >
                                                                      {formatCurrency(
                                                                        entry.delta,
                                                                        entry.moneda,
                                                                      )}
                                                                    </span>
                                                                  </div>
                                                                ),
                                                              )}
                                                            </div>
                                                          </div>
                                                        )}
                                                      </React.Fragment>
                                                    );
                                                  },
                                                )}
                                              </div>
                                            </section>
                                          ),
                                        )}
                                      </div>
                                    </article>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeView === "monthly" && (
        <section className="estado-report-card">
          <div className="estado-section-title">
            <FaChartLine />
            <span>Mensual calculado desde reportes diarios</span>
          </div>
          <div className="estado-table-wrapper">
            <table className="estado-table">
              <thead>
                <tr>
                  <th>Mes</th>
                  <th>Días</th>
                  <th>Apertura</th>
                  <th>Ingresos</th>
                  <th>Egresos</th>
                  <th>Transf. entrada</th>
                  <th>Transf. salida</th>
                  <th>Neto</th>
                  <th>Cierre</th>
                </tr>
              </thead>
              <tbody>
                {monthlyReports.map((month) => (
                  <tr key={month.month}>
                    <td>{month.month}</td>
                    <td>{month.dias}</td>
                    <td>
                      {formatAmountByCurrency(
                        month.aperturaTotal,
                        filters.moneda,
                      )}
                    </td>
                    <td className="positive">
                      {formatAmountByCurrency(month.ingresos, filters.moneda)}
                    </td>
                    <td className="negative">
                      {formatAmountByCurrency(month.egresos, filters.moneda)}
                    </td>
                    <td>
                      {formatAmountByCurrency(
                        month.transferenciasEntrada,
                        filters.moneda,
                      )}
                    </td>
                    <td>
                      {formatAmountByCurrency(
                        month.transferenciasSalida,
                        filters.moneda,
                      )}
                    </td>
                    <td className={month.neto >= 0 ? "positive" : "negative"}>
                      {formatAmountByCurrency(month.neto, filters.moneda)}
                    </td>
                    <td>
                      {formatAmountByCurrency(
                        month.cierreTotal,
                        filters.moneda,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeView === "balances" && (
        <section className="estado-report-card">
          <div className="estado-section-title">
            <FaLayerGroup />
            <span>Saldos incluidos en el reporte</span>
          </div>
          <div className="estado-balance-grid">
            {filteredSaldos.map((saldo) => (
              <article className="estado-balance-card" key={saldo.id}>
                <div>
                  <h3>{getSaldoLabel(saldo)}</h3>
                  <p>
                    Inicial:{" "}
                    {formatCurrency(
                      toNumber(saldo.saldo_inicial),
                      saldo.moneda,
                    )}
                  </p>
                </div>
                <strong>
                  {formatCurrency(toNumber(saldo.saldo_actual), saldo.moneda)}
                </strong>
                <small>
                  Última actualización:{" "}
                  {saldo.ultima_actualizacion
                    ? formatDate(saldo.ultima_actualizacion)
                    : "-"}
                </small>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
