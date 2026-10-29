import React,{useState,useEffect} from "react";
import {flightCode,sameFlight,FLIGHT_METADATA_EVENT} from "../../utils/flightOperationalCode";
import "./FlightCode.scss";
export default function FlightCodeBadge({service}){
 const [value,setValue]=useState(()=>flightCode(service));
 useEffect(()=>setValue(flightCode(service)),[service]);
 useEffect(()=>{const update=e=>{if(sameFlight(service,e.detail))setValue(e.detail.codigo ?? "");};window.addEventListener(FLIGHT_METADATA_EVENT,update);return()=>window.removeEventListener(FLIGHT_METADATA_EVENT,update);},[service]);
 return value?<span className="flight-code-badge">Código de vuelo: <strong>{value}</strong></span>:null;
}
