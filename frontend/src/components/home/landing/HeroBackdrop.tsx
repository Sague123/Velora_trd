/**
 * A restrained, on-brand texture behind the Hero's text column — not a
 * stock photo, not a glow effect (this landing's own brief explicitly rules
 * those out), just enough visual weight that the left half of the card
 * doesn't read as empty next to the terminal preview on the right.
 *
 * Two motifs, both drawn from what Velora actually is rather than generic
 * "crypto" iconography — a sparse connection graph (a global exchange's
 * network) and a single ascending price line (what every screen in this
 * product is ultimately about) — in the brand's own blue→violet→green
 * gradient (`.gradient-text`). Faint enough to read as texture, not a
 * second layer of content: same order of magnitude as `.hero-glow`, and
 * fully static — no pulse, no parallax, nothing that reads as a glow effect.
 */
export function HeroBackdrop() {
  return (
    <svg
      viewBox="0 0 480 320"
      // `none`, not `slice`: the card this sits behind ranges from a wide
      // desktop row to a stacked mobile column, and the abstract line/dot
      // motif reads fine slightly stretched either way — `slice` was
      // cropping the whole upper half of it away on wide, short containers.
      preserveAspectRatio="none"
      aria-hidden
      // -z-10, not the default auto: the terminal preview panel next to this
      // is a plain `position: static` box, which CSS paints *before*
      // positioned z-index:auto siblings regardless of DOM order — without
      // a negative z-index here the backdrop showed through the panel
      // instead of sitting behind it.
      className="hero-backdrop pointer-events-none absolute inset-0 -z-10 h-full w-full"
    >
      <defs>
        <linearGradient id="hero-backdrop-line" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#3d7cff" />
          <stop offset="55%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#17c885" />
        </linearGradient>
        <linearGradient id="hero-backdrop-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#17c885" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#17c885" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Sparse connection graph, spread across the top — nodes scaled to
          feel like a network map, not a decoration. */}
      <g stroke="#3d7cff" strokeWidth="1.4">
        <path d="M30 70 L150 30 L280 85 L360 45 M150 30 L170 140 M280 85 L230 150" fill="none" opacity="0.7" />
      </g>
      <g fill="#3d7cff">
        <circle cx="30" cy="70" r="4" />
        <circle cx="150" cy="30" r="3.5" />
        <circle cx="280" cy="85" r="5" />
        <circle cx="360" cy="45" r="3.5" />
        <circle cx="170" cy="140" r="3" />
        <circle cx="230" cy="150" r="3" />
      </g>

      {/* One ascending price line, sweeping the full column — the single
          visual idea every other section of this page backs up with real
          numbers. */}
      <path
        d="M-10 300 L40 288 L90 305 L140 260 L190 275 L240 210 L290 235 L340 165 L390 190 L440 110 L490 130"
        fill="none"
        stroke="url(#hero-backdrop-line)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M-10 300 L40 288 L90 305 L140 260 L190 275 L240 210 L290 235 L340 165 L390 190 L440 110 L490 130 L490 320 L-10 320 Z"
        fill="url(#hero-backdrop-fill)"
      />
    </svg>
  );
}
