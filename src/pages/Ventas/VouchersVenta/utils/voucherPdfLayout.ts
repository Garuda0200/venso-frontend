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

/** Keep one flight per physical row and retain its original edit/delete identity. */
export function buildVoucherFlightRows(cards: Array<{type:string;key:string;flights:any[]}>) {
  const result: Array<{rowIndex:number;key:string;cards:any[]}> = [];
  for (const card of cards) for (const [index,flight] of (card.flights || []).entries()) {
    if (!flight) continue;
    const rowIndex=result.length;
    result.push({rowIndex,key:`${card.key}-row-${index}`,cards:[{...card,key:`${card.key}-row-${index}`,flights:[flight],rowIndex}]});
  }
  return result;
}

/** Combine adjacent same-type rows without reordering flights or their references. */
export function groupVoucherFlightCards(cards: any[]) {
  const result: any[]=[];
  for(const card of cards){
    const flights=(card.flights || (card.flight ? [card.flight] : [])).filter(Boolean);
    if(!flights.length)continue;
    const previous=result[result.length-1];
    if(previous?.type===card.type)previous.flights.push(...flights);
    else result.push({...card,flights:[...flights]});
  }
  return result;
}

/** Keep ordered blocks whole, fill the last introductory sheet, then use A4 sheets. */
export const packMeasuredVoucherFlow = <T>(
  items: T[],
  heights: number[],
  { introHeight = 0, pageHeight = 936, gap = 6, pageStartExtraHeights = [] as number[] } = {},
) => {
  const measured = heights.map((height) => Number.isFinite(height) && height > 0 ? height : 1);
  let prefixSize = 0;
  let prefixHeight = 0;
  while (prefixSize < items.length) {
    const height = (measured[prefixSize] || 1) + (prefixSize === 0 ? pageStartExtraHeights[prefixSize] || 0 : 0);
    const nextHeight = prefixHeight + (prefixSize ? gap : 0) + height;
    if (nextHeight > Math.max(0, introHeight)) break;
    prefixHeight = nextHeight;
    prefixSize += 1;
  }
  const pages: Array<{ items: T[] }> = [];
  let pageItems: T[] = [];
  let currentHeight = 0;
  items.slice(prefixSize).forEach((item, offset) => {
    const index=prefixSize+offset;
    let height = measured[index] || 1;
    if (pageItems.length && currentHeight + gap + height > pageHeight) {
      pages.push({ items: pageItems });
      pageItems = [];
      currentHeight = 0;
    }
    if(!pageItems.length)height+=pageStartExtraHeights[index] || 0;
    currentHeight += (pageItems.length ? gap : 0) + height;
    pageItems.push(item);
  });
  if (pageItems.length) pages.push({ items: pageItems });
  return { introItems: items.slice(0, prefixSize), pages };
};
