// Brand mark and the hero seascape — all inline SVG, no image files.

export function Logo() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id="lg-sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#12397f" />
          <stop offset="1" stopColor="#1b7a95" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#lg-sky)" />
      <path d="M19 8 L19 27 L9 27 Z" fill="#fff" />
      <path d="M21.5 12 L30 27 L21.5 27 Z" fill="#bfe3f2" />
      <path d="M7 30 H33 L29.5 33.5 H10.5 Z" fill="#fff" />
    </svg>
  );
}

type Boat = { x: number; y: number; s: number; sail: string; flip?: boolean; sailor?: boolean };

/** An Optimist: pram hull, sprit-rigged sail, optional sailor silhouette. Origin at the bow waterline. */
function Opti({ x, y, s, sail, flip, sailor }: Boat) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      {/* reflection */}
      <path d="M-4 2 L44 2 L40 14 L0 14 Z" fill="#fff" opacity="0.08" />
      {/* sail: tack, throat (mast), peak (sprit), clew */}
      <path d="M14 -6 L14 -68 L46 -82 L42 -10 Z" fill={sail} />
      <path d="M14 -68 L46 -82" stroke="#1d2b3a" strokeWidth="1.4" opacity="0.6" />
      <path d="M14 -6 L42 -10" stroke="#1d2b3a" strokeWidth="1.2" opacity="0.5" />
      <path d="M14 -68 L42 -10" stroke="#1d2b3a" strokeWidth="1" opacity="0.35" />
      <path d="M30 -70 L30 -10" stroke="#000" strokeWidth="0.6" opacity="0.08" />
      {/* mast */}
      <path d="M14 0 L14 -72" stroke="#1d2b3a" strokeWidth="2" />
      {sailor && (
        <g fill="#13202e">
          <circle cx="30" cy="-17" r="4.2" />
          <path d="M25 -12 Q30 -16 35 -12 L36 -2 L24 -2 Z" />
        </g>
      )}
      {/* hull */}
      <path d="M-2 -4 L44 -4 L40 4 L2 4 Z" fill="#f4f1ea" />
      <path d="M-2 -4 L44 -4 L43 -1 L-1 -1 Z" fill="#c9533a" />
    </g>
  );
}

const BOATS: Boat[] = [
  { x: 560, y: 352, s: 0.32, sail: "#f6f3ec" },
  { x: 610, y: 356, s: 0.36, sail: "#f6f3ec", flip: true },
  { x: 690, y: 350, s: 0.3, sail: "#eef6fb" },
  { x: 480, y: 362, s: 0.42, sail: "#fff" },
  { x: 760, y: 366, s: 0.48, sail: "#f6f3ec", flip: true },
  { x: 340, y: 392, s: 0.7, sail: "#ffffff", sailor: true },
  { x: 880, y: 404, s: 0.82, sail: "#f6f3ec", sailor: true, flip: true },
  { x: 120, y: 470, s: 1.25, sail: "#ffffff", sailor: true },
];

export function Seascape() {
  return (
    <svg viewBox="0 0 1060 560" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Optimist dinghies racing on a sunlit bay">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7fb2dc" />
          <stop offset="0.55" stopColor="#cfe3ef" />
          <stop offset="1" stopColor="#f7dfc0" />
        </linearGradient>
        <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff8e6" />
          <stop offset="0.35" stopColor="#fff1cf" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffe3b0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4f8fb5" />
          <stop offset="0.35" stopColor="#2c6a96" />
          <stop offset="1" stopColor="#0f3558" />
        </linearGradient>
        <linearGradient id="glint" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3d8" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff3d8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#04121f" stopOpacity="0.45" />
        </linearGradient>
      </defs>

      <rect width="1060" height="360" fill="url(#sky)" />
      <circle cx="770" cy="270" r="150" fill="url(#sun)" />
      <circle cx="770" cy="270" r="38" fill="#fffaf0" />
      {/* clouds */}
      <g fill="#fff" opacity="0.55">
        <ellipse cx="220" cy="110" rx="120" ry="16" />
        <ellipse cx="300" cy="96" rx="70" ry="12" />
        <ellipse cx="860" cy="80" rx="90" ry="10" />
      </g>
      {/* far shore */}
      <path d="M0 330 C80 318 140 322 210 312 C290 300 340 318 420 316 C520 314 560 330 640 328 L1060 330 L1060 348 L0 348 Z" fill="#6d8ea8" opacity="0.55" />
      <path d="M0 340 C120 332 220 338 320 334 C460 328 600 342 760 338 C880 335 980 340 1060 336 L1060 352 L0 352 Z" fill="#4f7491" opacity="0.6" />

      <rect y="348" width="1060" height="212" fill="url(#sea)" />
      {/* sun path on the water */}
      <path d="M740 350 L800 350 L900 560 L640 560 Z" fill="url(#glint)" opacity="0.55" />
      <g stroke="#fff6e0" strokeLinecap="round" opacity="0.7">
        {[362, 372, 384, 398, 414, 432, 452, 476, 502, 530].map((y, i) => (
          <path key={y} d={`M${760 - i * 9} ${y} h${30 + i * 16}`} strokeWidth={1 + i * 0.35} opacity={0.9 - i * 0.06} />
        ))}
      </g>
      {/* swell lines */}
      <g stroke="#ffffff" fill="none" strokeLinecap="round" opacity="0.18">
        {[380, 405, 435, 470, 510, 545].map((y, i) => (
          <path key={y} d={`M${-40 + i * 23} ${y} q40 -${4 + i} 80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0`} strokeWidth={1 + i * 0.4} />
        ))}
      </g>

      {/* race mark */}
      <g transform="translate(650 420)">
        <path d="M-10 0 L10 0 L6 -26 L-6 -26 Z" fill="#ff7a2f" />
        <rect x="-6" y="-30" width="12" height="5" rx="1" fill="#ffb27a" />
        <ellipse cx="0" cy="2" rx="16" ry="3" fill="#fff" opacity="0.25" />
      </g>

      {BOATS.map((b, i) => (
        <Opti key={i} {...b} />
      ))}

      <rect width="1060" height="560" fill="url(#shade)" />
    </svg>
  );
}
