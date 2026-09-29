import test from "node:test";
import assert from "node:assert/strict";
import {
  clearCsrfToken,
  ensureCsrfToken,
  getCsrfToken,
  isCsrfMismatchResponse,
  refreshCsrfToken,
} from "../csrfToken.js";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  clearCsrfToken();
  globalThis.fetch = originalFetch;
});

test("refreshCsrfToken recupera el token usando la cookie de sesión", async () => {
  let receivedUrl = null;
  let receivedOptions = null;
  globalThis.fetch = async (url, options) => {
    receivedUrl = url;
    receivedOptions = options;
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, csrf_token: "csrf-restored" }),
    };
  };

  const token = await refreshCsrfToken("/api/auth/verify");

  assert.equal(token, "csrf-restored");
  assert.equal(getCsrfToken(), "csrf-restored");
  assert.equal(receivedUrl, "/api/auth/verify");
  assert.equal(receivedOptions.credentials, "include");
  assert.equal(receivedOptions.cache, "no-store");
});

test("las recuperaciones CSRF concurrentes comparten una sola verificación", async () => {
  let fetchCount = 0;
  let releaseFetch;
  const pending = new Promise((resolve) => {
    releaseFetch = resolve;
  });

  globalThis.fetch = async () => {
    fetchCount += 1;
    await pending;
    return {
      ok: true,
      status: 200,
      json: async () => ({ csrf_token: "csrf-shared" }),
    };
  };

  const first = refreshCsrfToken("/api/auth/verify");
  const second = refreshCsrfToken("/api/auth/verify");
  releaseFetch();

  assert.deepEqual(await Promise.all([first, second]), ["csrf-shared", "csrf-shared"]);
  assert.equal(fetchCount, 1);
});

test("ensureCsrfToken reutiliza el token ya cargado", async () => {
  globalThis.fetch = async () => {
    throw new Error("fetch no debe ejecutarse");
  };

  // Se carga de forma explícita para comprobar la ruta de memoria.
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ csrf_token: "csrf-cached" }),
  });
  await refreshCsrfToken("/api/auth/verify");

  globalThis.fetch = async () => {
    throw new Error("fetch no debe ejecutarse con token en memoria");
  };
  assert.equal(await ensureCsrfToken("/api/auth/verify"), "csrf-cached");
});

test("detecta únicamente el 403 recuperable de CSRF", () => {
  assert.equal(
    isCsrfMismatchResponse({
      response: {
        status: 403,
        data: { error_code: "csrf_token_mismatch" },
      },
    }),
    true,
  );
  assert.equal(
    isCsrfMismatchResponse({
      response: { status: 403, data: { message: "Token CSRF inválido" } },
    }),
    true,
  );
  assert.equal(
    isCsrfMismatchResponse({ response: { status: 403, data: { message: "Sin permiso" } } }),
    false,
  );
  assert.equal(isCsrfMismatchResponse({ response: { status: 401 } }), false);
});
