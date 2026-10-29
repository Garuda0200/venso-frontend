import React,{useState,useEffect,useRef} from "react";
import {flightCode,flightServiceId,announceFlightMetadata} from "../../utils/flightOperationalCode";
import {flightCodeService} from "../../services/reservationCalendarService";
import {useAuth} from "../../context/AuthContext";
import "./FlightCode.scss";
import FlightCodeBadge from "./FlightCodeBadge";
import {updateReservationMetadataCache} from "../../utils/reservationMetadataCache";
import {registerFlightCodeDraft} from "../../utils/flightCodeDrafts";
export default function FlightCodeField({service}){
 const {auth}=useAuth();const id=flightServiceId(service);
 const [saved,setSaved]=useState(()=>flightCode(service)),[draft,setDraft]=useState(()=>flightCode(service)),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const snapshot=useRef(null),inFlight=useRef(null),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{snapshot.current=null;setSaved(flightCode(service));setDraft(flightCode(service));},[id,service.codigo]);
 const canEdit=[0,3].includes(Number(auth?.role));
 const acquire=()=>{if(!snapshot.current)snapshot.current=flightCodeService.get(id).then(r=>r.data);return snapshot.current;};
 const save=async()=>{
  if(inFlight.current)return inFlight.current;
  const value=draft.trim();if(value===saved)return true;
  if(value.length>50 || /[\u0000-\u001f\u007f]/.test(value)){setError("Usa hasta 50 caracteres sin saltos de línea.");return false;}
  setBusy(true);setError("");
  const work=(async()=>{try{
   const current=await acquire();const result=await flightCodeService.update(id,{codigo:value||null,expected_hash:current.expected_hash});
   snapshot.current=Promise.resolve(result.data);await updateReservationMetadataCache(result.data);announceFlightMetadata(result.data);
   if(mounted.current){setSaved(result.data.codigo||"");setDraft(result.data.codigo||"");}
   return true;
  }catch(e){snapshot.current=null;if(mounted.current)setError(e.response?.data?.message||"No se guardó el código. Actualiza el vuelo e inténtalo de nuevo.");return false;}
  finally{inFlight.current=null;if(mounted.current)setBusy(false);}})();inFlight.current=work;return work;
 };
 const latestSave=useRef(save);latestSave.current=save;
 useEffect(()=>registerFlightCodeDraft(id,()=>latestSave.current()),[id]);
 if(!id)return null;
 if(!canEdit)return <FlightCodeBadge service={service}/>;
 return <div className="flight-code-field"><label>Código de vuelo<input aria-label="Código de vuelo" value={draft} maxLength={50} disabled={busy} placeholder="Opcional" onFocus={()=>{acquire().catch(()=>{snapshot.current=null;});}} onChange={e=>setDraft(e.target.value)} onBlur={save} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();save();}}}/></label>
 {draft.trim()!==saved&&<button type="button" disabled={busy} onClick={save}>{busy?"Guardando…":"Guardar código"}</button>}{error&&<span role="alert">{error}</span>}</div>;
}
