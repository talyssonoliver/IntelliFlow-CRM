import { describe, expect, it } from 'vitest';

import Image, { alt, contentType, size } from '../opengraph-image';

// IFC-208: root og:image (content-audit F-006). Covers the exported
// file-metadata contract Next.js reads (size/alt/contentType) and that the
// generator itself produces a real image response rather than throwing.
describe('root opengraph-image', () => {
  it('declares the expected Open Graph image metadata', () => {
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe('image/png');
    expect(alt).toContain('IntelliFlow CRM');
  });

  it('renders a PNG image response at the declared size', async () => {
    const response = await Image();

    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('content-type')).toBe('image/png');

    const body = await response.arrayBuffer();
    expect(body.byteLength).toBeGreaterThan(0);
  });
});
