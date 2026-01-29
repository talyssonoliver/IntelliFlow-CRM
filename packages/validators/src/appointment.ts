import { z } from 'zod';
import { APPOINTMENT_STATUSES, APPOINTMENT_TYPES } from '@intelliflow/domain';

// Enum schemas derived from domain constants (DRY pattern)
export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);
export const appointmentTypeSchema = z.enum(APPOINTMENT_TYPES);

// Inferred types for use in application layer
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;
export type AppointmentType = z.infer<typeof appointmentTypeSchema>;
