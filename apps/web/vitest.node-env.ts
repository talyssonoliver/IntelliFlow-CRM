import { readFileSync } from 'node:fs';
import path from 'node:path';

/** The list of web test files that run in the node environment ('web-node' project). */
export const NODE_ENV_LIST = path.resolve(__dirname, 'vitest.node-env-files.txt');

/** Entries of the list: one path per line, relative to apps/web; blank lines and # comments skipped. */
export function readNodeEnvFiles(file: string = NODE_ENV_LIST): string[] {
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/**
 * A literal path as a glob: route-group and dynamic-segment folders such as `(list)` and
 * `[slug]` would otherwise be read as glob syntax and match nothing.
 */
export function literalGlob(file: string): string {
  return file.replace(/[()[\]{}*?!+@]/g, '\\$&');
}

/** The list as include/exclude globs. */
export function nodeEnvGlobs(file: string = NODE_ENV_LIST): string[] {
  return readNodeEnvFiles(file).map(literalGlob);
}
