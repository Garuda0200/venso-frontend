import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaBarcode,
  FaCamera,
  FaPlus,
  FaSyncAlt,
  FaTimes,
} from "react-icons/fa";
import LoadingSpinner from "../../../components/LoadingSpinner";
import patrimonioService from "../../../services/patrimonioService";
import { CATEGORY_DEFINITIONS } from "./constants";
import { getResponseData, itemName } from "./utils";
import ConfirmModal from "./components/ConfirmModal";
import DetailModal from "./components/DetailModal";
import FiltersToolbar from "./components/FiltersToolbar";
import ItemFormModal from "./components/ItemFormModal";
import ItemsMobileCards from "./components/ItemsMobileCards";
import ItemsTable from "./components/ItemsTable";
import MetricCards from "./components/MetricCards";
import Pagination from "./components/Pagination";
import ScannerModal from "./components/ScannerModal";
import "./Patrimonio.scss";

const EMPTY_FILTERS = {
  q: "",
  categoria: "",
  estado: "",
  ubicacion: "",
  responsable: "",
  include_inactive: false,
};

const EMPTY_SUMMARY = {
  total: 0,
  activos: 0,
  asignados: 0,
  sin_asignar: 0,
  mantenimiento: 0,
  observados: 0,
  categorias: 0,
};

export default function Patrimonio() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState(
    CATEGORY_DEFINITIONS.map(({ value }) => value),
  );
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [pageInfo, setPageInfo] = useState({ page: 1, page_size: 25, total: 0 });
  const [loading, setLoading] = useState(true);
  const [formState, setFormState] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [notice, setNotice] = useState("");

  const normalizedCategories = useMemo(
    () => [...new Set([...CATEGORY_DEFINITIONS.map(({ value }) => value), ...categories])],
    [categories],
  );

  const loadData = useCallback(async (page = 1, activeFilters = filters) => {
    setLoading(true);
    const params = {
      ...activeFilters,
      page,
      page_size: pageInfo.page_size,
    };
    Object.keys(params).forEach((key) => {
      if (params[key] === "" || params[key] === false) delete params[key];
    });

    const [itemsResponse, categoriesResponse, summaryResponse] = await Promise.all([
      patrimonioService.listItems(params),
      patrimonioService.listCategories(),
      patrimonioService.getSummary(),
    ]);

    const listData = getResponseData(itemsResponse, {});
    setItems(listData?.items || []);
    setPageInfo((current) => ({
      page: listData?.page || page,
      page_size: listData?.page_size || current.page_size,
      total: listData?.total || 0,
    }));

    const categoryData = getResponseData(categoriesResponse, []);
    if (Array.isArray(categoryData)) setCategories(categoryData);
    setSummary(getResponseData(summaryResponse, EMPTY_SUMMARY) || EMPTY_SUMMARY);
    setLoading(false);
  }, [filters, pageInfo.page_size]);

  useEffect(() => {
    const timeout = setTimeout(() => loadData(1, filters), filters.q ? 320 : 0);
    return () => clearTimeout(timeout);
  }, [filters, loadData]);

  const handleFilterChange = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPageInfo((current) => ({ ...current, page: 1 }));
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setPageInfo((current) => ({ ...current, page: 1 }));
  };

  const handleDetected = async (code) => {
    setScannerOpen(false);
    const response = await patrimonioService.findByBarcode(code);
    const foundItem = getResponseData(response);
    if (foundItem) {
      setDetailItem(foundItem);
      setNotice(`Código ${foundItem.codigo} encontrado.`);
    } else {
      setFormState({ item: null, initialCode: code });
      setNotice(`El código ${code} no existe. Completa el nuevo registro.`);
    }
  };

  const onSaved = async (savedItem) => {
    setFormState(null);
    setDetailItem(savedItem || null);
    setNotice("Ficha patrimonial guardada correctamente.");
    await loadData(1, filters);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const response = await patrimonioService.deleteItem(deleteTarget.id);
    if (response?.success !== false) {
      setNotice(`${itemName(deleteTarget)} fue desactivado y mantiene todo su historial.`);
      if (detailItem?.id === deleteTarget.id) setDetailItem(null);
      setDeleteTarget(null);
      await loadData(pageInfo.page, filters);
    }
  };

  const handlePageChange = (page) => {
    setPageInfo((current) => ({ ...current, page }));
    loadData(page, filters);
  };

  const handleMovementCreated = async (updatedItem) => {
    if (updatedItem) setDetailItem(updatedItem);
    setNotice("Movimiento patrimonial registrado en el historial.");
    await loadData(pageInfo.page, filters);
  };

  return (
    <div className="patrimonio-page">
      <header className="patrimonio-header">
        <div className="patrimonio-header-text">
          <span className="patrimonio-eyebrow">Almacén · Control de activos</span>
          <h1>Patrimonio tecnológico</h1>
          <p>
            Administra equipos y componentes con códigos Code 128, atributos flexibles,
            responsables e historial completo de custodia.
          </p>
        </div>
        <div className="patrimonio-header-actions">
          <button type="button" className="patrimonio-ghost-btn" onClick={() => loadData(pageInfo.page, filters)}>
            <FaSyncAlt /> Actualizar
          </button>
          <button type="button" className="patrimonio-scan-btn" onClick={() => setScannerOpen(true)}>
            <FaCamera /> Escanear Code 128
          </button>
          <button
            type="button"
            className="patrimonio-primary-btn"
            onClick={() => setFormState({ item: null })}
          >
            <FaPlus /> Registrar bien
          </button>
        </div>
      </header>

      <section className="patrimonio-source-banner">
        <div><FaBarcode /></div>
        <p>
          <strong>Inventario estructurado por categoría.</strong> CPU, celulares, monitores,
          teclados, mouse, periféricos, red, cables y demás componentes conservan sus
          características dentro de <code>info</code>, sin depender de columnas de valor.
        </p>
      </section>

      {notice && (
        <div className="patrimonio-notice">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")}><FaTimes /></button>
        </div>
      )}

      <MetricCards summary={summary} />

      <section className="patrimonio-category-strip" aria-label="Categorías rápidas">
        <button
          type="button"
          className={!filters.categoria ? "active" : ""}
          onClick={() => handleFilterChange("categoria", "")}
        >
          Todos
        </button>
        {normalizedCategories.map((category) => (
          <button
            type="button"
            key={category}
            className={filters.categoria === category ? "active" : ""}
            onClick={() => handleFilterChange("categoria", category)}
          >
            {category}
          </button>
        ))}
      </section>

      <FiltersToolbar
        filters={filters}
        categories={normalizedCategories}
        onChange={handleFilterChange}
        onClear={clearFilters}
      />

      <section className="patrimonio-content-card">
        <div className="patrimonio-list-heading">
          <div>
            <span>Inventario vigente</span>
            <h2>{filters.categoria || "Todos los bienes"}</h2>
          </div>
          <strong>{pageInfo.total} registros</strong>
        </div>

        {loading ? (
          <div className="patrimonio-loading"><LoadingSpinner /></div>
        ) : (
          <>
            <div className="patrimonio-desktop-only">
              <ItemsTable
                items={items}
                onView={setDetailItem}
                onEdit={(selectedItem) => setFormState({ item: selectedItem })}
                onDelete={setDeleteTarget}
              />
            </div>
            <div className="patrimonio-mobile-only">
              <ItemsMobileCards
                items={items}
                onView={setDetailItem}
                onEdit={(selectedItem) => setFormState({ item: selectedItem })}
                onDelete={setDeleteTarget}
              />
            </div>
          </>
        )}
      </section>

      <Pagination pageInfo={pageInfo} onPageChange={handlePageChange} />

      <ScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleDetected}
      />

      {formState && (
        <ItemFormModal
          item={formState.item}
          initialCode={formState.initialCode}
          categories={normalizedCategories}
          onClose={() => setFormState(null)}
          onSaved={onSaved}
        />
      )}

      {detailItem && !formState && (
        <DetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onEdit={(selectedItem) => setFormState({ item: selectedItem })}
          onMovementCreated={handleMovementCreated}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          item={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
