const MAX_KEY_LENGTH = 128;

const sanitizePart = (value, fallback) => {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
};

const createRandomId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

export const createIdempotencyKey = (scope, resourceId = "request") => {
  const operation = sanitizePart(scope, "mutation");
  const resource = sanitizePart(resourceId, "request");

  return `${operation}:${resource}:${createRandomId()}`.slice(
    0,
    MAX_KEY_LENGTH,
  );
};

export const createClientResourceId = (
  prefix,
  resourceId,
  maxLength = 50,
) => {
  const normalizedPrefix = sanitizePart(prefix, "resource");
  const normalizedResource = sanitizePart(resourceId, "item");
  const randomId = createRandomId().replaceAll("-", "");

  return `${normalizedPrefix}-${normalizedResource}-${randomId}`.slice(
    0,
    maxLength,
  );
};

export const getIdempotencyHeaders = (idempotencyKey) =>
  idempotencyKey
    ? {
        "Idempotency-Key": idempotencyKey,
      }
    : undefined;
