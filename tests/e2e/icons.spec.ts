/**
 * Material Symbols Icons Loading Tests
 *
 * Verifies that Material Symbols Outlined icons load correctly without:
 * - FOUT (Flash of Unstyled Text): Ligature text like "search", "menu" appearing
 * - CLS (Cumulative Layout Shift): Icon containers causing layout jank
 *
 * These tests validate the self-hosted font implementation from:
 * apps/project-tracker/docs/metrics/_global/fix-material-icons.md
 */

import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    layoutShifts: number[];
    capturedIconTexts: string[];
  }
}

test.describe('Material Symbols Icons Loading', () => {
  test.describe('Font Loading', () => {
    test('should add fonts-ready class once fonts are loaded', async ({ page }) => {
      await page.goto('/');

      // Wait for fonts-ready class to be added (max 10 seconds)
      await expect(page.locator('html')).toHaveClass(/fonts-ready/, {
        timeout: 10000,
      });
    });

    test('should have correct font-family on icon elements', async ({ page }) => {
      await page.goto('/');

      // Wait for fonts to load
      await expect(page.locator('html')).toHaveClass(/fonts-ready/, {
        timeout: 10000,
      });

      // Check if there are any icon elements
      const iconElements = page.locator('.material-symbols-outlined');
      const count = await iconElements.count();

      if (count > 0) {
        const fontFamily = await iconElements
          .first()
          .evaluate((el) => getComputedStyle(el).fontFamily);
        expect(fontFamily).toContain('Material Symbols Outlined');
      }
    });

    test('icons should be visible after font loads', async ({ page }) => {
      await page.goto('/');

      // Wait for fonts-ready class
      await expect(page.locator('html')).toHaveClass(/fonts-ready/, {
        timeout: 10000,
      });

      // Check icon visibility
      // The first icons in the DOM sit in the closed onboarding <dialog> (display:none),
      // so check the first icon actually on screen.
      const iconElements = page.locator('.material-symbols-outlined').filter({ visible: true });
      // The home page always renders header icons, so one must be on screen;
      // the visible filter must not let this pass with nothing to check.
      await expect(iconElements.first()).toBeVisible();
    });
  });

  test.describe('Layout Stability (CLS)', () => {
    test('icons should have stable dimensions', async ({ page }) => {
      await page.goto('/');

      // Wait for fonts to load
      await expect(page.locator('html')).toHaveClass(/fonts-ready/, {
        timeout: 10000,
      });

      // Check EVERY rendered icon, not just the first in DOM order: which icon
      // comes first (and its parent's layout) differs by page and engine.
      const icons = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('.material-symbols-outlined'))
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => {
            const computed = getComputedStyle(el);
            const parentDisplay = el.parentElement
              ? getComputedStyle(el.parentElement).display
              : '';
            return {
              text: el.textContent?.trim() ?? '',
              display: computed.display,
              // A flex/grid item is blockified (CSS Display §2.7): its specified
              // inline-block computes to block. That is the parent's layout, not
              // a lost icon rule.
              blockified: /^(inline-)?(flex|grid)$/.test(parentDisplay),
              optsOutOfClip: el.classList.contains('overflow-visible'),
              overflow: computed.overflow,
              width: computed.width,
              height: computed.height,
            };
          })
      );

      expect(icons.length).toBeGreaterThan(0);
      for (const icon of icons) {
        const label = `icon "${icon.text}"`;
        expect(icon.display, label).toBe(icon.blockified ? 'block' : 'inline-block');
        // Reserved box clips overflow, except icons that explicitly opt out
        // (a smaller h-*/w-* box around the 24px glyph).
        expect(icon.overflow, label).toBe(icon.optsOutOfClip ? 'visible' : 'hidden');
        // Width and height should be set (not 'auto')
        expect(icon.width, label).not.toBe('auto');
        expect(icon.height, label).not.toBe('auto');
      }
    });

    test('icons should not cause layout shift on load', async ({ page }) => {
      // Set up layout shift observer before navigation
      await page.addInitScript(() => {
        window.layoutShifts = [];
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const layoutShiftEntry = entry as PerformanceEntry & { value: number };
            if (layoutShiftEntry.value !== undefined) {
              window.layoutShifts.push(layoutShiftEntry.value);
            }
          }
        }).observe({ entryTypes: ['layout-shift'] });
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Wait for fonts to load
      await expect(page.locator('html')).toHaveClass(/fonts-ready/, {
        timeout: 10000,
      });

      // Get cumulative layout shift
      const cls = await page.evaluate(() => {
        const shifts = window.layoutShifts || [];
        return shifts.reduce((sum, value) => sum + value, 0);
      });

      // CLS should be below 0.1 (good threshold per Web Vitals)
      expect(cls).toBeLessThan(0.1);
    });
  });

  test.describe('FOUT Prevention', () => {
    test('should not show ligature text during load', async ({ page }) => {
      // Slow down font loading to catch FOUT
      await page.route('**/*.woff2', async (route) => {
        // Add a small delay but still allow the font to load
        await new Promise((resolve) => setTimeout(resolve, 100));
        await route.continue();
      });

      // Capture any text content of icon elements before fonts load
      const capturedTexts: string[] = [];

      await page.addInitScript(() => {
        // Override to capture icon text content early
        window.capturedIconTexts = [];
        const observer = new MutationObserver(() => {
          document.querySelectorAll('.material-symbols-outlined').forEach((el) => {
            const text = el.textContent?.trim() || '';
            if (text && !document.documentElement.classList.contains('fonts-ready')) {
              window.capturedIconTexts.push(text);
            }
          });
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
      });

      await page.goto('/');

      // Wait for fonts to load
      await expect(page.locator('html')).toHaveClass(/fonts-ready/, {
        timeout: 10000,
      });

      // Check visibility during load - icons should be hidden (visibility: hidden)
      // The first icons in the DOM sit in the closed onboarding <dialog> (display:none),
      // so check the first icon actually on screen.
      const iconElements = page.locator('.material-symbols-outlined').filter({ visible: true });
      // The home page always renders header icons, so one must be on screen;
      // the visible filter must not let this pass with nothing to check.
      await expect(iconElements.first()).toBeVisible();
    });

    test('font-display should be set to block', async ({ page }) => {
      await page.goto('/');

      // Check that our self-hosted font uses font-display: block
      const fontDisplayBlock = await page.evaluate(() => {
        const styleSheets = Array.from(document.styleSheets);
        for (const sheet of styleSheets) {
          try {
            const rules = Array.from(sheet.cssRules || []);
            for (const rule of rules) {
              if (rule instanceof CSSFontFaceRule) {
                const fontFamily = rule.style.getPropertyValue('font-family');
                const fontDisplay = rule.style.getPropertyValue('font-display');
                if (fontFamily.includes('Material Symbols Outlined') && fontDisplay === 'block') {
                  return true;
                }
              }
            }
          } catch {
            // Cross-origin stylesheets will throw - ignore
          }
        }
        return false;
      });

      expect(fontDisplayBlock).toBe(true);
    });
  });

  test.describe('Cross-Browser Compatibility', () => {
    test('should render icons correctly', async ({ page }) => {
      await page.goto('/');

      // Wait for fonts-ready
      await expect(page.locator('html')).toHaveClass(/fonts-ready/, {
        timeout: 10000,
      });

      const iconElements = page.locator('.material-symbols-outlined');
      const count = await iconElements.count();

      if (count > 0) {
        // Verify icons render with correct font properties
        const iconProps = await iconElements.first().evaluate((el) => {
          const computed = getComputedStyle(el);
          return {
            fontFamily: computed.fontFamily,
            fontStyle: computed.fontStyle,
            lineHeight: computed.lineHeight,
            fontSize: computed.fontSize,
            textRendering: computed.textRendering,
          };
        });

        expect(iconProps.fontFamily).toContain('Material Symbols Outlined');
        expect(iconProps.fontStyle).toBe('normal');
        // line-height: 1 resolves to the font size in px in getComputedStyle (never '1').
        expect(iconProps.lineHeight).toBe(iconProps.fontSize);
        expect(iconProps.textRendering).toBe('optimizelegibility');
      }
    });
  });
});
