import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, lstatSync, mkdirSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const sidecar = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repo = resolve(sidecar, "..");
export const input = resolve(sidecar, ".build-input");
export const output = resolve(sidecar, ".cloudflare/output");
export const lock = JSON.parse(readFileSync(resolve(sidecar, "source-lock.json")));
export const review = JSON.parse(readFileSync(resolve(sidecar, "source-review.json")));
export const sourcePaths = [...new Set([...Object.keys(lock.files), ...Object.keys(review.files)])];
export const hash = (data) => createHash("sha256").update(data).digest("hex");
export const json = (path) => JSON.parse(readFileSync(path));
export function walk(dir) {
  return readdirSync(dir).sort().flatMap((name) => {
    const path = resolve(dir, name);
    const stat = lstatSync(path);
    assert(!stat.isSymbolicLink(), `Symlink forbidden in sources/assets: ${path}`);
    return stat.isDirectory() ? walk(path) : [path];
  });
}
export function toolchain() {
  assert.equal(process.versions.node, "22.23.4", "Use Node 22.23.4");
  for (const [name, version] of Object.entries({ cf: "1.0.0-beta.31", wrangler: "4.161.0", miniflare: "5.20261110.2-beta" }))
    assert.equal(json(resolve(sidecar, `node_modules/${name}/package.json`)).version, version);
  assert.equal(json(resolve(repo, "package.json")).packageManager, "pnpm@11.5.0");
  assert.equal(json(resolve(sidecar, "package.json")).packageManager, "pnpm@11.7.0");
}
// Never inherit secrets, Cloudflare login/config, .env, proxies, or Node preloads.
export function cleanEnv() {
  assert(process.env.PI_SCRATCH_DIR, "PI_SCRATCH_DIR is required for isolated tool state");
  const scratch = resolve(process.env.PI_SCRATCH_DIR, "strategy-tools");
  const home = resolve(scratch, "home"), temp = resolve(scratch, "tmp");
  mkdirSync(temp, { recursive: true }); mkdirSync(home, { recursive: true });
  return {
    PATH: process.env.PATH, HOME: home, XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home, TMPDIR: temp,
    PI_SCRATCH_DIR: process.env.PI_SCRATCH_DIR, CI: "true", NO_COLOR: "1", NODE_ENV: "production",
    WRANGLER_SEND_METRICS: "false", CF_TELEMETRY_DISABLED: "true",
    CLOUDFLARE_ACCOUNT_ID: "2ca8df5c9754fb7e3f37d08c597535e0",
  };
}
export function run(file, args, cwd = sidecar) {
  return execFileSync(file, args, { cwd, env: cleanEnv(), stdio: "inherit" });
}
export function checkSources() {
  toolchain();
  assert.equal(lock.base, "2282230eb02ec40208681968ab1617855fb18ece");
  for (const [path, record] of Object.entries(lock.files)) {
    if (!record.preserve || review.files[path]) continue;
    const absolute = resolve(repo, path);
    assert(!lstatSync(absolute).isSymbolicLink(), `Symlink source: ${path}`);
    const data = readFileSync(absolute);
    assert.equal(hash(data), record.sha256, `Source gate: ${path}`);
    assert.equal(data.length, record.bytes, `Source byte gate: ${path}`);
  }
  assert.equal(review.base, lock.base);
  for (const [path, record] of Object.entries(review.files)) {
    assert.equal(record.baselineSha256, lock.files[path]?.sha256 ?? null, `Reviewed original pin: ${path}`);
    assert(record.reason.length > 30, `Review rationale: ${path}`);
    assert.equal(hash(readFileSync(resolve(repo, path))), record.sha256, `Reviewed native source: ${path}`);
  }
  for (const dir of ["app", "public", "supabase"])
    for (const path of walk(resolve(repo, dir))) assert(lock.files[relative(repo, path)] || review.files[relative(repo, path)], `Unapproved source: ${path}`);
}
export function original(path) {
  assert(lock.files[path], `Unpinned source: ${path}`);
  assert(!path.split("/").some((part) => part.startsWith(".env")), "Environment files must never be mirrored");
  const data = execFileSync("git", ["show", `${lock.base}:${path}`], { cwd: repo, maxBuffer: 20 * 1024 * 1024 });
  assert.equal(hash(data), lock.files[path].sha256, `Baseline gate: ${path}`);
  return data;
}

export function current(path) {
  if (lock.files[path] && !lock.files[path].preserve && !review.files[path]) return original(path);
  const data = readFileSync(resolve(repo, path));
  const expected = review.files[path]?.sha256 ?? lock.files[path]?.sha256;
  assert(expected, `Unreviewed build input: ${path}`);
  assert.equal(hash(data), expected, `Current source review: ${path}`);
  return data;
}
