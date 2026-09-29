import { FaChevronLeft, FaChevronRight } from "react-icons/fa";

export default function Pagination({ pageInfo, onPageChange }) {
  const totalPages = Math.max(
    1,
    Math.ceil(pageInfo.total / pageInfo.page_size),
  );

  return (
    <footer className="patrimonio-pagination">
      <button
        type="button"
        disabled={pageInfo.page <= 1}
        onClick={() => onPageChange(pageInfo.page - 1)}
      >
        <FaChevronLeft /> Anterior
      </button>
      <span>
        Página <strong>{pageInfo.page}</strong> de {totalPages}
        <span className="patrimonio-pagination-total">({pageInfo.total} registros)</span>
      </span>
      <button
        type="button"
        disabled={pageInfo.page >= totalPages}
        onClick={() => onPageChange(pageInfo.page + 1)}
      >
        Siguiente <FaChevronRight />
      </button>
    </footer>
  );
}
