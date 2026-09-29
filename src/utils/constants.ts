// Tasa de cambio por defecto (fallback si el backend no responde)
// El valor real debería obtenerse de exchangeRateService.getExchangeRates()
export const EXCHANGE_RATE = Number(
  // Permite sobrescribir por .env si quieres (opcional)
  import.meta.env.VITE_EXCHANGE_RATE ?? 3,
);

// Alias para claridad
export const DEFAULT_USD_TO_PEN_RATE = EXCHANGE_RATE;
export const DEFAULT_MXN_TO_PEN_RATE = 0.2;
