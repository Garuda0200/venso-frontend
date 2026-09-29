/**
 * Service types configuration based on backend models
 */

// Servicios con estructura padre-hijo
export const PARENT_CHILD_SERVICES = {
  hoteles: {
    name: "Hoteles",
    icon: "FaHotel",
    endpoint: "hoteles",
    childEndpoint: "habitaciones/hotel",
    childName: "habitacion",
    childPlural: "habitaciones",
    displayField: "nombre",
    fields: ["nombre", "direccion", "categoria", "ciudad", "desayuno"],
    childFields: ["tipo_habitacion", "estado"],
  },
  transportes: {
    name: "Transportes",
    icon: "FaShuttleVan",
    endpoint: "transportes",
    childEndpoint: "movilidades/transporte",
    childName: "movilidad",
    childPlural: "movilidades",
    displayField: "nombre_transporte",
    fields: ["nombre_transporte", "zona"],
    childFields: ["tipo_auto", "nro_pasajeros", "nro_placa", "ruta", "estado"],
  },
  trenes: {
    name: "Trenes",
    icon: "FaTrain",
    endpoint: "trenes",
    childEndpoint: "vagones/tren",
    childName: "vagon",
    childPlural: "vagones",
    displayField: "nombre_tren",
    fields: ["nombre_tren", "ruta", "duracion", "estado"],
    childFields: ["tipo_vagon", "capacidad", "estado"],
  },
  vuelos: {
    name: "Vuelos",
    icon: "FaPlane",
    endpoint: "vuelos",
    childEndpoint: "tipos-vuelo/vuelo",
    childName: "tipo_vuelo",
    childPlural: "tipos_vuelo",
    displayField: "aerolinea",
    fields: ["aerolinea", "origen", "destino", "duracion", "estado"],
    childFields: ["tipo", "clase", "equipaje_incluido", "estado"],
  },
  guias: {
    name: "Guías",
    icon: "FaRoute",
    endpoint: "guias",
    childEndpoint: "rutas/guia",
    childName: "ruta",
    childPlural: "rutas",
    displayField: "nombres",
    fields: ["nombres", "apellidos", "telefono", "email", "idiomas", "estado"],
    childFields: ["nombre_ruta", "tour_nombre", "viaticos", "estado"],
  },
  endoses: {
    name: "Endoses",
    icon: "FaSuitcase",
    endpoint: "endoses",
    childEndpoint: "tours/endose",
    childName: "tour",
    childPlural: "tours",
    displayField: "nombre_agencia",
    fields: ["nombre_agencia", "descripcion", "tipo", "estado"],
    childFields: ["tipo_guiado", "idioma", "observaciones", "capacidad", "estado"],
  },
};

// Servicios standalone (sin hijos)
export const STANDALONE_SERVICES = {
  restaurantes: {
    name: "Restaurantes",
    icon: "FaUtensils",
    endpoint: "restaurantes",
    displayField: "nombre",
    fields: ["nombre", "direccion", "detalles", "estado"],
    hasTarifas: true, // Indica que este servicio tiene tarifas asociadas
    tarifaEndpoint: "con-tarifas", // Endpoint para obtener con tarifas
  },
  tickets: {
    name: "Tickets",
    icon: "FaTicketAlt",
    endpoint: "tickets",
    displayField: "entrada",
    fields: [
      "entrada",
      "procedencia",
      "tipo_usuario",
      "edad_estudiante_min",
      "edad_estudiante_max",
      "estado",
    ],
    hasTarifas: true, // Indica que este servicio tiene tarifas asociadas
    tarifaEndpoint: "con-tarifas", // Endpoint para obtener con tarifas
  },
};

// Todos los servicios combinados
export const ALL_SERVICES = {
  ...PARENT_CHILD_SERVICES,
  ...STANDALONE_SERVICES,
};

/**
 * Get service configuration by type
 */
export const getServiceConfig = (serviceType) => {
  return ALL_SERVICES[serviceType] || null;
};

/**
 * Check if service has children
 */
export const hasChildren = (serviceType) => {
  return serviceType in PARENT_CHILD_SERVICES;
};

/**
 * Get display name for a service type
 */
export const getServiceDisplayName = (serviceType) => {
  const config = getServiceConfig(serviceType);
  return config ? config.name : serviceType;
};

/**
 * Get parent service display name
 */
export const getParentDisplayName = (serviceType) => {
  return getServiceDisplayName(serviceType);
};

/**
 * Get service name (singular)
 */
export const getServiceName = (serviceType) => {
  const config = getServiceConfig(serviceType);
  if (!config) return serviceType;

  // For parent-child services, return the child name
  if (hasChildren(serviceType)) {
    return config.childName;
  }

  return serviceType;
};

/**
 * Get icon for service type
 */
export const getServiceIcon = (serviceType) => {
  const config = getServiceConfig(serviceType);
  return config ? config.icon : "FaQuestion";
};

/**
 * Get endpoint for service type
 */
export const getServiceEndpoint = (serviceType) => {
  const config = getServiceConfig(serviceType);
  return config ? config.endpoint : `/turismo/${serviceType}`;
};

/**
 * Get child endpoint for parent services
 */
export const getChildEndpoint = (serviceType) => {
  const config = PARENT_CHILD_SERVICES[serviceType];
  return config ? config.childEndpoint : null;
};

/**
 * Get display field for service
 */
export const getDisplayField = (serviceType) => {
  const config = getServiceConfig(serviceType);
  return config ? config.displayField : "nombre";
};

/**
 * Get fields to display for service
 */
export const getServiceFields = (serviceType, isChild = false) => {
  const config = getServiceConfig(serviceType);
  if (!config) return [];

  if (isChild && config.childFields) {
    return config.childFields;
  }

  return config.fields || [];
};

/**
 * Get parent ID based on service type and entity
 */
export const getParentId = (parent, serviceType) => {
  if (!parent) return null;

  switch (serviceType) {
    case "hoteles":
      // Estructura normal: {id_hotel: X, nombre: "..."}
      return parent.id_hotel || parent.id;
    case "transportes":
      // Estructura normal: {id_transporte: X, nombre_transporte: "..."}
      return parent.id_transporte || parent.id;
    case "trenes":
      // Estructura normal: {id_tren: X, nombre_empresa: "..."}
      return parent.id_tren || parent.id;
    case "vuelos":
      // Estructura normal: {id_vuelo: X, nombre: "..."}
      return parent.id_vuelo || parent.id;
    case "guias":
      // Estructura anidada: {guia: {id_guia: X}, persona: {...}}
      return parent.guia?.id_guia || parent.id_guia || parent.id;
    case "endoses":
      // Estructura normal: {id_endose: X, nombre_agencia: "..."}
      return parent.id_endose || parent.endose_id || parent.id;
    case "restaurantes":
      // Servicios standalone: {id_restaurante: X} o estructura mínima
      return parent.id_restaurante || parent.id;
    case "tickets":
      // Servicios standalone: {id_ticket: X} o estructura mínima
      return parent.id_ticket || parent.id;
    default:
      return parent.id;
  }
};

/**
 * Get service ID based on service type and entity
 */
export const getServiceId = (service, serviceType) => {
  if (!service) return null;

  const config = getServiceConfig(serviceType);
  if (!config) return service.id;

  if (hasChildren(serviceType)) {
    const childName = config.childName;
    switch (childName) {
      case "habitacion":
        return service.id_habitacion || service.id;
      case "movilidad":
        return service.id_movilidad || service.id;
      case "vagon":
        return service.id_vagon || service.id;
      case "tipo_vuelo":
        return service.id_tipo_vuelo || service.id;
      case "ruta":
        return service.id_ruta || service.id;
      case "tarifa":
        // For tariffs in restaurants and tickets
        return service.id_tarifa || service.id;
      default:
        return service.id;
    }
  }

  return service.id;
};
