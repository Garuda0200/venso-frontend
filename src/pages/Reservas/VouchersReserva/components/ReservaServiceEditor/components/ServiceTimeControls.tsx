import {useEffect,useState} from "react";
import {MdSchedule} from "react-icons/md";
import {getOperationalTime} from "../../../../../../utils/serviceSchedule";
import "./ServiceTimeControls.scss";

export default function ServiceTimeControls({service,onChange}){
  const type=String(service.assignedService?.typeService||service.typeService||service.tipo_servicio||"").toLowerCase();
  const isTrain=["trenes","tren"].includes(type);
  const arrival=getOperationalTime(service,"hora_posterior");
  const [showArrival,setShowArrival]=useState(Boolean(arrival));
  useEffect(()=>{if(arrival)setShowArrival(true);},[arrival]);
  const toggle=()=>{
    if(showArrival && arrival)onChange("hora_posterior",null);
    setShowArrival(!showArrival);
  };
  return <div className="reservation-service-times">
    <label className="service-time-header"><MdSchedule aria-hidden="true"/><span>{isTrain?"Hora de partida":"Hora"}</span>
      <input type="time" aria-label={isTrain?"Hora de partida":"Hora del servicio"} value={getOperationalTime(service)||""} onChange={event=>onChange("hora",event.target.value)} className="time-input-header"/>
    </label>
    {isTrain && <>
      <button type="button" role="switch" aria-checked={showArrival} className="reservation-service-times__toggle" onClick={toggle}><span aria-hidden="true" className="reservation-service-times__track"/>¿Hay hora de llegada?</button>
      {showArrival && <label className="service-time-header"><span>Hora de llegada</span>
        <input type="time" aria-label="Hora de llegada" value={arrival||""} onChange={event=>onChange("hora_posterior",event.target.value)} className="time-input-header"/>
      </label>}
      {showArrival && !arrival && <small>Opcional. Sin valor no se guarda una hora de llegada.</small>}
    </>}
  </div>;
}
