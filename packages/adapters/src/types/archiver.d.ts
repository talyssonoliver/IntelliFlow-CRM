declare module 'archiver' {
  import type { Transform } from 'node:stream';
  import type { Readable } from 'node:stream';
  interface Archiver extends Transform {
    append(source: Readable | Buffer | string, data: { name: string }): this;
    finalize(): Promise<void>;
    abort(): this;
  }
  export default function archiver(
    format: 'zip',
    options?: { zlib?: { level?: number } }
  ): Archiver;
}
