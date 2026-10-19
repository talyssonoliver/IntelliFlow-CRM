/**
 * PG-202 boundary guard (Aurora boundaries 1 and 5).
 *
 * appointments.router.ts may only swap the two business-hours calls for the
 * availability helper. A merge from main must not bring the old helper back.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { container } from '../../../container';

const routerSource = readFileSync(join(__dirname, '..', 'appointments.router.ts'), 'utf8');

describe('appointments router availability boundary (PG-202)', () => {
  it('no longer contains the hard-coded 07:00-19:00 helper', () => {
    expect(routerSource).not.toMatch(/BUSINESS_HOURS_/);
    expect(routerSource).not.toMatch(/assertWithinBusinessHours/);
    expect(routerSource).not.toMatch(/function getLocalHour/);
  });

  it('calls the availability helper exactly twice (create and reschedule)', () => {
    expect(routerSource.match(/assertAppointmentWithinAvailability\(/g)).toHaveLength(2);
  });

  it('routes findNextSlot through the tenant availability loader', () => {
    expect(routerSource).toMatch(/loadTenantAvailability\(/);
    expect(routerSource).toMatch(/findNextSlotWithinAvailability\(/);
  });

  it('the real container exposes findFirstFreeCandidate on the conflicts use case', () => {
    expect(typeof container.checkConflictsUseCase.findFirstFreeCandidate).toBe('function');
  });
});
