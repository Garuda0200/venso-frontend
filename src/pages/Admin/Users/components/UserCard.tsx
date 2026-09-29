import React, { useMemo } from "react";
import {
  FaEnvelope,
  FaPhone,
  FaEdit,
  FaKey,
  FaToggleOn,
  FaToggleOff,
  FaTrash,
  FaClock,
  FaUserShield,
} from "react-icons/fa";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import ExpandableActions, {
  ExpandableActionItem,
} from "../../../../components/common/ExpandableActions";
import { getUserDisplayName } from "./userConfig";
import "./UserCard.scss";

const UserCard = React.memo(({
  user,
  roleName,
  onEdit,
  onResetPassword,
  onToggleStatus,
  onDelete,
}) => {
  const getInitials = (name) => {
    if (!name) return "??";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return parts[0]?.substring(0, 2).toUpperCase() || "??";
  };

  const formatRelativeDate = (date) => {
    if (!date) return "Nunca";
    try {
      return formatDistanceToNow(new Date(date), {
        addSuffix: true,
        locale: es,
      });
    } catch {
      return "Fecha inválida";
    }
  };

  const displayName = getUserDisplayName(user);
  const platformLabel = { venso: "Venso", mil: "Mil", all: "Todas" };

  const actions = useMemo<ExpandableActionItem[]>(
    () => [
      {
        key: "edit",
        label: "Editar usuario",
        icon: <FaEdit />,
        onClick: () => onEdit(user),
        tone: "primary",
      },
      {
        key: "password",
        label: "Cambiar contraseña",
        icon: <FaKey />,
        onClick: () => onResetPassword(user),
        tone: "info",
      },
      {
        key: "status",
        label: user.is_active ? "Desactivar" : "Activar",
        icon: user.is_active ? <FaToggleOff /> : <FaToggleOn />,
        onClick: () => onToggleStatus(user),
        tone: user.is_active ? "warning" : "primary",
      },
      {
        key: "delete",
        label: "Eliminar usuario",
        icon: <FaTrash />,
        onClick: () => onDelete(user),
        tone: "danger",
      },
    ],
    [onDelete, onEdit, onResetPassword, onToggleStatus, user],
  );

  return (
    <article className={`user-row ${!user.is_active ? "is-inactive" : ""}`}>
      <section className="user-row__identity">
        <div className="user-row__avatar" aria-hidden="true">
          {getInitials(displayName)}
        </div>
        <div className="user-row__identity-copy">
          <div className="user-row__name-line">
            <strong>{displayName}</strong>
            <span className={`user-row__status ${user.is_active ? "is-active" : "is-inactive"}`}>
              {user.is_active ? "Activo" : "Inactivo"}
            </span>
          </div>
          <span className="user-row__dni">{user.email}</span>
        </div>
      </section>

      <section className="user-row__contact" aria-label="Contacto">
        <span title={user.email}>
          <FaEnvelope />
          <span>{user.email}</span>
        </span>
        <span title={user.telefono || "Sin teléfono"}>
          <FaPhone />
          <span>{user.telefono || "Sin teléfono"}</span>
        </span>
      </section>

      <section className="user-row__access" aria-label="Acceso">
        <span className="user-row__role">
          <FaUserShield />
          {roleName || user.role}
        </span>
        <span className="user-row__meta-pill">
          {platformLabel[user.platform] || user.platform || "Sin plataforma"}
        </span>
        {user.business_type && (
          <span className="user-row__meta-pill">{user.business_type}</span>
        )}
      </section>

      <section className="user-row__activity" aria-label="Actividad">
        <span>
          <FaClock />
          <span>
            <small>Último acceso</small>
            <strong>{formatRelativeDate(user.last_login)}</strong>
          </span>
        </span>
        <span className="user-row__created">
          Registrado {formatRelativeDate(user.created_at)}
        </span>
      </section>

      <section className="user-row__actions">
        <ExpandableActions
          actions={actions}
          label={`Opciones de ${displayName}`}
          compact
        />
      </section>
    </article>
  );
});

UserCard.displayName = "UserCard";

export default UserCard;
