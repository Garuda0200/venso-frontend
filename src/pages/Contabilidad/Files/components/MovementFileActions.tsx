import { FaPlus, FaFilePdf } from "react-icons/fa";
import { MdReceipt, MdAttachFile, MdCardTravel, MdTableChart } from "react-icons/md";

export default function MovementFileActions({ file, busy, onAction }: {
  file: any; busy: boolean; onAction: (action: string, file: any) => void;
}) {
  const sale = Boolean(file.referencia_voucher_venta);
  const actions = [
    ...(sale ? [{ key: "summary", title: "Ver resumen de venta", icon: <MdReceipt /> },
      { key: "pdf", title: "Ver PDF del voucher", icon: <FaFilePdf /> },
      { key: "documents", title: "Gestionar documentos", icon: <MdAttachFile /> }] : []),
    { key: "movement", title: "Agregar movimiento a este file", icon: <FaPlus /> },
    ...(file.referencia_voucher_reserva ? [{ key: "reservation", title: "Ver servicios de reserva", icon: <MdCardTravel /> }] : []),
    { key: "accounting", title: "Ver formato contable", icon: <MdTableChart /> },
  ];
  return <div className="file-actions" role="group" aria-label={`Acciones de ${file.voucher_code}`}>
    {actions.map(action => <button type="button" key={action.key} className={`file-action-btn ${action.key}`}
      title={action.title} aria-label={action.title} disabled={busy && ["summary", "pdf", "reservation"].includes(action.key)}
      onClick={() => onAction(action.key, file)}>{action.icon}</button>)}
  </div>;
}
