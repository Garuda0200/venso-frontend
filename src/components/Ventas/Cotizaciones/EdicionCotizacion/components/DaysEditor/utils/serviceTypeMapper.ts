import { getHotelRoomCapacity } from "../../../../../../../utils/hotelRoomTypes";

// Parent-child service configuration.
export const PARENT_CHILD_SERVICES = {
  hoteles: {
    parentTable: "hotel",
    childTable: "habitacion",
    parentIdField: "id_hotel",
    childIdField: "id_habitacion",
    parentNameField: "nombre",
    childTypeField: "tipo_habitacion",
    hasCapacity: true,
    capacityField: "capacidad",
    hasIGV: true,
    parentFields: [
      "nombre",
      "categoria",
      "ciudad",
      "direccion",
      "desayuno",
      "check_in",
      "check_out",
    ],
    childFields: ["tipo_habitacion", "capacidad", "estado"],
  },
  transportes: {
    parentTable: "transporte",
    childTable: "movilidad",
    parentIdField: "id_transporte",
    childIdField: "id_movilidad",
    parentNameField: "nombre_transporte",
    childTypeField: "tipo_auto",
    hasCapacity: true,
    capacityField: "nro_pasajeros",
    hasIGV: false,
    parentFields: ["nombre_transporte", "zona"],
    childFields: ["tipo_auto", "nro_pasajeros", "nro_placa", "ruta", "estado"],
  },
  trenes: {
    parentTable: "tren",
    childTable: "vagones",
    parentIdField: "id_tren",
    childIdField: "id_vagon",
    parentNameField: "nombre_empresa",
    childTypeField: "tipo_tren",
    hasCapacity: true,
    capacityField: "capacidad",
    hasIGV: false,
    parentFields: ["nombre_empresa", "frecuencia"],
    childFields: [
      "tipo_tren",
      "serv_add",
      "lugar_salida",
      "lugar_destino",
      "hora_salida",
      "hora_llegada",
      "estado",
    ],
  },
  guias: {
    parentTable: "guia",
    childTable: "ruta",
    parentIdField: "id_guia",
    childIdField: "id_ruta",
    parentNameField: "nombres",
    parentApelliField: "apellidos",
    childTypeField: "tour_nombre",
    hasCapacity: false,
    hasIGV: false,
    parentFields: ["codigo_guia", "idioma"],
    childFields: [
      "tour_nombre",
      "viaticos",
      "costo_viaticos",
      "observaciones",
      "estado",
    ],
  },
  endoses: {
    parentTable: "endose",
    childTable: "tour",
    parentIdField: "id_endose",
    childIdField: "id_tipotour",
    parentNameField: "nombre_agencia",
    childTypeField: "tipo_guiado",
    hasCapacity: false,
    hasIGV: false,
    parentFields: ["nombre_agencia", "tipo_tour", "zona"],
    childFields: ["tipo_guiado", "idioma", "observaciones", "capacidad", "estado"],
  },
  vuelos: {
    parentTable: "vuelos",
    childTable: "tipo_vuelo",
    parentIdField: "id_vuelo",
    childIdField: "idtipo_vuelo",
    parentNameField: "nombre",
    childTypeField: "tipovuelo",
    hasCapacity: false,
    hasIGV: false,
    parentFields: [
      "nombre",
      "nro_ticket",
      "lugar_ida",
      "lugar_vuelta",
      "fecha_emision",
      "hora_salida",
      "hora_llegada",
    ],
    childFields: ["tipovuelo", "equipaje", "detalles", "estado"],
  },
};

// Independent services without parent-child relations.
export const INDEPENDENT_SERVICES = {
  restaurantes: {
    table: "restaurante",
    idField: "id_restaurante",
    nameField: "nombre",
    hasIGV: false,
    fields: ["nombre", "direccion", "detalles", "estado"],
  },
  tickets: {
    table: "tickets",
    idField: "id_ticket",
    nameField: "entrada",
    hasIGV: false,
    fields: [
      "entrada",
      "procedencia",
      "tipo_usuario",
      "edad_estudiante_min",
      "edad_estudiante_max",
      "estado",
    ],
  },
  extras: {
    table: "extras",
    idField: "id",
    nameField: "nombre",
    hasIGV: true,
    fields: ["nombre", "descripcion", "tipo_tarifa", "estado"],
  },
};

// Detect the service type from the normalized service shape.
export const detectServiceType = (service) => {
  if (!service) {
    console.warn(
      "[serviceTypeMapper] detectServiceType: service is null/undefined",
    );
    return "unknown";
  }

  // Guard against malformed services.
  if (typeof service !== "object") {
    console.warn(
      "[serviceTypeMapper] detectServiceType: service is not an object:",
      service,
    );
    return "unknown";
  }

  // Trust explicit parentService.typeService first, except the generic "otros".
  if (
    service.parentService?.typeService &&
    service.parentService.typeService !== "otros"
  ) {
    return service.parentService.typeService;
  }

  // Detect extras explicitly.
  if (
    service.typeService === "extras" ||
    service.categoria === "extras" ||
    service.parentService?.typeService === "extras" ||
    (service.id && String(service.id).startsWith("extra-"))
  ) {
    return "extras";
  }

  // Detect by data shape when typeService is unreliable.
  if (service.parentService) {
    if (
      service.parentService?.nombre &&
      (service.parentService.categoria?.toLowerCase().includes("hotel") ||
        service.parentService.id_hotel)
    ) {
      return "hoteles";
    }

    if (
      service.parentService?.nombre_transporte ||
      service.parentService?.id_transporte
    ) {
      return "transportes";
    }

    if (
      service.parentService?.nombre_empresa &&
      (service.childService?.id_vagon || service.childService?.vagon?.id_vagon)
    ) {
      return "trenes";
    }

    if (service.parentService.tipo_tour || service.parentService.id_endose) {
      return "endoses";
    }

    if (
      service.parentService.guia?.id_guia ||
      service.parentService.persona?.id_persona ||
      service.parentService.codigo_guia ||
      service.childService?.ruta?.tour_nombre
    ) {
      return "guias";
    }

    if (service.parentService.aerolinea || service.parentService.id_vuelo) {
      return "vuelos";
    }
  }

  // Independent services.
  if (service.childService) {
    if (
      service.childService?.restaurante?.nombre ||
      service.childService?.tipo_cocina
    ) {
      return "restaurantes";
    }

    if (
      service.childService?.ticket?.entrada ||
      service.childService?.tipo_usuario ||
      service.childService?.procedencia
    ) {
      return "tickets";
    }
  }

  // Legacy fallback.
  if (service.id_restaurante || service.nombre?.includes("restaurante")) {
    return "restaurantes";
  }

  if (service.id_ticket || service.entrada) {
    return "tickets";
  }

  return "unknown";
};

// Get the service display name.
export const getServiceName = (service) => {
  const serviceType = detectServiceType(service);

  if (serviceType === "unknown") return "Servicio desconocido";

  // Parent-child services.
  if (PARENT_CHILD_SERVICES[serviceType]) {
    const config = PARENT_CHILD_SERVICES[serviceType];
    if (serviceType === "guias") {
      return (
        `${service.parentService?.persona?.[config.parentNameField]} ${service.parentService?.persona?.[config.parentApelliField]}` ||
        "Sin nombre"
      );
    }
    return service.parentService?.[config.parentNameField] || "Sin nombre";
  }

  // Independent services.
  if (INDEPENDENT_SERVICES[serviceType]) {
    const config = INDEPENDENT_SERVICES[serviceType];

    if (serviceType === "tickets") {
      return service.childService.ticket?.[config.nameField] || "Sin nombre";
    }

    if (serviceType === "restaurantes") {
      return (
        service.childService.restaurante?.[config.nameField] || "Sin nombre"
      );
    }

    if (serviceType === "extras") {
      return (
        service.parentService?.nombre ||
        service.childService?.nombre ||
        service.childService?.servicio_extra?.nombre ||
        service.titulo ||
        service.nombre ||
        service[config.nameField] ||
        "Servicio Extra"
      );
    }

    return service[config.nameField] || "Sin nombre";
  }

  return "Servicio desconocido";
};

// Get the service subtype.
export const getServiceSubtype = (service) => {
  const serviceType = detectServiceType(service);

  if (PARENT_CHILD_SERVICES[serviceType]) {
    const config = PARENT_CHILD_SERVICES[serviceType];

    if (serviceType === "hoteles") {
      return (
        service.childService?.tipo_habitacion ||
        service.childService?.habitacion?.tipo_habitacion ||
        "Tipo no especificado"
      );
    }

    return (
      service.childService?.[config.childTypeField] || "Tipo no especificado"
    );
  }

  return null;
};

// Get the service capacity when the service type supports it.
export const getServiceCapacity = (service) => {
  const serviceType = detectServiceType(service);

  if (!PARENT_CHILD_SERVICES[serviceType]?.hasCapacity) return null;

  if (serviceType === "hoteles") {
    return getHotelRoomCapacity(
      service.childService || service.child_service || service,
      1,
    );
  }

  if (serviceType === "transportes") {
    return service.childService?.nro_pasajeros || null;
  }

  if (serviceType === "endoses") {
    const capacidad = Number(
      service.childService?.capacidad ?? service.childService?.tour?.capacidad ?? 0,
    );
    return capacidad >= 1 ? capacidad : null;
  }

  return null;
};

// Backward-compatible export used by a few callers; all hotel capacity logic
// is centralized in src/utils/hotelRoomTypes.ts.
const getRoomCapacity = (roomOrType) => getHotelRoomCapacity(roomOrType, 1);

// Check whether a service type can include IGV.
export const canHaveIGV = (service) => {
  const serviceType = detectServiceType(service);

  if (PARENT_CHILD_SERVICES[serviceType]) {
    return PARENT_CHILD_SERVICES[serviceType].hasIGV;
  }

  if (INDEPENDENT_SERVICES[serviceType]) {
    return INDEPENDENT_SERVICES[serviceType].hasIGV;
  }

  return false;
};

const serviceTypeMapperExports = {
  PARENT_CHILD_SERVICES,
  INDEPENDENT_SERVICES,
  detectServiceType,
  getServiceName,
  getServiceSubtype,
  getServiceCapacity,
  canHaveIGV,
  getRoomCapacity,
};

export default serviceTypeMapperExports;
