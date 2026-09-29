import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useSidebar } from "../../../context/SidebarContext";
import { useAuth } from "../../../context/AuthContext";
import { buildSidebarGroups } from "./sidebarAccess";

import {
  FaAngleDoubleLeft,
  FaAngleDoubleRight,
  FaBox,
  FaBoxes,
  FaCalendarAlt,
  FaCheckCircle,
  FaChevronDown,
  FaCog,
  FaConciergeBell,
  FaFileAlt,
  FaFileInvoiceDollar,
  FaHistory,
  FaMoneyBillWave,
  FaMoneyCheckAlt,
  FaRegHandPointRight,
  FaShieldAlt,
  FaShoppingCart,
  FaTachometerAlt,
  FaTimes,
  FaUsers,
  FaWarehouse,
} from "react-icons/fa";

import "./Sidebar.scss";

const logoVenso = "/brand/logo-principal-blanco.webp";
const logoContraido = "/brand/isotipo-blanco.webp";

const reactIconMap = {
  adminIcon: <FaShieldAlt className="menu-icon" />,
  ventasIcon: <FaShoppingCart className="menu-icon" />,
  reservasIcon: <FaRegHandPointRight className="menu-icon" />,
  contabilidadIcon: <FaFileInvoiceDollar className="menu-icon" />,
  almacenIcon: <FaWarehouse className="menu-icon" />,
  dashboardIcon: <FaTachometerAlt className="menu-icon" />,
  usersIcon: <FaUsers className="menu-icon" />,
  logsIcon: <FaFileAlt className="menu-icon" />,
  paquetesIcon: <FaBox className="menu-icon" />,
  configIcon: <FaCog className="menu-icon" />,
  historialIcon: <FaHistory className="menu-icon" />,
  vouchersIcon: <FaFileInvoiceDollar className="menu-icon" />,
  serviciosIcon: <FaConciergeBell className="menu-icon" />,
  inventarioIcon: <FaBoxes className="menu-icon" />,
  egresosIcon: <FaMoneyCheckAlt className="menu-icon" />,
  estadoIcon: <FaCheckCircle className="menu-icon" />,
  ingresosIcon: <FaMoneyBillWave className="menu-icon" />,
  reportesIcon: <FaRegHandPointRight className="menu-icon" />,
  calendarioIcon: <FaCalendarAlt className="menu-icon" />,
};

const getModuleFromPath = (pathname = "") =>
  pathname.split("/").filter(Boolean)[0] || "";

const SUPERADMIN_SYSTEM_STORAGE_KEY = "venso:selected-system";

export function Sidebar() {
  const location = useLocation();
  const { collapsed, mobileOpen, isMobile, toggleSidebar, closeMobile } =
    useSidebar();
  const { auth } = useAuth();
  const compactMode = collapsed && !isMobile;
  const isSuperAdmin = Number(auth?.role) === 0;
  const activeModule = getModuleFromPath(location.pathname);

  const availableSidebarGroups = React.useMemo(
    () => buildSidebarGroups(auth),
    [auth],
  );

  const selectedSuperAdminModule = React.useMemo(() => {
    if (!isSuperAdmin) return "";

    const routeModule = availableSidebarGroups.some(
      (group) => group.id === activeModule,
    )
      ? activeModule
      : "";

    if (routeModule) {
      try {
        sessionStorage.setItem(SUPERADMIN_SYSTEM_STORAGE_KEY, routeModule);
      } catch {
        // La navegación sigue funcionando aunque el almacenamiento esté bloqueado.
      }
      return routeModule;
    }

    try {
      const storedModule = sessionStorage.getItem(
        SUPERADMIN_SYSTEM_STORAGE_KEY,
      );
      if (
        storedModule &&
        availableSidebarGroups.some((group) => group.id === storedModule)
      ) {
        return storedModule;
      }
    } catch {
      // Ignorar restricciones de sessionStorage.
    }

    return availableSidebarGroups[0]?.id || "";
  }, [activeModule, availableSidebarGroups, isSuperAdmin]);

  const sidebarGroups = React.useMemo(() => {
    if (!isSuperAdmin || !selectedSuperAdminModule) {
      return availableSidebarGroups;
    }

    return availableSidebarGroups.filter(
      (group) => group.id === selectedSuperAdminModule,
    );
  }, [availableSidebarGroups, isSuperAdmin, selectedSuperAdminModule]);

  const [openGroups, setOpenGroups] = React.useState({});

  React.useEffect(() => {
    if (!sidebarGroups.length) return;
    const firstGroup = sidebarGroups[0]?.id;
    const moduleToOpen = sidebarGroups.some(
      (group) => group.id === activeModule,
    )
      ? activeModule
      : firstGroup;

    setOpenGroups((prev) => ({
      ...prev,
      [moduleToOpen]: true,
    }));
  }, [activeModule, sidebarGroups]);

  const toggleGroup = (groupId) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const sidebarClass = [
    "admin-sidebar",
    compactMode ? "collapsed" : "",
    isMobile ? "mobile" : "",
    isMobile && mobileOpen ? "mobile-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const renderMenuItem = (item, groupId) => (
    <NavLink
      key={`${groupId}-${item.path}`}
      to={item.path}
      title={compactMode ? item.name : undefined}
      className={({ isActive }) =>
        isActive ? "menu-item active" : "menu-item"
      }
      onClick={isMobile ? closeMobile : undefined}
    >
      <div className="icon">{reactIconMap[item.icon] || null}</div>
      {!compactMode && <span className="item-text">{item.name}</span>}
    </NavLink>
  );

  return (
    <>
      {isMobile && mobileOpen && (
        <div className="sidebar-backdrop" onClick={closeMobile} />
      )}
      <div className={sidebarClass}>
        <div className="sidebar-top-bar">
          {isMobile ? (
            <button
              className="toggle-button"
              onClick={closeMobile}
              aria-label="Cerrar menu"
            >
              <FaTimes />
            </button>
          ) : (
            <button
              className="toggle-button"
              onClick={toggleSidebar}
              aria-label="Contraer menu"
            >
              {collapsed ? <FaAngleDoubleRight /> : <FaAngleDoubleLeft />}
            </button>
          )}
        </div>

        <div className="logo-container">
          <div className="logo-capsule">
            <img
              src={compactMode ? logoContraido : logoVenso}
              alt="Venso Tours"
              className="logo"
            />
          </div>
        </div>

        <nav className={compactMode ? "menu menu--compact" : "menu"}>
          {sidebarGroups.map((group) => {
            const isOpen = compactMode || openGroups[group.id];
            const isActiveGroup =
              activeModule === group.id ||
              group.items.some((item) =>
                location.pathname.startsWith(item.path),
              );

            if (compactMode) {
              return (
                <div key={group.id} className="menu-compact-group">
                  <div className="menu-compact-divider" title={group.label}>
                    {reactIconMap[group.icon] || null}
                  </div>
                  {group.items.map((item) => renderMenuItem(item, group.id))}
                </div>
              );
            }

            return (
              <div
                key={group.id}
                className={`menu-group ${isOpen ? "open" : ""} ${isActiveGroup ? "active-group" : ""}`}
              >
                <button
                  type="button"
                  className="menu-group-trigger"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={Boolean(isOpen)}
                >
                  <span className="group-icon">
                    {reactIconMap[group.icon] || null}
                  </span>
                  <span className="group-copy">
                    <span className="group-label">{group.label}</span>
                    <span className="group-meta">
                      {group.items.length} accesos
                    </span>
                  </span>
                  <FaChevronDown className="group-chevron" />
                </button>

                {isOpen && (
                  <div className="menu-group-items">
                    {group.items.map((item) => renderMenuItem(item, group.id))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    </>
  );
}
