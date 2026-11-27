/**
 * Zod 4 builds a fast path for object schemas, and to know whether it may it probes the runtime
 * with `new Function("")`. Under a Content-Security-Policy without `unsafe-eval` that call is
 * blocked and the block is REPORTED even though zod catches it: the app sent about five reports on
 * every page load. `jitless` makes zod skip the probe and use the plain parser, which is all the
 * browser needs (the schemas parse small form values and API replies).
 *
 * Zod keeps its config on `globalThis.__zod_globalConfig` and reuses an object that is already
 * there, so setting it here works before zod loads and for every copy of zod in the bundle. This
 * file is imported FIRST by `instrumentation-client.ts`, which runs before the app's modules are
 * evaluated. It is browser only: the server keeps the fast path.
 */

export type ZodGlobal = typeof globalThis & { __zod_globalConfig?: Record<string, unknown> };

export function disableZodJit(target: ZodGlobal = globalThis as ZodGlobal): void {
  target.__zod_globalConfig = Object.assign(target.__zod_globalConfig ?? {}, { jitless: true });
}

disableZodJit();
