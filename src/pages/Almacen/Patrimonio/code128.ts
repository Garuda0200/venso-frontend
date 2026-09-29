const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const START_CODE_B = 104;
const STOP_CODE = 106;
const CHECKSUM_MODULO = 103;

// Patrones oficiales de Code 128. Cada carácter representa un módulo:
// 1 = barra, 0 = espacio. El símbolo STOP utiliza 13 módulos.
const CODE128_PATTERNS = [
  "11011001100", "11001101100", "11001100110", "10010011000",
  "10010001100", "10001001100", "10011001000", "10011000100",
  "10001100100", "11001001000", "11001000100", "11000100100",
  "10110011100", "10011011100", "10011001110", "10111001100",
  "10011101100", "10011100110", "11001110010", "11001011100",
  "11001001110", "11011100100", "11001110100", "11101101110",
  "11101001100", "11100101100", "11100100110", "11101100100",
  "11100110100", "11100110010", "11011011000", "11011000110",
  "11000110110", "10100011000", "10001011000", "10001000110",
  "10110001000", "10001101000", "10001100010", "11010001000",
  "11000101000", "11000100010", "10110111000", "10110001110",
  "10001101110", "10111011000", "10111000110", "10001110110",
  "11101110110", "11010001110", "11000101110", "11011101000",
  "11011100010", "11011101110", "11101011000", "11101000110",
  "11100010110", "11101101000", "11101100010", "11100011010",
  "11101111010", "11001000010", "11110001010", "10100110000",
  "10100001100", "10010110000", "10010000110", "10000101100",
  "10000100110", "10110010000", "10110000100", "10011010000",
  "10011000010", "10000110100", "10000110010", "11000010010",
  "11001010000", "11110111010", "11000010100", "10001111010",
  "10100111100", "10010111100", "10010011110", "10111100100",
  "10011110100", "10011110010", "11110100100", "11110010100",
  "11110010010", "11011011110", "11011110110", "11110110110",
  "10101111000", "10100011110", "10001011110", "10111101000",
  "10111100010", "11110101000", "11110100010", "10111011110",
  "10111101110", "11101011110", "11110101110", "11010000100",
  "11010010000", "11010011100", "1100011101011",
];

function encodeCode128B(value) {
  const text = String(value ?? "");
  if (!text || !/^[\x20-\x7E]+$/.test(text)) {
    throw new Error("Code 128 B solo admite caracteres ASCII imprimibles.");
  }

  const dataCodes = Array.from(text, (character) => character.charCodeAt(0) - 32);
  const checksum = dataCodes.reduce(
    (total, code, index) => total + code * (index + 1),
    START_CODE_B,
  ) % CHECKSUM_MODULO;

  return [START_CODE_B, ...dataCodes, checksum, STOP_CODE]
    .map((code) => CODE128_PATTERNS[code])
    .join("");
}

export function clearCode128Svg(svgElement) {
  if (!svgElement) return;
  svgElement.replaceChildren();
  ["viewBox", "width", "height", "shape-rendering", "xmlns"].forEach((attribute) => {
    svgElement.removeAttribute(attribute);
  });
}

export function renderCode128Svg(
  svgElement,
  value,
  { height = 52, width = 1.7, margin = 6, lineColor = "#102a24" } = {},
) {
  if (!svgElement) return;

  const modules = encodeCode128B(value);
  const moduleWidth = Math.max(Number(width) || 1, 0.5);
  const barHeight = Math.max(Number(height) || 1, 1);
  const quietZone = Math.max(Number(margin) || 0, 0);
  const totalWidth = modules.length * moduleWidth + quietZone * 2;
  const totalHeight = barHeight + quietZone * 2;
  const fragment = document.createDocumentFragment();

  let barStart = -1;
  for (let index = 0; index <= modules.length; index += 1) {
    const isBar = modules[index] === "1";
    if (isBar && barStart < 0) {
      barStart = index;
      continue;
    }
    if (!isBar && barStart >= 0) {
      const rect = document.createElementNS(SVG_NAMESPACE, "rect");
      rect.setAttribute("x", String(quietZone + barStart * moduleWidth));
      rect.setAttribute("y", String(quietZone));
      rect.setAttribute("width", String((index - barStart) * moduleWidth));
      rect.setAttribute("height", String(barHeight));
      rect.setAttribute("fill", lineColor);
      fragment.appendChild(rect);
      barStart = -1;
    }
  }

  clearCode128Svg(svgElement);
  svgElement.setAttribute("xmlns", SVG_NAMESPACE);
  svgElement.setAttribute("viewBox", `0 0 ${totalWidth} ${totalHeight}`);
  svgElement.setAttribute("width", String(totalWidth));
  svgElement.setAttribute("height", String(totalHeight));
  svgElement.setAttribute("shape-rendering", "crispEdges");
  svgElement.appendChild(fragment);
}
