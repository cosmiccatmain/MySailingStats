// Brand mark — inline SVG.

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="mss-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#15346a" />
          <stop offset="1" stopColor="#1b6f8c" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#mss-logo)" />
      <path d="M15.2 6.5v15.2H7.4z" fill="#fff" />
      <path d="M17.2 9.8l6.6 11.9h-6.6z" fill="#fff" fillOpacity="0.7" />
      <path d="M6 24h20l-2.6 2.6H8.6z" fill="#fff" />
    </svg>
  );
}
