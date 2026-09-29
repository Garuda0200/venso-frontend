import React, { useMemo, useEffect } from "react";
import { MdStar } from "react-icons/md";
import { buildCotizacionPreviewHtml } from "../utils/cotizacionPreviewHtml";
import { getServicePricingSnapshot } from "../utils/servicePricingRuntime";
import axios from "../../../../../utils/axiosInstance";
import useHotelQuoteDictionary, {
  resolveQuotationTariffType,
} from "../utils/useHotelQuoteDictionary";
import buildRoomOptionsByCategory from "../utils/buildRoomOptionsByCategory";
import buildCategoryRowsFromDict from "../utils/buildCategoryRowsFromDict";
import HotelSummarySection from "../components/HotelPricingModal/HotelSummarySection";
import { applyHotelDetalleToGeneratedHtml } from "../utils/hotelDetallePayload";
import {
  buildPdfHotelPreviewRows,
  getPdfHotelDetalle,
  getPdfHotelCategoryRows,
  getPdfItineraryDays,
  resolvePdfSelectedHotel,
  formatPdfHotelCategoryChip,
  getDefaultPdfHotelCategories,
  getPdfExternalItineraryDays,
} from "../utils/pdfHotelPreviewData";
import { buildSummaryContentPricingModel } from "../utils/summaryContentPricingParts";
import { buildSummaryPricingPresentation } from "../utils/summaryPricingCore";
import { getProxyUrl } from "../../../../../services/presignedUrlService";
import { resolveVensoCanvaCoverImages } from "../utils/vensoPdfCanvaDesign";

const marcaAguaWhite = "/assets/marca_agua.webp";

const normalizeTycLanguage = (idioma = "es") => {
  const lang = String(idioma || "es").toLowerCase();
  if (lang.startsWith("en")) return "en";
  if (lang.startsWith("pt") || lang.startsWith("br")) return "pt";
  return "es";
};

const TERMS_AND_CONDITIONS_COPY = {
  es: {
    headerLeft: "Términos y condiciones",
    headerAccent: "de reserva",
    headerRight: "Venso Tours",
    sections: [
      {
        title: "Proceso de Reserva",
        body: "La reserva se confirma únicamente con el pago del adelanto:",
        bullets: [
          "CATEGORIA 3 *** de un 30% de inicial del paquete completo, solicitado por la agencia y el envío del comprobante de pago. Hasta ese momento, los servicios están sujetos a disponibilidad.",
          "CATEGORIA 4 **** de un 40% de inicial del paquete completo, solicitado por la agencia y el envío del comprobante de pago. Hasta ese momento, los servicios están sujetos a disponibilidad.",
          "CATEGORIA 5 ***** de un 50% de inicial del paquete completo, solicitado por la agencia y el envío del comprobante de pago. Hasta ese momento, los servicios están sujetos a disponibilidad.",
        ],
      },
      {
        title: "Pagos",
        bullets: [
          "Se solicita un adelanto para garantizar entrada a Machupicchu, trenes, hoteles y servicios.",
          "El saldo restante deberá ser cancelado como máximo 20 días antes del inicio del viaje.",
          "Pagos con tarjeta de crédito pueden estar sujetos a recargos según la plataforma de pago elegida con un cargo de 3% a 6%.",
        ],
      },
      {
        title: "Tarifas",
        body: "Las tarifas están expresadas en dólares americanos (USD) desde 1 de Enero a 31 de Diciembre 2026 y puede tener una variación hasta el momento de la confirmación debido a disponibilidad (Vuelos e Ingreso a Machupicchu).",
      },
      {
        title: "Política de Cancelación",
        body: "Debido a que muchos servicios turísticos en Perú son no reembolsables (especialmente entradas a Machu Picchu y trenes), aplican las siguientes condiciones:",
        bullets: [
          "Cancelaciones con mas de 45 días de anticipación: Penalidad de 30% del total del paquete.",
          "Cancelaciones con más de 30 días de anticipación: penalidad del 40% del total del programa.",
          "Cancelaciones con menos de 20 días: penalidad del 50% - 100%.",
        ],
      },
      {
        title: "Cambios de Fecha",
        body: "Los cambios están sujetos a disponibilidad y penalidades de proveedores (Vuelos, Trenes, etc.).",
      },
      {
        title: "No Show EN SITIO",
        body: "En caso de no presentarse a un servicio contratado, no corresponde reembolso.",
      },
      {
        title: "Responsabilidad",
        body: "La agencia actúa como intermediaria entre el pasajero y los proveedores (hoteles, trenes, aerolíneas, transporte). No se responsabiliza por retrasos, cancelaciones o cambios por causas ajenas a su control (clima, huelgas, desastres naturales, decisiones gubernamentales).",
      },
      {
        title: "Documentación",
        body: "Es responsabilidad del pasajero portar pasaporte vigente (6 meses de vigencia antes del viaje), boletos y documentación necesaria para el viaje.",
      },
      {
        title: "Seguro de Viaje",
        body: "Se recomienda contratar un seguro de viaje que cubra cancelaciones, asistencia médica y pérdida de equipaje de preferencia cuando se viaja con personas adultos mayores, infantes y niños.",
      },
      {
        title: "Fuerza Mayor",
        body: "No nos hacemos responsables de lesiones, pérdidas, accidentes, retrasos o problemas causados por omisiones o negligencia de terceros, ni por factores fuera de nuestro control, como fenómenos naturales, enfermedades, conflictos, cuarentenas, huelgas o regulaciones gubernamentales. Nos reservamos el derecho de cambiar cualquier tour o excursión si consideramos que esto mejorará la experiencia del viaje. Además, no somos responsables de trámites de visado o vacunación requeridos.",
      },
    ],
  },
  en: {
    headerLeft: "Booking terms and conditions",
    headerAccent: "of reservation",
    headerRight: "Venso Tours",
    sections: [
      {
        title: "Reservation Process",
        body: "The reservation is confirmed only after payment of the requested advance payment:",
        bullets: [
          "CATEGORY 3 ***: 30% initial payment of the complete package, requested by the agency, plus sending the payment receipt. Until then, services remain subject to availability.",
          "CATEGORY 4 ****: 40% initial payment of the complete package, requested by the agency, plus sending the payment receipt. Until then, services remain subject to availability.",
          "CATEGORY 5 *****: 50% initial payment of the complete package, requested by the agency, plus sending the payment receipt. Until then, services remain subject to availability.",
        ],
      },
      {
        title: "Payments",
        bullets: [
          "An advance payment is requested to guarantee Machupicchu entrance tickets, trains, hotels and services.",
          "The remaining balance must be paid no later than 20 days before the start of the trip.",
          "Credit card payments may be subject to surcharges depending on the selected payment platform, from 3% to 6%.",
        ],
      },
      {
        title: "Rates",
        body: "Rates are expressed in US dollars (USD), valid from January 1 to December 31, 2026, and may vary until confirmation due to availability (flights and Machupicchu entrance).",
      },
      {
        title: "Cancellation Policy",
        body: "Because many tourist services in Peru are non-refundable (especially Machu Picchu entrance tickets and trains), the following conditions apply:",
        bullets: [
          "Cancellations more than 45 days in advance: 30% penalty of the total package.",
          "Cancellations more than 30 days in advance: 40% penalty of the total program.",
          "Cancellations less than 20 days in advance: 50% - 100% penalty.",
        ],
      },
      {
        title: "Date Changes",
        body: "Date changes are subject to availability and supplier penalties (flights, trains, etc.).",
      },
      {
        title: "No Show ON SITE",
        body: "If the passenger does not show up for a contracted service, no refund applies.",
      },
      {
        title: "Responsibility",
        body: "The agency acts as an intermediary between the passenger and the providers (hotels, trains, airlines, transportation). It is not responsible for delays, cancellations or changes caused by circumstances beyond its control (weather, strikes, natural disasters, governmental decisions).",
      },
      {
        title: "Documentation",
        body: "It is the passenger's responsibility to carry a valid passport (6 months validity before travel), tickets and all documentation required for the trip.",
      },
      {
        title: "Travel Insurance",
        body: "We recommend purchasing travel insurance covering cancellations, medical assistance and baggage loss, especially when traveling with senior adults, infants and children.",
      },
      {
        title: "Force Majeure",
        body: "We are not responsible for injuries, losses, accidents, delays or problems caused by omissions or negligence of third parties, nor by factors beyond our control, such as natural phenomena, illnesses, conflicts, quarantines, strikes or governmental regulations. We reserve the right to change any tour or excursion if we consider that this will improve the travel experience. We are also not responsible for visa or vaccination procedures required.",
      },
    ],
  },
  pt: {
    headerLeft: "Termos e condições",
    headerAccent: "de reserva",
    headerRight: "Venso Tours",
    sections: [
      {
        title: "Processo de Reserva",
        body: "A reserva é confirmada somente com o pagamento do adiantamento solicitado:",
        bullets: [
          "CATEGORIA 3 ***: 30% de entrada do pacote completo, solicitado pela agência, mais o envio do comprovante de pagamento. Até esse momento, os serviços ficam sujeitos à disponibilidade.",
          "CATEGORIA 4 ****: 40% de entrada do pacote completo, solicitado pela agência, mais o envio do comprovante de pagamento. Até esse momento, os serviços ficam sujeitos à disponibilidade.",
          "CATEGORIA 5 *****: 50% de entrada do pacote completo, solicitado pela agência, mais o envio do comprovante de pagamento. Até esse momento, os serviços ficam sujeitos à disponibilidade.",
        ],
      },
      {
        title: "Pagamentos",
        bullets: [
          "Solicita-se um adiantamento para garantir entradas para Machupicchu, trens, hotéis e serviços.",
          "O saldo restante deverá ser pago no máximo 20 dias antes do início da viagem.",
          "Pagamentos com cartão de crédito podem estar sujeitos a encargos conforme a plataforma escolhida, de 3% a 6%.",
        ],
      },
      {
        title: "Tarifas",
        body: "As tarifas estão expressas em dólares americanos (USD), de 1 de janeiro a 31 de dezembro de 2026, e podem variar até a confirmação devido à disponibilidade (voos e ingresso a Machupicchu).",
      },
      {
        title: "Política de Cancelamento",
        body: "Como muitos serviços turísticos no Peru não são reembolsáveis (especialmente entradas para Machu Picchu e trens), aplicam-se as seguintes condições:",
        bullets: [
          "Cancelamentos com mais de 45 dias de antecedência: penalidade de 30% do total do pacote.",
          "Cancelamentos com mais de 30 dias de antecedência: penalidade de 40% do total do programa.",
          "Cancelamentos com menos de 20 dias: penalidade de 50% - 100%.",
        ],
      },
      {
        title: "Mudanças de Data",
        body: "As mudanças estão sujeitas à disponibilidade e penalidades dos fornecedores (voos, trens, etc.).",
      },
      {
        title: "No Show NO LOCAL",
        body: "Caso o passageiro não compareça a um serviço contratado, não haverá reembolso.",
      },
      {
        title: "Responsabilidade",
        body: "A agência atua como intermediária entre o passageiro e os fornecedores (hotéis, trens, companhias aéreas, transporte). Não se responsabiliza por atrasos, cancelamentos ou mudanças por causas alheias ao seu controle (clima, greves, desastres naturais, decisões governamentais).",
      },
      {
        title: "Documentação",
        body: "É responsabilidade do passageiro portar passaporte válido (6 meses de validade antes da viagem), bilhetes e documentação necessária para a viagem.",
      },
      {
        title: "Seguro de Viagem",
        body: "Recomenda-se contratar um seguro de viagem que cubra cancelamentos, assistência médica e perda de bagagem, especialmente ao viajar com idosos, bebês e crianças.",
      },
      {
        title: "Força Maior",
        body: "Não nos responsabilizamos por lesões, perdas, acidentes, atrasos ou problemas causados por omissões ou negligência de terceiros, nem por fatores fora do nosso controle, como fenômenos naturais, doenças, conflitos, quarentenas, greves ou regulamentações governamentais. Reservamo-nos o direito de alterar qualquer tour ou excursão se considerarmos que isso melhorará a experiência da viagem. Também não somos responsáveis por trâmites de visto ou vacinação exigidos.",
      },
    ],
  },
};

const tycReservationPageStyle = {
  background: "#0d583d",
  color: "#f8fff8",
  fontFamily: "'Montserrat', 'Poppins', sans-serif",
  position: "relative",
  overflow: "hidden",
  padding: 0,
};

const tycReservationTopBandStyle = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: "7.1%",
  background: "#0f5139",
};

const tycReservationHeaderStyle = {
  position: "absolute",
  top: "7.1%",
  left: 0,
  right: 0,
  height: "6.5%",
  background: "#00bf63",
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  columnGap: "20px",
  padding: "0 11.6%",
  fontSize: "17px",
  lineHeight: 1,
  fontWeight: 800,
  letterSpacing: "-0.4px",
};

const tycReservationMutedHeaderStyle = {
  color: "rgba(0, 69, 40, 0.62)",
  whiteSpace: "nowrap",
};

const tycReservationAccentHeaderStyle = {
  color: "#ffffff",
  whiteSpace: "nowrap",
};

const tycReservationContentStyle = {
  position: "absolute",
  inset: "15.2% 3.4% 4.4% 3.8%",
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  columnGap: "4.2%",
};

const tycReservationColumnStyle = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  gap: "12px",
};

const tycReservationBlockStyle = {
  display: "grid",
  gridTemplateColumns: "42px 1fr",
  columnGap: "12px",
  alignItems: "start",
};

const tycReservationIconStyle = {
  width: "32px",
  height: "32px",
  border: "2px solid rgba(255,255,255,0.86)",
  borderRadius: "5px",
  position: "relative",
  marginTop: "2px",
};

const tycReservationTitleStyle = {
  color: "#f4bd18",
  fontSize: "12.2px",
  lineHeight: 1.12,
  fontWeight: 900,
  margin: "0 0 5px",
};

const tycReservationBodyStyle = {
  color: "#ffffff",
  fontSize: "9.75px",
  lineHeight: 1.23,
  fontWeight: 500,
  margin: 0,
};

const tycReservationListStyle = {
  ...tycReservationBodyStyle,
  margin: "4px 0 0",
  paddingLeft: "13px",
};

const chunkReservationSections = (sections) => [sections.slice(0, 5), sections.slice(5)];

const VENSO_CANVA_CLOSING_COPY = {
  es: {
    reservationTitle: "CONDICIONES DE RESERVA Y PAGOS",
    purchaseTitle: "TÉRMINOS Y CONDICIONES PARA SU COMPRA",
    pricingTitle: "PRECIO DEL PAQUETE TURÍSTICO",
    includes: "Incluye:",
    excludes: "No Incluye:",
    notes: "Notas importantes",
    hotel: "HOTEL / CATEGORÍA",
    room: "HABITACIÓN",
    price: "PRECIO / PAX",
  },
  en: {
    reservationTitle: "BOOKING AND PAYMENT CONDITIONS",
    purchaseTitle: "TERMS AND CONDITIONS OF PURCHASE",
    pricingTitle: "TOUR PACKAGE PRICE",
    includes: "Includes:",
    excludes: "Not included:",
    notes: "Important notes",
    hotel: "HOTEL / CATEGORY",
    room: "ROOM",
    price: "PRICE / PAX",
  },
  pt: {
    reservationTitle: "CONDIÇÕES DE RESERVA E PAGAMENTO",
    purchaseTitle: "TERMOS E CONDIÇÕES DE COMPRA",
    pricingTitle: "PREÇO DO PACOTE TURÍSTICO",
    includes: "Inclui:",
    excludes: "Não inclui:",
    notes: "Notas importantes",
    hotel: "HOTEL / CATEGORIA",
    room: "QUARTO",
    price: "PREÇO / PAX",
  },
};

const getCanvaClosingCopy = (idioma = "es") =>
  VENSO_CANVA_CLOSING_COPY[normalizeTycLanguage(idioma)] ||
  VENSO_CANVA_CLOSING_COPY.es;

const resolveCanvaBackdropSrc = (cotizacion = null) => {
  const src = resolveVensoCanvaCoverImages(
    cotizacion?.pdf_media || cotizacion?.pdfMedia || {},
    cotizacion?.info_pdf || cotizacion?.infoPdf || [],
  )[0];
  if (!src) return marcaAguaWhite;
  if (src.includes("/upload/tigris/proxy")) return src;
  if (src.includes("fly.storage.tigris.dev")) return getProxyUrl(src);
  return src;
};

const normalizeCanvaList = (values = []) => {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter((value) => {
      if (!value) return false;
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const buildCanvaPackageLists = (cotizacion = null) => {
  const days = Array.isArray(cotizacion?.info_pdf)
    ? cotizacion.info_pdf
    : Array.isArray(cotizacion?.infoPdf)
      ? cotizacion.infoPdf
      : [];
  const includes = [];
  const excludes = [];
  days.forEach((day) => {
    normalizeCanvaList(day?.incluye).forEach((item) => includes.push(item));
    normalizeCanvaList(day?.no_incluye).forEach((item) => excludes.push(item));
  });
  return {
    includes: normalizeCanvaList(includes),
    excludes: normalizeCanvaList(excludes),
  };
};

const TycReservationIcon = () => (
  <div style={tycReservationIconStyle} aria-hidden="true">
    <span
      style={{
        position: "absolute",
        left: "5px",
        right: "5px",
        top: "8px",
        height: "2px",
        background: "rgba(255,255,255,0.86)",
        boxShadow:
          "0 6px 0 rgba(255,255,255,0.86), 0 12px 0 rgba(255,255,255,0.86)",
      }}
    />
    <span
      style={{
        position: "absolute",
        width: "16px",
        height: "2.5px",
        background: "rgba(255,255,255,0.86)",
        transform: "rotate(-42deg)",
        right: "-6px",
        bottom: "5px",
        borderRadius: "3px",
      }}
    />
  </div>
);

const TycReservationSection = ({ section }) => (
  <div style={tycReservationBlockStyle}>
    <TycReservationIcon />
    <div>
      <h3 style={tycReservationTitleStyle}>{section.title}</h3>
      {section.body && <p style={tycReservationBodyStyle}>{section.body}</p>}
      {Array.isArray(section.bullets) && section.bullets.length > 0 && (
        <ul style={tycReservationListStyle}>
          {section.bullets.map((item, index) => (
            <li key={`${section.title}-${index}`} style={{ marginBottom: "3px" }}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  </div>
);

export const TermsAndConditionsPage = React.memo(
  ({ idioma = "es", cotizacion = null }) => {
    const copy =
      TERMS_AND_CONDITIONS_COPY[normalizeTycLanguage(idioma)] ||
      TERMS_AND_CONDITIONS_COPY.es;
    const labels = getCanvaClosingCopy(idioma);
    const [reservationSections, purchaseSections] = chunkReservationSections(
      copy.sections,
    );
    const backdrop = resolveCanvaBackdropSrc(cotizacion);

    const renderSections = (sections) => (
      <div className="canva-legal-sections canva-closing-copy">
        {sections.map((section) => (
          <section className="canva-legal-section" key={section.title}>
            <h3>{section.title}</h3>
            {section.body && <p>{section.body}</p>}
            {Array.isArray(section.bullets) && section.bullets.length > 0 && (
              <ul>
                {section.bullets.map((item, index) => (
                  <li key={`${section.title}-${index}`}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    );

    const page = (className, title, sections) => (
      <div className={`pdf-page canva-closing-page ${className}`}>
        <img
          src={backdrop}
          data-pdf-full-src={backdrop}
          alt=""
          className="canva-closing-backdrop"
          draggable={false}
          crossOrigin="anonymous"
          loading="eager"
          decoding="sync"
        />
        <div className="canva-closing-veil" />
        <div className="canva-closing-content">
          <h2 className="canva-closing-title">{title}</h2>
          {renderSections(sections)}
          <div className="canva-legal-signature">VENSO TOURS · CUSCO, PERÚ</div>
        </div>
      </div>
    );

    return (
      <>
        {page(
          "tyc-reservation-page",
          labels.reservationTitle,
          reservationSections,
        )}
        {page(
          "tyc-purchase-page",
          labels.purchaseTitle,
          purchaseSections,
        )}
      </>
    );
  },
);
TermsAndConditionsPage.displayName = "TermsAndConditionsPage";


/* =========================
 ESTILOS INLINE TYC (REACT)
========================= */

const tycPageStyle = {
  background: "#005f56",
  color: "#f6f2eb",
  fontFamily: "'Montserrat', sans-serif",
  position: "relative",
  overflow: "hidden",
  padding: "14px 22px 20px",
};

const tycLogoStyle = {
  position: "absolute",
  top: "8px",
  left: "10px",
  width: "52px",
  height: "auto",
  filter: "brightness(0) invert(1)",
};

const tycTaglineStyle = {
  position: "absolute",
  top: "10px",
  right: "18px",
  textAlign: "right",
  fontSize: "11px",
  lineHeight: "1.4",
  fontWeight: 400,
  color: "#f6f2eb",
};

const tycTitleStyle = {
  textAlign: "center",
  fontSize: "32px",
  fontWeight: 800,
  letterSpacing: "1px",
  marginTop: "36px",
  marginBottom: "12px",
  textTransform: "uppercase",
  color: "#f6f2eb",
};

const tycContentStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 2px 1fr",
  gap: "12px",
  alignItems: "start",
  marginTop: "36px",
  padding: "0 10px",
};

const tycContentFirstStyle = {
  ...tycContentStyle,
  marginTop: "6px",
};

const tycDividerStyle = {
  background: "#cfa33b",
  minHeight: "340px",
  marginTop: "0",
};

const tycColStyle = {
  fontSize: "13px",
  lineHeight: "1.45",
  color: "rgba(246, 242, 235, 0.95)",
};

const tycSectionStyle = {
  marginBottom: "8px",
};

const tycH3Style = {
  fontSize: "14.5px",
  fontWeight: 700,
  color: "#f6f2eb",
  marginBottom: "3px",
};

const TycSection = ({ title, children }) => (
  <div style={tycSectionStyle}>
    {title && <h3 style={tycH3Style}>{title}</h3>}
    {children}
  </div>
);

const TycPageHeader = ({ showTitle }) => (
  <>
    <img src={marcaAguaWhite} alt="Venso" style={tycLogoStyle} />
    <div style={tycTaglineStyle}>
      "Creando Experiencias con
      <br />
      Sabor Peruano"
    </div>
    {showTitle && <h1 style={tycTitleStyle}>TÉRMINOS Y CONDICIONES</h1>}
  </>
);

const tycParagraphStyle = {
  margin: "0 0 5px",
};

const tycListStyle = {
  margin: "3px 0 0",
  paddingLeft: "16px",
};

const tycTableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "12px",
  marginTop: "4px",
  tableLayout: "fixed",
  border: "1px solid rgba(246, 242, 235, 0.65)",
};

const tycTableCellStyle = {
  padding: "8px 9px",
  border: "1px solid rgba(246, 242, 235, 0.48)",
  verticalAlign: "top",
};

const tycFullContentStyle = {
  marginTop: "46px",
  padding: "0 26px",
};

const TYC_2026_PAGES = [
  {
    showTitle: true,
    left: [
      {
        title: "1. Vuelos Domésticos (Perú)",
        paragraphs: [
          "Sujetos a las condiciones de la tarifa comprada.",
          "Cambios o reprogramaciones aplican con pago de diferencia tarifaria, penalidad de USD 30 y cargo por reemisión de USD 16 por pasajero.",
          "En casos de fuerza mayor como clima, desastres, disposiciones gubernamentales o cierres oficiales, aplican las políticas del proveedor correspondiente.",
          "En emisiones por grupo aplican penalidades específicas de cada aerolínea, incluyendo Sky, Latam u otras.",
          "La no presentación en el vuelo (no show) implica pérdida total del servicio sin reembolso.",
        ],
      },
    ],
    right: [
      {
        title: "2. Proceso de Reserva",
        paragraphs: [
          "La reserva se confirma únicamente con el pago del adelanto solicitado por la agencia y el envío del comprobante de pago. Hasta ese momento, los servicios permanecen sujetos a disponibilidad.",
        ],
        list: [
          "Categoría 3 estrellas: 30% de inicial del paquete completo.",
          "Categoría 4 estrellas: 40% de inicial del paquete completo.",
          "Categoría 5 estrellas: 50% de inicial del paquete completo.",
        ],
      },
    ],
  },
  {
    left: [
      {
        title: "3. Pagos",
        paragraphs: [
          "Se solicita un adelanto para garantizar entrada a Machu Picchu, trenes, hoteles y servicios.",
          "El saldo restante deberá ser cancelado como máximo 20 días antes del inicio del viaje.",
          "Los pagos con tarjeta de crédito pueden estar sujetos a recargos según la plataforma de pago elegida, con un cargo de 3% a 6%.",
        ],
      },
      {
        title: "4. Tarifas",
        paragraphs: [
          "Las tarifas están expresadas en dólares americanos (USD), vigentes del 1 de enero al 31 de diciembre de 2026.",
          "Las tarifas pueden variar hasta el momento de la confirmación debido a disponibilidad de vuelos e ingreso a Machu Picchu.",
        ],
      },
    ],
    right: [
      {
        title: "5. Política de Cancelación",
        paragraphs: [
          "Debido a que muchos servicios turísticos en Perú son no reembolsables, especialmente entradas a Machu Picchu y trenes, aplican las siguientes condiciones:",
        ],
        list: [
          "Cancelaciones con más de 45 días de anticipación: penalidad del 30% del total del paquete.",
          "Cancelaciones con más de 30 días de anticipación: penalidad del 40% del total del programa.",
          "Cancelaciones con menos de 20 días: penalidad del 50% al 100%.",
        ],
      },
    ],
  },
  {
    left: [
      {
        title: "6. Cambios de Fecha",
        paragraphs: [
          "Los cambios están sujetos a disponibilidad y penalidades de proveedores, incluyendo vuelos, trenes y otros servicios contratados.",
        ],
      },
      {
        title: "7. No Show en Sitio",
        paragraphs: [
          "En caso de no presentarse a un servicio contratado, no corresponde reembolso.",
        ],
      },
      {
        title: "8. Responsabilidad",
        paragraphs: [
          "La agencia actúa como intermediaria entre el pasajero y los proveedores, incluyendo hoteles, trenes, aerolíneas y transporte.",
          "No se responsabiliza por retrasos, cancelaciones o cambios por causas ajenas a su control, como clima, huelgas, desastres naturales o decisiones gubernamentales.",
        ],
      },
    ],
    right: [
      {
        title: "9. Documentación",
        paragraphs: [
          "Es responsabilidad del pasajero portar pasaporte vigente, boletos y documentación necesaria para el viaje.",
          "El pasaporte debe contar con 6 meses de vigencia antes del viaje cuando corresponda.",
        ],
      },
      {
        title: "10. Seguro de Viaje",
        paragraphs: [
          "Se recomienda contratar un seguro de viaje que cubra cancelaciones, asistencia médica y pérdida de equipaje.",
          "Esta recomendación es especialmente importante cuando viajan adultos mayores, infantes y niños.",
        ],
      },
    ],
  },
  {
    left: [
      {
        title: "11. Fuerza Mayor",
        paragraphs: [
          "No nos hacemos responsables de lesiones, pérdidas, accidentes, retrasos o problemas causados por omisiones o negligencia de terceros.",
          "Tampoco asumimos responsabilidad por factores fuera de nuestro control, como fenómenos naturales, enfermedades, conflictos, cuarentenas, huelgas o regulaciones gubernamentales.",
          "Nos reservamos el derecho de cambiar cualquier tour o excursión si consideramos que esto mejora la experiencia del viaje.",
          "No somos responsables de trámites de visado o vacunación requeridos.",
        ],
      },
    ],
    right: [
      {
        title: "Condiciones completas",
        paragraphs: [
          "Este documento resume las políticas principales aplicables a la cotización y a los servicios contratados.",
          "Las condiciones completas están disponibles en nuestra oficina, a solicitud del pasajero y en nuestra página web: https://vensotours.com/",
        ],
        small: true,
      },
    ],
  },
  {
    layout: "full",
    blocks: [
      {
        title: "Resumen de Cargos y Penalidades",
        type: "table",
        headers: ["Concepto", "Cargo / Penalidad"],
        rows: [
          ["Reprogramación vuelo doméstico", "USD 50 + penalidad de aerolínea"],
          ["Cargo por reemisión vuelo doméstico", "USD 16"],
          ["Gastos administrativos generales", "USD 50"],
          [
            "Reprogramación tren (PeruRail / IncaRail)",
            "10% sobre valor de ticket del proveedor + USD 10 de gasto administrativo",
          ],
          [
            "Cancelación tren",
            "Sujeto a penalidades establecidas por la empresa operadora",
          ],
          [
            "Entradas a Machu Picchu",
            "No reembolsables, según normativa oficial",
          ],
        ],
      },
      {
        paragraphs: [
          "Nota: A todos los precios, cargos y penalidades indicados se les adicionará la comisión correspondiente por transferencias internacionales y/o pagos con tarjeta de crédito, PayPal u otros medios, según corresponda.",
        ],
        small: true,
      },
    ],
  },
];

export const TYC_PAGES_COUNT = TYC_2026_PAGES.length;

const TycContentBlock = ({ block }) => {
  if (block.type === "table") {
    return (
      <TycSection title={block.title}>
        <table style={tycTableStyle}>
          <colgroup>
            <col style={{ width: "39%" }} />
            <col style={{ width: "61%" }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: "1px solid #cfa33b" }}>
              {block.headers.map((header) => (
                <th
                  key={header}
                  style={{
                    ...tycTableCellStyle,
                    textAlign: "left",
                    fontWeight: 700,
                    color: "#f6f2eb",
                    background: "rgba(246, 242, 235, 0.08)",
                  }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map(([concepto, cargo]) => (
              <tr key={concepto}>
                <td style={tycTableCellStyle}>{concepto}</td>
                <td style={tycTableCellStyle}>{cargo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TycSection>
    );
  }

  return (
    <TycSection title={block.title}>
      {block.paragraphs?.map((paragraph) => (
        <p
          key={paragraph}
          style={{
            ...tycParagraphStyle,
            fontSize: block.small ? "11px" : undefined,
            fontStyle: block.small ? "italic" : undefined,
          }}
        >
          {paragraph}
        </p>
      ))}
      {block.list?.length > 0 && (
        <ul style={tycListStyle}>
          {block.list.map((item) => (
            <li key={item} style={{ marginBottom: "3px" }}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </TycSection>
  );
};

const TycDocPage = ({ page, index }) => {
  if (page.layout === "full") {
    return (
      <div className="pdf-page" style={tycPageStyle}>
        <TycPageHeader showTitle={false} />
        <div style={{ ...tycFullContentStyle, ...tycColStyle }}>
          {page.blocks.map((block, blockIndex) => (
            <TycContentBlock
              block={block}
              key={`${block.title || "full"}-${blockIndex}`}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="pdf-page" style={tycPageStyle}>
      <TycPageHeader showTitle={!!page.showTitle} />
      <div style={index === 0 ? tycContentFirstStyle : tycContentStyle}>
        <div style={tycColStyle}>
          {page.left.map((block, blockIndex) => (
            <TycContentBlock
              block={block}
              key={`${block.title || "left"}-${blockIndex}`}
            />
          ))}
        </div>
        <div style={tycDividerStyle}></div>
        <div style={tycColStyle}>
          {page.right.map((block, blockIndex) => (
            <TycContentBlock
              block={block}
              key={`${block.title || "right"}-${blockIndex}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

/* PAGE 1: Título + Vuelos Domésticos + Requisitos Reprogramación */
const TycPage1 = () => (
  <div className="pdf-page" style={tycPageStyle}>
    <TycPageHeader showTitle />
    <div style={tycContentFirstStyle}>
      <div style={tycColStyle}>
        <TycSection title="1. Vuelos Domésticos (Perú)">
          Sujetos a las condiciones de la tarifa comprada. Cambios o
          reprogramaciones aplican con pago de diferencia tarifaria + penalidad
          de USD 30 + cargo por reemisión de USD 16 por pasajero. En casos de
          fuerza mayor (clima, desastres, disposiciones gubernamentales o
          cierres oficiales), aplican las políticas del proveedor
          correspondiente. En caso de emisión por grupo, aplican penalidades
          específicas de cada aerolínea (Sky, Latam u otras). La no presentación
          en el vuelo (no show) implica pérdida total del servicio sin
          reembolso.
        </TycSection>
      </div>
      <div style={tycDividerStyle}></div>
      <div style={tycColStyle}>
        <TycSection title="Requisitos para Reprogramación de Vuelos">
          El pasajero deberá pagar la diferencia tarifaria y la penalidad
          establecida por la aerolínea, dentro del periodo de validez del boleto
          (sujeto a cambios según aerolínea). La solicitud debe enviarse por
          correo electrónico o mediante su asesor(a) de viajes, confirmando la
          reconfirmación de todo el grupo y brindando las nuevas fechas exactas
          de reprogramación del vuelo. Este trámite debe realizarse con un
          mínimo de 48 horas hábiles antes de la fecha y hora del vuelo. En el
          caso de emisiones por grupo, el plazo mínimo es de 72 horas. De no
          hacerlo, se considerará no show y se perderá el derecho a
          reprogramación.
        </TycSection>
        <TycSection>
          Nota: Venso Tours realizará los mayores esfuerzos por
          mantener el programa contratado y el costo acordado, siempre que la
          reprogramación se gestione dentro de los plazos y condiciones
          establecidos y no existan incrementos oficiales de los proveedores.
        </TycSection>
      </div>
    </div>
  </div>
);

/* PAGE 2: Vuelos Internacionales + Entradas Machupicchu + Trenes */
const TycPage2 = () => (
  <div className="pdf-page" style={tycPageStyle}>
    <TycPageHeader showTitle={false} />
    <div style={tycContentStyle}>
      <div style={tycColStyle}>
        <TycSection title="2. Vuelos Internacionales">
          Cambios y cancelaciones dependen exclusivamente de las políticas de la
          aerolínea. La agencia brinda soporte en la gestión, pero no asume
          responsabilidad por reembolsos. Las solicitudes de cambio/cancelación
          deben realizarse hasta 5 días hábiles antes de la fecha de viaje. La
          no presentación en el vuelo (no show) implica pérdida total del
          servicio sin reembolso.
        </TycSection>
        <TycSection title="3. Entradas a Machupicchu (DDC Cusco)">
          No se permiten cambio de fecha ni de titular. Excepcionalmente solo se
          acepta cambio de número de pasaporte. No hay reembolsos, salvo casos
          de fuerza mayor (clima, desastres, disposiciones gubernamentales o
          cierres oficiales), aplican las políticas del proveedor
          correspondiente. El pasajero es responsable de presentarse
          puntualmente en el horario indicado de ingreso, sino se considera no
          show sin derecho a reembolso.
        </TycSection>
      </div>
      <div style={tycDividerStyle}></div>
      <div style={tycColStyle}>
        <TycSection title="4. Trenes Turísticos (Perú Rail / Inca Rail)">
          Se aplican cambios hasta 48 horas antes del horario de salida.
          Modificación de fecha: sujeta a disponibilidad del operador
          ferroviario. El proveedor aplicará un recargo del 10% sobre el valor
          del ticket. Adicionalmente, la agencia aplicará un gasto
          administrativo de USD 10 por persona por la gestión de reprogramación.
          No se devuelve diferencia si la tarifa es menor. En casos
          extraordinarios (huelgas, bloqueos, desastres naturales), aplican
          políticas oficiales de la empresa ferroviaria. En caso de no show, el
          ticket se pierde sin derecho a reembolso.
        </TycSection>
      </div>
    </div>
  </div>
);

/* PAGE 3: Hoteles + Cancelaciones Generales */
const TycPage3 = () => (
  <div className="pdf-page" style={tycPageStyle}>
    <TycPageHeader showTitle={false} />
    <div style={tycContentStyle}>
      <div style={tycColStyle}>
        <TycSection title="5. Hoteles">
          Todas las reservas de hotel están sujetas a las políticas y
          condiciones de cada establecimiento. Los cambios de fechas
          (modificación de check-in o check-out) deben solicitarse con una
          anticipación mínima de 15 días calendario antes de la fecha de
          ingreso, quedando sujetos a la disponibilidad del hotel, las
          penalidades que este determine y a los gastos administrativos
          correspondientes. En caso de cancelación, se aplicarán las penalidades
          según las condiciones de la tarifa reservada, además de los gastos
          administrativos de la agencia.
        </TycSection>
        <TycSection>
          En temporadas altas, feriados o fechas especiales, los hoteles pueden
          aplicar políticas de no reembolsable o mínimo de noches obligatorias,
          las cuales deberán ser respetadas. La agencia actuará como
          intermediaria en la gestión de cambios o cancelaciones, pero no
          garantiza la exoneración de penalidades ni reembolsos.
        </TycSection>
      </div>
      <div style={tycDividerStyle}></div>
      <div style={tycColStyle}>
        <TycSection title="6. Cancelaciones Generales">
          Una vez emitidos vuelos, trenes y entradas a Machupicchu, aplican las
          políticas de cada proveedor. En caso de cancelación por parte del
          pasajero, pueden generarse gastos administrativos (reprogramación de
          vuelos, compra de tickets de tren, reserva de hoteles, trámites de
          devolución) de USD 50 por persona + comisión correspondiente por
          transferencias internacionales y/o pagos con tarjeta de crédito,
          PayPal u otros medios, según corresponda. Si el horario reprogramado
          por la aerolínea no es conveniente, el pasajero podrá adquirir un
          nuevo vuelo; se entiende que los reembolsos y cambios dependen
          directamente de las políticas de cada proveedor, y la agencia actúa
          únicamente como intermediaria para gestionar el trámite.
        </TycSection>
        <TycSection title="Política de Cancelaciones y Devoluciones">
          Aplica para paquetes y servicios turísticos en general: Cancelaciones
          con más de 70 días de anticipación: penalidad del 25% del total del
          servicio. Cancelaciones entre 70 y 45 días de anticipación: penalidad
          del 50%. Cancelaciones dentro de los 45 días previos al inicio del
          viaje, o en caso de no show: penalidad del 100% del total del
          servicio.
        </TycSection>
      </div>
    </div>
  </div>
);

/* PAGE 4: Responsabilidades */
const TycPage4 = () => (
  <div className="pdf-page" style={tycPageStyle}>
    <TycPageHeader showTitle={false} />
    <div style={tycContentStyle}>
      <div style={tycColStyle}>
        <TycSection title="7. Responsabilidades">
          El pasajero debe portar documentos válidos (pasaporte/visas), llegar
          puntual a los puntos de encuentro y cumplir las normas locales. La
          agencia no se hace responsable por retrasos, pérdidas o
          reprogramaciones derivados de causas externas (clima, bloqueos,
          huelgas, disposiciones gubernamentales). Asimismo, en estos casos,
          Venso Tours no cubrirá gastos adicionales como alojamiento,
          alimentación, transporte u otros costos derivados; dichos gastos serán
          asumidos por el pasajero, salvo lo que indique expresamente el
          proveedor correspondiente.
        </TycSection>
        <TycSection>
          Venso Tours brindará asistencia para facilitar cambios
          según la disponibilidad de cada proveedor. Toda solicitud de cambio o
          cancelación debe realizarse a través de los canales oficiales de la
          agencia (correo institucional o directamente con la ejecutiva de
          ventas asignada).
        </TycSection>
      </div>
      <div style={tycDividerStyle}></div>
      <div style={tycColStyle}>
        <TycSection>
          La información personal del pasajero será utilizada únicamente para
          fines de reserva conforme a la Ley de Protección de Datos Personales
          N.° 29733 y su reglamento. La agencia no se responsabiliza por
          pérdida, robo o daño de objetos personales durante el viaje. Se
          recomienda mantenerlos siempre bajo resguardo. Por su seguridad, por
          favor no dejar objetos de valor en los buses, vans o autos. Cada
          pasajero es responsable de sus pertenencias.
        </TycSection>
        <TycSection>
          Venso Tours actúa únicamente como intermediaria entre el
          pasajero y los proveedores de servicios turísticos (aerolíneas,
          empresas ferroviarias, hoteles, transportes, operadores locales, entre
          otros). Todas las reservas están sujetas a las políticas, condiciones
          y penalidades establecidas por dichos proveedores, las cuales son
          aceptadas por el pasajero al momento de confirmar su compra. La
          agencia no es responsable de modificaciones, cancelaciones o
          reembolsos que dependan directamente de los proveedores; sin embargo,
          brindará asistencia y soporte al pasajero para gestionar la solución
          más adecuada según las condiciones aplicables.
        </TycSection>
      </div>
    </div>
  </div>
);

/* PAGE 5: Itinerarios + Menores + Pagos + Seguros */
const TycPage5 = () => (
  <div className="pdf-page" style={tycPageStyle}>
    <TycPageHeader showTitle={false} />
    <div style={tycContentStyle}>
      <div style={tycColStyle}>
        <TycSection title="8. Itinerarios y Servicios">
          El itinerario y servicios contratados están sujetos a cambios por
          factores externos (clima, disposiciones gubernamentales, bloqueos,
          entre otros). En caso de modificaciones, la agencia se compromete a
          ofrecer alternativas de igual o similar categoría.
        </TycSection>
        <TycSection title="9. Menores de Edad y Documentos de Viaje">
          Los pasajeros menores de 18 años deben viajar acompañados por sus
          padres o tutores legales, o contar con la autorización notarial
          correspondiente en caso de viajar solos o con terceros. Es
          responsabilidad del pasajero portar documentos de identidad válidos
          (DNI, pasaporte, visas, permisos notariales u otros exigidos por las
          autoridades). Venso Tours no se responsabiliza por la
          imposibilidad de viajar ocasionada por la falta, error o invalidez de
          dichos documentos.
        </TycSection>
      </div>
      <div style={tycDividerStyle}></div>
      <div style={tycColStyle}>
        <TycSection title="10. Pagos y Saldos Pendientes">
          Para confirmar la reserva se requiere un depósito mínimo del 30% del
          monto total del servicio. La empresa podrá solicitar pagos adicionales
          antes de la emisión de servicios no reembolsables (boletos de tren,
          ingresos a Machu Picchu, vuelos, hoteles con prepago u otros), a fin
          de cubrir los costos operativos ya comprometidos con proveedores. El
          pasajero acepta que, en caso de cancelación, deberá asumir los costos
          efectivamente incurridos y no reembolsables por parte de los
          proveedores, aun cuando estos superen el porcentaje del depósito
          inicial realizado.
        </TycSection>
        <TycSection>
          La empresa podrá requerir la cancelación total del servicio antes de
          las fechas de emisión establecidas por los proveedores. El saldo
          pendiente deberá cancelarse según el cronograma de pagos informado por
          su ejecutiva de ventas y, en todos los casos, antes del inicio del
          viaje. El incumplimiento en los pagos en las fechas establecidas podrá
          generar la suspensión o cancelación automática de reservas sin derecho
          a reembolso de los montos ya comprometidos con proveedores.
        </TycSection>
      </div>
    </div>
  </div>
);

/* PAGE 6: Seguros + Excursiones + Resumen + Nota Final */
const TycPage6 = () => (
  <div className="pdf-page" style={tycPageStyle}>
    <TycPageHeader showTitle={false} />
    <div style={tycContentStyle}>
      <div style={tycColStyle}>
        <TycSection title="11. Seguros de Viaje">
          Recomendación de contratación: Se aconseja a todos los pasajeros
          adquirir un seguro de viaje que cubra gastos médicos, cancelaciones,
          pérdida de equipaje y otros imprevistos. Limitación de
          responsabilidad: Venso Tours no asume responsabilidad por
          situaciones médicas, accidentes, gastos adicionales ni pérdidas
          derivadas de no contar con un seguro de viaje vigente. Asistencia en
          emergencias: En caso de emergencia, la agencia apoyará al pasajero
          facilitando la comunicación con la compañía aseguradora contratada.
        </TycSection>
        <TycSection title="12. Excursiones y Tours de un Día">
          (Laguna Humantay, Montaña de Colores, City Tour, Valle Sagrado, entre
          otros). Cancelaciones hasta 72 horas antes del inicio del servicio:
          reembolso parcial con penalidad del 30% del valor total del tour.
          Cancelaciones dentro de las 72 horas previas, o en caso de no show,
          implican penalidad del 100% sin derecho a reembolso. Los horarios de
          recojo son aproximados y pueden variar por condiciones de tráfico,
          clima u otros factores externos. El pasajero debe portar su documento
          de identidad válido y, cuando corresponda, el boleto de ingreso a los
          atractivos turísticos.
        </TycSection>
      </div>
      <div style={tycDividerStyle}></div>
      <div style={tycColStyle}>
        <TycSection>
          La agencia no se responsabiliza por cambios en las condiciones
          climáticas, bloqueos de carreteras u otras causas de fuerza mayor que
          afecten el normal desarrollo del tour. El pasajero es responsable de
          llevar vestimenta y equipamiento adecuado para las excursiones de
          caminata (ropa abrigadora, poncho de lluvia, calzado de trekking,
          etc.). En caso de que el pasajero no pueda completar el recorrido por
          motivos de salud o falta de preparación física, no aplica reembolso.
          Para tours que incluyan transporte compartido, el pasajero debe
          respetar los horarios y las indicaciones del guía; la inasistencia al
          punto de encuentro se considera no show.
        </TycSection>
        <TycSection title="Resumen de Cargos y Penalidades">
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "12px",
              marginTop: "4px",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid #cfa33b" }}>
                <th
                  style={{
                    textAlign: "left",
                    padding: "3px 4px",
                    fontWeight: 700,
                    color: "#f6f2eb",
                  }}
                >
                  Concepto
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "3px 4px",
                    fontWeight: 700,
                    color: "#f6f2eb",
                  }}
                >
                  Cargo / Penalidad
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Reprogramación vuelo doméstico", "USD 30"],
                ["Cargo por reemisión vuelo doméstico", "USD 16"],
                ["Gastos administrativos generales", "USD 50"],
                [
                  "Reprogramación tren (PeruRail / IncaRail)",
                  "10% sobre valor de ticket + USD 10",
                ],
                ["Cancelación tren", "Sujeto a penalidades del operador"],
                [
                  "Entradas a Machupicchu",
                  "No reembolsables, según normativa oficial",
                ],
              ].map(([c, p], i) => (
                <tr
                  key={i}
                  style={{ borderBottom: "1px solid rgba(207,163,59,0.3)" }}
                >
                  <td style={{ padding: "3px 4px" }}>{c}</td>
                  <td style={{ padding: "3px 4px" }}>{p}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TycSection>
        <TycSection>
          <em style={{ fontSize: "11px" }}>
            Nota: A todos los precios, cargos y penalidades indicados se les
            adicionará la comisión correspondiente por transferencias
            internacionales y/o pagos con tarjeta de crédito, PayPal u otros
            medios, según corresponda. Este es un resumen de las políticas
            principales. Las condiciones completas están disponibles en nuestra
            oficina, a solicitud del pasajero y en nuestra página web:
            vensotours.com
          </em>
        </TycSection>
      </div>
    </div>
  </div>
);

/* PAGE 7: Condiciones específicas de reserva */
const TycPage7 = () => (
  <div className="pdf-page" style={tycPageStyle}>
    <TycPageHeader showTitle={false} />
    <div style={tycContentStyle}>
      <div style={tycColStyle}>
        <TycSection title="13. Proceso de Reserva">
          La reserva se confirma únicamente con el pago del adelanto solicitado
          por la agencia y el envío del comprobante de pago. Hasta ese momento,
          los servicios están sujetos a disponibilidad.
        </TycSection>
        <TycSection title="Adelanto según categoría">
          Categoría 3 estrellas: 30% del paquete completo. Categoría 4
          estrellas: 40% del paquete completo. Categoría 5 estrellas: 50% del
          paquete completo.
        </TycSection>
        <TycSection title="14. Pagos">
          Se solicita un adelanto para garantizar ingreso a Machu Picchu,
          trenes, hoteles y servicios. El saldo restante deberá ser cancelado
          como máximo 20 días antes del inicio del viaje. Los pagos con tarjeta
          de crédito pueden estar sujetos a recargos de 3% a 6%, según la
          plataforma de pago elegida.
        </TycSection>
        <TycSection title="15. Tarifas">
          Las tarifas están expresadas en dólares americanos (USD), vigentes del
          1 de enero al 31 de diciembre de 2026, y pueden variar hasta la
          confirmación por disponibilidad de vuelos e ingreso a Machu Picchu.
        </TycSection>
      </div>
      <div style={tycDividerStyle}></div>
      <div style={tycColStyle}>
        <TycSection title="16. Cambios, No Show y Documentación">
          Los cambios de fecha están sujetos a disponibilidad y penalidades de
          proveedores como vuelos y trenes. En caso de no presentarse a un
          servicio contratado, no corresponde reembolso. Es responsabilidad del
          pasajero portar pasaporte vigente, boletos y documentación necesaria
          para el viaje.
        </TycSection>
        <TycSection title="17. Seguro de Viaje">
          Se recomienda contratar un seguro de viaje que cubra cancelaciones,
          asistencia médica y pérdida de equipaje, especialmente cuando viajan
          adultos mayores, infantes o niños.
        </TycSection>
        <TycSection title="18. Fuerza Mayor">
          No nos hacemos responsables por lesiones, pérdidas, accidentes,
          retrasos o problemas causados por terceros, ni por factores fuera de
          nuestro control como fenómenos naturales, enfermedades, conflictos,
          cuarentenas, huelgas o regulaciones gubernamentales. Nos reservamos el
          derecho de cambiar tours o excursiones si mejora la experiencia del
          viaje. No somos responsables de trámites de visado o vacunación.
        </TycSection>
      </div>
    </div>
  </div>
);

/* Summary Page: cost breakdown in white box with TyC header */
const SummaryPage = ({
  hotelDetalleHtml,
  cotizacion,
  showAllCategories = false,
  editable = false,
  onHtmlChange = null,
  availableCategories = [],
  excelPreviewCategories = [],
  onToggleExcelPreviewCategory = null,
  showCategoryFilters = false,
}) => {
  // Fetch hotel dictionary for computing category rows when not saved
  const { byCategory: hotelDict } = useHotelQuoteDictionary({
    axios,
    tariffType: resolveQuotationTariffType(cotizacion),
    agencyId: Number(cotizacion?.agency_id || 1),
  });

  const resolvedHotelForRows = useMemo(
    () => resolvePdfSelectedHotel(cotizacion, hotelDetalleHtml),
    [cotizacion, hotelDetalleHtml],
  );
  const hasSavedRows =
    getPdfHotelCategoryRows(cotizacion, resolvedHotelForRows).length > 0;

  const hasValidHtml = (() => {
    if (!hotelDetalleHtml) return false;
    if (typeof hotelDetalleHtml === "string")
      return hotelDetalleHtml.length > 0;
    if (typeof hotelDetalleHtml === "object") {
      return !!(hotelDetalleHtml.fullHtml || hotelDetalleHtml.html);
    }
    return false;
  })();

  const packageType =
    cotizacion?.packagetype || cotizacion?.packageType || "compartido";
  const effectiveExcelPreviewCategories = useMemo(() => {
    if (
      Array.isArray(excelPreviewCategories) &&
      excelPreviewCategories.length
    ) {
      const selected = excelPreviewCategories.map((category) =>
        String(category),
      );
      const allCategoriesSelected =
        availableCategories.length > 1 &&
        selected.length >= availableCategories.length &&
        availableCategories.every((option) =>
          selected.includes(String(option.category)),
        );
      return allCategoriesSelected ? [] : selected;
    }
    return [];
  }, [availableCategories, excelPreviewCategories]);

  const roomOptionsByCategory = useMemo(
    () =>
      buildRoomOptionsByCategory(
        hotelDict,
        resolveQuotationTariffType(cotizacion),
        packageType,
      ),
    [hotelDict, packageType],
  );

  // Extract full rendered HTML from hotel_detalle (version 4 stores it as fullHtml)
  const html = useMemo(() => {
    const savedHtml =
      typeof hotelDetalleHtml === "string"
        ? hotelDetalleHtml
        : hotelDetalleHtml?.fullHtml || hotelDetalleHtml?.html || "";

    // Prefer live generation so automatic day titles and totals are not frozen by
    // default hotel_detalle snapshots. Saved HTML remains only as fallback.
    if (!cotizacion) return null;
    try {
      const ac = cotizacion.additionalcosts || cotizacion.additionalCosts || {};
      const days = getPdfItineraryDays(cotizacion);
      const titulo = cotizacion.titulo || "Cotización";
      const pc = cotizacion.peopleCount || cotizacion.peoplecount || {};
      const nn = (v) => (typeof v === "number" ? v : parseFloat(v) || 0);

      // Derive adultsCount reliably from saved additionalcosts math:
      // percentageBase = subtotalIndividual + hotelPerAdult
      // hotelPerAdult = hotelAdultTotal / adults
      // => adults = hotelAdultTotal / (percentageBase - subtotalIndividual)
      const savedPerAdultHotel =
        nn(ac.percentageBase) - nn(ac.subtotalIndividual);
      const adultsFromMath =
        savedPerAdultHotel > 0
          ? Math.round(nn(ac.hotelAdultTotal) / savedPerAdultHotel)
          : 0;
      const adultsCount = Math.max(
        1,
        adultsFromMath ||
          Number(pc.adults) ||
          Number(cotizacion.cantidadpersonas || cotizacion.cantidadPersonas) ||
          1,
      );
      // Derive children: total pax - adults, or from peopleCount
      const totalPax =
        Number(cotizacion.cantidadpersonas || cotizacion.cantidadPersonas) || 0;
      const childrenCount =
        Number(pc.children) || Math.max(0, totalPax - adultsCount);
      const nights = Math.max(1, days.length - 1);
      const hotelConfig =
        resolvePdfSelectedHotel(cotizacion, hotelDetalleHtml) || {};

      const previewContext = buildPdfHotelPreviewRows({
        cotizacion,
        resolvedHotel: hotelConfig,
        roomOptionsByCategory,
        packageType,
      });
      let categoryRows = previewContext.categoryRows || [];

      // Fallback: compute from hotel dictionary (all categories)
      if (
        categoryRows.length === 0 &&
        Object.keys(roomOptionsByCategory).length > 0
      ) {
        categoryRows = buildCategoryRowsFromDict({
          roomOptionsByCategory,
          selectedCategory: hotelConfig.category,
          priceOverrides: hotelConfig.priceOverrides,
          savedMix: hotelConfig.mix,
          adultsCount,
          selectedNights: Array.isArray(hotelConfig.selectedNightIndices)
            ? hotelConfig.selectedNightIndices.length
            : Number(hotelConfig.nights) || nights,
          defaultNights: nights,
          subtotalIndividual: Number(ac.subtotalIndividual) || 0,
          additionalCosts: ac,
          childrenCount,
          baseExplicitChildTotal: Number(
            ac.nonHotelExplicitChildTotal ??
              ac.baseExplicitChildTotal ??
              ac.subtotalNinos ??
              0,
          ),
          baseConvertedChildTotal: Number(
            ac.nonHotelConvertedChildTotal ?? ac.baseConvertedChildTotal ?? 0,
          ),
          nonHotelConvertedChildTotal: Number(
            ac.nonHotelConvertedChildTotal ?? ac.baseConvertedChildTotal ?? 0,
          ),
          baseExplicitChildTotalsById:
            ac.nonHotelExplicitChildTotalsById ||
            ac.baseExplicitChildTotalsById ||
            {},
          baseConvertedChildTotalsById:
            ac.nonHotelConvertedChildTotalsById ||
            ac.baseConvertedChildTotalsById ||
            {},
          hotelExplicitChildTotalsById: ac.hotelExplicitChildTotalsById || {},
          hotelConvertedChildTotalsById: ac.hotelConvertedChildTotalsById || {},
        });
      }

      // Last fallback: single row from additionalcosts
      if (categoryRows.length === 0 && ac.subtotalIndividual) {
        const nn = (v) => (typeof v === "number" ? v : parseFloat(v) || 0);
        const base = nn(ac.percentageBase) || nn(ac.subtotalIndividual);
        const totalAdditional =
          nn(ac.totalAdditional) ||
          nn(ac.calculatedFee) + nn(ac.calculatedOperational) + nn(ac.extraFee);
        const total = Math.round((base + totalAdditional) * 100) / 100;
        const cat = hotelConfig.category || "3";
        categoryRows = [
          { category: cat, label: `${cat} Estrellas`, totalPerAdult: total },
        ];
      }

      if (categoryRows.length > 0 || Object.keys(ac).length > 0) {
        const previewPeopleCount = previewContext.peopleCount || {
          adults: adultsCount,
          children: childrenCount,
        };
        const summaryPricingSource = {
          ...cotizacion,
          selectedHotel: hotelConfig,
          selected_hotel: hotelConfig,
          peopleCount: previewPeopleCount,
          peoplecount: previewPeopleCount,
          additionalCosts: ac,
          additionalcosts: ac,
          precio_it_ext_adulto: previewContext.externalAdultTotal,
          precio_it_ext_ninos:
            previewContext.externalChildTotal +
            previewContext.externalConvertedChildTotal,
        };
        const summaryPricingModel = buildSummaryContentPricingModel(
          summaryPricingSource,
        );
        const generatedHtml = buildCotizacionPreviewHtml({
          cotizacion: summaryPricingSource,
          pricingModel: summaryPricingModel,
          summaryVisibleParts: summaryPricingModel.parts,
          titulo,
          days,
          fechaInicio: cotizacion.fechainicio || cotizacion.fechaInicio || null,
          nights,
          breakfasts: nights,
          packageType,
          categoryRows,
          peopleCount: previewPeopleCount,
          accommodationType: "doble o matrimonial",
          mealsIncluded: 0,
          selectedCat: hotelConfig.category,
          selectedHotel: hotelConfig,
          onlySelectedCat: !showAllCategories,
          previewCategories: effectiveExcelPreviewCategories,
          externalAdultTotal: previewContext.externalAdultTotal,
          externalChildTotal: previewContext.externalChildTotal,
          externalConvertedChildTotal:
            previewContext.externalConvertedChildTotal,
          additionalCosts: ac,
        });

        return applyHotelDetalleToGeneratedHtml(
          generatedHtml,
          hotelDetalleHtml,
        );
      }
    } catch {
      /* ignore generation errors */
    }
    return savedHtml || null;
  }, [
    hotelDetalleHtml,
    cotizacion,
    roomOptionsByCategory,
    packageType,
    showAllCategories,
    effectiveExcelPreviewCategories,
  ]);

  if (!html) return null;
  return (
    <div
      className="pdf-page pdf-page--summary-portrait"
      style={{
        ...tycPageStyle,
        padding: "12px 16px 14px",
      }}
    >
      <TycPageHeader showTitle={false} />
      <div className="pdf-summary-sheet">
        <div className="pdf-summary-sheet__header">
          <h2>Resumen de Cotización</h2>
          {showCategoryFilters && availableCategories.length > 1 && (
            <div className="hpp-header-actions pdf-hotel-filter-actions">
              <div className="hpp-filter-chips pdf-hotel-filter-chips">
                {availableCategories.map((cat) => {
                  const chip = formatPdfHotelCategoryChip(cat);
                  const category = chip.category;
                  const isActive =
                    effectiveExcelPreviewCategories.includes(category);
                  return (
                    <button
                      key={category}
                      type="button"
                      className={`hpp-cat-chip pdf-hotel-cat-chip ${isActive ? "active" : ""}`}
                      onClick={() => onToggleExcelPreviewCategory?.(category)}
                      title={
                        isActive
                          ? `Ocultar ${chip.title}`
                          : `Mostrar ${chip.title}`
                      }
                    >
                      <MdStar className="pdf-hotel-cat-chip__icon" />
                      <span>{chip.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div
          className="pdf-summary-sheet__frame"
          style={{
            background: "#fff",
            borderRadius: "8px",
            padding: "8px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
            overflow: "hidden",
          }}
        >
          <div className="pdf-summary-sheet__scale">
            {editable ? (
              <HotelSummarySection
                editableExcelPreview={true}
                previewClassName="hpm-preview-html--quotation"
                previewHtml={html}
                onPreviewHtmlChange={onHtmlChange}
              />
            ) : (
              <div dangerouslySetInnerHTML={{ __html: html }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export { SummaryPage };

export const TycPages = () => (
  <>
    {TYC_2026_PAGES.map((page, index) => (
      <TycDocPage page={page} index={index} key={`tyc-2026-${index}`} />
    ))}
  </>
);

/* =========================
 TYC HTML PARA EXPORT PDF
========================= */

const tycPageCss = `background:#005f56;color:#f6f2eb;font-family:'Montserrat',sans-serif;position:relative;overflow:hidden;padding:14px 22px 20px;`;
const tycLogoCss = `position:absolute;top:8px;left:10px;width:52px;height:auto;filter:brightness(0) invert(1);`;
const tycTagCss = `position:absolute;top:10px;right:18px;text-align:right;font-size:11px;line-height:1.4;font-weight:400;color:#f6f2eb;`;
const tycH1Css = `text-align:center;font-size:32px;font-weight:800;letter-spacing:1px;margin-top:36px;margin-bottom:12px;text-transform:uppercase;color:#f6f2eb;`;
const tycGridCss = `display:grid;grid-template-columns:1fr 2px 1fr;gap:5px;align-items:start;margin-top:36px;padding:0 10px;`;
const tycGridFirstCss = `display:grid;grid-template-columns:1fr 2px 1fr;gap:5px;align-items:start;margin-top:6px;padding:0 10px;`;
const tycDivCss = `background:#cfa33b;min-height:340px;`;
const tycColCss = `font-size:13px;line-height:1.45;color:rgba(246,242,235,0.95);`;
const tycH3Css = `font-size:14.5px;font-weight:700;color:#f6f2eb;margin-bottom:3px;`;

const tycHeader = (showTitle) => `
 <img src="${marcaAguaWhite}" alt="Venso" style="${tycLogoCss}" />
 <div style="${tycTagCss}">"Creando Experiencias con<br/>Sabor Peruano"</div>
 ${showTitle ? `<h1 style="${tycH1Css}">TÉRMINOS Y CONDICIONES</h1>` : ``}
`;

const tycSec = (title, text) =>
  `<div style="margin-bottom:8px;">${title ? `<h3 style="${tycH3Css}">${title}</h3>` : ""}<p style="margin:0;">${text}</p></div>`;

const escapeTycHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getTermsAndConditionsCopy = (idioma = "es") =>
  TERMS_AND_CONDITIONS_COPY[normalizeTycLanguage(idioma)] || TERMS_AND_CONDITIONS_COPY.es;

const termsIconHtml = () =>
  `<div style="width:32px;height:32px;border:2px solid rgba(255,255,255,.86);border-radius:6px;position:relative;margin-top:2px;flex:0 0 auto;"><span style="position:absolute;left:5px;right:5px;top:8px;height:2px;background:rgba(255,255,255,.86);box-shadow:0 6px 0 rgba(255,255,255,.86),0 12px 0 rgba(255,255,255,.86);"></span><span style="position:absolute;width:16px;height:2.5px;background:rgba(255,255,255,.86);transform:rotate(-42deg);right:-6px;bottom:5px;border-radius:3px;"></span></div>`;

const termsSectionHtml = (section) => {
  const body = section.body
    ? `<p style="color:#fff;font-size:9.75px;line-height:1.23;font-weight:500;margin:0;">${escapeTycHtml(section.body)}</p>`
    : "";
  const bullets = Array.isArray(section.bullets) && section.bullets.length
    ? `<ul style="color:#fff;font-size:9.75px;line-height:1.23;font-weight:500;margin:4px 0 0;padding-left:13px;">${section.bullets
        .map((item) => `<li style="margin-bottom:3px;">${escapeTycHtml(item)}</li>`)
        .join("")}</ul>`
    : "";

  return `<div style="display:grid;grid-template-columns:42px 1fr;column-gap:12px;align-items:start;">${termsIconHtml()}<div><h3 style="color:#f4bd18;font-size:12.2px;line-height:1.12;font-weight:900;margin:0 0 5px;">${escapeTycHtml(section.title)}</h3>${body}${bullets}</div></div>`;
};

export const getTermsAndConditionsPageHtml = (
  idioma = "es",
  cotizacion = null,
) => {
  const copy = getTermsAndConditionsCopy(idioma);
  const labels = getCanvaClosingCopy(idioma);
  const [reservationSections, purchaseSections] = chunkReservationSections(
    copy.sections,
  );
  const backdrop = resolveCanvaBackdropSrc(cotizacion);

  const sectionsHtml = (sections) =>
    `<div class="canva-legal-sections canva-closing-copy">${sections
      .map((section) => {
        const body = section.body
          ? `<p>${escapeTycHtml(section.body)}</p>`
          : "";
        const bullets = Array.isArray(section.bullets) && section.bullets.length
          ? `<ul>${section.bullets
              .map((item) => `<li>${escapeTycHtml(item)}</li>`)
              .join("")}</ul>`
          : "";
        return `<section class="canva-legal-section"><h3>${escapeTycHtml(
          section.title,
        )}</h3>${body}${bullets}</section>`;
      })
      .join("")}</div>`;

  const page = (className, title, sections) => `
 <div class="pdf-page canva-closing-page ${className}">
  <img src="${escapeTycHtml(backdrop)}" data-pdf-full-src="${escapeTycHtml(
    backdrop,
  )}" class="canva-closing-backdrop" alt="" loading="eager" decoding="sync" />
  <div class="canva-closing-veil"></div>
  <div class="canva-closing-content">
   <h2 class="canva-closing-title">${escapeTycHtml(title)}</h2>
   ${sectionsHtml(sections)}
   <div class="canva-legal-signature">VENSO TOURS · CUSCO, PERÚ</div>
  </div>
 </div>`;

  return [
    page("tyc-reservation-page", labels.reservationTitle, reservationSections),
    page("tyc-purchase-page", labels.purchaseTitle, purchaseSections),
  ].join("");
};

const tycBlockHtml = (block) => {
  const titleHtml = block.title
    ? `<h3 style="${tycH3Css}">${escapeTycHtml(block.title)}</h3>`
    : "";

  if (block.type === "table") {
    const headerHtml = block.headers
      .map(
        (header) =>
          `<th style="text-align:left;padding:8px 9px;font-weight:700;color:#f6f2eb;border:1px solid rgba(246,242,235,0.48);background:rgba(246,242,235,0.08);">${escapeTycHtml(header)}</th>`,
      )
      .join("");
    const rowHtml = block.rows
      .map(
        ([concepto, cargo]) =>
          `<tr><td style="width:39%;padding:8px 9px;border:1px solid rgba(246,242,235,0.48);vertical-align:top;">${escapeTycHtml(concepto)}</td><td style="width:61%;padding:8px 9px;border:1px solid rgba(246,242,235,0.48);vertical-align:top;">${escapeTycHtml(cargo)}</td></tr>`,
      )
      .join("");
    return `<div style="margin-bottom:8px;">${titleHtml}<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:4px;table-layout:fixed;border:1px solid rgba(246,242,235,0.65);"><colgroup><col style="width:39%;"/><col style="width:61%;"/></colgroup><thead><tr>${headerHtml}</tr></thead><tbody>${rowHtml}</tbody></table></div>`;
  }

  const paragraphHtml = (block.paragraphs || [])
    .map(
      (paragraph) =>
        `<p style="margin:0 0 5px;${block.small ? "font-size:11px;font-style:italic;" : ""}">${escapeTycHtml(paragraph)}</p>`,
    )
    .join("");
  const listHtml = block.list?.length
    ? `<ul style="margin:4px 0 0;padding-left:16px;">${block.list
        .map(
          (item) =>
            `<li style="margin-bottom:3px;">${escapeTycHtml(item)}</li>`,
        )
        .join("")}</ul>`
    : "";

  return `<div style="margin-bottom:8px;">${titleHtml}${paragraphHtml}${listHtml}</div>`;
};

const buildTycPagesHtmlFromData = () => {
  const tycPage = (page, index) => `
 <div class="pdf-page" style="${tycPageCss}">
 ${tycHeader(!!page.showTitle)}
 ${
   page.layout === "full"
     ? `<div style="margin-top:46px;padding:0 26px;${tycColCss}">${page.blocks.map(tycBlockHtml).join("")}</div>`
     : `<div style="${index === 0 ? tycGridFirstCss : tycGridCss}">
 <div style="${tycColCss}">${page.left.map(tycBlockHtml).join("")}</div>
 <div style="${tycDivCss}"></div>
 <div style="${tycColCss}">${page.right.map(tycBlockHtml).join("")}</div>
 </div>`
 }
 </div>`;

  return TYC_2026_PAGES.map(tycPage).join("");
};

export const getTycPagesHtml = () => {
  return buildTycPagesHtmlFromData();

  const p1Left = [
    tycSec(
      "1. Vuelos Domésticos (Perú)",
      "Sujetos a las condiciones de la tarifa comprada. Cambios o reprogramaciones aplican con pago de diferencia tarifaria + penalidad de USD 30 + cargo por reemisión de USD 16 por pasajero. En casos de fuerza mayor (clima, desastres, disposiciones gubernamentales o cierres oficiales), aplican las políticas del proveedor correspondiente. En caso de emisión por grupo, aplican penalidades específicas de cada aerolínea (Sky, Latam u otras). La no presentación en el vuelo (no show) implica pérdida total del servicio sin reembolso.",
    ),
  ].join("");
  const p1Right = [
    tycSec(
      "Requisitos para Reprogramación de Vuelos",
      "El pasajero deberá pagar la diferencia tarifaria y la penalidad establecida por la aerolínea, dentro del periodo de validez del boleto (sujeto a cambios según aerolínea). La solicitud debe enviarse por correo electrónico o mediante su asesor(a) de viajes, confirmando la reconfirmación de todo el grupo y brindando las nuevas fechas exactas de reprogramación del vuelo. Este trámite debe realizarse con un mínimo de 48 horas hábiles antes de la fecha y hora del vuelo. En el caso de emisiones por grupo, el plazo mínimo es de 72 horas. De no hacerlo, se considerará no show y se perderá el derecho a reprogramación.",
    ),
    tycSec(
      null,
      "Nota: Venso Tours realizará los mayores esfuerzos por mantener el programa contratado y el costo acordado, siempre que la reprogramación se gestione dentro de los plazos y condiciones establecidos y no existan incrementos oficiales de los proveedores.",
    ),
  ].join("");

  const p2Left = [
    tycSec(
      "2. Vuelos Internacionales",
      "Cambios y cancelaciones dependen exclusivamente de las políticas de la aerolínea. La agencia brinda soporte en la gestión, pero no asume responsabilidad por reembolsos. Las solicitudes de cambio/cancelación deben realizarse hasta 5 días hábiles antes de la fecha de viaje. La no presentación en el vuelo (no show) implica pérdida total del servicio sin reembolso.",
    ),
    tycSec(
      "3. Entradas a Machupicchu (DDC Cusco)",
      "No se permiten cambio de fecha ni de titular. Excepcionalmente solo se acepta cambio de número de pasaporte. No hay reembolsos, salvo casos de fuerza mayor (clima, desastres, disposiciones gubernamentales o cierres oficiales), aplican las políticas del proveedor correspondiente. El pasajero es responsable de presentarse puntualmente en el horario indicado de ingreso, sino se considera no show sin derecho a reembolso.",
    ),
  ].join("");
  const p2Right = [
    tycSec(
      "4. Trenes Turísticos (Perú Rail / Inca Rail)",
      "Se aplican cambios hasta 48 horas antes del horario de salida. Modificación de fecha: sujeta a disponibilidad del operador ferroviario. El proveedor aplicará un recargo del 10% sobre el valor del ticket. Adicionalmente, la agencia aplicará un gasto administrativo de USD 10 por persona por la gestión de reprogramación. No se devuelve diferencia si la tarifa es menor. En casos extraordinarios (huelgas, bloqueos, desastres naturales), aplican políticas oficiales de la empresa ferroviaria. En caso de no show, el ticket se pierde sin derecho a reembolso.",
    ),
  ].join("");

  const p3Left = [
    tycSec(
      "5. Hoteles",
      "Todas las reservas de hotel están sujetas a las políticas y condiciones de cada establecimiento. Los cambios de fechas (modificación de check-in o check-out) deben solicitarse con una anticipación mínima de 15 días calendario antes de la fecha de ingreso, quedando sujetos a la disponibilidad del hotel, las penalidades que este determine y a los gastos administrativos correspondientes. En caso de cancelación, se aplicarán las penalidades según las condiciones de la tarifa reservada, además de los gastos administrativos de la agencia.",
    ),
    tycSec(
      null,
      "En temporadas altas, feriados o fechas especiales, los hoteles pueden aplicar políticas de no reembolsable o mínimo de noches obligatorias, las cuales deberán ser respetadas. La agencia actuará como intermediaria en la gestión de cambios o cancelaciones, pero no garantiza la exoneración de penalidades ni reembolsos.",
    ),
  ].join("");
  const p3Right = [
    tycSec(
      "6. Cancelaciones Generales",
      "Una vez emitidos vuelos, trenes y entradas a Machupicchu, aplican las políticas de cada proveedor. En caso de cancelación por parte del pasajero, pueden generarse gastos administrativos (reprogramación de vuelos, compra de tickets de tren, reserva de hoteles, trámites de devolución) de USD 50 por persona + comisión correspondiente por transferencias internacionales y/o pagos con tarjeta de crédito, PayPal u otros medios, según corresponda. Si el horario reprogramado por la aerolínea no es conveniente, el pasajero podrá adquirir un nuevo vuelo; se entiende que los reembolsos y cambios dependen directamente de las políticas de cada proveedor, y la agencia actúa únicamente como intermediaria para gestionar el trámite.",
    ),
    tycSec(
      "Política de Cancelaciones y Devoluciones",
      "Aplica para paquetes y servicios turísticos en general: Cancelaciones con más de 70 días de anticipación: penalidad del 25% del total del servicio. Cancelaciones entre 70 y 45 días de anticipación: penalidad del 50%. Cancelaciones dentro de los 45 días previos al inicio del viaje, o en caso de no show: penalidad del 100% del total del servicio.",
    ),
  ].join("");

  const p4Left = [
    tycSec(
      "7. Responsabilidades",
      "El pasajero debe portar documentos válidos (pasaporte/visas), llegar puntual a los puntos de encuentro y cumplir las normas locales. La agencia no se hace responsable por retrasos, pérdidas o reprogramaciones derivados de causas externas (clima, bloqueos, huelgas, disposiciones gubernamentales). Asimismo, en estos casos, Venso Tours no cubrirá gastos adicionales como alojamiento, alimentación, transporte u otros costos derivados; dichos gastos serán asumidos por el pasajero, salvo lo que indique expresamente el proveedor correspondiente.",
    ),
    tycSec(
      null,
      "Venso Tours brindará asistencia para facilitar cambios según la disponibilidad de cada proveedor. Toda solicitud de cambio o cancelación debe realizarse a través de los canales oficiales de la agencia (correo institucional o directamente con la ejecutiva de ventas asignada).",
    ),
  ].join("");
  const p4Right = [
    tycSec(
      null,
      "La información personal del pasajero será utilizada únicamente para fines de reserva conforme a la Ley de Protección de Datos Personales N.° 29733 y su reglamento. La agencia no se responsabiliza por pérdida, robo o daño de objetos personales durante el viaje. Se recomienda mantenerlos siempre bajo resguardo. Por su seguridad, por favor no dejar objetos de valor en los buses, vans o autos. Cada pasajero es responsable de sus pertenencias.",
    ),
    tycSec(
      null,
      "Venso Tours actúa únicamente como intermediaria entre el pasajero y los proveedores de servicios turísticos (aerolíneas, empresas ferroviarias, hoteles, transportes, operadores locales, entre otros). Todas las reservas están sujetas a las políticas, condiciones y penalidades establecidas por dichos proveedores, las cuales son aceptadas por el pasajero al momento de confirmar su compra. La agencia no es responsable de modificaciones, cancelaciones o reembolsos que dependan directamente de los proveedores; sin embargo, brindará asistencia y soporte al pasajero para gestionar la solución más adecuada según las condiciones aplicables.",
    ),
  ].join("");

  const p5Left = [
    tycSec(
      "8. Itinerarios y Servicios",
      "El itinerario y servicios contratados están sujetos a cambios por factores externos (clima, disposiciones gubernamentales, bloqueos, entre otros). En caso de modificaciones, la agencia se compromete a ofrecer alternativas de igual o similar categoría.",
    ),
    tycSec(
      "9. Menores de Edad y Documentos de Viaje",
      "Los pasajeros menores de 18 años deben viajar acompañados por sus padres o tutores legales, o contar con la autorización notarial correspondiente en caso de viajar solos o con terceros. Es responsabilidad del pasajero portar documentos de identidad válidos (DNI, pasaporte, visas, permisos notariales u otros exigidos por las autoridades). Venso Tours no se responsabiliza por la imposibilidad de viajar ocasionada por la falta, error o invalidez de dichos documentos.",
    ),
  ].join("");
  const p5Right = [
    tycSec(
      "10. Pagos y Saldos Pendientes",
      "Para confirmar la reserva se requiere un depósito mínimo del 30% del monto total del servicio. La empresa podrá solicitar pagos adicionales antes de la emisión de servicios no reembolsables (boletos de tren, ingresos a Machu Picchu, vuelos, hoteles con prepago u otros), a fin de cubrir los costos operativos ya comprometidos con proveedores. El pasajero acepta que, en caso de cancelación, deberá asumir los costos efectivamente incurridos y no reembolsables por parte de los proveedores, aun cuando estos superen el porcentaje del depósito inicial realizado.",
    ),
    tycSec(
      null,
      "La empresa podrá requerir la cancelación total del servicio antes de las fechas de emisión establecidas por los proveedores. El saldo pendiente deberá cancelarse según el cronograma de pagos informado por su ejecutiva de ventas y, en todos los casos, antes del inicio del viaje. El incumplimiento en los pagos en las fechas establecidas podrá generar la suspensión o cancelación automática de reservas sin derecho a reembolso de los montos ya comprometidos con proveedores.",
    ),
  ].join("");

  const p6Left = [
    tycSec(
      "11. Seguros de Viaje",
      "Recomendación de contratación: Se aconseja a todos los pasajeros adquirir un seguro de viaje que cubra gastos médicos, cancelaciones, pérdida de equipaje y otros imprevistos. Limitación de responsabilidad: Venso Tours no asume responsabilidad por situaciones médicas, accidentes, gastos adicionales ni pérdidas derivadas de no contar con un seguro de viaje vigente. Asistencia en emergencias: En caso de emergencia, la agencia apoyará al pasajero facilitando la comunicación con la compañía aseguradora contratada.",
    ),
    tycSec(
      "12. Excursiones y Tours de un Día",
      "(Laguna Humantay, Montaña de Colores, City Tour, Valle Sagrado, entre otros). Cancelaciones hasta 72 horas antes del inicio del servicio: reembolso parcial con penalidad del 30% del valor total del tour. Cancelaciones dentro de las 72 horas previas, o en caso de no show, implican penalidad del 100% sin derecho a reembolso. Los horarios de recojo son aproximados y pueden variar por condiciones de tráfico, clima u otros factores externos. El pasajero debe portar su documento de identidad válido y, cuando corresponda, el boleto de ingreso a los atractivos turísticos.",
    ),
  ].join("");
  const p6Right = [
    tycSec(
      null,
      "La agencia no se responsabiliza por cambios en las condiciones climáticas, bloqueos de carreteras u otras causas de fuerza mayor que afecten el normal desarrollo del tour. El pasajero es responsable de llevar vestimenta y equipamiento adecuado para las excursiones de caminata (ropa abrigadora, poncho de lluvia, calzado de trekking, etc.). En caso de que el pasajero no pueda completar el recorrido por motivos de salud o falta de preparación física, no aplica reembolso. Para tours que incluyan transporte compartido, el pasajero debe respetar los horarios y las indicaciones del guía; la inasistencia al punto de encuentro se considera no show.",
    ),
    tycSec(
      "Resumen de Cargos y Penalidades",
      `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:4px;">
 <thead><tr style="border-bottom:1px solid #cfa33b;">
 <th style="text-align:left;padding:3px 4px;font-weight:700;color:#f6f2eb;">Concepto</th>
 <th style="text-align:left;padding:3px 4px;font-weight:700;color:#f6f2eb;">Cargo / Penalidad</th>
 </tr></thead>
 <tbody>
 <tr style="border-bottom:1px solid rgba(207,163,59,0.3);"><td style="padding:3px 4px;">Reprogramación vuelo doméstico</td><td style="padding:3px 4px;">USD 30</td></tr>
 <tr style="border-bottom:1px solid rgba(207,163,59,0.3);"><td style="padding:3px 4px;">Cargo por reemisión vuelo doméstico</td><td style="padding:3px 4px;">USD 16</td></tr>
 <tr style="border-bottom:1px solid rgba(207,163,59,0.3);"><td style="padding:3px 4px;">Gastos administrativos generales</td><td style="padding:3px 4px;">USD 50</td></tr>
 <tr style="border-bottom:1px solid rgba(207,163,59,0.3);"><td style="padding:3px 4px;">Reprogramación tren (PeruRail / IncaRail)</td><td style="padding:3px 4px;">10% sobre valor de ticket + USD 10</td></tr>
 <tr style="border-bottom:1px solid rgba(207,163,59,0.3);"><td style="padding:3px 4px;">Cancelación tren</td><td style="padding:3px 4px;">Sujeto a penalidades del operador</td></tr>
 <tr style="border-bottom:1px solid rgba(207,163,59,0.3);"><td style="padding:3px 4px;">Entradas a Machupicchu</td><td style="padding:3px 4px;">No reembolsables, según normativa oficial</td></tr>
 </tbody>
 </table>`,
    ),
    tycSec(
      null,
      "<em style='font-size:11px;'>Nota: A todos los precios, cargos y penalidades indicados se les adicionará la comisión correspondiente por transferencias internacionales y/o pagos con tarjeta de crédito, PayPal u otros medios, según corresponda. Este es un resumen de las políticas principales. Las condiciones completas están disponibles en nuestra oficina, a solicitud del pasajero y en nuestra página web: vensotours.com</em>",
    ),
  ].join("");

  const p7Left = [
    tycSec(
      "13. Proceso de Reserva",
      "La reserva se confirma únicamente con el pago del adelanto solicitado por la agencia y el envío del comprobante de pago. Hasta ese momento, los servicios están sujetos a disponibilidad.",
    ),
    tycSec(
      "Adelanto según categoría",
      "Categoría 3 estrellas: 30% del paquete completo. Categoría 4 estrellas: 40% del paquete completo. Categoría 5 estrellas: 50% del paquete completo.",
    ),
    tycSec(
      "14. Pagos",
      "Se solicita un adelanto para garantizar ingreso a Machu Picchu, trenes, hoteles y servicios. El saldo restante deberá ser cancelado como máximo 20 días antes del inicio del viaje. Los pagos con tarjeta de crédito pueden estar sujetos a recargos de 3% a 6%, según la plataforma elegida.",
    ),
    tycSec(
      "15. Tarifas",
      "Las tarifas están expresadas en dólares americanos (USD), vigentes del 1 de enero al 31 de diciembre de 2026, y pueden variar hasta la confirmación por disponibilidad de vuelos e ingreso a Machu Picchu.",
    ),
  ].join("");
  const p7Right = [
    tycSec(
      "16. Cambios, No Show y Documentación",
      "Los cambios de fecha están sujetos a disponibilidad y penalidades de proveedores como vuelos y trenes. En caso de no presentarse a un servicio contratado, no corresponde reembolso. Es responsabilidad del pasajero portar pasaporte vigente, boletos y documentación necesaria para el viaje.",
    ),
    tycSec(
      "17. Seguro de Viaje",
      "Se recomienda contratar un seguro de viaje que cubra cancelaciones, asistencia médica y pérdida de equipaje, especialmente cuando viajan adultos mayores, infantes o niños.",
    ),
    tycSec(
      "18. Fuerza Mayor",
      "No nos hacemos responsables por lesiones, pérdidas, accidentes, retrasos o problemas causados por terceros, ni por factores fuera de nuestro control como fenómenos naturales, enfermedades, conflictos, cuarentenas, huelgas o regulaciones gubernamentales. Nos reservamos el derecho de cambiar tours o excursiones si mejora la experiencia del viaje. No somos responsables de trámites de visado o vacunación.",
    ),
  ].join("");

  const tycPage = (left, right, isFirst) => `
 <div class="pdf-page" style="${tycPageCss}">
 ${tycHeader(isFirst)}
 <div style="${isFirst ? tycGridFirstCss : tycGridCss}">
 <div style="${tycColCss}">${left}</div>
 <div style="${tycDivCss}"></div>
 <div style="${tycColCss}">${right}</div>
 </div>
 </div>`;

  return (
    tycPage(p1Left, p1Right, true) +
    tycPage(p2Left, p2Right, false) +
    tycPage(p3Left, p3Right, false) +
    tycPage(p4Left, p4Right, false) +
    tycPage(p5Left, p5Right, false) +
    tycPage(p6Left, p6Right, false) +
    tycPage(p7Left, p7Right, false)
  );
};

export const getSummaryPageHtml = (
  hotelDetalleHtml,
  cotizacion = null,
  { roomOptionsByCategory = {} } = {},
) => {
  const savedHtml =
    typeof hotelDetalleHtml === "string"
      ? hotelDetalleHtml
      : hotelDetalleHtml?.fullHtml || hotelDetalleHtml?.html || "";
  let html = "";

  if (cotizacion) {
    try {
      const ac = cotizacion.additionalcosts || cotizacion.additionalCosts || {};
      const days = getPdfItineraryDays(cotizacion);
      const hotelConfig =
        resolvePdfSelectedHotel(cotizacion, hotelDetalleHtml) || {};
      const packageType =
        cotizacion?.packagetype || cotizacion?.packageType || "compartido";
      const previewContext = buildPdfHotelPreviewRows({
        cotizacion,
        resolvedHotel: hotelConfig,
        roomOptionsByCategory,
        packageType,
      });
      let categoryRows = previewContext.categoryRows || [];
      const peopleCount =
        cotizacion.peopleCount || cotizacion.peoplecount || {};
      const adultsCount = Math.max(
        1,
        Number(peopleCount.adults) ||
          Number(cotizacion.cantidadpersonas || cotizacion.cantidadPersonas) ||
          1,
      );
      const totalPax =
        Number(cotizacion.cantidadpersonas || cotizacion.cantidadPersonas) || 0;
      const childrenCount =
        Number(peopleCount.children) || Math.max(0, totalPax - adultsCount);
      const nights = Math.max(1, days.length - 1);

      if (
        categoryRows.length === 0 &&
        Object.keys(roomOptionsByCategory).length > 0
      ) {
        categoryRows = buildCategoryRowsFromDict({
          roomOptionsByCategory,
          selectedCategory: hotelConfig.category,
          priceOverrides: hotelConfig.priceOverrides,
          savedMix: hotelConfig.mix,
          adultsCount,
          selectedNights: Array.isArray(hotelConfig.selectedNightIndices)
            ? hotelConfig.selectedNightIndices.length
            : Number(hotelConfig.nights) || nights,
          defaultNights: nights,
          subtotalIndividual: Number(ac.subtotalIndividual) || 0,
          additionalCosts: ac,
          childrenCount,
          baseExplicitChildTotal: Number(
            ac.nonHotelExplicitChildTotal ??
              ac.baseExplicitChildTotal ??
              ac.subtotalNinos ??
              0,
          ),
          baseConvertedChildTotal: Number(
            ac.nonHotelConvertedChildTotal ?? ac.baseConvertedChildTotal ?? 0,
          ),
          nonHotelConvertedChildTotal: Number(
            ac.nonHotelConvertedChildTotal ?? ac.baseConvertedChildTotal ?? 0,
          ),
          baseExplicitChildTotalsById:
            ac.nonHotelExplicitChildTotalsById ||
            ac.baseExplicitChildTotalsById ||
            {},
          baseConvertedChildTotalsById:
            ac.nonHotelConvertedChildTotalsById ||
            ac.baseConvertedChildTotalsById ||
            {},
          hotelExplicitChildTotalsById: ac.hotelExplicitChildTotalsById || {},
          hotelConvertedChildTotalsById: ac.hotelConvertedChildTotalsById || {},
        });
      }

      const rawPreviewCategories =
        cotizacion?.pdf_excel_preview_categories ||
        cotizacion?.excelPreviewCategories ||
        cotizacion?.previewCategories ||
        [];
      const normalizedRowCategories = Array.from(
        new Set(
          categoryRows
            .map((row) => String(row?.category ?? "").trim())
            .filter(Boolean),
        ),
      );
      const normalizedPreviewCategories = Array.isArray(rawPreviewCategories)
        ? rawPreviewCategories
            .map((category) => String(category ?? "").trim())
            .filter(Boolean)
        : [];
      const allCategoriesSelected =
        normalizedRowCategories.length > 1 &&
        normalizedPreviewCategories.length >= normalizedRowCategories.length &&
        normalizedRowCategories.every((category) =>
          normalizedPreviewCategories.includes(category),
        );
      const previewCategories =
        normalizedPreviewCategories.length > 0 && !allCategoriesSelected
          ? normalizedPreviewCategories
          : hotelConfig.category
            ? [hotelConfig.category]
            : normalizedRowCategories.slice(0, 1);

      if (categoryRows.length > 0 || Object.keys(ac).length > 0) {
        const previewPeopleCount = previewContext.peopleCount || {
          adults: adultsCount,
          children: childrenCount,
        };
        const summaryPricingSource = {
          ...cotizacion,
          selectedHotel: hotelConfig,
          selected_hotel: hotelConfig,
          peopleCount: previewPeopleCount,
          peoplecount: previewPeopleCount,
          additionalCosts: ac,
          additionalcosts: ac,
          precio_it_ext_adulto: previewContext.externalAdultTotal,
          precio_it_ext_ninos:
            previewContext.externalChildTotal +
            previewContext.externalConvertedChildTotal,
        };
        const summaryPricingModel = buildSummaryContentPricingModel(
          summaryPricingSource,
        );
        const generatedHtml = buildCotizacionPreviewHtml({
          cotizacion: summaryPricingSource,
          pricingModel: summaryPricingModel,
          summaryVisibleParts: summaryPricingModel.parts,
          titulo: cotizacion.titulo || "Cotización",
          days,
          fechaInicio: cotizacion.fechainicio || cotizacion.fechaInicio || null,
          nights,
          breakfasts: nights,
          packageType,
          categoryRows,
          peopleCount: previewPeopleCount,
          accommodationType: "doble o matrimonial",
          mealsIncluded: 0,
          selectedCat: hotelConfig.category,
          selectedHotel: hotelConfig,
          onlySelectedCat: true,
          previewCategories,
          externalAdultTotal: previewContext.externalAdultTotal,
          externalChildTotal: previewContext.externalChildTotal,
          externalConvertedChildTotal:
            previewContext.externalConvertedChildTotal,
          additionalCosts: ac,
        });
        html = applyHotelDetalleToGeneratedHtml(
          generatedHtml,
          hotelDetalleHtml,
        );
      }
    } catch {
      html = "";
    }
  }

  if (!html) html = savedHtml;
  if (!html) return "";
  return `<div class="pdf-page pdf-page--summary-portrait" style="${tycPageCss}padding:12px 16px 14px;">
 ${tycHeader(false)}
 <div class="pdf-summary-sheet" style="margin-top:20px;padding:0 8px;height:calc(100% - 38px);display:flex;flex-direction:column;min-height:0;">
 <div class="pdf-summary-sheet__header" style="display:flex;align-items:center;justify-content:flex-start;margin-bottom:8px;min-height:28px;">
 <h2 style="text-align:left;font-size:18px;font-weight:800;color:#f6f2eb;margin:0;text-transform:uppercase;letter-spacing:0.5px;">Resumen de Cotización</h2>
 </div>
 <div class="pdf-summary-sheet__frame" style="flex:1;min-height:0;background:#fff;border-radius:8px;padding:8px;box-shadow:0 2px 12px rgba(0,0,0,0.15);overflow:hidden;">
 <div class="pdf-summary-sheet__scale" style="transform:scale(0.64);transform-origin:top left;width:156.25%;margin:0;">${html}</div>
 </div>
 </div>
 </div>`;
};

/* =========================
 PRICING PAGE (landscape)  replaces old SummaryPage in cotizacion PDF
========================= */

function buildPricingCategoryRows(cotizacion, roomOptionsByCategory) {
  try {
    const hotelConfig =
      resolvePdfSelectedHotel(
        cotizacion,
        cotizacion?.hotel_detalle || cotizacion?.hotelDetalle,
      ) || {};
    const packageType =
      cotizacion?.packagetype || cotizacion?.packageType || "compartido";
    const previewCtx = buildPdfHotelPreviewRows({
      cotizacion,
      resolvedHotel: hotelConfig,
      roomOptionsByCategory,
      packageType,
    });
    let rows = previewCtx.categoryRows || [];
    if (!rows.length && Object.keys(roomOptionsByCategory).length > 0) {
      const ac =
        cotizacion?.additionalcosts || cotizacion?.additionalCosts || {};
      const days = getPdfItineraryDays(cotizacion);
      const nights = Math.max(1, days.length - 1);
      const pc = cotizacion?.peopleCount || cotizacion?.peoplecount || {};
      const adultsCount = Math.max(
        1,
        Number(pc.adults) ||
          Number(
            cotizacion?.cantidadpersonas || cotizacion?.cantidadPersonas,
          ) ||
          1,
      );
      const totalPax =
        Number(cotizacion?.cantidadpersonas || cotizacion?.cantidadPersonas) ||
        0;
      const childrenCount =
        Number(pc.children) || Math.max(0, totalPax - adultsCount);
      rows = buildCategoryRowsFromDict({
        roomOptionsByCategory,
        selectedCategory: hotelConfig.category,
        priceOverrides: hotelConfig.priceOverrides,
        savedMix: hotelConfig.mix,
        adultsCount,
        selectedNights: Array.isArray(hotelConfig.selectedNightIndices)
          ? hotelConfig.selectedNightIndices.length
          : Number(hotelConfig.nights) || nights,
        defaultNights: nights,
        subtotalIndividual: Number(ac.subtotalIndividual) || 0,
        additionalCosts: ac,
        childrenCount,
        baseExplicitChildTotal: Number(
          ac.nonHotelExplicitChildTotal ??
            ac.baseExplicitChildTotal ??
            ac.subtotalNinos ??
            0,
        ),
        baseConvertedChildTotal: Number(
          ac.nonHotelConvertedChildTotal ?? ac.baseConvertedChildTotal ?? 0,
        ),
        nonHotelConvertedChildTotal: Number(
          ac.nonHotelConvertedChildTotal ?? ac.baseConvertedChildTotal ?? 0,
        ),
        baseExplicitChildTotalsById:
          ac.nonHotelExplicitChildTotalsById ||
          ac.baseExplicitChildTotalsById ||
          {},
        baseConvertedChildTotalsById:
          ac.nonHotelConvertedChildTotalsById ||
          ac.baseConvertedChildTotalsById ||
          {},
        hotelExplicitChildTotalsById: ac.hotelExplicitChildTotalsById || {},
        hotelConvertedChildTotalsById: ac.hotelConvertedChildTotalsById || {},
      });
    }
    return { rows, hotelConfig };
  } catch {
    return { rows: [], hotelConfig: {} };
  }
}

const PAGE_PRICING_BG = "/pdf-static-pages/page_pricing.webp";

const PRICING_CAT_LABELS = {
  2: "2★★ Estándar",
  3: "3★★★ Estándar",
  "3s": "3★★★ Superior",
  4: "4★★★★ Estrellas",
  5: "5★★★★★ Estrellas",
};

const normPricingLabel = (label = "", cat = "") => {
  const key = String(cat).trim().toLowerCase();
  if (!label) {
    return String(
      PRICING_CAT_LABELS[key] || PRICING_CAT_LABELS[cat] || `${cat} Estrellas`,
    )
      .replace(/â˜…/g, "★")
      .replace(/EstÃ¡ndar/g, "Estándar");
  }
  const cleaned = label.replace(/\*+/g, (m) => "★".repeat(m.length)).trim();
  return cleaned
    .replace(/â˜…/g, "★")
    .replace(/EstÃ¡ndar/g, "Estándar")
    .replace(/CotizaciÃ³n/g, "Cotización");
};

const cleanPricingCategoryLabel = (label = "", cat = "") => {
  const key = pricingCategoryKey(cat);
  const fallbackLabels = {
    2: "2\u2605\u2605 Est\u00e1ndar",
    3: "3\u2605\u2605\u2605 Est\u00e1ndar",
    "3s": "3\u2605\u2605\u2605 Superior",
    4: "4\u2605\u2605\u2605\u2605 Estrellas",
    5: "5\u2605\u2605\u2605\u2605\u2605 Estrellas",
  };
  const normalized = normPricingLabel(label, cat)
    .replace(/Ã¢Ëœâ€¦|â˜…/g, "\u2605")
    .replace(/EstÃƒÂ¡ndar|EstÃ¡ndar/g, "Est\u00e1ndar")
    .replace(/CotizaciÃƒÂ³n|CotizaciÃ³n/g, "Cotizaci\u00f3n");
  return fallbackLabels[key] || fallbackLabels[String(cat)] || normalized;
};

const pricingNumber = (value) => {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const pricingMoney = (value) => {
  const cleaned = String(value || "")
    .replace(/[^\d.,-]/g, "")
    .replace(/,/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const pricingRound2 = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const pricingArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return pricingArray(parsed);
    } catch {
      return [];
    }
  }
  if (typeof value === "object") return Object.values(value);
  return [];
};

const pricingCategoryKey = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

const stripPricingText = (value) =>
  String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const pricingRoomLabel = (value) => {
  const raw = stripPricingText(value || "");
  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const instanceMatch = raw.match(/(?:\s|^)(\d+)\s*$/);
  const instanceSuffix = instanceMatch ? ` ${instanceMatch[1]}` : "";
  if (normalized.includes("simple")) return `Habitación Simple${instanceSuffix}`;
  const hasDouble = normalized.includes("doble");
  const hasMatrimonial = normalized.includes("matrimonial");
  if (hasDouble && hasMatrimonial) {
    return `Habitación Doble / Matrimonial${instanceSuffix}`;
  }
  if (hasDouble) return `Habitación Doble${instanceSuffix}`;
  if (hasMatrimonial) return `Habitación Matrimonial${instanceSuffix}`;
  if (normalized.includes("triple")) return `Habitación Triple${instanceSuffix}`;
  if (normalized.includes("familiar") || normalized.includes("cuadruple")) {
    return `Habitación Familiar${instanceSuffix}`;
  }
  if (normalized.includes("sin hotel")) return "Sin hotel";
  return raw || "Habitación";
};

const getPreviewPriceRowCategories = (row, fallback = "") => {
  const attr = String(row?.getAttribute?.("data-preview-price-categories") || "")
    .split(",")
    .map(pricingCategoryKey)
    .filter(Boolean);
  if (attr.length > 0) return Array.from(new Set(attr));
  const key = pricingCategoryKey(fallback);
  return key ? [key] : [];
};

const getPreviewPriceRowHotelLabel = (row) =>
  stripPricingText(row?.getAttribute?.("data-preview-hotel-categories-label"));

const pricingPriceSignature = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => `${item.roomKey || item.label || ""}:${pricingNumber(item.value)}`)
    .join("|");

const getPricingRowDisplayLabel = (row = {}) =>
  row?.pricingPageCategoryLabel ||
  cleanPricingCategoryLabel(row?.label, row?.category);

const collapseGroupedPricingRows = (rows = []) => {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const groupedLabel = String(row?.pricingPageCategoryLabel || "").trim();
    if (!groupedLabel || !groupedLabel.includes("/")) return true;
    const key = [
      groupedLabel,
      pricingPriceSignature(row?.pricingPagePrices),
      pricingPriceSignature(row?.pricingPageChildPrices),
    ].join("::");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const escapePricingHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const firstPricingText = (...values) =>
  values.map(stripPricingText).find((value) => value.length > 0) || "";

const readPricingAdditionalCosts = (cotizacion = {}) => {
  const raw =
    cotizacion?.additionalcosts ||
    cotizacion?.additionalCosts ||
    cotizacion?.additional_costs ||
    {};
  if (!raw || typeof raw !== "string") return raw || {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const serviceLooksExternal = (service = {}) =>
  Boolean(
    service?.isExternal ||
    service?.is_external ||
    service?.external ||
    service?.externalItinerary ||
    service?.external_itinerary ||
    service?.isExternalItinerary ||
    service?.itinerarioExterno ||
    service?.itinerario_externo,
  );

const getPricingExternalDays = (cotizacion = {}) => {
  const additional = readPricingAdditionalCosts(cotizacion);
  const explicitRootDays = getPdfExternalItineraryDays(cotizacion);
  const explicitAdditionalDays = [
    ...pricingArray(additional?.externalItineraryItems),
    ...pricingArray(additional?.itinerario_externo),
    ...pricingArray(additional?.itinerarioExterno),
    ...pricingArray(additional?.externalDays),
    ...pricingArray(additional?.externalItinerary),
  ];
  const explicitDays =
    explicitRootDays.length > 0 ? explicitRootDays : explicitAdditionalDays;

  const flaggedMainDays = pricingArray(
    cotizacion?.dias ?? cotizacion?.itinerario ?? [],
  )
    .map((day) => {
      const externalServices = pricingArray(day?.servicios).filter(
        serviceLooksExternal,
      );
      return externalServices.length
        ? { ...day, servicios: externalServices }
        : null;
    })
    .filter(Boolean);

  return [...explicitDays, ...flaggedMainDays];
};

const getExternalServiceTitle = (service = {}, pricing = {}) => {
  const child =
    service.childService || service.child_service || service.child || {};
  const parent =
    service.parentService || service.parent_service || service.parent || {};
  const tariff = service.tariff || service.assignedTariff || {};
  const serviceType = String(
    pricing.serviceType || parent.typeService || service.typeService || "",
  ).toLowerCase();

  if (serviceType === "trenes") {
    const train = firstPricingText(
      child.tipo_tren,
      tariff.nombre,
      parent.nombre,
    );
    const route = firstPricingText(
      child.lugar_salida && child.lugar_destino
        ? `${child.lugar_salida} - ${child.lugar_destino}`
        : "",
    );
    return firstPricingText(
      train ? `Tren ${train}${route ? ` ${route}` : ""}` : "",
      service.nombre,
      parent.nombre,
    );
  }

  if (serviceType === "tickets") {
    const ticket = child.ticket || child;
    return firstPricingText(
      ticket.nombre,
      ticket.titulo,
      child.nombre,
      parent.nombre,
      service.nombre,
    );
  }

  return firstPricingText(
    service.displayName,
    service.nombre,
    service.name,
    service.titulo,
    service.title,
    child.nombre,
    child.name,
    child.titulo,
    child.title,
    child.tour_nombre,
    child.descripcion,
    child.servicio_extra?.nombre,
    child.ticket?.entrada,
    child.restaurante?.nombre,
    child.tipo_tren,
    child.tipo_habitacion,
    parent.nombre,
    parent.name,
    parent.titulo,
    parent.title,
    tariff.nombre,
    tariff.name,
    tariff.descripcion,
  );
};

const buildPricingExternalServiceItems = (cotizacion = null) => {
  const days = getPricingExternalDays(cotizacion || {});
  const seen = new Set();
  const items = [];

  days.forEach((day) => {
    const services = pricingArray(day?.servicios);
    services.forEach((service) => {
      const pricing = getServicePricingSnapshot(service);
      const price =
        pricingNumber(pricing.precioAdult) ||
        pricingNumber(pricing.amountPerAdult) ||
        pricingNumber(pricing.total) ||
        pricingNumber(service?.pricePerPerson) ||
        pricingNumber(service?.totalPrice) ||
        pricingNumber(service?.precioAdult) ||
        pricingNumber(service?.precio_adult) ||
        pricingNumber(service?.assigned_precio_adulto_dividido) ||
        pricingNumber(service?.assignedPrecioServicio) ||
        pricingNumber(service?.assigned_precio_servicio) ||
        pricingNumber(service?.tariff?.precio) ||
        pricingNumber(service?.tariff?.precio_original) ||
        pricingNumber(service?.assignedTariff?.precio) ||
        pricingNumber(service?.assignedTariff?.precio_original);

      if (price <= 0) return;

      const title = getExternalServiceTitle(service, pricing);
      if (!title) return;

      const key = `${title.toLowerCase()}|${Math.ceil(price)}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ title, price });
    });
  });

  if (items.length > 0) return items.slice(0, 8);

  const additional = readPricingAdditionalCosts(cotizacion || {});
  const people = cotizacion?.peopleCount || cotizacion?.peoplecount || {};
  const adults = Math.max(
    1,
    pricingNumber(people.adults) ||
      pricingNumber(
        cotizacion?.cantidadpersonas || cotizacion?.cantidadPersonas,
      ) ||
      1,
  );
  const fallbackTotal =
    pricingNumber(additional?.externalAdultTotal) ||
    pricingNumber(additional?.externalItineraryAdultTotal) ||
    pricingNumber(additional?.externalItineraryTotal) / adults ||
    pricingNumber(additional?.contingencyAmount) / adults;

  return fallbackTotal > 0
    ? [{ title: "Itinerario adicional", price: fallbackTotal }]
    : [];
};

const PRICING_OPTIONAL_SERVICE_ITEMS = [
  { title: "Tren Vistadome Observatory por 1 tramo", price: 70 },
  { title: "Tren Vistadome de retorno", price: 50 },
  { title: "Cuatrimoto en montaña de colores simple", price: 96 },
  { title: "Cuatrimoto en montaña de colores doble", price: 65 },
  { title: "Pachamanca (Apartir de 4 pax)", price: 200 },
  { title: "Montaña Machupicchu o Huaynapicchu", price: 70 },
  { title: "Almuerzo buffet en Santuary Lodge", price: 45 },
];


const PRICING_COPY = {
  es: {
    miniLabel: "planes de",
    title: "Precios",
    pricePerPerson: "Precio por persona",
    perPerson: "por persona",
    child: "Niño:",
    noData: "Sin datos de precios",
    optionalTitle: "Servicios adicionales / precio por persona",
    optionalItems: PRICING_OPTIONAL_SERVICE_ITEMS,
  },
  en: {
    miniLabel: "payment",
    title: "Plans",
    pricePerPerson: "Price per person",
    perPerson: "per person",
    child: "Child:",
    noData: "No pricing data",
    optionalTitle: "Additional services / price per person",
    optionalItems: [
      { title: "Vistadome Observatory train for one way", price: 70 },
      { title: "Return Vistadome train", price: 50 },
      { title: "Single ATV in Rainbow Mountain", price: 96 },
      { title: "Double ATV in Rainbow Mountain", price: 65 },
      { title: "Pachamanca (from 4 pax)", price: 200 },
      { title: "Machupicchu Mountain or Huaynapicchu", price: 70 },
      { title: "Buffet lunch at Sanctuary Lodge", price: 45 },
    ],
  },
  pt: {
    miniLabel: "planos de",
    title: "Pagamento",
    pricePerPerson: "Preço por pessoa",
    perPerson: "por pessoa",
    child: "Criança:",
    noData: "Sem dados de preços",
    optionalTitle: "Serviços adicionais / preço por pessoa",
    optionalItems: [
      { title: "Trem Vistadome Observatory por 1 trecho", price: 70 },
      { title: "Trem Vistadome de retorno", price: 50 },
      { title: "Quadriciclo simples na Montanha Colorida", price: 96 },
      { title: "Quadriciclo duplo na Montanha Colorida", price: 65 },
      { title: "Pachamanca (a partir de 4 pax)", price: 200 },
      { title: "Montanha Machupicchu ou Huaynapicchu", price: 70 },
      { title: "Almoço buffet no Sanctuary Lodge", price: 45 },
    ],
  },
};

const getPricingCopy = (idioma = "es") =>
  PRICING_COPY[normalizeTycLanguage(idioma)] || PRICING_COPY.es;

const PricingOptionalServicesBlock = ({ idioma = "es" }) => {
  const copy = getPricingCopy(idioma);
  const items = copy.optionalItems || PRICING_OPTIONAL_SERVICE_ITEMS;
  return (
  <div className="pricing-external-services pricing-external-services--optional">
    <div className="pricing-extra-title">{copy.optionalTitle}</div>
    {items.map((item, index) => (
      <div className="pricing-extra-row" key={`${item.title}-${index}`}>
        <span>{item.title}</span>
        <strong>${item.price.toLocaleString("es-PE")} USD</strong>
      </div>
    ))}
  </div>
  );
};

const ReservedDynamicExternalServicesBlock = ({ items = [], idioma = "es" }) => {
  if (!items.length) return null;
  const copy = getPricingCopy(idioma);

  return (
    <div className="pricing-external-services pricing-external-services--dynamic">
      <div className="pricing-extra-title">{copy.optionalTitle}</div>
      {items.map((item, index) => (
        <div className="pricing-extra-row" key={`${item.title}-${index}`}>
          <span>{item.title}</span>
          <strong>${Math.ceil(item.price).toLocaleString("es-PE")} USD</strong>
        </div>
      ))}
    </div>
  );
};

const getPricingOptionalServicesHtml =
  (idioma = "es") => {
    const copy = getPricingCopy(idioma);
    const items = copy.optionalItems || PRICING_OPTIONAL_SERVICE_ITEMS;
    return `<div class="pricing-external-services pricing-external-services--optional">
 <div class="pricing-extra-title">${escapePricingHtml(copy.optionalTitle)}</div>
 ${items.map(
   (item) =>
     `<div class="pricing-extra-row"><span>${escapePricingHtml(
       item.title,
     )}</span><strong>$${item.price.toLocaleString("es-PE")} USD</strong></div>`,
 ).join("")}
 </div>`;
  };

const getReservedDynamicExternalServicesHtml = (items = [], idioma = "es") =>
  items.length
    ? `<div class="pricing-external-services pricing-external-services--dynamic">
 <div class="pricing-extra-title">${escapePricingHtml(getPricingCopy(idioma).optionalTitle)}</div>
 ${items
   .map(
     (item) =>
       `<div class="pricing-extra-row"><span>${escapePricingHtml(
         item.title,
       )}</span><strong>$${Math.ceil(item.price).toLocaleString(
         "es-PE",
       )} USD</strong></div>`,
   )
   .join("")}
 </div>`
    : "";

const removeExternalFromPricingRows = (rows = [], externalAdultTotal = 0) => {
  const external = pricingNumber(externalAdultTotal);
  if (!external || external <= 0) return rows;

  const stripExternalValue = (value) => {
    const amount = pricingNumber(value);
    return amount > external ? pricingRound2(amount - external) : amount;
  };

  const stripExternalMap = (map) => {
    if (!map || typeof map !== "object" || Array.isArray(map)) return map;
    return Object.entries(map).reduce((acc, [key, value]) => {
      acc[key] = stripExternalValue(value);
      return acc;
    }, {});
  };

  return rows.map((row) => {
    const base = pricingNumber(row?.basePerAdult);
    const adicionales = pricingNumber(row?.adicionales);
    const current = pricingNumber(row?.totalPerAdult);
    const expectedWithExternal = pricingRound2(base + adicionales + external);
    const shouldStrip =
      current > 0 &&
      base + adicionales > 0 &&
      Math.abs(current - expectedWithExternal) <= 1;

    const explicitMaps = {
      ...(row?.priceByRoomType
        ? { priceByRoomType: stripExternalMap(row.priceByRoomType) }
        : {}),
      ...(row?.roomPriceMatrix
        ? { roomPriceMatrix: stripExternalMap(row.roomPriceMatrix) }
        : {}),
    };

    if (!shouldStrip) return row;

    return {
      ...row,
      ...explicitMaps,
      totalPerAdult: pricingRound2(base + adicionales),
      perRoomPricing: Array.isArray(row?.perRoomPricing)
        ? row.perRoomPricing.map((room) => {
            const roomBase = pricingNumber(room?.base);
            const roomAdditional = pricingNumber(room?.adicionales);
            const roomCurrent = pricingNumber(room?.totalPerPerson);
            const expectedRoomWithExternal = pricingRound2(
              roomBase + roomAdditional + external,
            );
            return roomCurrent > 0 &&
              roomBase + roomAdditional > 0 &&
              Math.abs(roomCurrent - expectedRoomWithExternal) <= 1
              ? {
                  ...room,
                  totalPerPerson: pricingRound2(roomBase + roomAdditional),
                }
              : room;
          })
        : row?.perRoomPricing,
    };
  });
};

const extractPricingRowsFromPreviewHtml = (html = "") => {
  if (!html || typeof DOMParser === "undefined") return new Map();

  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const map = new Map();

    doc.querySelectorAll('[data-preview-price-kind="adult"]').forEach((row) => {
      const categories = getPreviewPriceRowCategories(
        row,
        row.getAttribute("data-preview-price-row"),
      );
      if (!categories.length) return;

      const prices = Array.from(
        row.querySelectorAll('[data-preview-price-value$="-adult"]'),
      )
        .map((cell) => ({
          roomKey: cell.getAttribute("data-hpm-room-key") || "",
          baseRoomKey: cell.getAttribute("data-hpm-room-base-key") || "",
          roomInstanceKey:
            cell.getAttribute("data-hpm-room-instance-key") || "",
          label: pricingRoomLabel(
            cell.getAttribute("data-hpm-room-label") ||
              cell.getAttribute("data-hpm-room-key") ||
              "",
          ),
          value: pricingMoney(cell.textContent),
          hasIgv: cell.getAttribute("data-hpm-has-igv") === "true",
          igvPerPerson: pricingNumber(
            cell.getAttribute("data-hpm-igv-per-person"),
          ),
        }))
        .filter((item) => item.value > 0);
      const value = prices[0]?.value || 0;

      if (!value) return;

      const categoryLabel = getPreviewPriceRowHotelLabel(row);
      categories.forEach((category) => {
        map.set(category, { value, prices, categoryLabel });
      });
    });

    doc
      .querySelectorAll('[data-preview-price-row$="-child"]')
      .forEach((row) => {
        const rawCat = row.getAttribute("data-preview-price-row") || "";
        const categories = getPreviewPriceRowCategories(row, rawCat.slice(0, -6));
        if (!categories.length) return;

        const childPrices = Array.from(
          row.querySelectorAll('[data-preview-price-value$="-child"]'),
        )
          .map((cell) => {
            const text = String(cell.textContent || "").trim();
            const beneficiaries = pricingNumber(
              cell.getAttribute("data-hpm-room-beneficiaries"),
            );
            const available =
              beneficiaries > 0 || (!!text && !/[—-]/.test(text));
            return {
              roomKey: cell.getAttribute("data-hpm-room-key") || "",
              label: pricingRoomLabel(
                cell.getAttribute("data-hpm-room-label") ||
                  cell.getAttribute("data-hpm-room-key") ||
                  "",
              ),
              value: pricingMoney(cell.textContent),
              available,
            };
          })
          .filter((item) => item.available || item.value > 0);

        if (!childPrices.length) return;

        const categoryLabel = getPreviewPriceRowHotelLabel(row);
        categories.forEach((category) => {
          const existing = map.get(category);
          if (existing) {
            map.set(category, {
              ...existing,
              childPrices,
              categoryLabel: existing.categoryLabel || categoryLabel,
            });
          } else {
            map.set(category, {
              value: 0,
              prices: [],
              childPrices,
              categoryLabel,
            });
          }
        });
      });

    return map;
  } catch {
    return new Map();
  }
};

const attachPreviewPricesToPricingRows = (
  cotizacion,
  roomOptionsByCategory,
  rows = [],
) => {
  if (!cotizacion || !rows.length) return rows;

  try {
    const ac = readPricingAdditionalCosts(cotizacion);
    const hotelDetalle = getPdfHotelDetalle(cotizacion);
    const hotelConfig = resolvePdfSelectedHotel(cotizacion, hotelDetalle) || {};
    const packageType =
      cotizacion?.packagetype || cotizacion?.packageType || "compartido";
    const previewCtx = buildPdfHotelPreviewRows({
      cotizacion,
      resolvedHotel: hotelConfig,
      roomOptionsByCategory,
      packageType,
    });
    const baseCategoryRows = previewCtx.categoryRows?.length
      ? previewCtx.categoryRows
      : rows;
    const categoryRows = removeExternalFromPricingRows(
      baseCategoryRows,
      previewCtx.externalAdultTotal,
    );
    const days = getPdfItineraryDays(cotizacion);
    const nights = Math.max(1, days.length - 1);
    const previewCategories = Array.from(
      new Set(
        categoryRows
          .map((row) => String(row?.category ?? "").trim())
          .filter(Boolean),
      ),
    );
    const previewPeopleCount =
      previewCtx.peopleCount ||
      cotizacion.peopleCount ||
      cotizacion.peoplecount || { adults: 1, children: 0 };
    const summaryPricingSource = {
      ...cotizacion,
      selectedHotel: hotelConfig,
      selected_hotel: hotelConfig,
      peopleCount: previewPeopleCount,
      peoplecount: previewPeopleCount,
      additionalCosts: ac,
      additionalcosts: ac,
      precio_it_ext_adulto: previewCtx.externalAdultTotal,
      precio_it_ext_ninos:
        previewCtx.externalChildTotal +
        previewCtx.externalConvertedChildTotal,
    };
    const summaryPricingModel = buildSummaryContentPricingModel(
      summaryPricingSource,
    );
    const canonicalPresentation = buildSummaryPricingPresentation(
      summaryPricingModel,
    );
    const canonicalAdultPrices = canonicalPresentation.columns
      .filter((column) => column.adult)
      .map((column) => ({
        roomKey: column.key,
        label: pricingRoomLabel(column.label),
        value: column.adult.value,
      }));
    const canonicalChildPrices = canonicalPresentation.columns
      .filter((column) => column.child)
      .map((column) => ({
        roomKey: column.key,
        label: pricingRoomLabel(column.label),
        value: column.child.value,
        available: true,
      }));
    const canonicalSelectedCategory = pricingCategoryKey(
      hotelConfig.category || hotelConfig.key,
    );
    const generatedHtml = buildCotizacionPreviewHtml({
      cotizacion: summaryPricingSource,
      pricingModel: summaryPricingModel,
      summaryVisibleParts: summaryPricingModel.parts,
      titulo: cotizacion.titulo || "Cotización",
      days,
      fechaInicio: cotizacion.fechainicio || cotizacion.fechaInicio || null,
      nights,
      breakfasts: nights,
      packageType,
      categoryRows,
      peopleCount: previewPeopleCount,
      accommodationType: "doble o matrimonial",
      mealsIncluded: 0,
      selectedCat: hotelConfig.category,
      selectedHotel: hotelConfig,
      previewCategories,
      externalAdultTotal: previewCtx.externalAdultTotal,
      externalChildTotal: previewCtx.externalChildTotal,
      externalConvertedChildTotal: previewCtx.externalConvertedChildTotal,
      additionalCosts: ac,
    });
    const appliedHtml = applyHotelDetalleToGeneratedHtml(
      generatedHtml,
      hotelDetalle,
    );
    const priceMap = extractPricingRowsFromPreviewHtml(appliedHtml);
    if (priceMap.size === 0 && canonicalPresentation.columns.length === 0) {
      return rows;
    }

    return rows.map((row, rowIndex) => {
      const rowCategory = pricingCategoryKey(row.category);
      const useCanonicalPricing =
        canonicalPresentation.columns.length > 0 &&
        (row?.isSelected === true ||
          (canonicalSelectedCategory && rowCategory === canonicalSelectedCategory) ||
          (!canonicalSelectedCategory && rows.length === 1 && rowIndex === 0));

      if (useCanonicalPricing) {
        return {
          ...row,
          ...(canonicalAdultPrices.length > 0
            ? {
                pricingPageTotalPerAdult: canonicalAdultPrices[0].value,
                pricingPagePrices: canonicalAdultPrices,
              }
            : {}),
          ...(canonicalChildPrices.length > 0
            ? { pricingPageChildPrices: canonicalChildPrices }
            : {}),
        };
      }

      const parsed = priceMap.get(rowCategory);
      if (!parsed) return row;
      return {
        ...row,
        ...(parsed.value > 0
          ? {
              pricingPageTotalPerAdult: parsed.value,
              pricingPagePrices: parsed.prices || [],
            }
          : {}),
        ...(parsed.childPrices?.length
          ? { pricingPageChildPrices: parsed.childPrices }
          : {}),
        ...(parsed.categoryLabel
          ? { pricingPageCategoryLabel: parsed.categoryLabel }
          : {}),
      };
    });
  } catch {
    return rows;
  }
};

const normalizePricingPageCategoryKey = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

const resolvePricingPageCategories = (
  cotizacion = {},
  availableCategories = [],
  requestedCategories = null,
) => {
  const requested = Array.isArray(requestedCategories)
    ? requestedCategories
        .map((category) => String(category ?? "").trim())
        .filter(Boolean)
    : [];

  if (requested.length > 0) return Array.from(new Set(requested));

  return getDefaultPdfHotelCategories(cotizacion, availableCategories);
};

const filterPricingPageRows = (rows = [], categories = []) => {
  const selected = new Set(
    (Array.isArray(categories) ? categories : [])
      .map(normalizePricingPageCategoryKey)
      .filter(Boolean),
  );
  if (!selected.size) return rows;

  const filtered = rows.filter((row) =>
    selected.has(normalizePricingPageCategoryKey(row?.category)),
  );
  return filtered.length > 0 ? filtered : rows;
};

export const PricingPage = React.memo(
  ({
    cotizacion,
    availableCategories = [],
    excelPreviewCategories = null,
    idioma = null,
  }) => {
    const currentIdioma = idioma || cotizacion?.idioma || "es";
    const labels = getCanvaClosingCopy(currentIdioma);
    const { byCategory: hotelDict } = useHotelQuoteDictionary({
      axios,
      tariffType: resolveQuotationTariffType(cotizacion),
      agencyId: Number(cotizacion?.agency_id || 1),
    });
    const packageType =
      cotizacion?.packagetype || cotizacion?.packageType || "compartido";
    const roomOptionsByCategory = useMemo(
      () =>
        buildRoomOptionsByCategory(
          hotelDict,
          resolveQuotationTariffType(cotizacion),
          packageType,
        ),
      [hotelDict, packageType],
    );
    const { rows: allRows } = useMemo(
      () => buildPricingCategoryRows(cotizacion, roomOptionsByCategory),
      [cotizacion, roomOptionsByCategory],
    );
    const pricedRows = useMemo(
      () =>
        attachPreviewPricesToPricingRows(
          cotizacion,
          roomOptionsByCategory,
          allRows,
        ),
      [allRows, cotizacion, roomOptionsByCategory],
    );
    const pricingCategoryOptions = useMemo(
      () =>
        availableCategories.length > 0
          ? availableCategories
          : allRows.map((row) => ({
              category: row?.category,
              label: row?.label,
              isSelected: row?.isSelected,
            })),
      [allRows, availableCategories],
    );
    const activePricingCategories = useMemo(
      () =>
        resolvePricingPageCategories(
          cotizacion,
          pricingCategoryOptions,
          excelPreviewCategories,
        ),
      [cotizacion, excelPreviewCategories, pricingCategoryOptions],
    );
    const rows = useMemo(
      () =>
        collapseGroupedPricingRows(
          filterPricingPageRows(
            pricedRows.length ? pricedRows : allRows.slice(0, 1),
            activePricingCategories,
          ),
        ),
      [activePricingCategories, allRows, pricedRows],
    );
    const packageLists = useMemo(
      () => buildCanvaPackageLists(cotizacion),
      [cotizacion],
    );
    const backdrop = resolveCanvaBackdropSrc(cotizacion);

    const tableRows = rows.flatMap((row) => {
      const hotelLabel = getPricingRowDisplayLabel(row);
      const adultPrices =
        Array.isArray(row.pricingPagePrices) && row.pricingPagePrices.length > 0
          ? row.pricingPagePrices
          : [
              {
                label: "Por persona",
                value: row.pricingPageTotalPerAdult ?? row.totalPerAdult,
              },
            ];
      const childPrices = Array.isArray(row.pricingPageChildPrices)
        ? row.pricingPageChildPrices.map((price) => ({
            ...price,
            label: `Niño · ${price.label}`,
          }))
        : [];
      return [...adultPrices, ...childPrices]
        .filter((price) => Number.isFinite(Number(price?.value)))
        .map((price) => ({
          hotelLabel,
          roomLabel: price.label || "Por persona",
          value: Math.ceil(Number(price.value)),
        }));
    });

    return (
      <div className="pdf-page pricing-page canva-closing-page">
        <img
          src={backdrop}
          data-pdf-full-src={backdrop}
          alt=""
          className="canva-closing-backdrop"
          draggable={false}
          crossOrigin="anonymous"
          loading="eager"
          decoding="sync"
        />
        <div className="canva-closing-veil" />
        <div className="canva-closing-content">
          <h2 className="canva-closing-title">{labels.pricingTitle}</h2>
          <div className="pricing-canva-lists">
            <div className="pricing-canva-list">
              <h3>{labels.includes}</h3>
              {packageLists.includes.length ? (
                <ul>
                  {packageLists.includes.slice(0, 10).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>Servicios detallados en el itinerario.</p>
              )}
            </div>
            <div className="pricing-canva-list">
              <h3>{labels.excludes}</h3>
              {packageLists.excludes.length ? (
                <ul>
                  {packageLists.excludes.slice(0, 10).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>Gastos personales y servicios no indicados.</p>
              )}
            </div>
          </div>

          <table className="pricing-canva-table">
            <thead>
              <tr>
                <th>{labels.hotel}</th>
                <th>{labels.room}</th>
                <th>{labels.price}</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length ? (
                tableRows.map((row, index) => (
                  <tr key={`${row.hotelLabel}-${row.roomLabel}-${index}`}>
                    <td>{row.hotelLabel}</td>
                    <td>{row.roomLabel}</td>
                    <td className="pricing-canva-price">
                      US$ {row.value.toLocaleString("es-PE")}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3}>Precio sujeto a la configuración de la cotización.</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="pricing-canva-notes">
            <h3>{labels.notes}</h3>
            <ul>
              <li>Precios por persona expresados en dólares americanos (USD).</li>
              <li>Tarifas sujetas a disponibilidad hasta la confirmación de la reserva.</li>
              <li>La cotización considera los pasajeros, hoteles y servicios registrados.</li>
            </ul>
          </div>
        </div>
      </div>
    );
  },
);
PricingPage.displayName = "PricingPage";

export const getPricingPageHtml = (
  cotizacion = null,
  { roomOptionsByCategory = {}, excelPreviewCategories = null } = {},
) => {
  const currentIdioma = cotizacion?.idioma || "es";
  const labels = getCanvaClosingCopy(currentIdioma);
  const { rows: rawRows } = cotizacion
    ? buildPricingCategoryRows(cotizacion, roomOptionsByCategory)
    : { rows: [] };
  const allRows = attachPreviewPricesToPricingRows(
    cotizacion,
    roomOptionsByCategory,
    rawRows,
  );
  const pricingCategoryOptions = rawRows.map((row) => ({
    category: row?.category,
    label: row?.label,
    isSelected: row?.isSelected,
  }));
  const requestedCategories =
    excelPreviewCategories ??
    cotizacion?.pdf_excel_preview_categories ??
    cotizacion?.excelPreviewCategories ??
    cotizacion?.previewCategories ??
    null;
  const activePricingCategories = resolvePricingPageCategories(
    cotizacion,
    pricingCategoryOptions,
    requestedCategories,
  );
  const rows = collapseGroupedPricingRows(
    filterPricingPageRows(allRows, activePricingCategories),
  );
  const packageLists = buildCanvaPackageLists(cotizacion);
  const backdrop = resolveCanvaBackdropSrc(cotizacion);

  const listHtml = (items, empty) =>
    items.length
      ? `<ul>${items
          .slice(0, 10)
          .map((item) => `<li>${escapePricingHtml(item)}</li>`)
          .join("")}</ul>`
      : `<p>${escapePricingHtml(empty)}</p>`;

  const tableRows = rows.flatMap((row) => {
    const hotelLabel = getPricingRowDisplayLabel(row);
    const adultPrices =
      Array.isArray(row.pricingPagePrices) && row.pricingPagePrices.length > 0
        ? row.pricingPagePrices
        : [
            {
              label: "Por persona",
              value: row.pricingPageTotalPerAdult ?? row.totalPerAdult,
            },
          ];
    const childPrices = Array.isArray(row.pricingPageChildPrices)
      ? row.pricingPageChildPrices.map((price) => ({
          ...price,
          label: `Niño · ${price.label}`,
        }))
      : [];
    return [...adultPrices, ...childPrices]
      .filter((price) => Number.isFinite(Number(price?.value)))
      .map((price) => ({
        hotelLabel,
        roomLabel: price.label || "Por persona",
        value: Math.ceil(Number(price.value)),
      }));
  });

  const rowsHtml = tableRows.length
    ? tableRows
        .map(
          (row) => `<tr><td>${escapePricingHtml(row.hotelLabel)}</td><td>${escapePricingHtml(
            row.roomLabel,
          )}</td><td class="pricing-canva-price">US$ ${row.value.toLocaleString(
            "es-PE",
          )}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3">Precio sujeto a la configuración de la cotización.</td></tr>`;

  return `
 <div class="pdf-page pricing-page canva-closing-page">
  <img src="${escapePricingHtml(backdrop)}" data-pdf-full-src="${escapePricingHtml(
    backdrop,
  )}" class="canva-closing-backdrop" alt="" loading="eager" decoding="sync" />
  <div class="canva-closing-veil"></div>
  <div class="canva-closing-content">
   <h2 class="canva-closing-title">${escapePricingHtml(labels.pricingTitle)}</h2>
   <div class="pricing-canva-lists">
    <div class="pricing-canva-list"><h3>${escapePricingHtml(labels.includes)}</h3>${listHtml(
      packageLists.includes,
      "Servicios detallados en el itinerario.",
    )}</div>
    <div class="pricing-canva-list"><h3>${escapePricingHtml(labels.excludes)}</h3>${listHtml(
      packageLists.excludes,
      "Gastos personales y servicios no indicados.",
    )}</div>
   </div>
   <table class="pricing-canva-table"><thead><tr><th>${escapePricingHtml(
     labels.hotel,
   )}</th><th>${escapePricingHtml(labels.room)}</th><th>${escapePricingHtml(
     labels.price,
   )}</th></tr></thead><tbody>${rowsHtml}</tbody></table>
   <div class="pricing-canva-notes"><h3>${escapePricingHtml(
     labels.notes,
   )}</h3><ul><li>Precios por persona expresados en dólares americanos (USD).</li><li>Tarifas sujetas a disponibilidad hasta la confirmación de la reserva.</li><li>La cotización considera los pasajeros, hoteles y servicios registrados.</li></ul></div>
  </div>
 </div>`;
};
