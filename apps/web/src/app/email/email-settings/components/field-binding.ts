import type { ReactNode } from 'react';

/** aria props for a field: set when it has an error, empty otherwise. */
export type FieldErrorProps = { 'aria-invalid'?: true; 'aria-describedby'?: string };

/**
 * How SmtpMailboxForm wires one of its fields to the DOM: the input id, the
 * aria-invalid / aria-describedby props, and the error text below it.
 */
export interface FieldBinding<F extends string> {
  id: (field: F) => string;
  errorProps: (field: F) => FieldErrorProps;
  errorText: (field: F) => ReactNode;
  errorMessage: (field: F) => string | undefined;
}
