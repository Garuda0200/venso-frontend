// serviceColors.js
// Colores y descripciones para servicios del calendario de reservas.

export const SERVICE_COLORS = {
  LAGUNA_MONTANA: {
    color: "#4dabf5",
    label: "Asignado a salidas de Laguna y Montana",
  },
  LIMA_ICA_PARACAS_NAZCA: {
    color: "#1976d2",
    label: "Asignado a todos los servicios en Lima, Ica, Paracas y Nazca",
  },
  VALLE_SAGRADO_VIP_MARAS_MORAY: {
    color: "#ff7043",
    label: "Asignado a salidas de Valle Sagrado, Valle VIP y Maras Moray",
  },
  CITY_TOUR_CUSCO: {
    color: "#2e7d32",
    label: "Asignado a salidas de City Tour en Cusco",
  },
  TRASLADO_SALIDA: {
    color: "#0288d1",
    label: "Asignado a traslados de salida",
  },
  AREQUIPA_COLCA_PUNO: {
    color: "#1976d2",
    label: "Asignado a servicios en Arequipa, Colca y Puno",
  },
  SERVICIOS_MONITOREO: {
    color: "#8e24aa",
    label: "Asignado a servicios que requieren monitoreo",
  },
  TRASLADO_LLEGADA: {
    color: "#e53935",
    label: "Asignado a traslados de llegada",
  },
  CHARLA_INFORMATIVA: {
    color: "#43a047",
    label: "Asignado a la charla informativa",
  },
};

const normalizeText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normalizeServiceType = (service = {}) =>
  normalizeText(
    service?.parentService?.typeService ||
      service?.parentService?.tipo_servicio ||
      service?.typeService ||
      service?.tipo_servicio ||
      service?.tipo,
  );

const getParentService = (service = {}) => service?.parentService || {};
const getChildService = (service = {}) => service?.childService || {};

const firstText = (...values) =>
  values.find((value) => String(value ?? "").trim()) || "";

const textIncludes = (text, ...words) => {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  return words.some((word) => normalized.includes(normalizeText(word)));
};

export const getServiceZona = (service = {}) => {
  const category = normalizeServiceType(service);
  const parentService = getParentService(service);
  const childService = getChildService(service);

  switch (category) {
    case "hoteles":
      return firstText(parentService.ciudad, parentService.city, "Sin zona");
    case "transportes":
      return firstText(parentService.zona, parentService.ciudad, "Sin zona");
    case "restaurantes":
      return firstText(
        parentService.Direccion,
        parentService.direccion,
        childService.Direccion,
        childService.direccion,
        "Sin zona",
      );
    case "vuelos":
      return firstText(parentService.lugar_ida, parentService.lugar_vuelta, "Sin zona");
    case "trenes":
      return firstText(childService.lugar_salida, parentService.lugar_salida, "Cusco");
    case "endoses":
      return firstText(parentService.zona, childService.zona, "Sin zona");
    default:
      return "Sin zona";
  }
};

export const getServiceColor = (service = {}) => {
  if (!service || typeof service !== "object") return "#9e9e9e";

  const category = normalizeServiceType(service);
  const parentService = getParentService(service);
  const childService = getChildService(service);
  const zona = normalizeText(getServiceZona(service));

  if (zona === "cusco") {
    switch (category) {
      case "transportes": {
        const route = childService.ruta || "";
        if (
          textIncludes(
            route,
            "recojo apto",
            "aeropuerto - hotel",
            "areopuerto - hotel",
            "areopuerto-hotel",
            "in",
          )
        ) {
          return SERVICE_COLORS.TRASLADO_LLEGADA.color;
        }
        if (
          textIncludes(
            route,
            "salida",
            "out",
            "htl -apto",
            "hotel-areopuerto",
            "hotel - areopuerto",
            "traslado salida",
          )
        ) {
          return SERVICE_COLORS.TRASLADO_SALIDA.color;
        }
        return "#9e9e9e";
      }

      case "endoses": {
        const tourType = firstText(
          parentService.tipo_tour,
          childService.tipo_tour,
          childService.tour?.tipo_tour,
        );
        if (textIncludes(tourType, "city tour", "citytour")) {
          return SERVICE_COLORS.CITY_TOUR_CUSCO.color;
        }
        if (
          textIncludes(
            tourType,
            "laguna",
            "lagunas",
            "montana",
            "montana",
            "mountain",
            "lakes",
          )
        ) {
          return SERVICE_COLORS.LAGUNA_MONTANA.color;
        }
        if (
          textIncludes(
            tourType,
            "valle sagrado",
            "valle vip",
            "sacred valley",
            "vip valley",
            "south valley",
            "valle sur",
            "maras",
            "moray",
          )
        ) {
          return SERVICE_COLORS.VALLE_SAGRADO_VIP_MARAS_MORAY.color;
        }
        return "#9e9e9e";
      }

      case "trenes": {
        const from = childService.lugar_salida || "";
        const to = childService.lugar_destino || "";
        if (
          textIncludes(from, "cusco", "ollantaytambo") &&
          textIncludes(to, "machupicchu", "machu picchu")
        ) {
          return SERVICE_COLORS.SERVICIOS_MONITOREO.color;
        }
        return "#9e9e9e";
      }

      default:
        return "#9e9e9e";
    }
  }

  if (["lima", "ica", "paracas", "nazca"].includes(zona)) {
    return SERVICE_COLORS.LIMA_ICA_PARACAS_NAZCA.color;
  }

  if (["arequipa", "colca", "puno"].includes(zona)) {
    return SERVICE_COLORS.AREQUIPA_COLCA_PUNO.color;
  }

  return "#9e9e9e";
};

export const getServiceDescripcion = (voucherCode, service = {}) => {
  if (!service || typeof service !== "object") return "Servicio";

  const code =
    typeof voucherCode === "object"
      ? voucherCode?.voucher_code || "Voucher"
      : voucherCode || "Voucher";
  const category = normalizeServiceType(service);
  const parentService = getParentService(service);
  const childService = getChildService(service);

  switch (category) {
    case "hoteles":
      return `${firstText(parentService.nombre, "Hotel")} - ${firstText(
        childService.tipo_habitacion,
        "Habitacion",
      )} - ${code}`;
    case "transportes":
      return `${firstText(
        parentService.nombre_transporte,
        parentService.nombre,
        "Transporte",
      )} - ${firstText(childService.ruta, "Ruta")} - ${code}`;
    case "tickets":
      return firstText(childService.entrada, childService.ticket?.entrada, parentService.entrada, "Ticket");
    case "restaurantes":
      return firstText(childService.nombre, childService.restaurante?.nombre, parentService.nombre, "Restaurante");
    case "guias": {
      const person = parentService.persona || parentService;
      const fullName = firstText(
        person.nombre_completo,
        parentService.nombre_completo,
        [person.nombres || person.nombre, person.apellidos]
          .filter(Boolean)
          .join(" "),
        [person.nombres || person.nombre, person.apellidopaterno, person.apellidomaterno]
          .filter(Boolean)
          .join(" "),
      );
      return fullName || "Guia";
    }
    case "vuelos":
      return `${firstText(parentService.nombre, "Vuelo")} - Origen: ${firstText(
        parentService.lugar_ida,
        "",
      )} - Destino: ${firstText(parentService.lugar_vuelta, "")} - ${code}`;
    case "trenes":
      return `${firstText(parentService.nombre_empresa, "Tren")} - Origen: ${firstText(
        childService.lugar_salida,
        "",
      )} - Destino: ${firstText(childService.lugar_destino, "")} - ${code}`;
    case "endoses":
      return `${firstText(
        parentService.nombre_agencia,
        parentService.nombre,
        "Endose",
      )} - ${firstText(parentService.tipo_tour, childService.tipo_tour, "")} - ${code}`;
    default:
      return firstText(parentService.nombre, childService.nombre, "Servicio");
  }
};
