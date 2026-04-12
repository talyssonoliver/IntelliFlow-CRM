'use client';

import * as React from 'react';

// ============================================
// Shared props for all illustrations
// ============================================

interface IllustrationProps {
  className?: string;
  /** Width in px, default 180 */
  width?: number;
  /** Height in px, default 160 */
  height?: number;
}

const defaultSize = { width: 180, height: 160 };

// ============================================
// Brand palette constants
// ============================================
const P = '#137fec'; // primary
const PL = '#93c5fd'; // primary-light (blue-300)
const PLT = '#dbeafe'; // primary-lightest (blue-100)
const S2 = '#e2e8f0'; // slate-200
const S3 = '#cbd5e1'; // slate-300
const S4 = '#94a3b8'; // slate-400
const S1 = '#f1f5f9'; // slate-100

// ============================================
// 1. Notes — Notebook with pen and lines
// ============================================
export function NotesIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Shadow */}
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Notebook body */}
      <rect
        x="38"
        y="18"
        width="90"
        height="116"
        rx="6"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      {/* Spine holes */}
      <circle cx="46" cy="38" r="3" fill={S2} />
      <circle cx="46" cy="58" r="3" fill={S2} />
      <circle cx="46" cy="78" r="3" fill={S2} />
      <circle cx="46" cy="98" r="3" fill={S2} />
      <circle cx="46" cy="118" r="3" fill={S2} />
      {/* Lines */}
      <line x1="58" y1="42" x2="112" y2="42" stroke={PL} strokeWidth="2" strokeLinecap="round" />
      <line x1="58" y1="56" x2="105" y2="56" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="58" y1="70" x2="108" y2="70" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="58" y1="84" x2="96" y2="84" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="58" y1="98" x2="100" y2="98" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      {/* Pen */}
      <g transform="translate(118, 28) rotate(25)">
        <rect x="0" y="0" width="8" height="56" rx="2" fill={P} />
        <rect x="0" y="0" width="8" height="12" rx="2" fill={PL} />
        <polygon points="0,56 8,56 4,66" fill={S4} />
      </g>
      {/* Decorative corner fold */}
      <path d="M128 18 L128 32 L116 18 Z" fill={PLT} stroke={S3} strokeWidth="0.5" />
    </svg>
  );
}

// ============================================
// 2. Tasks — Checklist with items
// ============================================
export function TasksIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Shadow */}
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Clipboard body */}
      <rect
        x="40"
        y="22"
        width="100"
        height="120"
        rx="8"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      {/* Clipboard top clip */}
      <rect x="65" y="14" width="50" height="18" rx="4" fill={P} />
      <circle cx="90" cy="23" r="4" fill="white" />
      {/* Task row 1 — checked */}
      <rect x="54" y="46" width="16" height="16" rx="3" fill={P} />
      <polyline
        points="58,54 62,58 66,50"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="78" y1="54" x2="124" y2="54" stroke={S3} strokeWidth="2" strokeLinecap="round" />
      {/* Task row 2 — checked */}
      <rect x="54" y="72" width="16" height="16" rx="3" fill={P} />
      <polyline
        points="58,80 62,84 66,76"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="78" y1="80" x2="118" y2="80" stroke={S3} strokeWidth="2" strokeLinecap="round" />
      {/* Task row 3 — unchecked */}
      <rect
        x="54"
        y="98"
        width="16"
        height="16"
        rx="3"
        fill="none"
        stroke={PL}
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <line x1="78" y1="106" x2="112" y2="106" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      {/* Decorative star */}
      <circle cx="146" cy="40" r="8" fill={PLT} />
      <text x="146" y="44" textAnchor="middle" fontSize="12" fill={P}>
        +
      </text>
    </svg>
  );
}

// ============================================
// 3. Chats — Speech bubbles
// ============================================
export function ChatsIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Shadow */}
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Back bubble (right) */}
      <rect x="70" y="30" width="80" height="52" rx="12" fill={PLT} stroke={PL} strokeWidth="1" />
      <polygon
        points="80,82 88,82 76,96"
        fill={PLT}
        stroke={PL}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* Lines in back bubble */}
      <line x1="84" y1="48" x2="136" y2="48" stroke={PL} strokeWidth="2" strokeLinecap="round" />
      <line x1="84" y1="60" x2="124" y2="60" stroke={PL} strokeWidth="2" strokeLinecap="round" />
      <line x1="84" y1="72" x2="108" y2="72" stroke={PL} strokeWidth="2" strokeLinecap="round" />
      {/* Front bubble (left) */}
      <rect x="28" y="56" width="84" height="52" rx="12" fill={P} />
      <polygon points="52,108 44,108 56,122" fill={P} />
      {/* Lines in front bubble */}
      <line
        x1="42"
        y1="74"
        x2="98"
        y2="74"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.7"
      />
      <line
        x1="42"
        y1="86"
        x2="88"
        y2="86"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
      <line
        x1="42"
        y1="98"
        x2="70"
        y2="98"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.3"
      />
      {/* Typing indicator dots */}
      <circle cx="50" cy="86" r="2.5" fill="white" opacity="0.8" />
      <circle cx="60" cy="86" r="2.5" fill="white" opacity="0.6" />
      <circle cx="70" cy="86" r="2.5" fill="white" opacity="0.4" />
    </svg>
  );
}

// ============================================
// 4. Appointments — Calendar with clock
// ============================================
export function AppointmentsIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Shadow */}
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Calendar body */}
      <rect
        x="30"
        y="28"
        width="100"
        height="100"
        rx="8"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      {/* Calendar header */}
      <rect x="30" y="28" width="100" height="28" rx="8" fill={P} />
      <rect x="30" y="44" width="100" height="14" fill={P} />
      {/* Header hooks */}
      <line x1="56" y1="22" x2="56" y2="36" stroke={S3} strokeWidth="3" strokeLinecap="round" />
      <line x1="104" y1="22" x2="104" y2="36" stroke={S3} strokeWidth="3" strokeLinecap="round" />
      {/* Day dots */}
      <text
        x="80"
        y="48"
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fill="white"
        fontFamily="Inter, sans-serif"
      >
        MAR
      </text>
      {/* Grid dots */}
      {[0, 1, 2, 3, 4].map((col) =>
        [0, 1, 2, 3].map((row) => (
          <circle
            key={`${col}-${row}`}
            cx={46 + col * 18}
            cy={70 + row * 14}
            r="3"
            fill={row === 1 && col === 2 ? P : S2}
          />
        ))
      )}
      {/* Clock overlay */}
      <circle cx="138" cy="106" r="24" fill="white" stroke={P} strokeWidth="2" />
      <circle cx="138" cy="106" r="20" fill={PLT} />
      <line x1="138" y1="106" x2="138" y2="92" stroke={P} strokeWidth="2" strokeLinecap="round" />
      <line x1="138" y1="106" x2="148" y2="106" stroke={P} strokeWidth="2" strokeLinecap="round" />
      <circle cx="138" cy="106" r="2.5" fill={P} />
    </svg>
  );
}

// ============================================
// 5. Files — Folder with file
// ============================================
export function FilesIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Shadow */}
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Back folder tab */}
      <path d="M30 48 L30 38 Q30 32 36 32 L70 32 Q74 32 76 36 L80 44 L80 48 Z" fill={PL} />
      {/* Folder body */}
      <rect x="30" y="48" width="120" height="88" rx="6" fill={PLT} stroke={PL} strokeWidth="1" />
      {/* File peeking out */}
      <rect
        x="56"
        y="24"
        width="68"
        height="90"
        rx="4"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      {/* File corner fold */}
      <path d="M108 24 L124 24 L124 40 Z" fill={S1} stroke={S3} strokeWidth="1" />
      <path d="M108 24 L108 40 L124 40" fill="none" stroke={S3} strokeWidth="1" />
      {/* File lines */}
      <line x1="66" y1="52" x2="108" y2="52" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="66" y1="64" x2="104" y2="64" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="66" y1="76" x2="98" y2="76" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="66" y1="88" x2="92" y2="88" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      {/* Upload arrow */}
      <circle cx="130" cy="48" r="14" fill={P} />
      <polyline
        points="124,50 130,42 136,50"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="130"
        y1="42"
        x2="130"
        y2="56"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ============================================
// 6. Emails — Envelope with notification
// ============================================
export function EmailsIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Shadow */}
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Envelope body */}
      <rect
        x="24"
        y="44"
        width="132"
        height="88"
        rx="8"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      {/* Envelope flap */}
      <path
        d="M24 52 L90 94 L156 52"
        fill="none"
        stroke={S3}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Inner flap shading */}
      <path d="M26 44 L90 86 L154 44" fill={PLT} />
      {/* Back flap */}
      <path
        d="M24 44 Q24 44 90 86 Q156 44 156 44"
        fill="none"
        stroke={PL}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Bottom fold lines */}
      <line x1="24" y1="132" x2="60" y2="100" stroke={S2} strokeWidth="1" />
      <line x1="156" y1="132" x2="120" y2="100" stroke={S2} strokeWidth="1" />
      {/* Letter inside */}
      <rect x="50" y="26" width="80" height="60" rx="4" fill={S1} stroke={S2} strokeWidth="1" />
      <line x1="62" y1="42" x2="118" y2="42" stroke={PL} strokeWidth="2" strokeLinecap="round" />
      <line x1="62" y1="54" x2="110" y2="54" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="62" y1="66" x2="100" y2="66" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      {/* Decorative sparkle */}
      <circle cx="148" cy="36" r="4" fill={PL} />
      <circle cx="156" cy="48" r="2.5" fill={PL} opacity="0.6" />
      <circle cx="140" cy="28" r="2" fill={P} opacity="0.4" />
    </svg>
  );
}

// ============================================
// 7. Timeline — Vertical timeline with nodes
// ============================================
export function TimelineIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Shadow */}
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Vertical line */}
      <line x1="60" y1="18" x2="60" y2="140" stroke={S2} strokeWidth="2" strokeDasharray="4 3" />
      {/* Node 1 - top */}
      <circle cx="60" cy="32" r="8" fill={P} />
      <circle cx="60" cy="32" r="4" fill="white" />
      <rect x="78" y="22" width="72" height="20" rx="6" fill={PLT} stroke={PL} strokeWidth="1" />
      <line x1="86" y1="32" x2="140" y2="32" stroke={PL} strokeWidth="2" strokeLinecap="round" />
      {/* Node 2 - middle */}
      <circle cx="60" cy="72" r="8" fill={PL} />
      <circle cx="60" cy="72" r="4" fill="white" />
      <rect x="78" y="58" width="80" height="28" rx="6" fill="white" stroke={S3} strokeWidth="1" />
      <line x1="86" y1="68" x2="148" y2="68" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="86" y1="80" x2="130" y2="80" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      {/* Node 3 - bottom (dashed — pending) */}
      <circle
        cx="60"
        cy="112"
        r="8"
        fill="none"
        stroke={S3}
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <rect x="78" y="102" width="66" height="20" rx="6" fill={S1} stroke={S2} strokeWidth="1" />
      <line x1="86" y1="112" x2="134" y2="112" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      {/* Flag at top */}
      <rect x="56" y="10" width="8" height="4" rx="1" fill={P} />
    </svg>
  );
}

// ============================================
// 8. Activity — Feed/pulse with cards
// ============================================
export function ActivityIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Shadow */}
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Pulse/heartbeat line */}
      <polyline
        points="14,80 40,80 50,60 60,100 70,40 80,110 90,70 100,80 166,80"
        fill="none"
        stroke={PL}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Card 1 */}
      <rect x="24" y="20" width="56" height="36" rx="6" fill="white" stroke={S3} strokeWidth="1" />
      <circle cx="38" cy="32" r="6" fill={PLT} />
      <line x1="50" y1="30" x2="72" y2="30" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="50" y1="40" x2="66" y2="40" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      {/* Card 2 */}
      <rect
        x="100"
        y="24"
        width="60"
        height="36"
        rx="6"
        fill="white"
        stroke={P}
        strokeWidth="1.5"
      />
      <circle cx="114" cy="36" r="6" fill={P} />
      <line x1="126" y1="34" x2="150" y2="34" stroke={PL} strokeWidth="2" strokeLinecap="round" />
      <line x1="126" y1="44" x2="144" y2="44" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      {/* Card 3 */}
      <rect
        x="56"
        y="100"
        width="68"
        height="36"
        rx="6"
        fill={S1}
        stroke={S2}
        strokeWidth="1"
        strokeDasharray="4 2"
      />
      <circle cx="72" cy="112" r="6" fill={S2} />
      <text x="72" y="116" textAnchor="middle" fontSize="10" fill={S4}>
        ?
      </text>
      <line x1="84" y1="110" x2="112" y2="110" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="84" y1="120" x2="104" y2="120" stroke={S2} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ============================================
// 9. Documents — Document with seal/stamp
// ============================================
export function DocumentsIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Shadow */}
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Back document */}
      <rect x="52" y="14" width="80" height="108" rx="4" fill={S1} stroke={S2} strokeWidth="1" />
      {/* Front document */}
      <rect
        x="38"
        y="22"
        width="84"
        height="114"
        rx="5"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      {/* Header line (title) */}
      <line x1="52" y1="40" x2="108" y2="40" stroke={P} strokeWidth="2.5" strokeLinecap="round" />
      {/* Body lines */}
      <line x1="52" y1="56" x2="108" y2="56" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="52" y1="68" x2="104" y2="68" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="52" y1="80" x2="96" y2="80" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="52" y1="92" x2="100" y2="92" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      {/* Signature line */}
      <line x1="52" y1="116" x2="86" y2="116" stroke={S3} strokeWidth="1" />
      <path
        d="M54 112 Q62 104 70 112 Q78 120 84 110"
        fill="none"
        stroke={P}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Stamp/seal */}
      <circle cx="136" cy="108" r="22" fill="white" stroke={P} strokeWidth="2" />
      <circle cx="136" cy="108" r="17" fill="none" stroke={P} strokeWidth="1" />
      <circle cx="136" cy="108" r="12" fill={PLT} />
      <text
        x="136"
        y="113"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill={P}
        fontFamily="Inter, sans-serif"
      >
        IF
      </text>
    </svg>
  );
}

// ============================================
// 10. Leads — Person with funnel/pipeline
// ============================================
export function LeadsIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Person silhouette */}
      <circle cx="68" cy="42" r="18" fill={PLT} stroke={PL} strokeWidth="1.5" />
      <circle cx="68" cy="36" r="8" fill={PL} />
      <path d="M52 58 Q52 48 68 48 Q84 48 84 58" fill={PL} />
      {/* Plus badge */}
      <circle cx="88" cy="30" r="10" fill={P} />
      <line x1="84" y1="30" x2="92" y2="30" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <line x1="88" y1="26" x2="88" y2="34" stroke="white" strokeWidth="2" strokeLinecap="round" />
      {/* Funnel */}
      <path d="M106 28 L160 28 L144 62 L122 62 Z" fill={PLT} stroke={PL} strokeWidth="1" />
      <rect x="122" y="62" width="22" height="30" rx="2" fill="white" stroke={S3} strokeWidth="1" />
      {/* Funnel stripes */}
      <line x1="112" y1="38" x2="154" y2="38" stroke={PL} strokeWidth="1" opacity="0.5" />
      <line x1="116" y1="48" x2="150" y2="48" stroke={PL} strokeWidth="1" opacity="0.5" />
      {/* Conversion arrow */}
      <path d="M133 96 L133 118" stroke={P} strokeWidth="2" strokeLinecap="round" />
      <polyline
        points="127,112 133,118 139,112"
        fill="none"
        stroke={P}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Star (quality lead) */}
      <circle cx="133" cy="130" r="10" fill={PLT} stroke={PL} strokeWidth="1" />
      <text x="133" y="134" textAnchor="middle" fontSize="12" fill={P}>
        &#9733;
      </text>
    </svg>
  );
}

// ============================================
// 11. Contacts — Address book / people grid
// ============================================
export function ContactsIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Address book body */}
      <rect
        x="36"
        y="16"
        width="108"
        height="124"
        rx="8"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      {/* Spine */}
      <rect x="36" y="16" width="14" height="124" rx="4" fill={PLT} stroke={PL} strokeWidth="1" />
      {/* Tab markers */}
      <rect x="28" y="34" width="16" height="8" rx="2" fill={P} />
      <rect x="28" y="60" width="16" height="8" rx="2" fill={PL} />
      <rect x="28" y="86" width="16" height="8" rx="2" fill={S3} />
      {/* Contact card 1 */}
      <circle cx="76" cy="46" r="10" fill={PLT} />
      <circle cx="76" cy="43" r="4" fill={PL} />
      <path d="M68 54 Q68 50 76 50 Q84 50 84 54" fill={PL} />
      <line x1="92" y1="42" x2="130" y2="42" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="92" y1="52" x2="118" y2="52" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      {/* Divider */}
      <line x1="58" y1="66" x2="136" y2="66" stroke={S2} strokeWidth="1" />
      {/* Contact card 2 */}
      <circle cx="76" cy="84" r="10" fill={PLT} />
      <circle cx="76" cy="81" r="4" fill={PL} />
      <path d="M68 92 Q68 88 76 88 Q84 88 84 92" fill={PL} />
      <line x1="92" y1="80" x2="126" y2="80" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="92" y1="90" x2="114" y2="90" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      {/* Divider */}
      <line x1="58" y1="104" x2="136" y2="104" stroke={S2} strokeWidth="1" />
      {/* Empty slot (dashed) */}
      <circle
        cx="76"
        cy="120"
        r="10"
        fill="none"
        stroke={S3}
        strokeWidth="1"
        strokeDasharray="3 2"
      />
      <line
        x1="92"
        y1="116"
        x2="122"
        y2="116"
        stroke={S2}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 3"
      />
      <line
        x1="92"
        y1="126"
        x2="108"
        y2="126"
        stroke={S2}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 3"
      />
    </svg>
  );
}

// ============================================
// 12. Accounts — Building / company
// ============================================
export function AccountsIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Main building */}
      <rect
        x="50"
        y="30"
        width="60"
        height="112"
        rx="4"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      {/* Building top */}
      <rect x="50" y="30" width="60" height="16" rx="4" fill={P} />
      <rect x="50" y="40" width="60" height="8" fill={P} />
      {/* Windows grid */}
      {[0, 1, 2].map((col) =>
        [0, 1, 2, 3].map((row) => (
          <rect
            key={`${col}-${row}`}
            x={60 + col * 16}
            y={56 + row * 20}
            width="10"
            height="10"
            rx="1.5"
            fill={row < 2 ? PLT : S1}
            stroke={row < 2 ? PL : S2}
            strokeWidth="0.5"
          />
        ))
      )}
      {/* Door */}
      <rect x="72" y="122" width="16" height="20" rx="2" fill={PLT} stroke={PL} strokeWidth="1" />
      <circle cx="84" cy="132" r="1.5" fill={P} />
      {/* Side building */}
      <rect x="118" y="70" width="36" height="72" rx="3" fill={S1} stroke={S2} strokeWidth="1" />
      <rect x="126" y="82" width="8" height="8" rx="1" fill={PLT} />
      <rect x="126" y="98" width="8" height="8" rx="1" fill={PLT} />
      <rect x="126" y="114" width="8" height="8" rx="1" fill={S2} />
      <rect x="138" y="82" width="8" height="8" rx="1" fill={PLT} />
      <rect x="138" y="98" width="8" height="8" rx="1" fill={S2} />
      {/* Antenna */}
      <line x1="80" y1="16" x2="80" y2="30" stroke={S3} strokeWidth="1.5" />
      <circle cx="80" cy="14" r="3" fill={P} />
    </svg>
  );
}

// ============================================
// 13. Deals — Handshake / pipeline
// ============================================
export function DealsIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Pipeline stages */}
      <rect x="18" y="56" width="28" height="60" rx="4" fill={P} opacity="0.9" />
      <rect x="50" y="44" width="28" height="72" rx="4" fill={P} opacity="0.7" />
      <rect x="82" y="36" width="28" height="80" rx="4" fill={P} opacity="0.5" />
      <rect x="114" y="28" width="28" height="88" rx="4" fill={PL} opacity="0.4" />
      <rect
        x="146"
        y="20"
        width="20"
        height="96"
        rx="4"
        fill={S2}
        strokeDasharray="4 2"
        stroke={S3}
        strokeWidth="1"
      />
      {/* Stage labels */}
      <text
        x="32"
        y="92"
        textAnchor="middle"
        fontSize="8"
        fill="white"
        fontFamily="Inter, sans-serif"
      >
        Q
      </text>
      <text
        x="64"
        y="86"
        textAnchor="middle"
        fontSize="8"
        fill="white"
        fontFamily="Inter, sans-serif"
      >
        P
      </text>
      <text
        x="96"
        y="82"
        textAnchor="middle"
        fontSize="8"
        fill="white"
        fontFamily="Inter, sans-serif"
      >
        N
      </text>
      <text x="128" y="78" textAnchor="middle" fontSize="8" fill={P} fontFamily="Inter, sans-serif">
        W
      </text>
      {/* Dollar value */}
      <rect
        x="46"
        y="124"
        width="88"
        height="22"
        rx="6"
        fill="white"
        stroke={P}
        strokeWidth="1.5"
      />
      <text
        x="90"
        y="140"
        textAnchor="middle"
        fontSize="13"
        fontWeight="600"
        fill={P}
        fontFamily="Inter, sans-serif"
      >
        $0.00
      </text>
      {/* Trend arrow */}
      <polyline
        points="130,50 140,36 150,44"
        fill="none"
        stroke={S3}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="3 2"
      />
    </svg>
  );
}

// ============================================
// 14. Tickets — Support ticket
// ============================================
export function TicketsIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Ticket body */}
      <rect
        x="28"
        y="30"
        width="124"
        height="80"
        rx="8"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      {/* Ticket perforation */}
      <line x1="120" y1="30" x2="120" y2="110" stroke={S3} strokeWidth="1" strokeDasharray="4 4" />
      {/* Left section — ticket info */}
      <rect x="38" y="42" width="40" height="6" rx="2" fill={P} />
      <line x1="38" y1="58" x2="100" y2="58" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="38" y1="70" x2="92" y2="70" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="38" y1="82" x2="80" y2="82" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      {/* Priority badge */}
      <rect x="38" y="92" width="32" height="10" rx="5" fill={PLT} stroke={PL} strokeWidth="0.5" />
      <text x="54" y="100" textAnchor="middle" fontSize="7" fill={P} fontFamily="Inter, sans-serif">
        Open
      </text>
      {/* Right section — stub */}
      <rect x="128" y="46" width="16" height="16" rx="4" fill={PLT} />
      <text
        x="136"
        y="58"
        textAnchor="middle"
        fontSize="14"
        fill={P}
        fontFamily="Inter, sans-serif"
      >
        #
      </text>
      <line x1="128" y1="72" x2="144" y2="72" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="128" y1="82" x2="142" y2="82" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      {/* Chat bubble below */}
      <rect x="50" y="118" width="80" height="24" rx="6" fill={PLT} stroke={PL} strokeWidth="1" />
      <polygon
        points="70,142 78,142 66,152"
        fill={PLT}
        stroke={PL}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <line x1="62" y1="130" x2="118" y2="130" stroke={PL} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ============================================
// 15. Cases — Legal case / gavel
// ============================================
export function CasesIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Briefcase body */}
      <rect
        x="34"
        y="50"
        width="112"
        height="76"
        rx="8"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      {/* Briefcase handle */}
      <path
        d="M68 50 L68 38 Q68 30 76 30 L104 30 Q112 30 112 38 L112 50"
        fill="none"
        stroke={S3}
        strokeWidth="2"
      />
      {/* Lock clasp */}
      <rect x="82" y="46" width="16" height="10" rx="3" fill={P} />
      <circle cx="90" cy="51" r="2" fill="white" />
      {/* Briefcase stripe */}
      <line x1="34" y1="76" x2="146" y2="76" stroke={S2} strokeWidth="1" />
      {/* Scale of justice */}
      <line x1="90" y1="84" x2="90" y2="104" stroke={P} strokeWidth="2" strokeLinecap="round" />
      <line x1="66" y1="92" x2="114" y2="92" stroke={P} strokeWidth="2" strokeLinecap="round" />
      {/* Left pan */}
      <path d="M62 92 L58 106 L74 106 Z" fill={PLT} stroke={PL} strokeWidth="1" />
      {/* Right pan */}
      <path d="M118 92 L114 106 L130 106 Z" fill={PLT} stroke={PL} strokeWidth="1" />
      {/* Balance dots */}
      <circle cx="90" cy="84" r="3" fill={P} />
      {/* Evidence folder */}
      <rect x="36" y="130" width="44" height="10" rx="3" fill={S1} stroke={S2} strokeWidth="1" />
      <line x1="42" y1="135" x2="72" y2="135" stroke={S2} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ============================================
// 16. Pinned — Pin board with cards
// ============================================
export function PinnedIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Board */}
      <rect x="24" y="16" width="132" height="120" rx="8" fill={S1} stroke={S2} strokeWidth="1.5" />
      {/* Card 1 — pinned */}
      <rect x="36" y="32" width="52" height="40" rx="4" fill="white" stroke={S3} strokeWidth="1" />
      <line x1="44" y1="44" x2="78" y2="44" stroke={PL} strokeWidth="2" strokeLinecap="round" />
      <line x1="44" y1="54" x2="72" y2="54" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="44" y1="62" x2="66" y2="62" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      {/* Pin 1 */}
      <circle cx="62" cy="28" r="6" fill={P} />
      <line x1="62" y1="22" x2="62" y2="14" stroke={P} strokeWidth="2" strokeLinecap="round" />
      {/* Card 2 — pinned */}
      <rect x="96" y="38" width="52" height="36" rx="4" fill="white" stroke={S3} strokeWidth="1" />
      <line x1="104" y1="50" x2="138" y2="50" stroke={PL} strokeWidth="2" strokeLinecap="round" />
      <line x1="104" y1="60" x2="132" y2="60" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      {/* Pin 2 */}
      <circle cx="122" cy="34" r="6" fill={P} />
      <line x1="122" y1="28" x2="122" y2="20" stroke={P} strokeWidth="2" strokeLinecap="round" />
      {/* Empty slot (dashed) */}
      <rect
        x="54"
        y="86"
        width="72"
        height="36"
        rx="4"
        fill="none"
        stroke={S3}
        strokeWidth="1.5"
        strokeDasharray="6 3"
      />
      <text x="90" y="108" textAnchor="middle" fontSize="20" fill={S3}>
        +
      </text>
    </svg>
  );
}

// ============================================
// 17. Insights — Lightbulb with sparkles
// ============================================
export function InsightsIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Lightbulb glass */}
      <path
        d="M90 20 C60 20 42 44 42 68 C42 86 54 96 62 106 L62 112 L118 112 L118 106 C126 96 138 86 138 68 C138 44 120 20 90 20Z"
        fill={PLT}
        stroke={PL}
        strokeWidth="1.5"
      />
      {/* Filament */}
      <path
        d="M78 80 Q84 66 90 80 Q96 94 102 80"
        fill="none"
        stroke={P}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Bulb base */}
      <rect x="68" y="112" width="44" height="6" rx="2" fill={S3} />
      <rect x="72" y="118" width="36" height="5" rx="2" fill={S3} />
      <rect x="76" y="123" width="28" height="5" rx="2" fill={S4} />
      {/* Contact point */}
      <rect x="84" y="128" width="12" height="6" rx="3" fill={S4} />
      {/* Sparkle left */}
      <line x1="28" y1="46" x2="36" y2="50" stroke={P} strokeWidth="2" strokeLinecap="round" />
      <line x1="30" y1="38" x2="34" y2="46" stroke={PL} strokeWidth="1.5" strokeLinecap="round" />
      {/* Sparkle right */}
      <line x1="152" y1="46" x2="144" y2="50" stroke={P} strokeWidth="2" strokeLinecap="round" />
      <line x1="150" y1="38" x2="146" y2="46" stroke={PL} strokeWidth="1.5" strokeLinecap="round" />
      {/* Sparkle top */}
      <line x1="90" y1="4" x2="90" y2="14" stroke={P} strokeWidth="2" strokeLinecap="round" />
      <line x1="84" y1="8" x2="96" y2="8" stroke={PL} strokeWidth="1.5" strokeLinecap="round" />
      {/* Small stars */}
      <circle cx="46" cy="28" r="3" fill={PL} />
      <circle cx="136" cy="24" r="2.5" fill={PL} />
      <circle cx="154" cy="68" r="2" fill={P} opacity="0.5" />
    </svg>
  );
}

// ============================================
// 18. Notifications — Bell with lines
// ============================================
export function NotificationsIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Bell body */}
      <path
        d="M56 88 C56 56 68 28 90 28 C112 28 124 56 124 88 L124 98 L56 98 Z"
        fill={PLT}
        stroke={PL}
        strokeWidth="1.5"
      />
      {/* Bell rim */}
      <rect x="48" y="98" width="84" height="10" rx="5" fill={P} />
      {/* Clapper */}
      <circle cx="90" cy="116" r="8" fill={PL} />
      {/* Handle */}
      <line x1="90" y1="16" x2="90" y2="28" stroke={S3} strokeWidth="2" strokeLinecap="round" />
      <circle cx="90" cy="14" r="4" fill={P} />
      {/* Sound waves */}
      <path
        d="M40 72 Q34 82 40 92"
        fill="none"
        stroke={PL}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M30 66 Q22 82 30 98"
        fill="none"
        stroke={PL}
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M140 72 Q146 82 140 92"
        fill="none"
        stroke={PL}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M150 66 Q158 82 150 98"
        fill="none"
        stroke={PL}
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.5"
      />
      {/* Checkmark badge */}
      <circle cx="140" cy="40" r="14" fill="white" stroke={P} strokeWidth="1.5" />
      <polyline
        points="133,40 138,45 148,35"
        fill="none"
        stroke={P}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ============================================
// 19. Comments — Chat with pencil
// ============================================
export function CommentsIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Comment bubble */}
      <rect
        x="28"
        y="24"
        width="108"
        height="76"
        rx="12"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      <polygon
        points="56,100 64,100 48,118"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Lines */}
      <line x1="46" y1="48" x2="118" y2="48" stroke={PL} strokeWidth="2" strokeLinecap="round" />
      <line x1="46" y1="62" x2="108" y2="62" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="46" y1="76" x2="90" y2="76" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      {/* Pencil */}
      <g transform="translate(126,70) rotate(30)">
        <rect x="0" y="0" width="7" height="44" rx="1.5" fill={P} />
        <rect x="0" y="0" width="7" height="10" rx="1.5" fill={PL} />
        <polygon points="0,44 7,44 3.5,52" fill={S4} />
      </g>
    </svg>
  );
}

// ============================================
// 20. Invoices — Receipt/bill
// ============================================
export function InvoicesIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Receipt body */}
      <rect
        x="42"
        y="14"
        width="96"
        height="124"
        rx="4"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      {/* Zigzag bottom */}
      <path
        d="M42 138 L50 130 L58 138 L66 130 L74 138 L82 130 L90 138 L98 130 L106 138 L114 130 L122 138 L130 130 L138 138"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      {/* Header */}
      <rect x="56" y="26" width="68" height="8" rx="2" fill={P} />
      {/* Amount */}
      <text
        x="90"
        y="58"
        textAnchor="middle"
        fontSize="16"
        fontWeight="700"
        fill={P}
        fontFamily="Inter, sans-serif"
      >
        $0.00
      </text>
      {/* Divider */}
      <line x1="56" y1="68" x2="124" y2="68" stroke={S2} strokeWidth="1" strokeDasharray="4 2" />
      {/* Line items */}
      <line x1="56" y1="80" x2="100" y2="80" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="112" y1="80" x2="124" y2="80" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="56" y1="92" x2="96" y2="92" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="112" y1="92" x2="124" y2="92" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="56" y1="104" x2="88" y2="104" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="112" y1="104" x2="124" y2="104" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      {/* Divider */}
      <line x1="56" y1="114" x2="124" y2="114" stroke={S3} strokeWidth="1" />
      {/* Total */}
      <line x1="56" y1="124" x2="82" y2="124" stroke={P} strokeWidth="2" strokeLinecap="round" />
      <line x1="108" y1="124" x2="124" y2="124" stroke={P} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ============================================
// 21. Receipts — Receipt with checkmark
// ============================================
export function ReceiptsIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Receipt body */}
      <rect
        x="46"
        y="18"
        width="88"
        height="116"
        rx="4"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      {/* Zigzag bottom */}
      <path
        d="M46 134 L54 126 L62 134 L70 126 L78 134 L86 126 L94 134 L102 126 L110 134 L118 126 L126 134 L134 126"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      {/* Header stripe */}
      <rect x="46" y="18" width="88" height="14" rx="4" fill={PLT} />
      <rect x="46" y="28" width="88" height="6" fill={PLT} />
      {/* Lines */}
      <line x1="58" y1="46" x2="122" y2="46" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="58" y1="60" x2="114" y2="60" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="58" y1="74" x2="106" y2="74" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      {/* Divider */}
      <line x1="58" y1="88" x2="122" y2="88" stroke={S3} strokeWidth="1" strokeDasharray="3 2" />
      {/* Total */}
      <line x1="58" y1="102" x2="84" y2="102" stroke={P} strokeWidth="2.5" strokeLinecap="round" />
      <line
        x1="104"
        y1="102"
        x2="122"
        y2="102"
        stroke={P}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Checkmark badge */}
      <circle cx="138" cy="36" r="16" fill={P} />
      <polyline
        points="130,36 136,42 148,30"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ============================================
// 22. Payment Methods — Credit card
// ============================================
export function PaymentMethodsIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Back card (tilted) */}
      <rect
        x="48"
        y="24"
        width="110"
        height="70"
        rx="8"
        fill={S1}
        stroke={S2}
        strokeWidth="1"
        transform="rotate(6, 103, 59)"
      />
      {/* Front card */}
      <rect
        x="24"
        y="38"
        width="120"
        height="76"
        rx="8"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      {/* Card stripe */}
      <rect x="24" y="54" width="120" height="14" fill={P} />
      {/* Chip */}
      <rect x="38" y="78" width="18" height="14" rx="3" fill={PLT} stroke={PL} strokeWidth="1" />
      <line x1="42" y1="82" x2="52" y2="82" stroke={PL} strokeWidth="0.5" />
      <line x1="42" y1="86" x2="52" y2="86" stroke={PL} strokeWidth="0.5" />
      {/* Card number dots */}
      {[0, 1, 2, 3].map((g) => (
        <g key={g}>
          {[0, 1, 2, 3].map((d) => (
            <circle key={d} cx={38 + g * 26 + d * 6} cy={100} r={1.5} fill={g < 3 ? S3 : P} />
          ))}
        </g>
      ))}
      {/* Plus badge */}
      <circle cx="150" cy="92" r="16" fill={PLT} stroke={PL} strokeWidth="1.5" />
      <line x1="143" y1="92" x2="157" y2="92" stroke={P} strokeWidth="2" strokeLinecap="round" />
      <line x1="150" y1="85" x2="150" y2="99" stroke={P} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ============================================
// 23. Signatures — Pen signing document
// ============================================
export function SignaturesIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Document */}
      <rect
        x="36"
        y="16"
        width="88"
        height="120"
        rx="5"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      {/* Lines */}
      <line x1="50" y1="36" x2="110" y2="36" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="50" y1="50" x2="106" y2="50" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="50" y1="64" x2="100" y2="64" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="50" y1="78" x2="96" y2="78" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      {/* Signature line */}
      <line x1="50" y1="110" x2="110" y2="110" stroke={S3} strokeWidth="1" />
      <text x="52" y="106" fontSize="8" fill={S4} fontFamily="Inter, sans-serif">
        Sign here
      </text>
      {/* Signature stroke */}
      <path
        d="M54 104 Q66 90 78 104 Q90 118 100 100"
        fill="none"
        stroke={P}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Pen */}
      <g transform="translate(118,50) rotate(35)">
        <rect x="0" y="0" width="8" height="52" rx="2" fill={P} />
        <rect x="0" y="0" width="8" height="12" rx="2" fill={PL} />
        <polygon points="0,52 8,52 4,62" fill={S4} />
      </g>
    </svg>
  );
}

// ============================================
// 24. Agents — Robot/AI bot
// ============================================
export function AgentsIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Body */}
      <rect
        x="50"
        y="62"
        width="80"
        height="72"
        rx="10"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      {/* Head */}
      <rect x="56" y="24" width="68" height="46" rx="12" fill={PLT} stroke={PL} strokeWidth="1.5" />
      {/* Eyes */}
      <circle cx="76" cy="46" r="6" fill={P} />
      <circle cx="104" cy="46" r="6" fill={P} />
      <circle cx="78" cy="44" r="2" fill="white" />
      <circle cx="106" cy="44" r="2" fill="white" />
      {/* Antenna */}
      <line x1="90" y1="12" x2="90" y2="24" stroke={S3} strokeWidth="2" strokeLinecap="round" />
      <circle cx="90" cy="10" r="5" fill={P} />
      {/* Mouth */}
      <path
        d="M80 56 Q90 62 100 56"
        fill="none"
        stroke={PL}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Arms */}
      <line x1="46" y1="82" x2="50" y2="82" stroke={S3} strokeWidth="4" strokeLinecap="round" />
      <line x1="130" y1="82" x2="134" y2="82" stroke={S3} strokeWidth="4" strokeLinecap="round" />
      {/* Chest indicator */}
      <circle cx="90" cy="98" r="8" fill={PLT} stroke={PL} strokeWidth="1" />
      <circle cx="90" cy="98" r="4" fill={P} opacity="0.6" />
      {/* Feet */}
      <rect x="62" y="130" width="20" height="8" rx="4" fill={S3} />
      <rect x="98" y="130" width="20" height="8" rx="4" fill={S3} />
    </svg>
  );
}

// ============================================
// 25. Rules — Workflow/routing diagram
// ============================================
export function RulesIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Start node */}
      <circle cx="90" cy="24" r="12" fill={P} />
      <circle cx="90" cy="24" r="6" fill="white" />
      {/* Line down */}
      <line x1="90" y1="36" x2="90" y2="52" stroke={S3} strokeWidth="2" />
      {/* Diamond (condition) */}
      <polygon points="90,52 114,72 90,92 66,72" fill={PLT} stroke={PL} strokeWidth="1.5" />
      <text x="90" y="76" textAnchor="middle" fontSize="10" fill={P} fontFamily="Inter, sans-serif">
        ?
      </text>
      {/* Left branch */}
      <line x1="66" y1="72" x2="36" y2="72" stroke={S3} strokeWidth="2" />
      <line x1="36" y1="72" x2="36" y2="112" stroke={S3} strokeWidth="2" />
      <rect x="18" y="112" width="36" height="22" rx="4" fill="white" stroke={S3} strokeWidth="1" />
      <line x1="26" y1="123" x2="46" y2="123" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      {/* Right branch */}
      <line x1="114" y1="72" x2="144" y2="72" stroke={S3} strokeWidth="2" />
      <line x1="144" y1="72" x2="144" y2="112" stroke={S3} strokeWidth="2" />
      <rect
        x="126"
        y="112"
        width="36"
        height="22"
        rx="4"
        fill="white"
        stroke={P}
        strokeWidth="1.5"
      />
      <line x1="134" y1="123" x2="154" y2="123" stroke={PL} strokeWidth="2" strokeLinecap="round" />
      {/* Center down */}
      <line x1="90" y1="92" x2="90" y2="112" stroke={S3} strokeWidth="2" />
      <rect x="72" y="112" width="36" height="22" rx="4" fill="white" stroke={S3} strokeWidth="1" />
      <line x1="80" y1="123" x2="100" y2="123" stroke={S2} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ============================================
// 26. Reports — Chart/graph
// ============================================
export function ReportsIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Chart background */}
      <rect
        x="28"
        y="18"
        width="124"
        height="118"
        rx="8"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      {/* Grid lines */}
      <line x1="48" y1="40" x2="140" y2="40" stroke={S1} strokeWidth="1" />
      <line x1="48" y1="62" x2="140" y2="62" stroke={S1} strokeWidth="1" />
      <line x1="48" y1="84" x2="140" y2="84" stroke={S1} strokeWidth="1" />
      <line x1="48" y1="106" x2="140" y2="106" stroke={S1} strokeWidth="1" />
      {/* Y axis */}
      <line x1="48" y1="34" x2="48" y2="118" stroke={S3} strokeWidth="1" />
      {/* X axis */}
      <line x1="48" y1="118" x2="146" y2="118" stroke={S3} strokeWidth="1" />
      {/* Bars */}
      <rect x="58" y="84" width="14" height="34" rx="2" fill={PLT} />
      <rect x="78" y="62" width="14" height="56" rx="2" fill={PL} />
      <rect x="98" y="48" width="14" height="70" rx="2" fill={P} opacity="0.7" />
      <rect x="118" y="72" width="14" height="46" rx="2" fill={P} opacity="0.4" />
      {/* Trend line */}
      <polyline
        points="65,80 85,58 105,44 125,68"
        fill="none"
        stroke={P}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 3"
      />
    </svg>
  );
}

// ============================================
// 27. Search — Magnifying glass
// ============================================
export function SearchIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Magnifying glass */}
      <circle cx="78" cy="62" r="36" fill={PLT} stroke={PL} strokeWidth="2" />
      <circle cx="78" cy="62" r="28" fill="white" stroke={S3} strokeWidth="1.5" />
      {/* Handle */}
      <line x1="104" y1="88" x2="136" y2="120" stroke={P} strokeWidth="8" strokeLinecap="round" />
      <line x1="104" y1="88" x2="136" y2="120" stroke={PL} strokeWidth="4" strokeLinecap="round" />
      {/* X inside (no results) */}
      <line x1="68" y1="52" x2="88" y2="72" stroke={S3} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="88" y1="52" x2="68" y2="72" stroke={S3} strokeWidth="2.5" strokeLinecap="round" />
      {/* Small dots */}
      <circle cx="40" cy="36" r="3" fill={PL} opacity="0.5" />
      <circle cx="120" cy="44" r="2.5" fill={PL} opacity="0.4" />
      <circle cx="148" cy="80" r="2" fill={P} opacity="0.3" />
    </svg>
  );
}

// ============================================
// 28. Experiments — Flask/beaker
// ============================================
export function ExperimentsIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Flask neck */}
      <rect
        x="78"
        y="18"
        width="24"
        height="40"
        rx="2"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      {/* Flask body */}
      <path
        d="M78 58 L48 118 Q44 128 54 132 L126 132 Q136 128 132 118 L102 58 Z"
        fill={PLT}
        stroke={PL}
        strokeWidth="1.5"
      />
      {/* Liquid */}
      <path
        d="M60 108 L90 108 L120 108 Q128 118 122 126 L58 126 Q52 118 60 108 Z"
        fill={P}
        opacity="0.3"
      />
      {/* Bubbles */}
      <circle cx="78" cy="100" r="4" fill={P} opacity="0.4" />
      <circle cx="96" cy="112" r="3" fill={P} opacity="0.5" />
      <circle cx="84" cy="118" r="5" fill={P} opacity="0.3" />
      <circle cx="106" cy="104" r="2.5" fill={PL} />
      {/* A/B labels */}
      <text x="72" y="90" fontSize="12" fontWeight="700" fill={P} fontFamily="Inter, sans-serif">
        A
      </text>
      <text x="100" y="90" fontSize="12" fontWeight="700" fill={PL} fontFamily="Inter, sans-serif">
        B
      </text>
      {/* Stopper */}
      <rect x="74" y="14" width="32" height="8" rx="3" fill={S3} />
    </svg>
  );
}

// ============================================
// 29. Products — Shopping bag/box
// ============================================
export function ProductsIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Box body */}
      <rect
        x="34"
        y="54"
        width="112"
        height="84"
        rx="6"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      {/* Box lid */}
      <rect x="28" y="42" width="124" height="16" rx="4" fill={PLT} stroke={PL} strokeWidth="1" />
      {/* Center tape */}
      <rect x="82" y="42" width="16" height="96" rx="0" fill={PLT} stroke={PL} strokeWidth="0.5" />
      {/* Price tag */}
      <circle cx="148" cy="52" r="16" fill="white" stroke={P} strokeWidth="1.5" />
      <text
        x="148"
        y="56"
        textAnchor="middle"
        fontSize="10"
        fontWeight="600"
        fill={P}
        fontFamily="Inter, sans-serif"
      >
        $
      </text>
      {/* Dashed content placeholder */}
      <line x1="50" y1="78" x2="74" y2="78" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="106" y1="78" x2="130" y2="78" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="50" y1="92" x2="74" y2="92" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      <line x1="106" y1="92" x2="130" y2="92" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      {/* Plus badge */}
      <circle cx="90" cy="112" r="12" fill={PLT} stroke={PL} strokeWidth="1" />
      <line x1="84" y1="112" x2="96" y2="112" stroke={P} strokeWidth="2" strokeLinecap="round" />
      <line x1="90" y1="106" x2="90" y2="118" stroke={P} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ============================================
// 30. Subscriptions — Plan card with toggle
// ============================================
export function SubscriptionsIllustration({
  className,
  width = defaultSize.width,
  height = defaultSize.height,
}: Readonly<IllustrationProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 180 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="90" cy="148" rx="60" ry="6" fill={S2} />
      {/* Plan card */}
      <rect
        x="34"
        y="20"
        width="112"
        height="118"
        rx="10"
        fill="white"
        stroke={S3}
        strokeWidth="1.5"
      />
      {/* Header */}
      <rect x="34" y="20" width="112" height="32" rx="10" fill={P} />
      <rect x="34" y="38" width="112" height="14" fill={P} />
      <text
        x="90"
        y="42"
        textAnchor="middle"
        fontSize="13"
        fontWeight="600"
        fill="white"
        fontFamily="Inter, sans-serif"
      >
        PRO PLAN
      </text>
      {/* Price */}
      <text
        x="90"
        y="78"
        textAnchor="middle"
        fontSize="22"
        fontWeight="700"
        fill={P}
        fontFamily="Inter, sans-serif"
      >
        $0
      </text>
      <text
        x="90"
        y="92"
        textAnchor="middle"
        fontSize="10"
        fill={S4}
        fontFamily="Inter, sans-serif"
      >
        /month
      </text>
      {/* Feature checks */}
      <g>
        <circle cx="56" cy="108" r="5" fill={PLT} />
        <polyline
          points="53,108 55,110 59,106"
          fill="none"
          stroke={P}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1="66"
          y1="108"
          x2="100"
          y2="108"
          stroke={S2}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
      <g>
        <circle cx="56" cy="122" r="5" fill={PLT} />
        <polyline
          points="53,122 55,124 59,120"
          fill="none"
          stroke={P}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line x1="66" y1="122" x2="94" y2="122" stroke={S2} strokeWidth="2" strokeLinecap="round" />
      </g>
      {/* CTA button outline */}
      <rect x="110" y="106" width="28" height="28" rx="6" fill={PLT} stroke={PL} strokeWidth="1" />
      <polyline
        points="118,120 124,126 132,114"
        fill="none"
        stroke={P}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ============================================
// Entity → Illustration mapping
// ============================================
export const ENTITY_ILLUSTRATIONS: Record<string, React.FC<IllustrationProps>> = {
  notes: NotesIllustration,
  tasks: TasksIllustration,
  chats: ChatsIllustration,
  appointments: AppointmentsIllustration,
  files: FilesIllustration,
  emails: EmailsIllustration,
  timeline: TimelineIllustration,
  activity: ActivityIllustration,
  documents: DocumentsIllustration,
  leads: LeadsIllustration,
  contacts: ContactsIllustration,
  accounts: AccountsIllustration,
  deals: DealsIllustration,
  tickets: TicketsIllustration,
  cases: CasesIllustration,
  pinned: PinnedIllustration,
  insights: InsightsIllustration,
  notifications: NotificationsIllustration,
  comments: CommentsIllustration,
  invoices: InvoicesIllustration,
  receipts: ReceiptsIllustration,
  'payment-methods': PaymentMethodsIllustration,
  signatures: SignaturesIllustration,
  agents: AgentsIllustration,
  rules: RulesIllustration,
  reports: ReportsIllustration,
  search: SearchIllustration,
  experiments: ExperimentsIllustration,
  products: ProductsIllustration,
  subscriptions: SubscriptionsIllustration,
};
