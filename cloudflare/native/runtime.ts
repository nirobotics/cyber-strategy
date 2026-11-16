import { withNative, type NativeEnv } from "../../app/lib/native-context.server";

export type RuntimeEnv = NativeEnv & { BUSINESS: { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } } };
export interface SerialState { blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> }
export async function sealed(env: RuntimeEnv) {
  if (!env.DB?.prepare || !env.FILES?.get || !env.BUSINESS?.get) return false;
  if (typeof env.SOURCE_CATALOG_SHA256 !== "string" || !/^[a-f0-9]{64}$/.test(env.SOURCE_CATALOG_SHA256)) return false;
  try {
    const seal = await env.DB.prepare("SELECT schema_sha256,table_count,row_count,object_count,provenance FROM native_seal WHERE id='verified'").first<{ schema_sha256: string; table_count: number; row_count: number; object_count: number; provenance: string }>();
    const provenance = seal?.provenance === "actual-source" || (seal?.provenance === "synthetic-local" && env.LOCAL_SYNTHETIC_TEST === "miniflare-only");
    return Boolean(provenance && seal?.schema_sha256 === env.SOURCE_CATALOG_SHA256 && seal.table_count === 11 && seal.row_count > 0);
  } catch { return false; }
}
export function inNative<T>(request: Request, env: RuntimeEnv, mutable: boolean, fn: () => T) { return withNative({ request, env, mutable }, fn); }

export function canonicalOrigin(env: RuntimeEnv) { return env.ORIGIN_HANDOVER === "approved-same-origin" ? "https://strategy.team8214.com" : "https://strategy-cf.team8214.com"; }
