import { useAuth } from "../../../../context/AuthContext";
import SecureStorage from "../../../../utils/secureStorage";

/**
 * Hook personalizado que proporciona información de auditoría para operaciones CRUD
 * @returns {Object} Objeto con información de auditoría (userId, username)
 */
const useAuditInfo = () => {
  const { getCurrentUser } = useAuth();
  const currentUser = getCurrentUser();

  // Obtener el DNI del usuario actual, o null si no está disponible
  const dniuser =
    currentUser?.dniuser || SecureStorage.getItem("dniuser") || null;

  // Role del usuario (0=superadmin, 3=reservas, etc.)
  const storedRole = SecureStorage.getItem("userRole");
  const userRole =
    currentUser?.role != null
      ? Number(currentUser.role)
      : storedRole != null
        ? Number(storedRole)
        : null;

  return {
    userId: dniuser,
    username: currentUser?.nombre
      ? `${currentUser.nombre} ${currentUser.apellidopaterno || ""}`
      : "Sistema",
    userRole,
  };
};

export default useAuditInfo;
