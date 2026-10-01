import { Manrope } from 'next/font/google';

/** The Aurora typeface, the same cut the landing page loads. */
export const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-manrope',
});
