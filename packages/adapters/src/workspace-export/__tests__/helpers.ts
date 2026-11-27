/**
 * Test doubles for the workspace export: an in-memory Prisma-like store with just enough
 * `where` support (equality, in, not, gt/lt/lte, OR, AND, relation `some`) and a zip reader.
 */
import { unzipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { Prisma } from '@intelliflow/db';
import { ExportFileMissingError, type ExportFileStorage } from '../export-workspace';

type Row = Record<string, any>;

/** The Prisma JSON filter `{ path, equals | string_starts_with }` over a Json column value. */
function jsonMatches(value: any, cond: any): boolean {
  let at: any = value;
  for (const key of cond.path) at = at && typeof at === 'object' ? at[key] : undefined;
  if ('string_starts_with' in cond) {
    return typeof at === 'string' && at.startsWith(cond.string_starts_with);
  }
  if (cond.equals === Prisma.AnyNull) return at === undefined || at === null;
  return at === cond.equals;
}

function cmp(value: any, cond: any): boolean {
  if (cond === null || typeof cond !== 'object' || cond instanceof Date) {
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    return value === cond;
  }
  if ('in' in cond && !cond.in.includes(value)) return false;
  if ('not' in cond && value === cond.not) return false;
  return compareOrder(value, cond);
}

/** gt / gte / lt / lte, dates compared by time. */
function compareOrder(value: any, cond: any): boolean {
  const t = (v: any) => (v instanceof Date ? v.getTime() : v);
  const checks: Record<string, (a: any, b: any) => boolean> = {
    gt: (a, b) => a > b,
    gte: (a, b) => a >= b,
    lt: (a, b) => a < b,
    lte: (a, b) => a <= b,
  };
  return Object.entries(checks).every(([op, ok]) => !(op in cond) || ok(t(value), t(cond[op])));
}

export function matches(row: Row, where: Row | undefined, tables?: Record<string, Row[]>): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (k === 'AND') return (Array.isArray(v) ? v : [v]).every((w: Row) => matches(row, w, tables));
    if (k === 'OR') return (v as Row[]).some((w) => matches(row, w, tables));
    if (k === 'NOT') return !matches(row, v as Row, tables);
    // Relations the email predicate walks: the row's mailbox, and an attachment's email.
    if (k === 'mailbox' && v?.is) {
      const mailbox = (tables?.emailMailbox ?? []).find((m) => m.id === row.mailboxId);
      return !!mailbox && matches(mailbox, v.is, tables);
    }
    if (k === 'email' && v?.is) {
      const email = (tables?.emailRecord ?? []).find((m) => m.id === row.emailId);
      return !!email && matches(email, v.is, tables);
    }
    if (v && typeof v === 'object' && Array.isArray(v.path)) return jsonMatches(row[k], v);
    if (k === 'memberships' && v?.some) {
      return (tables?.tenantMembership ?? []).some(
        (m) => m.userId === row.id && matches(m, v.some, tables)
      );
    }
    return cmp(row[k], v);
  });
}

/** A delegate over `rows` with the Prisma calls the export and the service use. */
export function delegate(rows: Row[], tables?: Record<string, Row[]>) {
  return {
    findMany: async (args: Row = {}) => {
      let out = rows.filter((r) => matches(r, args.where, tables));
      if (Array.isArray(args.orderBy)) {
        // The export's keyset read: ascending by each key column in turn.
        const keys = args.orderBy.map((o: Row) => Object.keys(o)[0]!);
        out = [...out].sort((x, y) => {
          for (const k of keys) {
            const c = String(x[k]).localeCompare(String(y[k]));
            if (c !== 0) return c;
          }
          return 0;
        });
      }
      if (args.orderBy?.id === 'asc')
        out = [...out].sort((a, b) => String(a.id).localeCompare(String(b.id)));
      if (args.orderBy?.createdAt) {
        const dir = args.orderBy.createdAt === 'asc' ? 1 : -1;
        out = [...out].sort((a, b) => dir * (a.createdAt - b.createdAt));
      }
      if (args.orderBy?.updatedAt === 'asc') {
        out = [...out].sort((a, b) => a.updatedAt - b.updatedAt);
      }
      if (args.orderBy?.requestedAt) {
        out = [...out].sort((a, b) => b.requestedAt - a.requestedAt);
      }
      if (args.cursor) {
        const i = out.findIndex((r) => r.id === args.cursor.id);
        // Prisma: a cursor row that no longer exists matches nothing.
        out = i === -1 ? [] : out.slice(i + (args.skip ?? 0));
      }
      if (args.take) out = out.slice(0, args.take);
      return out.map((r) => (args.select ? pick(r, args.select) : { ...r }));
    },
    findFirst: async (args: Row = {}) =>
      (await delegate(rows, tables).findMany({ ...args, take: 1 }))[0] ?? null,
    findUnique: async (args: Row) => {
      const where = args.where as Row;
      const r = rows.find((x) => Object.entries(where).every(([k, v]) => x[k] === v));
      if (!r) return null;
      return args.select ? pick(r, args.select) : { ...r };
    },
    count: async (args: Row = {}) => rows.filter((r) => matches(r, args.where, tables)).length,
    create: async (args: Row) => {
      const data = args.data as Row;
      if (
        data.subscriptionId &&
        rows.some((r) => r.tenantId === data.tenantId && r.subscriptionId === data.subscriptionId)
      ) {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      const row = {
        id: `wx_${rows.length + 1}`,
        status: 'QUEUED',
        attempts: 0,
        requestedAt: new Date(),
        updatedAt: new Date(),
        subscriptionId: null,
        emailedAt: null,
        deliveryLeaseUntil: null,
        emailedToUserIds: [],
        ...data,
      };
      rows.push(row);
      return args.select ? pick(row, args.select) : { ...row };
    },
    update: async (args: Row) => {
      const r = rows.find((x) => x.id === args.where.id);
      if (!r) throw new Error('not found');
      apply(r, args.data);
      return { ...r };
    },
    updateMany: async (args: Row) => {
      const hit = rows.filter((r) => matches(r, args.where, tables));
      for (const r of hit) apply(r, args.data);
      return { count: hit.length };
    },
  };
}

function apply(r: Row, data: Row) {
  for (const [k, v] of Object.entries(data)) {
    const increments = v !== null && typeof v === 'object' && 'increment' in v;
    r[k] = increments ? (r[k] ?? 0) + v.increment : v;
  }
  r.updatedAt = new Date();
}

function pick(r: Row, select: Row): Row {
  const out: Row = {};
  for (const k of Object.keys(select)) out[k] = r[k];
  return out;
}

export function makeDb(tables: Record<string, Row[]>) {
  const db: Record<string, any> = {};
  for (const [name, rows] of Object.entries(tables)) db[name] = delegate(rows, tables);
  // Any model the test did not seed is an empty table.
  return new Proxy(db, {
    get: (target, key: string) => target[key] ?? (target[key] = delegate([], tables)),
  });
}

/** In-memory bucket storage, keyed bucket -> path -> content. */
export function memoryFiles(
  buckets: Record<string, Record<string, string>>,
  opts: { failOpen?: string[]; failOpenOther?: string[]; flaky?: Record<string, number> } = {}
): ExportFileStorage & { listed: string[] } {
  const listed: string[] = [];
  return {
    listed,
    async *listFiles(bucket, tenantId) {
      listed.push(`${bucket}/${tenantId}/`);
      for (const [path, content] of Object.entries(buckets[bucket] ?? {})) {
        // A leaky backend would return other tenants' paths; the export must re-check them.
        yield { path, size: content.length };
      }
    },
    async openFile(bucket, path) {
      if (opts.failOpen?.includes(path)) throw new ExportFileMissingError('object missing');
      if (opts.failOpenOther?.includes(path)) throw new Error('storage unavailable (503)');
      if (opts.flaky?.[path]) {
        opts.flaky[path] -= 1;
        throw new Error('storage unavailable (503)');
      }
      return Readable.from([Buffer.from(buckets[bucket]![path]!)]);
    },
  };
}

export function readZip(path: string): Record<string, string> {
  const files = unzipSync(new Uint8Array(readFileSync(path)));
  return Object.fromEntries(
    Object.entries(files).map(([k, v]) => [k, Buffer.from(v).toString('utf8')])
  );
}
