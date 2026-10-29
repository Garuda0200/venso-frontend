export const normalizeServiceTime = value => {
  const raw=String(value??"").trim();
  // Legacy departure times can include seconds; operational inputs use HH:MM.
  return /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(raw) ? raw.slice(0,5) : null;
};
export const getOperationalTime = (service={},field="hora") => {
  const assigned=service.assignedService||service.assigned_service;
  if(assigned && Object.prototype.hasOwnProperty.call(assigned,field)) return normalizeServiceTime(assigned[field]);
  if(Object.prototype.hasOwnProperty.call(service,field)) return normalizeServiceTime(service[field]);
  return normalizeServiceTime(field==="hora" ? service.assignedHora??service.assigned_hora : service.horaPosterior);
};
export const updateServiceSchedule = (itinerary,dayIndex,serviceIndex,field,value) => {
  if(!["hora","hora_posterior"].includes(field)) return itinerary;
  return itinerary.map((day,index)=>index!==dayIndex?day:{...day,servicios:day.servicios.map((service,index)=>index!==serviceIndex?service:{
    ...service,[field]:normalizeServiceTime(value),
    ...(service.assignedService?{assignedService:{...service.assignedService,[field]:normalizeServiceTime(value)}}:{}),
  })});
};
