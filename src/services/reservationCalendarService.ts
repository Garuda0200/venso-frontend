import axios from "../utils/axiosInstance";
export const flightCodeService = {
 get: id => axios.get(`/turismo/vouchers-reserva/servicio/${id}/codigo-vuelo`,{_skipDedup:true}).then(response=>response.data),
 update: (id,input) => axios.patch(`/turismo/vouchers-reserva/servicio/${id}/codigo-vuelo`,input).then(response=>response.data),
};
