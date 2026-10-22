import React, {
  CSSProperties,
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { MdMoreHoriz, MdClose } from "react-icons/md";
import "./ExpandableActions.scss";

export type ExpandableActionTone =
  | "primary"
  | "neutral"
  | "info"
  | "warning"
  | "success"
  | "danger";

export interface ExpandableActionItem {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  tone?: ExpandableActionTone;
  disabled?: boolean;
  hidden?: boolean;
}

interface ExpandableActionsProps {
  actions: ExpandableActionItem[];
  label?: string;
  className?: string;
  align?: "start" | "end";
  compact?: boolean;
  /**
   * How many of the first actions render as icon buttons next to the "more"
   * toggle; the rest stay in the popover. Defaults to 0 (popover only).
   */
  maxInline?: number;
  /** Context shown before the actionable controls in the expanded panel. */
  panelHeader?: ReactNode;
}

interface PanelPosition {
  top: number;
  left: number;
  placement: "top" | "bottom";
}

const PANEL_MARGIN = 12;
const PANEL_GAP = 8;
const CLOSE_ANIMATION_MS = 170;

const ExpandableActions = ({
  actions,
  label = "Opciones",
  className = "",
  align = "end",
  compact = false,
  maxInline = 0,
  panelHeader,
}: ExpandableActionsProps) => {
  const [expanded, setExpanded] = useState(false);
  const [renderPanel, setRenderPanel] = useState(false);
  const [panelPosition, setPanelPosition] = useState<PanelPosition>({
    top: 0,
    left: 0,
    placement: "bottom",
  });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const panelId = useId();
  const visibleActions = actions.filter((action) => !action.hidden);
  const inlineActions = visibleActions.slice(0, Math.max(0, maxInline));
  const overflowActions = visibleActions.slice(inlineActions.length);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const closePanel = useCallback(() => {
    clearCloseTimer();
    setExpanded(false);
    closeTimerRef.current = window.setTimeout(() => {
      setRenderPanel(false);
      closeTimerRef.current = null;
    }, CLOSE_ANIMATION_MS);
  }, [clearCloseTimer]);

  const openPanel = useCallback(() => {
    clearCloseTimer();
    setRenderPanel(true);
    window.requestAnimationFrame(() => setExpanded(true));
  }, [clearCloseTimer]);

  const updatePanelPosition = useCallback(() => {
    const toggle = toggleRef.current;
    const panel = panelRef.current;
    if (!toggle || !panel) return;

    const toggleRect = toggle.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const panelWidth = Math.min(
      Math.max(panelRect.width, 220),
      window.innerWidth - PANEL_MARGIN * 2,
    );
    const panelHeight = panelRect.height;

    let left =
      align === "end" ? toggleRect.right - panelWidth : toggleRect.left;
    left = Math.max(
      PANEL_MARGIN,
      Math.min(left, window.innerWidth - panelWidth - PANEL_MARGIN),
    );

    const topBelow = toggleRect.bottom + PANEL_GAP;
    const topAbove = toggleRect.top - panelHeight - PANEL_GAP;
    const canOpenAbove = topAbove >= PANEL_MARGIN;
    const shouldOpenAbove =
      topBelow + panelHeight > window.innerHeight - PANEL_MARGIN &&
      canOpenAbove;

    setPanelPosition({
      top: shouldOpenAbove ? topAbove : topBelow,
      left,
      placement: shouldOpenAbove ? "top" : "bottom",
    });
  }, [align]);

  useEffect(() => {
    if (!renderPanel) return undefined;

    const frame = window.requestAnimationFrame(updatePanelPosition);
    const handleViewportChange = () => updatePanelPosition();

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [renderPanel, updatePanelPosition, overflowActions.length]);

  useEffect(() => {
    if (!expanded) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedRoot = rootRef.current?.contains(target);
      const clickedPanel = panelRef.current?.contains(target);
      if (!clickedRoot && !clickedPanel) closePanel();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePanel();
        toggleRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePanel, expanded]);

  useEffect(
    () => () => {
      clearCloseTimer();
    },
    [clearCloseTimer],
  );

  if (visibleActions.length === 0) return null;

  const hasOverflow = overflowActions.length > 0;

  const panelStyle = {
    top: `${panelPosition.top}px`,
    left: `${panelPosition.left}px`,
    "--expandable-actions-origin":
      panelPosition.placement === "top"
        ? align === "end"
          ? "right bottom"
          : "left bottom"
        : align === "end"
          ? "right top"
          : "left top",
  } as CSSProperties;

  const panel =
    hasOverflow && renderPanel && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            id={panelId}
            className={`expandable-actions__rail expandable-actions__rail--${panelPosition.placement} ${
              expanded ? "is-open" : "is-closing"
            }`}
            style={panelStyle}
            aria-hidden={!expanded}
            role="menu"
          >
            {panelHeader && (
              <div className="expandable-actions__panel-header" role="presentation">
                {panelHeader}
              </div>
            )}
            {overflowActions.map((action) => (
              <button
                key={action.key}
                type="button"
                role="menuitem"
                className={`expandable-actions__item expandable-actions__item--${
                  action.tone || "neutral"
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (action.disabled) return;
                  action.onClick();
                  closePanel();
                }}
                disabled={action.disabled}
                tabIndex={expanded ? 0 : -1}
                title={action.label}
              >
                <span className="expandable-actions__icon">{action.icon}</span>
                <span className="expandable-actions__label">
                  {action.label}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      className={`expandable-actions expandable-actions--${align} ${
        compact ? "expandable-actions--compact" : ""
      } ${inlineActions.length > 0 ? "expandable-actions--inline" : ""} ${
        expanded ? "is-expanded" : ""
      } ${className}`.trim()}
    >
      {inlineActions.map((action) => (
        <button
          key={action.key}
          type="button"
          className={`expandable-actions__item expandable-actions__item--${
            action.tone || "neutral"
          }`}
          onClick={(event) => {
            event.stopPropagation();
            if (!action.disabled) action.onClick();
          }}
          disabled={action.disabled}
          title={action.label}
          aria-label={action.label}
        >
          <span className="expandable-actions__icon">{action.icon}</span>
        </button>
      ))}
      {hasOverflow && (
        <button
          ref={toggleRef}
          type="button"
          className="expandable-actions__toggle"
          onClick={(event) => {
            event.stopPropagation();
            if (expanded) closePanel();
            else openPanel();
          }}
          aria-label={expanded ? `Cerrar ${label}` : `Abrir ${label}`}
          aria-expanded={expanded}
          aria-controls={panelId}
          title={expanded ? "Cerrar opciones" : label}
        >
          {expanded ? <MdClose /> : <MdMoreHoriz />}
        </button>
      )}
      {panel}
    </div>
  );
};

export default ExpandableActions;
