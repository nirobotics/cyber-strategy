import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { checkSources, output, repo, run, sidecar } from "./common.mjs";

if (process.argv.length !== 2) throw new Error("This entrypoint accepts no arguments and can only dry-run.");
checkSources();
rmSync(output, { recursive: true, force: true });
run(process.execPath, [resolve(sidecar, "node_modules/cf/bin/cf"), "deploy", "--dry-run", "--mode", "preview", "--no-provision"]);
run(process.execPath, [resolve(repo, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"]);
run(process.execPath, [resolve(sidecar, "scripts/verify.mjs")]);
