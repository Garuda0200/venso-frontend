import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  FaArrowLeft,
  FaCheck,
  FaEye,
  FaEyeSlash,
  FaKey,
  FaLock,
  FaShieldAlt,
  FaTimes,
} from "react-icons/fa";
import "./PasswordModal.scss";
import { createAxiosInstance } from "../../../utils/axiosInstance";
import { useAuth } from "../../../context/AuthContext";
import { getCurrentTimestamp } from "../../../components/currentTimestamp";

export function PasswordModal({ isOpen, onClose, onUpdate }) {
  const { auth } = useAuth();
  const [step, setStep] = useState(1);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const busy = isValidating || isUpdating;
  const userLabel = auth.user?.email || auth.user?.dniuser || "Cuenta Venso";

  const passwordChecks = useMemo(
    () => [
      { label: "8 caracteres", valid: newPassword.length >= 8 },
      { label: "1 número", valid: /\d/.test(newPassword) },
      { label: "1 mayúscula", valid: /[A-Z]/.test(newPassword) },
      {
        label: "Coinciden",
        valid: Boolean(newPassword) && newPassword === confirmPassword,
      },
    ],
    [confirmPassword, newPassword],
  );

  const strength = passwordChecks.slice(0, 3).filter((check) => check.valid).length;

  const resetForm = () => {
    setStep(1);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const closeModal = () => {
    if (busy) return;
    resetForm();
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busy) closeModal();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [busy, isOpen]);

  const handleFirstStep = async () => {
    if (!currentPassword) {
      setError("Ingresa tu contraseña actual para continuar.");
      return;
    }

    setIsValidating(true);
    setError("");

    try {
      const axiosInstance = createAxiosInstance();
      const url = `/protected/account/${auth.user.dniuser}/verify-password`;
      const response = await axiosInstance.post(url, {
        current_password: currentPassword,
      });

      if (response.data.success) {
        setStep(2);
        setError("");
      } else {
        setError("La contraseña actual no es correcta.");
      }
    } catch (verificationError) {
      console.error("Error en verificación:", {
        dni: auth.user.dniuser,
        error: verificationError.response?.data || verificationError.message,
        status: verificationError.response?.status,
        url: verificationError.config?.url,
        timestamp: getCurrentTimestamp(),
      });

      if (verificationError.response?.status === 401) {
        setError("La contraseña actual no es correcta.");
      } else if (verificationError.response?.status === 404) {
        setError("No se encontró el servicio de validación. Contacta al administrador.");
      } else {
        setError(
          verificationError.response?.data?.message ||
            "No fue posible validar la contraseña.",
        );
      }
    } finally {
      setIsValidating(false);
    }
  };

  const validatePassword = (password) => {
    if (password.length < 8) {
      return "La nueva contraseña debe tener al menos 8 caracteres.";
    }
    if (!/\d/.test(password)) {
      return "Incluye al menos un número en la nueva contraseña.";
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!newPassword || !confirmPassword) {
      setError("Completa ambos campos de la nueva contraseña.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setIsUpdating(true);
    setError("");

    try {
      if (onUpdate) {
        const success = await onUpdate(currentPassword, newPassword);
        if (success) {
          resetForm();
          onClose();
        }
      }
    } catch (updateError) {
      console.error("Error al actualizar contraseña:", {
        dni: auth.user.dniuser,
        error: updateError.message,
        timestamp: getCurrentTimestamp(),
      });
      setError(updateError.message || "No fue posible actualizar la contraseña.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleFirstStepSubmit = async (event) => {
    event.preventDefault();
    await handleFirstStep();
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    await handleSubmit();
  };

  if (!isOpen) return null;

  const renderPasswordField = ({
    id,
    label,
    value,
    onChange,
    visible,
    onToggle,
    autoComplete,
    disabled,
    placeholder,
  }) => (
    <label className="password-field" htmlFor={id}>
      <span>{label}</span>
      <div className="password-field__control">
        <FaKey className="password-field__leading" />
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          disabled={disabled}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required
          minLength={id === "current-password" ? undefined : 8}
          autoFocus={id === "current-password" || id === "new-password"}
        />
        <button
          type="button"
          className="password-field__toggle"
          onClick={onToggle}
          disabled={disabled}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          {visible ? <FaEyeSlash /> : <FaEye />}
        </button>
      </div>
    </label>
  );

  return createPortal(
    <div
      className="password-modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <section
        className="password-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-modal-title"
      >
        <aside className="password-modal__aside">
          <div className="password-modal__shield"><FaShieldAlt /></div>
          <span>Seguridad Venso</span>
          <h4>Tu acceso es personal</h4>
          <p>Validamos tu identidad antes de permitir cualquier cambio de contraseña.</p>
          <div className="password-modal__account">
            <small>Cuenta</small>
            <strong>{userLabel}</strong>
          </div>
        </aside>

        <div className="password-modal__content">
          <header className="password-modal__header">
            <div className="password-modal__icon"><FaLock /></div>
            <div>
              <span className="password-modal__eyebrow">Paso {step} de 2</span>
              <h3 id="password-modal-title">
                {step === 1 ? "Confirma tu identidad" : "Nueva contraseña"}
              </h3>
              <p>
                {step === 1
                  ? "Ingresa tu contraseña actual para continuar con el cambio."
                  : "Crea una clave segura que no utilices en otros servicios."}
              </p>
            </div>
            <button
              type="button"
              className="password-modal__close"
              onClick={closeModal}
              aria-label="Cerrar"
              disabled={busy}
            >
              <FaTimes />
            </button>
          </header>

          <div className="password-modal__steps" aria-label={`Paso ${step} de 2`}>
            <div className={step >= 1 ? "active" : ""}>
              <span>{step > 1 ? <FaCheck /> : "1"}</span>
              <small>Verificación</small>
            </div>
            <i className={step > 1 ? "active" : ""} />
            <div className={step === 2 ? "active" : ""}>
              <span>2</span>
              <small>Nueva clave</small>
            </div>
          </div>

          {error && <div className="modal-error" role="alert">{error}</div>}

          {step === 1 ? (
            <form onSubmit={handleFirstStepSubmit} className="password-form">
              <input type="text" autoComplete="username" value={userLabel} readOnly hidden />

              {renderPasswordField({
                id: "current-password",
                label: "Contraseña actual",
                value: currentPassword,
                onChange: (event) => setCurrentPassword(event.target.value),
                visible: showCurrentPassword,
                onToggle: () => setShowCurrentPassword((current) => !current),
                autoComplete: "current-password",
                disabled: isValidating,
                placeholder: "Ingresa tu contraseña actual",
              })}

              <div className="password-modal__hint">
                <FaLock /> La contraseña se verifica de forma segura y no se almacena en el navegador.
              </div>

              <div className="modal-actions">
                <button type="button" onClick={closeModal} className="cancel-button" disabled={isValidating}>
                  Cancelar
                </button>
                <button type="submit" className="confirm-button" disabled={isValidating}>
                  {isValidating ? "Verificando…" : "Continuar"}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="password-form">
              <input type="text" autoComplete="username" value={userLabel} readOnly hidden />

              {renderPasswordField({
                id: "new-password",
                label: "Nueva contraseña",
                value: newPassword,
                onChange: (event) => setNewPassword(event.target.value),
                visible: showNewPassword,
                onToggle: () => setShowNewPassword((current) => !current),
                autoComplete: "new-password",
                disabled: isUpdating,
                placeholder: "Mínimo 8 caracteres",
              })}

              {renderPasswordField({
                id: "confirm-password",
                label: "Confirmar contraseña",
                value: confirmPassword,
                onChange: (event) => setConfirmPassword(event.target.value),
                visible: showConfirmPassword,
                onToggle: () => setShowConfirmPassword((current) => !current),
                autoComplete: "new-password",
                disabled: isUpdating,
                placeholder: "Repite la nueva contraseña",
              })}

              <div className="password-strength" aria-label="Fortaleza de la contraseña">
                <div className="password-strength__track">
                  {[1, 2, 3].map((level) => (
                    <i key={level} className={strength >= level ? "active" : ""} />
                  ))}
                </div>
                <span>{strength <= 1 ? "Básica" : strength === 2 ? "Adecuada" : "Segura"}</span>
              </div>

              <div className="password-policy">
                {passwordChecks.map((check) => (
                  <span key={check.label} className={check.valid ? "valid" : ""}>
                    <FaCheck /> {check.label}
                  </span>
                ))}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setError("");
                  }}
                  className="back-button"
                  disabled={isUpdating}
                >
                  <FaArrowLeft /> Atrás
                </button>
                <button type="submit" className="confirm-button" disabled={isUpdating}>
                  {isUpdating ? "Actualizando…" : "Guardar contraseña"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}

export default PasswordModal;
