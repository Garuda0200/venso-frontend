import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const backendRoot = resolve(process.cwd(), "../venso-tours-backend");
const hasBackendCheckout = existsSync(resolve(backendRoot, ".gitignore"));
// The repositories can be checked out independently in CI. Validate both locally
// when the sibling backend is available; do not require it to test the frontend.
const repositories = [process.cwd(), ...(hasBackendCheckout ? [backendRoot] : [])];
test("plantillas publicables y entornos reales ignorados en ambos repositorios", () => {
  for (const repository of repositories) {
    const files = repository.endsWith("backend") ? [".env.example", ".env.fly.example"] : [".env.example"];
    for (const file of files) {
      const result = spawnSync("git", ["-C", repository, "check-ignore", "--no-index", "--quiet", file]);
      assert.equal(result.status, 1, `${file} debe poder versionarse`);
    }
    for (const file of [".env", ".env.local", ".env.production"]) {
      const result = spawnSync("git", ["-C", repository, "check-ignore", "--no-index", "--quiet", file]);
      assert.equal(result.status, 0, `${file} debe permanecer privado`);
    }
  }
});
test("los valores sensibles de las plantillas backend son marcadores, nunca credenciales reales", { skip: !hasBackendCheckout }, () => {
  const root = backendRoot;
  for (const file of [".env.example", ".env.fly.example"]) {
    for (const line of readFileSync(resolve(root, file), "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (!match || !/SECRET|PASSWORD|TOKEN|KEY|PEPPER/.test(match[1])) continue;
      const isPlaceholder = /REPLACE|YOUR_|CHANGE|TU_|<|^$|^""$/.test(match[2]);
      // Assert a boolean so a failing test never echoes a sensitive value.
      assert.equal(isPlaceholder, true, `${file}: ${match[1]} debe ser un marcador`);
    }
  }
});
