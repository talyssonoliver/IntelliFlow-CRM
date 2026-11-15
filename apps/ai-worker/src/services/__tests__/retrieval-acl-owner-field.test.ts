/**
 * The own-scope ACL filter must name a column that exists on the searched model.
 *
 * Production, 2026-11-12: every own-scope conversation search failed with
 * "Invalid prisma.conversationRecord.findMany() invocation: where { tenantId, ownerId }"
 * because ConversationRecord keeps its owner in `userId`, so the next best action agent ran
 * without its RAG context. This test reads the real Prisma schema instead of a mock, so a
 * renamed or missing owner column fails here and not in production.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import { ACLService, ownerFieldFor, type ACLContext } from '../retrieval-service';

vi.mock('@intelliflow/db', () => ({ PrismaClient: vi.fn() }));

const SCHEMA_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../packages/db/prisma/schema.prisma'
);

/** Each source whose search spreads the ACL filter into a Prisma `where`, and that where's model. */
const MODEL_BY_SOURCE: Readonly<Record<string, string>> = {
  leads: 'Lead',
  contacts: 'Contact',
  accounts: 'Account',
  opportunities: 'Opportunity',
  conversations: 'ConversationRecord',
  // Messages filter through their `conversation` relation.
  messages: 'ConversationRecord',
  tickets: 'Ticket',
};

function modelFields(schema: string, model: string): Set<string> {
  const lines = schema.split('\n');
  const start = lines.findIndex((l) => l.trim().startsWith(`model ${model} {`));
  if (start === -1) throw new Error(`model ${model} not found in schema.prisma`);
  const fields = new Set<string>();
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed === '}') break;
    const name = trimmed.split(/\s/, 1)[0];
    if (name && !name.startsWith('//') && !name.startsWith('@@')) fields.add(name);
  }
  return fields;
}

const OWN_SCOPE: ACLContext = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  roles: ['USER'],
  permissions: [],
};

describe('own-scope ACL filter against the real Prisma schema', () => {
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  const acl = new ACLService();

  it.each(Object.entries(MODEL_BY_SOURCE))(
    '%s filters on a column that %s has',
    (source, model) => {
      const filter = acl.buildACLFilter(OWN_SCOPE, source);
      const fields = modelFields(schema, model);
      for (const key of Object.keys(filter)) {
        expect(fields, `${model}.${key}`).toContain(key);
      }
      expect(filter[ownerFieldFor(source)]).toBe('user-1');
    }
  );

  it('scopes conversations to their user, not an ownerId', () => {
    expect(acl.buildACLFilter(OWN_SCOPE, 'conversations')).toEqual({
      tenantId: 'tenant-1',
      userId: 'user-1',
    });
  });

  it('scopes tickets to their assignee', () => {
    expect(acl.buildACLFilter(OWN_SCOPE, 'tickets')).toEqual({
      tenantId: 'tenant-1',
      assigneeId: 'user-1',
    });
  });

  it('keeps tenant-wide access for admins on every source', () => {
    const admin: ACLContext = { ...OWN_SCOPE, roles: ['ADMIN'] };
    for (const source of Object.keys(MODEL_BY_SOURCE)) {
      expect(acl.buildACLFilter(admin, source)).toEqual({ tenantId: 'tenant-1' });
    }
  });
});
