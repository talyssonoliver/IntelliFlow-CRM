// Inline field error (PG-201 schedules, PG-208 task automation): the message
// sits at `<fieldId>-error` and the field points at it with aria-describedby.

export function FieldError({
  id,
  message,
  alert,
}: Readonly<{
  id: string;
  message?: string;
  /** Group errors with no focusable field: announce. */ alert?: boolean;
}>) {
  if (!message) return null;
  return (
    <p
      id={id}
      role={alert ? 'alert' : undefined}
      className="text-xs text-red-600 dark:text-red-400"
    >
      {message}
    </p>
  );
}

export function errorProps(fieldId: string, message: string | undefined) {
  return {
    'aria-invalid': message ? (true as const) : undefined,
    'aria-describedby': message ? `${fieldId}-error` : undefined,
  };
}
