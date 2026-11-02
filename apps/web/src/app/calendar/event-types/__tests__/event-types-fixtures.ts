/**
 * PG-203 test fixtures for the Event Types settings page (not a test file).
 */
import type { EventTypeDto, EventTypeListDto } from '@intelliflow/validators';

export function eventTypeDto(overrides: Partial<EventTypeDto> = {}): EventTypeDto {
  return {
    id: 'clhevent00000000000',
    name: 'Initial consultation',
    slug: 'initial-consultation',
    description: 'A first 30-minute call.',
    durationMinutes: 30,
    colorToken: 'blue',
    locationType: 'VIDEO',
    locationDetails: 'https://meet.example.invalid/firm',
    appointmentType: 'CONSULTATION',
    hostUserId: 'clhhost000000000000',
    hostName: 'Hana Host',
    hostAvailable: true,
    requiredFields: ['phone'],
    leadSource: 'BOOKING',
    isActive: true,
    ...overrides,
  };
}

export function listDto(overrides: Partial<EventTypeListDto> = {}): EventTypeListDto {
  return {
    items: [eventTypeDto()],
    canEdit: true,
    bookingLink: { handle: 'smith-law', privacyUrl: null, availabilityConfigured: true },
    limits: {
      maxPerTenant: 50,
      nameMax: 100,
      slugMax: 60,
      descriptionMax: 2000,
      minDurationMinutes: 5,
      maxDurationMinutes: 480,
      locationDetailsMax: 500,
      handleMin: 3,
      handleMax: 40,
      privacyUrlMax: 500,
    },
    ...overrides,
  };
}
