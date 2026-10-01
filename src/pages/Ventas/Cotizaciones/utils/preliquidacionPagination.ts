/** Keep rows intact on A4; an empty first chunk leaves space for the header/pax. */
export const paginatePreLiquidacionRows = (heights: number[], firstBudget: number, nextBudget: number): number[][] => {
  const pages: number[][] = [[]];
  let used = 0;
  let budget = Math.max(0, firstBudget);
  heights.forEach((height, index) => {
    const rowHeight = Math.max(1, height);
    if (used + rowHeight > budget && (pages.length === 1 || pages[pages.length - 1].length > 0)) {
      pages.push([]);
      budget = Math.max(1, nextBudget);
      used = 0;
    }
    pages[pages.length - 1].push(index);
    used += rowHeight;
  });
  return pages;
};
