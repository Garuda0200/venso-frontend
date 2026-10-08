const text = (value: any) => value == null ? "" : String(value).trim();
const first = (...values: any[]) => text(values.find(value => value !== undefined));
export function normalizePassengerForDraft(p: any = {}, type = "adult") {
  return {id_pasajero:p.id_pasajero ?? p.idPasajero ?? null,id_persona:p.id_persona ?? p.idPersona ?? null,
    nombres:first(p.nombres,p.firstName),apellidos:first(p.apellidos,p.lastName),
    fecha_nacimiento:first(p.fecha_nacimiento,p.birthDate),edad:first(p.edad,p.age),
    nacionalidad:first(p.nacionalidad,p.nationality,p.pais),procedencia:first(p.procedencia),sexo:first(p.sexo,p.genero),
    tipoDocumento:first(p.tipoDocumento,p.tipo_documento,p.docType),numeroDocumento:first(p.numeroDocumento,p.numero_documento,p.docNumber),
    correo:first(p.correo,p.email),telefono:first(p.telefono,p.phone),observaciones:first(p.observaciones,p.notes),
    passenger_key:first(p.passenger_key) || `${type}-pending`};
}
export const normalizePassengerData = (data: any = {}) => ({
  adults:(data.adults || []).map(p=>normalizePassengerForDraft(p,"adult")),
  children:(data.children || []).map(p=>normalizePassengerForDraft(p,"child")),
});
const isChild=(p:any)=>p.tipo_pasajero==="child" || (p.tipo_pasajero!=="adult" && /^child[:-]/i.test(p.passenger_key || ""));
export const passengerRowsToDraft = (rows: any[] = []) => normalizePassengerData({
  adults:rows.filter(p=>!isChild(p)),children:rows.filter(isChild),
});
export const passengerDraftFingerprint = (data: any) => JSON.stringify(normalizePassengerData(data));
export function mergeNominalRoster(quotedRows: any[], voucherData: any) {
  const current=normalizePassengerData(voucherData);
  if(!quotedRows.length)return current;
  const byId=new Map([...current.adults,...current.children].filter(p=>p.id_pasajero!=null).map(p=>[Number(p.id_pasajero),p]));
  return passengerRowsToDraft(quotedRows.map(row=>({...row,...byId.get(Number(row.id_pasajero)),tipo_pasajero:row.tipo_pasajero})));
}
export function toVoucherPassengerSyncPayload(data: any, cotizacion_id: string) {
  const normalized=normalizePassengerData(data);
  const row=(p:any)=>Object.fromEntries(Object.entries({...p,tipo_documento:p.tipoDocumento,numero_documento:p.numeroDocumento})
    .filter(([key])=>!["tipoDocumento","numeroDocumento","passenger_key"].includes(key))
    .map(([key,value])=>[key,value===""?null:value]));
  return {cotizacion_id,adults:normalized.adults.map(row),children:normalized.children.map(row)};
}
