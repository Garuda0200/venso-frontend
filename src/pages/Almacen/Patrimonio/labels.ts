import { renderCode128Svg } from "./code128";
import { normalizeCode } from "./utils";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

const renderLabelSvg = (code) => {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  try {
    renderCode128Svg(svg, code, { height: 52, width: 1.7, margin: 6, lineColor: "#102a24" });
    return svg.outerHTML;
  } catch {
    return "";
  }
};

/**
 * Imprime etiquetas Code 128 de 70×35 mm, una por página, en una sola ventana.
 * Recibe `{ code, title? }`; los códigos inválidos se omiten.
 */
export function printLabels(labels: { code: string; title?: string }[]) {
  const rendered = labels
    .map(({ code, title }) => {
      const canonicalCode = normalizeCode(code);
      const svg = canonicalCode ? renderLabelSvg(canonicalCode) : "";
      return svg ? { code: canonicalCode, title, svg } : null;
    })
    .filter(Boolean);
  if (!rendered.length) return false;

  const popup = window.open("", "_blank", "width=620,height=420");
  if (!popup) return false;

  const body = rendered
    .map(
      ({ code, title, svg }) => `
        <div class="label">
          <div>
            ${title ? `<h1>${escapeHtml(title)}</h1>` : ""}
            ${svg}
            <strong>${escapeHtml(code)}</strong>
            <small>Code 128 · Patrimonio</small>
          </div>
        </div>`,
    )
    .join("");

  popup.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${rendered.length === 1 ? escapeHtml(rendered[0].code) : `${rendered.length} etiquetas`}</title>
        <style>
          @page { size: 70mm 35mm; margin: 3mm; }
          body { margin: 0; font-family: Arial, sans-serif; color: #102a24; }
          .label { width: 64mm; height: 29mm; display: grid; place-items: center; text-align: center; overflow: hidden; break-after: page; page-break-after: always; }
          .label:last-child { break-after: auto; page-break-after: auto; }
          h1 { margin: 0 0 2mm; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 62mm; }
          svg { max-width: 60mm; height: 13mm; }
          strong { display: block; margin-top: 1mm; font-size: 13px; letter-spacing: 1.5px; }
          small { font-size: 8px; text-transform: uppercase; letter-spacing: .8px; }
        </style>
      </head>
      <body>
        ${body}
        <script>window.onload = () => { window.print(); window.close(); };</script>
      </body>
    </html>
  `);
  popup.document.close();
  return true;
}
