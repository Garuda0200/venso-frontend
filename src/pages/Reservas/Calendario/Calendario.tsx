import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  MdAdd,
  MdArrowDownward,
  MdArrowUpward,
  MdCalendarMonth,
  MdCheck,
  MdChevronLeft,
  MdChevronRight,
  MdClose,
  MdDeleteOutline,
  MdDownload,
  MdExpandLess,
  MdExpandMore,
  MdFilterAlt,
  MdDragIndicator,
  MdLink,
  MdPalette,
  MdRefresh,
  MdSearch,
  MdToday,
  MdViewDay,
  MdVisibility,
} from "react-icons/md";
import LoadingSpinner from "../../../components/UI/LoadingSpinner/LoadingSpinner";
import SmartComboBox from "../../../components/common/SmartComboBox/SmartComboBox";
import { useAuth } from "../../../context/AuthContext";
import SourceVoucherPreviewModal from "../../Ventas/Cotizaciones/components/SourceVoucherPreviewModal";
import VentasSummaryPDFModal from "../../Ventas/VouchersVenta/components/VentasSummaryPDFModal/VentasSummaryPDFModal";
import { bibliaActivityService } from "./services/bibliaActivityService";
import { bibliaCatalogService, isBibliaCatalogField } from "./services/bibliaCatalogService";
import {
  BIBLIA_EMPTY_VALUE,
  BIBLIA_EXCEL_PALETTE,
  BibliaActivity,
  BibliaParticipantPlan,
  bibliaRecordsEqual,
  buildBibliaActivitiesFromSnapshots,
  buildStandaloneBibliaRecord,
  filterBibliaActivities,
  getBibliaEndorseOptions,
  getBibliaExcelCellColor,
  getBibliaExcelRichText,
  getBibliaQuotationLinkLabel,
  getBibliaQuotationVoucherCode,
  getBibliaReservationOptions,
  getBibliaTrainProviderOptions,
  getBibliaTransportOptions,
  hasBibliaActiveFilters,
  isQuotationBibliaMaterialized,
  matchesBibliaQuotationLinkQuery,
  materializeBibliaOverride,
  materializeQuotationBibliaRecords,
  normalizeBibliaColor,
  toBibliaDateKey,
  upsertBibliaOverride,
} from "./utils/bibliaActivityMapper";
import { BIBLIA_SHEET_COLUMNS, downloadBibliaDayJpeg } from "./utils/bibliaDayJpegExport";
import { downloadBibliaDayExcel, downloadBibliaMonthExcel } from "./utils/bibliaDayExcelExport";
import { compactBibliaTrainText, getHistoricalBibliaTrainOptions } from "./utils/bibliaTrainCatalog";
import { calculateBibliaPopoverPosition } from "./utils/bibliaPopoverPosition";
import {
  buildBibliaQuotationCreationDraft,
  canCreateQuotationFromBiblia,
} from "./utils/bibliaQuotationCreation";
import "./Calendario.scss";

type ViewMode = "month" | "day";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const normalize = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
const asArray = <T = any,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const addDays = (date: Date, amount: number) => {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + amount);
  return result;
};
const startOfCalendarGrid = (date: Date) => {
  const first = startOfMonth(date);
  const mondayIndex = (first.getDay() + 6) % 7;
  return addDays(first, -mondayIndex);
};
const sameDay = (a: Date, b: Date) => toBibliaDateKey(a) === toBibliaDateKey(b);
const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
const BIBLIA_CATALOG_FIELDS = [
  "hotelCusco", "tickets", "hotelValle", "hotelMapi", "restaurant", "endorse",
  "transport", "guide", "trainOutbound", "trainReturn", "agency",
] as const;
const BIBLIA_ITINERARY_SERVICE_FIELDS = new Set<keyof BibliaActivity>([
  "transport", "trainOutbound", "trainReturn", "restaurant", "hotelCusco", "hotelValle",
  "hotelMapi", "tickets", "endorse", "guide", "excursion", "time",
]);
const formatLongDate = (date: Date) =>
  new Intl.DateTimeFormat("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
const formatMonth = (date: Date) =>
  new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric" }).format(date);
const isEmptyBibliaValue = (value: unknown) => !String(value ?? "").trim() || String(value) === BIBLIA_EMPTY_VALUE;

const getReadableTextColor = (color: string) => {
  const hex = normalizeBibliaColor(color).slice(1);
  const [red, green, blue] = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance < 0.52 ? "#FFFFFF" : "#1F2937";
};

const activityStyle = (activity: BibliaActivity) => ({
  "--activity-color": normalizeBibliaColor(activity.color),
  "--activity-text": getReadableTextColor(activity.color),
} as React.CSSProperties);

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

const ActivityChip = ({ activity, compact = false, onClick }: { activity: BibliaActivity; compact?: boolean; onClick: () => void }) => (
  <button
    type="button"
    className={`biblia-event-chip${compact ? " is-compact" : ""}`}
    style={activityStyle(activity)}
    onClick={(event) => { event.stopPropagation(); onClick(); }}
    title={`${activity.time} · ${activity.excursion} · ${activity.reservationName}`}
  >
    <span className="biblia-event-chip__time">{activity.time}</span>
    <span className="biblia-event-chip__text"><strong>{activity.excursion}</strong>{!compact && <small>{activity.reservationName}</small>}</span>
  </button>
);

const defaultParticipantPlan = (pax: number): BibliaParticipantPlan => ({
  version: 1,
  adults: { count: Math.max(0, pax), nationalities: pax > 0 ? [{ country: "Extranjero", count: pax }] : [] },
  children: { count: 0, nationalities: [] },
});

const ParticipantPlanEditor = ({
  activity,
  onSave,
}: {
  activity: BibliaActivity;
  onSave: (plan: BibliaParticipantPlan) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<BibliaParticipantPlan>(() => activity.participantPlan || defaultParticipantPlan(activity.pax));
  const [error, setError] = useState("");
  useEffect(() => setPlan(activity.participantPlan || defaultParticipantPlan(activity.pax)), [activity.id, activity.pax, activity.participantPlan]);
  const updateGroup = (group: "adults" | "children", update: Partial<BibliaParticipantPlan["adults"]>) =>
    setPlan((current) => ({ ...current, [group]: { ...current[group], ...update } }));
  const save = () => {
    const groups = [plan.adults, plan.children];
    const valid = groups.every((group) =>
      Number.isInteger(Number(group.count)) && Number(group.count) >= 0 &&
      group.nationalities.every((row) => row.country.trim() && Number.isInteger(Number(row.count)) && Number(row.count) > 0) &&
      group.nationalities.reduce((total, row) => total + Number(row.count), 0) === Number(group.count),
    );
    if (!valid || Number(plan.adults.count) + Number(plan.children.count) !== Number(activity.pax)) {
      setError("Adultos y niños, con sus nacionalidades, deben sumar el PAX de este día.");
      return;
    }
    onSave({
      version: 1,
      adults: { ...plan.adults, count: Number(plan.adults.count), nationalities: plan.adults.nationalities.map((row) => ({ country: row.country.trim(), count: Number(row.count) })) },
      children: { ...plan.children, count: Number(plan.children.count), nationalities: plan.children.nationalities.map((row) => ({ country: row.country.trim(), count: Number(row.count) })) },
    });
    setOpen(false);
  };
  return <>
    <button type="button" className="biblia-edit-value" onClick={(event) => { event.stopPropagation(); setError(""); setOpen(true); }}>Editar distribución</button>
    {open && createPortal(<div className="biblia-participants-modal" role="dialog" aria-modal="true" aria-label="Participantes del día" onClick={() => setOpen(false)}>
      <div className="biblia-participants-modal__panel" onClick={(event) => event.stopPropagation()}>
        <header><strong>Participantes del día</strong><button type="button" onClick={() => setOpen(false)} aria-label="Cerrar"><MdClose /></button></header>
        <p>Adultos y niños deben sumar {activity.pax} pax. Esta distribución no se muestra en las descargas.</p>
        {(["adults", "children"] as const).map((group) => <section key={group}>
          <label>{group === "adults" ? "Adultos" : "Niños"}<input type="number" min="0" value={plan[group].count} onChange={(event) => updateGroup(group, { count: Number(event.target.value || 0) })} /></label>
          {plan[group].nationalities.map((row, index) => <div className="biblia-participants-modal__row" key={`${group}-${index}`}>
            <input value={row.country} placeholder="País" onChange={(event) => updateGroup(group, { nationalities: plan[group].nationalities.map((item, itemIndex) => itemIndex === index ? { ...item, country: event.target.value } : item) })} />
            <input type="number" min="1" value={row.count} onChange={(event) => updateGroup(group, { nationalities: plan[group].nationalities.map((item, itemIndex) => itemIndex === index ? { ...item, count: Number(event.target.value || 0) } : item) })} />
            <button type="button" onClick={() => updateGroup(group, { nationalities: plan[group].nationalities.filter((_, itemIndex) => itemIndex !== index) })}>Quitar</button>
          </div>)}
          <button type="button" onClick={() => updateGroup(group, { nationalities: [...plan[group].nationalities, { country: "", count: 1 }] })}>+ País</button>
        </section>)}
        {error && <p className="biblia-participants-modal__error">{error}</p>}
        <footer><button type="button" onClick={() => setOpen(false)}>Cancelar</button><button type="button" onClick={save}>Guardar participantes</button></footer>
      </div>
    </div>, document.body)}
  </>;
};

const EditableValue = ({
  activity,
  field,
  onCommit,
  extraOptions = [],
}: {
  activity: BibliaActivity;
  field: keyof BibliaActivity;
  onCommit: (activity: BibliaActivity, field: keyof BibliaActivity, value: string | number) => void;
  extraOptions?: string[];
}) => {
  const rawValue = activity[field];
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(rawValue ?? ""));
  const [options, setOptions] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  useEffect(() => setValue(String(rawValue ?? "")), [rawValue]);

  useEffect(() => {
    let active = true;
    if (!editing || !isBibliaCatalogField(field)) return () => { active = false; };
    setLoadingOptions(true);
    void bibliaCatalogService.getOptions(field)
      .then((items) => { if (active) setOptions(items); })
      .catch(() => { if (active) setOptions([]); })
      .finally(() => { if (active) setLoadingOptions(false); });
    return () => { active = false; };
  }, [editing, field]);

  const inputType = field === "dateKey" ? "date" : field === "pax" ? "number" : field === "time" ? "time" : "text";
  const isTrainField = field === "trainOutbound" || field === "trainReturn";
  const visibleValue = field === "nationality"
    ? "Editar distribución"
    : isEmptyBibliaValue(rawValue)
    ? "—"
    : isTrainField
      ? compactBibliaTrainText(rawValue)
      : String(rawValue ?? "—");
  const cellColor = getBibliaExcelCellColor(activity, field);
  const richText = getBibliaExcelRichText(activity, field);
  const mergedOptions = useMemo(
    () => [...new Set([...options, ...extraOptions].filter(Boolean))].sort((a, b) => a.localeCompare(b, "es", { numeric: true })),
    [extraOptions, options],
  );
  const catalogPlaceholder = {
    hotelCusco: "Busca hotel de Cusco...",
    hotelValle: "Busca hotel del Valle...",
    hotelMapi: "Busca hotel de Mapi...",
    tickets: "Busca ingreso o ticket...",
    restaurant: "Busca restaurante...",
    endorse: "Busca endose...",
    transport: "Busca transporte...",
    guide: "Busca guía o trasladista...",
    agency: "Busca agencia...",
    trainOutbound: "Busca empresa, tren, ruta u horario...",
    trainReturn: "Busca empresa, tren, ruta u horario...",
  }[String(field)] || "Busca o escribe una opción...";

  const finishEditing = (commit: boolean) => {
    if (commit) {
      const next = field === "pax" ? Number(value || 0) : (value.trim() || BIBLIA_EMPTY_VALUE);
      if (String(next) !== String(rawValue ?? "")) onCommit(activity, field, next);
    } else {
      setValue(String(rawValue ?? ""));
    }
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        className={`biblia-edit-value${visibleValue === "—" ? " is-empty" : ""}`}
        style={{ backgroundColor: cellColor, color: getReadableTextColor(cellColor) }}
        onClick={(event) => { event.stopPropagation(); setEditing(true); }}
        title={isBibliaCatalogField(field) ? "Haz clic para escribir o elegir una opción" : "Haz clic para editar"}
      >
        {richText && !isTrainField
          ? richText.map((run, index) => (
            <span
              key={`${index}-${run.text}`}
              style={{
                ...(run.font?.name ? { fontFamily: run.font.name } : {}),
                ...(run.font?.size ? { fontSize: `${Math.max(8, Math.min(18, run.font.size))}px` } : {}),
                ...(run.font?.bold ? { fontWeight: 800 } : {}),
                ...(run.font?.italic ? { fontStyle: "italic" } : {}),
                ...(run.font?.color ? { color: run.font.color } : {}),
              }}
            >{run.text}</span>
          ))
          : visibleValue}
      </button>
    );
  }

  if (isBibliaCatalogField(field)) {
    return (
      <div className="biblia-inline-editor biblia-inline-editor--catalog" onClick={(event) => event.stopPropagation()}>
        <SmartComboBox
          value={value === BIBLIA_EMPTY_VALUE ? "" : value}
          onChange={setValue}
          options={mergedOptions}
          loading={loadingOptions}
          placeholder={catalogPlaceholder}
          autoFocus
          maxVisibleOptions={80}
          portalDropdown
          className="biblia-catalog-combobox"
          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") { event.preventDefault(); finishEditing(true); }
            if (event.key === "Escape") { event.preventDefault(); finishEditing(false); }
          }}
        />
        <div className="biblia-inline-editor__actions">
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => finishEditing(true)} title="Guardar valor"><MdCheck /></button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => finishEditing(false)} title="Cancelar"><MdClose /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="biblia-inline-editor" onClick={(event) => event.stopPropagation()}>
      <input
        className="biblia-edit-input"
        type={inputType}
        min={field === "pax" ? 0 : undefined}
        value={value === BIBLIA_EMPTY_VALUE || (field === "time" && value === "Sin hora") ? "" : value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => finishEditing(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur();
          if (event.key === "Escape") { event.preventDefault(); finishEditing(false); }
        }}
        autoFocus
        title="Enter o salir del campo para guardar; Escape para cancelar"
      />
      {loadingOptions && <span className="biblia-inline-editor__loading" aria-label="Cargando opciones">…</span>}
    </div>
  );
};

const SortableBibliaRow = ({
  activity,
  className,
  style,
  onClick,
  children,
}: {
  activity: BibliaActivity;
  className: string;
  style: React.CSSProperties;
  onClick: () => void;
  children: (dragProps: { attributes: Record<string, any>; listeners: Record<string, any>; isDragging: boolean }) => React.ReactNode;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: activity.id });
  return (
    <tr
      ref={setNodeRef}
      className={`${className}${isDragging ? " is-dragging" : ""}`}
      style={{ ...style, transform: CSS.Transform.toString(transform), transition }}
      onClick={onClick}
    >
      {children({ attributes, listeners: listeners || {}, isDragging })}
    </tr>
  );
};

const Calendario = () => {
  const { auth } = useAuth();
  const userRole = Number(auth?.role ?? 1);
  const isSuperAdmin = userRole === 0;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [quotations, setQuotations] = useState<Array<Record<string, any>>>([]);
  const [standaloneRecords, setStandaloneRecords] = useState<Array<Record<string, any>>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [colorActivityId, setColorActivityId] = useState<string | null>(null);
  const [colorPopoverAnchor, setColorPopoverAnchor] = useState<HTMLElement | null>(null);
  const [customColorDraft, setCustomColorDraft] = useState("#FFFFFF");
  const [sourceVoucherPreview, setSourceVoucherPreview] = useState<Record<string, any> | null>(null);
  const [salesVoucherPreviewId, setSalesVoucherPreviewId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [serviceMode, setServiceMode] = useState("all");
  const [language, setLanguage] = useState("all");
  const [agency, setAgency] = useState("all");
  const [transport, setTransport] = useState("all");
  const [endorse, setEndorse] = useState("all");
  const [reservationName, setReservationName] = useState("all");
  const [trainProvider, setTrainProvider] = useState("all");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [linkActivityId, setLinkActivityId] = useState<string | null>(null);
  const [linkPopoverAnchor, setLinkPopoverAnchor] = useState<HTMLElement | null>(null);
  const [linkSearch, setLinkSearch] = useState("");
  const [creatingQuotationForId, setCreatingQuotationForId] = useState<string | null>(null);
  const [creatingQuotationRequestId, setCreatingQuotationRequestId] = useState<string | null>(null);
  const [newQuotationVoucherCode, setNewQuotationVoucherCode] = useState("");
  const [newQuotationTitle, setNewQuotationTitle] = useState("");
  const [pendingDelete, setPendingDelete] = useState<BibliaActivity | null>(null);
  const [exportingDayJpeg, setExportingDayJpeg] = useState(false);
  const [exportingDayExcel, setExportingDayExcel] = useState(false);
  const [exportingMonthExcel, setExportingMonthExcel] = useState(false);
  const [showDayDownloadOptions, setShowDayDownloadOptions] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const closeQuotationLinkPopover = useCallback(() => {
    setLinkActivityId(null);
    setLinkPopoverAnchor(null);
    setCreatingQuotationForId(null);
    setLinkSearch("");
  }, []);

  const closeColorPopover = useCallback(() => {
    setColorActivityId(null);
    setColorPopoverAnchor(null);
  }, []);

  const activities = useMemo(
    () => buildBibliaActivitiesFromSnapshots(quotations, standaloneRecords),
    [quotations, standaloneRecords],
  );
  const historicalOutboundTrains = useMemo(
    () => getHistoricalBibliaTrainOptions(activities, "trainOutbound"),
    [activities],
  );
  const historicalReturnTrains = useMemo(
    () => getHistoricalBibliaTrainOptions(activities, "trainReturn"),
    [activities],
  );
  const historicalCatalogOptions = useMemo(() => {
    const result: Record<string, string[]> = {};
    BIBLIA_CATALOG_FIELDS.forEach((field) => {
      const values = new Map<string, string>();
      activities.forEach((activity) => {
        const value = String(activity[field] || "").trim();
        const key = normalize(value);
        if (value && value !== BIBLIA_EMPTY_VALUE && !values.has(key)) values.set(key, value);
      });
      result[field] = [...values.values()].sort((left, right) => left.localeCompare(right, "es", { numeric: true }));
    });
    return result;
  }, [activities]);

  const loadActivities = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true); else setLoading(true);
      setError("");
      const operationalData = await bibliaActivityService.getOperationalData();
      const rawQuotes = operationalData.quotations;
      const batch: Array<{ id: string; biblia_actividades: Array<Record<string, any>> }> = [];
      const preparedQuotes = rawQuotes.map((quote) => {
        if (isQuotationBibliaMaterialized(quote)) return quote;
        const records = materializeQuotationBibliaRecords(quote);
        if (!bibliaRecordsEqual(asArray(quote.biblia_actividades), records)) {
          batch.push({ id: String(quote.id), biblia_actividades: records });
        }
        return { ...quote, biblia_actividades: records };
      });

      // No mostramos registros derivados hasta que su snapshot completo ya quedó
      // persistido en cotizacion.biblia_actividades.
      if (batch.length) await bibliaActivityService.saveQuotationSnapshotsBatch(batch);
      setQuotations(preparedQuotes);
      setStandaloneRecords(operationalData.standalone);
    } catch (requestError) {
      console.error("No se pudo cargar/materializar la Biblia de actividades:", requestError);
      setError("No se pudo preparar la Biblia de actividades. Intenta actualizar nuevamente.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadActivities(); }, [loadActivities]);

  const persistQuotationRecords = useCallback(async (quotationId: string, records: Array<Record<string, any>>) => {
    const previous = quotations;
    setSaving(true);
    setError("");
    setQuotations((current) => current.map((quote) => String(quote.id) === quotationId ? { ...quote, biblia_actividades: records } : quote));
    try {
      await bibliaActivityService.saveQuotationOverrides(quotationId, records);
    } catch (saveError) {
      setQuotations(previous);
      setError("No se pudo guardar el cambio de la Biblia. Se restauró el valor anterior.");
      throw saveError;
    } finally {
      setSaving(false);
    }
  }, [quotations]);

  const persistStandaloneRecord = useCallback(async (
    activity: BibliaActivity,
    record: Record<string, any>,
    quotationId?: string | null,
  ) => {
    const standaloneId = activity.standaloneRecordId;
    if (!standaloneId) return;
    const previous = standaloneRecords;
    const currentOuter = standaloneRecords.find((item) => String(item.id) === standaloneId) || {};
    const nextQuotationId = quotationId === undefined
      ? (currentOuter.cotizacion_id ? String(currentOuter.cotizacion_id) : null)
      : (quotationId || null);
    setSaving(true);
    setError("");
    setStandaloneRecords((current) => current.map((item) => String(item.id) === standaloneId
      ? { ...item, cotizacion_id: nextQuotationId, actividad: record }
      : item));
    try {
      await bibliaActivityService.updateStandaloneActivity(standaloneId, nextQuotationId, record);
    } catch (saveError) {
      setStandaloneRecords(previous);
      setError("No se pudo guardar la actividad independiente. Se restauró el valor anterior.");
      throw saveError;
    } finally {
      setSaving(false);
    }
  }, [standaloneRecords]);

  const commitActivityChanges = useCallback(async (activity: BibliaActivity, changes: Partial<BibliaActivity>) => {
    const record = materializeBibliaOverride(activity, changes);
    if (activity.sourceType === "standalone") {
      await persistStandaloneRecord(activity, record).catch(() => undefined);
      return;
    }
    const quotation = quotations.find((quote) => String(quote.id) === activity.sourceQuotationId);
    if (!quotation) return;
    const nextRecords = upsertBibliaOverride(asArray<Record<string, any>>(quotation.biblia_actividades), record);
    await persistQuotationRecords(activity.sourceQuotationId, nextRecords).catch(() => undefined);
  }, [persistQuotationRecords, persistStandaloneRecord, quotations]);

  const commitField = useCallback((activity: BibliaActivity, field: keyof BibliaActivity, value: string | number) => {
    const shouldSyncQuotation = BIBLIA_ITINERARY_SERVICE_FIELDS.has(field)
      && (activity.sourceType !== "standalone" || Boolean(activity.sourceQuotationId));
    const richText = activity.sourceExcel?.richText;
    const nextSourceExcel = richText?.[String(field)]
      ? {
        ...activity.sourceExcel,
        richText: Object.fromEntries(Object.entries(richText).filter(([key]) => key !== String(field))),
      }
      : undefined;
    void commitActivityChanges(activity, {
      [field]: value,
      ...(nextSourceExcel ? { sourceExcel: nextSourceExcel } : {}),
      ...(shouldSyncQuotation ? { syncQuotation: true } : {}),
    } as Partial<BibliaActivity>);
  }, [commitActivityChanges]);

  const languages = useMemo(() => [...new Set(activities.map((item) => item.language).filter((item) => item && item !== BIBLIA_EMPTY_VALUE))].sort(), [activities]);
  const agencies = useMemo(() => [...new Set(activities.map((item) => item.agency).filter((item) => item && item !== BIBLIA_EMPTY_VALUE))].sort(), [activities]);
  const transports = useMemo(() => getBibliaTransportOptions(activities), [activities]);
  const endorses = useMemo(() => getBibliaEndorseOptions(activities), [activities]);
  const reservations = useMemo(() => getBibliaReservationOptions(activities), [activities]);
  const trainProviders = useMemo(() => getBibliaTrainProviderOptions(activities), [activities]);
  const activityFilters = useMemo(
    () => ({ search, serviceMode, language, agency, transport, endorse, reservationName, trainProvider }),
    [agency, endorse, language, reservationName, search, serviceMode, trainProvider, transport],
  );
  const activeSelectFilterCount = useMemo(
    () => [serviceMode, language, agency, reservationName, endorse, trainProvider, transport]
      .filter((value) => value !== "all").length,
    [agency, endorse, language, reservationName, serviceMode, trainProvider, transport],
  );
  const clearSelectFilters = useCallback(() => {
    setServiceMode("all");
    setLanguage("all");
    setAgency("all");
    setReservationName("all");
    setEndorse("all");
    setTrainProvider("all");
    setTransport("all");
  }, []);
  const filteredActivities = useMemo(() => {
    return filterBibliaActivities(activities, activityFilters);
  }, [activities, activityFilters]);
  const activitiesByDate = useMemo(() => {
    const map = new Map<string, BibliaActivity[]>();
    filteredActivities.forEach((activity) => map.set(activity.dateKey, [...(map.get(activity.dateKey) || []), activity]));
    map.forEach((items) => items.sort((a, b) => a.order - b.order || a.time.localeCompare(b.time, "es", { numeric: true })));
    return map;
  }, [filteredActivities]);
  const monthDays = useMemo(() => {
    const start = startOfCalendarGrid(currentDate);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [currentDate]);
  const dayActivities = activitiesByDate.get(toBibliaDateKey(currentDate)) || [];

  useEffect(() => {
    if (viewMode !== "day" || !hasBibliaActiveFilters(activityFilters) || !filteredActivities.length) return;
    if (activitiesByDate.has(toBibliaDateKey(currentDate))) return;
    const firstMatch = filteredActivities[0];
    setCurrentDate(new Date(firstMatch.date.getFullYear(), firstMatch.date.getMonth(), firstMatch.date.getDate()));
  }, [activitiesByDate, activityFilters, currentDate, filteredActivities, viewMode]);

  const changePeriod = (direction: -1 | 1) => {
    const next = new Date(currentDate);
    if (viewMode === "month") next.setMonth(next.getMonth() + direction, 1); else next.setDate(next.getDate() + direction);
    setCurrentDate(next);
  };
  const showDay = (date: Date) => {
    setCurrentDate(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
    setViewMode("day");
  };
  const focusActivity = (activity: BibliaActivity) => {
    showDay(activity.date);
    setSelectedActivityId(activity.id);
  };

  const openActivityVoucher = useCallback((activity: BibliaActivity) => {
    if (activity.sourceVoucherMedia) {
      setSourceVoucherPreview(activity.sourceVoucherMedia);
      setSalesVoucherPreviewId(null);
    } else if (activity.sourceSalesVoucherId) {
      setSalesVoucherPreviewId(activity.sourceSalesVoucherId);
      setSourceVoucherPreview(null);
    } else {
      setError("Esta actividad todavía no tiene un voucher disponible para visualizar.");
    }
  }, []);
  const renderVoucherButton = (activity: BibliaActivity, compact = false) => (
    <button
      type="button"
      className={`biblia-voucher-button${compact ? " is-compact" : ""}`}
      onClick={(event) => { event.stopPropagation(); openActivityVoucher(activity); }}
      disabled={!activity.sourceVoucherMedia && !activity.sourceSalesVoucherId}
      title="Ver voucher relacionado"
    >
      <MdVisibility /> {compact ? "Ver" : "Ver voucher"}
    </button>
  );

  const persistDayOrder = useCallback(async (ordered: BibliaActivity[]) => {
    const quoteRecords = new Map<string, Array<Record<string, any>>>();
    const standaloneUpdates: Array<{ activity: BibliaActivity; record: Record<string, any>; quotationId: string | null }> = [];

    ordered.forEach((activity, index) => {
      const order = index + 1;
      if (Number(activity.order) === order) return;
      const record = materializeBibliaOverride(activity, { order });
      if (activity.sourceType === "standalone" && activity.standaloneRecordId) {
        const outer = standaloneRecords.find((item) => String(item.id) === activity.standaloneRecordId);
        standaloneUpdates.push({ activity, record, quotationId: outer?.cotizacion_id ? String(outer.cotizacion_id) : null });
        return;
      }
      const quoteId = activity.sourceQuotationId;
      if (!quoteId) return;
      const quote = quotations.find((item) => String(item.id) === quoteId);
      if (!quote) return;
      const currentRecords = quoteRecords.get(quoteId) || asArray<Record<string, any>>(quote.biblia_actividades);
      quoteRecords.set(quoteId, upsertBibliaOverride(currentRecords, record));
    });

    if (!quoteRecords.size && !standaloneUpdates.length) return;
    const previousQuotes = quotations;
    const previousStandalone = standaloneRecords;
    setSaving(true);
    setError("");
    setQuotations((current) => current.map((quote) => {
      const records = quoteRecords.get(String(quote.id));
      return records ? { ...quote, biblia_actividades: records } : quote;
    }));
    if (standaloneUpdates.length) {
      const byId = new Map(standaloneUpdates.map((item) => [item.activity.standaloneRecordId, item.record]));
      setStandaloneRecords((current) => current.map((outer) => {
        const record = byId.get(String(outer.id));
        return record ? { ...outer, actividad: record } : outer;
      }));
    }

    try {
      await Promise.all([
        quoteRecords.size
          ? bibliaActivityService.saveQuotationSnapshotsBatch(
              [...quoteRecords.entries()].map(([id, biblia_actividades]) => ({ id, biblia_actividades })),
            )
          : Promise.resolve(),
        ...standaloneUpdates.map((item) => bibliaActivityService.updateStandaloneActivity(
          String(item.activity.standaloneRecordId), item.quotationId, item.record,
        )),
      ]);
    } catch (saveError) {
      console.error("No se pudo guardar el orden de la Biblia:", saveError);
      setQuotations(previousQuotes);
      setStandaloneRecords(previousStandalone);
      setError("No se pudo guardar el nuevo orden. Se restauró el orden anterior.");
    } finally {
      setSaving(false);
    }
  }, [quotations, standaloneRecords]);

  const allCurrentDayActivities = useMemo(
    () => activities
      .filter((item) => item.dateKey === toBibliaDateKey(currentDate))
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    [activities, currentDate],
  );
  const allCurrentMonthActivities = useMemo(
    () => activities
      .filter((item) => sameMonth(item.date, currentDate))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.order - b.order || a.id.localeCompare(b.id)),
    [activities, currentDate],
  );

  const handleDownloadDayJpeg = useCallback(async () => {
    if (!allCurrentDayActivities.length || exportingDayJpeg) return;
    setExportingDayJpeg(true);
    setError("");
    try {
      await downloadBibliaDayJpeg({ date: currentDate, activities: allCurrentDayActivities, quality: 0.9 });
    } catch (exportError) {
      console.error("No se pudo descargar la Biblia del día en JPG:", exportError);
      setError("No se pudo generar la captura JPG del día. Intenta nuevamente.");
    } finally {
      setExportingDayJpeg(false);
      setShowDayDownloadOptions(false);
    }
  }, [allCurrentDayActivities, currentDate, exportingDayJpeg]);

  const handleDownloadDayExcel = useCallback(async () => {
    if (!allCurrentDayActivities.length || exportingDayExcel) return;
    setExportingDayExcel(true);
    setError("");
    try {
      await downloadBibliaDayExcel({ date: currentDate, activities: allCurrentDayActivities });
    } catch (exportError) {
      console.error("No se pudo descargar la Biblia del día en Excel:", exportError);
      setError("No se pudo generar el Excel del día. Intenta nuevamente.");
    } finally {
      setExportingDayExcel(false);
      setShowDayDownloadOptions(false);
    }
  }, [allCurrentDayActivities, currentDate, exportingDayExcel]);

  const handleDownloadMonthExcel = useCallback(async () => {
    if (!allCurrentMonthActivities.length || exportingMonthExcel) return;
    setExportingMonthExcel(true);
    setError("");
    try {
      await downloadBibliaMonthExcel({ month: currentDate, activities: allCurrentMonthActivities });
    } catch (exportError) {
      console.error("No se pudo descargar la Biblia mensual en Excel:", exportError);
      setError("No se pudo generar el Excel mensual. Intenta nuevamente.");
    } finally {
      setExportingMonthExcel(false);
    }
  }, [allCurrentMonthActivities, currentDate, exportingMonthExcel]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    if (!overId || activeId === overId) return;
    const oldIndex = allCurrentDayActivities.findIndex((item) => item.id === activeId);
    const newIndex = allCurrentDayActivities.findIndex((item) => item.id === overId);
    if (oldIndex < 0 || newIndex < 0) return;
    void persistDayOrder(arrayMove(allCurrentDayActivities, oldIndex, newIndex));
  }, [allCurrentDayActivities, persistDayOrder]);

  const reorderActivity = useCallback((activity: BibliaActivity, direction: -1 | 1) => {
    const index = allCurrentDayActivities.findIndex((item) => item.id === activity.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= allCurrentDayActivities.length) return;
    void persistDayOrder(arrayMove(allCurrentDayActivities, index, target));
  }, [allCurrentDayActivities, persistDayOrder]);

  const confirmDeleteActivity = useCallback(async () => {
    const activity = pendingDelete;
    if (!activity || !isSuperAdmin) return;
    setSaving(true);
    setError("");
    try {
      if (activity.sourceType === "standalone" && activity.standaloneRecordId) {
        await bibliaActivityService.deleteStandaloneActivity(activity.standaloneRecordId);
        setStandaloneRecords((current) => current.filter((item) => String(item.id) !== activity.standaloneRecordId));
      } else if (activity.sourceQuotationId) {
        const recordId = String(activity.overrideRecord?.id || activity.id);
        await bibliaActivityService.softDeleteQuotationActivity(activity.sourceQuotationId, recordId);
        setQuotations((current) => current.map((quote) => {
          if (String(quote.id) !== activity.sourceQuotationId) return quote;
          return {
            ...quote,
            biblia_actividades: asArray<Record<string, any>>(quote.biblia_actividades).map((record) =>
              String(record.id) === recordId
                ? { ...record, isDeleted: true, deletedAt: new Date().toISOString() }
                : record,
            ),
          };
        }));
      }
      setSelectedActivityId(null);
      setPendingDelete(null);
    } catch (deleteError) {
      console.error("No se pudo eliminar lógicamente el registro:", deleteError);
      setError("No se pudo eliminar el registro. No se realizó ningún borrado definitivo.");
    } finally {
      setSaving(false);
    }
  }, [isSuperAdmin, pendingDelete]);

  const addQuickBibliaRecord = useCallback(async () => {
    const dateKey = toBibliaDateKey(currentDate);
    const sameDateOrders = activities.filter((item) => item.dateKey === dateKey).map((item) => item.order);
    const nextOrder = (sameDateOrders.length ? Math.max(...sameDateOrders) : 0) + 1;
    const localId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const record = buildStandaloneBibliaRecord({ dateKey, order: nextOrder, localId });

    setSaving(true);
    setError("");
    try {
      const created = await bibliaActivityService.createStandaloneActivity(null, record);
      setStandaloneRecords((current) => [...current, created]);
      setViewMode("day");
      setSelectedActivityId(`standalone:${created.id}`);
      closeQuotationLinkPopover();
    } catch (createError) {
      console.error("No se pudo crear rápidamente el registro de Biblia:", createError);
      setError("No se pudo agregar el registro rápido. Inténtalo nuevamente.");
    } finally {
      setSaving(false);
    }
  }, [activities, closeQuotationLinkPopover, currentDate]);

  const linkStandaloneActivity = useCallback(async (activity: BibliaActivity, quotationId: string) => {
    if (activity.sourceType !== "standalone") return;
    const quotation = quotations.find((quote) => String(quote.id) === quotationId);
    if (!quotation) return;
    const template = quotation ? asArray<Record<string, any>>(quotation.biblia_actividades).find((row) => !row.isDeleted) || {} : {};
    const baseRecord = { ...(activity.overrideRecord || {}) };
    const record = materializeBibliaOverride(activity, { sourceQuotationId: quotationId } as Partial<BibliaActivity>);
    record.sourceQuotationId = quotationId;
    record.quotationId = quotationId;
    record.quotationOrigin = "linked";
    record.syncQuotation = true;
    ["reservationName", "nationality", "language", "serviceMode", "counter", "agency"].forEach((field) => {
      if (quotation && isEmptyBibliaValue(baseRecord[field]) && !isEmptyBibliaValue(template[field])) record[field] = template[field];
    });
    record.file = getBibliaQuotationVoucherCode(quotation) || quotationId;
    if (quotation && Number(baseRecord.pax || 0) === 0 && Number(template.pax || 0) > 0) record.pax = Number(template.pax);
    await persistStandaloneRecord(activity, record, quotationId).catch(() => undefined);
    closeQuotationLinkPopover();
  }, [closeQuotationLinkPopover, persistStandaloneRecord, quotations]);

  const openQuotationCreation = useCallback((activity: BibliaActivity) => {
    const draft = buildBibliaQuotationCreationDraft(activity);
    setCreatingQuotationForId(activity.id);
    setNewQuotationVoucherCode(draft.voucherCode);
    setNewQuotationTitle(draft.title);
  }, []);

  const createQuotationFromStandaloneActivity = useCallback(async (activity: BibliaActivity) => {
    if (activity.sourceType !== "standalone" || !activity.standaloneRecordId) return;
    const voucherCode = newQuotationVoucherCode.trim();
    if (!voucherCode) {
      setError("Indica el código de file antes de crear la cotización.");
      return;
    }
    if (creatingQuotationRequestId !== null) return;
    setCreatingQuotationRequestId(activity.id);
    setError("");
    try {
      await bibliaActivityService.createQuotationFromStandaloneActivity(activity.standaloneRecordId, {
        voucherCode,
        title: newQuotationTitle.trim() || undefined,
      });
      closeQuotationLinkPopover();
      await loadActivities(true);
    } catch (createError) {
      console.error("No se pudo crear la cotización desde la Biblia:", createError);
      const apiMessage = String((createError as any)?.response?.data?.message || "").trim();
      setError(apiMessage || "No se pudo crear y vincular la cotización. Verifica el código de file e inténtalo nuevamente.");
    } finally {
      setCreatingQuotationRequestId((current) => current === activity.id ? null : current);
    }
  }, [closeQuotationLinkPopover, creatingQuotationRequestId, loadActivities, newQuotationTitle, newQuotationVoucherCode]);

  const renderQuotationLinkPopover = (activity: BibliaActivity) => {
    const open = linkActivityId === activity.id;
    const creatingThisQuotation = creatingQuotationRequestId === activity.id;
    const canCreateQuotation = canCreateQuotationFromBiblia({
      activity,
      voucherCode: newQuotationVoucherCode,
      submittingActivityId: creatingQuotationRequestId,
    });
    const matches = quotations
      .filter((quotation) => matchesBibliaQuotationLinkQuery(quotation, linkSearch))
      .slice(0, 40);
    return (
      <div className={`biblia-link-picker${open ? " is-open" : ""}`} onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="biblia-link-trigger"
          onClick={(event) => {
            const willOpen = linkActivityId !== activity.id;
            setSelectedActivityId(activity.id);
            closeColorPopover();
            if (!willOpen) {
              closeQuotationLinkPopover();
              return;
            }
            setLinkSearch("");
            setCreatingQuotationForId(null);
            setLinkActivityId(activity.id);
            setLinkPopoverAnchor(event.currentTarget);
          }}
          title="Vincular este file a una cotización o crear una nueva"
          aria-label="Vincular file a cotización"
          aria-expanded={open}
        >
          <MdLink /> <span>Vincular</span>
        </button>
        {open && (
          <FloatingBibliaPopover
            anchor={linkPopoverAnchor}
            className="biblia-link-popover"
            ariaLabel="Vincular registro a cotización o voucher"
            onRequestClose={closeQuotationLinkPopover}
          >
            <div className="biblia-link-popover__header">
              <div>
                <strong>Cotización del file</strong>
                <small>{activity.file} · {activity.reservationName}</small>
              </div>
              <button type="button" onClick={closeQuotationLinkPopover} aria-label="Cerrar vínculo"><MdClose /></button>
            </div>
            <label className="biblia-link-popover__search">
              <MdSearch />
              <input
                value={linkSearch}
                onChange={(event) => setLinkSearch(event.target.value)}
                placeholder="Buscar file, título o voucher"
                autoFocus
              />
            </label>
            {!activity.sourceQuotationId && (
              creatingQuotationForId === activity.id ? (
                <div className="biblia-link-popover__create-form">
                  <strong>Crear cotización desde esta fila</strong>
                  <input
                    value={newQuotationVoucherCode}
                    onChange={(event) => setNewQuotationVoucherCode(event.target.value)}
                    placeholder="Código de file"
                    maxLength={50}
                    aria-label="Código de file"
                    disabled={creatingThisQuotation}
                  />
                  <input
                    value={newQuotationTitle}
                    onChange={(event) => setNewQuotationTitle(event.target.value)}
                    placeholder="Título de cotización"
                    maxLength={255}
                    aria-label="Título de cotización"
                    disabled={creatingThisQuotation}
                  />
                  <div>
                    <button
                      type="button"
                      className="biblia-link-popover__create-submit"
                      onClick={() => void createQuotationFromStandaloneActivity(activity)}
                      disabled={!canCreateQuotation}
                    >
                      {creatingThisQuotation ? "Creando..." : "Crear y vincular"}
                    </button>
                    <button
                      type="button"
                      className="biblia-link-popover__create-cancel"
                      onClick={() => setCreatingQuotationForId(null)}
                      disabled={creatingThisQuotation}
                    >Cancelar</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="biblia-link-popover__create" onClick={() => openQuotationCreation(activity)}>
                  <MdAdd /> Crear cotización
                </button>
              )
            )}
            <div className="biblia-link-popover__list">
              {matches.map((quotation) => {
                const quotationId = String(quotation.id || "");
                const voucherCode = String(quotation.source_sales_voucher_code || quotation.sourceSalesVoucherCode || "").trim();
                return (
                  <button
                    type="button"
                    key={quotationId}
                    className={activity.sourceQuotationId === quotationId ? "active" : ""}
                    onClick={() => void linkStandaloneActivity(activity, quotationId)}
                  >
                    <span>{getBibliaQuotationLinkLabel(quotation)}</span>
                    {voucherCode && <small>Voucher {voucherCode}</small>}
                  </button>
                );
              })}
              {matches.length === 0 && <span className="biblia-link-popover__empty">No hay coincidencias.</span>}
            </div>
          </FloatingBibliaPopover>
        )}
      </div>
    );
  };

  const applyActivityColor = useCallback((activity: BibliaActivity, color: string) => {
    setSelectedActivityId(activity.id);
    closeColorPopover();
    void commitActivityChanges(activity, { color: normalizeBibliaColor(color) });
  }, [closeColorPopover, commitActivityChanges]);

  const renderRowColorPicker = (activity: BibliaActivity) => {
    const open = colorActivityId === activity.id;
    const customColorIsValid = /^#[0-9A-F]{6}$/i.test(customColorDraft);
    return (
      <div className={`biblia-row-color-picker${open ? " is-open" : ""}`} onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="biblia-row-color-trigger"
          onClick={(event) => {
            const willOpen = colorActivityId !== activity.id;
            setSelectedActivityId(activity.id);
            closeQuotationLinkPopover();
            if (!willOpen) {
              closeColorPopover();
              return;
            }
            setCustomColorDraft(normalizeBibliaColor(activity.color));
            setColorActivityId(activity.id);
            setColorPopoverAnchor(event.currentTarget);
          }}
          title="Cambiar color de esta fila"
          aria-expanded={open}
        >
          <span className="biblia-row-color-trigger__swatch" style={{ backgroundColor: normalizeBibliaColor(activity.color) }} />
          <MdPalette />
        </button>
        {open && (
          <FloatingBibliaPopover
            anchor={colorPopoverAnchor}
            className="biblia-row-color-popover"
            ariaLabel={`Color para ${activity.excursion}`}
            onRequestClose={closeColorPopover}
          >
            <div className="biblia-row-color-popover__header">
              <div>
                <strong>Color de fila</strong>
                <small>{activity.file}</small>
              </div>
              <button type="button" onClick={closeColorPopover} aria-label="Cerrar selector de color"><MdClose /></button>
            </div>
            <div className="biblia-row-color-popover__palette">
              {BIBLIA_EXCEL_PALETTE.map((color) => (
                <button
                  type="button"
                  key={color}
                  className={normalizeBibliaColor(activity.color) === color ? "active" : ""}
                  style={{ backgroundColor: color }}
                  onClick={() => applyActivityColor(activity, color)}
                  title={`Usar ${color}`}
                  aria-label={`Usar color ${color}`}
                />
              ))}
            </div>
            <div className="biblia-row-color-popover__custom">
              <span>Color personalizado</span>
              <div>
                <input
                  type="color"
                  value={customColorIsValid ? customColorDraft : normalizeBibliaColor(activity.color)}
                  onChange={(event) => setCustomColorDraft(event.target.value.toUpperCase())}
                  aria-label="Elegir color personalizado"
                />
                <input
                  type="text"
                  value={customColorDraft}
                  maxLength={7}
                  onChange={(event) => {
                    const value = event.target.value.toUpperCase();
                    if (/^#[0-9A-F]{0,6}$/.test(value)) setCustomColorDraft(value);
                  }}
                  aria-label="Código hexadecimal del color"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => applyActivityColor(activity, customColorDraft)}
                  disabled={!customColorIsValid || saving}
                >
                  Aplicar
                </button>
              </div>
            </div>
          </FloatingBibliaPopover>
        )}
      </div>
    );
  };

  const renderMonth = () => (
    <div className="biblia-month-shell">
      <div className="biblia-weekdays">{WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
      <div className="biblia-month-grid">
        {monthDays.map((date) => {
          const key = toBibliaDateKey(date);
          const items = activitiesByDate.get(key) || [];
          return (
            <div key={key} role="button" tabIndex={0} className={`biblia-month-day${sameMonth(date, currentDate) ? "" : " is-outside"}${sameDay(date, new Date()) ? " is-today" : ""}`} onClick={() => showDay(date)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); showDay(date); } }}>
              <div className="biblia-month-day__header"><span className="biblia-month-day__number">{date.getDate()}</span>{items.length > 0 && <span className="biblia-month-day__count">{items.length}</span>}</div>
              <div className="biblia-month-day__events">
                {items.slice(0, 4).map((activity) => <ActivityChip key={activity.id} compact activity={activity} onClick={() => focusActivity(activity)} />)}
                {items.length > 4 && <span className="biblia-month-day__more">+{items.length - 4} registros</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderDaySheet = () => (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={dayActivities.map((activity) => activity.id)} strategy={verticalListSortingStrategy}>
        <div className="biblia-sheet-wrap" role="region" aria-label="Tabla completa de la Biblia de actividades. Desliza horizontalmente para consultar todas las columnas.">
          <table className="biblia-sheet-table">
            <thead><tr>{BIBLIA_SHEET_COLUMNS.map(([field, label]) => <th key={field}>{label}</th>)}<th>ACCIONES</th></tr></thead>
            <tbody>
              {dayActivities.map((activity) => {
                return (
                  <SortableBibliaRow
                    key={activity.id}
                    activity={activity}
                    className={`${selectedActivityId === activity.id ? "is-selected" : ""}${activity.sourceType === "standalone" ? " is-standalone" : ""}`}
                    style={{ "--row-color": normalizeBibliaColor(activity.color), "--row-text": getReadableTextColor(activity.color) } as React.CSSProperties}
                    onClick={() => {
                      setSelectedActivityId(activity.id);
                      if (colorActivityId && colorActivityId !== activity.id) closeColorPopover();
                      if (linkActivityId && linkActivityId !== activity.id) closeQuotationLinkPopover();
                    }}
                  >
                    {({ attributes, listeners }) => <>
                      {BIBLIA_SHEET_COLUMNS.map(([field, label]) => {
                        const editor = field === "nationality" ? (
                          <ParticipantPlanEditor
                            activity={activity}
                            onSave={(participantPlan) => {
                              void commitActivityChanges(activity, {
                                participantPlan,
                                nationality: BIBLIA_EMPTY_VALUE,
                                ...(activity.sourceQuotationId ? { syncQuotation: true } : {}),
                              });
                            }}
                          />
                        ) : (
                          <EditableValue
                            activity={activity}
                            field={field}
                            onCommit={commitField}
                            extraOptions={field === "trainOutbound"
                              ? historicalOutboundTrains
                              : field === "trainReturn"
                                ? historicalReturnTrains
                                : isBibliaCatalogField(field)
                                  ? historicalCatalogOptions[field] || []
                                  : []}
                          />
                        );
                        return (
                          <td
                            key={field}
                            className={field === "file" ? "biblia-sheet-table__file" : undefined}
                            data-label={label}
                            style={{
                              backgroundColor: getBibliaExcelCellColor(activity, field),
                              color: getReadableTextColor(getBibliaExcelCellColor(activity, field)),
                            }}
                          >
                            {field === "file" && activity.sourceType === "standalone" && !activity.sourceQuotationId ? (
                              <div className="biblia-file-cell">
                                {editor}
                                {renderQuotationLinkPopover(activity)}
                              </div>
                            ) : editor}
                          </td>
                        );
                      })}
                      <td className="biblia-sheet-table__actions" data-label="Acciones">
                        <button
                          type="button"
                          className="biblia-drag-handle"
                          {...attributes}
                          {...listeners}
                          onClick={(event) => event.stopPropagation()}
                          title="Arrastrar para reordenar"
                          aria-label="Arrastrar para reordenar este registro"
                        ><MdDragIndicator /></button>
                        {renderRowColorPicker(activity)}
                        <button type="button" className="biblia-order-fallback" onClick={(event) => { event.stopPropagation(); reorderActivity(activity, -1); }} title="Subir registro"><MdArrowUpward /></button>
                        <button type="button" className="biblia-order-fallback" onClick={(event) => { event.stopPropagation(); reorderActivity(activity, 1); }} title="Bajar registro"><MdArrowDownward /></button>
                        {isSuperAdmin && (
                          <button type="button" className="biblia-delete-button" onClick={(event) => { event.stopPropagation(); setPendingDelete(activity); }} title="Eliminar lógicamente el registro">
                            <MdDeleteOutline />
                          </button>
                        )}
                        {renderVoucherButton(activity, true)}
                      </td>
                    </>}
                  </SortableBibliaRow>
                );
              })}
            </tbody>
          </table>
        </div>
      </SortableContext>
    </DndContext>
  );

  const renderDay = () => (
    <div className="biblia-day-view">
      <div className="biblia-day-heading">
        <div><h2>Operación del día</h2></div>
        <div className="biblia-day-heading__actions">
          <strong>{dayActivities.length} registros</strong>
          {allCurrentDayActivities.length > 0 && (
            showDayDownloadOptions ? (
              <div className="biblia-day-download-options" role="group" aria-label={`Formato de descarga para los ${allCurrentDayActivities.length} registros del día`}>
                <button
                  type="button"
                  onClick={() => void handleDownloadDayJpeg()}
                  disabled={exportingDayJpeg}
                  title="Descargar todas las columnas y registros de este día en una sola imagen JPG"
                >
                  <MdDownload /> {exportingDayJpeg ? "Generando JPG..." : "Imagen JPG"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownloadDayExcel()}
                  disabled={exportingDayExcel}
                  title="Descargar todas las columnas y registros de este día en Excel con los colores de cada fila"
                >
                  <MdDownload /> {exportingDayExcel ? "Generando Excel..." : "Excel"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="biblia-day-download-trigger"
                onClick={() => setShowDayDownloadOptions(true)}
                aria-expanded={false}
                aria-label={`Descargar los ${allCurrentDayActivities.length} registros del día`}
                title="Elegir entre descargar una imagen JPG o un archivo Excel"
              >
                <MdDownload /> Descargar día ({allCurrentDayActivities.length}) <MdExpandMore />
              </button>
            )
          )}
        </div>
      </div>
      {dayActivities.length === 0 ? <div className="biblia-empty-state"><MdCalendarMonth /><strong>Sin registros programados</strong><span>No hay registros guardados en la Biblia para este día con los filtros actuales.</span></div> : renderDaySheet()}
    </div>
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div className="biblia-page">
      <section className="biblia-toolbar-shell" aria-label="Navegación de la Biblia">
        <div className="biblia-toolbar">
          <div className="biblia-toolbar__side biblia-toolbar__side--left">
            <button type="button" className="biblia-toolbar__today" onClick={() => setCurrentDate(new Date())}><MdToday /> Hoy</button>
            <button type="button" className="biblia-toolbar__add" onClick={() => void addQuickBibliaRecord()} disabled={saving}><MdAdd /> Agregar registro</button>
          </div>
          <div className="biblia-toolbar__navigation">
            <button type="button" onClick={() => changePeriod(-1)} aria-label="Periodo anterior"><MdChevronLeft /></button>
            <div className="biblia-date-jump">
              <button type="button" className="biblia-date-jump__trigger" onClick={() => setShowDatePicker((current) => !current)} aria-expanded={showDatePicker} title="Elegir fecha">
                {viewMode === "month" ? formatMonth(currentDate) : formatLongDate(currentDate)}
              </button>
              {showDatePicker && (
                <div className="biblia-date-jump__popover">
                  <input
                    type="date"
                    value={toBibliaDateKey(currentDate)}
                    onChange={(event) => {
                      const [year, month, day] = event.target.value.split("-").map(Number);
                      if (year && month && day) setCurrentDate(new Date(year, month - 1, day));
                      setShowDatePicker(false);
                    }}
                    autoFocus
                    aria-label="Ir a fecha"
                  />
                  <button type="button" onClick={() => { setCurrentDate(new Date()); setShowDatePicker(false); }}>Hoy</button>
                </div>
              )}
            </div>
            <button type="button" onClick={() => changePeriod(1)} aria-label="Periodo siguiente"><MdChevronRight /></button>
          </div>
          <div className="biblia-toolbar__side biblia-toolbar__side--right">
            {allCurrentMonthActivities.length > 0 && (
              <button
                type="button"
                className="biblia-month-download-trigger"
                onClick={() => void handleDownloadMonthExcel()}
                disabled={exportingMonthExcel}
                title="Descargar el mes completo en Excel, con una pestaña por cada día y los colores de las filas"
              >
                <MdDownload /> {exportingMonthExcel ? "Generando mes..." : `Excel mes (${allCurrentMonthActivities.length})`}
              </button>
            )}
            <div className="biblia-view-switcher"><button type="button" className={viewMode === "month" ? "active" : ""} onClick={() => setViewMode("month")}><MdCalendarMonth /> Mes</button><button type="button" className={viewMode === "day" ? "active" : ""} onClick={() => setViewMode("day")}><MdViewDay /> Día</button></div>
            <button type="button" className={`biblia-toolbar__refresh${refreshing ? " is-loading" : ""}`} onClick={() => loadActivities(true)} disabled={refreshing || saving} aria-label="Actualizar"><MdRefresh /></button>
          </div>
        </div>
      </section>

      <section className={`biblia-filterbar${showMobileFilters ? " is-mobile-open" : ""}`}>
        <div className="biblia-filterbar__primary">
          <label className="biblia-search">
            <MdSearch />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar file, reserva, actividad, agencia o responsable" />
            {search && <button type="button" className="biblia-search__clear" onClick={() => setSearch("")} aria-label="Limpiar búsqueda"><MdClose /></button>}
          </label>
          <button
            type="button"
            className="biblia-filterbar__mobile-toggle"
            onClick={() => setShowMobileFilters((current) => !current)}
            aria-expanded={showMobileFilters}
            aria-controls="biblia-operational-filters"
          >
            <MdFilterAlt />
            <span>Filtros</span>
            {activeSelectFilterCount > 0 && <strong>{activeSelectFilterCount}</strong>}
            {showMobileFilters ? <MdExpandLess /> : <MdExpandMore />}
          </button>
        </div>
        <div id="biblia-operational-filters" className={`biblia-filterbar__selects${showMobileFilters ? " is-open" : ""}`}>
          <div className="biblia-filterbar__mobile-summary">
            <span>Filtros operativos</span>
            {activeSelectFilterCount > 0 && <button type="button" onClick={clearSelectFilters}>Limpiar</button>}
          </div>
          <MdFilterAlt className="biblia-filterbar__icon" aria-hidden="true" />
          <select value={serviceMode} onChange={(event) => setServiceMode(event.target.value)}><option value="all">SIC + PRIV</option><option value="SIC">SIC</option><option value="PRIV">PRIV</option></select>
          <select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="all">Todos los idiomas</option>{languages.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select value={agency} onChange={(event) => setAgency(event.target.value)}><option value="all">Todas las agencias</option>{agencies.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select value={reservationName} onChange={(event) => setReservationName(event.target.value)} aria-label="Filtrar por nombre de reserva"><option value="all">Todas las reservas</option>{reservations.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select value={endorse} onChange={(event) => setEndorse(event.target.value)} aria-label="Filtrar por endose"><option value="all">Todos los endoses</option>{endorses.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select value={trainProvider} onChange={(event) => setTrainProvider(event.target.value)} aria-label="Filtrar por proveedor de tren"><option value="all">Todos los proveedores de tren</option>{trainProviders.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select value={transport} onChange={(event) => setTransport(event.target.value)}><option value="all">Todos los transportes</option>{transports.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        </div>
      </section>

      {saving && <div className="biblia-saving">Guardando cambios operativos…</div>}
      {error && <div className="biblia-error">{error}</div>}
      <main className="biblia-content">{viewMode === "month" ? renderMonth() : renderDay()}</main>

      {pendingDelete && isSuperAdmin && (
        <div className="biblia-modal-backdrop biblia-delete-backdrop" onClick={() => setPendingDelete(null)}>
          <section className="biblia-confirm-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="biblia-delete-title">
            <header><h2 id="biblia-delete-title">Confirmar eliminación</h2><button type="button" onClick={() => setPendingDelete(null)}><MdClose /></button></header>
            <p>El registro <strong>{pendingDelete.file}</strong> del <strong>{pendingDelete.dateKey}</strong> dejará de mostrarse en la Biblia.</p>
            <small>Se conservará en el sistema como borrado lógico con información de auditoría. No se realizará un hard delete.</small>
            <footer><button type="button" onClick={() => setPendingDelete(null)}>Cancelar</button><button type="button" className="danger" onClick={confirmDeleteActivity} disabled={saving}><MdDeleteOutline /> Confirmar eliminación</button></footer>
          </section>
        </div>
      )}

      <SourceVoucherPreviewModal isOpen={Boolean(sourceVoucherPreview)} onClose={() => setSourceVoucherPreview(null)} voucher={sourceVoucherPreview} />
      {salesVoucherPreviewId && <VentasSummaryPDFModal isOpen={Boolean(salesVoucherPreviewId)} onClose={() => setSalesVoucherPreviewId(null)} voucher={{ id: salesVoucherPreviewId }} isPDFView={true} />}
    </div>
  );
};

export default Calendario;
