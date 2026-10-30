import { createContext, useContext } from "react";
import type { Agency } from "../../../../services/agencyService";

export const ServiciosAgencyContext = createContext<{ agencyId: number | null; agencies: Agency[] }>({ agencyId: null, agencies: [] });
export const useServiciosAgency = () => useContext(ServiciosAgencyContext);
