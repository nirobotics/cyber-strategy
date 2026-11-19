// Build + package (no upload) + typecheck + verify. The result in .cloudflare/output is what `cf deploy --prebuilt` uploads.
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { input, output, repo, run, sidecar } from "./common.mjs";

rmSync(output, { recursive: true, force: true });
// cf runs scripts/build.mjs itself (see wrangler.config.ts), but only after it has checked that the assets directory
// exists. On a fresh checkout (CI) there is no earlier build, so an empty placeholder stands in until the build replaces it.
if (!existsSync(resolve(input, "build/client"))) {
  rmSync(input, { recursive: true, force: true });
  mkdirSync(resolve(input, "build/client"), { recursive: true });
}
run(process.execPath, [resolve(sidecar, "node_modules/cf/bin/cf"), "deploy", "--dry-run", "--mode", "production", "--no-provision"]);
// worker.ts imports the asset list that the build writes, so the typecheck runs after it.
run(process.execPath, [resolve(repo, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"]);
run(process.execPath, [resolve(sidecar, "scripts/verify.mjs")]);
