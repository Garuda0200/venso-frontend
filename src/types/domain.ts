export type Identifier = number | string;
export type CurrencyCode = "USD" | "PEN" | string;
export type BusinessType = "B2C" | "B2B" | string;
export type PlatformCode = "venso" | "mil" | "all" | string;

export interface ApiErrorPayload {
  error?: string;
  message?: string;
  details?: unknown;
}

export interface SessionUser {
  id?: Identifier;
  username?: string;
  role?: number | string;
  platform?: PlatformCode;
  business_type?: BusinessType | null;
  permissions?: string[];
  [key: string]: unknown;
}

export interface MoneyValue {
  amount: number;
  currency: CurrencyCode;
}

export interface PaginatedResponse<T> {
  data: T[];
  total?: number;
  page?: number;
  page_size?: number;
  next_page?: number | null;
}
