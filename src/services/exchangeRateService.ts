import axiosInstance from "../utils/axiosInstance";

const exchangeRateService = {
  async getExchangeRates(platform = "venso") {
    try {
      const response = await axiosInstance.get(`/exchange-rates`, {
        params: { platform },
      });

      if (response.data?.success) {
        return {
          success: true,
          data: response.data.data,
        };
      }

      throw new Error(
        response.data?.message || "Error al obtener tasas de cambio",
      );
    } catch (error) {
      console.error(" Error fetching exchange rates:", error);
      // Fallback a tasas por defecto si falla el backend
      return {
        success: true,
        data: {
          rates: { USD: 3, MXN: 0.2 },
          base_currency: "PEN",
          updated_at: new Date().toISOString(),
        },
      };
    }
  },

  async getAllExchangeRates(platform = null) {
    try {
      const params = platform ? { platform } : {};
      const response = await axiosInstance.get(`/exchange-rates/all`, {
        params,
      });

      if (response.data?.success) {
        return {
          success: true,
          data: response.data.data,
        };
      }

      throw new Error(
        response.data?.message || "Error al obtener tasas de cambio",
      );
    } catch (error) {
      console.error(" Error fetching all exchange rates:", error);
      return { success: false, data: [] };
    }
  },

  async updateExchangeRate(monedaOrigen, tasa, platform = "venso") {
    try {
      const response = await axiosInstance.put(`/exchange-rates`, {
        moneda_origen: monedaOrigen,
        tasa,
        platform,
      });

      return response.data;
    } catch (error) {
      console.error(" Error updating exchange rate:", error);
      throw error;
    }
  },

  convertToPEN(amount, fromCurrency, rates) {
    const rate = rates?.[fromCurrency] || rates?.rates?.[fromCurrency] || 1;
    return parseFloat(amount) * rate;
  },

  convertFromPEN(amount, toCurrency, rates) {
    const rate = rates?.[toCurrency] || rates?.rates?.[toCurrency] || 1;
    return rate > 0 ? parseFloat(amount) / rate : 0;
  },

  formatCurrency(amount, currency = "PEN") {
    const symbols = {
      PEN: "S/",
      USD: "$",
      MXN: "MX$",
    };
    const symbol = symbols[currency] || currency;
    return `${symbol} ${parseFloat(amount || 0).toFixed(2)}`;
  },
};

export default exchangeRateService;
