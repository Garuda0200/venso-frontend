import { useEffect, useMemo, useRef } from "react";
import { FaDownload, FaPrint } from "react-icons/fa";
import { clearCode128Svg, renderCode128Svg } from "../code128";
import { printLabels } from "../labels";
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
    if (canonicalCode) printLabels([{ code: canonicalCode, title }]);
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
