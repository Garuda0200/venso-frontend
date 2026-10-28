import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { calculateBibliaPopoverPosition } from "../utils/bibliaPopoverPosition";

const FloatingBibliaPopover = ({
  anchor,
  className,
  ariaLabel,
  onRequestClose,
  children,
}: {
  anchor: HTMLElement | null;
  className: string;
  ariaLabel: string;
  onRequestClose: () => void;
  children: React.ReactNode;
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 12, left: 12, maxWidth: 0, maxHeight: 0, ready: false });

  const updatePosition = useCallback(() => {
    const panel = panelRef.current;
    if (!anchor || !panel || !anchor.isConnected) return;
    const anchorRect = anchor.getBoundingClientRect();
    const next = calculateBibliaPopoverPosition({
      anchor: {
        top: anchorRect.top,
        left: anchorRect.left,
        right: anchorRect.right,
        width: anchorRect.width,
        height: anchorRect.height,
      },
      panelWidth: panel.offsetWidth,
      panelHeight: panel.offsetHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    setPosition((current) => (
      current.ready
      && current.top === next.top
      && current.left === next.left
      && current.maxWidth === next.maxWidth
      && current.maxHeight === next.maxHeight
        ? current
        : { ...next, ready: true }
    ));
  }, [anchor]);

  useLayoutEffect(() => {
    if (!anchor) return undefined;
    const frame = window.requestAnimationFrame(updatePosition);
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updatePosition);
    if (panelRef.current) resizeObserver?.observe(panelRef.current);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchor, updatePosition]);

  useEffect(() => {
    if (!anchor) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !anchor.contains(target)) onRequestClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onRequestClose();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchor, onRequestClose]);

  if (!anchor || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={panelRef}
      className={`${className} is-floating`}
      role="dialog"
      aria-label={ariaLabel}
      onClick={(event) => event.stopPropagation()}
      style={{
        top: position.top,
        left: position.left,
        visibility: position.ready ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
};

export default FloatingBibliaPopover;
