import { MdCheck, MdCloudOff, MdSync, MdWarning } from "react-icons/md";
import { AssignmentSaveState } from "../utils/assignmentSaveQueue";

const copy = { saved: "Cambios guardados", pending: "Cambios pendientes", saving: "Guardando cambios…",
  offline: "Sin conexión · cambios protegidos", error: "No se pudieron guardar los cambios" };
export default function AssignmentSaveStatus({ state, error, onRetry, onDiscard }: {
  state: AssignmentSaveState; error: string; onRetry: () => void; onDiscard?: () => void;
}) {
  return <div className={`assignment-save-status is-${state}`} role="status" aria-live="polite">
    {state === "saved" ? <MdCheck /> : state === "saving" ? <MdSync /> : state === "offline" ? <MdCloudOff /> : <MdWarning />}
    <span>{copy[state]}{error && <small>{error}</small>}</span>
    {["error", "offline", "pending"].includes(state) && <button type="button" onClick={onRetry}>Reintentar</button>}
    {["error", "offline"].includes(state) && onDiscard && <button type="button" onClick={onDiscard}>Descartar y recargar</button>}
  </div>;
}
