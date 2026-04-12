export type NotFoundAnalyticsPayload = {
  readonly event: 'not_found_page_view';
  readonly missingPath: string;
  readonly referrerPath: string | null;
  readonly suggestionCount: number;
  readonly navigationType: string | null;
  readonly timestamp: string;
};

export type NotFoundAnalyticsInput = {
  readonly missingPath: string;
  readonly referrer?: string | null;
  readonly suggestionCount: number;
  readonly navigationType: string | null;
  readonly timestamp?: string;
};

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

function toPathname(referrer?: string | null): string | null {
  if (!referrer) {
    return null;
  }

  try {
    return new URL(referrer, 'https://intelliflow-crm.com').pathname;
  } catch {
    return null;
  }
}

export function buildNotFoundAnalyticsPayload(
  input: Readonly<NotFoundAnalyticsInput>
): NotFoundAnalyticsPayload {
  return {
    event: 'not_found_page_view',
    missingPath: input.missingPath,
    referrerPath: toPathname(input.referrer),
    suggestionCount: input.suggestionCount,
    navigationType: input.navigationType,
    timestamp: input.timestamp ?? new Date().toISOString(),
  };
}

export function trackNotFoundPageView(
  input: Readonly<NotFoundAnalyticsInput>
): NotFoundAnalyticsPayload {
  const payload = buildNotFoundAnalyticsPayload(input);

  if (typeof window !== 'undefined') {
    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push(payload);
    }

    window.dispatchEvent(
      new CustomEvent<NotFoundAnalyticsPayload>('intelliflow:not-found', {
        detail: payload,
      })
    );
  }

  return payload;
}
