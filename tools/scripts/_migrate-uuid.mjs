#!/usr/bin/env node
/**
 * One-shot migration: replace `import ... from 'uuid'` with imports from
 * `packages/domain/src/shared/uuid.ts` (which wraps node:crypto.randomUUID).
 *
 * Idempotent — re-running on already-migrated files is a no-op.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd());
const SHARED_UUID_NO_EXT = resolve(REPO_ROOT, 'packages/domain/src/shared/uuid');

const FILES = [
  'packages/domain/src/ai/review/ReviewId.ts',
  'packages/domain/src/autoresponse/AutoResponseDraftId.ts',
  'packages/domain/src/crm/account/AccountId.ts',
  'packages/domain/src/crm/account/__tests__/AccountId.test.ts',
  'packages/domain/src/crm/billing/InvoiceId.ts',
  'packages/domain/src/crm/billing/ReceiptId.ts',
  'packages/domain/src/crm/contact/ContactId.ts',
  'packages/domain/src/crm/contact/__tests__/ContactId.test.ts',
  'packages/domain/src/crm/lead/LeadId.ts',
  'packages/domain/src/crm/lead/__tests__/LeadId.test.ts',
  'packages/domain/src/crm/opportunity/OpportunityId.ts',
  'packages/domain/src/crm/opportunity/__tests__/OpportunityId.test.ts',
  'packages/domain/src/crm/task/TaskId.ts',
  'packages/domain/src/crm/task/__tests__/TaskId.test.ts',
  'packages/domain/src/crm/ticket/TicketId.ts',
  'packages/domain/src/crm/ticket/__tests__/TicketId.test.ts',
  'packages/domain/src/legal/appointments/AppointmentId.ts',
  'packages/domain/src/legal/cases/CaseId.ts',
  'packages/domain/src/legal/cases/CaseTaskId.ts',
  'packages/domain/src/legal/deadlines/DeadlineId.ts',
  'packages/domain/src/notifications/NotificationId.ts',
  'packages/domain/src/shared/DomainEvent.ts',
];

const REPLACEMENTS = [
  {
    re: /^import \{ v4 as uuidv4, validate as uuidValidate \} from 'uuid';$/m,
    replace: (rel) =>
      `import { generateUuid as uuidv4, isValidUuid as uuidValidate } from '${rel}';`,
  },
  {
    re: /^import \{ v4 as uuidv4, validate as isValidUuid \} from 'uuid';$/m,
    replace: (rel) => `import { generateUuid as uuidv4, isValidUuid } from '${rel}';`,
  },
  {
    re: /^import \{ v4 as uuidv4 \} from 'uuid';$/m,
    replace: (rel) => `import { generateUuid as uuidv4 } from '${rel}';`,
  },
  {
    re: /^import \{ validate as uuidValidate \} from 'uuid';$/m,
    replace: (rel) => `import { isValidUuid as uuidValidate } from '${rel}';`,
  },
];

let touched = 0;
let unchanged = 0;
for (const f of FILES) {
  const full = resolve(REPO_ROOT, f);
  let src = readFileSync(full, 'utf8');
  const fileDir = dirname(full);
  let rel = relative(fileDir, SHARED_UUID_NO_EXT).replaceAll('\\', '/');
  if (!rel.startsWith('.')) rel = './' + rel;

  const before = src;
  for (const { re, replace } of REPLACEMENTS) {
    src = src.replace(re, replace(rel));
  }
  if (src === before) {
    console.log('  unchanged:', f);
    unchanged++;
  } else {
    writeFileSync(full, src);
    console.log('  rewrote:  ', f, '->', rel);
    touched++;
  }
}
console.log(`\nDone. Rewrote ${touched}, unchanged ${unchanged}.`);
