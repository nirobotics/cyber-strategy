import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { checkSources, hash, input, lock, original, current, sourcePaths, repo, run, sidecar, walk } from "./common.mjs";

checkSources();
assert(process.env.PI_SCRATCH_DIR, "PI_SCRATCH_DIR is required");
// The ignored mirror points to scratch: no duplicate business source in delivery.
const mirror = resolve(process.env.PI_SCRATCH_DIR, "strategy-build-input");
rmSync(input, { recursive: true, force: true });
rmSync(mirror, { recursive: true, force: true });
mkdirSync(mirror, { recursive: true });
symlinkSync(mirror, input, "dir");
for (const path of sourcePaths) {
  const dest = resolve(input, path);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, current(path));
}
symlinkSync(resolve(repo, "node_modules"), resolve(input, "node_modules"), "dir");
writeFileSync(resolve(input, "react-router.config.ts"), `import type { Config } from "@react-router/dev/config";
export default { ssr: true, routeDiscovery: { mode: "initial" } } satisfies Config;
`);
writeFileSync(resolve(input, "analytics-noop.ts"), "// Preview only: no analytics scripts or network requests.\nexport function Analytics() { return null; }\n");
writeFileSync(resolve(input, "vite.config.ts"), `import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
export default defineConfig({
  envDir: false,
  resolve: { alias: { "@vercel/analytics/react": new URL("./analytics-noop.ts", import.meta.url).pathname } },
  plugins: [tailwindcss(), reactRouter()],
});
`);
const sources = Object.entries(lock.files).filter(([, record]) => record.tailwind).map(([path]) => path);
// Freeze only CSS class discovery, not executable app code. Backend/test words
// must not introduce incidental utilities; reviewed UI uses existing classes.
for (const path of sources) { const dest = resolve(input, ".tailwind-source", path); mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, original(path)); }
const css = original("app/app.css").toString();
assert(css.startsWith('@import "tailwindcss";'));
writeFileSync(resolve(input, "app/app.css"), css.replace('@import "tailwindcss";',
  '@import "tailwindcss" source(none);\n' + sources.map((path) => `@source "../.tailwind-source/${path}";`).join("\n")));
run(process.execPath, [resolve(repo, "node_modules/@react-router/dev/bin.js"), "build"], input);
// Pin the complete mirror: only the four enumerated platform transformations.
const transformed = new Set(["react-router.config.ts", "vite.config.ts", "app/app.css"]);
for (const [path, record] of Object.entries(lock.files))
  if (!transformed.has(path)) assert.equal(hash(readFileSync(resolve(input, path))), hash(current(path)), `Mirror byte gate: ${path}`);
const client = resolve(input, "build/client");
for (const path of walk(client)) {
  const name = relative(client, path);
  if (name.split("/").some((part) => part.startsWith(".")) || name.endsWith(".map")) rmSync(path);
}
const mime = { js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", png: "image/png", webp: "image/webp" };
const assets = Object.fromEntries(walk(client).map((path) => {
  const name = "/" + relative(client, path), bytes = readFileSync(path);
  const type = mime[name.split(".").at(-1)];
  assert(type, `Unexpected browser asset ${name}`);
  return [name, { sha256: hash(bytes), bytes: bytes.length, mime: type }];
}));
const sheets = Object.entries(assets).filter(([name]) => name.endsWith(".css"));
assert.equal(sheets.length, 1);
assert.equal(sheets[0][1].sha256, lock.css.sha256, "CSS byte gate (never refresh baseline automatically)");
assert.equal(sheets[0][1].bytes, lock.css.bytes);
for (const [path, record] of Object.entries(lock.files).filter(([name]) => name.startsWith("public/")))
  assert.equal(assets["/" + path.slice(7)]?.sha256, hash(current(path)), `Public byte gate: ${path}`);
mkdirSync(resolve(sidecar, ".required-tool-outputs"), { recursive: true });
writeFileSync(resolve(sidecar, ".required-tool-outputs/assets.json"), JSON.stringify(assets, null, 2) + "\n");
const serverFiles = Object.fromEntries(walk(resolve(input, "build/server")).map((path) => [relative(input, path), hash(readFileSync(path))]));
writeFileSync(resolve(sidecar, ".required-tool-outputs/build.json"), JSON.stringify({ base: lock.base, assets, serverFiles }, null, 2) + "\n");
for (const name of [".env", ".env.local", ".env.production"]) assert(!existsSync(resolve(input, name)));
checkSources();
console.log(`Preview SSR built; ${Object.keys(assets).length} exact assets; CSS ${lock.css.bytes} bytes / ${lock.css.sha256}`);
