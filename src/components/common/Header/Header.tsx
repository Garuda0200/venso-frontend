import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import NotificationBell from "../../notifications/NotificationBell/NotificationBell";
import LogoutModal from "../../../context/LogoutModal";
import LogoutProgress from "../../LogoutProgress";
import { buildSidebarGroups } from "../Sidebar/sidebarAccess";
import { getUserProfile } from "../../../services/userService";
import "./Header.scss";
import {
  FaBars,
  FaChevronDown,
  FaFileInvoiceDollar,
  FaKey,
  FaRegHandPointRight,
  FaShieldAlt,
  FaShoppingCart,
  FaSignOutAlt,
  FaTimes,
  FaWarehouse,
  FaUserCircle,
} from "react-icons/fa";

const iconoAcceso = "/assets/acceso.webp";
const logoVenso = "/brand/wordmark-blanco.webp";
const SUPERADMIN_SYSTEM_STORAGE_KEY = "venso:selected-system";

const headerProfileCache = new Map();
const headerProfileRequests = new Map();

const hasReadableName = (identity = {}) =>
  Boolean(
    identity?.full_name ||
    identity?.nombre ||
    identity?.nombres ||
    identity?.name,
  );

const extractProfileIdentity = (response) => {
  const profile =
    response?.data?.profile ||
    response?.profile ||
    response?.data ||
    null;

  return profile && typeof profile === "object" ? profile : null;
};

const loadHeaderProfileOnce = (accountId) => {
  if (headerProfileCache.has(accountId)) {
    return Promise.resolve(headerProfileCache.get(accountId));
  }

  const pendingRequest = headerProfileRequests.get(accountId);
  if (pendingRequest) return pendingRequest;

  const request = getUserProfile(accountId)
    .then(extractProfileIdentity)
    .then((profile) => {
      if (profile) headerProfileCache.set(accountId, profile);
      return profile;
    })
    .finally(() => {
      headerProfileRequests.delete(accountId);
    });

  headerProfileRequests.set(accountId, request);
  return request;
};

const systemIconMap = {
  admin: <FaShieldAlt aria-hidden="true" />,
  ventas: <FaShoppingCart aria-hidden="true" />,
  reservas: <FaRegHandPointRight aria-hidden="true" />,
  contabilidad: <FaFileInvoiceDollar aria-hidden="true" />,
  almacen: <FaWarehouse aria-hidden="true" />,
};

const getFirstName = (currentUser = {}) => {
  const fullName =
    currentUser?.full_name ||
    currentUser?.nombre ||
    currentUser?.name ||
    (currentUser?.nombres
      ? currentUser.apellidos
        ? `${currentUser.nombres} ${currentUser.apellidos}`
        : currentUser.nombres
      : currentUser?.email
        ? String(currentUser.email).split("@")[0]
        : "Usuario");

  return String(fullName || "Usuario").trim().split(/\s+/)[0] || "Usuario";
};

const getModuleFromPath = (pathname = "") =>
  pathname.split("/").filter(Boolean)[0] || "";

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { auth, logout, loggingOut } = useAuth();
  const currentUser = useMemo(
    () => ({
      ...(auth?.user || {}),
      dniuser: auth?.dniuser ?? auth?.user?.dniuser ?? null,
    }),
    [auth?.dniuser, auth?.user],
  );
  const [profileIdentity, setProfileIdentity] = useState(() => currentUser);
  const userRole = Number(auth?.role ?? currentUser?.role ?? 0);
  const isSuperAdmin = userRole === 0;

  const [navOpen, setNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [logoutPosition, setLogoutPosition] = useState({ x: 0, y: 0 });
  const profileMenuRef = useRef(null);
  const profileButtonRef = useRef(null);
  const logoutBtnRef = useRef(null);

  const availableSystems = useMemo(() => buildSidebarGroups(auth), [auth]);
  const activeModule = getModuleFromPath(location.pathname);
  const activeSystem = useMemo(
    () =>
      availableSystems.find((group) => group.id === activeModule) ||
      availableSystems[0] ||
      null,
    [activeModule, availableSystems],
  );

  const activeMenuItem = useMemo(() => {
    if (!activeSystem) return null;

    return [...activeSystem.items]
      .sort((a, b) => b.path.length - a.path.length)
      .find(
        (item) =>
          location.pathname === item.path ||
          location.pathname.startsWith(`${item.path}/`),
      );
  }, [activeSystem, location.pathname]);

  const profileModule = ["admin", "ventas", "reservas", "contabilidad", "almacen"].includes(activeModule)
    ? activeModule
    : activeSystem?.id || "admin";
  const profilePath = `/${profileModule}/configuracion`;
  const isProfileRoute = location.pathname === profilePath;
  const firstName = getFirstName(profileIdentity);
  const profileFullName = [
    profileIdentity?.nombre || profileIdentity?.nombres,
    profileIdentity?.apellidopaterno || profileIdentity?.apellidoPaterno,
  ]
    .filter(Boolean)
    .join(" ") || firstName;
  const roleLabel = isSuperAdmin ? "Super Admin" : activeSystem?.label || "Venso";

  const handleSystemSelection = (system) => {
    setNavOpen(false);
    setProfileOpen(false);

    try {
      sessionStorage.setItem(SUPERADMIN_SYSTEM_STORAGE_KEY, system.id);
    } catch {
      // La navegación funciona aunque sessionStorage esté bloqueado.
    }

    navigate(system.dashboardPath || system.items[0]?.path || "/");
  };

  const handleItemSelection = (path) => {
    setNavOpen(false);
    navigate(path);
  };

  const handleProfileSelection = (openPassword = false) => {
    setNavOpen(false);
    setProfileOpen(false);
    navigate(profilePath, {
      state: openPassword ? { openPassword: true, source: "header" } : null,
    });
  };

  const handleLogoutClick = () => {
    const rect = logoutBtnRef.current?.getBoundingClientRect();
    if (rect) {
      setLogoutPosition({ x: rect.x + rect.width / 2, y: rect.bottom + 10 });
    }
    setShowLogoutModal(true);
  };

  const handleConfirmLogout = () => {
    setShowLogoutModal(false);
    logout();
  };

  useEffect(() => {
    setNavOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const accountId = String(currentUser?.dniuser || "").trim();
    const cachedProfile = accountId ? headerProfileCache.get(accountId) : null;

    setProfileIdentity({
      ...currentUser,
      ...(cachedProfile || {}),
    });
  }, [currentUser]);

  useEffect(() => {
    const accountId = String(currentUser?.dniuser || "").trim();
    if (!accountId || hasReadableName(currentUser)) return undefined;

    let cancelled = false;

    void loadHeaderProfileOnce(accountId)
      .then((profile) => {
        if (!cancelled && profile) {
          setProfileIdentity((current) => ({ ...current, ...profile }));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn(
            "No se pudo hidratar el nombre del usuario para el header:",
            error,
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    const handleProfileUpdated = (event) => {
      const detail = event.detail || {};
      setProfileIdentity((current) => {
        const nextIdentity = {
          ...current,
          ...detail,
          apellidoPaterno:
            detail.apellidopaterno ??
            detail.apellidoPaterno ??
            current?.apellidoPaterno,
        };
        const accountId = String(nextIdentity?.dniuser || "").trim();
        if (accountId) headerProfileCache.set(accountId, nextIdentity);
        return nextIdentity;
      });
    };

    window.addEventListener("profile:updated", handleProfileUpdated);
    return () => window.removeEventListener("profile:updated", handleProfileUpdated);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target) &&
        profileButtonRef.current &&
        !profileButtonRef.current.contains(event.target)
      ) {
        setProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className={`header venso-global-header ${navOpen ? "is-nav-open" : ""}`}>
      <div className="venso-navbar-main">
        <button
          type="button"
          className="venso-navbar-brand"
          onClick={() => navigate(activeSystem?.dashboardPath || "/")}
          aria-label="Ir al inicio del área"
        >
          <img src={logoVenso} alt="Venso Tours" />
        </button>

        <button
          type="button"
          className="venso-navbar-toggle"
          onClick={() => setNavOpen((current) => !current)}
          aria-expanded={navOpen}
          aria-label={navOpen ? "Cerrar navegación" : "Abrir navegación"}
        >
          {navOpen ? <FaTimes /> : <FaBars />}
        </button>

        <div className="venso-navbar-section-nav">
          <span className="venso-navbar-section-nav__area">
            {activeSystem?.shortLabel || activeSystem?.label || "Venso"}
          </span>
          <nav
            className="venso-navbar-links venso-navbar-links--primary"
            aria-label={`Navegación de ${activeSystem?.label || "Venso"}`}
          >
            {activeSystem?.items.map((item) => {
              const isActive =
                location.pathname === item.path ||
                location.pathname.startsWith(`${item.path}/`);
              return (
                <button
                  type="button"
                  key={item.path}
                  className={isActive ? "active" : ""}
                  onClick={() => handleItemSelection(item.path)}
                >
                  {item.name}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="venso-navbar-actions">
          <div className="header-notification-slot" aria-label="Notificaciones">
            <NotificationBell />
          </div>

          <div className="header-profile">
            <button
              type="button"
              ref={profileButtonRef}
              className={`user-icon-container ${profileOpen ? "is-open" : ""}`}
              onClick={() => setProfileOpen((current) => !current)}
              aria-expanded={profileOpen}
              aria-label={`Abrir perfil de ${firstName}`}
            >
              <span className="user-avatar-frame">
                <img src={iconoAcceso} alt="" className="user-icon" aria-hidden="true" />
                <span className="user-status-dot" />
              </span>
              <span className="user-info">
                <span className="user-name">{firstName}</span>
                <span className="user-role">{roleLabel}</span>
              </span>
              <FaChevronDown className="user-icon-indicator" aria-hidden="true" />
            </button>

            {profileOpen && (
              <div className="venso-profile-menu" ref={profileMenuRef}>
                <div className="venso-profile-menu__identity">
                  <span className="user-avatar-frame user-avatar-frame--large">
                    <img src={iconoAcceso} alt="" className="user-icon" aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{profileFullName}</strong>
                    <small>{roleLabel}</small>
                  </div>
                </div>
                <div className="venso-profile-menu__location">
                  <span>Área actual</span>
                  <strong>{activeSystem?.label || "Venso Tours"}</strong>
                  <small>{isProfileRoute ? "Mi perfil" : activeMenuItem?.name || "Panel de trabajo"}</small>
                </div>

                <div className="venso-profile-menu__actions">
                  <button
                    type="button"
                    className={isProfileRoute ? "active" : ""}
                    onClick={() => handleProfileSelection(false)}
                  >
                    <FaUserCircle />
                    <span>
                      <strong>Mi perfil</strong>
                      <small>Datos personales y contacto</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleProfileSelection(true)}
                  >
                    <FaKey />
                    <span>
                      <strong>Seguridad</strong>
                      <small>Cambiar contraseña</small>
                    </span>
                  </button>
                </div>

                {availableSystems.length > 1 && (
                  <div className="venso-profile-menu__areas">
                    {availableSystems.map((system) => (
                      <button
                        type="button"
                        key={system.id}
                        className={system.id === activeSystem?.id ? "active" : ""}
                        onClick={() => handleSystemSelection(system)}
                      >
                        {systemIconMap[system.id] || <FaShieldAlt />}
                        <span>{system.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            className="header-logout-btn"
            onClick={handleLogoutClick}
            ref={logoutBtnRef}
            title="Cerrar sesión"
          >
            <FaSignOutAlt />
            <span>Salir</span>
          </button>
        </div>
      </div>

      <LogoutModal
        show={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleConfirmLogout}
        position={logoutPosition}
        isCollapsed={false}
        placement="bottom"
      />
      {loggingOut && <LogoutProgress />}
    </header>
  );
}
