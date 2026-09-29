import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./Profile.scss";
import {
  FaEdit,
  FaEnvelope,
  FaIdCard,
  FaKey,
  FaPhone,
  FaShieldAlt,
  FaUser,
} from "react-icons/fa";
import { PasswordModal } from "./PasswordModal";
import { EditProfileModal } from "./EditProfileModal";
import { useAuth } from "../../../context/AuthContext";
import { createAxiosInstance } from "../../../utils/axiosInstance";

const getRoleName = (roleNumber) => {
  switch (Number(roleNumber)) {
    case 0:
      return "Super Admin";
    case 1:
      return "Administrador";
    case 2:
      return "Ventas";
    case 3:
      return "Reservas";
    case 4:
      return "Contabilidad";
    case 5:
      return "Gestión Media";
    default:
      return "Usuario";
  }
};

const displayValue = (value, fallback = "No registrado") => {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
};

const ProfileField = ({ icon, label, value, muted = false }) => (
  <div className={`profile-field ${muted ? "profile-field--muted" : ""}`}>
    <span className="profile-field__icon" aria-hidden="true">{icon}</span>
    <div>
      <span className="profile-field__label">{label}</span>
      <strong className="profile-field__value">{displayValue(value)}</strong>
    </div>
  </div>
);

export function Profile() {
  const { auth } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const [profileData, setProfileData] = useState({
    nombre: "",
    apellidoPaterno: "",
    apellidoMaterno: "",
    telefono: "",
    correo: "",
  });

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const fetchProfileData = async () => {
      if (!auth.user?.dniuser) {
        setLoading(false);
        return;
      }

      try {
        const axiosInstance = createAxiosInstance();
        const response = await axiosInstance.get(
          `/protected/account/${auth.user.dniuser}/profile`,
        );

        if (response.data?.success) {
          const profile = response.data.profile || {};
          setProfileData({
            nombre: profile.nombre || "",
            apellidoPaterno: profile.apellidopaterno || "",
            apellidoMaterno: profile.apellidomaterno || "",
            telefono: profile.telefono || "",
            correo: profile.email || auth.user.email || "",
          });
        } else {
          setProfileData({
            nombre: auth.user.nombre || "",
            apellidoPaterno: auth.user.apellidopaterno || "",
            apellidoMaterno: auth.user.apellidomaterno || "",
            telefono: auth.user.telefono || "",
            correo: auth.user.email || "",
          });
        }
      } catch (fetchError) {
        console.error("Failed to fetch profile:", fetchError);
        setProfileData({
          nombre: auth.user.nombre || "",
          apellidoPaterno: auth.user.apellidopaterno || "",
          apellidoMaterno: auth.user.apellidomaterno || "",
          telefono: auth.user.telefono || "",
          correo: auth.user.email || "",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchProfileData();
  }, [auth.user]);

  useEffect(() => {
    if (!location.state?.openPassword) return;

    setIsPasswordModalOpen(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const roleName = getRoleName(auth.user?.role ?? auth.role);
  const fullName = useMemo(
    () =>
      [
        profileData.nombre,
        profileData.apellidoPaterno,
        profileData.apellidoMaterno,
      ]
        .filter(Boolean)
        .join(" ") || "Usuario Venso",
    [profileData],
  );

  const initials = useMemo(() => {
    const parts = [profileData.nombre, profileData.apellidoPaterno].filter(Boolean);
    return parts.map((part) => part.charAt(0).toUpperCase()).join("") || "U";
  }, [profileData.apellidoPaterno, profileData.nombre]);

  const handleProfileUpdate = async (updatedData) => {
    setIsUpdating(true);
    setError(null);

    try {
      const axiosInstance = createAxiosInstance();
      const requestData = {
        nombre: updatedData.nombre,
        apellidopaterno: updatedData.apellidopaterno,
        apellidomaterno: updatedData.apellidomaterno,
        telefono: updatedData.telefono,
      };

      const response = await axiosInstance.put(
        `/protected/account/${auth.user.dniuser}/profile`,
        requestData,
      );

      if (!response.data?.success) {
        throw new Error(response.data?.message || "Error al actualizar perfil");
      }

      setProfileData((current) => ({
        nombre: requestData.nombre,
        apellidoPaterno: requestData.apellidopaterno,
        apellidoMaterno: requestData.apellidomaterno,
        telefono: requestData.telefono,
        correo: current.correo,
      }));

      window.dispatchEvent(
        new CustomEvent("profile:updated", { detail: requestData }),
      );

      setSuccessMessage("Tus datos se actualizaron correctamente.");
      setTimeout(() => setSuccessMessage(null), 3200);
      setIsEditProfileModalOpen(false);
      return true;
    } catch (updateError) {
      setError(
        updateError.response?.data?.message ||
          updateError.message ||
          "Error al actualizar perfil",
      );
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePasswordUpdate = async (oldPass, newPass) => {
    try {
      const axiosInstance = createAxiosInstance();
      const response = await axiosInstance.put(
        `/protected/account/${auth.user.dniuser}/password`,
        {
          current_password: oldPass,
          new_password: newPass,
        },
      );

      if (!response.data?.success) {
        throw new Error(
          response.data?.message || "Error al actualizar la contraseña",
        );
      }

      setSuccessMessage("La contraseña se actualizó correctamente.");
      setTimeout(() => setSuccessMessage(null), 3200);
      setIsPasswordModalOpen(false);
      return true;
    } catch (updateError) {
      setError(
        updateError.response?.data?.message ||
          updateError.response?.data?.error ||
          updateError.message ||
          "Error al actualizar la contraseña",
      );
      return false;
    }
  };

  const openEditProfile = () => {
    setError(null);
    setIsEditProfileModalOpen(true);
  };

  const openPasswordModal = () => {
    setError(null);
    setIsPasswordModalOpen(true);
  };

  if (loading) {
    return (
      <div className="profile-workspace profile-workspace--loading" aria-label="Cargando perfil">
        <div className="profile-loading__heading" />
        <div className="profile-loading__hero" />
        <div className="profile-loading__grid">
          <span />
          <span />
        </div>
      </div>
    );
  }

  return (
    <main className="profile-workspace">
      <header className="profile-workspace__heading">
        <div className="profile-workspace__title">
          <span className="profile-workspace__title-icon"><FaUser /></span>
          <div>
            <span className="profile-workspace__eyebrow">Cuenta personal</span>
            <h1>Mi perfil</h1>
            <p>Administra tus datos personales y la seguridad de tu acceso.</p>
          </div>
        </div>

        <div className="profile-workspace__actions">
          <button type="button" className="profile-action profile-action--secondary" onClick={openEditProfile} disabled={isUpdating}>
            <FaEdit />
            <span>Editar datos</span>
          </button>
          <button type="button" className="profile-action profile-action--primary" onClick={openPasswordModal} disabled={isUpdating}>
            <FaKey />
            <span>Cambiar contraseña</span>
          </button>
        </div>
      </header>

      {successMessage && (
        <div className="profile-notice profile-notice--success" role="status">{successMessage}</div>
      )}
      {error && (
        <div className="profile-notice profile-notice--error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Cerrar mensaje">×</button>
        </div>
      )}

      <section className="profile-identity" aria-label="Identidad del usuario">
        <div className="profile-avatar" aria-hidden="true">
          <span>{initials}</span>
          <i />
        </div>
        <div className="profile-identity__main">
          <span className="profile-identity__state">Cuenta activa</span>
          <h2>{fullName}</h2>
          <p>{displayValue(profileData.correo)}</p>
        </div>
        <div className="profile-identity__badges">
          <span><FaShieldAlt /> {roleName}</span>
          <span><FaIdCard /> ID interno protegido</span>
        </div>
      </section>

      <div className="profile-content-grid">
        <section className="profile-panel">
          <header className="profile-panel__header">
            <div>
              <span>Datos de cuenta</span>
              <h3>Información personal</h3>
            </div>
            <button type="button" onClick={openEditProfile}><FaEdit /> Editar</button>
          </header>

          <div className="profile-fields">
            <ProfileField icon={<FaUser />} label="Nombre" value={profileData.nombre} />
            <ProfileField icon={<FaUser />} label="Apellido paterno" value={profileData.apellidoPaterno} />
            <ProfileField icon={<FaUser />} label="Apellido materno" value={profileData.apellidoMaterno} />
            <ProfileField icon={<FaIdCard />} label="Identidad" value="UUID interno" muted />
          </div>
        </section>

        <section className="profile-panel">
          <header className="profile-panel__header">
            <div>
              <span>Canales de contacto</span>
              <h3>Contacto y acceso</h3>
            </div>
          </header>

          <div className="profile-fields">
            <ProfileField icon={<FaEnvelope />} label="Correo electrónico" value={profileData.correo} muted />
            <ProfileField icon={<FaPhone />} label="Teléfono" value={profileData.telefono} />
            <ProfileField icon={<FaShieldAlt />} label="Rol del sistema" value={roleName} muted />
            <ProfileField icon={<FaIdCard />} label="Plataforma" value={auth.platform || auth.user?.platform} muted />
          </div>
        </section>
      </div>

      <section className="profile-security">
        <div className="profile-security__icon"><FaKey /></div>
        <div className="profile-security__copy">
          <span>Seguridad</span>
          <h3>Protege tu cuenta</h3>
          <p>Actualiza tu contraseña periódicamente y evita compartir tus credenciales.</p>
        </div>
        <div className="profile-security__status">
          <span>Acceso protegido</span>
          <small>La contraseña actual se valida antes de permitir el cambio.</small>
        </div>
        <button type="button" onClick={openPasswordModal}>Gestionar contraseña</button>
      </section>

      <PasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onUpdate={handlePasswordUpdate}
      />

      <EditProfileModal
        isOpen={isEditProfileModalOpen}
        onClose={() => setIsEditProfileModalOpen(false)}
        onUpdate={handleProfileUpdate}
        profileData={profileData}
        isLoading={isUpdating}
      />
    </main>
  );
}

export default Profile;
