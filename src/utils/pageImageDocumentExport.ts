export interface PageImageCapture {
  dataUrl: string;
  format?: "jpeg" | "jpg" | "png";
  layout?: {
    pdfWidth?: number;
    pdfHeight?: number;
  };
}

const encoder = new TextEncoder();

const concatBytes = (parts: Uint8Array[]) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });
  return result;
};

const u16 = (value: number) => {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value >>> 0, true);
  return out;
};

const u32 = (value: number) => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value >>> 0, true);
  return out;
};

let crcTable: Uint32Array | null = null;
const getCrcTable = () => {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
};

const crc32 = (bytes: Uint8Array) => {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Minimal ZIP writer using STORE (no compression). DOCX media is already compressed
 * and the resulting file is deterministic, dependency-free and very fast to build.
 */
export const buildStoredZip = (entries: ZipEntry[]) => {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  entries.forEach(({ name, data }) => {
    const nameBytes = encoder.encode(name);
    const crc = crc32(data);
    const localHeader = concatBytes([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);
    localParts.push(localHeader, data);

    const centralHeader = concatBytes([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(localOffset),
      nameBytes,
    ]);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + data.length;
  });

  const central = concatBytes(centralParts);
  const end = concatBytes([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(localOffset),
    u16(0),
  ]);
  return concatBytes([...localParts, central, end]);
};

export const dataUrlToBytes = (dataUrl: string) => {
  const comma = String(dataUrl || "").indexOf(",");
  if (comma < 0) throw new Error("Captura de página inválida");
  const header = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (/;base64/i.test(header)) {
    if (typeof atob === "function") {
      const raw = atob(payload);
      const out = new Uint8Array(raw.length);
      for (let index = 0; index < raw.length; index += 1) out[index] = raw.charCodeAt(index);
      return out;
    }
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const clean = payload.replace(/=+$/, "").replace(/\s+/g, "");
    const out: number[] = [];
    let buffer = 0;
    let bits = 0;
    for (const char of clean) {
      const value = alphabet.indexOf(char);
      if (value < 0) continue;
      buffer = (buffer << 6) | value;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out.push((buffer >>> bits) & 0xff);
      }
    }
    return new Uint8Array(out);
  }
  return encoder.encode(decodeURIComponent(payload));
};

const escapeXml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const getCaptureMedia = (capture: PageImageCapture, index: number) => {
  const match = /^data:image\/(png|jpe?g);/i.exec(capture.dataUrl || "");
  const inferred = match?.[1]?.toLowerCase();
  const declared = String(capture.format || "").toLowerCase();
  const isPng = inferred === "png" || declared === "png";
  return {
    bytes: dataUrlToBytes(capture.dataUrl),
    extension: isPng ? "png" : "jpg",
    contentType: isPng ? "image/png" : "image/jpeg",
    name: `image${index + 1}.${isPng ? "png" : "jpg"}`,
  };
};

const pageSize = (capture: PageImageCapture) => {
  const widthPt = Math.max(72, Number(capture.layout?.pdfWidth || 595.28));
  const heightPt = Math.max(72, Number(capture.layout?.pdfHeight || 841.89));
  return {
    widthPt,
    heightPt,
    widthTwips: Math.round(widthPt * 20),
    heightTwips: Math.round(heightPt * 20),
    widthEmu: Math.round(widthPt * 12700),
    heightEmu: Math.round(heightPt * 12700),
  };
};

const sectionProperties = (size: ReturnType<typeof pageSize>, nextPage = false) =>
  `<w:sectPr>${nextPage ? '<w:type w:val="nextPage"/>' : ""}` +
  `<w:pgSz w:w="${size.widthTwips}" w:h="${size.heightTwips}"${size.widthPt > size.heightPt ? ' w:orient="landscape"' : ""}/>` +
  '<w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/>' +
  '<w:cols w:space="0"/></w:sectPr>';

const anchoredImageDrawing = (
  relationshipId: string,
  imageId: number,
  size: ReturnType<typeof pageSize>,
) => `
<w:r><w:drawing>
  <wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251658240" behindDoc="0" locked="1" layoutInCell="1" allowOverlap="1">
    <wp:simplePos x="0" y="0"/>
    <wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH>
    <wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>
    <wp:extent cx="${size.widthEmu}" cy="${size.heightEmu}"/>
    <wp:effectExtent l="0" t="0" r="0" b="0"/>
    <wp:wrapNone/>
    <wp:docPr id="${imageId}" name="Página ${imageId}"/>
    <wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>
    <a:graphic>
      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <pic:pic>
          <pic:nvPicPr><pic:cNvPr id="${imageId}" name="Página ${imageId}"/><pic:cNvPicPr/></pic:nvPicPr>
          <pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
          <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${size.widthEmu}" cy="${size.heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
        </pic:pic>
      </a:graphicData>
    </a:graphic>
  </wp:anchor>
</w:drawing></w:r>`;

export const buildDocxBytesFromPageCaptures = (
  captures: PageImageCapture[],
  options: { title?: string } = {},
) => {
  if (!captures.length) throw new Error("No hay páginas para generar Word");
  const media = captures.map(getCaptureMedia);
  const sizes = captures.map(pageSize);

  const body = captures
    .map((capture, index) => {
      const drawing = anchoredImageDrawing(`rId${index + 1}`, index + 1, sizes[index]);
      const paragraphSection = index < captures.length - 1
        ? `<w:pPr><w:spacing w:before="0" w:after="0" w:line="1" w:lineRule="exact"/>${sectionProperties(sizes[index], true)}</w:pPr>`
        : '<w:pPr><w:spacing w:before="0" w:after="0" w:line="1" w:lineRule="exact"/></w:pPr>';
      return `<w:p>${paragraphSection}${drawing}</w:p>`;
    })
    .join("");

  const documentXml = encoder.encode(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>` +
      body + sectionProperties(sizes[sizes.length - 1]) + `</w:body></w:document>`,
  );

  const relationshipsXml = encoder.encode(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      media
        .map(
          (item, index) =>
            `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${item.name}"/>`,
        )
        .join("") +
      `</Relationships>`,
  );

  const contentTypes = new Map<string, string>();
  media.forEach((item) => contentTypes.set(item.extension, item.contentType));
  const contentTypesXml = encoder.encode(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      [...contentTypes.entries()]
        .map(([extension, contentType]) => `<Default Extension="${extension}" ContentType="${contentType}"/>`)
        .join("") +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
      `</Types>`,
  );

  const rootRelationships = encoder.encode(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
      `</Relationships>`,
  );

  const now = new Date().toISOString();
  const coreXml = encoder.encode(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:title>${escapeXml(options.title || "Venso Tours")}</dc:title>` +
      `<dc:creator>Venso Tours</dc:creator>` +
      `<cp:lastModifiedBy>Venso Tours</cp:lastModifiedBy>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
      `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
      `</cp:coreProperties>`,
  );

  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: contentTypesXml },
    { name: "_rels/.rels", data: rootRelationships },
    { name: "docProps/core.xml", data: coreXml },
    { name: "word/document.xml", data: documentXml },
    { name: "word/_rels/document.xml.rels", data: relationshipsXml },
    ...media.map((item) => ({ name: `word/media/${item.name}`, data: item.bytes })),
  ];

  return buildStoredZip(entries);
};

export const buildDocxFromPageCaptures = (
  captures: PageImageCapture[],
  options: { title?: string } = {},
) =>
  new Blob([buildDocxBytesFromPageCaptures(captures, options)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

export const downloadBrowserBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};
