import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DeveloperAppEditPage, { generateMetadata } from '../page';

// Mock AppEditor to isolate page shell tests
vi.mock('@/components/developer/app-editor', () => ({
  AppEditor: ({ appId }: Readonly<{ appId: string }>) => (
    <div data-testid="app-editor" data-app-id={appId}>
      AppEditor for {appId}
    </div>
  ),
}));

describe('DeveloperAppEditPage', () => {
  // EP-001: Page renders AppEditor component
  it('EP-001: page renders AppEditor component', async () => {
    const Page = await DeveloperAppEditPage({
      params: Promise.resolve({ id: 'app-001' }),
    });
    render(Page);
    expect(screen.getByTestId('app-editor')).toBeInTheDocument();
  });

  // EP-002: Page passes appId prop to AppEditor
  it('EP-002: page passes appId prop to AppEditor', async () => {
    const Page = await DeveloperAppEditPage({
      params: Promise.resolve({ id: 'app-001' }),
    });
    render(Page);
    expect(screen.getByTestId('app-editor')).toHaveAttribute('data-app-id', 'app-001');
  });

  // EP-003: generateMetadata returns edit title for valid app
  it('EP-003: generateMetadata returns "Edit {app.name} | Developer Apps | IntelliFlow CRM"', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'app-001' }),
    });
    expect(metadata.title).toBe('Edit IntelliFlow Dashboard | Developer Apps | IntelliFlow CRM');
  });

  // EP-004: generateMetadata returns not-found title for unknown id
  it('EP-004: generateMetadata returns "App Not Found | IntelliFlow CRM" for unknown id', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'unknown-id' }),
    });
    expect(metadata.title).toBe('App Not Found | IntelliFlow CRM');
  });

  // EP-005: generateMetadata returns not-found title for invalid id
  it('EP-005: generateMetadata returns not-found title for invalid id (special chars)', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'invalid<script>' }),
    });
    expect(metadata.title).toBe('App Not Found | IntelliFlow CRM');
  });

  // EP-006: Invalid id passes empty appId to AppEditor
  it('EP-006: invalid id (special chars) passes empty appId to AppEditor', async () => {
    const Page = await DeveloperAppEditPage({
      params: Promise.resolve({ id: 'invalid<script>' }),
    });
    render(Page);
    expect(screen.getByTestId('app-editor')).toHaveAttribute('data-app-id', '');
  });

  // EP-007: Page wrapper has max-w-2xl class
  it('EP-007: page wrapper has max-w-2xl class', async () => {
    const Page = await DeveloperAppEditPage({
      params: Promise.resolve({ id: 'app-001' }),
    });
    const { container } = render(Page);
    expect(container.querySelector('.max-w-2xl')).toBeInTheDocument();
  });

  // EP-008: Page has flex flex-col gap-6 outer layout
  it('EP-008: page has flex flex-col gap-6 outer layout', async () => {
    const Page = await DeveloperAppEditPage({
      params: Promise.resolve({ id: 'app-001' }),
    });
    const { container } = render(Page);
    const outerDiv = container.firstElementChild as HTMLElement;
    expect(outerDiv.className).toContain('flex');
    expect(outerDiv.className).toContain('flex-col');
    expect(outerDiv.className).toContain('gap-6');
  });

  // EP-009: isValidId rejects ids longer than 64 characters
  it('EP-009: isValidId rejects ids longer than 64 characters', async () => {
    const longId = 'a'.repeat(65);
    const Page = await DeveloperAppEditPage({
      params: Promise.resolve({ id: longId }),
    });
    render(Page);
    expect(screen.getByTestId('app-editor')).toHaveAttribute('data-app-id', '');
  });

  // EP-010: isValidId rejects ids with special characters
  it('EP-010: isValidId rejects ids with special characters', async () => {
    const Page = await DeveloperAppEditPage({
      params: Promise.resolve({ id: 'app-001@#$' }),
    });
    render(Page);
    expect(screen.getByTestId('app-editor')).toHaveAttribute('data-app-id', '');
  });

  // EP-011: Valid UUID-like id passes validation
  it('EP-011: valid UUID-like id passes validation', async () => {
    const Page = await DeveloperAppEditPage({
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    });
    render(Page);
    expect(screen.getByTestId('app-editor')).toHaveAttribute(
      'data-app-id',
      '550e8400-e29b-41d4-a716-446655440000'
    );
  });

  // EP-012: AppEditor mock is rendered (no direct form rendering in server component)
  it('EP-012: AppEditor mock is rendered, no direct form in server component', async () => {
    const Page = await DeveloperAppEditPage({
      params: Promise.resolve({ id: 'app-001' }),
    });
    render(Page);
    expect(screen.getByTestId('app-editor')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
