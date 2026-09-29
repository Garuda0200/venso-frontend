import { useEffect, useMemo, useRef } from "react";
import { FaDownload, FaPrint } from "react-icons/fa";
import { clearCode128Svg, renderCode128Svg } from "../code128";
import { normalizeCode } from "../utils";

export default function BarcodeLabel({
  code,
  title,
  compact = false,
  actions = false,
}) {
  const svgRef = useRef(null);
  const canonicalCode = useMemo(() => normalizeCode(code), [code]);

  useEffect(() => {
    if (!svgRef.current || !canonicalCode) return;
    try {
      renderCode128Svg(svgRef.current, canonicalCode, {
        height: compact ? 30 : 52,
        width: compact ? 1.25 : 1.7,
        margin: compact ? 2 : 6,
        lineColor: "#102a24",
      });
    } catch {
      clearCode128Svg(svgRef.current);
    }
  }, [canonicalCode, compact]);

  const downloadSvg = () => {
    if (!svgRef.current || !canonicalCode) return;
    const serialized = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${canonicalCode.toLowerCase()}_code_128.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const printLabel = () => {
    if (!svgRef.current || !canonicalCode) return;
    const popup = window.open("", "_blank", "width=620,height=420");
    if (!popup) return;
    popup.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${canonicalCode}</title>
          <style>
            @page { size: 70mm 35mm; margin: 3mm; }
            body { margin: 0; font-family: Arial, sans-serif; color: #102a24; }
            .label { width: 64mm; min-height: 27mm; display: grid; place-items: center; text-align: center; }
            h1 { margin: 0 0 2mm; font-size: 12px; }
            svg { max-width: 60mm; height: 13mm; }
            strong { display: block; margin-top: 1mm; font-size: 13px; letter-spacing: 1.5px; }
            small { font-size: 8px; text-transform: uppercase; letter-spacing: .8px; }
          </style>
        </head>
        <body>
          <div class="label">
            <div>
              ${title ? `<h1>${String(title).replace(/[<>&]/g, "")}</h1>` : ""}
              ${svgRef.current.outerHTML}
              <strong>${canonicalCode}</strong>
              <small>Code 128 · Patrimonio</small>
            </div>
          </div>
          <script>window.onload = () => { window.print(); window.close(); };</script>
        </body>
      </html>
    `);
    popup.document.close();
  };

  if (!canonicalCode) {
    return <span className="patrimonio-barcode-empty">Código pendiente</span>;
  }

  return (
    <div className={`patrimonio-barcode ${compact ? "is-compact" : ""}`}>
      <div className="patrimonio-barcode-canvas">
        <svg ref={svgRef} aria-label={`Código de barras ${canonicalCode}`} />
        <strong>{canonicalCode}</strong>
        {!compact && <small>CODE 128</small>}
      </div>
      {actions && (
        <div className="patrimonio-barcode-actions">
          <button type="button" onClick={downloadSvg}>
            <FaDownload /> SVG
          </button>
          <button type="button" onClick={printLabel}>
            <FaPrint /> Imprimir
          </button>
        </div>
      )}
    </div>
  );
}
