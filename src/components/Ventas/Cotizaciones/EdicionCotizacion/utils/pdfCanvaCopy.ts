export type PdfCanvaLanguage = "es" | "en" | "pt";

type PdfCanvaCopy = {
  duration: {
    day: string;
    days: string;
    night: string;
    nights: string;
  };
  dayScript: string;
  firstDayIntro: string;
  untitledQuote: string;
  editor: {
    coverTitlePlaceholder: string;
    dayTitlePlaceholder: string;
    dayDescriptionPlaceholder: string;
    structureEyebrow: string;
    pages: string;
    structureSummary: string;
    cover: string;
    price: string;
    reservation: string;
    terms: string;
  };
};

const PDF_CANVA_COPY: Record<PdfCanvaLanguage, PdfCanvaCopy> = {
  es: {
    duration: {
      day: "DÍA",
      days: "DÍAS",
      night: "NOCHE",
      nights: "NOCHES",
    },
    dayScript: "Día",
    firstDayIntro: "Tu viaje soñado comienza con los brazos abiertos de Venso Tours.",
    untitledQuote: "Cotización sin título",
    editor: {
      coverTitlePlaceholder: "Título de portada",
      dayTitlePlaceholder: "Título del día",
      dayDescriptionPlaceholder: "Descripción del día...",
      structureEyebrow: "ESTRUCTURA VENSO",
      pages: "páginas",
      structureSummary: "Portada, itinerario, precio y condiciones.",
      cover: "Portada",
      price: "Precio",
      reservation: "Reserva",
      terms: "Términos",
    },
  },
  en: {
    duration: {
      day: "DAY",
      days: "DAYS",
      night: "NIGHT",
      nights: "NIGHTS",
    },
    dayScript: "Day",
    firstDayIntro: "Your dream journey begins with Venso Tours welcoming you with open arms.",
    untitledQuote: "Untitled quotation",
    editor: {
      coverTitlePlaceholder: "Cover title",
      dayTitlePlaceholder: "Day title",
      dayDescriptionPlaceholder: "Day description...",
      structureEyebrow: "VENSO STRUCTURE",
      pages: "pages",
      structureSummary: "Cover, itinerary, pricing and terms.",
      cover: "Cover",
      price: "Price",
      reservation: "Reservation",
      terms: "Terms",
    },
  },
  pt: {
    duration: {
      day: "DIA",
      days: "DIAS",
      night: "NOITE",
      nights: "NOITES",
    },
    dayScript: "Dia",
    firstDayIntro: "Sua viagem dos sonhos começa com a Venso Tours recebendo você de braços abertos.",
    untitledQuote: "Cotação sem título",
    editor: {
      coverTitlePlaceholder: "Título da capa",
      dayTitlePlaceholder: "Título do dia",
      dayDescriptionPlaceholder: "Descrição do dia...",
      structureEyebrow: "ESTRUTURA VENSO",
      pages: "páginas",
      structureSummary: "Capa, roteiro, preço e condições.",
      cover: "Capa",
      price: "Preço",
      reservation: "Reserva",
      terms: "Termos",
    },
  },
};

export const normalizePdfCanvaLanguage = (idioma?: string | null): PdfCanvaLanguage => {
  const normalized = String(idioma || "es").trim().toLowerCase();
  if (normalized.startsWith("en")) return "en";
  if (normalized.startsWith("pt")) return "pt";
  return "es";
};

export const getPdfCanvaCopy = (idioma?: string | null): PdfCanvaCopy =>
  PDF_CANVA_COPY[normalizePdfCanvaLanguage(idioma)];

export const formatPdfCanvaDuration = (
  daysCount: number,
  idioma?: string | null,
): { days: string; nights: string } => {
  const copy = getPdfCanvaCopy(idioma);
  const days = Math.max(0, Number(daysCount) || 0);
  const nights = Math.max(0, days - 1);
  const dayLabel = days === 1 ? copy.duration.day : copy.duration.days;
  const nightLabel = nights === 1 ? copy.duration.night : copy.duration.nights;

  return {
    days: `${days} ${dayLabel}`,
    nights: `${nights} ${nightLabel}`,
  };
};
