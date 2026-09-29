export const VENSO_CANVA_PAGE_WIDTH = 800;
export const VENSO_CANVA_PAGE_HEIGHT = 1000;
export const VENSO_CANVA_PAGE_ASPECT = VENSO_CANVA_PAGE_WIDTH / VENSO_CANVA_PAGE_HEIGHT;
export const VENSO_CANVA_COVER_SLOTS = 3;

const getImageValue = (value: any): string | null => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value !== "object") return null;
  return (
    value.originalSrc ||
    value.original_src ||
    value.src ||
    value.tigrisUrl ||
    value.tigris_url ||
    value.previewSrc ||
    value.preview_src ||
    value.proxyUrl ||
    value.proxy_url ||
    value.url ||
    null
  );
};

const pushUnique = (target: string[], value: any) => {
  const src = getImageValue(value);
  if (!src || target.includes(src)) return;
  target.push(src);
};

/**
 * Resolve the three portrait cover panels used by the Venso Canva proposal.
 * New quotations persist `pdf_media.coverImages`; legacy quotations still use
 * `pdf_media.cover`, so we intentionally keep both formats compatible.
 */
export const resolveVensoCanvaCoverImages = (
  pdfMedia: any = {},
  infoPdf: any[] = [],
): Array<string | null> => {
  const storedCoverImages = Array.isArray(pdfMedia?.coverImages)
    ? pdfMedia.coverImages
    : Array.isArray(pdfMedia?.cover_images)
      ? pdfMedia.cover_images
      : null;

  // Once the editor persists the new schema, slot positions are intentional.
  // Do not auto-fill a removed panel with another image behind the user's back.
  if (storedCoverImages) {
    return Array.from({ length: VENSO_CANVA_COVER_SLOTS }, (_, index) =>
      getImageValue(storedCoverImages[index]),
    );
  }

  const candidates: string[] = [];
  pushUnique(candidates, pdfMedia?.cover);
  pushUnique(candidates, pdfMedia?.overviewImage || pdfMedia?.overview_image);

  const days = pdfMedia?.days && typeof pdfMedia.days === "object" ? pdfMedia.days : {};
  const dayCount = Math.max(
    Array.isArray(infoPdf) ? infoPdf.length : 0,
    Object.keys(days).length,
  );

  for (let index = 0; index < dayCount && candidates.length < VENSO_CANVA_COVER_SLOTS; index += 1) {
    const day = days[index] || days[String(index)] || {};
    const images = Array.isArray(day?.images) ? day.images : [];
    images.forEach((image: any) => {
      if (candidates.length < VENSO_CANVA_COVER_SLOTS) pushUnique(candidates, image);
    });
  }

  if (!candidates.length) return [];
  while (candidates.length < VENSO_CANVA_COVER_SLOTS) {
    candidates.push(candidates[candidates.length % Math.max(1, candidates.length)] || candidates[0]);
  }
  return candidates.slice(0, VENSO_CANVA_COVER_SLOTS);
};

export const setVensoCanvaCoverImage = (
  pdfMedia: any = {},
  slot: number,
  image: string | null,
) => {
  const stored = Array.isArray(pdfMedia?.coverImages)
    ? pdfMedia.coverImages
    : Array.isArray(pdfMedia?.cover_images)
      ? pdfMedia.cover_images
      : null;
  const current = stored || resolveVensoCanvaCoverImages(pdfMedia);
  const next = Array.from(
    { length: VENSO_CANVA_COVER_SLOTS },
    (_, index) => getImageValue(current[index]) || null,
  );
  next[Math.max(0, Math.min(VENSO_CANVA_COVER_SLOTS - 1, Number(slot) || 0))] = image || null;
  const compact = next.filter(Boolean);
  return {
    ...pdfMedia,
    coverImages: next,
    // Keep the legacy cover field authoritative for older preview/render plans.
    cover: compact[0] || null,
  };
};

export const buildVensoCanvaPageSequence = (dayCount = 0) => [
  "cover",
  ...Array.from({ length: Math.max(0, Number(dayCount) || 0) }, (_, index) => `day-${index}`),
  "pricing",
  "reservation-conditions",
  "purchase-terms",
];

export const getVensoCanvaPageCount = (dayCount = 0) =>
  buildVensoCanvaPageSequence(dayCount).length;
