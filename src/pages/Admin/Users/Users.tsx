import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Toast } from "primereact/toast";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { ConfirmDialog } from "primereact/confirmdialog";

import { ProgressSpinner } from "primereact/progressspinner";
import { Password } from "primereact/password";
import { FaUsers, FaPlus } from "react-icons/fa";
import { useAuth } from "../../../context/AuthContext";
import * as userService from "../../../services/userService";
import UserFormModal from "./components/UserFormModal";
import UserCard from "./components/UserCard";
import UserFilters from "./components/UserFilters";
import { USER_ROLE_MAP, getUserDisplayName } from "./components/userConfig";
import "./Users.scss";

const Users = () => {
  const toast = useRef(null);
  const { auth } = useAuth();

  const getRoleName = useCallback((role) => USER_ROLE_MAP[role] || "Desconocido", []);

  // Estado principal
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [filters, setFilters] = useState({
    search: "",
    role: null,
    platform: null,
    business_type: null,
    is_active: null,
  });

  // Modales
  const [userDialog, setUserDialog] = useState(false);
  const [deleteUserDialog, setDeleteUserDialog] = useState(false);
  const [statusChangeDialog, setStatusChangeDialog] = useState(false);
  const [resetPasswordDialog, setResetPasswordDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [editMode, setEditMode] = useState(false);

  // Estado para cambio de contraseña
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  // Inicializar usuario vacío
  const initEmptyUser = () => ({
    email: "",
    password: "",
    confirmPassword: "",
    role: "",
    is_active: true,
    nombre: "",
    apellidopaterno: "",
    apellidomaterno: "",
    telefono: "",
    platform: "",
    business_type: "",
  });

  // Cargar usuarios
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      // Solicitar todos los usuarios (limit muy alto para obtener todos)
      const response = await userService.getUsers(1, 5000, "created_at", -1);

      if (response.success) {
        setUsers(response.accounts || []);
      }
    } catch (error) {
      console.error("Error loading users:", error);
      toast.current.show({
        severity: "error",
        summary: "Error",
        detail: "No se pudieron cargar los usuarios",
        life: 3000,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const visibleUsers = useMemo(() => {
    let filteredUsers = users;

    if (filters.search) {
      const search = filters.search.toLowerCase();
      filteredUsers = filteredUsers.filter(
        (user) =>
          getUserDisplayName(user).toLowerCase().includes(search) ||
          user.email?.toLowerCase().includes(search),
      );
    }

    if (filters.role !== null) {
      filteredUsers = filteredUsers.filter(
        (user) => user.role === filters.role,
      );
    }

    if (filters.platform) {
      filteredUsers = filteredUsers.filter(
        (user) => user.platform === filters.platform,
      );
    }

    if (filters.business_type) {
      filteredUsers = filteredUsers.filter(
        (user) => user.business_type === filters.business_type,
      );
    }

    if (filters.is_active !== null) {
      filteredUsers = filteredUsers.filter(
        (user) => user.is_active === filters.is_active,
      );
    }

    return filteredUsers;
  }, [users, filters]);

  // Handlers de acciones
  const openNew = () => {
    setSelectedUser(initEmptyUser());
    setEditMode(false);
    setUserDialog(true);
  };

  const editUser = (user) => {
    setSelectedUser({ ...user });
    setEditMode(true);
    setUserDialog(true);
  };

  const confirmDeleteUser = (user) => {
    setSelectedUser(user);
    setDeleteUserDialog(true);
  };

  const confirmStatusChange = (user) => {
    setSelectedUser(user);
    setStatusChangeDialog(true);
  };

  const showResetPasswordDialog = (user) => {
    setSelectedUser(user);
    setNewPassword("");
    setConfirmNewPassword("");
    setResetPasswordDialog(true);
  };

  // Guardar usuario
  const saveUser = async (userData) => {
    try {
      let response;

      if (editMode) {
        response = await userService.updateUser(userData.dniuser, {
          email: userData.email,
          nombre: userData.nombre,
          apellidopaterno: userData.apellidopaterno,
          apellidomaterno: userData.apellidomaterno,
          telefono: userData.telefono || null,
          role: typeof userData.role === "number"
            ? userData.role
            : parseInt(userData.role, 10),
          platform: userData.platform || null,
          business_type: userData.business_type || null,
          permissions: userData.permissions || null,
          is_active: userData.is_active,
        });
      } else {
        // Transform userData to match backend CreateAccountRequestDto structure
        const createData = {
          email: userData.email,
          password: userData.password,
          role: userData.role,
          platform: userData.platform || null,
          business_type: userData.business_type || null,
          account_details: {
            nombre: userData.nombre,
            apellidopaterno: userData.apellidopaterno,
            apellidomaterno: userData.apellidomaterno,
            telefono: userData.telefono || null,
          },
          permissions: userData.permissions || null,
        };
        response = await userService.createUser(createData);
      }

      if (response.success) {
        toast.current.show({
          severity: "success",
          summary: "Éxito",
          detail: editMode ? "Usuario actualizado" : "Usuario creado",
          life: 3000,
        });
        if (editMode) {
          setUsers((current) =>
            current.map((item) =>
              item.dniuser === userData.dniuser
                ? { ...item, ...userData, updated_at: new Date().toISOString() }
                : item,
            ),
          );
        } else {
          // El UUID se genera exclusivamente en backend. Recargamos la lista para
          // obtener la identidad tecnica y los datos normalizados persistidos.
          await loadUsers();
        }
        setUserDialog(false);
      }
    } catch (error) {
      const backendMsg =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        "Error al guardar usuario";
      toast.current.show({
        severity: "error",
        summary: "Error",
        detail: backendMsg,
        life: 5000,
      });
    }
  };

  // Eliminar usuario
  const deleteUser = async () => {
    try {
      const response = await userService.deleteUser(selectedUser.dniuser);
      if (response.success) {
        toast.current.show({
          severity: "success",
          summary: "Éxito",
          detail: "Usuario eliminado",
          life: 3000,
        });
        setUsers((current) => current.filter((item) => item.dniuser !== selectedUser.dniuser));
        setDeleteUserDialog(false);
      }
    } catch (error) {
      toast.current.show({
        severity: "error",
        summary: "Error",
        detail: "Error al eliminar usuario",
        life: 3000,
      });
    }
  };

  // Cambiar estado
  const toggleUserStatus = async () => {
    try {
      const response = await userService.toggleUserStatus(
        selectedUser.dniuser,
        !selectedUser.is_active,
      );

      if (response.success) {
        toast.current.show({
          severity: "success",
          summary: "Éxito",
          detail: `Usuario ${selectedUser.is_active ? "desactivado" : "activado"}`,
          life: 3000,
        });
        setUsers((current) =>
          current.map((item) =>
            item.dniuser === selectedUser.dniuser
              ? { ...item, is_active: !selectedUser.is_active }
              : item,
          ),
        );
        setStatusChangeDialog(false);
      }
    } catch (error) {
      toast.current.show({
        severity: "error",
        summary: "Error",
        detail: "Error al cambiar estado",
        life: 3000,
      });
    }
  };

  // Resetear contraseña
  const resetPassword = async () => {
    if (newPassword !== confirmNewPassword) {
      toast.current.show({
        severity: "warn",
        summary: "Advertencia",
        detail: "Las contraseñas no coinciden",
        life: 3000,
      });
      return;
    }

    if (newPassword.length < 8) {
      toast.current.show({
        severity: "warn",
        summary: "Advertencia",
        detail: "La contraseña debe tener al menos 8 caracteres",
        life: 3000,
      });
      return;
    }

    try {
      const response = await userService.updateUserPassword(
        selectedUser.dniuser,
        {
          new_password: newPassword,
          confirm_password: confirmNewPassword,
          admin_reset: true,
        },
      );

      if (response.success) {
        toast.current.show({
          severity: "success",
          summary: "Éxito",
          detail: "Contraseña actualizada",
          life: 3000,
        });
        setResetPasswordDialog(false);
      }
    } catch (error) {
      const backendMsg =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        "Error al cambiar contraseña";
      toast.current.show({
        severity: "error",
        summary: "Error",
        detail: backendMsg,
        life: 5000,
      });
    }
  };

  const clearFilters = () => {
    setFilters({
      search: "",
      role: null,
      platform: null,
      business_type: null,
      is_active: null,
    });
  };

  const userStats = useMemo(() => ({
    total: users.length,
    active: users.filter((user) => user.is_active).length,
    visible: visibleUsers.length,
  }), [users, visibleUsers.length]);

  return (
    <div className="users-page">
      <Toast ref={toast} />
      <ConfirmDialog />

      {/* Header */}
      <div className="page-header">
        <div className="header-left">
          <FaUsers className="page-icon" />
          <div><h1>Usuarios</h1><p>Accesos, roles y permisos del equipo</p></div>
        </div>
        <Button
          label="Nuevo Usuario"
          icon={<FaPlus />}
          className="users-page__create-button"
          onClick={openNew}
        />
      </div>

      <div className="users-overview">
        <div><strong>{userStats.total}</strong><span>Total</span></div>
        <div><strong>{userStats.active}</strong><span>Activos</span></div>
        <div><strong>{userStats.visible}</strong><span>Resultados</span></div>
      </div>

      {/* Filtros */}
      <UserFilters
        filters={filters}
        onFilterChange={setFilters}
        onClear={clearFilters}
      />

      {/* Lista compacta de usuarios */}
      {loading ? (
        <div className="loading-container">
          <ProgressSpinner />
        </div>
      ) : visibleUsers.length === 0 ? (
        <div className="empty-state">
          <FaUsers size={64} />
          <p>No se encontraron usuarios</p>
        </div>
      ) : (
        <div className="users-list">
          {visibleUsers.map((user) => (
            <UserCard
              key={user.dniuser}
              user={user}
              roleName={getRoleName(user.role)}
              onEdit={editUser}
              onResetPassword={showResetPasswordDialog}
              onToggleStatus={confirmStatusChange}
              onDelete={confirmDeleteUser}
            />
          ))}
        </div>
      )}

      {/* Modal de formulario */}
      <UserFormModal
        visible={userDialog}
        user={selectedUser}
        editMode={editMode}
        onHide={() => setUserDialog(false)}
        onSave={saveUser}
      />

      {/* Dialog de confirmación de eliminación */}
      <Dialog
        visible={deleteUserDialog}
        styleClass="users-dialog"
        style={{ width: "450px" }}
        header="Confirmar"
        modal
        dismissableMask={false}
        footer={
          <>
            <Button
              label="No"
              icon="pi pi-times"
              className="p-button-text"
              onClick={() => setDeleteUserDialog(false)}
            />
            <Button
              label="Sí"
              icon="pi pi-check"
              className="p-button-danger"
              onClick={deleteUser}
            />
          </>
        }
        onHide={() => setDeleteUserDialog(false)}
      >
        <div className="confirmation-content">
          <i
            className="pi pi-exclamation-triangle"
            style={{ fontSize: "2rem", color: "var(--color-danger)" }}
          />
          <span>
            ¿Está seguro de eliminar al usuario <b>{selectedUser?.nombre}</b>?
          </span>
        </div>
      </Dialog>

      {/* Dialog de confirmación de cambio de estado */}
      <Dialog
        visible={statusChangeDialog}
        styleClass="users-dialog"
        style={{ width: "450px" }}
        header="Confirmar"
        modal
        dismissableMask={false}
        footer={
          <>
            <Button
              label="No"
              icon="pi pi-times"
              className="p-button-text"
              onClick={() => setStatusChangeDialog(false)}
            />
            <Button
              label="Sí"
              icon="pi pi-check"
              className="p-button-warning"
              onClick={toggleUserStatus}
            />
          </>
        }
        onHide={() => setStatusChangeDialog(false)}
      >
        <div className="confirmation-content">
          <i
            className="pi pi-exclamation-triangle"
            style={{ fontSize: "2rem", color: "var(--color-warning)" }}
          />
          <span>
            ¿Está seguro de {selectedUser?.is_active ? "desactivar" : "activar"}{" "}
            al usuario <b>{selectedUser?.nombre}</b>?
          </span>
        </div>
      </Dialog>

      {/* Dialog de reset de contraseña */}
      <Dialog
        visible={resetPasswordDialog}
        styleClass="users-dialog users-dialog--password"
        style={{ width: "450px" }}
        header="Cambiar Contraseña"
        modal
        dismissableMask={false}
        footer={
          <>
            <Button
              label="Cancelar"
              icon="pi pi-times"
              className="p-button-text"
              onClick={() => setResetPasswordDialog(false)}
            />
            <Button
              label="Guardar"
              icon="pi pi-check"
              className="p-button-success"
              onClick={resetPassword}
            />
          </>
        }
        onHide={() => setResetPasswordDialog(false)}
      >
        <div className="password-reset-form">
          <div className="field">
            <label htmlFor="newPassword">Nueva Contraseña</label>
            <Password
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              toggleMask
              feedback={false}
              placeholder="Ingrese nueva contraseña"
            />
          </div>
          <div className="field">
            <label htmlFor="confirmPassword">Confirmar Contraseña</label>
            <Password
              id="confirmPassword"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              toggleMask
              feedback={false}
              placeholder="Confirme la contraseña"
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default Users;
