import localFont from 'next/font/local';

/**
 * The Aurora typeface, shared by the app shell, the public pages and the landing page.
 *
 * Self-hosted (#1113): next/font/google fetched Manrope from Google Fonts on every
 * build, and a bad answer from Google failed the build. The committed file is the
 * latin cut Google served for these weights (Manrope v23, a variable font with a
 * 200–800 weight axis), so pages render as before. It is licensed under the SIL
 * Open Font License 1.1; the licence text sits next to it in manrope/OFL.txt.
 */
export const manrope = localFont({
  src: './manrope/manrope-latin-wght.woff2',
  weight: '400 800',
  style: 'normal',
  display: 'swap',
  variable: '--font-manrope',
});
