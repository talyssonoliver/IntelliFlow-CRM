// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}));

const { mobileDrawerPosition } = await import('../AppSidebar');

describe('mobile drawer', () => {
  it('has a shadow while open', () => {
    expect(mobileDrawerPosition(true)).toContain('shadow-2xl');
    expect(mobileDrawerPosition(true)).toContain('translate-x-0');
  });

  it('casts none while closed, when it sits off screen beside the page', () => {
    expect(mobileDrawerPosition(false)).not.toContain('shadow');
    expect(mobileDrawerPosition(false)).toContain('-translate-x-full');
  });
});
