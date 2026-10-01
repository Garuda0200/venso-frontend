import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { wakeBackend } from "../../utils/backendWake";
import BackendStatusCard from "./BackendStatusCard";
import "./BackendStatusBanner.scss";

// The legacy auth context is not typed; restrict this consumer to its contract.
interface ConnectionAuthContext {
  auth: {
    loading: boolean;
    backendAvailable: boolean;
    isAuthenticated: boolean;
  };
}

const BackendStatusBanner = () => {
  const { auth } = useAuth() as ConnectionAuthContext;
  const isVisible = !auth.loading && !auth.backendAvailable;
  const [isRetrying, setIsRetrying] = useState(false);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const retryInFlight = useRef(false);
  const visibleRef = useRef(false);

  useEffect(() => {
    visibleRef.current = isVisible;
    if (!isVisible) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    retryButtonRef.current?.focus();

    return () => {
      visibleRef.current = false;
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isVisible]);

  const handleRetry = useCallback(async () => {
    if (retryInFlight.current) return;
    retryInFlight.current = true;
    setIsRetrying(true);
    try {
      // Networking and deduplication remain in the shared wake workflow.
      await wakeBackend("manual");
    } catch {
      // Keep recovery available if a wake cycle cannot complete.
    } finally {
      retryInFlight.current = false;
      if (visibleRef.current) setIsRetrying(false);
    }
  }, []);

  useEffect(() => {
    if (isVisible) setIsRetrying(retryInFlight.current);
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="backend-status-banner">
      <BackendStatusCard
        isAuthenticated={auth.isAuthenticated}
        isRetrying={isRetrying}
        retryButtonRef={retryButtonRef}
        onRetry={handleRetry}
        onKeyDown={(event) => {
          // The blocking dialog has a single interactive element.
          if (event.key === "Tab") {
            event.preventDefault();
            retryButtonRef.current?.focus();
          }
        }}
      />
    </div>
  );
};

export default BackendStatusBanner;
