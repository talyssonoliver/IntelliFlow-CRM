import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrollToSection } from '../scroll-to-section';

describe('scrollToSection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('scrolls the section into view after the next frame', () => {
    const section = document.createElement('section');
    section.id = 'lead-tabs';
    section.scrollIntoView = vi.fn();
    document.body.appendChild(section);
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });

    scrollToSection('lead-tabs');

    expect(section.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('does nothing when the section is not on the page', () => {
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    expect(() => scrollToSection('missing')).not.toThrow();
  });
});

describe('scrollToSection without scrollIntoView', () => {
  it('does not throw where the browser has no scrollIntoView', () => {
    const section = document.createElement('section');
    section.id = 'no-scroll';
    Object.defineProperty(section, 'scrollIntoView', { value: undefined });
    document.body.appendChild(section);
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    expect(() => scrollToSection('no-scroll')).not.toThrow();
  });
});
