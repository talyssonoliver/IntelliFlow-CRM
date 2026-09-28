import Image from 'next/image';

// Intrinsic sizes of the files in public/brand/aurora/.
const WAVE = { src: '/brand/aurora/aurora-wave.webp', width: 240, height: 91 };
const WORDMARK = { src: '/brand/aurora/aurora-wordmark.webp', width: 259, height: 56 };

/** The Aurora wave mark followed by the wordmark, sized by `height` (px). */
export function AuroraLogo({ height = 34 }: { height?: number }) {
  const waveWidth = Math.round((WAVE.width / WAVE.height) * height);
  const wordHeight = Math.round(height * 0.62);
  const wordWidth = Math.round((WORDMARK.width / WORDMARK.height) * wordHeight);

  return (
    <span className="flex items-center gap-2.5">
      <Image src={WAVE.src} alt="" width={waveWidth} height={height} priority />
      <Image src={WORDMARK.src} alt="Aurora" width={wordWidth} height={wordHeight} priority />
    </span>
  );
}
