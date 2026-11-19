import { withNative, type NativeEnv } from "../../app/lib/native-context.server";
import {isFormal, origin as formalOrigin} from '../production/policy';

export type RuntimeEnv = NativeEnv & { BUSINESS: { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } } };
export interface SerialState { blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> }
export async function sealed(env: RuntimeEnv) {
  if (!env.DB?.prepare || !env.FILES?.get || !env.BUSINESS?.get) return false;
  for (const key of ["SOURCE_CATALOG_SHA256", "NATIVE_SCHEMA_SHA256"]) if (typeof env[key] !== "string" || !/^[a-f0-9]{64}$/.test(env[key] as string)) return false;
  try {
    const seal = await env.DB.prepare("SELECT s.schema_sha256,c.schema_sha256 AS catalog_sha256,s.table_count,s.row_count,s.object_count,s.provenance FROM native_seal s JOIN native_catalog c ON c.id='source' WHERE s.id='verified'").first<{ schema_sha256: string; catalog_sha256: string; table_count: number; row_count: number; object_count: number; provenance: string }>();
    const provenance = seal?.provenance === "actual-source" || (seal?.provenance === "synthetic-local" && env.LOCAL_SYNTHETIC_TEST === "miniflare-only");
    return Boolean(provenance && seal?.schema_sha256 === env.NATIVE_SCHEMA_SHA256 && seal.catalog_sha256 === env.SOURCE_CATALOG_SHA256 && seal.table_count === 11 && seal.row_count > 0);
  } catch { return false; }
}
export function inNative<T>(request: Request, env: RuntimeEnv, mutable: boolean, fn: () => T) { return withNative({ request, env, mutable }, fn); }

export function canonicalOrigin(env: RuntimeEnv) { return isFormal(env) ? formalOrigin : env.ORIGIN_HANDOVER === "approved-same-origin" ? "https://strategy.team8214.com" : "https://strategy-cf.team8214.com"; }
