import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const compiled = ts.transpileModule(fs.readFileSync("src/proxy.ts", "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
function load(env) {
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require,
    process: { env },
    URL,
    Headers,
  });
  return exports.proxy;
}
test("Reject cross-site and missing origins before forwarding authenticated mutations", () => {
  const proxy = load({ API_ORIGIN: "https://backend.example" });
  for (const origin of ["https://evil.example", "null", ""]) {
    const r = proxy(
      new NextRequest("https://front.example/api/admin/login", {
        method: "POST",
        headers: { origin },
      }),
    );
    assert.equal(r.status, 403);
    assert.equal(r.headers.get("x-middleware-rewrite"), null);
  }
});
test("Same-origin mutation rewrites only to configured EC2 and retains the session cookie", () => {
  const proxy = load({ API_ORIGIN: "https://backend.example" });
  const r = proxy(
    new NextRequest("https://front.example/api/admin/studies?test=1", {
      method: "POST",
      headers: { origin: "https://front.example", cookie: "admin=test-only" },
    }),
  );
  assert.equal(
    r.headers.get("x-middleware-rewrite"),
    "https://backend.example/api/admin/studies?test=1",
  );
  assert.equal(
    r.headers.get("x-middleware-request-origin"),
    "https://backend.example",
  );
  assert.equal(r.headers.get("x-middleware-request-cookie"), "admin=test-only");
});
test("Do not allow insecure non-local upstreams", () => {
  const r = load({ API_ORIGIN: "http://untrusted.example" })(
    new NextRequest("https://front.example/api/health"),
  );
  assert.equal(r.status, 503);
});
test("Keep the existing local API development contract", () => {
  const r = load({})(new NextRequest("http://localhost:3410/api/health"));
  assert.equal(
    r.headers.get("x-middleware-rewrite"),
    "http://127.0.0.1:3411/api/health",
  );
});
