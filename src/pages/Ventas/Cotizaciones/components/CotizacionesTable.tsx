import React, { useEffect, useMemo, useState } from "react";
import CotizacionTableRow from "./CotizacionTableRow";
import PredecesoresExpander from "./PredecesoresExpander";
import { useAgencyDirectory } from "../../../../hooks/useAgencyDirectory";
import { paginateQuotationAgencyGroups } from "../../../../utils/quotationAgencyGroups";
import { AgencyGroupLabel } from "../../../../components/common/AgencyGroups/AgencyGroups";
import "../../../../components/common/AgencyGroups/AgencyGroups.scss";
import "./styles/CotizacionesTable.scss";

const CotizacionesTable = ({
  cotizaciones,
  allCotizacionesWithInactive = [],
  selectedCotizacion,
  expandedActionsId,
  expandedPdfId,
  userRole,
  currentSellerDni = "",
  showAuditColumn = false,
  onToggleActions,
  onTogglePdf,
  onEdit,
  onRequestPostSaleEdit,
  onCancelPostSaleRequest,
  postSaleRequestsByCotizacion = {},
  onDuplicateModel,
  onSummary,
  onAgencyPayment,
  onPreLiquidacion,
  onVoucherMedia,
  onViewServices,
  onVoucher,
  onDelete,
  onRowClick,
  onPdfPreview,
  onEditExternalItinerary,
  onTriggerN8N,
  processingN8NId,
  onPdfClose,
  onActionsClose,
  formatDate,
  formatCurrency,
  calculateTotalFinal,
  deletePopover,
  onCancelDelete,
  onRefresh,
  loadSummaryPricingData,
  quotationStatus = "open",
  historyTargetId = null,
  onHistoryTargetConsumed,
}) => {
  const [historyCotizacion, setHistoryCotizacion] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const { data: agencies = [] } = useAgencyDirectory();
  const normalizedCotizaciones = Array.isArray(cotizaciones) ? cotizaciones : [];
  const openCotizaciones = useMemo(
    () => normalizedCotizaciones.filter((item) => item.tiene_voucher !== true),
    [normalizedCotizaciones],
  );
  const soldCotizaciones = useMemo(
    () => normalizedCotizaciones.filter((item) => item.tiene_voucher === true),
    [normalizedCotizaciones],
  );
  const visibleCotizaciones =
    quotationStatus === "sold" ? soldCotizaciones : openCotizaciones;
  const pageCount = Math.max(1, Math.ceil(visibleCotizaciones.length / pageSize));
  const pagedGroups = useMemo(
    () => paginateQuotationAgencyGroups(visibleCotizaciones, agencies, page, pageSize),
    [page, pageSize, visibleCotizaciones, agencies],
  );

  useEffect(() => {
    setPage(1);
  }, [quotationStatus, pageSize, normalizedCotizaciones.length]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  useEffect(() => {
    if (!historyTargetId) return;

    const target = [...allCotizacionesWithInactive, ...normalizedCotizaciones].find(
      (cotizacion) => String(cotizacion?.id) === String(historyTargetId),
    );

    if (!target) return;
    setHistoryCotizacion(target);
    onHistoryTargetConsumed?.();
  }, [
    allCotizacionesWithInactive,
    historyTargetId,
    normalizedCotizaciones,
    onHistoryTargetConsumed,
  ]);

  return (
    <>
      <div className="cotizaciones-table-container">
        <table className="cotizaciones-table">
        <thead>
          <tr>
            <th className="col-titulo">Título</th>
            <th className="col-detalles">Detalles</th>
            {showAuditColumn && (
              <th className="col-audit">Plataforma / Creado</th>
            )}
            <th className="col-acciones">Acciones</th>
          </tr>
        </thead>
          {pagedGroups.map((group) => (
            <tbody key={group.key} aria-label={group.name}>
              <tr className="quotation-agency-row">
                <th scope="rowgroup" colSpan={showAuditColumn ? 4 : 3}>
                  <AgencyGroupLabel name={group.name} count={group.items.length} totalCount={group.totalCount} noun="cotizaciones" />
                </th>
              </tr>
              {group.items.map((cotizacion) => (
            <CotizacionTableRow
              key={cotizacion.id || cotizacion.fecha}
              cotizacion={cotizacion}
              isSelected={selectedCotizacion?.id === cotizacion.id}
              isInactive={!cotizacion.is_active}
              expandedActionsId={expandedActionsId}
              expandedPdfId={expandedPdfId}
              userRole={userRole}
              currentSellerDni={currentSellerDni}
              showAuditColumn={showAuditColumn}
              onRowClick={() => onRowClick(cotizacion)}
              onToggleActions={(e) => onToggleActions(cotizacion.id, e)}
              onTogglePdf={(e) => onTogglePdf(cotizacion.id, e)}
              onEdit={() => onEdit(cotizacion)}
              postSaleEditRequest={
                postSaleRequestsByCotizacion[String(cotizacion.id)] || null
              }
              onRequestPostSaleEdit={() => onRequestPostSaleEdit(cotizacion)}
              onCancelPostSaleRequest={(request) =>
                onCancelPostSaleRequest(request)
              }
              onDuplicateModel={() => onDuplicateModel(cotizacion)}
              onSummary={() => onSummary(cotizacion)}
              onPreLiquidacion={onPreLiquidacion ? () => onPreLiquidacion(cotizacion) : undefined}
              onAgencyPayment={
                onAgencyPayment ? () => onAgencyPayment(cotizacion) : undefined
              }
              onVoucherMedia={
                onVoucherMedia ? () => onVoucherMedia(cotizacion) : undefined
              }
              onViewServices={() => onViewServices(cotizacion)}
              onVoucher={() => onVoucher(cotizacion)}
              onDelete={() => onDelete(cotizacion.id)}
              onPdfPreview={() => {
                onPdfPreview(cotizacion);
                onPdfClose();
              }}
              onEditExternalItinerary={() =>
                onEditExternalItinerary(cotizacion)
              }
              onTriggerN8N={() => onTriggerN8N(cotizacion)}
              onHistory={() => setHistoryCotizacion(cotizacion)}
              isProcessingN8N={processingN8NId === cotizacion.id}
              onActionsClose={onActionsClose}
              onPdfClose={onPdfClose}
              formatDate={formatDate}
              formatCurrency={formatCurrency}
              calculateTotalFinal={calculateTotalFinal}
              deletePopover={deletePopover}
              onCancelDelete={onCancelDelete}
              loadSummaryPricingData={loadSummaryPricingData}
            />
              ))}
            </tbody>
          ))}
          {visibleCotizaciones.length === 0 && (
            <tbody>
            <tr>
              <td colSpan={showAuditColumn ? 4 : 3} className="empty-quotation-state">
                No hay cotizaciones en esta categoría.
              </td>
            </tr>
            </tbody>
          )}
        </table>
        {visibleCotizaciones.length > 0 && (
          <div className="quotation-pagination" aria-label="Paginación de cotizaciones">
            <span>
              Mostrando {(page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, visibleCotizaciones.length)} de {visibleCotizaciones.length}
            </span>
            <div className="quotation-pagination__controls">
              <label>
                Filas
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
              >
                Anterior
              </button>
              <strong>{page} / {pageCount}</strong>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                disabled={page >= pageCount}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
      {historyCotizacion && (
        <PredecesoresExpander
          key={historyCotizacion.id}
          cotizacion={historyCotizacion}
          formatDate={formatDate}
          formatCurrency={formatCurrency}
          calculateTotalFinal={calculateTotalFinal}
          userRole={userRole}
          onRefresh={onRefresh}
          modalMode
          onClose={() => setHistoryCotizacion(null)}
        />
      )}
    </>
  );
};

export default CotizacionesTable;
