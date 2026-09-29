import { createAxiosInstance } from "../utils/axiosInstance";

export type AgencyBusinessType = "B2C" | "B2B";
export type AgencyTariffType = "externa" | "interna" | "cotizacion";

export interface Agency {
  id: number;
  code: string;
  name: string;
  business_type: AgencyBusinessType;
  default_tariff_type: AgencyTariffType;
  is_primary: boolean;
  active: boolean;
  branding?: Record<string, unknown>;
  created_at?: string;
  created_by?: string;
  updated_at?: string | null;
  updated_by?: string | null;
}

export interface CreateAgencyInput {
  name: string;
  code?: string;
  business_type?: AgencyBusinessType;
  default_tariff_type?: AgencyTariffType;
  is_primary?: boolean;
  active?: boolean;
  branding?: Record<string, unknown>;
}

const api = () => createAxiosInstance();

const unwrap = <T>(response: { data?: { data?: T } | T }): T => {
  const payload = response.data as { data?: T } | T | undefined;
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
};

export const getAgencies = async (
  includeInactive = false,
): Promise<Agency[]> => {
  const response = await api().get("/turismo/agencias", {
    params: { include_inactive: includeInactive },
  });
  return unwrap<Agency[]>(response) || [];
};

export const getPrimaryAgency = async (): Promise<Agency> => {
  const response = await api().get("/turismo/agencias/primary");
  return unwrap<Agency>(response);
};

export const getAgencyById = async (id: number): Promise<Agency> => {
  const response = await api().get(`/turismo/agencias/${id}`);
  return unwrap<Agency>(response);
};

export const createAgency = async (
  input: CreateAgencyInput,
): Promise<Agency> => {
  const response = await api().post("/turismo/agencias", input);
  return unwrap<Agency>(response);
};

export const updateAgency = async (
  id: number,
  input: Partial<CreateAgencyInput>,
): Promise<Agency> => {
  const response = await api().put(`/turismo/agencias/${id}`, input);
  return unwrap<Agency>(response);
};
