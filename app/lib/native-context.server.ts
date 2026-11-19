import { AsyncLocalStorage } from "node:async_hooks";
import { canaryConfig, type CanaryAdmission } from "./native-canary-policy.server";

export interface Statement {
  bind(...values: unknown[]): Statement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface Database { prepare(sql: string): Statement; batch<T = Record<string, unknown>>(statements: Statement[]): Promise<Array<{ results: T[]; success: boolean }>> }
export interface ObjectBody { body: ReadableStream; size: number; etag: string; httpMetadata?: { contentType?: string }; range?: { offset: number; length: number } }
export interface Bucket {
  put(key: string, value: ArrayBuffer | Uint8Array | ReadableStream, options?: unknown): Promise<unknown>;
  get(key: string, options?: unknown): Promise<ObjectBody | null>;
  delete(key: string | string[]): Promise<void>;
}
export type NativeEnv = Record<string, unknown> & { DB: Database; FILES: Bucket };
export type NativeScope = { env: NativeEnv; request: Request; mutable: boolean; canary?: CanaryAdmission };
// Vite's SSR bundle and the Worker entry share one isolate-local, request-scoped ALS.
// Never put a user's identity, bindings or a mutable client in a process global.
const symbol = Symbol.for("cyber-strategy.native-context.v1");
const globals = globalThis as typeof globalThis & { [symbol]?: AsyncLocalStorage<NativeScope> };
const storage = globals[symbol] ??= new AsyncLocalStorage<NativeScope>();
export function nativeScope() { return storage.getStore(); }
export function withNative<T>(scope: NativeScope, fn: () => T): T { return storage.run(scope, fn); }
export function nativeDB() { return nativeScope()?.env.DB; }
export function requireNative() {
  const scope = nativeScope();
  if (!scope) throw new Error("Native request context required");
  return scope;
}
export function requireMutation(kind: "business" | "auth" = "business", operation?: CanaryAdmission["operation"]) {
  const scope = requireNative();
  if (!scope.mutable) throw new Response("Serialized mutation required", { status: 409 });
  const authCallback = ["/auth/feishu/callback", "/api/auth/callback"].includes(new URL(scope.request.url).pathname);
  if (kind === "auth") {
    if (!authCallback || scope.env.AUTH_WRITES !== "enabled") throw new Response("Writes blocked", { status: 503 });
  } else if (scope.env.BUSINESS_WRITES !== "enabled") {
    const policy = canaryConfig(scope.env);
    if (!operation || scope.canary?.operation !== operation || scope.canary.actorOpenId !== policy.actor) throw new Response("Canary operation blocked", { status: 403 });
  }
  return scope;
}
export async function selectRows<T>(sql: string, ...args: unknown[]): Promise<T[]> {
  const { results } = await requireNative().env.DB.prepare(sql).bind(...args).all<{ row_json: string }>();
  return results.map(({ row_json }) => JSON.parse(row_json) as T);
}
export async function selectOne<T>(sql: string, ...args: unknown[]): Promise<T | null> { return (await selectRows<T>(sql, ...args))[0] ?? null; }
export function statement(sql: string, ...args: unknown[]) { return requireNative().env.DB.prepare(sql).bind(...args); }
export function timestamp() { return new Date().toISOString().replace(/Z$/, "000Z"); }
