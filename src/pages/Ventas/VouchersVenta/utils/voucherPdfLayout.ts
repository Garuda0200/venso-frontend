/** One visible itinerary row per day. Editorial descriptions remain in datos_pdf. */
export const buildVoucherTitleBlocks = <T extends { numero?: number }>(
  persistedDays: Array<{ title?: string; content?: string }>,
  days: T[],
  formatDate: (index: number) => string,
) => persistedDays.map((persistedDay, idx) => ({
  day: days[idx] || { numero: idx + 1 },
  idx,
  title: String(persistedDay?.title ?? ""),
  dayDate: formatDate(idx),
  chunkIndex: 0,
  totalChunks: 1,
}));

/** Keep ordered blocks whole, fill the last introductory sheet, then use A4 sheets. */
export const packMeasuredVoucherFlow = <T>(
  items: T[],
  heights: number[],
  { introHeight = 0, pageHeight = 936, gap = 6 } = {},
) => {
  const measured = heights.map((height) => Number.isFinite(height) && height > 0 ? height : 1);
  let prefixSize = 0;
  let prefixHeight = 0;
  while (prefixSize < items.length) {
    const height = measured[prefixSize] || 1;
    const nextHeight = prefixHeight + (prefixSize ? gap : 0) + height;
    if (nextHeight > Math.max(0, introHeight)) break;
    prefixHeight = nextHeight;
    prefixSize += 1;
  }
  const pages: Array<{ items: T[] }> = [];
  let pageItems: T[] = [];
  let currentHeight = 0;
  items.slice(prefixSize).forEach((item, offset) => {
    const height = measured[prefixSize + offset] || 1;
    if (pageItems.length && currentHeight + gap + height > pageHeight) {
      pages.push({ items: pageItems });
      pageItems = [];
      currentHeight = 0;
    }
    currentHeight += (pageItems.length ? gap : 0) + height;
    pageItems.push(item);
  });
  if (pageItems.length) pages.push({ items: pageItems });
  return { introItems: items.slice(0, prefixSize), pages };
};
