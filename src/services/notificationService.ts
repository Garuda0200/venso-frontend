import { createApiInstance, getApiUrl, parseApiError } from "../utils/apiUtils";

/**
 * Servicio de notificaciones para interactuar con la API
 * Replicando funcionalidad del sistema Leptos usando apiUtils
 */
class NotificationService {
  constructor() {
    this.apiInstance = createApiInstance();
    this.baseURL = getApiUrl();
  }
  /**
   * Actualizar instancia API cuando cambia la sesión.
   */
  refreshApiInstance() {
    this.apiInstance = createApiInstance();
  }

  /**
   * Realizar petición HTTP usando apiUtils
   */
  async request(endpoint, options = {}) {
    try {
      const response = await this.apiInstance.request({
        url: endpoint,
        method: options.method || "GET",
        data: options.body ? JSON.parse(options.body) : undefined,
        ...options,
      });

      return response.data;
    } catch (error) {
      console.error(`Error en petición ${endpoint}:`, error);
      throw new Error(parseApiError(error));
    }
  }

  /**
   * Obtener notificaciones con filtros (igual que en Leptos)
   */
  async getNotifications(params = {}) {
    const queryParams = new URLSearchParams();

    if (params.user_dniuser)
      queryParams.append("user_dniuser", params.user_dniuser);
    if (params.role) queryParams.append("role", params.role);
    if (params.limit) queryParams.append("limit", params.limit.toString());
    if (params.unread_only !== undefined)
      queryParams.append("unread_only", params.unread_only.toString());
    if (params.tipo) queryParams.append("tipo", params.tipo);
    if (params.from_date) queryParams.append("from_date", params.from_date);
    if (params.to_date) queryParams.append("to_date", params.to_date);

    const endpoint = `/notifications${queryParams.toString() ? "?" + queryParams.toString() : ""}`;
    return await this.request(endpoint);
  }

  /**
   * Obtener notificación por ID
   */
  async getNotificationById(id) {
    return await this.request(`/notifications/${id}`);
  }

  /**
   * Crear nueva notificación
   */
  async createNotification(data) {
    return await this.request("/notifications", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Actualizar notificación
   */
  async updateNotification(id, data) {
    return await this.request(`/notifications/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  /**
   * Eliminar notificación
   */
  async deleteNotification(id) {
    return await this.request(`/notifications/${id}`, {
      method: "DELETE",
    });
  }

  /**
   * Marcar notificación como leída (igual que en Leptos)
   */
  async markAsRead(id) {
    return await this.request(`/notifications/${id}/read`, {
      method: "PUT",
    });
  }

  /**
   * Marcar todas las notificaciones como leídas para un usuario
   */
  async markAllAsReadForUser(userDni) {
    return await this.request(`/notifications/user/${userDni}/read-all`, {
      method: "PUT",
    });
  }

  /**
   * Obtener conteo de notificaciones no leídas
   */
  async getUnreadCount(userDni) {
    return await this.request(`/notifications/user/${userDni}/unread-count`);
  }

  /**
   * Limpiar notificaciones antiguas (admin)
   */
  async cleanupOldNotifications(daysOld = 30) {
    return await this.request("/notifications/cleanup", {
      method: "DELETE",
      body: JSON.stringify({ days_old: daysOld }),
    });
  }

  /**
   * SSE: Obtener estadísticas de conexiones SSE
   */
  async getSseStats() {
    return await this.request("/notifications/sse/stats");
  }

  /**
   * SSE: Enviar notificación de prueba
   */
  async sendTestNotification(data) {
    return await this.request("/notifications/sse/test", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * SSE: Limpiar conexiones SSE inactivas
   */
  async cleanupSseConnections() {
    return await this.request("/notifications/sse/cleanup", {
      method: "POST",
    });
  }

  /**
   * Crear conexión SSE (igual que en Leptos)
   */
  createSseConnection(userDni, userRole, options = {}) {
    const {
      includeGlobal = true,
      lastEventId = null,
      baseURL = this.baseURL,
    } = options;

    const normalizedBaseUrl = String(baseURL || getApiUrl()).replace(/\/+$/, "");
    const sseUrl = new URL(
      `${normalizedBaseUrl}/notifications/stream`,
      window.location.origin,
    );
    sseUrl.searchParams.append("user_dniuser", userDni);
    sseUrl.searchParams.append("user_role", userRole.toString());
    sseUrl.searchParams.append("include_global", includeGlobal.toString());

    if (lastEventId) {
      sseUrl.searchParams.append("last_event_id", lastEventId);
    }

    const eventSource = new EventSource(sseUrl.toString());

    return eventSource;
  }

  /**
   * Validar datos de notificación
   */
  validateNotificationData(data) {
    const errors = [];

    if (!data.titulo || data.titulo.trim().length === 0) {
      errors.push("El título es obligatorio");
    }

    if (!data.mensaje || data.mensaje.trim().length === 0) {
      errors.push("El mensaje es obligatorio");
    }

    if (
      !data.tipo ||
      !["INFO", "SUCCESS", "WARNING", "ERROR"].includes(data.tipo)
    ) {
      errors.push("Tipo de notificación inválido");
    }

    if (data.user_dniuser && data.es_global) {
      errors.push(
        "Una notificación no puede ser global y dirigida a un usuario específico",
      );
    }

    if (!data.user_dniuser && !data.es_global) {
      errors.push(
        "La notificación debe ser global o dirigida a un usuario específico",
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Formatear notificación para envío
   */
  formatNotificationForApi(data) {
    return {
      titulo: data.titulo?.trim(),
      mensaje: data.mensaje?.trim(),
      tipo: data.tipo,
      user_dniuser: data.user_dniuser || null,
      es_global: data.es_global || false,
      priority: data.priority || 0,
      expira_en: data.expira_en || null,
      metadata: data.metadata || null,
      created_by: data.created_by || "system",
    };
  }

  /**
   * Obtener URL completa del SSE
   */
  getSseUrl(userDni, userRole, options = {}) {
    const normalizedBaseUrl = String(this.baseURL || getApiUrl()).replace(/\/+$/, "");
    const sseUrl = new URL(
      `${normalizedBaseUrl}/notifications/stream`,
      window.location.origin,
    );

    sseUrl.searchParams.append("user_dniuser", userDni);
    sseUrl.searchParams.append("user_role", userRole.toString());
    sseUrl.searchParams.append(
      "include_global",
      (options.includeGlobal || true).toString(),
    );

    if (options.lastEventId) {
      sseUrl.searchParams.append("last_event_id", options.lastEventId);
    }

    return sseUrl.toString();
  }
}

// Instancia singleton
const notificationService = new NotificationService();

export default notificationService;
export { NotificationService };


