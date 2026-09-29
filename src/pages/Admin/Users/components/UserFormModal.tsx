import { useState, useEffect } from "react";
import {
  MdClose,
  MdSave,
  MdVisibility,
  MdVisibilityOff,
} from "react-icons/md";
import { AREA_ROUTES, SPECIAL_ACTIONS } from "./permissionsConfig";
import { USER_ROLES } from "./userConfig";
import "./UserFormModal.scss";

const ROLE_OPTIONS = USER_ROLES;

const PLATFORM_OPTIONS = [
  { label: "Venso", value: "venso" },
  { label: "Mil", value: "mil" },
  { label: "Todos", value: "all" },
];

const BUSINESS_TYPE_OPTIONS = [
  { label: "B2C", value: "B2C" },
  { label: "B2B", value: "B2B" },
  { label: "Todos", value: "all" },
];

const ROLE_TO_MODULE = {
  0: "admin",
  1: "admin",
  2: "ventas",
  3: "reservas",
  4: "contabilidad",
  5: "almacen",
};

const MODULES = [
  { id: "admin", label: "Administración", route: "/admin/*" },
  { id: "ventas", label: "Ventas", route: "/ventas/*" },
  { id: "reservas", label: "Reservas", route: "/reservas/*" },
  { id: "contabilidad", label: "Contabilidad", route: "/contabilidad/*" },
  { id: "almacen", label: "Gestión Media", route: "/almacen/*" },
];

const UserFormModal = ({
  visible,
  user,
  editMode,
  onHide,
  onSave,
  actionLoading = false,
}) => {
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [showPw, setShowPw] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);

  const getVisibleAreaRoutes = (moduleId) =>
    (AREA_ROUTES[moduleId] || []).filter((route) => !route.hidden);
  const visibleSpecialActions = SPECIAL_ACTIONS.filter((action) => !action.hidden);

  useEffect(() => {
    if (visible && user) {
      setForm({
        ...user,
        role:
          typeof user.role === "number" ? user.role : parseInt(user.role, 10),
        password: "",
        confirmPassword: "",
        permissions: user.permissions || {
          allowed_modules: [],
          allowed_routes: [],
          extra_menus: [],
          actions: [],
        },
      });
      setErrors({});
      setShowPw(false);
      setShowPwConfirm(false);
    }
  }, [visible, user]);

  if (!visible) return null;

  const set = (name, val) => {
    setForm((prev) => ({ ...prev, [name]: val }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  // ── Role / Platform auto-link ──
  const handleRoleChange = (e) => {
    const role = Number(e.target.value);
    const updates = { role };
    if (role === 0) {
      updates.platform = "all";
      updates.business_type = "all";
    } else if (role === 2 && !form.platform) {
      updates.platform = "venso";
      updates.business_type = "B2C";
    }
    setForm((prev) => ({ ...prev, ...updates }));
  };

  const handlePlatformChange = (e) => {
    const platform = e.target.value;
    const business_type =
      platform === "venso"
        ? "B2C"
        : platform === "mil"
          ? "B2B"
          : form.business_type;
    setForm((prev) => ({ ...prev, platform, business_type }));
  };

  const handleAreaToggle = (moduleId) => {
    setForm((prev) => {
      const perms = prev.permissions || {};
      const currentModules = perms.allowed_modules || [];
      const currentRoutes = perms.allowed_routes || [];
      const areaRoutes = getVisibleAreaRoutes(moduleId).map((r) => r.path);

      let newModules, newRoutes;

      if (currentModules.includes(moduleId)) {
        // Desactivar área y todas sus rutas
        newModules = currentModules.filter((m) => m !== moduleId);
        newRoutes = currentRoutes.filter((r) => !areaRoutes.includes(r));
      } else {
        // Activar área y todas sus rutas
        newModules = [...currentModules, moduleId];
        const uniqueRoutes = new Set([...currentRoutes, ...areaRoutes]);
        newRoutes = Array.from(uniqueRoutes);
      }

      return {
        ...prev,
        permissions: {
          ...perms,
          allowed_modules: newModules,
          allowed_routes: newRoutes,
        },
      };
    });
  };

  const handleRouteToggle = (moduleId, routePath) => {
    setForm((prev) => {
      const perms = prev.permissions || {};
      const currentModules = perms.allowed_modules || [];
      const currentRoutes = perms.allowed_routes || [];

      let newModules = [...currentModules];
      let newRoutes;

      if (currentRoutes.includes(routePath)) {
        newRoutes = currentRoutes.filter((r) => r !== routePath);
        // Opcional: si no quedan rutas de este módulo, quitar el módulo
        const otherRoutesInModule = getVisibleAreaRoutes(moduleId)
          .filter((r) => r.path !== routePath)
          .map((r) => r.path);
        const hasMoreRoutes = newRoutes.some((r) =>
          otherRoutesInModule.includes(r),
        );
        if (!hasMoreRoutes) {
          newModules = newModules.filter((m) => m !== moduleId);
        }
      } else {
        newRoutes = [...currentRoutes, routePath];
        if (!newModules.includes(moduleId)) {
          newModules.push(moduleId);
        }
      }

      return {
        ...prev,
        permissions: {
          ...perms,
          allowed_modules: newModules,
          allowed_routes: newRoutes,
        },
      };
    });
  };


  const handleActionToggle = (actionKey) => {
    setForm((prev) => {
      const perms = prev.permissions || {};
      const currentActions = Array.isArray(perms.actions) ? perms.actions : [];
      const actions = currentActions.includes(actionKey)
        ? currentActions.filter((action) => action !== actionKey)
        : [...currentActions, actionKey];

      return {
        ...prev,
        permissions: {
          ...perms,
          actions,
        },
      };
    });
  };

  // ── Password strength ──
  const pw = form.password || "";
  const pwLen = pw.length >= 8;
  const pwNum = /[0-9]/.test(pw);
  const pwLow = /[a-z]/.test(pw);
  const pwExtra = /[A-Z]/.test(pw) || /[^A-Za-z0-9]/.test(pw);
  const pwScore =
    (pwLen ? 25 : 0) + (pwLow ? 25 : 0) + (pwNum ? 25 : 0) + (pwExtra ? 25 : 0);
  const pwLabel =
    pwScore < 50
      ? "Débil"
      : pwScore < 75
        ? "Moderada"
        : pwScore < 100
          ? "Fuerte"
          : "Muy fuerte";
  const pwColor =
    pwScore < 50
      ? "var(--color-danger)"
      : pwScore < 75
        ? "var(--color-warning)"
        : pwScore < 100
          ? "var(--color-info)"
          : "var(--color-primary)";

  // ── Validate ──
  const validate = () => {
    const e = {};
    if (!form.email?.trim()) e.email = "Requerido";
    else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i.test(form.email))
      e.email = "Email inválido";
    if (!editMode) {
      if (!form.password) e.password = "Requerido";
      else if (form.password.length < 8) e.password = "Mínimo 8 caracteres";
      if (form.password !== form.confirmPassword)
        e.confirmPassword = "No coinciden";
    }
    if (!form.nombre?.trim()) e.nombre = "Requerido";
    if (!form.apellidopaterno?.trim()) e.apellidopaterno = "Requerido";
    if (form.role === undefined || form.role === "") e.role = "Requerido";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) onSave(form);
  };

  const extraAccessCount = [
    ...(form.permissions?.allowed_modules || []),
    ...(form.permissions?.allowed_routes || []),
    ...(form.permissions?.actions || []),
  ].length;

  return (
    <div className="ufm__overlay" role="presentation">
      <div
        className="ufm__modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-form-title"
      >
        <div className="ufm__head">
          <div className="ufm__head-copy">
            <h2 id="user-form-title">
              {editMode ? "Editar usuario" : "Nuevo usuario"}
            </h2>
            <p>
              {editMode
                ? "Actualiza sus datos y accesos."
                : "Completa los datos necesarios para crear la cuenta."}
            </p>
          </div>
          <button
            type="button"
            className="ufm__close"
            onClick={onHide}
            disabled={actionLoading}
            aria-label="Cerrar"
          >
            <MdClose />
          </button>
        </div>

        <div className="ufm__body">
          {actionLoading && (
            <div className="ufm__loading" aria-live="polite">
              <div className="ufm__spinner" />
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <section className="ufm__section">
              <div className="ufm__section-head">
                <h3>Cuenta</h3>
                <p>Correo y credenciales de acceso.</p>
              </div>

              <div className="ufm__grid ufm__grid--2">
                <div className="ufm__field ufm__field--wide">
                  <label htmlFor="ufm-email">Email *</label>
                  <input
                    id="ufm-email"
                    type="email"
                    value={form.email || ""}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="correo@dominio.com"
                    className={errors.email ? "error" : ""}
                    autoComplete="email"
                  />
                  {errors.email && (
                    <span className="ufm__error">{errors.email}</span>
                  )}
                </div>

                {!editMode && (
                  <>
                    <div className="ufm__field">
                      <label htmlFor="ufm-password">Contraseña *</label>
                      <div className="ufm__input-wrap">
                        <input
                          id="ufm-password"
                          type={showPw ? "text" : "password"}
                          value={form.password || ""}
                          onChange={(e) => set("password", e.target.value)}
                          placeholder="Mínimo 8 caracteres"
                          className={errors.password ? "error" : ""}
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="ufm__eye"
                          onClick={() => setShowPw(!showPw)}
                          aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
                        >
                          {showPw ? <MdVisibilityOff /> : <MdVisibility />}
                        </button>
                      </div>
                      {pw && (
                        <>
                          <div className="ufm__pw-bar-track" aria-hidden="true">
                            <div
                              className="ufm__pw-bar-fill"
                              style={{ width: `${pwScore}%`, background: pwColor }}
                            />
                          </div>
                          <div className="ufm__pw-meta">
                            <span style={{ color: pwColor }}>{pwLabel}</span>
                            <span className="ufm__pw-reqs">
                              <span className={pwLen ? "met" : ""}>8+ caracteres</span>
                              <span className={pwNum ? "met" : ""}>1 número</span>
                            </span>
                          </div>
                        </>
                      )}
                      {errors.password && (
                        <span className="ufm__error">{errors.password}</span>
                      )}
                    </div>

                    <div className="ufm__field">
                      <label htmlFor="ufm-password-confirm">Confirmar contraseña *</label>
                      <div className="ufm__input-wrap">
                        <input
                          id="ufm-password-confirm"
                          type={showPwConfirm ? "text" : "password"}
                          value={form.confirmPassword || ""}
                          onChange={(e) => set("confirmPassword", e.target.value)}
                          placeholder="Repite la contraseña"
                          className={errors.confirmPassword ? "error" : ""}
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="ufm__eye"
                          onClick={() => setShowPwConfirm(!showPwConfirm)}
                          aria-label={
                            showPwConfirm
                              ? "Ocultar confirmación de contraseña"
                              : "Mostrar confirmación de contraseña"
                          }
                        >
                          {showPwConfirm ? <MdVisibilityOff /> : <MdVisibility />}
                        </button>
                      </div>
                      {errors.confirmPassword && (
                        <span className="ufm__error">{errors.confirmPassword}</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </section>

            <section className="ufm__section">
              <div className="ufm__section-head">
                <h3>Datos personales</h3>
                <p>Información con la que se identificará al usuario.</p>
              </div>

              <div className="ufm__grid ufm__grid--2">
                <div className="ufm__field">
                  <label htmlFor="ufm-name">Nombres *</label>
                  <input
                    id="ufm-name"
                    type="text"
                    value={form.nombre || ""}
                    onChange={(e) => set("nombre", e.target.value)}
                    placeholder="Juan Carlos"
                    className={errors.nombre ? "error" : ""}
                    autoComplete="given-name"
                  />
                  {errors.nombre && (
                    <span className="ufm__error">{errors.nombre}</span>
                  )}
                </div>

                <div className="ufm__field">
                  <label htmlFor="ufm-lastname">Apellido paterno *</label>
                  <input
                    id="ufm-lastname"
                    type="text"
                    value={form.apellidopaterno || ""}
                    onChange={(e) => set("apellidopaterno", e.target.value)}
                    placeholder="Pérez"
                    className={errors.apellidopaterno ? "error" : ""}
                    autoComplete="family-name"
                  />
                  {errors.apellidopaterno && (
                    <span className="ufm__error">{errors.apellidopaterno}</span>
                  )}
                </div>

                <div className="ufm__field">
                  <label htmlFor="ufm-second-lastname">Apellido materno</label>
                  <input
                    id="ufm-second-lastname"
                    type="text"
                    value={form.apellidomaterno || ""}
                    onChange={(e) => set("apellidomaterno", e.target.value)}
                    placeholder="Gómez"
                  />
                </div>

                <div className="ufm__field">
                  <label htmlFor="ufm-phone">Teléfono</label>
                  <input
                    id="ufm-phone"
                    type="text"
                    value={form.telefono || ""}
                    onChange={(e) => set("telefono", e.target.value)}
                    placeholder="+51 987 654 321"
                    autoComplete="tel"
                  />
                </div>
              </div>
            </section>

            <section className="ufm__section">
              <div className="ufm__section-head">
                <h3>Acceso</h3>
                <p>Define el rol y el entorno de trabajo.</p>
              </div>

              <div className="ufm__grid ufm__grid--3">
                <div className="ufm__field">
                  <label htmlFor="ufm-role">Rol *</label>
                  <select
                    id="ufm-role"
                    value={form.role ?? ""}
                    onChange={handleRoleChange}
                    className={errors.role ? "error" : ""}
                  >
                    <option value="" disabled>
                      Seleccionar
                    </option>
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  {errors.role && (
                    <span className="ufm__error">{errors.role}</span>
                  )}
                </div>

                <div className="ufm__field">
                  <label htmlFor="ufm-platform">Plataforma</label>
                  <select
                    id="ufm-platform"
                    value={form.platform || ""}
                    onChange={handlePlatformChange}
                  >
                    <option value="" disabled>
                      Seleccionar
                    </option>
                    {PLATFORM_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="ufm__field">
                  <label htmlFor="ufm-business">Negocio</label>
                  <select
                    id="ufm-business"
                    value={form.business_type || ""}
                    onChange={(e) => set("business_type", e.target.value)}
                  >
                    <option value="" disabled>
                      Seleccionar
                    </option>
                    {BUSINESS_TYPE_OPTIONS.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {editMode && (
                <div className="ufm__status-row">
                  <div>
                    <strong>Cuenta activa</strong>
                    <span>Controla si el usuario puede ingresar al sistema.</span>
                  </div>
                  <button
                    type="button"
                    className={`ufm__switch ${form.is_active ? "ufm__switch--on" : ""}`}
                    onClick={() => set("is_active", !form.is_active)}
                    role="switch"
                    aria-checked={Boolean(form.is_active)}
                  >
                    <span className="ufm__switch-track">
                      <span className="ufm__switch-thumb" />
                    </span>
                    <span>{form.is_active ? "Activa" : "Inactiva"}</span>
                  </button>
                </div>
              )}
            </section>

            <details className="ufm__advanced">
              <summary>
                <span className="ufm__advanced-copy">
                  <strong>Accesos adicionales</strong>
                  <small>Opcional · el rol ya define su acceso principal</small>
                </span>
                {extraAccessCount > 0 && (
                  <span className="ufm__advanced-count">{extraAccessCount}</span>
                )}
              </summary>

              <div className="ufm__permissions-container">
                {MODULES.filter((m) => m.id !== ROLE_TO_MODULE[form.role]).map(
                  (m) => {
                    const isAreaActive =
                      form.permissions?.allowed_modules?.includes(m.id);
                    const subRoutes = getVisibleAreaRoutes(m.id);

                    return (
                      <div key={m.id} className="ufm__area-group">
                        <div className="ufm__area-header">
                          <label className="ufm__checkbox-label">
                            <input
                              type="checkbox"
                              checked={isAreaActive || false}
                              onChange={() => handleAreaToggle(m.id)}
                            />
                            <span className="ufm__checkbox-custom" />
                            <span className="ufm__area-title">{m.label}</span>
                          </label>
                        </div>

                        {subRoutes.length > 0 && (
                          <div className="ufm__subroutes-grid">
                            {subRoutes.map((route) => (
                              <div key={route.path} className="ufm__route-item">
                                <label className="ufm__checkbox-label ufm__checkbox-label--small">
                                  <input
                                    type="checkbox"
                                    checked={
                                      form.permissions?.allowed_routes?.includes(
                                        route.path,
                                      ) || false
                                    }
                                    onChange={() =>
                                      handleRouteToggle(m.id, route.path)
                                    }
                                  />
                                  <span className="ufm__checkbox-custom" />
                                  <span className="ufm__route-text">
                                    {route.label}
                                  </span>
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  },
                )}

                {visibleSpecialActions.length > 0 && (
                  <div className="ufm__area-group ufm__area-group--actions">
                    <div className="ufm__area-header">
                      <span className="ufm__area-title">Permisos operativos</span>
                    </div>
                    <div className="ufm__subroutes-grid">
                      {visibleSpecialActions.map((action) => (
                        <div key={action.key} className="ufm__route-item">
                          <label className="ufm__checkbox-label ufm__checkbox-label--small">
                            <input
                              type="checkbox"
                              checked={
                                form.permissions?.actions?.includes(action.key) ||
                                false
                              }
                              onChange={() => handleActionToggle(action.key)}
                            />
                            <span className="ufm__checkbox-custom" />
                            <span className="ufm__route-text">{action.label}</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </details>

            <div className="ufm__actions">
              <button
                type="button"
                className="ufm__btn--ghost"
                onClick={onHide}
                disabled={actionLoading}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="ufm__btn--primary"
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <>
                    <div className="ufm__spinner--sm" /> Guardando...
                  </>
                ) : (
                  <>
                    <MdSave /> {editMode ? "Guardar cambios" : "Crear usuario"}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UserFormModal;
