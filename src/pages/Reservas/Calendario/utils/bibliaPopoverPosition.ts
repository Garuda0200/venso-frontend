export type BibliaPopoverRect = {
  top: number;
  left: number;
  right: number;
  width: number;
  height: number;
};

type BibliaPopoverPositionInput = {
  anchor: BibliaPopoverRect;
  panelWidth: number;
  panelHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  margin?: number;
  gap?: number;
};

export const calculateBibliaPopoverPosition = ({
  anchor,
  panelWidth,
  panelHeight,
  viewportWidth,
  viewportHeight,
  margin = 12,
  gap = 8,
}: BibliaPopoverPositionInput) => {
  const safePanelWidth = Math.min(panelWidth, Math.max(0, viewportWidth - margin * 2));
  const safePanelHeight = Math.min(panelHeight, Math.max(0, viewportHeight - margin * 2));
  const availableLeft = anchor.left - margin - gap;
  const availableRight = viewportWidth - anchor.right - margin - gap;

  let left: number;
  if (availableLeft >= safePanelWidth) {
    left = anchor.left - gap - safePanelWidth;
  } else if (availableRight >= safePanelWidth) {
    left = anchor.right + gap;
  } else {
    left = Math.min(
      Math.max(anchor.left, margin),
      Math.max(margin, viewportWidth - safePanelWidth - margin),
    );
  }

  const centeredTop = anchor.top + anchor.height / 2 - safePanelHeight / 2;
  const top = Math.min(
    Math.max(centeredTop, margin),
    Math.max(margin, viewportHeight - safePanelHeight - margin),
  );

  return {
    top: Math.round(top),
    left: Math.round(left),
    maxWidth: Math.max(0, viewportWidth - margin * 2),
    maxHeight: Math.max(0, viewportHeight - margin * 2),
  };
};
