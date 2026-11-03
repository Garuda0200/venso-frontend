import { useEffect, useState } from "react";

/** El PDF se incrusta desde un Blob local: la API conserva X-Frame-Options: DENY. */
export const useSourceVoucherPdf = (enabled: boolean, sourceUrl: string) => {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ source: "", url: "", error: "" });
  useEffect(() => {
    if (!enabled || !sourceUrl) return;
    const controller = new AbortController();
    let objectUrl = "";
    setState({ source: sourceUrl, url: "", error: "" });
    void (async () => {
      try {
        // El proxy de media es público; omitir cookies también permite su CORS
        // cuando frontend y API usan dominios distintos.
        const response = await fetch(sourceUrl, { signal: controller.signal, credentials: "omit" });
        if (!response.ok) throw new Error("No se pudo cargar el archivo del voucher.");
        const blob = await response.blob();
        if (!(await blob.slice(0, 1024).text()).includes("%PDF-"))
          throw new Error("El servidor no devolvió un PDF válido.");
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
        setState({ source: sourceUrl, url: objectUrl, error: "" });
      } catch (error: any) {
        if (!controller.signal.aborted)
          setState({ source: sourceUrl, url: "", error: error?.message || "No se pudo cargar el documento." });
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [enabled, sourceUrl, attempt]);
  return {
    url: enabled && state.source === sourceUrl ? state.url : "",
    error: enabled && state.source === sourceUrl ? state.error : "",
    retry: () => setAttempt(value => value + 1),
  };
};
