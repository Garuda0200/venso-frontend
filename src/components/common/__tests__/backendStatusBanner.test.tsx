import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import BackendStatusCard from "../BackendStatusCard";

const renderCard = (isAuthenticated = true, isRetrying = false) =>
  renderToStaticMarkup(<BackendStatusCard isAuthenticated={isAuthenticated} isRetrying={isRetrying} onRetry={() => {}} />);
const source = (file: string) => readFileSync(resolve(process.cwd(), "src/components/common", file), "utf8");

test("diálogo compacto con marca Venso y una sola acción de recuperación", () => {
  const html = renderCard();
  assert.match(html, /alt="Venso Tours"/);
  assert.match(html, /wordmark-blanco\.webp/);
  assert.match(html, /Conexión en pausa/);
  assert.match(html, /Reconectar ahora/);
  assert.equal((html.match(/<button/g) || []).length, 1);
  assert.doesNotMatch(html, /robot|status-grid|fuera de línea/);
});

test("la sesión se describe correctamente para usuarios autenticados y visitantes", () => {
  assert.match(renderCard(true), /Tu sesión se mantiene abierta/);
  assert.doesNotMatch(renderCard(false), /Tu sesión se mantiene abierta/);
  assert.match(renderCard(false), /El acceso estará disponible al reconectar/);
});

test("reintento en curso anuncia su estado sin perder el botón enfocable", () => {
  const html = renderCard(true, true);
  assert.match(html, /Reconectando/);
  assert.match(html, /Intentando reconectar…/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /aria-busy="true"/);
  assert.doesNotMatch(html, /\sdisabled=""|Reconectar ahora/);
  assert.match(renderCard(), /aria-disabled="false"/);
  assert.match(source("BackendStatusCard.tsx"), /if \(!isRetrying\) onRetry\(\)/);
});

test("diálogo accesible con título, descripción y estado anunciado", () => {
  const html = renderCard();
  assert.match(html, /role="alertdialog"/);
  assert.match(html, /aria-modal="true"/);
  const titleId = html.match(/aria-labelledby="([^"]+)"/)?.[1];
  const descriptionIds = html.match(/aria-describedby="([^"]+)"/)?.[1].split(" ") || [];
  assert.ok(titleId);
  assert.ok(html.includes(`id="${titleId}"`));
  assert.equal(descriptionIds.length, 2);
  descriptionIds.forEach((id) => assert.ok(html.includes(`id="${id}"`)));
  assert.match(html, /role="status" aria-live="polite"/);
});

test("recuperación conserva el wake compartido, la visibilidad y el foco", () => {
  const controller = source("BackendStatusBanner.tsx");
  assert.match(controller, /!auth.loading && !auth.backendAvailable/);
  assert.match(controller, /await wakeBackend\("manual"\)/);
  assert.match(controller, /if \(retryInFlight.current\) return/);
  assert.match(controller, /previousFocus\?\.isConnected/);
  assert.match(controller, /document.body.style.overflow = previousOverflow/);
  assert.match(controller, /event.key === "Tab"/);
  assert.doesNotMatch(controller, /setInterval|setTimeout|fetch\(|location.reload/);
});

test("diseño magenta responsive permite scroll en pantallas bajas y movimiento reducido", () => {
  const styles = source("BackendStatusBanner.scss");
  assert.match(styles, /--venso-magenta, #ff007e/);
  assert.match(styles, /width: min\(480px, 100%\)/);
  assert.match(styles, /overflow-y: auto/);
  assert.match(styles, /margin: auto/);
  assert.match(styles, /min-height: 48px/);
  assert.match(styles, /max-width: 480px/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /focus-visible/);
  assert.doesNotMatch(styles, /#006b4f|#008a65|__robot|__glow/);
});
