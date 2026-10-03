import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaChevronDown, FaChevronUp, FaFileInvoiceDollar, FaPlus, FaSearch, FaTimes } from "react-icons/fa";
import { MdCalendarMonth, MdRefresh } from "react-icons/md";
import { toast } from "react-toastify";
import contabilidadService from "../../../services/contabilidadService";
import { voucherVentaService } from "../../../services/voucherVentaService";
import voucherReservaService from "../../../services/voucherReservaService";
import { invalidateGetCache } from "../../../utils/axiosInstance";
import MovimientoForm from "../../../components/Contabilidad/MovimientoForm";
import MovimientosList from "../../../components/Contabilidad/MovimientosList";
import PendingPaymentsAccess from "../../../components/Contabilidad/PendingPaymentsAccess";
import DocumentsManagerModal from "../../../components/Contabilidad/DocumentsManagerModal/DocumentsManagerModal";
import VentasSummaryModal from "../../Ventas/VouchersVenta/components/VentasSummaryModal/VentasSummaryModal";
import VentasSummaryPDFModal from "../../Ventas/VouchersVenta/components/VentasSummaryPDFModal/VentasSummaryPDFModal";
import ServiceSummaryModal from "../../Reservas/VouchersReserva/components/ServiceSummaryModal/ServiceSummaryModal";
import QuotationVersionHistory from "../../Reservas/VouchersReserva/components/QuotationVersionHistory/QuotationVersionHistory";
import FileFormatModal from "./components/FileFormatModal";
import MovementFileActions from "./components/MovementFileActions";
import MovementCurrencyTotals from "./components/MovementCurrencyTotals";
import { buildMovementYears, movementInitialData } from "./domain/movementFiles";
import "./Files.scss";

const toggle = (setter, key) => setter(previous => {
  const next = new Set(previous);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
});
const normalizeReservation = response => response?.data?.data || response?.data || response;
const currentMonth = () => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

export function Files() {
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const requestSequence = useRef(0);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("todos");
  const [expandedYears, setExpandedYears] = useState(new Set([new Date().getFullYear()]));
  const [expandedMonths, setExpandedMonths] = useState(new Set([currentMonth()]));
  const [expandedFiles, setExpandedFiles] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<{ type: string; data: any } | null>(null);
  const [movementFile, setMovementFile] = useState<any>(null);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [selectedType, setSelectedType] = useState<"ingreso" | "egreso" | null>(null);

  const loadMovimientos = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true); setLoadError("");
    try {
      invalidateGetCache("/turismo/movimientos");
      const response = await contabilidadService.getMovimientos();
      if (response?.success !== true || !Array.isArray(response.data)) throw new Error("Respuesta de movimientos inválida");
      if (sequence === requestSequence.current) setMovimientos(response.data);
    } catch {
      if (sequence === requestSequence.current) setLoadError("No se pudieron actualizar los movimientos. Reintenta.");
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => { void loadMovimientos(); return () => { requestSequence.current++; }; }, [loadMovimientos]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => void loadMovimientos(), 150); };
    const events = ["movimientoCreated", "paymentRequestPaid", "paymentRequestCompleted", "paymentRequestCancelled"];
    events.forEach(event => window.addEventListener(event, refresh));
    return () => { clearTimeout(timer); events.forEach(event => window.removeEventListener(event, refresh)); };
  }, [loadMovimientos]);

  const years = useMemo(() => buildMovementYears(movimientos, search, typeFilter), [movimientos, search, typeFilter]);
  useEffect(() => {
    if (!search.trim()) return;
    setExpandedYears(new Set(years.map(year => year.year)));
    setExpandedMonths(new Set(years.flatMap(year => year.months.map(month => month.monthKey))));
  }, [search, years]);
  const fileCount = new Set(years.flatMap(year => year.months.flatMap(month =>
    month.files.map(file => file.fileKey)))).size;

  const openMovement = (file = null) => { setMovementFile(file); setSelectedType(null); setShowTypeSelector(true); };
  const closeMovement = () => { setSelectedType(null); setMovementFile(null); };
  const handleMovementSaved = () => { closeMovement(); void loadMovimientos(); };

  const handleFileAction = async (action, file) => {
    if (action === "movement") { openMovement(file); return; }
    if (action === "accounting" || action === "documents") { setViewer({ type: action, data: file }); return; }
    setBusy(true);
    try {
      if (action === "reservation") {
        const response = await voucherReservaService.getVoucherReservaWithRelationsById(file.referencia_voucher_reserva, { skipCache: true });
        const data = normalizeReservation(response);
        if (!data?.id) throw new Error("Reserva no encontrada");
        setViewer({ type: action, data });
      } else {
        const response = await voucherVentaService.getVoucherWithCotizacionById(file.referencia_voucher_venta);
        if (!response?.success || !response.data) throw new Error("Voucher no encontrado");
        setViewer({ type: action, data: response.data });
      }
    } catch (error) {
      toast.error(error?.message || "No se pudo abrir el detalle del file.");
    } finally { setBusy(false); }
  };

  return <div className="files-page files-page--movements">
    <header className="movements-toolbar">
      <div className="movements-toolbar__heading"><span>Contabilidad</span><h1>Movimientos</h1>
        <small>{fileCount} {fileCount === 1 ? "file" : "files"} · por año y mes</small></div>
      <div className="movements-toolbar__filters">
        <label className="movements-search"><FaSearch aria-hidden="true" />
          <input type="search" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Buscar file, descripción o responsable" aria-label="Buscar movimientos" />
          {search && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setSearch("")}><FaTimes /></button>}
        </label>
        <div className="movement-type-filter" role="group" aria-label="Tipo de movimiento">
          {[["todos", "Todos"], ["ingreso", "Ingresos"], ["egreso", "Egresos"]].map(([value, label]) =>
            <button type="button" key={value} aria-pressed={typeFilter === value} className={typeFilter === value ? "active" : ""}
              onClick={() => setTypeFilter(value)}>{label}</button>)}
        </div>
      </div>
      <div className="movements-page-actions">
        <button type="button" className="btn-add" onClick={() => openMovement()}><FaPlus /> Nuevo movimiento</button>
        <PendingPaymentsAccess onPaymentSaved={() => void loadMovimientos()} />
        <button type="button" className="movement-refresh" onClick={() => void loadMovimientos()} disabled={loading}
          title="Actualizar movimientos" aria-label="Actualizar movimientos"><MdRefresh /></button>
      </div>
    </header>
    {loadError && <p className="movement-load-error" role="alert">{loadError}</p>}
    {loading && <p className="movement-loading" role="status">Actualizando movimientos…</p>}
    {!loading && !loadError && !years.length && <div className="empty-state"><FaFileInvoiceDollar className="empty-icon" />
      <p>No hay movimientos que coincidan con los filtros.</p></div>}
    <div className="years-container">{years.map(year => <section className="year-section" key={year.year}>
      <div className="year-header">
        <button type="button" className="movement-group-toggle year-title" aria-expanded={expandedYears.has(year.year)}
          onClick={() => toggle(setExpandedYears, year.year)}><MdCalendarMonth /><h2>{year.year || "Sin fecha"}</h2>
          {expandedYears.has(year.year) ? <FaChevronUp /> : <FaChevronDown />}</button>
        <MovementCurrencyTotals totals={year.currencyTotals} />
      </div>
      {expandedYears.has(year.year) && <div className="months-container">{year.months.map(month => <section className="month-section" key={month.monthKey}>
        <div className="month-header">
          <button type="button" className="movement-group-toggle month-title" aria-expanded={expandedMonths.has(month.monthKey)}
            onClick={() => toggle(setExpandedMonths, month.monthKey)}>
            <h3>{month.month ? new Date(2000, month.month - 1).toLocaleDateString("es-PE", { month: "long" }) : "Sin fecha"}</h3>
            <span>{month.files.length} files</span>{expandedMonths.has(month.monthKey) ? <FaChevronUp /> : <FaChevronDown />}
          </button><MovementCurrencyTotals totals={month.currencyTotals} compact />
        </div>
        {expandedMonths.has(month.monthKey) && <div className="files-grid">{month.files.map(file => <article className="file-card" key={file.key}>
          <div className="file-header">
            <button type="button" className="movement-file-toggle" aria-expanded={expandedFiles.has(file.key)}
              onClick={() => toggle(setExpandedFiles, file.key)}>
              <strong>{file.voucher_code}</strong><small>{file.titulo || (file.referencia_voucher_reserva ? (file.referencia_voucher_venta ? "Venta y reserva" : "Voucher de reserva") : file.referencia_voucher_venta ? "Voucher de venta" : "Movimientos")}</small>
              {expandedFiles.has(file.key) ? <FaChevronUp /> : <FaChevronDown />}
            </button>
            <MovementFileActions file={file} busy={busy} onAction={handleFileAction} />
            {file.cotizacion_id && file.referencia_voucher_venta && <QuotationVersionHistory variant="compact" label="Versiones"
              voucher={{ id: file.referencia_voucher_venta, cotizacion_id: file.cotizacion_id, voucher_code: file.voucher_code }} />}
          </div>
          <div className="file-balance-strip"><span>Balance</span><MovementCurrencyTotals totals={file.currencyTotals} compact />
            <small>{file.movimientos.length} movimiento{file.movimientos.length === 1 ? "" : "s"}</small></div>
          {expandedFiles.has(file.key) && <div className="file-details">
            <MovimientosList movimientos={file.movimientos} tipo="todos" showTipoColumn refreshData={loadMovimientos}
              compact showFilters={false} showTotals={false} />
          </div>}
        </article>)}</div>}
      </section>)}</div>}
    </section>)}</div>
    {viewer?.type === "summary" && <VentasSummaryModal isOpen voucher={viewer.data} onClose={() => setViewer(null)} />}
    {viewer?.type === "pdf" && <VentasSummaryPDFModal isOpen voucher={viewer.data} onClose={() => setViewer(null)} />}
    {viewer?.type === "reservation" && <ServiceSummaryModal isOpen reservationVoucher={viewer.data} onClose={() => setViewer(null)} />}
    {viewer?.type === "documents" && <DocumentsManagerModal isOpen voucherId={viewer.data.referencia_voucher_venta}
      voucherCode={viewer.data.voucher_code} onClose={() => setViewer(null)} />}
    {viewer?.type === "accounting" && <FileFormatModal group={viewer.data} exchangeRate={3.5} onClose={() => setViewer(null)} />}
    {showTypeSelector && <div className="modal-overlay">
      <div className="tipo-selector-modal" role="dialog" aria-modal="true" aria-labelledby="movement-type-title">
        <div className="modal-header"><h3 id="movement-type-title">Nuevo movimiento{movementFile ? ` · ${movementFile.voucher_code}` : ""}</h3>
          <button type="button" className="close-btn" aria-label="Cerrar selección" onClick={() => setShowTypeSelector(false)}><FaTimes /></button></div>
        <div className="modal-body"><div className="tipo-buttons">
          {[["ingreso", "Ingreso", "Registrar entrada de dinero"], ["egreso", "Egreso", "Registrar salida de dinero"]].map(([value, label, description]) =>
            <button type="button" className={`tipo-btn ${value}`} key={value} onClick={() => {
              setSelectedType(value as "ingreso" | "egreso"); setShowTypeSelector(false);
            }}><span className="label">{label}</span><span className="description">{description}</span></button>)}
        </div></div>
      </div>
    </div>}
    {selectedType && <MovimientoForm tipo={selectedType} isOpen initialData={movementFile ? movementInitialData(movementFile) : null}
      onClose={closeMovement} onSuccess={handleMovementSaved} />}
  </div>;
}
export default Files;
