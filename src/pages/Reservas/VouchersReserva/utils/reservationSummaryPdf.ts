import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatReservationSummaryDate } from "./reservationSummaryDate";

const PAGE = {
  width: 595.28,
  height: 841.89,
  marginX: 34,
  marginTop: 34,
  marginBottom: 34,
};

const COLORS = {
  primary: rgb(1, 0, 0.49),
  primarySoft: rgb(1, 0.96, 0.98),
  primaryStrong: rgb(0.67, 0, 0.33),
  sales: rgb(0.12, 0.39, 0.66),
  salesSoft: rgb(0.93, 0.97, 1.0),
  assigned: rgb(0.03, 0.45, 0.25),
  assignedSoft: rgb(0.93, 0.98, 0.95),
  text: rgb(0.12, 0.17, 0.14),
  muted: rgb(0.39, 0.45, 0.42),
  border: rgb(0.84, 0.88, 0.86),
  light: rgb(0.97, 0.98, 0.97),
  positive: rgb(0.03, 0.45, 0.25),
  negative: rgb(0.72, 0.10, 0.10),
  warning: rgb(0.58, 0.39, 0.02),
  white: rgb(1, 1, 1),
};

const numeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value, currency = "USD") =>
  `${["PEN", "SOLES", "SOL"].includes(String(currency).toUpperCase()) ? "S/ " : "$"}${numeric(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const safeFilename = (value = "resumen_reserva") =>
  String(value || "resumen_reserva")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "resumen_reserva";

const safeText = (value = "") =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2190-\u21ff]/g, "->")
    .replace(/[•·]/g, " - ")
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();


const serviceTypeLabel = (type) => {
  const normalized = String(type || "").toLowerCase();
  const labels = {
    hoteles: "HOTEL",
    hotel: "HOTEL",
    transportes: "TRANSPORTE",
    transporte: "TRANSPORTE",
    guias: "GUIA",
    guia: "GUIA",
    endoses: "ENDOSE",
    endose: "ENDOSE",
    vuelos: "VUELO",
    vuelo: "VUELO",
    trenes: "TREN",
    tren: "TREN",
    restaurantes: "RESTAURANTE",
    restaurante: "RESTAURANTE",
    tickets: "TICKET",
    ticket: "TICKET",
    extras: "EXTRA",
    extra: "EXTRA",
  };
  return labels[normalized] || safeText(type || "SERVICIO").toUpperCase();
};

const compactObjectValues = (...values) =>
  values
    .flat()
    .map((value) => safeText(value))
    .filter(Boolean);

const getServiceLines = (service = {}) => {
  const type = serviceTypeLabel(
    service?.typeService ||
      service?.type_service ||
      service?.parentService?.typeService ||
      service?.parentService?.type_service,
  );
  const parent = service?.parentService || service?.parent_service || service || {};
  const child = service?.childService || service?.child_service || service || {};
  const lines = [];

  switch (type) {
    case "HOTEL":
      lines.push(
        ...compactObjectValues(
          parent?.nombre,
          [parent?.categoria, parent?.ciudad].filter(Boolean).join(" - "),
          child?.tipo_habitacion || child?.habitacion?.tipo_habitacion,
        ),
      );
      break;
    case "TRANSPORTE":
      lines.push(
        ...compactObjectValues(
          parent?.nombre_transporte,
          parent?.zona ? `Zona: ${parent.zona}` : "",
          child?.tipo_auto,
          child?.ruta ? `Ruta: ${child.ruta}` : "",
        ),
      );
      break;
    case "GUIA": {
      const persona = parent?.persona || service?.persona || {};
      const ruta = child?.ruta || child || service?.ruta || {};
      lines.push(
        ...compactObjectValues(
          `${persona?.nombres || ""} ${persona?.apellidos || ""}`,
          ruta?.tour_nombre ? `Tour: ${ruta.tour_nombre}` : "",
        ),
      );
      break;
    }
    case "ENDOSE": {
      const tour = child?.tour || child || {};
      lines.push(
        ...compactObjectValues(
          parent?.nombre_agencia,
          parent?.tipo_tour ? `Tour: ${parent.tipo_tour}` : "",
          parent?.zona ? `Zona: ${parent.zona}` : "",
          tour?.tipo_guiado ? `Guiado: ${tour.tipo_guiado}` : "",
        ),
      );
      break;
    }
    case "VUELO": {
      const vuelo = parent?.vuelo || parent || {};
      const tipo = child?.tipo_vuelo || child || {};
      lines.push(
        ...compactObjectValues(
          vuelo?.nombre,
          tipo?.tipovuelo,
          tipo?.lugar_ida && tipo?.lugar_vuelta
            ? `${tipo.lugar_ida} -> ${tipo.lugar_vuelta}`
            : "",
        ),
      );
      break;
    }
    case "TREN": {
      const vagon = child?.vagon || child || {};
      lines.push(
        ...compactObjectValues(
          parent?.nombre_empresa,
          vagon?.tipo_tren,
          vagon?.lugar_salida && vagon?.lugar_destino
            ? `${vagon.lugar_salida} -> ${vagon.lugar_destino}`
            : "",
        ),
      );
      break;
    }
    case "RESTAURANTE": {
      const restaurant = child?.restaurante || service?.restaurante || child || {};
      lines.push(...compactObjectValues(restaurant?.nombre, restaurant?.direccion));
      break;
    }
    case "TICKET": {
      const ticket = child?.ticket || child?.tickets || service?.ticket || child || {};
      lines.push(
        ...compactObjectValues(
          ticket?.entrada,
          ticket?.procedencia ? `Procedencia: ${ticket.procedencia}` : "",
          ticket?.tipo_usuario ? `Tipo: ${ticket.tipo_usuario}` : "",
        ),
      );
      break;
    }
    case "EXTRA": {
      const extra = parent?.nombre ? parent : child?.servicio_extra || child || service || {};
      lines.push(...compactObjectValues(extra?.nombre, extra?.descripcion));
      break;
    }
    default:
      lines.push(
        ...compactObjectValues(
          parent?.nombre,
          parent?.descripcion,
          child?.nombre,
          child?.descripcion,
        ),
      );
  }

  return {
    type,
    title: lines[0] || "Servicio sin nombre",
    detail: lines.slice(1).join(" - "),
  };
};

const pricingText = (pricing = {}) => {
  if (!pricing?.hasPricing) return "Sin precio registrado";
  const parts = [];
  if (numeric(pricing?.perAdult) > 0) {
    parts.push(
      `${money(pricing.perAdult, pricing.currency)} por adulto${pricing.adultCount ? ` x ${pricing.adultCount}` : ""}`,
    );
  }
  (pricing?.childPriceGroups || []).forEach((group) => {
    parts.push(
      `${money(group.price, pricing.currency)} por nino${group.count ? ` x ${group.count}` : ""}`,
    );
  });
  if (numeric(pricing?.convertedChildCount) > 0) {
    parts.push(`${pricing.convertedChildCount} nino(s) con tarifa de adulto`);
  }
  parts.push(`Total ${money(pricing?.total, pricing.currency)}`);
  return parts.join(" | ");
};

const pricingRows = (pricing = {}) => {
  if (!pricing?.hasPricing) {
    return [{ label: "Precio", value: "Sin precio", muted: true }];
  }

  const rows = [];
  if (numeric(pricing?.perAdult) > 0) {
    rows.push({
      label: `Adulto${pricing.adultCount ? ` (${pricing.adultCount} pax)` : ""}`,
      value: `${money(pricing.perAdult, pricing.currency)} c/u`,
    });
  }
  (pricing?.childPriceGroups || []).forEach((group) => {
    rows.push({
      label: `Nino${group.count ? ` (${group.count} pax)` : ""}`,
      value: `${money(group.price, pricing.currency)} c/u`,
      child: true,
    });
  });
  if (numeric(pricing?.convertedChildCount) > 0) {
    rows.push({
      label: "Tarifa adulta",
      value: `${pricing.convertedChildCount} nino(s)`,
      muted: true,
    });
  }
  rows.push({ label: "Total", value: money(pricing?.total, pricing.currency), total: true });
  return rows;
};

const paymentPalette = (payment = {}) => {
  const key = String(payment?.key || "none").toLowerCase();
  if (key === "paid") {
    return { background: rgb(0.90, 0.97, 0.93), color: COLORS.positive };
  }
  if (key === "pending") {
    return { background: rgb(1.0, 0.96, 0.84), color: COLORS.warning };
  }
  if (key === "cancelled") {
    return { background: rgb(1.0, 0.91, 0.91), color: COLORS.negative };
  }
  return { background: rgb(0.95, 0.96, 0.95), color: COLORS.muted };
};

const breakLongWord = (word, font, size, maxWidth) => {
  const chunks = [];
  let current = "";
  [...word].forEach((character) => {
    const candidate = `${current}${character}`;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      chunks.push(current);
      current = character;
    } else {
      current = candidate;
    }
  });
  if (current) chunks.push(current);
  return chunks;
};

const wrapText = (text, font, size, maxWidth) => {
  const value = safeText(text);
  if (!value) return [""];
  const words = value.split(" ");
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const candidates =
      font.widthOfTextAtSize(word, size) > maxWidth
        ? breakLongWord(word, font, size, maxWidth)
        : [word];

    candidates.forEach((candidateWord) => {
      const candidate = line ? `${line} ${candidateWord}` : candidateWord;
      if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(line);
        line = candidateWord;
      } else {
        line = candidate;
      }
    });
  });

  if (line) lines.push(line);
  return lines.length ? lines : [""];
};

class PdfWriter {
  constructor(pdf, regularFont, boldFont) {
    this.pdf = pdf;
    this.regularFont = regularFont;
    this.boldFont = boldFont;
    this.pages = [];
    this.page = null;
    this.y = 0;
    this.newPage();
  }

  newPage() {
    this.page = this.pdf.addPage([PAGE.width, PAGE.height]);
    this.pages.push(this.page);
    this.y = PAGE.height - PAGE.marginTop;
  }

  ensure(height) {
    if (this.y - height < PAGE.marginBottom + 16) this.newPage();
  }

  gap(value = 8) {
    this.y -= value;
  }

  rule(color = COLORS.border) {
    this.ensure(8);
    this.page.drawLine({
      start: { x: PAGE.marginX, y: this.y },
      end: { x: PAGE.width - PAGE.marginX, y: this.y },
      thickness: 0.7,
      color,
    });
    this.y -= 8;
  }

  text(text, {
    size = 9,
    bold = false,
    color = COLORS.text,
    indent = 0,
    maxWidth = PAGE.width - PAGE.marginX * 2 - indent,
    lineHeight = size * 1.35,
    after = 0,
  } = {}) {
    const font = bold ? this.boldFont : this.regularFont;
    const lines = wrapText(text, font, size, maxWidth);
    this.ensure(lines.length * lineHeight + after);
    lines.forEach((line) => {
      this.page.drawText(line, {
        x: PAGE.marginX + indent,
        y: this.y,
        size,
        font,
        color,
      });
      this.y -= lineHeight;
    });
    this.y -= after;
  }

  labelValue(label, value, { color = COLORS.text } = {}) {
    this.ensure(18);
    this.page.drawText(safeText(label), {
      x: PAGE.marginX,
      y: this.y,
      size: 8,
      font: this.regularFont,
      color: COLORS.muted,
    });
    const valueText = safeText(value);
    const width = this.boldFont.widthOfTextAtSize(valueText, 9);
    this.page.drawText(valueText, {
      x: Math.max(PAGE.marginX + 130, PAGE.width - PAGE.marginX - width),
      y: this.y,
      size: 9,
      font: this.boldFont,
      color,
    });
    this.y -= 15;
  }

  section(title, subtitle = "") {
    this.ensure(subtitle ? 42 : 28);
    this.page.drawRectangle({
      x: PAGE.marginX,
      y: this.y - (subtitle ? 31 : 19),
      width: PAGE.width - PAGE.marginX * 2,
      height: subtitle ? 36 : 24,
      color: COLORS.primarySoft,
      borderColor: COLORS.border,
      borderWidth: 0.6,
    });
    this.page.drawText(safeText(title), {
      x: PAGE.marginX + 10,
      y: this.y - 12,
      size: 11,
      font: this.boldFont,
      color: COLORS.primary,
    });
    if (subtitle) {
      this.page.drawText(safeText(subtitle), {
        x: PAGE.marginX + 10,
        y: this.y - 25,
        size: 7.5,
        font: this.regularFont,
        color: COLORS.muted,
      });
    }
    this.y -= subtitle ? 44 : 32;
  }

  dayBanner(day = {}) {
    const width = PAGE.width - PAGE.marginX * 2;
    const height = 42;
    this.ensure(height + 8);
    const top = this.y;
    this.page.drawRectangle({
      x: PAGE.marginX,
      y: top - height,
      width,
      height,
      color: COLORS.primarySoft,
      borderColor: COLORS.border,
      borderWidth: 0.7,
    });
    this.page.drawRectangle({
      x: PAGE.marginX,
      y: top - height,
      width: 5,
      height,
      color: COLORS.primary,
    });
    this.page.drawText(`DIA ${safeText(day?.number || "-")}`, {
      x: PAGE.marginX + 13,
      y: top - 15,
      size: 8,
      font: this.boldFont,
      color: COLORS.primary,
    });
    this.page.drawText(safeText(day?.title || "Sin titulo"), {
      x: PAGE.marginX + 13,
      y: top - 29,
      size: 10,
      font: this.boldFont,
      color: COLORS.text,
    });
    const amount = money(day?.quotedTotal);
    const amountWidth = this.boldFont.widthOfTextAtSize(amount, 10);
    this.page.drawText("SERVICIOS COTIZADOS", {
      x: PAGE.width - PAGE.marginX - 118,
      y: top - 13,
      size: 6.5,
      font: this.boldFont,
      color: COLORS.muted,
    });
    this.page.drawText(amount, {
      x: PAGE.width - PAGE.marginX - amountWidth - 10,
      y: top - 29,
      size: 10,
      font: this.boldFont,
      color: COLORS.sales,
    });
    this.y = top - height - 7;

    const context = [
      day?.description ? safeText(day.description) : "",
      Array.isArray(day?.cities) && day.cities.length
        ? `Ciudades: ${day.cities.join(" - ")}`
        : "",
    ].filter(Boolean);
    if (context.length) {
      this.text(context.join(" | "), {
        size: 7.2,
        color: COLORS.muted,
        after: 4,
      });
    }
  }

  serviceBlock({ number, quoted, assigned, payment, showAssignedCosts }) {
    const quotedInfo = getServiceLines(quoted?.data || {});
    const assignedInfo = assigned?.data ? getServiceLines(assigned.data) : null;
    const cardWidth = PAGE.width - PAGE.marginX * 2;
    const cardPadding = 10;
    const columnsGap = 18;
    const stageWidth = (cardWidth - cardPadding * 2 - columnsGap) / 2;
    const headerHeight = 28;

    const stageModel = ({ info, pricing, assignedStage = false }) => {
      const titleLines = info
        ? wrapText(
            `${info.type} - ${info.title}`,
            this.boldFont,
            7.8,
            stageWidth - 20,
          )
        : [];
      const detailLines = info?.detail
        ? wrapText(info.detail, this.regularFont, 6.8, stageWidth - 20)
        : [];
      const rows = assignedStage && !showAssignedCosts
        ? [{ label: "Reservas", value: "Asignacion registrada", muted: true }]
        : pricingRows(pricing);
      const noteHeight = numeric(pricing?.convertedChildCount) > 0 ? 9 : 0;
      const priceHeight = 17 + rows.length * 9 + noteHeight;
      const infoHeight = info
        ? 11 + titleLines.length * 8 + detailLines.length * 6.8
        : 28;
      const height = Math.max(70, 18 + infoHeight + 6 + priceHeight + 8);
      return { info, pricing, titleLines, detailLines, rows, priceHeight, height };
    };

    const quotedStage = stageModel({
      info: quotedInfo,
      pricing: quoted?.pricing,
      assignedStage: false,
    });
    const assignedStage = stageModel({
      info: assignedInfo,
      pricing: assigned?.pricing,
      assignedStage: true,
    });
    const stagesHeight = Math.max(quotedStage.height, assignedStage.height);
    const cardHeight = headerHeight + stagesHeight + 18;
    this.ensure(cardHeight + 10);

    const top = this.y;
    const bottom = top - cardHeight;
    this.page.drawRectangle({
      x: PAGE.marginX,
      y: bottom,
      width: cardWidth,
      height: cardHeight,
      color: COLORS.white,
      borderColor: COLORS.border,
      borderWidth: 0.8,
    });

    this.page.drawRectangle({
      x: PAGE.marginX,
      y: top - headerHeight,
      width: cardWidth,
      height: headerHeight,
      color: COLORS.light,
    });
    this.page.drawRectangle({
      x: PAGE.marginX + 9,
      y: top - 25,
      width: 23,
      height: 20,
      color: COLORS.primaryStrong,
    });
    const numberText = String(number).padStart(2, "0");
    const numberWidth = this.boldFont.widthOfTextAtSize(numberText, 8);
    this.page.drawText(numberText, {
      x: PAGE.marginX + 20.5 - numberWidth / 2,
      y: top - 18,
      size: 8,
      font: this.boldFont,
      color: COLORS.white,
    });
    this.page.drawText("SERVICIO DEL ITINERARIO", {
      x: PAGE.marginX + 41,
      y: top - 12,
      size: 6.5,
      font: this.boldFont,
      color: COLORS.muted,
    });
    this.page.drawText(
      `Cotizado ${money(quoted?.pricing?.total, quoted?.pricing?.currency)}${assignedInfo && showAssignedCosts ? `  |  Asignado ${money(assigned?.pricing?.total, assigned?.pricing?.currency)}` : ""}`,
      {
        x: PAGE.marginX + 41,
        y: top - 23,
        size: 8,
        font: this.boldFont,
        color: COLORS.text,
      },
    );

    const paymentText = safeText(payment?.label || "Sin solicitud");
    const paymentStyle = paymentPalette(payment);
    const paymentWidth = Math.max(
      58,
      this.boldFont.widthOfTextAtSize(paymentText, 7) + 16,
    );
    this.page.drawRectangle({
      x: PAGE.width - PAGE.marginX - paymentWidth - 9,
      y: top - 24,
      width: paymentWidth,
      height: 18,
      color: paymentStyle.background,
    });
    this.page.drawText(paymentText, {
      x: PAGE.width - PAGE.marginX - paymentWidth - 1,
      y: top - 18,
      size: 7,
      font: this.boldFont,
      color: paymentStyle.color,
    });

    const drawStage = ({ x, yTop, height, model, assignedStage: isAssigned }) => {
      const stageY = yTop - height;
      const accent = isAssigned ? COLORS.assigned : COLORS.sales;
      const soft = isAssigned ? COLORS.assignedSoft : COLORS.salesSoft;
      this.page.drawRectangle({
        x,
        y: stageY,
        width: stageWidth,
        height,
        color: soft,
        borderColor: COLORS.border,
        borderWidth: 0.6,
      });
      this.page.drawRectangle({
        x,
        y: stageY,
        width: 4,
        height,
        color: accent,
      });

      this.page.drawText(isAssigned ? "RESERVAS" : "VENTAS", {
        x: x + 11,
        y: yTop - 13,
        size: 6.3,
        font: this.boldFont,
        color: COLORS.muted,
      });
      this.page.drawText(
        isAssigned ? (model.info ? "ASIGNADO" : "POR ASIGNAR") : "COTIZADO",
        {
          x: x + 61,
          y: yTop - 13,
          size: 7.1,
          font: this.boldFont,
          color: accent,
        },
      );

      if (!model.info) {
        const emptyLines = wrapText(
          "Pendiente de proveedor, servicio y costo asignado.",
          this.regularFont,
          7.2,
          stageWidth - 22,
        );
        let emptyY = yTop - 36;
        emptyLines.forEach((line) => {
          this.page.drawText(line, {
            x: x + 11,
            y: emptyY,
            size: 7.2,
            font: this.regularFont,
            color: COLORS.warning,
          });
          emptyY -= 9;
        });
        return;
      }

      let infoY = yTop - 25;
      model.titleLines.forEach((line) => {
        this.page.drawText(line, {
          x: x + 11,
          y: infoY,
          size: 7.2,
          font: this.boldFont,
          color: COLORS.text,
        });
        infoY -= 8;
      });
      model.detailLines.forEach((line) => {
        this.page.drawText(line, {
          x: x + 11,
          y: infoY,
          size: 6.3,
          font: this.regularFont,
          color: COLORS.muted,
        });
        infoY -= 6.8;
      });

      const panelX = x + 9;
      const panelY = stageY + 9;
      const panelWidth = stageWidth - 18;
      this.page.drawRectangle({
        x: panelX,
        y: panelY,
        width: panelWidth,
        height: model.priceHeight,
        color: COLORS.white,
        borderColor: COLORS.border,
        borderWidth: 0.5,
      });
      this.page.drawText("PRECIO POR PERSONA", {
        x: panelX + 7,
        y: panelY + model.priceHeight - 10,
        size: 5.3,
        font: this.boldFont,
        color: COLORS.muted,
      });

      let rowY = panelY + model.priceHeight - 20;
      model.rows.forEach((row) => {
        const value = safeText(row.value);
        const valueWidth = this.boldFont.widthOfTextAtSize(value, 6.8);
        this.page.drawText(safeText(row.label), {
          x: panelX + 7,
          y: rowY,
          size: 5.9,
          font: row.total ? this.boldFont : this.regularFont,
          color: row.child ? COLORS.warning : COLORS.muted,
        });
        this.page.drawText(value, {
          x: panelX + panelWidth - valueWidth - 7,
          y: rowY,
          size: 6.3,
          font: this.boldFont,
          color: row.total ? accent : row.muted ? COLORS.muted : COLORS.text,
        });
        rowY -= 9;
      });

      if (numeric(model.pricing?.convertedChildCount) > 0) {
        this.page.drawText(
          `${model.pricing.convertedChildCount} nino(s) con tarifa de adulto`,
          {
            x: panelX + 7,
            y: panelY + 5,
            size: 5.3,
            font: this.regularFont,
            color: COLORS.warning,
          },
        );
      }
    };

    const stagesTop = top - headerHeight - 9;
    const quotedX = PAGE.marginX + cardPadding;
    const assignedX = quotedX + stageWidth + columnsGap;
    drawStage({
      x: quotedX,
      yTop: stagesTop,
      height: stagesHeight,
      model: quotedStage,
      assignedStage: false,
    });
    drawStage({
      x: assignedX,
      yTop: stagesTop,
      height: stagesHeight,
      model: assignedStage,
      assignedStage: true,
    });

    const arrowY = stagesTop - 19;
    const centerX = quotedX + stageWidth + columnsGap / 2;
    this.page.drawLine({
      start: { x: centerX - 5, y: arrowY },
      end: { x: centerX + 5, y: arrowY },
      thickness: 1,
      color: COLORS.primary,
    });
    this.page.drawLine({
      start: { x: centerX + 5, y: arrowY },
      end: { x: centerX + 2, y: arrowY + 2.5 },
      thickness: 1,
      color: COLORS.primary,
    });
    this.page.drawLine({
      start: { x: centerX + 5, y: arrowY },
      end: { x: centerX + 2, y: arrowY - 2.5 },
      thickness: 1,
      color: COLORS.primary,
    });

    this.y = bottom - 10;
  }

  finalize() {
    this.pages.forEach((page, index) => {
      const pageNumber = `Pagina ${index + 1} de ${this.pages.length}`;
      const width = this.regularFont.widthOfTextAtSize(pageNumber, 7);
      page.drawLine({
        start: { x: PAGE.marginX, y: 24 },
        end: { x: PAGE.width - PAGE.marginX, y: 24 },
        thickness: 0.5,
        color: COLORS.border,
      });
      page.drawText(pageNumber, {
        x: PAGE.width - PAGE.marginX - width,
        y: 12,
        size: 7,
        font: this.regularFont,
        color: COLORS.muted,
      });
      page.drawText("Documento operativo de Reservas - Venso Tours", {
        x: PAGE.marginX,
        y: 12,
        size: 7,
        font: this.regularFont,
        color: COLORS.muted,
      });
    });
  }
}

const addCommercialSummary = (writer, model) => {
  writer.section(
    "Cotizacion por persona",
    "Importes por persona y total de la cotizacion.",
  );

  const quotationSummary = model?.quotationSummary || {};
  const parts = Array.isArray(quotationSummary?.parts)
    ? quotationSummary.parts
    : Array.isArray(model?.commercialPricing?.parts)
      ? model.commercialPricing.parts
      : [];
  if (parts.length > 0) {
    parts.forEach((part) => {
      const components = [
        numeric(part?.services) > 0 ? `Servicios ${money(part.services)}` : "",
        numeric(part?.hotel) > 0 ? `Hotel ${money(part.hotel)}` : "",
        numeric(part?.additional) > 0 ? `Adicionales ${money(part.additional)}` : "",
        numeric(part?.external) > 0 ? `Externo ${money(part.external)}` : "",
      ].filter(Boolean);
      writer.text(`${part?.label || "Pasajeros"}: ${money(part?.displayValue ?? part?.value)}`, {
        size: 9,
        bold: true,
        after: 1,
      });
      writer.text(
        `${numeric(part?.beneficiaries)} pax - Subtotal cotizado ${money(part?.lineTotal)}${components.length ? ` - ${components.join(" - ")}` : ""}`,
        { size: 7.5, color: COLORS.muted, after: 4 },
      );
    });
  } else {
    writer.labelValue(
      "Total cotizado",
      money(quotationSummary?.grandTotal ?? model?.totals?.commercialGrandTotal),
    );
  }

  (model?.additionalCostRows || []).forEach((row) => {
    writer.labelValue(
      `${row?.label || "Adicional"} (${row?.configured || ""})`,
      money(row?.calculated),
    );
  });
  writer.labelValue(
    "Total cotizado",
    money(quotationSummary?.grandTotal ?? model?.totals?.commercialGrandTotal),
    { color: COLORS.primary },
  );
};

const addHotelSummary = (writer, model) => {
  const rows = Array.isArray(model?.hotelRows) ? model.hotelRows : [];
  if (!rows.length) return;
  writer.section("Hotel y habitaciones", "Distribucion utilizada para el precio por persona.");
  rows.forEach((room) => {
    writer.text(`${room?.label || "Habitacion"} - ${money(room?.perPerson)} por persona`, {
      size: 8.5,
      bold: true,
      after: 1,
    });
    writer.text(
      `${room?.groupLabel ? `${room.groupLabel} - ` : ""}${numeric(room?.nights)} noche(s) - ${numeric(room?.beneficiaries)} pax - Total ${money(room?.total)}`,
      { size: 7.5, color: COLORS.muted, after: 4 },
    );
  });
};

export const buildReservationSummaryPdf = async ({ model, showAssignedCosts = true }) => {
  if (!model) throw new Error("No se encontro el modelo del resumen de reserva");

  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const writer = new PdfWriter(pdf, regularFont, boldFont);

  const voucherCode =
    model?.voucher?.voucher_code ||
    model?.voucher?.voucherCode ||
    model?.voucher?.id ||
    "Voucher";
  const quoteTitle =
    model?.cotizacion?.titulo ||
    model?.cotizacion?.nombre ||
    model?.cotizacion?.title ||
    "Itinerario de servicios";

  writer.page.drawRectangle({
    x: 0,
    y: PAGE.height - 84,
    width: PAGE.width,
    height: 84,
    color: COLORS.primary,
  });
  writer.page.drawText("RESERVAS - ITINERARIO COTIZADO", {
    x: PAGE.marginX,
    y: PAGE.height - 29,
    size: 9,
    font: boldFont,
    color: COLORS.white,
  });
  const titleLines = wrapText(quoteTitle, boldFont, 17, PAGE.width - PAGE.marginX * 2);
  titleLines.slice(0, 2).forEach((line, index) => {
    writer.page.drawText(line, {
      x: PAGE.marginX,
      y: PAGE.height - 50 - index * 18,
      size: 17,
      font: boldFont,
      color: COLORS.white,
    });
  });
  writer.y = PAGE.height - 103;
  const quotedPassengerCount =
    numeric(model?.quotationSummary?.passengerCount) ||
    numeric(model?.peopleCount?.total);
  writer.text(
    `${voucherCode} - ${numeric(model?.days?.length)} dia(s) - ${quotedPassengerCount} pax cotizados - Inicio ${formatReservationSummaryDate(model?.fechaInicio)}`,
    { size: 8.5, color: COLORS.muted, after: 2 },
  );
  writer.text(
    `Servicios asignados: ${numeric(model?.totals?.assignedCount)} de ${numeric(model?.totals?.serviceCount)}`,
    { size: 8.5, bold: true, after: 8 },
  );

  addCommercialSummary(writer, model);
  addHotelSummary(writer, model);

  const quotationSummary = model?.quotationSummary || {};
  writer.section(
    "Resumen de la cotizacion",
    "Totales comerciales informados por Ventas; los costos asignados se detallan dentro de cada servicio.",
  );
  writer.labelValue(
    `Adultos cotizados (${numeric(quotationSummary?.adultCount)} pax)`,
    money(quotationSummary?.adultTotal),
  );
  writer.labelValue(
    `Ninos cotizados (${numeric(quotationSummary?.childCount)} pax)`,
    money(quotationSummary?.childTotal),
  );
  writer.labelValue(
    "Total cotizado",
    money(quotationSummary?.grandTotal ?? model?.totals?.commercialGrandTotal),
    { color: COLORS.primary },
  );

  writer.section("Itinerario por dias", "Comparacion entre lo cotizado por Ventas y lo asignado por Reservas.");
  (model?.days || []).forEach((day) => {
    writer.dayBanner(day);

    (day?.services || []).forEach((service, index) => {
      writer.serviceBlock({
        number: index + 1,
        quoted: {
          data: service?.quotedServiceData,
          pricing: service?.quotedPricing,
        },
        assigned: {
          data: service?.assignedServiceData,
          pricing: service?.assignedPricing,
        },
        payment: service?.payment,
        showAssignedCosts,
      });
    });
    writer.gap(4);
  });

  writer.rule();
  writer.text(
    "La cabecera reproduce la cotizacion de Ventas. La asignacion y sus costos se detallan servicio por servicio.",
    { size: 7.5, color: COLORS.muted },
  );

  writer.finalize();
  return pdf.save();
};

export const downloadReservationSummaryPdf = async ({
  model,
  filename,
  showAssignedCosts = true,
}) => {
  const pdfBytes = await buildReservationSummaryPdf({ model, showAssignedCosts });
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFilename(filename)}.pdf`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default downloadReservationSummaryPdf;
