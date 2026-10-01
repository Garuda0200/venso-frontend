import { FaTrain, FaRoute } from "react-icons/fa";
import { MdSchedule } from "react-icons/md";
import { trainPickerDetails } from "../utils/trainPickerDetails";

export default function TrainPickerDetails({ wagon, providerName = "" }) {
  const details = trainPickerDetails(wagon);
  return <div className="venso-train-details">
    {providerName && <strong className="venso-train-details__provider">{providerName}</strong>}
    <div className="venso-train-details__route"><FaRoute /><span>{details.origin || "Origen pendiente"}</span><span aria-hidden="true">→</span><span>{details.destination || "Destino pendiente"}</span></div>
    <div className="venso-train-details__schedule"><MdSchedule />
      <span>Salida <strong>{details.departure || "—"}</strong></span><span>Llegada <strong>{details.arrival || "—"}</strong></span>
    </div>
    <div className="venso-train-details__tags"><span><FaTrain />{details.type || "Servicio de tren"}</span>{details.bimodal !== null && <span>{details.bimodal ? "Bimodal · bus + tren" : "Solo tren"}</span>}{details.status && <span>{details.status}</span>}</div>
    {details.extras && <div className="venso-train-details__extras"><strong>Incluye:</strong> {details.extras}</div>}
  </div>;
}
