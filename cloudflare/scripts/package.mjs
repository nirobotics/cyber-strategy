// Build + typecheck + package (no upload) + verify. The result in .cloudflare/output is what `cf deploy --prebuilt` uploads.
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { output, repo, run, sidecar } from "./common.mjs";

rmSync(output, { recursive: true, force: true });
// (cf runs scripts/build.mjs itself: see wrangler.config.ts)
run(process.execPath, [resolve(repo, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"]);
run(process.execPath, [resolve(sidecar, "node_modules/cf/bin/cf"), "deploy", "--dry-run", "--mode", "production", "--no-provision"]);
run(process.execPath, [resolve(sidecar, "scripts/verify.mjs")]);
