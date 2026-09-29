/**
 * Funciones de ayuda reutilizables para el módulo de Logs.
 * Íconos por tipo de operación/entidad, formateo de fechas, etc.
 */
import {
  FaPlus,
  FaEdit,
  FaCopy,
  FaTrash,
  FaSignInAlt,
  FaSignOutAlt,
  FaEye,
  FaInfoCircle,
  FaUser,
  FaDesktop,
  FaCalendarAlt,
  FaServer,
  FaDatabase,
} from "react-icons/fa";

// ============== ÍCONOS POR OPERACIÓN ==============

export function getOperationIcon(operationType) {
  switch (operationType) {
    case "CREATE":
      return <FaPlus className="operation-icon create" title="Crear" />;
    case "READ":
      return <FaEye className="operation-icon read" title="Lectura" />;
    case "UPDATE":
      return <FaEdit className="operation-icon update" title="Editar" />;
    case "DELETE":
      return <FaTrash className="operation-icon delete" title="Eliminar" />;
    case "DUPLICATE":
      return <FaCopy className="operation-icon duplicate" title="Duplicar" />;
    case "LOGIN":
      return (
        <FaSignInAlt className="operation-icon login" title="Iniciar sesión" />
      );
    case "LOGOUT":
      return (
        <FaSignOutAlt className="operation-icon logout" title="Cerrar sesión" />
      );
    default:
      return <FaInfoCircle className="operation-icon" title="Otra operación" />;
  }
}

// ============== ÍCONOS POR ENTIDAD ==============

export function getEntityIcon(entityType) {
  switch (entityType) {
    case "user_account":
      return <FaUser className="entity-icon user" />;
    case "session":
      return <FaDesktop className="entity-icon session" />;
    case "cotizacion":
      return <FaInfoCircle className="entity-icon cotizacion" />;
    case "voucher_venta":
    case "voucher_reserva":
      return <FaCalendarAlt className="entity-icon reserva" />;
    case "paquete_turistico":
    case "paquete_turistico_itinerario":
      return <FaServer className="entity-icon paquete" />;
    case "user_logs":
    case "system_logs":
      return <FaEye className="entity-icon user_logs" />;
    case "hotel":
    case "restaurante":
    case "transporte":
    case "guia":
    case "endose":
    case "tren":
    case "vuelos":
    case "persona":
      return <FaDatabase className="entity-icon" />;
    default:
      return <FaServer className="entity-icon" />;
  }
}

// ============== FORMATO DE FECHA ==============

export function formatLogDate(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleString();
}

// ============== PARSE DETALLES JSON ==============

export function parseLogDetails(details) {
  if (!details) return {};
  try {
    return typeof details === "string" ? JSON.parse(details) : details;
  } catch {
    return { error: "No se pudieron parsear los detalles" };
  }
}
