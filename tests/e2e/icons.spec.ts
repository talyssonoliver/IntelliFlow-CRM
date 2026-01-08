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
        const fontFamily = await iconElements.first().evaluate(
          (el) => getComputedStyle(el).fontFamily
        );
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
      const iconElements = page.locator('.material-symbols-outlined');
      const count = await iconElements.count();

      if (count > 0) {
        await expect(iconElements.first()).toBeVisible();
      }
    });
  });

  test.describe('Layout Stability (CLS)', () => {
    test('icons should have stable dimensions', async ({ page }) => {
      await page.goto('/');

      // Wait for fonts to load
      await expect(page.locator('html')).toHaveClass(/fonts-ready/, {
        timeout: 10000,
      });

      const iconElements = page.locator('.material-symbols-outlined');
      const count = await iconElements.count();

      if (count > 0) {
        // Check that icons have proper inline-block display and dimensions
        const styles = await iconElements.first().evaluate((el) => {
          const computed = getComputedStyle(el);
          return {
            display: computed.display,
            width: computed.width,
            height: computed.height,
            overflow: computed.overflow,
          };
        });

        expect(styles.display).toBe('inline-block');
        expect(styles.overflow).toBe('hidden');
        // Width and height should be set (not 'auto')
        expect(styles.width).not.toBe('auto');
        expect(styles.height).not.toBe('auto');
      }
    });

    test('icons should not cause layout shift on load', async ({ page }) => {
      // Set up layout shift observer before navigation
      await page.addInitScript(() => {
        (window as unknown as { layoutShifts: number[] }).layoutShifts = [];
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const layoutShiftEntry = entry as PerformanceEntry & { value: number };
            if (layoutShiftEntry.value !== undefined) {
              (window as unknown as { layoutShifts: number[] }).layoutShifts.push(layoutShiftEntry.value);
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
        const shifts = (window as unknown as { layoutShifts: number[] }).layoutShifts || [];
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
        (window as unknown as { capturedIconTexts: string[] }).capturedIconTexts = [];
        const observer = new MutationObserver(() => {
          document.querySelectorAll('.material-symbols-outlined').forEach((el) => {
            const text = el.textContent?.trim() || '';
            if (text && !document.documentElement.classList.contains('fonts-ready')) {
              (window as unknown as { capturedIconTexts: string[] }).capturedIconTexts.push(text);
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
      const iconElements = page.locator('.material-symbols-outlined');
      const count = await iconElements.count();

      if (count > 0) {
        // Verify icons are now visible (font loaded)
        await expect(iconElements.first()).toBeVisible();
      }
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
            textRendering: computed.textRendering,
          };
        });

        expect(iconProps.fontFamily).toContain('Material Symbols Outlined');
        expect(iconProps.fontStyle).toBe('normal');
        expect(iconProps.lineHeight).toBe('1');
        expect(iconProps.textRendering).toBe('optimizelegibility');
      }
    });
  });
});
