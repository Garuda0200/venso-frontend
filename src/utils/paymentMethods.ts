export const PAYMENT_METHODS = {
  CASH: {
    category: "Efectivo",
    methods: [{ value: "Efectivo", label: "Efectivo" }],
  },
  BANK_TRANSFER: {
    category: "Transferencias Bancarias",
    methods: [
      { value: "Transferencia Bancaria", label: "Transferencia Bancaria" },
      { value: "Depósito Bancario", label: "Depósito Bancario" },
      { value: "Interbancaria", label: "Interbancaria" },
    ],
  },
};

export const getAllPaymentMethods = () => {
  return Object.values(PAYMENT_METHODS).flatMap((category) => category.methods);
};

export const getGroupedPaymentMethods = () => {
  return Object.values(PAYMENT_METHODS).map(({ category, methods }) => ({
    category,
    methods,
  }));
};

export const getExistingPaymentMethods = (movimientos) => {
  if (!movimientos || !Array.isArray(movimientos)) return [];

  const uniqueMethods = new Set();
  movimientos.forEach((mov) => {
    if (mov.metodo_pago && mov.metodo_pago.trim() !== "") {
      uniqueMethods.add(mov.metodo_pago.trim());
    }
  });

  return Array.from(uniqueMethods).map((method) => ({
    value: method,
    label: method,
  }));
};

export const isValidPaymentMethod = (method) => {
  if (!method || method.trim() === "") return false;

  const allMethods = getAllPaymentMethods();
  return allMethods.some((m) => m.value === method);
};
