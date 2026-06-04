import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — .mjs module ships without a .d.ts declaration; its
// exports are tested here via runtime assertions.
import {
  extractIconNamesFromSource,
  stripComments,
  resolveDynamicSites,
  diffAgainstAudit,
  serializeAudit,
  parseIconMapping,
  main,
  verify,
  checkSize,
  scanRepo,
  MAX_FONT_BYTES,
  AUDIT_PATH,
  FONT_OUTPUT,
  ICON_MAPPING_PATH,
} from '../subset-material-symbols.mjs';

// ---------------------------------------------------------------------------
// extractIconNamesFromSource — JSX literal + dynamic capture
// ---------------------------------------------------------------------------

describe('extractIconNamesFromSource', () => {
  it('captures a single literal ligature child', () => {
    const src = `<span className="material-symbols-outlined">arrow_back</span>`;
    const { icons, dynamicSites } = extractIconNamesFromSource(src, 'a.tsx');
    expect([...icons]).toEqual(['arrow_back']);
    expect(dynamicSites).toEqual([]);
  });

  it('captures multi-line JSX with extra classes', () => {
    const src = [
      '<span',
      '  className="material-symbols-outlined text-base"',
      '  aria-hidden="true"',
      '>check_circle</span>',
    ].join('\n');
    const { icons } = extractIconNamesFromSource(src, 'b.tsx');
    expect(icons.has('check_circle')).toBe(true);
  });

  it('captures two icons in the same file', () => {
    const src =
      `<span className="material-symbols-outlined">search</span>\n` +
      `<span className="material-symbols-outlined">close</span>`;
    const { icons } = extractIconNamesFromSource(src, 'c.tsx');
    expect([...icons].sort()).toEqual(['close', 'search']);
  });

  it('captures span nested in className={cn(...)} wrapper', () => {
    const src = `<span className={cn('material-symbols-outlined', size)}>smart_toy</span>`;
    const { icons } = extractIconNamesFromSource(src, 'cn.tsx');
    expect(icons.has('smart_toy')).toBe(true);
  });

  it('captures span nested in className={clsx(...)} wrapper', () => {
    const src = `<span className={clsx('material-symbols-outlined', isActive && 'text-primary')}>fiber_manual_record</span>`;
    const { icons } = extractIconNamesFromSource(src, 'clsx.tsx');
    expect(icons.has('fiber_manual_record')).toBe(true);
  });

  it('captures span with className={`... material-symbols-outlined ...`} template literal', () => {
    const src = '<span className={`${base} material-symbols-outlined ${size}`}>push_pin</span>';
    const { icons } = extractIconNamesFromSource(src, 'tpl.tsx');
    expect(icons.has('push_pin')).toBe(true);
  });

  it('captures span with ternary className expression', () => {
    const src =
      "<span className={isActive ? 'material-symbols-outlined text-primary' : 'material-symbols-outlined'}>credit_card</span>";
    const { icons } = extractIconNamesFromSource(src, 'tern.tsx');
    expect(icons.has('credit_card')).toBe(true);
  });

  it('captures icon: "name" property literals', () => {
    const src = `const config = { icon: 'check_circle', label: 'Ok' };`;
    const { icons } = extractIconNamesFromSource(src, 'd.ts');
    expect(icons.has('check_circle')).toBe(true);
  });

  it('captures iconName JSX prop literals', () => {
    const src = `<MaterialIcon iconName="archive" />`;
    const { icons } = extractIconNamesFromSource(src, 'e.tsx');
    expect(icons.has('archive')).toBe(true);
  });

  it('flags dynamic child as dynamicSite and does not add to icons', () => {
    const src = `<span className="material-symbols-outlined">{iconName}</span>`;
    const { icons, dynamicSites } = extractIconNamesFromSource(src, 'f.tsx');
    expect(icons.size).toBe(0);
    expect(dynamicSites.length).toBe(1);
    expect(dynamicSites[0].snippet).toBe('iconName');
    expect(dynamicSites[0].file).toBe('f.tsx');
  });

  it('ignores class-only spans without text children', () => {
    const src = `<span className="material-symbols-outlined" />`;
    const { icons, dynamicSites } = extractIconNamesFromSource(src, 'g.tsx');
    expect(icons.size).toBe(0);
    expect(dynamicSites.length).toBe(0);
  });

  it('captures glyph passed to local <Icon name="..."> helper (single-quote)', () => {
    const src = `<Icon name='smart_toy' className="text-xl" />`;
    const { icons } = extractIconNamesFromSource(src, 'icon-helper.tsx');
    expect(icons.has('smart_toy')).toBe(true);
  });

  it('captures glyph passed to local <Icon name="..."> helper (double-quote)', () => {
    const src = `<Icon name="refresh" className="text-base" />`;
    const { icons } = extractIconNamesFromSource(src, 'icon-helper.tsx');
    expect(icons.has('refresh')).toBe(true);
  });

  it('captures multiple <Icon name="..."> calls in the same file', () => {
    const src =
      `<Icon name="check" />\n` +
      `<Icon name="close" className="text-sm" />\n` +
      `<Icon name="arrow_upward" />`;
    const { icons } = extractIconNamesFromSource(src, 'multi-icon.tsx');
    expect([...icons].sort()).toEqual(['arrow_upward', 'check', 'close']);
  });

  it('does NOT capture name= from non-Icon JSX tags (avoids false positives)', () => {
    const src = `<input name="email" /><form name="login" />`;
    const { icons } = extractIconNamesFromSource(src, 'form.tsx');
    expect(icons.has('email')).toBe(false);
    expect(icons.has('login')).toBe(false);
  });

  it('does NOT harvest icon names from block-comment example text', () => {
    const src = [
      '/**',
      ' * Example: <span className="material-symbols-outlined">icon_name</span>',
      ' */',
      'export const x = 1;',
    ].join('\n');
    const { icons } = extractIconNamesFromSource(src, 'doc.ts');
    expect(icons.has('icon_name')).toBe(false);
  });

  it('does NOT harvest icon names from line-comment text', () => {
    const src =
      `// This file used to ship <span className="material-symbols-outlined">deprecated_ignore</span>\n` +
      `export const x = 1;`;
    const { icons } = extractIconNamesFromSource(src, 'line.ts');
    expect(icons.has('deprecated_ignore')).toBe(false);
  });

  it('returns empty on malformed JSX open (no closing `>` before EOF)', () => {
    const src = `<span className="material-symbols-outlined"`;
    const { icons, dynamicSites } = extractIconNamesFromSource(src, 'mal.tsx');
    expect(icons.size).toBe(0);
    expect(dynamicSites.length).toBe(0);
  });

  it('ignores marker occurrences outside any JSX `<` opener', () => {
    const src = `const doc = "The material-symbols-outlined font is loaded via next/font/local.";`;
    const { icons, dynamicSites } = extractIconNamesFromSource(src, 'comment.ts');
    expect(icons.size).toBe(0);
    expect(dynamicSites.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// stripComments
// ---------------------------------------------------------------------------

describe('stripComments', () => {
  it('removes line comments', () => {
    expect(stripComments('const x = 1; // comment\nconst y = 2;')).toContain('const y = 2;');
    expect(stripComments('const x = 1; // comment\nconst y = 2;')).not.toContain('comment');
  });

  it('removes block comments including multi-line', () => {
    const src = 'a\n/* line1\n line2 */\nb';
    expect(stripComments(src)).not.toContain('line1');
    expect(stripComments(src)).not.toContain('line2');
  });

  it('preserves `://` URL sequences', () => {
    expect(stripComments('const u = "https://example.com/path";')).toContain('example.com/path');
  });
});

// ---------------------------------------------------------------------------
// resolveDynamicSites
// ---------------------------------------------------------------------------

describe('resolveDynamicSites', () => {
  const iconMapping = { Check: 'check', ChevronDown: 'expand_more', Trash: 'delete' };

  it('returns the iconMapping values union when any dynamic site exists', () => {
    const scan = {
      dynamicSites: [{ file: 'x', line: 1, snippet: 'config.icon' }],
    };
    const { resolved } = resolveDynamicSites(scan, { iconMapping, allowList: [] });
    expect(resolved.has('check')).toBe(true);
    expect(resolved.has('delete')).toBe(true);
  });

  it('returns empty resolved set when no dynamic sites exist', () => {
    const { resolved } = resolveDynamicSites({ dynamicSites: [] }, { iconMapping, allowList: [] });
    expect(resolved.size).toBe(0);
  });

  it('marks a site as covered when snippet ends in .icon', () => {
    const scan = { dynamicSites: [{ file: 'x', line: 1, snippet: 'config.icon' }] };
    const { unresolved } = resolveDynamicSites(scan, { iconMapping, allowList: [] });
    expect(unresolved).toEqual([]);
  });

  it('marks a site as covered when snippet ends in .name', () => {
    const scan = { dynamicSites: [{ file: 'x', line: 1, snippet: 'item.name' }] };
    const { unresolved } = resolveDynamicSites(scan, { iconMapping, allowList: [] });
    expect(unresolved).toEqual([]);
  });

  it('marks a site as covered when snippet is an array/map subscript', () => {
    const scan = { dynamicSites: [{ file: 'x', line: 1, snippet: 'ENTITY_ICONS[entity.type]' }] };
    const { unresolved } = resolveDynamicSites(scan, { iconMapping, allowList: [] });
    expect(unresolved).toEqual([]);
  });

  it('marks a site as covered for getXxxIcon() function calls', () => {
    const scan = { dynamicSites: [{ file: 'x', line: 1, snippet: 'getFileTypeIcon(file.type)' }] };
    const { unresolved } = resolveDynamicSites(scan, { iconMapping, allowList: [] });
    expect(unresolved).toEqual([]);
  });

  it('marks a site as covered when identifier ends in Icon/Name', () => {
    const scan = {
      dynamicSites: [
        { file: 'x', line: 1, snippet: 'displayIcon' },
        { file: 'x', line: 2, snippet: 'fileIconName' },
      ],
    };
    const { unresolved } = resolveDynamicSites(scan, { iconMapping, allowList: [] });
    expect(unresolved).toEqual([]);
  });

  it('marks a site as covered when snippet is a bare "icon" identifier', () => {
    const scan = { dynamicSites: [{ file: 'x', line: 1, snippet: 'icon' }] };
    const { unresolved } = resolveDynamicSites(scan, { iconMapping, allowList: [] });
    expect(unresolved).toEqual([]);
  });

  it('marks a site as covered when snippet is a ternary between two literal icon names', () => {
    const scan = {
      dynamicSites: [
        { file: 'x', line: 1, snippet: "isRescheduling ? 'hourglass_empty' : 'calendar_month'" },
      ],
    };
    const { unresolved } = resolveDynamicSites(scan, { iconMapping, allowList: [] });
    expect(unresolved).toEqual([]);
  });

  it("marks a site as covered for bare string-literal children like {'push_pin'}", () => {
    const scan = { dynamicSites: [{ file: 'x', line: 1, snippet: "'push_pin'" }] };
    const { unresolved } = resolveDynamicSites(scan, { iconMapping, allowList: [] });
    expect(unresolved).toEqual([]);
  });

  it('marks a site as unresolved when snippet references an unknown identifier', () => {
    const scan = { dynamicSites: [{ file: 'x', line: 1, snippet: 'randomExpression' }] };
    const { unresolved } = resolveDynamicSites(scan, { iconMapping, allowList: [] });
    expect(unresolved.length).toBe(1);
    expect(unresolved[0].snippet).toBe('randomExpression');
  });

  it('respects allowList', () => {
    const scan = { dynamicSites: [{ file: 'x', line: 1, snippet: 'customProp' }] };
    const { unresolved } = resolveDynamicSites(scan, { iconMapping, allowList: ['customProp'] });
    expect(unresolved).toEqual([]);
  });

  it('unions allowList entries into resolved', () => {
    const scan = { dynamicSites: [{ file: 'x', line: 1, snippet: 'icon' }] };
    const { resolved } = resolveDynamicSites(scan, { iconMapping, allowList: ['custom_glyph'] });
    expect(resolved.has('custom_glyph')).toBe(true);
  });

  it('tolerates missing iconMapping/allowList options', () => {
    const scan = { dynamicSites: [{ file: 'x', line: 1, snippet: 'config.icon' }] };
    // @ts-expect-error — exercising the nullish-default branches
    const { resolved, unresolved } = resolveDynamicSites(scan, {});
    expect(resolved.size).toBe(0);
    expect(unresolved).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// diffAgainstAudit
// ---------------------------------------------------------------------------

describe('diffAgainstAudit', () => {
  it('returns ok when discovered is subset of audit', () => {
    const diff = diffAgainstAudit(['a', 'b'], { icons: ['a', 'b', 'c'] });
    expect(diff.ok).toBe(true);
    expect(diff.missing).toEqual([]);
    expect(diff.added).toEqual(['c']);
  });

  it('returns not-ok when discovered has a new icon', () => {
    const diff = diffAgainstAudit(['a', 'new'], { icons: ['a'] });
    expect(diff.ok).toBe(false);
    expect(diff.missing).toEqual(['new']);
  });

  it('sorts both lists lexicographically', () => {
    const diff = diffAgainstAudit(['z', 'a', 'm'], { icons: ['m', 'q'] });
    expect(diff.missing).toEqual(['a', 'z']);
    expect(diff.added).toEqual(['q']);
  });

  it('treats missing audit.icons as empty set', () => {
    const diff = diffAgainstAudit(['x'], {});
    expect(diff.ok).toBe(false);
    expect(diff.missing).toEqual(['x']);
  });
});

// ---------------------------------------------------------------------------
// serializeAudit
// ---------------------------------------------------------------------------

describe('serializeAudit', () => {
  it('produces JSON ending with \\n', () => {
    const s = serializeAudit({ icons: ['b', 'a'], icons_count: 0 });
    expect(s.endsWith('\n')).toBe(true);
  });

  it('sorts and de-duplicates the icons array', () => {
    const s = serializeAudit({ icons: ['b', 'a', 'a', 'c'] });
    const parsed = JSON.parse(s);
    expect(parsed.icons).toEqual(['a', 'b', 'c']);
    expect(parsed.icons_count).toBe(3);
  });

  it('emits keys in canonical order', () => {
    const s = serializeAudit({
      subsetted_bytes: 1,
      icons: ['a'],
      generated_at: '2026-01-01T00:00:00Z',
      upstream_font_sha256: 'hash',
    });
    const firstKey = s.match(/"([^"]+)":/)?.[1];
    expect(firstKey).toBe('generated_at');
  });

  it('appends unknown keys at the end rather than dropping them', () => {
    const s = serializeAudit({ icons: ['a'], customField: 'preserved' });
    expect(JSON.parse(s).customField).toBe('preserved');
  });
});

// ---------------------------------------------------------------------------
// parseIconMapping
// ---------------------------------------------------------------------------

describe('parseIconMapping', () => {
  it('extracts key/value entries from an ICON_MAPPING declaration', () => {
    const src = `
      export const ICON_MAPPING = {
        Check: 'check',
        ChevronDown: 'expand_more',
        // comment
        Trash: 'delete',
      } as const;
    `;
    const m = parseIconMapping(src);
    expect(m.Check).toBe('check');
    expect(m.ChevronDown).toBe('expand_more');
    expect(m.Trash).toBe('delete');
  });

  it('returns {} when ICON_MAPPING is absent', () => {
    expect(parseIconMapping('const x = 1;')).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// CLI / integration
// ---------------------------------------------------------------------------

describe('main CLI', () => {
  const captured: { info: string[]; error: string[] } = { info: [], error: [] };
  const log = {
    info: (s: string) => captured.info.push(s),
    error: (s: string) => captured.error.push(s),
  };

  afterEach(() => {
    captured.info.length = 0;
    captured.error.length = 0;
  });

  it('--help exits 0 and prints usage', async () => {
    const code = await main(['--help'], { log });
    expect(code).toBe(0);
    expect(captured.info.join('\n')).toMatch(/Usage/);
  });

  it('-h alias also exits 0 with usage', async () => {
    const code = await main(['-h'], { log });
    expect(code).toBe(0);
    expect(captured.info.join('\n')).toMatch(/Usage/);
  });

  it('main([]) (no flags) invokes regenerate with the provided subsetFont', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'pg195-'));
    try {
      mkdirSync(join(tmp, 'apps/web/src'), { recursive: true });
      mkdirSync(join(tmp, 'apps/web/public/fonts'), { recursive: true });
      mkdirSync(join(tmp, 'packages/ui/src/lib'), { recursive: true });
      mkdirSync(join(tmp, 'artifacts/reports'), { recursive: true });
      mkdirSync(join(tmp, 'tools/scripts/fixtures'), { recursive: true });
      writeFileSync(join(tmp, 'package.json'), JSON.stringify({ devDependencies: {} }));
      writeFileSync(
        join(tmp, 'apps/web/src/page.tsx'),
        `<span className="material-symbols-outlined">search</span>`
      );
      writeFileSync(
        join(tmp, 'packages/ui/src/lib/icon-mapping.ts'),
        `export const ICON_MAPPING = {} as const;`
      );
      writeFileSync(
        join(tmp, 'tools/scripts/fixtures/MaterialSymbolsOutlined-upstream.woff2'),
        Buffer.alloc(1_000)
      );
      const subsetSpy = vi.fn(async () => Buffer.alloc(42));
      const code = await main([], { log, repoRoot: tmp, subsetFont: subsetSpy });
      expect(code).toBe(0);
      expect(subsetSpy).toHaveBeenCalledOnce();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('--verify against a tmp repo missing the audit returns 1', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'pg195-'));
    try {
      mkdirSync(join(tmp, 'packages/ui/src/lib'), { recursive: true });
      writeFileSync(
        join(tmp, 'packages/ui/src/lib/icon-mapping.ts'),
        `export const ICON_MAPPING = { Check: 'check' } as const;`
      );
      const code = await main(['--verify'], { log, repoRoot: tmp });
      expect(code).toBe(1);
      expect(captured.error.join('\n')).toMatch(/audit JSON missing/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('--check-size against a tmp repo missing the font returns 1', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'pg195-'));
    try {
      const code = await main(['--check-size'], { log, repoRoot: tmp });
      expect(code).toBe(1);
      expect(captured.error.join('\n')).toMatch(/font missing/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('--check-size returns 0 when font is below MAX_FONT_BYTES', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'pg195-'));
    try {
      mkdirSync(join(tmp, 'apps/web/public/fonts'), { recursive: true });
      writeFileSync(join(tmp, FONT_OUTPUT), Buffer.alloc(100_000));
      const code = await main(['--check-size'], { log, repoRoot: tmp });
      expect(code).toBe(0);
      expect(captured.info.join('\n')).toMatch(/font size OK/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('--check-size returns 1 when font exceeds MAX_FONT_BYTES', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'pg195-'));
    try {
      mkdirSync(join(tmp, 'apps/web/public/fonts'), { recursive: true });
      writeFileSync(join(tmp, FONT_OUTPUT), Buffer.alloc(MAX_FONT_BYTES + 1));
      const code = await main(['--check-size'], { log, repoRoot: tmp });
      expect(code).toBe(1);
      expect(captured.error.join('\n')).toMatch(/font size/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('--verify succeeds on a tmp repo whose audit covers discovered icons', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'pg195-'));
    try {
      // Synthesise a minimum repo shape:
      //   - apps/web/src/page.tsx with one icon literal
      //   - packages/ui/src/lib/icon-mapping.ts with a mapping
      //   - artifacts/reports/material-symbols-glyph-audit.json with matching audit
      mkdirSync(join(tmp, 'apps/web/src'), { recursive: true });
      mkdirSync(join(tmp, 'packages/ui/src/lib'), { recursive: true });
      mkdirSync(join(tmp, 'artifacts/reports'), { recursive: true });
      writeFileSync(
        join(tmp, 'apps/web/src/page.tsx'),
        `export const Page = () => <span className="material-symbols-outlined">search</span>;`
      );
      writeFileSync(
        join(tmp, 'packages/ui/src/lib/icon-mapping.ts'),
        `export const ICON_MAPPING = { Search: 'search' } as const;`
      );
      const audit = {
        generated_at: '2026-01-01T00:00:00Z',
        icons: ['search'],
        icons_count: 1,
        explicit_allow_list: [],
      };
      writeFileSync(join(tmp, AUDIT_PATH), JSON.stringify(audit));

      const code = await main(['--verify'], { log, repoRoot: tmp });
      expect(code).toBe(0);
      expect(captured.info.join('\n')).toMatch(/audit OK/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('--verify reports unresolved dynamic sites when audit has no coverage for them', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'pg195-'));
    try {
      mkdirSync(join(tmp, 'apps/web/src'), { recursive: true });
      mkdirSync(join(tmp, 'packages/ui/src/lib'), { recursive: true });
      mkdirSync(join(tmp, 'artifacts/reports'), { recursive: true });
      // A dynamic site referencing an unknown identifier, with an empty
      // ICON_MAPPING so resolveDynamicSites cannot cover it via the mapping
      // union and no allowList entry exists.
      writeFileSync(
        join(tmp, 'apps/web/src/page.tsx'),
        `<span className="material-symbols-outlined">{mysteryExpression}</span>`
      );
      writeFileSync(
        join(tmp, 'packages/ui/src/lib/icon-mapping.ts'),
        `export const ICON_MAPPING = {} as const;`
      );
      const audit = {
        generated_at: '2026-01-01T00:00:00Z',
        icons: [],
        icons_count: 0,
        explicit_allow_list: [],
      };
      writeFileSync(join(tmp, AUDIT_PATH), JSON.stringify(audit));

      const code = await main(['--verify'], { log, repoRoot: tmp });
      expect(code).toBe(1);
      expect(captured.error.join('\n')).toMatch(/unresolved dynamic icon sites/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('--verify detects drift when source adds an icon not in audit', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'pg195-'));
    try {
      mkdirSync(join(tmp, 'apps/web/src'), { recursive: true });
      mkdirSync(join(tmp, 'packages/ui/src/lib'), { recursive: true });
      mkdirSync(join(tmp, 'artifacts/reports'), { recursive: true });
      writeFileSync(
        join(tmp, 'apps/web/src/page.tsx'),
        `export const Page = () => (
           <>
             <span className="material-symbols-outlined">search</span>
             <span className="material-symbols-outlined">fabricated_glyph_pg195</span>
           </>
         );`
      );
      writeFileSync(
        join(tmp, 'packages/ui/src/lib/icon-mapping.ts'),
        `export const ICON_MAPPING = { Search: 'search' } as const;`
      );
      const audit = {
        generated_at: '2026-01-01T00:00:00Z',
        icons: ['search'],
        icons_count: 1,
        explicit_allow_list: [],
      };
      writeFileSync(join(tmp, AUDIT_PATH), JSON.stringify(audit));

      const code = await main(['--verify'], { log, repoRoot: tmp });
      expect(code).toBe(1);
      expect(captured.error.join('\n')).toMatch(/fabricated_glyph_pg195/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// scanRepo (integration, read-only against real repo)
// ---------------------------------------------------------------------------

describe('scanRepo', () => {
  it('returns a non-empty icon set and files list against the real repo', async () => {
    const { icons, files } = await scanRepo();
    expect(files.length).toBeGreaterThan(100);
    expect(icons.size).toBeGreaterThan(50);
    // The `settings` gear icon is extremely common in the sidebar
    expect(icons.has('settings')).toBe(true);
  });

  it('respects repoRoot override and returns empty against an empty tmp repo', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'pg195-'));
    try {
      const { icons, files } = await scanRepo({ repoRoot: tmp });
      expect(files.length).toBe(0);
      expect(icons.size).toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// regenerate (integration against a tmp repo with mocked subsetFont)
// ---------------------------------------------------------------------------

describe('regenerate', () => {
  it('produces a subsetted font + audit JSON and returns bytes count', async () => {
    // Import regenerate lazily so it shares the same module instance as the
    // rest of the test (vitest caches ESM imports).
    const mod: any = await import('../subset-material-symbols.mjs');
    const tmp = mkdtempSync(join(tmpdir(), 'pg195-'));
    try {
      mkdirSync(join(tmp, 'apps/web/src'), { recursive: true });
      mkdirSync(join(tmp, 'apps/web/public/fonts'), { recursive: true });
      mkdirSync(join(tmp, 'packages/ui/src/lib'), { recursive: true });
      mkdirSync(join(tmp, 'artifacts/reports'), { recursive: true });
      mkdirSync(join(tmp, 'tools/scripts/fixtures'), { recursive: true });
      writeFileSync(
        join(tmp, 'package.json'),
        JSON.stringify({ devDependencies: { 'subset-font': '^2.5.0' } })
      );
      writeFileSync(
        join(tmp, 'apps/web/src/page.tsx'),
        `<span className="material-symbols-outlined">search</span>`
      );
      writeFileSync(
        join(tmp, 'packages/ui/src/lib/icon-mapping.ts'),
        `export const ICON_MAPPING = { Check: 'check' } as const;`
      );
      // Synthesise a minimal "upstream font" fixture of any bytes — the mock
      // subsetFont below ignores its content and returns a smaller buffer.
      writeFileSync(
        join(tmp, 'tools/scripts/fixtures/MaterialSymbolsOutlined-upstream.woff2'),
        Buffer.alloc(3_000_000)
      );

      const fakeSubset = vi.fn(async () => Buffer.alloc(123_456));
      const { audit, bytes } = await mod.regenerate({
        repoRoot: tmp,
        subsetFont: fakeSubset,
        log: { info: () => {}, error: () => {} },
      });
      expect(bytes).toBe(123_456);
      expect(audit.icons).toContain('search');
      expect(audit.subsetted_bytes).toBe(123_456);
      expect(audit.unresolved_dynamic_icons).toEqual([]);
      expect(fakeSubset).toHaveBeenCalledOnce();
      expect(
        readFileSync(join(tmp, 'apps/web/public/fonts/MaterialSymbolsOutlined.woff2')).length
      ).toBe(123_456);
      // Audit JSON round-trips through serializeAudit key order
      const auditOnDisk = JSON.parse(
        readFileSync(join(tmp, 'artifacts/reports/material-symbols-glyph-audit.json'), 'utf8')
      );
      expect(auditOnDisk.icons_count).toBe(audit.icons.length);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('surfaces unresolved dynamic sites via the log.error channel', async () => {
    const mod: any = await import('../subset-material-symbols.mjs');
    const tmp = mkdtempSync(join(tmpdir(), 'pg195-'));
    const errors: string[] = [];
    try {
      mkdirSync(join(tmp, 'apps/web/src'), { recursive: true });
      mkdirSync(join(tmp, 'apps/web/public/fonts'), { recursive: true });
      mkdirSync(join(tmp, 'packages/ui/src/lib'), { recursive: true });
      mkdirSync(join(tmp, 'artifacts/reports'), { recursive: true });
      mkdirSync(join(tmp, 'tools/scripts/fixtures'), { recursive: true });
      writeFileSync(join(tmp, 'package.json'), JSON.stringify({ devDependencies: {} }));
      // A dynamic site whose snippet is an unknown identifier.
      writeFileSync(
        join(tmp, 'apps/web/src/page.tsx'),
        `<span className="material-symbols-outlined">{mysteryWidget}</span>`
      );
      writeFileSync(
        join(tmp, 'packages/ui/src/lib/icon-mapping.ts'),
        `export const ICON_MAPPING = { Check: 'check' } as const;`
      );
      writeFileSync(
        join(tmp, 'tools/scripts/fixtures/MaterialSymbolsOutlined-upstream.woff2'),
        Buffer.alloc(1_000)
      );

      await mod.regenerate({
        repoRoot: tmp,
        subsetFont: async () => Buffer.alloc(10_000),
        log: { info: () => {}, error: (s: string) => errors.push(s) },
      });
      expect(errors.some((e) => /unresolved dynamic icon sites/.test(e))).toBe(true);
      expect(errors.some((e) => /mysteryWidget/.test(e))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
