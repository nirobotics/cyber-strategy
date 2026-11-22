import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { deploymentIdentity } from "../identity.ts";
import { sidecar } from "./common.mjs";
import { verify } from "./verify.mjs";

deploymentIdentity(process.env, true);
verify();
execFileSync(process.execPath, [resolve(sidecar, "node_modules/cf/bin/cf"), "deploy", "--prebuilt", "--mode", "production", "--no-provision"], { cwd: sidecar, stdio: "inherit" });
