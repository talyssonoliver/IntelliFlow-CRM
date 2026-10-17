/** Shared DTO builder for the availability page tests (not a test file). */
const h = (hour: number, minute = 0) => hour * 60 + minute;

export interface FixtureDto {
  isConfigured: boolean;
  timezone: string;
  days: Array<{ weekday: number; ranges: Array<{ startMinute: number; endMinute: number }> }>;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  maxDailyBookings: number | null;
  closures: Array<{ id: string; startDate: string; endDate: string; reason: string | null }>;
  canEdit: boolean;
}

export function availabilityDto(overrides: Partial<FixtureDto> = {}): FixtureDto {
  return {
    isConfigured: true,
    timezone: 'Europe/London',
    days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      ranges: weekday >= 1 && weekday <= 5 ? [{ startMinute: h(9), endMinute: h(17) }] : [],
    })),
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 5,
    maxDailyBookings: null,
    closures: [{ id: 'c1', startDate: '2026-12-24', endDate: '2026-12-26', reason: 'Christmas' }],
    canEdit: true,
    ...overrides,
  };
}

export function unconfiguredDto(overrides: Partial<FixtureDto> = {}): FixtureDto {
  return availabilityDto({
    isConfigured: false,
    days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, ranges: [] })),
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    closures: [],
    ...overrides,
  });
}

export function trpcError(code: string, message: string): Error & { data: { code: string } } {
  return Object.assign(new Error(message), { data: { code } });
}
