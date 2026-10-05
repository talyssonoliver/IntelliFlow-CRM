/**
 * IFC-208 / content-audit F-006: the Open Graph image every public page shares.
 *
 * `app/opengraph-image.tsx` generates the image, but Next only attaches a
 * file-based og:image to the segment that holds the file (the root). A child
 * page or layout that declares its own `openGraph` replaces the parent object
 * wholesale, `images` included, so it renders no og:image unless it names one
 * itself. Every public `openGraph` block therefore spreads this constant.
 * Twitter cards inherit it too: Next copies `openGraph.images` into
 * `twitter.images` when a page's `twitter` block has none.
 */
export const OG_IMAGES = [
  {
    url: '/opengraph-image',
    width: 1200,
    height: 630,
    alt: 'IntelliFlow CRM — AI-Powered Customer Relationship Management',
  },
];
