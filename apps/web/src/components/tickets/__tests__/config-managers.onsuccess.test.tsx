/**
 * @vitest-environment jsdom
 */
/**
 * Mutation success handlers of the ticket configuration managers
 * (SLAPolicyManager, TicketTypeManager, AutomationRuleBuilder): each must
 * refresh its list after a successful create/update/delete/set-default.
 */
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { capture } from '@/test/trpc-capture';

vi.mock('@/lib/trpc', async () => {
  const { trpcCaptureClient } = await import('@/test/trpc-capture');
  return { trpc: trpcCaptureClient };
});

vi.mock('@intelliflow/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, toast: vi.fn() };
});

import { SLAPolicyManager } from '../SLAPolicyManager';
import { TicketTypeManager } from '../TicketTypeManager';
import { AutomationRuleBuilder } from '../AutomationRuleBuilder';

describe('ticket config managers - mutation onSuccess', () => {
  beforeEach(() => {
    capture.reset();
  });

  it.each(['create', 'update', 'delete', 'setDefault'])(
    'SLAPolicyManager %s refreshes the SLA policy list',
    (name) => {
      render(<SLAPolicyManager />);
      capture.mutations[`ticketConfig.slaPolicy.${name}`].onSuccess?.();
      expect(capture.invalidations).toContain('ticketConfig.slaPolicy.list');
    }
  );

  it.each(['create', 'update', 'delete'])(
    'TicketTypeManager %s refreshes the category list',
    (name) => {
      render(<TicketTypeManager />);
      capture.mutations[`ticketConfig.category.${name}`].onSuccess?.();
      expect(capture.invalidations).toContain('ticketConfig.category.list');
    }
  );

  it.each(['create', 'update', 'delete'])(
    'AutomationRuleBuilder %s refreshes the routing list',
    (name) => {
      render(<AutomationRuleBuilder />);
      capture.mutations[`routing.${name}`].onSuccess?.();
      expect(capture.invalidations).toContain('routing.list');
    }
  );
});
