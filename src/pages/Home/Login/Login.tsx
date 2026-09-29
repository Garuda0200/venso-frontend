import React, { useEffect, useState } from "react";
import axios from "axios";
import { FaEye, FaEyeSlash, FaLock, FaShieldAlt, FaUser } from "react-icons/fa";
import { useAuth } from "../../../context/AuthContext";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { getCurrentTimestamp } from "../../../components/currentTimestamp";
import { getApiUrl } from "../../../utils/apiUtils";
import styles from "./Login.module.scss";

const API_URL = getApiUrl();
const CURRENT_USER = "VENSO";
const logoVenso = "/brand/logo-principal-blanco.webp";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { login, verifySession } = useAuth();

  useEffect(() => {
    sessionStorage.removeItem("hasRedirected");
    sessionStorage.removeItem("justLoggedIn");
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("expired") === "true") {
      setError("Su sesión ha expirado. Inicie sesión nuevamente.");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await axios.post(
        `${API_URL}/auth/login`,
        { email: email.trim(), password },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Timestamp": getCurrentTimestamp(),
            "X-User": CURRENT_USER,
          },
          withCredentials: true,
        },
      );

      const { data } = response;
      if (!data.success) {
        throw new Error(data.message || "Error en las credenciales");
      }

      const userData = {
        dniuser: data.dniuser,
        email: data.user?.email || email,
        role: data.role,
        platform: data.platform,
        business_type: data.business_type,
        nombre: data.user?.nombre,
        apellidopaterno: data.user?.apellidopaterno,
        apellidomaterno: data.user?.apellidomaterno,
        telefono: data.user?.telefono,
        is_active: data.user?.is_active ?? true,
        created_at: data.user?.created_at,
        updated_at: data.user?.updated_at,
        last_login: data.user?.last_login,
        full_name: data.full_name,
        failed_attempts: data.failed_attempts,
        remaining_attempts: data.remaining_attempts,
        account_locked: data.account_locked,
        permissions: data.permissions || data.user?.permissions,
        loginTimestamp: getCurrentTimestamp(),
      };

      await login(data.role, userData, data.csrf_token);
      if (!userData.permissions) await verifySession();
      sessionStorage.setItem("justLoggedIn", "true");
    } catch (loginError) {
      console.error("Login error:", loginError);

      if (loginError.response) {
        const errorData = loginError.response.data;
        let errorMessage = errorData?.message || "Error en las credenciales";

        if (
          errorData?.failed_attempts !== undefined &&
          errorData?.remaining_attempts !== undefined
        ) {
          if (errorData.account_locked) {
            errorMessage = `${errorMessage}\nCuenta desactivada por exceso de intentos. Contacte al administrador.`;
          } else if (errorData.remaining_attempts <= 2) {
            errorMessage = `${errorMessage}\nLe quedan ${errorData.remaining_attempts} intentos.`;
          }
        }
        setError(errorMessage);
      } else if (loginError.request) {
        setError(
          loginError.code === "ERR_NETWORK"
            ? "No se puede conectar con el servidor."
            : "No se recibió respuesta del servidor.",
        );
      } else {
        setError(loginError.message || "No fue posible iniciar sesión.");
      }
      setPassword("");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <main className={styles.LoginContainer}>
      <section className={styles.rightContent} aria-label="Inicio de sesión">
        <div className={styles.loginBox}>
          <header className={styles.loginHeader}>
            <div className={styles.loginLogoContainer}>
              <img src={logoVenso} alt="Venso Tours" className={styles.loginLogo} />
            </div>
            <h1>Bienvenido</h1>
            <p className={styles.welcomeText}>
              Ingresa a la plataforma comercial y operativa de Venso Tours.
            </p>
          </header>

          {error && (
            <div className={styles.loginErrorMessage} role="alert" aria-live="polite">
              {error}
            </div>
          )}

          <form className={styles.formContainer} onSubmit={handleSubmit}>
            <div className={styles.inputWrapper}>
              <label htmlFor="email" className={styles.inputLabel}>
                Usuario o correo electrónico
              </label>
              <div className={styles.inputWithIcon}>
                <FaUser className={styles.iconLeft} />
                <input
                  id="email"
                  type="email"
                  className={styles.inputField}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nombre@vensotours.com"
                  required
                  autoComplete="username"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className={styles.inputWrapper}>
              <label htmlFor="password" className={styles.inputLabel}>
                Contraseña
              </label>
              <div className={styles.inputWithIcon}>
                <FaLock className={styles.iconLeft} />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className={styles.inputField}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Ingresa tu contraseña"
                  minLength={6}
                  required
                  autoComplete="current-password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>

            <div className={styles.formMeta}>
              <span>Solo para personal autorizado</span>
              <a href="/reset-password" className={styles.forgotPassword}>
                ¿Olvidaste tu contraseña?
              </a>
            </div>

            <button type="submit" className={styles.submitButton} disabled={isLoading}>
              {isLoading ? "Validando acceso…" : "Ingresar a Venso"}
            </button>
          </form>

          <footer className={styles.loginFooter}>
            <span className={styles.footerDot} />
            Sesión protegida y auditada
          </footer>
        </div>
      </section>

      <section className={styles.leftContent} aria-hidden="true">
        <div className={styles.imageOverlay}>
          <span className={styles.storyEyebrow}>VENSO TOURS</span>
          <h2>Enamórate<br />a cada paso</h2>
        </div>
      </section>
    </main>
  );
}

export default Login;
