// src/context/AuthContext.jsx
import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useNavigate } from "react-router-dom";
import { getApiUrl } from "../utils/apiUtils";
import axios from "axios";
import {
  clearCsrfToken,
  setCsrfToken,
} from "../utils/csrfToken";
import { queryClient } from "../config/queryClient";
import {
  BACKEND_STATUS_EVENT,
  reportBackendAvailable,
  reportBackendUnavailable,
} from "../utils/backendStatus";
import {
  getFirstAllowedPath,
  normalizePermissions,
} from "../utils/permissionRoutes";
import { wakeBackend } from "../utils/backendWake";

const AuthContext = createContext();

const API_URL = `${getApiUrl()}/auth`;
const INACTIVITY_TIMEOUT = 1440 * 60 * 1000; // 24h

const SESSION_KEYS = {
  userRole: "userRole",
  user: "user",
  dniuser: "dniuser",
  platform: "platform",
  business_type: "business_type",
  permissions: "permissions",
  lastActivity: "lastActivity",
  loginTimestamp: "loginTimestamp",
  userEmail: "userEmail",
};

const setSessionItem = (key, value) => {
  try {
    if (value === undefined || value === null) {
      sessionStorage.removeItem(key);
      return;
    }
    sessionStorage.setItem(
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    );
  } catch (e) {
    console.warn("sessionStorage set error:", e);
  }
};

const getSessionItem = (key, parseJson = false) => {
  try {
    const value = sessionStorage.getItem(key);
    if (!value) return null;
    return parseJson ? JSON.parse(value) : value;
  } catch (e) {
    console.warn("sessionStorage get error:", e);
    return null;
  }
};

const removeSessionItem = (key) => {
  try {
    sessionStorage.removeItem(key);
  } catch (e) {
    console.warn("sessionStorage remove error:", e);
  }
};

const clearSessionAuth = () => {
  Object.values(SESSION_KEYS).forEach((key) => removeSessionItem(key));
};

const isUnauthorizedResponse = (error) => error?.response?.status === 401;

// Instancia de axios para endpoints /auth con credenciales (cookie)
const axiosWithConfig = () =>
  axios.create({
    baseURL: API_URL,
    headers: { "Content-Type": "application/json" },
    withCredentials: true,
  });

export const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState({
    isAuthenticated: false,
    role: null,
    dniuser: null,
    platform: null,
    business_type: null,
    permissions: null,
    user: null,
    backendAvailable: true,
    backendStatusSource: null,
    backendStatusReason: null,
    loading: true,
  });
  const [loggingOut, setLoggingOut] = useState(false);
  const navigate = useNavigate();

  const isInitialized = useRef(false);
  const isVerifying = useRef(false);

  const redirectBasedOnRole = useCallback(
    (role, permissions = null) => {
      const targetRoute = getFirstAllowedPath({ role, permissions });
      const targetModule = targetRoute.split("/").slice(0, 2).join("/");
      const currentPath = window.location.pathname;
      const isAtRoot = currentPath === "/" || currentPath === "/login";
      const isInWrongSection =
        targetModule && !currentPath.startsWith(targetModule);

      if (isAtRoot || isInWrongSection) {
        navigate(targetRoute, { replace: true });
      }
    },
    [navigate],
  );

  const clearAuthState = useCallback(() => {
    clearSessionAuth();
    clearCsrfToken();

    setAuth((current) => ({
      isAuthenticated: false,
      role: null,
      dniuser: null,
      platform: null,
      business_type: null,
      permissions: null,
      user: null,
      backendAvailable: current.backendAvailable,
      backendStatusSource: current.backendStatusSource,
      backendStatusReason: current.backendStatusReason,
      loading: false,
    }));

    queryClient.clear();
    window.dispatchEvent(new CustomEvent("auth:logout"));
  }, []);

  const handleLogout = useCallback(
    async (redirectToLogin = true) => {
      try {
        setLoggingOut(true);
        const api = axiosWithConfig();
        try {
          await api.post("/logout", {});
          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (error) {
          console.warn("Error during logout process:", error.message);
        }
      } catch (error) {
        console.error("Error during logout:", error);
      } finally {
        clearAuthState();
        setLoggingOut(false);
        if (redirectToLogin) {
          navigate("/", { replace: true });
        }
      }
    },
    [navigate, clearAuthState],
  );

  const verifySession = useCallback(async () => {
    if (isVerifying.current) return false;
    isVerifying.current = true;

    try {
      const userData = getSessionItem(SESSION_KEYS.user, true);
      const storedDniuser = getSessionItem(SESSION_KEYS.dniuser);
      const lastActivity = getSessionItem(SESSION_KEYS.lastActivity);

      if (lastActivity) {
        const inactiveTime = new Date() - new Date(lastActivity);
        if (inactiveTime > INACTIVITY_TIMEOUT) {
          await handleLogout(true);
          isVerifying.current = false;
          return false;
        }
      }

      // Espera el wake deduplicado iniciado al cargar el SPA. Así la primera
      // verificación de sesión no compite con el arranque en frío de Fly.
      await wakeBackend("bootstrap");

      const api = axiosWithConfig();
      const response = await api.get("/verify").catch((error) => {
        if (error.code === "ERR_NETWORK") {
          reportBackendUnavailable("auth-verify", error.message);
          return { data: { success: true }, __backendUnavailable: true };
        }
        if (!isUnauthorizedResponse(error)) {
          console.warn("Session verification request failed:", error);
        }
        throw error;
      });

      if (response.data.success) {
        const backendAvailable = !response.__backendUnavailable;
        if (backendAvailable) {
          reportBackendAvailable("auth-verify");
        }

        const csrfToken = response.data.csrf_token;
        if (csrfToken) {
          setCsrfToken(csrfToken);
        }

        const platform =
          response.data.platform || response.data.user?.platform;
        const businessType =
          response.data.business_type || response.data.user?.business_type;
        const permissions = normalizePermissions(
          response.data.permissions || response.data.user?.permissions,
        );
        const role = Number(response.data.role);
        const verifiedDniuser = String(
          response.data.dniuser ||
            storedDniuser ||
            userData?.dniuser,
        );

        const updatedUser = {
          ...(userData || {}),
          dniuser: verifiedDniuser,
          role: role.toString(),
          platform,
          business_type: businessType,
          permissions,
        };

        setSessionItem(SESSION_KEYS.userRole, role.toString());
        setSessionItem(SESSION_KEYS.dniuser, verifiedDniuser);
        setSessionItem(SESSION_KEYS.platform, platform);
        setSessionItem(SESSION_KEYS.business_type, businessType);
        setSessionItem(SESSION_KEYS.permissions, permissions);
        setSessionItem(SESSION_KEYS.user, updatedUser);
        setSessionItem(SESSION_KEYS.lastActivity, new Date().toISOString());

        setAuth({
          isAuthenticated: true,
          role,
          dniuser: verifiedDniuser,
          platform,
          business_type: businessType,
          permissions,
          backendAvailable,
          backendStatusSource: backendAvailable ? null : "auth-verify",
          backendStatusReason: backendAvailable
            ? null
            : "El servidor no respondió durante la verificación de sesión.",
          user: updatedUser,
          loading: false,
        });

        isVerifying.current = false;
        return true;
      } else {
        throw new Error("Session verification failed");
      }
    } catch (error) {
      if (error.code === "ERR_NETWORK") {
        console.warn("Network error during verification, maintaining session");
        reportBackendUnavailable("auth-verify", error.message);
        isVerifying.current = false;
        return true;
      }
      if (isUnauthorizedResponse(error)) {
        clearAuthState();
        if (window.location.pathname !== "/") {
          navigate("/", { replace: true });
        }
        isVerifying.current = false;
        return false;
      }
      console.error("Session verification error:", error);
      await handleLogout(true);
      isVerifying.current = false;
      return false;
    }
  }, [clearAuthState, handleLogout, navigate]);

  useEffect(() => {
    const handleBackendStatus = (event) => {
      const detail = event.detail || {};
      const backendAvailable = detail.available !== false;
      const backendStatusSource = backendAvailable
        ? null
        : detail.source || null;
      const backendStatusReason = backendAvailable
        ? null
        : detail.reason || null;

      setAuth((current) => {
        if (
          current.backendAvailable === backendAvailable &&
          current.backendStatusSource === backendStatusSource &&
          current.backendStatusReason === backendStatusReason
        ) {
          return current;
        }

        return {
          ...current,
          backendAvailable,
          backendStatusSource,
          backendStatusReason,
        };
      });
    };

    window.addEventListener(BACKEND_STATUS_EVENT, handleBackendStatus);
    return () =>
      window.removeEventListener(BACKEND_STATUS_EVENT, handleBackendStatus);
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      console.warn("Evento de no autorizado recibido");
      handleLogout(true);
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () =>
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, [handleLogout]);

  useEffect(() => {
    const initializeAuth = async () => {
      if (isInitialized.current) return;
      isInitialized.current = true;
      await verifySession();
    };

    initializeAuth();
  }, [verifySession]);

  const login = useCallback(
    async (role, userData, csrfToken) => {
      try {
        if (!userData.dniuser) {
          throw new Error("Missing dniuser in user data");
        }

        queryClient.clear();
        setCsrfToken(csrfToken);

        const normalizedPermissions = normalizePermissions(
          userData.permissions,
        );
        const stringDniuser = String(userData.dniuser);

        setSessionItem(SESSION_KEYS.userRole, role.toString());
        setSessionItem(SESSION_KEYS.dniuser, stringDniuser);
        setSessionItem(SESSION_KEYS.platform, userData.platform);
        setSessionItem(SESSION_KEYS.business_type, userData.business_type);
        setSessionItem(SESSION_KEYS.permissions, normalizedPermissions);
        setSessionItem(SESSION_KEYS.lastActivity, new Date().toISOString());

        const userToStore = {
          ...userData,
          dniuser: stringDniuser,
          role: role.toString(),
          platform: userData.platform,
          business_type: userData.business_type,
          permissions: normalizedPermissions,
        };
        setSessionItem(SESSION_KEYS.user, userToStore);

        setAuth({
          isAuthenticated: true,
          role: Number(role),
          dniuser: stringDniuser,
          platform: userData.platform,
          business_type: userData.business_type,
          permissions: normalizedPermissions,
          backendAvailable: true,
          backendStatusSource: null,
          backendStatusReason: null,
          user: userToStore,
          loading: false,
        });

        window.dispatchEvent(
          new CustomEvent("auth:login", {
            detail: { role, dniuser: stringDniuser },
          }),
        );

        return true;
      } catch (error) {
        console.error("Error during login:", error);
        await handleLogout(true);
        throw error;
      }
    },
    [handleLogout],
  );

  const getCurrentUser = useCallback(() => {
    try {
      if (!auth.user) {
        const storedUser = getSessionItem(SESSION_KEYS.user, true);
        const dniuser = getSessionItem(SESSION_KEYS.dniuser);
        return { dniuser, ...storedUser };
      }
      return { dniuser: auth.dniuser, ...auth.user };
    } catch (error) {
      console.error("Error getting current user:", error);
      return {};
    }
  }, [auth.dniuser, auth.user]);

  useEffect(() => {
    if (auth.isAuthenticated && auth.role !== null && !auth.loading) {
      const justLoggedIn = sessionStorage.getItem("justLoggedIn");
      if (justLoggedIn === "true") {
        sessionStorage.removeItem("justLoggedIn");
        redirectBasedOnRole(auth.role, auth.permissions);
      }
    }
  }, [
    auth.isAuthenticated,
    auth.role,
    auth.permissions,
    auth.loading,
    redirectBasedOnRole,
  ]);

  const contextValue = {
    auth,
    user: auth.user,
    login,
    logout: handleLogout,
    verifyToken: verifySession,
    getCurrentUser,
    loggingOut,
    redirectBasedOnRole,
    updateTokenGlobally: () => {},
  };

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
