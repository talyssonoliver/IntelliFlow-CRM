/**
 * Runtime BullMQ loader
 *
 * Next.js bundles the API router into the web app's server build for the
 * in-process tRPC route. Loading BullMQ at runtime keeps webpack from walking
 * BullMQ's child processor entrypoints during that build.
 */

type BullMQModule = typeof import('bullmq');

let bullMQModulePromise: Promise<BullMQModule> | null = null;

export function loadBullMQ(): Promise<BullMQModule> {
  bullMQModulePromise ??= import(/* webpackIgnore: true */ 'bullmq');
  return bullMQModulePromise;
}
