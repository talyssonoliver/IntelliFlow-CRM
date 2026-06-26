/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/components/support/article-editor', () => ({
  ArticleEditor: function ArticleEditor() {
    return null;
  },
}));

describe('EditHelpArticlePage', () => {
  it('exports Metadata with the admin title and noindex robots', async () => {
    const mod = await import('../page');
    expect(mod.metadata.title).toBe('Edit Help Article — Admin');
    expect(mod.metadata.robots).toMatchObject({ index: false });
  });

  it('awaits params and renders ArticleEditor in edit mode with the article id', async () => {
    const mod = await import('../page');
    const result = (await mod.default({ params: Promise.resolve({ id: 'art-42' }) })) as {
      type: { name: string };
      props: { mode: string; articleId: string };
    };
    expect(result.type.name).toBe('ArticleEditor');
    expect(result.props.mode).toBe('edit');
    expect(result.props.articleId).toBe('art-42');
  });
});
