/**
 * Tests for ui-flow-mapping.md reconciliation against codebase reality
 * Ensures documented counts don't drift from filesystem/router definitions
 * Covers: Total Pages, API Router count, Procedure count self-consistency
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findPageFiles } from './test-helpers/ia-fs-helpers';

const APP_DIR = path.resolve(__dirname, '..');
const DOC_PATH = path.resolve(__dirname, '../../../../../docs/design/ui-flow-mapping.md');
const ROUTER_PATH = path.resolve(__dirname, '../../../../../apps/api/src/router.ts');

describe('ui-flow-mapping.md Reconciliation', () => {
  let docContent: string;
  /** Header text with blockquote line-continuations collapsed into single line */
  let normalizedHeader: string;

  beforeAll(() => {
    docContent = fs.readFileSync(DOC_PATH, 'utf-8');
    // The header spans multiple blockquote lines (> ...\n> ...)
    // Collapse them so regexes can match across the original line breaks
    normalizedHeader = docContent.replace(/\n>\s*/g, ' ');
  });

  // TC-33: Total Pages header matches filesystem page.tsx count
  it('Total Pages count matches filesystem page.tsx count', () => {
    const match = normalizedHeader.match(/\*\*Total Pages\*\*:\s*(\d+)/);
    expect(match, 'Could not find **Total Pages**: N in ui-flow-mapping.md header').toBeTruthy();
    const documentedCount = parseInt(match![1], 10);
    const filesystemCount = findPageFiles(APP_DIR).length;

    if (documentedCount !== filesystemCount) {
      expect.fail(
        `ui-flow-mapping.md header says ${documentedCount} Total Pages, ` +
          `filesystem has ${filesystemCount} page.tsx files.\n` +
          `  Fix: Update the "Total Pages" value in docs/design/ui-flow-mapping.md header to ${filesystemCount}.`
      );
    }
  });

  // TC-34: API Router count in header matches router.ts registrations
  it('API Router count matches router.ts registrations', () => {
    const match = normalizedHeader.match(/\*\*API\s*Routers\*\*:\s*(\d+)/);
    expect(match, 'Could not find **API Routers**: N in ui-flow-mapping.md header').toBeTruthy();
    const documentedRouterCount = parseInt(match![1], 10);

    const routerContent = fs.readFileSync(ROUTER_PATH, 'utf-8');
    // Extract the createTRPCRouter({...}) block
    const routerBlock = routerContent.match(/createTRPCRouter\(\{([\s\S]*?)\}\)/);
    expect(routerBlock, 'Could not find createTRPCRouter({...}) block in router.ts').toBeTruthy();

    // Count key: valueRouter entries (skip comment-only and blank lines)
    const entries = routerBlock![1].match(/^\s+\w+:\s+\w+,?\s*(\/\/.*)?$/gm) || [];
    const actualRouterCount = entries.length;

    if (documentedRouterCount !== actualRouterCount) {
      expect.fail(
        `ui-flow-mapping.md header says ${documentedRouterCount} API routers, ` +
          `router.ts has ${actualRouterCount} registrations.\n` +
          `  Fix: Update docs/design/ui-flow-mapping.md header "API Routers" value ` +
          `and the API Router Summary table to ${actualRouterCount}.`
      );
    }
  });

  // TC-35: Procedure count self-consistency (header vs API Router Summary table)
  it('procedure count in header matches API Router Summary table total', () => {
    const headerMatch = normalizedHeader.match(/\((\d+)\s+procedures\)/);
    expect(headerMatch, 'Could not find (N procedures) in ui-flow-mapping.md header').toBeTruthy();
    const headerProcedures = parseInt(headerMatch![1], 10);

    // Match the **Total** row: | **Total** | **366** | ...
    const tableMatch = docContent.match(/\|\s*\*\*Total\*\*\s*\|\s*\*\*(\d+)\*\*/);
    expect(
      tableMatch,
      'Could not find | **Total** | **N** | in API Router Summary table'
    ).toBeTruthy();
    const tableProcedures = parseInt(tableMatch![1], 10);

    if (headerProcedures !== tableProcedures) {
      expect.fail(
        `Header says ${headerProcedures} procedures but API Router Summary ` +
          `table total says ${tableProcedures}.\n` +
          `  Fix: Reconcile the header "(N procedures)" and the table ` +
          `"**Total** | **N**" in docs/design/ui-flow-mapping.md.`
      );
    }
  });
});
