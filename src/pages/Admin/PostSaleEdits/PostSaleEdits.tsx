import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MdCheckCircle, MdClose, MdHistory, MdLockClock, MdRefresh, MdSearch } from "react-icons/md";
import { useAuth } from "../../../context/AuthContext";
import SecureStorage from "../../../utils/secureStorage";
import postSaleEditService from "../../../services/postSaleEditService";
import { canManagePostSaleEditRequests, normalizeUserRole } from "../../Ventas/Cotizaciones/utils/postSaleEditState";
import "./PostSaleEdits.scss";

const FILTERS = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "REVOKED",
  "CANCELLED",
  "CONSUMED",
  "EXPIRED",
  "CONFLICT",
  "ALL",
];

const fmt = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};

const statusLabel = (status) => ({
  PENDING: "Pendiente",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  REVOKED: "Revocada",
  CONSUMED: "Utilizada",
  EXPIRED: "Expirada",
  CANCELLED: "Cancelada",
  CONFLICT: "Conflicto",
}[status] || status || "—");

export default function PostSaleEdits() {
  const { user, auth } = useAuth();
  const rawRole = user?.role ?? auth?.role ?? SecureStorage.getItem("userRole");
  const role = normalizeUserRole(rawRole);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("PENDING");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const query = useQuery({
    queryKey: ["cotizacion-edit-requests", "admin", filter],
    queryFn: () => postSaleEditService.listAll({ status: filter === "ALL" ? "" : filter }),
    enabled: canManagePostSaleEditRequests(role),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchInterval: canManagePostSaleEditRequests(role) ? 30_000 : false,
  });

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["cotizacion-edit-requests"] }),
    [queryClient],
  );

  useEffect(() => {
    const listener = () => refresh();
    window.addEventListener("postSaleEditRequestUpdated", listener);
    return () => window.removeEventListener("postSaleEditRequestUpdated", listener);
  }, [refresh]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const source = Array.isArray(query.data) ? query.data : [];
    if (!needle) return source;
    return source.filter((item) =>
      [
        item.cotizacion_id,
        item.cotizacion_titulo,
        item.requested_by,
        item.requester_name,
        item.reason,
      ].some((value) => String(value || "").toLowerCase().includes(needle)),
    );
  }, [query.data, search]);

  if (auth?.loading) {
    return <div className="post-sale-admin-empty">Validando acceso…</div>;
  }
  if (!canManagePostSaleEditRequests(role)) return <Navigate to="/404" replace />;

  const openDialog = (action, request) => {
    setReason("");
    setDialog({ action, request });
    setMessage(null);
  };

  const closeDialog = () => {
    if (!submitting) setDialog(null);
  };

  const executeDecision = async () => {
    if (!dialog?.request?.id) return;
    const { action, request } = dialog;
    if ((action === "reject" || action === "revoke") && reason.trim().length < 5) {
      setMessage({ type: "error", text: "Indica un motivo de al menos 5 caracteres." });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      if (action === "approve") await postSaleEditService.approve(request.id, reason);
      if (action === "reject") await postSaleEditService.reject(request.id, reason.trim());
      if (action === "revoke") await postSaleEditService.revoke(request.id, reason.trim());
      setDialog(null);
      setMessage({ type: "success", text: action === "approve" ? "Solicitud aprobada." : action === "reject" ? "Solicitud rechazada." : "Autorización revocada." });
      await refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error?.response?.data?.message || error?.message || "La solicitud ya cambió o no pudo procesarse.",
      });
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="post-sale-admin-page">
      <header className="post-sale-admin-header">
        <div>
          <span className="eyebrow">Seguridad postventa</span>
          <h1>Permisos de edición de ventas cerradas</h1>
          <p>Aprueba, rechaza o revoca autorizaciones auditadas. Una aprobación habilita un único guardado y nunca libera asignaciones operacionales.</p>
        </div>
        <button type="button" className="refresh-button" onClick={() => refresh()} disabled={query.isFetching}>
          <MdRefresh /> {query.isFetching ? "Actualizando…" : "Actualizar"}
        </button>
      </header>

      {message && <div className={`post-sale-admin-message ${message.type}`}>{message.text}</div>}

      <section className="post-sale-admin-toolbar">
        <div className="post-sale-status-tabs" role="tablist">
          {FILTERS.map((item) => (
            <button key={item} type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
              {item === "ALL" ? "Todas" : statusLabel(item)}
            </button>
          ))}
        </div>
        <label className="post-sale-search">
          <MdSearch />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cotización, vendedor o motivo" />
        </label>
      </section>

      <section className="post-sale-admin-list" aria-busy={query.isLoading}>
        {query.isLoading ? (
          <div className="post-sale-admin-empty">Cargando solicitudes…</div>
        ) : query.isError ? (
          <div className="post-sale-admin-empty error">No se pudieron cargar las solicitudes.</div>
        ) : rows.length === 0 ? (
          <div className="post-sale-admin-empty">No hay solicitudes para este filtro.</div>
        ) : (
          rows.map((request) => (
            <article className="post-sale-request-card" key={request.id}>
              <div className="post-sale-request-card__main">
                <div className="post-sale-request-card__title">
                  <span className={`status-pill status-${String(request.status || "").toLowerCase()}`}>{statusLabel(request.status)}</span>
                  <strong>{request.cotizacion_id}</strong>
                  <span>{request.cotizacion_titulo || "Cotización"}</span>
                </div>
                <div className="post-sale-request-card__grid">
                  <div><small>Solicitante</small><strong>{request.requester_name || request.requested_by}</strong><span>{request.requested_by}</span></div>
                  <div><small>Solicitada</small><strong>{fmt(request.requested_at)}</strong><span>Versión base {request.request_base_version}</span></div>
                  <div><small>Revisión</small><strong>{request.reviewer_name || request.reviewed_by || (request.status === "APPROVED" ? "Aprobación automática" : "Pendiente")}</strong><span>{request.reviewed_at ? fmt(request.reviewed_at) : "Sin decisión"}</span></div>
                  {request.revoked_at && <div><small>Revocada por</small><strong>{request.revoker_name || request.revoked_by || "Superadmin"}</strong><span>{fmt(request.revoked_at)}</span></div>}
                  <div><small>Vigencia</small><strong>{request.expires_at ? fmt(request.expires_at) : "—"}</strong><span>{request.approved_version ? `Versión autorizada ${request.approved_version}` : "Sin autorización"}</span></div>
                </div>
                <div className="post-sale-request-card__reason"><small>Motivo solicitado</small><p>{request.reason}</p></div>
                {request.review_reason && <div className="post-sale-request-card__review"><small>Motivo de decisión</small><p>{request.review_reason}</p></div>}
                {request.revoke_reason && <div className="post-sale-request-card__review"><small>Motivo de revocación</small><p>{request.revoke_reason}</p></div>}
              </div>
              <div className="post-sale-request-card__actions">
                {request.status === "PENDING" && (
                  <>
                    <button type="button" className="approve" onClick={() => openDialog("approve", request)}><MdCheckCircle /> Aprobar</button>
                    <button type="button" className="reject" onClick={() => openDialog("reject", request)}><MdClose /> Rechazar</button>
                  </>
                )}
                {request.status === "APPROVED" && (
                  <button type="button" className="revoke" onClick={() => openDialog("revoke", request)}><MdLockClock /> Revocar</button>
                )}
                {!['PENDING','APPROVED'].includes(request.status) && <span className="terminal-state"><MdHistory /> Estado final auditado</span>}
              </div>
            </article>
          ))
        )}
      </section>

      {dialog && (
        <div className="post-sale-decision-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeDialog()}>
          <div className="post-sale-decision-modal" role="dialog" aria-modal="true">
            <h3>{dialog.action === "approve" ? "Aprobar edición" : dialog.action === "reject" ? "Rechazar solicitud" : "Revocar autorización"}</h3>
            <p><strong>{dialog.request.cotizacion_id}</strong> · {dialog.request.requester_name || dialog.request.requested_by}</p>
            <label>{dialog.action === "approve" ? "Nota de aprobación (opcional)" : "Motivo obligatorio"}</label>
            <textarea rows={4} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} autoFocus placeholder={dialog.action === "approve" ? "Puedes dejar una observación de auditoría." : "Explica la decisión."} />
            <div className="decision-warning">La aprobación dura 45 minutos y permite un único guardado postventa. No habilita asignaciones operativas.</div>
            <footer>
              <button type="button" className="secondary" onClick={closeDialog} disabled={submitting}>Cancelar</button>
              <button type="button" className={dialog.action} onClick={executeDecision} disabled={submitting}>{submitting ? "Procesando…" : "Confirmar"}</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
