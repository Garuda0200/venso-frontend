import {
  Fragment,
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  MdAdd,
  MdClose,
  MdCalendarToday,
  MdDeleteOutline,
  MdFileDownload,
  MdFlightTakeoff,
  MdNotes,
  MdPublic,
  MdTranslate,
} from "react-icons/md";
import { toCanvas } from "html-to-image";
import { PDFDocument } from "pdf-lib";
import { toast } from "react-toastify";
import { voucherVentaService } from "../../../../../services/voucherVentaService";
import contabilidadService from "../../../../../services/contabilidadService";
import pasajeroService from "../../../../../services/pasajeroService";
import voucherDocumentService from "../../../../../services/voucherDocumentService";
import { repairMojibakeText } from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/hotelDetallePayload";
import {
  addDaysToDate,
  formatLongDate as formatSharedLongDate,
  parseLocalDate,
  toIsoDate,
} from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/formatters";
import { buildSummaryContentPricingModel } from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/summaryContentPricingParts";
import { buildSummaryPricingPresentation } from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/summaryPricingCore";
import { hydrateCotizacionPricingContext } from "../../../Cotizaciones/utils/cotizacionPricingContext";
import {
  filterVoucherPaymentMovements,
  getQuoteTravelDates,
  summarizeVoucherFinancials,
} from "../../utils/voucherFinancials";
import "./VentasSummaryPDFModal.scss";

/* ======================= DEFAULT TEXTS ======================= */

const DEFAULT_INFO_EXTRA = `El tour Incluye:
• Todos los traslados al hotel, aeropuerto, estaciones y atractivos.
• Guiado en Machu Picchu en servicio privado
• Todos los transportes para los tours.
• Pasajes en Tren ida y vuelta en servicio Turístico Expedition o Voyager // Opcional 65 USD para el tren VISTADOME OBSERVATORY por tramo, consultar con su ejecutivo de ventas
• Pasajes de bus subida y bajada Aguas Calientes - Machu Picchu - Aguas Calientes.
• Guía profesional de turismo en idioma inglés o español.
• Ingresos a los atractivos turísticos a visita: Machu Picchu,
• 09 noches en Hotel seleccionado (sujeto a disponibilidad).
• 09 desayunos o Breakfast.
• 03 almuerzos en Cusco (Día 4, día 6, 8 y día 9)
• Bus ruta del sol Puno – Cusco en servicio compartido.
• Reservas de tickets, espacios y servicio de Agencia.
• Vuelos en la ruta Lima Cusco Lima (incluye equipaje facturado de 10 kilos + bolso de mano o artículo personal)
No Incluye maleta de 23 kg//si desea adicionar, deberá consultar con su ejecutivo de ventas.
El tour NO Incluye:
• Vuelos internacionales`;

const DEFAULT_TERMINOS = `TÉRMINOS Y CONDICIONES - VENSO TOURS

1. Vuelos Domésticos (Perú)
Sujetos a las condiciones de la tarifa comprada.
Cambios o reprogramaciones aplican con pago de diferencia tarifaria + penalidad de USD 30 + cargo por reemisión de USD 16 por pasajero.
En casos de fuerza mayor (clima, desastres, disposiciones gubernamentales o cierres oficiales), aplican las políticas del proveedor correspondiente.
En caso de emisión por grupo, aplican penalidades específicas de cada aerolínea (Sky, Latam u otras).
La no presentación en el vuelo (no show) implica pérdida total del servicio sin reembolso.

2. Proceso de Reserva
La reserva se confirma únicamente con el pago del adelanto:
Categoría 3 estrellas: inicial del 30% del paquete completo, solicitado por la agencia y el envío del comprobante de pago. Hasta ese momento, los servicios están sujetos a disponibilidad.
Categoría 4 estrellas: inicial del 40% del paquete completo, solicitado por la agencia y el envío del comprobante de pago. Hasta ese momento, los servicios están sujetos a disponibilidad.
Categoría 5 estrellas: inicial del 50% del paquete completo, solicitado por la agencia y el envío del comprobante de pago. Hasta ese momento, los servicios están sujetos a disponibilidad.

3. Pagos
Se solicita un adelanto para garantizar entrada a Machu Picchu, trenes, hoteles y servicios.
El saldo restante deberá ser cancelado como máximo 20 días antes del inicio del viaje.
Los pagos con tarjeta de crédito pueden estar sujetos a recargos según la plataforma de pago elegida, con un cargo de 3% a 6%.

4. Tarifas
Las tarifas están expresadas en dólares americanos (USD), vigentes desde el 1 de enero hasta el 31 de diciembre de 2026, y pueden tener una variación hasta el momento de la confirmación debido a disponibilidad de vuelos e ingreso a Machu Picchu.

5. Política de Cancelación
Debido a que muchos servicios turísticos en Perú son no reembolsables, especialmente entradas a Machu Picchu y trenes, aplican las siguientes condiciones:
Cancelaciones con más de 45 días de anticipación: penalidad del 30% del total del paquete.
Cancelaciones con más de 30 días de anticipación: penalidad del 40% del total del programa.
Cancelaciones con menos de 20 días: penalidad del 50% al 100%.

6. Cambios de Fecha
Los cambios están sujetos a disponibilidad y penalidades de proveedores (vuelos, trenes, hoteles, entradas y otros servicios contratados).

7. No Show en Sitio
En caso de no presentarse a un servicio contratado, no corresponde reembolso.

8. Responsabilidad
La agencia actúa como intermediaria entre el pasajero y los proveedores (hoteles, trenes, aerolíneas y transporte). No se responsabiliza por retrasos, cancelaciones o cambios por causas ajenas a su control (clima, huelgas, desastres naturales, decisiones gubernamentales).

9. Documentación
Es responsabilidad del pasajero portar pasaporte vigente (6 meses de vigencia antes del viaje), boletos y documentación necesaria para el viaje.

10. Seguro de Viaje
Se recomienda contratar un seguro de viaje que cubra cancelaciones, asistencia médica y pérdida de equipaje, de preferencia cuando se viaja con adultos mayores, infantes y niños.

11. Fuerza Mayor
No nos hacemos responsables de lesiones, pérdidas, accidentes, retrasos o problemas causados por omisiones o negligencia de terceros, ni por factores fuera de nuestro control, como fenómenos naturales, enfermedades, conflictos, cuarentenas, huelgas o regulaciones gubernamentales. Nos reservamos el derecho de cambiar cualquier tour o excursión si consideramos que esto mejorará la experiencia del viaje. Además, no somos responsables de trámites de visado o vacunación requeridos.

RESUMEN DE CARGOS Y PENALIDADES

Nota: A todos los precios, cargos y penalidades indicados se les adicionará la comisión correspondiente por transferencias internacionales, pagos con tarjeta de crédito, PayPal u otros medios, según corresponda.

Este es un resumen de las políticas principales. Las condiciones completas están disponibles en nuestra oficina, a solicitud del pasajero y en nuestra página web: https://vensotours.com/`;

const DEFAULT_PAGO_TEXT = `Este monto lo podrá pagar en la ciudad de Cusco, en efectivo con billetes en buen estado, en caso haga uso de su tarjeta de crédito, debe tener en cuenta que se le hará una recarga del 5.5% al monto a pagar.`;

const VOUCHER_LANGUAGES = [
  { code: "es", label: "ES", name: "Español", flag: "🇪🇸" },
  { code: "en", label: "EN", name: "English", flag: "🇺🇸" },
  { code: "pt", label: "PT", name: "Português", flag: "🇧🇷" },
];

const VOUCHER_LANG_PAIRS = { en: "es|en", pt: "es|pt" };
const VOUCHER_LANGUAGE_VERSION_KEY = "language_versions";

const VENTAS_SUMMARY_PDF_CACHE = new Map();
const VENTAS_SUMMARY_IMAGE_DATA_URL_CACHE = new Map();
const VENTAS_SUMMARY_CAPTURE_BATCH_SIZE = 2;
const VENTAS_SUMMARY_STATIC_ASSETS = [
  "/brand/logo-principal-magenta.webp",
];

const VENSO_VOUCHER_CONTACT = {
  agency: "VENSO TOURS",
  cusco: "Venso Tours | 958 722 109",
  emergency: "(+51) 987 279911",
};


const hashVentasSummaryPdfText = (value = "") => {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const rememberVentasSummaryImageDataUrl = (url, dataUrl) => {
  if (!url) return;
  VENTAS_SUMMARY_IMAGE_DATA_URL_CACHE.set(url, dataUrl || null);
  if (VENTAS_SUMMARY_IMAGE_DATA_URL_CACHE.size > 80) {
    const firstKey = VENTAS_SUMMARY_IMAGE_DATA_URL_CACHE.keys().next().value;
    if (firstKey) VENTAS_SUMMARY_IMAGE_DATA_URL_CACHE.delete(firstKey);
  }
};

const fetchVentasSummaryImageAsDataUrl = async (src, timeoutMs = 5000) => {
  if (!src) return null;
  if (/^data:|^blob:/i.test(src)) return src;

  const absoluteSrc = /^https?:\/\//i.test(src)
    ? src
    : new URL(src, window.location.origin).href;
  if (VENTAS_SUMMARY_IMAGE_DATA_URL_CACHE.has(absoluteSrc)) {
    return VENTAS_SUMMARY_IMAGE_DATA_URL_CACHE.get(absoluteSrc);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(absoluteSrc, {
      credentials: new URL(absoluteSrc).origin === window.location.origin ? "include" : "same-origin",
      signal: controller.signal,
      cache: "force-cache",
    });
    if (!response.ok) {
      rememberVentasSummaryImageDataUrl(absoluteSrc, null);
      return null;
    }
    const blob = await response.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    rememberVentasSummaryImageDataUrl(absoluteSrc, dataUrl);
    rememberVentasSummaryImageDataUrl(src, dataUrl);
    return dataUrl;
  } catch {
    rememberVentasSummaryImageDataUrl(absoluteSrc, null);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

const preloadVentasSummaryStaticAssets = async () => {
  await Promise.allSettled(
    VENTAS_SUMMARY_STATIC_ASSETS.map((src) => fetchVentasSummaryImageAsDataUrl(src)),
  );
};

const putVentasSummaryPdfCache = (key, pdfBytes) => {
  if (!key || !pdfBytes) return;
  VENTAS_SUMMARY_PDF_CACHE.set(key, { pdfBytes, createdAt: Date.now() });
  if (VENTAS_SUMMARY_PDF_CACHE.size > 3) {
    const oldestKey = [...VENTAS_SUMMARY_PDF_CACHE.entries()]
      .sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0))[0]?.[0];
    if (oldestKey && oldestKey !== key) VENTAS_SUMMARY_PDF_CACHE.delete(oldestKey);
  }
};

const VOUCHER_LABELS = {
  es: {
    modalTitle: "Resumen de Voucher de Venta",
    languageTitle: "Idioma del voucher",
    languageUpdating: "Traduciendo...",
    saveChanges: "Guardar cambios",
    saving: "Guardando...",
    downloadPdf: "Descargar PDF",
    preparing: "Preparando...",
    generating: "Generando",
    loading: "Cargando información...",
    travelAgent: "Agente de viajes:",
    code: "Código:",
    emissionDate: "Fecha de emisión:",
    serviceVoucher: "VOUCHER DE SERVICIO",
    totalPackageAmount: "Monto total paquete:",
    paidAmount: "Monto pagado:",
    pendingAmount: "Monto pendiente:",
    paymentSystem: "Sistema de pago:",
    bookingCode: "Código de reserva:",
    passengerName: "Nombre del pasajero:",
    tourStartDate: "Fecha de inicio del tour:",
    packageName: "Nombre del Paquete turístico:",
    packageNamePlaceholder: "Nombre del paquete turístico",
    hotel: "Hotel:",
    categories: "Categorías:",
    roomType: "Tipo de habitación:",
    roomExtraPlaceholder: "Detalle adicional de habitación",
    trainService: "Servicio de tren:",
    trainType: "Tipo:",
    trainTypePlaceholder: "Tipo de tren",
    route: "Ruta:",
    routePlaceholder: "Ruta",
    originPlaceholder: "Origen",
    destinationPlaceholder: "Destino",
    trainRoutePlaceholder: "Ruta del tren",
    entranceType: "Tipo de ingreso:",
    entranceExtraPlaceholder: "Detalle adicional de ingreso",
    passengersData: "DATOS DE LOS PASAJEROS",
    child: "NIÑO",
    adult: "ADULTO",
    names: "Nombres:",
    paternalLastName: "Apellido paterno:",
    maternalLastName: "Apellido materno:",
    country: "País:",
    document: "Documento",
    birthDate: "Fecha de nacimiento:",
    sex: "Sexo:",
    passengerPhone: "Teléfono del pasajero:",
    passengerPhonePlaceholder: "Teléfono del pasajero",
    emergencyPhone: "Teléfono de emergencia:",
    emergencyPhonePlaceholder: "Teléfono de emergencia",
    internationalFlightData: "Datos de Vuelo Internacional",
    nationalFlightData: "Datos de vuelos internos",
    addInternationalFlight: "Agregar Vuelo Internacional",
    addNationalFlight: "Agregar Vuelo Nacional (Interno)",
    airline: "Aerolínea",
    flightClass: "Clase",
    flightNumber: "N° Vuelo",
    number: "Número",
    date: "Fecha",
    departureTime: "Hora salida",
    arrivalTime: "Hora llegada",
    baggage: "Equipaje",
    from: "Desde",
    to: "Hasta",
    cancel: "Cancelar",
    saveFlight: "Guardar vuelo",
    removeFlight: "Quitar vuelo agregado",
    fromDate: "Del:",
    toDate: "al",
    day: "Día",
    itinerary: "ITINERARIO",
    noItinerary: "No hay itinerario disponible.",
    includesTitle: "INCLUYE / NO INCLUYE",
    paymentInfo: "INFORMACIÓN DE PAGO",
    touristPackage: "Paquete turístico",
    priceBreakdownTitle: "Precios por persona",
    adultPrice: "Precio por adulto",
    childPrice: "Precio por niño",
    adultRoomPrice: "Adulto en habitación",
    childRoomPrice: "Niño en habitación",
    perPerson: "por persona",
    passengersShort: "pax",
    amountSent: "Monto enviado:",
    voucherTotal: "Total del voucher:",
    balanceToPayIn: "Saldo a pagar en",
    observations: "OBSERVACIONES",
    observationsPlaceholder: "Agregar observaciones del voucher",
    addObservations: "Observaciones",
    addInternationalFlightButton: "Vuelo internacional",
    addNationalFlightButton: "Vuelo interno",
    showPaymentTotals: "Detalle pax",
    paymentTotalsHint: "Mostrar u ocultar el detalle de pax sin cambiar el precio por persona",
    unitPrice: "Unitario",
    termsTitle: "TÉRMINOS Y CONDICIONES",
    pdfIndications: "Indicaciones del PDF",
    pdfIndicationsPlaceholder: "Escribe indicaciones internas para este PDF. No aparecerán en el voucher exportado.",
  },
  en: {
    modalTitle: "Sales Voucher Summary",
    languageTitle: "Voucher language",
    languageUpdating: "Translating...",
    saveChanges: "Save changes",
    saving: "Saving...",
    downloadPdf: "Download PDF",
    preparing: "Preparing...",
    generating: "Generating",
    loading: "Loading information...",
    travelAgent: "Travel agent:",
    code: "Code:",
    emissionDate: "Issue date:",
    serviceVoucher: "SERVICE VOUCHER",
    totalPackageAmount: "Total package amount:",
    paidAmount: "Amount paid:",
    pendingAmount: "Pending amount:",
    paymentSystem: "Payment system:",
    bookingCode: "Booking code:",
    passengerName: "Passenger name:",
    tourStartDate: "Tour start date:",
    packageName: "Tour package name:",
    packageNamePlaceholder: "Tour package name",
    hotel: "Hotel:",
    categories: "Categories:",
    roomType: "Room type:",
    roomExtraPlaceholder: "Additional room details",
    trainService: "Train service:",
    trainType: "Type:",
    trainTypePlaceholder: "Train type",
    route: "Route:",
    routePlaceholder: "Route",
    originPlaceholder: "Origin",
    destinationPlaceholder: "Destination",
    trainRoutePlaceholder: "Train route",
    entranceType: "Entrance type:",
    entranceExtraPlaceholder: "Additional entrance details",
    passengersData: "PASSENGER DETAILS",
    child: "CHILD",
    adult: "ADULT",
    names: "Names:",
    paternalLastName: "Paternal last name:",
    maternalLastName: "Maternal last name:",
    country: "Country:",
    document: "Document",
    birthDate: "Date of birth:",
    sex: "Sex:",
    passengerPhone: "Passenger phone:",
    passengerPhonePlaceholder: "Passenger phone",
    emergencyPhone: "Emergency phone:",
    emergencyPhonePlaceholder: "Emergency phone",
    internationalFlightData: "International Flight Details",
    nationalFlightData: "Domestic Flight Details",
    addInternationalFlight: "Add International Flight",
    addNationalFlight: "Add Domestic Flight",
    airline: "Airline",
    flightClass: "Class",
    flightNumber: "Flight No.",
    number: "Number",
    date: "Date",
    departureTime: "Departure time",
    arrivalTime: "Arrival time",
    baggage: "Baggage",
    from: "From",
    to: "To",
    cancel: "Cancel",
    saveFlight: "Save flight",
    removeFlight: "Remove added flight",
    fromDate: "From:",
    toDate: "to",
    day: "Day",
    itinerary: "ITINERARY",
    noItinerary: "No itinerary available.",
    includesTitle: "INCLUDES / DOES NOT INCLUDE",
    paymentInfo: "PAYMENT INFORMATION",
    touristPackage: "Tour package",
    priceBreakdownTitle: "Prices per person",
    adultPrice: "Price per adult",
    childPrice: "Price per child",
    adultRoomPrice: "Adult in room",
    childRoomPrice: "Child in room",
    perPerson: "per person",
    passengersShort: "pax",
    amountSent: "Amount sent:",
    voucherTotal: "Voucher total:",
    balanceToPayIn: "Balance to pay in",
    observations: "OBSERVATIONS",
    observationsPlaceholder: "Add voucher observations",
    addObservations: "Observations",
    addInternationalFlightButton: "International flight",
    addNationalFlightButton: "Domestic flight",
    showPaymentTotals: "Pax detail",
    paymentTotalsHint: "Show or hide pax detail without changing the per-person price",
    unitPrice: "Unit",
    termsTitle: "TERMS AND CONDITIONS",
    pdfIndications: "PDF notes",
    pdfIndicationsPlaceholder: "Write internal notes for this PDF. They will not appear in the exported voucher.",
  },
  pt: {
    modalTitle: "Resumo do Voucher de Venda",
    languageTitle: "Idioma do voucher",
    languageUpdating: "Traduzindo...",
    saveChanges: "Salvar alterações",
    saving: "Salvando...",
    downloadPdf: "Baixar PDF",
    preparing: "Preparando...",
    generating: "Gerando",
    loading: "Carregando informações...",
    travelAgent: "Agente de viagens:",
    code: "Código:",
    emissionDate: "Data de emissão:",
    serviceVoucher: "VOUCHER DE SERVIÇO",
    totalPackageAmount: "Valor total do pacote:",
    paidAmount: "Valor pago:",
    pendingAmount: "Valor pendente:",
    paymentSystem: "Sistema de pagamento:",
    bookingCode: "Código da reserva:",
    passengerName: "Nome do passageiro:",
    tourStartDate: "Data de início do tour:",
    packageName: "Nome do pacote turístico:",
    packageNamePlaceholder: "Nome do pacote turístico",
    hotel: "Hotel:",
    categories: "Categorias:",
    roomType: "Tipo de quarto:",
    roomExtraPlaceholder: "Detalhes adicionais do quarto",
    trainService: "Serviço de trem:",
    trainType: "Tipo:",
    trainTypePlaceholder: "Tipo de trem",
    route: "Rota:",
    routePlaceholder: "Rota",
    originPlaceholder: "Origem",
    destinationPlaceholder: "Destino",
    trainRoutePlaceholder: "Rota do trem",
    entranceType: "Tipo de ingresso:",
    entranceExtraPlaceholder: "Detalhes adicionais do ingresso",
    passengersData: "DADOS DOS PASSAGEIROS",
    child: "CRIANÇA",
    adult: "ADULTO",
    names: "Nomes:",
    paternalLastName: "Sobrenome paterno:",
    maternalLastName: "Sobrenome materno:",
    country: "País:",
    document: "Documento",
    birthDate: "Data de nascimento:",
    sex: "Sexo:",
    passengerPhone: "Telefone do passageiro:",
    passengerPhonePlaceholder: "Telefone do passageiro",
    emergencyPhone: "Telefone de emergência:",
    emergencyPhonePlaceholder: "Telefone de emergência",
    internationalFlightData: "Dados do voo internacional",
    nationalFlightData: "Dados dos voos internos",
    addInternationalFlight: "Adicionar voo internacional",
    addNationalFlight: "Adicionar voo nacional (interno)",
    airline: "Companhia aérea",
    flightClass: "Classe",
    flightNumber: "N° Voo",
    number: "Número",
    date: "Data",
    departureTime: "Hora de saída",
    arrivalTime: "Hora de chegada",
    baggage: "Bagagem",
    from: "De",
    to: "Até",
    cancel: "Cancelar",
    saveFlight: "Salvar voo",
    removeFlight: "Remover voo adicionado",
    fromDate: "De:",
    toDate: "até",
    day: "Dia",
    itinerary: "ITINERÁRIO",
    noItinerary: "Não há itinerário disponível.",
    includesTitle: "INCLUI / NÃO INCLUI",
    paymentInfo: "INFORMAÇÕES DE PAGAMENTO",
    touristPackage: "Pacote turístico",
    priceBreakdownTitle: "Preços por pessoa",
    adultPrice: "Preço por adulto",
    childPrice: "Preço por criança",
    adultRoomPrice: "Adulto em quarto",
    childRoomPrice: "Criança em quarto",
    perPerson: "por pessoa",
    passengersShort: "pax",
    amountSent: "Valor enviado:",
    voucherTotal: "Total do voucher:",
    balanceToPayIn: "Saldo a pagar em",
    observations: "OBSERVAÇÕES",
    observationsPlaceholder: "Adicionar observações do voucher",
    addObservations: "Observações",
    addInternationalFlightButton: "Voo internacional",
    addNationalFlightButton: "Voo interno",
    showPaymentTotals: "Detalhe pax",
    paymentTotalsHint: "Mostrar ou ocultar o detalhe de pax sem alterar o preço por pessoa",
    unitPrice: "Unitário",
    termsTitle: "TERMOS E CONDIÇÕES",
    pdfIndications: "Indicações do PDF",
    pdfIndicationsPlaceholder: "Escreva indicações internas para este PDF. Elas não aparecerão no voucher exportado.",
  },
};

const getVoucherLabels = (idioma = "es") =>
  VOUCHER_LABELS[idioma] || VOUCHER_LABELS.es;

const getVoucherLocale = (idioma = "es") => {
  if (idioma === "en") return "en-US";
  if (idioma === "pt") return "pt-BR";
  return "es-ES";
};

/* ======================= TEXT FORMATTERS ======================= */

const normalizeMojibakeText = (value = "") => repairMojibakeText(value);

/** Render T&C text with bold section headers */
const formatTycText = (text) => {
  if (!text) return null;
  const lines = normalizeMojibakeText(text).split("\n");
  return lines.map((line, i) => {
    const trimmed = line.trim();
    const isHeader =
      /^\d+\.\s/.test(trimmed) ||
      /^(TÉRMINOS|TERMINOS|TERMOS|TERMS|RESUMEN DE|RESUMO DE|SUMMARY OF|Protección de Datos|Proteccion de Datos|Data Protection|Proteção de Dados|Protecao de Dados|Concepto\s*\|)/i.test(
        trimmed,
      ) ||
      /^(POLÍTICAS DE|POLITICAS DE|POLÍTICAS|POLICIES|Requisitos para|Requirements for|Requisitos para|Política de|Policy of|Política de|Resumo de|Resumen de|Summary of|Nota:|Note:)/i.test(
        trimmed,
      );
    return (
      <span key={i}>
        {i > 0 && "\n"}
        {isHeader ? (
          <strong className="terminos-subtitle">{line}</strong>
        ) : (
          line
        )}
      </span>
    );
  });
};

const INFO_EXTRA_INCLUDE_SUBTITLE = "El tour Incluye:";
const INFO_EXTRA_NO_INCLUDE_SUBTITLE = "El tour NO Incluye:";

const INFO_EXTRA_SUBTITLE_LABELS = {
  es: {
    include: INFO_EXTRA_INCLUDE_SUBTITLE,
    noInclude: INFO_EXTRA_NO_INCLUDE_SUBTITLE,
  },
  en: {
    include: "The tour Includes:",
    noInclude: "The tour Does NOT Include:",
  },
  pt: {
    include: "O tour Inclui:",
    noInclude: "O tour NÃO Inclui:",
  },
};

const getInfoExtraSubtitleDisplay = (value = "", idioma = "es") => {
  const labels = INFO_EXTRA_SUBTITLE_LABELS[idioma] || INFO_EXTRA_SUBTITLE_LABELS.es;
  if (isInfoExtraIncludeSubtitle(value)) return labels.include;
  if (isInfoExtraNoIncludeSubtitle(value)) return labels.noInclude;
  return String(value ?? "");
};

const isInfoExtraIncludeSubtitle = (value = "") =>
  /^(?:el\s+tour\s+)?incluye\s*:?$/i.test(String(value || "").trim());

const isInfoExtraNoIncludeSubtitle = (value = "") =>
  /^(?:el\s+tour\s+)?(?:no\s+incluye|no\s+incluye:)\s*:?$/i.test(
    String(value || "").trim(),
  );

const isInfoExtraSubtitle = (value = "") =>
  isInfoExtraIncludeSubtitle(value) || isInfoExtraNoIncludeSubtitle(value);

const canonicalizeInfoExtraSubtitle = (value = "") => {
  if (isInfoExtraIncludeSubtitle(value)) return INFO_EXTRA_INCLUDE_SUBTITLE;
  if (isInfoExtraNoIncludeSubtitle(value)) return INFO_EXTRA_NO_INCLUDE_SUBTITLE;
  return String(value ?? "");
};

const normalizeInfoExtraSubtitleLines = (value = "") =>
  normalizeEditableNewlines(value)
    .split("\n")
    .map((line) => canonicalizeInfoExtraSubtitle(line));

const restoreInfoExtraSubtitlesFromFallback = (value = "", fallback = "") => {
  const nextLines = normalizeInfoExtraSubtitleLines(value);
  const fallbackLines = normalizeInfoExtraSubtitleLines(fallback);

  fallbackLines.forEach((line, fallbackIndex) => {
    if (!isInfoExtraSubtitle(line)) return;

    const exists = isInfoExtraIncludeSubtitle(line)
      ? nextLines.some(isInfoExtraIncludeSubtitle)
      : nextLines.some(isInfoExtraNoIncludeSubtitle);

    if (!exists) {
      nextLines.splice(Math.min(fallbackIndex, nextLines.length), 0, line);
    }
  });

  return nextLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

const ensureInfoExtraLockedSubtitles = (value = "") => {
  const nextLines = normalizeInfoExtraSubtitleLines(value);

  if (!nextLines.some(isInfoExtraIncludeSubtitle)) {
    nextLines.unshift(INFO_EXTRA_INCLUDE_SUBTITLE);
  }

  if (!nextLines.some(isInfoExtraNoIncludeSubtitle)) {
    nextLines.push(INFO_EXTRA_NO_INCLUDE_SUBTITLE);
  }

  return nextLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

const escapeHtml = (value = "") =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildInfoExtraEditableHtml = (text = "") =>
  normalizeMojibakeText(text)
    .split("\n")
    .map((line) => {
      const canonicalLine = canonicalizeInfoExtraSubtitle(line);
      const escapedLine = escapeHtml(canonicalLine);

      if (isInfoExtraSubtitle(canonicalLine)) {
        return `<strong class="info-extra-subtitle" contenteditable="false" data-info-extra-locked="true">${escapedLine}</strong>`;
      }

      return escapedLine;
    })
    .join("\n");

const syncInfoExtraEditableNode = (node, value = "", { force = false } = {}) => {
  if (!node) return;
  if (!force && node.dataset.editing === "true") return;

  const normalizedValue = normalizeEditableNewlines(value);
  if (node.dataset.renderedValue === normalizedValue) return;

  node.innerHTML = buildInfoExtraEditableHtml(normalizedValue);
  node.dataset.renderedValue = normalizedValue;
};

const readInfoExtraEditableNode = (node, fallbackText = "") =>
  restoreInfoExtraSubtitlesFromFallback(node?.textContent ?? "", fallbackText);


const sanitizeInfoExtraEditableContent = (value = "") =>
  normalizeEditableNewlines(value)
    .split("\n")
    .filter((line) => !isInfoExtraSubtitle(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const splitInfoExtraEditableBlocks = (text = "") => {
  const lines = normalizeInfoExtraSubtitleLines(text);
  const blocks = [];
  let editableStart = null;
  let editableLines = [];

  const pushEditable = (endLineIndex) => {
    if (editableStart === null) return;

    blocks.push({
      type: "editable",
      startLine: editableStart,
      endLine: Math.max(editableStart - 1, endLineIndex),
      text: editableLines.join("\n"),
    });

    editableStart = null;
    editableLines = [];
  };

  lines.forEach((line, index) => {
    if (isInfoExtraSubtitle(line)) {
      pushEditable(index - 1);
      blocks.push({
        type: "subtitle",
        lineIndex: index,
        text: canonicalizeInfoExtraSubtitle(line),
      });
      return;
    }

    if (editableStart === null) editableStart = index;
    editableLines.push(line);
  });

  pushEditable(lines.length - 1);

  const blocksWithEmptyEditors = [];
  blocks.forEach((block, index) => {
    blocksWithEmptyEditors.push(block);

    if (block.type !== "subtitle") return;

    const nextBlock = blocks[index + 1];
    if (nextBlock?.type === "editable") return;

    const insertionLine =
      nextBlock?.type === "subtitle" ? nextBlock.lineIndex : block.lineIndex + 1;

    blocksWithEmptyEditors.push({
      type: "editable",
      startLine: insertionLine,
      endLine: insertionLine - 1,
      text: "",
    });
  });

  return blocksWithEmptyEditors;
};

const replaceInfoExtraEditableBlock = (pageText = "", block = {}, value = "") => {
  const lines = normalizeInfoExtraSubtitleLines(pageText);
  const replacementLines = sanitizeInfoExtraEditableContent(value)
    .split("\n")
    .filter((line) => line.length > 0);
  const startLine = Math.max(0, Number(block.startLine ?? lines.length));
  const endLine = Math.max(startLine - 1, Number(block.endLine ?? startLine - 1));

  lines.splice(startLine, Math.max(0, endLine - startLine + 1), ...replacementLines);

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

const syncPlainEditableNode = (node, value = "") => {
  if (!node || node.dataset.editing === "true") return;
  const normalizedValue = normalizeEditableNewlines(value);
  if (node.textContent !== normalizedValue) {
    node.textContent = normalizedValue;
  }
};

/** Render Incluye/No Incluye text with bold, locked subtitles */
const formatInfoExtraText = (text) => {
  if (!text) return null;
  const lines = normalizeMojibakeText(text).split("\n");
  return lines.map((line, i) => {
    const canonicalLine = canonicalizeInfoExtraSubtitle(line);
    const isSubtitle = isInfoExtraSubtitle(canonicalLine);
    return (
      <span key={i}>
        {i > 0 && "\n"}
        {isSubtitle ? (
          <strong className="info-extra-subtitle" contentEditable={false}>
            {canonicalLine}
          </strong>
        ) : (
          canonicalLine
        )}
      </span>
    );
  });
};

const getPassengerBirthDate = (passenger = {}) =>
  passenger.fecha_nacimiento ||
  passenger.birthDate ||
  passenger.birthdate ||
  passenger.persona?.fecha_nacimiento ||
  passenger.persona_data?.fecha_nacimiento ||
  passenger.personaData?.fecha_nacimiento ||
  "";

/* ======================= HELPERS ======================= */

const getServiceName = (service) => {
  if (!service) return "Servicio sin nombre";
  const parentName =
    service.parentService?.nombre_hotel ||
    service.parentService?.nombre_transporte ||
    service.parentService?.aerolinea ||
    service.parentService?.nombre ||
    service.parentService?.nombre_empresa ||
    service.parentService?.nombre_agencia ||
    service.childService?.restaurante?.nombre ||
    service.childService?.ticket?.entrada ||
    service.childService?.servicio_extra?.nombre ||
    (service.parentService?.persona
      ? `${service.parentService.persona.nombres} ${service.parentService.persona.apellidos}`
      : "") ||
    "";
  const childName =
    service.childService?.tipo_habitacion ||
    service.childService?.tipo_auto ||
    service.childService?.tipo_vuelo?.tipovuelo ||
    service.childService?.nombre ||
    service.childService?.tipo_tren ||
    service.childService?.ruta?.tour_nombre ||
    service.parentService?.tipo_tour ||
    "";
  return parentName && childName
    ? `${parentName} - ${childName}`
    : parentName || childName || "Servicio sin nombre";
};

const getServiceStableId = (service = {}) =>
  service?.servicioId ??
  service?.servicio_id ??
  service?.itinerarioServicioId ??
  service?.itinerario_servicio_id ??
  service?.id ??
  service?.id_servicio ??
  null;

const markExternalVoucherService = (service = {}) => ({
  ...service,
  servicioId: service.servicioId ?? service.id ?? service.itinerarioServicioId,
  sourceItinerary: "external",
  isExternalItinerary: true,
});

const normalizeVoucherDays = (days) => {
  if (Array.isArray(days)) return days;
  if (days && typeof days === "object") {
    return Object.values(days).filter((day) => day && typeof day === "object");
  }
  return [];
};

const isExternalVoucherDay = (day = {}) =>
  day?.isExternalItinerary === true ||
  day?.sourceItinerary === "external" ||
  day?.refTipo === "cotizacion_externa" ||
  day?.ref_tipo === "cotizacion_externa";

const getVoucherDayNumber = (day, index) => {
  const explicitNumber = Number(day?.numero || day?.dia || day?.day || 0);
  return explicitNumber > 0 ? explicitNumber : index + 1;
};

const appendUniqueServices = (currentServices = [], services = []) => {
  const existingIds = new Set(
    currentServices
      .map(getServiceStableId)
      .filter((id) => id !== null && id !== undefined)
      .map(String),
  );

  const nextServices = [...currentServices];
  services.forEach((service) => {
    const stableId = getServiceStableId(service);
    if (stableId !== null && stableId !== undefined) {
      if (existingIds.has(String(stableId))) return;
      existingIds.add(String(stableId));
    }
    nextServices.push(service);
  });

  return nextServices;
};

const getMergedVoucherItineraryDays = (voucherData) => {
  if (!voucherData) return [];

  const cot =
    voucherData.cotizacion_data || voucherData.cotizacion || voucherData;
  const voucherDays = normalizeVoucherDays(voucherData.itinerario);
  const cotBaseDays = normalizeVoucherDays(cot.itinerario);
  const cotExternalDays = normalizeVoucherDays(
    cot.itinerario_externo ||
      cot.itinerarioExterno ||
      cot.externalItinerary ||
      voucherData.itinerario_externo ||
      voucherData.itinerarioExterno ||
      voucherData.externalItinerary,
  );
  const baseDays =
    cotBaseDays.length > 0
      ? cotBaseDays
      : voucherDays.filter((day) => !isExternalVoucherDay(day));
  const externalDays =
    cotExternalDays.length > 0
      ? cotExternalDays
      : voucherDays.filter(isExternalVoucherDay);
  const dayMap = new Map();

  baseDays.forEach((day, index) => {
    const dayNumber = getVoucherDayNumber(day, index);
    const current = dayMap.get(dayNumber);
    const services = normalizeVoucherDays(day?.servicios);

    if (!current) {
      dayMap.set(dayNumber, {
        ...day,
        numero: dayNumber,
        servicios: [...services],
      });
      return;
    }

    dayMap.set(dayNumber, {
      ...current,
      ...day,
      numero: dayNumber,
      titulo: current.titulo || day?.titulo || "",
      ciudades: day?.ciudades || current.ciudades,
      servicios: appendUniqueServices(current.servicios || [], services),
    });
  });

  externalDays.forEach((day, index) => {
    const dayNumber = getVoucherDayNumber(day, index);
    const externalServices = normalizeVoucherDays(day?.servicios)
      .map(markExternalVoucherService)
      .filter((service) => getServiceStableId(service) !== null);

    if (externalServices.length === 0) return;

    const current = dayMap.get(dayNumber) || {
      ...day,
      numero: dayNumber,
      titulo: "",
      ciudades: normalizeVoucherDays(day?.ciudades),
      servicios: [],
    };

    dayMap.set(dayNumber, {
      ...current,
      numero: dayNumber,
      servicios: appendUniqueServices(
        current.servicios || [],
        externalServices,
      ),
    });
  });

  return Array.from(dayMap.values()).sort(
    (left, right) => Number(left.numero || 0) - Number(right.numero || 0),
  );
};

const getItineraryDaysFromVoucherData = (voucherData) => {
  if (!voucherData) return [];

  const allDays = getMergedVoucherItineraryDays(voucherData);

  return allDays.map((day, index) => ({
    title: day?.titulo || `Dia ${Number(day?.numero || index + 1)}`,
    content: (day?.servicios || []).map(getServiceName).join("\n"),
  }));
};

const getVoucherPackageTitle = (voucherData = {}) => {
  const cotizacion =
    voucherData?.cotizacion_data || voucherData?.cotizacion || voucherData || {};

  return normalizeMojibakeText(
    cotizacion?.titulo ||
      cotizacion?.title ||
      cotizacion?.nombre_paquete ||
      cotizacion?.nombrePaquete ||
      "",
  );
};

const buildDatosPdfFromItinerary = (voucherData) => ({
  general: {
    packageName: "",
    travelAgent: voucherData?.created_by_name || voucherData?.created_by || "",
    paymentSystem:
      voucherData?.metodo_pago || voucherData?.payment_method || "",
    passengerPhone: "",
    emergencyPhone: "",
  },
  itinerary: {
    title: "ITINERARIO",
    days: getItineraryDaysFromVoucherData(voucherData),
  },
  hotel_train: {
    habitacionExtra: "",
    tipoIngresoExtra: "",
    trenTipo: "",
    trenRuta: "",
  },
  info_pago: {
    packageName: getVoucherPackageTitle(voucherData),
    lugarPago: "Cusco",
    textoPago: DEFAULT_PAGO_TEXT,
  },
  info_extra: DEFAULT_INFO_EXTRA,
  indicaciones_pdf: "",
  observaciones: "",
  sections: [],
});

const normalizeEditableNewlines = (value = "") =>
  String(value ?? "").replace(/\r\n?/g, "\n");

const normalizeEditableSingleLine = (value = "") =>
  normalizeEditableNewlines(value).replace(/\n+/g, " ");

const VOUCHER_TRANSLATION_CHUNK_SIZE = 420;

const translateVoucherTextChunk = async (value, pair) => {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(value)}&langpair=${pair}`;
    const response = await fetch(url);
    const data = await response.json();
    return data?.responseData?.translatedText || value;
  } catch (error) {
    console.warn("No se pudo traducir texto del voucher:", error);
    return value;
  }
};

const splitVoucherTextForTranslation = (text = "") => {
  const value = String(text ?? "");
  if (value.length <= VOUCHER_TRANSLATION_CHUNK_SIZE) return [value];

  const chunks = [];
  const blocks = value.split(/(\n+)/);

  blocks.forEach((block) => {
    if (!block) return;
    if (/^\n+$/.test(block)) {
      chunks.push(block);
      return;
    }

    const sentences =
      block.match(/[^.!?;:。！？]+[.!?;:。！？]*\s*/g) || [block];
    let buffer = "";

    sentences.forEach((sentence) => {
      if (
        buffer.trim() &&
        buffer.length + sentence.length > VOUCHER_TRANSLATION_CHUNK_SIZE
      ) {
        chunks.push(buffer);
        buffer = sentence;
      } else {
        buffer += sentence;
      }

      while (buffer.length > VOUCHER_TRANSLATION_CHUNK_SIZE) {
        chunks.push(buffer.slice(0, VOUCHER_TRANSLATION_CHUNK_SIZE));
        buffer = buffer.slice(VOUCHER_TRANSLATION_CHUNK_SIZE);
      }
    });

    if (buffer) chunks.push(buffer);
  });

  return chunks.length ? chunks : [value];
};

const translateVoucherText = async (text, targetLang) => {
  const value = String(text ?? "");
  if (!value.trim()) return value;
  const pair = VOUCHER_LANG_PAIRS[targetLang];
  if (!pair) return value;

  const chunks = splitVoucherTextForTranslation(value);
  const translatedChunks = [];

  for (const chunk of chunks) {
    if (!chunk.trim()) {
      translatedChunks.push(chunk);
    } else {
      translatedChunks.push(await translateVoucherTextChunk(chunk, pair));
    }
  }

  return translatedChunks.join("");
};

const stripDatosPdfLanguageMetadata = (datosPdf = {}) => {
  const {
    idioma: _idioma,
    language_versions: _languageVersions,
    i18n: _legacyI18n,
    translations: _legacyTranslations,
    ...content
  } = datosPdf || {};
  return JSON.parse(JSON.stringify(content || {}));
};

const getDatosPdfIdioma = (datosPdf = {}) => {
  const raw = String(datosPdf?.idioma || "es").toLowerCase();
  return VOUCHER_LANGUAGES.some((item) => item.code === raw) ? raw : "es";
};

const normalizeDatosPdfLanguageVersions = (datosPdf = {}) => {
  const candidates = [
    datosPdf?.[VOUCHER_LANGUAGE_VERSION_KEY],
    datosPdf?.i18n,
    datosPdf?.translations,
  ];

  const versions = {};
  candidates.forEach((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return;
    }

    VOUCHER_LANGUAGES.forEach(({ code }) => {
      if (candidate[code] && typeof candidate[code] === "object") {
        versions[code] = stripDatosPdfLanguageMetadata(candidate[code]);
      }
    });
  });

  return versions;
};

const hasDatosPdfLanguageMetadata = (datosPdf = {}) =>
  Boolean(
    datosPdf?.idioma ||
      datosPdf?.[VOUCHER_LANGUAGE_VERSION_KEY] ||
      datosPdf?.i18n ||
      datosPdf?.translations,
  );

const attachDatosPdfLanguageMetadata = (
  content = {},
  idioma = "es",
  versions = {},
) => {
  const language = idioma === "en" || idioma === "pt" ? idioma : "es";
  const cleanContent = stripDatosPdfLanguageMetadata(content);
  const nextVersions = {
    ...normalizeDatosPdfLanguageVersions({ [VOUCHER_LANGUAGE_VERSION_KEY]: versions }),
    [language]: cleanContent,
  };

  if (!nextVersions.es) {
    nextVersions.es = cleanContent;
  }

  const next = {
    ...cleanContent,
    [VOUCHER_LANGUAGE_VERSION_KEY]: nextVersions,
  };

  if (language !== "es") {
    next.idioma = language;
  }

  return next;
};

const syncDatosPdfCurrentLanguageVersion = (datosPdf = {}) => {
  if (!hasDatosPdfLanguageMetadata(datosPdf)) return datosPdf;
  const idioma = getDatosPdfIdioma(datosPdf);
  const versions = normalizeDatosPdfLanguageVersions(datosPdf);
  return attachDatosPdfLanguageMetadata(datosPdf, idioma, versions);
};

const translateVoucherDay = async (day = {}, targetLang) => ({
  ...(day || {}),
  title: await translateVoucherText(day?.title || "", targetLang),
  content: await translateVoucherText(day?.content || "", targetLang),
});

const translateInfoExtraText = async (text = "", targetLang) => {
  const lines = ensureInfoExtraLockedSubtitles(text).split("\n");
  const translatedLines = await Promise.all(
    lines.map(async (line) => {
      const canonicalLine = canonicalizeInfoExtraSubtitle(line);
      if (isInfoExtraSubtitle(canonicalLine)) return canonicalLine;
      return translateVoucherText(line, targetLang);
    }),
  );

  return translatedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

const translateDatosPdfSnapshot = async (datosPdf = {}, targetLang) => {
  const clean = stripDatosPdfLanguageMetadata(datosPdf);
  const itinerary = clean.itinerary && typeof clean.itinerary === "object"
    ? clean.itinerary
    : {};
  const days = Array.isArray(itinerary.days) ? itinerary.days : [];

  const [
    packageName,
    paymentSystem,
    itineraryTitle,
    translatedDays,
    habitacionExtra,
    tipoIngresoExtra,
    trenTipo,
    trenRuta,
    paymentPackageName,
    textoPago,
    infoExtra,
    terminosCondiciones,
    observaciones,
  ] = await Promise.all([
    translateVoucherText(clean.general?.packageName || "", targetLang),
    translateVoucherText(clean.general?.paymentSystem || "", targetLang),
    translateVoucherText(itinerary.title || VOUCHER_LABELS.es.itinerary, targetLang),
    Promise.all(days.map((day) => translateVoucherDay(day, targetLang))),
    translateVoucherText(clean.hotel_train?.habitacionExtra || "", targetLang),
    translateVoucherText(clean.hotel_train?.tipoIngresoExtra || "", targetLang),
    translateVoucherText(clean.hotel_train?.trenTipo || "", targetLang),
    translateVoucherText(clean.hotel_train?.trenRuta || "", targetLang),
    translateVoucherText(clean.info_pago?.packageName || "", targetLang),
    translateVoucherText(clean.info_pago?.textoPago || DEFAULT_PAGO_TEXT, targetLang),
    translateInfoExtraText(clean.info_extra || DEFAULT_INFO_EXTRA, targetLang),
    translateVoucherText(clean.terminos_condiciones || DEFAULT_TERMINOS, targetLang),
    translateVoucherText(clean.observaciones || "", targetLang),
  ]);

  return {
    ...clean,
    general: {
      ...(clean.general || {}),
      packageName,
      paymentSystem,
    },
    itinerary: {
      ...itinerary,
      title: itineraryTitle,
      days: translatedDays,
    },
    hotel_train: {
      ...(clean.hotel_train || {}),
      habitacionExtra,
      tipoIngresoExtra,
      trenTipo,
      trenRuta,
    },
    info_pago: {
      ...(clean.info_pago || {}),
      packageName: paymentPackageName,
      textoPago,
    },
    info_extra: infoExtra,
    terminos_condiciones: terminosCondiciones,
    observaciones,
  };
};

const hasOwn = (source, key) =>
  Boolean(
    source &&
      typeof source === "object" &&
      Object.prototype.hasOwnProperty.call(source, key),
  );

const getPassengerPhone = (passenger = {}) =>
  String(
    passenger?.telefono ||
      passenger?.phone ||
      passenger?.celular ||
      passenger?.whatsapp ||
      passenger?.persona?.telefono ||
      passenger?.persona_data?.telefono ||
      passenger?.personaData?.telefono ||
      "",
  );

const hydrateDatosPdfPhoneFields = (datosPdf = {}, mainPassenger = {}) => {
  const general =
    datosPdf?.general && typeof datosPdf.general === "object"
      ? datosPdf.general
      : {};

  return {
    ...(datosPdf || {}),
    general: {
      ...general,
      passengerPhone: hasOwn(general, "passengerPhone")
        ? String(general.passengerPhone ?? "")
        : getPassengerPhone(mainPassenger),
      emergencyPhone: hasOwn(general, "emergencyPhone")
        ? String(general.emergencyPhone ?? "")
        : "",
    },
  };
};

const normalizeDatosPdfDay = (day = {}) => ({
  ...(day && typeof day === "object" ? day : {}),
  title: String(day?.title ?? ""),
  content: normalizeEditableNewlines(day?.content ?? ""),
});

const convertLegacyDatosPdf = (legacyDatosPdf) => {
  const legacyDayIndexes = new Set();
  Object.keys(legacyDatosPdf || {}).forEach((key) => {
    const match = key.match(/^(?:day_title|day_content|svc_name)_(\d+)/);
    if (match) legacyDayIndexes.add(Number(match[1]));
  });

  const legacyDays = Array.from(legacyDayIndexes)
    .sort((left, right) => left - right)
    .map((dayIndex) => {
      const serviceLines = Object.entries(legacyDatosPdf || {})
        .map(([key, value]) => {
          const match = key.match(new RegExp(`^svc_name_${dayIndex}_(\\d+)$`));
          return match ? { index: Number(match[1]), value } : null;
        })
        .filter(Boolean)
        .sort((left, right) => left.index - right.index)
        .map(({ value }) => String(value ?? ""));

      return normalizeDatosPdfDay({
        title: legacyDatosPdf?.[`day_title_${dayIndex}`] ?? "",
        content:
          legacyDatosPdf?.[`day_content_${dayIndex}`] ??
          serviceLines.join("\n"),
      });
    });

  const legacyItinerary =
    legacyDatosPdf?.itinerary && typeof legacyDatosPdf.itinerary === "object"
      ? legacyDatosPdf.itinerary
      : {};

  return {
    ...(legacyDatosPdf || {}),
    general:
      legacyDatosPdf?.general && typeof legacyDatosPdf.general === "object"
        ? legacyDatosPdf.general
        : {},
    itinerary: {
      ...legacyItinerary,
      title:
        legacyItinerary.title ??
        legacyDatosPdf?.itinerary_title ??
        "ITINERARIO",
      days: Array.isArray(legacyItinerary.days)
        ? legacyItinerary.days.map(normalizeDatosPdfDay)
        : legacyDays,
    },
    hotel_train:
      legacyDatosPdf?.hotel_train &&
      typeof legacyDatosPdf.hotel_train === "object"
        ? legacyDatosPdf.hotel_train
        : {},
    indicaciones_pdf: String(
      legacyDatosPdf?.indicaciones_pdf ??
        legacyDatosPdf?.indicacionesPdf ??
        legacyDatosPdf?.indicaciones ??
        "",
    ),
    observaciones: String(legacyDatosPdf?.observaciones ?? ""),
  };
};

const parseDatosPdf = (rawDatosPdf) => {
  if (rawDatosPdf && typeof rawDatosPdf === "object") {
    return rawDatosPdf;
  }

  if (typeof rawDatosPdf === "string" && rawDatosPdf.trim()) {
    try {
      const parsed = JSON.parse(rawDatosPdf);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
};

const hasUsableDatosPdfItinerary = (itinerary) =>
  Boolean(
    itinerary &&
    typeof itinerary === "object" &&
    Array.isArray(itinerary.days) &&
    itinerary.days.length > 0,
  );

const getFallbackItineraryFromVoucherData = (voucherData) =>
  buildDatosPdfFromItinerary(voucherData).itinerary;

const normalizeDatosPdfItinerary = (itinerary, voucherData) => {
  if (hasUsableDatosPdfItinerary(itinerary)) {
    return {
      ...(itinerary || {}),
      title: itinerary.title ?? "ITINERARIO",
      days: itinerary.days.map(normalizeDatosPdfDay),
    };
  }

  return getFallbackItineraryFromVoucherData(voucherData);
};

const normalizeDatosPdfInfoPago = (infoPago, voucherData) => {
  const normalized =
    infoPago && typeof infoPago === "object" && !Array.isArray(infoPago)
      ? { ...infoPago }
      : {};

  if (!Object.prototype.hasOwnProperty.call(normalized, "packageName")) {
    normalized.packageName = getVoucherPackageTitle(voucherData);
  }

  return normalized;
};

const normalizeDatosPdf = (rawDatosPdf, voucherData) => {
  const parsedDatosPdf = parseDatosPdf(rawDatosPdf);

  if (!Object.keys(parsedDatosPdf).length) {
    return buildDatosPdfFromItinerary(voucherData);
  }

  if (
    parsedDatosPdf?.itinerary &&
    typeof parsedDatosPdf.itinerary === "object"
  ) {
    return {
      ...parsedDatosPdf,
      itinerary: normalizeDatosPdfItinerary(
        parsedDatosPdf.itinerary,
        voucherData,
      ),
      general:
        parsedDatosPdf.general && typeof parsedDatosPdf.general === "object"
          ? parsedDatosPdf.general
          : {},
      hotel_train:
        parsedDatosPdf.hotel_train &&
        typeof parsedDatosPdf.hotel_train === "object"
          ? parsedDatosPdf.hotel_train
          : {},
      info_pago: normalizeDatosPdfInfoPago(
        parsedDatosPdf.info_pago,
        voucherData,
      ),
      indicaciones_pdf: String(
        parsedDatosPdf.indicaciones_pdf ??
          parsedDatosPdf.indicacionesPdf ??
          parsedDatosPdf.indicaciones ??
          "",
      ),
      observaciones: String(parsedDatosPdf.observaciones ?? ""),
    };
  }

  const legacyDatosPdf = convertLegacyDatosPdf(parsedDatosPdf);
  return {
    ...legacyDatosPdf,
    itinerary: normalizeDatosPdfItinerary(
      legacyDatosPdf.itinerary,
      voucherData,
    ),
    info_pago: normalizeDatosPdfInfoPago(
      legacyDatosPdf.info_pago,
      voucherData,
    ),
  };
};

const applyDatosPdfChange = (
  currentDatosPdf,
  { scope, index, field, value },
) => {
  const next = {
    ...(currentDatosPdf || {}),
  };

  if (scope === "itinerary") {
    next.itinerary = {
      ...(currentDatosPdf?.itinerary || {}),
      [field]: value,
    };
    return next;
  }

  if (scope === "day") {
    const currentDays = currentDatosPdf?.itinerary?.days || [];
    const nextDays = [...currentDays];
    nextDays[index] = {
      ...(nextDays[index] || { title: "", content: "" }),
      [field]: value,
    };

    next.itinerary = {
      ...(currentDatosPdf?.itinerary || {}),
      days: nextDays,
    };
  }

  if (scope === "info_extra") {
    next.info_extra = value;
  }

  if (scope === "info_pago") {
    next.info_pago = {
      ...(currentDatosPdf?.info_pago || {}),
      [field]: value,
    };
  }

  if (scope === "general") {
    next.general = {
      ...(currentDatosPdf?.general || {}),
      [field]: value,
    };
  }

  if (scope === "hotel_train") {
    next.hotel_train = {
      ...(currentDatosPdf?.hotel_train || {}),
      [field]: value,
    };
  }

  if (scope === "terminos_condiciones") {
    next.terminos_condiciones = value;
  }

  if (scope === "indicaciones_pdf") {
    next.indicaciones_pdf = value;
  }

  if (scope === "observaciones") {
    next.observaciones = value;
  }

  return next;
};

const areDatosPdfEqual = (left, right) =>
  JSON.stringify(left || {}) === JSON.stringify(right || {});

const uniqueNonEmptyValues = (values = []) =>
  Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
  );

const extractHotelRoomTypeFromText = (value = "") => {
  const text = normalizeMojibakeText(value);
  if (!text) return "";

  const lower = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const hasFamily = /\b(familiar|family|familial)\b/.test(lower);
  const hasQuad = /\b(cuadruple|quadruple|quad)\b/.test(lower);
  const hasTriple = /\btriple\b/.test(lower);
  const hasDouble = /\b(doble|double|twin)\b/.test(lower);
  const hasMatrimonial = /\b(matrimonial|matrimony)\b/.test(lower);
  const hasSimple = /\b(simple|single|individual)\b/.test(lower);

  if (hasFamily) return "Familiar";
  if (hasQuad) return "Cuádruple";
  if (hasTriple) return "Triple";
  if (hasDouble && hasMatrimonial) return "Doble / Matrimonial";
  if (hasDouble) return "Doble";
  if (hasMatrimonial) return "Matrimonial";
  if (hasSimple) return "Simple";
  return "";
};

const normalizeHotelDetalleEntries = (hotelDetalle) => {
  if (!hotelDetalle) return [];

  const rawEntries = Array.isArray(hotelDetalle)
    ? hotelDetalle
    : Array.isArray(hotelDetalle?.hotels)
      ? hotelDetalle.hotels
      : Array.isArray(hotelDetalle?.selectedHotels)
        ? hotelDetalle.selectedHotels
        : [hotelDetalle];

  return rawEntries
    .map((entry) => ({
      hotelName:
        entry?.hotelName ||
        entry?.nombre ||
        entry?.name ||
        entry?.hotel?.nombre ||
        "",
      category:
        entry?.category ||
        entry?.categoria ||
        entry?.hotelCategory ||
        entry?.meta?.categoria ||
        "",
      roomType:
        entry?.roomType ||
        entry?.habitacion ||
        entry?.roomLabel ||
        entry?.tipo_habitacion ||
        entry?.meta?.habitacion ||
        extractHotelRoomTypeFromText(
          [
            entry?.label,
            entry?.nombre,
            entry?.name,
            entry?.hotelName,
            entry?.description,
            entry?.descripcion,
          ]
            .filter(Boolean)
            .join(" "),
        ) ||
        "",
    }))
    .filter((entry) => entry.hotelName || entry.category || entry.roomType);
};

const safeToTime = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (!isNaN(d.getTime())) {
    return d.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return String(v);
};

const parseVoucherDisplayDate = (value, fallback = null) => {
  if (!value) return fallback;
  if (value instanceof Date) {
    const cloned = new Date(value.getTime());
    return Number.isNaN(cloned.getTime()) ? fallback : cloned;
  }

  const stringValue = String(value).trim();
  const dateOnlyMatch = stringValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  }

  return parseLocalDate(stringValue, fallback);
};

const safeToDate = (v) => {
  if (!v) return "";
  const d = parseVoucherDisplayDate(v, null);
  if (d && !isNaN(d.getTime())) {
    return d.toLocaleDateString("es-ES");
  }
  return String(v);
};

const formatVoucherLongDate = (date, idioma = "es") => {
  if (!date) return "";
  const d = date instanceof Date ? date : parseVoucherDisplayDate(date, null);
  if (!d || Number.isNaN(d.getTime())) return String(date || "");

  try {
    return new Intl.DateTimeFormat(getVoucherLocale(idioma), {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return formatSharedLongDate(d);
  }
};

const formatVoucherShortDate = (value, idioma = "es") => {
  if (!value) return "";
  const d = parseVoucherDisplayDate(value, null);
  if (!d || Number.isNaN(d.getTime())) return String(value || "");
  return d.toLocaleDateString(getVoucherLocale(idioma));
};

const stripAccents = (s = "") =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Soporta objetos "service" (parent/child y/o .vuelo) y también objetos planos (de vuelos_externos)
const extractFlightInfo = (item) => {
  const parent = item?.parentService || {};
  const child = item?.childService || {};
  const pVuelo = parent?.vuelo || {};
  const cVuelo = child?.vuelo || {};

  const airline =
    cVuelo.aerolinea ||
    child.aerolinea ||
    pVuelo.aerolinea ||
    parent.nombre ||
    item.airline ||
    "";

  const flightClass =
    child.tipovuelo ||
    child.tipo_vuelo?.tipovuelo ||
    cVuelo.tipovuelo ||
    item.flightClass ||
    "";

  const from =
    child.lugar_ida ||
    cVuelo.lugar_ida ||
    child.tipo_vuelo?.lugar_ida ||
    cVuelo.origen ||
    child.origen ||
    pVuelo.lugar_ida ||
    parent.lugar_ida ||
    item.from ||
    "";

  const to =
    child.lugar_vuelta ||
    cVuelo.lugar_vuelta ||
    child.tipo_vuelo?.lugar_vuelta ||
    cVuelo.destino ||
    child.destino ||
    pVuelo.lugar_vuelta ||
    parent.lugar_vuelta ||
    item.to ||
    "";

  const route =
    from && to
      ? `${from} - ${to}`
      : cVuelo.ruta ||
        child.ruta ||
        pVuelo.ruta ||
        parent.ruta ||
        item.route ||
        "";

  const flightNumber =
    cVuelo.nro_vuelo ||
    child.nro_vuelo ||
    pVuelo.nro_vuelo ||
    parent.nro_vuelo ||
    pVuelo.nro_ticket ||
    parent.nro_ticket ||
    item.flightNumber ||
    "";

  const date =
    cVuelo.fecha ||
    child.fecha ||
    pVuelo.fecha ||
    parent.fecha ||
    item.date ||
    item._dayDate ||
    "";

  const depTime =
    child.hora_salida ||
    cVuelo.hora_salida ||
    child.tipo_vuelo?.hora_salida ||
    pVuelo.hora_salida ||
    item.depTime ||
    "";

  const arrTime =
    child.hora_llegada ||
    cVuelo.hora_llegada ||
    child.tipo_vuelo?.hora_llegada ||
    pVuelo.hora_llegada ||
    item.arrTime ||
    "";

  const baggage =
    child.equipaje ||
    cVuelo.equipaje ||
    child.tipo_vuelo?.equipaje ||
    item.baggage ||
    "";

  return {
    airline,
    flightClass,
    from,
    to,
    route,
    flightNumber,
    date,
    depTime,
    arrTime,
    baggage,
  };
};

// Procedencia robusta (durante migración: parent -> child -> plano)
const getProcedenciaAny = (v) => {
  const raw =
    v?.childService?.procedencia ??
    v?.parentService?.procedencia ??
    v?.procedencia ??
    "";
  return stripAccents(String(raw).toLowerCase());
};

const isInternational = (v) => {
  const p = getProcedenciaAny(v);
  if (!p) return false;
  // internacional / international / externo(s)
  if (p.startsWith("internacional")) return true;
  if (p.startsWith("international")) return true;
  if (p.includes("extern")) return true;
  return false;
};

const isNational = (v) => {
  // If it's international, it's NOT national
  if (isInternational(v)) return false;
  const p = getProcedenciaAny(v);
  // fallback: si no hay procedencia, lo tratamos como nacional para no "perder" el vuelo
  if (!p) return true;
  // nacional / doméstico / interno(a)
  if (p.includes("nacional")) return true;
  if (p.includes("domestic")) return true;
  if (p.includes("domestico")) return true; // sin tilde
  if (p.includes("doméstico")) return true; // con tilde (ya stripAccents, pero por si acaso)
  if (p.startsWith("interno") || p.startsWith("interna")) return true;
  return false;
};

const getFlightSourceKey = (flight = {}) => {
  const directKey =
    flight.sourceFlightKey ||
    flight.source_flight_key ||
    flight.sourceItinerarioServicioId ||
    flight.source_itinerario_servicio_id;
  if (directKey) return String(directKey);

  const stableId = getServiceStableId(flight);
  if (stableId !== null && stableId !== undefined) {
    return `itinerary:${stableId}`;
  }

  const info = extractFlightInfo(flight);
  return [
    getProcedenciaAny(flight) || "flight",
    info.route,
    info.flightNumber,
    info.date,
    info.depTime,
  ]
    .filter(Boolean)
    .join("|");
};

const chunkArrayBySizes = (items = [], sizes = []) => {
  if (!Array.isArray(items)) return [];

  const chunks = [];
  let cursor = 0;
  const normalizedSizes = Array.isArray(sizes) ? sizes : [];

  normalizedSizes.forEach((rawSize) => {
    const size = Math.max(0, Math.floor(Number(rawSize) || 0));
    chunks.push(items.slice(cursor, cursor + size));
    cursor += size;
  });

  if (cursor < items.length) chunks.push(items.slice(cursor));
  if (!chunks.length) chunks.push([]);

  return chunks;
};

const getEstimatedTextUnits = (text = "", charsPerLine = 88) =>
  normalizeMojibakeText(String(text || ""))
    .split("\n")
    .reduce((total, line) => {
      const cleanLine = String(line || "");
      return (
        total +
        (cleanLine.trim().length === 0
          ? 1
          : Math.max(1, Math.ceil(cleanLine.length / charsPerLine)))
      );
    }, 0);

const paginateTextContent = (
  text = "",
  { maxUnits = 48, charsPerLine = 88, orphanMinUnits = 8 } = {},
) => {
  const normalizedText = normalizeMojibakeText(String(text || ""));
  const lines = normalizedText.split("\n");
  const pages = [];
  let pageLines = [];
  let unitsUsed = 0;

  lines.forEach((line) => {
    const cleanLine = String(line || "");
    const estimatedUnits =
      cleanLine.trim().length === 0
        ? 1
        : Math.max(1, Math.ceil(cleanLine.length / charsPerLine));

    if (pageLines.length > 0 && unitsUsed + estimatedUnits > maxUnits) {
      pages.push(pageLines.join("\n").trimEnd());
      pageLines = [];
      unitsUsed = 0;
    }

    pageLines.push(cleanLine);
    unitsUsed += estimatedUnits;
  });

  if (pageLines.length > 0) {
    pages.push(pageLines.join("\n").trimEnd());
  }

  if (pages.length > 1) {
    const lastPage = pages[pages.length - 1];
    const previousPage = pages[pages.length - 2];
    const lastUnits = getEstimatedTextUnits(lastPage, charsPerLine);
    const previousUnits = getEstimatedTextUnits(previousPage, charsPerLine);

    if (
      lastUnits > 0 &&
      lastUnits <= orphanMinUnits &&
      previousUnits + lastUnits <= maxUnits + Math.max(4, orphanMinUnits)
    ) {
      pages.splice(
        pages.length - 2,
        2,
        `${previousPage}\n${lastPage}`.trimEnd(),
      );
    }
  }

  return pages.length > 0 ? pages : [normalizedText];
};

const paginateEditableTextContent = (
  text = "",
  { maxUnits = 48, charsPerLine = 88, orphanMinUnits = 8 } = {},
) => {
  const normalizedText = normalizeEditableNewlines(text);
  if (!normalizedText) {
    return [{ text: "", start: 0, end: 0 }];
  }

  const lines = [];
  const linePattern = /([^\n]*)(\n|$)/g;
  let match = linePattern.exec(normalizedText);

  while (match && match[0] !== "") {
    lines.push({
      start: match.index,
      end: match.index + match[1].length,
      text: match[1],
    });
    match = linePattern.exec(normalizedText);
  }

  if (normalizedText.endsWith("\n")) {
    lines.push({
      start: normalizedText.length,
      end: normalizedText.length,
      text: "",
    });
  }

  const pages = [];
  let firstLineIndex = 0;
  let unitsUsed = 0;

  const pushPage = (lastLineIndex) => {
    const start = lines[firstLineIndex]?.start ?? 0;
    const end = lines[lastLineIndex]?.end ?? start;
    pages.push({
      text: normalizedText.slice(start, end),
      start,
      end,
    });
  };

  lines.forEach((line, lineIndex) => {
    const estimatedUnits =
      line.text.trim().length === 0
        ? 1
        : Math.max(1, Math.ceil(line.text.length / charsPerLine));

    if (lineIndex > firstLineIndex && unitsUsed + estimatedUnits > maxUnits) {
      pushPage(lineIndex - 1);
      firstLineIndex = lineIndex;
      unitsUsed = 0;
    }

    unitsUsed += estimatedUnits;
  });

  pushPage(lines.length - 1);

  if (pages.length > 1) {
    const lastPage = pages[pages.length - 1];
    const previousPage = pages[pages.length - 2];
    const lastUnits = getEstimatedTextUnits(lastPage.text, charsPerLine);
    const previousUnits = getEstimatedTextUnits(
      previousPage.text,
      charsPerLine,
    );

    if (
      lastUnits > 0 &&
      lastUnits <= orphanMinUnits &&
      previousUnits + lastUnits <= maxUnits + Math.max(4, orphanMinUnits)
    ) {
      pages.splice(pages.length - 2, 2, {
        text: normalizedText.slice(previousPage.start, lastPage.end),
        start: previousPage.start,
        end: lastPage.end,
      });
    }
  }

  return pages;
};

const mergeChunkedText = (chunks = [], targetIndex = 0, nextValue = "") => {
  const nextChunks = [...chunks];
  nextChunks[targetIndex] = normalizeEditableNewlines(nextValue);

  return nextChunks.reduce((merged, chunk, index) => {
    const normalizedChunk = normalizeEditableNewlines(chunk);
    if (index === 0) return normalizedChunk;

    const separator =
      merged.endsWith("\n") || normalizedChunk.startsWith("\n") ? "" : "\n";
    return `${merged}${separator}${normalizedChunk}`;
  }, "");
};

const replaceEditableTextRange = (source, start, end, nextValue) => {
  const normalizedSource = normalizeEditableNewlines(source);
  const normalizedValue = normalizeEditableNewlines(nextValue);
  return `${normalizedSource.slice(0, start)}${normalizedValue}${normalizedSource.slice(end)}`;
};

const estimateVoucherTextUnits = (text = "", charsPerLine = 82) =>
  String(text || "")
    .split(/\r?\n/)
    .reduce((total, line) => {
      const cleanLine = String(line || "");
      return (
        total +
        (cleanLine.trim().length === 0
          ? 1
          : Math.max(1, Math.ceil(cleanLine.length / charsPerLine)))
      );
    }, 0);

// Presupuesto visual por hoja A4. Todas las secciones posteriores a vuelos
// (itinerario, incluye/no incluye, pago y términos) se empaquetan en un mismo
// flujo por unidades visuales. Así se aprovecha el espacio restante de cada
// hoja, pero el contenido que ya no entra pasa completo a la siguiente página.
const ITINERARY_HEADER_UNITS = 4.8;
const ITINERARY_PAGE_UNITS = 82;
const ITINERARY_FIRST_PAGE_UNITS = 78;
const ITINERARY_CONTENT_CHUNK_UNITS = 14;
const INFO_EXTRA_PAGE_UNITS = 54;
const INFO_EXTRA_INLINE_MAX_UNITS = 0;
const INFO_EXTRA_INLINE_MIN_UNITS = 999;
const INFO_EXTRA_WITH_PAYMENT_UNITS = 0;
const INFO_EXTRA_WITH_PAYMENT_AND_TERMS_UNITS = 0;
const INFO_PAGO_PAGE_UNITS = 62;
const INFO_PAGO_WITH_TERMS_GAP_UNITS = 4;
const TERMINOS_PAGE_UNITS = 58;
const TERMINOS_INLINE_MAX_UNITS = 0;
const TERMINOS_INLINE_MIN_UNITS = 999;
// Alto útil real del cuerpo A4 entre cabecera y footer verde. El flujo final
// usa medición DOM en píxeles para evitar saltos bruscos y espacios vacíos: si
// un bloque cabe antes del footer permanece en la página; si no cabe, pasa a la
// siguiente hoja.
const PDF_FLOW_PAGE_UNITS = 118;
const PDF_FLOW_PAGE_MIN_REMAINING_UNITS = 1.6;
const PDF_FLOW_ITINERARY_HEADER_UNITS = 4.6;
const PDF_FLOW_CONTENT_HEIGHT_PX = 936;
const PDF_FLOW_PAGE_GAP_PX = 5;
const INFO_EXTRA_FLOW_CHUNK_UNITS = 86;
const TERMINOS_FLOW_CHUNK_UNITS = 82;

const getItineraryBlockUnits = (block = {}) => {
  const titleUnits = estimateVoucherTextUnits(block?.title, 58);
  const content = String(block?.content ?? "");
  const contentUnits = estimateVoucherTextUnits(content, 68);
  const nonEmptyLines = content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0).length;

  // Estimación compacta del alto real del día dentro del diseño A4. Se mantiene
  // una reserva mínima para no tocar el pie, pero ya no se sobredimensiona cada
  // línea: así el flujo aprovecha la hoja antes de saltar a la siguiente.
  return Math.max(
    5.8,
    5.1 +
      titleUnits * 1.32 +
      contentUnits * 1.2 +
      nonEmptyLines * 0.32 +
      (block?.totalChunks > 1 ? 0.9 : 0),
  );
};

const takeItineraryBlocksForUnits = (blocks = [], maxUnits = 0) => {
  if (!Array.isArray(blocks) || maxUnits <= 0) {
    return { selected: [], remaining: blocks || [] };
  }

  const selected = [];
  let units = 0;

  for (const block of blocks) {
    const blockUnits = getItineraryBlockUnits(block);
    if (selected.length > 0 && units + blockUnits > maxUnits) break;
    if (selected.length === 0 && blockUnits > maxUnits) break;

    selected.push(block);
    units += blockUnits;
  }

  return {
    selected,
    remaining: blocks.slice(selected.length),
  };
};

const takeTextPrefixForUnits = (
  text = "",
  { maxUnits = 0, charsPerLine = 88, minUnits = 8 } = {},
) => {
  const normalizedText = normalizeMojibakeText(String(text || ""));

  if (!normalizedText.trim() || maxUnits < minUnits) {
    return { selected: "", remaining: normalizedText, units: 0 };
  }

  const lines = normalizedText.split("\n");
  const selectedLines = [];
  let units = 0;

  for (const line of lines) {
    const estimatedUnits = getEstimatedTextUnits(line, charsPerLine) || 1;

    if (selectedLines.length > 0 && units + estimatedUnits > maxUnits) break;
    if (selectedLines.length === 0 && estimatedUnits > maxUnits) break;

    selectedLines.push(line);
    units += estimatedUnits;
  }

  const selected = selectedLines.join("\n").trimEnd();

  if (!selected.trim() || units < minUnits) {
    return { selected: "", remaining: normalizedText, units: 0 };
  }

  return {
    selected,
    remaining: lines.slice(selectedLines.length).join("\n").trimStart(),
    units,
  };
};

const INFO_EXTRA_SUBTITLE_PATTERN =
  /^\s*(?:El\s+tour\s+)?(?:Incluye|NO\s+Incluye|No\s+Incluye)\s*:?/i;

const getInfoExtraLineUnits = (line = "", charsPerLine = 94) => {
  const cleanLine = String(line || "");
  const trimmed = cleanLine.trim();

  if (!trimmed) return 0.75;

  const baseUnits = Math.max(1, Math.ceil(cleanLine.length / charsPerLine));

  if (INFO_EXTRA_SUBTITLE_PATTERN.test(trimmed)) {
    return baseUnits + 2.4;
  }

  if (/^[•\-□▪*]/.test(trimmed)) {
    return baseUnits * 1.18 + 0.55;
  }

  return baseUnits * 1.12;
};

const getInfoExtraTextUnits = (text = "", charsPerLine = 94) =>
  normalizeMojibakeText(String(text || ""))
    .split("\n")
    .reduce(
      (total, line) => total + getInfoExtraLineUnits(line, charsPerLine),
      0,
    );

const takeInfoExtraPrefixForUnits = (
  text = "",
  { maxUnits = 0, charsPerLine = 94, minUnits = 3 } = {},
) => {
  const normalizedText = normalizeMojibakeText(String(text || ""));

  if (!normalizedText.trim() || maxUnits < minUnits) {
    return { selected: "", remaining: normalizedText, units: 0 };
  }

  const lines = normalizedText.split("\n");
  const selectedLines = [];
  let units = 0;

  for (const line of lines) {
    const estimatedUnits = getInfoExtraLineUnits(line, charsPerLine) || 1;

    if (selectedLines.length > 0 && units + estimatedUnits > maxUnits) break;
    if (selectedLines.length === 0 && estimatedUnits > maxUnits) break;

    selectedLines.push(line);
    units += estimatedUnits;
  }

  const selected = selectedLines.join("\n").trimEnd();

  if (!selected.trim() || units < minUnits) {
    return { selected: "", remaining: normalizedText, units: 0 };
  }

  return {
    selected,
    remaining: lines.slice(selectedLines.length).join("\n").trimStart(),
    units,
  };
};

const paginateInfoExtraContent = (
  text = "",
  { maxUnits = INFO_EXTRA_PAGE_UNITS, charsPerLine = 94 } = {},
) => {
  const normalizedText = normalizeMojibakeText(String(text || ""));
  const pages = [];
  let remaining = normalizedText;

  while (remaining.trim()) {
    const chunk = takeInfoExtraPrefixForUnits(remaining, {
      maxUnits,
      charsPerLine,
      minUnits: 1,
    });

    if (!chunk.selected.trim()) {
      break;
    }

    pages.push(chunk.selected);
    remaining = chunk.remaining;
  }

  return pages.length > 0 ? pages : [normalizedText];
};

const TERMINOS_BLOCK_START_PATTERN =
  /^(?:\d+\.\s+|T[ÉE]RMINOS|TERMINOS|RESUMEN DE|Nota:)/i;
const TERMINOS_SUMMARY_BLOCK_PATTERN =
  /^\s*RESUMEN\s+DE\s+CARGOS\s+Y\s+PENALIDADES/i;

const isTerminosBlockStart = (line = "") =>
  TERMINOS_BLOCK_START_PATTERN.test(String(line || "").trim());

const hasTerminosSummaryBlock = (text = "") =>
  String(text || "")
    .split("\n")
    .some((line) => TERMINOS_SUMMARY_BLOCK_PATTERN.test(line));

const isTerminosSummaryBlock = (block = "") =>
  String(block || "")
    .split("\n")
    .some((line) => TERMINOS_SUMMARY_BLOCK_PATTERN.test(line));

const startsWithTerminosSummaryBlock = (text = "") =>
  TERMINOS_SUMMARY_BLOCK_PATTERN.test(
    String(text || "")
      .split("\n")
      .find((line) => String(line || "").trim()) || "",
  );

const normalizeTerminosBlocks = (blocks = []) => {
  const normalizedBlocks = blocks
    .map((block) => String(block || "").trim())
    .filter(Boolean);

  if (
    normalizedBlocks.length > 1 &&
    /^\s*(?:T[ÉE]RMINOS|TERMINOS)/i.test(normalizedBlocks[0])
  ) {
    normalizedBlocks.splice(
      0,
      2,
      `${normalizedBlocks[0]}\n${normalizedBlocks[1]}`.trim(),
    );
  }

  for (let index = 0; index < normalizedBlocks.length - 1; index += 1) {
    if (/^\s*RESUMEN DE/i.test(normalizedBlocks[index])) {
      normalizedBlocks.splice(
        index,
        2,
        `${normalizedBlocks[index]}\n${normalizedBlocks[index + 1]}`.trim(),
      );
      index -= 1;
    }
  }

  return normalizedBlocks;
};

const splitTerminosIntoBlocks = (text = "") => {
  const normalizedText = normalizeMojibakeText(String(text || ""));
  const rawBlocks = [];
  let currentLines = [];

  const pushCurrentBlock = () => {
    const block = currentLines.join("\n").trim();
    if (block) rawBlocks.push(block);
    currentLines = [];
  };

  normalizedText.split("\n").forEach((line) => {
    if (
      isTerminosBlockStart(line) &&
      currentLines.some((item) => item.trim())
    ) {
      pushCurrentBlock();
    }

    currentLines.push(line);
  });

  pushCurrentBlock();
  return normalizeTerminosBlocks(rawBlocks);
};

const getTerminosLineUnits = (line = "", charsPerLine = 102) => {
  const cleanLine = String(line || "");
  const trimmed = cleanLine.trim();

  if (!trimmed) return 0.75;

  const baseUnits = Math.max(1, Math.ceil(cleanLine.length / charsPerLine));

  if (/^(?:\d+\.\s+|T[ÉE]RMINOS|TERMINOS|RESUMEN DE)/i.test(trimmed)) {
    return baseUnits + 1.2;
  }

  if (/^Nota:/i.test(trimmed)) {
    return baseUnits + 1;
  }

  return baseUnits * 1.1;
};

const getTerminosBlockUnits = (block = "", charsPerLine = 102) => {
  const normalizedBlock = String(block || "");
  const textUnits = normalizedBlock
    .split("\n")
    .reduce(
      (total, line) => total + getTerminosLineUnits(line, charsPerLine),
      0,
    );

  // El resumen final se reserva un poco más por sus negritas, pero no se fuerza
  // a una página casi vacía si aún existe espacio útil antes del footer.
  return (
    textUnits + 0.45 + (hasTerminosSummaryBlock(normalizedBlock) ? 1.8 : 0)
  );
};

const takeTerminosPrefixForUnits = (
  text = "",
  { maxUnits = 0, charsPerLine = 102, minUnits = 4 } = {},
) => {
  const blocks = splitTerminosIntoBlocks(text);

  if (!blocks.length || maxUnits < minUnits) {
    return { selected: "", remaining: normalizeMojibakeText(text), units: 0 };
  }

  const selectedBlocks = [];
  let units = 0;

  for (const block of blocks) {
    const blockUnits = getTerminosBlockUnits(block, charsPerLine);

    if (selectedBlocks.length > 0 && units + blockUnits > maxUnits) break;
    if (selectedBlocks.length === 0 && blockUnits > maxUnits) break;

    selectedBlocks.push(block);
    units += blockUnits;
  }

  const selected = selectedBlocks.join("\n\n").trim();

  if (!selected || units < minUnits) {
    return { selected: "", remaining: normalizeMojibakeText(text), units: 0 };
  }

  return {
    selected,
    remaining: blocks.slice(selectedBlocks.length).join("\n\n").trimStart(),
    units,
  };
};

const paginateTerminosContent = (
  text = "",
  { maxUnits = TERMINOS_PAGE_UNITS, charsPerLine = 102 } = {},
) => {
  const blocks = splitTerminosIntoBlocks(text);
  const pages = [];
  let pageBlocks = [];
  let unitsUsed = 0;

  const pushPage = () => {
    if (pageBlocks.length > 0) {
      pages.push(pageBlocks.join("\n\n").trimEnd());
    }
    pageBlocks = [];
    unitsUsed = 0;
  };

  blocks.forEach((block) => {
    const blockUnits = getTerminosBlockUnits(block, charsPerLine);

    if (pageBlocks.length > 0 && unitsUsed + blockUnits > maxUnits) {
      pushPage();
    }

    if (blockUnits > maxUnits && pageBlocks.length === 0) {
      const forcedPages = paginateTextContent(block, {
        maxUnits: Math.max(8, maxUnits - 2),
        charsPerLine,
        orphanMinUnits: 4,
      });
      forcedPages.forEach((forcedPage, index) => {
        if (index === forcedPages.length - 1) {
          pageBlocks.push(forcedPage);
          unitsUsed = getTerminosBlockUnits(forcedPage, charsPerLine);
        } else {
          pages.push(forcedPage.trimEnd());
        }
      });
      return;
    }

    pageBlocks.push(block);
    unitsUsed += blockUnits;
  });

  pushPage();

  return pages.length > 0 ? pages : [normalizeMojibakeText(text)];
};

const groupItineraryBlocksByPage = (blocks = [], options = {}) => {
  const config =
    typeof options === "number" ? { pageMaxUnits: options } : options;
  const firstPageMaxUnits = config.firstPageMaxUnits ?? 34;
  const pageMaxUnits = config.pageMaxUnits ?? 38;
  const pages = [];

  blocks.forEach((block) => {
    const blockUnits = getItineraryBlockUnits(block);
    const currentPage = pages[pages.length - 1];

    if (
      !currentPage ||
      (currentPage.units > 0 &&
        currentPage.units + blockUnits > currentPage.maxUnits)
    ) {
      pages.push({
        units: blockUnits,
        maxUnits: pages.length === 0 ? firstPageMaxUnits : pageMaxUnits,
        blocks: [block],
      });
      return;
    }

    currentPage.units += blockUnits;
    currentPage.blocks.push(block);
  });

  return pages;
};

const getInfoExtraSectionUnits = (text = "") =>
  3.8 + getInfoExtraTextUnits(text, 88) * 1.18;

const getTerminosSectionUnits = (text = "") => {
  const normalizedText = normalizeMojibakeText(String(text || ""));

  return (
    3.6 +
    getTerminosBlockUnits(normalizedText, 92) * 1.08 +
    (hasTerminosSummaryBlock(normalizedText) ? 1.4 : 0)
  );
};

const getInfoPagoSectionUnits = ({
  title = "",
  textoPago = "",
  observaciones = "",
  childrenCount = 0,
  hasSubtotal = false,
} = {}) => {
  const titleUnits = estimateVoucherTextUnits(title || "Paquete turístico", 54);
  const paymentTextUnits = getEstimatedTextUnits(textoPago || "", 70);
  const hasObservaciones = Boolean(observaciones?.trim());
  const observacionesUnits = hasObservaciones
    ? getEstimatedTextUnits(observaciones, 74)
    : 0;

  return (
    18.5 +
    titleUnits * 0.9 +
    paymentTextUnits * 1.05 +
    (hasObservaciones ? Math.max(3.2, observacionesUnits * 0.95) : 0) +
    (childrenCount > 0 ? 1.1 : 0) +
    (hasSubtotal ? 1 : 0)
  );
};

const getPdfFlowItemSafeUnits = (item = {}) => {
  const baseUnits = Math.max(1, Number(item.units) || 1);

  if (item.type === "itinerary-day") {
    return (
      baseUnits +
      1.15 +
      (item.showHeaderReserve ? PDF_FLOW_ITINERARY_HEADER_UNITS : 0)
    );
  }

  if (item.type === "flight-row") {
    return baseUnits + 0.8;
  }

  if (item.type === "info-extra") {
    return baseUnits + 1.2;
  }

  if (item.type === "terminos") {
    return baseUnits + (hasTerminosSummaryBlock(item.pageText) ? 2.3 : 1.2);
  }

  if (item.type === "payment") {
    return baseUnits + 1.3;
  }

  return baseUnits;
};

const splitPdfFlowTextItem = (item = {}, availableUnits = 0) => {
  if (!item?.pageText || availableUnits < 7) return null;

  if (item.type === "info-extra") {
    const maxTextUnits = Math.max(2, (availableUnits - 5.2) / 1.18);
    const chunk = takeInfoExtraPrefixForUnits(item.pageText, {
      maxUnits: maxTextUnits,
      charsPerLine: 88,
      minUnits: 3,
    });

    if (!chunk.selected.trim() || !chunk.remaining.trim()) return null;

    const current = {
      ...item,
      pageText: chunk.selected,
      units: getInfoExtraSectionUnits(chunk.selected),
    };

    if (getPdfFlowItemSafeUnits(current) > availableUnits) return null;

    return {
      current,
      remaining: {
        ...item,
        pageText: chunk.remaining,
        units: getInfoExtraSectionUnits(chunk.remaining),
      },
    };
  }

  if (item.type === "terminos") {
    const summaryGuardUnits = hasTerminosSummaryBlock(item.pageText)
      ? 6.8
      : 4.8;
    const maxTextUnits = Math.max(
      3,
      (availableUnits - summaryGuardUnits) / 1.08,
    );
    const chunk = takeTerminosPrefixForUnits(item.pageText, {
      maxUnits: maxTextUnits,
      charsPerLine: 92,
      minUnits: hasTerminosSummaryBlock(item.pageText) ? 6 : 4,
    });

    if (!chunk.selected.trim() || !chunk.remaining.trim()) return null;

    const current = {
      ...item,
      pageText: chunk.selected,
      units: getTerminosSectionUnits(chunk.selected),
    };

    if (getPdfFlowItemSafeUnits(current) > availableUnits) return null;

    return {
      current,
      remaining: {
        ...item,
        pageText: chunk.remaining,
        units: getTerminosSectionUnits(chunk.remaining),
      },
    };
  }

  return null;
};

const packPdfFlowItems = (
  items = [],
  { maxUnits = PDF_FLOW_PAGE_UNITS } = {},
) => {
  const pages = [];
  let currentItems = [];
  let currentUnits = 0;
  const pendingItems = [...items];
  const pageLimit = maxUnits - PDF_FLOW_PAGE_MIN_REMAINING_UNITS;

  const pushCurrentPage = () => {
    if (!currentItems.length) return;
    pages.push({ items: currentItems, units: currentUnits, maxUnits });
    currentItems = [];
    currentUnits = 0;
  };

  while (pendingItems.length > 0) {
    const item = pendingItems.shift();
    if (!item) continue;

    const itemUnits = getPdfFlowItemSafeUnits(item);
    const availableUnits = Math.max(0, pageLimit - currentUnits);

    if (currentItems.length > 0 && itemUnits > availableUnits) {
      const splitItem = splitPdfFlowTextItem(item, availableUnits);

      if (splitItem?.current && splitItem?.remaining) {
        const currentSplitUnits = getPdfFlowItemSafeUnits(splitItem.current);
        currentItems.push({ ...splitItem.current, units: currentSplitUnits });
        currentUnits += currentSplitUnits;
        pushCurrentPage();
        pendingItems.unshift(splitItem.remaining);
        continue;
      }

      pushCurrentPage();
    }

    const refreshedItemUnits = getPdfFlowItemSafeUnits(item);

    if (refreshedItemUnits > pageLimit && item.type !== "itinerary-day") {
      const splitItem = splitPdfFlowTextItem(item, pageLimit);

      if (splitItem?.current && splitItem?.remaining) {
        const currentSplitUnits = getPdfFlowItemSafeUnits(splitItem.current);
        currentItems.push({ ...splitItem.current, units: currentSplitUnits });
        currentUnits += currentSplitUnits;
        pushCurrentPage();
        pendingItems.unshift(splitItem.remaining);
        continue;
      }
    }

    currentItems.push({ ...item, units: refreshedItemUnits });
    currentUnits += refreshedItemUnits;
  }

  pushCurrentPage();
  return pages;
};

const getPdfFlowItemSignature = (item = {}) => {
  if (item.type === "itinerary-day") {
    const block = item.block || {};
    return [
      item.type,
      item.showHeaderReserve ? "header" : "body",
      block.idx,
      block.chunkIndex,
      block.title,
      block.content,
      block.dayDate,
    ]
      .map((part) => String(part ?? ""))
      .join("|");
  }

  if (item.type === "flight-row") {
    return [item.type, item.signature, item.rowIndex, item.units]
      .map((part) => String(part ?? ""))
      .join("|");
  }

  if (item.type === "info-extra" || item.type === "terminos") {
    return [item.type, item.pageIndex, item.blockIndex, item.pageText]
      .map((part) => String(part ?? ""))
      .join("|");
  }

  return JSON.stringify({
    type: item.type,
    units: item.units,
  });
};

const buildMeasuredPdfFlowPages = (items = [], heights = []) => {
  const pages = [];
  let currentItems = [];
  let currentHeight = 0;

  const pushPage = () => {
    if (!currentItems.length) return;
    pages.push({ items: currentItems });
    currentItems = [];
    currentHeight = 0;
  };

  items.forEach((item, index) => {
    const measuredHeight = Number(heights[index]) || 0;
    const itemHeight = Math.max(1, measuredHeight);
    const gapHeight = currentItems.length > 0 ? PDF_FLOW_PAGE_GAP_PX : 0;

    if (
      currentItems.length > 0 &&
      currentHeight + gapHeight + itemHeight > PDF_FLOW_CONTENT_HEIGHT_PX
    ) {
      pushPage();
    }

    const appliedGap = currentItems.length > 0 ? PDF_FLOW_PAGE_GAP_PX : 0;
    currentItems.push(item);
    currentHeight += appliedGap + itemHeight;
  });

  pushPage();
  return pages;
};

const getTextOffsetInNode = (root, targetNode, targetOffset) => {
  if (!root || !targetNode || !root.contains(targetNode)) return 0;

  try {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.setEnd(targetNode, targetOffset);
    return range.toString().length;
  } catch {
    return String(root.textContent ?? "").length;
  }
};

const findNodeAtTextOffset = (root, targetOffset) => {
  if (!root) return { node: root, offset: 0 };

  const normalizedTarget = Math.max(
    0,
    Math.min(Number(targetOffset) || 0, String(root.textContent ?? "").length),
  );
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const length = node.textContent?.length || 0;
    if (offset + length >= normalizedTarget) {
      return { node, offset: Math.max(0, normalizedTarget - offset) };
    }
    offset += length;
  }

  return { node: root, offset: Math.max(0, root.childNodes.length) };
};

const captureEditableCaret = (element) => {
  const selection = window.getSelection?.();
  if (!element || !selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (
    !element.contains(range.startContainer) ||
    !element.contains(range.endContainer)
  ) {
    return null;
  }

  return {
    start: getTextOffsetInNode(
      element,
      range.startContainer,
      range.startOffset,
    ),
    end: getTextOffsetInNode(element, range.endContainer, range.endOffset),
  };
};

const restoreEditableCaret = (element, caret) => {
  if (
    !element ||
    !caret ||
    !element.isConnected ||
    document.activeElement !== element
  ) {
    return;
  }

  const selection = window.getSelection?.();
  if (!selection) return;

  const start = findNodeAtTextOffset(element, caret.start);
  const end = findNodeAtTextOffset(element, caret.end);
  const range = document.createRange();

  try {
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // Ignore invalid transient selection while React is reconciling the editable.
  }
};

const pendingEditableCaretFrames = new WeakMap();

const insertPlainTextAtSelection = (text) => {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  range.deleteContents();

  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStart(textNode, text.length);
  range.setEnd(textNode, text.length);

  selection.removeAllRanges();
  selection.addRange(range);
  return true;
};

const dispatchEditableInput = (element, inputType, data = null) => {
  const inputEvent =
    typeof InputEvent === "function"
      ? new InputEvent("input", {
          bubbles: true,
          inputType,
          data,
        })
      : new Event("input", { bubbles: true });

  element.dispatchEvent(inputEvent);
};

const handleEditablePlainTextPaste = (event) => {
  event.preventDefault();
  const text = normalizeEditableNewlines(
    event.clipboardData?.getData("text/plain") ?? "",
  );

  if (insertPlainTextAtSelection(text)) {
    dispatchEditableInput(event.currentTarget, "insertFromPaste", text);
  }
};

const handleEditableSingleLinePaste = (event) => {
  event.preventDefault();
  const text = normalizeEditableNewlines(
    event.clipboardData?.getData("text/plain") ?? "",
  )
    .replace(/\s*\n\s*/g, " ")
    .replace(/[\t ]{2,}/g, " ");

  if (insertPlainTextAtSelection(text)) {
    dispatchEditableInput(event.currentTarget, "insertFromPaste", text);
  }
};

/* ======================= VISTA TIPO VOUCHER ======================= */

const VoucherView = ({
  voucher,
  voucherData,
  passengers,
  paymentSummary,
  externalFlights = [],
  onAddInternationalFlight,
  onAddNationalFlight,
  onUpdateExternalFlight,
  onRemoveExternalFlight,
  onUpsertFlightOverride,
  datosPdf = {},
  onDatosPdfChange,
  onDatosPdfTouch,
  idioma = "es",
}) => {
  const emptyFlightForm = {
    airline: "",
    from: "",
    to: "",
    flightNumber: "",
    date: "",
    depTime: "",
    arrTime: "",
    dayIndex: 0,
  };

  const [flightSubmodal, setFlightSubmodal] = useState({
    open: false,
    type: null,
  });
  const [flightForm, setFlightForm] = useState({ ...emptyFlightForm });
  const [showObservacionesEditor, setShowObservacionesEditor] =
    useState(false);
  const packageNameRef = useRef(null);
  const travelAgentRef = useRef(null);
  const paymentSystemRef = useRef(null);
  const passengerPhoneRef = useRef(null);
  const emergencyPhoneRef = useRef(null);
  const trainTypeRef = useRef(null);
  const trainRouteRef = useRef(null);
  const packageName = normalizeMojibakeText(
    datosPdf?.general?.packageName ?? "",
  );
  const travelAgentName = normalizeMojibakeText(
    datosPdf?.general?.travelAgent ??
      voucherData?.created_by_name ??
      voucher?.created_by ??
      "",
  );
  const paymentSystemText = normalizeMojibakeText(
    datosPdf?.general?.paymentSystem ?? paymentSummary.metodoPago ?? "",
  );
  const passengerPhoneText = normalizeMojibakeText(
    hasOwn(datosPdf?.general, "passengerPhone")
      ? datosPdf?.general?.passengerPhone
      : getPassengerPhone(passengers?.[0] || {}),
  );
  const emergencyPhoneText = normalizeMojibakeText(
    hasOwn(datosPdf?.general, "emergencyPhone")
      ? datosPdf?.general?.emergencyPhone
      : "",
  );

  const syncEditableTextElement = (element, value) => {
    if (
      !element ||
      element.dataset.editing === "true" ||
      document.activeElement === element
    ) {
      return;
    }

    const normalized = normalizeMojibakeText(value ?? "");
    if (element.textContent !== normalized) {
      element.textContent = normalized;
    }
    element.dataset.empty = normalized.trim() ? "false" : "true";
  };

  const syncEditableTextRef = (ref, value) => {
    syncEditableTextElement(ref.current, value);
  };

  useEffect(() => {
    const element = packageNameRef.current;
    if (!element || document.activeElement === element) return;

    if (element.textContent !== packageName) {
      element.textContent = packageName;
    }
  }, [packageName]);

  useEffect(() => {
    const element = travelAgentRef.current;
    if (!element || document.activeElement === element) return;

    if (element.textContent !== travelAgentName) {
      element.textContent = travelAgentName;
    }
  }, [travelAgentName]);

  useEffect(() => {
    const element = paymentSystemRef.current;
    if (!element || document.activeElement === element) return;

    if (element.textContent !== paymentSystemText) {
      element.textContent = paymentSystemText;
    }
  }, [paymentSystemText]);

  useEffect(() => {
    syncEditableTextRef(passengerPhoneRef, passengerPhoneText);
  }, [passengerPhoneText]);

  useEffect(() => {
    syncEditableTextRef(emergencyPhoneRef, emergencyPhoneText);
  }, [emergencyPhoneText]);

  const handleFlightFormChange = (e) => {
    const { name, value } = e.target;
    setFlightForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleOpenFlightSubmodal = (type) => {
    setFlightForm({ ...emptyFlightForm });
    setFlightSubmodal({ open: true, type });
  };

  const handleCloseFlightSubmodal = () => {
    setFlightSubmodal({ open: false, type: null });
    setFlightForm({ ...emptyFlightForm });
  };

  const handleSaveFlightSubmodal = () => {
    if (flightSubmodal.type === "internacional") {
      onAddInternationalFlight?.({
        airline: flightForm.airline,
        from: flightForm.from,
        to: flightForm.to,
        flightNumber: flightForm.flightNumber,
        date: flightForm.date,
        depTime: flightForm.depTime,
        arrTime: flightForm.arrTime,
        procedencia: "internacional",
        parentService: { procedencia: "internacional" },
        childService: { procedencia: "internacional" },
      });
    } else {
      onAddNationalFlight?.({
        airline: flightForm.airline,
        from: flightForm.from,
        to: flightForm.to,
        flightNumber: flightForm.flightNumber,
        date: flightForm.date,
        depTime: flightForm.depTime,
        arrTime: flightForm.arrTime,
        procedencia: "nacional",
        parentService: { procedencia: "nacional" },
        childService: { procedencia: "nacional" },
      });
    }
    handleCloseFlightSubmodal();
  };

  const handleFlightFieldBlur = (flight, field, value, procedencia) => {
    const nextValue = String(value ?? "").trim();
    const info = extractFlightInfo(flight);
    const currentValue = getFlightEditableValue(flight, info, field).trim();
    if (nextValue === currentValue) return;

    const externalIndex = flight?.__externalIndex;
    if (externalIndex !== undefined && externalIndex !== null) {
      onUpdateExternalFlight?.(externalIndex, field, nextValue);
      return;
    }

    onUpsertFlightOverride?.(flight, field, nextValue, procedencia);
  };

  const handleRemoveFlight = (flight) => {
    const externalIndex = flight?.__externalIndex;
    if (externalIndex === undefined || externalIndex === null) return;
    onRemoveExternalFlight?.(externalIndex);
  };

  const canRemoveFlight = (flight) =>
    flight?.__isExternalFlight &&
    !String(flight?.source || flight?.source_type || "")
      .toLowerCase()
      .includes("itinerary_override");

  const getFlightEditableValue = (flight, info, field) => {
    const rawValue = info?.[field] ?? flight?.[field] ?? "";
    if (field === "date") return toIsoDate(rawValue, "");
    if (field === "depTime" || field === "arrTime") {
      return String(rawValue || "").slice(0, 5);
    }
    return String(rawValue || "");
  };

  const renderFlightInput = (
    flight,
    info,
    field,
    label,
    procedencia,
    type = "text",
    placeholder = "",
  ) => (
    <div className="pax-row flight-edit-row">
      <span className="label">{label}:</span>
      <input
        key={`${field}-${getFlightEditableValue(flight, info, field)}`}
        className="flight-edit-input"
        type={type}
        defaultValue={getFlightEditableValue(flight, info, field)}
        placeholder={placeholder}
        onBlur={(e) =>
          handleFlightFieldBlur(
            flight,
            field,
            e.currentTarget.value,
            procedencia,
          )
        }
      />
    </div>
  );

  const renderFlightRouteInputs = (flight, info, procedencia) => {
    if (!info.from && !info.to && info.route) {
      return renderFlightInput(
        flight,
        info,
        "route",
        labels.route.replace(/:$/, ""),
        procedencia,
        "text",
        labels.routePlaceholder,
      );
    }

    return (
      <div className="pax-row flight-edit-row">
        <span className="label">{labels.route}</span>
        <div className="flight-route-edit">
          <input
            key={`from-${getFlightEditableValue(flight, info, "from")}`}
            className="flight-edit-input"
            type="text"
            defaultValue={getFlightEditableValue(flight, info, "from")}
            placeholder={labels.originPlaceholder}
            onBlur={(e) =>
              handleFlightFieldBlur(
                flight,
                "from",
                e.currentTarget.value,
                procedencia,
              )
            }
          />
          <span>-</span>
          <input
            key={`to-${getFlightEditableValue(flight, info, "to")}`}
            className="flight-edit-input"
            type="text"
            defaultValue={getFlightEditableValue(flight, info, "to")}
            placeholder={labels.destinationPlaceholder}
            onBlur={(e) =>
              handleFlightFieldBlur(
                flight,
                "to",
                e.currentTarget.value,
                procedencia,
              )
            }
          />
        </div>
      </div>
    );
  };

  if (!voucher || !voucherData) return null;

  const labels = getVoucherLabels(idioma);
  const cot =
    voucherData.cotizacion_data || voucherData.cotizacion || voucherData;
  const cotExternalDays = normalizeVoucherDays(
    cot.itinerario_externo ||
      cot.itinerarioExterno ||
      cot.externalItinerary ||
      voucherData.itinerario_externo ||
      voucherData.itinerarioExterno ||
      voucherData.externalItinerary,
  );

  const mainPassenger = passengers[0] || {};
  const mainPassengerFullName = [
    mainPassenger.nombres || "",
    mainPassenger.apellidos || "",
  ]
    .join(" ")
    .trim();

  const createdAt = formatVoucherShortDate(voucher.created_at, idioma);
  const { fechaInicio: rawStartDate, fechaFin: rawEndDate } =
    getQuoteTravelDates(voucherData, cot);
  const startDate = parseVoucherDisplayDate(rawStartDate, null);
  const endDateValue = parseVoucherDisplayDate(rawEndDate, startDate);
  const itineraryBaseDate =
    startDate || parseVoucherDisplayDate(voucher.created_at, new Date());
  const formattedStartDate = startDate
    ? formatVoucherLongDate(startDate, idioma)
    : "";
  const formattedEndDate = endDateValue
    ? formatVoucherLongDate(endDateValue, idioma)
    : formattedStartDate;

  const derivedFinancialSummary = summarizeVoucherFinancials({
    voucher: voucherData,
    cotizacion: cot,
  });
  const totalCotizacion = Math.max(
    0,
    Number(paymentSummary?.totalCotizacion ?? derivedFinancialSummary.totalFinal) || 0,
  );
  const totalPagado = Math.max(
    0,
    Number(paymentSummary?.totalPagado ?? derivedFinancialSummary.totalPaid) || 0,
  );
  const pendiente = Math.max(0, totalCotizacion - totalPagado);

  const allDays = getMergedVoucherItineraryDays(voucherData);
  // Attach computed day date to each service so extractFlightInfo can use it
  const allServices = allDays.flatMap((d, dayIdx) => {
    const dayDate = toIsoDate(addDaysToDate(itineraryBaseDate, dayIdx));
    return (d.servicios || []).map((s) => ({ ...s, _dayDate: dayDate }));
  });
  const itineraryDays = Array.isArray(datosPdf?.itinerary?.days)
    ? datosPdf.itinerary.days
    : [];

  const getType = (service = {}) =>
    String(
      service?.parentService?.typeService ||
        service?.parentService?.tipo_servicio ||
        service?.typeService ||
        service?.tipoServicio ||
        service?.tipo_servicio ||
        "",
    ).toLowerCase();

  const hoteles = allServices.filter((s) => getType(s) === "hoteles");
  const trenes = allServices.filter((s) => getType(s) === "trenes");
  const vuelos = allServices.filter((s) => getType(s) === "vuelos");
  const tickets = allServices.filter((s) => getType(s) === "tickets");

  // Hotel info: prefer hotel_detalle from cotizacion, fallback to itinerary services
  const hotelDetalle = (() => {
    const raw = cot.hotel_detalle || cot.hotelDetalle;
    if (!raw) return null;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return typeof raw === "object" ? raw : null;
  })();

  const hotelEntries = [
    ...normalizeHotelDetalleEntries(hotelDetalle),
    ...hoteles.map((hotelService) => ({
      hotelName:
        hotelService?.parentService?.nombre ||
        hotelService?.parentService?.nombre_hotel ||
        hotelService?.childService?.hotel?.nombre ||
        hotelService?.hotelName ||
        "",
      category:
        hotelService?.parentService?.categoria ||
        hotelService?.childService?.categoria ||
        hotelService?.childService?.hotel?.categoria ||
        hotelService?.hotelCategory ||
        "",
      roomType:
        hotelService?.parentService?.tipo_habitacion ||
        hotelService?.childService?.tipo_habitacion ||
        hotelService?.childService?.habitacion?.tipo_habitacion ||
        hotelService?.roomType ||
        hotelService?.tipo_habitacion ||
        hotelService?.habitacion ||
        extractHotelRoomTypeFromText(
          [
            hotelService?.parentService?.nombre,
            hotelService?.parentService?.nombre_hotel,
            hotelService?.childService?.nombre,
            hotelService?.childService?.nombre_hotel,
            hotelService?.childService?.habitacion?.nombre,
            hotelService?.title,
            hotelService?.titulo,
            hotelService?.description,
            hotelService?.descripcion,
          ]
            .filter(Boolean)
            .join(" "),
        ) ||
        "",
    })),
  ];

  const hotelNames = uniqueNonEmptyValues(
    hotelEntries.map((entry) => entry.hotelName),
  );
  const hotelCategories = uniqueNonEmptyValues(
    hotelEntries.map((entry) => entry.category),
  );
  const hotelRoomTypes = uniqueNonEmptyValues(
    hotelEntries.map((entry) => entry.roomType),
  );

  const primerTren = trenes[0];

  const hotelNombre = hotelNames.join(" / ");
  const hotelCategoria = hotelCategories.join(" / ");
  const hotelTipoHab = hotelRoomTypes.join(" / ");

  const ticket = tickets[0]?.childService?.ticket?.entrada || "";
  const hotelRoomExtra = datosPdf?.hotel_train?.habitacionExtra || "";
  const ingresoExtra = datosPdf?.hotel_train?.tipoIngresoExtra || "";
  const trenNombre =
    primerTren?.parentService?.nombre_empresa ||
    primerTren?.parentService?.nombre ||
    "";
  const trenTipoBase = primerTren?.childService?.tipo_tren || "";
  const trenRutaBase = (() => {
    const vagon = primerTren?.childService?.vagon || primerTren?.childService;
    if (vagon?.lugar_salida && vagon?.lugar_destino)
      return `${vagon.lugar_salida} → ${vagon.lugar_destino}`;
    return "";
  })();
  const hasEditableTrainType = Object.prototype.hasOwnProperty.call(
    datosPdf?.hotel_train || {},
    "trenTipo",
  );
  const hasEditableTrainRoute = Object.prototype.hasOwnProperty.call(
    datosPdf?.hotel_train || {},
    "trenRuta",
  );
  const trenTipo = normalizeMojibakeText(
    hasEditableTrainType ? datosPdf?.hotel_train?.trenTipo : trenTipoBase,
  );
  const trenRuta = normalizeMojibakeText(
    hasEditableTrainRoute ? datosPdf?.hotel_train?.trenRuta : trenRutaBase,
  );

  useEffect(() => {
    syncEditableTextRef(trainTypeRef, trenTipo);
  }, [trenTipo]);

  useEffect(() => {
    syncEditableTextRef(trainRouteRef, trenRuta);
  }, [trenRuta]);

  // ——— Vuelos por procedencia desde el itinerario
  const itineraryIntl = vuelos.filter(isInternational);
  const itineraryNat = vuelos.filter(isNational);

  // ——— Vuelos por procedencia desde vuelos_externos (columna)
  const indexedExternalFlights = (externalFlights || []).map(
    (flight, index) => ({
      ...flight,
      __isExternalFlight: true,
      __externalIndex: index,
    }),
  );
  const externalIntl = indexedExternalFlights.filter(isInternational);
  const externalNat = indexedExternalFlights.filter(isNational);
  const overriddenFlightKeys = new Set(
    indexedExternalFlights
      .map((flight) => flight.sourceFlightKey || flight.source_flight_key)
      .filter(Boolean)
      .map(String),
  );
  const visibleItineraryIntl = itineraryIntl.filter(
    (flight) => !overriddenFlightKeys.has(getFlightSourceKey(flight)),
  );
  const visibleItineraryNat = itineraryNat.filter(
    (flight) => !overriddenFlightKeys.has(getFlightSourceKey(flight)),
  );

  // ——— Combinados
  const internationalFlights = [...visibleItineraryIntl, ...externalIntl];
  const nationalFlights = [...visibleItineraryNat, ...externalNat];
  const hasInternationalFlights = internationalFlights.length > 0;
  const hasNationalFlights = nationalFlights.length > 0;
  const totalFlightsCount =
    internationalFlights.length + nationalFlights.length;
  const hasAnyFlights = totalFlightsCount > 0;
  const flightPageCards = [
    ...(hasInternationalFlights
      ? [
          {
            type: "internacional",
            flights: internationalFlights,
            key: "intl-column",
          },
        ]
      : []),
    ...(hasNationalFlights
      ? [
          {
            type: "nacional",
            flights: nationalFlights,
            key: "nat-column",
          },
        ]
      : []),
  ];
  const flightPaginationSignature = flightPageCards
    .map((card) => {
      const flightsSignature = (card.flights || [])
        .map((flight) => {
          const info = extractFlightInfo(flight);
          return [
            getFlightSourceKey(flight),
            info.airline,
            info.from,
            info.to,
            info.flightClass,
            info.flightNumber,
            info.date,
            info.depTime,
            info.arrTime,
            info.baggage,
          ]
            .map((value) => String(value || ""))
            .join("~");
        })
        .join("^");
      return `${card.type}:${flightsSignature}`;
    })
    .join("|");
  // Los vuelos se fragmentan por filas visuales. Cada fila puede contener, en
  // paralelo, un vuelo internacional y uno nacional. Esto permite usar el
  // espacio libre debajo de pasajeros sin mover el bloque completo y continuar
  // las filas restantes junto con el itinerario en la página siguiente.
  const flightRows = Array.from(
    {
      length: Math.max(
        0,
        ...flightPageCards.map((card) =>
          Array.isArray(card.flights) ? card.flights.length : 0,
        ),
      ),
    },
    (_, rowIndex) => ({
      rowIndex,
      key: `flight-row-${rowIndex}`,
      cards: flightPageCards.flatMap((card) => {
        const flight = Array.isArray(card.flights)
          ? card.flights[rowIndex]
          : null;
        if (!flight) return [];
        return [
          {
            ...card,
            key: `${card.key}-row-${rowIndex}`,
            flights: [flight],
            rowIndex,
          },
        ];
      }),
    }),
  ).filter((row) => row.cards.length > 0);
  const canPlaceFlightsAfterPassengers =
    flightRows.length > 0 && passengers.length > 0;
  const [inlineFlightRowCount, setInlineFlightRowCount] = useState(() =>
    canPlaceFlightsAfterPassengers ? flightRows.length : 0,
  );
  const normalizedInlineFlightRowCount = Math.min(
    flightRows.length,
    Math.max(0, Number(inlineFlightRowCount) || 0),
  );
  const inlineFlightRows = flightRows.slice(0, normalizedInlineFlightRowCount);
  const flowFlightRows = flightRows.slice(normalizedInlineFlightRowCount);
  const shouldPlaceFlightsAfterPassengers =
    canPlaceFlightsAfterPassengers && inlineFlightRows.length > 0;
  const shouldPlaceFlightsInPdfFlow = flowFlightRows.length > 0;

  // ——— Información de pago: una sola fuente de precios
  // La cotización ya llega hidratada por hydrateCotizacionPricingContext, la
  // misma preparación que usa Cotizaciones antes de abrir SummaryContent.
  const pricingPeopleDetails =
    cot.peopleDetails ||
    cot.people_details ||
    cot.peopledetails || { adults: [], children: [] };
  const adultPassengersForPricing = Array.isArray(pricingPeopleDetails.adults)
    ? pricingPeopleDetails.adults
    : [];
  const childPassengersForPricing = Array.isArray(pricingPeopleDetails.children)
    ? pricingPeopleDetails.children
    : [];
  const pCount = cot.peopleCount || cot.peoplecount || {};
  const adultsCount = Math.max(
    1,
    adultPassengersForPricing.length ||
      Number(pCount.adults || cot.num_adults || cot.numAdults || 1),
  );
  const childrenCount = Math.max(
    0,
    childPassengersForPricing.length ||
      Number(pCount.children || cot.num_children || cot.numChildren || 0),
  );
  const nn = (value) =>
    typeof value === "number" ? value : Number.parseFloat(value) || 0;
  const round2 = (value) =>
    Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  const formatUsdSmart = (value) => {
    const safeValue = round2(Math.max(0, Number(value || 0)));
    const formatted = Number.isInteger(safeValue)
      ? safeValue.toLocaleString("en-US", { maximumFractionDigits: 0 })
      : safeValue.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

    return `USD ${formatted}`;
  };

  const paymentSummaryPricingModel = buildSummaryContentPricingModel(cot);
  const visibleSummaryParts = Array.isArray(paymentSummaryPricingModel.parts)
    ? paymentSummaryPricingModel.parts
    : [];
  const visibleSummaryGrandTotal = round2(
    paymentSummaryPricingModel.roundedTotal || 0,
  );
  const authoritativeTotal =
    totalCotizacion ||
    visibleSummaryGrandTotal ||
    paymentSummary.totalCotizacion ||
    nn(cot.total_final ?? cot.totalFinal) ||
    0;

  const rawAdditionalCosts = (() => {
    const raw = cot.additionalCosts || cot.additionalcosts || {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
    if (typeof raw !== "string" || !raw.trim()) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  })();
  const storedSubtotalWithoutExternal = nn(
    cot.subtotal_final ??
      cot.subtotalFinal ??
      rawAdditionalCosts.subtotalFinal ??
      rawAdditionalCosts.subtotal_final ??
      rawAdditionalCosts.commissionableSubtotal ??
      rawAdditionalCosts.commissionable_subtotal ??
      paymentSummary.subtotalCotizacion,
  );
  const coreSubtotalWithoutExternal = visibleSummaryParts.reduce(
    (sum, part) => {
      const beneficiaries = Math.max(
        1,
        nn(part?.beneficiaries ?? part?.count ?? part?.pax),
      );
      const valueWithoutExternal = Math.max(
        0,
        nn(part?.value) - nn(part?.external),
      );
      return sum + Math.ceil(valueWithoutExternal) * beneficiaries;
    },
    0,
  );
  const subtotalSinItinerarioExterno = Math.max(
    0,
    storedSubtotalWithoutExternal || coreSubtotalWithoutExternal,
  );

  const firstAdultPart = visibleSummaryParts.find(
    (part) => part?.audience !== "child",
  );
  const firstChildPart = visibleSummaryParts.find(
    (part) => part?.audience === "child",
  );
  const precioAdulto = nn(
    firstAdultPart?.displayValue ?? firstAdultPart?.value,
  );
  const precioNino = nn(
    firstChildPart?.displayValue ?? firstChildPart?.value,
  );

  const titleCasePaymentRoomLabel = (value = "") =>
    String(value || "")
      .split(/(\s+|\/|\+)/)
      .map((part) => {
        if (/^\s+$|^\/$|^\+$/.test(part)) return part === "+" ? " / " : part;
        if (!part.trim()) return part;
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join("")
      .replace(/\s*\/\s*/g, " / ")
      .replace(/\s{2,}/g, " ")
      .trim();

  const normalizePaymentRoomLabel = (value = "") => {
    const normalized = normalizeMojibakeText(value)
      .replace(/[_:]+/g, " ")
      .replace(/[-–—]+/g, " ")
      .replace(/\s*c\/a\b/gi, " ")
      .replace(/\s*\((?:\d+(?:\.\d+)?)\)\s*$/g, " ")
      .replace(/\b(?:por\s+)?(?:adultos?|adults?|niñ(?:os|as|o|a)|ninos?|children|child|crianças?|criancas?|criança|crianca)\b/gi, " ")
      .replace(/\b(?:habitaci[oó]n|habitacion|room|quarto)\b/gi, " ")
      .replace(/\b(?:summary|unified|converted|adult|child|hotel|total|fallback)\b/gi, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!normalized) return "";

    const lower = normalized
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const hasSimple = /\b(simple|single|individual)\b/.test(lower);
    const hasDouble = /\b(doble|double|twin)\b/.test(lower);
    const hasMatrimonial = /\b(matrimonial|matrimony)\b/.test(lower);
    const hasTriple = /\b(triple)\b/.test(lower);
    const hasFamily = /\b(familiar|family|familial)\b/.test(lower);
    const hasQuad = /\b(cuadruple|quadruple|quad|cuarto)\b/.test(lower);

    if (hasFamily) return "Familiar";
    if (hasQuad) return "Cuádruple";
    if (hasTriple) return "Triple";
    if (hasDouble && hasMatrimonial) return "Doble / Matrimonial";
    if (hasDouble) return "Doble";
    if (hasMatrimonial) return "Matrimonial";
    if (hasSimple) return "Simple";

    return titleCasePaymentRoomLabel(normalized);
  };

  const translatePaymentRoomLabel = (roomLabel = "") => {
    const label = normalizePaymentRoomLabel(roomLabel);
    if (!label) return "";

    const replacements =
      idioma === "en"
        ? {
            Simple: "Single",
            Doble: "Double",
            Matrimonial: "Matrimonial",
            Triple: "Triple",
            Familiar: "Family",
            Cuádruple: "Quadruple",
          }
        : idioma === "pt"
          ? {
              Simple: "Simples",
              Doble: "Duplo",
              Matrimonial: "Matrimonial",
              Triple: "Triplo",
              Familiar: "Familiar",
              Cuádruple: "Quádruplo",
            }
          : null;

    if (!replacements) return label;

    return label
      .split(" / ")
      .map((part) => replacements[part] || part)
      .join(" / ");
  };

  // La información de pago consume directamente la presentación canónica del
  // mismo core que alimenta ac__summary-calc y pax-price-check. No se vuelven a
  // inferir habitaciones desde el voucher ni se redistribuye el total vendido.
  const paymentPricingPresentation = buildSummaryPricingPresentation(
    paymentSummaryPricingModel,
  );
  const paymentBreakdownRowsFromCore = paymentPricingPresentation.columns.flatMap(
    (column) =>
      [
        column.adult
          ? {
              key: `${column.key}-adult`,
              label: `${labels.adultRoomPrice} ${translatePaymentRoomLabel(column.label)}`,
              kind: "adult",
              unitValue: column.adult.displayValue,
              beneficiaries: column.adult.beneficiaries,
              lineTotal: column.adult.lineTotal,
            }
          : null,
        column.child
          ? {
              key: `${column.key}-child`,
              label: `${labels.childRoomPrice} ${translatePaymentRoomLabel(column.label)}`,
              kind: "child",
              unitValue: column.child.displayValue,
              beneficiaries: column.child.beneficiaries,
              lineTotal: column.child.lineTotal,
            }
          : null,
      ].filter(Boolean),
  );
  const paymentBreakdownRows = paymentBreakdownRowsFromCore.length
    ? paymentBreakdownRowsFromCore
    : [
        {
          key: "adult-fallback",
          label: labels.adultPrice,
          kind: "adult",
          unitValue: Math.ceil(precioAdulto),
          beneficiaries: adultsCount,
          lineTotal: Math.ceil(precioAdulto) * adultsCount,
        },
        childrenCount > 0 && precioNino > 0
          ? {
              key: "child-fallback",
              label: labels.childPrice,
              kind: "child",
              unitValue: Math.ceil(precioNino),
              beneficiaries: childrenCount,
              lineTotal: Math.ceil(precioNino) * childrenCount,
            }
          : null,
      ].filter((row) => row && row.unitValue > 0);

  const montoEnviado = paymentSummary.totalPagado || totalPagado;

  // ——— Beneficiarios con costo > 0
  const totalBeneficiarios = Math.max(
    1,
    passengers.length ||
      Number(cot.cantidadpersonas || cot.cantidadPersonas) ||
      adultsCount + childrenCount,
  );
  const saldoPagar = paymentSummary.pendiente ?? pendiente;
  const infoPagoPackageName = normalizeMojibakeText(
    hasOwn(datosPdf?.info_pago, "packageName")
      ? datosPdf?.info_pago?.packageName
      : getVoucherPackageTitle(voucherData) || labels.touristPackage,
  );
  const lugarPago = datosPdf?.info_pago?.lugarPago ?? "Cusco";
  const textoPago = normalizeMojibakeText(
    datosPdf?.info_pago?.textoPago ?? DEFAULT_PAGO_TEXT,
  );
  // ——— Info Extra & Terminos
  const infoExtraText = ensureInfoExtraLockedSubtitles(
    normalizeMojibakeText(datosPdf?.info_extra ?? DEFAULT_INFO_EXTRA),
  );
  const terminosText = normalizeMojibakeText(
    datosPdf?.terminos_condiciones ?? DEFAULT_TERMINOS,
  );
  // El paginado de pasajeros se calcula con las alturas realmente renderizadas.
  // Así, ninguna fila puede invadir el espacio protegido del footer y el
  // excedente continúa en tantas páginas A4 como sea necesario.
  const passengerPaginationSignature = useMemo(
    () =>
      [
        passengers
          .map((pax, index) =>
            [
              pax?.id ?? pax?.pasajero_id ?? index,
              pax?.passenger_key || "",
              pax?.tipo_pasajero || pax?.tipoPasajero || "",
              pax?.nombres || "",
              pax?.apellidos || "",
              pax?.apellido_paterno || "",
              pax?.apellido_materno || "",
              pax?.pais || pax?.nacionalidad || "",
              pax?.tipo_documento || pax?.tipoDocumento || "",
              pax?.numero_pasaporte ||
                pax?.pasaporte ||
                pax?.documento ||
                pax?.numero_documento ||
                "",
              getPassengerBirthDate(pax) || "",
              pax?.sexo || "",
            ].join("~"),
          )
          .join("|"),
        idioma,
        voucher?.voucher_code || "",
        createdAt,
        packageName,
        travelAgentName,
        paymentSystemText,
        mainPassengerFullName,
        formattedStartDate,
        formattedEndDate,
        totalCotizacion,
        totalPagado,
        pendiente,
        hotelNombre,
        hotelCategoria,
        hotelTipoHab,
        hotelRoomExtra,
        trenNombre,
        trenTipo,
        trenRuta,
        ingresoExtra,
        passengerPhoneText,
        emergencyPhoneText,
        flightPaginationSignature,
      ].join("¶"),
    [
      passengers,
      idioma,
      voucher?.voucher_code,
      createdAt,
      packageName,
      travelAgentName,
      paymentSystemText,
      mainPassengerFullName,
      formattedStartDate,
      formattedEndDate,
      totalCotizacion,
      totalPagado,
      pendiente,
      hotelNombre,
      hotelCategoria,
      hotelTipoHab,
      hotelRoomExtra,
      trenNombre,
      trenTipo,
      trenRuta,
      ingresoExtra,
      passengerPhoneText,
      emergencyPhoneText,
      flightPaginationSignature,
    ],
  );
  const [passengerPageSizes, setPassengerPageSizes] = useState(() => [
    passengers.length,
  ]);
  const passengerPaginationSignatureRef = useRef("");
  const passengerPageRefs = useRef([]);
  const normalizedPassengerPageSizes = useMemo(() => {
    const normalized = [];
    let remaining = passengers.length;

    (Array.isArray(passengerPageSizes) ? passengerPageSizes : []).forEach(
      (rawSize, pageIndex) => {
        if (remaining <= 0) return;
        const size = Math.min(
          remaining,
          Math.max(0, Math.floor(Number(rawSize) || 0)),
        );
        if (size <= 0 && pageIndex > 0) return;
        normalized.push(size);
        remaining -= size;
      },
    );

    if (remaining > 0) normalized.push(remaining);
    if (!normalized.length) normalized.push(0);

    return normalized;
  }, [passengerPageSizes, passengers.length]);
  const passengerPages = useMemo(
    () => chunkArrayBySizes(passengers, normalizedPassengerPageSizes),
    [passengers, normalizedPassengerPageSizes],
  );
  const passengerPageOffsets = useMemo(() => {
    let offset = 0;
    return passengerPages.map((pagePassengers) => {
      const currentOffset = offset;
      offset += pagePassengers.length;
      return currentOffset;
    });
  }, [passengerPages]);

  useLayoutEffect(() => {
    if (
      passengerPaginationSignatureRef.current !== passengerPaginationSignature
    ) {
      passengerPaginationSignatureRef.current = passengerPaginationSignature;
      passengerPageRefs.current = [];
      setPassengerPageSizes([passengers.length]);
      setInlineFlightRowCount(
        canPlaceFlightsAfterPassengers ? flightRows.length : 0,
      );
      return;
    }

    if (!passengers.length) return;

    for (
      let pageIndex = 0;
      pageIndex < normalizedPassengerPageSizes.length;
      pageIndex += 1
    ) {
      const pageNode = passengerPageRefs.current[pageIndex];
      const contentNode = pageNode?.querySelector(
        "[data-passenger-page-content='true']",
      );
      if (!pageNode || !contentNode) continue;

      const pageRect = pageNode.getBoundingClientRect();
      const contentRect = contentNode.getBoundingClientRect();
      const pageStyle = window.getComputedStyle(pageNode);
      const paddingBottom = Number.parseFloat(pageStyle.paddingBottom) || 0;
      // padding-bottom reserves the visual footer plus its safety margin.
      const safeBottom = pageRect.bottom - paddingBottom;
      const overflow = contentRect.bottom - safeBottom;

      if (overflow <= 1) continue;

      const inlineFlightsNode = contentNode.querySelector(
        "[data-passenger-inline-flights='true']",
      );
      if (inlineFlightsNode && normalizedInlineFlightRowCount > 0) {
        // Reducimos una sola fila de vuelos por iteración. De esta manera se
        // conserva debajo de pasajeros todo lo que realmente cabe y únicamente
        // el excedente continúa en el flujo medido con el itinerario.
        setInlineFlightRowCount((currentCount) =>
          Math.max(0, Math.min(flightRows.length, currentCount) - 1),
        );
        return;
      }

      const gridNode = contentNode.querySelector(
        "[data-passenger-grid='true']",
      );
      const cardNodes = Array.from(
        gridNode?.querySelectorAll("[data-passenger-card='true']") || [],
      );
      const currentPageSize = normalizedPassengerPageSizes[pageIndex] || 0;
      if (!gridNode || !cardNodes.length || currentPageSize <= 0) continue;

      const rows = [];
      cardNodes.forEach((cardNode) => {
        const cardRect = cardNode.getBoundingClientRect();
        const existingRow = rows.find(
          (row) => Math.abs(row.top - cardRect.top) <= 1,
        );
        if (existingRow) {
          existingRow.bottom = Math.max(existingRow.bottom, cardRect.bottom);
          existingRow.count += 1;
          return;
        }
        rows.push({
          top: cardRect.top,
          bottom: cardRect.bottom,
          count: 1,
        });
      });
      rows.sort((left, right) => left.top - right.top);

      const gridRect = gridNode.getBoundingClientRect();
      const isLastPassengerPage =
        pageIndex === normalizedPassengerPageSizes.length - 1;
      const phoneRowNode = contentNode.querySelector(
        "[data-passenger-phone-row='true']",
      );
      // En la última página solo reservamos el bloque compacto de teléfonos.
      // Los vuelos que no caben se trasladan al flujo medido y ya no provocan
      // que todos los pasajeros abandonen la primera hoja.
      const trailingHeight = isLastPassengerPage
        ? Math.max(
            0,
            (phoneRowNode?.getBoundingClientRect().bottom || contentRect.bottom) -
              gridRect.bottom,
          )
        : 0;
      const gridSafeBottom = safeBottom - trailingHeight;
      let moveCount = rows
        .filter((row) => row.bottom > gridSafeBottom + 1)
        .reduce((total, row) => total + row.count, 0);

      // Si el excedente pertenece solo al bloque posterior, trasladamos al
      // menos la última fila para que dicho bloque también suba a la nueva hoja.
      if (moveCount === 0) {
        moveCount = rows[rows.length - 1]?.count || 1;
      }

      // Las páginas de continuación conservan como mínimo una fila. La portada
      // sí puede quedar sin pasajeros cuando su información previa ocupa todo
      // el alto útil; chunkArrayBySizes mantiene esa página vacía.
      const maxMovable =
        pageIndex === 0 ? currentPageSize : Math.max(0, currentPageSize - 1);
      if (maxMovable <= 0) continue;
      moveCount = Math.min(maxMovable, Math.max(1, moveCount));

      setPassengerPageSizes((currentSizes) => {
        const nextSizes = Array.isArray(currentSizes)
          ? [...currentSizes]
          : [passengers.length];
        while (nextSizes.length <= pageIndex + 1) nextSizes.push(0);
        nextSizes[pageIndex] = Math.max(
          0,
          (Number(nextSizes[pageIndex]) || 0) - moveCount,
        );
        nextSizes[pageIndex + 1] =
          (Number(nextSizes[pageIndex + 1]) || 0) + moveCount;
        return nextSizes.filter(
          (size, index) => index === 0 || Number(size) > 0,
        );
      });
      // La nueva última página de pasajeros puede disponer de más espacio.
      // Reintentamos desde todas las filas y el medidor conservará solo las que
      // entren antes del footer.
      setInlineFlightRowCount(
        canPlaceFlightsAfterPassengers ? flightRows.length : 0,
      );
      return;
    }
  }, [
    passengerPaginationSignature,
    normalizedPassengerPageSizes,
    passengerPages,
    passengers.length,
    canPlaceFlightsAfterPassengers,
    flightRows.length,
    normalizedInlineFlightRowCount,
  ]);

  const itineraryPageData = itineraryDays.flatMap((persistedDay, idx) => {
    const day = allDays[idx] || { numero: idx + 1 };
    const fullContent = normalizeEditableNewlines(persistedDay?.content ?? "");
    const contentChunks = paginateEditableTextContent(fullContent, {
      maxUnits: ITINERARY_CONTENT_CHUNK_UNITS,
      charsPerLine: 74,
      orphanMinUnits: 3,
    });

    return contentChunks.map((contentChunk, chunkIndex) => ({
      day,
      idx,
      dayDate: formatVoucherLongDate(addDaysToDate(itineraryBaseDate, idx), idioma),
      title: String(persistedDay?.title ?? ""),
      content: contentChunk.text,
      fullContent,
      contentStart: contentChunk.start,
      contentEnd: contentChunk.end,
      chunkIndex,
      totalChunks: contentChunks.length,
    }));
  });
  // La primera página ya contiene datos generales, pasajeros, teléfonos y
  // eventualmente vuelos compactos. Ese alto varía bastante por voucher;
  // por seguridad no se incrusta itinerario ahí, evitando que el primer día
  // invada el footer cuando los datos reales ocupan más de lo estimado.
  const introInlineItineraryBudget = 0;
  // El itinerario se pagina en el flujo A4 medido. No lo incrustamos en la
  // última página de vuelos porque ese cálculo era estimativo y generaba hojas
  // con uno o dos días arriba y demasiado espacio vacío antes del footer.
  const flightInlineItineraryBudget = 0;
  const introItinerarySelection = takeItineraryBlocksForUnits(
    itineraryPageData,
    Math.max(0, introInlineItineraryBudget - ITINERARY_HEADER_UNITS),
  );
  const flightItinerarySelection = takeItineraryBlocksForUnits(
    introItinerarySelection.remaining,
    Math.max(0, flightInlineItineraryBudget - ITINERARY_HEADER_UNITS),
  );
  const introInlineItineraryBlocks = introItinerarySelection.selected;
  const flightInlineItineraryBlocks = flightItinerarySelection.selected;
  const remainingItineraryBlocks = flightItinerarySelection.remaining;
  const hasInlineItineraryHeader =
    introInlineItineraryBlocks.length > 0 ||
    flightInlineItineraryBlocks.length > 0;
  const itineraryPages = groupItineraryBlocksByPage(remainingItineraryBlocks, {
    firstPageMaxUnits:
      ITINERARY_FIRST_PAGE_UNITS -
      (hasInlineItineraryHeader ? 0 : ITINERARY_HEADER_UNITS),
    pageMaxUnits: ITINERARY_PAGE_UNITS,
  });
  const printableItineraryPages = itineraryPages.map((page, pageIndex) => ({
    pageIndex,
    blocks: page.blocks || [],
    units: page.units || 0,
    maxUnits: page.maxUnits || ITINERARY_PAGE_UNITS,
  }));
  const lastPrintableItineraryPage =
    printableItineraryPages[printableItineraryPages.length - 1] || null;
  const lastItineraryRemainingUnits = lastPrintableItineraryPage
    ? Math.max(
        0,
        lastPrintableItineraryPage.maxUnits - lastPrintableItineraryPage.units,
      )
    : 0;
  const inlineInfoExtraBudget = Math.min(
    INFO_EXTRA_INLINE_MAX_UNITS,
    Math.max(0, lastItineraryRemainingUnits - 2),
  );
  const infoExtraInlineCandidate = takeInfoExtraPrefixForUnits(infoExtraText, {
    maxUnits: inlineInfoExtraBudget,
    charsPerLine: 94,
    minUnits: INFO_EXTRA_INLINE_MIN_UNITS,
  });
  const shouldInlineInfoExtraAfterItinerary = Boolean(
    lastPrintableItineraryPage &&
    printableItineraryPages.length > 0 &&
    infoExtraInlineCandidate.selected.trim(),
  );
  const infoExtraInlineText = shouldInlineInfoExtraAfterItinerary
    ? infoExtraInlineCandidate.selected
    : "";
  const infoExtraRemainingText = shouldInlineInfoExtraAfterItinerary
    ? infoExtraInlineCandidate.remaining
    : infoExtraText;
  const infoExtraDedicatedPages = infoExtraRemainingText.trim()
    ? paginateInfoExtraContent(infoExtraRemainingText, {
        maxUnits: INFO_EXTRA_PAGE_UNITS,
        charsPerLine: 94,
      })
    : [];
  const infoExtraPages = infoExtraInlineText
    ? [infoExtraInlineText, ...infoExtraDedicatedPages]
    : infoExtraDedicatedPages.length > 0
      ? infoExtraDedicatedPages
      : [infoExtraText];
  const infoExtraDedicatedPageOffset = infoExtraInlineText ? 1 : 0;

  const observacionesText = normalizeMojibakeText(
    datosPdf?.observaciones || "",
  );
  const hasObservacionesText = Boolean(observacionesText.trim());

  useEffect(() => {
    setShowObservacionesEditor(hasObservacionesText);
  }, [voucher?.id]);

  useEffect(() => {
    if (hasObservacionesText) setShowObservacionesEditor(true);
  }, [hasObservacionesText]);

  const estimatedObservacionesUnits = hasObservacionesText
    ? 8 + Math.max(4, getEstimatedTextUnits(observacionesText, 84))
    : 0;
  const estimatedInfoPagoUnits =
    30 +
    getEstimatedTextUnits(cot.titulo || "Paquete turístico", 66) +
    getEstimatedTextUnits(textoPago, 78) * 1.35 +
    estimatedObservacionesUnits;

  const lastDedicatedInfoExtraText =
    infoExtraDedicatedPages[infoExtraDedicatedPages.length - 1] || "";
  const lastInfoExtraUnits = getInfoExtraTextUnits(
    lastDedicatedInfoExtraText,
    94,
  );
  const shouldMergeInfoPagoWithInfoExtra =
    infoExtraDedicatedPages.length > 0 &&
    lastInfoExtraUnits + estimatedInfoPagoUnits <=
      INFO_EXTRA_WITH_PAYMENT_UNITS;

  const mergedPaymentTermsBudget = shouldMergeInfoPagoWithInfoExtra
    ? Math.min(
        TERMINOS_INLINE_MAX_UNITS,
        Math.max(
          0,
          INFO_EXTRA_WITH_PAYMENT_AND_TERMS_UNITS -
            lastInfoExtraUnits -
            estimatedInfoPagoUnits -
            INFO_PAGO_WITH_TERMS_GAP_UNITS,
        ),
      )
    : 0;
  const standalonePaymentTermsBudget = !shouldMergeInfoPagoWithInfoExtra
    ? Math.min(
        TERMINOS_INLINE_MAX_UNITS,
        Math.max(
          0,
          INFO_PAGO_PAGE_UNITS -
            estimatedInfoPagoUnits -
            INFO_PAGO_WITH_TERMS_GAP_UNITS,
        ),
      )
    : 0;
  const inlineTerminosCandidate = takeTerminosPrefixForUnits(terminosText, {
    maxUnits: shouldMergeInfoPagoWithInfoExtra
      ? mergedPaymentTermsBudget
      : standalonePaymentTermsBudget,
    charsPerLine: 102,
    minUnits: TERMINOS_INLINE_MIN_UNITS,
  });
  const terminosInlineText = inlineTerminosCandidate.selected.trim()
    ? inlineTerminosCandidate.selected
    : "";
  const terminosRemainingText = terminosInlineText
    ? inlineTerminosCandidate.remaining
    : terminosText;
  const terminosDedicatedPages = terminosRemainingText.trim()
    ? paginateTerminosContent(terminosRemainingText, {
        maxUnits: TERMINOS_PAGE_UNITS,
        charsPerLine: 102,
      })
    : [];
  const terminosPages = terminosInlineText
    ? [terminosInlineText, ...terminosDedicatedPages]
    : terminosDedicatedPages.length > 0
      ? terminosDedicatedPages
      : [terminosText];
  const terminosDedicatedPageOffset = terminosInlineText ? 1 : 0;

  const infoExtraFlowPages = paginateInfoExtraContent(infoExtraText, {
    maxUnits: INFO_EXTRA_FLOW_CHUNK_UNITS,
    charsPerLine: 88,
  });
  const terminosFlowBlocks = paginateTerminosContent(terminosText, {
    maxUnits: TERMINOS_FLOW_CHUNK_UNITS,
    charsPerLine: 92,
  });
  const hasSubtotalSinItinerarioExterno =
    subtotalSinItinerarioExterno > 0 &&
    subtotalSinItinerarioExterno < authoritativeTotal;
  const pdfFlowItems = [
    ...(shouldPlaceFlightsInPdfFlow
      ? flowFlightRows.map((row) => ({
          type: "flight-row",
          cards: row.cards,
          rowIndex: row.rowIndex,
          signature: `${flightPaginationSignature}:row:${row.rowIndex}`,
          // Las tarjetas de una fila se muestran en paralelo; el alto estimado
          // corresponde a la tarjeta más alta, no a la suma de columnas.
          units: Math.max(
            12,
            ...row.cards.map((card) =>
              4.5 +
              Math.max(
                1,
                Array.isArray(card?.flights) ? card.flights.length : 1,
              ) *
                10.5,
            ),
          ),
        }))
      : []),
    ...remainingItineraryBlocks.map((block, blockIndex) => ({
      type: "itinerary-day",
      block,
      showHeaderReserve: !hasInlineItineraryHeader && blockIndex === 0,
      units: getItineraryBlockUnits(block),
    })),
    ...infoExtraFlowPages.map((pageText, pageIndex) => ({
      type: "info-extra",
      pageText,
      pageIndex,
      units: getInfoExtraSectionUnits(pageText),
    })),
    {
      type: "payment",
      units: getInfoPagoSectionUnits({
        title: cot.titulo || "Paquete turístico",
        textoPago,
        observaciones: observacionesText,
        childrenCount,
        hasSubtotal: hasSubtotalSinItinerarioExterno,
      }),
    },
    ...terminosFlowBlocks.map((pageText, blockIndex) => ({
      type: "terminos",
      pageText,
      blockIndex,
      units: getTerminosSectionUnits(pageText),
    })),
  ];
  const fallbackPdfFlowPages = packPdfFlowItems(pdfFlowItems);
  const pdfFlowSignature = pdfFlowItems.map(getPdfFlowItemSignature).join("¶");
  const flowMeasureRef = useRef(null);
  const [measuredPdfFlowPages, setMeasuredPdfFlowPages] = useState(null);

  useLayoutEffect(() => {
    const node = flowMeasureRef.current;
    if (!node || !pdfFlowItems.length) {
      setMeasuredPdfFlowPages(null);
      return undefined;
    }

    // Evita reutilizar por un frame la distribución anterior cuando vuelos,
    // itinerario o textos cambian de página.
    setMeasuredPdfFlowPages(null);

    let frameId = 0;
    frameId = window.requestAnimationFrame(() => {
      const measuredItems = Array.from(
        node.querySelectorAll("[data-flow-measure-item='true']"),
      );
      const heights = measuredItems.map((itemNode) =>
        Math.ceil(itemNode.getBoundingClientRect().height),
      );

      if (heights.length !== pdfFlowItems.length) {
        setMeasuredPdfFlowPages(null);
        return;
      }

      setMeasuredPdfFlowPages(buildMeasuredPdfFlowPages(pdfFlowItems, heights));
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [pdfFlowSignature]);

  const effectivePdfFlowPages = measuredPdfFlowPages || fallbackPdfFlowPages;
  const terminosFlowPageTexts = effectivePdfFlowPages
    .map((page) =>
      page.items
        .filter((item) => item.type === "terminos")
        .map((item) => item.pageText)
        .join("\n\n")
        .trim(),
    )
    .filter(Boolean);

  const handleChunkedScopeTouch = (scope, chunks, pageIndex, value) => {
    const mergedValue = mergeChunkedText(chunks, pageIndex, value);
    onDatosPdfTouch?.({
      scope,
      field: "text",
      value: mergedValue,
    });
  };

  const handleChunkedScopeChange = (scope, chunks, pageIndex, value) => {
    const mergedValue = mergeChunkedText(chunks, pageIndex, value);
    onDatosPdfChange?.({
      scope,
      field: "text",
      value: mergedValue,
    });
  };

  const handleDayChunkTouch = (
    dayIndex,
    fullContent,
    contentStart,
    contentEnd,
    value,
  ) => {
    const mergedValue = replaceEditableTextRange(
      fullContent,
      contentStart,
      contentEnd,
      value,
    );
    onDatosPdfTouch?.({
      scope: "day",
      index: dayIndex,
      field: "content",
      value: mergedValue,
    });
  };

  const handleDayChunkChange = (
    dayIndex,
    fullContent,
    contentStart,
    contentEnd,
    value,
  ) => {
    const mergedValue = replaceEditableTextRange(
      fullContent,
      contentStart,
      contentEnd,
      value,
    );
    onDatosPdfChange?.({
      scope: "day",
      index: dayIndex,
      field: "content",
      value: mergedValue,
    });
  };

  const handleEditableInput = (event, callback) => {
    const element = event.currentTarget;
    const caret = captureEditableCaret(element);
    callback();

    const pendingFrame = pendingEditableCaretFrames.get(element);
    if (pendingFrame) cancelAnimationFrame(pendingFrame);

    const frame = requestAnimationFrame(() => {
      pendingEditableCaretFrames.delete(element);
      restoreEditableCaret(element, caret);
    });
    pendingEditableCaretFrames.set(element, frame);
  };

  const handleEditableMultilineKeyDown = (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    if (!insertPlainTextAtSelection("\n")) return;

    dispatchEditableInput(event.currentTarget, "insertLineBreak", "\n");
  };

  const handleEditableSingleLineKeyDown = (event) => {
    if (event.key === "Enter") event.preventDefault();
  };

  const renderObservacionesContent = ({ embedded = false } = {}) => {
    const shouldShowObservaciones =
      hasObservacionesText || showObservacionesEditor;

    if (!shouldShowObservaciones) return null;

    return (
      <div
        className={`voucher-observaciones-box${
          embedded ? " voucher-observaciones-box--embedded" : ""
        }${hasObservacionesText ? "" : " voucher-observaciones-box--draft-empty"}`}
      >
        <div className="voucher-observaciones-title">{labels.observations}</div>
        <div
        className="voucher-observaciones-content editable-field"
        contentEditable={!!onDatosPdfChange}
        suppressContentEditableWarning
        style={{ whiteSpace: "pre-wrap" }}
        data-placeholder={labels.observationsPlaceholder}
        ref={(node) => {
          if (!node || node.dataset.editing === "true") return;

          if (node.textContent !== observacionesText) {
            node.textContent = observacionesText;
          }
          node.dataset.empty = observacionesText.trim() ? "false" : "true";
        }}
        onFocus={(e) => {
          e.currentTarget.dataset.editing = "true";
        }}
        onKeyDown={handleEditableMultilineKeyDown}
        onPaste={handleEditablePlainTextPaste}
        onInput={(e) => {
          const nextValue = normalizeEditableNewlines(
            e.currentTarget.textContent ?? "",
          );
          e.currentTarget.dataset.empty = nextValue.trim() ? "false" : "true";
          handleEditableInput(e, () =>
            onDatosPdfTouch?.({
              scope: "observaciones",
              field: "text",
              value: nextValue,
            }),
          );
        }}
        onBlur={(e) => {
          const nextValue = normalizeEditableNewlines(
            e.currentTarget.textContent ?? "",
          );
          delete e.currentTarget.dataset.editing;
          e.currentTarget.dataset.empty = nextValue.trim() ? "false" : "true";
          if (!nextValue.trim()) setShowObservacionesEditor(false);
          onDatosPdfChange?.({
            scope: "observaciones",
            field: "text",
            value: nextValue,
          });
        }}
      />
    </div>
    );
  };

  const renderInfoPagoContent = ({ embedded = false } = {}) => (
    <>
      <div className="voucher-section-title">{labels.paymentInfo}</div>

      <div className="info-pago-box">
        <div
          className="info-pago-package-name editable-field"
          contentEditable={!!onDatosPdfChange}
          suppressContentEditableWarning
          role="textbox"
          aria-label={labels.packageName}
          data-placeholder={labels.packageNamePlaceholder}
          ref={(node) => syncEditableTextElement(node, infoPagoPackageName)}
          onFocus={(event) => {
            event.currentTarget.dataset.editing = "true";
          }}
          onKeyDown={handleEditableSingleLineKeyDown}
          onPaste={handleEditableSingleLinePaste}
          onInput={(event) => {
            const nextValue = normalizeEditableSingleLine(
              event.currentTarget.textContent ?? "",
            );
            event.currentTarget.dataset.empty = nextValue.trim()
              ? "false"
              : "true";
            handleEditableInput(event, () =>
              onDatosPdfTouch?.({
                scope: "info_pago",
                field: "packageName",
                value: nextValue,
              }),
            );
          }}
          onBlur={(event) => {
            const nextValue = normalizeEditableSingleLine(
              event.currentTarget.textContent ?? "",
            );
            delete event.currentTarget.dataset.editing;
            event.currentTarget.dataset.empty = nextValue.trim()
              ? "false"
              : "true";
            onDatosPdfChange?.({
              scope: "info_pago",
              field: "packageName",
              value: nextValue,
            });
          }}
        />
      </div>

      <div className="info-pago-breakdown">
        <div className="info-pago-breakdown-title">
          <span>{labels.priceBreakdownTitle}</span>
          <small>{labels.perPerson}</small>
        </div>
        <div className="info-pago-breakdown-list">
          {paymentBreakdownRows.map((row) => {
            const amountToDisplay = row.unitValue;
            const detailBeneficiaries = Math.max(1, Number(row.beneficiaries) || 1);

            return (
              <div
                className={`info-pago-price-row info-pago-price-row--${row.kind}`}
                key={row.key}
              >
                <div className="info-pago-price-main">
                  <span>{row.label}</span>
                  <small>{detailBeneficiaries} {labels.passengersShort}</small>
                </div>
                <div className="info-pago-price-amount">
                  <strong>{formatUsdSmart(amountToDisplay)}</strong>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="info-pago-grid">
        <div className="info-pago-row">
          <span className="label">{labels.amountSent}</span>
          <span className="value">{formatUsdSmart(montoEnviado)}</span>
        </div>
        <div className="info-pago-row">
          <span className="label">{labels.voucherTotal}</span>
          <span className="value">
            {formatUsdSmart(authoritativeTotal)}
          </span>
        </div>
        <div className="info-pago-row">
          <span className="label">
            {labels.balanceToPayIn}{" "}
            <span
              className="editable-field editable-inline"
              contentEditable={!!onDatosPdfChange}
              suppressContentEditableWarning
              role="textbox"
              aria-label={labels.balanceToPayIn}
              data-placeholder="Cusco"
              ref={(node) => syncEditableTextElement(node, lugarPago)}
              onFocus={(event) => {
                event.currentTarget.dataset.editing = "true";
              }}
              onKeyDown={handleEditableSingleLineKeyDown}
              onPaste={handleEditableSingleLinePaste}
              onInput={(event) => {
                const nextValue = normalizeEditableSingleLine(
                  event.currentTarget.textContent ?? "",
                );
                handleEditableInput(event, () =>
                  onDatosPdfTouch?.({
                    scope: "info_pago",
                    field: "lugarPago",
                    value: nextValue || "Cusco",
                  }),
                );
              }}
              onBlur={(event) => {
                const nextValue = normalizeEditableSingleLine(
                  event.currentTarget.textContent ?? "",
                );
                delete event.currentTarget.dataset.editing;
                onDatosPdfChange?.({
                  scope: "info_pago",
                  field: "lugarPago",
                  value: nextValue || "Cusco",
                });
              }}
            />
            :
          </span>
          <span className="value">{formatUsdSmart(saldoPagar)}</span>
        </div>
      </div>

      <div
        className="info-pago-text editable-field"
        contentEditable={!!onDatosPdfChange}
        suppressContentEditableWarning
        style={{ whiteSpace: "pre-wrap" }}
        role="textbox"
        aria-multiline="true"
        ref={(node) => syncEditableTextElement(node, textoPago)}
        onFocus={(event) => {
          event.currentTarget.dataset.editing = "true";
        }}
        onKeyDown={handleEditableMultilineKeyDown}
        onPaste={handleEditablePlainTextPaste}
        onInput={(e) =>
          handleEditableInput(e, () =>
            onDatosPdfTouch?.({
              scope: "info_pago",
              field: "textoPago",
              value: normalizeEditableNewlines(
                e.currentTarget.textContent ?? "",
              ),
            }),
          )
        }
        onBlur={(e) => {
          delete e.currentTarget.dataset.editing;
          onDatosPdfChange?.({
            scope: "info_pago",
            field: "textoPago",
            value: normalizeEditableNewlines(e.currentTarget.textContent ?? ""),
          });
        }}
        data-embedded={embedded ? "true" : undefined}
      />
    </>
  );

  const renderVoucherPhoneRow = () => (
    <div
      className="voucher-row voucher-row--phones"
      data-passenger-phone-row="true"
    >
      <div className="cell cell-full">
        <span className="label">{labels.passengerPhone}</span>
        <div
          ref={passengerPhoneRef}
          className="value voucher-phone-value editable-field"
          contentEditable={!!onDatosPdfChange}
          suppressContentEditableWarning
          data-placeholder={labels.passengerPhonePlaceholder}
          onKeyDown={handleEditableSingleLineKeyDown}
          onPaste={handleEditablePlainTextPaste}
          onInput={(e) =>
            handleEditableInput(e, () =>
              onDatosPdfTouch?.({
                scope: "general",
                field: "passengerPhone",
                value: normalizeEditableNewlines(
                  e.currentTarget.textContent ?? "",
                ),
              }),
            )
          }
          onBlur={(e) =>
            onDatosPdfChange?.({
              scope: "general",
              field: "passengerPhone",
              value: normalizeEditableNewlines(
                e.currentTarget.textContent ?? "",
              ),
            })
          }
        />
      </div>
      <div className="cell cell-full">
        <span className="label">{labels.emergencyPhone}</span>
        <div
          ref={emergencyPhoneRef}
          className="value voucher-phone-value editable-field"
          contentEditable={!!onDatosPdfChange}
          suppressContentEditableWarning
          data-placeholder={labels.emergencyPhonePlaceholder}
          onKeyDown={handleEditableSingleLineKeyDown}
          onPaste={handleEditablePlainTextPaste}
          onInput={(e) =>
            handleEditableInput(e, () =>
              onDatosPdfTouch?.({
                scope: "general",
                field: "emergencyPhone",
                value: normalizeEditableNewlines(
                  e.currentTarget.textContent ?? "",
                ),
              }),
            )
          }
          onBlur={(e) =>
            onDatosPdfChange?.({
              scope: "general",
              field: "emergencyPhone",
              value: normalizeEditableNewlines(
                e.currentTarget.textContent ?? "",
              ),
            })
          }
        />
      </div>
    </div>
  );

  const renderVensoServicePageHeader = ({ compact = false } = {}) => {
    const programName =
      packageName || normalizeMojibakeText(getVoucherPackageTitle(voucherData));

    return (
      <div
        className={`venso-service-sheet-header${
          compact ? " venso-service-sheet-header--compact" : ""
        }`}
        data-venso-service-header="true"
      >
        <div className="venso-service-sheet-header__identity">
          <img
            className="venso-service-sheet-header__logo"
            src="/brand/logo-principal-magenta.webp"
            alt="Venso Tours"
          />
          <div className="venso-service-sheet-header__voucher">
            <span>{labels.serviceVoucher}:</span>
            <strong>{voucher.voucher_code || ""}</strong>
          </div>

          {!compact && (
            <div className="venso-service-sheet-header__meta">
              <span className="meta-label">AGENCIA:</span>
              <span className="meta-value">{VENSO_VOUCHER_CONTACT.agency}</span>
              <span className="meta-label">COUNTER:</span>
              <div
                ref={travelAgentRef}
                className="meta-value meta-value--editable editable-field"
                contentEditable={!!onDatosPdfChange}
                suppressContentEditableWarning
                data-placeholder={labels.travelAgent.replace(/:$/, "")}
                onInput={(e) =>
                  handleEditableInput(e, () =>
                    onDatosPdfTouch?.({
                      scope: "general",
                      field: "travelAgent",
                      value: e.currentTarget.textContent || "",
                    }),
                  )
                }
                onBlur={(e) =>
                  onDatosPdfChange?.({
                    scope: "general",
                    field: "travelAgent",
                    value: e.currentTarget.textContent || "",
                  })
                }
              />
              <span className="meta-label">TELÉFONO:</span>
              <span className="meta-value">-</span>
              <span className="meta-label">PROGRAMA:</span>
              <div
                ref={packageNameRef}
                className="meta-value meta-value--editable editable-field"
                contentEditable={!!onDatosPdfChange}
                suppressContentEditableWarning
                data-placeholder={labels.packageNamePlaceholder}
                onInput={(e) =>
                  handleEditableInput(e, () =>
                    onDatosPdfTouch?.({
                      scope: "general",
                      field: "packageName",
                      value: e.currentTarget.textContent || "",
                    }),
                  )
                }
                onBlur={(e) =>
                  onDatosPdfChange?.({
                    scope: "general",
                    field: "packageName",
                    value: e.currentTarget.textContent || "",
                  })
                }
              >
                {programName}
              </div>
              <span className="meta-label">FECHA:</span>
              <span className="meta-value">{createdAt}</span>
            </div>
          )}
        </div>

        <div className="venso-service-sheet-header__contact">
          <strong>Contacto en Cusco</strong>
          <span>{VENSO_VOUCHER_CONTACT.cusco}</span>
          {!compact && (
            <>
              <small>TELÉFONO DE EMERGENCIA LAS 24HRS</small>
              <span>{VENSO_VOUCHER_CONTACT.emergency}</span>
              <small>WhatsApp</small>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderFlightBox = (type, flights) => {
    if (!flights.length) return null;

    const isInternationalFlight = type === "internacional";
    const title = isInternationalFlight
      ? labels.internationalFlightData
      : labels.nationalFlightData;
    const boxClass = isInternationalFlight
      ? "flight-box--intl"
      : "flight-box--national";
    const keyPrefix = isInternationalFlight ? "intl" : "nat";

    return (
      <div
        className={`flight-box ${boxClass}${
          flights.length > 1 ? " flight-box--stacked" : ""
        }`}
      >
        <div className="flight-title">{title}</div>
        {flights.map((flight, index) => {
          const info = extractFlightInfo(flight);
          return (
            <div
              className={`flight-item${
                canRemoveFlight(flight) ? " flight-item--removable" : ""
              }`}
              key={`${keyPrefix}-${index}`}
            >
              {canRemoveFlight(flight) && (
                <button
                  type="button"
                  className="flight-remove-button"
                  onClick={() => handleRemoveFlight(flight)}
                  title={labels.removeFlight}
                  aria-label={labels.removeFlight}
                >
                  <MdDeleteOutline size={13} />
                </button>
              )}
              {renderFlightRouteInputs(flight, info, type)}
              {renderFlightInput(
                flight,
                info,
                "airline",
                labels.airline,
                type,
                "text",
                labels.airline,
              )}
              {renderFlightInput(
                flight,
                info,
                "flightClass",
                labels.flightClass,
                type,
                "text",
                labels.flightClass,
              )}
              {renderFlightInput(
                flight,
                info,
                "flightNumber",
                labels.flightNumber,
                type,
                "text",
                labels.number,
              )}
              {renderFlightInput(flight, info, "date", labels.date, type, "date")}
              {renderFlightInput(
                flight,
                info,
                "depTime",
                labels.departureTime,
                type,
                "time",
              )}
              {renderFlightInput(
                flight,
                info,
                "arrTime",
                labels.arrivalTime,
                type,
                "time",
              )}
              {renderFlightInput(
                flight,
                info,
                "baggage",
                labels.baggage,
                type,
                "text",
                labels.baggage,
              )}
              {index < flights.length - 1 && <hr className="flight-sep" />}
            </div>
          );
        })}
      </div>
    );
  };

  const renderFlightsGrid = ({ compact = false, cards = null } = {}) => {
    const flightCards = Array.isArray(cards) ? cards : flightPageCards;
    if (!flightCards.length) return null;

    return (
      <div
        className={`voucher-flights-grid${
          compact ? " voucher-flights-grid--compact" : ""
        }${flightCards.length === 1 ? " voucher-flights-grid--single" : ""}`}
      >
        {flightCards.map((card) => (
          <Fragment key={card.key}>
            {renderFlightBox(
              card.type,
              Array.isArray(card.flights) ? card.flights : [card.flight],
            )}
          </Fragment>
        ))}
      </div>
    );
  };

  const renderItineraryHeaderContent = () => (
    <>
      <div
        className="voucher-itinerary-title editable-field"
        contentEditable={!!onDatosPdfChange}
        suppressContentEditableWarning
        onInput={(e) =>
          handleEditableInput(e, () =>
            onDatosPdfTouch?.({
              scope: "itinerary",
              field: "title",
              value: e.currentTarget.textContent ?? "",
            }),
          )
        }
        onBlur={(e) => {
          onDatosPdfChange?.({
            scope: "itinerary",
            field: "title",
            value: e.currentTarget.textContent ?? "",
          });
        }}
      >
        {datosPdf?.itinerary?.title ?? labels.itinerary}
      </div>

      <div className="voucher-itinerary-dates">
        <span className="label">{labels.fromDate}</span>
        <span className="value">{formattedStartDate}</span>
        <span className="label">{labels.toDate}</span>
        <span className="value">{formattedEndDate}</span>
      </div>
    </>
  );

  const renderItineraryDayBlock = (block) => (
    <div
      key={`day-${block.idx}-${block.chunkIndex}`}
      className="voucher-itinerary-day"
    >
      <div className="day-header">
        <span className="day-number">
          {labels.day} {block.day?.numero || block.idx + 1} - {block.dayDate}
          {block.totalChunks > 1 &&
            ` (${block.chunkIndex + 1}/${block.totalChunks})`}
        </span>
      </div>
      <div
        className="day-title editable-field"
        contentEditable={!!onDatosPdfChange}
        suppressContentEditableWarning
        ref={(node) => {
          if (!node || node.dataset.editing === "true") return;
          const expectedTitle = String(block.title ?? "");
          if (node.textContent !== expectedTitle) {
            node.textContent = expectedTitle;
          }
        }}
        onFocus={(e) => {
          e.currentTarget.dataset.editing = "true";
        }}
        onInput={(e) =>
          handleEditableInput(e, () =>
            onDatosPdfTouch?.({
              scope: "day",
              index: block.idx,
              field: "title",
              value: e.currentTarget.textContent || "",
            }),
          )
        }
        onBlur={(e) => {
          onDatosPdfChange?.({
            scope: "day",
            index: block.idx,
            field: "title",
            value: e.currentTarget.textContent || "",
          });
          delete e.currentTarget.dataset.editing;
        }}
      />
      <div
        className="day-content editable-field"
        contentEditable={!!onDatosPdfChange}
        suppressContentEditableWarning
        style={{ whiteSpace: "pre-wrap" }}
        ref={(node) => {
          if (!node || node.dataset.editing === "true") return;
          const expectedContent = normalizeEditableNewlines(
            block.content ?? "",
          );
          if (node.textContent !== expectedContent) {
            node.textContent = expectedContent;
          }
        }}
        onFocus={(e) => {
          e.currentTarget.dataset.editing = "true";
        }}
        onKeyDown={handleEditableMultilineKeyDown}
        onPaste={handleEditablePlainTextPaste}
        onInput={(e) =>
          handleEditableInput(e, () =>
            handleDayChunkTouch(
              block.idx,
              block.fullContent,
              block.contentStart,
              block.contentEnd,
              normalizeEditableNewlines(e.currentTarget.textContent ?? ""),
            ),
          )
        }
        onBlur={(e) => {
          const nextValue = normalizeEditableNewlines(
            e.currentTarget.textContent ?? "",
          );
          delete e.currentTarget.dataset.editing;
          handleDayChunkChange(
            block.idx,
            block.fullContent,
            block.contentStart,
            block.contentEnd,
            nextValue,
          );
        }}
      />
    </div>
  );

  const renderItinerarySection = (
    blocks,
    { placement = "page", showHeader = false } = {},
  ) => {
    if (!blocks?.length) return null;

    return (
      <div
        className={`voucher-itinerary-section voucher-itinerary-section--page-header voucher-itinerary-section--${placement}${
          showHeader ? "" : " voucher-itinerary-section--continued"
        }`}
      >
        {showHeader && renderItineraryHeaderContent()}
        <div className="voucher-itinerary-section__days">
          {blocks.map(renderItineraryDayBlock)}
        </div>
      </div>
    );
  };

  const renderInlineItineraryBlocks = (blocks, placement) =>
    renderItinerarySection(blocks, {
      placement,
      showHeader: !hasRenderedItineraryHeaderBeforePlacement(placement),
    });

  const hasRenderedItineraryHeaderBeforePlacement = (placement) => {
    if (placement === "intro") return false;
    if (placement === "flights") return introInlineItineraryBlocks.length > 0;
    return hasInlineItineraryHeader;
  };

  const renderTerminosSection = ({
    pageText,
    pageIndex,
    chunks = terminosPages,
    inline = false,
    sectionKey = undefined,
  }) => (
    <div
      key={sectionKey}
      className={`voucher-section terminos-section${
        inline ? " terminos-section--inline" : " voucher-page-break"
      }`}
    >
      <div className="voucher-section-title">
        {labels.termsTitle}
        {chunks.length > 1 && ` (${pageIndex + 1}/${chunks.length})`}
      </div>
      <div className="terminos-content" style={{ whiteSpace: "pre-wrap" }}>
        {formatTycText(pageText)}
      </div>
    </div>
  );

  const renderInfoExtraSection = ({
    pageText,
    pageIndex,
    chunks = infoExtraPages,
    inline = false,
    withPayment = false,
    inlineTerminosText = "",
  }) => {
    const infoExtraBlocks = splitInfoExtraEditableBlocks(pageText);

    const replaceEditableBlock = (block, value) =>
      replaceInfoExtraEditableBlock(pageText, block, value);

    const renderEditableBlock = (block, blockIndex) => (
      <div
        key={`info-extra-editable-${pageIndex}-${blockIndex}`}
        className="info-extra-editable-block editable-field"
        contentEditable={!!onDatosPdfChange}
        suppressContentEditableWarning
        data-placeholder={labels.includesTitle}
        ref={(node) => syncPlainEditableNode(node, block.text)}
        onFocus={(e) => {
          e.currentTarget.dataset.editing = "true";
        }}
        onKeyDown={handleEditableMultilineKeyDown}
        onPaste={handleEditablePlainTextPaste}
        onInput={(e) =>
          handleEditableInput(e, () =>
            handleChunkedScopeTouch(
              "info_extra",
              chunks,
              pageIndex,
              replaceEditableBlock(block, e.currentTarget.textContent ?? ""),
            ),
          )
        }
        onBlur={(e) => {
          const nextPageText = replaceEditableBlock(
            block,
            e.currentTarget.textContent ?? "",
          );
          delete e.currentTarget.dataset.editing;
          handleChunkedScopeChange("info_extra", chunks, pageIndex, nextPageText);
        }}
      />
    );

    return (
      <div
        className={`voucher-section info-extra-section${
          inline ? " info-extra-section--inline" : " voucher-page-break"
        }${withPayment ? " info-extra-section--with-payment" : ""}`}
      >
        <div className="voucher-section-title">
          {labels.includesTitle}
          {chunks.length > 1 && ` (${pageIndex + 1}/${chunks.length})`}
        </div>
        <div
          className="info-extra-content info-extra-content--split info-extra-content--locked-subtitles"
          style={{ whiteSpace: "pre-wrap" }}
        >
          {infoExtraBlocks.map((block, blockIndex) => {
            if (block.type === "subtitle") {
              return (
                <strong
                  key={`info-extra-subtitle-${pageIndex}-${blockIndex}`}
                  className="info-extra-subtitle info-extra-subtitle--fixed"
                  contentEditable={false}
                >
                  {getInfoExtraSubtitleDisplay(block.text, idioma)}
                </strong>
              );
            }

            return renderEditableBlock(block, blockIndex);
          })}
        </div>

        {withPayment && (
          <div className="voucher-embedded-section info-pago-section info-pago-section--embedded">
            {renderInfoPagoContent({ embedded: true })}
            {renderObservacionesContent({ embedded: true })}
            {inlineTerminosText &&
              renderTerminosSection({
                pageText: inlineTerminosText,
                pageIndex: 0,
                chunks: terminosPages,
                inline: true,
              })}
          </div>
        )}
      </div>
    );
  };

  const renderPdfFlowMeasureItem = (item, itemIndex) => {
    let node = null;

    if (item.type === "flight-row") {
      node = (
        <div className="voucher-section voucher-flights-flow voucher-flights-flow--row">
          {renderFlightsGrid({ compact: true, cards: item.cards })}
        </div>
      );
    } else if (item.type === "itinerary-day") {
      node = renderItinerarySection([item.block], {
        placement: "flow",
        showHeader: item.showHeaderReserve,
      });
    } else if (item.type === "info-extra") {
      node = renderInfoExtraSection({
        pageText: item.pageText,
        pageIndex: item.pageIndex,
        chunks: infoExtraFlowPages,
        inline: true,
      });
    } else if (item.type === "payment") {
      node = (
        <div className="voucher-section info-pago-section info-pago-section--flow">
          {renderInfoPagoContent()}
          {renderObservacionesContent()}
        </div>
      );
    } else if (item.type === "terminos") {
      node = renderTerminosSection({
        pageText: item.pageText,
        pageIndex: item.blockIndex || 0,
        chunks: terminosFlowBlocks,
        inline: true,
        sectionKey: `measure-terminos-${itemIndex}`,
      });
    }

    if (!node) return null;

    return (
      <div
        key={`flow-measure-${itemIndex}`}
        className="voucher-flow-measure-item"
        data-flow-measure-item="true"
      >
        {node}
      </div>
    );
  };

  const renderPdfFlowPage = (
    page,
    {
      flowPageIndex,
      showFirstItineraryHeader = false,
      terminosPageIndex = -1,
    } = {},
  ) => {
    const content = [];
    let itineraryBuffer = [];
    let terminosBuffer = [];
    let itineraryHeaderRenderedInPage = false;

    const flushItinerary = () => {
      if (!itineraryBuffer.length) return;
      content.push(
        <Fragment key={`flow-itinerary-${flowPageIndex}-${content.length}`}>
          {renderItinerarySection(itineraryBuffer, {
            placement: "flow",
            showHeader:
              showFirstItineraryHeader && !itineraryHeaderRenderedInPage,
          })}
        </Fragment>,
      );
      itineraryHeaderRenderedInPage = true;
      itineraryBuffer = [];
    };

    const flushTerminos = () => {
      if (!terminosBuffer.length) return;
      content.push(
        renderTerminosSection({
          pageText: terminosBuffer.join("\n\n"),
          pageIndex: Math.max(0, terminosPageIndex),
          chunks: terminosFlowPageTexts.length
            ? terminosFlowPageTexts
            : [terminosText],
          inline: true,
          sectionKey: `flow-terminos-${flowPageIndex}-${content.length}`,
        }),
      );
      terminosBuffer = [];
    };

    page.items.forEach((item, itemIndex) => {
      if (item.type === "itinerary-day") {
        flushTerminos();
        itineraryBuffer.push(item.block);
        return;
      }

      if (item.type === "terminos") {
        flushItinerary();
        terminosBuffer.push(item.pageText);
        return;
      }

      flushItinerary();
      flushTerminos();

      if (item.type === "flight-row") {
        content.push(
          <div
            key={`flow-flight-row-${flowPageIndex}-${item.rowIndex}-${itemIndex}`}
            className="voucher-section voucher-flights-flow voucher-flights-flow--row"
          >
            {renderFlightsGrid({ compact: true, cards: item.cards })}
          </div>,
        );
        return;
      }

      if (item.type === "info-extra") {
        content.push(
          <Fragment key={`flow-info-extra-${flowPageIndex}-${item.pageIndex}`}>
            {renderInfoExtraSection({
              pageText: item.pageText,
              pageIndex: item.pageIndex,
              chunks: infoExtraFlowPages,
              inline: true,
            })}
          </Fragment>,
        );
        return;
      }

      if (item.type === "payment") {
        content.push(
          <div
            key={`flow-payment-${flowPageIndex}-${itemIndex}`}
            className="voucher-section info-pago-section info-pago-section--flow"
          >
            {renderInfoPagoContent()}
            {renderObservacionesContent()}
          </div>,
        );
      }
    });

    flushItinerary();
    flushTerminos();

    return (
      <div
        key={`pdf-flow-page-${flowPageIndex}`}
        className="voucher-a4-page voucher-a4-page--itinerary-days voucher-a4-page--flow"
      >
        {renderVensoServicePageHeader({ compact: true })}
        <div className="voucher-flow-section">{content}</div>
      </div>
    );
  };

  const renderPassengerCard = (pax, globalIndex) => {
    const isChild =
      String(pax.tipo_pasajero || pax.tipoPasajero || "").toLowerCase() ===
        "child" || String(pax.passenger_key || "").startsWith("child");
    const fullName = [
      pax.nombres || "",
      pax.apellido_paterno || String(pax.apellidos || "").split(" ")[0] || "",
      pax.apellido_materno ||
        String(pax.apellidos || "").split(" ").slice(1).join(" ") ||
        "",
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const documentType =
      pax.tipo_documento ||
      pax.tipoDocumento ||
      labels.document.replace(/:$/, "");
    const documentNumber =
      pax.numero_pasaporte ||
      pax.pasaporte ||
      pax.documento ||
      pax.numero_documento ||
      "";
    const birthDate = getPassengerBirthDate(pax);

    return (
      <div
        key={pax.id || pax.pasajero_id || pax.passenger_key || globalIndex}
        className={`voucher-passenger-table__row ${
          isChild ? "is-child" : "is-adult"
        }`}
        data-passenger-card="true"
      >
        <div className="voucher-passenger-table__name">
          <span className="pax-index">{globalIndex + 1}.</span>
          <span className="pax-name">{fullName}</span>
          <span className="pax-type-badge">
            {isChild ? labels.child : labels.adult}
          </span>
        </div>
        <div className="voucher-passenger-table__document">
          <small>{documentType}</small>
          <span>{documentNumber}</span>
        </div>
        <div className="voucher-passenger-table__nationality">
          {pax.pais || pax.nacionalidad || ""}
        </div>
        <div className="voucher-passenger-table__birthdate">
          {birthDate ? formatVoucherShortDate(birthDate, idioma) : ""}
        </div>
      </div>
    );
  };

  const renderPassengerSection = ({
    pagePassengers,
    pageIndex,
    includeTrailingContent,
  }) => (
    <div
      className={`voucher-section voucher-section--intro-passengers${
        pageIndex > 0 ? " voucher-section--passengers-continuation" : ""
      }`}
      data-passenger-page-content="true"
    >
      <div className="voucher-section-title">{labels.passengersData}</div>
      <div className="voucher-passenger-table" data-passenger-grid="true">
        <div className="voucher-passenger-table__head">
          <span>{labels.passengerName.replace(/:$/, "")}</span>
          <span>{labels.document.replace(/:$/, "")}</span>
          <span>{labels.country.replace(/:$/, "")}</span>
          <span>{labels.birthDate.replace(/:$/, "")}</span>
        </div>
        <div className="voucher-passengers-grid">
          {pagePassengers.map((pax, localIndex) =>
            renderPassengerCard(
              pax,
              (passengerPageOffsets[pageIndex] || 0) + localIndex,
            ),
          )}
        </div>
      </div>

      {includeTrailingContent && (
        <div data-passenger-page-trailing="true">
          {renderVoucherPhoneRow()}
          {shouldPlaceFlightsAfterPassengers && hasAnyFlights && (
            <div
              className="voucher-section voucher-a4-page--flights voucher-a4-page--flights-inline"
              data-passenger-inline-flights="true"
            >
              {inlineFlightRows.map((row) => (
                <div className="voucher-flight-row" key={row.key}>
                  {renderFlightsGrid({ compact: true, cards: row.cards })}
                </div>
              ))}
            </div>
          )}
          {renderInlineItineraryBlocks(introInlineItineraryBlocks, "intro")}
        </div>
      )}
    </div>
  );

  return (
    <div className="voucher-layout venso-service-voucher-template">
      {/* ——— Flight Submodal ——— */}
      {flightSubmodal.open && (
        <div
          className="flight-submodal-overlay"
          onClick={handleCloseFlightSubmodal}
        >
          <div className="flight-submodal" onClick={(e) => e.stopPropagation()}>
            <div className="flight-submodal-header">
              <h3>
                {flightSubmodal.type === "internacional"
                  ? labels.addInternationalFlight
                  : labels.addNationalFlight}
              </h3>
              <button
                className="btn-close-sub"
                onClick={handleCloseFlightSubmodal}
              ></button>
            </div>
            <div className="flight-submodal-body">
              <div className="form-row">
                <label>{labels.airline}</label>
                <input
                  type="text"
                  name="airline"
                  value={flightForm.airline}
                  onChange={handleFlightFormChange}
                  placeholder="Ej. LATAM"
                />
              </div>
              <div className="form-row">
                <label>{labels.from}</label>
                <input
                  type="text"
                  name="from"
                  value={flightForm.from}
                  onChange={handleFlightFormChange}
                  placeholder={labels.originPlaceholder}
                />
              </div>
              <div className="form-row">
                <label>{labels.to}</label>
                <input
                  type="text"
                  name="to"
                  value={flightForm.to}
                  onChange={handleFlightFormChange}
                  placeholder={labels.destinationPlaceholder}
                />
              </div>
              <div className="form-row">
                <label>{labels.flightNumber}</label>
                <input
                  type="text"
                  name="flightNumber"
                  value={flightForm.flightNumber}
                  onChange={handleFlightFormChange}
                  placeholder="Ej. LA2445"
                />
              </div>
              <div className="form-row">
                <label>{labels.date}</label>
                <input
                  type="date"
                  name="date"
                  value={flightForm.date}
                  onChange={handleFlightFormChange}
                />
              </div>
              <div className="form-row">
                <label>{labels.departureTime}</label>
                <input
                  type="time"
                  name="depTime"
                  value={flightForm.depTime}
                  onChange={handleFlightFormChange}
                />
              </div>
              <div className="form-row">
                <label>{labels.arrivalTime}</label>
                <input
                  type="time"
                  name="arrTime"
                  value={flightForm.arrTime}
                  onChange={handleFlightFormChange}
                />
              </div>
            </div>
            <div className="flight-submodal-footer">
              <button
                className="btn-secondary"
                onClick={handleCloseFlightSubmodal}
              >
                {labels.cancel}
              </button>
              <button
                className="btn-primary"
                onClick={handleSaveFlightSubmodal}
              >
                {labels.saveFlight}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="voucher-page-actions" data-voucher-editor-controls="true">
        <button
          type="button"
          className="voucher-page-actions__button voucher-page-actions__button--international"
          onClick={() => handleOpenFlightSubmodal("internacional")}
          title={labels.addInternationalFlight}
        >
          <span className="voucher-page-actions__icon" aria-hidden="true">
            <MdPublic size={16} />
            <MdAdd size={11} className="voucher-page-actions__icon-add" />
          </span>
          <span>{labels.addInternationalFlightButton}</span>
        </button>
        <button
          type="button"
          className="voucher-page-actions__button voucher-page-actions__button--national"
          onClick={() => handleOpenFlightSubmodal("nacional")}
          title={labels.addNationalFlight}
        >
          <span className="voucher-page-actions__icon" aria-hidden="true">
            <MdFlightTakeoff size={16} />
            <MdAdd size={11} className="voucher-page-actions__icon-add" />
          </span>
          <span>{labels.addNationalFlightButton}</span>
        </button>
        {!hasObservacionesText && !showObservacionesEditor && (
          <button
            type="button"
            className="voucher-page-actions__button voucher-page-actions__button--observaciones"
            onClick={() => setShowObservacionesEditor(true)}
            title={labels.addObservations}
          >
            <span className="voucher-page-actions__icon" aria-hidden="true">
              <MdNotes size={16} />
              <MdAdd size={11} className="voucher-page-actions__icon-add" />
            </span>
            <span>{labels.addObservations}</span>
          </button>
        )}
      </div>

      <div
        ref={(node) => {
          passengerPageRefs.current[0] = node;
        }}
        className="voucher-a4-page voucher-a4-page--intro"
        data-passenger-page-index="0"
      >
        {renderVensoServicePageHeader({ compact: false })}

        {/* Montos */}
        <div className="voucher-amount-row">
          <div className="voucher-amount-box">
            <div className="label">{labels.totalPackageAmount}</div>
            <div className="value">
              {totalCotizacion ? `$ ${totalCotizacion.toFixed(2)}` : ""}
            </div>
          </div>
          <div className="voucher-amount-box">
            <div className="label">{labels.paidAmount}</div>
            <div className="value">
              {totalPagado ? `$ ${totalPagado.toFixed(2)}` : ""}
            </div>
          </div>
          <div className="voucher-amount-box">
            <div className="label">{labels.pendingAmount}</div>
            <div className="value">
              {pendiente ? `$ ${pendiente.toFixed(2)}` : ""}
            </div>
          </div>
          <div className="voucher-amount-box">
            <div className="label">{labels.paymentSystem}</div>
            <div
              ref={paymentSystemRef}
              className="value voucher-payment-system editable-field"
              contentEditable={!!onDatosPdfChange}
              suppressContentEditableWarning
              data-placeholder={labels.paymentSystem.replace(/:$/, "")}
              onInput={(e) =>
                handleEditableInput(e, () =>
                  onDatosPdfTouch?.({
                    scope: "general",
                    field: "paymentSystem",
                    value: e.currentTarget.textContent || "",
                  }),
                )
              }
              onBlur={(e) =>
                onDatosPdfChange?.({
                  scope: "general",
                  field: "paymentSystem",
                  value: e.currentTarget.textContent || "",
                })
              }
            />
          </div>
        </div>

        {/* Datos generales */}
        <div className="voucher-general-info">
          <div className="voucher-row">
            <div className="cell">
              <span className="label">{labels.bookingCode}</span>
              <span className="value">{voucher.voucher_code || ""}</span>
            </div>
            <div className="cell">
              <span className="label">{labels.passengerName}</span>
              <span className="value">{mainPassengerFullName}</span>
            </div>
            <div className="cell">
              <span className="label">{labels.tourStartDate}</span>
              <span className="value">{formattedStartDate}</span>
            </div>
          </div>
        </div>

        {/* Hotel / Tren / Ingreso (resumen rápido) */}
        <div className="voucher-hotel-train-row">
          <div className="cell">
            <span className="label">{labels.hotel}</span>
            <span className="value">{hotelNombre}</span>
            {hotelCategoria && (
              <>
                <span className="label">{labels.categories}</span>
                <span className="value">{hotelCategoria}</span>
              </>
            )}
          </div>
          <div className="cell">
            <span className="label">{labels.roomType}</span>
            <span className="value">{hotelTipoHab}</span>
            <div
              className="voucher-inline-note editable-field"
              contentEditable={!!onDatosPdfChange}
              suppressContentEditableWarning
              data-placeholder={labels.roomExtraPlaceholder}
              onKeyDown={handleEditableMultilineKeyDown}
              onPaste={handleEditablePlainTextPaste}
              onInput={(e) =>
                handleEditableInput(e, () =>
                  onDatosPdfTouch?.({
                    scope: "hotel_train",
                    field: "habitacionExtra",
                    value: normalizeEditableNewlines(
                      e.currentTarget.textContent ?? "",
                    ),
                  }),
                )
              }
              onBlur={(e) =>
                onDatosPdfChange?.({
                  scope: "hotel_train",
                  field: "habitacionExtra",
                  value: normalizeEditableNewlines(
                    e.currentTarget.textContent ?? "",
                  ),
                })
              }
            >
              {hotelRoomExtra}
            </div>
          </div>
          <div className="cell cell-tren">
            <span className="label">{labels.trainService}</span>
            <span className="value">{trenNombre}</span>
            <span className="label">{labels.trainType}</span>
            <div
              ref={trainTypeRef}
              className="value voucher-train-editable editable-field"
              contentEditable={!!onDatosPdfChange}
              suppressContentEditableWarning
              data-placeholder={labels.trainTypePlaceholder}
              onKeyDown={handleEditableSingleLineKeyDown}
              onPaste={handleEditablePlainTextPaste}
              onInput={(e) =>
                handleEditableInput(e, () =>
                  onDatosPdfTouch?.({
                    scope: "hotel_train",
                    field: "trenTipo",
                    value: normalizeEditableNewlines(
                      e.currentTarget.textContent ?? "",
                    ),
                  }),
                )
              }
              onBlur={(e) =>
                onDatosPdfChange?.({
                  scope: "hotel_train",
                  field: "trenTipo",
                  value: normalizeEditableNewlines(
                    e.currentTarget.textContent ?? "",
                  ),
                })
              }
            />
            <span className="label">{labels.route}</span>
            <div
              ref={trainRouteRef}
              className="value voucher-train-editable editable-field"
              contentEditable={!!onDatosPdfChange}
              suppressContentEditableWarning
              data-placeholder={labels.trainRoutePlaceholder}
              onKeyDown={handleEditableSingleLineKeyDown}
              onPaste={handleEditablePlainTextPaste}
              onInput={(e) =>
                handleEditableInput(e, () =>
                  onDatosPdfTouch?.({
                    scope: "hotel_train",
                    field: "trenRuta",
                    value: normalizeEditableNewlines(
                      e.currentTarget.textContent ?? "",
                    ),
                  }),
                )
              }
              onBlur={(e) =>
                onDatosPdfChange?.({
                  scope: "hotel_train",
                  field: "trenRuta",
                  value: normalizeEditableNewlines(
                    e.currentTarget.textContent ?? "",
                  ),
                })
              }
            />
          </div>
          <div className="cell">
            <span className="label">{labels.entranceType}</span>
            <div
              className="voucher-inline-note editable-field"
              contentEditable={!!onDatosPdfChange}
              suppressContentEditableWarning
              data-placeholder={labels.entranceExtraPlaceholder}
              onKeyDown={handleEditableMultilineKeyDown}
              onPaste={handleEditablePlainTextPaste}
              onInput={(e) =>
                handleEditableInput(e, () =>
                  onDatosPdfTouch?.({
                    scope: "hotel_train",
                    field: "tipoIngresoExtra",
                    value: normalizeEditableNewlines(
                      e.currentTarget.textContent ?? "",
                    ),
                  }),
                )
              }
              onBlur={(e) =>
                onDatosPdfChange?.({
                  scope: "hotel_train",
                  field: "tipoIngresoExtra",
                  value: normalizeEditableNewlines(
                    e.currentTarget.textContent ?? "",
                  ),
                })
              }
            >
              {ingresoExtra}
            </div>
          </div>
        </div>

        {/* PASAJEROS */}
        {(passengerPages[0] || []).length > 0 &&
          renderPassengerSection({
            pagePassengers: passengerPages[0] || [],
            pageIndex: 0,
            includeTrailingContent: passengerPages.length === 1,
          })}
      </div>

      {passengerPages.slice(1).map((pagePassengers, continuationIndex) => {
        const pageIndex = continuationIndex + 1;
        return (
          <div
            key={`voucher-passengers-page-${pageIndex}`}
            ref={(node) => {
              passengerPageRefs.current[pageIndex] = node;
            }}
            className="voucher-a4-page voucher-a4-page--passengers"
            data-passenger-page-index={pageIndex}
          >
            {renderVensoServicePageHeader({ compact: true })}
            {renderPassengerSection({
              pagePassengers,
              pageIndex,
              includeTrailingContent: pageIndex === passengerPages.length - 1,
            })}
          </div>
        );
      })}

      {/* FLUJO PAGINADO: itinerario + incluye/no incluye + pago + términos */}
      {itineraryPageData.length === 0 && (
        <div className="voucher-itinerary-empty">
          {labels.noItinerary}
        </div>
      )}

      <div
        ref={flowMeasureRef}
        className="voucher-flow-measure voucher-a4-page--flow"
        aria-hidden="true"
      >
        {pdfFlowItems.map(renderPdfFlowMeasureItem)}
      </div>

      {(() => {
        let flowItineraryHeaderRendered = hasInlineItineraryHeader;
        let flowTerminosPageIndex = 0;

        return effectivePdfFlowPages.map((page, flowPageIndex) => {
          const hasItineraryItems = page.items.some(
            (item) => item.type === "itinerary-day",
          );
          const hasTerminosItems = page.items.some(
            (item) => item.type === "terminos",
          );
          const showFirstItineraryHeader =
            hasItineraryItems && !flowItineraryHeaderRendered;

          if (hasItineraryItems) {
            flowItineraryHeaderRendered = true;
          }

          const terminosPageIndex = hasTerminosItems
            ? flowTerminosPageIndex++
            : -1;

          return renderPdfFlowPage(page, {
            flowPageIndex,
            showFirstItineraryHeader,
            terminosPageIndex,
          });
        });
      })()}
    </div>
  );
};

/* ======================= MODAL PRINCIPAL ======================= */

const VentasSummaryPDFModal = ({
  isOpen,
  onClose,
  voucher,
  onVoucherUpdated,
}) => {
  const [loading, setLoading] = useState(true);
  const [voucherData, setVoucherData] = useState(null);
  const [passengers, setPassengers] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [loadingMovimientos, setLoadingMovimientos] = useState(false);
  const [showMovimientoPreview, setShowMovimientoPreview] = useState(false);
  const [selectedMovimiento, setSelectedMovimiento] = useState(null);
  const [activeTab, setActiveTab] = useState("voucher");
  const [previewImage, setPreviewImage] = useState(null);
  const [showImagePreview, setShowImagePreview] = useState(false);

  // NEW: vuelos_externos locales (desde DB)
  const [externalFlights, setExternalFlights] = useState([]);

  // Datos editables del PDF (overrides de títulos, nombres de servicio, etc.)
  const [datosPdf, setDatosPdf] = useState({});
  const [savedDatosPdf, setSavedDatosPdf] = useState({});
  const [datosPdfDirty, setDatosPdfDirty] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
  const [changingIdioma, setChangingIdioma] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({
    current: 0,
    total: 0,
  });
  const latestDatosPdfRef = useRef({});
  const printAreaRef = useRef(null);

  const ventasSummaryPdfCacheKey = useMemo(
    () =>
      [
        voucherData?.id || voucher?.id || "voucher",
        voucherData?.updatedat || voucherData?.updated_at || "",
        datosPdf?.idioma || voucherData?.idioma || "es",
        hashVentasSummaryPdfText(
          JSON.stringify({
            voucherData,
            passengers,
            externalFlights,
            datosPdf,
            movimientos,
          }),
        ),
      ].join("@@"),
    [voucher?.id, voucherData, passengers, externalFlights, datosPdf, movimientos],
  );

  useEffect(() => {
    if (!isOpen) return;
    preloadVentasSummaryStaticAssets().catch(() => undefined);
  }, [isOpen]);

  const yieldToBrowser = () =>
    new Promise((resolve) => {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    });

  const getPdfCaptureScale = (pageCount) => {
    if (pageCount >= 12) return 1.5;
    if (pageCount >= 8) return 1.75;
    if (pageCount >= 5) return 2.0;
    return 2.5;
  };

  const canvasToJpegBytes = (canvas, quality = 0.98) =>
    new Promise((resolve, reject) => {
      if (!canvas) {
        reject(new Error("Canvas no disponible"));
        return;
      }

      if (typeof canvas.toBlob === "function") {
        canvas.toBlob(
          async (blob) => {
            if (!blob) {
              reject(new Error("No se pudo convertir la página a imagen"));
              return;
            }
            try {
              resolve(new Uint8Array(await blob.arrayBuffer()));
            } catch (error) {
              reject(error);
            }
          },
          "image/jpeg",
          quality,
        );
        return;
      }

      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const base64 = dataUrl.split(",")[1] || "";
      const raw = atob(base64);
      const bytes = new Uint8Array(raw.length);
      for (let index = 0; index < raw.length; index += 1) {
        bytes[index] = raw.charCodeAt(index);
      }
      resolve(bytes);
    });

  const getRelativeRect = (node, ancestor, scale = 1) => {
    const rect = node.getBoundingClientRect();
    const ancestorRect = ancestor.getBoundingClientRect();
    return {
      x: Math.max(0, Math.round((rect.left - ancestorRect.left) * scale)),
      y: Math.max(0, Math.round((rect.top - ancestorRect.top) * scale)),
      width: Math.max(1, Math.round(rect.width * scale)),
      height: Math.max(1, Math.round(rect.height * scale)),
    };
  };

  const sliceCanvasToJpegBytes = async (sourceCanvas, rect, quality = 0.98) => {
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = Math.max(
      1,
      Math.min(sourceCanvas.width - rect.x, Math.max(1, rect.width)),
    );
    pageCanvas.height = Math.max(
      1,
      Math.min(sourceCanvas.height - rect.y, Math.max(1, rect.height)),
    );

    const ctx = pageCanvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("No se pudo preparar el canvas de página");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(
      sourceCanvas,
      rect.x,
      rect.y,
      pageCanvas.width,
      pageCanvas.height,
      0,
      0,
      pageCanvas.width,
      pageCanvas.height,
    );

    return canvasToJpegBytes(pageCanvas, quality);
  };

  const buildCaptureOptions = (captureScale) => ({
    pixelRatio: captureScale,
    cacheBust: false,
    includeQueryParams: true,
    skipFonts: true,
    style: {
      boxShadow: "none",
      borderRadius: "0",
      margin: "0",
      transform: "none",
    },
  });

  const waitForImagesToLoad = async (rootNode) => {
    const images = Array.from(rootNode?.querySelectorAll("img") || []);
    await Promise.all(
      images.map(
        (img) =>
          new Promise((resolve) => {
            img.removeAttribute("srcset");
            img.setAttribute("loading", "eager");
            img.setAttribute("decoding", "sync");
            img.setAttribute("fetchpriority", "high");

            if (img.complete && (img.naturalWidth || img.naturalHeight)) {
              resolve();
              return;
            }
            const timer = setTimeout(resolve, 5000);
            img.onload = () => {
              clearTimeout(timer);
              resolve();
            };
            img.onerror = () => {
              clearTimeout(timer);
              resolve();
            };
          }),
      ),
    );
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  };

  const inlineVentasSummaryImages = async (rootNode) => {
    const images = Array.from(rootNode?.querySelectorAll("img") || []);
    await Promise.allSettled(
      images.map(async (img) => {
        const rawSrc = img.getAttribute("src") || img.currentSrc || "";
        if (!rawSrc || /^data:|^blob:/i.test(rawSrc)) return;

        const dataUrl = await fetchVentasSummaryImageAsDataUrl(rawSrc);
        if (!dataUrl) return;
        img.removeAttribute("srcset");
        img.removeAttribute("sizes");
        img.setAttribute("crossorigin", "anonymous");
        img.setAttribute("loading", "eager");
        img.setAttribute("decoding", "sync");
        img.src = dataUrl;
      }),
    );
  };

  const captureVoucherPagesInBatches = async (exportPages, captureOptions) => {
    const pageImageBytes = new Array(exportPages.length);
    for (let start = 0; start < exportPages.length; start += VENTAS_SUMMARY_CAPTURE_BATCH_SIZE) {
      const batch = exportPages.slice(start, start + VENTAS_SUMMARY_CAPTURE_BATCH_SIZE);
      const batchBytes = await Promise.all(
        batch.map(async (page) => {
          const canvas = await toCanvas(page, captureOptions);
          return canvasToJpegBytes(canvas);
        }),
      );
      batchBytes.forEach((bytes, offset) => {
        pageImageBytes[start + offset] = bytes;
      });
      setDownloadProgress({
        current: Math.min(start + batch.length, exportPages.length),
        total: exportPages.length,
      });
      await yieldToBrowser();
    }
    return pageImageBytes;
  };

  const createPdfFromPageImages = async (pageImageBytes = []) => {
    const pdfDoc = await PDFDocument.create();
    const pageWidth = 595.28;
    const pageHeight = 841.89;

    for (let pageIndex = 0; pageIndex < pageImageBytes.length; pageIndex += 1) {
      const pageImage = await pdfDoc.embedJpg(pageImageBytes[pageIndex]);
      const pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);
      pdfPage.drawImage(pageImage, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });
    }

    return pdfDoc.save({ useObjectStreams: true });
  };

  const downloadPdfBytes = (pdfBytes, filename) => {
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleDownloadPdf = async () => {
    const printableNode = printAreaRef.current;
    if (!printableNode) return;

    const cachedPdf = VENTAS_SUMMARY_PDF_CACHE.get(ventasSummaryPdfCacheKey);
    const directVoucherCode =
      voucherData?.voucher_code || voucher?.voucher_code || "voucher";
    if (cachedPdf?.pdfBytes) {
      downloadPdfBytes(cachedPdf.pdfBytes, `${directVoucherCode}.pdf`);
      return;
    }

    setDownloadingPdf(true);
    setDownloadProgress({ current: 0, total: 0 });
    await preloadVentasSummaryStaticAssets();
    await yieldToBrowser();

    let captureHost = null;

    try {
      const captureWidth = Math.ceil(
        printableNode.querySelector(".voucher-layout")?.getBoundingClientRect()
          .width ||
          printableNode.getBoundingClientRect().width ||
          printableNode.scrollWidth,
      );

      captureHost = document.createElement("div");
      captureHost.style.position = "fixed";
      captureHost.style.left = "-20000px";
      captureHost.style.top = "0";
      captureHost.style.width = `${captureWidth}px`;
      captureHost.style.background = "#ffffff";
      captureHost.style.zIndex = "-1";

      const captureNode = printableNode.cloneNode(true);

      captureNode
        .querySelectorAll(
          ".form-actions, .btn-sm, .flight-submodal-overlay, .voucher-page-actions, .voucher-observaciones-box--draft-empty",
        )
        .forEach((el) => el.remove());
      const captureShell = document.createElement("div");
      captureShell.className = "ventas-pdf-modal pdf-export-shell";
      captureShell.style.width = `${captureWidth}px`;
      captureShell.style.maxHeight = "none";
      captureShell.style.height = "auto";
      captureShell.style.overflow = "visible";
      captureShell.style.background = "#ffffff";
      captureShell.style.boxShadow = "none";
      captureShell.style.borderRadius = "0";

      captureNode.style.width = `${captureWidth}px`;
      captureNode.style.maxHeight = "none";
      captureNode.style.height = "auto";
      captureNode.style.overflow = "visible";
      captureNode.style.boxShadow = "none";
      captureNode.style.borderRadius = "0";
      captureNode.style.background = "#ffffff";

      captureShell.appendChild(captureNode);
      captureHost.appendChild(captureShell);
      document.body.appendChild(captureHost);
      await inlineVentasSummaryImages(captureShell);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await waitForImagesToLoad(captureShell);

      const pageNodes = Array.from(
        captureShell.querySelectorAll(".voucher-a4-page, .voucher-page-break"),
      ).filter((node, index, nodes) => {
        const duplicateAncestor = nodes.some(
          (candidate, candidateIndex) =>
            candidateIndex !== index && candidate.contains(node),
        );
        return !duplicateAncestor;
      });
      const exportPages = pageNodes.length > 0 ? pageNodes : [captureNode];
      const captureScale = getPdfCaptureScale(exportPages.length);
      const captureOptions = buildCaptureOptions(captureScale);
      setDownloadProgress({ current: 0, total: exportPages.length });
      await yieldToBrowser();

      let pageImageBytes = [];
      const shouldUseSingleCanvas =
        exportPages.length <= 5 && captureScale <= 1.5;

      if (shouldUseSingleCanvas) {
        try {
          const fullCanvas = await toCanvas(captureNode, captureOptions);
          pageImageBytes = [];

          for (
            let pageIndex = 0;
            pageIndex < exportPages.length;
            pageIndex += 1
          ) {
            const rect = getRelativeRect(
              exportPages[pageIndex],
              captureNode,
              captureScale,
            );
            pageImageBytes.push(
              await sliceCanvasToJpegBytes(fullCanvas, rect),
            );
            setDownloadProgress({
              current: pageIndex + 1,
              total: exportPages.length,
            });
            if (pageIndex % 3 === 2) await yieldToBrowser();
          }
        } catch (singleCanvasError) {
          console.warn(
            "Fallo la captura rápida del voucher; se usará captura por página.",
            singleCanvasError,
          );
          pageImageBytes = [];
        }
      }

      if (pageImageBytes.length !== exportPages.length) {
        pageImageBytes = await captureVoucherPagesInBatches(
          exportPages,
          captureOptions,
        );
      }

      const directPdfBytes = await createPdfFromPageImages(pageImageBytes);
      putVentasSummaryPdfCache(ventasSummaryPdfCacheKey, directPdfBytes);
      downloadPdfBytes(directPdfBytes, `${directVoucherCode}.pdf`);
    } catch (error) {
      console.error("Error al descargar PDF del voucher:", error);
      toast.error("No se pudo descargar el PDF del voucher");
    } finally {
      if (captureHost?.parentNode) {
        captureHost.parentNode.removeChild(captureHost);
      }
      setDownloadingPdf(false);
      setDownloadProgress({ current: 0, total: 0 });
    }
  };

  // Cargar datos completos del voucher (incluye vuelos_externos)
  useEffect(() => {
    if (!isOpen || !voucher?.id) return;

    const loadAllData = async () => {
      setLoading(true);
      try {
        const voucherResponse =
          await voucherVentaService.getVoucherWithCotizacionById(voucher.id, {
            skipCache: true,
          });
        const rawVoucherData = voucherResponse.data || {};
        const embeddedCotizacion =
          rawVoucherData.cotizacion_data || rawVoucherData.cotizacion || {};
        const cotizacionId =
          rawVoucherData.cotizacion_id ||
          rawVoucherData.id_cotizacion ||
          embeddedCotizacion.id ||
          embeddedCotizacion.cotizacion_id;

        let hydratedCotizacion = embeddedCotizacion;
        if (cotizacionId) {
          try {
            hydratedCotizacion = await hydrateCotizacionPricingContext(
              {
                ...embeddedCotizacion,
                id: embeddedCotizacion.id || cotizacionId,
              },
              { skipCache: true },
            );
          } catch (cotizacionError) {
            console.warn(
              "No se pudo hidratar la cotización completa del voucher; se usará el contexto embebido:",
              cotizacionError,
            );
          }
        }
        const vd = {
          ...rawVoucherData,
          cotizacion_data: hydratedCotizacion,
          cotizacion: hydratedCotizacion,
        };
        setVoucherData(vd);

        // Parsear vuelos_externos (puede venir como JSON string o array)
        let ext = [];
        const raw = vd?.vuelos_externos;
        if (Array.isArray(raw)) {
          ext = raw;
        } else if (typeof raw === "string" && raw.trim()) {
          try {
            ext = JSON.parse(raw);
          } catch {
            ext = [];
          }
        }
        setExternalFlights(ext || []);

        const passengersData =
          await pasajeroService.getPassengersByVoucherVenta(voucher.id);
        const normalizedPassengers = (passengersData || []).map((passenger) => ({
          ...passenger,
          fecha_nacimiento: getPassengerBirthDate(passenger),
        }));
        setPassengers(normalizedPassengers);

        // Sin snapshot se genera la base natural. Con datos_pdf, el snapshot manda.
        // Los telefonos se hidratan una sola vez para comparar contra el snapshot correcto.
        const normalizedDatosPdf = hydrateDatosPdfPhoneFields(
          normalizeDatosPdf(vd?.datos_pdf, vd),
          normalizedPassengers[0] || {},
        );
        setDatosPdf(normalizedDatosPdf);
        setSavedDatosPdf(normalizedDatosPdf);
        latestDatosPdfRef.current = normalizedDatosPdf;
        setDatosPdfDirty(false);

        const documentsResponse =
          await voucherDocumentService.getDocumentsByVoucherId(voucher.id);
        if (documentsResponse.success && documentsResponse.data) {
          const backendDocs =
            documentsResponse.data.data || documentsResponse.data;
          const allDocs = [];
          if (backendDocs.passports) {
            backendDocs.passports.forEach((doc) =>
              allDocs.push({ ...doc, documentoTipo: "passport" }),
            );
          }
          if (backendDocs.idCards) {
            backendDocs.idCards.forEach((doc) =>
              allDocs.push({ ...doc, documentoTipo: "idcard" }),
            );
          }
          if (backendDocs.otherDocuments) {
            backendDocs.otherDocuments.forEach((doc) =>
              allDocs.push({ ...doc, documentoTipo: "other" }),
            );
          }
          setDocuments(allDocs);
        }
      } catch (error) {
        console.error("Error cargando datos:", error);
      } finally {
        setLoading(false);
      }
    };

    loadAllData();
  }, [isOpen, voucher?.id]);

  // Cargar movimientos (pagos)
  useEffect(() => {
    if (!isOpen || !voucher?.id) return;

    const loadMovimientos = async () => {
      setLoadingMovimientos(true);
      try {
        const response = await contabilidadService.getMovimientos();
        setMovimientos(
          filterVoucherPaymentMovements(response.data || [], voucher),
        );
      } catch (error) {
        console.error("Error cargando movimientos:", error);
        setMovimientos([]);
      } finally {
        setLoadingMovimientos(false);
      }
    };

    loadMovimientos();
  }, [isOpen, voucher?.id]);

  // Totales derivados exclusivamente de cotización + movimientos.
  const paymentSummary = useMemo(() => {
    const summary = summarizeVoucherFinancials({
      voucher: voucherData || voucher,
      cotizacion: voucherData?.cotizacion_data || voucher?.cotizacion_data,
      movimientos,
    });
    const subtotalCotizacion = parseFloat(
      voucherData?.cotizacion_data?.subtotal_final ||
        voucherData?.cotizacion_data?.subtotalFinal ||
        voucherData?.cotizacion_data?.additionalcosts?.subtotalFinal ||
        voucherData?.cotizacion_data?.additionalCosts?.subtotalFinal ||
        voucherData?.cotizacion_data?.additionalcosts?.commissionableSubtotal ||
        voucherData?.cotizacion_data?.additionalCosts?.commissionableSubtotal ||
        0,
    );
    const metodoPago =
      movimientos.length > 0 ? movimientos[0].metodo_pago || "" : "";

    return {
      totalPagado: summary.totalPaid,
      totalCotizacion: summary.totalFinal,
      subtotalCotizacion: Number.isFinite(subtotalCotizacion)
        ? subtotalCotizacion
        : 0,
      pendiente: summary.remainingAmount,
      estado:
        summary.paymentStatus === "completed"
          ? "Pagado"
          : summary.paymentStatus === "partial"
            ? "Parcial"
            : "Pendiente",
      metodoPago,
    };
  }, [movimientos, voucherData, voucher]);

  const buildExternalFlightPayload = (
    flightFlat = {},
    procedencia = "nacional",
    extra = {},
  ) => ({
    airline: flightFlat.airline || "",
    from: flightFlat.from || "",
    to: flightFlat.to || "",
    route: flightFlat.route || "",
    flightClass: flightFlat.flightClass || "",
    flightNumber: flightFlat.flightNumber || "",
    date: flightFlat.date || "",
    depTime: flightFlat.depTime || "",
    arrTime: flightFlat.arrTime || "",
    baggage: flightFlat.baggage || "",
    procedencia,
    parentService: {
      ...(flightFlat.parentService || {}),
      procedencia,
    },
    childService: {
      ...(flightFlat.childService || {}),
      procedencia,
    },
    nombre:
      flightFlat.nombre ||
      (procedencia === "internacional"
        ? "Vuelo Internacional (externo)"
        : "Vuelo Nacional (externo)"),
    ...extra,
  });

  const persistExternalFlights = async (next) => {
    if (!voucher?.id) return;

    if (typeof voucherVentaService?.updateVuelosExternos === "function") {
      await voucherVentaService.updateVuelosExternos(voucher.id, next);
    } else if (typeof voucherVentaService?.updateVoucher === "function") {
      await voucherVentaService.updateVoucher(voucher.id, {
        vuelos_externos: next,
      });
    }

    setExternalFlights(next);
    setVoucherData((prev) => {
      const vd = prev ? { ...prev } : {};
      vd.vuelos_externos = next;
      return vd;
    });
  };

  // Guardar vuelo manual en voucher_ventas.vuelos_externos.
  const handleAddFlight = async (flightFlat, procedencia) => {
    const next = [
      ...(externalFlights || []),
      buildExternalFlightPayload(flightFlat, procedencia),
    ];

    try {
      await persistExternalFlights(next);
    } catch (e) {
      console.error("No se pudo guardar vuelos_externos:", e);
      setExternalFlights(next);
    }
  };

  const handleAddInternationalFlight = (flightFlat) =>
    handleAddFlight(flightFlat, "internacional");

  const handleAddNationalFlight = (flightFlat) =>
    handleAddFlight(flightFlat, "nacional");

  const handleUpdateExternalFlight = async (externalIndex, field, value) => {
    const index = Number(externalIndex);
    if (!Number.isInteger(index) || !(externalFlights || [])[index]) return;

    const current = externalFlights[index];
    const procedencia =
      current.procedencia ||
      current.parentService?.procedencia ||
      current.childService?.procedencia ||
      "nacional";
    const next = (externalFlights || []).map((flight, i) => {
      if (i !== index) return flight;

      return buildExternalFlightPayload(
        {
          ...flight,
          [field]: value,
        },
        procedencia,
        {
          source: flight.source || flight.source_type,
          sourceFlightKey:
            flight.sourceFlightKey || flight.source_flight_key || "",
          source_flight_key:
            flight.source_flight_key || flight.sourceFlightKey || "",
          sourceItinerarioServicioId:
            flight.sourceItinerarioServicioId ||
            flight.source_itinerario_servicio_id ||
            null,
          source_itinerario_servicio_id:
            flight.source_itinerario_servicio_id ||
            flight.sourceItinerarioServicioId ||
            null,
        },
      );
    });

    try {
      await persistExternalFlights(next);
    } catch (e) {
      console.error("No se pudo actualizar vuelos_externos:", e);
    }
  };

  const handleRemoveExternalFlight = async (externalIndex) => {
    const index = Number(externalIndex);
    if (!Number.isInteger(index) || !(externalFlights || [])[index]) return;

    const next = (externalFlights || []).filter((_, i) => i !== index);

    try {
      await persistExternalFlights(next);
    } catch (e) {
      console.error("No se pudo quitar vuelos_externos:", e);
      setExternalFlights(next);
      setVoucherData((prev) => {
        const vd = prev ? { ...prev } : {};
        vd.vuelos_externos = next;
        return vd;
      });
    }
  };

  const handleUpsertFlightOverride = async (
    flight,
    field,
    value,
    procedenciaFallback = "nacional",
  ) => {
    const info = extractFlightInfo(flight);
    const sourceFlightKey = getFlightSourceKey(flight);
    const stableId = getServiceStableId(flight);
    const procedencia =
      procedenciaFallback ||
      (isInternational(flight) ? "internacional" : "nacional");

    const payload = buildExternalFlightPayload(
      {
        airline: info.airline,
        from: info.from,
        to: info.to,
        route: info.route,
        flightClass: info.flightClass,
        flightNumber: info.flightNumber,
        date: toIsoDate(info.date, info.date || ""),
        depTime: info.depTime,
        arrTime: info.arrTime,
        baggage: info.baggage,
        [field]: value,
      },
      procedencia,
      {
        source: "itinerary_override",
        sourceFlightKey,
        source_flight_key: sourceFlightKey,
        sourceItinerarioServicioId: stableId ?? null,
        source_itinerario_servicio_id: stableId ?? null,
      },
    );

    const existingIndex = (externalFlights || []).findIndex(
      (item) =>
        String(item.sourceFlightKey || item.source_flight_key || "") ===
        sourceFlightKey,
    );
    const next =
      existingIndex >= 0
        ? (externalFlights || []).map((item, i) =>
            i === existingIndex ? { ...item, ...payload } : item,
          )
        : [...(externalFlights || []), payload];

    try {
      await persistExternalFlights(next);
    } catch (e) {
      console.error("No se pudo guardar override de vuelo:", e);
    }
  };

  const handleVoucherIdiomaChange = async (targetIdioma) => {
    const normalizedTarget = targetIdioma === "en" || targetIdioma === "pt" ? targetIdioma : "es";
    const currentSnapshot = syncDatosPdfCurrentLanguageVersion(
      latestDatosPdfRef.current || datosPdf || {},
    );
    const currentIdioma = getDatosPdfIdioma(currentSnapshot);

    if (normalizedTarget === currentIdioma || changingIdioma) return;

    if (
      document.activeElement instanceof HTMLElement &&
      document.activeElement.isContentEditable
    ) {
      document.activeElement.blur();
    }

    setChangingIdioma(true);
    try {
      const currentContent = stripDatosPdfLanguageMetadata(currentSnapshot);
      const versions = normalizeDatosPdfLanguageVersions(currentSnapshot);
      const versionsWithCurrent = {
        ...versions,
        [currentIdioma]: currentContent,
      };
      const sourceSpanish =
        versionsWithCurrent.es ||
        (currentIdioma === "es" ? currentContent : stripDatosPdfLanguageMetadata(datosPdf));

      let nextContent = versionsWithCurrent[normalizedTarget];

      if (!nextContent) {
        nextContent =
          normalizedTarget === "es"
            ? sourceSpanish
            : await translateDatosPdfSnapshot(sourceSpanish, normalizedTarget);
      }

      const nextDatosPdf = attachDatosPdfLanguageMetadata(
        nextContent,
        normalizedTarget,
        {
          ...versionsWithCurrent,
          [normalizedTarget]: nextContent,
        },
      );

      latestDatosPdfRef.current = nextDatosPdf;
      setDatosPdf(nextDatosPdf);
      setDatosPdfDirty(!areDatosPdfEqual(nextDatosPdf, savedDatosPdf));
    } catch (error) {
      console.error("No se pudo cambiar el idioma del voucher:", error);
      toast.error("No se pudo cambiar el idioma del voucher");
    } finally {
      setChangingIdioma(false);
    }
  };

  // Callback para cambios en datos editables del PDF
  const handleDatosPdfChange = (change) => {
    const nextDatosPdf = syncDatosPdfCurrentLanguageVersion(
      applyDatosPdfChange(latestDatosPdfRef.current, change),
    );
    latestDatosPdfRef.current = nextDatosPdf;
    setDatosPdf(nextDatosPdf);
    setDatosPdfDirty(!areDatosPdfEqual(nextDatosPdf, savedDatosPdf));
  };

  const handleDatosPdfTouch = (change) => {
    const nextDatosPdf = syncDatosPdfCurrentLanguageVersion(
      applyDatosPdfChange(latestDatosPdfRef.current, change),
    );
    latestDatosPdfRef.current = nextDatosPdf;
    setDatosPdfDirty(!areDatosPdfEqual(nextDatosPdf, savedDatosPdf));
  };

  // Guardar datos editables del PDF
  const handleSaveDatosPdf = async () => {
    if (!voucher?.id || !datosPdfDirty) return;

    if (
      document.activeElement instanceof HTMLElement &&
      document.activeElement.isContentEditable
    ) {
      document.activeElement.blur();
    }

    const snapshot = syncDatosPdfCurrentLanguageVersion(latestDatosPdfRef.current);
    setSavingPdf(true);
    try {
      const updateResponse = await voucherVentaService.updateDatosPdf(
        voucher.id,
        snapshot,
      );
      const serverVoucher =
        updateResponse?.data?.voucher || updateResponse?.voucher || null;
      const nextVoucherData = {
        ...(voucherData || voucher || {}),
        ...(serverVoucher || {}),
        datos_pdf: snapshot,
      };

      latestDatosPdfRef.current = snapshot;
      setDatosPdf(snapshot);
      setSavedDatosPdf(snapshot);
      setVoucherData(nextVoucherData);
      setDatosPdfDirty(false);

      if (typeof onVoucherUpdated === "function") {
        try {
          await onVoucherUpdated(nextVoucherData);
        } catch (refreshError) {
          console.warn(
            "Los cambios se guardaron, pero no se pudo sincronizar VouchersVenta:",
            refreshError,
          );
        }
      }

      toast.success("Cambios del voucher guardados");
    } catch (e) {
      console.error("No se pudo guardar datos_pdf:", e);
      toast.error("No se pudieron guardar los cambios del voucher");
    } finally {
      setSavingPdf(false);
    }
  };

  if (!isOpen) return null;

  const currentIdioma = getDatosPdfIdioma(datosPdf);
  const modalLabels = getVoucherLabels(currentIdioma);

  const downloadLabel =
    downloadingPdf && downloadProgress.total > 0
      ? `${modalLabels.generating} ${downloadProgress.current}/${downloadProgress.total}`
      : downloadingPdf
        ? modalLabels.preparing
        : modalLabels.downloadPdf;

  return (
    <div className="ventas-pdf-overlay">
      <div className="ventas-pdf-modal">
        {/* Header principal del modal */}
        <div className="modal-header">
          <div className="header-content">
            <h2>{modalLabels.modalTitle}</h2>
            <div className="voucher-info">
              <span className="voucher-code">#{voucher?.voucher_code}</span>
              <span className="voucher-date">
                <MdCalendarToday size={16} />
                {voucher?.created_at
                  ? formatVoucherShortDate(voucher.created_at, currentIdioma)
                  : ""}
              </span>
            </div>
          </div>
          <div className="header-actions">
            <div
              className="voucher-language-selector"
              title={modalLabels.languageTitle}
              aria-label={modalLabels.languageTitle}
            >
              <MdTranslate size={18} />
              {VOUCHER_LANGUAGES.map((language) => (
                <button
                  key={language.code}
                  type="button"
                  className={`voucher-language-btn ${
                    currentIdioma === language.code ? "active" : ""
                  }`}
                  onClick={() => handleVoucherIdiomaChange(language.code)}
                  disabled={changingIdioma || loading || savingPdf}
                  title={language.name}
                >
                  <span className="voucher-language-btn__flag">
                    {language.flag}
                  </span>
                  <span>{language.label}</span>
                </button>
              ))}
              {changingIdioma && (
                <span className="voucher-language-status">
                  {modalLabels.languageUpdating}
                </span>
              )}
            </div>
            {datosPdfDirty && (
              <button
                className="btn-save-pdf"
                onClick={handleSaveDatosPdf}
                disabled={savingPdf}
              >
                {savingPdf ? modalLabels.saving : modalLabels.saveChanges}
              </button>
            )}
            <button
              className={`btn-download-pdf${
                downloadingPdf ? " is-loading" : ""
              }`}
              onClick={handleDownloadPdf}
              disabled={downloadingPdf || loading || changingIdioma}
              style={
                downloadingPdf && downloadProgress.total > 0
                  ? {
                      "--download-progress": `${Math.round(
                        (downloadProgress.current / downloadProgress.total) *
                          100,
                      )}%`,
                    }
                  : undefined
              }
            >
              <MdFileDownload size={18} />
              <span>{downloadLabel}</span>
            </button>

            <button className="btn-close" onClick={onClose}>
              <MdClose size={24} />
            </button>
          </div>
        </div>

        <div className="modal-body">
          {/* Contenido (área que se imprime) */}
          <div ref={printAreaRef} className="modal-content voucher-print-area">
            {loading ? (
              <div className="loading-state">{modalLabels.loading}</div>
            ) : (
              <div className="tab-content voucher-tab">
                <VoucherView
                  voucher={voucher}
                  voucherData={voucherData}
                  passengers={passengers}
                  paymentSummary={paymentSummary}
                  externalFlights={externalFlights}
                  onAddInternationalFlight={handleAddInternationalFlight}
                  onAddNationalFlight={handleAddNationalFlight}
                  onUpdateExternalFlight={handleUpdateExternalFlight}
                  onRemoveExternalFlight={handleRemoveExternalFlight}
                  onUpsertFlightOverride={handleUpsertFlightOverride}
                  datosPdf={datosPdf}
                  onDatosPdfChange={handleDatosPdfChange}
                  onDatosPdfTouch={handleDatosPdfTouch}
                  idioma={currentIdioma}
                />
              </div>
            )}
          </div>

          {/* Indicaciones internas guardadas en voucher_venta.datos_pdf; no se imprimen */}
          {!loading && (
            <aside
              className="pdf-indications-panel"
              aria-label={modalLabels.pdfIndications}
            >
              <div className="pdf-indications-panel__header">
                <span className="pdf-indications-panel__title">
                  <MdNotes size={18} /> {modalLabels.pdfIndications}
                </span>
              </div>
              <textarea
                className="pdf-indications-panel__textarea"
                value={datosPdf?.indicaciones_pdf || ""}
                onChange={(event) =>
                  handleDatosPdfChange({
                    scope: "indicaciones_pdf",
                    value: event.target.value,
                  })
                }
                placeholder={modalLabels.pdfIndicationsPlaceholder}
                rows={7}
              />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
};

export default VentasSummaryPDFModal;
