/**
 * Helper para generar rutas organizadas en Tigris Object Storage
 *
 * Estructura de carpetas JERÁRQUICA:
 *
 * {voucher_venta_id}/
 * ├── {voucher_code (file)}/
 * │ ├── pagos_cotizacion/
 * │ │ └── pago-1/, pago-2/, ...
 * │ │ └── evidencia-1.jpg, evidencia-2.pdf, ...
 * │ ├── {voucher_reserva_id}/
 * │ │ └── servicio-{dia}-{index}-{typeservice}-{servicio_id}/
 * │ │ └── evidencia-1.jpg, evidencia-2.jpg, ...
 * │ └── documentos_ventas/
 * │ ├── pasaportes/
 * │ ├── idcards/
 * │ └── other/
 * └── otros_pagos/
 * └── evidencias/
 */

/**
 * Genera la ruta base del voucher en Tigris
 * @param {string|number} voucherVentaId - ID primario del voucher de venta
 * @param {string} voucherCode - Código del voucher (file)
 * @returns {string} Ruta base: {voucher_venta_id}/{voucher_code}/
 */
const getVoucherBasePath = (voucherVentaId, voucherCode) => {
  if (!voucherVentaId || !voucherCode) {
    console.warn(
      " voucherVentaId o voucherCode faltante, usando ruta genérica",
    );
    return "otros_pagos";
  }
  return `${voucherVentaId}/${voucherCode}`;
};

/**
 * Genera ruta para evidencias de pagos de cotización
 * @param {string|number} voucherVentaId - ID del voucher de venta
 * @param {string} voucherCode - Código del voucher (file)
 * @param {number} pagoIndex - Índice del pago (1, 2, 3...)
 * @param {number} evidenciaIndex - Índice de la evidencia dentro del pago (opcional)
 * @returns {string} Ruta completa
 */
export const getTigrisPathForPagoCotizacion = (
  voucherVentaId,
  voucherCode,
  pagoIndex = 1,
  evidenciaIndex = null,
) => {
  const basePath = getVoucherBasePath(voucherVentaId, voucherCode);
  const carpetaPago = `pago-${pagoIndex}`;

  if (evidenciaIndex !== null) {
    return `${basePath}/pagos_cotizacion/${carpetaPago}/evidencia-${evidenciaIndex}`;
  }

  return `${basePath}/pagos_cotizacion/${carpetaPago}`;
};

/**
 * Genera ruta para evidencias de servicios asignados en voucher de reserva
 * @param {string|number} voucherVentaId - ID del voucher de venta
 * @param {string} voucherCode - Código del voucher (file)
 * @param {string|number} voucherReservaId - ID del voucher de reserva
 * @param {number} dia - Día del servicio
 * @param {number} serviceIndex - Índice del servicio en ese día
 * @param {string} typeService - Tipo de servicio (hotel, transporte, etc.)
 * @param {string|number} servicioId - ID del servicio
 * @param {number} evidenciaIndex - Índice de la evidencia (opcional)
 * @returns {string} Ruta completa
 */
export const getTigrisPathForServicioAsignado = (
  voucherVentaId,
  voucherCode,
  voucherReservaId,
  dia,
  serviceIndex,
  typeService,
  servicioId,
  evidenciaIndex = null,
) => {
  const basePath = getVoucherBasePath(voucherVentaId, voucherCode);
  const nombreServicio = `servicio-${dia}-${serviceIndex}-${typeService}-${servicioId}`;

  if (evidenciaIndex !== null) {
    return `${basePath}/${voucherReservaId}/${nombreServicio}/evidencia-${evidenciaIndex}`;
  }

  return `${basePath}/${voucherReservaId}/${nombreServicio}`;
};

/**
 * Genera ruta para documentos de pasajeros en voucher de venta
 * @param {string|number} voucherVentaId - ID del voucher de venta
 * @param {string} voucherCode - Código del voucher (file)
 * @param {string} tipoDocumento - Tipo: 'passports', 'idCards', 'otherDocuments'
 * @returns {string} Ruta completa
 */
export const getTigrisPathForDocumentosVenta = (
  voucherVentaId,
  voucherCode,
  tipoDocumento = "otherDocuments",
) => {
  const basePath = getVoucherBasePath(voucherVentaId, voucherCode);

  // Mapeo de tipos de documentos
  const tipoMap = {
    passports: "pasaportes",
    idCards: "idcards",
    otherDocuments: "other",
    // Aliases
    pasaportes: "pasaportes",
    documentos_identidad: "idcards",
    otros: "other",
  };

  const carpeta = tipoMap[tipoDocumento] || "other";
  return `${basePath}/documentos_ventas/${carpeta}`;
};

/**
 * Genera ruta para otros pagos no relacionados con vouchers
 * @returns {string} Ruta completa
 */
export const getTigrisPathForOtrosPagos = () => {
  const fecha = new Date();
  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, "0");

  return `otros_pagos/evidencias/${year}/${month}`;
};

/**
 * Genera ruta para pagos de voucher venta (wrapper para pago de cotización)
 * Mantener compatibilidad con código existente
 * @param {string} voucherCode - Código del voucher (file)
 * @param {string|number} voucherVentaId - ID del voucher (opcional)
 * @param {number} pagoIndex - Índice del pago
 * @returns {string} Ruta completa
 */
export const getTigrisPathForPagosVoucher = (
  voucherCode,
  voucherVentaId = null,
  pagoIndex = 1,
) => {
  if (!voucherCode) {
    console.warn(" voucherCode no proporcionado, usando ruta de otros_pagos");
    return getTigrisPathForOtrosPagos();
  }

  // Si no hay voucherVentaId, usar voucherCode como ID (para retrocompatibilidad)
  const voucherId = voucherVentaId || voucherCode;

  return getTigrisPathForPagoCotizacion(voucherId, voucherCode, pagoIndex);
};

/**
 * Obtiene el siguiente índice de pago disponible
 * @param {Array} existingPayments - Array de pagos existentes
 * @returns {number} Siguiente índice
 */
export const getNextPagoIndex = (existingPayments = []) => {
  if (!existingPayments || existingPayments.length === 0) {
    return 1;
  }
  return existingPayments.length + 1;
};

/**
 * Obtiene el siguiente índice de evidencia disponible
 * @param {Array} existingEvidencias - Array de evidencias existentes
 * @returns {number} Siguiente índice
 */
export const getNextEvidenciaIndex = (existingEvidencias = []) => {
  if (!existingEvidencias || existingEvidencias.length === 0) {
    return 1;
  }
  return existingEvidencias.length + 1;
};

/**
 * Extrae información del contexto de pago para generar rutas
 * @param {object} datosExtra - Objeto datos_extra del movimiento
 * @returns {object} Contexto extraído
 */
export const extractContextoFromDatosExtra = (datosExtra) => {
  if (!datosExtra) {
    return { tipo: "Otro", concepto: "general" };
  }

  // Detectar tipo de pago
  if (datosExtra.payment_type === "voucher_venta_payment") {
    return {
      tipo: "VoucherVenta",
      voucher_id: datosExtra.voucher_venta_id || null,
      voucher_code: datosExtra.voucher_code || null,
      subTipo: datosExtra.payment_subtype || "pagos_cotizacion",
    };
  } else if (datosExtra.payment_type === "service_payment") {
    return {
      tipo: "ServicioAsignado",
      voucher_reserva_id: datosExtra.voucher_reserva_id || null,
      servicio_id: datosExtra.servicio_id || null,
      subTipo: "servicio",
    };
  }

  // Otros tipos de pago
  return {
    tipo: "Otro",
    concepto: datosExtra.concepto || "general",
  };
};

/**
 * Obtiene una descripción legible de la ruta
 * @param {string} tigrisPath - Ruta de Tigris
 * @returns {string} Descripción legible
 */
export const getPathDescription = (tigrisPath) => {
  const parts = tigrisPath.split("/");

  if (parts.includes("pagos_cotizacion")) {
    return `Pago de Cotización - ${parts[parts.indexOf("pagos_cotizacion") + 1] || ""}`;
  } else if (parts.includes("documentos_ventas")) {
    const tipoDoc = parts[parts.indexOf("documentos_ventas") + 1];
    return `Documento - ${tipoDoc || "General"}`;
  } else if (parts.includes("otros_pagos")) {
    return "Otros Pagos";
  } else if (parts[0].match(/^\d+$/)) {
    return `Voucher ${parts[1]} - ${parts[2] || ""}`;
  }

  return "Evidencia";
};
