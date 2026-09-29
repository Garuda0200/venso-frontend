import React, { useEffect, useMemo, useRef, useState } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { GrPrint, GrDownload, GrClose } from "react-icons/gr";
import voucherReservaService from "../../../../services/voucherReservaService";
import "./FileFormatModal.scss";

const normCurrency = (moneda) => (moneda || "soles").toLowerCase();

const toNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatSoles = (amount) =>
  `S/ ${Number(toNumber(amount)).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatCurrency = (amount, currency = "soles") => {
  const symbol = normCurrency(currency) === "dolares" ? "$" : "S/";
  return `${symbol} ${Number(toNumber(amount)).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatUsd = (amount) => formatCurrency(amount, "dolares");

const formatRate = (amount) =>
  Number(toNumber(amount)).toLocaleString("es-PE", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 4,
  });

const formatPercent = (amount) =>
  `${(toNumber(amount) * 100).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;

const formatDateDDMMYYYY = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const roundTo = (amount, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round(toNumber(amount) * factor) / factor;
};

const normalizeVoucherReservaResponse = (response) => {
  if (!response) return null;
  if (response?.success && response?.data) return response.data;
  if (response?.data?.success && response?.data?.data)
    return response.data.data;
  if (response?.data?.data) return response.data.data;
  if (response?.data) return response.data;
  return response;
};

const getMovimientoExchangeRate = (movimiento, fallbackRate) => {
  const candidates = [
    movimiento?.tipo_cambio,
    movimiento?.contexto_pago?.conversion?.tipo_cambio,
    movimiento?.contexto_pago?.tipo_cambio,
    movimiento?.contexto_pago?.service_data?.tipo_cambio,
    movimiento?.contexto_pago?.service_data?.conversion?.tipo_cambio,
    fallbackRate,
  ];

  const found = candidates
    .map((value) => parseFloat(value))
    .find((value) => Number.isFinite(value) && value > 0);

  return found || toNumber(fallbackRate);
};

const getServiceDataFromMovimiento = (movimiento) =>
  movimiento?.contexto_pago?.service_data || null;

const getPassengerDisplayName = (passenger) => {
  if (!passenger || typeof passenger !== "object") return "";

  const parts = [
    passenger.fullName,
    [passenger.nombre, passenger.apellido].filter(Boolean).join(" "),
    [passenger.nombres, passenger.apellidos].filter(Boolean).join(" "),
    [
      passenger.nombres || passenger.nombre,
      passenger.apellido_paterno || passenger.apellidoPaterno,
      passenger.apellido_materno || passenger.apellidoMaterno,
    ]
      .filter(Boolean)
      .join(" "),
  ];

  return parts.find((value) => value && value.trim())?.trim() || "";
};

const getVoucherPassengerSummary = (voucherReserva, fallbackLabel) => {
  const passengerData =
    voucherReserva?.passengerData || voucherReserva?.peopleDetails || {};
  const adults = Array.isArray(passengerData?.adults)
    ? passengerData.adults
    : [];
  const children = Array.isArray(passengerData?.children)
    ? passengerData.children
    : [];

  const countFromArrays = adults.length + children.length;
  const countFromMeta =
    toNumber(voucherReserva?.peopleCount?.adults) +
    toNumber(voucherReserva?.peopleCount?.children) +
    toNumber(voucherReserva?.adultos) +
    toNumber(voucherReserva?.children);

  const passengerNames = [...adults, ...children]
    .map(getPassengerDisplayName)
    .filter(Boolean);

  return {
    passengerLabel:
      passengerNames.join(" / ") ||
      voucherReserva?.cliente_nombre ||
      voucherReserva?.nombre_cliente ||
      voucherReserva?.nombre_pasajero ||
      fallbackLabel,
    passengerCount: countFromArrays || countFromMeta || "",
  };
};

const flattenVoucherReservaServices = (voucherReserva) => {
  const itinerary = voucherReserva?.assigned_itinerary;
  if (!Array.isArray(itinerary)) return [];

  const output = [];
  itinerary.forEach((day) => {
    const servicios = day?.servicios;
    if (!Array.isArray(servicios)) return;

    servicios.forEach((service) => {
      const assigned = service?.assignedService;
      if (!assigned) return;

      output.push({
        typeService: (
          assigned?.typeService ||
          assigned?.parentService?.typeService ||
          ""
        ).toLowerCase(),
        assignedService: assigned,
      });
    });
  });

  return output;
};

const buildServiceLabel = (entry) => {
  const assigned = entry?.assignedService;
  const type = (entry?.typeService || "").toLowerCase();
  const parent = assigned?.parentService || {};
  const child = assigned?.childService || {};

  if (type.includes("transporte")) {
    const empresa = parent?.nombre_transporte || "Transporte";
    const ruta = child?.ruta || "";
    return `Transporte: ${empresa}${ruta ? ` • ${ruta}` : ""}`;
  }

  if (type.includes("vuelos")) {
    const nombre = parent?.nombre || "Vuelo";
    const ida = parent?.lugar_ida || "";
    const vuelta = parent?.lugar_vuelta || "";
    const ticket = parent?.nro_ticket || "";
    return `Vuelo: ${nombre}${ida || vuelta ? ` • ${ida}→${vuelta}` : ""}${ticket ? ` • Ticket ${ticket}` : ""}`;
  }

  if (type.includes("trenes")) {
    const empresa = parent?.nombre_empresa || "Tren";
    const tipoTren = child?.tipo_tren || "";
    const salida = child?.lugar_salida || "";
    const destino = child?.lugar_destino || "";
    return `Tren: ${empresa}${tipoTren ? ` • ${tipoTren}` : ""}${salida || destino ? ` • ${salida}→${destino}` : ""}`;
  }

  if (type.includes("hoteles")) {
    const hotel = parent?.nombre || parent?.hotel || child?.hotel || "Hotel";
    const habitacion = child?.tipo_habitacion || "";
    return `Hotel: ${hotel}${habitacion ? ` • ${habitacion}` : ""}`;
  }

  if (type.includes("tickets")) return "Tickets";
  if (type.includes("guias")) return "Guía";
  if (type.includes("endoses")) return "Endose";
  if (type.includes("restaurantes")) return "Restaurante";

  return type ? `Servicio: ${type}` : "Servicio";
};

const guessServiceTypeFromText = (text) => {
  const value = (text || "").toLowerCase();
  if (!value) return null;

  if (
    value.includes("transporte") ||
    value.includes("movilidad") ||
    value.includes("transfer")
  )
    return "transportes";
  if (
    value.includes("vuelo") ||
    value.includes("aereo") ||
    value.includes("ticket aéreo") ||
    value.includes("aéreo")
  )
    return "vuelos";
  if (
    value.includes("tren") ||
    value.includes("rail") ||
    value.includes("inka rail") ||
    value.includes("perurail")
  )
    return "trenes";
  if (value.includes("hotel") || value.includes("aloj")) return "hoteles";
  if (value.includes("guia") || value.includes("guía")) return "guias";
  if (value.includes("endose")) return "endoses";
  if (
    value.includes("restaurante") ||
    value.includes("almuerzo") ||
    value.includes("cena") ||
    value.includes("buffet")
  )
    return "restaurantes";
  if (value.includes("ticket") || value.includes("entrada")) return "tickets";

  return null;
};

const getMovimientoServiceType = (movimiento) => {
  const direct =
    movimiento?.typeService ||
    movimiento?.tipo_servicio ||
    movimiento?.service_type ||
    movimiento?.categoria_servicio ||
    movimiento?.cotizacionServiceRef?.typeService;

  const directNorm = direct ? String(direct).toLowerCase() : null;
  if (directNorm) return directNorm;

  return (
    guessServiceTypeFromText(movimiento?.tipo_documento) ||
    guessServiceTypeFromText(movimiento?.descripcion) ||
    null
  );
};

const getDetallePorMovimiento = (movimiento, voucherReservaEntries) => {
  if (movimiento?.tipo_movimiento === "ingreso") {
    return movimiento?.metodo_pago ? ` ${movimiento.metodo_pago}` : "";
  }

  const desiredType = getMovimientoServiceType(movimiento);
  if (
    desiredType &&
    Array.isArray(voucherReservaEntries) &&
    voucherReservaEntries.length
  ) {
    const found = voucherReservaEntries.find((entry) =>
      (entry?.typeService || "").includes(desiredType),
    );
    if (found) return buildServiceLabel(found);
  }

  return movimiento?.descripcion || "";
};

const inferBillingBucket = (movimiento, voucherReservaEntries) => {
  const rawContext = JSON.stringify(
    movimiento?.contexto_pago || {},
  ).toLowerCase();
  if (
    rawContext.includes("30641") ||
    rawContext.includes("exportacion") ||
    rawContext.includes("exportación")
  ) {
    return "EXPORTACION";
  }

  if (rawContext.includes("intangible")) {
    return "INTANGIBLE";
  }

  const serviceData = getServiceDataFromMovimiento(movimiento);
  const explicitValues = [
    serviceData?.facturacion,
    serviceData?.facturacion_tipo,
    serviceData?.facturacionTipo,
    serviceData?.billing_type,
    serviceData?.billingType,
    serviceData?.business_type,
    serviceData?.businessType,
    serviceData?.tariff?.business_type,
    serviceData?.tariff?.businessType,
  ]
    .map((value) => (value ? String(value).toLowerCase() : ""))
    .filter(Boolean);

  if (explicitValues.some((value) => value.includes("export"))) {
    return "EXPORTACION";
  }

  if (explicitValues.some((value) => value.includes("intang"))) {
    return "INTANGIBLE";
  }

  const inferredType = getMovimientoServiceType(movimiento);
  const detailText = getDetallePorMovimiento(
    movimiento,
    voucherReservaEntries,
  ).toLowerCase();

  if (
    ["vuelos", "trenes"].includes(inferredType) ||
    /(vuelo|ticket a[eé]reo|tren|perurail|inka rail)/.test(detailText)
  ) {
    return "EXPORTACION";
  }

  return inferredType ? "INTANGIBLE" : "";
};

const FileFormatModal = ({ group, exchangeRate, onClose }) => {
  const [voucherReserva, setVoucherReserva] = useState(null);
  const [loadingVR, setLoadingVR] = useState(false);
  const [vrError, setVrError] = useState(null);
  const tableRef = useRef(null);
  const movimientos = group?.movimientos ?? [];

  const movimientosOrdenados = useMemo(
    () =>
      [...movimientos].sort((a, b) => {
        if (a.tipo_movimiento === b.tipo_movimiento) return 0;
        if (a.tipo_movimiento === "ingreso") return -1;
        return 1;
      }),
    [movimientos],
  );

  const voucherReservaId =
    group?.referencia_voucher_reserva ||
    movimientos.find((movimiento) => movimiento?.referencia_voucher_reserva)
      ?.referencia_voucher_reserva ||
    null;

  useEffect(() => {
    let alive = true;

    const fetchVoucherReserva = async () => {
      if (!voucherReservaId) {
        setVoucherReserva(null);
        return;
      }

      try {
        setLoadingVR(true);
        setVrError(null);
        const response =
          await voucherReservaService.getVoucherReservaWithRelationsById(voucherReservaId);
        const data = normalizeVoucherReservaResponse(response);
        if (alive) setVoucherReserva(data || null);
      } catch (error) {
        console.error("Error cargando voucher reserva:", error);
        if (alive) setVrError("No se pudo cargar el voucher de reserva");
      } finally {
        if (alive) setLoadingVR(false);
      }
    };

    fetchVoucherReserva();

    return () => {
      alive = false;
    };
  }, [voucherReservaId]);

  const voucherReservaEntries = useMemo(
    () => flattenVoucherReservaServices(voucherReserva),
    [voucherReserva],
  );

  const fechaServicio = useMemo(() => {
    const quote = voucherReserva?.cotizacion_data || voucherReserva?.cotizacionData || {};
    return quote.fechainicio || quote.fechafin || "";
  }, [voucherReserva]);

  const passengerSummary = useMemo(
    () =>
      getVoucherPassengerSummary(
        voucherReserva,
        group?.voucher_code || "Sin pasajero",
      ),
    [group?.voucher_code, voucherReserva],
  );

  const reportRows = useMemo(
    () =>
      movimientosOrdenados.map((movimiento) => {
        const isIngreso = movimiento.tipo_movimiento === "ingreso";
        const amount = toNumber(movimiento.monto);
        const moneda = normCurrency(movimiento.moneda);
        const isSoles = moneda === "soles" || !movimiento.moneda;
        const isDolares = moneda === "dolares";
        const tipoCambio = getMovimientoExchangeRate(movimiento, exchangeRate);
        const detalle = getDetallePorMovimiento(
          movimiento,
          voucherReservaEntries,
        );
        const billingBucket = isIngreso
          ? ""
          : inferBillingBucket(movimiento, voucherReservaEntries);

        const fechaRow = isIngreso
          ? movimiento.fecha || movimiento.created_at
          : fechaServicio || movimiento.fecha || movimiento.created_at;

        const egresoSoles = !isIngreso && isSoles ? amount : null;
        const egresoDolares = !isIngreso && isDolares ? amount : null;
        const ingresoSoles = isIngreso && isSoles ? amount : null;
        const ingresoDolares = isIngreso && isDolares ? amount : null;
        const egresoTotalSoles = !isIngreso
          ? isSoles
            ? amount
            : tipoCambio > 0
              ? roundTo(amount * tipoCambio, 2)
              : null
          : null;
        const ingresoTotalSoles = isIngreso
          ? isSoles
            ? amount
            : tipoCambio > 0
              ? roundTo(amount * tipoCambio, 2)
              : null
          : null;

        const totalDolares = !isIngreso
          ? isDolares
            ? amount
            : tipoCambio > 0
              ? roundTo(amount / tipoCambio, 2)
              : null
          : null;

        const intangibleUsd =
          billingBucket === "INTANGIBLE" ? totalDolares : null;
        const exportacionUsd =
          billingBucket === "EXPORTACION" ? totalDolares : null;

        return {
          id: movimiento.id,
          documentType: movimiento?.tipo_documento || (isIngreso ? "PASS" : ""),
          fecha: formatDateDDMMYYYY(fechaRow),
          detalle,
          tipoCambio,
          monedaLabel: !isIngreso ? (isDolares ? "DOLARES" : "SOLES") : "",
          egresoSoles,
          egresoDolares,
          egresoTotalSoles,
          totalDolares,
          intangibleUsd,
          exportacionUsd,
          ingresoSoles,
          ingresoDolares,
          ingresoTotalSoles,
          responsable: movimiento.creator_name || "",
        };
      }),
    [exchangeRate, fechaServicio, movimientosOrdenados, voucherReservaEntries],
  );

  const reportTotals = useMemo(
    () =>
      reportRows.reduce(
        (accumulator, row) => {
          accumulator.egresosSoles += toNumber(row.egresoSoles);
          accumulator.egresosDolares += toNumber(row.egresoDolares);
          accumulator.totalEgresosDolares += toNumber(row.totalDolares);
          accumulator.totalEgresosSoles += toNumber(row.egresoTotalSoles);
          accumulator.intangibleUsd += toNumber(row.intangibleUsd);
          accumulator.exportacionUsd += toNumber(row.exportacionUsd);
          accumulator.ingresosSoles += toNumber(row.ingresoSoles);
          accumulator.ingresosDolares += toNumber(row.ingresoDolares);
          accumulator.totalIngresosSoles += toNumber(row.ingresoTotalSoles);
          return accumulator;
        },
        {
          egresosSoles: 0,
          egresosDolares: 0,
          totalEgresosDolares: 0,
          totalEgresosSoles: 0,
          intangibleUsd: 0,
          exportacionUsd: 0,
          ingresosSoles: 0,
          ingresosDolares: 0,
          totalIngresosSoles: 0,
        },
      ),
    [reportRows],
  );

  const totalEgresosSoles = useMemo(
    () => roundTo(reportTotals.totalEgresosSoles, 2),
    [reportTotals.totalEgresosSoles],
  );

  const totalIngresosSoles = useMemo(
    () => roundTo(reportTotals.totalIngresosSoles, 2),
    [reportTotals.totalIngresosSoles],
  );

  const utilidadNetaSoles = useMemo(
    () => roundTo(totalIngresosSoles - totalEgresosSoles, 2),
    [totalEgresosSoles, totalIngresosSoles],
  );

  const utilidadNetaUsd = useMemo(
    () =>
      roundTo(
        reportTotals.ingresosDolares -
          (reportTotals.intangibleUsd + reportTotals.exportacionUsd),
        2,
      ),
    [
      reportTotals.exportacionUsd,
      reportTotals.ingresosDolares,
      reportTotals.intangibleUsd,
    ],
  );

  const billingDistributionRows = useMemo(() => {
    const totalCost = reportTotals.exportacionUsd + reportTotals.intangibleUsd;
    const exportacionFactor =
      totalCost > 0 ? reportTotals.exportacionUsd / totalCost : 0;
    const intangibleFactor =
      totalCost > 0 ? reportTotals.intangibleUsd / totalCost : 0;
    const exportacionUtilidad = roundTo(utilidadNetaUsd * exportacionFactor, 2);
    const intangibleUtilidad = roundTo(utilidadNetaUsd * intangibleFactor, 2);

    return [
      {
        concepto: "Exportación Serv. Ley 30641",
        costoUsd: roundTo(reportTotals.exportacionUsd, 2),
        factorMargen: exportacionFactor,
        utilidadUsd: exportacionUtilidad,
        totalFacturasUsd: roundTo(
          reportTotals.exportacionUsd + exportacionUtilidad,
          2,
        ),
      },
      {
        concepto: "Venta de Intangibles",
        costoUsd: roundTo(reportTotals.intangibleUsd, 2),
        factorMargen: intangibleFactor,
        utilidadUsd: intangibleUtilidad,
        totalFacturasUsd: roundTo(
          reportTotals.intangibleUsd + intangibleUtilidad,
          2,
        ),
      },
      {
        concepto: "Total",
        costoUsd: roundTo(totalCost, 2),
        factorMargen: roundTo(exportacionFactor + intangibleFactor, 4),
        utilidadUsd: roundTo(exportacionUtilidad + intangibleUtilidad, 2),
        totalFacturasUsd: roundTo(
          reportTotals.exportacionUsd +
            reportTotals.intangibleUsd +
            exportacionUtilidad +
            intangibleUtilidad,
          2,
        ),
      },
    ];
  }, [
    reportTotals.exportacionUsd,
    reportTotals.intangibleUsd,
    utilidadNetaUsd,
  ]);

  const handlePrintTable = () => {
    window.print();
  };

  const handleDownloadExcel = async () => {
    if (!tableRef.current) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Resumen File");
    const table = tableRef.current.querySelector("table");
    const rows = Array.from(table.querySelectorAll("tr"));
    let excelRowIndex = 1;

    rows.forEach((row) => {
      let excelColIndex = 1;
      const cells = Array.from(row.children);

      cells.forEach((cell) => {
        while (worksheet.getCell(excelRowIndex, excelColIndex).value !== null) {
          excelColIndex += 1;
        }

        const rawText = cell.innerText?.trim() || "";
        const colspan = parseInt(cell.getAttribute("colspan") || "1", 10);
        const rowspan = parseInt(cell.getAttribute("rowspan") || "1", 10);
        const dataFormat = cell.dataset.format || "";
        const dataCurrency = cell.dataset.currency || "";
        let parsedValue = rawText;

        if (dataFormat === "money") {
          parsedValue = toNumber(rawText.replace(/[^0-9.-]+/g, ""));
        } else if (dataFormat === "rate") {
          parsedValue = toNumber(rawText.replace(/[^0-9.-]+/g, ""));
        } else if (dataFormat === "percent") {
          parsedValue = toNumber(rawText.replace(/[^0-9.-]+/g, "")) / 100;
        }

        const excelCell = worksheet.getCell(excelRowIndex, excelColIndex);
        excelCell.value = parsedValue;

        if (dataFormat === "money") {
          excelCell.numFmt =
            dataCurrency === "dolares" ? "$#,##0.00" : "[$S/] #,##0.00";
        }

        if (dataFormat === "rate") {
          excelCell.numFmt = "0.0000";
        }

        if (dataFormat === "percent") {
          excelCell.numFmt = "0.00%";
        }

        if (cell.tagName === "TH") {
          excelCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "7E1B52" },
          };
          excelCell.font = { bold: true, color: { argb: "FFFFFF" } };
          excelCell.alignment = { horizontal: "center", vertical: "middle" };
        }

        if (row.classList.contains("title-row")) {
          excelCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "6B1D45" },
          };
          excelCell.font = { bold: true, color: { argb: "FFFFFF" }, size: 14 };
        }

        if (row.classList.contains("meta-row")) {
          excelCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "F6ECF1" },
          };
        }

        if (row.classList.contains("summary-row")) {
          excelCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "F7F2F5" },
          };
          excelCell.font = { bold: true };
        }

        if (row.classList.contains("utility-row")) {
          excelCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "E8F5E9" },
          };
          excelCell.font = { bold: true };
        }

        if (row.classList.contains("section-title-row")) {
          excelCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FCE4EC" },
          };
          excelCell.font = { bold: true };
        }

        if (row.classList.contains("billing-header-row")) {
          excelCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "F3E5F5" },
          };
          excelCell.font = { bold: true };
          excelCell.alignment = { horizontal: "center", vertical: "middle" };
        }

        if (colspan > 1 || rowspan > 1) {
          worksheet.mergeCells(
            excelRowIndex,
            excelColIndex,
            excelRowIndex + rowspan - 1,
            excelColIndex + colspan - 1,
          );
        }

        excelColIndex += colspan;
      });

      excelRowIndex += 1;
    });

    [14, 14, 34, 11, 12, 14, 14, 14, 14, 14, 14, 14, 24].forEach(
      (width, index) => {
        worksheet.getColumn(index + 1).width = width;
      },
    );

    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `Resumen_File_${group.voucher_code}.xlsx`,
    );
  };

  return (
    <div className="file-format-modal-backdrop">
      <div className="file-format-modal">
        <div className="file-format-header">
          <div>
            <h2>Resumen File: {group.voucher_code}</h2>
            <p>
              Cada movimiento usa su propio tipo de cambio guardado en
              contexto_pago para calcular totales y facturación.
            </p>
            {voucherReservaId && (
              <p className="voucher-reserva-meta">
                Voucher Reserva: <strong>{voucherReservaId}</strong>
                {loadingVR ? " • Cargando..." : ""}
                {vrError ? ` • ${vrError}` : ""}
              </p>
            )}
          </div>

          <div className="file-format-actions">
            <button className="print-btn" onClick={handlePrintTable}>
              <GrPrint size={16} />
            </button>
            <button className="print-btn" onClick={handleDownloadExcel}>
              <GrDownload size={16} />
            </button>
            <button className="print-btn" onClick={onClose}>
              <GrClose size={16} />
            </button>
          </div>
        </div>

        <div className="file-format-body">
          <div ref={tableRef}>
            <table className="file-format-table">
              <thead>
                <tr className="title-row">
                  <th colSpan={13}>LIQUIDACION DE FILES</th>
                </tr>
                <tr className="meta-row">
                  <th colSpan={2}>NOMBRE DE PAX</th>
                  <td colSpan={11}>{passengerSummary.passengerLabel}</td>
                </tr>
                <tr className="meta-row">
                  <th colSpan={2}>N° DE PAX</th>
                  <td colSpan={11}>{passengerSummary.passengerCount || "-"}</td>
                </tr>
                <tr className="column-header-row">
                  <th rowSpan={2}>TIPO DOC.</th>
                  <th rowSpan={2}>FECHA</th>
                  <th rowSpan={2}>DETALLE</th>
                  <th rowSpan={2}>T.C.</th>
                  <th rowSpan={2}>MONEDA</th>
                  <th colSpan={3} className="egresos-header">
                    EGRESOS
                  </th>
                  <th colSpan={2}>FACTURACION</th>
                  <th colSpan={2} className="ingresos-header">
                    INGRESOS
                  </th>
                  <th rowSpan={2}>RESPONSABLE</th>
                </tr>
                <tr className="sub-header-row">
                  <th>SOLES</th>
                  <th>DOLARES</th>
                  <th>TOTAL USD</th>
                  <th>INTANGIBLE</th>
                  <th>EXPORTACION</th>
                  <th>SOLES</th>
                  <th>DOLARES</th>
                </tr>
              </thead>

              <tbody>
                {reportRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.documentType}</td>
                    <td className="date-cell" data-format="date">
                      {row.fecha}
                    </td>
                    <td>{row.detalle}</td>
                    <td className="rate-cell" data-format="rate">
                      {formatRate(row.tipoCambio)}
                    </td>
                    <td>{row.monedaLabel || "-"}</td>
                    <td
                      className="money-cell"
                      data-format="money"
                      data-currency="soles"
                    >
                      {row.egresoSoles != null
                        ? formatSoles(row.egresoSoles)
                        : ""}
                    </td>
                    <td
                      className="money-cell"
                      data-format="money"
                      data-currency="dolares"
                    >
                      {row.egresoDolares != null
                        ? formatUsd(row.egresoDolares)
                        : ""}
                    </td>
                    <td
                      className="money-cell"
                      data-format="money"
                      data-currency="dolares"
                    >
                      {row.totalDolares != null
                        ? formatUsd(row.totalDolares)
                        : ""}
                    </td>
                    <td
                      className="money-cell"
                      data-format="money"
                      data-currency="dolares"
                    >
                      {row.intangibleUsd != null
                        ? formatUsd(row.intangibleUsd)
                        : ""}
                    </td>
                    <td
                      className="money-cell"
                      data-format="money"
                      data-currency="dolares"
                    >
                      {row.exportacionUsd != null
                        ? formatUsd(row.exportacionUsd)
                        : ""}
                    </td>
                    <td
                      className="money-cell"
                      data-format="money"
                      data-currency="soles"
                    >
                      {row.ingresoSoles != null
                        ? formatSoles(row.ingresoSoles)
                        : ""}
                    </td>
                    <td
                      className="money-cell"
                      data-format="money"
                      data-currency="dolares"
                    >
                      {row.ingresoDolares != null
                        ? formatUsd(row.ingresoDolares)
                        : ""}
                    </td>
                    <td>{row.responsable}</td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="summary-row">
                  <td colSpan={5} className="label-cell">
                    TOTALES
                  </td>
                  <td
                    className="money-cell"
                    data-format="money"
                    data-currency="soles"
                  >
                    {formatSoles(reportTotals.egresosSoles)}
                  </td>
                  <td
                    className="money-cell"
                    data-format="money"
                    data-currency="dolares"
                  >
                    {formatUsd(reportTotals.egresosDolares)}
                  </td>
                  <td
                    className="money-cell"
                    data-format="money"
                    data-currency="dolares"
                  >
                    {formatUsd(reportTotals.totalEgresosDolares)}
                  </td>
                  <td
                    className="money-cell"
                    data-format="money"
                    data-currency="dolares"
                  >
                    {formatUsd(reportTotals.intangibleUsd)}
                  </td>
                  <td
                    className="money-cell"
                    data-format="money"
                    data-currency="dolares"
                  >
                    {formatUsd(reportTotals.exportacionUsd)}
                  </td>
                  <td
                    className="money-cell"
                    data-format="money"
                    data-currency="soles"
                  >
                    {formatSoles(reportTotals.ingresosSoles)}
                  </td>
                  <td
                    className="money-cell"
                    data-format="money"
                    data-currency="dolares"
                  >
                    {formatUsd(reportTotals.ingresosDolares)}
                  </td>
                  <td></td>
                </tr>

                <tr className="summary-row">
                  <td colSpan={5} className="label-cell">
                    TOTAL EN SOLES
                  </td>
                  <td
                    className="money-cell"
                    data-format="money"
                    data-currency="soles"
                  >
                    {formatSoles(totalEgresosSoles)}
                  </td>
                  <td colSpan={4}></td>
                  <td
                    className="money-cell"
                    data-format="money"
                    data-currency="soles"
                  >
                    {formatSoles(totalIngresosSoles)}
                  </td>
                  <td></td>
                  <td></td>
                </tr>

                <tr className="utilidad-row">
                  <td colSpan={5} className="label-cell">
                    UTILIDAD NETA
                  </td>
                  <td
                    className="money-cell"
                    data-format="money"
                    data-currency="soles"
                  >
                    {formatSoles(utilidadNetaSoles)}
                  </td>
                  <td colSpan={2}></td>
                  <td
                    className="money-cell"
                    colSpan={2}
                    data-format="money"
                    data-currency="dolares"
                  >
                    {formatUsd(utilidadNetaUsd)}
                  </td>
                  <td colSpan={3}></td>
                </tr>

                <tr className="section-title-row">
                  <td colSpan={13}>Facturación de Servicios</td>
                </tr>
                <tr className="billing-header-row">
                  <td colSpan={5}>Concepto</td>
                  <td colSpan={2}>Costos USD</td>
                  <td colSpan={2}>Factor Margen</td>
                  <td colSpan={2}>Utilidad USD</td>
                  <td colSpan={2}>Total Facturas USD</td>
                </tr>
                {billingDistributionRows.map((row) => (
                  <tr key={row.concepto} className="billing-row">
                    <td colSpan={5}>{row.concepto}</td>
                    <td
                      colSpan={2}
                      className="money-cell"
                      data-format="money"
                      data-currency="dolares"
                    >
                      {formatUsd(row.costoUsd)}
                    </td>
                    <td
                      colSpan={2}
                      className="money-cell"
                      data-format="percent"
                    >
                      {formatPercent(row.factorMargen)}
                    </td>
                    <td
                      colSpan={2}
                      className="money-cell"
                      data-format="money"
                      data-currency="dolares"
                    >
                      {formatUsd(row.utilidadUsd)}
                    </td>
                    <td
                      colSpan={2}
                      className="money-cell"
                      data-format="money"
                      data-currency="dolares"
                    >
                      {formatUsd(row.totalFacturasUsd)}
                    </td>
                  </tr>
                ))}
                <tr className="summary-note-row">
                  <td colSpan={13}>
                    La clasificación entre intangible y exportación se calcula
                    desde el contexto del servicio, la moneda y el detalle
                    contable disponible en cada movimiento.
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileFormatModal;
