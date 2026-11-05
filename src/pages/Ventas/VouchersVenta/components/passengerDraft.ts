const text = (value: any) => value == null ? "" : String(value).trim();
const first = (...values: any[]) => text(values.find(value => value !== undefined));
export function normalizePassengerForDraft(p: any = {}, type = "adult", preserveWhitespace = false) {
  const input = (...values: any[]) => preserveWhitespace ? String(values.find(value => value !== undefined) ?? '') : first(...values);
  const surname = first(p.apellidos,p.lastName).split(/\s+/);
  const paternal = input(p.apellido_paterno,p.apellidoPaterno,surname[0]);
  const maternal = input(p.apellido_materno,p.apellidoMaterno,surname.slice(1).join(' '));
  const hasParts = ['apellido_paterno','apellido_materno','apellidoPaterno','apellidoMaterno'].some(key=>p[key]!==undefined);
  return {id:p.id_pasajero ?? p.id ?? p.passenger_key ?? null,id_pasajero:p.id_pasajero ?? p.idPasajero ?? null,id_persona:p.id_persona ?? p.idPersona ?? null,
    nombres:input(p.nombres,p.firstName),apellidos:hasParts ? [paternal,maternal].filter(Boolean).join(' ').trim() : input(p.apellidos,p.lastName),
    apellido_paterno:paternal,apellido_materno:maternal,
    fecha_nacimiento:first(p.fecha_nacimiento,p.birthDate),edad:first(p.edad,p.age),
    nacionalidad:first(p.nacionalidad,p.nationality,p.pais),procedencia:first(p.procedencia),sexo:first(p.sexo,p.genero),
    tipoDocumento:first(p.tipoDocumento,p.tipo_documento,p.docType),numeroDocumento:input(p.numeroDocumento,p.numero_documento,p.docNumber),
    correo:input(p.correo,p.email),telefono:input(p.telefono,p.phone),observaciones:input(p.observaciones,p.notes),
    fecha_caducidad:first(p.fecha_caducidad,p.fechaCaducidad,p.documentExpiry),
    passenger_key:first(p.passenger_key) || `${type}-pending`};
}
export const normalizePassengerData = (data: any = {}, preserveWhitespace = false) => ({
  adults:(data.adults || []).map(p=>normalizePassengerForDraft(p,"adult",preserveWhitespace)),
  children:(data.children || []).map(p=>normalizePassengerForDraft(p,"child",preserveWhitespace)),
});
export const normalizePassengerInput = (data: any) => normalizePassengerData(data,true);
const isChild=(p:any)=>p.tipo_pasajero==="child" || (p.tipo_pasajero!=="adult" && /^child[:-]/i.test(p.passenger_key || ""));
export const passengerRowsToDraft = (rows: any[] = []) => normalizePassengerData({
  adults:rows.filter(p=>!isChild(p)),children:rows.filter(isChild),
});
export const passengerDraftFingerprint = (data: any) => JSON.stringify(normalizePassengerData(data));
export function mergeNominalRoster(quotedRows: any[], voucherData: any) {
  const current = normalizePassengerData(voucherData);
  for (const [group, kind] of [['adults', 'adult'], ['children', 'child']]) {
    const quoted = quotedRows.filter(p => (isChild(p) ? 'child' : 'adult') === kind);
    const linked = current[group];
    const linkedIds = new Set(linked.map(p => Number(p.id_pasajero)).filter(id => id > 0));
    const keyIndex = (row: any) => {
      const match = new RegExp(`^${kind}[-:](\\d+)$`, 'i').exec(text(row.passenger_key));
      return match ? Number(match[1]) : null;
    };
    const zeroBased = linked.some(p => keyIndex(p) === 0);
    const quoteZeroBased = quoted.some(p => keyIndex(p) === 0);
    const slot = (row: any, zero: boolean) => {
      const index = keyIndex(row);
      return index === null ? null : index - (zero ? 0 : 1);
    };
    const occupied = new Set(linked.map(p => slot(p, zeroBased)).filter(index => index !== null));
    for (const row of quoted) {
      if (linkedIds.has(Number(row.id_pasajero)) || row.voucher_venta_id != null) continue;
      const index = slot(row, quoteZeroBased);
      if (index !== null && occupied.has(index)) continue;
      linked.push(normalizePassengerForDraft(row, kind));
      if (Number(row.id_pasajero) > 0) linkedIds.add(Number(row.id_pasajero));
      if (index !== null) occupied.add(index);
    }
  }
  return current;
}
export function toVoucherPassengerSyncPayload(data: any, cotizacion_id: string) {
  const normalized=normalizePassengerData(data);
  const row=(p:any)=>Object.fromEntries(Object.entries({...p,tipo_documento:p.tipoDocumento,numero_documento:p.numeroDocumento})
    .filter(([key])=>!["id","apellido_paterno","apellido_materno","tipoDocumento","numeroDocumento","passenger_key"].includes(key))
    .map(([key,value])=>[key,value===""?null:value]));
  return {cotizacion_id,adults:normalized.adults.map(row),children:normalized.children.map(row)};
}
