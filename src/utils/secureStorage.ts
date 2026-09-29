import CryptoJS from "crypto-js";

// Generar una clave única por dispositivo (se mantiene en localStorage para persistencia)
const getOrCreateDeviceKey = () => {
  let deviceKey = localStorage.getItem("_dk");

  if (!deviceKey) {
    // Generar clave basada en características del navegador
    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      new Date().getTimezoneOffset(),
      window.screen.width + "x" + window.screen.height,
      window.devicePixelRatio || 1,
    ].join("|");

    deviceKey = CryptoJS.SHA256(fingerprint).toString();
    localStorage.setItem("_dk", deviceKey);
  }

  return deviceKey;
};

/**
 * Configuración de seguridad
 */
const SECURITY_CONFIG = {
  // Usar localStorage para persistencia entre sesiones del navegador (24 horas)
  useSessionStorage: false,

  // Tiempo de expiración de tokens en milisegundos (24 horas)
  tokenExpiration: 24 * 60 * 60 * 1000,

  // Prefijo para claves encriptadas
  encryptedPrefix: "_enc_",

  // Lista de claves que deben ser encriptadas
  sensitiveKeys: ["token", "user", "dniuser", "userEmail"],
};

/**
 * Encripta un valor usando AES-256
 * @param {string} value - Valor a encriptar
 * @returns {string} Valor encriptado
 */
const encrypt = (value) => {
  try {
    const deviceKey = getOrCreateDeviceKey();
    const encrypted = CryptoJS.AES.encrypt(value, deviceKey).toString();
    return encrypted;
  } catch (error) {
    console.error(" Encryption error:", error);
    return value; // Fallback: retornar valor sin encriptar
  }
};

/**
 * Desencripta un valor
 * @param {string} encryptedValue - Valor encriptado
 * @returns {string} Valor desencriptado
 */
const decrypt = (encryptedValue) => {
  try {
    const deviceKey = getOrCreateDeviceKey();
    const decrypted = CryptoJS.AES.decrypt(encryptedValue, deviceKey);
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error(" Decryption error:", error);
    return null;
  }
};

/**
 * Determina si una clave debe ser encriptada
 * @param {string} key - Nombre de la clave
 * @returns {boolean}
 */
const shouldEncrypt = (key) => {
  return SECURITY_CONFIG.sensitiveKeys.includes(key);
};

/**
 * Obtiene el storage apropiado (sessionStorage o localStorage)
 */
const getStorage = () => {
  return SECURITY_CONFIG.useSessionStorage ? sessionStorage : localStorage;
};

/**
 * Clase principal de almacenamiento seguro
 */
class SecureStorage {
  /**
   * Guarda un valor de forma segura
   * @param {string} key - Clave
   * @param {any} value - Valor (será serializado a JSON)
   * @param {object} options - Opciones adicionales
   */
  static setItem(key, value, options = {}) {
    try {
      const storage = getStorage();
      const timestamp = Date.now();

      // Serializar valor
      const serializedValue =
        typeof value === "string" ? value : JSON.stringify(value);

      // Crear objeto con metadata
      const dataObject = {
        value: serializedValue,
        timestamp,
        expiresAt:
          options.expiresAt || timestamp + SECURITY_CONFIG.tokenExpiration,
      };

      const dataString = JSON.stringify(dataObject);

      // Encriptar si es necesario
      if (shouldEncrypt(key)) {
        const encryptedData = encrypt(dataString);
        storage.setItem(SECURITY_CONFIG.encryptedPrefix + key, encryptedData);
      } else {
        storage.setItem(key, dataString);
      }

      // Notificar a otras pestañas
      this.notifyOtherTabs("set", key, value);

      return true;
    } catch (error) {
      console.error(" SecureStorage.setItem error:", error);
      return false;
    }
  }

  /**
   * Obtiene un valor de forma segura
   * @param {string} key - Clave
   * @returns {any} Valor deserializado o null
   */
  static getItem(key) {
    try {
      const storage = getStorage();
      const isEncrypted = shouldEncrypt(key);
      const storageKey = isEncrypted
        ? SECURITY_CONFIG.encryptedPrefix + key
        : key;

      let dataString = storage.getItem(storageKey);

      if (!dataString) return null;

      // Desencriptar si es necesario
      if (isEncrypted) {
        dataString = decrypt(dataString);
        if (!dataString) return null;
      }

      // Parsear metadata
      const dataObject = JSON.parse(dataString);

      // Verificar expiración
      if (dataObject.expiresAt && Date.now() > dataObject.expiresAt) {
        console.warn(" Token expired, removing:", key);
        this.removeItem(key);
        return null;
      }

      // Intentar parsear el valor (si es JSON)
      try {
        return JSON.parse(dataObject.value);
      } catch {
        return dataObject.value;
      }
    } catch (error) {
      console.error(" SecureStorage.getItem error:", error);
      return null;
    }
  }

  /**
   * Elimina un valor
   * @param {string} key - Clave
   */
  static removeItem(key) {
    try {
      const storage = getStorage();
      const isEncrypted = shouldEncrypt(key);
      const storageKey = isEncrypted
        ? SECURITY_CONFIG.encryptedPrefix + key
        : key;

      storage.removeItem(storageKey);

      // Notificar a otras pestañas
      this.notifyOtherTabs("remove", key, null);

      return true;
    } catch (error) {
      console.error(" SecureStorage.removeItem error:", error);
      return false;
    }
  }

  /**
   * Limpia todo el storage
   * @param {boolean} preserveAuth - Si true, preserva datos de autenticación
   */
  static clear(preserveAuth = false) {
    try {
      const storage = getStorage();

      if (preserveAuth) {
        // Preservar datos de autenticación
        const authData = {};
        SECURITY_CONFIG.sensitiveKeys.forEach((key) => {
          const value = this.getItem(key);
          if (value) authData[key] = value;
        });

        storage.clear();

        // Restaurar autenticación
        Object.entries(authData).forEach(([key, value]) => {
          this.setItem(key, value);
        });
      } else {
        storage.clear();
      }

      // Notificar a otras pestañas
      this.notifyOtherTabs("clear", null, null);

      return true;
    } catch (error) {
      console.error(" SecureStorage.clear error:", error);
      return false;
    }
  }

  /**
   * Verifica si un token es válido (no expirado)
   * @param {string} key - Clave del token
   * @returns {boolean}
   */
  static isValid(key) {
    const value = this.getItem(key);
    return value !== null;
  }

  /**
   * Renueva la expiración de un token
   * @param {string} key - Clave del token
   */
  static renewExpiration(key) {
    const value = this.getItem(key);
    if (value) {
      this.setItem(key, value);
      return true;
    }
    return false;
  }

  /**
   * Notifica a otras pestañas sobre cambios
   * @param {string} action - Acción realizada
   * @param {string} key - Clave afectada
   * @param {any} value - Valor (si aplica)
   */
  static notifyOtherTabs(action, key, value) {
    try {
      const event = new CustomEvent("secureStorage:change", {
        detail: { action, key, value, timestamp: Date.now() },
      });
      window.dispatchEvent(event);

      // También usar localStorage para comunicación entre pestañas
      const message = JSON.stringify({ action, key, timestamp: Date.now() });
      localStorage.setItem("_storage_sync", message);
      localStorage.removeItem("_storage_sync");
    } catch (error) {
      // Ignorar errores de notificación
    }
  }

  /**
   * Migra datos de localStorage normal a SecureStorage
   */
  static migrateFromLocalStorage() {
    try {
      console.log(" Migrando datos a almacenamiento seguro...");

      SECURITY_CONFIG.sensitiveKeys.forEach((key) => {
        const value = localStorage.getItem(key);
        if (value) {
          this.setItem(key, value);
          localStorage.removeItem(key);
        }
      });

      console.log(" Migración completada");
      return true;
    } catch (error) {
      console.error(" Error en migración:", error);
      return false;
    }
  }
}

/**
 * Listener para sincronización entre pestañas
 */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === "_storage_sync" && e.newValue) {
      try {
        const { action, key } = JSON.parse(e.newValue);

        // Despachar evento local
        const event = new CustomEvent("secureStorage:externalChange", {
          detail: { action, key },
        });
        window.dispatchEvent(event);
      } catch (error) {
        // Ignorar errores de parsing
      }
    }
  });
}

export default SecureStorage;

/**
 * Helpers para compatibilidad con código existente
 */
export const secureLocalStorage = {
  setItem: (key, value) => SecureStorage.setItem(key, value),
  getItem: (key) => SecureStorage.getItem(key),
  removeItem: (key) => SecureStorage.removeItem(key),
  clear: () => SecureStorage.clear(false),
};
