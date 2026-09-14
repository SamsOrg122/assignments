/**
 * The drawn parts: a radial tick meter and the dotted arcs in the widgets.
 *
 * The design these come from generated them with a script on load. Here they
 * are computed while the page renders and shipped as markup, which costs no
 * JavaScript, cannot flash in empty, and works with scripting off. The maths
 * is pure arithmetic over an index — no randomness anywhere — so the server
 * and the browser draw the same thing and React never has to repair it.
 */

const CORAL = "#f2582b";

/**
 * The meter beside the numbers: sixty-six ticks over a half circle, brightest
 * in the middle, with three leader lines running off to the left.
 *
 * It is not a chart of anything and does not pretend to be — there is no axis
 * and no label. It is an instrument face, there to give the three figures
 * beside it somewhere to point.
 */
export function Gauge() {
  const cx = 340;
  const cy = 290;
  const r1 = 150;
  const r2 = 214;
  const count = 66;

  const ticks = Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const a = Math.PI / 2 + Math.PI * t;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return {
      x1: cx + r1 * c,
      y1: cy - r1 * s,
      x2: cx + r2 * c,
      y2: cy - r2 * s,
      o: (0.28 + 0.72 * Math.sin(t * Math.PI)).toFixed(2),
    };
  });

  const leaders: Array<[number, number]> = [
    [cy - r2, cx],
    [cy, cx - 262],
    [cy + r2, cx],
  ];

  return (
    <svg viewBox="0 0 520 580" aria-hidden="true">
      <path
        d={`M${cx} ${cy - 182}A182 182 0 0 0 ${cx} ${cy + 182}`}
        fill="none"
        stroke={CORAL}
        strokeWidth="74"
        opacity="0.14"
      />
      <path
        d={`M${cx} ${cy - 262}A262 262 0 0 0 ${cx} ${cy + 262}`}
        fill="none"
        stroke={CORAL}
        strokeWidth="1.5"
        strokeDasharray="2 6"
        strokeLinecap="round"
        opacity="0.85"
      />
      {ticks.map((t, i) => (
        <line
          key={i}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke={CORAL}
          strokeWidth="3.2"
          strokeLinecap="round"
          opacity={t.o}
        />
      ))}
      {leaders.map(([y, x], i) => (
        <g key={i}>
          <line x1={-30} y1={y} x2={x} y2={y} stroke={CORAL} strokeWidth="1.2" opacity="0.75" />
          <circle cx={x} cy={y} r="6" fill={CORAL} />
        </g>
      ))}
    </svg>
  );
}

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
