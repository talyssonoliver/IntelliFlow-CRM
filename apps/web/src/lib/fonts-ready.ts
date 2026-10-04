/**
 * Material Symbols fonts-ready gate.
 *
 * Icons are ligatures (`<span class="material-symbols-outlined">search</span>`),
 * so until the icon font loads the browser would paint the literal word. The
 * root layout inlines {@link FONTS_READY_SCRIPT} in <head>; it adds
 * `fonts-ready` to <html> once the icon font has loaded, and globals.css keeps
 * icons `visibility: hidden` until then. See
 * apps/project-tracker/docs/metrics/_global/fix-material-icons.md.
 *
 * The script is plain ES5 with no dependencies because it runs before any
 * bundle. It is allowed by the CSP through its sha256 hash (apps/web/proxy.ts
 * hashes this exact string), so editing it here keeps the CSP in step.
 *
 * Fail-open: if the Font Loading API is missing, the load rejects, or it takes
 * longer than the 3s `font-display: block` period, the class is added anyway so
 * icons can never stay hidden.
 */

/** Self-hosted icon font, preloaded by the root layout. */
export const MATERIAL_SYMBOLS_FONT_URL = '/fonts/MaterialSymbolsOutlined.woff2';

/** Class added to <html> once the icon font is ready. */
export const FONTS_READY_CLASS = 'fonts-ready';

export const FONTS_READY_SCRIPT =
  "(function(){var d=document.documentElement;function r(){d.classList.add('fonts-ready')}" +
  'setTimeout(r,3000);' +
  'try{document.fonts.load(\'24px "Material Symbols Outlined"\').then(r,r)}catch(e){r()}})();';
