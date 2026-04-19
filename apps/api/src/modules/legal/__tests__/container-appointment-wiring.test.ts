import { describe, it, expect } from 'vitest';
import { container } from '../../../container';

describe('container wiring: appointment use cases', () => {
  it('exposes ScheduleAppointmentUseCase instance', () => {
    expect(container.scheduleAppointmentUseCase?.constructor?.name).toBe(
      'ScheduleAppointmentUseCase'
    );
  });
  it('exposes RescheduleAppointmentUseCase instance', () => {
    expect(container.rescheduleAppointmentUseCase?.constructor?.name).toBe(
      'RescheduleAppointmentUseCase'
    );
  });
  it('exposes CancelAppointmentUseCase instance', () => {
    expect(container.cancelAppointmentUseCase?.constructor?.name).toBe('CancelAppointmentUseCase');
  });
  it('exposes CompleteAppointmentUseCase instance', () => {
    expect(container.completeAppointmentUseCase?.constructor?.name).toBe(
      'CompleteAppointmentUseCase'
    );
  });
  it('exposes CheckConflictsUseCase instance', () => {
    expect(container.checkConflictsUseCase?.constructor?.name).toBe('CheckConflictsUseCase');
  });
});
