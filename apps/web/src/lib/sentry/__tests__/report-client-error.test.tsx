// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/components/status/error-page-content', () => ({
  ErrorPageContent: () => <div data-testid="error-content" />,
}));
vi.mock('@/components/status/server-incident-reporter', () => ({
  ServerIncidentReporter: () => null,
}));

import * as Sentry from '@sentry/nextjs';
import GlobalError from '@/app/global-error';
import ErrorPage from '@/app/error';

describe('error boundaries report to Sentry', () => {
  it('global-error captures the exception once', () => {
    const error = new Error('root layout exploded');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<GlobalError error={error} reset={() => {}} />);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it('segment error.tsx captures the exception', () => {
    const error = new Error('segment exploded');
    render(<ErrorPage error={error} reset={() => {}} />);
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});
