import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, lstatSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deploymentKeys } from "../identity.ts";

export const sidecar = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repo = resolve(sidecar, "..");
// .build-input is a symlink to a throw-away copy of the app outside the repository (see build.mjs).
export const input = resolve(sidecar, ".build-input");
export const output = resolve(sidecar, ".cloudflare/output");
// Throw-away build state lives outside the repository (PI_SCRATCH_DIR or the system temp directory).
export const scratch = process.env.CYBER_BUILD_SCRATCH ?? resolve(process.env.PI_SCRATCH_DIR ?? tmpdir(), "cyber-strategy-template-cloudflare");
// Headers of the content-hashed build files that Static Assets serves without running the Worker.
export const assetHeaders = "/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n  X-Robots-Tag: noindex, nofollow, noarchive\n";
export const hash = (data) => createHash("sha256").update(data).digest("hex");
export const json = (path) => JSON.parse(readFileSync(path, "utf8"));
export function walk(dir) {
  return readdirSync(dir).sort().flatMap((name) => {
    const path = resolve(dir, name), stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`Symlink not allowed here: ${path}`);
    return stat.isDirectory() ? walk(path) : [path];
  });
}
// Build tools run with a minimal environment: no credentials, tokens or .env values leak into the bundle.
export function cleanEnv() {
  const temp = resolve(scratch, "tmp"), home = resolve(scratch, "home");
  mkdirSync(temp, { recursive: true }); mkdirSync(home, { recursive: true });
  const settings = Object.fromEntries(deploymentKeys.flatMap((key) => process.env[key] ? [[key, process.env[key]]] : []));
  return { ...settings, PATH: process.env.PATH, CYBER_BUILD_SCRATCH: scratch, HOME: home, XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home, TMPDIR: temp,
    CI: "true", NO_COLOR: "1", NODE_ENV: "production", WRANGLER_SEND_METRICS: "false", CF_TELEMETRY_DISABLED: "true" };
}
export function run(file, args, cwd = sidecar) {
  return execFileSync(file, args, { cwd, env: cleanEnv(), stdio: "inherit" });
}
