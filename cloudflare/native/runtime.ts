import { withNative, type NativeEnv } from "../../app/lib/native-context.server";

export type RuntimeEnv = NativeEnv & { BUSINESS: { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } } };
export interface SerialState { blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> }
export function inNative<T>(request: Request, env: RuntimeEnv, mutable: boolean, fn: () => T) { return withNative({ request, env, mutable }, fn); }
