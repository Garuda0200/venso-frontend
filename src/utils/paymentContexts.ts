/**
 * Contextos de pago predefinidos para movimientos
 */

export const PAYMENT_CONTEXTS = {
  SERVICIOS: {
    category: "Servicios Turísticos",
    contexts: [
      "ServiciosVoucherReserva",
      "ServiciosVoucherVenta",
      "ServiciosPaqueteTuristico",
      "LiquidacionServicioProveedor",
    ],
  },
  PAGOS: {
    category: "Pagos y Cobros",
    contexts: ["PagoCotizacion"],
  },
};

/**
 * Get all payment contexts as a flat array
 */
export const getAllPaymentContexts = () => {
  const contexts = [];
  Object.values(PAYMENT_CONTEXTS).forEach((group) => {
    contexts.push(...group.contexts);
  });
  return contexts;
};

/**
 * Get payment contexts grouped by category
 */
export const getGroupedPaymentContexts = () => {
  return Object.entries(PAYMENT_CONTEXTS).map(
    ([key, { category, contexts }]) => ({
      category,
      contexts: contexts.map((context) => ({ value: context, label: context })),
    }),
  );
};

/**
 * Extract unique payment contexts from existing movimientos
 */
export const getExistingPaymentContexts = (movimientos = []) => {
  if (!movimientos || movimientos.length === 0) return [];

  const contextsSet = new Set();

  movimientos.forEach((mov) => {
    // contexto_pago puede ser un string o un objeto JSONB
    let contextoValue = null;

    if (typeof mov.contexto_pago === "string") {
      contextoValue = mov.contexto_pago.trim();
    } else if (
      typeof mov.contexto_pago === "object" &&
      mov.contexto_pago !== null
    ) {
      // Si es objeto JSONB, intentar extraer un campo específico o convertir a string
      if (mov.contexto_pago.tipo) {
        contextoValue = mov.contexto_pago.tipo;
      }
    }

    if (contextoValue && contextoValue !== "") {
      contextsSet.add(contextoValue);
    }
  });

  return Array.from(contextsSet).sort();
};
