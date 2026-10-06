import './section-curve.css';

/**
 * The edge where a section changes colour: the colour of the section above
 * flows down into this one along a soft wave, traced by a thin aurora ribbon
 * (cyan to blue to violet), so the hand-off echoes the live ribbons in the
 * hero instead of a flat gradient. It sits inside the top of its section.
 */
export function SectionCurve({ above, id }: Readonly<{ above: string; id: string }>) {
  const ribbon = `${id}-ribbon`;
  const glow = `${id}-glow`;
  const wave = 'M0,118 C220,52 430,26 690,62 C930,96 1170,124 1440,46';
  return (
    <svg
      className="section-curve"
      viewBox="0 0 1440 160"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={ribbon} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#28D9D4" />
          <stop offset="0.45" stopColor="#2A78F6" />
          <stop offset="0.8" stopColor="#7655F6" />
          <stop offset="1" stopColor="#BCA8FF" />
        </linearGradient>
        <filter id={glow} x="-5%" y="-60%" width="110%" height="220%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <path d={`${wave} L1440,0 L0,0 Z`} fill={above} />
      <path
        d={wave}
        fill="none"
        stroke={`url(#${ribbon})`}
        strokeWidth="10"
        opacity="0.55"
        filter={`url(#${glow})`}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={wave}
        fill="none"
        stroke={`url(#${ribbon})`}
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M0,128 C230,66 440,42 690,74 C930,106 1180,132 1440,60"
        fill="none"
        stroke={`url(#${ribbon})`}
        strokeWidth="1.2"
        opacity="0.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
