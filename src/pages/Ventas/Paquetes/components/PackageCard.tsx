import {
  MdEdit,
  MdDelete,
  MdEditCalendar,
  MdLock,
  MdPublic,
  MdStar,
  MdStarOutline,
  MdCardTravel,
} from "react-icons/md";
import { formatCurrency } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/formatters";
import { getProxyUrl } from "../../../../services/presignedUrlService";
import "./PackageCard.scss";

const PackageCard = ({
  pkg,
  onEditItinerary,
  onEdit,
  onToggleFeatured,
  onDelete,
  getDisplayPrice,
}) => (
  <article
    className={`paq__row${pkg.destacado ? " paq__row--featured" : ""}`}
  >
    <div className="paq__row-media" aria-hidden="true">
      {pkg.imagen ? (
        <img src={getProxyUrl(pkg.imagen)} alt="" loading="lazy" />
      ) : (
        <MdCardTravel />
      )}
    </div>

    <div className="paq__row-copy">
      <div className="paq__row-heading">
        <h3>{pkg.nombre}</h3>
        {pkg.destacado && (
          <span className="paq__row-featured">
            <MdStar /> Destacado
          </span>
        )}
      </div>
      <p>{pkg.descripcion || "Paquete sin descripción registrada."}</p>
      <div className="paq__row-meta">
        <span>{pkg.packagetype === "compartido" ? "Compartido" : "Privado"}</span>
        <span>
          {pkg.es_general ? <MdPublic /> : <MdLock />}
          {pkg.es_general ? "Catálogo general" : "Catálogo personal"}
        </span>
        <span>
          {pkg.itinerario?.length || 0} día
          {pkg.itinerario?.length === 1 ? "" : "s"}
        </span>
        {pkg.fee != null && Number.isFinite(Number(pkg.fee)) && (
          <span className="paq__chip paq__chip--fee">Fee {Number(pkg.fee)}%</span>
        )}
      </div>
    </div>

    <div className="paq__row-price">
      <span>Valor referencial</span>
      <strong>{formatCurrency(getDisplayPrice(pkg))}</strong>
    </div>

    <div className="paq__row-actions" aria-label={`Acciones para ${pkg.nombre}`}>
      <button
        type="button"
        onClick={() => onEditItinerary(pkg)}
        title="Editar itinerario"
        aria-label="Editar itinerario"
      >
        <MdEditCalendar />
      </button>
      <button
        type="button"
        onClick={() => onEdit(pkg)}
        title="Editar paquete"
        aria-label="Editar paquete"
      >
        <MdEdit />
      </button>
      <button
        type="button"
        className={pkg.destacado ? "is-active" : ""}
        onClick={() => onToggleFeatured(pkg)}
        title={pkg.destacado ? "Quitar de destacados" : "Destacar"}
        aria-label={pkg.destacado ? "Quitar de destacados" : "Destacar"}
      >
        {pkg.destacado ? <MdStarOutline /> : <MdStar />}
      </button>
      <button
        type="button"
        className="is-danger"
        onClick={() => onDelete(pkg)}
        title="Eliminar paquete"
        aria-label="Eliminar paquete"
      >
        <MdDelete />
      </button>
    </div>
  </article>
);

export default PackageCard;
