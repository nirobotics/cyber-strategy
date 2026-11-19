// Builds the React Router app (SSR + browser assets) for the Worker.
// The app is copied to a throw-away directory and built there with a Cloudflare-specific
// react-router/vite configuration, so the repository's own Vercel configuration is left alone.
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { hash, input, repo, run, scratch, sidecar, walk } from "./common.mjs";

const mirror = resolve(scratch, "build-input");
rmSync(input, { recursive: true, force: true }); rmSync(mirror, { recursive: true, force: true });
mkdirSync(mirror, { recursive: true }); symlinkSync(mirror, input, "dir");
const skip = (path) => /\.test\.[cm]?[jt]sx?$/.test(path) || path.split("/").some((part) => part.startsWith(".env"));
for (const dir of ["app", "public"]) cpSync(resolve(repo, dir), resolve(input, dir), { recursive: true, filter: (path) => !skip(path) });
for (const file of ["package.json", "tsconfig.json"]) cpSync(resolve(repo, file), resolve(input, file));
symlinkSync(resolve(repo, "node_modules"), resolve(input, "node_modules"), "dir");
writeFileSync(resolve(input, "react-router.config.ts"), 'import type { Config } from "@react-router/dev/config";\nexport default { ssr: true, routeDiscovery: { mode: "initial" } } satisfies Config;\n');
writeFileSync(resolve(input, "analytics-noop.ts"), "// Vercel Analytics is not used on Cloudflare.\nexport function Analytics() { return null; }\n");
writeFileSync(resolve(input, "vite.config.ts"), `import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
export default defineConfig({
  envDir: false,
  resolve: { alias: { "@vercel/analytics/react": new URL("./analytics-noop.ts", import.meta.url).pathname } },
  plugins: [tailwindcss(), reactRouter()],
});
`);
// Tailwind reads class names from the app sources only (explicit, so the browser and server builds agree).
const css = resolve(input, "app/app.css"), sheet = readFileSync(css, "utf8");
if (sheet.includes('@import "tailwindcss";')) writeFileSync(css, sheet.replace('@import "tailwindcss";', '@import "tailwindcss" source(none);\n@source "./";'));
run(process.execPath, [resolve(repo, "node_modules/@react-router/dev/bin.js"), "build"], input);

const client = resolve(input, "build/client");
for (const path of walk(client)) {
  const name = relative(client, path);
  if (name.split("/").some((part) => part.startsWith(".")) || name.endsWith(".map")) rmSync(path);
}
// The Worker serves exactly the files listed here, with these content types.
const mimes = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".wasm": "application/wasm", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2" };
const assets = Object.fromEntries(walk(client).map((path) => {
  const name = "/" + relative(client, path), bytes = readFileSync(path), mime = mimes[extname(name)];
  if (!mime) throw new Error(`No content type known for ${name}: add its extension to scripts/build.mjs`);
  return [name, { sha256: hash(bytes), bytes: bytes.length, mime }];
}));
mkdirSync(resolve(sidecar, ".required-tool-outputs"), { recursive: true });
writeFileSync(resolve(sidecar, ".required-tool-outputs/assets.json"), JSON.stringify(assets, null, 2) + "\n");
console.log(`Built: ${Object.keys(assets).length} browser assets`);
