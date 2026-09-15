/**
 * The drawn parts: the dotted arcs and rings in the widgets.
 *
 * The design these come from generated them with a script on load. Here they
 * are computed while the page renders and shipped as markup, which costs no
 * JavaScript, cannot flash in empty, and works with scripting off. The maths
 * is pure arithmetic over an index — no randomness anywhere — so the server
 * and the browser draw the same thing and React never has to repair it.
 */

/**
 * A dotted arc that grows towards its head, with a glow on the last dot.
 *
 * Reads as a trend without claiming to be one: no axis, no scale, no numbers.
 * The widgets it sits in carry the actual figure in type.
 */
export function Arc({
  cx,
  cy,
  r,
  from,
  to,
  dots,
  viewBox,
  className = "arc",
}: {
  cx: number;
  cy: number;
  r: number;
  /** Degrees, counter-clockwise from east. */
  from: number;
  to: number;
  dots: number;
  viewBox: string;
  className?: string;
}) {
  const points = Array.from({ length: dots }, (_, i) => {
    const t = i / (dots - 1);
    const a = ((from + (to - from) * t) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(a),
      y: cy - r * Math.sin(a),
      t,
      last: i === dots - 1,
    };
  });

  return (
    <svg className={className} viewBox={viewBox} aria-hidden="true">
      {points.map((p, i) => (
        <g key={i}>
          {p.last ? <circle cx={p.x} cy={p.y} r="13" fill="#8dffb0" opacity="0.45" /> : null}
          <circle
            cx={p.x}
            cy={p.y}
            r={p.last ? 4.5 : Number((1.8 + 2.2 * p.t).toFixed(1))}
            fill={p.last ? "#d2ffe0" : `rgba(255,255,255,${(0.3 + 0.7 * p.t).toFixed(2)})`}
          />
        </g>
      ))}
    </svg>
  );
}

/** The half-dial with a needle, for the widgets that want one. */
export function MiniGauge({ className = "gaugeMini" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 150 78" aria-hidden="true">
      <path
        d="M13 72A62 62 0 0 1 137 72"
        stroke="rgba(255,255,255,.8)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <line
        x1="75"
        y1="72"
        x2="75"
        y2="24"
        stroke="rgba(255,255,255,.85)"
        strokeWidth="1.5"
        strokeDasharray="1 4"
        strokeLinecap="round"
      />
      <path d="M67 6h16l-8 15z" fill="#f4ee5c" />
    </svg>
  );
}

/** The dashed ring around the figure in the third tile. */
export function DottedRing() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle
        cx="50"
        cy="50"
        r="48"
        fill="none"
        stroke="rgba(255,255,255,.85)"
        strokeWidth="1.6"
        strokeDasharray="1.5 5"
        strokeLinecap="round"
      />
    </svg>
  );
}
