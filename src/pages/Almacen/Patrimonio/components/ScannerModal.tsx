import { useCallback, useEffect, useRef, useState } from "react";
import { FaCamera, FaTimes } from "react-icons/fa";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function ScannerModal({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const detectedRef = useRef(false);
  const streamRef = useRef(null);
  const [status, setStatus] = useState("");
  const [manualCode, setManualCode] = useState("");

  const stopScanner = useCallback(() => {
    try {
      controlsRef.current?.stop?.();
    } catch {
      // El control de cámara puede no existir si el usuario denegó permisos.
    }
    controlsRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopScanner();
      return undefined;
    }

    detectedRef.current = false;
    setManualCode("");
    setStatus("Solicitando permiso de cámara...");

    const isSecure =
      window.isSecureContext ||
      ["localhost", "127.0.0.1"].includes(window.location.hostname);

    if (!isSecure) {
      setStatus("La cámara requiere HTTPS o localhost.");
      return undefined;
    }

    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    const startScanner = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setStatus("El navegador no permite acceder a la cámara.");
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        setStatus("Permiso concedido. Iniciando cámara...");

        const controls = await reader.decodeFromStream(
          stream,
          videoRef.current,
          (result, error, controlsFromCallback) => {
            if (controlsFromCallback && !controlsRef.current) {
              controlsRef.current = controlsFromCallback;
            }
            if (result && !detectedRef.current) {
              detectedRef.current = true;
              const code = result.getText();
              setStatus(`Código detectado: ${code}`);
              stopScanner();
              onDetected(code);
            } else if (!error) {
              setStatus("Apunta la cámara a la etiqueta Code 128 del bien patrimonial.");
            }
          },
        );

        if (cancelled) {
          controls?.stop?.();
          return;
        }

        controlsRef.current = controls;
        setStatus("Cámara activa. Apunta a la etiqueta Code 128.");
      } catch (error) {
        if (cancelled) return;
        const message = String(error?.message || error || "");
        const name = String(error?.name || "").toLowerCase();
        const normalized = `${name} ${message}`.toLowerCase();
        if (
          normalized.includes("permission") ||
          normalized.includes("notallowed") ||
          normalized.includes("denied")
        ) {
          setStatus("Permiso de cámara denegado por el navegador.");
        } else if (
          normalized.includes("notfound") ||
          normalized.includes("not readable") ||
          normalized.includes("notreadable")
        ) {
          setStatus("No se encontró una cámara disponible.");
        } else {
          setStatus("No se pudo iniciar la cámara. Usa ingreso manual.");
        }
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [onDetected, open, stopScanner]);

  if (!open) return null;

  const submitManual = () => {
    const code = manualCode.trim();
    if (!code) return;
    stopScanner();
    onDetected(code);
  };

  return (
    <div className="patrimonio-modal-backdrop" onClick={onClose}>
      <div
        className="patrimonio-modal patrimonio-scanner-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <div className="patrimonio-modal-title">
            <span className="patrimonio-modal-icon"><FaCamera /></span>
            <div>
              <h3>Escanear código patrimonial</h3>
              <p>La imagen no se guarda ni se envía al servidor.</p>
            </div>
          </div>
          <button className="patrimonio-icon-btn" onClick={onClose} type="button">
            <FaTimes />
          </button>
        </header>

        <div className="patrimonio-modal-body">
          <div className="patrimonio-scanner-frame">
            <video ref={videoRef} muted playsInline />
            <div className="patrimonio-scan-line" />
          </div>
          <p className="patrimonio-scanner-status">{status}</p>

          <div className="patrimonio-manual-code">
            <label>Ingreso manual</label>
            <div>
              <input
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder="Código Code 128, por ejemplo CPU-01"
                onKeyDown={(e) => e.key === "Enter" && submitManual()}
              />
              <button type="button" onClick={submitManual}>
                Usar código
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
