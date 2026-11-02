import { describe, expect, it } from 'vitest';
import { isAttachmentPathInTenant } from '../attachment-path';

describe('isAttachmentPathInTenant', () => {
  it('accepts a stored key under the tenant', () => {
    expect(
      isAttachmentPathInTenant(
        'tenant-a/0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0-report.pdf',
        'tenant-a'
      )
    ).toBe(true);
    expect(isAttachmentPathInTenant('tenant-a/x_y.v2-final.pdf', 'tenant-a')).toBe(true);
  });

  it('refuses another tenant; without a tenant it checks the shape only', () => {
    expect(isAttachmentPathInTenant('tenant-b/x.pdf', 'tenant-a')).toBe(false);
    expect(isAttachmentPathInTenant('tenant-b/x.pdf')).toBe(true);
  });

  // A storage URL is normalised after it is built: an encoded dot segment, a
  // backslash or a query/fragment would reach another tenant's object.
  it.each([
    'tenant-a/%2e%2e/tenant-b/secret.pdf',
    'tenant-a/%2E%2E/tenant-b/secret.pdf',
    'tenant-a/..%2ftenant-b/secret.pdf',
    'tenant-a/..\\tenant-b\\secret.pdf',
    'tenant-a/x.pdf?download=1',
    'tenant-a/x.pdf#frag',
    'tenant-a/../tenant-b/secret.pdf',
    'tenant-a/./x.pdf',
    'tenant-a//x.pdf',
    '/tenant-a/x.pdf',
    'tenant-a/x y.pdf',
    'tenant-a',
  ])('refuses %j', (path) => {
    expect(isAttachmentPathInTenant(path, 'tenant-a')).toBe(false);
  });
});
