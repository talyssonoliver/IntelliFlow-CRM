/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/components/support/article-editor', () => ({
  ArticleEditor: function ArticleEditor() {
    return null;
  },
}));

describe('NewHelpArticlePage', () => {
  it('exports Metadata with the admin title and noindex robots', async () => {
    const mod = await import('../page');
    expect(mod.metadata.title).toBe('New Help Article — Admin');
    expect(mod.metadata.robots).toMatchObject({ index: false });
  });

  it('renders ArticleEditor in create mode', async () => {
    const mod = await import('../page');
    const result = mod.default() as { type: { name: string }; props: { mode: string } };
    expect(result.type.name).toBe('ArticleEditor');
    expect(result.props.mode).toBe('create');
  });
});
